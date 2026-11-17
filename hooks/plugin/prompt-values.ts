// The values a worker's prompt is filled in with, for each task (see fillPrompt in hooks/core/prompts.ts). A role's
// checklist is filled in from the same values (see roleSection), for a worker and for a checker alike.
import type { SymccTask } from '../../types'
import { type Board, type BoardTask, kindOf, kindSection, ASK_TOOL, ASK_LINE, askedMore, intoOf, isCheckerOutput, checkerRetryText } from '../board'
import { taskBranch } from './git'
import { S } from './state'

/** A task's history without the "created by ..." line: what earlier tries did. */
export const tries = (t: SymccTask) => t.history.filter(line => !line.startsWith('created by '))

/** The last tries, as the prompts list them. */
const triesList = (t: SymccTask) => tries(t).slice(-5).map(line => `- ${line}`).join('\n')

/** The placeholders both prompts share. */
export const sharedValues = (t: SymccTask, dir: string): Record<string, string> => ({
  name: S.N.name,
  task_id: t.id,
  title: t.title,
  details: t.details,
  branch: taskBranch(t),
  folder: dir,
  // The task's kind and what it is for (from its kind file; see loadKinds).
  kind: kindSection(kindOf(t), S.kinds),
  // How a worker asks the owner and what a refused edit means (see hooks/plugin/ask.ts).
  ask: ASK_LINE(S.N.tool(ASK_TOOL)),
})

/** The placeholders of an investigation's prompt: find the answer and hand it back in full; nothing it changes is kept. */
export const investigationValues = (t: BoardTask, dir: string): Record<string, string> => ({
  ...sharedValues(t, dir),
  earlier_tries: tries(t).length ? `\nEarlier tries:\n${triesList(t)}\n` : '',
  ask_more: askedMore(t) ? ' The owner asked more on an earlier answer (above): hand back your complete answer, the whole updated text with the earlier answer and your new findings put together, not only what changed. It must read on its own, without the earlier answer.' : '',
})

/** The placeholders of a change's prompt: change the files, which are then committed, tested and merged. */
export const changeValues = (t: SymccTask, b: Board, dir: string): Record<string, string> => ({
  ...sharedValues(t, dir),
  files: `Files you may change: ${t.files.length ? `${t.files.join(', ')}. This is the full list; if you change files anywhere else, those changes are undone and the try fails.
An edit outside this list is refused and asks the owner for that file; then stop and hand back (what you already changed in your folder is kept for the next try).` : 'whatever the task needs.'}`,
  test_command: b.test_commands.length === 1 ? `After you finish, these must pass (run them in that folder to check): ${b.test_commands[0]}`
    : b.test_commands.length ? `After you finish, these must pass; run each one on its own, from your folder:\n${b.test_commands.map(c => `  ${c}`).join('\n')}` : 'There is no test command; keep the change small and correct.',
  merge_main: t.merge_main ? `\nFirst, ${intoOf(t)} has moved and your branch now conflicts with it. In that folder, run \`git merge ${intoOf(t)}\` and resolve the conflicts (for this one step only you may run that git merge; still don't commit). Keep this task's intent, keep the changes inside the task's files, and make sure the tests pass.\n` : '',
  test_output: isCheckerOutput(t.test_output) ? checkerRetryText(t.test_output!) : t.test_output ? `\nYour last try failed these tests; fix it. The end of the test output:\n\`\`\`\n${t.test_output}\n\`\`\`\n` : '',
  earlier_tries: tries(t).length ? `\nEarlier tries:\n${triesList(t)}\nDon't repeat those mistakes.\n` : '',
})

