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

/** How realPathOf looks at the disk; app/ask.ts answers it with $.fs. */
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
type ShellPiece = { text: string; doc?: boolean; by?: number; lit?: boolean } | { op: '&&' | '||' | ';' | '|' | '&' | ')' } | { op: '('; sub: boolean }

/** Where a here-document starts (`<<EOF`, `<<-'EOF'`, `<< "EOF"`, `<<\EOF`): its end word and whether tabs before it are dropped. */
const HEREDOC = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|<>()'"`]+))/

/**
 * `command` cut into simple commands and the operators between them (&&, ||, ;, newline as ";", |, a lone "&", and
 * "(", "{", "`" as opening and ")", "}", "`" as closing a group; "{" and "}" only as a word of their own at a command's start). Nothing is cut inside quotes or after a backslash, and
 * the "&" of a redirect (`2>&1`, `&>`) is no operator. The lines of a here-document (`cat > f <<'EOF'` ... `EOF`) come
 * as pieces marked `doc`, cut the same way but with quotes read as plain characters (an apostrophe in a here-document
 * opens no quote). A best effort, not a shell parser.
 */
function shellPieces(command: string, doc = false): ShellPiece[] {
  const out: ShellPiece[] = []
  let text = ''
  let quote = ''
  let tick = false
  // `by`: where in `out` the command that started the here-document goes; `lit`: its end word is quoted, so its text is
  // taken as it is (no `$(...)` or "`" runs in it)
  const docs: { end: string; tabs: boolean; by: number; lit: boolean }[] = []
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
      docs.push({ end: here[2] ?? here[3] ?? here[4]!, tabs: here[1] === '-', by: out.length, lit: here[4] === undefined || here[0].includes('\\') })
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
        const body = lines.join('\n')
        const lit = d.lit || !/\$\(|`/.test(body)
        out.push(...shellPieces(body, true).map(x => ('op' in x ? x : { ...x, by: d.by, lit })), { op: ';' })
      }
      i = j - 1
    } else if (c === ';' || c === '\n') op(';')
    // a "{" or "}" opens or closes a `{ ...; }` group only as a word of its own at the start of a command; inside a
    // word (`git {stash,}`, `HEAD@{1}`, `find -exec ... {} +`) it is part of that word, as bash reads it (T-446)
    else if (c === '{' && !text.trim() && (n === undefined || /\s/.test(n))) op('(', false)
    else if (c === '}' && !text.trim() && (n === undefined || /[\s;&|)<>]/.test(n))) op(')')
    else if (c === '(') op('(')
    else if (c === ')') op(')')
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

/** The most folders walkBash keeps as the ones a command may be in (T-436). */
export const BASH_FOLDERS_MAX = 16

/**
 * What bashOutsideFolder answers (in place of a project path) for a command it can't judge: past BASH_FOLDERS_MAX
 * folders a relative path follows, or (bashPathsToCheck) more than BASH_PATHS_MAX paths to look up. No real path has a
 * NUL character in it.
 */
export const BASH_TOO_MANY = '\u0000too many'

/** A word that may be a plain relative path (`src/a.ts`, `lnk`): letters, digits and `._@%+~/-`, not an option. */
const PLAIN_PATH = /^(?!-)[\w.@%+~/-]+$/

/**
 * The words of piece `p` that may name a file by a plain relative path, for looking up symbolic links (T-436): the
 * shell's words (not the command name unless it has a "/"; a quoted one only when it stands alone in its quotes, not
 * code like `bun -e "..."`), and any word with a "/" in quoted text or a here-document's text (`open('lnk/a')`).
 */
function plainPathWords(p: { text: string; doc?: boolean }): Set<string> {
  const out = new Set<string>()
  if (!p.doc) {
    const words = shellWords(p.text)
    words.forEach(({ w, q }, i) => {
      // a word with a wildcard (`lnk/*.md`, `lnk/R?ADME.md`) is looked up by its folder part before the first
      // wildcard piece (`lnk`), so a link there is judged by where it leads (T-436)
      if (i > 0 && GLOB_PATH.test(w)) {
        const head = globFolder(w)
        if (head) out.add(head)
        return
      }
      if (!PLAIN_PATH.test(w) || (i === 0 && !w.includes('/'))) return
      if (!q || w.includes('/') || p.text.includes(`"${w}"`) || p.text.includes(`'${w}'`)) out.add(w)
    })
  }
  for (const w of pieceWords(p).keys()) if (w.includes('/') && PLAIN_PATH.test(w)) out.add(w)
  return out
}

/** A word that may be a relative path with a shell wildcard in it (`lnk/*.md`, `lnk/[R]EADME.md`, `./lnk/README*`). */
const GLOB_PATH = /^(?!-)(?=[^*?[]*[*?[])[\w.@%+~/*?[\]!^-]+$/

/** The folder part of wildcard word `w` before its first piece with a wildcard (`lnk/*.md` gives `lnk`), or '' for none. */
const globFolder = (w: string) => {
  const parts = w.split('/')
  const at = parts.findIndex(part => /[*?[]/.test(part))
  return parts.slice(0, at).join('/')
}

/**
 * A word of a simple command as written (`raw`, quotes kept), what it is without quotes (`w`), whether the shell would
 * expand anything in it (`$` or "`" outside single quotes), and whether it holds a shell sign outside quotes (`sign`:
 * `<`, `>`, `|`, `&`, `;`, `(`, `)`, `{` or `}`), so that `a.ts>../../x` counts as a redirect stuck to a word and
 * `{a,../../x}` as a brace expansion, not only text (T-481).
 */
type RawWord = { raw: string; w: string; expands: boolean; sign?: boolean }

/**
 * The words of simple command `text` as written, split at spaces outside quotes (see RawWord); in `w` quotes are dropped
 * and a backslash keeps the next character. A best effort, not a shell parser. `lit` maps each quoted or backslashed
 * character in `w` (braceLit).
 */
export function rawWords(text: string, lit = (c: string) => c): RawWord[] {
  const out: RawWord[] = []
  let cur: RawWord | undefined
  let quote = ''
  const add = (raw: string, w: string, expands = false) => {
    cur ??= { raw: '', w: '', expands: false }
    cur.raw += raw
    cur.w += w
    cur.expands ||= expands
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quote === "'") c === "'" ? ((quote = ''), add(c, '')) : add(c, lit(c))
    else if (c === '\\') add(c + (text[i + 1] ?? ''), lit(text[i + 1] ?? '')), i++
    else if (quote === '"') c === '"' ? ((quote = ''), add(c, '')) : add(c, lit(c), c === '$' || c === '`')
    else if (c === "'" || c === '"') (quote = c), add(c, '')
    else if (/\s/.test(c)) {
      if (cur) out.push(cur)
      cur = undefined
    } else {
      add(c, c, c === '$' || c === '`')
      // `{` and `}` too: `grep x {a,../../f}` expands to the path ../../f, which grep opens
      if (/[<>|&;(){}]/.test(c)) cur!.sign = true
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Text in a command that may make a plain command name run something else: a function or alias of that name, `hash`,
 * `enable`, a changed PATH, a file read into the shell (`source`, "."), `eval`. When it shows up, no word of the
 * command is taken as only text (T-481).
 */
const SHADOWS = /\b(alias|function|hash|enable|eval|source|PATH|BASH_ENV|ENV|exec)\b|(^|[\s;&|(){}])\.\s/

/** A function defined with the name of a command whose words may be taken as only text (`cat() { bash; }`), looked for in the whole command (SHADOWS). */
const SHADOW_FUNCTION = /\b(cat|tee|echo|printf|sed|gsed|grep|egrep|fgrep)\s*\(\s*\)/

/** A word that redirects (`>`, `2>&1`, `<`, `<<'EOF'`, `>f`): its operator part, and the target in the same word ('' when it is the next word). */
const REDIRECT = /^(\d*|&)(>>?|>\||<<<|<<-?|<>|<)(&?)(.*)$/

/**
 * Whether simple command `words` sends what it prints (its standard output) only to files: at least one `>`, `>>` or
 * `1>` redirect, each to a plain path that is not `/dev/...` (but /dev/null) or `/proc/...`, and no `>&` or `&>` that could send it on to a pipe.
 */
function printsToFile(words: RawWord[]): boolean {
  let file = false
  for (let i = 0; i < words.length; i++) {
    const m = REDIRECT.exec(words[i]!.raw)
    // a redirect stuck after other text (`b>&2`, `b>x`) is not judged here: then it is not only to files
    if (!m && words[i]!.sign) return false
    if (!m) continue
    const [, fd, op, amp, rest] = m
    if (amp || fd === '&') return false
    if (!op!.startsWith('>')) continue
    if (fd && fd !== '1') continue
    const target = rest ? { ...words[i]!, w: rest, raw: rest } : words[i + 1]
    if (!target || target.expands || !target.w || /^[&<>]/.test(target.raw)) return false
    if (/^\/(dev|proc)\//i.test(target.w) && target.w !== '/dev/null') return false
    file = true
  }
  return file
}

/** Command `words` with any leading `NAME=value` settings dropped, and its command name (undefined when there is none). */
function commandOf(words: RawWord[]): { name: string | undefined; args: RawWord[] } {
  let i = 0
  while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i]!.raw)) i++
  return { name: words[i]?.raw, args: words.slice(i + 1) }
}

/** Whether a here-document's text, sent to simple command `text`, is only written to a file and never run: `cat` or `tee` that print only to files (printsToFile, T-481). */
function docOnlyWritten(text: string): boolean {
  const words = rawWords(text)
  const { name } = commandOf(words)
  return (name === 'cat' || name === 'tee') && printsToFile(words)
}

/** Whether `s` is a sed script of `s`, `y` and plain one-letter commands only (with line or /regex/ addresses): nothing in it reads, writes or runs a file (no `r`, `R`, `w`, `W`, `e` command or flag). */
export function sedScriptSafe(s: string): boolean {
  let i = 0
  // a part ending at delimiter `d` (a backslash keeps the next character); false when it never ends
  const part = (d: string) => {
    for (; i < s.length; i++) {
      if (s[i] === '\\') i++
      else if (s[i] === d) return ++i, true
    }
    return false
  }
  const addr = () => {
    if (/\d/.test(s[i] ?? '')) while (/\d/.test(s[i] ?? '')) i++
    else if (s[i] === '$') i++
    else if (s[i] === '/' || s[i] === '\\') {
      const d = s[i] === '\\' ? s[++i] : '/'
      i++
      if (!d || d === '\n' || !part(d)) return false
      while (s[i] === 'I' || s[i] === 'M') i++
    }
    return true
  }
  while (i < s.length) {
    if (/[\s;]/.test(s[i]!)) {
      i++
      continue
    }
    if (!addr()) return false
    if (s[i] === ',') {
      i++
      if (!addr()) return false
    }
    while (s[i] === ' ' || s[i] === '!') i++
    const c = s[i++]
    if (c === 's' || c === 'y') {
      const d = s[i++]
      if (!d || d === '\\' || d === '\n' || !part(d) || !part(d)) return false
      if (c === 's') while (/[gpiImM\d]/.test(s[i] ?? '')) i++
    } else if (!c || !'dDpPgGhHxnNz={}'.includes(c)) return false
    if (i < s.length && !/[\s;}]/.test(s[i]!)) return false
  }
  return true
}

/**
 * Simple command `text` with the words that are only text to it taken out (T-481), and those words (`whole`), to be
 * checked each as one path, whole, the way a program that opens it would read it. That is what sed, grep, echo and
 * printf do with a word they are given: none of them finds a path inside its text and opens that (a sed script only
 * counts when sedScriptSafe passes it: no `r`, `w` or `e`), so `sed -i '' "s|'../../x'|'./x'|" f` is checked as
 * the one path `s|'..`/`..`/`x'|'.`/... inside the worker's folder, not as `../../x`. echo and printf only count when
 * they print to files (printsToFile), not to a shell (`echo 'cat ../../x' | sh`). Only words with nothing for the shell
 * to expand (`$`, "`") and not options or redirects count; the rest of `text`, and all of it for any other command,
 * stays as it is (perl, bun and node code may open any path written in it).
 */
function dropTextWords(text: string): { text: string; whole: string[] } {
  const words = rawWords(text)
  const { name, args } = commandOf(words)
  const sed = name === 'sed' || name === 'gsed'
  const grep = name === 'grep' || name === 'egrep' || name === 'fgrep'
  const print = (name === 'echo' || name === 'printf') && printsToFile(words)
  if (!sed && !grep && !print) return { text, whole: [] }
  const skip = new Set<RawWord>()
  args.forEach((a, j) => {
    const after = j > 0 && REDIRECT.exec(args[j - 1]!.raw)?.[4] === ''
    // a word with a shell sign outside quotes (`a.ts>../../x`, `x<../../f`) may hold a redirect: it stays as it is
    if (a.expands || a.sign || after || REDIRECT.test(a.raw) || a.w.startsWith('-') || !a.w) return
    if (sed && !sedScriptSafe(a.w)) return
    skip.add(a)
  })
  if (!skip.size) return { text, whole: [] }
  return { text: words.map(w => (skip.has(w) ? "''" : w.raw)).join(' '), whole: [...skip].map(w => w.w) }
}

/**
 * Walks shell `command` of a worker whose own folder is `wts` (the main name first) and calls `visit` with each clean
 * absolute path a word of it may name, stopping at (and answering) the first answer that is not undefined. A word
 * counts as a path when it starts with "/" or "~/" (`home` is the user's home folder) or has a ".." part, and with
 * `opts.plain` also a plain relative one (plainPathWords). Relative words
 * are taken from the folder the command is in at that point: it starts in `cwd` (the shell's folder, when the caller
 * knows it and it is inside the worker's folder, or outside the project `opts.tops` and not above it) or else the
 * worker's folder, and a plain `cd` or `pushd` earlier in the
 * command moves it ("cd src && cat ../package.json" reads the worker's own file). When it can't be told for sure (a `cd`
 * that may fail before ";" or "||", a group in parentheses), every folder the command may be in is tried, and a `cd`
 * that can't be followed (a variable, `cd -`) goes back to the worker's folder. Words inside quotes (an import path in
 * `bun -e "..."`) and here-document text are checked the same way, from every folder the command may be in, since
 * code passed as text may still read the path; a `cd` in here-document text only adds a folder it may be in, and `<<<` is a
 * here-string, not a here-document (T-417). A ".." word is also tried with its leading "/" dropped, so `$(pwd)/../..` is caught too.
 * At most BASH_FOLDERS_MAX folders are kept; past that a relative word answers BASH_TOO_MANY (T-436).
 */
function walkBash(command: string, wts: readonly string[], home: string | undefined, cwd: string | undefined, visit: (abs: string) => string | undefined, opts: { tops?: readonly string[]; plain?: boolean } = {}): string | undefined {
  const wt = wts[0]!
  const tops = opts.tops ?? []
  // the shell's folder counts inside the worker's own folder, and outside the project when the project is known and
  // not inside it (a throwaway copy in /tmp, T-436); anywhere else (the owner's copy, "/") it starts from the worker's folder
  const sh = cwd?.startsWith('/') ? resolvePath('/', cwd) : undefined
  const away = sh !== undefined && tops.length > 0 && insideAny(sh, tops, false) === undefined && !tops.some(t => inside(t, sh, false) !== undefined)
  const start = [sh !== undefined && (away || insideAny(sh, wts, true) !== undefined) ? sh : wt]
  // past BASH_FOLDERS_MAX folders the list stops growing (it doubles with every cd that may fail): from then on a
  // relative path can't be judged from every folder the command may be in, so it is refused (T-436)
  let over = false
  const join = (...lists: string[][]) => {
    const all = [...new Set(lists.flat())]
    if (all.length <= BASH_FOLDERS_MAX) return all
    over = true
    return all.slice(0, BASH_FOLDERS_MAX)
  }
  // every folder a cd so far may have left the command in, for "||": it grows by at most BASH_FOLDERS_MAX + 1 per cd,
  // and it is not capped, since a command whose folder is certain (`cd a && cd b && ...`) must not count as over
  const union = (...lists: string[][]) => [...new Set(lists.flat())]
  // every folder the command may be in at this point
  let here = start
  let seen = start
  const groups: { here: string[] }[] = []
  const pieces = shellPieces(command)
  // shell text that may make `cat`, `sed`... run something else: then no word is taken as only text (T-481)
  const shadowed = SHADOW_FUNCTION.test(command) || pieces.some(p => 'text' in p && !p.doc && SHADOWS.test(p.text))
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
    // a here-document only written to a file (`cat > .scratch/p.ts <<'EOF'`) is text, not shell: its words and any cd
    // in it are skipped, as with the Write tool (T-481)
    if (p.doc && p.lit && p.by !== undefined && !shadowed) {
      const by = pieces[p.by]
      if (by && 'text' in by && docOnlyWritten(by.text)) continue
    }
    // the words that are only text to the command (a sed script, a grep pattern) are checked each as one path (T-481)
    const { text, whole } = p.doc || shadowed ? { text: p.text, whole: [] } : dropTextWords(p.text)
    const q = { text, doc: p.doc }
    const plain = opts.plain ? new Set([...plainPathWords(q), ...whole]) : new Set<string>()
    for (const w of new Set([...pieceWords(q).keys(), ...whole, ...plain])) {
      const climbs = w.split('/').includes('..')
      const homeWord = (w === '~' || w.startsWith('~/')) && home?.startsWith('/')
      if (!w.startsWith('/') && !homeWord && !climbs && !plain.has(w)) continue
      const relative = !homeWord && (!w.startsWith('/') || climbs)
      if (relative && over) return BASH_TOO_MANY
      const dirs = here
      const tries = homeWord ? [resolvePath(home!, w.slice(1).replace(/^\/+/, '') || '.')] : dirs.map(d => resolvePath(d, w))
      if (climbs && w.startsWith('/')) tries.push(...dirs.map(d => resolvePath(d, w.replace(/^\/+/, ''))))
      for (const abs of tries) {
        const rel = visit(abs)
        if (rel !== undefined) return rel
      }
    }
    // a command word with expansion braces (`{cd,} /tmp`, `c{d..d} /tmp`) may be a cd: the folder it names is added,
    // and the worker's folder (as for a cd that can't be followed), and none is dropped (T-436)
    const first = rawWords(p.text, braceLit).map(x => x.w)[0]
    if (first !== undefined && hasBrace(first)) {
      const guess = cdTarget(`cd ${p.text.trim().replace(/^\S+\s*/, '')}`, home)
      const moved = [wt, ...(guess ? here.map(d => resolvePath(d, guess)) : [])]
      here = join(here, moved)
      seen = union(seen, here)
      continue
    }
    const to = cdTarget(p.text, home)
    if (to === undefined) continue
    // a "cd" in a here-document's text may run (`bash <<X`) or be only text (`cat > f <<X`): it adds a folder the
    // command may be in, and never drops the one it was in (T-417)
    if (p.doc) {
      if (to !== null) {
        here = join(here, here.map(d => resolvePath(d, to)))
        seen = union(seen, here)
      }
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
    seen = union(seen, moved)
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
 * are followed by the caller (bashPathsToCheck). It checks paths only: git writes run from the worker's own folder
 * (a commit, `git update-ref refs/heads/main`, a push) are refused by the caller with gitWriteIn. The merge-time scope
 * check only looks at which files the task's commits change, so it catches files written through the shell inside the
 * worker's folder outside the task's files, not a branch the worker moved.
 */
export function bashOutsideFolder(command: unknown, worktree: Folders, root: Folders, home?: string, cwd?: string): string | undefined {
  const wts = folderList(worktree)
  const tops = folderList(root)
  if (typeof command !== 'string' || !wts.length || !tops.length) return undefined
  const check = (abs: string) => (insideAny(abs, wts, true) !== undefined ? undefined : insideAny(abs, tops, false))
  const found = walkBash(command, wts, home, cwd, check, { tops })
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

/**
 * The most distinct paths bashPathsToCheck answers, so a long command costs a bounded number of disk lookups; the
 * caller only looks up on disk those that may go through a symbolic link (T-436).
 */
export const BASH_PATHS_MAX = 2000

/**
 * The absolute paths a worker's Bash `command` may name, for the caller to look up on disk, so a symbolic link is
 * judged by where it leads: elsewhere (`~/link/README.md`, T-417) and inside the worker's own folder `worktree`
 * (`lnk/README.md`, `cd lnk && cat README.md`, T-436). The same walk as bashOutsideFolder (`root`: the project folder,
 * for where the shell starts), plus plain relative words (plainPathWords). `tooMany`: more than BASH_PATHS_MAX paths,
 * or a relative one past BASH_FOLDERS_MAX folders, so the command can't be checked whole and the caller refuses it.
 */
export function bashPathsToCheck(command: unknown, worktree: Folders, home?: string, cwd?: string, root: Folders = []): { paths: string[]; tooMany: boolean } {
  const wts = folderList(worktree)
  if (typeof command !== 'string' || !wts.length) return { paths: [], tooMany: false }
  const out = new Set<string>()
  const found = walkBash(
    command,
    wts,
    home,
    cwd,
    abs => {
      out.add(abs)
      return out.size > BASH_PATHS_MAX ? BASH_TOO_MANY : undefined
    },
    { tops: folderList(root), plain: true },
  )
  const tooMany = found === BASH_TOO_MANY
  return { paths: tooMany ? [] : [...out], tooMany }
}

/** The reason a worker reads when its shell command has too many paths or folder changes to check (BASH_TOO_MANY). */
export const bashTooManyText = (worktree: string) =>
  `Refused: this command has too many paths or folder changes (cd) to check where they lead (more than ${BASH_PATHS_MAX} paths, or more than ${BASH_FOLDERS_MAX} folders it may be in). Split it into shorter commands, use absolute paths inside your own folder ${worktree}, or write files with the Write tool.`

/** The reason a worker reads when its shell command naming project path `rel` is refused for being outside its own folder `worktree` (or for BASH_TOO_MANY). */
export const bashOutsideText = (rel: string, worktree: string) =>
  rel === BASH_TOO_MANY
    ? bashTooManyText(worktree)
    : `Refused: this command names ${rel || 'the project folder'} in the owner's copy of the project, outside your own folder. Work only in your own folder ${worktree}: use paths inside it (relative paths start there), never the owner's copy, even to read.`

/** git commands a checker may run as they are: they only read. Anything not listed (and not in gitReadOnly below) is refused. */
const GIT_READ = new Set(['diff', 'log', 'show', 'status', 'blame', 'grep', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file', 'rev-list', 'merge-base', 'describe', 'shortlog', 'show-branch', 'whatchanged', 'name-rev', 'diff-tree', 'diff-index', 'diff-files', 'annotate', 'help', 'version', 'count-objects', 'var', 'check-ignore', 'check-attr', 'show-ref'])

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
const DIFF_LIKE = new Set(['diff', 'log', 'show', 'reflog', 'whatchanged', 'diff-tree', 'diff-index', 'diff-files', 'format-patch', 'rev-list', 'shortlog'])

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
 * Turns a quoted or backslashed "{", "}" and "," into "_" for rawWords, so what is left of them is what bash's brace
 * expansion may read (`'{"h":"%h"}'` is text, `{git,stash}` is not).
 */
export const braceLit = (c: string) => (/[{},]/.test(c) ? '_' : c)

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
    // cat-file --filters runs the repository's filter programs (any unique start of it: --fi, --filter)
    if (sub === 'cat-file' && long && long.length > 1 && 'filters'.startsWith(long)) return a.split('=')[0]
    if (long && !LONG_OK.has(long) && !long.startsWith('no-') && LONG_REFUSED.some(n => n.startsWith(long))) return a.split('=')[0]
    // short options may be put together (`-nO`); -O runs its value as a command in grep, -o writes a file in diff-like
    // commands. The letters after an option that takes a value are that value (`-Sfoo`, `-G"checkout"`), not options.
    const flag = sub === 'grep' ? 'O' : DIFF_LIKE.has(sub) ? 'o' : undefined
    if (flag && /^-[^-]/.test(a) && shortFlags(a, sub === 'grep' ? GREP_VALUE : sub === 'shortlog' ? DIFF_VALUE.replace('n', '') : DIFF_VALUE).includes(flag)) return `-${flag}`
  }
  return undefined
}

/** `git config` options that only pick where to read or how to show it; any other option (--add, --unset, --edit, --file...) is refused. */
const CONFIG_SHOW = /^(--(global|local|system|worktree|show-origin|show-scope|name-only|null|includes|no-includes|bool|int|bool-or-int|path|expiry-date|type=[\w-]+)|-z)$/

/** `git config` options (or, in newer git, first words) that read a setting; one of them is needed. */
const CONFIG_GET = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'])

/** Whether `git config args` only reads: one of CONFIG_GET (or `get`/`list` first), and else only CONFIG_SHOW options. */
function configReadOnly(args: string[]): boolean {
  let get = args[0] === 'get' || args[0] === 'list'
  for (const a of get ? args.slice(1) : args) {
    if (CONFIG_GET.has(a)) get = true
    else if (a.startsWith('-') && !CONFIG_SHOW.test(a)) return false
  }
  return get
}

/** Whether git `args` (the words after the command name `sub`) only read. */
function gitReadOnly(sub: string, args: string[]): boolean {
  if (GIT_READ.has(sub)) return true
  // `git remote` and `-v` list the remotes, get-url shows one; show, prune, update and the rest may reach the network or change them
  if (sub === 'remote') return args.length === 0 || args.every(a => a === '-v' || a === '--verbose') || args[0] === 'get-url'
  if (sub === 'config') return configReadOnly(args)
  // only `git reflog` (options alone) and `git reflog show ...` show; every other subcommand (expire, delete, drop,
  // write, and any git adds later) may change it, and a plain ref (`git reflog HEAD`) can't be told from one
  if (sub === 'reflog') return args[0] === 'show' || args.every(a => a.startsWith('-'))
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
 * reads (diff, log, show, status, branch --list, stash list, remote -v, config --get, reflog...). Looks inside compound
 * commands (&&, ;, |, `$(...)`), past git's own options (`git -C <dir>`), and inside any word that has `git` in it
 * (quoted text run by `sh -c`, a `VAR=` value, an option value like `-O"git stash"`). Any word `git` (or ending in
 * `/git`, or `git-xyz`) counts, so an odd read may be refused too; that is the safe side. Two exceptions (T-439): a
 * command run by a read-only text tool (grep, rg, cat, ls, find without -exec... see TEXT_TOOLS), where `git` is only
 * a pattern or a name (`grep -n "git stash" docs`), and a read-only git command, whose words aren't read again
 * (`git log --grep="git stash"`). They hold only when every command in the whole line is one of them, so
 * `grep -h git notes | sh` and `grep -h git notes > s; $SHELL s` are refused, and never in a line with a newline, a
 * `#` comment, `$'` or a backslash outside quotes (`grep x #'` + newline + `git stash`, `grep x a\>& git stash`). git run by xargs is
 * refused.
 *
 * A best effort on the command's text, not a sandbox: a git run through a variable, a script file, a settings file the
 * checker wrote, or other shell tricks gets through. Closing those is the sandbox's job (T-365), not this check's.
 * `cwd`: the folder the shell is in, which a git command with no `-C` and no `cd` before it acts in (see GitPlace).
 */
export function gitWriteIn(command: unknown, allow?: GitAllow, cwd?: string): string | undefined {
  if (typeof command !== 'string') return undefined
  const { bad, git, env } = gitScan(command, 0, allow, false, cwd)
  return bad ?? (git && env ? env : undefined)
}

/**
 * Where a git command that starts a simple command of the line itself (not one inside `sh -c '...'`, after `sudo`,
 * and so on) runs: `pre`, its own options before the command name as written (quotes kept, `-C /tmp/x`); `args`, the
 * words after the command name as written; `dir`, the folder the shell is in when it runs, when that can be told
 * (the shell's folder, or the plain literal folder of a `cd` joined to it by `&&` only, see gitFolders).
 */
export type GitPlace = { pre: RawWord[]; args: RawWord[]; dir?: string }

/** A git command (`sub`, and the words after it; `place` when known, see GitPlace) that gitWriteIn lets through although it writes. */
export type GitAllow = (sub: string, args: string[], place?: GitPlace) => boolean

/** A git command that either of `a` and `b` lets through. */
export const eitherAllow =
  (a: GitAllow, b: GitAllow): GitAllow =>
  (sub, args, place) =>
    a(sub, args, place) || b(sub, args, place)

/**
 * Plain literal absolute path `raw` as written (quotes kept), cleaned, or undefined when it isn't one: it starts with
 * "/", has only letters, digits and `._@%+,=-/` (spaces too inside whole-word "..." or '...'), so no `$`, backquote,
 * `~`, glob or other quotes, and no `..` piece.
 */
export function literalPath(raw: string): string | undefined {
  const q = /^"([^"]*)"$/.exec(raw) ?? /^'([^']*)'$/.exec(raw)
  const p = q ? q[1]! : raw
  if (!(q ? /^\/[\w./@%+,= -]*$/ : /^\/[\w./@%+,=-]*$/).test(p)) return undefined
  if (p.split('/').includes('..')) return undefined
  return resolvePath('/', p)
}

/** Whether clean absolute path `abs` is strictly inside one of the scratch folders `temps` and in none of `keep` (letter case ignored). */
const inScratchTemp = (abs: string, temps: Folders, keep: Folders) => {
  const rel = insideAny(abs, folderList(temps), true)
  return !!rel && insideAny(abs, folderList(keep), false) === undefined
}

/**
 * The folders git writes are allowed in for workers and checkers (T-591): /tmp (and /private/tmp), and the system
 * temp folder `tmpdir` (from TMPDIR) when it is a plain literal path under macOS's /var/folders; anything else
 * (unset, or a folder elsewhere) adds nothing, so a TMPDIR set to the home or project folder opens nothing.
 */
export function scratchTemps(tmpdir?: string): string[] {
  const t = tmpdir ? literalPath(tmpdir.replace(/\/+$/, '')) : undefined
  return t && /^(\/private)?\/var\/folders\/[^/]+\//.test(t) ? ['/tmp', t] : ['/tmp']
}

/** The git commands whose `-m <text>` is a message, not looked at by scratchGitAllow (`rebase -m` is --merge). */
const MESSAGE_SUBS = new Set(['commit', 'tag', 'merge', 'notes', 'stash'])

/** Options of `git init` a scratch repository may have (see scratchGitAllow); `-b` and `--initial-branch` take a branch name. */
const SCRATCH_INIT_OPTIONS = /^(-q|--quiet|--bare|--initial-branch=[\w./-]+)$/

/**
 * T-591: the git writes a worker or checker may run in a throwaway repository: every folder the command acts in is a
 * plain literal path (literalPath) strictly inside `temps` (scratchTemps) and in none of `keep` (the project, its
 * worktrees). That folder is the last `-C <path>` (no other own option but --no-pager), or else the shell's folder
 * (GitPlace.dir); `git init <path>` acts in `<path>` (absolute, or a plain relative one from that folder). Every word
 * after the command name may not expand (`$`, backquote), start with `~`, have a `..` piece, have a space (a command
 * given as one quoted word, as in `rebase -x '...'` or `alias.z '!...'`; only --author=... may), be --global or
 * --system (the owner's or the system's git settings), or name an absolute path anywhere in it (`--output=/x`, a URL,
 * `-x/x`) outside those folders; a commit message (`-m <text>`) and
 * redirects (checked as paths elsewhere) are not looked at. A simple rule against honest mistakes, not a security
 * boundary: links inside .git, files the same line writes, hooks and settings are not checked.
 */
export const scratchGitAllow =
  (temps: Folders, keep: Folders): GitAllow =>
  (sub, _args, place) => {
    if (!place) return false
    const ok = (abs: string | undefined) => abs !== undefined && inScratchTemp(abs, temps, keep)
    let dir = place.dir
    for (let i = 0; i < place.pre.length; i++) {
      const o = place.pre[i]!.raw
      if (o === '-C') {
        dir = literalPath(place.pre[++i]?.raw ?? '')
        if (dir === undefined) return false
      } else if (o !== '--no-pager') return false
    }
    const args = place.args
    if (sub === 'init') {
      const names: RawWord[] = []
      for (let i = 0; i < args.length; i++) {
        const a = args[i]!
        if (a.raw === '-b' || a.raw === '--initial-branch') {
          if (!/^[\w./-]+$/.test(args[++i]?.raw ?? '')) return false
        } else if (a.raw.startsWith('-')) {
          if (!SCRATCH_INIT_OPTIONS.test(a.raw)) return false
        } else names.push(a)
      }
      if (names.length > 1) return false
      const name = names[0]
      if (name) {
        if (name.raw.startsWith('/') || /^["']\//.test(name.raw)) return ok(literalPath(name.raw))
        // a plain relative name, taken from the folder git is in
        return dir !== undefined && /^[\w.@%+,=-][\w./@%+,=-]*$/.test(name.raw) && !name.raw.split('/').includes('..') && ok(resolvePath(dir, name.raw))
      }
    }
    if (!ok(dir)) return false
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!
      // a message, only for the commands whose -m is one (for rebase -m is --merge, so the next word is checked)
      if (MESSAGE_SUBS.has(sub)) {
        if (a.raw === '--message' || /^-[aqsvnS]*m$/.test(a.raw)) {
          i++
          continue
        }
        if (/^(-[aqsvnS]*m|--message=)/.test(a.raw)) continue
      }
      const redir = REDIRECT.exec(a.raw)
      if (redir) {
        if (!redir[4] && !redir[3]) i++
        continue
      }
      // --global / --system: the owner's ~/.gitconfig or the system's, outside the scratch folder
      // also any unique shortening of these long options (`--glob`, `--syst`), which the parser accepts the same
      const long = a.w.split('=')[0]!
      if (long.length > 2 && long.startsWith('--') && ('--global'.startsWith(long) || '--system'.startsWith(long))) return false
      // `config -f<file>`: the file joined to the option (`-f~/.gitconfig`) must be a plain relative name too
      // (`-f <file>` and `--file=<file>` are checked below as words and paths)
      if (sub === 'config' && /^-f./.test(a.w)) {
        const f = a.w.slice(2)
        const plain = /^[\w.@%+,=-][\w./@%+,=-]*$/.test(f) && !f.split('/').includes('..')
        if (!plain && !ok(literalPath(f))) return false
      }
      // a space: a command or path given as one quoted word (`rebase -x 'git -C /repo ...'`, `alias.z '!cd; git ...'`)
      if (/\s/.test(a.w) && !/^--author=/.test(a.raw)) return false
      if (a.expands || /(^|[=:,])~/.test(a.w) || /(^|[^\w.])\.\.(\/|$)/.test(a.w)) return false
      // every absolute path anywhere in the word (`--output=/x`, `file:///x`, `-x/x`, `'!/usr/bin/git -C/x'`)
      for (const m of a.w.matchAll(/(?:^|^-[A-Za-z]|[^\w.@%+-])(\/[^\s,:;'"|&<>()]*)/g)) if (!ok(literalPath(m[1]!))) return false
    }
    return true
  }

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

/**
 * Read-only text tools: in a command run by one of these, the word `git` in an argument is only text (a search
 * pattern, a file name), never run. Each value: an option of that tool that runs another program or deletes, which
 * puts the piece back under the broad rule (rg --pre, ag/ack --pager, sort --compress-program, less +!cmd, find -exec).
 */
const TEXT_TOOLS: Record<string, RegExp | undefined> = {
  grep: undefined,
  egrep: undefined,
  fgrep: undefined,
  rg: /^--(p|hostname-bin)/,
  ag: /^--p/,
  ack: /^--p/,
  cat: undefined,
  head: undefined,
  tail: undefined,
  less: /^(\+|-k|--lesskey)/,
  more: /^(\+|-k|--lesskey)/,
  wc: undefined,
  sort: /^--co/,
  uniq: undefined,
  cut: undefined,
  ls: undefined,
  file: undefined,
  stat: undefined,
  diff: undefined,
  find: /^-(exec|execdir|ok|okdir|delete)$/,
}

/** Folders a text tool may be run from by its full path (`/usr/bin/grep`); any other path may be a script of the same name. */
const TOOL_DIR = /^(\/usr\/local\/bin|\/opt\/homebrew\/bin|\/usr\/bin|\/bin)\/[^/]+$/

/** The program name of word `w` (`/usr/bin/sudo` gives `sudo`), in small letters. */
const progName = (w: string) => w.slice(w.lastIndexOf('/') + 1).toLowerCase()

/** Programs that add words from their input to the command they run (`echo stash | xargs git`). */
const ADDS_WORDS = new Set(['xargs', 'parallel'])

/** Whether simple command `words` is a read-only text tool (TEXT_TOOLS), first word and without its refused options. */
function textTool(words: string[]): boolean {
  const w = words[0]
  if (w === undefined || (w.includes('/') && !TOOL_DIR.test(w))) return false
  const name = progName(w)
  if (!Object.hasOwn(TEXT_TOOLS, name)) return false
  const refused = TEXT_TOOLS[name]
  return !refused || !words.slice(1).some(a => refused.test(a))
}

/**
 * Whether simple command `p` is a plain `cd` or `pushd`: no folder, or one plain path (no `$`, quotes, `(`, `<`, `;`,
 * glob, and not an option), so it only changes folder (`cd hooks && grep -n git ask.ts`).
 */
const plainCd = (p: { text: string; words: string[] }) =>
  (p.words[0] === 'cd' || p.words[0] === 'pushd') && p.words.length <= 2 && /^\s*(cd|pushd)(\s+(?!-)[\w./~+,:%-]+)?\s*$/.test(p.text)

/** Whether text holds a command run inside it (`$(...)`, backquotes, `<(...)`, `>(...)`). */
const RUNS_INSIDE = /\$\(|`|<\(|>\(/

/** Programs that run their text words as a new command line (`bash -c '...'`, `eval '...'`). */
const RERUNS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'eval'])

/** What gitWriteIn names for a git command with brace expansion in it. */
const BRACE_WHAT = 'with {braces}'

/**
 * Whether word `w` (from rawWords with braceLit, so quoted braces are gone) has a "{" that bash's brace expansion may read: not a
 * git revision's `@{...}` (`HEAD@{1}`), not a `${...}` setting and not an empty `{}` (bash keeps it as text, as in
 * `find -exec git log {} +`).
 */
const hasBrace = (w: string) =>
  w.replace(/[@$]\{[^{}]*\}/g, '').replace(/\{\}/g, '').includes('{')

/** The most words braceExpand makes from one word before it gives up. */
const BRACE_WORDS_MAX = 1024
/** The longest word, and the most "{" in one, braceExpand works on before it gives up, so an odd word stays cheap. */
const BRACE_CHARS_MAX = 2000
const BRACE_OPEN_MAX = 50

/**
 * The words bash's brace expansion makes of word `w` (`{a,b}x` gives `ax bx`, `g{h..i}t` gives `ght git`, nested
 * ones too), or null when that is more than BRACE_WORDS_MAX (or the word is longer than BRACE_CHARS_MAX, or has
 * more than BRACE_OPEN_MAX "{"). A `{...}` with no comma and no range stays as it is.
 * A best effort, not bash: a superset of its words is fine here.
 */
function braceExpand(w: string): string[] | null {
  if (w.length > BRACE_CHARS_MAX || w.split('{').length - 1 > BRACE_OPEN_MAX) return null
  for (let i = w.indexOf('{'); i >= 0; i = w.indexOf('{', i + 1)) {
    let depth = 0
    let j = i
    const cuts: number[] = []
    for (; j < w.length; j++) {
      const c = w[j]
      if (c === '{') depth++
      else if (c === '}' && --depth === 0) break
      else if (c === ',' && depth === 1) cuts.push(j)
    }
    if (j >= w.length) continue
    const body = w.slice(i + 1, j)
    let alts: string[] | undefined
    if (cuts.length) alts = [i, ...cuts].map((at, k) => w.slice(at + 1, cuts[k] ?? j))
    else {
      const num = /^(-?\d+)\.\.(-?\d+)(?:\.\.-?\d+)?$/.exec(body)
      const chr = /^([A-Za-z])\.\.([A-Za-z])(?:\.\.-?\d+)?$/.exec(body)
      if (num) {
        const [a, b] = [Number(num[1]), Number(num[2])]
        if (Math.abs(a - b) >= BRACE_WORDS_MAX) return null
        alts = Array.from({ length: Math.abs(a - b) + 1 }, (_, k) => String(a < b ? a + k : a - k))
      } else if (chr) {
        const [a, b] = [chr[1]!.charCodeAt(0), chr[2]!.charCodeAt(0)]
        alts = Array.from({ length: Math.abs(a - b) + 1 }, (_, k) => String.fromCharCode(Math.min(a, b) + k))
      }
    }
    // zsh makes a range of any two characters (`{*../}` gives `* + , - . /`), so a range that isn't letters or
    // numbers can't be told here (T-450)
    if (!alts && body.includes('..')) return null
    if (!alts) continue
    const out: string[] = []
    for (const a of alts) {
      const more = braceExpand(w.slice(0, i) + a + w.slice(j + 1))
      if (!more || out.push(...more) > BRACE_WORDS_MAX) return null
    }
    return out
  }
  return [w]
}

/**
 * Whether word `w` (from rawWords with braceLit) may become git through brace expansion: with the braces and commas gone it reads git
 * (`{git,} stash`, `g{i,}t stash`), or one of its comma-separated parts, or that part's last path piece, is git or
 * `git-...` (`{git,stash}`, `{/usr/bin/git,stash}`), or one of the words its expansion makes is (`g{i..i}t`,
 * `{g..h}it`, T-436). Too many words to tell counts as git.
 */
const braceGit = (w: string) => {
  if (!hasBrace(w)) return false
  if (/(?:^|[/=])git$/i.test(w.replace(/[{},]/g, '')) || w.split(/[{},]/).some(part => /^git(?:$|-)/i.test(part.split(/[/=]/).pop() ?? ''))) return true
  const words = braceExpand(w)
  return words ? words.some(e => /(?:^|[/=])git(?:$|-)/i.test(e)) : braceLetters(w)
}

/**
 * Whether word `w` has every letter of "git" among its letters and the letters its `{x..y}` letter ranges make, for a
 * brace expansion too big for braceExpand: a number range (`{1..2000}`, `f{1..1100}.txt`) adds no letter, so it can
 * never spell git (T-436).
 */
const braceLetters = (w: string) => {
  const letters = w
    .replace(/\{-?\d+\.\.-?\d+(?:\.\.-?\d+)?\}/g, '')
    .replace(/\{([A-Za-z])\.\.([A-Za-z])(?:\.\.-?\d+)?\}/g, (_, a: string, b: string) => {
      const [x, y] = [a.charCodeAt(0), b.charCodeAt(0)].sort((m, n) => m - n) as [number, number]
      return Array.from({ length: y - x + 1 }, (_, k) => String.fromCharCode(x + k)).join('')
    })
    .toLowerCase()
  // a range left (`{*..h}`) may make any character in zsh (T-450)
  if (/\{[^{}]*\.\.[^{}]*\}/.test(letters)) return true
  return [...'git'].every(c => letters.includes(c))
}

/**
 * Whether every brace group in word `w` is a plain comma list: no `..` range in it (zsh makes a range of any two
 * characters, `{*../}`), and no comma part that starts with "-" (it may make an option). A word may only keep its
 * braces as a path after `--` or as echo, printf or `x=` text when this holds (T-450).
 */
const plainBraces = (w: string) => {
  const v = w.replace(/[@$]\{[^{}]*\}/g, '').replace(/\{\}/g, '')
  // a word too big to look at stays refused, so an odd word stays cheap
  if (v.length > BRACE_CHARS_MAX || v.split('{').length - 1 > BRACE_OPEN_MAX || /[{,]-/.test(v)) return false
  for (let i = v.indexOf('{'); i >= 0; i = v.indexOf('{', i + 1)) {
    let depth = 0
    let j = i
    for (; j < v.length; j++) {
      if (v[j] === '{') depth++
      else if (v[j] === '}' && --depth === 0) break
    }
    if (v.slice(i + 1, j).includes('..')) return false
  }
  return true
}

/**
 * The places in simple command `words` of the words given to a read-only text tool (TEXT_TOOLS) that find runs with
 * -exec, -execdir, -ok or -okdir, up to the ending `;` or `+` (`grep`'s `-l git {}` in `find . -exec grep -l git {} +`).
 * The command find runs is the word right after -exec; when it is a text tool, a `git` among its words is only text.
 */
function findExecTextArgs(words: string[]): Set<number> {
  const out = new Set<number>()
  if (!words.some(w => progName(w) === 'find')) return out
  for (let i = 0; i < words.length; i++) {
    if (!/^-(exec|execdir|ok|okdir)$/.test(words[i]!)) continue
    let end = i + 1
    while (end < words.length && !/^(\\?;|\+)$/.test(words[end]!)) end++
    if (textTool(words.slice(i + 1, end))) for (let k = i + 2; k < end; k++) out.add(k)
    i = end
  }
  return out
}

/** Whether the command splitter may misread `text`: it has a newline, a backslash, `$'` or a `#` that starts a word. */
const unsplit_ = (text: string) => /\n|\\|\$'|(?:^|[\s;&|()<>`])#/.test(text)

/**
 * `text` without the backslashes that are plain text to bash (T-485): each one inside '...', and each one inside
 * "..." before a letter it doesn't escape there (`"a\|b"`, `"\.ts"`). Those can't hide a `&`, `;` or `|` from the
 * command splitter, which reads quotes as bash does. A backslash outside quotes, or one inside "..." before `\`, `"`,
 * `$`, a backquote or a newline, is kept, as is all of an unclosed quote, so unsplit_ still sees it.
 */
function dropQuotedBackslashes(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\') (out += c + (text[i + 1] ?? '')), i++
    else if (c === "'" || c === '"') {
      let j = i + 1
      let inner = ''
      for (; j < text.length && text[j] !== c; j++) {
        const d = text[j]!
        if (d !== '\\') inner += d
        else if (c === '"' && /[\\"$`\n]/.test(text[j + 1] ?? '\n')) (inner += d + (text[j + 1] ?? '')), j++
      }
      if (j >= text.length) return out + text.slice(i)
      out += c + inner + c
      i = j
    } else out += c
  }
  return out
}

/**
 * `text` with each '...' outside double quotes and outside a backslash's reach replaced by `''` (what is in it is
 * plain text to bash). An unclosed one is kept as it is.
 */
function dropSingleQuoted(text: string): string {
  let out = ''
  let dq = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\') (out += c + (text[i + 1] ?? '')), i++
    else if (c === '"') (dq = !dq), (out += c)
    else if (c === "'" && !dq) {
      const end = text.indexOf("'", i + 1)
      if (end < 0) return out + text.slice(i)
      out += "''"
      i = end
    } else out += c
  }
  return out
}

/** Whether word `w` is a shell assignment (`x=...`, `x+=...`). */
const isAssign = (w: string) => /^[A-Za-z_]\w*\+?=/.test(w)

/** Whether word `w` is echo or printf (by name, or by its full path in TOOL_DIR). */
const isPrint = (w: string | undefined) => w !== undefined && (!w.includes('/') || TOOL_DIR.test(w)) && /^(echo|printf)$/.test(progName(w))

/**
 * Whether simple command `p` only sets variables and prints text: leading `x=` words, then nothing or echo/printf,
 * with no command run inside it, no here-document and no redirection (`>`, `<`).
 */
const printOrAssign = (p: { text: string; doc?: boolean; words: string[] }) => {
  if (p.doc || RUNS_INSIDE.test(p.text) || /[<>]/.test(p.text)) return false
  const cmd = p.words.find(w => !isAssign(w))
  return cmd === undefined || isPrint(cmd)
}

/**
 * The places in simple command `p` of words whose braces never spell a command: its leading `x=` words (bash doesn't
 * brace-expand an assignment), and the words given to echo or printf right after them.
 */
function braceTextArgs(p: { words: string[] }): Set<number> {
  const out = new Set<number>()
  let i = 0
  for (; i < p.words.length && isAssign(p.words[i]!); i++) out.add(i)
  if (isPrint(p.words[i])) for (let k = i + 1; k < p.words.length; k++) out.add(k)
  return out
}

/**
 * For each simple command of `pieces` (one command line), the folder it runs in when that can be told (T-591): the
 * shell's folder `cwd` (when it is a plain literal path) until a `cd` or `pushd`; after a `cd <plain literal absolute
 * path>` (literalPath) that folder, but only for the commands joined to that cd by `&&` alone, so a cd that fails
 * stops them (`cd /tmp/x; git commit` would commit in the shell's folder when /tmp/x is missing). A cd after `||`,
 * a cd to anything else (a variable, `$(mktemp -d)`, `~`, a relative path), any other operator after a cd, and a
 * pipe, a group or a subshell anywhere in the line leave the folder unknown (no entry).
 */
/** Words that may change the shell's folder when they are not the first word of a command (gitFolders). */
const FOLDER_WORDS = new Set(['cd', 'pushd', 'popd', 'eval', 'source', '.'])

function gitFolders(pieces: ShellPiece[], cwd?: string): Map<ShellPiece, string | undefined> {
  const out = new Map<ShellPiece, string | undefined>()
  if (pieces.some(p => ('op' in p && (p.op === '|' || p.op === '(' || p.op === ')')) || (!('op' in p) && p.doc))) return out
  let dir = cwd ? literalPath(cwd) : undefined
  let moved = false
  let prev: string | undefined
  for (const p of pieces) {
    if ('op' in p) {
      if (p.op !== '&&' && moved) dir = undefined
      prev = p.op
      continue
    }
    out.set(p, dir)
    const words = rawWords(p.text)
    const name = words[0]?.raw
    if (name === 'cd' || name === 'pushd' || name === 'popd') {
      moved = true
      dir = name !== 'popd' && prev !== '||' && words.length === 2 ? literalPath(words[1]!.raw) : undefined
    } else if (words[0]?.expands || (!isGit(words[0]?.w ?? '') && words.some(x => FOLDER_WORDS.has(x.w)))) {
      // a cd with a word before it (`builtin cd`, `command cd`, `x=1 cd`, `'cd'`), a command run by name from a
      // variable, or text run again (`eval`, `source`, `.`) may change folder: the folder is unknown from here
      moved = true
      dir = undefined
    }
  }
  return out
}

/** gitWriteIn's walk of `command`: the first git write found (`bad`), whether any git runs, and the first setting from GIT_ENV_REFUSED. */
function gitScan(command: string, depth: number, allow?: GitAllow, broad = false, cwd?: string): { bad?: string; git: boolean; env?: string } {
  const out: { bad?: string; git: boolean; env?: string } = { git: false }
  if (depth > 4) return out
  const pieces = shellPieces(command)
  // only the line itself tells which folder its commands run in; text a shell runs again (depth > 0) never does
  const dirs = depth === 0 ? gitFolders(pieces, cwd) : new Map<ShellPiece, string | undefined>()
  // `adds`: an xargs or parallel comes before it in the line (`xargs -I{} git {}` is cut at the braces)
  let seen = false
  const simple = pieces.flatMap(p => {
    if ('op' in p) return []
    const raws = rawWords(p.text)
    const words = raws.map(x => x.w)
    const adds = seen
    seen ||= words.some(a => ADDS_WORDS.has(progName(a)))
    return [{ ...p, words, raws, top: depth === 0 && !p.doc, dir: dirs.get(p), braces: rawWords(p.text, braceLit).map(x => x.w), adds }]
  })
  /** Where the git command that starts simple command `p` runs (GitPlace), for `allow`; only for one at the line's top. */
  const placeOf = (p: (typeof simple)[number]) => (p.top ? { raws: p.raws, dir: p.dir } : undefined)
  /**
   * The git write of the git command at `words[at]` (`git ...` or `git-xyz ...`), and the word after it, or undefined
   * when it isn't git. `place`: the simple command's words as written and its folder, when `words[at]` starts it.
   */
  const gitAt = (words: string[], at: number, adds: boolean, braces: string[], place?: { raws: RawWord[]; dir?: string }): { bad?: string } | undefined => {
    const w = words[at]!
    // a git program called by its own name, as in git's libexec folder (`.../git-core/git-stash`)
    const dashed = /(?:^|\/)git-([\w-]+)$/i.exec(w)?.[1]
    // an option whose value is git runs it with the words after (`rg --pre=git stash .` runs `git stash`)
    // brace expansion may spell git (`{git,} stash`, `{git,stash}`, `g{i,}t stash`)
    const braced = !dashed && !isGit(w) && braceGit(braces[at] ?? w)
    if (!dashed && !isGit(w) && !/=git$/i.test(w) && !braced) return undefined
    out.git = true
    // xargs and parallel add words from their input (`stash`, `--output=x`), so what that git does can't be known
    if (adds || words.slice(0, at).some(a => ADDS_WORDS.has(progName(a)))) return { bad: 'xargs git' }
    if (braced) return { bad: `git ${BRACE_WHAT}` }
    let j = at + 1
    let sub = dashed
    let refused: string | undefined
    if (!dashed) {
      for (; j < words.length && words[j]!.startsWith('-'); j += GIT_GLOBAL_VALUE.has(words[j]!) ? 2 : 1)
        if (!refused && GIT_GLOBAL_REFUSED.test(words[j]!)) refused = words[j]!.split('=')[0]
      sub = words[j++]
    }
    // bash's brace expansion makes new words (`git {stash,}` runs `git stash`, `git -C {.,} stash` runs `git -C . stash`),
    // so what a git command with a "{" in its words does can't be told from its text (T-446). Only words after a `--`
    // of a read-only command (GIT_READ) may have braces (`git diff -- hooks/{a,b}.ts`): they are paths, and when that
    // `--` is an option's value (`git log --grep -- {--output=x,}`) none of the words they make may start with "-" (T-450).
    const dashes = sub !== undefined && GIT_READ.has(sub) ? words.indexOf('--', j) : -1
    const own = dashes < 0 ? braces.slice(at + 1) : braces.slice(at + 1, dashes)
    const paths = dashes < 0 ? [] : braces.slice(dashes + 1).filter(hasBrace)
    if (own.some(hasBrace) || paths.some(w => !plainBraces(w) || braceExpand(w)?.every(e => !e.startsWith('-')) !== true)) return { bad: `git ${BRACE_WHAT}` }
    if (refused) return { bad: `git ${refused}` }
    if (sub === undefined) return {}
    const args = words.slice(j)
    const where = place && at === 0 && !dashed && isGit(w) ? { pre: place.raws.slice(1, j - 1), args: place.raws.slice(j), dir: place.dir } : undefined
    if (allow?.(sub, args, where)) return {}
    if (!gitReadOnly(sub, args)) return { bad: `git ${sub}` }
    const opt = gitBadOption(sub, args)
    return opt ? { bad: `git ${sub} ${opt}` } : {}
  }
  /**
   * Whether a simple command's `git` words are only text: a TEXT_TOOLS command, or a read-only git command (checked
   * by gitAt), with no command run inside it and not in a here-document.
   */
  const exempt = (p: (typeof simple)[number]): boolean => {
    if (p.words.length === 0) return true
    if (p.doc || RUNS_INSIDE.test(p.text)) return false
    if (textTool(p.words) || plainCd(p)) return true
    const w = p.words[0]!
    // `HEAD@{1}` braces were cut at before T-439's round 6, so a line with `@{` gets no read-only git exception
    if (command.includes('@{')) return false
    return (isGit(w) || /(?:^|\/)git-[\w-]+$/i.test(w)) && gitAt(p.words, 0, p.adds, p.braces, placeOf(p))?.bad === undefined
  }
  // Text one command prints may be run by another (`grep -h git notes | sh`, `grep ... > s; $SHELL s`, `./s`), and a
  // list of programs that run their input or a file can never be complete. So the exceptions hold only when every
  // command in the whole line is exempt; one other command anywhere (sh, $SHELL, ./s, chmod, echo, tee...) keeps
  // main's broad rule for all of it. The command splitter doesn't know `#` comments or `$'...'` quoting, so with a
  // newline, a `#` that starts a word or `$'` in the line (`grep x #'` + newline + `git stash`) no exception holds either.
  // Nor with a backslash outside quotes: an escape like `a\>&` hides a background `&` from the splitter (T-439 round 7).
  /** Adds inner gitScan result `inner` to `out`; the result to return when it found a git write. */
  const fold = (inner: { bad?: string; git: boolean; env?: string }) => {
    out.git ||= inner.git
    out.env ??= inner.env
    return inner.bad ? { ...out, bad: inner.bad } : undefined
  }
  // a backslash inside quotes that is plain text to bash (`grep "a\|b" x`) doesn't count (T-485)
  const unsplit = unsplit_(dropQuotedBackslashes(command))
  // a word anywhere that names a git program (`.../git-core/git-stash`, as an option's value too) keeps main's rule
  const gitProgram = simple.some(p => p.words.some(w => /(?:^|[/=])git-[\w-]+$|git-core\//i.test(w)))
  broad ||= unsplit || gitProgram || !simple.every(exempt)
  // T-450: a brace word in a leading `x=` assignment (bash doesn't brace-expand it) or given to echo or printf is only
  // text, when every other command in the line is exempt or one of these too, so nothing runs that text again
  // (`echo {git,stash} | sh` and `x={git,stash}; eval $x` stay refused)
  // (a backslash inside '...' is plain text to bash and to the splitter, as in `printf '%s\n' {a,b}`)
  const quiet = !unsplit_(dropSingleQuoted(command)) && !gitProgram && simple.every(p => exempt(p) || printOrAssign(p))
  for (const p of simple) {
    const words = p.words
    const textBraces = quiet ? braceTextArgs(p) : new Set<number>()
    for (const w of words) out.env ??= GIT_ENV_REFUSED.exec(w)?.[1]
    if (!broad && exempt(p)) continue
    // text a shell runs again (`bash -c '{git,stash}'`, `eval '{git,stash}'`) is a whole command of its own, with its
    // own brace expansion and splitting, so each word after a shell or eval is checked as one (T-446)
    const shellAt = words.findIndex(w => RERUNS.has(progName(w)))
    if (shellAt >= 0) {
      const rest = words.slice(shellAt + 1)
      const texts = progName(words[shellAt]!) === 'eval' ? [rest.join(' ')] : rest.filter(w => !/^[-+]/.test(w))
      for (const t of texts) {
        const bad = fold(gitScan(t, depth + 1, allow, true))
        if (bad) return bad
      }
    }
    const toolArgs = findExecTextArgs(words)
    // main's broad rule: any word `git` (or ending in `/git`, or `git-xyz`) counts, and text from a `git` on in any
    // word that holds more than one word or command (quoted text run by sh -c, `X='git stash'`, `-O"git stash"`)
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!
      // a word given to a text tool run by find -exec is its text, not a git command (`find . -exec grep -l git {} +`)
      const g = toolArgs.has(i) || (textBraces.has(i) && hasBrace(p.braces[i] ?? '') && plainBraces(p.braces[i] ?? '')) ? undefined : gitAt(words, i, p.adds, p.braces, i === 0 ? placeOf(p) : undefined)
      if (g?.bad) return { ...out, bad: g.bad }
      if (g) continue
      const at = w.search(/git(?!\w)/i)
      if (at >= 0 && /[\s;&|<>()`$]/.test(w.slice(at))) {
        const bad = fold(gitScan(w.slice(at), depth + 1, allow, broad))
        if (bad) return bad
      }
    }
  }
  return out
}

/** The start of each git write reason: `what` may change something, and `who` may only read with git. */
const gitReadOnlyText = (what: string, who: string) =>
  `Refused: ${what} may change the repository or run another program, and ${who} may only read with git (diff, log, show, status, blame, grep, rev-parse, ls-files, branch --list, stash list/show, remote -v, config --get, reflog), without options that write a file or run a program (--output, -O, --ext-diff, -c, GIT_* settings).`

/** The reason a checker reads when its Bash command runs git command `what` (from gitWriteIn), which may change something. */
export const gitWriteText = (what: string) =>
  `${gitReadOnlyText(what, 'the checker')} Check the work without changing any branch, commit, tag or the stash.`

/**
 * The reason a worker reads when its Bash command runs git command `what` (from gitWriteIn), which may change
 * something: its branch names, tags and stash are shared with the owner's folder (main too), and symcc commits, tests
 * and merges the work. `into`: the branch a "merge it in" try may merge (mergeStepAllow), named in the reason.
 */
export const workerGitWriteText = (what: string, into?: string) =>
  `${gitReadOnlyText(what, 'a worker')} Don't commit, push, merge, reset, switch branches, stash or move any branch or tag: just change the files in your folder; symcc commits, tests and merges your work.${into ? ` In this try you may also run \`git merge ${into}\` (or \`git merge --abort\`) to merge ${into} in; then resolve the conflicts in the files and don't commit.` : ''}`

/**
 * The reason a scout reads when its Bash command runs git command `what` (from gitWriteIn), which may change
 * something: a scout runs in the owner's own folder, so a git write there changes the owner's branch, files or stash.
 */
export const scoutGitWriteText = (what: string) =>
  `${gitReadOnlyText(what, 'a scout')} You run in the owner's own folder: don't commit, push, merge, reset, switch branches, stash or move any branch or tag. Report what you find instead.`

/**
 * Where an edit of `path` would write inside the project folder `root` (any of its names), relative to it; relative
 * paths are taken from the project folder. Undefined for no path and for paths outside the project (such as /tmp).
 * As editOutsideFolder, letter case is ignored and /tmp, /var and /etc also match their macOS /private names.
 */
export function editInProject(path: string | undefined, root: Folders): string | undefined {
  const p = editTarget(path)
  const tops = folderList(root)
  if (!p || !tops.length) return undefined
  return insideAny(resolvePath(tops[0]!, p), tops, false)
}

/** The reason a scout reads when its edit of project path `rel` is refused: scouts never change the project. */
export const scoutEditText = (rel: string) =>
  `Refused: ${rel || 'that path'} is in the owner's project, and a scout never changes the project's files. Write throwaway files under /tmp if you need them, and report what you find instead.`

/**
 * The project path (relative to the worker's folder `worktree`) an edit of `path` would change, when it lies outside
 * `files` (the same matching as the merge-time scope check, outOfScope); undefined when the edit is allowed, has no
 * path, or is outside the worker's folder (see
 * editOutsideFolder for those). Relative paths are taken from the worker's folder, and ".." is worked out first.
 * `scratch`: whether the folder uses SCRATCH_DIR (false when the project keeps files there in git); only then is an
 * edit under it allowed without the file check.
 */
export function blockedEdit(path: string | undefined, worktree: Folders, files: string[], dataDir: string, scratch = true): string | undefined {
  const p = editTarget(path)
  const wts = folderList(worktree)
  if (!p || !wts.length) return undefined
  const rel = insideAny(resolvePath(wts[0]!, p), wts, true)
  if (!rel || (scratch && inScratch(rel))) return undefined
  return outOfScope([rel], files, dataDir).length ? rel : undefined
}

/**
 * The throwaway folder in each worker's folder (T-456): a worker or checker may write scripts and notes there. It is in
 * the checkout's local ignore list (info/exclude, never .gitignore), so it is never staged, committed or scope checked;
 * an edit under it is never refused as outside the task's files, and symcc clears it when a try ends or the folder is reused.
 */
export const SCRATCH_DIR = '.scratch'

/** The line in the checkout's info/exclude that keeps SCRATCH_DIR out of git (only at the folder's top). */
export const SCRATCH_EXCLUDE = `/${SCRATCH_DIR}/`

/** Whether `rel` (a path relative to the worker's folder, with ".." already worked out) is inside SCRATCH_DIR. */
export const inScratch = (rel: string) => rel.startsWith(`${SCRATCH_DIR}/`)

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
