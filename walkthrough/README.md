# walkthrough

Narrated, captioned MP4 walkthroughs of any HTML prototype. You write a scenes file (narration, plus "at this phrase, do this"), the tool drives the prototype in a headless browser, speaks the narration with a macOS voice, and joins it all into a video with captions and an SRT.

Nothing is written into the prototype. The cursor, click ripples, spotlight and cards are injected at runtime only.

## Pieces

| File | What it does |
|---|---|
| `approve.mjs` | Builds the script approval page (scene cards, narration you can play, full and short lengths). Records nothing. |
| `record.mjs` | Voice per sentence, drives the prototype, captures 2x video, writes `marks.json`. `--dry` takes a screenshot at every cue instead of recording. `--from <scene>` re-records from that scene and keeps the earlier take before it. `--short` records the short cut. |
| `capture.mjs` | Sharp capture: Chrome's screencast frames at 2x, timestamped, streamed into ffmpeg. |
| `mux.py` | Joins video (one take, or spliced segments), narration, captions and close-up zooms into `walkthrough.mp4` and `.srt`. |
| `check.py` | Checks the finished video: what the voice actually said (Whisper, local), cue delays, and a frame per cue. Writes `check.html` (phone-sized) and `check.json`. |
| `overlays.js` | In-page cursor, ripple, spotlight and cards. |
| `motion.mjs` | The one set of motion values (durations, stagger, rise, blur, easing) for cards and labels. |
| `captions.mjs` | Draws captions, chapter labels and part labels as transparent PNGs, frame by frame while they move (this ffmpeg has no libass or drawtext). |
| `lib.mjs` | Scenes loading and checks, voice, shared bits. |
| `example.scenes.mjs` | A tiny scenes file against an inline page. Copy it to start. |

## Run

```bash
cd Repos/design-utilities/walkthrough
node record.mjs  path/to/scenes.mjs --out /tmp/wt --dry --fast   # 1. dry run: selectors and data; screenshots in /tmp/wt/dry
node approve.mjs path/to/scenes.mjs --out /tmp/wt          # 2. approval page (script, voice, and the dry-run pictures), then stop
node record.mjs  path/to/scenes.mjs --out /tmp/wt           # 3. record (takes the video's length in real time)
# after a fix late in the script: node record.mjs path/to/scenes.mjs --out /tmp/wt --from <scene id>   (re-records from there only)
python3 mux.py /tmp/wt                                      # 4. /tmp/wt/walkthrough.mp4 and .srt
python3 check.py /tmp/wt                                    # 5. /tmp/wt/check.html: misheard words, late cues, contact sheet
# Optional, only when a second length is asked for: --short, then python3 mux.py /tmp/wt/short --name walkthrough-short
```

Options for `record.mjs` and `approve.mjs`: `--prototype <file|url>`, `--voice "Evan (Enhanced)"`, `--rate 170`.

Needs macOS (`say`, `afinfo`, `afconvert`), `ffmpeg`, Python 3, and `playwright-core` with its headless shell. It finds playwright-core in `Repos/apprentice-kit/node_modules`, or set `PLAYWRIGHT_CORE` to its `index.mjs`.

## The scenes file

An ES module. `export default { ... }`:

```js
export default {
  title: 'Name shown on the approval page',
  prototype: '../Prototype.html',       // relative to this file, or an http(s) URL
  viewport: { width: 1440, height: 900 },
  voice: 'Evan (Enhanced)', rate: 170,  // defaults
  intro: { kicker, title, sub, footer },        // opening card, shown during scene 1
  outro: { kicker, lines: [..], footer },       // closing card, shown with the 'card' action; a line can be [headline, detail]
  agenda: ['Part one', 'Part two', 'Part three'],   // optional: names the parts; a scene with `part: 2` starts part 2
  regions: { page: {x,y,width,height}, NAME: h => locator },   // named areas for spot and zoom
  async setup(h) {},                    // after load: pick demo targets, store in h.state
  actions: { name: async (h, arg) => {} },   // actions specific to this prototype
  scenes: [
    { id: 's1', chapter: 'Label', part: 1, core: true,
      screen: 'What is on screen (approval page only).',
      text: 'Narration. Full sentences.',
      cues: [ ['phrase in the text', 'action', arg], ... ],
      short: { text, cues },            // wording for the short cut (optional)
      quiet: [ ['action', arg] ],       // runs silently when the scene is skipped in the short cut
    },
  ],
}
```

A cue starts about 0.75 seconds before the phrase is spoken, so the cursor lands as the word does. A cue phrase that is not in the narration is an error.

**The screen leads, the voice follows.** Actions run one after another in the background, each at its planned time. If a sentence comes due while an action is still running, and one of that sentence's own cues would start late because of it, the sentence waits exactly that long, and everything after it moves with it. Narration is placed after recording, so this costs only a short silence, never drift. A click or typing that simply overlaps the words is left alone. `check.py` reports the pauses added; a long one (over 1.5 s) usually means a slow action belongs in the scene's `lead`.

### Built-in actions

`spot` (selector or region), `unspot`, `note` ([selector or region, text]), `unnote`, `changed` (selector), `compare` (image or page, or `{ before, today, now }`), `wipe` (fraction, default 1, or `{ to, ms }`), `uncompare`, `click` (selector), `choose` ([selector, option text]), `type` ([selector, text]), `scroll` (selector or pixels), `wait` (ms), `press` (key), `card` (`'outro'`, `'intro'` or a card object), `hidecard`, `zoom` (selector, or `{sel, pad, max}`), `unzoom`.

Custom actions get `h`: `h.p` (Playwright page), `h.ev`, `h.state`, `h.click`, `h.spot`, `h.unspot`, `h.choose`, `h.type`, `h.moveTo`, `h.rip`, `h.wait`, `h.box`, `h.card`.

### Cards and labels

Five kinds of card, one motion (`motion.mjs`): everything arrives by rising and fading in, one part after another, and leaves by shrinking, blurring and fading. A card leaves through a blur of the product behind it; a card replacing another clears its lines first, then brings in the new ones.

| Card | How it's made | Looks |
|---|---|---|
| Title | `intro`, or any card with a `title` | kicker, large title, sub, footer |
| Agenda | a card whose kicker reads "What you'll see", "Agenda" or "Today", or `type: 'agenda'` | numbered list, left-aligned in a centered column |
| Recap | a card whose lines are `[headline, detail]`, or `type: 'recap'` | numbered headlines, each with one line of detail |
| Statement | any other card with lines, or `type: 'statement'` | centered lines |
| End | `outro` (any of the shapes above) | as its shape |

**Lines appear as they're spoken.** When every line's headline (or its first three or four words) is found in the scene's narration after the card's cue, each line arrives just before it's said. Otherwise the lines arrive together, one after another, as the card opens.

**Parts.** With `agenda` set, a scene marked `part: n` gets a small label over the live screen, bottom left: "Part n of N", the part's name, and a bar per part with the current one lit. It replaces the black chapter card: black cards are for the open, the agenda, the recap and the close. Chapter labels (top right) fade in and out the same way. Neither label ever sits on a card: one that would arrive while a card is up waits for it to leave (if that's within 2 s), and one a card would cover is cut short or left out.

**Text size.** Sized for a phone, where the 1920-wide video plays at about a fifth of its size (Tyler, 2026-11-24: subtitles were too small to read). In page pixels at 1440 wide: title 96, list lines 54 to 60, subtitles and detail lines 36 to 40, kickers 30, footer 26, part label 34 and 20, chapter label 22, captions 36. Secondary text is #a1a1a6 on black, not darker. Don't go smaller.

### Effects

Each effect has one meaning, and only one is on screen at a time (starting one clears the others):

| Effect | Means | Cue |
|---|---|---|
| `spot` | Look here | `['phrase', 'spot', '#sel']` |
| `zoom` | Read this detail | `['phrase', 'zoom', '#sel']` |
| `note` | Why it's built this way | `['phrase', 'note', ['#sel', 'Same place on every tab']]`: the spotlight plus a short reason beside it, placed where it fits (right, left, below, above). Ten words at most (a script check); the reason comes from the prototype's recorded decisions. |
| `compare`, `wipe` | Today versus the new design | `['phrase', 'compare', 'today.png']` covers the prototype with today's screen (an image, or a page or URL screenshotted at the viewport before recording), labeled Today. `['phrase', 'wipe', 0.5]` brings the new design in from the right and holds the split; `wipe` (or `1`) finishes and clears. Labels: `{ before, today: 'Today', now: 'New' }`. |
| `changed` | This value just changed | `['phrase', 'changed', '#total']`: one two-tone ring pulse around the value. |

All of them use the Ink look and the shared motion: no added color, nothing blurred.

### Sound and mood

`mood` in the scenes file, or `python3 mux.py <dir> --mood <name>`. Default **`studio-pad`** (Tyler, 2026-11-24): the voice through a light studio chain (high-pass, a little less mud, a little presence, de-essing, gentle compression), a low soft tick under each part label, and a pad bed made here (`sounds/pad-bed.wav`, from `sounds/mood.py`) under the whole video, about 15 dB under the voice and ducking while she speaks. `studio` is the same without the bed; `quiet` is the old sound. Tried and not wanted: an air swell under cards (distracting), piano at the open and close, Apple Loops beds.

### Camera follow

On by default (Tyler liked it under these rules, 2026-11-24); `camera: 'off'` (or `--camera off`) turns it off. A click gets a gentle move in (1.18x) only when all of these hold: the target is small (under 4% of the screen); the screen doesn't change (no new page, under 30% of its text changed); whatever the click opens (menu, picker, dialog) fits in the zoomed view with the target, and the move frames both; and no close-up zoom is near. Clicks under 2.5 s apart share one move. `record.mjs` prints how many clicks moved and why the rest held still.

### Look (spotlight, ripple, labels)

`look` in the scenes file (or `--look`), from `look.mjs`. Default **`ink`** (Tyler, 2026-11-24): a white ring with a thin dark edge over a dim, a ring-shaped click ripple, and labels in dark glass. The design system owns color (blue is interactive; orange, red and green are status), so the walkthrough's marks never add a hue: they stand out by brightness and depth, which reads on light, dark and blue screens alike. No blur under the dim: it made the context unreadable. The other looks (`current`, `focus`, `signal`, `brackets`, `inkBlur`) stay for comparison only.

All the walkthrough's labels (part and chapter) sit in one reserved corner, bottom left: products put page actions top right and the main button bottom right.

### Close-up zoom

`zoom` crops and enlarges a region (up to 2.2x) with a smooth ease, and `unzoom` returns. A zoom ends on its own at the end of its scene. Source video is 1440x900, so zoom is softer than the full frame; keep it to short moments. Captions and chapter labels are laid over the video afterward, so zooms never crop them.

### Second length (optional)

One video, as short as the story allows, is the default. Record a second length only when asked. Mark scenes `core: true`. `--short` records only those, using each scene's `short` wording when given. It is a separate recording pass, so the core scenes must work without the scenes between them. Anything the skipped scenes changed that a later scene needs goes in `quiet`. Quiet steps should be instant (no cursor walk), or they leave dead air.

## Checks

**Script checks** run in `approve.mjs` and `record.mjs` (warnings, printed and shown on the approval page): version numbers and prototype history, tool and reviewer names, real people's names (from `~/Work/People`), narration aimed at Tyler, sentences over 28 words, scenes over 75 words. They also list words to hear: homographs (lives, read, record, lead…) and acronyms the voice may misread, after the built-in fixes and `say` are applied. Tune per scenes file with `lint: { allow: ['Figma'], maxSentenceWords: 28, maxSceneWords: 75 }`.

**Video check** (`check.py`, after `mux.py`):
- *Speech.* Transcribes the final audio locally with Whisper (`mlx-whisper` in the walkthrough-tts venv; the first run downloads the large-v3-turbo model) and aligns it with the script. A flagged word was skipped, mangled or heard as another word; each flagged sentence has a play button. It can't hear stress, so a homograph said the wrong way passes: those are in the script checks. Number formatting differences ("$28,002.52" heard as "28,000 2.52") can be false alarms; listen.
- *Sync.* `record.mjs` logs every cue's planned start, actual start and end. A cue more than 0.5 s late (usually a slow action before it), a failed cue, or an action still running after the scene's narration is flagged.
- *Contact sheet.* A settled frame for every cue (one per sentence for recordings made before cue logging), grouped by scene with the narration.

One-time setup: `uv pip install --python ~/.cache/walkthrough-tts/venv/bin/python mlx-whisper`. `python3 check.py` switches to that venv on its own.

## Defaults

Evan (Enhanced) at rate 170. Captions are not drawn into the video by default (`captions: true` in the scenes file turns them on); the `.srt` is always written beside it. Captured at 2x (`scale: 1` for a quicker, softer take). Plain, direct narration. Dark, minimal title and end cards. One video, as short as the story allows; no default short cut. Publishing stays manual.

## Better voice (local, free)

`record.mjs` uses Kokoro-82M (Apache-2.0, offline) when it is installed, and macOS `say` otherwise. One-time setup, nothing system-wide:

```
mkdir -p ~/.cache/walkthrough-tts && cd ~/.cache/walkthrough-tts
uv venv --python 3.12 venv && uv pip install --python venv/bin/python kokoro-onnx soundfile
curl -sL -O https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -sL -O https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

Sentences missing from the cache are rendered in one batch with two parallel workers (`KOKORO_WORKERS`), so the model loads once per worker, not once per sentence: a 5:47 script voices in about a minute from scratch.

Default voice `af_heart` (Tyler, 2026-11-22); others `af_bella`, `am_michael`, `am_fenrir`, `bm_george`. Set `voice` in the scenes file or pass `--voice`. Speed is `kokoroSpeed` (default 0.95). Any other engine: `tts: { cmd: 'my-tts {in} {out}' }`.

**Pronunciation.** The voice guesses at words spelled alike but said differently, and reads numbers literally. Before each sentence is voiced, `spoken()` in `lib.mjs` rewrites what is said; captions and the `.srt` keep the written text. Built in: dollar amounts ("$49,370.34" is said "forty-nine thousand three hundred seventy dollars and thirty-four cents"), month and day ("November 5" is "November fifth"), and "lives" as a verb ("lives in", "lives here"). Add a scenes file's own with `say: { 'Acme 360': 'Acme three sixty' }`; a respelling such as `livz` works when a word needs it. To find others, phonemize the script before recording (`kokoro_onnx.tokenizer.Tokenizer().phonemize(sentence, 'en-us')`) and listen to anything that looks off.

## Realism built in

- Narration is rendered one sentence at a time and joined with pauses, so captions and cues use exact times. `lead` (settle time before a scene speaks, default 0.45s) and `beat` (silence after, default 0.7s) are per-scene. `hold: { 'phrase': 1.5 }` adds that much silence after the sentence containing the phrase, so a change on screen can sink in mid-scene.
- Captured at 2x (2880x1800 for a 1440x900 page) and delivered at 1920 wide, so close-ups stay sharp. Playwright's own video stays 1x on the headless shell, and `deviceScaleFactor` alone doesn't change screencast frames; `--force-device-scale-factor=2` does (tested 2026-11-23).
- The cursor follows a curved, eased path with a small overshoot, hovers before a click and presses; typing has uneven timing; scrolls ease.
- Sounds from `sounds/` (Tyler's picks, 2026-11-22; `sounds/make.py` writes them): a small pop under every recorded click, soft key taps under typed characters (`h.key` or the built-in `type`), a two-note chime wherever a scene logs `done` (built-in `sound` action, or `h.sound('done')` in a custom action), and a very quiet room tone. On top, the mood (see Sound and mood). A scenes file can turn any off: `sounds: { click: false, key: false, done: false, room: false }`. Loudness leveled to -16 LUFS. `sounds/samples.py` makes the wider set they were chosen from, including intro and outro stings.
- Captions are larger, with numbers and amounts emphasized. `waitfor` (built-in action) holds until an element is on screen.
