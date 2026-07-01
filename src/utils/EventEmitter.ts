// A tiny publish/subscribe helper. Sizes, Time and others extend this so
// other modules can react to events like 'resize' and 'tick'.
type Callback = (...args: unknown[]) => void

export default class EventEmitter {
  private callbacks: Record<string, Callback[]> = {}

  on(name: string, callback: Callback): this {
    if (!this.callbacks[name]) this.callbacks[name] = []
    this.callbacks[name].push(callback)
    return this
  }

  off(name: string): this {
    delete this.callbacks[name]
    return this
  }

  trigger(name: string, ...args: unknown[]): void {
    const list = this.callbacks[name]
    if (!list) return
    for (const cb of list) cb(...args)
  }
}
