#!/usr/bin/env python3
"""Build the second manuscript-style short: many hands first, then the holes and the scouts.

The story (docs/video/organization_narration.md): one agent makes you wait; the owner asks the
lead for a feature; the lead splits it into tasks that workers build side by side; every
change leaves holes; scouts find them and turn them into tasks; workers close them; every
task page keeps where its change came from.

It is make_scouts_video.py with other scenes: the parchment, the border, the notes, seals,
stamps, threads, cracks, the robot, the captions, the voice, the timing and the encoding
all come from there (and from make_youtube_video.py). Only the scene functions and the
thumbnail are new.

Writes:
    docs/video/out/symcc_organization.mp4          1080x1920, 30 fps, H.264 + AAC (not committed)
    docs/video/symcc_organization.srt              subtitles
    docs/video/symcc_organization_thumbnail.png    1080x1920 thumbnail

Usage (the same options as make_scouts_video.py):
    python docs/video/make_organization_video.py             # build everything
    python docs/video/make_organization_video.py --times     # when each scene starts, and words
    python docs/video/make_organization_video.py --frame 12  # save only the frame at 12 s to /tmp
    python docs/video/make_organization_video.py --clip 2    # save scene 2's audio to /tmp
    python docs/video/make_organization_video.py --thumbnail # only the thumbnail
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # no __pycache__ in docs/video
import make_scouts_video as sv  # noqa: E402
from make_scouts_video import (  # noqa: E402
    BLUE, GOLD, GOLD_DARK, GREEN, INK, INK_SOFT, PAPER, PAPER_EDGE, PARCH, PARCH_DARK,
    PASS_GREEN, RED, W, banner, chat_scroll, crack, crack_points, drop_cap, fit, font, heading,
    hourglass, lines_in, magnifier, robot, seal, sheet, stamp, thread, underline, x_mark)
from make_video import clamp, ease, mix, ramp, wrap  # noqa: E402

# ---------------------------------------------------------------- the real tasks shown
# All from this project's own board (.symcc/board.json), 16 November 2026.

ASK = ("today all tasks are the same in the sense that they require merge at the end, "
       "but sometimes there are exploratory like tasks … and may not require merge to "
       "the branch")                               # the owner's words for T-253
SPLIT = [("T-253", "1 of 3", "a task kind that skips the merge", None),
         ("T-257", "2 of 3", "the Answer section and its buttons", "after T-253"),
         ("T-258", "3 of 3", "stats, the lead’s rules, docs", "after T-257")]
# T-253, T-256 and T-259 were built side by side and merged within 11 minutes of each
# other; T-256 failed its tests on tries 1 to 6 and passed on try 7.
BUILD = [("T-253", "investigation tasks, 1 of 3"),
         ("T-256", "arrows stop at the list ends"),
         ("T-259", "show the more-time question")]
# The holes left by the investigation feature, the scout that found each, and the fix.
FOUND = [("T-263", "Ask more keeps its own question", "test-gaps", GREEN,
          "found in T-257’s change"),
         ("T-264", "a switch of kind never deletes work", "gaps-bot", BLUE,
          "found in T-253’s change"),
         ("T-266", "a refused change never wipes a folder", "recent-changes", RED,
          "found in T-264’s own fix")]
DONE, BY_SCOUTS = 275, 65                         # tasks done, of them found by scouts


# ---------------------------------------------------------------- shared pieces


def lane(c, y, tid, title, folder_shown, prog, status, status_col, ang=0.0, key=None):
    """A worker's lane: a small robot beside its task note, its own folder, a progress bar
    (prog 0 to 1, or None) and a status line."""
    def body(cc, x, yy):
        cc.text(x + 24, yy + 30, tid, font("bold", 32), RED, "lm")
        cc.text(x + 136, yy + 30, title, fit("book", 28, title, 470), INK, "lm")
        if folder_shown:
            cc.text(x + 24, yy + 74, "own copy: .symcc/worktrees/" + tid, font("mono", 21),
                    INK_SOFT, "lm")

    sheet(c, 610, y, 640, 150, ang, body, key=("lane", tid, title, folder_shown, ang, key),
          pin_dx=290)
    if prog is not None:
        c.rect(316, y + 26, 680, y + 34, r=3, fill=PARCH_DARK)
        c.rect(316, y + 26, 316 + 364 * clamp(prog), y + 34, r=3, fill=GREEN)
    if status:
        c.text(316, y + 54, status, font("italic", 25), status_col, "lm")


def worker(c, x, y, t, mood="happy"):
    robot(c, x, y, 0.55, mood, t)


def hole_note(c, cx, cy, s, a, ang=-3):
    """A torn red-ink note naming a hole."""
    def body(cc, x, yy):
        lines_in(cc, x + 22, yy + 26, 296, [(s, "italic", 33, RED)], gap=0)

    c.group(a, lambda cc: sheet(cc, cx, cy, 340, 150, ang, body, key=("hole", s),
                                fill=mix(PAPER, (240, 200, 190), 0.35), pin=INK_SOFT))


# the three cracks of scene 4 (and how they heal in scene 6)
CRACKS = [crack_points(21, (470, 500), (640, 580), n=10, jitter=14, at=(3, 7)),
          crack_points(23, (470, 720), (640, 810), n=10, jitter=14, at=(4, 8)),
          crack_points(25, (470, 1190), (640, 1290), n=10, jitter=14, at=(3, 7))]


# the same cracks, lower on the page, for the scouts to search in scene 5
SEARCH = [([(x + 80, y + 250 - 60 * k) for x, y in pts],
           [[(x + 80, y + 250 - 60 * k) for x, y in br] for br in brs])
          for k, (pts, brs) in enumerate(CRACKS)]


# ---------------------------------------------------------------- scenes
# Each scene: draw(canvas, local_time, duration, cues)


WAITING = ["fix the bug", "add a test", "update the docs", "the new feature", "a cleanup"]


def scene_alone(c, t, dur, q):
    heading(c, "Of the Lone Hand", ramp(t, 0.0, 0.5))
    c.group(ramp(t, 0.1, 0.5), lambda cc: (
        drop_cap(cc, 150, 320, 190, "O", "bold"),
        cc.text(366, 440, "ne agent,", fit("goth", 110, "ne agent,", 580), INK, "ls"),
        cc.text(370, 500, "one task at a time.", font("italic", 44), INK_SOFT, "ls")))
    # the one agent and the note it works on
    c.group(ramp(t, 0.3, 0.4), lambda cc: (
        sheet(cc, 340, 1250, 380, 130, -1.5, lambda c2, x, y: (
            c2.text(x + 24, y + 36, "working on:", font("italic", 24), INK_SOFT, "lm"),
            c2.text(x + 24, y + 82, WAITING[0], font("book", 34), INK, "lm")), key="alone-now"),
        cc.rect(170, 1340, 510, 1350, r=4, fill=PARCH_DARK),
        cc.rect(170, 1340, 170 + 340 * clamp(t / max(1.0, dur)) * 0.35, 1350, r=4, fill=GREEN)))
    robot(c, 330, 1010, 1.05, "worried" if t > q.s(1) else "think", t)
    hourglass(c, 330, 690, 3.0, t)
    # the line of tasks waiting their turn
    for k, s in enumerate(WAITING[1:]):
        y = 650 + k * 170
        a = ramp(t, q.at(0, 0.3 + 0.12 * k), 0.4)
        c.group(a * 0.85, lambda cc, s=s, y=y, k=k: sheet(
            cc, 760, y, 330, 120, (2, -1.5, 1, -2)[k], lambda c2, x, yy: (
                c2.text(x + 22, yy + 34, "waiting", font("italic", 22), INK_SOFT, "lm"),
                c2.text(x + 22, yy + 78, s, font("book", 30), INK_SOFT, "lm")),
            key=("wait", k), fill=mix(PAPER, PARCH_DARK, 0.55), pin=INK_SOFT))
    c.group(ramp(t, q.at(1, 0.4), 0.4), lambda cc: cc.text(
        760, 1340, "you wait …", font("italic", 50), RED, "mm"))


def scene_ask(c, t, dur, q):
    heading(c, "Of the Owner’s Word", ramp(t, 0.0, 0.5))
    x0, y0, x1, y1 = 140, 330, 940, 790
    c.group(ramp(t, 0.15, 0.4), lambda cc: chat_scroll(cc, x0, y0, x1, y1, ramp(t, 0.15, 0.8)))
    f = font("italic", 33)
    shown = sv.yt.typed(t, q.at(0, 0.3), q.at(1, 0.4), ASK)
    if t > 0.7:
        c.text(x0 + 50, y0 + 60, "you", font("bold", 30), RED, "lm")
        y = y0 + 104
        for ln in wrap("“" + shown + ("”" if shown == ASK else ""), f, 560):
            c.text(x0 + 50, y, ln, f, INK, "lm")
            y += 44
    if t > q.at(1, 0.45):
        a = ramp(t, q.at(1, 0.45), 0.4)
        fb = font("book", 33)
        c.group(a, lambda cc: (
            cc.text(x0 + 50, y0 + 330, "lead", font("bold", 30), BLUE, "lm"),
            cc.text(x0 + 50, y0 + 378, "Added T-253: investigation tasks.", fb, INK, "lm"),
            underline(cc, x0 + 50 + fb.getlength("Added ") / sv.S,
                      x0 + 50 + fb.getlength("Added T-253") / sv.S, y0 + 402,
                      ramp(t, q.at(1, 0.65), 0.4))))
    robot(c, 850, 560, 0.62, "judge" if t > q.at(1, 0.4) else "think", t, crown=True, quill=True)
    # the feature, as one big note
    a = ramp(t, q.at(1, 0.6), 0.45)
    slide = 1 - ease((t - q.at(1, 0.6)) / 0.6)

    def feature(cc):
        sheet(cc, 520, 1080 + 120 * slide, 760, 300, -1.5, lambda c2, x, y: lines_in(
            c2, x + 30, y + 34, 600, [
                ("The feature", "goth", 64, INK),
                ("a task that only finds an answer, with nothing to merge", "book", 38, INK),
                ("from the owner’s words", "italic", 30, BLUE)], gap=10), key="feature")
        seal(cc, 830, 1170 + 120 * slide, 44, RED, "O")

    c.group(a, feature)


def scene_hands(c, t, dur, q):
    heading(c, "Of the Many Hands", ramp(t, 0.0, 0.5))
    # 1. the lead chops the feature into three tasks tied by red threads
    xs = (255, 540, 825)
    for k, (tid, part, text, after) in enumerate(SPLIT):
        s = ease((t - q.at(0, 0.15 + 0.12 * k)) / 0.6)
        if s <= 0:
            continue
        x = 540 + (xs[k] - 540) * s
        y = 420 + (600 - 420) * s
        c.group(clamp(s * 1.5), lambda cc, tid=tid, part=part, text=text, x=x, y=y, k=k: sheet(
            cc, x, y, 270, 250, (-2, 1, -1)[k], lambda c2, xx, yy: lines_in(
                c2, xx + 20, yy + 30, 232, [(tid, "bold", 38, RED), (part, "italic", 27, INK_SOFT),
                                            (text, "book", 30, INK)], gap=4),
            key=("split", k)))
    c.group(1 - ramp(t, q.at(0, 0.1), 0.4), lambda cc: sheet(
        cc, 540, 420, 520, 110, 0, lambda c2, x, y: c2.text(
            x + 260, y + 55, "The feature", font("goth", 50), INK, "mm"), key="feature-small"))
    # pins of the three notes, for the threads
    for k in (1, 2):
        p = ramp(t, q.at(0, 0.62 + 0.14 * (k - 1)), 0.45)
        if p > 0:
            thread(c, (xs[k - 1], 483), (xs[k], 483), 46, p)
            c.group(ramp(t, q.at(0, 0.7 + 0.14 * (k - 1)), 0.3), lambda cc, k=k: stamp(
                cc, xs[k], 752, SPLIT[k][3], ang=-6, size=26))
    robot(c, 940, 345, 0.42, "judge", t, crown=True)
    # 2. three workers side by side, each in its own copy
    ys = (880, 1085, 1290)
    for k, (tid, title) in enumerate(BUILD):
        st = q.at(1, 0.15 + 0.15 * k)
        a = ramp(t, st, 0.4)
        if a <= 0:
            continue
        prog = clamp((t - st) / max(1.0, q.s(2) + 0.6 - st))
        status, col, mood, prog_shown = "building …", INK_SOFT, "happy", prog
        passed_at = q.at(2, 0.35 + 0.25 * (k // 2)) if k != 1 else q.at(3, 0.8)
        if t > q.s(2):
            status, prog_shown = "running the tests …", None
        try_k = 0
        if k == 1 and t > q.s(3):
            try_k = min(7, 1 + int((t - q.s(3)) / max(0.2, (q.at(3, 0.75) - q.s(3)) / 6)))
            status, col, mood = "try %d: tests failed" % try_k, RED, "worried"
            if try_k == 7:
                status, col, mood = "try 7: building again …", GREEN, "think"
        if t > passed_at:
            status, col, mood = ("try 7: tests passed, merged" if k == 1 else
                                 "tests passed, merged"), PASS_GREEN, "happy"

        def one(cc, k=k, tid=tid, title=title, y=ys[k], status=status, col=col,
                prog_shown=prog_shown, mood=mood):
            lane(cc, y, tid, title, True, prog_shown, status, col, ang=(-0.8, 0.6, -0.5)[k])
            worker(cc, 190, y + 20, t + k, mood)

        c.group(a, one)
        if k == 1 and 1 <= try_k <= 6 and t < passed_at:
            ph = ((t - q.s(3)) / max(0.2, (q.at(3, 0.75) - q.s(3)) / 6)) % 1
            x_mark(c, 830, ys[k] + 10, 110, clamp(ph * 2.5) * (1 - ramp(ph, 0.85, 0.15)))
        stamp(c, 830, ys[k] + 28, "PASSED", ang=-8, col=PASS_GREEN, size=30,
              a=ramp(t, passed_at, 0.2))


def scene_holes(c, t, dur, q):
    heading(c, "Of the Holes", ramp(t, 0.0, 0.5))
    notes = [("T-253", "a task kind that skips the merge", 480),
             ("T-257", "the Answer section and its buttons", 700),
             ("T-258", "stats, the lead’s rules, docs", 920)]

    def merged(cc, tid, text, y, k):
        sheet(cc, 310, y, 380, 170, (-1.5, 1, -0.8, 1.2)[k], lambda c2, x, yy: lines_in(
            c2, x + 22, yy + 24, 330, [(tid, "bold", 36, RED), (text, "book", 31, INK)], gap=4),
            key=("merged", tid))
        cc.check(462, y - 46, 30, PASS_GREEN, 6)

    c.group(ramp(t, 0.1, 0.4), lambda cc: (
        cc.text(310, 350, "merged into main", font("italic", 32), PASS_GREEN, "mm"),
        [merged(cc, tid, text, y, k) for k, (tid, text, y) in enumerate(notes)]))
    # cracks open where the new code went in
    holes = [(0, q.at(1, 0.7), "Done could delete work from earlier tries", 580),
             (1, q.at(1, 0.3), "Ask more could lose its own question", 815)]
    for k, st, s, ly in holes:
        crack(c, ramp(t, q.at(0, 0.35 + 0.15 * k), 1.0), shape=CRACKS[k])
        hole_note(c, 790, ly, s, ramp(t, st, 0.35), ang=(-3, 2.5)[k])
    # even a fix can open a new gap
    a = ramp(t, q.s(2), 0.4)
    c.group(a, lambda cc: merged(cc, "T-264", "the fix: kinds never delete work", 1180, 3))
    c.group(a, lambda cc: cc.text(310, 1060, "a fix, merged later", font("italic", 30),
                                  INK_SOFT, "mm"))
    crack(c, ramp(t, q.at(2, 0.35), 0.8), shape=CRACKS[2])
    hole_note(c, 790, 1295, "a refused change could still wipe a folder", ramp(t, q.at(2, 0.6), 0.35))
    robot(c, 810, 1040, 0.6, "worried" if t > q.at(0, 0.5) else "think", t)


def scene_scouts(c, t, dur, q):
    heading(c, "Of the Scouts", ramp(t, 0.0, 0.5))
    xs, y = (250, 540, 830), 400
    for k, (tid, text, name, col, where) in enumerate(FOUND):
        a = ramp(t, q.at(0, 0.3 + 0.15 * k), 0.4)

        def draw(cc, k=k, name=name, col=col):
            x = xs[k]
            lit = ramp(t, q.at(1, 0.55 + 0.12 * k), 0.3)
            if lit:
                cc.circle(x, y, 80, fill=mix(PARCH, GOLD, 0.45 * lit))
            seal(cc, x, y, 60, col)
            ang = t * 1.6 + k
            magnifier(cc, x - 6 + 10 * math.cos(ang), y - 6 + 8 * math.sin(ang), 22)
            cc.text(x, y + 98, name, fit("monob", 26, name, 250), INK, "mm")
            hourglass(cc, x + 58, y - 52, 0.9, t - q.s(1) if t > q.s(1) else 0)

        c.group(a, draw)
    c.group(ramp(t, q.at(1, 0.2), 0.4), lambda cc: cc.text(
        W / 2, 560, "they wake on timers and read what changed", font("italic", 30), INK_SOFT, "mm"))
    # the scouts search the cracks the new code left (scene 4's cracks, in the same places)
    look = ramp(t, q.s(1), 0.4) * (1 - ramp(t, q.s(2) - 0.2, 0.4))
    if look > 0:
        def searching(cc):
            for k, shp in enumerate(SEARCH):
                crack(cc, 1.0, shape=shp)
            k = min(2, int(clamp((t - q.at(1, 0.3)) / max(0.3, q.e(1) - q.at(1, 0.3))) * 3))
            u = clamp((t - q.at(1, 0.3)) / max(0.3, q.e(1) - q.at(1, 0.3))) * 3 - k
            pts = SEARCH[k][0]
            px, py = pts[min(len(pts) - 1, int(u * (len(pts) - 1)))]
            cc.circle(px, py, 70, fill=mix(PARCH, GOLD, 0.35))
            crack(cc, 1.0, shape=SEARCH[k])
            magnifier(cc, px, py, 56)
            cc.text(px + 90, py - 70, FOUND[(1, 0, 2)[k]][2], font("monob", 26),
                    FOUND[(1, 0, 2)[k]][3], "lm")

        c.group(look, searching)
    # each finding becomes a task note, marked with the scout's name
    for k, (tid, text, name, col, where) in enumerate(FOUND):
        st = q.at(2, 0.05 + 0.15 * k)
        a = ramp(t, st, 0.4)
        slide = 1 - ease((t - st) / 0.6)
        ny = 730 + k * 225

        def note(cc, k=k, tid=tid, text=text, name=name, col=col, where=where, ny=ny,
                 slide=slide):
            x = 500 - 160 * slide
            sheet(cc, x, ny, 700, 200, (-1.5, 1, -1)[k], lambda c2, xx, yy: lines_in(
                c2, xx + 26, yy + 24, 560, [(tid, "bold", 38, RED), (text, "book", 32, INK),
                                            ("found by scout " + name + ", " + where,
                                             "italic", 26, col)], gap=3),
                key=("found", k))
            seal(cc, x + 300, ny + 40, 32, col, "S")

        c.group(a, note)
        fi = font("italic", 26)
        x0 = 500 - 350 + 26 + fi.getlength("found by scout ") / sv.S
        underline(c, x0, x0 + fi.getlength(name) / sv.S, ny + 46,
                  ramp(t, q.at(2, 0.75), 0.4) * a, width=3)


def scene_again(c, t, dur, q):
    heading(c, "All Hands Again", ramp(t, 0.0, 0.5))
    ys = (400, 590, 780)
    for k, (tid, text, name, col, where) in enumerate(FOUND):
        st = q.at(0, 0.15 + 0.15 * k)
        a = ramp(t, st, 0.4)
        if a <= 0:
            continue
        passed = q.at(1, 0.15 + 0.3 * k)
        prog = clamp((t - st) / max(0.5, passed - st))
        if t > passed:
            status, col2, mood, pr = "tests passed, merged", PASS_GREEN, "happy", None
        elif prog > 0.6:
            status, col2, mood, pr = "running the tests …", INK_SOFT, "think", prog
        else:
            status, col2, mood, pr = "building …", INK_SOFT, "happy", prog

        def one(cc, k=k, tid=tid, text=text, status=status, col2=col2, mood=mood, pr=pr):
            lane(cc, ys[k], tid, text, False, pr, status, col2, ang=(-0.6, 0.8, -0.4)[k])
            worker(cc, 190, ys[k] + 20, t + k, mood)

        c.group(a, one)
        stamp(c, 830, ys[k] + 28, "PASSED", ang=-8, col=PASS_GREEN, size=30, a=ramp(t, passed, 0.2))
    # the cracks close, one by one
    shapes = [crack_points(31 + k, (160 + k * 265, 900 + 40 * (k % 2)),
                           (390 + k * 265, 1010 - 30 * (k % 2)), n=10, jitter=16, at=(3, 7))
              for k in range(3)]
    for k, shp in enumerate(shapes):
        crack(c, ramp(t, 0.2, 0.6), heal=ramp(t, q.at(2, 0.05 + 0.3 * k), 0.6), shape=shp)
    # this project's numbers
    for k, (num, label, col, st) in enumerate(((DONE, "tasks done", RED, q.at(2, 0.2)),
                                               (BY_SCOUTS, "found by scouts", GREEN, q.at(2, 0.5)))):
        x = 330 + k * 300
        a = ramp(t, st, 0.4)
        n = int(round(num * ease((t - st) / 1.0)))

        def medal(cc, x=x, n=n, label=label, col=col):
            cc.circle(x, 1180, 118, fill=mix(PARCH, GOLD, 0.25), outline=GOLD, width=5)
            cc.circle(x, 1180, 104, outline=col, width=2)
            cc.text(x, 1160, str(n), font("bold", 88), col, "mm")
            cc.text(x, 1232, label, font("italic", 26), INK, "mm")

        c.group(a, medal)
    c.group(ramp(t, q.at(2, 0.6), 0.4), lambda cc: cc.text(
        W / 2, 1352, "from this one project’s board, 10 to 16 November 2026", font("italic", 25),
        INK_SOFT, "mm"))
    robot(c, 885, 1190, 0.5, "cheer" if t > q.at(2, 0.9) else "happy", t)


def scene_book(c, t, dur, q):
    heading(c, "The Book Kept", ramp(t, 0.0, 0.5))
    x0, y0, x1, y1 = 140, 330, 940, 1245
    c.group(ramp(t, 0.1, 0.4), lambda cc: chat_scroll(cc, x0, y0, x1, y1, ramp(t, 0.15, 0.8)))
    c.group(ramp(t, 0.5, 0.4), lambda cc: (
        cc.text(x0 + 50, y0 + 62, "T-264", font("bold", 44), RED, "lm"),
        cc.text(x0 + 200, y0 + 62, "Kinds never delete work", fit("goth", 46, "Kinds never delete work", 540), INK, "lm"),
        cc.line([(x0 + 50, y0 + 98), (x1 - 50, y0 + 98)], GOLD, 1.6)))
    rows = [("what", "switching a task’s kind never deletes work", "book", q.at(0, 0.1)),
            ("why", "Done could delete earlier tries’ work", "book", q.at(0, 0.2)),
            ("files", "hooks/plugin/tools.ts, workers.ts, git.ts", "mono", q.at(0, 0.3)),
            ("from", "scout gaps-bot, in the owner’s T-253", "book", q.at(0, 0.45)),
            ("tries", "1, merged; 724 tests passed", "book", q.at(0, 0.65)),
            ("report", "“can no longer delete work”", "book", q.at(0, 0.8))]
    for k, (label, value, kind, st) in enumerate(rows):
        y = y0 + 150 + k * 76
        c.group(ramp(t, st, 0.35), lambda cc, label=label, value=value, kind=kind, y=y: (
            cc.text(x0 + 50, y, label, font("italic", 30), RED, "lm"),
            cc.text(x0 + 190, y, value, fit(kind, 30 if kind == "book" else 25, value, 560), INK, "lm"),
            cc.line([(x0 + 50, y + 34), (x1 - 50, y + 34)], mix(PAPER, PAPER_EDGE, 0.5), 1)))
    underline(c, x0 + 190, x0 + 190 + font("book", 30).getlength("scout gaps-bot") / sv.S,
              y0 + 150 + 3 * 76 + 22, ramp(t, q.at(0, 0.5), 0.4))
    # where a change can come from
    kinds = [("owner’s words", RED, "O"), ("a scout", GREEN, "S"),
             ("a worker’s report", BLUE, "W"), ("the lead", GOLD_DARK, "L")]
    for k, (name, col, letter) in enumerate(kinds):
        x = x0 + 110 + k * 193
        c.group(ramp(t, q.at(0, 0.55 + 0.06 * k), 0.3), lambda cc, x=x, name=name, col=col,
                letter=letter: (seal(cc, x, 1050, 38, col, letter),
                                cc.text(x, 1118, name, fit("italic", 24, name, 186), INK, "mm")))
    c.group(ramp(t, q.at(0, 0.75), 0.3), lambda cc: cc.circle(x0 + 110 + 193, 1050, 50,
                                                            outline=RED, width=3))
    stamp(c, 700, 1180, "NOTHING LOST", ang=-6, size=30, a=ramp(t, q.at(1, 0.2), 0.25))
    robot(c, 880, 1368, 0.6, "happy", t)


SCENES = [scene_alone, scene_ask, scene_hands, scene_holes, scene_scouts, scene_again,
          scene_book, sv.scene_end]


def thumbnail(path):
    img = sv.background().copy()
    c = sv.mv.Canvas(img)
    heading(c, "Of Many Hands")
    c.text(W / 2, 400, "One feature, many workers,", font("italic", 56), INK, "mm")
    c.text(W / 2, 490, "and the holes they leave", font("goth", 84), RED, "mm")
    for k, (tid, title) in enumerate(BUILD):
        y = 680 + k * 200
        lane(c, y, tid, title, True, None, "tests passed, merged", PASS_GREEN,
             ang=(-1, 0.8, -0.6)[k])
        worker(c, 190, y + 20, 0.4 + k, "happy")
    crack(c, 1.0, heal=0.4, shape=crack_points(41, (200, 1260), (760, 1320), n=14, jitter=16,
                                               at=(5, 10)))
    stamp(c, 720, 1250, "FOUND BY A SCOUT", ang=-6, size=30)
    banner(c, 470, 1460, 470, 150, "symcc")
    robot(c, 870, 1440, 0.8, "cheer", 0.3)
    c.text(W / 2, 1660, "many agents, one board", font("italic", 54), INK, "mm")
    img.reduce(2).save(path, optimize=True)
    print(path)


# ---------------------------------------------------------------- setup
# Done at import time, so the frame workers (which import this file again) draw this story.

sv.NAME = "symcc_organization"
sv.NARRATION = os.path.join(HERE, "organization_narration.md")
sv.MP4 = os.path.join(sv.yt.OUT_DIR, sv.NAME + ".mp4")
sv.SRT = os.path.join(HERE, sv.NAME + ".srt")
sv.THUMB = os.path.join(HERE, sv.NAME + "_thumbnail.png")
sv.SCENE_FNS = SCENES
sv.thumbnail = thumbnail

if __name__ == "__main__":
    sv.main(sys.argv[1:])
