// Shared by record.mjs and approve.mjs: load a scenes file, check it, make the narration audio.
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { pathToFileURL } from 'url'

export const GAP = 0.7            // silence between scenes, seconds
export const CUE_LEAD = 0.75      // cursor starts moving this long before the phrase is spoken
export const DEFAULT_VOICE = 'Evan (Enhanced)'          // macOS `say` fallback
export const KOKORO_DIR = path.join(os.homedir(), '.cache/walkthrough-tts')
export const HAVE_KOKORO = fs.existsSync(`${KOKORO_DIR}/venv/bin/python`) && fs.existsSync(`${KOKORO_DIR}/kokoro-v1.0.onnx`)
export const DEFAULT_KOKORO_VOICE = 'af_heart'         // US female, Kokoro's top-rated; Tyler's pick 2026-11-22. Others: am_michael, af_bella, am_fenrir, bm_george (British)
const HERE_ = path.dirname(new URL(import.meta.url).pathname)
export const engineOf = (cfg, voice) => cfg.tts?.cmd ? 'cmd' : (voice && /^[ab][mf]_/.test(voice)) ? 'kokoro' : 'say'
export const DEFAULT_RATE = 170

export function parseArgs(argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x.startsWith('--')) {
      const k = x.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) a[k] = true
      else { a[k] = next; i++ }
    } else a._.push(x)
  }
  return a
}

let loadCount = 0
export async function loadScenes(file, { short = false } = {}) {
  const abs = path.resolve(file)
  const mod = await import(pathToFileURL(abs).href + '?t=' + Date.now() + '-' + (++loadCount))
  const cfg = mod.default || mod.SCENE_FILE
  if (!cfg || !Array.isArray(cfg.scenes)) throw new Error(`${file}: export default { scenes: [...] } is required`)
  cfg.__file = abs
  cfg.__dir = path.dirname(abs)
  cfg.viewport ||= { width: 1440, height: 900 }
  const problems = []
  const seen = new Set()
  for (const s of cfg.scenes) {
    if (!s.id) problems.push('a scene has no id')
    if (seen.has(s.id)) problems.push(`duplicate scene id ${s.id}`)
    seen.add(s.id)
    for (const v of variants(s)) {
      if (!v.text || !/[.?!](\s|$)/.test(v.text)) problems.push(`${s.id}: narration needs at least one full sentence`)
      for (const c of v.cues || []) {
        const [phrase, action] = c
        if (typeof phrase !== 'string' || v.text.indexOf(phrase) < 0) problems.push(`${s.id}: cue phrase not found in narration: "${phrase}"`)
        if (typeof action === 'string' && !BUILTIN.has(action) && !(cfg.actions && cfg.actions[action])) problems.push(`${s.id}: unknown action "${action}"`)
      }
    }
  }
  for (const s of cfg.scenes) for (const v of variants(s)) for (const ph of Object.keys(v.hold || {})) if (!v.text.includes(ph)) problems.push(`${s.id}: hold phrase not in the narration: "${ph}"`)
  if (problems.length) throw new Error('Scenes file problems:\n - ' + problems.join('\n - '))
  // pick the active variant of each scene
  const picked = []
  for (const s of cfg.scenes) {
    if (short && !s.core) { if (s.quiet) picked.push({ ...s, skipped: true }); continue }
    const v = short && s.short ? s.short : s
    picked.push({ id: s.id, part: s.part, chapter: s.chapter || '', screen: s.screen || '', core: !!s.core, text: v.text, cues: v.cues || [], quiet: s.quiet, lead: s.lead, beat: s.beat, hold: (short && s.short ? s.short.hold : s.hold) || {} })
  }
  cfg.active = picked
  return cfg
}
export const BUILTIN = new Set(['__line', 'note', 'unnote', 'changed', 'compare', 'wipe', 'uncompare', 'spot', 'unspot', 'click', 'choose', 'type', 'scroll', 'wait', 'press', 'card', 'hidecard', 'zoom', 'unzoom', 'waitfor', 'sound'])
const variants = s => s.short ? [s, s.short] : [s]

export function sentences(text) {
  return text.match(/.+?[.?!]+(?=\s|$)/gs).map(x => x.trim())   // a full stop followed by a space or the end, so $49,370.34 stays whole
}

// Narration is rendered one sentence at a time and joined with explicit pauses, so every sentence has an exact start
// time (captions and cues use it) and the voice breathes. Engine: macOS `say` by default, or any command in
// cfg.tts.cmd with {in} (text file) and {out} (audio file to write), e.g. a local neural TTS.
export const PAUSE = { '.': 0.34, '?': 0.5, '!': 0.34, comma: 0.2 }

// What the voice says, which can differ from what the captions show. The voices guess at words spelled alike but
// said differently, and read numbers literally ("$49,370.34" as "dollar forty nine thousand ... point three four").
// Rules here fix the common cases; a scenes file adds its own with `say: { 'written': 'spoken' }` (e.g. product names).
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const under1000 = n => { const h = Math.floor(n / 100), r = n % 100; const rr = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ''); return h ? `${ONES[h]} hundred${r ? ` ${rr}` : ''}` : rr }
export const words = n => { if (n === 0) return 'zero'; const parts = []; for (const [v, w] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']]) { const k = Math.floor(n / v); n %= v; if (k) parts.push(`${under1000(k)}${w ? ` ${w}` : ''}`) } return parts.join(' ') }
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' }
const ordinal = n => { const w = words(n), last = w.split(/[ -]/).pop(); return w.slice(0, -last.length) + (ORD[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`)) }
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
export function spoken(cfg, text) {
  let s = text
  for (const [w, sp] of Object.entries(cfg.say ?? {})) s = s.replaceAll(w, sp)
  // money: "$49,370.34" -> "forty-nine thousand, three hundred seventy dollars and thirty-four cents"
  s = s.replace(/\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g, (_, d, c) => { const n = +d.replace(/,/g, ''), ct = c ? +c : 0; return `${words(n)} ${n === 1 ? 'dollar' : 'dollars'}${ct ? ` and ${words(ct)} ${ct === 1 ? 'cent' : 'cents'}` : ''}` })
  // dates: "November 5" -> "November fifth" (a four-digit year is left alone)
  s = s.replace(new RegExp(`\\b(${MONTHS}) (\\d{1,2})\\b(?![\\d,]*\\d{3})`, 'g'), (_, m, d) => `${m} ${ordinal(+d)}`)
  // "lives" as a verb ("everything lives in one area"), not the plural of life
  s = s.replace(/\blives (in|here|there|on|at|with|inside|under|beside|alongside|next|where|right)\b/gi, (_, w) => `livz ${w}`)
  return s
}

const sentenceKey = (cfg, text, voice, rate) => crypto.createHash('sha1').update(JSON.stringify([engineOf(cfg, voice), cfg.tts?.cmd || '', voice, rate, text])).digest('hex').slice(0, 16)
function renderSentence(cfg, text0, voice, rate, dir) {
  const text = spoken(cfg, text0)
  const eng = engineOf(cfg, voice)
  const key = sentenceKey(cfg, text, voice, rate)
  const wav = `${dir}/audio/s-${key}.wav`
  if (fs.existsSync(wav)) return wav
  const txt = `${dir}/audio/s-${key}.txt`, raw = `${dir}/audio/s-${key}.raw`
  fs.writeFileSync(txt, text)
  if (eng === 'kokoro') { if (!fs.existsSync(raw)) execSync(`KOKORO_SPEED=${rate} "${KOKORO_DIR}/venv/bin/python" "${HERE_}/tts-kokoro.py" "${txt}" "${raw}" "${voice}"`) }   // usually made already by the batch in makeAudio
  else if (cfg.tts?.cmd) execSync(cfg.tts.cmd.replaceAll('{in}', `"${txt}"`).replaceAll('{out}', `"${raw}"`).replaceAll('{voice}', voice))
  else execSync(`say -v "${voice}" -r ${rate} -o "${raw}.aiff" -f "${txt}"`) && fs.renameSync(raw + '.aiff', raw)
  execSync(`ffmpeg -y -loglevel error -i "${raw}" -ar 48000 -ac 1 -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse" "${wav}"`)
  fs.unlinkSync(raw)
  return wav
}
// Kokoro: render every missing sentence in one process with parallel workers (the model loads once per worker, not per sentence)
function batchKokoro(cfg, scenes, dir, voice, rate) {
  if (engineOf(cfg, voice) !== 'kokoro') return
  const jobs = []
  for (const s of scenes) if (!s.skipped) for (const x of sentences(s.text)) {
    const text = spoken(cfg, x), key = sentenceKey(cfg, text, voice, rate)
    if (!fs.existsSync(`${dir}/audio/s-${key}.wav`) && !jobs.some(j => j.out.endsWith(key + '.raw'))) jobs.push({ text, out: `${dir}/audio/s-${key}.raw` })
  }
  if (!jobs.length) return
  fs.writeFileSync(`${dir}/audio/jobs.json`, JSON.stringify(jobs))
  execSync(`KOKORO_SPEED=${rate} "${KOKORO_DIR}/venv/bin/python" "${HERE_}/tts-kokoro.py" --batch "${dir}/audio/jobs.json" "${voice}"`)
}
// Join sentence clips into one track, each starting at its `at` (seconds from the start of the track)
export function joinAudio(parts, out) {
  const ins = parts.flatMap(o => ['-i', o.wav])
  const f = parts.map((o, i) => `[${i}:a]apad=pad_dur=${Math.max(0, i + 1 < parts.length ? parts[i + 1].at - o.at - o.dur : 0).toFixed(3)}[p${i}]`)
  f.push(parts.map((_, i) => `[p${i}]`).join('') + `concat=n=${parts.length}:v=0:a=1[o]`)
  execSync(['ffmpeg', '-y', '-loglevel', 'error', ...ins.map(x => `"${x}"`), '-filter_complex', `"${f.join(';')}"`, '-map', '"[o]"', `"${out}"`].join(' '))
}
const dur = f => parseFloat(execSync(`afinfo "${f}"`).toString().match(/estimated duration: ([\d.]+)/)[1])

export function makeAudio(cfg, scenes, dir, { voice, rate }) {
  fs.mkdirSync(`${dir}/audio`, { recursive: true })
  batchKokoro(cfg, scenes, dir, voice, rate)
  for (const s of scenes) {
    if (s.skipped) continue
    const sents = sentences(s.text)
    let from = 0, at = 0
    s.sents = sents.map(x => {
      const start = s.text.indexOf(x, from); from = start + x.length
      const wav = renderSentence(cfg, x, voice, rate, dir), d = dur(wav)
      const o = { x, start, at, dur: d, wav }
      at += d + (PAUSE[x.slice(-1)] ?? 0.3) + Math.max(0, ...Object.entries(s.hold || {}).filter(([ph]) => x.includes(ph)).map(([, t]) => t))   // hold: extra silence after a key sentence
      return o
    })
    s.dur = at - (PAUSE[sents[sents.length - 1].slice(-1)] ?? 0.3)
    const out = `${dir}/audio/${s.id}.wav`
    const key = JSON.stringify(s.sents.map(o => [o.wav, o.at]))
    if (!fs.existsSync(out) || !fs.existsSync(out + '.key') || fs.readFileSync(out + '.key', 'utf8') !== key) {
      joinAudio(s.sents, out)
      fs.writeFileSync(out + '.key', key)
    }
  }
}

// seconds from the start of a scene's narration to a phrase (inside its sentence, by character position)
export function phraseTime(s, phrase) { return phraseTimeAt(s, s.text.indexOf(phrase)) }
export function phraseTimeAt(s, i) {
  const o = s.sents.find(o => i >= o.start && i < o.start + o.x.length) || s.sents[0]
  return o.at + o.dur * Math.max(0, i - o.start) / o.x.length
}

export const LEAD_IN = 0.45   // seconds the screen settles at the start of a scene before the narration begins (scene.lead overrides)
export function totalSeconds(scenes) {
  return scenes.filter(s => !s.skipped).reduce((a, s) => a + (s.lead ?? LEAD_IN) + s.dur + (s.beat ?? GAP), 0) + 2.5   // plus the closing hold
}

// voice: --voice, else the scenes file, else Kokoro (if installed) or macOS Evan. rate: words-per-minute for say, speed (0.95) for Kokoro.
export function resolveVoice(cfg, args) {
  const voice = args.voice || cfg.voice || (HAVE_KOKORO ? DEFAULT_KOKORO_VOICE : DEFAULT_VOICE)
  const k = engineOf(cfg, voice) === 'kokoro'
  return { voice, rate: String(args.rate || (k ? cfg.kokoroSpeed : cfg.rate) || (k ? 0.95 : DEFAULT_RATE)) }
}

export async function loadPlaywright() {
  const cands = [process.env.PLAYWRIGHT_CORE, path.join(os.homedir(), 'Work/Repos/apprentice-kit/node_modules/playwright-core/index.mjs')]
  for (const c of cands) {
    if (c && fs.existsSync(c)) return await import(pathToFileURL(c).href)
  }
  try { return await import('playwright-core') } catch {}
  throw new Error('playwright-core not found. Set PLAYWRIGHT_CORE to its index.mjs path.')
}

export function findHeadlessShell() {
  const root = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (!fs.existsSync(root)) return undefined
  const dirs = fs.readdirSync(root).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse()
  for (const d of dirs) {
    for (const arch of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-mac']) {
      const p = path.join(root, d, arch, 'chrome-headless-shell')
      if (fs.existsSync(p)) return p
    }
  }
}

export function fmt(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Script checks (warnings, not errors): things Tyler has corrected before. Shown by approve.mjs and record.mjs.
//   version numbers and prototype history; tool, reviewer and system names; real people's names (from ~/Work/People);
//   narration aimed at Tyler; long sentences and long scenes; words the voice may say wrong (check by ear or add to `say`).
// A scenes file can tune them: lint: { allow: ['Figma'], maxSentenceWords: 28, maxSceneWords: 75 }
const TOOL_NAMES = ['LukeW', 'Wroblewski', 'Copilot', 'FullStory', 'Fullstory', 'Claude', 'ChatGPT', 'Figma', 'Jira', 'Confluence', 'Playwright', 'Kokoro', 'Ambient', 'Apprentice', 'protoserve', 'AI agent', 'agents']
const HOMOGRAPHS = ['lives', 'live', 'read', 'record', 'records', 'lead', 'leads', 'close', 'present', 'content', 'object', 'project', 'projects', 'resume', 'separate', 'estimate', 'minute', 'produce', 'wound', 'tear', 'wind', 'invalid', 'permit', 'desert']   // spelled alike, said differently
const SAFE_ACRONYMS = new Set(['AI', 'ID', 'IDs', 'US', 'OK', 'PDF', 'PDFs', 'URL', 'CSV', 'PNG', 'API', 'FAQ', 'CRM', 'IT', 'TV'])
function peopleNames() {
  const dir = path.join(os.homedir(), 'Work/People')
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && /^[A-Z][a-z]+ [A-Z]/.test(d.name)).map(d => d.name) } catch { return [] }
}
export function lintScenes(cfg, scenes = cfg.active) {
  const L = cfg.lint || {}, allow = new Set(L.allow || []), maxS = L.maxSentenceWords ?? 28, maxScene = L.maxSceneWords ?? 75
  const people = peopleNames(), firsts = [...new Set(people.map(n => n.split(' ')[0]))]
  const said = Object.keys(cfg.say || {})
  const out = []
  const add = (id, kind, msg) => out.push({ scene: id, kind, msg })
  const wc = t => (t.match(/\S+/g) || []).length
  const cards = [cfg.intro, cfg.outro].filter(Boolean).map(c => [c.kicker, c.title, c.sub, c.footer, ...(c.lines || []).flat()].filter(Boolean).join(' . '))
  const texts = [...scenes.filter(s => !s.skipped).map(s => [s.id, s.text]), ...cards.map(t => ['card', t])]
  // notes are read in a glance: a few words, and the same rules about names as the narration
  for (const s of scenes.filter(s => !s.skipped)) for (const [, a, arg] of s.cues || []) if (a === 'note' && Array.isArray(arg)) {
    const n = wc(String(arg[1] || ''))
    if (n > 10) add(s.id, 'length', `long note (${n} words; ten at most): "${String(arg[1]).slice(0, 50)}…"`)
    texts.push(['card', String(arg[1] || '')])
  }
  for (const [id, text] of texts) {
    const has = re => re.test(text)
    const m = text.match(/\b(?:v|r)\d+\b|\bversion \d+|\b(?:earlier|previous|last|first) (?:version|cut|round|iteration|prototype)\b/gi)
    if (m) add(id, 'history', `version or prototype history: ${[...new Set(m)].join(', ')}`)
    for (const n of TOOL_NAMES) if (!allow.has(n) && new RegExp(`\\b${n}\\b`).test(text)) add(id, 'names', `tool, reviewer or system name: ${n}`)
    for (const n of people) if (!allow.has(n) && text.includes(n)) add(id, 'names', `real person's name: ${n} (use a role)`)
    for (const n of firsts) if (!allow.has(n) && new RegExp(`\\b${n}\\b`).test(text) && !people.some(p => text.includes(p))) add(id, 'names', `may be a real person: ${n} (fine if it is demo data)`)
    if (has(/\bTyler\b|\byour (?:rule|rules|call|ask|request|feedback|direction|team)\b|\byou (?:asked|said|wanted|decided|chose|told)\b/i)) add(id, 'audience', 'narration speaks to Tyler; say "the design team" or state the rule')
    if (id === 'card') continue
    for (const x of sentences(text)) if (wc(x) > maxS) add(id, 'length', `long sentence (${wc(x)} words): "${x.slice(0, 60)}…"`)
    if (wc(text) > maxScene) add(id, 'length', `long scene (${wc(text)} words; split it or cut)`)
    const listen = new Set(), sp = spoken(cfg, text)   // what the voice is given: built-in fixes and `say` already applied
    for (const w of HOMOGRAPHS) if (new RegExp(`\\b${w}\\b`, 'i').test(sp)) listen.add(w)
    for (const a of sp.match(/\b[A-Z]{2,}s?\b|\b\w*\d\w*\b/g) || []) if (!SAFE_ACRONYMS.has(a) && !/^\d+$/.test(a)) listen.add(a)
    if (listen.size) add(id, 'listen', `listen for: ${[...listen].join(', ')}`)
  }
  return out
}
export function printLint(w) {
  const real = w.filter(x => x.kind !== 'listen'), ear = w.filter(x => x.kind === 'listen')
  console.log(`script checks: ${real.length ? real.length + ' to fix' : 'none to fix'}${ear.length ? ` · ${ear.length} scenes with words to hear` : ''}`)
  for (const x of real) console.log(`  ${x.scene}  ${x.msg}`)
  for (const x of ear) console.log(`  ${x.scene}  ${x.msg}`)
}
