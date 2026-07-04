import * as THREE from 'three'
import Experience from '../core/Experience'
import { SPACE_END, SURFACE_END } from './stages'

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
// Human-scale doors (the old 8x9 openings felt like castle gates).
const DOOR_W = 5
const DOOR_H = 8.5
// The private room behind the hub (its door is passcode-locked).
const PRIV_D = 16 // room depth behind the hub back wall
const PRIV_W = 11 // room half-width
const PASSCODE = '984896'

type Focus = 'hub' | 'reading' | 'projects' | 'bedroom' | 'private'

interface DoorInfo {
  pivot: THREE.Group
  panel: THREE.Mesh
  lock: THREE.Group
  room: Focus
  openSign: number
  baseRot: number // pivot rotation when CLOSED (doors are built along +X)
  target: number // 0 closed, 1 open
  locked: boolean // a locked door won't open until unlocked (private: passcode)
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

const DOOR_LABELS: Record<'reading' | 'projects' | 'bedroom' | 'private', string> = {
  reading: 'Skills',
  projects: 'Projects',
  bedroom: 'About Me',
  private: 'Private',
}

// Fonts for the canvas-drawn labels (match the site: Fraunces display + Inter).
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif"
const SANS = "'Inter', system-ui, -apple-system, sans-serif"

// Camera position + lookAt for each ROOM (relative to INTERIOR_ORIGIN). The hub
// uses HUB_CAM and free mouse-look so you can turn to see all three doors.
const HUB_CAM = new THREE.Vector3(0, 7.5, 7)
const VIEWS: Record<'reading' | 'projects' | 'bedroom' | 'private', { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  reading: { pos: new THREE.Vector3(-24, 7, 0), look: new THREE.Vector3(-45, 6, 0) },
  projects: { pos: new THREE.Vector3(0, 7, -17), look: new THREE.Vector3(0, 7, -42) },
  bedroom: { pos: new THREE.Vector3(24, 7, 0), look: new THREE.Vector3(45, 6, 0) },
  private: { pos: new THREE.Vector3(0, 7, HUB + 4), look: new THREE.Vector3(0, 5.5, HUB + PRIV_D - 2) },
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
  private arms: THREE.Group | null = null
  private textRedraws: (() => void)[] = [] // re-run when web fonts finish loading

  private focus: Focus = 'hub'
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private camReady = false
  private hintEl: HTMLElement
  private keypadEl!: HTMLElement
  private keypadOpen = false
  private keypadCode = ''
  private keypadDoor: DoorInfo | null = null

  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.scene.add(this.group)

    this.hintEl = document.createElement('div')
    this.hintEl.className = 'room-hint'
    document.body.appendChild(this.hintEl)
    this.keypadEl = this.buildKeypad()

    this.createShell()
    this.createNightWindows()
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
    // Matte floor: the old glossy finish (metalness + low roughness) caught the
    // bulbs as big WHITE specular blobs — that was the "white shade".
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.92, metalness: 0 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.copy(o)
    floor.receiveShadow = true
    this.group.add(floor)

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: '#d8cdb6', roughness: 1 }),
    )
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.copy(o).add(new THREE.Vector3(0, H, 0))
    this.group.add(ceiling)

    const wall = new THREE.MeshStandardMaterial({ color: '#b1a184', roughness: 1 })
    const seg = (2 * HUB - DOOR_W) / 2 // wall segment beside a doorway
    const off = DOOR_W / 2 + seg / 2 // its centre offset from the doorway
    const lintelY = DOOR_H + (H - DOOR_H) / 2

    // Hub back wall (the side we arrive from) — now with a doorway into the
    // passcode-locked private room behind it.
    this.box(seg, H, T, -off, H / 2, HUB, wall)
    this.box(seg, H, T, off, H / 2, HUB, wall)
    this.box(DOOR_W, H - DOOR_H, T, 0, lintelY, HUB, wall)

    // The private room: far wall + two side walls behind the hub.
    this.box(2 * PRIV_W, H, T, 0, H / 2, HUB + PRIV_D, wall)
    this.box(T, H, PRIV_D, -PRIV_W, H / 2, HUB + PRIV_D / 2, wall)
    this.box(T, H, PRIV_D, PRIV_W, H / 2, HUB + PRIV_D / 2, wall)

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

  // ---- Night windows -------------------------------------------------------

  // Framed windows that look out on the night: a starry sky with the moon,
  // drawn on a canvas and rendered UNLIT so the panes softly glow in the dark.
  private createNightWindows() {
    const o = INTERIOR_ORIGIN
    const tex = this.makeNightWindowTexture()
    const frame = new THREE.MeshStandardMaterial({ color: '#2e2214', roughness: 0.6 })
    const pane = new THREE.MeshBasicMaterial({ map: tex })
    const PW = 4.6 // pane width
    const PH = 3.6 // pane height
    const Y = 7.4 // centre height on the wall

    // [x, z, rotY] — two on the hub back wall (outboard of the private room
    // behind it) and one on the +Z side wall of each wing. All sit flush.
    const spots: [number, number, number][] = [
      [-12.2, HUB - T, Math.PI],
      [12.2, HUB - T, Math.PI],
      [-30, WH - T, Math.PI], // reading wing
      [30, WH - T, Math.PI], // bedroom wing
    ]

    for (const [x, z, rotY] of spots) {
      const w = new THREE.Group()
      // Frame slab behind the pane, slightly larger.
      const back = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.6, PH + 0.6, 0.18), frame)
      w.add(back)
      // The glowing night pane.
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), pane)
      glass.position.z = 0.12
      w.add(glass)
      // Cross mullions.
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.12, PH, 0.08), frame)
      barV.position.z = 0.16
      const barH = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.12, 0.08), frame)
      barH.position.z = 0.16
      w.add(barV, barH)
      // Sill.
      const sill = new THREE.Mesh(new THREE.BoxGeometry(PW + 1, 0.22, 0.5), frame)
      sill.position.set(0, -(PH / 2 + 0.35), 0.2)
      w.add(sill)

      w.position.copy(o).add(new THREE.Vector3(x, Y, z))
      w.rotation.y = rotY
      this.group.add(w)
    }
  }

  private makeNightWindowTexture() {
    const w = 256
    const h = 320
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    // Deep navy fading to a faintly lit horizon at the bottom.
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#050a18')
    g.addColorStop(0.75, '#0d1730')
    g.addColorStop(1, '#182450')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // Stars.
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w
      const y = Math.random() * h * 0.85
      ctx.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.6})`
      ctx.beginPath()
      ctx.arc(x, y, 0.3 + Math.random() * 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // The moon with a soft glow and a couple of maria.
    const mx = w * 0.72
    const my = h * 0.2
    const glow = ctx.createRadialGradient(mx, my, 4, mx, my, 42)
    glow.addColorStop(0, 'rgba(220,230,255,0.85)')
    glow.addColorStop(1, 'rgba(220,230,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(mx - 42, my - 42, 84, 84)
    ctx.fillStyle = '#e8edff'
    ctx.beginPath()
    ctx.arc(mx, my, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#c5cfe8'
    for (const [dx, dy, r] of [[-4, 3, 3], [5, -4, 2.2], [2, 6, 1.8]]) {
      ctx.beginPath()
      ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
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
    texture.anisotropy = 16
    return texture
  }

  // ---- Doors -------------------------------------------------------------

  private createDoors() {
    // Front (projects): hinge on the -X edge of the doorway, panel spans +X.
    this.addDoor(-DOOR_W / 2, -HUB, 'x', 'projects', -1)
    // Left (reading): hinge on the -Z edge, panel spans +Z.
    this.addDoor(-HUB, -DOOR_W / 2, 'z', 'reading', 1)
    // Right (bedroom / About Me): hinge on the +Z edge, panel spans -Z. The
    // spanSign -1 is what actually flips the panel into the doorway (without
    // it the About Me door sat buried INSIDE the wall beside its opening).
    // openSign +1 swings it OUT toward the hub, same as the other doors.
    this.addDoor(HUB, DOOR_W / 2, 'z', 'bedroom', 1, false, -1)
    // Back (private): passcode-locked until you enter 984896.
    this.addDoor(-DOOR_W / 2, HUB, 'x', 'private', 1, true)
  }

  private addDoor(
    hingeX: number,
    hingeZ: number,
    axis: 'x' | 'z',
    room: Focus,
    openSign: number,
    locked = false,
    spanSign = 1, // which way the panel extends from its hinge along its wall
  ) {
    // Every door is BUILT along +X and rotated into place with baseRot — one
    // canonical, detailed door assembly instead of four axis-specific boxes.
    const baseRot =
      axis === 'x' ? (spanSign === 1 ? 0 : Math.PI) : spanSign === 1 ? -Math.PI / 2 : Math.PI / 2

    const pivot = new THREE.Group()
    pivot.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(hingeX, 0, hingeZ))
    pivot.rotation.y = baseRot
    this.group.add(pivot)

    // A proper panelled wooden door with a brass knob and hinges.
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.6, metalness: 0.05 })
    const woodDark = new THREE.MeshStandardMaterial({ color: '#4a2d18', roughness: 0.7 })
    const brass = new THREE.MeshStandardMaterial({ color: '#e8b64a', metalness: 0.9, roughness: 0.3 })

    const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.22), wood)
    panel.position.set(DOOR_W / 2, DOOR_H / 2, 0)
    panel.castShadow = true
    pivot.add(panel)
    this.doorTargets.push(panel)

    // Recessed panels (upper + lower) on both faces.
    for (const face of [1, -1]) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W * 0.68, DOOR_H * 0.38, 0.05), woodDark)
      upper.position.set(0, DOOR_H * 0.2, face * 0.12)
      const lower = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W * 0.68, DOOR_H * 0.3, 0.05), woodDark)
      lower.position.set(0, -DOOR_H * 0.24, face * 0.12)
      panel.add(upper, lower)
      // Brass knob near the swinging edge, at hand height.
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), brass)
      knob.position.set(DOOR_W * 0.36, -DOOR_H * 0.04, face * 0.24)
      panel.add(knob)
    }
    // Hinges on the hinge edge.
    for (const hy of [DOOR_H * 0.32, -DOOR_H * 0.32]) {
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.3), brass)
      hinge.position.set(-DOOR_W * 0.48, hy, 0)
      panel.add(hinge)
    }

    // A dark wooden frame around the opening (fixed to the wall, not swinging).
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3a2414', roughness: 0.75 })
    const frame = new THREE.Group()
    for (const fx of [-(DOOR_W / 2 + 0.18), DOOR_W / 2 + 0.18]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.36, DOOR_H + 0.15, 0.7), frameMat)
      jamb.position.set(fx, (DOOR_H + 0.15) / 2, 0)
      frame.add(jamb)
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 1.1, 0.4, 0.7), frameMat)
    head.position.set(0, DOOR_H + 0.25, 0)
    frame.add(head)
    // Doorway centre = hinge + half a width along the door's closed direction.
    frame.position
      .copy(INTERIOR_ORIGIN)
      .add(new THREE.Vector3(hingeX, 0, hingeZ))
      .add(new THREE.Vector3(Math.cos(baseRot) * (DOOR_W / 2), 0, -Math.sin(baseRot) * (DOOR_W / 2)))
    frame.rotation.y = baseRot
    this.group.add(frame)

    // A little brass padlock hanging by the knob.
    const lock = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), brass)
    lock.add(body)
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 16, Math.PI), brass)
    shackle.position.y = 0.5
    lock.add(shackle)
    lock.position.set(DOOR_W - 0.8, DOOR_H / 2 - 0.9, 0.32)
    pivot.add(lock)

    const door: DoorInfo = { pivot, panel, lock, room, openSign, baseRot, target: 0, locked }
    // Tag the panel AND all its decor children (knobs, inset panels, hinges) —
    // the raycaster returns whichever child mesh you actually clicked.
    panel.traverse((c) => (c.userData.door = door))
    this.doors.push(door)
  }

  // ---- Lights ------------------------------------------------------------

  private createLights() {
    const o = INTERIOR_ORIGIN
    // Dim night ambient: the house is dark, and the glowing bulbs are the
    // light — but with just enough fill that the rooms stay readable.
    this.group.add(new THREE.AmbientLight('#232c42', 0.12))

    // The faintest cool moonlight through the night windows (kept very low so
    // it doesn't wash the walls with a pale sheen).
    const moonlight = new THREE.DirectionalLight('#7f96c4', 0.08)
    moonlight.position.copy(o).add(new THREE.Vector3(6, 20, 30))
    moonlight.target.position.copy(o)
    this.group.add(moonlight, moonlight.target)

    // A warm ceiling bulb in the hub, each wing and the private room — cosy
    // pools of lamplight, a bit stronger and wider so the rooms feel lived-in.
    const lampSpots: [number, number][] = [
      [0, 2], [-30, 0], [0, -30], [30, 0], [0, HUB + PRIV_D / 2],
    ]
    const roseMat = new THREE.MeshStandardMaterial({ color: '#1b1712', roughness: 0.8 })
    for (const [x, z] of lampSpots) {
      const pos = o.clone().add(new THREE.Vector3(x, 11.2, z))
      const lamp = new THREE.PointLight('#ffc87d', 68, 36, 2)
      lamp.position.copy(pos)
      this.group.add(lamp)
      // The fixture: a dark ceiling rose, a cord, and the glowing bulb.
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.18, 16), roseMat)
      rose.position.copy(pos).setY(o.y + H - 0.09)
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, H - 11.2 - 0.3, 6),
        new THREE.MeshBasicMaterial({ color: '#0c0a08' }),
      )
      cord.position.copy(pos).add(new THREE.Vector3(0, (H - 11.2 + 0.3) / 2, 0))
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 18, 18),
        new THREE.MeshBasicMaterial({ color: '#ffe3ae' }),
      )
      bulb.position.copy(pos)
      this.group.add(rose, cord, bulb)
    }

    // Gallery spotlights on the projects far wall. No cast shadows — the
    // shadow maps only produced banding artifacts on the walls in the dark.
    for (const x of [-8, 0, 8]) {
      const spot = new THREE.SpotLight('#fff4e0', 90, 34, Math.PI / 7, 0.5, 1.5)
      spot.position.copy(o).add(new THREE.Vector3(x, 12, -33))
      spot.target.position.copy(o).add(new THREE.Vector3(x, 7, -45))
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

    // About Me wing (+X): a comfy couch to sit and read the About wall.
    this.place('Couch.glb', 26, 0, Math.PI / 2, 7, 'footprint')

    // Private room (+Z, behind the passcode door): a bed against the far wall.
    this.place('Bed.glb', 0, HUB + PRIV_D - 4.5, Math.PI, 8, 'footprint')

    this.createArms()
  }

  // First-person arms parented to the camera — only shown inside the house.
  private createArms() {
    const src = this.experience.resources.models['first_person_arms.glb']
    if (!src) return
    const arms = src.clone(true)
    const box = new THREE.Box3().setFromObject(arms)
    const size = box.getSize(new THREE.Vector3())
    arms.scale.setScalar(2.6 / (Math.max(size.x, size.y, size.z) || 1))
    arms.rotation.y = Math.PI // face the same way as the camera
    arms.position.set(0, -1.5, -1.8) // camera space: low + in front
    arms.visible = false
    this.experience.camera.instance.add(arms)
    this.arms = arms
  }

  // Toggle the first-person hands (shown from the surface walk onward) with a
  // gentle bob. Called every frame by World (even outside the interior stage).
  updateArms(p: number) {
    if (!this.arms) return
    const show = p >= SPACE_END + 0.02
    this.arms.visible = show
    if (show) {
      this.arms.position.y = -1.5 + Math.sin(this.experience.time.elapsed * 0.004) * 0.05
    }
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
    texture.anisotropy = 16
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
    texture.anisotropy = 16
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
      ['private', new THREE.Vector3(0, y, HUB - 0.25), Math.PI],
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
    texture.anisotropy = 16
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

  // ---- About Me room (bio + education journey) ---------------------------

  private createAboutRoom() {
    const o = INTERIOR_ORIGIN
    const wall = new THREE.Group()
    wall.position.copy(o).add(new THREE.Vector3(WING - 0.35, 0, 0))
    wall.rotation.y = -Math.PI / 2 // face -X (into the room)
    this.group.add(wall)

    const header = this.makeLabel('About Adarsh', 2.2, 120)
    header.position.set(0, 12.2, 0.05)
    wall.add(header)

    const badge = this.makeLabel('✦ Completed my Undergraduate ✦', 0.85, 64)
    badge.position.set(0, 10.9, 0.05)
    wall.add(badge)

    // Adarsh's photo in a gold-rimmed circle, up beside the header.
    const photoTex = this.experience.resources.textureLoader.load('/textures/photo/adarsh.png')
    photoTex.colorSpace = THREE.SRGBColorSpace
    const photo = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 48),
      new THREE.MeshBasicMaterial({ map: photoTex }),
    )
    photo.position.set(-7.6, 11.6, 0.06)
    wall.add(photo)
    const photoRing = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.18, 48),
      new THREE.MeshBasicMaterial({ color: '#f0c46a' }),
    )
    photoRing.position.set(-7.6, 11.6, 0.06)
    wall.add(photoRing)

    const bio = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 5.2),
      new THREE.MeshBasicMaterial({ map: this.makeAboutBioTexture(), transparent: true }),
    )
    bio.position.set(0, 7.9, 0.05)
    wall.add(bio)

    const timeline = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 5.6),
      new THREE.MeshBasicMaterial({ map: this.makeEducationTexture(), transparent: true }),
    )
    timeline.position.set(0, 3.2, 0.06)
    wall.add(timeline)
  }

  // Word-wrap a string to fit maxW at the ctx's current font.
  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
    const words = text.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const candidate = cur ? cur + ' ' + w : w
      if (ctx.measureText(candidate).width > maxW && cur) {
        lines.push(cur)
        cur = w
      } else {
        cur = candidate
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  private makeAboutBioTexture() {
    const W = 1600
    const Hc = 416
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = Hc
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 16
    const BIO =
      'I am Adarsh Thapa, a recent graduate from Herald College Kathmandu, where I completed my ' +
      'undergraduate studies. With a passion for technology and a drive to continuously learn and grow, ' +
      'my goal is to become a proficient full-stack developer. During my academic journey, I developed a ' +
      'strong foundation in various programming languages and web development technologies, which has ' +
      'fueled my ambition to excel in the field of software development. I am constantly seeking ' +
      'opportunities to expand my knowledge and enhance my skills, enabling me to create innovative and ' +
      'efficient solutions.'
    const render = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, Hc)
      // A softly glowing card behind the text keeps it readable in the dark.
      ctx.fillStyle = 'rgba(16,20,30,0.82)'
      ctx.beginPath()
      ctx.roundRect(8, 8, W - 16, Hc - 16, 26)
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(240,196,106,0.55)'
      ctx.stroke()

      ctx.fillStyle = '#f2ead8'
      ctx.textAlign = 'center'
      ctx.font = `400 34px ${SANS}`
      const lines = this.wrapText(ctx, BIO, W - 140)
      const lineH = 46
      const startY = Hc / 2 - ((lines.length - 1) * lineH) / 2 + 6
      lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineH))
      texture.needsUpdate = true
    }
    render()
    this.textRedraws.push(render)
    return texture
  }

  // The education journey: three vibrant numbered milestones on a timeline.
  private makeEducationTexture() {
    const W = 1600
    const Hc = 448
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = Hc
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 16
    const STEPS: { n: string; school: string; desc: string; color: string }[] = [
      {
        n: '1',
        school: "Reader's Public High School",
        desc: 'Completed my lower level of school education.',
        color: '#39d0ff',
      },
      {
        n: '2',
        school: 'Shree Siddhababa Secondary School',
        desc: 'Completed my secondary level of school education.',
        color: '#f0c46a',
      },
      {
        n: '3',
        school: 'Herald College Kathmandu',
        desc: 'Completed undergraduate in this college.',
        color: '#7ee08a',
      },
    ]
    const render = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, Hc)
      const colW = W / 3
      const circleY = 84

      // The connecting timeline behind the number circles.
      const grad = ctx.createLinearGradient(colW / 2, 0, W - colW / 2, 0)
      grad.addColorStop(0, STEPS[0].color)
      grad.addColorStop(0.5, STEPS[1].color)
      grad.addColorStop(1, STEPS[2].color)
      ctx.strokeStyle = grad
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(colW / 2, circleY)
      ctx.lineTo(W - colW / 2, circleY)
      ctx.stroke()

      STEPS.forEach((step, i) => {
        const cx = colW * i + colW / 2

        // Glowing numbered circle.
        ctx.save()
        ctx.shadowColor = step.color
        ctx.shadowBlur = 30
        ctx.fillStyle = step.color
        ctx.beginPath()
        ctx.arc(cx, circleY, 44, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.fillStyle = '#10141e'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `800 46px ${SANS}`
        ctx.fillText(step.n, cx, circleY + 2)
        ctx.textBaseline = 'alphabetic'

        // School name (vibrant, may wrap to two lines) + description.
        ctx.fillStyle = step.color
        ctx.font = `700 34px ${SERIF}`
        const nameLines = this.wrapText(ctx, step.school, colW - 90)
        nameLines.forEach((line, li) => ctx.fillText(line, cx, 188 + li * 42))
        const descY = 188 + nameLines.length * 42 + 14
        ctx.fillStyle = '#ded5c2'
        ctx.font = `400 26px ${SANS}`
        const descLines = this.wrapText(ctx, step.desc, colW - 90)
        descLines.forEach((line, li) => ctx.fillText(line, cx, descY + li * 36))
      })
      texture.needsUpdate = true
    }
    render()
    this.textRedraws.push(render)
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
    if (this.keypadOpen) return // the keypad overlay handles its own clicks

    // A project frame always opens its link.
    const proj = this.raycaster.intersectObjects(this.clickable)[0]
    if (proj) {
      window.open(proj.object.userData.url as string, '_blank', 'noopener')
      return
    }

    const hit = this.raycaster.intersectObjects(this.doorTargets)[0]
    const door = hit ? (hit.object.userData.door as DoorInfo) : null

    if (this.focus === 'hub') {
      if (!door) return
      if (door.locked) {
        // The private door asks for its passcode; other doors unlock on touch.
        if (door.room === 'private') this.openKeypad(door)
        else door.locked = false
        return
      }
      door.target = 1 // open + walk in
      this.focus = door.room
    } else {
      // Inside a room, touching YOUR door toggles its lock: close+lock, then
      // touch again to unlock+open. Clicking anywhere else returns to the hub.
      if (door && door.room === this.focus) {
        if (door.target > 0) {
          door.target = 0
          door.locked = true
        } else {
          door.locked = false
          door.target = 1
        }
        return
      }
      this.focus = 'hub'
    }
  }

  // ---- Passcode keypad (private room) -------------------------------------

  private openKeypad(door: DoorInfo) {
    this.keypadDoor = door
    this.keypadCode = ''
    this.keypadOpen = true
    this.updateKeypadDisplay()
    this.keypadEl.classList.add('is-open')
  }

  private closeKeypad() {
    this.keypadOpen = false
    this.keypadEl.classList.remove('is-open')
  }

  private pressKey(key: string) {
    if (key === 'back') {
      this.keypadCode = this.keypadCode.slice(0, -1)
      this.updateKeypadDisplay()
      return
    }
    if (this.keypadCode.length >= 6) return
    this.keypadCode += key
    this.updateKeypadDisplay()
    if (this.keypadCode.length < 6) return

    if (this.keypadCode === PASSCODE) {
      // Unlock, swing open and walk in.
      const door = this.keypadDoor
      this.closeKeypad()
      if (door) {
        door.locked = false
        door.target = 1
        this.focus = door.room
      }
    } else {
      // Wrong code: flash red and clear.
      this.keypadEl.classList.add('is-wrong')
      setTimeout(() => {
        this.keypadEl.classList.remove('is-wrong')
        this.keypadCode = ''
        this.updateKeypadDisplay()
      }, 450)
    }
  }

  private updateKeypadDisplay() {
    const dots = this.keypadEl.querySelector('.keypad-display')
    if (dots) {
      dots.textContent =
        '● '.repeat(this.keypadCode.length).trim() + ' ○'.repeat(6 - this.keypadCode.length)
    }
  }

  private buildKeypad() {
    const el = document.createElement('div')
    el.className = 'keypad'
    el.innerHTML =
      '<div class="keypad-title">Private · Enter Passcode</div>' +
      '<div class="keypad-display"></div>' +
      '<div class="keypad-grid"></div>' +
      '<button class="keypad-close" type="button">Cancel</button>'
    // Keep keypad clicks away from the window click handler (room navigation).
    el.addEventListener('click', (e) => e.stopPropagation())

    const grid = el.querySelector('.keypad-grid')!
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']) {
      if (key === '') {
        grid.appendChild(document.createElement('span'))
        continue
      }
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = key === 'back' ? '⌫' : key
      b.addEventListener('click', () => this.pressKey(key))
      grid.appendChild(b)
    }
    el.querySelector('.keypad-close')!.addEventListener('click', () => this.closeKeypad())
    document.body.appendChild(el)
    return el
  }

  // ---- Frame loop --------------------------------------------------------

  update() {
    const t = this.experience.time.elapsed * 0.001
    const camera = this.experience.camera.instance
    this.raycaster.setFromCamera(this.pointer, camera)

    // Doors swing open/closed (relative to their closed baseRot); the brass
    // padlock shows only while LOCKED.
    for (const door of this.doors) {
      const goal = door.baseRot + door.openSign * (Math.PI * 0.6) * door.target
      door.pivot.rotation.y += (goal - door.pivot.rotation.y) * 0.12
      const lockGoal = door.locked ? 1 : 0
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
      if (this.keypadOpen) this.closeKeypad()
      return
    }

    const o = INTERIOR_ORIGIN
    let goalPos: THREE.Vector3
    let goalLook: THREE.Vector3

    if (this.focus === 'hub') {
      // Free mouse-look: turn to see all FOUR doors — push the mouse to a side
      // edge to spin right round to the Private door on the back wall.
      goalPos = o.clone().add(HUB_CAM)
      const px = THREE.MathUtils.clamp(this.pointer.x, -1, 1)
      const py = THREE.MathUtils.clamp(this.pointer.y, -1, 1)
      const yaw = px * Math.PI // full 180° each side
      const pitch = py * 0.2
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      )
      goalLook = goalPos.clone().add(dir.multiplyScalar(14))
    } else {
      // In a room the camera is fixed, but you can look around with the pointer
      // — all the way round, so you can turn back and lock the door behind you.
      const v = VIEWS[this.focus]
      goalPos = o.clone().add(v.pos)
      const px = THREE.MathUtils.clamp(this.pointer.x, -1, 1)
      const py = THREE.MathUtils.clamp(this.pointer.y, -1, 1)
      const dir = o.clone().add(v.look).sub(goalPos).normalize()
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -px * Math.PI) // full turn
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
      this.focus === 'hub'
        ? 'Move your mouse to look around · click a door'
        : 'Click the door to lock / unlock it · click anywhere else to go back'
    this.hintEl.classList.add('is-visible')
  }
}
