# Design: symcc as a general command center, not just for code

Research note from task T-1130 (2026-11-26). It keeps that task's answer so later tasks can read it.

## The question

How could symcc become a general command center, for work that isn't only code changes, and
what are the smallest steps to get there?

## Short answer

symcc can become a general command center without a second system. Errands are already the
general task. What they lack is the safety that code tasks have: a list of places they may act,
a check of the result, and a stop before anything leaves the machine. Add those three to
errands. Then let the board live in a plain folder, and let scouts read outside sources. Do it
in that order, as about 7 small tasks. Wording (T-1129) and errand safety come first, because
they are small, touch no git code, and make every later step safer.

## How it was found

Only read-only commands were run; nothing was changed. The work read
`.symcc/reports/T-971-try-1.md` (a git-ignored report, not in the repo), `docs/workspace-model.md`
(the T-978 write-up of the 2026-11-24 decisions) and
`docs/research/probe-one-workspace-board-over-several-repos-what-breaks-wha.md`, then checked
the code. Line numbers below are from the code as it was on 2026-11-26; they may have moved.

## What exists today (checked)

- **Errand kind** (`kinds/errand.ts`, `hooks/core/board-file.ts:158-171`): "general work that
  isn't a change to the project". `isInvestigation()` is true for errands too, so they skip the
  commit, tests, checker and merge. When the worker hands back, the task ends done on its own,
  in every mode (`hooks/app/workers.ts:1356-1362`). No one checks the result.
- **Where an errand may act:** nowhere is this stated. The path guard only refuses paths inside
  the project folder; anything outside it (such as `~/Documents` or `/tmp`) is allowed
  (`hooks/core/path-guard.ts` `editOutsideFolder`, and `bashOutsideFolder` at about line 150).
  So an errand can touch any folder outside the repo, limited only by the host's own
  permissions.
- **Leaving the machine:** the git guard refuses push and fetch (`hooks/core/git-guard.ts`).
  Nothing guards `curl`, `gh issue comment` or similar commands in Bash; no such check was found
  in `hooks/core` or `hooks/app`.
- **Connectors:** workers get a fixed tool list, `BASE_WORKER_TOOLS` (Read, Edit, Write, Glob,
  Grep, Bash), plus `web` (`hooks/claude/agent-types.ts:24-28`). Scouts get `SCOUT_TOOLS` plus
  read-only board tools (`agent-types.ts:37-43`). So neither workers nor scouts can use MCP
  connectors (email, calendar) today.
- **Checker:** one setting for the whole board, `checker: true` (`hooks/core/checker.ts:20`). It
  runs only for change tasks (`workers.ts:1914`, `!isInvestigation`). Its prompt already judges
  work against "done when" (`prompts/checker.ts:14`, `roles/checker.md:12`). Kind files have
  only `description` and `off` (`hooks/core/kinds.ts:3-4`). There is no per-kind checker
  setting; a memory note says "optional checker setting", but it isn't in the code.
- **Git is required for everything:** the pump starts nothing until git is ready
  (`workers.ts:119`), and every task, errands too, gets a worktree first (`workers.ts:192`).
- **Scouts:** they only look and report. Their write calls are refused
  (`hooks/core/scouts.ts:25-33`). The `findings: auto|backlog` setting exists. The 11 example
  scouts in `examples/scouts/` are all about code.
- **Chat intake (T-1098):** a message from a chat app turns on chat mode
  (`hooks/register.tsx:143-145`), and replies are posted back with that server's reply tool
  (`hooks/core/dam.ts:28`). The owner can already give orders from Telegram or Slack.
- **Wording:** the lead guide and tool texts in `hooks/app/tools.ts` say "merg…" 119 times.
  T-1129 is meant to clean this up; what it has changed so far was not checked.

## The design, part by part

| # | Code-only today | Smallest change | Cost |
|---|---|---|---|
| 1. Wording | Lead guide, results and history say "merged" for everything | T-1129: say "merged" only for change tasks. Errands say "done" and investigations say "answered". | Small: text plus tests that check exact wording |
| 2. Errands safe and checkable | No list of places, no check, done on its own | (a) An optional `where` on the task: the folders it may write, plus the services it may use. The path guard treats these folders as the worker's own and refuses writes anywhere else. (b) "Done when" is required for errands. When the checker setting is on, the checker reads the report and the named folders and judges it against "Done when", without running tests. With the checker off, or for anything it can't check, the errand waits in review like an investigation. | Medium: reuses the path guard and the checker. No new kind and no new setting. |
| 3. Board outside a git repo | The pump needs git; every task needs a worktree | Already the T-978 plan. Repos are projects below the workspace folder. A task with no project runs in `<workspace>/.symcc/work/T-n` with no git and no merge. Only change tasks need git. | Large: the probe counts about 110 git calls. Its two safety fixes come first. |
| 4. Outside actions | No connectors; Bash can send things out silently | A role tool word like `mail` or `calendar` that each host maps to MCP tools, the same way `web` maps to WebSearch and WebFetch. A sending tool call (send, reply, create event) becomes a question to the owner, using the existing ask flow, unless the task's `where` names that service. Drafts stay local. | Medium. Not confirmed: whether a plugin agent type can list `mcp__<server>__*` tools (T-971 left this open). It needs a probe first. |
| 5. Intake and routines | Scouts only look at code | Intake: example scouts (`intake-github`, `intake-email`) with `findings: backlog`; outside text is treated as data. Routines: a scout files a task (an errand with a `where`) instead of acting itself, so every action still goes through a task, its guard and its check. | Small for GitHub (instructions only, no tool). Small after #4 for email. |

`where` and `intake-github` / `intake-email` are proposed names; they don't exist yet.

## What keeps the trust for non-code work

For code, the trust comes from: its own copy, a file list, tests, the checker, and a merge you
can undo. For non-code work it would come from:

- **Its own place:** `where` plays the part of the worker's copy and its file list.
- **A written goal:** a required "Done when" plays the part of the tests.
- **A second agent's check:** the existing checker, run on the report, plays the part of the
  checker for code.
- **Nothing leaves the machine without a yes:** sending asks first, which plays the part of
  review before merge.
- **A record:** the report and history stay on the task. Sending is the main thing that can't be
  undone the way a merge can, so sending must ask first by default.

## What to keep out

- No second task system, no workflow engine, no new kinds beyond errand.
- No per-kind settings, and no "routine" object (a routine is a scout that files tasks).
- No due dates or reminders, and no tasks the owner does themselves (the 2026-11-24 decisions).
- No connector setup screens (the host's own MCP setup is used).
- No auto-send setting: the only way past the ask is naming the service in the task's `where`.

## Recommended order (each a small task)

1. **Wording (T-1129).** Done when: the lead guide, tool texts and history use "merged" only for
   change tasks, and the tests check this.
2. **Errands need "Done when", and wait for you without the checker.** Done when: `add` with
   kind errand and no "Done when" is refused, and an errand on a board with the checker off ends
   in review.
3. **Errand `where` (folders).** Done when: an errand worker's write outside its `where` folders
   and its copy is refused, and a write inside them is allowed (a path-guard test).
4. **Checker for errands.** Done when: with the checker on, an errand's report goes to the
   checker, and a missing part of "Done when" sends it back (a fake-host test).
5. **Ask before sending (probe, then build).** Done when: a probe in /tmp shows whether a plugin
   agent type can get `mcp__<server>__*`. Then a role word like `mail` gives those tools, and a
   send call without the service in `where` becomes an owner question.
6. **GitHub intake scout** (instructions only, as T-728's first step). Done when:
   `examples/scouts/intake-github.md` with `findings: backlog` files issues as backlog tasks,
   judged for a week.
7. **Workspace board** (T-978's build order, starting with its two safety fixes). Done when: a
   no-project errand runs in a plain folder with no git, and a session in a copy of a repo below
   the workspace is guarded.

## Not checked, or guesses

- Whether MCP connector tools reach symcc's background agents, and whether a single tool (not a
  whole server) can be listed.
- Whether the checker can judge a report about files outside its copy with only read tools.
  Likely yes, since it has Read and Bash, but this wasn't tested.
- How the OpenCode, Node and Copilot hosts would map `mail` or `calendar`.
- What T-1129 has changed so far.

## Next step

Finish T-1129, then add tasks 2 and 3 (errands need "Done when" and wait for you, and the
`where` folder guard). They are the cheapest way to make general work as safe as code work, and
they need no git or connector changes.
