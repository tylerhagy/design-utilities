#!/usr/bin/env node
// Builds the script approval page: one card per scene with what is on screen, the narration, and a play button
// for the voice, plus the full length and the short cut length. Needs only a draft scenes file (text, screen, core);
// cues and actions can come later. Nothing is recorded.
//   node approve.mjs <scenes.mjs> [--out <dir>] [--voice ..] [--rate ..]      writes <dir>/approve.html
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { parseArgs, loadScenes, makeAudio, resolveVoice, totalSeconds, sentences, fmt, lintScenes, printLint } from './lib.mjs'

const args = parseArgs(process.argv.slice(2))
if (!args._[0]) { console.error('usage: node approve.mjs <scenes.mjs> [--out dir]'); process.exit(1) }
const name = path.basename(args._[0]).replace(/\.mjs$/, '')
const OUT = path.resolve(args.out || path.join(os.tmpdir(), 'walkthrough-' + name))
fs.mkdirSync(OUT, { recursive: true })

const full = await loadScenes(args._[0])
const short = await loadScenes(args._[0], { short: true })
// A second, shorter length exists only when scenes are marked core.
const hasShort = full.active.some(s => s.core)
const { voice, rate } = resolveVoice(full, args)
makeAudio(full, full.active, OUT, { voice, rate })
if (hasShort) makeAudio(short, short.active.filter(s => !s.skipped), OUT + '/short', { voice, rate })
const fullSec = totalSeconds(full.active), shortSec = totalSeconds(short.active)
const lint = lintScenes(full)
printLint(lint)
fs.writeFileSync(`${OUT}/lint.json`, JSON.stringify(lint, null, 1))

const m4a = (dir, id) => {
  const src = `${dir}/audio/${id}.wav`, dst = `${dir}/audio/${id}.m4a`
  if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs) execSync(`afconvert -f m4af -d aac -b 48000 "${src}" "${dst}"`)
  return 'data:audio/mp4;base64,' + fs.readFileSync(dst).toString('base64')
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const prose = t => sentences(t).map(esc).join(' ')
const cardText = c => c ? [c.kicker, c.title, ...(c.lines || []).map(l => Array.isArray(l) ? l.join(': ') : l), c.sub].filter(Boolean).map(esc).join(' · ') : ''

// pictures: when a dry run has been made into this folder (node record.mjs … --dry --fast --out <same dir>), each scene
// shows what will be on screen at its cues, so the script is approved with its pictures
const DRY_DIR = `${OUT}/dry`
const shots = {}
if (fs.existsSync(DRY_DIR)) {
  const ids = full.active.map(s => s.id).sort((a, b) => b.length - a.length)
  fs.mkdirSync(`${OUT}/thumbs`, { recursive: true })
  for (const f of fs.readdirSync(DRY_DIR).filter(f => /^\d+-.*\.png$/.test(f)).sort()) {
    const rest = f.replace(/^\d+-/, ''), id = ids.find(i => rest.startsWith(i + '-'))
    if (!id) continue
    const jpg = `${OUT}/thumbs/${f.replace(/\.png$/, '.jpg')}`
    if (!fs.existsSync(jpg) || fs.statSync(jpg).mtimeMs < fs.statSync(`${DRY_DIR}/${f}`).mtimeMs) execSync(`ffmpeg -y -loglevel error -i "${DRY_DIR}/${f}" -vf scale=480:-2 -q:v 5 "${jpg}"`)
    ;(shots[id] ||= []).push('data:image/jpeg;base64,' + fs.readFileSync(jpg).toString('base64'))
  }
}
const strip = id => {
  const a = shots[id] || []
  if (!a.length) return ''
  const pick = a.length <= 4 ? a : [0, 1, 2, 3].map(k => a[Math.round(k * (a.length - 1) / 3)])   // up to four, spread across the scene
  return `<div class="shots">${pick.map(u => `<img src="${u}" alt="">`).join('')}</div>`
}
const shortById = Object.fromEntries(short.active.filter(s => !s.skipped).map(s => [s.id, s]))
const lengthNote = (sec, lo, hi) => sec < lo ? 'under the target' : sec > hi ? 'over the target' : 'in the target'
const cards = full.active.map((s, i) => {
  const sh = shortById[s.id]
  const hasShortText = sh && sh.text !== s.text
  return `<article>
  <header><span class="n">${i + 1}</span><span class="c">${esc(s.chapter || (i === 0 ? 'Opening' : i === full.active.length - 1 ? 'Closing' : ''))}</span><span class="d">${fmt(s.dur)}</span>${s.core ? '<span class="core">Short cut</span>' : ''}</header>
  ${s.screen ? `<p class="screen"><b>On screen</b> ${esc(s.screen)}</p>` : ''}
  ${strip(s.id)}
  <p class="say">${prose(s.text)}</p>
  <audio controls preload="none" src="${m4a(OUT, s.id)}"></audio>
  ${hasShortText ? `<details><summary>Short cut wording · ${fmt(sh.dur)}</summary><p class="say">${prose(sh.text)}</p><audio controls preload="none" src="${m4a(OUT + '/short', s.id)}"></audio></details>` : ''}
</article>`
}).join('\n')

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(full.title || name)} script</title>
<style>
:root{--bg:#f5f5f7;--card:#fff;--ink:#1d1d1f;--mut:#6e6e73;--line:#d2d2d7;--acc:#0071e3;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--ink:#f5f5f7;--mut:#98989d;--line:#38383a;--acc:#2997ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:680px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:28px;line-height:1.15;letter-spacing:-.02em;margin:0 0 6px}
.meta{color:var(--mut);margin:0 0 20px;font-size:14px}
.lengths{display:flex;gap:10px;margin:0 0 22px;flex-wrap:wrap}
.len{flex:1 1 180px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.len b{display:block;font-size:24px;letter-spacing:-.02em}.len span{color:var(--mut);font-size:13px}
.cardprev{background:#000;color:#f5f5f7;border-radius:12px;padding:16px;margin:0 0 12px;font-size:14px}
.cardprev small{display:block;color:#86868b;margin-bottom:4px;font-size:12px}
article{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 12px}
article header{display:flex;gap:8px;align-items:center;margin:0 0 8px;font-size:13px;color:var(--mut)}
.n{background:var(--ink);color:var(--bg);border-radius:50%;width:22px;height:22px;display:inline-grid;place-items:center;font-size:12px;font-weight:600}
.c{flex:1;font-weight:600;color:var(--ink)}.core{background:var(--acc);color:#fff;border-radius:10px;padding:1px 8px;font-size:12px}
.screen{margin:0 0 8px;color:var(--mut);font-size:14px}.screen b{color:var(--ink);font-weight:600;margin-right:6px}
.say{margin:0 0 10px;font-size:17px;line-height:1.5}
audio{width:100%;height:34px}
details{margin-top:10px;border-top:1px solid var(--line);padding-top:8px}summary{cursor:pointer;color:var(--acc);font-size:14px}
.checks{background:var(--card);border:1px solid #ff9f0a;border-radius:12px;padding:12px 14px;margin:0 0 16px;font-size:14px}.checks ul{margin:6px 0 0;padding-left:18px}
.shots{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:0 0 10px}.shots img{width:100%;display:block;border-radius:6px;border:1px solid var(--line)}
.foot{color:var(--mut);font-size:14px;margin-top:18px}
</style></head><body><main>
<h1>${esc(full.title || name)}</h1>
<p class="meta">Script for approval · voice ${esc(voice)} · ${full.captions === true ? "captions on the video" : "captions in the .srt only"} · nothing recorded yet</p>
<div class="lengths">
<div class="len"><b>${fmt(fullSec)}</b><span>${hasShort ? 'Full cut · as short as the story allows' : 'As short as the story allows'}</span></div>
${hasShort ? `<div class="len"><b>${fmt(shortSec)}</b><span>Short cut · ${lengthNote(shortSec, 60, 90)} (60 to 90 seconds)</span></div>` : ''}
</div>
${lint.filter(x => x.kind !== 'listen').length ? `<div class="checks"><b>Script checks</b><ul>${lint.filter(x => x.kind !== 'listen').map(x => `<li>${esc(x.scene)}: ${esc(x.msg)}</li>`).join('')}</ul></div>` : ''}
${full.intro ? `<div class="cardprev"><small>Opening card</small>${cardText(full.intro)}</div>` : ''}
${cards}
${full.outro ? `<div class="cardprev"><small>Closing card</small>${cardText(full.outro)}</div>` : ''}
<p class="foot">Comment on any passage, or tell Claude what to change. Recording starts once you approve.</p>
</main></body></html>`
fs.writeFileSync(`${OUT}/approve.html`, html)
console.log(`full ${fmt(fullSec)}${hasShort ? ` · short ${fmt(shortSec)}` : ''} · ${OUT}/approve.html (${(html.length / 1e6).toFixed(1)} MB)`)
