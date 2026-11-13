# eval: plain Claude Code vs symcc on a scripted project session

This harness follows the method in [docs/research/evaluation.md](../docs/research/evaluation.md)
(section 4). It plays the same list of owner requests on two **arms**:

- `plain`: Claude Code on its own;
- `symcc`: the same Claude Code with this symcc checkout loaded (`--plugin-dir`).

Same model, same Claude Code version, same settings, same start commit, same script, same machine.

> **Token budget warning.** A real run (`--agent claude`) starts real Claude Code sessions and is
> billed. One symcc run starts a lead plus several workers, and published numbers say multi-agent
> setups use many times more tokens than one chat. The cost of one run is not known yet: that is
> what the pilot is for. Run the pilot first, look at the numbers, then decide on a full run. The
> harness refuses `--agent claude` unless you add `--yes`. Budgets are in `session.json`
> (`budget`): minutes per run, billed-equivalent tokens per run, and `--max-budget-usd` per call.
> The token budget is only checked between messages, so a run can go over it during one long reply.

## What it measures

One row per run in `results.csv`:

| column | meaning |
|---|---|
| `input_tokens`, `output_tokens`, `cache_write_tokens`, `cache_read_tokens` | the whole team (main chat and every subagent: symcc workers and scouts), read from that run's Claude Code logs. Kept apart because they cost very different amounts (a cache read costs about a tenth of an input token) |
| `billed_equiv_tokens_est` | **estimate**: input x1 + cache write x1.25 + cache read x0.1 + output x5, in input-token units. Rough, not a bill |
| `billed_equiv_per_passed_request_est` | the same divided by the number of requests whose hidden tests pass |
| `api_calls`, `subagent_calls` | API messages counted (each `message.id` once), and how many came from subagents |
| `wall_min` | minutes from the first message to the end of the run (after symcc's board went quiet) |
| `last_commit_min` | minutes until the last commit on `main` (empty if nothing was committed) |
| `owner_interventions` | owner messages the script did not have: questions answered with the "decide yourself" reply, and approvals |
| `scripted_answers` | questions answered from the answer sheet (not interventions) |
| `hidden_passed`, `hidden_total`, `hidden_pass_rate` | requests whose hidden test passes at the end |
| `regressions` | requests whose hidden test passed at a checkpoint during the run but fails at the end |
| `forgotten` | requests that fail and whose files were never touched |
| `visible_tests_ok` | the repo's own tests pass at the end |
| `lint_errors`, `type_errors` | pyflakes (or compileall if it is missing) and mypy on the final code; empty if the tool is missing |

`summary.md` gives, per arm, mean / median (min-max) over runs for each metric, and how many runs
passed each request's hidden test. Each run folder (`runs/<arm>-r<n>/`) keeps `run.json` (all numbers,
tokens per model, changed files), `events.json` (every message sent and received, with times) and
`logs/` (a copy of the Claude Code logs, since Claude Code deletes old ones).

### How tokens are counted

Claude Code writes each session to `~/.claude/projects/<folder>/<session>.jsonl` and its subagents to
`<session>/subagents/*.jsonl` (`<folder>` is the project path with every non letter or digit turned
into `-`). That folder holds **every** session ever run in that path, so each arm and each run gets its
own new project path (`<work dir>/<time>/<arm>-r<n>/project`), and the harness reads only that run's
folder (plus any folders for paths inside it, such as worker worktrees). Every assistant line with
usage counts, main chat and subagents alike, each `message.id` once. The same reader is used for both
arms; `/symcc-stats` is not used.

## The sample session: `sessions/inventory`

A tiny Python stock list (library and command line tool, standard library only) with 10 requests in
`session.json`:

- independent ones (R02, R04, R06, R07) that can run in parallel;
- ones that depend on earlier ones (`after`: R03 needs R01's prices, R09 needs R04 and R05, ...);
- several that share files (`inv/store.py`: R01, R02, R03, R06; `inv/cli.py`: R04, R05, R08, R09;
  `inv/report.py`: R07, R10);
- one vague request (R08, "make it remember") with the answer on the answer sheet;
- one change of mind (R09 changes R04's output).

Each request has `send_at_min` (when the driver sends it) and a hidden test in `hidden/`. The hidden
tests, the answer sheet and `reference/` (a solution that passes everything, used by the
`fake-reference` agent) stay inside this repo; the agents work in a copy of `repo/` only, in a folder
outside this repo (the harness refuses a work dir inside it).

To add a session, copy the folder layout: `repo/` (start code), `hidden/` (one test file per
request), `session.json`.

## How the driver plays a run

1. Copy `repo/` to a new folder and make one commit on `main` (fixed author and date, so the start
   commit is the same every time).
2. Send the arm's `setup` messages (symcc: the test command and auto mode).
3. Send each request at its `send_at_min`. If the reply ends with a question, answer from the answer
   sheet (keywords; the entry for the current request wins), otherwise send `default_answer` and count
   an intervention. At most 3 rounds per message.
4. After each request, run the hidden tests of the requests sent so far on a copy (for regressions).
5. symcc keeps working after it replies, so the driver then watches `.symcc/board.json`: it approves
   tasks in review and answers open questions (each counted), and sends a status message every
   `settle.poll_every_min` until no task is open, or `settle.max_min` passes.
6. Stop when the time or token budget is used up (status `budget_hit`).
7. Grade the final working tree of the project folder (both arms the same way), count tokens, copy logs.

Arms alternate within each round (plain r1, symcc r1, plain r2, ...).

## Running

Python 3.9+ and git; pyflakes and mypy are optional. From the repo root:

```sh
# Self-tests of the harness
python3 -m unittest discover -s eval/harness

# Dry run: a fake agent that makes no model calls and changes no code (0 of 10 should pass).
# It writes made-up logs into a throwaway Claude home, so the token reader is exercised too.
python3 eval/harness/run.py --agent fake --runs 2

# Same, but the fake agent drops in the reference solution at the end (10 of 10 should pass)
python3 eval/harness/run.py --agent fake-reference --runs 1
```

Results go to `eval/results/<time>/` (ignored by git); `--out` picks another folder. Fresh project
copies go to `~/.symcc-eval/work/` (`--work-dir`). Rebuild the tables from saved runs with
`python3 eval/harness/results.py eval/results/<time>`. [`dry-run/`](dry-run/) holds the tables from
one dry run.

### Pilot (real, costs money)

First check by hand that symcc works headless: the real agent runs `claude --print` with
`--session-id`, then `--resume` for every later message. Whether symcc's lead, board and workers keep
going in that mode was not checked (see "What I could not check" in the research note). Try one
request in a scratch folder with `claude --print --plugin-dir <this repo> ...` and see whether a task
appears on the board and gets merged. If not, the driver needs another way to talk to the session
(Agent SDK, or a terminal tool) before any numbers mean anything.

Then, 1 session, 2 runs per arm:

```sh
python3 eval/harness/run.py --agent claude --model claude-opus-5-5 --runs 2 --yes
```

`--permission-mode` defaults to `bypassPermissions` so no one has to click; the agents only work in
throwaway copies, but they can run any command on this machine. Use a machine or account you are
fine with that on. Note the cost and time of each run, and check `events.json` for questions the
answer sheet missed.

### Full run

After the pilot: 2-3 sessions of 15-25 requests each, 5 or more runs per arm, sized from the pilot's
cost per run (cost per run x arms x sessions x runs). Run each session with `--session
eval/sessions/<name>`. For real billing numbers, use a separate API key or workspace per arm. Compare
runs, not requests (requests in one run are linked), and report the ranges, not only the means.

## Not done yet

- A blind review score of the final diffs (research note, metric 8).
- Owner minutes (only intervention counts are kept).
- Rework rate (second tries, fix-up commits).
- An optional third arm (plain Claude Code with its own subagents).
