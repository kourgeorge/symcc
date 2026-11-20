# One merge line for the whole project

The plan from investigation T-544 (the owner said "ok do it"). It was built in 6 steps (T-546 to
T-551), all merged. Later work (T-552) reads this note.

## Why

Before, a task could reach a merge by many paths, each with its own way of waiting. `tests.lock` made
only one task's tests run at a time, but it did not cover the catch-up with main or the move of main.
So main could move between a task's tests and its merge, and the task then raced, clashed, or was
tested again. Now there is one line, and main can't move during a turn.

## The flow as built

    hand-back
      → prep
      → checker (if on; runs before the line, runs no project tests)
      → [ONE MERGE LINE, whole project, shared by all sessions, oldest first]
      → at its turn, in one go:
          catch up with main
          → tests (skipped if this exact tree already passed, T-527)
          → merge

Only the task at the front merges, so main can't move during a turn. Any failure is one normal failed
try. The failures are: tests fail, tests time out, a clash with main, the turn ran over its time, or
main was moved by hand during the turn. There is one time limit per turn.

Every way into a merge joins the same line: `finishTry`/`finishWork`, approve
(`mergeFinished`/`mergeWork`), running the tests again by hand, `retryFileWaits` → `mergeWaiting`, and
`restartCheckers` → `checkerStepAgain` (which starts the checker again before the line). The checker (`afterChecker`, hooks/app/workers.ts) is done
before the task joins; there is no second trip through the line after it.

## The line

- Kept in `<board folder>/merge-line.json` (`MERGE_LINE_FILE`): a list of entries, oldest first.
  Each entry has the task id, a key for that one go, the session, when it joined, and `at` (the last
  time its copy of the plugin said it is alive).
- `inMergeLine` (hooks/app/merge-line.ts) joins the back of the line, waits until it is at the front,
  runs the turn, and leaves however the turn ends. `checkAndMerge` runs its whole turn
  (`upToDateTestMove`: catch-up, tests, move) through it.
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

## History: the 6 steps (all merged)

1. T-546: the line itself; every way into a merge joins it.
2. A test time-out became a normal failure (the timed-out-tests rerun was cut).
3. A clash with main became one normal failed try (the extra conflict tries were cut).
4. One time limit for the turn (the "ran over before" split was cut).
5. The race retry was cut; notes and guide tidied.
6. The checker runs before the task joins the line; its second trip was cut.

## Costs

- Merges go one at a time, project-wide. The last of 5 tasks that finish together, each with
  10-minute tests, waits about 40 minutes for the 4 in front of it, so it merges after about 50
  minutes.
- In return: no races with main during a turn, no second test run after a race, and one simple
  rule for every path into a merge.
