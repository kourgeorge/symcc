# Idea: answer the lead's pop-up question from the board

Kept from task T-401.

## Question

Can symcc answer the lead's pop-up question (`AskUserQuestion`) from the board, using a `tool.call` or `ui.render` hook, so the dialog closes when the owner answers on the board?

## Answer

Yes. A plugin's `tool.call` hook on `AskUserQuestion` can open the normal dialog by calling `next(e)`, then answer the question itself before the owner clicks. The engine closes the open dialog on its own. The model reads the plugin's answer as if the owner had picked it, and the chat shows "User answered Claude's questions: ... -> Blue". So symcc could keep the pop-up buttons and have the dialog close when the owner answers on the board. `ui.render` is not needed.

### What exists (from the type files)

- `.claude-plugin/types/claude-code/index.d.ts:4162-4164` (`tool.call`): `{ result }` answers in place of `next`. Returning while `next` is pending aborts what runs beneath. This is the mechanism.
- `index.d.ts:5345-5364` (`HookBudget`, `ms: 10_000`): the 10-second budget only counts the hook's own code. The clock stops while a `next(e)` call is in flight, so a hook can wait minutes for the owner.
- `.claude-plugin/types/claude-code-tools/index.d.ts:4398-4443`: the result shape is `{ questions, answers: { [question text]: answer } }`. A multi-select answer is comma-joined. `response`, `annotations` and `followUp` are optional.
- `index.d.ts:10524-10538`: `ui.render` on `AskUserQuestion` only restyles the questions. It cannot answer or close the dialog.
- `index.d.ts:2381-2390`: `$.ui.notice(tool_use_id, text)` puts one line under an open dialog (for example "also on the board as Q-3"). Core removes it when the call ends. Not tried.
- `index.d.ts:2465-2477`: `$.ui.ask` is the plugin's own way to open a dialog. Not needed here.

### Not checked

- VS Code, desktop and phone dialogs (only the terminal was tested; the abort happens inside the engine, so other surfaces probably close too).
- `$.ui.notice` under the dialog.
- Calls with several questions, multi-select, and "Type something".
- Worker dialogs (symcc already keeps `AskUserQuestion` away from subagents, `hooks/claude/agent-types.ts:62`).
- OpenCode. Its question tool was not looked at.

### Recommended next step

Only worth building if the owner misses the pop-up buttons. If so, make a small change in `hooks/register.tsx` (the existing `tool.call` hook) and `hooks/app/questions.ts`:

- When the lead (no `agentId`) calls `AskUserQuestion` with one question, also put it on the board as a Q-n.
- Race `next(e)` against a promise that `answerOnBoard` resolves.
- If the board answers first, return `{ result: { questions, answers } }` and skip the usual board update to the lead.
- If the owner answers in the dialog first, close the Q-n as answered in the chat.
- Optionally use `$.ui.notice` to show "or answer on the board (Q-n)".
- Then undo T-396's "never use AskUserQuestion" wording, which `tests/board-questions.test.ts`, `tests/no-panel.test.ts:204-215` and `tests/merge.test.ts:2216` check.
- Before merging, check by hand that the dialog closes in VS Code.

## How it was found

A throwaway plugin in /tmp was run interactively in tmux on Claude Code 2.1.319 (`claude --plugin-dir ... --model haiku`, installed symcc turned off). The hook opened the dialog with `next(e)` and raced it against a timer standing in for a board answer. If the timer won, the hook returned the answer "Blue". Three runs:

1. Timer after 8 s: the dialog closed by itself and the model replied "You answered: Blue." The `next(e)` call underneath ended with core's "The user doesn't want to proceed..." rejection, but the hook's answer counted.
2. Enter pressed in the dialog first: `next(e)` returned the normal result ("Red"). The hook passed it on, so it can see the dialog answer and close the matching board question.
3. Timer after 25 s (past the 10-second budget): same result. Long waits are fine.

The probe files were deleted and the worktree had no changes.
