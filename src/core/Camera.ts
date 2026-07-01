import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Experience from './Experience'

// Owns the PerspectiveCamera. In normal mode the camera is driven by
// scroll (see Navigation.ts). In #debug mode OrbitControls take over so
// you can fly around freely and inspect the scene while learning.
export default class Camera {
  experience: Experience
  instance!: THREE.PerspectiveCamera
  controls?: OrbitControls
  debug: boolean

  constructor() {
    this.experience = new Experience()
    this.debug = this.experience.debug.active

    this.setInstance()
    if (this.debug) this.setControls()
  }

  setInstance() {
    const { sizes, scene } = this.experience
    this.instance = new THREE.PerspectiveCamera(
      50,
      sizes.width / sizes.height,
      0.1,
      2000, // far enough to see the whole solar system
    )
    this.instance.position.set(0, 55, 150)
    scene.add(this.instance)
  }

  setControls() {
    this.controls = new OrbitControls(this.instance, this.experience.canvas)
    this.controls.enableDamping = true
  }

  resize() {
    this.instance.aspect = this.experience.sizes.width / this.experience.sizes.height
    this.instance.updateProjectionMatrix()
  }

  update() {
    this.controls?.update()
  }
}
