import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { whyFailed, failedHow, failingLines, firstProblem, failNext, failAsks, rowExtra, boardText, emptyBoard, fitRow, outOfScopeText, outOfTimeNote, checkerOutput, type BoardTask } from '../hooks/board'

const T = '2026-11-18T10:00:00.000Z'
const failed = (over: Partial<SymccTask> = {}): BoardTask => ({ id: 'T-9', title: 'Fix it', details: '', files: ['src/a.ts'], status: 'failed', note: '', question: null, order: 9, after: [], attempts: 1, history: [], branch: null, created_at: T, updated_at: T, ...over })

// The notes and fields the plugin writes for each way a task fails (hooks/plugin/workers.ts, review.ts, checker.ts).
const CASES: [string, BoardTask, RegExp][] = [
  ['tests failed', failed({ note: 'tests failed: `npm test` (exit 1). boom', test_output: '$ npm test (exit 1)\n(pass) a guard refuses when it fails [1ms]\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 3\n\n      at <anonymous> (tests/a.test.ts:4:3)\n(fail) adds numbers [1.0ms]\n' }), /^The tests failed \(`npm test`, exit 1\)\. First failing test: \(fail\) adds numbers \| error: expect\(received\)\.toBe\(expected\) \| Expected: 2\.$/],
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

test('failing test lines: only "(fail)" lines and the error above each, never "(pass)" lines', () => {
  // the checker's example: passing test names with "fails" or "error" in them are not taken
  expect(failingLines('$ t (exit 1)\n(pass) a guard refuses when it fails [1ms]\n(pass) alpha\nerror: expect(received).toBe(expected)\n(fail) adds numbers'))
    .toBe('(fail) adds numbers | error: expect(received).toBe(expected)')
  // real-shaped bun output with two failures: the first is shown, the rest counted
  const bun = [
    '$ claude plugin test . (exit 1)', 'tests/a.test.ts:', '(pass) a turn that ended on an error or a refusal fails the task [2.10ms]',
    'error: expect(received).toBe(expected)', '', 'Expected: "done"', 'Received: "todo"', '', '      at <anonymous> (/x/tests/a.test.ts:9:5)',
    '(fail) a merged task ends done [3.00ms]', '(pass) beta', 'error: boom', '(fail) gamma', '', ' 937 pass', ' 2 fail', 'Ran 939 tests across 43 files. [9.1s]',
  ].join('\n')
  expect(failingLines(bun)).toBe('(fail) a merged task ends done | error: expect(received).toBe(expected) | Expected: "done" (and 1 more)')
  // output cut before any "(fail)" line (as for T-244): nothing guessed, and the sentence says so
  const cut = '$ claude plugin test . (exit 1)\n(pass) a refusal end fails the task [1ms]\n 935 pass\n 1 fail\nRan 936 tests across 43 files.'
  expect(failingLines(cut)).toBe('')
  expect(whyFailed(failed({ note: 'tests failed: `claude plugin test .` (exit 1)', test_output: cut })))
    .toBe("The tests failed (`claude plugin test .`, exit 1). The saved test output doesn't show which test failed.")
})

test("the checker's first problem is taken from its list of problems, not its opening line", () => {
  // shaped like T-386's report: an intro, details, then "Problems:" with an absolute worktree path
  const t386 = [
    'I found one real problem in T-386. Everything else I tried works.', '', '**What passed:**', '- The full `claude plugin test .` run passes.',
    '- **Where:** /Users/me/repo/.symcc/worktrees/T-386/hooks/plugin/workers.ts, lines 659-667 (`restartCheckers`).', '',
    'Problems:', '- /Users/me/repo/.symcc/worktrees/T-386/hooks/plugin/workers.ts:659-689 — `restartCheckers` starts a new checker for merged work.',
  ].join('\n')
  expect(firstProblem(checkerOutput(t386))).toBe('hooks/plugin/workers.ts:659-689 — `restartCheckers` starts a new checker for merged work.')
  expect(whyFailed(failed({ note: 'the checker found problems: x', test_output: checkerOutput(t386) })))
    .toBe('The checker found problems with the work. First problem: hooks/plugin/workers.ts:659-689 — `restartCheckers` starts a new checker for merged work.')
  // shaped like T-395's report: "Problem:" then a "path:line — …" line
  const t395 = [
    'I found one real problem in T-395. The tests (934 pass, 0 fail) and the typecheck both pass, and nothing else I tried broke.', '',
    'What I checked:', '- **Tests and typecheck:** I ran `claude plugin test .`.', '', 'Problem:',
    'hooks/core/settings.ts:197-198 — `archive_days` set to 0 means "never archive", but the heading shows `archive after 0 days`.',
  ].join('\n')
  expect(firstProblem(checkerOutput(t395))).toBe('hooks/core/settings.ts:197-198 — `archive_days` set to 0 means "never archive", but the heading shows `archive after 0 days`.')
  // no list: the first line naming a file; nothing at all: the first line
  expect(firstProblem('I found a problem.\nThe save in tests/a.test.ts never runs.\nAll else fine.')).toBe('The save in tests/a.test.ts never runs.')
  expect(firstProblem('The save button is never enabled.\nAlso no test.')).toBe('The save button is never enabled.')
})

test('a NEED FILES line that already ends in "." or "…" gets no second one', () => {
  expect(failAsks('NEED FILES: src/b.ts, because the tokens live there.')).toBe('The worker asks for more files: src/b.ts, because the tokens live there. Add them to the task with change, then Retry.')
  expect(failAsks(`NEED FILES: ${'a/b.ts '.repeat(40)}`)).toMatch(/… Add them to the task with change, then Retry\.$/)
})
