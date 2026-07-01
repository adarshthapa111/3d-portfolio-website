// Picks a quality tier from the device so the experience stays smooth on
// phones and laptops as well as powerful desktops. Detected once at load.
export interface Quality {
  tier: 'high' | 'low'
  pixelRatio: number
  shadows: boolean
  smaa: boolean
  treeCount: number
  scatterCount: number
  cloudCount: number
}

function detect(): Quality {
  const dpr = window.devicePixelRatio || 1
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches // touch device
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 720
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4
  const low = coarsePointer || smallScreen || fewCores

  if (low) {
    return {
      tier: 'low',
      pixelRatio: Math.min(dpr, 1.5),
      shadows: false,
      smaa: false,
      treeCount: 16,
      scatterCount: 16,
      cloudCount: 14,
    }
  }
  return {
    tier: 'high',
    pixelRatio: Math.min(dpr, 2),
    shadows: true,
    smaa: true,
    treeCount: 46,
    scatterCount: 44,
    cloudCount: 26,
  }
}

export const quality = detect()
