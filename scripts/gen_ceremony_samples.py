#!/usr/bin/env python3
"""
v1.2 "Ceremonies": head-tonsure (first haircut) invitation templates.
Original procedural art (PIL; illustrated/symbolic — kalash, marigold torans, temple gopuram, diyas,
kolam, jhumkas, scissors & comb, baby silhouettes; no real faces) + original synthesized music
(shehnai / nadaswaram-style reed over drone & dholak / thavil, music-box lullaby). Deterministic.
Run AFTER gen_library_samples.py / gen_genz_samples.py (it only adds its own items):
  python3 scripts/gen_ceremony_samples.py
"""
import json, math, os, random, shutil, subprocess, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, "catalog", "library")
PUB = os.path.join(ROOT, "apps", "web", "public", "library")
S = 960
GF = "/usr/share/fonts/truetype/sand-box/google"
def fpath(fam):
    d = os.path.join(GF, fam)
    fs = sorted(f for f in os.listdir(d) if f.endswith(".ttf"))
    bold = [f for f in fs if "Bold" in f and "Italic" not in f and "Semi" not in f and "Extra" not in f]
    return os.path.join(d, (bold or fs)[0])
def font(fam, size):
    f = ImageFont.truetype(fpath(fam), size, layout_engine=ImageFont.Layout.RAQM)
    try: f.set_variation_by_name("Bold")
    except Exception: pass
    return f
H = lambda h: tuple(int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
def layer(): return Image.new("RGBA", (S, S), (0, 0, 0, 0))
def comp(a, b, blur=0):
    if blur: b = b.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(a, b)

def grad(c1, c2, c3=None, cx=.5, cy=.42, linear=False, seed=1):
    y, x = np.mgrid[0:S, 0:S] / S
    t = np.clip(y if linear else np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / .85, 0, 1)[..., None]
    a, b = np.array(H(c1), float), np.array(H(c2), float)
    img = a + (b - a) * t if not c3 else np.where(t < .5, a + (b - a) * t * 2, b + (np.array(H(c3), float) - b) * (t - .5) * 2)
    img += np.random.default_rng(seed).normal(0, 2, (S, S, 1))
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")

def bokeh(img, rnd, cols, n=40, r=(8, 50), a=90, blur=6):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        rr = rnd.uniform(*r); x, y = rnd.uniform(0, S), rnd.uniform(0, S)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=H(rnd.choice(cols)) + (int(a * rnd.uniform(.4, 1)),))
    return comp(img, l, blur)

def marigold(d, x, y, r, c1="#ff9f1c", c2="#ffbf47"):
    for k in range(3):
        rr = r * (1 - k * .28); n = 12 - k * 3
        for i in range(n):
            a = i / n * 2 * math.pi + k * .3
            px, py = x + math.cos(a) * rr * .55, y + math.sin(a) * rr * .55
            d.ellipse([px - rr * .45, py - rr * .45, px + rr * .45, py + rr * .45], fill=H(c1 if (i + k) % 2 else c2) + (255,))
    d.ellipse([x - r * .18, y - r * .18, x + r * .18, y + r * .18], fill=H("#e85d04") + (255,))

def toran(img, rnd, y0=0, cols=("#ff9f1c", "#ffbf00", "#f77f00"), leaf="#2d6a4f", sag=60):
    l = layer(); d = ImageDraw.Draw(l)
    for i in range(14):  # mango leaves
        x = 30 + i * 70; d.polygon([(x, y0 + 30), (x + 18, y0 + 90), (x, y0 + 130), (x - 18, y0 + 90)], fill=H(leaf) + (255,))
        d.line([(x, y0 + 35), (x, y0 + 125)], fill=H("#95d5b2") + (255,), width=2)
    for i in range(30):
        t = i / 29; x = t * S; y = y0 + 22 + sag * math.sin(math.pi * t) * .5 + 20 * math.sin(math.pi * t * 3) ** 2
        marigold(d, x, y, 26, *rnd.sample(list(cols), 2))
    for i in range(7):  # hanging strings
        x = 70 + i * 135; L = rnd.randint(140, 260)
        for j in range(int(L / 34)): marigold(d, x, y0 + 60 + j * 34, 15, cols[j % len(cols)], cols[(j + 1) % len(cols)])
    return comp(img, l)

def kalash(img, cx=S / 2, cy=S * .62, s=1.0):
    l = layer(); d = ImageDraw.Draw(l)
    w = 220 * s
    d.ellipse([cx - w, cy - w * .9, cx + w, cy + w * .95], fill=H("#d4a017") + (255,))
    d.ellipse([cx - w * .85, cy - w * .75, cx + w * .2, cy + w * .2], fill=H("#f6d365") + (120,))
    d.rectangle([cx - w * .45, cy - w * 1.15, cx + w * .45, cy - w * .8], fill=H("#c08a00") + (255,))
    d.rectangle([cx - w * .8, cy - w * .25, cx + w * .8, cy - w * .05], fill=H("#c1121f") + (255,))
    for i in range(9):
        a = math.pi * (1.05 + i * .1); d.polygon([(cx, cy - w * 1.1), (cx + math.cos(a) * w * 1.1, cy - w * 1.1 + math.sin(a) * w * .9), (cx + math.cos(a + .08) * w * .7, cy - w * 1.1 + math.sin(a + .08) * w * .5)], fill=H("#2d6a4f") + (255,))
    d.ellipse([cx - w * .42, cy - w * 1.75, cx + w * .42, cy - w * 1.05], fill=H("#8b5a2b") + (255,))  # coconut
    d.ellipse([cx - w * .3, cy - w * 1.7, cx + w * .1, cy - w * 1.45], fill=H("#a47148") + (255,))
    for i in range(5): d.ellipse([cx - 12 + (i - 2) * 46, cy - w * .2 - 12, cx + 12 + (i - 2) * 46, cy - w * .2 + 12], fill=H("#ffd166") + (255,))
    return comp(img, l)

def diyas(img, rnd, n=5, y=S * .86):
    l = layer(); d = ImageDraw.Draw(l); g = layer(); dg = ImageDraw.Draw(g)
    for i in range(n):
        x = S * (i + .5) / n
        d.chord([x - 60, y - 40, x + 60, y + 40], 0, 180, fill=H("#b5651d") + (255,))
        d.chord([x - 50, y - 30, x + 50, y + 26], 0, 180, fill=H("#e07a1f") + (255,))
        d.polygon([(x - 8, y - 4), (x, y - 58), (x + 8, y - 4)], fill=H("#ffd166") + (255,))
        dg.ellipse([x - 55, y - 110, x + 55, y + 10], fill=H("#ffb703") + (120,))
    return comp(comp(img, g, 25), l)

def gopuram(img, cx=S / 2, base=S * .9, w=520, tiers=6, col="#7f2704", hi="#f4a259"):
    l = layer(); d = ImageDraw.Draw(l)
    tw, y = w, base
    for k in range(tiers):
        th = 70 - k * 4
        d.polygon([(cx - tw / 2, y), (cx + tw / 2, y), (cx + tw / 2 - 26, y - th), (cx - tw / 2 + 26, y - th)], fill=H(col) + (255,))
        for j in range(int(tw / 46)): 
            x = cx - tw / 2 + 30 + j * 46
            if x < cx + tw / 2 - 30: d.rectangle([x, y - th + 16, x + 14, y - 12], fill=H(hi) + (200,))
        y -= th; tw -= 70
    d.rounded_rectangle([cx - tw / 2 - 20, y - 60, cx + tw / 2 + 20, y], 30, fill=H(col) + (255,))
    for j in range(5): d.ellipse([cx - 60 + j * 30 - 9, y - 90, cx - 60 + j * 30 + 9, y - 60], fill=H("#ffd166") + (255,))
    d.rectangle([cx - 45, base - 130, cx + 45, base], fill=H("#2b0f02") + (255,))
    d.pieslice([cx - 45, base - 175, cx + 45, base - 85], 180, 360, fill=H("#2b0f02") + (255,))
    return comp(img, l)

def bells(img, rnd, n=5, y=60, col="#e9c46a"):
    l = layer(); d = ImageDraw.Draw(l)
    for i in range(n):
        x = S * (i + .5) / n; L = rnd.randint(60, 180)
        d.line([(x, 0), (x, y + L)], fill=H("#7f5539") + (255,), width=4)
        d.pieslice([x - 34, y + L - 10, x + 34, y + L + 70], 180, 360, fill=H(col) + (255,))
        d.rectangle([x - 36, y + L + 24, x + 36, y + L + 34], fill=H(col) + (255,))
        d.ellipse([x - 8, y + L + 30, x + 8, y + L + 46], fill=H("#9c6644") + (255,))
    return comp(img, l)

def kolam(img, col="#ffffff", grid=7, step=88, cx=S / 2, cy=S / 2):
    l = layer(); d = ImageDraw.Draw(l)
    o = cx - (grid - 1) * step / 2, cy - (grid - 1) * step / 2
    for i in range(grid):
        for j in range(grid):
            if abs(i - grid // 2) + abs(j - grid // 2) > grid // 2: continue
            x, y = o[0] + i * step, o[1] + j * step
            d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=H(col) + (255,))
            d.arc([x - step / 2, y - step / 2, x + step / 2, y + step / 2], 45 + 90 * ((i + j) % 4), 45 + 90 * ((i + j) % 4) + 270, fill=H(col) + (235,), width=6)
    return comp(img, l)

def jhumka(d, x, y, s=1, gold="#e9c46a", gem="#d00000"):
    d.ellipse([x - 14 * s, y, x + 14 * s, y + 28 * s], fill=H(gold) + (255,)); d.ellipse([x - 7 * s, y + 7 * s, x + 7 * s, y + 21 * s], fill=H(gem) + (255,))
    d.line([(x, y + 28 * s), (x, y + 50 * s)], fill=H(gold) + (255,), width=int(4 * s))
    d.pieslice([x - 50 * s, y + 40 * s, x + 50 * s, y + 150 * s], 180, 360, fill=H(gold) + (255,))
    for k in range(7): d.ellipse([x - 46 * s + k * 15 * s - 5 * s, y + 92 * s, x - 46 * s + k * 15 * s + 5 * s, y + 104 * s], fill=H("#ffffff") + (255,))

def banana_leaves(img, side="both", col="#40916c"):
    l = layer(); d = ImageDraw.Draw(l)
    for sx in ([0, S] if side == "both" else [0 if side == "left" else S]):
        for k in range(3):
            dirn = 1 if sx == 0 else -1
            pts = [(sx, S * (.25 + k * .2)), (sx + dirn * 250, S * (.08 + k * .22)), (sx + dirn * 190, S * (.3 + k * .2)), (sx, S * (.45 + k * .2))]
            d.polygon(pts, fill=H(col) + (235,))
            d.line([pts[0], pts[1]], fill=H("#b7e4c7") + (200,), width=5)
    return comp(img, l)

def scissors(d, x, y, s=1, col="#ffffff", rot=0):
    def R(px, py):
        c, si = math.cos(rot), math.sin(rot); return (x + (px * c - py * si) * s, y + (px * si + py * c) * s)
    for sg in (-1, 1):
        d.polygon([R(0, 0), R(160, sg * 26), R(170, sg * 10), R(0, sg * -6)], fill=H(col) + (255,))
        cx, cy = R(-60, sg * 40); d.ellipse([cx - 34 * s, cy - 34 * s, cx + 34 * s, cy + 34 * s], outline=H(col) + (255,), width=int(12 * s))
    cx, cy = R(0, 0); d.ellipse([cx - 9 * s, cy - 9 * s, cx + 9 * s, cy + 9 * s], fill=H("#ff6b6b") + (255,))

def comb(d, x, y, s=1, col="#ffd6e8"):
    d.rounded_rectangle([x, y, x + 240 * s, y + 46 * s], int(20 * s), fill=H(col) + (255,))
    for k in range(17): d.rectangle([x + 10 * s + k * 13 * s, y + 40 * s, x + 16 * s + k * 13 * s, y + 110 * s], fill=H(col) + (255,))

def baby(img, cx=S / 2, cy=S * .56, s=1, col="#ffffff", a=235, curl=True):
    l = layer(); d = ImageDraw.Draw(l); c = H(col) + (a,)
    d.ellipse([cx - 120 * s, cy - 250 * s, cx + 120 * s, cy - 10 * s], fill=c)  # head
    d.ellipse([cx - 140 * s, cy - 150 * s, cx - 100 * s, cy - 90 * s], fill=c); d.ellipse([cx + 100 * s, cy - 150 * s, cx + 140 * s, cy - 90 * s], fill=c)  # ears
    d.rounded_rectangle([cx - 150 * s, cy - 10 * s, cx + 150 * s, cy + 250 * s], int(110 * s), fill=c)  # body
    if curl: d.arc([cx - 30 * s, cy - 300 * s, cx + 30 * s, cy - 230 * s], 200, 520, fill=c, width=int(14 * s))
    return comp(img, l)

def petals(img, rnd, cols, n=70):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y, r = rnd.uniform(0, S), rnd.uniform(0, S), rnd.uniform(8, 18); a = rnd.uniform(0, math.pi)
        d.ellipse([x - r, y - r * .5, x + r, y + r * .5], fill=H(rnd.choice(cols)) + (220,))
    return comp(img, l)

def stars(img, rnd, cols, n=12):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y, r = rnd.uniform(40, S - 40), rnd.uniform(40, S - 40), rnd.uniform(14, 34)
        d.polygon([(x + math.cos(k * math.pi / 5 - math.pi / 2) * (r if k % 2 == 0 else r * .45), y + math.sin(k * math.pi / 5 - math.pi / 2) * (r if k % 2 == 0 else r * .45)) for k in range(10)], fill=H(rnd.choice(cols)) + (255,))
    return comp(img, l)

def clouds(img, col="#ffffff", a=230):
    l = layer(); d = ImageDraw.Draw(l)
    for (x, y, s) in [(160, 200, 1), (760, 150, .8), (620, 760, 1.1), (180, 820, .7)]:
        for dx, dy, r in [(-60, 10, 60), (0, -20, 80), (70, 10, 60), (0, 30, 70)]: d.ellipse([x + (dx - r) * s, y + (dy - r) * s, x + (dx + r) * s, y + (dy + r) * s], fill=H(col) + (a,))
    return comp(img, l)

def word(img, text, fam, size, y, fill="#ffffff", stroke="#7a1f00", sw=6):
    l = layer(); d = ImageDraw.Draw(l); f = font(fam, size)
    w = d.textlength(text, font=f); d.text(((S - w) / 2, y), text, font=f, fill=H(fill) + (255,), stroke_width=sw, stroke_fill=H(stroke) + (255,))
    return comp(img, l)

def heart_frame(img, cx=S / 2, cy=S * .5, r=300, col="#ffb3c6"):
    l = layer(); d = ImageDraw.Draw(l)
    d.ellipse([cx - r, cy - r * .9, cx, cy + r * .1], fill=H(col) + (255,)); d.ellipse([cx, cy - r * .9, cx + r, cy + r * .1], fill=H(col) + (255,))
    d.polygon([(cx - r * .97, cy - r * .2), (cx + r * .97, cy - r * .2), (cx, cy + r * .95)], fill=H(col) + (255,))
    d.arc([cx - 70, cy - 170, cx + 70, cy - 30], 150, 470, fill=H("#7b4b2a") + (255,), width=22)  # lock of hair
    d.arc([cx - 30, cy - 120, cx + 50, cy - 40], 100, 400, fill=H("#7b4b2a") + (255,), width=16)
    d.polygon([(cx - 40, cy + 20), (cx + 40, cy + 20), (cx, cy + 70)], fill=H("#ff8fab") + (255,))  # bow
    return comp(img, l)

R = random.Random
def art():
    A = {}
    # 1) Mundan Sanskar — North Indian, saffron & marigold
    A["mundan"] = [
        lambda: toran(kalash(bokeh(grad("#ffd27a", "#ff8c1a", "#b33a00", seed=2), R(1), ["#fff3c4", "#ffb703"], 36)), R(2)),
        lambda: word(diyas(toran(bokeh(grad("#7a1f00", "#3d0a00", seed=3), R(3), ["#ffb703", "#fb8500"], 50), R(4), y0=-20), R(5)), "शुभ मुंडन संस्कार", "Noto Sans Devanagari", 86, 380, "#ffd166", "#5a1400"),
        lambda: petals(scissors_scene(grad("#ffe8a3", "#ffb347", "#f77f00", seed=4)), R(6), ["#ff9f1c", "#ffbf00", "#e85d04", "#fff3c4"]),
    ]
    # 2) Puttu Ventrukalu — Telugu, temple / Tirupati dawn
    A["puttu"] = [
        lambda: bells(gopuram(bokeh(grad("#ffcf70", "#e76f51", "#6a040f", linear=True, seed=5), R(7), ["#fff1c1", "#ffd166"], 30)), R(8)),
        lambda: word(banana_leaves(kalash(grad("#fff0c2", "#f4a259", "#9d0208", seed=6), s=.9)), "పుట్టు వెంట్రుకలు", "Hind Guntur", 92, 70, "#fff6d5", "#7f0000"),
        lambda: word(diyas(baby(bokeh(grad("#8d0801", "#3a0603", seed=7), R(9), ["#ffd166", "#f4a259"], 45), col="#ffd9a0", a=210), R(10)), "శుభాకాంక్షలు", "Ramabhadra", 104, 50, "#ffd166", "#5a0000"),
    ]
    # 3) Mottai & Kaathu Kuthu — Tamil, kolam / jhumka / temple
    A["mottai"] = [
        lambda: word(kolam(grad("#c9184a", "#590d22", seed=8)), "மொட்டை & காது குத்து", "Hind Madurai", 62, 70, "#ffffff", "#3c0919"),
        lambda: jhumka_scene(banana_leaves(grad("#2d6a4f", "#081c15", seed=9), col="#52b788")),
        lambda: bells(gopuram(bokeh(grad("#ffb3c1", "#c9184a", "#3c0919", linear=True, seed=10), R(11), ["#ffe5ec", "#ffd166"], 30), col="#590d22", hi="#ffd166"), R(12), col="#ffd166"),
    ]
    # 4) First Haircut — modern pastel
    A["firsthaircut"] = [
        lambda: word(scissors_pastel(clouds(grad("#d7f9ff", "#cdb4ff", "#ffc8dd", seed=11))), "First Haircut!", "Fredoka", 96, 720, "#ffffff", "#9d4edd"),
        lambda: stars(baby(grad("#fff1e6", "#ffd6e8", "#cdb4ff", seed=12), col="#ffffff", a=240), R(13), ["#ffd166", "#ffafcc", "#a2d2ff", "#ffffff"], 14),
        lambda: stars(heart_frame(clouds(grad("#e2f0cb", "#bde0fe", "#ffc8dd", seed=13), a=200)), R(14), ["#ffffff", "#ffd166"], 10),
        lambda: word(bokeh(grad("#ffafcc", "#cdb4ff", "#a2d2ff", seed=14), R(15), ["#ffffff", "#fff1a8"], 60, (10, 70), 140, 3), "little big day", "Pacifico", 90, 410, "#ffffff", "#7b2cbf"),
    ]
    return A

def scissors_scene(img):
    l = layer(); d = ImageDraw.Draw(l)
    scissors(d, 330, 470, 1.6, "#ffffff", -0.5); comb(d, 420, 640, 1.2, "#7a1f00")
    img = comp(img, l)
    return baby(img, cx=S * .5, cy=S * .42, s=.55, col="#7a1f00", a=150)

def scissors_pastel(img):
    l = layer(); d = ImageDraw.Draw(l)
    scissors(d, 300, 380, 1.7, "#9d4edd", -0.6); comb(d, 470, 470, 1.1, "#ff8fab")
    return comp(img, l)

def jhumka_scene(img):
    l = layer(); d = ImageDraw.Draw(l)
    jhumka(d, S * .33, 260, 1.9); jhumka(d, S * .67, 260, 1.9)
    img = comp(img, l)
    return word(img, "காது குத்து", "Catamaran", 92, 720, "#ffd166", "#081c15")

# ───────── audio ─────────
SR = 32000
NOTE = lambda m: 440.0 * 2 ** ((m - 69) / 12)
def place(buf, sig, at):
    i = int(at * SR); j = min(len(buf), i + len(sig))
    if 0 <= i < len(buf): buf[i:j] += sig[: j - i]
def reed(freq, dur, bright=1.0, vib=5.2, depth=.012, glide=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = freq * (1 + depth * np.sin(2 * np.pi * vib * t) * np.clip(t / .25, 0, 1)) * (1 + glide * np.exp(-t * 18))
    ph = 2 * np.pi * np.cumsum(f) / SR
    w = sum((1 / k ** (1.1 / bright)) * np.sin(k * ph) * (1.3 if k % 2 else .8) for k in range(1, 12))
    w += .03 * np.random.default_rng(int(freq)).normal(0, 1, n)  # breath
    env = np.minimum(1, t / .05) * np.minimum(1, (dur - t) / .08).clip(0, 1)
    return np.tanh(w * .6) * env
def drone(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    return sum(.5 * np.sin(2 * np.pi * f * t) + .25 * np.sin(4 * np.pi * f * t) + .12 * np.sin(6 * np.pi * f * t) for f in freqs) * (.85 + .15 * np.sin(2 * np.pi * .5 * t))
def drum(f0, dur, decay, noise=.2, seed=0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 * (1 + .6 * np.exp(-t * 40))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) + noise * np.random.default_rng(seed).uniform(-1, 1, n)) * np.exp(-t * decay)
def bell(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR; ph = 2 * np.pi * freq * t
    return (np.sin(ph) + .5 * np.sin(2.76 * ph) + .25 * np.sin(5.4 * ph)) * np.exp(-t * 3)

def song(kind):
    if kind == "shehnai":  # Mundan: shehnai over Sa-Pa drone + dholak, raag Bilawal-ish (major)
        bpm, sa, scale, bright = 92, 60, [0, 2, 4, 5, 7, 9, 11, 12], .9
        mel = [(0, 1), (2, 1), (4, 2), (5, 1), (4, 1), (2, 2), (4, 1), (7, 1), (9, 2), (7, 1), (5, 1), (4, 2), (2, 1), (4, 1), (2, 1), (0, 3)]
        perc = "dholak"
    elif kind == "nadaswaram":  # Telugu temple: nadaswaram, raag Mohanam (pentatonic) + thavil
        bpm, sa, scale, bright = 104, 62, [0, 2, 4, 7, 9, 12], 1.3
        mel = [(4, 1), (7, 1), (9, 2), (12, 1), (9, 1), (7, 2), (4, 1), (2, 1), (4, 2), (7, 1), (4, 1), (2, 1), (0, 1), (2, 2), (0, 2)]
        perc = "thavil"
    elif kind == "nadaswaram2":  # Tamil: Hamsadhwani (S R G P N) brighter, faster thavil
        bpm, sa, scale, bright = 112, 61, [0, 2, 4, 7, 11, 12], 1.4
        mel = [(0, 1), (4, 1), (7, 1), (11, 1), (12, 2), (11, 1), (7, 1), (4, 2), (7, 1), (4, 1), (2, 1), (4, 1), (2, 1), (0, 1), (-1, 1), (0, 3)]
        perc = "thavil2"
    else:  # music box lullaby
        bpm, sa, scale, bright = 84, 72, [0, 2, 4, 7, 9, 12], 1
        mel = [(0, 1), (4, 1), (7, 1), (12, 1), (9, 1), (7, 1), (4, 2), (2, 1), (4, 1), (7, 1), (9, 1), (7, 2), (4, 2), (0, 1), (2, 1), (0, 2)]
        perc = None
    beat = 60 / bpm; total = sum(d for _, d in mel) * beat / 2 * 2
    buf = np.zeros(int((total + 1) * SR))
    if kind != "musicbox":
        place(buf, .16 * drone([NOTE(sa - 12), NOTE(sa - 5)], total + .5), 0)
    t = 0.0
    for rep in range(2):
        for iv, d in mel:
            dur = d * beat / 2 * 1.0
            f = NOTE(sa + iv)
            if kind == "musicbox":
                place(buf, .32 * bell(f, dur * 2.5), t); place(buf, .12 * bell(f * 2, dur), t + .01)
            else:
                place(buf, .30 * reed(f, dur * 1.02, bright, glide=.02 if iv % 2 else 0), t)
            t += dur
        if t >= total: break
    t = 0.0; k = 0
    while t < total and perc:
        if perc == "dholak":
            place(buf, .42 * drum(85, .35, 9, .05, k), t)
            place(buf, .25 * drum(340, .12, 30, .3, k), t + beat * .5)
            if k % 2: place(buf, .2 * drum(380, .1, 35, .35, k), t + beat * .75)
        else:
            fast = perc == "thavil2"
            place(buf, .45 * drum(110, .25, 14, .1, k), t)
            place(buf, .35 * drum(520, .08, 45, .6, k), t + beat * (.5 if not fast else .33))
            if fast or k % 2: place(buf, .3 * drum(560, .07, 50, .6, k + 9), t + beat * (.75 if not fast else .66))
        t += beat; k += 1
    if kind == "musicbox":
        t = 0.0
        while t < total: place(buf, .05 * drone([NOTE(sa - 24)], beat * 2), t); t += beat * 2
    n = int(total * SR); buf = buf[:n]
    fade = int(.04 * SR); buf[:fade] *= np.linspace(0, 1, fade); buf[-fade:] *= np.linspace(1, 0, fade)
    return buf

def write_mp3(sig, path, kbps=64):
    sig = sig / max(1e-6, np.max(np.abs(sig))) * .85
    pcm = (sig * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f: tmp = f.name
    with wave.open(tmp, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-ac", "1", "-b:a", f"{kbps}k", path], check=True); os.unlink(tmp)
    return len(sig) / SR

AUDIO = {
 "ceremony-shehnai": ("Shehnai Blessing", "shehnai", ["ceremony", "mundan", "shehnai", "festive"]),
 "ceremony-nadaswaram": ("Temple Nadaswaram", "nadaswaram", ["ceremony", "temple", "nadaswaram", "telugu"]),
 "ceremony-nadaswaram-bright": ("Mangala Vadyam", "nadaswaram2", ["ceremony", "tamil", "nadaswaram", "thavil"]),
 "ceremony-musicbox": ("First Snip Lullaby", "musicbox", ["ceremony", "baby", "lullaby", "music-box"]),
}

TEMPLATES = [
 dict(key="mundan", id="template.mundan-sanskar", name="Mundan Sanskar", emoji="🪔", theme="theme.golden-hour", beat="audio.warm-acoustic-092",
      transition="light-leak", tx=650, textStyle="soft-serif", audio="ceremony-shehnai", sting="stinger-chime",
      desc="Head-tonsure ceremony invitation: kalash, marigold torans, diyas and a gentle shehnai.", vibe="Saffron · marigold · shehnai",
      native="मुंडन संस्कार", tags=["mundan", "hindi"],
      inv=dict(hostName="Sharma & Verma families", eventName="Aarav's Mundan Sanskar", eventWhen="Sun, 15 Feb · 10:30 AM", eventWhere="Shri Ram Mandir, Lucknow")),
 dict(key="puttu", id="template.puttu-ventrukalu", name="Puttu Ventrukalu", emoji="🛕", theme="theme.soft-film", beat="audio.warm-acoustic-092",
      transition="zoom-through", tx=600, textStyle="vintage-poster", audio="ceremony-nadaswaram", sting="stinger-chime",
      desc="Telugu first-hair offering at the temple: gopuram at dawn, bells, kalash and nadaswaram.", vibe="Temple dawn · bells · nadaswaram",
      native="పుట్టు వెంట్రుకలు", tags=["telugu", "tirupati", "temple"],
      inv=dict(hostName="Reddy & Rao families", eventName="Chinni's Puttu Ventrukalu", eventWhen="Fri, 6 Mar · 7:00 AM", eventWhere="Tirumala Kalyana Katta, Tirupati")),
 dict(key="mottai", id="template.mottai-kaathu-kuthu", name="Mottai & Kaathu Kuthu", emoji="✨", theme="theme.rose-quartz", beat="audio.lobby-time-096",
      transition="push", tx=550, textStyle="bold-impact", audio="ceremony-nadaswaram-bright", sting="stinger-sparkle",
      desc="Tamil tonsure + ear-piercing invitation: kolam, jhumkas, banana leaves and mangala vadyam.", vibe="Kolam · jhumka · thavil",
      native="மொட்டை & காது குத்து", tags=["tamil", "ear-piercing", "temple"],
      inv=dict(hostName="Murugan & Lakshmi family", eventName="Kavin's Mottai & Kaathu Kuthu", eventWhen="Sun, 22 Mar · 9:00 AM", eventWhere="Palani Murugan Temple")),
 dict(key="firsthaircut", id="template.first-haircut", name="First Haircut", emoji="✂️", theme="theme.minimal-white", beat="audio.carefree-140",
      transition="slide", tx=500, textStyle="clean-sans", audio="ceremony-musicbox", sting="stinger-sparkle",
      desc="Modern pastel first-haircut party: clouds, scissors & comb stickers, a keepsake lock and a music-box lullaby.", vibe="Pastel · clouds · music box",
      native="First Haircut ✂️", tags=["pastel", "modern", "kids"],
      inv=dict(hostName="Mia & Leo", eventName="Noah's First Haircut", eventWhen="Sat, 11 Apr · 11 AM", eventWhere="Little Curls Studio · 8 Bay St")),
]

def main():
    random.seed(9)
    cat_path = os.path.join(ROOT, "catalog", "manifest.json"); cat = json.load(open(cat_path))
    beats = {p["id"] for p in cat["packs"] if p["kind"] == "audio" or p["id"].startswith("audio.")}
    trans = {p.get("transition") for p in cat["packs"] if p["kind"] == "template"}
    man_path = os.path.join(LIB, "manifest.json"); man = json.load(open(man_path))
    items = [i for i in man["items"] if not i.get("ceremony") or i["kind"] == "audio"]  # audio: scripts/audio/
    os.makedirs(os.path.join(LIB, "photos"), exist_ok=True); os.makedirs(os.path.join(LIB, "audio"), exist_ok=True)
    A = art(); scenes = {}
    for key, paints in A.items():
        ids = []
        for i, paint in enumerate(paints):
            sid = f"tpl-{key}-{i + 1}"
            img = paint().convert("RGB")
            img.save(os.path.join(LIB, "photos", f"{sid}.webp"), "WEBP", quality=78, method=6)
            img.resize((240, 240), Image.LANCZOS).save(os.path.join(LIB, "photos", f"{sid}-thumb.webp"), "WEBP", quality=72)
            items.append({"id": f"lib.photo.{sid}", "title": f"{key.title()} {i + 1}", "kind": "photo", "tags": ["ceremony", "tonsure", key], "sample": True, "ceremony": True,
                          "url": f"library/photos/{sid}.webp", "thumbnail": f"library/photos/{sid}-thumb.webp"})
            ids.append(sid)
        scenes[key] = ids
    # v1.3.0: ceremony music is real recordings (scripts/audio/sources.json); no synthesis here any more.
    man["items"] = items
    json.dump(man, open(man_path, "w"), indent=2, ensure_ascii=False)

    cat["packs"] = [p for p in cat["packs"] if p["id"] not in {t["id"] for t in TEMPLATES}]
    sp = os.path.join(LIB, "samples.json"); samples = json.load(open(sp))
    anims = [{"in": "fade", "emphasis": "ken-burns", "inSec": .5}, {"in": "zoom-in", "emphasis": "float", "inSec": .45},
             {"in": "slide-up", "emphasis": "ken-burns-out", "inSec": .45}, {"in": "pop", "emphasis": "pulse", "inSec": .35}]
    for t in TEMPLATES:
        ids = scenes[t["key"]]; hold = 3.2; tx = round(t["tx"] / 1000, 2)
        total = round(hold * len(ids) - tx * (len(ids) - 1), 2)
        clips = [{"media": f"lib.photo.{sid}", "durationSec": hold, "animation": anims[i % 4], "transitionOut": t["transition"] if i < len(ids) - 1 else None,
                  "transitionSpec": {"durationSec": tx, "easing": "ease-in-out"}} for i, sid in enumerate(ids)]
        seg = hold - tx
        text = [
            {"role": "title", "value": t["native"], "at": .25, "end": round(seg + .2, 2), "position": "top", "animation": {"in": "fade", "emphasis": "float"}},
            {"role": "title", "value": "{eventName}", "at": .6, "end": round(seg + .3, 2), "position": "center", "animation": {"in": "pop", "emphasis": "pulse"}},
            {"role": "subtitle", "value": "{eventWhen}", "at": round(seg + .2, 2), "end": round(2 * seg + .2, 2), "position": "lower-third", "animation": {"in": "slide-up"}},
            {"role": "caption", "value": "{eventWhere}", "at": round(2 * seg + .2, 2), "end": total, "position": "lower-third", "animation": {"in": "slide-up"}},
            {"role": "caption", "value": "With love · {hostName}", "at": round(2 * seg + .2, 2), "end": total, "position": "bottom", "animation": {"in": "fade"}},
        ]
        samples["samples"][t["id"]] = {
            "mood": "ceremony", "grade": "warm" if t["key"] != "firsthaircut" else "dreamy", "clips": clips,
            "audio": [{"ref": f"lib:lib.audio.{t['audio']}", "at": 0, "durationSec": total, "volume": .8, "fadeInSec": .5, "fadeOutSec": 1.4, "loop": True, "label": None},
                      {"ref": f"lib:lib.audio.{t['sting']}", "at": .2, "durationSec": 1.5, "volume": .45, "loop": False, "label": None}],
            "text": text, "invitation": t["inv"], "durationSec": total,
            "preview": [f"library/photos/{sid}-thumb.webp" for sid in ids], "cover": f"library/photos/{ids[0]}-thumb.webp",
            "textStyle": t["textStyle"], "transition": t["transition"]}
        cat["packs"].append({
            "id": t["id"], "kind": "template", "version": "1.0.0", "name": t["name"], "description": t["desc"], "tier": "free",
            "tags": ["invitation", "ceremony", "tonsure", "kids"] + t["tags"] + ["9:16"], "mode": "invitation",
            "themeId": t["theme"], "motion": "float", "transition": t["transition"], "transitionDurationMs": t["tx"], "photoMotion": "gentle",
            "beatId": t["beat"], "beatSync": "soft", "textStyle": t["textStyle"], "textTransition": "fade", "aspect": "9:16",
            "durationTargetSec": round(total), "sizeBytes": 64000, "hash": f"sha256:{t['id'].split('.')[1]}-v1",
            "eventType": "Ceremony", "category": "ceremonies", "defaultTitle": t["inv"]["eventName"],
            "defaultOverlays": [{"value": t["native"], "role": "title"}], "vibe": t["vibe"], "eventEmoji": t["emoji"],
            "defaultEmojis": [t["emoji"], "🌼", "✨"], "hostPlaceholder": "Family names"})
    json.dump(samples, open(sp, "w"), indent=1, ensure_ascii=False)
    json.dump(cat, open(cat_path, "w"), indent=2, ensure_ascii=False)
    shutil.copy(cat_path, os.path.join(ROOT, "apps", "web", "public", "catalog-manifest.json"))
    for sub in ("photos", "audio"):
        for f in os.listdir(os.path.join(LIB, sub)):
            if f.startswith(("tpl-mundan", "tpl-puttu", "tpl-mottai", "tpl-firsthaircut", "ceremony-")): shutil.copy(os.path.join(LIB, sub, f), os.path.join(PUB, sub, f))
    for f in ("manifest.json", "samples.json"): shutil.copy(os.path.join(LIB, f), os.path.join(PUB, f))
    print("ceremony templates", len(TEMPLATES), "images", sum(len(v) for v in scenes.values()), "audio", len(AUDIO), "beats ok", all(t["beat"] in beats for t in TEMPLATES), beats if not all(t["beat"] in beats for t in TEMPLATES) else "")

if __name__ == "__main__":
    main()
