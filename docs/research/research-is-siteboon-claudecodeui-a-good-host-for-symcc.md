# Research: is siteboon/claudecodeui a good host for symcc?

Kept from task T-352. Checked on 2026-11-17 (claudecodeui v1.37.9).

## Question

Could siteboon/claudecodeui (now branded "CloudCLI UI") be the host that symcc runs inside?

## Answer

**No, not as a host.** It is a good, active web and phone screen for the real Claude Code, Codex, Cursor and OpenCode. But:

- Its plugins can only add a tab. They cannot give the lead tools, see the chat or wake the lead.
- It runs Claude as a short-lived process for each turn. That ends symcc's timers, scouts and background workers between turns.

At most it could be one more screen on top of a standalone symcc. It is not worth targeting first.

## What it is

- **License.** AGPL-3.0-or-later. This is stricter than cmux's GPL: if you run a changed copy as a network service, you must publish its source.
- **Activity.** 14.7k stars, 2.1k forks. A release every 1 to 2 weeks (v1.37.4 on 2026-10-09 to v1.37.9 on 2026-11-16). 131 PRs merged in the last 3 months from about 45 authors. It takes outside PRs. 388 issues are open.
- **Agents.** Four built in: `claude`, `codex`, `cursor`, `opencode`. No Gemini and no ACP. Kiro, Antigravity, Grok and Oh My Pi are open requests (#574, #345, #1173, #1039).
- **How it talks to them.**
  - Claude: the Agent SDK `query()`, which starts the real `claude` program from your PATH, with `settingSources: ['project','user','local']`.
  - Codex: `@openai/codex-sdk` plus `codex app-server`.
  - Cursor: starts the CLI directly.
  - OpenCode: one `opencode serve` per turn, through its SDK.

## Plugins and places to add things

- A plugin is a git repo with `manifest.json`. The only slot is `'tab'`.
- The page part gets `mount(container, api)`. The `api` has only `context` (theme, project path, session id and title), `onContextChange` and `rpc()` to the plugin's own backend.
- The optional backend is a Node process on localhost with full file and network access.
- The docs say plugins can't "Send messages to Claude". There are no sidebar or status-bar slots, no tools for the agent and no chat hooks. Plugins can't read the app's own data in a supported way (#1190). A status line under the prompt is only a request (#1685).
- **Back doors** a symcc plugin backend could use:
  - `POST /api/agent` runs any of the four agents in a project folder. It needs an external API key, can continue a session (`sessionId`), streams results and reports token use. So it could start workers, and in principle message the lead's session. Limit: one run per session at a time, so a busy session answers 409.
  - Routes for worktrees (create, open, merge, remove), scheduled messages and notifications.
- **Fork or PR.** The code is clean and split into modules, with a guide for adding a provider. A PR for a sidebar slot, a strip above the prompt or a "send to session" call looks doable. Whether the maintainers would accept it is a guess. A fork must follow AGPL and keep up with fast changes.

## Several sessions at once, each in its own folder

Yes. A run belongs to one chat session, one at a time per session, and other sessions keep running in the background. The worktree feature makes a git worktree and registers it as its own project. But these are separate chats you start by hand or through `/api/agent`. They are not workers a lead hands tasks to.

## Does symcc still work inside it?

Partly, and only during a turn.

- **Loads in headless mode.** A probe with `claude -p --plugin-dir <symcc> --output-format stream-json` (Claude Code 2.1.319) showed that symcc's tools (`mcp__symcc__*`), `/symcc*` commands and `symcc:worker` / `symcc:scout` agent types all load. Screen output arrives only as `system` events (`ui_status`, `ui_toast`, `ui_panes`). The Agent SDK should behave the same, but the probe used the plain CLI.
- **Screen output is dropped.** claudecodeui does not handle `ui_*` events, so the board, status line and toasts would not show.
- **Plugin must be installed.** claudecodeui does not pass `--plugin-dir`, so symcc would need `claude plugin install`.
- **The process ends after each turn.** This is the big problem. The Claude process exits when a turn ends, unless the turn started tracked background work (a backgrounded Bash or Agent, Monitor, ScheduleWakeup, CronCreate, TaskCreate or Workflow). Even then it is held for at most 30 minutes. symcc's watchdog, lead heartbeat, scout timers and `$.agent.spawn` workers all live inside that process.
- **Untested guesses.** Workers might keep the process alive if `$.agent.spawn` reports itself as a tracked task. Timers and scouts would stop between turns. Workers would die at the 30-minute limit. Waking an idle lead would not reach the screen.

So symcc would need rework to fit: the board, timers and workers would move out of the Claude process into a symcc process that stays running.

## Fit compared with the T-337 options

| | claudecodeui |
|---|---|
| Agents it runs | Real Claude Code, Codex, Cursor, OpenCode (no ACP) |
| Plugin form | A tab, plus an optional Node backend |
| Tools for the lead | No (only MCP servers you set up yourself) |
| Wake the lead | Only through a back door (`/api/agent` with `sessionId`, 409 while busy) |
| Workers in a folder, with results and tokens | Partly: `/api/agent` with `projectPath`, a worktree API, token use reported |
| Hooks to refuse edits | Each agent's own (Claude hooks from user settings load) |
| Panel and commands | A tab only |
| Timers, files, processes | Plugin backend only |
| License, activity | AGPL-3.0, 14.7k stars, active |

- **Against T3 Code:** same real agents and also no plugin API, but T3 already has a lead-hands-out-work system (`delegate_task`, waking the parent). claudecodeui has neither. MCP Apps support in claudecodeui was not checked.
- **Against OpenCode:** a much weaker plugin API.
- **Against cmux:** cmux runs today's symcc unchanged; claudecodeui does not.
- **Strengths:** web and phone access, a polished multi-agent chat, git and file panels, notifications, an HTTP API that starts agents.
- **Risks:** AGPL; built around one company; changes fast; Claude through the Agent SDK on a subscription is a grey area (see `standalone-cli.md`).
- **Against standalone symcc:** claudecodeui gives no engine pieces symcc lacks. Its `/api/agent` runner and worktree API overlap with what a standalone symcc would own anyway.

## Recommendation

**Not a fit as a host. Possibly a UI on top of a standalone symcc, later.** The best shape is a small tab plugin whose backend reads `.symcc/board.json` or talks to a symcc daemon, giving phone and web access to the board. Remote access is the one thing it adds over the other options. It should wait until the standalone engine exists, and come after the MCP App board and T3/OpenCode spikes recommended in T-337.

Next step: add a claudecodeui row to `research-existing-hosts-that-wrap-many-coding-agents-claude.md`, marked "screen only (tab plugin), later".

## How it was found

- Read a shallow clone of the repo (v1.37.9), the GitHub API and issues, and the plugin docs page.
- Ran two short `claude -p` probes in a throwaway folder.
- All temporary files were deleted. No project files were changed.

Not checked: installing or running claudecodeui itself; whether `$.agent.spawn` workers keep its Claude process alive; whether it shows MCP Apps; whether maintainers would take a PR for chat hooks or more slots.

## Sources

- [claudecodeui repo](https://github.com/siteboon/claudecodeui)
- [Plugin docs](https://cloudcli.ai/docs/plugin-overview)
- [Plugin starter](https://github.com/cloudcli-ai/cloudcli-plugin-starter)
- Issues [#1190](https://github.com/siteboon/claudecodeui/issues/1190), [#1685](https://github.com/siteboon/claudecodeui/issues/1685), [#574](https://github.com/siteboon/claudecodeui/issues/574), [#345](https://github.com/siteboon/claudecodeui/issues/345)
- [v1.37.9 release](https://github.com/siteboon/claudecodeui/releases/tag/v1.37.9)
