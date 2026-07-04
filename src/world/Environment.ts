import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import Experience from '../core/Experience'

// Lighting + atmosphere for the whole scene.
//
// The big upgrade here is `scene.environment`: an environment map that every
// material samples for reflections. Instead of downloading a heavy .hdr file
// we generate one procedurally from Three's built-in RoomEnvironment using a
// PMREMGenerator (which pre-blurs it into the format materials expect). This
// is what makes metallic/smooth surfaces look real instead of flat.
export default class Environment {
  experience: Experience
  scene: THREE.Scene

  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.setEnvironmentMap()
    // NOTE: no global lights here! Anything added to the scene root lights ALL
    // three stages at once (a global daylight directional was washing out the
    // night colony and the dark interior). Space's lights live in
    // SolarSystem.group; each stage lights itself.
  }

  setEnvironmentMap() {
    // A real HDRI gives materials realistic reflections + soft sky lighting.
    // PMREM pre-blurs it so rough surfaces get soft reflections, smooth ones sharp.
    const renderer = this.experience.renderer.instance
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()

    new RGBELoader().load('/textures/env.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture
      hdr.dispose()
      pmrem.dispose()
    })
  }

}
