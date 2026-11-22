# symcc reference

Look things up here: exact names of modes, commands, settings and statuses, and the install details. This page lists *what* exists. The [guide](guide.md) explains *how it works and why*, and the [README](../README.md) is the short start.

- [How it works, step by step](#how-it-works-step-by-step)
- [Install: other ways and fixes](#install-other-ways-and-fixes)
- [Modes](#modes)
- [Live status: seeing the board](#live-status-seeing-the-board)
- [Commands](#commands)
- [Settings](#settings)
- [Scouts and task statuses](#scouts-and-task-statuses)
- [For developers](#for-developers)

---

## How it works, step by step

The picture and the video are in the [README](../README.md#how-it-works).

1. **Ask.** You ask for something, or a scout finds something.
2. **Plan.** The lead turns it into tasks, sets their order and the files each may change.
3. **Build.** Workers start in parallel, each in its own worktree.
4. **Check.** symcc runs the scope check and the test gate, and retries on failure.
5. **Review.** In approve merge mode (stored as `review`) you approve or reject. You can also edit the task's files in `.symcc/worktrees/T-x` and then approve: your edits go in, and the tests run again first. An answered investigation always waits for you (even in `auto`): read its answer, then Done, Keep as a note or Ask more.
6. **Merge.** symcc updates the task on the latest target branch, re-runs the tests, merges, and the lead tells you. Your own uncommitted edits on that branch are kept; only your files with the same name as a file the task changes hold the merge back: an uncommitted edit (commit or stash it), an untracked file (move, rename or commit it), or a git-ignored file (move or rename it). The task waits for you, then merges by itself once those files are out of the way.

Here is the planning step in the chat:

```
you   add a search command, and make the errors friendlier

lead  Three tasks:
      T-1  the search index
      T-2  the search command          after T-1 (it uses the index)
      T-3  friendlier error messages   (different files, runs now)
      T-1 and T-3 start now, in parallel. T-2 waits for T-1.
```

The lead sees that T-2 needs T-1's index, and that T-1 and T-3 touch different files. A
task starts only when every task in its `after` list is merged. Change the order any
time: "do T-3 first", "T-2 should wait for T-3".

## Install: other ways and fixes

**Requirements.** Claude Code with plugin function hooks (the `$.tool`, `$.agent` and
`$.clock` plugin API, and panels). This API is early access and can change. symcc is
built and tested with Claude Code **2.1.319** (`claude --version`); Option B needs 2.1.275
or later. You also need **git**; if it is missing, nothing starts and symcc tells you how
to install it. With no git repo yet, symcc offers to run `git init` on `main`, write a
`.gitignore` and make a first commit. It never pushes. There is no build step.

**Option A: try it from a clone** is in the [README](../README.md#install). Update it with `git -C ~/symcc pull`, then start Claude Code again.

**Option B: install as a plugin** (stays installed). The README shows the one-line way. Or in two steps:

```bash
claude plugin marketplace add kourgeorge/symcc
claude plugin install symcc@symcc
```

Inside a session, `/plugin install symcc --marketplace kourgeorge/symcc` works too. It
installs for you (user scope); add `--scope project` to share it with your project.
Update (then restart Claude Code) and uninstall:

```bash
claude plugin marketplace update symcc && claude plugin update symcc@symcc
claude plugin uninstall symcc@symcc && claude plugin marketplace remove symcc
```

**Check it works.** Start Claude Code in your project. Once symcc is set up there (in a new project, after `/symcc-enable`), the board panel opens by itself on
a wide enough terminal; if not, run `/symcc`. The status line starts with the mode, e.g. `⏵ auto merge`.

### Troubleshooting

- **The panel doesn't open.** The terminal is too narrow. Make it wider, or run `/symcc`.
- **Tests fail in a worker's copy because packages are missing.** `node_modules/` is not copied. Say in the task to install them first (e.g. `npm ci`), or make the test command do it.
- **A task fails with "symcc could not commit the work: ... gpg failed to sign the data".** You sign commits (`commit.gpgsign=true`), and the signer can't ask for your key from a background process. Either turn signing off for this repo (`git config commit.gpgsign false`) or set up the signer so it works without a terminal (e.g. a cached key or agent), then retry the task.
- **A merge fails with "a git lock file is in the way".** A git that crashed left a `.lock` file behind. If no git is running, delete the file it names, then retry.

## Modes

The mode decides whether finished work merges by itself. Change the mode with `/symcc-mode`, the `m` key in the panel, or by telling the lead.

| Mode | Shown as | What happens |
|---|---|---|
| `auto` (default) | `⏵ auto merge` | A finished task that passes the checks is merged at once. |
| `review` | `⏸ approve merge` | Every finished task waits for you to approve or reject it. |
| `paused` | `⏸ paused` | Every worker and scout stops at once. Nothing new starts. |

Claude Code's own **plan mode** (Shift+Tab) also counts: while the main chat is in it, new tasks go
to the backlog and no new worker or scout starts (running workers keep going); the band shows
`plan mode: nothing starts`. When it ends, the lead lists those backlog tasks and asks you which to
move to todo. See [Plan mode](guide.md#plan-mode) in the guide.

In `auto`, say "T-5 needs review" and just that task waits. Workers can't commit, push or
merge, and scouts can't edit files. See [approval before merge](guide.md#approval-before-merge).

## Live status: seeing the board

The board panel shows every task, scout and setting in one place. `/symcc` opens it. Keys: `a` approve, `x` reject or drop, `d` show changes,
`p` pause, `u` resume, `r` retry, `m` switch approve merge / auto merge, `t` / `s` / `c` the Tasks,
Scouts and Settings tabs. **Ctrl+T** shows running workers. More in the
[guide](guide.md#live-status-seeing-the-board).

## Commands

Type these in the chat. `/symcc` opens everything; `/symcc-<word>` does one thing. Each row says what the command is for.

| Command | What it does |
|---|---|
| `/symcc` | Open the board panel (tasks, scouts and settings) |
| `/symcc-board` | OpenCode only: open the board in its session panel, or close it when it is open. (There, plain `/symcc` prints the board as text) |
| `/symcc-answer T-5 <answer>` | OpenCode only: answer a waiting task, or a question with `Q-3 <answer>`. The board panel sends this for you |
| `/symcc-tasks` | Open the panel on the tasks view |
| `/symcc-scouts` | Open the panel on the scouts view and reload the scout files (a text list if the panel can't be shown) |
| `/symcc-task T-3` | Open one task |
| `/symcc-task T-3 pause` / `resume` / `retry` | Pause a task (its worker stops), resume a paused one, or put a failed or dropped one back to `todo` (on a task whose finished work waited for your files: merge it now) |
| `/symcc-task T-3 drop [reason]` | Drop a task, with an optional reason |
| `/symcc-task T-3 merged` | Mark a task done whose work you already merged by hand (symcc looks it up in the history; nothing is merged or tested) |
| `/symcc-task T-3 review on\|off` | Turn `needs_review` on or off for the task |
| `/symcc-task T-3 stash` / `todo` | Move a task to the backlog, or from the backlog to `todo` |
| `/symcc-task T-3 role <name>` | Change the task's role |
| `/symcc-task T-3 note` | An answered investigation: Keep as a note (Done, plus a docs task that writes the answer to `docs/research/`) |
| `/symcc-approve T-5` | Merge a task that is ready for review (an answered investigation: Done) |
| `/symcc-reject T-5 <reason>` | Send a task in review back to `todo` with the reason (an answered investigation: Ask more, the reason is your follow-up question) |
| `/symcc-diff T-5 [file]` | The files a task in review changed (+/- lines), or one file's full diff |
| `/symcc-scout <name>` | Run a scout now |
| `/symcc-scout <name> pause` / `resume` | Pause a scout's timer (it doesn't run on its timer until you resume it; run now still runs it once and it stays paused), or resume it. `p` on the scout's page in the panel does the same |
| `/symcc-scout <name> every <minutes>` | Change how often a scout runs on its timer |
| `/symcc-scout <name> model <model\|none>` | Change a scout's model; `none` clears it, so the scout uses the default model |
| `/symcc-scout <name> prompt <instructions>` | Replace the scout's instructions (one line of text) |
| `/symcc-mode [paused\|review\|auto]` | Set the board mode; no word switches `review` and `auto` (from `paused`: `review`) |
| `/symcc-settings [name value]` | Open the Settings view, or set one setting: `/symcc-settings max_parallel 5`, `/symcc-settings notify sound 2`, `/symcc-settings test_commands "npm test"` |
| `/symcc-settings role <name> on\|off\|reset` | Turn a role on or off, or reset it back to the built-in one |
| `/symcc-settings kind <name> on\|off\|reset` | Turn a kind on or off, or reset it back to the built-in one |
| `/symcc-stats [full\|html] [7d [inside]\|T-100..T-130]` | Time and token stats from the board (archived tasks too), easy to read with plain bar charts: a one-line summary, totals, the whole team, averages and medians per task and per try with their totals next to them, time per stage (waiting to start, waiting on tasks, work, prep, check, merge queue, tests, merge, waiting for you; active vs waiting), the biggest tasks, how tasks ended (merged, approved or answered), investigations counted on their own, by role, origin (with each scout's tasks not linked to a run) and day. `7d` limits it to the tasks changed in the last 7 days (whole tries), `7d inside` counts only the work inside those days (tries and stages cut to them), `T-100..T-130` to an id range; `full` adds the long explanations; `html` writes the same figures as a self-contained web page with charts (`.symcc/stats.html`) and opens it |
| `/symcc-settings role <name> add` / `edit <field> <value>` / `save {...}` / `remove` | Make a role, change one part of it (`description`, `model`, `skills`, `tools`, `checklist`), change several parts at once with JSON, or delete one you added. `kind` works the same (its parts are `description` and `body`) |
| `/symcc-scout <name> new <instructions>` | Make a new scout (it runs every 60 minutes at first) |
| `/symcc-settings git setup` | Set up git when the folder has no repo or no commit: `git init` on main, a `.gitignore` and a first commit; never pushes |
| `/symcc-settings orgmem delete N` | Delete note N from the organizational memory (its number on the Organizational memory page) |
| `/symcc-doctor [fix [all\|id ...]]` | Check `.symcc/` and git (old backups, merged branches, leftover task folders, files near 4 MB, a stuck board). It only lists them; `fix all` or `fix <id> ...` cleans up |
| `/symcc-disable` | Disable symcc for this project: Claude works as normal (no lead guide, workers, scouts, updates, sounds or voice); the board is kept |
| `/symcc-enable` | Turn symcc back on, in the mode the board had. In a new project (no `.symcc/board.json` yet, so symcc is off there) it starts symcc: it creates the board, turns symcc on and opens the panel |
| `/symcc-disable here` | Turn symcc off in this window only (plain Claude here). It is kept in this session, not in `board.json`; other windows are not changed. If this window drives the board, it hands driving over |
| `/symcc-enable here` | Turn symcc on again in this window (it becomes a lead again). A window opened while another live window has symcc on starts off here; this opts in. If the whole project is disabled, use `/symcc-enable` |
| `/symcc-drive` | Make this session drive the board (start workers, merge, run scouts). If another session drives, it hands over within 30 s: its running workers stop and restart here from their kept folders and branches, without using up a try. If it doesn't answer within 3 minutes, this session takes over anyway |
| `/symcc-help [topic]` | The built-in manual |

## Settings

Settings are the board's rules (how many workers, which tests, when to ask you). Change with `/symcc-settings` or by telling the lead (e.g. "give workers 90 minutes").
The Settings tab (`c` in the panel) has one row per setting; Enter flips an on/off
setting, opens a pick list for `mode`, `notify`, `scout_findings` and `tests_with_changes`, or an edit box for numbers and
`test_commands`. A value over its limit is cut to it, and the answer says so.

| Setting | Default | Allowed | Meaning |
|---|---|---|---|
| `test_commands` | none | one shell line (`cd web && npm test` is one command), or up to 5 as a list: `["npm test", "npm run lint"]` | Shell commands that must pass before anything is merged; each runs as one shell line from the task's folder. Each may run `test_minutes`; the whole check and merge may take `test_minutes` per command plus 5, not counting time waiting in the merge queue (one task at a time, across all tasks and sessions, oldest first, takes its turn: catch up with the target branch, run the tests, merge; the queue is kept in `.symcc/merge-line.json`). A merge turn that runs over is one normal failed try, using one of the `auto_retries` |
| `test_minutes` | 10 | 1–120 (whole minutes) | The time limit for each test command. A test command that runs out of time fails like a failing test: a new worker try starts with the output, using one of the `auto_retries` |
| `max_parallel` | 3 | 1–8 | How many workers at once |
| `max_minutes` | 45 | 5–600 | A worker running longer keeps working while you are asked "Give it more time?" (+30 min, +60 min or Stop it). Stop it, or no answer by twice the limit, lets the worker write down and hand back what it has (about 3 min), then stops it; the task fails with its work kept in its folder, branch and report, so a retry continues from there |
| `auto_retries` | 2 | 0–10 | New tries after failing tests before a task is marked failed |
| `archive_days` | 14 | 0–3650 (0 = never) | Done and dropped tasks older than this move from `board.json` to `.symcc/archive.json` |
| `open_on_start` | on | on / off | Open the board panel when a session starts |
| `notify` | `voice` where this computer can speak, else `sound N` with N picked from the project name, else `off` | `voice` / `sound 1` / `sound 2` / `sound 3` / `off` | What plays when a task is merged or a worker asks you something: `voice` says "symcc: T-3 done" / "symcc: T-5 needs you" out loud (the project folder's name first); `sound N` plays a short chime from sound set N, so you can tell which project chimed (on macOS `sound 1`: `Glass` and `Ping`, `sound 2`: `Hero` and `Pop`, `sound 3`: `Submarine` and `Funk`; the second sound is for a waiting question). Picking a sound plays its chime. Only choices this computer can play can be picked (see below) |
| `scout_findings` | `auto` | `auto` / `backlog` | Where tasks from a scout's finding go. `auto`: the lead decides, and a finding it adds goes to `todo` and runs. `backlog`: every task added from a scout finding goes to the backlog, whatever the lead asks, and starts only when you move it to `todo` (the lead still tells you what was found) |
| `tests_with_changes` | `ask` | `off` / `ask` / `review` | A change task whose commit edits code but no test file (a test file is in a `test/`, `tests/`, `__tests__/`, `spec/`, `e2e/` or `cypress/` folder or a folder ending in `.Test` / `.Tests`, or has `test` or `spec` as a name part split by `.`, `_` or `-` (`a.test.ts`, `a_test.py`, `test_a.py`, `a-test.ts`), a `.cy.` or `e2e` name part (`a.cy.ts`, `login.e2e.ts`), or a CamelCase name ending in `Test` or `Tests` (`FooTest.java`, `FooTests.cs`, `LoginUITests.swift`); a name that only contains those letters (`latest.ts`, `run-tests.sh`, all-capital `LATEST.ts`) is not a test). `ask`: it still merges and the lead is told "T-3 changed code but no test". `review`: it waits for your review instead of merging. `off`: not checked. A change to docs only is never flagged (docs are `.md`/`.mdx` files, README / CHANGELOG / LICENSE-style names (no extension or a text one), images, video, audio, fonts and subtitles anywhere, and non-code files under `docs/`; code under `docs/` (`docs/build.ts`) or with a docs-style name (`Notice.tsx`) is code) |
| `checker` | `off` | `off` / `on` | A fresh checker tries to break each change (not docs-only) after the prep step (commit, scope and secret check) and before it joins the merge queue; the tests run once in the queue, after it. Problems go back to the worker as a retry, with no test run for that try. See [the checker](guide.md#the-checker) |
| `mode` | `auto` | `paused` / `review` / `auto` | See Modes above |
| `enabled` | on | on / off | The whole plugin enabled or disabled, same as `/symcc-enable` and `/symcc-disable` |

### What `notify` uses on each system

symcc looks once per session for these programs (it only checks they exist, it plays
nothing). A choice whose program is missing can't be turned on, and the answer says what to
install. If the board was set on another computer and its choice can't play here, you are
told once and nothing plays; the setting is kept. Only the session driving the board plays.

| System | `sound` | `voice` |
|---|---|---|
| macOS | `afplay` with the built-in `Glass` sound (`Ping` when a question waits) | `say` |
| Linux | `paplay` with the freedesktop `complete` / `bell` sounds, `canberra-gtk-play`, or `aplay` with a `.wav` sound | `spd-say` (speech-dispatcher), `espeak-ng` or `espeak` |
| Windows | PowerShell's system sounds (`Asterisk`, `Exclamation` when a question waits) | PowerShell's built-in speech (System.Speech) |

## Scouts and task statuses

A scout is one Markdown file in `.symcc/scouts/`: how often it runs at the top, its
instructions below. `every_minutes: 0` (or a value that is not a whole number) means it
runs only on demand. See [scouts](guide.md#scouts). A task is `todo`, `doing`,
`waiting` (for your answer: you hear "symcc: T-5 needs you"), `review`, `paused`, `failed`,
`done` (merged, final), `dropped` (never runs on its own; Retry brings it back) or
`backlog` (parked until you move it to todo). See
[a task's life](guide.md#a-tasks-life).

Each task merges into the branch you were on when you asked for it (tell the lead "merge T-3
into `develop`" to move one task). More tips: [good to know](guide.md#good-to-know).

## For developers

The code is split into modules: [`hooks/core/`](../hooks/core/) (the board as plain data, easy
to test), [`hooks/app/`](../hooks/app/) (what symcc does, with no Claude Code in it),
[`hooks/claude/`](../hooks/claude/) and [`hooks/claude/ui/`](../hooks/claude/ui/) (everything
that talks to Claude Code, and the panel), and [`hooks/register.tsx`](../hooks/register.tsx) (only
the wiring), with tests in [`tests/`](../tests/). See the
[guide](guide.md#for-developers-where-the-code-is) for more, and for
[renaming the plugin](guide.md#renaming-the-plugin).
