// A worker's try hands back through Claude Code's own mechanisms, never through words in its text:
// - a question: the workers' ask_owner tool (mcp__<name>__ask_owner), served in the tool.call hook;
// - more files: an Edit, Write or NotebookEdit outside the task's files is refused in the tool.check hook,
//   and the path is recorded as a request to the owner.
// Both are written to the task's current try on the board at once (try_question, try_refused), so a plugin reload
// before the hand-back doesn't lose them; finishWork (workers.ts) decides from the board.
import { type Board, type BoardTask, ASK_TOOL, ASK_SCHEMA, ASK_SENT, OPTIONS_MIN, OPTIONS_MAX, parseAsk, blockedEdit, blockedEditText, EDIT_PATH_FIELD, find, kindOf, patchTask } from '../board'
import { S, type $, type Worker, workers, scoutRuns } from './state'
import { load, change, now } from './store'
import { lateHandBack } from './workers'

/** Writes `patch` (from the task as it is now) to worker `w`'s task, only while it is still "doing" on the same try. */
function recordOnTry($: $, w: Worker, attempts: number, patch: (cur: BoardTask) => Partial<BoardTask> | null): Promise<boolean> {
  return change($, (b: Board) => {
    const cur = find(b, w.task)
    const p = cur && cur.status === 'doing' && cur.attempts === attempts ? patch(cur) : null
    return p ? ([patchTask(b, w.task, p, now()), true] as [Board, boolean]) : ([b, false] as [Board, boolean])
  })
}

/** The workers' question tool as registered with $.tool.register. */
export const ASK_TOOL_DEF = () => ({
  name: ASK_TOOL,
  description: `For ${S.N.name} workers only (the lead and scouts never call it): ask the owner a question you can't go on without. Give question, and optionally options: ${OPTIONS_MIN} to ${OPTIONS_MAX} short choices the owner can pick from. The task then waits for the owner's answer and a new try continues with it, so after the call stop and hand back.`,
  inputSchema: ASK_SCHEMA,
})

/**
 * An ask_owner call from agent `agentId` with input `a`: the reply the caller sees. Taken only from a running
 * worker whose task is still "doing" (a worker this copy lost in a reload is found again from the board, see
 * lateHandBack); the question is written to its try on the board (a later call replaces it). Everyone else is refused.
 */
export async function askCall($: $, agentId: string | undefined, a: Record<string, unknown>): Promise<string> {
  const tool = S.N.tool(ASK_TOOL)
  if (!agentId) return `Refused: ${tool} is only for ${S.N.name} workers; the lead (the main chat) never calls it (use ${S.N.tool('ask')} to make a task wait for the owner).`
  if (scoutRuns.has(agentId)) return `Refused: ${tool} is only for ${S.N.name} workers, not scouts. End with your report as usual.`
  if (!workers.has(agentId)) await lateHandBack($, agentId).catch(() => false)
  const w = workers.get(agentId)
  if (!w) return `Refused: ${tool} is only for running ${S.N.name} workers, and you are not one (or your try already handed back).`
  const t = find(await load($), w.task)
  if (!t || t.status !== 'doing') return `Refused: your task ${w.task} is not running any more${t ? ` (it is ${t.status})` : ''}. Stop and hand back.`
  const q = parseAsk(a)
  if (typeof q === 'string') return `Refused: ${q}. Nothing was sent; call ${tool} again with a valid question.`
  if (!(await recordOnTry($, w, t.attempts, () => ({ try_question: q })))) return `Refused: your task ${w.task} is not running any more. Stop and hand back.`
  return ASK_SENT
}

/**
 * The tool.check hook's part: for a running worker on a change task, an edit outside the task's files is refused
 * (the reason the worker reads) and its path recorded on its try on the board. Undefined: not ours to decide. An investigation
 * has no file list, so its edits are never refused (they are not kept anyway); the merge-time scope check stays the
 * backstop for files written through Bash.
 */
export async function checkEdit($: $, agentId: string | undefined, tool: string, input: unknown): Promise<string | undefined> {
  if (!agentId || !EDIT_PATH_FIELD[tool]) return undefined
  const w = workers.get(agentId)
  if (!w) return undefined
  const b = await load($).catch(() => null)
  const t = b ? find(b, w.task) : undefined
  if (!t || kindOf(t) === 'investigation') return undefined
  const path = blockedEdit(tool, input, w.worktree, t.files, S.N.dir)
  if (!path) return undefined
  if (!t.try_refused?.includes(path)) await recordOnTry($, w, t.attempts, cur => (cur.try_refused?.includes(path) ? null : { try_refused: [...(cur.try_refused ?? []), path] })).catch(() => false)
  return blockedEditText(path)
}
