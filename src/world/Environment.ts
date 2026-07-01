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
    this.setLights()
    // No fog in space — the starfield should stay crisp into the distance.
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

  setLights() {
    // With an environment map doing a lot of the lighting, the direct lights
    // are now mainly for shaping highlights and adding the coloured rim glow.
    const ambient = new THREE.AmbientLight('#ffffff', 0.15)
    this.scene.add(ambient)

    const key = new THREE.DirectionalLight('#ffffff', 2)
    key.position.set(3, 5, 4)
    this.scene.add(key)

    const rim = new THREE.PointLight('#5b8cff', 45, 60)
    rim.position.set(-5, 2, -8)
    this.scene.add(rim)

    // Live controls in #debug mode.
    const gui = this.experience.debug.gui
    if (gui) {
      const folder = gui.addFolder('Environment')
      folder.add(ambient, 'intensity', 0, 2).name('ambient')
      folder.add(key, 'intensity', 0, 5).name('key light')
      folder.add(rim, 'intensity', 0, 100).name('rim light')
    }
  }
}
