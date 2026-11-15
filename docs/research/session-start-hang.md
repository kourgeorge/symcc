# Does session start hang with a scout file and a "doing" task whose agent is missing?

**Short answer:** No, it is not a real hang. session.start hits one planned 2-second wait (`$.clock.sleep(RELOAD_SETTLE_MS)` in `stopOrphans`, hooks/plugin/workers.ts:707). In the test kit that wait is on the fake clock, and it only ends when the test moves the clock forward, so a test that just does `await $.session.start(...)` waits until the kit's 5-second timeout. The scout file has nothing to do with it. A real user waits 2 seconds once, which is what the code means to do.

## What runs, and where it waits

The path, in order:

1. `session.start` hook, hooks/register.tsx:96. Line 115 calls `await claimLead($, true)`.
2. `claimLead`, hooks/plugin/lead.ts:23. On a fresh load with nobody else driving the board (no lead.json gives `'become'`, hooks/core/lead.ts:43), it calls `await stopOrphans($, leadBefore)` at hooks/plugin/lead.ts:35.
3. `stopOrphans`, hooks/plugin/workers.ts:673. At the end (line 707):
   ```ts
   if (leadNow !== undefined && (await waitingOnOld($, agents))) await $.clock.sleep(RELOAD_SETTLE_MS)
   ```
   `RELOAD_SETTLE_MS = 2_000` (workers.ts:712).
4. `waitingOnOld`, workers.ts:715-720, is true when a task is `doing`, has `session === S.me`, has no `finishing` mark, nothing in this copy of the plugin is working on it, and **no live agent from `$.agent.list()` works on it**. That is exactly the "doing task whose agent isn't listed" case.

After the 2 s, `claimLead` calls `waitEnded` (lead.ts:39; returns at once because there are no orphans), then `resetDoing` (lead.ts:44, hooks/core/lead.ts:115) sends the task back to `todo` with the note "restarted after Claude Code was reopened".

The scout path does not wait. `scheduleScouts` (hooks/plugin/scouts.ts:240-270) only sets timers with `$.clock.after` / `$.clock.every` and never awaits one.

## Proof: scratch test (not committed)

I copied the project to /tmp, reused the `world()` and `doingBoard()` helpers from tests/turn-complete.test.tsx:105-179, and ran `claude plugin test .` (Claude Code 2.1.319). Results:

| Case | Does `session.start` finish without moving the clock? |
|---|---|
| A: scout file + `doing` task for this session ("me"), agent `ag9` not listed | no (still waiting after 300 ms) |
| B: same as A, **no** scout file | no (same as A, so the scout file doesn't matter) |
| D: scout + `doing` task, `ag9` listed as running | yes |
| E: scout + `doing` task with `session: 'other'`, agent not listed | yes (`waitingOnOld` checks only this session's tasks) |
| F: scout, no board | yes |
| G: like A, then `clock.advance(1999)` | still waiting; after one more `advance(1)` it finishes, and T-1 is `todo` with note "restarted after Claude Code was reopened" |

So the wait is exactly 2000 ms on the fake clock and nothing else holds it. (After that the follow-up `pump` set T-1 to `failed` with "couldn't start: no implementation for agent.spawn", only because the scratch world doesn't fake `agent.spawn`. That is a gap in the scratch test, not a plugin bug.) Cases A/B also left "a rejection nothing handled: The operation was aborted" at the end of the file: that is the kit stopping the still-waiting dispatch when the test ended.

The test kit's types say this is expected. `MockClock.advance` "resolv[es] each wait due on the way (`$.clock.sleep`, `after`, `every` ...)" and `settle` lets work run "without the clock moving" (.claude-plugin/types/claude-code/index.d.ts, around lines 16981-17010). They also say "work asleep on `mock.clock` waits for the test to advance it" (around line 16585). T-177's tests got around this by starting the session with no board and adding the board afterwards (tests/turn-complete.test.tsx:189-190).

## Can a real user hit it?

Only as a 2-second pause, not a hang. With a real clock, `$.clock.sleep(2000)` ends after 2 s. It happens when the plugin loads (fresh) in a session that has its own `doing` task with no live worker: typically a plugin reload in the same session, after the old worker has ended. A new Claude Code session usually has a new session id, so its old tasks count as another session's (case E) and there is no wait. I did not check whether `--resume` keeps the same session id; that is a guess either way. While it waits, `S.startupDone` is false, so `pump` does nothing (workers.ts:38) until session.start ends. That is intended.

## A related limit I found but did not test

The engine's types say a hook's time budget is `HookBudget.ms: 10_000`, and that `$` calls don't count against it "(a `$.clock` wait excepted)". The `$.clock.sleep` docs also say "The wait is the hook's own time and its budget runs on through it" (index.d.ts around lines 3606-3608 and 5346-5366). session.start can wait in a row for: `waitEnded` up to `ORPHAN_WAIT_MS = 20_000` (workers.ts:172, polling every 500 ms) when old workers it stopped don't end, plus the 2 s settle, plus the board lock, which can wait up to 5 s (hooks/plugin/store.ts:130-140). If old workers keep running for more than about 8 s after being told to stop, session.start would pass its 10 s budget. By the docs, the hook would then count as timed out and keep running on borrowed time ("lingering", `lingerMs: 5_000`). I did not reproduce this, and I don't know exactly what Claude Code does with the rest of that hook's work. It is a reading of the type docs only.

## Recommended next step

- **No plugin fix is needed for the 2 s wait.** It works as designed.
- **Tests:** a test that starts a session with a `doing` task whose agent isn't listed should start `$.session.start(...)` without awaiting it, then `await clock.settle()`, `await clock.advance(RELOAD_SETTLE_MS)` (exported from hooks/plugin/workers.ts), then await the start. Worth adding: one small test in the session-start area that checks exactly this (still waiting at 1999 ms, task back to `todo` at 2000 ms), like case G above, so the wait is written down where the next person will find it.
- **Optional follow-up task:** look at the 10 s hook budget against `ORPHAN_WAIT_MS` (20 s). Either cut the orphan wait to well under 10 s, or move the orphan wait and reset out of the awaited part of session.start (for example, run it from `$.clock.after(0, ...)` and keep `S.startupDone` false until it finishes).
