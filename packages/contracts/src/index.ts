import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

export const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type Vec3 = z.infer<typeof vec3Schema>;

export const appearanceSchema = z.enum(['warrior', 'warrior_female', 'knight']);
export type Appearance = z.infer<typeof appearanceSchema>;

export const itemIdSchema = z.enum([
  'exile_clothes',
  'basic_club',
  'rough_mace',
  'stone_axe',
  'hide_shield',
  'concord_blade',
  'forest_tonic',
  'branded_helmet',
  'wood',
  'stone',
  'herb',
  'mushroom',
  'concord_scrap',
  'branded_hide',
]);
export type ItemId = z.infer<typeof itemIdSchema>;

export const itemStackSchema = z.object({
  instanceId: z.string().min(1),
  itemId: itemIdSchema,
  quantity: z.number().int().positive(),
  durability: z.number().int().min(0).max(100).optional(),
  version: z.number().int().nonnegative(),
});
export type ItemStack = z.infer<typeof itemStackSchema>;

export const equipmentSchema = z.object({
  weapon: itemStackSchema.nullable(),
  offhand: itemStackSchema.nullable(),
  head: itemStackSchema.nullable(),
  body: itemStackSchema.nullable(),
});
export type Equipment = z.infer<typeof equipmentSchema>;

export const questStageSchema = z.enum([
  'wake',
  'reach_refuge',
  'study',
  'craft_weapon',
  'free_creature',
  'face_inquisitor',
  'recover',
  'liberate_outpost',
  'complete',
]);
export type QuestStage = z.infer<typeof questStageSchema>;

export const playerStateSchema = z.object({
  id: z.string(),
  username: z.string(),
  appearance: appearanceSchema,
  position: vec3Schema,
  yaw: z.number(),
  health: z.number(),
  maxHealth: z.number(),
  stamina: z.number(),
  maxStamina: z.number(),
  focus: z.number(),
  level: z.number().int().min(1).max(10),
  xp: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  bankedGold: z.number().int().nonnegative(),
  inventory: z.array(itemStackSchema),
  bank: z.array(itemStackSchema),
  bankSlots: z.number().int().positive(),
  equipment: equipmentSchema,
  compromise: z.number().min(0).max(100),
  questStage: questStageSchema,
  discoveries: z.array(z.string()),
  buffs: z.array(
    z.object({
      id: z.enum(['clarity', 'burden']),
      expiresAt: z.number(),
    }),
  ),
  dead: z.boolean(),
  version: z.number().int().nonnegative(),
});
export type PlayerState = z.infer<typeof playerStateSchema>;

export const entityKindSchema = z.enum([
  'player',
  'soldier',
  'swordsman',
  'archer',
  'cultist',
  'corrupted_boar',
  'inquisitor',
  'deer',
  'rabbit',
  'horse',
]);
export type EntityKind = z.infer<typeof entityKindSchema>;

export const entitySnapshotSchema = z.object({
  id: z.string(),
  kind: entityKindSchema,
  position: vec3Schema,
  yaw: z.number(),
  health: z.number(),
  maxHealth: z.number(),
  level: z.number().int(),
  state: z.enum(['idle', 'walk', 'run', 'attack', 'block', 'hit', 'dead', 'stasis']),
  targetId: z.string().nullable(),
  elite: z.boolean().optional(),
  name: z.string().optional(),
  appearance: appearanceSchema.optional(),
  version: z.number().int().nonnegative(),
});
export type EntitySnapshot = z.infer<typeof entitySnapshotSchema>;

export const worldStateSchema = z.object({
  outpost: z.enum(['occupied', 'contested', 'liberated', 'reclaiming']),
  outpostStateEndsAt: z.number().nullable(),
  liberationProgress: z.number().min(0).max(1),
  serverTime: z.number(),
  onlineCount: z.number().int().nonnegative(),
});
export type WorldState = z.infer<typeof worldStateSchema>;

export const questionSchema = z.object({
  id: z.string(),
  materialId: z.string(),
  type: z.enum(['mcq', 'text', 'voice']),
  prompt: z.string(),
  options: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .min(2)
    .max(6)
    .optional(),
  language: z.enum(['en', 'de']),
  sourceExcerpt: z.string(),
  lethalEligible: z.boolean(),
  enabled: z.boolean(),
  version: z.number().int().nonnegative(),
});
export type Question = z.infer<typeof questionSchema>;

export const activeQuizSchema = z.object({
  encounterId: z.string(),
  question: questionSchema,
  targetPlayerId: z.string(),
  linkedEntityId: z.string().nullable(),
  lethal: z.boolean(),
  startedAt: z.number(),
  helpersUnlockAt: z.number(),
  expiresAt: z.number(),
  participantIds: z.array(z.string()),
  attemptedPlayerIds: z.array(z.string()),
});
export type ActiveQuiz = z.infer<typeof activeQuizSchema>;

const commandEnvelope = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  seq: z.number().int().nonnegative(),
  clientTime: z.number(),
});

export const clientCommandSchema = z.discriminatedUnion('type', [
  commandEnvelope.extend({ type: z.literal('hello'), lastServerTick: z.number().int().nullable() }),
  commandEnvelope.extend({
    type: z.literal('input'),
    inputSeq: z.number().int().nonnegative(),
    moveX: z.number().min(-1).max(1),
    moveZ: z.number().min(-1).max(1),
    yaw: z.number(),
    sprint: z.boolean(),
    jump: z.boolean(),
    dodge: z.boolean(),
    block: z.boolean(),
  }),
  commandEnvelope.extend({
    type: z.literal('attack'),
    attack: z.enum(['light', 'heavy']),
    origin: vec3Schema,
    direction: vec3Schema,
  }),
  commandEnvelope.extend({ type: z.literal('ability'), abilityId: z.string() }),
  commandEnvelope.extend({ type: z.literal('interact'), targetId: z.string().max(100) }),
  commandEnvelope.extend({
    type: z.literal('quiz-answer'),
    encounterId: z.string(),
    answer: z.string().max(500),
  }),
  commandEnvelope.extend({
    type: z.literal('chat'),
    channel: z.enum(['local', 'zone']),
    text: z.string().trim().min(1).max(280),
  }),
  commandEnvelope.extend({ type: z.literal('craft'), recipeId: z.string() }),
  commandEnvelope.extend({ type: z.literal('equip'), instanceId: z.string() }),
  commandEnvelope.extend({ type: z.literal('unequip'), slot: z.enum(['weapon', 'offhand', 'head']) }),
  commandEnvelope.extend({ type: z.literal('use-item'), instanceId: z.string() }),
  commandEnvelope.extend({
    type: z.literal('bank'),
    action: z.enum(['deposit-item', 'withdraw-item', 'deposit-gold', 'withdraw-gold', 'expand']),
    instanceId: z.string().optional(),
    amount: z.number().int().positive().optional(),
  }),
  commandEnvelope.extend({
    type: z.literal('trade'),
    action: z.enum(['request', 'offer-item', 'offer-gold', 'accept', 'cancel']),
    targetPlayerId: z.string().optional(),
    instanceId: z.string().optional(),
    amount: z.number().int().nonnegative().optional(),
    tradeVersion: z.number().int().nonnegative().optional(),
  }),
  commandEnvelope.extend({ type: z.literal('respawn') }),
  commandEnvelope.extend({ type: z.literal('ping'), nonce: z.number().int() }),
]);
export type ClientCommand = z.infer<typeof clientCommandSchema>;

const eventEnvelope = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  seq: z.number().int().nonnegative(),
  serverTick: z.number().int().nonnegative(),
});

export const serverEventSchema = z.discriminatedUnion('type', [
  eventEnvelope.extend({
    type: z.literal('welcome'),
    self: playerStateSchema,
    world: worldStateSchema,
    sessionId: z.string(),
  }),
  eventEnvelope.extend({
    type: z.literal('snapshot'),
    ackInputSeq: z.number().int().nonnegative(),
    self: playerStateSchema,
    entities: z.array(entitySnapshotSchema),
    world: worldStateSchema,
  }),
  eventEnvelope.extend({
    type: z.literal('combat'),
    event: z.enum(['hit', 'blocked', 'dodged', 'heal', 'death', 'xp', 'level-up']),
    sourceId: z.string().nullable(),
    targetId: z.string(),
    amount: z.number(),
    position: vec3Schema,
    label: z.string().optional(),
  }),
  eventEnvelope.extend({ type: z.literal('quiz-open'), quiz: activeQuizSchema }),
  eventEnvelope.extend({
    type: z.literal('quiz-update'),
    encounterId: z.string(),
    status: z.enum(['helper-attempt', 'correct', 'wrong', 'timeout', 'cancelled']),
    playerId: z.string().optional(),
    lethal: z.boolean(),
    correctAnswer: z.string().optional(),
    sourceExcerpt: z.string().optional(),
  }),
  eventEnvelope.extend({
    type: z.literal('chat'),
    id: z.string(),
    channel: z.enum(['local', 'zone', 'system']),
    senderId: z.string().nullable(),
    senderName: z.string(),
    text: z.string(),
    createdAt: z.number(),
  }),
  eventEnvelope.extend({
    type: z.literal('notification'),
    level: z.enum(['info', 'success', 'warning', 'danger']),
    title: z.string(),
    message: z.string(),
  }),
  eventEnvelope.extend({
    type: z.literal('trade-state'),
    trade: z
      .object({
        id: z.string(),
        version: z.number().int(),
        participants: z.array(z.object({ id: z.string(), name: z.string() })).length(2),
        offers: z.record(
          z.object({ itemInstanceIds: z.array(z.string()), gold: z.number().int(), accepted: z.boolean() }),
        ),
      })
      .nullable(),
  }),
  eventEnvelope.extend({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
  eventEnvelope.extend({ type: z.literal('pong'), nonce: z.number().int(), serverTime: z.number() }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

export const registerBodySchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(10).max(128),
  inviteCode: z.string().min(1).max(80),
});
export const loginBodySchema = registerBodySchema.omit({ inviteCode: true });
export const createCharacterBodySchema = z.object({
  name: z.string().trim().min(3).max(24).regex(/^[a-zA-Z][a-zA-Z '-]+$/),
  appearance: appearanceSchema,
  subject: z.string().trim().min(2).max(80),
});

export const auctionSchema = z.object({
  id: z.string(),
  sellerId: z.string(),
  sellerName: z.string(),
  item: itemStackSchema,
  price: z.number().int().positive(),
  expiresAt: z.number(),
  version: z.number().int(),
});
export type Auction = z.infer<typeof auctionSchema>;

export const runtimeAssetSchema = z.object({
  id: z.string(),
  sourceUid: z.string(),
  sourceBlend: z.string(),
  sourceRoot: z.string(),
  outputGlb: z.string(),
  license: z.string(),
  author: z.string(),
  sourceUrl: z.string().url(),
  transform: z.object({
    scale: z.number().positive(),
    rotationY: z.number(),
    offsetY: z.number(),
  }),
  lods: z.array(z.string()),
  clips: z.array(z.string()),
  collider: z.enum(['capsule', 'box', 'sphere', 'trimesh', 'none']),
  preloadGroup: z.enum(['initial', 'forest', 'refuge', 'outpost', 'wildlife', 'gear']),
});
export type RuntimeAsset = z.infer<typeof runtimeAssetSchema>;

export function encodeClientCommand(command: ClientCommand): string {
  return JSON.stringify(command);
}

export function decodeServerEvent(value: string): ServerEvent {
  return serverEventSchema.parse(JSON.parse(value));
}
