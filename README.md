# symcc

**Turn one Claude Code chat into a small team that works in parallel, safely.**

![symcc demo](docs/demo.svg)

You ask for something in plain words. Your chat splits it into tasks. Helpers build the
tasks at the same time. Each change is checked and tested before it reaches your branch.
You stay in charge the whole way.

---

## What you get

- **Just talk.** Say what you want. The lead (your normal chat) splits your wish into
  several small tasks.
- **Work happens at the same time.** Up to 3 tasks run at once. Each one has its own copy
  of your code (a git worktree), so they never step on each other.
- **Every change is checked.** A change may only touch its own files, and your tests must
  pass, before it can be merged.
- **You can see what is happening.** The board panel and the status line show every task
  live.
- **You decide.** Look at a finished change (the files, the `+`/`-` lines, the full diff)
  and approve or reject it.
- **It looks ahead for you.** Scouts run on a timer, look for bugs, missing tests or new
  versions of your dependencies, and suggest work. The lead tells you; nothing changes
  without a task.
- **It stops when you stop.** Work stops when you close Claude Code and picks up again
  next time.

---

## How it works

1. **You talk.** "Add a search command, and make the errors friendlier."
2. **The lead writes tasks on the board**, e.g. T-1 the index, T-2 the command (after
   T-1), T-3 the errors.
3. **Workers start in parallel.** Each task gets its own copy of the code, on its own
   branch (`symcc/T-1`).
4. **symcc checks the work.** Only the task's files changed? Your tests pass? If the tests
   fail, a new worker tries again with the error in front of it.
5. **Ready for review.** In review mode the task waits for you.
6. **You look at the change and approve it** (or reject it with a reason).
7. **It is merged into your branch, and the next tasks start.** The lead tells you each
   step.

```
  you ──"add a search box"──▶ LEAD (your chat)
                                │ writes tasks
                                ▼
                     .symcc/board.json  (T-1, T-2, ...)
                                │ a task is ready
                                ▼
          WORKER builds it in .symcc/worktrees/T-1
                                │ done
                                ▼
          checks: own files only? tests pass?  ── no ──▶ try again
                                │ yes
                                ▼
          review (if on) ──▶ you approve ──▶ merged ──▶ next tasks start
```

---

## Quick start

1. **Install:** start Claude Code with the plugin.
   ```bash
   claude --plugin-dir /path/to/symcc
   ```
2. **Keep the board local:** add `.symcc/` to your project's `.gitignore`.
3. **Set your tests:** tell the lead "set the test command to `npm test`".
   Without a test command, changes are merged without running tests.
4. **Ask for something.** "Add a dark mode toggle." Then watch the board.

---

## Things you can say

You never have to type a command. Just talk to the lead:

- "what's going on?"
- "do T-4 first"
- "T-3 should also handle emails"
- "pause T-5" · "drop T-2" · "stop everything"
- "set the test command to `npm test`"
- "give workers 90 minutes"
- "approve T-5" · "reject T-5: the button should be blue"

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

## Staying in control

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

- Changes outside a task's files, or that fail the tests, are never merged.
- In review mode nothing is merged until you approve it; the lead should only approve
  when you say so.
- Your branch only moves through a checked merge. If you have uncommitted changes on it,
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

### Seeing the board

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
instructions below. It reports to the lead and never changes files. Copy one from
[`examples/scouts/`](examples/scouts/), or make one in the panel's Scouts view.
More in the [guide](docs/guide.md#scouts).

### Task statuses

`todo` (ready) · `doing` (a worker is on it) · `waiting` (needs your answer) · `review`
(waits for your approve) · `paused` · `failed` (the lead decides what next) · `done`
(merged) · `dropped` (cancelled). See [a task's life](docs/guide.md#a-tasks-life).

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
