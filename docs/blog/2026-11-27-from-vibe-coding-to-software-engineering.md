# From vibe coding to real software engineering

*Keep the creative flow. Let an organization of AI agents handle the engineering.*

## The problem with vibe coding

Vibe coding has changed how we build software. Instead of writing every feature by hand, you describe what you want in plain words and let an AI coding agent do the work.

This makes building software faster, open to more people, and more creative.

But there is a problem: **vibe coding is good at producing code, but producing code is not the same as engineering software.**

As projects grow, three limits show up:

1. **Broken flow:** you keep waiting for the coding agent, and you lose momentum and context.
2. **Uneven quality:** the code can miss features, have a poor design, repeat itself, and pile up mess for later (technical debt).
3. **Little coordination:** a single coding agent becomes a bottleneck. You end up managing the tasks, their order, their context and their running yourself.

symcc was built to fix all three.

## 1. The broken flow

Imagine working with a coding agent. You describe a feature and ask the agent to build it.

Now you wait.

The agent may take several minutes. When it comes back, you check the result, give feedback, fix mistakes, and start another round.

Meanwhile, you have already thought of three more features.

You face an awkward choice: interrupt the agent, keep a separate list of ideas, or wait until the current task is done.

**The coding agent becomes the bottleneck in the creative process.**

### symcc's answer: a lead that is always there

symcc gives you a **lead**: one agent that is your main contact for the whole engineering process.

Instead of running single coding sessions, you keep talking to the lead.

You describe features, suggest improvements, change requirements, or ask about earlier decisions.

The lead turns what you say into tasks on a board. It manages the backlog (the list of ideas parked for later), finds which tasks depend on others, sets priorities, and starts the work.

If you ask for something that is already built, the lead can tell you.

If the idea was discussed before but never finished, the lead can find the existing task and start it.

**You stay in the creative flow. The lead handles the bookkeeping.**

## 2. From one coding agent to an organization of agents

AI-assisted coding usually means one developer working with one coding agent.

Even when the agent is strong, it works mostly one thing at a time. One task holds its attention while other work waits.

You often have to decide what happens next, what can run at the same time, and how the results fit together.

But real software engineering is not one programmer doing every job.

It needs coordination, specialized roles, work in parallel, and checking.

### symcc's answer: an agent organization

symcc moves beyond the single coding agent to **an agent organization: agents that each have a clear job, run by a lead.**

The organization includes:

- **The lead:** understands what you want, keeps the project plan, sets the order of tasks, and starts the other agents.
- **Workers:** each builds one task on its own, so several features can move forward at the same time. Each worker has its own copy of the project.
- **The checker:** a fresh agent that did not write the change. It tries to break the change and judges it against the task's "Done when". It sends the work back only for what is worse than main. The checker is a board setting, and it is off by default.
- **Scouts:** agents that look for work on a timer, such as bugs, missing tests or outdated parts, and report it to the lead. The lead decides what becomes a task. See [Scouts](../scouts.md).

The lead finds which tasks can safely run in parallel and which must wait for others to finish.

For example, one worker can build a backend API while another builds the screens, and a third fixes an unrelated bug.

Meanwhile, the checker can test work another worker finished.

If the checker finds a problem, the task goes back to its worker to fix, and you don't have to coordinate it. After 2 send-backs, the task waits for you: Merge as is, Keep fixing, or Drop.

**You no longer manage single agents. You direct an organization.**

This is not just about running more agents to make more code. Agents working in parallel without coordination can clash, repeat each other's work, and pull the design apart.

symcc's lead handles the coordination, so that parallel work adds up to one coherent system.

## 3. Too much to keep in your head

Software engineering is much more than writing code.

Even a mid-size project means keeping track of requirements, design, dependencies, priorities, history, bugs, and technical decisions.

A plain coding workflow puts most of this load back on you.

You have to remember what was asked, what was built, which decisions were made, and how new changes affect what already works.

### symcc's answer: hand off the coordination

symcc keeps an organized record of the work.

Every request becomes a task on the board, not a lost chat message.

The lead can connect the original request, the task, the agent that did it, the code changes, the checker's feedback, and the final result.

You can ask:

"Didn't we already ask for something like this?"

"Why was this feature built this way?"

"What is being worked on right now?"

"Which tasks are blocking the next release?"

The lead uses the project's records to answer and to plan the next steps.

The agents also share **organizational memory**: short notes about the project that agents leave for the ones after them, like how to run one test or a trap to avoid. Agents suggest notes, and the lead decides which to keep.

The goal is to **take the load of coordination off you, without taking away your control over where the product goes.**

## 4. The code quality problem

A coding agent can build an impressive feature in minutes, and quietly bring in problems that show up only much later.

Common problems include:

- **Uneven code:** different parts of the app follow different styles and patterns.
- **Missing pieces:** requirements, connections to other parts, or edge cases are forgotten.
- **Poor design choices:** the code works for now, but ties parts together in ways that are hard to maintain.
- **Repeated code:** the same logic is written again and again instead of reused.
- **Too little checking:** a feature counts as done because code was written, not because anyone checked that it works.

These problems add up.

An app can look impressive at first, while its code becomes more and more fragile.

### symcc's answer: engineering guardrails

symcc keeps building and checking apart.

A worker builds a task, but the task is not done just because the worker finished writing code.

When the checker is on, the change goes to the checker next.

The checker does not just read the code. It tries to break it.

Depending on the task, it can read the requirements, explore edge cases, look for things that used to work and now don't, and question design choices. It judges the change against the task's "Done when".

If it finds problems, the task goes back to the worker with clear comments.

The worker fixes the change, and the checker looks again.

**Build → Challenge → Find failures → Fix → Check**

After that, the change goes to the merge queue. There the project's own tests run, and a change merges only if they pass.

The aim is not to promise bug-free software. It is to bring steady quality checks into work done by agents.

## 5. From loose changes to a clear trail

Vibe coding often makes changes through one long chat, without keeping a clear record of why each change was made.

Over time, it gets hard to tell why something changed, which request it came from, or whether anyone checked it.

symcc organizes work into clear, traceable units: tasks.

Each task is one bounded change with a clear purpose and a life of its own, almost like a quantum of software development.

symcc keeps the link between the original request, the work, the checks, the fixes, and the result.

This gives you a trail through the whole engineering process.

Instead of asking only "What does the code do?", you can also ask "Why does it work this way, and how did we get here?"

## 6. A short story: building an app with symcc

Imagine you are building a sailing app.

You already have a working prototype, but you want to grow it.

You tell symcc:

"I want users to save their sailing routes, share them with friends, and see the weather along the route."

With a plain coding agent, you would likely build these one after another, checking each result and keeping track of what is left by hand.

With symcc, the lead reads the request and makes three tasks: saving routes, sharing routes, and weather along the route.

It sees that they can be built at the same time.

The lead gives each task to its own worker.

One worker builds route saving. Another connects the weather service. A third builds sharing.

**All three move forward in parallel.**

Meanwhile, you have another idea.

"Actually, users should also be able to make their routes private."

You don't need to interrupt the workers or work out which task needs changing.

You tell the lead.

The lead sees that the new requirement affects sharing, and it updates the sharing task.

Then you ask:

"Can we also let users export routes as GPX files?"

The lead checks the backlog and finds that GPX export was asked for earlier but never built.

It moves that existing task to todo, and a worker picks it up when one is free.

You keep thinking about where your app should go.

Meanwhile, the route-saving worker finishes.

But the task isn't done yet.

The checker takes over and tries to break it. It finds that one user's route can be read by another user through an unprotected endpoint (a web address the app answers on, which did not check who was asking).

The checker sends the task back to its worker, with a description of the problem.

The worker fixes the access check. The checker tests the new version.

The change goes to the merge queue, the tests pass, and it merges.

All along, the lead keeps track of each task's state, what it waits for, its history, and the checker's results.

You can ask what is done, what is being checked, which tasks are blocked, or why a change was made.

You didn't have to coordinate three workers, watch them run, set up checks, or piece together every step in between.

You just kept directing the product.

**The agents handle the engineering. You handle the vision.**

## 7. A new split of jobs

symcc changes how you work with coding agents.

| Job                     | Plain vibe coding                 | symcc                            |
| ----------------------- | --------------------------------- | -------------------------------- |
| Product direction       | Developer                         | Developer                        |
| Task planning           | Developer or a single agent       | Lead                             |
| Task dependencies       | By hand, or not at all            | Lead                             |
| Building in parallel    | Little, or coordinated by hand    | Several workers                  |
| Running the agents      | Developer                         | Lead                             |
| Quality checks          | Often informal                    | The checker                      |
| Failed checks           | Developer coordinates the fixes   | Worker–checker loop              |
| Task history            | Scattered across chats            | Traceable task records           |
| Creative flow           | Broken by waiting                 | Keep talking to the lead         |

The big shift is that you no longer have to be the day-to-day manager of every coding step.

The lead runs an organization that can plan, build, and check.

## 8. Why this matters

Adding more coding agents is not enough.

Ten agents writing code at once can make ten times the coordination problems, if they don't share requirements, dependencies, and design.

The real challenge is not making code faster.

It is organizing work done on its own so that every change adds up to one coherent system that is easy to maintain.

symcc treats building software with agents as a coordination problem.

It combines talking in plain words, task management, coordinated parallel work, active checking, and a full trail of the work.

This opens a path beyond single coding sessions and quick prototypes, toward a steadier way of engineering software.

## symcc was built with symcc

Every change to symcc went through its own board. In 19 days, 995 tasks were done. 915 of them (92%) merged on their own, with no human review. The median task took about 7 minutes and about 1.2 million tokens, most of them read from the cache. See [Built with symcc](../built-with-symcc.md) for all the numbers.

## 9. The vision: vibe coding without losing engineering discipline

The promise of vibe coding is that you can focus on what you want to make, not on every mechanical detail of how to make it.

But keeping that promise takes more than ever stronger coding models.

It takes an organization that can plan, share out work, coordinate parallel work, keep context, check the work, and keep the code coherent as the app grows.

symcc is built on one simple idea:

**You should direct the vision, not manage the coordination.**

The lead coordinates. Workers build. The checker challenges. Scouts look for more work. symcc keeps a clear record of what happened and why.

You keep thinking, exploring, and creating.

**symcc: from a single coding agent to an organized engineering team. From writing code to engineering software. Without breaking the flow.**

## Try it

Install it and give the lead your first task: see [Get started](../get-started.md). The website is [kourgeorge.github.io/symcc](https://kourgeorge.github.io/symcc/).
