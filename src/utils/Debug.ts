import GUI from 'lil-gui'

// Add #debug to the URL (e.g. http://localhost:5173/#debug) to enable:
//  - a lil-gui control panel for tweaking values live
//  - free-look OrbitControls instead of the scroll camera (see Camera.ts)
export default class Debug {
  active: boolean
  gui?: GUI

  constructor() {
    this.active = window.location.hash === '#debug'
    if (this.active) {
      this.gui = new GUI({ title: 'Portfolio debug' })
    }
  }
}
