# Changelog

When a set of user-facing changes is ready to release, bump the version in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` and add an entry here.

## Unreleased

### Traceability
- Every task records who made it, why, and the owner's own words.
- `symcc add` needs a why.
- The board shows a "from:" line for each task.

### Code
- The code is split into modules (`hooks/core/`, `hooks/plugin/`, `hooks/plugin/ui/`). No behaviour change.

### Docs
- Guide: a code map and a note on finished workers in Claude Code's agent list.
- README and guide: new text on traceability and observability.
- README: a presentation video, with a GIF preview.
- Slide deck in `docs/slides/symcc.pptx`.
- README: a "Swarm Harness" vision line under the tagline.

## 0.2.0

### Board and tasks
- The board panel opens when the session starts and survives `/clear`.
- Clearer board title, a small banner, and a project folder name in the title.
- Today's tasks show in full; older ones fold by day.
- Tasks / Scouts tabs in the board header.
- New "backlog" status for ideas that never start a worker, shown folded at the top of the list.
- Time and cost for each task.
- Each running task records its session.
- The status line is shorter and shows counts, running and failed task IDs, and the mode.
- A spoken message when a task is done.

### Workers and roles
- Worker roles: role files the lead picks per task, shown on the board.
- Never two workers on one task.
- Workers are named after their task ID, such as "symcc T-33".
- A worker can ask for more files instead of failing on scope.
- A worker fixes merge conflicts instead of failing.
- Failed tests are retried with the test output.
- Workers register first at start, and wait if not ready.
- The lead sets task order and chains tasks that change the same files.

### Review and merging
- One mode setting: off, review or auto.
- Approve or reject finished work, in the board panel or with slash commands.
- Follows the owner's branch instead of always using main.
- Only one session drives the board (leader lock).

### Scouts
- Scouts view in the board panel, and scouts can be edited there.
- Scouts do what their file says, with internet and shell access.

### Settings and commands
- `/symcc-settings` shows and changes all settings inside Claude Code.
- All slash commands start with `symcc`.
- A short command to switch the approval mode.

### Cleanup
- A task's branch and worktree are deleted after it is merged, and old ones are cleaned up.
- Leftover `.tmp` files in `.symcc` are removed.
- Repeated code was tidied in several rounds.
- The plugin name lives in one place.
- Task IDs can be given as a bare number ("3" means T-3).

### Docs
- README rewritten: what symcc lets you do, features table, install steps, a worked example and an animated picture of the team.
- New logo, drawn as a shape.
- A "Working on symcc" section for developers.

### Also
- Work in a folder without git: symcc offers to set up a repo.

## 0.1.0

First version.
