import type { SymccTask } from '../../types'
import type { Host } from '../host'
import { MERGE_LINE_FILE, type LineEntry, parseMergeLine, mergeLineText, mergeLineStaleMs, lineEntryStale, testMinutesOf, find, checkStepNow, inLineNote, patchTask } from '../board'
import { S } from './state'
import { change, load, locked, now, path, safeWrite } from './store'

// ---------------- the merge line: one task's merge turn at a time, project-wide (T-546) ----------------

/** How often a task whose line has another session's task in front looks again. */
export const MERGE_LINE_POLL_MS = 2_000

/** How old this copy's entries may get before a waiting task dates them again (well under MERGE_LINE_STALE_MS). */
const REDATE_MS = 60_000

/** One go of a task in the line, from this copy of the plugin. */
type Mine = { entry: LineEntry; gone: boolean }

/** This copy's entries in the line, in the order they joined (the place in line comes from the file's order, see place). */
const local: Mine[] = []
let count = 0

/**
 * The keys of this copy's entries that left the line. Their removal from the file waits for the board lock, so for a
 * moment the file may still have them: they are skipped when the line is read, or the next task of this copy would
 * take such an entry as another session's task in front of it (and wait for nothing).
 */
const departed = new Set<string>()

/** Settles when one of this copy's entries leaves the line, so the ones behind it look again at once (no polling between tasks of one copy). */
let wake: () => void = () => {}
let woken = new Promise<void>(r => (wake = r))
function signal() {
  const w = wake
  woken = new Promise<void>(r => (wake = r))
  w()
}

/** Forgets this copy's entries (what a reload starts with); for the tests' resetPlugin() only. The file stays, as it does over a reload. */
export function resetMergeLine() {
  local.length = 0
  departed.clear()
  signal()
}

const lineFile = () => path(`${S.N.dir}/${MERGE_LINE_FILE}`)

/** The line as the file has it; empty when there is no file or it can't be read. */
async function readFile($: Host): Promise<LineEntry[]> {
  try {
    return parseMergeLine(await $.fs.read(lineFile()).catch(() => null))
  } catch {
    return []
  }
}

/** The line as the file has it, less this copy's entries that already left (departed); empty when there is no file or it can't be read. */
export async function readMergeLine($: Host): Promise<LineEntry[]> {
  return (await readFile($)).filter(e => !departed.has(e.key))
}

/** Changes the line file under the board lock (so two sessions never lose each other's change); an empty line removes the file. Never throws: null when it could not be done. */
async function editLine($: Host, fn: (line: LineEntry[]) => LineEntry[]): Promise<LineEntry[] | null> {
  try {
    return await locked($, async () => {
      const before = await readFile($)
      const after = fn(before.filter(e => !departed.has(e.key)))
      if (after.length === before.length && after.every((e, i) => e === before[i])) return after
      if (after.length) await safeWrite($, lineFile(), mergeLineText(after), 'the merge line')
      else await $.run(['rm', '-f', lineFile()])
      return after
    })
  } catch {
    return null
  }
}

const liveKeys = () => new Set(local.filter(m => !m.gone).map(m => m.entry.key))

/**
 * The keys of the entries in `others` (not this copy's) that are stale: dated longer ago than mergeLineStaleMs (from the
 * board's test_minutes, or the task's own more time), or their task is no longer being checked by any copy of the plugin
 * (gone from the board, or its check mark is no longer refreshed: its check ended or was given up, or its session died),
 * or their task is one this copy checks now (an earlier go of it, say one cut short by a reload). A board that can't be read: only the age counts.
 */
async function staleOf($: Host, others: readonly LineEntry[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!others.length) return out
  const b = await load($).catch(() => null)
  const mineNow = new Set(local.filter(m => !m.gone).map(m => m.entry.task))
  const at = Date.now()
  for (const e of others) {
    const cur = b ? find(b, e.task) : undefined
    if (mineNow.has(e.task) || lineEntryStale(e, at, mergeLineStaleMs(testMinutesOf(b ?? {})))) out.add(e.key)
    else if (b && (!cur || !checkStepNow(cur, at))) out.add(e.key)
  }
  return out
}

/** Task `task` joins the back of the line. Its place among this copy's tasks is taken at once (before any wait), so calls in a row keep their order. */
function join($: Host, task: string): { me: Mine; joined: Promise<unknown> } {
  const entry: LineEntry = { task, key: `${S.me || 'unknown'}:${++count}:${Math.random().toString(36).slice(2, 8)}`, session: S.me || 'unknown', joined: now(), at: Date.now() }
  const me: Mine = { entry, gone: false }
  local.push(me)
  // an entry of the same task not of a go running now is an earlier go's (a task that was in line before a reload joins again)
  const joined = editLine($, line => {
    const keys = liveKeys()
    const kept = line.filter(e => e.task !== task || keys.has(e.key))
    // let go (`release`) before its place was written: it stays out
    return me.gone ? kept : [...kept, entry]
  })
  return { me, joined }
}

/** Takes go `me` out of the line (once; later calls do nothing), so the next one has its turn. */
async function leave($: Host, me: Mine) {
  if (me.gone) return
  me.gone = true
  departed.add(me.entry.key)
  const at = local.indexOf(me)
  if (at >= 0) local.splice(at, 1)
  signal()
  if (await editLine($, line => line.filter(e => e.key !== me.entry.key))) departed.delete(me.entry.key)
}

/** Dates this copy's entries again, so no other session takes them as stale while a long turn (or wait) goes on. */
async function redate($: Host) {
  const at = Date.now()
  const keys = liveKeys()
  for (const m of local) m.entry = { ...m.entry, at }
  await editLine($, line => line.map(e => (keys.has(e.key) ? { ...e, at } : e)))
}

/**
 * How many tasks are in front of go `me`, taken from the file's order alone (so every session sees the same order and
 * no two tasks wait for each other), and how many of those are other sessions' tasks. Stale entries of others are taken
 * out of the file on the way; an entry of ours that is no longer in the file (taken out by another session, or the file
 * was removed) joins again at the back. When the file can't be written, this copy's missing entries count as at the
 * back in the order they joined, so its own tasks still keep one order among them.
 */
async function place($: Host, me: Mine): Promise<{ ahead: number; others: number }> {
  const keys = liveKeys()
  let line = await readMergeLine($)
  const stale = await staleOf($, line.filter(e => !keys.has(e.key)))
  if (stale.size) line = (await editLine($, l => l.filter(e => !stale.has(e.key)))) ?? line.filter(e => !stale.has(e.key))
  if (!line.some(e => e.key === me.entry.key)) {
    const missing = (l: LineEntry[]) => local.filter(m => !m.gone && !l.some(e => e.key === m.entry.key)).map(m => m.entry)
    line = (await editLine($, l => (l.some(e => e.key === me.entry.key) ? l : [...l, me.entry]))) ?? line
    if (!line.some(e => e.key === me.entry.key)) line = [...line, ...missing(line)]
  }
  const at = Math.max(0, line.findIndex(e => e.key === me.entry.key))
  const ahead = line.slice(0, at)
  return { ahead: ahead.length, others: ahead.filter(e => !keys.has(e.key)).length }
}

/** Sets task `t`'s note to what `note` makes of it, while the task is still as it was. Never throws. */
async function noteTask($: Host, t: Pick<SymccTask, 'id' | 'status' | 'attempts'>, note: (now: string | undefined) => string | undefined) {
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts) return x
    const next = note(cur.note)
    return next === cur.note ? x : patchTask(x, t.id, { note: next }, now())
  }).catch(() => undefined)
}

export type LineOptions<T> = {
  /** the task as its check began: while it waits, its note says its place ("in line (n)", see inLineNote) */
  t?: Pick<SymccTask, 'id' | 'status' | 'attempts'>
  /** asked before each look: when it gives a value (the task was dropped, paused or given up), the task leaves the line and that value is returned, `run` never runs */
  stopped?: () => T | undefined
  /** settles when the caller gave this go up as stuck: it leaves the line then, even if `run` is still going, so the ones behind it go on */
  release?: Promise<unknown>
  /** the caller's time limit: `turn(false)` once this go has to wait (or `again` is set), `turn(true)` when its turn begins */
  turn?: (go: boolean) => void
  /** a later go of the same check (its branch moved under it): its time limit starts again from zero */
  again?: boolean
}

/**
 * Runs `run` (task `task`'s turn: catch up with its target branch, test, move the branch) once it is at the front of
 * the project-wide merge line (MERGE_LINE_FILE), so only one task merges at a time, across tasks, target branches
 * and sessions, oldest first. `run` gets `refresh`, which dates this copy's entries again (call it before each long
 * step, say each test command). The task leaves the line however `run` ends. See LineOptions for the rest.
 */
export async function inMergeLine<T>($: Host, task: string, run: (refresh: () => Promise<void>) => Promise<T>, o: LineOptions<T> = {}): Promise<T> {
  const { me, joined } = join($, task)
  void o.release?.then(() => leave($, me), () => leave($, me))
  let off = false
  let shown = 0
  let before: string | undefined
  try {
    await joined
    if (o.again) {
      o.turn?.(false)
      off = true
    }
    // a go given up as stuck (`release`) is out of the line: the ones behind it no longer wait, and it waits for no one
    while (!me.gone) {
      const s = o.stopped?.()
      if (s !== undefined) {
        await leave($, me)
        return s
      }
      const next = woken
      const { ahead, others } = await place($, me)
      if (ahead === 0) break
      if (!off) {
        o.turn?.(false)
        off = true
      }
      const n = ahead + 1
      if (o.t && n !== shown) {
        const first = !shown
        shown = n
        await noteTask($, o.t, note => {
          if (first) before = note
          return inLineNote(n)
        })
      }
      if (Date.now() - me.entry.at > REDATE_MS) await redate($)
      // another session's task is in front: look again in a while; else one of ours is, and its leaving wakes this one
      if (others) await $.clock.sleep(MERGE_LINE_POLL_MS)
      else await next
    }
  } catch (e) {
    await leave($, me)
    throw e
  } finally {
    // the waiting note goes back to what it was, unless something else changed it meanwhile
    if (o.t && shown) await noteTask($, o.t, note => (note === inLineNote(shown) ? before : note))
  }
  if (off) o.turn?.(true)
  try {
    return await run(() => redate($))
  } finally {
    await leave($, me)
  }
}
