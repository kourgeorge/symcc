# Research: a short notice channel on the board

Kept from task T-518 (try 2). Later tasks can read this note instead of asking again.

## The question

Should symcc have a short notice channel on the board, where workers post what they are changing and what others should know, and each new worker reads it at start?

## The answer

Yes, build a small one. Start with notices that only symcc and the lead post, not the agents.

The first version:
- **Automatic notices from symcc.** At the start of each try, the worker is told which other running tasks list the same files.
- **Lead notices.** The lead posts short notes with a new tool, `symcc notice` (for example "test X fails at random; T-515 is fixing it"). Each note is tied to a task or to some files, and ends by itself.

Worker-posted notices can wait for a second step. Free chat between agents (Claude Code agent teams, or OpenCode plugins) should not be used.

### What exists today
- **No board-wide channel.** Agents share information only through the lead's notes in one task's history, the `after` waits, and the earlier-tries list in the prompt (up to 5 lines, `triesList`, hooks/app/prompt-values.ts:13).
- **The worker prompt** is a fixed template (prompts/change.ts, prompts/investigation.ts) filled in by hooks/app/prompt-values.ts. A `{{notices}}` placeholder would fit next to `{{earlier_tries}}`.
- **A model to copy.** Board-level questions are a list in board.json: `questions` and `next_question` (hooks/core/board-file.ts:56 and :484). hooks/core/questions.ts has the type, a limit (`QUESTIONS_KEPT = 50`), a clean-up step and `addQuestion`. A `notices` list can be built the same way.
- **How a worker tool works.** Workers have one symcc tool, `ask_owner` (hooks/app/ask.ts:25), which refuses everyone but the calling worker (`askCall`). Scouts and checkers may only use board and stats (hooks/app/symcc.ts:263-273). A later worker notice tool can reuse this pattern.
- **A lead rule that already exists.** When two tasks may change the same files, the later one should wait (hooks/app/tools.ts:297). This was broken in the T-494/T-495 case (both touched the same lines of hooks/core/ask.ts). An automatic "these running tasks share your files" line would have shown both workers the overlap.

### 1. What a notice is, and who posts it
One short line (about 200 characters at most) with:
- **text**
- **kind**: file area, flaky test, or waiting
- **files**: the paths it is about
- **by**: the lead, symcc, or a task id
- **ends when**: a task id merges or is dropped, or after an age limit

Examples: "T-495 changes hooks/core/ask.ts ~400-530 (lnTargets)"; "the OpenCode test 'each slash command…' fails at random under load; T-515 fixes it".

Who posts:
- **First version: symcc and the lead.** symcc makes file-area notices from the `files` of tasks that are "doing" (no tokens, no trust in agent text). The lead posts flaky-test and waiting notices with `symcc notice`.
- **Later, if needed: workers**, through a tool like `ask_owner`. Not by symcc pulling text out of hand-back reports, which is unreliable and open to bad input.
- **Never: scouts and checkers.** Scouts read outside text; checkers only judge.

### 2. Who reads notices
- **Workers**: in the prompt at the start of every try.
- **Checkers**: the same notices, so a known flaky test is recognised.
- **The lead**: in its board reply.

Filter: only active notices whose files overlap the task's files, plus all flaky-test notices for the test commands. At most 5 to 8, newest first, one line each (about 200-400 tokens).

### 3. Where notices live
- **Where**: a `notices` list in board.json, like `questions`, written under the same board lock (hooks/app/store.ts). A separate file would need its own lock and its own place in `TMP_OWNERS` (hooks/core/board-file.ts:217).
- **How they end**: a file-area notice ends when its task merges, is dropped or stops "doing". A flaky-test notice ends when its fixing task merges or the lead removes it. Anything open after 2 days is marked old. The list is capped at about 50.
- **Owner view**: a small "Notices" section on the board, like "Questions for you". The task page lists the notices a try was given.

### 4. Cost against today's waste
Rough figures from the board on 2026-11-19:
- 101 tries started, about 25.5M billed tokens, about 253k per try (symcc's price weights, hooks/core/runs.ts:135).
- Notices would add about 400 prompt tokens per try: roughly 3k billed per try, about 1%, or about 0.3M a day (estimate).
- Flaky-test waste (tries made mostly to get flaky OpenCode tests to pass): T-507 try 2 106k, T-504 try 2 138k, T-502 try 3 88k, T-495 try 4 340k. Checker runs come on top.
- Duplicate-work waste: T-494 and T-495 used about 0.4-1M billed tokens per try over 16 tries; how much was duplicate `ln` work is unknown.

Avoiding one or two such retries a day pays for the notices. T-511 (merged) re-runs only the tests after a time-out, which helps cases like T-504 but not a real random failure like T-507.

### 5. Risks
- **Wrong or old notices.** Most end automatically on merge; each line shows its age and poster.
- **A notice read as an order.** Prompt heading: "For your information only; your task's details are your job; don't change other tasks' files because of a notice."
- **Prompt injection.** Only symcc and the lead write notices at first; scouts can't post; text is length-limited and one line.
- **Noise.** File filter, cap of 5-8, no free-text replies.

### 6. What the hosts offer
- **Claude Code agent teams** (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): agents message each other with `SendMessage` through mailbox files at `~/.claude/teams/{team-name}/inboxes/{agent-name}.json`. Limits: one team per session, teammates don't return after `/resume`, no teams in `-p`/Agent SDK sessions, "significantly more tokens". Source: https://code.claude.com/docs/en/agent-teams
- **OpenCode** has nothing built in. Subagents only report to their parent (open requests #23823 and #19215). The third-party plugin `opencode-plugin-peers` adds `send_message`. Sources: https://opencode.ai/docs/agents, https://github.com/anomalyco/opencode/issues/23823, https://github.com/code-yeongyu/oh-my-openagent/discussions/6767

Recommendation: keep symcc's own channel in board.json. It works on every host, the owner can see it, it fits symcc's own checks, and it survives reloads. Host messaging is live chat on one host only.

### 7. Suggested tasks
- **A: the notice list and automatic file-area notices.** Files: new hooks/core/notices.ts, hooks/core/board-file.ts, hooks/app/prompt-values.ts, prompts/change.ts, prompts/investigation.ts, prompts/checker.ts, tests/. Tests: the filter (overlap, cap, age), ending on merge or drop, prompt text.
- **B: the lead's `symcc notice` tool and a lead-guide line** (add, remove, list). Files: hooks/app/tools.ts, hooks/core/notices.ts, tests/. After A.
- **C: a "Notices" section on the board and task page**, matching the VS Code look. Board view files not confirmed. After A.
- **Later, only if A and B help: a worker notice tool** built like `ask_owner`.

## How it was found

By reading the code in a worker's folder (file and line references above) and today's board.json (read-only), plus the Claude Code and OpenCode docs and issues linked above.

Not checked:
- That T-494 and T-495 both listed hooks/core/ask.ts in their `files`.
- The real number of turns per try; the ~1% cost is a guess from the average.
- The owner's .symcc/reports, which the guard refused as outside the worker's folder.
