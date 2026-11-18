# Probe: does a lead wake-up turn reach symcc's turn-end hook, and do workers started there get symcc's hooks?

Source: task T-389 (kept as a note by T-394). Claude Code 2.1.319, headless `claude -p`.

## Question

1. Does a turn started by a timer calling `$.prompt.submit` on an idle session reach the plugin's turn hooks?
2. Do workers started from those hooks get symcc's hooks (tool.check, tool.call, turn.complete)?
3. Is there a `$.agent.spawn` option that keeps the hooks when you start from a timer?

## Answer

**Yes to the first two.** The wake-up turn reaches `turn.start` and `turn.complete`. An agent started inside either hook gets tool.check and tool.call for its own tool calls, and its end reaches turn.complete. The wake-up path works in headless runs.

The fastest safe place to start workers is the wake-up turn's **turn.start**, about 0.3 to 0.8 s after the wake-up is sent.

**No** to the third. `AgentSpawnArgs` is only `prompt, description, subagentType, model, name, cwd` (`.claude-plugin/types/claude-code/index.d.ts:251`). The docs say spawn "runs every hook but the calling one" (`index.d.ts:3337`). From a timer, the whole plugin seems to count as "the calling one" (a reading that fits every result). Starting through `$.tool.call({tool:'Agent'})` is refused by the host ("that is $.agent.spawn").

### Where the started agent gets hooks

| Where the agent was started | tool.check | tool.call | Its end reaches turn.complete |
|---|---|---|---|
| Timer (`$.clock.after` then `$.agent.spawn`) | no | no | yes |
| Lead tool call (tool.call hook) | yes | no | yes |
| session.start | yes | yes | yes |
| prompt.submit hook, owner's prompt | yes | yes | yes |
| prompt.submit hook, plugin's own wake-up | hook never runs | | |
| turn.start, owner's turn | yes | yes | yes |
| turn.start, wake-up turn | yes | yes | yes |
| Main turn.complete, owner's turn | yes | yes | yes |
| Main turn.complete, wake-up turn | yes | yes | yes |
| An agent's turn.complete (worker finishing) | yes | yes | yes |

Other facts:
- The lead's own tool calls in a wake-up turn go through the plugin's tool.call hook, so symcc's lead tools work in board-update turns.
- A worker finishing always reaches turn.complete, so it can safely empty a start queue.
- Each `$.agent.spawn` from a hook also passes through the plugin's own tool.call and tool.check as an `Agent` call. symcc's hooks must keep passing it on with `next`.
- In headless mode, a background agent finishing did not start a main-loop turn by itself.
- The plugin's prompt.submit hook is skipped for its own timer wake-up, even though the docs say "the plugin's others see it" (`index.d.ts:3081-3091`). Use turn.start instead.

## Safest design

- Never call `$.agent.spawn` from a timer or from tool.call. `startWorker` (and checker and scout starts) prepares and claims the task, then puts the start in a queue.
- Empty the queue in session.start, in main turn.start, and in every turn.complete (lead or any agent).
- When something queues a start and the session is idle, send the existing wake-up (`tellLead` in `hooks/plugin/tell.ts`: 1.5 s wait, then `$.prompt.submit`). The wake-up turn's turn.start empties the queue.
- Delay: about 2 s in total (1.5 s wait plus 0.3 to 0.8 s to turn.start). If you only empty the queue at turn.complete, add the whole lead turn (2 to 5 s with haiku; probably longer for a real lead, a guess). If the lead is already busy, the queue empties at that turn's end.

Timer places that currently start agents and would need to queue: the heartbeat pump (`hooks/register.tsx:157`), the watchdog (`:154`), scout timers (`hooks/plugin/scouts.ts:125, 289`), the checker timer (`hooks/plugin/checker.ts:71`), and the timers in `hooks/plugin/workers.ts:278-363`.

## How it was found

A fresh probe plugin (a copy of T-384's) wrote every hook hit to a log file through `$.fs.write`. It ran 3 times with `claude -p --input-format stream-json --plugin-dir ... --model haiku`, with stdin kept open so the session sat idle between turns. Each started agent called `mcp__probe__ping` (answered only by the probe's tool.call hook, reply "PONG") and then `Write` (refused only by the probe's tool.check hook, reply "PROBE-DENY"). Cost was about $0.02 reported, under $0.10 estimated overall (not confirmed). The probe was deleted afterwards.

## Not checked

- The interactive app. One data point: a live worker there ran `test -e` on a file outside its folder and was not refused, matching "hooks skipped" as T-384 saw, but wake-up turns in the app were not tested.
- Whether `$.prompt.submit` from inside a hook (not a timer) behaves differently.

## Next step

Fix task in `hooks/plugin/workers.ts`, `hooks/register.tsx`, `hooks/plugin/scouts.ts`, `hooks/plugin/checker.ts` and `tests/`: a start queue emptied at session.start, main turn.start and turn.complete, with tellLead as the wake-up. Then repeat the live `test -e` check from a worker in the app.
