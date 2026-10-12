"""Regenerate native icons + splash screens from apps/mobile/assets (brand sources). Run: python3 scripts/gen-assets.py"""
import glob, os
from PIL import Image, ImageDraw
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
icon = Image.open('assets/icon-only.png').convert('RGB')
fg = Image.open('assets/icon-foreground.png').convert('RGBA')
splash = Image.open('assets/splash.png').convert('RGB')
def cover(src, w, h):
    s = max(w / src.width, h / src.height); r = src.resize((round(src.width * s), round(src.height * s)), Image.LANCZOS)
    return r.crop(((r.width - w) // 2, (r.height - h) // 2, (r.width - w) // 2 + w, (r.height - h) // 2 + h))
for p in glob.glob('android/app/src/main/res/mipmap-*/ic_launcher*.png'):
    w, h = Image.open(p).size
    if p.endswith('_foreground.png'): fg.resize((w, h), Image.LANCZOS).save(p)
    elif p.endswith('_round.png'):
        im = icon.resize((w, h), Image.LANCZOS).convert('RGBA'); m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).ellipse((0, 0, w - 1, h - 1), fill=255); im.putalpha(m); im.save(p)
    else:
        im = icon.resize((w, h), Image.LANCZOS).convert('RGBA'); m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), w // 6, fill=255); im.putalpha(m); im.save(p)
for p in glob.glob('android/app/src/main/res/drawable*/splash.png') + glob.glob('ios/App/App/Assets.xcassets/Splash.imageset/*.png'):
    w, h = Image.open(p).size; cover(splash, w, h).save(p)
icon.resize((1024, 1024)).save('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
bgxml = 'android/app/src/main/res/values/ic_launcher_background.xml'
open(bgxml, 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2D2070</color>\n</resources>\n')
print('assets ok')
