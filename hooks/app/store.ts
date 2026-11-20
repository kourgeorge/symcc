import { type Board, parseBoard, readBoard, brokenBoardText, emptyBoard, symccOn, lockText, isLockStale, tmpName } from '../board'
import { checkHealth } from './health'
import { publish } from './lead'
import { tellLead } from './tell'
import { S } from './state'
import { boardEvents, withStageHistory } from '../core/events'
import { emitTaskEvents, logTaskEvents, type TaskEvent } from './events'
import type { Host } from '../host'

// ---------------- the board on disk ----------------

export const now = () => new Date().toISOString()
/** What a tool answers while the project folder (S.root) is not known yet, e.g. during a plugin reload. */
export const startingText = () => `${S.N.name} is still starting, try again in a moment`

/**
 * A path inside the project. The hooks that can run before session.start (tool.call, command.run) call findRoot first (T-271).
 * Throws while the project folder is unknown, so nothing is ever read or written from the disk root (T-274).
 */
export const path = (rel: string) => {
  if (!S.root) throw new Error(`the project folder is not known yet, so ${rel} has no place`)
  return `${S.root}/${rel}`
}

/**
 * The main project folder for `dir` when `dir` is one of symcc's own worker folders (T-472), else `dir` itself.
 * git's shared folder (`git rev-parse --git-common-dir`) is the main project's .git, so its parent is the main
 * project; `dir` is in the main project only when its `git rev-parse --show-toplevel` is that project. Else `dir` only counts as a worker's folder when it lies inside <main project>/.<name>/worktrees/ (real paths
 * compared), so an owner's own second checkout (another `git worktree`) keeps its own root. When git can't tell (no
 * git, a bare repo, a host that runs nothing), a path inside .<name>/worktrees/ is cut back to the project above it.
 */
export async function mainRoot(host: Host, dir: string): Promise<string> {
  if (!dir) return ''
  const clean = dir.replace(/\/+$/, '') || '/'
  const r = await host.run(['git', 'rev-parse', '--git-common-dir'], { cwd: clean, timeoutMs: 15_000 }).catch(() => null)
  const common = r && r.exitCode === 0 ? r.stdout.trim().replace(/\/+$/, '') : ''
  if (common && /(^|[\\/])\.git$/.test(common)) {
    // git answers ".git" (or a relative path) in the main project, an absolute path (/..., C:/... or \\server\...) from a worktree
    const abs = isAbsolute(common) ? common : `${clean}/${common}`
    const main = normalPath(abs.slice(0, -'.git'.length))
    // git's own answer: the main project (or a folder inside it) has the main project as its toplevel; any other
    // toplevel is a worktree, which is a worker's folder (guard-only) or the owner's own worktree (keeps its own root)
    const t = await host.run(['git', 'rev-parse', '--show-toplevel'], { cwd: clean, timeoutMs: 15_000 }).catch(() => null)
    const top = t && t.exitCode === 0 ? t.stdout.trim() : ''
    const inMain = top && isAbsolute(top) ? within(normalPath(top), main) && within(main, normalPath(top)) : !isAbsolute(common)
    if (inMain) return main
    return (await isWorkerFolder(host, clean, main)) ? main : clean
  }
  const mark = `/${S.N.worktrees}/`
  const at = clean.indexOf(mark)
  return at > 0 ? clean.slice(0, at) : clean
}

/** Where `p` really is (symbolic links followed), with "/" between its parts; `p` as written when the disk can't tell. */
async function realOf(host: Host, p: string): Promise<string> {
  const real = await Promise.resolve()
    .then(() => host.fs.stat(p, { resolve: true }))
    .then(st => st.realPath, () => undefined)
  return normalPath(real || p).replace(/\\/g, '/')
}

/** True when path `p` is folder `dir` or inside it ("\" read as "/"). */
const within = (p: string, dir: string) => {
  const slash = (x: string) => x.replace(/\\/g, '/').replace(/\/+$/, '')
  const a = slash(p)
  const d = slash(dir)
  return a === d || a.startsWith(`${d}/`)
}

/**
 * True when folder `dir` lies inside `main`'s .<name>/worktrees/ folder (real paths compared): one of symcc's worker
 * folders, where a copy of the plugin only guards (see guardStart). Any other folder, an owner's own second checkout too, is not.
 */
export async function isWorkerFolder(host: Host, dir: string, main: string): Promise<boolean> {
  if (!dir || !main) return false
  const [d, w] = await Promise.all([realOf(host, dir), realOf(host, `${main}/${S.N.worktrees}`)])
  return d !== w && within(d, w)
}

/** True for a path from the top of a disk: "/...", a Windows drive ("C:/..." or "C:\...") or a share ("\\server\..."). */
export const isAbsolute = (p: string) => /^([\\/]|[A-Za-z]:[\\/])/.test(p)

/**
 * `p` with its "." and ".." parts worked out (git may answer e.g. "../../.git" from a folder inside the project).
 * Its start is kept as written: "/", a drive "C:/" or a share "\\" (so "C:/proj/x/../" gives "C:/proj").
 */
export function normalPath(p: string): string {
  const start = /^[A-Za-z]:[\\/]/.test(p) ? p.slice(0, 3) : /^[\\/]{2}[^\\/]/.test(p) ? p.slice(0, 2) : p.startsWith('/') ? '/' : ''
  const out: string[] = []
  for (const part of p.slice(start.length).split(/[\\/]/)) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  const sep = start.includes('\\') ? '\\' : '/'
  return `${start}${out.join(sep)}` || '/'
}

/**
 * Sets S.root from the session (its git repo, else its folder) when it is not set yet, as session.start does. It is
 * always the main project, also for a session in a worker's worktree (see mainRoot).
 * A hook that runs before session.start (a plugin reload starts the module over) uses this; true once the root is known.
 */
export async function findRoot(host: Host): Promise<boolean> {
  if (S.root) return true
  const repo = await host.session.repo().catch(() => null)
  const root = await mainRoot(host, repo?.root || (await host.session.root().catch(() => '')) || '').catch(() => '')
  if (root && !S.root) S.root = root
  return !!S.root
}

/** Counts this copy of the plugin's temp files, so each save gets its own (see tmpName). */
let tmpCount = 0

/** A new temp file name for one save of `file` (never the same twice, in this session or another). */
export const tmpFor = (file: string) => tmpName(file, S.me || 'unknown', `${++tmpCount}-${Math.random().toString(36).slice(2, 8)}`)

/**
 * Writes `text` to `file` safely: first to a temp file of its own (tmpFor), then renamed over `file`, so a crash
 * mid-write never leaves half a file and two saves at once never break each other. A failed rename throws
 * "couldn't save <what>: ..."; a failed write throws its own error. Either way the temp file is removed.
 */
export async function safeWrite(host: Host, file: string, text: string, what: string): Promise<void> {
  const tmp = tmpFor(file)
  let r: { exitCode: number; stdout: string; stderr: string }
  try {
    await host.fs.write(tmp, text)
    // host.fs has no rename; mv within one folder is an atomic rename
    r = await host.run(['mv', '-f', tmp, file])
  } catch (e) {
    await host.run(['rm', '-f', tmp]).catch(() => undefined)
    throw e
  }
  if (r.exitCode === 0) return
  await host.run(['rm', '-f', tmp]).catch(() => undefined)
  throw new Error(`couldn't save ${what}: ${(r.stderr || r.stdout).trim().slice(0, 200) || `mv exit ${r.exitCode}`}`)
}

/** The last job queued for each key (see oneAtATime). */
const queues = new Map<string, Promise<unknown>>()

/**
 * Runs `fn` after every job queued before it with the same key has finished (failed or not), so read-change-write
 * jobs on one file in this session never overlap and never lose each other's changes.
 */
export function oneAtATime<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn)
  const tail = run.catch(() => undefined)
  queues.set(key, tail)
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
  return run
}

/** board.json texts already reported (broken, or with skipped entries or bad settings), and the copy kept of each */
const reported = new Map<string, string>()

/** Forgets the job queues and the board texts already reported (what a reload starts with); for the tests' resetPlugin() only. */
export function resetStore() {
  queues.clear()
  reported.clear()
}

/**
 * Keep a copy of board.json's text beside it (board.json.<what>-<time>) and tell the owner
 * (a toast) and the lead, once per distinct text. Returns the copy's name ('' if it couldn't be written).
 */
async function keepCopy(host: Host, text: string, what: string, say: (copy: string) => string): Promise<string> {
  const known = reported.get(text)
  if (known !== undefined) return known
  // a guard-only copy (guardStart, in a worker's folder) never writes; the copy that drives the board keeps it
  if (S.guardOnly) return ''
  const copy = `${S.N.boardFile}.${what}-${now().replace(/[:.]/g, '-')}`
  const ok = await host.fs.write(path(copy), text).then(() => true, () => false)
  const name = ok ? copy : ''
  reported.set(text, name)
  const msg = say(name)
  host.ui.toast(S.N.toast(msg))
  tellLead(host, msg)
  return name
}

/**
 * What readBoard fixed, in words: skipped task entries, settings set to their default (plain names
 * like "mode"), and whole-sentence fixes inside tasks (like "T-1: 2 bad files entries dropped") as they are.
 */
export function fixText(skipped: number, fixed: string[]): string {
  const names = fixed.filter(f => /^\w+$/.test(f))
  const notes = fixed.filter(f => !/^\w+$/.test(f))
  return [
    skipped ? `skipped ${skipped} task entr${skipped > 1 ? 'ies' : 'y'} that ${skipped > 1 ? 'are' : 'is'} not a task` : '',
    names.length ? `bad value${names.length > 1 ? 's' : ''} for ${names.join(', ')} set to the default` : '',
    ...notes,
  ].filter(Boolean).join('; ')
}

/** board.json's mtime (ms) now, or null when it is missing or can't be looked at. Never throws. */
export async function boardMtime(host: Host): Promise<number | null> {
  const st = await host.fs.stat(path(S.N.boardFile)).catch(() => null)
  return st ? st.mtimeMs : null
}

/**
 * Notes board.json's mtime as read by this session (its own load or save). Only publish (which draws that state) counts
 * it as seen, by copying it to S.boardMtime; a save counts at once, as its publish follows (T-429, T-431).
 */
async function noteMtime(host: Host, seen = false) {
  S.readMtime = await boardMtime(host).catch(() => null)
  if (seen) S.boardMtime = S.readMtime
}

export async function load(host: Host): Promise<Board> {
  await noteMtime(host)
  const exists = await host.fs.exists(path(S.N.boardFile))
  if (!exists) {
    const b = emptyBoard()
    S.enabledNow = symccOn(b)
    return b
  }
  const text = await host.fs.read(path(S.N.boardFile))
  const r = readBoard(text)
  if (r.broken) {
    // Never go on with a stand-in board: it would be saved over the file and lose every task.
    // Throwing here refuses every change, start and merge until the file is fixed; workers already running are left alone.
    const copy = await keepCopy(host, text, 'broken', c => brokenBoardText(S.N.boardFile, r.broken!, c || undefined))
    throw new Error(brokenBoardText(S.N.boardFile, r.broken, copy || undefined))
  }
  if (r.skipped || r.fixed.length)
    await keepCopy(host, text, 'before-fix', c => `${S.N.boardFile}: ${fixText(r.skipped, r.fixed)}${c ? `. The file as it was is kept in ${c}` : ''}.`)
  S.enabledNow = symccOn(r.board)
  return r.board
}

/**
 * Saves board.json once in the current shape when reading it brought old tasks up to date (see
 * migrateTask), keeping a copy of the file as it was. Nothing happens for a board already current.
 */
export async function saveMigrated(host: Host): Promise<void> {
  const text = await host.fs.read(path(S.N.boardFile)).catch(() => null)
  if (typeof text !== 'string') return
  const r = readBoard(text)
  if (r.broken || !r.migrated) return
  await keepCopy(host, text, 'before-migrate', c => `${S.N.boardFile}: ${r.migrated} older entr${r.migrated > 1 ? 'ies' : 'y'} (tasks or archived totals) ${r.migrated > 1 ? 'were' : 'was'} brought to the current shape${c ? `. The file as it was is kept in ${c}` : ''}.`)
  await change(host, b => b)
}

/** Is the plugin on for this project? Read from the board file each time (a missing or broken board: on). Never throws. */
export async function isOn(host: Host): Promise<boolean> {
  const text = await host.fs.read(path(S.N.boardFile)).catch(() => null)
  return (S.enabledNow = symccOn(parseBoard(typeof text === 'string' ? text : null)))
}

/**
 * session.start sets `mark` while it runs claimLead: a clock wait in claimLead's path (the board
 * lock, old workers ending, the reload settle) calls it first, so session.start can go on
 * without waiting (see sessionStart in app/symcc.ts). Called from other hooks meanwhile it does no harm.
 */
export const startWait: { mark: (() => void) | null } = { mark: null }
export const aboutToWait = () => startWait.mark?.()

/**
 * Take .<name>/board.lock so no other session reads or writes the board meanwhile.
 * The lock is written to its own temp file first and then hard-linked into place:
 * `ln` fails if the lock exists, so only one session can win, and nobody ever sees
 * a half-written lock. A stale lock (its session died) is removed and taken over.
 */
export async function takeLock(host: Host): Promise<string> {
  const lock = path(S.N.lockFile)
  const me = `${await host.session.id().catch(() => 'unknown')}:${Math.random().toString(36).slice(2, 10)}`
  const mine = lockText(me, Date.now())
  const tmp = tmpFor(lock)
  await host.fs.write(tmp, mine)
  try {
    const until = Date.now() + 5_000
    for (;;) {
      if ((await host.run(['ln', tmp, lock])).exitCode === 0) return mine
      const held = await host.fs.read(lock).catch(() => null)
      const st = await host.fs.stat(lock).catch(() => null)
      if (held !== null && isLockStale(held, Date.now(), st?.mtimeMs)) {
        // remove it only if it is still the same stale lock we just read
        await dropIfSame(host, lock, held)
        continue
      }
      if (Date.now() > until) throw new Error(`the board is busy (another session holds ${S.N.lockFile}); try again`)
      aboutToWait()
      await host.clock.sleep(100)
    }
  } finally {
    await host.run(['rm', '-f', tmp]).catch(() => undefined)
  }
}

export async function dropLock(host: Host, mine: string) {
  await dropIfSame(host, path(S.N.lockFile), mine)
}

/** Removes lock file `file` only while it still holds `text` (ours, or the stale one just read). Never throws. */
export async function dropIfSame(host: Host, file: string, text: string) {
  if ((await host.fs.read(file).catch(() => null)) === text) await host.run(['rm', '-f', file]).catch(() => undefined)
}

/**
 * One try at taking lock file `file` with `text`, the same safe way as takeLock: written to its own temp file,
 * then hard-linked into place (`ln` fails if the lock exists). True when the lock is ours now.
 */
export async function tryLock(host: Host, file: string, text: string): Promise<boolean> {
  const tmp = tmpFor(file)
  await host.fs.write(tmp, text)
  try {
    return (await host.run(['ln', tmp, file])).exitCode === 0
  } finally {
    await host.run(['rm', '-f', tmp]).catch(() => undefined)
  }
}

/** Write to a temp file, then rename it over board.json, so a crash mid-write never leaves a broken board. */
export async function saveBoard(host: Host, b: Board) {
  await safeWrite(host, path(S.N.boardFile), JSON.stringify(b, null, 2) + '\n', 'the board')
  await noteMtime(host, true)
}

/**
 * Saves board `after` over `before` (read under the board lock, which the caller holds): the task events of the write
 * (boardEvents) put their stage lines in the tasks' history (withStageHistory), the board is saved and the events are
 * added to the activity log (logTaskEvents, never throws). Answers the board as saved and the events; the caller hands
 * the events to the listeners (emitTaskEvents) only after it lets go of the lock, so a listener may write the board.
 * Every board write goes through here (change, the archive).
 */
export async function writeBoard(host: Host, before: Board, after: Board): Promise<{ board: Board; events: TaskEvent[] }> {
  const nowMs = Date.now()
  const events = boardEvents(before, after, nowMs)
  const saved = withStageHistory(after, events)
  await saveBoard(host, saved)
  await logTaskEvents(host, events)
  return { board: saved, events }
}

/**
 * Every change goes through here, one at a time, so two workers finishing together
 * never lose an update; the lock file does the same between sessions.
 */
export function change<T>(host: Host, fn: (b: Board) => [Board, T] | Board): Promise<T> {
  return locked(host, async () => {
    const before = await load(host)
    const out = fn(before)
    const [next, value] = Array.isArray(out) ? out : [out, undefined as T]
    const { board: after, events } = await writeBoard(host, before, next)
    return [after, value, events] as const
  }).then(async ([after, value, events]) => {
    // after the lock is let go (S.writing no longer waits on this write), so a listener may change the board itself
    await emitTaskEvents(host, events)
    // a guard-only copy (guardStart, in a worker's folder) saves the board but never shows it: no panel, no status line
    if (S.guardOnly) return value
    await publish(host, after)
    checkHealth(host, after)
    return value
  })
}

/** Runs fn while holding the board lock, one at a time within this session too. */
export function locked<T>(host: Host, fn: () => Promise<T>): Promise<T> {
  const run = S.writing.then(async () => {
    const mine = await takeLock(host)
    try {
      return await fn()
    } finally {
      await dropLock(host, mine)
    }
  })
  S.writing = run.catch(() => undefined)
  return run
}
