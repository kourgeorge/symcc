# Get started

Install symcc, make your first board, ask for your first task, and learn how to talk to the lead.

## Install

You need Claude Code (built and tested with **2.1.319**; the plugin API is early access and can change) and **git**. There is no build step.

```bash
claude plugin install symcc --marketplace kourgeorge/symcc
```

Other ways (try it from a clone, two steps, update, uninstall) and fixes for common problems are in the [reference](reference.md#install-other-ways-and-fixes).

Using another program? Each has its own steps in [Clients](clients.md#install):

- [Claude Code in VS Code](clients.md#install-in-claude-code-in-vs-code): the same command, then use the Claude Code extension's panel. No symcc extension needed.
- [OpenCode](clients.md#install-in-opencode)
- [Copilot CLI](clients.md#install-in-copilot-cli)
- [The symcc extension for VS Code or Cursor](clients.md#install-the-symcc-extension-in-vs-code-or-cursor), for Cursor's or GitHub Copilot's agents. It is not in the Marketplace yet; the page shows how to build and install it.

## The first board

1. Start Claude Code in your project. In a new project symcc stays off (the line under the prompt says so) until you type `/symcc-init` in the folder you want it in; that creates the board there and opens the panel (run `/symcc` to open it again). With no git in the folder the board says so and has a Set up git button; if git is not installed it shows the install step.
2. **Keep the board local:** `echo ".symcc/" >> .gitignore`
3. **Set your tests:** tell the lead "set the test command to `npm test`". Without one, changes merge without tests.
4. **Optional, a scout:** a new project starts with example scouts, all paused. Try one with `/symcc-scout <name>`. See [Scouts](scouts.md).

## The first task

Ask for something: "Add a dark mode toggle." Then watch the board.

The lead puts it on the board as a task, with the files it may change. A worker builds it in its own folder and branch. When the worker is done, symcc checks the files, runs your tests and merges the change into your branch (or waits for you to approve it, in approve merge mode). [A task's life](how-it-works.md#a-tasks-life) shows each step.

## Talking to the lead

The lead is your normal chat. Say what you want in plain words, at any time, even while workers run:

- "Add a dark mode toggle", or a list of things at once.
- "What's going on?" for a short report.
- "Do T-6 first", "drop T-4", "merge T-3 into `develop`".
- "T-6 should wait for T-5", "T-3 should also handle emails".
- "Pause T-5", "stop everything".
- "Set the test command to `npm test`", "give workers 90 minutes".
- "Approve T-5", "reject T-5: the button should be blue".
- "Stash this idea", "show the backlog", "move T-5 to todo".
- "Use the security role for T-12".

You never have to type a command, but a few things are slash commands: `/symcc` opens the board,
`/symcc-init` creates the board in the current folder, `/symcc-disable` and `/symcc-enable`
switch an existing board off and on, and `/symcc-drive` makes the window you type it in drive
the board (when several windows have the project open). `/symcc-help` lists them all, and the
[reference](reference.md#commands) explains each one.

When the lead needs a decision, it asks briefly in the chat and also puts the question on the board, at the top under **Questions for you**, so it can't scroll away. A worker's question shows its task as waiting, under NEEDS YOU. See [When the lead asks you something](tasks.md#when-the-lead-asks-you-something) and [How the lead talks to you](tasks.md#how-the-lead-talks-to-you).

## Read the documentation

The [documentation](docs.md) has every detail: the board, tasks, scouts, running on its own, clients, troubleshooting and the reference. [How it works](how-it-works.md) explains the parts and their names.
