#!/usr/bin/env python3
"""Build the symcc presentation video (docs/video/symcc.mp4) and its GIF preview
(docs/video/symcc.gif).

Every frame is drawn with Pillow (at 2x size, then shrunk for smooth edges) and piped
to ffmpeg. Colors and fonts follow docs/logo.svg, docs/demo.svg and docs/architecture.svg.

Usage:
    python3 docs/video/make_video.py              # build symcc.mp4 and symcc.gif
    python3 docs/video/make_video.py --stills     # also save a few PNG frames to /tmp
    python3 docs/video/make_video.py --frame 40   # save only the frame at 40 s to /tmp

Needs: Python 3 with Pillow, ffmpeg (FFMPEG env var or on PATH), and macOS system fonts
(Helvetica Neue and Menlo). Set FONT_SANS / FONT_MONO to use other .ttf/.ttc files.
"""

import math
import re
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1280, 720
S = 2  # draw at 2x, then shrink: smooth edges
FPS = 30

# Brand colors (from docs/*.svg)
BG_A = (0x1B, 0x1F, 0x2A)
BG_B = (0x2A, 0x22, 0x33)
ACCENT = (0xD9, 0x77, 0x57)
ACCENT_LIGHT = (0xF2, 0xA5, 0x8A)
TEXT = (0xF5, 0xF5, 0xF7)
MUTED = (0xB8, 0xBC, 0xCB)
DIM = (0x8B, 0x90, 0xA3)
CARD = (0x22, 0x26, 0x34)
CARD_DARK = (0x1B, 0x1F, 0x2A)
BORDER = (0x3A, 0x3F, 0x4F)
LINE = (0x4A, 0x50, 0x63)
TERM_BG = (0x0D, 0x11, 0x17)
TERM_BAR = (0x16, 0x1B, 0x22)
TERM_TEXT = (0xE6, 0xED, 0xF3)
TODO = (0x8B, 0x90, 0xA3)
RUNNING = (0x7A, 0xA7, 0xF0)
REVIEW = (0xE8, 0xC6, 0x6A)
DONE = (0x7F, 0xD1, 0x8B)
WORKER = (0x9F, 0xB6, 0xE0)
SCOUT = (0x8F, 0xD1, 0xB0)
RED = (0xF8, 0x51, 0x49)

FONT_SANS = os.environ.get("FONT_SANS", "/System/Library/Fonts/HelveticaNeue.ttc")
FONT_MONO = os.environ.get("FONT_MONO", "/System/Library/Fonts/Menlo.ttc")
_fonts = {}


def font(size, bold=False, mono=False, medium=False):
    key = (size, bold, mono, medium)
    if key not in _fonts:
        path = FONT_MONO if mono else FONT_SANS
        if mono:
            index = 1 if bold else 0
        else:
            index = 1 if bold else (10 if medium else 0)
        try:
            _fonts[key] = ImageFont.truetype(path, int(size * S), index=index)
        except OSError:
            _fonts[key] = ImageFont.truetype(path, int(size * S))
    return _fonts[key]


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ramp(t, start, length=0.5):
    """0 before start, 1 after start+length, smooth in between."""
    return ease((t - start) / length)


def window(t, start, end, fade=0.35):
    """1 between start and end, with soft edges."""
    return min(ramp(t, start, fade), 1 - ramp(t, end - fade, fade))


# ---------------------------------------------------------------- drawing helpers


class Canvas:
    """Draws in 1x coordinates on a 2x image."""

    def __init__(self, img):
        self.img = img
        self.d = ImageDraw.Draw(img)

    @staticmethod
    def _p(v):
        return int(round(v * S))

    def rect(self, x0, y0, x1, y1, r=0, fill=None, outline=None, width=1):
        box = [self._p(x0), self._p(y0), self._p(x1), self._p(y1)]
        self.d.rounded_rectangle(box, radius=self._p(r), fill=fill, outline=outline,
                                 width=max(1, self._p(width)) if outline else 0)

    def circle(self, cx, cy, r, fill=None, outline=None, width=1):
        self.d.ellipse([self._p(cx - r), self._p(cy - r), self._p(cx + r), self._p(cy + r)],
                       fill=fill, outline=outline, width=self._p(width) if outline else 0)

    def line(self, pts, fill, width=2, dash=None):
        pts = [(self._p(x), self._p(y)) for x, y in pts]
        if not dash:
            self.d.line(pts, fill=fill, width=self._p(width), joint="curve")
            return
        on, off = dash[0] * S, dash[1] * S
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            length = math.hypot(x1 - x0, y1 - y0)
            pos = 0.0
            while pos < length:
                end = min(length, pos + on)
                a, b = pos / length, end / length
                self.d.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a),
                             (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)],
                            fill=fill, width=self._p(width))
                pos += on + off

    def arrow(self, x0, y0, x1, y1, fill, width=2.5, head=11, dash=None):
        ang = math.atan2(y1 - y0, x1 - x0)
        bx, by = x1 - head * math.cos(ang), y1 - head * math.sin(ang)
        self.line([(x0, y0), (bx, by)], fill, width, dash)
        left = (bx + head * 0.55 * math.sin(ang), by - head * 0.55 * math.cos(ang))
        right = (bx - head * 0.55 * math.sin(ang), by + head * 0.55 * math.cos(ang))
        self.d.polygon([(self._p(x1), self._p(y1)), (self._p(left[0]), self._p(left[1])),
                        (self._p(right[0]), self._p(right[1]))], fill=fill)

    def text(self, x, y, s, f, fill, anchor="la", spacing=0):
        if spacing:
            # draw letter by letter (letter-spacing), anchor treated as left/middle
            total = sum(f.getlength(ch) for ch in s) / S + spacing * (len(s) - 1)
            if anchor[0] == "m":
                x -= total / 2
            for ch in s:
                self.d.text((self._p(x), self._p(y)), ch, font=f, fill=fill, anchor="l" + anchor[1])
                x += f.getlength(ch) / S + spacing
            return
        self.d.text((self._p(x), self._p(y)), s, font=f, fill=fill, anchor=anchor)

    def width_of(self, s, f):
        return f.getlength(s) / S

    def check(self, cx, cy, size, fill, width=3):
        self.line([(cx - size * 0.5, cy), (cx - size * 0.15, cy + size * 0.35),
                   (cx + size * 0.55, cy - size * 0.4)], fill, width)

    def group(self, alpha, fn):
        """Draw fn(canvas) with the given opacity (0..1)."""
        if alpha <= 0.002:
            return
        if alpha >= 0.998:
            fn(self)
            return
        tmp = self.img.copy()
        fn(Canvas(tmp))
        self.img.paste(Image.blend(self.img, tmp, alpha))
        self.d = ImageDraw.Draw(self.img)


def wrap(s, f, max_w):
    words, lines, cur = s.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if f.getlength(trial) / S <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def text_block(c, x, y, s, f, fill, max_w, line_h, anchor="la"):
    for i, ln in enumerate(wrap(s, f, max_w)):
        c.text(x, y + i * line_h, ln, f, fill, anchor)


def make_background():
    vert = Image.linear_gradient("L").resize((W * S, H * S))
    horiz = Image.linear_gradient("L").transpose(Image.Transpose.ROTATE_90)
    horiz = horiz.resize((W * S, H * S))
    grad = Image.blend(vert, horiz, 0.5)  # top-left to bottom-right, like the logo
    a = Image.new("RGB", (W * S, H * S), BG_A)
    b = Image.new("RGB", (W * S, H * S), BG_B)
    return Image.composite(b, a, grad)


BACKGROUND = None

# ---------------------------------------------------------------- logo (treble clef)

CLEF_PATH = ("M164,138 C150,132 140,144 150,152 C162,160 184,152 184,132 C184,110 160,104 146,114 "
             "C126,128 124,160 150,170 C178,180 200,160 192,128 C186,104 160,90 152,70 "
             "C146,52 154,30 166,30 C178,30 180,52 166,70 C150,90 160,170 162,190 "
             "C164,206 142,210 136,198")


def clef_points():
    toks = re.findall(r"[MC]|-?[0-9.]+", CLEF_PATH)
    pts, i, cur = [], 0, None
    while i < len(toks):
        t = toks[i]
        if t == "M":
            cur = (float(toks[i + 1]), float(toks[i + 2]))
            pts.append(cur)
            i += 3
        elif t == "C":
            i += 1
            while i < len(toks) and toks[i] not in ("M", "C"):
                p1 = (float(toks[i]), float(toks[i + 1]))
                p2 = (float(toks[i + 2]), float(toks[i + 3]))
                p3 = (float(toks[i + 4]), float(toks[i + 5]))
                for k in range(1, 25):
                    u = k / 24
                    x = ((1 - u) ** 3 * cur[0] + 3 * (1 - u) ** 2 * u * p1[0]
                         + 3 * (1 - u) * u * u * p2[0] + u ** 3 * p3[0])
                    y = ((1 - u) ** 3 * cur[1] + 3 * (1 - u) ** 2 * u * p1[1]
                         + 3 * (1 - u) * u * u * p2[1] + u ** 3 * p3[1])
                    pts.append((x, y))
                cur = p3
                i += 6
        else:
            i += 1
    # the logo applies: translate(158 118) scale(0.7) translate(-161 -118)
    return [(158 + (x - 161) * 0.7, 118 + (y - 118) * 0.7) for x, y in pts]


_CLEF = clef_points()
_logo_cache = {}


def draw_logo(c, cx, cy, k, staff=True, word=True):
    """Draw the logo (staff + clef + 'symcc'), logo units scaled by k, centered on cx,cy."""
    ox = 315 if word else 155  # logo-space center
    oy = 114

    def P(x, y):
        return cx + (x - ox) * k, cy + (y - oy) * k

    if staff:
        for yy in (70, 92, 114, 136, 158):
            c.line([P(60, yy), P(250, yy)], LINE, 2 * k)
    key = round(k, 3)
    if key not in _logo_cache:
        xs = [p[0] for p in _CLEF]
        ys = [p[1] for p in _CLEF]
        pad = 12
        x0, y0 = min(xs) - pad, min(ys) - pad
        wpx = int((max(xs) - x0 + pad) * k * S)
        hpx = int((max(ys) - y0 + pad) * k * S)
        mask = Image.new("L", (wpx, hpx), 0)
        md = ImageDraw.Draw(mask)
        pts = [((x - x0) * k * S, (y - y0) * k * S) for x, y in _CLEF]
        sw = 11 * 0.7 * k * S
        md.line(pts, fill=255, width=int(round(sw)))
        for px, py in pts:  # round joins everywhere: a smooth stroke
            md.ellipse([px - sw / 2, py - sw / 2, px + sw / 2, py + sw / 2], fill=255)
        bx, by = (158 + (140 - 161) * 0.7 - x0) * k * S, (118 + (194 - 118) * 0.7 - y0) * k * S
        r = 11 * 0.7 * k * S
        md.ellipse([bx - r, by - r, bx + r, by + r], fill=255)
        g = Image.linear_gradient("L").resize((wpx, hpx))
        col = Image.composite(Image.new("RGB", (wpx, hpx), ACCENT),
                              Image.new("RGB", (wpx, hpx), ACCENT_LIGHT), g)
        _logo_cache[key] = (col, mask, x0, y0)
    col, mask, x0, y0 = _logo_cache[key]
    px, py = P(x0, y0)
    c.img.paste(col, (int(px * S), int(py * S)), mask)
    if word:
        f = font(92 * k, bold=True, mono=True)
        x, y = P(290, 122)
        c.text(x, y, "symcc", f, TEXT, "ls", spacing=2 * k)


# ---------------------------------------------------------------- shared pieces


def header(c, step, total=4):
    draw_logo(c, 40, 40, 0.2, staff=False, word=False)
    c.text(62, 40, "symcc", font(20, bold=True, mono=True), TEXT, "lm")
    c.text(136, 40, "Swarm Harness", font(17), MUTED, "lm")
    for i in range(total):
        col = ACCENT if i == step else LINE
        c.circle(W - 40 - (total - 1 - i) * 22, 40, 5, fill=col)


def captions(c, t, items):
    f = font(26, medium=True)
    for start, end, s in items:
        a = window(t, start, end)
        if a <= 0:
            continue

        def draw(cc, s=s):
            tw = cc.width_of(s, f)
            cc.rect(W / 2 - tw / 2 - 28, 628, W / 2 + tw / 2 + 28, 684, r=28,
                    fill=(0x13, 0x16, 0x1E), outline=BORDER, width=1.5)
            cc.text(W / 2, 656, s, f, TEXT, "mm")

        c.group(a, draw)


def terminal(c, x0, y0, x1, y1, title):
    c.rect(x0, y0, x1, y1, r=12, fill=TERM_BG, outline=(0x30, 0x36, 0x3D), width=1.5)
    c.rect(x0 + 1, y0 + 1, x1 - 1, y0 + 30, r=11, fill=TERM_BAR)
    c.rect(x0 + 1, y0 + 18, x1 - 1, y0 + 30, fill=TERM_BAR)
    for i, col in enumerate(((0xFF, 0x5F, 0x57), (0xFE, 0xBC, 0x2E), (0x28, 0xC8, 0x40))):
        c.circle(x0 + 18 + i * 17, y0 + 15, 5, fill=col)
    c.text((x0 + x1) / 2, y0 + 15, title, font(13, mono=True), DIM, "mm")


def person(c, cx, cy, s, col):
    c.circle(cx, cy - 26 * s, 20 * s, fill=col)
    c.rect(cx - 32 * s, cy, cx + 32 * s, cy + 46 * s, r=22 * s, fill=col)


def pill(c, cx, cy, label, col, w=None):
    f = font(14, bold=True)
    w = w or c.width_of(label, f) + 26
    c.rect(cx - w / 2, cy - 12, cx + w / 2, cy + 12, r=12, fill=mix(CARD, col, 0.22),
           outline=col, width=1.2)
    c.text(cx, cy, label, f, col, "mm")


# ---------------------------------------------------------------- scenes
# Each scene: draw(canvas, local_time, duration)


def scene_title(c, t, dur):
    a1 = ramp(t, 0.2, 0.9)
    c.group(a1, lambda cc: draw_logo(cc, W / 2, 210 - 12 * (1 - a1), 1.25))
    a2 = ramp(t, 1.4, 0.7)

    def sub(cc):
        cc.text(W / 2, 352, "Swarm Harness", font(44, bold=True), ACCENT, "mm")
        cc.line([(W / 2 - 60, 392), (W / 2 + 60, 392)], ACCENT, 2)

    c.group(a2, sub)
    a3 = ramp(t, 2.6, 0.8)
    vision = ("Turn a messy swarm of coding agents into an organized team: a lead that plans, "
              "workers that build, and you in charge, so the work keeps moving even when "
              "you're not pushing it.")
    c.group(a3, lambda cc: text_block(cc, W / 2, 440, vision, font(27), MUTED, 900, 40, "ma"))
    a4 = ramp(t, 4.5, 0.8)
    c.group(a4, lambda cc: cc.text(W / 2, 610, "ORGANIZED  ·  SUPERVISED  ·  PROACTIVE",
                                   font(17), ACCENT, "mm", spacing=3))


def scene_problem(c, t, dur):
    header(c, 0)
    c.text(70, 112, "The problem", font(34, bold=True), TEXT, "la")
    # agents
    agents = [(600, 150), (810, 150), (1020, 150), (600, 330), (810, 330), (1020, 330)]
    you = (250, 400)
    for i, (x, y) in enumerate(agents):  # lines first, so windows sit on top
        c.group(ramp(t, 0.3 + i * 0.25, 0.4), lambda cc, x=x, y=y: cc.line(
            [(you[0] + 40, you[1] - 10), (x + 95, y + 60)], LINE, 1.5))
    for i, (x, y) in enumerate(agents):
        a = ramp(t, 0.3 + i * 0.25, 0.4)

        def draw_agent(cc, x=x, y=y, i=i):
            terminal(cc, x, y, x + 190, y + 120, "agent %d" % (i + 1))
            dots = "." * (1 + int((t * 2.5 + i) % 3))
            cc.text(x + 16, y + 56, "working" + dots, font(15, mono=True), TERM_TEXT, "lm")
            prog = (t * 0.12 + i * 0.17) % 1.0
            cc.rect(x + 16, y + 86, x + 174, y + 94, r=4, fill=(0x21, 0x26, 0x2D))
            cc.rect(x + 16, y + 86, x + 16 + 158 * prog, y + 94, r=4, fill=RUNNING)

        c.group(a, draw_agent)
    # you
    person(c, you[0], you[1], 1.2, ACCENT)
    c.text(you[0], you[1] + 80, "you", font(22, bold=True), TEXT, "mm")
    c.group(window(t, 2.0, 7.5), lambda cc: cc.text(you[0], you[1] + 108, "waiting...",
                                                     font(17), MUTED, "mm"))
    # ideas pile up
    ideas = ["fix the login bug", "rename the API", "add dark mode", "tests for search",
             "faster build", "update the docs", "nicer errors"]
    spots = [(70, 190), (250, 175), (110, 248), (300, 232), (60, 520), (260, 545), (150, 600)]
    slipped = {1, 3, 5}
    for i, (s, (x, y)) in enumerate(zip(ideas, spots)):
        a = ramp(t, 3.6 + i * 0.5, 0.35)
        fall = ramp(t, 8.3 + 0.3 * (i % 3), 1.2) if i in slipped else 0.0
        if y > 500:
            y -= 60  # keep the lower notes clear of the caption

        def draw_note(cc, s=s, x=x, y=y + fall * 40, i=i, fall=fall):
            f = font(16, bold=True)
            w = cc.width_of(s, f) + 26
            cc.rect(x + 3, y + 4, x + w + 3, y + 40, r=6, fill=(0x14, 0x16, 0x1E))
            cc.rect(x, y, x + w, y + 36, r=6, fill=REVIEW)
            cc.text(x + 13, y + 18, s, f, CARD_DARK, "lm")
            if fall > 0.3:
                cc.line([(x + 8, y + 18), (x + w - 8, y + 18)], RED, 2.5)

        alpha = a * (1 - 0.7 * fall)
        c.group(alpha, draw_note)
    c.group(ramp(t, 9.0, 0.5), lambda cc: cc.text(
        600, 500, "3 ideas slipped. Nobody remembers them.", font(22, bold=True), RED, "la"))
    captions(c, t, [(0.3, 3.6, "Many agents at once, and only one of you."),
                    (3.6, 8.3, "Ideas pile up while you wait for an agent to finish."),
                    (8.3, dur, "Things slip. Nobody sees what was asked and what is done.")])


def scene_structure(c, t, dur):
    header(c, 1)
    c.text(70, 112, "The structure", font(34, bold=True), TEXT, "la")
    cx = 560

    def box(cc, x0, y0, x1, y1, col, title, sub, tint=0.14, dashed=False):
        cc.rect(x0, y0, x1, y1, r=14, fill=mix(CARD, col, tint),
                outline=None if dashed else col, width=2)
        if dashed:
            for (p, q) in (((x0 + 14, y0), (x1 - 14, y0)), ((x0 + 14, y1), (x1 - 14, y1)),
                           ((x0, y0 + 14), (x0, y1 - 14)), ((x1, y0 + 14), (x1, y1 - 14))):
                cc.line([p, q], col, 2, dash=(8, 6))
        mid = (x0 + x1) / 2
        cc.text(mid, y0 + (y1 - y0) * 0.38, title, font(25, bold=True), col, "mm")
        cc.text(mid, y0 + (y1 - y0) * 0.70, sub, font(16), MUTED, "mm")

    # layer 1: you
    def l1(cc):
        box(cc, cx - 250, 165, cx + 250, 250, ACCENT_LIGHT, "You", "say what you want, approve what matters")
        person(cc, cx - 212, 205, 0.5, ACCENT_LIGHT)

    c.group(ramp(t, 0.4), l1)

    def l2(cc):
        cc.arrow(cx, 252, cx, 296, MUTED)
        box(cc, cx - 300, 298, cx + 300, 388, ACCENT, "Lead",
            "turns your words into tasks, keeps the board, checks the results", tint=0.2)

    c.group(ramp(t, 2.2), l2)
    workers = [cx - 230, cx, cx + 230]
    for i, wx in enumerate(workers):
        def l3(cc, wx=wx, i=i):
            cc.arrow(cx + (wx - cx) * 0.35, 390, wx, 444, MUTED)
            box(cc, wx - 105, 446, wx + 105, 540, WORKER, "Worker %d" % (i + 1),
                "own copy of the code", tint=0.12)

        c.group(ramp(t, 4.4 + i * 0.4), l3)

    def scouts(cc):
        box(cc, 960, 446, 1200, 540, SCOUT, "Scouts", "look for the next job", tint=0.1,
            dashed=True)
        cc.arrow(1040, 444, cx + 304, 360, SCOUT, dash=(8, 6))
        cc.text(1065, 392, "report", font(15), SCOUT, "la")

    c.group(ramp(t, 7.2), scouts)
    # layer labels
    for i, (y, s) in enumerate(((207, "1"), (343, "2"), (493, "3"))):
        c.group(ramp(t, [0.4, 2.2, 4.4][i]), lambda cc, y=y, s=s: (
            cc.circle(70, y, 16, outline=LINE, width=1.5),
            cc.text(70, y, s, font(16, bold=True), MUTED, "mm")))
    captions(c, t, [(0.3, 2.2, "You stay in charge."),
                    (2.2, 4.4, "The lead plans the work and keeps the board."),
                    (4.4, 7.2, "Workers build tasks in parallel."),
                    (7.2, dur, "Scouts look ahead and report new work to the lead.")])


TASKS = [
    # id, title, appear, start running, done, worker
    ("T-1", "search", 5.0, 7.0, 11.5, 1),
    ("T-2", "dark mode", 5.3, 7.4, 13.0, 2),
    ("T-3", "nicer errors", 5.6, 8.6, 15.6, 3),
    ("T-4", "tests for search", 14.2, 15.0, 18.6, 1),
]


def scene_how(c, t, dur):
    header(c, 2)
    c.text(70, 112, "How it works", font(34, bold=True), TEXT, "la")
    # ----- chat (left)
    x0, y0, x1, y1 = 50, 160, 470, 600
    terminal(c, x0, y0, x1, y1, "claude · ~/my-app")
    fm = font(15, mono=True)
    fmb = font(15, bold=True, mono=True)
    lines = []  # (time, who, text, color)

    def typed(start, end, s):
        n = int(len(s) * clamp((t - start) / (end - start)))
        return s[:n] if t < end else s

    msg1 = "add search, dark mode and nicer errors"
    msg2 = "also add tests for search"
    if t > 0.8:
        lines.append(("you", typed(1.0, 3.4, msg1), TERM_TEXT))
    if t > 4.2:
        lines.append(("lead", "Added T-1, T-2, T-3 to the board. Starting workers.", MUTED))
    if t > 11.9:
        lines.append(("you", typed(12.0, 13.4, msg2), TERM_TEXT))
    if t > 13.8:
        lines.append(("lead", "Added T-4. A worker picks it up.", MUTED))
    if t > 19.3:
        lines.append(("lead", "All 4 tasks passed their tests and are merged into main.", DONE))
    y = y0 + 54
    for who, s, col in lines:
        c.text(x0 + 18, y, who, fmb, ACCENT if who == "you" else SCOUT, "la")
        wrapped = wrap(s, fm, x1 - x0 - 100) or [""]
        for j, ln in enumerate(wrapped):
            c.text(x0 + 76, y + j * 24, ln, fm, col, "la")
        last = wrapped[-1]
        if who == "you" and len(s) < (len(msg1) if s and msg1.startswith(s) else len(msg2)):
            if int(t * 3) % 2 == 0:
                cx = x0 + 76 + c.width_of(last, fm) + 2
                c.rect(cx, y + (len(wrapped) - 1) * 24, cx + 9, y + (len(wrapped) - 1) * 24 + 18,
                       fill=TERM_TEXT)
        y += len(wrapped) * 24 + 18
    # ----- board (right)
    bx0, by0, bx1, by1 = 500, 160, 1230, 600
    c.rect(bx0, by0, bx1, by1, r=14, fill=CARD, outline=LINE, width=1.5)
    c.text(bx0 + 20, by0 + 28, "Board", font(20, bold=True), TEXT, "lm")
    c.text(bx1 - 20, by0 + 28, "one place for every task", font(15), MUTED, "rm")
    cols = [("todo", TODO), ("running", RUNNING), ("done", DONE)]
    colw = (bx1 - bx0 - 40) / 3
    colx = [bx0 + 20 + i * colw for i in range(3)]
    for i, (name, col) in enumerate(cols):
        pill(c, colx[i] + colw / 2, by0 + 70, name, col, w=110)
        if i:
            c.line([(colx[i] - 1, by0 + 92), (colx[i] - 1, by1 - 46)], BORDER, 1)
    merged = 0
    for row, (tid, title, appear, run, done, wk) in enumerate(TASKS):
        if t >= done + 0.7:
            merged += 1
        a = ramp(t, appear, 0.4)
        if a <= 0:
            continue
        m1 = ramp(t, run, 0.7)
        m2 = ramp(t, done, 0.7)
        pos = m1 + m2
        x = colx[0] + 8 + pos * colw
        y = by0 + 108 + row * 72
        state = 0 if pos < 0.5 else (1 if pos < 1.5 else 2)

        def card(cc, x=x, y=y, tid=tid, title=title, run=run, done=done, wk=wk, state=state):
            cw = colw - 16
            edge = [TODO, RUNNING, DONE][state]
            cc.rect(x, y, x + cw, y + 60, r=9, fill=CARD_DARK, outline=BORDER, width=1.2)
            cc.rect(x, y + 8, x + 4, y + 52, r=2, fill=edge)
            cc.text(x + 16, y + 20, tid, font(15, bold=True), TEXT, "lm")
            cc.text(x + 54, y + 20, title, font(15), TEXT, "lm")
            fs = font(13)
            if state == 0:
                cc.text(x + 16, y + 43, "waiting for a worker", fs, DIM, "lm")
            elif state == 1:
                testing = t > done - 1.4
                label = "running tests..." if testing else "worker %d · own copy" % wk
                cc.text(x + 16, y + 43, label, fs, REVIEW if testing else WORKER, "lm")
                prog = clamp((t - run) / (done - run))
                cc.rect(x + 16, y + 52, x + cw - 14, y + 55, r=1.5, fill=BORDER)
                cc.rect(x + 16, y + 52, x + 16 + (cw - 30) * prog, y + 55, r=1.5, fill=RUNNING)
            else:
                cc.check(x + 22, y + 43, 11, DONE, 2.2)
                cc.text(x + 34, y + 43, "tests passed · merged", fs, DONE, "lm")

        c.group(a, card)
    # main branch line
    ly = by1 - 24
    c.line([(bx0 + 20, ly), (bx1 - 20, ly)], BORDER, 2)
    c.text(bx0 + 20, ly - 2, "main", font(14, bold=True, mono=True), MUTED, "ls")
    for i in range(merged):
        c.circle(bx0 + 110 + i * 40, ly, 7, fill=DONE)
    if merged:
        c.text(bx1 - 20, ly - 2, "%d merged" % merged, font(14, bold=True), DONE, "rs")
    captions(c, t, [(0.3, 6.6, "You talk. The lead turns it into tasks on the board."),
                    (6.6, 10.6, "Workers run in parallel, each in its own copy of the code."),
                    (10.6, 16.0, "Tests run on every change. What passes is merged."),
                    (16.0, dur, "You can always see what was asked, what is running and what is done.")])


def scene_proactive(c, t, dur):
    header(c, 3)
    c.text(70, 112, "It keeps moving", font(34, bold=True), TEXT, "la")
    cards = [
        (SCOUT, "Scouts", "Wake up on a timer, look for the next job and report it to the lead."),
        (REVIEW, "Backlog", "Ideas you are not ready for wait on the board, not in your head."),
        (RUNNING, "Review mode", "Want more control? Approve each change before it is merged."),
    ]
    starts = [0.4, 3.4, 6.4]
    for i, (col, title, body) in enumerate(cards):
        x0 = 70 + i * 390
        st = starts[i]
        a = ramp(t, st, 0.5)

        def draw(cc, x0=x0, col=col, title=title, body=body, st=st, i=i):
            x1, y0, y1 = x0 + 360, 170, 530
            cc.rect(x0, y0, x1, y1, r=16, fill=CARD, outline=col if t > st else LINE, width=2)
            mx, my = (x0 + x1) / 2, 275
            lt = t - st
            if i == 0:  # clock + finding
                cc.circle(mx, my, 52, fill=mix(CARD, col, 0.15), outline=col, width=3)
                ang = lt * 2.2
                cc.line([(mx, my), (mx + 36 * math.sin(ang), my - 36 * math.cos(ang))], col, 3)
                cc.line([(mx, my), (mx, my - 24)], col, 3)
                cc.circle(mx, my, 5, fill=col)
                if lt > 1.4:
                    cc.group(ramp(lt, 1.4, 0.4), lambda c2: (
                        c2.rect(mx + 14, my - 80, mx + 156, my - 48, r=8, fill=CARD_DARK, outline=col),
                        c2.text(mx + 85, my - 64, "found: no tests", font(14, bold=True), col, "mm")))
            elif i == 1:  # stack of notes
                n = min(3, 1 + int(max(0.0, lt) / 0.6))
                for k in range(n):
                    yy = my + 50 - k * 44
                    cc.rect(mx - 85 + k * 6, yy - 18, mx + 85 + k * 6, yy + 18, r=6, fill=(0x14, 0x16, 0x1E))
                    cc.rect(mx - 88 + k * 6, yy - 22, mx + 82 + k * 6, yy + 14, r=6, fill=col)
                    cc.text(mx - 74 + k * 6, yy - 4, ["idea: rename API", "idea: faster build",
                                                       "idea: export CSV"][k],
                            font(14, bold=True), CARD_DARK, "lm")
            else:  # approve button
                approved = lt > 2.0
                bc = DONE if approved else col
                cc.rect(mx - 110, my - 30, mx + 110, my + 30, r=30, fill=mix(CARD, bc, 0.22),
                        outline=bc, width=2.5)
                if approved:
                    cc.check(mx - 58, my, 20, DONE, 3.5)
                    cc.text(mx + 12, my, "approved", font(22, bold=True), DONE, "mm")
                else:
                    cc.text(mx, my, "approve?", font(22, bold=True), col, "mm")
            cc.text(mx, 382, title, font(28, bold=True), col, "mm")
            text_block(cc, mx, 420, body, font(19), MUTED, 300, 28, "ma")

        c.group(a, draw)
    captions(c, t, [(0.3, 3.4, "Scouts find work on their own."),
                    (3.4, 6.4, "The backlog holds ideas for later."),
                    (6.4, 9.6, "Review mode, when you want control."),
                    (9.6, dur, "The work keeps moving, even when you're not pushing it.")])


def scene_end(c, t, dur):
    c.group(ramp(t, 0.2, 0.8), lambda cc: draw_logo(cc, W / 2, 175, 1.0))
    c.group(ramp(t, 0.8, 0.6), lambda cc: cc.text(W / 2, 290, "Swarm Harness",
                                                  font(36, bold=True), ACCENT, "mm"))

    def install(cc):
        cmd = "claude plugin install symcc --marketplace kourgeorge/symcc"
        f = font(21, mono=True)
        tw = cc.width_of("$ " + cmd, f)
        x0, x1 = W / 2 - tw / 2 - 36, W / 2 + tw / 2 + 36
        terminal(cc, x0, 345, x1, 455, "install")
        cc.text(x0 + 36, 412, "$ ", f, ACCENT, "lm")
        cc.text(x0 + 36 + cc.width_of("$ ", f), 412, cmd, f, TERM_TEXT, "lm")

    c.group(ramp(t, 1.6, 0.6), install)
    c.group(ramp(t, 2.6, 0.6), lambda cc: cc.text(W / 2, 515, "github.com/kourgeorge/symcc",
                                                  font(26, medium=True), TEXT, "mm"))
    c.group(ramp(t, 3.4, 0.6), lambda cc: cc.text(
        W / 2, 575, "Run a team of coding agents from one chat.", font(21), MUTED, "mm"))
    c.group(ramp(t, 4.2, 0.6), lambda cc: cc.text(W / 2, 640, "ORGANIZED  ·  SUPERVISED  ·  PROACTIVE",
                                                  font(16), ACCENT, "mm", spacing=3))


SCENES = [
    (scene_title, 8.5),
    (scene_problem, 12.5),
    (scene_structure, 12.0),
    (scene_how, 23.0),
    (scene_proactive, 13.0),
    (scene_end, 9.0),
]
TOTAL = sum(d for _, d in SCENES)
FADE = 0.6


def render(t, edge_fade=None):
    """Return the 1280x720 frame at time t (seconds)."""
    global BACKGROUND
    if BACKGROUND is None:
        BACKGROUND = make_background()
    img = BACKGROUND.copy()
    c = Canvas(img)
    start = 0.0
    for fn, dur in SCENES:
        if start <= t < start + dur or (fn is SCENES[-1][0] and t >= start):
            lt = t - start
            alpha = min(1.0, (dur - lt) / FADE) if fn is not SCENES[-1][0] else 1.0
            if fn is not SCENES[0][0]:
                alpha = min(alpha, lt / FADE)
            c.group(ease(alpha), lambda cc: fn(cc, lt, dur))
            break
        start += dur
    if edge_fade is not None and edge_fade < 1:
        img = Image.blend(BACKGROUND, img, ease(edge_fade))
    return img.reduce(S)


def ffmpeg_bin():
    return os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"


def pipe_frames(cmd, frames):
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for im in frames:
        p.stdin.write(im.tobytes())
    p.stdin.close()
    if p.wait() != 0:
        sys.exit("ffmpeg failed")


def build_mp4(path):
    n = int(TOTAL * FPS)

    def frames():
        for i in range(n):
            if i % (FPS * 5) == 0:
                print("  mp4 %5.1fs / %.1fs" % (i / FPS, TOTAL), flush=True)
            yield render(i / FPS)

    pipe_frames([ffmpeg_bin(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                 "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-",
                 "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", "22",
                 "-pix_fmt", "yuv420p", "-movflags", "+faststart", path], frames())


# GIF preview: key parts of the video (start, end in video seconds)
GIF_PARTS = [(0.8, 5.6), (27.6, 32.4), (37.5, 48.0)]
GIF_FPS = 12
GIF_W = 800


def build_gif(path):
    def frames():
        for a, b in GIF_PARTS:
            n = int((b - a) * GIF_FPS)
            for i in range(n):
                t = a + i / GIF_FPS
                edge = min(1.0, (t - a) / 0.4, (b - t) / 0.4)
                yield render(t, edge_fade=edge)

    gh = int(H * GIF_W / W) // 2 * 2
    vf = ("scale=%d:%d:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];"
          "[b][p]paletteuse=dither=bayer:bayer_scale=4" % (GIF_W, gh))
    pipe_frames([ffmpeg_bin(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                 "-s", "%dx%d" % (W, H), "-r", str(GIF_FPS), "-i", "-", "-vf", vf,
                 "-loop", "0", path], frames())


def main(argv):
    if "--frame" in argv:
        t = float(argv[argv.index("--frame") + 1])
        out = "/tmp/symcc_frame_%05.1f.png" % t
        render(t).save(out)
        print(out)
        return
    if "--stills" in argv:
        for t in (6.0, 18.0, 31.0, 44.0, 52.0, 66.0, 76.0):
            render(t).save("/tmp/symcc_still_%04.1f.png" % t)
        print("stills in /tmp/symcc_still_*.png")
    print("video length: %.1fs" % TOTAL)
    build_mp4(os.path.join(HERE, "symcc.mp4"))
    print("  gif")
    build_gif(os.path.join(HERE, "symcc.gif"))
    print("done")


if __name__ == "__main__":
    main(sys.argv[1:])
