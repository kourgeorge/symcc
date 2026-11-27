# From vibe coding to real software engineering

Keep the creative flow. Let an organization of AI agents handle the engineering.

## The problem with vibe coding

Vibe coding changed how we build software. You describe what you want in plain words, and an AI coding agent writes the code. It is fast, open to more people, and fun.

But writing code is not the same as engineering software. As a project grows, three problems show up:

1. **Broken flow.** You keep waiting for the agent, and you lose your momentum.
2. **Uneven quality.** The code can miss features, repeat itself, or pile up mess for later.
3. **No coordination.** One agent is a bottleneck. You end up managing the tasks, their order and their context yourself.

symcc was built to fix all three.

## 1. The broken flow

Say you are building a sailing app. You ask your agent for a wind map. Now you wait. It takes a few minutes. You check the result, give feedback, and start another round.

While you wait, you think of three more things: a tide table, a trip log, and a dark mode for night sailing. You have an awkward choice. Stop the agent, keep a list on the side, or wait. The agent has become the bottleneck in your creative work.

### symcc's answer: a lead that is always there

In symcc you talk to one agent, the **lead**. It hands the building to workers, so it stays free to listen while they work. You tell it about features, changes and ideas, or ask about earlier work.

The lead turns what you say into tasks on a board. It sets their priority, and it links tasks that depend on each other (a task's `after` list), so a task waits until the ones it needs are merged. If you ask for something that already exists, the lead can tell you. If you talked about it weeks ago and it was parked in the **backlog**, the lead can find that task and move it to todo.

So you say "add a tide table, a trip log and a dark mode", and keep thinking. The lead does the bookkeeping.

## 2. From one agent to an organization of agents

The usual setup is one person and one agent. Even a strong agent works mostly one thing at a time. You decide what comes next, what can run side by side, and how the pieces fit.

Real software teams don't work like that. They split the work, run parts in parallel, and check each other.

### symcc's answer: an agent organization

symcc is an **agent organization**: agents with clear jobs, run by the lead.

- **The lead** understands what you want, keeps the board, sets the order and starts the workers.
- **Workers** each build one task, side by side. Each works in its own copy of the project (a git worktree) on its own branch, with a list of the files it may change. An edit outside that list is refused and becomes a question for you, not a surprise in the diff.
- **The checker** (a board setting, off by default) is a fresh agent that did not write the change. It tries to break it, judges it against the task's "Done when", and sends it back only for what is worse than main. After 2 send-backs the task waits for you: Merge as is, Keep fixing, or Drop.
- **The merge queue** runs your project's tests. Finished tasks take turns, and a change merges only when the tests pass.
- **Scouts** look for problems and ideas on a timer: bugs, missing tests, outdated packages. They don't change your project. What they find goes to the lead, who decides whether it becomes a task.

Not every task is code. An **investigation** brings back an answer for you to read. An **errand** does work outside the project, like tidying a folder on your Desktop.

Back to the sailing app. One worker builds the tide table, another the trip log, and a third fixes a bug a scout found in the wind map. Dark mode touches the same screens as the trip log, so the lead puts it `after` the trip log. If the checker finds a problem in the tide table, the task goes back to its worker with the reason. You don't have to step in.

You no longer manage single agents. You direct an organization.

This is not about running more agents to make more code. Agents working in parallel without coordination clash, repeat each other's work, and pull the design apart. The lead's job is to make parallel work add up to one coherent app.

## 3. Too much to keep in your head

Engineering is more than writing code. Even a mid-size project has requests, design choices, dependencies, priorities, bugs and history. With a plain coding agent, you carry all of that in your head.

### symcc's answer: the board remembers

In symcc every request becomes a task on the board, not a lost chat message. Each task keeps your request in your words, its history, the workers' and checker's reports, and the commits it made (each carries a `Symcc-Task` line). So you can ask the lead: "Didn't we already add a trip log?" or "Why was the tide table built this way?", and it can look it up.

The agents also share **organizational memory**: a short file of lessons from earlier tasks, like "this test needs a fake clock". Agents suggest notes, and the lead keeps only the ones that help many tasks.

## How it compares

| | Vibe coding with one agent | symcc |
|---|---|---|
| Who you talk to | The agent doing the work | A lead that is always free |
| New ideas while it works | Wait, interrupt, or keep a list | Tell the lead; it adds tasks |
| Work in parallel | One task at a time | Many workers, each in its own copy |
| Dependencies and order | You track them | The lead sets `after` links and priority |
| Checking the work | You read the diff | Optional checker, and tests before every merge |
| Finding new work | You notice it | Scouts look on a timer |
| Memory of decisions | Lost in old chats | The board keeps requests, reports and commits |

## symcc was built with symcc

Every change to symcc went through its own board. In 19 days, 995 tasks were done. 915 of them (92%) merged on their own, with no human review. The median task took about 7 minutes and about 1.2 million tokens, most of them read from the cache. See [Built with symcc](../built-with-symcc.md) for all the numbers.

## Try it

Install it and give the lead your first task: see [Get started](../get-started.md). The website is [kourgeorge.github.io/symcc](https://kourgeorge.github.io/symcc/).

Keep the vibe. Get the engineering. Without breaking the flow.
