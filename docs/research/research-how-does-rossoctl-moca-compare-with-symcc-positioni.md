# Research: how does rossoctl/moca compare with symcc (positioning, goals, design)?

Kept from task T-420 (answer written 2026-11-18) so later tasks can read it.

## Question

How does rossoctl/moca compare with symcc in positioning, goals and design?

## Answer

moca is a server for running many AI coding-agent sessions for many users. It keeps each session's state in Redis and runs every command the agent makes in a remote container or a small virtual machine (microVM). Other programs send it work over HTTP. It has no lead, no board and no planning.

It is a **neighbour, not a competitor**. moca is the layer below: "where and how safely does an agent's work run". symcc is the layer above: "what work to do, in what order, checked and merged". symcc can learn from moca, and one part of moca (its sandbox service, `mocactl sbx`) could later be one place where symcc workers run. Nothing in it can be copied in as it is today.

### Facts about moca
- **What it says it is** (repo description and README top): "Run stateful AI coding agents on a dense, warm process-manager runtime — sessions resume exactly where they left off." The README calls it a "leaf-session backend": "an external orchestrator dispatches isolated units of agent work ('leaves') over a simple HTTP + shared-volume contract."
- **Owner and team:** the GitHub organisation "Rossoctl", whose profile says "Agentic Platform". About 15 people have commits. The top two are Paolo Dettori (2,523 commits) and Rong Chang (622).
  - Guess: it is an IBM Research project. It supports IBM Bob, has a w3id login guide (`docs/guides/oidc-login-w3id.md`), and builds on a fork of the Pi coding agent from the `kagenti` organisation.
- **Activity:** 3,617 commits between 2026-06-10 and 2026-11-17, 53 issues, 7 pull requests, 12 stars, 12 forks. Latest release v0.10.0 on 2026-11-05 (v0.7.0 on 2026-10-21 added the sandbox service). Very active, but almost no outside users yet.
- **License:** Apache-2.0.
- **Maturity:** README says "explorative work and every deployment path is Preview. Interfaces may change."
- **Code:** a TypeScript pnpm monorepo plus Go sandbox workers. Main parts:
  - `packages/supervisor`: a warm pool of worker processes.
  - `packages/server`: the HTTP API.
  - `packages/session-backend`: session state in Redis.
  - `packages/sandbox-relay`: gRPC link to the sandboxes.
  - `packages/control-plane`: multi-user logins and credentials.
  - `packages/mocactl`: a terminal client built with Ink and React, the same kind of terminal UI library symcc's planned app would use.
  - `remote-worker/`: Go container and Firecracker microVM sandboxes.
  - `deploy/`: Docker Compose, a single VM, Kubernetes/OpenShift, microVM.
  - `pi-fork/`: the agent itself, a pinned fork of `kagenti/pi`.
- **Three parts that matter for symcc:**
  1. **The sandbox service, `mocactl sbx`** (docs/sbx/user-guide.md). Your own Claude Code, OpenCode, Codex or IBM Bob keeps running on your laptop.
     - `mocactl sbx up` copies the repo to a remote sandbox and switches off the agent's local tools (for Claude Code through `permissions.deny` in `.claude/settings.json`).
     - Every command then runs in a fresh microVM with no network except an allowlist, and no secrets.
     - You take the work back as a patch with `mocactl sbx pull --apply` (using `git apply --3way`).
     - The guide says "Each worktree gets its own sandbox". Default limits: 3 sandboxes per person, 7 days idle, 15 minutes per command, and you need an operator-run KVM host and an enrolled GitHub account.
  2. **The `moca-delegate-task` skill** (skills/moca-delegate-task/SKILL.md). It tells a Claude Code agent to pack a folder, upload it as a "workload", start many tasks in the background with `mocactl spawn --tag`, check them with `mocactl subagents`, and collect results with `mocactl get`. Writable copies are thrown away, so changes come back only as a diff inside the answer. It also says "Treat answers as untrusted work".
  3. **Human gate** (docs/concepts/dispatch-archetypes.md). A run can stop with `status: "paused"` and a `gateId`. It continues when someone sends back `approve`, `reject` or `abort`. Nothing is held in memory while it waits.
- **What moca does not have:**
  - No planner or lead, no task board, no dependencies between tasks, no test gate, no merging, no scope check per task, no scouts.
  - Scheduled runs were removed: "No P6 equivalent; design owed" (issue #536).
  - Its own server-side agent is Pi only. Claude Code, OpenCode, Codex and Bob are supported only as local programs that use the sandbox.

### Comparison table

| | symcc | moca |
|---|---|---|
| Who it's for | One developer, on their own machine | Platform teams running agents for many users on servers (Kubernetes, VM, Compose); also developers who want their agent's commands run remotely |
| Problem it solves | Keeping track of a lot of work: ideas become tasks, done in parallel, tested and merged, and nothing gets lost | Running agents cheaply and safely: warm worker pool, sessions that survive crashes, commands kept away from the machine that holds the credentials |
| Goals | A lead that runs a team for you; work keeps moving while you're away; standalone app later | Many sessions per worker, resume by `sessionId`, microVM isolation, multi-user login and credentials, cost per turn (issue #859) |
| How work is planned | A lead in your chat writes tasks on a shared board, with order, dependencies and the files each task may change | Not at all. An outside "orchestrator" (or you, or a Claude Code skill) decides; moca only runs the work it is sent |
| Who does the work | Claude Code worker subagents, 3 at a time by default, with roles | Pi sessions on the server; the number at once is limited by worker slots and the sandbox pool. With `sbx`, your own local agent |
| Isolation | One git worktree and branch per task; OS sandbox per worker studied in T-357, not built | A remote container, or a Firecracker microVM for each command; no network except an allowlist; no secrets inside |
| Tests and merging | Your test commands must pass; failures retry with the failing output; symcc merges | None. `sbx pull --apply` puts a patch in your working tree; delegated tasks return a diff in their answer |
| Review | Review mode with approve/reject and a reason; optional checker that tries to break each change | Human gate: approve, reject or abort a paused run; no diff review step |
| Guards on what agents change | Edits outside a task's file list are refused; other changes outside it aren't merged | Local tools switched off so all work happens in the sandbox; your laptop's files untouched until you pull. No per-file limit |
| Scheduled or background agents | Scouts on timers; a check every 2 minutes; workers in the background | Background `spawn`; async fan-out is opt-in (`SH_ASYNC_DRAIN=1`); scheduled runs removed (#536) |
| UI | Board panel and the line above the prompt in Claude Code (terminal, VS Code extension, JetBrains terminal) | `mocactl` terminal app (Ink chat); HTTP/OpenAPI; no IDE or web board found |
| Host and agent independence | Claude Code plugin today; Host layer under way for OpenCode and a standalone app | Server runs only Pi; the sandbox works with Claude Code, OpenCode, Codex (weaker containment) and IBM Bob (local tools not switched off) |
| Maturity | Used every day by the owner; plugin API is early access | "Preview" everywhere; 3.6k commits in 5 months; 12 stars |
| License | MIT | Apache-2.0 |

### Ideas worth borrowing (ideas only)
1. **Switch off local tools and run commands somewhere else.** They do it with Claude Code's `permissions.deny` plus an MCP server that offers its own `bash`/`read`/`write`/`edit`. This is another way to do what T-357 studied. symcc would run its own local MCP tools that only work inside the worktree, instead of wrapping Bash in `sandbox-exec`. It would also cover Read/Edit/Write, which Claude Code's own sandbox doesn't.
2. **"Treat answers as untrusted work."** This matches symcc's checker and scope check. Worth saying the same way in the worker and lead prompts.
3. **A pause that holds nothing in memory.** A paused run is just its saved state plus an id (`gateId`), and it continues when a decision comes back. This fits symcc's `waiting` status and the standalone engine: a waiting task should need no running process.
4. **Sessions that survive a crash.** Every step is written to a log, so a lost worker can be picked up again. Useful for the standalone app, where symcc's work currently stops when the Claude Code session closes.
5. **Backpressure messages.** The server answers 429 or 503 with a retry delay when no worker or sandbox is free. A clear "full, try again at X" state could help symcc's worker limit.
6. **Patch back with a 3-way apply that refuses to touch your uncommitted edits.** A safe way to bring remote work home, if symcc ever runs workers off the machine.
7. **Their own development process.** They have a CLAUDE.md, a "context budget" rule (send long command output to log files), and dated design specs and decision records (ADRs). Small, but the context-budget rule fits symcc worker prompts.

**What symcc does that moca doesn't:**
- a lead that turns wishes into tasks
- a shared board kept between sessions
- dependencies and ordering between tasks
- a file list per task, enforced at edit time
- test gate, retries and automatic merge, with conflicts sorted out
- review of the diff, and the checker
- scouts finding work on timers
- a record of who asked for each task and why
- workers asking you questions through a tool
- a board panel inside Claude Code and VS Code
- no server, accounts or operator needed

### Anything symcc could reuse directly?
**Not now.**
- The license is no barrier: Apache-2.0 code can go into an MIT project if the notice is kept.
- The useful part, the `sbx` microVM sandbox, needs moca's control plane, a KVM host run by an operator, and GitHub enrollment. That is the opposite of symcc's "local, one developer, no extra app".
- Its server side is built around Pi, not Claude Code workers.
- Everything is "Preview" with changing interfaces.

**Maybe later, as an option** (guess, not tested): with a moca `sbx` service available (for example inside an organisation that runs one), a symcc worker could run `mocactl sbx up` in its own worktree (each worktree gets its own sandbox) and run with local tools switched off. symcc would then pull the patch back before its scope check and tests. That would fit as an optional "runner" in the standalone engine, not as part of the core.

## Not checked
- I did not install or run `mocactl` or any moca deployment.
- I did not read rossoctl/cortex beyond its description ("The proxy layer between agents and everything they touch", Apache-2.0, 30 stars).
- I did not read most of the 51 decision records.
- That moca is from IBM is a guess.

## Recommended next step
Don't make moca a dependency. Add idea 1 (local MCP tools that only work inside the worktree, with the built-in tools switched off) as an option to compare against the T-357 sandbox approach. Keep "remote runner, e.g. moca sbx" as a possible later runner for the standalone engine (T-377) work.

## How it was found
- Ran `gh repo view rossoctl/moca` and `gh issue list` / `gh release list` (repo pushed 2026-11-18 01:06 UTC).
- Cloned the repo into /tmp, read it, then deleted the clone. Files read: README.md, CLAUDE.md, .claude/settings.json, skills/moca-delegate-task/SKILL.md, docs/sbx/user-guide.md, docs/concepts/brain-and-hands.md, docs/concepts/dispatch-archetypes.md, docs/specs/2026-06-28-human-gate-design.md, docs/specs/2026-10-27-sbx-up-cortex-design.md, packages/mocactl/package.json, and the code layout. I ran none of its code.
- For symcc I read README.md, docs/guide.md and these notes in docs/research/: research-existing-hosts-*, opencode-spike-*, research-can-symcc-work-inside-an-ide-*, research-can-symcc-start-each-worker-in-a-sandbox-*, standalone-cli.md and host-independence.md.

Sources (all read 2026-11-18):
- https://github.com/rossoctl/moca (README.md, CLAUDE.md, docs/sbx/user-guide.md, docs/concepts/brain-and-hands.md, docs/concepts/dispatch-archetypes.md, skills/moca-delegate-task/SKILL.md)
- https://github.com/rossoctl/moca/issues/536 (scheduled dispatch), https://github.com/rossoctl/moca/issues/859 (cost per turn)
- https://github.com/rossoctl/moca/releases (v0.10.0, 2026-11-05)
- https://github.com/rossoctl/cortex (description only)
