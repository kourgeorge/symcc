# Research: can symcc work inside an IDE like VS Code, and how?

Kept from task T-406 (checked 2026-11-18) so later tasks can read it. Guesses are marked "guess".

## Question

Can symcc work inside an IDE like VS Code, and how?

## Answer

Yes, mostly as it is today. Claude Code's own VS Code extension (2.1.322, installed here) runs the real Claude Code engine and loads module plugins. With symcc loaded and attached as the `vscode` screen, symcc's hooks, 17 lead tools, 14 slash commands and 5 agent types all loaded. The board panel drew in full with working buttons.

JetBrains runs the normal `claude` program in its terminal, so symcc works there exactly as in a terminal.

Other routes (our own VS Code extension, or symcc in Copilot's chat) need the planned standalone symcc engine (T-377) first.

## How it was found

- Read the earlier host research note, the OpenCode spike note, `hooks/host.ts`, `hooks/app/symcc.ts`, `hooks/core/panel.ts`, `hooks/register.tsx` and `hooks/claude/host.ts`.
- Read the Claude Code type file shipped with symcc (`.claude-plugin/types/claude-code/index.d.ts`, written by Claude Code 2.1.319).
- Looked inside the installed extension (`~/.vscode/extensions/anthropic.claude-code-2.1.322-darwin-arm64`, VS Code 1.146.0).
- Real try: a scratch git repo in /tmp. The extension's own bundled engine (`resources/native-binary/claude`, 2.1.322) was started the way the extension starts it (`--output-format stream-json --input-format stream-json`, user/project/local settings, `--plugin-dir` pointing at the symcc worktree). Then the same requests the extension sends: `initialize`, `ui_attach` with `surface:"vscode"`, the message `/symcc`, `ui_panes`, and `ui_render` for `Pane` and `AbovePrompt`. No model calls. The scratch files were deleted.
- Web docs, listed under Sources.

## 1. Claude Code's VS Code extension and JetBrains plugin

Seen in the real try (engine 2.1.322):

- **Plugin loads.** Listed as `symcc 0.3.0`.
- **Commands.** All 14 slash commands listed (`symcc`, `symcc-tasks`, `symcc-approve`, `symcc-reject`, `symcc-diff`, ..., `symcc-help`).
- **Lead tools.** All 17 listed: `mcp__symcc__add/approve/ask/ask_owner/board/change/drop/kinds/pause/reject/resume/retry/roles/scouts/settings/setup_git/stats`.
- **Agent types.** `symcc:scout`, `symcc:worker`, `symcc:worker-web`, `symcc:worker-webfetch`, `symcc:worker-websearch`.
- **Session start ran.** It sent a status line (`auto · 8 scouts`), a toast ("added 8 example scouts...") and opened the pane `symcc-board`.
- **Board drew in full** on the `vscode` screen: logo header, tabs `[t]: Tasks (0)`, `[s]: Scouts (8)`, `[c]: Settings`, "All clear...", and a footer with `[m] review merge` and `[f] search`. Each Button came back with a press handle, so clicks reach symcc.
  - symcc draws only `Box`, `Text`, `Button` and `Input`. All four are in the `vscode` element list (types file, around line 4072).
  - The terminal-only elements (`Client`, `Raster`, `Image`) are not used.
- **Band above the prompt.** symcc's hook ran but drew nothing. Probably because the board was empty and nothing needed the owner (not confirmed).
  - The 2.1.319 type file says `AbovePrompt` is "Raised on the terminal and desktop surfaces only" (around line 11089).
  - The 2.1.322 extension code lists `AbovePrompt` among the parts it draws, and its chat page has its own band drawing code.
  - Guess: the band works in 2.1.322 and the type file is behind.
- The extension also handles `ui_toast`, `ui_status` and pane show/focus/close.

From the docs ([VS Code page](https://code.claude.com/docs/en/vs-code), undated, checked 2026-11-18):

- "A plugin that contains a mod can draw in the chat panel. Drawing requires extension version 2.1.299 or later."
- It can show "a pane beside the conversation or above the prompt box" and "a toast or a status line above the prompt box".
- Plugins are shared with the CLI.
- Only "a subset" of commands and skills is available in the extension. symcc's commands were all listed in the try.
- The `claudeCode.useTerminal` setting runs the normal terminal program inside VS Code. That is today's symcc unchanged.

JetBrains ([docs](https://code.claude.com/docs/en/jetbrains)): "The plugin runs the `claude` command in your IDE's integrated terminal." So symcc works as in a terminal. Not tried in PyCharm.

Not checked (expected to work because it is the same engine, but that is a guess):

- The real VS Code window: hotkeys, Esc and widths in the chat page.
- Waking the lead (`$.prompt.submit`) in a real turn.
- A worker starting, merging and handing back from the extension.

## 2. Our own small VS Code extension

What it would take:

- A tree view or webview showing the board from `.symcc/board.json`.
- A status bar item showing "NEEDS YOU".
- Pop-up notifications when the board changes.
- "Open worktree" and "Show diff" (VS Code's diff view of the task branch against main).

All are standard VS Code APIs. A read-only version is small work (guess: a few days).

The hard part is the buttons (approve, reject, retry, answer):

- symcc's engine lives inside the Claude session: board state in memory, timers, workers.
- An outside extension writing `board.json` directly would clash with symcc's own writes.
- The Claude extension's commands include no "send a prompt" command, so `/symcc-approve` can't be typed into its chat. Only the command list was checked.
- So buttons need either the standalone engine with an API (T-377), or a new "request file" that the plugin watches (design guess).

What it can reuse:

- `hooks/core/` (7,086 lines). It imports nothing from `claude-code` or Node.
  - `panel.ts`: board sections, NEEDS YOU, workers and scouts text.
  - `board-file.ts`: the board format.
  - `commands.ts`: diff stats text.
  - `failure.ts`, `days.ts` and others.
- It can't reuse the drawing code in `hooks/plugin/ui` (Claude Code's elements), so a webview would be drawn again in HTML.

## 3. Other routes

- **MCP server plus an MCP App in VS Code's own chat (Copilot).**
  - Supported since VS Code 1.109 (January 2026) ([blog, 2026-01-26](https://code.visualstudio.com/blogs/2026/01/26/mcp-apps-support)).
  - Limits ([MCP guide](https://code.visualstudio.com/api/extension-guides/ai/mcp), 2026-11-11): inline only; "Send message" fills the chat input but "does not auto-send"; experimental.
  - An extension can register the server with `vscode.lm.registerMcpServerDefinitionProvider`.
  - Missing: waking the lead (guess: an MCP server can't start a chat turn), slash commands, the band, edit refusal for the lead.
  - Needs the engine split out first.
- **Language Model Tool API and Chat Participant API.**
  - Tools are declared under `contributes.languageModelTools` and registered with `vscode.lm.registerTool` ([guide](https://code.visualstudio.com/api/extension-guides/ai/tools), 2026-11-11).
  - Covers only Copilot agent mode. "A generic confirmation dialog will always be shown for tools from extensions" (the user can pick "Always Allow").
  - A chat participant only answers when @-mentioned, so it can't be a long-running lead.
  - Adds nothing over MCP.
- **VS Code's own "Claude" agent** (in Copilot Chat, on the Claude Agent SDK).
  - In preview since 1.109. Its docs ([agent harnesses](https://code.visualstudio.com/docs/agents/run/agent-harnesses), 2026-11-11) say sessions "use Claude project configuration" but don't list plugins.
  - Guess: hooks and tools might load, but nothing would draw.
  - A third-party table ([matrix, Nov 2026](https://codylindley.github.io/ai-harness-engineering-compatibility-matrix)) says Copilot reads Claude plugins only "as a compatibility format" (skills, agents, hooks, `.mcp.json`). Guess: that excludes module plugins like `register.tsx`.
  - Not tried.
- **ACP in VS Code.**
  - No built-in support (open request [#265496](https://github.com/microsoft/vscode/issues/265496)).
  - Community extension [ACP Client](https://marketplace.visualstudio.com/items?itemName=formulahendry.acp-client) runs one agent at a time.
  - ACP has no way to draw a plugin panel.
- **OpenCode in VS Code.**
  - [`sst-dev.opencode`](https://marketplace.visualstudio.com/items?itemName=sst-dev.opencode) only opens the OpenCode terminal app, so an OpenCode symcc plugin would draw there as in the T-370 spike.
  - Beta chat extension [`sst-dev.opencode-v2`](https://marketplace.visualstudio.com/items?itemName=sst-dev.opencode-v2) is 0.1.1. Panels in it were not checked.

## 4. Who runs the workers, and how "only these files" is kept

- **Claude extension or terminal (routes A and B):** same as today. Workers are background subagents in the same engine. symcc's tool check (`checkEdit` / `guardReason`) refuses edits outside a task's files there too. Worker types were registered in the try; no worker was run.
- **Our own extension:** runs no workers itself. Either the Claude session still runs them, or later the standalone engine runs `claude -p` (or `codex exec`) in each worktree with symcc's checks loaded.
- **Copilot or VS Code agents as workers:** possible later. Guess: edits limited only through Copilot's hooks, which read Claude-style `PreToolUse` hooks per the third-party table. Not checked.

## Routes table

| Route | What works | What's missing | Effort | Reuses |
|---|---|---|---|---|
| A. Claude Code VS Code extension, chat page | Plugin, hooks, 17 tools, 14 commands, agent types, toast, status line, full board panel with buttons (tested on the engine) | Seen only through the engine, not by eye. Band, hotkeys, Esc, lead wake-up and a full worker run unconfirmed | None to small (fixes only) | Everything |
| B. `claude` in the VS Code terminal (`useTerminal`) or JetBrains | Everything, as today | Editor diff view only through the built-in IDE link | None | Everything |
| C. Our own extension beside A or B (status bar, notifications, open worktree or diff) | Read-only board, NEEDS YOU, opening worktrees and diffs | Buttons need an engine API (T-377) or a request file | Read-only: small (days, guess). With buttons: medium, after T-377 | `hooks/core` (panel, board-file, commands) |
| D. MCP server plus MCP App in Copilot chat | Inline board, tools | Waking the lead, commands, band, lead edit refusal; experimental | Large, needs the engine split | `hooks/core` and the engine |
| E. Language Model Tools or a chat participant | Tools in Copilot agent mode | Same as D, plus a confirm dialog on every call | Medium | `hooks/core` |
| F. VS Code's own Claude agent | Guess: hooks and tools | Panel; plugin loading unconfirmed | Unknown | ? |
| G. ACP client or OpenCode extensions | Chat with the agent | No plugin panel; OpenCode only through its terminal | Depends on the OpenCode adapter | OpenCode adapter |

## Recommendation and a first small step

symcc already works in VS Code through Claude Code's extension, so don't build a new host for it. First confirm it on screen, then maybe add a small companion extension for what only VS Code can do: status bar, notifications, opening worktrees and diffs.

Spike (one small task): "symcc on the VS Code surface".

- **(a) Automated.** Add a test using Claude Code's test kit (`claude-code/testing`) to draw the board panel and the band with `surface: 'vscode'`, then press a few buttons by key. The type file says the kit supports `terminal`, `desktop`, `vscode` and `mobile`. Run with `claude plugin test .`.
- **(b) Manual checklist** in VS Code with extension 2.1.322 or newer, on a scratch repo:
  - `/symcc` opens the board, and clicks and hotkeys work.
  - The band shows when a task needs you.
  - The status line and toasts show.
  - Add a tiny task: a worker starts, an edit outside its files is refused, it merges, and the lead wakes up when it finishes.
  - `/symcc-approve` and `/symcc-diff` work.
- Write down anything that only breaks in the chat page. If both pass, the answer for VS Code is "install the plugin". Only then decide whether the companion extension (route C, read-only first) is worth it.

Still unsure:

- Lead wake-up and a full worker run in the extension.
- Whether the band shows in 2.1.322.
- Whether VS Code's own Claude agent loads module plugins.
- JetBrains was not tried.

Side note: a second scratch run showed "driven by another session" in the board header, because the first run was killed while it still held the lead claim. That is existing behaviour.

## Sources (checked 2026-11-18)

- [Claude Code VS Code docs](https://code.claude.com/docs/en/vs-code), [Claude Code JetBrains docs](https://code.claude.com/docs/en/jetbrains)
- [VS Code MCP Apps blog (2026-01-26)](https://code.visualstudio.com/blogs/2026/01/26/mcp-apps-support), [VS Code 1.109 notes](https://code.visualstudio.com/updates/v1_109), [VS Code MCP developer guide (2026-11-11)](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [VS Code Language Model Tools guide (2026-11-11)](https://code.visualstudio.com/api/extension-guides/ai/tools), [VS Code agent harnesses (2026-11-11)](https://code.visualstudio.com/docs/agents/run/agent-harnesses), [Multi-agent blog (2026-02-05)](https://code.visualstudio.com/blogs/2026/02/05/multi-agent-development)
- [Harness compatibility matrix (third-party, Nov 2026)](https://codylindley.github.io/ai-harness-engineering-compatibility-matrix)
- [ACP Client extension](https://marketplace.visualstudio.com/items?itemName=formulahendry.acp-client), [VS Code ACP request #265496](https://github.com/microsoft/vscode/issues/265496)
- [OpenCode extension](https://marketplace.visualstudio.com/items?itemName=sst-dev.opencode), [OpenCode Beta extension](https://marketplace.visualstudio.com/items?itemName=sst-dev.opencode-v2)
- Local files: `.claude-plugin/types/claude-code/index.d.ts` (around lines 4072, 11089, 11146), `hooks/host.ts`, `hooks/core/panel.ts`, `hooks/claude/host.ts`, and in the installed extension `extension.js` and `webview/index.js`.
