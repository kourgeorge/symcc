# symcc

**symcc turns one Claude Code chat into a small team.**

You talk to your normal Claude Code chat. It writes tasks on a shared board. Helpers
pick the tasks up and build them in parallel, each in its own copy of your code. When a
helper finishes, symcc checks the work, runs your tests, and merges it into your branch
only if everything passes. Then it tells the chat, and the chat tells you.

It runs inside Claude Code. While Claude Code is open, work keeps moving; when you close
it, work stops (and picks up again next time).

---

## The four parts

| Part | What it is | What it does |
|---|---|---|
| **You** (the owner) | The person typing | Say what you want, answer questions, decide |
| **The lead** | Your normal Claude Code chat | Turns your wishes into tasks, watches the board, decides what to do when something fails |
| **Workers** | Background helpers (one per task) | Each builds one task in its own copy of the project, then stops |
| **Scouts** (optional) | Background readers you define | Look through the code on a timer and report problems; they never change files |

All four share one thing: **the board**, a plain file in your project at
`.symcc/board.json`.

---

## The whole flow in one picture

```
  you ──"add a search box"──▶  LEAD (your chat)
                                  │  writes tasks
                                  ▼
                       ┌─────────────────────┐
                       │  .symcc/board.json  │   T-1 todo · T-2 todo (after T-1)
                       └─────────────────────┘
                                  │  a task is ready
                                  ▼
            symcc makes a private copy of the code for it:
            .symcc/worktrees/T-1   on branch symcc/T-1
                                  │
                                  ▼
                       WORKER builds T-1 there
                                  │  "done: I added the index"
                                  ▼
            symcc checks the work:
              1. commit the worker's changes
              2. only the task's files touched?      ── no ───────▶ not merged
              3. bring in the latest of your branch  ── clash ────▶ new try
              4. run your test commands              ── fail ─────▶ new try
              5. all good → merge into your branch
                                  │
                                  ▼
            LEAD is told "✓ T-1 merged"  ──▶  tells you, T-2 starts
```

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
   │         └──▶ worker has a question ──▶ failed + question to the lead
   │
   ├── review   (only with the review step) checks passed; waits for YOUR approve
   │            (merge) or reject with a reason (back to todo, fresh worker)
   ├── waiting  the lead asked YOU something; your answer sends it back to work
   ├── paused   stopped on purpose; "resume" sends it back
   └── dropped  cancelled; stays on the list, never runs
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

---

## A short example

```
you   add a search command, and make the errors friendlier
lead  Three tasks: T-1 the search index, T-2 the command (after T-1), T-3 the errors.
      …a few minutes later…
lead  T-1 merged. T-3 failed its tests (a message changed); symcc is retrying it
      with the failing output.
      …
lead  T-3 merged. T-2 is running now.
```

You never have to type a command. Just talk to the lead:

- "what's going on?"
- "do T-4 first"
- "T-3 should also handle emails"
- "pause T-5" · "drop T-2" · "stop everything"
- "set the test command to `npm test`"
- "give workers 90 minutes"

---

## What happens when a worker finishes

This is where symcc keeps your branch safe. Step by step:

1. **Commit.** symcc commits what the worker changed in its private copy. (Workers are
   not allowed to commit, push or merge themselves.)
2. **Scope check.** Every task lists the files it may change. If the worker changed
   anything else, nothing is merged.
3. **Catch up.** If your branch has moved on since the worker started (for example,
   another task was merged), symcc brings those changes into the task's copy first.
   If they clash, a new worker is started to sort out the clash (up to 2 times).
4. **Test.** symcc runs your test commands on the combined code. If they fail, the task
   goes back to `todo` and the next worker is shown the end of the failing output and
   told to fix it (2 times by itself; then it is marked `failed` for the lead).
5. **Review (optional).** With the review step on (see below), the task stops here as
   `review` ("ready for review") and nothing is merged until you say so.
6. **Merge.** Only now does your branch move forward. If you have that branch checked
   out with uncommitted changes, symcc waits instead of overwriting them.
7. **Tell.** The lead gets one line: merged, or why not. On a Mac you also hear
   "T-3 done".

### Review before merge (optional)

By default (`approval` = `auto`) a task that passes steps 1–4 is merged at once. To look at
the work first:

- Say "review everything before merging" (the setting `approval` = `review`): every task
  that finishes from then on waits as `review`.
- Or mark one task: "T-5 needs review" (`needs_review` on `symcc add` / `symcc change`).
  That task waits even when the board is on `auto`.

The lead tells you "T-5 is ready for review". The task's branch (`symcc/T-5`) and copy
(`.symcc/worktrees/T-5`) are kept so you can look at the change. Then:

- **Approve** ("approve T-5", tool `symcc approve`): symcc runs the same checked merge as
  always: brings the task up to date with your branch, checks the files, runs the tests
  again if it had to bring in new changes, and retries clashes. Then the task is `done`.
- **Reject** with a reason ("reject T-5: the button should be blue", tool `symcc reject`):
  nothing is merged; the task goes back to `todo` with your reason in its history, and a
  fresh worker redoes it with that reason in front of it.

You can do all of this yourself, too:

- **In the board panel**, tasks ready for review are listed near the top. Open one to see
  the files it changed with `+`/`-` line counts. Press `d` (Show changes) for the whole
  diff, or pick a file for just that file's diff, with added lines in green and removed
  lines in red. `a` approves, `x` rejects (it asks for a short reason first), `b` goes back.
  A very long diff is cut, with a note like `… 340 more lines (see /board diff T-5)`.
- The banner shows `approval: auto` or `approval: review`; press `m` to switch.
- In any open task, `n` turns that task's own "needs review" on or off.
- **Slash commands:** `/board approve T-5`, `/board reject T-5 <reason>`,
  `/board diff T-5` (the changed files with `+`/`-` counts) or `/board diff T-5 <file>`
  (that file's full diff), and `/board mode auto|review` (with no word: shows the mode).
- The status line counts them by ID, e.g. `1 to review (T-5)`.

Both only work on a task in `review`. Switching back to `auto` ("merge on your own again")
does not merge tasks already waiting; approve or reject each of them.

> ⚠️ **Set a test command.** With no test command, step 4 is skipped and any change
> that passes the scope check is merged. Say "set the test command to …" to the lead.

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

---

## Keeping work moving on its own

Every two minutes symcc checks the board by itself. It:

- starts tasks that are ready (up to 3 at once),
- stops a worker that runs too long (45 minutes unless changed) and marks the task failed,
- notices a worker that ended without reporting back,
- reminds the lead about a failed task nobody has dealt with for 10 minutes.

A stopped worker can't do anything more: symcc refuses every tool it tries to use.

**Several Claude Code windows on the same project?** Only one of them *drives* the
board (starts workers, merges, runs scouts). The others can see and change the board but
start nothing. If the driving window closes, another one takes over within a few minutes.

---

## Seeing the board

- **The panel** opens by itself when a session starts (on a wide enough terminal, about
  144 columns). It shows a small banner (folder, branch, test command, limits, counts)
  and the task list.
- **`/board`** opens the interactive board: ↑↓ to move, Enter to open a task, Esc to
  close. An open task shows everything about it, with buttons to pause, resume, retry,
  drop, watch its worker live, and a box to answer it when it waits for you.
  `/board T-3` opens one task directly.
- The panel has two views, Tasks and Scouts, shown as tabs under the banner. Press `t` or
  `s` (or click a tab) to switch. The Scouts view lists each scout: how often it runs, its
  model, whether it is running or when it runs next, and when it last ran. Enter opens a
  scout: its file, its instructions, its last report, and buttons to run it now or see
  where to edit it. Esc goes back to the list.
- **Ctrl+T** (Claude Code's background tasks) shows running workers; open one to watch it.
- Each task lists how long each try took and the tokens it used; the board ends with a
  total, e.g. `total: 1h 12m · 1.2M tokens over 4 tries`.

---

## Commands

| Command | What it does |
|---|---|
| `/board` | Open the board (`/board T-3` for one task) |
| `/board approve T-5` · `/board reject T-5 <reason>` | Merge a task that is ready for review, or send it back with a reason |
| `/board diff T-5 [file]` | The files a task in review changed (+/- lines), or one file's full diff |
| `/board mode [auto\|review]` | Show or set the approval mode |
| `/scouts` | Open the panel on the Scouts view (a text list if the panel can't be shown); `/scouts run <name>` runs one now |
| `/stop-all` | Stop every worker and scout now and pause the board |
| `/resume-all` | Let work start again |
| `/symcc-man` | The built-in manual |

Everything else, just say it to the lead.

---

## Settings

Change any of these by telling the lead (e.g. "give workers 90 minutes").

| Setting | Default | Meaning |
|---|---|---|
| `test_commands` | none | Shell commands that must pass before anything is merged |
| `target_branch` | your branch | Where finished work is merged |
| `max_parallel` | 3 | How many workers at once |
| `max_minutes` | 45 | A worker running longer is stopped |
| `auto_retries` | 2 | New tries after failing tests before a task is marked failed (0–10) |
| `open_on_start` | on | Open the board panel when a session starts |
| `voice` | on | Say "T-3 done" out loud when a task is merged |
| `approval` | auto | `auto`: merge a finished task that passes at once. `review`: every finished task waits for you to approve or reject it |
| `paused` | off | Stop starting new work (running workers carry on) |

---

## Scouts: your own issue finders

A scout is one Markdown file in `.symcc/scouts/`. The top says how often it runs (and,
if you like, which model); the rest is its instructions.

```markdown
---
every_minutes: 30
model: sonnet
---
Look for risky code that has no tests. Point at file:line and say what could go wrong.
```

Scouts only read files. What they find goes to the lead, which puts the worthwhile items
on the board as tasks. `examples/scouts/` has two to copy.

You can also make and change scouts right in the board panel: on the Scouts view, "New
scout" asks for a name, and "Edit" on a scout's page lets you change how often it runs, its
model and its instructions. Save writes the file (other front matter keys are kept) and the
new timing applies at once.

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

## Install

```bash
claude --plugin-dir /path/to/symcc
```

---

## Safety

- Changes outside a task's files, or that fail the tests, are never merged.
- With the review step on, nothing is merged until you approve it; the lead should only
  approve when you say so.
- Your branch only moves through a checked merge. If you have uncommitted changes on it,
  symcc waits instead of overwriting them.
- Workers can use Read, Edit, Write, Glob, Grep and Bash, with edits accepted
  automatically, inside your normal Claude Code permission settings. Scouts can only read.

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
manual command (`/<name>-man`) and all the text on the board. To rename it:

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
| `hooks/register.tsx` | Everything that talks to Claude Code: the lead's tools, starting and stopping workers, checking and merging, scouts, the panel and status line |
| `hooks/board.ts` | The board as plain data: adding and changing tasks, which tasks are ready, the scope check, retry rules, who drives, the banner text. No Claude Code calls, so it's easy to test |
| `hooks/name.ts` | Everything made from the plugin's name |
| `types/index.d.ts` | The shapes of a task, a try, a scout |
| `tests/` | `board.test.ts` (the board logic), `pane.test.tsx` (the panel) |
