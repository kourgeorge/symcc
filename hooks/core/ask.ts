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
export function editTarget(tool: string, input: unknown): string | undefined {
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

/** How realPathOf looks at the disk; plugin/ask.ts answers it with $.fs. */
export interface PathLookup {
  /** Where existing path `abs` really is (symbolic links followed), or undefined when it is not there. */
  real(abs: string): Promise<string | undefined>
  /** Whether entry `name` in folder `dir` is a symbolic link (asked only when it leads nowhere). */
  isLink(dir: string, name: string): Promise<boolean>
}

/**
 * Where path `p` (relative paths taken from `base`) really lands once symbolic links are followed: the longest part
 * of it that exists is looked up on disk (".." after a link goes up from where the link leads, as the system does),
 * and the rest, which may not exist yet, is added after it. Null when the first missing part is a symbolic link that
 * leads nowhere (writing there would create its target, wherever that is); undefined when nothing can be looked up,
 * so the caller keeps the path as written.
 */
export async function realPathOf(base: string, p: string, look: PathLookup): Promise<string | null | undefined> {
  const full = p.startsWith('/') ? p : `${base}/${p}`
  if (!full.startsWith('/')) return undefined
  const parts = full.split('/').filter(x => x && x !== '.')
  for (let n = parts.length; n >= 0; n--) {
    const real = await look.real(`/${parts.slice(0, n).join('/')}`).catch(() => undefined)
    if (real === undefined) continue
    if (!real.startsWith('/')) return undefined
    const next = parts[n]
    if (next !== undefined && next !== '..' && (await look.isLink(real, next).catch(() => false))) return null
    return resolvePath('/', [real, ...parts.slice(n)].join('/'))
  }
  return undefined
}

/** The reason a worker reads when its edit of `path` is refused for going through a symbolic link that leads nowhere. */
export const brokenLinkText = (path: string) =>
  `Refused: ${path} goes through a symbolic link that leads to nothing yet, so where the edit would land can't be checked. Edit a real file in your own folder instead.`

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

/**
 * The reason a worker reads when its edit of project path `rel` is refused for being outside its own folder `worktree`.
 * A path under symcc's data folder `dataDir` (the board, reports, other workers' folders) gets no suggested path: that
 * folder is git-ignored, so the same path inside the worker's folder would never be committed or merged.
 */
export const outsideFolderText = (rel: string, worktree: string, dataDir = '.symcc') => {
  const data = dataDir.replace(/^\.\/+|\/+$/g, '').toLowerCase()
  const r = rel.toLowerCase()
  if (data && (r === data || r.startsWith(`${data}/`))) {
    const what = r.startsWith(`${data}/worktrees/`) ? "another worker's copy of the project" : "symcc's own data (the board, reports and such)"
    return `Refused: ${rel} is ${what}, not yours to edit. Work only on your task's files in your own folder ${worktree}.`
  }
  return `Refused: ${rel || 'that path'} is in the owner's copy of the project, outside your own folder. Work only in your own folder ${worktree}: edit ${worktree.replace(/\/+$/, '')}/${rel || '...'} instead.`
}

/** Characters that split a shell command into the words checked by bashOutsideFolder: spaces, quotes, operators, `$(...)`, `=` and `:`. */
const SHELL_SPLIT = /[\s'"`;&|<>(){}$=:,]+/

/** Characters (besides spaces outside quotes) that end a word in shellWords. */
const WORD_END = /[;&|<>(){}$=:,`]/

/**
 * The words of simple command `text` as the shell reads them, so a path with a space in it stays whole: quotes are
 * dropped and what is inside them kept together, and a backslash keeps the next character (a space too) in the word.
 * Unlike the shell, `WORD_END` characters end a word even inside quotes, so `"--out=/x"` and `"$(cat /x)"` still give
 * `/x`. A best effort, not a shell parser.
 */
function shellWords(text: string): string[] {
  const out: string[] = []
  let w = ''
  let quote = ''
  const cut = () => {
    if (w) out.push(w)
    w = ''
  }
  for (let i = 0; i < text.length; i++) {
    let c = text[i]!
    if (c === '\\' && quote !== "'") {
      c = text[++i] ?? ''
      if (c === '\n' || c === "'" || c === '"') continue
      if (/\s/.test(c)) {
        w += c
        continue
      }
    } else if (quote) {
      if (c === quote) {
        quote = ''
        continue
      }
    } else if (c === "'" || c === '"') {
      quote = c
      continue
    } else if (/\s/.test(c)) {
      cut()
      continue
    }
    if (WORD_END.test(c)) cut()
    else w += c
  }
  cut()
  return out
}

/** `s` with every character that means something in a regular expression escaped. */
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

/** A piece of a shell command as bashOutsideFolder walks it: a simple command's text, or the operator between two. */
type ShellPiece = { text: string } | { op: '&&' | '||' | ';' | '|' | '&' | '(' | ')' }

/**
 * `command` cut into simple commands and the operators between them (&&, ||, ;, newline as ";", |, a lone "&", and
 * "(", "{", "`" as opening and ")", "}", "`" as closing a group). Nothing is cut inside quotes or after a backslash, and
 * the "&" of a redirect (`2>&1`, `&>`) is no operator. A best effort, not a shell parser.
 */
function shellPieces(command: string): ShellPiece[] {
  const out: ShellPiece[] = []
  let text = ''
  let quote = ''
  let tick = false
  const op = (o: Extract<ShellPiece, { op: string }>['op']) => {
    out.push({ text }, { op: o })
    text = ''
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    const n = command[i + 1]
    if (quote) {
      if (c === '\\' && quote === '"') text += c + (n ?? ''), i++
      else {
        text += c
        if (c === quote) quote = ''
      }
    } else if (c === '\\') text += c + (n ?? ''), i++
    else if (c === "'" || c === '"') (quote = c), (text += c)
    else if ((c === '&' || c === '|') && n === c) op(c === '&' ? '&&' : '||'), i++
    else if (c === '|') op('|'), n === '&' && i++
    else if (c === '&' && n !== '>' && !/[<>]$/.test(text)) op('&')
    else if (c === ';' || c === '\n') op(';')
    else if (c === '(' || c === '{') op('(')
    else if (c === ')' || c === '}') op(')')
    else if (c === '`') op((tick = !tick) ? '(' : ')')
    else text += c
  }
  out.push({ text })
  return out
}

/**
 * Where a simple command `text` that changes folder (`cd` or `pushd`) goes: a path as written (absolute, or relative to
 * the folder it runs in), `home` (when known) for `cd`, `cd ~` and `~/...`, or null when it can't be followed (a
 * variable, `$(...)`, `cd -`, options, `popd`, odd characters). Undefined when `text` does not change folder.
 */
function cdTarget(text: string, home: string | undefined): string | null | undefined {
  const m = /^(cd|pushd|popd)(?:\s+([^]*))?$/.exec(text.trim())
  if (!m) return undefined
  if (m[1] === 'popd') return null
  let arg = (m[2] ?? '').trim()
  const quoted = /^'([^']*)'$/.exec(arg) ?? /^"([^"$`\\]*)"$/.exec(arg)
  if (quoted) arg = quoted[1]!
  const homeOk = home?.startsWith('/') ? home : undefined
  if (!arg) return m[1] === 'cd' ? (homeOk ?? null) : null
  // spaces only inside quotes ("cd '/a b'"); a quoted "~" is no home folder
  if (!(quoted ? /^[\w./+@%, -]+$/ : /^[\w./~+@%,-]+$/).test(arg) || arg.startsWith('-')) return null
  if (arg === '~' || arg.startsWith('~/')) return homeOk ? resolvePath(homeOk, arg.slice(1).replace(/^\/+/, '') || '.') : null
  return arg.includes('~') ? null : arg
}

/**
 * The first path a worker's Bash `command` names inside the project folder `root` but outside the worker's own folder
 * `worktree` (relative to `root`, '' for the root itself), or undefined when there is none. A word counts as a path when
 * it starts with "/" or "~/" (`home` is the user's home folder) or has a ".." part. Relative words are taken from the
 * folder the command is in at that point: it starts in `cwd` (the shell's folder, when the caller knows it and it is inside
 * the worker's folder) or else the worker's folder, and a plain `cd` or `pushd` earlier in the command moves it ("cd src && cat ../package.json" reads the
 * worker's own file). When it can't be told for sure (a `cd` that may fail before ";" or "||", a group in parentheses),
 * every folder the command may be in is tried, and a `cd` that can't be followed (a variable, `cd -`) goes back to the
 * worker's folder, so nothing is let through that the plain check from the worker's folder would refuse. A ".." word is
 * also tried with its leading "/" dropped, so `$(pwd)/../..` is caught too. Any mention is refused, reading included:
 * telling a safe read from a write in a shell line is not reliable (`cat a > b`, `find -delete`, `git diff --output=`),
 * and a worker has its own copy of every file to read. Like editOutsideFolder, the project check ignores letter case. A
 * best effort, not a sandbox: a path built at run time (variables, base64) or a symbolic link gets through, and the
 * merge-time scope check stays the backstop for the worker's folder.
 */
export function bashOutsideFolder(command: unknown, worktree: string, root: string, home?: string, cwd?: string): string | undefined {
  if (typeof command !== 'string' || !root.startsWith('/') || !worktree.startsWith('/')) return undefined
  const wt = resolvePath('/', worktree)
  const top = resolvePath('/', root)
  const check = (abs: string) => (inside(abs, wt, true) !== undefined ? undefined : inside(abs, top, false))
  // the shell's folder counts only inside the worker's own folder; anywhere else it starts from the worker's folder
  const sh = cwd?.startsWith('/') ? resolvePath('/', cwd) : undefined
  const start = [sh !== undefined && inside(sh, wt, true) !== undefined ? sh : wt]
  const join = (...lists: string[][]) => [...new Set(lists.flat())]
  let here = start
  let seen = start
  const groups: string[][] = []
  const pieces = shellPieces(command)
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!
    if ('op' in p) {
      if (p.op === '(') groups.push(here)
      // a group may be a subshell (its cd stays inside) or not: either folder
      else if (p.op === ')') here = join(groups.pop() ?? start, here)
      // what runs after "||" may follow a failed cd anywhere before it
      else if (p.op === '||') here = join(here, seen)
      continue
    }
    for (const word of new Set([...p.text.split(SHELL_SPLIT), ...shellWords(p.text)])) {
      const w = word.replace(/\\/g, '')
      const climbs = w.split('/').includes('..')
      const homeWord = (w === '~' || w.startsWith('~/')) && home?.startsWith('/')
      if (!w.startsWith('/') && !homeWord && !climbs) continue
      const tries = homeWord ? [resolvePath(home!, w.slice(1).replace(/^\/+/, '') || '.')] : here.map(d => resolvePath(d, w))
      if (climbs && w.startsWith('/')) tries.push(...here.map(d => resolvePath(d, w.replace(/^\/+/, ''))))
      for (const abs of tries) {
        const rel = check(abs)
        if (rel !== undefined) return rel
      }
    }
    const to = cdTarget(p.text, home)
    if (to === undefined) continue
    const before = pieces[i - 1]
    const after = pieces[i + 1]
    const op = (x: ShellPiece | undefined) => (x && 'op' in x ? x.op : undefined)
    // a cd in a pipe or sent to the background runs in a subshell: the folder stays
    if (op(before) === '|' || op(after) === '|' || op(after) === '&') continue
    const moved = to === null ? [wt] : here.map(d => resolvePath(d, to))
    // only "&&" makes sure the cd worked before what follows runs
    here = op(after) === '&&' ? moved : join(here, moved)
    seen = join(seen, moved)
  }
  // backstop: the project folder written out whole anywhere in the text (plain, quoted, with "\ " for spaces, or
  // from "~/"), up to the next space or operator, even where the words above came out wrong (a quote mid-path)
  if (top === '/') return undefined
  const flat = command.replace(/\\\n/g, '').replace(/["'\\]/g, '')
  const homeDir = home?.startsWith('/') ? resolvePath('/', home) : undefined
  const fromHome = homeDir ? inside(top, homeDir, false) : undefined
  const B = String.raw`\s;&|<>(){}$=:,\``
  const starts: [string, string][] = [[reEscape(top), '/']]
  if (fromHome) starts.push([`~/${reEscape(fromHome)}`, homeDir!])
  for (const [start, base] of starts) {
    for (const m of flat.matchAll(new RegExp(`(?<=^|[${B}])${start}(?:/[^${B}]*)?(?=$|[${B}])`, 'gi'))) {
      const rel = check(resolvePath(base, m[0].replace(/^~\/?/, '')))
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
