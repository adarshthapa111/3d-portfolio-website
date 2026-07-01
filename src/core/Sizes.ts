import EventEmitter from '../utils/EventEmitter'
import { quality } from '../utils/quality'

// Tracks the viewport size and fires a 'resize' event when it changes.
// pixelRatio is capped at 2 — beyond that you render millions of extra
// pixels for almost no visible gain (a key performance lesson).
export default class Sizes extends EventEmitter {
  width: number
  height: number
  pixelRatio: number

  constructor() {
    super()
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.pixelRatio = quality.pixelRatio

    window.addEventListener('resize', () => {
      this.width = window.innerWidth
      this.height = window.innerHeight
      this.pixelRatio = quality.pixelRatio
      this.trigger('resize')
    })
  }
}
