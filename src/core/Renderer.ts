import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import Experience from './Experience'
import { quality } from '../utils/quality'

// A tiny final pass that pushes colour saturation for a more vibrant look.
const SaturationShader = {
  uniforms: { tDiffuse: { value: null }, uSaturation: { value: 1.28 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(luma), color.rgb, uSaturation);
      gl_FragColor = color;
    }
  `,
}

// Wraps the WebGLRenderer AND the post-processing pipeline.
//
// Instead of drawing the scene straight to the screen, we run it through an
// EffectComposer — a chain of "passes":
//   1. RenderPass   draws the 3D scene into an off-screen buffer
//   2. UnrealBloomPass  makes bright areas glow (the cinematic look)
//   3. OutputPass   applies tone mapping + sRGB and writes to the screen
export default class Renderer {
  experience: Experience
  instance!: THREE.WebGLRenderer
  composer!: EffectComposer
  bloom!: UnrealBloomPass

  constructor() {
    this.experience = new Experience()
    this.setInstance()
    this.setPostProcessing()
  }

  setInstance() {
    const { canvas, sizes } = this.experience
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    })
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1.1
    this.instance.shadowMap.enabled = quality.shadows
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap
    this.instance.setClearColor('#0b0b12')
    this.instance.setSize(sizes.width, sizes.height)
    this.instance.setPixelRatio(sizes.pixelRatio)
  }

  setPostProcessing() {
    const { sizes, scene, camera } = this.experience

    this.composer = new EffectComposer(this.instance)
    this.composer.setSize(sizes.width, sizes.height)
    this.composer.setPixelRatio(sizes.pixelRatio)

    this.composer.addPass(new RenderPass(scene, camera.instance))

    // (resolution, strength, radius, threshold)
    // threshold = how bright a pixel must be before it glows.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(sizes.width, sizes.height),
      0.28, // strength (subtle glow — was too strong)
      0.4, // radius
      0.82, // threshold (only the brightest areas bloom)
    )
    this.composer.addPass(this.bloom)

    // OutputPass does the tone-map + colour conversion; the saturation pass
    // then makes the whole scene (planets, colony, rooms) more vibrant.
    this.composer.addPass(new OutputPass())
    this.composer.addPass(new ShaderPass(SaturationShader))
    // Edge anti-aliasing (post-processing bypasses the renderer's MSAA).
    // Skipped on low-power devices to save GPU time.
    if (quality.smaa) this.composer.addPass(new SMAAPass())

    const gui = this.experience.debug.gui
    if (gui) {
      const folder = gui.addFolder('Bloom')
      folder.add(this.bloom, 'strength', 0, 3).name('strength')
      folder.add(this.bloom, 'radius', 0, 2).name('radius')
      folder.add(this.bloom, 'threshold', 0, 1).name('threshold')
    }
  }

  resize() {
    const { sizes } = this.experience
    this.instance.setSize(sizes.width, sizes.height)
    this.instance.setPixelRatio(sizes.pixelRatio)
    this.composer.setSize(sizes.width, sizes.height)
    this.composer.setPixelRatio(sizes.pixelRatio)
  }

  update() {
    this.adaptResolution()
    // Render through the composer instead of renderer.render(...).
    this.composer.render()
  }

  // Adaptive resolution: if the average frame time creeps up (low FPS), drop
  // the pixel ratio a notch; when it's comfortably fast, recover it. Keeps the
  // experience smooth on weaker GPUs without a fixed low-quality penalty.
  private avgDelta = 16
  private currentRatio = 0
  private cooldown = 0

  private adaptResolution() {
    const cap = this.experience.sizes.pixelRatio
    if (this.currentRatio === 0) this.currentRatio = cap

    // Smoothed frame time (ms).
    this.avgDelta += (this.experience.time.delta - this.avgDelta) * 0.05
    if (this.cooldown > 0) {
      this.cooldown--
      return
    }

    // Keep the picture SHARP: never drop below 85% of native resolution, and
    // only step down when the frame rate is genuinely struggling (~<30fps).
    // This trades a little smoothness for a crisp, full-resolution image.
    const floor = Math.max(cap * 0.85, 1)
    let next = this.currentRatio
    if (this.avgDelta > 33 && this.currentRatio > floor) {
      next = Math.max(floor, this.currentRatio - 0.15) // struggling -> downscale a touch
    } else if (this.avgDelta < 20 && this.currentRatio < cap) {
      next = Math.min(cap, this.currentRatio + 0.15) // comfortable -> recover to native
    }

    if (next !== this.currentRatio) {
      this.currentRatio = next
      this.instance.setPixelRatio(next)
      this.composer.setPixelRatio(next)
      this.cooldown = 40 // wait ~0.7s before adjusting again
    }
  }
}
