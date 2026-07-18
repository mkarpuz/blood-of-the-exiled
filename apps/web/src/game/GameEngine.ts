import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import type { Appearance, EntityKind, EntitySnapshot, PlayerState, Vec3 } from '@boe/contracts';
import { INTERACTABLES, ITEMS, RESOURCE_NODES, terrainHeight } from '@boe/game-data';
import { gameNetwork } from '../network';
import { gameStore, type GameState, type NearbyInteractable } from '../game-store';
import { AssetLibrary } from './AssetLibrary';
import { AudioDirector } from './AudioDirector';
import { movementVector } from './movement';
import { WorldBuilder } from './WorldBuilder';

interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jump: boolean;
  dodge: boolean;
  block: boolean;
}

const modelForEntity: Partial<Record<EntityKind, string>> = {
  soldier: 'enemy-soldier',
  swordsman: 'enemy-swordsman',
  archer: 'enemy-archer',
  cultist: 'enemy-cultist',
  inquisitor: 'enemy-inquisitor',
  corrupted_boar: 'creature-boar',
  horse: 'wildlife-horse',
};

const modelForAppearance: Record<Appearance, string> = {
  warrior: 'player-warrior',
  warrior_female: 'player-warrior-female',
  knight: 'player-knight',
};

let rapierInitialization: Promise<void> | null = null;

function rapier(): typeof RAPIER {
  const module = RAPIER as typeof RAPIER & { default?: typeof RAPIER };
  return typeof module.init === 'function' ? module : module.default ?? module;
}

function initializeRapier(): Promise<void> {
  const init = rapier().init;
  rapierInitialization ??= typeof init === 'function' ? init() : Promise.resolve();
  return rapierInitialization;
}

export class GameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 650);
  private readonly clock = new THREE.Clock();
  private readonly assets = new AssetLibrary();
  private readonly audio = new AudioDirector();
  private readonly raycaster = new THREE.Raycaster();
  private readonly views = new Map<string, EntityView>();
  private readonly input: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
    dodge: false,
    block: false,
  };
  private worldBuilder: WorldBuilder | null = null;
  private localView: EntityView | null = null;
  private state: GameState = gameStore.getSnapshot();
  private predicted = new THREE.Vector3();
  private predictedInitialized = false;
  private verticalVelocity = 0;
  private locallyGrounded = true;
  private cameraYaw = 1.1;
  private cameraPitch = 0.16;
  private cameraDistance = 4.2;
  private movementStallSeconds = 0;
  private inputSequence = 0;
  private inputAccumulator = 0;
  private nearestAccumulator = 0;
  private qualityAccumulator = 0;
  private qualityFrames = 0;
  private pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  private frame = 0;
  private disposed = false;
  private assetsReady = false;
  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rapierWorld: RAPIER.World | null = null;
  private rapierBody: RAPIER.RigidBody | null = null;
  private rapierCollider: RAPIER.Collider | null = null;
  private characterController: RAPIER.KinematicCharacterController | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setAnimationLoop(this.render);
    this.unsubscribe = gameStore.subscribe(this.onStoreUpdate);
    this.bindInputs();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize();
    void this.initialize();
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    this.unbindInputs();
    for (const view of this.views.values()) view.dispose();
    this.localView?.dispose();
    this.audio.dispose();
    this.rapierWorld?.free();
    this.rapierWorld = null;
    this.rapierBody = null;
    this.rapierCollider = null;
    this.characterController = null;
    this.renderer.dispose();
    this.disposeSceneResources();
  }

  private disposeSceneResources(): void {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }

  private async initialize(): Promise<void> {
    try {
      await this.assets.loadManifest();
      if (this.disposed) return;
      const worldBuilder = new WorldBuilder(this.scene, this.assets);
      this.worldBuilder = worldBuilder;
      await worldBuilder.build();
      if (this.disposed) {
        this.disposeSceneResources();
        return;
      }
      await this.setupRapier();
      if (this.disposed) return;
      await this.assets.preload(['player-warrior', 'player-warrior-female', 'player-knight']);
      if (this.disposed) return;
      this.assetsReady = true;
      this.ensureLocalView();
      this.syncEntityViews();
      gameStore.addLocalNotification('info', 'The Great Forest', 'Click the world to take control. Follow the amber path west to the refuge.');
    } catch (error) {
      if (this.disposed) return;
      gameStore.addLocalNotification(
        'warning',
        'Reduced visual mode',
        error instanceof Error ? error.message : 'Some runtime assets could not be loaded.',
      );
    }
  }

  private async setupRapier(): Promise<void> {
    await initializeRapier();
    if (this.disposed) return;
    const Physics = rapier();
    if (typeof Physics.World !== 'function') return;
    const world = new Physics.World({ x: 0, y: 0, z: 0 });
    this.rapierWorld = world;
    const body = world.createRigidBody(
      Physics.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.predicted.x,
        this.predicted.y + 1,
        this.predicted.z,
      ),
    );
    this.rapierBody = body;
    this.rapierCollider = world.createCollider(Physics.ColliderDesc.capsule(0.62, 0.38), body);
    const controller = world.createCharacterController(0.06);
    controller.enableAutostep(0.45, 0.18, true);
    controller.enableSnapToGround(0.28);
    controller.setMaxSlopeClimbAngle((48 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    this.characterController = controller;
  }

  private onStoreUpdate = (): void => {
    const previousCombat = this.state.combatTexts;
    this.state = gameStore.getSnapshot();
    if (this.state.combatTexts !== previousCombat) this.audio.updateCombat(this.state.combatTexts);
    if (this.assetsReady) {
      this.ensureLocalView();
      this.syncEntityViews();
    }
    this.worldBuilder?.updateWorldState(this.state.world);
  };

  private ensureLocalView(): void {
    const self = this.state.self;
    if (!self || this.localView) return;
    this.predicted.set(self.position.x, self.position.y, self.position.z);
    this.predictedInitialized = true;
    this.syncPhysicsBody();
    this.localView = new EntityView(
      this.scene,
      this.assets,
      {
        id: self.id,
        kind: 'player',
        position: self.position,
        yaw: self.yaw,
        health: self.health,
        maxHealth: self.maxHealth,
        level: self.level,
        state: 'idle',
        targetId: null,
        name: self.username,
        appearance: self.appearance,
        version: self.version,
      },
      modelForAppearance[self.appearance],
      true,
    );
  }

  private syncEntityViews(): void {
    const live = new Set<string>();
    for (const snapshot of this.state.entities) {
      live.add(snapshot.id);
      let view = this.views.get(snapshot.id);
      if (!view) {
        const modelId =
          snapshot.kind === 'player' && snapshot.appearance
            ? modelForAppearance[snapshot.appearance]
            : modelForEntity[snapshot.kind];
        view = new EntityView(this.scene, this.assets, snapshot, modelId, false);
        this.views.set(snapshot.id, view);
      }
      view.setSnapshot(snapshot);
    }
    for (const [id, view] of this.views) {
      if (!live.has(id)) {
        view.dispose();
        this.views.delete(id);
      }
    }
  }

  private render = (): void => {
    if (this.disposed) return;
    const delta = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;
    this.frame += 1;
    this.updatePrediction(delta);
    this.updateInput(delta);
    this.updateViews(delta, elapsed);
    this.updateCamera(delta);
    this.updateNearest(delta);
    this.updateQuality(delta);
    this.rapierWorld?.step();
    this.renderer.render(this.scene, this.camera);
  };

  private updatePrediction(delta: number): void {
    const self = this.state.self;
    if (!self) return;
    const authoritative = new THREE.Vector3(self.position.x, self.position.y, self.position.z);
    if (!this.predictedInitialized || this.predicted.distanceTo(authoritative) > 5) {
      this.predicted.copy(authoritative);
      this.predictedInitialized = true;
      this.resetVerticalPrediction(authoritative.y);
      this.syncPhysicsBody();
    } else {
      const correction = 1 - Math.exp(-delta * 4.5);
      const activelyMoving =
        this.canControl() && (this.input.forward || this.input.backward || this.input.left || this.input.right);
      if (!activelyMoving) {
        this.predicted.x = THREE.MathUtils.lerp(this.predicted.x, authoritative.x, correction);
        this.predicted.z = THREE.MathUtils.lerp(this.predicted.z, authoritative.z, correction);
      }
      if (this.locallyGrounded) this.predicted.y = THREE.MathUtils.lerp(this.predicted.y, authoritative.y, correction);
    }
    if (!this.canControl()) {
      this.predicted.y = authoritative.y;
      this.resetVerticalPrediction(authoritative.y);
      this.movementStallSeconds = 0;
      this.syncPhysicsBody();
      return;
    }
    const direction = this.movementDirection();
    const moving = direction.lengthSq() > 0.001;
    const speed = this.input.block ? 2.6 : this.input.sprint && moving && self.stamina > 0 ? 10.2 : 6.4;
    const desired = direction.multiplyScalar(speed * delta);
    if (this.characterController && this.rapierCollider && this.rapierBody) {
      this.syncPhysicsBody();
      this.characterController.computeColliderMovement(
        this.rapierCollider,
        new (rapier().Vector3)(desired.x, 0, desired.z),
      );
      const movement = this.characterController.computedMovement();
      const desiredDistance = Math.hypot(desired.x, desired.z);
      const solvedDistance = Math.hypot(movement.x, movement.z);
      if (moving && desiredDistance > 0.01 && solvedDistance < desiredDistance * 0.08) {
        this.movementStallSeconds += delta;
      } else {
        this.movementStallSeconds = 0;
      }
      if (this.movementStallSeconds > 0.35) {
        this.predicted.add(desired);
        this.updateVerticalPrediction(delta, authoritative.y, self.stamina);
        this.movementStallSeconds = 0;
        this.syncPhysicsBody();
        return;
      }
      this.predicted.x += movement.x;
      this.predicted.z += movement.z;
      this.updateVerticalPrediction(delta, authoritative.y, self.stamina);
      this.rapierBody.setNextKinematicTranslation({
        x: this.predicted.x,
        y: this.predicted.y + 1,
        z: this.predicted.z,
      });
    } else {
      this.movementStallSeconds = 0;
      this.predicted.add(desired);
      this.updateVerticalPrediction(delta, authoritative.y, self.stamina);
    }
  }

  private resetVerticalPrediction(authoritativeY: number): void {
    const ground = terrainHeight(this.predicted.x, this.predicted.z);
    this.verticalVelocity = 0;
    this.locallyGrounded = authoritativeY <= ground + 0.06;
  }

  private updateVerticalPrediction(delta: number, authoritativeY: number, stamina: number): void {
    const ground = terrainHeight(this.predicted.x, this.predicted.z);
    if (this.locallyGrounded && authoritativeY > ground + 0.16) {
      this.predicted.y = authoritativeY;
      this.locallyGrounded = false;
      this.verticalVelocity = Math.max(this.verticalVelocity, 0);
    }
    if (this.input.jump && this.locallyGrounded && stamina >= 10) {
      this.verticalVelocity = 7.2;
      this.locallyGrounded = false;
    }
    if (!this.locallyGrounded) {
      this.verticalVelocity -= 18 * delta;
      this.predicted.y += this.verticalVelocity * delta;
      if (Math.abs(this.predicted.y - authoritativeY) > 2) {
        this.predicted.y = THREE.MathUtils.lerp(this.predicted.y, authoritativeY, 1 - Math.exp(-delta * 8));
      }
      if (this.predicted.y <= ground) {
        this.predicted.y = ground;
        this.verticalVelocity = 0;
        this.locallyGrounded = true;
      }
      return;
    }
    this.predicted.y = ground;
  }

  private updateInput(delta: number): void {
    this.inputAccumulator += delta;
    if (this.inputAccumulator < 0.05) return;
    this.inputAccumulator %= 0.05;
    const movement = this.movementDirection();
    const canControl = this.canControl();
    gameNetwork.input({
      inputSeq: ++this.inputSequence,
      moveX: canControl ? movement.x : 0,
      moveZ: canControl ? movement.z : 0,
      yaw: this.cameraYaw,
      sprint: canControl && this.input.sprint,
      jump: canControl && this.input.jump,
      dodge: canControl && this.input.dodge,
      block: canControl && this.input.block,
    });
    this.input.jump = false;
    this.input.dodge = false;
  }

  private updateViews(delta: number, elapsed: number): void {
    for (const view of this.views.values()) view.update(delta, elapsed, this.camera);
    const self = this.state.self;
    if (!self || !this.localView) return;
    const moving = this.canControl() && this.movementDirection().lengthSq() > 0.01;
    const snapshot: EntitySnapshot = {
      id: self.id,
      kind: 'player',
      position: { x: this.predicted.x, y: this.predicted.y, z: this.predicted.z },
      yaw: this.cameraYaw,
      health: self.health,
      maxHealth: self.maxHealth,
      level: self.level,
      state: self.dead
        ? 'dead'
        : this.state.quiz
          ? 'stasis'
          : this.input.block
            ? 'block'
            : moving
              ? this.input.sprint
                ? 'run'
                : 'walk'
              : 'idle',
      targetId: null,
      name: self.username,
      appearance: self.appearance,
      version: self.version,
    };
    this.localView.setSnapshot(snapshot);
    this.localView.update(delta, elapsed, this.camera, true);
  }

  private updateCamera(delta: number): void {
    if (!this.predictedInitialized) return;
    const target = new THREE.Vector3(this.predicted.x, this.predicted.y + 1.45, this.predicted.z);
    const cosPitch = Math.cos(this.cameraPitch);
    const direction = new THREE.Vector3(
      Math.sin(this.cameraYaw) * cosPitch,
      Math.sin(this.cameraPitch),
      Math.cos(this.cameraYaw) * cosPitch,
    );
    const shoulder = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw)).multiplyScalar(0.72);
    const shoulderTarget = target.clone().add(shoulder).add(new THREE.Vector3(0, 0.2, 0));
    const desired = target
      .clone()
      .addScaledVector(direction, -this.cameraDistance)
      .add(shoulder)
      .add(new THREE.Vector3(0, 0.78, 0));
    const collisionDirection = desired.clone().sub(shoulderTarget);
    const collisionDistance = collisionDirection.length();
    collisionDirection.normalize();
    this.raycaster.set(shoulderTarget, collisionDirection);
    this.raycaster.far = collisionDistance;
    const hits = this.worldBuilder
      ? this.raycaster.intersectObjects(this.worldBuilder.cameraColliders, false)
      : [];
    if (hits[0]) desired.copy(shoulderTarget).addScaledVector(collisionDirection, Math.max(1.05, hits[0].distance - 0.25));
    const smoothing = 1 - Math.exp(-delta * 12);
    this.camera.position.lerp(desired, smoothing);
    const lookTarget = target.clone().addScaledVector(direction, 10).addScaledVector(shoulder, 0.35);
    lookTarget.y = target.y + Math.sin(this.cameraPitch) * 7;
    this.camera.lookAt(lookTarget);
  }

  private syncPhysicsBody(): void {
    if (!this.rapierBody || !this.predictedInitialized) return;
    this.rapierBody.setNextKinematicTranslation({
      x: this.predicted.x,
      y: this.predicted.y + 1,
      z: this.predicted.z,
    });
    this.rapierBody.setTranslation(
      {
        x: this.predicted.x,
        y: this.predicted.y + 1,
        z: this.predicted.z,
      },
      true,
    );
  }

  private updateNearest(delta: number): void {
    this.nearestAccumulator += delta;
    if (this.nearestAccumulator < 0.15 || !this.predictedInitialized) return;
    this.nearestAccumulator = 0;
    const candidates: NearbyInteractable[] = [];
    for (const interactable of INTERACTABLES) {
      const distance = Math.hypot(this.predicted.x - interactable.position.x, this.predicted.z - interactable.position.z);
      if (distance <= Math.max(5, interactable.radius + 1)) {
        candidates.push({
          id: interactable.id,
          kind: interactable.kind,
          label: interactableLabel(interactable.kind, interactable.id),
          distance,
        });
      }
    }
    for (const resource of RESOURCE_NODES) {
      const distance = Math.hypot(this.predicted.x - resource.position.x, this.predicted.z - resource.position.z);
      if (distance <= 4) {
        candidates.push({
          id: resource.id,
          kind: 'resource',
          label: `Gather ${ITEMS[resource.itemId].name}`,
          distance,
        });
      }
    }
    candidates.sort((left, right) => left.distance - right.distance);
    gameStore.setNearby(candidates[0] ?? null);
  }

  private updateQuality(delta: number): void {
    this.qualityAccumulator += delta;
    this.qualityFrames += 1;
    if (this.qualityAccumulator < 2.5) return;
    const fps = this.qualityFrames / this.qualityAccumulator;
    const maxRatio = Math.min(window.devicePixelRatio, 1.6);
    if (fps < 38 && this.pixelRatio > 0.75) this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.15);
    else if (fps > 56 && this.pixelRatio < maxRatio) this.pixelRatio = Math.min(maxRatio, this.pixelRatio + 0.1);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.qualityAccumulator = 0;
    this.qualityFrames = 0;
  }

  private movementDirection(): THREE.Vector3 {
    if (!this.canControl()) return new THREE.Vector3();
    const movement = movementVector(this.input, this.cameraYaw);
    return new THREE.Vector3(movement.x, 0, movement.z);
  }

  private canControl(): boolean {
    return Boolean(
      this.state.self &&
        !this.state.self.dead &&
        !this.state.quiz &&
        !this.state.panel &&
        !isTyping(),
    );
  }

  private interact(): void {
    const nearby = gameStore.getSnapshot().nearby;
    if (!nearby) return;
    gameNetwork.send({ type: 'interact', targetId: nearby.id });
    if (['anvil', 'workbench', 'alchemy'].includes(nearby.kind)) gameStore.setPanel('craft');
    if (nearby.kind === 'bank') gameStore.setPanel('bank');
    if (nearby.kind === 'market') gameStore.setPanel('market');
  }

  private attack(type: 'light' | 'heavy'): void {
    if (!this.canControl() || !this.state.self) return;
    const direction = {
      x: Math.sin(this.cameraYaw),
      y: 0,
      z: Math.cos(this.cameraYaw),
    };
    gameNetwork.attack(
      type,
      { x: this.predicted.x, y: this.predicted.y, z: this.predicted.z },
      direction,
    );
    this.localView?.pulseAttack(type);
  }

  private bindInputs(): void {
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindInputs(): void {
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
  }

  private onCanvasClick = (): void => {
    void this.audio.unlock();
    if (!this.state.panel && !this.state.quiz && document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  };

  private onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    if (isTyping()) {
      if (event.code === 'Escape') (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    if (event.code === 'KeyW') this.input.forward = true;
    if (event.code === 'KeyS') this.input.backward = true;
    if (event.code === 'KeyA') this.input.left = true;
    if (event.code === 'KeyD') this.input.right = true;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.input.sprint = true;
    if (event.code === 'Space') {
      event.preventDefault();
      this.input.jump = true;
    }
    if (event.code === 'AltLeft' || event.code === 'AltRight') {
      event.preventDefault();
      this.input.dodge = true;
    }
    if (event.code === 'KeyE') this.interact();
    if (event.code === 'KeyQ') this.attack('heavy');
    if (event.code === 'Digit1') gameNetwork.send({ type: 'ability', abilityId: 'shield-bash' });
    if (event.code === 'Digit2') gameNetwork.send({ type: 'ability', abilityId: 'war-cry' });
    if (event.code === 'Digit3') gameNetwork.send({ type: 'ability', abilityId: 'liberating-sweep' });
    if (event.code === 'KeyR') {
      const tonic = this.state.self?.inventory.find((item) => item.itemId === 'forest_tonic');
      if (tonic) gameNetwork.send({ type: 'use-item', instanceId: tonic.instanceId });
      else gameStore.addLocalNotification('warning', 'No tonic', 'Craft one at the alchemy table.');
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      gameStore.setPanel('inventory');
      void document.exitPointerLock();
    }
    if (event.code === 'KeyM') {
      gameStore.setPanel('map');
      void document.exitPointerLock();
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('boe-focus-chat'));
      void document.exitPointerLock();
    }
    if (event.code === 'Escape' && this.state.panel) gameStore.closePanel();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyW') this.input.forward = false;
    if (event.code === 'KeyS') this.input.backward = false;
    if (event.code === 'KeyA') this.input.left = false;
    if (event.code === 'KeyD') this.input.right = false;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.input.sprint = false;
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    if (event.button === 0) this.attack('light');
    if (event.button === 2) this.input.block = true;
  };

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 2) this.input.block = false;
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas || this.state.panel || this.state.quiz) return;
    this.cameraYaw -= event.movementX * 0.00225;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - event.movementY * 0.0018, -0.18, 0.72);
  };

  private onWheel = (event: WheelEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    event.preventDefault();
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + Math.sign(event.deltaY) * 0.45, 3.2, 6.8);
  };

  private resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };
}

class EntityView {
  private readonly root = new THREE.Group();
  private visual: THREE.Group;
  private visualBaseY = 0;
  private readonly healthBar = new THREE.Group();
  private readonly healthFill: THREE.Mesh;
  private readonly stasis: THREE.Mesh;
  private readonly telegraph: THREE.Mesh;
  private readonly target = new THREE.Vector3();
  private snapshot: EntitySnapshot;
  private mixer: THREE.AnimationMixer | null = null;
  private action: THREE.AnimationAction | null = null;
  private attackPulse = 0;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    assets: AssetLibrary,
    snapshot: EntitySnapshot,
    modelId: string | undefined,
    private readonly local: boolean,
  ) {
    this.snapshot = snapshot;
    this.target.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    this.root.position.copy(this.target);
    this.visual = fallbackEntity(snapshot.kind, snapshot.appearance);
    this.root.add(this.visual);
    const healthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.11),
      new THREE.MeshBasicMaterial({ color: 0x120f0d, depthTest: false, transparent: true, opacity: 0.82 }),
    );
    this.healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.28, 0.065),
      new THREE.MeshBasicMaterial({ color: snapshot.kind === 'player' ? 0xd59850 : 0xa22d2b, depthTest: false }),
    );
    healthBack.renderOrder = 10;
    this.healthFill.renderOrder = 11;
    this.healthBar.add(healthBack, this.healthFill);
    this.healthBar.position.y = snapshot.kind === 'corrupted_boar' || snapshot.kind === 'horse' ? 2.3 : 2.65;
    this.root.add(this.healthBar);
    this.stasis = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xd5b76a, transparent: true, opacity: 0.16, wireframe: true, depthWrite: false }),
    );
    this.stasis.position.y = 1.1;
    this.stasis.visible = false;
    this.root.add(this.stasis);
    this.telegraph = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xe13f2d, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.telegraph.rotation.x = -Math.PI / 2;
    this.telegraph.position.y = 0.05;
    this.telegraph.visible = false;
    this.root.add(this.telegraph);
    this.scene.add(this.root);
    if (modelId) {
      void assets.instantiate(modelId).then((model) => {
        if (!model || this.disposed) {
          if (!this.disposed && this.local) {
            gameStore.addLocalNotification(
              'warning',
              'Appearance unavailable',
              'The supplied character GLB could not be decoded. A fallback body is active.',
            );
          }
          return;
        }
        this.root.remove(this.visual);
        disposeObject(this.visual);
        this.visual = model;
        this.visualBaseY = model.position.y;
        this.root.add(model);
        const animations = model.userData.animations as THREE.AnimationClip[] | undefined;
        if (animations?.length) {
          this.mixer = new THREE.AnimationMixer(model);
          this.action = this.mixer.clipAction(animations[0] as THREE.AnimationClip).play();
        }
      });
    }
  }

  setSnapshot(snapshot: EntitySnapshot): void {
    this.snapshot = snapshot;
    this.target.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
  }

  pulseAttack(type: 'light' | 'heavy'): void {
    this.attackPulse = type === 'heavy' ? 0.65 : 0.35;
  }

  update(delta: number, elapsed: number, camera: THREE.Camera, immediate = false): void {
    const smoothing = immediate ? 1 : 1 - Math.exp(-delta * 10);
    this.root.position.lerp(this.target, smoothing);
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, this.snapshot.yaw, smoothing);
    const moving = this.snapshot.state === 'walk' || this.snapshot.state === 'run';
    const stride = moving ? Math.sin(elapsed * (this.snapshot.state === 'run' ? 13 : 8)) : 0;
    const bob = moving ? stride * 0.045 : 0;
    this.visual.position.y = this.visualBaseY + bob;
    const walkRig = this.visual.userData.walkRig as
      | {
          leftArm?: THREE.Object3D;
          rightArm?: THREE.Object3D;
          leftLeg?: THREE.Object3D;
          rightLeg?: THREE.Object3D;
          spine?: THREE.Object3D;
          head?: THREE.Object3D;
          weapon?: THREE.Object3D;
        }
      | undefined;
    if (walkRig) {
      const limbSwing = stride * (this.snapshot.state === 'run' ? 0.82 : 0.55);
      if (walkRig.leftLeg) walkRig.leftLeg.rotation.x = limbSwing;
      if (walkRig.rightLeg) walkRig.rightLeg.rotation.x = -limbSwing;
      if (walkRig.leftArm) walkRig.leftArm.rotation.x = -limbSwing * 0.75;
      if (walkRig.rightArm) walkRig.rightArm.rotation.x = limbSwing * 0.75;
      if (walkRig.weapon && this.attackPulse <= 0) walkRig.weapon.rotation.z = -0.34 + stride * 0.08;
    }
    this.attackPulse = Math.max(0, this.attackPulse - delta);
    this.visual.rotation.x = this.attackPulse > 0 ? Math.sin((this.attackPulse / 0.65) * Math.PI) * 0.2 : 0;
    const healthRatio = Math.max(0, this.snapshot.health / Math.max(1, this.snapshot.maxHealth));
    this.healthFill.scale.x = healthRatio;
    this.healthFill.position.x = -(1 - healthRatio) * 0.64;
    this.healthBar.visible = !this.local && this.snapshot.state !== 'dead' && healthRatio < 0.999;
    this.healthBar.quaternion.copy(camera.quaternion);
    this.stasis.visible = this.snapshot.state === 'stasis';
    this.stasis.rotation.y += delta * 0.9;
    this.stasis.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.04);
    this.telegraph.visible = this.snapshot.state === 'attack';
    if (this.telegraph.visible) {
      const pulse = 0.9 + Math.sin(elapsed * 12) * 0.14;
      this.telegraph.scale.setScalar(pulse);
    }
    this.root.visible = this.snapshot.state !== 'dead' || this.snapshot.kind === 'player';
    if (this.snapshot.state === 'dead' && this.snapshot.kind === 'player') this.visual.rotation.z = Math.PI / 2;
    else this.visual.rotation.z = 0;
    this.mixer?.update(delta);
    if (this.action) this.action.timeScale = this.snapshot.state === 'run' ? 1.6 : moving ? 1 : 0.35;
  }

  dispose(): void {
    this.disposed = true;
    this.scene.remove(this.root);
    this.mixer?.stopAllAction();
    disposeObject(this.root);
  }
}

function fallbackEntity(kind: EntityKind, appearance?: Appearance): THREE.Group {
  const group = new THREE.Group();
  const palette = entityPalette(kind, appearance);
  const skin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.9, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: palette.cloth, roughness: 0.92, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.55, metalness: 0.45, flatShading: true });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  };
  if (['deer', 'rabbit', 'horse', 'corrupted_boar'].includes(kind)) {
    const size = kind === 'rabbit' ? 0.42 : kind === 'deer' ? 0.85 : 1.15;
    const body = mesh(new THREE.DodecahedronGeometry(size, 0), cloth, [0, size, 0]);
    body.scale.set(1.25, 0.72, 0.72);
    mesh(new THREE.DodecahedronGeometry(size * 0.48, 0), skin, [0, size * 1.25, size * 0.95]);
    for (const x of [-0.45, 0.45]) {
      for (const z of [-0.38, 0.38]) mesh(new THREE.CylinderGeometry(0.07, 0.09, size, 5), cloth, [x * size, size * 0.38, z * size]);
    }
    if (kind === 'corrupted_boar') {
      const brand = mesh(new THREE.TorusGeometry(size * 0.5, 0.06, 6, 12), metal, [0, size * 1.15, size * 0.68]);
      brand.rotation.x = Math.PI / 2;
    }
    return group;
  }
  mesh(new THREE.CapsuleGeometry(0.42, 0.75, 4, 7), cloth, [0, 1.05, 0]);
  mesh(new THREE.IcosahedronGeometry(0.32, 1), skin, [0, 1.85, 0]);
  const shoulder = mesh(new THREE.BoxGeometry(1.05, 0.22, 0.42), metal, [0, 1.48, 0]);
  shoulder.rotation.z = kind === 'inquisitor' ? 0.1 : 0;
  const [leftArm, rightArm] = [-0.55, 0.55].map((x) => {
    const arm = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.78, 6), cloth, [x, 1.08, 0]);
    arm.rotation.z = x < 0 ? -0.18 : 0.18;
    return arm;
  });
  const [leftLeg, rightLeg] = [-0.34, 0.34].map((x) =>
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.86, 6), cloth, [x, 0.44, 0]),
  );
  const weapon = mesh(new THREE.BoxGeometry(0.08, 1.35, 0.13), metal, [0.6, 1.05, 0]);
  weapon.rotation.z = -0.34;
  group.userData.walkRig = { leftArm, rightArm, leftLeg, rightLeg, weapon };
  if (kind === 'inquisitor') {
    const hood = mesh(new THREE.ConeGeometry(0.48, 0.8, 7), cloth, [0, 2.05, 0]);
    hood.rotation.y = 0.25;
  }
  return group;
}

function entityPalette(kind: EntityKind, appearance?: Appearance) {
  if (kind === 'player') {
    if (appearance === 'warrior_female') return { skin: 0xc08e69, cloth: 0x426354, metal: 0x8b7d65 };
    if (appearance === 'knight') return { skin: 0xb68968, cloth: 0x353b40, metal: 0x879496 };
    return { skin: 0xb98261, cloth: 0x68503a, metal: 0x7d8580 };
  }
  if (['deer', 'rabbit', 'horse'].includes(kind)) return { skin: 0x6b4c35, cloth: 0x78593b, metal: 0x3b332c };
  if (kind === 'corrupted_boar') return { skin: 0x34221f, cloth: 0x512a29, metal: 0xb51d20 };
  if (kind === 'inquisitor') return { skin: 0x9b7764, cloth: 0x27191e, metal: 0xb61e25 };
  return { skin: 0x9f765f, cloth: 0x5d2025, metal: 0x747575 };
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material.dispose();
  });
}

function isTyping(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

function interactableLabel(kind: string, id: string): string {
  const labels: Record<string, string> = {
    mentor: 'Study with Mentor Sera',
    anvil: 'Use the refuge anvil',
    workbench: 'Use the workbench',
    alchemy: 'Use the alchemy table',
    bank: 'Open the shared strongbox',
    market: 'Open the exile exchange',
    liberation: 'Tear down the Concord standard',
    discovery: id === 'secret-cave' ? 'Inspect the hidden cave' : id === 'secret-shrine' ? 'Read the concealed shrine' : 'Examine the strange ruin',
  };
  return labels[kind] ?? 'Interact';
}

export function vec3(value: THREE.Vector3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}
