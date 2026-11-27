# Research notes

Answers from symcc investigation tasks, kept as notes. Some are about ideas that were never built, or were built differently. Newest first. The site build adds any note missing from this list at the top, with its first long paragraph as the summary; write a better line by hand when you can.

- [Research: can the editor extension use an installed symcc, with serve running from one built file?](editor-extension.md): whether the VS Code and Cursor extension can run the symcc a harness installed, with serve built into one file.
- [Design: symcc as a general command center, not just for code](design-symcc-as-a-general-command-center-not-just-for-code.md): how symcc could handle work that isn't only code changes, and the smallest steps to get there.
- [Investigate: working with symcc from a plain chat (no panel)](investigate-working-with-symcc-from-a-plain-chat-no-panel-wh.md): what reads well and what breaks when the owner uses symcc from Telegram, Slack, Discord or iMessage.
- [Investigation: trust numbers on the board](investigation-trust-numbers-on-the-board-first-try-rate-toke.md): showing the first-try merge rate, tokens per merged task and how often the owner steps in.
- [Probe: one workspace board over several repos](probe-one-workspace-board-over-several-repos-what-breaks-wha.md): what breaks and what must change for one board over several git repos.
- [Research: a small Copilot CLI extension for the 4 open host questions](spike-test-a-small-copilot-cli-extension-for-the-4-open-host.md): whether a Copilot CLI extension can do the four things a symcc host needs.
- [DAM Slack probe: a checklist to run once](dam-slack-probe.md): running symcc under DAM, where each agent lives in its own small VM and you talk to it in Slack.
- [Research: why the stored board view is about 3x bigger than view.json](find-why-the-stored-board-view-is-about-3x-bigger-than-view.md): why the Claude Code panel's stored view was 3 times the size of OpenCode's view file.
- [Probe: can a starter agent or a self-answered turn start agents with all hooks?](probe-can-a-starter-agent-or-a-self-answered-turn-start-agen.md): two ways to start agents with all of symcc's hooks without a model request from the lead.
- [Can symcc start agents (workers, checkers, scouts) without waking the lead each time?](can-symcc-start-agents-workers-checkers-scouts-without-wakin.md): ways to start agents without a lead turn.
- [Which of symcc's saved data is redundant or messy, and how to clean it up](which-of-symcc-s-saved-data-is-redundant-or-messy-and-how-to.md): a review of the files in the data folder and a clean-up plan.
- [Design: standalone symcc (engine + agent runners + TUI)](standalone-app.md): growing a standalone symcc out of the Node host step by step, not as a rewrite.
- [How stages and waits are worked out today, and one shared `taskPhase`](investigation-map-how-stages-and-waits-are-worked-out-today.md): a map of where each view works out a task's stage, and one shared function for it.
- [Idea: answer the lead's pop-up question from the board](idea-answer-the-lead-s-pop-up-question-from-the-board-tool-c.md): whether the board can answer the lead's AskUserQuestion pop-up and close it.
- [How much board page logic is duplicated between Claude Code and OpenCode?](investigation-how-much-board-page-logic-is-duplicated-betwee.md): what is copied between the clients and what it takes to share it.
- [One merge line for the whole project](merge-line.md): the plan for one merge queue, built in T-546 to T-551.
- [Research: a short notice channel on the board](research-a-short-notice-channel-on-the-board-where-workers-p.md): whether workers should post short notes on the board for other workers to read.
- [Organizational learning for symcc](investigate-organizational-learning-for-symcc-learning-from.md): learning from the owner, from how the system behaves, and from workers' and scouts' work.
- [Research: how does rossoctl/moca compare with symcc?](research-how-does-rossoctl-moca-compare-with-symcc-positioni.md): positioning, goals and design side by side.
- [Research: can symcc work inside an IDE like VS Code, and how?](research-can-symcc-work-inside-an-ide-like-vs-code-and-how.md): the ways symcc could run in VS Code.
- [Probe: does a lead wake-up turn reach symcc's turn-end hook?](probe-does-a-lead-wake-up-turn-reach-symcc-s-turn-end-hook-a.md): whether a turn started by a timer gets symcc's hooks, and whether workers started there do.
- [OpenCode spike: can a small symcc plugin refuse edits, start a worker, wake the lead and show a panel?](opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md): the first test of symcc in OpenCode.
- [Research: can symcc start each worker in a sandbox?](research-can-symcc-start-each-worker-in-a-sandbox-that-only.md): whether a worker can be kept from writing outside its own worktree folder.
- [Research: is siteboon/claudecodeui a good host for symcc?](research-is-siteboon-claudecodeui-a-good-host-for-symcc.md): whether CloudCLI UI could be the program symcc runs inside.
- [Research: existing hosts that wrap many coding agents and take plugins](research-existing-hosts-that-wrap-many-coding-agents-claude.md): programs that run Claude Code, Codex and others, where symcc could live.
- [Task kinds, each with its own workflow (epics as one kind)](task-kinds-and-workflows.md): the plan for per-kind workflows; the owner chose not to build them.
- [I Built a Harness for an Organization of Coding Agents, Then Let It Fix Itself](draft-a-medium-article-about-symcc-a-harness-for-an-autonomo.md): a draft article about a week of symcc running on its own code.
- [Spike: can a symcc daemon beside Codex reach the lead and run workers?](codex-spike.md): yes, a daemon beside Codex can do the four things it needs.
- [Research: should symcc be its own CLI that drives Claude Code, Codex or other agents?](standalone-cli.md): not now; it would lose what makes symcc work.
- [Research: a refactor plan to make symcc depend on its host as little as possible](host-independence.md): small steps that change no behaviour.
- [Research: can symcc run as a Codex plugin?](codex-host.md): partly; a Codex plugin can't run symcc's code inside Codex.
- [Does session start hang with a scout file and a "doing" task whose agent is missing?](session-start-hang.md): no, it is one planned 2-second wait.
- [Esc in the board panel](esc-in-panels.md): why Esc in the board's search box went to the prompt line instead of clearing the search.
- [Research: how to show that symcc lowers cost and raises quality](evaluation.md): no public benchmark fits, so how to measure it ourselves.
- [Research: can symcc tell when the session is in plan mode?](plan-mode.md): only from fields on some events; there is no mode call.
- [Research: clearing or relabelling finished workers in Claude Code's agent list](agent-list.md): no, the plugin API can't change the agent list.
