// Reveals each overlay panel as it scrolls into view (and hides it again when
// it leaves, so the animation replays). The CSS does the actual fade/slide via
// the `.is-visible` class; this just toggles it with an IntersectionObserver.
const panels = document.querySelectorAll<HTMLElement>('.panel')

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      entry.target.classList.toggle('is-visible', entry.isIntersecting)
    }
  },
  { threshold: 0.35 },
)

panels.forEach((panel) => observer.observe(panel))
