// Who drives the board, and which session owns a running task.
import { type Board, type BoardTask, type CheckStep, CHECKED_STATUSES, isSha, intoOf, DEFAULT_TEST_MINUTES, testMinutesOf } from './board-file'
import { parseStamp } from './text'
import { stoppedEntry, stopEnd, withHistory } from './history'
import { addCommits, shortSha } from './commits'
import { tryLabel } from './roles'
import { endedBy, withEnd } from './runs'
import { taskPhase } from './phase'

// ---------------- who drives the board ----------------
// Several sessions may have the same project open. Only one of them, the driver, starts
// workers, merges, runs scouts and the regular check. It writes .<name>/lead.json and
// refreshes the heartbeat in it; the others only read and change the board.

/** how often the driver refreshes its heartbeat (and the others look at it) */
export const LEAD_BEAT_MS = 30_000
/** a heartbeat older than this means the driver is gone, and another session may take over */
export const LEAD_STALE_MS = 3 * 60_000

/**
 * lead.json: the driving `session` and its `heartbeat`. A hand-over the owner asked for (/<name>-drive, T-430) adds
 * `handTo` (the session that asked to drive) and `handAt` (when it asked); the old driver answers on its next
 * heartbeat by writing lead.json for `handTo` with `handFrom` (itself), and the new session then claims it.
 */
export type Lead = { session: string; heartbeat: number; handTo?: string; handAt?: number; handFrom?: string }
type HandFields = Pick<Lead, 'handTo' | 'handAt' | 'handFrom'>

export const leadText = (session: string, heartbeat: number, hand: HandFields = {}) => JSON.stringify({ session, heartbeat, ...hand }) + '\n'

export function parseLead(text: string | null): Lead | null {
  const l = parseStamp(text, 'heartbeat', false)
  if (!l) return null
  const raw = JSON.parse(text!) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const handTo = str(raw.handTo)
  const handFrom = str(raw.handFrom)
  const handAt = typeof raw.handAt === 'number' && Number.isFinite(raw.handAt) ? raw.handAt : undefined
  return { ...l, ...(handTo ? { handTo, ...(handAt !== undefined ? { handAt } : {}) } : {}), ...(handFrom ? { handFrom } : {}) }
}

/** Whether a heartbeat is no more than `staleMs` old (and not dated more than that in the future, a broken clock). */
export function isFresh(heartbeat: number, nowMs: number, staleMs = LEAD_STALE_MS): boolean {
  return nowMs - heartbeat <= staleMs && heartbeat - nowMs <= staleMs
}

/**
 * Who should drive, as seen by session `me` reading lead.json (`text`) at `nowMs`:
 * - 'become': nobody drives (no file, or one we can't read); `me` starts driving.
 * - 'keep': `me` already drives; refresh the heartbeat.
 * - 'follow': another session drives and its heartbeat is fresh (also while `me` waits for a hand-over it asked for).
 * - 'takeover': another session's heartbeat is stale (or dated far in the future, a
 *   broken clock), or it didn't answer `me`'s hand-over request within `staleMs`; `me` takes over and first stops
 *   what the old driver left running.
 * - 'handover': `me` drives and another session asked for it (/<name>-drive): `me` stops its workers, writes
 *   lead.json for that session and steps down.
 * - 'claim': the old driver handed the board to `me` (lead.json names `me`, with `handFrom`): `me` drives now and
 *   restarts the tasks the old driver stopped.
 */
export type LeadMove = 'become' | 'keep' | 'follow' | 'takeover' | 'handover' | 'claim'

export function whoDrives(text: string | null, me: string, nowMs: number, staleMs = LEAD_STALE_MS): LeadMove {
  const l = parseLead(text)
  if (!l) return 'become'
  if (l.session === me) return l.handTo && l.handTo !== me ? 'handover' : l.handFrom && l.handFrom !== me ? 'claim' : 'keep'
  if (!isFresh(l.heartbeat, nowMs, staleMs)) return 'takeover'
  // asked for the board and the driver let the stale time pass without answering: the normal stale takeover
  if (l.handTo === me && l.handAt !== undefined && !isFresh(l.handAt, nowMs, staleMs)) return 'takeover'
  return 'follow'
}

/** The moves of whoDrives in which the session drives the board after its heartbeat (all but 'follow' and 'handover'). */
export const drivesAfter = (m: LeadMove): boolean => m !== 'follow' && m !== 'handover'

/**
 * What /<name>-drive does in session `me`, by lead.json `text` at `nowMs`:
 * - 'already': `me` drives; nothing changes.
 * - 'cancel': `me` drives but another session asked to take it: that request is dropped, `me` keeps driving.
 * - 'now': nobody drives, the driver is gone (stale), or it already handed the board to `me`: `me` drives at once.
 * - 'ask': another session drives with a fresh heartbeat: `me` writes a hand-over request (see handRequest).
 * - 'asked': `me` already asked that session and waits for it.
 */
export type DriveAsk = 'already' | 'cancel' | 'now' | 'ask' | 'asked'

export function driveAsk(text: string | null, me: string, nowMs: number, staleMs = LEAD_STALE_MS): DriveAsk {
  const m = whoDrives(text, me, nowMs, staleMs)
  if (m === 'keep') return 'already'
  if (m === 'handover') return 'cancel'
  // 'claim': the old driver already handed over and this session's heartbeat hasn't claimed yet: claim right away
  if (m === 'become' || m === 'takeover' || m === 'claim') return 'now'
  return parseLead(text)?.handTo === me ? 'asked' : 'ask'
}

/** lead.json `text` with session `me`'s hand-over request added (the driver and its heartbeat unchanged; an earlier request of `me` keeps its time). */
export function handRequest(text: string | null, me: string, nowMs: number): string {
  const l = parseLead(text)
  if (!l) return leadText(me, nowMs)
  const at = l.handTo === me && l.handAt !== undefined ? l.handAt : nowMs
  return leadText(l.session, l.heartbeat, { handTo: me, handAt: at })
}

/** lead.json `text` with any hand-over request dropped (the driver and its heartbeat unchanged). */
export function noHandRequest(text: string | null): string | null {
  const l = parseLead(text)
  return l ? leadText(l.session, l.heartbeat) : text
}

/** lead.json written by driver `from` when it hands the board to `to` (see whoDrives 'claim'). */
export const handedText = (to: string, from: string, nowMs: number) => leadText(to, nowMs, { handFrom: from })

/** The "restarted" line of a task whose worker was stopped because the owner moved driving to another session. */
export const HANDOVER_NOTE = 'restarted: the owner moved driving to another session'

/**
 * Task `t` after its worker was stopped by a hand-over the owner asked for (/<name>-drive): back to "todo" with
 * HANDOVER_NOTE and a history line saying so, but its try is not counted (attempts back one, the try's open run
 * taken off, as T-428 does for a queued start), so the next worker goes on from the same folder and branch on the
 * same try number. A task that is not "doing" is left as it is.
 */
export function handedOff(t: BoardTask, now: string): BoardTask {
  if (t.status !== 'doing') return t
  const { session: _s, finishing: _f, checking: _c, runs: _r, ...rest } = t
  const last = t.runs?.at(-1)
  const runs = last && !last.ended ? t.runs!.slice(0, -1) : t.runs
  return { ...rest, status: 'todo' as const, note: HANDOVER_NOTE, attempts: Math.max(0, t.attempts - 1), updated_at: now, history: withHistory(t.history, now, stoppedEntry(t, HANDOVER_NOTE)), ...(runs?.length ? { runs } : {}) }
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
/** the longest one test command may run before it is stopped, with the default test_minutes (see testTimeoutMs) */
export const TEST_TIMEOUT_MS = DEFAULT_TEST_MINUTES * 60_000
/** The longest one test command on board `b` may run, in ms (its test_minutes). */
export const testTimeoutMs = (b: { test_minutes?: unknown }): number => testMinutesOf(b) * 60_000
/** the time a checking and merging step gets for git and the board, on top of its test commands */
export const FINISH_GIT_MS = 5 * 60_000

/**
 * The one time limit of a task's merge turn (catch-up, tests and merge) in a live copy of the plugin: each
 * of its `tests` test commands may run `testMinutes` (the board's test_minutes, see testMinutesOf; counted at least once), plus FINISH_GIT_MS
 * for git and the board. It counts only from the start of the turn (waiting in the merge line doesn't count). A turn
 * still running then is taken as stuck and fails as one normal failed try (an approve stays in review with a note;
 * a task whose work already reached its branch is done).
 */
export const finishLimitMs = (tests: number, testMinutes: number = DEFAULT_TEST_MINUTES) => Math.max(1, tests) * testMinutes * 60_000 + FINISH_GIT_MS

/** The note a try's run ends with when its checking and merging ran over `min` minutes and was given up. */
export const ranOverNote = (min: number) => `its checking and merging ran over ${min} min and was stopped`

/** Whether task `t`'s work is being tested and merged right now by some copy of the plugin (its mark is fresh). */
export function finishingNow(t: Pick<BoardTask, 'status' | 'finishing'>, nowMs: number, staleMs = FINISH_STALE_MS): boolean {
  if (t.status !== 'doing' || typeof t.finishing !== 'string') return false
  const at = Date.parse(t.finishing)
  return Number.isFinite(at) && isFresh(at, nowMs, staleMs)
}

/** The step symcc is in while it checks task `t`'s finished work ("prep", "testing", "checker", "merging"), or '' when none is going on (or its mark is stale). */
export function checkStepNow(t: Pick<BoardTask, 'status' | 'checking'>, nowMs: number, staleMs = FINISH_STALE_MS): CheckStep | '' {
  if (!t.checking || !CHECKED_STATUSES.includes(t.status)) return ''
  const at = Date.parse(t.checking.at)
  return Number.isFinite(at) && isFresh(at, nowMs, staleMs) ? t.checking.step : ''
}

/** Whether task `t` waits in review (or waiting) while the owner's approve (or a merge once their files are clear) runs:
 *  its check step is set and fresh (prep, in line, test, merge). The owner has nothing to do on it then: every board
 *  lists and counts it with the running tasks, not under NEEDS YOU. Once the approve ends (merged, or failed and back in
 *  review) its step is cleared, so it needs the owner again. */
export const approveRunning = (t: Pick<BoardTask, 'status' | 'checking'>, nowMs: number): boolean => {
  const p = taskPhase(t, nowMs)
  return p.shown !== p.state
}

/** The status task `t` is grouped and counted under on every board: "doing" while its approve runs (approveRunning), else its own (taskPhase's `shown`). */
export const shownStatus = <S extends BoardTask['status']>(t: { status: S; checking?: BoardTask['checking'] }, nowMs: number): S | 'doing' => taskPhase(t, nowMs).shown as S | 'doing'

/**
 * Whether task `t`'s worker has already handed back its try: it is "doing" and has a finishing mark,
 * or its last try has an end time (set at the hand-back). Its agent may still be listed (idle), but it
 * no longer works on the task: it must not be tracked as a worker again, nor timed by max_minutes.
 */
export function handedBack(t: Pick<BoardTask, 'status' | 'finishing' | 'runs'>): boolean {
  return t.status === 'doing' && (!!t.finishing || !!t.runs?.[t.runs.length - 1]?.ended)
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
  `${tryLabel(t)}: its work was already merged into ${intoOf(t)} (${shortSha(sha)}) when it was about to be ${when}, so it is done`

/**
 * Task `t` as "done", because its work is already on the branch it merges into (`sha`): it must
 * not be tried again or failed. Its last try ends as finished, merged.
 */
export function mergedDone(t: BoardTask, sha: string, when: string, now: string): BoardTask {
  const { session: _s, finishing: _f, checking: _c, test_output: _o, ...rest } = t
  const runs = t.status === 'doing' ? endedBy(t, now, 'finished', 'merged').runs : t.runs?.length ? withEnd(t.runs, 'finished', 'merged', true) : undefined
  return { ...rest, status: 'done' as const, note: `merged into ${intoOf(t)} (${shortSha(sha)})`, merged: sha, merge_main: false, updated_at: now, history: withHistory(t.history, now, ['merged', alreadyMergedLine(t, sha, when), { try: Number(t.attempts) || 0 }]), ...(runs ? { runs } : {}) }
}

// ---------------- merged outside the board (T-514) ----------------
// The owner or the lead merged a task's branch by hand (e.g. its only failure was the merge test timing out).
// symcc checks with git that the work is in the branch it merges into, then marks it done: no test run, no merge.

/** The statuses a task can be marked "merged outside the board" from (a running one is stopped first). */
export const MERGED_OUTSIDE_FROM: readonly BoardTask['status'][] = ['todo', 'doing', 'failed', 'waiting', 'paused', 'review', 'dropped']

/** The history line of a task marked done because its work was merged outside the board (`sha`), by `by` ("the owner", "the lead"). */
export const mergedOutsideLine = (sha: string, by: string) => `merged outside the board (${shortSha(sha)}); marked done by ${by}`

/** Whether history line `l` says the task was merged outside the board (see mergedOutsideLine). */
export const isMergedOutsideLine = (l: string) => /^merged outside the board\b/.test(l)

/** The refusal when task `id`'s branch has `n` commits that `into` doesn't have. */
export const notMergedText = (id: string, n: number, into: string) => `${id}'s branch has ${n} commit${n === 1 ? '' : 's'} that ${n === 1 ? "isn't" : "aren't"} in ${into} yet`

/**
 * Task `t` as "done" because its work is already in the branch it merges into (`sha`: the merge commit there, or
 * the branch tip when it was fast-forwarded): merged outside the board, marked done by `by`. Its `commits` are
 * recorded on its last try, which ends as finished, merged (a running one too). Questions, waits and check marks
 * it had are cleared.
 */
export function mergedOutside(t: BoardTask, sha: string, by: string, commits: readonly string[], now: string): BoardTask {
  const { session: _s, finishing: _f, checking: _c, test_output: _o, merge_wait: _w, time_ask: _a, wrap_up: _u, options: _p, asked_files: _af, question_lead: _ql, options_lead: _ol, ...rest } = t
  const ended = t.status === 'doing' ? endedBy(t, now, 'finished', 'merged').runs : t.runs?.length ? withEnd(t.runs, 'finished', 'merged', true) : undefined
  const runs = ended ? addCommits(ended, [...commits, sha]) : undefined
  return { ...rest, status: 'done' as const, question: null, note: `merged into ${intoOf(t)} outside the board (${shortSha(sha)})`, merged: sha, merge_main: false, updated_at: now, history: withHistory(t.history, now, ['merged', mergedOutsideLine(sha, by), { how: 'outside' }]), ...(runs ? { runs } : {}) }
}

/**
 * At session start the driver sends "doing" tasks whose worker is gone back to "todo":
 * those of this session, of a dead session, or with no session recorded. `leadBefore`
 * is lead.json as it was before this session wrote its own heartbeat. Tasks in `keep`
 * (an old worker of theirs is still alive and has not handed back, see handedBack) stay "doing" until that worker has ended, and so
 * do tasks whose work is being tested and merged right now (see finishingNow). A task whose
 * try already merged (see mergedThisTry) is done instead.
 */
export function resetDoing(b: Board, me: string, leadBefore: string | null, nowMs: number, note: string, now: string, keep: string[] = []): Board {
  const live = liveDriver(leadBefore, nowMs)
  return {
    ...b,
    tasks: b.tasks.map(t => {
      // A live agent keeps its task only while it still works on it (not once it handed back).
      if (t.status !== 'doing' || !ownedHere(t, me, live) || (keep.includes(t.id) && !handedBack(t)) || finishingNow(t, nowMs)) return t
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
  const { session: _gone, finishing: _f, checking: _c, ...rest } = t
  return { ...rest, status: 'todo' as const, note, updated_at: now, ...(t.status === 'doing' ? { history: withHistory(t.history, now, stoppedEntry(t, note)), ...endedBy(t, now, ...stopEnd(note)) } : {}) }
}
