// The values a worker's prompt is filled in with, for each task (see fillPrompt in hooks/core/prompts.ts). A role's
// checklist is filled in from the same values (see roleSection), for a worker and for a checker alike.
import type { SymccTask } from '../../types'
import { type Board, type BoardTask, kindOf, kindSection, ASK_TOOL, ASK_LINE, askedMore, intoOf, isCheckerOutput, checkerRetryText, testOutputHeading } from '../board'
import { taskBranch } from './git'
import { S, toolName } from './state'
import { LEARNED_ASK } from '../core/org-mem'

/** A task's history without the "created by ..." line: what earlier tries did. */
export const tries = (t: SymccTask) => t.history.filter(h => h.kind !== 'created').map(h => h.text)

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
  // How a worker asks the owner and what a refused edit means (see hooks/app/ask.ts).
  ask: ASK_LINE(toolName(ASK_TOOL)),
  // T-600: org-mem's lines go in {{org_mem}} (see WORKER_PROMPT and orgMemText); the report may end with "Learned:" lines
  org_mem: '',
  learned: LEARNED_ASK,
})

/** The placeholders of an investigation's prompt: find the answer and hand it back in full; nothing it changes is kept. */
export const investigationValues = (t: BoardTask, dir: string): Record<string, string> => ({
  ...sharedValues(t, dir),
  earlier_tries: tries(t).length ? `\nEarlier tries:\n${triesList(t)}\n` : '',
  ask_more: askedMore(t) ? ' The owner asked more on an earlier answer (above): hand back your complete answer, the whole updated text with the earlier answer and your new findings put together, not only what changed. It must read on its own, without the earlier answer.' : '',
})

/**
 * T-526: {{test_command}} of a change's prompt. The full test commands run once per try, by symcc before merging
 * (hooks/app/review.ts); the worker runs only the tests for what it changed (plus a cheap type check), not the full
 * commands at the end. With no test commands set: keep the change small and correct.
 */
export function workerTestText(name: string, commands: readonly string[]): string {
  if (!commands.length) return 'There is no test command; keep the change small and correct.'
  const list = commands.map(c => `  ${c}`).join('\n')
  return `These test commands must pass. ${name} runs them all, each one on its own from your folder, before merging, and sends you the output if any fail:
${list}
While you work, run only what checks your change: the tests for the files you changed (find the narrowest way the project offers, e.g. one test file), plus the type check if the project has a cheap one. Don't run the full commands at the end "to be sure"; ${name} does that.`
}

/** The placeholders of a change's prompt: change the files, which are then committed, tested and merged. */
export const changeValues = (t: SymccTask, b: Board, dir: string): Record<string, string> => ({
  ...sharedValues(t, dir),
  // the host's words for its file tools (see HostWords), so the prompt names no host's tools itself
  file_tools: S.W.fileTools,
  files: `Files you may change: ${t.files.length ? `${t.files.join(', ')}. This is the full list; if you change files anywhere else, those changes are undone and the try fails.
An edit outside this list is refused and asks the owner for that file; then stop and hand back (what you already changed in your folder is kept for the next try).` : 'whatever the task needs.'}`,
  test_command: workerTestText(S.N.name, b.test_commands),
  merge_main: t.merge_main ? `\nFirst, ${intoOf(t)} has moved and your branch now conflicts with it. In that folder, run \`git merge ${intoOf(t)}\` and resolve the conflicts (for this one step only you may run that git merge; still don't commit). Keep this task's intent, keep the changes inside the task's files, and make sure the tests pass.\n` : '',
  test_output: isCheckerOutput(t.test_output) ? checkerRetryText(t.test_output!) : t.test_output ? `\nYour last try failed these tests; fix it. ${testOutputHeading(t.test_output)}\n\`\`\`\n${t.test_output}\n\`\`\`\n` : '',
  earlier_tries: tries(t).length ? `\nEarlier tries:\n${triesList(t)}\nDon't repeat those mistakes.\n` : '',
})

