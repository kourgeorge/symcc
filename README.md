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
  <a href="#install">Install</a> · <a href="#quick-start">Quick start</a> · <a href="#how-it-works">How it works</a> · <a href="#all-features">Features</a> · <a href="docs/guide.md">Guide</a> · <a href="docs/reference.md">Reference</a> · <a href="docs/demo.svg">Demo</a>
</p>

<p align="center">
  <img src="docs/demo.svg" alt="symcc demo" width="860">
</p>

You give a coding agent a task and watch it work. Meanwhile new ideas come up, and you
either interrupt the agent or try to remember them. Big jobs get worse: a dozen things
to fix, no clear view of which change belongs to which item, and the small ones quietly
drop out. The bottleneck isn't how fast the agent writes code. It's keeping track of the work.

symcc turns your Claude Code chat into a lead that takes your ideas at any time, puts
them on a board, and has a team of workers build them. It is vibe coding, with a team
behind it: you keep talking, and the work keeps moving.

## Why symcc

- **See everything.** A live board shows what is running, what is waiting and what needs you.
- **Know why.** Every task and commit records who asked for it and why, so you can go from a line of code back to the request.
- **Order handled for you.** The lead decides which tasks wait for others and which run in parallel. You think about the next question while the team works on the next task.
- **Stay in control.** Review each diff before it merges, edit it, reject it, or disable symcc entirely with `/symcc-disable`.

The main parts:

- **Scouts:** helpers on a timer that look but don't change your project (symcc refuses their file edits and git writes; see [what is enforced](docs/guide.md#scouts)). A scout is a short instruction file ("look for code with no tests") that runs again and again and reports what it finds. See [scouts](docs/guide.md#scouts).
- **Lead:** your normal Claude Code chat. It turns scout findings and your ideas into tasks, leads the workers, tests and merges, and tells you what matters. Change your mind any time: "do T-6 first".
- **Board:** one list for work you asked for and work scouts found: todo / doing / review / done.
- **Workers:** parallel agents, each in its own git worktree and branch, so your branch is untouched until merge.
- **Tests before merge:** your test commands must pass; if they fail, a new worker gets the output and tries again.
- **Review:** see the diff, then approve, or reject with a reason. See [approval before merge](docs/guide.md#approval-before-merge).

### How a change gets merged

Finished tasks do not merge all at once into a moving branch. They take turns in one line for the
whole project, so the code a task was tested with is exactly the code that merges. At its turn a
task catches up with your branch, runs your tests and then merges (or waits for your review). Any
failure counts as one normal failed try. Details: [the way to the merge](docs/guide.md#the-way-to-the-merge).

    hand-back → prep → checker (if on) → in line → catch up → tests → review or merge

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

**Today** symcc runs inside Claude Code, and work runs while your session is open (it stops when you close it and picks up next time). A standalone version that works with other coding agents too is being planned.


## How it works

![How symcc works: you, the lead, workers and scouts](docs/architecture.svg)

<p align="center">
  <a href="docs/video/symcc.mp4"><img src="docs/video/symcc.gif" alt="symcc video preview: you talk to the lead, it puts tasks on the board, and workers move them from todo to running to done" width="800"></a>
  <br>
  <a href="docs/video/symcc.mp4"><b>▶ Watch the full video</b></a> (78 seconds, no sound)
</p>

You ask (or a scout finds something). The lead makes tasks, sets their order and the files each may change. Workers build in parallel. symcc checks the scope and runs your tests, you review, and it merges. The [steps in full](docs/reference.md#how-it-works-step-by-step) and the [guide](docs/guide.md#a-tasks-life) have the rest.

## Install

You need Claude Code (built and tested with **2.1.319**; the plugin API is early access and can change) and **git**. There is no build step.

```bash
claude plugin install symcc --marketplace kourgeorge/symcc
```

Other ways (try it from a clone, two steps, update, uninstall) and fixes for common problems are in the [reference](docs/reference.md#install-other-ways-and-fixes).

## Quick start

1. **Install** symcc (see above), then start Claude Code in your project. The board panel opens by itself; if not, run `/symcc`.
2. **Keep the board local:** `echo ".symcc/" >> .gitignore`
3. **Set your tests:** tell the lead "set the test command to `npm test`". Without one, changes merge without tests.
4. **Optional, a scout:** a new project starts with example scouts, all paused. Try one with `/symcc-scout <name>`. See [scouts](docs/guide.md#scouts).
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
- **What differs:** the cost shows 0 on subscription models (tokens are still counted); the all-time stats count the lead's full total, while ranged stats (`7d`, task ranges) count its answers since the last compaction, and older tokens show as "not dated" and are left out; and some things have no OpenCode hook yet (no plan mode, the panel doesn't open by itself, and no Roles or Kinds pages or scout editing in the panel; its Tasks, Scouts and Settings tabs work as in Claude Code).
- **The Claude login:** whether Anthropic allows using your Claude login through OpenCode's Claude Agent provider is not settled. Other models avoid that question.

The details are in the [guide](docs/guide.md#using-symcc-in-opencode).

## All features

| Feature | What it does |
|---|---|
| **Scouts** | Read-only background agents on a timer. They check for bugs, missing tests, outdated dependencies or security notices, and report; the lead turns the findings into tasks. This is how work is found while you are away. See [scouts](docs/guide.md#scouts). |
| **Lead** | Your normal Claude Code chat. It takes ideas at any time, splits them into tasks, supervises and reports. Change your mind any time: "do T-6 first", "drop T-2". |
| **Task board** | One board for work you asked for and work scouts found: todo / doing / review / done, plus a backlog for ideas that never start until you move them to todo. |
| **Workers** | Parallel agents (3 by default), each in its own git worktree and branch (`symcc/T-1`). Your branch is untouched until merge. |
| **Worker roles** | The lead picks a role per task: general, docs, refactor, researcher, security, tester, or your own in `.symcc/roles/`. Each brings its own checklist, skills and model, and may add web tools (`tools: web`; in Claude Code that is WebSearch and WebFetch): only `researcher` has web access built in. A role fills the `{{role}}` slot of the fixed, built-in worker prompt, and its checklist may use `{{files}}`, `{{test_command}}` and other placeholders. |
| **Dependencies** | A task with `after: T-1` waits until T-1 is merged. Tasks that change the same files are put one after another. |
| **Scope check** | Each task lists the files it may change. A worker's edit outside that scope is refused and asks you for the file; other changes outside it are not merged. |
| **Test gate and retries** | Finished tasks take turns in one merge line. At its turn a task catches up with the branch, runs your test commands (skipped if this exact code already passed), then merges. If anything fails (tests, time-out, a clash), a new worker gets the output and tries again (2 times by default). See [the way to the merge](docs/guide.md#the-way-to-the-merge). |
| **Approval before merge** | In review mode, see the diff, then approve, or reject with a reason. The lead also asks you before it adds any task. |
| **Workers ask you** | A worker that needs a decision asks with its `ask_owner` tool (with choices, if any) and its task waits for your answer. symcc never reads questions or file requests out of a worker's text. |
| **Investigations** | Of the task kinds, a *change* (the default) edits files, which are tested and merged. An *investigation* answers a question ("is it possible…", "should we…", "how does X work?"): nothing is committed or merged, and it always waits for you to read the answer, then **Done**, **Keep as a note** (a docs task saves it as `docs/research/<topic>.md`) or **Ask more** (a follow-up question for a fresh try). Researcher tasks are investigations by default. See [investigation tasks](docs/guide.md#investigation-tasks). |
| **Task kinds** | Every task has a kind, a label with a description that says what it is for: `change` (the default), `bug`, `feature`, `refactor`, `docs` or `investigation`. The lead picks one ("make T-5 a bug" changes it); add your own in `.symcc/kinds/`. See [task kinds](docs/guide.md#task-kinds). |
| **Checker** | Off by default. With `checker` on, a fresh checker tries to break each change (not docs-only ones) after the prep step and before it joins the merge line, where the tests run; problems go back to the worker. See [the checker](docs/guide.md#the-checker). |
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

A few things are slash commands: `/symcc` opens the board, `/symcc-disable` and `/symcc-enable` disable and enable symcc, and `/symcc-drive` makes the window you type it in drive the board (when several windows have the project open). `/symcc-help` lists them all.

## More

- [Website](https://kourgeorge.github.io/symcc/): the landing page, the guide and the reference as web pages
- [Guide](docs/guide.md): a task's life, review, the panel, scouts, branches, where files live, safety
- [Reference](docs/reference.md): install details, modes, commands, settings, statuses
- [Architecture picture](docs/architecture.md) and [demo](docs/demo.md): how the pictures are made
- [For developers](docs/guide.md#for-developers-where-the-code-is) and [renaming the plugin](docs/guide.md#renaming-the-plugin)
