// Injected into the page at runtime by record.mjs. Never written into the prototype.
// Cursor, click ripple, spotlight, title/end cards. Captions and chapter labels are not here:
// they are drawn onto the video afterwards so they stay crisp and fixed when a close-up zoom runs.
(() => {
  if (window.__vw) return
  // motion values come from motion.mjs (record.mjs sets window.__vwMotion before injecting this file)
  // the look (look.mjs): how the spotlight, ripple and labels are drawn; record.mjs sets window.__vwLook
  const L = window.__vwLook || {}
  const M = window.__vwMotion || { in: 0.7, out: 0.55, stagger: 0.09, rise: 12, blur: 18, ease: [0.4, 0, 0.2, 1] }
  const st = document.createElement('style')
  st.textContent = `
  #vw-cur{position:fixed;left:0;top:0;width:22px;height:22px;z-index:100001;pointer-events:none;transform:translate(720px,520px);will-change:transform}
  #vw-cur svg{transition:transform .09s ease-out;transform-origin:3px 2px}#vw-cur.dn svg{transform:scale(.84)}
  #vw-rip{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;box-sizing:border-box;z-index:100000;pointer-events:none;opacity:0;transform:scale(.3)}
  #vw-rip.on{animation:vwr .5s ease-out}@keyframes vwr{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(1.4)}}
  #vw-spot{position:fixed;z-index:99998;pointer-events:none;opacity:0;transition:all .45s ease}
  #vw-blur{position:fixed;inset:0;z-index:99997;pointer-events:none;opacity:0;transition:opacity .45s ease,clip-path .45s ease}
  /* effects (step 4): one meaning each, one at a time, no added hue */
  .vw-glass{background:rgba(18,20,24,.92);color:#fff;font-family:-apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 12px 32px rgba(0,0,0,.3)}
  #vw-note{position:fixed;z-index:99999;pointer-events:none;max-width:460px;font-size:28px;font-weight:600;letter-spacing:-.015em;line-height:1.25;padding:16px 22px 17px;border-radius:18px;opacity:0;transform:translateY(${M.rise}px);transition:opacity ${M.out}s cubic-bezier(${M.ease.join(',')}),transform ${M.out}s cubic-bezier(${M.ease.join(',')})}
  #vw-note.on{opacity:1;transform:none;transition:opacity ${M.in}s cubic-bezier(${M.ease.join(',')}) .15s,transform ${M.in}s cubic-bezier(${M.ease.join(',')}) .15s}
  #vw-pulse{position:fixed;z-index:99999;pointer-events:none;border-radius:10px;opacity:0;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgba(10,12,16,.6),0 0 0 9px rgba(255,255,255,.35)}
  #vw-pulse.on{animation:vwp 1.6s cubic-bezier(${M.ease.join(',')})}@keyframes vwp{0%{opacity:0;transform:scale(1.18)}25%{opacity:1;transform:scale(1)}75%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
  #vw-before{position:fixed;inset:0;z-index:99996;pointer-events:none;opacity:0;transition:opacity ${M.in}s cubic-bezier(${M.ease.join(',')});background:#fff}
  #vw-before.on{opacity:1}#vw-before img{position:absolute;left:0;top:0;width:100vw;height:100vh;object-fit:cover;object-position:top left}
  #vw-before .pane{position:absolute;inset:0;overflow:hidden}
  #vw-div{position:fixed;top:0;bottom:0;width:3px;margin-left:-1.5px;z-index:99997;pointer-events:none;background:#fff;box-shadow:0 0 0 1px rgba(10,12,16,.45),0 0 24px rgba(10,12,16,.35);opacity:0}
  .vw-chip{position:fixed;bottom:28px;z-index:99998;pointer-events:none;font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1;padding:18px 24px;border-radius:20px;opacity:0;transition:opacity ${M.in}s ease}
  ${L.page || ''}
  #vw-card{--in:${M.in}s;--out:${M.out}s;--ease:cubic-bezier(${M.ease.join(',')});--rise:${M.rise}px;position:fixed;inset:0;z-index:100003;color:#f5f5f7;display:flex;align-items:center;justify-content:center;text-align:center;
    padding:0 120px;font-family:-apple-system,"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;pointer-events:none;
    background:rgba(0,0,0,0);-webkit-backdrop-filter:blur(0px);backdrop-filter:blur(0px);transition:background var(--out) var(--ease),backdrop-filter var(--out) var(--ease),-webkit-backdrop-filter var(--out) var(--ease)}
  #vw-card.on{background:#000;-webkit-backdrop-filter:blur(${M.blur}px);backdrop-filter:blur(${M.blur}px);transition:background var(--in) var(--ease),backdrop-filter var(--in) var(--ease),-webkit-backdrop-filter var(--in) var(--ease)}
  #vw-card .in{max-width:1240px}
  /* every part arrives the same way (rise and fade, one after another) and leaves the same way (shrink, blur, fade) */
  #vw-card .p{opacity:0;transform:translateY(var(--rise));transition:opacity var(--out) var(--ease),transform var(--out) var(--ease),filter var(--out) var(--ease)}
  #vw-card.on .p:not(.wait),#vw-card.on .p.shown{opacity:1;transform:none;filter:none;transition:opacity var(--in) var(--ease) var(--d,0s),transform var(--in) var(--ease) var(--d,0s)}
  #vw-card.leaving .p,#vw-card.on.leaving .p:not(.wait),#vw-card.on.leaving .p.shown{opacity:0;transform:scale(.97);filter:blur(6px);transition:opacity var(--out) var(--ease),transform var(--out) var(--ease),filter var(--out) var(--ease)}
  #vw-card .k{font-size:30px;font-weight:600;letter-spacing:.005em;color:#a1a1a6;margin:0 0 22px}
  #vw-card .t{font-size:96px;font-weight:700;letter-spacing:-.035em;line-height:1.04;margin:0}
  #vw-card .s{font-size:40px;font-weight:400;letter-spacing:-.01em;line-height:1.3;color:#a1a1a6;margin:26px 0 0}
  #vw-card .l{font-size:60px;font-weight:600;letter-spacing:-.03em;line-height:1.15;margin:0 0 14px}
  #vw-card .l .d{display:block;font-size:36px;font-weight:400;letter-spacing:-.005em;line-height:1.3;color:#a1a1a6;margin:8px 0 22px}
  /* agenda and recap: numbered, left-aligned in a centered column */
  #vw-card ol{list-style:none;margin:0;padding:0;display:inline-block;text-align:left}
  #vw-card li.l{display:grid;grid-template-columns:84px 1fr;align-items:baseline;font-size:60px;margin:0 0 28px}
  #vw-card li.l .n{font-size:52px;font-weight:600;color:#8e8e93;font-variant-numeric:tabular-nums}
  #vw-card .recap li.l{font-size:54px;margin:0 0 26px}#vw-card .recap li.l .d{margin:6px 0 0}
  #vw-card .f{position:absolute;left:0;right:0;bottom:44px;font-size:26px;color:#98989d;letter-spacing:.01em}`
  document.head.appendChild(st)
  const mk = (id, html) => { const d = document.createElement('div'); d.id = id; if (html) d.innerHTML = html; document.body.appendChild(d); return d }
  mk('vw-spot', L.corners ? '<i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>' : ''); mk('vw-rip'); mk('vw-card'); mk('vw-pulse')
  const note = mk('vw-note'); note.className = 'vw-glass'
  mk('vw-before', '<div class="pane"><img alt=""></div>'); mk('vw-div')
  const chipT = mk('vw-chip-today'), chipN = mk('vw-chip-new'); chipT.className = chipN.className = 'vw-chip vw-glass'
  if (L.blur) mk('vw-blur')
  mk('vw-cur', '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>')
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  window.__vw = {
    pos: { x: 720, y: 520 },
    // Human-looking move: a curved path (control point off the straight line), ease in and out, a small overshoot that settles.
    cursorTo(x, y, ms) {
      const el = document.getElementById('vw-cur'), a = { ...this.pos }, self = this
      const dx = x - a.x, dy = y - a.y, dist = Math.hypot(dx, dy) || 1
      const bend = Math.min(90, dist * 0.18) * (dx >= 0 ? 1 : -1) * (Math.random() < .5 ? 1 : .6)
      const c = { x: a.x + dx * .5 - dy / dist * bend, y: a.y + dy * .5 + dx / dist * bend }
      const over = dist > 120 ? { x: x + dx / dist * 7, y: y + dy / dist * 5 } : { x, y }
      const T = ms || Math.max(420, Math.min(1100, 300 + dist * 0.9))
      const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      return new Promise(res => {
        const t0 = performance.now()
        const put = (px, py) => { el.style.transform = `translate(${px - 3}px,${py - 2}px)`; self.pos = { x: px, y: py } }
        const step = now => {
          const k = Math.min(1, (now - t0) / T), e = ease(k), u = 1 - e
          put(u * u * a.x + 2 * u * e * c.x + e * e * over.x, u * u * a.y + 2 * u * e * c.y + e * e * over.y)
          if (k < 1) requestAnimationFrame(step)
          else { const t1 = performance.now(); const settle = n => { const kk = Math.min(1, (n - t1) / 160); put(over.x + (x - over.x) * kk, over.y + (y - over.y) * kk); if (kk < 1) requestAnimationFrame(settle); else res() }; requestAnimationFrame(settle) }
        }
        requestAnimationFrame(step)
      })
    },
    press(down) { document.getElementById('vw-cur').classList.toggle('dn', down) },
    ripple(x, y) { const r = document.getElementById('vw-rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on') },
    spot(x, y, w, h) {
      const s = document.getElementById('vw-spot'); Object.assign(s.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: 1 })
      const b = document.getElementById('vw-blur')
      if (b) {   // everything but the spot: a full-screen layer with a rounded hole cut where the spot is
        const W = innerWidth, H = innerHeight, r = 10
        b.style.clipPath = `path(evenodd, 'M0 0H${W}V${H}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z')`
        b.style.opacity = 1
      }
    },
    // note: a short reason beside the spotlighted rect, placed where it fits (right, left, below, above)
    note(x, y, w, h, text) {
      const n = document.getElementById('vw-note'), G = 22, P = 24
      n.textContent = text; n.classList.remove('on'); n.style.left = '0px'; n.style.top = '0px'
      const bw = n.offsetWidth, bh = n.offsetHeight, W = innerWidth, H = innerHeight
      const cy = Math.min(H - bh - P, Math.max(P, y + h / 2 - bh / 2)), cx = Math.min(W - bw - P, Math.max(P, x + w / 2 - bw / 2))
      const spots = [[x + w + G, cy, x + w + G + bw <= W - P], [x - G - bw, cy, x - G - bw >= P], [cx, y + h + G, y + h + G + bh <= H - P], [cx, y - G - bh, y - G - bh >= P]]
      const [lx, ly] = (spots.find(s => s[2]) || [W - bw - P, H - bh - P])
      n.style.left = lx + 'px'; n.style.top = ly + 'px'
      void n.offsetWidth; n.classList.add('on')
    },
    unnote() { document.getElementById('vw-note').classList.remove('on') },
    // changed: one two-tone ring pulse around a value that just changed
    pulse(x, y, w, h) { const e = document.getElementById('vw-pulse'); Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); e.classList.remove('on'); void e.offsetWidth; e.classList.add('on') },
    // compare: today's screen over the prototype. wipe(f) brings the new design in from the right: today keeps the
    // left of the divider (its label in the bottom-left corner), the new design the right (its label rides the divider)
    compare(src, today, now) {
      const b = document.getElementById('vw-before'), d = document.getElementById('vw-div'), ct = document.getElementById('vw-chip-today'), cn = document.getElementById('vw-chip-new')
      b.querySelector('img').src = src; b.style.transition = 'none'; b.style.clipPath = 'inset(0 0 0 0)'; d.style.transition = 'none'; d.style.left = innerWidth + 'px'; d.style.opacity = 0
      ct.textContent = today; cn.textContent = now; ct.style.left = '28px'; cn.style.transition = 'none'; cn.style.left = (innerWidth + 28) + 'px'; cn.style.opacity = 0
      void b.offsetWidth; b.style.transition = ''; cn.style.transition = ''
      b.classList.add('on'); ct.style.opacity = 1
    },
    wipe(f, ms) {
      const b = document.getElementById('vw-before'), d = document.getElementById('vw-div'), ct = document.getElementById('vw-chip-today'), cn = document.getElementById('vw-chip-new')
      const W = innerWidth, x = Math.round(W * (1 - f)), e = `${ms / 1000}s cubic-bezier(${M.ease.join(',')})`
      b.style.transition = `clip-path ${e},opacity ${M.in}s`; d.style.transition = `left ${e},opacity .3s`; cn.style.transition = `left ${e},opacity ${M.in}s`
      d.style.opacity = f > 0 && f < 1 ? 1 : 0
      b.style.clipPath = `inset(0 ${W - x}px 0 0)`; d.style.left = x + 'px'; cn.style.left = (f >= 1 ? 28 : x + 28) + 'px'
      cn.style.opacity = f > 0 ? 1 : 0; ct.style.opacity = f < 1 ? 1 : 0
    },
    uncompare() { for (const id of ['vw-before', 'vw-div']) { const e = document.getElementById(id); e.classList.remove('on'); e.style.opacity = 0 } for (const id of ['vw-chip-today', 'vw-chip-new']) document.getElementById(id).style.opacity = 0; setTimeout(() => { const b = document.getElementById('vw-before'); b.style.opacity = '' }, 900) },
    unspot() { document.getElementById('vw-spot').style.opacity = 0; const b = document.getElementById('vw-blur'); if (b) b.style.opacity = 0 },
    // card: { kicker, title, sub, lines: [..], footer, type }; a line can be [headline, detail].
    // type: 'title' (has a title), 'agenda' (numbered list), 'recap' (numbered headlines with detail), 'statement' (centered lines).
    // Inferred when not given. reveal: true keeps the lines hidden until reveal(i) (record.mjs times them to the narration).
    card(c, instant) {
      const el = document.getElementById('vw-card')
      clearTimeout(this._leave); clearTimeout(this._swap)
      this._shown = new Set()
      // one card replacing another: the old parts leave first, the black stays, then the new parts arrive
      if (!instant && el.classList.contains('on') && el.querySelector('.p')) {
        el.classList.add('leaving')
        this._swap = setTimeout(() => { el.classList.remove('leaving'); this.build(c) }, M.out * 1000)
        return
      }
      el.classList.remove('leaving')
      this.build(c, instant)
    },
    build(c, instant) {
      const el = document.getElementById('vw-card')
      const lines = c.lines || []
      const type = c.type || (c.title ? 'title' : lines.some(Array.isArray) ? 'recap' : /what you.ll see|agenda|today/i.test(c.kicker || '') ? 'agenda' : 'statement')
      let d = 0
      const part = (cls, html, wait) => `<${cls[0]} class="${cls[1]} p${wait ? ' wait' : ''}" style="--d:${wait ? 0 : (d++ * M.stagger).toFixed(2)}s">${html}</${cls[0]}>`
      const line = (l, i) => Array.isArray(l) ? `${esc(l[0])}<span class="d">${esc(l[1])}</span>` : esc(l)
      const list = type === 'agenda' || type === 'recap'
        ? `<ol class="${type}">${lines.map((l, i) => part(['li', 'l'], `<span class="n">${i + 1}</span><span>${line(l, i)}</span>`, c.reveal)).join('')}</ol>`
        : lines.map((l, i) => part(['p', 'l'], line(l, i), c.reveal)).join('')
      el.innerHTML = '<div class="in">' + (c.kicker ? part(['p', 'k'], esc(c.kicker)) : '') + (c.title ? part(['h1', 't'], esc(c.title)) : '') + list + (c.sub ? part(['p', 's'], esc(c.sub)) : '') + '</div>' + (c.footer ? part(['div', 'f'], esc(c.footer)) : '')
      if (instant) { el.style.transition = 'none'; el.querySelectorAll('.p').forEach(x => x.style.transition = 'none') }
      void el.offsetWidth
      el.classList.add('on')
      for (const i of this._shown || []) this.reveal(i)
      if (instant) setTimeout(() => { el.style.transition = ''; el.querySelectorAll('.p').forEach(x => x.style.transition = '') }, 50)
    },
    reveal(i) { (this._shown ||= new Set()).add(i); const l = document.querySelectorAll('#vw-card .l')[i]; if (l) l.classList.add('shown') },
    hideCard() {
      const el = document.getElementById('vw-card')
      if (!el.classList.contains('on')) return
      window.__vwEvent?.('hide')   // record.mjs logs every real hide, however it was called
      el.classList.remove('on'); el.classList.add('leaving')
      this._leave = setTimeout(() => { el.classList.remove('leaving'); el.innerHTML = '' }, M.out * 1000 + 80)
    },
  }
})()
