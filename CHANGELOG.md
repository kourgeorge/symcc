# Changelog

When a set of user-facing changes is ready to release, bump the version in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` and add an entry here.

## Unreleased

- New built-in worker role `researcher`: it looks into a question and writes a short note (usually `docs/research/<topic>.md`) instead of changing code. The lead uses it for "find out whether / how ..." tasks.

## 0.3.0 — 2026-11-13

### Traceability
- Every task records who made it, why, and the owner's own words.
- `symcc add` needs a why.
- The board shows a "from:" line for each task.
- Every commit of a task is saved, and labelled with the task, its origin and its why.
- A broken task origin in `board.json` no longer breaks the board.

### Board panel
- The board list is one list: active work first, with Done, Dropped and Backlog folded. A status strip and richer task rows show more at a glance.
- The task page has clearer details and better colors.
- Key options are never hidden on a narrow panel.

### Scouts
- Stronger built-in rules, so scouts report real, checked issues.
- Each scout's last run time and last report are kept across restarts.
- A scout can be paused and resumed. The scouts list shows a state icon for each.
- `every_minutes: 0` means the scout runs only on demand.
- New example scout: secrets that could end up in git.

### Control
- `/symcc-off` and `/symcc-on` turn symcc off and on. Claude goes back to normal while it is off.
- A worker is stopped when another task's change to symcc itself is merged.
- Plugin messages to the lead are clearer: "Board update", with an instruction that is not in the owner's voice.

### Workers and roles
- The built-in roles are now general, docs, refactor, security and tester (backend and frontend are gone; tests is now tester). Old tasks keep their stored role; when started, tests runs as tester and backend/frontend as general, with a history line.

### Code
- The code is split into modules (`hooks/core/`, `hooks/plugin/`, `hooks/plugin/ui/`). No behaviour change.

### Docs
- Wording: you are the owner (you direct), Claude is the lead.
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
