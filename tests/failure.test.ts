import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { whyFailed, failedHow, failNext, failAsks, rowExtra, boardText, emptyBoard, fitRow, outOfScopeText, outOfTimeNote, checkerOutput, type BoardTask } from '../hooks/board'

const T = '2026-11-18T10:00:00.000Z'
const failed = (over: Partial<SymccTask> = {}): BoardTask => ({ id: 'T-9', title: 'Fix it', details: '', files: ['src/a.ts'], status: 'failed', note: '', question: null, order: 9, after: [], attempts: 1, history: [], branch: null, created_at: T, updated_at: T, ...over })

// The notes and fields the plugin writes for each way a task fails (hooks/plugin/workers.ts, review.ts, checker.ts).
const CASES: [string, BoardTask, RegExp][] = [
  ['tests failed', failed({ note: 'tests failed: `npm test` (exit 1). boom', test_output: '$ npm test (exit 1)\nrunning 3 tests\nFAIL tests/a.test.ts > adds\nexpected 2, got 3\n' }), /^The tests failed \(`npm test`, exit 1\)\. First failing lines: FAIL tests\/a\.test\.ts > adds \| expected 2, got 3\.$/],
  ['checker problems', failed({ note: 'the checker found problems: the save button is never enabled', test_output: checkerOutput('The save button is never enabled.\nAlso no test.') }), /^The checker found problems with the work\. First problem: The save button is never enabled\.$/],
  ['out of scope', failed({ note: outOfScopeText(['src/b.ts', 'README.md'], ['src/a.ts'], true) }), /^The worker changed files outside the task's list: src\/b\.ts, README\.md, so nothing was merged\.$/],
  ['no change', failed({ note: 'the worker made no change', history: ['try 1: Found the cause: the cache key ignores the user. No code change needed; see below. → the worker made no change'] }), /^The worker finished without changing any files\. Its report says: Found the cause: the cache key ignores the user\. No code change needed; see below\.$/],
  ['ended without a result', failed({ note: 'the worker ended without a result' }), /^The worker ended without handing back a result/],
  ['timed out', failed({ note: outOfTimeNote(45), runs: [{ started: T, ended: T, ended_by: 'timed out', ended_note: 'ran over 45 min' }] }), /^It ran out of time \(over 45 min\) before it finished/],
  ['API error', failed({ note: "the worker's turn ended on an error (retries used up or the context limit)" }), /API error/],
  ['refusal', failed({ note: 'the model refused to go on (cyber: not allowed)' }), /^The model refused to go on \(cyber: not allowed\)\. Nothing was checked or merged\.$/],
  ["couldn't start", failed({ note: "couldn't start: no such agent type" }), /^The worker could not start: no such agent type\.$/],
  ['merge conflict', failed({ note: 'conflicts with the latest main, still after 2 tries to merge it in' }), /^Its work clashes with the latest main/],
  ['stopped', failed({ note: 'the worker was stopped' }), /^The worker was stopped before it finished\.$/],
]

test('a failed task: one plain sentence says why, for every way a task can fail', () => {
  for (const [, t, want] of CASES) expect(whyFailed(t)).toMatch(want)
  // each case is told apart, and each has its own next step naming the page's buttons
  expect(new Set(CASES.map(([, t]) => failedHow(t))).size).toBe(CASES.length)
  for (const [, t] of CASES) expect(failNext(t)).toMatch(/Retry/)
  expect(failNext(CASES[3]![1])).toBe('Read the report below; Retry if it should try again, change the task if it needs a clearer plan, or Drop it.')
  expect(whyFailed(failed({ note: 'something new' }))).toBe('It failed: something new.')
})

test("a failed task's board row and the lead's text board use the same sentence as its page", () => {
  for (const [, t] of CASES) {
    const why = whyFailed(t)
    expect(rowExtra(t, [t])).toBe(why)
    expect(boardText({ ...emptyBoard(), tasks: [t] }, Date.parse(T))).toContain(`T-9   failed  Fix it — ${why}`)
  }
  // a narrow row cuts the reason to fit instead of leaving it out
  const fit = fitRow(20, 'Fix it', whyFailed(CASES[3]![1]), 60, true)
  expect(fit.extra).toMatch(/^The worker finished.*…$/)
  expect(fit.title.length + fit.pad.length + fit.extra.length).toBe(40)
  expect(fitRow(20, 'Fix it', whyFailed(CASES[3]![1]), 60).extra).toBe('')
})

test("the worker's report asking for files or a question is pointed out", () => {
  expect(failAsks('I could not finish.\nNEED FILES: src/b.ts, src/c.ts\n')).toBe('The worker asks for more files: src/b.ts, src/c.ts. Add them to the task with change, then Retry.')
  expect(failAsks('Found two ways.\nShould I keep the old flag?\n')).toBe("The worker's report asks: Should I keep the old flag? Answer it by changing the task, then Retry.")
  expect(failAsks('All done, nothing to ask.')).toBe('')
  expect(failAsks(null)).toBe('')
})

test('the "try N (role X):" label is left out of the report quote, like "try N:"', () => {
  expect(whyFailed(failed({ note: 'the worker made no change', history: ['try 2 (role tester): Found the cause. → the worker made no change'] })))
    .toBe('The worker finished without changing any files. Its report says: Found the cause.')
})

test('a report that only mentions NEED FILES or asks an early question gives no false alarm', () => {
  expect(failAsks('Fixed the parser so a `NEED FILES:` line is only read at the start of a line.')).toBe('')
  expect(failAsks('I checked it.\nneed files: a.ts\nAll good.')).toBe('')
  expect(failAsks('  NEED FILES: src/x.ts')).toBe('The worker asks for more files: src/x.ts. Add them to the task with change, then Retry.')
  expect(failAsks('Done.\nStatus:   ◆ ready for review · added ? · changed ?\n')).toBe('')
  expect(failAsks('Why does it fail?\nThe cache was stale.\nI cleared it in load().\nTests pass now.\nAll done.')).toBe('')
})
