// The journey's scroll (0..1) is split into three acts. A whiteout hides the
// camera teleport between each far-apart scene.
//
//   0.00 .. SPACE_END     SPACE    (solar system -> dive into Earth)
//   ~SPACE_END            cloud whiteout
//   SPACE_END .. SURFACE_END  SURFACE (descend -> walk the street -> gate)
//   ~SURFACE_END          door whiteout
//   SURFACE_END .. 1.00   INTERIOR (inside the house: intro, tech, projects)
export const SPACE_END = 0.34
export const SURFACE_END = 0.64

// Local 0..1 progress within a stage, given overall scroll progress p.
export function spaceT(p: number) {
  return p / SPACE_END
}
export function surfaceT(p: number) {
  return (p - SPACE_END) / (SURFACE_END - SPACE_END)
}
export function interiorT(p: number) {
  return (p - SURFACE_END) / (1 - SURFACE_END)
}
