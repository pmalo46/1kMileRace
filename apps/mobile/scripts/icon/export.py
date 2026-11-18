"""Writes the chosen icon (A: ink on Sunrise) into the app's assets. Usage: export.py SCRIPTDIR ASSETDIR"""
import sys
sys.path.insert(0, sys.argv[1])
from PIL import Image, ImageChops
import draw as D

out = sys.argv[2]
N = D.N

def shapes():
    m = D.runners_mask()
    return ImageChops.lighter(m, D.text_mask())

def shrink(mask, scale):
    """Scales the artwork about the center, for Android's safe zone."""
    small = mask.resize((round(N * scale), round(N * scale)), Image.LANCZOS)
    canvas = Image.new("L", (N, N), 0)
    o = (N - small.width) // 2
    # The artwork sits a little low (text below runners); nudge it up to center it.
    canvas.paste(small, (o, o - round(N * 0.03 * scale)))
    return canvas

def solid(mask, color, px):
    img = Image.new("RGBA", (N, N), color + (0,))
    img.putalpha(mask)
    return img.resize((px, px), Image.LANCZOS)

# Full icon (iOS and the store): no transparency.
full = D.icon("sunrise", D.INK, D.INK)
full.convert("RGB").save(f"{out}/icon.png")
full.resize((48, 48), Image.LANCZOS).save(f"{out}/favicon.png")

# Android adaptive: gradient behind, artwork in front, kept inside the middle 66%.
D.gradient(N).resize((512, 512), Image.LANCZOS).save(f"{out}/android-icon-background.png")
fg = shrink(shapes(), 0.62)
solid(fg, D.INK, 512).save(f"{out}/android-icon-foreground.png")
solid(fg, (255, 255, 255), 432).save(f"{out}/android-icon-monochrome.png")

# Splash: the runners alone in Sunrise colors, readable on the light and the dark splash.
m = D.runners_mask()
bbox = m.getbbox()
crop = m.crop(bbox)
g = D.gradient(N).crop(bbox).convert("RGBA")
g.putalpha(crop)
w = 600
g.resize((w, round(w * crop.height / crop.width)), Image.LANCZOS).save(f"{out}/splash-icon.png")
