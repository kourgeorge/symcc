// The values a worker's prompt is filled in with, for each task (see fillPrompt in hooks/core/prompts.ts). A role's
// checklist is filled in from the same values (see roleSection), for a worker and for a checker alike.
import type { SymccTask } from '../../types'
import { type Board, type BoardTask, kindOf, isErrand, kindSection, ASK_TOOL, ASK_LINE, askedMore, roleOf } from '../board'
import { filesBody } from '../core/prompt-sections'
import { taskBranch } from './git'
import { S, toolName } from './state'

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
  kind_name: kindOf(t),
  role_name: roleOf(t),
  // How a worker asks the owner and what a refused edit means (see hooks/app/ask.ts).
  ask: ASK_LINE(toolName(ASK_TOOL)),
  // T-936: the ask_owner tool's name, for the "what changed since" section's check-first rule
  ask_tool: toolName(ASK_TOOL),
  // T-600: org-mem's lines go in {{org_mem}} (see WORKER_PROMPT and orgMemText); T-656: {{learned}} is '' unless the host
  // can't send the debrief (see learnedAsk), so the main prompt is only about the task
  org_mem: '',
  learned: '',
})

/** The placeholders of an investigation's prompt: find the answer and hand it back in full; nothing it changes is kept. */
export const investigationValues = (t: BoardTask, dir: string): Record<string, string> => ({
  ...sharedValues(t, dir),
  ...(isErrand(t)
    ? {
      job: 'This task is an errand: do the work the task asks for, then hand back a short report. Nothing is committed, tested or merged; the task ends done on its own with your report kept.',
      may_run: 'Do the work the task asks for, including outside the project (for example in other folders), but',
      hand_back: 'hand back a short report of what you did and where (paths, results). Write it for the owner, in plain words.',
    }
    : {
      job: 'This task is an investigation: your job is to find the answer and hand it back in full. Your hand-back is the result; the owner reads it. Nothing is committed, tested or merged.',
      may_run: 'You may run read-only commands and experiments, outside the project or in that folder, but',
      hand_back: 'hand back the full answer: what you found, how you know (the files, commands or sources you checked), and anything still unsure. Write it for the owner, in plain words.',
    }),
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
  files: `Files you may change: ${filesBody(t.files)}`,
  test_command: workerTestText(S.N.name, b.test_commands),
})

