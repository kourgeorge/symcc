<p align="center">
  <img src="docs/logo.svg" alt="symcc: run a team of coding agents from one chat" width="760">
</p>

<p align="center">
  <b>symcc turns your coding agent into an agent organization you run by talking to it: a lead, workers in their own copies of the code, scouts and a checker. Every change is checked before it counts.</b>
</p>

<p align="center">
  <b>Website and docs: <a href="https://kourgeorge.github.io/symcc/">https://kourgeorge.github.io/symcc/</a></b>
</p>

<p align="center">
  <a href=".claude-plugin/plugin.json"><img src="https://img.shields.io/github/package-json/v/kourgeorge/symcc?filename=.claude-plugin%2Fplugin.json&color=blue" alt="version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
</p>

It works in Claude Code, OpenCode, GitHub Copilot CLI, and VS Code or Cursor.

<p align="center">
  <img src="docs/demo.svg" alt="symcc demo: you talk to the lead, it puts tasks on the board, and workers build them" width="860">
</p>

## Install

You need **git** and one of these programs:

| Program | Install |
|---|---|
| Claude Code | `claude plugin install symcc --marketplace kourgeorge/symcc` |
| OpenCode 2.3+ | `opencode plugin add github:kourgeorge/symcc` |
| Copilot CLI | `copilot plugin marketplace add kourgeorge/symcc` then `copilot plugin install symcc@symcc` (start it with `copilot --experimental`) |
| VS Code or Cursor | Install symcc with one of the above, then the **symcc** extension (`code --install-extension kourgeorge.symcc`) |

Other ways to install, and fixes, are in [Get started](https://kourgeorge.github.io/symcc/get-started.html) and [Clients](https://kourgeorge.github.io/symcc/clients.html).

## Your first task

1. Start your coding agent in your project and type `/symcc-init`. That makes the board.
2. Tell the lead your test command: "set the test command to `npm test`".
3. Ask for something: "Add a dark mode toggle." Then watch the board.

## What makes it different

- **Checked work.** Each worker has its own copy of the code and a list of files it may change. Nothing merges until your tests pass; a checker can try to break each change first.
- **Organizational memory.** Agents suggest short notes about the project, and the lead keeps the useful ones for the next agents.
- **Scouts.** Helpers on a timer look for bugs, missing tests and old packages while you are away. The lead turns what they find into tasks.
- **Works from a chat app.** You can talk to the lead from a chat app, such as Slack through DAM.
- **Several clients.** The same board and lead in Claude Code, OpenCode, Copilot CLI, and VS Code or Cursor.

## Built with symcc

symcc builds itself: 995 tasks merged in 19 days, 915 of them merged on their own, with no review needed. See [Built with symcc](https://kourgeorge.github.io/symcc/built-with-symcc.html).

## Links

- [Get started](https://kourgeorge.github.io/symcc/get-started.html)
- [How it works](https://kourgeorge.github.io/symcc/how-it-works.html)
- [Documentation](https://kourgeorge.github.io/symcc/docs.html)
- [Website](https://kourgeorge.github.io/symcc/)
- [CHANGELOG](CHANGELOG.md)
- [License (MIT)](LICENSE)
