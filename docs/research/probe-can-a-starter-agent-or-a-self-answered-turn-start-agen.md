# Probe: can a starter agent or a self-answered turn start agents with all hooks?

Source: task T-826 (kept as a note by T-830). Claude Code 2.1.319, haiku. It follows on from `docs/research/can-symcc-start-agents-workers-checkers-scouts-without-wakin.md` (T-822) and `docs/research/probe-does-a-lead-wake-up-turn-reach-symcc-s-turn-end-hook-a.md` (T-389).

## Question

Can a starter agent (option 1) or a self-answered wake-up turn (option 2) start agents with all of symcc's hooks, without a model request from the lead's chat?

## Answer

**Short answer.** I tried both options in the real interactive app (Claude Code 2.1.319, haiku), and both work. An agent started either way got every hook: tool.check refused its Write and its Bash, and tool.call answered its ping. Neither option sent a model request from the lead's chat. I recommend option 1, the starter agent. It costs about 900 tokens per start and leaves nothing in the lead's chat. Option 2 also costs nothing itself, but it adds a reply to the lead's chat, and the app's prompt suggestion can still re-read the lead's whole conversation afterwards.

The sections below say how this was found.

## How I tested
- I wrote a throwaway probe plugin in /tmp (now deleted) and loaded it with `claude --plugin-dir ... --model haiku --permission-mode acceptEdits --debug-file ...`.
- The app ran in a tmux window in a scratch folder, /tmp/t826/work, which I marked as trusted.
- The probe logged every hook it reached to a file.
- Each started "tester" agent had to do three things: call `mcp__t826__ping` (only the probe's tool.call answers it, with "PONG"), Write a file (the probe's tool.check refuses it with "PROBE-DENY-WRITE"), and run `echo` in Bash (refused with "PROBE-DENY-BASH").
- To check for model requests I read the debug log's `[API REQUEST] ... source=` lines and the session's .jsonl log.
- Your globally installed plugins (symcc, cg, cmux hooks) were loaded too. symcc said "not set up here" and passed everything on.

## Control: a timer starts the agent directly
This confirms T-389's result, now in the interactive app:
- The probe saw none of the agent's tool.check or tool.call hooks.
- The ping got stuck waiting on a permission question nobody answers. That question only appeared on screen once a lead turn began.
- After I said No, the agent wrote `out-timer-direct.txt` and ran the Bash command with no guard.
- Its turn.complete still reached the probe.

## Option 1: starter agent — works
- A timer started `t826:starter` (haiku, `tools: []`, a "Reply OK" prompt, `background: true`).
- Its turn.complete reached the probe, with answer "OK", about 0.9 s after the start.
- Inside that turn.complete the probe started the tester, and the tester got every hook:
  - Its Agent start went through the probe's tool.call and tool.check (logged as the main loop).
  - tool.call answered its ping with PONG.
  - tool.check refused its Write ("PROBE-DENY-WRITE") and its Bash ("PROBE-DENY-BASH"), and no file was written.
  - It reached turn.step (index 0 to 2) and turn.complete.
- **Cost:** the starter used `input_tokens 2, output_tokens 4, cache_read 0, cache_creation 892` (the probe log's turn.complete usage). That was one request, `source=agent:custom:t826:starter`. Compare about 650k cache reads for each lead wake-up today. I did not look up haiku prices.
- **Delay:** about 1.2 s from the timer to the tester running.
- **Lead's chat:** nothing was added. The debug log says `[enqueueAgentNotification] skipped taskId=<starter> ... reason=already-notified`, so the finished starter sends no notice into the lead's chat. This held for every agent started from a plugin.
- The probe never saw the starter's own turn.start, turn.step or tool hooks. That is expected, because its start came from the timer.

## Option 2: self-answered wake-up turn — works
- A timer called `$.prompt.submit`. The probe's own prompt.submit was skipped ("skipped: re-entry"), as T-389 found.
- turn.start fired for the wake-up turn. Its text begins "The t826 plugin sent a message:\n...".
- Inside turn.start the probe started the tester. The tester got every hook (PONG, Write refused, Bash refused, its turn.step and turn.complete). No file was written.
- **turn.step does reach the plugin for its own wake-up turn.** The log shows `TURN.STEP MAIN ... index=0` and the debug line "t826 (user) answered turn.step without next() ... nothing beneath it ran". The answer was one text chunk plus `{kind:'stop', stopReason:'end_turn', usage:null}`, returning a `TurnStepResult` with `usage: null`.
- **No model request.** The debug log has no `repl_main_thread` request for that turn ("turn.step: a hook answered without the request; the loop read what it streamed"). The main turn.complete had `usage=undefined`.
- **How the app shows it:** it looks like a normal reply:
  - The chat shows "› Prompt from the t826 plugin / ❯ T826-WAKE: … / ⏺ Started tester (…)", followed by a stuck line "✻ Waiting for N background agents to finish".
  - The next turn's duration was also wrong ("Cooked for 2m 48s").
  - In the .jsonl log, the reply is an assistant message with id `msg_hook_…`, `answeredWithoutRequest: true`, `isUnmetered: true`, all usage counts at 0, and model `claude-haiku-5-5`.
  - When I later asked the lead model what its previous reply was, it said the line "came from the system, not from me". So the app seems to mark it as not the model's own.
- **The cache survives:** the real turn after the made-up reply read `cache_read 55033, cache_creation 9`.
- **Delay:** about 0.3 s from the submit to the tester starting, plus symcc's existing 1.5 s wait.

## Risks
- **Option 2, prompt suggestion:** after the self-answered turn, the app ran a `source=prompt_suggestion` model call. It is a copy of the lead's whole conversation: `input=506 output=96 cacheRead=54933`. For a lead with about 650k tokens of context, that is about the same cache reads as the wake-up call we are trying to save.
  - It did not fire after every turn (not after my first two plain prompts), and I don't know the rule.
  - A `prompt.suggest` hook (index.d.ts:4329-4339) can only hide the text after it has been made, so it can't stop the cost.
  - Today's real wake-up turns probably trigger it too, but I did not check that.
- **Option 2, side effects of a lead turn:** it still adds two messages to the lead's chat and still runs your Stop hooks (notify-slack.sh, cg beep.sh, cmux auto-name) on every start. The starter only fired SubagentStop.
- **Option 1, a new agent type:** symcc needs one more hidden agent type (register it, hide it with agent.offer, and make sure `agentFinished` ignores it). It may show briefly in the app's agent list. If starting it is refused, symcc should fall back to `tellLead`.
- **Option 1, failure:** I only tested a starter that finished normally. Not tested: a starter that ends in an API error. The type file says turn.complete fires for errors too, so the queue should still empty, but that is unconfirmed.

## What I couldn't check
- I tested with haiku as the lead, in a fresh small session, not in your long Opus lead session.
- I did not check prices.
- I left the trust entry for /private/tmp/t826/work in ~/.claude.json. Everything else is deleted: /tmp/t826 and the probe's ~/.claude/projects folder. No project files were changed.

## Recommended next step
Open a change task for option 1:
- When a start is queued and the lead is idle, a timer starts a hidden `<name>:starter` agent (haiku, no tools, "Reply OK") instead of calling `tellLead`. The existing `drainStarts` in every turn.complete (`hooks/register.tsx`) then starts the queued agent, so most of the work is already there.
- The task's files: `hooks/app/starts.ts`, `hooks/app/tell.ts`, `hooks/claude/registration.ts`, `hooks/claude/agent-types.ts`, `hooks/register.tsx`, `hooks/app/symcc.ts` (so `agentFinished` ignores the starter), and `tests/`.
- Keep `tellLead` as the fallback if the starter can't start.
- Keep option 2 in reserve. Use it only if the prompt-suggestion cost turns out to be small in the real lead session.
