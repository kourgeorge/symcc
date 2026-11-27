# Research: projects are repo paths anywhere on disk

Task T-1183 (design). Kept as a note by T-1184 so later tasks can read it.

## The question

Can a symcc project be a repo at any path on disk, not only a folder directly below the board folder? What has to change, what is the safe design, and in what order should it be built?

## How it was found

- Read the code in a symcc worktree (file and line numbers below are from that time and may have moved since).
- Tried git by hand in /tmp: a repo outside the board folder, with a worker copy made inside `<board>/.symcc/worktrees/`. The /tmp files were deleted afterwards.
- Some points were not checked; they are listed at the end.

## Short answer
Yes, it works, and it is a small change. Git already lets one repo have a worker copy anywhere: I tried it in /tmp with a repo outside the board folder. Almost all of symcc's git work already goes through `repoOf(t)`. Only two things need real work:
1. Turn "folder name below the board" into "name → path" from a table.
2. Give the guards the project paths as well as the board folder. **This is a real safety gap.** Today the guards only protect what is inside the board folder. A repo outside it would be treated like /tmp, so a worker or scout could edit the owner's real files there.

## What was checked in the code
- `hooks/app/git.ts:29-35` `repoOf`: returns `${S.root}/${p}`, and the name must pass `isProjectName` (`hooks/core/board-file.ts:16`). This is the only place a task's repo is decided.
- `hooks/app/git.ts:254-260` `projectNames`: scans the folders directly below the board for `.git`. Nothing is stored.
- `hooks/core/board-file.ts:10,79,419`: `board.projects` already exists as `Record<name, {test_commands?, docs_test_commands?}>`. The per-project test commands are already there (`testCommandsOf`, lines 25-34).
- Worker copy: `hooks/app/git.ts:373` puts it at `<board>/.symcc/worktrees/T-n`. `prepareWorktree` (386-399) runs `git worktree add` with cwd = `repoOf(t)`. `removeWorktree` (634-637) and `cleanupMerged` (683-689) remove and prune in `repoOf(t)`. All of this already works for any path.
- "Worker copies recognised by place": `hooks/app/store.ts:37-41,93-110` `boardAbove`. It reads only the path `<X>/.symcc/worktrees/<id>` and checks that X has a board. It never asks git, so it still holds when the repo is elsewhere.
- Git guard: `hooks/core/git-guard.ts:544-554` `gitPlaceOk` only allows git writes in the worker's own folder or /tmp. `cd ~/code/api && git commit` is already refused. This keeps holding.
- **Path guard gap:**
  - `hooks/app/ask.ts:178-181` (worker edits), `300-305` `outsideOwnFolder` (worker and checker shell and edits) and `290-292` `scoutCheck` (scout edits) all pass only `S.root` as the protected root.
  - `editOutsideFolder` (`hooks/core/path-guard.ts:104-112`) and `editInProject` (`path-guard.ts:213-218`) return "allowed" for paths outside the root, which is how /tmp works.
  - So `~/code/api/README.md` would not be refused today.
  - `Folders` already accepts a list (`path-guard.ts:78-84`), so the fix is to pass `[S.root, ...projectPaths]`.
  - OpenCode's guard uses the same checks (`hooks/opencode/guard.ts` calls `toolCheck`), so one fix covers both.
  - The Node host only allows edits on the file list it is given (`hooks/process/claude-runner.ts:20-43`). I did not read its shell rules closely.
- Merge: `hooks/app/review.ts:580-588` moves the branch in `repo` and updates the owner's checked-out files with `moveTarget` (`hooks/core/review.ts:340-351`). It works by compare-and-swap and never writes over the owner's uncommitted, untracked or ignored files; instead the task waits (`merge_wait`, `workers.ts:1427-1439`, per repo). Nothing in this assumes the repo is inside the board.
- The merge line is still one per board (`hooks/app/merge-line.ts:7,190`; T-1181 is queued to make it one per repo). If T-1181 keys the line by `repoOf(t)`, outside repos need nothing more.

## What the experiment showed (/tmp, deleted afterwards)
- `git worktree add` run from an outside repo into `<board>/.symcc/worktrees/T-1` works.
- The copy's `.git` file points to `<repo>/.git/worktrees/T-1`, and the repo records the copy's real path (`/private/tmp/...`). `git worktree list` in the outside repo shows the symcc copies.
- From inside the copy, `--git-common-dir` is the outside repo's `.git` and `--show-toplevel` is the copy itself.
- A fast-forward of `main` in the outside repo kept the owner's untracked file.
- After the copy was deleted by hand, the outside repo marked it "prunable", and `git worktree prune` cleaned it up.
- If the board folder is moved, every copy becomes "prunable" in its repo. A prune there would cut the copy loose; `git worktree repair` would fix it. This is not new (it is the same today) but is worth knowing.

## Design
**1. The project table.** Add `path` to `board.projects`, for example:
`projects: { api: { path: "/Users/o/code/api", test_commands: [...] } }`
- The path is stored as the real path, absolute, with `~` expanded. git prints real paths, and string comparisons need them to match.
- The table is the only list: the folder scan goes away.
- `repoOf(t)` returns the entry's `path`. `repoOf` is sync and only gets `t`, so the table needs a copy in memory (`S.projects`) that is refreshed whenever the board loads (my suggestion; not built anywhere yet).
- A task whose project is not in the table can't start, and the board says so.
- **Adding:** the lead calls something like `settings project=api path=~/code/api` only after the owner says yes in chat. symcc checks:
  - the path exists and is a repo's top folder (`rev-parse --show-toplevel` equals the real path), with commits;
  - it is not inside `.symcc/`;
  - the name is free and passes `isProjectName`;
  - the repo has no symcc board of its own (`.symcc/board.json`).
- **Shown:** the settings page lists `name → path` plus its test commands (it already lists test commands, `hooks/core/settings.ts:498,724`). Per the lead's notes, look changes also need site/ and docs/guide.md.
- **Changing a path:** allowed only while no open task of that project has a copy or branch (the same rule as `tools.ts:804-806`).
- **Removing:** refused while open tasks use the project.
- **Old boards:** a one-time data step for your boards writes each folder below the board that holds `.git` into the table as `<root>/<name>`. A board inside one repo needs nothing: tasks with no project keep using the board folder (T-1182's business).

**2. Worker copies.** No change to where they live or how they are made. These places must stop assuming "inside the board":
- `git.ts:35` `repoOf`: use the path from the table.
- `git.ts:155` `forgetClosedRepos`, `git.ts:163` `checkProjects`, `lead.ts:491` `branchLine` and `doctor.ts:40` `repoList` each build `${S.root}/${p}`: use `repoOf({project: p})`.
- `git.ts:134` `projectNotes`: `r.slice(S.root.length+1)` gets the name from the path, which breaks for outside paths. Keep a path → name map instead.
- `git.ts:254-265` `projectNames` and `projectRefusal`: read the table; reword "a folder below the board folder".
- `git.ts:200` (gitReady: "no-repo + projects → ok"): count the table instead of the scan.
- `git.ts:203,236-247,277` `holdsRepos`/`workspaceText`: remove. "Can't run a board over several repos yet" is no longer true; replace it with "add a project".
- `board-file.ts:13-16,419`: make `isProjectName` a plain name rule only, and check `path` in the validator.
- `tools.ts:397` (lead guide) and `tools.ts:468` (the `project` parameter text): wording.
- `tools.ts:651-661` `projectIn` and `tools.ts:1117-1121` (settings with a project): read the table; add the path option.
- `core/scouts.ts:528,538`: the scout prompt builds `root/name` paths; list `name: path` instead.
- `prompt-sections.ts:141-142` (worker "your folder is a copy of that repo"): unchanged.
- `store.ts:197` `fileName` and `doctor.ts:104` `shown`: display only; outside paths just show in full.
- **Guards** (`ask.ts:178-181`, `290-292`, `300-305`): pass every project path as a protected root, both its stored and real names (`bothNames` already does the real-name part). Without this, outside repos are unprotected.

**3. Merging into an outside repo.** It works the same as now:
- The task merges into the branch checked out in that repo when it was added (`homeBranch(repoOf)`).
- The owner's uncommitted files there block only the files the merge touches, and the task waits.
- An open Claude session in that repo is just "the owner editing": the merge never writes over their uncommitted changes.
- The per-repo merge line from T-1181 works if it is keyed by `repoOf(t)`.

Two risks remain:
- (a) Another board, or you by hand, can move the branch at the same time. Compare-and-swap makes symcc's merge fail cleanly rather than lose work.
- (b) **Branch name clash.** Two boards that share a repo would both make `symcc/T-5`. `prepareWorktree` (`git.ts:391-393`) reuses a branch that already exists, so a task could pick up another board's work. That is why "refuse a repo with its own board" is part of adding. Two workspace boards naming the same repo is not caught by that check (open point).

**4. Safety.**
- The first use of a repo needs your yes: the lead adds it to the table only after you agree.
- symcc never runs git outside the table (every task's repo comes from `repoOf`, which throws for unknown names).
- The guards cover every repo in the table.

What a lead could still do wrong:
- add a repo without asking (the tool can't tell; the lead guide must say "only on the owner's yes", like doctor fix);
- point a name at the wrong repo, such as your home folder or a parent folder (the "top of a repo" check stops parents);
- add a repo that holds secrets (the existing secret check at merge time still runs).

**5. Scouts.**
- A scout can name its repos in its front matter, for example `projects: api, web`; with none, it gets every project in the table. This is a new field on `ScoutDef` (`core/scouts.ts:40`).
- The prompt gives `name: path` for each, and the scout suggests tasks with that project name.
- Scouts run in the board folder and read outside repos by full path.
- Per-project test commands already exist (`applyProjectSettings`, `settings.ts:586`); nothing new.

**6. Claude Code.**
- Workers and checkers still run in `<board>/.symcc/worktrees/T-n`, inside the session's folder. So there is no new trust prompt, and the plugin and hooks work as today.
- **Observed:** the T-1183 session (a worker in a symcc worktree) got the board folder's `CLAUDE.md` (`<board>/CLAUDE.md`), not the worktree's. So an outside repo's `CLAUDE.md` will most likely not be loaded on its own.
- The types mention a nested-CLAUDE.md walk when a file is read (`.claude-plugin/types/claude-code/index.d.ts:3492-3497`), which may pull in the copy's own CLAUDE.md. **Not confirmed.** A safe fix: for a task with a project, the worker prompt says "first read CLAUDE.md / AGENTS.md at the top of your folder". The same applies to today's below-folder projects.
- **Not checked:** whether Claude Code asks permission when a background scout reads files outside the session folder (an outside repo). If it does, the scout would stall. This needs a short probe before scouts get outside repos.

**7. What gets simpler.**
- Removed: the folder scan (`projectNames`), `holdsRepos`, `workspaceText` ("several repos yet") and its banner/OpenCode branch (`hooks/opencode/board-view.ts:586`, `git_workspace` in `state.ts`/`lead.ts`), and the "folder below the board" wording in texts and docs/workspace-model.md (decision 2, "keeps no list of repos", is reversed).
- No longer needed: "repos at any depth" and multi-root, because a path can point anywhere.
- The "does a session in a repo find the workspace board above it" question stays open, but matters less.

## Build plan (in order)
1. **Project table + repoOf.**
   - Files: `hooks/core/board-file.ts`, `hooks/core/old-data.ts` (the one-time move of your boards), `hooks/app/git.ts`, `hooks/app/store.ts` (S.projects on load), `hooks/app/state.ts`, `hooks/app/lead.ts`, `hooks/app/doctor.ts`, `hooks/app/tools.ts`, `tests/`.
   - Tests: `repoOf` gives the table path, an unknown name is refused, the migration writes the paths, a task's worktree is made in a /tmp repo outside the board.
   - Still no way to add outside paths in this step.
2. **Guards cover every project path.**
   - Files: `hooks/app/ask.ts`, `hooks/core/path-guard.ts` (texts), `tests/` (and `hooks/opencode/tests/`).
   - Tests: a worker's edit of `<outside repo>/README.md` is refused, a shell command naming it is refused, a scout's edit of it is refused, and the worker's own copy is still allowed.
3. **Lead adds, changes and removes a project (only on your yes), and the settings page shows it.**
   - Files: `hooks/app/tools.ts`, `hooks/core/settings.ts`, the board pages (terminal, VS Code, OpenCode), `site/`, `docs/guide.md`, `docs/reference.md`, `docs/workspace-model.md`, `tests/`.
   - Tests: the checks (not a repo top, inside .symcc, has its own board, name taken), and removal refused while open tasks use it.
   - Removes `holdsRepos`/`workspaceText`.
4. **Scouts and the worker prompt.**
   - Files: `hooks/core/scouts.ts`, `hooks/app/scouts.ts`, `hooks/core/prompt-sections.ts`, `tests/`.
   - Tests: the scout prompt lists `name: path`, the `projects:` front matter limits the list, and the worker prompt asks it to read CLAUDE.md/AGENTS.md.
   - Before this step: a short probe of whether a background scout gets a permission prompt when reading an outside path in Claude Code.

Step 2 must merge before step 3. Steps 1 and 2 both touch the git and project code that T-1181 and T-1182 also touch; check their real diffs before chaining with `after`.

## Not checked, or guesses
- Whether a worker's context ever loads the copy's own CLAUDE.md (guess: not up front).
- Claude Code read permissions outside the session folder for scouts.
- The Node host's shell rules against outside paths.
- How two workspace boards sharing one repo should be caught.
- The `S.projects` copy in memory is my design suggestion, not existing code.

## Recommended next step
Add step 1 (table + `repoOf` + migration) and step 2 (guards) as tasks, with step 2 required before any outside path can be added. Add the short Claude Code permission probe as an investigation next to them.
