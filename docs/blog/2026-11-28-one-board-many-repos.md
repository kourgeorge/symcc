# One board, many repos

*Your code lives in several places. Your board doesn't have to.*

## The problem: work spans several repos

Real work rarely stays in one repo.

A feature often needs a change in an API and a change in the web app that calls it. A fix in a library may need a matching change in the apps that use it. A talk may need slides in one folder and a demo in another.

Until recently, a symcc board drove one repo: the one it lived in. Later it could also drive the repos in the folders directly below it. That helped, but it still tied your board to where your folders happened to sit on disk.

So if your API lived in `~/code/api` and your web app in `~/work/web`, you needed two boards, two leads, and two places to look.

symcc 0.6.0 changes that.

## The idea: a board keeps a list of projects

A board now keeps a **project table**. Each project is just two things:

- a **name**, like `api` or `web`;
- a **path** to a repo, anywhere on disk.

The repos stay where they are. symcc copies nothing into the board folder. It only remembers the name and the path.

A board that lives inside a repo needs no projects at all. Its own repo is the project, and everything works as before.

The full plan behind this is in [The symcc workspace model](../workspace-model.md), and the table itself is described under [Projects](../reference.md#projects) in the reference.

## How it works for you

### Adding a repo

You don't edit the table by hand. You tell the lead, for example: "add my API repo at ~/code/api as a project".

The lead adds a project only when you say yes. Its instructions treat this like other actions that touch your machine: ask first, then act.

Then symcc checks the path before it saves anything:

- the path must exist;
- it must be a git repo, and the path must be the repo's **top folder**, not a folder inside it (if you give a folder inside, symcc names the top folder to use instead);
- the repo must have at least one commit;
- it must not sit inside a `.symcc` folder;
- the name must be a plain name (letters, digits, `.`, `_` and `-`) that no other project uses;
- no other project may already point at the same repo.

If a check fails, nothing changes, and the answer says why.

You can point a project at a new path later, but only while none of its open tasks has a copy or a branch yet. You can remove a project, but not while open tasks still use it, or while a scout names it.

### Each task names its project

On a board with projects, every change task names the project it changes. That one word decides a lot:

- **Its own copy.** The worker gets its own copy of that repo (a git worktree: a second checkout that shares the repo's history). The copy sits under the board folder, at `.symcc/worktrees/T-n`, wherever the repo itself lives.
- **Its own tests.** Each project can keep its own test commands. The task is tested with those, in that repo. There is no test that runs across repos; each repo is tested alone.
- **Its own merge.** The task merges into the branch you had checked out in that repo when the task was added.
- **Your files come first.** The merge never writes over your uncommitted work. If you have uncommitted changes, untracked files or git-ignored files in files the task changes, the task waits and tells you which files are in the way. Once you commit, stash or move them, it merges by itself.

A task's files are written relative to its repo: `README.md`, not `api/README.md`.

Not every task needs a repo. An investigation (a question you want answered) or an errand (work with nothing to merge) may have no project. It then runs in a plain folder with no git copy. It may read every project, but writes into none.

On the board, a task with a project shows it as a tag before its title, like `[api] Add a search endpoint`, in the terminal, VS Code and OpenCode.

### A change across two repos is two tasks

symcc keeps one rule simple: one task changes one repo.

A change that touches two repos becomes two tasks, linked with `after`. The second task starts only when the first one is merged. If something breaks between the two repos later, that is fixed by a normal follow-up task.

## Safety: your real folders stay yours

A project repo outside the board folder is still your real code, with your own work in progress. symcc treats it like the board folder itself.

- **Agents can read, not edit.** Workers, checkers and scouts can read a project's repo. None of them can edit your real folder there. A worker may change only its own copy.
- **Only plain reads pass without a prompt.** Claude Code normally asks for permission when an agent reads outside the session folder, and a background agent can't answer that question. So symcc says yes for its own agents, but only for plain reads: the Read tool, or a read-only shell command such as `cat`, `grep`, `find` or `ls`. Anything else is not waved through.
- **Links are followed first.** Before a read or an edit is judged, symcc looks up where each path really leads on disk. A symbolic link (a file that points somewhere else) inside a repo is judged by where it lands, not by its name.
- **Changes arrive only through a merge.** Work reaches a project repo in one way: the task's branch is tested and merged into your branch, under the rules above.

## Scouts and each repo's own rules

### Scouts can look at some projects only

Scouts are agents that look for work on a timer, such as missing tests or outdated docs, and suggest tasks to the lead. See [Scouts](../scouts.md).

A scout file can now carry a line like:

```
projects: api
```

That scout then looks only at the `api` repo. With no `projects:` line, it looks at every project. A name the board doesn't have, such as a typo, shows a warning on the scout's page, and that scout can't run until the name is fixed. The details are in [Choosing projects](../scouts.md#choosing-projects).

### Workers read the repo's own instructions

Many repos keep notes for coding agents in a `CLAUDE.md` or `AGENTS.md` file at the top. A worker's copy is not opened as its own session, so those files are not loaded on their own.

So symcc tells each worker on a project task to read its repo's `CLAUDE.md` and `AGENTS.md` first, if they exist. The rules of each repo apply to the work done in it.

## Board names: two boards, one repo

Each board now gets a friendly random name of two words, like `power-falcon`. It is picked once and kept. You see it in the banner's first line, next to the folder.

The name also goes into every task branch: `symcc/power-falcon/T-5` instead of just `symcc/T-5`.

This matters once repos are shared. Two boards may both list the same repo as a project, and both have a task T-5. With plain `symcc/T-5` branches, they could pick up each other's work. With the board's name in the branch, they never touch each other's branches. See [The board](../board.md#live-status-seeing-the-board).

A board from before names gets one the first time it loads, and its open task branches are renamed then.

## An example: one request, two repos

*This is a made-up example to show the flow. The names and paths are only for illustration.*

Say your board lives in `~/work` and has two projects:

- `api` → `~/code/api`, tested with its own test command;
- `web` → `~/code/web`, tested with its own.

You tell the lead:

"Let users search their saved routes. The API needs a search endpoint, and the web app needs a search box that uses it."

The lead sees a change across two repos, so it makes two tasks:

- **T-12 `[api]` Add a route search endpoint.**
- **T-13 `[web]` Add a search box for routes**, with `after: T-12`.

T-12 starts. Its worker gets a copy of `~/code/api` under `~/work/.symcc/worktrees/T-12`, on the branch `symcc/<board-name>/T-12`. Before it starts, it reads the API repo's `CLAUDE.md`. It can read the web repo to see how the app calls the API, but it can't change it.

When the worker is done, the API's own tests run. The task merges into the branch you had checked out in `~/code/api`. Say you had an uncommitted edit in a file the task changed: the task waits, tells you the file, and merges by itself once you commit it.

Now T-13 can start. Its worker gets a copy of `~/code/web`, builds the search box against the new endpoint, and runs the web app's tests. It merges into the branch checked out in `~/code/web`.

You talked to one lead, on one board. The two repos never had to sit next to each other on disk.

## What this means

Before, a board was tied to a folder. Now it is tied to you and your work.

One board can hold everything you are building: the API, the web app, the shared library, and the questions and errands in between. The lead plans across all of them. `after` links the steps. Each repo keeps its own tests, its own branch and its own rules. Your real folders are only read, and changed only by a merge you can see.

**One board as the place for all your work, wherever the code lives.**

## Try it

Ask the lead to add your first project, or see [Get started](../get-started.md). What changed in this release is in the [changelog](../../CHANGELOG.md).
