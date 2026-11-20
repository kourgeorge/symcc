// T-610 (taskPhase 1/6): one place that works out where a task is now (hooks/core/phase.ts), reading today's fields:
// its saved status, the status the boards show, its step, its place in the merge queue, what it waits for from the
// owner, whether it was approved, and since when. A table of tasks: every status, every step fresh and stale, an
// approve running in each step, a files-merge waiting in the queue, leftovers, more time asked, an answered investigation.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { taskPhase, type TaskPhase, type PhaseTask, type CheckStep } from '../hooks/board'

const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const FRESH = iso(NOW - 30_000)
const STALE = iso(NOW - 10 * 60_000)
const CHANGED = iso(NOW - 60_000)
const STARTED = iso(NOW - 20 * 60_000)
const ASKED = iso(NOW - 2 * 60_000)

const task = (status: PhaseTask['status'], extra: Partial<PhaseTask> & Record<string, unknown> = {}): PhaseTask => ({ status, note: '', updated_at: CHANGED, ...extra })
const at = (step: CheckStep, when = FRESH) => ({ checking: { step, at: when } })
const openRun = { runs: [{ started: STARTED }] }
const endedRun = { runs: [{ started: STARTED, ended: CHANGED }] }
const files = { merge_wait: { dirty: ['a.ts'], untracked: [], ignored: [] } }

const idle = (state: PhaseTask['status'], waitsFor: TaskPhase['waitsFor'] = null): TaskPhase =>
  ({ state, shown: state, stage: null, waitsFor, approved: false, ...(waitsFor ? { since: CHANGED } : {}) })
const runs = (state: PhaseTask['status'], stage: TaskPhase['stage'], more: Partial<TaskPhase> = {}): TaskPhase =>
  ({ state, shown: 'doing', stage, waitsFor: null, approved: state === 'review', ...more })

const TABLE: [string, PhaseTask, TaskPhase, { merging?: boolean }?][] = [
  // the 9 states, nothing running
  ['backlog', task('backlog'), idle('backlog')],
  ['todo', task('todo'), idle('todo')],
  ['doing, worker on it (open try)', task('doing', openRun), runs('doing', 'worker', { since: STARTED })],
  ['doing, no try on the board yet', task('doing'), runs('doing', 'worker')],
  ['review', task('review', endedRun), idle('review', 'review')],
  ['waiting with a question', task('waiting', { question: 'A or B?' }), idle('waiting', 'answer')],
  ['waiting asking for files', task('waiting', { asked_files: ['b.ts'] }), idle('waiting', 'files')],
  ['waiting for the owner\'s files', task('waiting', files), idle('waiting', 'your-files')],
  ['paused', task('paused'), idle('paused')],
  ['failed', task('failed'), idle('failed', 'failed')],
  ['done', task('done'), idle('done')],
  ['dropped', task('dropped'), idle('dropped')],
  // a doing task in each step, fresh, then stale (back to its worker stage, as taskStage reads it today)
  ['doing, prep fresh', task('doing', { ...endedRun, ...at('prep') }), runs('doing', 'prep')],
  ['doing, checker fresh', task('doing', { ...endedRun, ...at('checker') }), runs('doing', 'checker')],
  ['doing, test fresh', task('doing', { ...endedRun, ...at('testing') }), runs('doing', 'test')],
  ['doing, merge fresh', task('doing', { ...endedRun, ...at('merging') }), runs('doing', 'merge')],
  ['doing, in the queue', task('doing', { ...endedRun, ...at('prep'), note: 'queue (2)' }), runs('doing', 'queue', { place: 2 })],
  ['doing, prep stale', task('doing', { ...endedRun, ...at('prep', STALE) }), runs('doing', 'worker')],
  ['doing, checker stale', task('doing', { ...endedRun, ...at('checker', STALE) }), runs('doing', 'worker')],
  ['doing, test stale', task('doing', { ...endedRun, ...at('testing', STALE) }), runs('doing', 'worker')],
  ['doing, merge stale', task('doing', { ...endedRun, ...at('merging', STALE) }), runs('doing', 'worker')],
  // an approve running in each step: shown doing, approved, waits for nothing
  ['approve, prep', task('review', { ...endedRun, ...at('prep') }), runs('review', 'prep')],
  ['approve, checker', task('review', { ...endedRun, ...at('checker') }), runs('review', 'checker')],
  ['approve, in the queue', task('review', { ...endedRun, ...at('prep'), note: 'queue (1)' }), runs('review', 'queue', { place: 1 })],
  ['approve, test', task('review', { ...endedRun, ...at('testing') }), runs('review', 'test')],
  ['approve, merge', task('review', { ...endedRun, ...at('merging') }), runs('review', 'merge')],
  ['approve started on this page, no step yet', task('review', endedRun), runs('review', 'prep'), { merging: true }],
  ['approve with a stale step', task('review', { ...endedRun, ...at('testing', STALE) }), idle('review', 'review')],
  ['approve waiting for the owner\'s files', task('review', { ...endedRun, ...files }), { ...idle('review', 'your-files'), approved: true }],
  // a files-merge (a waiting task whose owner's files cleared) waiting its turn in the queue, and in a step
  ['files-merge in the queue', task('waiting', { ...endedRun, ...files, ...at('prep'), note: 'queue (3)' }), runs('waiting', 'queue', { place: 3 })],
  ['files-merge, test', task('waiting', { ...endedRun, ...files, ...at('testing') }), runs('waiting', 'test')],
  // leftovers: a review task with an old queue note and no fresh step is the owner's turn, not in the queue
  ['review, leftover queue note, no step', task('review', { ...endedRun, note: 'queue (2)' }), idle('review', 'review')],
  ['review, leftover queue note, stale step', task('review', { ...endedRun, ...at('prep', STALE), note: 'queue (2)' }), idle('review', 'review')],
  // more time asked: only in the worker stage; in a check step the step wins
  ['doing, asks for more time', task('doing', { ...openRun, time_ask: ASKED }), runs('doing', 'worker', { waitsFor: 'time', since: ASKED })],
  ['doing, asks for more time in a check step', task('doing', { ...endedRun, ...at('testing'), time_ask: ASKED }), runs('doing', 'test')],
  // an answered investigation in review: nothing merges, the owner reads its answer
  ['answered investigation', task('review', { ...endedRun, kind: 'investigation', answer: 'It is X.' }), idle('review', 'review')],
]

for (const [name, t, want, o] of TABLE) {
  test(`T-610 taskPhase: ${name}`, () => {
    expect(taskPhase(t, NOW, {}, o)).toEqual(want)
  })
}

test('T-610 taskPhase: the saved status never changes, and anything running waits for nothing but more time', () => {
  for (const [, t, , o] of TABLE) {
    const p = taskPhase(t, NOW, undefined, o)
    expect(p.state).toBe(t.status)
    if (p.stage && p.stage !== 'worker') expect(p.waitsFor).toBe(null)
    if (p.waitsFor === 'time') expect(p.stage).toBe('worker')
    if (p.place !== undefined) expect(p.stage).toBe('queue')
  }
})
