#!/usr/bin/env python3
"""Local neural narration voice (Kokoro-82M, Apache-2.0, offline). Setup is in README.md ("Better voice").

  tts-kokoro.py <text file> <out wav> [voice]        one sentence
  tts-kokoro.py --batch <jobs.json> [voice]          many: [{"text": ..., "out": ...}], rendered by parallel workers,
                                                     each loading the model once (what record.mjs and approve.mjs use)
Speed comes from KOKORO_SPEED (default 0.95); workers from KOKORO_WORKERS (default 2; fastest on the M5 for 12 sentences, 2026-11-23)."""
import sys, os, json
import soundfile as sf

D = os.path.expanduser('~/.cache/walkthrough-tts')
SPEED = float(os.environ.get('KOKORO_SPEED', '0.95'))
_k = None
def say(text, out, voice):
    global _k
    if _k is None:
        from kokoro_onnx import Kokoro
        _k = Kokoro(f'{D}/kokoro-v1.0.onnx', f'{D}/voices-v1.0.bin')
    a, sr = _k.create(text.strip(), voice=voice, speed=SPEED, lang='en-gb' if voice.startswith('b') else 'en-us')
    sf.write(out + '.part', a, sr, format='WAV')
    os.replace(out + '.part', out)

def job(j): say(j['text'], j['out'], j['voice']); return j['out']

if __name__ == '__main__':
    if sys.argv[1] == '--batch':
        jobs = json.load(open(sys.argv[2])); voice = sys.argv[3] if len(sys.argv) > 3 else 'af_heart'
        for j in jobs: j['voice'] = voice
        n = min(len(jobs), int(os.environ.get('KOKORO_WORKERS', '2')))
        if n <= 1:
            for j in jobs: job(j)
        else:
            from concurrent.futures import ProcessPoolExecutor
            with ProcessPoolExecutor(n) as ex: list(ex.map(job, jobs))
    else:
        say(open(sys.argv[1]).read(), sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'af_heart')
