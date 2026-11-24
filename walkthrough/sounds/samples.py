# Synthesizes candidate walkthrough sounds: clicks, other cues, and short intro/outro stings.
# Run with the walkthrough TTS venv (numpy + soundfile): python gen.py <outdir>
import sys, os, numpy as np, soundfile as sf

SR = 48000
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def t(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.002, d=0.05):
    x = np.arange(n) / SR
    return np.minimum(1, x / max(a, 1e-4)) * np.exp(-x / d)
def norm(x, peak=0.9): m = np.max(np.abs(x)) or 1; return x / m * peak
def pad(x, lead=0.0, tail=0.0): return np.concatenate([np.zeros(int(SR * lead)), x, np.zeros(int(SR * tail))])
def lp(x, fc):  # one-pole low-pass, run twice
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(2):
        y = np.empty_like(x); s = 0.0
        for i, v in enumerate(x): s = (1 - a) * v + a * s; y[i] = s
        x = y
    return x
def hp(x, fc): return x - lp(x, fc)
def reverb(x, size=1.6, mix=0.25, damp=3000):
    n = int(SR * size); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * (6.9 / size))
    ir = lp(ir, damp); ir /= np.sqrt(np.sum(ir ** 2))
    wet = np.fft.irfft(np.fft.rfft(x, len(x) + n) * np.fft.rfft(ir, len(x) + n))[: len(x) + n]
    dry = np.concatenate([x, np.zeros(n)])
    return dry * (1 - mix) + wet * mix
def save(name, x, peak=0.9): sf.write(os.path.join(OUT, name + '.wav'), norm(x, peak).astype(np.float32), SR)
def hz(note):  # 'A4' style
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n, acc, octv = note[0], note[1:-1], int(note[-1])
    k = names[n] + (1 if acc == '#' else -1 if acc == 'b' else 0) + 12 * (octv - 4)
    return 440 * 2 ** (k / 12)

# ---------- clicks: each sample is three clicks, spaced like real use
def three(c, gaps=(0.0, 0.55, 0.95)):
    out = np.zeros(int(SR * 1.4))
    for g in gaps: i = int(SR * (g + 0.1)); out[i:i + len(c)] += c[: len(out) - i]
    return out
n = int(SR * 0.06)
cur = hp(lp(rng.standard_normal(n), 5200), 1500) * env(n, 0.004, 0.012)
save('click-current', three(cur), 0.5)
x = t(0.03); tap = np.sin(2 * np.pi * 1900 * x) * env(len(x), 0.0005, 0.006) + 0.6 * np.sin(2 * np.pi * 240 * x) * env(len(x), 0.0005, 0.01)
save('click-soft-tap', three(tap), 0.5)
n = int(SR * 0.04); track = lp(rng.standard_normal(n), 2200) * env(n, 0.0008, 0.005) + 0.5 * np.sin(2 * np.pi * 160 * t(0.04)) * env(n, 0.001, 0.008)
save('click-trackpad', three(track), 0.45)
x = t(0.08); wood = (np.sin(2 * np.pi * 820 * x) * env(len(x), 0.0005, 0.018) + 0.5 * np.sin(2 * np.pi * 2350 * x) * env(len(x), 0.0005, 0.008))
save('click-wood', three(wood), 0.45)
x = t(0.045); f = 520 + 900 * x / 0.045; pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.001, 0.012)
save('click-pop', three(pop), 0.45)

# ---------- other cues
d = 0.55; x = t(d); swell = np.sin(np.pi * x / d) ** 2
noise = rng.standard_normal(len(x)); band = hp(lp(noise, 2600), 500)
save('cue-whoosh', band * swell, 0.35)
save('cue-air', hp(lp(noise, 1400), 300) * np.sin(np.pi * x / d) ** 3, 0.25)
x = t(0.6); f = 180 + 120 * (x / 0.6) ** 2; rise = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x / 0.6) ** 2
save('cue-zoom-rise', lp(rise, 900), 0.3)
def bell(f0, d=1.4, dec=0.5):
    x = t(d); return sum(a * np.sin(2 * np.pi * f0 * m * x) * env(len(x), 0.003, dec / m ** 0.7) for m, a in [(1, 1), (2.0, 0.35), (3.01, 0.15), (4.2, 0.06)])
ch = pad(bell(hz('E5'), 1.2), 0, 0.0); ch2 = pad(bell(hz('B5'), 1.2), 0.12)
chime = np.zeros(max(len(ch), len(ch2))); chime[: len(ch)] += ch; chime[: len(ch2)] += 0.8 * ch2
save('cue-done-chime', reverb(chime, 1.2, 0.2), 0.35)
save('cue-done-tick', reverb(bell(hz('A5'), 0.8, 0.25), 0.8, 0.15), 0.3)
keys = np.zeros(int(SR * 1.6)); pos = 0.1
for k in range(9):
    n = int(SR * 0.03); c = lp(rng.standard_normal(n), 3000 + 800 * rng.random()) * env(n, 0.0005, 0.004)
    i = int(SR * pos); keys[i:i + n] += c * (0.7 + 0.3 * rng.random()); pos += 0.09 + 0.08 * rng.random()
save('cue-typing', keys, 0.35)
room = lp(rng.standard_normal(int(SR * 3)), 700) * 0.006
save('cue-room', room, 0.05)

# ---------- music stings: intro and outro pairs, 2.5 to 4 seconds
def voice(f0, d, kind='pad', att=0.6, dec=2.5):
    x = t(d)
    if kind == 'pad':
        w = sum(np.sin(2 * np.pi * f0 * h * x + rng.random() * 6) / h for h in range(1, 7))
        w = lp(w, 1400)
        e = np.minimum(1, x / att) * np.exp(-np.maximum(0, x - att) / dec)
    elif kind == 'piano':
        w = sum(a * np.sin(2 * np.pi * f0 * h * x) for h, a in [(1, 1), (2, 0.4), (3, 0.18), (4, 0.08)])
        e = np.minimum(1, x / 0.004) * np.exp(-x / dec)
        w = lp(w, 2400)
    else:  # mallet
        w = np.sin(2 * np.pi * f0 * x) + 0.25 * np.sin(2 * np.pi * f0 * 3.98 * x) * np.exp(-x / 0.08)
        e = np.minimum(1, x / 0.002) * np.exp(-x / dec)
    fade = np.minimum(1, (d - x) / 0.4)
    return w * e * fade
def mix(parts, d):
    out = np.zeros(int(SR * d))
    for start, v, g in parts:
        i = int(SR * start); out[i:i + len(v)] += g * v[: len(out) - i]
    return out
# 1 Warm pad: one chord swelling in; outro resolves down
D = 3.2
save('music-pad-intro', reverb(mix([(0, voice(hz(n), D, 'pad', 0.9, 2.2), 0.5) for n in ['F3', 'C4', 'E4', 'A4', 'G4']], D), 2.0, 0.3), 0.5)
save('music-pad-outro', reverb(mix([(0, voice(hz(n), D, 'pad', 0.5, 1.4), 0.5) for n in ['C3', 'G3', 'E4', 'D4', 'G4']], D), 2.2, 0.35), 0.5)
# 2 Soft piano: three rising notes and a chord; outro falls to rest
D = 3.4
save('music-piano-intro', reverb(mix([(0.0, voice(hz('C4'), D, 'piano', dec=1.6), .7), (0.28, voice(hz('G4'), D, 'piano', dec=1.6), .6), (0.56, voice(hz('E5'), D, 'piano', dec=1.8), .55), (0.9, voice(hz('A3'), D, 'piano', dec=2.2), .45), (0.9, voice(hz('D5'), D, 'piano', dec=2.2), .4)], D), 1.8, 0.3), 0.5)
save('music-piano-outro', reverb(mix([(0.0, voice(hz('E5'), D, 'piano', dec=1.6), .6), (0.3, voice(hz('B4'), D, 'piano', dec=1.6), .55), (0.6, voice(hz('G4'), D, 'piano', dec=2.0), .55), (0.6, voice(hz('C3'), D, 'piano', dec=2.4), .5), (0.6, voice(hz('E4'), D, 'piano', dec=2.4), .4)], D), 2.0, 0.32), 0.5)
# 3 Mallet: two clean hits a fifth apart; outro lands an octave lower
D = 2.6
save('music-mallet-intro', reverb(mix([(0.0, voice(hz('D5'), D, 'mallet', dec=0.7), .7), (0.22, voice(hz('A5'), D, 'mallet', dec=0.9), .6), (0.22, voice(hz('D4'), D, 'mallet', dec=1.2), .4)], D), 1.4, 0.3), 0.5)
save('music-mallet-outro', reverb(mix([(0.0, voice(hz('A5'), D, 'mallet', dec=0.7), .6), (0.22, voice(hz('D5'), D, 'mallet', dec=1.0), .65), (0.22, voice(hz('D3'), D, 'mallet', dec=1.4), .45)], D), 1.6, 0.32), 0.5)
# 4 Air and pulse: a soft rise into one low note; outro is the note alone, fading
D = 3.0; x = t(D)
riseN = hp(lp(rng.standard_normal(len(x)), 1800), 400) * np.clip(x / 1.2, 0, 1) ** 2 * (x < 1.25)
save('music-air-intro', reverb(mix([(0, riseN, 0.25), (1.2, voice(hz('A2'), 1.8, 'pad', 0.05, 1.0), 0.8), (1.2, voice(hz('E4'), 1.8, 'piano', dec=1.0), 0.35)], D), 1.8, 0.3), 0.5)
save('music-air-outro', reverb(mix([(0, voice(hz('A2'), 2.6, 'pad', 0.05, 1.2), 0.8), (0, voice(hz('C#5'), 2.6, 'piano', dec=1.4), 0.3), (0.3, voice(hz('E5'), 2.3, 'piano', dec=1.4), 0.25)], D), 2.0, 0.32), 0.5)
print('ok', len(os.listdir(OUT)))
