import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  type ActiveQuiz,
  type ClientCommand,
  type EntityKind,
  type EntitySnapshot,
  type PlayerState,
  type Question,
  type ServerEvent,
  type Vec3,
  type WorldState,
} from '@boe/contracts';
import {
  ABILITIES,
  BUILTIN_QUESTIONS,
  COMPROMISE,
  ENEMIES,
  INTERACTABLES,
  ITEMS,
  OUTPOST_CENTER,
  RECIPES,
  RESOURCE_NODES,
  SAFE_ZONE_CENTER,
  SPAWN_POINT,
  WORLD_SIZE,
  calculateDamage,
  clampCompromise,
  distance2d,
  gradeAnswer,
  levelForXp,
  maxHealthForLevel,
  terrainHeight,
} from '@boe/game-data';
import type { Repository } from '../db/index.js';
import type { CharacterRecord, StoredQuestion } from '../db/types.js';
import type { MaterialService } from '../learning/materials.js';
import {
  addExistingItem,
  addItem,
  applyDeathLoss,
  consumeItem,
  craft,
  equipItem,
  moveItemFromBank,
  moveItemToBank,
  unequipItem,
} from './inventory.js';

const TICK_RATE = 20;
const SNAPSHOT_RATE = 10;
const TICK_MS = 1_000 / TICK_RATE;
const QUIZ_FIELD_COOLDOWN = 3 * 60 * 1_000;
const QUIZ_LETHAL_COOLDOWN = 15 * 60 * 1_000;
const INTEREST_RANGE = 115;
const SAFE_ZONE_RADIUS = 34;
const OUTPOST_RADIUS = 62;

type EventPayload = ServerEvent extends infer Event
  ? Event extends ServerEvent
    ? Omit<Event, 'protocolVersion' | 'seq' | 'serverTick'>
    : never
  : never;

interface PlayerInput {
  inputSeq: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  sprint: boolean;
  jump: boolean;
  dodge: boolean;
  block: boolean;
  receivedAt: number;
}

interface RuntimePlayer {
  record: CharacterRecord;
  socket: WebSocket | null;
  sessionId: string;
  input: PlayerInput;
  velocityY: number;
  grounded: boolean;
  dodgeUntil: number;
  invulnerableUntil: number;
  attackReadyAt: number;
  abilityReadyAt: Map<string, number>;
  lastDamagedAt: number;
  lastPersistAt: number;
  disconnectedAt: number | null;
  combatAvatarUntil: number | null;
  eventSeq: number;
  quizEncounterId: string | null;
  station: { kind: string; expiresAt: number } | null;
  chatWindow: number[];
}

interface RuntimeEntity {
  snapshot: EntitySnapshot;
  spawn: Vec3;
  hostile: boolean;
  outpost: boolean;
  respawnAt: number;
  nextAttackAt: number;
  pendingAttackAt: number;
  stunUntil: number;
  empoweredUntil: number;
  lastHitBy: string | null;
  fleeFrom: string | null;
  quizPending: boolean;
}

interface RuntimeResource {
  id: string;
  itemId: (typeof RESOURCE_NODES)[number]['itemId'];
  position: Vec3;
  amount: number;
  available: boolean;
  respawnAt: number;
  version: number;
}

interface RuntimeQuiz {
  public: ActiveQuiz;
  stored: StoredQuestion;
  pendingKill: boolean;
  participantAttempts: Map<string, boolean>;
}

interface TradeOffer {
  itemInstanceIds: string[];
  gold: number;
  accepted: boolean;
}

interface RuntimeTrade {
  id: string;
  version: number;
  participants: [string, string];
  offers: Record<string, TradeOffer>;
}

const entitySpawns: Array<{
  id: string;
  kind: EntityKind;
  position: Vec3;
  outpost?: boolean;
  elite?: boolean;
}> = [
  { id: 'soldier-west-1', kind: 'soldier', position: { x: -58, y: 0, z: 92 } },
  { id: 'soldier-west-2', kind: 'soldier', position: { x: -20, y: 0, z: 120 } },
  { id: 'archer-road-1', kind: 'archer', position: { x: 30, y: 0, z: 78 } },
  { id: 'swordsman-road-1', kind: 'swordsman', position: { x: 62, y: 0, z: 36 }, elite: true },
  { id: 'cultist-tree-1', kind: 'cultist', position: { x: 12, y: 0, z: -42 } },
  { id: 'soldier-east-1', kind: 'soldier', position: { x: 92, y: 0, z: -20 } },
  { id: 'soldier-outpost-1', kind: 'soldier', position: { x: 122, y: 0, z: -58 }, outpost: true },
  { id: 'soldier-outpost-2', kind: 'soldier', position: { x: 134, y: 0, z: -95 }, outpost: true },
  { id: 'swordsman-outpost-1', kind: 'swordsman', position: { x: 159, y: 0, z: -101 }, outpost: true },
  { id: 'archer-outpost-1', kind: 'archer', position: { x: 174, y: 0, z: -54 }, outpost: true },
  { id: 'archer-outpost-2', kind: 'archer', position: { x: 130, y: 0, z: -42 }, outpost: true },
  { id: 'cultist-outpost-1', kind: 'cultist', position: { x: 182, y: 0, z: -91 }, outpost: true },
  { id: 'boar-liberation', kind: 'corrupted_boar', position: { x: 146, y: 0, z: -77 }, outpost: true },
  { id: 'inquisitor-outpost', kind: 'inquisitor', position: { x: 164, y: 0, z: -75 }, outpost: true, elite: true },
  { id: 'deer-north-1', kind: 'deer', position: { x: -67, y: 0, z: -112 } },
  { id: 'deer-north-2', kind: 'deer', position: { x: -18, y: 0, z: -144 } },
  { id: 'rabbit-west-1', kind: 'rabbit', position: { x: -108, y: 0, z: 15 } },
  { id: 'rabbit-south-1', kind: 'rabbit', position: { x: 33, y: 0, z: 144 } },
  { id: 'horse-refuge-1', kind: 'horse', position: { x: -175, y: 0, z: 143 } },
];

export interface WorldMetrics {
  onTick?(durationMs: number): void;
  onConnection?(delta: number): void;
  onCommand?(type: ClientCommand['type']): void;
}

export class GameWorld {
  private readonly players = new Map<string, RuntimePlayer>();
  private readonly entities = new Map<string, RuntimeEntity>();
  private readonly resources = new Map<string, RuntimeResource>();
  private readonly quizzes = new Map<string, RuntimeQuiz>();
  private readonly trades = new Map<string, RuntimeTrade>();
  private readonly playerTrade = new Map<string, string>();
  private state: WorldState = {
    outpost: 'occupied',
    outpostStateEndsAt: null,
    liberationProgress: 0,
    serverTime: Date.now(),
    onlineCount: 0,
  };
  private tickId = 0;
  private interval: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(
    private readonly repository: Repository,
    private readonly materials: MaterialService,
    private readonly metrics: WorldMetrics = {},
  ) {
    this.createEntities();
    for (const node of RESOURCE_NODES) {
      this.resources.set(node.id, {
        ...node,
        position: { ...node.position, y: terrainHeight(node.position.x, node.position.z) },
        available: true,
        respawnAt: 0,
        version: 1,
      });
    }
  }

  async start(): Promise<void> {
    const persisted = await this.repository.getWorldState();
    if (persisted) {
      this.state = { ...persisted, serverTime: Date.now(), onlineCount: 0 };
      if (this.state.outpostStateEndsAt && this.state.outpostStateEndsAt <= Date.now()) {
        this.state.outpost = 'occupied';
        this.state.outpostStateEndsAt = null;
        this.state.liberationProgress = 0;
      }
    }
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.interval) clearInterval(this.interval);
    await Promise.all(
      [...this.players.values()].map((player) => this.repository.saveCharacter(player.record).catch(() => undefined)),
    );
    await this.repository.saveWorldState(this.state);
  }

  connect(record: CharacterRecord, socket: WebSocket): void {
    const existing = this.players.get(record.id);
    if (existing) {
      existing.socket?.close(4001, 'Reconnected elsewhere');
      existing.socket = socket;
      existing.disconnectedAt = null;
      existing.combatAvatarUntil = null;
      existing.sessionId = randomUUID();
      this.send(existing, {
        type: 'welcome',
        self: existing.record.state,
        world: this.publicWorld(),
        sessionId: existing.sessionId,
      });
      return;
    }
    const player: RuntimePlayer = {
      record,
      socket,
      sessionId: randomUUID(),
      input: {
        inputSeq: 0,
        moveX: 0,
        moveZ: 0,
        yaw: record.state.yaw,
        sprint: false,
        jump: false,
        dodge: false,
        block: false,
        receivedAt: Date.now(),
      },
      velocityY: 0,
      grounded: true,
      dodgeUntil: 0,
      invulnerableUntil: 0,
      attackReadyAt: 0,
      abilityReadyAt: new Map(),
      lastDamagedAt: 0,
      lastPersistAt: 0,
      disconnectedAt: null,
      combatAvatarUntil: null,
      eventSeq: 0,
      quizEncounterId: null,
      station: null,
      chatWindow: [],
    };
    this.players.set(record.id, player);
    this.state.onlineCount = this.connectedCount();
    this.metrics.onConnection?.(1);
    this.send(player, {
      type: 'welcome',
      self: record.state,
      world: this.publicWorld(),
      sessionId: player.sessionId,
    });
    this.broadcastChat('system', null, 'The Wild', `${record.name} entered the Great Forest.`);
  }

  disconnect(playerId: string, socket?: WebSocket): void {
    const player = this.players.get(playerId);
    if (!player || !player.socket) return;
    if (socket && player.socket !== socket) return;
    player.socket = null;
    player.disconnectedAt = Date.now();
    player.combatAvatarUntil = Date.now() + 15_000;
    this.cancelTradeFor(playerId, 'Trade cancelled: an exile disconnected.');
    this.state.onlineCount = this.connectedCount();
    this.metrics.onConnection?.(-1);
  }

  replaceCharacter(record: CharacterRecord): void {
    const player = this.players.get(record.id);
    if (player) player.record = structuredClone(record);
  }

  getOnlineCharacter(characterId: string): CharacterRecord | null {
    const player = this.players.get(characterId);
    return player ? structuredClone(player.record) : null;
  }

  async submitVoiceAnswer(playerId: string, encounterId: string, transcript: string): Promise<void> {
    const quiz = this.quizzes.get(encounterId);
    if (!quiz || quiz.public.question.type !== 'voice') throw new Error('VOICE_NOT_EXPECTED');
    await this.answerQuiz(playerId, encounterId, transcript);
  }

  async handleCommand(playerId: string, command: ClientCommand): Promise<void> {
    const player = this.players.get(playerId);
    if (!player || !player.socket) return;
    this.metrics.onCommand?.(command.type);
    try {
      switch (command.type) {
        case 'hello':
          this.send(player, {
            type: 'welcome',
            self: player.record.state,
            world: this.publicWorld(),
            sessionId: player.sessionId,
          });
          break;
        case 'input':
          if (command.inputSeq > player.input.inputSeq) {
            player.input = {
              inputSeq: command.inputSeq,
              moveX: command.moveX,
              moveZ: command.moveZ,
              yaw: command.yaw,
              sprint: command.sprint,
              jump: command.jump,
              dodge: command.dodge,
              block: command.block,
              receivedAt: Date.now(),
            };
          }
          break;
        case 'attack':
          await this.attack(player, command.attack, command.origin, command.direction);
          break;
        case 'ability':
          await this.useAbility(player, command.abilityId);
          break;
        case 'interact':
          await this.interact(player, command.targetId);
          break;
        case 'quiz-answer':
          await this.answerQuiz(playerId, command.encounterId, command.answer);
          break;
        case 'chat':
          this.chat(player, command.channel, command.text);
          break;
        case 'craft':
          await this.craftItem(player, command.recipeId);
          break;
        case 'equip':
          await this.equip(player, command.instanceId);
          break;
        case 'unequip':
          await this.unequip(player, command.slot);
          break;
        case 'use-item':
          await this.useItem(player, command.instanceId);
          break;
        case 'bank':
          await this.bank(player, command);
          break;
        case 'trade':
          await this.trade(player, command);
          break;
        case 'respawn':
          await this.respawn(player);
          break;
        case 'ping':
          this.send(player, { type: 'pong', nonce: command.nonce, serverTime: Date.now() });
          break;
      }
    } catch (error) {
      this.sendError(player, gameError(error), true);
    }
  }

  private tick(): void {
    if (this.stopping) return;
    const started = performance.now();
    const now = Date.now();
    this.tickId += 1;
    this.state.serverTime = now;
    this.updatePlayers(now);
    this.updateEntities(now);
    this.updateResources(now);
    this.updateQuizzes(now);
    this.updateOutpost(now);
    if (this.tickId % (TICK_RATE / SNAPSHOT_RATE) === 0) this.sendSnapshots();
    if (this.tickId % (TICK_RATE * 5) === 0) this.persistPlayers(now);
    this.metrics.onTick?.(performance.now() - started);
  }

  private updatePlayers(now: number): void {
    for (const [id, player] of this.players) {
      const state = player.record.state;
      if (!player.socket && player.combatAvatarUntil && now >= player.combatAvatarUntil) {
        void this.repository.saveCharacter(player.record);
        this.players.delete(id);
        continue;
      }
      state.buffs = state.buffs.filter((buff) => buff.expiresAt > now);
      if (state.dead || player.quizEncounterId) {
        state.stamina = Math.min(state.maxStamina, state.stamina + 12 / TICK_RATE);
        continue;
      }
      const inputFresh = now - player.input.receivedAt < 500;
      const moveX = inputFresh ? player.input.moveX : 0;
      const moveZ = inputFresh ? player.input.moveZ : 0;
      const movementLength = Math.hypot(moveX, moveZ);
      const blocking = inputFresh && player.input.block && state.stamina > 0;
      if (blocking) state.stamina = Math.max(0, state.stamina - 5 / TICK_RATE);
      const sprinting =
        inputFresh && player.input.sprint && movementLength > 0.1 && state.stamina > 1 && !blocking;
      if (sprinting) state.stamina = Math.max(0, state.stamina - 18 / TICK_RATE);
      else if (now - player.lastDamagedAt > 1_200)
        state.stamina = Math.min(state.maxStamina, state.stamina + 14 / TICK_RATE);
      if (inputFresh && player.input.dodge && now >= player.dodgeUntil && state.stamina >= 25) {
        state.stamina -= 25;
        player.dodgeUntil = now + 470;
        player.invulnerableUntil = now + 280;
      }
      const dodging = now < player.dodgeUntil;
      const speed = blocking ? 2.6 : dodging ? 13.2 : sprinting ? 10.2 : 6.4;
      if (movementLength > 0.01) {
        const scale = Math.min(1, movementLength) / movementLength;
        state.position.x += moveX * scale * speed * (1 / TICK_RATE);
        state.position.z += moveZ * scale * speed * (1 / TICK_RATE);
        state.yaw = player.input.yaw;
      }
      state.position.x = Math.max(-WORLD_SIZE / 2 + 2, Math.min(WORLD_SIZE / 2 - 2, state.position.x));
      state.position.z = Math.max(-WORLD_SIZE / 2 + 2, Math.min(WORLD_SIZE / 2 - 2, state.position.z));
      const ground = terrainHeight(state.position.x, state.position.z);
      if (inputFresh && player.input.jump && player.grounded && state.stamina >= 10) {
        player.velocityY = 7.2;
        player.grounded = false;
        state.stamina -= 10;
      }
      if (!player.grounded) {
        player.velocityY -= 18 * (1 / TICK_RATE);
        state.position.y += player.velocityY * (1 / TICK_RATE);
        if (state.position.y <= ground) {
          state.position.y = ground;
          player.velocityY = 0;
          player.grounded = true;
        }
      } else {
        state.position.y = ground;
      }
      if (state.questStage === 'wake' && distance2d(state.position, SAFE_ZONE_CENTER) <= SAFE_ZONE_RADIUS) {
        state.questStage = 'study';
        state.version += 1;
        this.notify(player, 'success', 'Free Territory found', 'Find the mentor by the stone shrine and study once.');
      }
      if (distance2d(state.position, SAFE_ZONE_CENTER) <= SAFE_ZONE_RADIUS && state.health < state.maxHealth) {
        state.health = Math.min(state.maxHealth, state.health + 3 / TICK_RATE);
      }
    }
  }

  private updateEntities(now: number): void {
    for (const entity of this.entities.values()) {
      const snapshot = entity.snapshot;
      if (snapshot.state === 'dead') {
        if (entity.respawnAt > 0 && now >= entity.respawnAt && !(entity.outpost && this.state.outpost !== 'occupied')) {
          this.resetEntity(entity);
        }
        continue;
      }
      if (entity.outpost && this.state.outpost === 'liberated') {
        snapshot.state = 'dead';
        snapshot.health = 0;
        entity.respawnAt = 0;
        snapshot.version += 1;
        continue;
      }
      if (!entity.hostile) {
        this.updateWildlife(entity, now);
        continue;
      }
      if (entity.quizPending || now < entity.stunUntil) {
        snapshot.state = 'stasis';
        continue;
      }
      const target = this.findAggroTarget(entity);
      if (!target) {
        snapshot.targetId = null;
        const homeDistance = distance2d(snapshot.position, entity.spawn);
        if (homeDistance > 1) {
          this.moveEntityTowards(entity, entity.spawn, 2.2 / TICK_RATE);
          snapshot.state = 'walk';
        } else {
          snapshot.state = 'idle';
        }
        continue;
      }
      snapshot.targetId = target.record.id;
      const definition = ENEMIES[snapshot.kind as keyof typeof ENEMIES];
      const distance = distance2d(snapshot.position, target.record.state.position);
      if (entity.pendingAttackAt > 0) {
        snapshot.state = 'attack';
        if (now >= entity.pendingAttackAt) {
          entity.pendingAttackAt = 0;
          entity.nextAttackAt = now + definition.attackCooldownMs;
          if (distance <= definition.attackRange + 0.8) this.damagePlayer(entity, target, now);
        }
      } else if (distance <= definition.attackRange && now >= entity.nextAttackAt) {
        entity.pendingAttackAt = now + (snapshot.kind === 'inquisitor' ? 900 : 560);
        snapshot.state = 'attack';
      } else if (distance > definition.attackRange * 0.82) {
        this.moveEntityTowards(entity, target.record.state.position, definition.speed / TICK_RATE);
        snapshot.state = 'run';
      } else {
        snapshot.state = 'idle';
      }
    }
  }

  private updateWildlife(entity: RuntimeEntity, now: number): void {
    const snapshot = entity.snapshot;
    if (entity.fleeFrom) {
      const player = this.players.get(entity.fleeFrom);
      if (!player || distance2d(snapshot.position, player.record.state.position) > 45) {
        entity.fleeFrom = null;
      } else {
        const dx = snapshot.position.x - player.record.state.position.x;
        const dz = snapshot.position.z - player.record.state.position.z;
        const length = Math.max(0.001, Math.hypot(dx, dz));
        snapshot.position.x += (dx / length) * 5.8 * (1 / TICK_RATE);
        snapshot.position.z += (dz / length) * 5.8 * (1 / TICK_RATE);
        snapshot.position.y = terrainHeight(snapshot.position.x, snapshot.position.z);
        snapshot.yaw = Math.atan2(dx, dz);
        snapshot.state = 'run';
        return;
      }
    }
    const threatened = [...this.players.values()].find(
      (player) =>
        !player.record.state.dead &&
        player.record.state.compromise >= COMPROMISE.fleeThreshold &&
        distance2d(snapshot.position, player.record.state.position) < 13,
    );
    if (threatened) {
      entity.fleeFrom = threatened.record.id;
      return;
    }
    snapshot.state = 'idle';
    if (now % 5_000 < TICK_MS && distance2d(snapshot.position, entity.spawn) > 2) {
      this.moveEntityTowards(entity, entity.spawn, 0.5 / TICK_RATE);
    }
  }

  private updateResources(now: number): void {
    for (const resource of this.resources.values()) {
      if (!resource.available && now >= resource.respawnAt) {
        resource.available = true;
        resource.version += 1;
      }
    }
  }

  private updateQuizzes(now: number): void {
    for (const quiz of [...this.quizzes.values()]) {
      if (now >= quiz.public.expiresAt) void this.failQuiz(quiz, 'timeout');
    }
  }

  private updateOutpost(now: number): void {
    const outpostEntities = [...this.entities.values()].filter((entity) => entity.outpost && entity.hostile);
    const defeated = outpostEntities.filter((entity) => entity.snapshot.state === 'dead').length;
    if (this.state.outpost === 'occupied' || this.state.outpost === 'contested') {
      this.state.liberationProgress = outpostEntities.length === 0 ? 0 : defeated / outpostEntities.length;
    }
    if (this.state.outpost === 'liberated' && this.state.outpostStateEndsAt) {
      if (this.state.outpostStateEndsAt - now <= 2 * 60 * 1_000) {
        this.state.outpost = 'reclaiming';
        this.broadcastNotification('warning', 'The Concord returns', 'A reclaiming column has entered through the outer gates.');
        this.spawnReclaimWave();
        void this.repository.saveWorldState(this.state);
      }
    } else if (this.state.outpost === 'reclaiming' && this.state.outpostStateEndsAt && now >= this.state.outpostStateEndsAt) {
      this.state.outpost = 'occupied';
      this.state.outpostStateEndsAt = null;
      this.state.liberationProgress = 0;
      for (const entity of this.entities.values()) if (entity.outpost) this.resetEntity(entity);
      this.broadcastNotification('danger', 'Outpost reclaimed', 'The red standard rises again in the eastern camp.');
      void this.repository.saveWorldState(this.state);
    }
  }

  private sendSnapshots(): void {
    for (const player of this.players.values()) {
      if (!player.socket) continue;
      const state = player.record.state;
      const entities: EntitySnapshot[] = [];
      for (const entity of this.entities.values()) {
        if (distance2d(state.position, entity.snapshot.position) <= INTEREST_RANGE) {
          entities.push(structuredClone(entity.snapshot));
        }
      }
      for (const remote of this.players.values()) {
        if (remote.record.id === player.record.id) continue;
        if (distance2d(state.position, remote.record.state.position) > INTEREST_RANGE) continue;
        entities.push(this.playerSnapshot(remote));
      }
      this.send(player, {
        type: 'snapshot',
        ackInputSeq: player.input.inputSeq,
        self: state,
        entities,
        world: this.publicWorld(),
      });
    }
  }

  private async attack(
    player: RuntimePlayer,
    attackType: 'light' | 'heavy',
    claimedOrigin: Vec3,
    claimedDirection: Vec3,
  ): Promise<void> {
    const now = Date.now();
    const state = player.record.state;
    if (state.dead || player.quizEncounterId) throw new Error('ACTION_BLOCKED');
    if (distance2d(state.position, claimedOrigin) > 2.5) throw new Error('INVALID_ATTACK_ORIGIN');
    if (now < player.attackReadyAt) return;
    const staminaCost = attackType === 'heavy' ? 20 : 8;
    if (state.stamina < staminaCost) throw new Error('NOT_ENOUGH_STAMINA');
    state.stamina -= staminaCost;
    player.attackReadyAt = now + (attackType === 'heavy' ? 1_050 : 470);
    const range = attackType === 'heavy' ? 3.5 : 2.8;
    const multiplier = attackType === 'heavy' ? 1.65 : 1;
    const targets = this.findAttackTargets(state.position, claimedDirection, range, attackType === 'heavy' ? 0.15 : 0.35);
    const target = targets[0];
    if (!target) return;
    await this.hitEntity(player, target, multiplier);
  }

  private async useAbility(player: RuntimePlayer, abilityId: string): Promise<void> {
    const ability = ABILITIES.find((candidate) => candidate.id === abilityId);
    if (!ability) throw new Error('ABILITY_NOT_FOUND');
    const state = player.record.state;
    const now = Date.now();
    if (state.dead || player.quizEncounterId) throw new Error('ACTION_BLOCKED');
    if (state.level < ability.unlockLevel) throw new Error('ABILITY_LOCKED');
    if ((player.abilityReadyAt.get(ability.id) ?? 0) > now) throw new Error('ABILITY_ON_COOLDOWN');
    if (state.stamina < ability.stamina) throw new Error('NOT_ENOUGH_STAMINA');
    if (ability.id === 'shield-bash' && state.equipment.offhand?.itemId !== 'hide_shield') {
      throw new Error('SHIELD_REQUIRED');
    }
    const burden = state.buffs.some((buff) => buff.id === 'burden');
    const clarity = state.buffs.some((buff) => buff.id === 'clarity');
    const cooldownFactor = clarity ? 0.8 : burden ? 1.35 : 1;
    player.abilityReadyAt.set(ability.id, now + ability.cooldownMs * cooldownFactor);
    state.stamina -= ability.stamina;
    if (ability.id === 'war-cry') {
      for (const entity of this.entities.values()) {
        if (entity.hostile && entity.snapshot.state !== 'dead' && distance2d(state.position, entity.snapshot.position) <= ability.range) {
          entity.stunUntil = Math.max(entity.stunUntil, now + 1_600);
          entity.snapshot.state = 'hit';
        }
      }
      state.focus = Math.min(100, state.focus + 10);
      this.notify(player, 'success', 'War Cry', 'Nearby Concord troops recoil.');
      return;
    }
    const direction = { x: Math.sin(state.yaw), y: 0, z: Math.cos(state.yaw) };
    const targets = this.findAttackTargets(state.position, direction, ability.range, Math.cos(ability.arc));
    for (const target of targets.slice(0, ability.id === 'liberating-sweep' ? 5 : 1)) {
      await this.hitEntity(player, target, ability.damageMultiplier, ability.id === 'shield-bash' ? 1_600 : 450);
    }
  }

  private async hitEntity(
    player: RuntimePlayer,
    entity: RuntimeEntity,
    multiplier: number,
    stunMs = 250,
  ): Promise<void> {
    const state = player.record.state;
    if (entity.snapshot.state === 'dead' || entity.quizPending) return;
    const definition = ITEMS[state.equipment.weapon?.itemId ?? 'basic_club'];
    const baseWeaponDamage = state.equipment.weapon ? definition.damage ?? 5 : 4;
    const damage = calculateDamage({
      baseWeaponDamage,
      level: state.level,
      multiplier,
      clarity: state.buffs.some((buff) => buff.id === 'clarity'),
      burden: state.buffs.some((buff) => buff.id === 'burden'),
      blocked: false,
      armor: 0,
    });
    if (!entity.hostile) {
      state.compromise = clampCompromise(state.compromise + COMPROMISE.wildlifeAttack);
      entity.fleeFrom = player.record.id;
      this.notify(player, 'warning', 'The Wild recedes', 'The animal remembers your violence.');
    } else if (entity.outpost && this.state.outpost === 'occupied') {
      this.state.outpost = 'contested';
      this.broadcastNotification('warning', 'Outpost contested', `${player.record.name} struck the eastern garrison.`);
    }
    entity.snapshot.health = Math.max(0, entity.snapshot.health - damage);
    entity.snapshot.state = 'hit';
    entity.snapshot.version += 1;
    entity.lastHitBy = player.record.id;
    entity.stunUntil = Math.max(entity.stunUntil, Date.now() + stunMs);
    this.broadcastNear(entity.snapshot.position, 55, {
      type: 'combat',
      event: 'hit',
      sourceId: player.record.id,
      targetId: entity.snapshot.id,
      amount: damage,
      position: entity.snapshot.position,
    });
    if (entity.snapshot.health <= 0) await this.tryFinishEntity(player, entity);
  }

  private async tryFinishEntity(player: RuntimePlayer, entity: RuntimeEntity): Promise<void> {
    if (entity.quizPending) return;
    const now = Date.now();
    const isInquisitor = entity.snapshot.kind === 'inquisitor';
    const eliteGate = Boolean(entity.snapshot.elite) && Math.random() < 0.01;
    const canLethal = now - player.record.lastLethalQuizAt >= QUIZ_LETHAL_COOLDOWN;
    if ((isInquisitor || eliteGate) && canLethal) {
      entity.snapshot.health = 1;
      entity.quizPending = true;
      player.record.lastLethalQuizAt = now;
      await this.openQuiz(player, entity, true, true);
      return;
    }
    await this.finishEntity(player, entity);
    if (
      entity.hostile &&
      !isInquisitor &&
      now - player.record.lastQuizAt >= QUIZ_FIELD_COOLDOWN &&
      Math.random() < 0.08
    ) {
      player.record.lastQuizAt = now;
      await this.openQuiz(player, null, false, false);
    }
  }

  private async finishEntity(player: RuntimePlayer, entity: RuntimeEntity): Promise<void> {
    entity.snapshot.health = 0;
    entity.snapshot.state = 'dead';
    entity.snapshot.targetId = null;
    entity.snapshot.version += 1;
    entity.quizPending = false;
    entity.respawnAt = Date.now() + (entity.outpost ? 75_000 : 45_000);
    const state = player.record.state;
    if (!entity.hostile) {
      state.compromise = clampCompromise(state.compromise + COMPROMISE.wildlifeKill);
      this.notify(player, 'danger', 'A quiet life ended', 'The forest will keep its distance from you.');
      await this.repository.saveCharacter(player.record, 'wildlife-kill', { entityId: entity.snapshot.id });
      return;
    }
    const definition = ENEMIES[entity.snapshot.kind as keyof typeof ENEMIES];
    const gold = randomInt(definition.gold[0], definition.gold[1]);
    state.gold += gold;
    for (const [itemId, range] of Object.entries(definition.drops) as Array<[
      keyof typeof ITEMS,
      [number, number],
    ]>) {
      const quantity = randomInt(range[0], range[1]);
      if (quantity > 0) addItem(state, itemId, quantity);
    }
    const previousLevel = state.level;
    state.xp += definition.xp;
    state.level = levelForXp(state.xp);
    state.maxHealth = maxHealthForLevel(state.level);
    state.maxStamina = 100 + (state.level - 1) * 5;
    state.version += 1;
    if (entity.snapshot.kind === 'corrupted_boar') {
      state.compromise = clampCompromise(state.compromise + COMPROMISE.liberatedCreature);
      if (state.questStage === 'free_creature') state.questStage = 'face_inquisitor';
      this.notify(player, 'success', 'A brand broken', 'The creature falls free of Concord control. Find the inquisitor.');
    }
    if (entity.snapshot.kind === 'inquisitor') {
      if (state.questStage === 'face_inquisitor' || state.questStage === 'recover') {
        state.questStage = 'liberate_outpost';
      }
      this.notify(player, 'success', 'The hoarder falls', 'Clear the garrison and touch the red standard.');
    }
    this.broadcastNear(entity.snapshot.position, 65, {
      type: 'combat',
      event: 'death',
      sourceId: player.record.id,
      targetId: entity.snapshot.id,
      amount: definition.xp,
      position: entity.snapshot.position,
      label: `+${definition.xp} XP · +${gold} gold`,
    });
    if (state.level > previousLevel) {
      state.health = state.maxHealth;
      this.broadcastNear(state.position, 80, {
        type: 'combat',
        event: 'level-up',
        sourceId: player.record.id,
        targetId: player.record.id,
        amount: state.level,
        position: state.position,
        label: `${player.record.name} reached level ${state.level}`,
      });
    }
    await this.repository.saveCharacter(player.record, 'enemy-defeat', {
      kind: entity.snapshot.kind,
      xp: definition.xp,
      gold,
    });
  }

  private damagePlayer(entity: RuntimeEntity, player: RuntimePlayer, now: number): void {
    const state = player.record.state;
    if (state.dead || player.quizEncounterId || now < player.invulnerableUntil) {
      if (now < player.invulnerableUntil) {
        this.send(player, {
          type: 'combat',
          event: 'dodged',
          sourceId: entity.snapshot.id,
          targetId: player.record.id,
          amount: 0,
          position: state.position,
        });
      }
      return;
    }
    const definition = ENEMIES[entity.snapshot.kind as keyof typeof ENEMIES];
    const blocking = player.input.block && state.stamina > 0 && this.isFacing(state, entity.snapshot.position);
    const armor = [state.equipment.head, state.equipment.offhand, state.equipment.body].reduce(
      (total, item) => total + (item ? ITEMS[item.itemId].armor ?? 0 : 0),
      0,
    );
    const empowered = now < entity.empoweredUntil ? 1.25 : 1;
    const damage = Math.max(1, Math.round(definition.damage * empowered * (blocking ? 0.28 : 1) - armor * 0.35));
    if (blocking) state.stamina = Math.max(0, state.stamina - damage * 0.8);
    state.health = Math.max(0, state.health - damage);
    state.version += 1;
    player.lastDamagedAt = now;
    this.broadcastNear(state.position, 55, {
      type: 'combat',
      event: blocking ? 'blocked' : 'hit',
      sourceId: entity.snapshot.id,
      targetId: player.record.id,
      amount: damage,
      position: state.position,
    });
    if (state.health <= 0) void this.killPlayer(player, null);
  }

  private async killPlayer(
    player: RuntimePlayer,
    lesson: { answer: string; sourceExcerpt: string } | null,
  ): Promise<void> {
    const state = player.record.state;
    if (state.dead) return;
    state.dead = true;
    state.health = 0;
    const loss = applyDeathLoss(state);
    if (state.questStage === 'face_inquisitor') state.questStage = 'recover';
    player.input.moveX = 0;
    player.input.moveZ = 0;
    this.cancelTradeFor(player.record.id, 'Trade cancelled by death.');
    this.broadcastNear(state.position, 70, {
      type: 'combat',
      event: 'death',
      sourceId: null,
      targetId: player.record.id,
      amount: loss.lostGold,
      position: state.position,
      label: lesson ? `Remember: ${lesson.answer}` : 'Equipped gear and on-hand gold were lost.',
    });
    if (lesson) {
      this.notify(player, 'danger', 'Knowledge withheld', `${lesson.answer} — ${lesson.sourceExcerpt}`);
    }
    await this.repository.saveCharacter(player.record, 'death-loss', {
      lostGold: loss.lostGold,
      lostItems: loss.lostItems.map((item) => item.itemId),
      lesson,
    });
  }

  private async respawn(player: RuntimePlayer): Promise<void> {
    const state = player.record.state;
    if (!state.dead) {
      if (player.quizEncounterId) throw new Error('ACTION_BLOCKED');
      state.stamina = state.maxStamina;
      state.position = { ...SAFE_ZONE_CENTER, y: terrainHeight(SAFE_ZONE_CENTER.x, SAFE_ZONE_CENTER.z) };
      state.version += 1;
      this.notify(player, 'info', 'Position reset', 'You were moved back to the Free Territory.');
      await this.repository.saveCharacter(player.record, 'unstuck', {});
      return;
    }
    state.dead = false;
    state.health = state.maxHealth;
    state.stamina = state.maxStamina;
    state.position = { ...SAFE_ZONE_CENTER, y: terrainHeight(SAFE_ZONE_CENTER.x, SAFE_ZONE_CENTER.z) };
    state.version += 1;
    if (state.questStage === 'recover') {
      this.notify(player, 'warning', 'Begin again', 'Gather deadfall and stone. Craft a weapon or accept one from another exile.');
    }
    await this.repository.saveCharacter(player.record, 'respawn', {});
  }

  private async interact(player: RuntimePlayer, targetId: string): Promise<void> {
    const state = player.record.state;
    if (state.dead || player.quizEncounterId) throw new Error('ACTION_BLOCKED');
    const resource = this.resources.get(targetId);
    if (resource) {
      if (!resource.available) throw new Error('RESOURCE_DEPLETED');
      if (distance2d(state.position, resource.position) > 4) throw new Error('TOO_FAR_AWAY');
      if (!addItem(state, resource.itemId, resource.amount)) throw new Error('INVENTORY_FULL');
      resource.available = false;
      resource.respawnAt = Date.now() + 60_000;
      resource.version += 1;
      state.version += 1;
      this.notify(player, 'success', ITEMS[resource.itemId].name, `Gathered ${resource.amount}.`);
      await this.repository.saveCharacter(player.record, 'gather', {
        nodeId: resource.id,
        itemId: resource.itemId,
        quantity: resource.amount,
      });
      return;
    }
    const interactable = INTERACTABLES.find((candidate) => candidate.id === targetId);
    if (!interactable) throw new Error('TARGET_NOT_FOUND');
    if (distance2d(state.position, interactable.position) > interactable.radius + 2) throw new Error('TOO_FAR_AWAY');
    if (interactable.kind === 'mentor') {
      player.station = { kind: 'mentor', expiresAt: Date.now() + 30_000 };
      await this.openQuiz(player, null, false, false, true);
      return;
    }
    if (['anvil', 'workbench', 'alchemy', 'bank', 'market'].includes(interactable.kind)) {
      player.station = { kind: interactable.kind, expiresAt: Date.now() + 30_000 };
      this.notify(
        player,
        'info',
        stationName(interactable.kind),
        interactable.kind === 'bank'
          ? 'Your bank is open.'
          : interactable.kind === 'market'
            ? 'The auction board is open.'
            : 'Choose a recipe from the crafting panel.',
      );
      return;
    }
    if (interactable.kind === 'discovery') {
      if (!state.discoveries.includes(interactable.id)) {
        state.discoveries.push(interactable.id);
        state.xp += 75;
        state.level = levelForXp(state.xp);
        state.version += 1;
        this.notify(player, 'success', 'Secret discovered', discoveryText(interactable.id));
        await this.repository.saveCharacter(player.record, 'discovery', { id: interactable.id });
      }
      return;
    }
    if (interactable.kind === 'liberation') await this.liberateOutpost(player);
  }

  private async craftItem(player: RuntimePlayer, recipeId: string): Promise<void> {
    const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe) throw new Error('RECIPE_NOT_FOUND');
    if (!player.station || player.station.expiresAt < Date.now() || player.station.kind !== recipe.station) {
      throw new Error('WRONG_CRAFTING_STATION');
    }
    const result = craft(player.record.state, recipeId);
    if (
      ['rough_mace', 'stone_axe', 'concord_blade'].includes(result.output.itemId) &&
      player.record.state.questStage === 'craft_weapon'
    ) {
      player.record.state.questStage = 'free_creature';
    } else if (
      ['rough_mace', 'stone_axe', 'concord_blade'].includes(result.output.itemId) &&
      player.record.state.questStage === 'recover'
    ) {
      player.record.state.questStage = 'liberate_outpost';
    }
    this.notify(player, 'success', result.recipe.name, 'Crafted and placed in your inventory.');
    await this.repository.saveCharacter(player.record, 'craft', {
      recipeId,
      output: result.output.itemId,
    });
  }

  private async equip(player: RuntimePlayer, instanceId: string): Promise<void> {
    const slot = equipItem(player.record.state, instanceId);
    this.notify(player, 'success', 'Equipped', `Item moved to ${slot}.`);
    await this.repository.saveCharacter(player.record, 'equip', { instanceId, slot });
  }

  private async unequip(
    player: RuntimePlayer,
    slot: 'weapon' | 'offhand' | 'head',
  ): Promise<void> {
    unequipItem(player.record.state, slot);
    await this.repository.saveCharacter(player.record, 'unequip', { slot });
  }

  private async useItem(player: RuntimePlayer, instanceId: string): Promise<void> {
    const result = consumeItem(player.record.state, instanceId);
    this.send(player, {
      type: 'combat',
      event: 'heal',
      sourceId: player.record.id,
      targetId: player.record.id,
      amount: result.heal,
      position: player.record.state.position,
    });
    await this.repository.saveCharacter(player.record, 'consume', { itemId: result.itemId });
  }

  private async bank(
    player: RuntimePlayer,
    command: Extract<ClientCommand, { type: 'bank' }>,
  ): Promise<void> {
    if (!player.station || player.station.kind !== 'bank' || player.station.expiresAt < Date.now()) {
      throw new Error('BANK_NOT_OPEN');
    }
    const state = player.record.state;
    switch (command.action) {
      case 'deposit-item':
        if (!command.instanceId) throw new Error('ITEM_REQUIRED');
        moveItemToBank(state, command.instanceId);
        break;
      case 'withdraw-item':
        if (!command.instanceId) throw new Error('ITEM_REQUIRED');
        moveItemFromBank(state, command.instanceId);
        break;
      case 'deposit-gold': {
        const amount = command.amount ?? 0;
        if (state.gold < amount) throw new Error('NOT_ENOUGH_GOLD');
        state.gold -= amount;
        state.bankedGold += amount;
        state.version += 1;
        break;
      }
      case 'withdraw-gold': {
        const amount = command.amount ?? 0;
        if (state.bankedGold < amount) throw new Error('NOT_ENOUGH_BANKED_GOLD');
        state.bankedGold -= amount;
        state.gold += amount;
        state.version += 1;
        break;
      }
      case 'expand': {
        const price = 80 + Math.max(0, state.bankSlots - 12) * 20;
        if (state.bankedGold < price) throw new Error('NOT_ENOUGH_BANKED_GOLD');
        state.bankedGold -= price;
        state.bankSlots += 6;
        state.version += 1;
        break;
      }
    }
    await this.repository.saveCharacter(player.record, `bank-${command.action}`, {
      instanceId: command.instanceId,
      amount: command.amount,
    });
  }

  private async openQuiz(
    target: RuntimePlayer,
    linkedEntity: RuntimeEntity | null,
    lethal: boolean,
    pendingKill: boolean,
    mentorStudy = false,
  ): Promise<void> {
    if (target.quizEncounterId || target.record.state.dead) return;
    const available = await this.repository.listQuestions(target.record.accountId);
    const candidates = (available.length > 0 ? available : builtinQuestions()).filter(
      (question) => !lethal || (question.lethalEligible && question.type !== 'voice'),
    );
    if (candidates.length === 0) {
      if (linkedEntity && pendingKill) await this.finishEntity(target, linkedEntity);
      return;
    }
    const stored = candidates[Math.floor(Math.random() * candidates.length)];
    if (!stored) return;
    const now = Date.now();
    const participantIds = [...this.players.values()]
      .filter(
        (player) =>
          player.socket &&
          !player.record.state.dead &&
          !player.quizEncounterId &&
          distance2d(player.record.state.position, target.record.state.position) <= 25,
      )
      .map((player) => player.record.id);
    if (!participantIds.includes(target.record.id)) participantIds.unshift(target.record.id);
    const publicQuestion: Question = {
      id: stored.id,
      materialId: stored.materialId,
      type: stored.type,
      prompt: stored.prompt,
      ...(stored.options ? { options: stored.options } : {}),
      language: stored.language,
      sourceExcerpt: stored.sourceExcerpt,
      lethalEligible: stored.lethalEligible,
      enabled: stored.enabled,
      version: stored.version,
    };
    const encounterId = randomUUID();
    const quiz: RuntimeQuiz = {
      public: {
        encounterId,
        question: publicQuestion,
        targetPlayerId: target.record.id,
        linkedEntityId: linkedEntity?.snapshot.id ?? null,
        lethal,
        startedAt: now,
        helpersUnlockAt: now + 3_000,
        expiresAt: now + (stored.type === 'mcq' ? 20_000 : 30_000),
        participantIds,
        attemptedPlayerIds: [],
      },
      stored,
      pendingKill,
      participantAttempts: new Map(),
    };
    this.quizzes.set(encounterId, quiz);
    for (const participantId of participantIds) {
      const participant = this.players.get(participantId);
      if (!participant) continue;
      participant.quizEncounterId = encounterId;
      this.send(participant, { type: 'quiz-open', quiz: quiz.public });
    }
    if (linkedEntity) {
      linkedEntity.quizPending = true;
      linkedEntity.snapshot.state = 'stasis';
    }
    target.record.lastQuizAt = now;
    if (mentorStudy) {
      this.notify(target, 'info', 'Study under pressure', 'A correct answer charges focus and restores your bond with the Wild.');
    }
  }

  private async answerQuiz(playerId: string, encounterId: string, answer: string): Promise<void> {
    const quiz = this.quizzes.get(encounterId);
    const participant = this.players.get(playerId);
    if (!quiz || !participant || participant.quizEncounterId !== encounterId) throw new Error('QUIZ_NOT_ACTIVE');
    if (!quiz.public.participantIds.includes(playerId)) throw new Error('NOT_A_PARTICIPANT');
    if (quiz.participantAttempts.has(playerId)) throw new Error('ANSWER_ALREADY_SUBMITTED');
    const now = Date.now();
    if (playerId !== quiz.public.targetPlayerId && now < quiz.public.helpersUnlockAt) {
      throw new Error('HELPER_DELAY_ACTIVE');
    }
    const correct = gradeAnswer(answer, quiz.stored.accepted);
    quiz.participantAttempts.set(playerId, correct);
    quiz.public.attemptedPlayerIds.push(playerId);
    await this.repository.recordAttempt({
      characterId: participant.record.id,
      questionId: quiz.stored.id,
      correct,
      lethal: quiz.public.lethal,
      responseMs: now - quiz.public.startedAt,
    });
    void this.materials.maybeRefill(participant.record.accountId);
    if (correct) {
      await this.succeedQuiz(quiz, participant);
      return;
    }
    this.sendToQuiz(quiz, {
      type: 'quiz-update',
      encounterId,
      status: 'helper-attempt',
      playerId,
      lethal: quiz.public.lethal,
    });
    if (quiz.public.attemptedPlayerIds.length >= quiz.public.participantIds.length) {
      await this.failQuiz(quiz, 'wrong');
    }
  }

  private async succeedQuiz(quiz: RuntimeQuiz, solver: RuntimePlayer): Promise<void> {
    const target = this.players.get(quiz.public.targetPlayerId);
    if (!target) return this.closeQuiz(quiz);
    const now = Date.now();
    const state = target.record.state;
    state.focus = Math.min(100, state.focus + 25);
    state.buffs = state.buffs.filter((buff) => buff.id !== 'burden');
    state.buffs.push({ id: 'clarity', expiresAt: now + 45_000 });
    if (solver.record.id !== target.record.id) {
      solver.record.state.compromise = clampCompromise(
        solver.record.state.compromise + COMPROMISE.correctHelper,
      );
      solver.record.state.xp += 20;
      solver.record.state.version += 1;
      await this.repository.saveCharacter(solver.record, 'quiz-helper', { encounterId: quiz.public.encounterId });
    }
    const linked = quiz.public.linkedEntityId ? this.entities.get(quiz.public.linkedEntityId) : null;
    if (linked) {
      linked.quizPending = false;
      linked.stunUntil = now + 2_000;
      linked.snapshot.state = 'hit';
    }
    if (target.record.state.questStage === 'study' && target.station?.kind === 'mentor') {
      target.record.state.questStage = 'craft_weapon';
      target.record.state.compromise = clampCompromise(
        target.record.state.compromise + COMPROMISE.correctStudy,
      );
    }
    target.record.state.version += 1;
    this.sendToQuiz(quiz, {
      type: 'quiz-update',
      encounterId: quiz.public.encounterId,
      status: 'correct',
      playerId: solver.record.id,
      lethal: quiz.public.lethal,
      correctAnswer: quiz.stored.answerDisplay,
      sourceExcerpt: quiz.stored.sourceExcerpt,
    });
    this.closeQuiz(quiz);
    if (linked && quiz.pendingKill) await this.finishEntity(target, linked);
    await this.repository.saveCharacter(target.record, 'quiz-correct', {
      questionId: quiz.stored.id,
      lethal: quiz.public.lethal,
      solverId: solver.record.id,
    });
  }

  private async failQuiz(quiz: RuntimeQuiz, status: 'wrong' | 'timeout'): Promise<void> {
    if (!this.quizzes.has(quiz.public.encounterId)) return;
    const target = this.players.get(quiz.public.targetPlayerId);
    const linked = quiz.public.linkedEntityId ? this.entities.get(quiz.public.linkedEntityId) : null;
    this.sendToQuiz(quiz, {
      type: 'quiz-update',
      encounterId: quiz.public.encounterId,
      status,
      lethal: quiz.public.lethal,
      correctAnswer: quiz.stored.answerDisplay,
      sourceExcerpt: quiz.stored.sourceExcerpt,
    });
    this.closeQuiz(quiz);
    if (linked) {
      linked.quizPending = false;
      linked.empoweredUntil = Date.now() + 45_000;
      linked.snapshot.state = 'idle';
      if (quiz.pendingKill) linked.snapshot.health = Math.max(linked.snapshot.health, linked.snapshot.maxHealth * 0.35);
    }
    if (!target) return;
    if (quiz.public.lethal) {
      await this.killPlayer(target, {
        answer: quiz.stored.answerDisplay,
        sourceExcerpt: quiz.stored.sourceExcerpt,
      });
    } else {
      const state = target.record.state;
      state.focus = 0;
      state.buffs = state.buffs.filter((buff) => buff.id !== 'clarity');
      state.buffs.push({ id: 'burden', expiresAt: Date.now() + 45_000 });
      state.version += 1;
      await this.repository.saveCharacter(target.record, 'quiz-wrong', {
        questionId: quiz.stored.id,
        status,
      });
    }
  }

  private closeQuiz(quiz: RuntimeQuiz): void {
    this.quizzes.delete(quiz.public.encounterId);
    for (const participantId of quiz.public.participantIds) {
      const participant = this.players.get(participantId);
      if (participant?.quizEncounterId === quiz.public.encounterId) participant.quizEncounterId = null;
    }
  }

  private async liberateOutpost(player: RuntimePlayer): Promise<void> {
    if (this.state.outpost === 'liberated') {
      this.notify(player, 'info', 'A free outpost', 'For now, no rank is recognized here.');
      return;
    }
    const inquisitor = this.entities.get('inquisitor-outpost');
    const boar = this.entities.get('boar-liberation');
    if (
      inquisitor?.snapshot.state !== 'dead' ||
      boar?.snapshot.state !== 'dead' ||
      this.state.liberationProgress < 0.7
    ) {
      throw new Error('OUTPOST_STILL_DEFENDED');
    }
    this.state.outpost = 'liberated';
    this.state.outpostStateEndsAt = Date.now() + 20 * 60 * 1_000;
    this.state.liberationProgress = 1;
    for (const entity of this.entities.values()) {
      if (entity.outpost && entity.snapshot.state !== 'dead') {
        entity.snapshot.state = 'dead';
        entity.snapshot.health = 0;
        entity.respawnAt = 0;
      }
    }
    const state = player.record.state;
    state.xp += 220;
    state.level = levelForXp(state.xp);
    state.questStage = 'complete';
    state.version += 1;
    this.broadcastNotification(
      'success',
      'The eastern outpost is free',
      `${player.record.name} tore down the Concord standard. The freedom lasts twenty minutes.`,
    );
    await Promise.all([
      this.repository.saveWorldState(this.state),
      this.repository.saveCharacter(player.record, 'outpost-liberation', {}),
    ]);
  }

  private async trade(
    player: RuntimePlayer,
    command: Extract<ClientCommand, { type: 'trade' }>,
  ): Promise<void> {
    switch (command.action) {
      case 'request': {
        if (!command.targetPlayerId) throw new Error('TARGET_REQUIRED');
        if (this.playerTrade.has(player.record.id) || this.playerTrade.has(command.targetPlayerId)) {
          throw new Error('TRADE_ALREADY_ACTIVE');
        }
        const target = this.players.get(command.targetPlayerId);
        if (!target?.socket || target.record.state.dead) throw new Error('PLAYER_NOT_AVAILABLE');
        if (distance2d(player.record.state.position, target.record.state.position) > 7) throw new Error('TOO_FAR_AWAY');
        const trade: RuntimeTrade = {
          id: randomUUID(),
          version: 1,
          participants: [player.record.id, target.record.id],
          offers: {
            [player.record.id]: { itemInstanceIds: [], gold: 0, accepted: false },
            [target.record.id]: { itemInstanceIds: [], gold: 0, accepted: false },
          },
        };
        this.trades.set(trade.id, trade);
        this.playerTrade.set(player.record.id, trade.id);
        this.playerTrade.set(target.record.id, trade.id);
        this.sendTrade(trade);
        break;
      }
      case 'offer-item': {
        const trade = this.requireTrade(player.record.id, command.tradeVersion);
        if (!command.instanceId) throw new Error('ITEM_REQUIRED');
        const item = player.record.state.inventory.find((candidate) => candidate.instanceId === command.instanceId);
        if (!item) throw new Error('ITEM_NOT_FOUND');
        const offer = trade.offers[player.record.id];
        if (!offer) throw new Error('TRADE_INVALID');
        const index = offer.itemInstanceIds.indexOf(command.instanceId);
        if (index >= 0) offer.itemInstanceIds.splice(index, 1);
        else if (offer.itemInstanceIds.length < 8) offer.itemInstanceIds.push(command.instanceId);
        this.touchTrade(trade);
        break;
      }
      case 'offer-gold': {
        const trade = this.requireTrade(player.record.id, command.tradeVersion);
        const amount = command.amount ?? 0;
        if (amount > player.record.state.gold) throw new Error('NOT_ENOUGH_GOLD');
        const offer = trade.offers[player.record.id];
        if (!offer) throw new Error('TRADE_INVALID');
        offer.gold = amount;
        this.touchTrade(trade);
        break;
      }
      case 'accept': {
        const trade = this.requireTrade(player.record.id, command.tradeVersion);
        const offer = trade.offers[player.record.id];
        if (!offer) throw new Error('TRADE_INVALID');
        offer.accepted = true;
        trade.version += 1;
        this.sendTrade(trade);
        if (Object.values(trade.offers).every((candidate) => candidate.accepted)) await this.commitTrade(trade);
        break;
      }
      case 'cancel':
        this.cancelTradeFor(player.record.id, 'Trade cancelled.');
        break;
    }
  }

  private async commitTrade(trade: RuntimeTrade): Promise<void> {
    const left = this.players.get(trade.participants[0]);
    const right = this.players.get(trade.participants[1]);
    if (!left || !right) throw new Error('PLAYER_NOT_AVAILABLE');
    if (distance2d(left.record.state.position, right.record.state.position) > 8) throw new Error('TOO_FAR_AWAY');
    const leftRecord = structuredClone(left.record);
    const rightRecord = structuredClone(right.record);
    const records = { [leftRecord.id]: leftRecord, [rightRecord.id]: rightRecord };
    for (const [giverId, receiverId] of [
      [leftRecord.id, rightRecord.id],
      [rightRecord.id, leftRecord.id],
    ] as const) {
      const giver = records[giverId];
      const receiver = records[receiverId];
      const offer = trade.offers[giverId];
      if (!giver || !receiver || !offer) throw new Error('TRADE_INVALID');
      if (giver.state.gold < offer.gold) throw new Error('NOT_ENOUGH_GOLD');
      const items = offer.itemInstanceIds.map((id) => giver.state.inventory.find((item) => item.instanceId === id));
      if (items.some((item) => !item)) throw new Error('ITEM_NOT_FOUND');
      if (receiver.state.inventory.length + items.length > 24) throw new Error('INVENTORY_FULL');
      giver.state.gold -= offer.gold;
      receiver.state.gold += offer.gold;
      for (const item of items) {
        if (!item) continue;
        giver.state.inventory.splice(
          giver.state.inventory.findIndex((candidate) => candidate.instanceId === item.instanceId),
          1,
        );
        if (!addExistingItem(receiver.state, item)) throw new Error('INVENTORY_FULL');
      }
      giver.state.version += 1;
      receiver.state.version += 1;
    }
    await this.repository.saveCharactersAtomic([leftRecord, rightRecord], 'direct-trade', {
      tradeId: trade.id,
      offers: trade.offers,
    });
    left.record = leftRecord;
    right.record = rightRecord;
    this.trades.delete(trade.id);
    this.playerTrade.delete(leftRecord.id);
    this.playerTrade.delete(rightRecord.id);
    this.send(left, { type: 'trade-state', trade: null });
    this.send(right, { type: 'trade-state', trade: null });
    this.notify(left, 'success', 'Trade complete', 'The exchange committed atomically.');
    this.notify(right, 'success', 'Trade complete', 'The exchange committed atomically.');
  }

  private chat(player: RuntimePlayer, channel: 'local' | 'zone', value: string): void {
    const now = Date.now();
    player.chatWindow = player.chatWindow.filter((timestamp) => now - timestamp < 10_000);
    if (player.chatWindow.length >= 6) throw new Error('CHAT_RATE_LIMIT');
    player.chatWindow.push(now);
    const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 280);
    if (!text) return;
    const event: EventPayload = {
      type: 'chat',
      id: randomUUID(),
      channel,
      senderId: player.record.id,
      senderName: player.record.name,
      text,
      createdAt: now,
    };
    for (const recipient of this.players.values()) {
      if (!recipient.socket) continue;
      if (channel === 'local' && distance2d(player.record.state.position, recipient.record.state.position) > 55) continue;
      this.send(recipient, event);
    }
  }

  private createEntities(): void {
    for (const spawn of entitySpawns) {
      const hostile = !['deer', 'rabbit', 'horse'].includes(spawn.kind);
      const definition = hostile ? ENEMIES[spawn.kind as keyof typeof ENEMIES] : null;
      const maxHealth = definition?.health ?? (spawn.kind === 'horse' ? 95 : spawn.kind === 'deer' ? 48 : 22);
      const position = { ...spawn.position, y: terrainHeight(spawn.position.x, spawn.position.z) };
      this.entities.set(spawn.id, {
        snapshot: {
          id: spawn.id,
          kind: spawn.kind,
          position,
          yaw: Math.random() * Math.PI * 2,
          health: maxHealth,
          maxHealth,
          level: definition?.level ?? 1,
          state: 'idle',
          targetId: null,
          ...(spawn.elite ? { elite: true } : {}),
          name: definition?.name ?? wildlifeName(spawn.kind),
          version: 1,
        },
        spawn: position,
        hostile,
        outpost: Boolean(spawn.outpost),
        respawnAt: 0,
        nextAttackAt: 0,
        pendingAttackAt: 0,
        stunUntil: 0,
        empoweredUntil: 0,
        lastHitBy: null,
        fleeFrom: null,
        quizPending: false,
      });
    }
  }

  private findAggroTarget(entity: RuntimeEntity): RuntimePlayer | null {
    const definition = ENEMIES[entity.snapshot.kind as keyof typeof ENEMIES];
    let nearest: RuntimePlayer | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.players.values()) {
      const state = player.record.state;
      if (state.dead || player.quizEncounterId || distance2d(state.position, SAFE_ZONE_CENTER) <= SAFE_ZONE_RADIUS) continue;
      const aggroMultiplier = state.compromise >= COMPROMISE.aggroThreshold ? 1.5 : 1;
      const distance = distance2d(entity.snapshot.position, state.position);
      if (distance <= definition.aggroRange * aggroMultiplier && distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private findAttackTargets(origin: Vec3, direction: Vec3, range: number, minimumDot: number): RuntimeEntity[] {
    const length = Math.max(0.001, Math.hypot(direction.x, direction.z));
    const dx = direction.x / length;
    const dz = direction.z / length;
    return [...this.entities.values()]
      .filter((entity) => {
        if (entity.snapshot.state === 'dead') return false;
        const targetX = entity.snapshot.position.x - origin.x;
        const targetZ = entity.snapshot.position.z - origin.z;
        const targetLength = Math.max(0.001, Math.hypot(targetX, targetZ));
        return targetLength <= range && (targetX / targetLength) * dx + (targetZ / targetLength) * dz >= minimumDot;
      })
      .sort((left, right) => distance2d(origin, left.snapshot.position) - distance2d(origin, right.snapshot.position));
  }

  private moveEntityTowards(entity: RuntimeEntity, target: Vec3, step: number): void {
    const dx = target.x - entity.snapshot.position.x;
    const dz = target.z - entity.snapshot.position.z;
    const distance = Math.max(0.001, Math.hypot(dx, dz));
    entity.snapshot.position.x += (dx / distance) * Math.min(step, distance);
    entity.snapshot.position.z += (dz / distance) * Math.min(step, distance);
    entity.snapshot.position.y = terrainHeight(entity.snapshot.position.x, entity.snapshot.position.z);
    entity.snapshot.yaw = Math.atan2(dx, dz);
    entity.snapshot.version += 1;
  }

  private resetEntity(entity: RuntimeEntity): void {
    entity.snapshot.position = { ...entity.spawn };
    entity.snapshot.health = entity.snapshot.maxHealth;
    entity.snapshot.state = 'idle';
    entity.snapshot.targetId = null;
    entity.snapshot.version += 1;
    entity.respawnAt = 0;
    entity.nextAttackAt = Date.now() + 1_000;
    entity.pendingAttackAt = 0;
    entity.stunUntil = 0;
    entity.empoweredUntil = 0;
    entity.lastHitBy = null;
    entity.fleeFrom = null;
    entity.quizPending = false;
  }

  private spawnReclaimWave(): void {
    const wave = [
      this.entities.get('soldier-outpost-1'),
      this.entities.get('soldier-outpost-2'),
      this.entities.get('archer-outpost-1'),
    ].filter(Boolean) as RuntimeEntity[];
    const gates = [
      { x: 207, y: 0, z: -75 },
      { x: 151, y: 0, z: -137 },
      { x: 99, y: 0, z: -74 },
    ];
    wave.forEach((entity, index) => {
      this.resetEntity(entity);
      const gate = gates[index];
      if (gate) entity.snapshot.position = { ...gate, y: terrainHeight(gate.x, gate.z) };
    });
  }

  private playerSnapshot(player: RuntimePlayer): EntitySnapshot {
    const state = player.record.state;
    return {
      id: player.record.id,
      kind: 'player',
      position: { ...state.position },
      yaw: state.yaw,
      health: state.health,
      maxHealth: state.maxHealth,
      level: state.level,
      state: state.dead
        ? 'dead'
        : player.quizEncounterId
          ? 'stasis'
          : player.input.block
            ? 'block'
            : Math.hypot(player.input.moveX, player.input.moveZ) > 0.1
              ? player.input.sprint
                ? 'run'
                : 'walk'
              : 'idle',
      targetId: null,
      name: player.record.name,
      appearance: state.appearance,
      version: state.version,
    };
  }

  private isFacing(state: PlayerState, target: Vec3): boolean {
    const targetYaw = Math.atan2(target.x - state.position.x, target.z - state.position.z);
    return Math.cos(targetYaw - state.yaw) > 0.15;
  }

  private publicWorld(): WorldState {
    return { ...this.state, onlineCount: this.connectedCount(), serverTime: Date.now() };
  }

  private connectedCount(): number {
    return [...this.players.values()].filter((player) => player.socket).length;
  }

  private persistPlayers(now: number): void {
    for (const player of this.players.values()) {
      if (now - player.lastPersistAt < 4_500) continue;
      player.lastPersistAt = now;
      void this.repository.saveCharacter(player.record).catch(() => undefined);
    }
  }

  private send(player: RuntimePlayer, payload: EventPayload): void {
    if (!player.socket || player.socket.readyState !== player.socket.OPEN) return;
    if (player.socket.bufferedAmount > 512 * 1024) return;
    const event = {
      protocolVersion: PROTOCOL_VERSION,
      seq: ++player.eventSeq,
      serverTick: this.tickId,
      ...payload,
    } as ServerEvent;
    player.socket.send(JSON.stringify(event));
  }

  private sendError(player: RuntimePlayer, message: string, recoverable: boolean): void {
    this.send(player, { type: 'error', code: message, message: humanizeError(message), recoverable });
  }

  private notify(
    player: RuntimePlayer,
    level: 'info' | 'success' | 'warning' | 'danger',
    title: string,
    message: string,
  ): void {
    this.send(player, { type: 'notification', level, title, message });
  }

  private broadcastNotification(
    level: 'info' | 'success' | 'warning' | 'danger',
    title: string,
    message: string,
  ): void {
    for (const player of this.players.values()) if (player.socket) this.notify(player, level, title, message);
  }

  private broadcastNear(position: Vec3, range: number, event: EventPayload): void {
    for (const player of this.players.values()) {
      if (player.socket && distance2d(position, player.record.state.position) <= range) this.send(player, event);
    }
  }

  private broadcastChat(
    channel: 'local' | 'zone' | 'system',
    senderId: string | null,
    senderName: string,
    text: string,
  ): void {
    const event: EventPayload = {
      type: 'chat',
      id: randomUUID(),
      channel,
      senderId,
      senderName,
      text,
      createdAt: Date.now(),
    };
    for (const player of this.players.values()) if (player.socket) this.send(player, event);
  }

  private sendToQuiz(quiz: RuntimeQuiz, event: EventPayload): void {
    for (const id of quiz.public.participantIds) {
      const player = this.players.get(id);
      if (player) this.send(player, event);
    }
  }

  private requireTrade(playerId: string, expectedVersion?: number): RuntimeTrade {
    const id = this.playerTrade.get(playerId);
    const trade = id ? this.trades.get(id) : null;
    if (!trade) throw new Error('TRADE_NOT_ACTIVE');
    if (expectedVersion !== undefined && expectedVersion !== trade.version) throw new Error('STALE_TRADE');
    return trade;
  }

  private touchTrade(trade: RuntimeTrade): void {
    for (const offer of Object.values(trade.offers)) offer.accepted = false;
    trade.version += 1;
    this.sendTrade(trade);
  }

  private sendTrade(trade: RuntimeTrade): void {
    const participants = trade.participants.map((id) => {
      const player = this.players.get(id);
      return { id, name: player?.record.name ?? 'Disconnected exile' };
    }) as [{ id: string; name: string }, { id: string; name: string }];
    const publicTrade = {
      id: trade.id,
      version: trade.version,
      participants,
      offers: structuredClone(trade.offers),
    };
    for (const id of trade.participants) {
      const player = this.players.get(id);
      if (player) this.send(player, { type: 'trade-state', trade: publicTrade });
    }
  }

  private cancelTradeFor(playerId: string, reason: string): void {
    const tradeId = this.playerTrade.get(playerId);
    const trade = tradeId ? this.trades.get(tradeId) : null;
    if (!trade) return;
    this.trades.delete(trade.id);
    for (const id of trade.participants) {
      this.playerTrade.delete(id);
      const participant = this.players.get(id);
      if (participant) {
        this.send(participant, { type: 'trade-state', trade: null });
        this.notify(participant, 'warning', 'Trade closed', reason);
      }
    }
  }
}

function builtinQuestions(): StoredQuestion[] {
  return BUILTIN_QUESTIONS.map((question) => ({
    id: question.id,
    materialId: 'builtin',
    type: question.type,
    prompt: question.prompt,
    ...('options' in question ? { options: [...question.options] } : {}),
    language: question.language,
    sourceExcerpt: question.sourceExcerpt,
    lethalEligible: true,
    enabled: true,
    version: 1,
    accepted: [...question.accepted],
    answerDisplay: question.answerDisplay,
    seenCount: 0,
    correctCount: 0,
  }));
}

function gameError(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/[^A-Z0-9_]/gi, '_').toUpperCase().slice(0, 80);
  return 'UNKNOWN_ERROR';
}

function humanizeError(code: string): string {
  const messages: Record<string, string> = {
    ACTION_BLOCKED: 'You cannot do that right now.',
    NOT_ENOUGH_STAMINA: 'Not enough stamina.',
    NOT_ENOUGH_GOLD: 'Not enough on-hand gold.',
    NOT_ENOUGH_BANKED_GOLD: 'Not enough banked gold.',
    MISSING_INGREDIENTS: 'You do not have the required materials.',
    WRONG_CRAFTING_STATION: 'Use the correct crafting station first.',
    TOO_FAR_AWAY: 'Move closer.',
    OUTPOST_STILL_DEFENDED: 'The inquisitor, branded creature, and most defenders must fall first.',
    HELPER_DELAY_ACTIVE: 'Helpers can answer after the three-second delay.',
    SHIELD_REQUIRED: 'Shield Bash requires an equipped hide shield.',
    ABILITY_LOCKED: 'That ability has not been unlocked yet.',
    INVENTORY_FULL: 'Your inventory is full.',
  };
  return messages[code] ?? code.toLowerCase().replace(/_/g, ' ');
}

function randomInt(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wildlifeName(kind: EntityKind): string {
  if (kind === 'deer') return 'Forest Deer';
  if (kind === 'rabbit') return 'Moon Rabbit';
  if (kind === 'horse') return 'Refuge Horse';
  return kind;
}

function stationName(kind: string): string {
  const names: Record<string, string> = {
    anvil: 'Refuge anvil',
    workbench: 'Mutual workbench',
    alchemy: 'Bitterleaf table',
    bank: 'Shared strongbox',
    market: 'Exile exchange',
  };
  return names[kind] ?? kind;
}

function discoveryText(id: string): string {
  const text: Record<string, string> = {
    'secret-cave': 'A tally of escaped prisoners is scratched behind the moss.',
    'secret-shrine': 'The shrine names no god. It asks only what you refused.',
    'strange-ruin': 'Every carved throne has been deliberately broken.',
  };
  return text[id] ?? 'The forest kept this place outside every map.';
}
