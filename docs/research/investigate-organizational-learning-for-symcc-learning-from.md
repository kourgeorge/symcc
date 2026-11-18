# Organizational learning for symcc

Kept from the answer to T-453.

## The question

Investigate organizational learning for symcc: learning from the owner, the system's behavior, and workers' and scouts' work. What is the best opportunity?

## The answer

**Best first step: a short retro after a hard task.** A "hard task" took 3 or more tries, was rejected, or failed. A cheap agent reads the task's history and reports and writes at most 2 one-line lessons. The lead proposes each lesson to the owner as an edit to a role checklist, a kind, a scout prompt or the lead's memory. Nothing changes without the owner's OK.

symcc already records almost everything this needs. What is missing is a step that looks across tasks. Today, lessons stay inside one task, or inside the lead's private Claude Code memory, where workers never see them.

### What symcc already records

- **Each try:** start and end time, tokens, commits, a report link, and how it ended (`finished`, `restarted`, `stopped`, `timed out`, `asked`) with a short note. See `types/index.d.ts` and `hooks/core/runs.ts`.
- **Each task:** history lines, `attempts`, `conflict_tries`, `test_tries`, `test_output`, `role`, `kind`, `needs_review` and `origin` (who asked, the owner's words, why).
- **Rejections:** a reason is required and saved in the history (`hooks/core/review.ts`).
- **Checker results:** saved as "checker found problems" (`hooks/core/checker.ts`).
- **Scout runs:** `.symcc/scouts/<name>.runs.json` keeps outcome, findings, tokens, report and the tasks made from each run, up to 50 runs (`hooks/core/scouts.ts`).
- **Stats tool** (`hooks/core/stats.ts`): failed tries by reason, and tasks, tokens and time by role and origin.
- **Learning inside one task:** the next worker sees the last 5 history lines and the failing test output or checker report (`hooks/app/prompt-values.ts`).
- **Lead memory:** about 17 files of the owner's preferences in Claude Code. It works, but only the lead can read it.

### Gaps

- Stats does not count checker send-backs as failed tries (`failReason` in `stats.ts`).
- Stats has no breakdown by kind.
- Nothing reads across tasks to find patterns.
- Lessons in the lead's memory never reach workers, checkers or scouts.

### Patterns seen in git history

- Merge clashes come back most: 228 of 778 commits are "bring up to date with main", and 170 of 405 tasks with commits (about 42%) needed at least one.
- Heavy tasks such as T-439 and T-446 (git-guard edge cases) kept growing in scope.
- The VS Code look tasks (T-442 to T-444, then T-448) may point to rejections over taste, which tests can't catch. This is a guess.
- Not checked: clock-dependent tests, early worker exits, scout hit rate, token cost per kind.

### Options compared

- **A. Retro after a hard task, proposed to the owner.** Data exists. Small to medium effort. Risk: bad lessons and token cost; owner approval limits both. Measure: fewer tries and checker send-backs.
- **B. A project lessons file every worker reads.** Small effort. Risk: bloats every prompt, and one wrong lesson reaches all workers. The ACE paper advises small item-by-item edits.
- **C. The lead learns the owner's preferences.** Mostly done, in Claude Code only. Next: move it into a symcc-owned file so it works in other hosts. Medium effort.
- **D. Better sizing and splitting** from past tries and cost, as a hint in stats or the lead guide. Small effort, low risk.
- **E. Scouts that tune themselves.** Data exists. Medium effort. Risk: a scout tunes itself into silence.
- **F. Better stats first** (count checker send-backs, add a kind breakdown). Tiny effort, and needed to measure A to E.

### Recommendation

Start with A, kept narrow, with F as its first task.

1. **Task 1 (small):** stats counts checker send-backs as a failed-try reason, adds a "by kind" section, and lists tasks with 3 or more tries. This is the baseline.
2. **Task 2:** when a task ends with 3 or more tries, a rejection or a failure, the lead gets a "retro" prompt and proposes at most 2 lessons, each with a target. A yes becomes a normal small task that edits that file.
3. **Measure over 2 to 3 weeks:** tries per merged task, checker send-backs per task, owner rejections, tokens per merged task, and the share of proposed lessons accepted (low means noise).

Clashes are the biggest pattern, so early lessons will likely be about splitting tasks and using `after` for tasks that share files. That also starts option D.

## How it was found

- The T-453 worker read the symcc code (files named above) and the git history of its copy.
- The symcc permission guard refused reads of the owner's `.symcc/` folder (board, archive, reports, scout runs). So the numbers come from git history and the task brief, not the real board. The try records of T-439, T-446 and T-448 were not read.
- Before building anything, run `/symcc-stats` (or `/symcc-stats full`) on the real board.
- Outside ideas (web, untrusted, summarized):
  - Reflexion: a written reflection after a failed try beat showing the last try by 8 points on one test. [arxiv 2303.11366](https://arxiv.org/abs/2303.11366)
  - Voyager: a growing library of skills that worked. [arxiv 2305.16291](https://arxiv.org/abs/2305.16291)
  - Fullsend's Retro agent: after merge, analyzes the workflow and files process proposals. [fullsend.sh](https://fullsend.sh)
  - hackers&wizards blog: "one bug, one rule" in agent config files, with no measures. [blog post](https://www.hackersandwizards.dev/blog/2026/sdlc-retro-ai)
  - ACE (ICLR 2026): a playbook of separate items with small edits, to avoid "context collapse". [arxiv 2510.04618](https://arxiv.org/abs/2510.04618)
