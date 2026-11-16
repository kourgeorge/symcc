import { type Board, parseBoard, readBoard, brokenBoardText, emptyBoard, symccOn, lockText, isLockStale, tmpName } from '../board'
import { checkHealth } from './health'
import { publish } from './lead'
import { tellLead } from './tell'
import { S, type $ } from './state'

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
export async function findRoot($: $): Promise<boolean> {
  if (S.root) return true
  const repo = await $.session.repo().catch(() => null)
  const root = repo?.root || (await $.session.root().catch(() => '')) || ''
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
export async function safeWrite($: $, file: string, text: string, what: string): Promise<void> {
  const tmp = tmpFor(file)
  let r: { exitCode: number; stdout: string; stderr: string }
  try {
    await $.fs.write(tmp, text)
    // $.fs has no rename; mv within one folder is an atomic rename
    r = await $.process.run(['mv', '-f', tmp, file])
  } catch (e) {
    await $.process.run(['rm', '-f', tmp]).catch(() => undefined)
    throw e
  }
  if (r.exitCode === 0) return
  await $.process.run(['rm', '-f', tmp]).catch(() => undefined)
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

/**
 * Keep a copy of board.json's text beside it (board.json.<what>-<time>) and tell the owner
 * (a toast) and the lead, once per distinct text. Returns the copy's name ('' if it couldn't be written).
 */
async function keepCopy($: $, text: string, what: string, say: (copy: string) => string): Promise<string> {
  const known = reported.get(text)
  if (known !== undefined) return known
  const copy = `${S.N.boardFile}.${what}-${now().replace(/[:.]/g, '-')}`
  const ok = await $.fs.write(path(copy), text).then(() => true, () => false)
  const name = ok ? copy : ''
  reported.set(text, name)
  const msg = say(name)
  $.ui.toast(S.N.toast(msg))
  tellLead($, msg)
  return name
}

export async function load($: $): Promise<Board> {
  const exists = await $.fs.exists(path(S.N.boardFile))
  if (!exists) {
    const b = emptyBoard()
    S.enabledNow = symccOn(b)
    return b
  }
  const text = await $.fs.read(path(S.N.boardFile))
  const r = readBoard(text)
  if (r.broken) {
    // Never go on with a stand-in board: it would be saved over the file and lose every task.
    // Throwing here refuses every change, start and merge until the file is fixed; workers already running are left alone.
    const copy = await keepCopy($, text, 'broken', c => brokenBoardText(S.N.boardFile, r.broken!, c || undefined))
    throw new Error(brokenBoardText(S.N.boardFile, r.broken, copy || undefined))
  }
  if (r.skipped || r.fixed.length)
    await keepCopy($, text, 'before-fix', c => `${S.N.boardFile}: ${r.skipped ? `skipped ${r.skipped} task entr${r.skipped > 1 ? 'ies' : 'y'} that ${r.skipped > 1 ? 'are' : 'is'} not a task` : ''}${r.skipped && r.fixed.length ? '; ' : ''}${r.fixed.length ? `bad value${r.fixed.length > 1 ? 's' : ''} for ${r.fixed.join(', ')} set to the default` : ''}${c ? `. The file as it was is kept in ${c}` : ''}.`)
  S.enabledNow = symccOn(r.board)
  return r.board
}

/**
 * Saves board.json once in the current shape when reading it brought old tasks up to date (see
 * migrateTask), keeping a copy of the file as it was. Nothing happens for a board already current.
 */
export async function saveMigrated($: $): Promise<void> {
  const text = await $.fs.read(path(S.N.boardFile)).catch(() => null)
  if (typeof text !== 'string') return
  const r = readBoard(text)
  if (r.broken || !r.migrated) return
  await keepCopy($, text, 'before-migrate', c => `${S.N.boardFile}: ${r.migrated} older entr${r.migrated > 1 ? 'ies' : 'y'} (tasks or archived totals) ${r.migrated > 1 ? 'were' : 'was'} brought to the current shape${c ? `. The file as it was is kept in ${c}` : ''}.`)
  await change($, b => b)
}

/** Is the plugin on for this project? Read from the board file each time (a missing or broken board: on). Never throws. */
export async function isOn($: $): Promise<boolean> {
  const text = await $.fs.read(path(S.N.boardFile)).catch(() => null)
  return (S.enabledNow = symccOn(parseBoard(typeof text === 'string' ? text : null)))
}

/**
 * session.start sets `mark` while it runs claimLead: a clock wait in claimLead's path (the board
 * lock, old workers ending, the reload settle) calls it first, so session.start can go on
 * without waiting (see register.tsx). Called from other hooks meanwhile it does no harm.
 */
export const startWait: { mark: (() => void) | null } = { mark: null }
export const aboutToWait = () => startWait.mark?.()

/**
 * Take .<name>/board.lock so no other session reads or writes the board meanwhile.
 * The lock is written to its own temp file first and then hard-linked into place:
 * `ln` fails if the lock exists, so only one session can win, and nobody ever sees
 * a half-written lock. A stale lock (its session died) is removed and taken over.
 */
export async function takeLock($: $): Promise<string> {
  const lock = path(S.N.lockFile)
  const me = `${await $.session.id().catch(() => 'unknown')}:${Math.random().toString(36).slice(2, 10)}`
  const mine = lockText(me, Date.now())
  const tmp = tmpFor(lock)
  await $.fs.write(tmp, mine)
  try {
    const until = Date.now() + 5_000
    for (;;) {
      if ((await $.process.run(['ln', tmp, lock])).exitCode === 0) return mine
      const held = await $.fs.read(lock).catch(() => null)
      const st = await $.fs.stat(lock).catch(() => null)
      if (held !== null && isLockStale(held, Date.now(), st?.mtimeMs)) {
        // remove it only if it is still the same stale lock we just read
        if ((await $.fs.read(lock).catch(() => null)) === held) await $.process.run(['rm', '-f', lock])
        continue
      }
      if (Date.now() > until) throw new Error(`the board is busy (another session holds ${S.N.lockFile}); try again`)
      aboutToWait()
      await $.clock.sleep(100)
    }
  } finally {
    await $.process.run(['rm', '-f', tmp]).catch(() => undefined)
  }
}

export async function dropLock($: $, mine: string) {
  const lock = path(S.N.lockFile)
  if ((await $.fs.read(lock).catch(() => null)) === mine) await $.process.run(['rm', '-f', lock]).catch(() => undefined)
}

/** Write to a temp file, then rename it over board.json, so a crash mid-write never leaves a broken board. */
export async function saveBoard($: $, b: Board) {
  await safeWrite($, path(S.N.boardFile), JSON.stringify(b, null, 2) + '\n', 'the board')
}

/**
 * Every change goes through here, one at a time, so two workers finishing together
 * never lose an update; the lock file does the same between sessions.
 */
export function change<T>($: $, fn: (b: Board) => [Board, T] | Board): Promise<T> {
  return locked($, async () => {
    const before = await load($)
    const out = fn(before)
    const [after, value] = Array.isArray(out) ? out : [out, undefined as T]
    await saveBoard($, after)
    return [after, value] as const
  }).then(async ([after, value]) => {
    await publish($, after)
    checkHealth($, after)
    return value
  })
}

/** Runs fn while holding the board lock, one at a time within this session too. */
export function locked<T>($: $, fn: () => Promise<T>): Promise<T> {
  const run = S.writing.then(async () => {
    const mine = await takeLock($)
    try {
      return await fn()
    } finally {
      await dropLock($, mine)
    }
  })
  S.writing = run.catch(() => undefined)
  return run
}
