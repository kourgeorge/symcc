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
  and if they pass, merges it into the target branch. Then the lead is told and decides
  what's next.
- **The target branch** is the branch you had checked out when the board was made (on a
  detached HEAD, the repo's main branch: origin's HEAD, else `main` or `master`). Change it
  with the `target_branch` setting (e.g. "symcc settings target_branch develop"); only an
  existing branch is accepted. If you are on another branch, the banner and status line
  warn you (`merging into main · you're on my-feature`). If the target branch doesn't
  exist, no work starts and nothing is marked failed; the lead is told once.
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

- The board panel opens by itself when a session starts (in every session, driving or not),
  showing the task list; the cursor stays in the prompt so you can type right away. Turn
  this off with the `open_on_start` setting (e.g. "symcc settings open_on_start false").
  Claude Code only places a panel it wasn't asked for when the terminal is wide enough
  (about 144 columns); on a narrower one nothing opens and no error shows. The band above
  the prompt and `/board` still work.
- `/board`: open the interactive board: ↑↓ to move, Enter to open a task, Esc to close.
  An open task shows everything about it and has buttons to pause, resume, retry, drop,
  watch its worker live, and a box to answer it when it waits for you. `/board T-3` opens that task directly. `ctrl+x tab` goes back to it.
  Each task also lists how long each worker try took and the tokens it used, with a total;
  the board ends with a total line for all tasks (e.g. `total: 1h 12m · 1.2M tokens over 4 tries`).
  Claude Code reports tokens but not dollars for a worker, so a cost (`~$3.40`) shows only when one is recorded.
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

## Safety

- Changes outside a task's files, or that fail the tests, are never merged.
- The target branch only moves by a checked merge. If you have uncommitted changes on it,
  symcc waits instead of overwriting them.
- Workers run with `acceptEdits` and the tools Read, Edit, Write, Glob, Grep and Bash,
  inside your normal Claude Code permission settings. Scouts only read.
