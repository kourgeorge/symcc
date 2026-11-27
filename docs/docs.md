# Documentation

Every detail of symcc, one topic per page. New here? Start with [Get started](get-started.md) and [How it works](how-it-works.md).

## Using symcc

- [The board](board.md): the panel, live status, the task page, tracing a task back, and where to see what a task did.
- [Tasks](tasks.md): states and the merge queue, what happens when a worker finishes, approval before merge, investigations and errands, task types and worker roles.
- [Scouts](scouts.md): agents that look for work on a timer; running them on demand and pausing them.
- [Running on its own](running-on-its-own.md): which branch work goes into, keeping work moving, and stats on time and tokens.
- [Clients](clients.md): Claude Code, VS Code, OpenCode, Copilot CLI, the VS Code and Cursor extension, and chat apps.
- [Troubleshooting](troubleshooting.md): disabling symcc, where everything lives, and good to know (with the slow-step log).
- [Reference](reference.md): every command, setting, file and board key.
- [What's new](../CHANGELOG.md): every release, newest first, as a timeline.

## For contributors

- [Architecture](architecture.md): where the code is, the engine and the clients and the rule between them, running the tests, renaming the plugin, and the team picture.
- [Workspace design](workspace-model.md): the design for one board over several repos.
- [Research notes](research/index.md): answers from investigation tasks, kept as notes, newest first.
- [The demo](demo.md): how the demo picture is made.
- [Releasing](releasing.md): the two release tracks (the plugin and the VS Code and Cursor extension) and the protocol number.
- [Editor pictures](editor-pictures.md): how the `editor-*.svg` pictures of the extension are made.
- [Built with symcc](built-with-symcc.md): symcc's own numbers: tasks, tries, tokens and what scouts found. Made by `bun scripts/site-stats.ts`.
