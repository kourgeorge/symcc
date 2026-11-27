# Probe: can finished agents' reports skip waking the lead?

Source: task T-1170 (kept as a note by T-1171). Claude Code 2.1.332, the lead logs from 2026-11-20 to 2026-11-27.

## Question

When a worker, checker or scout finishes, Claude Code hands its report to the lead, and that starts a new lead turn. Can symcc keep those reports out of the lead's chat, so only symcc's own board update wakes the lead? What does symcc need from the report, which finishes must still wake the lead, and how much would it save?

## Answer

**Short answer: partly works, and it's worth doing.** Claude Code already lets a plugin drop an agent's report before the lead sees it. symcc has done exactly that in the real app since T-837 for the hidden starter's "OK". symcc doesn't need the lead's copy of the report: it gets the report text, the token counts and how the run ended from `turn.complete`. Last week, reports from workers, checkers and scouts caused **about 39% of all lead model calls and 40% of the lead's cache reads**. Turns where the lead only replied and did nothing made up **about 24% of cache reads (around 520M tokens a week)**.

What could not be done: test a new agent's report in the real app. Starting a second Claude Code session in tmux, the way T-826 did, was refused by the permission system, so the probe stopped there. Everything below comes from the real lead logs, the code, the host type file and the T-837/T-857 history.

### 1. Can a finished agent's report be kept out of the lead's chat?
- **How the report arrives.** In Claude Code 2.1.332 it comes as a hidden message (`isMeta: true`, `turnOrigin: "peer"`), shown as `Another Claude session sent a message: <\agent-message from="symcc-T-1102">[Subagent hand-back] …`. It also carries `handbackReportText`. Nearly every report starts its own lead turn: 965 worker reports gave 945 turns, 849 checker reports gave 823.
  - Its `handbackToolUseId` appears nowhere else in the lead's log, so dropping the report leaves no unfinished tool call behind.
- **Way A: drop it in `prompt.submit` (proven in the real app).** `hooks/register.tsx:118-127` already drops the starter's report with `{ drop: '▸ agent started' }`.
  - All 8 starter reports in the lead logs are from before T-837 merged (2026-11-22, Claude Code 2.1.319). None reached the lead after it.
  - The cost: each drop shows a yellow "Prompt dropped by a hook" line (that is why T-857 was done).
- **Way B: `session.receive` returning `{ consumed }` (documented, not tested).** The host type file `.claude-plugin/types/claude-code/index.d.ts:4564-4574` and `:12398-12420` says that with `{ consumed: reason }` "nothing is queued, shown or read by the model … not written to the transcript". Its own example is `on("session.receive", { origin: "peer" }, () => ({ consumed: "muted" }))`.
  - This would avoid the yellow line.
  - Not tested: whether a report actually passes through `session.receive`. It is labelled a "peer" message, which fits.
- **Other ideas, ruled out or weaker:**
  - **Stopping the agent at once (T-857's trick):** this only works for the starter, which is stopped before it ends. A worker has to finish, and symcc then sends it a follow-up message (the T-656 "debrief") on the same agent. Not tested for workers.
  - **Answering through `turn.step` (T-826's option 2):** this still adds messages to the lead's chat and may set off the app's prompt-suggestion call, which re-reads the lead's whole conversation.
  - **Holding the report and adding it to the next board update:** not needed. symcc already holds what matters (see 2).

### 2. What symcc needs from the report, and whether it already has it
It already has all of it without the lead:
- `turn.complete` calls `agentFinished(host, e.agentId, { answer, end, isAborted, tokens })` (`hooks/register.tsx:223-232`, `hooks/app/symcc.ts:207-229`).
- That gives the report text (saved to the reports folder by `workerFinished`), the tokens (`usageTokens(e.usage)`), the end reason, and commands still running in the background (SubagentStop).
- The debrief answer comes the same way. It never shows up as a separate report in the lead's log.
- `prompt.submit` reads nothing from reports except the starter check.

### 3. Which finishes must still wake the lead, and which can be quiet
- **Already told by symcc's own board update** (all in `hooks/app/workers.ts`, so they stay):
  - a worker's question (`ask_owner`, urgent, sent while the worker runs, not with its report)
  - a request for more files (:1059)
  - a failed task (:1067, :1549, which includes the checker's problems)
  - an answered investigation (:1371)
  - ready for review (:1493)
  - errand done (:1368)
  - checker "keep fixing?" (:1507)
  - running over time (cleanup.ts:186)
  - "Suggested for org-mem" (debrief.ts:120, org-mem.ts:71)
- **Can be quiet:**
  - a worker that finished and goes on to the checker or tests
  - checker OK
  - a checker send-back with tries left (already a quiet "Meanwhile" line, workers.ts:1525)
  - a plain merge (already quiet, workers.ts:1555)
  - a scout that found NOTHING (45 such reports this week, each waking the lead for nothing)
- **What would need to change:**
  - The answered-investigation and errand updates only say "the answer is on the task". They should include the report text, or the lead has to call `board task` first.
  - The scout-findings update (`scoutLeadMessage`, `hooks/core/scouts.ts:571-577`) says "its report is the scout's own message to you". It must include the report instead.
  - The lead guide line in `hooks/app/tools.ts` (about line 401: "A worker's or scout's own report reaches you as its message … the board update … doesn't repeat it") must change.

### 4. Measured saving (from the lead logs, 2026-11-20 to 2026-11-27 09:43; scripts deleted)
- **Total:** 6,771 lead calls and 2,210M cache reads.
- **Owner prompts:** 2,083 calls, 627M cache reads.
- **symcc board updates:** 1,875 calls, 642M cache reads.
- **Health checks:** 161 calls, 50M cache reads.
- **Agent reports:** 2,623 calls (39%), 885M cache reads (40%) and 32M cache writes (51% of all cache writes).
  - Workers: 1,217 calls, 413M.
  - Checkers: 1,110 calls, 383M.
  - Scouts: 296 calls, 89M.
- **Reply-only turns (the lead called no tool):** 1,570 turns, about 1,510 calls, about **522M cache reads (24% of the lead's total)**, about 18M cache writes. That is roughly 70M cache reads and 200 lead calls a day.
  - About 334k cache reads per turn.
  - By type: workers 827 of 966 turns, checkers 668 of 851, scouts 75 of 164.
- **Last 1.4 days:** reports were 42% of lead calls and 44% of cache reads.
- **Context growth:** each report also adds about 815 tokens to the lead's chat for good (3,261 characters on average). That makes every later call a bit bigger.
- **Turns where the lead acted** (414 turns, 366M):
  - Mostly `change` after checker send-backs (147 times): adding notes to a retry, which also restarts it.
  - `add` after scout findings (78 times).
  - The pop-up question tool after worker reports (45 times).
  - With quiet reports, the lead would no longer step in on routine send-backs. That is a product choice for the owner.
- **Timing:** the next board update came a median of 96 s after a worker or checker report (middle half 18-215 s).
- **Not checked:** prices, and the prompt-suggestion calls T-826 saw. Those are not in the session logs.

### 5. Risks and other hosts
- **The lead misses something.** This is covered as long as every case it must act on is a board update (the list in 3), and the three texts above are changed.
- **When symcc is switched off,** reports must not be dropped: make the drop depend on `S.enabledNow`.
- **The owner loses the lead's short "what changed for you" summary after each task.** Merge lines carry the worker's "Done:" sentence, but merges now arrive only as Meanwhile lines.
- **Identifying symcc's agents.** Match only symcc's own agent names (`symcc-T-n`, `symcc-T-n-checker`, `symcc-scout-x`). The type docs say the `plugin` field on a peer message is just a claim (`index.d.ts:12360-12365`). Muting by it is fine, but not as a guard.
- **OpenCode, Copilot, Cursor and Node don't have this problem (from reading code only).** Each agent is a separate session, and its end goes only to symcc's `agentFinished` (`hooks/opencode/agents.ts:1-10`, `hooks/copilot/agents.ts:1-13`). The lead hears only symcc's board update.
  - A side issue there: the scout-findings update says the report is "the scout's own message to you", but on those hosts no such message exists. So the lead never sees the findings. Not confirmed by running.

## Recommended next step

1. A short real-app test (needs the owner's permission to start a second Claude Code session): a throwaway plugin whose agent's report is muted with `session.receive` `{consumed}`. Check that no lead turn starts, nothing shows, and a follow-up message to the agent still works.
2. Then a change task in `hooks/register.tsx`, `hooks/app/tools.ts` (lead guide), `hooks/core/scouts.ts` (`scoutLeadMessage`), `hooks/app/workers.ts` (answered-investigation and errand texts) and `tests/`. It should:
   - mute every symcc agent's report while symcc is on, using `session.receive` if the test passes, else the existing `prompt.submit` drop
   - put the report text into the few board updates that need it
   - leave everything else to the existing board updates and Meanwhile lines.

   That is the simplest rule: symcc's board update becomes the only thing that wakes the lead.

## How it was found

- **Measured:** the lead logs in `~/.claude/projects/-Users-georgekour-repositories-symcc/*.jsonl`. T-1170 counted messages, turns, calls and tokens by cause, what the lead did in report turns, report sizes, and the starter drop before and after T-837.
- **Only read:** the code and type file cited above, and the T-822/T-826/T-389 notes in `docs/research/`.
- **Not tested:** `session.receive` `{consumed}` on a real report, and whether a dropped report still leaves any visible line besides the known yellow one. The real-app test was refused, as said above. Throwaway files in /tmp/t1170 were deleted, and no project files were changed.
