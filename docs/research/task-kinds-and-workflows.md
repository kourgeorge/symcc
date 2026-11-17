# Task kinds, each with its own workflow (epics as one kind)

**Short answer.** Every task already has a `kind` (after T-328: `change`, `bug`, `feature`,
`refactor`, `docs`, `investigation`, each a file in `kinds/` or `.symcc/kinds/`). This design
gives each kind a **workflow**: an ordered list of **stages** written in the kind's file. A stage
is a worker run, an automatic check, an approval (gate), or (for an epic only) a set of child
tasks. One task keeps one row, one branch and one folder; each worker stage is a fresh worker in
that same folder. `epic` is one more kind: its spec is the plan, its children are normal tasks,
and it ends with an acceptance check of the whole feature.

This doc is a design, not code. It names the real files and functions it changes, as they are
at commit `06d327b`, plus T-328 (kinds as files), which is now merged. Anything I could not
confirm is marked **(guess)**.

---

## 0. How symcc works today (what this builds on)

- A task is one entry in `.symcc/board.json` (`BoardTask`, `hooks/core/board-file.ts:90`). Its
  `kind` is `change` or `investigation` today (`TaskKind`, `board-file.ts:96`; `kindOf`,
  `board-file.ts:100`; `kindFor`, `hooks/core/task.ts:22`). T-328 (merged) widened this: `TaskKind`
  is now any kind name, and kinds are files read by `hooks/core/kinds.ts` (`readKind`,
  `mergeKinds`, `BUILT_IN_KINDS`) and `hooks/plugin/kinds.ts` (`loadKinds`, `kindFiles`).
- A worker is started by `startWorker` (`hooks/plugin/workers.ts:85`) with the prompt from
  `WORKER_PROMPT` (`workers.ts:23`), which fills `prompts/change.ts` or
  `prompts/investigation.ts` (`fillPrompt`, `hooks/core/prompts.ts:98`). Its folder comes from
  `prepareWorktree` (`hooks/plugin/git.ts:143`).
- When a worker hands back, `finishWork` (`workers.ts:606`) decides what happens from how its run
  ended (question, refused edit, stopped, error), never from its words. A change then goes to
  `checkAndMerge` (`hooks/plugin/review.ts:106`): commit, scope check (`outOfScope`,
  `task.ts`), bring up to date, run tests, then review or merge (`upToDateTestMove`,
  `review.ts:230`). `settle` (`workers.ts:767`) turns the result into the task's next status,
  with retries from `onTestFail` / `onConflict` (`hooks/core/settings.ts:19`, `:349`).
- An investigation goes to `answered` (`workers.ts:681`) and waits in `review` for the owner.
- Review: `needsReview` (`hooks/core/review.ts:11`) is true when the board mode is not `auto`
  or the task has `needs_review`.
- Each try's hand-back is saved as `.symcc/reports/<id>-try-<N>.md` (`reportFile`,
  `hooks/core/reports.ts:11`) and linked from the try (`SymccRun.report`, `types/index.d.ts:29`).
- Report files can already be copied into a worker's folder (`copyReports`, `git.ts:161`),
  because the worker may not read the main project folder.
- Edits outside a task's files are refused by `checkEdit` (`hooks/plugin/ask.ts:78`).
- Roles are files with front matter (`parseRole`, `hooks/core/roles.ts:84`; built-in in
  `roles/`, the owner's in `.symcc/roles/`, the owner's copy wins: `mergeRoles`, `roles.ts:129`).
  Kind files (T-328) follow the same pattern: `kinds/<name>.md` and `.symcc/kinds/<name>.md`,
  merged by `mergeKinds`. Today a kind file has only `description` in its front matter and a free
  text body; the stage format below is what this design adds.

---

## 1. The kind file format

A kind is one Markdown file: `kinds/<name>.md` in the plugin, or `.symcc/kinds/<name>.md` in the
project (the owner's copy wins, like roles; today's `kinds/` folder has `change`, `bug`,
`feature`, `refactor`, `docs` and `investigation`, and `epic` is added by build step 8). The front matter is read by the lead to choose; the
body is the list of stages.

### Front matter

| Key | Needed | Meaning |
|---|---|---|
| `description` | yes | One line the lead reads to pick the kind (from T-328) |
| `merges` | no, default `yes` | `no` = nothing is committed or merged (today's investigation) |
| `merge_tests` | no, default `yes` | `no` = the final merge skips the test command when every changed file is a doc file (`isDocFile`, `review.ts:49`); if any code changed, tests run anyway |
| `off` | no | Like roles: the lead never picks it for a new task |

### Stages

Each stage is a `## <name>` heading, then a few `key: value` lines, then free text: the stage's
instructions for the worker (only worker stages use the text). Stage names are short words
(letters, digits, `-`); they show on the board.

Exactly one of these keys says what the stage is:

| Key | Values | What runs |
|---|---|---|
| `worker:` | a role name, or `task` (the task's own role) | A fresh worker in the task's folder |
| `check:` | `tests`, `scope`, `new test fails on old code`, `no test files changed`, or `run: <shell command>` | symcc itself, no model |
| `gate:` | `owner` or `lead` | Waits for an approve or reject |
| `children:` | `from spec` | Epic only: waits for its child tasks |

Optional keys:

| Key | Meaning | Default |
|---|---|---|
| `files:` | `task` (the task's files) or `tests` (only test files inside the task's files, by `isTestFile`, `review.ts:29`) or `spec` (only the epic's spec file) | `task` |
| `on fail:` | `back to <stage>, <N> times`; after N, the task goes to `failed` and the lead is told (it asks the owner if it can't decide) | a check goes back to the worker stage just before it, `auto_retries` times; a worker stage that fails has no automatic go-back (today's behavior: failed) |
| `minutes:` | this stage's time limit for a worker | the board's `max_minutes` |
| `model:` | overrides the role's model for this stage | the role's |

Every merging kind ends with a built-in **merge** step that is not written in the file: today's
`checkAndMerge` (commit, scope, bring up to date, tests, merge). It shows on the board as
`merge`. A check stage that already ran the tests on the same commit means merge doesn't test
again, unless the target branch moved (this is today's `testsRun` rule in `upToDateTestMove`).

A file that can't be used (no description, unknown stage key, `on fail` naming a stage that
doesn't exist, a loop with no count, a `children:` stage outside `epic`) is skipped with a note,
the same way a broken role file is (`skippedRoleNote`, `roles.ts:96`).

### The built-in kinds, in full

**`kinds/change.md`** (the default; today's flow exactly)

```markdown
---
description: any change to the project that fits no other kind; one worker, then tests and merge
---
## code
worker: task
Do the task.

## tests
check: tests
on fail: back to code, 2 times
```

**`kinds/bug.md`**

```markdown
---
description: something is broken; first prove it with a test that fails, then fix it
---
## reproduce
worker: tester
files: tests
Write a test that shows the bug: it must fail on the code as it is now, for the reason in the
task. Don't change any code that isn't a test. Say in your report which test shows the bug.

## fails-first
check: new test fails on old code
on fail: back to reproduce, 2 times

## fix
worker: task
Make the test from the reproduce stage pass without weakening it. Change the code, not the test.

## tests
check: tests
on fail: back to fix, 2 times
```

**`kinds/feature.md`**

```markdown
---
description: new behavior; build it with tests, then a fresh worker tries to break it
---
## code
worker: task
Build the feature and add tests for it.

## tests
check: tests
on fail: back to code, 2 times

## break
worker: checker
files: tests
Read the diff of this task against the branch it merges into. Try to break it: edge cases,
error paths, what the task says must still work. Add tests that fail where it is wrong. If you
find nothing, change nothing and say so.

## tests-again
check: tests
on fail: back to code, 2 times
```

(`checker` is a new built-in role, `roles/checker.md`: "tries to break a change by writing
tests; never changes code". It needs no web.)

**`kinds/refactor.md`**

```markdown
---
description: cleaner code with the same behavior; the tests must pass without being changed
---
## code
worker: refactor
Make the change the task asks for. Don't change what the code does.

## same-tests
check: no test files changed
on fail: back to code, 1 time

## tests
check: tests
on fail: back to code, 2 times
```

**`kinds/docs.md`**

```markdown
---
description: documentation only - README, guides, comments; no tests run when only docs changed
merge_tests: no
---
## write
worker: docs
Write or fix the docs the task is about.
```

**`kinds/investigation.md`** (today's behavior)

```markdown
---
description: an answer for the owner, not a change; nothing is committed or merged
merges: no
---
## research
worker: researcher
Find the answer and hand it back in full.

## read
gate: owner
```

**`kinds/epic.md`** (section 5 explains it)

```markdown
---
description: a big feature that needs a written plan and several tasks; the owner approves the plan first
---
## spec
worker: planner
files: spec
Write the spec at the path in the task: goal, behavior, edge cases, what must not change,
how we know it works, and the task list (title, kind, role, files, after for each).

## approve-spec
gate: owner

## build
children: from spec

## accept
worker: checker
files: tests
Check the whole feature on this branch against the spec. Add acceptance tests for what the spec
promises. List every gap in your report.

## accept-tests
check: tests
on fail: back to build, 2 times

## approve
gate: owner
```

(`planner` is a new built-in role, `roles/planner.md`: reads the code like `researcher` but has
no web and writes only the spec.)

---

## 2. How a stage runs and hands off

### What is stored on the task

New fields on `BoardTask` (`hooks/core/board-file.ts:90`), cleaned in `cleanTask`:

- `stage: string`: the name of the stage the task is in now. Missing = the kind's first stage.
- `stages: { name: string; result: 'passed' | 'failed' | 'skipped'; at: string; try?: number; note?: string }[]`:
  one line per finished stage, oldest first, so a go-back keeps the record.
- `backs: Record<string, number>`: how many times each `on fail` was used (like `test_tries`
  today; `test_tries` and `conflict_tries` stay for the merge step).
- `SymccRun` (`types/index.d.ts:15`) gets `stage?: string`, so each worker try says which stage
  it was. Reports stay `.symcc/reports/<id>-try-<N>.md` (`reportFile`); try numbers keep counting
  up across stages (T-5 bug: try 1 = reproduce, try 2 = fix).
- History lines get the stage: `try 2 (fix): … → tests passed`. `tryLabel` (`roles.ts:179`)
  adds it.

### The loop

A new pure function `nextStage(kind, task, result)` in a new `hooks/core/stages.ts` says what
comes next: the next stage, a go-back (`on fail`), `failed`, or the merge step. All the I/O stays
in `workers.ts`:

1. `pump` / `startWorker` start a worker only when the task's current stage is a `worker:` stage.
2. `finishWork` keeps its order (question → waiting, refused edit → waiting, stopped, error).
   Only the "finished" branch changes: for a merging kind it **commits** (`commitTry`,
   `review.ts:180`) and runs the **scope** check for that stage's `files:`, then calls
   `runStages`, a new function that runs check stages one after another in the task's folder
   until it reaches a worker stage (the task goes back to `todo` with `stage` set, and the next
   pump starts a fresh worker), a gate (the task waits), or the end (the merge step, today's
   `checkAndMerge` + `settle`).
3. Failing a check: if the stage has `on fail` and `backs[stage]` is under its count, the task
   goes to `todo` at the named stage, with the check's output saved (today's `test_output`
   field, renamed to `check_output`, so any check can feed the next worker). Otherwise `failed`
   and the lead is told, like today's "still failing" path in `settle`.

### What the next worker gets

The prompt (`WORKER_PROMPT`) gains two placeholders, added to both prompts in
`hooks/core/prompts.ts` (`PROMPT_PLACEHOLDERS`):

- `{{stage}}`: "Stage fix (2 of 4) of a bug task. Your job in this stage: <the stage's text>."
- `{{earlier_stages}}`: one line per finished stage, with its report file:
  "reproduce (tester): passed; report .symcc/reports/T-5-try-1.md; added tests/login.test.ts".
  Those report files are copied into the folder by the existing `copyReports` (`git.ts:161`),
  which today reads report paths from the details (`namedReports`, `task.ts`); it gets the paths
  from `stages` instead.
- The folder already holds the earlier stages' work (same branch, already committed).
- After a failed check: `{{test_output}}` (renamed `{{check_output}}`) holds the end of the output.
- An epic child also gets "Background: this task is part of epic T-12; its spec is
  docs/specs/T-12-<slug>.md" (the spec is in its folder because the child starts from the epic's
  branch, see section 5).

### Time limits and retries per stage

- `minutes:` replaces `max_minutes` for that stage: `timeLimitOf` (`task.ts`) takes the stage
  limit. The over-time question (`askOvertime`, `workers.ts:1261`) is unchanged.
- `on fail: … N times` replaces `auto_retries` for that check. With no `on fail` on a `tests`
  check, the board's `auto_retries` is used, so today's setting keeps its meaning.
- A merge conflict still gets `MAX_CONFLICT_TRIES` new tries (`settings.ts:343`); the new try is a
  fresh worker in the **last worker stage** (the one whose code clashes).

---

## 3. The built-in checks in practice

All run in the task's folder after symcc committed the stage's work, through
`$.process.run(['/bin/sh','-c', cmd], { cwd })`, as tests do now (`review.ts`, in
`upToDateTestMove`). Today's test loop is pulled out into `runTests($, dir, cmds)` so both the
`tests` check and the merge step use it.

- **`tests`**: runs the board's test commands; passes when all exit 0. Same 10-minute limit per
  command (`TEST_TIMEOUT_MS`, `hooks/core/lead.ts:78`). No test command set: passes, with "no test command set" in its line.
- **`scope`**: today's `outOfScope` on `git diff --name-only <base>..HEAD`. It always runs after
  every worker stage, so writing it is only useful to put it in a custom order.
- **`no test files changed`**: the files changed since the stage before the first worker stage
  (`base` = merge base with the target, as `checkAndMerge` finds it). Fails when any of them
  passes `isTestFile` (`review.ts:29`), and says which.
- **`run: <command>`**: any shell command, run like a test command; exit 0 passes. For example
  `run: npm run lint`.
- **`new test fails on old code`**: the hard one.
  1. **Finding the new tests.** When the stage before it is a worker stage with `files: tests`,
     symcc records `stage_base` (the folder's HEAD before that worker started) on the task. The
     new tests are `git diff --name-only --diff-filter=AM <stage_base>..HEAD`, filtered by
     `isTestFile`. If there are none, the check fails ("no new test was added").
  2. **Running them on old code.** Because that stage could only change test files, the folder
     right now *is* the old code plus the new tests. So the check simply runs the test commands
     in the folder and **passes when they fail** (non-zero exit).
  3. **Failing for the right reason (guess, to try out).** A test file with a typo also makes
     the run fail. So the failing output must name at least one of the new test files (its file
     name appears in the output). Most runners print the failing file; I didn't check that this
     holds for `claude plugin test .`, which this project uses.
  4. **Again before merging.** After the fix, the target may have moved. At the merge step, when
     the kind has this check, symcc makes a throwaway worktree at the merge base
     (`git worktree add --detach .symcc/checks/<id> <base>`), copies in the new test files from
     the task's HEAD (`git checkout <head> -- <files>`), runs the test commands there (they must
     fail), then removes it (`git worktree remove --force`). This proves the fix, not the test,
     made them pass. It costs one more test run; it is always done (decision 4).
- **Running only the new tests (decision 3).** `run:` may use a `{files}` placeholder, which
  symcc fills with the new test files, e.g. `run: npx vitest run {files}`. Without `{files}`, the
  check runs the whole test command, because symcc can't know how to run a single file.

---

## 4. Gates: owner and lead

### How they work

- **`gate: owner`**: the task goes to `review` (status unchanged from today), shows under NEEDS
  YOU, and the lead is told "T-5 waits for you at stage approve-spec". Approve moves it to the
  next stage (or the merge step); reject with a reason sends it back to the worker stage before
  the gate, with the reason (today's `rejectTask`, `review.ts:108`). For an investigation the
  owner gate is today's Done / Keep as a note / Ask more, unchanged.
- **`gate: lead`**: the task waits in `review` with a new field `gate: 'lead'`. It does **not**
  show under NEEDS YOU; its row says `lead check`. The lead gets a board update: read the report
  and diff (`symcc board task T-5`, `/symcc-diff`), then `symcc approve T-5` or
  `symcc reject T-5` with a reason. The lead may approve a lead gate on its own; an owner gate
  still needs the owner's word (the rule already in the lead's instructions,
  `hooks/plugin/tools.ts:274`). The owner can always approve either gate.
- `approve` (`workers.ts:813`) and `reviewTask` (`review.ts:97`) learn about stages: on a task
  whose gate isn't the last step, approve calls `runStages` instead of `mergeFinished`.

### The board mode

Keep the board-wide `mode` (`off` / `review` / `auto`) and `needs_review`. They mean: "add an
owner gate just before merge". So:

- `auto`: only the kind's own gates stop the task.
- `review`, or `needs_review` on a task: an owner gate is added before the merge step, if the
  kind doesn't already end with one. `needsReview` (`review.ts:11`) becomes
  `gatesFor(board, kind, task)`, which returns the stage list with that extra gate.
- `off`: nothing runs, as today. Gates already waiting can still be answered.

Why keep it: the `m` key and `/symcc-mode` are the owner's quick "I want to see everything for a
while" switch. Kind gates are about what a kind *needs*; the mode is about what the owner wants
*today*. They add up and never clash.

`tests_with_changes: review` (`untestedChange`, `review.ts:58`) also stays: it adds the same
owner gate for code with no test.

---

## 5. Epics

### Id: T-n with kind epic

An epic is `T-12` with `kind: epic`, not `E-12`. Why:

- One id space: `after: ["T-12"]` works between an epic and anything else, with no change to
  `normId` / `find` (`board-file.ts:397`, `:402`), `ready` (`task.ts`), archiving or stats.
- The board, history, reports and `/symcc-task` all work on it as they are.
- The owner says "T-12" for everything. The row shows `epic` next to the id, so it is still easy
  to see.

### Spec file

`docs/specs/T-12-<slug>.md` (slug from the title, the same way `noteTopic` in `task.ts` makes
research note names). It is the epic's only file during the spec stage (`files: spec`). It stays
in the project after the epic is done: later tasks and people can read why the feature is built
the way it is.

### Branch and parent/child links

- The epic has its own branch `symcc/T-12`, made from the owner's branch when the spec stage
  starts. The spec is committed there.
- Each child has `parent: "T-12"` (a new field on `BoardTask`, checked in `addTask` /
  `patchTask`: the parent must be an open epic) and **merges into the epic's branch**:
  `merge_into: "symcc/T-12"` (the field already exists; `intoOf`, `board-file.ts:295`). So a
  child starts from the epic's branch (`prepareWorktree` already does `worktree add -b <branch>
  <dir> <target>`), sees the spec, and its merge goes through all of today's checks.
- `moveTarget` (`review.ts:307`) moves the epic branch forward. For a branch the owner doesn't
  have checked out, it only runs `git update-ref <ref> <to> <from>` (a compare-and-swap) and
  touches no files. It only looks at the owner's own checkout (`checkedOut`), so if the epic's
  folder still had `symcc/T-12` checked out, that folder would silently fall behind. So the
  epic's own folder is removed after the spec stage and made again for the accept stage.
- `after` between children works as today: the lead sets it from the spec's task list. A child
  may also wait on tasks outside the epic.
- Children keep their own kinds (a `bug` child runs reproduce → fix as usual).
- While children run, `main` moves on. Before each child starts, symcc brings the epic branch up
  to date with the owner's branch (one merge, like step 3 of today's merge). A clash there makes
  the epic wait and tells the lead.

### The stages

1. **spec**: the lead writes what it knows from the chat into the epic's details (goal, what the
   owner said, limits). A `planner` worker reads the code and writes the spec file: goal,
   behavior, edge cases, what must not change, how we know it works, the task list with kind,
   role, files and after for each.
2. **approve-spec** (owner gate): the owner reads the spec (Enter on the epic shows it). Reject
   with a reason: a fresh planner rewrites it.
3. **build** (children): the lead is woken: "T-12's spec is approved: add its tasks with
   `symcc add` and `parent: T-12`". The stage passes when the epic has at least one child and
   every child is `done`. A child that is `failed` or `dropped` keeps it waiting, and the lead is
   told (the same as a stuck `after` in the board health check, `hooks/core/health.ts`).
4. **accept**: a fresh `checker` in the epic's folder (now at the merged epic branch) tests the
   whole feature against the spec and adds acceptance tests.
5. **accept-tests**: runs the tests. If they fail, the epic goes back to **build**: the lead
   gets the checker's report and adds child tasks for the gaps; when those are done, accept runs
   again. At most 2 times, then the epic fails and the lead asks the owner.
6. **approve** (owner gate), then the **merge** step merges `symcc/T-12` into the owner's branch
   with today's `checkAndMerge`. The epic is `done`; its children were already `done`.

Dropping an epic asks the lead what to do with open children (drop them too, or free them by
moving their `merge_into` to the owner's branch). It never drops them by itself.

### Who decides it's an epic

The lead, from its instructions (`hooks/plugin/tools.ts`, around line 275): "use epic when the
request needs 4 or more tasks, or the owner should agree on behavior before work starts". A
scout may say "this looks like an epic" in its report; the lead decides.

---

## 6. Board, panel, commands and lead tools

### Board row

Today the row's right side is the kind tag and role (`roleTag`, `kindTag`,
`hooks/core/panel.ts:106-109`). It becomes the kind and a stage strip:

```
T-5   Login fails with spaces      bug · reproduce ✓ · fix ▶ · merge
T-7   Export button                feature · code ✓ · break ▶ · merge
T-9   Is the cache worth it?       investigation · research ✓ · read ◆
T-12  CSV export                   epic · spec ✓ · build 3/6 ▶ · accept · merge
        T-13  Export endpoint      change · done
        T-14  Export button        feature · code ▶
```

- Only worker, gate and children stages are shown; checks are shown with the stage before them
  (✓ when it and its checks passed). Full detail is on the task page.
- When the row is too narrow, only the current stage is shown (`fix ▶ 2/4`).
- An epic row opens (Enter, or → like the Backlog fold, `foldedRow` in `panel.ts:172`) to show its
  children indented. Children are not repeated at the top level.
- The status column (`statusCell`, `panel.ts:87`) gains `lead check` for a lead gate.
- Backlog idea T-51 ("group task states into stages") fits here: the strip *is* the stage view.
  I did not read T-51's text (it's on the board in the main project folder, which a worker may not
  read); fold it into build step 8.

### Task page

A **Stages** section: each stage, its result, its try and report, how many go-backs are left.
For an epic: the spec (first lines, and its path) and the children list.

### Lead tools and slash commands

- `symcc add` / `symcc change` (`hooks/plugin/tools.ts:309`, `:314`): `kind` takes any kind name
  (T-328 does the enum; the description then lists the kinds and their `description`), and gain
  `parent` (an epic's id). `change` with a new `kind` on a task that started restarts it at the
  new kind's first stage (refused while a stage is being checked, as switching kind is refused
  now for some cases, `tools.ts:518-527`).
- `symcc approve` / `symcc reject` work on the current gate, owner or lead.
- `symcc board task T-5` shows the stages.
- The `symcc kinds` tool and Kinds view (T-329) show each kind's stages.
- No new slash commands are needed: `/symcc-approve`, `/symcc-reject`, `/symcc-diff`,
  `/symcc-task` cover gates.

---

## 7. Migration from today's board

- `kind` stays the field (the owner's wish, see the task's notes); there is no `kind → type`
  migration. T-328 already gives every task a kind name.
- Tasks have no `stage` yet. `migrateTask` (`board-file.ts:310`) sets it once, then the board is
  saved (it already counts `migrated`):
  - `todo`, `paused`, `failed`, `backlog`, `waiting`, `doing`: the kind's first worker stage
    (for every kind today this is the only worker stage, so nothing changes for them).
  - `review` of a change: `stage: "merge"` with the added owner gate (it waits as today).
  - `review` of an investigation: `stage: "read"`.
  - `done`, `dropped`: no stage.
- `test_output` becomes `check_output` in the same pass.
- Per the memory rule (no backward compatibility), once migrated there is no code that handles a
  task without `stage`; `cleanTask` gives a missing one the first stage.
- `kind: epic` and `parent` are new, so there is nothing to migrate for them.

---

## 8. Costs

Each worker stage is one worker run (the biggest cost: tokens and minutes). Checks cost only
test time. Gates cost nothing but waiting.

| Kind | Worker runs when all goes well | Test runs |
|---|---|---|
| docs | 1 | 0 when only docs changed |
| change | 1 | 1 |
| refactor | 1 | 1 |
| investigation | 1 | 0 |
| bug | 2 | 3 (fails-first, tests, again at merge on the base) |
| feature | 2 (code, break) | 2 to 3 |
| epic | 2 (spec, accept) + each child's cost | per child, plus accept |

Every go-back adds one more worker run. A feature whose checker finds a gap costs at least 3.

**The lead chooses by its own judgment (decision 1), and uses `change` for small fixes.** It is
today's flow, the cheapest kind that still runs the tests. The lead picks `bug` when there is a
clear wrong behavior to prove, and `feature` when it is new behavior worth a second look.

---

## 9. Decisions

The owner answered the open questions on 2026-11-17.

1. **Cost.** The lead picks `bug` or `feature` by its own judgment, not only when the owner asks.
   It uses `change` for small fixes.
2. **A checker test that expects the wrong thing.** The code worker may say in its report that the
   test is wrong. After 2 go-backs the lead decides. There is no extra lead gate.
3. **Running only the new tests.** Yes, as an option: `run:` may use a `{files}` placeholder.
   Without it, the full test command runs.
4. **The second fails-on-base run at merge.** Yes, it is done (one extra test run per bug).
5. **Epic branch.** The epic keeps its own branch `symcc/T-n`. Children merge into it, and it
   merges into the owner's branch only after the owner accepts the epic (section 5).
6. **Who writes the spec.** A planner worker writes the spec file, from the details the lead gives
   (section 5).
7. **Review mode and epics.** In review mode each child waits for the owner too, because children
   are normal tasks.

---

## 10. Build plan

T-328 (kinds as files, all still one stage; merged), T-329 (`symcc kinds` tool and Kinds view) and T-330
(docs) are already on the board, so this plan starts at step 2. All of it touches
`hooks/plugin/workers.ts` and `hooks/plugin/review.ts`, so it **must land before the Host
refactor (T-240..T-246, backlog)**, which changes the same files. Each task lists `tests/` (the
memory rule). Each step's tests run in `claude plugin test .`, the project's test command.

| # | Title | Files | After | How it is tested |
|---|---|---|---|---|
| 2 | Kinds: read stages from the kind file | new `hooks/core/stages.ts`, `hooks/core/kinds.ts` and `hooks/plugin/kinds.ts` (T-328's kinds parser), `kinds/*.md` (each still one worker stage + `tests`), `tests/` | T-328 | New `tests/stages.test.ts`: every built-in kind file parses into the expected stage list; files with an unknown key, a bad `on fail` target, `children:` outside epic are skipped with the right note; the merge step is added for `merges: yes` |
| 3 | Multi-stage workflows: stage on the task, run stages in order, `on fail` go-backs | `hooks/core/board-file.ts` (`stage`, `stages`, `backs`, `check_output`, migration in `migrateTask`), `hooks/core/stages.ts` (`nextStage`), `hooks/plugin/workers.ts` (`finishWork`, `runStages`, `settle`, `WORKER_PROMPT`), `hooks/core/prompts.ts` + `prompts/*.ts` (`{{stage}}`, `{{earlier_stages}}`), `hooks/core/roles.ts` (`tryLabel`), `hooks/plugin/git.ts` (`copyReports` from stages), `tests/` | 2 | Unit tests of `nextStage` (pass, go-back with count, go-back used up → failed). A run test in the style of `tests/merge.test.ts` with a test-only two-worker kind: two fresh workers run in the same folder, the second prompt names the first report, there is one merge. Migration test in `tests/board.test.ts`: a `review` change and a `todo` change get the right `stage` |
| 4 | Stages: per-stage time limit and retries | `hooks/core/task.ts` (`timeLimitOf`), `hooks/plugin/workers.ts` (`timedOut`, `askOvertime`), `hooks/core/settings.ts` (`onTestFail` takes the stage count), `tests/` | 3 | Tests: a stage with `minutes: 5` asks for more time at 5 minutes, not `max_minutes`; a `tests` check with `on fail … 1 time` fails on the second failure while `auto_retries` is 2 |
| 5 | Gates: owner and lead, and the board mode as an added owner gate | `hooks/core/review.ts` (`needsReview` → `gatesFor`, `reviewTask`, `rejectTask`), `hooks/plugin/workers.ts` (`approve`), `hooks/plugin/tools.ts` (approve/reject text, lead rules), `hooks/core/panel.ts` (`statusCell`: `lead check`), `tests/` | 3 | Tests: a lead gate wakes the lead and doesn't show under NEEDS YOU; the lead's approve moves to the next stage; `review` mode adds exactly one owner gate before merge and none for investigation; reject goes back to the worker stage before the gate |
| 6 | Built-in checks: tests, scope, no test files changed, new test fails on old code, run: | `hooks/plugin/review.ts` (pull `runTests` out of `upToDateTestMove`; new `checkStage`), `hooks/core/review.ts` (pure parts: which files are new tests, does the output name them), `hooks/plugin/git.ts` (throwaway worktree at base), `tests/` | 3 | Tests with a real git repo from `tests/project.ts`: a new test that passes on old code fails the check; one that fails passes it; a typo test that fails without naming its file fails it; a refactor diff that edits a test file fails `no test files changed`; the throwaway worktree is gone afterwards, also when the test command times out |
| 7 | Built-in kinds with their real stages, and the checker and planner roles | `kinds/bug.md`, `kinds/feature.md`, `kinds/refactor.md`, `kinds/docs.md`, `roles/checker.md`, `roles/planner.md`, `hooks/core/roles.ts` (`BUILT_IN_ROLES`), `hooks/plugin/tools.ts` (when to pick which kind), `tests/` | 4, 5, 6 | Tests: each built-in kind parses as written in section 1; a `bug` task runs reproduce → fails-first → fix → tests → merge with fake workers; `docs` with only `.md` changes runs no tests, with a `.ts` change runs them; `tests/help-lead.test.ts` checks the lead's kind advice |
| 8 | Epic kind: parent, epic branch, children stage, spec, acceptance | `kinds/epic.md`, `hooks/core/task.ts` (`parent` in `addTask` / `patchTask`, spec path), `hooks/core/board-file.ts` (`parent`), `hooks/plugin/workers.ts` (children stage, bring epic branch up to date), `hooks/plugin/git.ts`, `hooks/core/health.ts` (a failed child), `hooks/plugin/tools.ts` (`parent` on add/change, epic rules), `tests/` | 7 | Tests: a child gets `merge_into: symcc/T-n` and starts from it; build passes only when all children are done and at least one exists; a failed child tells the lead once; failing accept tests send the epic back to build and wake the lead; the epic merges its branch into the owner's branch at the end |
| 9 | Board view: stage strip, epic progress and fold (with backlog idea T-51) | `hooks/core/panel.ts` (`rowExtra`, `roleTag`, `statusCell`, fold), `hooks/plugin/ui/list.tsx`, `hooks/plugin/ui/task-page.tsx` (Stages section), `hooks/core/details.ts`, `tests/` | 3, 8 | `tests/pane.test.tsx`: the rows in section 6 render as shown, the strip shrinks to the current stage on a narrow panel, an epic folds and opens, children aren't listed twice |
| 10 | Docs: kinds and workflows in the guide | `docs/guide.md`, `README.md`, `CHANGELOG.md` | 7, 8, 9 | Docs only; `tests/help-lead.test.ts` still passes |

Steps 4, 5 and 6 can run side by side once 3 is done if they keep to their files; they all touch
`workers.ts`, so the lead should chain them with `after` unless it splits the edits cleanly.

---

## What I couldn't check

- T-51's exact text (the board is in the main project folder, which a worker may not read).
- Whether `claude plugin test .` prints the failing test's file name (needed for the "right
  reason" rule in section 3) and whether it can run a single file.

T-328 is merged. Its real names: `hooks/core/kinds.ts`, `hooks/plugin/kinds.ts` and `kinds/*.md`
(no `epic.md` yet).

## Recommended next step

Add build step 2 behind T-328 (now merged), and steps 3 to 10 chained with `after` as in the
table.
