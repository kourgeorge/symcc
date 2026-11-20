// Where a task is now, worked out in one place (T-610, step 1 of 6 from investigation T-608): its saved status, the
// status the boards show it under, the step it is in on its way to the merge, and what (if anything) it waits for
// from the owner. For now it reads today's fields (status, checking, the "queue (n)" note, time_ask, merge_wait,
// asked_files). The helpers that decide a task's stage or wait (approveRunning, shownStatus, ownersTurn, waitsForYou,
// rowMark, statusCell, rowCell, stepNowWord, statusBadge, taskStage) are thin wrappers over it (T-611).
import type { SymccStatus } from '../../types'
import { type BoardTask, type CheckStep, waitsForFiles } from './board-file'
import { checkStepNow } from './lead'

/** The step a task is in on its way to the merge: its worker works, or one of the check steps, or it waits its turn in the merge queue. */
export type PhaseStage = 'worker' | 'prep' | 'checker' | 'queue' | 'test' | 'merge'
/** What a task waits for from the owner: an answer to its question, an OK for files outside its list, the owner's own
 *  files in the way of its merge, a review, more time for its worker, or a look at why it failed. */
export type PhaseWait = 'answer' | 'files' | 'your-files' | 'review' | 'time' | 'failed'

/**
 * Where task `t` is at `nowMs`:
 * - `state`: its saved status, unchanged;
 * - `shown`: 'doing' while an approve or a merge waiting for the owner's files runs (a fresh check step on a task in
 *   review or waiting, see shownStatus; or `merging`, an approve this page started before its first step is on the
 *   board), else `state`;
 * - `stage`: the step it is in (a doing task: the merge queue while its note is "queue (n)", else its fresh check step,
 *   else its worker; a running approve or files-merge the same, 'prep' before its first step), null when nothing runs;
 * - `place`: its place in the merge queue (the n of "queue (n)"), only in stage 'queue';
 * - `waitsFor`: what the owner is asked for; null while anything runs, except 'time' (a worker over its time limit,
 *   only in the worker stage);
 * - `approved`: the owner approved it and that approve is running or waits for the owner's files;
 * - `since`: when what it waits for began (the task's last change; for 'time' when the owner was asked), or when its
 *   worker's open try started.
 * `board` is not read yet (a later step takes the queue from it).
 */
export type TaskPhase = { state: SymccStatus; shown: SymccStatus; stage: PhaseStage | null; place?: number; waitsFor: PhaseWait | null; approved: boolean; since?: string }

/** What taskPhase reads of a task (only its status must be there). */
export type PhaseTask = Pick<BoardTask, 'status'> & Partial<Pick<BoardTask, 'note' | 'updated_at' | 'runs' | 'checking' | 'time_ask' | 'merge_wait' | 'asked_files'>>

const STEP_STAGE: Record<CheckStep, PhaseStage> = { prep: 'prep', testing: 'test', checker: 'checker', merging: 'merge' }
/** The check step of stage `stage` (its icon and word are STEP_ICON and STEP_WORD), '' for the worker, the queue and none. */
export const stageStep = (stage: PhaseStage | null): CheckStep | '' => (stage === 'prep' ? 'prep' : stage === 'test' ? 'testing' : stage === 'checker' ? 'checker' : stage === 'merge' ? 'merging' : '')
const QUEUE_NOTE = /^queue \((\d+)\)$/

export function taskPhase(t: PhaseTask, nowMs: number, _board?: { mode?: unknown; checker?: unknown }, o: { merging?: boolean } = {}): TaskPhase {
  const state = t.status
  const step = checkStepNow(t, nowMs)
  // a task in review or waiting shows as doing while its approve (or files-merge) runs: a fresh check step, or an
  // approve this page started
  const shown: SymccStatus = state !== 'doing' && (step || (o.merging && state === 'review')) ? 'doing' : state
  const base = { state, shown, approved: false }
  if (shown !== 'doing') return { ...base, stage: null, ...ownerWait(t) }
  const queue = QUEUE_NOTE.exec(t.note ?? '')
  const stage: PhaseStage = queue ? 'queue' : step ? STEP_STAGE[step] : state === 'doing' ? 'worker' : 'prep'
  const last = t.runs?.[t.runs.length - 1]
  // more time asked (asksMoreTime in commands.ts reads the same fields)
  const time = stage === 'worker' && !!t.time_ask
  return {
    ...base,
    stage,
    ...(queue ? { place: Number(queue[1]) } : {}),
    waitsFor: time ? 'time' : null,
    approved: state === 'review',
    ...(time ? { since: t.time_ask } : stage === 'worker' && last && !last.ended ? { since: last.started } : {}),
  }
}

/** What a task that runs nothing waits for from the owner, and since when. */
function ownerWait(t: PhaseTask): { waitsFor: PhaseWait | null; approved: boolean; since?: string } {
  const files = waitsForFiles(t)
  const waitsFor: PhaseWait | null =
    files ? 'your-files'
    : t.status === 'waiting' ? ((t.asked_files?.length ?? 0) > 0 ? 'files' : 'answer')
    : t.status === 'review' ? 'review'
    : t.status === 'failed' ? 'failed'
    : null
  return { waitsFor, approved: files && t.status === 'review', ...(waitsFor ? { since: t.updated_at } : {}) }
}
