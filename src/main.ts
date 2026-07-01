import './style.css'
import './ui/reveal'
import Experience from './core/Experience'

// Always begin the journey at the very top. Browsers restore the previous
// scroll position on refresh, which would otherwise drop you mid-whiteout or
// straight into the house.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

// Entry point: find the canvas and start the experience. From here on,
// any module can reach the same instance via `new Experience()`.
const canvas = document.querySelector<HTMLCanvasElement>('canvas.webgl')

if (!canvas) {
  throw new Error('Could not find <canvas class="webgl"> in index.html')
}

new Experience(canvas)
