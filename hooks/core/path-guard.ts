// The folder guards: where an edit or a Bash command would read or write (editOutsideFolder, blockedEdit,
// bashOutsideFolder), the scratch folder, and the texts an agent reads when a call is refused or a guard failed.
import { outOfScope } from './task'
import { dropTextWords, docOnlyWritten, hasBrace, braceLit, pieceWords, rawWords, reEscape, SHADOW_FUNCTION, SHADOWS, shellPieces, shellWords, type ShellPiece } from './shell-words'

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
export function folderList(f: Folders): string[] {
  const list = (typeof f === 'string' ? [f] : f).filter(x => typeof x === 'string' && x.startsWith('/')).map(x => resolvePath('/', x))
  return [...new Set(list.flatMap(pathAliases))]
}

/** `abs` relative to the first of `dirs` it is inside (see inside), or undefined. */
export function insideAny(abs: string, dirs: readonly string[], exact: boolean): string | undefined {
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
