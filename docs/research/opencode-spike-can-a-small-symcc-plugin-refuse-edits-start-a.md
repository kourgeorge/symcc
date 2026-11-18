# OpenCode spike: can a small symcc plugin refuse edits, start a worker in a worktree, wake the lead and show a panel?

This note keeps the answer of task T-370. The spike files were scratch work and are not committed.

## Question

Can a small symcc plugin for OpenCode (a) refuse edits outside the allowed files, (b) start a worker in a git worktree, (c) wake the lead, and (d) show a panel, plus the other points listed below?

## Answer

**Short answer:** Yes. Running OpenCode 2.3.0 with a 161-line plugin, I got all 7 points working. Only 3 things need care. A worker started with `parentID` ignores the folder you give it, so you must move it afterwards. Plugin tools are hidden inside OpenCode's "Code Mode" unless you turn that off. And the plugin starts again for every folder a session works in. The "Claude Agent" provider works with your Claude login, and under the hood it runs the real Claude Code through Anthropic's Agent SDK. Whether that use of a subscription login is allowed is not settled.

### How I ran it
- **Version:** the API is in the 2.x line only. The 1.19.4 copy in /opt/homebrew is a different, older line, and I did not use it.
- **Install:** `@opencode/cli`, `@opencode/plugin` and `@opencode/client` 2.3.0, all inside `spike/opencode/` (`opencode --version` → `v2.3.0`). Nothing was installed globally.
- **Running it:**
  - All OpenCode settings and data went to scratch folders, through `XDG_*` variables pointing at `spike/xdg/`.
  - Server: `opencode serve --port 47123`.
  - Driving it: `opencode api --server …` (see `spike/api.sh`).
  - The screen: the OpenCode TUI attached to that server. The screen captures are `spike/p1.txt` and `p2.txt`.
- **Test repo:** a scratch repo `spike/proj` with a git worktree `spike/wt1` (branch w1). The allowed files were `src/`.
- **Models:** the free OpenCode model "Big Pickle", plus `claude-agent/haiku`.
- **Plugin files:**
  - /Users/georgekour/repositories/symcc/.symcc/worktrees/T-370/spike/xdg/config/opencode/plugins/symcc-spike/server.ts (120 lines)
  - /Users/georgekour/repositories/symcc/.symcc/worktrees/T-370/spike/xdg/config/opencode/plugins/symcc-spike/tui.tsx (41 lines)
  - Findings log: `spike.log` next to them.
- **Earlier work:** try 1 did most of the screen, wake-up and claude/codex runs before it was stopped. This try re-ran everything that was unclear: both kinds of refusal, the worker's folder, interrupt, codex, the Claude Agent provider and direct tools.

### The 7 points

| # | What | Result | Exact API (2.3.0) and what I saw |
|---|---|---|---|
| 1 | Refuse edits | **Works** | **First way:** throw an error in `ctx.tool.hook("execute.before", e => …)`. The edit fails with `{"type":"unknown","message":"symcc: README.md is outside the allowed files src/"}`. Writes to `src/b.ts` still go through.<br>**Second way:** in `ctx.permission.hook("evaluate", e => { e.effect = "deny"; e.message = … })`. The edit fails with `{"type":"permission.rejected", …}`.<br>Both ways also caught calls made from inside Code Mode `execute`, and calls from a Claude Agent worker. |
| 1b | Refuse shell commands | **Works, but only by matching the command text** | Both hooks refused shell commands (`cat README.md`, `rm -f …`).<br>`permission.evaluate` gets the command already split into parts, e.g. `"sleep 60 && echo done"` arrives as `["sleep 60","echo done"]`.<br>`ctx.shell.hook("create.before")` shows the command and the folder it runs in (`cwd`).<br>OpenCode cannot tell which files a shell command writes, so `echo x > file` can only be caught by pattern-matching the text. Absolute paths outside the folder also raise an `external_directory` permission check. |
| 2 | Start a worker in a worktree | **Partly: it works, with one trap** | **The trap:** `session.create({parentID, location:{directory: wt1}, model, permissions})` **ignores `location` when `parentID` is set**. The child gets the parent's folder: `pwd` printed `…/proj`, and the worker wrote `proj/src/w.ts`. I checked this with direct API calls too: without `parentID` the folder is wt1, with `parentID` it is proj.<br>**The fix:** call `session.move({sessionID, directory: wt1})` right after. The move takes effect a moment later (`session.get` right after it still showed proj). After that, `pwd` = wt1, files land in wt1, and an absolute-path write into `proj/` was refused by the hook.<br>**Waiting:** `session.wait` works.<br>**Results:** `session.get` gives `outcome` ("succeeded" or "interrupted"), `tokens` {input, output, reasoning, cache} and `cost`. `session.context` gives the messages, so you can read the final text.<br>**Interrupt:** `session.interrupt` returned `{interrupted:true}` after 12 s of a `sleep 90`, and the outcome was "interrupted".<br>**Cost:** it was 0 for both the free model and Claude Agent, so it is not useful for cost stats there. |
| 3 | Wake the lead | **Works** | `session.prompt({sessionID, text, delivery:"queue"})` from a timer, 8 s after the lead went idle: the lead woke and answered "AWAKE".<br>`delivery:"steer"` while the lead was busy: the text was taken in mid-turn, between two shell commands ("echo steered" ran before "echo two").<br>Also, a child made with `parentID` sends an automatic message to the parent when it finishes (`type:"synthetic", metadata.source:"subagent", state:"completed"`). |
| 4 | Panel and strip above the prompt | **Works** | In `tui.tsx`, `ctx.ui.slot({append:"session.panel", render})` draws the panel. It is opened with `ctx.ui.panel.open("symcc.board")`, from a `ctx.keymap.layer` command that also gives a `/board` slash command.<br>`ctx.ui.slot({append:"session.composer.top"})` draws the strip above the prompt.<br>Both refreshed on their own every second, from a Solid signal plus `setInterval` (the tick count went 13 → 16 in the screen captures). |
| 5 | Lead tool and slash command | **Works** | `ctx.tool.transform(t => t.add({name, description, input, execute}))` adds a tool.<br>**But:** by default a plugin tool is **only reachable inside Code Mode**. The model has to call `execute` with code like `tools.symcc_spawn(...)`. Adding `options:{codemode:false}` made `symcc_wake_later` a normal tool (the model listed it next to edit, shell and the rest).<br>`ctx.command.transform(c => c.add({name, execute}))` adds a slash command. `/symcc-board` ran with `inv.delivery = "steer"` and posted into the chat. |
| 6 | Git, files, timers | **Works** | Plugins run inside the server under Bun (`globalThis.Bun` exists, `process.version` v26.3.0).<br>`node:child_process` (`git worktree list`) and `node:fs` work, and `setInterval` / `setTimeout` work in setup.<br>Editing the plugin file reloads it on the fly. |
| 7 | Models | **Works** | **Lead and workers** can use any model OpenCode knows (`/api/integration` lists hundreds of providers). The model is set per session through `model:{providerID,id}`.<br>**Claude Agent** (`claude-agent`): the only sign-in it offers is "Claude Code login (claude auth login)", meaning your existing login. After `POST /api/integration/claude-agent/connect/external`, the models opus, fable, sonnet and haiku showed up. A haiku worker in wt1 ran fine. It used OpenCode's tools as `mcp__opencode__*`, and **symcc's hooks still refused its README write**.<br>Under the hood (from text inside the binary) it runs the installed `claude` program through `@anthropic-ai/claude-agent-sdk`, with `settingSources:[]` and `disableAllHooks:true`. So Claude Code's own plugins and hooks are off, and OpenCode's hooks do the guarding.<br>The other way also works: the plugin starts real processes itself. `claude -p … --output-format json --model haiku` returned PONG, with tokens and `costUSD` 0.0043. `codex exec --json -s read-only` returned PONG with usage, **but only after closing its stdin**. Without that it waits on "Reading additional input from stdin" until it is stopped. |

### What surprised me
1. A worker made with `parentID` ignores `location`. You have to call `session.move` after creating it.
2. Plugin tools are hidden in Code Mode unless you set `options:{codemode:false}`.
3. **The plugin runs once per folder.** When a worker moved to wt1, a second copy of the plugin started there, with its own setup and its own timers. Its `ctx.location.directory` is wt1. That is handy for "allowed files are relative to the worktree". But it means symcc's board state can't simply live in plugin memory, and timers would run twice. **Guess:** the state would need one owner, such as a file lock or a separate symcc daemon.
4. Claude Agent is the real Claude Code engine with Claude Code's own hooks turned off and OpenCode's tools plugged in. So "real Claude" and "OpenCode's guards" can be had together.
5. OpenCode has its own built-in `schedule_create` tool (seen as text inside the binary) and an `experimental.idle` session hook. I did not try either.
6. On cost: 0 is reported for subscription and free models.

### Is the Claude login allowed? (not settled)
- Anthropic's Agent SDK docs say: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login … including agents built on the Claude Agent SDK" ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)).
- Someone on the Claude Code team later said that nothing changed for Agent SDK use with Max plans ([The New Stack](https://thenewstack.io/anthropic-agent-sdk-confusion)).
- OpenCode's provider runs the installed `claude` program and does not copy the login ([CellCog](https://cellcog.ai/blog/opencode-claude-subscription)), but nobody has publicly said whether that is OK.
- The safest choice for workers stays symcc running `claude -p` itself, since that is your own use of Claude Code.

### How symcc's planned `Host` would map onto OpenCode (docs/research/host-independence.md:175-215)

**Today's hooks**
- `session.start`: the plugin `setup`.
- Tool refusal (`agentTool` deny, stopped agents, scout and role file edits): `permission.hook("evaluate")`. It is the cleaner choice, because it gets the action and files ready-made. Keep `tool.hook("execute.before")` for anything else, plus `shell.hook("create.before")` to see shell commands.
- `prompt.submit` (`ownerSaid`): guess, the `session.hook("prompt")` hook. Not tested.
- `agentEnded`: `session.wait` resolving, or the parent's "subagent completed" message.

**The `Host` members**

| Member | OpenCode |
|---|---|
| `agents.start` | `session.create({model, permissions})` → `session.move(worktree)` → `session.prompt`. Or, for real Claude/Codex, `child_process` running `claude -p` or `codex exec` with stdin closed |
| `agents.list` | `session.list({parentID})` / `/api/session/active` |
| `agents.stop` | `session.interrupt` (or kill the process) |
| Results and tokens | `session.get`, `session.context` |
| `lead.tell` | `session.prompt({delivery:"queue"})`, and `"steer"` for urgent things |
| `ui.refresh` / `openBoard` | Solid signals in the `session.panel` slot, and `ui.panel.open` |
| `ui.status` | the `session.composer.top` slot |
| `ui.toast` | toasts exist according to the docs; not tested |
| `tools()` / `commands()` | `tool.transform` with `codemode:false`, and `command.transform` (or TUI `keymap` slash commands) |
| `fs`, `run`, `clock` | `node:fs`, `node:child_process`, timers. They work in the plugin |
| `leadUsage` | `session.get` on the lead gives tokens (guess: that is enough) |

### What I could not check
- `ctx.worktree.create` (I made the worktree with git myself).
- Toasts, and the `session.hook("prompt")` and `experimental.idle` hooks.
- Whether a panel can be opened from the server side, without a key press.
- The 1.19.x plugin API.
- Whether two copies of the plugin can share state safely.
- The web or desktop screens (I used the TUI only).

### First OpenCode adapter: build tasks, in order
1. Plugin skeleton for 2.3, with a server part and a TUI part. Add a lock so only one plugin copy runs symcc's engine and timers, and the copies in worker folders only enforce refusals (needs designing).
2. A `hooks/opencode/host.ts` that builds `Host` from `ctx`, with `fs`, `run` and `clock` from Node and Bun.
3. Edit refusal through `permission.hook("evaluate")`, using each session's worktree and allowed files. Shell commands checked by text. Stopped agents refused.
4. `host.agents` with two runners: OpenCode sessions (create → move → prompt → wait/interrupt, with tokens) and external `claude -p` / `codex exec` (stdin closed). The model is chosen per role.
5. `host.lead.tell` through `session.prompt` queue/steer, and the parent wake-up when a worker finishes.
6. Lead tools (`codemode:false`) and slash commands, mapped onto `Symcc.tools()` and `Symcc.commands()`.
7. TUI: a board in `session.panel` and the status strip in `session.composer.top`, fed from the board file and refreshed on a timer or a signal.
8. A decision from you on the Claude Agent provider versus symcc running `claude -p` itself, for Claude workers.

### Recommended next step
Wait until the `Host` refactor (T-240..T-246) has settled the member names. Then make task 1+2+3 a single first adapter task, starting from the spike's `server.ts`. Pick the Claude worker path (task 8) before task 4.

**Leftovers:**
- Everything is under /Users/georgekour/repositories/symcc/.symcc/worktrees/T-370/spike/ and is not committed. It is about 220 MB of `node_modules` and the scratch OpenCode data.
- That data includes two "Claude Agent" connection entries in `spike/xdg/data/opencode/opencode.db`. They point to your Claude Code login, and from what I read OpenCode does not copy the login itself.
- No server is still running, and the /tmp scripts are deleted.
