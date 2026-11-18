# Changelog

When a set of user-facing changes is ready to release, bump the version in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` and add an entry here.

## Unreleased

### Added
- symcc runs outside Claude Code too, as a first test: `bun hosts/node/main.ts add | tick | board` drives the same board from a plain command line, with each worker as its own `claude -p` process in its worktree (a task's files become `claude -p` permission rules). A try's tokens and dollar cost are kept. There is no panel there: the board is the text board.
- `/symcc-drive` makes the session you type it in drive the board. If another session drives, it hands over within 30 s: it stops its workers, steps down, and your session restarts those tasks from their kept folders and branches, without using up a try. There are never two drivers at once, and a session that doesn't answer is taken over after the usual 3 minutes.

### Fixed
- Approve on a task's page answers at once: a toast "Approving T-448: running the tests, then merging…", and the page shows "Merging… (tests running)" in place of Approve, Reject and Merge now while the merge runs, so a second press can't happen (a key pressed anyway only says "already merging"). When it ends the page and a toast show the result ("merged" or why not). The same for Done, Keep as a note and Merge now, on the terminal, desktop, mobile and VS Code task pages. The changes view hides its approve and reject keys too while the merge runs, and the result is colored by how it really ended (merged or done is a success, even when the text says "git could not tell").
- A worker's try no longer fails with "the worker ended its turn before its work finished" because another agent (the lead or another worker) was still running a background command with the same text as one of its own finished ones. symcc now only ties a background command to a worker by its task id, never by its text alone. The guide now describes this failure.
- When you answer one of the lead's questions on the board ("Questions for you"), the lead now gets a board update at once with your answer in its own block ("The owner answered your question Q-3 (…): Yes. … Act on it."), instead of a "Meanwhile" line that waited for some other update. Your other board actions still come as "Meanwhile" lines.

### Changed
- The board in VS Code's side panel has no more blue boxes. VS Code draws every button as a filled blue box whose label never wraps, so task rows, question rows and scout rows are now plain text that wraps, with the ID (or scout name) as a link that opens it; Backlog / Done / Dropped (and the folds on a task's page) are bold links ("▸ Backlog 7"); the tabs are one line of text with the shown tab bold and the others links; and the mode switch is a small link. Buttons are kept for real actions (Approve, Retry, Save ...). The logo in VS Code is the single 𝄞 glyph, large and bold, since VS Code's font broke the multi-row clef apart. The terminal, desktop and mobile boards are unchanged.
- In VS Code's Tasks list a done task is one dense line ("✓ T-12 title", the title dim) and a dropped one too ("– T-12 title"), with no second "done" line, like the terminal list. Open tasks keep their status line. The terminal, desktop and mobile boards are unchanged.
- Role files name their extra tools in symcc's own words: `tools: web` instead of `tools: WebSearch, WebFetch`, so a role means the same in every host (in Claude Code, `web` is still WebSearch and WebFetch). Your own `.symcc/roles/*.md` files with the old names are changed once when symcc reads them. The lead's `roles` tool and the Roles page take `web`.
- The header shows just the name and version ("𝄞 symcc v0.4.1 · <folder>"), without the word "board" after them, in the board tool's text, the band above the prompt and the terminal, desktop and mobile header. With no version known it still reads "symcc board".
- The band above the prompt shows each doing task's real state and time, like the board's Tasks list: "T-440 ▶ 12m", "T-373 ▶ test", "T-435 ▶ check", "T-436 ▶ merge", with the try after it from try 2 on ("T-434 ▶ check · try 2"), in lined-up columns. The word "doing" is gone, and so are the notes the state already says ("worker on it", "checking and merging", "starting at the next turn"); every other note, such as "time is up: the worker was told to hand back", stays as the row's tail.

## 0.4.1 (2026-11-18)

### Added
- The board in VS Code's side panel has its own layout: a wrapped header, tabs without key labels, tasks grouped by status with whole titles and the status color on the mark only, Backlog / Done / Dropped as fold rows, and a footer with a mode switch button and a search box instead of key hints. The terminal board is unchanged.
- Tests now run one task at a time across all tasks (a `.symcc/tests.lock` file keeps the turn), so merges can take longer when several tasks finish at once. A waiting task shows "waiting for another task's tests (T-x)" and its time limit's clock is stopped meanwhile.
- Scouts keep their run history: each of a scout's last 50 runs is kept with when it ran, how it ended (found, nothing, stopped, API error, refusal or couldn't start), its findings, tokens, the tasks made from it (saved when the lead adds them, so archived tasks still count) and its full report (in `.symcc/reports/scouts/`). The scout's page, in the terminal and in VS Code's side panel, lists them under **Runs** (newest first) and opens one's whole report, and says when the last run ended on an API error or a refusal, so nothing was reported. The lead's `scouts` list with a name shows the last few runs too. A scout's last report becomes its first run once.
- The lead's questions that are not about one task ("raise the version?", "add a scout?") go on the board with its new `question` tool, so they no longer get lost in the chat. They show as "Questions for you (2)" at the top of the board list, with a button per choice plus "Answer…", and as "2 questions for you" in the band and the status line, with the "needs you" sound once per question. A board answer closes the question and reaches the lead in its next board update; a chat answer is closed by the lead.
- A task's page in VS Code's side panel is wide and readable: the full title and every section wrap to the panel instead of being cut, with clear headings (Title, Why / where it came from, What to do, Files it may change, Waits for, History, Time and cost, Report), the details and report drawn as Markdown (the report's first part, then `Show all`), one row of only the buttons that fit the status, a waiting question with its answers as buttons and a box for your own, and a `← Tasks` button back. The terminal task page is unchanged.
- The Scouts and Settings pages in VS Code's side panel are readable too. Each scout shows its name, its state with a colored mark, how often it runs, its last and next run, its summary and the start of its last report, all wrapped instead of cut; a scout's page has `Run now`, `Pause` / `Resume` and `Edit` buttons and its instructions and whole last report as Markdown. Settings shows every group as a heading with each setting on its own row: a drop-down for the settings with fixed choices (mode, notify, checker, scout_findings, tests_with_changes and the other on/off ones), saved when you pick, and a box with `Save` for numbers and the test commands. No key hints. The terminal, desktop and mobile pages are unchanged.
- Scouts (and checkers) can read the board with symcc's `board` (no arguments, `status`, `search` or `task`) and `stats` tools instead of reading `.symcc/board.json`. Every symcc tool that changes something is refused for them with "scouts can only read the board".
- The board's header in VS Code's side panel looks like a real side panel: the symcc logo (with its sway and little moves) beside the name, version and folder, the board mode as a colored pill with its meaning, the branch and driver on one line and the tests and limits on another, the counts as small badges, and tabs drawn as a segmented row of boxes with the shown one marked by a bold accent border and its count in a badge ("Tasks 20"). The terminal, desktop and mobile boards are unchanged.
- A task's page in VS Code's side panel reads like a card: the ID and title large and bold, a status badge in its color with the kind, role, try and time as small tags, the question, why it failed or the files it waits for boxed at the top in their color with their buttons (`Retry`, `Merge now`, the answers) right there, the history as a timeline (newest first, merges in green, failures in red), and Files it may change, Waits for and Time and cost as folds, closed by default. The terminal, desktop and mobile pages are unchanged.
- The lists in VS Code's side panel are easier to scan. Section headings show their colored mark and a count badge, with space between them; Backlog, Done and Dropped stay folded until clicked. Each task is one button: the ID dim, the title (up to two lines, then "(more)"), and a dim line with the status in color and how long it has run or waited, the kind, the try and the question or why it failed; a task that needs you starts with "●". The lead's questions look the same in the warning color. Each scout is one button with its state as a colored badge and the start of its last report dim. An empty board has one main button, "Tell the lead what to do next", and an empty Scouts list makes "+ New scout" the main button. The terminal, desktop and mobile boards are unchanged.

### Fixed
- Workers and scouts can no longer change git history: their git writes (commit, push, merge, branch, reset, stash and the like) are refused in Bash, also when hidden with brace expansion such as `git {stash,}`. Plain text that only mentions "git" (`grep "git"`) and read-only git (`remote -v`, `config --get`, `reflog`) still work.
- The folder guard now matches paths through symlinks, so `/tmp` and `/private/tmp` on macOS count as the same place.
- The board's drawing tests no longer depend on the clock.
- Workers, checkers and scouts are told not to end their turn while a background command is still running.
- The edit guard now also covers `MultiEdit`, so a worker's MultiEdit outside its allowed files is refused like Edit and Write.
- The kept test output caps its list of short "(fail)" lines, and the heading for the end of the test output is fixed.
- A plugin reload no longer loses queued starts or uses up tries: tasks keep their place in line.
- Sessions that don't drive the board now reload it when `board.json` changes.
- A `board.json` that cannot be read is never overwritten, and a broken one is reported once. While it is broken, every Edit or Write of a worker is refused, even inside its own files, since symcc can't check it.
- When symcc's own guard fails (it throws or runs out of time), calls from symcc's own agents (workers, checkers, scouts) are refused with "symcc couldn't check this call", and the lead's calls go on as if symcc weren't there; the lead's call of a symcc tool gets an error answer. Each failure is logged once.
- symcc's other hooks no longer fail open: when the agent listing hook fails, symcc's worker and scout types stay hidden from the lead's own chat (so the lead's model can't start a "worker" by itself), and when the agent start hook fails, the start of a symcc agent type is refused. The prompt, command, plan mode and board panel hooks pass the event on as if symcc weren't there. Each failure is logged once.

## 0.4.0 (2026-11-18)

### Breaking changes
- The Prompts page, the lead's `prompts` tool and the `.symcc/prompts/*.md` overrides are gone. Roles shape workers now.
- The `target_branch` setting is gone. A task merges into the branch it was made on.
- Workers ask through the `ask_owner` tool. symcc no longer reads `QUESTION:`, `OPTIONS:` or `NEED FILES:` lines.
- The old `voice` setting and the scout `every` key are no longer read. Use `notify` and `every_minutes`.
- Old `board.json` files are converted once.

### Added
- A failed task says clearly why: its page starts with a "Why it failed" block (the reason in one plain sentence, what the worker's report asks for, and what to do next), and its board row and the lead's board show the same sentence instead of the bare note.
- The Settings view groups the settings under headings: Work, Checks before merging, Workers (Roles, Kinds), Scouts, and Board and alerts. ↑↓ still go through every row. The lead's settings listing uses the same groups.
- The Settings view's groups open and close: all start closed, each heading showing its values in short (`▸ Work · auto · 3 at once · 45 min · 2 retries`); Enter on a heading opens or closes it, ↑↓ skip the rows of closed groups, and open groups stay open until the session ends.
- A doing task on its 2nd or later try says so: `try 2` in the board list (warning colour from try 3), `T-5 doing (try 2)` above the prompt and in the status line, and `try 2/3` in the lead's board while auto retries run. A first try shows nothing.
- The board banner's logo dances now and then: it sways when idle, turns into a check mark, robot or note when a task merges, a worker starts or a scout finds something, and sings when the board is all done.
- `tests_with_changes` setting (off / ask / review, default ask): a change task whose commit edits code but no test file is flagged before merging. With ask it merges and the lead is told "T-3 changed code but no test"; with review it waits for your review. Docs-only changes are never flagged. The lead now writes how each change will be tested ("Done when: tests show …").
- Investigation tasks: a task kind for questions ("is it possible…", "should we…", "how does X work?"). The worker hands back an answer; nothing is committed, tested or merged, and it always waits for you to read it, even in `auto`. Then Done, Keep as a note (a docs task saves it as `docs/research/<topic>.md`) or Ask more. Researcher tasks are investigations by default. The board shows `◆ answer` and `[investigation]`; `/symcc-stats` counts investigations on their own with the outcome "answered", and leaves them out of the first-try and merge numbers.
- Plan mode: while Claude Code is in plan mode, nothing starts and new tasks go to the backlog.
- Search the board: press `f` and type to filter tasks.
- `notify` setting: off, sound or voice. It works on Windows too, and it will not turn on something this machine cannot play.
- Waiting tasks are answered with buttons: Allow / Don't allow for file requests, and the options for questions.
- Review: you can edit a task's files by hand, then approve (tests re-run and the diff shows your edits).
- The lead has a `scouts` tool: list, add, edit, remove and run a scout now.
- The lead's board tool can filter by status or words, hides done tasks by default and shows a task's latest report.
- The lead can add a note to a task's details without rewriting them (`add_details`).
- A small symbol on the "from:" line (and the task page's "From" row) shows who a task came from.
- Each try's full worker report is saved and shown on the task page; each try records how it ended.
- Board health check: it spots stuck, starving or too-serial tasks and asks the lead to sort them out.
- Stats keep input, output, cache write and cache read tokens apart, and count the lead's and scouts' tokens too.
- Roles can grant extra tools; the researcher gets web search and fetch.
- A narrated 1080p YouTube explainer video (script and build steps are in `docs/video`).
- An eval harness that compares plain Claude Code with symcc on scripted sessions, and research notes on how to show lower cost and better quality.
- /symcc-stats gives a short summary with bar charts; `/symcc-stats full` shows all the numbers.
- Task kinds: change, bug, feature, refactor, docs and investigation, plus your own kinds as files in `.symcc/kinds/`. The lead has a `kinds` tool, and Settings has a Kinds page.
- `checker` setting (off by default): a fresh checker tries to break each change before it merges.
- A worker's secret-looking files (`.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, ...) are left out of its commit and merge, and kept in `.symcc/left-out/<task>/` after a merge. Deleting such a file merges normally. A task that changed only such files waits for you with a question: try again without them, or drop it.
- The lead has a `roles` tool (list, show, add, edit, reset, turn off or on), and Settings has a Roles page.
- The default change prompt asks the worker to add or update a test for its change (unless it only touches docs) and to say which test covers it.
- Press `y` on a task to copy its content to the clipboard.
- A scout's edit page has the same sections as its view page, including "Runs every" and "Summary" boxes.
- New projects start with the example scouts, all paused.
- New example scouts that work in most projects: recent-changes, gaps, docs-check and simplify. The test-gaps example now names concrete test cases to add.
- A merge has a time limit: 10 minutes per test command, plus 5. Time spent waiting in line does not count. When it runs over, symcc gives up that step and does not restart it forever.
- A task stuck in "checking and merging" is noticed and sent back to todo; if it gets stuck a second time in a row, it fails.
- git's real error is shown when symcc's own commit, git add, bring-up-to-date merge or moving main fails.

### Changed
- The worker prompts are built-in only: the Prompts page, the lead's `prompts` tool and `.symcc/prompts/*.md` overrides are gone. Roles are the one place to shape a worker: a role fills the `{{role}}` slot of the fixed prompt, its checklist may use placeholders like `{{files}}` and `{{test_command}}`, and a role's page lists them and shows the prompt it goes in (view only).
- Workers ask you through a small `ask_owner` tool (a question and 2 to 6 choices), and an edit outside a task's files is refused and becomes a file request. symcc no longer reads `QUESTION:`, `OPTIONS:` or `NEED FILES:` lines out of a worker's hand-back, so a report that happens to contain them is merged normally.
- Pausing a scout now only stops its timer: "run now" (`r` on its page, `/symcc-scout <name>`, or the lead's `scouts run`) still runs a paused scout once, and it stays paused. You can try an example scout without resuming it.
- The `target_branch` setting is gone. Each task now merges into the branch you were on when you asked for it.
- No Esc needed in the panel: every text box and pick list has another way out, and Esc hints are removed from the footers.
- Panel look: each page has its own footer, tabs are bold and blue when selected, "workers · scouts" sits above the prompt, and the banner text is dimmer and readable in dark mode.
- Two workers finishing at once now take turns merging.
- Fewer plugin messages to the lead: none for your own actions, and no duplicate reports.
- A worker's question goes straight to you (the task waits) and is said out loud.
- Uncommitted or untracked files on your branch only block a merge when the task changes those same files. A finished task blocked that way waits, with no new worker, and merges on its own once you commit or stash them.
- A task waiting for your files shows them on the board ("commit or stash them, it merges on its own") with a Merge now (r) button instead of an answer box, plays no "needs you" sound, and the hour-long reminder says to commit or stash them.
- The video voice is as loud as a normal YouTube video, and the narration shows approving on the board.
- README is shorter and clearer, and shows the demo first.
- Small tests and tidy-ups (merge, scouts, session start and end, turn complete) and one shared scout-name check.
- Spoken notices start with the project's name, for example "symcc: T-5 done".
- A worker's question is always asked again by the lead in the chat, with the options as choices.
- A task waiting on your files keeps waiting (even if its merge runs over) and tells you the right fix for each kind of file: commit or stash, remove an untracked file, or deal with an ignored one.

### Fixed
- Template files such as `.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `.env.defaults` and `id_rsa.example` no longer count as secrets: tasks can change them, your own edits to them in review are kept, and the first-time git setup commits them (also longer names like `.env.local.example`; the ending must be lower case). Real `.env`, `.env.local`, `*.pem`, `*.key` and `id_rsa` files are still left out. If your own `.gitignore` already ignores a template (such as `.env.sample`), setup leaves it ignored.
- A lead's question no longer stays open in the chat after you answered it on the board: the lead now asks board questions (reviews, answers, worker questions, more time, file requests) as plain text with numbered options, not with a pop-up dialog that symcc cannot close.
- The checker no longer skips changes that only look like docs: agent instructions (`roles/`, `kinds/`, `.claude/`, `.symcc/`, `skills/`, `CLAUDE.md`, `AGENTS.md`, `SKILL.md`), `.mdx` files and config, build or CI files (even under `docs/`) are now checked. Only README / CHANGELOG / LICENSE, other `.md` files and media skip it.
- The `checker` role can't be turned on or off any more (its page has no Turn on button and points to the `checker` setting instead), and it is never offered as a task role.
- A worker whose run ended on an API error or a refusal now fails its task with the reason, instead of being checked and merged as if it had finished.
- Merge: the owner's branch is no longer left half-updated by a clashing untracked file, and git-ignored files are not silently overwritten.
- Safe writes use a unique temp file, so two saves at once cannot break each other.
- Finishing a task no longer overwrites one that was dropped, paused or changed meanwhile.
- Scouts: failed starts and stopped runs are handled, "run now" says why it did not start, scout files from the lead show up at once, the next run counts from the last run, and a report starting with "NOTHING" counts as nothing found.
- The scope check reads file names safely, and "." in a task's files means the whole project.
- Turning symcc off also stops tasks in their tests and merge.
- Approve, drop, reject and retry no longer collide while a task is being merged.
- The health check no longer calls a task "pushed back" the moment it becomes ready.
- A plugin reload no longer puts a task back to todo while its worker is still finishing or merging.
- The lead's scout names are checked everywhere, so `../` cannot reach files outside `.symcc/scouts`.
- The lead's settings tool reads every setting back.
- Approve blocked by your files now tells you to approve again, not "retry".
- Session start no longer waits too long for old workers or fails on a broken board.
- The 2-minute check no longer fails a worker whose report is still on its way.
- Docs and the "Board opened" message no longer mention `target_branch` or Esc.

### Earlier in this release
- Old done and dropped tasks are archived: after `archive_days` days (new setting, 14 by default, 0 = never) they move from `board.json` to `.symcc/archive.json`, so the board file stays small. The archive is written safely first and a broken one is never overwritten. Tasks waiting on an archived done task still start; `/symcc-task T-n` still finds an archived task; the Done row and the totals still count them ("▸ Done  12 (+96 archived)").
- `/symcc-stats`: time and token stats from the data the board already keeps: totals, averages and medians per task and per try, the whole team (lead, workers and scouts), outcomes, roles, origins and the last days with activity; for every task, the last few days (`7d`) or an id range (`T-100..T-130`).
- Removed backward-compatibility code; boards are migrated once. When a session starts, an older `board.json` is saved once in the current shape (a copy of the file as it was is kept beside it): tasks without an origin get "made before origins were kept" by the lead, the old roles `tests`, `backend` and `frontend` become `tester`, `general` and `general`, and tries left with no end time get one (where the next try started, or the task's last change). The board banner's total time now matches `/symcc-stats` (it counted those open tries up to now). The old `voice` setting and the `every` key in scout files are no longer read (use `notify` and `every_minutes`), and the note about an old data folder after a rename is gone.
- New built-in worker role `researcher`: it looks into a question and writes a short note (usually `docs/research/<topic>.md`) instead of changing code. The lead uses it for "find out whether / how ..." tasks.

## 0.3.0 — 2026-11-13

### Traceability
- Every task records who made it, why, and the owner's own words.
- `symcc add` needs a why.
- The board shows a "from:" line for each task.
- Every commit of a task is saved, and labelled with the task, its origin and its why.
- A broken task origin in `board.json` no longer breaks the board.

### Board panel
- The board list is one list: active work first, with Done, Dropped and Backlog folded. A status strip and richer task rows show more at a glance.
- The task page has clearer details and better colors.
- Key options are never hidden on a narrow panel.

### Scouts
- Stronger built-in rules, so scouts report real, checked issues.
- Each scout's last run time and last report are kept across restarts.
- A scout can be paused and resumed. The scouts list shows a state icon for each.
- `every_minutes: 0` means the scout runs only on demand.
- New example scout: secrets that could end up in git.

### Control
- `/symcc-off` and `/symcc-on` turn symcc off and on. Claude goes back to normal while it is off.
- A worker is stopped when another task's change to symcc itself is merged.
- Plugin messages to the lead are clearer: "Board update", with an instruction that is not in the owner's voice.

### Workers and roles
- The built-in roles are now general, docs, refactor, security and tester (backend and frontend are gone; tests is now tester). Old tasks keep their stored role; when started, tests runs as tester and backend/frontend as general, with a history line.

### Code
- The code is split into modules (`hooks/core/`, `hooks/plugin/`, `hooks/plugin/ui/`). No behaviour change.

### Docs
- Wording: you are the owner (you direct), Claude is the lead.
- Guide: a code map and a note on finished workers in Claude Code's agent list.
- README and guide: new text on traceability and observability.
- README: a presentation video, with a GIF preview.
- Slide deck in `docs/slides/symcc.pptx`.
- README: an "Agent Organization" vision line under the tagline.

## 0.2.0

### Board and tasks
- The board panel opens when the session starts and survives `/clear`.
- Clearer board title, a small banner, and a project folder name in the title.
- Today's tasks show in full; older ones fold by day.
- Tasks / Scouts tabs in the board header.
- New "backlog" status for ideas that never start a worker, shown folded at the top of the list.
- Time and cost for each task.
- Each running task records its session.
- The status line is shorter and shows counts, running and failed task IDs, and the mode.
- A spoken message when a task is done.

### Workers and roles
- Worker roles: role files the lead picks per task, shown on the board.
- Never two workers on one task.
- Workers are named after their task ID, such as "symcc T-33".
- A worker can ask for more files instead of failing on scope.
- A worker fixes merge conflicts instead of failing.
- Failed tests are retried with the test output.
- Workers register first at start, and wait if not ready.
- The lead sets task order and chains tasks that change the same files.

### Review and merging
- One mode setting: off, review or auto.
- Approve or reject finished work, in the board panel or with slash commands.
- Follows the owner's branch instead of always using main.
- Only one session drives the board (leader lock).

### Scouts
- Scouts view in the board panel, and scouts can be edited there.
- Scouts do what their file says, with internet and shell access.

### Settings and commands
- `/symcc-settings` shows and changes all settings inside Claude Code.
- All slash commands start with `symcc`.
- A short command to switch the approval mode.

### Cleanup
- A task's branch and worktree are deleted after it is merged, and old ones are cleaned up.
- Leftover `.tmp` files in `.symcc` are removed.
- Repeated code was tidied in several rounds.
- The plugin name lives in one place.
- Task IDs can be given as a bare number ("3" means T-3).

### Docs
- README rewritten: what symcc lets you do, features table, install steps, a worked example and an animated picture of the team.
- New logo, drawn as a shape.
- A "Working on symcc" section for developers.

### Also
- Work in a folder without git: symcc offers to set up a repo.

## 0.1.0

First version.
