# Research: should symcc be its own CLI that drives Claude Code, Codex or other agents?

Task T-235. Follows T-233 ([codex-host.md](codex-host.md)). Checked on 2026-11-16. Installed here:
Claude Code 2.1.319, Codex CLI 0.163.0, OpenCode 1.19.4, Qwen Code 0.27.0. Gemini CLI and Aider are
not installed, so I read their docs only. SDK versions are from npm (`npm view`) on the same day.

## Short answer

**Not now.** A standalone symcc that drives any agent is possible: every major agent can be run
from outside. But symcc would lose what makes it work today: the lead is your normal Claude Code chat,
with the board panel, the line above the prompt, slash commands and instant hand-backs between turns.
To get those back, symcc would have to rebuild a whole chat app.

**Recommendation:** stay a Claude Code plugin (A) and do the first steps of the host layer (B, task
T-234): split `hooks/core/` from the `$` calls. Build the Codex side as a small **symcc daemon**
(MCP server + worker runner + board in a terminal or web page) that runs beside the owner's Codex
session. That daemon is most of option C's "beside" form anyway. Later it can start workers on other
agents through one "agent runner" interface (`claude -p`, `codex exec` / app-server, ACP for the rest).
You get "any agent as a worker" without giving up the Claude Code panel.

## 1. What each agent offers for being driven from outside

Sources: local `--help` output (versions above); the type files of `@anthropic-ai/claude-agent-sdk`
0.3.325 (`sdk.d.ts`) and `@openai/codex-sdk` 0.169.0 (`dist/index.d.ts`), unpacked in /tmp and then
deleted; and the docs linked in each row.

| | Claude Code | Codex | Gemini CLI | OpenCode | Qwen Code | Aider |
|---|---|---|---|---|---|---|
| **Version** | CLI 2.1.319; Agent SDK (TS) 0.3.325 | CLI 0.163.0 here, 0.169.0 latest; `@openai/codex-sdk` 0.169.0 | 0.68.0 (latest release 2026-11-10, `gh release list`); not installed | 1.19.4 here; npm `opencode-ai` 1.19.5 (the GitHub repo `anomalyco/opencode` also has a `v2.3.0` tag, 2026-11-13; I can't explain the mismatch) | 0.27.0 | 0.86.2 on PyPI (2026-02-12); not installed |
| **One-off run** | `claude -p` | `codex exec` | `gemini -p` ([headless](https://geminicli.com/docs/cli/headless/)) | `opencode run` | `qwen "<prompt>"` (`-p` is deprecated) | `aider --message` ([scripting](https://aider.chat/docs/scripting.html)) |
| **Streaming events** | `--output-format stream-json`, `--include-partial-messages` | `codex exec --json` (JSONL); SDK `runStreamed()` (index.d.ts:214) | `-o stream-json`: `init`, `message`, `tool_use`, `tool_result`, `error`, `result` | `run --format json`; server SSE `GET /event` ([server](https://opencode.ai/docs/server/)) | `-o stream-json` | None (no JSON output on the scripting page) |
| **Resume a session** | `--resume <id>`, `-c`, `--fork-session`; SDK `resume`, `forkSession` (sdk.d.ts:2226, 902) | `codex exec resume <id>`; SDK `resumeThread()` (index.d.ts:288) | `-r latest` or an index ([CLI reference](https://geminicli.com/docs/cli/cli-reference)) | `-s <id>`, `-c`, `--fork` | `--continue` / `--resume` (needs `--chat-recording`) | Python `coder.run()` again in the same process; nothing else checked |
| **Long-lived session you can send messages into (for a lead)** | Yes. `-p --input-format stream-json`; SDK `prompt: AsyncIterable<SDKUserMessage>` and `streamInput()` (sdk.d.ts:3426, 3459), `interrupt()`, `setModel()`, `setPermissionMode()` | Yes. App-server JSON-RPC over stdio/WebSocket: `thread/start`, `turn/start`, `turn/steer`, `turn/interrupt` ([app-server](https://learn.chatgpt.com/docs/app-server)); `codex queue` for an existing session | Through ACP (`--experimental-acp`) | Yes. `opencode serve` HTTP: `POST /session/:id/prompt_async`, `/abort`, SSE events | `--input-format stream-json`, `--acp` | Unofficial Python API only: "not officially supported ... could change" |
| **Tool / permission control** | `--permission-mode` (`acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`), `--allowedTools`, `--disallowedTools`, `--permission-prompts host|none`, SDK `canUseTool` | `-s read-only|workspace-write|danger-full-access`, `approvalPolicy`; SDK `sandboxMode`, `approvalPolicy`, `networkAccessEnabled` (index.d.ts:256-263) | `--approval-mode default|auto_edit|yolo|plan`; policy engine | Agents with tool lists; server `POST /session/:id/permissions/:id` | `--approval-mode plan|default|auto-edit|auto|yolo`, `--allowed-tools` | `--yes` only |
| **Choose the model** | `--model`, `--fallback-model`, `--effort` | `-m`; SDK `model` | `-m` (`auto`, `pro`, `flash`, ...) | `-m provider/model` (any provider) | `-m` | `--model` |
| **Work in a given folder** | Run in that `cwd`; SDK `cwd` (sdk.d.ts:1728); `--add-dir` | `-C <dir>`, `--worktree`; SDK `workingDirectory` (index.d.ts:257) | Run in that folder (guess: cwd); `--include-directories` | `run --dir` | cwd; `--add-dir` | cwd |
| **Give it tools (MCP)** | `--mcp-config`; SDK `createSdkMcpServer` runs tools inside your own process (sdk.d.ts:664) | `mcp_servers` in config or `-c` | `gemini mcp`, `--allowed-mcp-server-names` | `opencode mcp` | `--allowed-mcp-server-names` | None found |
| **Token / cost report** | Final `result` has usage and `total_cost_usd`, which it calls "An estimate, not a billing statement" (sdk.d.ts:6171); `--max-budget-usd` | `turn.completed` usage (tokens only, no dollars) | `stats` / `result` with per-model tokens | `opencode stats` ("token usage and cost") | Not checked | `/tokens` in chat |
| **Auth and terms for driving it** | See below: OK for the owner using the real `claude` binary; the SDK with a subscription is a grey area | ChatGPT sign-in works; docs advise an API key for automation | **OAuth with outside tools is banned**; use an API key | Your own provider keys | Not checked | Your own provider keys |

### Auth and terms, in more detail

- **Claude Code.** The [legal page](https://code.claude.com/docs/en/legal-and-compliance) says
  developers "building products or services ... including those using the Agent SDK, should use API
  key authentication". It also says Anthropic does not permit "third-party developers to offer Claude.ai
  login into their own applications". But it adds that this does not "prevent an end user from signing
  in to the unmodified Claude Code binary with their own Claude subscription". Usage limits "assume
  ordinary, individual usage of Claude Code and the Agent SDK". The [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
  has the same note. [The Register, 2026-02-20](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546)
  quotes a stronger line: OAuth tokens from Free/Pro/Max "in any other product, tool, or service —
  including the Agent SDK — is not permitted". That line is not on the legal page today.
  **My reading (a guess, not legal advice):** symcc running the owner's own, unmodified `claude`
  binary under the owner's login is fine. symcc using the Agent SDK with the owner's subscription is
  unclear. If symcc were shared with other people, they should use an API key. symcc today is a plugin
  inside Claude Code, so none of this applies to it now.
- **Codex.** The [auth docs](https://learn.chatgpt.com/docs/auth) say: "Use API key authentication
  for programmatic Codex CLI workflows" and "API keys are still the recommended default for automation".
  ChatGPT sign-in does work for `codex exec`. I found no rule against a local tool driving the owner's
  own Codex.
- **Gemini CLI.** The [terms page](https://geminicli.com/docs/resources/tos-privacy) says that using
  outside tools to reach its services "(for example, using OpenClaw with Gemini CLI OAuth) is a
  violation", and may lead to suspension. Google's notice is
  [gemini-cli discussion #22970](https://github.com/google-gemini/gemini-cli/discussions/22970).
  Users have reported bans ([HN 47115805](https://news.ycombinator.com/item?id=47115805)). The same page
  says: "Unpaid tier and Google One users: Gemini CLI was replaced by Antigravity CLI on June 18th, 2026."
  So drive Gemini only with an API key. I did not look at Antigravity CLI.
- **OpenCode.** It uses your own provider keys. Users report that Anthropic blocks Claude
  subscriptions inside OpenCode ([HN 46549823](https://news.ycombinator.com/item?id=46549823); I did
  not confirm this).

### New since T-233: the hosts are adding their own background-agent managers

- Claude Code 2.1.319 has `claude --bg` and `claude agents` / `attach` / `logs` / `stop` / `rm` /
  `respawn` (`claude --help`).
- Codex 0.163.0 has `codex agents` ("Browse all agent sessions on the shared local app-server daemon")
  and `codex app-server daemon start|stop|...` (`codex --help`).

This helps a standalone symcc, because there is a daemon it can talk to. It is also a risk: the hosts
may soon cover part of what symcc does.

## 2. What the lead would look like in a CLI

| | L1: symcc owns the prompt | L2: symcc runs beside the host |
|---|---|---|
| **How** | The owner types into `symcc`. symcc keeps one long-lived lead session (Claude `--input-format stream-json` / SDK; Codex app-server; others through ACP) and gives it the board tools as MCP. | The owner keeps using `claude` or `codex` as normal. symcc is a daemon: an MCP server (the board tools), a worker runner, and a board in a split terminal pane or a local web page. |
| **Hand-backs between turns** | Full control: symcc sends a message whenever it wants (`streamInput`, `turn/start`, ACP `session/prompt`). | Depends on the host. Claude: the plugin does it today (`$.prompt.submit`). Codex: only through `codex queue` / `thread/queue/add`, and whether an open TUI picks it up is **not confirmed** (T-233 blocker 4). |
| **Panel and line above the prompt** | symcc draws them itself, so they can be anything. | Only in its own pane or page, not inside the host (except Claude, through the plugin). |
| **What the owner loses** | The host's own chat UI: its tool-call and diff views, permission prompts, plan mode, the host's own slash commands, `/resume`, images, IDE links. symcc would have to rebuild each one, or show less. | Nothing in the host. But the board is in a second window, and there are no slash commands in Codex (skills or `!symcc ...` instead, see T-233). |
| **Effort** | Large. In effect a new coding-agent chat app, plus an event renderer for each agent. | Medium. A daemon plus one small adapter per host. |
| **Terms** | The SDK with a subscription is a grey area (see above). Running the `claude` binary is fine. | Same as today: the owner runs the host themselves. |

L2 fits symcc's idea ("your normal chat is the lead") much better. L1 is only worth it if symcc wants
to be its own product, separate from the hosts.

## 3. A vs B vs C

Today's code, counted with `wc -l`: `hooks/core/` is 24 files and 5,133 lines. Its imports touch no
host (only `../name`, `../../types` and other core files; `$` appears only in comments in
`core/agents.ts:47,97`). Host-bound: `hooks/plugin/` is 3,881 lines, `hooks/plugin/ui/` is 1,430 lines,
and `hooks/register.tsx` is 424 lines, about 5,700 in all. All 26 files in `tests/` match
`claude-code/testing` or `@anthropic` (grep), so they all run through the Claude Code test harness.

| | A: Claude Code plugin only | B: host layer + adapters (T-234) | C: standalone CLI/daemon, any agent |
|---|---|---|---|
| **What the owner gets** | Everything that works today. Plus Codex as a worker through Claude Code, if wanted (see [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)). | Same as A in Claude Code. In Codex: lead tools, workers, a board in a pane or web page. | Any agent as lead or worker, mixed per role (for example a Codex worker on a Claude lead). One board across hosts. |
| **What the owner loses** | Nothing; but no Codex lead. | In Codex only: no panel, no line above the prompt, no slash commands, and possibly no instant hand-backs. | L2 form: the same losses as B's Codex side, in every host, unless a Claude plugin is kept too (then it is just B). L1 form: the host's own chat UI. |
| **Effort (guess)** | None. | Medium. The refactor steps are in T-234, then a Codex adapter (daemon + hooks + `codex exec` workers). | Large. A daemon, a runner for each agent with its own event parser, auth checks per agent, and (for L1) a chat UI. |
| **Risk** | The owner depends on one vendor. Claude Code's plugin API could change. | The Codex hand-back is unconfirmed. Two adapters to keep up with fast-moving hosts. | Six fast-moving CLIs with changing flags and events (Vibe Kanban pins exact versions: `@anthropic-ai/claude-code@2.1.119`, `@google/gemini-cli@0.29.3`). Terms risk (Gemini OAuth, Claude SDK). The hosts' own agent managers may overlap. |
| **Code that carries over** | All of it. | Core (about 5,100 lines) as is. The plugin parts are reworked behind the interface. The Claude UI stays in its adapter. | Core as is. Most of `hooks/plugin/` is rewritten (it all goes through `$`). `hooks/plugin/ui/` is rewritten for a new TUI or web page. The tests need a new harness. |

B's Codex adapter and C's L2 form are the same program: a daemon with an MCP server and a worker
runner. So B is a step toward C, not a different road. If that daemon gets an "agent runner"
interface, other agents can be added as workers later, without deciding on C now.

## 4. Existing tools

Star counts and dates are from `gh api repos/...` on 2026-11-16.

| Tool | What it is | How it drives agents | What symcc can learn or reuse |
|---|---|---|---|
| [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) (28.7k stars, v0.1.46, 2026-11-15) | A kanban board plus a worktree for each task, a diff review UI and PRs. More than 10 agents. | Per-agent "executors" (`crates/executors/src/executors/`). Claude: `claude -p --input-format=stream-json --output-format=stream-json --permission-prompt-tool=stdio` (`claude.rs:159-191`). Codex: the app-server protocol crates (`codex.rs:51`). Gemini: ACP (`gemini.rs:60`). | The closest match to symcc's board. Its executor split is a good model for an agent runner. The company [shut down on 2026-04-10](https://www.vibekanban.com/blog/shutdown) ("couldn't find a business model"); the project is now community-run. |
| [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) (8.8k) | A TUI that runs many agents in tmux, each in its own worktree. | Runs the interactive CLI in tmux (`-p "codex"`, `-p "aider ..."`), with `--autoyes`. | The simplest way to support any agent. But it has no structured results, so no test gate and no token counts. |
| [generalaction/emdash](https://github.com/generalaction/emdash) (6.3k) | A desktop app that runs many coding agents in parallel, with any provider. | Not checked. | Not checked. |
| [stravu/crystal](https://github.com/stravu/crystal) (3.1k, now "Nimbalyst") | A desktop app with Claude Code and Codex sessions in worktrees. | Not checked. | Not checked. |
| [kbwo/ccmanager](https://github.com/kbwo/ccmanager) (1.3k), [agent-of-empires](https://github.com/agent-of-empires/agent-of-empires) (4.5k) | Session managers (TUI, or TUI and web) for 8 or more CLIs. | Not checked (guess: terminal sessions, like Claude Squad). | A board on a phone (agent-of-empires has a web view). |
| [ruvnet/ruflo](https://github.com/ruvnet/ruflo) (81.8k, formerly claude-flow) | "Multi-player swarms" for Claude Code, Codex and others. | Not checked. | Not checked. Very broad in scope. |
| [coder/agentapi](https://github.com/coder/agentapi) (1.5k, **archived**) | An HTTP API for Claude Code, Goose, Aider, Gemini, Amp and Codex. | Not checked (guess: it drives the terminal UI). | It is archived. That may mean wrapping terminal UIs did not last once the agents shipped real APIs (guess). |
| [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol) (4.7k) | One JSON-RPC protocol "for connecting any editor to any agent". | The [agent list](https://agentclientprotocol.com/overview/agents) has Gemini CLI, OpenCode, Qwen Code, Goose, Cursor, Copilot and more. Claude goes through [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp) (npm 0.107.0). Codex goes through [codex-acp](https://github.com/agentclientprotocol/codex-acp). | **The best thing to reuse.** If symcc's runner speaks ACP, one adapter covers most agents. Native adapters stay only for Claude and Codex, where more detail is needed (tokens, sandbox). |
| [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (35k) | Codex used from inside Claude Code, for review or delegated tasks. | Not checked. | Shows that "Codex as a worker inside a Claude Code plugin" is something people want and is cheap. Option A could add it. |

I did not find a tool with symcc's shape: a chat lead that owns a board, plans tasks with
dependencies and file scopes, and reports back between turns. Most tools have a person plan and the
agents build. This search was not complete (guess: there may be smaller projects I missed).

## What I couldn't check

- I did not run any of these CLIs headless, or any SDK, app-server, ACP adapter or OpenCode server.
  The table comes from `--help`, type files and docs.
- Gemini CLI, Aider, Antigravity CLI, Amp, Goose, Cursor and Copilot CLI: not installed. Amp is
  on PATH here but fails to start.
- Qwen Code token reports and auth terms; Aider resume.
- Whether a running Codex TUI shows `codex queue` messages (T-233 blocker 4). It is still the key
  question for B, and for C's L2 form.
- Anthropic's exact current stance on the Agent SDK with a personal subscription. The legal page
  and the Register quote differ. Ask Anthropic before relying on it.
- How Emdash, Crystal/Nimbalyst, ccmanager, agent-of-empires and ruflo drive the agents.
- T-234's note (`docs/research/host-independence.md`) was still being written, so I could not
  check it against this one.

## Recommended next step

1. Keep A as the main product. Go on with T-234's refactor (split `hooks/core/` from `$`).
   Design the interface so the core can also run inside a separate daemon process.
2. Run the `codex queue` spike from T-233. If it passes, build the Codex side as a symcc daemon
   (L2). If it fails, the daemon still helps as a worker runner.
3. In that daemon, define an `AgentRunner` interface (start in a folder with a model, permission
   mode and MCP tools; stream events; get the final answer and tokens; stop). Write a Claude adapter
   (`claude -p` stream-json) and a Codex adapter (`codex exec --json` or app-server), then one ACP
   adapter for the rest. Only build L1 (symcc's own prompt) if the owner wants symcc to stop
   depending on any host's chat.
