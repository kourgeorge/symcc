# symcc

A Claude Code plugin that turns your session into a small team: a shared task board,
the main chat as its **lead**, **workers** that build tasks in parallel, and **scouts**
you define that keep looking for issues. It works while Claude Code is open.

## How it works

- **The board** lives in your project as `.symcc/board.json`. Each task is *to do*,
  *doing*, *waiting for you*, *failed*, *done* or *dropped*. You see it in a side panel
  above the prompt and in the status line.
  `/board` prints it; `/board T-3` shows one task in full. Workers show in Claude Code's
  background tasks (Ctrl+T) while they run, so you can open one and watch it work.
- **The lead** is your normal Claude Code chat. Tell it what you want; it puts tasks on
  the board with its symcc tools, changes them when you ask, and decides what happens
  when a task fails or a scout finds something.
- **Workers** pick up ready tasks by themselves (up to 3 at once), each in its own Git
  worktree under `.symcc/worktrees/`. When a worker finishes, symcc commits its change,
  checks it only touched the task's files, runs your test commands on the combined code,
  and if they pass, merges it into your main branch. Then the lead is told and decides
  what's next.
- **Scouts** are your own issue finders: one Markdown file each in `.symcc/scouts/`.

```
you   add a search command, and make the errors friendlier
lead  Three tasks: T-1 the index, T-2 the command (after T-1), T-3 the errors.
      …
lead  T-1 merged. T-3 failed its tests (a message changed); I added a hint and restarted it.
```

## Defining a scout

Create `.symcc/scouts/<name>.md` in your project:

```markdown
---
every_minutes: 30
model: sonnet
---
Look for risky code that has no tests. Point at file:line and say what could go wrong.
```

The front matter says how often it runs (and, optionally, which model); the body is its
instructions. Scouts only read. What they find goes to the lead, which adds the
worthwhile ones as tasks. `examples/scouts/` has two to copy.

## Commands

- `/board`: open the interactive board: ↑↓ to move, Enter to open a task, Esc to close.
  An open task shows everything about it and has buttons to pause, resume, retry, drop,
  watch its worker live, and a box to answer it when it waits for you. `/board T-3` opens that task directly. `ctrl+x tab` goes back to it.
- `/scouts`: list scouts; `/scouts run <name>` runs one now
- `/stop-all`: stop every worker and scout now; nothing new starts until `/resume-all`
- `/resume-all`: start work again

Everything else you just say to the lead: "what's going on?", "do T-4 first",
"T-3 should also handle emails", "drop T-2", "pause T-5", "stop everything",
"set the test command to npm test", "give workers 90 minutes".

## Keeping work moving

Every two minutes symcc checks the board by itself. It starts tasks that are ready,
stops a worker that runs longer than the limit (45 minutes unless you change it) and
marks its task failed, notices a worker that ended without a result, and reminds the
lead about failed tasks nobody acted on for 10 minutes.

When a finished task fails its tests, symcc starts a new try by itself: the task goes
back to "to do" and the next worker is shown the end of the failing test output and told
to fix it. The lead gets one short line each time. After `auto_retries` tries (2 unless
you change it, e.g. "allow 3 automatic retries") the task is marked failed and the lead
gets the last test output to decide what to do.

A stopped worker can't do anything more: symcc refuses every tool it tries.

## Install

```bash
claude --plugin-dir /path/to/symcc
```

Add `.symcc/` to your project's `.gitignore` so the board and worktrees stay local.

## Safety

- Changes outside a task's files, or that fail the tests, are never merged.
- Your main branch only moves by a checked merge. If you have uncommitted changes on it,
  symcc waits instead of overwriting them.
- Workers run with `acceptEdits` and the tools Read, Edit, Write, Glob, Grep and Bash,
  inside your normal Claude Code permission settings. Scouts only read.
