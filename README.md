<p align="center">
  <img src="docs/logo.svg" alt="symcc: run a team of coding agents from one chat" width="760">
</p>

<p align="center">
  <b>A team lead for your coding agents: it listens, takes notes, organizes the work, and nothing slips.</b>
</p>

<p align="center">
  <b>A team, not a session:</b> other tools run coding agents one chat at a time, with you as the manager. symcc gives them a lead that plans, a board everyone shares, and workers that build in parallel. You stay in charge, and the work keeps moving when you're not pushing it.
</p>

<p align="center">
  <b>Work goes on without you:</b> scouts look for bugs, missing tests and outdated parts on their own timers. The lead turns what they find into tasks, leads the workers, tests and merges, and asks you only for real decisions.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-D97757" alt="Claude Code plugin">
  <a href=".claude-plugin/plugin.json"><img src="https://img.shields.io/github/package-json/v/kourgeorge/symcc?filename=.claude-plugin%2Fplugin.json&color=blue" alt="version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="https://github.com/kourgeorge/symcc/commits/main"><img src="https://img.shields.io/github/last-commit/kourgeorge/symcc" alt="last commit"></a>
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#quick-start">Quick start</a> · <a href="#how-it-works">How it works</a> · <a href="#all-features">Features</a> · <a href="docs/get-started.md">Get started</a> · <a href="docs/docs.md">Documentation</a> · <a href="docs/reference.md">Reference</a> · <a href="docs/demo.svg">Demo</a>
</p>

<p align="center">
  <img src="docs/demo.svg" alt="symcc demo" width="860">
</p>

## What symcc is

You give a coding agent a task and watch it work. Meanwhile new ideas come up, and you either interrupt the agent or try to remember them. With a big job it gets worse: a dozen things to fix, no clear view of which change belongs to which item, and the small ones quietly drop out.

The slow part is not writing code. It is keeping track of the work.

symcc is an agent organization that runs inside your coding agent. Your chat becomes a lead that takes your ideas at any time, puts them on a board, and has workers build them. You keep talking, and the work keeps moving.

## Why symcc

- **See everything.** A live board shows what is running, what is waiting and what needs you.
- **Know why.** Every task and commit records who asked for it and why, so you can go from a line of code back to the request.
- **Order handled for you.** The lead decides which tasks wait for others and which run in parallel.
- **Stay in control.** Review each diff before it merges, edit it, reject it, or turn symcc off with `/symcc-disable`.

## The parts, and why each one exists

- **Lead.** It is your normal chat. You talk to one place, and the lead turns ideas into tasks and decides their order, so you do not have to split and track the work yourself. Change your mind any time: "do T-6 first".
- **Board.** One list for work you asked for and work scouts found: todo, doing, review, done. It is a plain file, so the work is still there after the chat ends.
- **Workers.** Parallel agents, each with its own git folder and branch, so they cannot overwrite each other and your branch stays untouched until a merge. Each task also lists the files it may change. That list makes a check possible: an edit outside it is refused and becomes a question to you, instead of a surprise in the diff.
- **Scouts.** Helpers on a timer that only look. They find bugs, missing tests and outdated parts while you are away. A scout cannot change your project: symcc refuses its file edits and git writes, and its findings become tasks only if the lead adds them. See [scouts](docs/scouts.md#scouts).
- **Checker (optional).** A fresh agent that did not write the change tries to break it before the tests run. It is off by default because it costs time and tokens.
- **Tests before merge.** Your test commands must pass. If they fail, a new worker gets the output and tries again.
- **Review.** You can see the diff, then approve, or reject with a reason. See [approval before merge](docs/tasks.md#approval-before-merge).

The file checks above (the guards) catch honest mistakes. They are not a security boundary and do not stop an agent that works around them on purpose. How it works explains this and the other design choices in [Why it is built this way](docs/how-it-works.md#why-it-is-built-this-way): why one merge queue, why shared agent notes (org-mem) go through the lead, and why investigations wait for you.

### How a change gets merged

Finished tasks do not all merge at once into a moving branch. They take turns in one queue for the whole project. This way the code a task was tested with is exactly the code that merges. At its turn a task catches up with your branch, runs your tests, and then merges (or waits for your review). Any failure counts as one normal failed try. Details: [the way to the merge](docs/tasks.md#the-way-to-the-merge).

    hand-back → prep → checker (if on) → queue → catch up → tests → review or merge

### Scouts at work

Examples of what scouts do while you are away:

- A **gaps** scout finds a function with no tests. The lead adds a task, a tester worker writes the test, the tests pass, it merges.
- A **dependencies** scout finds an outdated package with a security notice. The lead adds a task, a worker updates it and runs your tests. You review the diff.
- A **bugs** scout finds a missing null check. The lead adds a bug task, a worker fixes it. If the fix needs a choice (say, which error to show), it asks you.

The lead keeps it moving; you come back to merged work and a few questions.

![symcc's loop: you direct the lead; the lead puts tasks on the board; workers build; tests and merge update the code; scouts look at the new code and find more work for the lead](docs/organizational-loop.jpg)

## How symcc is different

**Coding agents** (Claude Code, Codex, OpenCode, Goose) run one agent you talk to. Their helper agents work inside your turn, and you wait for them. Nothing keeps a list of the work after the chat ends.
→ symcc adds a team on top: a lead you talk to, a board that stays between sessions, workers that build in the background, and scouts that look for problems on their own.

**Multi-agent apps** (claudecodeui, T3 Code, cmux and others) let you run several agents side by side, but *you* split the work, keep track of it, check it and merge it.
→ In symcc the lead does that. It turns what you say into tasks, decides their order, starts the workers, runs your tests, merges what passes, and asks you only when the decision is really yours.

**Put together, only in symcc:**
- every task remembers who asked for it and why
- each worker gets its own copy of the code and may change only its own files
- nothing merges unless the tests pass; optionally, a checker tries to break each change first
- questions come back as answers, and never as code changes
- scouts, retries and a health check keep the work going without you pushing it
- scouts keep finding work and the lead keeps it moving while you are away

**Where it runs.** symcc is a plugin for Claude Code and for OpenCode. Work runs while your session is open: it stops when you close it and picks up next time. A small command-line version that runs the same engine without a chat window exists as a test of the idea (see [Running symcc without Claude Code](docs/architecture.md#running-symcc-without-claude-code)).


## How it works

![How symcc works: you, the lead, workers and scouts](docs/architecture.svg)

<p align="center">
  <a href="docs/video/symcc.mp4"><img src="docs/video/symcc.gif" alt="symcc video preview: you talk to the lead, it puts tasks on the board, and workers move them from todo to running to done" width="800"></a>
  <br>
  <a href="docs/video/symcc.mp4"><b>▶ Watch the full video</b></a> (78 seconds, no sound)
</p>

In short: you ask, or a scout finds something. The lead makes tasks and sets their order and files. Workers build in parallel. symcc checks the files and runs your tests, you review, and it merges. The [steps in full](docs/reference.md#how-it-works-step-by-step) and [A task's life](docs/how-it-works.md#a-tasks-life) have the rest.

## Install

You need Claude Code (built and tested with **2.1.319**; the plugin API is early access and can change) and **git**. There is no build step.

```bash
claude plugin install symcc --marketplace kourgeorge/symcc
```

Other ways (try it from a clone, two steps, update, uninstall) and fixes for common problems are in the [reference](docs/reference.md#install-other-ways-and-fixes).

## Quick start

1. **Install** symcc (see above), then start Claude Code in your project. In a new project symcc stays off (the line under the prompt says so) until you type `/symcc-init` in the folder you want it in; that creates the board there and opens the panel (run `/symcc` to open it again). With no git in the folder the board says so and has a Set up git button; if git is not installed it shows the install step.
2. **Keep the board local:** `echo ".symcc/" >> .gitignore`
3. **Set your tests:** tell the lead "set the test command to `npm test`". Without one, changes merge without tests.
4. **Optional, a scout:** a new project starts with example scouts, all paused. Try one with `/symcc-scout <name>`. See [scouts](docs/scouts.md#scouts).
5. **Ask for something.** "Add a dark mode toggle." Then watch the board.

## Using symcc in OpenCode

symcc also runs in [OpenCode](https://opencode.ai) 2.3 or newer (not the older 1.x line). This is a first version. Install it with one command, from a clone of symcc:

```bash
git clone https://github.com/kourgeorge/symcc && sh symcc/scripts/install-opencode.sh
```

This links symcc into `~/.config/opencode/plugins/symcc`, for all your projects (add `--project <folder>` for one project only, `--remove` to take it out). `opencode plugin list` should then show the folder `.../opencode/plugins/symcc` (with no ID of its own). The Claude Code plugin stays as it is.

Or, with no clone, use OpenCode's own command: `opencode plugin add github:kourgeorge/symcc`. This works with OpenCode 2.3.2: it adds symcc to `~/.config/opencode/opencode.json`, keeps symcc's files in OpenCode's cache (`~/.cache/opencode/npm/`), and `opencode plugin list` then shows `symcc` with the commit it fetched. (The first `opencode plugin list` can say "No plugins found" while OpenCode's background service is still starting; run it again.) Pick one of the two ways, not both.

What you need: OpenCode 2.3 or newer, and nothing else (no `npm install` in symcc: the board's screen uses OpenCode's own Solid and OpenTUI). To get OpenCode 2.x, install it from npm with `npm install -g @opencode/cli`. Homebrew's `opencode` is the old 1.x line, which symcc doesn't support. Check which one runs with `opencode --version`; it should say 2.3 or higher.

- **The lead** is the OpenCode session you type in. Talk to it as in Claude Code; the slash commands (`/symcc`, `/symcc-stats` ...) are the same.
- **Workers, scouts and checkers** are OpenCode sessions, each in its task's own folder, with the same file checks. Each role picks its model in its `model:` line: a Claude name (`sonnet`, `haiku` ...) runs on OpenCode's Claude Agent provider with your Claude Code login, and any other model is written `provider/model` (for example `openai/gpt-5`); with no `model:` line, it runs on the lead's own current model.
- **The board:** in a session, `/symcc-board` (or "symcc board" in the command palette, ctrl+p) opens it in OpenCode's session panel, and a strip above the prompt shows what needs you and what runs. Plain `/symcc` prints the board as text.
- **What differs:** the cost shows 0 on subscription models (tokens are still counted); the all-time stats count the lead's full total, while ranged stats (`7d`, task ranges) count its answers since the last compaction, and older tokens show as "not dated" and are left out; the board panel opens by itself when a session is first shown, as in Claude Code (turn the `open_on_start` setting off to stop that); and some things have no OpenCode hook yet (no plan mode, and the panel has no `w` key to watch a worker; its Live, Tasks, Scouts and Settings tabs work as in Claude Code, including the Roles and Task types pages, editing roles, task types and scouts, and the Organizational memory button on Live).
- **The Claude login:** whether Anthropic allows using your Claude login through OpenCode's Claude Agent provider is not settled. Other models avoid that question.

The details are in [Clients](docs/clients.md#using-symcc-in-opencode).

## Using symcc in Copilot CLI

symcc also runs in GitHub Copilot CLI as an extension. This is a first version. Extensions are still experimental there, so start Copilot with `copilot --experimental` (or `/settings experimental on`). Install from symcc's marketplace:

```bash
copilot plugin marketplace add kourgeorge/symcc
copilot plugin install symcc@symcc
```

The lead's tools, workers, scouts and checkers work. There is no board panel yet (`/symcc` prints the board as text), and slash commands work only in the interactive CLI. In `copilot -p`, Copilot loads symcc only with `--allow-all` (or `--allow-all-tools`); without it none of symcc's tools are there. The details, including your own model provider (BYOK), are in [Clients](docs/clients.md#using-symcc-in-copilot-cli).

## All features

| Feature | What it does |
|---|---|
| **Scouts** | Read-only background agents on a timer. They check for bugs, missing tests, outdated dependencies or security notices, and report; the lead turns the findings into tasks. This is how work is found while you are away. See [scouts](docs/scouts.md#scouts). |
| **Lead** | Your normal Claude Code chat. It takes ideas at any time, splits them into tasks, supervises and reports. Change your mind any time: "do T-6 first", "drop T-2". |
| **Task board** | One board for work you asked for and work scouts found: todo / doing / review / done, plus a backlog for ideas that never start until you move them to todo. |
| **Workers** | Parallel agents (3 by default), each in its own git worktree and branch (`symcc/T-1`). Your branch is untouched until merge. |
| **Worker roles** | The lead picks a role per task: general, docs, refactor, researcher, security, tester, writer (prose only, never code), or your own in `.symcc/roles/`. Each brings its own checklist, skills and model, and may add web tools (`tools: web`; in Claude Code that is WebSearch and WebFetch): only `researcher` and `writer` have web access built in. A role fills the `{{role}}` slot of the fixed, built-in worker prompt, and its checklist may use `{{files}}`, `{{test_command}}` and other placeholders. |
| **Dependencies** | A task with `after: T-1` waits until T-1 is merged. Tasks that change the same files are put one after another. |
| **Scope check** | Each task lists the files it may change. A worker's edit outside that scope is refused and asks you for the file; other changes outside it are not merged. |
| **Test gate and retries** | Finished tasks take turns in one merge queue. At its turn a task catches up with the branch, runs your test commands (skipped if this exact code already passed), then merges. If anything fails (tests, time-out, a clash), a new worker gets the output and tries again (2 times by default). See [the way to the merge](docs/tasks.md#the-way-to-the-merge). |
| **Approval before merge** | In approve merge mode, see the diff, then approve, or reject with a reason. The lead also asks you before it adds any task. |
| **Workers ask you** | A worker that needs a decision asks with its `ask_owner` tool (with choices, if any) and its task waits for your answer. symcc never reads questions or file requests out of a worker's text. |
| **Investigations** | Of the task types, a *change* (the default) edits files, which are tested and merged. An *investigation* answers a question ("is it possible…", "should we…", "how does X work?"): nothing is committed or merged, and it always waits for you to read the answer, then **Done**, **Keep as a note** (a docs task saves it as `docs/research/<topic>.md`) or **Ask more** (a follow-up question for a fresh try). Researcher tasks are investigations by default. See [investigation tasks](docs/tasks.md#investigation-tasks). |
| **Task types** | Every task has a task type, a label with a description that says what it is for: `change` (the default), `bug`, `feature`, `refactor`, `docs` or `investigation`. The lead picks one ("make T-5 a bug" changes it); add your own in `.symcc/kinds/`. See [task types](docs/tasks.md#task-types). |
| **Checker** | Off by default. With `checker` on, a fresh checker tries to break each change (not docs-only ones) after the prep step and before it joins the merge queue, where the tests run; problems go back to the worker. See [the checker](docs/tasks.md#the-checker). |
| **Traceability** | Each task keeps who made it, why, your own words, and the history of its tries (time, tokens, failed test output). Each merge commit starts with the task ID (`T-58: ...`). |

symcc works while your Claude Code session is open; work stops when you close it and
picks up next time. Every two minutes it checks the board by itself, starts ready tasks,
and asks you for more time when a worker runs longer than `max_minutes` (45 by default). There is no extra
app and no issue-tracker link. When two changes clash, a new worker sorts out the clash.

## Things you can say

You never have to type a command. Just talk to the lead:

- "what's going on?"
- "do T-4 first" · "T-6 should wait for T-5"
- "T-3 should also handle emails"
- "pause T-5" · "drop T-2" · "stop everything"
- "set the test command to `npm test`" · "give workers 90 minutes"
- "approve T-5" · "reject T-5: the button should be blue"
- "stash this idea" · "show the backlog" · "move T-5 to todo"
- "use the security role for T-12"

A few things are slash commands: `/symcc` opens the board, `/symcc-init` creates the board in the current folder, `/symcc-disable` and `/symcc-enable` switch an existing board off and on, and `/symcc-drive` makes the window you type it in drive the board (when several windows have the project open). `/symcc-help` lists them all.

## More

- [Website](https://kourgeorge.github.io/symcc/): the landing page and the documentation as web pages
- [Get started](docs/get-started.md): install, the first board, the first task
- [Documentation](docs/docs.md): every page: the board, tasks, scouts, running on its own, clients, troubleshooting
- [Reference](docs/reference.md): install details, modes, commands, settings, statuses
- [Architecture](docs/architecture.md): for people who change symcc: where the code is, the engine and the clients, the tests, renaming the plugin, and the team picture
- [Research notes](docs/research/index.md) and [the demo](docs/demo.md): investigation answers, and how the demo picture is made
