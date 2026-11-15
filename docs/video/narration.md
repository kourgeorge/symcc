# symcc explainer video: narration script

Length: about 3 to 4 minutes. Read by a text-to-speech voice (Kokoro), so the spoken text has no symbols, file paths or code. Each part has a scene name, the narration, and what the picture shows. The narration is about 520 words.

## Scene 1: The problem (about 10 seconds)

**Narration:**
You ask a coding agent for one thing, and then you wait. New ideas come up, but the agent can only do one thing at a time. So you interrupt it, or you try to remember everything yourself.

**On screen:** A single chat window with a long task running. Small idea notes pile up beside it.

## Scene 2: What symcc is

**Narration:**
symcc fixes that. It is a plugin for Claude Code. You talk to one lead, in your normal chat. The lead listens, writes your ideas down on a shared task board, and splits big jobs into small tasks. Then workers pick up the tasks and do them side by side. Each worker has its own copy of your code, so your own branch stays untouched until something is merged.

**On screen:** The architecture picture: you, the lead, the board, and several workers around it.

## Scene 3: The board

**Narration:**
The board is simple. A task is in one of four places. Todo, doing, review, or done. You can see at a glance what is running, what is waiting, and what needs you. And the lead is smart about order. If one task needs the result of another, it waits. If two tasks change the same files, they go one after the other. Everything else runs at the same time. You can change your mind any time. Just say, do task six first.

**On screen:** The board panel with four columns. Task cards move from todo to doing. One card shows a small "waits for" label.

## Scene 4: Workers

**Narration:**
Each worker gets its own git worktree. That is just a separate folder with its own branch, so workers never step on each other. By default, three workers run at once. A task lists the files it may change. If a worker changes anything else, it is not merged. Before any merge, your tests must pass. If they fail, a new worker sees the error and tries again. You choose how much to trust it. In auto mode, a finished task that passes is merged right away. In review mode, you look at the changes first, then approve, or reject with a reason. And if a worker has a question, the task waits under a heading called needs you. You answer, and it goes on.

**On screen:** A worker folder and branch name appearing. A green "tests pass" mark. A diff view with approve and reject. A task card moving to the needs you list.

## Scene 5: Scouts

**Narration:**
Then there are scouts. A scout is a helper that wakes up on a timer. It looks for bugs, missing tests, or old dependencies. It can only read, never change your files. When it finds something, it reports to the lead. The lead turns the finding into a task, and a worker picks it up. So the work keeps moving, even when you step away.

**On screen:** The Scouts tab: a scout goes from due now to running. Its report arrives, and a new task appears on the board.

## Scene 6: One request, start to merge

**Narration:**
Let us follow one request. You type, add a search command, and make the errors friendlier. The lead makes three tasks. The search index. The search command, which waits for the index. And the friendlier errors. The index and the errors start now, in parallel. Each worker builds in its own copy, and the tests run. The first task lands in review. You open it, see the changes, and say, approve task one. It merges, and the search command starts. You never typed a command. You just talked.

**On screen:** The chat message, then three cards on the board. Two move to doing, one waits. A diff opens, then "approve" is typed. The card turns to done, and the waiting card starts.

## Scene 7: Get it

**Narration:**
symcc is free and open source, under the MIT license. You need Claude Code and git. Install it as a plugin with one command, and the steps are in the project's page. Set your test command, ask for something, and watch the board. symcc. Many agents, one board.

**On screen:** The install command in a terminal, then the logo with the repository link.

---

## YouTube title

symcc: run a team of coding agents from one chat

## Description

Coding with one agent means doing one thing at a time. symcc turns your Claude Code chat into a team lead for many agents.

You talk to one lead. It keeps a shared task board with todo, doing, review and done. Workers build the tasks side by side, each in its own copy of your code, and your tests must pass before anything is merged.

Choose auto mode to merge right away, or review mode to approve every change yourself. If a worker has a question, it waits for you. Scouts check for bugs, missing tests and old dependencies on a timer, and the lead turns what they find into tasks.

Get symcc, read the guide and try it: REPO_LINK_HERE

## Tags

symcc, Claude Code, Claude Code plugin, coding agents, AI agents, parallel agents, AI coding, git worktree, task board, developer tools
