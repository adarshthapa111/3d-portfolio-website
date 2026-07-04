import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import EventEmitter from '../utils/EventEmitter'

// Every model that makes up the society, grouped by the subfolder it lives in
// (public/models/<category>/<file>). Drop a file in a folder, add its name
// here, and it loads automatically.
export const MODEL_MANIFEST: Record<string, string[]> = {
  'modern-house-architecture': [
    'modern_house.glb',
    'modern_house-2.glb',
    'vianney_house_2.glb',
    'raven.glb', // the spaceship
    'street_light.glb', // modern street lights
  ],
  houses: ['new_adarshthapahouse.glb'],

  nature: [
    'Tree.glb',
    'Maple Trees.glb',
    'Twisted Tree.glb',
    'Bush.glb',
    'Rose bush.glb',
    'Rocks.glb',
    'Dandelions.glb',
  ],
  interior: ['Chandelier.glb'],
  'interior-design': [
    'Cozy Kitchen.glb',
    'Bar Table.glb',
    'Chair.glb',
    'Desk.glb',
    'Little Bookcase.glb',
    'Couch.glb',
    'Bed.glb',
    'Window2 black open 1731.glb',
    'Wall painting.glb',
    'Wall Art 06.glb',
  ],
}

// Central asset loader.
//
// One THREE.LoadingManager tracks EVERY load (planet textures + all models)
// so a single progress bar reflects everything. Models can be DRACO-compressed,
// so we wire a DRACOLoader to the decoder in /public.
//
// Other modules grab `resources.textureLoader` so their loads are counted, and
// listen for 'ready' to read `resources.models` (keyed by file name).
export default class Resources extends EventEmitter {
  manager: THREE.LoadingManager
  textureLoader: THREE.TextureLoader
  gltfLoader: GLTFLoader

  models: Record<string, THREE.Group> = {}
  animations: Record<string, THREE.AnimationClip[]> = {}

  private total = 0
  private loaded = 0
  private loadingEl = document.querySelector<HTMLElement>('#loading')
  private barEl = document.querySelector<HTMLElement>('#loading-bar')

  constructor() {
    super()

    this.manager = new THREE.LoadingManager()
    this.manager.onProgress = (_url, loaded, total) => {
      const percent = total > 0 ? loaded / total : 0
      if (this.barEl) this.barEl.style.transform = `scaleX(${percent})`
    }

    this.textureLoader = new THREE.TextureLoader(this.manager)

    const draco = new DRACOLoader(this.manager)
    draco.setDecoderPath('/draco/')
    this.gltfLoader = new GLTFLoader(this.manager)
    this.gltfLoader.setDRACOLoader(draco)

    this.loadModels()
  }

  private loadModels() {
    const entries = Object.entries(MODEL_MANIFEST)
    this.total = entries.reduce((sum, [, files]) => sum + files.length, 0)

    for (const [category, files] of entries) {
      for (const file of files) {
        // encodeURI handles spaces in folder/file names ("Farm house.glb").
        this.gltfLoader.load(
          encodeURI(`/models/${category}/${file}`),
          (gltf) => {
            this.models[file] = gltf.scene
            this.animations[file] = gltf.animations
            this.onModelDone()
          },
          undefined,
          (error) => {
            console.error('Failed to load model:', file, error)
            this.onModelDone()
          },
        )
      }
    }
  }

  private onModelDone() {
    this.loaded += 1
    if (this.loaded === this.total) this.finish()
  }

  // Tell the app the models are ready. The loading screen stays up while
  // Experience warms up (pre-renders) all three stages, then calls revealScene.
  private finish() {
    if (this.barEl) this.barEl.style.transform = 'scaleX(1)'
    this.trigger('ready')
  }

  // Called by Experience once every stage is compiled + uploaded to the GPU.
  revealScene() {
    if (this.loadingEl) this.loadingEl.classList.add('is-hidden')
    // Make sure we reveal the scene from the very top of the journey.
    window.scrollTo(0, 0)
  }
}
