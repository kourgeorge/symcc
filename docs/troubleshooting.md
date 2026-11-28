# Troubleshooting

How to turn symcc off, where it keeps its files, and small facts that help when something looks wrong.

## Disabling symcc

The board mode `paused` only stops the workers: Claude still acts as the lead. To have Claude
go back to normal, type `/symcc-disable` (or set `enabled` to off in the Settings view). From
your next message, no restart needed:

- the lead instructions are no longer added to Claude's prompt,
- running workers and scouts are stopped (their tasks go back to `todo`) and nothing new starts,
- no "[symcc] Board update" messages and no sounds or voice,
- the panel does not open by itself and the status line just says `symcc is disabled · /symcc-enable to turn it back on`,
- the symcc tools answer "symcc is disabled. The owner can turn it back on with /symcc-enable." and change nothing.

The board, its tasks, its mode and the scouts are kept. `/symcc-enable` turns everything back
on, in the mode the board had, and opens the board panel (as above). It also turns symcc on in the window you
type it in if that window was off there (see "Off in one window only" below). The switch is kept per project, as `enabled` in
`.symcc/board.json` (a board without it is on).

**New projects (getting started).** symcc runs only where `.symcc/board.json` is in the folder Claude
started in. It never looks in a parent folder and never in the git top folder: start Claude in a
subfolder of a project and symcc is not there. With no board in that folder, symcc stays off until you run
`/symcc-init`. There it acts like plain Claude: no band above the prompt, no board panel, no lead instructions, no "[symcc] Board
update" messages, no sounds, no timers, no example scouts, no git-setup
offer. The only trace is the status line under the prompt, "symcc: no board here · /symcc-init" (OpenCode shows the same hint, "no board here · /symcc-init", in its strip, and
nothing else). `/symcc-init` and help work; every other symcc command and tool answers "no symcc board in this folder ·
/symcc-init to create one here". Nothing is written (no `.symcc/` folder). Type `/symcc-init` (it works like the command that starts a repo): it creates the board in the
folder Claude started in, even when a parent folder has a `.symcc`; a parent's board never matters. A task's worker folder
(under `.symcc/worktrees/`) is the one exception: it only guards, using the main project's board. Where `.symcc/` already exists it changes nothing and says "already set up
here" (it also says so when this window is off here). If this folder has no repository of its own, it still makes the board, which then shows a "No git repo here" notice with a **Set up git** button (a parent's repository is never used); `/symcc-init git` sets up the
repository and a first commit here first, then makes the board. It turns symcc on, opens the board panel by itself on the Live tab (unless `open_on_start` is off, and not again if it is already open), and tells the lead it is the lead now. `/symcc-enable` and
`/symcc-disable` only switch an existing board on or off; with no board they point to `/symcc-init`. Projects
that already have a board start on as before. With several windows (see above), the first window
you open drives the board; later windows start as followers.

**Off in one window only.** `/symcc-disable here` turns symcc off in the window you type it in; the
other windows on the project keep symcc fully on and see no change. From your next message that
window gets no lead instructions, no "[symcc] Board update" messages, no sounds or voice, its panel
does not open by itself, and the symcc tools answer "symcc is off in this window. /symcc-enable
turns it back on." and change nothing. The band and status line say `symcc is off in this window ·
/symcc-enable`. If that window drove the board it hands driving over to another window (as
`/symcc-drive` does there); with no other window open, work waits until one is. This
switch lives in the window's session only, not in `board.json`.

**Two off switches, one on switch.** Turning off has two forms: `/symcc-disable` turns symcc off for
the whole project (saved as `enabled` in `board.json`), and `/symcc-disable here` turns it off in one
window only. Turning on has one rule: `/symcc-enable` means "symcc on, in this window". It turns the
project on if it was disabled and this window on if it was off here, tells the lead, opens the panel as
on start, and the window may drive again by the normal rules. Its answer says what it did and names the
mode, for example "symcc is on in this window, in mode paused: ..." with a hint to start work with
`/symcc-mode auto`; it says "already enabled" only when both were on already. Setting `enabled` to on in
the Settings view does the same (on every board).

## Where everything lives

```
your-project/
└── .symcc/
    ├── board.json        the board: settings + every task
    ├── archive.json      old done and dropped tasks, moved off the board (see archive_days)
    ├── board.lock        held for a moment while a window saves the board
    ├── lead.json         which window drives the board (with a heartbeat)
    ├── scouts/           your scout files (*.md) and each scout's recent runs (*.runs.json)
    ├── scouts.json       whether each scout is paused, and the scouts' usage totals (a scout's last run and report are read from the newest run in its runs file)
    ├── roles/            your own worker roles (*.md), see Worker roles
    ├── reports/          each try's full worker report (T-3-try-2.md), and scouts/ with
    │                     each scout run's full report (bugs-2026-11-18T10-20-30-000Z.md)
    ├── events.jsonl      the activity log: every task event, one JSON line each (see Task events)
    ├── evidence.jsonl    where agents struggled: refusals, stops, questions, verdicts (see Task events)
    ├── stats.html        the page `/symcc-stats html` writes
    ├── processes.json    the agent processes running now (Node host only)
    ├── org-mem.md        organizational memory (org-mem): short notes for the agents, kept by the lead (see below)
    └── worktrees/
        └── T-3/          a worker's private copy of the project (branch symcc/power-falcon/T-3),
                          kept while it waits for review, removed after it is merged
```

Add `.symcc/` to your project's `.gitignore` so the board and the copies stay local.

A task's branch (`symcc/power-falcon/T-3`) and its folder are removed once the task is merged, so old
branches don't pile up; the regular check also tidies up any left from before. A branch is
deleted only when all its work is in the branch the task merged into (even when that branch
isn't the one you have checked out), and never while a folder still has it checked out, so
nothing that isn't merged is lost. A dropped task loses
its folder but keeps its branch, in case you want to look at its work. Branches that don't
start with `symcc/` are never touched.

### Organizational memory (org-mem)

`.symcc/org-mem.md`, the organizational memory (org-mem), holds short notes about your project that agents left for the ones
after them, so the next worker doesn't have to find the same things again (how to run one
test, a trap, where something is).

- **The debrief: agents suggest, the lead decides:** a worker's or checker's main prompt is only
  about its task. Right after it hands back, symcc sends the same agent one short follow-up
  question, so it answers with the whole task still in mind: is there a fact from this task that
  would help agents on other tasks in this project (how to test or check something quickly, a trap
  or a refusal and the way around it, where something lives, a step that wasted time, or a note
  that turned out wrong)? It may suggest 0 to 3 notes under "Suggested for org-mem:", each one short
  plain sentence that is true beyond the task and not already in org-mem; most answer "none". It
  only answers: it changes no files and runs nothing (a file change then is refused or ignored).
- **It never holds up the work:** the checks, the checker and the merge line start at once from the
  main hand-back; the debrief's answer is used when it comes, and its tokens count on the task's
  try. No answer within about 3 minutes: nothing is kept. In Claude Code the message resumes the
  finished subagent; in the Node host the same `claude -p` session is resumed (`--resume`) for one
  turn that may only read; in OpenCode the agent's session gets one more prompt. A host that can't
  continue an agent asks instead for a `Learned:` section at the end of the report (up to 3 `- `
  lines; the section ends at the first blank line or line that isn't a `- ` line).
- **Kept for the lead:** nothing goes into org-mem on its own. symcc keeps the suggestions on the
  task (each made one line and cut at about 100 characters; secret-looking lines, file contents and
  exact repeats are left out). When the task merges (or an investigation is marked Done), the lead's
  board update lists them under "Suggested for org-mem" (an answer that comes after that is listed
  on its own); a dropped task's suggestions are thrown away.
- **The lead's orgmem tool:** the lead adds what is worth keeping (most suggestions are skipped),
  or replaces a close note with a better one, and tells you in one line what it added. The tool
  can `list` the notes, `add` one or more, `remove` one (by number or text) and `replace` one. New
  lines look like `- 2026-11-20: the note` (no task id). It refuses a note that repeats one already
  there (even in other words).
- **The limit:** the file keeps at most 60 lines; an add past that is refused until a note is
  removed or replaced.
- **Who reads it:** every new worker, checker and scout gets the whole file in its prompt,
  under "Organizational memory (org-mem): notes earlier agents left about this project". A missing
  or empty file adds nothing.
- **Editing:** you may edit, fix or trim the file by hand at any time; any line counts, with or
  without a date.
- **Seeing and deleting notes:** at the bottom of the board's Live tab, the **Organizational
  memory** section shows the count (out of 60, with a fill bar), the 3 newest notes and every topic
  with its note count ([Live tab](board.md#live-tab)). Enter (or a click) on a topic opens the
  "Organizational memory · tests" page with only that topic's notes; on a newest note, or on the
  `[all]` button next to "newest" (Enter or a click; in VS Code the `All notes` button on the section's heading), the
  "Organizational memory (org-mem)" page with every note. In VS Code the page has no tab header, only `‹ Live` with the note count on the right, then
  the title and the line "Notes shared with workers, checkers and scouts" (and a topic's page has the topic in the title). In
  the terminal the page starts with the same header as a task's page: `‹ [Live]` (Back; `b` too) with the note count on the right, the title, the
  line "Notes shared with workers, checkers and scouts", a `[Delete]` button (no key in it; the keys are in the
  footer) and a thin rule. Under it come `▍About` (what org-mem is) and `▍Notes` (plain bold `About` and `Notes` in VS Code, no
  rule or border), the notes newest first, with their number, date and text ("No notes yet." when there are none). To delete
  a note, put the cursor on it and press `x` (or Enter; in VS Code click its Delete link), then
  `y` to confirm (in VS Code the line asks inline: `Delete #3? [Yes, delete] Cancel`, no box): exactly that line is taken out of the file. From the prompt (and in OpenCode,
  where the page does it for you): `/symcc-settings orgmem delete N`, N being the note's number on the page.

## Good to know

- **A worker's copy has no installed packages.** `node_modules/` and other ignored
  folders are not copied into `.symcc/worktrees/T-…`. If your tests need them, say so in
  the task (for example: link the main project's `node_modules`, and remove the link
  before finishing).
- **Big tasks can run out of time.** A task that touches a lot of code may need more than
  45 minutes. symcc then asks you for more time (see "A worker over its time limit"); to stop
  being asked, raise `max_minutes` or split the task.
- **Finished workers in Claude Code's agent list.** After a task is done, its worker stays in the list below the prompt for a while, showing its last step (for example "◯ symcc-T-94 Splitting status strip test…"). It isn't running or using tokens; Claude Code clears it by itself later, and plugins can't remove or relabel it. The board shows the real state of each task.
- **What workers and scouts can use.** Workers may change git only in their own folder and on their own branch
  (see [A worker's git](tasks.md#a-workers-git)): never push, other branches, worktree, config, tags or the stash. They use
  Read, Edit, Write and Bash, with edits accepted automatically, inside your
  normal Claude Code permission settings. Scouts can't edit or write files: they use Read,
  Bash, WebSearch and WebFetch, and their shell commands follow the same rules.
- **A dropped task never runs on its own.** There is no delete; a dropped task stays on
  the list (until it is archived), and nothing automatic (retries after failed tests, a finishing check) starts
  it again. To bring it back on purpose, press `r` (Retry) on its page or ask the lead to
  retry it: it goes back to `todo`, with "brought back from dropped" in its history.
  `done` is final: a done task can't be retried or sent a question.

### The slow-step log

When symcc seems stuck, or Claude Code says "the hooks worker is wedged" or reloads symcc, look at
`.symcc/slow.log` in your project. It has one line per slow step: when it ended, the step and how many
milliseconds it took. Steps over 200 ms are written: a board change, drawing the view, a worker's hand-back,
the finishing mark, taking the lead, the git guard check, and in a merge the catch-up, each test run and the
move of the branch. A `lag` line means the worker's own 250 ms timer fired over a second late, so the worker
was busy; the slow steps just above it are the likely cause. The file keeps the last 500 lines.
