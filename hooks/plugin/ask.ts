// A worker's try hands back through Claude Code's own mechanisms, never through words in its text:
// - a question: the workers' ask_owner tool (mcp__<name>__ask_owner), served in the tool.call hook;
// - more files: an Edit, Write or NotebookEdit outside the task's files is refused in the tool.check hook,
//   and the path is recorded as a request to the owner.
// Both are written to the task's current try on the board at once (try_question, try_refused), so a plugin reload
// before the hand-back doesn't lose them; finishWork (workers.ts) decides from the board.
import { type Board, type BoardTask, ASK_TOOL, ASK_SCHEMA, ASK_SENT, OPTIONS_MIN, OPTIONS_MAX, parseAsk, blockedEdit, blockedEditText, editOutsideFolder, outsideFolderText, bashOutsideFolder, bashOutsideText, EDIT_PATH_FIELD, editTarget, find, kindOf, patchTask, realPathOf, brokenLinkText, type PathLookup } from '../board'
import { S, type $, type Worker, scoutRuns } from './state'
import { load, change, now } from './store'
import { workerOf } from './workers'

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
 * workerOf); the question is written to its try on the board (a later call replaces it). Everyone else is refused.
 */
export async function askCall($: $, agentId: string | undefined, a: Record<string, unknown>): Promise<string> {
  const tool = S.N.tool(ASK_TOOL)
  if (!agentId) return `Refused: ${tool} is only for ${S.N.name} workers; the lead (the main chat) never calls it (use ${S.N.tool('ask')} to make a task wait for the owner).`
  if (scoutRuns.has(agentId)) return `Refused: ${tool} is only for ${S.N.name} workers, not scouts. End with your report as usual.`
  const w = await workerOf($, agentId)
  if (!w) return `Refused: ${tool} is only for running ${S.N.name} workers, and you are not one (or your try already handed back).`
  const t = find(await load($), w.task)
  if (!t || t.status !== 'doing') return `Refused: your task ${w.task} is not running any more${t ? ` (it is ${t.status})` : ''}. Stop and hand back.`
  const q = parseAsk(a)
  if (typeof q === 'string') return `Refused: ${q}. Nothing was sent; call ${tool} again with a valid question.`
  if (!(await recordOnTry($, w, t.attempts, () => ({ try_question: q })))) return `Refused: your task ${w.task} is not running any more. Stop and hand back.`
  return ASK_SENT
}

/**
 * An edit call's path, the worker's folder `worktree` and the project folder `root` with symbolic links followed
 * (realPathOf), so a link in the worker's folder that leads into the owner's copy is judged by where it leads.
 * When any of the three can't be looked up, all three stay as written (the checks then work as before T-303).
 * Null when the path goes through a link that leads nowhere.
 */
async function realEdit($: $, tool: string, input: unknown, worktree: string, root: string): Promise<{ input: unknown; worktree: string; root: string } | null> {
  const asIs = { input, worktree, root }
  const p = editTarget(tool, input)
  if (!p || !worktree.startsWith('/') || !root.startsWith('/')) return asIs
  // a failed lookup (even one that throws at once) answers "not there" / "not a link", so nothing is refused for it
  const look: PathLookup = {
    real: q => Promise.resolve().then(() => $.fs.stat(q, { resolve: true })).then(st => st.realPath, () => undefined),
    isLink: (dir, name) => Promise.resolve().then(() => $.fs.list(dir)).then(es => es.some(e => e.name === name && e.isLink), () => false),
  }
  const [file, wt, top] = await Promise.all([realPathOf(worktree, p, look), realPathOf('/', worktree, look), realPathOf('/', root, look)])
  if (file === null) return null
  if (!file || !wt || !top) return asIs
  return { input: { ...(input as Record<string, unknown>), [EDIT_PATH_FIELD[tool]!]: file }, worktree: wt, root: top }
}

/**
 * The tool.check hook's part: for a running worker, an edit inside the project but outside its own folder (the owner's
 * copy, the board, another worker's folder) is always refused, with no file request (the worker should edit its own copy).
 * On a change task, an edit in its folder outside the task's files is refused (the reason the worker reads) and its path
 * recorded on its try on the board. Undefined: not ours to decide. An investigation
 * has no file list, so its edits are never refused (they are not kept anyway). A worker's Bash command that names a path
 * in the project outside its own folder is refused too (bashOutsideFolder); the merge-time scope check stays the backstop
 * for files written through Bash inside its folder. `cwd` is the folder the worker's shell is in (the Bash tool keeps it
 * between calls); relative paths start there when it is inside the worker's folder.
 */
export async function checkEdit($: $, agentId: string | undefined, tool: string, input: unknown, cwd?: string): Promise<string | undefined> {
  if (!agentId || (!EDIT_PATH_FIELD[tool] && tool !== 'Bash')) return undefined
  // a worker this copy lost in a reload is found again from the board, as for ask_owner; if not found, nothing is refused
  const w = await workerOf($, agentId).catch(() => undefined)
  if (!w) return undefined
  if (tool === 'Bash') {
    const cmd = input && typeof input === 'object' ? (input as Record<string, unknown>).command : undefined
    const rel = S.root ? bashOutsideFolder(cmd, w.worktree, S.root, S.home || undefined, cwd) : undefined
    return rel !== undefined ? bashOutsideText(rel, w.worktree) : undefined
  }
  const real = await realEdit($, tool, input, w.worktree, S.root)
  // realEdit gives null only for an edit with a path
  if (real === null) return brokenLinkText(editTarget(tool, input)!)
  const outside = real.root ? editOutsideFolder(tool, real.input, real.worktree, real.root) : undefined
  if (outside !== undefined) return outsideFolderText(outside, w.worktree, S.N.dir)
  const b = await load($).catch(() => null)
  const t = b ? find(b, w.task) : undefined
  if (!t || kindOf(t) === 'investigation') return undefined
  const path = blockedEdit(tool, real.input, real.worktree, t.files, S.N.dir)
  if (!path) return undefined
  if (!t.try_refused?.includes(path)) await recordOnTry($, w, t.attempts, cur => (cur.try_refused?.includes(path) ? null : { try_refused: [...(cur.try_refused ?? []), path] })).catch(() => false)
  return blockedEditText(path)
}
