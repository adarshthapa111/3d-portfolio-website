import * as THREE from 'three'
import Experience from '../core/Experience'
import { surfaceT } from './stages'
import { quality } from '../utils/quality'

// STAGE 2 of the journey: the planet surface — a little society of houses
// along a street, with YOUR house (the one with a driveway) at the far end.
//
// This is built far below the solar system (at SURFACE_ORIGIN) so the two
// scenes never overlap — that's how we sidestep the impossible scale gap
// between "planets" and "houses". The camera teleports here during the cloud
// whiteout (see Navigation.ts), so the jump is invisible.
export const SURFACE_ORIGIN = new THREE.Vector3(0, -1000, 0)

// Where the hero house sits, relative to SURFACE_ORIGIN (street runs along -Z).
export const HERO_OFFSET = new THREE.Vector3(0, 0, -84)
const HERO_FILE = 'new_adarshthapahouse.glb'

// The ship's flight over the colony (relative to SURFACE_ORIGIN).
export const ROAD_START_Z = 96

// Where the moon hangs (relative to SURFACE_ORIGIN): far away and high, well
// clear of the rooftops, so it reads as a small moon IN THE SKY (a real moon
// only spans ~0.5° of your view) while staying inside the 600-radius sky dome.
export const MOON_OFFSET = new THREE.Vector3(-130, 210, -480)

// Family names for the houses along the main street (Adarsh's is the hero).
const FAMILY_NAMES: [number, number, string][] = [
  [-19, 66, 'Sabitra Thapa'],
  [19, 48, 'P. Thapa'],
  [-19, 22, 'Aishwarya Thapa'],
  [19, 4, 'Sandeep Thapa'],
  [-19, -14, 'Lil Bahadur Thapa'],
  [19, -40, 'Sangita Thapa'],
]

export default class Surface {
  experience: Experience
  scene: THREE.Scene
  group = new THREE.Group() // all surface objects, so we can hide the scene

  // Near-black night haze matching the sky, so distant houses fade straight
  // into the dark horizon. Navigation switches it on only on the surface stage.
  fog = new THREE.Fog('#0c0c15', 70, 420)

  private clouds: THREE.Group | null = null
  private gateLeft: THREE.Group | null = null
  private gateRight: THREE.Group | null = null
  private labels: THREE.Mesh[] = []
  private sun: THREE.DirectionalLight | null = null
  private shadowPrimed = false

  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.scene.add(this.group)

    this.createSky()
    this.createGround()
    this.createLights()
    this.createClouds()

    // The society is built once the models finish loading.
    const resources = this.experience.resources
    if (Object.keys(resources.models).length) this.createSociety()
    else resources.on('ready', () => this.createSociety())
  }

  // A large inward-facing dome with a vertical colour gradient (sky -> horizon).
  // At night this is a deep navy fading to a faint moonlit horizon; the point
  // stars (createStars) and the moon sit on top of it.
  createSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          // Near-black (#0b0b12 family, matching space) with the faintest lift
          // at the horizon so rooftops still silhouette against the sky.
          uTop: { value: new THREE.Color('#040409') },
          uBottom: { value: new THREE.Color('#0e0e18') },
          uOffset: { value: SURFACE_ORIGIN.y },
        },
        vertexShader: /* glsl */ `
          varying float vHeight;
          uniform float uOffset;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vHeight = worldPos.y - uOffset;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vHeight;
          uniform vec3 uTop;
          uniform vec3 uBottom;
          void main() {
            float t = clamp(vHeight / 600.0, 0.0, 1.0);
            gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    )
    sky.position.copy(SURFACE_ORIGIN)
    sky.renderOrder = -2 // draw behind everything else in the scene
    this.group.add(sky)
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshStandardMaterial({ color: '#5a7a3f', roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.copy(SURFACE_ORIGIN)
    ground.receiveShadow = true
    this.group.add(ground)
  }

  // A field of soft cloud puffs high above the ground. The camera starts up
  // among them and descends through, so you "emerge from the clouds".
  createClouds() {
    const texture = this.makeCloudTexture()
    const group = new THREE.Group()
    const count = quality.cloudCount

    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: '#2b3a5e', // dim, cool night clouds
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      )
      const scale = 26 + Math.random() * 34
      sprite.scale.set(scale, scale * 0.6, 1)
      sprite.position.set(
        (Math.random() - 0.5) * 220,
        70 + Math.random() * 60, // a high, thin band well above the flight path
        (Math.random() - 0.5) * 220,
      )
      group.add(sprite)
    }

    group.position.copy(SURFACE_ORIGIN)
    this.group.add(group)
    this.clouds = group
  }

  // Draw a soft round white blob on a canvas and use it as a texture — a
  // cheap, asset-free way to make fluffy clouds.
  private makeCloudTexture() {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  createLights() {
    // Dim, cool moonlit sky fill with a near-black ground bounce.
    const hemi = new THREE.HemisphereLight('#2b3a5c', '#080a12', 0.35)
    hemi.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(0, 50, 0))
    this.group.add(hemi)

    // Cool moon casting soft shadows across the sleeping colony. Lit from the
    // same direction the visible moon sits (see createNightSky).
    const sun = new THREE.DirectionalLight('#9fb4e6', 1.1)
    sun.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(40, 85, -70))
    sun.target.position.copy(SURFACE_ORIGIN)
    this.group.add(sun.target)
    sun.castShadow = quality.shadows
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0004
    const cam = sun.shadow.camera
    cam.near = 1
    cam.far = 260
    cam.left = -95
    cam.right = 95
    cam.top = 130
    cam.bottom = -130
    // The colony is static, so render the shadow map ONCE (primed in update)
    // instead of every frame.
    sun.shadow.autoUpdate = false
    this.sun = sun
    this.group.add(sun)
  }

  // A detailed moon, framed above the far end of the street so it stays in
  // view during the level walk (no glow halo). The real lunar photo gives the
  // craters + maria; a bump map (same image) adds relief the moonlight rakes
  // across; a low emissive keeps the shadowed side readable (earthshine).
  private createMoon() {
    const loader = this.experience.resources.textureLoader
    const moonColor = loader.load('/textures/planets/moon_1024.jpg')
    moonColor.colorSpace = THREE.SRGBColorSpace
    const moonBump = loader.load('/textures/planets/moon_1024.jpg') // linear, for relief

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(11, 64, 64),
      new THREE.MeshStandardMaterial({
        map: moonColor,
        bumpMap: moonBump,
        bumpScale: 0.7,
        emissive: new THREE.Color('#8b97b8'),
        emissiveMap: moonColor,
        emissiveIntensity: 0.42,
        roughness: 1,
        metalness: 0,
        fog: false,
      }),
    )
    moon.position.copy(SURFACE_ORIGIN).add(MOON_OFFSET)
    moon.rotation.y = -0.7 // turn a nicer, maria-rich face toward the camera
    this.group.add(moon)
  }

  // A field of bright point-stars filling the sky above the colony. The dome
  // texture alone is too faint, so these guarantee a genuinely starry night.
  private createStars() {
    const count = 1600
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const r = 380 + Math.random() * 150
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random()) // upper hemisphere only (never underground)
      positions[i * 3] = SURFACE_ORIGIN.x + r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = SURFACE_ORIGIN.y + 15 + r * Math.cos(phi)
      positions[i * 3 + 2] = SURFACE_ORIGIN.z + r * Math.sin(phi) * Math.sin(theta)
      // Mostly white, with a scatter of cool-blue and warm-gold stars.
      color.setHSL(Math.random() < 0.5 ? 0.6 : 0.09, 0.3, 0.75 + Math.random() * 0.25)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 2.2,
        sizeAttenuation: false, // constant pixel size -> crisp, always-visible stars
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        fog: false,
      }),
    )
    this.group.add(stars)
  }

  // ---- The society -------------------------------------------------------

  private createSociety() {
    const models = this.experience.resources.models
    this.createMoon()
    this.createStars()
    this.createStreet()
    this.placeHouses(models)
    this.scatterNature(models)
    this.placeStreetProps(models)
    this.createGate()
    this.createEntranceBoard()
    this.placeNames()
  }

  // A big "Thapa Colony" board on posts over the colony entrance.
  private createEntranceBoard() {
    const z = SURFACE_ORIGIN.z + ROAD_START_Z - 2
    const wood = new THREE.MeshStandardMaterial({ color: '#4a3420', roughness: 0.8 })

    // Two tall posts either side of the road.
    const postGeo = new THREE.BoxGeometry(1, 14, 1)
    for (const sx of [-12, 12]) {
      const post = new THREE.Mesh(postGeo, wood)
      post.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(sx, 7, z))
      this.group.add(post)
    }

    // The board itself, with the name painted on a canvas texture.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(26, 5, 0.6),
      new THREE.MeshStandardMaterial({ map: this.makeSignTexture('THAPA COLONY', true), roughness: 0.7 }),
    )
    board.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(0, 13, z))
    this.group.add(board)
  }

  // Floating name signs above each family's house.
  private placeNames() {
    for (const [x, z, name] of FAMILY_NAMES) this.addLabel(x, z, 15, name, false)
    this.addLabel(HERO_OFFSET.x, HERO_OFFSET.z, 30, 'Adarsh Thapa', true)
  }

  private addLabel(x: number, z: number, y: number, text: string, hero: boolean) {
    const aspect = 640 / 200
    const height = hero ? 4 : 2.8
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(height * aspect, height),
      new THREE.MeshBasicMaterial({ map: this.makeSignTexture(text, hero), transparent: true }),
    )
    label.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(x, y, z))
    this.group.add(label)
    this.labels.push(label)
  }

  // Draw a name onto a canvas (a wooden plaque) and return it as a texture.
  private makeSignTexture(text: string, hero: boolean) {
    const W = 640
    const H = 200
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = hero ? 'rgba(38,26,12,0.95)' : 'rgba(30,24,16,0.88)'
    ctx.beginPath()
    ctx.roundRect(8, 40, W - 16, H - 80, 20)
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = hero ? '#f0c46a' : '#caa96f'
    ctx.stroke()

    ctx.fillStyle = hero ? '#ffe4a8' : '#f2e7d0'
    ctx.font = `700 ${hero ? 82 : 60}px Georgia, "Times New Roman", serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, W / 2, H / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 16
    return texture
  }

  // A wrought-iron gate in front of your house that swings open as you arrive.
  private createGate() {
    const z = SURFACE_ORIGIN.z + HERO_OFFSET.z + 16
    const x = SURFACE_ORIGIN.x
    const y = SURFACE_ORIGIN.y
    const iron = new THREE.MeshStandardMaterial({ color: '#2b2b30', metalness: 0.85, roughness: 0.4 })

    const pillarGeo = new THREE.BoxGeometry(0.7, 5, 0.7)
    for (const sx of [-5, 5]) {
      const pillar = new THREE.Mesh(pillarGeo, iron)
      pillar.position.set(x + sx, y + 2.5, z)
      this.group.add(pillar)
    }

    // Each panel is parented to a pivot at its pillar so it swings like a hinge.
    const makePanel = (hingeX: number, dir: number) => {
      const pivot = new THREE.Group()
      pivot.position.set(x + hingeX, y, z)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.4, 0.18), iron)
      panel.position.set(dir * 2.3, 1.9, 0)
      pivot.add(panel)
      this.group.add(pivot)
      return pivot
    }
    this.gateLeft = makePanel(-5, 1)
    this.gateRight = makePanel(5, -1)
  }

  private smootherstep(t: number) {
    const x = THREE.MathUtils.clamp(t, 0, 1)
    return x * x * x * (x * (x * 6 - 15) + 10)
  }

  private placeHouses(models: Record<string, THREE.Group>) {
    // A multi-block colony: four columns of homes (an inner + outer row on each
    // side of the main street), cycling through all the house models. The main
    // street down the middle stays completely clear for the walk home.
    // Per-model config: each house gets a hand-tuned target HEIGHT (so they line
    // up at a consistent roofline instead of auto-scaling to wildly different
    // sizes) and a `face` offset that turns its authored front toward the road.
    // The broken low-poly spike and the oversized "modern_home" scene are dropped.
    // `face` corrects each model's authored front to point toward the road.
    // modern_house's garage door is on its -Z side, so it needs a half turn;
    // the other two present their facade along Z already. If any model still
    // looks backward, flip its `face` between 0 and Math.PI.
    // `grill` = this model is a single flat mesh (can't be multi-toned), so we
    // bolt a procedural metal grill/railing across its front to add parts+colour.
    const HOUSES: { file: string; height: number; face: number; grill?: boolean }[] = [
      { file: 'modern_house.glb', height: 11, face: Math.PI },
      { file: 'modern_house-2.glb', height: 12, face: 0, grill: true },
      { file: 'vianney_house_2.glb', height: 12, face: 0 },
    ]
    const columns = [
      { x: -19, rot: Math.PI / 2 }, // left inner  -> faces +X (road)
      { x: -49, rot: Math.PI / 2 }, // left outer  -> faces +X (road)
      { x: 19, rot: -Math.PI / 2 }, // right inner -> faces -X (road)
      { x: 49, rot: -Math.PI / 2 }, // right outer -> faces -X (road)
    ]
    const rows = [84, 66, 48, 22, 4, -14, -40, -58]

    // A warm, cohesive colony palette — clay, sand, ochre, sage, dusty blue,
    // brick, cream — for each house's WALLS. Assigned so neighbours don't repeat.
    const PALETTE = ['#c06a48', '#d8b487', '#b98a3e', '#8f9e70', '#7f96a3', '#a9533f', '#e3d3b6']
    // Accent colours painted onto the other parts — garage doors, grills,
    // ladders, ceiling beams, railings and trim — so each house is multi-tone.
    const ACCENTS = ['#e8e2d4', '#39424b', '#4f7d78', '#b06a3f', '#6b7f8c', '#c9a24e']
    let i = 0
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c]
      for (let r = 0; r < rows.length; r++) {
        const h = HOUSES[i % HOUSES.length]
        const primary = PALETTE[(i + c) % PALETTE.length]
        // Rotate the accent order per house so the mixture varies down the street.
        const accents = ACCENTS.map((_, k) => ACCENTS[(k + i) % ACCENTS.length])
        i++
        const src = models[h.file]
        if (src) {
          this.placeModel(src, col.x, rows[r], col.rot + h.face, h.height, 'height', true, [
            primary,
            ...accents,
          ])
          // Plain single-mesh houses get a real grill fence across their front.
          if (h.grill) this.addFrontGrill(col.x, rows[r], accents)
        }
      }
    }

    // Your house at the head of the street. Its front facade (the staircases /
    // entrance) is on the model's +Z side, which already faces the approaching
    // camera, so no rotation is needed.
    const hero = models[HERO_FILE]
    if (hero) this.placeModel(hero, HERO_OFFSET.x, HERO_OFFSET.z, 0, 28, 'footprint')
  }


  private scatterNature(models: Record<string, THREE.Group>) {
    const trees = ['Tree.glb', 'Maple Trees.glb', 'Twisted Tree.glb']
    const small = ['Bush.glb', 'Rose bush.glb', 'Rocks.glb', 'Dandelions.glb']

    // Trees fill the colony's edges — kept well clear of the walking path.
    for (let i = 0; i < quality.treeCount; i++) {
      const file = trees[Math.floor(Math.random() * trees.length)]
      if (!models[file]) continue
      const side = Math.random() < 0.5 ? -1 : 1
      const x = side * (62 + Math.random() * 26) // beyond the outer house row
      const z = -120 + Math.random() * 230
      this.placeModel(models[file], x, z, Math.random() * Math.PI * 2, 8 + Math.random() * 6, 'height')
    }

    // Bushes / rocks / dandelions in the yards between the house rows — never
    // in the road corridors (|x| < 17 is kept empty).
    for (let i = 0; i < quality.scatterCount; i++) {
      const file = small[Math.floor(Math.random() * small.length)]
      if (!models[file]) continue
      const side = Math.random() < 0.5 ? -1 : 1
      const x = side * (24 + Math.random() * 40)
      const z = -120 + Math.random() * 230
      this.placeModel(models[file], x, z, Math.random() * Math.PI * 2, 1.5 + Math.random() * 2, 'height', false)
    }
  }

  // Street lights lining both kerbs of the main avenue — each one glows at night.
  private placeStreetProps(models: Record<string, THREE.Group>) {
    const lamp = models['street_light.glb']
    if (!lamp) return
    const glow = this.makeCloudTexture() // shared radial texture for the halos
    for (const z of [80, 56, 32, 8, -16, -40, -64, -88]) {
      this.placeModel(lamp, -9.5, z, Math.PI / 2, 7, 'height')
      this.placeModel(lamp, 9.5, z, -Math.PI / 2, 7, 'height')
      this.addLampGlow(-9.5, z, glow)
      this.addLampGlow(9.5, z, glow)
    }

    // Real cast light is EXPENSIVE (every point light adds per-pixel cost to
    // the whole colony), so instead of one per lamp we share a few pools of
    // warm light down the centre of the road. The bulbs + halos above carry
    // the "every lamp glows" look.
    if (quality.tier === 'high') {
      for (const z of [68, 20, -28, -76]) {
        const light = new THREE.PointLight('#ffcf87', 30, 42, 2)
        light.position.set(SURFACE_ORIGIN.x, SURFACE_ORIGIN.y + 6.5, SURFACE_ORIGIN.z + z)
        this.group.add(light)
      }
    }
  }

  // Make a lamp glow: a bright bulb + an additive halo (no per-lamp light).
  private addLampGlow(x: number, z: number, glowTex: THREE.Texture) {
    const roadDir = x < 0 ? 1 : -1 // the lamp head overhangs toward the road
    const gx = SURFACE_ORIGIN.x + x + roadDir * 1.2
    const cz = SURFACE_ORIGIN.z + z
    const gy = SURFACE_ORIGIN.y + 6.3 // near the top of a ~7-tall lamp

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#fff2d0', fog: false }),
    )
    bulb.position.set(gx, gy, cz)
    this.group.add(bulb)

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: '#ffcf87',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
        fog: false,
      }),
    )
    halo.scale.set(5, 5, 1)
    halo.position.set(gx, gy, cz)
    this.group.add(halo)
  }

  private createStreet() {
    const loader = this.experience.resources.textureLoader
    const G = '/textures/ground/'

    // Clean tiled cobblestone for the MAIN street. Max anisotropic filtering
    // keeps the stones crisp all the way down the road instead of blurring to
    // mush in the distance (the biggest sharpness win for a walked street).
    const maxAniso = this.experience.renderer.instance.capabilities.getMaxAnisotropy()
    const tile = (texture: THREE.Texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(3, 46)
      texture.anisotropy = maxAniso
      return texture
    }
    const diff = tile(loader.load(G + 'cobblestone_diff.jpg'))
    diff.colorSpace = THREE.SRGBColorSpace
    const normal = tile(loader.load(G + 'cobblestone_nor_gl.jpg'))
    const rough = tile(loader.load(G + 'cobblestone_rough.jpg'))
    const main = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 260),
      new THREE.MeshStandardMaterial({
        map: diff,
        normalMap: normal,
        roughnessMap: rough,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    )
    main.rotation.x = -Math.PI / 2
    main.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(0, 0.15, -30))
    main.receiveShadow = true
    this.group.add(main)

    // Secondary roads (back streets + cross streets) use a plain stone colour.
    // Each layer sits at a DISTINCT height (and uses polygon offset) so the
    // overlapping planes never z-fight into shimmering "noise" from above.
    const stone = new THREE.MeshStandardMaterial({
      color: '#3b3a37',
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
    const addRoad = (xSize: number, zSize: number, cx: number, cz: number, y: number) => {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(xSize, zSize), stone)
      road.rotation.x = -Math.PI / 2
      road.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(cx, y, cz))
      this.group.add(road)
    }
    addRoad(9, 250, -34, -16, 0.08) // left back street
    addRoad(9, 250, 34, -16, 0.08) // right back street
    // Cross streets sit slightly higher again so intersections don't fight.
    for (const cz of [92, 56, 30, 8, -24, -46, -72]) addRoad(80, 9, 0, cz, 0.05)
  }

  // Clone a model, scale it to a target size (by footprint or height), face it
  // rotationY, and sit it on the ground at (x, z) relative to SURFACE_ORIGIN.
  // Cloning shares geometry/materials, so many copies stay cheap.
  private placeModel(
    source: THREE.Group,
    x: number,
    z: number,
    rotationY: number,
    target: number,
    mode: 'footprint' | 'height',
    cast = true,
    tint?: string | string[],
  ) {
    const model = source.clone(true)
    model.rotation.y = rotationY

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const metric = mode === 'height' ? size.y : Math.max(size.x, size.z)
    model.scale.setScalar(target / (metric || 1))

    // Re-measure after scaling to centre it and sit it on the ground.
    const scaledBox = new THREE.Box3().setFromObject(model)
    const center = scaledBox.getCenter(new THREE.Vector3())
    model.position.x += SURFACE_ORIGIN.x + x - center.x
    model.position.z += SURFACE_ORIGIN.z + z - center.z
    model.position.y += SURFACE_ORIGIN.y - scaledBox.min.y

    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = cast
        mesh.receiveShadow = true
      }
    })

    if (tint) this.repaint(model, Array.isArray(tint) ? tint : [tint])
    this.group.add(model)
  }

  // Repaint a model in multiple colours. The MOST-used material (the walls /
  // roof) takes the primary colour; every other opaque material (garage door,
  // grills, ladder, ceiling beams, railings, trim…) cycles through the accent
  // colours — so the house reads as a real, multi-tone painted building. Glass
  // is left untouched so windows stay glassy. Each source material is cloned
  // once and shared, so this stays cheap across dozens of houses.
  private repaint(model: THREE.Object3D, colors: string[]) {
    const isGlass = (m: THREE.Material) =>
      m.transparent || (m as THREE.MeshStandardMaterial).opacity < 1 || /glass|vitre|verre/i.test(m.name)

    const usage = new Map<THREE.Material, number>()
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) if (m && !isGlass(m)) usage.set(m, (usage.get(m) ?? 0) + 1)
    })

    const accents = colors.length > 1 ? colors.slice(1) : colors
    const ranked = [...usage.keys()].sort((a, b) => (usage.get(b) ?? 0) - (usage.get(a) ?? 0))
    const colorFor = new Map<THREE.Material, THREE.Color>()
    ranked.forEach((m, i) => {
      const hex = i === 0 ? colors[0] : accents[(i - 1) % accents.length]
      colorFor.set(m, new THREE.Color(hex))
    })

    const clones = new Map<THREE.Material, THREE.Material>()
    const paint = (m: THREE.Material) => {
      if (!colorFor.has(m)) return m // glass / unmatched -> leave as-is
      let c = clones.get(m)
      if (!c) {
        c = (m as THREE.MeshStandardMaterial).clone()
        ;(c as THREE.MeshStandardMaterial).color.copy(colorFor.get(m)!)
        clones.set(m, c)
      }
      return c
    }
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(paint) : paint(mesh.material)
    })
  }

  // Build a metal grill / railing fence across a house's road-facing front,
  // with dark balusters, a coloured top & bottom rail and accent end-posts.
  // Used for the plain single-mesh house so it gains grills + extra colour.
  private addFrontGrill(centerX: number, z: number, accents: string[]) {
    const roadDir = centerX < 0 ? 1 : -1 // toward the road (x = 0)
    const gx = SURFACE_ORIGIN.x + centerX + roadDir * 6.5
    const gz = SURFACE_ORIGIN.z + z
    const gy = SURFACE_ORIGIN.y
    const span = 14
    const H = 3.2

    const barMat = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.5, metalness: 0.6 })
    const railMat = new THREE.MeshStandardMaterial({ color: accents[0] ?? '#c9a24e', roughness: 0.6, metalness: 0.25 })
    const postMat = new THREE.MeshStandardMaterial({ color: accents[1] ?? '#4f7d78', roughness: 0.7, metalness: 0.2 })

    const group = new THREE.Group()

    // Vertical balusters (shared geometry so the whole fence is one cheap set).
    const barGeo = new THREE.BoxGeometry(0.12, H, 0.12)
    const count = Math.round(span / 0.85)
    for (let k = 0; k <= count; k++) {
      const bar = new THREE.Mesh(barGeo, barMat)
      bar.position.set(gx, gy + H / 2, gz - span / 2 + (k / count) * span)
      bar.castShadow = true
      group.add(bar)
    }

    // Top (accent) and bottom (metal) rails running the length of the fence.
    const railGeo = new THREE.BoxGeometry(0.18, 0.18, span)
    const top = new THREE.Mesh(railGeo, railMat)
    top.position.set(gx, gy + H - 0.25, gz)
    const bottom = new THREE.Mesh(railGeo, barMat)
    bottom.position.set(gx, gy + 0.3, gz)
    group.add(top, bottom)

    // Chunkier accent end-posts.
    const postGeo = new THREE.BoxGeometry(0.34, H + 0.5, 0.34)
    for (const pz of [gz - span / 2, gz + span / 2]) {
      const post = new THREE.Mesh(postGeo, postMat)
      post.position.set(gx, gy + (H + 0.5) / 2, pz)
      post.castShadow = true
      group.add(post)
    }

    this.group.add(group)
  }

  update() {
    const delta = this.experience.time.delta * 0.001
    if (this.clouds) this.clouds.rotation.y += 0.02 * delta // slow drift

    // Render the (static) colony shadow map once, now that we're on the surface
    // and everything's placed and settled.
    if (quality.shadows && !this.shadowPrimed && this.sun) {
      this.sun.shadow.needsUpdate = true
      this.shadowPrimed = true
    }

    // Name signs always face the camera so they stay readable.
    const cam = this.experience.camera.instance.position
    for (const label of this.labels) label.lookAt(cam)

    this.updateGate(this.experience.navigation.scrollProgress)
  }

  private updateGate(p: number) {
    if (!this.gateLeft || !this.gateRight) return
    const open = this.smootherstep((surfaceT(p) - 0.82) / 0.16) // swing open near arrival
    this.gateLeft.rotation.y = -open * Math.PI * 0.55
    this.gateRight.rotation.y = open * Math.PI * 0.55
  }
}
