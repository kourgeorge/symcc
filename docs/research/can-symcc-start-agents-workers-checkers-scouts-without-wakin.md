# Can symcc start agents (workers, checkers, scouts) without waking the lead each time?

Source: task T-822 (kept as a note by T-824). Claude Code 2.1.319.

## Question

Can symcc start agents (workers, checkers, scouts) without waking the lead each time?

## Answer

**Short answer:** No. Claude Code has no supported way to start an agent with all of symcc's hooks outside a turn. But that turn doesn't have to be the lead's, and it doesn't have to cost a model call. The host type file describes two ways out, and neither is tried yet. First, a tiny throwaway "starter" agent, started from a timer, could carry the start in its own end hook. Second, a `turn.step` hook could answer the wake-up turn itself, so no model request is sent. Either would remove most of the wake-up cost. Today the wake-ups cost about 10–21% of the lead's cache reads.

### Why a lead turn is needed today
- **Where the start waits.** `startAgent` in `hooks/app/starts.ts:48-57` puts the start in a queue. If the lead is idle, it sends one wake-up through `tellLead(host, wakeLine(input))`. The `woke` flag means only one wake-up goes out per emptying of the queue. The wording is at `starts.ts:36`.
- **How the wake-up is sent.** `tellLead` (`hooks/app/tell.ts:29-43`) waits 1.5 s, then sends it as `$.prompt.submit` (`hooks/claude/host.ts:181`). `takeBoardUpdate` (`tell.ts:76-83`) adds "Lead: decide what happens next on the board (use the symcc tools), then tell the owner briefly" to every update. That includes start-only ones, so the lead is invited to work and reply.
- **Where the queue is emptied.** In `session.start`, the lead's `turn.start` and every `turn.complete` (`hooks/register.tsx:89, 186-204`).
- **Why it is built this way.** The T-389 probe (`docs/research/probe-does-a-lead-wake-up-turn-reach-symcc-s-turn-end-hook-a.md`, Claude Code 2.1.319, the version installed now) found:
  - An agent started from a timer gets no `tool.check` or `tool.call` hooks, so it has no edit limits and no Bash guard.
  - An agent started from a lead tool call gets no `tool.call`.
  - Agents started inside `turn.start`, `turn.complete` or `session.start` get every hook.
  - The host docs agree. `$.agent.spawn` "runs every hook but the calling one" (`.claude-plugin/types/claude-code/index.d.ts:3337`). An agent "a hook spawned through `$.agent.spawn` steps past that hook" (`index.d.ts:14843`).
  - Nothing in `agent.spawn`'s input keeps the hooks.

### What the host offers (all in `.claude-plugin/types/claude-code/index.d.ts`)
1. **A `turn.step` hook can answer for the model.** "An answer without `next` sends no request" (`:4683`). "Not calling it yields the hook's own chunks and result; nothing beneath runs" (`:13340` area). The answer's shape is `TurnStepResult` (`:14873`), which allows `usage: null`.
   - symcc could note the turn id of a start-only wake-up in `turn.start`, empty the queue there as now, then answer step 0 itself with a short text like "Started checker for T-801." and `end_turn`.
   - Zero model tokens. Two tiny messages are added to the lead's chat.
   - Not probed yet: whether `turn.step` reaches the plugin for its own wake-up turn (T-389 only checked `turn.start` and `turn.complete`), and how the app shows a reply that no model wrote.
2. **A starter agent carries the start instead of the lead.** The T-389 table says an agent started from a timer still reaches `turn.complete`, and agents started inside an agent's `turn.complete` get every hook.
   - So a timer could start a tiny agent (haiku, no tools, "reply OK"). Its `turn.complete` would empty the queue.
   - The lead's long chat is never re-read. The cost is one small haiku call. My guess is around 10–20k tokens, not measured.
   - Not probed: whether an agent started inside the end hook of a timer-started agent gets all hooks. The probe's "worker finishing" row was a worker that a hook had started.
   - The starter would need its own hidden agent type, like the worker and scout types.
3. **`$.turn.abort({ turnId })`** (`:3060-3073`) cancels the lead's running turn. It could be called from `turn.start` after the queue is emptied. It is riskier than option 1: the docs don't say whether background agents just started survive the abort. Not checked.
4. **Ruled out:**
   - **`$.model.fork`** (`:2735-2758`) re-sends the lead's whole conversation, so it costs the same, and it runs no hooks.
   - **`$.model.complete`** is not a turn, so no hooks run.
   - **`prompt.submit` `{ drop }`** (`:4305-4315`): T-389 found the plugin's own `prompt.submit` hook is skipped for its own wake-up, and a dropped prompt starts no turn.
   - **Session crons / `ScheduleWakeup`** (`:13273`) still wake the session with a full model turn.
   - **No headless, forked or side-session spawn** exists that keeps the plugin's hooks.

### Numbers from today's lead log
The log is `~/.claude/projects/-Users-georgekour-repositories-symcc/dc3180be-….jsonl`, model claude-opus-5-5.
- **Turns:** 372 lead turns. 74 were start-only wake-ups: 34 checkers, 21 scouts, 19 workers. 8 more mixed a start with other news.
- **Each wake-up carried exactly one start.** The 1.5 s batching never merged two. Over the last 8 sessions, all 207 start-only wake-ups carried one start.
- **Context re-read per wake-up:** median about 653k tokens, max about 890k.
- **First model call of each wake-up:** 43.3M cache reads and 1.18M cache writes. That is about 10% of the session's 435M cache reads.
- **Whole wake-up turns:** 153 model calls (about 2 per wake-up, because the update invites the lead to act), 89.9M cache reads, 2.09M cache writes, 22k output. That is about 21% of the session's cache reads. Some of those extra calls were real work (adding tasks, a couple of questions to the owner), so not all of it is waste.
- **Dollar guess:** I did not check Opus 5.5's price. At $0.50/M for cache reads and $6.25/M for cache writes, today's wake-ups cost roughly $28 (first call only) to $58 (whole turns).
- **Why checkers wake the lead.** `agentFinished` doesn't wait for `workerFinished` (`hooks/app/symcc.ts:440-458`). The checker is queued after the prep step (`hooks/app/checker.ts:69`), which is after the worker's `turn.complete` already emptied the queue.
- **Batching with a longer window:** waiting 30 s would merge 82 wake-ups into 78 groups, 60 s into 70, 2 min into 64, and 5 min into 47.
- **Next real lead turn after a wake-up:** median 114 s later (middle half 61–217 s).

### OpenCode
It needs none of this. `OPENCODE_FEATURES` has `startQueue: false` (`hooks/opencode/host.ts:17-21`): "OpenCode runs a plugin's hooks for every session". Agents are child sessions made with `session.create` plus `session.prompt` from anywhere, timers included (`hooks/opencode/agents.ts:2-5, 250`). `startAgent` starts them at once and sends the lead nothing (`starts.ts:49`, `hooks/opencode/lead.ts:6`).

### What not to do
- **Don't drop the lead's guide just for wake-up turns.** It is added through `prompt.compose`, which is read on every render (`register.tsx:107`), so it is part of the cached start of every request. Changing it for one turn would rewrite about 650k tokens to the cache.
- **Don't switch the wake-up turn to a cheaper model.** A different model has no cache of the conversation and would read it all fresh.
- **`effort: 'low'`** changes only thinking and output, which are small next to the cache reads.

### What I'd do, biggest savings first
1. **Starter agent (option 2).** It saves nearly all wake-up cost, about 10–21% of lead cache reads today, and the lead's chat doesn't grow. It first needs a T-389-style probe in the interactive app.
2. **`turn.step` self-answer for start-only wake-ups (option 1).** It saves the same first call plus the follow-on calls, but leaves small messages in the lead's chat. It needs a probe. Only answer for the model when the update holds start lines and nothing else.
3. **Cheap change, no probe: stop inviting work on start-only updates.** Leave out the "decide what happens next… tell the owner" ending for them and say "no reply needed". That cuts about 2 calls per wake-up to about 1, up to about 46M cache reads today. It also stops the "T-743 has started" chatter in the owner's chat.
4. **Hold scout starts.** Scout starts are rarely urgent: 21 of today's 74. They could wait for the next turn that ends (any worker finishing, or the lead) instead of waking the lead. That is up to about 28% fewer wake-ups.
5. **A longer batch window (60–120 s) for non-urgent starts.** Wake-ups drop by about 15–22%, but agents start later.

Next step: open a probe task (in the style of T-389, interactive app) that checks options 1 and 2. Item 3 can be done now as a small change to `hooks/app/tell.ts` and `hooks/app/starts.ts`.

## How it was found

The answer comes from reading the code (the files and lines named above), the host type file `.claude-plugin/types/claude-code/index.d.ts`, and the T-389 probe note. The numbers come from scripts run over the lead's log for the day (`~/.claude/projects/-Users-georgekour-repositories-symcc/`, model claude-opus-5-5) and the last 8 sessions. Those scripts were kept in /tmp and deleted afterwards. Nothing was probed in the app, and nothing in the project was changed.
