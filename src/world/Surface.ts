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
const HERO_FILE = 'adarsh-thapa-house.glb'

// The ship's flight over the colony (relative to SURFACE_ORIGIN).
const ROAD_START_Z = 96
const ROAD_HOME_Z = HERO_OFFSET.z + 10 // arrives right over the house
const SHIP_FLY_Y = 26 // ship cruises above the rooftops

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

  // Warm haze for the surface. Navigation switches it on only on the surface
  // stage (so it never fogs the solar system).
  fog = new THREE.Fog('#e0d6c2', 80, 460)

  private clouds: THREE.Group | null = null
  private gateLeft: THREE.Group | null = null
  private gateRight: THREE.Group | null = null
  private surfaceShip: THREE.Group | null = null
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
  createSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          // Muted blue up high fading to a warm hazy horizon — golden-hour feel.
          uTop: { value: new THREE.Color('#33506f') },
          uBottom: { value: new THREE.Color('#e8dcc4') },
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
          transparent: true,
          opacity: 0.38,
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
    // Cooler sky fill + warm ground bounce, kept low for a moodier feel.
    const hemi = new THREE.HemisphereLight('#dfe2e8', '#4a4030', 0.7)
    hemi.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(0, 50, 0))
    this.group.add(hemi)

    // Warm, low golden-hour sun that casts shadows across the colony.
    const sun = new THREE.DirectionalLight('#ffce8a', 2.8)
    sun.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(60, 55, 40))
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

  // ---- The society -------------------------------------------------------

  private createSociety() {
    const models = this.experience.resources.models
    this.createStreet()
    this.placeHouses(models)
    this.placeLandmark(models)
    this.placeHorseScene(models)
    this.placeVehicles(models)
    this.scatterNature(models)
    this.placeStreetProps(models)
    this.createGate()
    this.createSpaceship()
    this.createEntranceBoard()
    this.placeNames()
  }

  // The spaceship that carries you over the colony to your house.
  private createSpaceship() {
    const source = this.experience.resources.models['SpaceShip.glb']
    if (!source) return
    const ship = source.clone(true)
    const box = new THREE.Box3().setFromObject(ship)
    const size = box.getSize(new THREE.Vector3())
    ship.scale.setScalar(11 / (Math.max(size.x, size.z) || 1))
    ship.rotation.y = Math.PI // nose pointing down the street (-Z)
    ship.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(0, SHIP_FLY_Y, ROAD_START_Z))
    this.group.add(ship)
    this.surfaceShip = ship
  }

  // Flies the ship from the colony entrance over to the house for eased
  // surface-stage progress easedT (0..1). Returns its world position so the
  // camera can follow just behind it. It drops out of the clouds at the start.
  flyShip(easedT: number): THREE.Vector3 | null {
    const ship = this.surfaceShip
    if (!ship) return null
    const drop = THREE.MathUtils.clamp(easedT / 0.1, 0, 1) // fall out of the clouds
    const wf = THREE.MathUtils.clamp((easedT - 0.1) / 0.9, 0, 1) // cruise across
    const land = this.smootherstep((easedT - 0.82) / 0.18) // touch down at the end

    const z = SURFACE_ORIGIN.z + THREE.MathUtils.lerp(ROAD_START_Z, ROAD_HOME_Z, wf)
    const cruiseY = SHIP_FLY_Y + (1 - drop) * 55
    // Cruise above the rooftops, then descend to land in front of the house.
    const y = SURFACE_ORIGIN.y + THREE.MathUtils.lerp(cruiseY, 3.5, land)
    const pos = new THREE.Vector3(SURFACE_ORIGIN.x, y, z)
    ship.position.copy(pos)
    return pos
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
    texture.anisotropy = 4
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
    const pool = [
      'Fantasy House.glb', 'Fantasy House-2.glb', 'Fantasy Inn.glb', 'House-2.glb',
      'House-3.glb', 'House-4.glb', 'House-5.glb', 'Fantasy Sawmill.glb',
      'Fantasy Stable.glb', 'Cottage.glb', 'Farm house.glb', 'Barn.glb', 'Barn-2.glb',
    ]
    const columns = [
      { x: -19, rot: Math.PI / 2 }, // left inner, faces the main street
      { x: -49, rot: -Math.PI / 2 }, // left outer, faces the back street
      { x: 19, rot: -Math.PI / 2 }, // right inner
      { x: 49, rot: Math.PI / 2 }, // right outer
    ]
    const rows = [84, 66, 48, 22, 4, -14, -40, -58]

    let i = 0
    for (const col of columns) {
      for (const z of rows) {
        const file = pool[i % pool.length]
        i++
        if (models[file]) this.placeModel(models[file], col.x, z, col.rot, 16, 'footprint')
      }
    }

    // Your house at the head of the street, facing back toward the camera.
    const hero = models[HERO_FILE]
    if (hero) this.placeModel(hero, HERO_OFFSET.x, HERO_OFFSET.z, 0, 24, 'footprint')
  }

  // The lighthouse stands tall behind the hero house as a landmark.
  private placeLandmark(models: Record<string, THREE.Group>) {
    const lighthouse = models['Light House.glb']
    if (lighthouse) this.placeModel(lighthouse, 36, -104, 0, 38, 'height')
  }

  // A horse-drawn carriage parked off the road, plus a horse by the trough.
  private placeHorseScene(models: Record<string, THREE.Group>) {
    if (models['carriage.glb']) this.placeModel(models['carriage.glb'], -15, 30, Math.PI, 8, 'footprint')
    if (models['Horse.glb']) this.placeModel(models['Horse.glb'], -15, 22, Math.PI, 5, 'height')

    // A second horse drinking by the stable's water trough.
    if (models['Wood Water Trough.glb']) this.placeModel(models['Wood Water Trough.glb'], 16, 42, 0, 4, 'footprint')
    if (models['Horse.glb']) this.placeModel(models['Horse.glb'], 19, 42, -Math.PI / 2, 5, 'height')
  }

  // Vintage cars parked on the frontage (off the road) beside the houses.
  private placeVehicles(models: Record<string, THREE.Group>) {
    const park: [string, number, number, number][] = [
      ['Old Car.glb', 15, HERO_OFFSET.z + 20, Math.PI], // beside your house
      ['1972 Bursley Defiance.glb', -15, 52, 0],
      ['Buggy.glb', 15, -22, Math.PI],
      ['Police Car.glb', -15, -44, 0],
      ['Old Truck.glb', 15, 6, Math.PI],
    ]
    for (const [file, x, z, rot] of park) {
      if (models[file]) this.placeModel(models[file], x, z, rot, 6, 'footprint')
    }
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

  // Gas lamp posts line the edges of the main street and the back streets.
  private placeStreetProps(models: Record<string, THREE.Group>) {
    const lamp = models['Lamp Post.glb']
    if (!lamp) return
    for (const z of [80, 56, 32, 8, -16, -40, -64, -88]) {
      this.placeModel(lamp, -9.5, z, Math.PI / 2, 6, 'height')
      this.placeModel(lamp, 9.5, z, -Math.PI / 2, 6, 'height')
    }
  }

  private createStreet() {
    const loader = this.experience.resources.textureLoader
    const G = '/textures/ground/'

    // Textured cobblestone for the MAIN street (the clean walking path).
    const tile = (texture: THREE.Texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(3, 46)
      return texture
    }
    const diff = tile(loader.load(G + 'cobblestone_diff.jpg'))
    diff.colorSpace = THREE.SRGBColorSpace
    const normal = tile(loader.load(G + 'cobblestone_nor_gl.jpg'))
    const rough = tile(loader.load(G + 'cobblestone_rough.jpg'))

    const main = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 250),
      new THREE.MeshStandardMaterial({
        map: diff,
        normalMap: normal,
        roughnessMap: rough,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    )
    main.rotation.x = -Math.PI / 2
    main.position.copy(SURFACE_ORIGIN).add(new THREE.Vector3(0, 0.15, -16))
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
    this.group.add(model)
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
