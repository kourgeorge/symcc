// How a worker's try hands back without symcc reading meaning out of its text: a question goes through the
// workers' ask_owner tool, a file outside the task's list shows up as a refused edit, and the rest is
// decided from why the worker's turn ended.
import { outOfScope } from './task'

/**
 * The workers' question tool's short name; the host may call it otherwise (Claude Code: mcp__<name>__ask_owner, see HostWords). (Not "ask": that
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

/** The path an edit would write (as the host tells it, see FileTouch in host.ts), trimmed; undefined for none or an empty one. */
export function editTarget(path: string | undefined): string | undefined {
  return typeof path === 'string' && path.trim() ? path.trim() : undefined
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

/** Folders macOS gives two names: the first is a symbolic link to the second (T-417). */
const MAC_LINKS: readonly [string, string][] = [
  ['/tmp', '/private/tmp'],
  ['/var', '/private/var'],
  ['/etc', '/private/etc'],
]

/** Clean absolute path `p` and, when it is under /tmp, /var or /etc (or their /private names), its other macOS name too. */
export function pathAliases(p: string): string[] {
  const out = [p]
  for (const [a, b] of MAC_LINKS) {
    for (const [from, to] of [[a, b], [b, a]] as const) if (p === from || p.startsWith(`${from}/`)) out.push(to + p.slice(from.length))
  }
  return out
}

/** One folder, or the same folder by several names (as written, then where its links lead); the first is the main one. */
export type Folders = string | readonly string[]

/** Folders `f` as clean absolute paths, each with its macOS other name (pathAliases), the main one first; relative ones are left out. */
function folderList(f: Folders): string[] {
  const list = (typeof f === 'string' ? [f] : f).filter(x => typeof x === 'string' && x.startsWith('/')).map(x => resolvePath('/', x))
  return [...new Set(list.flatMap(pathAliases))]
}

/** `abs` relative to the first of `dirs` it is inside (see inside), or undefined. */
function insideAny(abs: string, dirs: readonly string[], exact: boolean): string | undefined {
  for (const d of dirs) {
    const rel = inside(abs, d, exact)
    if (rel !== undefined) return rel
  }
  return undefined
}

/**
 * Where an edit of `path` would write when it lands inside the project folder `root` but outside the
 * worker's own folder `worktree` (for example the owner's README.md, the board, or another worker's folder): the path
 * relative to `root`. Relative paths are taken from the worker's folder. Undefined for no path, for edits inside
 * the worker's folder, and for paths outside the project (such as /tmp). The project check ignores letter case (macOS
 * folders usually do), so a path that only differs in case is refused too. Each folder may be given by several names
 * (as written and its real path), and /tmp, /var and /etc also match their macOS /private names (T-417).
 */
export function editOutsideFolder(path: string | undefined, worktree: Folders, root: Folders): string | undefined {
  const p = editTarget(path)
  const wts = folderList(worktree)
  const tops = folderList(root)
  if (!p || !wts.length || !tops.length) return undefined
  const abs = resolvePath(wts[0]!, p)
  if (insideAny(abs, wts, true) !== undefined) return undefined
  return insideAny(abs, tops, false)
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

/** A word of a shell command, and whether any of it was inside quotes (or a here-document's text). */
type ShellWord = { w: string; q: boolean }

/**
 * The words of simple command `text` as the shell reads them, so a path with a space in it stays whole: quotes are
 * dropped and what is inside them kept together, and a backslash keeps the next character (a space too) in the word.
 * Unlike the shell, `WORD_END` characters end a word even inside quotes, so `"--out=/x"` and `"$(cat /x)"` still give
 * `/x`. A best effort, not a shell parser.
 */
function shellWords(text: string): ShellWord[] {
  const out: ShellWord[] = []
  let w = ''
  let q = false
  let quote = ''
  const cut = () => {
    if (w) out.push({ w, q })
    w = ''
    q = false
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
    else (w += c), (q ||= !!quote)
  }
  cut()
  return out
}

/** For each character of `text`, whether it is inside quotes (the quote marks themselves are not). */
function quoteMask(text: string): boolean[] {
  const mask: boolean[] = []
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\' && quote !== "'") {
      mask[i] = mask[i + 1] = !!quote
      i++
    } else if (quote) {
      if (c === quote) quote = ''
      else mask[i] = true
    } else if (c === "'" || c === '"') quote = c
  }
  return mask
}

/**
 * The words bashOutsideFolder checks in piece `p`: those of shellWords and those cut at every quote and operator
 * (SHELL_SPLIT), with backslashes dropped. A word counts as quoted only when every time it shows up it is inside
 * quotes, or it is a here-document's text.
 */
function pieceWords(p: { text: string; doc?: boolean }): Map<string, boolean> {
  const words = new Map<string, boolean>()
  const add = (word: string, q: boolean) => {
    const w = word.replace(/\\/g, '')
    if (w) words.set(w, (words.get(w) ?? true) && (q || !!p.doc))
  }
  const mask = quoteMask(p.text)
  let at = 0
  for (const part of p.text.split(SHELL_SPLIT_KEEP)) {
    if (part && !SHELL_SPLIT_KEEP.test(part)) add(part, mask[at] === true)
    at += part.length
  }
  for (const { w, q } of shellWords(p.text)) add(w, q)
  return words
}

/** SHELL_SPLIT, keeping the separators when splitting (so where each word starts can be counted). */
const SHELL_SPLIT_KEEP = new RegExp(`(${SHELL_SPLIT.source})`)

/** `s` with every character that means something in a regular expression escaped. */
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

/**
 * A piece of a shell command as bashOutsideFolder walks it: a simple command's text (`doc`: a here-document's text), or
 * the operator between two. An opening "(" is a subshell (`sub`) for "(", "$(" and "`", and not for "{".
 */
type ShellPiece = { text: string; doc?: boolean } | { op: '&&' | '||' | ';' | '|' | '&' | ')' } | { op: '('; sub: boolean }

/** Where a here-document starts (`<<EOF`, `<<-'EOF'`, `<< "EOF"`, `<<\EOF`): its end word and whether tabs before it are dropped. */
const HEREDOC = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|<>()'"`]+))/

/**
 * `command` cut into simple commands and the operators between them (&&, ||, ;, newline as ";", |, a lone "&", and
 * "(", "{", "`" as opening and ")", "}", "`" as closing a group). Nothing is cut inside quotes or after a backslash, and
 * the "&" of a redirect (`2>&1`, `&>`) is no operator. The lines of a here-document (`cat > f <<'EOF'` ... `EOF`) come
 * as pieces marked `doc`, cut the same way but with quotes read as plain characters (an apostrophe in a here-document
 * opens no quote). A best effort, not a shell parser.
 */
function shellPieces(command: string, doc = false): ShellPiece[] {
  const out: ShellPiece[] = []
  let text = ''
  let quote = ''
  let tick = false
  const docs: { end: string; tabs: boolean }[] = []
  const op = (o: '&&' | '||' | ';' | '|' | '&' | ')' | '(', sub = true) => {
    out.push(doc ? { text, doc } : { text }, o === '(' ? { op: o, sub } : { op: o })
    text = ''
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    const n = command[i + 1]
    // "<<<" is a here-string, not a here-document
    const hereString = !doc && !quote && c === '<' && n === '<' && command[i + 2] === '<'
    const here = !doc && !quote && !hereString && c === '<' && n === '<' ? HEREDOC.exec(command.slice(i)) : null
    if (hereString) (text += '<<<'), (i += 2)
    else if (quote) {
      if (c === '\\' && quote === '"') text += c + (n ?? ''), i++
      else {
        text += c
        if (c === quote) quote = ''
      }
    } else if (c === '\\') text += c + (n ?? ''), i++
    else if (!doc && (c === "'" || c === '"')) (quote = c), (text += c)
    else if (here) {
      docs.push({ end: here[2] ?? here[3] ?? here[4]!, tabs: here[1] === '-' })
      text += here[0]
      i += here[0].length - 1
    } else if ((c === '&' || c === '|') && n === c) op(c === '&' ? '&&' : '||'), i++
    else if (c === '|') op('|'), n === '&' && i++
    else if (c === '&' && n !== '>' && !/[<>]$/.test(text)) op('&')
    else if (c === '\n' && docs.length) {
      // the here-documents started on this line: their lines, up to each one's end word
      op(';')
      let j = i + 1
      for (const d of docs.splice(0)) {
        const lines: string[] = []
        while (j < command.length) {
          const e = command.indexOf('\n', j)
          const line = command.slice(j, e < 0 ? command.length : e)
          j = e < 0 ? command.length : e + 1
          if ((d.tabs ? line.replace(/^\t+/, '') : line) === d.end) break
          lines.push(line)
        }
        out.push(...shellPieces(lines.join('\n'), true), { op: ';' })
      }
      i = j - 1
    } else if (c === ';' || c === '\n') op(';')
    else if (c === '(' || c === '{') op('(', c === '(')
    else if (c === ')' || c === '}') op(')')
    else if (c === '`') (tick = !tick) ? op('(') : op(')')
    else text += c
  }
  out.push(doc ? { text, doc } : { text })
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
 * Walks shell `command` of a worker whose own folder is `wts` (the main name first) and calls `visit` with each clean
 * absolute path a word of it may name, stopping at (and answering) the first answer that is not undefined. A word
 * counts as a path when it starts with "/" or "~/" (`home` is the user's home folder) or has a ".." part. Relative words
 * are taken from the folder the command is in at that point: it starts in `cwd` (the shell's folder, when the caller
 * knows it and it is inside the worker's folder) or else the worker's folder, and a plain `cd` or `pushd` earlier in the
 * command moves it ("cd src && cat ../package.json" reads the worker's own file). When it can't be told for sure (a `cd`
 * that may fail before ";" or "||", a group in parentheses), every folder the command may be in is tried, and a `cd`
 * that can't be followed (a variable, `cd -`) goes back to the worker's folder. Words inside quotes (an import path in
 * `bun -e "..."`) and here-document text are checked the same way, from every folder the command may be in, since
 * code passed as text may still read the path; a `cd` in here-document text only adds a folder it may be in, and `<<<` is a
 * here-string, not a here-document (T-417). A ".." word is also tried with its leading "/" dropped, so `$(pwd)/../..` is caught too.
 */
function walkBash(command: string, wts: readonly string[], home: string | undefined, cwd: string | undefined, visit: (abs: string) => string | undefined): string | undefined {
  const wt = wts[0]!
  // the shell's folder counts only inside the worker's own folder; anywhere else it starts from the worker's folder
  const sh = cwd?.startsWith('/') ? resolvePath('/', cwd) : undefined
  const start = [sh !== undefined && insideAny(sh, wts, true) !== undefined ? sh : wt]
  const join = (...lists: string[][]) => [...new Set(lists.flat())]
  // every folder the command may be in at this point
  let here = start
  let seen = start
  const groups: { here: string[] }[] = []
  const pieces = shellPieces(command)
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!
    if ('op' in p) {
      if (p.op === '(') groups.push({ here })
      else if (p.op === ')') {
        // a group may be a subshell (its cd stays inside) or not: either folder
        const g = groups.pop()
        here = join(g?.here ?? start, here)
      }
      // what runs after "||" may follow a failed cd anywhere before it
      else if (p.op === '||') here = join(here, seen)
      continue
    }
    for (const w of pieceWords(p).keys()) {
      const climbs = w.split('/').includes('..')
      const homeWord = (w === '~' || w.startsWith('~/')) && home?.startsWith('/')
      if (!w.startsWith('/') && !homeWord && !climbs) continue
      const dirs = here
      const tries = homeWord ? [resolvePath(home!, w.slice(1).replace(/^\/+/, '') || '.')] : dirs.map(d => resolvePath(d, w))
      if (climbs && w.startsWith('/')) tries.push(...dirs.map(d => resolvePath(d, w.replace(/^\/+/, ''))))
      for (const abs of tries) {
        const rel = visit(abs)
        if (rel !== undefined) return rel
      }
    }
    const to = cdTarget(p.text, home)
    if (to === undefined) continue
    // a "cd" in a here-document's text may run (`bash <<X`) or be only text (`cat > f <<X`): it adds a folder the
    // command may be in, and never drops the one it was in (T-417)
    if (p.doc) {
      if (to !== null) (here = join(here, here.map(d => resolvePath(d, to)))), (seen = join(seen, here))
      continue
    }
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
  return undefined
}

/**
 * The first path a worker's Bash `command` names inside the project folder `root` but outside the worker's own folder
 * `worktree` (relative to `root`, '' for the root itself), or undefined when there is none. Which words count as paths,
 * and from which folder relative ones are taken, is told at walkBash. Each folder may be given by several names (as
 * written, and where its links lead), and /tmp, /var and /etc also match their macOS /private names, so the project
 * named through /tmp is refused like through /private/tmp (T-417). Any mention is refused, reading included: telling a
 * safe read from a write in a shell line is not reliable (`cat a > b`, `find -delete`, `git diff --output=`), and a
 * worker has its own copy of every file to read. Like editOutsideFolder, the project check ignores letter case. A best
 * effort, not a sandbox: a path built at run time (variables, base64) gets through; symbolic links elsewhere on disk
 * are followed by the caller (bashPathsOutside). It checks paths only: git writes run from the worker's own folder
 * (a commit, `git update-ref refs/heads/main`, a push) are refused by the caller with gitWriteIn. The merge-time scope
 * check only looks at which files the task's commits change, so it catches files written through the shell inside the
 * worker's folder outside the task's files, not a branch the worker moved.
 */
export function bashOutsideFolder(command: unknown, worktree: Folders, root: Folders, home?: string, cwd?: string): string | undefined {
  const wts = folderList(worktree)
  const tops = folderList(root)
  if (typeof command !== 'string' || !wts.length || !tops.length) return undefined
  const check = (abs: string) => (insideAny(abs, wts, true) !== undefined ? undefined : insideAny(abs, tops, false))
  const found = walkBash(command, wts, home, cwd, check)
  if (found !== undefined) return found
  // backstop: the project folder written out whole anywhere in the text (plain, quoted, with "\ " for spaces, or
  // from "~/"), up to the next space or operator, even where the words above came out wrong (a quote mid-path)
  const flat = command.replace(/\\\n/g, '').replace(/["'\\]/g, '')
  const homeDir = home?.startsWith('/') ? resolvePath('/', home) : undefined
  const B = String.raw`\s;&|<>(){}$=:,\``
  for (const top of tops) {
    if (top === '/') continue
    const fromHome = homeDir ? inside(top, homeDir, false) : undefined
    const starts: [string, string][] = [[reEscape(top), '/']]
    if (fromHome) starts.push([`~/${reEscape(fromHome)}`, homeDir!])
    for (const [start, base] of starts) {
      for (const m of flat.matchAll(new RegExp(`(?<=^|[${B}])${start}(?:/[^${B}]*)?(?=$|[${B}])`, 'gi'))) {
        const rel = check(resolvePath(base, m[0].replace(/^~\/?/, '')))
        if (rel !== undefined) return rel
      }
    }
  }
  return undefined
}

/** The most paths bashPathsOutside answers, so a long command costs a bounded number of disk lookups. */
export const BASH_PATHS_MAX = 20

/**
 * The absolute paths (at most BASH_PATHS_MAX, the same walk as bashOutsideFolder) a worker's Bash `command` names
 * outside its own folder `worktree`: the caller looks each up on disk, so a symbolic link elsewhere that leads into the
 * owner's copy (`~/link/README.md`) is judged by where it leads (T-417).
 */
export function bashPathsOutside(command: unknown, worktree: Folders, home?: string, cwd?: string): string[] {
  const wts = folderList(worktree)
  if (typeof command !== 'string' || !wts.length) return []
  const out = new Set<string>()
  walkBash(command, wts, home, cwd, abs => {
    if (insideAny(abs, wts, true) === undefined) out.add(abs)
    return out.size >= BASH_PATHS_MAX ? '' : undefined
  })
  return [...out]
}

/** The reason a worker reads when its shell command naming project path `rel` is refused for being outside its own folder `worktree`. */
export const bashOutsideText = (rel: string, worktree: string) =>
  `Refused: this command names ${rel || 'the project folder'} in the owner's copy of the project, outside your own folder. Work only in your own folder ${worktree}: use paths inside it (relative paths start there), never the owner's copy, even to read.`

/** git commands a checker may run as they are: they only read. Anything not listed (and not in gitReadOnly below) is refused. */
const GIT_READ = new Set(['diff', 'log', 'show', 'status', 'blame', 'grep', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file', 'rev-list', 'merge-base', 'describe', 'shortlog', 'show-branch', 'whatchanged', 'name-rev', 'diff-tree', 'diff-index', 'diff-files', 'annotate', 'help', 'version', 'count-objects', 'var', 'check-ignore', 'check-attr'])

/** git's own options (before the command name) that take the next word as their value. */
const GIT_GLOBAL_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix'])

/** git's own options a checker may not use: `-c` and `--config-env` set any setting (core.pager, diff.external, alias.*...) and `--exec-path` picks where git finds its programs, so each can make git run another program. */
const GIT_GLOBAL_REFUSED = /^(-c|--config-env|--exec-path)/

/**
 * Long options of read-only git commands that write a file or run another program: `--output` (log, diff, show...),
 * `--ext-diff`, `--textconv`, `--open-files-in-pager` (grep), `--exec-path`. git takes any unique start of a long
 * option name (`--outp`), so a start of these names is refused too, except the exact names in LONG_OK.
 */
const LONG_REFUSED = ['output', 'ext-diff', 'textconv', 'open-files-in-pager', 'exec-path', 'exec']

/** Long options that start like one in LONG_REFUSED but are a different, harmless option of their own. */
const LONG_OK = new Set(['text'])

/** git commands that take diff options, where `-o <file>` writes the output to a file. */
const DIFF_LIKE = new Set(['diff', 'log', 'show', 'whatchanged', 'diff-tree', 'diff-index', 'diff-files', 'format-patch', 'rev-list', 'shortlog'])

/** `git branch` options that change branches. */
const BRANCH_WRITE = /^(-[a-zA-Z]*[dDfmMcCu]|--(delete|force|move|copy|set-upstream-to|unset-upstream|edit-description|track|no-track|create-reflog|recurse-submodules)(=|$))/

/** `git branch` options that take the next word as their value. */
const BRANCH_VALUE = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format', '--sort', '--column'])

/**
 * Settings that make git run another program, use another repository or settings file, or write a file
 * (GIT_EXTERNAL_DIFF, GIT_PAGER, GIT_SSH_COMMAND, GIT_DIR, GIT_CONFIG*, GIT_TRACE...: every GIT_ name), set as
 * `NAME=value` (alone, after `env` or `export`) in a command that also runs git.
 */
const GIT_ENV_REFUSED = /^(GIT_\w*|PAGER|EDITOR|VISUAL|LESS\w*|SSH_ASKPASS|BROWSER|HOME|XDG_CONFIG_HOME)=/

/**
 * The words of simple command `text`, split at spaces outside quotes; quotes are dropped and a backslash keeps the next
 * character. A best effort, not a shell parser.
 */
function plainWords(text: string): string[] {
  const out: string[] = []
  let w = ''
  let has = false
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\' && quote !== "'") (w += text[++i] ?? ''), (has = true)
    else if (quote) c === quote ? (quote = '') : (w += c)
    else if (c === "'" || c === '"') (quote = c), (has = true)
    else if (/\s/.test(c)) {
      if (w || has) out.push(w)
      w = ''
      has = false
    } else w += c
  }
  if (w || has) out.push(w)
  return out
}

/** Short options of git grep that take a value right after them (`-e<pattern>`, `-A3`). */
const GREP_VALUE = 'efABCmO'
/** Short options of diff-like git commands that take a value right after them (`-S<text>`, `-G<regex>`, `-L<range>`, `-n3`); shortlog's -n takes none. */
const DIFF_VALUE = 'SGLOInUlMCBX'

/** The option letters of short option word `a` (`-nSfoo` gives `nS`): stops after the first letter that takes a value. */
function shortFlags(a: string, value: string): string {
  let out = ''
  for (const c of a.slice(1)) {
    out += c
    if (value.includes(c)) break
  }
  return out
}

/** The option of git `args` (the words after read-only command `sub`) that writes a file or runs another program, or undefined. */
function gitBadOption(sub: string, args: string[]): string | undefined {
  for (const a of args) {
    const long = /^--([^=]+)/.exec(a)?.[1]
    if (long && !LONG_OK.has(long) && !long.startsWith('no-') && LONG_REFUSED.some(n => n.startsWith(long))) return a.split('=')[0]
    // short options may be put together (`-nO`); -O runs its value as a command in grep, -o writes a file in diff-like
    // commands. The letters after an option that takes a value are that value (`-Sfoo`, `-G"checkout"`), not options.
    const flag = sub === 'grep' ? 'O' : DIFF_LIKE.has(sub) ? 'o' : undefined
    if (flag && /^-[^-]/.test(a) && shortFlags(a, sub === 'grep' ? GREP_VALUE : sub === 'shortlog' ? DIFF_VALUE.replace('n', '') : DIFF_VALUE).includes(flag)) return `-${flag}`
  }
  return undefined
}

/** Whether git `args` (the words after the command name `sub`) only read. */
function gitReadOnly(sub: string, args: string[]): boolean {
  if (GIT_READ.has(sub)) return true
  if (sub === 'stash' || sub === 'worktree') return args[0] === 'list' || (sub === 'stash' && args[0] === 'show')
  if (sub !== 'branch') return false
  let list = false
  let named = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--list' || a === '-l' || a === '--show-current') list = true
    else if (BRANCH_WRITE.test(a)) return false
    else if (BRANCH_VALUE.has(a)) i++
    else if (!a.startsWith('-')) named = true
  }
  // `git branch <name>` makes a branch; with --list the names are patterns to show
  return list || !named
}

/** Whether word `w` names the git program (`git`, `/usr/bin/git`; any letter case, since macOS finds `GIT` too). */
const isGit = (w: string) => /(^|\/)git$/i.test(w)

/**
 * The first git command in Bash `command` that may change anything or run another program (a commit, a branch, the
 * stash, the index, a tag, a push, `--output=<file>`, `grep -O<cmd>`, `-c core.pager=...`, `GIT_EXTERNAL_DIFF=...`), as
 * `git <command>` (or `git <command> <option>`, or the setting's name), or undefined when every git command in it only
 * reads (diff, log, show, status, branch --list, stash list...). Looks inside compound commands (&&, ;, |, `$(...)`),
 * after `cd`, `env` or `xargs`, past git's own options (`git -C <dir>`), and inside any word that has `git` in it (quoted
 * text run by `sh -c`, a `VAR=` value, an option value like `-O"git stash"`). Any word `git` (or ending in `/git`) counts,
 * so an odd read may be refused too; that is the safe side.
 *
 * A best effort on the command's text, not a sandbox: a git run through a variable, a script file, a settings file the
 * checker wrote, or other shell tricks gets through. Closing those is the sandbox's job (T-365), not this check's.
 */
export function gitWriteIn(command: unknown, allow?: GitAllow): string | undefined {
  if (typeof command !== 'string') return undefined
  const { bad, git, env } = gitScan(command, 0, allow)
  return bad ?? (git && env ? env : undefined)
}

/** A git command (`sub`, and the words after it) that gitWriteIn lets through although it writes. */
export type GitAllow = (sub: string, args: string[]) => boolean

/** Options a "merge it in" try's `git merge` may have: none of them commits anything the plain merge wouldn't. */
const MERGE_STEP_OPTIONS = new Set(['--no-edit', '--no-ff', '--no-commit'])

/**
 * The git writes a worker may run in a "merge it in" try (a task whose branch conflicts with `into`, see merge_main):
 * `git merge <into>` (with only --no-edit, --no-ff or --no-commit) and `git merge --abort`. Nothing else: the worker
 * resolves the conflicts in the files, and symcc adds and commits them (git add -A) as for any try.
 */
export const mergeStepAllow =
  (into: string): GitAllow =>
  (sub, args) => {
    if (sub !== 'merge') return false
    // output redirections (`2>&1`, `> log`) don't change what git does; their target is checked as a path elsewhere
    const rest: string[] = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!
      const redir = /^(\d*|&)>>?(&\d+)?(.*)$/.exec(a)
      if (!redir) rest.push(a)
      else if (!redir[2] && !redir[3]) i++
    }
    if (rest.length === 1 && rest[0] === '--abort') return true
    const names = rest.filter(a => !MERGE_STEP_OPTIONS.has(a))
    return names.length === 1 && names[0] === into
  }

/** gitWriteIn's walk of `command`: the first git write found (`bad`), whether any git runs, and the first setting from GIT_ENV_REFUSED. */
function gitScan(command: string, depth: number, allow?: GitAllow): { bad?: string; git: boolean; env?: string } {
  const out: { bad?: string; git: boolean; env?: string } = { git: false }
  if (depth > 4) return out
  for (const p of shellPieces(command)) {
    if ('op' in p) continue
    const words = plainWords(p.text)
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!
      out.env ??= GIT_ENV_REFUSED.exec(w)?.[1]
      // a git program called by its own name, as in git's libexec folder (`.../git-core/git-stash`)
      const dashed = /(?:^|\/)git-([\w-]+)$/i.exec(w)?.[1]
      if (dashed) {
        out.git = true
        const args = words.slice(i + 1)
        if (allow?.(dashed, args)) continue
        if (!gitReadOnly(dashed, args)) return { ...out, bad: `git ${dashed}` }
        const opt = gitBadOption(dashed, args)
        if (opt) return { ...out, bad: `git ${dashed} ${opt}` }
        continue
      }
      if (!isGit(w)) {
        // text from the first "git" that ends a word on, in a word that holds more than one word or command
        // (quoted text run by sh -c, `X='git stash'`, `-O"git stash"`)
        const at = w.search(/git(?!\w)/i)
        if (at >= 0 && /[\s;&|<>()`$]/.test(w.slice(at))) {
          const inner = gitScan(w.slice(at), depth + 1, allow)
          out.git ||= inner.git
          out.env ??= inner.env
          if (inner.bad) return { ...out, bad: inner.bad }
        }
        continue
      }
      out.git = true
      let j = i + 1
      for (; j < words.length && words[j]!.startsWith('-'); j += GIT_GLOBAL_VALUE.has(words[j]!) ? 2 : 1)
        if (GIT_GLOBAL_REFUSED.test(words[j]!)) return { ...out, bad: `git ${words[j]!.split('=')[0]}` }
      const sub = words[j]
      if (sub === undefined) continue
      const args = words.slice(j + 1)
      if (allow?.(sub, args)) continue
      if (!gitReadOnly(sub, args)) return { ...out, bad: `git ${sub}` }
      const opt = gitBadOption(sub, args)
      if (opt) return { ...out, bad: `git ${sub} ${opt}` }
    }
  }
  return out
}

/** The reason a checker reads when its Bash command runs git command `what` (from gitWriteIn), which may change something. */
export const gitWriteText = (what: string) =>
  `Refused: ${what} may change the repository or run another program, and the checker may only read with git (diff, log, show, status, blame, grep, rev-parse, ls-files, branch --list, stash list/show), without options that write a file or run a program (--output, -O, --ext-diff, -c, GIT_* settings). Check the work without changing any branch, commit, tag or the stash.`

/**
 * The reason a worker reads when its Bash command runs git command `what` (from gitWriteIn), which may change
 * something: its branch names, tags and stash are shared with the owner's folder (main too), and symcc commits, tests
 * and merges the work. `into`: the branch a "merge it in" try may merge (mergeStepAllow), named in the reason.
 */
export const workerGitWriteText = (what: string, into?: string) =>
  `Refused: ${what} may change the repository or run another program, and a worker may only read with git (diff, log, show, status, blame, grep, rev-parse, ls-files, branch --list, stash list/show), without options that write a file or run a program (--output, -O, --ext-diff, -c, GIT_* settings). Don't commit, push, merge, reset, switch branches, stash or move any branch or tag: just change the files in your folder; symcc commits, tests and merges your work.${into ? ` In this try you may also run \`git merge ${into}\` (or \`git merge --abort\`) to merge ${into} in; then resolve the conflicts in the files and don't commit.` : ''}`

/**
 * The project path (relative to the worker's folder `worktree`) an edit of `path` would change, when it lies outside
 * `files` (the same matching as the merge-time scope check, outOfScope); undefined when the edit is allowed, has no
 * path, or is outside the worker's folder (see
 * editOutsideFolder for those). Relative paths are taken from the worker's folder, and ".." is worked out first.
 */
export function blockedEdit(path: string | undefined, worktree: Folders, files: string[], dataDir: string): string | undefined {
  const p = editTarget(path)
  const wts = folderList(worktree)
  if (!p || !wts.length) return undefined
  const rel = insideAny(resolvePath(wts[0]!, p), wts, true)
  if (!rel) return undefined
  return outOfScope([rel], files, dataDir).length ? rel : undefined
}

/** The reason a worker reads when its edit of `path` is refused as outside its task's files. */
export const blockedEditText = (path: string) => `${path} is outside this task's files; it's recorded as a request to the owner. Stop and hand back.`

/** The longest reason kept in guardFailedText; a longer one (an error message can hold anything) is cut. */
export const GUARD_REASON_MAX_CHARS = 200

/**
 * The short reason for a guard hook that failed (`kind` throw or timeout, and its message if any), on one line,
 * cut to GUARD_REASON_MAX_CHARS. Control characters are turned into spaces so the reason can't fake lines.
 */
export function guardReason(kind: string | undefined, message?: string): string {
  const head = kind === 'timeout' ? 'it ran out of time' : 'it failed'
  // eslint-disable-next-line no-control-regex
  const msg = typeof message === 'string' ? message.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : ''
  const text = msg ? `${head} (${msg})` : head
  return text.length > GUARD_REASON_MAX_CHARS ? `${text.slice(0, GUARD_REASON_MAX_CHARS - 1)}…` : text
}

/** What one of symcc's own agents reads when a guard hook failed on its call, so the call was refused. */
export const guardFailedText = (name: string, reason: string) => `${name} couldn't check this call, so it was refused: ${reason}`

/** Why the start of one of the plugin's own agent types was refused when its agent.spawn hook failed (`reason`: guardReason). */
export const spawnFailedText = (name: string, reason: string) => `${name} couldn't check this agent start, so it was refused: ${reason}`
