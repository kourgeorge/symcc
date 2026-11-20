# One merge line for the whole project

The plan from investigation T-544 (the owner said "ok do it"). It is done in 6 steps, one task each;
step 1 is T-546. Later steps read this note to know where the work is going.

## Why

Before, a task could reach a merge by many paths, each with its own way of waiting:

- `mergeTurn` (hooks/app/review.ts) kept merges into one branch in turn, but only inside one copy of
  the plugin (one session), and not across branches.
- `tests.lock` (T-416, `withTestLock`) made only one task's tests run at a time, project-wide, but
  it covered the tests only, not the catch-up with main or the move of main. So main could move
  between a task's tests and its merge, and the task then raced (`MAX_MERGE_RACES`), clashed
  (`conflict_tries`, `merge_main`), or was tested again.

## Target flow

    hand-back / approve / rerun / "your files are clear" / reload
      → [ONE MERGE LINE, whole project, shared by all sessions, oldest first]
      → at its turn, in one go:
          catch up with main (git merge)
          → tests (skipped if this exact tree already passed, T-527)
          → merge

Main can't move during a turn, because only the task at the front merges. Any failure is one
normal failed try.

## The line (step 1, T-546)

- Kept in `<board folder>/merge-line.json` (`MERGE_LINE_FILE`): a list of entries, oldest first.
  Each entry has the task id, a key for that one go, the session, when it joined, and `at` (the last
  time its copy of the plugin said it is alive).
- `inMergeLine` (hooks/app/merge-line.ts) joins the back of the line, waits until it is at the front,
  runs the turn, and leaves however the turn ends. `checkAndMerge` runs its whole turn
  (`upToDateTestMove`: catch-up, tests, move) through it, so every entry point joins the same line:
  `finishTry`/`finishWork`, `afterChecker`'s second `checkAndMerge`, approve
  (`mergeFinished`/`mergeWork`), `rerunTests`, `retryFileWaits` → `mergeWaiting`, and
  `restartCheckers` → `checkerStepAgain` (which starts the checker again before the line).
- Changes to the file are made under the board lock, so two sessions never lose each other's change.
- Tasks of one copy wake each other when one leaves (no polling); a task with another session's task
  in front looks again every 2 seconds (`MERGE_LINE_POLL_MS`).
- Stale rule (like tests.lock's): an entry of another copy is cleared when it is older than twice
  `test_minutes` (`mergeLineStaleMs`), or its task is no longer being checked by anyone (gone from the
  board, or its check mark is no longer refreshed), or it is an earlier go of a task this copy checks
  now. The turn dates its entry again before each test command.
- Survives a reload: the file stays; a task that was in line simply joins again (its old entry goes).
- While it waits, the task's note says "in line (n)" (`inLineNote`, n = its place; the task whose turn
  it is now is 1). During its turn the steps show as before (prep / test / merge). The time limit
  stops while it waits and starts from zero when its turn begins.
- A step given up as stuck (`release`) leaves the line at once, so the ones behind it go on.
- `mergeLineBusy` replaced `testsRunningNow` for the timed-out-tests rerun (it waits while anyone is
  in line).
- For now the outcomes stay the same: the race retry, conflict handling and time-out paths are kept;
  the later steps cut them.

## The 6 steps

1. This line (T-546): one merge line for the whole project; every way into a merge joins it.
2. A test time-out is a normal failure: cut `test_rerun`, `rerun_minutes`, `rerunTimedOutTests`, and
   the "ran out of time twice" question.
3. A clash with main is one normal failed try: cut `conflict_tries`, `merge_main`, `MAX_CONFLICT_TRIES`.
4. One time limit for the turn: cut the `ranOverBefore` / `mergeRanOverBefore` split.
5. Cut `MAX_MERGE_RACES` and tidy the notes and the guide.
6. The checker runs before the task joins the line: cut `afterChecker`'s second trip.

## Costs

- Merges go one at a time, project-wide. The last of 5 tasks that finish together, each with
  10-minute tests, waits about 40 minutes for the 4 in front of it, so it merges after about 50
  minutes.
- In return: no races with main during a turn, no second test run after a race, and one simple
  rule for every path into a merge.
