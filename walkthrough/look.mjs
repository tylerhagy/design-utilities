// How the walkthrough's own marks look over a prototype: spotlight, click ripple, chapter label, part label.
// One look per video (`look` in the scenes file, or --look). The design system owns hue (blue is interactive,
// orange, red and green are status), so the looks below separate the walkthrough's marks by other means.
//   page:  CSS for overlays.js (in the page, captured with the video)
//   label: CSS for captions.mjs (drawn over the video)
const DARK_GLASS = `
#chap{background:rgba(18,20,24,.88);color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.14) inset,0 8px 24px rgba(0,0,0,.28)}
#part{background:rgba(18,20,24,.9);box-shadow:0 0 0 1px rgba(255,255,255,.14) inset,0 10px 32px rgba(0,0,0,.3)}
#part .bars i.cur{background:#fff}`

export const LOOKS = {
  // what shipped through 2026-11-24: blue ring, blue ripple, blue chapter pill
  current: {
    page: `
#vw-spot{border-radius:12px;box-shadow:0 0 0 3px #1976d2,0 0 0 4000px rgba(15,23,32,.32)}
#vw-rip{background:rgba(25,118,210,.35)}`,
    label: `#chap{background:#1976d2;color:#fff}#part .bars i.cur{background:#2997ff}`,
  },
  // neutral two-tone: a white ring with a dark hairline reads on light, dark and blue alike; ripple is a ring, not a fill
  ink: {
    page: `
#vw-spot{border-radius:10px;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgba(10,12,16,.6),0 0 0 4000px rgba(10,12,16,.42)}
#vw-rip{background:transparent;border:2.5px solid #fff;box-shadow:0 0 0 1px rgba(10,12,16,.5),inset 0 0 0 1px rgba(10,12,16,.5)}`,
    label: DARK_GLASS,
  },
  // Ink plus a light recede: the same two-tone ring and ring ripple, and outside the spot a lighter dim with a slight
  // blur, so the spot lifts off busy screens while the context stays readable
  inkBlur: {
    blur: true,
    page: `
#vw-spot{border-radius:10px;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgba(10,12,16,.6),0 14px 40px rgba(10,12,16,.28)}
#vw-blur{background:rgba(10,12,16,.36);-webkit-backdrop-filter:blur(1.5px);backdrop-filter:blur(1.5px)}
#vw-rip{background:transparent;border:2.5px solid #fff;box-shadow:0 0 0 1px rgba(10,12,16,.5),inset 0 0 0 1px rgba(10,12,16,.5)}`,
    label: DARK_GLASS,
  },
  // recede the rest: everything outside the spot dims and softly blurs; the spot keeps a hairline edge and a lift
  focus: {
    blur: true,
    page: `
#vw-spot{border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.95),0 0 0 2px rgba(10,12,16,.25),0 18px 48px rgba(10,12,16,.3)}
#vw-blur{background:rgba(10,12,16,.28);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
#vw-rip{background:rgba(10,12,16,.2)}`,
    label: `
#chap{background:rgba(255,255,255,.96);color:#111;box-shadow:0 0 0 1px rgba(10,12,16,.1),0 8px 24px rgba(10,12,16,.18)}
#part{background:rgba(255,255,255,.96);color:#111;box-shadow:0 0 0 1px rgba(10,12,16,.1),0 10px 32px rgba(10,12,16,.2)}
#part .pk{color:#6e6e73}#part .bars i{background:rgba(10,12,16,.14)}#part .bars i.done{background:rgba(10,12,16,.45)}#part .bars i.cur{background:#111}`,
  },
  // one hue the design system doesn't use (violet), kept for the walkthrough's marks only
  signal: {
    page: `
#vw-spot{border-radius:12px;box-shadow:0 0 0 3px #8b5cf6,0 0 0 4000px rgba(15,23,32,.32)}
#vw-rip{background:rgba(139,92,246,.4)}`,
    label: `
#chap{background:#7c3aed;color:#fff}
#part{background:rgba(18,20,24,.9)}#part .bars i.cur{background:#a78bfa}`,
  },
  // viewfinder: four white corner marks with a dark halo instead of a full outline, over a dim
  brackets: {
    corners: true,
    page: `
#vw-spot{border-radius:10px;box-shadow:0 0 0 4000px rgba(10,12,16,.38)}
#vw-spot .c{position:absolute;width:22px;height:22px;border:0 solid #fff;filter:drop-shadow(0 0 1.5px rgba(0,0,0,.75))}
#vw-spot .c1{left:-7px;top:-7px;border-left-width:3px;border-top-width:3px;border-top-left-radius:8px}
#vw-spot .c2{right:-7px;top:-7px;border-right-width:3px;border-top-width:3px;border-top-right-radius:8px}
#vw-spot .c3{left:-7px;bottom:-7px;border-left-width:3px;border-bottom-width:3px;border-bottom-left-radius:8px}
#vw-spot .c4{right:-7px;bottom:-7px;border-right-width:3px;border-bottom-width:3px;border-bottom-right-radius:8px}
#vw-rip{background:transparent;border:2.5px solid #fff;box-shadow:0 0 0 1px rgba(10,12,16,.5),inset 0 0 0 1px rgba(10,12,16,.5)}`,
    label: DARK_GLASS,
  },
}
export const DEFAULT_LOOK = 'ink'   // Tyler, 2026-11-24: Ink, no blur (blur made everything under the dim unreadable)
export const lookOf = name => LOOKS[name] || LOOKS[DEFAULT_LOOK]
