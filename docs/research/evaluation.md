# Research: how to show that symcc lowers cost and raises quality

Task T-139. Checked on 2026-11-13 against Claude Code 2.1.319 (`claude --version` on this machine),
the symcc code in this worktree, and the web pages linked below (fetched that day). Numbers come
from those pages; anything I could not confirm is marked as a guess or left out.

## Short answer

No public benchmark measures what symcc is for (many related requests in one project session, done
in parallel, in the right order, with nothing forgotten); almost all of them score one issue at a
time, so on them symcc can at best tie plain Claude Code and will likely cost more. To show a real
benefit, build a small private "project session" benchmark (2-3 repos, 15-25 scripted requests with
dependencies and shared files, hidden tests), run plain Claude Code and symcc on it with the same
model, version and start commit, measure cost from the full session logs (not `/symcc-stats`), and
start with a small pilot.

## 1. Public coding-agent benchmarks

"Multi-task?" means: can it show the benefit of working on several related tasks (parallel work,
ordering, nothing forgotten)? "Single" means each task is scored on its own, in a fresh copy.

| Benchmark | Size and date | How it is scored | Cost and time to run | Licence | Multi-task? |
|---|---|---|---|---|---|
| **SWE-bench Verified** ([swebench.com](https://www.swebench.com/), [repo](https://github.com/SWE-bench/SWE-bench)) | 500 human-checked Python issues from 12 repos, released Aug 13 2024 (repo README news) | % resolved: hidden "fail-to-pass" and "pass-to-pass" tests run in Docker after the agent's patch | README asks for x86_64, 120 GB free disk, 16 GB RAM, 8 cores; cloud runs via Modal or `sb-cli`. Model cost per run: not stated in one place; the site has "resolved vs cost" plots | MIT | Single |
| **SWE-bench Verified: status** | On Feb 23 2026 OpenAI said it stopped reporting it: in an audited hard subset "at least 59.4%" of problems had tests that reject correct fixes, and all tested frontier models could reproduce some gold patches (training contamination). OpenAI recommends SWE-bench Pro instead ([post](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)) | | | | |
| **SWE-bench Pro** ([paper arXiv:2509.16941](https://arxiv.org/abs/2509.16941), [repo](https://github.com/scaleapi/SWE-bench_Pro-os), [leaderboard](https://scale.com/leaderboard/swe_bench_pro_public)) | Paper (Sep 2025): 1,865 problems from 41 repos (public 11 repos, held-out 12, commercial 18). Public split v1 = 731 tasks. **V2** (README news "9/22", repo last pushed 2026-09-22): 642 validated public tasks plus a HARD-51 subset. This is the current version; I found no successor | % resolved by hidden tests; V2 uses a "locked protocol" (agent has no network, re-graded in a fresh sandbox) | V2 runs through [Harbor](https://github.com/harbor-framework/harbor) on Modal or local Docker; public images on ghcr.io. The paper's agent runs were capped at 50 turns and $2 per task | Repo code MIT; the public tasks come from GPL / copyleft repos on purpose (paper) | Single. Tasks are long ("hours to days" for a human, multi-file) but still one at a time |
| **Multi-SWE-bench** ([arXiv:2504.02605](https://arxiv.org/abs/2504.02605), [repo](https://github.com/multi-swe-bench/multi-swe-bench)) | 1,632 issues in 7 languages (Java, TS, JS, Go, Rust, C, C++), Apr 2025; "mini" (400) Apr 2025, "flash" (300) Jul 2025. NeurIPS 2025 D&B | % resolved by tests, `final_report.json` | Docker images per instance; flash/mini exist to cut cost. No dollar figure found | Apache-2.0 | Single |
| **Terminal-Bench 2.0** ([tbench.ai](https://www.tbench.ai/), [repo](https://github.com/harbor-framework/terminal-bench-2), [arXiv:2601.11868](https://arxiv.org/abs/2601.11868)) | 89 tasks in terminal containers (paper, Jan 2026; 89 task folders in the repo) | Pass/fail per task by its tests; accuracy over tasks | Harbor: `harbor run --dataset terminal-bench@2.0 --agent claude-code ...` runs Claude Code itself. No dollar figure found | Apache-2.0 | Single |
| **Aider polyglot** ([post Dec 21 2024](https://aider.chat/2024/12/21/polyglot.html), [repo](https://github.com/Aider-AI/polyglot-benchmark), [leaderboard](https://aider.chat/docs/leaderboards/)) | 225 hard Exercism exercises in C++, Go, Java, JS, Python, Rust | % passing the exercise's unit tests (two tries, the second sees test output) | Leaderboard shows per-run cost and time, e.g. gpt-5 (high) 88.0%, $29.08, 194 s per case (2025-08-23) | No licence on the repo (GitHub API: `license: null`) | Single, small functions; measures editing with aider, not an agent session |
| **SWE-Lancer** ([arXiv:2502.12115](https://arxiv.org/abs/2502.12115)) | Paper (Feb 2025): over 1,400 Upwork tasks worth $1M (bug fixes to $32,000 features, plus "manager" choices). Public "Diamond" split. Since 2025-07-17 the open repo has 198 of the 237 Diamond IC tasks that run offline | End-to-end (browser) tests written by engineers; score as % and as dollars earned | Docker image; code moved to [openai/preparedness](https://github.com/openai/preparedness) (`project/swelancer`). No dollar figure found | No licence on [the old repo](https://github.com/openai/SWELancer-Benchmark) (GitHub API) | Single |

Feature-level and long-horizon benchmarks (sizes from the arXiv abstracts; I did not check licences or run cost):

| Benchmark | What it is | Multi-task? |
|---|---|---|
| [FEA-Bench](https://arxiv.org/abs/2503.06680) (Mar 2025, ACL 2025) | New-feature PRs from 83 repos (task count not in the abstract) | Single feature |
| [FeatBench](https://arxiv.org/abs/2509.22237) (Sep 2025) | 157 feature tasks from 27 repos, plain-language inputs, updated over time; best 29.x% | Single feature |
| [SWE-Dev](https://arxiv.org/abs/2505.16975) (May 2025) | 500 test + 14,000 train feature tasks; also tested 10 multi-agent systems | Single feature |
| [SWE-EVO](https://arxiv.org/abs/2512.18470) (Dec 2025) | 48 tasks built from release notes of 7 Python projects; avg 21 files changed, ~874 tests each | Closest to "many changes", but graded as one task |
| [NL2Repo-Bench](https://arxiv.org/abs/2512.12730) (Dec 2025), [Commit0](https://arxiv.org/abs/2412.01769) (Dec 2024), [ProgramBench](https://arxiv.org/abs/2605.03546) (May 2026, 200 tasks) | Build a whole library / program from a spec; graded by test pass rate | One very large task; could show parallel work, but not ordering of separate requests |
| [CodeClash](https://arxiv.org/abs/2511.00839) (Nov 2025) | Goal-driven tournaments (1,680 tournaments, 6 arenas) | Not request-based |
| [SWE-Bench-CL](https://arxiv.org/abs/2507.00014) (Jun 2025) | SWE-bench Verified issues in time order per repo; metrics for forgetting and transfer | Sequence of tasks, but about learning, not parallel work |
| [AsynCodeBench](https://arxiv.org/abs/2609.32662) (Sep 2026) | 19 tasks from real repos with 52 explicit dependencies between agents' parts; scores "dependency pass rate" and "when each dependency is first met" | Yes, the only one I found that scores coordination directly. Small, new; licence and harness not checked |
| [SWE-rebench](https://arxiv.org/abs/2505.20411) (May 2025; V2 Feb 2026) | Fresh tasks collected over time, to avoid contamination | Single |

What I did not find: any public benchmark of "one project, a list of 15-25 related owner requests,
some depending on others, sharing files", scored on everything being done and nothing broken.

Harbor note: its Claude Code agent (`src/harbor/agents/installed/claude_code.py`, Harbor v0.25.0,
2026-10-25) supports skills and MCP servers; I did not find plugin loading in it. Running symcc
under Harbor would need a custom install step (not checked).

## 2. Published results: multi-agent vs single-agent

- **Anthropic, "How we built our multi-agent research system"** (Jun 13 2025,
  [link](https://www.anthropic.com/engineering/multi-agent-research-system)). Research, not coding.
  Opus 4 lead + Sonnet 4 subagents beat single-agent Opus 4 by 90.2% on an internal research eval.
  Token use alone explained 80% of score variance on BrowseComp. Cost: "agents typically use about
  4x more tokens than chat interactions, and multi-agent systems use about 15x more tokens than
  chats". It says most coding tasks "involve fewer truly parallelizable tasks than research" and
  that domains with many dependencies between agents are not a good fit yet. Also: start evals with
  about 20 real queries, since early changes have large effects.
- **Anthropic, "Building a C compiler with a team of parallel Claudes"** (Feb 5 2026,
  [link](https://www.anthropic.com/engineering/building-c-compiler)). 16 agents, nearly 2,000 Claude
  Code sessions over two weeks, 2B input + 140M output tokens, just under $20,000. Failure seen:
  on one big task "every agent would hit the same bug, fix that bug, and then overwrite each other's
  changes" until the work was split with a test oracle. A case study, not a controlled comparison.
- **Claude Code docs, agent team costs** ([costs page](https://code.claude.com/docs/en/costs.md)):
  token use is "roughly proportional to team size"; each teammate loads CLAUDE.md, MCP and skills.
- **Cognition, "Don't Build Multi-Agents"** ([link](https://cognition.ai/blog/dont-build-multi-agents),
  June 2025): parallel subagents that don't share full context make conflicting choices ("actions
  carry implicit decisions"); calls such systems "fragile" in 2025.
- **MAST, "Why Do Multi-Agent LLM Systems Fail?"** ([arXiv:2503.13657](https://arxiv.org/abs/2503.13657),
  v3 Oct 2025): 1,600+ traces from 7 frameworks; gains on benchmarks "often minimal"; 14 failure
  modes in 3 groups: system design, misalignment between agents, and task verification (weak or no
  checking).
- **AsynCodeBench** (above): better coding scores "do not necessarily translate into stronger
  collaboration".
- **METR RCT** ([arXiv:2507.09089](https://arxiv.org/abs/2507.09089), Jul 2025): 16 experienced
  developers, 246 tasks; with early-2025 AI tools they were 19% slower although they believed they
  were 20% faster. Lesson for symcc: measure owner time, don't ask for it.

What I did not find: a controlled study of multi-agent vs single-agent Claude Code on coding with
cost and quality both reported. So whether symcc saves money is an open question; the published
evidence suggests more agents mostly means more tokens, and any saving has to come from fewer
retries, less rework and less owner time.

## 3. Measuring Claude Code cost reliably

- **`/usage`** (`/cost` and `/stats` are aliases, [commands](https://code.claude.com/docs/en/commands.md)):
  session tokens and a dollar figure computed locally at list price; "The figure is an estimate"
  ([costs](https://code.claude.com/docs/en/costs.md)). On a subscription the dollar figure is not
  billing. It resets on `/clear` (since v2.1.211). Fine for a glance, not for a benchmark.
- **Session logs**: `~/.claude/projects/<project>/<session>.jsonl`, with subagent transcripts in
  `<session>/subagents/` ([.claude directory](https://code.claude.com/docs/en/claude-directory.md)).
  Each assistant line has `message.model` and `message.usage` (`input_tokens`, `output_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`, with 5m/1h split), checked on a log on
  this machine. Two traps I saw or read:
  - The same API message appears on several lines (in one local log: 14 messages on 23 lines), so
    count each `message.id` once.
  - Files older than `cleanupPeriodDays` (default 30) are deleted; copy logs right after each run.
- **ccusage** ([repo](https://github.com/ccusage/ccusage), v20.0.50, 2026-11-11): reads those
  local logs and prints daily / weekly / monthly / session reports (`ccusage claude daily`). I did
  not run it, so I have not checked how it handles subagent files or duplicates.
- **OpenTelemetry** ([monitoring](https://code.claude.com/docs/en/monitoring-usage.md)):
  `CLAUDE_CODE_ENABLE_TELEMETRY=1` and `OTEL_METRICS_EXPORTER=otlp|console|...`. Metrics
  `claude_code.cost.usage` (USD) and `claude_code.token.usage`, splittable by `agent.name` and
  `plugin.name`; event `claude_code.api_request` with `cost_usd`; `OTEL_RESOURCE_ATTRIBUTES` can tag
  a run (e.g. `arm=symcc,run=3`). The docs say "Cost metrics are approximations".
- **Real billing**: on an API key, the Claude Console cost page and the Claude Code Analytics API;
  using a separate workspace or key per arm gives billed numbers.
- **Headless runs**: `claude --print --output-format json|stream-json`, `--model`,
  `--max-budget-usd`, `--plugin-dir`, `--session-id` exist in 2.1.319 (`claude --help`). Whether
  symcc's lead and board work fully under `--print` I did not check.
- **symcc's own `/symcc-stats` is not enough** for this:
  - It counts only worker tries. The lead's tokens are not in it, and "Scout runs aren't counted"
    (`docs/guide.md:565`).
  - Its "tokens" add input, output, cache reads and cache writes together
    (`hooks/core/runs.ts:66-72`), and the worker result has no dollar cost
    (`hooks/core/runs.ts:67`). Cache reads are cheap: 0.05x the input price on Opus 5.5 and
    Sonnet 5.5 ([pricing](https://platform.claude.com/docs/en/about-claude/pricing.md)). So the
    total is not a cost and can't be compared with plain Claude Code.

  Use full-session dollars per model from the logs (or OTel or billing) for both arms.

## 4. Recommended method for symcc

### Metrics (per run, then per arm)

1. **Cost per merged task that passes hidden tests**: total session dollars (lead, workers, scouts
   and the plain session alike) divided by the number of requests whose change is on main and passes
   that request's hidden tests. Also report total dollars and dollars per request.
2. **Wall-clock time** from the first request to the last change on main.
3. **Owner interventions and owner minutes**: messages the owner had to send beyond the script,
   approvals, answered questions; plus time spent (logged by the driver, not self-reported).
4. **Hidden test pass rate** per request and for the whole suite at the end.
5. **Regressions**: hidden tests for earlier requests that fail at the end ("nothing broken").
6. **Forgotten requests**: scripted requests with no matching change.
7. **Rework rate**: requests that needed a second try, a fix-up commit, or an owner correction.
8. **Blind review score**: a reviewer (person, or a fixed model prompt) scores each final diff
   with a rubric (correct, minimal, readable, fits the codebase), without knowing the arm.

### The "project session" benchmark

- 2-3 small or medium repos the models are unlikely to have seen (private, or new code), each with
  a good test suite.
- 15-25 scripted owner requests per repo, written as a real owner would type them: some
  independent (parallel work), some that depend on earlier ones (ordering), several touching the
  same files (clashes), one or two vague (questions), and one or two late changes of mind.
- Hidden tests for every request, kept outside the repo and run only at the end and per request.
- A fixed start commit and a fixed order and timing for the requests.

### Arms

- A: plain Claude Code. B: Claude Code with symcc. Same model and Claude Code version, same
  settings (effort, permission mode), same start commit, same request script, same machine.
- Optional C: plain Claude Code with its own subagents or agent teams, to separate "symcc" from
  "more agents".

### Runs and spread

- Agent runs vary a lot. Do at least 3 runs per arm per repo in the pilot and 5 or more in the
  main study (my suggestion, not from a source).
- Report mean and median with the spread (min-max or a 95% interval), and the per-repo numbers, not
  just one total. Treat requests within a run as linked, not independent; see "Adding Error Bars to
  Evals" ([arXiv:2411.00640](https://arxiv.org/abs/2411.00640)) for paired comparisons and
  planning sample size.

### Automating the owner's side

- A driver script sends each scripted request at its set time and answers questions from a fixed
  answer sheet; anything not on the sheet gets a fixed "decide yourself" reply and is counted as
  an intervention.
- Same driver for both arms. How the driver talks to an interactive session (Agent SDK, `--print`
  with `--resume`, or a terminal tool) is not decided; check that symcc works in that mode first.
- Tag each run (`OTEL_RESOURCE_ATTRIBUTES` or a separate API key per arm) and copy the
  `~/.claude/projects/...` logs after each run.

### Blind grading

- Strip arm traces from the final diffs (symcc branch names, task ids in commit messages, board
  files) before review. Shuffle the order. Use the same rubric and the same grader for all.

### Pilot first, and a budget

- Pilot: 1 repo, about 10 requests, 2 runs per arm. Goal: check the driver, hidden tests and cost
  capture work, and get a rough cost per run. Only then size the main study.
- Budget: set `--max-budget-usd` per run (if it works for the setup) and a total cap. Size it from
  the pilot: cost per run x arms x repos x runs. Public anchors: the SWE-bench Pro paper capped
  agents at $2 per task; the Aider polyglot gpt-5 (high) run cost $29 for 225 small tasks. A
  20-request session with several workers will very likely cost much more than one SWE-bench task
  (a guess; the pilot will tell).

### Optional public check

To show symcc doesn't hurt single-issue quality, run a small fixed slice (for example 30-50 tasks
of SWE-bench Pro V2 public, or HARD-51) through Harbor's `claude-code` agent with and without symcc.
This needs a plugin install step that I did not find in Harbor. It can't show the multi-task benefit.

## What I could not check

- I did not run any benchmark, ccusage, OTel export or Harbor; all figures are from the pages cited.
- Licences and run cost for most feature-level benchmarks; the FEA-Bench task count.
- Whether symcc works under `claude --print` or inside Harbor's container.
- Whether `--max-budget-usd` counts workers and scouts started by a plugin.

## Recommended next step

Make a follow-up task to build the pilot: one repo, about 10 scripted requests with hidden tests, a
driver script, and a small log parser that sums dollars per model across the session file and its
`subagents/` folder (counting each `message.id` once). Then run 2 runs each of plain Claude Code and
symcc. A separate small task could make `/symcc-stats` report lead and scout usage and a dollar
estimate, so symcc's own numbers can be checked against the logs.
