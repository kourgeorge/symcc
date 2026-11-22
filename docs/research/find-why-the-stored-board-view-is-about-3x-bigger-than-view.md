# Research: why the stored board view is about 3x bigger than view.json

Task T-828. Kept as a note by T-832.

## The question

The board view that the Claude Code panel stores (its `view` atom) was about 3 times bigger
than view.json, the file the OpenCode host writes. Why?

## Short answer

Nothing is stored twice, and nothing is JSON-encoded twice. Before the fixes, the Claude Code
panel's `view` atom held every done and dropped task in full: its history, details, answer, and
the origin's request and evidence. view.json never holds those for finished tasks, because the
OpenCode writer runs every task through `viewTask`, which cuts them out. Those cut-out parts were
the whole of the roughly 3x gap.

The fixes (commit da4a9d7e and T-827) removed most of it. A smaller gap remains on purpose:
finished tasks changed in the last 2 days stay in full in the atom. Nothing needs fixing unless
you want the atom as small as view.json.

## Where the difference comes from

- `publish()` in `hooks/app/lead.ts` (about line 506) builds the view with `tasks: b.tasks`.
  That is the board after `load()` has joined each finished task back with its full parts from
  `.symcc/tasks/T-n.json` (`joinParts`, `hooks/app/store.ts`, about line 387). Before da4a9d7e
  (08:30 on 2026-11-22), `hooks/claude/panel.ts` stored that value as it was.
- view.json is written only by the OpenCode host (`hooks/opencode/view.ts`, about line 52). It
  uses `tasks: v.tasks.map(viewTask)`. `viewTask` (`hooks/core/board-parts.ts`, about line 158)
  removes `VIEW_LEFT_OUT = ['history','details','test_output','answer','suggested','research_notes']`
  and the origin's `request` and `evidence` from every finished task. It keeps only the
  `history_marks` times and a `parts` file name.
- view.json also has extra fields the atom doesn't have: `scout_runs`, `scout_results`, `roles`,
  `kinds`, `changes` and `org_mem`. So the gap in the tasks alone is even bigger than 3x.
- `archived` is just a few totals (86 characters) and `archived_done` is a list of ids (about
  6 KB for 600 ids). Neither matters for size. The archive's task contents are never in the view.
- The `{shape, value}` wrapper adds 27 characters. There was no sign of JSON being encoded twice.
  Even if it were, it would add only about 15%, not 3x.

## Is the gap still there after T-827?

Mostly not.

- When the full view is over the 70% target (about 2.9 MB), `slimViewStep`
  (`hooks/core/view-slim.ts`) cuts down every finished task. The atom then lands within about 2%
  of view.json, as in the table below.
- When it is under the target, finished tasks changed in the last 2 days (`VIEW_WHOLE_MS`) stay in
  full on purpose. In a run with 150 finished tasks spread over 75 hours, the atom was 1,982,399
  characters and view.json 329,053, about 6x. That is still safely under the limit.

## How it was found

The real board could not be read: the checker's guard refused any command naming `.symcc` in the
main folder. So the numbers come from a made-up board run through the real `publish()` (with the
fake host from `tests/fake-host.ts`), with view.json written by the real `viewFilePanel`.

Each made-up finished task had 30 history lines of 300 characters, 2,000 characters of details, a
5,000-character answer on every third task, and a 1,500-character origin. Sizes are in characters
(`JSON.stringify(...).length`).

Board with 230 finished tasks and 15 open ones, all changed recently:

| field | atom before the fixes | atom after T-827 | view.json |
|---|---|---|---|
| tasks | 4,309,596 | 357,168 | 351,188 |
| archived_done | 6,001 | 6,001 | 6,001 |
| archived | 86 | 86 | 86 |
| kinds | 0 | 0 | 1,744 |
| **total** | **4,316,027** | **363,599** | **359,486** |

- In that board, the 230 finished tasks take 4,045,541 characters in full and 87,133 in
  view.json's cut-down form.
- Of the full size, history is 2,677,890, details 500,940, answer 414,580 and origin 384,330.
  Everything else is under 8 KB per field.
- With 400 finished tasks: 7.31 MB before, 0.43 MB after T-827, 0.42 MB in view.json.

## What could not be checked

- How Claude Code itself counts the stored value. Searching the installed binary
  (`~/.local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`) found none of the
  limit's error text. The type file only says that `$.store` refuses over 4 MiB of JSON text; the
  per-value limit of 4,194,304 isn't described there.
- The exact numbers for the real board. Also, view.json (07:27) was written at a different time
  than the failing atom, so the two were never exactly the same board.

## Possible next step

Leaving it as it is is fine; T-827 already handles the size. To make the atom as small as
view.json every time, store finished tasks always cut down. When one is opened, the Claude task
page would read its parts back with `withViewParts`, the way the OpenCode TUI already does
(`hooks/opencode/tui.ts`, about line 367). Today the Claude page shows a cut-down task's history
and details empty. That would be a small change task covering `hooks/core/view-slim.ts` and the
Claude task page.
