# Investigation: trust numbers on the board (first-try rate, tokens per merged task, owner interventions)

Task T-990, answered on 2026-11-24. Kept as a note by T-994.

## The question

Can the board show three "trust" numbers: how often a task merges on its first try, how many
tokens a merged task costs, and how often the owner has to step in? What data is already there,
what is missing, and how big would the build be?

## How it was found

By reading the code (hooks/core/history.ts, runs.ts, stats.ts, live.ts, board-parts.ts,
events.ts, review.ts, task.ts, questions.ts, hooks/app/tools.ts, hooks/app/cleanup.ts and
types/index.d.ts) and by counting on a copy of the owner's real board data. Line numbers below
are as of 2026-11-24 and may have moved since.

## Short answer

Two of the three numbers are already worked out for **today** on the Live tab, and the board's data covers them for yesterday and the last 7 days too. Owner interventions are the gap: only 3 of the owner's actions are recorded in a form symcc can count reliably, a few more show up only in the words of a history line, and one (a manual retry of a failed task) leaves no history line at all. The smallest build that would work is one new marker on history entries saying "the owner did this", plus extending the existing Yesterday and 7 days lines. That is about 2 tasks of moderate size.

## Sample numbers from the owner's real board

Read from /tmp/symcc-data on 2026-11-24 at about 17:00 UTC. I only counted change tasks (not investigations) that were merged by a try. Local time is UTC+2. The board keeps 7 days of done tasks (`archive_days` is 7), so all of them were on the board. My scripts were in /tmp/t990 and are deleted now.

| | today | yesterday | 7 days |
|---|---|---|---|
| merged tasks | 35 | 55 | 547 |
| first try: one run only (what Live and /symcc-stats show) | 51% | 51% | 45% |
| first try: no send-back or failure | 60% | 55% | 50% |
| tokens per task, median (tasks with every agent's tokens) | 1.59M (31 of 35) | 2.50M (47 of 55) | 1.14M (169 of 547) |
| tokens per task, average (same tasks) | 5.00M | 3.64M | 3.04M |
| owner actions per merged task, reliable only | 0.06 | 0.09 | 0.08 |
| plus actions found only in the line's words | 0.34 | 0.22 | 0.18 |
| plus the lead's answered questions (Q-n) | 0.86 | 0.55 | 0.27 (too low, see below) |

Notes on these numbers:
- **First try:** the two versions differ because some extra tries are not the AI's fault:
  - 108 restarts in 7 days happened because the task was changed (reason "changed").
  - 19 runs ended because the plugin reloaded mid test-and-merge.
  - 76 failures were clashes with main. Leaving those out gives 53% for 7 days.
  - Over the 7 days, the reasons for failed tries were: checker 406, clash 76, tests 59, other 25, scope 6, stopped 6, rejected 2, timeout 1, no result 2.
- **Tokens:** the 7-day token figures are not trustworthy yet:
  - Runs from 11-17 and 11-18 recorded no agents, so no tokens at all.
  - Checker tokens are only recorded from about 11-22 (on 11-20, 0 of 158 checkers had tokens; on 11-24, 72 of 74 did).
  - This fixes itself within a week.
  - Tokens are workers plus checkers only. The lead's and scouts' tokens are not included.
- **Owner actions over 7 days, all tasks:**
  - Reliable: approve 29, answer 14, reject 2.
  - Found only in the words: read an investigation's answer 37, files allowed 11, asked more 3, more time 2, "stop it" 1.
  - The lead's Q-n questions: 50 answered (41 in the chat, 6 on the board). This is too low because `QUESTIONS_KEPT = 50` (hooks/core/questions.ts:62) only keeps the newest 50, and the oldest kept is Q-104 from 11-22.

## What is already there (exact)

- **History entries** carry `try`, `step`, `result`, `reason`, `how`, `owner` and `backlog` fields. See types/index.d.ts:96-118 and the list of kinds in `HISTORY_KINDS` (hooks/core/history.ts:175). Failure reasons are typed `SymccFailReason` (types/index.d.ts:124).
- **Tokens per try** are the sum of each agent's tokens, checkers included: `tryTokens` and `checkerTokensOf` (hooks/core/runs.ts:151-160). Per-task sums come from `taskFigures` (hooks/core/stats.ts:83).
- **First try today and tokens per task today** already exist:
  - `todayMore` (hooks/core/live.ts:1051) works them out: `firstTry` counts `tries === 1` (line 1114), and `perTask.tokens` is the median (line 1105).
  - They are drawn on Today's third line (live.ts:1222) and in the VS Code "Per task" row (live.ts:1395-1404).
  - Small mistake: the terminal line labels it "avg ⌀ X/task" (live.ts:1231), but the number is the median.
- **/symcc-stats** has "right first try" (stats.ts:556, `runs.length === 1`), plus the average and median tokens per done task (stats.ts:669).
- **Yesterday and 7 days lines** already exist: `pastDays` and `pastLines` (live.ts:1295-1351) show merged · tokens · time. They are fed from `v.tasks`, which keeps `runs`; done-task stubs keep only `merged`, `checker-problems` and `failed` marks (`VIEW_MARK_KINDS`, hooks/core/board-parts.ts:137).
- **Owner actions with their own reliable record:**
  - approve: a merged line with `how: 'approved'`.
  - reject: the 'rejected' kind (hooks/core/review.ts:143).
  - answer: the 'answer' kind, written through the lead's `change answer:` (history.ts:147).
  - files not allowed: the 'files-refused' kind (hooks/core/task.ts:235).
  - Run now: the 'run-now' kind.

## What is missing

- **No marker on shared kinds.** These owner actions share a kind with non-owner events, so the only way to tell them apart is the line's words (and readers must not parse line text):
  - files allowed: 'files-widened' (task.ts:224), also used for the lead's changes.
  - more time: 'step' (hooks/app/cleanup.ts:240).
  - "Stop it": 'out-of-time' (cleanup.ts:174).
  - asked more on an investigation: 'asked'.
  - read the answer / Done: 'done'.
- **A manual retry of a failed task writes no history line.** In hooks/app/tools.ts:809-813, a line is written only when the task comes back from dropped. So retries can't be counted at all.
- **Symcc can't tell who started an action through the lead's tools.** `answer` is the owner's answer passed on by the lead. But `retry`, `change` (restarts), `resume` and `note` may be the lead's own idea or the owner's request. Board button presses are clearly the owner's.
- **The lead's Q-n questions** have no task id, and only the newest 50 are kept. So "per task" can only mean "per merged task in the window", and 7 days needs a running count, not the list.

## Proposed display (one line, fits narrow panels)

Add one Today line under the per-task line, and the same numbers on the Yesterday and 7 days lines:

    first try 51% · ⌀ 1.6M/task · 0.3 you/task
    Yesterday ✓ 55 · 51% · ⌀ 2.5M · 0.2
    7 days    ✓ 547 · 45% · ⌀ 1.1M · 0.2

- When the panel is narrow, drop parts from the end (the same way `pastLines` already does).
- In VS Code, add a "Trust" row next to "Per task", plus columns on the Yesterday and 7 days rows.
- Keep "first try" as one run only, so it matches /symcc-stats. You could add a dim "(55% without restarts from changes)" in /symcc-stats only.
- Count "you/task" as owner actions in the window divided by tasks merged in the window. That way actions on failed or dropped tasks still count.

## Size of the build

- **Task A: record owner actions.**
  - Add one new fact, e.g. `by: 'owner'`, to history entries.
  - Set it where the owner acts (about 8 places): files allowed and refused, more time, stop it, ask more, read the answer, approve and reject from the board, and retry.
  - Add a new 'retried' line for failed → todo.
  - Keep a small counter of answered Q-n questions per day.
  - About 80-120 lines plus tests in tests/.
  - Open choice for the owner: should retries and changes started by the lead count? I'd say only board presses and relayed answers count.
- **Task B: display.**
  - Add the figures to `pastDays`.
  - Fix the "avg" label so it says median.
  - Add the new line and row.
  - Add owner-act marks to `VIEW_MARK_KINDS`.
  - Update snapshots for terminal, desktop, mobile and VS Code, plus site/demo.js and docs/guide.md.
  - About 100-150 lines plus snapshot updates.
  - Task B must wait for Task A to merge (set it to run after Task A).

## Recommended next step

Queue Task A, then Task B after it. Until Task A lands, the existing Today first-try and per-task numbers are correct for today. The 7-day token numbers will only be complete from about 2026-11-29.

