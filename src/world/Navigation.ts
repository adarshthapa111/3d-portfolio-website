import * as THREE from 'three'
import Experience from '../core/Experience'
import { SURFACE_ORIGIN, HERO_OFFSET, ROAD_START_Z } from './Surface'
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
const SMOOTHING = 0.1 // snappier glide so the camera tracks fast scrolls closely
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

    // First-person walk: stroll down the street at eye level, from the colony
    // entrance to the house, with a gentle walking bob. (The hands are drawn in
    // front of the camera — see Interior.updateArms.)
    const z = o.z + THREE.MathUtils.lerp(ROAD_START_Z - 4, HERO_OFFSET.z + 24, t)
    const bob = Math.sin(this.experience.time.elapsed * 0.006) * 0.12
    this.targetPosition.set(o.x, o.y + 5 + bob, z)
    this.targetLookAt.set(o.x, o.y + 4.2, z - 18)
  }

  update() {
    if (this.experience.camera.debug) return

    const p = this.scrollProgress
    const camera = this.experience.camera.instance

    // Bloom suits the glowing sun, but blows out the bright sky/clouds. Fade it
    // out as we leave space — and DISABLE the pass once it's ~zero: its blur
    // chain costs several full-screen GPU passes per frame even at strength 0,
    // which was a big part of the scroll lag on the surface/interior.
    const bloom = this.experience.renderer.bloom
    const bloomFade = THREE.MathUtils.smoothstep(p, SPACE_END - 0.05, SPACE_END + 0.05)
    bloom.strength = THREE.MathUtils.lerp(SPACE_BLOOM, 0, bloomFade)
    bloom.enabled = bloom.strength > 0.02

    // Two whiteouts: clouds (space->surface) and a door flash (surface->interior).
    const flash = Math.max(
      this.whiteout(p, SPACE_END, CLOUD_IN, CLOUD_OUT),
      this.whiteout(p, SURFACE_END, DOOR_IN, DOOR_OUT),
    )
    if (this.flashEl) this.flashEl.style.opacity = String(flash)

    const stage = p < SPACE_END ? 'space' : p < SURFACE_END ? 'surface' : 'interior'

    // Fog changes at stage boundaries (haze only outdoors on the surface), and
    // the HDRI environment map — which image-based-lights EVERY material — is
    // dimmed right down outside space, or it floods the night scenes with
    // daylight. environmentIntensity is a uniform: no shader recompile.
    if (stage !== this.stage) {
      this.stage = stage
      const scene = this.experience.scene
      scene.fog = stage === 'surface' ? this.experience.world.surface.fog : null
      scene.environmentIntensity = stage === 'space' ? 1 : 0.06
    }

    // In the interior, Interior.ts owns the (click-driven) camera — hands off.
    // Mark the stage so that when we come BACK to the surface the snap below
    // fires (otherwise the camera slides in from the interior position and dips
    // below the street during the switch).
    if (stage === 'interior') {
      this.lastCamStage = stage
      return
    }

    this.computeTargets(p)

    // Snap the camera across the space->surface change, and ALSO whenever the
    // screen is (nearly) fully white — on fast scrolls the smoothed camera lags
    // its target, so without this the whiteout fades while the camera is still
    // travelling and you see a white/half-way frame. Snapping under full white
    // is invisible and keeps camera and scroll perfectly in sync.
    if (this.lastCamStage !== stage || flash > 0.88) {
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
