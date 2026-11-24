#!/usr/bin/env node
// Records a narrated walkthrough of an HTML prototype.
//   (--dry --fast runs through the cues without waiting for the narration clock: quick selector checks)
//   node record.mjs <scenes.mjs> [--prototype <file|url>] [--out <dir>] [--short] [--dry] [--voice "Evan (Enhanced)"] [--rate 170]
//   python3 mux.py <out dir>            (joins video, narration, captions and zoom into walkthrough.mp4 and .srt)
// --dry takes a screenshot at every cue instead of recording video. --short records only scenes marked core.
// --from <scene id> re-records from that scene to the end and keeps the earlier take before it (the scenes before it
//   must be unchanged; they replay quickly off camera so the prototype is in the same state).
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { parseArgs, loadScenes, makeAudio, resolveVoice, totalSeconds, loadPlaywright, findHeadlessShell, phraseTime, phraseTimeAt, GAP, CUE_LEAD, LEAD_IN, fmt, spoken, lintScenes, printLint, joinAudio } from './lib.mjs'
import { renderCaptions } from './captions.mjs'
import { startCapture } from './capture.mjs'
import { MOTION } from './motion.mjs'
import { lookOf } from './look.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
if (!args._[0]) { console.error('usage: node record.mjs <scenes.mjs> [--prototype file|url] [--out dir] [--short] [--dry]'); process.exit(1) }
const SHORT = !!args.short, DRY = !!args.dry, FROM = !DRY && args.from
let FAST = DRY && !!args.fast   // --dry --fast skips waiting for the narration clock (and --from replays earlier scenes this way)
const cfg = await loadScenes(args._[0], { short: SHORT })
const name = path.basename(cfg.__file).replace(/\.mjs$/, '')
const OUT = path.resolve(args.out || path.join(os.tmpdir(), 'walkthrough-' + name)) + (SHORT ? '/short' : '')
fs.mkdirSync(OUT, { recursive: true })
const { voice, rate } = resolveVoice(cfg, args)
const scenes = cfg.active
const VP = cfg.viewport
const OUTW = cfg.outWidth || 1920, OUTH = Math.round(OUTW * VP.height / VP.width / 2) * 2
const SC = DRY ? 1 : (cfg.scale || 2)      // 2x capture (capture.mjs): close-ups stay sharp. scale: 1 for a quicker, softer take
const BURN = cfg.captions === true          // captions are not drawn into the video unless the scenes file asks; the .srt is always written (Tyler, 2026-11-22)

// prototype location: --prototype, else cfg.prototype (relative to the scenes file), file path or http(s) URL
const proto = args.prototype || cfg.prototype
if (!proto) throw new Error('No prototype: set `prototype` in the scenes file or pass --prototype')
const URL_ = /^(https?|file|data):/.test(proto) ? proto : 'file://' + (path.isAbsolute(proto) ? proto : path.resolve(cfg.__dir, proto))

// 1. voice (script checks first: warnings only)
printLint(lintScenes(cfg))
makeAudio(cfg, scenes, OUT, { voice, rate })
console.log(`voice: ${voice} @ ${rate} · narration ${fmt(totalSeconds(scenes))} (${SHORT ? 'short cut' : 'full'})`)

// --from: the earlier take, and a check that nothing before the scene changed
let OLD = null
if (FROM) {
  if (!fs.existsSync(`${OUT}/marks.json`)) throw new Error(`--from needs an earlier take in ${OUT}`)
  OLD = JSON.parse(fs.readFileSync(`${OUT}/marks.json`, 'utf8'))
  OLD.from = OLD.marks.find(k => k.id === FROM)
  if (!OLD.from || !scenes.some(s => s.id === FROM)) throw new Error(`--from ${FROM}: no such scene in the earlier take and the scenes file`)
  for (const s of scenes.slice(0, scenes.findIndex(s => s.id === FROM))) {
    if (s.skipped) continue
    const was = OLD.caps.filter(c => c.scene === s.id).map(c => c.x).join(' '), now_ = s.sents.map(o => o.x).join(' ')
    if (was !== now_) throw new Error(`--from ${FROM}: scene ${s.id} changed since the earlier take; record from ${s.id} or earlier`)
  }
}

// 2. browser
const { chromium } = await loadPlaywright()
const exe = findHeadlessShell()
// --force-device-scale-factor makes the screencast deliver 2x frames (deviceScaleFactor alone does not, 2026-11-23)
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: SC > 1 ? [`--force-device-scale-factor=${SC}`] : [] })
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: SC })
const p = await ctx.newPage()
let T0 = Date.now(); const now = () => (Date.now() - T0) / 1000
fs.mkdirSync(`${OUT}/raw`, { recursive: true })
const vpath = DRY ? null : `${OUT}/raw/take-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`
let cap = DRY || FROM ? null : await startCapture(ctx, p, vpath, { t0: T0, width: VP.width * SC, height: VP.height * SC })
if (FROM) FAST = true   // replay the scenes before --from quickly, off camera
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.exposeFunction('__vwEvent', k => { if (k === 'hide') h.hides.push(now()) })   // the page reports card hides
await p.goto(URL_)
await p.waitForTimeout(cfg.settle ?? 2500)
const LOOK = lookOf(args.look || cfg.look)
await p.evaluate(([m, l]) => { window.__vwMotion = m; window.__vwLook = l }, [MOTION, LOOK])
await p.evaluate(fs.readFileSync(path.join(HERE, 'overlays.js'), 'utf8'))
if (cfg.intro) await p.evaluate(c => window.__vw.card(c, true), cfg.intro)

// helper API: passed to built-in and custom actions
const ev = (fn, a) => p.evaluate(fn, a)
const h = { p, ev, state: {}, cueLog: [], cur: { x: VP.width / 2, y: 520 }, zooms: [], zoomOpen: null, clicks: [], cards: [], hides: [], sounds: [] }
h.wait = ms => p.waitForTimeout(ms)
h.moveTo = async (x, y) => { h.cur = { x, y }; await ev(([x, y]) => window.__vw.cursorTo(x, y), [x, y]); await p.waitForTimeout(FAST ? 0 : 160) }   // a short hover on arrival
h.rip = async () => { await ev(() => window.__vw.press(true)); await p.waitForTimeout(90); h.clicks.push(now()); (h.clickAt ||= []).push({ t: now(), x: h.cur.x, y: h.cur.y, pops: [] }); await ev(([x, y]) => { window.__vw.ripple(x, y); window.__vw.press(false) }, [h.cur.x, h.cur.y]) }
// regions: named areas in the scenes file ({x,y,width,height} or a function returning a Locator or rect)
h.box = async sel => {
  const r = cfg.regions && cfg.regions[sel]
  if (r) {
    if (typeof r === 'object' && 'x' in r) return r
    const v = await r(h)
    return v && 'x' in v ? v : await v.boundingBox()
  }
  const L = p.locator(sel).first()
  await L.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(150)
  return await L.boundingBox()
}
h.unspot = () => ev(() => window.__vw.unspot())
h.unnote = () => ev(() => window.__vw.unnote())
h.clear = async () => { await ev(() => { window.__vw.unspot(); window.__vw.unnote() }) }   // one effect at a time
const padBox = (bb, pad = 6) => [bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2]
// today's screen for compare: an image file (relative to the scenes file), or a page (file or URL) screenshotted at the viewport
h.snaps = {}
h.snapshot = async src => {
  if (h.snaps[src]) return h.snaps[src]
  if (/\.(png|jpe?g|webp)$/i.test(src)) { const f = path.isAbsolute(src) ? src : path.resolve(cfg.__dir, src); return `data:image/${/png$/i.test(f) ? 'png' : 'jpeg'};base64,` + fs.readFileSync(f).toString('base64') }
  const u = /^(https?|file|data):/.test(src) ? src : 'file://' + (path.isAbsolute(src) ? src : path.resolve(cfg.__dir, src))
  const q = await ctx.newPage(); await q.goto(u); await q.waitForTimeout(1500)
  const b = await q.screenshot({ type: 'png' }); await q.close()
  return 'data:image/png;base64,' + b.toString('base64')
}
h.spot = async sel => {
  const bb = await h.box(sel); if (!bb) throw new Error('spot: nothing at ' + sel)
  const pad = 6
  await ev(([x, y, w, ww]) => window.__vw.spot(x, y, w, ww), [bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2])
}
h.click = async sel => {
  const L = p.locator(sel).first()
  await L.scrollIntoViewIfNeeded().catch(() => {})
  const bb = await L.boundingBox(); if (!bb) throw new Error('click: nothing at ' + sel)
  await h.moveTo(bb.x + Math.min(bb.width / 2, bb.width - 14), bb.y + bb.height / 2)
  const before = CAMERA ? await screenState() : null
  await h.rip(); await L.click(); await p.waitForTimeout(300)
  if (CAMERA) { const after = await screenState(); Object.assign(h.clickAt.at(-1), { bb, ...cameraFacts(before, after) }) }
}
// camera rules need to know what a click did: did the screen change, and did a menu, picker or dialog open?
const CAMERA = !DRY && (args.camera || cfg.camera || 'follow') === 'follow'   // on by default under its rules (Tyler, 2026-11-24); camera: 'off' turns it off
const screenState = () => p.evaluate(() => ({
  url: location.href,
  lines: document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 1500),
  pops: [...document.querySelectorAll('[role=menu],[role=listbox],[role=dialog],[role=tooltip],.MuiPopover-paper,.MuiMenu-paper')]
    .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
}))
function cameraFacts(a, b) {
  const A = new Set(a.lines), B = new Set(b.lines)
  const diff = [...A].filter(x => !B.has(x)).length + [...B].filter(x => !A.has(x)).length
  const key = r => [r.x, r.y, r.width, r.height].map(Math.round).join()
  const old = new Set(a.pops.map(key))
  return { nav: a.url !== b.url, change: diff / Math.max(A.size, B.size, 1), pops: b.pops.filter(r => !old.has(key(r))) }
}
h.choose = async ([sel, opt]) => {
  await h.click(sel)
  const o = p.locator(`li[role=option]:has-text("${opt}"), [role=option]:has-text("${opt}"), option:has-text("${opt}")`).first()
  const bb = await o.boundingBox()
  await h.moveTo(bb.x + 60, bb.y + bb.height / 2); await h.rip(); await o.click(); await p.waitForTimeout(350)
}
// a named sound at this moment (mux.py places it): 'done' when work completes, 'key' per typed character
h.sound = name => { h.sounds.push({ t: now(), name }) }
h.key = async ch => { h.sound('key'); await p.keyboard.type(ch) }
h.type = async ([sel, text]) => { await h.click(sel); for (const ch of text) { await h.key(ch); await p.waitForTimeout(45 + Math.random() * 75 + (/[ .,]/.test(ch) ? 60 : 0)) } await p.waitForTimeout(450) }
h.zoomTo = async arg => {
  const o = typeof arg === 'string' ? { sel: arg } : arg
  const bb = await h.box(o.sel); if (!bb) throw new Error('zoom: nothing at ' + o.sel)
  const pad = o.pad ?? 40, max = o.max ?? 2.2
  let x = bb.x - pad, y = bb.y - pad, w = bb.width + pad * 2, hh = bb.height + pad * 2
  const z = Math.max(1, Math.min(max, VP.width / w, VP.height / hh))
  const rect = { cx: Math.min(VP.width - VP.width / z / 2, Math.max(VP.width / z / 2, x + w / 2)), cy: Math.min(VP.height - VP.height / z / 2, Math.max(VP.height / z / 2, y + hh / 2)), z }
  await h.unzoom()
  h.zoomOpen = { from: now(), ...rect }
  if (DRY) { const cw = VP.width / z, ch = VP.height / z; await p.screenshot({ path: `${OUT}/dry/zoom-${String(h.shot + 1).padStart(2, '0')}.png`, clip: { x: rect.cx - cw / 2, y: rect.cy - ch / 2, width: cw, height: ch } }) }
}
h.unzoom = async () => { if (h.zoomOpen) { h.zooms.push({ ...h.zoomOpen, to: now() }); h.zoomOpen = null } }
// card and hide times go into marks.json so the mix can place transition sounds and music
const cardOf = c => c === 'outro' ? cfg.outro : c === 'intro' ? cfg.intro : c
h.card = c => { h.cards.push({ t: now(), kind: c === 'outro' || c?.__kind === 'outro' ? 'outro' : c === 'intro' ? 'intro' : 'card' }); return ev(x => window.__vw.card(x), cardOf(c)) }
// A card's lines appear as the narration reaches them: each line's headline (or its first words) is found in the
// scene's narration after the card's cue, and revealed just before it is spoken. If any line can't be found, the
// lines arrive together, one after another, as the card opens.
const REVEAL_LEAD = 0.25
const norm = t => t.toLowerCase().replace(/[\u2018\u2019]/g, "'")
function cardReveals(s, phraseIdx, card) {
  const lines = card?.lines || []
  if (lines.length < 2) return null
  const text = norm(s.text), out = []
  let from = phraseIdx
  for (const l of lines) {
    const head = norm(Array.isArray(l) ? l[0] : l).replace(/[.!?:,]+$/, '')
    const words = head.split(/\s+/)
    const tries = [head, words.slice(0, 4).join(' '), words.slice(0, 3).join(' ')].filter((x, i, a) => x.length >= 8 && a.indexOf(x) === i)
    let at = -1
    for (const q of tries) { const k = text.indexOf(q, from); if (k >= 0) { at = k; break } }
    if (at < 0) return null
    out.push(at); from = at + 1
  }
  return out
}

const BUILT = {
  spot: async a => { await h.unnote(); await h.spot(a) },
  // note: the spotlight plus a short reason beside it ("why it's built this way"); a scenes file writes [selector, text]
  note: async ([sel, text]) => { await h.unnote(); await h.spot(sel); const bb = await h.box(sel); await ev(([b, t]) => window.__vw.note(...b, t), [padBox(bb), text]) },
  unnote: () => h.unnote(),
  // changed: one ring pulse around a value that just changed
  changed: async a => { await h.clear(); const bb = await h.box(a); if (!bb) throw new Error('changed: nothing at ' + a); await ev(b => window.__vw.pulse(...b), padBox(bb)) },
  // compare: today's screen over the prototype, labeled; then wipe (to 1 by default, or 0.5 to hold a split)
  compare: async a => { const o = typeof a === 'string' ? { before: a } : a; await h.clear(); const src = await h.snapshot(o.before); await ev(([s, t, n]) => window.__vw.compare(s, t, n), [src, o.today || 'Today', o.now || 'New']); h.compareOn = true },
  wipe: async a => { const o = typeof a === 'number' ? { to: a } : (a || {}); const to = o.to ?? 1, ms = o.ms ?? 1600; await ev(([f, m]) => window.__vw.wipe(f, m), [to, ms]); if (to >= 1) { await p.waitForTimeout(ms); await ev(() => window.__vw.uncompare()); h.compareOn = false } },
  uncompare: async () => { await ev(() => window.__vw.uncompare()); h.compareOn = false },
  unspot: () => h.unspot(),
  click: async a => { await h.clear(); await h.click(a) },
  choose: async a => { await h.unspot(); await h.choose(a) },
  type: async a => { await h.unspot(); await h.type(a) },
  scroll: async a => { if (typeof a === 'number') { for (let i = 1; i <= 12; i++) { await p.mouse.wheel(0, a * (Math.sin(Math.PI * i / 12) - Math.sin(Math.PI * (i - 1) / 12)) / 2); await p.waitForTimeout(32) } } else await p.locator(a).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(500) },
  wait: a => p.waitForTimeout(a),
  sound: a => h.sound(a),
  waitfor: a => p.locator(a).first().waitFor({ timeout: 5000 }),   // hold until something is on screen, then carry on
  press: a => p.keyboard.press(a),
  card: a => h.card(a),
  __line: i => ev(i => window.__vw.reveal(i), i),
  hidecard: () => ev(() => window.__vw.hideCard()),
  zoom: a => h.zoomTo(a),
  unzoom: () => h.unzoom(),
}
const act = async (name, arg) => (cfg.actions && cfg.actions[name]) ? cfg.actions[name](h, arg) : BUILT[name](arg)

if (cfg.setup) await cfg.setup(h)
// today's screens for compare are made now, so a compare shows the moment its cue comes
for (const sc of scenes) for (const [, a, arg] of sc.cues || []) if (a === 'compare') { const src = typeof arg === 'string' ? arg : arg.before; h.snaps[src] = await h.snapshot(src) }
if (DRY) fs.mkdirSync(`${OUT}/dry`, { recursive: true })

// 3. play scenes
const marks = [], caps = [], chapters = [], pauses = [], parts = [], takes = []
h.shot = 0
let first = true, lastChapter = null
for (const s of scenes) {
  if (FROM && s.id === FROM) {
    // from here on it's a real take: the clock picks up where the earlier take had this scene, and the replay's marks go
    FAST = false
    await h.unzoom(); await h.unspot(); await p.waitForTimeout(600)
    T0 = Date.now() - OLD.from.st * 1000
    cap = await startCapture(ctx, p, vpath, { t0: Date.now(), width: VP.width * SC, height: VP.height * SC })
    for (const a of [marks, caps, chapters, pauses, parts, h.cueLog, h.clicks, h.cards, h.hides, h.sounds, h.zooms]) a.length = 0
    h.zoomOpen = null
    if (OLD.chapters.some(c => c.from < OLD.from.st && c.x === s.chapter)) lastChapter = s.chapter
  }
  if (s.skipped) { for (const [a, arg] of s.quiet) { try { await act(a, arg) } catch (e) { errs.push(`${s.id} quiet ${a}: ${e.message.split('\n')[0]}`) } } continue }
  const st = now()                                   // the scene begins; the screen settles, then the narration starts
  const lead = s.lead ?? LEAD_IN, a0 = st + lead      // a0 = when the voice is planned to start
  // a scene that starts a part of the agenda gets the part label over the live screen (and no chapter label then)
  const partNo = typeof s.part === 'number' ? s.part : (cfg.agenda || []).indexOf(s.part) + 1
  if (cfg.agenda && partNo > 0) parts.push({ from: st, to: st + MOTION.label, i: partNo - 1, items: cfg.agenda })
  else if (s.chapter && s.chapter !== lastChapter) chapters.push({ from: st, to: st + Math.min(4, lead + s.dur), x: s.chapter })
  lastChapter = s.chapter || lastChapter
  // The screen leads, the voice follows. Actions run one after another in the background, each starting at its
  // planned time (CUE_LEAD before its phrase). When a sentence comes due while an action is still running, and a cue in
  // that sentence (or one already overdue) would start late because of it, the sentence moves back by exactly that much,
  // and everything after it moves with it. Audio is placed afterward (mux.py), so the move costs nothing but a short
  // silence; a click or typing that simply overlaps the words is left alone.
  const sentOf = ph => { const i = s.text.indexOf(ph); const k = s.sents.findIndex(o => i >= o.start && i < o.start + o.x.length); return k < 0 ? 0 : k }
  const sentAt = i => { const k = s.sents.findIndex(o => i >= o.start && i < o.start + o.x.length); return k < 0 ? 0 : k }
  const cues = []
  for (const [ph, a, arg] of s.cues) {
    const c = { k: 'cue', t: Math.max(st, a0 + phraseTime(s, ph) - CUE_LEAD), at: a0 + phraseTime(s, ph), ph, a, arg, sent: sentOf(ph), state: 'new' }
    cues.push(c)
    const reveal = a === 'card' && cardReveals(s, s.text.indexOf(ph), cardOf(arg))
    if (reveal) {
      c.arg = { ...cardOf(arg), reveal: true, __kind: arg === 'outro' ? 'outro' : 'card' }
      reveal.forEach((idx, i) => cues.push({ k: 'cue', t: Math.max(c.t + 0.4 + i * MOTION.stagger, a0 + phraseTimeAt(s, idx) - REVEAL_LEAD), at: a0 + phraseTimeAt(s, idx), ph: s.text.slice(idx, idx + 24), a: '__line', arg: i, sent: sentAt(idx), state: 'new' }))
    }
  }
  const evs = [...s.sents.map((o, i) => ({ k: 'say', i, t: a0 + o.at })), ...cues].sort((x, y) => x.t - y.t || (x.k === y.k ? 0 : x.k === 'cue' ? -1 : 1))   // stable: cues on one phrase keep their order
  let shift = 0, queue = Promise.resolve()
  const said = [], logFrom = h.cueLog.length
  const run = c => {
    c.state = 'queued'; c.planned = c.t + shift
    queue = queue.then(async () => {
      c.state = 'run'; c.start = now(); let fail = null
      try { await act(c.a, c.arg) } catch (err) { fail = err.message.split('\n')[0]; errs.push(`${s.id} ${c.a} ${JSON.stringify(c.arg)}: ${fail}`) }
      c.state = 'done'
      // cue timing for check.py: planned start (after any move), actual start and end, and when its phrase is spoken
      h.cueLog.push(c.log = { scene: s.id, a: c.a, arg: typeof c.arg === 'string' ? c.arg : JSON.stringify(c.arg ?? ''), phrase: c.ph, planned: c.planned, at: c.at + (c.planned - c.t), start: c.start, end: now(), ...(fail ? { fail } : {}) })
      if (DRY) await p.screenshot({ path: `${OUT}/dry/${String(++h.shot).padStart(2, '0')}-${s.id}-${c.a}.png` })
    })
  }
  for (const e of evs) {
    const due = e.t + shift
    const w = due * 1000 - (Date.now() - T0); if (w > 0 && !FAST) await p.waitForTimeout(w)
    if (e.k === 'cue') { run(e); if (FAST) await queue; continue }
    // a sentence: would any of its own cues start late? (a late cue from an earlier sentence can't be helped by waiting)
    const blockers = cues.filter(c => c.sent === e.i && (c.state === 'queued' || c.state === 'new'))
    let delay = 0
    const busyWith = cues.find(c => c.state === 'run') || cues.find(c => c.state === 'queued')
    if (blockers.length && busyWith) {
      await queue                                     // let the running action finish, then see how late things are
      const I = now()
      delay = Math.max(0, ...blockers.map(c => c.state === 'new' ? I - (c.t + shift) : c.start - c.planned))
    }
    if (delay > 0.05 && !FAST) {
      shift += delay; pauses.push({ scene: s.id, sentence: e.i, t: due, added: +delay.toFixed(2), after: `${busyWith.a} ${typeof busyWith.arg === 'string' ? busyWith.arg : ''}`.trim() })
      for (const c of blockers) if (c.log) { c.planned = c.log.planned = c.t + shift; c.log.at = c.at + shift }   // they ran early for their old time; on time for the new one
    }
    said[e.i] = e.t + shift
  }
  await queue
  const sceneEnd = a0 + s.dur + shift
  for (const c of h.cueLog.slice(logFrom)) c.sceneEnd = sceneEnd
  // the scene's narration as it was actually timed; mux.py places it at `at`
  const v0 = said[0]
  const clips = s.sents.map((o, i) => ({ wav: o.wav, dur: o.dur, at: said[i] - v0 }))
  const take = `${OUT}/audio/${s.id}.take.wav`
  if (!DRY) takes.push([clips, take])   // joined after recording: a blocking ffmpeg call here would stall frame capture
  marks.push({ id: s.id, st, at: v0, dur: sceneEnd - v0, wav: DRY ? undefined : take })
  caps.push(...s.sents.map((o, i) => ({ from: said[i], to: i + 1 < s.sents.length ? said[i + 1] : sceneEnd, x: o.x, said: spoken(cfg, o.x), scene: s.id })))
  const w = sceneEnd * 1000 - (Date.now() - T0); if (w > 0 && !FAST) await p.waitForTimeout(w)
  await h.unzoom(); await h.unnote()
  if (first && cfg.intro) await ev(() => window.__vw.hideCard())   // scene 1's card (the intro, or the agenda it put up) clears as scene 1 ends; scenes files rely on this
  first = false
  await p.waitForTimeout((s.beat ?? GAP) * 1000)   // a beat of silence so the result registers before the next scene
}
await p.waitForTimeout(cfg.tail ?? 2500)
await h.unzoom()
const END = now()
if (cap) await cap.stop(T0 + END * 1000)
for (const [clips, take] of takes) joinAudio(clips, take)
// the video as segments on the timeline: the whole take, or the earlier take up to --from and this one after it
let videos = vpath ? [{ file: vpath, offset: 0, from: 0, to: END }] : []
if (FROM) {
  const cut = OLD.from.st, before = t => t < cut
  const oldVideos = OLD.videos || [{ file: OLD.video, offset: 0, from: 0, to: OLD.end }]
  videos = [...oldVideos.filter(v => v.from < cut).map(v => ({ ...v, to: Math.min(v.to, cut) })), { file: vpath, offset: cut, from: cut, to: END }]
  marks.unshift(...OLD.marks.filter(k => before(k.st)))
  caps.unshift(...OLD.caps.filter(c => before(c.from)))
  chapters.unshift(...OLD.chapters.filter(c => before(c.from)).map(c => ({ ...c, to: Math.min(c.to, cut) })))
  parts.unshift(...(OLD.parts || []).filter(c => before(c.from)).map(c => ({ ...c, to: Math.min(c.to, cut) })))
  pauses.unshift(...(OLD.pauses || []).filter(x => before(x.t)))
  h.cueLog.unshift(...(OLD.cueLog || []).filter(c => before(c.start)))
  h.zooms.unshift(...OLD.zooms.filter(z => z.to <= cut))
  for (const k of ['clicks', 'cards', 'hides']) h[k].unshift(...OLD[k].filter(x => before(typeof x === 'number' ? x : x.t)))
  h.sounds.unshift(...OLD.sounds.filter(x => before(x.t)))
}
await ctx.close()
await browser.close()

// camera follow (default; camera: 'off' or --camera off to turn it off). A gentle move toward a click, only when it
// helps (Tyler, 2026-11-24: worried it distracts or cuts things off; liked it under these rules). It moves only when all of these hold:
//   1. the target is small (under 4% of the screen), so there's detail worth getting closer to;
//   2. the screen doesn't change (no new page, under 30% of its text changed): zooming into a screen that's about to
//      change would crop the new one;
//   3. what the click opens (a menu, picker or dialog) fits in the zoomed view with the target; the move frames both;
//   4. no explicit zoom is near it, and clicks under 2.5 s apart share one move.
if (CAMERA && h.clickAt) {
  const Z = 1.18, FW = VP.width / Z * 0.9, FH = VP.height / Z * 0.9, moves = [], skipped = []
  for (const c of h.clickAt) {
    const why = !c.bb ? 'no click details (custom action)'
      : c.bb.width * c.bb.height > 0.04 * VP.width * VP.height ? 'target is large'
      : c.nav ? 'opens a new page' : c.change > 0.3 ? 'the screen changes'
      : h.zooms.some(z => c.t >= z.from - 0.5 && c.t <= z.to + 0.5) ? 'a zoom is near' : null
    if (why) { skipped.push(why); continue }
    const rs = [c.bb, ...c.pops], x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y))
    const x1 = Math.max(...rs.map(r => r.x + r.width)), y1 = Math.max(...rs.map(r => r.y + r.height))
    if (x1 - x0 > FW || y1 - y0 > FH) { skipped.push('what it opens would not fit'); continue }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, last = moves.at(-1)
    if (last && c.t - last.last < 2.5) { last.to = c.t + 1.6; last.last = c.t; last.cx = (last.cx + cx) / 2; last.cy = (last.cy + cy) / 2 }
    else moves.push({ from: c.t - 1.1, to: c.t + 1.6, last: c.t, cx, cy })
  }
  for (const mv of moves) {
    const cx = Math.min(VP.width - VP.width / Z / 2, Math.max(VP.width / Z / 2, mv.cx)), cy = Math.min(VP.height - VP.height / Z / 2, Math.max(VP.height / Z / 2, mv.cy))
    h.zooms.push({ from: mv.from, to: mv.to, cx, cy, z: Z, camera: true })
  }
  h.zooms.sort((a, b) => a.from - b.from)
  console.log(`camera: ${moves.length} moves from ${h.clickAt.length} clicks` + (skipped.length ? ` (held still: ${[...new Set(skipped)].map(w => `${w} ${skipped.filter(x => x === w).length}`).join(', ')})` : ''))
}

// Labels over the live screen never sit on a card: one that starts while a card is up waits for it to leave
// (if that's within 2 s), or is left out.
{
  const evs = [...(cfg.intro ? [[0, 1]] : []), ...h.cards.map(c => [c.t, 1]), ...h.hides.map(t => [t, 0])].sort((a, b) => a[0] - b[0])
  const onAt = t => { let on = 0; for (const [x, v] of evs) if (x <= t) on = v; return on }
  const nextHide = t => evs.find(([x, v]) => x > t && v === 0)?.[0]
  const fit = list => list.flatMap(l => {
    if (!onAt(l.from - 0.01)) {                       // no card up as the label arrives; one may come up while it shows
      const c = evs.find(([x, v]) => v === 1 && x >= l.from - 0.01 && x < l.to)?.[0]
      return c === undefined ? [l] : c - l.from < 1 ? [] : [{ ...l, to: c }]
    }
    const h2 = nextHide(l.from - 0.01)
    return h2 !== undefined && h2 - l.from <= 2 ? [{ ...l, from: h2 + MOTION.out * 0.5, to: h2 + MOTION.out * 0.5 + (l.to - l.from) }] : []
  })
  parts.splice(0, parts.length, ...fit(parts)); chapters.splice(0, chapters.length, ...fit(chapters))
}

// 4. captions + chapter labels as PNGs for the mux step (a plain browser: the 2x flag would double the PNGs)
let intervals = []
if (!DRY) { const b2 = await chromium.launch(exe ? { executablePath: exe } : {}); intervals = await renderCaptions(b2, { caps: BURN ? caps : [], chapters, parts }, `${OUT}/caps`, VP, OUTW / VP.width, LOOK); await b2.close() }
fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify({ marks, end: END, caps, chapters, zooms: h.zooms, clicks: h.clicks, cards: h.cards, hides: h.hides, sounds: h.sounds, soundsOn: cfg.sounds ?? {}, intervals, cueLog: h.cueLog, pauses, parts, intro: !!cfg.intro, mood: cfg.mood, title: cfg.title || name, viewport: VP, scale: SC, outw: OUTW, outh: OUTH, video: vpath, videos }, null, 1))
if (vpath) fs.writeFileSync(`${OUT}/raw/last.txt`, vpath)
console.log('video', vpath || '(dry run)', FROM ? `(from ${FROM} at ${fmt(OLD.from.st)}, spliced onto the earlier take)` : '', 'end', fmt(END), '· zooms', h.zooms.length)
console.log('errors:', errs.length ? errs : 'none')
if (DRY) console.log('screenshots in', `${OUT}/dry`)
