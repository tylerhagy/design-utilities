#!/usr/bin/env python3
"""Checks a finished walkthrough: what the voice actually said, whether the cues landed on time, and a contact sheet.

  python3 check.py <out dir> [--name walkthrough] [--model mlx-community/whisper-large-v3-turbo]

Run after mux.py. Reads marks.json and <name>.mp4. Writes:
  check.html   phone-sized report: summary, then each scene's frames and narration with problems marked
  check.json   the numbers (length, worst cue delay, late cues, words to check) for the debrief

Speech: the finished audio is transcribed locally with Whisper (mlx-whisper, in the walkthrough-tts venv) and compared
with the script, sentence by sentence. A mismatch is a word the voice skipped, mangled or said as another word. It does
not hear stress, so a homograph said the wrong way ("lives") reads as correct: the script checks list those to hear.
Sync: every cue's actual start against its planned start (needs a recording made after 2026-11-23, which logs cues).
"""
import json, os, re, subprocess, sys, base64, difflib, html

VENV = os.path.expanduser('~/.cache/walkthrough-tts/venv/bin/python')
try:
    import mlx_whisper  # noqa: F401
except ImportError:
    if os.path.exists(VENV) and os.path.realpath(sys.executable) != os.path.realpath(VENV):
        os.execv(VENV, [VENV, *sys.argv])
    sys.exit('mlx-whisper not found. Install: uv pip install --python ~/.cache/walkthrough-tts/venv/bin/python mlx-whisper')

args = sys.argv[1:]
def opt(k, d):
    if k in args:
        i = args.index(k); v = args[i + 1]; del args[i:i + 2]; return v
    return d
name = opt('--name', 'walkthrough')
model = opt('--model', 'mlx-community/whisper-large-v3-turbo')
os.chdir(args[0] if args else '.')
m = json.load(open('marks.json'))
mp4 = f'{name}.mp4'
if not os.path.exists(mp4): sys.exit(f'{mp4} not found: run mux.py first')
trim = max(0, m['marks'][0].get('st', m['marks'][0]['at']) - 0.1)   # same trim as mux.py
length = m['end'] - trim
os.makedirs('check', exist_ok=True)

# ---- sync: did each cue start when it was planned? -------------------------------------------------------------
LATE = 0.5   # seconds; past this a spotlight or click visibly trails the words
cues = m.get('cueLog')
sync = []
if cues:
    for c in cues:
        delay = c['start'] - c['planned']
        over = c['end'] - c['sceneEnd']
        c['delay'] = round(delay, 2)
        c['flags'] = []
        if c.get('fail'): c['flags'].append(f"failed: {c['fail']}")
        if delay > LATE: c['flags'].append(f'{delay:.1f}s late')
        if over > 0.3 and c['a'] not in ('wait', 'waitfor'): c['flags'].append(f'still running {over:.1f}s after the scene\'s narration')
        sync.append(c)
worst = max((c['delay'] for c in sync), default=None)
# a black card left up while the walkthrough points at the product (spots, clicks, zooms happening under it)
evs = sorted([(0, 1)] * bool(m.get('intro')) + [(c['t'], 1) for c in m.get('cards', [])] + [(t, 0) for t in m.get('hides', [])])
def card_on(t):
    on = 0
    for x, v in evs:
        if x <= t: on = v
    return on
PRODUCT = {'spot', 'click', 'choose', 'type', 'zoom', 'note', 'changed', 'scroll'}
stuck = []
for c in cues or []:
    if (c['a'] in PRODUCT or c['a'] not in {'card', '__line', 'hidecard', 'sound', 'wait', 'waitfor', 'unspot', 'unzoom', 'unnote', 'press', 'compare', 'wipe', 'uncompare'}) and card_on(c['start'] + 0.1):
        stuck.append((c['start'] - trim, c))
late = [c for c in sync if c['flags']]
# pauses the recorder added so a sentence waited for the screen (record.mjs); long ones are dead air worth fixing
DEAD = 1.5
pauses = m.get('pauses', [])
for x in pauses: x['long'] = x['added'] > DEAD

# ---- speech: transcribe and compare with the script -------------------------------------------------------------
tpath = 'check/transcript.json'
stamp = f'{os.path.getmtime(mp4)}:{model}'
tr = json.load(open(tpath)) if os.path.exists(tpath) else None
if not tr or tr.get('stamp') != stamp:
    print(f'transcribing {mp4} with {model.split("/")[-1]} (first run downloads the model)…')
    r = mlx_whisper.transcribe(mp4, path_or_hf_repo=model, word_timestamps=True, language='en', condition_on_previous_text=False)
    words = [{'w': w['word'], 's': w['start'], 'e': w['end']} for seg in r['segments'] for w in seg.get('words', [])]
    tr = {'stamp': stamp, 'words': words}
    json.dump(tr, open(tpath, 'w'))

SMALL = {'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10', 'eleven': '11', 'twelve': '12'}
def toks(s):
    s = s.lower().replace('’', "'").replace('—', ' ').replace('-', ' ')
    s = re.sub(r'(\d),(\d)', r'\1\2', s)
    s = re.sub(r'\b(\d+)(st|nd|rd|th)\b', r'\1', s)
    s = s.replace("'", '')                                      # "PNG's" and "PNGs"
    t = [SMALL.get(x, x) for x in re.findall(r"[a-z]+|\d+", s)]
    out = []
    for x in t:                                                   # "49,370.34" and "49 370 34" both become 4937034
        if out and x.isdigit() and out[-1].isdigit(): out[-1] += x
        else: out.append(x)
    return out
HALLUCINATIONS = {'thank you', 'thanks for watching', 'thank you for watching', 'you', 'bye', 'thank you very much'}
def diff(script, heard):
    a, b = toks(script), toks(heard)
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == 'equal': continue
        if ''.join(a[i1:i2]) == ''.join(b[j1:j2]): continue          # "pay run" vs "payrun"
        if op == 'insert' and ' '.join(b[j1:j2]) in HALLUCINATIONS: continue   # Whisper invents these in silence
        out.append({'script': ' '.join(a[i1:i2]) or '(nothing)', 'heard': ' '.join(b[j1:j2]) or '(skipped)'})
    return out

caps = m['caps']
def scene_at(t):   # older recordings have no scene on captions: the scene that had started by then
    ids = [k['id'] for k in m['marks'] if k.get('st', k['at']) <= t + 0.01]
    return ids[-1] if ids else m['marks'][0]['id']
for c in caps: c.setdefault('scene', scene_at(c['from']))
# One alignment over the whole narration (timing at sentence edges is loose), then each sentence gets the words heard
# against it, and is compared with both its written and its spoken form; the closer one counts.
stoks = [(i, t) for i, c in enumerate(caps) for t in toks(c['x'])]
htoks = [t for w in tr['words'] if w['s'] + trim >= caps[0]['from'] - 1 for t in toks(w['w'])]   # nothing before the narration
heard = [[] for _ in caps]
A = [t for _, t in stoks]
for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, A, htoks, autojunk=False).get_opcodes():
    if op == 'equal':
        for k in range(i2 - i1): heard[stoks[i1 + k][0]].append(htoks[j1 + k])
    else:
        si = stoks[min(i1, len(stoks) - 1)][0] if i1 < i2 or i1 >= len(stoks) else stoks[max(0, i1 - 1)][0]
        heard[si].extend(htoks[j1:j2])
speech = []
for c, h in zip(caps, heard):
    said = ' '.join(h)
    d1, d2 = diff(c['x'], said), diff(c.get('said', c['x']), said)
    d = d1 if len(d1) <= len(d2) else d2                  # match either the written or the spoken form
    speech.append({'t': round(c['from'] - trim, 1), 'scene': c.get('scene'), 'x': c['x'], 'heard': said, 'issues': d})
for i, (c, sp) in enumerate(zip(caps, speech)):
    if not sp['issues']: continue
    f = f'check/s{i:03}.m4a'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f"{max(0, c['from'] - trim - 0.2):.2f}", '-to', f"{c['to'] - trim + 0.2:.2f}", '-i', mp4, '-vn', '-c:a', 'aac', '-b:a', '64k', f], check=True)
    sp['audio'] = 'data:audio/mp4;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
nwords = sum(len(s['issues']) for s in speech)

# ---- contact sheet: a frame per cue (settled), or per sentence for older recordings ----------------------------
shots = []
if cues:
    for i, c in enumerate(sync):
        if c['a'] in ('wait', 'waitfor', 'sound', 'unspot', 'unzoom') and not c['flags']: continue   # nothing new to see
        shots.append({'t': min(length - 0.1, max(0, c['end'] + 0.6 - trim)), 'scene': c['scene'], 'label': f"{c['a']} {c['arg']}"[:70], 'flags': c['flags'], 'delay': c['delay']})
else:
    for c in caps:
        shots.append({'t': (c['from'] + c['to']) / 2 - trim, 'scene': c.get('scene'), 'label': '', 'flags': [], 'delay': None})
for i, s in enumerate(shots):
    f = f'check/f{i:03}.jpg'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f"{s['t']:.2f}", '-i', mp4, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '6', f], check=True)
    s['img'] = 'data:image/jpeg;base64,' + base64.b64encode(open(f, 'rb').read()).decode()

# ---- report -----------------------------------------------------------------------------------------------------
def mmss(t): t = max(0, t); return f'{int(t // 60)}:{int(t % 60):02}'
summary = {'cardsStuck': len(stuck), 'pausesAdded': round(sum(x['added'] for x in pauses), 1), 'longPauses': sum(x['long'] for x in pauses), 'length': round(length, 1), 'cues': len(sync), 'worstDelay': worst, 'lateCues': len(late), 'wordsToCheck': nwords,
           'sentences': len(caps), 'syncMeasured': bool(cues)}
json.dump({'summary': summary, 'late': late, 'pauses': pauses, 'speech': [{k: v for k, v in s.items() if k != 'audio'} for s in speech if s['issues']]}, open('check.json', 'w'), indent=1)

E = html.escape
order = []
for x in [s.get('scene') for s in speech] + [s['scene'] for s in shots]:
    if x not in order: order.append(x)
sec = []
BAD = ' class="bad"'
for sc in order:
    ss = [s for s in speech if s.get('scene') == sc]
    fr = [s for s in shots if s['scene'] == sc]
    lp = {(x['scene'], x['sentence']): x for x in pauses if x['long']}
    for k, s in enumerate(ss): s['pause'] = lp.get((sc, k))
    lines = ''.join(
        f"<p class=\"say{' bad' if s['issues'] or s.get('pause') else ''}\"><span class=\"tm\">{mmss(s['t'])}</span>{E(s['x'])}" +
        (f"<span class=\"iss\">{s['pause']['added']:.1f}s of silence before this, waiting for {E(s['pause']['after'] or 'the screen')}</span>" if s.get('pause') else '') +
        ''.join(f"<span class=\"iss\">Script: <b>{E(i['script'])}</b> · Heard: <b>{E(i['heard'])}</b></span>" for i in s['issues']) + (f"<audio controls preload=\"none\" src=\"{s['audio']}\"></audio>" if s.get('audio') else '') + '</p>'
        for s in ss)
    frames = ''.join(
        f"<figure{BAD if s['flags'] else ''}><img src=\"{s['img']}\" alt=\"\"><figcaption><span class=\"tm\">{mmss(s['t'])}</span>{E(s['label'])}" +
        ''.join(f'<b>{E(x)}</b>' for x in s['flags']) + '</figcaption></figure>'
        for s in fr)
    bad = any(s['issues'] or s.get('pause') for s in ss) or any(s['flags'] for s in fr)
    sec.append(f"<section{BAD if bad else ''}><h2>{E(sc or '')}</h2>{lines}<div class=\"frames\">{frames}</div></section>")

tile = lambda v, k, bad=False: f"<div class=\"tile{' bad' if bad else ''}\"><b>{v}</b><span>{k}</span></div>"
tiles = (tile(mmss(length), 'Length') +
         (tile(f'{worst:.1f}s' if worst is not None else '–', 'Worst cue delay', worst is not None and worst > LATE) if cues else tile('–', 'Cue timing not logged')) +
         (tile(len(late), 'Late or failed cues', bool(late)) if cues else '') +
         tile(nwords, 'Words to check by ear', nwords > 0) +
         (tile(f"{sum(x['added'] for x in pauses):.1f}s", f"Pauses added ({sum(x['long'] for x in pauses)} over {DEAD:.1f}s)", any(x['long'] for x in pauses)) if 'pauses' in m else ''))
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(m.get('title') or name)} check</title><style>
:root{{--bg:#f5f5f7;--card:#fff;--ink:#1d1d1f;--mut:#6e6e73;--line:#d2d2d7;--bad:#d70015;--badbg:#fff1f0;color-scheme:light dark}}
@media (prefers-color-scheme:dark){{:root{{--bg:#000;--card:#1c1c1e;--ink:#f5f5f7;--mut:#98989d;--line:#38383a;--bad:#ff6961;--badbg:#2c1517}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}}
main{{max-width:680px;margin:0 auto;padding:24px 16px 64px}}h1{{font-size:26px;letter-spacing:-.02em;margin:0 0 14px;line-height:1.15}}
.tiles{{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:0 0 14px}}
.tile{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}}.tile b{{display:block;font-size:22px;letter-spacing:-.02em}}.tile span{{color:var(--mut);font-size:13px}}
.tile.bad b{{color:var(--bad)}}
.only{{display:flex;gap:8px;align-items:center;margin:0 0 14px;font-size:14px;color:var(--mut)}}
section{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0 0 10px}}section.bad{{border-color:var(--bad)}}
h2{{font-size:13px;color:var(--mut);margin:0 0 6px;font-weight:600}}
.say{{margin:0 0 6px}}.say.bad{{background:var(--badbg);border-radius:8px;padding:4px 6px}}.tm{{color:var(--mut);font-size:12px;margin-right:6px;font-variant-numeric:tabular-nums}}
audio{{width:100%;height:32px;margin-top:4px}}.iss{{display:block;font-size:13px;color:var(--bad)}}
.frames{{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px}}
figure{{margin:0}}figure img{{width:100%;display:block;border-radius:6px;border:1px solid var(--line)}}figure.bad img{{outline:2px solid var(--bad)}}
figcaption{{font-size:12px;color:var(--mut);margin-top:3px;word-break:break-word}}figcaption b{{display:block;color:var(--bad);font-weight:600}}
body.onlybad section:not(.bad){{display:none}}
</style></head><body><main>
<h1>{E(m.get('title') or name)}</h1>
<div class="tiles">{tiles}</div>
<label class="only"><input type="checkbox" onchange="document.body.classList.toggle('onlybad',this.checked)"> Show only scenes with problems</label>
{''.join(sec)}
</main></body></html>"""
open('check.html', 'w').write(page)

print(f"length {mmss(length)} · " + (f"worst cue delay {worst:.1f}s · {len(late)} late or failed cues" if cues else 'cue timing not logged (recorded before 2026-11-23)') + f" · {nwords} words to check by ear")
for a0, c in stuck[:5]: print(f"  {c['scene']}  {c['a']} {c['arg'][:40]} at {mmss(a0)} happens under a card: hide the card first (hidecard)")
if len(stuck) > 5: print(f"  … and {len(stuck) - 5} more under a card")
if 'pauses' in m: print(f"pauses added {sum(x['added'] for x in pauses):.1f}s in {len(pauses)} places, {sum(x['long'] for x in pauses)} over {DEAD:.1f}s")
for x in pauses:
    if x['long']: print(f"  {x['scene']}  sentence {x['sentence'] + 1}: {x['added']:.1f}s silence waiting for {x['after']}")
for c in late: print(f"  {c['scene']}  {c['a']} {c['arg'][:50]}  {'; '.join(c['flags'])}")
for s in speech:
    for i in s['issues']: print(f"  {mmss(s['t'])} {s.get('scene') or ''}  script \"{i['script']}\" heard \"{i['heard']}\"")
print(f'report {os.path.abspath("check.html")}')
