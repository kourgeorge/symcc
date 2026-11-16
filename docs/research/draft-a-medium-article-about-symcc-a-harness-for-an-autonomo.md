<!-- Research note T-279, keeping the answer of T-277: Draft a Medium article about symcc: a harness for an autonomous coding swarm (story + lessons, ~1500 words). The ready-to-paste article comes first, then the extras. -->

# I Built a Harness for a Swarm of Coding Agents, Then Let It Fix Itself

*One lead you chat with, a shared task board, workers in their own branches, scouts on timers. Here is what a week of running it on its own code taught me.*

[Image: upload `docs/video/symcc.gif`. Caption: "You talk to the lead, it puts tasks on the board, and workers move them from todo to running to done."]

**▶ Watch the 78-second video:** https://github.com/kourgeorge/symcc/blob/main/docs/video/symcc.mp4

[PLACEHOLDER, once uploaded: paste the YouTube link of the narrated 2-minute version here, on its own line, and press Enter so Medium shows a player. Then you can delete the GitHub link above or keep it.]

I like coding agents. But after months of using Claude Code every day, I kept hitting the same three walls.

**One: it does one task at a time, and you wait.** You give it a job and watch. New ideas come up while it works. You either interrupt it or try to remember them.

**Two: you can't see inside.** When the agent starts helper agents, you don't really know what each one did, or how the work was split between them.

**Three: it stops when you stop.** Close the laptop and nothing moves your project forward.

The agent's speed was never the real problem. Keeping track of the work was. So I built **symcc**, a free plugin for Claude Code. It is a harness for a swarm of coding agents.

## The idea: a team, not one agent

symcc has four parts.

**A lead.** This is just your normal Claude Code chat. You talk to it as usual. It turns what you say into tasks, sets their order, decides which files each task may change, and tells you what happened.

**A task board.** It is the team's shared memory. Every task records what it is, why it exists, who asked for it (in their own words), its tries, the worker's report, and the time and tokens it cost.

**Workers.** These are background agents, three at a time by default. Each one works in its own git worktree, on its own branch (`symcc/T-12`), so they never step on each other. Your tests must pass before anything is merged. If they fail, a new worker gets the failing output and tries again.

**Scouts.** These are read-only agents that wake up on timers. They look for bugs, missing tests and docs that no longer match the code. They report to the lead, and the lead turns what they find into tasks.

One rule keeps it all working. The lead's instructions say: "Don't do the tasks' work yourself in the main conversation; let the workers do it." Because the lead hands everything off, it is always free to talk to you. You can drop in a new idea, change your mind ("do T-6 first", "drop T-2"), or ask why something failed, while three workers are busy in the background.

## What it's like to use

I type something like "add a search command, and make the errors friendlier." The lead splits it into tasks and puts them on the board. When two tasks would touch the same files, it makes the second one wait for the first. Workers pick the tasks up, the tests run, the work merges, and the lead tells me.

There are two main modes. In **auto**, a task that passes the checks is merged right away. In **review**, every finished task waits for me to read the diff and approve or reject it. I can also mark just one task as "needs review."

Tasks come in two kinds. A **change** edits files, which are tested and merged. An **investigation** answers a question ("is it possible...", "should we..."). Nothing is merged, and the answer always waits for me to read it, even in auto. This draft started as one.

The board is where I go to understand things. Every commit starts with its task ID, so I can follow any line of code back to the request behind it.

If you'd rather watch than read, the video above shows one request going from chat to a merge in under two minutes.

## Lessons from letting the swarm work on itself

For the past week I've used symcc mostly to build symcc. That turned out to be the toughest test I could give it, because its bugs show up in the very work it is doing. Here is what happened.

### Scouts find real bugs, and then keep finding the next layer

On 16 November one task (T-217) sat in "checking and merging" for over eight minutes with nothing running, until the lead paused and resumed it. I asked for a fix, and that became T-219: put a time limit on the whole merge step.

Then the scouts took over. The recent-changes scout saw that approving a task by hand had no time limit, and that a merge step that had been given up could still run once its turn came (T-222). The gaps-bot scout saw that the fixed 15-minute limit could never fit several 10-minute test commands, so a task would be given up and restarted forever (T-224). Then it saw that time spent waiting in line behind other merges was counted against the limit too (T-226).

Four tasks for one feature. I asked for one of them. The scouts found the other three.

### The swarm can trip over its own changes

T-228 was a small cleanup, and its third try merged fine. But the board never marked it done. It stayed "doing", was later stopped for running over the time limit, and ended up failed. Then I hit retry, which started a fourth try on work that was already on main.

The lead filed T-237 to find out why. The worker's report says the most likely cause was that T-228's own merge changed the plugin's code, so the plugin reloaded in the middle of its own merge. After that, an idle worker that had already handed back was counted as running again. The fix: a task whose work is merged always ends done, the time limit can't fail a worker that already handed back, and no try starts for work that is already on main. T-228 itself was dropped by hand.

The lesson: if your agents change the system that runs them, expect it to restart under its own feet.

### Small words matter

When a worker runs past its time limit, symcc doesn't kill it. It asks me: "+30 min, +60 min, or Stop it?" (I asked for that in T-251, because I was tired of losing nearly finished work.) Then the test-gaps scout noticed that the answer parser checked for words like "no" before looking for a number. So a friendly "no rush, give it another hour" would have **stopped** the worker, and that can't be undone. T-262 changed it: only a plain stop answer stops a worker.

Hand-backs had the same problem. A worker ends with a line like `QUESTION:` (it needs me to decide something) or `NEED FILES:` (it needs to change more files). The first rules were too loose. A finished answer that restated a question ("Question: ... Answer: ...") sent the task to wait for me (T-268). The fix was too strict, so the lead filed a follow-up (T-270). Then an example `NEED FILES:` line quoted inside a report made a task wait for files (T-275). That fix missed real requests that came after a short sentence. The recent-changes scout found that in auto mode this could let half-done work merge without asking me (T-276). That's five tasks to get one parser right, and each step was a real bug that someone, usually a scout, caught.

### What the lead had to learn

Most of the lead's rules came from things going wrong:

- **Order the tasks.** Tasks that change the same files must run one after another, or they clash at merge time. The lead decides this itself and doesn't ask me.
- **Don't throw away work when time runs out.** Ask for more time instead.
- **Don't treat every line that looks like a question as one.**

### Where I still matter

The swarm is good at finding and fixing problems. It is not good at deciding what the product should be. I make the decisions (should a paused scout still run when I press "Run now"? I said yes, T-272). I review the risky changes. And I pick the names: the lead's own note on T-257 says "Name decided by the owner: the kind is 'investigation' (not 'question')." Small things like that set how the whole tool feels, and they are still mine.

## The numbers

These come from symcc's own `/symcc-stats` report on this one project, taken on 16 November 2026. They describe one solo project over about a week (the first commit was 9 November), not a benchmark.

- **278 tasks** on the board, **261 done**, 5 dropped.
- **75% were right on the first try** (191 of 254 done tasks with try data). The average was 1.4 tries per task.
- Where tasks came from: **40% from me**, 31% from the lead, **23% from scouts** (63 tasks), and 6% from workers who spotted follow-ups.
- **89%** of done tasks merged on their own, and **11%** were approved by me.
- **About 34 hours** of worker time and **about 229 million tokens** in total. Most of that is cached input, so symcc's own price-weighted estimate is about 26 million "billed" tokens.
- The median task took **5 minutes** of worker time.
- Of the 45 failed tries, 25 were stopped, 10 failed tests and 10 clashed with main.

## What's next

**Codex.** symcc runs inside Claude Code today. A spike (T-239) tested whether a small symcc daemon running beside OpenAI's Codex CLI could do the same job. The verdict was "Go." It can message the lead, give it board tools, and run workers in the background. One catch: the spike used a fake model, so it hasn't been tried with a real one yet.

**Less tied to one tool.** A separate study (T-234) found that symcc's core logic doesn't depend on Claude Code, but about ten places still assume it. The plan is to put a thin layer between symcc and the tool it runs in.

**Free and open source.** symcc is MIT-licensed and installs as a Claude Code plugin. If you've ever lost an idea while watching an agent work, try it and tell me what breaks.

https://github.com/kourgeorge/symcc

Video: https://github.com/kourgeorge/symcc/blob/main/docs/video/symcc.mp4 [or the YouTube link, once uploaded]

---

## Extras

**Title options**
1. I Built a Harness for a Swarm of Coding Agents, Then Let It Fix Itself
2. One Chat, Many Agents: What I Learned Running a Coding Swarm on Its Own Code
3. My Coding Agents Found 63 of Their Own Tasks in a Week

**Subtitle:** One lead you chat with, a shared task board, workers in their own branches, scouts on timers, and what broke along the way.

**Medium tags:** AI Agents, Claude, Software Development, Developer Tools, Open Source

**Where images help**
- After the subtitle: `docs/video/symcc.gif` plus the video link, or the YouTube player once it's up. Use `docs/video/symcc_youtube_thumbnail.png` as the YouTube thumbnail.
- Under "The idea": `docs/architecture.svg` (you, the lead, the board, workers and scouts).
- Under "What it's like to use": `docs/demo.svg`, or a screenshot of one task's page.
- Under "Scouts find real bugs": a screenshot of the T-219 to T-226 rows on the board.
- Under "The numbers": a screenshot of the `/symcc-stats` "Where tasks came from" bars.
- Medium may not accept SVG uploads (a guess, not checked). If an SVG is refused, export it to PNG first.

## Video: what exists and how to upload

- **Silent video, 78 seconds:** `docs/video/symcc.mp4`, public on GitHub (the link returned HTTP 200). The README links to it (`README.md:73-75`).
- **Preview GIF:** `docs/video/symcc.gif`, 20 seconds, also public. Upload it to Medium as an image.
- **Narrated YouTube version:** built locally at `docs/video/out/symcc_youtube.mp4` (not committed, it is in `.gitignore`). It is 1 min 50 s long. Its subtitles are `docs/video/symcc_youtube.srt` and its thumbnail is `docs/video/symcc_youtube_thumbnail.png`. The T-267 narration rewrite was committed two minutes after the file was built; it is most likely the same build, but watch it once before uploading.
- **No hosted link exists yet.** No YouTube or Vimeo link is in the repo or on the board.
- Medium shows a GitHub mp4 link as a plain link. A YouTube or Vimeo link pasted on its own line turns into a player when you press Enter. Sources: [ILLUMINATION, "How to Embed a YouTube Video in Your Medium Story"](https://medium.com/illumination/how-to-embed-a-youtube-video-in-your-medium-story-cf64094e6813), [Zulie Rane, "How to embed links on Medium"](https://www.youtube.com/watch?v=xtpsEsdNhl4), [Stack Overflow](https://stackoverflow.com/questions/49115591/not-able-to-add-a-video-to-a-medium-story). Medium's own help page was not found.
- **Upload steps:** upload to YouTube, keep "Allow embedding" on ([YouTube Help](https://support.google.com/youtube/answer/171780)), add `symcc_youtube.srt` as subtitles, set the thumbnail PNG, then paste the link into the placeholder. Optionally, a follow-up task could add the YouTube link next to the existing one in `README.md:75`.

## Where each fact came from

- **The three problems:** `docs/video/narration.md`, Scene 1.
- **Lead, board, workers, scouts, modes, task kinds:** `README.md` lines 41-66 and 178-193.
- **"Workers are background agents" and "Don't do the tasks' work yourself":** `hooks/plugin/tools.ts` lines 65 and 284.
- **Task ordering rule:** `hooks/plugin/tools.ts` line 258.
- **Task stories:** `.symcc/board.json`, the `history` and `origin` of T-217/T-219, T-222, T-224, T-226, T-228, T-237, T-251, T-257, T-262, T-268, T-270, T-272, T-275 and T-276. The T-237 cause comes from `.symcc/reports/T-237-try-1.md`.
- **Numbers:** I ran the project's real `statsReport` (`hooks/core/stats.ts`) with bun on a copy of `board.json` in /tmp, then deleted the copy.
- **Dates:** git log, first commit 2026-11-09, 379 commits.
- **Codex verdict:** `docs/research/codex-spike.md`, "Short answer", including the fake-model note.
- **About ten tied places:** `docs/research/host-independence.md` line 123.
- **License:** `LICENSE` (MIT). Version 0.3.0 is in `.claude-plugin/plugin.json`.

## What I couldn't confirm, or you should check

- **The numbers will drift.** Re-run `/symcc-stats` just before you publish. There is no `archive.json`, so I passed no archived tasks; if your real command reads one, its numbers may differ.
- **The task count is off by one.** The report said 278 tasks while my first look at the board showed 277. A task was probably added in between.
- **Older answer-only tasks count as changes.** The stats show only 1 investigation, because the "investigation" kind is recent (around T-253 to T-257). That's why I left investigations out of the numbers.
- **The T-237 cause is "most likely", not proven.** The worker's report calls the mid-merge reload "the most likely reason", and the draft says so.
- **No hours-away claim.** I didn't check how much work happened while you were away, so the draft doesn't claim it.
- **The word count is my estimate**, about 1,550.

## How it was found

Try 1 wrote the draft from the board, the reports, git log and the docs. Try 2 added the video links, checking them with curl and ffprobe. No project files were changed by either.
