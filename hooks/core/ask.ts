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

/** The path field of an Edit, Write or NotebookEdit call of `tool` with `input`, trimmed; undefined for other tools or no path. */
function editTarget(tool: string, input: unknown): string | undefined {
  const field = EDIT_PATH_FIELD[tool]
  const p = field && input && typeof input === 'object' ? (input as Record<string, unknown>)[field] : undefined
  return typeof p === 'string' && p.trim() ? p.trim() : undefined
}

/** `p` as a clean absolute path: relative paths are taken from `base`, and ".", ".." and repeated slashes are worked out. */
export function resolvePath(base: string, p: string): string {
  const out: string[] = []
  for (const part of (p.startsWith('/') ? p : `${base}/${p}`).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

/** `abs` relative to folder `dir` (both clean absolute paths), or undefined when it is not inside it. Case-sensitive when `exact`. */
function inside(abs: string, dir: string, exact: boolean): string | undefined {
  const [a, d] = exact ? [abs, dir] : [abs.toLowerCase(), dir.toLowerCase()]
  if (d === '/') return abs.slice(1)
  return a === d ? '' : a.startsWith(`${d}/`) ? abs.slice(dir.length + 1) : undefined
}

/**
 * Where an Edit, Write or NotebookEdit call would write when it lands inside the project folder `root` but outside the
 * worker's own folder `worktree` (for example the owner's README.md, the board, or another worker's folder): the path
 * relative to `root`. Relative paths are taken from the worker's folder. Undefined for other tools, for edits inside
 * the worker's folder, and for paths outside the project (such as /tmp). The project check ignores letter case (macOS
 * folders usually do), so a path that only differs in case is refused too.
 */
export function editOutsideFolder(tool: string, input: unknown, worktree: string, root: string): string | undefined {
  const p = editTarget(tool, input)
  if (!p || !root.startsWith('/') || !worktree.startsWith('/')) return undefined
  const abs = resolvePath(worktree, p)
  const wt = resolvePath('/', worktree)
  if (inside(abs, wt, true) !== undefined) return undefined
  return inside(abs, resolvePath('/', root), false)
}

/** The reason a worker reads when its edit of project path `rel` is refused for being outside its own folder `worktree`. */
export const outsideFolderText = (rel: string, worktree: string) =>
  `Refused: ${rel || 'that path'} is in the owner's copy of the project, outside your own folder. Work only in your own folder ${worktree}: edit ${worktree.replace(/\/+$/, '')}/${rel || '...'} instead.`

/** Characters that split a shell command into the words checked by bashOutsideFolder: spaces, quotes, operators, `$(...)`, `=` and `:`. */
const SHELL_SPLIT = /[\s'"`;&|<>(){}$=:,]+/

/**
 * The first path a worker's Bash `command` names inside the project folder `root` but outside the worker's own folder
 * `worktree` (relative to `root`, '' for the root itself), or undefined when there is none. A word counts as a path when
 * it starts with "/" or "~/" (`home` is the user's home folder) or has a ".." part; relative words are taken from the
 * worker's folder. A ".." word is also tried from the worker's folder with its leading "/" dropped, so `$(pwd)/../..`
 * is caught too. Any mention is refused, reading included: telling a safe read from a write in a shell line is not
 * reliable (`cat a > b`, `find -delete`, `git diff --output=`), and a worker has its own copy of every file to read.
 * Like editOutsideFolder, the project check ignores letter case. A best effort, not a sandbox: a path built at run time
 * (variables, base64) gets through, and the merge-time scope check stays the backstop for the worker's folder.
 */
export function bashOutsideFolder(command: unknown, worktree: string, root: string, home?: string): string | undefined {
  if (typeof command !== 'string' || !root.startsWith('/') || !worktree.startsWith('/')) return undefined
  const wt = resolvePath('/', worktree)
  const top = resolvePath('/', root)
  const check = (abs: string) => (inside(abs, wt, true) !== undefined ? undefined : inside(abs, top, false))
  for (const word of command.split(SHELL_SPLIT)) {
    const w = word.replace(/\\/g, '')
    const climbs = w.split('/').includes('..')
    const homeWord = (w === '~' || w.startsWith('~/')) && home?.startsWith('/')
    if (!w.startsWith('/') && !homeWord && !climbs) continue
    const tries = [homeWord ? resolvePath(home!, w.slice(1).replace(/^\/+/, '') || '.') : resolvePath(wt, w)]
    if (climbs && w.startsWith('/')) tries.push(resolvePath(wt, w.replace(/^\/+/, '')))
    for (const abs of tries) {
      const rel = check(abs)
      if (rel !== undefined) return rel
    }
  }
  return undefined
}

/** The reason a worker reads when its shell command naming project path `rel` is refused for being outside its own folder `worktree`. */
export const bashOutsideText = (rel: string, worktree: string) =>
  `Refused: this command names ${rel || 'the project folder'} in the owner's copy of the project, outside your own folder. Work only in your own folder ${worktree}: use paths inside it (relative paths start there), never the owner's copy, even to read.`

/**
 * The project path (relative to the worker's folder `worktree`) an Edit, Write or NotebookEdit call of `tool`
 * with `input` would change, when it lies outside `files` (the same matching as the merge-time scope check,
 * outOfScope); undefined when the edit is allowed, is another tool, or is outside the worker's folder (see
 * editOutsideFolder for those). Relative paths are taken from the worker's folder, and ".." is worked out first.
 */
export function blockedEdit(tool: string, input: unknown, worktree: string, files: string[], dataDir: string): string | undefined {
  const p = editTarget(tool, input)
  if (!p || !worktree.startsWith('/')) return undefined
  const rel = inside(resolvePath(worktree, p), resolvePath('/', worktree), true)
  if (!rel) return undefined
  return outOfScope([rel], files, dataDir).length ? rel : undefined
}

/** The reason a worker reads when its edit of `path` is refused as outside its task's files. */
export const blockedEditText = (path: string) => `${path} is outside this task's files; it's recorded as a request to the owner. Stop and hand back.`
