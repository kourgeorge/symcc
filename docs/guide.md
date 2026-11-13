# symcc guide

The full details. For the short version, see the [README](../README.md).

- [The parts and their names](#the-parts-and-their-names)
- [A task's life](#a-tasks-life)
- [What happens when a worker finishes](#what-happens-when-a-worker-finishes)
- [Approval before merge](#approval-before-merge)
- [Live status: seeing the board](#live-status-seeing-the-board)
- [Tracing a task back](#tracing-a-task-back)
- [Scouts](#scouts)
- [Worker roles](#worker-roles)
- [Which branch work goes into](#which-branch-work-goes-into)
- [Keeping work moving on its own](#keeping-work-moving-on-its-own)
- [Stats: time and tokens](#stats-time-and-tokens)
- [Turning symcc off](#turning-symcc-off)
- [Where everything lives](#where-everything-lives)
- [Good to know](#good-to-know)
- [Renaming the plugin](#renaming-the-plugin)
- [For developers](#for-developers-where-the-code-is)
- [Working on symcc](#working-on-symcc)

---

## The parts and their names

The same names are used in the [README](../README.md) and in this guide.

| Name | Known term | What it does |
|---|---|---|
| **You** (the owner) | The human in the loop | Say what you want, answer questions, approve or reject |
| **Lead** | Orchestrator agent (your normal Claude Code chat) | Plans, breaks work into tasks, supervises the workers, decides what to do when something fails, reports to you |
| **Board** | Task board (a plain file at `.symcc/board.json`) | One board (todo / doing / review / done) for requested work (from you) and discovered work (from scouts) |
| **Workers** | Parallel agents (one per task) | Each builds one task in an isolated git worktree on its own branch, then stops |
| **Scouts** (optional) | Scheduled background agents for discovery | On a timer, look for bugs, missing tests, outdated dependencies or security notices, and report to the lead; read-only, they never change files |

And the ideas that tie them together:

| Term | What it means here |
|---|---|
| **Discovery → triage → implementation → review → merge** | A scout or you find work, the lead puts it on the board, a worker builds it, you review it, symcc merges it |
| **Scope check** | Each task lists the files it may change (its scope); anything else is not merged; a worker that needs more answers `NEED FILES` |
| **Automatic retries** | Failing tests send the task back to a new worker with the failing test output, up to `auto_retries` times (2 by default) |
| **Test gate** | Your test commands must pass before anything is merged |
| **Approval before merge** | Human-in-the-loop review: modes `auto`, `review` or `off`; see the diff, approve, or reject with a reason; one task can be marked "needs review" |
| **Merge into the target branch** | Commit, scope check, update on the latest target branch, re-run tests, then merge; your branch only moves this way |
| **Live status** | The board panel and the status line |

symcc is proactive while your Claude Code session is open. Work stops when you close it and
picks up again next time.

---

## A task's life

```
            ┌──────────────── retry / change ──────────────┐
            ▼                                              │
  todo ──▶ doing ──▶ checks + tests pass ──▶ done          │
   ▲         │                                             │
   │         ├──▶ tests fail ──▶ back to todo with the      │
   │         │    failing output (up to 2 times by itself)  │
   │         ├──▶ still failing / out of time ──▶ failed ───┘
   │         ├──▶ worker needs files outside its list ──▶ waiting (NEED FILES)
   │         └──▶ worker has a question ──▶ waiting (QUESTION), "T-5 needs you"
   │
   ├── review   (only in review mode) checks passed; waits for YOUR approve
   │            (merge) or reject with a reason (back to todo, fresh worker)
   ├── waiting  the lead or a worker asked YOU something; your answer sends it
   │            back to work
   ├── paused   stopped on purpose; "resume" sends it back
   ├── dropped  cancelled; stays on the list and never runs on its own;
   │            retry (r on its page, or ask the lead) brings it back to todo
   └── backlog  a parked idea or unclear work; never starts until you move it
                to todo ("move T-5 to todo"); "stash" sends a todo, paused or
                failed task back here
```

| Status | Meaning |
|---|---|
| `todo` | Ready to be picked up (once the tasks it waits for are done) |
| `doing` | A worker is on it right now |
| `waiting` | It needs an answer from you (shown under NEEDS YOU) |
| `review` | Ready for review: the worker is done and the checks passed, but nothing is merged until you approve it |
| `paused` | Stopped on purpose, until resumed |
| `failed` | It could not be finished; the lead decides what next |
| `done` | Merged into your branch. This is final |
| `dropped` | Cancelled. It never runs on its own; retry brings it back to todo on purpose |
| `backlog` | A parked idea or unclear work. It never starts until you move it to todo. In the board panel it sits in a folded "▸ Backlog  N" row below the active tasks |

**Task dependencies.** The lead sets them. A task's `after` lists the tasks that must be
finished first: it starts only when every one of them is `done` (merged). Any other status
keeps it waiting, also `dropped` or `failed`; then the lead changes or clears its `after`.
Among the `todo` tasks that are free to start, the lowest `order` goes first (on a tie, the
lower task number).

---

### When a worker needs you

A worker that can't go on without a decision from you stops and answers
`QUESTION: …`. (A worker that needs files outside its list answers `NEED FILES: …`; see
the scope check below.) The task does not fail: it goes straight to `waiting` with the
question, shows under NEEDS YOU on the board, and with voice on you hear "T-5 needs you"
(once per question, only in the session that drives the board). The lead is told too and
answers it itself when it can. Otherwise answer it on the board or tell the lead: the answer
goes into the task and sends it back to work, and a new try continues with it. What the
worker already changed is kept.

---

## What happens when a worker finishes

This is where symcc keeps your branch safe. Step by step:

1. **Commit.** symcc commits what the worker changed in its private copy. (Workers are
   not allowed to commit, push or merge themselves.)
2. **Scope check.** Every task lists the files it may change (its scope). If the worker changed
   anything else, nothing is merged (the note says which files; add them to `files` with
   `change`, or split the task). A worker that sees it needs another file should not change
   it: it stops and answers `NEED FILES: path/a, path/b — reason`, and the task waits for
   you to allow those files (the lead does that with `change`) or drop it.
3. **Update on the latest branch.** If your branch has moved on since the worker started (for example,
   another task was merged), symcc brings those changes into the task's copy first.
   If they clash, a new worker is started to sort out the clash (up to 2 times).
4. **Test gate.** symcc runs your test commands on the combined code. If they fail,
   automatic retries kick in: the task goes back to `todo` and the next worker is shown the end of the failing output and
   told to fix it (2 times by itself; then it is marked `failed` for the lead).
5. **Approval (optional).** In review mode (see below), the task stops here as
   `review` ("ready for review") and nothing is merged until you say so.
6. **Merge.** Only now does your branch move forward. If you have that branch checked
   out with uncommitted changes, or with untracked files the merge would overwrite,
   symcc waits instead of overwriting them.
7. **Tell.** The lead gets one line: merged, or why not (see "What reaches the lead" below). On a Mac you also hear
   "T-3 done" (and "T-5 needs you" when a task waits for your answer).

> **Set a test command.** With no test command, step 4 is skipped and any change
> that passes the scope check is merged. Say "set the test command to …" to the lead.

### What reaches the lead

The lead (the main chat) gets a "[symcc] Board update" message only when something needs it:
a worker finished, failed or is ready for review, a task waits for you (a question or
`NEED FILES`), a scout found something, a conflict or failing tests need a decision, or the
board file is broken. The worker's or scout's own report already reaches the chat as that
agent's message, so the board update gives just the outcome ("T-3 merged into main (abc12345);
tests passed") and doesn't repeat it. A scout that answers `NOTHING` sends nothing.

What you do yourself on the board (approve, reject, drop, move to todo, stash, mode and
settings changes, answering a task) and merges you approved don't wake the lead. They are
kept as short lines ("The owner approved T-5: …") and put under "Meanwhile the owner:" at the
top of the next board update (at most 10, then "+N more"). They are still in each task's history.

---

## Approval before merge

The board has one mode, set with `/symcc-mode`, `/symcc-settings mode …` or by telling the lead (the setting `mode`):

- **`off`**: every running worker and scout stops at once and nothing new starts. Tasks
  already in review can still be approved or rejected.
- **`review`**: work runs; every finished task that passes waits as `review` for you.
- **`auto`** (the default): work runs; a task that passes steps 1–4 is merged at once.

Going from `off` to `review` or `auto` starts work again. In `auto` you can still mark one
task: "T-5 needs review" (`needs_review` on `symcc add` / `symcc change`); that task waits.

The lead tells you "T-5 is ready for review". The task's branch (`symcc/T-5`) and copy
(`.symcc/worktrees/T-5`) are kept so you can look at the change. Then:

- **Approve** ("approve T-5", tool `symcc approve`): symcc runs the same merge steps as
  always: brings the task up to date with your branch, checks the files, runs the tests
  again if it had to bring in new changes, and retries clashes. Then the task is `done`.
- **Reject** with a reason ("reject T-5: the button should be blue", tool `symcc reject`):
  nothing is merged; the task goes back to `todo` with your reason in its history, and a
  fresh worker redoes it with that reason in front of it.

So there are three ways to change a task in review before it is merged:

1. **Reject it with a reason**: a fresh worker redoes it (see above).
2. **Ask the lead to change the task** ("T-5: also update the README"): the lead changes
   what the task asks for, and it goes back to work.
3. **Edit the files yourself** in its folder, `.symcc/worktrees/T-5`, then approve. Your
   edits are committed as part of the task (same commit message) and its history gets a
   line like `owner edited files before approving: a.ts, b.md`. The tests always run
   again when you edited something. If they fail, nothing is merged: the task stays in
   review with the test output, so you can fix the files and approve again.

The diff (`d` on the task page, `/symcc-diff T-5`) shows the folder as it is now, your
edits included, against your branch; it says `(includes your edits)` when there are some.

Both only work on a task in `review`. Switching back to `auto` does not merge tasks
already waiting; approve or reject each of them.

You can also do it yourself:

- **In the board panel**, tasks ready for review are listed near the top. Open one to see
  the files it changed with `+`/`-` line counts, and its folder (edit files there, then
  approve). Press `d` (Show changes) for the whole
  diff, or pick a file for just that file's diff, with added lines in green and removed
  lines in red. `a` approves, `x` rejects (it asks for a short reason first), `b` goes back.
  A very long diff is cut, with a note like `… 340 more lines (see /symcc-diff T-5)`.
- The banner shows the mode: `⏵ auto` (finished tasks that pass merge on their own),
  `⏸ review merge` (finished tasks wait for your approve or reject) or `⏹ off` (no work runs).
  Press `m` to switch between `review merge` and `auto` (`m` never turns the board off).
- In any open task, `n` turns that task's own "needs review" on or off.
- **Slash commands:** `/symcc-approve T-5`, `/symcc-reject T-5 <reason>`,
  `/symcc-diff T-5` (the changed files with `+`/`-` counts) or `/symcc-diff T-5 <file>`
  (that file's full diff), and `/symcc-mode [off|review|auto]` (with no word it switches
  between `review` and `auto`; from `off` it goes to `review`).
- The status line starts with the mode, `⏹ off`, `⏸ review merge` or `⏵ auto`, and counts
  tasks to review by ID, e.g. `⏸ review merge · 1 to review (T-5)`. With an empty board it
  shows nothing in `auto`, so a fresh project stays quiet.

### Plan mode

Claude Code's own plan mode (Shift+Tab) is for planning only, so symcc starts nothing while
the main chat is in it:

- Every task the lead adds goes to the backlog, and the answer says so:
  `plan mode: T-7 Search added to the backlog; nothing starts`.
- No new worker or scout starts (not the regular check, not a scout's timer, not "run now").
  Workers already running keep going: plan mode doesn't reach them, and stopping them would
  lose work. The band above the prompt says so, e.g.
  `plan mode: nothing starts (1 worker keeps going)`.
- The band, the status line and the status strip show `plan mode: nothing starts`.

When plan mode ends, the lead is told once which tasks went to the backlog during it, and asks
you which ones to move to todo. symcc never moves them by itself.

Claude Code has no call for the mode and no event when it changes, so symcc reads it from what
comes with some events of the main chat: the permission mode on the prompt you send and on the
end of each turn, the mode passed to a new agent, and the "plan mode" reminders Claude Code
adds to each request. So a switch is noticed at the next prompt, request or end of turn. Until
symcc has seen the mode at all, it works as before. Each session tracks its own mode; only the
session that drives the board starts work. (Background: `docs/research/plan-mode.md`.)

---

## Live status: seeing the board

- **The panel** opens by itself when a session starts (on a wide enough terminal; turn it
  off with the `open_on_start` setting). It shows a small banner (folder, branch, test
  command, limits, counts) and the task list.
- **`/symcc`** opens the interactive board: ↑↓ to move, Enter to open a task, Esc to
  close. An open task shows everything about it, with buttons to pause, resume, retry,
  drop, watch its worker live, and a box to answer it when it waits for you.
  `/symcc-task T-3` opens one task directly; `/symcc-tasks` and `/symcc-scouts` open a view.
- The panel has three views, Tasks, Scouts and Settings, shown as tabs under the banner.
  Press `t`, `s` or `c` (or click a tab) to switch. The Scouts view lists each scout on one
  row: an icon (`◉` running, `◎` waiting for its next run, `○` paused), its name, how often
  it runs, when it runs next, what its last run found (`last: found 2`, `last: nothing` or
  `never ran`) and its model. On a narrow panel the model column goes first, then the
  `last:` one; the name is never cut. Enter opens a scout: its state, its file, its
  instructions, its last report, and buttons to run it now, edit it, or pause or resume it.
  Esc goes back to the list.
- The Settings view (`c`, or `/symcc-settings`) has one row per setting: its name, value,
  default, allowed range and what it means. Enter on a row changes it: `open_on_start` and
  `voice` flip on/off; `mode` and `target_branch` open a pick list (off / review / auto,
  or your local branches); numbers and `test_commands` open an edit box (several test
  commands are joined with ` && `). Esc cancels. Saving uses the same checks and limits as
  telling the lead, and a toast says what changed, e.g. `max_parallel set to 5`. A value
  over its limit is cut to it and the toast says so.
- Typed form: `/symcc-settings max_parallel 5`, `/symcc-settings voice off`,
  `/symcc-settings mode review`, `/symcc-settings test_commands "npm test"`. A wrong name
  or value says why, e.g. `max_parallel must be a whole number, 1-8`.
- Panel keys: `a` approve, `x` reject or drop, `d` changes, `p` pause, `u` resume,
  `r` retry, `m` switch review / auto, `n` needs review, `1`-`9` a try's report on the task
  page, `t` / `s` / `c` switch views, `b` back.
- **Ctrl+T** (Claude Code's background tasks) shows running workers; open one to watch it.
- Each task lists how long each try took and the tokens it used; the board ends with a
  total, e.g. `total: 1h 12m · 1.2M tokens over 4 tries`.

---

## Tracing a task back

Every task records who made it, why, and your words that started it. Open the board
with `/symcc`, or one task with `/symcc-task T-3`: the `from:` line says, for example,
`from: owner — “add a search command…”` or `from: scout bugs`, and the history lists each
try. Every merge commit starts with the task ID, so `git log --grep "T-3"` finds the work
for a task, and the ID on a commit takes you back to the task and your request. Tasks made
before this was kept show `from: unknown`.

## Where to see what a task did

- **The git commit.** Each try's commit starts with the task ID (`T-3: ...`) and ends with
  trailers: `Symcc-Task`, `Symcc-From` (who asked), `Symcc-Why` and `Symcc-Try`. Find them
  with `git log --grep "T-3"`.
- **The task page** (`/symcc-task T-3`, or open it on the board): **History** has one short
  line per try (what the worker said, cut at a word end with "…", and how it went),
  **Commits** lists the commits each try made and the one that was merged, and **Report**
  shows the worker's full final report for the latest try. When more than one try has a
  report, press the try's number (`1`, `2`, ...) to read that try's report. `/symcc-task T-3`
  shows the first 40 lines and says where the full report is.
- **The report files.** Every try's full final answer (its report, or its NEED FILES or
  QUESTION text) is saved in `.symcc/reports/T-3-try-2.md` (plain text, up to 50 KB).
  Tasks from before this was kept say "no saved report".
- **The research note.** When a task's merged work adds or changes a file under
  `docs/research/`, the task page shows it in Details as `Note: docs/research/<file>.md`.
- **Claude Code's agent list** (Ctrl+T) shows a worker's whole conversation, but only for a
  while: it is not kept. The report file and the commit are what stay.

## Scouts

A scout is one Markdown file in `.symcc/scouts/`. The top says how often it runs (and,
if you like, which model); the rest is its instructions.

```markdown
---
every_minutes: 30
model: sonnet
---
Look for risky code that has no tests. Point at file:line and say what could go wrong.
```

A scout does what its file says. It can read files, run shell commands (these follow your
normal permission rules, like workers) and search or fetch web pages. It can't edit or write
files, and it is told not to change the project at all: no installs, no git commands that
change anything. Changes only go through board tasks. It also sees the open tasks, so it
doesn't suggest them again.

When it is done, its whole report (up to 2000 characters) goes to the lead, which adds tasks,
tells you what matters, or ignores it. A scout that answers `NOTHING` sends no message. The
last report shows on the scout's page in the board panel. [`examples/scouts/`](../examples/scouts/)
has examples to copy: [`bugs.md`](../examples/scouts/bugs.md),
[`test-gaps.md`](../examples/scouts/test-gaps.md),
[`deps.md`](../examples/scouts/deps.md), which checks the web for new versions and
security notices, and [`secrets.md`](../examples/scouts/secrets.md), which looks for keys,
tokens and passwords that are in git or could end up there.

You can also make and change scouts right in the board panel: on the Scouts view, "New
scout" asks for a name, and "Edit" on a scout's page lets you change how often it runs, its
model and its instructions. Save writes the file (other front matter keys are kept) and the
new timing applies at once. `/symcc-scout <name>` runs a scout now.

### Scouts that run only on demand

`every_minutes: 0` (or 0 in the panel's "every (minutes)" box) means the scout runs only
on demand: never on the timer, only when you press "run now" on its page or run
`/symcc-scout <name>`. The Scouts list and its page say "on demand" instead of "every N"
and show no "next in …", for example `◎ secrets  on demand  last: nothing`, and the status
strip's next scout skips it. If `every_minutes` is left out, the scout runs every hour.

A value that is not a whole number of 0 or more (like `-5`, `1.5` or `ten`) also means
only on demand, so a typo never makes a scout run more often than you meant. Its row shows
`bad every_minutes`, and its page and `/symcc-scouts` show a warning such as
`every_minutes "-5" is not valid: runs only on demand until fixed`. The panel's editor
refuses such a value.

### Pausing a scout

To stop one scout for a while without deleting it, press `p` on its page in the panel, or
run `/symcc-scout <name> pause`. A paused scout doesn't run: not on its timer, and "run now"
answers "<name> is paused; resume it first". If it is running when you pause it, that run
finishes and reports as usual; the next one doesn't start. Press `p` again, or run
`/symcc-scout <name> resume`, to start it again. The pause is kept in `.symcc/scouts.json`
(next to each scout's last run), so it survives a restart and your scout file is never
changed. Only you can pause or resume a scout; the lead is told a paused scout doesn't run.

---

## Worker roles

Each task has a role. The lead picks the one that fits; `general` (a plain worker) is the
default. A role is one Markdown file: the top (front matter) says what the role is for and,
if you like, which model and skills it uses; the rest is the checklist the worker follows.

```markdown
---
description: writing or fixing tests - edge cases, error paths, no flaky tests
model: sonnet
skills: [code-review]
---
- Cover error paths and edge cases, not only the happy path.
- No sleeps, real network or random data without a fixed seed.
```

- `description` is required: the lead reads it to choose. `model` and `skills` are optional.
- The built-in roles live in the plugin's `roles/` folder: `general`, `docs`, `refactor`,
  `researcher`, `security` and `tester`.
- `researcher` is for "find out whether / how ..." tasks. The worker reads the project, the
  installed tools and the web, but changes no code. It writes a short note, usually
  `docs/research/<topic>.md`: the short answer first, what exists (with file:line, URL or
  version), what doesn't exist or couldn't be checked, and a next step.
- Tasks made before with the old roles `tests`, `backend` or `frontend` still show that
  name. When such a task starts or is retried, `tests` runs as `tester` and `backend` or
  `frontend` as `general`, with a history line saying so. A project file
  `.symcc/roles/frontend.md` (for example) brings the old role back, and then nothing changes.
- Your own roles go in `.symcc/roles/<name>.md` in your project. A file with the same name as
  a built-in role replaces it; a new name adds a role. Names use letters, digits, `-` and `_`.
- The files are read again when a session starts, when a worker starts, when a task's role
  is set, and when Claude Code saves a file in `.symcc/roles/`. An edit counts from the next
  worker on; no restart needed.
- A file that can't be used (no front matter, no description, a bad name) is skipped, and
  you get a note once, for example `symcc: skipped .symcc/roles/x.md: no description`.
- Every role gets the same safety checks: its own copy of the code, the scope check, the
  tests and (if set) your review.

You can change a task's role yourself: say "use the security role for T-12", or open the task
in the board panel and press `l` (Role) to pick one. That works on a task to do, paused,
failed or in the backlog. The board list shows a role at the right end
of the task's row (`tester · try 2`); `general` shows nothing.

**One task, one role.** When a feature needs several kinds of work and each part is big
enough to stand alone, the lead splits it into one task per role and links them with `after`:

```
T-20  general   Add the /export endpoint and the export button
T-21  security  Check the export for data leaks      (after T-20)
T-22  tester    Tests for export, errors included    (after T-20)
T-23  docs      Explain export in the user guide     (after T-20)
```

T-21, T-22 and T-23 run at the same time, since they change different files. A small request stays
one `general` task: each extra task costs a worker run, a test run and a merge.

---

## Which branch work goes into

- A new board merges into **the branch you had checked out** when the board was made.
  (On a detached checkout it uses the repo's main branch: `main` or `master`.)
- Change it by telling the lead, e.g. "merge into `develop`" (the `target_branch`
  setting). Only a branch that exists is accepted.
- If you switch to another branch, the board warns you:
  `merging into main · you're on my-feature`.
- If the branch doesn't exist, nothing starts and nothing is marked failed; the lead is
  told once.

### A folder without git

symcc needs **git** (the program) and a git repo with at least one commit: each worker
gets its own git worktree. It checks this when a session starts and before a worker starts.

- **git not installed**: nothing starts; the banner and status line say
  `git is not installed`, and the lead tells you how to install it (macOS:
  `xcode-select --install`, or https://git-scm.com).
- **No git repo, or no commits yet**: a git repo is set up for you, but symcc asks
  first. The lead asks you; say yes, or press **g** ("Set up git") in the board panel.
  Nothing starts until it's done. The setup:
  - runs `git init -b main` (skipped if a repo is already there);
  - writes a `.gitignore` (or adds to yours, never twice) with `.symcc/`,
    `node_modules/`, `.env`, `.env.*`, `.DS_Store`, `dist/`, `build/`, `__pycache__/`
    and `.venv/`;
  - makes a first commit of the current files, "Initial commit (by symcc)", leaving
    out (and ignoring) files that look like secrets (`.env`, `*.pem`, `id_rsa`) or
    are over 50 MB; the result says which;
  - sets the target branch to `main`. It never pushes and adds no remote.

---

## Keeping work moving on its own

Every two minutes symcc checks the board by itself. It:

- starts tasks that are ready (up to `max_parallel`, 3 by default, at once),
- stops a worker that runs too long (`max_minutes`, 45 by default) and marks the task failed,
- notices a worker that ended without reporting back,
- reminds the lead about a failed task nobody has dealt with for 10 minutes,
- once an hour, archives old finished tasks (see below).

A stopped worker can't do anything more: symcc refuses every tool it tries to use.

**Several Claude Code windows on the same project?** Only one of them *drives* the
board (starts workers, merges, runs scouts). The others can see and change the board but
start nothing. If the driving window closes, another one takes over within a few minutes.

### Old tasks are archived

So `board.json` stays small, done and dropped tasks that have not changed for
`archive_days` days (14 by default) move to `.symcc/archive.json`.

- **When:** on the regular check, in the driving window, at most once an hour.
  `archive_days 0` turns it off (`/symcc-settings archive_days 0`).
- **Safely:** the archive is written first (to a temp file, then renamed), and only then are
  the tasks taken off the board. If writing the archive fails, nothing leaves the board.
  If `archive.json` can't be read, symcc never writes over it: it keeps a copy
  (`archive.json.broken-<time>`), tells you, and archives nothing more until it is fixed.
- **Never in the way:** a done task that an unfinished task still waits for (its `after`)
  stays on the board. A task waiting on an archived done task still starts.
- **Still counted:** the Done row says how many were archived, e.g. `▸ Done  12 (+96 archived)`,
  and the board's total time and tokens include them. Task numbers are never reused.
- **Finding one:** `/symcc-task T-12` shows an archived task (or ask the lead, who can look
  it up with its `board` tool). Archived tasks are read-only: change, ask, approve and so on
  answer "T-12 is archived". Retrying an archived *dropped* task brings it back to the
  board as `todo`, with a history line.

---

## Stats: time and tokens

`/symcc-stats` prints a plain text report built only from what the board already keeps (each
task's tries with their start, end and tokens, its tries count and its history), archived
tasks included. You can also ask the lead, e.g. "how much did we spend this week?": it uses
its read-only `stats` tool.

- **Range:** `/symcc-stats` covers every task; `/symcc-stats 7d` the tasks changed in the last
  7 days; `/symcc-stats T-100..T-130` an id range.
- **Parts:** totals (tasks by status, worker time, tokens); per task (average and median time
  and tokens of done tasks, tries per task, the 5 biggest by tokens and by time); per try
  (average time and tokens, share of tasks done on the first try); flow (time from made to
  done); outcomes (merged on its own or approved by you, failed tries by reason: tests,
  clash with main, scope, stopped, rejected); by role and by origin; the last 7 days with activity.
- **What is left out:** older tasks with no tries recorded are left out of the averages (the
  report says how many). Scout runs aren't counted. Time waiting for you is not shown: history
  lines have no times. A try from an older board with no end time counts up to the next try,
  or the task's last change.

---

## Turning symcc off

The board mode `off` only stops the workers: Claude still acts as the lead. To have Claude
go back to normal, type `/symcc-off` (or set `enabled` to off in the Settings view). From
your next message, no restart needed:

- the lead instructions are no longer added to Claude's prompt,
- running workers and scouts are stopped (their tasks go back to `todo`) and nothing new starts,
- no "[symcc] Board update" messages and no voice,
- the panel does not open by itself and the status line just says `symcc off · /symcc-on`,
- the symcc tools answer "symcc is off. The owner can turn it on with /symcc-on." and change nothing.

The board, its tasks, its mode and the scouts are kept. `/symcc-on` turns everything back
on, in the mode the board had. The switch is kept per project, as `enabled` in
`.symcc/board.json` (a board without it is on).

---

## Where everything lives

```
your-project/
└── .symcc/
    ├── board.json        the board: settings + every task
    ├── archive.json      old done and dropped tasks, moved off the board (see archive_days)
    ├── board.lock        held for a moment while a window saves the board
    ├── lead.json         which window drives the board (with a heartbeat)
    ├── scouts/           your scout files (*.md)
    ├── scouts.json       each scout's last run and report, and whether it is paused
    ├── roles/            your own worker roles (*.md), see Worker roles
    ├── reports/          each try's full worker report (T-3-try-2.md)
    └── worktrees/
        └── T-3/          a worker's private copy of the project (branch symcc/T-3),
                          kept while it waits for review, removed after it is merged
```

Add `.symcc/` to your project's `.gitignore` so the board and the copies stay local.

A task's branch (`symcc/T-3`) and its folder are removed once the task is merged, so old
branches don't pile up; the regular check also tidies up any left from before. Branches are
deleted with `git branch -d`, so git refuses if anything is not merged. A dropped task loses
its folder but keeps its branch, in case you want to look at its work. Branches that don't
start with `symcc/` are never touched.

---

## Good to know

- **A worker's copy has no installed packages.** `node_modules/` and other ignored
  folders are not copied into `.symcc/worktrees/T-…`. If your tests need them, say so in
  the task (for example: link the main project's `node_modules`, and remove the link
  before finishing).
- **Big tasks can run out of time.** A task that touches a lot of code may need more than
  45 minutes; raise `max_minutes` or split the task.
- **Finished workers in Claude Code's agent list.** After a task is done, its worker stays in the list below the prompt for a while, showing its last step (for example "◯ symcc-T-94 Splitting status strip test…"). It isn't running or using tokens; Claude Code clears it by itself later, and plugins can't remove or relabel it. The board shows the real state of each task.
- **What workers and scouts can use.** Workers can't commit, push or merge. They use
  Read, Edit, Write, Glob, Grep and Bash, with edits accepted automatically, inside your
  normal Claude Code permission settings. Scouts can't edit or write files: they use Read,
  Glob, Grep, Bash, WebSearch and WebFetch, and their shell commands follow the same rules.
- **A dropped task never runs on its own.** There is no delete; a dropped task stays on
  the list (until it is archived), and nothing automatic (retries after failed tests, a finishing check) starts
  it again. To bring it back on purpose, press `r` (Retry) on its page or ask the lead to
  retry it: it goes back to `todo`, with "brought back from dropped" in its history.
  `done` is final: a done task can't be retried or sent a question.

---

## Renaming the plugin

The name comes from one place: `"name"` in `.claude-plugin/plugin.json`. Everything else is
made from it: the data folder (`.<name>/`), task branches (`<name>/T-1`), the commit author,
the agent types (`<name>:worker`, `<name>:scout`), the tool names (`mcp__<name>__add`), the
slash commands (`/<name>`, `/<name>-mode`, `/<name>-help`, ...) and all the text on the board.
To rename it:

1. Change `"name"` in `.claude-plugin/plugin.json`, and `DEFAULT_NAME` in `hooks/name.ts`.
2. Change the name in the `atom({ plugin: ... })` lines near the top of
   `hooks/plugin/state.ts` (`opened`, `tab`, `scout`, `view`) and under `PluginState` in `types/index.d.ts`. Claude Code reads
   which values a plugin keeps before it runs, so these must be written out as text.
3. Move the old data folder in each project, e.g. `mv .symcc .crew`. Nothing is moved for
   you; if only the old folder is there, the plugin shows a note once when a session starts.
4. Update `.gitignore` to ignore the new folder (`.crew/`).

Old task branches keep their old names (`symcc/T-1`); they still work.

---

## For developers: where the code is

| File or folder | What's in it |
|---|---|
| [`hooks/register.tsx`](../hooks/register.tsx) | Only the wiring: the `on(...)` calls that hand Claude Code events to the modules below |
| [`hooks/core/`](../hooks/core/) | The board as plain data (`board-file.ts`, `task.ts`, `review.ts`, `banner.ts`, `scouts.ts`, ...). No Claude Code calls, so it's easy to test |
| [`hooks/board.ts`](../hooks/board.ts) | A barrel: it only re-exports `hooks/core/*`, so tests and other files import from one place |
| [`hooks/plugin/`](../hooks/plugin/) | The Claude Code side: the lead's tools (`tools.ts`), workers (`workers.ts`), git (`git.ts`), review and merge, scouts, roles. Shared state is the `S` object in `state.ts` |
| [`hooks/plugin/ui/`](../hooks/plugin/ui/) | The panel pages and the part above the prompt (`list.tsx`, `task-page.tsx`, `scouts-page.tsx`, `settings.tsx`, ...) |
| [`hooks/name.ts`](../hooks/name.ts) | Everything made from the plugin's name |
| [`types/index.d.ts`](../types/index.d.ts) | The shapes of a task, a try, a scout |
| [`tests/`](../tests/) | `board.test.ts` (the board logic), `pane.test.tsx` (the panel) |

**Where to add a new feature:** pure logic goes in `hooks/core/`; Claude Code wiring goes in `hooks/plugin/`; panel pages go in `hooks/plugin/ui/`.

**Two rules the loader needs:**

- A function that takes `$` and is imported from another file must be a `function` declaration, not an arrow `const`.
- Panel atoms (`read` / `update`) must be used in the file that declares them. From other files, use the `readX` / `updateX` helpers in `hooks/plugin/state.ts`.

---|---|
| [`hooks/register.tsx`](../hooks/register.tsx) | Everything that talks to Claude Code: the lead's tools, starting and stopping workers, checking and merging, scouts, the panel and status line |
| [`hooks/board.ts`](../hooks/board.ts) | The board as plain data: adding and changing tasks, which tasks are ready, the scope check, retry rules, who drives, the banner text. No Claude Code calls, so it's easy to test |
| [`hooks/name.ts`](../hooks/name.ts) | Everything made from the plugin's name |
| [`types/index.d.ts`](../types/index.d.ts) | The shapes of a task, a try, a scout |
| [`tests/`](../tests/) | `board.test.ts` (the board logic), `pane.test.tsx` (the panel) |

---

## Working on symcc

- **Run the tests:** `claude plugin test .` from the project folder.
- **Where tests live:** `tests/board.test.ts` tests the board logic; `tests/pane.test.tsx` tests the panel.
- **Layout:** `hooks/core/` holds the logic you can test (plain data, no Claude Code calls). `hooks/plugin/` and `hooks/plugin/ui/` do the wiring to Claude Code, and `hooks/register.tsx` only connects events. Put new logic in `hooks/core/` when you can. See the code map above.
- **Rebuild the SVG pictures:** the pictures are made by scripts, so don't edit them by hand. The steps are in "How to change it" in [`architecture.md`](architecture.md) (for `architecture.svg`) and in [`demo.md`](demo.md) (for `demo.svg`).
