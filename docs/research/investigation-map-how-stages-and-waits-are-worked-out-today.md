# How stages and waits are worked out today, and one shared `taskPhase`

This note keeps the answer of task T-608. It was written on 2026-11-20 from the code at that time.

## The question

Map how stages and waits are worked out today, and propose one shared `taskPhase(t, now)` that every view reads. The 9 states stay as they are. "In queue" is saved as a real step.

## The short answer

The 9 states are clean. Stages and waits are worked out in about 15 small helpers spread over 5 core files, plus some inline checks in the host views. The helpers read different fields. The queue is read from the note text. The steps are read from `checking`, which counts as stale after 3 minutes. So the helpers really do disagree. One shared `taskPhase(t, now)` in core, with "queue" saved as a real step, would remove all the disagreements and change no saved state.

## 1. What decides the stage or the wait today

| Helper (file:line) | What it reads | Who uses it |
|---|---|---|
| `checkStepNow` (core/lead.ts:183) | `checking.step/at`; status must be doing, review or waiting; stale after `FINISH_STALE_MS` | almost every helper below, banner.ts, merge-line.ts |
| `approveRunning` / `shownStatus` (lead.ts:191, 194) | status other than doing, plus a fresh step | every list, band and count (banner.ts, list.tsx, vscode-list.tsx, above-prompt.tsx, opencode/board-view.ts) |
| `finishingNow` (lead.ts) | `finishing`, doing only | panel, workers |
| `waitsInLine` (core/panel.ts:105) | the note matching `queue (n)`; doing only; never goes stale | rowMark, rowCell, details.ts |
| `inLineNow` (core/details.ts:45) | the same pattern, but treats review as doing (not waiting) | stepNowWord, statusBadge, taskStage |
| `rowMark` (panel.ts:109) | the note, plus approveRunning (counts review and waiting) | every row view |
| `statusCell` / `rowCell` (panel.ts:151, 205) | step, time_ask, runs, kind | lists, band, VS Code |
| `stepNowWord`, `statusBadge`, `taskStage` (details.ts:37, 59, 82) | step, the note pattern, and a `merging` flag passed by some callers | task pages: terminal, VS Code, OpenCode |
| `asksMoreTime` / `needsYou` / `waitsForYou` (core/commands.ts:168-179) | time_ask, status, approveRunning | lists, band, voice |
| `waitsForFiles` (core/board-file.ts:169) | `merge_wait`; waiting or review | panel, health, task, workers, tools |
| `fileWaitText`, `asksOwner`, `taskAsks`, `rowExtraOf` (panel.ts:316, 547, 552, 290) | merge_wait, question, `asked_files`, time_ask | rows and answer boxes |
| `boardRow` (core/banner.ts:311) | its own order: question, then failed, then note, then APPROVED_NOTE | the lead's text board |
| Inline checks in host views | the bold title (list.tsx:181, board-view.ts:719), the "waited" time (vscode-list.tsx:123), and the band's end text, written twice the same way (above-prompt.tsx:53, board-view.ts:233) | |
| Writers | `markStep` (app/review.ts:344) saves the step; `inMergeLine` (app/merge-line.ts:207-224) writes the note `queue (n)` and puts the old note back when its turn comes | |

`ownersTurn` (T-606) was not on main yet when this was written.

### Disagreements reproduced

These came from running the real core helpers with bun on sample tasks.

1. **A waiting task merging after the owner's files are clear, while in the queue.** The row shows `⋯`, but the page badge says `✎ prep` and the Stage line is missing. Cause: `inLineNow` maps only review to doing, not waiting.
2. **A review task whose saved note is still `queue (2)` but has no fresh step** (the plugin died or reloaded while the task waited). The row shows `◆ review` and needs-you is true, yet the page badge says `⋯ queue (2)` and the Stage line says it is in the queue. The note never goes stale.
3. **A doing task with that same leftover note** shows `⋯` with no time limit.
4. **"More time?" after the hand-back.** The hand-back (app/workers.ts:289) sets `finishing` but does not clear `time_ask`. So a task in the checker, queue or test step still counts as needing the owner, and `taskAsks` still offers "more time?". The helper outputs were confirmed. That a real task can reach this was worked out from the code, not seen in a full run.
5. **The terminal task page's badge and Status row can differ.** The badge gets the `merging` flag (task-page.tsx:217). The Status row and Stage line (`detailRows`, details.ts:152) do not. For a moment after you approve, the badge says `✎ prep` while the Status row says "ready for review". OpenCode never passes the flag.
6. **The Stage line can go backwards.** A merge turn starts with `markStep('merging')` for the catch-up with main (review.ts:369), then `testing`, then `merging` again. The page shows `● merge`, then `● test`, then `● merge`.
7. **Wording differs.** For a running approve, the lead's text board shows the step note, while the owner's lists show "approved, merging".

### Disagreements the checkers found that week (from board history)

- **T-587, tries 1 and 3:** the Stage line for an approved review task disagreed with the badge. Then a review task waiting in the queue was still shown as "prep".
- **T-511 try 4, then T-532, T-534 and T-541:** "waiting for you" was worked out separately in each view, so it took three follow-ups to fix them one by one.
- **T-596:** an approved task that is merging had to be taken out of needs-you on every board, in each view separately.
- **T-605 try 1:** words left over after the queue note changed wording. The rename also needed a board conversion of the note text. One stale comment is still there: merge-line.ts:166 says "in line (n)".

## 2. Proposal: one pure helper in a new `hooks/core/phase.ts`

`taskPhase(t, nowMs, board?, { merging? })` returns:

- `state`: the saved status, unchanged.
- `shown`: `doing` while an approve or files-merge runs (replaces `shownStatus`).
- `stage`: `'worker' | 'prep' | 'checker' | 'queue' | 'test' | 'merge' | null`, plus `place` (n) when in the queue.
- `waitsFor`, which is null while anything runs:
  - `'answer'`: waiting with a question.
  - `'files'`: waiting with `asked_files`.
  - `'your-files'`: has `merge_wait`.
  - `'review'`: in review (an answered investigation can be marked by its kind).
  - `'time'`: doing with `time_ask`, only in the worker stage.
  - `'failed'` (suggested), so the needs-you check becomes simply "waitsFor is set".
- `approved`: true while an approve or files-merge runs.
- `since`: for waits, `updated_at`; for the worker stage, the start of the last try. No step start time is saved today: `checking.at` only says the task was still in the step a moment ago. Adding one would need a new `checking.from`.

Every helper in the table becomes a few lines over `taskPhase`, or goes away (`inLineNow`, `waitsInLine`). The inline host checks become `phase.waitsFor` or `phase.shown`.

### Saved fields that change

- `CheckStep` gets `'queue'`, and `Checking` gets an optional `place`.
- `inMergeLine` saves `checking: {step: 'queue', place: n, at}` through a guarded step marker, just as `markStep` does.
- The existing refresh in workers.ts:492/503 already copies the whole `checking` object, so `place` is kept, and the queue goes stale like every other step. That alone fixes disagreements 2 and 3.
- The note can still say "queue (n)" for people to read, but nothing decides anything from it any more.
- `time_ask` is also cleared at the hand-back.

### One-time board conversion (in `migrateTask`)

- A task with the note `queue (n)` and a `checking` becomes `checking {step: 'queue', place: n}`.
- A task with that note but no `checking` gets the note cleared.
- Because there is no backward compatibility rule, the same task drops the T-605 "in line (n)" conversion and the old `'checking'`-means-`'prep'` reading in `asChecking`.

## 3. What stays as it is on purpose

- The 9 states (`SymccStatus`, types/index.d.ts:7), the board's `status` field, and an approved task staying in `review`. `shown` only changes how it is displayed.
- Kinds stay labels, and the investigation still has no stage.
- The one fixed flow (worker, prep, checker if on, queue, test, review if needed, merge). There is no configurable stage engine.
- The icons and words (`STEP_ICON`, `STEP_WORD`, `STEP_LEGEND`), and `checkStepNow` as the low-level check for "is this step still fresh".

## 4. Plan of small tasks, in order

1. **Add `taskPhase`**, reading today's fields (including the note for now), with a new tests/phase.test.ts covering a table of tasks (each state, each step, stale step, waiting files-merge, time_ask in a step). Nothing else changes; no snapshots change. Run it after T-606 is merged.
2. **Rewrite the core helpers as thin wrappers:** approveRunning, shownStatus, needsYou, waitsForYou, ownersTurn, asksMoreTime, rowMark, statusCell, rowCell, stepNowWord, statusBadge, taskStage. This fixes disagreements 1 and 2. Tests: board.test.ts, merge.test.ts, pane.test.tsx, vscode-board.test.tsx, vscode-task-page.test.tsx, hooks/opencode/tests/opencode-tui.spec.ts. The snapshot files tests/board-snapshot.ts, tests/task-page-snapshot.ts and tests/task-page-mobile-snapshot.ts should stay unchanged, because their sample tasks have no steps or queue. That is the check that nothing else moved.
3. **Save the queue as a real step** (`'queue'` plus `place`, written by inMergeLine), have `taskPhase` read it, and do the one-time conversion while removing the old ones. Tests: merge.test.ts (queue tests), board.test.ts (conversion), opencode-tui.spec.ts. No snapshots should change.
4. **Clear `time_ask` at the hand-back**, and have `taskPhase` report a time wait only in the worker stage. Tests: merge.test.ts.
5. **One `merging` input for the whole page:** pass it to `detailRows` as well, and have OpenCode pass it too. Tests: approve-feedback.test.tsx, vscode-task-page.test.tsx. The task-page snapshots don't change.
6. **One shared row-end helper** for the band (above-prompt.tsx, board-view.ts) and the lead's `boardRow`, reading `phase.waitsFor`. Tests: pane.test.tsx, board.test.ts, opencode-tui.spec.ts. Snapshot board-snapshot.ts only if a wording changes.
7. **Open question for the owner:** should the catch-up with main at the start of a turn show as "merge" (as today, so the Stage line jumps back to "test") or as "test"? This is a one-line change in review.ts:369 plus a test in merge.test.ts.

Recommended next step: queue tasks 1 to 3 as a chain after T-606, then 4 and 5. Each is small, and tasks 1 and 2 change no behaviour except the bugs above.

## How this was found

The helpers were found by reading the core files: details.ts, panel.ts, lead.ts, commands.ts, board-file.ts and banner.ts, plus app/merge-line.ts, app/review.ts and app/workers.ts. The disagreements were reproduced by running the real core helpers with bun on sample tasks (the script was a throwaway). The checker history came from the board.

Not checked: no full test suites were run. Disagreement 4 is worked out from the code, not seen on a real board.
