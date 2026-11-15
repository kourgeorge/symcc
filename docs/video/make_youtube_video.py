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


def load_scenes():
    """[(title, [sentence, ...]), ...] from narration.md."""
    with open(NARRATION, encoding="utf-8") as fh:
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


def build_timeline():
    """Make (or load) the audio and work out when every scene and sentence happens.

    Returns (scenes, audio, rate). Each scene is a dict with start, dur, and cues: one
    (start, end, text) per sentence, in seconds from the scene start.
    """
    scenes, chunks, rate, start = [], [], None, 0.0
    parsed = load_scenes()
    if len(parsed) != len(SCENE_FNS):
        sys.exit("narration.md has %d scenes, the script draws %d" % (len(parsed), len(SCENE_FNS)))
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
    header(c, step, total=7)
    c.text(70, 112, s, font(34, bold=True), TEXT, "la")


# ---------------------------------------------------------------- scenes
# Each scene: draw(canvas, local_time, duration, cues)


def scene_problem(c, t, dur, q):
    title(c, 0, "The problem")
    x0, y0, x1, y1 = 90, 170, 600, 560
    terminal(c, x0, y0, x1, y1, "claude · ~/my-app")
    msg = "add a search command"
    lines = [(q.s(0), "you", typed(t, q.s(0) + 0.1, q.at(0, 0.45), msg), TERM_TEXT)]
    if t > q.at(0, 0.55):
        dots = "." * (1 + int(t * 2.5) % 3)
        lines.append((q.at(0, 0.55), "agent", "working on it" + dots, MUTED))
    steps = ["reading 214 files", "planning the change", "editing src/search.js",
             "editing src/cli.js", "running the tests"]
    for k, s in enumerate(steps):
        lines.append((q.at(0, 0.7) + k * 1.6, "", "  " + s, DIM))
    chat_lines(c, t, x0 + 18, y0 + 52, x1 - 10, lines)
    if t > q.at(0, 0.55):
        prog = clamp(0.04 + 0.025 * (t - q.at(0, 0.55)), 0, 0.62)
        c.rect(x0 + 20, y1 - 40, x1 - 20, y1 - 30, r=5, fill=(0x21, 0x26, 0x2D))
        c.rect(x0 + 20, y1 - 40, x0 + 20 + (x1 - x0 - 40) * prog, y1 - 30, r=5, fill=RUNNING)
        mins = int(3 + (t - q.at(0, 0.55)) * 1.5)
        c.text(x1 - 20, y1 - 56, "busy for %d min" % mins, font(14), MUTED, "rs")
    # ideas pile up beside it
    ideas = ["fix the login bug", "rename the API", "add dark mode", "tests for search",
             "update the docs", "nicer errors"]
    spots = [(690, 190), (930, 215), (720, 290), (960, 320), (700, 395), (940, 425)]
    slipped = {1, 3, 4}
    span = q.e(1) - q.s(1)
    for i, (s, (x, y)) in enumerate(zip(ideas, spots)):
        a = ramp(t, q.s(1) + span * (0.15 + 0.13 * i), 0.35)
        fall = ramp(t, q.at(2, 0.55) + 0.25 * (i % 3), 1.0) if i in slipped else 0.0

        def note(cc, s=s, x=x, y=y + fall * 30, fall=fall):
            f = font(17, bold=True)
            w = cc.width_of(s, f) + 28
            cc.rect(x + 3, y + 4, x + w + 3, y + 44, r=6, fill=(0x14, 0x16, 0x1E))
            cc.rect(x, y, x + w, y + 40, r=6, fill=REVIEW)
            cc.text(x + 14, y + 20, s, f, CARD_DARK, "lm")
            if fall > 0.3:
                cc.line([(x + 8, y + 20), (x + w - 8, y + 20)], RED, 2.5)

        c.group(a * (1 - 0.65 * fall), note)
    # interrupt?
    c.group(window(t, q.s(2), q.at(2, 0.5)), lambda cc: (
        cc.rect(240, 578, 450, 614, r=18, fill=mix(CARD, RED, 0.25), outline=RED, width=1.5),
        cc.text(345, 596, "interrupt it?", font(17, bold=True), RED, "mm")))
    c.group(ramp(t, q.at(2, 0.8), 0.5), lambda cc: cc.text(
        690, 530, "One thing at a time. Ideas slip.", font(24, bold=True), RED, "la"))


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
    c.group(1 - intro, lambda cc: title(cc, 1, "What symcc is"))
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
            ap = ramp(t, q.s(3) + span * (0.45 + 0.15 * k), 0.4)
            col = ramp(t, q.at(4, 0.4) + 0.3 * k, 0.6) if k != 1 else 0.0
            x = colx[0] + 6 + col * colw
            cc.group(ap, lambda c2, x=x, k=k, nm=nm, col=col: task_card(
                c2, x, 270 + k * 62, colw - 12, "T-%d" % (k + 1), "", COLS4[int(round(col))][1],
                nm, MUTED, None, h=54))

    c.group(a_board, brd)
    # workers
    for k in range(3):
        wx = 380 + k * 270
        a = ramp(t, q.s(4) + 0.3 * k, 0.5)

        def wk(cc, wx=wx, k=k):
            cc.arrow(900 - 40 + k * 40, 474, wx + 110, 528, WORKER, width=2, dash=(7, 5))
            box(cc, wx, 530, wx + 220, 610, WORKER, "Worker %d" % (k + 1), None, tint=0.12)
            cc.group(ramp(t, q.s(5) + 0.3 * k, 0.5), lambda c2: c2.text(
                wx + 110, 596, "own copy · own branch", font(13), MUTED, "mm"))

        c.group(a, wk)
    # your branch stays untouched
    c.group(ramp(t, q.at(5, 0.45), 0.5), lambda cc: (
        cc.rect(70, 540, 330, 600, r=12, fill=CARD_DARK, outline=DONE, width=1.5),
        cc.check(96, 570, 16, DONE, 3),
        cc.text(118, 560, "your branch", font(16, bold=True), TEXT, "lm"),
        cc.text(118, 582, "untouched until merged", font(14), DONE, "lm")))
    # the arrows pull the logo word in: keep the word "symcc" on screen
    c.group(1 - intro, lambda cc: cc.text(W - 70, 112, "one lead · one board · many workers",
                                         font(17), MUTED, "ra"))
    # focused context per worker, and the lead as project manager
    c.group(ramp(t, q.s(6), 0.5), lambda cc: cc.text(
        W / 2, 660, "each worker gets only what it needs: what, why, which files, how to check",
        font(18), WORKER, "mm"))
    c.group(ramp(t, q.s(9), 0.5), lambda cc: cc.text(
        W / 2, 230, "the lead keeps the plan: priorities, order, updates, retries",
        font(18, bold=True), ACCENT, "mm"))


def scene_board(c, t, dur, q):
    title(c, 2, "The board")
    x0, y0, x1, y1 = 90, 160, 1190, 620
    span = q.e(1) - q.s(1)
    shown = [ramp(t, q.s(1) + span * f, 0.35) for f in (0.3, 0.5, 0.68, 0.84)]
    c.group(ramp(t, 0.1, 0.6), lambda cc: board(cc, x0, y0, x1, y1, shown=shown))
    colx, colw = (x0 + 20 + i * (x1 - x0 - 40) / 4 for i in range(4)), (x1 - x0 - 40) / 4
    colx = list(colx)
    top = y0 + 108
    s2 = q.s(2)
    t5_wait = q.s(4)
    t7_note = q.s(5)
    t8_go = q.at(6, 0.4)
    t6_go = q.e(8) - 0.2

    def note_t5(tt, st):
        if st == 0 and tt > t5_wait:
            return ("waits for T-3", REVIEW, None)
        return ("waiting", DIM, None)

    def note_t7(tt, st):
        if tt > t7_note:
            return ("same files as T-4: after it", REVIEW, None)
        return ("waiting", DIM, None)

    def doing(start):
        return lambda tt, st: ("worker · running", WORKER, (tt - start) * 0.06) if st == 1 else None

    cards = [
        ("T-1", "login fix", s2, [(0, (3, 0))], lambda tt, st: ("tests passed · merged", DONE, None)),
        ("T-2", "rename API", s2 + 0.2, [(0, (2, 0))], lambda tt, st: ("needs you: approve?", REVIEW, None)),
        ("T-3", "search index", s2 + 0.4, [(0, (1, 0))], doing(s2 - 3)),
        ("T-4", "dark mode", s2 + 0.6, [(0, (1, 1))], doing(s2 - 6)),
        ("T-5", "search command", s2 + 0.8, [(0, (0, 0))], note_t5),
        ("T-6", "update docs", s2 + 1.0, [(0, (0, 1)), (t6_go, (1, 3))], doing(t6_go)),
        ("T-7", "theme colors", s2 + 1.2, [(0, (0, 2)), (t6_go + 0.2, (0, 1))], note_t7),
        ("T-8", "export CSV", s2 + 1.4, [(0, (0, 3)), (t8_go, (1, 2))],
         lambda tt, st: doing(t8_go)(tt, st) or ("waiting", DIM, None)),
    ]
    board_cards(c, t, colx, colw, top, cards)
    # T-5 waits for T-3: dashed arrow
    c.group(window(t, t5_wait, q.s(6)), lambda cc: cc.arrow(
        colx[0] + colw - 8, top + 29, colx[1] + 8, top + 29, REVIEW, width=2, dash=(6, 5), head=9))
    # T-7 and T-4 change the same files
    c.group(window(t, t7_note, q.s(6) + 0.2), lambda cc: cc.arrow(
        colx[0] + colw - 8, top + 2 * 68 + 29, colx[1] + 8, top + 68 + 40, REVIEW, width=2,
        dash=(6, 5), head=9))
    # "do task six first"
    msg = "do T-6 first"

    def bubble(cc):
        bx0, by0 = 880, 520
        cc.rect(bx0, by0, bx0 + 290, by0 + 50, r=14, fill=(0x13, 0x16, 0x1E), outline=ACCENT, width=1.5)
        cc.text(bx0 + 18, by0 + 25, "you", font(16, bold=True, mono=True), ACCENT, "lm")
        cc.text(bx0 + 70, by0 + 25, typed(t, q.s(8), q.at(8, 0.85), msg),
                font(16, mono=True), TERM_TEXT, "lm")

    c.group(window(t, q.s(7), dur + 1), bubble)

    def trace(cc):
        cc.rect(240, 636, 1040, 700, r=12, fill=CARD_DARK, outline=ACCENT, width=1.5)
        cc.text(262, 656, "T-3 search index", font(16, bold=True), TEXT, "lm")
        cc.text(262, 682, "from: owner, \"add a search command...\"", font(15), MUTED, "lm")
        cc.text(1018, 656, "2 tries · worker report", font(15), MUTED, "rm")
        cc.text(1018, 682, "time and tokens in all", font(15), MUTED, "rm")

    c.group(ramp(t, q.s(11), 0.5), trace)


def scene_workers(c, t, dur, q):
    title(c, 3, "Workers")
    phases = [q.s(0), q.s(3), q.s(5), q.s(7), q.s(10), dur + 5]
    subtitles = ["each in its own folder", "allowed files", "tests before every merge",
                 "how much you trust it", "questions wait for you"]
    for i in range(5):
        a = window(t, phases[i] - (0 if i == 0 else 0.15), phases[i + 1] + 0.15, fade=0.45)
        if a <= 0:
            continue
        c.group(a, lambda cc, i=i: (
            cc.text(W - 70, 112, subtitles[i], font(19), MUTED, "ra"),
            [workers_a, workers_b, workers_c, workers_d, workers_e][i](cc, t, q)))


def workers_a(c, t, q):
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
    c.group(ramp(t, q.at(2, 0.3), 0.5), lambda cc: pill(
        cc, W / 2, 590, "3 workers at once (you can change it)", ACCENT, w=360))


def workers_b(c, t, q):
    def task(cc):
        cc.rect(110, 180, 560, 470, r=14, fill=CARD, outline=LINE, width=1.5)
        cc.text(134, 214, "T-3", font(20, bold=True), TEXT, "lm")
        cc.text(180, 214, "search index", font(20), TEXT, "lm")
        cc.text(134, 262, "may change:", font(16), MUTED, "lm")
        for k, f in enumerate(("src/search/", "tests/search/")):
            cc.rect(134, 288 + k * 48, 420, 324 + k * 48, r=8, fill=CARD_DARK, outline=BORDER)
            cc.text(150, 306 + k * 48, f, font(16, mono=True), TERM_TEXT, "lm")

    c.group(ramp(t, q.s(3), 0.5), task)
    c.group(ramp(t, q.at(3, 0.5), 0.5), lambda cc: cc.text(
        660, 200, "the worker changed:", font(18, bold=True), TEXT, "lm"))
    rows = [("src/search/index.js", True, q.at(3, 0.6)),
            ("tests/search/index.test.js", True, q.at(3, 0.8)),
            ("src/app/config.js", False, q.at(4, 0.25))]
    for k, (f, ok, st) in enumerate(rows):
        y = 240 + k * 58

        def row(cc, f=f, ok=ok, y=y):
            col = DONE if ok else RED
            cc.rect(660, y, 1170, y + 44, r=8, fill=CARD_DARK, outline=col if not ok else BORDER)
            cc.text(680, y + 22, f, font(16, mono=True), TERM_TEXT, "lm")
            if ok:
                cc.check(1140, y + 22, 16, DONE, 3)
            else:
                cross(cc, 1140, y + 22, 14, RED, 3)
                cc.text(1118, y + 22, "not on the list", font(14), RED, "rm")

        c.group(ramp(t, st, 0.4), row)
    c.group(ramp(t, q.at(4, 0.65), 0.5), lambda cc: (
        cc.rect(660, 440, 900, 490, r=25, fill=mix(CARD, RED, 0.25), outline=RED, width=2),
        cc.text(780, 465, "not merged", font(20, bold=True), RED, "mm")))


def workers_c(c, t, q):
    x0, y0, x1, y1 = 200, 180, 1080, 480
    c.group(ramp(t, q.s(5), 0.5), lambda cc: terminal(cc, x0, y0, x1, y1, "tests"))
    lines = [(q.at(5, 0.15), "worker 1", "run your tests before the merge", MUTED),
             (q.at(5, 0.55), "tests", "41 passed, 1 failed: search finds nothing", RED),
             (q.at(6, 0.3), "worker 4", "reads the error, fixes it, tries again", WORKER),
             (q.at(6, 0.75), "tests", "42 passed", DONE)]
    if t > q.s(5):
        chat_lines(c, t, x0 + 24, y0 + 56, x1 - 20, lines, who_w=100)
    c.group(ramp(t, q.at(6, 0.8), 0.5), lambda cc: (
        cc.rect(W / 2 - 120, 520, W / 2 + 120, 576, r=28, fill=mix(CARD, DONE, 0.22),
                outline=DONE, width=2.5),
        cc.check(W / 2 - 72, 548, 20, DONE, 3.5),
        cc.text(W / 2 + 14, 548, "tests pass", font(22, bold=True), DONE, "mm")))


def workers_d(c, t, q):
    def card(cc, x0, col, name, active):
        cc.rect(x0, 180, x0 + 500, 560, r=16, fill=CARD, outline=col if active else LINE, width=2)
        cc.text(x0 + 250, 220, name, font(28, bold=True), col, "mm")

    a8 = t > q.s(8)
    a9 = t > q.s(9)
    c.group(ramp(t, q.s(7), 0.5), lambda cc: (card(cc, 110, DONE, "Auto mode", a8),
                                              card(cc, 670, REVIEW, "Review mode", a9)))

    def auto(cc):
        text_block(cc, 360, 260, "tests pass: merged right away", font(18), MUTED, 420, 26, "ma")
        m = ramp(t, q.at(8, 0.4), 1.0)
        cc.line([(150, 470), (570, 470)], BORDER, 3)
        cc.text(150, 496, "main", font(14, bold=True, mono=True), MUTED, "lm")
        y = 330 + m * 112
        task_card(cc, 250, y - 29, 220, "T-3", "search index", DONE if m > 0.9 else RUNNING,
                  "merged" if m > 0.9 else "tests pass", DONE)
        if m > 0.9:
            cc.circle(360, 470, 8, fill=DONE)

    c.group(ramp(t, q.s(8), 0.5), auto)

    def review(cc):
        x0 = 710
        cc.rect(x0, 260, x0 + 420, 400, r=10, fill=CARD_DARK, outline=BORDER)
        fm = font(15, mono=True)
        diff = [("  def search(q):", MUTED), ("-     return []", RED),
                ("+     return index.find(q)", DONE), ("+ # search, finally", DONE)]
        for k, (ln, col) in enumerate(diff):
            cc.text(x0 + 16, 286 + k * 30, ln, fm, col, "lm")
        ap = t > q.at(9, 0.5)
        cc.rect(x0, 420, x0 + 190, 470, r=25, fill=mix(CARD, DONE, 0.35 if ap else 0.12),
                outline=DONE, width=2.5 if ap else 1.5)
        cc.text(x0 + 95, 445, "approve", font(20, bold=True), DONE, "mm")
        rj = t > q.at(9, 0.72)
        cc.rect(x0 + 230, 420, x0 + 420, 470, r=25, fill=mix(CARD, RED, 0.3 if rj else 0.1),
                outline=RED, width=2.5 if rj else 1.5)
        cc.text(x0 + 325, 445, "reject", font(20, bold=True), RED, "mm")
        cc.group(ramp(t, q.at(9, 0.82), 0.4), lambda c2: c2.text(
            x0 + 210, 510, "reason: \"please add a test\"", font(16), MUTED, "mm"))

    c.group(ramp(t, q.s(9), 0.5), review)


def workers_e(c, t, q):
    def lists(cc):
        cc.rect(110, 180, 600, 520, r=14, fill=CARD, outline=REVIEW, width=2)
        cc.text(134, 214, "needs you", font(22, bold=True), REVIEW, "lm")
        cc.rect(680, 180, 1170, 520, r=14, fill=CARD, outline=LINE, width=1.5)
        cc.text(704, 214, "doing", font(22, bold=True), RUNNING, "lm")
        task_card(cc, 704, 330, 440, "T-4", "dark mode", RUNNING, "worker 2 · running", WORKER, 0.5)

    c.group(ramp(t, q.s(10), 0.5), lists)
    go = q.at(10, 0.3)
    back = q.at(11, 0.7)
    x, y = keyed(t, [(0, (704, 250)), (go, (134, 250)), (back, (704, 410))], 0.9)
    asking = go + 0.5 < t < back + 0.2
    c.group(ramp(t, q.s(10) + 0.2, 0.5), lambda cc: task_card(
        cc, x, y, 440, "T-5", "date picker", REVIEW if asking else RUNNING,
        "question: which date format?" if asking else
        ("going on" if t > back else "worker 3 · running"), REVIEW if asking else WORKER))
    c.group(ramp(t, q.s(11), 0.4), lambda cc: (
        cc.rect(134, 340, 576, 390, r=14, fill=(0x13, 0x16, 0x1E), outline=ACCENT, width=1.5),
        cc.text(152, 365, "you", font(16, bold=True, mono=True), ACCENT, "lm"),
        cc.text(204, 365, typed(t, q.s(11) + 0.1, q.at(11, 0.55), "use dates like 2026-11-15"),
                font(16, mono=True), TERM_TEXT, "lm")))


def scene_scouts(c, t, dur, q):
    title(c, 4, "Scouts")
    x0, y0, x1, y1 = 80, 160, 640, 560

    def panel(cc):
        cc.rect(x0, y0, x1, y1, r=14, fill=CARD, outline=LINE, width=1.5)
        cc.text(x0 + 24, y0 + 30, "Board", font(18), DIM, "lm")
        cc.text(x0 + 100, y0 + 30, "Scouts", font(18, bold=True), SCOUT, "lm")
        cc.line([(x0 + 98, y0 + 48), (x0 + 166, y0 + 48)], SCOUT, 2.5)
        cc.line([(x0 + 1, y0 + 60), (x1 - 1, y0 + 60)], BORDER, 1)

    c.group(ramp(t, 0.1, 0.5), panel)
    # clock
    c.group(ramp(t, q.s(1), 0.5), lambda cc: (
        cc.circle(x1 - 50, y0 + 30, 18, outline=SCOUT, width=2.5),
        cc.line([(x1 - 50, y0 + 30), (x1 - 50 + 13 * math.sin(t * 1.6),
                                      y0 + 30 - 13 * math.cos(t * 1.6))], SCOUT, 2.5),
        cc.line([(x1 - 50, y0 + 30), (x1 - 50, y0 + 21)], SCOUT, 2.5)))
    scouts = [("bug hunter", "looks for bugs", "every 6 hours"),
              ("test checker", "looks for missing tests", "every day"),
              ("dependency check", "looks for old dependencies", "every week")]
    for k, (name, what, when) in enumerate(scouts):
        y = y0 + 76 + k * 86
        hi = q.at(2, 0.25 + 0.25 * k)
        due = q.at(1, 0.6) if k == 1 else 1e9
        run = q.at(2, 0.9) if k == 1 else 1e9
        fin = q.at(4, 0.3) if k == 1 else 1e9
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
    c.group(ramp(t, q.s(3), 0.5), lambda cc: (
        cc.rect(x0 + 20, y1 - 62, x1 - 20, y1 - 18, r=10, fill=CARD_DARK, outline=SCOUT),
        cc.text((x0 + x1) / 2, y1 - 40, "read only: scouts never change your files",
                font(16, bold=True), SCOUT, "mm")))
    # lead and a small board
    c.group(ramp(t, q.s(4) - 0.3, 0.5), lambda cc: box(cc, 760, 170, 1100, 260, ACCENT, "Lead",
                                                       "turns findings into tasks", tint=0.2))
    if t > q.s(4):
        m = ease((t - q.at(4, 0.3)) / 1.4)
        c.group(ramp(t, q.s(4), 0.4), lambda cc: cc.arrow(
            x1 + 6, y0 + 175, 756, 230, SCOUT, dash=(8, 6)))
        if 0 < m < 1:
            bx = x1 + 20 + (640 - x1 + 120) * m
            by = y0 + 175 + (230 - y0 - 175) * m
            c.group(1 - ramp(m, 0.8, 0.2), lambda cc: (
                cc.rect(bx - 70, by - 46, bx + 90, by - 16, r=8, fill=CARD_DARK, outline=SCOUT),
                cc.text(bx + 10, by - 31, "no tests for search", font(13, bold=True), SCOUT, "mm")))

    def mini(cc):
        colx, colw = board(cc, 740, 300, 1200, 560, COLS4[:2], "Board")
        st = ramp(t, q.at(5, 0.6), 0.7)
        ap = ramp(t, q.at(5, 0.15), 0.4)
        cc.group(ap, lambda c2: task_card(
            c2, colx[0] + 8 + st * colw, 410, colw - 16, "T-9", "search tests",
            RUNNING if st > 0.5 else TODO, "worker 2 · running" if st > 0.5 else "from a scout",
            WORKER if st > 0.5 else SCOUT, (t - q.at(5, 0.6)) * 0.08 if st > 0.5 else None))

    c.group(ramp(t, q.s(5) - 0.2, 0.5), mini)
    c.group(ramp(t, q.at(6, 0.3), 0.6), lambda cc: cc.text(
        W - 70, 112, "autonomous: keeps working while you are away", font(19), MUTED, "ra"))


def scene_request(c, t, dur, q):
    title(c, 5, "One request, start to merge")
    x0, y0, x1, y1 = 50, 160, 450, 610
    terminal(c, x0, y0, x1, y1, "claude · ~/my-app")
    msg = "add a search command, and make the errors friendlier"
    s_app = q.at(9, 0.6)
    lines = [(q.s(1), "you", typed(t, q.s(1) + 0.1, q.e(1), msg), TERM_TEXT),
             (q.s(2), "lead", "Making 3 tasks: T-1, T-2, T-3.", MUTED),
             (q.s(6), "lead", "Starting T-1 and T-3. T-2 waits for T-1.", MUTED),
             (q.s(8), "lead", "T-1 is ready for review.", REVIEW),
             (s_app, "lead", "You approved T-1 on the board.", MUTED),
             (q.at(10, 0.2), "lead", "T-1 merged. Starting T-2.", DONE)]
    chat_lines(c, t, x0 + 18, y0 + 52, x1 - 10, lines)
    bx0, by0, bx1, by1 = 480, 160, 1230, 610
    colx, colw = board(c, bx0, by0, bx1, by1)
    top = by0 + 108
    go = q.at(6, 0.35)
    rev = q.at(8, 0.4)
    merge = q.at(10, 0.15)
    t2go = q.at(10, 0.6)

    def n1(tt, st):
        return [("waiting", DIM, None), ("worker 1" if tt < q.at(7, 0.5) else "tests running...",
                                         WORKER if tt < q.at(7, 0.5) else REVIEW, (tt - go) * 0.12),
                ("needs you", REVIEW, None), ("merged", DONE, None)][st]

    def n2(tt, st):
        return ("waits for T-1", REVIEW, None) if st == 0 else ("worker 2", WORKER, (tt - t2go) * 0.1)

    def n3(tt, st):
        return ("waiting", DIM, None) if st == 0 else (
            "worker 3" if tt < q.at(7, 0.6) else "tests running...",
            WORKER if tt < q.at(7, 0.6) else REVIEW, (tt - go) * 0.09)

    cards = [("T-1", "index", q.s(3), [(0, (0, 0)), (go, (1, 0)), (rev, (2, 0)), (merge, (3, 0))], n1),
             ("T-2", "command", q.s(4), [(0, (0, 1)), (t2go, (1, 0))], n2),
             ("T-3", "errors", q.s(5), [(0, (0, 2)), (go + 0.2, (1, 1))], n3)]
    board_cards(c, t, colx, colw, top, cards)

    def diff(cc):
        dx0, dy0 = 560, 300
        cc.rect(dx0, dy0, dx0 + 600, dy0 + 230, r=12, fill=CARD_DARK, outline=REVIEW, width=2)
        cc.text(dx0 + 20, dy0 + 28, "T-1 search index: changes", font(17, bold=True), REVIEW, "lm")
        fm = font(15, mono=True)
        diff_lines = [("+ def build_index(files):", DONE), ("+     words = read_words(files)", DONE),
                      ("+     return Index(words)", DONE), ("  tests: 12 passed", MUTED)]
        for k, (ln, col) in enumerate(diff_lines):
            cc.text(dx0 + 20, dy0 + 72 + k * 34, ln, fm, col, "lm")
        ap = t > s_app
        cc.rect(dx0 + 20, dy0 + 172, dx0 + 190, dy0 + 208, r=18, fill=mix(CARD_DARK, DONE, 0.4 if ap else 0.12),
                outline=DONE, width=2.5 if ap else 1.5)
        cc.text(dx0 + 105, dy0 + 190, "approve", font(17, bold=True), DONE, "mm")
        cc.rect(dx0 + 210, dy0 + 172, dx0 + 380, dy0 + 208, r=18, fill=mix(CARD_DARK, RED, 0.1),
                outline=RED, width=1.5)
        cc.text(dx0 + 295, dy0 + 190, "reject", font(17, bold=True), RED, "mm")

    c.group(window(t, q.s(9) + 0.1, merge, fade=0.4), diff)
    c.group(ramp(t, q.s(11), 0.5), lambda cc: cc.text(
        bx1, 112, "talk to the lead, approve on the board", font(20, bold=True), ACCENT, "ra"))


def scene_get(c, t, dur, q):
    last = q.s(4) - 0.2
    body = 1 - ramp(t, last, 0.6)

    def main_part(cc):
        draw_logo(cc, W / 2, 150, 0.7)
        for k, s in enumerate(("free", "open source", "MIT license")):
            cc.group(ramp(t, q.at(0, 0.15 + 0.25 * k), 0.4), lambda c2, k=k, s=s: pill(
                c2, W / 2 - 190 + k * 190, 262, s, ACCENT_LIGHT, w=160))
        cc.group(ramp(t, q.at(1, 0.2), 0.4), lambda c2: c2.text(
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

        cc.group(ramp(t, q.at(2, 0.1), 0.5), install)
        steps = ["set your test command", "ask for something", "watch the board"]
        for k, s in enumerate(steps):
            cc.group(ramp(t, q.at(3, 0.05 + 0.32 * k), 0.4), lambda c2, k=k, s=s: (
                c2.circle(260 + k * 330, 550, 16, fill=ACCENT),
                c2.text(260 + k * 330, 550, str(k + 1), font(16, bold=True), CARD_DARK, "mm"),
                c2.text(286 + k * 330, 550, s, font(19), TEXT, "lm")))

    c.group(body, main_part)

    def end(cc):
        draw_logo(cc, W / 2, 260, 1.1)
        cc.group(ramp(t, q.s(5), 0.6), lambda c2: c2.text(
            W / 2, 400, "Many agents, one board.", font(40, bold=True), ACCENT, "mm"))
        cc.group(ramp(t, q.s(5) + 0.6, 0.6), lambda c2: c2.text(
            W / 2, 470, "github.com/kourgeorge/symcc", font(24, medium=True), TEXT, "mm"))

    c.group(ramp(t, last + 0.3, 0.6), end)
    c.group(ramp(t, q.s(6), 0.6), lambda cc: cc.text(
        W / 2, 540, "Autonomous coding that keeps working while you are away",
        font(24), MUTED, "mm"))


SCENE_FNS = [scene_problem, scene_what, scene_board, scene_workers, scene_scouts,
             scene_request, scene_get]

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


def build(scenes, audio, rate):
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
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (OUT_W, OUT_H),
           "-r", str(FPS), "-i", "-", "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-tune", "animation", "-crf", "18",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", str(FPS * 2),
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
           "-movflags", "+faststart", "-shortest", MP4]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(max(1, (os.cpu_count() or 2) - 1), initializer=_init, initargs=(scenes,)) as pool:
        for i, frame in enumerate(pool.imap(_frame_bytes, range(n), chunksize=8)):
            if i % (FPS * 10) == 0:
                print("  frames %5.1fs / %.1fs" % (i / FPS, total), flush=True)
            p.stdin.write(frame)
    p.stdin.close()
    if p.wait() != 0:
        sys.exit("ffmpeg failed")
    os.remove(wav)
    print(MP4)


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
