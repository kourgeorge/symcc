#!/usr/bin/env python3
"""Build the narrated vertical short about scouts, the owner, the pipeline and the lead.

The words come from docs/video/scouts_narration.md. The voice, the timing of each scene
to its words, the loudness, the subtitles and the video encoding are shared with
make_youtube_video.py; this script only draws the pictures: an illuminated manuscript
(parchment, painted vine borders, blackletter headings, pinned notes, red ink stamps and
threads, and a small brass robot), all made with Pillow.

Writes:
    docs/video/out/symcc_scouts.mp4          1080x1920, 30 fps, H.264 + AAC (not committed)
    docs/video/symcc_scouts.srt              subtitles
    docs/video/symcc_scouts_thumbnail.png    1080x1920 thumbnail

Usage:
    python docs/video/make_scouts_video.py             # build everything
    python docs/video/make_scouts_video.py --times     # print when each scene starts
    python docs/video/make_scouts_video.py --frame 12  # save only the frame at 12 s to /tmp
    python docs/video/make_scouts_video.py --clip 2    # save scene 2's audio to /tmp
    python docs/video/make_scouts_video.py --thumbnail # only the thumbnail

Settings: the same as make_youtube_video.py (VOICE, SPOKEN_NAME, SYMCC_VIDEO_CACHE), and
SPEED (default 1.0 here: a short is read a little faster).

Fonts: Hoefler Text and Menlo (macOS), and the free blackletter font UnifrakturMaguntia
(SIL Open Font License), downloaded once to the cache folder. If it can't be downloaded,
the headings use Hoefler Text Black instead.
"""

import math
import os
import random
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # no __pycache__ in docs/video
import make_youtube_video as yt  # noqa: E402
import make_video as mv  # noqa: E402
from make_video import clamp, ease, ramp, window  # noqa: E402

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

# ---------------------------------------------------------------- settings

NARRATION = os.path.join(HERE, "scouts_narration.md")
MP4 = os.path.join(yt.OUT_DIR, "symcc_scouts.mp4")
SRT = os.path.join(HERE, "symcc_scouts.srt")
THUMB = os.path.join(HERE, "symcc_scouts_thumbnail.png")

# Drawing happens in 1080x1920 units on a 2x image, then halved for smooth edges.
mv.S = S = 2
W, H = 1080, 1920
FPS = yt.FPS
FADE = 0.4

# a short: a little faster, shorter pauses (these are make_youtube_video's timing settings)
yt.SPEED = float(os.environ.get("SPEED", "1.0"))
yt.LEAD_IN, yt.SENT_GAP, yt.TAIL, yt.END_HOLD = 0.5, 0.3, 0.55, 2.2

BOOK = os.environ.get("FONT_BOOK", "/System/Library/Fonts/Supplemental/Hoefler Text.ttc")
MONO = os.environ.get("FONT_MONO", "/System/Library/Fonts/Menlo.ttc")
GOTHIC_URL = ("https://github.com/google/fonts/raw/main/ofl/unifrakturmaguntia/"
              "UnifrakturMaguntia-Book.ttf")
GOTHIC = os.path.join(yt.CACHE, "fonts", "UnifrakturMaguntia-Book.ttf")

# manuscript colors
PARCH = (236, 223, 192)
PARCH_DARK = (214, 192, 150)
INK = (54, 38, 26)
INK_SOFT = (104, 80, 58)
RED = (164, 30, 28)
BLUE = (30, 56, 124)
GREEN = (44, 102, 58)
GOLD = (198, 154, 52)
GOLD_DARK = (142, 102, 28)
PAPER = (250, 243, 224)
PAPER_EDGE = (204, 182, 138)
CREAM = (251, 243, 222)
BRASS = (196, 148, 62)
BRASS_DARK = (122, 84, 30)
BRASS_LIGHT = (232, 196, 116)
ROT = (92, 98, 48)
PASS_GREEN = (40, 112, 60)

# ---------------------------------------------------------------- fonts


def ensure_gothic():
    """Download the blackletter font once (never into the project)."""
    if os.path.exists(GOTHIC):
        return
    try:
        os.makedirs(os.path.dirname(GOTHIC), exist_ok=True)
        print("downloading the blackletter font to %s ..." % GOTHIC, flush=True)
        urllib.request.urlretrieve(GOTHIC_URL, GOTHIC + ".part")
        os.replace(GOTHIC + ".part", GOTHIC)
    except OSError as e:
        print("could not download the blackletter font (%s); using Hoefler Text" % e)


_fonts = {}
FACES = {"book": (BOOK, 0), "bold": (BOOK, 1), "italic": (BOOK, 2),
         "mono": (MONO, 0), "monob": (MONO, 1)}


def font(kind, size):
    key = (kind, size)
    if key not in _fonts:
        if kind == "goth":
            path, index = (GOTHIC, 0) if os.path.exists(GOTHIC) else (BOOK, 1)
        else:
            path, index = FACES[kind]
        try:
            _fonts[key] = ImageFont.truetype(path, int(size * S), index=index)
        except OSError:
            _fonts[key] = ImageFont.truetype(path, int(size * S))
    return _fonts[key]


def fit(kind, size, s, max_w, c=None):
    """The biggest font of this kind, up to size, that fits s in max_w."""
    while size > 12 and font(kind, size).getlength(s) / S > max_w:
        size -= 2
    return font(kind, size)


# ---------------------------------------------------------------- narration


def load_red_words():
    """One list per scene: the word of each sentence that the caption shows in red."""
    with open(NARRATION, encoding="utf-8") as fh:
        text = fh.read().split("\n---")[0]
    out = []
    for part in re.split(r"^## Scene \d+: ", text, flags=re.M)[1:]:
        m = re.search(r"^\*\*Caption:\*\*\s*(.+)$", part, re.M)
        words = [w.strip() for w in m.group(1).split(" / ")] if m else []
        out.append([None if w == "-" else w.lower() for w in words])
    return out


# ---------------------------------------------------------------- page


def make_parchment():
    import numpy as np
    w, h = W * S, H * S
    rng = np.random.default_rng(7)

    def blotch(cell):
        small = (rng.random((h // cell + 2, w // cell + 2)) * 255).astype("uint8")
        img = Image.fromarray(small).resize((w + 2 * cell, h + 2 * cell), Image.BICUBIC)
        return np.asarray(img.crop((cell, cell, cell + w, cell + h)), dtype=np.float32) / 255

    shade = (1 + 0.07 * (blotch(160) - 0.5) + 0.04 * (blotch(28) - 0.5)
             + 0.025 * (rng.random((h, w), dtype=np.float32) - 0.5))
    ys = np.linspace(-1, 1, h, dtype=np.float32)[:, None]
    xs = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
    d = np.sqrt(xs * xs * 1.0 + ys * ys * 0.9)
    vig = np.clip(d - 0.62, 0, None) ** 1.6 * 1.25
    base = np.array(PARCH, dtype=np.float32)
    edge = np.array((128, 86, 44), dtype=np.float32)
    rgb = base[None, None, :] * shade[:, :, None]
    rgb = rgb * (1 - vig[:, :, None]) + edge[None, None, :] * vig[:, :, None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"), "RGB")


def leaf(c, x, y, ang, size, col):
    pts = []
    for k in range(13):
        u = k / 12
        r = size * math.sin(math.pi * u) * 0.38
        px, py = u * size, r
        pts.append((px, py))
    pts += [(px, -py) for px, py in reversed(pts)]
    ca, sa = math.cos(ang), math.sin(ang)
    poly = [(c._p(x + px * ca - py * sa), c._p(y + px * sa + py * ca)) for px, py in pts]
    c.d.polygon(poly, fill=col)
    c.line([(x, y), (x + size * 0.8 * ca, y + size * 0.8 * sa)], mv.mix(col, (20, 40, 20), 0.4), 1)


def flower(c, x, y, r, col):
    for k in range(5):
        a = k * 2 * math.pi / 5 - math.pi / 2
        c.circle(x + r * 0.9 * math.cos(a), y + r * 0.9 * math.sin(a), r * 0.62, fill=col)
    c.circle(x, y, r * 0.42, fill=GOLD)
    c.circle(x, y, r * 0.18, fill=GOLD_DARK)


def vine(c, pts, phase=0):
    """A painted vine along pts (a list of (x, y)), with leaves, flowers and gold dots."""
    c.line(pts, GREEN, 3.2)
    rng = random.Random(len(pts) * 7 + phase)
    for i in range(3, len(pts) - 3, 4):
        x, y = pts[i]
        nx, ny = pts[i + 1]
        ang = math.atan2(ny - y, nx - x)
        side = 1 if (i // 4 + phase) % 2 else -1
        leaf(c, x, y, ang + side * 1.0, 26, GREEN if i % 3 else (70, 128, 70))
        if i % 12 == 7:
            flower(c, x + side * 14 * math.sin(ang), y - side * 14 * math.cos(ang), 11,
                   RED if (i // 12 + phase) % 2 else BLUE)
        elif i % 12 == 1:
            c.circle(x - side * 16 * math.sin(ang), y + side * 16 * math.cos(ang), 4.5, fill=GOLD)
        if rng.random() < 0.3:
            c.circle(x + side * 22 * math.sin(ang), y - side * 22 * math.cos(ang), 3, fill=RED)


def snail(c, x, y):
    c.d.ellipse([c._p(x - 30), c._p(y - 2), c._p(x + 26), c._p(y + 10)], fill=(150, 120, 80))
    c.line([(x + 18, y), (x + 30, y - 18)], (150, 120, 80), 2.5)
    c.line([(x + 22, y), (x + 38, y - 14)], (150, 120, 80), 2.5)
    c.circle(x + 30, y - 18, 3, fill=INK)
    c.circle(x + 38, y - 14, 3, fill=INK)
    c.circle(x - 6, y - 14, 20, fill=BLUE, outline=GOLD, width=2.5)
    for r in (13, 7):
        c.circle(x - 6 + (20 - r) * 0.3, y - 14, r, outline=GOLD, width=2)


def bird(c, x, y, col=RED):
    c.d.ellipse([c._p(x - 22), c._p(y - 12), c._p(x + 16), c._p(y + 12)], fill=col)
    c.circle(x + 16, y - 10, 10, fill=col)
    c.d.polygon([(c._p(x + 25), c._p(y - 13)), (c._p(x + 37), c._p(y - 9)),
                 (c._p(x + 25), c._p(y - 5))], fill=GOLD)
    c.circle(x + 19, y - 12, 2.5, fill=CREAM)
    c.d.polygon([(c._p(x - 18), c._p(y - 4)), (c._p(x - 44), c._p(y - 22)),
                 (c._p(x - 36), c._p(y + 4))], fill=mv.mix(col, INK, 0.35))
    c.d.polygon([(c._p(x - 4), c._p(y - 8)), (c._p(x + 6), c._p(y - 34)),
                 (c._p(x + 10), c._p(y - 6))], fill=BLUE)
    c.line([(x - 2, y + 11), (x - 4, y + 22)], INK, 2)
    c.line([(x + 6, y + 11), (x + 6, y + 22)], INK, 2)


def corner(c, x, y):
    c.rect(x - 34, y - 34, x + 34, y + 34, r=4, fill=BLUE, outline=GOLD, width=3)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        c.circle(x + 15 * math.cos(a), y + 15 * math.sin(a), 9, fill=RED)
    c.circle(x, y, 9, fill=GOLD)
    c.circle(x, y, 4, fill=CREAM)


def draw_border(c):
    m0, m1 = 34, 112          # the band between these insets holds the vines
    c.rect(m0, m0, W - m0, H - m0, outline=GOLD, width=4)
    c.rect(m0 + 9, m0 + 9, W - m0 - 9, H - m0 - 9, outline=RED, width=1.6)
    c.rect(m1, m1, W - m1, H - m1, outline=BLUE, width=2)
    c.rect(m1 - 6, m1 - 6, W - m1 + 6, H - m1 + 6, outline=GOLD, width=1.2)
    mid = (m0 + m1) / 2 + 3
    step = 14
    left = [(mid + 9 * math.sin(y / 46), y) for y in range(110, H - 110, step)]
    right = [(W - mid + 9 * math.sin(y / 46 + 1.7), y) for y in range(110, H - 110, step)]
    top = [(x, mid + 8 * math.sin(x / 42)) for x in range(110, W - 110, step)]
    bottom = [(x, H - mid + 8 * math.sin(x / 42 + 2.1)) for x in range(110, W - 110, step)]
    for k, pts in enumerate((left, right, top, bottom)):
        vine(c, pts, k)
    for x, y in ((m0 + 39, m0 + 39), (W - m0 - 39, m0 + 39), (m0 + 39, H - m0 - 39),
                 (W - m0 - 39, H - m0 - 39)):
        corner(c, x, y)
    # small creatures in the margins
    c.rect(250, H - mid - 30, 360, H - mid + 22, fill=None)
    snail(c, 300, H - mid + 8)
    bird(c, W - 300, mid + 6)
    bird(c, mid + 4, 980, BLUE)


_bg = None


def background():
    global _bg
    if _bg is None:
        _bg = make_parchment()
        draw_border(mv.Canvas(_bg))
    return _bg


# ---------------------------------------------------------------- pieces

_sheets = {}


def sheet(c, cx, cy, w, h, ang, fn, key=None, fill=PAPER, pin=RED, shadow=True, pin_dx=0):
    """A note of w x h centered at (cx, cy), turned by ang degrees, with fn(canvas, x, y)
    drawing its contents from its top-left corner. key: cache it (contents never change)."""
    k = (key, w, h, ang, fill, pin) if key else None
    if k in _sheets:
        rot, sh = _sheets[k]
    else:
        pad = 26
        img = Image.new("RGBA", (int((w + 2 * pad) * S), int((h + 2 * pad) * S)), (0, 0, 0, 0))
        cc = mv.Canvas(img)
        if fill:
            cc.rect(pad, pad, pad + w, pad + h, r=3, fill=fill, outline=PAPER_EDGE, width=1.5)
        fn(cc, pad, pad)
        rot = img.rotate(ang, Image.BICUBIC, expand=True)
        sh = None
        if shadow and fill:
            a = rot.getchannel("A").point(lambda v: int(v * 0.32))
            a = a.resize((a.width // 4, a.height // 4)).filter(ImageFilter.GaussianBlur(3))
            sh = Image.new("RGBA", a.size, (70, 44, 18, 255))
            sh.putalpha(a)
            sh = sh.resize(rot.size, Image.BILINEAR)
        if k:
            if len(_sheets) > 80:
                _sheets.clear()
            _sheets[k] = (rot, sh)
    x, y = int(cx * S - rot.width / 2), int(cy * S - rot.height / 2)
    if sh:
        c.img.paste(sh, (x + int(6 * S), y + int(8 * S)), sh)
    c.img.paste(rot, (x, y), rot)
    if pin and fill:
        a = math.radians(ang)
        dy = -h / 2 + 8
        pin_head(c, cx + pin_dx * math.cos(a) + dy * math.sin(a),
                 cy - pin_dx * math.sin(a) + dy * math.cos(a), pin)


def pin_head(c, x, y, col=RED):
    c.circle(x + 2, y + 3, 10, fill=(110, 80, 50))
    c.circle(x, y, 10, fill=col)
    c.circle(x - 3, y - 3, 3.5, fill=mv.mix(col, (255, 255, 255), 0.55))


def lines_in(cc, x, y, w, rows, gap=8):
    """rows: [(text, font kind, size, color)], each wrapped to w. Returns the end y."""
    for s, kind, size, col in rows:
        f = font(kind, size)
        for ln in mv.wrap(s, f, w):
            cc.text(x, y, ln, f, col, "la")
            y += size * 1.22
        y += gap
    return y


def stamp(c, cx, cy, s, ang=-8, col=RED, size=40, a=1.0):
    """A red ink stamp: capitals in a double box."""
    if a <= 0:
        return
    f = font("bold", size)
    tw = f.getlength(s) / S
    w, h = tw + 44, size * 1.7

    def draw(cc, x, y):
        cc.rect(x, y, x + w, y + h, r=6, outline=col, width=4)
        cc.rect(x + 7, y + 7, x + w - 7, y + h - 7, r=3, outline=col, width=1.6)
        cc.text(x + w / 2, y + h / 2 + 2, s, f, col, "mm")

    c.group(a, lambda cc: sheet(cc, cx, cy, w, h, ang, draw, key=("stamp", s, col, size),
                                fill=None, pin=None))


def x_mark(c, cx, cy, size, prog=1.0, col=RED):
    """A big brush-stroke red X, drawn stroke by stroke as prog goes 0 to 1."""
    for k, (sx, sy, ex, ey) in enumerate(((-1, -1, 1, 1), (1, -1, -1, 1))):
        p = clamp(prog * 2 - k)
        if p <= 0:
            continue
        x0, y0 = cx + sx * size / 2, cy + sy * size / 2
        x1 = x0 + (cx + ex * size / 2 - x0) * p
        y1 = y0 + (cy + ey * size / 2 - y0) * p
        ang = math.atan2(y1 - y0, x1 - x0)
        nx, ny = -math.sin(ang), math.cos(ang)
        pts = []
        for i in range(11):
            u = i / 10
            wid = (4 + 9 * math.sin(math.pi * clamp(u * 0.9 + 0.05))) * (1 if u < 1 else 0.5)
            pts.append((x0 + (x1 - x0) * u + nx * wid, y0 + (y1 - y0) * u + ny * wid))
        for i in range(10, -1, -1):
            u = i / 10
            wid = (4 + 9 * math.sin(math.pi * clamp(u * 0.9 + 0.05)))
            pts.append((x0 + (x1 - x0) * u - nx * wid, y0 + (y1 - y0) * u - ny * wid))
        c.d.polygon([(c._p(x), c._p(y)) for x, y in pts], fill=col)


def underline(c, x0, x1, y, prog=1.0, col=RED, width=3.2):
    x1 = x0 + (x1 - x0) * clamp(prog)
    if x1 - x0 < 2:
        return
    pts = [(x, y + 2.5 * math.sin((x - x0) / 9)) for x in
           [x0 + (x1 - x0) * i / 30 for i in range(31)]]
    c.line(pts, col, width)


def thread(c, p0, p1, sag=60, prog=1.0, col=RED, pins=True):
    """A red thread hanging between two pins."""
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + sag
    n = max(2, int(40 * clamp(prog)))
    pts = []
    for i in range(n + 1):
        u = clamp(prog) * i / n
        pts.append(((1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * mx + u * u * p1[0],
                    (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * my + u * u * p1[1]))
    c.line(pts, col, 3)
    if pins:
        pin_head(c, p0[0], p0[1], RED)
        if prog >= 1:
            pin_head(c, p1[0], p1[1], RED)


def seal(c, cx, cy, r, col, letter=None):
    """A wax seal with a wavy edge and a letter."""
    pts = []
    for k in range(40):
        a = k * 2 * math.pi / 40
        rr = r * (1 if k % 2 else 0.93)
        pts.append((c._p(cx + rr * math.cos(a)), c._p(cy + rr * math.sin(a))))
    c.d.polygon(pts, fill=col)
    c.circle(cx, cy, r * 0.74, outline=mv.mix(col, (0, 0, 0), 0.35), width=2.5)
    c.circle(cx - r * 0.3, cy - r * 0.35, r * 0.16, fill=mv.mix(col, (255, 255, 255), 0.3))
    if letter:
        c.text(cx, cy + r * 0.04, letter, font("bold", int(r * 0.9)), CREAM, "mm")


def hourglass(c, cx, cy, s, t):
    """A small hourglass whose sand runs; it turns over every 4 seconds."""
    sand = (t % 4) / 4
    flip = (t % 4) > 3.7
    c.rect(cx - 14 * s, cy - 24 * s, cx + 14 * s, cy - 20 * s, fill=GOLD_DARK)
    c.rect(cx - 14 * s, cy + 20 * s, cx + 14 * s, cy + 24 * s, fill=GOLD_DARK)
    glass = [(cx - 11 * s, cy - 20 * s), (cx + 11 * s, cy - 20 * s), (cx, cy),
             (cx + 11 * s, cy + 20 * s), (cx - 11 * s, cy + 20 * s), (cx, cy)]
    c.d.polygon([(c._p(x), c._p(y)) for x, y in glass], fill=(246, 238, 214))
    if not flip:
        top = 1 - sand
        c.d.polygon([(c._p(cx - 9 * s * top), c._p(cy - 18 * s * top)),
                     (c._p(cx + 9 * s * top), c._p(cy - 18 * s * top)),
                     (c._p(cx), c._p(cy))], fill=GOLD)
        c.d.polygon([(c._p(cx - 9 * s * sand), c._p(cy + 18 * s)),
                     (c._p(cx + 9 * s * sand), c._p(cy + 18 * s)),
                     (c._p(cx), c._p(cy + 18 * s - 14 * s * sand))], fill=GOLD)
        c.line([(cx, cy), (cx, cy + 18 * s)], GOLD, 1.2)
    c.line([glass[0], glass[2], glass[3]], BRASS_DARK, 1.6)
    c.line([glass[1], glass[2], glass[4]], BRASS_DARK, 1.6)


def magnifier(c, cx, cy, r):
    c.line([(cx + r * 0.7, cy + r * 0.7), (cx + r * 1.6, cy + r * 1.6)], BRASS_DARK, r * 0.28)
    c.circle(cx, cy, r, fill=None, outline=BRASS_DARK, width=r * 0.22)
    c.circle(cx, cy, r * 0.88, outline=BRASS_LIGHT, width=r * 0.08)


def heading(c, s, a=1.0, y=206):
    """'¶ Heading' in red blackletter, with a gold rule under it."""
    def draw(cc):
        fp = font("bold", 66)
        f = fit("goth", 72, s, 760)
        pw = fp.getlength("¶ ") / S
        tw = f.getlength(s) / S
        x = W / 2 - (pw + tw) / 2
        cc.text(x, y, "¶", fp, RED, "lm")
        cc.text(x + pw, y, s, f, RED, "lm")
        cc.line([(W / 2 - 220, y + 58), (W / 2 + 220, y + 58)], GOLD, 2.2)
        cc.circle(W / 2, y + 58, 6, fill=RED)
        for sx in (-1, 1):
            cc.circle(W / 2 + sx * 232, y + 58, 4, fill=GOLD)

    c.group(a, draw)


def drop_cap(c, x, y, size, letter):
    c.rect(x, y, x + size, y + size, r=4, fill=BLUE, outline=GOLD, width=5)
    c.rect(x + 10, y + 10, x + size - 10, y + size - 10, r=2, outline=GOLD_DARK, width=1.5)
    rng = random.Random(3)
    for _ in range(14):
        c.circle(x + 18 + rng.random() * (size - 36), y + 18 + rng.random() * (size - 36),
                 2.5, fill=(200, 210, 240))
    vine(c, [(x + 14 + i * (size - 28) / 12, y + size - 26 + 6 * math.sin(i)) for i in range(13)], 1)
    c.text(x + size / 2, y + size / 2 - 4, letter, font("goth", int(size * 0.82)), GOLD, "mm")


def banner(c, cx, cy, w, h, s):
    """A red ribbon banner with forked tails and gold edges."""
    def P(pts):
        return [(c._p(x), c._p(y)) for x, y in pts]

    for sx in (-1, 1):
        x0 = cx + sx * (w / 2 - 30)
        x1 = cx + sx * (w / 2 + 110)
        tail = [(x0, cy - h / 2 + 30), (x1, cy - h / 2 + 30), (x1 - sx * 46, cy + 30),
                (x1, cy + h / 2 + 30), (x0, cy + h / 2 + 30)]
        c.d.polygon(P(tail), fill=mv.mix(RED, INK, 0.35), outline=GOLD_DARK)
        c.d.polygon(P([(x0, cy + h / 2 + 30), (cx + sx * w / 2, cy + h / 2),
                       (cx + sx * w / 2, cy + h / 2 + 30)]), fill=mv.mix(RED, INK, 0.6))
    c.rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, fill=RED, outline=GOLD, width=5)
    c.rect(cx - w / 2 + 10, cy - h / 2 + 10, cx + w / 2 - 10, cy + h / 2 - 10, outline=GOLD,
           width=1.5)
    c.text(cx, cy + 4, s, fit("goth", int(h * 0.82), s, w - 60), CREAM, "mm")


def trumpet(c, x, y, ang, length, t):
    """A gold trumpet from (x, y) (mouthpiece) pointing at ang radians, with a pennant."""
    ca, sa = math.cos(ang), math.sin(ang)
    nx, ny = -sa, ca

    def at(u, off):
        return (c._p(x + ca * length * u + nx * off), c._p(y + sa * length * u + ny * off))

    c.d.polygon([at(0, -4), at(0.72, -6), at(1, -34), at(1, 34), at(0.72, 6), at(0, 4)],
                fill=GOLD, outline=GOLD_DARK)
    ex, ey = x + ca * length, y + sa * length
    c.d.ellipse([c._p(ex - 10), c._p(ey - 34), c._p(ex + 10), c._p(ey + 34)], fill=GOLD_DARK)
    for u in (0.3, 0.5):
        c.circle(x + ca * length * u, y + sa * length * u, 7, fill=GOLD_DARK)
    # pennant hanging under the trumpet
    wave = 6 * math.sin(t * 5)
    p0 = (x + ca * length * 0.35, y + sa * length * 0.35)
    p1 = (x + ca * length * 0.7, y + sa * length * 0.7)
    c.d.polygon([(c._p(p0[0]), c._p(p0[1] + 6)), (c._p(p1[0]), c._p(p1[1] + 6)),
                 (c._p(p1[0] + 4), c._p(p1[1] + 70 + wave)),
                 (c._p((p0[0] + p1[0]) / 2), c._p((p0[1] + p1[1]) / 2 + 50 - wave)),
                 (c._p(p0[0] - 4), c._p(p0[1] + 70 + wave))], fill=BLUE, outline=GOLD)


def star(c, cx, cy, r, col=GOLD):
    pts = []
    for k in range(10):
        a = k * math.pi / 5 - math.pi / 2
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((c._p(cx + rr * math.cos(a)), c._p(cy + rr * math.sin(a))))
    c.d.polygon(pts, fill=col)


def robot(c, cx, cy, k=1.0, mood="happy", t=0.0, crown=False, quill=False):
    """The brass robot mascot, centered on its body. mood: happy, worried, think, cheer,
    judge."""
    y = cy + 4 * math.sin(t * 3.1) * k

    def P(dx, dy):
        return cx + dx * k, y + dy * k

    def R(x0, y0, x1, y1, **kw):
        a, b = P(x0, y0)
        cc, d = P(x1, y1)
        kw["r"] = kw.get("r", 0) * k
        if "width" in kw:
            kw["width"] = kw["width"] * k
        c.rect(a, b, cc, d, **kw)

    # legs and feet
    for sx in (-22, 22):
        R(sx - 8, 44, sx + 8, 80, fill=BRASS_DARK)
        R(sx - 17, 76, sx + 17, 90, r=6, fill=BRASS_DARK)
    # arms
    hands = {"happy": ((-74, 34), (74, 34)), "worried": ((-36, -84), (36, -84)),
             "cheer": ((-82, -96), (82, -96)), "think": ((-72, 36), (14, -44)),
             "judge": ((-72, 36), (78, -46))}[mood]
    wave = 8 * math.sin(t * 7) if mood == "cheer" else 0
    for (hx, hy), sx in zip(hands, (-1, 1)):
        sxp, syp = P(sx * 46, -18)
        hxp, hyp = P(hx + sx * wave * 0.3, hy - abs(wave))
        mx, my = P(sx * 62 + hx * 0.15, (hy - 18) / 2 + 12)
        c.line([(sxp, syp), (mx, my), (hxp, hyp)], BRASS_DARK, 9 * k)
        c.circle(hxp, hyp, 10 * k, fill=BRASS, outline=BRASS_DARK, width=2.5 * k)
    if quill:
        hx, hy = P(*hands[1])
        pts = []
        for i in range(13):
            u = i / 12
            wid = 11 * math.sin(math.pi * u) * k
            pts.append((hx + (14 + 70 * u) * k * 0.55 + wid, hy - 70 * u * k - wid * 0.4))
        pts += [(hx + (14 + 70 * u) * k * 0.55 - 11 * math.sin(math.pi * u) * k,
                 hy - 70 * u * k + 11 * math.sin(math.pi * u) * k * 0.4)
                for u in [i / 12 for i in range(12, -1, -1)]]
        c.d.polygon([(c._p(a), c._p(b)) for a, b in pts], fill=CREAM, outline=INK_SOFT)
        c.line([(hx + 4 * k, hy + 10 * k), (hx + 46 * k, hy - 70 * k)], INK_SOFT, 1.6 * k)
    # body
    R(-48, -42, 48, 50, r=16, fill=BRASS, outline=BRASS_DARK, width=3)
    R(-40, -34, -26, 40, r=7, fill=BRASS_LIGHT)
    dx, dy = P(0, 6)
    c.circle(dx, dy, 19 * k, fill=CREAM, outline=BRASS_DARK, width=3 * k)
    na = t * 1.4 + (2.4 if mood == "worried" else 0)
    c.line([(dx, dy), (dx + 13 * k * math.cos(na), dy + 13 * k * math.sin(na))], RED, 2.5 * k)
    for sx, sy in ((-38, -32), (38, -32), (-38, 40), (38, 40)):
        x_, y_ = P(sx, sy)
        c.circle(x_, y_, 3.2 * k, fill=BRASS_DARK)
    # neck and head
    R(-12, -54, 12, -40, fill=BRASS_DARK)
    R(-44, -116, 44, -52, r=16, fill=BRASS, outline=BRASS_DARK, width=3)
    R(-36, -108, -20, -60, r=6, fill=BRASS_LIGHT)
    for sx in (-1, 1):
        ex, ey = P(sx * 18, -86)
        if mood in ("happy", "cheer"):
            c.d.arc([c._p(ex - 10 * k), c._p(ey - 8 * k), c._p(ex + 10 * k), c._p(ey + 10 * k)],
                    200, 340, fill=INK, width=int(4 * k * S))
            continue
        c.circle(ex, ey, 11 * k, fill=CREAM, outline=BRASS_DARK, width=2 * k)
        px, py = {"worried": (0, 0), "think": (4, -4), "judge": (3, 1)}[mood]
        c.circle(ex + px * k, ey + py * k, (4 if mood == "worried" else 5.5) * k, fill=INK)
        if mood == "worried":
            c.line([(ex - 10 * k, ey - 16 * k - sx * 4 * k), (ex + 10 * k, ey - 16 * k + sx * 4 * k)],
                   INK, 2.8 * k)
        if mood == "judge":
            c.line([(ex - 11 * k, ey - 13 * k), (ex + 11 * k, ey - 13 * k)], INK, 2.8 * k)
    mx, my = P(0, -66)
    if mood in ("happy", "judge"):
        c.d.arc([c._p(mx - 14 * k), c._p(my - 10 * k), c._p(mx + 14 * k), c._p(my + 6 * k)],
                20, 160, fill=INK, width=int(3.4 * k * S))
    elif mood == "cheer":
        c.d.chord([c._p(mx - 15 * k), c._p(my - 10 * k), c._p(mx + 15 * k), c._p(my + 12 * k)],
                  0, 180, fill=INK)
    elif mood == "worried":
        c.circle(mx, my, 5.5 * k, fill=INK)
        sx_, sy_ = P(54, -100)
        c.d.polygon([(c._p(sx_), c._p(sy_ - 10 * k)), (c._p(sx_ - 6 * k), c._p(sy_ + 2 * k)),
                     (c._p(sx_ + 6 * k), c._p(sy_ + 2 * k))], fill=(110, 150, 210))
        c.circle(sx_, sy_ + 3 * k, 6 * k, fill=(110, 150, 210))
    else:
        c.line([P(-6, -64), P(12, -68)], INK, 3 * k)
    # antenna or crown
    if crown:
        pts = [P(-34, -112), P(-38, -146), P(-18, -126), P(0, -152), P(18, -126), P(38, -146),
               P(34, -112)]
        c.d.polygon([(c._p(a), c._p(b)) for a, b in pts], fill=GOLD, outline=GOLD_DARK)
        for sx in (-22, 0, 22):
            gx, gy = P(sx, -121)
            c.circle(gx, gy, 4 * k, fill=RED if sx else BLUE)
    else:
        c.line([P(0, -116), P(0, -138)], BRASS_DARK, 3 * k)
        bx, by = P(0, -142)
        glow = 0.5 + 0.5 * math.sin(t * 4)
        c.circle(bx, by, 8 * k, fill=mv.mix(RED, (255, 140, 120), glow * 0.5))


# ---------------------------------------------------------------- crack

def _crack_points():
    rng = random.Random(11)
    pts, (x0, y0), (x1, y1) = [], (905, 300), (190, 1380)
    n = 22
    for i in range(n + 1):
        u = i / n
        jit = 0 if i in (0, n) else rng.uniform(-34, 34)
        pts.append((x0 + (x1 - x0) * u + jit, y0 + (y1 - y0) * u + rng.uniform(-10, 10)))
    branches = []
    for i in (5, 11, 17):
        x, y = pts[i]
        side = 1 if i % 2 else -1
        branches.append([(x, y), (x + side * 40, y + 24), (x + side * 70, y + 18 + rng.uniform(0, 30))])
    return pts, branches


CRACK, CRACK_BRANCHES = _crack_points()


def partial(pts, prog):
    n = len(pts) - 1
    k = clamp(prog) * n
    i = int(k)
    if i >= n:
        return list(pts)
    f = k - i
    a, b = pts[i], pts[i + 1]
    return list(pts[:i + 1]) + [(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)]


def crack(c, prog, heal=0.0):
    if prog <= 0:
        return
    pts = partial(CRACK, prog)
    if len(pts) > 1:
        c.line(pts, (96, 64, 36), 7)
        c.line(pts, (34, 22, 14), 2.6)
    for k, br in enumerate(CRACK_BRANCHES):
        if prog > (5 + 6 * k) / 22 + 0.05:
            c.line(br, (96, 64, 36), 4)
            c.line(br, (34, 22, 14), 1.6)
    if heal > 0:
        hp = partial(CRACK, heal)
        if len(hp) > 1:
            c.line(hp, GOLD_DARK, 9)
            c.line(hp, GOLD, 5)
            c.line(hp, (250, 222, 140), 1.6)
        for k, br in enumerate(CRACK_BRANCHES):
            if heal > (5 + 6 * k) / 22 + 0.05:
                c.line(br, GOLD_DARK, 6)
                c.line(br, GOLD, 3)
        hx, hy = hp[-1]
        if heal < 1:
            star(c, hx, hy, 16, (255, 230, 150))


# ---------------------------------------------------------------- captions


def caption_parts(cues, scene_end):
    """[(start, end, text)] for the caption box: long sentences are cut into parts."""
    out = []
    for i, (a, b, s) in enumerate(cues):
        parts = yt.split_caption(s, 62)
        total = sum(len(p) for p in parts)
        t = a
        nxt = cues[i + 1][0] if i + 1 < len(cues) else scene_end - 0.15
        for j, p in enumerate(parts):
            d = (b - a) * len(p) / total
            end = t + d if j < len(parts) - 1 else nxt
            out.append((t, end, p, i))
            t += d
    return out


def caption(c, t, parts, red):
    f = font("book", 44)
    for start, end, s, i in parts:
        if not start - 0.05 <= t < end:
            continue
        key = red[i] if i < len(red) else None
        lines = mv.wrap(s, f, 760)
        widths = [f.getlength(ln) / S for ln in lines]
        bw = max(widths) + 80
        lh = 56
        bh = len(lines) * lh + 36
        cy = 1530
        y0 = cy - bh / 2

        def draw(cc, lines=lines, widths=widths, bw=bw, bh=bh, y0=y0, key=key):
            cc.rect(W / 2 - bw / 2 + 5, y0 + 7, W / 2 + bw / 2 + 5, y0 + bh + 7, r=6,
                    fill=(150, 118, 78))
            cc.rect(W / 2 - bw / 2, y0, W / 2 + bw / 2, y0 + bh, r=6, fill=CREAM, outline=RED,
                    width=2.6)
            cc.rect(W / 2 - bw / 2 + 7, y0 + 7, W / 2 + bw / 2 - 7, y0 + bh - 7, r=3,
                    outline=GOLD, width=1.1)
            used = False
            for k, (ln, lw) in enumerate(zip(lines, widths)):
                x = W / 2 - lw / 2
                yy = y0 + 18 + lh * k + lh / 2
                for word in ln.split(" "):
                    plain = re.sub(r"[^\w]", "", word).lower()
                    hot = bool(key) and not used and plain.startswith(key)
                    used = used or hot
                    cc.text(x, yy, word, f, RED if hot else INK, "lm")
                    x += f.getlength(word + " ") / S

        c.group(ramp(t, start - 0.05, 0.12), draw)
        return


# ---------------------------------------------------------------- scenes
# Each scene: draw(canvas, local_time, duration, cues)


def mono_note(title, code, code_size=26, extra=None):
    def fn(cc, x, y):
        cc.text(x + 24, y + 30, title, font("italic", 24), INK_SOFT, "lm")
        cc.line([(x + 20, y + 52), (x + 380, y + 52)], PAPER_EDGE, 1.2)
        yy = y + 70
        for ln in code:
            cc.text(x + 24, yy, ln, font("mono", code_size), INK, "la")
            yy += code_size * 1.35
        if extra:
            extra(cc, x, y)
    return fn


def rot_marks(c, cx, cy, w, h, amount, seed):
    """Green-brown rot spots and a little hole on a note."""
    if amount <= 0:
        return
    rng = random.Random(seed)
    for _ in range(5):
        x = cx + rng.uniform(w * 0.12, w / 2 - 28)
        y = cy + rng.uniform(-h / 2 + 26, -6)
        r = rng.uniform(8, 18) * amount
        c.circle(x, y, r * 1.35, fill=mv.mix(PAPER, ROT, 0.35))
        c.circle(x + 2, y + 1, r, fill=mv.mix(PAPER, ROT, 0.7))
        c.circle(x + 3, y, r * 0.45, fill=(58, 46, 30))


def scene_rot(c, t, dur, q):
    heading(c, "Of Rot and Holes", ramp(t, 0.0, 0.5))
    c.group(ramp(t, 0.1, 0.5), lambda cc: (
        drop_cap(cc, 150, 320, 190, "C"),
        cc.text(366, 440, "ode rots.", font("goth", 116), INK, "ls")))
    crack(c, ramp(t, q.at(0, 0.3), 2.6))
    notes = [
        (460, 680, -3, "hooks/core/board-file.ts", ["catch {", "  return emptyBoard()", "}"],
         "BUG", q.at(1, 0.45)),
        (600, 930, 2.5, "tests/merge.test.ts", ["test(\"+1 hour\")", "test(\"no rush\")  ???"],
         "NO TEST", q.at(1, 0.66)),
        (470, 1170, -2, "docs/guide.md", ["Esc closes the board", "target_branch: main"],
         "STALE", q.at(1, 0.86)),
    ]
    for k, (cx, cy, ang, title, code, label, st) in enumerate(notes):
        a = ramp(t, st, 0.4)
        w, h = 540, 196

        def note(cc, cx=cx, cy=cy, ang=ang, title=title, code=code, k=k, st=st):
            sheet(cc, cx, cy, w, h, ang, mono_note(title, code), key=("rot", k))
            rot_marks(cc, cx, cy, w, h, ramp(t, st + 0.3, 1.6), seed=k + 4)
            if k == 2:
                underline(cc, cx - 240, cx + 60, cy - 2, ramp(t, st + 0.4, 0.6), width=4)

        c.group(a, note)
        stamp(c, cx + 170, cy + 58, label, ang=-10 + 6 * k, a=ramp(t, st + 0.35, 0.25))
    robot(c, 890, 1250, 0.95, "worried" if t > q.s(1) else "think", t)


def scout_seals(c, t, q, xs=(250, 540, 830), y=410):
    names = [("gaps-bot", BLUE), ("test-gaps", GREEN), ("recent-changes", RED)]
    for k, (name, col) in enumerate(names):
        a = ramp(t, q.at(0, 0.3 + 0.2 * k), 0.4)

        def draw(cc, k=k, name=name, col=col):
            x = xs[k]
            lit = window(t, q.at(1, 0.4 + 0.15 * k), q.at(1, 0.4 + 0.15 * k) + 1.0) if k == 1 else 0
            if k == 1 and t > q.s(2):
                lit = 1
            if lit:
                cc.circle(x, y, 78, fill=mv.mix(PARCH, GOLD, 0.45 * lit))
            seal(cc, x, y, 60, col)
            magnifier(cc, x - 6, y - 6, 22)
            cc.text(x, y + 98, name, fit("monob", 26, name, 250), INK, "mm")
            hourglass(cc, x + 58, y - 52, 0.9, t - q.s(1) if t > q.s(1) else 0)

        c.group(a, draw)


def scene_scouts(c, t, dur, q):
    heading(c, "Of the Scouts", ramp(t, 0.0, 0.5))
    scout_seals(c, t, q)
    c.group(ramp(t, q.at(1, 0.25), 0.4), lambda cc: cc.text(
        W / 2, 560, "they wake on timers and read the code", font("italic", 30), INK_SOFT, "mm"))
    # the code with the bug
    a = ramp(t, q.at(1, 0.6), 0.4)
    cx, cy = 520, 720

    def code(cc):
        sheet(cc, cx, cy, 760, 170, 0, mono_note(
            "hooks/core/task.ts", ["if (/^(stop|no\\b|end|fail)/", "      .test(answer)) stop()"]),
            key="scout-code")
        f = font("mono", 26)
        x0 = cx - 380 + 24 + f.getlength("if (/^(stop|") / S
        underline(cc, x0, x0 + f.getlength("no\\b") / S, cy + 17, ramp(t, q.at(2, 0.1), 0.5),
                  width=4)

    c.group(a, code)
    # the owner's friendly answer that would stop a worker
    a = ramp(t, q.at(2, 0.25), 0.4)

    def answer(cc):
        sheet(cc, 470, 925, 660, 130, 2, lambda c2, x, y: (
            c2.text(x + 24, y + 30, "the owner answers:", font("italic", 24), INK_SOFT, "lm"),
            c2.text(x + 24, y + 82, "“no rush, give it another hour”", font("italic", 40),
                    INK, "lm")), key="scout-answer")
        thread(cc, (700, cy + 22), (770, 890), 30, ramp(t, q.at(2, 0.35), 0.5))

    c.group(a, answer)
    stamp(c, 560, 1012, "WOULD STOP THE WORKER", ang=-4, size=32, a=ramp(t, q.at(2, 0.7), 0.25))
    # the finding becomes a task
    a = ramp(t, q.s(3), 0.45)
    slide = 1 - ease((t - q.s(3)) / 0.6)

    def task(cc):
        sheet(cc, 450 - 200 * slide, 1215, 600, 210, -2, lambda c2, x, y: lines_in(
            c2, x + 26, y + 26, 548, [
                ("T-262", "bold", 40, RED),
                ("More-time answer: only a clear “stop” stops the worker",
                 "book", 30, INK),
                ("found by scout test-gaps", "italic", 26, GREEN)], gap=4),
            key="scout-task")
        seal(cc, 690 - 200 * slide, 1280, 34, GREEN, "S")

    c.group(a, task)
    mood = "happy" if t > q.s(3) else ("worried" if t > q.at(2, 0.7) else "think")
    robot(c, 890, 1250, 0.9, mood, t)


def chat_scroll(c, x0, y0, x1, y1, prog):
    """An unrolled scroll with wooden rollers at the top and the bottom."""
    yb = y0 + (y1 - y0) * prog
    c.rect(x0 + 14, y0, x1 - 14, yb, fill=PAPER, outline=PAPER_EDGE, width=1.5)
    for yy in (y0, yb):
        c.rect(x0, yy - 16, x1, yy + 16, r=16, fill=(170, 120, 66), outline=(110, 72, 34), width=2)
        c.rect(x0 + 16, yy - 9, x1 - 16, yy - 4, r=2, fill=(206, 160, 100))
        for xx in (x0 - 8, x1 + 8):
            c.circle(xx, yy, 13, fill=GOLD, outline=GOLD_DARK, width=2)


def scene_owner(c, t, dur, q):
    heading(c, "Of the Owner’s Word", ramp(t, 0.0, 0.5))
    x0, y0, x1, y1 = 140, 330, 940, 790
    c.group(ramp(t, 0.15, 0.4), lambda cc: chat_scroll(cc, x0, y0, x1, y1, ramp(t, 0.15, 0.8)))
    ask = ("i want to create additional video showing that the scouts and the user "
           "through the leader create tasks")
    f = font("italic", 33)
    shown = yt.typed(t, q.at(0, 0.2), q.at(1, 0.45), ask)
    if t > 0.7:
        c.text(x0 + 50, y0 + 60, "you", font("bold", 30), RED, "lm")
        y = y0 + 98
        for ln in mv.wrap("“" + shown + ("”" if shown == ask else ""), f, 640):
            c.text(x0 + 50, y, ln, f, INK, "lm")
            y += 44
    if t > q.at(1, 0.55):
        a = ramp(t, q.at(1, 0.55), 0.4)
        c.group(a, lambda cc: (
            cc.text(x0 + 50, y0 + 330, "lead", font("bold", 30), BLUE, "lm"),
            cc.text(x0 + 50, y0 + 375, "Added T-290: a new narrated short.", font("book", 33),
                    INK, "lm"),
            underline(cc, x0 + 50 + font("book", 33).getlength("Added ") / S,
                      x0 + 50 + font("book", 33).getlength("Added T-290") / S, y0 + 398,
                      ramp(t, q.at(1, 0.75), 0.4))))
    robot(c, 860, 650, 0.62, "judge" if t > q.at(1, 0.5) else "think", t, crown=True, quill=True)
    # the board: both kinds of task meet
    a = ramp(t, q.s(2) - 0.2, 0.45)

    def board(cc):
        bx0, by0, bx1, by1 = 130, 860, 950, 1360
        cc.rect(bx0, by0, bx1, by1, r=8, fill=(120, 80, 44), outline=(80, 50, 24), width=3)
        cc.rect(bx0 + 18, by0 + 18, bx1 - 18, by1 - 18, r=4, fill=PARCH_DARK)
        cc.text(W / 2, by0 + 62, "The Board", font("goth", 50), INK, "mm")
        s1 = ease((t - q.at(2, 0.1)) / 0.6)
        s2 = ease((t - q.at(2, 0.35)) / 0.6)
        if s1 > 0:
            sheet(cc, 340 - 180 * (1 - s1), 1125, 340, 250, -2.5, lambda c2, x, y: lines_in(
                c2, x + 22, y + 34, 300, [
                    ("T-262", "bold", 36, RED),
                    ("More-time answer", "book", 27, INK),
                    ("from scout test-gaps", "italic", 24, GREEN)], gap=4), key="own-262")
            seal(cc, 440 - 180 * (1 - s1), 1215, 30, GREEN, "S")
        if s2 > 0:
            sheet(cc, 740, 1125 - 200 * (1 - s2), 340, 250, 2.5, lambda c2, x, y: lines_in(
                c2, x + 22, y + 34, 300, [
                    ("T-290", "bold", 36, RED),
                    ("New narrated short video", "book", 27, INK),
                    ("from the owner’s words", "italic", 24, BLUE)], gap=4), key="own-290")
            seal(cc, 840, 1215 - 200 * (1 - s2), 30, RED, "O")

    c.group(a, board)


STATIONS = [("todo", "waiting its turn", BLUE), ("doing", "a worker builds it", GREEN),
            ("test", "tests must pass", GOLD_DARK), ("merge", "into main", RED)]
ST_Y = [420, 650, 880, 1110]


def scene_pipeline(c, t, dur, q):
    heading(c, "Of the Pipeline", ramp(t, 0.0, 0.5))

    def stations(cc):
        cc.line([(170, ST_Y[0]), (170, ST_Y[-1])], GOLD, 3, dash=(10, 8))
        for k, (name, sub, col) in enumerate(STATIONS):
            y = ST_Y[k]
            cc.rect(140, y - 70, 410, y + 70, r=10, fill=mv.mix(PARCH, col, 0.12), outline=col,
                    width=3)
            cc.circle(170, y - 70, 9, fill=col)
            cc.text(275, y - 14, name, font("goth", 52), col, "mm")
            cc.text(275, y + 40, sub, font("italic", 24), INK_SOFT, "mm")

    c.group(ramp(t, 0.1, 0.5), stations)
    # T-262 goes down the stations
    keys = [(0, 0), (q.s(1), 1), (q.s(2), 2), (q.at(2, 0.75), 3)]
    pos = keys[0][1]
    for tk, v in keys[1:]:
        pos += (v - pos) * ramp(t, tk, 0.7) if t > tk else 0
    st = int(round(pos))
    y = ST_Y[0] + (ST_Y[1] - ST_Y[0]) * pos

    def body(c2, x, yy, st=st):
        c2.text(x + 24, yy + 32, "T-262", font("bold", 34), RED, "lm")
        c2.text(x + 140, yy + 32, "More-time answer", font("book", 28), INK, "lm")
        if st == 1:
            c2.text(x + 24, yy + 80, "worker, in its own copy:", font("italic", 24), INK_SOFT, "lm")
            c2.text(x + 24, yy + 114, ".symcc/worktrees/T-262", font("mono", 22), INK, "lm")
        elif st == 2:
            c2.text(x + 24, yy + 80, "running the tests:", font("italic", 24), INK_SOFT, "lm")
            c2.text(x + 24, yy + 114, "claude plugin test .", font("mono", 22), INK, "lm")
        elif st == 3:
            c2.text(x + 24, yy + 80, "merged into main", font("italic", 26), PASS_GREEN, "lm")
            c2.text(x + 24, yy + 114, "805e6bd T-262: More-time ...", font("mono", 22), INK, "lm")
        else:
            c2.text(x + 24, yy + 80, "found by scout test-gaps", font("italic", 24), GREEN, "lm")

    c.group(ramp(t, 0.3, 0.4), lambda cc: sheet(cc, 680, y, 470, 150, -1.5, body,
                                               key=("pipe", st), pin_dx=205))
    if st >= 1 and t < q.s(2) + 0.2:
        prog = clamp((t - q.s(1)) / max(0.5, q.s(2) - q.s(1)))
        c.rect(475, y + 54, 885, y + 62, r=3, fill=PARCH_DARK)
        c.rect(475, y + 54, 475 + 410 * prog, y + 62, r=3, fill=GREEN)
    stamp(c, 810, ST_Y[2] + 66, "PASSED", ang=-8, col=PASS_GREEN, size=38,
          a=ramp(t, q.at(2, 0.4), 0.2) * (1 - ramp(t, q.at(2, 0.75), 0.4)))
    if t > q.at(2, 0.95):
        c.group(ramp(t, q.at(2, 0.95), 0.3), lambda cc: cc.check(890, ST_Y[3] - 40, 40, GOLD_DARK, 7))
    # another task fails its tests and goes back
    a = ramp(t, q.s(3), 0.4)
    back = ramp(t, q.at(3, 0.7), 0.8)
    yb = ST_Y[2] + (ST_Y[1] - ST_Y[2]) * back

    def failing(cc):
        sheet(cc, 680, yb, 470, 150, 1.5, lambda c2, x, yy: (
            c2.text(x + 24, yy + 32, "T-264", font("bold", 34), RED, "lm"),
            c2.text(x + 140, yy + 32, "Switch a task’s kind", font("book", 28), INK, "lm"),
            c2.text(x + 24, yy + 84, "try 1: a test fails" if back < 0.5 else "try 2: building again",
                    font("italic", 26), RED if back < 0.5 else GREEN, "lm")),
            key=("fail", back < 0.5), pin_dx=205)
        x_mark(cc, 680, yb, 130, ramp(t, q.at(3, 0.2), 0.5) * (1 - ramp(t, q.at(3, 0.65), 0.3)))

    if t > q.s(3) - 0.1:
        c.group(a, failing)
        c.group(ramp(t, q.at(3, 0.45), 0.4), lambda cc: (
            cc.arrow(935, ST_Y[2] - 10, 935, ST_Y[1] + 40, RED, width=4, head=16),
            cc.text(915, (ST_Y[1] + ST_Y[2]) / 2, "another try", font("italic", 28), RED, "rm")))
    mood = "worried" if q.s(3) + 0.3 < t < q.at(3, 0.75) else ("happy" if t > q.at(2, 0.4) else "think")
    robot(c, 880, 1320, 0.75, mood, t)


def scene_task(c, t, dur, q):
    heading(c, "What a Task Holds", ramp(t, 0.0, 0.5))
    x0, y0, x1, y1 = 140, 330, 940, 1245
    c.group(ramp(t, 0.1, 0.4), lambda cc: chat_scroll(cc, x0, y0, x1, y1, ramp(t, q.at(0, 0.1), 0.9)))
    if t < q.at(0, 0.4):
        return robot(c, 880, 1368, 0.6, "think", t)
    c.group(ramp(t, q.at(0, 0.4), 0.4), lambda cc: (
        cc.text(x0 + 50, y0 + 62, "T-262", font("bold", 44), RED, "lm"),
        cc.text(x0 + 200, y0 + 62, "More-time answer", font("goth", 46), INK, "lm"),
        cc.line([(x0 + 50, y0 + 98), (x1 - 50, y0 + 98)], GOLD, 1.6)))
    rows = [
        ("what", "stop only on a clear “stop”", "book", q.at(1, 0.05)),
        ("why", "“no rush” ended the work", "book", q.at(1, 0.2)),
        ("files", "hooks/core/task.ts, tests/", "mono", q.at(1, 0.4)),
        ("from", "scout test-gaps", "book", q.at(1, 0.65)),
        ("tries", "2, the second one merged", "book", q.at(2, 0.05)),
        ("report", "“no rush, another hour” gives 60 min", "book", q.at(2, 0.3)),
        ("cost", "2 minutes, 65k tokens", "book", q.at(2, 0.65)),
    ]
    for k, (label, value, kind, st) in enumerate(rows):
        y = y0 + 150 + k * 72
        c.group(ramp(t, st, 0.35), lambda cc, label=label, value=value, kind=kind, y=y: (
            cc.text(x0 + 50, y, label, font("italic", 30), RED, "lm"),
            cc.text(x0 + 190, y, value, fit(kind, 30 if kind == "book" else 25, value, 560), INK, "lm"),
            cc.line([(x0 + 50, y + 34), (x1 - 50, y + 34)], mv.mix(PAPER, PAPER_EDGE, 0.5), 1)))
    # where a task can come from
    kinds = [("owner’s words", RED, "O"), ("a scout", GREEN, "S"),
             ("a worker’s report", BLUE, "W"), ("the lead", GOLD_DARK, "L")]
    for k, (name, col, letter) in enumerate(kinds):
        x = x0 + 110 + k * 193
        c.group(ramp(t, q.at(1, 0.75 + 0.06 * k), 0.3), lambda cc, x=x, name=name, col=col,
                letter=letter: (seal(cc, x, 1090, 38, col, letter),
                                cc.text(x, 1158, name, fit("italic", 24, name, 186), INK, "mm")))
    c.group(ramp(t, q.at(1, 0.7), 0.3), lambda cc: cc.circle(x0 + 110 + 193, 1090, 50,
                                                           outline=RED, width=3))
    robot(c, 880, 1368, 0.6, "happy", t)


def scene_lead(c, t, dur, q):
    heading(c, "Of the Lead’s Judgement", ramp(t, 0.0, 0.5))
    robot(c, 860, 470, 0.8, "judge", t, crown=True, quill=True)
    trace = ramp(t, q.s(3) - 0.25, 0.35)
    trace_in = ramp(t, q.s(3) + 0.1, 0.4)
    ranks = [("I", "T-271", "a board tool wrote at the system root", "BUG", q.at(1, 0.1)),
             ("II", "T-170", "“../” could reach outside the scouts", "SAFETY", q.at(1, 0.45)),
             ("III", "T-289", "keep a question across a reload", None, q.at(2, 0.05)),
             ("IV", "T-291", "find the test state that leaks", "after T-289", q.at(2, 0.3))]
    ys = [580, 790, 1000, 1210]

    def ranked(cc):
        for k, (num, tid, text, label, st) in enumerate(ranks):
            a = ramp(t, st, 0.35)
            y = ys[k]

            def one(c2, num=num, tid=tid, text=text, y=y, k=k):
                c2.text(240, y, num, font("bold", 48), RED, "rm")
                sheet(c2, 520, y, 500, 128, (-1.5, 1.2, -1, 1.5)[k], lambda c3, x, yy: lines_in(
                    c3, x + 22, yy + 24, 456, [(tid, "bold", 32, RED), (text, "book", 27, INK)],
                    gap=2), key=("lead", k))

            cc.group(a, one)
            if label:
                cc.group(ramp(t, st + 0.3, 0.3), lambda c2, label=label, y=y: stamp(
                    c2, 850, y + 6, label, ang=-8, size=30 if len(label) < 8 else 26))
        cc.group(ramp(t, q.at(2, 0.5), 0.3), lambda c2: (
            thread(c2, (745, ys[2] - 40), (745, ys[3] - 40), 0, ramp(t, q.at(2, 0.5), 0.5)),
            c2.text(765, (ys[2] + ys[3]) / 2 - 40, "same files", font("italic", 26), RED, "lm")))

    c.group(1 - trace, ranked)
    if trace <= 0:
        return
    # commit -> task -> origin: every change traces back to its request

    def chain(cc):
        sheet(cc, 540, 1180, 820, 96, 0, lambda c2, x, y: c2.text(
            x + 24, y + 48, "805e6bd  T-262: More-time answer: only a ...", font("mono", 26),
            INK, "lm"), key="commit", pin=None)
        cc.text(150, 1110, "the commit", font("italic", 26), INK_SOFT, "lm")
        f = font("mono", 26)
        x0 = 130 + 24 + f.getlength("805e6bd  ") / S
        underline(cc, x0, x0 + f.getlength("T-262:") / S, 1200, ramp(t, q.at(3, 0.25), 0.4), width=4)
        sheet(cc, 450, 880, 560, 170, -1.5, lambda c2, x, y: lines_in(c2, x + 24, y + 26, 510, [
            ("T-262", "bold", 34, RED), ("More-time answer: only a clear “stop”", "book", 28, INK),
            ("from scout test-gaps", "italic", 26, GREEN)], gap=2), key="lead-262")
        cc.text(740, 880, "the task", font("italic", 26), INK_SOFT, "lm")
        thread(cc, (x0 + 40, 1142), (300, 952), 10, ramp(t, q.at(3, 0.35), 0.5))
        cc.group(ramp(t, q.at(3, 0.65), 0.4), lambda c2: (
            seal(c2, 450, 640, 52, GREEN, "S"),
            c2.text(530, 640, "the request: scout test-gaps", font("italic", 28), INK, "lm"),
            thread(c2, (640, 808), (480, 690), 10, ramp(t, q.at(3, 0.7), 0.4), pins=False)))

    c.group(trace_in, chain)


CLOSED = [("T-108", "a broken board.json is never overwritten"),
          ("T-110", "a merge keeps the owner’s ignored files"),
          ("T-170", "“../” can’t reach outside the scouts"),
          ("T-262", "“no rush” no longer stops a worker"),
          ("T-271", "nothing is written at the file system root")]


def scene_closed(c, t, dur, q):
    heading(c, "The Holes Closed", ramp(t, 0.0, 0.5))
    crack(c, 1.0 - 0.0 * t, heal=ramp(t, 0.2, max(1.0, q.e(0) + 1.2)))

    def listing(cc):
        sheet(cc, 540, 600, 820, 470, -0.8, lambda c2, x, y: None, key="closed-bg")
        for k, (tid, text) in enumerate(CLOSED):
            y = 425 + k * 80
            tick = q.at(0, 0.3) + k * (q.at(1, 0.2) - q.at(0, 0.3)) / 4
            cc.rect(170, y - 18, 206, y + 18, r=3, outline=INK_SOFT, width=2)
            cc.group(ramp(t, tick, 0.25), lambda c2, y=y: c2.check(190, y - 2, 34, RED, 6))
            cc.text(232, y, tid, font("monob", 26), RED, "lm")
            cc.text(350, y, text, fit("book", 30, text, 570), INK, "lm")

    c.group(ramp(t, 0.15, 0.4), listing)
    for k, (num, label, col, st) in enumerate(((270, "tasks done", RED, q.at(1, 0.3)),
                                               (63, "found by scouts", GREEN, q.at(1, 0.65)))):
        x = 300 + k * 330
        a = ramp(t, st, 0.4)
        n = int(round(num * ease((t - st) / 1.0)))

        def medal(cc, x=x, n=n, label=label, col=col):
            cc.circle(x, 1030, 128, fill=mv.mix(PARCH, GOLD, 0.25), outline=GOLD, width=5)
            cc.circle(x, 1030, 114, outline=col, width=2)
            cc.text(x, 1010, str(n), font("bold", 96), col, "mm")
            cc.text(x, 1090, label, font("italic", 28), INK, "mm")

        c.group(a, medal)
    c.group(ramp(t, q.at(1, 0.8), 0.4), lambda cc: sheet(
        cc, 470, 1215, 600, 56, 0, lambda c2, x, y: c2.text(
            x + 300, y + 28, "from this one project’s board, 10 to 16 November 2026",
            font("italic", 25), INK_SOFT, "mm"), key="closed-date", pin=None))
    robot(c, 880, 1300 if t < q.s(2) else 1290, 0.7, "cheer" if t > q.s(2) else "happy", t)
    if t > q.s(2):
        for k in range(5):
            u = (t - q.s(2)) * 0.6 + k * 0.2
            star(c, 760 + k * 50, 1200 - 40 * math.sin(u * 3 + k), 9 + 4 * math.sin(t * 4 + k))


def scene_end(c, t, dur, q):
    a = ramp(t, 0.1, 0.6)

    def top(cc):
        for sx in (-1, 1):
            trumpet(cc, W / 2 + sx * 130, 560, -math.pi / 2 + sx * 1.05, 290, t)
        banner(cc, W / 2, 640, 560, 170, "symcc")

    c.group(a, top)
    c.group(ramp(t, q.s(1) - 0.1, 0.5), lambda cc: (
        cc.text(W / 2, 870, "many agents, one board", font("italic", 58), INK, "mm"),
        cc.line([(W / 2 - 250, 920), (W / 2 + 250, 920)], GOLD, 2),
        cc.circle(W / 2, 920, 6, fill=RED)))
    c.group(ramp(t, q.s(1) + 0.6, 0.5), lambda cc: cc.text(
        W / 2, 990, "github.com/kourgeorge/symcc", font("monob", 36), RED, "mm"))
    robot(c, W / 2, 1250, 1.2, "cheer", t)
    for k in range(9):
        ph = t * 0.8 + k * 0.7
        x = 200 + (k * 97) % 700
        y = 330 + ((ph * 120 + k * 60) % 300)
        star(c, x, y, 7 + 4 * math.sin(t * 3 + k), GOLD if k % 2 else RED)


SCENE_FNS = [scene_rot, scene_scouts, scene_owner, scene_pipeline, scene_task, scene_lead,
             scene_closed, scene_end]

# ---------------------------------------------------------------- frames

_SCENES = None
_RED = None


def _init(scenes):
    global _SCENES, _RED
    _SCENES = scenes
    _RED = load_red_words()


def render(t):
    """The 1080x1920 frame at time t (seconds)."""
    img = background().copy()
    c = mv.Canvas(img)
    n = len(_SCENES)
    for i, sc in enumerate(_SCENES):
        if sc["start"] <= t < sc["start"] + sc["dur"] or i == n - 1:
            lt = t - sc["start"]
            alpha = 1.0
            if i:
                alpha = min(alpha, lt / FADE)
            if i < n - 1:
                alpha = min(alpha, (sc["dur"] - lt) / FADE)
            q = yt.Cues(sc["cues"])
            parts = caption_parts(sc["cues"], sc["dur"])

            def draw(cc):
                SCENE_FNS[i](cc, lt, sc["dur"], q)
                caption(cc, lt, parts, _RED[i])

            c.group(ease(alpha), draw)
            break
    return img.reduce(2)


def _frame_bytes(i):
    return render(i / FPS).tobytes()


def thumbnail(path):
    img = background().copy()
    c = mv.Canvas(img)
    crack(c, 1.0, heal=0.62)
    heading(c, "Of Scouts and Tasks")
    c.text(W / 2, 400, "The holes in your code,", font("italic", 58), INK, "mm")
    c.text(W / 2, 480, "found and closed", font("goth", 92), RED, "mm")
    sheet(c, 420, 770, 560, 200, -3, mono_note("hooks/core/task.ts",
                                               ["if (/^(stop|no\\b)/", "  .test(answer)) stop()"]))
    stamp(c, 590, 885, "FOUND BY A SCOUT", ang=-6, size=32)
    sheet(c, 600, 1060, 560, 190, 2.5, lambda cc, x, y: lines_in(cc, x + 26, y + 28, 500, [
        ("T-262", "bold", 40, RED), ("only a clear “stop” stops the worker", "book", 32, INK)]))
    stamp(c, 730, 1160, "PASSED", ang=-7, col=PASS_GREEN, size=40)
    robot(c, 850, 1330, 1.0, "cheer", 0.3)
    banner(c, 470, 1420, 470, 150, "symcc")
    c.text(W / 2, 1650, "many agents, one board", font("italic", 54), INK, "mm")
    img.reduce(2).save(path, optimize=True)
    print(path)


# ---------------------------------------------------------------- build


def main(argv):
    ensure_gothic()
    if "--thumbnail" in argv:
        thumbnail(THUMB)
        return
    scenes, audio, rate = yt.build_timeline(NARRATION, len(SCENE_FNS))
    _init(scenes)
    if "--frame" in argv:
        t = float(argv[argv.index("--frame") + 1])
        out = "/tmp/symcc_scouts_frame_%05.1f.png" % t
        render(t).save(out)
        print(out)
        return
    if "--clip" in argv:
        k = int(argv[argv.index("--clip") + 1])
        out = "/tmp/symcc_scouts_scene%d.wav" % k
        yt.write_wav(out, scenes[k - 1]["clip"], rate)
        print(out)
        return
    if "--times" in argv:
        words = 0
        for i, sc in enumerate(scenes):
            n = sum(len(s.split()) for _, _, s in sc["cues"])
            words += n
            print("scene %d  %6.1fs  %5.1fs  %3d words  %s" % (i + 1, sc["start"], sc["dur"], n,
                                                               sc["title"]))
        total = scenes[-1]["start"] + scenes[-1]["dur"]
        print("total %.1fs, %d words" % (total, words))
        return
    yt.write_srt(scenes, SRT)
    thumbnail(THUMB)
    yt.build(scenes, audio, rate, mp4=MP4, frame=_frame_bytes, init=_init, size=(W, H))
    print("done")


if __name__ == "__main__":
    main(sys.argv[1:])
