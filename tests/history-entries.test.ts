// T-522: a task's history is a list of records { at, kind, text }, made through one helper (historyEntry / withHistory);
// an old board or archive with plain string lines is converted once on load (times guessed from the tries).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { addTask, afterChanges, emptyBoard, mergedHow, patchTask, promoteTask, readArchive, archiveText, readBoard, rejectTask, stashTask, statsReport, find, type Board } from '../hooks/board'
import { tryEntry, type HistoryAdd, type HistoryKind, HISTORY_KINDS, historyEntry, historyLineText, historyTime, notUsedEntry, resultEntry, stoppedEntry, withHistory, workerHandedBackEntry, workerStartedEntry } from '../hooks/core/history'
import { taskWasResult } from '../hooks/core/review'
import { oldDataRows, guessHistoryKind, migrateHistory, oldHistoryFacts, oldHistoryEntry, upgradeArchiveTask } from '../hooks/core/old-data'
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
  expect(find(b, 'T-1')!.history.at(-1)).toEqual({ at: T2, kind: 'moved-backlog', text: 'moved to the backlog (was todo): not clear yet', backlog: true })
  b = promoteTask(b, 'T-1', T2)
  b = patchTask(b, 'T-1', { status: 'review', attempts: 1 }, T2)
  b = rejectTask(b, 'T-1', 'the button should be blue', T2)
  expect(find(b, 'T-1')!.history.at(-1)).toEqual({ at: T2, kind: 'rejected', text: 'try 1: rejected by the owner: the button should be blue', try: 1, reason: 'rejected' })
  // every saved kind is one of the list in hooks/core/history.ts
  expect(find(b, 'T-1')!.history.every(h => h.kind in HISTORY_KINDS)).toBe(true)
})

const OLD_TASK = {
  id: 'T-1', title: 'old', details: '', files: [], status: 'failed', note: '', priority: 1, after: [], attempts: 2, branch: null,
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
    { at: '2026-11-01T09:20:00.000Z', kind: 'failed', text: 'try 1: did it → tests failed: `bun test` (exit 1)', try: 1, result: 'tests failed: `bun test` (exit 1)', reason: 'tests' },
    { kind: 'note', text: 'the lead added a note: “the earlier try failed”' },
    { kind: 'waits-changed', text: 'waits on changed: nothing → T-2' },
    // try 2 has not ended: its start
    { at: '2026-11-02T08:00:00.000Z', kind: 'asked', text: 'try 2: worker asked: which one?', try: 2 },
  ])
  // once saved, nothing more to convert
  expect(stillOld(r.board)).toBe(false)
  // the health check, stats and the text board still read it
  expect(afterChanges(r.board.tasks[0]!)).toBe(1)
  expect(statsReport({ tasks: r.board.tasks, nowMs: Date.parse(T), full: true })).toContain('Failed tries')
  // an entry with no time shows none; one with a time shows it first
  const text = taskText(r.board.tasks[0]!, false)
  expect(text).toContain('  • lead: the lead added a note: “the earlier try failed”')
  expect(text).toContain(`  • ${historyTime('2026-11-01T09:20:00.000Z')}  worker: try 1: did it → tests failed`)
})

test('an old archive converts the same way, once, and its stats still count', () => {
  const merged = { ...OLD_TASK, id: 'T-5', status: 'done', history: ['created by the lead because y', 'try 1: done it → merged into main (abc1234)'] }
  const a = readArchive(JSON.stringify({ version: 1, tasks: [upgradeArchiveTask(merged)] }))
  expect(a.archive.tasks[0]!.history).toEqual([
    { at: '2026-11-01T08:00:00.000Z', kind: 'created', text: 'created by the lead because y' },
    { at: '2026-11-01T09:20:00.000Z', kind: 'merged', text: 'try 1: done it → merged into main (abc1234)', try: 1, result: 'merged into main (abc1234)', how: 'own' },
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
  expect(oldHistoryEntry('try 9: x → merged into main', { runs: [] })).toEqual({ kind: 'merged', text: 'try 9: x → merged into main', try: 9, result: 'merged into main', how: 'own' })
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

test('T-806: the doctor fills the facts of old lines once (try, step, place, result, reason, how, owner, backlog) and renames the approved kind', () => {
  const lines: [HistoryKind, string][] = [
    ['stage', 'try 2: waits in the merge queue (place 3)'],
    ['stage', 'try 2: worker started (role tester)'],
    ['failed', 'try 1: did it → conflicts with the latest main'],
    ['merged', 'try 1: approved by the owner → merged into main (abc); approved by the owner'],
    ['merged', 'merged outside the board (abc1234); marked done by the lead'],
    ['stopped', 'try 1: stopped: the lead asked the owner a question'],
    ['moved-backlog', 'moved to the backlog (was todo)'],
    ['moved-backlog', 'moved from the backlog to todo'],
    ['note', 'the lead added a note: “try 2: x → tests failed”'],
  ]
  const old = [...lines.map(([kind, text]) => ({ at: T, kind, text })), { at: T, kind: 'approved', text: 'try 1: approved by the owner → not merged, the tests failed after your edits: x' }]
  const fixed = migrateHistory({ history: old })!
  expect(fixed.map(e => [e.kind, e.try, e.step, e.place, e.result, e.reason, e.how, e.owner, e.backlog])).toEqual([
    ['stage', 2, 'queue', 3, undefined, undefined, undefined, undefined, undefined],
    ['stage', 2, 'worker-start', undefined, undefined, undefined, undefined, undefined, undefined],
    ['failed', 1, undefined, undefined, 'conflicts with the latest main', 'clash', undefined, undefined, undefined],
    ['merged', 1, undefined, undefined, 'merged into main (abc); approved by the owner', undefined, 'approved', undefined, undefined],
    ['merged', undefined, undefined, undefined, undefined, undefined, 'outside', undefined, undefined],
    ['stopped', 1, undefined, undefined, undefined, undefined, undefined, true, undefined],
    ['moved-backlog', undefined, undefined, undefined, undefined, undefined, undefined, undefined, true],
    ['moved-backlog', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    ['note', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    ['approve-failed', 1, undefined, undefined, 'not merged, the tests failed after your edits: x', undefined, undefined, undefined, undefined],
  ])
  // done once: nothing left to fill, and a fact already saved is never replaced
  expect(migrateHistory({ history: fixed })).toBe(null)
  expect(migrateHistory({ history: [{ at: T, kind: 'failed', text: 'try 1: x → tests failed: y', reason: 'clash' }] })).toBe(null)
})

test('T-806: the writers set the facts, and they match what the doctor reads out of the same lines', () => {
  const t = { attempts: 3, role: 'general' }
  const same = (e: HistoryAdd) => expect(Object.fromEntries(Object.entries(oldHistoryFacts({ kind: e[0], text: e[1] })).sort())).toEqual(Object.fromEntries(Object.entries(e[2] ?? {}).sort()))
  // stops and restarts: a plain stop is "stopped", a pause is on purpose, a change restart is "changed", the lead's question waits for the owner
  expect(stoppedEntry(t, 'stopped from Claude Code')[2]).toEqual({ try: 3, reason: 'stopped' })
  expect(stoppedEntry(t, 'paused by the owner')[2]).toEqual({ try: 3 })
  expect(stoppedEntry(t, 'restarted: the task was changed (details)')[2]).toEqual({ try: 3, reason: 'changed' })
  expect(stoppedEntry(t, 'restarted after Claude Code was reopened')[2]).toEqual({ try: 3 })
  expect(stoppedEntry(t, 'the lead asked the owner a question')[2]).toEqual({ try: 3, owner: true })
  for (const why of ['stopped from Claude Code', 'paused by the owner', 'restarted: the task was changed (details)', 'restarted after Claude Code was reopened', 'the lead asked the owner a question']) same(stoppedEntry(t, why))
  // a result line: its result is the words after the arrow, its reason is what the check found
  const r = resultEntry(t, 'failed', 'did it', 'tests failed: `npm test` (exit 1)', { reason: 'tests' })
  expect(r).toEqual(['failed', 'try 3: did it → tests failed: `npm test` (exit 1)', { try: 3, result: 'tests failed: `npm test` (exit 1)', reason: 'tests' }])
  same(r)
  same(resultEntry(t, 'merged', 'did it', 'merged into main (abc)', { how: 'own' }))
  same(workerStartedEntry({ ...t, history: [] }, true))
  same(workerHandedBackEntry(t))
  // a check that ended after its try was stopped keeps no "not merged" reason, and its result carries the note
  const notUsed = notUsedEntry(resultEntry(t, 'failed', 'did it', 'not merged: x', { reason: 'notmerged' }), 'the task was paused meanwhile')
  expect(notUsed[2]).toEqual({ try: 3, result: 'not merged: x (not used: the task was paused meanwhile)' })
  same(notUsed)
  // the result of a check that ended because the task was stopped on purpose is no "not merged"
  expect(taskWasResult('paused').reason).toBe(undefined)
  expect(taskWasResult('stopped because the board was paused').reason).toBe(undefined)
  expect(taskWasResult('sent to the owner').reason).toBe(undefined)
  expect(taskWasResult('stopped because the command line stopped waiting').reason).toBe('notmerged')
})

test('T-806: lines today\'s helpers wrote are never read as old text: no reason, not counted, no migration', () => {
  const t = { attempts: 2, role: 'general' }
  const lines: HistoryAdd[] = [
    tryEntry(t, 'asked', 'worker asked: why → tests failed?'),
    tryEntry(t, 'answered', 'answered: x → conflicts with the latest main'),
    resultEntry(t, 'try-result', 'summary → tests failed: x', 'checks passed'),
    notUsedEntry(resultEntry(t, 'failed', 'did it', 'not merged: x', { reason: 'notmerged' }), 'paused'),
  ]
  const history = lines.map(e => historyEntry(e[0], e[1], T, e[2]))
  expect(history.every(e => e.reason === undefined || e.reason === 'notmerged')).toBe(true)
  expect(history.slice(0, 2).map(e => e.reason)).toEqual([undefined, undefined])
  expect(migrateHistory({ history })).toBe(null)
  const rows = oldDataRows({ board: { tasks: [{ id: 'T-1', history }] }, archive: [], scouts: null, withRuns: new Set(), fieldGuide: false, orgMem: false } as Parameters<typeof oldDataRows>[0])
  expect(rows.find(r => r.text.startsWith('history entries without their facts'))?.n ?? 0).toBe(0)
  // an old line with the same words and no fact field at all is still old
  expect(migrateHistory({ history: [{ at: T, kind: 'failed', text: 'try 1: x → tests failed: y' }] })![0]!.reason).toBe('tests')
})
