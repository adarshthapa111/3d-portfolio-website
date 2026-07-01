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

// Camera position + lookAt for each ROOM (relative to INTERIOR_ORIGIN). The hub
// uses HUB_CAM and free mouse-look so you can turn to see all three doors.
const HUB_CAM = new THREE.Vector3(0, 7.5, 7)
const VIEWS: Record<'reading' | 'projects' | 'bedroom', { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  reading: { pos: new THREE.Vector3(-24, 7, 0), look: new THREE.Vector3(-45, 6, 0) },
  projects: { pos: new THREE.Vector3(0, 7, -22), look: new THREE.Vector3(0, 7, -45) },
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
  private doors: DoorInfo[] = []
  private portrait: { group: THREE.Group; baseY: number } | null = null
  private hoveredProject: THREE.Mesh | null = null
  private spots: THREE.SpotLight[] = []
  private shadowPrimed = false

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
    this.createHub()
    this.createProjects()
    this.createTech()

    const resources = this.experience.resources
    if (Object.keys(resources.models).length) this.furnish()
    else resources.on('ready', () => this.furnish())

    window.addEventListener('pointermove', (e) => this.onPointerMove(e))
    window.addEventListener('click', () => this.onClick())
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

    // Projects wing (-Z): a couch facing the framed projects.
    this.place('Couch.glb', 0, -32, Math.PI, 7, 'footprint')

    // Bedroom wing (+X): bed, painting, window.
    this.place('Bed.glb', 40, 0, -Math.PI / 2, 8, 'footprint')
    this.placeOnWall('Wall painting.glb', 41, 8, 8, -Math.PI / 2, 5)
    this.placeOnWall('Window2 black open 1731.glb', 41, 7, -8, -Math.PI / 2, 6)
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

  private placeOnWall(file: string, x: number, y: number, z: number, rotY: number, target: number) {
    const src = this.experience.resources.models[file]
    if (!src) return
    const m = src.clone(true)
    m.rotation.y = rotY
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    m.scale.setScalar(target / (size.y || 1))
    const sb = new THREE.Box3().setFromObject(m)
    const c = sb.getCenter(new THREE.Vector3())
    m.position.x += INTERIOR_ORIGIN.x + x - c.x
    m.position.y += INTERIOR_ORIGIN.y + y - c.y
    m.position.z += INTERIOR_ORIGIN.z + z - c.z
    this.group.add(m)
  }

  // ---- Projects (framed, on the projects wing far wall) ------------------

  private createProjects() {
    const loader = this.experience.resources.textureLoader
    PROJECTS.forEach((project, i) => {
      const texture = loader.load('/textures/projects/' + project.img)
      texture.colorSpace = THREE.SRGBColorSpace
      const w = 8
      const h = w * (1800 / 2880)
      const frame = new THREE.Group()
      frame.add(
        new THREE.Mesh(
          new THREE.PlaneGeometry(w + 0.7, h + 0.7),
          new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.6, metalness: 0.2 }),
        ),
      )
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture }),
      )
      screen.position.z = 0.08
      screen.userData.url = project.url
      frame.add(screen)
      this.clickable.push(screen)
      frame.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3((i - 1) * 9, 7, -WING + 0.4))
      this.group.add(frame)

      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 1.4),
        new THREE.MeshBasicMaterial({ map: this.makeTitleTexture(project.title), transparent: true }),
      )
      plaque.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3((i - 1) * 9, 7 - h / 2 - 1.2, -WING + 0.45))
      this.group.add(plaque)
    })
  }

  private makeTitleTexture(text: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f0c46a'
    ctx.font = "700 60px Georgia, 'Times New Roman', serif"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 64)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }

  // ---- Tech badges (in the reading wing) ---------------------------------

  private createTech() {
    TECH.forEach((name, i) => {
      const group = new THREE.Group()
      const badge = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 40),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 }),
      )
      badge.userData.group = group
      this.techTargets.push(badge)
      group.add(badge)
      const icon = new THREE.Mesh(
        new THREE.PlaneGeometry(1.35, 1.35),
        new THREE.MeshBasicMaterial({ map: this.loadIconTexture('/textures/tech/' + name + '.svg'), transparent: true }),
      )
      icon.position.z = 0.02
      group.add(icon)

      const perRow = 6
      const row = Math.floor(i / perRow)
      const col = i % perRow
      const count = row === 0 ? Math.min(perRow, TECH.length) : TECH.length - perRow
      const x = -28 + (col - (count - 1) / 2) * 2.6
      const y = 9 - row * 2.6
      group.position.copy(INTERIOR_ORIGIN).add(new THREE.Vector3(x, y, 0))
      group.userData.phase = i * 0.7
      group.userData.baseY = group.position.y
      group.userData.springScale = 1
      group.userData.springVel = 0
      this.group.add(group)
      this.techIcons.push(group)
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

    // Tech badges bob, face the camera, and bounce on hover.
    const techHit = this.raycaster.intersectObjects(this.techTargets)[0]
    const hoveredIcon = (techHit?.object.userData.group as THREE.Group) ?? null
    for (const icon of this.techIcons) {
      icon.position.y = (icon.userData.baseY as number) + Math.sin(t + (icon.userData.phase as number)) * 0.3
      icon.lookAt(camera.position)
      const goalS = icon === hoveredIcon ? 1.5 : 1
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
      const v = VIEWS[this.focus]
      goalPos = o.clone().add(v.pos)
      goalLook = o.clone().add(v.look)
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
