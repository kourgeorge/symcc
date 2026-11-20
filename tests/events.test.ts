// T-616: task events. phaseEvents compares a task's phase before and after a board write and gives one event per
// change (state, stage, wait, created, removed); emitTaskEvents hands them to the listeners and never lets one that
// throws stop the write. The real flow (finish → checker → queue → test → merge) is in checker.test.ts.
import { expect } from 'claude-code/testing'
import type { BoardTask } from '../hooks/board'
import { phaseEvents, boardEvents, stageLine, withStageHistory, type TaskEvent } from '../hooks/core/events'
import { emitTaskEvents, onTaskEvent } from '../hooks/app/events'
import { change, load, saveBoard } from '../hooks/app/store'
import { addTask, emptyBoard, find } from '../hooks/board'
import { S } from '../hooks/app/state'
import { fakeHost, memoryFs, done } from './fake-host'
import { test } from './reset'

const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const AT = new Date(NOW).toISOString()
const iso = (ms: number) => new Date(ms).toISOString()
const FRESH = iso(NOW - 30_000)
const STALE = iso(NOW - 10 * 60_000)

const task = (status: BoardTask['status'], extra: Partial<BoardTask> = {}): BoardTask =>
  ({ id: 'T-1', title: 'Do it', details: '', files: [], status, attempts: 1, note: '', updated_at: iso(NOW - 60_000), history: [], ...extra }) as BoardTask
const ev = (kind: TaskEvent['kind'], from: string | null, to: string | null, more: Partial<TaskEvent> = {}): TaskEvent => ({ task: 'T-1', kind, from, to, at: AT, try: 1, ...more })
const step = (s: 'prep' | 'checker' | 'testing' | 'merging', at = FRESH) => ({ checking: { step: s, at } })

test('phaseEvents: one event for each kind of change, and none when nothing changed', () => {
  const rows: [string, BoardTask | undefined, BoardTask | undefined, TaskEvent[]][] = [
    ['created', undefined, task('todo', { attempts: 0 }), [ev('created', null, 'todo', { try: 0 })]],
    ['removed', task('done'), undefined, [ev('removed', 'done', null)]],
    ['no change', task('todo'), task('todo', { title: 'Other' }), []],
    ['state and stage: todo → doing', task('todo'), task('doing'), [ev('state', 'todo', 'doing'), ev('stage', null, 'worker')]],
    ['stage: worker → prep', task('doing'), task('doing', step('prep')), [ev('stage', 'worker', 'prep')]],
    ['stage: prep → checker', task('doing', step('prep')), task('doing', step('checker')), [ev('stage', 'prep', 'checker')]],
    ['stage: checker → queue, with its place', task('doing', step('checker')), task('doing', { checking: { step: 'queue', place: 2, at: FRESH } }), [ev('stage', 'checker', 'queue', { place: 2 })]],
    ['a new place in the queue is no stage change', task('doing', { checking: { step: 'queue', place: 2, at: FRESH } }), task('doing', { checking: { step: 'queue', place: 1, at: FRESH } }), []],
    ['wait: a question', task('doing'), task('waiting', { question: 'A or B?' }), [ev('state', 'doing', 'waiting'), ev('stage', 'worker', null), ev('wait', null, 'answer')]],
    ['wait: answered', task('waiting', { question: 'A or B?' }), task('todo'), [ev('state', 'waiting', 'todo'), ev('wait', 'answer', null)]],
    ['a stale step (an approve) taken away: one stage change to none, and it waits for a review again', task('review', step('checker', STALE)), task('review'), [ev('stage', 'checker', null), ev('wait', null, 'review')]],
    ['a stale step left on the board changes nothing', task('review', step('checker', STALE)), task('review', { ...step('checker', STALE), note: 'x' }), []],
  ]
  for (const [name, before, after, want] of rows) expect([name, phaseEvents(before, after, NOW)]).toEqual([name, want])
  // the stale step, once gone, gives nothing more
  expect(phaseEvents(task('review'), task('review'), NOW + 60_000)).toEqual([])
})

test('boardEvents covers every task of a write; the stage lines go into the history once each, as "step" entries', () => {
  const before = { tasks: [task('doing'), task('done', { id: 'T-2' })] }
  const after = { tasks: [task('doing', step('prep')), task('todo', { id: 'T-3', attempts: 0 })] }
  const events = boardEvents(before, after, NOW)
  expect(events.map(e => [e.task, e.kind, e.from, e.to])).toEqual([['T-1', 'stage', 'worker', 'prep'], ['T-3', 'created', null, 'todo'], ['T-2', 'removed', 'done', null]])
  expect(stageLine(ev('stage', 'checker', 'queue', { place: 2 }), {})).toBe('try 1: waits in the merge queue (place 2)')
  expect(stageLine(ev('stage', 'prep', null), {})).toBe(null)
  const b = withStageHistory({ ...emptyBoard(), tasks: after.tasks }, events)
  expect(b.tasks[0]!.history).toEqual([{ at: AT, kind: 'step', text: 'try 1: prep started' }])
  expect(b.tasks[1]!.history).toEqual([])
})

test('a listener that throws never stops the board write; the owner is told once, and the other listeners still get the events', async () => {
  const files = new Map<string, string>()
  const toasts: string[] = []
  const { host } = fakeHost({
    fs: memoryFs(files),
    ui: { toast: (t: string) => void toasts.push(t) },
    run: async ([cmd, ...a]) => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
      if (cmd === 'rm') for (const f of a.filter(v => !v.startsWith('-'))) files.delete(f)
      return done()
    },
  })
  S.root = '/repo'
  S.writing = Promise.resolve()
  await saveBoard(host, addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', details: 'x', files: ['src/'] }, AT)[0])
  const got: TaskEvent[] = []
  const offBad = onTaskEvent(() => {
    throw new Error('boom')
  })
  const offGood = onTaskEvent(es => void got.push(...es))
  try {
    await change(host, b => ({ ...b, tasks: b.tasks.map(t => ({ ...t, status: 'doing' as const, attempts: 1 })) }))
    await change(host, b => ({ ...b, tasks: b.tasks.map(t => ({ ...t, status: 'review' as const })) }))
  } finally {
    offBad()
    offGood()
  }
  expect(find(await load(host), 'T-1')!.status).toBe('review')
  expect(got.map(e => `${e.kind} ${e.from}→${e.to}`)).toEqual(['state todo→doing', 'stage null→worker', 'state doing→review', 'stage worker→null', 'wait null→review'])
  expect(toasts.filter(t => t.includes('a task event listener failed: boom')).length).toBe(1)
  // the activity log got them too, one JSON line each
  const log = files.get('/repo/.symcc/events.jsonl')!.trim().split('\n').map(l => JSON.parse(l) as TaskEvent)
  expect(log.map(e => `${e.kind} ${e.to}`)).toEqual(['state doing', 'stage worker', 'state review', 'stage null', 'wait review'])
  await emitTaskEvents(host, [])
})
