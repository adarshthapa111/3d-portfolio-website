import * as THREE from 'three'
import Experience from '../core/Experience'
import { SURFACE_ORIGIN } from './Surface'
import { SPACE_END, SURFACE_END, spaceT, surfaceT } from './stages'

// Turns page scroll into the whole journey, in three acts:
//   SPACE    : solar-system overview -> dive into Earth
//   (cloud whiteout)
//   SURFACE  : descend from the clouds -> walk the street -> gate
//   (door whiteout)
//   INTERIOR : inside the house -> intro, tech, projects
//
// Each whiteout hides a camera teleport between scenes built far apart, which
// is how we cross impossible changes of scale without the seam ever showing.
const OVERVIEW_POSITION = new THREE.Vector3(0, 55, 150)
const SMOOTHING = 0.06
const SPACE_BLOOM = 0.28 // bloom strength in space (matches Renderer default)
const ZERO = new THREE.Vector3(0, 0, 0)

// Whiteout widths (in scroll units) before/after each transition centre.
// Kept short so they're brief flashes, not long white stretches that hide the
// colony / interior.
const CLOUD_IN = 0.035
const CLOUD_OUT = 0.05
const DOOR_IN = 0.025
const DOOR_OUT = 0.03

export default class Navigation {
  experience: Experience
  scrollProgress = 0

  private targetPosition = new THREE.Vector3()
  private targetLookAt = new THREE.Vector3()
  private currentLookAt = new THREE.Vector3()
  private stage = ''
  private lastCamStage = ''
  private flashEl = document.querySelector<HTMLElement>('#transition-fade')

  constructor() {
    this.experience = new Experience()
    this.experience.camera.instance.position.copy(OVERVIEW_POSITION)
    this.currentLookAt.copy(ZERO)

    window.addEventListener('scroll', () => this.onScroll())
    this.onScroll()
  }

  onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight
    const raw = max > 0 ? window.scrollY / max : 0
    this.scrollProgress = THREE.MathUtils.clamp(raw, 0, 1)
  }

  private ease(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  // Whiteout alpha that ramps up to a transition centre, then back down.
  private whiteout(p: number, centre: number, inW: number, outW: number) {
    return p < centre
      ? THREE.MathUtils.smoothstep(p, centre - inW, centre)
      : 1 - THREE.MathUtils.smoothstep(p, centre, centre + outW)
  }

  private computeTargets(p: number) {
    // The interior (stage 3) is click-driven — Interior owns the camera there.
    if (p < SPACE_END) {
      this.computeSpace(p)
    } else {
      this.computeSurface(p)
    }
  }

  private computeSpace(p: number) {
    const solar = this.experience.world.solarSystem
    const t = this.ease(spaceT(p))
    const earth = solar.earthWorldPosition
    // End right up against Earth so it fills the frame as we plunge in.
    const end = earth
      .clone()
      .add(new THREE.Vector3(0, solar.earthRadius * 0.6, solar.earthRadius * 2.4))
    this.targetPosition.lerpVectors(OVERVIEW_POSITION, end, t)
    this.targetLookAt.lerpVectors(ZERO, earth, t)

    // The spaceship flies in ahead of us and dives into Earth.
    solar.flyShip(t)
  }

  private computeSurface(p: number) {
    const o = SURFACE_ORIGIN
    const t = this.ease(surfaceT(p))

    // The ship flies over the colony; the camera trails behind & above it, so
    // you look down over the houses (and their name signs) as you pass.
    const ship = this.experience.world.surface.flyShip(t)
    if (!ship) return

    // Trail behind & above the ship; always look at ground level ahead so we
    // see the colony passing below and end framed on the house as it lands.
    this.targetPosition.set(o.x, ship.y + 9, ship.z + 24)
    this.targetLookAt.set(o.x, o.y + 7, ship.z - 16)
  }

  update() {
    if (this.experience.camera.debug) return

    const p = this.scrollProgress
    const camera = this.experience.camera.instance

    // Bloom suits the glowing sun, but blows out the bright sky/clouds. Fade it
    // out as we leave space.
    const bloomFade = THREE.MathUtils.smoothstep(p, SPACE_END - 0.05, SPACE_END + 0.05)
    this.experience.renderer.bloom.strength = THREE.MathUtils.lerp(SPACE_BLOOM, 0, bloomFade)

    // Two whiteouts: clouds (space->surface) and a door flash (surface->interior).
    const flash = Math.max(
      this.whiteout(p, SPACE_END, CLOUD_IN, CLOUD_OUT),
      this.whiteout(p, SURFACE_END, DOOR_IN, DOOR_OUT),
    )
    if (this.flashEl) this.flashEl.style.opacity = String(flash)

    const stage = p < SPACE_END ? 'space' : p < SURFACE_END ? 'surface' : 'interior'

    // Fog changes at stage boundaries (warm haze only outdoors on the surface).
    if (stage !== this.stage) {
      this.stage = stage
      this.experience.scene.fog = stage === 'surface' ? this.experience.world.surface.fog : null
    }

    // In the interior, Interior.ts owns the (click-driven) camera — hands off.
    if (stage === 'interior') return

    this.computeTargets(p)

    // Snap the camera across the space->surface change (hidden by the whiteout).
    if (this.lastCamStage !== stage) {
      this.lastCamStage = stage
      camera.position.copy(this.targetPosition)
      this.currentLookAt.copy(this.targetLookAt)
    }

    // Frame-rate-independent smoothing so the glide feels identical whether
    // the device runs at 30, 60 or 120 fps.
    const dt = this.experience.time.delta / 1000
    const s = 1 - Math.pow(1 - SMOOTHING, Math.min(dt * 60, 4))

    camera.position.lerp(this.targetPosition, s)
    this.currentLookAt.lerp(this.targetLookAt, s)
    camera.lookAt(this.currentLookAt)
  }
}
