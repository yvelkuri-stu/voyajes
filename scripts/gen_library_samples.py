#!/usr/bin/env python3
"""
Generate the Voyajes *template sample* library: original procedural images
(PIL/numpy) + synthetic music loops & stingers (numpy → ffmpeg mp3), plus
library/samples.json describing a complete, playable sample project per template.

All output is original work (no stock, no samples). Deterministic (seeded).
Run:  python3 scripts/gen_library_samples.py
Writes into catalog/library and mirrors to apps/web/public/library.
"""
import json, math, os, random, shutil, subprocess, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, "catalog", "library")
PUB = os.path.join(ROOT, "apps", "web", "public", "library")
S = 960  # square master; cover-cropped to every aspect

def hexrgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def grad(c1, c2, c3=None, kind="radial", cx=0.5, cy=0.4):
    y, x = np.mgrid[0:S, 0:S] / S
    if kind == "radial":
        t = np.clip(np.sqrt((x-cx)**2 + (y-cy)**2) / 0.85, 0, 1)
    else:
        t = np.clip(y*0.8 + x*0.2, 0, 1)
    a, b = np.array(hexrgb(c1), float), np.array(hexrgb(c2), float)
    if c3:
        c = np.array(hexrgb(c3), float)
        t2 = t[..., None]
        img = np.where(t2 < 0.5, a + (b-a)*(t2*2), b + (c-b)*((t2-0.5)*2))
    else:
        img = a + (b-a)*t[..., None]
    noise = np.random.default_rng(1).normal(0, 2.2, (S, S, 1))
    return Image.fromarray(np.clip(img + noise, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

def layer(): return Image.new("RGBA", (S, S), (0, 0, 0, 0))
def comp(base, lay, blur=0):
    if blur: lay = lay.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(base, lay)

def bokeh(img, rnd, colors, n=40, rmin=8, rmax=60, alpha=90, blur=6):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        r = rnd.uniform(rmin, rmax); x, y = rnd.uniform(0, S), rnd.uniform(0, S)
        c = hexrgb(rnd.choice(colors))
        d.ellipse([x-r, y-r, x+r, y+r], fill=c + (int(alpha*rnd.uniform(0.4, 1)),))
    return comp(img, l, blur)

def confetti(img, rnd, colors, n=160):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y = rnd.uniform(0, S), rnd.uniform(0, S); w, h = rnd.uniform(6, 16), rnd.uniform(14, 30)
        ang = rnd.uniform(0, math.pi)
        pts = [(x + math.cos(ang)*dx - math.sin(ang)*dy, y + math.sin(ang)*dx + math.cos(ang)*dy) for dx, dy in [(-w,-h),(w,-h),(w,h),(-w,h)]]
        d.polygon([(px/2+x/2, py/2+y/2) for px, py in pts], fill=hexrgb(rnd.choice(colors)) + (230,))
    return comp(img, l)

def balloons(img, rnd, colors, n=7):
    l = layer(); d = ImageDraw.Draw(l)
    for i in range(n):
        x = S*(0.12 + 0.76*i/(n-1)) + rnd.uniform(-30, 30); y = rnd.uniform(S*0.15, S*0.55); r = rnd.uniform(60, 95)
        c = hexrgb(colors[i % len(colors)])
        d.line([(x, y+r*1.15), (x + rnd.uniform(-40, 40), S)], fill=(255, 255, 255, 140), width=3)
        d.ellipse([x-r*0.85, y-r, x+r*0.85, y+r*1.1], fill=c + (245,))
        d.ellipse([x-r*0.45, y-r*0.7, x-r*0.15, y-r*0.25], fill=(255, 255, 255, 110))
        d.polygon([(x-10, y+r*1.12), (x+10, y+r*1.12), (x, y+r*1.0)], fill=c + (255,))
    return comp(img, l)

def candles(img, rnd, n=5, base_y=0.78):
    l = layer(); d = ImageDraw.Draw(l)
    d.rounded_rectangle([S*0.18, S*base_y, S*0.82, S*0.98], 40, fill=(255, 236, 214, 255))
    d.rounded_rectangle([S*0.18, S*base_y, S*0.82, S*(base_y+0.06)], 30, fill=(255, 120, 170, 255))
    glow = layer(); g = ImageDraw.Draw(glow)
    for i in range(n):
        x = S*(0.28 + 0.44*i/(n-1)); top = S*(base_y-0.16)
        d.rectangle([x-9, top, x+9, S*base_y], fill=hexrgb(["#7fd3ff", "#ffd36b", "#ff8fc7", "#9dff9a", "#c59bff"][i % 5]) + (255,))
        g.ellipse([x-50, top-110, x+50, top-10], fill=(255, 190, 80, 150))
        d.ellipse([x-11, top-46, x+11, top-4], fill=(255, 214, 120, 255))
        d.ellipse([x-5, top-30, x+5, top-8], fill=(255, 255, 230, 255))
    return comp(comp(img, glow, 26), l)

def rings(img):
    l = layer(); d = ImageDraw.Draw(l)
    for cx, col in [(0.42, (240, 205, 120)), (0.58, (230, 230, 240))]:
        d.ellipse([S*cx-150, S*0.5-150, S*cx+150, S*0.5+150], outline=col + (255,), width=26)
    d.polygon([(S*0.42-30, S*0.5-175), (S*0.42+30, S*0.5-175), (S*0.42, S*0.5-130)], fill=(220, 245, 255, 255))
    return comp(img, l)

def heart(d, x, y, r, fill):
    d.ellipse([x-r, y-r, x, y], fill=fill); d.ellipse([x, y-r, x+r, y], fill=fill)
    d.polygon([(x-r*0.98, y-r*0.35), (x+r*0.98, y-r*0.35), (x, y+r*0.95)], fill=fill)

def hearts(img, rnd, colors, n=26):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        heart(d, rnd.uniform(0, S), rnd.uniform(0, S), rnd.uniform(14, 50), hexrgb(rnd.choice(colors)) + (int(rnd.uniform(120, 230)),))
    return comp(img, l)

def petals(img, rnd, colors, n=60):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y, r = rnd.uniform(0, S), rnd.uniform(0, S), rnd.uniform(10, 26)
        d.ellipse([x-r, y-r*0.55, x+r, y+r*0.55], fill=hexrgb(rnd.choice(colors)) + (200,))
    return comp(img, l, 1)

def arch(img):
    l = layer(); d = ImageDraw.Draw(l)
    d.arc([S*0.2, S*0.12, S*0.8, S*0.9], 180, 360, fill=(255, 255, 255, 200), width=18)
    d.line([(S*0.2, S*0.51), (S*0.2, S)], fill=(255, 255, 255, 200), width=18)
    d.line([(S*0.8, S*0.51), (S*0.8, S)], fill=(255, 255, 255, 200), width=18)
    return comp(img, l, 1)

def stars(img, rnd, n=120, col=(255, 255, 255)):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y, r = rnd.uniform(0, S), rnd.uniform(0, S), rnd.uniform(1, 3.5)
        d.ellipse([x-r, y-r, x+r, y+r], fill=col + (int(rnd.uniform(120, 255)),))
    return comp(img, l)

def star5(d, x, y, r, fill):
    pts = []
    for i in range(10):
        a = -math.pi/2 + i*math.pi/5; rr = r if i % 2 == 0 else r*0.45
        pts.append((x + math.cos(a)*rr, y + math.sin(a)*rr))
    d.polygon(pts, fill=fill)

def big_stars(img, rnd, colors, n=9):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        star5(d, rnd.uniform(60, S-60), rnd.uniform(60, S-60), rnd.uniform(24, 70), hexrgb(rnd.choice(colors)) + (220,))
    return comp(img, l)

def moon_clouds(img):
    l = layer(); d = ImageDraw.Draw(l)
    d.ellipse([S*0.55, S*0.12, S*0.85, S*0.42], fill=(255, 246, 210, 255))
    d.ellipse([S*0.62, S*0.08, S*0.92, S*0.38], fill=(0, 0, 0, 0))
    l2 = layer(); d2 = ImageDraw.Draw(l2)
    for cx, cy, w in [(0.3, 0.72, 0.5), (0.7, 0.8, 0.6), (0.5, 0.9, 0.8)]:
        for k in range(5):
            r = S*w*0.18
            d2.ellipse([S*cx - S*w/2 + k*S*w/5 - r*0.2, S*cy - r, S*cx - S*w/2 + k*S*w/5 + r*1.4, S*cy + r*0.7], fill=(255, 255, 255, 235))
    return comp(comp(img, l), l2, 2)

def caps(img, rnd, n=6):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y, r = rnd.uniform(120, S-120), rnd.uniform(100, S*0.7), rnd.uniform(55, 85)
        a = rnd.uniform(-0.5, 0.5)
        pts = [(x + math.cos(a+k*math.pi/2)*r, y + math.sin(a+k*math.pi/2)*r*0.45) for k in range(4)]
        d.polygon(pts, fill=(25, 25, 40, 255))
        d.rectangle([x-r*0.45, y, x+r*0.45, y+r*0.5], fill=(35, 35, 55, 255))
        d.line([(x, y), (x+r*0.7, y+r*0.65)], fill=(255, 205, 60, 255), width=5)
    return comp(img, l)

def diyas(img, rnd, n=5):
    glow = layer(); g = ImageDraw.Draw(glow); l = layer(); d = ImageDraw.Draw(l)
    for i in range(n):
        x = S*(0.14 + 0.72*i/(n-1)); y = S*0.78 + rnd.uniform(-20, 20)
        g.ellipse([x-90, y-180, x+90, y], fill=(255, 170, 40, 160))
        d.pieslice([x-70, y-40, x+70, y+60], 0, 180, fill=(196, 92, 40, 255))
        d.ellipse([x-12, y-70, x+12, y-10], fill=(255, 200, 70, 255))
        d.ellipse([x-5, y-55, x+5, y-22], fill=(255, 255, 220, 255))
    return comp(comp(img, glow, 30), l)

def rangoli(img, colors):
    l = layer(); d = ImageDraw.Draw(l); cx = cy = S/2
    for ring in range(6, 0, -1):
        r = ring*62; c = hexrgb(colors[ring % len(colors)])
        for k in range(12):
            a = k*math.pi/6
            x, y = cx + math.cos(a)*r*0.6, cy + math.sin(a)*r*0.6
            d.ellipse([x-r*0.28, y-r*0.28, x+r*0.28, y+r*0.28], fill=c + (210,))
    d.ellipse([cx-40, cy-40, cx+40, cy+40], fill=(255, 240, 200, 255))
    return comp(img, l)

def fireworks(img, rnd, colors, n=5):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        cx, cy, r = rnd.uniform(150, S-150), rnd.uniform(120, S*0.6), rnd.uniform(90, 180)
        c = hexrgb(rnd.choice(colors))
        for k in range(28):
            a = k*2*math.pi/28
            for t in np.linspace(0.3, 1, 6):
                x, y = cx + math.cos(a)*r*t, cy + math.sin(a)*r*t + 20*t*t
                rr = 4*(1.2-t)+1.5
                d.ellipse([x-rr, y-rr, x+rr, y+rr], fill=c + (int(255*t),))
    return comp(img, l, 1)

def snow(img, rnd, n=180):
    l = layer(); d = ImageDraw.Draw(l)
    for _ in range(n):
        x, y, r = rnd.uniform(0, S), rnd.uniform(0, S), rnd.uniform(2, 7)
        d.ellipse([x-r, y-r, x+r, y+r], fill=(255, 255, 255, 220))
    return comp(img, l, 1)

def ornaments(img, rnd, colors, n=5):
    l = layer(); d = ImageDraw.Draw(l)
    for i in range(n):
        x = S*(0.15 + 0.7*i/(n-1)); top = rnd.uniform(0, S*0.2); y = top + rnd.uniform(S*0.25, S*0.55); r = rnd.uniform(55, 85)
        d.line([(x, 0), (x, y-r)], fill=(230, 210, 150, 255), width=3)
        c = hexrgb(colors[i % len(colors)])
        d.ellipse([x-r, y-r, x+r, y+r], fill=c + (255,))
        d.ellipse([x-r*0.55, y-r*0.6, x-r*0.15, y-r*0.2], fill=(255, 255, 255, 120))
        d.rectangle([x-14, y-r-18, x+14, y-r+4], fill=(230, 200, 120, 255))
    return comp(img, l)

def pines(img):
    l = layer(); d = ImageDraw.Draw(l)
    for cx, h in [(0.2, 0.5), (0.5, 0.65), (0.8, 0.45)]:
        for k in range(4):
            w = S*(0.12 + 0.05*k); top = S*(1 - h) + k*S*h*0.18
            d.polygon([(S*cx, top), (S*cx - w, top + S*h*0.32), (S*cx + w, top + S*h*0.32)], fill=(20, 90, 60, 255))
    return comp(img, l)

def mountains(img, cols, sun=True):
    l = layer(); d = ImageDraw.Draw(l)
    if sun: d.ellipse([S*0.55, S*0.25, S*0.85, S*0.55], fill=(255, 220, 140, 230))
    rnd = random.Random(3)
    for k, c in enumerate(cols):
        base = S*(0.55 + 0.13*k); pts = [(0, S)]
        for i in range(9):
            pts.append((S*i/8, base - rnd.uniform(40, 180)*(1 - 0.2*k)))
        pts.append((S, S)); d.polygon(pts, fill=hexrgb(c) + (255,))
    return comp(img, l)

def waves(img, cols):
    l = layer(); d = ImageDraw.Draw(l)
    for k, c in enumerate(cols):
        y0 = S*(0.55 + 0.1*k); pts = [(0, S)]
        for i in range(0, S+1, 16): pts.append((i, y0 + 22*math.sin(i/70 + k)))
        pts.append((S, S)); d.polygon(pts, fill=hexrgb(c) + (235,))
    return comp(img, l)

def road(img):
    l = layer(); d = ImageDraw.Draw(l)
    d.polygon([(S*0.42, S*0.5), (S*0.58, S*0.5), (S*0.95, S), (S*0.05, S)], fill=(40, 40, 52, 255))
    for k in range(6):
        t0, t1 = 0.52 + k*0.08, 0.56 + k*0.08
        w0, w1 = 0.004 + k*0.004, 0.006 + k*0.005
        d.polygon([(S*(0.5-w0), S*t0), (S*(0.5+w0), S*t0), (S*(0.5+w1), S*t1), (S*(0.5-w1), S*t1)], fill=(255, 220, 90, 255))
    return comp(img, l)

def disco(img, rnd):
    l = layer(); d = ImageDraw.Draw(l)
    for k in range(14):
        a = k*math.pi/7 + 0.2
        d.polygon([(S/2, S*0.3), (S/2 + math.cos(a)*S, S*0.3 + math.sin(a)*S), (S/2 + math.cos(a+0.08)*S, S*0.3 + math.sin(a+0.08)*S)], fill=hexrgb(rnd.choice(["#ff4fd8", "#4fd8ff", "#c6ff4f", "#ffd84f"])) + (70,))
    img = comp(img, l, 3)
    l2 = layer(); d2 = ImageDraw.Draw(l2)
    r = 110; cx, cy = S/2, S*0.3
    d2.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(200, 200, 215, 255))
    for i in range(-r, r, 22):
        d2.line([(cx+i, cy-r), (cx+i, cy+r)], fill=(120, 120, 140, 255), width=2)
        d2.line([(cx-r, cy+i), (cx+r, cy+i)], fill=(120, 120, 140, 255), width=2)
    mask = Image.new("L", (S, S), 0); ImageDraw.Draw(mask).ellipse([cx-r, cy-r, cx+r, cy+r], fill=255)
    l2.putalpha(Image.fromarray(np.minimum(np.array(l2.split()[3]), np.array(mask))))
    return comp(img, l2)

def lasers(img, cols):
    l = layer(); d = ImageDraw.Draw(l)
    for k in range(10):
        c = hexrgb(cols[k % len(cols)])
        d.line([(S*(k/9), S), (S*(0.5 + 0.4*math.sin(k)), 0)], fill=c + (200,), width=6)
    return comp(img, l, 2)

def grid_sun(img):
    l = layer(); d = ImageDraw.Draw(l)
    for i in range(8):
        y0 = S*0.3 + i*22
        d.rectangle([S*0.25, y0, S*0.75, y0+14], fill=(255, 120 + i*15, 80, 255))
    for i in range(12):
        y = S*0.62 + (i**1.6)*4; d.line([(0, y), (S, y)], fill=(255, 60, 200, 200), width=2)
    for i in range(-10, 11):
        d.line([(S/2 + i*20, S*0.62), (S/2 + i*120, S)], fill=(255, 60, 200, 200), width=2)
    return comp(img, l)

def checker(img, c1, c2):
    l = layer(); d = ImageDraw.Draw(l); n = 12
    for i in range(n):
        for j in range(n):
            if (i+j) % 2: d.rectangle([i*S/n, S*0.6 + j*S/(n*2.5), (i+1)*S/n, S*0.6 + (j+1)*S/(n*2.5)], fill=hexrgb(c1) + (255,))
    return comp(img, l)

def window_light(img):
    l = layer(); d = ImageDraw.Draw(l)
    for i in range(2):
        for j in range(2):
            x0, y0 = S*(0.25 + i*0.26), S*(0.12 + j*0.3)
            d.rectangle([x0, y0, x0 + S*0.24, y0 + S*0.28], fill=(255, 240, 200, 200))
    d.rectangle([0, S*0.78, S, S], fill=(120, 80, 60, 255))
    return comp(img, l, 2)

def house(img):
    l = layer(); d = ImageDraw.Draw(l)
    d.rectangle([S*0.28, S*0.48, S*0.72, S*0.85], fill=(250, 240, 225, 255))
    d.polygon([(S*0.22, S*0.5), (S*0.5, S*0.25), (S*0.78, S*0.5)], fill=(200, 80, 70, 255))
    d.rectangle([S*0.46, S*0.66, S*0.54, S*0.85], fill=(120, 70, 50, 255))
    for x in (0.34, 0.6):
        d.rectangle([S*x, S*0.55, S*(x+0.07), S*0.62], fill=(255, 210, 100, 255))
    d.rectangle([0, S*0.85, S, S], fill=(90, 160, 90, 255))
    return comp(img, l)

def table(img, rnd):
    l = layer(); d = ImageDraw.Draw(l)
    d.ellipse([S*0.05, S*0.55, S*0.95, S*1.15], fill=(245, 238, 228, 255))
    for cx in (0.3, 0.7):
        d.ellipse([S*cx-90, S*0.7-40, S*cx+90, S*0.7+40], fill=(255, 255, 255, 255), outline=(200, 190, 180, 255), width=4)
    return candles(comp(img, l), rnd, 3, 0.6)

def sun_rays(img, col):
    l = layer(); d = ImageDraw.Draw(l)
    for k in range(18):
        a = k*math.pi/9
        d.polygon([(S/2, S/2), (S/2 + math.cos(a)*S, S/2 + math.sin(a)*S), (S/2 + math.cos(a+0.12)*S, S/2 + math.sin(a+0.12)*S)], fill=hexrgb(col) + (60,))
    d.ellipse([S*0.38, S*0.38, S*0.62, S*0.62], fill=hexrgb(col) + (255,))
    return comp(img, l, 2)

def frame_gallery(img):
    l = layer(); d = ImageDraw.Draw(l)
    d.rectangle([S*0.22, S*0.18, S*0.78, S*0.74], fill=(255, 255, 255, 255))
    d.rectangle([S*0.27, S*0.23, S*0.73, S*0.69], fill=(230, 120, 90, 255))
    d.ellipse([S*0.4, S*0.32, S*0.6, S*0.52], fill=(250, 210, 90, 255))
    return comp(img, l)

R = lambda s: random.Random(s)
# mood → three scenes (id, title, tags, painter)
SCENES = {
 "birthday": [
  ("bday-balloons", "Balloon Bash", ["birthday", "party", "balloons"], lambda: balloons(grad("#ff7ad9", "#7a3cff", "#2a0d5c"), R(1), ["#ff4f8b", "#ffd84f", "#4fd8ff", "#9dff6b", "#ff9f40"])),
  ("bday-confetti", "Confetti Storm", ["birthday", "party", "confetti"], lambda: confetti(grad("#ffe36b", "#ff7a59", "#c2185b"), R(2), ["#ffffff", "#4fd8ff", "#7a3cff", "#00e0a0", "#ff4f8b"])),
  ("bday-cake", "Candle Cake", ["birthday", "cake", "candles"], lambda: candles(bokeh(grad("#40206b", "#160a2e"), R(3), ["#ffb36b", "#ff7ad9"], 30), R(3))),
 ],
 "wedding": [
  ("wed-rings", "Golden Rings", ["wedding", "rings", "romantic"], lambda: rings(bokeh(grad("#fbe4ee", "#e8b4c8", "#9b6b8a"), R(4), ["#ffffff", "#ffe0b0"], 40))),
  ("wed-petals", "Petal Rain", ["wedding", "petals", "garden"], lambda: petals(grad("#fff3f6", "#ffd1dc", "#e89ab0"), R(5), ["#ff8fb0", "#ffffff", "#ffc2d4", "#f7a1c4"])),
  ("wed-arch", "Garden Arch", ["wedding", "arch", "ceremony"], lambda: petals(arch(grad("#c9e8d1", "#88b79a", "#355e48")), R(6), ["#ffffff", "#ffd1dc"], 40)),
 ],
 "anniversary": [
  ("anni-hearts", "Floating Hearts", ["anniversary", "love", "hearts"], lambda: hearts(grad("#ff9bb3", "#c2185b", "#4a0a2a"), R(7), ["#ffffff", "#ffc2d4", "#ff4f8b"])),
  ("anni-glow", "Candle Glow", ["anniversary", "candles", "warm"], lambda: candles(bokeh(grad("#5a1a2e", "#1e0810"), R(8), ["#ffb36b", "#ff4f8b"], 40), R(8), 3)),
  ("anni-rings", "Twin Rings", ["anniversary", "rings"], lambda: rings(hearts(grad("#3b1d4a", "#140a1e"), R(9), ["#ff4f8b", "#ffb3c7"], 14))),
 ],
 "baby": [
  ("baby-clouds", "Moon & Clouds", ["baby-shower", "pastel", "moon"], lambda: moon_clouds(stars(grad("#bfe3ff", "#9fb8ff", "#7d7fd6"), R(10), 60))),
  ("baby-stars", "Pastel Stars", ["baby-shower", "stars", "pastel"], lambda: big_stars(grad("#fff4d6", "#ffd6e8", "#d6e4ff"), R(11), ["#ffffff", "#ffd36b", "#9fd8ff", "#ffb3d1"])),
  ("baby-bubbles", "Soft Bubbles", ["baby-shower", "bubbles", "soft"], lambda: bokeh(grad("#e0fff4", "#c8e9ff", "#e8d6ff"), R(12), ["#ffffff", "#ffd6e8", "#c8f4ff"], 50, 20, 90, 120, 3)),
 ],
 "party": [
  ("party-disco", "Disco Ball", ["party", "night", "disco"], lambda: disco(grad("#2a0d5c", "#0a0418"), R(13))),
  ("party-lasers", "Laser Floor", ["party", "neon", "lasers"], lambda: lasers(bokeh(grad("#1a0533", "#05010d"), R(14), ["#ff4fd8", "#4fd8ff"], 30), ["#ff4fd8", "#4fd8ff", "#c6ff4f"])),
  ("party-neon-confetti", "Neon Confetti", ["party", "confetti", "neon"], lambda: confetti(grad("#12002b", "#000000"), R(15), ["#ff4fd8", "#4fd8ff", "#c6ff4f", "#ffd84f"])),
 ],
 "graduation": [
  ("grad-caps-toss", "Caps Toss", ["graduation", "caps", "celebrate"], lambda: confetti(caps(grad("#5fb4ff", "#1f5fbf", "#0b2a66"), R(16)), R(16), ["#ffd84f", "#ffffff"], 70)),
  ("grad-stars", "Gold Stars", ["graduation", "stars", "gold"], lambda: big_stars(grad("#0b2a66", "#06142e"), R(17), ["#ffd84f", "#ffe9a3", "#ffffff"])),
  ("grad-sunrise", "Bright Future", ["graduation", "sunrise", "future"], lambda: mountains(grad("#ffd27a", "#ff8a5c", "#6b3fa0", kind="linear"), ["#4a2c7a", "#2e1a52", "#1a0e33"])),
 ],
 "festival": [
  ("fest-diyas", "Diya Row", ["festival", "diwali", "lights"], lambda: diyas(bokeh(grad("#3a0f4f", "#12051c"), R(18), ["#ffb347", "#ff6f91"], 50), R(18))),
  ("fest-rangoli", "Rangoli Bloom", ["festival", "diwali", "rangoli"], lambda: rangoli(grad("#fff1d6", "#ffcf8a", "#ff8a5c"), ["#e91e63", "#ff9800", "#7b1fa2", "#00acc1", "#ffeb3b", "#43a047"])),
  ("fest-fireworks", "Festival Fireworks", ["festival", "fireworks", "night"], lambda: fireworks(stars(grad("#1b0f3a", "#05020f"), R(19), 80), R(19), ["#ffd84f", "#ff4f8b", "#4fd8ff", "#9dff6b", "#ff9f40"])),
 ],
 "holiday": [
  ("hol-ornaments", "Ornament Swing", ["holiday", "ornaments", "winter"], lambda: ornaments(bokeh(grad("#7a0f1f", "#2a0509"), R(20), ["#ffd27a", "#ffffff"], 40), R(20), ["#e53935", "#ffd54f", "#43a047", "#ffffff", "#1e88e5"])),
  ("hol-snowfall", "Snowy Pines", ["holiday", "snow", "pines"], lambda: snow(pines(grad("#2b4b7a", "#0e1e3a")), R(21))),
  ("hol-lights", "Twinkle Lights", ["holiday", "lights", "bokeh"], lambda: bokeh(grad("#0d2b1d", "#04100a"), R(22), ["#ffd54f", "#e53935", "#43a047", "#ffffff", "#4fc3f7"], 70, 10, 45, 200, 4)),
 ],
 "travel": [
  ("trv-peaks", "Sunset Peaks", ["travel", "mountains", "sunset"], lambda: mountains(grad("#ffb36b", "#ff6f91", "#6a3fa0", kind="linear"), ["#5b3b8c", "#3d2766", "#221640"])),
  ("trv-ocean", "Ocean Lines", ["travel", "ocean", "waves"], lambda: waves(sun_rays(grad("#a8f0ff", "#4fc3f7", "#1565c0", kind="linear"), "#fff3b0"), ["#29b6f6", "#0288d1", "#01579b"])),
  ("trv-road", "Open Road", ["travel", "road", "adventure"], lambda: road(mountains(grad("#ffe0a3", "#ff9e6b", kind="linear"), ["#7a5c99"], sun=True))),
 ],
 "cozy": [
  ("cozy-window", "Morning Window", ["cozy", "home", "brunch"], lambda: window_light(grad("#ffe9c7", "#f3b88a", "#a8684a"))),
  ("cozy-table", "Dinner Table", ["cozy", "dinner", "candles"], lambda: table(bokeh(grad("#5a3a2a", "#1e120c"), R(23), ["#ffcf8a"], 40), R(23))),
  ("cozy-home", "Warm Home", ["cozy", "housewarming", "home"], lambda: house(stars(grad("#ffcf8a", "#ff8a5c", "#5a2e6b", kind="linear"), R(24), 30))),
 ],
 "retro": [
  ("retro-grid", "Retro Grid Sun", ["retro", "vhs", "synthwave"], lambda: grid_sun(grad("#2a0d5c", "#ff4fa3", kind="linear"))),
  ("retro-checker", "Checker Dance", ["retro", "swing", "vintage"], lambda: checker(sun_rays(grad("#ffe0a3", "#ff9e6b"), "#ffd27a"), "#2a1a12", "#ffffff")),
  ("retro-gallery", "Gallery Frame", ["minimal", "gallery", "clean"], lambda: frame_gallery(grad("#f5f2ee", "#ddd6cc"))),
 ],
}

# ───────── audio synthesis ─────────
SR = 32000
NOTE = lambda m: 440.0 * 2 ** ((m - 69) / 12)

def env_adsr(n, a=0.01, r=0.25):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(r, 1e-3))
    return e

def tone(freq, dur, kind="sine", a=0.01, r=0.3, vib=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * freq * t + (vib * np.sin(2 * np.pi * 5 * t))
    if kind == "sine": w = np.sin(ph)
    elif kind == "tri": w = 2 / np.pi * np.arcsin(np.sin(ph))
    elif kind == "saw": w = 2 * ((freq * t) % 1) - 1
    elif kind == "bell": w = np.sin(ph) + 0.4 * np.sin(2.76 * ph) + 0.2 * np.sin(5.4 * ph)
    elif kind == "pluck": w = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)
    else: w = np.sin(ph)
    return w * env_adsr(n, a, r)

def kick(dur=0.3):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 50 + 120 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

def hat(dur=0.06, seed=0):
    n = int(dur * SR); return np.random.default_rng(seed).uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 60) * 0.5

def clap(dur=0.15, seed=1):
    n = int(dur * SR); return np.random.default_rng(seed).uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 25) * 0.6

def place(buf, sig, at):
    i = int(at * SR); j = min(len(buf), i + len(sig))
    if i < len(buf): buf[i:j] += sig[: j - i]

# chord progressions as midi roots + quality
MAJ, MIN = [0, 4, 7], [0, 3, 7]
LOOPS = {
 "birthday-bounce": dict(bpm=124, prog=[(60, MAJ), (65, MAJ), (67, MAJ), (60, MAJ)], lead="pluck", pad="tri", drums="four", arp=True, title="Birthday Bounce", tags=["birthday", "party", "upbeat"]),
 "wedding-strings": dict(bpm=72, prog=[(65, MAJ), (62, MIN), (70, MAJ), (72, MAJ)], lead="sine", pad="saw", drums=None, arp=True, title="Wedding Strings", tags=["wedding", "romantic", "soft"]),
 "lullaby-bells": dict(bpm=84, prog=[(67, MAJ), (64, MIN), (60, MAJ), (62, MAJ)], lead="bell", pad="sine", drums=None, arp=True, title="Lullaby Bells", tags=["baby-shower", "gentle", "bells"]),
 "party-pulse": dict(bpm=126, prog=[(57, MIN), (53, MAJ), (60, MAJ), (55, MAJ)], lead="saw", pad="saw", drums="four", arp=True, title="Party Pulse", tags=["party", "night", "dance"]),
 "grad-anthem": dict(bpm=110, prog=[(62, MAJ), (67, MAJ), (59, MIN), (69, MAJ)], lead="pluck", pad="tri", drums="rock", arp=False, title="Grad Anthem", tags=["graduation", "uplifting"]),
 "festival-lights": dict(bpm=100, prog=[(62, MAJ), (62, MAJ), (60, MAJ), (62, MAJ)], lead="bell", pad="saw", drums="tabla", arp=True, title="Festival Lights", tags=["festival", "diwali", "bells"]),
 "holiday-chimes": dict(bpm=96, prog=[(67, MAJ), (64, MIN), (72, MAJ), (62, MAJ)], lead="bell", pad="tri", drums="sleigh", arp=True, title="Holiday Chimes", tags=["holiday", "winter", "chimes"]),
 "travel-breeze": dict(bpm=98, prog=[(64, MIN), (60, MAJ), (67, MAJ), (62, MAJ)], lead="pluck", pad="tri", drums="light", arp=True, title="Travel Breeze", tags=["travel", "breezy", "acoustic"]),
 "cozy-keys": dict(bpm=80, prog=[(65, MAJ), (69, MIN), (70, MAJ), (72, MAJ)], lead="tri", pad="sine", drums="light", arp=False, title="Cozy Keys", tags=["cozy", "dinner", "brunch"]),
 "love-waltz": dict(bpm=90, prog=[(60, MAJ), (57, MIN), (65, MAJ), (67, MAJ)], lead="sine", pad="tri", drums=None, arp=True, title="Love Waltz", tags=["anniversary", "romantic"]),
 "retro-groove": dict(bpm=108, prog=[(57, MIN), (62, MIN), (64, MAJ), (57, MIN)], lead="saw", pad="tri", drums="rock", arp=True, title="Retro Groove", tags=["retro", "vhs", "funk"]),
}

def make_loop(cfg, bars=4):
    beat = 60 / cfg["bpm"]; bar = beat * 4; total = bar * bars * 1  # 4 bars
    reps = 1
    buf = np.zeros(int(total * reps * SR) + SR)
    for rep in range(reps):
        for bi, (root, q) in enumerate(cfg["prog"]):
            t0 = rep * total + bi * bar
            for iv in q:  # pad
                place(buf, 0.10 * tone(NOTE(root - 12 + iv), bar * 1.05, cfg["pad"], a=0.25, r=bar), t0)
            place(buf, 0.22 * tone(NOTE(root - 24), bar * 0.95, "sine", a=0.01, r=bar * 0.6), t0)  # bass
            if cfg["arp"]:
                seq = [q[0], q[1], q[2], 12, q[2], q[1], q[0] + 12, q[1]]
                for k, iv in enumerate(seq):
                    place(buf, 0.12 * tone(NOTE(root + iv), beat * 0.6, cfg["lead"], r=0.18), t0 + k * beat / 2)
            else:
                for k in range(4):
                    place(buf, 0.13 * tone(NOTE(root + q[k % 3] + 12), beat * 0.9, cfg["lead"], r=0.35), t0 + k * beat)
            d = cfg["drums"]
            for k in range(4):
                tb = t0 + k * beat
                if d in ("four", "rock"): place(buf, 0.5 * kick(), tb if d == "four" or k % 2 == 0 else -9)
                if d == "four" or d == "rock" or d == "light": place(buf, 0.18 * hat(seed=k), tb + beat / 2)
                if d in ("four", "rock") and k % 2 == 1: place(buf, 0.3 * clap(seed=k), tb)
                if d == "tabla":
                    place(buf, 0.35 * tone(90, 0.2, "sine", r=0.12), tb)
                    place(buf, 0.18 * tone(300, 0.12, "sine", r=0.05), tb + beat * 0.5)
                    place(buf, 0.15 * tone(330, 0.1, "sine", r=0.04), tb + beat * 0.75)
                if d == "sleigh":
                    for s in range(2): place(buf, 0.12 * hat(0.05, seed=k + s), tb + s * beat / 2)
    buf = buf[: int(total * reps * SR)]
    return buf

STINGERS = {
 "stinger-sparkle": ("Sparkle Stinger", ["stinger", "sparkle", "magic"]),
 "stinger-whoosh": ("Whoosh Stinger", ["stinger", "whoosh", "transition"]),
 "stinger-chime": ("Chime Stinger", ["stinger", "chime", "reveal"]),
}

def make_stinger(kind):
    dur = 1.6; buf = np.zeros(int(dur * SR))
    if kind == "stinger-sparkle":
        for k, m in enumerate([84, 88, 91, 96, 100]): place(buf, 0.18 * tone(NOTE(m), 1.0, "bell", r=0.4), k * 0.07)
    elif kind == "stinger-whoosh":
        n = len(buf); t = np.arange(n) / SR
        noise = np.random.default_rng(5).uniform(-1, 1, n)
        k = 40; sm = np.convolve(noise, np.ones(k) / k, mode="same")
        buf += 0.9 * sm * np.sin(np.pi * np.clip(t / 1.2, 0, 1)) ** 2
    else:
        for m in (72, 79, 84): place(buf, 0.2 * tone(NOTE(m), 1.5, "bell", r=0.7), 0)
    return buf

def write_mp3(sig, path, kbps=48):
    sig = sig / max(1e-6, np.max(np.abs(sig))) * 0.85
    pcm = (sig * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f: tmp = f.name
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-ac", "1", "-b:a", f"{kbps}k", path], check=True)
    os.unlink(tmp)
    return len(sig) / SR

# ───────── template → sample recipe ─────────
MOOD_OF = {
 "template.birthday-blast": "birthday", "template.candle-wish": "birthday", "template.kids-party-pop": "birthday",
 "template.garden-soiree": "wedding", "template.wedding-vows": "wedding", "template.anniversary-glow": "anniversary",
 "template.baby-shower-bloom": "baby", "template.housewarming-glow": "cozy", "template.dinner-table": "cozy",
 "template.brunch-breeze": "cozy", "template.grad-caps": "graduation", "template.holiday-sparkle": "holiday",
 "template.diwali-lights": "festival", "template.travel-postcard": "travel",
 "template.midnight-metro": "party", "template.strobe-night": "party", "template.acid-drop": "party", "template.pulse-reels": "party",
 "template.sunlit-drift": "travel", "template.coastal-bounce": "travel", "template.mint-travel": "travel", "template.field-notes": "travel",
 "template.golden-recap": "cozy", "template.blush-story": "anniversary", "template.lounge-edit": "cozy",
 "template.gallery-quiet": "retro", "template.vhs-party": "retro", "template.swing-retro": "retro",
}
LOOP_OF = {"birthday": "birthday-bounce", "wedding": "wedding-strings", "anniversary": "love-waltz", "baby": "lullaby-bells",
           "party": "party-pulse", "graduation": "grad-anthem", "festival": "festival-lights", "holiday": "holiday-chimes",
           "travel": "travel-breeze", "cozy": "cozy-keys", "retro": "retro-groove"}
STING_OF = {"birthday": "stinger-sparkle", "wedding": "stinger-chime", "anniversary": "stinger-chime", "baby": "stinger-sparkle",
            "party": "stinger-whoosh", "graduation": "stinger-sparkle", "festival": "stinger-sparkle", "holiday": "stinger-chime",
            "travel": "stinger-whoosh", "cozy": "stinger-chime", "retro": "stinger-whoosh"}
GRADE_OF = {"birthday": "vivid", "wedding": "dreamy", "anniversary": "warm", "baby": "dreamy", "party": "neon",
            "graduation": "vivid", "festival": "warm", "holiday": "vivid", "travel": "teal-orange", "cozy": "warm", "retro": "film"}
INVITE = {
 "birthday": dict(hostName="Your name", eventName="Maya's 30th Birthday", eventWhen="Sat, Nov 14 · 7 PM", eventWhere="Rooftop · 12 Elm St"),
 "wedding": dict(hostName="Ana & Sam", eventName="Ana & Sam are getting married", eventWhen="Sun, May 9 · 4 PM", eventWhere="Rose Garden Pavilion"),
 "anniversary": dict(hostName="The Patels", eventName="25 Years Together", eventWhen="Fri, Jun 12 · 7:30 PM", eventWhere="The Lantern Room"),
 "baby": dict(hostName="Priya & friends", eventName="Baby Shower for Lina", eventWhen="Sun, Mar 3 · 1 PM", eventWhere="Lina's place · 4 Park Ave"),
 "graduation": dict(hostName="The Chen family", eventName="Alex's Graduation Party", eventWhen="Sat, Jun 20 · 3 PM", eventWhere="Backyard · 88 Oak Rd"),
 "festival": dict(hostName="The Sharmas", eventName="Diwali Night of Lights", eventWhen="Sat, Nov 7 · 6 PM", eventWhere="Our home · 21 Lotus Ln"),
 "holiday": dict(hostName="Jo & Kai", eventName="Holiday Sparkle Party", eventWhen="Sat, Dec 19 · 8 PM", eventWhere="Studio 5 · Market St"),
 "cozy": dict(hostName="Your name", eventName="Come over for dinner", eventWhen="Fri · 7 PM", eventWhere="Our new place"),
 "party": dict(hostName="Your name", eventName="Night Out", eventWhen="Sat · 10 PM", eventWhere="Downtown"),
 "travel": dict(hostName="Your name", eventName="Trip Reunion", eventWhen="Sun · 2 PM", eventWhere="Harbor Café"),
 "retro": dict(hostName="Your name", eventName="Retro Night", eventWhen="Sat · 9 PM", eventWhere="The Old Hall"),
}
VOYAGE_TEXT = {"party": ("NIGHT MODE", "Turn it up"), "travel": ("Postcards from away", "Swap in your trip"),
               "cozy": ("Little moments", "Golden hours"), "retro": ("Rewind", "Press play"), "anniversary": ("Us, lately", "Soft days")}

def anims(mood, i):
    bold = mood in ("birthday", "party", "graduation", "retro")
    ins = ["pop", "zoom-in", "slide-up"] if bold else ["fade", "zoom-in", "fade"]
    emph = ["ken-burns", "ken-burns-out", "pulse" if bold else "float"]
    return {"in": ins[i % 3], "emphasis": emph[i % 3], "inSec": 0.5}

def build_sample(tpl, mood, loop_dur):
    invite = tpl.get("mode") == "invitation"
    scenes = SCENES[mood]
    hold = 3.2 if invite else 2.8
    tx = max(0.3, min(0.9, (tpl.get("transitionDurationMs") or 500) / 1000 + 0.15))
    clips = []
    for i, (sid, *_r) in enumerate(scenes):
        clips.append({"media": f"lib.photo.{sid}", "durationSec": hold, "animation": anims(mood, i),
                      "transitionOut": tpl.get("transition") if i < len(scenes) - 1 else None,
                      "transitionSpec": {"durationSec": round(tx, 2), "easing": "ease-in-out"}})
    total = hold * len(scenes) - tx * (len(scenes) - 1)
    loop = LOOP_OF[mood]
    audio = [
        {"ref": f"lib:lib.audio.{loop}", "at": 0, "durationSec": round(total, 2), "volume": 0.8, "fadeInSec": 0.4, "fadeOutSec": 1.2, "loop": True, "label": None},
        {"ref": f"lib:lib.audio.{STING_OF[mood]}", "at": 0.15, "durationSec": 1.5, "volume": 0.55, "loop": False, "label": None},
    ]
    text = []
    if invite:
        inv = INVITE.get(mood, INVITE["cozy"]).copy()
        text = [
            {"role": "title", "value": "{eventName}", "at": 0.2, "end": round(hold + 0.4, 2), "position": "center", "animation": {"in": "pop" if mood in ("birthday", "party", "graduation") else "fade", "emphasis": "pulse"}},
            {"role": "subtitle", "value": "{eventWhen}", "at": round(hold - tx + 0.2, 2), "end": round(2 * hold - tx, 2), "position": "lower-third", "animation": {"in": "slide-up"}},
            {"role": "caption", "value": "{eventWhere} · hosted by {hostName}", "at": round(2 * (hold - tx) + 0.2, 2), "end": round(total, 2), "position": "lower-third", "animation": {"in": "fade"}},
        ]
    else:
        t1, t2 = VOYAGE_TEXT.get(mood, ("Your story", "Swap in your clips"))
        text = [
            {"role": "title", "value": t1, "at": 0.2, "end": round(hold, 2), "position": "center", "animation": {"in": "pop", "emphasis": "float"}},
            {"role": "caption", "value": t2, "at": round(total - hold + 0.4, 2), "end": round(total, 2), "position": "lower-third", "animation": {"in": "slide-up"}},
        ]
        inv = None
    return {"mood": mood, "grade": GRADE_OF[mood], "clips": clips, "audio": audio, "text": text,
            **({"invitation": inv} if inv else {}), "durationSec": round(total, 2),
            "preview": [f"library/photos/{sid}-thumb.webp" for sid, *_ in scenes]}

NEW_TEMPLATES = [
 {"id": "template.diwali-lights", "kind": "template", "version": "1.0.0", "name": "Diwali Lights",
  "description": "Festival invitation: glowing diyas, rangoli bloom, fireworks and bell-drone music.",
  "tier": "free", "tags": ["invitation", "festival", "diwali", "9:16"], "mode": "invitation",
  "themeId": "theme.golden-hour", "motion": "float", "transition": "light-leak", "transitionDurationMs": 600,
  "photoMotion": "gentle", "beatId": "audio.warm-acoustic-092", "beatSync": "soft", "textStyle": "soft-serif",
  "textTransition": "fade", "aspect": "9:16", "durationTargetSec": 9, "sizeBytes": 48000, "hash": "sha256:tpl-diwali-lights-v1",
  "eventType": "Festival", "defaultTitle": "Diwali Night ✨", "defaultOverlays": [{"value": "Join us for Diwali", "role": "title"}],
  "vibe": "Warm diyas · rangoli · fireworks", "eventEmoji": "🪔", "defaultEmojis": ["🪔", "✨", "🎆"], "hostPlaceholder": "Host name"},
 {"id": "template.travel-postcard", "kind": "template", "version": "1.0.0", "name": "Travel Postcard",
  "description": "Trip recap: sunset peaks, ocean lines, open road — breezy acoustic loop.",
  "tier": "free", "tags": ["travel", "postcard", "vlog", "9:16"], "themeId": "theme.ocean-pop", "motion": "soft",
  "transition": "push", "transitionDurationMs": 500, "photoMotion": "gentle", "beatId": "audio.ocean-drift-084",
  "beatSync": "soft", "textStyle": "clean-sans", "textTransition": "slide-up", "aspect": "9:16", "durationTargetSec": 8,
  "sizeBytes": 48000, "hash": "sha256:tpl-travel-postcard-v1"},
]

def main():
    random.seed(7); np.random.seed(7)
    for base in (LIB,):
        os.makedirs(os.path.join(base, "photos"), exist_ok=True); os.makedirs(os.path.join(base, "audio"), exist_ok=True)
    man_path = os.path.join(LIB, "manifest.json")
    man = json.load(open(man_path))
    items = [i for i in man["items"] if not i.get("sample")]
    for mood, scenes in SCENES.items():
        for sid, title, tags, paint in scenes:
            img = paint().convert("RGB")
            img.save(os.path.join(LIB, "photos", f"{sid}.webp"), "WEBP", quality=72, method=6)
            img.resize((240, 240), Image.LANCZOS).save(os.path.join(LIB, "photos", f"{sid}-thumb.webp"), "WEBP", quality=70)
            items.append({"id": f"lib.photo.{sid}", "title": title, "kind": "photo", "tags": tags + [mood], "sample": True,
                          "url": f"library/photos/{sid}.webp", "thumbnail": f"library/photos/{sid}-thumb.webp"})
    loop_dur = {}
    for lid, cfg in LOOPS.items():
        d = write_mp3(make_loop(cfg), os.path.join(LIB, "audio", f"{lid}.mp3"))
        loop_dur[lid] = d
        items.append({"id": f"lib.audio.{lid}", "title": cfg["title"], "kind": "audio", "tags": cfg["tags"] + ["loop"], "sample": True,
                      "url": f"library/audio/{lid}.mp3", "durationSec": round(d, 2), "bpm": cfg["bpm"]})
    for sid, (title, tags) in STINGERS.items():
        d = write_mp3(make_stinger(sid), os.path.join(LIB, "audio", f"{sid}.mp3"))
        items.append({"id": f"lib.audio.{sid}", "title": title, "kind": "audio", "tags": tags, "sample": True,
                      "url": f"library/audio/{sid}.mp3", "durationSec": round(d, 2)})
    man["items"] = items
    man["libraryVersion"] = "2026.10.09.1"
    json.dump(man, open(man_path, "w"), indent=2, ensure_ascii=False)

    # templates: add new ones to the catalog manifest
    cat_path = os.path.join(ROOT, "catalog", "manifest.json")
    cat = json.load(open(cat_path))
    have = {p["id"] for p in cat["packs"]}
    for t in NEW_TEMPLATES:
        if t["id"] not in have: cat["packs"].append(t)
    json.dump(cat, open(cat_path, "w"), indent=2, ensure_ascii=False)
    shutil.copy(cat_path, os.path.join(ROOT, "apps", "web", "public", "catalog-manifest.json"))

    samples = {}
    for p in cat["packs"]:
        if p["kind"] != "template": continue
        mood = MOOD_OF.get(p["id"], "cozy")
        samples[p["id"]] = build_sample(p, mood, loop_dur)
    json.dump({"schema": 1, "libraryVersion": man["libraryVersion"], "samples": samples},
              open(os.path.join(LIB, "samples.json"), "w"), indent=1, ensure_ascii=False)

    if os.path.exists(PUB): shutil.rmtree(PUB)
    shutil.copytree(LIB, PUB)
    print("photos", sum(1 for i in items if i["kind"] == "photo"), "audio", sum(1 for i in items if i["kind"] == "audio"), "samples", len(samples))

if __name__ == "__main__":
    main()
