// Who drives the board, and which session owns a running task.
import { type Board, type BoardTask, isSha, intoOf } from './board-file'
import { parseStamp } from './text'
import { stoppedLine, stopEnd } from './history'
import { tryLabel } from './roles'
import { endedBy, withEnd } from './runs'

// ---------------- who drives the board ----------------
// Several sessions may have the same project open. Only one of them, the driver, starts
// workers, merges, runs scouts and the regular check. It writes .<name>/lead.json and
// refreshes the heartbeat in it; the others only read and change the board.

/** how often the driver refreshes its heartbeat (and the others look at it) */
export const LEAD_BEAT_MS = 30_000
/** a heartbeat older than this means the driver is gone, and another session may take over */
export const LEAD_STALE_MS = 3 * 60_000

export type Lead = { session: string; heartbeat: number }

export const leadText = (session: string, heartbeat: number) => JSON.stringify({ session, heartbeat }) + '\n'

export function parseLead(text: string | null): Lead | null {
  return parseStamp(text, 'heartbeat', false)
}

/** Whether a heartbeat is no more than `staleMs` old (and not dated more than that in the future, a broken clock). */
export function isFresh(heartbeat: number, nowMs: number, staleMs = LEAD_STALE_MS): boolean {
  return nowMs - heartbeat <= staleMs && heartbeat - nowMs <= staleMs
}

/**
 * Who should drive, as seen by session `me` reading lead.json (`text`) at `nowMs`:
 * - 'become': nobody drives (no file, or one we can't read); `me` starts driving.
 * - 'keep': `me` already drives; refresh the heartbeat.
 * - 'follow': another session drives and its heartbeat is fresh.
 * - 'takeover': another session's heartbeat is stale (or dated far in the future, a
 *   broken clock); `me` takes over and first stops what the old driver left running.
 */
export type LeadMove = 'become' | 'keep' | 'follow' | 'takeover'

export function whoDrives(text: string | null, me: string, nowMs: number, staleMs = LEAD_STALE_MS): LeadMove {
  const l = parseLead(text)
  if (!l) return 'become'
  if (l.session === me) return 'keep'
  return isFresh(l.heartbeat, nowMs, staleMs) ? 'follow' : 'takeover'
}

// ---------------- which session owns a running task ----------------

/** The session that drives the board now, by lead.json `text` at `nowMs`; null if nobody does (or its heartbeat is stale). */
export function liveDriver(text: string | null, nowMs: number, staleMs = LEAD_STALE_MS): string | null {
  const l = parseLead(text)
  if (!l) return null
  return isFresh(l.heartbeat, nowMs, staleMs) ? l.session : null
}

/**
 * Whether session `me` may take over a task's worker: the task names no session (an old
 * board), names `me`, or names a session that no longer drives the board (`live`).
 * A task owned by the live driver, another session, is never touched.
 */
export function ownedHere(t: BoardTask, me: string, live: string | null): boolean {
  return !t.session || t.session === me || t.session !== live
}

// ---------------- a task whose work is being tested and merged ----------------
// After a worker finishes, its task stays "doing" while the tests and the merge run. That copy of
// the plugin marks the task (BoardTask.finishing) and refreshes the mark every FINISH_BEAT_MS, so a
// reloaded copy (whose own memory is empty) sees the merge is still going and leaves the task alone.
// A mark not refreshed for FINISH_STALE_MS means that copy is gone: the task is then recovered.

/** how often a finishing task's mark is refreshed */
export const FINISH_BEAT_MS = 30_000
/** a finishing mark older than this was left by a copy of the plugin that is gone */
export const FINISH_STALE_MS = 3 * 60_000
/**
 * The longest a finished task's checking and merging may take in a live copy of the plugin (the
 * 10-minute test run plus some minutes for git and the board). A step still running then is taken
 * as stuck: its task goes back to "todo" (or is done, when its work already reached its branch).
 */
export const FINISH_LIMIT_MS = 15 * 60_000

/** Whether task `t`'s work is being tested and merged right now by some copy of the plugin (its mark is fresh). */
export function finishingNow(t: Pick<BoardTask, 'status' | 'finishing'>, nowMs: number, staleMs = FINISH_STALE_MS): boolean {
  if (t.status !== 'doing' || typeof t.finishing !== 'string') return false
  const at = Date.parse(t.finishing)
  return Number.isFinite(at) && isFresh(at, nowMs, staleMs)
}

/** Whether task `t` has a finishing mark that is no longer refreshed (the copy that merged it is gone). */
export const finishingStale = (t: Pick<BoardTask, 'status' | 'finishing'>, nowMs: number, staleMs = FINISH_STALE_MS) => t.status === 'doing' && !!t.finishing && !finishingNow(t, nowMs, staleMs)

/** The commit task `t`'s current try merged, as the board recorded it; null when this try merged nothing (yet). */
export function mergedThisTry(t: Pick<BoardTask, 'merged' | 'runs'>): string | null {
  const last = t.runs?.[t.runs.length - 1]
  return isSha(t.merged) && !!last?.commits?.includes(t.merged) ? t.merged : null
}

/** The history line of a task found already merged (`sha`) when it was about to be `when` (e.g. "sent back to todo"). */
export const alreadyMergedLine = (t: Pick<BoardTask, 'role' | 'attempts' | 'merge_into'>, sha: string, when: string) =>
  `${tryLabel(t)}: its work was already merged into ${intoOf(t)} (${sha.slice(0, 8)}) when it was about to be ${when}, so it is done`

/**
 * Task `t` as "done", because its work is already on the branch it merges into (`sha`): it must
 * not be tried again or failed. Its last try ends as finished, merged.
 */
export function mergedDone(t: BoardTask, sha: string, when: string, now: string): BoardTask {
  const { session: _s, finishing: _f, test_output: _o, ...rest } = t
  const runs = t.status === 'doing' ? endedBy(t, now, 'finished', 'merged').runs : t.runs?.length ? withEnd(t.runs, 'finished', 'merged', true) : undefined
  return { ...rest, status: 'done' as const, note: `merged into ${intoOf(t)} (${sha.slice(0, 8)})`, merged: sha, merge_main: false, updated_at: now, history: [...(t.history ?? []), alreadyMergedLine(t, sha, when)], ...(runs ? { runs } : {}) }
}

/**
 * At session start the driver sends "doing" tasks whose worker is gone back to "todo":
 * those of this session, of a dead session, or with no session recorded. `leadBefore`
 * is lead.json as it was before this session wrote its own heartbeat. Tasks in `keep`
 * (an old worker of theirs is still alive) stay "doing" until that worker has ended, and so
 * do tasks whose work is being tested and merged right now (see finishingNow). A task whose
 * try already merged (see mergedThisTry) is done instead.
 */
export function resetDoing(b: Board, me: string, leadBefore: string | null, nowMs: number, note: string, now: string, keep: string[] = []): Board {
  const live = liveDriver(leadBefore, nowMs)
  return {
    ...b,
    tasks: b.tasks.map(t => {
      if (t.status !== 'doing' || !ownedHere(t, me, live) || keep.includes(t.id) || finishingNow(t, nowMs)) return t
      const sha = mergedThisTry(t)
      return sha ? mergedDone(t, sha, 'sent back to todo', now) : backToTodo(t, note, now)
    }),
  }
}

/**
 * After /clear the same process goes on under a new session id: its "doing" tasks move
 * from `oldId` to `newId`, so they are not taken for a dead session's tasks.
 */
export function relabelSession(b: Board, oldId: string, newId: string): Board {
  if (!oldId || !newId || oldId === newId) return b
  return {
    ...b,
    tasks: b.tasks.map(t => (t.status === 'doing' && t.session === oldId ? { ...t, session: newId } : t)),
  }
}

/** Task `t` back to "todo" with `note`, no longer tied to a session; a running one gets a history line saying why (the next try starts for that reason). */
export function backToTodo(t: BoardTask, note: string, now: string): BoardTask {
  const { session: _gone, finishing: _f, ...rest } = t
  return { ...rest, status: 'todo' as const, note, updated_at: now, ...(t.status === 'doing' ? { history: [...(t.history ?? []), stoppedLine(t, note)], ...endedBy(t, now, ...stopEnd(note)) } : {}) }
}
