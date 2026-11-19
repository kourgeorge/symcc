# symcc guide

The full details. For the short version, see the [README](../README.md).

- [The parts and their names](#the-parts-and-their-names)
- [A task's life](#a-tasks-life)
- [What happens when a worker finishes](#what-happens-when-a-worker-finishes)
- [Approval before merge](#approval-before-merge)
- [Investigation tasks](#investigation-tasks)
- [Live status: seeing the board](#live-status-seeing-the-board)
- [Tracing a task back](#tracing-a-task-back)
- [Scouts](#scouts)
- [Task kinds](#task-kinds)
- [Worker roles](#worker-roles)
- [Which branch work goes into](#which-branch-work-goes-into)
- [Keeping work moving on its own](#keeping-work-moving-on-its-own)
- [Stats: time and tokens](#stats-time-and-tokens)
- [Turning symcc off](#turning-symcc-off)
- [Where everything lives](#where-everything-lives)
- [Good to know](#good-to-know)
- [Renaming the plugin](#renaming-the-plugin)
- [For developers](#for-developers-where-the-code-is)
- [Working on symcc](#working-on-symcc)
- [Using symcc in OpenCode](#using-symcc-in-opencode)

---

## The parts and their names

The same names are used in the [README](../README.md) and in this guide.

| Name | Known term | What it does |
|---|---|---|
| **You** (the owner) | The human in the loop | Say what you want, answer questions, approve or reject |
| **Lead** | Orchestrator agent (your normal Claude Code chat) | Plans, breaks work into tasks, supervises the workers, decides what to do when something fails, reports to you |
| **Board** | Task board (a plain file at `.symcc/board.json`) | One board (todo / doing / review / done) for requested work (from you) and discovered work (from scouts) |
| **Workers** | Parallel agents (one per task) | Each builds one task in an isolated git worktree on its own branch, then stops |
| **Scouts** (optional) | Scheduled background agents for discovery | On a timer, look for bugs, missing tests, outdated dependencies or security notices, and report to the lead; symcc refuses their file edits and git writes in the project (see [scouts](#scouts)) |

And the ideas that tie them together:

| Term | What it means here |
|---|---|
| **Discovery → triage → implementation → review → merge** | A scout or you find work, the lead puts it on the board, a worker builds it, you review it, symcc merges it |
| **Scope check** | Each task lists the files it may change (its scope); anything else is not merged; a worker's edit outside it is refused and becomes a file request to you |
| **Automatic retries** | Failing tests send the task back to a new worker with the failing test output, up to `auto_retries` times (2 by default) |
| **Test gate** | Your test commands must pass before anything is merged |
| **Approval before merge** | Human-in-the-loop review: modes `auto`, `review` or `off`; see the diff, approve, or reject with a reason; one task can be marked "needs review" |
| **Merge into the target branch** | Commit, scope check, update on the latest target branch, re-run tests, then merge; your branch only moves this way |
| **Live status** | The board panel and the status line |

symcc is proactive while your Claude Code session is open. Work stops when you close it and
picks up again next time.

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
   │         ├──▶ worker's edit outside its list refused ──▶ waiting (file request)
   │         ├──▶ worker asks (ask_owner tool) ──▶ waiting, "symcc: T-5 needs you"
   │         ├──▶ worker's run ends on an error or a refusal ──▶ failed (with the reason)
   │         └──▶ worker ended its turn before its work finished (its own
   │              background command still running) ──▶ failed
   │
   ├── review   (only in review mode) checks passed; waits for YOUR approve
   │            (merge) or reject with a reason (back to todo, fresh worker)
   ├── waiting  the lead or a worker asked YOU something; your answer sends it
   │            back to work
   ├── paused   stopped on purpose; "resume" sends it back
   ├── dropped  cancelled; stays on the list and never runs on its own;
   │            retry (r on its page, or ask the lead) brings it back to todo
   └── backlog  a parked idea or unclear work; never starts until you move it
                to todo ("move T-5 to todo"); "stash" sends a todo, paused or
                failed task back here
```

| Status | Meaning |
|---|---|
| `todo` | Ready to be picked up (once the tasks it waits for are done) |
| `doing` | A worker is on it right now |
| `waiting` | It needs an answer from you (shown under NEEDS YOU) |
| `review` | Ready for review: the worker is done and the checks passed, but nothing is merged until you approve it |
| `paused` | Stopped on purpose, until resumed |
| `failed` | It could not be finished; the lead decides what next. Its page starts with a "Why it failed" block: one plain sentence for the reason (tests failed, the checker found problems, files outside the task, no change, no result, out of time, an API error or refusal, the worker ended its turn before its work finished, could not start, a merge conflict), what the worker's report asks for (a `NEED FILES:` line or a question), and what to do next (Retry, ask the lead in the chat to change the task, or Drop). Its key line lists `r retry` and `x drop`. The board row and the lead's board show the same sentence |
| `done` | Merged into your branch. This is final |
| `dropped` | Cancelled. It never runs on its own; retry brings it back to todo on purpose |
| `backlog` | A parked idea or unclear work. It never starts until you move it to todo. In the board panel it sits in a folded "▸ Backlog  N" row below the active tasks |

**Task dependencies.** The lead sets them. A task's `after` lists the tasks that must be
finished first: it starts only when every one of them is `done` (merged). Any other status
keeps it waiting, also `dropped` or `failed`; then the lead changes or clears its `after`.
Among the `todo` tasks that are free to start, the lowest `order` goes first (on a tie, the
lower task number).

**Work merged by hand.** Sometimes a task's branch gets merged outside the board, for
example by you or by the lead on your word after its only failure was the merge tests
timing out. Don't drop such a task (it would count as dropped) and don't retry it (a new
worker would redo finished work). Mark it as merged instead: press `h` (Already merged) on
its page (offered for a failed, waiting, paused or dropped task), or ask the lead, whose
`merged` tool also takes a task that is to do, running (its worker is stopped first) or in
review. symcc checks it with git first: every commit on the task's branch must already be
in the branch it merges into (merged, fast-forwarded, or rebased as the same changes). If
not, it refuses with the reason ("T-5's branch has 2 commits that aren't in main yet").
When the check passes, the task becomes `done` with the history line "merged outside the
board (abc12345); marked done by the owner" (or "by the lead"), its commits are recorded,
its folder and branch are cleaned up like after a normal merge, and the tasks waiting on it
can start. Nothing is merged and no test runs: the work is already in. Stats count it under
"merged outside the board". The lead uses it only on your word or a rule you set.

---

### When a worker needs you

A worker that can't go on without a decision from you calls its `ask_owner` tool
(a tool only workers have, since Claude Code gives subagents no way to ask you
directly) with the question and, if it likes, 2 to 6 choices, and then stops. (A worker
that tries to edit a file outside its list is refused, and that becomes a file request;
see the scope check below.) symcc never reads a question or a file request out of what
a worker writes in its hand-back: that text is only its report. The task does not fail: it goes straight to `waiting` with the
question, shows under NEEDS YOU on the board, and with `notify` on you hear "symcc: T-5 needs you" (or a chime)
(once per question, only in the session that drives the board). The lead is told too. It
answers it itself only when you already clearly said the answer, and then tells you what it
answered. Otherwise it asks you in the chat, short and plain, with the worker's options (if
any) as numbered choices in plain text (not a pop-up dialog, which would stay open if you answer on the board). You can answer in the chat or on the board, whichever comes
first (if you answer on the board, the lead doesn't ask again): the answer goes into the
task and sends it back to work, and a new try continues with it. What the worker already
changed is kept.

**Answering a waiting task on the board.** Open the task (Enter on it under NEEDS YOU):

- **A file request** (the worker's edits outside its list were refused) shows three buttons, also on the number keys:
  **1 Allow** adds the files to the task and sends it back to work in one step (its history
  says "the owner allowed files: + a, + b"; the lead hears of it later, it is not woken up).
  **2 Don't allow** keeps the task waiting with the note "files not allowed" and tells the
  lead at once, so it drops the task or narrows the plan. **3 Answer…** opens a text box.
- **A question with choices.** A worker may give 2 to 6 choices with its question.
  Each choice is a button with its number key, plus **Answer…**
  for your own words. Picking one is your answer (history: the owner answered: “b”) and
  sends the task back to work.
- **Any other question** has a text box: type the answer and press Enter.

### When the lead asks you something

Questions from the lead that are not about one task ("raise the version?", "add a scout?",
a settings choice) used to live only in the chat, where they scroll away. Now the lead puts
each one on the board with its `question` tool, with 2 to 6 short choices, and asks it
briefly in the chat too. Each gets an id like `Q-3` and is kept in `board.json` (under
`questions`), not in the chat.

- The board list shows **Questions for you (2)** at the top, above the tasks. Enter on one
  opens its page: the question, one button per choice (also on the number keys) and
  **Answer…** for your own words, the same as a waiting task.
- The band above the prompt and the status line say **2 questions for you** while any is
  open, and with `notify` on you hear "needs you" once per question.
- Answer on the board and the question closes and leaves the list (it stays in the file as
  history). The lead gets a board update right away (like a finished task), with a block like
  "The owner answered your question Q-3 (…): Yes. … Act on it.". Answer in the chat instead and the lead closes it with your words. The
  lead can also drop a question that no longer matters.

---

## What happens when a worker finishes

This is where symcc keeps your branch safe. First, how the worker's run ended decides what
happens, never the words in its hand-back:

- it asked you (`ask_owner`) → the task waits with its question;
- an edit outside its files was refused → the task waits for you to allow those files;
- it was stopped → the task fails ("the worker was stopped");
- its run ended on an API error (retries used up, the context limit) or the model refused →
  the task fails with that reason, and nothing is checked or merged (its work stays in its
  folder and branch, so a retry continues from there);
- one of its own background commands (for example a test run it sent to the background) was
  still running when its turn ended → the task fails ("the worker ended its turn before its
  work finished"), and nothing is checked or merged. Another agent's command still running
  doesn't count; when symcc can't tell whose a command is, the worker only gets a warning if
  its hand-back says work is still going;
- otherwise it is finished, and its work goes through these steps (an investigation goes to
  review with its answer instead):


1. **Commit.** symcc commits what the worker changed in its private copy. (Workers are
   not allowed to commit, push or merge themselves.)
   **Secret-looking files.** Files whose names look like secrets (`.env`, `.env.*`, `*.pem`,
   `*.key`, `id_rsa` and other SSH private keys) are left out of the commit and the merge, even if
   they are in the task's file list. After a merge they are kept in `.symcc/left-out/<task>/`.
   Templates are not secrets: a name ending in `.example`, `.sample`, `.template`, `.dist` or
   `.defaults` (`.env.example`, `.env.local.example`, `config/.env.defaults`, `id_rsa.example`) is
   committed and merged like any file. The ending must be lower case (`.env.EXAMPLE` is still a
   secret), the same rule git uses for the setup `.gitignore` lines on Linux. Test keys are not treated differently: a `*.pem` or `*.key` under
   `tests/fixtures/` is still left out, so a project that keeps test keys in git on purpose has to
   commit them itself.
   Deleting such a file merges normally. If a task changed only such files, nothing is merged and
   the task waits for you with a question: try again without them, or drop it.
2. **Scope check.** Every task lists the files it may change (its scope). If the worker changed
   anything else, nothing is merged (the note says which files; add them to `files` with
   `change`, or split the task). When a worker tries to edit (Edit, Write or
   NotebookEdit) a file outside its list, symcc refuses that edit, records the path, and tells
   the worker to stop and hand back. Nothing is merged, even if it already made other edits
   (they are kept in its folder for the next try), and the task waits for you to allow those
   files (press Allow on its page, or tell the lead, who uses `change`) or drop it. Files
   written another way (for example by a shell command) are still caught here, at the merge.
   An investigation has no file list, so its edits in its own folder are never refused (they are not kept anyway).
   Each worker's folder has a `.scratch/` folder for throwaway scripts and notes. Workers and checkers may
   write there freely: it is never refused, never a file request, and never committed or scope checked
   (symcc adds a `/.scratch/` line to git's local ignore list, not to your `.gitignore`). Worker folders
   share that list with your own project folder: it is your repository's `.git/info/exclude`, so a
   `.scratch/` folder in your own project folder is ignored by git as well. To undo it, remove the
   `/.scratch/` line from `.git/info/exclude`.
   symcc empties it when a try ends and when the folder is used again. If your project keeps files under
   `.scratch/` in git, all this is off: those are your files, checked and committed as usual.
   An edit (by any worker) that lands in your own copy of the project, outside the worker's own
   folder (for example your README.md, `.symcc/board.json` or another worker's folder), is always
   refused, without a file request: the worker is told to edit the file in its own folder instead.
   The same goes for a worker's shell command (Bash) that names such a path, either in full
   (`echo x > /your/project/README.md`, `cd /your/project && git commit ...`) or by climbing out of
   its folder (`../../README.md`): it is refused, even if it only reads, because a shell line that
   only reads can't be told apart reliably from one that writes, and the worker has its own copy of
   every file. This is a best effort: a path put together while the command runs (for example from a
   variable) is not seen. Paths outside the project, such as `/tmp`, are not checked, and the lead is never refused.
3. **Update on the latest branch.** If your branch has moved on since the worker started (for example,
   another task was merged), symcc brings those changes into the task's copy first.
   If they clash, a new worker is started to sort out the clash (up to 2 times).
4. **Test gate.** symcc runs your test commands on the combined code. If they fail,
   automatic retries kick in: the task goes back to `todo` and the next worker is shown the end of the failing output and
   told to fix it (2 times by itself; then it is marked `failed` for the lead).
   **Checker (optional).** With the `checker` setting on, a fresh checker reads the task and
   its changes and tries to break them before anything merges (see [The checker](#the-checker)).
5. **Approval (optional).** In review mode (see below), the task stops here as
   `review` ("ready for review") and nothing is merged until you say so.
6. **Merge.** Only now does your branch move forward. If you have that branch checked
   out, your files are updated too, but your own work is never overwritten: uncommitted
   changes (staged or not) in files the task doesn't change are simply kept as they are.
   Only your uncommitted changes, untracked or git-ignored files in files the task changes
   hold the merge back. Then the task waits (`waiting`, with a note like "waiting for your
   files on main: README.md; commit or stash them") and the lead is told once. No new
   worker is needed: once you commit, stash or undo those files, the regular check (every
   two minutes) merges it by itself (it is brought up to date, and tested again only if
   the branch moved meanwhile). "retry T-3" (or approve, for a task in review) does that
   merge at once. If the branch moved and the task now clashes or fails its tests, it gets
   a new try as usual.
   **One task's tests at a time.** Tests run for one task at a time across all tasks,
   sessions and target branches, oldest first. A task that has to wait shows the note
   "waiting for another task's tests (T-x)", where T-x is the task running its tests now.
   So when several tasks finish together, merges can take longer. The turn is kept with
   the file `.symcc/tests.lock`; a stale lock (left by a run that died) is taken over, so
   you never need to delete it by hand.
   **Tests that run out of time.** A test command stopped by its 10-minute limit is not a
   failed test: nothing failed, so no new worker try starts and no automatic retry is used.
   The task keeps its work and waits ("tests ran out of time (10 min); running them again
   once, no new try"); at a later regular check, when no other task's tests run (and
   preferably when fewer workers are busy), symcc runs only the test commands again, once.
   If they pass, the task goes on as usual (review, the checker, or the merge); if a test
   really fails, it gets a new try as usual. If they run out of time a second time, the
   task waits for you ("the tests ran out of time twice; nothing failed") with the choices
   **Run the tests again** (only the tests run again) and **Stop it** (the task is paused,
   its work kept). "retry T-3" on such a task also runs only its tests again.
   An approve whose tests run out of time stays in review (approve it again).
   **Time limit.** Each test command may run up to 10 minutes. The whole checking and
   merging gets 10 minutes for each test command (at least one), plus 5 minutes for git
   and the board: 15 minutes with one test command, 35 with three. Only the task's own
   work counts: the clock stops while it waits in line behind other merges into the same
   branch (each of those has its own limit, so the line keeps moving) and while it waits for
   another task's tests (see below), and starts again
   from zero when its turn begins, and again each time it is brought up to date and
   tested again because the branch moved meanwhile. A step still running past the limit
   is taken as stuck and given up: a finished worker's task goes back to `todo` for a
   fresh try (its folder and branch are kept); if the try before was given up the same
   way, the task is marked `failed` instead ("ran over … twice in a row"), so it never
   loops, and the lead is told. An approve that runs over stays in review (approve it
   again). A merge waiting for your files that runs over keeps waiting: the regular check
   tries it again on its own once your files are out of the way (or "retry T-3" at once);
   if that merge runs over too, twice in a row, the task is marked `failed` instead and is
   not started again on its own, and the lead is told once. If a given-up step still ends
   later and its work did reach the branch after all, the task is marked done with that
   commit (when nothing else happened to it meanwhile), or the lead is told it landed.
7. **Tell.** The lead gets one line: merged, or why not (see "What reaches the lead" below). On a Mac you also hear
   "symcc: T-3 done" (and "symcc: T-5 needs you" when a task waits for your answer), starting with
   the project's name so you know which project spoke.

> **Set a test command.** With no test command, step 4 is skipped and any change
> that passes the scope check is merged. Say "set the test command to …" to the lead.

### Tests run once per try

The full test commands run once per try, by symcc, in step 4 (and not even then when the
same code, with the same commands, already passed: see `passed-trees.json` in the board
folder). The worker is told the commands, but while it works it runs only the tests for the
files it changed (one test file, say) and a cheap type check if the project has one; it does
not run the full commands at the end, as symcc does that and sends it the output if any
fail. The checker is told that symcc already ran these exact commands on this commit and
tree and that they passed, and gets the list of changed files: it runs only the tests for
those files and its own new probe cases, and a full command only when a probe needs it (and
says why). When symcc's run did not happen (no test commands set, or the code is not in the
record), the checker runs the tests itself. A worker that skips the full run may now and
then hand back work that fails symcc's run; that costs one new try, with the failing output.

A narrow test command is one that runs only some test files. On symcc itself that is
`sh scripts/test-files.sh tests/checker.test.ts tests/merge.test.ts`: it runs just those files
through `claude plugin test` (from a temporary copy of the plugin) and exits non-zero when one
fails. The repo's `CLAUDE.md` tells workers and checkers about it. In your own project, say how
to run one test file in its `CLAUDE.md` (or `AGENTS.md`) the same way.

### A code change with no test

Before a change task is merged, symcc looks at the files its
commit changed. If it edits code but no test file (a test file is in a `test/`, `tests/`, `__tests__/`, `spec/`, `e2e/` or `cypress/` folder or a folder ending in `.Test` / `.Tests`, or has `test` or `spec` as a name part split by `.`, `_` or `-` (`a.test.ts`, `a_test.py`, `test_a.py`, `a-test.ts`), a `.cy.` or `e2e` name part (`a.cy.ts`, `login.e2e.ts`), or a CamelCase name ending in `Test` or `Tests` (`FooTest.java`, `FooTests.cs`, `LoginUITests.swift`); a name that only contains those letters (`latest.ts`, `run-tests.sh`, all-capital `LATEST.ts`) is not a test), the `tests_with_changes` setting decides:
`ask` (the default) merges it and tells the lead "T-3 changed code but no test", so the lead
can add a test task or ask you; `review` makes the task wait for your review instead of
merging (like `needs_review`), with that note; `off` does nothing. A change to docs only is never flagged
(docs are `.md`/`.mdx` files, README / CHANGELOG / LICENSE-style names (no extension or a text one), images, video, audio, fonts and subtitles anywhere, and non-code files under `docs/`; code under `docs/` (`docs/build.ts`) or with a docs-style name (`Notice.tsx`) is code). Set it with `/symcc-settings tests_with_changes
review`, in the Settings view, or by telling the lead. The lead also writes in every change
task's details how it will be tested ("Done when: tests show …").

### What reaches the lead

The lead (the main chat) gets a "[symcc] Board update" message only when something needs it:
a worker finished, failed or is ready for review, a task waits for you (a question or
a file request), you answered one of its questions on the board, a scout found something, a conflict or failing tests need a decision, or the
board file is broken. The worker's or scout's own report already reaches the chat as that
agent's message, so the board update gives just the outcome ("T-3 merged into main (abc12345);
tests passed") and doesn't repeat it. A scout that answers `NOTHING` sends nothing.

What you do yourself on the board (approve, reject, drop, move to todo, stash, mode and
settings changes, answering a task) and merges you approved don't wake the lead. They are
kept as short lines ("The owner approved T-5: …") and put under "Meanwhile the owner:" at the
top of the next board update (at most 10, then "+N more"). They are still in each task's history.

---

## Approval before merge

The board has one mode, set with `/symcc-mode`, `/symcc-settings mode …` or by telling the lead (the setting `mode`):

- **`off`**: every running worker and scout stops at once and nothing new starts. Tasks
  already in review can still be approved or rejected.
- **`review`**: work runs; every finished task that passes waits as `review` for you.
  The lead also asks you before it adds any task (yours, a scout's finding, a worker's
  report or its own idea): it says what the task would be in a line or two and adds it
  only after your yes.
- **`auto`** (the default): work runs; a task that passes steps 1–4 is merged at once.

Going from `off` to `review` or `auto` starts work again. In `auto` you can still mark one
task: "T-5 needs review" (`needs_review` on `symcc add` / `symcc change`); that task waits.

The lead tells you "T-5 is ready for review". The task's branch (`symcc/T-5`) and copy
(`.symcc/worktrees/T-5`) are kept so you can look at the change. Then:

- **Approve** ("approve T-5", tool `symcc approve`): symcc runs the same merge steps as
  always: brings the task up to date with your branch, checks the files, runs the tests
  again if it had to bring in new changes, and retries clashes. Then the task is `done`.
- **Reject** with a reason ("reject T-5: the button should be blue", tool `symcc reject`):
  nothing is merged; the task goes back to `todo` with your reason in its history, and a
  fresh worker redoes it with that reason in front of it.

So there are three ways to change a task in review before it is merged:

1. **Reject it with a reason**: a fresh worker redoes it (see above).
2. **Ask the lead to change the task** ("T-5: also update the README"): the lead changes
   what the task asks for, and it goes back to work. For a small addition the lead uses
   `change` with `add_details`: the note is added at the end of the details as
   `Note (lead, <date>): ...`, the old text stays, and the task's history gets a line
   `the lead added a note: "..."`. `details` rewrites the whole text; giving both at once
   is refused.
3. **Edit the files yourself** in its folder, `.symcc/worktrees/T-5`, then approve. Your
   edits are committed as part of the task (same commit message) and its history gets a
   line like `owner edited files before approving: a.ts, b.md`. The tests always run
   again when you edited something. If they fail, nothing is merged: the task stays in
   review with the test output, so you can fix the files and approve again.

The diff (`d` on the task page, `/symcc-diff T-5`) shows the folder as it is now, your
edits included, against your branch; it says `(includes your edits)` when there are some.

Both only work on a task in `review`. Switching back to `auto` does not merge tasks
already waiting; approve or reject each of them.

You can also do it yourself:

- **In the board panel**, tasks ready for review are listed near the top. Open one to see
  the files it changed with `+`/`-` line counts, and its folder (edit files there, then
  approve). Press `d` (Show changes) for the whole
  diff, or pick a file for just that file's diff, with added lines in green and removed
  lines in red. `a` approves, `x` rejects (it asks for a short reason first), `b` goes back.
  A very long diff is cut, with a note like `… 340 more lines (see /symcc-diff T-5)`.
- The banner shows the mode: `⏵ auto` (finished tasks that pass merge on their own),
  `⏸ review merge` (finished tasks wait for your approve or reject) or `⏹ off` (no work runs).
  Press `m` to switch between `review merge` and `auto` (`m` never turns the board off).
- In any open task, `n` turns that task's own "needs review" on or off.
- **Slash commands:** `/symcc-approve T-5`, `/symcc-reject T-5 <reason>`,
  `/symcc-diff T-5` (the changed files with `+`/`-` counts) or `/symcc-diff T-5 <file>`
  (that file's full diff), and `/symcc-mode [off|review|auto]` (with no word it switches
  between `review` and `auto`; from `off` it goes to `review`).
- The status line (the `symcc:` line by the prompt) starts with the mode, `⏹ off`,
  `⏸ review merge` or `⏵ auto`, then the busy workers, the task counts (tasks to review by
  ID) and the scouts, e.g.
  `⏵ auto · 1/3 workers · T-26 doing · 1 to review (T-5) · 5 scouts (next: gaps-bot in 1h 00m)`.
  Workers are left out while none run (`all done` or the counts already say so). It is kept
  to about 80 columns: when it is too long, the `(next: …)` part goes first, then the scouts.
  The "next" time is redrawn every minute. With an empty board and no scouts it shows nothing
  in `auto`, so a fresh project stays quiet.
- symcc's own text never has a `⚠`: what needs you is said in words (`1 failed (T-7)`,
  `1 waiting for you`, `⏹ off`, `symcc off · /symcc-on`). A `⚠` in front of `symcc:` is drawn
  by Claude Code itself for a plugin's status line, and plugins can't change it.

### Plan mode

Claude Code's own plan mode (Shift+Tab) is for planning only, so symcc starts nothing while
the main chat is in it:

- Every task the lead adds goes to the backlog, and the answer says so:
  `plan mode: T-7 Search added to the backlog; nothing starts`.
- No new worker or scout starts (not the regular check, not a scout's timer, not "run now").
  Workers already running keep going: plan mode doesn't reach them, and stopping them would
  lose work. The band above the prompt says so, e.g.
  `plan mode: nothing starts (1 worker keeps going)`.
- The band and the status line show `plan mode: nothing starts` (and no next scout).

When plan mode ends, the lead is told once which tasks went to the backlog during it, and asks
you which ones to move to todo. symcc never moves them by itself.

Claude Code has no call for the mode and no event when it changes, so symcc reads it from what
comes with some events of the main chat: the permission mode on the prompt you send and on the
end of each turn, the mode passed to a new agent, and the "plan mode" reminders Claude Code
adds to each request. So a switch is noticed at the next prompt, request or end of turn. Until
symcc has seen the mode at all, it works as before. Each session tracks its own mode; only the
session that drives the board starts work. (Background: `docs/research/plan-mode.md`.)

---

## Investigation tasks

Not every task should change the project. When you want an answer, or input for a decision
you will make ("is it possible to…", "should we…", "how does X work?", "why is Y slow?"),
the lead adds an **investigation** instead of a **change**: these are two of the
[task kinds](#task-kinds) (the task's `kind`). When the
answer should stay in the project as a lasting document that later tasks or people will
read, the lead adds a change instead. Researcher tasks are investigations unless the lead
says `kind: change`.

The life of an investigation:

1. It starts like any task: a worker in its own folder and branch, with the same time limit.
2. The worker finds the answer and hands it back in full. Nothing is committed, tested or
   merged, and any file it wrote is not kept. If its time runs out, it hands back what it
   has so far (the note says "answered (time ran out)"). A worker that needs you to decide
   something still asks with its `ask_owner` tool, and the task waits for you as usual.
3. The task goes to `review` with the note "answered; waiting for you to read it", **even in
   mode `auto`**: an answer is for you, so it never ends on its own. The lead tells you the
   answer in the chat, short and plain, and offers the three choices.
4. You pick one of three buttons (on the task page, or tell the lead):
   - **Done** (`a`, "T-5 is done", tool `symcc approve`): the task ends `done` with the note
     "answered". Nothing is merged; its folder is removed, and its branch too, unless it
     has commits from earlier tries: then the branch is kept (the reply says so).
   - **Keep as a note** (`k`, tool `symcc approve` with `keep_note: true`): Done, plus a
     new small docs task that writes the answer to `docs/research/<topic>.md`. That task is
     a normal change: tested and merged as usual.
   - **Ask more** (`x`, tool `symcc reject` with your follow-up question): the task goes
     back to `todo`, and a fresh try gets your question and the earlier answer in its
     details.

**On the board** an answered investigation shows `◆ answer` in the status column instead
of `review`, and every investigation has `[investigation]` after its title. Its page says
`Kind: investigation — nothing is merged` and shows the full answer in an **Answer**
section (from the latest worker report, or the short answer saved on the task), with Done,
Keep as a note and Ask more in place of Approve and Reject.

**In the stats** (`/symcc-stats`, short and full) an investigation's outcome is
**answered**. Investigations are counted on their own, in an "Investigations" part: how
many, how many are answered (read by you or waiting to be read), their time, tokens and
tries. They are left out of the "done", "right first try" and "per merged" figures, which
are about changes; under "How tasks ended" a read investigation shows as
`answered (investigation)`.

---

## Live status: seeing the board

- **The panel** opens by itself when a session starts (on a wide enough terminal; turn it
  off with the `open_on_start` setting). It shows a small banner (folder, branch, test
  command, limits, counts) and the task list. The workers and scouts are not in the banner;
  they are in the status line and the band above the prompt. When nothing starts, the
  banner's first line says so in the warning color: `⏹ off: nothing starts` (board mode off)
  or `symcc off · /symcc-on` (symcc turned off).
  The clef drawn at the left of the banner moves now and then, about 4 frames a second, each
  move played once before it rests: it sways one column right and left about every 5 minutes
  while the panel is open and nothing else plays; it dissolves into a check mark when a task
  merges, a robot when a worker starts, or a note when a scout reports a finding, holds it
  about a second and dissolves back; and when the board becomes all done (nothing to do,
  doing, in review or waiting) little notes ♪ ♫ float up beside it. Only one move plays at a
  time (one that comes meanwhile is dropped). Nothing moves on a panel too narrow to show the
  logo or while the board is off.
- **The band above the prompt** shows the mode, the busy workers, the counts and the scouts,
  e.g. `⏵ auto · 1/3 workers · 1 doing · 1 to do · 2 scouts (next: gaps-bot in 38m)`, and under
  it the tasks that need you or are running. When narrow, the `(next: …)` part goes first,
  then the scouts.
- **`/symcc`** opens the interactive board: ↑↓ to move, Enter to open a task. On the
  lists (Tasks, Scouts, Settings, Roles) ↑↓ move from row to row, and the panel scrolls to
  keep the row in view; past the first or last row they scroll the panel (to see the banner
  or the key line). ↑↓ never land on the tabs, the mode or search buttons or Back: Tab and
  Shift+Tab reach those. On a task's or a scout's page ↑↓ scroll. An
  open task shows everything about it, with buttons to pause, resume, retry,
  drop, watch its worker live, and buttons or a box to answer it when it waits for you.
  `/symcc-task T-3` opens one task directly; `/symcc-tasks` and `/symcc-scouts` open a view.
- **Nothing in the panel needs Esc.** Esc in a text box or a pick list usually just gives
  the keys to the Claude Code prompt without the panel hearing of it (see
  `docs/research/esc-in-panels.md`), so every place has its own way out:
  - a text box (the search, "Your answer", the reject reason, a new scout's name, a
    setting's value): **Enter on the empty box** cancels it (the search: clears it). The
    reject reason, "Your answer" (opened with Answer…), the new scout's name and a
    setting's box also have a **Cancel** button under them (↓ to it, or its letter);
  - a pick list (a task's role, a setting's choices): its **Cancel** button, `c` for the
    role list, `x` in Settings;
  - a scout's edit page: its **Cancel** button (`x`);
  - a page: its **Back** button, `b`: a task page and the Scouts list or Settings go back
    to the board list, a task's changes to the task, a scout's page to the Scouts list.
  Each box and footer says the way out, e.g. `Enter sends · Enter on empty cancels`.
  When Esc does reach the panel it still goes one step back the same way, and on the
  board list with no search it closes the panel; after a step back the panel asks for the
  keys again (if you had text in the prompt, Claude Code keeps them there; ctrl+x tab or a
  click goes back to the panel).
- **Search the tasks**: on the Tasks view press `f` (or the `[f] search` button in the footer)
  and type. The list shrinks as you type to the tasks that match every word you typed, in
  any case, looking at the task's id (`T-12`, or just `12`), title, details, role, status,
  where it came from (owner, scout name, the task it came from) and your request. It looks in
  every group, Backlog, Done and Dropped too: groups with a match open, the others are
  hidden. Archived tasks are not searched. Enter keeps the filter and gives you the list
  back (↑↓ and Enter work as usual); a line says what is on, e.g. `search: notify · 3 of 144
  tasks` (or `no tasks match`), with `[f] change search` and `[x] clear search` under it:
  `x` clears the search and shows everything. Enter on an empty search box clears it too.
  (Claude Code only lets panel keys be a letter or a digit, so
  the key is `f`, not `/`.)
- The panel has three views, Tasks, Scouts and Settings, shown as tabs under the banner:
  `[t]: Tasks (12) │ [s]: Scouts (3) │ [c]: Settings`, the open one bold, blue and
  underlined. Press `t`, `s` or `c` (or click a tab) to switch. The Scouts view lists each scout on one
  row: an icon (`◉` running, `◎` waiting for its next run, `○` paused), its name, how often
  it runs, when it runs next, what its last run found (`last: found 2`, `last: nothing` or
  `never ran`) and its model. On a narrow panel the model column goes first, then the
  `last:` one; the name is never cut. Enter opens a scout: its state, its file, its
  instructions, its last report, and buttons to run it now, edit it, or pause or resume it.
  Back (`b`) goes back to the Scouts list, and the Scouts list's Back to the Tasks list.
- The Settings view (`c`, or `/symcc-settings`) has one row per setting: its name, value,
  default, allowed range and what it means. The rows are grouped under short headings:
  - **Work**: `mode`, `max_parallel`, `max_minutes`, `auto_retries`, `enabled`
  - **Checks before merging**: `test_commands`, `tests_with_changes`, `checker`
  - **Workers**: the **Roles** and **Kinds** rows
  - **Scouts**: `scout_findings`
  - **Board and alerts**: `notify`, `open_on_start`, `archive_days`

  Each heading is a group you open and close with Enter (→/← do not, since the panel's
  buttons only get Enter and letter or digit keys). When the page opens, all groups
  are closed and the first heading has the focus; a closed group shows its values in short
  on its heading line, e.g. `▸ Work · auto · 3 at once · 45 min · 2 retries`, and an open
  one shows `▾ Work` with its rows under it. ↑↓ go over the headings and the rows of open
  groups only. The panel remembers which groups are open until the session ends. The lead's
  `settings` tool and `/symcc-settings` text always list every setting under the same
  headings. Enter on a row changes it: `open_on_start`
  `checker` and `enabled` flip on/off; `mode`, `notify`, `scout_findings` and `tests_with_changes` open a pick list (off / review
  / auto; only the notify choices this computer can play; off / ask / review); numbers and `test_commands` open an edit box (the typed line is one
  command, run as one shell line, so `cd web && npm test` works as in a shell; several commands go in a list,
  `["npm test", "npm run lint"]`, up to 5; `none` clears them). Enter on an empty box or Cancel (`x`) cancels; Back (`b`) goes to the Tasks list. Saving uses the same checks and limits as
  telling the lead, and a toast says what changed, e.g. `max_parallel set to 5`. A value
  over its limit is cut to it and the toast says so.
- Under **Workers**, the **Roles** row says how many worker roles there are (e.g.
  `6 roles · 1 off`). Enter (or a click) on it opens the **Roles** page: one row per worker
  role: its name, where it comes from (`built-in`, `replaced`, `added`, with `, off` when it
  is turned off) and its description. Back (`b`) on the Roles page goes back to Settings, and
  switching views (`t`, `s`, `c`) closes it. Enter (or a click) on a role opens it in full: its
  name and where it comes from, its description under that, then the sections **Model**,
  **Skills**, **Tools**, **Checklist**, **Placeholders** (the `{{placeholders}}` the checklist may
  use, and what each one becomes) and **File**, with buttons: Edit (`e`), See the prompt (`p`), Turn off /
  Turn on (`o`, not for `general`), Reset to built-in (`r`, only for a built-in you replaced) and Remove
  (`d`, only for a role you added; it asks "Yes, remove (`y`)" or Cancel (`x`) first). Back (`b`)
  goes back to the Roles page. See the prompt shows the built-in worker prompt the role is put
  into, view only, with `{{role}}` marked where the checklist goes; it can switch between the
  `change` and `investigation` prompts (for the `checker` role it shows the checker's prompt,
  `prompts/checker.ts`, instead), and Back (`b`) returns to the role.
  Edit opens the role's edit page in the panel (like a scout's): the same names in the same
  order, one box each for **Description**, **Model**, **Skills**, **Tools** and **Checklist**.
  The name is the file's name, so the edit page can't change it: to rename a role, rename its
  file. Save writes `.symcc/roles/<name>.md`
  (a built-in role is copied there first), Cancel (`x`) leaves without saving. `+ New role`
  (`n`) asks for a name, makes `.symcc/roles/<name>.md` from a short template and opens it
  in the edit page. All of it uses the same checks as the lead's `roles` tool (see
  [Worker roles](#worker-roles)), and a toast says what changed.
- Typed form: `/symcc-settings max_parallel 5`, `/symcc-settings notify sound`,
  `/symcc-settings mode review`, `/symcc-settings test_commands "npm test"`. A wrong name
  or value says why, e.g. `max_parallel must be a whole number, 1-8`.
- `notify` is `off`, `sound` (a short chime) or `voice` ("symcc: T-3 done", "my app: T-5 needs you"
  out loud: the project folder's name comes first, with dashes, underscores and dots said as
  spaces, and only its first three words when it is long). A new board uses `voice` where this computer can speak, else `sound`, else `off`.
  Once per session symcc checks which programs exist (without playing anything): on macOS
  `say` for voice and `afplay` with the built-in sounds for sound; on Linux `spd-say`,
  `espeak-ng` or `espeak` for voice and `paplay` (freedesktop sounds), `canberra-gtk-play`
  or `aplay` for sound; on Windows PowerShell's built-in speech and system sounds. A choice
  that can't play here is refused with the reason, e.g. `voice isn't available here: no
  speech program found (install espeak or speech-dispatcher)`, from the panel, from
  `/symcc-settings` and from the lead. If the saved choice can't play on this computer (the
  board was set on another one), you are told once and nothing plays; the setting is kept.
  Task text is always passed to these programs as a plain argument, never as shell code.
- Panel keys: `a` approve, `x` reject or drop, `d` changes, `p` pause, `u` resume,
  `r` retry, `m` switch review / auto, `f` search the tasks, `n` needs review, `1`-`9` a try's report on the task
  page, `t` / `s` / `c` switch views, `b` back.
- Copy, `y` on the task page: puts the task on the clipboard as plain text (its title, status, role,
  where it came from, why, what to do with the notes and your answers, the files it may change,
  what it waits for and the latest worker report). A toast says `T-12 copied`, or why it
  couldn't, e.g. `couldn't copy: this terminal has no clipboard access`.
- **Ctrl+T** (Claude Code's background tasks) shows running workers; open one to watch it.
- Each task lists how long each try took and the tokens it used; the board ends with a
  total, e.g. `total: 1h 12m · 1.2M tokens in all over 4 tries`. "In all" means every kind of
  token added up; `/symcc-stats` shows the kinds apart (see below).

### In VS Code

In the Claude Code extension's side panel, letter keys and ↑↓ do nothing: you click a button
(or Tab to it and press Enter). So the board there has its own layout; the terminal's is
unchanged.

- **Header**: the symcc logo (the clef, in the accent color; it sways now and then and turns
  into a check mark, a robot or a note on a merge, a start or a scout finding, as in the
  terminal) with four short lines beside it: the name, version and folder; the board mode as a
  colored pill (`⏵ auto`) with what it means, dim; the branch and who drives; the tests (the
  first command, then "(+1 more)") and the limits. Under it the counts as small badges
  (`● 2 doing · ● 6 to do · ● 1 waiting for you`), each dot in its status color. Every line
  wraps, never cut.
- **Tabs**: a segmented row of small boxes, `Tasks 20`, `Scouts 1`, `Settings`. The one shown
  has a bold border in the accent color, its name bold and its count in a filled badge; the
  others have a dim border. Click a tab to switch.
- **Tasks**: grouped under headings (Questions for you, Waiting for you, Review, Failed, Doing,
  To do), each with its colored mark and its count in a badge (`▶ Doing  2 `), a blank line
  between them. Each task is one button: the ID dim and the title (up to two lines; a longer
  one ends with "(more)", and its page has it whole), then a dim line with the status in its
  color and its time (`▶ 2m`, `? waiting for 5m`, `✗ failed 3m ago`), the kind or role, the
  try, and the question or why it failed. A task that needs you starts with a `●` and has a
  bold title. The lead's questions look the same, in the warning color. Backlog, Done and
  Dropped are folded headings (`▸ Backlog  3 `), closed until you click them. With nothing
  open the list says "All clear" and has one main button, `Tell the lead what to do next`,
  which puts "Next task: " in the prompt box (only when the box is empty).
- **Footer**: a `Switch to review merge` (or `Switch to auto`) button and a search box that
  filters as you type, with `Clear search` while a search is on. No key hints; other pages
  say "Click a button, or Tab to it and press Enter." and their buttons drop the key marks
  (`Back`, not `Back (b)`).
- **A task's page** reads like a card. It uses the whole panel width and wraps every line,
  never cutting it with "…". From the top: a `← Tasks` button back to the list; the task ID and
  title, large and bold; a status badge in its color (`▶ doing`, `◆ ready for review`,
  `? waiting for you`, `✗ failed`, `◆ answered: read it`), with the kind, role, try and time
  as small dim tags beside it. What needs you comes next, in a box in its color with its
  buttons inside: the **Question for you** (yellow) with its answers as buttons and a box for
  your own answer (a file request has `Allow files` and `Don't allow`); **Why it failed** (red)
  with `Retry`; **Waiting for your files** (yellow) with `Merge now`. Then one row of the other
  buttons that fit the status (for example Approve, Reject, Show changes, Drop, Copy for a task
  in review), with at most one main button on the page. Then the sections, each under a clear
  heading: **Why / where it came from**; **What to do** (the details, drawn as Markdown); the
  **Changes** of a task in review; **History**, a timeline with the newest first (a mark, when
  it happened, then the whole line; merges in green, failures in red); and the latest
  **Report** as Markdown: its first lines, with `Show all` for the rest and a button for each
  try. Last come three folds, closed until you click them, each with a count:
  `▸ Files it may change (3)`, `▸ Waits for (2)` (each task ID a button that opens it) and
  `▸ Time and cost (2)`.
- **Scouts**: each scout is one button of a few lines, wrapped, never cut: its name and its
  state as a filled badge in its color (`◉ running now`, `○ paused`, `◎ next in 3h`,
  `◎ on demand`); then a dim line with how often it runs, its model and when it last ran; its
  summary; and, dim, the start of its last report (`last report: found 2: …` with the first
  finding, or `last report: nothing`). Under the list: `+ New scout` and `← Tasks`. With no
  scouts yet, a short how-to in a box and `+ New scout` as the main button.
- **A scout's page**: a `← Scouts` button; the name and state; when it runs, its model, the next
  run and the last run; buttons `Run now` (not while it runs), `Pause` or `Resume`, and `Edit`;
  then its **Instructions** and its whole **Last report**, both as Markdown, and its **File**.
- **Settings**: every group is a heading (Work, Checks before merging, Workers, Scouts, Board
  and alerts) with its settings under it, each on its own row with its value. A setting with
  a fixed set of choices (mode, notify, checker, scout_findings, tests_with_changes,
  open_on_start, enabled) is a drop-down: pick a value and it is saved at once. Numbers and the
  test commands are boxes: type and press `Save` (a wrong value says why and saves nothing; an
  empty test commands box clears them). Under each row, a dim line says the default and what
  the setting does. Roles and Kinds are buttons that open their pages. No key hints.

---

## Tracing a task back

Every task records who made it, why, and your words that started it. Open the board
with `/symcc`, or one task with `/symcc-task T-3`: the `from:` line says, for example,
`from: owner — “add a search command…”` or `from: scout bugs`, and the history lists each
try. Every merge commit starts with the task ID, so `git log --grep "T-3"` finds the work
for a task, and the ID on a commit takes you back to the task and your request. Tasks made
before this was kept show `from: unknown`.

## Where to see what a task did

- **The git commit.** Each try's commit starts with the task ID (`T-3: ...`) and ends with
  trailers: `Symcc-Task`, `Symcc-From` (who asked), `Symcc-Why` and `Symcc-Try`. Find them
  with `git log --grep "T-3"`.
- **The task page** (`/symcc-task T-3`, or open it on the board): **History** has one short
  line per event, each with when it happened ("10:42" today, "Nov 18 22:49" before), for
  example what the worker said in a try (cut at a word end with "…") and how it went,
  **Commits** lists the commits each try made and the one that was merged, and **Report**
  shows the worker's full final report for the latest try. When more than one try has a
  report, press the try's number (`1`, `2`, ...) to read that try's report. `/symcc-task T-3`
  shows the first 40 lines (at most 4,000 characters) and says where the full report is.
- **Asking the lead.** The lead's `board` tool shows the same: with `task: T-3` it gives the
  task in full with its latest report (cut like `/symcc-task`) and the files of older tries'
  reports. With nothing it lists the open tasks and the backlog, and the done and dropped
  ones only as counts ("143 done, 3 dropped; ask with status: done to see them"). `status`
  (todo, doing, review, waiting, failed, paused, done, dropped, backlog, or `open` for
  everything not done, dropped or backlog) and `search` (words, matched the same way as the
  board panel's `f` search) narrow the list.
- **The report files.** Every try's full final answer (the worker's hand-back, also
  when it asked you something) is saved in `.symcc/reports/T-3-try-2.md` (plain text, up to 50 KB).
  Tasks from before this was kept say "no saved report".
- **The research note.** When a task's merged work adds or changes a file under
  `docs/research/`, the task page shows it in Details as `Research: docs/research/<file>.md`.
- **Claude Code's agent list** (Ctrl+T) shows a worker's whole conversation, but only for a
  while: it is not kept. The report file and the commit are what stay.

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

The git check works on the command text and is a best effort, not a sandbox. It also sees the open tasks, so it
doesn't suggest them again. To look further at the board it has symcc's two read-only tools:
`board` (no arguments: the open tasks; `status` and `search` narrow it; `task`: one task in full
with its latest report) and `stats`. Every symcc tool that changes something (`add`, `change`,
`drop`, `approve`, `settings`, ...) is refused for a scout with "scouts can only read the board".
A checker gets the same read-only tools.

When it is done, its whole report (up to 2000 characters) goes to the lead, which adds tasks,
tells you what matters, or ignores it. A scout that answers `NOTHING` sends no message.
The `scout_findings` setting says where the tasks it adds go: `auto` (the default) lets the
lead decide, so a finding it adds goes to `todo` and runs; `backlog` puts every task added
from a scout finding in the backlog, whatever the lead asks, until you (or the lead, on your
word) move it to `todo`. The lead still tells you what the scout found. Change it with
`/symcc-settings scout_findings backlog`, in the Settings view, or by telling the lead. The
last report shows on the scout's page in the board panel. [`examples/scouts/`](../examples/scouts/)
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

A new project starts with these example scouts. The first time symcc starts in a project with
no `.symcc/scouts/` folder yet, it copies every example there and marks each one paused (in
`.symcc/scouts.json`), so they show in the Scouts view but never run on their timer until you resume
one: press `p` on its page, or run `/symcc-scout <name> resume`. To try one first, press `r`
(Run now) on its page or run `/symcc-scout <name>`: it runs once and stays paused. If the folder is already there (even empty, e.g. you removed
every scout), nothing is copied, and a scout file is never overwritten or added back. If the
copy fails, symcc says so once and starts as usual.

A scout's page in the board panel shows a header line (its name, state, how often it runs,
e.g. "every 7 days", its model and when it last ran), then its summary, then the sections
**Instructions** (the whole text of its file), **Last report** and **File**. The summary is
the optional `summary:` line in the file's front matter, e.g. `summary: Looks for crashes`.
Without one, the page shows the first line of the instructions there instead, in a dimmer
colour.

Under the last report, **Runs** lists the scout's recent runs, newest first, one line each:
when it ended, how it ended (found, nothing, stopped, API error, refusal or couldn't start),
how many findings its report numbers, and the tasks made from it (a task the lead adds from
this scout's finding is saved in the scout's latest run that reported something, so it stays
listed after the task is archived). Open one to read that run's whole report; in VS Code's
side panel each run is a button, and "← <scout>" goes back. Esc on a run's page goes back to
the scout's page too, and leaving the scout's page any other way (Esc again, another view,
closing the panel) closes the run, so the scout opens on its own page next time.
When the last run ended on an API error or a refusal, the page says so under the header
("Its last run ended on an API error, so nothing was reported."). Each scout keeps its last
50 runs in `.symcc/scouts/<name>.runs.json` and each run's full report in
`.symcc/reports/scouts/<name>-<time>.md`; older runs and their report files are removed.
The first time, a scout's last report from `.symcc/scouts.json` becomes its first run (its
tasks are worked out from the board: the scout's tasks added after it).

You can also make and change scouts right in the board panel: on the Scouts view, "New
scout" asks for a name, and "Edit" on a scout's page opens its edit page. It shows the same
header line, then the same names in the same order, one box each: **Runs every** (in
minutes, 0 = only on demand), **Model**, **Summary** (empty: the first line of the
instructions is used) and **Instructions**. The name is the file's name, so the edit page
can't change it: to rename a scout, rename its file. Save writes the file (other front
matter keys are kept) and the new timing applies at once. `/symcc-scout <name>` runs a scout now.

Or just ask the lead: it has a `scouts` tool. It can list the scouts (how often each runs,
like "every 2 days" or "on demand", whether it is paused or running, its next and last run
and the first lines of its last report), show one in full (its instructions, whole last
report and its last few runs), add or change one (name of lowercase letters, digits and dashes, every_minutes with
0 for only on demand, an optional model, and the instructions), remove one (it checks with
you first) and run one now, just like "run now" (a paused scout runs too, once, and stays paused;
refused, with the reason, when the scout is already running or git isn't set up). Every change shows on the board at once. Only
you pause or resume scouts; the lead can't.

### Scouts that run only on demand

`every_minutes: 0` (or 0 in the panel's "Runs every" box) means the scout runs only
on demand: never on the timer, only when you press "run now" on its page or run
`/symcc-scout <name>`. The Scouts list and its page say "on demand" instead of "every N"
and show no "next in …", for example `◎ secrets  on demand  last: nothing`, and the status
line's next scout skips it. If `every_minutes` is left out, the scout runs every hour.

A value that is not a whole number of 0 or more (like `-5`, `1.5` or `ten`) also means
only on demand, so a typo never makes a scout run more often than you meant. Its row shows
`bad every_minutes`, and its page and `/symcc-scouts` show a warning such as
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

### The checker

The `checker` setting is `off` by default. Turn it on with `/symcc-settings checker on` (or tell
the lead "turn on the checker"). Then, when a change passes its tests, a fresh checker (the
built-in `checker` role) starts in the task's folder. It cannot edit files. It reads the task and
the diff and tries to break the change, for example by running it with odd input.

The checker may only read with git. Any git command that changes something (commit, checkout,
switch, reset, stash, branch or tag changes, merge, rebase, push and so on) is refused, and so are
read-only commands with options or settings that write files or run programs (such as
`git diff --output=...` or `-c` settings that run a program). This check works on the command text and
is a best effort, not a sandbox: git run through a variable, a script or other shell tricks can still
get through. The real fix is the worker sandbox (T-365).

- **OK:** the task goes on as usual, to review or to merge.
- **Problems found:** the checker's report goes to a new worker, like a failed test run. It counts
  as one of the `auto_retries`.
- **No answer** (the checker was stopped, ran longer than `max_minutes`, or could not start): the
  task waits for your review.
- **Skipped** for investigations and for changes that touch only prose or media. Only these count:
  `README`, `CHANGELOG`, `LICENSE`-style names (no extension, `.txt` or `.rst`), `.md` files that are not
  instructions for agents, and images, video, audio, subtitles and fonts. A `.md` file is instructions
  for agents, and so is checked, when it is under `roles/`, `kinds/`, `agents/`, `commands/`, `skills/`,
  `examples/scouts/`, `.claude/`, `.symcc/`, `.github/instructions/`, `.cursor/`, `.windsurf/`, `.clinerules/`,
  `.opencode/`, `.gemini/`, `.codex/` or `.roo/`, or is named `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `GEMINI.md`,
  `CONVENTIONS.md`, `copilot-instructions.md` or `*.instructions.md` (and `.cursorrules`, `.windsurfrules` and
  `.clinerules` files are always checked). Everything else is checked, even under `docs/`:
  `.mdx` files (they hold code), and config, build and CI files such as `package.json`, `.yaml`,
  `.toml`, `Makefile` and `.github/workflows/`. (`tests_with_changes` keeps its wider docs rule: a role
  file or a docs config file is not code that needs a test.)

The `checker` role (Settings → Roles → checker) is only the checker's checklist: you can edit it, but
it can't be turned on or off and is never a task's role. Its page says so and shows whether the
`checker` setting is on; the lead's `roles on checker` is refused for the same reason.

The checker's verdict is written in the task's history.

---

## Task kinds

Each task has a **kind**: what the task is for. It is shown next to the task (`bug`,
`investigation`); `change` shows nothing, because it is the default. A kind you add is one
Markdown file, like a role (see [Worker roles](#worker-roles)). The worker is told its task's kind and
what it means.

The built-in kinds (in the plugin, one file each: `kinds/<name>.ts`):

| Kind | What it is for |
|---|---|
| `change` | A general change when no other kind fits (the default). |
| `bug` | Something that works wrongly. The worker finds why and fixes it, with a test that fails before the fix and passes after. |
| `feature` | New behavior for you, with tests that show it works. |
| `refactor` | Cleaning up code without changing what it does; tests that passed still pass. |
| `docs` | Documentation only (README, docs/, comments), not code. |
| `investigation` | Find an answer and hand it back; nothing is merged. |

**Two ways a task runs.** `investigation` is one of them: its worker hands back an answer,
nothing is committed, tested or merged, and it waits for you to read it (see
[Investigation tasks](#investigation-tasks)). Every other kind, `change` included, runs the
same way: the worker changes files, which are committed, tested and merged (see
[What happens when a worker finishes](#what-happens-when-a-worker-finishes)).

**How the lead picks one.** The lead reads each kind's description and chooses the one that
fits when it adds a task; `change` when unsure. To override it, tell the lead: "make T-5 a
bug" or "T-7 is an investigation". It changes the kind of a task that has not finished yet.

**Your own kinds.** Put a file in `.symcc/kinds/<name>.md` in your project:

```markdown
---
description: small upkeep work - dependency bumps, config tidying
---
Keep the change small and say what you updated.
```

`description` is required: it says what the task is, the lead reads it to choose, and the worker
is told it. The name uses letters, digits, `-` and `_`. A file with the name of a built-in kind
replaces it. The text under the front matter is extra advice for the worker. A file that can't be
used is skipped, with a note.

A kind is only a label with a description. It does not change how a task runs.

**Add, edit, reset, turn off.** The easy way is to ask the lead: "show me the kinds", "add a
`chore` kind for dependency bumps", "turn off the feature kind", "reset the bug kind". The lead
uses its `kinds` tool (list, add, edit, reset, remove, off, on). Or use the board panel: the
Settings view (`c`) has a **Kinds** row that opens the Kinds page, with the same keys as the
Roles page (Enter opens a kind, `n` adds a new one, `b` goes back).

- Each kind is shown as `built-in`, `replaced` (your file over a built-in), `added` (your
  own) or `off`.
- **Edit** on a built-in kind first copies it to `.symcc/kinds/`, then changes the copy.
- **Reset** removes your file for a built-in name, so the built-in comes back. A kind you
  added has nothing to go back to: the lead removes it instead (after asking you).
- **Off** means the lead never picks the kind for a new task. A task that already has it keeps
  it. `change` and `investigation` can't be turned off. **On** turns it back.

A separate workflow for each kind was designed but is not built; the owner chose against it. See
[the old design](research/task-kinds-and-workflows.md) for the history.

---

## Worker roles

Each task has a role. The lead picks the one that fits; `general` (a plain worker) is the
default. A role is one Markdown file: the top (front matter) says what the role is for and,
if you like, which model and skills it uses; the rest is the checklist the worker follows.

```markdown
---
description: writing or fixing tests - edge cases, error paths, no flaky tests
model: sonnet
skills: [code-review]
---
- Cover error paths and edge cases, not only the happy path.
- No sleeps, real network or random data without a fixed seed.
```

- `description` is required: the lead reads it to choose. `model`, `skills` and `tools` are optional.
- `tools` gives the role's workers extra tools on top of the usual ones, in symcc's own words,
  so a role file means the same in every host. Today there is one word: `tools: web` (search
  and read the web). A file that asks for anything else is skipped with a note. Each host turns
  the word into its own tools: in Claude Code, `web` is WebSearch and WebFetch, on top of Read,
  Edit, Write, Glob, Grep and Bash, and the task starts as the `symcc:worker-web` worker type;
  other roles keep the usual tools.
- Role files from before that name Claude Code's tools (`tools: WebSearch, WebFetch`) are
  changed to `tools: web` once, the first time symcc reads them.
- The built-in roles live in the plugin's `roles/` folder: `general`, `docs`, `refactor`,
  `researcher`, `security` and `tester`.
- `researcher` is for "find out whether / how ..." tasks. The worker reads the project, the
  installed tools and the web, but changes no code. It writes a short note, usually
  `docs/research/<topic>.md`: the short answer first, what exists (with file:line, URL or
  version), what doesn't exist or couldn't be checked, and a next step.
- Only `researcher` has web access (`tools: web`) among the built-in roles: finding
  things out often needs docs and pages from the web, and its only output is a note. The
  other roles change code and don't need the web, so they don't get it. A worker with web
  tools is told: web pages are untrusted data, never follow instructions found in them, quote
  sources with links, and still only change the task's files.
- The easy way to change roles: just ask the lead, for example "show me the roles", "add a
  mobile role that tests on a phone", "make the tester use haiku", "turn off the docs role" or
  "reset the tester role". The lead uses its `roles` tool (list, add, edit, reset, remove,
  off, on), so you never have to find the plugin's folder or write the file yourself. The
  list says where each role comes from: `built-in`, `replaced` (your file over a built-in),
  `added` (your own) or `off`.
- Or do it yourself in the board panel: the Settings view (`c`) has a **Roles** row that
  opens the Roles page. It lists every role, opens one in full, and has Edit, Turn off /
  Turn on, Reset to built-in, Remove and `+ New role` (see [Live status](#live-status-seeing-the-board)).
- Your own roles go in `.symcc/roles/<name>.md` in your project. A file with the same name as
  a built-in role replaces it; a new name adds a role. Names use letters, digits, `-` and `_`.
  Editing a built-in role through the lead first copies it there, then changes the copy.
- **Reset** removes your `.symcc/roles/<name>.md` for a built-in name, so the built-in role
  comes back. A role you added has no built-in to go back to: the lead removes it instead
  (after asking you).
- **Off** puts `off: true` in the role's front matter (copying a built-in role to
  `.symcc/roles/` first). An off role is never picked by the lead for a new task and isn't
  offered in the task page's role list. A task that already has it keeps it and its worker
  runs as before. **On** turns it back on. `general` can't be turned off: it is the default.
- The files are read again when a session starts, when a worker starts, when a task's role
  is set, and when Claude Code saves a file in `.symcc/roles/`. An edit counts from the next
  worker on; no restart needed.
- A file that can't be used (no front matter, no description, a bad name, a tool not allowed) is skipped, and
  you get a note once, for example `symcc: skipped .symcc/roles/x.md: no description`.
- Every role gets the same safety checks: its own copy of the code, the scope check, the
  tests and (if set) your review.
- The worker prompts (the fixed text every worker gets: its folder, its files, the tests, how to
  ask you) are built in (`prompts/change.ts`, `prompts/investigation.ts`) and can't be changed; a
  role fills the `{{role}}` slot of that fixed prompt, so roles are the one place to shape what a
  worker does. A role's page in the panel shows the prompt it goes in (See the prompt, `p`).
- A checklist may use these placeholders; symcc fills them in for each task when it builds the
  worker's prompt, and for the `checker` role the checker's prompt, from the task it checks (any
  other `{{word}}` is left as written):

  | Placeholder | Becomes |
  |---|---|
  | `{{task_id}}`, `{{title}}` | the task's id and title |
  | `{{files}}` | change tasks only: the "Files you may change" lines |
  | `{{test_command}}` | change tasks only: the "these must pass" line with your test commands |
  | `{{folder}}`, `{{branch}}` | the worker's own folder and its branch (`symcc/T-3`) |
  | `{{kind}}` | the task's kind and what it is for |
  | `{{name}}` | the plugin's name (`symcc`) |

You can change a task's role yourself: say "use the security role for T-12", or open the task
in the board panel and press `l` (Role) to pick one. That works on a task to do, paused,
failed or in the backlog. The board list shows a role at the right end
of the task's row (`tester · try 2`); `general` shows nothing.

When a task is doing and this is not its first try, the board says which try it is: `try 2`
at the right end of its row (dim; from `try 3` on in the warning colour), `T-5 doing (try 2)`
in the band above the prompt and the status line, and `T-5 doing · try 2/3` in the lead's
board (the `/3` shows the limit while the try is an automatic retry after failing tests).
A first try shows no mark. When the status line is short of room, the try marks are left out
first, so failed tasks and reviews always stay in view.

**One task, one role.** When a feature needs several kinds of work and each part is big
enough to stand alone, the lead splits it into one task per role and links them with `after`:

```
T-20  general   Add the /export endpoint and the export button
T-21  security  Check the export for data leaks      (after T-20)
T-22  tester    Tests for export, errors included    (after T-20)
T-23  docs      Explain export in the user guide     (after T-20)
```

T-21, T-22 and T-23 run at the same time, since they change different files. A small request stays
one `general` task: each extra task costs a worker run, a test run and a merge.

---

## Which branch work goes into

- Each task merges into **the branch you were on** when the task was made. There is no
  branch setting. (On a detached checkout it uses the repo's main branch: `main` or `master`.)
- To move one task to another branch, tell the lead, e.g. "merge T-3 into `develop`"
  (it changes the task's `merge_into`). Only a branch that exists is accepted.
- If a task's branch was deleted, the task waits and asks you whether to merge into another
  branch instead. Nothing is marked failed.

### A folder without git

symcc needs **git** (the program) and a git repo with at least one commit: each worker
gets its own git worktree. It checks this when a session starts and before a worker starts.

- **git not installed**: nothing starts; the banner and status line say
  `git is not installed`, and the lead tells you how to install it (macOS:
  `xcode-select --install`, or https://git-scm.com).
- **No git repo, or no commits yet**: a git repo is set up for you, but symcc asks
  first. The lead asks you; say yes, or press **g** ("Set up git") in the board panel.
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

---

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
To move driving to the window you are in, type `/symcc-drive` there. If another window
drives, symcc asks it to hand over: within 30 s it stops its workers (the answer says which
ones), steps down, and your window starts driving and restarts those tasks from their kept
folders and branches. A task stopped this way does not use up a try; its history says
"restarted: the owner moved driving to another session". There are never two drivers at
once. If the other window doesn't answer within 3 minutes, yours takes over anyway.

### How the lead keeps the board in order

The lead sorts the board by a few plain rules: older tasks go first unless you say a task is
urgent; bugs and safety fixes go before features; `order` sets the priority (lower runs
first). Tasks wait on each other (`after`) only when they really change the same files, and a
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
  and the board's total time and tokens include them. Task numbers are never reused.
- **Finding one:** `/symcc-task T-12` shows an archived task (or ask the lead, who can look
  it up with its `board` tool). Archived tasks are read-only: change, ask, approve and so on
  answer "T-12 is archived". Retrying an archived *dropped* task brings it back to the
  board as `todo`, with a history line.

---


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
- **Summary and full:** `/symcc-stats` starts with one line (tasks done, hours of work, tokens,
  share right on the first try), then short parts with plain bar charts (`▇`, with `▂` and `▅`
  for a part of a block, so small numbers still show), each scaled to the biggest number in
  that part, with the counts and percentages lined up. Every line fits in 80 columns. It keeps
  every figure; the long explanations become short footnotes. `/symcc-stats full` (also with a
  range, e.g. `/symcc-stats full 7d`) adds them back: the billed-equivalent lines with how they
  are weighed, where the lead's tokens come from, and why waiting time is not shown. The lead's
  `stats` tool gets the full text, unless it asks for the short one.
- **Kinds of tokens:** symcc keeps four counts apart wherever it records tokens (each try,
  each scout run, the lead's calls): *input*, *output*, *cache write* (input saved to the
  prompt cache) and *cache read* (input read back from it). They cost very different amounts:
  a cache read costs about a tenth of normal input, so one plain sum makes the cost look much
  bigger than it is. The totals and the "Whole team" part show the kinds on the line under each
  figure, plus a **billed** (billed-equivalent) figure ("292M in all, about 35M billed"): the kinds weighed by their usual
  price compared with input (input 1, cache write 1.25, cache read 0.1, output 5), i.e. how many
  plain input tokens would cost the same. It is an estimate: real prices depend on the model.
  Elsewhere (the board, the banner, a task's page, the per-task and per-day rows) one short
  figure is shown, "in all": every kind added up.
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
  try (average time and tokens); the 5 biggest tasks by tokens and by time (bars); how tasks
  ended (merged on its own, approved by you, or answered for an investigation; failed
  tries by reason: tests, clash with main, files out of scope, stopped, rejected);
  investigations on their own (how many, answered, time, tokens, tries; see
  [investigation tasks](#investigation-tasks)); by role and where tasks came from (lead,
  you, all scouts with each scout on its own line under them, workers), each with its share,
  average tokens and time; done per day for the last 7 days with activity, oldest first.
- **What is left out:** tasks with no tries recorded are left out of the averages (the
  report says how many). Time waiting for you is not shown: history
  entries from older boards have no times. The worker time is the same as the total on the board's banner.

---

## Turning symcc off

The board mode `off` only stops the workers: Claude still acts as the lead. To have Claude
go back to normal, type `/symcc-off` (or set `enabled` to off in the Settings view). From
your next message, no restart needed:

- the lead instructions are no longer added to Claude's prompt,
- running workers and scouts are stopped (their tasks go back to `todo`) and nothing new starts,
- no "[symcc] Board update" messages and no sounds or voice,
- the panel does not open by itself and the status line just says `symcc off · /symcc-on`,
- the symcc tools answer "symcc is off. The owner can turn it on with /symcc-on." and change nothing.

The board, its tasks, its mode and the scouts are kept. `/symcc-on` turns everything back
on, in the mode the board had. The switch is kept per project, as `enabled` in
`.symcc/board.json` (a board without it is on).

---

## Where everything lives

```
your-project/
└── .symcc/
    ├── board.json        the board: settings + every task
    ├── archive.json      old done and dropped tasks, moved off the board (see archive_days)
    ├── board.lock        held for a moment while a window saves the board
    ├── lead.json         which window drives the board (with a heartbeat)
    ├── scouts/           your scout files (*.md) and each scout's recent runs (*.runs.json)
    ├── scouts.json       each scout's last run and report, and whether it is paused
    ├── roles/            your own worker roles (*.md), see Worker roles
    ├── reports/          each try's full worker report (T-3-try-2.md), and scouts/ with
    │                     each scout run's full report (bugs-2026-11-18T10-20-30-000Z.md)
    └── worktrees/
        └── T-3/          a worker's private copy of the project (branch symcc/T-3),
                          kept while it waits for review, removed after it is merged
```

Add `.symcc/` to your project's `.gitignore` so the board and the copies stay local.

A task's branch (`symcc/T-3`) and its folder are removed once the task is merged, so old
branches don't pile up; the regular check also tidies up any left from before. A branch is
deleted only when all its work is in the branch the task merged into (even when that branch
isn't the one you have checked out), and never while a folder still has it checked out, so
nothing that isn't merged is lost. A dropped task loses
its folder but keeps its branch, in case you want to look at its work. Branches that don't
start with `symcc/` are never touched.

---

## Good to know

- **A worker's copy has no installed packages.** `node_modules/` and other ignored
  folders are not copied into `.symcc/worktrees/T-…`. If your tests need them, say so in
  the task (for example: link the main project's `node_modules`, and remove the link
  before finishing).
- **Big tasks can run out of time.** A task that touches a lot of code may need more than
  45 minutes. symcc then asks you for more time (see "A worker over its time limit"); to stop
  being asked, raise `max_minutes` or split the task.
- **Finished workers in Claude Code's agent list.** After a task is done, its worker stays in the list below the prompt for a while, showing its last step (for example "◯ symcc-T-94 Splitting status strip test…"). It isn't running or using tokens; Claude Code clears it by itself later, and plugins can't remove or relabel it. The board shows the real state of each task.
- **What workers and scouts can use.** Workers can't commit, push or merge. They use
  Read, Edit, Write, Glob, Grep and Bash, with edits accepted automatically, inside your
  normal Claude Code permission settings. Scouts can't edit or write files: they use Read,
  Glob, Grep, Bash, WebSearch and WebFetch, and their shell commands follow the same rules.
- **A dropped task never runs on its own.** There is no delete; a dropped task stays on
  the list (until it is archived), and nothing automatic (retries after failed tests, a finishing check) starts
  it again. To bring it back on purpose, press `r` (Retry) on its page or ask the lead to
  retry it: it goes back to `todo`, with "brought back from dropped" in its history.
  `done` is final: a done task can't be retried or sent a question.

---

## Renaming the plugin

The name comes from one place: `"name"` in `.claude-plugin/plugin.json`. Everything else is
made from it: the data folder (`.<name>/`), task branches (`<name>/T-1`), the commit author,
the agent types (`<name>:worker`, `<name>:scout`), the tool names (`mcp__<name>__add`), the
slash commands (`/<name>`, `/<name>-mode`, `/<name>-help`, ...) and all the text on the board.
To rename it:

1. Change `"name"` in `.claude-plugin/plugin.json`, and `DEFAULT_NAME` in `hooks/name.ts`.
2. Change the name in the `atom({ plugin: ... })` lines near the top of
   `hooks/claude/panel.ts` (`opened`, `tab`, `scout`, `view`) and under `PluginState` in `types/claude.d.ts`. Claude Code reads
   which values a plugin keeps before it runs, so these must be written out as text.
3. Move the old data folder in each project, e.g. `mv .symcc .crew`. Nothing is moved for
   you, and nothing tells you: until you move it, the plugin starts a new, empty board.
4. Update `.gitignore` to ignore the new folder (`.crew/`).

Old task branches keep their old names (`symcc/T-1`); they still work.

---

## For developers: where the code is

| File or folder | What's in it |
|---|---|
| [`hooks/register.tsx`](../hooks/register.tsx) | Only the wiring: the `on(...)` calls that hand Claude Code events to the modules below |
| [`hooks/core/`](../hooks/core/) | The board as plain data (`board-file.ts`, `task.ts`, `review.ts`, `banner.ts`, `scouts.ts`, ...). No Claude Code calls, so it's easy to test |
| [`hooks/board.ts`](../hooks/board.ts) | A barrel: it only re-exports `hooks/core/*`, so tests and other files import from one place |
| [`hooks/app/`](../hooks/app/) | What symcc does, with no Claude Code in it (it talks to the host through `Host` in [`hooks/host.ts`](../hooks/host.ts)): the lead's tools (`tools.ts`), workers (`workers.ts`), git (`git.ts`), review and merge, scouts, roles (the built-in worker prompts they go in are in [`prompts/`](../prompts/)). Shared state is the `S` object in `state.ts`; the entry points are in `symcc.ts` |
| [`hooks/claude/`](../hooks/claude/) | The Claude Code adapter: the `Host` made from Claude Code's `$` (`host.ts`), the tool registrations, the agent types and the panel atoms (`panel.ts`) |
| [`hooks/claude/ui/`](../hooks/claude/ui/) | The panel pages and the part above the prompt (`list.tsx`, `task-page.tsx`, `scouts-page.tsx`, `settings.tsx`, ...) |
| [`hooks/name.ts`](../hooks/name.ts) | Everything made from the plugin's name |
| [`types/index.d.ts`](../types/index.d.ts) | The shapes of a task, a try, a scout |
| [`tests/`](../tests/) | The tests: one file per area (the board logic, the panel, merging, scouts, stats, and so on) |
| [`hosts/node/`](../hosts/node/) | symcc with no Claude Code: a `Host` made of plain Node/Bun calls (`host.ts`), agents as `claude -p` processes (`runner.ts`), and a tiny command line (`main.ts`). See "Running symcc without Claude Code" below |
| [`hooks/opencode/`](../hooks/opencode/), [`opencode/`](../opencode/) | symcc in OpenCode 2.x: the plugin's setup and which copy runs the board (`plugin.ts`), its `Host` (`host.ts`), the edit guard (`guard.ts`), workers and scouts as OpenCode sessions (`agents.ts`), the lead (`lead.ts`), symcc's tools and slash commands (`tools.ts`), the view file for the TUI (`view.ts`), what the TUI draws (`board-view.ts`) and how (`tui.ts`), and the plugin entries OpenCode loads (`opencode/server.ts`, `opencode/tui.ts`). See [Using symcc in OpenCode](#using-symcc-in-opencode) |

**Where to add a new feature:** pure logic goes in `hooks/core/`; what symcc does goes in `hooks/app/`; Claude Code wiring goes in `hooks/claude/`; panel pages go in `hooks/claude/ui/`. `hooks/app/` and `hooks/core/` must not import `claude-code` or `node:` modules, or name Claude Code's tools: `sh tests/host-free.sh` (run by `sh scripts/typecheck.sh`) checks this.

**Two rules the loader needs:**

- A function that takes `$` and is imported from another file must be a `function` declaration, not an arrow `const`.
- Panel atoms (`read` / `update`) must be used in the file that declares them. From other files, use the `readX` / `updateX` helpers in `hooks/app/state.ts` (they reach the atoms in `hooks/claude/panel.ts` through the `Host`).

---

## Working on symcc

- **Run the tests:** `claude plugin test .` from the project folder.
- **Where tests live:** in `tests/`, one file per area (for example `board.test.ts` for the board logic and `pane.test.tsx` for the panel).
- **Layout:** `hooks/core/` holds the logic you can test (plain data, no Claude Code calls). `hooks/app/` holds what symcc does, also with no Claude Code. `hooks/claude/` and `hooks/claude/ui/` do the wiring to Claude Code, and `hooks/register.tsx` only connects events. Put new logic in `hooks/core/` when you can. See the code map above.
- **Test the Node host:** `sh scripts/test-node-host.sh` (bun test, not `claude plugin test`: it needs files and processes).
- **Test the OpenCode plugin:** `sh scripts/test-opencode-host.sh` (bun test with a fake OpenCode context; OpenCode itself is not needed).
- **Rebuild the SVG pictures:** the pictures are made by scripts, so don't edit them by hand. The steps are in "How to change it" in [`architecture.md`](architecture.md) (for `architecture.svg`) and in [`demo.md`](demo.md) (for `demo.svg`).

### Running symcc without Claude Code

`hosts/node/` runs the same engine (`hooks/app/` and `hooks/core/`) from a plain command line, with each worker as its own `claude -p` process. It has no board panel, no band and no plan mode. It is a small test of the idea, not a full client. Each command is one session:

```
bun hosts/node/main.ts --root <project> tool settings '{"test_commands":["npm test"]}'
bun hosts/node/main.ts --root <project> add "Say hello" "Create hello.txt" --files hello.txt
bun hosts/node/main.ts --root <project> [--model haiku] tick     # starts ready tasks, waits for their tests and merges
bun hosts/node/main.ts --root <project> board
bun hosts/node/main.ts --root <project> cmd symcc-mode review    # any slash command
```

What the lead would be told is printed after each answer, under `[lead]`. A worker's file list is handed to `claude -p` as its own permission rules (`--permission-mode dontAsk`, with `Edit(...)` and `Write(...)` rules for the task's files, and git writes denied). There is no symcc hook guard there, so those rules are the only check on git, and they are stricter than in Claude Code: a worker or checker may not change git at all, not even in a scratch repository under `.scratch/` or `/tmp`. Claude Code's rules match the start of a command, not the folder it acts on, so every git call that starts with an option (`git -C <dir> ...`, `git --git-dir=...`, `git -c ...`) is refused, as are `commit`, `merge`, `init`, `reset`, `checkout`, `branch`, `push`, `stash`, `add`, `config` and the other writing subcommands, and `env git`, `xargs git` and the like. Reading with git (`status`, `diff`, `log`, `show`, `blame`, `grep`) still works. A command that hides git inside another program (`sh -c "git commit"`, a script) is not caught by these rules. The scope check at merge time still stands behind it. A `claude -p` worker has no `ask_owner` tool, and it can't be sent messages while it runs: to stop it, its process is ended.

---

## Using symcc in OpenCode

symcc also runs in [OpenCode](https://opencode.ai) 2.x (2.3 or newer). The older 1.x line has a different plugin system and is not supported (`opencode --version` tells you which one you have). This is a first version: the board, the lead, workers, scouts and the guard work; a few things are missing or differ from Claude Code (see [What differs from Claude Code](#what-differs-from-claude-code)). The Claude Code plugin is not changed by any of this, and both can be used on the same project.

### Install in OpenCode

**What you need:** OpenCode 2.3 or newer, git, and a copy of symcc. Nothing else is installed: symcc's `opencode/` folder has no packages of its own. Its board screen (the panel and the strip above the prompt) is drawn with Solid and OpenTUI, and OpenCode's window gives those to its plugins itself, so the board uses the very same copies as OpenCode's window (two copies of Solid would not work together).

**Getting OpenCode 2.x:** install it from npm, `npm install -g @opencode/cli` (the command is still `opencode`). Homebrew's `opencode` is the old 1.x line, which has a different plugin system and can't load symcc. Run `opencode --version` to see which one is on your PATH: it should say 2.3 or higher. The install script warns when it finds an older one.

From a copy of symcc on your machine (a clone, or the folder you already work in), one command:

```bash
git clone https://github.com/kourgeorge/symcc && sh symcc/scripts/install-opencode.sh
```

The script links symcc's `opencode/` folder into OpenCode's plugins folder for you, `~/.config/opencode/plugins/symcc` (or `$XDG_CONFIG_HOME/opencode/plugins/symcc`), so OpenCode loads it in every project. Nothing is copied or downloaded and there is no build step: OpenCode runs symcc's TypeScript files as they are, so a `git pull` in that folder updates symcc (restart OpenCode after it).

- **For one project only:** `sh symcc/scripts/install-opencode.sh --project <your project>` puts the link in `<your project>/.opencode/plugins/symcc` instead. Add `.opencode/plugins/` to that project's `.gitignore`, since the link points into your own machine.
- **Check it:** start OpenCode in your project and run `opencode plugin list`. OpenCode 2.3 lists the linked folder with no ID of its own (`ID: -   VERSION: local   SOURCE: <config>/opencode/plugins/symcc`), so `symcc` shows only in the folder path.
- **If OpenCode says "Plugin failed"** for symcc's folder: check `opencode --version` first (symcc needs 2.3 or newer). The board screen's error names the package it couldn't get from OpenCode (`solid-js` or `@opentui/solid`); OpenCode's log has it (`~/.local/share/opencode/log/`). Only the board screen stops then: the lead, its tools and the workers run in OpenCode's server part, which loads on its own.
- **Remove it:** the same command with `--remove` (and `--project <folder>` if you used it).
- **Keep the board local,** as in Claude Code: `echo ".symcc/" >> .gitignore`.

**Or with OpenCode's own command** (not seen working yet, see below):

```bash
opencode plugin add github:kourgeorge/symcc
```

`opencode plugin add` takes an npm package or a git address with a `package.json` at its top. symcc's repository has one at its root (it only points OpenCode at `opencode/server.ts` and `opencode/tui.ts`; it installs nothing, and the Claude Code plugin doesn't use it). In T-497's own scratch run with OpenCode 2.3.2, the command still failed with "Could not read package.json", because that `package.json` wasn't on GitHub yet; trying it from a local git copy instead was blocked (a symcc worker may not create git repositories). So use `sh symcc/scripts/install-opencode.sh` until this command has been seen working.

### The lead in OpenCode

The lead is the OpenCode session you type in, in your project's folder (or a folder inside it). There is nothing to start: talk to it as you would in Claude Code ("add a dark mode toggle", "what's going on?"). symcc gives it its guide on every request, and its tools as normal OpenCode tools (`symcc_board`, `symcc_add` and so on). Board updates come into its chat as a message: a normal one waits until its turn ends, and an urgent one (a worker needs you, or its time is up) is taken in mid-turn. When one of symcc's agents ends, OpenCode also posts its own "subagent completed" message; the lead is told to act on symcc's update only.

The slash commands are the same as in Claude Code: `/symcc` (the board), `/symcc-drive`, `/symcc-settings`, `/symcc-stats`, `/symcc-off`, `/symcc-help` and the rest.

symcc's board runs in OpenCode's server, not in its window. By default the window uses OpenCode's background server (`opencode --standalone` starts a private one that ends with the window), so the board and its workers can keep running after you close the window. `opencode service stop` stops the background server, and the board with it; the next start picks the board up again.

### How workers run in OpenCode

Workers, scouts and checkers are OpenCode sessions of their own. Each one is a child of the lead's session and works in its task's own folder (a git worktree, as in Claude Code). The same checks guard them: an edit outside the task's files is refused, a shell command that writes into your own copy is refused (judged by the command's text, since OpenCode can't tell which files a command writes), and an agent symcc stopped is refused anything. Stopping a worker interrupts its session.

**The model per role.** Each role picks its model in its `model:` line, as in Claude Code (the built-in roles in `roles/`, your own in `.symcc/roles/<name>.md`; a scout in its scout file; a checker in the `checker` role):

- A Claude name (`sonnet`, `opus`, `haiku`, `claude-opus-4-5` ...) runs on OpenCode's own **Claude Agent** provider (`claude-agent/sonnet` ...). That provider runs the real Claude Code with your Claude Code login (`claude auth login`). Connect it once in OpenCode.
- **Any other model** OpenCode knows is written as `provider/model`, for example `model: openai/gpt-5`. You can mix them, for example Claude for the general role and a cheaper model for scouts.
- With no `model:` line (or `model: inherit` / `default`), the worker, scout or checker runs on **the model your lead session is using right now** (its provider and model), so it works with whatever OpenCode is set up for. The debug log says "(the lead's model)" on that agent's start line. Only if symcc can't find the lead's model (no lead session yet, or OpenCode didn't answer) does it fall back to `claude-agent/sonnet` for workers and `claude-agent/haiku` for checkers and scouts, and the log says so once.

**About the Claude login.** Whether using your Claude subscription login through OpenCode's Claude Agent provider is allowed is **not settled by Anthropic**. The Agent SDK's own docs say other products may not offer a claude.ai login unless Anthropic approved it, while a Claude Code team member later said nothing changed for Agent SDK use with Max plans; nobody has said publicly whether OpenCode's provider is fine. See the notes in the [OpenCode spike](research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md#is-the-claude-login-allowed-not-settled). Other models avoid the question: give your roles and scouts `provider/model` names (with that provider's own key). Or use symcc in Claude Code itself for Claude workers.

### The board panel and the strip

`/symcc-board` (or "symcc board" in OpenCode's command palette, ctrl+p) opens the board in OpenCode's session panel, next to the open session (run it again to close it; on OpenCode's home page, with no session open, a message says to open or start one first): the banner, then the tasks grouped as in Claude Code (Questions for you, NEEDS YOU, what runs and waits, the backlog, and Done and Dropped as counts), with the same marks, short states and times. ↑/↓ (or k/j) move, Enter opens a task or a question, b goes back, Esc closes the panel. On a task in review, a approves and x rejects (it asks for the reason); on a waiting task or a question, a answers (pick a choice, or Answer… to type your own). These are sent as slash commands in your session (`/symcc-approve`, `/symcc-reject`, `/symcc-answer T-5 <answer>` or `Q-3 <answer>`), which you can also type.

Above the prompt of an open session, a strip shows the header line and the questions and tasks that need you or run, as the band does in Claude Code. It is there by itself; there is nothing to turn on.

The panel reads `.symcc/view.json` once a second; the board writes that file on every change. Plain `/symcc` (and `/symcc-tasks`) prints the board as text in the chat, as in a window without the panel.

**If you see no strip and no panel:** open a session first (the strip and the panel belong to a session, not to OpenCode's home page), and restart OpenCode's window after updating symcc. If the board screen can't start or draw, a red message from symcc says why, and `/plugins` lists symcc as failed with the error; the lead, its tools and the workers keep running either way.

### What differs from Claude Code

- **Cost shows 0 on subscription and free models.** OpenCode reports a cost of 0 for them, so the stats show tokens only.
- **The lead's tokens.** `/symcc-stats` with no range counts the lead session's whole total, as OpenCode tells it. A ranged one (`7d`, `T-100..T-130`) counts each answer of the lead's session with its own tokens, at the time it finished, if it falls inside the range. OpenCode lists only the answers since the session's last compaction, so after a compaction the tokens from before it have no dates: a ranged call leaves them out and says how many there are ("from before the last compaction, not dated"), next to where the lead's tokens come from. If OpenCode can't list the answers, a ranged call leaves the lead out and says why.
- **No hooks for some things.** symcc doesn't follow OpenCode's Plan agent (there is no plan mode for it to see), it can't open the panel by itself when OpenCode starts (use `/symcc-board`), and it judges a shell command only by its text. Workers can't use OpenCode's `question` tool (nobody watches their sessions to answer it); they use `symcc_ask_owner`, as in Claude Code.
- **Not built yet:** the settings and scouts pages in the panel (use `/symcc-settings` and `/symcc-scout`), and workers as separate `claude -p` or `codex exec` processes.
- **When OpenCode stops.** OpenCode 2.3 lets symcc clean up when its server is stopped normally (also with Ctrl-C or `kill`), so the next start, in OpenCode or in Claude Code, drives the board at once. If it was killed hard or crashed, `.symcc/lead.json` stays behind; the next start then follows until that file is 3 minutes old, and takes over by itself, as after a Claude Code crash.

### How it works inside

- **One copy runs the board.** OpenCode starts the plugin once for each folder a session works in, workers' folders too. Only the copy for the project's main folder runs symcc's engine: it takes the lead (`.symcc/lead.json`, the same lock as in Claude Code), starts the timers and seeds the scouts. The copies in workers' folders only guard. If two copies point at the same real folder (on macOS, `/tmp/...` and `/private/tmp/...`), the first one runs the board and the other takes over when the first is unloaded.
- **Edits are guarded** through OpenCode's permission check, with symcc's usual checks. A tool-call hook stays behind it as a backstop: it reads OpenCode 2.3's own tools that change files (`edit` and `write` with a `path`, `patch` with its patch text, and `shell` with its command and folder), plus a `multiedit` tool if a plugin adds one. So far these refusals are covered by symcc's tests with a stand-in for OpenCode's session API; a check in a real OpenCode run (a worker's folder copy refusing an edit outside its files, and a real `patch` call) comes with T-484.
- **Starting a worker.** symcc makes the session a child of the lead's (the last session in your project folder you typed in), moves it into its task's folder and waits until OpenCode shows it there (a child session first opens in its parent's folder), and only then gives it its prompt, once the board names it, so the guard in that folder knows it. When it ends, symcc reads its final answer and its tokens.
- **The lead** is never a child session or one of symcc's own. symcc remembers it for the project while OpenCode runs, also across plugin reloads. As in Claude Code, reports close together go in one update, your own board actions wait as "Meanwhile" lines, and starting a worker sends nothing. An update sent before you have typed anywhere waits for your first prompt.
- **Tools per session.** Each session is offered only what it may use: a worker only `symcc_ask_owner`, a scout or a checker only `symcc_board` and `symcc_stats`; a call of anything else is refused. The tools are normal OpenCode tools, not hidden in OpenCode's Code Mode. An answer meant only for you is put in the chat without waking the model. Where the TUI part doesn't take `/symcc`, `/symcc-help` leaves out the Claude panel's keys and lines.
- **The panel** runs in OpenCode's TUI, apart from the server part, so it draws from `.symcc/view.json`. It takes Solid and OpenTUI from OpenCode: OpenCode 2.3 swaps the plain names `solid-js` and `@opentui/solid` in a plugin's files for its own copies, so `opencode/tui.ts` writes them out in its `import()` calls (a name kept in a variable isn't swapped and fails with "Cannot find package 'solid-js'"), and `loadTuiRuntime` in `hooks/opencode/tui.ts` gives an error naming the package when one is missing.

The code is in `hooks/opencode/` and `opencode/`; `sh scripts/test-opencode-host.sh` runs its tests (with a stand-in for OpenCode; OpenCode itself is not needed).
