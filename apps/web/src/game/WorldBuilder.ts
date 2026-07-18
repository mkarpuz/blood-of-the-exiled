import * as THREE from 'three';
import {
  GIANT_TREE_CENTER,
  INTERACTABLES,
  OUTPOST_CENTER,
  RESOURCE_NODES,
  SAFE_ZONE_CENTER,
  WORLD_SIZE,
  distance2d,
  terrainHeight,
} from '@boe/game-data';
import type { WorldState } from '@boe/contracts';
import { AssetLibrary } from './AssetLibrary';

interface Placement {
  asset: string;
  position: [number, number];
  rotation?: number;
  scale?: number;
  fallback: 'tree' | 'tent' | 'stone' | 'wood' | 'tower' | 'shrine' | 'fire';
  collider?: [number, number, number];
}

export class WorldBuilder {
  readonly cameraColliders: THREE.Object3D[] = [];
  readonly resourceVisuals = new Map<string, THREE.Object3D>();
  private readonly outpostBanner = new THREE.Group();
  private readonly tempObject = new THREE.Object3D();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetLibrary,
  ) {}

  async build(): Promise<void> {
    this.scene.add(this.outpostBanner);
    this.createSkyAndLight();
    this.createTerrain();
    this.createPaths();
    this.createGroundCover();
    this.createInstancedForest();
    this.createResourceNodes();
    await this.placeHeroAssets();
  }

  updateWorldState(world: WorldState | null): void {
    const liberated = world?.outpost === 'liberated';
    this.outpostBanner.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        object.material.emissive.set(liberated ? 0x2d8f62 : 0x6d0707);
        object.material.emissiveIntensity = liberated ? 0.45 : 0.8;
      }
    });
  }

  private createSkyAndLight(): void {
    this.scene.background = new THREE.Color(0x0d1313);
    this.scene.fog = new THREE.FogExp2(0x111a19, 0.0125);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x172b32) },
        horizon: { value: new THREE.Color(0x71523a) },
        bottom: { value: new THREE.Color(0x111614) },
      },
      vertexShader: `varying vec3 vWorld; void main(){ vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vWorld; uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; void main(){ float h = normalize(vWorld).y; vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.7, h)) : mix(horizon, bottom, smoothstep(0.0, -0.45, h)); gl_FragColor = vec4(c, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(430, 24, 16), skyMaterial));
    const hemisphere = new THREE.HemisphereLight(0x8fa8a2, 0x17130d, 1.25);
    this.scene.add(hemisphere);
    const moon = new THREE.DirectionalLight(0xffd5a6, 2.5);
    moon.position.set(-90, 120, 55);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -95;
    moon.shadow.camera.right = 95;
    moon.shadow.camera.top = 95;
    moon.shadow.camera.bottom = -95;
    moon.shadow.camera.near = 10;
    moon.shadow.camera.far = 320;
    moon.shadow.bias = -0.0003;
    this.scene.add(moon);
    const exileGlow = new THREE.PointLight(0xff7a2d, 18, 58, 1.8);
    exileGlow.position.set(SAFE_ZONE_CENTER.x, 5, SAFE_ZONE_CENTER.z);
    this.scene.add(exileGlow);
    const concordGlow = new THREE.PointLight(0xb21119, 25, 70, 1.7);
    concordGlow.position.set(OUTPOST_CENTER.x, 9, OUTPOST_CENTER.z);
    this.scene.add(concordGlow);
  }

  private createTerrain(): void {
    const segments = 128;
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const low = new THREE.Color(0x263526);
    const high = new THREE.Color(0x4d5230);
    const concord = new THREE.Color(0x382421);
    const exile = new THREE.Color(0x39442a);
    const color = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const height = terrainHeight(x, z);
      positions.setY(index, height);
      color.copy(low).lerp(high, THREE.MathUtils.clamp((height + 4) / 10, 0, 1));
      const refugeBlend = THREE.MathUtils.clamp(1 - distance2d({ x, y: 0, z }, SAFE_ZONE_CENTER) / 45, 0, 1);
      const outpostBlend = THREE.MathUtils.clamp(1 - distance2d({ x, y: 0, z }, OUTPOST_CENTER) / 58, 0, 1);
      color.lerp(exile, refugeBlend * 0.55).lerp(concord, outpostBlend * 0.62);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }),
    );
    terrain.receiveShadow = true;
    terrain.name = 'Great Forest heightfield';
    this.scene.add(terrain);
  }

  private createPaths(): void {
    const routes: Array<Array<[number, number]>> = [
      [
        [-220, 52],
        [-190, 70],
        [-162, 96],
        [-142, 116],
        [-105, 96],
        [-62, 72],
        [-20, 48],
        [28, 22],
        [72, -16],
        [112, -48],
        [151, -74],
      ],
      [
        [-140, 116],
        [-92, 70],
        [-50, 28],
        [-6, -2],
        [35, -20],
      ],
    ];
    for (const route of routes) {
      const positions: number[] = [];
      const indices: number[] = [];
      route.forEach(([x, z], index) => {
        const previous = route[Math.max(0, index - 1)] ?? [x, z];
        const next = route[Math.min(route.length - 1, index + 1)] ?? [x, z];
        const dx = next[0] - previous[0];
        const dz = next[1] - previous[1];
        const length = Math.max(0.001, Math.hypot(dx, dz));
        const nx = (-dz / length) * 2.7;
        const nz = (dx / length) * 2.7;
        positions.push(x + nx, terrainHeight(x + nx, z + nz) + 0.045, z + nz);
        positions.push(x - nx, terrainHeight(x - nx, z - nz) + 0.045, z - nz);
        if (index < route.length - 1) {
          const base = index * 2;
          indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const path = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x66523b, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
      );
      path.receiveShadow = true;
      this.scene.add(path);
    }
  }

  private createInstancedForest(): void {
    const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.5, 5, 5);
    const crownGeometry = new THREE.ConeGeometry(2.45, 6.4, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x35261c, roughness: 1 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x213b25, roughness: 1, flatShading: true });
    const count = 860;
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, count);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    let seed = 0x5e71ed;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 0xffff_ffff;
    };
    let placed = 0;
    while (placed < count) {
      const x = (random() - 0.5) * (WORLD_SIZE - 18);
      const z = (random() - 0.5) * (WORLD_SIZE - 18);
      const refugeDistance = distance2d({ x, y: 0, z }, SAFE_ZONE_CENTER);
      const outpostDistance = distance2d({ x, y: 0, z }, OUTPOST_CENTER);
      if (refugeDistance < 34) continue;
      if (outpostDistance < 46) continue;
      if (distanceToMainRoute(x, z) < 5.4) continue;
      const scale = 0.48 + random() * 1.25;
      const y = terrainHeight(x, z);
      this.tempObject.position.set(x, y + 2.5 * scale, z);
      this.tempObject.rotation.set(0, random() * Math.PI * 2, 0);
      this.tempObject.scale.set(scale, scale, scale);
      this.tempObject.updateMatrix();
      trunks.setMatrixAt(placed, this.tempObject.matrix);
      this.tempObject.position.y = y + 6.3 * scale;
      this.tempObject.rotation.y += random() * 0.6;
      this.tempObject.scale.set(scale, scale * (0.85 + random() * 0.25), scale);
      this.tempObject.updateMatrix();
      crowns.setMatrixAt(placed, this.tempObject.matrix);
      placed += 1;
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks, crowns);
  }

  private createGroundCover(): void {
    const count = 2_400;
    const bladeGeometry = new THREE.PlaneGeometry(0.16, 0.9, 1, 1);
    bladeGeometry.translate(0, 0.45, 0);
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f5f35,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    });
    const leafGeometry = new THREE.CircleGeometry(0.22, 5);
    leafGeometry.rotateX(-Math.PI / 2);
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f5632,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, count);
    const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, count);
    blades.castShadow = true;
    leaves.receiveShadow = true;
    let seed = 0x9d3f51;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) >>> 0;
      return seed / 0xffff_ffff;
    };
    for (let index = 0; index < count; index += 1) {
      const x = (random() - 0.5) * (WORLD_SIZE - 12);
      const z = (random() - 0.5) * (WORLD_SIZE - 12);
      const routeDistance = distanceToMainRoute(x, z);
      const y = terrainHeight(x, z);
      const bladeScale = routeDistance < 6 ? 0.35 : 0.65 + random() * 0.75;
      this.tempObject.position.set(x, y + 0.04, z);
      this.tempObject.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.35);
      this.tempObject.scale.setScalar(bladeScale);
      this.tempObject.updateMatrix();
      blades.setMatrixAt(index, this.tempObject.matrix);

      this.tempObject.position.set(x + (random() - 0.5) * 1.8, y + 0.055, z + (random() - 0.5) * 1.8);
      this.tempObject.rotation.set(0, random() * Math.PI * 2, 0);
      this.tempObject.scale.setScalar(routeDistance < 4 ? 0.45 : 0.75 + random() * 0.9);
      this.tempObject.updateMatrix();
      leaves.setMatrixAt(index, this.tempObject.matrix);
    }
    blades.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(blades, leaves);
  }

  private createResourceNodes(): void {
    const materials: Record<string, THREE.MeshStandardMaterial> = {
      wood: new THREE.MeshStandardMaterial({ color: 0x70442b, roughness: 1 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x738078, roughness: 0.9, flatShading: true }),
      herb: new THREE.MeshStandardMaterial({ color: 0x6f9c51, emissive: 0x172c12, roughness: 0.9 }),
      mushroom: new THREE.MeshStandardMaterial({ color: 0xd1aa64, emissive: 0x3a2e17, roughness: 0.8 }),
    };
    for (const node of RESOURCE_NODES) {
      const geometry =
        node.itemId === 'stone'
          ? new THREE.DodecahedronGeometry(0.65, 0)
          : node.itemId === 'wood'
            ? new THREE.CylinderGeometry(0.34, 0.42, 2.4, 7)
            : new THREE.ConeGeometry(0.55, 1.2, 6);
      const mesh = new THREE.Mesh(geometry, materials[node.itemId] ?? materials.herb);
      mesh.position.set(node.position.x, terrainHeight(node.position.x, node.position.z) + 0.6, node.position.z);
      if (node.itemId === 'wood') mesh.rotation.z = Math.PI / 2;
      mesh.castShadow = true;
      mesh.userData.interactableId = node.id;
      this.scene.add(mesh);
      this.resourceVisuals.set(node.id, mesh);
    }
  }

  private async placeHeroAssets(): Promise<void> {
    const placements: Placement[] = [
      { asset: 'forest-giant-tree', position: [GIANT_TREE_CENTER.x, GIANT_TREE_CENTER.z], scale: 3.2, fallback: 'tree', collider: [4, 11, 4] },
      { asset: 'forest-broadleaf-tree', position: [-91, -51], scale: 1.3, fallback: 'tree', collider: [1.3, 4, 1.3] },
      { asset: 'forest-broadleaf-tree', position: [49, 84], scale: 1.15, fallback: 'tree', collider: [1.2, 4, 1.2] },
      { asset: 'forest-broadleaf-tree', position: [91, 128], scale: 1.4, fallback: 'tree', collider: [1.4, 5, 1.4] },
      { asset: 'forest-log', position: [-190, 76], rotation: 0.4, fallback: 'wood', collider: [2.2, 0.7, 0.8] },
      { asset: 'forest-log', position: [-64, -74], rotation: -0.8, fallback: 'wood', collider: [2.2, 0.7, 0.8] },
      { asset: 'forest-mushrooms', position: [-72, -16], scale: 1.5, fallback: 'stone' },
      { asset: 'refuge-bonfire', position: [-142, 118], fallback: 'fire', collider: [1, 0.7, 1] },
      { asset: 'refuge-shrine', position: [-139, 112], rotation: 0.8, fallback: 'shrine', collider: [1.3, 1.8, 1.3] },
      { asset: 'refuge-anvil', position: [-151, 120], rotation: -0.5, fallback: 'stone', collider: [1, 0.8, 0.6] },
      { asset: 'refuge-chest', position: [-159, 110], rotation: 0.7, fallback: 'wood', collider: [1, 0.7, 0.7] },
      { asset: 'refuge-market', position: [-127, 113], rotation: 2.4, fallback: 'tent', collider: [2, 1.5, 2] },
      { asset: 'refuge-shelter', position: [-136, 106], rotation: -1.5, fallback: 'tent', collider: [2, 1.4, 2] },
      { asset: 'outpost-temple', position: [174, -75], rotation: -Math.PI / 2, scale: 1.65, fallback: 'tower', collider: [8, 6, 9] },
      { asset: 'outpost-tower', position: [119, -104], rotation: 0.2, scale: 1.4, fallback: 'tower', collider: [3.5, 7, 3.5] },
      { asset: 'outpost-command-tent', position: [149, -96], rotation: 0.4, fallback: 'tent', collider: [3, 2, 3] },
      { asset: 'outpost-cage', position: [135, -69], rotation: -0.3, fallback: 'wood', collider: [1.3, 1.5, 1.3] },
      { asset: 'outpost-banner', position: [154, -76], scale: 1.2, fallback: 'shrine', collider: [0.5, 2, 0.5] },
    ];
    const palisadePositions: Array<[number, number, number]> = [
      [113, -48, 0.2],
      [128, -36, 0.9],
      [154, -31, 1.5],
      [181, -39, 2.1],
      [198, -59, 2.8],
      [199, -91, 3.2],
      [181, -112, 3.8],
      [150, -119, 4.4],
      [121, -108, 5.1],
      [105, -84, 5.8],
    ];
    palisadePositions.forEach(([x, z, rotation]) =>
      placements.push({ asset: 'outpost-palisade', position: [x, z], rotation, scale: 1.2, fallback: 'wood', collider: [2.5, 1.8, 0.7] }),
    );
    for (const placement of placements) await this.place(placement);
  }

  private async place(placement: Placement): Promise<void> {
    const model = (await this.assets.instantiate(placement.asset)) ?? fallbackModel(placement.fallback);
    const [x, z] = placement.position;
    model.position.set(x, terrainHeight(x, z), z);
    model.rotation.y += placement.rotation ?? 0;
    model.scale.multiplyScalar(placement.scale ?? 1);
    model.name = placement.asset;
    if (placement.asset === 'outpost-banner') this.outpostBanner.add(model);
    else this.scene.add(model);
    if (placement.collider) {
      const [hx, hy, hz] = placement.collider;
      const collider = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      collider.position.set(x, terrainHeight(x, z) + hy, z);
      collider.rotation.y = placement.rotation ?? 0;
      collider.userData.cameraCollider = true;
      this.scene.add(collider);
      this.cameraColliders.push(collider);
    }
  }
}

function fallbackModel(kind: Placement['fallback']): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3826, roughness: 1, flatShading: true });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x33231c, roughness: 1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x762228, roughness: 0.95, side: THREE.DoubleSide });
  const stone = new THREE.MeshStandardMaterial({ color: 0x68716a, roughness: 0.95, flatShading: true });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x365a35, roughness: 1, flatShading: true });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  if (kind === 'tree') {
    add(new THREE.CylinderGeometry(0.8, 1.4, 9, 7), wood, 4.5);
    add(new THREE.IcosahedronGeometry(4.4, 1), leaf, 10);
  } else if (kind === 'tent') {
    add(new THREE.ConeGeometry(2.4, 3.3, 4), cloth, 1.65).rotation.y = Math.PI / 4;
  } else if (kind === 'tower') {
    add(new THREE.CylinderGeometry(3, 3.5, 8, 7), stone, 4);
    add(new THREE.ConeGeometry(3.8, 3, 7), cloth, 9.5);
  } else if (kind === 'shrine') {
    add(new THREE.DodecahedronGeometry(1.2, 0), stone, 1.2);
    add(new THREE.CylinderGeometry(0.25, 0.35, 3.5, 5), darkWood, 2.4);
  } else if (kind === 'fire') {
    for (let index = 0; index < 5; index += 1) {
      const log = add(new THREE.CylinderGeometry(0.13, 0.16, 1.8, 6), wood, 0.25);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (index / 5) * Math.PI;
    }
    add(
      new THREE.ConeGeometry(0.7, 2.1, 7),
      new THREE.MeshStandardMaterial({ color: 0xff8a2b, emissive: 0xff4a0c, emissiveIntensity: 2 }),
      1.2,
    );
  } else if (kind === 'wood') {
    add(new THREE.BoxGeometry(3.5, 1.4, 1.1), wood, 0.7);
  } else {
    add(new THREE.DodecahedronGeometry(1, 0), stone, 0.8);
  }
  return group;
}

function distanceToMainRoute(x: number, z: number): number {
  const points: Array<[number, number]> = [
    [-220, 52],
    [-142, 116],
    [-62, 72],
    [28, 22],
    [112, -48],
    [151, -74],
  ];
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    const t = THREE.MathUtils.clamp(((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2), 0, 1);
    minimum = Math.min(minimum, Math.hypot(x - (a[0] + (b[0] - a[0]) * t), z - (a[1] + (b[1] - a[1]) * t)));
  }
  return minimum;
}
