#!/usr/bin/env python3
"""Build the narrated symcc explainer for YouTube.

The words come from docs/video/narration.md (one scene per "## Scene" part). Each scene's
narration is read by a Kokoro voice (free, open source, runs on this computer), one audio
clip per scene, and each scene lasts as long as its audio plus a short pause. The pictures
are drawn with Pillow, reusing the helpers and colors of make_video.py.

Writes:
    docs/video/out/symcc_youtube.mp4         1920x1080, 30 fps, H.264 + AAC (not committed)
    docs/video/symcc_youtube.srt             subtitles
    docs/video/symcc_youtube_thumbnail.png   1280x720 thumbnail

Usage:
    python docs/video/make_youtube_video.py             # build everything
    python docs/video/make_youtube_video.py --frame 40  # save only the frame at 40 s to /tmp
    python docs/video/make_youtube_video.py --clip 2    # save scene 2's audio to /tmp
    python docs/video/make_youtube_video.py --thumbnail # only the thumbnail

Settings (environment variables, no need to edit this file):
    VOICE        Kokoro voice, default af_heart (try am_michael, af_bella, bf_emma, ...)
    SPOKEN_NAME  how the voice says "symcc", default "sim see see"
    SPEED        speaking speed, default 0.9
    SYMCC_VIDEO_CACHE  where model files and audio clips are kept, default ~/.cache/symcc-video

Needs: Python 3 with Pillow and kokoro-onnx, ffmpeg, and the fonts make_video.py uses.
"""

import hashlib
import json
import math
import os
import re
import subprocess
import sys
import urllib.request
import wave
from multiprocessing import Pool


HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # no __pycache__ in docs/video
import make_video as mv  # noqa: E402
from make_video import (  # noqa: E402
    ACCENT, ACCENT_LIGHT, BORDER, CARD, CARD_DARK, DIM, DONE, LINE, MUTED, RED, REVIEW,
    RUNNING, SCOUT, TERM_TEXT, TEXT, TODO, WORKER, W,
    clamp, draw_logo, ease, font, header, mix, person, pill, ramp, terminal, text_block,
    window, wrap,
)

# ---------------------------------------------------------------- settings

VOICE = os.environ.get("VOICE", "af_heart")
SPOKEN_NAME = os.environ.get("SPOKEN_NAME", "sim see see")
SPEED = float(os.environ.get("SPEED", "0.9"))
LANG = "en-us"
# other words the voice says better when spelled differently (screen and subtitles keep the original)
SPOKEN_FIXES = {"Todo": "To do"}

CACHE = os.path.expanduser(os.environ.get("SYMCC_VIDEO_CACHE", "~/.cache/symcc-video"))
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
MODEL_FILES = ("kokoro-v1.0.onnx", "voices-v1.0.bin")

NARRATION = os.path.join(HERE, "narration.md")
OUT_DIR = os.path.join(HERE, "out")
MP4 = os.path.join(OUT_DIR, "symcc_youtube.mp4")
SRT = os.path.join(HERE, "symcc_youtube.srt")
THUMB = os.path.join(HERE, "symcc_youtube_thumbnail.png")

# Drawing happens in make_video's 1280x720 units. With S = 3 the image is 3840x2160;
# halving it gives a smooth 1920x1080 frame. (This only changes S inside this script.)
mv.S = 3
OUT_W, OUT_H = 1920, 1080
FPS = 30
LEAD_IN = 0.8     # silence at the start of each scene, before the voice
SENT_GAP = 0.35   # silence between sentences inside a scene
TAIL = 0.7        # silence at the end of each scene (with LEAD_IN: the pause between scenes)
END_HOLD = 2.5    # extra time on the last picture
LOUDNESS = -14.0  # target loudness in LUFS (YouTube plays most videos at about this level)
TRUE_PEAK = -1.5  # highest peak in dBTP, a little under -1 so the AAC sound does not clip
FADE = 0.5        # cross-fade between scenes

# ---------------------------------------------------------------- narration


def load_scenes(path=None):
    """[(title, [sentence, ...]), ...] from narration.md (or another script like it)."""
    with open(path or NARRATION, encoding="utf-8") as fh:
        text = fh.read().split("\n---")[0]
    scenes = []
    for part in re.split(r"^## Scene \d+: ", text, flags=re.M)[1:]:
        title = re.sub(r"\s*\(.*?\)\s*$", "", part.splitlines()[0]).strip()
        m = re.search(r"\*\*Narration:\*\*\s*\n(.+?)(?:\n\s*\n|$)", part, re.S)
        words = " ".join(m.group(1).split())
        scenes.append((title, re.split(r"(?<=[.!?])\s+", words)))
    return scenes


def spoken(s):
    s = re.sub(r"\bsymcc\b", SPOKEN_NAME, s, flags=re.I)
    for a, b in SPOKEN_FIXES.items():
        s = re.sub(r"\b%s\b" % re.escape(a), b, s)
    return s


# ---------------------------------------------------------------- voice

_kokoro = None


def kokoro():
    global _kokoro
    if _kokoro is None:
        try:
            from kokoro_onnx import Kokoro
        except ImportError:
            sys.exit("kokoro-onnx is missing: pip install kokoro-onnx (see docs/video/README.md)")
        os.makedirs(CACHE, exist_ok=True)
        for name in MODEL_FILES:
            path = os.path.join(CACHE, name)
            if not os.path.exists(path):
                print("downloading %s to %s ..." % (name, CACHE), flush=True)
                urllib.request.urlretrieve(MODEL_URL + name, path + ".part")
                os.replace(path + ".part", path)
        _kokoro = Kokoro(*(os.path.join(CACHE, n) for n in MODEL_FILES))
    return _kokoro


def read_wav(path):
    with wave.open(path, "rb") as w:
        return w.readframes(w.getnframes()), w.getframerate()


def write_wav(path, pcm, rate):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def say(sentence):
    """16-bit mono PCM bytes and sample rate for one sentence (kept in the cache)."""
    text = spoken(sentence)
    key = hashlib.sha1(("%s|%s|%s|%s|%s" % (MODEL_FILES[0], VOICE, SPEED, LANG, text))
                       .encode()).hexdigest()[:16]
    path = os.path.join(CACHE, "clips", key + ".wav")
    if not os.path.exists(path):
        import numpy as np
        samples, rate = kokoro().create(text, voice=VOICE, speed=SPEED, lang=LANG)
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_wav(path, pcm, rate)
    return read_wav(path)


# ---------------------------------------------------------------- timeline


def build_timeline(path=None, count=None):
    """Make (or load) the audio and work out when every scene and sentence happens.

    path is the narration file (default narration.md), count the number of scenes the
    script draws (default len(SCENE_FNS)). Returns (scenes, audio, rate). Each scene is a dict with start, dur, and cues: one
    (start, end, text) per sentence, in seconds from the scene start.
    """
    scenes, chunks, rate, start = [], [], None, 0.0
    parsed = load_scenes(path)
    count = len(SCENE_FNS) if count is None else count
    if len(parsed) != count:
        sys.exit("%s has %d scenes, the script draws %d"
                 % (os.path.basename(path or NARRATION), len(parsed), count))
    for i, (title, sentences) in enumerate(parsed):
        print("  voice: scene %d (%s)" % (i + 1, title), flush=True)
        cues, t, clip = [], LEAD_IN, []
        for k, s in enumerate(sentences):
            pcm, rate = say(s)
            if k:
                clip.append(silence(SENT_GAP, rate))
            dur = len(pcm) / 2 / rate
            cues.append((t, t + dur, s))
            clip.append(pcm)
            t += dur + SENT_GAP
        speech = b"".join(clip)
        dur = LEAD_IN + len(speech) / 2 / rate + TAIL
        if i == len(parsed) - 1:
            dur += END_HOLD
        chunks += [silence(LEAD_IN, rate), speech]
        chunks.append(silence(dur - LEAD_IN - len(speech) / 2 / rate, rate))
        scenes.append({"title": title, "start": start, "dur": dur, "cues": cues,
                       "clip": speech})
        start += dur
    return scenes, b"".join(chunks), rate


def silence(sec, rate):
    return b"\0\0" * int(round(sec * rate))


class Cues:
    """Sentence times inside a scene: s(i) start, e(i) end, at(i, f) a point inside."""

    def __init__(self, cues):
        self.c = cues

    def s(self, i):
        return self.c[min(i, len(self.c) - 1)][0]

    def e(self, i):
        return self.c[min(i, len(self.c) - 1)][1]

    def at(self, i, f):
        return self.s(i) + (self.e(i) - self.s(i)) * f


# ---------------------------------------------------------------- shared pieces


def typed(t, start, end, s):
    if t >= end:
        return s
    return s[:int(len(s) * clamp((t - start) / (end - start)))]


def task_card(c, x, y, w, tid, title, col, note=None, note_col=DIM, prog=None, h=58):
    c.rect(x, y, x + w, y + h, r=9, fill=CARD_DARK, outline=BORDER, width=1.2)
    c.rect(x, y + 8, x + 4, y + h - 8, r=2, fill=col)
    fb = font(15, bold=True)
    c.text(x + 16, y + 19, tid, fb, TEXT, "lm")
    c.text(x + 26 + c.width_of(tid, fb), y + 19, title, font(15), TEXT, "lm")
    if note:
        c.text(x + 16, y + 41, note, font(13), note_col, "lm")
    if prog is not None:
        c.rect(x + 16, y + h - 6, x + w - 14, y + h - 3, r=1.5, fill=BORDER)
        c.rect(x + 16, y + h - 6, x + 16 + (w - 30) * clamp(prog), y + h - 3, r=1.5, fill=RUNNING)


COLS4 = [("todo", TODO), ("doing", RUNNING), ("review", REVIEW), ("done", DONE)]


def board(c, x0, y0, x1, y1, cols=COLS4, title="Board", shown=None):
    """Draw an empty board; return (column x positions, column width)."""
    c.rect(x0, y0, x1, y1, r=14, fill=CARD, outline=LINE, width=1.5)
    c.text(x0 + 20, y0 + 28, title, font(20, bold=True), TEXT, "lm")
    colw = (x1 - x0 - 40) / len(cols)
    colx = [x0 + 20 + i * colw for i in range(len(cols))]
    for i, (name, col) in enumerate(cols):
        a = 1.0 if shown is None else shown[i]
        c.group(a, lambda cc, i=i, name=name, col=col: pill(
            cc, colx[i] + colw / 2, y0 + 70, name, col, w=min(110, colw - 20)))
        if i:
            c.line([(colx[i] - 1, y0 + 92), (colx[i] - 1, y1 - 20)], BORDER, 1)
    return colx, colw


def keyed(t, keys, length=0.7):
    """Smoothly follow keyframes [(time, (values...)), ...]."""
    cur = keys[0][1]
    for tk, v in keys[1:]:
        a = ramp(t, tk, length)
        if a <= 0:
            break
        cur = tuple(p + (q - p) * a for p, q in zip(cur, v))
    return cur


def board_cards(c, t, colx, colw, top, cards, row_h=68):
    """cards: [(tid, title, appear, keys[(time, (col, row))], note_fn)], note_fn(t, col) ->
    (note, note_col, prog) or None."""
    for tid, title, appear, keys, note_fn in cards:
        a = ramp(t, appear, 0.45)
        if a <= 0:
            continue
        col, row = keyed(t, keys)
        state = int(round(col))
        x = colx[0] + 8 + col * colw
        y = top + row * row_h
        info = note_fn(t, state) if note_fn else None
        note, ncol, prog = info if info else (None, DIM, None)
        c.group(a, lambda cc, x=x, y=y, tid=tid, title=title, state=state, note=note,
                ncol=ncol, prog=prog: task_card(cc, x, y, colw - 16, tid, title,
                                                COLS4[state][1], note, ncol, prog))


def box(c, x0, y0, x1, y1, col, title, sub=None, tint=0.14):
    c.rect(x0, y0, x1, y1, r=14, fill=mix(CARD, col, tint), outline=col, width=2)
    mid = (x0 + x1) / 2
    if sub:
        c.text(mid, y0 + (y1 - y0) * 0.38, title, font(24, bold=True), col, "mm")
        c.text(mid, y0 + (y1 - y0) * 0.70, sub, font(15), MUTED, "mm")
    else:
        c.text(mid, (y0 + y1) / 2, title, font(24, bold=True), col, "mm")


def cross(c, cx, cy, size, fill, width=3):
    c.line([(cx - size / 2, cy - size / 2), (cx + size / 2, cy + size / 2)], fill, width)
    c.line([(cx - size / 2, cy + size / 2), (cx + size / 2, cy - size / 2)], fill, width)


def chat_lines(c, t, x0, y0, x1, lines, who_w=58):
    """lines: [(show_time, who, text, color)] with text already typed as needed."""
    fm, fmb = font(15, mono=True), font(15, bold=True, mono=True)
    y = y0
    for start, who, s, col in lines:
        if t < start:
            continue
        a = ramp(t, start, 0.3)

        def draw(cc, who=who, s=s, col=col, y=y):
            cc.text(x0, y, who, fmb, ACCENT if who == "you" else SCOUT, "la")
            for j, ln in enumerate(wrap(s, fm, x1 - x0 - who_w - 2) or [""]):
                cc.text(x0 + who_w, y + j * 24, ln, fm, col, "la")

        c.group(a, draw)
        y += len(wrap(s, fm, x1 - x0 - who_w - 2) or [""]) * 24 + 16


def title(c, step, s):
    header(c, step, total=6)
    c.text(70, 112, s, font(34, bold=True), TEXT, "la")


# ---------------------------------------------------------------- scenes
# Each scene: draw(canvas, local_time, duration, cues)


def scene_problem(c, t, dur, q):
    title(c, 0, "Three problems with Claude Code today")
    cw, top, bot = 340, 175, 600
    xs = [70, 470, 870]
    heads = ["1  One task at a time", "2  You cannot see inside", "3  It stops when you stop"]
    subs = ["you wait", "who does what, and why?", "nothing moves while you are away"]
    for k in range(3):
        a = ramp(t, q.s(k + 1), 0.5)

        def card(cc, k=k):
            x = xs[k]
            cc.rect(x, top, x + cw, bot, r=14, fill=CARD, outline=RED, width=1.8)
            cc.text(x + 24, top + 34, heads[k], font(22, bold=True), TEXT, "lm")
            cc.text(x + 24, top + 70, subs[k], font(17), RED, "lm")
            if k == 0:
                terminal(cc, x + 24, top + 110, x + cw - 24, top + 250, "claude")
                cc.text(x + 42, top + 160, "working" + "." * (1 + int(t * 2.5) % 3),
                        font(16, mono=True), TERM_TEXT, "lm")
                prog = clamp(0.1 + 0.04 * (t - q.s(1)), 0, 0.7)
                cc.rect(x + 42, top + 215, x + cw - 42, top + 225, r=5, fill=(0x21, 0x26, 0x2D))
                cc.rect(x + 42, top + 215, x + 42 + (cw - 84) * prog, top + 225, r=5, fill=RUNNING)
                for i, s in enumerate(["fix the login bug", "add dark mode", "nicer errors"]):
                    cc.rect(x + 24, top + 275 + i * 44, x + 24 + 200, top + 311 + i * 44, r=6,
                            fill=REVIEW)
                    cc.text(x + 38, top + 293 + i * 44, s, font(16, bold=True), CARD_DARK, "lm")
                cc.text(x + 240, top + 330, "waiting...", font(17), MUTED, "lm")
            elif k == 1:
                box(cc, x + 90, top + 110, x + 250, top + 170, ACCENT, "Claude", None, tint=0.15)
                for i in range(3):
                    bx = x + 24 + i * 100
                    cc.arrow(x + 170, top + 172, bx + 46, top + 232, MUTED, width=2, dash=(6, 5))
                    box(cc, bx, top + 235, bx + 92, top + 295, WORKER, "agent", None, tint=0.1)
                    cc.text(bx + 46, top + 325, "?", font(30, bold=True), RED, "mm")
                cc.text(x + cw / 2, top + 380, "how was the work split?", font(17), MUTED, "mm")
            else:
                cc.circle(x + cw / 2, top + 190, 56, outline=MUTED, width=3)
                cc.text(x + cw / 2, top + 190, "zzz", font(34, bold=True), MUTED, "mm")
                cc.text(x + cw / 2, top + 300, "you close the laptop", font(18), MUTED, "mm")
                cc.text(x + cw / 2, top + 335, "the project stands still", font(18, bold=True),
                        RED, "mm")

        c.group(a, card)
    c.group(ramp(t, q.s(0), 0.5), lambda cc: cc.text(
        W - 70, 112, "plain Claude Code", font(19), MUTED, "ra"))


def scene_what(c, t, dur, q):
    # logo first, then the picture of the parts
    intro = 1 - ramp(t, q.s(2) - 0.2, 0.6)

    def logo(cc):
        draw_logo(cc, W / 2, 300 - 10 * (1 - ramp(t, 0.1, 0.8)), 1.0)
        cc.group(ramp(t, q.s(1), 0.5), lambda c2: pill(c2, W / 2, 430, "a plugin for Claude Code",
                                                         ACCENT, w=300))

    c.group(intro * ramp(t, 0.1, 0.7), logo)
    if intro >= 1:
        return
    c.group(1 - intro, lambda cc: title(cc, 1, "symcc in one breath"))
    # you + lead
    a_you = ramp(t, q.s(2), 0.5)

    def you_lead(cc):
        box(cc, 70, 290, 290, 400, ACCENT_LIGHT, "You", "your normal chat")
        person(cc, 105, 330, 0.45, ACCENT_LIGHT)
        cc.arrow(294, 345, 386, 345, MUTED)
        cc.text(340, 330, "chat", font(14), MUTED, "mm")
        box(cc, 390, 285, 640, 405, ACCENT, "Lead", "listens and plans", tint=0.2)

    c.group(a_you, you_lead)
    # board
    a_board = ramp(t, q.s(3), 0.5)

    def brd(cc):
        cc.arrow(644, 345, 736, 345, MUTED)
        cc.text(690, 330, "tasks", font(14), MUTED, "mm")
        colx, colw = board(cc, 740, 170, 1210, 470, COLS4[:3], "Shared board")
        span = q.e(3) - q.s(3)
        names = ["search index", "search cmd", "nicer errors"]
        for k, nm in enumerate(names):
            ap = ramp(t, q.s(3) + span * (0.25 + 0.2 * k), 0.4)
            col = ramp(t, q.e(3) + 0.2 + 0.3 * k, 0.6) if k != 1 else 0.0
            x = colx[0] + 6 + col * colw
            cc.group(ap, lambda c2, x=x, k=k, nm=nm, col=col: task_card(
                c2, x, 270 + k * 62, colw - 12, "T-%d" % (k + 1), "", COLS4[int(round(col))][1],
                nm, MUTED, None, h=54))

    c.group(a_board, brd)
    # workers
    for k in range(3):
        wx = 380 + k * 270
        a = ramp(t, q.e(3) + 0.6 + 0.3 * k, 0.5)

        def wk(cc, wx=wx, k=k):
            cc.arrow(900 - 40 + k * 40, 474, wx + 110, 528, WORKER, width=2, dash=(7, 5))
            box(cc, wx, 530, wx + 220, 610, WORKER, "Worker %d" % (k + 1), None, tint=0.12)
            cc.group(ramp(t, q.e(3) + 1.0 + 0.3 * k, 0.5), lambda c2: c2.text(
                wx + 110, 596, "own copy · own branch", font(13), MUTED, "mm"))

        c.group(a, wk)
    # your branch stays untouched
    c.group(ramp(t, q.e(3) + 1.4, 0.5), lambda cc: (
        cc.rect(70, 540, 330, 600, r=12, fill=CARD_DARK, outline=DONE, width=1.5),
        cc.check(96, 570, 16, DONE, 3),
        cc.text(118, 560, "your branch", font(16, bold=True), TEXT, "lm"),
        cc.text(118, 582, "untouched until merged", font(14), DONE, "lm")))
    # the arrows pull the logo word in: keep the word "symcc" on screen
    c.group(1 - intro, lambda cc: cc.text(W - 70, 112, "one lead · one board · many workers",
                                         font(17), MUTED, "ra"))


def workers_a(c, t, q, pill_note=True):
    ly = 520
    c.group(ramp(t, 0.2, 0.5), lambda cc: (
        cc.line([(80, ly), (1200, ly)], BORDER, 3),
        cc.text(80, ly + 26, "main", font(15, bold=True, mono=True), MUTED, "lm")))
    starts = [q.at(0, 0.2), q.at(1, 0.2), q.at(1, 0.45)]
    for k in range(3):
        x0 = 100 + k * 370
        a = ramp(t, starts[k], 0.5)
        tid = "T-%d" % (3 + k)

        def panel(cc, x0=x0, k=k, tid=tid):
            cx = x0 + 165
            cc.line([(cx, 400), (cx, ly)], WORKER, 2.5)
            cc.circle(cx, ly, 7, fill=WORKER)
            terminal(cc, x0, 180, x0 + 330, 400, "worker %d" % (k + 1))
            fm = font(14, mono=True)
            cc.text(x0 + 20, 238, "folder", font(13), DIM, "lm")
            cc.text(x0 + 20, 262, ".symcc/worktrees/" + tid, fm, TERM_TEXT, "lm")
            cc.text(x0 + 20, 300, "branch", font(13), DIM, "lm")
            cc.text(x0 + 20, 324, "symcc/" + tid, fm, WORKER, "lm")
            prog = clamp((t - starts[k]) * 0.05)
            cc.rect(x0 + 20, 366, x0 + 310, 374, r=4, fill=(0x21, 0x26, 0x2D))
            cc.rect(x0 + 20, 366, x0 + 20 + 290 * prog, 374, r=4, fill=RUNNING)

        c.group(a, panel)
    if pill_note:
        c.group(ramp(t, q.at(2, 0.3), 0.5), lambda cc: pill(
            cc, W / 2, 590, "3 workers at once (you can change it)", ACCENT, w=360))




def scene_parallel(c, t, dur, q):
    title(c, 2, "Problem 1 solved: no more waiting")
    c.group(ramp(t, 0.2, 0.5), lambda cc: cc.text(
        W - 70, 112, "tasks run side by side", font(19), MUTED, "ra"))
    workers_a(c, t, q, pill_note=False)
    c.group(ramp(t, q.s(2), 0.5), lambda cc: (
        cc.rect(W / 2 - 330, 560, W / 2 - 60, 616, r=28, fill=mix(CARD, DONE, 0.22),
                outline=DONE, width=2.5),
        cc.check(W / 2 - 282, 588, 20, DONE, 3.5),
        cc.text(W / 2 - 190, 588, "tests pass", font(22, bold=True), DONE, "lm"),
        cc.text(W / 2 - 30, 588, "then merge", font(20), MUTED, "lm")))
    c.group(ramp(t, q.s(3), 0.5), lambda cc: (
        task_card(cc, 330, 640, 300, "T-6", "search command", TODO, "waits for T-3", REVIEW, h=58),
        cc.arrow(640, 669, 760, 669, REVIEW, width=2, dash=(6, 5), head=9),
        cc.text(780, 669, "the lead orders tasks that depend on each other", font(17),
                MUTED, "lm")))


def scene_see(c, t, dur, q):
    title(c, 3, "Problem 2 solved: you can see everything")
    # one task page
    x0, y0, x1, y1 = 70, 160, 700, 640
    c.group(ramp(t, q.s(0), 0.5), lambda cc: (
        cc.rect(x0, y0, x1, y1, r=14, fill=CARD, outline=LINE, width=1.5),
        cc.text(x0 + 24, y0 + 34, "T-3", font(24, bold=True), TEXT, "lm"),
        cc.text(x0 + 90, y0 + 34, "search index", font(24), TEXT, "lm")))
    rows = [("what", "build a search index", q.at(1, 0.15)),
            ("why", "the search command needs it", q.at(1, 0.4)),
            ("files", "src/search/, tests/search/", q.at(1, 0.65)),
            ("from", "you: \"add a search command\"", q.at(1, 0.9)),
            ("tries", "2 tries, the second passed", q.at(2, 0.2)),
            ("report", "what the worker did and found", q.at(2, 0.5)),
            ("cost", "12 min, 84k tokens", q.at(2, 0.8))]
    for k, (a, b, st) in enumerate(rows):
        y = y0 + 90 + k * 54
        c.group(ramp(t, st, 0.4), lambda cc, a=a, b=b, y=y: (
            cc.text(x0 + 30, y, a, font(16, bold=True), ACCENT, "lm"),
            cc.text(x0 + 130, y, b, font(18, mono=True), TERM_TEXT, "lm")))
    # review or auto, and questions
    def modes(cc):
        for i, (name, col, line) in enumerate((
                ("Review mode", REVIEW, "open the task, approve or reject"),
                ("Auto mode", DONE, "tests pass: merged right away"))):
            y = 170 + i * 120
            cc.rect(760, y, 1210, y + 100, r=14, fill=CARD, outline=col, width=2)
            cc.text(784, y + 34, name, font(22, bold=True), col, "lm")
            cc.text(784, y + 72, line, font(17), MUTED, "lm")

    c.group(ramp(t, q.s(3), 0.5), modes)

    def ask(cc):
        cc.rect(760, 430, 1210, 600, r=14, fill=CARD, outline=REVIEW, width=2)
        cc.text(784, 462, "needs you", font(22, bold=True), REVIEW, "lm")
        task_card(cc, 784, 490, 402, "T-5", "date picker", REVIEW,
                  "question: which date format?", REVIEW, h=58)

    c.group(ramp(t, q.s(4), 0.5), ask)


def scene_scouts(c, t, dur, q):
    title(c, 4, "Problem 3 solved: it keeps going while you are away")
    x0, y0, x1, y1 = 80, 160, 640, 560

    def panel(cc):
        cc.rect(x0, y0, x1, y1, r=14, fill=CARD, outline=LINE, width=1.5)
        cc.text(x0 + 24, y0 + 30, "Board", font(18), DIM, "lm")
        cc.text(x0 + 100, y0 + 30, "Scouts", font(18, bold=True), SCOUT, "lm")
        cc.line([(x0 + 98, y0 + 48), (x0 + 166, y0 + 48)], SCOUT, 2.5)
        cc.line([(x0 + 1, y0 + 60), (x1 - 1, y0 + 60)], BORDER, 1)

    c.group(ramp(t, 0.1, 0.5), panel)
    # clock
    c.group(ramp(t, q.s(1) - 0.3, 0.5), lambda cc: (
        cc.circle(x1 - 50, y0 + 30, 18, outline=SCOUT, width=2.5),
        cc.line([(x1 - 50, y0 + 30), (x1 - 50 + 13 * math.sin(t * 1.6),
                                      y0 + 30 - 13 * math.cos(t * 1.6))], SCOUT, 2.5),
        cc.line([(x1 - 50, y0 + 30), (x1 - 50, y0 + 21)], SCOUT, 2.5)))
    scouts = [("bug hunter", "looks for bugs", "every 6 hours"),
              ("test checker", "looks for missing tests", "every day"),
              ("dependency check", "looks for old dependencies", "every week")]
    for k, (name, what, when) in enumerate(scouts):
        y = y0 + 76 + k * 86
        hi = q.at(1, 0.15 + 0.2 * k)
        due = q.at(1, 0.35) if k == 1 else 1e9
        run = q.at(1, 0.85) if k == 1 else 1e9
        fin = q.at(2, 0.3) if k == 1 else 1e9
        status = ("done", DONE) if t > fin else ("running", RUNNING) if t > run else \
            ("due now", REVIEW) if t > due else ("waiting", TODO)

        def row(cc, y=y, name=name, what=what, when=when, hi=hi, status=status, k=k):
            lit = window(t, hi, hi + 1.2)
            cc.rect(x0 + 20, y, x1 - 20, y + 76, r=10, fill=mix(CARD_DARK, SCOUT, 0.12 * lit),
                    outline=SCOUT if lit > 0.5 else BORDER, width=1.2)
            cc.text(x0 + 40, y + 24, name, font(18, bold=True), TEXT, "lm")
            cc.text(x0 + 40, y + 52, what + " · " + when, font(14), MUTED, "lm")
            pill(cc, x1 - 90, y + 38, status[0], status[1], w=100)

        c.group(ramp(t, 0.4 + 0.2 * k, 0.5), row)
    c.group(ramp(t, q.at(1, 0.5), 0.5), lambda cc: (
        cc.rect(x0 + 20, y1 - 62, x1 - 20, y1 - 18, r=10, fill=CARD_DARK, outline=SCOUT),
        cc.text((x0 + x1) / 2, y1 - 40, "read only: scouts never change your files",
                font(16, bold=True), SCOUT, "mm")))
    # lead and a small board
    c.group(ramp(t, q.s(2) - 0.3, 0.5), lambda cc: box(cc, 760, 170, 1100, 260, ACCENT, "Lead",
                                                       "turns findings into tasks", tint=0.2))
    if t > q.s(2):
        m = ease((t - q.at(2, 0.1)) / 1.4)
        c.group(ramp(t, q.s(2), 0.4), lambda cc: cc.arrow(
            x1 + 6, y0 + 175, 756, 230, SCOUT, dash=(8, 6)))
        if 0 < m < 1:
            bx = x1 + 20 + (640 - x1 + 120) * m
            by = y0 + 175 + (230 - y0 - 175) * m
            c.group(1 - ramp(m, 0.8, 0.2), lambda cc: (
                cc.rect(bx - 70, by - 46, bx + 90, by - 16, r=8, fill=CARD_DARK, outline=SCOUT),
                cc.text(bx + 10, by - 31, "no tests for search", font(13, bold=True), SCOUT, "mm")))

    def mini(cc):
        colx, colw = board(cc, 740, 300, 1200, 560, COLS4[:2], "Board")
        st = ramp(t, q.at(2, 0.8), 0.7)
        ap = ramp(t, q.at(2, 0.4), 0.4)
        cc.group(ap, lambda c2: task_card(
            c2, colx[0] + 8 + st * colw, 410, colw - 16, "T-9", "search tests",
            RUNNING if st > 0.5 else TODO, "worker 2 · running" if st > 0.5 else "from a scout",
            WORKER if st > 0.5 else SCOUT, (t - q.at(2, 0.8)) * 0.08 if st > 0.5 else None))

    c.group(ramp(t, q.at(2, 0.3), 0.5), mini)
    c.group(ramp(t, q.s(3), 0.6), lambda cc: cc.text(
        W - 70, 112 + 0, "autonomous: keeps working while you are away", font(19), MUTED, "ra"))




def scene_get(c, t, dur, q):
    last = q.s(2) - 0.2
    body = 1 - ramp(t, last, 0.6)

    def main_part(cc):
        draw_logo(cc, W / 2, 150, 0.7)
        for k, s in enumerate(("free", "open source", "MIT license")):
            cc.group(ramp(t, q.at(0, 0.45 + 0.15 * k), 0.4), lambda c2, k=k, s=s: pill(
                c2, W / 2 - 190 + k * 190, 262, s, ACCENT_LIGHT, w=160))
        cc.group(ramp(t, q.at(1, 0.1), 0.4), lambda c2: c2.text(
            W / 2, 312, "you need Claude Code and git", font(20), MUTED, "mm"))

        def install(c2):
            cmd = "claude plugin install symcc --marketplace kourgeorge/symcc"
            f = font(20, mono=True)
            tw = c2.width_of("$ " + cmd, f)
            ix0, ix1 = W / 2 - tw / 2 - 36, W / 2 + tw / 2 + 36
            terminal(c2, ix0, 345, ix1, 445, "install")
            c2.text(ix0 + 36, 406, "$ ", f, ACCENT, "lm")
            c2.text(ix0 + 36 + c2.width_of("$ ", f), 406, cmd, f, TERM_TEXT, "lm")
            c2.text(W / 2, 478, "steps: github.com/kourgeorge/symcc", font(18), MUTED, "mm")

        cc.group(ramp(t, q.at(1, 0.3), 0.5), install)
        steps = ["set your test command", "ask for something", "watch the board"]
        for k, s in enumerate(steps):
            cc.group(ramp(t, q.at(1, 0.6 + 0.12 * k), 0.4), lambda c2, k=k, s=s: (
                c2.circle(260 + k * 330, 550, 16, fill=ACCENT),
                c2.text(260 + k * 330, 550, str(k + 1), font(16, bold=True), CARD_DARK, "mm"),
                c2.text(286 + k * 330, 550, s, font(19), TEXT, "lm")))

    c.group(body, main_part)

    def end(cc):
        draw_logo(cc, W / 2, 260, 1.1)
        cc.group(ramp(t, q.s(2) + 0.2, 0.6), lambda c2: c2.text(
            W / 2, 400, "Many agents, one board.", font(40, bold=True), ACCENT, "mm"))
        cc.group(ramp(t, q.s(2) + 0.8, 0.6), lambda c2: c2.text(
            W / 2, 470, "github.com/kourgeorge/symcc", font(24, medium=True), TEXT, "mm"))

    c.group(ramp(t, last + 0.3, 0.6), end)
    c.group(ramp(t, q.s(2) + 1.6, 0.6), lambda cc: cc.text(
        W / 2, 540, "Autonomous coding that keeps working while you are away",
        font(24), MUTED, "mm"))


SCENE_FNS = [scene_problem, scene_what, scene_parallel, scene_see, scene_scouts,
             scene_get]

# ---------------------------------------------------------------- frames

_BG = None
_SCENES = None


def _init(scenes):
    global _SCENES
    _SCENES = scenes


def background():
    global _BG
    if _BG is None:
        _BG = mv.make_background()
    return _BG


def render(t):
    """The 1920x1080 frame at time t (seconds)."""
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
            q = Cues(sc["cues"])
            c.group(ease(alpha), lambda cc: SCENE_FNS[i](cc, lt, sc["dur"], q))
            break
    return img.reduce(2)


def _frame_bytes(i):
    return render(i / FPS).tobytes()


def thumbnail(path):
    img = background().copy()
    c = mv.Canvas(img)
    draw_logo(c, W / 2, 150, 1.0)
    c.text(W / 2, 300, "Run a team of coding agents", font(58, bold=True), TEXT, "mm")
    c.text(W / 2, 372, "from one chat", font(58, bold=True), ACCENT, "mm")
    colw = 250
    for k, (name, col) in enumerate(COLS4):
        x = W / 2 - 2 * colw + k * colw + 10
        pill(c, x + (colw - 20) / 2, 460, name, col, w=120)
        for r in range(2 if k < 2 else 1):
            task_card(c, x, 490 + r * 70, colw - 20, "T-%d" % (k * 2 + r + 1),
                      ["index", "errors", "search", "docs", "dark mode", "", "login fix", ""][k * 2 + r],
                      col, ["waiting", "worker 1", "needs you", "merged"][k], col)
    img.reduce(3).save(path)
    print(path)


def ffmpeg_bin():
    return mv.ffmpeg_bin()


# ---------------------------------------------------------------- subtitles


def srt_time(s):
    ms = int(round(s * 1000))
    return "%02d:%02d:%02d,%03d" % (ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000)


def split_caption(s, limit=84):
    if len(s) <= limit:
        return [s]
    mid = len(s) / 2
    cuts = [m.end() for m in re.finditer(r",\s", s)] or [m.end() for m in re.finditer(r"\s", s)]
    cut = min(cuts, key=lambda k: abs(k - mid))
    if not 0.25 * len(s) < cut < 0.75 * len(s):
        cut = min((m.end() for m in re.finditer(r"\s", s)), key=lambda k: abs(k - mid))
    return split_caption(s[:cut].strip(), limit) + split_caption(s[cut:].strip(), limit)


def write_srt(scenes, path):
    out, n = [], 0
    for sc in scenes:
        for a, b, s in sc["cues"]:
            parts = split_caption(s)
            total = sum(len(p) for p in parts)
            t = sc["start"] + a
            for p in parts:
                d = (b - a) * len(p) / total
                n += 1
                lines = "\n".join(wrap_plain(p, 42))
                out.append("%d\n%s --> %s\n%s\n" % (n, srt_time(t), srt_time(t + d), lines))
                t += d
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))
    print(path)


def wrap_plain(s, width):
    lines, cur = [], ""
    for w_ in s.split():
        if cur and len(cur) + 1 + len(w_) > width:
            lines.append(cur)
            cur = w_
        else:
            cur = (cur + " " + w_).strip()
    return lines + [cur] if cur else lines


# ---------------------------------------------------------------- build


def louder(src, dst):
    """Make the sound in src as loud as a normal YouTube video and save it to dst.

    Two passes with ffmpeg's loudnorm: the first measures, the second turns the whole
    track up by one fixed amount (linear), so the voice itself does not change."""
    target = "I=%s:TP=%s:LRA=20" % (LOUDNESS, TRUE_PEAK)
    r = subprocess.run([ffmpeg_bin(), "-hide_banner", "-nostats", "-i", src,
                        "-af", "loudnorm=%s:print_format=json" % target, "-f", "null", "-"],
                       capture_output=True, text=True)
    err = r.stderr
    m = json.loads(err[err.rindex("{"):err.rindex("}") + 1])
    measured = ("measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s"
                % (m["input_i"], m["input_tp"], m["input_lra"], m["input_thresh"],
                   m["target_offset"]))
    subprocess.run([ffmpeg_bin(), "-y", "-loglevel", "error", "-i", src,
                    "-af", "loudnorm=%s:%s:linear=true" % (target, measured),
                    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", dst], check=True)
    print("loudness: %s LUFS -> %s LUFS" % (m["input_i"], LOUDNESS), flush=True)


def build(scenes, audio, rate, mp4=None, frame=None, init=None, size=None):
    """Write the video: frame(i) gives frame i's RGB bytes in a worker process that was
    set up with init(scenes). The defaults build this script's YouTube video."""
    mp4, frame, init = mp4 or MP4, frame or _frame_bytes, init or _init
    out_w, out_h = size or (OUT_W, OUT_H)
    os.makedirs(OUT_DIR, exist_ok=True)
    raw = os.path.join(OUT_DIR, "narration_raw.wav")
    wav = os.path.join(OUT_DIR, "narration.wav")
    write_wav(raw, audio, rate)
    louder(raw, wav)
    os.remove(raw)
    total = scenes[-1]["start"] + scenes[-1]["dur"]
    n = int(math.ceil(total * FPS))
    print("video length: %d:%04.1f, %d frames" % (total // 60, total % 60, n), flush=True)
    cmd = [ffmpeg_bin(), "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (out_w, out_h),
           "-r", str(FPS), "-i", "-", "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-tune", "animation", "-crf", "18",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", str(FPS * 2),
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
           "-movflags", "+faststart", "-shortest", mp4]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(max(1, (os.cpu_count() or 2) - 1), initializer=init, initargs=(scenes,)) as pool:
        for i, data in enumerate(pool.imap(frame, range(n), chunksize=8)):
            if i % (FPS * 10) == 0:
                print("  frames %5.1fs / %.1fs" % (i / FPS, total), flush=True)
            p.stdin.write(data)
    p.stdin.close()
    if p.wait() != 0:
        sys.exit("ffmpeg failed")
    os.remove(wav)
    print(mp4)


def main(argv):
    if "--thumbnail" in argv:
        thumbnail(THUMB)
        return
    scenes, audio, rate = build_timeline()
    _init(scenes)
    if "--frame" in argv:
        t = float(argv[argv.index("--frame") + 1])
        out = "/tmp/symcc_yt_frame_%05.1f.png" % t
        render(t).save(out)
        print(out)
        return
    if "--clip" in argv:
        k = int(argv[argv.index("--clip") + 1])
        out = "/tmp/symcc_yt_scene%d.wav" % k
        write_wav(out, scenes[k - 1]["clip"], rate)
        print(out)
        return
    if "--times" in argv:
        for i, sc in enumerate(scenes):
            print("scene %d  %6.1fs  %5.1fs  %s" % (i + 1, sc["start"], sc["dur"], sc["title"]))
        return
    write_srt(scenes, SRT)
    thumbnail(THUMB)
    build(scenes, audio, rate)
    print("done")


if __name__ == "__main__":
    main(sys.argv[1:])

