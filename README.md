# Adarsh Thapa — Immersive 3D Portfolio

A fully immersive 3D portfolio built from scratch with **Three.js + Vite + TypeScript**.
The whole page is one 3D scene; scrolling flies the camera through four sections
(Hero → About → Projects → Contact).

This project is a learning playground for 3D web development.

## Requirements

- **Node 18+** (this machine uses nvm — run `nvm use 20` first).

## Commands

```bash
npm run dev       # start the dev server (http://localhost:5173)
npm run build     # type-check + production build into dist/
npm run preview   # preview the production build locally
```

## Debug mode

Open `http://localhost:5173/#debug` to:

- get a **lil-gui** panel for tweaking lights live, and
- switch to **free-look** (OrbitControls) so you can fly around and inspect the
  scene instead of being driven by scroll.

## How it's organised

The architecture follows the well-known **Three.js Journey** class pattern: a single
`Experience` singleton owns everything, and small modules each do one job.

```
index.html              single <canvas> + the HTML overlay (text per section)
src/
  main.ts               entry — starts the Experience
  style.css             fixed full-screen canvas + scrolling overlay panels
  core/
    Experience.ts       singleton that wires everything together
    Sizes.ts            viewport size + 'resize' event (pixelRatio capped at 2)
    Time.ts             the render loop + 'tick' event (delta / elapsed)
    Camera.ts           PerspectiveCamera (+ OrbitControls in #debug)
    Renderer.ts         WebGLRenderer setup (tone mapping, clear colour)
  world/
    config.ts           layout of the sections in 3D space — TWEAK THIS FIRST
    World.ts            builds lights, starfield, and the four sections
    Environment.ts      lighting + fog
    Navigation.ts       maps scroll position → camera path
    sections/
      Section.ts        base class: positions a Group from config.ts
      Hero.ts           tumbling icosahedron
      About.ts          rotating torus knot
      Projects.ts       3 clickable cards (raycasting) → open project links
      Contact.ts        glowing sphere
  utils/
    EventEmitter.ts     tiny pub/sub used by Sizes + Time
    Debug.ts            lil-gui, enabled by #debug
```

## Where to start experimenting

1. **`src/world/config.ts`** — move sections around, change spacing.
2. **`src/world/sections/*.ts`** — swap geometries, colours, and materials.
3. **`src/world/Environment.ts`** — play with light positions/intensities
   (open `#debug` to drag the sliders).
4. **`src/world/sections/Projects.ts`** — set the real URLs for each project.

## Ideas for next steps

- Replace primitives with real GLTF models (free models: poly.pizza, Sketchfab).
- Add an HDR environment map (`RGBELoader`) for realistic reflections.
- Custom GLSL shaders (particles, fresnel glow) via `vite-plugin-glsl`.
- Post-processing bloom with `EffectComposer`.

## Deploy

`npm run build` produces a static `dist/` folder. Drop it on **Vercel** or **Netlify**
(both auto-detect Vite — no config needed).

## Learning resources

- [Three.js manual](https://threejs.org/manual/) — official fundamentals
- [Three.js examples](https://threejs.org/examples/) — gallery to copy from
- [Three.js Journey](https://threejs-journey.com/) — the course this architecture comes from
