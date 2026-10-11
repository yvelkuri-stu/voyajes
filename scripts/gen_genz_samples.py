#!/usr/bin/env python3
"""
v0.5.2 — bold Gen Z / Gen Alpha sample media: every template gets its OWN three
original images (Y2K holo, chrome, neon, glitch, sticker, emoji-pop, grainy film,
halftone…) built procedurally in code, plus punchy transitions and text styles.

Reuses motif painters + audio loops from gen_library_samples.py (run that first
once; this script only adds/overwrites the per-template image set + samples.json).
Word stickers are rasterized with SIL-OFL Google Fonts (Luckiest Guy, Bangers,
Rubik Mono One, Shrikhand, Monoton, Press Start 2P, Permanent Marker) — OFL
allows use in generated artwork. No stock, no photos, no third-party art.

Run:  python3 scripts/gen_genz_samples.py
"""
import colorsys, json, math, os, random, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
import gen_library_samples as base

S = 640
base.S = S  # motif painters draw at this size
ROOT, LIB, PUB = base.ROOT, base.LIB, base.PUB
FONTDIR = "/usr/share/fonts/truetype/sand-box/google"
FONTS = {
    "luckiest": "Luckiest Guy/LuckiestGuy-Regular.ttf", "bangers": "Bangers/Bangers-Regular.ttf",
    "rubikmono": "Rubik Mono One/RubikMonoOne-Regular.ttf", "shrikhand": "Shrikhand/Shrikhand-Regular.ttf",
    "monoton": "Monoton/Monoton-Regular.ttf", "pixel": "Press Start 2P/PressStart2P-Regular.ttf",
    "marker": "Permanent Marker/PermanentMarker-Regular.ttf",
}
def font(name, size):
    try: return ImageFont.truetype(os.path.join(FONTDIR, FONTS[name]), size)
    except Exception: return ImageFont.load_default()

H = base.hexrgb
def layer(): return Image.new("RGBA", (S, S), (0, 0, 0, 0))

# ───────── backgrounds ─────────
def bg_holo(seed, hues):
    y, x = np.mgrid[0:S, 0:S] / S
    rng = np.random.default_rng(seed)
    f = np.zeros((S, S))
    for _ in range(4):
        cx, cy, k = rng.random(), rng.random(), rng.uniform(3, 7)
        f += np.sin(k * np.sqrt((x - cx) ** 2 + (y - cy) ** 2) * math.pi + rng.random() * 6)
    t = (f - f.min()) / (np.ptp(f) + 1e-6)
    cols = np.array([H(h) for h in hues], float)
    idx = t * (len(cols) - 1); i0 = np.floor(idx).astype(int); i1 = np.minimum(i0 + 1, len(cols) - 1); fr = (idx - i0)[..., None]
    img = cols[i0] * (1 - fr) + cols[i1] * fr
    return Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA")

def bg_neon_grid(seed, c1, c2, glow):
    img = base.grad(c1, c2, kind="linear") if S == base.S else None
    img = Image.new("RGBA", (S, S), H(c1) + (255,))
    l = layer(); d = ImageDraw.Draw(l)
    hz = S * 0.55
    for i in range(14):
        y = hz + (i ** 1.7) * 3.2
        d.line([(0, y), (S, y)], fill=H(glow) + (200,), width=2)
    for i in range(-12, 13):
        d.line([(S / 2 + i * 14, hz), (S / 2 + i * 110, S)], fill=H(glow) + (200,), width=2)
    sky = layer(); ds = ImageDraw.Draw(sky)
    for k in range(40):
        ds.rectangle([0, k * hz / 40, S, (k + 1) * hz / 40], fill=tuple(int(a + (b - a) * k / 40) for a, b in zip(H(c2), H(c1))) + (255,))
    img = Image.alpha_composite(img, sky)
    return Image.alpha_composite(Image.alpha_composite(img, l.filter(ImageFilter.GaussianBlur(4))), l)

def bg_chrome(seed, tint):
    y, x = np.mgrid[0:S, 0:S] / S
    rng = np.random.default_rng(seed)
    v = 0.5 + 0.5 * np.sin((y * 6 + np.sin(x * 5 + rng.random() * 3) * 0.8) * math.pi)
    v = v ** 1.6
    t = np.array(H(tint), float) / 255
    img = (np.stack([v, v, v], -1) * (0.55 + 0.45 * t) * 255 + 30)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

def bg_checker(c1, c2, n=8, warp=True):
    img = Image.new("RGBA", (S, S), H(c1) + (255,)); d = ImageDraw.Draw(img)
    for i in range(n):
        for j in range(n):
            if (i + j) % 2: d.rectangle([i * S / n, j * S / n, (i + 1) * S / n, (j + 1) * S / n], fill=H(c2) + (255,))
    if warp:
        a = np.array(img); yy, xx = np.mgrid[0:S, 0:S]
        xs = (xx + 22 * np.sin(yy / 47)).astype(int) % S; ys = (yy + 22 * np.sin(xx / 61)).astype(int) % S
        img = Image.fromarray(a[ys, xs])
    return img

def bg_film(c1, c2, c3=None):
    return base.grad(c1, c2, c3)

# ───────── stickers & motifs ─────────
def sticker(img, paint, outline=10, shadow=True):
    """paint(draw) onto a layer → white die-cut border + drop shadow."""
    l = layer(); paint(ImageDraw.Draw(l))
    a = l.split()[3]
    border = a.filter(ImageFilter.MaxFilter(outline * 2 + 1))
    white = Image.new("RGBA", (S, S), (255, 255, 255, 255)); white.putalpha(border)
    if shadow:
        sh = Image.new("RGBA", (S, S), (0, 0, 0, 255)); sh.putalpha(border.point(lambda v: v * 0.45))
        sh = sh.transform((S, S), Image.AFFINE, (1, 0, -8, 0, 1, -10)).filter(ImageFilter.GaussianBlur(6))
        img = Image.alpha_composite(img, sh)
    return Image.alpha_composite(Image.alpha_composite(img, white), l)

def word(img, text, fnt, size, xy, fill, rot=0, outline="#000000", stroke=6, sticky=True):
    # these display fonts are Latin-only: drop symbols they can't draw (no tofu boxes)
    text = "".join(ch for ch in text if ord(ch) < 0x2000).strip() or "yay!"
    l = layer(); d = ImageDraw.Draw(l); f = font(fnt, size)
    d.text(xy, text, font=f, fill=H(fill) + (255,), stroke_width=stroke, stroke_fill=H(outline) + (255,), anchor="mm")
    if rot: l = l.rotate(rot, center=xy, resample=Image.BICUBIC)
    if sticky:
        a = l.split()[3].filter(ImageFilter.MaxFilter(9))
        w = Image.new("RGBA", (S, S), (255, 255, 255, 255)); w.putalpha(a)
        img = Image.alpha_composite(img, w)
    return Image.alpha_composite(img, l)

def smiley(d, x, y, r, col, kind="smile"):
    d.ellipse([x - r, y - r, x + r, y + r], fill=H(col) + (255,), outline=(0, 0, 0, 255), width=max(3, int(r / 9)))
    ew = r * 0.14
    if kind == "heart-eyes":
        for ex in (-0.35, 0.35): base.heart(d, x + ex * r + r * 0.16, y - r * 0.25, r * 0.3, (255, 40, 90, 255))
    elif kind == "star-eyes":
        for ex in (-0.35, 0.35): base.star5(d, x + ex * r, y - r * 0.2, r * 0.22, (255, 220, 0, 255))
    else:
        for ex in (-0.33, 0.33): d.ellipse([x + ex * r - ew, y - r * 0.4, x + ex * r + ew, y - r * 0.05], fill=(0, 0, 0, 255))
    d.arc([x - r * 0.55, y - r * 0.35, x + r * 0.55, y + r * 0.6], 15, 165, fill=(0, 0, 0, 255), width=max(4, int(r / 8)))

def sparkles(img, rnd, cols, n=14, big=False):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y = rnd.uniform(20, S - 20), rnd.uniform(20, S - 20); r = rnd.uniform(14, 46 if big else 28)
        c = H(rnd.choice(cols)) + (255,)
        d.polygon([(x, y - r), (x + r * 0.22, y - r * 0.22), (x + r, y), (x + r * 0.22, y + r * 0.22), (x, y + r), (x - r * 0.22, y + r * 0.22), (x - r, y), (x - r * 0.22, y - r * 0.22)], fill=c)
    return Image.alpha_composite(Image.alpha_composite(img, l.filter(ImageFilter.GaussianBlur(5))), l)

def chrome_blob(img, rnd, n=3):
    for _ in range(n):
        x, y, r = rnd.uniform(100, S - 100), rnd.uniform(100, S - 100), rnd.uniform(50, 110)
        yy, xx = np.mgrid[0:S, 0:S]
        dist = np.sqrt((xx - x) ** 2 + ((yy - y) * 1.15) ** 2)
        m = (dist < r).astype(float)
        v = 0.5 + 0.5 * np.sin((yy - y) / r * 4 + (xx - x) / r * 1.3)
        rgb = np.stack([v * 230 + 20, v * 235 + 20, v * 255], -1)
        a = Image.fromarray(np.dstack([rgb, m * 255]).astype(np.uint8), "RGBA")
        img = Image.alpha_composite(img, a)
    return img

# ───────── post effects ─────────
def glitch(img, rnd, strength=18):
    a = np.array(img.convert("RGB")).copy()
    for _ in range(9):
        y0 = rnd.randint(0, S - 40); h = rnd.randint(8, 50); dx = rnd.randint(-strength * 3, strength * 3)
        a[y0:y0 + h] = np.roll(a[y0:y0 + h], dx, axis=1)
    r = np.roll(a[..., 0], strength // 2, axis=1); b = np.roll(a[..., 2], -strength // 2, axis=1)
    a = np.dstack([r, a[..., 1], b])
    a[::4] = (a[::4] * 0.82).astype(np.uint8)  # scanlines
    return Image.fromarray(a).convert("RGBA")

def grain(img, amt=14, seed=0, vignette=True, leak=None):
    a = np.array(img.convert("RGB")).astype(float)
    a += np.random.default_rng(seed).normal(0, amt, (S, S, 1))
    if vignette:
        y, x = np.mgrid[0:S, 0:S] / S
        a *= (1 - 0.55 * np.clip(np.sqrt((x - .5) ** 2 + (y - .5) ** 2) - 0.25, 0, 1))[..., None]
    if leak:
        y, x = np.mgrid[0:S, 0:S] / S
        g = np.exp(-((x - 0.95) ** 2 + (y - 0.1) ** 2) / 0.08)[..., None]
        a = a + g * np.array(H(leak), float) * 0.9
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")

def halftone(img, col, step=18):
    l = layer(); d = ImageDraw.Draw(l)
    for j in range(0, S, step):
        for i in range(0, S, step):
            r = step * 0.42 * (1 - j / S)
            if r > 0.8: d.ellipse([i - r, j - r, i + r, j + r], fill=H(col) + (90,))
    return Image.alpha_composite(img, l)

def pop(img, sat=1.25):
    from PIL import ImageEnhance
    return ImageEnhance.Contrast(ImageEnhance.Color(img.convert("RGB")).enhance(sat)).enhance(1.08).convert("RGBA")

# ───────── per-template art direction ─────────
R = random.Random
M = base  # motif painters
def bday_motifs(pal, seed):
    return [lambda: M.balloons(layer_bg(pal, seed), R(seed), pal["acc"]),
            lambda: M.confetti(layer_bg(pal, seed + 1), R(seed + 1), pal["acc"] + ["#ffffff"]),
            lambda: M.candles(layer_bg(pal, seed + 2), R(seed + 2))]
def layer_bg(pal, seed):
    st = pal["bg"]
    if st == "holo": return bg_holo(seed, pal["holo"])
    if st == "neon": return bg_neon_grid(seed, pal["c1"], pal["c2"], pal["glow"])
    if st == "chrome": return bg_chrome(seed, pal["tint"])
    if st == "checker": return bg_checker(pal["c1"], pal["c2"])
    return bg_film(pal["c1"], pal["c2"], pal.get("c3"))

def faces(img, rnd, cols, kinds=("smile", "heart-eyes", "star-eyes"), n=3):
    def paint(d):
        for i in range(n):
            smiley(d, rnd.uniform(110, S - 110), rnd.uniform(110, S - 110), rnd.uniform(55, 85), rnd.choice(cols), kinds[i % len(kinds)])
    return sticker(img, paint)

def heart_stickers(img, rnd, cols, n=4):
    def paint(d):
        for _ in range(n): base.heart(d, rnd.uniform(120, S - 60), rnd.uniform(120, S - 60), rnd.uniform(50, 90), H(rnd.choice(cols)) + (255,))
    return sticker(img, paint)

def star_stickers(img, rnd, cols, n=4):
    def paint(d):
        for _ in range(n): base.star5(d, rnd.uniform(90, S - 90), rnd.uniform(90, S - 90), rnd.uniform(50, 90), H(rnd.choice(cols)) + (255,))
    return sticker(img, paint)

# Each template: palette/background style, 3 motif painters, post-fx, word stickers
def T(bg, motifs, fx, words, **pal):
    return dict(bg=bg, motifs=motifs, fx=fx, words=words, **pal)

def ART():
    A = {}
    A["template.birthday-blast"] = T("holo", ["balloons", "faces", "confetti"], ["sparkle", "pop"], [("YAY!", "luckiest"), ("BDAY", "bangers"), ("LET'S GO", "luckiest")],
        holo=["#ff3cac", "#784ba0", "#2b86c5", "#00f5d4", "#ffe14d"], acc=["#ff3cac", "#ffe14d", "#00f5d4", "#7b2ff7"])
    A["template.candle-wish"] = T("film", ["cake", "sparkle", "faces"], ["grain", "leak"], [("make a wish", "shrikhand"), ("✦", "luckiest"), ("21+1", "monoton")],
        c1="#ffb199", c2="#ff0844", c3="#2b0018", acc=["#ffd166", "#ff8fab", "#ffffff"], leak="#ffb347")
    A["template.kids-party-pop"] = T("checker", ["faces", "balloons", "stars"], ["pop"], [("PARTY!", "luckiest"), ("WOW", "bangers"), ("HI-5", "luckiest")],
        c1="#ffde59", c2="#ff66c4", acc=["#00c2ff", "#7ed957", "#ff914d", "#8c52ff"])
    A["template.garden-soiree"] = T("film", ["petals", "arch", "hearts"], ["grain", "leak"], [("save the date", "shrikhand"), ("✿", "luckiest"), ("garden party", "marker")],
        c1="#e6ffe9", c2="#9ee6b5", c3="#2d6a4f", acc=["#ffafcc", "#ffffff", "#ffd6e0"], leak="#fff1b8")
    A["template.wedding-vows"] = T("chrome", ["rings", "hearts", "petals"], ["sparkle"], [("I DO", "monoton"), ("forever", "shrikhand"), ("✦ vows ✦", "marker")],
        tint="#ffd6e8", acc=["#ffffff", "#ffc8dd", "#cdb4db"])
    A["template.anniversary-glow"] = T("holo", ["hearts", "rings", "cake"], ["grain"], [("us <3", "shrikhand"), ("25", "monoton"), ("still us", "marker")],
        holo=["#ff9a9e", "#fad0c4", "#a18cd1", "#fbc2eb", "#ff6a88"], acc=["#ff2e63", "#ffffff", "#ff8fab"])
    A["template.blush-story"] = T("film", ["hearts", "petals", "sparkle"], ["grain", "leak"], [("soft era", "shrikhand"), ("✿", "luckiest"), ("main character", "marker")],
        c1="#ffe5ec", c2="#ffb3c6", c3="#7a2e4a", acc=["#ffffff", "#fb6f92", "#ffc2d1"], leak="#ffd6a5")
    A["template.baby-shower-bloom"] = T("holo", ["moon", "stars", "faces"], ["sparkle"], [("oh baby!", "shrikhand"), ("hi bb", "luckiest"), ("☁", "luckiest")],
        holo=["#cdb4db", "#ffc8dd", "#bde0fe", "#a2d2ff", "#fff1b8"], acc=["#ffffff", "#ffd6e0", "#bde0fe", "#fff1b8"])
    A["template.grad-caps"] = T("neon", ["caps", "stars", "confetti"], ["glitch"], [("CLASS OF '26", "rubikmono"), ("GG", "pixel"), ("NEXT LVL", "bangers")],
        c1="#0b0033", c2="#3a0ca3", glow="#4cc9f0", acc=["#f72585", "#4cc9f0", "#ffd60a"])
    A["template.holiday-sparkle"] = T("chrome", ["ornaments", "snow", "stars"], ["sparkle", "grain"], [("HOLI-YAY", "luckiest"), ("✦ jolly ✦", "marker"), ("NYE?", "bangers")],
        tint="#b9fbc0", acc=["#ff0a54", "#ffd60a", "#2dc653", "#ffffff"])
    A["template.diwali-lights"] = T("holo", ["diyas", "rangoli", "fireworks"], ["sparkle", "grain"], [("HAPPY DIWALI", "luckiest"), ("✦ lights ✦", "marker"), ("glow up", "shrikhand")],
        holo=["#3c096c", "#9d4edd", "#ff7b00", "#ffb700", "#ff006e"], acc=["#ffd60a", "#ff006e", "#ff7b00", "#ffffff"])
    A["template.housewarming-glow"] = T("checker", ["house", "sparkle", "faces"], ["grain"], [("new place who dis", "marker"), ("HOME!", "luckiest"), ("✦", "luckiest")],
        c1="#fef3c7", c2="#fbbf24", acc=["#ef476f", "#06d6a0", "#118ab2"])
    A["template.dinner-table"] = T("film", ["table", "sparkle", "hearts"], ["grain", "leak"], [("dinner?", "shrikhand"), ("yum", "luckiest"), ("8pm", "monoton")],
        c1="#3d1f12", c2="#8c4a2f", c3="#140a06", acc=["#ffd166", "#ffffff", "#ef476f"], leak="#ff9e00")
    A["template.brunch-breeze"] = T("holo", ["sunrays", "window", "faces"], ["pop"], [("brunch szn", "marker"), ("mimosa?", "shrikhand"), ("☼", "luckiest")],
        holo=["#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#ffc6ff"], acc=["#ff9f1c", "#2ec4b6", "#ff5d8f"])
    A["template.midnight-metro"] = T("neon", ["lasers", "city", "glitchwords"], ["glitch"], [("NIGHT MODE", "rubikmono"), ("404 SLEEP", "pixel"), ("CITY", "monoton")],
        c1="#05010f", c2="#2d00f7", glow="#f20089", acc=["#f20089", "#00f5ff", "#fffb00"])
    A["template.strobe-night"] = T("neon", ["disco", "lasers", "confetti"], ["glitch", "sparkle"], [("TURN UP", "bangers"), ("BPM 140", "pixel"), ("✦", "luckiest")],
        c1="#12001f", c2="#ff006e", glow="#8338ec", acc=["#ff006e", "#3a86ff", "#ffbe0b"])
    A["template.acid-drop"] = T("holo", ["lasers", "stars", "faces"], ["glitch"], [("ACID", "rubikmono"), ("DROP", "monoton"), ("glitch.exe", "pixel")],
        holo=["#ccff00", "#00ff9f", "#00b8ff", "#001eff", "#bd00ff"], acc=["#ccff00", "#000000", "#ff00e6"])
    A["template.pulse-reels"] = T("chrome", ["lasers", "sparkle", "faces"], ["glitch", "pop"], [("POV:", "bangers"), ("no skip", "marker"), ("FYP", "rubikmono")],
        tint="#a0c4ff", acc=["#ff006e", "#00f5d4", "#fee440"])
    A["template.sunlit-drift"] = T("film", ["mountains", "sunrays", "road"], ["grain", "leak"], [("golden hour", "shrikhand"), ("☼", "luckiest"), ("core memory", "marker")],
        c1="#ffdd94", c2="#fa897b", c3="#5b3256", acc=["#ffffff", "#ffd166"], leak="#ff9e00")
    A["template.coastal-bounce"] = T("holo", ["waves", "sunrays", "faces"], ["pop", "sparkle"], [("BEACH DAY", "luckiest"), ("SPF 50", "bangers"), ("~vibes~", "marker")],
        holo=["#00f5d4", "#00bbf9", "#fee440", "#9b5de5", "#f15bb5"], acc=["#fee440", "#ffffff", "#f15bb5"])
    A["template.mint-travel"] = T("checker", ["mountains", "road", "stars"], ["pop"], [("OOO", "rubikmono"), ("passport ✦", "marker"), ("GO!", "luckiest")],
        c1="#c7f9cc", c2="#57cc99", acc=["#22577a", "#ffffff", "#ff006e"])
    A["template.travel-postcard"] = T("film", ["road", "waves", "mountains"], ["grain", "leak"], [("wish u were here", "marker"), ("✈", "luckiest"), ("POSTCARD", "bangers")],
        c1="#ffcf99", c2="#ff6f59", c3="#254441", acc=["#ffffff", "#ffd166"], leak="#ffd166")
    A["template.field-notes"] = T("film", ["mountains", "stars", "road"], ["grain"], [("field notes", "marker"), ("no. 07", "pixel"), ("✦", "luckiest")],
        c1="#d6ccc2", c2="#7f6a5a", c3="#1f1a17", acc=["#ffffff", "#f2cc8f"])
    A["template.golden-recap"] = T("chrome", ["sunrays", "mountains", "sparkle"], ["grain", "leak"], [("RECAP", "monoton"), ("2026", "rubikmono"), ("dump ✦", "marker")],
        tint="#ffd166", acc=["#ffffff", "#ff9f1c"], leak="#ffb703")
    A["template.lounge-edit"] = T("holo", ["window", "sparkle", "hearts"], ["grain"], [("lofi", "marker"), ("chill", "shrikhand"), ("zZ", "luckiest")],
        holo=["#b8c0ff", "#bbd0ff", "#c8b6ff", "#e7c6ff", "#ffd6ff"], acc=["#ffffff", "#9381ff"])
    A["template.gallery-quiet"] = T("checker", ["frame", "sparkle", "frame"], ["grain"], [("curated", "marker"), ("№ 1", "monoton"), ("art", "shrikhand")],
        c1="#f5f5f5", c2="#e0e0e0", acc=["#111111", "#ff595e"])
    A["template.vhs-party"] = T("neon", ["gridsun", "faces", "confetti"], ["glitch", "grain"], [("REC ●", "pixel"), ("1999", "monoton"), ("PLAY ▶", "pixel")],
        c1="#1a0033", c2="#ff2a6d", glow="#05d9e8", acc=["#ff2a6d", "#05d9e8", "#f9c80e"])
    A["template.swing-retro"] = T("checker", ["checker", "stars", "faces"], ["grain", "halftone"], [("SWING!", "shrikhand"), ("ba-dum", "bangers"), ("✦", "luckiest")],
        c1="#fff3b0", c2="#e09f3e", acc=["#9e2a2b", "#540b0e", "#ffffff"])
    # v0.6 "starting point" stories — 5 shots each
    A["template.weekend-goa"] = T("holo", ["waves", "sunrays", "faces", "road", "sparkle"], ["pop", "grain"],
        [("GOA!", "luckiest"), ("sun's out", "marker"), ("susegad", "shrikhand"), ("scooter szn", "bangers"), ("till next time", "marker")],
        holo=["#ff9e00", "#ff5400", "#00f5d4", "#00bbf9", "#fee440"], acc=["#fee440", "#ffffff", "#ff006e", "#00f5d4"])
    A["template.road-trip-recap"] = T("film", ["stars", "mountains", "sunrays", "road", "road"], ["grain", "leak"],
        [("ROAD TRIP", "luckiest"), ("mile 214", "pixel"), ("snack stop", "marker"), ("are we there?", "bangers"), ("home ✦", "shrikhand")],
        c1="#ffcf99", c2="#e76f51", c3="#264653", acc=["#ffffff", "#f4a261", "#2a9d8f"], leak="#ffb703")
    A["template.wedding-weekend"] = T("chrome", ["disco", "petals", "hearts", "rings", "sparkle"], ["sparkle", "grain"],
        [("WEDDING WKND", "monoton"), ("mehendi", "shrikhand"), ("i do!", "marker"), ("forever", "bangers"), ("just married", "shrikhand")],
        tint="#ffd6e8", acc=["#ffffff", "#ffc8dd", "#cdb4db", "#ffafcc"])
    A["template.family-holiday"] = T("checker", ["sunrays", "faces", "waves", "house", "hearts"], ["pop"],
        [("FAMILY TRIP", "luckiest"), ("day one", "marker"), ("best day", "bangers"), ("lazy mornings", "marker"), ("love you all", "shrikhand")],
        c1="#bde0fe", c2="#ffc8dd", acc=["#ff006e", "#fb5607", "#3a86ff", "#ffbe0b"])
    return A

FOCUS_PACKS = {
    "template.weekend-goa": dict(name="Weekend in Goa", description="Beach weekend story: sun, scooters, sunsets — bright Ocean Pop look with whip cuts.",
        tags=["travel", "beach", "goa", "weekend", "9:16"], themeId="theme.ocean-pop", motion="snappy", photoMotion="gentle",
        beatId="audio.ocean-drift-084", mood="travel", grade="teal-orange", audio="lib:lib.audio.travel-breeze",
        title="Weekend in Goa", caption="Swap in your beach days"),
    "template.road-trip-recap": dict(name="Road Trip Recap", description="Miles, snacks, views — film-grain road movie recap with zoom punches.",
        tags=["travel", "road-trip", "recap", "9:16"], themeId="theme.golden-hour", motion="soft", photoMotion="gentle",
        beatId="audio.ocean-drift-084", mood="travel", grade="film", audio="lib:lib.audio.retro-groove",
        title="Road trip recap", caption="Every mile, one story"),
    "template.wedding-weekend": dict(name="Wedding Weekend", description="Mehendi to dance floor — chrome sparkle, flash cuts, warm strings.",
        tags=["wedding", "weekend", "celebration", "9:16"], themeId="theme.rose-quartz", motion="float", photoMotion="gentle",
        beatId="audio.warm-acoustic-092", mood="wedding", grade="dreamy", audio="lib:lib.audio.wedding-strings",
        title="Wedding weekend", caption="Three days, all the feels"),
    "template.family-holiday": dict(name="Family Holiday", description="Sunny family trip: big smiles, lazy mornings, pop stickers and bouncy cuts.",
        tags=["family", "holiday", "travel", "9:16"], themeId="theme.ocean-pop", motion="snappy", photoMotion="gentle",
        beatId="audio.ocean-drift-084", mood="travel", grade="vivid", audio="lib:lib.audio.cozy-keys",
        title="Family holiday", caption="Our favourite people"),
}

def ensure_focus(cat, samples):
    """Create catalog packs + base samples for the v0.6 starting-point templates."""
    have = {p["id"] for p in cat["packs"]}
    for tid, d in FOCUS_PACKS.items():
        if tid not in have:
            cat["packs"].append({"id": tid, "kind": "template", "version": "1.0.0", "name": d["name"], "description": d["description"],
                "tier": "free", "tags": d["tags"], "themeId": d["themeId"], "motion": d["motion"], "transition": PUNCH[tid][0],
                "transitionDurationMs": 450, "photoMotion": d["photoMotion"], "beatId": d["beatId"], "beatSync": "medium",
                "textStyle": PUNCH[tid][1], "textTransition": "pop", "aspect": "9:16", "durationTargetSec": 15,
                "sizeBytes": 60000, "hash": f"sha256:{tid}-v1"})
        samples["samples"][tid] = {
            "mood": d["mood"], "grade": d["grade"],
            "clips": [{"media": "", "durationSec": 3.2} for _ in range(5)],
            "audio": [{"ref": d["audio"], "at": 0, "durationSec": 14, "volume": 0.8, "fadeInSec": 0.4, "fadeOutSec": 1.4, "loop": True, "label": None},
                      {"ref": "lib:lib.audio.stinger-whoosh", "at": 0.15, "durationSec": 1.5, "volume": 0.5, "loop": False, "label": None}],
            "text": [{"role": "title", "value": d["title"], "at": 0.2, "end": 2.9, "position": "center", "animation": {"in": "pop", "emphasis": "float"}},
                     {"role": "caption", "value": d["caption"], "at": 9.6, "end": 12.6, "position": "lower-third", "animation": {"in": "slide-up"}}],
        }

def paint_motif(name, img, rnd, pal, seed):
    acc = pal["acc"]
    if name == "balloons": return M.balloons(img, rnd, acc)
    if name == "confetti": return M.confetti(img, rnd, acc + ["#ffffff"], 130)
    if name == "cake": return M.candles(img, rnd)
    if name == "faces": return faces(img, rnd, ["#ffe14d", "#ffd60a", "#ffb703"])
    if name == "stars": return star_stickers(img, rnd, acc)
    if name == "hearts": return heart_stickers(img, rnd, acc)
    if name == "sparkle": return sparkles(img, rnd, acc + ["#ffffff"], 18, True)
    if name == "petals": return M.petals(img, rnd, acc, 50)
    if name == "arch": return M.arch(img)
    if name == "rings": return chrome_blob(M.rings(img), rnd, 1)
    if name == "moon": return M.moon_clouds(img)
    if name == "caps": return M.caps(img, rnd, 5)
    if name == "ornaments": return M.ornaments(img, rnd, acc)
    if name == "snow": return M.snow(M.pines(img), rnd, 140)
    if name == "diyas": return M.diyas(img, rnd)
    if name == "rangoli": return M.rangoli(img, acc + ["#ffffff", "#00b4d8"])
    if name == "fireworks": return M.fireworks(img, rnd, acc, 4)
    if name == "house": return M.house(img)
    if name == "table": return M.table(img, rnd)
    if name == "sunrays": return M.sun_rays(img, "#fff3b0")
    if name == "window": return M.window_light(img)
    if name == "lasers": return M.lasers(img, acc)
    if name == "disco": return M.disco(img, rnd)
    if name == "city":
        l = layer(); d = ImageDraw.Draw(l)
        x = 0
        while x < S:
            w = rnd.randint(40, 90); h = rnd.randint(120, 380)
            d.rectangle([x, S - h, x + w, S], fill=(10, 0, 30, 255), outline=H(acc[1]) + (255,), width=2)
            for wy in range(S - h + 12, S - 10, 22):
                for wx in range(x + 8, x + w - 8, 16):
                    if rnd.random() < 0.5: d.rectangle([wx, wy, wx + 7, wy + 10], fill=H(rnd.choice(acc)) + (255,))
            x += w + 4
        return Image.alpha_composite(img, l)
    if name == "glitchwords": return chrome_blob(img, rnd, 2)
    if name == "mountains": return M.mountains(img, ["#3d348b", "#2b2d42", "#1a1a2e"])
    if name == "waves": return M.waves(img, ["#00bbf9", "#0077b6", "#023e8a"])
    if name == "road": return M.road(img)
    if name == "frame": return M.frame_gallery(img)
    if name == "gridsun": return M.grid_sun(img)
    if name == "checker": return M.checker(img, "#2a1a12", "#ffffff")
    return img

def apply_fx(img, fx, rnd, pal, seed):
    for f in fx:
        if f == "glitch": img = glitch(img, rnd)
        elif f == "grain": img = grain(img, 6, seed, leak=pal.get("leak") if "leak" in fx else None)
        elif f == "sparkle": img = sparkles(img, rnd, ["#ffffff"] + pal["acc"], 10)
        elif f == "pop": img = pop(img)
        elif f == "halftone": img = halftone(img, pal["acc"][0])
    return img

def make_image(tid, art, i):
    seed = abs(hash((tid, i))) % 10_000 if False else sum(map(ord, tid)) * 7 + i * 131
    rnd = R(seed)
    img = layer_bg(art, seed)
    img = paint_motif(art["motifs"][i], img, rnd, art, seed)
    img = apply_fx(img, art["fx"], rnd, art, seed)
    txt, fnt = art["words"][i]
    size = 92 if len(txt) <= 6 else 64 if len(txt) <= 10 else 46
    if fnt == "pixel": size = int(size * 0.55)
    corner = [(S * 0.5, S * 0.16), (S * 0.68, S * 0.84), (S * 0.32, S * 0.15), (S * 0.5, S * 0.85), (S * 0.62, S * 0.14)][i % 5]
    img = word(img, txt, fnt, size, corner, rnd.choice(art["acc"] + ["#ffffff"]), rot=rnd.choice([-8, -5, 4, 7]))
    return img.convert("RGB")

PUNCH = {  # template → (transition, textStyle)
    "template.birthday-blast": ("zoom-through", "bold-impact"), "template.candle-wish": ("flash", "script-soft"),
    "template.kids-party-pop": ("spin", "bold-impact"), "template.garden-soiree": ("whip", "script-soft"),
    "template.wedding-vows": ("flash", "vintage-poster"), "template.anniversary-glow": ("heart-wipe", "script-soft"),
    "template.blush-story": ("whip", "caption-pill"), "template.baby-shower-bloom": ("zoom-through", "caption-pill"),
    "template.grad-caps": ("glitch", "kinetic-outline"), "template.holiday-sparkle": ("flash", "bold-impact"),
    "template.diwali-lights": ("zoom-through", "vintage-poster"), "template.housewarming-glow": ("whip", "caption-pill"),
    "template.dinner-table": ("flash", "script-soft"), "template.brunch-breeze": ("whip", "caption-pill"),
    "template.midnight-metro": ("glitch", "mono-tech"), "template.strobe-night": ("flash", "kinetic-outline"),
    "template.acid-drop": ("glitch", "mono-tech"), "template.pulse-reels": ("zoom-through", "kinetic-outline"),
    "template.sunlit-drift": ("whip", "script-soft"), "template.coastal-bounce": ("zoom-through", "bold-impact"),
    "template.mint-travel": ("whip", "caption-pill"), "template.travel-postcard": ("whip", "vintage-poster"),
    "template.field-notes": ("glitch", "mono-tech"), "template.golden-recap": ("flash", "kinetic-outline"),
    "template.lounge-edit": ("whip", "caption-pill"), "template.gallery-quiet": ("zoom-through", "clean-sans"),
    "template.vhs-party": ("glitch", "mono-tech"), "template.swing-retro": ("spin", "vintage-poster"),
    "template.weekend-goa": ("whip", "bold-impact"), "template.road-trip-recap": ("zoom-through", "vintage-poster"),
    "template.wedding-weekend": ("flash", "script-soft"), "template.family-holiday": ("whip", "caption-pill"),
}
PUNCH_ANIMS = [{"in": "pop", "emphasis": "ken-burns", "inSec": 0.35}, {"in": "zoom-in", "emphasis": "pulse", "inSec": 0.3},
               {"in": "slide-up", "emphasis": "ken-burns-out", "inSec": 0.35}]

def main():
    art = ART()
    man_path = os.path.join(LIB, "manifest.json"); man = json.load(open(man_path))
    items = [i for i in man["items"] if not i.get("genz")]
    sp = os.path.join(LIB, "samples.json"); samples = json.load(open(sp))
    cat_path = os.path.join(ROOT, "catalog", "manifest.json")
    cat = json.load(open(cat_path))
    ensure_focus(cat, samples)
    json.dump(cat, open(cat_path, "w"), indent=2, ensure_ascii=False)
    shutil.copy(cat_path, os.path.join(ROOT, "apps", "web", "public", "catalog-manifest.json"))
    tpls = {p["id"]: p for p in cat["packs"] if p["kind"] == "template"}
    missing = [t for t in tpls if t not in art]
    assert not missing, missing
    for tid, a in art.items():
        slug = tid.replace("template.", "")
        smp = samples["samples"][tid]
        tx, ts = PUNCH[tid]
        nshots = len(a["motifs"])
        for i in range(nshots):
            img = make_image(tid, a, i)
            name = f"tpl-{slug}-{i + 1}"
            img.save(os.path.join(LIB, "photos", f"{name}.webp"), "WEBP", quality=58, method=6)
            img.resize((240, 240), Image.LANCZOS).save(os.path.join(LIB, "photos", f"{name}-thumb.webp"), "WEBP", quality=68)
            items.append({"id": f"lib.photo.{name}", "title": f"{tpls[tid]['name']} {i + 1}", "kind": "photo", "genz": True, "sample": True,
                          "tags": [smp["mood"], slug, "genz"], "url": f"library/photos/{name}.webp", "thumbnail": f"library/photos/{name}-thumb.webp"})
            c = smp["clips"][i]
            c["media"] = f"lib.photo.{name}"
            c["animation"] = PUNCH_ANIMS[i % 3]
            c["transitionOut"] = tx if i < nshots - 1 else None
            c["transitionSpec"] = {"durationSec": 0.45 if tx in ("whip", "flash", "glitch") else 0.6, "easing": "back-out" if tx in ("zoom-through", "spin") else "ease-in-out"}
        smp["preview"] = [f"library/photos/tpl-{slug}-{i + 1}-thumb.webp" for i in range(nshots)]
        smp["cover"] = smp["preview"][0]
        smp["textStyle"] = ts
        smp["transition"] = tx
        for t in smp["text"]:
            t.setdefault("animation", {})
            t["animation"]["in"] = "pop" if t["role"] == "title" else "slide-up"
        # recompute total with new transition lengths
        hold = smp["clips"][0]["durationSec"]; txd = smp["clips"][0]["transitionSpec"]["durationSec"]
        smp["durationSec"] = round(hold * nshots - txd * (nshots - 1), 2)
        smp["audio"][0]["durationSec"] = smp["durationSec"]
    man["items"] = items
    man["libraryVersion"] = "2026.10.10.1"
    samples["libraryVersion"] = man["libraryVersion"]
    json.dump(man, open(man_path, "w"), indent=2, ensure_ascii=False)
    json.dump(samples, open(sp, "w"), indent=1, ensure_ascii=False)
    if os.path.exists(PUB): shutil.rmtree(PUB)
    shutil.copytree(LIB, PUB)
    print("templates", len(art), "images", sum(len(a["motifs"]) for a in art.values()))

if __name__ == "__main__":
    main()
