# Scouts

Scouts are agents that look for work on a timer and report it to the lead. This page covers how to write, run and pause them.

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
normal permission rules, like workers) and search or fetch web pages. Changes only go through
board tasks. A scout runs in your own project folder, so symcc stops some things outright and
only asks for the rest:

- **Stopped by symcc:** editing or writing any file inside the project (it has no edit tools,
  and an edit that gets there anyway is refused), and any git command that changes something
  (commit, checkout, switch, reset, stash, branch or tag changes, merge, rebase, push and so on),
  with the same rules as the checker's below.
- **Allowed:** read-only git (`git status`, `git diff`, `git log`, ...), running your tests, and
  throwaway files outside the project, such as under `/tmp`.
- **Only asked in its prompt:** no installs, and no changing files with other shell commands
  (`echo ... > file`, `rm`, `sed -i` and such). symcc does not check these; your normal
  permission rules still apply.

The git check works on the command's plain text (a git command counts wherever a command starts) and is a best effort, not a sandbox. It also sees the open tasks, so it
doesn't suggest them again. To look further at the board it has symcc's two read-only tools:
`board` (no arguments: the open tasks; `status` and `search` narrow it; `task`: one task in full
with its latest report) and `stats`. Every symcc tool that changes something (`add`, `change`,
`drop`, `approve`, `settings`, ...) is refused for a scout with "scouts can only read the board".
A checker gets the same read-only tools.

When it is done, its whole report (up to 2000 characters) goes to the lead, which adds tasks,
tells you what matters, or ignores it. A scout that answers `NOTHING` sends no message.
The `scout_findings` setting says where the tasks it adds go, for every scout that has no
choice of its own: `auto` (the default) lets the
lead decide, so a finding it adds goes to `todo` and runs; `backlog` puts every task added
from a scout finding in the backlog, whatever the lead asks, until you (or the lead, on your
word) move it to `todo`. The lead still tells you what the scout found. Change it with
`/symcc-settings scout_findings backlog`, in the Settings view, or by telling the lead.

Each scout can have its own choice instead. Put `findings: backlog` (or `findings: auto`) in
its file's top lines and that scout's tasks follow it, whatever the board setting says: a
scout set to `backlog` always sends its tasks to the backlog (the lead is told "<scout>'s
findings go to the backlog"), and one set to `auto` lets the lead decide even when the board
setting is `backlog`. A scout without the line (or with `findings: default`) follows the board
setting, so nothing changes for existing scouts.

You can see and change the choice in every client (Claude Code's terminal, VS Code and OpenCode):

- The Scouts list says the board setting on its top line (`scout findings by default: auto`),
  and each row says its scout's choice in a dim column: `→ todo (auto)`, `→ backlog`, or
  `board: auto` / `board: backlog` for a scout that follows the board setting. On a narrow
  panel the model and the "last:" column go first, so this column stays as long as it can.
- A scout's page has a **Findings** line under its header that says what the choice means:
  `auto: the lead decides; bugs usually go to todo`, `backlog: every task from this scout
  waits in the backlog`, or `board default: follows the board setting (now auto)`.
- `f` on a scout's page (or a press on the Findings line; in VS Code its **Change** link) moves
  the choice on: board default → auto → backlog → board default. It is saved in the scout's
  file, the same as `/symcc-scout <name> findings auto|backlog|default` (board default takes
  the `findings:` line out). OpenCode sends that same command.
- The scout's edit page has a **Findings** pick list of the same three choices (board
  default, auto, backlog), saved with the rest of the page.
- The lead can set it too, with its `scouts` tool (`findings`).

A run's report shows when you open that run on the scout's page in the board panel. [`examples/scouts/`](../examples/scouts/)
has examples that work in most code projects:
- [`bugs.md`](../examples/scouts/bugs.md): wrong logic, such as bad conditions and off-by-one errors.
- [`test-gaps.md`](../examples/scouts/test-gaps.md): risky code no test checks, with test cases to add.
- [`deps.md`](../examples/scouts/deps.md): checks the web for new versions and security notices.
- [`secrets.md`](../examples/scouts/secrets.md): keys, tokens and passwords that are in git or
  could end up there.
- [`recent-changes.md`](../examples/scouts/recent-changes.md): problems the latest commits brought
  in; it also runs the tests.
- [`gaps.md`](../examples/scouts/gaps.md): what the docs and help promise but the code doesn't do,
  and errors that aren't handled.
- [`docs-check.md`](../examples/scouts/docs-check.md): docs that disagree with each other or with
  the code, and broken links.
- [`simplify.md`](../examples/scouts/simplify.md): code that could be simpler without changing what
  it does.
- [`big-files.md`](../examples/scouts/big-files.md): source files grown too large (or that many
  tasks keep touching at once), with a concrete way to split each one.
- [`org-mem-review.md`](../examples/scouts/org-mem-review.md): once a day, suggests fixes to the
  organizational memory (`.symcc/org-mem.md`): notes that are out of date, repeated, too narrow or
  too long, and lessons it is missing.
- [`backlog-review.md`](../examples/scouts/backlog-review.md): once a day, checks up to 10 backlog
  tasks against the code and git history and says which to drop, rewrite or merge.

A new project starts with these example scouts. The first time symcc starts in a project with
no `.symcc/scouts/` folder yet, it copies every example there and marks each one paused (in
`.symcc/scouts.json`), so they show in the Scouts view but never run on their timer until you resume
one: press `p` on its page, or run `/symcc-scout <name> resume`. To try one first, press `r`
(Run now) on its page or run `/symcc-scout <name>`: it runs once and stays paused. If the folder is already there (even empty, e.g. you removed
every scout), nothing is copied, and a scout file is never overwritten or added back. If the
copy fails, symcc says so once and starts as usual.

A scout's page in the board panel shows a header line (its name, state, how often it runs,
e.g. "every 7 days", its model and when it last ran), then its summary, then the sections
**Instructions** (the whole text of its file) and **File**. The summary is
the optional `summary:` line in the file's front matter, e.g. `summary: Looks for crashes`.
Without one, the page shows no summary line (the scouts list still shows the first line of
the instructions instead).

Under those, **Runs** lists the scout's recent runs, newest first, one line each:

- when it ended,
- how it ended (found, nothing, stopped, API error, refusal or couldn't start),
- how many findings its report numbers,
- the tasks made from it. A task the lead adds from a finding is saved in the scout's latest run
  that reported something, so it stays listed after the task is archived.

Open a run to read its whole report. In VS Code's side panel each run is one line (its time is a link, then what it found), and
"← <scout>" goes back. Esc goes back too. Leaving the scout's page any other way closes the run,
so the scout opens on its own page next time.

When the last run ended on an API error or a refusal, the page says so under the header ("Its
last run ended on an API error, so nothing was reported."). Each scout keeps its last 50 runs in
`.symcc/scouts/<name>.runs.json` and each run's full report in
`.symcc/reports/scouts/<name>-<time>.md`. Older runs and their report files are removed.

You can also make and change scouts right in the board panel: on the Scouts view, "New
scout" asks for a name, and "Edit" on a scout's page opens its edit page. It shows the same
header line, then the same names in the same order, one box each: **Runs every** (in
minutes, 0 = only on demand), **Model**, **Findings** (a pick list: board default, `auto` or `backlog`), **Summary** (empty: the first line of the
instructions is used) and **Instructions**. The name is the file's name, so the edit page
can't change it: to rename a scout, rename its file. Save writes the file (other front
matter keys are kept) and the new timing applies at once. `/symcc-scout <name>` runs a scout now.

Or just ask the lead. It has a `scouts` tool that can:

- **list** the scouts: how often each runs ("every 2 days" or "on demand"), whether it is paused
  or running, its next and last run, and the first lines of its last report;
- **show** one in full: its instructions, its whole last report and its last few runs;
- **add or change** one: a name of lowercase letters, digits and dashes, `every_minutes` (0 for
  only on demand), an optional model, an optional `findings` choice (`auto`, `backlog` or
  `default`: where the tasks from its findings go), and the instructions;
- **remove** one (it checks with you first);
- **run** one now, like "run now". A paused scout runs once and stays paused. The run is refused,
  with the reason, when the scout is already running or the project has no git yet.

Every change shows on the board at once. Only you pause or resume scouts; the lead can't.

### Scouts that run only on demand

`every_minutes: 0` (or 0 in the panel's "Runs every" box) means the scout runs only
on demand: never on the timer, only when you press "run now" on its page or run
`/symcc-scout <name>`. The Scouts list and its page say "on demand" instead of "every N"
and show no "next in …", for example `◎ secrets  on demand  last: nothing`, and the status
line's next scout skips it. If `every_minutes` is left out, the scout runs every hour.

A value that is not a whole number of 0 or more (like `-5`, `1.5` or `ten`) also means
only on demand, so a typo never makes a scout run more often than you meant. Its row shows
`bad every_minutes`, and its page and `/symcc-scout` show a warning such as
`every_minutes "-5" is not valid: runs only on demand until fixed`. The panel's editor
refuses such a value.

### Pausing a scout

To stop one scout for a while without deleting it, press `p` on its page in the panel, or
run `/symcc-scout <name> pause`. A pause only stops the timer: a paused scout doesn't run on
its own, but "run now" (`r` on its page, `/symcc-scout <name>`, or the lead's scouts tool)
still runs it once. It stays paused afterwards, and its last run and report are saved as
usual. If it is running when you pause it, that run finishes and reports as usual; the timer
doesn't start another. Press `p` again, or run `/symcc-scout <name> resume`, to start its
timer again. The pause is kept in `.symcc/scouts.json`
(next to each scout's last run), so it survives a restart and your scout file is never
changed. Only you can pause or resume a scout; the lead is told a paused scout doesn't run on its timer.
