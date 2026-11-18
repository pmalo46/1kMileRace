"""Running-together icon, drawn with PIL at 2x. Usage: draw.py OUTDIR"""
import sys
from PIL import Image, ImageDraw, ImageFont

K = 2  # supersample
N = 1024 * K
INK = (28, 20, 51)
WHITE = (255, 255, 255)
CREAM = (255, 248, 241)
SUN = [(255, 77, 109), (255, 138, 61), (255, 201, 74)]
DIN = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"

def sunrise(t):
    t = max(0.0, min(1.0, t))
    a, b, u = (SUN[0], SUN[1], t * 2) if t < 0.5 else (SUN[1], SUN[2], (t - 0.5) * 2)
    return tuple(round(a[i] + (b[i] - a[i]) * u) for i in range(3))

def gradient(n):
    # Diagonal, coral top-left to gold bottom-right. Built small and scaled: smooth enough.
    g = Image.new("RGB", (256, 256))
    px = g.load()
    for y in range(256):
        for x in range(256):
            px[x, y] = sunrise((x + y) / 510)
    return g.resize((n, n), Image.BICUBIC)

POSES = {
    "run": dict(sh=(9, -40), head=(17, -58), fk=(22, 14), ff=(14, 40), bk=(-12, 20), bf=(-32, 26),
                fe=(24, -26), fh=(34, -40), be=(-6, -20), bh=(-20, -10)),
    "run2": dict(sh=(8, -40), head=(15, -58), fk=(16, 20), ff=(26, 40), bk=(-6, 22), bf=(-26, 34),
                 fe=(20, -22), fh=(30, -34), be=(-8, -24), bh=(-20, -14)),
    "walk": dict(sh=(3, -41), head=(6, -60), fk=(9, 22), ff=(15, 44), bk=(-4, 22), bf=(-12, 44),
                 fe=(12, -22), fh=(16, -8), be=(-6, -22), bh=(-10, -8)),
}

def stroke(d, pts, w):
    d.line(pts, fill=255, width=round(w), joint="curve")
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)

def figure(d, x, y, s, pose, pony=False):
    P = POSES[pose]
    p = lambda k: (x + P[k][0] * s, y + P[k][1] * s)
    w = 11 * s
    hip = (x, y)
    stroke(d, [hip, p("bk"), p("bf")], w)
    stroke(d, [p("sh"), p("be"), p("bh")], w)
    stroke(d, [hip, p("sh")], w * 1.5)
    stroke(d, [hip, p("fk"), p("ff")], w)
    stroke(d, [p("sh"), p("fe"), p("fh")], w)
    hx, hy = p("head")
    r = 11 * s
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=255)
    if pony:
        # A ponytail swinging out behind.
        pts = [(hx - 7 * s, hy - 7 * s), (hx - 17 * s, hy - 8 * s), (hx - 23 * s, hy + 2 * s)]
        stroke(d, pts, 6.5 * s)

def runners_mask(s=4.3, base=520, cx=512):
    m = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(m)
    k = K
    figure(d, (cx - 230) * k, base * k, s * 0.92 * k, "walk")
    figure(d, (cx - 15) * k, base * k, s * k, "run2", pony=True)
    figure(d, (cx + 205) * k, (base - 5) * k, s * 1.02 * k, "run")
    return m

def text_mask(txt="1K MILE RACE", width=800, center_y=800):
    m = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(m)
    size = 400 * K
    f = ImageFont.truetype(DIN, size)
    b = d.textbbox((0, 0), txt, font=f)
    size = int(size * width * K / (b[2] - b[0]))
    f = ImageFont.truetype(DIN, size)
    b = d.textbbox((0, 0), txt, font=f)
    d.text((N / 2 - (b[0] + b[2]) / 2, center_y * K - (b[1] + b[3]) / 2), txt, font=f, fill=255)
    return m

def paint(base, mask, fill):
    layer = fill if isinstance(fill, Image.Image) else Image.new("RGB", (N, N), fill)
    base.paste(layer, (0, 0), mask)

def icon(bg, fig, txt, **kw):
    img = gradient(N) if bg == "sunrise" else Image.new("RGB", (N, N), bg)
    paint(img, runners_mask(), gradient(N) if fig == "sunrise" else fig)
    paint(img, text_mask(), txt)
    return img.resize((1024, 1024), Image.LANCZOS)

if __name__ == "__main__":
    out = sys.argv[1]
    icon("sunrise", INK, INK).save(f"{out}/a-ink.svg.png")
    icon("sunrise", WHITE, WHITE).save(f"{out}/b-white.svg.png")
    icon(INK, "sunrise", CREAM).save(f"{out}/c-dark.svg.png")
