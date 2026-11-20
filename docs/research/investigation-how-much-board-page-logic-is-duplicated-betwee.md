# How much board page logic is duplicated between Claude Code and OpenCode?

Kept from task T-569 (answer written in `.symcc/reports/T-569-try-1.md`). Nothing here was run or re-checked: the line counts are estimates from reading the code.

## The question

How much board page logic is copied between Claude Code (terminal and VS Code) and OpenCode, and what would it take to move the page contents into shared core?

## Short answer

Every page has two or three copies. They agree on what to show and which keys and actions exist, but each copy writes those rules again. About 900-1,000 lines out of roughly 4,400 lines of page code are this kind of duplicate "what to show" logic (an estimate, not a measurement). Several copies have already drifted apart.

OpenCode's `hooks/opencode/board-view.ts` is already the plain-data shape wanted: colored lines, each with what a click does, plus key hints. So the cheapest path is to move those page builders into core, add the missing parts, and have the Claude Code terminal draw from them too. VS Code keeps its own layout but takes its labels, sections and actions from the same data. The task page has the most duplication and the most value. Start with its actions and its "what does it ask" rule.

## 1. Where each page is built

All `ui/` paths are under `hooks/claude/`. `board-view.ts` line numbers are in `hooks/opencode/board-view.ts`.

| Page / part | Claude terminal | VS Code | OpenCode | Rough duplicate lines |
|---|---|---|---|---|
| Band / strip | `ui/above-prompt.tsx` (88) | same file | `board-view.ts` `bandDraw` :188-226 | ~35 (nearly line for line) |
| Board list | `ui/list.tsx` (190) | `ui/vscode-list.tsx` (233) | `listBody` :629-696 | ~120 |
| Task page | `ui/task-page.tsx` (481) | `ui/vscode-task.tsx` (443) | `openedPage`, `asksWhat`, `answerOptions`, `panelKeys` (~70) | ~250 |
| Question page | `ui/question-page.tsx` (80, both looks) | same file | `openedPage` :711-716 | ~20 |
| Scouts list, page, run | `ui/scouts-page.tsx` (232) | `ui/vscode-scouts.tsx` (282) | `scoutsBody`, `scoutPage` :411-494 | ~150 |
| Settings list, pick / edit | `ui/settings.tsx` :478-643 | `ui/vscode-settings.tsx` (115) | `settingsBody` :582-625, plus the settings press in `tui.ts` (~25) | ~80 |
| Roles / Kinds list and page | `ui/settings.tsx` :1-476 | `ui/vscode-roles.tsx` (426) | `viewDefs`, `defsList`, `defPage` :73-100, :501-578 | ~250 |
| Key hints | `core/panel.ts` `taskKeys`, `scoutKeys` and others :435-565 | none (buttons only) | `panelKeys` :312-338 (its own copy) | ~40 |

**The same in every copy (the logic):**
- which sections show, in what order, with what headings
- the empty-state texts, e.g. "(no runs yet)", "(none: a plain worker)", "(not loaded yet: run /symcc-scouts)"
- which actions a status offers, and their labels and keys
- when a task "asks" you something, and the answer choices
- the rules for whether a role can be turned off or reset, and the "6 roles · 1 off" count

**Only drawing:** Ink Boxes, Buttons and focus in the terminal; badges, folds, callouts and Markdown in VS Code; the "›" cursor, click areas and mouse wheel in OpenCode. The color names (`claude`, `ide`, `inactive`, ...) are already shared.

**Sharing that exists today:** rows use core helpers (`panelSections`, `rowExtra`, `fitRow`, `detailRows`, `scoutRow`, `settingInfo`, `settingChoices`, `answerChoices`). The key-hint lists in `core/panel.ts` are shared by the Claude screens, but OpenCode keeps its own copy.

### Copies that already drifted apart

1. **Task dates.** Claude uses `when` in `hooks/app/tools.ts:22` (local time, like "Nov 11, 09:30"). OpenCode has its own `when` (`board-view.ts:273`) that just cuts the stored ISO string. That string is UTC (`hooks/app/store.ts:10`), so OpenCode shows UTC times as if they were local.
2. **Role and kind text on the task page.** Claude passes roles and kinds to `detailRows` (`task-page.tsx:236`). OpenCode passes `roles: []` and no kinds (`board-view.ts:720`), so it shows no role description, role model or kind description. The view file has carried roles and kinds since T-562.
3. **Footer hints vs buttons on the Claude task page.** Buttons are listed in `task-page.tsx:343-380`, hints in `taskKeys` (`core/panel.ts:455`), and VS Code has a third list in `vsActions` (`vscode-task.tsx:102`). The hints leave out p pause, u resume, h already merged and n needs review. They also leave out r retry for a dropped task, though that button exists. They show x drop only for backlog and failed tasks, while the Drop button takes x for every open task not in review.
4. **Text of a waiting task's question.** Claude shows `t.question`, or "(no question)" (`task-page.tsx:259`, `:432`). OpenCode shows `t.question || t.note || 'it waits for your answer'` (`board-view.ts:752`).
5. **Question rows in the band.** Claude always adds " — " plus the options, so a question without options ends in a stray " — " (`above-prompt.tsx:73`). OpenCode adds it only when there are options (`board-view.ts:214`).

Smaller ones:
- Question page title: "Q-3  Question for you" plus an "asked by the lead · time" line in Claude (`question-page.tsx:36-40`); "Q-3  <the question>" and no time in OpenCode.
- Backlog starts open in OpenCode (`GROUPS_OPEN`, `board-view.ts:249`) and closed in Claude (`app/state.ts:122`).
- Done is grouped by day in Claude and flat in OpenCode.
- OpenCode drops "(Enter to show all)" but offers no other way to show the whole backlog.
- Scout key order is r, e, p in Claude and r, p, e in OpenCode.
- Claude says "r reset to built-in", OpenCode "r reset".
- After an answer, OpenCode tells the lead only if the task's state really changed (`opencode/tools.ts:165-167`). Claude always tells it (`task-page.tsx:272`).
- The status color map is copied word for word (`list.tsx:96` and `LIST_TONE`, `board-view.ts:270`). The role turn-off and reset rules are written three times (`settings.tsx:78-79`, `vscode-roles.tsx:174-175`, `board-view.ts:85-96`).

OpenCode's task page also lacks whole parts: why it failed, the answer, history, report, runs, changes, and most buttons (only approve, reject and answer). That is missing work, not drift.

## 2. Proposed shape

Add `hooks/core/pages.ts` (or `core/pages/`) next to `panel.ts`, built mostly by moving `board-view.ts` into core:

```
type PageLine = { segs: Seg[]; action?: ActionId | { open: string } | ... }
type Page = { head: PageLine[]; sections: { id, title, lines: PageLine[], fold?: boolean }[];
              actions: { id, label, key?, main? }[]; boxes?: (pick | text box)[] }
```

- Builders like `taskPageModel(task, facts, state)`, `scoutPageModel`, `settingsModel`, `defPageModel`, `bandModel` and `listModel` take the view, what was already read (report text, changed files, scout runs) and a small shared page state (open groups, which answer box is open). They read nothing and draw nothing.
- Key hints come from `actions`, so hints and buttons cannot drift again.
- Each host turns an action id into a call: Claude Code uses `runTool` and the app functions; OpenCode uses `actionCommand` slash commands.

**Stays per host on purpose:**
- **Terminal:** Ink Buttons and focus (`autoFocus`, hotkeys, `buttonRows`), text boxes, the search box, the diff view.
- **VS Code:** its look (cards, badges, folds, callouts, Markdown, at most one primary button, no key hints).
- **OpenCode:** mouse clicks and the wheel, its dialogs for prompts and pick lists, the "›" cursor, and `tui.ts` key binding.

## 3. Costs and risks

- **Snapshot tests.** `tests/task-page-snapshot.ts`, `board-snapshot.ts`, `scouts-settings-snapshot.ts`, `roles-kinds-snapshot.ts` and `task-page-mobile-snapshot.ts` hold the exact drawn trees and say they "must stay exactly as they are". If the terminal draws from a model, nested `Text` trees may change shape. Each task should keep the trees identical (best, since that proves nothing changed) or recapture them once, with the owner's OK.
- The VS Code tests (`tests/vscode-*.tsx`, about 1,300 lines) and `tests/pane.test.tsx` (2,216 lines) find buttons by label and key, so they mostly survive if labels stay the same.
- `hooks/opencode/tests/opencode-tui.spec.ts` (972 lines) checks `board-view` output directly and would follow the move.
- **Fixing a drift changes what a host shows.** Each drift needs a pick of which behavior wins. Some differences are on purpose: OpenCode has no search, no diff and no new role or scout (it sends you to the lead); VS Code has no key hints.
- **Performance:** fine, in the author's judgment. Builders are plain functions on loaded data. OpenCode redraws every second (`REFRESH_MS`, `tui.ts:34`), and Claude already rebuilds on each render. Slow work (diff, report files) stays outside the builders. A bigger OpenCode view file (history, reports) is a size question: read reports on demand, as scout reports already are.
- **Hard parts:**
  - Ink focus: which button gets `autoFocus` and how hotkeys clash (x is reject in review but drop elsewhere; number keys go to answer choices before report tries). The model should carry key and focus hints, and the terminal drawer must follow them exactly.
  - VS Code's layout moves things around (Retry sits inside the "Why it failed" box, some sections fold). It should reuse only labels, actions and section contents, not line order.
  - The Claude task page mixes press handlers (merging state, toasts, notes to the lead) with drawing. Those handlers move to an app-level "do action X" layer, not into core.

## 4. Plan of small tasks, in order

1. **Task page actions and "what it asks" in core** (most value; start here). One `taskActions(t, ctx)` replaces the button list in `task-page.tsx`, `vsActions`, `taskKeys` and OpenCode's `panelKeys`, plus one shared asks/choices rule replacing `answerable` in `task-page.tsx` and `asksWhat`/`answerOptions` in OpenCode. Fixes drifts 3 and 4, and gives OpenCode pause, resume, retry, drop and the other actions.
2. **Shared date and role facts on the task page.** One `when` in core; pass roles and kinds in OpenCode (drifts 1 and 2). Tiny.
3. **Band model** (`bandModel` in core, both bands draw it). Small, nearly identical today, and a good first try of "model plus drawer". Fixes drift 5.
4. **Task page sections model** (why it failed, answer, details, what to do, changes, history, report, runs). Terminal and OpenCode draw it; VS Code takes the sections' contents. OpenCode gains history and reports.
5. **Board list model.** Questions, NEEDS YOU, running, then the folded groups with Done by day. Settle the backlog-open default and "show all".
6. **Scouts list, page and run model.** The pages are already near line-for-line copies.
7. **Roles / Kinds list and page, and the Settings list.** One `defRow` and `defPage` model with the turn-off and reset rules in core, shared by OpenCode's `viewDefs` and Claude's `settings.tsx`.
8. **Question page model** (title, "asked by" line, choices).

Each task: keep the snapshot trees identical, or say up front that they will be recaptured.

## How it was found

By reading the page files for each host. No tests or screens were run. Line counts are estimates. Whether each drift is a bug or an unwritten choice was not checked; for drifts 1, 2, 3 and 5 nothing in the code suggests they were on purpose.

## Recommended next step

Queue task 1 (shared task page actions and asks rule) with `hooks/core`, `hooks/claude/ui`, `hooks/opencode` and `tests/` as its files. Before it starts, decide which behavior wins for the two drifts it touches: the hint/button mismatch and the waiting-question text.
