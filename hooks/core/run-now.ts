// T-954: "Run now" on a task: the owner starts a worker on it at once, instead of waiting for its turn. It starts even
// when every agent slot (max_parallel) is busy (then it runs one over, and nothing else starts until the count is back
// under), on a paused board (only this task starts), and, once the owner said "Start anyway", while tasks it waits on
// (its after list) are not done yet (the list is kept for the record). Everything after the start is as always:
// checker, tests, merge, and in approve-merge mode it still waits for review. Pure: the words and checks the engine
// (app/tools.ts) and the three task pages share.
import type { SymccStatus, SymccTask } from '../../types'
import { type Board, OPEN, STATUS_WORD } from './board-file'
import { depDone } from './archive'
import { shareFiles } from './health'

/** Whether task `t` can be run now: only a task that is to do (T-1023; retry or move others to to do first). */
export const canRunNow = (t: Pick<SymccTask, 'status'>): boolean => t.status === 'todo'

/** The Run now button's words, its key on the task pages (g is the git banner's), and its key hint's word. */
export const RUN_NOW_LABEL = 'Run now'
export const RUN_NOW_KEY = 'e'
export const RUN_NOW_WORD = 'run now'

/** The answers of the "Start anyway?" question, in order; Cancel is the default. */
export const RUN_NOW_YES = 'Start anyway'
export const RUN_NOW_NO = 'Cancel'

/** The word a status reads as in the question: "running" for a task being worked on, else the board's word. */
const stateWord = (s: SymccStatus): string => (s === 'doing' ? 'running' : STATUS_WORD[s])

/** One task `t` waits on that is not done yet: its id and its state in words ("running", "to do", "missing"). */
export type RunNowWait = { id: string; state: string }

/** The tasks of `t`'s after list that are not done yet (an archived done one counts as done), with their state. */
export function runNowWaits(b: Pick<Board, 'tasks'> & Partial<Pick<Board, 'archived_done'>>, t: Pick<SymccTask, 'id' | 'after'>): RunNowWait[] {
  return [...new Set(t.after ?? [])].filter(a => a !== t.id && !depDone(b, a)).map(a => {
    const d = b.tasks.find(x => x.id === a)
    return { id: a, state: d ? stateWord(d.status) : 'missing' }
  })
}

/** "T-5 waits on T-3 (running). Start anyway?": the question asked before a run now that skips the wait. */
export const runNowQuestion = (id: string, waits: readonly RunNowWait[]): string =>
  `${id} waits on ${waits.map(w => `${w.id} (${w.state})`).join(', ')}. Start anyway?`

/** The running tasks (other than `t`) whose files may overlap `t`'s (core/health.ts shareFiles: no list = anywhere). */
export const runNowShares = (all: readonly Pick<SymccTask, 'id' | 'status' | 'files'>[], t: Pick<SymccTask, 'id' | 'files'>, statuses: readonly SymccStatus[] = ['doing']): string[] =>
  all.filter(x => x.id !== t.id && statuses.includes(x.status) && shareFiles(x.files ?? [], t.files ?? [])).map(x => x.id)

/** The reply to moving a task from the backlog: its id, the open tasks sharing its files that are not in its after list, and its priority. */
export function backlogMovedText(all: readonly Pick<SymccTask, 'id' | 'status' | 'files'>[], t: Pick<SymccTask, 'id' | 'files' | 'after' | 'priority'>): string {
  const after = t.after ?? []
  const ids = runNowShares(all, t, OPEN).filter(id => !after.includes(id))
  const shared = ids.map(id => `${id} (${all.find(x => x.id === id)!.status})`)
  return `${t.id} moved from the backlog to todo` +
    (shared.length ? `; shares files with ${shared.join(', ')}; not in its after list` : '') +
    `; priority ${t.priority ?? 0}`
}

/** The warning line on the page of a task Run now started while running tasks share its files:
 *  "started now while T-3 runs; they share files, so their changes may clash at the merge". */
export const runNowShareText = (ids: readonly string[]): string =>
  `started now while ${ids.join(', ')} ${ids.length === 1 ? 'runs' : 'run'}; they share files, so their changes may clash at the merge`

/** The history line of a run now start (after the try label): "started now by the owner", with what it skipped. */
export function runNowLine(o: { waits?: readonly RunNowWait[]; over?: { busy: number; max: number }; paused?: boolean; }): string {
  const more = [
    o.waits?.length ? `without waiting for ${o.waits.map(w => w.id).join(', ')}` : '',
    o.over ? `over the agent limit (${o.over.busy + 1}/${o.over.max} busy)` : '',
    o.paused ? 'on a paused board' : '',
  ].filter(Boolean)
  return `started now by the owner${more.length ? ` (${more.join('; ')})` : ''}`
}

/** Why a task can't be run now (its status isn't to do): "T-5 is in review; Run now is for ...". */
export const runNowRefusal = (t: Pick<SymccTask, 'id' | 'status'>): string =>
  t.status === 'doing' ? `${t.id} is already running` : `${t.id} is ${STATUS_WORD[t.status]}; Run now is only for a task that is to do; retry it or move it to to do first`

/** The reply when Run now is asked for in plan mode (nothing starts then, and nothing changes): "T-5 didn't start: plan mode: ...". */
export const runNowPlanText = (id: string): string => `${id} didn't start: plan mode: nothing starts; run it when plan mode ends`
