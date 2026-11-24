// One set of motion values for everything the walkthrough adds: cards in the page (overlays.js, via record.mjs)
// and labels drawn over the video (captions.mjs). Change them here, nowhere else.
export const MOTION = {
  in: 0.7,          // seconds: anything arriving
  out: 0.55,        // seconds: anything leaving
  stagger: 0.09,    // seconds between parts arriving one after another (kicker, title, lines)
  rise: 12,         // px an arriving part travels up
  blur: 18,         // px of background blur while a card covers the product
  ease: [0.4, 0, 0.2, 1],     // cubic-bezier for every transition (standard ease in and out; the old ease-out snapped cards away)
  label: 3.4,       // seconds a part label stays on the live screen
}

// cubic-bezier easing as a function of t in [0, 1] (for labels drawn frame by frame)
export function ease(t, [x1, y1, x2, y2] = MOTION.ease) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const bx = u => 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3
  const by = u => 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3
  let lo = 0, hi = 1
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (bx(m) < t) lo = m; else hi = m }
  return by((lo + hi) / 2)
}
