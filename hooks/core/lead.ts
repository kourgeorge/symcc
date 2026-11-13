// Who drives the board, and which session owns a running task.
import { namesFor } from '../name'
import type { Board, BoardTask } from './board-file'
import { parseStamp } from './text'
import { stoppedLine } from './history'

// ---------------- who drives the board ----------------
// Several sessions may have the same project open. Only one of them, the driver, starts
// workers, merges, runs scouts and the regular check. It writes .<name>/lead.json and
// refreshes the heartbeat in it; the others only read and change the board.

export const LEAD_FILE = namesFor().leadFile
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

/**
 * At session start the driver sends "doing" tasks whose worker is gone back to "todo":
 * those of this session, of a dead session, or with no session recorded. `leadBefore`
 * is lead.json as it was before this session wrote its own heartbeat. Tasks in `keep`
 * (an old worker of theirs is still alive) stay "doing" until that worker has ended.
 */
export function resetDoing(b: Board, me: string, leadBefore: string | null, nowMs: number, note: string, now: string, keep: string[] = []): Board {
  const live = liveDriver(leadBefore, nowMs)
  return {
    ...b,
    tasks: b.tasks.map(t => {
      if (t.status !== 'doing' || !ownedHere(t, me, live) || keep.includes(t.id)) return t
      return backToTodo(t, note, now)
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
  const { session: _gone, ...rest } = t
  return { ...rest, status: 'todo' as const, note, updated_at: now, ...(t.status === 'doing' ? { history: [...(t.history ?? []), stoppedLine(t, note)] } : {}) }
}
