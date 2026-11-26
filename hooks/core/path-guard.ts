// The folder guards: where an edit would write (editOutsideFolder, blockedEdit), the one text rule for a Bash command
// (bashOutsideFolder), the scratch folder, and the texts an agent reads when a call is refused or a guard failed.
import { outOfScope } from './task'

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

/** The shell's folder as the host read it, when it is an absolute path; undefined when it couldn't be read. */
export const shellCwd = (got: unknown): string | undefined => (typeof got === 'string' && got.startsWith('/') ? got : undefined)

/** What bashOutsideFolder answers, in place of a project path, for a command with a `..` path piece. No real path has a NUL character. */
export const BASH_DOTDOT = '\u0000..'

/** What bashOutsideFolder answers for a command that changes to a folder above the project (`cd /`, `cd ~`). */
export const BASH_ABOVE = '\u0000above'

/** Characters that end a path in a command's text. */
const PATH_END = String.raw`\s;&|<>(){}=:,\``

/** Shell text `s` with each backslash at a line's end joined to the next line, as the shell does. */
export const joinLines = (s: string) => s.replace(/\\\r?\n/g, '')

/** `s` with its regular expression characters escaped. */
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * T-1062: the one shell path rule for a worker's or checker's Bash `command`. Its text (quotes and backslashes
 * dropped) may not hold the project folder `root` (any of its names, also as `~/...` or `$HOME/...` from `home`)
 * unless that place is inside the worker's own folder `worktree` (any of its names): the answer is the named path
 * relative to the project ('' for the project itself; also when a glob character follows, `<project>*`). A `..` path piece anywhere (`cd ..`, `../x`, `a/../b`)
 * answers BASH_DOTDOT: "use full paths"; the previous folder (`~-`, $OLDPWD, like `cd -`), zsh's folder stack (`~1`, `cd +1`) and a cd, chdir or pushd to a folder above the project (`cd /`, `cd`, `cd ~`
 * when home holds the project) answers BASH_ABOVE, as a relative path from there reaches it. Plain text, no shell parsing: a path built at run time ($X, $(...), a
 * script) is not seen. Letter case is ignored, as macOS folders usually do.
 */
export function bashOutsideFolder(command: unknown, worktree: Folders, root: Folders, home?: string): string | undefined {
  const wts = folderList(worktree)
  const tops = folderList(root).filter(t => t !== '/')
  if (typeof command !== 'string' || !wts.length || !tops.length) return undefined
  // quotes and backslashes only group words: `.''.`, `\..` and `.\./` are `..` to the shell
  const plain = joinLines(command).replace(/["'\\]/g, '')
  if (/(?:^|[\s/=:(<>&|;,{])\.\.(?=$|[\s/`;&|)<>,}])/.test(plain)) return BASH_DOTDOT
  // the previous folder (`~-`, $OLDPWD) and zsh's folder stack (`~1`, `~-2`, `cd +1`) are unknown here: the owner's
  // copy may be one of them (`rm ~-/README.md`, like `cd -`)
  if (/(?<![^\s;&|<>(){}=:,`])~(?:-\d*|\+?\d+)(?=$|[\/\s;&|<>(){}:,`])|\$\{?OLDPWD\b|(?<![\w.-])(?:cd|chdir|pushd|popd)[^\S\n]+[+-]\d/.test(plain)) return BASH_ABOVE
  const h = home?.startsWith('/') ? resolvePath('/', home) : undefined
  // home written as `~`, `~<user>`, `$HOME` or `${HOME}` is home's full path
  const user = h ? reEscape(h.split('/').pop() ?? '') : ''
  const homed = h ? plain.replace(new RegExp(`(?<![^${PATH_END}])(?:~(?:${user})?|\\$HOME|\\$\\{HOME\\})(?=$|[/${PATH_END}])`, 'gi'), h) : plain
  // `a//b` and `a/./b` name the same place as `a/b`
  const flat = homed.replace(/\/(?:\.?\/)+/g, '/')
  // a cd to a folder above the project (`cd /`, or home by `cd` or `cd ~`), from where a relative path reaches it;
  // option words (`cd -P /`, `cd -- /`) are skipped, so `cd -` (the last folder, unknown here) counts as home
  for (const m of flat.matchAll(/(?<![\w.-])(?:cd|chdir|pushd)(?=$|[\s;&|)])(?:[^\S\n]+-[^\s;&|()]*)*[^\S\n]*([^\s;&|()]*)/g)) {
    const w = m[1]!
    const to = w === '' ? h : w.startsWith('/') ? resolvePath('/', w) : undefined
    if (to !== undefined && tops.some(t => t.toLowerCase() !== to.toLowerCase() && inside(t, to, false) !== undefined)) return BASH_ABOVE
  }
  // a wildcard (`*`, `?`, `[`, `{`) at or above the project's own level may reach it (`/Users/o/*/README.md`)
  for (const m of flat.matchAll(/\/[^\s;&|<>()`]*/g)) {
    const parts = m[0].split('/').slice(1)
    for (const top of tops) {
      const own = top.split('/').slice(1)
      const k = Math.min(parts.length, own.length)
      if (!parts.slice(0, k).some(p => /[*?[{]/.test(p))) continue
      const like = (p: string, o: string) => new RegExp(`^${reEscape(p).replace(/\\\{[^}]*\\\}|\\\[[^\]]*\\\]/g, '.*').replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`, 'i').test(o)
      if (parts.slice(0, k).every((p, i) => like(p, own[i]!))) return ''
    }
  }
  // anywhere in the text, also glued to an option (`sort -o<project>/README.md`, `tar -C<project>`)
  for (const top of tops) {
    for (const m of flat.matchAll(new RegExp(`${reEscape(top)}(?=$|[/*?[${PATH_END}])(?:/[^${PATH_END}]*)?`, 'gi'))) {
      const abs = resolvePath('/', top + m[0].slice(top.length))
      if (insideAny(abs, wts, false) === undefined) return insideAny(abs, tops, false) ?? ''
    }
  }
  return undefined
}

/** The reason a worker reads when its shell command naming project path `rel` (or BASH_DOTDOT) is refused. */
export const bashOutsideText = (rel: string, worktree: string): string =>
  rel === BASH_DOTDOT
    ? `Refused: this command has a ".." path piece. Use full paths inside your own folder ${worktree} instead.`
    : rel === BASH_ABOVE
      ? `Refused: this command changes to a folder above the project, from where a relative path reaches the owner's copy. Stay in your own folder ${worktree} and use full paths.`
      : `Refused: this command names ${rel || 'the project folder'} in the owner's copy of the project, outside your own folder. Work only in your own folder ${worktree}: use paths inside it, never the owner's copy, even to read.`

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
