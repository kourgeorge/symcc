# Running on its own

Which branch work goes into, how symcc keeps work moving while you are away, and the time and tokens it spends.

## Which branch work goes into

- Each task merges into **the branch you were on** when the task was made. There is no
  branch setting. (On a detached checkout it uses the repo's main branch: `main` or `master`.)
- To move one task to another branch, tell the lead, e.g. "merge T-3 into `develop`"
  (it changes the task's `merge_into`). Only a branch that exists is accepted.
- If a task's branch was deleted, the task waits and asks you whether to merge into another
  branch instead. Nothing is marked failed.

### Projects: repos anywhere on disk

A **project** is a repo at any path on disk (`~/repositories/client`, `~/code/server`), listed in the board's project
table as a name and a path. The Settings page shows each one as `name → path` with its test commands. You add one by
asking the lead (the lead only does it after your yes): `settings` with `project` (a plain name) and `path` (the repo's top
folder, `~` allowed). symcc refuses, with a plain reason, a path that does not exist, is not a repo's top folder, has no
commits, is inside a `.symcc/` folder, and a name that is taken. The path is stored
as its real path. A project's path can be changed only while none of its open tasks has a copy or branch, and a project
can be removed (`project` plus `remove: true`) only while no open task uses it. A task can name its project (`project` on `symcc add` / `symcc change`, for
example "add this to client"). A wrong name is refused, and the answer lists the projects there are. Rows and task
pages show a small tag in front of the title, like `[client] Fix login`. A board inside one repo has no projects: no tag
shows and `add` works as before.

Each task works in its own project's repo. Its worker copy is a worktree of that repo (the copy itself sits under the
board folder, in `.symcc/worktrees/T-n`), the checks and the merge run in that repo, and the change lands on that repo's
branch. The task's files are relative to the repo (`README.md`, not `client/README.md`). A project has its own test
commands (settings tool: `project` plus `test_commands`); a project without its own uses the board's. Git readiness is
checked per project, so a repo that is not ready holds back only its own tasks. A change that touches two repos is two
tasks, linked with `after`. The prompts of workers and checkers name the task's project, and scouts are told the list of
projects, because the board folder is not a repo. An investigation (an answer to read) or an errand may have no project: it runs in a plain folder
with no git copy and no branch, may read every project and writes into none, and nothing is merged. A change task needs a
project: adding one without it is refused ("on a board over several repos a change task needs a project: client, server").
An old change task with no project waits, and only it; the board notes which task it is ("T-12 has no project, so it can't
start on a board over several repos (a change task needs a project); give it a project"), and the lead is told once. Give it a
project (`symcc change project`) and it starts. To start, ask the lead: "add this to client". "Keep as a note" on an answered
investigation with no project is refused until it has a project, because the note is a docs task.

### A folder without git

symcc needs **git** (the program) and a git repo with at least one commit: each worker
gets its own git worktree. It checks this when a session starts and before a worker starts.

- **git not installed**: no worker starts; the board shows a notice at the top ("Git is not
  installed: <the install step for your machine>"), the status line says `git is not installed`,
  and the lead offers to run the step on your yes (macOS: `brew install git` when Homebrew is
  there, else `xcode-select --install`; Linux: `sudo apt install git`, `dnf` or `pacman`; Windows:
  `winget install --id Git.Git`). It never runs something that needs sudo or opens an installer
  without asking. While git is missing, symcc does not try git again by itself, not even to start
  a task that is ready (on a Mac without
  the command-line tools, each try would bring up Apple's install pop-up again): after you install
  it, press **Check again** (g), run `/symcc-settings git check` or start a new session. Then the
  notice moves on to the next case.
- In the two cases below, git is there, so symcc looks again by itself every 2 minutes and
  when the board panel opens: a `git init` and a first commit made by hand clear the notice.
- **A folder that is not a repo** is a control center: it works with projects (see "Projects" above), and `/symcc-init git` or the settings git setup makes it a repo if you want that. To work on repos that are elsewhere, add them as projects.
- **A repo with no commits yet**: the board still works, and shows "No commits yet: symcc
  needs a first commit for task branches. No worker starts until it is set up." with a **Set up git** button.
  The lead asks you too; say yes, or press **g** in the board panel.
  Nothing starts until it's done. The setup:
  - runs `git init -b main` (skipped if a repo is already there);
  - writes a `.gitignore` (or adds to yours, never twice) with `.symcc/`,
    `node_modules/`, `.env`, `.env.*` (but not templates: `!.env*.example`, `!.env*.sample`,
    `!.env*.template`, `!.env*.dist` and `!.env*.defaults`, so `.env.example` and
    `.env.local.example` are committed), `.DS_Store`, `dist/`, `build/`, `__pycache__/` and `.venv/`.
    If your own `.gitignore` already ignores a name with one of those endings (say `.env.sample`),
    the matching `!` line is not added, so that file stays ignored as you wanted;
  - makes a first commit of the current files, "Initial commit (by symcc)", leaving
    out (and ignoring) files that look like secrets (`.env`, `*.pem`, `id_rsa`) or
    are over 50 MB; the result says which;
  - names the branch `main`. It never pushes and adds no remote.

## Keeping work moving on its own

Every two minutes symcc checks the board by itself. It:

- starts tasks that are ready (up to `max_parallel`, 3 by default, at once),
- asks you for more time when a worker runs too long (`max_minutes`, 45 by default; see
  "A worker over its time limit" below),
- notices a worker that ended without reporting back,
- reminds the lead about a failed task nobody has dealt with for 10 minutes,
- runs the board health check (see "How the lead keeps the board in order" below),
- once an hour, archives old finished tasks (see below).

A stopped worker can't do anything more: symcc refuses every tool it tries to use.

**Several Claude Code windows on the same project?** Only one of them *drives* the
board (starts workers, merges, runs scouts). The others can see and change the board but
start nothing. If the driving window closes, another one takes over within a few minutes.
A window that doesn't drive (it *follows*) shows a yellow warning in the board's banner, right under its
tests/limits line, and the same words in the band above the prompt, naming the window that drives:

    ⚠ this window follows (driver started Nov 23 09:26, active 3 min ago); /symcc-drive to drive from here

"started" is when that window began driving; "active" is when its owner last typed a prompt or its
turn last ended. When that isn't known (an older symcc drives, or OpenCode), it says when the
driving window last checked in instead ("driver checked in 10 s ago"). It is a live window, not
stale state: a window that stops checking in loses driving within 3 minutes. On a narrow panel
"started …" goes first, then the line shortens to `this window follows (driver active 3 min ago) ·
/symcc-drive`; the status line under the prompt says `follows (driver active 3 min ago) ·
/symcc-drive`. Like the rest of the banner, the warning shows on the list pages only (see the
header rule under [Live status](board.md#live-status-seeing-the-board)). Its doing tasks say "runs in the other session", and the warning adds
"looks idle" when a task has waited over 5 minutes for the driving window to start it.
To move driving to the window you are in, type `/symcc-drive` there, or press the `Drive here (d)` button
under the banner (it shows only while another window drives, and not in a window turned off with
`/symcc-disable here`; the Claude Code, VS Code and OpenCode boards all have it). If another window
drives, symcc asks it to hand over: within 30 s it stops its workers (the answer says which
ones), steps down, and your window starts driving and restarts those tasks from their kept
folders and branches. A task stopped this way does not use up a try; its history says
"restarted: the owner moved driving to another session". There are never two drivers at
once. If the other window doesn't answer within 3 minutes, yours takes over anyway.

**Only one window with symcc.** A window you open while another live window already drives the
board starts with symcc on, as a *follower*: the panel opens, it is a lead (you can add, change and
approve tasks there), but it starts no workers, scouts or merges; those stay in the driving window. Its
banner and status line say so:

    this window follows (driver started Nov 23 09:26, active 3 min ago); /symcc-drive to drive from here

Type `/symcc-drive` to drive from it. A window that crashed and left an old marker does not count:
"live" uses the same stale rule as the hand-over.
A window you turned off yourself with `/symcc-disable here` (see [Disabling symcc](troubleshooting.md#disabling-symcc))
stays off, even when it was driving, whatever other windows do: when the driving window closes, or
another one starts driving, it stays off and says nothing. `/symcc-drive` there refuses; `/symcc-enable`
turns it on as a follower.

### How the lead keeps the board in order

The lead sorts the board by a few plain rules: older tasks go first unless you say a task is
urgent; bugs and safety fixes go before features; `priority` sets the urgency (like Unix
nice: everyone starts at 0, lower runs first; urgent work gets -1, -2…, later work 1, 2…). Tasks wait on each other (`after`) only when they really change the same files, and a
new task that shares files with an older waiting one goes behind it. No task is left waiting
forever.

To help, symcc checks the board after every change and every two minutes (only in the
window that drives the board). It looks for:

- **Stuck:** a task waits on a task that was dropped, failed or is gone ("T-7 waits on T-5,
  which was dropped — it will never start"), or tasks wait on each other in a loop.
- **Starving:** an older task that could start, or waits only on newer tasks, keeps getting
  pushed back: its `after` list was changed 3 or more times, or it has waited over 2 hours
  while 2 or more newer tasks already started.
- **Too serial:** 3 or more to-do tasks wait on each other in a chain, but each shares no
  files with the one before it, so they could run side by side.
- **Needs you too long:** a task waits for your answer or your review, untouched for over an hour.

When it finds something new, the lead gets one "Triage needed" board update listing the
problems and what to consider. The same problem is never told twice; it is told again only
after one of its tasks changes. A healthy board sends nothing.

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
  and `/symcc-stats` counts their time and tokens. Task numbers are never reused.
- **Finding one:** `/symcc-task T-12` shows an archived task (or ask the lead, who can look
  it up with its `board` tool). Archived tasks are read-only: change, ask, approve and so on
  answer "T-12 is archived". Retrying an archived *dropped* task brings it back to the
  board as `todo`, with a history line.
- **Never one huge file:** a big archive goes on in `archive-2.json`, `archive-3.json`, ...,
  each kept under 2 MB.

### Keeping the board files small

Claude Code reads and writes a file whole and refuses one over 4 MB, so symcc keeps its files
well under that, without you lowering `archive_days`:

- **Done and dropped tasks keep a short stub in `board.json`** (id, title, status, priority,
  branch, times). Their history, tries, details, origin and notes are in
  `.symcc/tasks/T-<n>.json`, one file for every 50 task numbers (`tasks/T-600.json` holds
  T-600 to T-649). symcc joins them back whenever it reads the board, so the board, the task
  pages, search, `/symcc-stats` and the lead's tools still show every task whole. A board from
  before this is moved over once, with a copy kept as `board.json.before-migrate-<time>`.
- **The OpenCode view file** (`.symcc/view.json`) leaves out finished tasks' long parts too;
  a done task's page reads them from its `tasks/` file when you open it.
- **Early warning:** when a file symcc reads whole passes 3 MB, you get a toast, the lead is
  told, and the board shows "board.json is 3.2 MB, close to the 4 MB limit ..." where the git
  warning goes (past 4 MB it says "over the 4 MB limit" instead). A file over 4 MB that can't
  be read gives an error that says so.

### Cleaning up with /symcc-doctor

Over weeks, `.symcc/` and git collect leftovers: migration backups, branches of finished
tasks, folders of tasks that ended. They take space and make `git branch` long, but symcc
can't tell on its own which of them you still want. `/symcc-doctor` looks and tells you, with
sizes. It changes nothing until you say so.

- **Old data shapes (`migrate-data`):** symcc no longer converts old-shaped files when it reads
  them. If `board.json`, its `tasks/` files, the archive, `scouts.json`, a scout's last report
  or `field-guide.md` still hold an old shape (history lines as plain strings, tokens saved as
  one number, old roles, `mode: off`, `target_branch`, a "queue (n)" note, a question kept in
  several fields instead of one `ask` record, `last_run` / `last_report` in `scouts.json`, ...), the doctor lists
  how many of each. `/symcc-doctor fix migrate-data` keeps a
  dated copy of the data files first (`.symcc/data.before-migrate-<time>/`, cleaned up later
  like the other backups), saves every file once in today's shape and says what it changed.
  Some counts are only information and are left as they are: `unsplit` tokens, history entries
  of kind `other`, and tasks where `attempts` differs from the number of tries. A try that still
  keeps its tokens, cost or agent ids outside its agent list (`tokens`, `checker_tokens`, `cost`,
  `agent`, `checkers`, a task's `agent` and `checker`, a restart's `agent`) is moved onto the list:
  a try with no agents gets a worker entry with its tokens minus the checkers' and a checker entry
  with the checkers' tokens.
  Nothing old is ever saved over first: at session start, and before a board or archive change
  would save an old-shaped file, symcc runs this same step itself (backup first) and tells you
  once what it moved.
- **What else it offers to clean up (each with a short id):** old `board.json.before-migrate-<time>` copies
  and `data.before-migrate-<time>/` folders
  (the newest one is kept); folders in `.symcc/worktrees/` of done or dropped tasks with no
  uncommitted changes; git worktree entries whose folder is gone (`git worktree prune`);
  `symcc/<board-name>/T-<n>` branches of done or dropped tasks whose work is all in the branch they merge
  into. For a **dropped** task it also offers its folder with uncommitted changes and its
  branch with commits not in the target branch, and says what is lost ("deletes 3 uncommitted
  changed files", "deletes 8 commits not in main"); `fix` removes them (the folder with
  `git worktree remove --force`, then the branch with `git branch -D`). The id says what the
  item is: `m-1101-1000` is the backup made on 1 November at
  10:00, `w-T-5` is T-5's folder, `b-T-5` its branch, `p-worktrees` the stale entries.
- **What it only lists:** a branch that holds unmerged work (it says how many commits) and a
  folder with uncommitted changes, when the task is not dropped (and a branch still checked out in a kept folder), a
  folder whose commits are on no branch, a folder of a task that isn't on the board, data files close to the 4 MB limit, stray files like
  `.DS_Store` and empty `scratch/`, `ideas/` or `artifacts/` folders, a running task with no
  live worker (with the fix: `/symcc-task T-5 retry`), and a `lead.json` left by a session
  that is gone (with the fix: `/symcc-drive`).
- **Cleaning up:** `/symcc-doctor fix` cleans up every item it offers; `/symcc-doctor fix
  b-T-5 m-1101-1000` only those. Ids, not list numbers, so an item that went away in the
  meantime (the regular check also removes finished tasks' folders and branches) can never
  make you delete a different one: an id no longer offered is named and skipped. Each item is
  checked again right before it goes, so work added in between is kept. The same works in OpenCode and on the command line (`cmd symcc-doctor fix`), and the
  lead has a `doctor` tool, which it uses to clean up only after you said yes.
- **Never touched:** reports, org-mem, scouts, roles and task types, a running task's folder or
  branch, and the unmerged or uncommitted work of any task that is not dropped. While a merge is going on, the doctor still
  checks and shows the list (the task being merged has its folder and branch marked "being
  merged" and never offered), but `fix` changes nothing and says which merge is running; try the
  fix again when it is done. When `board.json` can't be read, it can't tell which
  tasks are finished, so it leaves every folder and branch alone and only checks the files.

### A worker over its time limit

When a worker runs past `max_minutes` (45 by default), symcc does not stop it. The task stays
"doing" with the note "over time; asked the owner", you hear "needs you" (if notify is on), and
the lead asks you in the chat, for example "T-5 has run 45 min. Give it more time?", with the
choices **+30 min**, **+60 min** and **Stop it**. The same buttons are on the task's page in the
board. The worker keeps working while you decide.

- **+30 min / +60 min** (or any "+N min"): that task's limit moves N minutes later and the
  worker goes on. If it runs past the new limit, you are asked again.
- **Stop it**: the worker is told "time is up: write down what you have done and found, save
  notes into your task's files, and hand back now". What it hands back is saved as the try's
  report. After about 3 minutes at most it is stopped. The task fails with a note saying the
  work so far is in its folder and report; its folder and branch are kept, so a retry
  continues from there.
- **No answer**: once the worker has run its limit plus `max_minutes` again (twice the limit when
  no time was added), the same as Stop it happens.

## Stats: time and tokens

`/symcc-stats` prints a plain text report built only from what the board already keeps (each
task's tries with their start, end and tokens, its tries count and its history), archived
tasks included. You can also ask the lead, e.g. "how much did we spend this week?": it uses
its read-only `stats` tool.

- **Range:** `/symcc-stats` covers every task; `/symcc-stats 7d` the tasks changed in the last
  7 days; `/symcc-stats T-100..T-130` an id range.
- **Only the work inside the days:** a day range counts every whole try of each task changed
  in it, so a try that started before the window counts in full. `/symcc-stats 7d inside` counts
  only the work inside the 7 days: tries and stages are cut to the window (a try from before it
  that ended inside counts only its part inside, with its tokens; tries that ended before it are
  left out). The report's second line says which way it counted ("Counting: ..."). The lead's
  `stats` tool takes the same as `inside: true`. With no day range, `inside` changes nothing and
  the report says so.
- **Summary and full:** `/symcc-stats` starts with one line (tasks done, hours of work, tokens,
  share right on the first try), then short parts with plain bar charts (`▇`, with `▂` and `▅`
  for a part of a block, so small numbers still show), each scaled to the biggest number in
  that part, with the counts and percentages lined up. Every line fits in 80 columns. It keeps
  every figure; the long explanations become short footnotes. `/symcc-stats full` (also with a
  range, e.g. `/symcc-stats full 7d`) adds them back: the billed-equivalent lines with how they
  are weighed, where the lead's tokens come from, and how the stage times are read. The lead's
  `stats` tool gets the full text, unless it asks for the short one.
- **Spread of time and tokens:** under "Per done task" two charts show how the done tasks are
  spread (the same tasks the averages and medians use; investigations left out): time per done
  task and tokens per done task. There are 6 rows centered on the median, each step double:
  edges at the median divided by 4, divided by 2, the median, times 2 and times 4 (rounded to
  readable values, e.g. 2m, 5m, 18m; 300k, 1.2M), with a median line between the 3rd and 4th
  rows. Each row has its range, a bar scaled to the biggest row, and the count. A task exactly
  on an edge goes in the upper row. The two outer rows are the odd ones out: the top one names
  its 3 biggest tasks by id with their value ("slowest: T-496 3h 45m · ..."), the bottom one is
  marked "very fast" or "very small". With fewer than 10 tasks (or a median of 0) there is no
  chart, just one line saying so. The text report, the colored chat view and the web page all
  have both charts.
- **Web page:** `/symcc-stats html` (also with a range, e.g. `/symcc-stats html 7d`) writes the
  same figures as one page with charts, `.symcc/stats.html`. The page is self-contained: no outside
  links, so it works offline. It follows light and dark, fits a phone and prints well. symcc says
  where the file is and tries to open it in your browser.
- **Kinds of tokens:** symcc keeps four counts apart wherever it records tokens (each try,
  each scout run, the lead's calls): *input*, *output*, *cache write* (input saved to the
  prompt cache) and *cache read* (input read back from it). They cost very different amounts:
  a cache read costs about a tenth of normal input, so one plain sum makes the cost look much
  bigger than it is. The totals and the "Whole team" part show the kinds on the line under each
  figure, plus a **billed** (billed-equivalent) figure ("292M in all, about 35M billed"): the kinds weighed by their usual
  price compared with input (input 1, cache write 1.25, cache read 0.1, output 5), i.e. how many
  plain input tokens would cost the same. It is an estimate: real prices depend on the model.
  Elsewhere (the board, the banner, a task's page, the per-task and per-day rows) one short
  figure is shown, "in all": every kind of token added up.
- **Unsplit tokens:** tries and scout runs saved before the kinds were kept apart only have one
  number. symcc changes those files once (when a session starts): the number is kept as it was,
  marked *unsplit*. They count in the "in all" figures and are shown as `unsplit`, but are left
  out of the billed-equivalent (the report says how many), since their kinds are not known.
- **Whole team:** the tokens of the lead (the main Claude Code chat), the workers and the
  scouts, each with its kinds apart, their total with its billed-equivalent, and the tokens per
  merged task (in all and billed-equivalent), for the chosen range. Workers are
  counted by task (their tries); the lead and the scouts by time: for `7d` the last 7 days,
  for an id range the time those tasks span (from the first one made to the last change).
  - *Lead:* Claude Code's plugin API gives no token counts per session (only this session's
    dollar total), so symcc reads Claude Code's own session logs in
    `~/.claude/projects/<this project's folder>/<session>.jsonl` (or under
    `CLAUDE_CONFIG_DIR`). It only reads, only this project's folder, and only the usage
    numbers of the main chat's answers (each answer once). Every main session in this
    project counts, also ones where you worked without symcc. When there are no logs, the
    report says the lead is not counted.
  - *Scouts:* each scout run (also a stopped one) adds its tokens and time to a running
    total per scout, kept in `.symcc/scouts.json` under `usage` (also per day, for ranges).
    Runs from before this was added are not counted.
  - *Dollars:* not shown, since symcc doesn't know the model prices. Where Claude Code
    reports one, the report adds this session's total so far, as `/cost` says.
- **Parts:** tasks by status (bars); work (worker time, tokens in all and about how many
  billed, by kind); the whole team (bars); per done task (average and median time and
  tokens, tries per task, share done on the first try, lead time: from made to done); per
  try (average time and tokens); wherever an average per task or per try is shown, its total
  sits next to it ("avg 25m · median 30m · total 1h 40m"; for roles and origins on the line
  under it); time per stage (see below); the 5 biggest tasks by tokens and by time (bars); how tasks
  ended (merged on its own, approved by you, or answered for an investigation; failed
  tries by reason: tests failed, sent back by the checker, clash with main, files out of scope,
  ran out of time (the worker's time, the tests' time, or its checking and merging), no result
  (the worker ended without one), no change, not merged (also when your files on main
  can't be updated; a try that only left out secret-looking files waits for you and is not
  counted), other (an API error, a refusal, the
  worker ending its turn early, checking that failed), restarted by a change, stopped, rejected
  (biggest count first; a reason with fewer than 3 tries is folded into "other", its name and
  count listed after it; each history line carries its reason, so the stats never read it back out of the words);
  "Each failed try" counts the same failed tries, except tries rejected by you and restarts, and
  says so when the two counts differ); each failed try on its own line (task, try, how it ended, and when its tests failed,
  the failing test command and the first failing test; the short view shows the latest 10); the
  tests that failed most (each test with how many failed tries and how many different tasks it
  failed, most tasks first, so a flaky test that fails many tasks stands out; the short view
  shows the top 5). When a try fails a test command, symcc keeps that command on the try, with
  the names of the failing tests read from its output (the "(fail) …" lines, at most 10);
  investigations on their own (how many, answered, time, tokens, tries; see
  [investigation tasks](tasks.md#investigation-tasks)); by role and where tasks came from (lead,
  you, all scouts with each scout on its own line under them, workers), each with its share,
  average tokens and time. Each scout's line has a small scorecard under it (the scout's own page shows the
  same figures in its own **Results** section just before **File**, on two lines: "last 7 days: …"
and "in all: …"):
  - how many tasks its findings became (merged, dropped or still open),
  - its own tokens in the range,
  - the tokens per merged fix: its tokens plus its merged tasks' tokens, divided by the number
    merged ("—" when none merged).
  - "N tasks not linked to a run": its tasks that no run in its runs file
    (`.symcc/scouts/<name>.runs.json`) lists, so a broken link shows the same day. Only tasks
    made since its oldest kept run that lists tasks count (older runs are no longer kept).

  A scout that used tokens but made no task is listed too. The last part is tasks done per day,
  for the last 7 days with activity, oldest first.
- **Time per stage:** for the done tasks (investigations left out), where their lifetime (made
  to done) went, each stage with its total, its average per done task and its share: waiting to
  start (to do, free to run), waiting on tasks (to do while a task in its `after` list was not
  done yet), in the backlog (only when there was any), work (the worker tries), prep, check (the
  checker), merge queue (waiting for its turn), tests (the merge queue's test commands), merge,
  and waiting for you (a question, or ready for review). Then *active* (work, prep, check,
  tests and merge) and *waiting* (the rest), which add up to the lifetime. It is read from what
  symcc already records: each try's start and end, and the timed history lines between them
  ("prep started", "checker started", "waits in the merge queue", "tests started", "merge
  started", "merged", questions, answers and results). A done task whose history has an entry
  with no time (older boards) or no stage line at all is left out, and the heading says how
  many.
- **What is left out:** tasks with no tries recorded are left out of the averages (the
  report says how many).
