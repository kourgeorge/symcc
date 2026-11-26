# Working on symcc

For people who change symcc itself: where the code is, how to test it, and how to rename the plugin.

## For developers: where the code is

| File or folder | What's in it |
|---|---|
| [`hooks/register.tsx`](../hooks/register.tsx) | Only the wiring: the `on(...)` calls that hand Claude Code events to the modules below |
| [`hooks/core/`](../hooks/core/) | The board as plain data (`board-file.ts`, `task.ts`, `review.ts`, `banner.ts`, `scouts.ts`, ...). No Claude Code calls, so it's easy to test |
| [`hooks/board.ts`](../hooks/board.ts) | A barrel: it only re-exports `hooks/core/*`, so tests and other files import from one place |
| [`hooks/app/`](../hooks/app/) | What symcc does, with no Claude Code in it (it talks to the host through `Host` in [`hooks/host.ts`](../hooks/host.ts)): the lead's tools (`tools.ts`), workers (`workers.ts`), git (`git.ts`), review and merge, scouts, roles (the built-in worker prompts they go in are in [`prompts/`](../prompts/)). Shared state is the `S` object in `state.ts`; the entry points are in `symcc.ts` |
| [`hooks/claude/`](../hooks/claude/) | The Claude Code adapter: the `Host` made from Claude Code's `$` (`host.ts`), the tool registrations, the agent types and the panel atoms (`panel.ts`) |
| [`hooks/claude/ui/`](../hooks/claude/ui/) | The panel pages and the part above the prompt (`list.tsx`, `task-page.tsx`, `scouts-page.tsx`, `settings.tsx`, ...) |
| [`hooks/name.ts`](../hooks/name.ts) | Everything made from the plugin's name |
| [`types/index.d.ts`](../types/index.d.ts) | The shapes of a task, a try, a scout |
| [`tests/`](../tests/) | The tests: one file per area (the board logic, the panel, merging, scouts, stats, and so on) |
| [`hosts/node/`](../hosts/node/) | symcc with no Claude Code: a `Host` made of plain Node/Bun calls (`host.ts`), the running of agents as `claude -p` processes (shared code in [`hooks/process/`](../hooks/process/): `agents.ts`, `claude-runner.ts`, `record.ts`, `system.ts`; the Node version of the system calls is `system.ts` here), and a tiny command line (`main.ts`). See "Running symcc without Claude Code" below |
| [`hooks/opencode/`](../hooks/opencode/), [`opencode/`](../opencode/) | symcc in OpenCode 2.x: the plugin's setup and which copy runs the board (`plugin.ts`), its `Host` (`host.ts`), the edit guard (`guard.ts`), workers and scouts as OpenCode sessions (`agents.ts`), the lead (`lead.ts`), symcc's tools and slash commands (`tools.ts`), the view file for the TUI (`view.ts`), what the TUI draws (`board-view.ts`) and how (`tui.ts`), and the plugin entries OpenCode loads (`opencode/server.ts`, `opencode/tui.ts`). See [Using symcc in OpenCode](clients.md#using-symcc-in-opencode) |

**Where to add a new feature:** pure logic goes in `hooks/core/`; what symcc does goes in `hooks/app/`; Claude Code wiring goes in `hooks/claude/`; panel pages go in `hooks/claude/ui/`. `hooks/app/` and `hooks/core/` must not import `claude-code` or `node:` modules, or name Claude Code's tools: `sh tests/host-free.sh` (run by `sh scripts/typecheck.sh`) checks this.

**Two rules the loader needs:**

- A function that takes `$` and is imported from another file must be a `function` declaration, not an arrow `const`.
- Panel atoms (`read` / `update`) must be used in the file that declares them. From other files, use the `readX` / `updateX` helpers in `hooks/app/state.ts` (they reach the atoms in `hooks/claude/panel.ts` through the `Host`).

## Working on symcc

- **Run the tests:** `claude plugin test .` from the project folder.
- **Where tests live:** in `tests/`, one file per area (for example `board.test.ts` for the board logic and `pane.test.tsx` for the panel).
- **Layout:** `hooks/core/` holds the logic you can test (plain data, no Claude Code calls). `hooks/app/` holds what symcc does, also with no Claude Code. `hooks/claude/` and `hooks/claude/ui/` do the wiring to Claude Code, and `hooks/register.tsx` only connects events. Put new logic in `hooks/core/` when you can. See the code map above.
- **Test the Node host:** `sh scripts/test-node-host.sh` (bun test, not `claude plugin test`: it needs files and processes).
- **Test the OpenCode plugin:** `sh scripts/test-opencode-host.sh` (bun test with a fake OpenCode context; OpenCode itself is not needed).
- **Rebuild the SVG pictures:** the pictures are made by scripts, so don't edit them by hand. The steps are in "How to change it" in [`architecture.md`](architecture.md) (for `architecture.svg`) and in [`demo.md`](demo.md) (for `demo.svg`).

### Running symcc without Claude Code

`hosts/node/` runs the same engine (`hooks/app/` and `hooks/core/`) from a plain command line, with each worker as its own `claude -p` process. It has no board panel, no band and no plan mode. It is a small test of the idea, not a full client. Each command is one session:

```
bun hosts/node/main.ts --root <project> tool settings '{"test_commands":["npm test"]}'
bun hosts/node/main.ts --root <project> add "Say hello" "Create hello.txt" --files hello.txt
bun hosts/node/main.ts --root <project> [--model haiku] tick     # starts ready tasks, waits for their tests and merges
bun hosts/node/main.ts --root <project> board
bun hosts/node/main.ts --root <project> cmd symcc-mode review    # any slash command
```

What the lead would be told is printed after each answer, under `[lead]`. A worker's file list is handed to `claude -p` as its own permission rules (`--permission-mode dontAsk`, with `Edit(...)` and `Write(...)` rules for the task's files, and git writes denied). There is no symcc hook guard there, so those rules are the only check on git. They come from the same deny list as the hook guard (`hooks/core/git-guard.ts`): a worker may commit, merge, cherry-pick, revert, restore, reset, add, rm, bisect and rebase its own branch, while push, fetch, pull, remote, tag, config, stash, worktree, update-ref, symbolic-ref, branch, switch, `rebase -x`/`--exec`/`--update-refs`, `bisect run` and `--autostash` are refused; a checker or scout may not change git at all. Claude Code's rules match the start of a command, not the folder it acts on, so every git call that starts with an option (`git -C <dir> ...`, `git --git-dir=...`, `git -c ...`) is refused, as are `env git`, `xargs git` and the like, `git checkout` as a whole (use `git restore <file>`) and a rebase with more than one word. Reading with git (`status`, `diff`, `log`, `show`, `blame`, `grep`) still works. A command that hides git inside another program (`sh -c "git push"`, a script) is not caught by these rules. The scope check at merge time still stands behind it. A `claude -p` worker has no `ask_owner` tool, and it can't be sent messages while it runs: to stop it, its process is ended. Every running worker, scout or checker process is written to `.symcc/processes.json` (its pid, task, folder and start time) and removed when it ends; on a fresh start symcc stops the ones an earlier run left alive and clears the rest.

## Renaming the plugin

The name comes from one place: `"name"` in `.claude-plugin/plugin.json`. Everything else is
made from it: the data folder (`.<name>/`), task branches (`<name>/T-1`), the commit author,
the agent types (`<name>:worker`, `<name>:scout`), the tool names (`mcp__<name>__add`), the
slash commands (`/<name>`, `/<name>-mode`, `/<name>-help`, ...) and all the text on the board.
To rename it:

1. Change `"name"` in `.claude-plugin/plugin.json`, and `DEFAULT_NAME` in `hooks/name.ts`.
2. Change the name in the `atom({ plugin: ... })` lines near the top of
   `hooks/claude/panel.ts` (`opened`, `tab`, `scout`, `view`) and under `PluginState` in `types/claude.d.ts`. Claude Code reads
   which values a plugin keeps before it runs, so these must be written out as text.
3. Move the old data folder in each project, e.g. `mv .symcc .crew`. Nothing is moved for
   you, and nothing tells you: until you move it, the plugin starts a new, empty board.
4. Update `.gitignore` to ignore the new folder (`.crew/`).

Old task branches keep their old names (`symcc/T-1`); they still work.

### Adding a blog post to the site

Put one Markdown file in `docs/blog/`, named `YYYY-MM-DD-<slug>.md` (the date comes from the file
name). Start it with a `# Title` line; the paragraph right after it is the summary shown in the
blog list and the RSS feed. The site build (`scripts/build-site.ts`) makes `blog/<slug>.html`,
the list `blog/index.html` (newest first) and `blog/rss.xml`, and adds a Blog link to the header.
With no files in `docs/blog/`, there is no Blog link and no blog pages.
