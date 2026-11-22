// Task events (T-616): every change of a task's state, stage or wait, worked out by comparing taskPhase before and
// after a board write. Pure: the app side (hooks/app/events.ts) emits them to its listeners on every board write.
import type { Board, BoardTask } from './board-file'
import { type HistoryAdd, withHistory } from './history'
import { type PhaseStage, taskPhase } from './phase'
import { tryLabel } from './roles'

/** What changed: its saved status ('state'), its step ('stage'), what it waits for from the owner ('wait'), or the task came onto or left the board. */
export type TaskEventKind = 'state' | 'stage' | 'wait' | 'created' | 'removed'

/**
 * One change of one task: `from` and `to` are the old and new status, stage or wait (null for none); for 'created'
 * `to` is its status, for 'removed' `from` is. `at` is when (ISO), `try` the task's try number then (0 before its
 * first), `place` its place in the merge queue on a stage event into 'queue'.
 */
export type TaskEvent = { task: string; kind: TaskEventKind; from: string | null; to: string | null; at: string; try: number; place?: number }

/**
 * Task `t`'s phase as it was saved: its check step is read at the time it was marked (checking.at), so a step that
 * went stale meanwhile still counts as the step it was. A stale step that a write takes away is then one stage change
 * (to the worker, or to none), and a stale step left on the board changes nothing.
 */
function savedPhase(t: BoardTask, nowMs: number) {
  const marked = t.checking?.at ? Date.parse(t.checking.at) : NaN
  return taskPhase(t, Number.isFinite(marked) ? marked : nowMs)
}

/**
 * The events of one task between `before` and `after` (undefined: not on the board), at `nowMs`: one event per change,
 * in the order state, stage, wait; none when nothing changed. A new task gives only 'created', a task that left the
 * board only 'removed'.
 */
export function phaseEvents(before: BoardTask | undefined, after: BoardTask | undefined, nowMs: number): TaskEvent[] {
  const at = new Date(nowMs).toISOString()
  const t = after ?? before
  if (!t) return []
  const base = { task: t.id, at, try: Number(t.attempts) || 0 }
  if (!before) return [{ ...base, kind: 'created', from: null, to: after!.status }]
  if (!after) return [{ ...base, kind: 'removed', from: before.status, to: null }]
  const a = savedPhase(before, nowMs)
  const b = savedPhase(after, nowMs)
  const out: TaskEvent[] = []
  if (a.state !== b.state) out.push({ ...base, kind: 'state', from: a.state, to: b.state })
  if (a.stage !== b.stage) out.push({ ...base, kind: 'stage', from: a.stage, to: b.stage, ...(b.stage === 'queue' && b.place ? { place: b.place } : {}) })
  if (a.waitsFor !== b.waitsFor) out.push({ ...base, kind: 'wait', from: a.waitsFor, to: b.waitsFor })
  return out
}

/** The events of a whole board write: each task of `before` and `after` compared (see phaseEvents), in board order. */
export function boardEvents(before: Pick<Board, 'tasks'>, after: Pick<Board, 'tasks'>, nowMs: number): TaskEvent[] {
  const old = new Map(before.tasks.map(t => [t.id, t]))
  const now = new Map(after.tasks.map(t => [t.id, t]))
  const out: TaskEvent[] = []
  for (const t of after.tasks) out.push(...phaseEvents(old.get(t.id), t, nowMs))
  for (const t of before.tasks) if (!now.has(t.id)) out.push(...phaseEvents(t, undefined, nowMs))
  return out
}

/** The history words of each check stage a task goes into (the worker's own stage gets no line). */
export const STAGE_LINE: Partial<Record<PhaseStage, string>> = { prep: 'prep started', checker: 'checker started', queue: 'waits in the merge queue', test: 'tests started', merge: 'merge started' }

/** T-806: the history step of each check stage a task goes into. */
export const STAGE_STEP: Partial<Record<PhaseStage, 'prep' | 'checker' | 'queue' | 'tests' | 'merge'>> = { prep: 'prep', checker: 'checker', queue: 'queue', test: 'tests', merge: 'merge' }

/** "try 1: checker started", "try 1: waits in the merge queue (place 2)": the history line of a stage event, or null for one that gets none. */
export function stageLine(e: TaskEvent, t: Pick<BoardTask, 'role'>): string | null {
  const words = e.kind === 'stage' && e.to ? STAGE_LINE[e.to as PhaseStage] : undefined
  if (!words) return null
  return `${tryLabel({ role: t.role, attempts: e.try })}: ${words}${e.place ? ` (place ${e.place})` : ''}`
}

/** Board `b` with a 'stage' history entry on its task for each stage event in `events` (see stageLine), at the event's time. */
export function withStageHistory(b: Board, events: readonly TaskEvent[]): Board {
  const lines = new Map<string, [string, HistoryAdd][]>()
  for (const e of events) {
    const t = b.tasks.find(x => x.id === e.task)
    const line = t ? stageLine(e, t) : null
    const step = e.to ? STAGE_STEP[e.to as PhaseStage] : undefined
    if (line && step) lines.set(e.task, [...(lines.get(e.task) ?? []), [e.at, ['stage', line, { try: e.try, step, ...(e.place ? { place: e.place } : {}) }]]])
  }
  if (!lines.size) return b
  return {
    ...b,
    tasks: b.tasks.map(t => {
      const adds = lines.get(t.id)
      return adds ? { ...t, history: adds.reduce((h, [at, add]) => withHistory(h, at, add), t.history) } : t
    }),
  }
}
