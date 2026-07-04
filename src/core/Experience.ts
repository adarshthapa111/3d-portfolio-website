import * as THREE from 'three'
import Debug from '../utils/Debug'
import Sizes from './Sizes'
import Time from './Time'
import Resources from './Resources'
import Camera from './Camera'
import Renderer from './Renderer'
import World from '../world/World'
import Navigation from '../world/Navigation'
import { SURFACE_ORIGIN } from '../world/Surface'
import { INTERIOR_ORIGIN } from '../world/Interior'

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

    // Registered AFTER World, so it runs after the stages build their content:
    // warm up (pre-render) every stage behind the loading screen, THEN reveal.
    this.resources.on('ready', () => this.warmupAndReveal())
  }

  // Render each stage once while the loading screen still covers the canvas.
  // This compiles every shader and uploads every texture/shadow up front, so
  // the space -> surface -> interior switches never stall mid-scroll.
  private warmupAndReveal() {
    const cam = this.camera.instance
    const { solarSystem, surface, interior } = this.world
    const prevPos = cam.position.clone()

    const stages = [
      {
        group: interior.group,
        pos: INTERIOR_ORIGIN.clone().add(new THREE.Vector3(0, 8, 12)),
        look: INTERIOR_ORIGIN.clone().add(new THREE.Vector3(0, 6, -10)),
        fog: null as THREE.Fog | null,
      },
      {
        group: surface.group,
        pos: SURFACE_ORIGIN.clone().add(new THREE.Vector3(0, 5, 92)),
        look: SURFACE_ORIGIN.clone().add(new THREE.Vector3(0, 4.2, 74)),
        fog: surface.fog,
      },
      // Space last, so we end in the journey's real starting state.
      { group: solarSystem.group, pos: prevPos, look: new THREE.Vector3(0, 0, 0), fog: null },
    ]

    this.world.interior.updateArms(0.5) // arms visible so their shaders compile too

    for (const s of stages) {
      solarSystem.group.visible = s.group === solarSystem.group
      surface.group.visible = s.group === surface.group
      interior.group.visible = s.group === interior.group
      this.scene.fog = s.fog // fog changes the compiled shader -> match runtime
      cam.position.copy(s.pos)
      cam.lookAt(s.look)
      if (s.group === surface.group) surface.update() // primes the static shadow map
      this.renderer.instance.compile(this.scene, cam)
      this.renderer.composer.render()
    }

    this.world.interior.updateArms(0)
    this.scene.fog = null
    cam.position.copy(prevPos)
    this.resources.revealScene()
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
