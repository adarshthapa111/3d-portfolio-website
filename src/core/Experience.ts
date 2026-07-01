import * as THREE from 'three'
import Debug from '../utils/Debug'
import Sizes from './Sizes'
import Time from './Time'
import Resources from './Resources'
import Camera from './Camera'
import Renderer from './Renderer'
import World from '../world/World'
import Navigation from '../world/Navigation'

// Experience is a singleton: every module does `new Experience()` to reach
// the same shared scene, camera, sizes and time. This is the heart of the
// whole app and the pattern you'll reuse in future Three.js projects.
let instance: Experience | null = null

export default class Experience {
  canvas!: HTMLCanvasElement
  debug!: Debug
  sizes!: Sizes
  time!: Time
  resources!: Resources
  scene!: THREE.Scene
  camera!: Camera
  renderer!: Renderer
  world!: World
  navigation!: Navigation

  constructor(canvas?: HTMLCanvasElement) {
    // Return the existing instance if one already exists.
    if (instance) return instance
    instance = this

    if (!canvas) {
      throw new Error('Experience must be created with a canvas the first time.')
    }

    // Order matters: each system below may read the ones created before it.
    this.canvas = canvas
    this.debug = new Debug()
    this.sizes = new Sizes()
    this.time = new Time()
    this.scene = new THREE.Scene()
    this.resources = new Resources() // starts loading assets immediately
    this.camera = new Camera()
    this.renderer = new Renderer()
    this.world = new World()
    this.navigation = new Navigation()

    this.sizes.on('resize', () => this.resize())
    this.time.on('tick', () => this.update())
  }

  resize() {
    this.camera.resize()
    this.renderer.resize()
  }

  update() {
    this.navigation.update()
    this.camera.update()
    this.world.update()
    this.renderer.update()
  }
}
