# Writes the sounds mux.py uses (Tyler's picks, 2026-11-22): a pop click, a done chime, and soft key taps.
# Run with the walkthrough TTS venv (numpy + soundfile): ~/.cache/walkthrough-tts/venv/bin/python sounds/make.py
# samples.py makes the wider set these were chosen from (clicks, cues, music stings).
import os, numpy as np, soundfile as sf
SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)
def t(d): return np.arange(int(SR * d)) / SR
def env(n, a, d): x = np.arange(n) / SR; return np.minimum(1, x / a) * np.exp(-x / d)
def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(2):
        y = np.empty_like(x); s = 0.0
        for i, v in enumerate(x): s = (1 - a) * v + a * s; y[i] = s
        x = y
    return x
def save(name, x, peak): x = x / (np.max(np.abs(x)) or 1) * peak; sf.write(os.path.join(HERE, name + '.wav'), x.astype(np.float32), SR)
# click: a tiny rising pop
x = t(0.045); f = 520 + 900 * x / 0.045
save('click', np.concatenate([np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.001, 0.012), np.zeros(int(SR * 0.02))]), 0.9)
# done: two soft bell notes, E5 then B5, with a short room
def bell(f0, d=1.2, dec=0.5):
    x = t(d); return sum(a * np.sin(2 * np.pi * f0 * m * x) * env(len(x), 0.003, dec / m ** 0.7) for m, a in [(1, 1), (2.0, 0.35), (3.01, 0.15), (4.2, 0.06)])
a, b = bell(659.26), bell(987.77); off = int(SR * 0.12)
ch = np.zeros(len(b) + off); ch[: len(a)] += a; ch[off:] += 0.8 * b
n = int(SR * 1.2); ir = lp(rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 5.75), 3000); ir /= np.sqrt(np.sum(ir ** 2))
wet = np.fft.irfft(np.fft.rfft(ch, len(ch) + n) * np.fft.rfft(ir, len(ch) + n))[: len(ch) + n]
save('done', np.concatenate([ch, np.zeros(n)]) * 0.8 + wet * 0.2, 0.9)
# keys: four soft key taps, varied so typing doesn't sound mechanical
for k in range(4):
    n = int(SR * 0.03); save(f'key{k + 1}', lp(rng.standard_normal(n), 3000 + 600 * k) * env(n, 0.0005, 0.004), 0.9)
print('ok')
