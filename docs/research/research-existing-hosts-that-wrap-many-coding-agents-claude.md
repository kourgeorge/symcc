# Research: existing hosts that wrap many coding agents and take plugins

Kept from task T-337. Later tasks can read this note.

## The question

Are there existing hosts that run many coding agents (Claude Code, Codex, and others) and take plugins, where symcc could live?

## How it was found

Checked on 2026-11-17. Sources: current docs and source on the web; the type files of `@opencode/plugin` and `@opencode/client` 2.3.0 (unpacked in /tmp, then deleted); T3 Code's `docs/` read straight from GitHub; the cmux 0.64.25 app installed here (`cmux --help`, `cmux docs …`). I ran nothing inside the project and changed no files.

## The answer

### Short answer

No host today can take symcc as it is, with Claude Code and Codex both available as the lead and as workers, and offer everything on symcc's list. Three come close, each in a different way:

1. **OpenCode 2.3.0** has the best plugin API by far. A plugin can add tools, hook tool calls, add commands, create child sessions in a given folder with any model, send messages into the lead, stop sessions, use timers, and draw a side panel plus a strip above the prompt. **The catch:** its workers are OpenCode sessions. They are not the real Claude Code or Codex programs.
2. **T3 Code 0.1.x** runs the real Claude Code (through the Agent SDK) and real Codex (through `codex app-server`), plus Cursor, OpenCode, Pi and any agent in the ACP Registry. It already has its own built-in "lead hands out work" tools: `delegate_task` to any of those agents, an option for a separate git worktree, a wake-up for the parent when the work finishes, cancel, and timers. **The catch:** it has no plugin API at all. symcc could only plug in as an MCP server, though an MCP server can show an interactive board inside the chat (the "MCP Apps" standard).
3. **cmux 0.64.25** (the terminal app installed here) runs the real agent screens, so today's symcc runs inside it unchanged. On top of that it adds messaging between agents, opening new workspaces from the command line, and custom sidebars. **The catch:** it is a terminal, not a plugin host. It is macOS only and GPL-3.0.

**What this means for the plan:** build our own engine, and treat hosts as screens. Don't build our own chat app yet. Details at the end.

### Comparison table

Key: Y = yes, P = partly, N = no, ? = not checked. "Lead" is the chat; "workers" are the background agents.

| Host (version, date) | Agents it runs | Plugin form | Lead tools | Wake the lead | Workers in a folder, with results and tokens | Hooks to refuse edits | Panel and commands | Timers, files, processes | License, activity |
|---|---|---|---|---|---|---|---|---|---|
| **OpenCode** 2.3.0 (2026-11-13); 1.19.6 (2026-11-17) | Its own agent, any model provider. "Claude Agent" provider uses your Claude Code login (v2.2.3, #58782). ChatGPT sign-in for OpenAI models | TS plugin with server, TUI and GUI parts | Y `ctx.tool.transform` | Y `session.prompt({delivery:"steer"\|"queue"})` | Y `session.create({parentID, model, location:{directory}, permissions})`, `interrupt`, `wait`, `ctx.worktree.create`; messages carry `tokens` and `cost`. **But only OpenCode sessions** | Y `ctx.tool.hook("execute.before")`, `permission.hook("evaluate")` | Y slots `session.panel`, `session.composer.top`, `sidebar.content`, `prompt.footer`; plugin pages, dialogs, toasts, slash commands | Y (`setInterval` in setup; plugins run in the server process. There is no file or process API on `ctx`) | MIT, 227k stars, releases daily |
| **T3 Code** 0.1.10 installed; nightly v0.1.11 (2026-11-17) | Real Claude Code (Agent SDK), Codex (app-server), Cursor SDK, OpenCode, Pi, Grok, Antigravity, ACP Registry | **No plugin API.** It loads the MCP servers you set up for Claude and Codex, and it has its own orchestrator MCP | P (as an MCP server) | Y in T3's own tools: "completion wakes the parent"; `t3_thread_send` auto/queue/steer | Y `delegate_task` with `isolation:"worktree"`, `t3_thread_launch` with a worktree, `task_status`, `task_cancel`; tokens: ? | N none of its own (each agent's own hooks: guess) | P: MCP Apps show inside the thread. No panels, no commands | Y `schedule_task`. Files and processes stay on symcc's side | MIT, 63.9k stars, several builds a day; outside contributions mostly closed |
| **cmux** 0.64.25 | Any terminal agent; hooks for Claude, Codex, OpenCode, Gemini, Kiro, Copilot, Kimi and others | Agent hooks, socket CLI, interpreted SwiftUI sidebars, ExtensionKit | (symcc stays a Claude Code plugin) | Y `cmux agent message`: an idle Claude wakes; Codex only at its next hook | P `new-workspace --cwd --command`, but no structured results or tokens | (each agent's own hooks) | P custom sidebar (beta), dock | Y (the CLI) | GPL-3.0-or-later (server parts BUSL), 28.8k stars, active |
| **Goose** v1.59.2 (2026-11-16) | Own agent; Claude Code and Codex through `claude-acp` / `codex-acp`; Amp, Pi | MCP "extensions", plugins with hooks, recipes | Y (MCP) | ? | P `delegate`: runs while the lead waits, 5-minute default timeout, max 5 at once, no worktree, no tokens, turned off in approval modes | Y `PreToolUse` can block | P MCP Apps in Desktop | ? | Apache-2.0, 56.7k stars, active |
| **Amp** | Its own agent only (closed source) | TS plugin `@ampcode/plugin` | Y `registerTool` | P `ctx.thread.append` | P `createAgent` (sub-agents) | Y `tool.call` → `reject-and-continue` | P commands, notify, select | Y `amp.$` | Paid product |
| **Pi** (earendil-works/pi) | Its own agent, many providers | TS extensions | Y | ? | P (example sub-agent extension) | Y `tool_call` | Y `ctx.ui.custom()` | Y | Open source (license not checked) |
| **Sculptor** v0.50.0 (2026-11-16) | Claude Code (in a terminal), Pi, other terminal agents | ESM UI extensions: `registerPanel`, `registerWorkspaceWidget`… | N | N | N (the extension is UI only) | N | Y panels | N | MIT, 254 stars, active |
| **Zed** v1.29.1-pre | Any ACP agent | WASM extensions: languages, themes, MCP servers, debuggers, snippets | P (MCP) | N | N | N | N (no custom panels listed) | N | 95k stars. "As of Zed v1.5.0, ACP extensions have been deprecated in favor of the ACP Registry" |
| **Vibe Kanban** v0.1.46 (2026-11-15) | Over 10 agents | None; it has its own MCP server (`start_workspace`, `create_session`) | — | — | Y (its own) | — | — | — | Apache-2.0; company shut down, community-run |
| **Conductor** | Claude Code, Codex, Cursor, OpenCode | None found. Beta cloud-only API, MCP server and CLI | — | — | (cloud workspaces) | — | — | — | Mac app; no license found |
| **claudecodeui** (siteboon, now "CloudCLI UI"). Verdict: screen only, later. [Details](research-is-siteboon-claudecodeui-a-good-host-for-symcc.md) | Real Claude Code, Codex, Cursor and OpenCode (no ACP). Claude runs as a separate process for each turn, so symcc's timers, scouts and workers stop between turns | Plugins are only a tab | N | N (a plugin cannot see or wake the chat) | ? | ? | P a tab only | N between turns | AGPL-3.0 |
| **Kilo Code** v7.2.x | Fork of OpenCode | Same plugins as OpenCode | as OpenCode | | | | | | MIT, active |
| **Cline** v4.1.26 | Own agent; Claude Code and Codex as providers | Hooks, SDK | ? | ? | ? | **N for Claude Code and Codex:** hooks never fire, because those CLIs run tools themselves ([#13277](https://github.com/cline/cline/issues/13277)) | VS Code | | Apache-2.0 |
| **Crush** | Own agent | Hooks only ("largely Claude Code-compatible"), MCP, skills | P (MCP) | N | N | Y `PreToolUse` (top-level agent only) | N | N | Charm license |
| Toad v0.6.20 (2026-05-26), Claude Squad v1.0.20, Crystal v0.3.5 (deprecated → Nimbalyst), Roo Code (**archived**), Omnara (became a cloud agent platform) | various | No plugin API found | | | | | | | |

**claudecodeui (added later, from T-354).** It is a web and phone screen for the real Claude Code, Codex, Cursor and OpenCode, without ACP. Its plugins are only a tab: they add no lead tools and cannot see or wake the chat. Claude runs as one process per turn, so symcc's timers, scouts and workers stop between turns. The license is AGPL-3.0. Verdict: not a host. Maybe later a web or phone screen on top of standalone symcc. Details: [research-is-siteboon-claudecodeui-a-good-host-for-symcc.md](research-is-siteboon-claudecodeui-a-good-host-for-symcc.md).

### ACP (Agent Client Protocol), v1.18.0 (2026-11-14)

**What a client (the editor) can do.** Start sessions and pass its own MCP servers into them (`session/new` with `mcpServers`), send prompts, cancel, and list, load or resume sessions. It can also answer the agent's requests to read or write files and run terminals, and approve or refuse through `session/request_permission`.

**Limit:** the agent only asks permission when it wants to. Its own tools can skip the client entirely; Copilot CLI in ACP mode auto-approves ([#845](https://github.com/github/copilot-cli/issues/845)). So a client cannot reliably refuse edits outside a task's files. That still needs each agent's own hooks.

**Proxy chains** ([RFD](https://agentclientprotocol.com/rfds/proxy-chains), revised 2026-11-01, behind `unstable_proxy_chains`). A proxy sits between the editor and the agent. It "can do anything a client could do": send its own prompts, start sessions as sub-agents, add MCP tools, and filter messages. This is the cleanest long-term shape for symcc ("symcc as an ACP proxy" would work in every ACP editor with every ACP agent). But today it is only in the Rust SDK, and no editor lets users install proxies yet.

**Agents that speak ACP:** Gemini CLI, OpenCode (`opencode-ai acp`), Qwen, Goose, Cursor, Copilot, Pi. Claude Code works through `@agentclientprotocol/claude-agent-acp`, and Codex through `codex-acp`. There are over 100 ACP clients ([list](https://agentclientprotocol.com/overview/clients)). Some are orchestrators (Orca, Jockey, Orchestrator.inc, Happier). I did not check their plugin APIs.

### The best three: what's missing and how symcc fills it

#### 1. T3 Code: the best match for "real Claude Code and Codex"
- **What it already does:** lead-to-worker delegation across agents, with worktrees, wake-up when a worker finishes, cancel, timers, and steer-or-queue messages ([orchestrator-mcp-server.md](https://github.com/pingdotgg/t3code/blob/main/docs/orchestration-v2/orchestrator-mcp-server.md)). It shows MCP Apps in the thread for Codex and Claude (needs Claude Code 2.1.301 or newer) ([html-renders.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/html-renders.md)). Outside agents and the `t3 thread start/send` CLI can drive it ([outside-agents.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md)).
- **What's missing:**
  - plugins and slash commands
  - a side panel or a strip above the prompt
  - its own tool hooks
  - a way for an outside program to run code when a turn ends
- **How symcc would fill it:**
  - symcc runs as a local MCP server added to the agent: its board tools, plus an MCP App that draws the board inside the thread.
  - Workers: either symcc's own runner, or T3's `t3_thread_launch` with a worktree, called through T3's MCP or CLI.
  - Edit refusal: each agent's own hooks (Claude `PreToolUse`, Codex `hooks.json`).
  - Waking the lead: `t3_thread_send`.
- **Risks:**
  - It is v0.0.x/0.1.x and changes daily.
  - Its own `delegate_task` overlaps with symcc's workers.
  - Guess: symcc's current Claude Code plugin (the `register.tsx` module plugin) would not load under the Agent SDK. T3 only says installed Claude plugins add skills.

#### 2. OpenCode 2.3: the best plugin API
- **What's missing:**
  - The workers are OpenCode itself, not the Claude Code or Codex programs.
  - Claude goes through the "Claude Agent" provider (v2.2.3, [releases](https://github.com/anomalyco/opencode/releases)). Whether that is allowed under the subscription terms is unclear to me. Anthropic banned outside tools from using subscription logins in 2026, and OpenCode dropped its earlier Claude plugin in v1.3.0.
  - Claude Code's plan mode has no equivalent.
  - V2 plugin docs are new; the `agent.transform` editor has no `add`, so custom agent types would be OpenCode config files instead.
- **How symcc would fill it:** a thin OpenCode adapter for the planned `Host` interface (T-234):
  - tools: `tool.transform`
  - edit refusal: `tool.hook("execute.before")`
  - workers: `session.create({parentID, location:{directory: worktree}, model})`
  - waking the lead: `session.prompt` with `delivery: "queue"`
  - board panel: the `session.panel` slot
  - strip above the prompt: `session.composer.top`
  - git: through the normal Node/Bun runtime

  For worker runs on the real Claude Code or Codex, symcc would start `claude -p` or `codex exec` itself, outside OpenCode.

#### 3. cmux: the least work today
- **What's missing:** structured worker results and tokens, plus a plugin runtime. Codex can't be woken while idle ("Codex hooks can't wake an idle session").
- **How symcc would fill it:** keep the Claude Code plugin as it is. Optionally add:
  - a cmux custom sidebar that reads `.symcc/board.json`
  - `cmux agent message` to wake a Codex lead
  - `cmux new-workspace --cwd <worktree> --command "codex …"` for workers you can watch
- **Limits:** macOS only and GPL. Not checked: whether a sidebar can show symcc's board.

### What this changes in the standalone plan

The research points to **"our engine, with hosts as screens"**, not "move into one host" and not "build our own chat app now":

- **No single host covers everything.** T3 has the real agents but no plugins. OpenCode has the plugins but not the real agents. cmux has the terminals but no API for results. Picking one means tying symcc to a young project.
- **The shared piece is the same in all three:** a symcc engine (board, worker runner, tests, merging), reached through an MCP server. The planned `Host` interface (T-234) plus the "symcc daemon" idea in docs/research/standalone-cli.md already lead there.
- **MCP Apps changes the UI question.** It is a portable way to show the board inside T3 Code, Goose Desktop and Claude/Codex (guess: more clients will follow). That removes the main reason to build our own chat app (T-336). A small TUI or web board can stay as a fallback.
- **Workers:** symcc's own runner (`claude -p`, `codex exec` or app-server, ACP for the rest) works in every host. Use a host's own worker runner (T3 `delegate_task`, OpenCode `session.create`) only as an optional adapter.

### What I did not confirm
- I did not run T3 Code's orchestrator tools, an OpenCode 2.3 plugin, Goose, or cmux messaging. Everything above is from docs and type files.
- Not checked:
  - whether T3 passes token usage of delegated tasks back
  - whether T3 runs user `PreToolUse` hooks for Claude Code
  - Conductor's license
  - Nimbalyst's extension API
  - the plugin APIs of Emdash, Paradev, Orca and Jockey
  - Pi's license
- Where the OpenCode V2 docs and the type files disagreed, I used the type files: OpenCode 1.19.x (installed here: 1.19.4) and 2.3.0 are two separate release lines.

### Recommended next step
A short spike, as two small tasks:
- **(a)** Run symcc's board tools as a stand-alone MCP server with an MCP App showing the board. Try it in T3 Code with a Claude lead and a Codex lead, and check whether `t3_thread_send` can wake the lead.
- **(b)** Write a 50-line OpenCode 2.3 plugin that tests `tool.hook("execute.before")` refusing an edit, `session.create` with `location.directory` set to a worktree, and a `session.panel` view.

The results would show which host gets the first adapter after Claude Code. They would also let T-336 drop the "own chat app" part.

Sources:
- [T3 Code repo](https://github.com/pingdotgg/t3code), [orchestrator MCP doc](https://github.com/pingdotgg/t3code/blob/main/docs/orchestration-v2/orchestrator-mcp-server.md), [outside-agents.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/outside-agents.md), [html-renders.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/html-renders.md)
- [OpenCode plugins](https://opencode.ai/docs/plugins), [OpenCode server plugins](https://opencode.ai/docs/build/plugins/server), [OpenCode releases](https://github.com/anomalyco/opencode/releases)
- [cmux agent-hooks.md](https://raw.githubusercontent.com/manaflow-ai/cmux/main/docs/agent-hooks.md), [cmux agent-messages.md](https://raw.githubusercontent.com/manaflow-ai/cmux/main/docs/agent-messages.md), [cmux custom-sidebars.md](https://raw.githubusercontent.com/manaflow-ai/cmux/main/docs/custom-sidebars.md)
- [Goose ACP providers](https://goose-docs.ai/docs/guides/acp-providers), [Goose hooks](https://goose-docs.ai/docs/guides/context-engineering/hooks), [Goose subagents](https://goose-docs.ai/docs/guides/context-engineering/subagents)
- [Amp plugin API](https://ampcode.com/docs/plugin-api), [Pi extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [Sculptor](https://github.com/imbue-ai/sculptor), [Zed agent server extensions](https://zed.dev/docs/extensions/agent-servers), [Vibe Kanban MCP](https://vibekanban.com/docs/integrations/vibe-kanban-mcp-server), [Conductor API](https://www.conductor.build/docs/api)
- [Kilo plugins](https://kilo.ai/docs/automate/extending/plugins), [Cline #13277](https://github.com/cline/cline/issues/13277), [Crush hooks](https://github.com/charmbracelet/crush/blob/main/docs/hooks/README.md), [Toad](https://github.com/batrachianai/toad), [Crystal](https://github.com/stravu/crystal), [Omnara](https://github.com/omnara-ai/omnara)
- [ACP overview](https://agentclientprotocol.com/protocol/v1/overview), [ACP proxy chains RFD](https://agentclientprotocol.com/rfds/proxy-chains), [ACP clients list](https://agentclientprotocol.com/overview/clients)
- [Claude subscription ban summary](https://qcode.cc/en/ai-coding-subscription-ban-guide) (secondary source)
