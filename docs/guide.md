# symcc guide

The full details. For the short version, see the [README](../README.md).

- [The parts and their names](#the-parts-and-their-names)
- [A task's life](#a-tasks-life)
- [What happens when a worker finishes](#what-happens-when-a-worker-finishes)
- [Approval before merge](#approval-before-merge)
- [Live status: seeing the board](#live-status-seeing-the-board)
- [Scouts](#scouts)
- [Which branch work goes into](#which-branch-work-goes-into)
- [Keeping work moving on its own](#keeping-work-moving-on-its-own)
- [Where everything lives](#where-everything-lives)
- [Good to know](#good-to-know)
- [Renaming the plugin](#renaming-the-plugin)
- [For developers](#for-developers-where-the-code-is)

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
   │         └──▶ worker has a question ──▶ failed + question to the lead
   │
   ├── review   (only in review mode) checks passed; waits for YOUR approve
   │            (merge) or reject with a reason (back to todo, fresh worker)
   ├── waiting  the lead asked YOU something; your answer sends it back to work
   ├── paused   stopped on purpose; "resume" sends it back
   ├── dropped  cancelled; stays on the list, never runs
   └── backlog  a parked idea or unclear work; never starts until you move it
                to todo ("move T-5 to todo"); "stash" sends a todo, paused or
                failed task back here
```

| Status | Meaning |
|---|---|
| `todo` | Ready to be picked up (once the tasks it waits for are done) |
| `doing` | A worker is on it right now |
| `waiting` | It needs an answer from you |
| `review` | Ready for review: the worker is done and the checks passed, but nothing is merged until you approve it |
| `paused` | Stopped on purpose, until resumed |
| `failed` | It could not be finished; the lead decides what next |
| `done` | Merged into your branch |
| `dropped` | Cancelled |
| `backlog` | A parked idea or unclear work. It never starts until you move it to todo. In the board panel it sits in a folded "▸ Backlog · N" group |

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
   out with uncommitted changes, symcc waits instead of overwriting them.
7. **Tell.** The lead gets one line: merged, or why not. On a Mac you also hear
   "T-3 done".

> **Set a test command.** With no test command, step 4 is skipped and any change
> that passes the scope check is merged. Say "set the test command to …" to the lead.

---

## Approval before merge

The board has one mode, set with `/symcc-mode` or by telling the lead (the setting `mode`):

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

Both only work on a task in `review`. Switching back to `auto` does not merge tasks
already waiting; approve or reject each of them.

You can also do it yourself:

- **In the board panel**, tasks ready for review are listed near the top. Open one to see
  the files it changed with `+`/`-` line counts. Press `d` (Show changes) for the whole
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

---

## Live status: seeing the board

- **The panel** opens by itself when a session starts (on a wide enough terminal; turn it
  off with the `open_on_start` setting). It shows a small banner (folder, branch, test
  command, limits, counts) and the task list.
- **`/symcc`** opens the interactive board: ↑↓ to move, Enter to open a task, Esc to
  close. An open task shows everything about it, with buttons to pause, resume, retry,
  drop, watch its worker live, and a box to answer it when it waits for you.
  `/symcc-task T-3` opens one task directly; `/symcc-tasks` and `/symcc-scouts` open a view.
- The panel has two views, Tasks and Scouts, shown as tabs under the banner. Press `t` or
  `s` (or click a tab) to switch. The Scouts view lists each scout: how often it runs, its
  model, whether it is running or when it runs next, and when it last ran. Enter opens a
  scout: its file, its instructions, its last report, and buttons to run it now or see
  where to edit it. Esc goes back to the list.
- Panel keys: `a` approve, `x` reject or drop, `d` changes, `p` pause, `u` resume,
  `r` retry, `m` switch review / auto, `n` needs review, `t` / `s` switch views, `b` back.
- **Ctrl+T** (Claude Code's background tasks) shows running workers; open one to watch it.
- Each task lists how long each try took and the tokens it used; the board ends with a
  total, e.g. `total: 1h 12m · 1.2M tokens over 4 tries`.

---

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
[`test-gaps.md`](../examples/scouts/test-gaps.md) and
[`deps.md`](../examples/scouts/deps.md), which checks the web for new versions and
security notices.

You can also make and change scouts right in the board panel: on the Scouts view, "New
scout" asks for a name, and "Edit" on a scout's page lets you change how often it runs, its
model and its instructions. Save writes the file (other front matter keys are kept) and the
new timing applies at once. `/symcc-scout <name>` runs a scout now.

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
- reminds the lead about a failed task nobody has dealt with for 10 minutes.

A stopped worker can't do anything more: symcc refuses every tool it tries to use.

**Several Claude Code windows on the same project?** Only one of them *drives* the
board (starts workers, merges, runs scouts). The others can see and change the board but
start nothing. If the driving window closes, another one takes over within a few minutes.

---

## Where everything lives

```
your-project/
└── .symcc/
    ├── board.json        the board: settings + every task
    ├── board.lock        held for a moment while a window saves the board
    ├── lead.json         which window drives the board (with a heartbeat)
    ├── scouts/           your scout files (*.md)
    └── worktrees/
        └── T-3/          a worker's private copy of the project (branch symcc/T-3),
                          kept while it waits for review, removed after it is merged
```

Add `.symcc/` to your project's `.gitignore` so the board and the copies stay local.

---

## Good to know

- **A worker's copy has no installed packages.** `node_modules/` and other ignored
  folders are not copied into `.symcc/worktrees/T-…`. If your tests need them, say so in
  the task (for example: link the main project's `node_modules`, and remove the link
  before finishing).
- **Big tasks can run out of time.** A task that touches a lot of code may need more than
  45 minutes; raise `max_minutes` or split the task.
- **`dropped` is the end.** There is no delete; a dropped task stays on the list but
  never runs again.

---

## Renaming the plugin

The name comes from one place: `"name"` in `.claude-plugin/plugin.json`. Everything else is
made from it: the data folder (`.<name>/`), task branches (`<name>/T-1`), the commit author,
the agent types (`<name>:worker`, `<name>:scout`), the tool names (`mcp__<name>__add`), the
slash commands (`/<name>`, `/<name>-mode`, `/<name>-help`, ...) and all the text on the board.
To rename it:

1. Change `"name"` in `.claude-plugin/plugin.json`, and `DEFAULT_NAME` in `hooks/name.ts`.
2. Change the name in the two `atom({ plugin: ... })` lines near the top of
   `hooks/register.tsx` and under `PluginState` in `types/index.d.ts`. Claude Code reads
   which values a plugin keeps before it runs, so these must be written out as text.
3. Move the old data folder in each project, e.g. `mv .symcc .crew`. Nothing is moved for
   you; if only the old folder is there, the plugin shows a note once when a session starts.
4. Update `.gitignore` to ignore the new folder (`.crew/`).

Old task branches keep their old names (`symcc/T-1`); they still work.

---

## For developers: where the code is

| File | What's in it |
|---|---|
| [`hooks/register.tsx`](../hooks/register.tsx) | Everything that talks to Claude Code: the lead's tools, starting and stopping workers, checking and merging, scouts, the panel and status line |
| [`hooks/board.ts`](../hooks/board.ts) | The board as plain data: adding and changing tasks, which tasks are ready, the scope check, retry rules, who drives, the banner text. No Claude Code calls, so it's easy to test |
| [`hooks/name.ts`](../hooks/name.ts) | Everything made from the plugin's name |
| [`types/index.d.ts`](../types/index.d.ts) | The shapes of a task, a try, a scout |
| [`tests/`](../tests/) | `board.test.ts` (the board logic), `pane.test.tsx` (the panel) |
