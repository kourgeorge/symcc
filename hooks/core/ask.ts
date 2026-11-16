// How a worker's try hands back without symcc reading meaning out of its text: a question goes through the
// workers' ask_owner tool, a file outside the task's list shows up as a refused edit, and the rest is
// decided from why the worker's turn ended.
import { outOfScope } from './task'

/**
 * The workers' question tool's short name: the model sees it as mcp__<name>__ask_owner. (Not "ask": that
 * is already the lead's tool that makes a task wait with a question.)
 */
export const ASK_TOOL = 'ask_owner'

/** How many choices a worker's question may offer. */
export const OPTIONS_MIN = 2
export const OPTIONS_MAX = 6

/** The longest question kept; longer ones are cut. */
export const QUESTION_MAX_CHARS = 1000

/** A worker's question for the owner, with the choices it offers (if any). */
export type WorkerQuestion = { question: string; options?: string[] }

/** The ask tool's input schema. */
export const ASK_SCHEMA = {
  type: 'object',
  required: ['question'],
  properties: {
    question: { type: 'string', description: 'The question for the owner, plain and short.' },
    options: { type: 'array', items: { type: 'string' }, minItems: OPTIONS_MIN, maxItems: OPTIONS_MAX, description: `Optional: ${OPTIONS_MIN} to ${OPTIONS_MAX} short answers the owner can pick from (shown as buttons).` },
  },
} as const

/** The reply to a worker whose question was taken. */
export const ASK_SENT = 'Sent to the owner. Stop now and hand back.'

/** The one line in a worker's prompt on how to ask and what a refused edit means. */
export const ASK_LINE = (tool: string) => `To ask the owner something, call the ${tool} tool. If an edit is refused as outside your files, stop and hand back.`

/** Checks an ask call's input: the question (cut to QUESTION_MAX_CHARS) and its options, or why it is refused. */
export function parseAsk(a: Record<string, unknown>): WorkerQuestion | string {
  const question = typeof a.question === 'string' ? a.question.trim() : ''
  if (!question) return 'question is needed: the question for the owner'
  if (a.options === undefined) return { question: question.slice(0, QUESTION_MAX_CHARS) }
  if (!Array.isArray(a.options) || a.options.some(o => typeof o !== 'string')) return 'options must be a list of short texts'
  const options = [...new Set((a.options as string[]).map(o => o.trim().slice(0, 200)).filter(Boolean))]
  if (options.length < OPTIONS_MIN || options.length > OPTIONS_MAX) return `options must hold ${OPTIONS_MIN} to ${OPTIONS_MAX} different choices (or leave options out)`
  return { question: question.slice(0, QUESTION_MAX_CHARS), options }
}

/** The file tools whose target a worker's edit is checked on, and the input field that names it. */
export const EDIT_PATH_FIELD: Readonly<Record<string, string>> = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' }

/**
 * The project path (relative to the worker's folder `worktree`) an Edit, Write or NotebookEdit call of `tool`
 * with `input` would change, when it lies outside `files` (the same matching as the merge-time scope check,
 * outOfScope); undefined when the edit is allowed, is another tool, or is outside the worker's folder.
 */
export function blockedEdit(tool: string, input: unknown, worktree: string, files: string[], dataDir: string): string | undefined {
  const field = EDIT_PATH_FIELD[tool]
  const p = field && input && typeof input === 'object' ? (input as Record<string, unknown>)[field] : undefined
  if (typeof p !== 'string' || !p.trim()) return undefined
  const root = worktree.replace(/\/+$/, '')
  const abs = p.trim()
  const rel = abs.startsWith('/') ? (abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : undefined) : abs.replace(/^\.\//, '')
  if (!rel || rel.split('/').includes('..')) return undefined
  return outOfScope([rel], files, dataDir).length ? rel : undefined
}

/** The reason a worker reads when its edit of `path` is refused as outside its task's files. */
export const blockedEditText = (path: string) => `${path} is outside this task's files; it's recorded as a request to the owner. Stop and hand back.`
