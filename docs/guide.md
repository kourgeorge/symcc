# symcc guide

The full details. For the short version, see the [README](../README.md).

- [The parts and their names](#the-parts-and-their-names)
- [A task's life](#a-tasks-life)
- [What happens when a worker finishes](#what-happens-when-a-worker-finishes)
- [Approval before merge](#approval-before-merge)
- [Investigation tasks](#investigation-tasks)
- [Live status: seeing the board](#live-status-seeing-the-board)
- [Tracing a task back](#tracing-a-task-back)
- [Where to see what a task did](#where-to-see-what-a-task-did)
- [Scouts](#scouts)
- [Task kinds](#task-kinds)
- [Worker roles](#worker-roles)
- [Which branch work goes into](#which-branch-work-goes-into)
- [Keeping work moving on its own](#keeping-work-moving-on-its-own)
- [Stats: time and tokens](#stats-time-and-tokens)
- [Disabling symcc](#disabling-symcc)
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
| **Automatic retries** | Failing tests, or a clash with your branch, send the task back to a new worker (with the failing test output, or told to merge your branch in first), up to `auto_retries` times in all (2 by default) |
| **Test gate** | Your test commands must pass before anything is merged |
| **Approval before merge** | Human-in-the-loop review: modes auto merge, approve merge or paused; see the diff, approve, or reject with a reason; one task can be marked "needs review" |
| **Merge into the target branch** | Commit, scope check, update on the latest target branch, re-run tests, then merge; your branch only moves this way |
| **Live status** | The board panel and the status line |

symcc is proactive while your Claude Code session is open. Work stops when you close it and
picks up again next time.

### Why it is built this way

Each part is there for a reason. Knowing it makes the rest of this guide easier to follow.

- **A lead, so you talk to one place.** Ideas come at any time. The lead takes them without
  stopping the work that is running, turns them into tasks and decides the order. Without it, you
  would split the work, track it and start each agent yourself.
- **Workers, each with its own folder and file list.** Workers run side by side. A separate git
  folder and branch per task keeps them from overwriting each other, and keeps your own branch
  untouched until a merge. The file list (the scope) is what makes the check possible: an edit
  outside it is refused and becomes a question to you, instead of a surprise in the diff.
- **Scouts, so work is found while you are away.** They only read. Anything they find goes to the
  lead as a note, and becomes a task only if the lead adds it, so a scout can never change your
  project by itself.
- **A checker (optional), a second pair of eyes.** A fresh agent that did not write the change
  tries to break it before it reaches the tests. It is off by default because it costs time and
  tokens.
- **One merge queue.** Finished tasks take turns. Only the task at the front catches up with
  your branch, runs the tests and merges, so your branch cannot move in between and the code
  that was tested is exactly the code that merges. Before the queue, several tasks could merge
  into a moving branch at once, and each had to catch up, test again and sometimes clash with the
  others. Now no two merges race and no test run is wasted. One rule covers every way into a
  merge (hand-back, approve, retry), so it is simple to follow and to trust. The cost is waiting:
  see [the queue](#states-stages-and-the-queue).
- **Guards that stop honest mistakes.** symcc refuses a scout's or checker's file edit and git
  writes, and a worker's edit outside its file list. These checks read the command text. They
  catch a worker that makes a mistake. They are not a security boundary and do not stop an agent
  that works around them on purpose.
- **Org-mem goes through the lead.** Agents only suggest notes at the end of a report. The lead
  decides which ones to keep, so the shared file stays short (60 lines at most), free of repeats,
  and free of notes that only matter for one task.
- **Investigations wait for you.** An investigation is a question, and the answer is for you. Even
  in `auto` mode it ends only when you read it and pick Done, Keep as a note or Ask more.

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
   │         └──▶ worker ended its turn with no report while its own
   │              background command still ran ──▶ failed (with a report,
   │              symcc stops the command and checks as usual)
   │
   ├── review   (only in approve merge mode) checks passed; waits for YOUR approve
   │            (merge) or reject with a reason (back to todo, fresh worker)
   ├── waiting  the lead or a worker asked YOU something; your answer sends it
   │            back to work
   ├── paused   stopped on purpose; "resume" sends it back
   ├── dropped  cancelled; stays on the list and never runs on its own;
   │            retry (r on its page, or ask the lead) brings it back to todo
   └── backlog  a parked idea or unclear work; never starts until you move it
                to todo ("move T-5 to todo"); "stash" (z on its page) sends a todo, paused or
                failed task back here
```

| Status | Meaning |
|---|---|
| `todo` | Ready to be picked up (once the tasks it waits for are done) |
| `doing` | A worker is on it right now |
| `waiting` | It needs an answer from you (shown under NEEDS YOU) |
| `review` | Ready for review: the worker is done and the checks passed, but nothing is merged until you approve it. Once you approve, the task leaves NEEDS YOU and shows with the running tasks (prep, queue, test, merge) until the merge ends |
| `paused` | Stopped on purpose, until resumed |
| `failed` | It could not be finished; the lead decides what next. Its page starts with a "Why it failed" block: one plain sentence for the reason (tests failed, the checker found problems, files outside the task, no change, no result, out of time, an API error or refusal, the worker ended its turn before its work finished, could not start, a merge conflict), what the worker's report asks for (a `NEED FILES:` line or a question), and what to do next (Retry, ask the lead in the chat to change the task, or Drop). Its key line lists `r retry` and `x drop`. The board row and the lead's board show the same sentence |
| `done` | Merged into your branch. This is final |
| `dropped` | Cancelled. It never runs on its own; retry brings it back to todo on purpose |
| `backlog` | A parked idea or unclear work. It never starts until you move it to todo. In the board panel it sits in a folded "▸ Backlog  N" row below the active tasks |

### States, stages and the queue

A task has one **state**. While it is `doing`, it also moves through **stages**. Finished tasks
then take turns in **one merge queue**. This section explains all three.

**States: what moves a task on.** What each state means is in the table under
[A task's life](#a-tasks-life). This table adds what changes it next:

| State | What moves it on |
|---|---|
| `backlog` | You (or the lead, on your word) move it to `todo` |
| `todo` | A worker is started: `doing` |
| `doing` | The merge ends: `done`. A failed try: back to `todo`, or `failed` when the retries are used up |
| `paused` | You resume it |
| `waiting` | Your answer, your OK for files, or clearing your files |
| `review` | Approve: it merges. Reject: back to `todo` with your reason |
| `failed` | You retry it, change it, or drop it |
| `done` | Nothing. It is final |
| `dropped` | Retry brings it back to `todo` |

**Old tasks are checked first.** When a worker starts on a task that came from the backlog, or
was written more than a day before, its prompt says when the task was written and lists the
commits that changed the task's files since then (up to 15, newest first, "… N more" after
that; with no files list, the files its details name, or else just how many commits landed).
The worker first checks that the task still fits: the files, functions and lines it names
still exist, the work isn't already done, and nothing that changed clashes with it. If the
task no longer makes sense or needs a clearly different plan, the worker asks you (for
example "drop it" or "do the new plan: …") instead of guessing. Nothing is added for a fresh
task or when no commit changed its files.

**Needs you.** A task is under NEEDS YOU when the next move is yours: it is in `review`,
`waiting` or `failed`, or a running worker asked for more time. A task leaves NEEDS YOU when
you act on it. When you approve a task in review, it leaves NEEDS YOU at once and shows with the
running tasks (as `doing`) until the merge ends. A task waiting for your own files does the same
once you have cleared them and its merge runs.

**Stages: the steps inside `doing`.** Each has an icon:

| Stage | Icon | What happens |
|---|---|---|
| worker | `▶` | The worker changes the code in its own folder |
| prep | `✎` | symcc commits, leaves out secret-looking files and checks the scope |
| checker | `⌕` | A fresh agent tries to break the change. Only with the `checker` setting on |
| queue | `⧗` | The task waits for its turn. Its note says "queue (n)", n being its place (1 = merging now) |
| test | `⊛` | Your test commands run |
| merge | `⇢` | The branch moves forward |

The board row shows the stage icon instead of `▶`, then the time. In Claude Code the band above
the prompt shows the stage's icon, then the time in that stage: `⌕ T-740 8m`, or `⌕ T-740 8m ↺2` from the second try on (`↺` then the try number) (the icon says the stage, so no stage name is written: `⧗ T-741 10s`, not `queue 10s`). One space sits between the parts of a row, on the band and in the Tasks list (`T-740 ⌕ 8m Title`); the states are padded to one width so the titles still line up. A doing task's page names the stage on the state line of its header
(see [The task page and the scout page](#the-task-page-and-the-scout-page)) and has a **Steps** row in Details
for the whole way, such as `worker ✓ → prep ✓ → ● checker → queue → test → merge` (see
[What a task shows on its way to the merge](#what-a-task-shows-on-its-way-to-the-merge)). A task
in review or waiting shows as `doing` while its approve or merge runs.

**The queue.** There is one merge queue for the whole project (all sessions, all target
branches), oldest first. Only the task at the front has its turn. In its turn, in one go, it
catches up with the target branch, runs the tests (skipped when this exact code already passed),
and then merges (or stops in `review` when you want to approve first). Any failure on the way
(a clash, failing tests, out of time) is one normal failed try and uses one of the `auto_retries`.
A hand commit is different: when you commit to the branch yourself during a worker's merge, the
same branch goes back into the queue to catch up, test and merge again (history: "try 2: main
moved by hand; testing again"), at most 2 times per try; only a third move fails the try. The checker runs before the queue, side by side with other checkers,
and never runs the project's tests. The tests run once per try, in the task's turn.

**The cost of one queue.** Tasks wait their turn. When five tasks with 10-minute tests finish
together, the fifth waits about 40 minutes. Testing several tasks together is not built. The
reasons for one queue are in [Why it is built this way](#why-it-is-built-this-way).

**Task dependencies.** The lead sets them. A task's `after` lists the tasks that must be
finished first: it starts only when every one of them is `done` (merged). Any other status
keeps it waiting, also `dropped` or `failed`; then the lead changes or clears its `after`.

**Priority.** Every task has a `priority`, a whole number from -20 to 19 that works like
Unix's nice value: lower runs first. Every new task starts at 0. The lead gives urgent work
-1, -2…, and work that can wait 1, 2… Among the `todo` tasks that are free to start, the
lowest priority goes first (on a tie, the older task: the lower task number). So a -2 task
starts before a -1, a -1 before a 0, and a 0 before a 3. In the lead's board text a
not-finished task with a priority other than 0 shows it in its tag (`[bug · p-1]`, `[p+2]`);
0 shows nothing. (Boards from before kept a
growing `order` number instead; symcc turns it into a priority once, with a backup first:
a task the lead had moved up, order 10 or less, gets -1, every other task 0.)

**Work merged by hand.** Sometimes a task's branch gets merged outside the board. For
example, you or the lead (on your word) merged it after its only failure was the merge tests
timing out. Don't drop such a task: it would count as dropped. Don't retry it either: a new
worker would redo finished work. Mark it as merged instead: press `h` (Already merged) on
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

### Run a task now

A task waits for its turn: for a free agent slot (`max_parallel`), for the tasks it waits on
(its `after` list) and for the board to run (not paused). **Run now** skips the wait for one
task you pick. It is on the page of a task that is to do, paused, failed, dropped or in the
backlog: the `[Run now]` button, or the `e` key (in Claude Code's terminal, VS Code and
OpenCode). In the chat: `/symcc-task T-5 run`, or tell the lead "run T-5 now" (its `run` tool).

- **All slots busy**: it starts anyway and runs one over the limit. The board says so honestly
  (`agents 4/3 busy`). Nothing else starts until the count is back under the limit.
- **It waits on unfinished tasks**: it asks first, "T-5 waits on T-3 (running). Start anyway?",
  with Start anyway and Cancel (Cancel is the default and does nothing). Start anyway starts it
  now without waiting; its `after` list is kept for the record. In the chat:
  `/symcc-task T-5 run anyway`.
- **It shares files with a running task**: it starts, and its page shows a warning line
  naming that task (their changes may clash at the merge).
- **The board is paused**: only this task starts; everything else stays paused.
- **From the backlog**: it moves to `todo` and starts. A failed or dropped one starts as a retry.
- **In plan mode** (Claude Code): nothing starts, so Run now doesn't either. The task stays as
  it is (a backlog task stays in the backlog); run it when plan mode ends.

Its history says `try 1: started now by the owner` (with what it skipped), so the health check
does not report older tasks as "pushed back" because of it. Everything after the start is as
always: the checker, the tests, the merge, and in approve merge mode it still waits for your
review.

### When a worker needs you

A worker that can't go on without a decision from you calls its `ask_owner` tool
(a tool only workers have, since Claude Code gives subagents no way to ask you
directly) with the question and, if it likes, 2 to 6 choices, and then stops. A worker
that tries to edit a file outside its list is refused, and that becomes a file request (see
the scope check under [The way to the merge](#the-way-to-the-merge)). symcc never reads a question or a file request out of what
a worker writes in its hand-back: that text is only its report.

The task does not fail. It goes straight to `waiting` with the question and shows under
NEEDS YOU on the board. With `notify` on, you hear "symcc: T-5 needs you" (or a chime), once per
question, in the session that drives the board. The lead is told too.

The lead answers it itself only when you already clearly said the answer, and then it tells
you what it answered. Otherwise it asks you in the chat, short and plain, with the worker's
options (if any). In Claude Code it uses the chat pop-up (AskUserQuestion) with the same
choices. On a host with no pop-up it writes them as numbered choices in plain text.

You can answer in the pop-up or on the board, whichever comes first. Your answer goes into the
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

Some questions from the lead are not about one task ("raise the version?", "add a scout?",
a settings choice). In the chat they would scroll away. So the lead puts each one on the
board with its `question` tool, with 2 to 6 short choices, and asks it briefly in the chat too. Each gets an id like `Q-3` and is kept in `board.json` (under
`questions`), not in the chat.

- The board list shows **Questions for you (2)** at the top, above the tasks. Enter on one
  opens its page: the question, one button per choice (also on the number keys) and
  **Answer…** for your own words, the same as a waiting task.
- The band above the prompt says **⚠ 2 questions for you: Q-1 …** (one row per question) while
  any is open. With `notify` on you hear "needs you"
  once per question.
- Answer on the board and the question closes and leaves the list (it stays in the file as
  history). The lead gets a board update right away (like a finished task), with a block like
  "The owner answered your question Q-3 (…): Yes. … Act on it.". Answer in the chat instead and the lead closes it with your words. The
  lead can also drop a question that no longer matters.

**Both on the board and in the chat.** Where the host has a chat pop-up for questions
(AskUserQuestion in Claude Code), the lead just asks with the pop-up, and symcc puts each
question on the board by itself:

- A question about a task that waits for you (a worker's question, a file request, more
  time, a review, an answered investigation) has the task's id (T-5) as its header and is
  tied to that task's own board question: no extra `Q-` entry. A task id only mentioned in
  the question's text doesn't tie it. For a worker's question, a file request and a "more
  time?" question the board then shows the lead's wording (alone) in place of symcc's own
  text, on the task page and in NEEDS YOU. Review tasks and answered investigations keep
  symcc's own text. The band also shows the lead's wording for a waiting task's question or
  file request. For a
  worker's own question the lead's choices are the board's buttons (an answer is put into the
  task as that choice's text). For symcc's fixed questions (file request, more time, review) the
  buttons stay symcc's own, since they run board actions. The lead's wording goes away when the
  question is answered or changes.
- Any other question becomes a `Q-` question with the same text and choices (or, when the
  lead already put that exact question on the board, that one is used).

The pop-up says "or answer on the board (Q-3)" under its choices. Whichever you answer first
closes the other:

- Answer on the board and the pop-up closes. The lead reads your board answer as the pop-up's
  answer, with no extra board update.
- Answer in the pop-up and the `Q-` question closes with your answer. For a task, your answer
  goes in as the board's buttons would put it (an answer, more time, Allow or Don't allow,
  Approve, Done, Keep as a note). A reject or "ask more" still needs the lead, which gets your
  reason.
- Close the pop-up without answering and the question stays on the board.
- Turn the pop-up down (reject the tool call, for example to talk it through first) and its
  `Q-` questions are dropped from the board, with the note "dropped: the owner turned the
  question down in the chat". The lead is told which ones, and asks again in the chat if it
  still matters. A task's own question is not dropped: the task keeps waiting for you.

Some edge cases:

- When one pop-up holds several questions and one of them can't go on the board (say a
  free-text one), your board answers are kept but the pop-up stays open for the rest.
- If you type your own words instead of picking, they answer the question when the pop-up has
  only one. With several, the lead is told which board questions are still open.
- The pop-up holds at most 4 choices. A question with more shows the first 3 plus "the rest
  on the board" (or type yours under Other). Picking "the rest on the board" is no answer, so
  the question stays open on the board.
- Workers never get the pop-up.

On a host with no pop-up, the lead puts the question on the board itself and writes the choices
as numbered plain text, plus "or answer on the board". The lead never puts two questions under
the same numbers.

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
- it handed back with no report while one of its own background commands (for example a test
  run it sent to the background) was still running → the task fails ("the worker ended its
  turn before its work finished"), and nothing is checked or merged. If it did write a report,
  symcc stops those commands instead (the history says "stopped N command(s) still running at
  hand-back") and goes on to the steps below as usual. Another agent's command still running
  doesn't count; when symcc can't tell whose a command is, the worker only gets a warning if
  its hand-back says work is still going;
- otherwise it is finished, and its work goes through these steps (an investigation goes to
  review with its answer instead):

How the queue works is in [States, stages and the queue](#states-stages-and-the-queue); why there is one is in [Why it is built this way](#why-it-is-built-this-way).

### The way to the merge

    hand-back (also: approve, "your files are clear", reload)
      → prep: commit, leave out secret-looking files, scope check
      → checker (only if the setting is on; outside the queue, side by side)
      → queue (n)
      → at its turn, in one go:
          catch up with the target branch
          → tests (skipped if this exact code already passed)
          → review (approve merge mode, or the task needs review) or merge
          → tell

    Any failure on the way (checker problems, a clash, failing tests, out of time,
    ran over) = one normal failed try (uses an auto_retry).
    The branch moved by hand, or a reload cut the tests off = the same branch is
    tested again (at most 2 times per try each), not a new try.
    Your own files in the way = the task waits, then merges by itself.

The steps, in this order:

1. **Prep: commit.** symcc commits what the worker changed in its private copy. (Workers are
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
2. **Prep: scope check.** Every task lists the files it may change (its scope). If the worker changed
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
3. **Checker (optional).** With the `checker` setting on, a fresh checker reads the task and its
   changes and tries to break them. It runs outside the queue, side by side with other checkers, and
   runs no project tests. If it finds problems, they go to a new worker as a failed try and the task
   never joins the queue, so no tests run for that try (see [The checker](#the-checker)).
4. **Queue.** The task joins the merge queue and waits for its turn. The queue is kept in
   `.symcc/merge-line.json`; it survives a reload (a task that was in the queue just joins again), and
   a stale entry is cleared by itself, so you never need to edit it. Merges go one at a time.
5. **Catch up.** At its turn, if the target branch has moved since the worker started (another
   task was merged), symcc brings those changes into the task's copy first. If they clash, that
   try failed like failing tests do: it uses one of the `auto_retries`, and the next worker is told
   to merge your branch in first and sort out the clash. When the retries are used up, the task is
   marked `failed` with the clash as its reason.
6. **Tests.** symcc runs your test commands on the combined code, unless this exact code already
   passed them. If they fail, the task goes back to `todo` and the next worker is shown the end of
   the failing output and told to fix it (2 times by itself; then it is marked `failed` for the
   lead). See "Tests run once per try" below.
7. **Review (optional).** In approve merge mode (see below), or when the task has "needs review", the
   task stops here as `review` ("ready for review") with its tests already passed, and nothing is
   merged until you approve. Your approve joins the queue again and merges.
8. **Merge.** Only now does your branch move forward. If you have that branch checked
   out, your files are updated too, but your own work is never overwritten: uncommitted
   changes (staged or not) in files the task doesn't change are simply kept as they are.
   Only your uncommitted changes, untracked or git-ignored files in files the task changes
   hold the merge back. Then the task waits (`waiting`, with a note like "waiting for your
   files on main: README.md; commit or stash them") and the lead is told once. No new
   worker is needed: once you commit, stash or undo those files, the regular check (every
   two minutes) merges it by itself (it is brought up to date, and tested again only if
   the branch moved meanwhile). "retry T-3" (or approve, for a task in review) does that
   merge at once. If the branch moved and the task now clashes or fails its tests, it gets
   a new try as usual. If you commit to the branch by hand while a worker's finished work is
   in its turn, nothing is merged yet: symcc writes "try N: main moved by hand; testing again"
   and puts the same branch back in the queue (catch up, test, merge), at most 2 times per try.
   Only when it moves a third time does the try fail. A merge that waited for your files, or an
   approve, is not tested again this way: the waiting merge gets a new try as usual, and an
   approve stays in review (approve it again).
9. **Tell.** The lead gets one line: merged, or why not (see "What reaches the lead" below). On a Mac you also hear
   "symcc: T-3 done" (and "symcc: T-5 needs you" when a task waits for your answer), starting with
   the project's name so you know which project spoke.

### What a try is

A try is one round of worker work plus what checks it (the checker, the tests and the merge). A new
try starts only when that round is sent back for a real reason: failing tests, a clash with your
branch, a checker that found real problems, your reject, or an answer or change that restarts the
work on purpose.

A restart symcc does itself is not a new try. When the app is reopened, the plugin reloads, another
session takes over driving the board, or an old worker ends with no report, the new worker goes on
with the same try: the try number stays, no retry is used, and it does not count as a failed try in
`/symcc-stats` (a task whose restarted round merges is still "right first try"). Its history says
"try 2: worker restarted after the app was reopened". The try's time runs from its first start to
its end, across the restarts, and its tokens add up over all its workers. A hand-over is a little
different: when driving moves to another session, the try is not counted again, but its time starts
again in the new session. Each worker's time limit always counts from that worker's own start. Only one worker works on
a try: the worker that was stopped by the restart is never taken back for it once a new one starts.

### When something goes wrong

Every failure on the way is one normal failed try, except a hand commit or a reload during the
merge, which first test the same branch again (see the table). A worker's task uses one of the `auto_retries`
and goes back to `todo` (its folder and branch are kept); when they are used up it is marked
`failed` and the lead is told.

| What happened | What you see | What the next try gets |
|---|---|---|
| Checker found problems | A new try; no tests ran | The checker's report |
| Clash while catching up | The clash as the note | A note to merge your branch in first and sort it out |
| Tests failed | The failing tests in the note | The end of the failing output |
| Tests ran out of time | A note that the tests ran out of time after so many minutes, to raise `test_minutes` if they are just slow | The output so far |
| The turn ran over its limit | "ran over 15 min and was stopped; nothing was merged" | A fresh try on the kept folder |
| The branch moved by hand during the turn | "try N: main moved by hand; testing again" in the history | Nothing at first: the same branch is tested and merged again, at most 2 times per try; a third move gives "main moved during the merge (someone committed to it by hand), so nothing was merged" and a fresh try |
| A reload cut off the tests or the merge | "try N: tests cut off by a reload; testing again" in the history | Nothing: the same branch is tested and merged again, at most 2 times per try (not a new try) |
| Your files are in the way of the merge | The task waits (`waiting`) with the file names | Nothing: it merges by itself once they are clear |

An approve that fails (failing tests, out of time, ran over, branch moved) is not a try: the task
stays in review with a note, and you approve it again. If a given-up step still ends later and its
work did reach the branch after all, the task is marked done with that commit (when nothing else
happened to it meanwhile), or the lead is told it landed.

### Time limits

| Limit | Value |
|---|---|
| One test command | `test_minutes` (10 by default; raise it for a slow suite, e.g. "set test_minutes to 20") |
| The whole turn (catch up, tests, merge) | `test_minutes` for each test command (at least one; counted from `test_commands` or `docs_test_commands`, whichever list is longer) plus 5 minutes for git and the board: 15 minutes with one command by default, 35 with three |
| Waiting in the queue | Does not count: the limit starts at the task's own turn, so each task has its own limit and the queue keeps moving |
| A stale queue entry (left by a session that died) | Older than twice `test_minutes`: cleared by itself |

### What a task shows on its way to the merge

Every board view (the board list, the band above
the prompt, the VS Code list and task page, the OpenCode board and the lead's text board) shows
the same small set of words and notes. While it waits for its turn its note says "queue (n)",
n being its place (the task merging now is 1), and its row shows `⧗` in place of `▶`. During its
turn the row shows the step's icon in place of `▶`, then the time: `⌕ 5m`, not `▶ checker 5m`.
The step's word stays in the note and on the task page; the lead's text board shows both ("⊛
doing test · title"). Legend: `▶` working · `⧗` queue · `✎` prep · `⊛` test · `⌕` checker ·
`⇢` merge.

A doing task's page (terminal, VS Code and OpenCode) names its
state, its step and the total work time on the state line of its header (see [the task page
and the scout page](#the-task-page-and-the-scout-page)): `▶ doing · worker · ⏱ 15m`,
`▶ doing · prep`, `▶ doing · checker · ⏱ 5m`, `▶ doing · queue (2)`, `▶ doing · test · ⏱ 9m`,
`▶ doing · merge`. Other tasks show their status (`○ to do`, `◆ ready for review`, ...). In
Details, a **Steps** row shows the
whole way to the merge, the steps done marked ✓, the current one bold with ●, the later ones
dim: `worker ✓ → prep ✓ → ● checker → queue → test → merge`. `checker` is there only when the
checker setting is on (or a checker ran on this try); `review` comes after `test` when the task
will wait for your review (any mode but auto, or the task's "needs review"). A task in review
shows every step before review done (`… → test ✓ → ● review → merge`), a done task every step
done. Investigations have no Steps row (nothing is merged).

- `✎ prep`: symcc's own step before the queue (steps 1 and 2: commit, leave out secret-looking
  files, scope check). Its note says "preparing to merge: committing and checking files". No
  agent runs in this step.
- `⌕ checker`: a checker agent is trying to break the change (only with the `checker` setting
  on; with it off no task ever shows this step). It comes right after `prep`, before the task
  joins the merge queue. Its note says "a checker agent is trying to break it before it merges".
- `⊛ test`: the test commands run. Its note says "running the tests".
- `⇢ merge`: the task is brought up to date with the target branch and merged. Its note says
  "merging".

Once the turn is over, the note says how it went: merged (the task is done), failed with the
reason (tests failed, a clash, out of time, ...), waiting for your files, or in review.

> **Set a test command.** With no test command, step 6 is skipped and any change
> that passes the scope check is merged. Say "set the test command to …" to the lead.

### Tests run once per try

The full test commands run once per try, by symcc, during the task's turn in the merge queue
(step 6), and not even then when the same code, with the same commands, already passed (see
`passed-trees.json` in the board folder). As only the task at the front of the queue merges, a
try never needs a second test run because another merge came first.
The worker is told the commands, but while it works it runs only the tests for the
files it changed (one test file, say) and a cheap type check if the project has one; it does
not run the full commands at the end, as symcc does that and sends it the output if any
fail. The checker never runs the project's own test files or test commands: it runs before
the task joins the merge queue, and is told the tests run there, once, after it. It reads the
task and the diff and checks the change with its own throwaway probe tests (in `.scratch/` or
`/tmp`). A worker that skips the full run may now and then hand back work that fails symcc's
run; that costs one new try, with the failing output.

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

### How the lead talks to you

The lead's guide (given to it on every request, in Claude Code and in OpenCode) has fixed short
shapes for its replies, so they read like a team lead talking about the board. The first line
always says what happened ("T-743 merged", not "Good news: …").

- **A board update:** one line per task, with a mark and what it means in a few words:

      ✓ T-743  merged (b089022)    a reopen keeps the same try
      ▶ T-745  started             catch up with main before each try

  The marks: ✓ merged, ✗ failed, ↺ sent back / retrying, ▶ started, ⌕ checker, ◐ needs your
  review. Then, only if something needs you, one line saying what.
- **Routine news** (a worker, checker or scout started, a retry on its own, nothing to do): one
  short line at most, e.g. "▶ T-751 retrying (2/4)." Each board update symcc sends the lead
  reminds it of this. An update that holds only "Starting ..." lines (sent just to let symcc start
  an agent) says "No reply needed; end the turn without a message." instead.
- **How agents get started (Claude Code):** Claude Code only keeps symcc's guards for an agent
  started inside a turn hook. So when work waits and the lead is idle, symcc starts a tiny hidden
  helper agent (`symcc:starter`, haiku, no tools, never on the board or in the stats); its end is
  the hook that starts the waiting agents, so the lead is not woken and does not re-read its
  whole chat. If the helper can't start, or does not finish within 60 seconds, symcc wakes the
  lead with the short "Starting ..." update above instead. Claude Code also sends the helper's
  "OK" to the lead's chat like an agent's hand-back, which would wake the lead; symcc drops that
  one message (a `prompt.submit` hook, matched on the helper's name). To avoid even that dropped
  line, symcc stops the helper right after it starts (the TaskStop tool); its end still starts
  the waiting agents, and the drop stays as a fallback if the stop comes too late. Workers', checkers'
  and scouts' hand-backs still arrive. OpenCode and the Node client start
  agents at once and need none of this.
- **A new task:** "Added T-n  <short title>", then one line for what waits on what, if anything.
- **A question for you:** the question in one sentence, the choices numbered, then "(or answer on
  the board)". In Claude Code it is the AskUserQuestion pop-up, as before.
- **A worker's or checker's report:** at most 3 short bullets of what matters to you (what
  changed for you, any limit or risk), not the list of files.
- **When you ask how, why or what it thinks:** the normal style, plain English and short
  sentences, with a table or a sketch when it helps.

---

## Approval before merge

The board has one mode, set with `/symcc-mode`, `/symcc-settings mode …` or by telling the lead (the setting `mode`):

- **`paused`**: every running worker and scout stops at once and nothing new starts. Tasks
  already in review can still be approved or rejected.
- **`review`** (shown as **approve merge**): work runs; every finished task that passes waits as `review` for you.
  The lead also asks you before it adds any task (yours, a scout's finding, a worker's
  report or its own idea): it says what the task would be in a line or two and adds it
  only after your yes.
- **`auto`** (shown as **auto merge**; the default): work runs; a task that passes the steps up to the tests is merged at
  once (see [The way to the merge](#the-way-to-the-merge)).

Going from `paused` to `review` or `auto` starts work again. In `auto` you can still mark one
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

Approve, reject and the diff only work on a task in `review`. Switching back to `auto` does not
merge tasks already waiting; approve or reject each of them.

You can also do it yourself:

- **In the board panel**, tasks ready for review are listed near the top. Open one to see
  the files it changed with `+`/`-` line counts, and its folder (edit files there, then
  approve). Press `d` (Show changes) for the whole
  diff, or pick a file for just that file's diff, with added lines in green and removed
  lines in red. `a` approves, `x` rejects (it asks for a short reason first), `b` goes back.
  A very long diff is cut, with a note like `… 340 more lines (see /symcc-diff T-5)`.
- The banner shows the mode: `⏵ auto merge` (finished tasks that pass merge on their own),
  `⏸ approve merge` (finished tasks wait for your approve or reject) or `⏸ paused` (no work runs).
  Press `m` to switch between `approve merge` and `auto merge` (`m` never pauses the board).
- In any open task, `n` turns that task's own "needs review" on or off.
- **Slash commands:** `/symcc-approve T-5`, `/symcc-reject T-5 <reason>`,
  `/symcc-diff T-5` (the changed files with `+`/`-` counts) or `/symcc-diff T-5 <file>`
  (that file's full diff), and `/symcc-mode [paused|review|auto]` (with no word it switches
  between `review` and `auto`; from `paused` it goes to `review`).
- The status line (the `symcc` line under the prompt) has the board's facts, as plain text:
  the mode (`⏸ paused`, `⏸ approve merge` or `⏵ auto merge`), who drives (`drives here`, or
  in a window that follows `follows (driver active 3 min ago) · /symcc-drive`), the branch, the next scout and when, today's merged tasks
  and today's cost, e.g.
  `⏵ auto merge · drives here · main · next scout bugs in 38m · today ✓ 58 · $312`.
  It has no task counts and no task ids: the band above the prompt shows the work. It is kept
  to about 80 columns: when it is too long, parts go from the end (the cost, then today, the
  scout, the branch); the mode and who drives always stay. The "next scout" time is redrawn
  every minute. With an empty board and no scouts it shows nothing in `auto`, so a fresh
  project stays quiet.
- A warning about git or a data file near the 4 MB limit comes right after the mode and is
  never dropped; on a narrow line the size warning is short, e.g.
  `board.json 3.8 MB, near the 4 MB limit`.
- symcc adds no `⚠` of its own: Claude Code draws one in front of every plugin's status line,
  and the band above the prompt shows what needs you in the warning color.

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
   - **Done** ("T-5 is done", tool `symcc approve`; on the Claude Code board a button with
     no letter key, so a word typed while a box is open can't press it; `a` in OpenCode): the task ends `done` with the note
     "answered". Nothing is merged; its folder is removed, and its branch too, unless it
     has commits from earlier tries: then the branch is kept (the reply says so).
   - **Keep as a note** (a button with no key on the Claude Code board, `v` in OpenCode; tool `symcc approve` with `keep_note: true`): Done, plus a
     new small docs task that writes the answer to `docs/research/<topic>.md`. That task is
     a normal change: tested and merged as usual.
   - **Ask more** (`x`, tool `symcc reject` with your follow-up question; in the lead's
     pop-up, only an answer written `Ask more: <your question>` sends it back, any other
     "Ask more" answer leaves it in review and the lead asks you for the question): the task goes
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
  - `status:done` (or `status:open`, or several: `status:done,dropped`), `kind:bug`,
    `role:tester`.
  - `waits-on:T-3`: the tasks that wait for T-3, directly or through a chain (T-5 waits for
    T-4, which waits for T-3).
  - `blocks:T-3`: what T-3 still waits for: the tasks on its chain that are not done (a dropped
    one too, since T-3 still can't start). A done task ends the chain there.
  - `stuck`: to-do tasks that can't start because something they wait for (directly or through
    a chain) is failed, paused, waiting for you, dropped, or missing from the board. A done
    task that was archived counts as done here, not missing.
  These mix too: `waits-on:T-3 status:todo`, `stuck kind:bug`; `waits-on:T-3,T-4` takes either.
  A word like `foo:bar` that is not one of these is looked for as a plain word. The lead's
  board tool also takes `limit` and `sort` (`newest` or `order`: what runs next first, by priority), the same as `last:` and
  `top:`, and says how many matched in all (`10 of 37 matching shown`).
- The panel has four views, Live, Tasks, Scouts and Settings, shown as tabs under the banner:
  `[l]: Live │ [t]: Tasks (12) │ [s]: Scouts (3) │ [c]: Settings`, the open one bold, blue and
  underlined (on a narrow panel the tabs get shorter, `[l] Live│[t] Tasks (12)…`, never cut).
  The board opens on Live. Press `l`, `t`, `s` or `c` (or click a tab) to switch.
  The header (the banner with its tests/limits line and drive warning, then the tabs) shows
  only on the list pages: Tasks, Live, Scouts, Settings, and Settings' Roles, Kinds and
  Organizational memory lists. A page of one thing (a task, a question, a scout or one of its
  runs, a role, a kind, a role's prompt) starts with its own title instead; its buttons and the
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
- The Settings view (`c`, or `/symcc-settings`) has one row per setting: its name, value,
  default, allowed range and what it means. The rows are grouped under short headings:
  - **Work**: `mode`, `max_parallel`, `max_minutes`, `auto_retries`, `enabled`
  - **Checks before merging**: `test_commands`, `docs_test_commands` (shell commands, like
    `test_commands` and up to 5, none by default; they run instead of `test_commands` when a
    task of a prose-only role, `code: false`, changed only prose; see
    [Worker roles](#worker-roles)), `test_minutes` (how many minutes each test
    command may run before merging, a whole number from 1 to 120, 10 by default; any other value
    is refused), `tests_with_changes`, `checker`
  - **Workers**: the **Roles** and **Kinds** rows (org-mem is on the Live tab, see
    [Organizational memory](#organizational-memory-org-mem))
  - **Scouts**: `scout_findings`
  - **Board and alerts**: `notify`, `open_on_start`, `archive_days`

  Each heading is a group you open and close with Enter (→/← do not, since the panel's
  buttons only get Enter and letter or digit keys). When the page opens, all groups
  are closed and the first heading has the focus; a closed group shows its values in short
  on its heading line, e.g. `▸ Work · auto merge · 3 at once · 45 min · 2 retries`, and an open
  one shows `▾ Work` with its rows under it. ↑↓ go over the headings and the rows of open
  groups only. The panel remembers which groups are open until the session ends. The lead's
  `settings` tool and `/symcc-settings` text always list every setting under the same
  headings. Enter on a row changes it: `open_on_start`,
  `checker` and `enabled` flip on/off; `mode`, `notify`, `scout_findings` and `tests_with_changes` open a pick list (paused / approve merge
  / auto merge; only the notify choices this computer can play; off / ask / review); numbers and `test_commands` open an edit box (the typed line is one
  command, run as one shell line, so `cd web && npm test` works as in a shell; several commands go in a list,
  `["npm test", "npm run lint"]`, up to 5; `none` clears them). Enter on an empty box or Cancel (`x`) cancels; Back (`b`) goes to the Tasks list. Saving uses the same checks and limits as
  telling the lead, and a toast says what changed, e.g. `max_parallel set to 5`. A value
  over its limit is cut to it and the toast says so.
- Under **Workers**, the **Roles** row says how many worker roles there are (e.g.
  `6 roles · 1 off`). Enter (or a click) on it opens the **Roles** page, a table with one
  line per role:

  ```
  ▍Roles  8 roles · 2 changed by you
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
  [Worker roles](#worker-roles)), and a toast says what changed.
- Typed form: `/symcc-settings max_parallel 5`, `/symcc-settings notify sound 2`,
  `/symcc-settings mode review`, `/symcc-settings test_commands "npm test"`. A wrong name
  or value says why, e.g. `max_parallel must be a whole number, 1-8`.
- `notify` is `voice` ("symcc: T-3 done", "my app: T-5 needs you" out loud: the project folder's name comes
  first, with dashes, underscores and dots said as spaces, and only its first three words when it is long),
  `sound 1`, `sound 2` or `sound 3` (a short chime from that sound set), or `off`. A new board uses `voice` where
  this computer can speak, else `sound N` with N picked from the project folder's name, else `off`.
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
  `r` retry, `m` switch approve merge / auto merge, `f` search the tasks, `n` needs review, `1`-`9` a try's report on the task
  page, `k` / `j` the previous / next task or scout on its page, `t` / `l` / `s` / `c` switch views, `b` back.
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
   bold. A long title wraps, indented under itself.
3. **The state**: the status mark and word in its color, and for a running task its step and
   its work time; then kind · role · try n/m (n of the tries it may get, its automatic retries
   counted); then where it came from (`♟ from you`, `⌕ scout bugs`, `◆ lead`, `↳ from T-5`,
   `▸ from T-5` for a worker's report); then its note, dim, when it has one. There are no
   Status, Stage or Now rows in Details any more: Details starts with the **Steps** row (the
   way to the merge) and the **Added** row (when it was added and last changed).
4. **The buttons**, in groups, with words only (their keys are in the key line at the bottom,
   never inside a button). Every button looks the same: `[Label]`, in the normal text color.
   The order of the groups and the gaps between them say what is what: first the one next
   step (Pause, Approve, Retry, Resume, Merge now, Move to todo or Done; none while the task
   asks you something); then the other task actions (Role, Watch worker, Show changes, Run now,
   Stash to backlog, Already merged, Keep as a note, Ask more); then, set apart, the ones that throw
   work away (Reject, Drop); then, at the end, the page's own: `[☐ Needs review]` (a checkbox:
   `n` turns it on, `[☑ Needs review]`, and off) and `[Copy]` (`y`).

Further down, under ▍Report, the buttons that show an earlier try's report look the same:
`[Try 1] [Try 2] [● Try 3]` (● the one shown); their keys, `1`-`9`, are in the key line
(`1-3 a try's report`), not in the buttons. On the desktop and mobile apps these and the boxes'
Cancel buttons are the app's own buttons, labelled `Try 1` and `Cancel` with no brackets, as
the header's buttons there.

On a narrow panel lines 3 and 4 wrap between their groups, never inside a button; a group wider
than the panel wraps between its buttons, and with no room left the page group goes to its own
line. In OpenCode the header stays at the top while the rest of the page scrolls under it; in
Claude Code the panel scrolls as a whole (it has no fixed area), so the header is the top of the
page. The key line keeps every key it had, plus `k j prev/next` (`[ ] prev/next` in OpenCode)
when the list has more than one.

#### The Runs section

The last section of a task's page sums the task's own tries in its heading, and lists each try
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
`‹ 2 of 6 ›` pager, the title as a heading, the state as small chips (the status one filled in
its color), the buttons (in one style, no red; the one main action, the first of line 4's
first group, is VS Code's primary button; needs review is a button too), then a divider.

#### The Branch section

Under **▍Details**, a task that has a branch shows it against the branch it merges into, in the
same look as the Live tab's `BRANCHES` section:

```
▍Branch  symcc/T-733 · 3 commits · 10 behind main
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
Each lane shows the path that task really takes: a normal code task goes `work → check → queue → tests → merged` (`check` only
when the checker setting is on); an investigation goes `work → answer` only (no check, queue, tests or merge) and leaves the lanes when
it hands back, then waits under NEEDS YOU as "answer to read"; a docs-only change shows `check` as a dim `–` once it has handed
back and symcc has seen that its commit changed only docs files (the checker skips it; the dash stays until it merges, also
while it waits at `you`); a task that needs review (it has "needs review" on, or the board is in approve-merge mode) has a
`you` station before `merged`, and its lane stays at `you` while it waits for you and goes on to `merged` when you approve. Lanes
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

                       work✧    check✧   queue    tests    merged
 ▶ T-684 /symcc-doc…   ●━━━━━━━━●━━━━━━━━◉────────○────────○      #2
   change try 2/3 · ⏱ 24m · ⌀ 1.1M (0.9× median) · <worker 812.4k · checker 287.6k> · ⌕×1
```

- `NEEDS YOU` is the first section, shown only while something waits for you, and hidden (no
  heading, no empty line) otherwise. One row each, in the warning color: the open board questions
  (`Q-n` and their text), then the tasks that wait for you (a worker's question, a file request,
  more time), the tasks ready for review and the answered investigations to read. It is the same
  list as the band above the prompt and the board's NEEDS YOU. Enter (or a click) on a row opens
  that task's page or the question; the rows are the first stops of the arrow keys. Rows are cut
  to fit the panel.
- Lanes are in the order the tasks started their current try, so a new one joins at the bottom
  and the lanes don't jump around. Each starts with `▶ `, then the task id and its title (cut
  with `…`, wider on a wider panel). The `▶ ` and the id are bold in the accent color and the
  title is normal text, so the running tasks stand out from the waiting ones below them (those
  are all dim).
- The stations are work → check → queue → tests → merged; check is left out when the
  `checker` setting is off (its prep step then counts as work). Passed stations are `●━━`, the
  ones ahead `──○`, and the current one blinks between `◉` and `◎` (Claude Code doesn't tell
  plugins about reduced motion, so it always blinks; the tab redraws itself every second while
  it is shown). The `✧` after work and check (in the headings' color) means an agent works there, so
  those stations need an agent slot (a worker or a checker); the legend, the very last lines of the tab, below the footer's key line (right under it, no divider line), says
  `✧ = an agent works here (needs an agent slot) · ⌀ = tokens`; queue and tests use none, so there can be more lanes than
  `max_parallel`. It never sits under the task rows. When the page is shorter than the screen (the panel in VS Code), the
  empty room goes between the content and the footer. On a narrow screen the legend is cut at spaces onto more lines, never wider than the screen, still under the key line.
- On the right: the time at the current station, or the place in the merge queue (`#2`).
- The second row has no bar, only numbers about this task:
  `bug try 4/4 · ⏱ 41m · ⌀ 7.3M (7.6× median) · <worker 5.4M · checker 1.9M> · ⌕×2`. That is
  the kind and the try (`try 2/3`, auto retries after failing tests included), the task's working
  time so far (all tries; time when Claude Code was closed is left out), the whole task's tokens
  (every try so far), how many times the board's median tokens per merged task that is (yellow
  from twice the median), how its tokens split between its workers and checkers, together in
  `< >` (a part that is 0 is left out, and there is no `< >` when there is nothing to split), and
  `⌕×N` for the checker's send-backs (`⌕` is the checker's mark; on a task row, `↺` with a number is the try). On a narrow panel the parts go in this order: first the
  `< >` split, then `(× median)`, then the kind, then `⌀`, and the clock `⏱` last; the try stays. A
  running worker's tokens are only known when it hands back, so until then the row shows the
  earlier tries' sum with `+ …` (`⌀ 4.0M + …`), or `⌀ at hand-back` on a first try.
- **Signs on the boards:** `⌀` = tokens (a count has `⌀` in front: `⌀ 716.1k`; the legend at the bottom of the Live tab, below the footer, says so, and with no lane the same dim note, `⌀ = tokens`, ends TODAY). `avg` marks an average (`avg ⌀ 2M/task`). Task pages (the agent lines, the Tries summary's checker part) use it too. `/symcc-stats` and its HTML page keep the word "tokens".
- Just merged: a task that merged in the last 10 minutes keeps its lane for a while, under the
  running ones, drawn as finished: the track filled up to `merged` with `✓` there (green), a dim `✓ `
  where a running lane has `▶ `, the id in the accent color, the title and second row dim, and `merged 3m ago` on the right (`3m ago` on a narrow panel).
  At most 3 such lanes show, newest first; after 10 minutes, or when a 4th task merges, the oldest
  goes. Only merged tasks get one: answered investigations,
  failed or dropped tasks don't. Enter (or a click) on a finished lane opens its task page.

  ```
   ▶ T-760 A running one ●━━━━━━━━◉────────○────────○────────○      2m
     change try 1/3 · ⏱ 2m · ⌀ at hand-back
   ✓ T-747 Live tab: e…  ●━━━━━━━━●━━━━━━━━●━━━━━━━━●━━━━━━━━✓  merged 3m ago
     change try 1/3 · ⏱ 38m · ⌀ 5.7M (4.6× median) · <worker 4.1M · checker 1.6M>
  ```
- Waiting trains: a todo task that waits (its `after`) for a task that has not finished hangs
  under the lane of the running task it waits for, indented with `└─◇`, its id and cut title,
  then `waits`. The waiting train's id is in the accent color (orange) and the rest of the row
  is dim gray. Topic labels in the organizational memory rows and topic grid are blue:

  ```
   ▶ T-712 Scout or… ●━━━━━━◉──────○──────○──────○  2m
     bug try 1/3 · ⏱ 2m · ⌀ at hand-back
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
  branch yet) the section isn't shown. VS Code draws it with real lines, and OpenCode shows the
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
   ⌀ ░█████████████▓▒ lead 3% · workers 84% · checkers 8% · scouts 5%
   avg ⌀ 2.8M/task · 9m work · 23m start-to-merge   first try 34% · avg 2.4 tries/task   ⌕ 68 sent back by the checker
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
  when the sparkline itself is too wide, neighbouring hours are merged (2, 3 or 4 to a bar) so the whole day still fits. The two dim lines under them compare with earlier days, counted the same way: `yesterday` is the calendar day before today, `last 7 days` the seven days before today added up (today left out). Each says the tasks merged, the tries' tokens (`⌀`) and the worker time (`⏱`, closed-app time left out); a part that is 0 is left out, and so is a line with nothing. On a narrow panel `⏱` goes first, then `⌀`. Nothing goes past the panel's width. The task that starts next shows in the band above the
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

                                           work✧    check✧   queue    tests    merged
    ✓ T-922 Under DAM: the lead posts bo…  ●━━━━━━━━●━━━━━━━━●━━━━━━━━●━━━━━━━━✓   merged 3m ago
    ```

    An empty line keeps these lines apart from the just-merged tasks under them. When the board
    runs out of work like this, the lead also names 2-3 backlog items worth moving to todo (bugs
    and safety first), so you can pick.
  - a brand-new board: `No tasks yet. Tell the lead what you want built.`
- At the bottom, just above the key hints of the Live tab, the **Organizational memory** section (see
  [Organizational memory](#organizational-memory-org-mem)):

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

### In VS Code

In the Claude Code extension's side panel, letter keys and ↑↓ do nothing: you click a button
(or Tab to it and press Enter). So the board there has its own layout; the terminal's is
unchanged.

- **Header**: the symcc logo (the clef, in the accent color) with one line beside it: the
  name, version and folder, then the board mode as a small colored pill (`⏵ auto merge`).
  When another window drives the board, one notice row with a yellow border says so
  ("⚠ this window follows; /symcc-drive to drive from here"); click `/symcc-drive` to drive
  from this window. Under it the counts (`● 2 doing · ● 6 to do · ● 1 waiting for you`), each
  dot in its status color. Every line wraps, never cut. The setup facts (what the mode
  means, the branch, the tests and limits) are in the Live tab's **Status** section.
- **Tabs**: a tab bar like VS Code's own panel tabs: `Live`, `Tasks [20]`, `Scouts [1]`,
  `Settings`, the counts as small rounded badges. The tab shown is in the normal text color
  with a short accent bar under it; the others are dim and brighten under the pointer. Click
  a tab to switch.
- **Live tab**: in sections like VS Code's side bar. Each section has a small bold UPPERCASE
  heading with a chevron (`▾` open, `▸` folded); click it to fold or open the section (the
  board remembers it while the session lasts). A count badge sits on the right where the
  section has one. No divider lines and no blank rows.
  - **Status**: Mode (`⏵ auto merge · agents 0/3 busy`, with what the mode means and a quiet
    `Switch to …` button; running scouts are named at its end and open the Scouts tab),
    Branch (and which window drives), Tests (short, then the time limit and retries).
  - **Tasks** `[17 backlog]`: what needs you first, then the running lanes (as the terminal's,
    drawn with real lines) and the key to their marks. When nothing runs it says why; when
    all is done: "✓ All done · last merged T-93 20h ago", then **Up next from the backlog**
    with the first 3 backlog tasks (each opens its page) and "14 more in the backlog" (opens
    the Tasks tab with Backlog open). The main button, `Tell the lead what to do next`, puts
    "Next task: " in the prompt box.
  - **Branches**: as in the terminal, drawn with real lines.
  - **Today**: label and value rows: Results (`✓ 0 merged · ↺ 0 sent back · ✗ 0 failed`, in
    green, yellow and red), Tokens (all of today's, then who spent them), Agent time (and the
    cost when known), Per task, Hours (the day's token bars and the busiest hour), Yesterday,
    and 7 days.
  - **Organizational memory** `[2 / 60]`: folded at first, with a quiet `All notes` button on
    its heading. Open, it lists the newest notes one row each (the date, the text cut short,
    the topic dim; click a note to open all notes on it), then the topics with their counts.
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
- **Footer**: a `Switch to approve merge` (or `Switch to auto merge`) button and a search box that
  filters as you type, with `Clear search` while a search is on. No key hints; other pages
  say "Click a button, or Tab to it and press Enter." and their buttons drop the key marks
  (`Back`, not `Back (b)`).
- **A task's page** reads like a card. It uses the whole panel width and wraps every line,
  never cutting it with "…". From the top: the page header (see [the task page and the scout
  page](#the-task-page-and-the-scout-page)): `‹` and a `Tasks` button back to the list, the
  `‹ 2 of 6 ›` pager, the task ID and title as a heading, the state as small chips (`◆ answered:
  read it`, in green, for an answered investigation), the action buttons in their groups (one
  style, no red; the one main action, such as `Approve`, `Retry` or `Pause`, is the primary
  button; needs review a button too), then a divider. A scout's page does the same: `Run now`
  is its primary button.
  What needs you comes next, in a box in its color: the **Question for you** (yellow) with its
  answers as buttons and a box for your own answer (a file request has `Allow files` and
  `Don't allow`); **Why it failed** (red); **Waiting for your files** (yellow).
  Then the sections, each under a clear heading: **Details**, the same labelled rows as the
  terminal and OpenCode task pages (Steps, Added, Role, Kind, From, Why, Files, Into,
  After, …, Tries) as a label and value list that wraps, each task it waits for a link that
  opens it; the **Branch** (the task's branch against main, as on the terminal, in the
  monospaced font); the **Answer** of an investigation; **What to do** (the details, drawn as
  Markdown); the **Changes** of a task in review; **History**, a timeline with the newest
  first (a mark on one line down the left, when it happened, then the whole line; merges in
  green, failures in red), the newest 10 with `Show all` for the rest; and the latest
  **Report** as Markdown: its first lines, with `Show all` for the rest and a button for each
  try. Last comes one fold, closed until you click it, with the sum of the tries (as the Runs
  heading on the terminal): `▸ Time and cost 2 tries · 40m · 11.6k tokens`.
- **Scouts**: one row per scout, with the same parts in the same order as the terminal list:
  its icon, its name (a link that opens it), how often it runs, its state (`running now`,
  `paused`, `next in 3h`, `on demand`), `last:` with the start of its last report
  (`last: found 2: …`, `last: nothing`) and its model. A row never wraps: its end is cut with
  "…" to fit. Under the list: `+ New scout` and `← Tasks`. With no scouts yet, a short how-to
  in a box and `+ New scout` as the main button.
- **A scout's page**: the page header: `‹` and a `Scouts` button, and the pager; the name and its
  summary; when it runs, the next run, its model and the last run as chips; buttons `Run now`
  (not while it runs), `Edit`, and `Pause` or `Resume` (`⏸ paused` beside it while paused);
  then its **Instructions** as Markdown, its **File**, and its **Runs**; open a run to read its report.
- **Settings**: every group is a heading (Work, Checks before merging, Workers, Scouts, Board
  and alerts) with its settings under it, each on its own row with its value. A setting with
  a fixed set of choices (mode, notify, checker, scout_findings, tests_with_changes,
  open_on_start, enabled) is a drop-down: pick a value and it is saved at once. Numbers and the
  test commands are boxes: type and press `Save` (a wrong value says why and saves nothing; an
  empty test commands box clears them). Under each row, a dim line says the default and what
  the setting does. Roles and Kinds are buttons that open their pages. No key hints.

---

## Tracing a task back

Every task records who made it, why, and the words that started it.

Open the board with `/symcc`, or one task with `/symcc-task T-3`. The `from:` line says, for
example, `from: owner — “add a search command…”` or `from: scout bugs`. The history lists each try.

Every merge commit starts with the task ID. So `git log --grep "T-3"` finds the work for a
task, and the ID on a commit takes you back to the task and your request.

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
- **The history**: each step a try goes into (prep, checker, queue, test, merge) gets a
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

Open a run to read its whole report. In VS Code's side panel each run is a button, and
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

### The checker

The `checker` setting is `off` by default. Turn it on with `/symcc-settings checker on` (or tell
the lead "turn on the checker"). Then, when a worker hands back and symcc's prep step passes
(commit, scope and secret check), a fresh checker (the built-in `checker` role) starts in the
task's folder, before the task joins the merge queue. Checkers of several tasks run side by side.
It cannot edit files. It reads the task and the diff and tries to break the change with its own
throwaway probes, for example by running it with odd input. It never runs the project's own
tests: they run once, in the merge queue, after it.

The checker may only read with git. Any git command that changes something (commit, checkout,
switch, reset, stash, branch or tag changes, merge, rebase, push and so on) is refused, and so are
read-only commands with options or settings that write files or run programs (such as
`git diff --output=...` or `-c` settings that run a program). This check works on the command text and
is a best effort, not a sandbox: git run through a variable, a script or other shell tricks can still
get through. There is no sandbox yet.

**Scratch repositories in /tmp.** Workers and checkers may still run git writes (`git init`,
`add`, `commit`, `merge`...) in a throwaway repository under `/tmp` (or the system temp folder
under `/var/folders/...`). Every folder the command acts in must be a plain literal path:
`git init /tmp/x`, `git -C /tmp/x commit -m m`, `cd /tmp/x && git commit -am m` (the `cd` joined
by `&&`).

A git write aimed at the project, `.symcc/` or any worktree, or at a folder that can't be
told from the text (`$TMPDIR`, `$d`, `$(mktemp -d)`, `~`, `..`, a glob, no `-C` or `cd` while the
shell is not in the temp folder, a `cd` with a word before it such as `builtin cd`), stays refused,
and so does `--global` or `--system` or a shortening of them (the owner's own git settings), a
`config -f` file outside the scratch folder, and any word with a space after the git command (a
command given in quotes, as in `rebase -x '...'`; the message of `commit`, `tag`, `merge`, `notes`
or `stash -m` and `--author=` are fine); scouts stay read-only.

This rule stops honest mistakes; it is not a security boundary: anything that needs a deliberate shell trick (`eval`, a script file,
`sh -c` variants, symbolic links inside `.git`, files the same line writes, git hooks or settings)
is the accepted risk and is not checked further.

Separately, when symcc stops an agent process it started earlier (after a reload or a crash),
it first checks that the process is still that agent (same program, started at about the
recorded time). A process that took over a reused number is never stopped.

- **OK:** the task joins the merge queue: catch up, tests, then review or merge, once.
- **Problems found:** the checker's report goes to a new worker, like a failed test run. It counts
  as one of the `auto_retries`. The task never joins the merge queue, so no tests run for that try.
- **No answer** (the checker was stopped, ran longer than `max_minutes`, or could not start): the
  task joins the merge queue for its tests, and then waits for your review instead of merging.
- After a reload while a checker ran, the task gets a new checker on the same work (no retry
  counted), and then joins the queue as above.
- **Skipped** for investigations and for changes that touch only prose or media. Only these count:
  `README`, `CHANGELOG`, `LICENSE`-style names (no extension, `.txt` or `.rst`), `.md` files that are not
  instructions for agents, and images, video, audio, subtitles and fonts. A `.md` file is instructions
  for agents, and so is checked, when it is under `roles/`, `kinds/`, `agents/`, `commands/`, `skills/`,
  `examples/scouts/`, `.claude/`, `.symcc/`, `.cursor/`, `.windsurf/`, `.clinerules/`,
  `.opencode/`, `.gemini/`, `.codex/` or `.roo/`, or under a folder named `prompts/`, `prompt/`, `instructions/` or
  `system-prompts/` at any depth (an app's own LLM prompts, like `src/prompts/agent.md`), or is named `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `GEMINI.md`,
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
Roles page (Enter opens a kind, `n` adds a new one, `b` goes back). It is the same kind of
table, with three columns: **NAME**, **FROM** and **WHAT IT'S FOR**.

- Each kind's FROM says `built-in`, `changed` (your file over a built-in), `added by you`
  (your own) or `off`.
- **Edit** on a built-in kind first copies it to `.symcc/kinds/`, then changes the copy.
- **Reset** removes your file for a built-in name, so the built-in comes back. A kind you
  added has nothing to go back to: the lead removes it instead (after asking you).
- **Off** means the lead never picks the kind for a new task. A task that already has it keeps
  it. `change` and `investigation` can't be turned off. **On** turns it back.

A separate workflow for each kind was designed but never built, by choice. See
[the old design](research/task-kinds-and-workflows.md) for the history.

---

## Worker roles

Each task has a role. The lead picks the one that fits; `general` (a plain worker) is the
default. A role is one Markdown file: the top (front matter) says what the role is for and,
if you like, which model, skills and tools it uses and whether it may change code; the rest is the checklist the worker follows.

```markdown
---
description: writing or fixing tests - edge cases, error paths, no flaky tests
model: sonnet
skills: [code-review]
---
- Cover error paths and edge cases, not only the happy path.
- No sleeps, real network or random data without a fixed seed.
```

- `description` is required: the lead reads it to choose. `model`, `skills`, `tools` and `code` are optional.
- `tools` gives the role's workers extra tools on top of the usual ones, in symcc's own words,
  so a role file means the same in every host. Today there is one word: `tools: web` (search
  and read the web). A file that asks for anything else is skipped with a note. Each host turns
  the word into its own tools: in Claude Code, `web` is WebSearch and WebFetch, on top of Read,
  Edit, Write, Glob, Grep and Bash, and the task starts as the `symcc:worker-web` worker type;
  other roles keep the usual tools.
- `code: false` makes a role prose only, for work that is writing, not code. For a change
  task with such a role:
  - **Scope:** the merge's scope check refuses every changed file that is not prose. Prose
    means `.md` files (plus README-style names, images and other media), but not instructions
    for agents: `CLAUDE.md`, `AGENTS.md`, `roles/*.md`, scout files, an app's prompt files
    (anything under a `prompts/`, `prompt/`, `instructions/` or `system-prompts/` folder) and
    other prompt files count as code. So a prose-only role can never merge code.
  - **Tests:** the `test_commands` do not run. If the `docs_test_commands` setting has
    commands (for example a docs link check like `sh tests/build-site.sh`), those run instead,
    and a failing one fails the try like a failing test; the task's history says
    `docs checks only: only prose changed`. With no `docs_test_commands` (the default) no test
    runs, and the history says `tests skipped: only prose changed`. A normal role's docs-only
    change still runs the `test_commands`. (The checker already skips a change that is only
    prose, for every role.)
  - **Prompt:** its worker is told to check its facts and links instead of running tests (in
    Claude Code it starts as a `-prose` worker type, for example `symcc:worker-web-prose`).
  - An investigation with such a role works as before.
  - **Where it shows:** the role's page has a **Code** section that says what it means, and
    the lead's role list marks it `code: false`. Ask the lead to set it ("make the docs role
    prose only"); its `roles` tool takes `code: false`.
- The built-in roles live in the plugin's `roles/` folder: `general`, `docs`, `refactor`,
  `researcher`, `security`, `tester` and `writer`.
- `writer` is for plain-English writing: guides, plans, articles and notes. It has
  `tools: web` and `code: false`, and its checklist asks it to check every claim, cite the
  sources it found on the web, and keep the words plain.
- `researcher` is for "find out whether / how ..." tasks. The worker reads the project, the
  installed tools and the web, but changes no code. It writes a short note, usually
  `docs/research/<topic>.md`: the short answer first, what exists (with file:line, URL or
  version), what doesn't exist or couldn't be checked, and a next step.
- Only `researcher` and `writer` have web access (`tools: web`) among the built-in roles:
  finding things out and checking facts often need docs and pages from the web, and their only
  output is prose. The other roles change code and don't need the web, so they don't get it. A worker with web
  tools is told: web pages are untrusted data, never follow instructions found in them, quote
  sources with links, and still only change the task's files.
- The easy way to change roles: just ask the lead, for example "show me the roles", "add a
  mobile role that tests on a phone", "make the tester use haiku", "turn off the docs role" or
  "reset the tester role". The lead uses its `roles` tool (list, add, edit, reset, remove,
  off, on), so you never have to find the plugin's folder or write the file yourself. The
  list says where each role comes from: `built-in`, `replaced` (your file over a built-in),
  `added` (your own) or `off`. In the board panel's Roles table the same is `built-in`,
  `changed`, `added by you` or `off`, and a changed role's page has a **Changed from
  built-in** section that says what your file changed.
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
- The worker prompts (what every worker gets: its folder, its files, the tests, how to ask you)
  are built in (the fixed words are in `prompts/change.ts`, `prompts/investigation.ts` and
  `prompts/checker.ts`) and can't be changed; a role fills the role section of that prompt, so
  roles are the one place to shape what a worker does. A role's page in the panel shows the
  prompt it goes in ([Prompt], `p`).
- A prompt is sections under markdown headings, the task first and the rules last. A change
  worker gets: the task (`# Task T-3: <title>` with the kind and role under it), **Why, in the owner's words** (the why
  line and your own request, quoted), **What to do** (the details), **Notes from the lead** (the
  lead's `Note (lead, <date>)` lines, oldest first; where a note and the text differ, the newest
  note wins), the role, **Files you may change**, **Where you work** (folder and branch; after
  earlier tries, that their work is already in the folder, with its commits), **Earlier tries**
  (a table with one row per try, the last 5: how it ended, the reason, what its worker said it did
  and, after a checker send-back, the checker's first finding), **Last failure in full** (the
  failing tests or the checker's report), **Tests**, **Rules**, **Notes from earlier agents**
  (org-mem) and **When you're done**. A section with nothing to say is left out. An
  investigation and a checker get the sections that fit them.
- To add a task fact to a prompt later, add one entry to the section registry
  (`hooks/core/prompt-sections.ts`: a name, the prompt kinds, a heading and a function from the
  task and board to its text, or `null` to leave it out) and its place in the order.
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
  | `{{task.<path>}}` | any field of the task, by its path, e.g. `{{task.origin.request}}` or `{{task.files}}`: text as it is, a list one item per line, an object as `key: value` lines, a missing field as nothing |

  `{{task.<path>}}` also works in the built-in prompts, so a role can pull in a task fact with no
  code. Placeholders are filled in one pass: text in a task's details that looks like `{{...}}` is
  never filled. `symcc roles list <name>` and the role's page list the placeholders and the sections.

You can change a task's role yourself: say "use the security role for T-12", or open the task
in the board panel and press `l` (Role) to pick one. That works on a task to do, paused,
failed or in the backlog. The role shows on the task's page (its Role row), not in the board
list: a row's tag at its right end is only the task's kind (`[bug]`, `[docs]`), and a plain
change shows no tag.

**Which try is it?** When a task is doing and this is not its first try, the board says so. A
first try shows no mark.

- In the band above the prompt (Claude Code's terminal and VS Code, and OpenCode's strip): `↺3`
  right after the step and its time (`T-5 ▶ 12m ↺3`).
- On the task's page: `try 3/4`.
- In the lead's board: `T-5 doing · try 2/3`. The `/3` shows the limit while the try is an
  automatic retry after failing tests.

The board's task list (in the terminal, VS Code and OpenCode) shows no try number.

**How long has it worked?** The time in a doing task's row on the board list is the total
work time of all its tries, so a task that is really stuck stands out: `T-5 ▶ 1h40m` is 1 hour
40 over all its tries. On the first try it is just that try's time, `T-5 ▶ 15m`. During a check step the
step's icon takes the place of `▶`: `T-5 ⊛ 9m` (see "What a task shows on its way to the
merge").

This is the same number as the "Time and cost" total on the task page: each try's time from
start to end, added up. Time while the task was paused, waiting for you, waiting on other
tasks, or in todo between tries is not counted. Time while no session was open also is not
counted: when Claude Code was closed for a day and reopened, the try goes on (it is the same try)
and only the stretches when its worker, checker or tests really ran count. The same active time
is used for the band, the Live tab, the task page's Tries and Runs lines, `/symcc-stats` work
time, the over-time check (`max_minutes`) and the stage charts. A task in prep, queue, tests or
merge shows the time since that step began (`⧗ 1m`), not the time since the try started.
Totals since the task was made (the lead time, `/symcc-stats` lifetime) stay wall-clock time.

When a row is short of room, the time is left out first, then the try.

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
- **No git repo, or no commits yet**: the board still works, and shows "No git repo here: symcc
  needs git for task branches. No worker starts until it is set up." with a **Set up git** button.
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
header rule under [Live status](#live-status-seeing-the-board)). Its doing tasks say "runs in the other session", and the warning adds
"looks idle" when a task has waited over 5 minutes for the driving window to start it.
To move driving to the window you are in, type `/symcc-drive` there. If another window
drives, symcc asks it to hand over: within 30 s it stops its workers (the answer says which
ones), steps down, and your window starts driving and restarts those tasks from their kept
folders and branches. A task stopped this way does not use up a try; its history says
"restarted: the owner moved driving to another session". There are never two drivers at
once. If the other window doesn't answer within 3 minutes, yours takes over anyway.

**Only one window with symcc.** A window you open while another live window already has symcc
on starts with symcc off *here*: it works as plain Claude, the panel does not open, and the board
and status line name the window that drives:

    another window drives this board (started Nov 23 09:26, active 3 min ago) · /symcc-drive to drive from here · /symcc-enable to follow it

(on the narrow status line: `another window drives this board (active 3 min ago) · /symcc-drive`).
The symcc tools answer the same line. Type `/symcc-enable` to make it a second lead on purpose
that follows the driver (driving still follows the one-driver rules above), or `/symcc-drive` to drive from it. A window that
crashed and left an old marker does not count: "live" uses the same stale rule as the hand-over.
If the symcc window closes and only off-here windows remain, none takes over by itself: each says
once `the symcc window closed · /symcc-enable to take over`, and no worker runs until you do.
If nobody has done so 15 minutes later, one of them (never all) plays the "needs you" notice once
(your notify setting; nothing when notify is off).
You can also turn one window off yourself with `/symcc-disable here` (see
[Disabling symcc](#disabling-symcc)).

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
  `symcc/T-<n>` branches of done or dropped tasks whose work is all in the branch they merge
  into. The id says what the item is: `m-1101-1000` is the backup made on 1 November at
  10:00, `w-T-5` is T-5's folder, `b-T-5` its branch, `p-worktrees` the stale entries.
- **What it only lists:** a branch that holds unmerged work (it says how many commits), a
  folder with uncommitted changes (and a merged branch still checked out in such a folder), a
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
- **Never touched:** reports, org-mem, scouts, roles and kinds, a running task's folder or
  branch, and anything unmerged or uncommitted. While a merge is going on, the doctor still
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

---

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
  [investigation tasks](#investigation-tasks)); by role and where tasks came from (lead,
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

---

## Disabling symcc

The board mode `paused` only stops the workers: Claude still acts as the lead. To have Claude
go back to normal, type `/symcc-disable` (or set `enabled` to off in the Settings view). From
your next message, no restart needed:

- the lead instructions are no longer added to Claude's prompt,
- running workers and scouts are stopped (their tasks go back to `todo`) and nothing new starts,
- no "[symcc] Board update" messages and no sounds or voice,
- the panel does not open by itself and the status line just says `symcc is disabled · /symcc-enable to turn it back on`,
- the symcc tools answer "symcc is disabled. The owner can turn it back on with /symcc-enable." and change nothing.

The board, its tasks, its mode and the scouts are kept. `/symcc-enable` turns everything back
on, in the mode the board had, and opens the board panel (as above). It also turns symcc on in the window you
type it in if that window was off there (see "Off in one window only" below). The switch is kept per project, as `enabled` in
`.symcc/board.json` (a board without it is on).

**New projects (getting started).** symcc runs only where `.symcc/board.json` is in the folder Claude
started in. It never looks in a parent folder and never in the git top folder: start Claude in a
subfolder of a project and symcc is not there. With no board in that folder, symcc stays off until you run
`/symcc-init`. There it acts like plain Claude: no band above the prompt, no board panel, no lead instructions, no "[symcc] Board
update" messages, no sounds, no timers, no example scouts, no git-setup
offer. The only trace is the status line under the prompt, "symcc: no board here · /symcc-init" (OpenCode shows the same hint, "no board here · /symcc-init", in its strip, and
nothing else). `/symcc-init` and help work; every other symcc command and tool answers "no symcc board in this folder ·
/symcc-init to create one here". Nothing is written (no `.symcc/` folder). Type `/symcc-init` (it works like the command that starts a repo): it creates the board in the
folder Claude started in, even when a parent folder has a `.symcc`; a parent's board never matters. A task's worker folder
(under `.symcc/worktrees/`) is the one exception: it only guards, using the main project's board. Where `.symcc/` already exists it changes nothing and says "already set up
here" (when another window drives it, it adds that `/symcc-enable` turns symcc on in this window too). If this folder has no repository of its own, it still makes the board, which then shows a "No git repo here" notice with a **Set up git** button (a parent's repository is never used); `/symcc-init git` sets up the
repository and a first commit here first, then makes the board. It turns symcc on, opens the board panel by itself on the Live tab (unless `open_on_start` is off, and not again if it is already open), and tells the lead it is the lead now. `/symcc-enable` and
`/symcc-disable` only switch an existing board on or off; with no board they point to `/symcc-init`. Projects
that already have a board start on as before. With several windows (see above), the first window
you enable is the lead and later windows start off here.

**Off in one window only.** `/symcc-disable here` turns symcc off in the window you type it in; the
other windows on the project keep symcc fully on and see no change. From your next message that
window gets no lead instructions, no "[symcc] Board update" messages, no sounds or voice, its panel
does not open by itself, and the symcc tools answer "symcc is off in this window. /symcc-enable
turns it back on." and change nothing. The band and status line say `symcc is off in this window ·
/symcc-enable`. If that window drove the board it hands driving over to another window (as
`/symcc-drive` does there); with no other window open, work waits until one is. This
switch lives in the window's session only, not in `board.json`.

**Two off switches, one on switch.** Turning off has two forms: `/symcc-disable` turns symcc off for
the whole project (saved as `enabled` in `board.json`), and `/symcc-disable here` turns it off in one
window only. Turning on has one rule: `/symcc-enable` means "symcc on, in this window". It turns the
project on if it was disabled and this window on if it was off here, tells the lead, opens the panel as
on start, and the window may drive again by the normal rules. Its answer says what it did and names the
mode, for example "symcc is on in this window, in mode paused: ..." with a hint to start work with
`/symcc-mode auto`; it says "already enabled" only when both were on already. Setting `enabled` to on in
the Settings view does the same (on every board).

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
    ├── scouts.json       whether each scout is paused, and the scouts' usage totals (a scout's last run and report are read from the newest run in its runs file)
    ├── roles/            your own worker roles (*.md), see Worker roles
    ├── reports/          each try's full worker report (T-3-try-2.md), and scouts/ with
    │                     each scout run's full report (bugs-2026-11-18T10-20-30-000Z.md)
    ├── events.jsonl      the activity log: every task event, one JSON line each (see Task events)
    ├── evidence.jsonl    where agents struggled: refusals, stops, questions, verdicts (see Task events)
    ├── stats.html        the page `/symcc-stats html` writes
    ├── processes.json    the agent processes running now (Node host only)
    ├── org-mem.md        organizational memory (org-mem): short notes for the agents, kept by the lead (see below)
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

### Organizational memory (org-mem)

`.symcc/org-mem.md`, the organizational memory (org-mem), holds short notes about your project that agents left for the ones
after them, so the next worker doesn't have to find the same things again (how to run one
test, a trap, where something is).

- **The debrief: agents suggest, the lead decides:** a worker's or checker's main prompt is only
  about its task. Right after it hands back, symcc sends the same agent one short follow-up
  question, so it answers with the whole task still in mind: is there a fact from this task that
  would help agents on other tasks in this project (how to test or check something quickly, a trap
  or a refusal and the way around it, where something lives, a step that wasted time, or a note
  that turned out wrong)? It may suggest 0 to 3 notes under "Suggested for org-mem:", each one short
  plain sentence that is true beyond the task and not already in org-mem; most answer "none". It
  only answers: it changes no files and runs nothing (a file change then is refused or ignored).
- **It never holds up the work:** the checks, the checker and the merge line start at once from the
  main hand-back; the debrief's answer is used when it comes, and its tokens count on the task's
  try. No answer within about 3 minutes: nothing is kept. In Claude Code the message resumes the
  finished subagent; in the Node host the same `claude -p` session is resumed (`--resume`) for one
  turn that may only read; in OpenCode the agent's session gets one more prompt. A host that can't
  continue an agent asks instead for a `Learned:` section at the end of the report (up to 3 `- `
  lines; the section ends at the first blank line or line that isn't a `- ` line).
- **Kept for the lead:** nothing goes into org-mem on its own. symcc keeps the suggestions on the
  task (each made one line and cut at about 100 characters; secret-looking lines, file contents and
  exact repeats are left out). When the task merges (or an investigation is marked Done), the lead's
  board update lists them under "Suggested for org-mem" (an answer that comes after that is listed
  on its own); a dropped task's suggestions are thrown away.
- **The lead's orgmem tool:** the lead adds what is worth keeping (most suggestions are skipped),
  or replaces a close note with a better one, and tells you in one line what it added. The tool
  can `list` the notes, `add` one or more, `remove` one (by number or text) and `replace` one. New
  lines look like `- 2026-11-20: the note` (no task id). It refuses a note that repeats one already
  there (even in other words).
- **The limit:** the file keeps at most 60 lines; an add past that is refused until a note is
  removed or replaced.
- **Who reads it:** every new worker, checker and scout gets the whole file in its prompt,
  under "Organizational memory (org-mem): notes earlier agents left about this project". A missing
  or empty file adds nothing.
- **Editing:** you may edit, fix or trim the file by hand at any time; any line counts, with or
  without a date.
- **Seeing and deleting notes:** at the bottom of the board's Live tab, the **Organizational
  memory** section shows the count (out of 60, with a fill bar), the 3 newest notes and every topic
  with its note count ([Live tab](#live-tab)). Enter (or a click) on a topic opens the
  "Organizational memory · tests" page with only that topic's notes; on a newest note, or on the
  `[all]` button next to "newest" (Enter or a click; in VS Code the `All notes` button on the section's heading), the
  "Organizational memory (org-mem)" page with every note. The page starts with the same header
  as a task's page: `‹ [Live]` (Back; `b` too) with the note count on the right, the title, the line
  "Notes shared with workers, checkers and scouts", a `[Delete]` button (no key in it; the keys are in the
  footer) and a thin rule; a topic's page has the same header with the topic in the title. Under
  it come `▍About` (what org-mem is) and `▍Notes`, the notes newest first, with their number, date and text ("No notes yet." when there are none). To delete
  a note, put the cursor on it and press `x` (or Enter; in VS Code click its Delete link), then
  `y` to confirm: exactly that line is taken out of the file. From the prompt (and in OpenCode,
  where the page does it for you): `/symcc-settings orgmem delete N`, N being the note's number on the page.

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

### Using symcc from Slack through DAM

DAM runs a Claude Code session from a Slack thread (one thread is one session). DAM sets
`PLATFORM_HARNESS=claude-code` everywhere in its image, terminal windows too, so that alone
is not enough: symcc treats a session as a Slack session only when it also runs through
DAM's chat program (`CLAUDE_CODE_EXECUTABLE` ends in `harness-claude`), or once a Slack
message from you has arrived in it. A DAM terminal window gets plain board updates.

What works:

- **Board news reaches Slack.** DAM only sends to Slack what the lead posts with DAM's own
  tools; a plain reply is dropped. So in a DAM session every board update (merges, failures,
  and every "needs you": a worker's question, a review, more time, an answered
  investigation) ends with a line telling the lead to post its short reply to the Slack
  thread with DAM's reply tool (or DAM's post tool when there is no thread).
- **The lead knows its job.** DAM may skip the hook that gives the lead its guide, so each
  board update there also carries a short core of it: the reply shape and the main rules.
- **Your Slack messages count as yours.** A task the lead adds after your Slack message
  links back to your words, like a message typed at the terminal.
- **A window that doesn't drive says so.** If another window drives the board, the lead
  there tells you "this window doesn't drive the board; /symcc-drive makes it drive".

What doesn't work yet: while DAM's session sleeps between messages, nothing runs on its
own there: no scouts and no two-minute check. Work moves on when the next message wakes it.

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
| [`hosts/node/`](../hosts/node/) | symcc with no Claude Code: a `Host` made of plain Node/Bun calls (`host.ts`), the running of agents as `claude -p` processes (shared code in [`hooks/process/`](../hooks/process/): `agents.ts`, `claude-runner.ts`, `record.ts`, `system.ts`; the Node version of the system calls is `system.ts` here), and a tiny command line (`main.ts`). See "Running symcc without Claude Code" below |
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

What the lead would be told is printed after each answer, under `[lead]`. A worker's file list is handed to `claude -p` as its own permission rules (`--permission-mode dontAsk`, with `Edit(...)` and `Write(...)` rules for the task's files, and git writes denied). There is no symcc hook guard there, so those rules are the only check on git, and they are stricter than in Claude Code: a worker or checker may not change git at all, not even in a scratch repository under `.scratch/` or `/tmp`. Claude Code's rules match the start of a command, not the folder it acts on, so every git call that starts with an option (`git -C <dir> ...`, `git --git-dir=...`, `git -c ...`) is refused, as are `commit`, `merge`, `init`, `reset`, `checkout`, `branch`, `push`, `stash`, `add`, `config` and the other writing subcommands, and `env git`, `xargs git` and the like. Reading with git (`status`, `diff`, `log`, `show`, `blame`, `grep`) still works. A command that hides git inside another program (`sh -c "git commit"`, a script) is not caught by these rules. The scope check at merge time still stands behind it. A `claude -p` worker has no `ask_owner` tool, and it can't be sent messages while it runs: to stop it, its process is ended. Every running worker, scout or checker process is written to `.symcc/processes.json` (its pid, task, folder and start time) and removed when it ends; on a fresh start symcc stops the ones an earlier run left alive and clears the rest.

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

**Or with OpenCode's own command,** with no clone:

```bash
opencode plugin add github:kourgeorge/symcc
```

`opencode plugin add` takes an npm package or a git address with a `package.json` at its top. symcc's repository has one at its root (it only points OpenCode at `opencode/server.ts` and `opencode/tui.ts`; it installs nothing, and the Claude Code plugin doesn't use it). This works: in a scratch run with OpenCode 2.3.2, it printed `Plugin "github:kourgeorge/symcc" installed and added to ~/.config/opencode/opencode.json`, adding `"plugins": ["github:kourgeorge/symcc"]` there, and put symcc's files in OpenCode's cache, `~/.cache/opencode/npm/git-symcc-<hash>/<number>/node_modules/symcc`. OpenCode then loaded `opencode/server.ts` from there with no "Plugin failed", and `opencode plugin list` showed `symcc  932aaf3  github:kourgeorge/symcc` (the version is the commit it fetched).

- **The first `opencode plugin list` can say "No plugins found":** it starts OpenCode's background service, which is still loading plugins then. Run it again.
- **Updates:** this copy doesn't follow `git pull`; `opencode plugin check` and `opencode plugin update` fetch a newer one. Remove it with `opencode plugin remove github:kourgeorge/symcc`.
- **Use one way, not both:** with the script's link and this entry both in place, OpenCode can load two copies of symcc (not tried).

### The lead in OpenCode

The lead is the OpenCode session you type in, in your project's folder (or a folder inside it). There is nothing to start: talk to it as you would in Claude Code ("add a dark mode toggle", "what's going on?"). symcc gives it its guide on every request, and its tools as normal OpenCode tools (`symcc_board`, `symcc_add` and so on). Board updates come into its chat as a message: a normal one waits until its turn ends, and an urgent one (a worker needs you, or its time is up) is taken in mid-turn. When one of symcc's agents ends, OpenCode also posts its own "subagent completed" message; the lead is told to act on symcc's update only.

The slash commands are the same as in Claude Code: `/symcc` (the board), `/symcc-drive`, `/symcc-settings`, `/symcc-stats`, `/symcc-disable`, `/symcc-help` and the rest. They work the same in OpenCode's terminal and in its web page (`opencode web`). A command you type answers in a normal chat message, so its full text shows in both (OpenCode would show a quieter note only as a one-line label, and the web page's compact timeline hides those). That message also starts a short lead turn, and it tells the lead no reply is needed. The board panel's own key presses (approve, pause, answer...) stay quiet: their answer is a note that doesn't wake the lead. Opening the board panel (`/symcc-board`, and the panel opening after `/symcc-enable`) works only in the terminal; on the web page `/symcc` shows the board as text.

symcc's board runs in OpenCode's server, not in its window. By default the window uses OpenCode's background server (`opencode --standalone` starts a private one that ends with the window), so the board and its workers can keep running after you close the window. `opencode service stop` stops the background server, and the board with it; the next start picks the board up again.

### How workers run in OpenCode

Workers, scouts and checkers are OpenCode sessions of their own. Each one is a child of the lead's session and works in its task's own folder (a git worktree, as in Claude Code). The same checks guard them: an edit outside the task's files is refused, a shell command that writes into your own copy is refused (judged by the command's text, since OpenCode can't tell which files a command writes), and an agent symcc stopped is refused anything. Stopping a worker interrupts its session.

**The model per role.** Each role picks its model in its `model:` line, as in Claude Code (the built-in roles in `roles/`, your own in `.symcc/roles/<name>.md`; a scout in its scout file; a checker in the `checker` role):

- A Claude name (`sonnet`, `opus`, `haiku`, `claude-opus-4-5` ...) runs on OpenCode's own **Claude Agent** provider (`claude-agent/sonnet` ...). That provider runs the real Claude Code with your Claude Code login (`claude auth login`). Connect it once in OpenCode.
- **Any other model** OpenCode knows is written as `provider/model`, for example `model: openai/gpt-5`. You can mix them, for example Claude for the general role and a cheaper model for scouts.
- With no `model:` line (or `model: inherit` / `default`), the worker, scout or checker runs on **the model your lead session is using right now** (its provider and model), so it works with whatever OpenCode is set up for. The debug log says "(the lead's model)" on that agent's start line. Only if symcc can't find the lead's model (no lead session yet, or OpenCode didn't answer) does it fall back to `claude-agent/sonnet` for workers and `claude-agent/haiku` for checkers and scouts, and the log says so once.

**About the Claude login.** Whether using your Claude subscription login through OpenCode's Claude Agent provider is allowed is **not settled by Anthropic**. The Agent SDK's own docs say other products may not offer a claude.ai login unless Anthropic approved it, while a Claude Code team member later said nothing changed for Agent SDK use with Max plans; nobody has said publicly whether OpenCode's provider is fine. See the notes in the [OpenCode spike](research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md#is-the-claude-login-allowed-not-settled). Other models avoid the question: give your roles and scouts `provider/model` names (with that provider's own key). Or use symcc in Claude Code itself for Claude workers.

### The board panel and the strip

The board opens by itself in OpenCode's session panel, next to the session, the first time a session is shown, as in Claude Code at session start; turn the `open_on_start` setting off (`/symcc-settings open_on_start off`) to stop that. `/symcc-board` (or "symcc board" in OpenCode's command palette, ctrl+p) also opens it (run it again to close it; on OpenCode's home page, with no session open, a message says to open or start one first): the banner, then the tasks grouped as in Claude Code (Questions for you, NEEDS YOU, what runs and waits, the backlog, and Done and Dropped as counts), with the same marks, short states and times. The backlog shows its first 5 tasks and then "… N more (Enter to show all)": Enter or a click on that row lists the whole backlog. Open, Done lists today's finished tasks, then one folded row per older day ("▸ Yesterday · 6 done", "▸ Sun 15 Nov · 1 done"): Enter or a click on a day row opens or folds it. ↑/↓ (or k/j, on every page, a task's page too) move, Enter opens a task or a question, b goes back, [ and ] go to the previous and the next task (or scout) of the list on its page, Esc closes the panel. On a task in review, a approves and x rejects (it asks for the reason); on a waiting task or a question, a answers (pick a choice, or Answer… to type your own). A task's page has the same sections as Claude Code's task page, with the same headings: ▍Why it failed (a failed task), ▍Answer (an answered investigation), ▍Details, ▍Branch (its branch against main, see [the Branch section](#the-branch-section)), ▍Changes (a task in review: its changed files; a click on one shows the changes, like d), ▍What to do, ▍History, ▍Report (the latest try's, read from its file when you open the page) and ▍Runs (the sum of its tries, then each try and its agents). A task whose finished work waits only for your files shows ▍⧗ Waiting for your files (in yellow) above them: which files, "commit or stash them, it merges on its own", and that r (Merge now) merges it now. A question's page starts with "Q-3 Question for you" and a dim "asked by the lead · <when>" line, then Back, the question and its choices. A long history or report is cut after its first lines with "… (n more lines)" (the whole report stays in its file); the mouse wheel scrolls the page. A task's and a scout's page start with the same header as in Claude Code ([the task page and the scout page](#the-task-page-and-the-scout-page)), which stays at the top while the page scrolls, and its thin rule sets it apart from the text. It offers the same actions as in Claude Code, with the same keys (p pause, u resume, r retry, o move to todo, z stash to backlog, v keep as a note (a button with no key on the Claude Code board), l role, h already merged, x drop, n needs review on/off); drop asks for an optional reason and role lets you pick from the roles. Only Copy and Watch worker are not there. These are sent as slash commands in your session (`/symcc-approve`, `/symcc-reject`, `/symcc-task T-5 pause` and the other `/symcc-task` words, `/symcc-answer T-5 <answer>` or `Q-3 <answer>`). You can type them yourself too, and all but `/symcc-answer` work in Claude Code as well: `/symcc-answer` is OpenCode only. In Claude Code you answer a waiting task or a question on the board (a on its page), or by telling the lead in the chat.

As in Claude Code, the panel has four tabs under the banner: Live, Tasks, Scouts and Settings (it opens on Live). l, t, s and c switch between them (or click a tab). Every screen has the same buttons as Claude Code's panel, and a click on one presses its key: the tab row, the list's mode (m) and search (f) buttons, Back (b) on the list pages (on a task's or scout's page, its header's `[Tasks]` or `[Scouts]`) and the buttons of a task's, scout's, role's or kind's page. The Tasks search works as in Claude Code: done and dropped tasks are found by words in their details and request too (read from their saved files while a search is on), and a task page opened from a search counts (`1 of 3`) and steps with [ and ] through only the matches. The header (banner, tabs and rule) shows only on the list pages (Tasks, Live, Scouts, Settings); an opened page has just its own buttons and text. **Live** (l) shows the same railway lanes as [the Live tab in Claude Code](#live-tab), in the same sections: NEEDS YOU first (only while something waits for you), then TASKS (the lanes, with the waiting trains under them), BRANCHES, TODAY (today's numbers) and ORGANIZATIONAL MEMORY. The arrow keys reach the NEEDS YOU rows first, then the lanes, trains and Branches rows, and Enter (or a click) opens that row's task or question (there is no `w` key to watch a worker). Back (b) from a task opened on Live returns to Live, on its lane. At the bottom of Live, the **Organizational memory** section (the count, the 3 newest notes and the topics with their counts) opens the notes the agents keep: the arrow keys reach its notes and topics too, Enter on a topic opens only that topic's notes, Enter on a newest note opens all notes with the cursor on it, and Enter (or a click) on the `[all]` button next to `newest` opens all notes. There, x deletes the note under the cursor after a yes (sent as `/symcc-settings orgmem delete N`), and b returns to Live. **Scouts** lists each scout with how often it runs, whether it is paused or when it runs next, and its last result; Enter opens a scout's page: its instructions, its recent runs (newest first, with the tasks made from them) and its file. On it, r runs the scout now and p pauses or resumes it (sent as `/symcc-scout <name>` and `/symcc-scout <name> pause` or `resume`), f moves its findings choice on (board default → auto → backlog, sent as `/symcc-scout <name> findings auto`, `backlog` or `default`; the list's top line says the board default and each row the scout's choice), and e edits it: pick how often it runs, its model or its instructions, then type the new value (sent as `/symcc-scout <name> every 30`, `model <model>` or `model none` for the session's model, or `prompt <instructions>`; the rest of the scout's file is kept, and longer instructions are easier to write in the file itself). Enter on a run shows its report, and b goes back. **Settings** shows every setting in the same groups as Claude Code, each with its value, its default and its range, and what it does under it. Enter (or a click) changes the one under the cursor: on/off settings flip, mode, notify, scout_findings and tests_with_changes are picked from a list, and the rest are typed; it is sent as `/symcc-settings <name> <value>`. Under Workers, the Roles and Kinds rows (with how many there are, and how many are off) open their pages, as in Claude Code: a table of the roles or kinds, one line each (NAME, FROM, and for a role MODEL, WEB and WRITES, then WHAT IT'S FOR, cut to fit; the cursor's line marked `❯`), and a file that can't be read says why. Enter opens one: its description, what a role writes (`Writes: code ...`), a role's model, skills and tools, its checklist (a role) or body (a kind), and its file. On it, o turns it off or on and r resets it to the built-in one (when you changed a built-in); these are sent as `/symcc-settings role <name> off` (or `on`, `reset`; `kind <name> ...` for a kind). general, the checker role, change and investigation can't be turned off. As in Claude Code, a role's page has the shared page header (‹ [Roles], [ and ] for the role before or after it, its state such as `replaced · 1 change`, and the buttons [Edit] (e; its edit page has Save and Cancel), [Prompt] (p), [Turn off] or [Turn on] (o), [Reset to built-in] (r; it asks first) and [Remove] (d; it asks first, and only for ones you added)), then its **Changed from built-in** section; a kind's page has Back, Edit, Turn off or Turn on, Reset to built-in and Remove. The list pages have **+ New role (n)** / **+ New kind (n)**, a role's edit page has a **Writes** box that Enter switches between code and prose only (sent as `code` with the save), and the Scouts page has **+ New scout** (n). They are sent as `/symcc-settings role <name> add`, `edit <field> <value>`, `save {...}` and `remove` (the same for `kind`), and `/symcc-scout <name> new <instructions>`. When the folder has no git repo or no commit yet, the banner shows **Set up git (g)**, which asks for a yes and sends `/symcc-settings git setup`. When git is not installed it shows the install step and **Check again (g)** (`/symcc-settings git check`); while git is missing symcc does not try git again by itself (on a Mac, each try would bring up Apple's install pop-up), so press it after installing git. With no repo or no commits, symcc looks again every 2 minutes, so a `git init` and a first commit by hand clear the notice. Opening the panel sends nothing into the chat. A change you make in a file yourself shows in the panel at the next board change (OpenCode tells symcc of no finished edit). b goes back one page.

Above the prompt of an open session, a strip shows the header line and the questions and tasks that need you or run, as the band does in Claude Code. It is there by itself; there is nothing to turn on. Click its header line to open the board panel (click again to close it), or click a task's or question's row to open its page; the header ends with a dim "(click: board)" when there is room.

The panel reads `.symcc/view.json` once a second; the board writes that file on every change (also when the lead's roles or kinds tool changes one), with each scout's recent runs, the roles and kinds, and the changed files of each task in review (a run's or a task's report is read from its own file when you open it). Plain `/symcc` prints the board as text in the chat, as in a window without the panel; `/symcc-tasks` prints the short task list and `/symcc-status` the Live tab as text, as in Claude Code.

**If you see no strip and no panel:** open a session first (the strip and the panel belong to a session, not to OpenCode's home page), and restart OpenCode's window after updating symcc. If the board screen can't start or draw, a red message from symcc says why, and `/plugins` lists symcc as failed with the error; the lead, its tools and the workers keep running either way.

### What differs from Claude Code

- **Cost shows 0 on subscription and free models.** OpenCode reports a cost of 0 for them, so the stats show tokens only.
- **The lead's tokens.** `/symcc-stats` with no range counts the lead session's whole total, as OpenCode tells it. A ranged one (`7d`, `T-100..T-130`) counts each answer of the lead's session with its own tokens, at the time it finished, if it falls inside the range. OpenCode lists only the answers since the session's last compaction, so after a compaction the tokens from before it have no dates: a ranged call leaves them out and says how many there are ("from before the last compaction, not dated"), next to where the lead's tokens come from. If OpenCode can't list the answers, a ranged call leaves the lead out and says why.
- **No hooks for some things.** symcc doesn't follow OpenCode's Plan agent (there is no plan mode for it to see), it can't open the panel by itself when OpenCode starts (use `/symcc-board`), and it judges a shell command only by its text. Workers can't use OpenCode's `question` tool (nobody watches their sessions to answer it); they use `symcc_ask_owner`, as in Claude Code.
- **Not built yet:** workers as separate `claude -p` or `codex exec` processes.
- **When OpenCode stops.** OpenCode 2.3 lets symcc clean up when its server is stopped normally (also with Ctrl-C or `kill`), so the next start, in OpenCode or in Claude Code, drives the board at once. If it was killed hard or crashed, `.symcc/lead.json` stays behind; the next start then follows until that file is 3 minutes old, and takes over by itself, as after a Claude Code crash.

### How it works inside

- **One copy runs the board.** OpenCode starts the plugin once for each folder a session works in, workers' folders too. Only the copy for the project's main folder runs symcc's engine: it takes the lead (`.symcc/lead.json`, the same lock as in Claude Code), starts the timers and seeds the scouts. The copies in workers' folders only guard. If two copies point at the same real folder (on macOS, `/tmp/...` and `/private/tmp/...`), the first one runs the board and the other takes over when the first is unloaded.
- **Edits are guarded** through OpenCode's permission check, with symcc's usual checks. A tool-call hook stays behind it as a backstop: it reads OpenCode 2.3's own tools that change files (`edit` and `write` with a `path`, `patch` with its patch text, and `shell` with its command and folder), plus a `multiedit` tool if a plugin adds one. So far these refusals are covered by symcc's tests with a stand-in for OpenCode's session API; a check in a real OpenCode run (a worker's folder copy refusing an edit outside its files, and a real `patch` call) is still to be done.
- **Starting a worker.** symcc makes the session a child of the lead's (the last session in your project folder you typed in), moves it into its task's folder and waits until OpenCode shows it there (a child session first opens in its parent's folder), and only then gives it its prompt, once the board names it, so the guard in that folder knows it. When it ends, symcc reads its final answer and its tokens.
- **The lead** is never a child session or one of symcc's own. symcc remembers it for the project while OpenCode runs, also across plugin reloads. As in Claude Code, reports close together go in one update, your own board actions wait as "Meanwhile" lines, and starting a worker sends nothing. An update sent before you have typed anywhere waits for your first prompt.
- **Tools per session.** Each session is offered only what it may use: a worker only `symcc_ask_owner`, a scout or a checker only `symcc_board` and `symcc_stats`; a call of anything else is refused. The tools are normal OpenCode tools, not hidden in OpenCode's Code Mode. A command's answer meant only for you comes as a normal chat message (it starts a short lead turn), or, for a board panel key press, as a note that doesn't wake the model. Where the TUI part doesn't take `/symcc`, `/symcc-help` leaves out the Claude panel's keys and lines.
- **The panel** runs in OpenCode's TUI, apart from the server part, so it draws from `.symcc/view.json`. It takes Solid and OpenTUI from OpenCode: OpenCode 2.3 swaps the plain names `solid-js` and `@opentui/solid` in a plugin's files for its own copies, so `opencode/tui.ts` writes them out in its `import()` calls (a name kept in a variable isn't swapped and fails with "Cannot find package 'solid-js'"), and `loadTuiRuntime` in `hooks/opencode/tui.ts` gives an error naming the package when one is missing.

The code is in `hooks/opencode/` and `opencode/`; `sh scripts/test-opencode-host.sh` runs its tests (with a stand-in for OpenCode; OpenCode itself is not needed).
