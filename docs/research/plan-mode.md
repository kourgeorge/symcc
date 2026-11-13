# Research: can symcc tell when the session is in plan mode?

Task T-120. Checked against Claude Code 2.1.319: the plugin API types in
`.claude-plugin/types/claude-code/index.d.ts` (in the main project folder; it is gitignored, so
worktrees don't have it) and the installed package at
`~/.local/lib/node_modules/@anthropic-ai/claude-code`. The package ships only a compiled binary
and `README.md`, so the types file is the main source. Line numbers are approximate.

## Short answer

- A plugin **can** read the mode, but only from fields on certain events. There is no
  `$.session.mode()` call and no "mode changed" event. symcc learns about a change the next time
  one of those events fires (the next prompt, the end of a turn, the next model request).
- symcc's own tools **do** run in plan mode. symcc answers them inside its own `tool.call` hook and
  never calls `next(e)`, so Claude Code's permission step, where plan mode applies, never runs for
  them. A tool can't be marked read-only.
- Plan mode does **not** reach workers: they are registered with `permissionMode: 'acceptEdits'`.
  Scouts are registered with no mode, so by the types they take the parent's mode when they are
  spawned. Once an agent is running, changing the main session's mode later does not change it.

## 1. Reading the current permission mode

The mode values are `'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`
(`type PermissionMode`, about line 7901).

Where a plugin can see it:

| Where | Field | Notes |
|---|---|---|
| `classic.*` events (`classic.UserPromptSubmit`, `classic.Stop`, `classic.SessionStart`, `classic.PostToolUse`, `classic.Notification`, `classic.SubagentStart`, ...) | `e.permission_mode?: string` | Comes from `BaseHookInput` (about line 853). These events fire even when no settings hook is set up (`ClassicEventName` docs, about line 1268). The value is the mode at the moment the event fires. **Not** on `classic.PreToolUse`: its `e` is only the tool call envelope. |
| `agent.spawn` hook | `e.permissionMode?: string` | "The parent's permission mode (`default`, `acceptEdits`, `plan`, ...), which the subagent inherits." (`AgentSpawnInput`, about line 323). Only seen when an agent is about to start. |
| `prompt.attachment` hook, `e.type` of `plan_mode`, `plan_mode_reentry`, `plan_mode_exit` | `e.detail` (`PlanModeDetail` etc., about lines 7968-8015 and 8549) | `plan_mode` is the reminder sent with each model request while plan mode is on; `plan_mode_exit` is a one-time note sent when plan mode has ended. These are signals that plan mode is on or has ended, not the mode name. Fires only when a model request is built. |

What does **not** exist:

- `$.session` has `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`,
  `surface`, `usage`, `version` (about line 2862) — nothing for the mode.
- No event fires when the mode changes (for example Shift+Tab). `classic.ConfigChange` is only for
  settings files and skills. `PermissionUpdate` `{ type: 'setMode' }` is only something a
  `classic.PermissionRequest` answer can return, not a notice.
- The newer events (`tool.call`, `tool.check`, `turn.complete`, `prompt.compose`,
  `session.start`) carry no mode field.
- The `SessionMode` render component (the dim labels at the right of the prompt footer, about
  line 11034) lists labels such as `focus`. The docs don't say plan mode appears there, so it is
  not a dependable source.

Does it update mid-session? Yes, each new event carries the mode as it is at that moment. But
nothing tells the plugin right away: if the user switches mode while the lead is idle, symcc only
finds out at the next `classic.UserPromptSubmit` (the user sends a prompt), the next model request
(`prompt.attachment`), or the next `classic.Stop` (end of a turn). For symcc that is good enough,
since the lead only acts inside a turn.

## 2. Do plugin tools run in plan mode?

Yes, and that matches what we saw.

- `ToolSpec` (what `$.tool.register` takes, about line 14471) has only `name`, `description`,
  `inputSchema`, `isDeferred`. No `isReadOnly`, `readOnly` or similar.
- The `tool.call` docs (about line 4157): "Each `next(e)` runs the hooks beneath, then core (the
  permission prompt, the tool itself)." `{ result }` "answers in place of `next`". `tool.check`
  (where rules and the mode decide) fires "after the `tool.call` and PreToolUse hooks", that is,
  inside `next`.
- symcc's hook in `hooks/register.tsx` (`on('tool.call', ...)`, about line 168) returns
  `{ result: await runTool(...) }` and never calls `next(e)`. So no permission check runs, and
  plan mode doesn't block or ask about `add`, `change`, `approve` and the rest.
- `ToolCheckInput.isReadOnly` (about line 14170) is set by the engine only when the tool itself
  says it is read-only; "an MCP tool's is its server's". `ToolCheckResult.decision` adds: "In
  plan mode a hook only tightens a call not shown to be a read." This would only matter if symcc
  called `next(e)`, which it doesn't.

So if symcc wants plan mode to count, it has to check the mode itself in its `tool.call` hook.

## 3. Does plan mode reach background agents?

- `AgentSpec.permissionMode` (`$.agent.register`, about line 502): "Left out: the parent's."
  symcc registers the worker with `permissionMode: 'acceptEdits'` and the scout with none
  (`registerAll` in `hooks/register.tsx`).
- `$.agent.spawn` (`AgentSpawnArgs`, about line 251) takes no `permissionMode`. The mode comes
  from the agent type and the parent.
- Workers: they run with `acceptEdits` whatever the main session's mode is. This matches what we
  saw (a worker kept running and finished during plan mode). I could not confirm from the compiled
  binary how an agent type's own mode is combined with a parent in `plan`. The types only say the
  agent type's mode wins over the parent's.
- Scouts: they take the parent's mode at spawn time, so a scout started while the main session
  is in plan mode probably runs in plan mode (read-only, which scouts are anyway). I did not test
  this.
- Running agents: nothing in the types says a running agent follows the main session's later
  mode changes, and the worker we saw didn't.

## Recommended design for symcc

Keep one value, "the lead's mode", and refresh it from events:

1. `on('classic.UserPromptSubmit')`, `on('classic.Stop')`, `on('classic.SessionStart')`: read
   `e.permission_mode` when `e.agent_id` is absent (the main session, not a worker), store it, and
   call `next(e)`.
2. `on('prompt.attachment', { type: 'plan_mode' })` → plan mode on;
   `{ type: 'plan_mode_exit' }` → plan mode off. Always return `next(e)` so the text is unchanged.
   This catches a switch made between two prompts sooner than the next `classic.Stop`.

While the mode is `plan`:

- No new workers or scouts start (the dispatch loop skips; scheduled scouts wait). Workers
  already running keep going: stopping them would lose work, and plan mode doesn't reach them.
- `add` still works, but new tasks go to the backlog, not ready, so nothing picks them up.
  `change` can still edit text. Tools that act (`approve`/merge, `retry`, starting a run) answer
  "plan mode: nothing starts; leave plan mode first".
- The band shows "plan mode: nothing starts".

When the mode changes from `plan` to something else (seen at the next event):

- Tell the lead once (for example through `tool.call`'s `context`, or a line in the band):
  "Plan mode is off. N tasks are in the backlog from planning; move the ones you want to ready."
- Don't auto-promote backlog tasks; the lead or the owner decides.

If the stored mode is unknown (no event seen yet), treat it as not plan, so nothing changes from
today's behaviour.
