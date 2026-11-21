# Which of symcc's saved data is redundant or messy, and how to clean it up

This note keeps the answer of task T-802. It was written on 2026-11-22 from the code at that time. File and line numbers point to that code and may have moved since.

## The question

Which of symcc's saved data is redundant or messy, and how to clean it up?

## The short answer

Four things cause most of the mess.
1. The history saves facts as English sentences, and two separate sets of patterns read them back.
2. One try's tokens and agent ids are kept in three to six places, and three writers must keep them in step by hand.
3. Fields that belong to the running try sit loose on the task, and `note` quietly works as a state field.
4. About ten one-time migrations still run on every read.

All four can be fixed with one migration of the owner's board, since no backward compatibility is needed.

## How it was found

The T-802 worker read the code only and changed no files. Files read: `types/index.d.ts`, `hooks/core/board-file.ts`, `hooks/core/runs.ts`, `hooks/core/history.ts`, `hooks/core/board-parts.ts`, `hooks/core/stats.ts`, `hooks/core/live.ts`, `hooks/core/task.ts`, `hooks/core/events.ts`, `hooks/core/scouts.ts`, `hooks/core/passed-trees.ts`, `hooks/core/archive.ts`, `hooks/core/panel.ts`, `hooks/core/banner.ts`, `hooks/app/state.ts`, `hooks/app/lead.ts`, `hooks/app/checker.ts`, `hooks/app/debrief.ts`, `hooks/app/workers.ts`, `hooks/opencode/view.ts` and `hooks/opencode/board-view.ts`.

What it could not check: the Bash guard refused every read of the owner's `.symcc/` folder ("names .symcc in the owner's copy"). So there are no real figures from the owner's board, such as how many tries still hold `unsplit` tokens, how many history lines are old strings, or whether `attempts` ever differs from `runs.length`. Every example below is from the code, with file:line. Anything not confirmed is marked as a guess. (Below, "I" is the T-802 worker.)

## The findings, in order of value

### 1. History lines: the facts live only in the text, and two pattern sets read them back (high value, medium-large change)

Where:
- A history entry is only `{ at, kind, text }` (`types/index.d.ts:87`).
- The try number exists only as the words "try 2 (role tester): ", read back by `tryParts` (`hooks/core/history.ts:286`).
- `kind: 'stage'` covers both "worker started / handed back" (`history.ts:68-90`) and the check steps (`hooks/core/events.ts:60`).

How the facts get re-read from the text:
- **Stages:** a task event has a clean `to: 'prep'` and `try`. `stageLine` (`events.ts:63`) turns it into the text "try 1: prep started". Then two places parse that text back:
  - `entryStage` (`hooks/core/stats.ts:210`) uses `/^prep started/`.
  - `stationSince` and `approveSince` (`hooks/core/live.ts:192`, `:203`) use `text.includes(': prep started')`.
  - So there are two parsers for one fact.
- **Try results:** two separate word lists decide where the result starts after " → ":
  - `RESULT_GOOD` / `RESULT_BAD` / `RESULT_KNOWN` plus `resultArrow` (`history.ts:272-283`), used for drawing.
  - `OUTCOME_START` plus `resultCut` (`stats.ts` near line 150), used for stats.
  - They have already drifted: `OUTCOME_START` knows "tests ran out of time" and "your files on … can't be updated", but `RESULT_KNOWN` does not. So the same line can be cut at a different arrow on the task page than in /symcc-stats.
- **Failure reasons:** `failReason` (`stats.ts:96`, about 35 regexes) works out why a try failed from the text. That fact is already saved in structured form on the try (`runs[].ended_by`, `ended_note`, `failed_command`). It is also written into `note`; see finding 5.
- **How a task ended:** `mergedHow` (`stats.ts:160`) looks for `/ → merged into /` and `/approved by the owner/`. It does not match "already merged into", which `RESULT_GOOD` does count as merged.
- **Restart check:** `workerStartedEntry` (`history.ts:79`) builds a regex from the try number to find its own earlier line.
- **Confusing name:** the kind `approved` has tone "bad", because it means "approved, but could not merge" (`history.ts:177`).

**Fix:** give each entry structured fields: `try?: number`, `step?: 'worker-start' | 'handed-back' | 'prep' | 'checker' | 'queue' | 'tests' | 'merge'`, `place?`, `result?: string` (the part after the arrow), `reason?: FailReason`. Write them where the line is made. Then:
- Change `entryStage`, `stationSince`, `failReason`, `mergedHow` and `historyEvent` to read the fields.
- Delete both word lists, `resultArrow` and `resultCut`.
- Rename `approved` to something like `approve-failed`.
- Migrate once: run the current parsers over the saved lines one last time to fill the fields, then delete the parsers.

This touches every place that writes history (mostly `withHistory` calls in workers.ts, review.ts, tools.ts, cleanup.ts and checker.ts), so it is the biggest change here and the one that removes the most fragile code.

### 2. One try's tokens are kept in up to four places (high value, medium change)

Where (`types/index.d.ts:18-57`, `hooks/core/runs.ts`):
- `run.tokens` is the sum for the whole try, checkers included.
- `run.checker_tokens` (T-769) is the checkers' part, added into `tokens` as well.
- `run.agents[].tokens` (T-774) is per agent, but only for the latest 10 agents (`AGENTS_KEPT`) and only on the last 5 tries (`AGENT_TRIES_KEPT`). On older tries they are thrown away and only the sums stay.
- `unsplit` is a token kind for counts saved before the kinds were kept apart. It also appears in `ArchivedTotals` and in the scouts.json usage (`migrateScoutUsage`, `stats.ts:1020`).

Why it is a problem:
- Every writer must update two or three of these in step by hand:
  - `checker.ts:162` adds to `tokens` and `checker_tokens`, then calls `withAgentUsed`.
  - `debrief.ts:109-115` adds to all three, and works out "is this a checker" from `run.checkers`, not from `agents[].kind`.
  - `withStoppedUsed` (`runs.ts:199`) adds to the run, then to the agent.
- The comment at `debrief.ts:111`, "so the try's sum and its agents' agree", shows this has needed care before. I think T-774, T-784 and T-785 were fixes of this kind, but that is a guess from their notes.
- There is a real mismatch between doc and code. The comment on `checkerTokensOf` (`runs.ts:214-216`) says the agent entries come first and `checker_tokens` is the fallback. The code (`runs.ts:220`) does the opposite: `r?.checker_tokens ?? (agent sum)`. The note at `live.ts:816` matches the code, so the comment is the stale one.

**Fix:** make `run.agents[]` the only place tokens and cost are kept per try. Work out `tokens` and `checker_tokens` from it with a helper (`tryTokens(r)`, `checkerTokensOf(r)`).
- Keep cutting old agent **ids** for the guard's sake, but keep the agent's **tokens**. One entry is about 100 bytes.
- Debrief tokens go on the agent's own entry, as they already do.
- Migrate once: each old try with no agents gets one stand-in worker entry with `tokens - checker_tokens` and one checker entry with `checker_tokens`.
- `unsplit` can only go if no saved try, archive total or scout usage still has it. I could not check that. If some do, the migration could leave them as a plain old-tokens figure in the totals and drop the kind from `TOKEN_KINDS`.

### 3. "Who worked on this try" is kept in six places (high value, medium change)

Where:
- `task.agent`, the last worker (`types/index.d.ts:155`).
- `task.checker`, the checker running now (`board-file.ts:130`).
- `run.agent` and `run.checkers` (T-479).
- `run.agents[].id` with `.kind` (T-774).
- `run.restarts[].agent` (T-743). This type, `TryRun` / `RunRestart` in `runs.ts:18-20`, is not in `types/index.d.ts` at all.

Why it is a problem:
- `patchTask` copies between them (`hooks/core/task.ts:68-72`): `task.agent` to `run.agent`, `patch.agent` to both `run.agent` and `agents[]`, `patch.checker` to both `run.checkers` and `agents[]`.
- `withoutOpenRun` (`runs.ts:375-380`) moves a removed try's **worker** id into the previous try's **checkers** list, so "checkers" does not always hold checkers.
- `onRuns` (`runs.ts:285`) has to look in three lists, and `cleanup.ts:89` and `workers.ts:372` choose between `task.agent` and `run.agent`.
- The name `checker` means four different things: the board setting (`Board.checker: boolean`), the task's running checker id, the run's `checkers` list, and the history kind or role "checker".

**Fix:** keep `run.agents[]` as the single list. Add an `ended_by: 'restarted'` (or a `restart` reason) on the entry in place of `restarts[].agent`.
- The current worker is the last open worker entry of the last try; the current checker is the last open checker entry.
- A helper `agentsOnTask(t)` replaces `onRuns`.
- Drop `task.agent`, `task.checker`, `run.agent`, `run.checkers` and `restarts[].agent`. `restarts[]` can keep `at`, `why` and `started`.
- Rename the task's running checker id if anything still needs it (`checker_agent`).

The many `t.agent` readers (`agents.ts`, `workers.ts`, `cleanup.ts`, `git.ts`, `doctor.ts`) would call a helper instead.

### 4. Per-try fields sit loose on the task (medium-high value, medium change)

Where: `BoardTask` (`board-file.ts:108-130`) carries `session`, `finishing`, `checking`, `merge_wait`, `extra_minutes`, `time_ask`, `wrap_up`, `try_question`, `try_refused`, `checker`, plus `test_output` and `merge_main` on `SymccTask`. All of them mean something only for one try or one status.

Why it is a problem:
- `patchTask` needs a block of special cases to throw them away at the right moments (`task.ts:74-80`, `:104-108`).
- Many places list them by hand when a task moves on: `lead.ts:121, 227, 255, 296`, `workers.ts:490`, `board-file.ts:550`, plus `review.ts:134`, `task.ts:322, 438` and `workers.ts:1194, 1296, 1306`.
- `finishing` and `checking.at` are two heartbeats refreshed side by side (`workers.ts:560`).
- `merge_main` exists twice: on the task it means "the next try must merge main first"; on the run it means "this try did".
- `merge_main: false` is stored explicitly (for example `review.ts:134`, `lead.ts:229`), so the file carries `false` values.
- There is an orphaned doc comment at `types/index.d.ts:124`: "how many times a new try was started because the branch conflicted with main". It belongs to the removed `conflict_tries` (T-548) and now sits above `merge_main`.

**Fix:** move the try-only fields onto the open run, or into one `task.live` object, and clear them in one place when the try ends. Keep only `merge_main` on the task, as "next try merges main first", and store it only when true. Merge `finishing` into `checking`, using one `at` as the heartbeat.

### 5. `note` works as a hidden state field, and the stop reason is written three times (medium value, medium change)

Where:
- Code tests `note` against fixed values:
  - `claimNote` / `isClaimNote` (`app/starts.ts:94-97`; used at `workers.ts:176, 207, 1643`).
  - `CHECKER_NOTE` (`panel.ts:158`; `workers.ts:948, 967, 1695`). A reloaded copy finds a lost checker by the note.
  - `failedOnClash` (`task.ts:128`) uses `/^conflicts with the latest /` on the note.
  - `STATE_NOTES` (`banner.ts:202`) lists notes that repeat the state.
- The merge-queue place is saved twice. `merge-line.ts:220` writes both `note: "queue (n)"` and `checking: { step: 'queue', place: n }`. `stepNote` (`panel.ts:165`) also copies `checking.step` into the note.
- A single stop writes its reason three times. Example: `board-mode.ts:68` writes `note: "stopped by X; continues when the board runs again"`, the history line "try N: stopped: X paused the board", and `runs[-1].ended_by: 'stopped'` with `ended_note: "X paused the board"`.
- `note: 'waiting for you'` repeats `status: 'waiting'` (`workers.ts:246, 872, 877, 1296`).

**Fix:** keep `note` for words to the owner only, and never test it in code.
- Add a real field for the states it stands in for, such as `live.phase: 'claimed' | 'starting' | 'worker' | 'checker'`, or use the open checker agent entry from finding 3.
- Use `failed_on: 'clash'` or the try's structured result in place of `failedOnClash`.
- Build the queue and step text from `checking` when drawing.
- Build the stop note from the try's `ended_note` when drawing.

### 6. Questions are kept in five shapes (medium value, small-medium change; best done together with T-801)

Where:
- `task.question` plus `task.options` plus `task.asked_files` (`types/index.d.ts:120, 157-159`).
- `task.try_question` (`WorkerQuestion`, `ask.ts:19`), which is the worker's ask kept for its hand-back.
- `board.questions` (`OwnerQuestion`, `questions.ts:8`), the lead's questions that are not about one task. These have ids, times, answer, answered_by and dropped.
- T-801 plans to add `question_lead`. I only know this from the task text; I found nothing named `question_lead` in the code.
- A task question has no time, no record of who asked, and no saved answer except a history line. A board question has all of these.

**Fix:** use one `Ask` record, `{ by: 'worker' | 'lead' | 'symcc', text, options?, files?, asked_at, answer?, answered_at? }`.
- On a task it is `task.ask`. `try_question` becomes the same record on the open try.
- `board.questions` stays as a list of the same type.
- That replaces `question_lead` before it is made.

### 7. `attempts` vs `runs.length` (medium value, small change once checked)

- `attempts` is counted by hand.
- It is lowered by one, together with removing the open try, in three places: the lead's hand-over (`core/lead.ts:124`), the unclaim (`workers.ts:1656`) and a fresh-try change (`tools.ts:737`).
- `goOnRun` / `undoGoOn` (T-743) keep both as they are.
- Code uses `attempts` as a "same try?" key all over (`task.ts:78-80`, `workers.ts:150, 176, 206, 222`, `checker.ts:157`, debrief).
- From reading the code the two seem to stay equal, but nothing enforces it, and I could not check the real board.
- Finished stubs keep `attempts` while their `runs` move to the parts file (`STUB_KEYS`, `board-parts.ts:18`). So the stub would need a tries count, or the stub could stay as it is.

**Fix:** first run the probe at the end to see whether any task differs. If none do, make `attempts` a helper (`runs.length`) for open tasks.

### 8. Migrations that still run on every read (medium value: clarity and less code; small-medium change)

These run on every load of board.json, archive.json or scouts.json:
- `withoutStages` (`board-file.ts:390`).
- `migrateRunTokens`, `unsplit` (`:378`).
- The default origin, "made before origins were kept" (`:500`).
- `OLD_ROLES` (`:476`).
- Closing open tries left open (`:506`).
- `withoutTestRerun` and `TEST_RERUN_GONE_NOTE` (`:539-552`).
- `withoutConflictTries` (`:532`).
- The "queue (n)" note becoming a check step (`:522`).
- `target_branch` to `merge_into` (`:602`).
- `mode: 'off'` (`:595`).
- `notify: 'sound'` plus `sound_set` (`:589`).
- `cleanArchived` with number tokens (`:367`).
- `migrateHistory`, `guessHistoryKind`, `oldHistoryEntry` and `PLAIN_KINDS` (`history.ts:255-348`, about 90 lines).
- `readArchive`'s copies of these (`core/archive.ts:30-60`).
- `migrateScoutUsage` (`stats.ts:1020`).
- The move from field-guide.md to org-mem.md (`app/org-mem.ts:156`).
- The move from scouts.json `last_report` to the runs file (`app/scouts.ts:174`).

**Fix:** one script, or one /symcc-doctor step, that loads every data file (board, parts, archive chunks, scouts.json, runs files), saves it once in the current shape and keeps a backup. Then delete all of the above and their tests. The only thing I could not check is whether some of the owner's data still needs them.

### 9. Scout data is kept twice (low-medium value, small change)

- `scouts.json` keeps `last_run` and `last_report` (2000 characters) for each scout (`scouts.ts:168`). `scouts/<name>.runs.json` keeps each run with its end time, tokens and a report file (`scouts.ts:553-567`, at most 50 runs). So "last run" and "last report" are the newest record in the runs file plus its report file.
- `usage` in scouts.json (totals and a `days` map that grows forever) is a sum of runs. It is the only long-term total, since runs are cut at 50, so it should stay.
- `SymccScout.running` and `PaneView.scouts_running` (`state.ts:211`, made in `lead.ts` publish) repeat each other.

**Fix:** drop `last_report` and `last_run` from scouts.json and read them from the newest run. Keep `paused` and `usage`, and maybe cut `days` to a year. Work out `scouts_running` from `scouts[].running`.

### 10. The view (`PaneView` / `.symcc/view.json`) (low value, small change)

- The view is rebuilt whole on each publish (`app/lead.ts:468-499`). It is a copy, but it is never edited, so the copies cannot drift.
- Some names mean something different in the view than on the board:
  - `enabled` in the view is `onHere(b)` ("the board is on and this window is not turned off"), not `board.enabled`.
  - `notify` is the worked-out choice, not the saved one.
  - `branch` is the owner's checked-out branch, while `task.branch` is the task's work branch.
- `history_marks` (`board-parts.ts:141-163`) runs `failReason` over the text ahead of time to keep only tests and clash `failed` marks. `sentBackOf` (`live.ts:46`) then counts every mark without text as `'tests'`, so tests and clash are mixed up. This would go away with finding 1: the mark could carry `reason`.

**Fix:** rename the view fields (`on_here`, `notify_now`, `home_branch`), or build them in the client. Once history has `reason`, keep it on the marks.

### 11. Small things

- **`TMP_OWNERS` is a hand-kept list** (`board-file.ts:277`). It decides which leftover `*.tmp` files get cleaned, but `safeWrite` (`store.ts:124`) is also used for `gone.json` (`lead.ts:293`), `view.json` and the scout runs and report files. Leftover temp files of those are never cleaned. Fix: clean any `<name>.<session>.<n>.tmp` in the data folder.
- **`kind` is declared twice**, on `SymccTask` and again on `BoardTask` (`board-file.ts:130`). Harmless but confusing.
- **The `parts` key on a stub** (`board-parts.ts:20`) can always be worked out from the id (`partsFileOf`). It is kept so a hand-edited stub can be checked. It could go, but it is cheap.
- **`archived`, `archived_done` and `answer` are copies on purpose:**
  - `board.archived` and `board.archived_done` are cached sums and ids from archive.json, so views don't read the archive.
  - `task.answer` is the first 4000 characters of the report file.
  - They are fine, but nothing checks them against the real files. /symcc-doctor could add them up again.
- **`cost` on tries:** the comment at `types/index.d.ts:12` says only time and tokens are filled today. In fact the OpenCode host reports cost (`hooks/opencode/agents.ts:109`), so the field is used; only the comment is stale.
- **`lead.json`, `gone.json`, `merge-line.json` and `passed-trees.json`** are each small, have one clear job, and repeat nothing I could see.

---

## Suggested order of work (each one task, each followed by the one-time migration)

1. Findings 8 and 11: a one-time migration step, then delete the old-shape code. Small to medium, and it makes the rest easier.
2. Findings 2 and 3 together: `run.agents[]` as the only store of agent ids and tokens. Medium.
3. Finding 1: structured history fields. Large; the parsers go.
4. Findings 4 and 5: a `live` object and a `note` that code never tests. Medium.
5. Finding 6: fold into T-801 before it adds `question_lead`.
6. Findings 7, 9 and 10: small follow-ups.

**Next step:** before planning, run a read-only probe on the real board in the main folder (I was not allowed to). It should count:
- tries whose tokens have `unsplit`,
- history entries that are plain strings or of kind `other`,
- tasks where `attempts !== runs.length`,
- tries that have `checker_tokens` but no checker entry in `agents`,
- tasks whose note is "queue (n)".

The fake host in `tests/fake-host.ts` together with `readBoard` and `joinedText` from `hooks/core` can do this from /tmp. Its result says which migrations are still needed and how big step 1 really is.
