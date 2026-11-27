# The symcc workspace model

The plan for symcc as a developer's workspace: one board over several repos, tasks that need
no repo, and work that comes in from outside. The multi-repo work and
the later build tasks follow this page.

Written 2026-11-24 (task T-978). It rests on the owner's decisions of that day and on the
T-974 probe: [Probe: one workspace board over several repos](research/probe-one-workspace-board-over-several-repos-what-breaks-wha.md).
Parts that are built say so. Line numbers and counts come from that probe and
may have moved.

## Words used here

| Word | Meaning |
|---|---|
| Workspace | A folder that holds a symcc board (`.symcc/`), for example `~/repositories`. |
| Project | A git repo in a folder below the workspace, for example `~/repositories/rubrica`. |
| Worker copy | A git worktree (a second checkout of a repo, sharing its history) where one worker does one task, on branch `symcc/T-n`. |
| Lead | The agent you talk to. It plans tasks and runs the board. |
| Scout | An agent that looks for work on a schedule and suggests tasks. |

## The owner's decisions

1. **One workspace per folder, not per machine.** For example `~/repositories` for work and
   another folder for home. The board (`.symcc/`) lives in that folder. The folder itself
   need not be a git repo. One board and one lead per workspace.
2. **Repos stay where they are.** symcc copies nothing and keeps no list of repos. A task
   names its project as the folder below the workspace (for example `rubrica`). The worker
   copy is a git worktree of that repo, on a `symcc/T-n` branch, merged into that repo's own
   branch. symcc stores only optional per-project settings, such as a test command when it
   can't be guessed.
3. **A task need not belong to a project.** Research runs in a plain scratch folder and its
   answer comes back. A note or document is saved in the workspace. Nothing is merged.
4. **Mostly developer work.** symcc is not a to-do app for personal life.
5. **Outside work comes in through scouts.** Email, GitHub issues or Slack each get a scout.
   Whether a scout's findings start on their own or go to the backlog is the scout's existing
   findings setting (`auto` or `backlog`, see [reference](reference.md#settings)). Outside text
   is always data, never instructions. For a task from outside intake, the lead can set
   `needs_review` so the owner approves it before it merges. There is no per-scout review
   setting.
6. **Each repo is tested alone,** with its own test command. There is no cross-repo
   integration test. A change across repos is split into linked tasks with `after`. A break
   between repos is fixed by a normal follow-up task.
7. **Keep symcc's strength at the center:** safe, checked agent work on code (copy, guard,
   checker, tests, merge). Other kinds of work stay light.
8. **Guards have one root: the workspace folder.** A worker may touch only its own copy. The
   T-974 probe showed that the file guard, the shell check and the git guard already work this
   way when their root is the board folder. Worker copies are recognised by where they sit:
   `<workspace>/.symcc/worktrees/T-n`.

## The six parts

| Part | What it is | Notes |
|---|---|---|
| Workspace | One folder, one board, one lead | The board, org-mem, scouts, roles and task types stay board-wide, as today. |
| Projects | The git repos below the workspace | Found by folder name. Only optional settings are stored. |
| Work items | Tasks, each done by an agent | Code task (copy, checks, merge), research or note (no merge). |
| Inputs | Where tasks come from | The owner and the lead, plus scouts for outside sources (decision 5). |
| Knowledge | What is remembered | Org-mem: short notes for agents, curated by the lead (`.symcc/org-mem.md`). Owner notes: answers kept as documents, for people (today "Keep as a note" writes `docs/research/<topic>.md`). |
| Runners and hosts | What runs the agents and shows the board | Claude Code, OpenCode, the Node command line, and the Copilot host (started, not usable yet). See [Engine and clients](architecture.md#engine-and-clients). |

## The rules

These exist today. In the workspace model they stay the same, except where said.

| Rule | What it does | In a workspace |
|---|---|---|
| `priority` | -20 to 19, lower starts first ([reference](reference.md#how-it-works-step-by-step)) | Same, across all projects. |
| `after` | A task starts only when every task it lists is merged | Works across projects. |
| Mode | `auto`, `review`, `paused` ([reference](reference.md#modes)) | Board-wide. The lead can set `needs_review` on tasks that come from outside intake; no new setting. |
| Guard | A worker may change only its own copy and its listed files | Root is the workspace folder. Task files are relative to the project's repo (`README.md`, not `rubrica/README.md`), as the probe found. |
| Checker | An agent that tries to break each change before tests | Same. Runs in the task's copy. |
| Review | The owner approves or rejects before merge | Same. Also used for outside intake. |

## How today's board fits

A board inside one repo today is a workspace whose folder is also its only project. With no
projects named, every task's project is the board folder itself (root `.`), so a one-repo
board keeps working.

The owner's rule is no backward-compatible code, so the probe suggests a one-time data step
(a doctor "migrate data" item) that writes the one project into the board. Moving a board
from a repo up to a workspace folder (moving `.symcc/` and its worktrees) is a separate step,
not part of this build.

## What changes in board.json

| Change | Where | Meaning |
|---|---|---|
| `project` | each task | The folder name below the workspace, for example `rubrica`. Missing: the task needs no repo (research or a note). |
| Per-project settings | board | Only what can't be guessed, for example `test_commands` and `docs_test_commands` for one repo. |

The exact shape (a `projects` list or a settings map by folder name) is left to the data task.
Decision 2 says symcc keeps no repo list, so only projects with settings would be stored.

## Still open

- **How a test command is found per repo.** Guessed from the repo's files, asked once and
  stored, or both. How the guess works is not decided.
- **Whether a session opened inside a repo finds the workspace board above it.** Today symcc
  never looks above the session folder (T-860). A repo may also have its own board, so this
  needs a rule.

## Decided since

- **Where a worker copy lives (2026-11-26).** Under the workspace: `<workspace>/.symcc/worktrees/T-n`. One guard root and
  one place to find copies.

## Left out for now

- Tasks the owner does themselves (not now; every task is done by an agent).
- Due dates, reminders and other scheduling, for tasks, notes or intake (not now).

## Build order

Each step depends on the one before. The probe has the files and tests for each.

1. **Safety fixes first.** Both are worth doing even before projects exist.
   - Recognise worker copies by their place: a folder under `<X>/.symcc/worktrees/` with a
     board at X belongs to X, whatever git says. Today a copy of a repo below the workspace
     is not recognised, so a session in it runs with no guard.
   - Block "Set up git" over a folder of repos. Today it runs `git init` in the workspace and
     commits the repos as broken pointers, so a worker would see empty folders.
2. **Projects (built, T-1137: data and display only; git, merges and tests still run in the board's own repo).** The `project` field on tasks, optional per-project settings, and the lead's
   `add` taking a project.
3. **Per-project git and tests (built, T-1152 to T-1155).** Every git call runs in the task's repo (the probe counts
   about 110), git readiness is checked per project, the merge runs in the task's repo, and
   each repo uses its own test command.
4. **Tasks with no project (not built).** Research and notes that need no repo. Until then (T-1178) a task with no
   project on a workspace board starts nothing and holds back only itself: the board names it, the lead is told once, and the
   lead guide asks for a project on every task there.
5. **Intake.** Scouts for email, GitHub issues and Slack, each with its own start-or-backlog
   choice (the existing findings setting). The lead can set `needs_review` on their tasks.
