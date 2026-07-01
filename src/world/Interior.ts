import * as THREE from 'three'
import Experience from '../core/Experience'
import { quality } from '../utils/quality'
import { SURFACE_END } from './stages'

// STAGE 3: inside the house — a central HUB (portrait + dining table) with
// three LOCKED doors branching in three directions:
//   ← Left  : Reading / work room (desk, computer, tech stack)
//   ↑ Front : Projects gallery
//   → Right : Bedroom
// Click a door to unlock it, swing it open and fly into that room; click again
// (anywhere) to return to the hub. The camera here is click-driven, not scroll.
export const INTERIOR_ORIGIN = new THREE.Vector3(0, -2000, 0)

const H = 14 // wall height
const HUB = 15 // hub half-size
const WING = 45 // far wall distance of each wing
const WH = 12 // wing half-width
const T = 0.4 // wall thickness
const DOOR_W = 8
const DOOR_H = 9

type Focus = 'hub' | 'reading' | 'projects' | 'bedroom'

interface DoorInfo {
  pivot: THREE.Group
  panel: THREE.Mesh
  lock: THREE.Group
  room: Focus
  openSign: number
  target: number // 0 closed, 1 open
}

interface ProjectInfo {
  title: string
  img: string
  url: string
}
const PROJECTS: ProjectInfo[] = [
  { title: 'Khana Aau', img: 'khana-aau.png', url: 'https://github.com/Adarsh2003Thapa' },
  { title: 'Hamro Furniture', img: 'hamro-furniture.png', url: 'https://github.com/Adarsh2003Thapa' },
  { title: 'Book My Room', img: 'book-my-room.png', url: 'https://github.com/Adarsh2003Thapa' },
]
const TECH = [
  'react', 'nextjs', 'typescript', 'javascript', 'tailwindcss',
  'nodejs', 'firebase', 'supabase', 'figma', 'html5', 'css3',
]

// Adarsh's favourite fighters, shown in the About Me room.
const FIGHTERS: { name: string; nick: string; flag: string; img: string }[] = [
  { name: 'Khabib', nick: 'The Eagle · 29-0', flag: '🇷🇺', img: 'khabib' },
  { name: 'Islam Makhachev', nick: 'The Dagestani', flag: '🇷🇺', img: 'islam' },
  { name: 'Conor McGregor', nick: 'The Notorious', flag: '🇮🇪', img: 'conor' },
  { name: 'Jon Jones', nick: 'Bones', flag: '🇺🇸', img: 'jonjones' },
  { name: 'Ilia Topuria', nick: 'El Matador', flag: '🇬🇪', img: 'ilia' },
]

const DOOR_LABELS: Record<'reading' | 'projects' | 'bedroom', string> = {
  reading: 'Skills',
  projects: 'Projects',
  bedroom: 'About Me',
}

// Fonts for the canvas-drawn labels (match the site: Fraunces display + Inter).
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif"
const SANS = "'Inter', system-ui, -apple-system, sans-serif"

// Camera position + lookAt for each ROOM (relative to INTERIOR_ORIGIN). The hub
// uses HUB_CAM and free mouse-look so you can turn to see all three doors.
const HUB_CAM = new THREE.Vector3(0, 7.5, 7)
const VIEWS: Record<'reading' | 'projects' | 'bedroom', { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  reading: { pos: new THREE.Vector3(-24, 7, 0), look: new THREE.Vector3(-45, 6, 0) },
  projects: { pos: new THREE.Vector3(0, 7, -17), look: new THREE.Vector3(0, 7, -42) },
  bedroom: { pos: new THREE.Vector3(24, 7, 0), look: new THREE.Vector3(45, 6, 0) },
}

export default class Interior {
  experience: Experience
  scene: THREE.Scene
  group = new THREE.Group()

  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2(0, 0)
  private clickable: THREE.Mesh[] = [] // project frames
  private doorTargets: THREE.Mesh[] = []
  private techTargets: THREE.Mesh[] = []
  private techIcons: THREE.Group[] = []
  private showcase: { group: THREE.Group; phase: number }[] = []
  private doors: DoorInfo[] = []
  private portrait: { group: THREE.Group; baseY: number } | null = null
  private hoveredProject: THREE.Mesh | null = null
  private spots: THREE.SpotLight[] = []
  private shadowPrimed = false
  private textRedraws: (() => void)[] = [] // re-run when web fonts finish loading

  private focus: Focus = 'hub'
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private camReady = false
  private hintEl: HTMLElement

  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.scene.add(this.group)

    this.hintEl = document.createElement('div')
    this.hintEl.className = 'room-hint'
    document.body.appendChild(this.hintEl)

    this.createShell()
    this.createLights()
    this.createDoors()
    this.createDoorSigns()
    this.createHub()
    this.createProjects()
    this.createTech()
    this.createAboutRoom()

    const resources = this.experience.resources
    if (Object.keys(resources.models).length) this.furnish()
    else resources.on('ready', () => this.furnish())

    window.addEventListener('pointermove', (e) => this.onPointerMove(e))
    window.addEventListener('click', () => this.onClick())

    // Re-draw all canvas labels once Fraunces/Inter have loaded (they aren't
    // ready at first paint, so the first draw falls back to a system font).
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this.textRedraws.forEach((r) => r()))
    }
  }

  // ---- Shell (floor, ceiling, hub walls, wing walls) ---------------------

  private box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(x, y, z))
    m.receiveShadow = true
    m.castShadow = true
    this.group.add(m)
    return m
  }

  private createShell() {
    const o = INTERIOR_ORIGIN

    const checker = this.makeCheckerTexture()
    checker.repeat.set(25, 25)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.55, metalness: 0.1 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.copy(o)
    floor.receiveShadow = true
    this.group.add(floor)

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 1 }),
    )
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.copy(o).add(new THREE.Vector3(0, H, 0))
    this.group.add(ceiling)

    const wall = new THREE.MeshStandardMaterial({ color: '#c8b79a', roughness: 1 })
    const seg = (2 * HUB - DOOR_W) / 2 // wall segment beside a doorway
    const off = DOOR_W / 2 + seg / 2 // its centre offset from the doorway
    const lintelY = DOOR_H + (H - DOOR_H) / 2

    // Hub back wall (solid — the side we arrive from).
    this.box(2 * HUB, H, T, 0, H / 2, HUB, wall)

    // Hub front wall (doorway -> projects), along X.
    this.box(seg, H, T, -off, H / 2, -HUB, wall)
    this.box(seg, H, T, off, H / 2, -HUB, wall)
    this.box(DOOR_W, H - DOOR_H, T, 0, lintelY, -HUB, wall)

    // Hub left wall (doorway -> reading) + right wall (-> bedroom), along Z.
    for (const sx of [-HUB, HUB]) {
      this.box(T, H, seg, sx, H / 2, -off, wall)
      this.box(T, H, seg, sx, H / 2, off, wall)
      this.box(T, H - DOOR_H, DOOR_W, sx, lintelY, 0, wall)
    }

    // Wing walls (far wall + two sides). Reading (-X), Projects (-Z), Bedroom (+X).
    const wingLen = WING - HUB
    const wingMid = (HUB + WING) / 2
    // Reading (-X)
    this.box(T, H, 2 * WH, -WING, H / 2, 0, wall)
    this.box(wingLen, H, T, -wingMid, H / 2, WH, wall)
    this.box(wingLen, H, T, -wingMid, H / 2, -WH, wall)
    // Projects (-Z)
    this.box(2 * WH, H, T, 0, H / 2, -WING, wall)
    this.box(T, H, wingLen, WH, H / 2, -wingMid, wall)
    this.box(T, H, wingLen, -WH, H / 2, -wingMid, wall)
    // Bedroom (+X)
    this.box(T, H, 2 * WH, WING, H / 2, 0, wall)
    this.box(wingLen, H, T, wingMid, H / 2, WH, wall)
    this.box(wingLen, H, T, wingMid, H / 2, -WH, wall)
  }

  private makeCheckerTexture() {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const h = size / 2
    ctx.fillStyle = '#e7d9bd'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#7c5334'
    ctx.fillRect(0, 0, h, h)
    ctx.fillRect(h, h, h, h)
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }

  // ---- Doors -------------------------------------------------------------

  private createDoors() {
    // Front (projects): hinge on the -X edge of the doorway, panel spans +X.
    this.addDoor(-DOOR_W / 2, -HUB, 'x', 'projects', -1)
    // Left (reading): hinge on the -Z edge, panel spans +Z.
    this.addDoor(-HUB, -DOOR_W / 2, 'z', 'reading', 1)
    // Right (bedroom): hinge on the +Z edge, panel spans -Z.
    this.addDoor(HUB, DOOR_W / 2, 'z', 'bedroom', -1)
  }

  private addDoor(hingeX: number, hingeZ: number, axis: 'x' | 'z', room: Focus, openSign: number) {
    const pivot = new THREE.Group()
    pivot.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(hingeX, 0, hingeZ))
    this.group.add(pivot)

    const doorMat = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.55, metalness: 0.15 })
    const geo =
      axis === 'x'
        ? new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.25)
        : new THREE.BoxGeometry(0.25, DOOR_H, DOOR_W)
    const panel = new THREE.Mesh(geo, doorMat)
    // Offset the panel so it fills the gap starting at the hinge.
    panel.position.set(axis === 'x' ? DOOR_W / 2 : 0, DOOR_H / 2, axis === 'z' ? DOOR_W / 2 : 0)
    panel.castShadow = true
    pivot.add(panel)
    this.doorTargets.push(panel)

    // A little brass padlock hanging on the door.
    const lock = new THREE.Group()
    const brass = new THREE.MeshStandardMaterial({ color: '#e8b64a', metalness: 0.9, roughness: 0.3 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), brass)
    lock.add(body)
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 16, Math.PI), brass)
    shackle.position.y = 0.5
    lock.add(shackle)
    lock.position.set(axis === 'x' ? DOOR_W - 0.8 : 0.35, DOOR_H / 2, axis === 'z' ? DOOR_W - 0.8 : 0)
    pivot.add(lock)

    const door: DoorInfo = { pivot, panel, lock, room, openSign, target: 0 }
    panel.userData.door = door
    this.doors.push(door)
  }

  // ---- Lights ------------------------------------------------------------

  private createLights() {
    const o = INTERIOR_ORIGIN
    this.group.add(new THREE.AmbientLight('#ffe9cf', 0.5))

    // A warm lamp in the hub and each wing.
    const lampSpots: [number, number][] = [
      [0, 2], [-30, 0], [0, -30], [30, 0],
    ]
    for (const [x, z] of lampSpots) {
      const lamp = new THREE.PointLight('#ffcf94', 45, 55, 2)
      lamp.position.copy(o).add(new THREE.Vector3(x, 12, z))
      this.group.add(lamp)
    }

    // Gallery spotlights on the projects far wall.
    for (const x of [-8, 0, 8]) {
      const spot = new THREE.SpotLight('#fff4e0', 90, 34, Math.PI / 7, 0.5, 1.5)
      spot.position.copy(o).add(new THREE.Vector3(x, 12, -33))
      spot.target.position.copy(o).add(new THREE.Vector3(x, 7, -45))
      spot.castShadow = quality.shadows
      spot.shadow.mapSize.set(1024, 1024)
      spot.shadow.bias = -0.0004
      spot.shadow.autoUpdate = false
      this.spots.push(spot)
      this.group.add(spot)
      this.group.add(spot.target)
    }
  }

  // ---- Hub content (portrait + dining table) -----------------------------

  private createHub() {
    const texture = this.experience.resources.textureLoader.load('/textures/photo/adarsh.png')
    texture.colorSpace = THREE.SRGBColorSpace
    const anchor = INTERIOR_ORIGIN.clone().add(new THREE.Vector3(-9, 0, -9))

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.9, 3, 24),
      new THREE.MeshStandardMaterial({ color: '#6b6258', roughness: 0.9 }),
    )
    pedestal.position.copy(anchor).add(new THREE.Vector3(0, 1.5, 0))
    this.group.add(pedestal)

    const portrait = new THREE.Group()
    const w = 4.4
    const depth = 0.6
    portrait.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(w + 1, w + 1, depth),
        new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.5, metalness: 0.25 }),
      ),
    )
    const backing = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w),
      new THREE.MeshStandardMaterial({ color: '#e2cba6', roughness: 1 }),
    )
    backing.position.z = depth / 2 + 0.01
    portrait.add(backing)
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, w * 0.92),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    )
    photo.position.z = depth / 2 + 0.02
    portrait.add(photo)
    portrait.position.copy(anchor).add(new THREE.Vector3(0, 6, 0))
    portrait.rotation.y = Math.PI * 0.25 // face into the hub
    this.group.add(portrait)
    this.portrait = { group: portrait, baseY: portrait.position.y }
  }

  // ---- Furniture (loaded models) ----------------------------------------

  private furnish() {
    // Hub: dining table + chairs.
    this.place('Bar Table.glb', 3, 3, 0, 4, 'footprint')
    this.place('Chair.glb', 3, 6, Math.PI, 2.6, 'footprint')
    this.place('Chair.glb', 3, 0, 0, 2.6, 'footprint')
    this.place('Chair.glb', 6, 3, -Math.PI / 2, 2.6, 'footprint')

    // Reading wing (-X): desk + computer, chair, bookcase.
    this.place('Desk.glb', -41, 0, Math.PI / 2, 7, 'footprint')
    this.place('Chair.glb', -36, 0, -Math.PI / 2, 2.6, 'footprint')
    this.place('Little Bookcase.glb', -41, 9, Math.PI / 2, 5, 'height')

    // Projects wing (-Z): a couch facing the hologram exhibits.
    this.place('Couch.glb', 0, -25, 0, 7, 'footprint')

    // About Me wing (+X): a comfy couch to sit and look at the fighter wall.
    this.place('Couch.glb', 26, 0, Math.PI / 2, 7, 'footprint')
  }

  private place(file: string, x: number, z: number, rotY: number, target: number, mode: 'footprint' | 'height') {
    const src = this.experience.resources.models[file]
    if (!src) return
    const m = src.clone(true)
    m.rotation.y = rotY
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    const metric = mode === 'height' ? size.y : Math.max(size.x, size.z)
    m.scale.setScalar(target / (metric || 1))
    const sb = new THREE.Box3().setFromObject(m)
    const c = sb.getCenter(new THREE.Vector3())
    m.position.x += INTERIOR_ORIGIN.x + x - c.x
    m.position.z += INTERIOR_ORIGIN.z + z - c.z
    m.position.y += INTERIOR_ORIGIN.y - sb.min.y
    m.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    this.group.add(m)
  }

  // ---- Projects (hologram exhibits) --------------------------------------

  private createProjects() {
    const loader = this.experience.resources.textureLoader
    const wallZ = -WING + 0.3

    // "MY WORK" header, stood clear of the wall (the accent-plane-on-wall was
    // the "noise" — it z-fought with the wall).
    const header = this.makeLabel('MY WORK', 2.4, 130)
    header.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(0, 11.4, wallZ + 0.2))
    this.group.add(header)

    // A patterned rug on the floor in front of the gallery.
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 18),
      new THREE.MeshStandardMaterial({ color: '#5a2a2a', roughness: 1 }),
    )
    rug.rotation.x = -Math.PI / 2
    rug.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(0, 0.02, -30))
    this.group.add(rug)
    const rugBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(15.2, 19.2),
      new THREE.MeshStandardMaterial({ color: '#caa24a', roughness: 1 }),
    )
    rugBorder.rotation.x = -Math.PI / 2
    rugBorder.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(0, 0.01, -30))
    this.group.add(rugBorder)

    // Each project is a floating hologram above a glowing pedestal.
    const cyan = '#39d0ff'
    const spots: [number, number][] = [
      [-9, -34],
      [0, -40],
      [9, -34],
    ]
    PROJECTS.forEach((project, i) => {
      const texture = loader.load('/textures/projects/' + project.img)
      texture.colorSpace = THREE.SRGBColorSpace
      const [x, z] = spots[i]
      const o = INTERIOR_ORIGIN

      // Pedestal.
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 2, 3, 28),
        new THREE.MeshStandardMaterial({ color: '#2a2f38', metalness: 0.6, roughness: 0.4 }),
      )
      pedestal.position.copy(o).add(new THREE.Vector3(x, 1.5, z))
      pedestal.castShadow = true
      pedestal.receiveShadow = true
      this.group.add(pedestal)

      // Glowing projector ring on top.
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.45, 0.12, 12, 32),
        new THREE.MeshStandardMaterial({ color: cyan, emissive: cyan, emissiveIntensity: 2.5, roughness: 0.4 }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.copy(o).add(new THREE.Vector3(x, 3.05, z))
      this.group.add(ring)

      // Translucent light beam rising to the hologram.
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 0.6, 5, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: cyan,
          transparent: true,
          opacity: 0.09,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      beam.position.copy(o).add(new THREE.Vector3(x, 5.8, z))
      this.group.add(beam)

      // The floating panel (screenshot) with a glowing edge.
      const panel = new THREE.Group()
      const w = 4.6
      const h = w * (1800 / 2880)
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(w + 0.5, h + 0.5),
        new THREE.MeshStandardMaterial({ color: '#0e2733', emissive: cyan, emissiveIntensity: 0.7, roughness: 0.5 }),
      )
      panel.add(edge)
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      )
      screen.position.z = 0.04
      screen.userData.url = project.url
      panel.add(screen)
      this.clickable.push(screen)
      panel.position.copy(o).add(new THREE.Vector3(x, 8, z))
      this.group.add(panel)
      this.showcase.push({ group: panel, phase: i * 2.1 })

      // Title plaque facing the camera on the pedestal front.
      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 1.1),
        new THREE.MeshBasicMaterial({ map: this.makeTitleTexture(project.title), transparent: true }),
      )
      plaque.position.copy(o).add(new THREE.Vector3(x, 1.7, z + 2.05))
      this.group.add(plaque)
    })
  }

  private makeTitleTexture(text: string, fontSize = 60) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const render = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, 512, 128)
      let fs = fontSize
      ctx.font = `700 ${fs}px ${SERIF}`
      while (ctx.measureText(text).width > 480 && fs > 12) {
        fs -= 2
        ctx.font = `700 ${fs}px ${SERIF}`
      }
      ctx.fillStyle = '#f0c46a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 256, 64)
      texture.needsUpdate = true
    }
    render()
    this.textRedraws.push(render)
    return texture
  }

  // A crisp gold text label whose canvas is sized to the text (so it never
  // clips or stretches). Returns a mesh whose width follows the text.
  private makeLabel(text: string, worldHeight: number, fontPx = 110) {
    const canvas = document.createElement('canvas')
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    )
    const render = () => {
      let ctx = canvas.getContext('2d')!
      ctx.font = `700 ${fontPx}px ${SERIF}`
      const textW = Math.ceil(ctx.measureText(text).width)
      canvas.width = textW + fontPx
      canvas.height = Math.round(fontPx * 1.8)
      ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#f0c46a'
      ctx.font = `700 ${fontPx}px ${SERIF}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, canvas.width / 2, canvas.height / 2)
      texture.needsUpdate = true
      mesh.geometry.dispose()
      mesh.geometry = new THREE.PlaneGeometry((worldHeight * canvas.width) / canvas.height, worldHeight)
    }
    render()
    this.textRedraws.push(render)
    return mesh
  }

  // ---- Door signs --------------------------------------------------------

  private createDoorSigns() {
    const o = INTERIOR_ORIGIN
    const y = DOOR_H + 1.3
    const signs: [keyof typeof DOOR_LABELS, THREE.Vector3, number][] = [
      ['projects', new THREE.Vector3(0, y, -HUB + 0.25), 0],
      ['reading', new THREE.Vector3(-HUB + 0.25, y, 0), Math.PI / 2],
      ['bedroom', new THREE.Vector3(HUB - 0.25, y, 0), -Math.PI / 2],
    ]
    for (const [room, pos, rotY] of signs) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(6.5, 1.7),
        new THREE.MeshBasicMaterial({ map: this.makePlaqueTexture(DOOR_LABELS[room]), transparent: true }),
      )
      sign.position.copy(o).add(pos)
      sign.rotation.y = rotY
      this.group.add(sign)
    }
  }

  // A dark plaque with gold text (door signs).
  private makePlaqueTexture(text: string) {
    const W = 512
    const Hc = 140
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = Hc
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const render = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, Hc)
      ctx.fillStyle = 'rgba(22,16,10,0.94)'
      ctx.beginPath()
      ctx.roundRect(8, 12, W - 16, Hc - 24, 16)
      ctx.fill()
      ctx.lineWidth = 5
      ctx.strokeStyle = '#caa96f'
      ctx.stroke()
      ctx.fillStyle = '#f0c46a'
      ctx.font = `700 62px ${SERIF}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, W / 2, Hc / 2 + 4)
      texture.needsUpdate = true
    }
    render()
    this.textRedraws.push(render)
    return texture
  }

  // ---- About Me room (bio + favourite fighters) --------------------------

  private createAboutRoom() {
    const o = INTERIOR_ORIGIN
    const wall = new THREE.Group()
    wall.position.copy(o).add(new THREE.Vector3(WING - 0.35, 0, 0))
    wall.rotation.y = -Math.PI / 2 // face -X (into the room)
    this.group.add(wall)

    const header = this.makeLabel('About Me', 2.2, 120)
    header.position.set(0, 12, 0.05)
    wall.add(header)

    const bio = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 4),
      new THREE.MeshBasicMaterial({ map: this.makeBioTexture(), transparent: true }),
    )
    bio.position.set(0, 9, 0.05)
    wall.add(bio)

    // Favourite fighters, in a row.
    FIGHTERS.forEach((f, i) => {
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 4.4),
        new THREE.MeshBasicMaterial({ map: this.makeFighterCard(f), transparent: true }),
      )
      card.position.set((i - (FIGHTERS.length - 1) / 2) * 3.7, 4.2, 0.06)
      wall.add(card)
    })

    const label = this.makeLabel('Favourite Fighters', 1.0, 80)
    label.position.set(0, 6.9, 0.06)
    wall.add(label)
  }

  private makeBioTexture() {
    const W = 1024
    const Hc = 256
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = Hc
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const render = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, Hc)
      ctx.fillStyle = '#ece3d0'
      ctx.textAlign = 'center'
      ctx.font = `400 38px ${SANS}`
      const lines = [
        'Frontend Developer from Kathmandu, Nepal.',
        'I turn ideas into clean, efficient web experiences —',
        'and when the laptop closes, I am watching the fights.',
      ]
      lines.forEach((line, i) => ctx.fillText(line, W / 2, 72 + i * 58))
      texture.needsUpdate = true
    }
    render()
    this.textRedraws.push(render)
    return texture
  }

  private makeFighterCard(f: { name: string; nick: string; flag: string; img: string }) {
    const W = 360
    const Hc = 470
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = Hc
    const ctx = canvas.getContext('2d')!

    const draw = (img: HTMLImageElement | null) => {
      ctx.clearRect(0, 0, W, Hc)
      // Card + gold border.
      ctx.fillStyle = 'rgba(18,22,30,0.97)'
      ctx.beginPath()
      ctx.roundRect(6, 6, W - 12, Hc - 12, 20)
      ctx.fill()
      ctx.lineWidth = 5
      ctx.strokeStyle = '#c9a24a'
      ctx.stroke()

      // Photo (cover-fit into a rounded region), or a placeholder.
      const px = 22
      const py = 22
      const pw = W - 44
      const ph = 300
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(px, py, pw, ph, 12)
      ctx.clip()
      if (img) {
        const s = Math.max(pw / img.width, ph / img.height)
        const iw = img.width * s
        const ih = img.height * s
        ctx.drawImage(img, px + (pw - iw) / 2, py + (ph - ih) / 2, iw, ih)
      } else {
        ctx.fillStyle = '#222833'
        ctx.fillRect(px, py, pw, ph)
      }
      ctx.restore()

      // Flag badge, name, nickname.
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.font = '46px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
      ctx.fillText(f.flag, px + 6, py + 30)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#f0c46a'
      ctx.font = `700 30px ${SERIF}`
      ctx.fillText(f.name, W / 2, 360)
      ctx.fillStyle = '#cfc3aa'
      ctx.font = `400 22px ${SANS}`
      ctx.fillText(f.nick, W / 2, 404)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    let loaded: HTMLImageElement | null = null
    const render = () => {
      draw(loaded)
      texture.needsUpdate = true
    }
    render()
    this.textRedraws.push(render)
    const img = new Image()
    img.onload = () => {
      loaded = img
      render()
    }
    img.src = '/textures/fighters/' + f.img + '.jpg'
    return texture
  }

  // ---- Tech badges (in the reading wing) ---------------------------------

  // A framed "My Toolkit" board mounted on the reading room's far wall, with
  // the tech-stack logos laid out in a grid inside it. Each badge still bounces
  // on hover.
  private createTech() {
    const board = new THREE.Group()
    board.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(-WING + 0.35, 8, 0))
    board.rotation.y = Math.PI / 2 // face +X, into the room
    this.group.add(board)

    const boardW = 15
    const boardH = 9
    // Wooden frame + inner panel.
    board.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(boardW, boardH),
        new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.55, metalness: 0.2 }),
      ),
    )
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(boardW - 0.8, boardH - 0.8),
      new THREE.MeshStandardMaterial({ color: '#241b12', roughness: 0.9 }),
    )
    panel.position.z = 0.03
    board.add(panel)

    // Title across the top of the board.
    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 1.6),
      new THREE.MeshBasicMaterial({ map: this.makeTitleTexture('My Toolkit'), transparent: true }),
    )
    title.position.set(0, boardH / 2 - 1.1, 0.06)
    board.add(title)

    const perRow = 6
    TECH.forEach((name, i) => {
      const item = new THREE.Group()
      const badge = new THREE.Mesh(
        new THREE.CircleGeometry(0.85, 40),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }),
      )
      badge.userData.group = item
      this.techTargets.push(badge)
      item.add(badge)
      const icon = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 1.15),
        new THREE.MeshBasicMaterial({ map: this.loadIconTexture('/textures/tech/' + name + '.svg'), transparent: true }),
      )
      icon.position.z = 0.02
      item.add(icon)

      const row = Math.floor(i / perRow)
      const col = i % perRow
      const count = row === 0 ? Math.min(perRow, TECH.length) : TECH.length - perRow
      item.position.set((col - (count - 1) / 2) * 2.35, 0.4 - row * 2.4, 0.1)
      item.userData.springScale = 1
      item.userData.springVel = 0
      board.add(item)
      this.techIcons.push(item)
    })
  }

  private loadIconTexture(path: string) {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      texture.needsUpdate = true
    }
    img.src = path
    return texture
  }

  // ---- Interaction -------------------------------------------------------

  private onPointerMove(event: PointerEvent) {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
  }

  private onClick() {
    if (this.experience.navigation.scrollProgress < SURFACE_END) return

    // A project frame always opens its link.
    const proj = this.raycaster.intersectObjects(this.clickable)[0]
    if (proj) {
      window.open(proj.object.userData.url as string, '_blank', 'noopener')
      return
    }

    if (this.focus === 'hub') {
      const hit = this.raycaster.intersectObjects(this.doorTargets)[0]
      if (hit) {
        const door = hit.object.userData.door as DoorInfo
        door.target = 1 // unlock + open
        this.focus = door.room
      }
    } else {
      this.focus = 'hub' // click anywhere in a room to go back
    }
  }

  // ---- Frame loop --------------------------------------------------------

  update() {
    const t = this.experience.time.elapsed * 0.001
    const camera = this.experience.camera.instance
    this.raycaster.setFromCamera(this.pointer, camera)

    if (quality.shadows && !this.shadowPrimed) {
      for (const spot of this.spots) spot.shadow.needsUpdate = true
      this.shadowPrimed = true
    }

    // Doors swing open + padlocks vanish once unlocked.
    for (const door of this.doors) {
      const goal = door.openSign * (Math.PI * 0.6) * door.target
      door.pivot.rotation.y += (goal - door.pivot.rotation.y) * 0.12
      const lockGoal = door.target > 0 ? 0 : 1
      door.lock.scale.lerp(new THREE.Vector3(lockGoal, lockGoal, lockGoal), 0.15)
    }

    if (this.portrait) {
      this.portrait.group.position.y = this.portrait.baseY + Math.sin(t * 0.9) * 0.2
    }

    // Hologram project panels float and slowly turn.
    for (const item of this.showcase) {
      item.group.position.y = INTERIOR_ORIGIN.y + 8 + Math.sin(t * 0.8 + item.phase) * 0.25
      item.group.rotation.y = Math.sin(t * 0.4 + item.phase) * 0.5
    }

    // Wall-mounted tech badges bounce toward the room when hovered.
    const techHit = this.raycaster.intersectObjects(this.techTargets)[0]
    const hoveredIcon = (techHit?.object.userData.group as THREE.Group) ?? null
    for (const icon of this.techIcons) {
      const goalS = icon === hoveredIcon ? 1.4 : 1
      icon.userData.springVel = (icon.userData.springVel as number) * 0.6 + (goalS - (icon.userData.springScale as number)) * 0.28
      icon.userData.springScale = (icon.userData.springScale as number) + (icon.userData.springVel as number)
      icon.scale.setScalar(icon.userData.springScale as number)
    }

    // Hover highlight on project frames.
    const projHit = this.raycaster.intersectObjects(this.clickable)[0]
    const projTarget = (projHit?.object as THREE.Mesh) ?? null
    if (this.hoveredProject !== projTarget) {
      if (this.hoveredProject?.parent) this.hoveredProject.parent.scale.set(1, 1, 1)
      this.hoveredProject = projTarget
    }
    if (this.hoveredProject?.parent) {
      this.hoveredProject.parent.scale.lerp(new THREE.Vector3(1.05, 1.05, 1.05), 0.1)
    }

    this.updateCamera(camera, hoveredIcon !== null || projTarget !== null)
  }

  // Drives the click-based camera (hub <-> rooms) while we're in the interior.
  private updateCamera(camera: THREE.PerspectiveCamera, overInteractive: boolean) {
    const p = this.experience.navigation.scrollProgress
    if (p < SURFACE_END) {
      // Not our turn yet (Navigation still flies over the colony).
      this.focus = 'hub'
      this.camReady = false
      this.hintEl.classList.remove('is-visible')
      return
    }

    const o = INTERIOR_ORIGIN
    let goalPos: THREE.Vector3
    let goalLook: THREE.Vector3

    if (this.focus === 'hub') {
      // Free mouse-look: turn to see the left / front / right doors.
      goalPos = o.clone().add(HUB_CAM)
      const px = THREE.MathUtils.clamp(this.pointer.x, -1, 1)
      const py = THREE.MathUtils.clamp(this.pointer.y, -1, 1)
      const yaw = px * 1.15 // up to ~66° each side
      const pitch = py * 0.2
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      )
      goalLook = goalPos.clone().add(dir.multiplyScalar(14))
    } else {
      // In a room the camera is fixed, but you can look around with the pointer.
      const v = VIEWS[this.focus]
      goalPos = o.clone().add(v.pos)
      const px = THREE.MathUtils.clamp(this.pointer.x, -1, 1)
      const py = THREE.MathUtils.clamp(this.pointer.y, -1, 1)
      const dir = o.clone().add(v.look).sub(goalPos).normalize()
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -px * 0.6) // look left/right
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
      dir.applyAxisAngle(right, py * 0.28) // look up/down
      goalLook = goalPos.clone().add(dir.multiplyScalar(20))
    }

    if (!this.camReady) {
      this.camPos.copy(goalPos)
      this.camLook.copy(goalLook)
      this.camReady = true
    }
    this.camPos.lerp(goalPos, 0.12)
    this.camLook.lerp(goalLook, 0.12)
    camera.position.copy(this.camPos)
    camera.lookAt(this.camLook)

    // Prompt + cursor.
    const overDoor =
      this.focus === 'hub' && this.raycaster.intersectObjects(this.doorTargets).length > 0
    document.body.style.cursor = overDoor || overInteractive ? 'pointer' : ''
    this.hintEl.textContent =
      this.focus === 'hub' ? 'Move your mouse to look around · click a door' : 'Click anywhere to go back'
    this.hintEl.classList.add('is-visible')
  }
}
