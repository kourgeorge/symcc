# Research: clearing or relabelling finished workers in Claude Code's agent list

Task T-102. Checked against Claude Code 2.1.319 (the installed package,
`~/.local/lib/node_modules/@anthropic-ai/claude-code`).

## Where I looked

- `.claude-plugin/types/claude-code/index.d.ts` — the plugin API (`import ... from 'claude-code'`
  in `hooks/register.tsx`). Claude Code writes this file when it loads the plugin; it is gitignored,
  so it exists only in the main project folder, not in worktrees.
- `.claude-plugin/types/claude-code-tools/index.d.ts` and the package's `sdk-tools.d.ts` — the
  built-in tools' inputs and outputs.
- The package has no other docs beyond `README.md`.

## Short answer

No. The plugin API has no way to remove, dismiss or relabel an agent in the list, and nothing
makes finished agents look different there.

## 1. Remove or dismiss a finished agent?

Nothing exists.

- `$.agent` has only three calls: `spawn`, `list`, `register` (`index.d.ts`, the `agent: { ... }`
  block on the engine interface, about line 3332). There is no `stop`, `kill`, `close`,
  `dismiss`, `remove` or `update`.
- `$.agent.spawn` takes only `prompt`, `description`, `subagentType`, `model`, `name`, `cwd`
  (`AgentSpawnArgs`, about line 251). No `autoClose`, `ephemeral` or similar option. A plugin's
  spawn always runs in the background anyway.
- The `$.agent.list` docs say how long an entry stays: "One entry an agent, until the engine drops
  its task: as a teammate ends or seconds after, a subagent's later." So the engine removes
  finished subagents by itself, on its own timer. A plugin can't speed this up.
- The `TaskStop` tool (`claude-code-tools/index.d.ts`, `TaskStop: { task_id?: string }`) stops a
  running background task, and says it also takes "named background agents ... by agent ID or
  name". A plugin could call it with `$.tool.call({ tool: "TaskStop", task_id })`. But it is made
  for stopping running work. Its docs don't say it clears a finished agent from the list. On a
  worker that is still running it would end the agent as `killed`, which is worse. I did not test it.
- `AgentStatus` is `'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'`
  (about line 566). The plugin can read it but not set it.

## 2. Set or change an agent's label or status text after it finishes?

Nothing exists.

- `description` is set only at spawn time (`AgentSpawnInput.description`; an `agent.spawn` hook can
  rewrite it before the agent starts). Once the agent has started, nothing can change it.
- The text in the list ("Splitting status strip test in pane.test.tsx") is the agent's own latest
  activity, which the engine fills in. No field or hook can change it.
- The render hooks (`$.ui.render`, `RenderComponent`, about line 10101) cover `Spinner`,
  `ToolUse`, `AbovePrompt`, `Pane`, `PromptHint` and others, but not the agent list rows. The
  `Spinner` component (keyed by agent id) is the "working..." line of a running turn, not a row
  in the list.

## 3. Does any setup show finished agents differently?

Nothing found.

- `AgentSpec` (the fields `$.agent.register` takes, about line 467) has no colour, icon or display
  field. It has `background: true`, which symcc already sets for both the worker and the scout
  types.
- The only difference documented is that teammates (team-mode agents, `isTeammate`) leave the list
  "as a teammate ends or seconds after", while plain subagents leave "later". symcc's workers are
  plain background subagents. Turning them into teammates would be a big change and needs
  Claude Code's agent teams feature, so I don't recommend it for this.

## Recommendation

Nothing to change in symcc to fix the list itself. The `◯` and the leftover activity text come
from Claude Code, and the entry goes away when the engine drops it. Small things symcc can do:

- Keep showing done/merged state in symcc's own views (board, pane, status strip), which read
  `$.agent.list()` statuses and can show `completed` clearly. Say in `docs/guide.md` that
  finished workers stay for a while in Claude Code's agent list, and that the board is what
  counts.
- Optional: ask the worker (in `WORKER_PROMPT`) to make its final message a short "Done: ..."
  line, so its last activity in the list reads as finished. Whether the list shows this text is
  up to the engine; I have not checked it.
- Don't call `TaskStop` on workers to tidy the list: it isn't documented to clear finished
  agents, and on a running one it would kill the work.
- Look again after Claude Code updates (the API is marked "EARLY ACCESS"). Search `index.d.ts` for
  new names in the `agent:` block.
