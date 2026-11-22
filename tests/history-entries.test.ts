// T-522: a task's history is a list of records { at, kind, text }, made through one helper (historyEntry / withHistory);
// an old board or archive with plain string lines is converted once on load (times guessed from the tries).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { addTask, afterChanges, emptyBoard, mergedHow, patchTask, promoteTask, readArchive, archiveText, readBoard, rejectTask, stashTask, statsReport, find, type Board } from '../hooks/board'
import { HISTORY_KINDS, historyEntry, historyLineText, historyTime, withHistory } from '../hooks/core/history'
import { guessHistoryKind, migrateHistory, oldHistoryEntry, upgradeArchiveTask } from '../hooks/core/old-data'
import { readOld, stillOld } from './old-data-fixture'
import { taskText } from '../hooks/app/tools'

const T = '2026-11-18T10:00:00.000Z'
const T2 = '2026-11-18T11:30:00.000Z'

test('new entries get at, kind and text through the helper', () => {
  expect(historyEntry('note', 'the lead added a note: “x”', T)).toEqual({ at: T, kind: 'note', text: 'the lead added a note: “x”' })
  expect(withHistory([historyEntry('created', 'created by the owner because x', T)], T2, ['stopped', 'try 1: stopped: paused'], ['resumed', 'resumed after a pause']))
    .toEqual([{ at: T, kind: 'created', text: 'created by the owner because x' }, { at: T2, kind: 'stopped', text: 'try 1: stopped: paused' }, { at: T2, kind: 'resumed', text: 'resumed after a pause' }])
  let b: Board = addTask(emptyBoard(), { origin: { by: 'owner', why: 'the owner asked for it' }, title: 'A' }, T)[0]
  expect(b.tasks[0]!.history).toEqual([{ at: T, kind: 'created', text: 'created by the owner because the owner asked for it' }])
  b = stashTask(b, 'T-1', T2, 'not clear yet')
  expect(find(b, 'T-1')!.history.at(-1)).toEqual({ at: T2, kind: 'moved-backlog', text: 'moved to the backlog (was todo): not clear yet' })
  b = promoteTask(b, 'T-1', T2)
  b = patchTask(b, 'T-1', { status: 'review', attempts: 1 }, T2)
  b = rejectTask(b, 'T-1', 'the button should be blue', T2)
  expect(find(b, 'T-1')!.history.at(-1)).toEqual({ at: T2, kind: 'rejected', text: 'try 1: rejected by the owner: the button should be blue' })
  // every saved kind is one of the list in hooks/core/history.ts
  expect(find(b, 'T-1')!.history.every(h => h.kind in HISTORY_KINDS)).toBe(true)
})

const OLD_TASK = {
  id: 'T-1', title: 'old', details: '', files: [], status: 'failed', note: '', question: null, order: 1, after: [], attempts: 2, branch: null,
  created_at: '2026-11-01T08:00:00.000Z', updated_at: '2026-11-02T09:00:00.000Z', merge_into: 'main', origin: { by: 'owner', why: 'x', at: '2026-11-01T08:00:00.000Z' },
  runs: [{ started: '2026-11-01T09:00:00.000Z', ended: '2026-11-01T09:20:00.000Z' }, { started: '2026-11-02T08:00:00.000Z' }],
  history: [
    'created by the owner because x',
    'try 1: did it → tests failed: `bun test` (exit 1)',
    'the lead added a note: “the earlier try failed”',
    'waits on changed: nothing → T-2',
    'try 2: worker asked: which one?',
  ],
}

test('an old board with string history converts once: kinds guessed from the text, times from the tries', () => {
  const r = readOld(JSON.stringify({ version: 1, next_id: 2, tasks: [OLD_TASK] }))
  expect(r.fixed).toEqual([])
  expect(r.board.tasks[0]!.history).toEqual([
    { at: '2026-11-01T08:00:00.000Z', kind: 'created', text: 'created by the owner because x' },
    { at: '2026-11-01T09:20:00.000Z', kind: 'failed', text: 'try 1: did it → tests failed: `bun test` (exit 1)' },
    { kind: 'note', text: 'the lead added a note: “the earlier try failed”' },
    { kind: 'waits-changed', text: 'waits on changed: nothing → T-2' },
    // try 2 has not ended: its start
    { at: '2026-11-02T08:00:00.000Z', kind: 'asked', text: 'try 2: worker asked: which one?' },
  ])
  // once saved, nothing more to convert
  expect(stillOld(r.board)).toBe(false)
  // the health check, stats and the text board still read it
  expect(afterChanges(r.board.tasks[0]!)).toBe(1)
  expect(statsReport({ tasks: r.board.tasks, nowMs: Date.parse(T), full: true })).toContain('Failed tries')
  // an entry with no time shows none; one with a time shows it first
  const text = taskText(r.board.tasks[0]!, false)
  expect(text).toContain('  • the lead added a note: “the earlier try failed”')
  expect(text).toContain(`  • ${historyTime('2026-11-01T09:20:00.000Z')}  try 1: did it → tests failed`)
})

test('an old archive converts the same way, once, and its stats still count', () => {
  const merged = { ...OLD_TASK, id: 'T-5', status: 'done', history: ['created by the lead because y', 'try 1: done it → merged into main (abc1234)'] }
  const a = readArchive(JSON.stringify({ version: 1, tasks: [upgradeArchiveTask(merged)] }))
  expect(a.archive.tasks[0]!.history).toEqual([
    { at: '2026-11-01T08:00:00.000Z', kind: 'created', text: 'created by the lead because y' },
    { at: '2026-11-01T09:20:00.000Z', kind: 'merged', text: 'try 1: done it → merged into main (abc1234)' },
  ])
  expect(mergedHow(a.archive.tasks[0]!)).toBe('own')
  expect(upgradeArchiveTask(a.archive.tasks[0]! as never)).toBe(null)
})

test('the old-line guess: a kind for each kind of line symcc wrote, and records already converted are left alone', () => {
  expect(guessHistoryKind('try 1: checker: OK')).toBe('checker-ok')
  expect(guessHistoryKind('try 1: checker gave no verdict (it was stopped)')).toBe('checker')
  expect(guessHistoryKind('try 3: restarted: the task was changed (details)')).toBe('restarted')
  expect(guessHistoryKind('try 1: ran 45 min, over its time limit; asked the owner for more time')).toBe('out-of-time')
  expect(guessHistoryKind('merged outside the board (e1e1e1e1); marked done by the lead')).toBe('merged')
  expect(guessHistoryKind('moved from the backlog to todo')).toBe('moved-backlog')
  expect(guessHistoryKind('resumed after a pause')).toBe('resumed')
  expect(guessHistoryKind('something odd')).toBe('other')
  expect(oldHistoryEntry('try 9: x → merged into main', { runs: [] })).toEqual({ kind: 'merged', text: 'try 9: x → merged into main' })
  expect(migrateHistory({ history: [historyEntry('note', 'n', T)] })).toBe(null)
  expect(migrateHistory({ history: [{ kind: 'gone-kind', text: 'n', at: T }] })).toEqual([{ kind: 'other', text: 'n', at: T }])
  // a bad entry (no text) is still dropped and named
  const r = readBoard(JSON.stringify({ version: 1, tasks: [{ ...OLD_TASK, history: [{ kind: 'note' }, { kind: 'note', text: 'ok' }] }] }))
  expect(r.fixed).toEqual(['T-1: 1 bad history entry dropped'])
  expect(historyLineText({ kind: 'other', text: 'no time' })).toBe('no time')
})

test('a damaged archive.json history (null, a number, a record without text) loads, the bad entries dropped', () => {
  const a = readArchive(JSON.stringify({ version: 1, tasks: [upgradeArchiveTask({ ...OLD_TASK, status: 'done', history: [null, 5, { kind: 'note' }, 'created by the lead because x'] })] }))
  expect(a.broken).toBeUndefined()
  const t = a.archive.tasks[0]!
  expect(t.history.map(e => e.text)).toEqual(['created by the lead because x'])
  expect(taskText(t, false)).not.toContain('undefined')
  expect(migrateHistory({ history: [null] })).toEqual([])
})
