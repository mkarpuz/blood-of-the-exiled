import * as THREE from 'three';
import { runtimeAssetSchema, type RuntimeAsset } from '@boe/contracts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

interface LoadedAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class AssetLibrary {
  private readonly loader = new GLTFLoader();
  private readonly definitions = new Map<string, RuntimeAsset>();
  private readonly loaded = new Map<string, Promise<LoadedAsset | null>>();

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadManifest(): Promise<RuntimeAsset[]> {
    const response = await fetch('/assets/runtime/manifest.json');
    if (!response.ok) throw new Error('Runtime asset manifest is unavailable');
    const assets = runtimeAssetSchema.array().parse(await response.json());
    for (const asset of assets) this.definitions.set(asset.id, asset);
    return assets;
  }

  getDefinition(id: string): RuntimeAsset | undefined {
    return this.definitions.get(id);
  }

  async instantiate(id: string): Promise<THREE.Group | null> {
    const loaded = await this.load(id);
    if (!loaded) return null;
    const instance = clone(loaded.scene) as THREE.Group;
    const definition = this.definitions.get(id);
    if (definition) {
      instance.scale.setScalar(definition.transform.scale);
      instance.rotation.y += definition.transform.rotationY;
      instance.position.y += definition.transform.offsetY;
    }
    instance.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry = object.geometry.clone();
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => material.clone())
          : object.material.clone();
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
      }
    });
    instance.userData.animations = loaded.animations;
    return instance;
  }

  preload(ids: string[]): Promise<Array<LoadedAsset | null>> {
    return Promise.all(ids.map((id) => this.load(id)));
  }

  private load(id: string): Promise<LoadedAsset | null> {
    const cached = this.loaded.get(id);
    if (cached) return cached;
    const definition = this.definitions.get(id);
    if (!definition) return Promise.resolve(null);
    const promise = this.loader
      .loadAsync(definition.outputGlb)
      .then((gltf) => ({ scene: gltf.scene, animations: gltf.animations }))
      .catch((error: unknown) => {
        console.error(`Runtime asset failed to load: ${id}`, error);
        return null;
      });
    this.loaded.set(id, promise);
    return promise;
  }
}
