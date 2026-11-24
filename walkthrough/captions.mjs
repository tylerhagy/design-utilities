// Draws captions, chapter labels and part labels as transparent full-frame PNGs, one per interval, for mux.py to lay
// over the video. Done after recording so they stay sharp and fixed when a close-up zoom runs. Chapter and part labels
// sit in one reserved corner, bottom left (product actions live top right, the main button bottom right), and
// arrive and leave with the shared motion (motion.mjs), drawn frame by frame during the transition.
import fs from 'fs'
import { MOTION, ease } from './motion.mjs'

const CSS = `
html,body{margin:0;background:transparent}
body{width:var(--w);height:var(--h);position:relative;font-family:-apple-system,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
#cap{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);max-width:1240px;background:rgba(10,14,20,.85);color:#f2f4f7;font-weight:500;font-size:36px;line-height:1.32;letter-spacing:-.01em;padding:14px 28px 15px;border-radius:16px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.28)}
#cap b{font-weight:700;color:#fff;background:linear-gradient(transparent 62%,rgba(66,153,255,.55) 62%)}
#chap{position:absolute;left:28px;bottom:28px;background:rgba(12,16,22,.9);color:#f5f5f7;font-weight:600;font-size:30px;letter-spacing:-.02em;line-height:1;padding:18px 24px;border-radius:20px;box-shadow:0 10px 32px rgba(0,0,0,.3)}
#part{position:absolute;left:28px;bottom:28px;max-width:720px;background:rgba(12,16,22,.9);color:#f5f5f7;border-radius:20px;padding:20px 26px 22px;box-shadow:0 10px 32px rgba(0,0,0,.3)}
#part .pk{font-size:20px;font-weight:600;color:#a1a1a6;letter-spacing:.005em;margin:0 0 6px}
#part .pt{font-size:34px;font-weight:600;letter-spacing:-.02em;line-height:1.2}
#part .bars{display:flex;gap:8px;margin-top:16px}
#part .bars i{display:block;width:48px;height:6px;border-radius:3px;background:rgba(255,255,255,.2)}
#part .bars i.done{background:rgba(255,255,255,.6)}#part .bars i.cur{background:#2997ff}`

const FPS = 30
// visibility of a label at time t: rises in over MOTION.in, holds, falls out over MOTION.out (0..1, eased)
const level = (e, t) => ease(Math.min(1, Math.max(0, (t - e.from) / MOTION.in), Math.max(0, (e.to - t) / MOTION.out)))

// events: { caps:[{from,to,x}], chapters:[{from,to,x}], parts:[{from,to,i,items}] } in absolute seconds.
// Returns [{from,to,png}] (png null = nothing shown).
export async function renderCaptions(browser, { caps, chapters, parts = [] }, dir, viewport, dsf = 1, look = {}) {
  fs.mkdirSync(dir, { recursive: true })
  const cuts = new Set()
  for (const e of [...caps, ...chapters, ...parts]) { cuts.add(+e.from.toFixed(3)); cuts.add(+e.to.toFixed(3)) }
  for (const e of [...chapters, ...parts]) {             // a cut every frame while a label moves
    for (let t = e.from; t < Math.min(e.to, e.from + MOTION.in); t += 1 / FPS) cuts.add(+t.toFixed(3))
    for (let t = Math.max(e.from, e.to - MOTION.out); t < e.to; t += 1 / FPS) cuts.add(+t.toFixed(3))
  }
  const pts = [...cuts].sort((a, b) => a - b)
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf })
  const p = await ctx.newPage()
  const out = []
  const cache = new Map()
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const em = s => esc(s).replace(/(\$?\d(?:[\d,.:]*\d)?%?(?:\s(?:payments?|files?|meters?|items?))?)/g, '<b>$1</b>')   // numbers and amounts get the emphasis
  const moving = k => `opacity:${k.toFixed(2)};transform:translateY(${((1 - k) * MOTION.rise).toFixed(1)}px)`
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], mid = (a + b) / 2
    const cap = caps.find(c => c.from <= mid && mid < c.to)
    const chap = chapters.find(c => c.from <= mid && mid < c.to)
    const part = parts.find(c => c.from <= mid && mid < c.to)
    const kc = chap ? +level(chap, mid).toFixed(2) : 0, kp = part ? +level(part, mid).toFixed(2) : 0
    if (!cap && !kc && !kp) { out.push({ from: a, to: b, png: null }); continue }
    const key = [cap ? cap.x : '', chap ? chap.x + '@' + kc : '', part ? part.i + '/' + part.items.length + '@' + kp : ''].join('|')
    let png = cache.get(key)
    if (!png) {
      png = `${dir}/c${String(cache.size + 1).padStart(4, '0')}.png`
      const partHtml = part && kp ? `<div id=part style="${moving(kp)}"><div class=pk>Part ${part.i + 1} of ${part.items.length}</div><div class=pt>${esc(part.items[part.i])}</div><div class=bars>${part.items.map((_, j) => `<i class="${j < part.i ? 'done' : j === part.i ? 'cur' : ''}"></i>`).join('')}</div></div>` : ''
      await p.setContent(`<style>${CSS}${look.label || ''}</style><body style="--w:${viewport.width}px;--h:${viewport.height}px">${cap ? `<div id=cap>${em(cap.x)}</div>` : ''}${chap && kc ? `<div id=chap style="${moving(kc)}">${esc(chap.x)}</div>` : ''}${partHtml}</body>`)
      await p.screenshot({ path: png, omitBackground: true })
      cache.set(key, png)
    }
    out.push({ from: a, to: b, png })
  }
  await ctx.close()
  // blank frame for gaps
  const ctx2 = await browser.newContext({ viewport, deviceScaleFactor: dsf })
  const p2 = await ctx2.newPage()
  await p2.setContent(`<style>html,body{margin:0;background:transparent}</style><body></body>`)
  await p2.screenshot({ path: `${dir}/blank.png`, omitBackground: true })
  await ctx2.close()
  return out
}
