# Research: a refactor plan to make symcc depend on its host as little as possible

Task T-234. Follows T-233 ([codex-host.md](codex-host.md)). Checked on 2026-11-16 against this
worktree (branch `symcc/T-234`, base commit `290771e`), Claude Code 2.1.319, and the generated
plugin types in `.claude-plugin/types/claude-code/index.d.ts` of the main project folder. All
counts come from `grep` over `hooks/` and `tests/`. Baseline: `claude plugin test .` passes, 655
tests in 26 files.

## Short answer

Yes, this can be done in small steps that change no behaviour. `hooks/core/` already has no `$`
calls and no `claude-code` imports. But about ten spots in it still carry Claude Code knowledge,
such as tool names, event field names, the session-log format and error texts. All the `$` calls
(about 240) live in 24 files under `hooks/plugin/` and `hooks/register.tsx`, and most of them are
plain file, process and clock work. So the plan is:

1. Add a small `Host` interface.
2. Make the existing logic depend on `Host` instead of `$`.
3. Keep one Claude Code adapter that builds a `Host` from `$` and wires the hooks.

The board panel, the band above the prompt and Claude Code's plan mode can't be made host-free.
They become optional host features, and symcc falls back to text when a host doesn't have them.

## 1. The map: where symcc touches its host today

### 1a. Files that use `$` (the Claude Code plugin API)

`$` is typed as `EngineInterface` from `claude-code` (`hooks/plugin/state.ts:4,10`). It is passed
into every function as the first argument. `$` uses per file, counted as `$.<noun>.<verb>`:

| File | `$` uses | What for |
|---|---|---|
| `hooks/plugin/scouts.ts` | 39 | `agent.spawn` (:87), `clock.after/every` (:97, :255, :260, :306), fs, `process.run` (5), `ui.invalidate` (10), toasts, `plugin.root` (:33) |
| `hooks/plugin/workers.ts` | 24 | `agent.spawn` (:88), `agent.list` (:164, :968, :1053), `session.send` to stop a worker (:860), `clock.*` (:183, :255, :331, :1002), fs, process, toasts |
| `hooks/plugin/ui/settings.tsx` | 24 | panel only: `ui.invalidate` (19), toasts |
| `hooks/plugin/ui/task-page.tsx` | 22 | panel only: `ui.invalidate` (10), `ui.copy` (:214), `ui.view` "Watch worker" (:231), toasts, fs |
| `hooks/plugin/store.ts` | 22 | board.json and lock: fs (11), `process.run` (7), `clock.sleep` (:149), `session.id` (:132) |
| `hooks/plugin/roles.ts` | 19 | role files: fs, `process.run`, `plugin.root` (:43, :66), `ui.invalidate` (7), `ui.log` (:34) |
| `hooks/register.tsx` | 13 | `agent.register` (:45, :53), `tool.register` (:60), `command.register` (:77), `session.repo/root/id` (:118-120), `env.get` (:119), `clock.every` (:142, :145), `ui.log` (:394) |
| `hooks/plugin/lead.ts` | 12 | lead claim: fs, process, `session.id` (:79), `ui.status` (:113, :117), toasts |
| `hooks/plugin/tools.ts` | 10 | `session.usage` (:341), `env.get` incl. `CLAUDE_CONFIG_DIR` (:353-354), fs |
| `hooks/plugin/git.ts` | 7 | fs, `process.run` (git) |
| `hooks/plugin/ui/list.tsx` | 6 | panel only: `ui.invalidate` |
| `hooks/plugin/archive.ts` | 5 | fs, toasts |
| `hooks/plugin/voice.ts` | 4 | `process.run` (afplay/say), `clock.after` (:138), toast |
| `hooks/plugin/ui/open.ts` | 4 | `ui.open` (:28, :45), `clock.after` (:47) |
| `hooks/plugin/ui/parts.tsx` | 4 | `ui.resolve` (:16), toasts |
| `hooks/plugin/state.ts` | 3 | `plugin.name` (:138); panel atoms `atom/read/update` from `claude-code` (:4, :20-26) |
| `hooks/plugin/ui/scouts-page.tsx` | 3 | panel only |
| `hooks/plugin/tell.ts` | 2 | `clock.after` (:25), `prompt.submit` to wake the lead (:30) |
| `hooks/plugin/review.ts` | 2 | fs, `process.run` (git diff) |
| `hooks/plugin/ui/esc.ts`, `ui/above-prompt.tsx` | 1 each | `ui.invalidate`, `ui.resolve` (:15) |
| `hooks/plugin/plan.ts`, `health.ts`, `ui/pane.tsx` | 0 | (they use `$` only by passing it on) |

The same uses counted by API, across `register.tsx`, `plugin/` and `plugin/ui/`:

| API | Uses | Kind |
|---|---|---|
| `ui.invalidate` | 54 | panel redraw (35 in `ui/`, 17 in `roles.ts`/`scouts.ts`, 2 elsewhere) |
| `ui.toast` | 33 | notice to the owner |
| `fs.read` / `exists` / `write` / `list` / `stat` | 26 / 17 / 10 / 5 / 2 | plain files |
| `process.run` | 21 | git, test commands, sound |
| `clock.after` / `every` / `sleep` | 8 / 5 / 3 | timers |
| `agent.list` / `spawn` / `register` | 5 / 2 / 2 | agents |
| `env.get` | 4 | HOME, CLAUDE_CONFIG_DIR |
| `ui.open` / `status` / `resolve` / `log` / `copy` / `view` | 3 / 2 / 2 / 2 / 2 / 1 | panel, status line, debug log |
| `session.id` / `root` / `repo` / `usage` / `send` | 3 / 1 / 1 / 1 / 1 | session facts, stop a worker |
| `plugin.name` / `plugin.root` | 3 / 3 | plugin name, where `roles/` and `examples/` ship |
| `tool.register`, `command.register`, `prompt.submit` | 1 each | lead tools, slash commands, wake the lead |

Hook events wired in `hooks/register.tsx`: `session.start` (:99), `session.end` (:175),
`prompt.compose` (:194), `prompt.submit` (:205), `agent.offer` (:215), `tool.call` (:225),
`turn.complete` (:243), `command.run` (:255), `classic.UserPromptSubmit/Stop/SessionStart`
(:351-365), `agent.spawn` (:367), `prompt.attachment` (:373), `ui.render` AbovePrompt (:380) and
Pane (:420), and `ui.close` (:390). `hooks/hooks.json` loads only `./register.tsx`.

Size of the split today. `hooks/core/` + `hooks/board.ts` + `hooks/name.ts` are 5,007 lines.
`hooks/plugin/` (not ui) is 3,947 lines. `hooks/plugin/ui/` is 1,430 lines. `register.tsx` is 424 lines.

No file imports Node built-ins (`node:*`), and none uses `require`. All file, process and clock
work goes through `$`. The engine's suggested tsconfig gives `"types": []` and `lib: es2023`
with no DOM (`.claude-plugin/types/claude-code/index.d.ts:66-71`). Guess: the Claude Code plugin
runtime offers no Node APIs, so the shared logic can't call Node directly and must go through
`Host`. I did not test a `node:` import.

### 1b. How host-free `hooks/core/` really is

- **Imports:** clean. Core files import only `../../types` (symcc's own types) and `../name`.
  None imports `claude-code` or anything in `plugin/`.
- **`$` calls:** none. The only `$` text is in two comments (`core/agents.ts:47`, `:97`).
- **`types/index.d.ts`** is shared and mostly host-free. Its last block (`:154-159`) adds
  symcc's panel state to `claude-code`'s `PluginState`. That block is host-bound.

But some Claude Code *knowledge* sits in core and in `name.ts`:

| Where | What is Claude-specific |
|---|---|
| `hooks/name.ts:57-58` | agent type names `<name>:worker`, `<name>:scout` (Claude's `plugin:type` form) |
| `hooks/name.ts:60-61` | `tool: mcp__<name>__<t>`. T-233 found that Codex uses the same form, so this one happens to carry over. |
| `hooks/name.ts:62-63` | `pane: <name>-board` (the panel id) |
| `hooks/core/roles.ts:23,26` | `BASE_WORKER_TOOLS = Read, Edit, Write, Glob, Grep, Bash` and `EXTRA_TOOLS = WebSearch, WebFetch`: Claude Code tool names |
| `hooks/core/roles.ts:35-38` (`workerAgentTypes`), `:186` | one agent type per tool set, which is how Claude Code agent types work |
| `roles/researcher.md:3` (and any role's `tools:` line) | role files name Claude tools (`tools: WebSearch, WebFetch`) |
| `hooks/core/agents.ts:47-51` | `AgentInfo` and `ENDED_STATUSES = completed, failed, killed`: the shape of `$.agent.list()` |
| `hooks/core/agents.ts:104-118` | `isNotReady` matches Claude Code's error text "Agent type '...' not found" |
| `hooks/core/plan.ts:1-7, 21-31` | plan mode from `permission_mode` / `permissionMode` and the `plan_mode*` attachment types |
| `hooks/core/runs.ts:124-127` | `usageTokens` reads Anthropic usage fields (`cache_creation_input_tokens`, ...) |
| `hooks/core/stats.ts:479-507` | `leadCalls` parses Claude Code's `<session>.jsonl`, and `projectFolderName` builds the `~/.claude/projects` folder name |
| `hooks/core/banner.ts:34-52`, `core/panel.ts:67` | widths that leave room for what Claude Code puts in front of the status text |
| `hooks/core/lead.ts:149` | `/clear` handover (the session id changes while the process keeps going) |
| text only: `core/board-file.ts:26`, `core/settings.ts:143`, `core/details.ts` color name `'claude'` (:33, :35, :69) | words like "Claude works as normal", and a theme color name |

Prompts outside core that name Claude Code features:

- The worker prompt, `WORKER_PROMPT` in `hooks/plugin/workers.ts:19-34`, says "every Read, Edit and
  Write" (:22).
- The worker and scout agent-type prompts in `register.tsx:45-58` set `permissionMode:
  'acceptEdits'` and `background: true`.
- The lead guide in `plugin/tools.ts:248-277` names "Plan mode (Claude Code's own planning mode,
  Shift+Tab)" (:273).
- The manual (`plugin/tools.ts:80-83`) describes the panel and slash commands.

**Verdict.** In code, `hooks/core/` is host-free. In meaning, about 10 spots are tied to Claude
Code. They are small and easy to move. `hooks/plugin/` is host-bound everywhere, but mostly
through file, process and clock calls that any host can supply. Only `ui/`, the agent calls, the
lead wake-up and `register.tsx` are deeply tied to Claude Code.

### 1c. Tests today

Every test file imports `test` / `expect` from `claude-code/testing`. They fall into three kinds:

| Kind | Files | Tests (by `test(` count) |
|---|---|---|
| Pure logic, no `$` | `health`, `plan`, `stats`, most of `board` (`board.test.ts:2501-2502` imports `plugin/scouts` and `plugin/state` for one part) | about 230 |
| A hand-made fake `$` object passed to plugin functions | `merge` (145; `world()` at `merge.test.ts:77`), `setup-git` (30), `scout-report` (18), `lead-roles` (10), `safe-write`, `voice`, `esc`, `board-opened`, `help-lead` | about 210 |
| The whole plugin loaded by the test kit (`On` from `claude-code`, plus `mock`, `mock.clock`) | `example-scouts`, `hook-gaps`, `lead-scouts`, `lead-settings`, `pane`, `roles-settings`, `scout-files`, `scout-timers`, `search`, `session-end`, `session-start-wait`, `turn-complete`, `way-out` | about 177 |

The middle kind matters most for the refactor. These tests fake `$` by its exact shape (for
example `merge.test.ts:160-195` in `world()`: `process`, `fs`, `session`, `agent.list`, `ui.toast/status`,
`clock`). Any rename of a `$` method used by `plugin/` breaks them, so they turn into "fake `Host`"
tests.

## 2. The proposed host layer

### 2a. The interface (sketch)

It is written in symcc's own words, not Claude Code's. Optional members are features a host may
not have.

```ts
// hooks/host.ts: everything symcc's logic needs from wherever it runs. No imports from 'claude-code'.
export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type Timer = { cancel(): void }
export type AgentKind = 'worker' | 'scout'
/** symcc's own tool words; each adapter maps them (Claude: Read/Edit/...; Codex: sandbox and features). */
export type Ability = 'read' | 'edit' | 'shell' | 'websearch' | 'webfetch'
export type AgentSpec = {
  kind: AgentKind; name: string; description: string; prompt: string
  cwd: string; abilities: Ability[]; model?: string; mayWrite: boolean
}
export type AgentState = { id: string; kind?: AgentKind; name?: string; description?: string; alive: boolean }
export type AgentEnd = { id: string; answer: string; aborted: boolean; tokens?: SymccTokens }

export type HostFeatures = {
  panel: boolean            // a board panel symcc draws (Claude: yes; Codex CLI: no)
  band: boolean             // the line above the prompt
  commands: boolean         // its own slash commands that answer at once
  wakeLead: 'now' | 'queued' | 'next-turn'  // how a board update reaches an idle lead
  planMode: boolean         // the host tells symcc when it is in a read-only plan mode
  watchAgent: boolean       // "Watch worker"
}

export interface Host {
  readonly id: 'claude-code' | 'codex'
  readonly features: HostFeatures
  plugin: { name: string; root: string }            // $.plugin.name / root
  session: { id(): Promise<string>; projectRoot(): Promise<string>; costUsd?(): Promise<number | undefined> }
  env(name: string): Promise<string | undefined>
  fs: {
    read(p: string): Promise<string>; write(p: string, text: string): Promise<void>
    exists(p: string): Promise<boolean>; list(p: string): Promise<string[]>; stat(p: string): Promise<{ mtimeMs: number }>
  }
  run(cmd: string, args: string[], o?: { cwd?: string; timeoutMs?: number }): Promise<RunResult>
  clock: { now(): number; after(ms: number, f: () => void): Timer | null; every(ms: number, f: () => void): Timer | null; sleep(ms: number): Promise<void> }
  agents: {
    start(spec: AgentSpec): Promise<{ id: string }>    // Claude: $.agent.spawn; Codex: `codex exec -C <cwd>`
    list(): Promise<AgentState[] | null>               // null = can't tell (today's agentsNow)
    stop(id: string, why: string): Promise<void>       // Claude: session.send + refuse its tools; Codex: kill
  }
  lead: { tell(text: string): Promise<void> }          // Claude: $.prompt.submit; Codex: `codex queue` (unconfirmed, T-233)
  ui: {
    toast(text: string, level?: 'info' | 'warn' | 'error'): void
    status(text: string): void                         // status line; a no-op where there is none
    log(text: string): void                            // debug log
    refresh(): void                                    // was $.ui.invalidate; a no-op with no panel
    openBoard?(o: { tab?: string; task?: string; focus?: boolean }): Promise<{ placed: boolean }>
    copy?(text: string): Promise<boolean>
    watch?(agentId: string): Promise<void>
  }
  /** the lead's own past calls, for /symcc-stats "whole team"; absent if the host keeps no readable log */
  leadUsage?(root: string): Promise<{ calls: LeadCall[] } | { why: string }>
}

/** What the host calls into: symcc's entry points, written once, used by every adapter. */
export interface Symcc {
  start(host: Host): Promise<void>
  end(host: Host, how: 'exit' | 'clear'): Promise<void>
  guide(host: Host): Promise<string | null>            // the lead guide, or null when symcc is off
  ownerSaid(text: string): void                        // prompt.submit from the owner
  tools(): ToolSpec[];      tool(host: Host, name: string, input: unknown): Promise<string>
  commands(): CommandSpec[]; command(host: Host, name: string, args: string): Promise<string>
  agentEnded(host: Host, e: AgentEnd): void
  agentTool(host: Host, agentId: string | undefined, call: unknown): { deny?: string } | undefined  // stopped agents, scout/role file edits
  planMode(host: Host, on: boolean | null): void
}
```

Notes on the sketch:

- **Pass a `Host` per call, the same as `$` today.** Each hook gets its own `$`, and
  `register.tsx:107-112` notes that `$.clock` waits count against the hook's 10 s budget. The
  Claude adapter should build a `Host` around the `$` it was given (cheap, no state). It should
  not store one `Host` for the whole session. Timers started in `session.start` already capture
  that hook's `$` (`register.tsx:142-147`), and that stays as it is. Guess: holding one `$` for
  longer than that would change how the budget is counted. I did not check this.
- **Agent types stay inside the Claude adapter.** `$.agent.register`, `agent.offer` (hiding
  worker types) and the "one type per tool set" rule (`core/roles.ts:35`) exist only because
  Claude Code agent types are fixed ahead of time. The app only says "start a worker with
  abilities X".
- **Panel state atoms stay in the adapter.** `state.ts:16-19` says Claude Code reads the atoms
  from the source text before the code runs, and that `read` / `update` accept only an atom
  written in the same file. So the atoms, and `types/index.d.ts:154-159`, belong in the Claude
  adapter.

### 2b. Where today's modules move

| Today | Goes to | Notes |
|---|---|---|
| `hooks/core/*`, `hooks/board.ts`, `hooks/name.ts` | stay (host-free) | minus the Claude spots in 1b |
| `core/roles.ts:23-38` tool lists, `workerAgentTypes` | `hooks/claude/agent-types.ts` | core keeps `Ability` words; role files say `tools: web` (migrated once, per the no-backward-compatibility rule) |
| `core/agents.ts:47-51` statuses, `:104-118` `isNotReady` | `hooks/claude/agents.ts` | core gets `AgentState.alive` |
| `core/plan.ts:21-31` (`planFromMode`, `planFromAttachment`) | `hooks/claude/plan.ts` | the rest of plan.ts stays |
| `core/runs.ts:124` `usageTokens` | `hooks/claude/usage.ts` | |
| `core/stats.ts:479-507` session-log reader, `plugin/tools.ts:346-360` (`leadUsage`) | `hooks/claude/lead-usage.ts` → `host.leadUsage` | |
| `hooks/name.ts:57-63` `worker`, `scout`, `tool`, `pane` | `hooks/claude/names.ts` | branch, data folder and author stay |
| `plugin/store, git, review, archive, lead, workers, scouts, roles, voice, tell, tools, health, plan` | `hooks/app/` (uses `Host`, never `$`) | the bulk, about 3,900 lines, mostly unchanged |
| `plugin/state.ts` | split: `S` and maps → `hooks/app/state.ts`; atoms and `useName($)` → `hooks/claude/panel-state.ts` | |
| `plugin/ui/*` | `hooks/claude/ui/*` | host-bound by nature |
| `register.tsx` | `hooks/app/symcc.ts` (the `Symcc` handlers: the logic now inside each `on(...)`) + a thin `hooks/register.tsx` (Claude events → `Symcc`) | `hooks.json` keeps pointing at `./register.tsx` |
| new | `hooks/host.ts` (interface), `hooks/claude/host.ts` (`hostFrom($)`) | |

Guess: everything has to stay under `hooks/` so the Claude Code loader can find it. I didn't
check whether it would follow imports outside `hooks/`.

### 2c. What can't be host-free, and how to degrade

| Feature | Why host-bound | When the host lacks it |
|---|---|---|
| Board panel (`plugin/ui/*`, 1,430 lines, 54 `ui.invalidate`) | It is built with Claude Code's render elements (`$.ui.resolve`) | `features.panel = false`: `/symcc` and the board tool answer with `boardText`, as the commands already do when the panel isn't placed (`register.tsx:283-290`, `:296-298`). Codex options from T-233: a text board, a separate `symcc board` terminal app, or a local web page. |
| Band above the prompt | `ui.render` AbovePrompt | No band. The status text (`core/banner.ts`) goes to `ui.status`, or nowhere. |
| Slash commands that answer at once (`isTextDisplayOnly`) | `$.command.register` / `command.run` | The same `Symcc.command` behind a skill or a `!symcc ...` shell command (T-233: costs a model turn). |
| Background agents with a `cwd` | `$.agent.spawn` | The adapter starts external `codex exec -C <worktree>` processes. The app doesn't see the difference. |
| Waking an idle lead | `$.prompt.submit` | `wakeLead: 'next-turn'`: updates queue up (`noteForLead` already queues them) and go out on the next hook that can carry text (Codex `Stop` / `UserPromptSubmit`). |
| Plan mode | Claude events and attachments | `planMode = false`: never "in plan". The lead guide leaves out the plan-mode paragraph. |
| Toast | `$.ui.toast` | A desktop notice, or a hook `systemMessage` (T-233 row 16). |
| Lead token stats | Claude Code's session log | `leadUsage` absent: the stats say the lead's calls "can't be read here" (`teamLines` already has a reason path, `core/stats.ts:542-559`). |
| Words in prompts (`Read, Edit and Write`, `Shift+Tab`) | they name host tools | Each host supplies a few phrases (for example `host.words.edit`). Or reword the prompts so they name no tools. |

## 3. Step list (each step is one symcc task, no behaviour change, all tests pass)

Order matters. Keep `$` method names for now, so the ~210 fake-`$` tests keep working until
step 7.

1. **Host type, first version: a mirror of the `$` parts symcc uses.**
   - Files: new `hooks/host.ts`; `hooks/plugin/{archive,git,lead,review,roles,scouts,store,tell,tools,voice,workers,health,plan}.ts`
     (change `type $` to `Host` in their imports).
   - What changes: `Host` is written by hand with the same member names and shapes as `$`, so the
     real `$` fits it with no wrapper.
   - Proof: tests pass unchanged, and `grep EngineInterface hooks/plugin/*.ts` finds only `state.ts`.
2. **Move Claude knowledge out of core (part 1: agents and tools).**
   - Files: `hooks/core/roles.ts`, `hooks/core/agents.ts`, `hooks/name.ts`, new `hooks/claude/agent-types.ts`
     and `hooks/claude/agents.ts`, `hooks/register.tsx`, plus test import lines.
   - Proof: no `'Read'`, `'WebSearch'`, `not found` or `:worker` strings in `hooks/core/`, and tests pass.
3. **Move Claude knowledge out of core (part 2: plan, usage, session log).**
   - Files: `hooks/core/plan.ts`, `hooks/core/runs.ts`, `hooks/core/stats.ts`, `hooks/plugin/tools.ts`,
     `hooks/plugin/plan.ts`, new `hooks/claude/{plan,usage,lead-usage}.ts`, `tests/{plan,stats,hook-gaps}.test.*` imports.
   - Proof: `grep -i claude hooks/core` finds comments only, and tests pass.
4. **Agents behind `host.agents`.**
   - Files: `hooks/plugin/workers.ts` (:88, :164, :860, :968, :1053), `hooks/plugin/scouts.ts` (:87),
     `hooks/host.ts`, `hooks/claude/host.ts`.
   - What changes: the adapter does `spawn` + `subagentType`, `list`, and `send` + `stopped`.
   - Proof: `merge`, `turn-complete`, `scout-*` and `session-start-wait` tests pass with their fakes
     changed only in where `agent.*` sits.
5. **Lead and UI calls behind `host.lead` / `host.ui`.**
   - Files: `hooks/plugin/tell.ts:30`, `lead.ts:113-117`, `roles.ts`, `scouts.ts` (`ui.invalidate` → `ui.refresh`),
     `voice.ts`, `archive.ts`, `store.ts`, `hooks/claude/host.ts`.
   - Proof: tests pass, and `$.ui.` shows up only in `plugin/ui/` and `claude/`.
6. **Split `register.tsx` into `hooks/app/symcc.ts` (the handlers) and a thin `register.tsx`.**
   - Files: `hooks/register.tsx`, new `hooks/app/symcc.ts`.
   - Proof: all 13 loaded-plugin test files pass unchanged, and `register.tsx` is under ~150 lines
     of event-to-`Symcc` wiring.
7. **Rename `Host` members to symcc's own words, and share one fake `Host` for tests.**
   - Files: `hooks/host.ts`, `hooks/claude/host.ts`, `hooks/plugin/*`, new `tests/fake-host.ts`,
     the ~9 fake-`$` test files.
   - What changes: for example `process.run` → `run`, `ui.invalidate` → `ui.refresh`, `env.get` →
     `env`. The tests' `world()` builds a fake `Host` instead of a fake `$`.
   - Proof: the same test count (655) passes.
8. **Features and fallbacks.**
   - Files: `hooks/host.ts` (`features`), `hooks/app/symcc.ts`, `hooks/plugin/tools.ts` (lead guide and
     manual text from `features`), `hooks/plugin/workers.ts:22` (prompt words), new `tests/no-panel.test.ts`.
   - Proof: with Claude features nothing changes (existing tests). A fake host with `panel:false,
     wakeLead:'next-turn', planMode:false` gets text answers and a queued lead note (new tests).
9. **Move the folders.**
   - What changes: `hooks/plugin/` (not ui) → `hooks/app/`; `hooks/plugin/ui/` → `hooks/claude/ui/`;
     `state.ts` split as in 2b. Only moves and import paths.
   - Proof: tests pass, `hooks/app/` has no `from 'claude-code'`, and a check test fails if one
     appears (for example, a test that reads the files and greps them).
10. **Role files in symcc's words.**
    - Files: `roles/*.md` (`tools: web`), `hooks/core/roles.ts` (parse), a one-time migration of
      `.symcc/roles/*.md`, per the no-backward-compatibility rule.
    - This one changes a file format, so it is a real (small) change, not a pure refactor. It can
      wait until a second host exists.

Not on this list: a Codex adapter. T-233 recommends a spike first (does `codex queue` reach an
open TUI). A Codex adapter would be a separate program (an MCP server and hook scripts) that
builds a `Host` from Node APIs and calls the same `Symcc`.

**Test split after the steps:**

| Group | Where | Runs on | Imports |
|---|---|---|---|
| core (pure) | `tests/core/` | any host | `test` / `expect` only |
| app (logic with a fake `Host`) | `tests/app/` | any host | `test` / `expect` + `tests/fake-host.ts` |
| Claude adapter (whole plugin loaded, `On`, `mock`, panel) | `tests/claude/` | Claude Code only | `claude-code`, `claude-code/testing` |

The first two groups would still use `claude-code/testing` as their runner here, because that is
what `claude plugin test .` runs. Guess: its `test` / `expect` are close to Bun's and Jest's, so a
Codex build could run the same files with another runner and a small import shim. I did not check
this. Guess: `claude plugin test .` finds tests in sub-folders of `tests/`. I did not try it, so
step 9 should confirm the 655 count.

## 4. Risks and open questions

**Risks**

- **The per-hook `$` and its time budget.** See 2a. If an adapter keeps one long-lived `Host`
  around a single `$`, timers or waits might count against the wrong hook. Mitigation: build the
  `Host` per call (step 1 does this for free, because `$` *is* the `Host`).
- **The middle test kind is tied to `$`'s shape.** `merge.test.ts` has 145 tests. Renaming
  members before step 7 breaks a lot at once. Keep names until step 7 and do that step in one go.
- **Static panel atoms.** The rule at `state.ts:16-26` means the atoms can't move behind an
  interface. They stay in the Claude adapter.
- **No Node in the plugin runtime (guess, see 1a).** Shared code must never import `node:*`.
  Step 9's check test guards this.
- **The Codex shape is different.** In Codex, symcc would be a long-running MCP server poked by
  hook scripts, not hooks running inside the host (T-233). `Symcc` as a set of entry points fits
  both shapes, but the lead claim and heartbeat (`plugin/lead.ts`) assume one process per session.
  Unknown for Codex (T-233 "what I couldn't check").
- **Doing too much before the spike.** If the T-233 `codex queue` spike fails, a Codex host may not
  be worth building. Steps 1-7 still make the code cleaner and the tests clearer, but steps 8-10
  are only worth it if a second host is coming.

**Open questions for the owner**

1. Do steps 1-7 now, or wait for the `codex queue` spike from T-233?
2. Are the folder names `hooks/app/` and `hooks/claude/` OK? (Later `codex/` would be its own
   package outside `hooks/`.)
3. Role files: switch `tools: WebSearch, WebFetch` to symcc words (`tools: web`) with a one-time
   migration (step 10), or keep Claude names and map them in the Codex adapter?
4. Without a panel, which board is wanted for Codex: text only, a separate terminal app, or a web
   page?
5. Should the lead guide and worker prompt name no tools at all (simplest, the same text on every
   host), or get host-specific words?

## What I couldn't check

- Whether the Claude Code loader allows `node:` imports or imports from outside `hooks/` (I read
  the type file's tsconfig only).
- Whether `claude plugin test .` picks up tests in sub-folders of `tests/`.
- How `$` and the hook budget behave when a `$` outlives its hook. The only evidence is the
  comment at `register.tsx:107-112`.
- Test counts by `test(` are rough (some tests are made in loops). The runner's real total is 655.

## Recommended next step

Make step 1 (the `Host` type that mirrors `$`) a symcc task now. It is type-only, cheap and safe,
and it makes every later step clearer. Run the T-233 `codex queue` spike in parallel. Decide on
steps 8-10 after the spike.
