// A task page's key hints for a plain task of one status (T-575: taskKeys takes the page's actions, taskActions).
import { taskActions, taskKeys, type BoardTask, type KeyHint } from '../hooks/board'

const T = '2026-11-09T00:00:00.000Z'

/** A plain task of `status` (one try so far), with `extra` fields. */
export const plainTask = (status: string, extra: Record<string, unknown> = {}): BoardTask =>
  ({ id: 'T-1', title: 'x', details: '', files: [], status, note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: T, updated_at: T, ...extra }) as unknown as BoardTask

/** The keys at the bottom of the page of a plain task of `status`: `worker` a worker is on it, `reports` the tries
 *  with a report, `answering` its answer buttons take the number keys. */
export const keysFor = (status: string, o: { worker?: boolean; reports?: number[]; answering?: boolean; extra?: Record<string, unknown> } = {}): KeyHint[] =>
  taskKeys(taskActions(plainTask(status, o.extra), { worker: !!o.worker }), o.reports ?? [], !!o.answering)
