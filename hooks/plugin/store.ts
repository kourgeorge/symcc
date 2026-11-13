import { type Board, parseBoard, readBoard, brokenBoardText, emptyBoard, symccOn, lockText, isLockStale } from '../board'
import { firstBranch } from './git'
import { checkHealth } from './health'
import { publish } from './lead'
import { tellLead } from './tell'
import { S, type $ } from './state'

// ---------------- the board on disk ----------------

export const now = () => new Date().toISOString()
export const path = (rel: string) => `${S.root}/${rel}`

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
  // A new board starts on the branch the owner has checked out (existing boards keep theirs).
  if (!exists) {
    const b = emptyBoard(await firstBranch($))
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
 * Take .<name>/board.lock so no other session reads or writes the board meanwhile.
 * The lock is written to its own temp file first and then hard-linked into place:
 * `ln` fails if the lock exists, so only one session can win, and nobody ever sees
 * a half-written lock. A stale lock (its session died) is removed and taken over.
 */
export async function takeLock($: $): Promise<string> {
  const lock = path(S.N.lockFile)
  const me = `${await $.session.id().catch(() => 'unknown')}:${Math.random().toString(36).slice(2, 10)}`
  const mine = lockText(me, Date.now())
  const tmp = `${lock}.${me.replace(/[^\w.-]/g, '_')}.tmp`
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
  const file = path(S.N.boardFile)
  const tmp = `${file}.tmp`
  await $.fs.write(tmp, JSON.stringify(b, null, 2) + '\n')
  // $.fs has no rename; mv within one folder is an atomic rename
  const r = await $.process.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) throw new Error(`couldn't save the board: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
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
