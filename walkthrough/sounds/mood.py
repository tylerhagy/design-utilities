# Mood sounds (Tyler's picks, 2026-11-24): a low tick for part labels, and a pad bed made here
# (so a bed never depends on anyone's loop license). Run with the walkthrough TTS venv:
#   ~/.cache/walkthrough-tts/venv/bin/python sounds/mood.py
import os, numpy as np, soundfile as sf
SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(11)
def t(d): return np.arange(int(SR * d)) / SR
def onepole(x, fc):
    # vectorized one-pole low-pass via scipy-free recursion in blocks (fast enough for a few seconds)
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
    return y
def lp(x, fc): return onepole(onepole(x, fc), fc)
def save(name, x, peak): x = x / (np.max(np.abs(x)) or 1) * peak; sf.write(os.path.join(HERE, name + '.wav'), x.astype(np.float32), SR)

# part: a low, soft wooden tick with a short tail, for a part label
x = t(0.5); f = 196
tick = (np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * f * 2.01 * x)) * np.minimum(1, x / 0.004) * np.exp(-x / 0.09)
save('part', tick, 0.6)

# pad bed: two warm chords, 12 s each, slow attack, a little drift; the loop starts and ends on the same chord
def hz(m): return 440 * 2 ** ((m - 69) / 12)
CH = [[48, 52, 55, 59, 62], [45, 48, 52, 55, 59]]   # C maj9 (C3 E3 G3 B3 D4), A min9 (A2 C3 E3 G3 B3)
L = 12.0; x = t(L)
def chord(notes):
    out = np.zeros(len(x))
    for k, m in enumerate(notes):
        for det in (-0.06, 0.06):
            f = hz(m) * 2 ** (det / 12)
            ph = rng.uniform(0, 2 * np.pi)
            out += (np.sin(2 * np.pi * f * x + ph) + 0.25 * np.sin(4 * np.pi * f * x + ph)) / (1 + k * 0.35)
    return out
a, b = chord(CH[0]), chord(CH[1])
fade = np.clip(x / 4.0, 0, 1)                       # 4 s crossfade at each chord change
seq = np.concatenate([a, b])
xf = int(SR * 4.0)
seq[len(a) - xf:len(a)] = a[-xf:] * (1 - fade[:xf]) + b[:xf] * fade[:xf]
seq[-xf:] = seq[-xf:] * (1 - fade[:xf]) + a[:xf] * fade[:xf]   # back into the first chord, so it loops
lfo = 0.85 + 0.15 * np.sin(2 * np.pi * np.arange(len(seq)) / SR / 9.0)
breath = lp(rng.standard_normal(len(seq)), 700) * 0.6
save('pad-bed', lp(seq * lfo + breath, 1800), 0.8)
print('ok')
