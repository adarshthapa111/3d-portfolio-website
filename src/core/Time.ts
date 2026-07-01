import EventEmitter from '../utils/EventEmitter'

// The render loop. Fires a 'tick' event every animation frame and exposes:
//  - delta:   ms since the previous frame (use this to make motion
//             frame-rate independent)
//  - elapsed: ms since the experience started
export default class Time extends EventEmitter {
  start: number
  current: number
  elapsed: number
  delta: number

  constructor() {
    super()
    this.start = performance.now()
    this.current = this.start
    this.elapsed = 0
    this.delta = 16

    // Wait one frame so subscribers can attach before the first tick.
    window.requestAnimationFrame(() => this.tick())
  }

  tick() {
    const current = performance.now()
    this.delta = current - this.current
    this.current = current
    this.elapsed = this.current - this.start

    this.trigger('tick')

    window.requestAnimationFrame(() => this.tick())
  }
}
