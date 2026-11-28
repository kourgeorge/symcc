# The board

The board shows every task, what it is doing now and what it did. This page covers the panel, the task page, the Live tab and how to trace a task back.

## Live status: seeing the board

- **The board's name.** Every board gets a friendly random name, two words like `power-falcon`, picked
  once and kept in `board.json` (`name`). The banner's first line shows it next to the folder
  (`𝄞 symcc v0.6.0 · power-falcon · ~/repositories/symcc`), in the terminal, VS Code and OpenCode. Its task
  branches are `symcc/power-falcon/T-n`, so two boards that share one repo never touch each other's branches. There is
  no setting to rename it. A board from before names gets one the first time it loads, and its open
  `symcc/T-n` branches are renamed then (one that git refuses is renamed when its task starts a try).
- **The panel** opens by itself when a session starts (on a wide enough terminal; turn it
  off with the `open_on_start` setting). It shows a small banner (folder, branch, test
  command, limits, counts) and the task list. The workers and scouts are not in the banner;
  the running tasks are in the band above the prompt, the next scout in the status line. When nothing starts, the
  banner's first line says so in the warning color: `⏸ paused: nothing starts` (board paused)
  or `symcc is disabled · /symcc-enable to turn it back on` (symcc disabled).
  The clef drawn at the left of the banner moves now and then, about 4 frames a second, each
  move played once before it rests: it sways one column right and left about every 5 minutes
  while the panel is open and nothing else plays; it dissolves into a check mark when a task
  merges, a robot when a worker starts, or a note when a scout reports a finding, holds it
  about a second and dissolves back; and when the board becomes all done (nothing to do,
  doing, in review or waiting) little notes ♪ ♫ float up beside it. Only one move plays at a
  time (one that comes meanwhile is dropped). Nothing moves on a panel too narrow to show the
  logo or while the board is paused.
- **The band above the prompt** (Claude Code) shows what is happening and what needs you:

  ```
  𝄞 symcc  ⏵ auto merge · 2/3 agents busy · 3 tasks waiting · 12 completed today  [ open board ] [-]
   ⌕ T-740 8m ↺3   After a reopen, one hand-back…
   ▶ T-745 19m     Live tab: a compact view…
   ○ T-743 next up A try counts only real…
   ⚠ 1 question for you: Q-71 Raise the version?
  ```

  The first line has `𝄞 symcc`, a short dim summary of the board (the mode, the agents busy
  of the slots, how many tasks wait to start, how many tasks were completed today, and `⌕ 1 scout` while
  scouts run), the **open board** button and the fold button `[-]`. No task is on this line.
  Folding the band (`[-]`, or ctrl+x ctrl+a) keeps only this first line. Under it, indented one space: one line per running task (its
  stage's icon in color, the id in the accent (orange) color, the stage's name and the time in that stage and the try from
  try 2 on in green, then the title in the normal text color), the next task to start (`○ next up`), then the questions for you
  and the tasks that need you, in the warning color. A session that doesn't drive the board
  shows `⚠ this window follows (driver active 3 min ago); /symcc-drive to drive from here` here too. With nothing running and nothing waiting on
  you, a dim line under the first line says why and what to do next: the first line of the Live
  tab's TASKS section when nothing runs (see the Live tab below). When the band is narrow, the
  summary drops its parts from the end (the mode stays), and a task line cuts its title, then
  leaves out the time, then the try, so the title keeps its room. OpenCode's band is unchanged.
- **`/symcc`** opens the interactive board: ↑↓ to move, Enter to open a task. On the
  lists (Tasks, Scouts, Settings, Roles) ↑↓ move from row to row, and the panel scrolls to
  keep the row in view; past the first or last row they scroll the panel (to see the banner
  or the key line). ↑↓ never land on the tabs, the mode or search buttons or Back: Tab and
  Shift+Tab reach those. On a task's or a scout's page ↑↓ scroll. An
  open task shows everything about it, with buttons to pause, resume, retry, run now,
  drop, watch its worker live, and buttons or a box to answer it when it waits for you.
  `/symcc-board` opens the board too (on Live), `/symcc-task T-3` opens one task directly and
  `/symcc-scout` (with no name) opens the Scouts view.
- **`/symcc-tasks`** opens nothing: it prints a short list of the open tasks in the chat, the
  same in every client (Claude Code's terminal and VS Code, OpenCode, the Node host). It is
  grouped like the board: Questions for you and NEEDS YOU first, then Running (with the step's
  icon, the time and "↺2" from a second try), In review, Failed, and To do in run order
  ("after T-5" when a task waits for another one). Each task is one line: its mark, id, short
  state and title (cut to fit). Then one line of counts (`backlog 2 · done today 1 · dropped
  today 0`) and a hint: `/symcc-board opens the board · /symcc-task T-n opens one task`. With
  no open task it says `No open tasks.` above the counts.
- **`/symcc-status`** opens nothing either: it prints the Live tab's picture as plain text in
  the chat, the same in every client and made by the Live tab's own code, so its numbers always
  match the panel. The same sections in the same order: NEEDS YOU
  (only when a question, a waiting task or a task in review waits for you), TASKS (one line per
  running task: its id, title, its steps drawn as on the Live lane with ◉ at the step it is in,
  the time there and "↺2" from a second try; the tasks waiting for it hang under it as
  `└─◇ T-4 … waits`), BRANCHES (once git's figures were read), TODAY (merged, sent back, failed,
  tokens, the averages and first-try share, then the yesterday and last 7 days lines) and
  ORGANIZATIONAL MEMORY (the count and the 3 newest notes), then the line
  `/symcc-board opens the board · /symcc-tasks lists the tasks`. When tasks show, the
  `✧ = an agent works here (needs an agent slot) · ⌀ = tokens` legend comes last, after that
  line, never under the task rows (as on the board, where it is the page's last line).
- **Nothing in the panel needs Esc.** Esc in a text box or a pick list usually just gives
  the keys to the Claude Code prompt without the panel hearing of it (see
  `docs/research/esc-in-panels.md`), so every place has its own way out:
  - a text box (the search, "Your answer", the reject reason, a new scout's name, a
    setting's value): **Enter on the empty box** cancels it (the search: clears it). The
    reject reason, "Your answer" (opened with Answer…), the new scout's name and a
    setting's box also have a **Cancel** button under them (↓ to it, or its letter; the
    reject / Ask more box's Cancel has no letter, and while that box is open no letter
    key presses anything on the page: what you type goes only into the box, and the
    footer says just `Enter sends to todo · Enter on empty cancels`);
  - a pick list (a task's role, a setting's choices): its **Cancel** button, `c` for the
    role list, `x` in Settings;
  - a scout's edit page: its **Cancel** button (`x`);
  - a page: its **Back** button, `b`: a task page and the Scouts list or Settings go back
    to the board list, a task's changes to the task, a scout's page to the Scouts list.
  Each box and footer says the way out, e.g. `Enter sends · Enter on empty or c cancels`
  (the **[Cancel]** button's own letter is named there, not on the button).
  When Esc does reach the panel it still goes one step back the same way, and on the
  board list with no search it closes the panel; after a step back the panel asks for the
  keys again (if you had text in the prompt, Claude Code keeps them there; ctrl+x tab or a
  click goes back to the panel).
- **Search the tasks**: on the Tasks view press `f` (or the `[f] search` button in the footer)
  and type. The list shrinks as you type to the tasks that match every word you typed, in
  any case, looking at the task's id (`T-12`, or just `12`), title, details, role, status,
  where it came from (owner, scout name, the task it came from) and your request. It looks in
  every group, Backlog, Done and Dropped too: groups with a match open, the others are
  hidden. Archived tasks are not searched. Done and dropped tasks are found by words in their details and request too: the board panel keeps those out of its view to stay small, so while you type a search it reads them from the tasks' saved files (once per search). Their task page still shows the full text. Enter keeps the filter and gives you the list
  back (↑↓ and Enter work as usual); a line says what is on, e.g. `search: notify · 3 of 144
  tasks` (or `no tasks match`), with `[f] change search` and `[x] clear search` under it:
  `x` clears the search and shows everything. Enter on an empty search box clears it too.
  (Claude Code only lets panel keys be a letter or a digit, so
  the key is `f`, not `/`.)
  Besides plain words, the search takes filter words (the same in the terminal panel, the
  VS Code panel and the lead's board tool), and they mix with plain words
  (`last:5 status:done notify`):
  - `last:N`: the N tasks changed most recently, newest first.
  - `top:N`: the next N to run (the to-do tasks in run order; with `status:` those instead).
  - `since:30m`, `since:2h`, `since:2d`, `since:1w` or `since:2026-11-18`: changed since then.
  - `status:done` (or `status:open`, or several: `status:done,dropped`), `type:bug`,
    `role:tester`.
  - `waits-on:T-3`: the tasks that wait for T-3, directly or through a chain (T-5 waits for
    T-4, which waits for T-3).
  - `blocks:T-3`: what T-3 still waits for: the tasks on its chain that are not done (a dropped
    one too, since T-3 still can't start). A done task ends the chain there.
  - `stuck`: to-do tasks that can't start because something they wait for (directly or through
    a chain) is failed, paused, waiting for you, dropped, or missing from the board. A done
    task that was archived counts as done here, not missing.
  These mix too: `waits-on:T-3 status:todo`, `stuck type:bug`; `waits-on:T-3,T-4` takes either.
  A word like `foo:bar` that is not one of these is looked for as a plain word. The lead's
  board tool also takes `limit` and `sort` (`newest` or `order`: what runs next first, by priority), the same as `last:` and
  `top:`, and says how many matched in all (`10 of 37 matching shown`).
- The panel has four views, Live, Tasks, Scouts and Settings, shown as tabs under the banner:
  `[l]: Live │ [t]: Tasks (12) │ [s]: Scouts (3) │ [c]: Settings`, the open one bold, blue and
  underlined (on a narrow panel the tabs get shorter, `[l] Live│[t] Tasks (12)…`, never cut).
  The board opens on Live. Press `l`, `t`, `s` or `c` (or click a tab) to switch.
  The header (the banner with its tests/limits line and drive warning, then the tabs) shows
  only on the list pages: Tasks, Live, Scouts, Settings, and Settings' Roles, Task types and
  Organizational memory lists. A page of one thing (a task, a question, a scout or one of its
  runs, a role, a task type, a role's prompt) starts with its own title instead; its buttons and the
  key line at the bottom stay. This is the same in the terminal panel, VS Code and OpenCode.
  Back from a task opened on the Live tab goes back to the Live tab. The Live tab is on all three
  boards: the Claude Code terminal panel, VS Code (which draws the lanes as real lines;
  each waiting train is a link) and OpenCode (which has no `w` key to watch a worker); see
  [Live tab](#live-tab). The Scouts view lists each scout on one
  row: an icon (`◉` running, `◎` waiting for its next run, `○` paused), its name, how often
  it runs, when it runs next, what its last run found (`last: found 2`, `last: nothing` or
  `never ran`) and its model. On a narrow panel the model column goes first, then the
  `last:` one; the name is never cut. Enter opens a scout: its state, its file, its
  instructions, its recent runs, and buttons to run it now, edit it, or pause or resume it.
  Back (`b`) goes back to the Scouts list, and the Scouts list's Back to the Tasks list.
- The Settings view (`c`, or `/symcc-settings`) has one row per setting: a plain label
  (`Workers at once`), dot leaders, then the value, all values in one column (`45 min`,
  `auto merge`). The row has no default or range. A help area under a thin rule shows
  the focused row only: what it means, then its name (the one `/symcc-settings NAME VALUE`
  takes), default and range; on a group heading it shows a one-line hint. The rows are
  grouped under short headings (names below are the setting names):
  - **Work**: `mode`, `max_parallel`, `max_minutes`, `auto_retries`, `enabled`
  - **Checks before merging**: `test_commands`, `docs_test_commands` (shell commands, like
    `test_commands` and up to 5, none by default; they run instead of `test_commands` when a
    task of a prose-only role, `code: false`, changed only prose; see
    [Worker roles](tasks.md#worker-roles)), `test_minutes` (how many minutes each test
    command may run before merging, a whole number from 1 to 120, 10 by default; any other value
    is refused), `tests_with_changes`, `checker`
  - **Workers**: the **Roles** and **Task types** rows (org-mem is on the Live tab, see
    [Organizational memory](troubleshooting.md#organizational-memory-org-mem))
  - **Scouts**: `scout_findings`
  - **Board and alerts**: `notify`, `open_on_start`, `archive_days`

  Each heading is a group you open and close with Enter (→/← do not, since the panel's
  buttons only get Enter and letter or digit keys). When the page opens, all groups
  are closed and the first heading has the focus; a closed group shows its values in short
  after its heading, lined up in one column, e.g. `▸ Work                    auto merge · 3 at once · 45 min · 2 retries`, and an open
  one shows `▾ Work` with its rows under it. ↑↓ go over the headings and the rows of open
  groups only. The panel remembers which groups are open until the session ends. The lead's
  `settings` tool and `/symcc-settings` text always list every setting under the same
  headings. Enter on a row changes it: `open_on_start`,
  `checker` and `enabled` flip on/off; `mode`, `notify`, `scout_findings` and `tests_with_changes` open a pick list (paused / approve merge
  / auto merge; only the notify choices this computer can play; off / ask / review); numbers and `test_commands` open an edit box (the typed line is one
  command, run as one shell line, so `cd web && npm test` works as in a shell; several commands go in a list,
  `["npm test", "npm run lint"]`, up to 5; `none` clears them). Every box starts with one dim sentence on what the
  setting does (a number's range is in it), then an empty line; in a pick list each choice has a short dim note
  after it, or under it when the line is too narrow, e.g. `paused`: "nothing starts; running work stops". VS Code
  shows the sentence above the choices and the notes under them; OpenCode shows them in its dialog (the words are in
  `hooks/core/setting-notes.ts`). Enter on an empty box or Cancel (`x`) cancels; Back (`b`) goes to the Tasks list. Saving uses the same checks and limits as
  telling the lead, and a toast says what changed, e.g. `max_parallel set to 5`. A value
  over its limit is cut to it and the toast says so.
- Under **Workers**, the **Roles** row says how many worker roles there are (e.g.
  `6 roles · 1 off`). Enter (or a click) on it opens the **Roles** page, a table with one
  line per role:

  ```
  ‹ [Settings]
  Roles
  8 roles · 2 changed by you
  ────────────────────────────────────────────────────────────────
    NAME        FROM       MODEL   WEB  WRITES  WHAT IT'S FOR
  ❯ general     changed    —       —    code    a plain worker for any task
    checker     built-in   —       —    code    checks a finished change and tries to break it
    docs        changed    sonnet  —    code    documentation: README, guides, comments
    researcher  built-in   —       web  —       finds things out and hands back an answer
    writer      built-in   —       web  prose   plain-English writing; never code

    + New role (n)
  ```

  **FROM** says where the role comes from: `built-in`, `changed` (your file over a built-in),
  `added by you`, or `off` (the whole line is dim). **MODEL** is the role's model (`—`: the
  session's), **WEB** says whether it can search and read the web, and **WRITES** says what its
  worker writes: `code` (the tests run before merging), `prose` (a `code: false` role: only
  `.md` files) or `—` (a role that only answers questions, like `researcher`). **WHAT IT'S FOR**
  is its description, cut with `…` to fit (the role's page has all of it). The line under the
  cursor is marked `❯`. When the panel is narrow, MODEL goes first, then WEB, then WRITES, and
  then the description is cut; the name is never cut. A file that can't be read shows why on
  its line. The key line at the bottom says the keys: Enter opens a role, `n` makes a new
  one, `b` goes back to Settings; switching views (`t`, `s`, `c`) closes the page. Enter (or a click) on a role opens it in full,
  with the same page header as a task's or a scout's page: `‹ [Roles]` (Back, `b`) and its place
  in the list (`‹ 2 of 6 ›`; `k` and `j` go to the role before or after it, `[` and `]` on OpenCode), its name and
  description, its state (`built-in`, `added`, `replaced · 1 change`, and `off`), one row of
  buttons and a thin rule. The buttons: [Edit] (`e`), [Prompt] (`p`), [Turn off] / [Turn on]
  (`o`, not for `general`), [Reset to built-in] (`r`, only for a built-in you replaced; it asks
  "Yes, reset (`y`)" or Cancel (`x`) first) and [Remove] (`d`, only for a role you added; it
  asks "Yes, remove (`y`)" or Cancel (`x`) first). There is no key line at the bottom; the keys
  still work. For a role you replaced or added, **Changed from built-in** comes next: each
  difference from the built-in role as before → after (for example
  `model: (session's model) → sonnet` or `description: writes tests → my own tests`), for a
  changed checklist only its changed lines (removed ones marked `−` and dim, added ones `+`),
  and the day your file was last changed. A role you added says `added: no built-in to
  compare`. Near the top, every role's page says what it writes: `Writes: code (tests run
  before merging)`, `Writes: prose only (code: false; only docs checks run)` or, for a role
  that only answers questions like `researcher`, `Writes: nothing (answers questions; nothing
  is merged)`. Then come the sections **Model**,
  **Skills**, **Tools**, **Checklist**, **Placeholders** (the `{{placeholders}}` the checklist may
  use, and what each one becomes) and **File**. The VS Code and OpenCode boards draw the same
  page. Prompt shows the built-in worker prompt the role is put
  into, view only, with `{{role}}` marked where the checklist goes; it can switch between the
  `change` and `investigation` prompts (for the `checker` role it shows the checker's prompt,
  `prompts/checker.ts`, instead), and Back (`b`) returns to the role.
  Edit opens the role's edit page in the panel (like a scout's): the same names in the same
  order, one box each for **Description**, **Model**, **Skills**, **Tools** and **Checklist**,
  and between Tools and Checklist a **Writes** pick: `code` or `prose only` (Save writes
  `code: false` for prose only, and takes it out for code).
  The name is the file's name, so the edit page can't change it: to rename a role, rename its
  file. Save writes `.symcc/roles/<name>.md`
  (a built-in role is copied there first), Cancel (`x`) leaves without saving. `+ New role`
  (`n`) asks for a name, makes `.symcc/roles/<name>.md` from a short template and opens it
  in the edit page. All of it uses the same checks as the lead's `roles` tool (see
  [Worker roles](tasks.md#worker-roles)), and a toast says what changed.
- Typed form: `/symcc-settings max_parallel 5`, `/symcc-settings notify sound 2`,
  `/symcc-settings mode review`, `/symcc-settings test_commands "npm test"`. A wrong name
  or value says why, e.g. `max_parallel must be a whole number, 1-8`.
- `notify` is `voice` ("symcc: T-3 done", "my app: T-5 needs you" out loud: the project folder's name comes
  first, with dashes, underscores and dots said as spaces, and only its first three words when it is long),
  `sound 1`, `sound 2` or `sound 3` (a short chime from that sound set), or `off`. A new board uses `sound 2` where
  this computer can play sounds, else `voice` where it can only speak, else `off`.
  Once per session symcc checks which programs exist (without playing anything): on macOS
  `say` for voice and `afplay` with the built-in sounds for sound; on Linux `spd-say`,
  `espeak-ng` or `espeak` for voice and `paplay` (freedesktop sounds), `canberra-gtk-play`
  or `aplay` for sound; on Windows PowerShell's built-in speech and system sounds. A choice
  that can't play here is refused with the reason, e.g. `voice isn't available here: no
  speech program found (install espeak or speech-dispatcher)`, from the panel, from
  `/symcc-settings` and from the lead. If the saved choice can't play on this computer (the
  board was set on another one), you are told once and nothing plays; the setting is kept.
  Task text is always passed to these programs as a plain argument, never as shell code.
- The three sounds let you tell which project chimed: each set has its own "done" and "needs you" chime
  (macOS: `sound 1` Glass / Ping, `sound 2` Hero / Pop, `sound 3` Submarine / Funk; Linux and Windows use other
  system sounds, and a sound missing on this computer falls back to set 1's). The default set comes from the project
  folder's name, so two projects usually differ with no setup; picking a sound on the Settings page plays its chime.
  (There used to be a separate `sound_set` setting; an old board with `notify` `sound` is read as `sound N` once.)
- Panel keys: `a` approve, `x` reject or drop, `d` changes, `p` pause, `u` resume,
  `r` retry, `m` switch approve merge / auto merge, `f` search the tasks, `n` needs review, `1`-`9` a try's worker report on the task
  page (Enter on a line of ▍Runs: that agent's report), `k` / `j` the previous / next task or scout on its page, `t` / `l` / `s` / `c` switch views, `b` back.
- Copy, `y` on the task page: puts the task on the clipboard as plain text (its title, status, role,
  where it came from, why, what to do with the notes and your answers, the files it may change,
  what it waits for and the latest worker report). A toast says `T-12 copied`, or why it
  couldn't, e.g. `couldn't copy: this terminal has no clipboard access`.
- **Ctrl+T** (Claude Code's background tasks) shows running workers; open one to watch it.
- Each task lists how long each try took and the tokens it used, with the task's total
  ("In all" means every kind of token added up). The board shows no all-time total;
  `/symcc-stats` has the totals, with the kinds of tokens apart (see below).

### The task page and the scout page

A task's page and a scout's page start with the same 4-line header on every board (terminal,
desktop, mobile, VS Code and OpenCode), then a thin rule (the heavy rule stays on the main board
only; the Organizational memory page has the same header shape, see below):

```
 ‹ [Tasks]                                            T-738 · ‹ 2 of 6 ›
 T-738  Live tab: an empty line before each section (all boards)
 ▶ doing · worker · ⏱ 4m   change · general · try 1/3   ♟ from you
 [Pause]   [Role] [Watch worker]   [Drop]   [☐ Needs review] [Copy]
────────────────────────────────────────────────────────────────────────
▍Details
```

1. **Where you are**. `‹ [Tasks]` is Back: the arrow, then a button that names the tab you
   came from (`‹ [Tasks]`, `‹ [Live]`, `‹ [Scouts]`), drawn like the other buttons. On the right is the page's place in the list it was opened from
   (the same filter or search): `T-738 · ‹ 2 of 6 ›`. A click on `‹` or `›` goes to the
   previous or the next task (or scout) of that list, going round at the ends; so do the keys
   `k` and `j` on the Claude Code boards and `[` and `]` in OpenCode (where `k` and `j` move).
   A page alone in its list shows no place. A task opened from the Live tab goes through the
   Live tab's tasks.
2. **The title**: the id, always in the board's orange whatever the status, then the title in
   bold. A long title wraps, indented under itself. Under it (T-1080) a dim line says how big the
   change is, from git: `merged c2fb0c16 · 25 files · +539 −3,722` once merged, and
   `branch symcc/power-falcon/T-1063 · 25 files · +539 −3,722` before (a task in review shows it, so you see the
   size before you approve). It is saved when a try hands back and again at the merge. An
   investigation or an errand, with no commits, shows no such line.
3. **The state**: the status mark and word in its color, and for a running task its step and
   its work time; then task type · role · try n/m (n of the tries it may get, its automatic retries
   counted); then where it came from (`♟ from you`, `⌕ scout bugs`, `◆ lead`, `↳ from T-5`,
   `▸ from T-5` for a worker's report); then its note, dim, when it has one. There are no
   Status, Stage or Now rows in Details any more: Details starts with the **Steps** row (the
   way to the merge) and the **Added** row (when it was added and last changed). The
   **Priority** row comes last, after Tries: the task's priority number (bold when it is not 0) and, in grey, for a
   to do task its place in line: `next to start`, `2nd in line`, `3rd in line`… among the to do
   tasks that are free to start, in the order they start (lowest priority first, then the lower
   task number), or `waits on T-n first` (the first task it waits for that is not done yet).
   Any other status shows only the number: `Priority  0 · next to start`, `Priority  -2 · 3rd
   in line`, `Priority  0 · waits on T-958 first`, `Priority  3`.
4. **The buttons**, in groups, with words only (their keys are in the key line at the bottom,
   never inside a button). Every button looks the same: `[Label]`, in the normal text color.
   The order of the groups and the gaps between them say what is what: first the one next
   step (Pause, Approve, Retry, Resume, Merge now, Move to todo or Done; none while the task
   asks you something); then the other task actions (Role, Watch worker, Show changes, Run now,
   Stash to backlog, Already merged, Keep as a note, Ask more); then, set apart, the ones that throw
   work away (Reject, Drop); then, at the end, the page's own: `[☐ Needs review]` (a checkbox:
   `n` turns it on, `[☑ Needs review]`, and off) and `[Copy]` (`y`).

At the top of the page, above ▍What to do (and the other sections), comes **▍Done** (T-1080): one or two
plain sentences on what the whole task has done so far. The worker writes them as the first line of
every report, `Done: …`; symcc keeps the latest one on the task, puts it in the commit message and in
the lead's `✓ merged` update. An old task, or one whose report has no `Done:` line, shows no ▍Done.

When the task waits for your answer (a question, a checker's Merge as is / Keep fixing / Drop, a file
request, more time), its question box is the first thing under the header, above ▍Done and every other
section, on every board. The number keys pick a choice as before.

Further down, ▍Runs comes right above ▍Report, the last section (you pick a report in Runs, so Runs
comes first; the order is ▍What to do, ▍Timeline, ▍Runs, ▍Report). ▍Report is one section for whichever agent's report you picked in ▍Runs (T-1104):
its heading says exactly whose and which try, `▍Report · try 3 · worker af4…74a` or
`▍Report · try 1 · checker a6f…53d` (`▍Report · try 2 · worker` when no agent id is known). The page
opens on the latest try's worker report. The try keys, `1`-`9`, show that try's worker report and
are in the key line: `1-3 a try's report · Enter on a Runs line: its report`.

On a narrow panel lines 3 and 4 wrap between their groups, never inside a button; a group wider
than the panel wraps between its buttons, and with no room left the page group goes to its own
line. In OpenCode the header stays at the top while the rest of the page scrolls under it; in
Claude Code the panel scrolls as a whole (it has no fixed area), so the header is the top of the
page. The key line keeps every key it had, plus `k j prev/next` (`[ ] prev/next` in OpenCode)
when the list has more than one.

#### The Runs section

The section of a task's page right above ▍Report sums the task's own tries in its heading, and lists each try
with one dim line per agent under it (every worker and checker the try had):

```
▍Runs   3 tries · 21m · 10.1M tokens (3.6× the usual task) · checkers ⌀ 2.4M
  try 1: …
  try 2: 14m · 6.2M tokens in all · finished: merged
    ▸ worker  ses…Qr2  11m · ⌀ 4.1M
    ⌕ checker a01…c3b  3m · ⌀ 2.1M
  total: 21m · 10.1M tokens in all
```

The heading says how many tries, their work time, all their tokens and how that compares with
the board's usual merged task (left out while no task is merged yet), and how many of the tokens
were the checkers' (left out when not known). A try keeps each agent's own tokens: a worker
restarted after a reopen gets a second line on the same try, and a stopped checker keeps the
tokens it had, when the host says them. The try's tokens are its agents' added up (plus their
short follow-up turns for organizational memory). The agent list is the only place a try's tokens,
cost and agent ids are kept: the sums are worked out from it. Only the last 5 tries keep their
agents' ids (and so their lines); older tries keep every agent's tokens but no ids, so they show
no lines.
In VS Code the folded `▸ Time and cost` row says the same sum.

Each agent line that has a report file is a button (T-1104): click it, or move to it and press Enter
(in OpenCode `↑↓` then Enter), and ▍Report shows that agent's report: a worker's is the try's
worker report, a checker's is its own saved report. The line being shown has a `●` before it. A
line with no report file (a checker that saved none) is plain text. A worker restarted on the same
try has two worker lines and one report file: both open it. A try with no agent lines (older than
the last 5) is one `try N` line, a button when that try's worker report exists. VS Code draws the
lines as link-style buttons, like its other buttons on the page.

A scout's page has the same shape:

```
 ‹ [Scouts]                                         bugs · ‹ 3 of 10 ›
 bugs  Looks for real bugs in recent changes
 ◷ every 2 days · next in 38m   last ran 2h 00m ago: 2 findings → T-736, T-739
 [Run now]   [Edit]   [Pause]
────────────────────────────────────────────────────────────────────────
```

Line 2 is its name and its summary (just the name when its file has no summary); line 3 how
often it runs (or `◉ running now`), when it runs next, its model, and its last run with what
came of it; line 4 Run now (not while it runs), Edit and Pause or Resume, with `⏸ paused` said
at the end while it is paused.

VS Code draws the same 4 lines with its own controls: `‹` and a `Tasks` back button, a
`‹ 2 of 6 ›` pager, the title as a heading, the state as words (the status as a colored mark, then dim words,
no pill), the buttons (in one style, no red; the one main action, the first of line 4's
first group, is VS Code's primary button; needs review is a button too), no rule or divider in VS Code.

#### The Branch section

Under **▍Details**, a task that has a branch shows it against the branch it merges into, in the
same look as the Live tab's `BRANCHES` section:

```
▍Branch  symcc/power-falcon/T-733 · 3 commits · 10 behind main
 main   ●─────●────────●──●──●────────●──●──●──●──●──●──●   447d3c8 · 2 min ago
        │ 14:42                 ⇣ caught up 15:50
        ╰──●────────●───────────┴──●
           638235d  a077ff8        4825c84
           try 2    try 4          try 6
```

- **The heading**: the branch, how many commits of its own it has, and how far behind main it
  is (`10 behind main`, or `up to date`; a merged task says `merged into main`).
- **main's line** on top: its commits since the branch left it, and the newest one's short id
  and how long ago it was made. Under its start, `│ 14:42` is the fork: when the branch left main.
- **The task's line** under it: one dot per commit of the task, with its short id and the try
  that made it under it. `⇣ caught up 15:50` marks each time main was merged into the branch
  (at the start of a try, and the "bring up to date" step before a merge).
- **A merged task**: its line goes back up into main, `╯ merged 16:10 (4825c84)`. A failed or
  dropped task's line is dim. A task with no branch yet (to do, never started) has no Branch section.
- **A long history** shows its latest commits, starts with `┄` and ends with `… 9 earlier`;
  the section is never wider than the page.

It is on every board: the terminal, desktop and mobile, VS Code (the same lines in the
monospaced font) and OpenCode. The git facts are read in the background when the page opens
and about every 30 seconds after, never while the page is drawn, so the page does not wait for
git; a page opened right away may show the section a moment later. OpenCode's board has it for
the open tasks with a branch, the 5 latest merged ones and the 5 latest dropped ones.

### Live tab

The Live tab (`l`) shows the tasks that run now as "railway lanes", one lane per task the board counts as running (a task in doing, or an approved or files-cleared task while its tests and merge run, or a task that waits for your review).
Each lane shows the path that task really takes: a normal code task goes `work → check → queue → tests → done` (`check` only
when the checker setting is on); an investigation goes `work → done` only (no check, queue, tests or merge) and leaves the lanes when
it hands back, then waits under NEEDS YOU as "answer to read"; a docs-only change shows `check` as a dim `–` once it has handed
back and symcc has seen that its commit changed only docs files (the checker skips it; the dash stays until it merges, also
while it waits at `you`); a task that needs review (it has "needs review" on, or the board is in approve-merge mode) has a
`you` station before `done`, and its lane stays at `you` while it waits for you and goes on to `done` when you approve. Lanes
that skip stations are drawn as a plain line through those columns, so the station names over the lanes stay lined up.
Under the tab row it has up to five sections, each starting with a heading line: three thin rule characters, a space,
`❯`, a space, the name as a bold UPPERCASE word, then a thin rule (`─`) to the right edge, all in the same color (`─── ❯ TASKS ────…`;
on a narrow panel `─ ❯ TASKS` with the name cut, no rule): `NEEDS YOU` (only while something waits), `TASKS` (the lanes),
`BRANCHES`, `TODAY` (the `Now:` row, then today's numbers) and `ORGANIZATIONAL MEMORY` (`ORG-MEM` on a narrow panel). One empty line sits above each heading (none above the first)
and one under it, and the lines under a heading are indented by 1 space (VS Code shows the same
words as bold headings with the same spacing):

```
─── ❯ NEEDS YOU ────────────────────────────────────────────

 ⚠ Q-88  Which figures should go on TODAY's 4th line?
 ⚠ T-749 ready for review: Website home page: a live, played-out demo…
 ⚠ T-751 asks: Claude Code only lets a button key be one letter…
 ⚠ T-751 has run 45 min: more time?

─── ❯ TASKS ────────────────────────────────────────────────

                       work✧    check✧   queue    tests    done
 ▶ T-684 /symcc-doctor checks…  ●━━━━━━━━●━━━━━━━━◉────────○────────○
   try 2/3 · ⏱ 24m · ⌀ 1.1M (0.9×median) · worker 812.4k · checker 287.6k · ⌕ × 1  change
```

- `NEEDS YOU` is the first section, shown only while something waits for you, and hidden (no
  heading, no empty line) otherwise. One row each, in the warning color: the open board questions
  (`Q-n` and their text), then the tasks that wait for you (a worker's question, a file request,
  more time), the tasks ready for review and the answered investigations to read. It is the same
  list as the band above the prompt and the board's NEEDS YOU. Enter (or a click) on a row opens
  that task's page or the question; the rows are the first stops of the arrow keys. Rows are cut
  to fit the panel.
- A task that needs you (a question, a file request, more time, a review) is listed in `NEEDS YOU` and also keeps its lane in `TASKS`
  (at the `you` station), with the tasks waiting for it (the `└─◇` rows) under it.
- Lanes are in the order the tasks started their current try, so a new one joins at the bottom
  and the lanes don't jump around. Each starts with `▶ `, then the task id and its title (cut
  with `…`, wider on a wider panel). The `▶ ` and the id are bold in the accent color and the
  title is normal text, so the running tasks stand out from the waiting ones below them (those
  are all dim).
- The stations are work → check → queue → tests → done; check is left out when the
  `checker` setting is off (its prep step then counts as work). Passed stations are `●━━`, the
  ones ahead `──○`, and the current one blinks between `◉` and `◎` (Claude Code doesn't tell
  plugins about reduced motion, so it always blinks; the tab redraws itself every second while
  it is shown). The `✧` after work and check (in the headings' color) means an agent works there, so
  those stations need an agent slot (a worker or a checker); the legend, the very last lines of the tab, below the footer's key line (right under it, no divider line), says
  `✧ = an agent works here (needs an agent slot) · ⌀ = tokens`; queue and tests use none, so there can be more lanes than
  `max_parallel`. It never sits under the task rows. When the page is shorter than the screen (the panel in VS Code), the
  empty room goes between the content and the footer. On a narrow screen the legend is cut at spaces onto more lines, never wider than the screen, still under the key line.
- The track ends at the same column for every lane, 3 columns before the right edge of the section (T-1193), so the tracks line up. A lane's first line has 3 blank columns after the track; the title gets all the room between the id and the track (cut with `…` only when it does not fit). Every station name starts over its mark, `done` too: it ends at the right edge and is never cut. On very narrow screens the 3 blank columns go only after the title is gone.
- In VS Code (T-1003, T-1017) a running lane is three lines: the mark, the id (a link) and the full title (cut with `…` only when
  the panel is too narrow), then, indented under the title, the train and the time at the right (`try 2 · 12m`; "try"
  only from the second try), then a dim numbers line (the same text as the terminal's second row below, with the task
  type at the right end; the `⏱` time is left out, since line 2 shows the time, and the type goes when the row is too narrow). One header row above all the lanes names the stations in full words (`work check queue tests
  done`, with `you` when a task waits for you), so every train lines up under it. VS Code has no legend line and no
  folding sections: the headings are plain bold words. Status is split into Mode (with a `change` link), Scouts, Branch
  and Tests rows; Organizational memory is one line with an `All notes` link. When nothing runs: `All done`, `Up next
  from the backlog`, and one primary `Tell the lead` button. On a narrow panel the train and header shrink together.
- The second row has no bar, only numbers about this task:
  `try 4/4 · ⏱ 41m · ⌀ 7.3M (7.6×median) · worker 5.4M · checker 1.9M · ⌕ × 2`. That is
  the try (`try 2/3`, auto retries after failing tests included), the task's working
  time so far (all tries; time when Claude Code was closed is left out), the whole task's tokens
  (every try so far), how many times the board's median tokens per merged task that is (yellow
  from twice the median), how its tokens split between its workers and checkers, as
  `worker 5.4M · checker 1.9M` (a part that is 0 is left out, and nothing shows when there is nothing to split), and
  `⌕ × N` for how many times the checker sent the task back (`⌕` is the checker's mark; on a task row, `↺` with a number is the try). On a narrow panel the parts go in this order: first the
  split, then `(×median)`, then `⌀`, and the clock `⏱` last; the try stays. The task type (dim) ends this second row, two spaces after the last part; on a panel too narrow for it, it is dropped, never wrapped (waiting child rows show no task type). A running row's first line has no time at its end (the `⏱` below says it), so its title gets that room. A
  running worker's tokens are only known when it hands back, so until then the row shows the
  earlier tries' sum with `+ …` (`⌀ 4.0M + …`), or `⌀ at hand-back` on a first try.
- **Signs on the boards:** `⌀` = tokens (a count has `⌀` in front: `⌀ 716.1k`; the legend at the bottom of the Live tab, below the footer, says so, and with no lane the same dim note, `⌀ = tokens`, ends TODAY). `median` marks a median (`median ⌀ 2M/task`). Task pages (the agent lines, the Tries summary's checker part) use it too. `/symcc-stats` and its HTML page keep the word "tokens".
- Just merged: a task that merged in the last 10 minutes keeps its lane for a while, under the
  running ones, drawn as finished: the track filled up to `merged` with `✓` there (green), a dim `✓ `
  where a running lane has `▶ `, the id in the accent color, the title and second row dim, and `merged 3m ago` at the start of the second row, before `try` (T-1177; it shortens to `3m ago` only when every other part of the row is gone).
  At most 3 such lanes show, newest first; after 10 minutes, or when a 4th task merges, the oldest
  goes. Only merged tasks get one: answered investigations,
  failed or dropped tasks don't. Enter (or a click) on a finished lane opens its task page. A finished lane's second row ends with the change size, `+212 −48` (T-1080; no file count there); it is the first part dropped when the row is narrow.

  ```
   ▶ T-760 A running one ●━━━━━━━━◉────────○────────○────────○
     try 1/3 · ⏱ 2m · ⌀ at hand-back  change
   ✓ T-747 Live tab: each section starts…  ●━━━━━━━━●━━━━━━━━●━━━━━━━━●━━━━━━━━✓
     merged 3m ago · try 1/3 · ⏱ 38m · ⌀ 5.7M (4.6×median) · worker 4.1M · checker 1.6M · +212 −48  change
  ```
- Waiting trains: a todo task that waits (its `after`) for a task that has not finished hangs
  under the lane of the running task it waits for, indented with `└─◇`, its id and cut title,
  then `waits` (no task type). The waiting train's id is in the accent color (orange) and the rest of the row
  is dim gray. Topic labels in the organizational memory rows and topic grid are blue:

  ```
   ▶ T-712 Scout or… ●━━━━━━◉──────○──────○──────○
     try 1/3 · ⏱ 2m · ⌀ at hand-back  bug
     └─◇ T-713 Task files: no si…  waits
        └─◇ T-714 Help: /symcc-h…  waits
     └─◇ T-716 Live deps…  waits  + also T-690
  ```

  A task that waits only for another todo task hangs under that task's train, one step further in
  (T-714 above waits for T-713), down to a running lane. A task that waits for several unfinished
  tasks shows once, under the one furthest from merging (a todo task before a running one; else the
  lane at the earliest station; same station: the one that started last), and `+ also T-690` names
  the others. Under a lane at most 3 levels and 6 trains show, then `└─ +N more waiting`. On a
  narrow panel the title gets shorter and `+ also` becomes a count; nothing is wider than the panel.
  Enter (or a click) on a train opens that task, and Back returns to the Live tab.
- Under the `TASKS` section, the **Branches** section shows how each open task's branch stands
  against the branch the tasks merge into (usually `main`):

  ```
  ─── ❯ BRANCHES ─────────────────────────────────────────────

    main   ●───●───●───●───●───●───●   c11a736 · 2 min ago
           │       │           │   ╰─◀ T-724  merged 3m ago (c11a736)
           │       │           ╰─────○ T-721 ▶ running · +3 commits · 1 behind
           │       ╰─────────────────○ T-725 ◆ in review · +0 commits · 4 behind
           ╰─────────────────────────○ T-726  not started
  ```

  On a board with projects, the section has one block per repo that has open or just-merged tasks: a line with the repo's
  name and the branch its tasks merge into (`client · merges into dev`), then that repo's own `main` line, and each task
  hangs off its own repo's line (`N behind` counts that repo's branch). A board with no projects looks as above.

  The `main` line has its last 7 commits, the newest at the right, with the newest one's short
  sha and age. Each task with a branch (doing, review, waiting, failed or paused) has a row that
  hangs from the commit its branch started from (at the left edge when that commit is older than
  the ones shown). After the task's id the row says its state, with the same mark and colour as
  the board list: `‖ paused`, `✗ failed`, `? waiting`, `◆ in review`, or for a running task the
  step it is in (`▶ running`, `⊛ test`, `⧗ queue`, ...). So a paused task's row explains itself even
  when the Tasks section says nothing is running. Then come `+N commits` (on the branch, not yet in
  main) and `N behind` (on main, not yet in the branch; in the warning colour past 5). Up to 3 next-up tasks that have no branch yet
  say `not started`. A task merged in the last 10 minutes keeps its row, drawn dim, joining the
  `main` line at its merge commit (`◀ T-724  merged 5m ago (5a97873)`); these are the same tasks
  (at most 3, newest first) that the Tasks section keeps as finished lanes, and the section shows
  while only such rows are left.
  At most 8 rows show, then `+N more`. On a narrow panel the main line shows fewer, closer commits
  and the words get shorter: the state word goes first and its mark stays (`T-47 ‖ +1 · 4 behind`),
  then `+3 ↓1`, cut with `…` if needed. Enter (or a click) on a row
  opens its task. symcc reads these numbers with read-only git commands at most every 30 seconds,
  without slowing the board; a branch git can't read is left out, and with no git (or no task
  branch yet) the section isn't shown. VS Code draws each branch on one line (no graph), and OpenCode shows the
  same section.
- The first row under the `TODAY` heading is `Now:`, then the board mode and `agents N/M busy` (workers and checkers running
  against `max_parallel`); there is no line of its own for this above the sections. While a scout runs, a small mark goes at the end of that row: `⌕`
  in the scout color, then each running scout's name and how long this run of it has gone on, dim
  (`Now: ⏵ auto merge · agents 2/3 busy · ⌕ gaps-bot 4m, board-review 1m`). When the names don't fit, it
  says `⌕ 3 scouts`, and on a very narrow panel just `⌕ 3`. A scout still waiting to start
  isn't shown. After the running scouts the line also names the next scout due, the one whose
  timer fires soonest (`⌕ gaps-bot 4m · next: simplify in 40m`); with no scout running it is
  just `⌕ next: gaps-bot in 12m`. Paused scouts and scouts that run only on demand are never
  the next one, and with none due there is no "next" part. On a narrow panel the "next" part
  goes first, then the names shrink; narrower still, `agents N/M busy` goes too and only the mode stays. With nothing running and nothing due there is no mark. A click on it (or the `s` key)
  opens the Scouts tab; this works on every board. The status line under the prompt and the band stay as they are. Under the `Now:` row, four lines about today, then two dim lines about the days before:

  ```
  ─── ❯ TODAY ──────────────────────────────────────────────

   Now: ⏵ auto merge · agents 1/3 busy · ⌕ org-mem-review 2m · next: version-reminder in 4m
   ✓ 67 merged   ↺ 76 sent back   ✗ 0 failed   Σ ⌀ 320.7M
   ⌀ ████████████████ lead 3% · workers 84% · checkers 8% · scouts 5%
   median ⌀ 2.8M/task · 9m work · 23m start-to-merge   first try 34% · avg 2.4 tries/task   ⌕ 68 sent back by the checker
   ⏱ 13h 06m agent work · ≈ $64 this session   busiest hour 14:00 · ⌀ 42M   ⌀/h 00▕▁▁▁▁▁▁▁▁▁▂▃▅▆▅█·········▏24

   yesterday:   ✓ 77 merged · ⌀ 355M · ⏱ 34h
   last 7 days: ✓ 176 merged · ⌀ 854M · ⏱ 53h
  ```

  The first line: merged, sent back (every send-back today: the checker's problems, tests failed, a clash with main), failed, and the tokens of everyone today (`Σ ⌀ 320.7M`; workers, checkers, scouts and the lead: the same total the bar's shares are out of, so it is never smaller than the busiest hour; when the lead's and the scouts' tokens aren't known it is the tries only and says a dim `(tries only)`). The second: a bar of who spent today's tokens (with a dim `⌀` in front; the lead, workers, checkers, scouts; each in
  its board color and its own shade), with the shares; it is the only bar in the section. The third:
  for the tasks merged today, the middle value (median) of their tokens, their work time and the time
  from their first try's start to the merge; then today's share of merged tasks that went through on the first try, the
  average tries per merged task (the same figures `/symcc-stats` shows), and how many times the checker
  sent a task back (left out when none). The fourth: all agent work today (the tries' time today and the
  scouts'); then `≈ $N this session`, the whole session's cost (not just today's) as `/cost` says it, only when symcc knows it (never a
  guess); then `busiest hour HH:00 · ⌀ N`; and at the very end the tokens per
  hour as a sparkline that always spans the whole day, `00` to `24`, with a dim `⌀/h` in front (a bare `⌀` when there is little room; the label is never dropped while the sparkline shows, and `00` and `24` always stay) and thin borders (`▕` `▏`) around it: the hours so far are bars, a past hour with no tokens is a dim `▁` (so the floor is one joined line), the current hour's bar is in the accent color, and the hours still to come are dim dots (`·`). A line with nothing to show is left out. A checker's tokens are counted apart from its worker's from now on (older tries count as the
  worker's), and the lead's part shows only where symcc can read the lead's usage. The lead's,
  scouts' and cost figures are read in the background at most every two minutes. On a narrow panel
  parts drop from the ends: line 3 loses the checker send-backs first, then the tries, the first try and the per-task figures;
  line 4 loses the busiest hour first, then the cost, then `⌀/h` shrinks to `⌀`; the label and the sparkline stay together, last, after the agent work time:
  when the sparkline itself is too wide, neighbouring hours are merged (2, 3 or 4 to a bar) so the whole day still fits. After one blank line, the two dim lines compare with earlier days, counted the same way: `yesterday` is the calendar day before today, `last 7 days` the seven days before today added up (today left out). Each says the tasks merged, the tries' tokens (`⌀`) and the worker time (`⏱`, closed-app time left out); a part that is 0 is left out, and so is a line with nothing. On a narrow panel `⏱` goes first, then `⌀`. Nothing goes past the panel's width. The task that starts next shows in the band above the
  prompt (`○ next up`), and the tasks that wait hang under their lanes. With nothing running,
  TASKS says in one or two dim lines why, and what to do next (the band above the prompt and
  `/symcc-status` show the same):
  - the mode is paused: `Paused: nothing starts. /symcc-mode auto starts work again.`
  - open tasks wait on something: `Nothing running · 3 waiting: T-5 needs you, T-7 waits for T-6`
    (the first reasons that fit: `needs you`, `waits for T-6`, `paused`, `ready` ...; a task
    that waits on several open tasks names the first and counts the rest: `waits for T-2 +3`)
  - no open task at all: `All done · last merged T-891, 12m ago`, then `Tell the lead what's next, or move one of 23 backlog items to todo.`
    (no backlog part when the backlog is empty, no "last merged" part when nothing merged yet).
    Under it, the next 3 backlog items (lowest priority first, then oldest), one line each, then how
    many more there are:

    ```
    All done · last merged T-922, 3m ago
    Tell the lead what's next, or move one of 39 backlog items to todo.
      ◇ T-744  Board written by a newer symcc: …
      ◇ T-801  …
      ◇ T-812  …
      … 36 more in the backlog

                                           work✧    check✧   queue    tests    done
    ✓ T-922 Under DAM: the lead posts bo…  ●━━━━━━━━●━━━━━━━━●━━━━━━━━●━━━━━━━━✓
      merged 3m ago · try 1/3
    ```

    An empty line keeps these lines apart from the just-merged tasks under them. When the board
    runs out of work like this, the lead also names 2-3 backlog items worth moving to todo (bugs
    and safety first), so you can pick.
  - a brand-new board: `No tasks yet. Tell the lead what you want built.`
- At the bottom, just above the key hints of the Live tab, the **Organizational memory** section (see
  [Organizational memory](troubleshooting.md#organizational-memory-org-mem)):

  ```
  ─── ❯ ORGANIZATIONAL MEMORY   57 / 60 ────────────────────────

   newest [all]
     11-21  tests      In tests, put dates relative to now, never a…
     11-21  workers    Before handing back, wait for every command…
     11-21  snapshots  To re-capture a saved page picture, print s…
   topics
     tests       14    git         11    board        9
     opencode     9    vs code      8    hosts       6
  ```

  The heading has the note count out of the 60 allowed and a fill bar, both in one calm
  color at every fill (never the warning color). Under `newest` are the 3 newest notes (day, topic, the text cut with `…`), under
  `topics` every topic with how many notes it has, the biggest first and `unsorted` (notes without
  a topic) last; on a narrow panel the topics take fewer columns. Enter (or a click) on a topic
  opens the Organizational memory page with only that topic's notes ("Organizational memory ·
  tests"); on a newest note it opens all notes with that one selected; on the `[all]` button next to
  `newest` it opens all notes. Back
  returns to the Live tab.
- Keys: ↑↓ move between the NEEDS YOU rows, then the lanes (and their trains), then the Branches rows, then the `[all]` button, the newest notes and topics; Enter opens the task's page (or the question's, on a NEEDS YOU row) (Back returns to the Live tab), `w`
  watches the worker of the lane with the focus, `l t s c`
  switch views, Esc closes the panel.
  On a narrow panel the title column and the gaps between stations shrink (the station names
  get shorter too); a lane is never wrapped or cut.

## Tracing a task back

Every task records who made it, why, and the words that started it.

Open the board with `/symcc`, or one task with `/symcc-task T-3`. The `from:` line says, for
example, `from: owner — “add a search command…”` or `from: scout bugs`. The timeline lists each try.

Every merge commit starts with the task ID. So `git log --grep "T-3"` finds the work for a
task, and the ID on a commit takes you back to the task and your request.

## Where to see what a task did

- **The git commit.** Each try's commit starts with the task ID (`T-3: ...`) and ends with
  trailers: `Symcc-Task`, `Symcc-From` (who asked), `Symcc-Why` and `Symcc-Try`. Find them
  with `git log --grep "T-3"`.
- **The task page** (`/symcc-task T-3`, or open it on the board): **Timeline** has one short
  line per event, each with when it happened ("10:42" today, "Nov 18 22:49" before), and a
  dim label for who wrote it: `worker symcc-T-3:`, `checker symcc-T-3-checker:` (the name the
  agent ran under), `lead:` or `you:`; symcc's own steps have none. For example what the
  worker said in a try (cut at a word end with "…") and how it went (`→ the checker found
  problems`), then the checker's own line (`checker symcc-T-3-checker: found problems: <its
  first problem>`, or `OK`), never the two joined in one line,
  **Commits** lists the commits each try made and the one that was merged, and **Report**
  shows the worker's full final report for the latest try. Press an agent's line in **Runs** (a
  worker's or a checker's, each with a report file) to read that agent's report in the same
  section, whose heading names it (`Report · try 2 · checker a6f…53d`; VS Code draws it as
  Markdown too). When more than one try has a report, press the try's number (`1`, `2`, ...) to
  read that try's worker report. `/symcc-task T-3`
  shows the first 40 lines (at most 4,000 characters) and says where the full report is.
- **Asking the lead.** The lead's `board` tool shows the same: with `task: T-3` it gives the
  task in full with its latest report (cut like `/symcc-task`) and the files of older tries'
  reports. With nothing it lists the open tasks and the backlog, and the done and dropped
  ones only as counts ("143 done, 3 dropped; ask with status: done to see them"). `status`
  (todo, doing, review, waiting, failed, paused, done, dropped, backlog, or `open` for
  everything not done, dropped or backlog) and `search` (words, matched the same way as the
  board panel's `f` search) narrow the list.
- **The report files.** Every try's full final answer (the worker's hand-back, also
  also when it asked you something) is saved in `.symcc/reports/T-3-try-2.md` (plain text,
  up to 50 KB; longer ones are cut, and the file says so).
- **The research note.** When a task's merged work adds or changes a file under
  `docs/research/`, the task page shows it in Details as `Research: docs/research/<file>.md`.
- **Claude Code's agent list** (Ctrl+T) shows a worker's whole conversation, but only for a
  while: it is not kept. The report file and the commit are what stay.

### Task events

Every time the board is saved, symcc compares each task before and after and sends out one
event for each thing that changed:

- `state`: its status changed (`todo` → `doing`, `doing` → `done`, ...);
- `stage`: its step on the way to the merge changed (`worker`, `prep`, `checker`, `queue`,
  `test`, `merge`, or none), with its place on the way into `queue`;
- `wait`: what it waits for from you changed (`answer`, `files`, `your-files`, `review`,
  `time`, `failed`, or none);
- `created` and `removed`: it came onto the board, or left it (archived).

Each event looks like `{"task":"T-3","kind":"stage","from":"checker","to":"queue","place":2,"at":"2026-11-20T10:42:00.000Z","try":1}`.
Nothing is sent when nothing changed. A check step that went stale counts as the step it was
until a save takes it away; then it is one stage change, once.

Two things listen today:

- **The activity log**, `.symcc/events.jsonl`: every event as one JSON line, the last 5,000
  kept.
- **The timeline**: each step a try goes into (prep, checker, queue, test, merge) gets a
  line with its time, such as "try 1: checker started" or "try 1: waits in the merge queue
  (place 2)", so the task page shows the whole path. The outcome lines (checker OK, merged,
  failed, ...) are written as before. These stage lines are left out of the "Earlier tries"
  list a retrying worker sees, so they never push out what went wrong.

A second log, `.symcc/evidence.jsonl`, shows where agents struggle. It gets one JSON line for
each of these:

- a guard refusing a tool call (which guard, and a short reason),
- a worker stopping because it needs files outside its list,
- a worker asking you a question (only that it asked, never the text),
- a checker's verdict,
- how a task's turn in the merge queue ended (merged, review, tests failed, timed out, clash).

No full commands, file contents or secret-looking text are kept. When the file passes 2 MB it is
renamed to `evidence-archive-<time>.jsonl` and a fresh one starts.

For developers: code that wants these events calls `onTaskEvent(fn)` from
`hooks/app/events.ts`. `fn` gets the events of each save, and the call returns a function that
stops listening.

The events come from `phaseEvents` in `hooks/core/events.ts` (pure, the same on every host).
`writeBoard` in `hooks/app/store.ts` is the one place every board save goes through.

A listener that fails never stops the save; you are told once. Listeners run after the board
lock is let go, so a listener may change the board itself. (The activity log is written while
the lock is still held.)
