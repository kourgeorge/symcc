# Probe: one workspace board over several repos (what breaks, what must change)

Task T-974, probed on 2026-11-24. Kept as a note by T-975.

## The question

Could one symcc board sit in a workspace folder (a plain folder that is not a git repo
itself) and run tasks in several git repos below it? What breaks today, and what would have
to change to make it work?

## How it was found

A throwaway workspace in /tmp with two small repos below it (`client` and `server`), driven
with the Node CLI (`bun hosts/node/main.ts --root <dir> ...`). The root and guard functions
(`mainRoot`, `projectRoot`, `isWorkerFolder` in hooks/app/store.ts, and hooks/core/path-guard.ts)
were also called straight from small bun scripts. The list of one-repo assumptions comes from
reading the code and from grep over hooks/app. Line numbers are from the code as it was on
2026-11-24 and may have moved since. No real `claude` worker ran, and the Claude Code,
OpenCode and Copilot hosts were not tried (see "What I couldn't check" at the end).

## The answer

"I" below is the agent that did the probe.

**Short answer:** Today symcc treats a workspace folder (not itself a git repo) as one broken project. The board gets made there, but no work ever starts, and the only way forward it offers wrecks the setup. Copies of the repos below it aren't recognised as worker copies either. The path guard is the one big piece that already works, as long as its "project root" stays the board folder. The build fits in about 8 small tasks. The main changes: the git calls (about 110, almost all with no folder given) need a per-project folder, git status is checked per project, and worker copies are recognised by their place under the board's worktrees folder rather than by git.

### 1. What broke in the probe

I made /tmp/t974/ws with two repos below it (client, server, each with one commit) and drove it with the Node CLI (`bun hosts/node/main.ts --root <dir> ...`) from this worktree. Everything is cleaned up now.

1. **Starting in the workspace:** `board` said "no symcc board in this folder · /symcc-init to create one here". Correct, and nothing was written.
2. **`cmd symcc-init`:** made `ws/.symcc/board.json`, `scouts.json` and `scouts/` in the workspace, and added 11 paused scouts.
   - It then told the lead: "This folder has no git repo... Set it up? (git init, a .gitignore, a first commit...)".
   - An added task stays `todo` for ever. pump stops at `gitReady` (hooks/app/workers.ts:116-117).
3. **`tool setup_git` (on a copy of the workspace):** this is dangerous. It ran `git init` in the workspace and committed `client` and `server` as bare repo pointers (mode 160000) with no .gitmodules: a broken half-submodule.
   - A `git worktree add` of that repo has an empty `client/` folder, so a worker would see no code.
   - The cause is `setupGit` in hooks/app/git.ts:140-175 (`git add -A` at the top). This needs a guard even before any multi-repo work.
4. **Worker copies under the workspace board are not recognised.** I ran `git -C client worktree add ws/.symcc/worktrees/T-1` (and T-2 from server). Then I called `mainRoot`, `projectRoot` and `isWorkerFolder` from hooks/app/store.ts in a bun probe:

| folder | mainRoot / projectRoot | isWorkerFolder(dir, mainRoot) | isWorkerFolder(dir, workspace) |
|---|---|---|---|
| ws/.symcc/worktrees/T-1 (copy of client) | the worktree itself | false | true |
| ws/.symcc/worktrees/T-2 (copy of server) | the worktree itself | false | true |
| ws/client/.symcc/worktrees/T-9 (today's layout) | ws/client | true | false |

   - Why: `mainRoot` (store.ts:34-55) trusts git's shared folder, which for a copy of client points to `ws/client/.git`. It then looks for `ws/client/.symcc/worktrees`, which doesn't exist. The cut-at-`/.symcc/worktrees/` fallback (store.ts:52-54) only runs when git can't answer.
   - A session started in T-1 printed "no symcc board in this folder" (symcc off, guard off). The same session in today's layout (T-9) printed "only guards tool calls" (correct).
   - So a plugin copy running inside a workspace worker's folder would not guard, and would even offer `/symcc-init`.
5. **A session started in `ws/client`** says "no board". `projectRoot` never looks above the session folder (store.ts:121-133, T-860). That is fine if the rule is "open the session in the workspace".
6. **Path guard (hooks/core/path-guard.ts):** it works when the root is the workspace, with the worker copy `ws/.symcc/worktrees/T-1`:
   - Editing the copy's own `README.md`: allowed.
   - Editing `ws/client/README.md`, `ws/server/README.md`, `../T-2/README.md` or `.symcc/board.json`: refused.
   - Shell `cat ../../../client/README.md` and `git -C ws/server status`: refused.
   - If the root were only the task's repo, editing `server/README.md` and the board would get through. So the guard's root must stay the board folder.
   - A repo outside the workspace (`/tmp/other`) is only guarded when it is in the root list. `Folders` already accepts a list (path-guard.ts:80).
7. **Task files must be relative to the project's repo, not the workspace.** `blockedEdit('README.md', T-1, ['client/README.md'])` refused the edit, while `['README.md']` allowed it. The lead must write `README.md`, not `client/README.md`.

### 2. Every one-repo assumption, grouped by what it needs

**A. Needs the task's project root** (the git repo the task works in):
- **hooks/app/git.ts**
  - `git`/`gitOk` use S.root when no folder is given (16-23).
  - `currentBranch`, `branchList`, `branchExists`, `homeBranch` (26-51).
  - `probeGit`: S.root, and `show-cdup` must be empty (57-100).
  - `gitReady`/`recheckGit`, and `S.gitState`, which is one value for the whole board (state.ts:150).
  - `prepareWorktree`: `worktree prune`, `rev-parse`, `worktree add` with no folder (238-257).
  - `copyTypes` copies from `${S.root}/.claude-plugin/types` (392).
  - `taskWork` (458), `removeWorktree` (490-491), `deleteMergedBranch` (503-509).
  - `cleanupMerged`: `worktree remove/prune` and `branch --merged` per merge target (517-545).
  - All told, git.ts has 57 git calls, most with no folder given.
- **hooks/app/review.ts** (35 git calls):
  - Rev-parse of the target and merge-base (193-195), and the changed-files log (317).
  - Catch-up and merge-base (415-420).
  - **The merge itself:** `symbolic-ref HEAD` and `moveTarget(args => git($, args))` run in S.root (486-488). They must run in the task's repo, because they update the owner's checked-out files there.
  - Research-notes diff (494), and the `onTarget`/tip checks (521-533).
- **hooks/app/merged.ts** (8 calls, lines 19-81, plus `gitReady` at 100): the "already merged?" checks.
- **hooks/app/workers.ts**
  - pump checks one git state (116-117).
  - `queueWorker` → `prepareWorktree(... intoOf(t0))` (192).
  - Missing target branch → `homeBranch` (318-319).
  - Branch deletes (654, 898, 903, 1446, 1504: `git branch -D` in S.root).
  - `gitReady` on run now (1533), and `cleanupMerged` (1925).
- **hooks/app/tools.ts**
  - `add` sets `merge_into = homeBranch($)` (629). It needs the task's project; `add` needs a `project` input.
  - `merge_into` check with `branchExists`/`branchList` (672-673).
  - `gitReady` on run now (910); `setup_git`.
- **hooks/app/checker.ts:** runs in the task's copy (folder given): nothing to change.
- **hooks/app/cleanup.ts:141:** `alreadyMerged` (via merged.ts).
- **hooks/app/branches.ts** (the Live Branches part, 49, 79, 159, 239, 287): git in S.root and one `S.gitState`. It needs per-project reads, or reads for the shown task's project only.
- **hooks/app/doctor.ts:** `MERGE_HEAD` in S.root (30); `merge-base` and `branch --contains` with no folder (59-61); worktree and branch listing. The doctor must loop over projects.
- **hooks/app/lead.ts:512, 555:** `homeBranch` for the view's branch and `branch_note`. This becomes one branch per project.
- **hooks/app/session-start.ts:142, 37** and **hooks/app/open.ts:37:** git checks at start, watchdog and panel open.

**B. Needs a per-project setting:**
- `test_commands`, `docs_test_commands`: review.ts:433-438 (they already run in the task's copy, so only the list changes). Also used in prompt-values.ts:56, checker.ts:51, the banner (core/banner.ts:420, 524), core/settings.ts:309-310, 390-395, 525-533, and the Settings page (state.ts `PaneView`, lead.ts `publish`, claude/ui/vscode.tsx:117).
- `test_minutes` may also be per project (a guess at what owners want).
- passed-trees (review.ts:466-475): the key holds the tree and the commands, so it is safe with per-project commands.

**C. Board-level, nothing to change** (S.root = the board folder is right):
- The board, parts, events, evidence, org-mem, roles/kinds def-files, scouts files: store.ts `path`, events.ts:18, evidence.ts:27, org-mem.ts, def-files.ts.
- Band and pane titles: above-prompt.tsx:16, open.ts:47, vscode.tsx:114.
- Voice: voice.ts:209-221.
- `host.lead.usage(S.root)`: lead.ts:469, tools.ts:504.
- The Node record file: hosts/node/session.ts:34.
- OpenCode view: hooks/opencode/view.ts:40.
- `worktreeDir` (git.ts:231): stays `<board>/.symcc/worktrees/T-n`. Task ids are unique on the board, so branch names `symcc/T-n` can't clash inside a repo.
- `HostAgentStart.cwd` (hooks/host.ts:69): already one folder per agent, and `files` are relative to it.
- **The path guard** (ask.ts:232, 342-372 and path-guard.ts): keep root = the board folder, and add each project root that lies outside it as a list.

**D. Needs a different rule:**
- `mainRoot`/`projectRoot`/`isWorkerFolder` (store.ts:34-133): a folder under `<X>/.symcc/worktrees/` with `<X>/.symcc/board.json` present should count as a worker of X, whatever git says.
- `setupGit`/`initGitIn` (git.ts:140-215): refuse in a folder that holds repos below it, or turn the step into "add a project".
- Stats (tools.ts:515): `project` is the folder name. Fine, maybe with a per-project split later.
- Scout prompts (scouts.ts:269 `root: S.root`): scouts run in the workspace, which isn't a repo, so their prompt should list the projects and their folders.
- Worker and lead prompts: name the project and say task files are relative to it.

### 3. Proposed build (in order; each depends on the one before)

1. **Worker copies by place.** Change `mainRoot`/`projectRoot` so a folder under `<X>/.symcc/worktrees/` with a board at X belongs to X.
   - Files: hooks/app/store.ts, tests/.
   - Test: fake-host unit tests (worktree of a repo below the board → guard-only start), plus one Node host test making the T-1 layout above.
   - This is safe to do on its own, even before projects exist.
2. **Setup-git guard.** `setup_git` and the Set up git button refuse when folders below hold their own `.git`, and say "this looks like a workspace".
   - Files: hooks/app/git.ts, hooks/core/git-setup.ts, tests/.
   - Test: a Node host test with two nested repos; `setup_git` answers the refusal and runs no `git init`.
3. **Data shape.** Board gets `projects?: { name, root, test_commands?, docs_test_commands? }[]`; each task gets `project?`. Add a `projectOf(b, t)` helper (the root resolved against the board folder), plus `parseBoard` and validation.
   - Files: types/index.d.ts, hooks/core/board-file.ts, hooks/core/task.ts, hooks/board.ts, tests/.
   - Test: pure tests in tests/board*.test.ts.
4. **git goes per project.** `git`/`gitOk` lose the S.root default (a folder must be given). `homeBranch`, `branchList`, `branchExists`, `currentBranch`, `prepareWorktree`, `copyTypes`, `removeWorktree`, `deleteMergedBranch`, `cleanupMerged`, `taskWork` take a repo folder.
   - Every caller in workers.ts, review.ts (including the merge `moveTarget` and `symbolic-ref` in the project), merged.ts, tools.ts, checker.ts, doctor.ts and lead.ts passes `projectOf(t)`.
   - Files: hooks/app/git.ts, workers.ts, review.ts, merged.ts, tools.ts, cleanup.ts, doctor.ts, lead.ts, tests/.
   - Test: typecheck catches every caller once the default is gone. tests/merge.test.ts with a fake `run` that checks `opts.cwd`.
   - This is the biggest task; it could be split into "git helpers + workers" and "review + merged + doctor".
5. **Git state per project.** `S.gitState` becomes a map by project. pump starts a task only when its own project is ready. The banner names the project that isn't ready.
   - Files: hooks/app/state.ts, git.ts, workers.ts, session-start.ts, open.ts, hooks/core/banner.ts, tests/.
   - Test: one project with no commit blocks only its own tasks.
6. **Per-project test commands** in review.ts, prompt-values.ts and checker.ts. The settings tool and Settings page get a project selector or a `projects` setting.
   - Files: hooks/core/settings.ts, hooks/app/tools.ts, lead.ts, state.ts, the Settings UI, site/, docs/guide.md, tests/.
   - Test: a settings test, plus a Node host e2e where client's tests pass and server's fail.
7. **Lead tools and prompts.** `add` takes `project` (required when there are 2+ projects; the lead is told the list). `merge_into` comes from that project. A `project add/remove/list` tool or slash command. Scout and worker prompts name the project.
   - Files: hooks/app/tools.ts, slash-commands.ts, hooks/core/commands.ts, hooks/core/prompts.ts, scouts.ts, tests/.
   - Test: tool tests, plus a Node host e2e with two repos and one task each, both merged into their own main, `after` across them.
8. **Look.** A `[project]` tag on task rows and the task page when there are 2+ projects. Live Branches reads per project. Doctor and cleanup loop over projects.
   - Files: hooks/core/task-list.ts, hooks/claude/ui/*, hooks/opencode/*, branches.ts, doctor.ts, site/, docs/guide.md, tests/.
   - Test: snapshot tests (terminal, desktop, mobile, VS Code), plus `sh tests/build-site.sh`.

**Data migration:** with no `projects`, the board folder is the one project (root "."). Existing one-repo boards then work unchanged, and every task's project reads as that one.
- Because the owner's rule is "no backward compatibility, migrate once", the alternative is a doctor `migrate-data` item (core/old-data.ts `upgradeBoard`). It would write `projects: [{ name: <folder>, root: "." }]` and `project` on every task and archived task once, after which the code can require `projects`.
- Either way, moving a board from a repo up to a workspace is a separate step that moves `.symcc/` and its worktrees, and isn't part of this build.

### 4. For the owner to decide
- **Where the board lives:** in the workspace folder only, or may a repo's existing board grow extra projects (roots like `../server`)? The guard and worktree rules are simplest when every project is below the board folder.
- **How a project is added:** a lead tool or slash command (`/symcc-project add server ./server`), found on its own at `/symcc-init` (repos one level down), or both. Should `/symcc-init` in a folder with repos below it set up a workspace board instead of offering git setup?
- **Explicit migration vs "no `projects` = one project".**
- **One merge line for the whole board** (simple; merges across repos wait for each other) **or one per project.**
- **Whether a session opened inside `~/work/client` should find the workspace board above it.** Today it never looks up (T-860). This needs a rule, because the owner may also have a board in client itself.
- **Settings that may differ per project:** test commands for sure; test_minutes, checker or mode are open.

### 5. Risks
- **Step 4 is wide** (about 110 git calls across git.ts, review.ts, merged.ts and checker.ts). A missed call quietly runs in the workspace, which isn't a repo, and fails. Removing the default folder from `git()` turns each miss into a type error.
- **The merge step's `moveTarget` updates the owner's checked-out files.** Running it in the wrong repo would be the worst bug, so it needs its own test.
- **A repo in two boards** (two workspaces, or a repo board plus a workspace board) could get two `symcc/T-5` branches. This is a guess I didn't test; refusing a project root another board already uses would avoid it.
- **Claude Code subagents** working in `<ws>/.symcc/worktrees/T-n` are inside the session folder, so I expect no permission change. I didn't check Claude Code itself, only the Node CLI and the pure guard functions.
- **Copilot and OpenCode hosts:** I didn't run the probe there. Their guard uses the same engine functions.

### What I couldn't check
- No real `claude` worker ran: the probe stopped at "no git" and at the root and guard functions.
- I didn't test a Claude Code session or the OpenCode/Copilot hosts in a workspace.
- The call counts come from grep over hooks/app; the per-line lists above are the ones I read.

**Next step:** start with task 1 (recognise worker copies by their place) and task 2 (block `setup_git` over nested repos). Both are small, worth doing even if multi-repo waits, and close the two dangers the probe found. Then ask the owner the "where the board lives / how a project is added" questions before task 3.

**Files I read:** hooks/app/store.ts, git.ts, session-start.ts, ask.ts, review.ts, workers.ts, branches.ts, doctor.ts, tools.ts, hooks/core/path-guard.ts, hooks/host.ts, hosts/node/main.ts, hosts/node/session.ts. The probe scripts were in /tmp/t974 (deleted).
