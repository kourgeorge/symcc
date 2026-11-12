<p align="center">
  <img src="docs/logo.svg" alt="symcc: lead a team of coding agents from one chat" width="760">
</p>

<p align="center">
  <b>Lead a team of coding agents from one chat: organized, supervised, and proactive.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-D97757" alt="Claude Code plugin">
  <a href=".claude-plugin/plugin.json"><img src="https://img.shields.io/github/package-json/v/kourgeorge/symcc?filename=.claude-plugin%2Fplugin.json&color=blue" alt="version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="https://github.com/kourgeorge/symcc/commits/main"><img src="https://img.shields.io/github/last-commit/kourgeorge/symcc" alt="last commit"></a>
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#quick-start">Quick start</a> · <a href="#how-it-works">How it works</a> · <a href="docs/guide.md">Guide</a> · <a href="docs/demo.svg">Demo</a>
</p>

<p align="center">
  <img src="docs/demo.svg" alt="symcc demo" width="860">
</p>

**An example.** You are building a feature. Meanwhile a scout notices an untested error
path. The lead puts it on the board, a worker fixes it in its own git worktree, the tests
pass, and the change comes back to your chat for approval. You never had to notice the
gap, write a ticket or open another app.

**symcc connects discovery to delivery, inside Claude Code.**

With coding agents you are no longer one developer. You are a team lead, with many tasks
running at once. symcc keeps that work organized and tested, and it also finds work on its
own. It is proactive while your Claude Code session is open: work stops when you close it
and picks up again next time.

The four parts, in known terms:

- **Lead**: the orchestrator agent. It is your normal Claude Code chat. It plans, breaks
  work into tasks and supervises.
- **Board**: a task board (todo / doing / review / done) for requested and discovered work.
- **Workers**: parallel agents, each in an isolated git worktree on its own branch.
- **Scouts**: scheduled background agents for discovery (bugs, missing tests, outdated
  dependencies, security notices). They are read-only: they report and never change files.

---

## Features

| Feature | What it does |
|---|---|
| **Orchestrator agent** | The lead (your Claude Code chat) plans, breaks work into tasks, supervises workers and reports to you. |
| **Task board** | One board for requested work (from you) and discovered work (from scouts), with live statuses. |
| **Parallel agents** | Several tasks run at once (3 by default), each in its own git worktree, so they never collide. |
| **Isolated worktrees** | Each task gets its own branch (`symcc/T-1`) and copy of the project; your branch is untouched until merge. |
| **Scheduled discovery agents** | Scouts run on a timer, read the code, run commands and search the web, then report. They are read-only. |
| **Task dependencies** | The lead decides which tasks must finish first: a task with `after: T-1` waits until T-1 is merged, then starts on top of it. Tasks that change the same files are put one after another, so they don't clash; independent tasks run in parallel. |
| **Scope check** | Each task lists the files it may change; changes outside that scope are not merged. |
| **Automatic retries** | When tests fail, a new worker gets the failing test output and tries again (2 times by default). |
| **Test gate** | Your test commands must pass before anything is merged. |
| **Approval before merge** | Human-in-the-loop review: see the diff, then approve, or reject with a reason. |
| **Merge into the target branch** | The task is updated on the latest target branch, tests run again, then it is merged. |
| **Live status** | The board panel and the status line show every task as it runs. |
| **Backlog** | Park ideas and unclear work on the board; they never start until you move them to todo. |

Every two minutes symcc also checks the board by itself: it starts ready tasks, and stops a
worker that runs longer than `max_minutes` (45 by default).

---

## What symcc adds

Multi-agent coding with worktrees and task boards exists already, including Claude Code's
own agent teams. symcc does not claim to invent that. What symcc adds is the combination:

- **Scheduled discovery agents** (scouts) that find work on their own.
- **One task board** for discovered work and requested work.
- **A scope check** for every task.
- **Automatic retries** that hand the failing test output to the next worker.
- **Human-in-the-loop approval** of each diff before merge.

All of it runs from your normal Claude Code chat. There is no extra app, no memory layer
and no issue-tracker integration. When two changes clash, symcc has no special conflict
solving: it starts a new worker to sort out the clash.

---

## How it works

![How symcc works: you, the lead, workers and scouts](docs/architecture.svg)

The flow is **discovery → triage → implementation → review → merge**.

1. **Discovery.** You ask for something ("add a search command, and make the errors
   friendlier"), or a scout finds something on its timer (say, a missing test).
2. **Triage.** The lead turns it into tasks on the board, e.g. T-1 the index, T-2 the
   command (after T-1), T-3 the errors. It also sets the order (which tasks wait for
   which) and the files each task may change, so work running in parallel doesn't collide.
3. **Implementation.** Workers start in parallel. Each task gets its own worktree, on its
   own branch (`symcc/T-1`).
4. **Checks.** symcc runs the scope check and the test gate. If the tests fail, automatic
   retries send the task to a new worker with the failing output.
5. **Review.** In review mode the task waits. You look at the diff and approve it, or
   reject it with a reason.
6. **Merge.** symcc updates the task on the latest target branch, re-runs the tests and
   merges. The next tasks start, and the lead tells you each step.

```
  you / scout ──▶ LEAD (your chat)                     discovery
                    │ writes tasks                     triage
                    ▼
         .symcc/board.json  (T-1, T-2, ...)
                    │ a task is ready
                    ▼
   WORKER builds it in .symcc/worktrees/T-1            implementation
                    │ done
                    ▼
   scope check + test gate ── fail ──▶ automatic retry
                    │ pass
                    ▼
   approval (review mode) ──▶ merge into target branch ──▶ next tasks start
```

---

## Install

### Requirements

- **Claude Code** with plugin function hooks (the `$.tool`, `$.agent` and `$.clock`
  plugin API, and panels). This API is early access and can change between releases.
  symcc is built and tested with Claude Code **2.1.319**; check yours with
  `claude --version`. The one-step install in Option B needs 2.1.275 or later.
- **git** (the program; workers get their own git worktree and branch). If it is
  missing, nothing starts and symcc tells you how to install it (macOS:
  `xcode-select --install`, or https://git-scm.com).
- **A git repo is set up for you** if the folder has none, or has no commits yet
  (symcc asks first). It runs `git init` on `main`, writes a `.gitignore` and makes a
  first commit of your files, leaving out secrets and files over 50 MB. It never
  pushes or adds a remote.

There is no build step and nothing to `npm install`: Claude Code loads the plugin's
`.tsx` code directly.

### Option A: try it from a clone

```bash
git clone https://github.com/kourgeorge/symcc ~/symcc
cd /path/to/your/project
claude --plugin-dir ~/symcc
```

`--plugin-dir` loads symcc for that session only, so start Claude Code this way each time.
To update: `git -C ~/symcc pull`, then start Claude Code again.

### Option B: install as a plugin (stays installed)

This repo is also a plugin marketplace (named `symcc`) with one plugin in it. Install in
one step:

```bash
claude plugin install symcc --marketplace kourgeorge/symcc
```

Or in two steps: add the marketplace, then install the plugin from it:

```bash
claude plugin marketplace add kourgeorge/symcc
claude plugin install symcc@symcc
```

Inside a Claude Code session the same works with `/plugin`, e.g.
`/plugin install symcc --marketplace kourgeorge/symcc`. It installs for you (user
scope) by default; add `--scope project` to share it with your project.

To update, then restart Claude Code:

```bash
claude plugin marketplace update symcc
claude plugin update symcc@symcc
```

To uninstall:

```bash
claude plugin uninstall symcc@symcc
claude plugin marketplace remove symcc
```

### Check it works

Start Claude Code in your project. The board panel opens by itself on a wide enough
terminal; if not, run `/symcc`. The status line starts with the mode, e.g. `⏵ auto`.

### First setup in your project

1. **Keep the board local:** add `.symcc/` to your project's `.gitignore`.
   ```bash
   echo ".symcc/" >> .gitignore
   ```
2. **Set your tests:** tell the lead "set the test command to `npm test`".
   Without a test command, changes are merged without running tests.
3. **Optional, a scout:** copy one from [`examples/scouts/`](examples/scouts/).
   ```bash
   mkdir -p .symcc/scouts
   cp ~/symcc/examples/scouts/deps.md .symcc/scouts/
   ```
   (With Option B, copy it from the repo on GitHub, or make one in the panel's Scouts view.)

### Troubleshooting

- **The panel doesn't open.** The terminal is too narrow. Make it wider, or run `/symcc`.
- **"branch doesn't exist".** No work starts, because the branch work merges into
  (`target_branch`) is gone or was never committed to. Make at least one commit, or tell
  the lead "merge into `main`" (any branch that exists).
- **Tests fail in workers' copies because packages are missing.** A worker's copy has no
  `node_modules/` (it is not copied). Say in the task that the worker should install them
  first (e.g. `npm ci`), or make the test command do it.

---

## Quick start

1. **Install** symcc (see [Install](#install)), e.g.
   `claude plugin install symcc --marketplace kourgeorge/symcc`.
2. **Keep the board local:** add `.symcc/` to your project's `.gitignore`.
3. **Set your tests:** tell the lead "set the test command to `npm test`".
4. **Ask for something.** "Add a dark mode toggle." Then watch the board.

---

## Things you can say

You never have to type a command. Just talk to the lead:

- "what's going on?"
- "do T-4 first" · "T-6 should wait for T-5"
- "T-3 should also handle emails"
- "pause T-5" · "drop T-2" · "stop everything"
- "set the test command to `npm test`"
- "give workers 90 minutes"
- "approve T-5" · "reject T-5: the button should be blue"
- "stash this idea" · "show the backlog" · "move T-5 to todo"

A short example:

```
you   add a search command, and make the errors friendlier
lead  Three tasks: T-1 the search index, T-2 the command (after T-1), T-3 the errors.
      …a few minutes later…
lead  T-1 merged. T-3 failed its tests (a message changed); symcc is retrying it
      with the failing output.
      …
lead  T-3 merged. T-2 is running now.
```

---

## Staying in control: approval before merge

The board has three modes. Change it with `/symcc-mode`, the `m` key in the panel, or by
telling the lead.

| Mode | Shown as | What happens |
|---|---|---|
| `auto` (default) | `⏵ auto` | Work runs. A finished task that passes the checks is merged at once. |
| `review` | `⏸ review merge` | Work runs. Every finished task waits for you to approve or reject it. |
| `off` | `⏹ off` | Every worker and scout stops at once. Nothing new starts. |

- **Approve or reject.** "approve T-5" merges it (after checking again). "reject T-5:
  the button should be blue" sends it back, and a fresh worker redoes it with your reason.
- **Review one task only.** In `auto`, say "T-5 needs review" and just that task waits.
- **Pause, resume, drop.** "pause T-5", "resume T-5", "drop T-2". A dropped task stays on
  the list but never runs.

Safety:

- Changes outside a task's scope, or that fail the tests, are never merged.
- In review mode nothing is merged until you approve it; the lead should only approve
  when you say so.
- Your branch only moves by a merge after the scope check and tests. If you have uncommitted changes on it,
  symcc waits instead of overwriting them.
- Workers can't commit, push or merge. They use Read, Edit, Write, Glob, Grep and Bash,
  with edits accepted automatically, inside your normal Claude Code permission settings.
- Scouts can't edit or write files. They use Read, Glob, Grep, Bash, WebSearch and
  WebFetch; their shell commands follow the same rules.

---

## Reference

The full details are in the **[guide](docs/guide.md)**: a task's life, what happens when a
worker finishes, review, the panel, scouts, branches, where files live, renaming the
plugin, and where the code is.

### Live status: seeing the board

- The panel opens by itself when a session starts (on a wide enough terminal). `/symcc`
  opens it any time: ↑↓ to move, Enter to open, Esc to close. `t` and `s` switch between
  the Tasks and Scouts views.
- Keys: `a` approve, `x` reject or drop, `d` show changes, `p` pause, `u` resume,
  `r` retry, `m` switch review / auto, `n` needs review for this task, `b` back.
- The status line starts with the mode, e.g. `⏸ review merge · 1 to review (T-5)`.
- **Ctrl+T** shows running workers; open one to watch it live.

### Commands

`/symcc` opens everything; `/symcc-<word>` does one thing.

| Command | What it does |
|---|---|
| `/symcc` | Open the board panel (tasks and scouts) |
| `/symcc-tasks` | Open the panel on the tasks view |
| `/symcc-scouts` | Open the panel on the scouts view and reload the scout files (a text list if the panel can't be shown) |
| `/symcc-task T-3` | Open one task |
| `/symcc-approve T-5` | Merge a task that is ready for review |
| `/symcc-reject T-5 <reason>` | Send a task in review back to `todo` with the reason |
| `/symcc-diff T-5 [file]` | The files a task in review changed (+/- lines), or one file's full diff |
| `/symcc-scout <name>` | Run a scout now |
| `/symcc-mode [off\|review\|auto]` | Set the board mode; no word switches `review` and `auto` (from `off`: `review`) |
| `/symcc-help [topic]` | The built-in manual |

If you rename the plugin, every command starts with the new name instead.

### Settings

Change any of these by telling the lead (e.g. "give workers 90 minutes").

| Setting | Default | Meaning |
|---|---|---|
| `test_commands` | none | Shell commands that must pass before anything is merged |
| `target_branch` | your branch | Where finished work is merged |
| `max_parallel` | 3 | How many workers at once |
| `max_minutes` | 45 | A worker running longer is stopped |
| `auto_retries` | 2 | New tries after failing tests before a task is marked failed (0–10) |
| `open_on_start` | on | Open the board panel when a session starts |
| `voice` | on | Say "T-3 done" out loud when a task is merged (Mac) |
| `mode` | `auto` | `off`, `review` or `auto` (see above) |

### Scouts

A scout is one Markdown file in `.symcc/scouts/`: how often it runs at the top, its
instructions below. A scout can read the code, run shell commands and search the web. It
reports what it finds to the lead and never changes files itself. Copy one from
[`examples/scouts/`](examples/scouts/), or make one in the panel's Scouts view.
More in the [guide](docs/guide.md#scouts).

### Task statuses

`todo` (ready) · `doing` (a worker is on it) · `waiting` (needs your answer) · `review`
(waits for your approve) · `paused` · `failed` (the lead decides what next) · `done`
(merged) · `dropped` (cancelled) · `backlog` (a parked idea; never starts until you move it
to todo). See [a task's life](docs/guide.md#a-tasks-life).

### Good to know

- Work goes into the branch you had checked out when the board was made; say "merge into
  `develop`" to change it.
- A worker's copy has no installed packages (`node_modules/` is not copied). If your tests
  need them, say so in the task.
- Big tasks can run out of time; raise `max_minutes` or split the task.
- Several Claude Code windows on one project: only one drives the board; another takes
  over if it closes.

### For developers

The code is in [`hooks/register.tsx`](hooks/register.tsx) (everything that talks to
Claude Code) and [`hooks/board.ts`](hooks/board.ts) (the board as plain data, easy to
test), with tests in [`tests/`](tests/). See the
[guide](docs/guide.md#for-developers-where-the-code-is) for more, and for
[renaming the plugin](docs/guide.md#renaming-the-plugin).
