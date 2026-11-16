# Research: can symcc run as a Codex plugin, the same way it does in Claude Code?

Task T-233. Checked on 2026-11-16 against Codex CLI 0.163.0 (installed here), the openai/codex
source at tag `rust-v0.169.0` (the latest stable release, 2026-11-13, per `gh release list -R openai/codex`),
the Codex plugins installed under `~/.codex/plugins/cache/`, and the official docs at
learn.chatgpt.com (the old developers.openai.com/codex pages redirect there). The Claude Code side is
Claude Code 2.1.319 and symcc's own `hooks/register.tsx`.

## Short answer

**Partly, not the same way.** A Codex plugin can't run symcc's code inside Codex: a Codex plugin is
only a bundle of skills, MCP servers, apps and hooks (shell commands or MCP tool calls). There is no
in-process plugin API like Claude Code's `$`. A "symcc for Codex" would be a separate symcc program
(an MCP server plus hook scripts) that starts workers itself as `codex exec` processes and talks to
the lead's session from outside.

The biggest blockers:

1. **No custom terminal UI.** No board panel and no band above the prompt. The footer status line
   only takes built-in items (open feature request
   [openai/codex#17827](https://github.com/openai/codex/issues/17827)).
2. **No plugin slash commands.** Codex removed custom prompts in 0.117.0 and its slash commands are
   built in only. The nearest things are skills (`$name`) and MCP tools.
3. **A plugin can't start subagents.** Codex's own subagents (`spawn_agent`) can only be started
   by the model. They take no `cwd`, and they share the parent's sandbox. So symcc would have to
   run workers as its own `codex exec` processes.
4. **Waking the lead between turns works only from outside, and only partly.** `codex queue`
   (app-server method `thread/queue/add`) can queue a message for a session. I did not confirm
   whether a running TUI shows it, or whether it starts a turn by itself when the lead is idle.

Everything else (lead tools, hooks on start/end/prompt/tool calls, file and process access,
timers, git worktrees, sound) has a usable Codex equivalent or workaround.

## What symcc needs from its host

From `hooks/register.tsx` and the `$` calls in `hooks/plugin/` (counted with grep):

| # | Need | Where symcc uses it in Claude Code |
|---|---|---|
| 1 | Plugin code that runs inside the host | `hooks/hooks.json` loads `register.tsx` as a module |
| 2 | Lead tools `mcp__symcc__*` | `$.tool.register` (register.tsx:60), answered in `tool.call` (register.tsx:225) |
| 3 | Slash commands `/symcc`, `/symcc-approve`, ... (14 of them) | `$.command.register` (register.tsx:62-77), `command.run` (register.tsx:255) |
| 4 | Text added to the lead's system prompt | `prompt.compose` (register.tsx:194) |
| 5 | Session start / end hooks | `session.start` (register.tsx:99), `session.end` incl. `/clear` (register.tsx:175) |
| 6 | See the owner's typed prompt | `prompt.submit` (register.tsx:205) |
| 7 | Worker and scout agent types with their own prompt, tools, model, permission mode, background | `$.agent.register` (register.tsx:45, 53) |
| 8 | Start a background agent with its own prompt, model and `cwd` (the worktree) | `$.agent.spawn` (plugin/workers.ts:88, plugin/scouts.ts:87) |
| 9 | Get each agent's final answer and token usage | `turn.complete` with `e.answer`, `e.usage` (register.tsx:243) |
| 10 | List agents; stop one | `$.agent.list` (7 uses); stop = `$.session.send` to the agent plus refusing its tools (plugin/workers.ts:842-845, register.tsx:228) |
| 11 | Hide worker/scout types from the lead | `agent.offer` (register.tsx:215) |
| 12 | Send a message to the lead between turns | `$.prompt.submit` (plugin/tell.ts:30) |
| 13 | Git worktree per worker | `$.process.run` running git (plugin/git.ts, plugin/workers.ts) |
| 14 | Side panel (board) with keys, Esc, close | `$.ui.open`, `ui.render` Pane, `ui.close` (register.tsx:390, 420) |
| 15 | Line above the prompt | `ui.render` AbovePrompt (register.tsx:380) |
| 16 | Toasts, status, copy | `$.ui.toast` (33 uses), `$.ui.status`, `$.ui.copy` |
| 17 | Sound / voice | `$.process.run` with `afplay` / `say` (plugin/voice.ts:24, 63-65, 173) |
| 18 | Timers | `$.clock.every` / `after` / `sleep` (register.tsx:142-147, scouts) |
| 19 | Files, processes, env, session id, repo root, usage | `$.fs.*`, `$.process.run`, `$.env.get`, `$.session.id/root/repo/usage` |
| 20 | Plan mode of the main session | `classic.UserPromptSubmit/Stop/SessionStart`, `agent.spawn`, `prompt.attachment` (register.tsx:351-378) |

## What Codex offers

Sources used below:

- **[Hooks]**: https://learn.chatgpt.com/docs/hooks
- **[Plugins]**: https://learn.chatgpt.com/docs/plugins
- **[Subagents]**: https://learn.chatgpt.com/docs/agent-configuration/subagents
- **[App-server]**: https://learn.chatgpt.com/docs/app-server
- **[Config]**: https://learn.chatgpt.com/docs/config-file/config-reference
- **[Manifest]**: `codex-rs/plugin/src/manifest.rs` at `rust-v0.169.0`. The `PluginManifestPaths` fields
  are `skills`, `onboarding_skill`, `mcp_servers`, `apps` and `hooks`. There is no agents, commands or UI field.
- **[Spawn]**: `codex-rs/core/src/tools/handlers/multi_agents_spec.rs` at `rust-v0.169.0`
- **[Queue]**: `codex-rs/cli/src/queue_cmd.rs` and `codex-rs/cli/tests/queue.rs` at `rust-v0.169.0`
- **Local**: `codex --help`, `codex exec --help`, `codex queue --help`, `codex features list` on 0.163.0,
  and the plugin manifests in `~/.codex/plugins/cache/`

| # | Need | Claude Code feature | Codex equivalent | Workaround / notes |
|---|---|---|---|---|
| 1 | Code inside the host | `hooks.json` module with `register(on)` and `$` | **None.** A plugin bundles skills, MCP servers, apps and hooks [Plugins], [Manifest]. Its code runs only as hook commands or as MCP server processes. | symcc's logic moves into a long-running **MCP server** that the plugin ships (`mcpServers` in `.codex-plugin/plugin.json`). It holds the board, the timers and the workers. Big rewrite: none of the `$` calls exist. |
| 2 | Lead tools | `$.tool.register` | **Yes.** MCP server tools. Codex names them `mcp__<server>__<tool>` [Hooks], so `mcp__symcc__*` stays the same. Default 60 s per tool call (`mcp_servers.<id>.tool_timeout_sec`) and 10 s startup [Config]. | The tools are written as MCP tools. A board-off check moves into the server. |
| 3 | Slash commands | `$.command.register`, `command.run` | **None for plugins.** Custom prompts were removed in 0.117.0 ([openai/codex#15941](https://github.com/openai/codex/issues/15941)). `tui.presets.<0-9>` saves prompts in user config only [Config]. | Skills invoked as `$symcc-approve` or `@symcc`, which ask the model to call the MCP tool. This costs a model turn and does not answer instantly like `isTextDisplayOnly`. Or a separate `symcc` shell command run with `!symcc approve T-5`. (Guess: `!` runs a shell command in the Codex TUI; I did not test it here.) |
| 4 | Lead guide in the system prompt | `prompt.compose` | **Partly.** `SessionStart` hook stdout or `additionalContext` becomes developer context, about 2,500 tokens by default (`additionalContextLimit`) [Hooks]. `UserPromptSubmit` can add context too. A skill or AGENTS.md can also carry it. | `SessionStart` hook for the guide; `UserPromptSubmit` to drop it when symcc is off. Raise `additionalContextLimit` (0 = no limit) if the guide is long. |
| 5 | Session start / end | `session.start`, `session.end` | **Yes.** `SessionStart` (source `startup`/`resume`/`clear`/`compact`/`fork`), `SessionEnd` (advisory, 1 s default, 3 s max, main thread only) [Hooks]. Plugins may ship hooks (`hooks` in the manifest or `hooks/hooks.json`) and get `PLUGIN_ROOT` / `PLUGIN_DATA` (also `CLAUDE_PLUGIN_ROOT`) [Hooks]. The installed `browser`, `chrome` and `unified-computer-use` plugins do ship hooks (`Stop`, `SubagentStop`, `Interrupt`, type `mcp_tool`). | Hooks are short processes, so the long work (heartbeat, pump) lives in the MCP server, and the hooks only poke it (`mcp_tool` hook type). Note: non-managed hooks must be trusted once via `/hooks` [Hooks]. |
| 6 | Owner's typed prompt | `prompt.submit` (`origin.kind`) | **Yes.** `UserPromptSubmit` hook [Hooks]. | I did not check whether it tells typed prompts apart from queued or app-server ones (`origin.kind` in Claude Code). |
| 7 | Agent types | `$.agent.register` | **Partly.** Custom agents are TOML files in `.codex/agents/` or `~/.codex/agents/` with `name`, `description`, `developer_instructions` and optional `model` / `model_reasoning_effort`. They **can't** set their own sandbox or approval mode (ignored in agent files). Tool limits are only feature switches like `features.shell_tool = false` [Subagents]. A plugin can't ship them ([Manifest] has no agents field). | Skip Codex subagents. Each worker is a `codex exec` process with its own flags: `-m`, `-s read-only|workspace-write`, `-C <worktree>`, `-c key=value`, `--json`, `-o <file>` (`codex exec --help`, 0.163.0). The scouts' "never change files" becomes `-s read-only`, which is stronger than today's prompt-only rule. |
| 8 | Start a background agent with `cwd` | `$.agent.spawn` | **Not for plugins.** `spawn_agent` is a tool for the model only. Its parameters are `message`, `items`, `agent_type`, `fork_context`/`fork_turns`, `model` and `reasoning_effort`. It has **no `cwd`** [Spawn]. Its description says the model must not spawn unless the user or AGENTS.md asks [Spawn]. The app-server has no "spawn subagent" call; `thread/start` takes `model`, `cwd`, `approvalPolicy` and `sandbox` [App-server]. | The MCP server starts `codex exec -C <worktree> ...` in the background (or `thread/start` + `turn/start` on an app-server). Several at once is fine because they are separate processes. `codex exec --worktree` also exists ("Run the session in a new managed Git worktree"), but symcc wants its own worktree paths, so `-C` fits better. |
| 9 | Final answer and tokens | `turn.complete` (`answer`, `usage`) | **Yes, for `codex exec`.** `--json` prints JSONL events, and `turn.completed` carries `usage` (`input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`) (`sdk/typescript/src/events.ts`). `-o` writes the last message to a file. For Codex subagents there is a `SubagentStop` hook with `agent_id`, `agent_type` and `last_assistant_message` [Hooks]. | Read the exec process's JSONL or `-o` file. Token kinds map onto `SymccTokens` (cached → `cache_read`). Dollar cost: not given, same as today. |
| 10 | List / stop agents | `$.agent.list`, `$.session.send` + tool deny | **For own processes: yes.** symcc tracks its own PIDs and can kill them, or call `turn/interrupt` on an app-server [App-server]. Model-side `list_agents`, `close_agent` and `interrupt_agent` exist only as model tools [Spawn]. | Process list kept by the MCP server. Killing a process is a harder stop than today's "answer stopped" message. |
| 11 | Hide worker types from the lead | `agent.offer` | **Not needed** if workers are `codex exec` processes: the lead never sees them as agent types. | |
| 12 | Message to the lead between turns | `$.prompt.submit` | **Partly.** `codex queue --thread <id> --message <text> [--resume]` (0.163.0 help; app-server method `thread/queue/add` per [Queue]). The app-server also has `turn/start` (idle thread), `turn/steer` (running turn) and `thread/inject_items` (adds history "without starting a user turn") [App-server]. Hooks: a `Stop` hook with `decision: "block"` makes the lead keep going with a new prompt, but only at the end of a turn. Background (`async`) hooks never start a turn [Hooks]. | Best guess: the MCP server calls `codex queue --resume` (or `thread/queue/add`) with the board update. **Not confirmed:** whether a TUI that is open on that session shows the message and runs it when idle, and how the server finds the lead's thread id (hook input has `session_id` [Hooks]; I guess it is the same id `codex queue --thread` takes). A `Stop` hook can also add pending updates at the end of each lead turn. |
| 13 | Worktree per worker | git via `$.process.run` | **Yes.** The MCP server runs git itself. Codex has a `worktrees` feature (stable, on, in `codex features list`) and `--worktree`. | Unchanged logic, but in the server. The worker sandbox `workspace-write` with `-C <worktree>` should allow writes there. (Guess: a worktree under `.symcc/worktrees/` is also inside the lead's workspace; not tested.) |
| 14 | Board panel | `ui.render` Pane, `$.ui.open`, `ui.close` | **None in the terminal.** Plugins have no TUI API [Plugins], [Manifest]. MCP servers "can optionally include custom UI" [Plugins], and `enable_mcp_apps` is "under development" (`codex features list`, 0.163.0). Guess: that UI shows in the ChatGPT/Codex desktop app, not the CLI. | Board as text from a tool or skill. Or a separate terminal app (`symcc board`) in a split pane. Or a local web page served by the MCP server. |
| 15 | Line above the prompt | `ui.render` AbovePrompt | **None.** `tui.status_line` takes only built-in item ids [Config]. Custom command items are asked for in the open issue [openai/codex#17827](https://github.com/openai/codex/issues/17827) (#20244 closed). `tui.terminal_title` likewise. | None in Codex. Terminal-side tools (tmux status bar, or the cmux app the owner uses) could show it. |
| 16 | Toasts | `$.ui.toast` | **Partly.** A hook's `systemMessage` "is surfaced as a warning in the UI" [Hooks], only while a hook runs. `tui.notifications` / `tui.notification_method` (`osc9`/`bel`) and `notify` (a program that gets JSON; user config only) [Config]. | Desktop notifications from the MCP server itself (e.g. `osascript`), or `systemMessage` on the next hook. |
| 17 | Sound / voice | `afplay` / `say` | **Yes** (any process). | Same commands, run by the MCP server. |
| 18 | Timers | `$.clock.*` | **None in Codex**, but the MCP server is a normal long-running process. | `setInterval` in the server. Guess: the server lives as long as the Codex session. |
| 19 | Files, processes, env | `$.fs`, `$.process`, `$.env` | **Yes** (MCP server process). The app-server also has `fs/*` and `command/exec*` [App-server]. | Plain Node APIs. |
| 20 | Plan mode | `classic.*` `permission_mode`, attachments | **Partly.** Hooks get `permission_mode` (values `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`) on `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Stop`, ... [Hooks]. Codex has a Plan mode (`plan_mode_reasoning_effort`) [Config]. | Not confirmed that Codex's Plan mode shows up as `permission_mode: "plan"`. |

### IDE extension

[Subagents] lists the IDE extension as a surface where subagents run, with a panel above the
composer to view or stop them. I did not check whether the IDE extension loads plugin hooks and MCP
servers the same way the CLI does, or whether `codex queue` reaches its sessions.

## What I couldn't check

- I did not build or run a test plugin, MCP server or `codex queue` call. All "workaround" rows are
  read from docs and source, not tried.
- Whether `codex queue` / `thread/queue/add` shows up in an open TUI and starts a turn by itself when
  the lead is idle. This decides whether "the lead is told" can work like today.
- Whether a finished Codex subagent wakes an idle parent. The test
  `subagent_notification_is_included_without_wait` (`codex-rs/core/tests/suite/subagent_notifications.rs`)
  only shows the notice arriving with the parent's *next* request.
- How long a plugin's MCP server lives (start, restart, several Codex windows on one project).
  symcc's lead-claim logic depends on it.
- The rest of the app-server page (it was longer than one fetch) and the plugin build guide
  (`/docs/plugins/build/plugins` returned 404).
- Codex versions after 0.169.0. 0.171.0 alphas exist (2026-11-15) and features change fast. For
  example, `agent_message_board` and `send_message_to_user_async` are "under development" in 0.163.0.
  Guess: these may later help with needs 12 and 16.

## Recommended next step

Don't port yet. First a small spike outside the project (in /tmp) to settle blocker 4, the one the
whole design hangs on. Open `codex` in one terminal. From another, run
`codex queue --thread <that id> --message "hello" --resume` while it is idle, and again while it is busy.
Check whether the open TUI shows and runs the message. If it does, a "symcc for Codex" is a
reasonable size: an MCP server, a few hooks and `codex exec` workers, with a text board instead of
the panel. If it doesn't, the lead only hears about finished work when the owner next types or a
turn ends (the `Stop` hook). That is a much weaker product, and it may be better to wait for Codex
to add a way in. If the spike passes, the next task is to split symcc's core (`hooks/core/`, which
is mostly plain logic) from the Claude Code `$` calls, so both hosts can share it.
