# symcc explainer video: narration script

Length: about 4 to 5 minutes. Read by a text-to-speech voice (Kokoro), so the spoken text has no symbols, file paths or code. Each part has a scene name, the narration, and what the picture shows. The narration is about 750 words.

## Scene 1: The problem (about 10 seconds)

**Narration:**
You ask a coding agent for one thing, and then you wait. New ideas come up, but the agent can only do one thing at a time. So you interrupt it, or you try to remember everything yourself.

**On screen:** A single chat window with a long task running. Small idea notes pile up beside it.

## Scene 2: What symcc is

**Narration:**
symcc fixes that. It is a plugin for Claude Code. You talk to one lead, in your normal chat, and you can also act on the board panel. The lead listens, writes your ideas down on a shared task board, and splits big jobs into small tasks. Then workers pick up the tasks and do them side by side. Each worker has its own copy of your code, so your own branch stays untouched until something is merged. The lead knows the whole picture because you keep talking with it. For each task, it prepares just what that worker needs: what to build, why, which files, and how to check it. So every worker starts focused. The lead also works like a project manager. It sets priorities and order, updates tasks when plans change, and retries or drops them. You talk, and it keeps the plan in order. It also acts like a responsible team lead. It understands what matters, and when something is unclear, it asks you a question. Because the workers do the hands-on work in their own copies, the lead's own conversation stays clean, and it is always free to talk to you.

**On screen:** The architecture picture: you, the lead, the board, and several workers around it. Two short notes appear: each worker gets only what it needs, and the lead keeps the plan.

## Scene 3: The board

**Narration:**
The board is simple. A task is in one of four places. Todo, doing, review, or done. You can see at a glance what is running, what is waiting, and what needs you. And the lead is smart about order. If one task needs the result of another, it waits. If two tasks change the same files, they go one after the other. Everything else runs at the same time. You can change your mind any time. Just tell the lead, do task six first. And you can always see what was done, and why. Every task shows where it came from, with a small symbol: your words, a scout, a worker's report, or the lead. It also keeps the history of its tries, the worker's report, and the time and tokens it cost.

**On screen:** The board panel with four columns. Task cards move from todo to doing. One card shows a small "waits for" label. At the end, one task page shows where it came from, its tries, and its time and tokens.

## Scene 4: Workers

**Narration:**
Each worker gets its own git worktree. That is just a separate folder with its own branch, so workers never step on each other. By default, three workers run at once. Each task gets a worker type that fits it: general, docs, refactor, researcher, security, or tester. You can build the team your project needs by adding or changing role files in the roles folder. A task lists the files it may change. If a worker changes anything else, it is not merged. Before any merge, your tests must pass. If they fail, a new worker sees the error and tries again. You choose how much to trust it. In auto mode, a finished task that passes is merged right away, except tasks the lead marks as needs review, which it picks for you to check yourself. In review mode, you open the task on the board, look at the changes, and approve it there, or reject it with a reason. And if a worker has a question, the task waits under a heading called needs you. You answer, and it goes on.

**On screen:** A worker folder and branch name appearing. A green "tests pass" mark. A diff view with approve and reject. A task card moving to the needs you list.

## Scene 5: Scouts

**Narration:**
Then there are scouts. A scout is a helper that wakes up on a timer. It looks for bugs, missing tests, or old dependencies. It can only read, never change your files. When it finds something, it reports to the lead. The lead turns the finding into a task, and a worker picks it up. This is autonomous coding. It keeps working while you are not there, and you come back to finished, tested work.

**On screen:** The Scouts tab: a scout goes from due now to running. Its report arrives, and a new task appears on the board.

## Scene 6: One request, start to merge

**Narration:**
Let us follow one request. You type, add a search command, and make the errors friendlier. The lead makes three tasks. The search index. The search command, which waits for the index. And the friendlier errors. The index and the errors start now, in parallel. Each worker builds in its own copy, and the tests run. The first task lands in review. You open it on the board, see the changes, and press approve. It merges, and the search command starts. You only talked to the lead once. The rest was a click on the board.

**On screen:** The chat message, then three cards on the board. Two move to doing, one waits. The task opens on the board with its diff, and the approve button is pressed. The card turns to done, and the waiting card starts.

## Scene 7: Get it

**Narration:**
symcc is free and open source, under the MIT license. You need Claude Code and git. Install it as a plugin with one command, and the steps are in the project's page. Set your test command, ask for something, and watch the board. symcc. Many agents, one board. Autonomous coding that keeps working while you are away.

**On screen:** The install command in a terminal, then the logo with the repository link and the line about autonomous coding.

---

## YouTube title

symcc: run a team of coding agents from one chat

## Description

Coding with one agent means doing one thing at a time. symcc turns your Claude Code chat into a team lead for many agents.

You talk to one lead. It keeps a shared task board with todo, doing, review and done. Workers build the tasks side by side, each in its own copy of your code, and your tests must pass before anything is merged.

Each task gets a worker type that fits it, such as docs, refactor, researcher, security or tester, and you can add your own roles. Choose auto mode to merge right away, or review mode to approve every change yourself. If a worker has a question, it waits for you. Scouts check for bugs, missing tests and old dependencies on a timer, and the lead turns what they find into tasks. This is autonomous coding: it keeps working while you are away, and you come back to finished, tested work.

The lead acts like a responsible project manager: it knows what is important, asks you when something is unclear, and can mark a task for you to review even in auto mode. It turns what you say into tasks, sets priorities and order, updates a task when plans change, splits big jobs, and makes tasks wait for each other. Every task shows where it came from, its history of tries, the worker's report, and its time and tokens, so you can always see what was done and why.

Get symcc, read the guide and try it: https://github.com/kourgeorge/symcc

## Tags

symcc, Claude Code, coding agent roles, Claude Code plugin, coding agents, AI agents, parallel agents, AI coding, git worktree, task board, developer tools, autonomous coding, autonomous coding agents, project management, task traceability
