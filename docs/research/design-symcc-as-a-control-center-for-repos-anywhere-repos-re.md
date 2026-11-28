# Design: symcc as a control center for repos anywhere (repos remembered on first use)

Task T-1221 (design). Kept as a note by T-1224 so later tasks can read it.

## The question

Should symcc be a control center for repos anywhere on disk, where a repo is added to the board (remembered) the first time a task needs it? What already exists, what is missing, and in what order should it be built?

## How it was found

- Read the code only, in a symcc worktree on branch symcc/T-1221 at commit 8a70e34c. Nothing was changed. File and line numbers below are from that copy and may have moved since.
- Some points were not checked, or are guesses; they are listed at the end.

## Short answer

Yes. Most of what this needs is already on main. Projects are already a name-to-path table, so a repo can be anywhere on disk. The guards already protect every repo in that table. The lead can already add a repo, but only on your yes. Four small things are missing:
1. A board in a plain folder with no projects yet can't start anything.
2. Adding a repo takes extra steps, and nothing proposes its test commands.
3. A project with no test commands quietly runs the board's commands. That is wrong in any other repo.
4. Notes and scouts don't know which repo they belong to.

About 5 small tasks fix this.

## What exists now (checked in code)
- **Project table.** `board.projects` holds `{path?, test_commands?, docs_test_commands?}` per name (`hooks/core/board-file.ts:10`).
  - `repoOf` gives a task's repo: the table path, or the board folder when the task has no project. It throws for a name not in the table (`hooks/app/git.ts:48-54`).
  - `projectGone` gives the sentence for such a name (`git.ts:38-41`).
  - An in-memory copy, `S.projects`, is refreshed on every board load (`hooks/app/store.ts:340,357,629`).
- **Adding a project.** `addProject`, `changeProjectPath` and `removeProject` are in `hooks/app/projects.ts:51-89`. Before saving, `checkRepo` (`projects.ts:20-34`) checks five things:
  - the path is a full path;
  - it exists;
  - it is the repo's top folder;
  - it is not inside `.symcc`;
  - it has commits and no board of its own (T-1218 drops this last rule).

  The lead calls it through `settings project=… path=…`. That call refuses any other setting given with it, test_commands included (`hooks/app/tools.ts:1135-1144`). The lead guide already says "Add one only when the owner says yes" (`tools.ts:399`).
- **Test commands.** `testCommandsOf` and `docsTestCommandsOf` use the project's own commands, else the board's (`board-file.ts:24-34`). They are used in three places:
  - the merge test run (`hooks/app/review.ts:452-453`);
  - the worker's prompt (`hooks/app/prompt-values.ts:67`);
  - the checker's prompt (`hooks/app/checker.ts:62`).

  An empty list already works: the merge says "no test command set" (`review.ts` near line 497). The banner warns "no test command" only when the board and every project have none (`hooks/core/banner.ts:437`). A per-project `docs_test_commands` can be read but no tool sets it (the comment at `board-file.ts:9`; `applyProjectSettings` in `settings.ts:589-600` sets only test_commands).
- **Guards.** `guardedRoots()` is the board folder plus every path in the table (`hooks/app/ask.ts:133-137`). It is used for worker edits (`ask.ts:208`), scout edits (`ask.ts:320`), and worker and checker shell commands and edits (`ask.ts:331-332`). The automatic "allow" for background agents' reads also covers only table paths (`ask.ts:21-30`, T-1200).
- **Scouts.** A scout's `projects:` line limits which repos it looks at. With no line, it gets every project in the table (`hooks/core/scouts.ts:89-93`, passed in `hooks/app/scouts.ts:283`). Scouts run only when `S.gitState === 'ok'` (`app/scouts.ts:273`).
- **Org-mem.** It is one file, `.symcc/org-mem.md`, of at most 60 notes (`core/org-mem.ts:22`), each cut at 100 characters (`:28`). Each note is "- date [topic] text", with one topic (`cleanTopic` allows `a-z 0-9 space · -`, at most 24 characters, `:254`). The whole file goes into every worker, checker and scout prompt through `orgMemText(host)`, which gets no task or project (`app/org-mem.ts:25`; callers `workers.ts:247`, `checker.ts:65`, `scouts.ts:283`).
- **A board in a plain folder.** `gitReady` treats a folder that isn't a repo as fine only when the table has at least one project: `real === 'no-repo' && projectNames().length ? 'ok' : real` (`git.ts:229`). Otherwise:
  - the work loop starts nothing (`workers.ts:122`);
  - scouts don't run;
  - the lead is told "This folder has no git repo… Set it up?" (`setupAskText`, `core/git-setup.ts:141-145`).

  So a fresh `~/symcc` with no projects can't even run an investigation.
- **Live tab and branch line.** Both show only repos with open or just-merged tasks (`app/branches.ts:56-70`, `lead.ts:489-499`). Per-repo git checks are also kept only for repos with open tasks (`forgetClosedRepos`, `git.ts:181-185`).
- **Lead questions.** The lead's pop-up (AskUserQuestion) already becomes a board question Q-n, and whichever gets answered first closes the other (`app/questions.ts:93-120`, T-579). Separately, symcc records your last typed message and checks whether the lead's quote of your request is really in it (`core/origin.ts:168-175`).
- **Repo rules.** A worker on a project is told to read the repo's own CLAUDE.md and AGENTS.md first (`core/prompt-sections.ts:142`).
- **T-1218 is not merged yet.** Branches are still named per task id (`taskBranch` → `S.N.branch(id)`, `git.ts:418`).

## Answers

**1. Repos remembered on first use.**
- **How the lead asks:** one pop-up question, which also lands on the board as a Q-n. For example: "T-? works in ~/code/api, new to this board. Add it as project **api**, tests `npm test`?" with the choices Yes / Yes, no tests / No. On yes, the lead makes one `settings` call, then adds the task.
- **What changes:**
  - `settings` with only a `path` adds the repo, and the name defaults to the folder name.
  - `test_commands` may come in the same call (today that is refused at `tools.ts:1138`).
  - A path already in the table answers with its existing name instead of an error. Today `savePath` returns "already the project 'x'" (`projects.ts:42-43`).
  - Files: `hooks/app/projects.ts` (`addProject`, `savePath`), `hooks/app/tools.ts` (the settings branch, the parameter texts, guide line 399).
- **Two repos with the same folder name:** the second add is refused, and the refusal suggests `<parent folder>-<name>`, for example `work-api`. The lead uses that name and tells you; no extra question. A name that would not pass `isProjectName` gets a cleaned version proposed the same way.
- **Stays:** `checkRepo`, the table, `repoOf`, and the rule that a repo is added only on your yes. symcc can't prove the yes was given. The pop-up answer, plus the record of your last message, is the evidence.

**2. Test commands per repo.**
- **Where the fallback matters (checked):** the merge run, the worker's prompt and the checker's prompt all use it. On a board inside a repo with projects, a project with no commands of its own runs the *board repo's* commands in the other repo. For example, symcc's `claude plugin test .` would run in api. That is wrong. On a control-center board the board's own list is empty, so the fallback gives nothing anyway. So the fallback is either wrong or doing nothing.
- **Change:**
  - `testCommandsOf` returns only the project's own commands for a task that has a project. The board's list stays only for tasks with no project, which run in the board folder.
  - Drop the per-project `docs_test_commands`, which no tool can set (in `ProjectSettings`, the checker at line 429, and `docsTestCommandsOf`).
  - The banner and Settings show a per-project warning: "api: no test command".
  - Files: `hooks/core/board-file.ts`, `hooks/core/banner.ts:357-437`, `hooks/core/settings.ts:494-510,730`, and the test at `tests/projects.test.tsx:184-187`, which expects the fallback.
- **Proposing commands:** no guessing code exists in symcc. The simplest way is for the lead itself to look: package.json `scripts.test`, pytest.ini/pyproject (`pytest`), a Makefile `test:` target, go.mod (`go test ./...`), Cargo.toml, `.claude-plugin/` (`claude plugin test .`). That is a short list in the lead guide, not new code.
- **Your boards:** projects without their own commands would run no tests after this change. The warning shows them; the lead sets their commands once with you.

**3. Org-mem per repo.**
- **Simplest design:** no new field. A note that belongs to one repo gets a topic that starts with the project's name, for example `[api · tests]`. `orgMemText(host, project)` then gives:
  - a worker or checker on api: the general notes plus api's;
  - an agent with no project: every note;
  - a scout: the general notes plus its repos' notes.

  Project names can hold `.`, `_` and capitals, which topics can't. Match on the name lowercased, with `.` and `_` turned into `-`.
- **Files:** `hooks/core/org-mem.ts` (a filter function), `hooks/app/org-mem.ts` (`orgMemText`), its callers (`workers.ts:247`, `checker.ts:65`, `scouts.ts:283`), and the lead guide line about org-mem (`tools.ts:441`).
- **Prompt cost:** today the most is about 60 × ~125 characters, roughly 7.5 KB or ~1.9k tokens; the token figure is my estimate. The tag adds about 6 characters per note, at most ~90 tokens in total. Filtering removes other repos' notes, so each agent's prompt gets smaller, not bigger. The 60-note limit stays shared. A separate limit per repo can wait until the file really fills up.

**4. Scouts by default.** With repos added on first use, the table keeps growing. A scout that reads every repo on every run gets slower and costs more tokens. Change the default, for a scout with no `projects:` line, to repos with an open task or a task finished recently. 14 days is a guess at a good window. With none, the scout looks at the board folder only. A `projects:` line still overrides this.
- **Files:** `hooks/core/scouts.ts` (`scoutProjectTable` takes the active list), `hooks/app/scouts.ts:283`, and the `projects` parameter text in `tools.ts:494` ("none or empty means every project").

**5. Guards.** They protect every repo in the table now (checked). Two gaps:
- A **removed** project is no longer protected.
- A repo **not yet added** has the same protection as /tmp, which is none. A worker on api could edit a file in `~/code/web` if web was never added. Git writes there are still refused, because the git guard allows them only in the worker's own folder (the T-1183 note on `gitPlaceOk`).

First-use adding doesn't make this worse than today, but it does mean "every repo ever added" is not "every repo". The stronger fix would be to refuse any write into a folder that has a `.git` above it, other than the worker's own copy and an errand's named folders. It costs a few file lookups per edit, and shell commands are harder to cover. That cost is a guess; I didn't measure it. My advice is not to build it now, and to keep remove as something only you ask for.

**6. Where the board lives.**
- **Inside a repo:** works today. Tasks with no project run in that repo with the board's test commands, and other repos are projects. After T-1218 a repo with its own board can also be a project on another board. Different board names give different branch names, and the merge refuses to overwrite a branch that moved, so two boards working on one repo don't lose work.
- **Plain folder (`~/symcc`):** this breaks today until the first project exists (see "A board in a plain folder" above). The fix is in `gitReady` (`git.ts:229`): a folder that isn't a repo always counts as a control center, even with no projects. The "set up git?" message is then sent only for a repo with no commits, and `setup_git` stays for when you ask for it. Also, `changeNeedsProject` (`git.ts:269-270`) returns '' when there are no projects, so a change task with no project would be let in. On a control center it must always be refused: "name the repo it changes".
- **How you start one:** `mkdir ~/symcc`, open Claude Code there, and turn symcc on as in any new folder. I didn't trace the exact first-start steps (`session-start.ts:87`, `S.fresh`).

**7. Size.** Nothing here is needed now.
- `board.json` grows ~100-200 bytes per repo. 100 repos is about 20 KB, far under the 4 MiB limit.
- The Live tab and branch line grow with active repos, not all repos.
- What does grow with all repos: the Settings list (one line each), the refusal text that lists project names, the plain-folder worker prompt line listing every project path (`workers.ts:245`, ~60 characters each), and scout prompts (handled by #4).
- Each guarded edit or shell command looks up the real path of every table path (`ask.ts:144-148`, `realEdit` at 117-127). That grows with the table. A guess: it only matters past dozens of repos. Table paths are already stored as real paths, so it could be trimmed later.

**8. What to drop.**
- The test-command fallback, and the per-project `docs_test_commands` (#2).
- The `projectNames().length` condition in `gitReady` (#6).
- The "repo with its own board" rule in `checkRepo` (`projects.ts:32`). T-1218 is already removing it.
- The ban on giving other settings together with `path`, so test_commands can come in the same call (`tools.ts:1138`).
- Possibly `noProjectText` and `S.toldLoose` (`git.ts:281-288`), which exist for old change tasks with no project (T-1178). With your rule of no backward compatibility, a one-time data fix could replace them. I didn't check how often it still fires.
- Keep `holdsRepos` and `workspaceText` (`git.ts:290-301,319`). They stop `setup_git` from running `git init` over a folder full of repos.

## Recommended plan (in order)
1. **A control center starts in a plain folder with no projects.**
   - Files: `hooks/app/git.ts` (`gitReady`, `changeNeedsProject`), `hooks/app/scouts.ts`, `tests/` (`setup-git.test.ts`, `task-project.test.ts`).
   - Test (fake host): a /tmp folder with no .git and no projects runs an investigation in a plain folder, the lead gets no "set up git" message, and a change task with no project is refused.
2. **Add a repo on first use in one call.**
   - Files: `hooks/app/projects.ts`, `hooks/app/tools.ts` (settings branch, guide lines 399 and 429), `tests/projects-manage.test.ts`, `docs/reference.md`, `docs/workspace-model.md`.
   - Test: a path alone takes the folder name; a clashing folder name is refused with a `<parent>-<name>` suggestion; path plus test_commands are saved together; a path already added answers with its name.
3. **No fallback to the board's test commands, and a warning per project.** It touches the banner and Settings, so per your notes it also lists `site/` and `docs/guide.md`.
   - Files: `hooks/core/board-file.ts`, `hooks/core/banner.ts`, `hooks/core/settings.ts`, `tests/projects.test.tsx`, `tests/workspace-banner.test.tsx`.
   - Test: a project without commands runs none in the merge, the board's commands still run for a task with no project, and the banner shows "api: no test command".
4. **Repo notes in org-mem by topic.**
   - Files: `hooks/core/org-mem.ts`, `hooks/app/org-mem.ts`, `hooks/app/workers.ts`, `hooks/app/checker.ts`, `hooks/app/scouts.ts`, `hooks/app/tools.ts`, `tests/` (org-mem tests).
   - Test: an api worker's prompt has the general and `api ·` notes but not `web ·` notes; an agent with no project gets all of them.
5. **Scouts default to active repos.**
   - Files: `hooks/core/scouts.ts`, `hooks/app/scouts.ts`, `hooks/app/tools.ts`, `tests/scout-projects.test.ts`.
   - Test: with no `projects:` line, the prompt lists only repos with open or recent tasks; a `projects:` line still wins.

Tasks 1 and 2 both touch `git.ts` and `tools.ts` and T-1218's area. Check T-1218's real changes before linking them with `after`. The unknown-repo guard (#5 above) can be a later backlog idea.

## Not checked, or guesses
- The 14-day window, the ~4 characters per token estimate, and the cost of extra guard lookups.
- How you start a new board in a plain folder, step by step (I didn't trace `session-start.ts`).
- How often `noProjectText` still fires on your boards. I didn't read the main project's `board.json`, to keep out of the main folder.
- What the lead sees about projects at session start. I found the list only in the settings listing and in refusal texts.
- How the OpenCode and Node hosts behave on a board in a plain folder with no projects.

**Next step:** add task 1 (a control center starts with no projects) and task 2 (one-call add on first use). Together they make "open symcc in ~/symcc and name a repo" work from start to finish.
