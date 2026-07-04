import * as THREE from 'three'
import Experience from '../core/Experience'

// ---------------------------------------------------------------------------
// STAGE 1 of the journey: the solar system.
//
// A glowing sun at the centre (it's a MeshBasicMaterial so it's always full
// bright -> the bloom pass makes it blaze), planets orbiting on faint rings,
// and a photo-textured Earth (with clouds, an atmosphere glow and an orbiting
// moon) that the camera flies towards as you scroll.
//
// Earth is placed at a FIXED point (it spins but doesn't orbit) so the camera
// always knows where to fly. The other planets orbit for life.
// ---------------------------------------------------------------------------

interface PlanetConfig {
  name: string
  radius: number
  distance: number
  texture: string
  orbitSpeed: number
  spinSpeed: number
  ring?: boolean
  color: string // trail / orbit-line colour (the helical "comet tail" look)
  incline: number // orbital-plane tilt so the system reads as layered 3D
}

const TEX = '/textures/planets/'

const PLANETS: PlanetConfig[] = [
  { name: 'Mercury', radius: 0.8, distance: 14, texture: '2k_mercury.jpg', orbitSpeed: 0.30, spinSpeed: 0.3, color: '#7ad7f0', incline: 0.10 },
  { name: 'Venus', radius: 1.3, distance: 20, texture: '2k_venus_surface.jpg', orbitSpeed: 0.22, spinSpeed: 0.2, color: '#f0b455', incline: -0.14 },
  { name: 'Mars', radius: 1.1, distance: 36, texture: '2k_mars.jpg', orbitSpeed: 0.16, spinSpeed: 0.4, color: '#ff7a59', incline: 0.18 },
  { name: 'Jupiter', radius: 3.6, distance: 52, texture: '2k_jupiter.jpg', orbitSpeed: 0.10, spinSpeed: 0.6, color: '#ffb347', incline: -0.08 },
  { name: 'Saturn', radius: 3.0, distance: 68, texture: '2k_saturn.jpg', orbitSpeed: 0.08, spinSpeed: 0.6, ring: true, color: '#ffd97a', incline: 0.12 },
  { name: 'Uranus', radius: 2.2, distance: 82, texture: '2k_uranus.jpg', orbitSpeed: 0.06, spinSpeed: 0.4, color: '#7af0d0', incline: -0.20 },
  { name: 'Neptune', radius: 2.1, distance: 94, texture: '2k_neptune.jpg', orbitSpeed: 0.05, spinSpeed: 0.4, color: '#6f8cff', incline: 0.16 },
]

const EARTH_COLOR = '#6fc3ff'
const EARTH_INCLINE = 0.1

const EARTH_DISTANCE = 28
const EARTH_ANGLE = Math.PI * 0.18
const EARTH_ORBIT_SPEED = 0.12 // slow enough that the dive still tracks it

export default class SolarSystem {
  experience: Experience
  scene: THREE.Scene
  group = new THREE.Group() // all space objects live here so we can hide them

  readonly earthRadius = 1.7

  // Earth now orbits like the others, so we read its live world position (used
  // by the camera + spaceship to dive onto it) instead of a fixed constant.
  get earthWorldPosition(): THREE.Vector3 {
    return this.earthGroup
      ? this.earthGroup.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(EARTH_DISTANCE, 0, 0)
  }

  // moving parts we animate each frame
  private orbits: { pivot: THREE.Group; mesh: THREE.Mesh; cfg: PlanetConfig }[] = []
  private earthPivot!: THREE.Group
  private earthGroup!: THREE.Group
  private earth!: THREE.Mesh
  private clouds!: THREE.Mesh
  private moonPivot!: THREE.Group
  private spaceship: THREE.Group | null = null
  private loader!: THREE.TextureLoader

  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.scene.add(this.group)
    // Shared loader so these textures count toward the loading progress bar.
    this.loader = this.experience.resources.textureLoader

    this.createSun()
    this.createPlanets()
    this.createEarth()

    const resources = this.experience.resources
    if (resources.models['raven.glb']) this.createShip()
    else resources.on('ready', () => this.createShip())
  }

  private createShip() {
    const source = this.experience.resources.models['raven.glb']
    if (!source) return
    const ship = source.clone(true)
    const box = new THREE.Box3().setFromObject(ship)
    const size = box.getSize(new THREE.Vector3())
    ship.scale.setScalar(1.6 / (Math.max(size.x, size.y, size.z) || 1))
    ship.visible = false
    this.group.add(ship)
    this.spaceship = ship
  }

  // Fly the ship in ahead of the camera and toward Earth as the space stage
  // progresses (t = 0..1). Navigation calls this each frame.
  flyShip(t: number) {
    const ship = this.spaceship
    if (!ship) return
    if (t < 0.22) {
      ship.visible = false
      return
    }
    ship.visible = true

    const cam = this.experience.camera.instance.position
    const earth = this.earthWorldPosition
    const k = (t - 0.22) / 0.78 // 0..1 over the approach

    // Sit between the camera and Earth (so it's always in view), converging
    // onto Earth as we dive in.
    const pos = cam.clone().lerp(earth, THREE.MathUtils.lerp(0.4, 0.96, k))
    pos.add(new THREE.Vector3(9 * (1 - k) + 1.5, 4 * (1 - k) + 0.6, 0))
    ship.position.copy(pos)
    ship.lookAt(earth)
  }

  // Load a COLOUR texture. Colour maps must be tagged sRGB so they don't
  // look washed out; data maps (normal/spec) stay in the default linear space.
  private colorTexture(path: string) {
    const texture = this.loader.load(path)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  createSun() {
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(7, 64, 64),
      // Unlit + bright so the bloom pass makes it blaze.
      new THREE.MeshBasicMaterial({ map: this.colorTexture(TEX + '2k_sun.jpg') }),
    )
    this.group.add(sun)

    // The sun's PATH through the galaxy — a long golden line through it (like
    // the helical solar-system visualisations), brightest at the sun and
    // fading out toward both ends.
    const dir = new THREE.Vector3(1, 0.3, -0.35).normalize()
    const N = 80
    const positions = new Float32Array((N + 1) * 3)
    const colors = new Float32Array((N + 1) * 3)
    const gold = new THREE.Color('#ffce6b')
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1 // -1 .. 1 along the path
      positions[i * 3] = dir.x * t * 150
      positions[i * 3 + 1] = dir.y * t * 150
      positions[i * 3 + 2] = dir.z * t * 150
      const fade = (1 - Math.abs(t)) ** 1.5
      colors[i * 3] = gold.r * fade
      colors[i * 3 + 1] = gold.g * fade
      colors[i * 3 + 2] = gold.b * fade
    }
    const pathGeo = new THREE.BufferGeometry()
    pathGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    pathGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.group.add(
      new THREE.Line(
        pathGeo,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      ),
    )

    // A light at the sun lights every planet. decay:0 = no distance falloff,
    // so far planets aren't pitch black; the direction still creates Earth's
    // day/night terminator.
    const sunLight = new THREE.PointLight('#fff3d6', 3, 0, 0)
    this.group.add(sunLight)

    // Space's fill lights live INSIDE this group (never at the scene root —
    // a global light would wash out the night colony and the dark interior).
    const ambient = new THREE.AmbientLight('#ffffff', 0.15)
    const key = new THREE.DirectionalLight('#ffffff', 2)
    key.position.set(3, 5, 4)
    const rim = new THREE.PointLight('#5b8cff', 45, 60)
    rim.position.set(-5, 2, -8)
    this.group.add(ambient, key, rim)
  }

  createPlanets() {
    for (const cfg of PLANETS) {
      // Each planet gets its own TILTED orbital plane, so the system reads as
      // a layered, three-dimensional swirl instead of one flat disc.
      const plane = new THREE.Group()
      plane.rotation.x = cfg.incline
      plane.rotation.z = cfg.incline * 0.6
      this.group.add(plane)

      // A pivot at the origin; rotating it sweeps the planet around its orbit.
      const pivot = new THREE.Group()
      pivot.rotation.y = Math.random() * Math.PI * 2
      plane.add(pivot)

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(cfg.radius, 48, 48),
        new THREE.MeshStandardMaterial({
          map: this.colorTexture(TEX + cfg.texture),
          roughness: 0.85,
          metalness: 0,
        }),
      )
      mesh.position.x = cfg.distance
      pivot.add(mesh)

      if (cfg.ring) mesh.add(this.makeSaturnRing(cfg.radius))

      // Glowing comet-tail trail that follows the planet (parented to the
      // pivot, so it sweeps round with zero per-frame cost), over a faint
      // full-orbit line in the same colour.
      pivot.add(this.makeTrail(cfg.distance, cfg.color))
      plane.add(this.makeOrbitLine(cfg.distance, cfg.color, 0.16))

      this.orbits.push({ pivot, mesh, cfg })
    }
  }

  // A fading arc of light BEHIND a planet — the helical "comet tail" look.
  // Built once along the orbit circle ending at the planet's local position;
  // vertex colours fade to black, and additive blending turns black into
  // invisible, so the tail glows and dissolves.
  private makeTrail(distance: number, color: string, span = 1.6) {
    const N = 64
    const positions = new Float32Array((N + 1) * 3)
    const colors = new Float32Array((N + 1) * 3)
    const c = new THREE.Color(color)
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * span // 0 = at the planet, span = far behind it
      positions[i * 3] = Math.cos(a) * distance
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = Math.sin(a) * distance
      const fade = (1 - i / N) ** 2
      colors[i * 3] = c.r * fade
      colors[i * 3 + 1] = c.g * fade
      colors[i * 3 + 2] = c.b * fade
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    )
  }

  makeSaturnRing(planetRadius: number) {
    const inner = planetRadius * 1.3
    const outer = planetRadius * 2.3
    const geometry = new THREE.RingGeometry(inner, outer, 96)

    // RingGeometry's default UVs map the square texture onto the ring, which
    // smears the strip texture. Rewrite them so the texture is sampled
    // RADIALLY: u = how far out from the inner edge (0) to the outer (1).
    const position = geometry.attributes.position
    const uv = geometry.attributes.uv
    const v = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i)
      const radial = (v.length() - inner) / (outer - inner)
      uv.setXY(i, radial, 0.5)
    }

    const ring = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: this.colorTexture(TEX + '2k_saturn_ring_alpha.png'),
        side: THREE.DoubleSide,
        transparent: true,
        roughness: 0.9,
      }),
    )
    ring.rotation.x = Math.PI * 0.5
    return ring
  }

  // A faint circle showing a planet's orbit path, in the planet's own colour.
  private makeOrbitLine(distance: number, color = '#3a4a6b', opacity = 0.4) {
    const points: THREE.Vector3[] = []
    const segments = 128
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2
      points.push(new THREE.Vector3(Math.cos(a) * distance, 0, Math.sin(a) * distance))
    }
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    )
  }

  createEarth() {
    const loader = new THREE.TextureLoader()
    // Colour maps must be tagged sRGB; data maps (normal/spec) stay linear.
    const dayMap = loader.load('/textures/planets/earth_atmos_2048.jpg')
    dayMap.colorSpace = THREE.SRGBColorSpace
    const normalMap = loader.load('/textures/planets/earth_normal_2048.jpg')
    const specMap = loader.load('/textures/planets/earth_specular_2048.jpg')
    const cloudsMap = loader.load('/textures/planets/earth_clouds_1024.png')
    cloudsMap.colorSpace = THREE.SRGBColorSpace
    const moonMap = loader.load('/textures/planets/moon_1024.jpg')
    moonMap.colorSpace = THREE.SRGBColorSpace

    // Earth's own tilted orbital plane (like the other planets).
    const plane = new THREE.Group()
    plane.rotation.x = EARTH_INCLINE
    plane.rotation.z = EARTH_INCLINE * 0.6
    this.group.add(plane)

    // A pivot at the sun that we rotate to orbit Earth; the Earth sits out at
    // its orbital radius inside it, with an axial tilt.
    const earthPivot = new THREE.Group()
    earthPivot.rotation.y = EARTH_ANGLE
    plane.add(earthPivot)
    this.earthPivot = earthPivot
    // Bright blue comet-tail + orbit ring — Earth is the star of the journey,
    // so its trail reads slightly stronger than the others.
    earthPivot.add(this.makeTrail(EARTH_DISTANCE, EARTH_COLOR, 1.9))
    plane.add(this.makeOrbitLine(EARTH_DISTANCE, EARTH_COLOR, 0.22))

    const earthGroup = new THREE.Group()
    earthGroup.position.set(EARTH_DISTANCE, 0, 0)
    earthGroup.rotation.z = THREE.MathUtils.degToRad(23.5) // axial tilt
    earthPivot.add(earthGroup)
    this.earthGroup = earthGroup

    // Earth surface. specMap as a metalnessMap makes oceans (bright in the
    // map) reflective while land stays matte.
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(this.earthRadius, 64, 64),
      new THREE.MeshStandardMaterial({
        map: dayMap,
        normalMap,
        metalnessMap: specMap,
        metalness: 0.5,
        roughness: 0.7,
      }),
    )
    earthGroup.add(this.earth)

    // Cloud layer, just above the surface.
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(this.earthRadius * 1.01, 64, 64),
      new THREE.MeshStandardMaterial({
        map: cloudsMap,
        transparent: true,
        depthWrite: false,
      }),
    )
    earthGroup.add(this.clouds)

    // Moon orbiting Earth.
    this.moonPivot = new THREE.Group()
    earthGroup.add(this.moonPivot)
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(this.earthRadius * 0.27, 32, 32),
      new THREE.MeshStandardMaterial({ map: moonMap, roughness: 1 }),
    )
    moon.position.x = this.earthRadius * 3.2
    this.moonPivot.add(moon)
  }

  update() {
    const delta = this.experience.time.delta * 0.001

    for (const { pivot, mesh, cfg } of this.orbits) {
      pivot.rotation.y += cfg.orbitSpeed * delta
      mesh.rotation.y += cfg.spinSpeed * delta
    }

    this.earthPivot.rotation.y += EARTH_ORBIT_SPEED * delta // orbit the sun
    this.earth.rotation.y += 0.05 * delta // spin on its axis
    this.clouds.rotation.y += 0.07 * delta
    this.moonPivot.rotation.y += 0.3 * delta
  }
}
