import { type Board, parseBoard, readBoard, brokenBoardText, emptyBoard, symccOn, lockText, isLockStale, tmpName } from '../board'
import { checkHealth } from './health'
import { publish } from './lead'
import { tellLead } from './tell'
import { S } from './state'
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
 * Sets S.root from the session (its git repo, else its folder) when it is not set yet, as session.start does.
 * A hook that runs before session.start (a plugin reload starts the module over) uses this; true once the root is known.
 */
export async function findRoot(host: Host): Promise<boolean> {
  if (S.root) return true
  const repo = await host.session.repo().catch(() => null)
  const root = repo?.root || (await host.session.root().catch(() => '')) || ''
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
  const copy = `${S.N.boardFile}.${what}-${now().replace(/[:.]/g, '-')}`
  const ok = await host.fs.write(path(copy), text).then(() => true, () => false)
  const name = ok ? copy : ''
  reported.set(text, name)
  const msg = say(name)
  host.ui.toast(S.N.toast(msg))
  tellLead(host, msg)
  return name
}

/** board.json's mtime (ms) now, or null when it is missing or can't be looked at. Never throws. */
export async function boardMtime(host: Host): Promise<number | null> {
  const st = await host.fs.stat(path(S.N.boardFile)).catch(() => null)
  return st ? st.mtimeMs : null
}

/** Notes board.json's mtime as seen by this session (after its own load or save), so it causes no extra redraw (T-429). */
async function noteMtime(host: Host) {
  S.boardMtime = await boardMtime(host).catch(() => null)
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
    await keepCopy(host, text, 'before-fix', c => `${S.N.boardFile}: ${r.skipped ? `skipped ${r.skipped} task entr${r.skipped > 1 ? 'ies' : 'y'} that ${r.skipped > 1 ? 'are' : 'is'} not a task` : ''}${r.skipped && r.fixed.length ? '; ' : ''}${r.fixed.length ? `bad value${r.fixed.length > 1 ? 's' : ''} for ${r.fixed.join(', ')} set to the default` : ''}${c ? `. The file as it was is kept in ${c}` : ''}.`)
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
  await noteMtime(host)
}

/**
 * Every change goes through here, one at a time, so two workers finishing together
 * never lose an update; the lock file does the same between sessions.
 */
export function change<T>(host: Host, fn: (b: Board) => [Board, T] | Board): Promise<T> {
  return locked(host, async () => {
    const before = await load(host)
    const out = fn(before)
    const [after, value] = Array.isArray(out) ? out : [out, undefined as T]
    await saveBoard(host, after)
    return [after, value] as const
  }).then(async ([after, value]) => {
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
