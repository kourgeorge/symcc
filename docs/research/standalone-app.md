# Design: standalone symcc (engine + agent runners + TUI)

Task T-336. Written on 2026-11-20 against this worktree (branch `symcc/T-336`, last commit `2048bc7`).
Installed here: Claude Code 2.1.319, Codex CLI 0.169.0, Bun 1.3.14. Line counts are from `wc -l`
on this worktree. Anything I did not confirm is marked **(guess)**.

It builds on these notes and does not redo them:
[codex-host.md](codex-host.md) (T-233), [host-independence.md](host-independence.md) (T-234),
[standalone-cli.md](standalone-cli.md) (T-235), [codex-spike.md](codex-spike.md) (T-239),
[research-existing-hosts-that-wrap-many-coding-agents-claude.md](research-existing-hosts-that-wrap-many-coding-agents-claude.md) (T-337),
[opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md](opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md) (T-370),
[research-can-symcc-start-each-worker-in-a-sandbox-that-only.md](research-can-symcc-start-each-worker-in-a-sandbox-that-only.md)
and [merge-line.md](merge-line.md).

## Update 2026-11-20 (T-633): the owner answered, and the plan is narrower

The owner answered the open questions (section 11) and said: "i dont want to start implementing this
now, just building the design and infrastructure that would separate the client from the symcc
engine". So **only Phase 1 (section 12) is planned to be built now.** `symcc serve`, the API, MCP, the
lead chat, the TUI and the runners (section 13, the old build plan) are **later, not started**. The
rest of this note stays as the design for that later work. Where it says "the engine stays in this
repo" (section 3), the decision below replaces it.

## Short answer

Standalone symcc should grow out of the Node host (`hosts/node/`, T-377) step by step. It is not
a rewrite. First, `hosts/node` gets a long-running mode, `symcc serve`. This one process per project
runs the same `hooks/app` + `hooks/core` code that the Claude Code and OpenCode plugins run. It also
has a small local API (HTTP plus an event stream) and an MCP endpoint for the lead's tools. Every
screen talks to that API: a TUI (a separate project), the Claude Code plugin as a thin client, and
later the web or MCP Apps.

Workers run through the shared process runner (`hooks/process/`). It runs `claude -p` today, with
`codex exec --json` next and ACP after that. The lead comes in two forms. In (a), symcc runs the lead
chat itself, as a long-lived `claude -p --input-format stream-json` session that gets the board tools
over MCP. In (b), the owner's own Claude Code chat stays the lead.

About half of this is already built: the shared engine code, three hosts, the process runner with
`claude -p`, the view file, task events and the merge line. What is missing is the long-running
process, the API, the MCP endpoint, progress streaming, the Codex and ACP runners, lead (a), the
TUI and the thin-client mode.

## 1. What changed since T-235 said "not now"

[standalone-cli.md](standalone-cli.md) (2026-11-16) said "not now" for three reasons. All three
have changed:

| T-235's reason | What is true today (2026-11-20) |
|---|---|
| symcc's code was tied to Claude Code's `$`; a standalone app would rewrite most of `hooks/plugin/` | The Host refactor is done (T-240..T-246, T-371..T-373). `hooks/host.ts` is symcc's own `Host` interface. All logic is in `hooks/app/` (30 files, 8,428 lines) and `hooks/core/` (41 files, 10,807 lines). Three hosts build a `Host`: `hooks/claude/host.ts`, `hooks/opencode/host.ts` and `hosts/node/host.ts`. |
| No way to run workers outside Claude Code | `hooks/process/` (T-377, shared since T-474) runs each worker as its own `claude -p` process, with `claudePermissions` as the edit guard and the result, tokens and cost read from stream-json (`hooks/process/claude-runner.ts`). OpenCode uses the same code. |
| The lead would lose Claude Code's chat UI | Still true for lead (a). But the owner now wants both forms (decision of 2026-11-17), and T-337 showed that no host covers everything. So symcc needs its own engine anyway, with hosts as screens. Lead (b) keeps the Claude Code chat. |

T-235 also asked for a "symcc daemon (MCP server + worker runner + board in a terminal)". That is
this design.

## 2. What is already built, and what is still missing

### Built (with where it is)

| Piece | Where | What it gives the standalone app |
|---|---|---|
| Host interface | `hooks/host.ts` (`Host`, `HostFeatures`, `HostWords`, `noUi`, `FileTouch`) | The engine is "one more Host". `features` already covers a host with no panel or band (`panel:false, band:false`) and the lead woken now or on its next turn (`wakeLead`). |
| Entry points | `hooks/app/symcc.ts`: `sessionStart`, `sessionEnd`, `toolCall`, `runCommand`, `agentFinished`, `leadUpdate`, `toolCheck`, `leadGuideText`, `COMMANDS(features)` | Every API call maps to one of these. Nothing new in the logic. |
| Lead tools list | `hooks/app/tools.ts:349` `TOOLS()`: `{name, description, inputSchema}` each | Already in the shape MCP's `tools/list` wants (JSON Schema `inputSchema`). |
| Node host + tiny CLI | `hosts/node/main.ts` (`add`, `tick`, `board`, `tool`, `cmd`), `session.ts` (`openSession`, `leadTool`, `slashCommand`, `settle`), `host.ts` (`NODE_FEATURES`, `nodeFs`, `runCommand`, `nodeClock`), `system.ts` | The seed of `symcc serve`. Today each CLI run is one short session. Agents start only during a `tick`, and lead updates are printed as `[lead]`. |
| Process runner | `hooks/process/agents.ts` (`AgentRunner {name, command, result}`, `processAgents`, `withBasePrompt`), `record.ts` (`.symcc/processes.json`, leftovers stopped after a restart) | The runner shape the owner asked for: start in a folder with a prompt and file list, stop, result and tokens. It has no progress streaming yet (see below). |
| Claude runner | `hooks/process/claude-runner.ts` (`claudePermissions`, `editRule`, `gitDeniedRules`, `claudeResult`) | `claude -p --output-format stream-json` with `--permission-mode dontAsk` and `Edit(./file)` allow rules: "only these files" for Claude workers. |
| Task phase | `hooks/core/phase.ts` `taskPhase(t, now)` → `{state, shown, stage, place, waitsFor, approved, since}` | One answer to "where is this task", the same for every screen. |
| Task events | `hooks/core/events.ts` (`TaskEvent {task, kind, from, to, at, try, place?}`), `hooks/app/events.ts` (`onTaskEvent`, `.symcc/events.jsonl`) | Exactly what the API's event stream needs. A listener is one line of code. |
| Merge line | `hooks/app/merge-line.ts`, `.symcc/merge-line.json` | One merge at a time across the whole project, even with several processes. So the engine and a Claude Code session can share a board safely. |
| Driver claim | `hooks/app/lead.ts` `claimLead`, `.symcc/lead.json`: "Only one session (the driver) starts workers, merges, runs scouts ... the others read and change the board but start nothing" (`lead.ts:13-15`) | The base of lead (b). A Claude Code session that isn't the driver is already almost a thin client. |
| View file + screen helpers | `hooks/opencode/view.ts` writes `.symcc/view.json`. `hooks/opencode/board-view.ts` (905 lines, no drawing and no file reads) turns it into lines of colored text: `parseViewFile`, `bandDraw`, `panelLines`, `panelKeys`, `PANEL_TABS`, `LETTER_KEYS`, `TASK_ACTION_COMMANDS`, `actionCommand`, `answerOptions` | OpenCode's TUI (`hooks/opencode/tui.ts`, 696 lines) is already "a screen in another process that reads the view and sends actions as slash commands". The standalone TUI is the same idea. |
| Org-mem | `hooks/app/org-mem.ts`, `hooks/core/org-mem.ts`, `.symcc/org-mem.md` | Works on every host already (it is part of the prompts). |

### Still missing

1. **A long-running engine process.** `hosts/node/session.ts` only starts agents inside `settle(s, true)`.
   Any other start is taken back (`StartCancelled('started only by a tick')`). `symcc serve` must
   keep a session open, start agents at any time and run the timers (scouts, heartbeat).
2. **An API.** Today the only ways in are the CLI and the files under `.symcc/`.
3. **An MCP endpoint** for the lead's tools. There is no MCP server in the repo
   (`grep -ril mcp hooks hosts` finds only tool-name words). `package.json` has no dependencies.
4. **Progress streaming from workers.** `processAgents` collects stdout and reads it only when the
   process ends (`agents.ts`, `child.stdout.on('data', ...)` → `runner.result(...)`). `agents.send` is
   a no-op for process agents ("A process started with -p takes no more messages"). So there is no
   "wrap up" message, and no `ask_owner` in the middle of a run (the base prompt tells process
   workers to write their question in the report instead, `withBasePrompt`).
5. **A Codex runner** (`codex exec --json`). It is named only in a comment (`hooks/process/agents.ts:4`).
6. **Agent per role or kind.** `RoleDef` has `model` but no `agent` (`hooks/core/roles.ts:20`).
   `HostAgentStart` has no `agent` either.
7. **Lead (a)**: a lead chat run by symcc.
8. **The TUI.**
9. **The Claude Code plugin as a client of a running engine** (lead (b) with the engine driving).
10. **An ACP runner.**
11. The view helpers live under `hooks/opencode/`, although they hold no OpenCode code. Before a
    second screen uses them, they should move to a host-free folder.

## 3. The shape

```
                 ┌──────────── screens (clients of the API) ────────────┐
   TUI (separate project)   Claude Code plugin (thin)   later: web, MCP App board, OpenCode
                 └───────────────┬──────────────────────────────────────┘
                                 │ local HTTP: /view, /events (SSE), /tool, /command, /lead
                                 │ + /mcp (the lead's board tools)
                    ┌────────────┴────────────┐
                    │ symcc serve (one per    │  hosts/node: Host = nodeFs, runCommand, nodeClock,
                    │ project): hooks/app +   │  processAgents(runners), lead sink
                    │ hooks/core, unchanged   │
                    └──┬──────────┬────────┬──┘
                       │          │        │
              claude -p      codex exec   ACP agent      (workers, scouts, checkers)
              lead chat (a): claude -p --input-format stream-json, tools over /mcp
```

- **One engine per project.** `S` in `hooks/app/state.ts:171` is one module-level object, so one
  process runs one project. This fits the owner's "one engine per project".
- **The engine is a Host.** `symcc serve` is `hosts/node` plus: a session that stays open, an API,
  an MCP endpoint and a lead sink. It is not new logic. The engine claims `lead.json` like any
  driver, so a Claude Code session on the same project stops driving on its own (`claimLead`).
- **Which parts go in the separate project.** Decided on 2026-11-20 (see section 11): **the engine
  and the TUI both move out later**, not only the TUI. So the shared code (`hooks/core`, `hooks/app`,
  `hooks/process` and the view helpers) must become a package that this repo's plugins (Claude Code,
  OpenCode, Node) and the future standalone repo all use. Phase 1 (section 12) prepares that.
  (My first recommendation, "only the TUI leaves", is dropped.)

## 4. The engine API

A local HTTP server on `127.0.0.1` with a random port. At start it writes
`.symcc/engine.json` = `{pid, port, token, version, started}`. Every request sends the token
(`Authorization: Bearer`). The file is git-ignored like the rest of `.symcc/`, and readable only by
the owner (mode 600). HTTP plus SSE because Bun has both built in (`Bun.serve`), and because
browsers, `curl` and MCP's "Streamable HTTP" transport all use it. **(guess:** a Unix socket would
work as well. HTTP is chosen only because the web screen and MCP need it anyway.)

| Call | What it does | Built on |
|---|---|---|
| `GET /view` | The board view: the same JSON as `.symcc/view.json` (`ViewFile`: the `PaneView`, scout runs, roles, kinds, changed files, plus folder, name, version) | `ui.panel.updateView` (the Host's panel values), `viewFileText` in `board-view.ts` |
| `GET /events` (SSE) | `task` events (`TaskEvent`), `view` (a new view; or only "changed", and the client fetches `/view`), `agent` progress lines, `lead` chat messages, `toast`, `status` (the band text) | `onTaskEvent`, `ui.toast`, `ui.status`, the runner's progress (new) |
| `POST /tool/{name}` `{input}` | Runs one of the lead's tools (`add`, `change`, `approve`, `reject`, `board`, `settings`, ...) and answers its text | `toolCall(host, toolName(name), undefined, input)` (as `leadTool` in `hosts/node/session.ts`) |
| `POST /command/{name}` `{args}` | Runs a slash command (`symcc-approve T-5`, `symcc-mode review`, ...) | `runCommand` (as `slashCommand`). The OpenCode TUI already sends every panel action this way (`actionCommand`). |
| `POST /lead/message` `{text}` | The owner types to the lead (a) | the lead chat (section 6) |
| `GET /lead/transcript?after=` | The lead chat so far, for a screen that just opened | `.symcc/lead-chat.jsonl` (new) |
| `GET /agents/{id}/log?after=` | A worker's progress lines ("Watch worker") | the runner's progress log (new) |
| `POST /lead/attach`, `GET /lead/updates` | For lead (b): an outside chat says it is the lead and takes the board updates | `leadUpdate()` (the `wakeLead:'next-turn'` path that already exists) |
| `POST /mcp` | MCP Streamable HTTP: `initialize`, `tools/list` (from `TOOLS()`), `tools/call` (→ `toolCall`) | for the lead (a), and any MCP client as lead (Codex, T3 Code, Claude Code without the plugin) |
| `POST /stop` | Ends the engine: stops agents (`stopAll`), lets go of `lead.json` | `sessionEnd`, `stopForQuit` |

Clients never write `board.json` themselves. The one exception is a Claude Code plugin that is not
the driver: it already writes the board under the lock (`locked` in `hooks/app/store.ts`), and that
stays allowed. The engine sees those writes through `followBoard`, like any driver.

## 5. Agent runners, and how each one keeps to "only these files"

The shape stays today's `AgentRunner` (`hooks/process/agents.ts`). Two members are added:

```ts
interface AgentRunner {
  name: string                                   // 'claude', 'codex', 'acp:gemini', ...
  command(a: HostAgentStart): { argv; stdin?; env? }
  result(out: ProcessOutput): RunnerEnd          // answer, end reason, tokens, cost, denied
  progress?(line: string): AgentProgress | null  // NEW: one stdout line → a short progress item
  message?(text: string): string | null          // NEW: a line to write to stdin (send / wrap up), if the agent takes input
}
```

ACP does not fit "one process, read stdout at the end", because it is a JSON-RPC conversation.
It gets its own `Host['agents']` maker next to `processAgents` (`acpAgents`), with the same outside
shape. `processAgents` picks a runner per start from `HostAgentStart.agent` (new, from the role or
kind, see 5d).

The merge-time scope check stays the backstop for every runner. A change outside the task's files is
refused when the task is merged, whatever the runner let through (the checker and merge code in
`hooks/app/checker.ts`, `hooks/app/review.ts`, with `asked_files` for an OK from the owner).

### 5a. Claude (`claude -p`), first. Built.

- Command: `claude -p --output-format stream-json --permission-mode dontAsk --allowedTools ... --disallowedTools ...`
  (`claude-runner.ts`).
- Files: `claudePermissions(a, scratch)` allows `Edit(./<file>)` and `Write(./<file>)` for each listed
  file, read tools and `Bash` for everyone, and denies every git write (`gitDeniedRules`). In
  `dontAsk` mode, anything not allowed is refused. Refusals come back in `permission_denials`, which
  are logged.
- Hole: `Bash` can still write files (`echo > x`). Today that is caught by the merge-time check only.
  The sandbox note offers OS sandboxing of Bash on macOS and Linux (way "(A)" in
  [research-can-symcc-start-each-worker-in-a-sandbox-that-only.md](research-can-symcc-start-each-worker-in-a-sandbox-that-only.md)).
  The owner said "not now" to that (T-365).
- To add: progress from `--output-format stream-json` lines (`assistant` and `tool_use` messages,
  read with `--include-partial-messages` off), and `--input-format stream-json` so that
  `agents.send` works (a wrap-up message). **(guess:** a user message written to stdin while a `-p`
  turn runs is taken after that turn; I did not try it.)
- Other option: `--permission-prompt-tool` (`claude --help` lists it under `--permission-prompts host`).
  It would send each permission question to a symcc MCP tool, which could answer with symcc's own
  path guard (`hooks/core/path-guard.ts`, the same check the Claude Code plugin's tool hook uses).
  That would match the plugin exactly, Bash included. Not needed for the first version.
  **(guess:** that it works with `dontAsk`; not tried.)

### 5b. Codex (`codex exec --json`), second

- Command: `codex exec --json -C <worktree> -s workspace-write -m <model> "<prompt>"`
  (`codex exec --help`, 0.169.0: `-s, --sandbox read-only|workspace-write|danger-full-access`, `-C, --cd`,
  `--json` "Print events to stdout as JSONL"). T-239 ran this end to end with a fake model
  ([codex-spike.md](codex-spike.md)).
- Result: the last agent message and the `turn.completed` usage (tokens only, no dollars). A worker
  that was stopped prints no `turn.failed`, so "stopped" is judged from `killed` plus a missing
  `turn.completed` (T-239 blocker 3).
- Files: the sandbox lets the worker write only inside its worktree folder (`workspace-write`). It
  cannot limit writes to single files, so the task's file list is enforced by the merge-time check.
  **(guess:** git commits in a worktree need to write the main repo's `.git/worktrees/<name>`, which
  is outside the folder, so the sandbox would also block worker commits. That is what symcc wants,
  but it should be checked.) Scouts and checkers get `-s read-only`.
- Progress: every JSONL event is a progress line.
- Not supported: `send` (an `exec` run takes no more input). **(guess:** `codex exec resume <id>`
  could carry a wrap-up message as a new turn.)
- Auth: ChatGPT sign-in works for `codex exec`. The docs advise an API key for automation
  ([standalone-cli.md](standalone-cli.md) §1).

### 5c. ACP agents, third

- An `acpAgents` maker: start the agent's ACP command (for example `gemini --experimental-acp`,
  `opencode acp`, or the `claude-agent-acp` and `codex-acp` adapters), then `initialize`,
  `session/new` with `cwd` = the worktree, `session/prompt`, `session/cancel` to stop.
  `session/update` notifications are the progress. Method names are from the
  [ACP overview](https://agentclientprotocol.com/protocol/v1/overview).
- Files: symcc says it has the `fs.writeTextFile` capability and answers `fs/write_text_file` itself,
  writing only paths the path guard allows. `session/request_permission` is answered with the same
  guard: allow inside the file list, refuse outside it.
- Hole: the agent "only asks permission when it wants to". Its own tools can skip the client
  (T-337: Copilot CLI auto-approves in ACP mode). So for ACP agents the merge-time check matters most.
- Tokens: not part of ACP's baseline methods **(guess:** some agents send usage in `session/update`;
  not checked). The run's tokens may be "unknown".

### 5d. Picking the agent per role, kind or stage

- A role's front matter gets `agent: claude | codex | acp:<name>` next to `model:`
  (`hooks/core/roles.ts`). A kind may set it for its checker stage (kinds already carry an optional
  checker setting). The board's settings get a default (`agent: claude`).
- `HostAgentStart` gets `agent?: string`. Claude Code's and OpenCode's adapters ignore it (they run
  their own agents). `processAgents` picks the runner by name. An unknown name is refused at start,
  with a clear reason on the task.

## 6. The lead, form (a): symcc runs the lead chat itself

- **Which agent.** Claude first, as the real `claude` binary:
  `claude -p --input-format stream-json --output-format stream-json --mcp-config <engine's /mcp> --append-system-prompt <lead guide>`.
  The real binary under the owner's own login is the safe reading of Anthropic's terms
  ([standalone-cli.md](standalone-cli.md), "Auth and terms": "does not prevent an end user from
  signing in to the unmodified Claude Code binary"). The Agent SDK with a subscription is a grey area,
  so the SDK is not used for now. Later: Codex through `codex app-server` (`thread/start`,
  `turn/start`, `turn/steer`), or any ACP agent (`session/prompt`). The same `LeadChat` shape
  (start, send, interrupt, stream, stop) covers all three.
- **How its tools are given.** Over MCP from the engine's `/mcp`. `tools/list` is `TOOLS()`, so the
  lead has exactly the tools the plugin lead has. Their names become `mcp__symcc__board` and so on,
  which is what Claude Code's `HostWords.tool` already says (`hooks/claude/host.ts:7`), so the lead
  guide's words fit. The lead guide is `leadGuideText(host)` with the engine's `features` and
  `words`. Lead (a) has no plan mode (`planMode:false`), so the guide leaves it out, as it already
  does on OpenCode and Node.
- **How messages reach it.** The engine host gets `wakeLead: 'now'`, and `lead.send(text, {urgent})`
  writes one stream-json user message to the lead's stdin. symcc's batching stays as it is
  (`hooks/app/tell.ts`). For `urgent`, the engine may `interrupt` first and then send
  **(guess:** whether `claude -p` takes an interrupt over stream-json input; the Agent SDK has
  `interrupt()` and `streamInput()` (sdk.d.ts, per T-235)). The owner's own messages come from the
  TUI through `POST /lead/message` and go to the same stdin, and also to `ownerTyped(text)`, as the
  plugin does today.
- **Long chats and context.** Claude Code compacts long chats by itself **(guess:** also in `-p`
  stream mode). Nothing important lives only in the chat: the board, history, org-mem and questions
  are files, and the `board` tool rereads them. The engine saves the lead's session id
  (`.symcc/lead-chat.json`) and restarts with `--resume <id>` after a crash or an engine restart. A
  "new lead chat" key starts fresh, like `/clear` today (`sessionCleared`). The transcript is
  appended to `.symcc/lead-chat.jsonl`, so a TUI that opens later can show it.
- **Usage.** Each turn's `result` line has `usage` and `total_cost_usd`, so `lead.usage` can answer
  (`leadUsage: true`), and `stats` counts the lead as on Claude Code.
- **Questions.** The owner wants every question both on the board and as a pop-up (memory note of
  2026-11-20). In lead (a), `AskUserQuestion` has no screen to appear on. `HostWords.askPopup` is ''
  (as on OpenCode), and the TUI shows open questions in NEEDS YOU and as a dialog
  (`view.questions`).

## 7. The lead, form (b): the owner's Claude Code chat, with the plugin as a thin client

Today, two Claude Code sessions on one project already share the board. One drives and the other
"read[s] and change[s] the board but start[s] nothing" (`hooks/app/lead.ts:13-15`). With the engine
running, the engine is the driver. What has to be added:

1. **The plugin sees a live engine** (`.symcc/engine.json` with a live pid and an answering
   `/view`). It then never claims `lead.json`, even when the heartbeat looks stale (the engine has its
   own heartbeat). The panel and band keep working from the shared board file (`followBoard`). They
   could later read `/view` instead.
2. **Board updates reach the Claude Code chat.** The engine's `tell.ts` sends to `host.lead`. For
   (b), the engine's lead sink keeps the updates when a client has attached as lead
   (`POST /lead/attach`), and pushes a `lead` event. The plugin takes it and calls
   `$.prompt.submit`, as Claude Code's `HostLead.send` does today. While no lead is attached, updates
   wait (the `wakeLead:'next-turn'` queue that the Node host already uses).
3. **Tools.** The plugin's tools keep running in-process (they write the board under the lock). Or,
   simpler to reason about, they forward to `POST /tool/{name}`. Forwarding means one writer of board
   logic, so I would forward. **(guess:** the plugin runtime has `fetch`. `.claude-plugin/types` says
   `lib: es2023` with no DOM (host-independence.md §1a), so this must be checked first.)
4. **Workers.** Started by the engine (process runners), not as Claude Code subagents. The panel's
   "Watch worker" shows `/agents/{id}/log` instead of a subagent view.

Codex as lead (b) follows the same pattern: MCP for tools, and `codex queue` for updates (T-239
showed it lands in a running TUI within about 0.5 s). It is listed as an option in the plan.

## 8. The TUI (first screen; separate project)

### Layout (80x24 and up; the board column folds away under about 100 columns)

```
┌ symcc · myproject · main · auto ───────────────── 3 doing · 1 review · NEEDS YOU 2 ┐
│ NEEDS YOU: T-12 asks "keep the old flag?" [1] yes [2] no · T-9 ready for review     │  ← band (bandDraw)
├──────────────── lead chat ─────────────────┬──────────── board ─────────────────────┤
│ you: add dark mode and fix the login bug   │ ● Doing                                │
│ lead: added T-14 (dark mode), T-15 (bug)…  │   T-14 dark mode        worker 4m      │
│ [symcc] T-9 is ready for review …          │   T-15 login bug        checker        │
│                                            │ ◆ Review                               │
│                                            │   T-9  settings page    approve? a/x   │
│                                            │ ▸ Backlog (6)  ▸ Done (40)             │
├────────────────────────────────────────────┴────────────────────────────────────────┤
│ > _                                                     Tab: board · ? keys · ^C quit │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Band** (top): the same text as Claude Code's band and OpenCode's composer strip (`bandDraw`,
  row ends from T-615's shared helper).
- **Chat** (left): the lead (a) transcript (owner, lead, and symcc's updates marked `[symcc]`),
  with an input line. In lead (b) mode the chat pane is hidden and the board takes the whole width.
- **Board** (right): the Tasks, Scouts and Settings tabs (`PANEL_TABS`, keys `t s c`), drawn by
  `panelLines`.
- **Task page**: Enter on a row replaces the board pane with the task's page (`taskSections`, the
  same sections as Claude Code and OpenCode), with its actions on letter keys.
- **NEEDS YOU**: the band's first lines plus the board's top section (`needsYou`, `needsYouFirst`).
  A question opens a dialog with number keys (`CHOICE_KEYS`, `answerOptions`, `OWN_ANSWER`).
- **Worker log**: `l` on a running task's page shows `/agents/{id}/log` live.

### Keys (the same as the boards that exist, so the owner's habits carry over)

`Tab` switches focus between chat and board. On the board: `↑↓` move, `Enter` open, `f` search,
`t`/`s`/`c` tabs, `Esc` back (BOARD_OPENED, `hooks/app/symcc.ts:43`). On a task page: the letter keys
from `taskActions` (`hooks/core/panel.ts:561`), for example `a` approve or Done, `x` reject or Ask
more, `v` keep as a note, and the rest of `LETTER_KEYS`. Each action is sent as
`POST /command/{name}` with `actionCommand(a)`, exactly as OpenCode's TUI does (`tui.ts:497-517`).

### What is reused

- **From `hooks/claude/ui/`** (20 files, 4,075 lines; the task text calls it `hooks/plugin/ui`,
  which T-246's move renamed): **almost nothing directly.** It is TSX for Claude Code's own
  components and `$` (8 files import `claudeHost`, 2 import `claude-code`). What it draws comes from
  core, and core is reused: `hooks/core/panel.ts` (`taskActions`, sections), `details.ts`,
  `task-sections.ts`, `banner.ts`, `phase.ts`, `days.ts`.
- **From OpenCode's screen code: most of it.** `hooks/opencode/board-view.ts` (905 lines) is host-free
  and makes plain lines of colored text from the view. The TUI draws those lines and maps keys.
  `hooks/opencode/tui.ts` (696 lines) is OpenTUI/Solid code tied to OpenCode's slots and dialogs. Its
  key handling and dialog flows are a good model, but they are not importable as they are.
- **TUI library:** [OpenTUI](https://github.com/anomalyco/opentui) (`@opentui/core`, MIT, by the
  OpenCode team; "Bun 1.3.14 or later" per its [npm page](https://npmjs.com/package/@opentui/core)).
  OpenCode's TUI plugin already uses `@opentui/solid` (`hooks/opencode/opentui.d.ts`), so the drawing
  model is known. Bun here is 1.3.14. **(guess:** Ink would also work. OpenTUI is suggested only
  because the existing screen code uses it.)

## 9. Config, and where state lives

Everything that exists stays where it is, in the project's `.symcc/` folder: `board.json` (tasks and
board settings), `lead.json` (who drives), `merge-line.json`, `processes.json`, `events.jsonl`,
`view.json`, `org-mem.md`, `scouts.json`, `scouts/`, `reports/`, `roles/`, `kinds/`, `worktrees/`.
That is what lets the engine, a Claude Code session and an OpenCode session share one board.

New files (names are proposals):

| File | What |
|---|---|
| `.symcc/engine.json` | `{pid, port, token, version, started}` of the running engine, mode 600. Removed on a clean stop. A stale one is detected by its pid. |
| `.symcc/lead-chat.json`, `.symcc/lead-chat.jsonl` | the lead (a) session id (for `--resume`) and transcript |
| `.symcc/agents/<id>.jsonl` | each agent's progress lines (kept like reports, trimmed by archive) |

Config:

- **Board settings** stay in `board.json` (the `settings` tool and the Settings tab), plus one new
  setting, the default `agent`.
- **Agent programs** (which `claude` and `codex` binaries, extra flags) are engine start options,
  like today's `--claude <bin>` and `--model` (`hosts/node/main.ts`). Later they could go in a
  per-user file (for example `~/.config/symcc/agents.json`). **(guess:** not needed while the owner
  is the only user.)
- **Roles and kinds** keep their files. `agent:` is added to the front matter.

## 10. What is lost compared with the Claude Code plugin, and how to get it back

| Lost in TUI + lead (a) | How to get it back |
|---|---|
| Claude Code's chat UI: tool-call views, diffs, images, `/resume`, its own slash commands and other plugins | Use lead (b) when you need them. The TUI shows tool calls only as short progress lines. |
| Plan mode (Shift+Tab) | none for lead (a) (`planMode:false`). **(guess:** `--permission-mode plan` for a planning-only lead chat could be a TUI key later.) |
| The `AskUserQuestion` pop-up | a TUI dialog for each open question, plus NEEDS YOU |
| "Watch worker" (a subagent view) | the worker log pane (`/agents/{id}/log`) |
| `ask_owner` and "wrap up" in the middle of a run | `--input-format stream-json` for Claude workers (5a), and a worker-scope MCP endpoint with `ask_owner` (build step L10) |
| The edit guard on Bash (the plugin's tool hook sees every Bash call) | `--permission-prompt-tool` with the path guard (5a), or the OS sandbox (T-365, "not now"). The merge-time check catches it in every case. |
| The VS Code board (VS Code is where users mostly work) | Run the TUI in VS Code's terminal, or keep the Claude Code plugin's VS Code board as the screen (b). Later, a web or MCP App board. |
| The lead's usage from Claude Code's session log | from the lead chat's `result` lines (section 6) |

Lead (b) loses nothing compared with today, except that workers are processes, not subagents.

## 11. Risks and decisions

**Risks**

- **Two drivers.** The engine and a Claude Code session could both believe they drive. Mitigation:
  `lead.json` plus `engine.json`, and the plugin never claims while an engine answers. A test runs
  both on one board (L9).
- **Fast-moving CLIs.** `claude -p` and `codex exec` change their flags and events. Mitigation: each
  runner reads only a few fields, and keeps a recorded sample in its tests (like
  `hosts/node/tests/fake-claude.sh`).
- **Terms.** The Agent SDK with a subscription is unclear, so use the real binaries. Gemini OAuth in
  outside tools is banned ([standalone-cli.md](standalone-cli.md)), so ACP Gemini would need an API
  key.
- **The lead chat's quality.** A `-p` lead behaves the same as the Claude Code chat **(guess;** same
  binary and model, but no checks done).
- **Bash writes outside the file list** stay possible for Claude and ACP workers until the merge check
  catches them (same as the Node host today).

**Decisions (the owner's answers, 2026-11-20)**

1. **Separate project: the engine and the TUI both move out later.** Not only the TUI. The shared
   code (`hooks/core`, `hooks/app`, `hooks/process`, and the view helpers) must become a package
   that this repo's plugins (Claude Code, OpenCode, Node) and the future standalone repo all use.
2. **Lead (a): Claude only first.** Codex app-server as a lead comes later.
3. **Lead (b): the plugin forwards its tools to the engine.** One place changes the board. (This
   needs the `fetch` check in section 14, but that is later work.)
4. **Engine start and building the app: not now.** The owner: "i dont want to start implementing
   this now, just building the design and infrastructure that would separate the client from the
   symcc engine". So the old question "does the TUI start the engine, or `symcc serve`?" waits. It is
   not decided and not needed for Phase 1.

## 12. Phase 1: separate the engine from its clients (partly done)

This is the only part planned for now. No new feature, no server. It only draws one clear line
between "the engine" and "the things that use it", and makes the code and tests keep to that line.
The goal is that, later, the engine can move to its own package or repo without a big rewrite.

### The boundary

| Side | What | Where |
|---|---|---|
| **Engine** (will become the shared package) | board logic, prompts, the entry functions, the Host interface, the process runner, and the host-free view helpers | `hooks/core/`, `hooks/app/`, `hooks/process/`, `hooks/host.ts`, `hooks/board.ts`, `hooks/name.ts`, `prompts/`, `kinds/`, `types/`, and (after S1) `hooks/view/` |
| **Client or host adapter** (stays a client) | the code that knows one program: its tools, screens, hooks and plugin files | `hooks/claude/`, `hooks/register.tsx`, `hooks/opencode/`, `opencode/`, `hosts/node/` |

Two files sit in the wrong place today: `hooks/opencode/board-view.ts` and the host-free part of
`hooks/opencode/view.ts`. They hold no OpenCode code (`board-view.ts` imports only `core/`, `app/state`
and `name`). S1 moves them to the engine side.

### The one entry point

Today a host reaches the engine through several paths (`hooks/app/symcc.ts` for the lifecycle and tool
calls, `hooks/board.ts` for the board functions, `hooks/process/agents.ts` for the runner, and, for
OpenCode, `hooks/opencode/board-view.ts` for the screen helpers). Phase 1 adds one file, `hooks/engine.ts`,
that only re-exports what hosts use. It has these groups:

- **Lifecycle and calls** from `hooks/app/symcc.ts`: `sessionStart`, `sessionEnd`, `sessionCleared`,
  `toolCall`, `toolCheck`, `runCommand`, `agentFinished`, `leadUpdate`, `leadGuideText`, `ownerTyped`,
  `COMMANDS`.
- **The contract** from `hooks/host.ts`: `Host`, `HostFeatures`, `HostWords`, `noUi`, `FileTouch`.
- **Lead tools** from `hooks/app/tools.ts`: `TOOLS`.
- **Runner** from `hooks/process/`: `processAgents`, `claudePermissions`, and the `ProcessSystem` type.
- **Screen helpers** from `hooks/view/`: `parseViewFile`, `bandDraw`, `panelLines`, `PANEL_TABS`,
  `actionCommand`, `answerOptions`, and the view-file writer.

The names above are the ones that exist today; S3 lists the exact set from the code. `package.json`
`exports` gets `"./engine"` (and `"./view"`) next to the OpenCode ones. A host or the future repo
writes `import { sessionStart } from 'symcc/engine'` and nothing deeper. (The exact package name is
not decided; the old note's working name is `symcc`.)

### The rule

**Engine code never imports a host.** Nothing in the engine side may import `hooks/claude/`,
`hooks/opencode/`, `hosts/node/`, `hooks/register.tsx`, `claude-code`, OpenCode, a Node built-in or
Bun. Clients import the engine, never the other way round.

This rule is already checked for `hooks/app/` and `hooks/core/` by `tests/host-free.sh` (run by
`scripts/typecheck.sh`). It does not yet cover `hooks/process/` or the view helpers. S2 adds them.
Comments that only name a host (for example `hooks/process/agents.ts:6`) are fine. Only imports count.

### How each host becomes a thin client

A thin client does three things only: build a `Host` (files, clock, commands, screens, agents), call the
entry point's functions, and draw. It holds no board logic.

- **Claude Code** (`hooks/claude/`, `hooks/register.tsx`): builds its `Host` in `hooks/claude/host.ts`
  and calls the entry from its hooks. S4 changes its imports to `hooks/engine.ts`.
- **OpenCode** (`hooks/opencode/`, `opencode/`): builds its `Host` in `hooks/opencode/host.ts`; its TUI
  draws with the view helpers. After S1 and S4 it imports them from the engine side only.
- **Node** (`hosts/node/`): builds its `Host` in `hosts/node/host.ts`, with `hosts/node/system.ts` for the
  process runner. S4 changes its imports the same way.

The same three hosts keep working, with no change in what the owner sees.

### Tasks (small, in order)

Each keeps the four standard commands green (`claude plugin test .`, `sh scripts/typecheck.sh`,
`sh scripts/test-opencode-host.sh`, `sh scripts/test-node-host.sh`). Status (owner, 2026-11-20): Phase 1
is narrowed to steps that change nothing for anyone.

- **Done now:** the S2 check, in a smaller form (T-634: `tests/host-free.sh` also covers `hooks/process/`,
  `board-view.ts` and `hooks/engine.ts`, with no file moved); S3 without the `package.json` `exports`
  (T-635: `hooks/engine.ts` as a list nothing imports yet; it may lag behind the hosts, and
  `tests/engine-names.mjs` only reports drift as a note); and S6 (T-638: [the engine and clients page](../architecture.md#engine-and-clients)).
- **Later, when the separate app is built:** S1 (the file move), S4 (pointing the hosts at the entry) and
  S5 (the host-side check).

| # | Title | Files | After | How tested |
|---|---|---|---|---|
| S1 | Move the view helpers out of `hooks/opencode/` (pure move, no behaviour change) | `hooks/opencode/board-view.ts` to `hooks/view/board-view.ts`; the host-free part of `hooks/opencode/view.ts` to `hooks/view/view-file.ts`; import lines in `hooks/opencode/*` and `tests/` | none | `sh scripts/test-opencode-host.sh` passes unchanged; the new check from S2 (or a small grep) fails if `hooks/view/` imports a host |
| S2 | Make the rule a test: extend `tests/host-free.sh` to `hooks/process/` and `hooks/view/` (imports only; the type check part loads no host types) | `tests/host-free.sh`, a case in `tests/typecheck-script.sh` if it needs one | S1 | `sh tests/host-free.sh` passes; a scratch copy with a planted `import '../claude/host'` in `hooks/view/` makes it fail |
| S3 | Add the one entry `hooks/engine.ts` (re-exports only) and the `package.json` `exports` for it | `hooks/engine.ts` (new), `package.json`, `tests/` (a test that the exports list exactly the names above) | S2 | `claude plugin test` file: every name is exported and is the same function as in its source file; `tests/host-free.sh` covers `hooks/engine.ts` |
| S4 | Point the three hosts at the entry: they import the engine only through `hooks/engine.ts` | `hooks/claude/*`, `hooks/register.tsx`, `hooks/opencode/*`, `opencode/*`, `hosts/node/*` (import lines only) | S3 | the four standard commands pass unchanged |
| S5 | Make the line a test for hosts too: a check that no file outside the host folders imports a host folder, and that hosts import the engine only through `hooks/engine.ts` | `tests/` (new shell check, run by `scripts/typecheck.sh`) | S4 | the check passes; a planted deep import in a scratch copy makes it fail |
| S6 | Write down the boundary for contributors: a short "engine and clients" page, with the rule and the export list | `docs/` (a new page), `CLAUDE.md` if the owner wants it | S5 | `sh tests/build-site.sh` |

Notes:

- S1 and S2 touch different files, but S2 needs S1's new folder, so they run in order.
- S4 touches many files but only their import lines. If a host needs a name the entry does not
  export, add it to the entry in that task (and its test), not a deep import.
- Moving the code into its own package or repo is **not** part of Phase 1. After S5, it is a copy plus
  a package name, because nothing in the engine side points at a host.

## 13. Build plan (later, not started)

**None of this is started, and none of it is planned for now.** The owner said not to start building
the app. The steps are labelled L1, L2 and so on, so they are not mixed up with Phase 1's S1 to S6.
Old L1 (the view move) is now Phase 1's S1. Old L2 is `symcc serve`, the first step of the later work.

The Host refactor steps (T-240..T-246, T-371..T-373) and the reuse proof (T-377, T-474) are done and
are the base. Each task below is one symcc task. "Tests" says how it is checked. All tasks in this
repo keep the four standard commands green (`claude plugin test .`, `sh scripts/typecheck.sh`,
`sh scripts/test-opencode-host.sh`, `sh scripts/test-node-host.sh`).

| # | Title | Files | After | How tested |
|---|---|---|---|---|
| L1 | Move the view helpers out of `hooks/opencode/` (pure move, no behaviour change) | `hooks/opencode/board-view.ts` → `hooks/view/board-view.ts`; host-free part of `hooks/opencode/view.ts` → `hooks/app/view-file.ts`; import lines in `hooks/opencode/*`, `tests/` | — | `sh scripts/test-opencode-host.sh` passes unchanged; `tests/host-free.sh` (or a new grep test) fails if `hooks/view/` imports OpenCode or Claude Code |
| L2 | `symcc serve`: a Node session that stays open (agents start any time, timers run, Ctrl+C stops all) | `hosts/node/serve.ts` (new), `hosts/node/session.ts`, `hosts/node/main.ts`, `hosts/node/tests/serve.spec.ts` | L1 | bun spec: serve on a scratch git repo with `fake-claude.sh`; add a task in-process; it reaches review with no `tick`; stop leaves no process (`processes.json` empty) |
| L3 | Engine API: `engine.json`, `GET /view`, `GET /events` (SSE from `onTaskEvent` + view + toast), `POST /tool`, `POST /command`, `POST /stop`, token check | `hosts/node/api.ts` (new), `serve.ts`, `hosts/node/tests/api.spec.ts` | L2 | bun spec with `fetch`: no token → 401; add via `/tool/add`; the SSE stream shows `created` then `stage` events; `/view` lists the task; `/command/symcc-approve` merges it |
| L4 | MCP endpoint `/mcp` (Streamable HTTP, hand-written JSON-RPC: `initialize`, `tools/list`, `tools/call`) | `hosts/node/mcp.ts` (new), `api.ts`, `hosts/node/tests/mcp.spec.ts` | L3 | spec: `tools/list` names equal `TOOLS()` names; `tools/call board` equals `/tool/board`; one optional manual check with a real `claude -p --mcp-config` |
| L5 | Runner progress and messages: `AgentRunner.progress`/`message`; `agent` SSE events; `/agents/{id}/log`; Claude runner reads stream-json lines | `hooks/process/agents.ts`, `hooks/process/claude-runner.ts`, `hosts/node/api.ts`, `hosts/node/tests/fake-claude.sh`, a spec | L3 | spec: the fake prints three lines slowly; progress events arrive before the end; the log endpoint returns them; existing node-host tests pass |
| L6 | Codex runner (`codex exec --json -C -s workspace-write`; read-only for scouts and checkers) | `hooks/process/codex-runner.ts` (new), `hosts/node/main.ts` (`--codex <bin>`), `hosts/node/tests/fake-codex.sh`, a spec | L5 | spec with a fake that prints recorded JSONL (`thread.started`, `item.completed`, `turn.completed` with usage): answer and tokens read; a killed run reads as aborted; one manual run with real Codex when the account has quota |
| L7 | Agent per role, kind and board default (`agent:` front matter, `HostAgentStart.agent`, runner registry) | `hooks/core/roles.ts`, `hooks/core/kinds.ts`, `hooks/host.ts`, `hooks/app/workers.ts`, `hooks/process/agents.ts`, `tests/` (roles), a node spec | L6 | `claude plugin test` file for parsing and writing `agent:`; node spec: a task with a codex role runs `fake-codex`, others `fake-claude`; an unknown agent is refused with its reason on the task |
| L8 | Lead (a): the lead chat (`claude -p` stream-json in and out, `--mcp-config` to `/mcp`, lead guide, resume, transcript, usage); `POST /lead/message`, `GET /lead/transcript`, `wakeLead:'now'` | `hosts/node/lead-chat.ts` (new), `hosts/node/host.ts`, `api.ts`, a spec + `fake-claude-lead.sh` | L4 | spec: a fake lead that reads stdin lines and echoes; a board update (task to review) reaches its stdin; its answer comes out as a `lead` SSE event; a restart passes `--resume <id>` |
| L9 | Claude Code plugin as a client of a running engine: no driving while `engine.json` answers; `POST /lead/attach` + `lead` events → `prompt.submit`; tools forwarded to `/tool` | `hooks/claude/*`, `hooks/app/lead.ts`, `hosts/node/api.ts`, `tests/` (a new engine-client test) | L8 | first a small probe that `fetch` works in the plugin runtime; then a `claude plugin test` file with a fake engine: the plugin does not claim `lead.json`; an engine update becomes one `prompt.submit`; the node spec runs the engine and a second "plugin" session on one board and checks one driver |
| L10 | Worker-scope tools for process workers (`ask_owner` over MCP, with the worker's token) and "wrap up" via stdin | `hosts/node/mcp.ts`, `hooks/process/claude-runner.ts`, `hooks/core/prompts.ts` (base prompt words), spec | L5, L4 | spec: a fake worker calls `ask_owner`; the task shows the question; the answer reaches the worker; prompts test (`tests/prompts.test.tsx`) for the new words |
| T1 | New repo `symcc-tui`: skeleton that finds `engine.json` (or starts `symcc serve`), draws band and board from `/view` + SSE with the shared view helpers, board keys, actions via `/command` | new repo; in this repo only `package.json` `exports` for `hooks/view/` | L3 | in the new repo: `bun test` screen snapshots from recorded views (as `hooks/opencode/tests/opencode-tui.spec.ts` does); a test against a fake engine (a tiny HTTP server) that a key sends the right command |
| T2 | TUI task page, NEEDS YOU dialog, Scouts and Settings tabs, worker log | `symcc-tui` | T1, L5 | snapshot tests per page; fake-engine test that an answer posts the right `/command` |
| T3 | TUI chat pane for lead (a) | `symcc-tui` | T1, L8 | fake-engine test: typed text is posted to `/lead/message`; `lead` events show in order; transcript loads on open |
| L11 | ACP runner (`acpAgents`: initialize, session/new, prompt, cancel; `fs/write_text_file` and `session/request_permission` through the path guard) | `hooks/process/acp.ts` (new), a fake ACP agent script, a spec | L7 | spec with a fake ACP agent that asks to write one file inside and one outside the list: inside written, outside refused; cancel stops it |
| L12 | (option) Codex chat as lead (b): MCP tools from `/mcp`, updates via `codex queue` | `hosts/node/codex-lead.ts` | L4, L9 | spec with a fake `codex` that records its `queue` calls; manual check with real Codex |
| L13 | (option, owner said "not yet") MCP App board inside T3 Code, Claude or Codex | `hosts/node/mcp.ts` (an MCP App resource drawing `/view`) | L4 | manual spike in T3 Code, as in T-337's step (a). The other T-337 spike (a small OpenCode plugin) was done as T-370 and led to the OpenCode adapter. |
| L14 | (later) a web board as one more client of the same API | new | L3 | browser-free test of its view code; manual check |

Order notes: L1..L4 are the base. L5..L7 (runners) and L8 (lead a) can go in parallel after them.
T1 needs only L3, so the TUI can start early, against a running `symcc serve` with lead (b).

## 14. What I couldn't check

- I ran no `symcc serve`, MCP server, lead chat, Codex worker or ACP agent. Everything new above is
  a design.
- Whether `claude -p --input-format stream-json` takes a message or an interrupt in the middle of a
  turn, and whether it compacts long chats by itself.
- Whether `--permission-prompt-tool` works together with `--permission-mode dontAsk`.
- Whether the Claude Code plugin runtime has `fetch` (needed for L9's forwarding).
- Whether the Codex `workspace-write` sandbox blocks writes to the main repo's `.git/worktrees/`.
- Token reports from ACP agents.

## Recommended next step

Phase 1 (section 12): create S1 (move the view helpers to `hooks/view/`, a pure move) and then S2 to S6
in order. They change nothing the owner sees. Do not start L2 (`symcc serve`) or anything after it
until the owner says so.

## Sources

- This worktree: `hooks/host.ts`, `hooks/app/symcc.ts`, `hooks/app/tools.ts:349`, `hooks/app/lead.ts:13-15`,
  `hooks/app/events.ts`, `hooks/app/merge-line.ts`, `hooks/app/state.ts:171`, `hooks/core/phase.ts`,
  `hooks/core/events.ts`, `hooks/core/panel.ts:561`, `hooks/core/roles.ts:20`, `hooks/process/agents.ts`,
  `hooks/process/claude-runner.ts`, `hosts/node/{main,session,host}.ts`, `hooks/opencode/{host,lead,view,board-view,tui}.ts`,
  `hooks/claude/ui/`, `scripts/test-node-host.sh`.
- Local `claude --help` (2.1.319) and `codex exec --help` (0.169.0).
- [ACP protocol overview](https://agentclientprotocol.com/protocol/v1/overview) (client methods
  `fs/read_text_file`, `fs/write_text_file`, `session/request_permission`, `terminal/*`; agent methods
  `initialize`, `session/new`, `session/prompt`, `session/cancel`).
- [OpenTUI on GitHub](https://github.com/anomalyco/opentui), [`@opentui/core` on npm](https://npmjs.com/package/@opentui/core).
- The earlier notes listed at the top.
