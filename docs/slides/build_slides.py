"""Build docs/slides/symcc.pptx. Run: python3 docs/slides/build_slides.py"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

HERE = os.path.dirname(os.path.abspath(__file__))
BG, PANEL, LINE = "1b1f2a", "2a2233", "3a3f4f"
ORANGE, LIGHT, TEXT, MUTED = "d97757", "f2a58a", "f5f5f7", "b8bccb"
FONT = "Helvetica Neue"

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]
TEXT_BOXES = []  # (slide no, text, width in, height in, pt) for the fit check


def rgb(h):
    return RGBColor.from_string(h.upper())


def new_slide():
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = rgb(BG)
    return s


def text(s, x, y, w, h, t, size=24, color=TEXT, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for m in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, m, Inches(0.05))
    for i, line in enumerate(t.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        r = p.add_run()
        r.text = line
        r.font.size, r.font.bold, r.font.name = Pt(size), bold, FONT
        r.font.color.rgb = rgb(color)
    TEXT_BOXES.append((len(prs.slides), t, w - 0.1, h - 0.1, size))
    return tb


def box(s, x, y, w, h, fill=PANEL, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    b = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    b.fill.solid()
    b.fill.fore_color.rgb = rgb(fill)
    b.line.color.rgb = rgb(line)
    b.line.width = Pt(1.5)
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        b.adjustments[0] = 0.12
    b.shadow.inherit = False
    return b


def card(s, x, y, w, h, title, body="", accent=ORANGE, tsize=22, bsize=16):
    box(s, x, y, w, h)
    bar = box(s, x, y + 0.15, 0.09, h - 0.3, fill=accent, line=accent, shape=MSO_SHAPE.RECTANGLE)
    text(s, x + 0.25, y + 0.1, w - 0.4, 0.6, title, tsize, TEXT, True)
    if body:
        text(s, x + 0.25, y + 0.7, w - 0.4, h - 0.8, body, bsize, MUTED)


def arrow(s, x, y, w=0.5, h=0.4, color=ORANGE, shape=MSO_SHAPE.RIGHT_ARROW):
    a = box(s, x, y, w, h, fill=color, line=color, shape=shape)
    return a


def title(s, t, sub=None):
    box(s, 0.6, 0.55, 0.12, 0.75, fill=ORANGE, line=ORANGE, shape=MSO_SHAPE.RECTANGLE)
    text(s, 0.9, 0.45, 11.5, 0.9, t, 38, TEXT, True, anchor=MSO_ANCHOR.MIDDLE)
    if sub:
        text(s, 0.9, 1.3, 11.5, 0.5, sub, 20, MUTED)


def staff(s, x, y, w):
    """Five staff lines with an orange note, like the logo."""
    for i in range(5):
        box(s, x, y + i * 0.3, w, 0.03, fill="4a5063", line="4a5063", shape=MSO_SHAPE.RECTANGLE)
    box(s, x + w / 2 - 0.2, y + 0.9, 0.4, 0.3, fill=ORANGE, line=ORANGE, shape=MSO_SHAPE.OVAL)
    box(s, x + w / 2 + 0.17, y - 0.5, 0.04, 1.55, fill=ORANGE, line=ORANGE, shape=MSO_SHAPE.RECTANGLE)


# 1. Title
s = new_slide()
staff(s, 1.5, 1.2, 10.3)
text(s, 0.8, 3.5, 11.7, 1.0, "symcc: Swarm Harness", 54, TEXT, True, PP_ALIGN.CENTER)
text(s, 1.6, 4.7, 10.1, 1.6,
     "Turn a messy swarm of coding agents into an organized team: a lead that plans, "
     "workers that build, and you in charge, so the work keeps moving even when you're "
     "not pushing it.", 22, MUTED, False, PP_ALIGN.CENTER)
text(s, 0.8, 6.6, 11.7, 0.5, "A plugin for Claude Code", 16, ORANGE, True, PP_ALIGN.CENTER)

# 2. Problem
s = new_slide()
title(s, "The problem", "Running many coding agents is chaos")
for i, (h, b) in enumerate([
    ("Ideas pile up", "You think of more work\nwhile the agent is busy."),
    ("Things slip", "Small items quietly drop\nout of the chat."),
    ("No clear view", "What was asked? What is done?\nWhat is still open?"),
]):
    card(s, 0.7 + i * 4.1, 2.4, 3.8, 3.0, h, b, tsize=26, bsize=20)
text(s, 0.7, 5.9, 11.9, 0.8, "The bottleneck is not how fast agents write code.\nIt is keeping track of the work.",
     22, LIGHT, True, PP_ALIGN.CENTER)

# 3. Vision
s = new_slide()
title(s, "The vision", "Push agent work forward by organizing it as a team")
layers = [("You", "decide", 4.0, ORANGE), ("Lead", "plans, takes notes, supervises", 6.0, "c4623f"),
          ("Workers + Scouts", "build and discover", 8.0, "8f4a37")]
for i, (n, d, w, c) in enumerate(layers):
    x = (13.333 - w) / 2
    y = 2.2 + i * 1.45
    b = box(s, x, y, w, 1.2, fill=c, line=c)
    text(s, x, y + 0.05, w, 0.65, n, 28, TEXT, True, PP_ALIGN.CENTER)
    text(s, x, y + 0.65, w, 0.45, d, 18, "fbe6dd", False, PP_ALIGN.CENTER)
    if i < 2:
        arrow(s, 6.67, y + 1.2, 0.3, 0.25, MUTED, MSO_SHAPE.DOWN_ARROW)
text(s, 0.9, 6.55, 11.5, 0.5, "The work keeps moving, even when you are not pushing it.", 20, MUTED, False, PP_ALIGN.CENTER)

# 4. Team
s = new_slide()
title(s, "The team")
card(s, 0.7, 1.9, 3.9, 1.5, "You", "The decision maker.", tsize=24, bsize=18)
card(s, 0.7, 3.6, 3.9, 1.5, "The lead", "Your Claude Code chat.\nPlans and supervises.", tsize=24, bsize=18)
card(s, 0.7, 5.3, 3.9, 1.5, "Scouts", "Find work on a timer.\nRead-only.", tsize=24, bsize=18)
text(s, 5.1, 1.85, 7.5, 0.5, "Workers, each with a role", 26, TEXT, True)
roles = ["general", "backend", "frontend", "tests", "docs", "security", "refactor"]
for i, r in enumerate(roles):
    x = 5.1 + (i % 3) * 2.55
    y = 2.6 + (i // 3) * 1.1
    b = box(s, x, y, 2.35, 0.85, fill=PANEL, line=ORANGE)
    text(s, x, y, 2.35, 0.85, r, 22, LIGHT, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
text(s, 5.1, 5.35, 7.5, 1.4, "The lead picks the best role for each task.\nYou can add your own roles.", 20, MUTED)

# 5. Flow
s = new_slide()
title(s, "How a request flows")
steps = [("1", "You talk", "Say what you want"), ("2", "Tasks", "On the board, in order (\"after\")"),
         ("3", "Workers", "Each in its own git worktree"), ("4", "Tests", "Must pass first"),
         ("5", "Merge", "Into your branch")]
for i, (n, h, b) in enumerate(steps):
    x = 0.5 + i * 2.5
    box(s, x, 2.4, 2.1, 2.9)
    c = box(s, x + 0.75, 2.6, 0.6, 0.6, fill=ORANGE, line=ORANGE, shape=MSO_SHAPE.OVAL)
    text(s, x + 0.75, 2.6, 0.6, 0.6, n, 22, BG, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    text(s, x + 0.05, 3.35, 2.0, 0.5, h, 24, TEXT, True, PP_ALIGN.CENTER)
    text(s, x + 0.1, 3.95, 1.9, 1.2, b, 16, MUTED, False, PP_ALIGN.CENTER)
    if i < 4:
        arrow(s, x + 2.14, 3.65, 0.32, 0.3)
text(s, 0.7, 5.9, 11.9, 0.8, "Tasks that do not depend on each other run in parallel.", 22, LIGHT, True, PP_ALIGN.CENTER)

# 6. Board
s = new_slide()
title(s, "The board", "Every task is in one state. You always see where it stands.")
states = [("backlog", "Parked idea", MUTED), ("todo", "Ready to start", LIGHT), ("running", "A worker is on it", ORANGE),
          ("review", "Waits for you", "e8a33d"), ("done", "Merged", "5fb878"), ("failed", "Needs a look", "d85a5a")]
for i, (n, d, c) in enumerate(states):
    x = 0.6 + i * 2.05
    box(s, x, 2.4, 1.9, 3.4)
    box(s, x, 2.4, 1.9, 0.2, fill=c, line=c, shape=MSO_SHAPE.RECTANGLE)
    text(s, x, 3.2, 1.9, 0.6, n, 24, TEXT, True, PP_ALIGN.CENTER)
    text(s, x + 0.1, 4.0, 1.7, 1.2, d, 16, MUTED, False, PP_ALIGN.CENTER)
text(s, 0.7, 6.1, 11.9, 0.7, "Also: waiting (needs your answer), paused, dropped. In the app, running shows as \"doing\".",
     16, MUTED, False, PP_ALIGN.CENTER)

# 7. Control
s = new_slide()
title(s, "You stay in control")
for i, (n, d) in enumerate([("off", "Everything stops.\nNothing new starts."),
                            ("review", "Tests pass, then\nwait for your approval."),
                            ("auto", "Tests pass, then\nmerge on its own.")]):
    x = 0.7 + i * 4.1
    card(s, x, 1.9, 3.8, 2.3, n, d, tsize=30, bsize=20, accent=[MUTED, "e8a33d", "5fb878"][i])
text(s, 0.7, 4.5, 11.9, 0.5, "Set it with /symcc-mode, or just tell the lead.", 20, MUTED, False, PP_ALIGN.CENTER)
for i, (n, d) in enumerate([("Approve", "Merge the change"), ("Reject", "Send back, with a reason"), ("Pause", "Stop one; resume later")]):
    x = 0.7 + i * 4.1
    box(s, x, 5.2, 3.8, 1.3, fill=BG, line=ORANGE)
    text(s, x, 5.3, 3.8, 0.55, n, 26, LIGHT, True, PP_ALIGN.CENTER)
    text(s, x, 5.9, 3.8, 0.5, d, 18, MUTED, False, PP_ALIGN.CENTER)

# 8. Proactive
s = new_slide()
title(s, "Proactive", "Work does not wait for you to ask")
card(s, 0.7, 2.1, 3.8, 3.4, "Scouts find work", "Small agents that run on a timer.\nThey check bugs, missing tests,\nold dependencies.\nThey only report.", tsize=24, bsize=18)
card(s, 4.75, 2.1, 3.8, 3.4, "Backlog for ideas", "Park unclear ideas.\nThey never start until you\nmove them to todo.", tsize=24, bsize=18)
card(s, 8.8, 2.1, 3.8, 3.4, "Checks every 2 min", "symcc looks at the board by itself,\nstarts ready tasks and stops\nworkers that run too long.", tsize=20, bsize=18)
text(s, 0.7, 5.9, 11.9, 0.7, "It runs while your Claude Code session is open.", 20, LIGHT, True, PP_ALIGN.CENTER)

# 9. Features
s = new_slide()
title(s, "Compared to one plain coding agent")
rows = [("Takes your ideas while work runs", "One thing at a time"),
        ("One board for all work", "Ideas in your head"),
        ("Several workers in parallel (3 by default)", "One worker"),
        ("Own git worktree per task", "Edits your branch directly"),
        ("Order between tasks (after)", "You keep the order"),
        ("Scope check, test gate, retries", "You check by hand"),
        ("Approve or reject each diff", "Changes land at once"),
        ("Scouts find work on a timer", "Waits for you to ask")]
box(s, 0.7, 1.7, 5.9, 0.6, fill=ORANGE, line=ORANGE)
box(s, 6.75, 1.7, 5.9, 0.6, fill=LINE, line=LINE)
text(s, 0.7, 1.7, 5.9, 0.6, "symcc", 22, BG, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
text(s, 6.75, 1.7, 5.9, 0.6, "Plain agent", 22, TEXT, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
for i, (a, b) in enumerate(rows):
    y = 2.4 + i * 0.58
    box(s, 0.7, y, 5.9, 0.5)
    box(s, 6.75, y, 5.9, 0.5)
    text(s, 0.8, y, 5.7, 0.5, a, 17, TEXT, False, PP_ALIGN.LEFT, MSO_ANCHOR.MIDDLE)
    text(s, 6.85, y, 5.7, 0.5, b, 17, MUTED, False, PP_ALIGN.LEFT, MSO_ANCHOR.MIDDLE)

# 10. Install
s = new_slide()
title(s, "Install and quick start")
box(s, 0.7, 1.8, 5.9, 4.6, fill="12151d")
text(s, 0.9, 1.9, 5.5, 0.5, "Install", 24, LIGHT, True)
text(s, 0.9, 2.5, 5.5, 3.8,
     "claude plugin install symcc \\\n  --marketplace kourgeorge/symcc\n\nOr try it from a clone:\n"
     "git clone https://github.com/\n  kourgeorge/symcc ~/symcc\nclaude --plugin-dir ~/symcc",
     16, TEXT)
for i, t in enumerate(["Keep the board local:\nadd .symcc/ to .gitignore",
                       "Tell the lead your test command:\n\"set the test command to npm test\"",
                       "Optional: add a scout",
                       "Ask: \"Add a dark mode toggle.\"\nThen watch the board."]):
    y = 1.8 + i * 1.18
    box(s, 6.95, y, 0.6, 0.6, fill=ORANGE, line=ORANGE, shape=MSO_SHAPE.OVAL)
    text(s, 6.95, y, 0.6, 0.6, str(i + 1), 20, BG, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    text(s, 7.7, y - 0.1, 5.0, 1.0, t, 17, TEXT, False, PP_ALIGN.LEFT, MSO_ANCHOR.MIDDLE)

# 11. Next
s = new_slide()
title(s, "What's next", "Ideas waiting in the backlog")
for i, (h, b) in enumerate([("CI on GitHub", "Run the tests for every push\nand pull request."),
                            ("Archive old tasks", "Move done and dropped tasks\nout of the board file."),
                            ("Stages", "Group task states into stages,\nplus flags on the board.")]):
    card(s, 0.7 + i * 4.1, 2.4, 3.8, 3.0, h, b, tsize=22, bsize=19)

# 12. Thanks
s = new_slide()
staff(s, 2.5, 1.2, 8.3)
text(s, 0.8, 3.6, 11.7, 1.0, "Thank you", 54, TEXT, True, PP_ALIGN.CENTER)
text(s, 0.8, 4.8, 11.7, 0.6, "github.com/kourgeorge/symcc", 28, ORANGE, True, PP_ALIGN.CENTER)
text(s, 0.8, 5.6, 11.7, 0.5, "Questions?", 20, MUTED, False, PP_ALIGN.CENTER)


def check_fit():
    """Rough check: estimate wrapped lines, warn if text is taller than its box."""
    bad = 0
    for n, t, w, h, pt in TEXT_BOXES:
        cw = pt / 72 * 0.56  # average character width, inches
        lines = sum(max(1, -(-int(len(l) * cw * 100) // int(w * 100))) for l in t.split("\n"))
        need = lines * pt / 72 * 1.2
        if need > h + 0.05:
            bad += 1
            print(f"slide {n}: may overflow ({need:.2f} > {h:.2f}in): {t[:40]!r}")
    return bad


out = os.path.join(HERE, "symcc.pptx")
prs.save(out)
print("saved", out, len(prs.slides), "slides;", check_fit(), "fit warnings")
