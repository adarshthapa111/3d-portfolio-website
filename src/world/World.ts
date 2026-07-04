import * as THREE from 'three'
import Experience from '../core/Experience'
import Environment from './Environment'
import SolarSystem from './SolarSystem'
import Surface from './Surface'
import Interior from './Interior'
import { SPACE_END, SURFACE_END } from './stages'

// Builds the contents of the scene: lighting, a deep starfield, the solar
// system (Stage 1) and the planet surface (Stage 2).
export default class World {
  experience: Experience
  scene: THREE.Scene
  environment: Environment
  solarSystem: SolarSystem
  surface: Surface
  interior: Interior

  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene

    this.environment = new Environment()
    this.addStars()
    this.solarSystem = new SolarSystem()
    this.surface = new Surface()
    this.interior = new Interior()
  }

  // A large sphere of points surrounding everything — the background stars.
  addStars() {
    const count = 2500
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Random points on a big sphere shell so stars are always far away.
      const r = 250 + Math.random() * 250
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    })
    this.scene.add(new THREE.Points(geometry, material))
  }

  update() {
    // Only animate AND render the stage we're in (plus a small margin around
    // the transitions). Hiding the other two scenes skips their draw calls
    // entirely, and gating update() skips their per-frame work.
    const p = this.experience.navigation.scrollProgress
    const inSpace = p < SPACE_END + 0.05
    const inSurface = p > SPACE_END - 0.05 && p < SURFACE_END + 0.05
    const inInterior = p > SURFACE_END - 0.05

    this.solarSystem.group.visible = inSpace
    this.surface.group.visible = inSurface
    this.interior.group.visible = inInterior

    if (inSpace) this.solarSystem.update()
    if (inSurface) this.surface.update()
    if (inInterior) this.interior.update()
  }
}
