import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { whyFailed, failedHow, failingLines, failCount, testTail, failBlocks, failedTestsHead, TEST_OUTPUT_CHARS, FAIL_BLOCK_CHARS, FAIL_ERROR_LINES, errorLines, firstProblem, failNext, failAsks, rowExtra, boardText, emptyBoard, fitRow, outOfScopeText, outOfTimeNote, checkerOutput, FAIL_LINES_SHOWN, FAIL_LINES_CHARS, moreFailingLine, testOutputHeading, gaveUpTestsText, endedEarly, endedEarlyLine, endedEarlyNote, ENDED_EARLY_NOTE, type BoardTask } from '../hooks/board'
import { hist } from './history-fixture'

const T = '2026-11-18T10:00:00.000Z'
const failed = (over: Partial<SymccTask> = {}): BoardTask => ({ id: 'T-9', title: 'Fix it', details: '', files: ['src/a.ts'], status: 'failed', note: '', order: 9, after: [], attempts: 1, history: [], branch: null, created_at: T, updated_at: T, ...over })

// The notes and fields the plugin writes for each way a task fails (hooks/plugin/workers.ts, review.ts, checker.ts).
const CASES: [string, BoardTask, RegExp][] = [
  ['tests failed', failed({ note: 'tests failed: `npm test` (exit 1). boom', test_output: '$ npm test (exit 1)\n(pass) a guard refuses when it fails [1ms]\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 3\n\n      at <anonymous> (tests/a.test.ts:4:3)\n(fail) adds numbers [1.0ms]\n' }), /^The tests failed \(`npm test`, exit 1\)\. Failing test: \(fail\) adds numbers \| error: expect\(received\)\.toBe\(expected\) \| Expected: 2\.$/],
  ['checker problems', failed({ note: 'the checker found problems: the save button is never enabled', test_output: checkerOutput('The save button is never enabled.\nAlso no test.') }), /^The checker found problems with the work\. First problem: The save button is never enabled\.$/],
  ['out of scope', failed({ note: outOfScopeText(['src/b.ts', 'README.md'], ['src/a.ts'], true) }), /^The worker changed files outside the task's list: src\/b\.ts, README\.md, so nothing was merged\.$/],
  ['no change', failed({ note: 'the worker made no change', history: hist('try 1: Found the cause: the cache key ignores the user. No code change needed; see below. → the worker made no change') }), /^The worker finished without changing any files\. Its report says: Found the cause: the cache key ignores the user\. No code change needed; see below\.$/],
  ['ended without a result', failed({ note: 'the worker ended without a result' }), /^The worker ended without handing back a result/],
  ['timed out', failed({ note: outOfTimeNote(45), runs: [{ started: T, ended: T, ended_by: 'timed out', ended_note: 'ran over 45 min' }] }), /^It ran out of time \(over 45 min\) before it finished/],
  ['API error', failed({ note: "the worker's turn ended on an error (retries used up or the context limit)" }), /API error/],
  ['refusal', failed({ note: 'the model refused to go on (cyber: not allowed)' }), /^The model refused to go on \(cyber: not allowed\)\. Nothing was checked or merged\.$/],
  ["couldn't start", failed({ note: "couldn't start: no such agent type" }), /^The worker could not start: no such agent type\.$/],
  ['merge conflict', failed({ note: 'conflicts with the latest main, still after 2 tries to merge it in' }), /^Its work clashes with the latest main/],
  ['stopped', failed({ note: 'the worker was stopped' }), /^The worker was stopped before it finished\.$/],
  ['ended early', failed({ note: ENDED_EARLY_NOTE }), /^The worker ended its turn before its work finished/],
  ['merge turn ran over (T-549)', failed({ note: 'its checking and merging ran over 15 min and was stopped; nothing was merged (after 2 automatic retries)', runs: [{ started: T, ended: T, ended_by: 'stopped', ended_note: 'its checking and merging ran over 15 min and was stopped' }] }), /^Checking and merging its work ran over its time limit and was stopped, with no automatic retries left/],
]

test('a failed task: one plain sentence says why, for every way a task can fail', () => {
  for (const [, t, want] of CASES) expect(whyFailed(t)).toMatch(want)
  // each case is told apart, and each has its own next step naming the page's buttons
  expect(new Set(CASES.map(([, t]) => failedHow(t))).size).toBe(CASES.length)
  for (const [, t] of CASES) expect(failNext(t)).toMatch(/Retry/)
  expect(failNext(CASES[3]![1])).toBe('Read the report below; Retry if it should try again, ask the lead in the chat for a clearer plan, or Drop it.')
  expect(whyFailed(failed({ note: 'something new' }))).toBe('It failed: something new.')
})

test("a failed task's board row and the lead's text board use the same sentence as its page", () => {
  for (const [, t] of CASES) {
    const why = whyFailed(t)
    expect(rowExtra(t, [t])).toBe(why)
    expect(boardText({ ...emptyBoard(), tasks: [t] }, Date.parse(T))).toContain(`T-9   ✗ failed  Fix it — ${why}`)
  }
  // a narrow row cuts the reason to fit instead of leaving it out
  const fit = fitRow(20, 'Fix it', whyFailed(CASES[3]![1]), 60, true)
  expect(fit.extra).toMatch(/^The worker finished.*…$/)
  expect(fit.title.length + fit.pad.length + fit.extra.length).toBe(40)
  // without cutExtra a short whole title also keeps the start of the extra (T-696)
  expect(fitRow(20, 'Fix it', whyFailed(CASES[3]![1]), 60)).toEqual(fit)
  // too narrow for 12 columns of reason: the reason is still cut, down to 8 columns, then left out
  expect(fitRow(20, 'Fix it', whyFailed(CASES[3]![1]), 38, true).extra).toMatch(/^The worke…$/)
  expect(fitRow(20, 'Fix it', whyFailed(CASES[3]![1]), 33, true)).toEqual({ title: 'Fix it', pad: '', extra: '' })
})

test("the worker's report asking for files or a question is pointed out", () => {
  expect(failAsks('I could not finish.\nNEED FILES: src/b.ts, src/c.ts\n')).toBe('The worker asks for more files: src/b.ts, src/c.ts. Ask the lead in the chat to add them to the task, then Retry.')
  expect(failAsks('Found two ways.\nShould I keep the old flag?\n')).toBe("The worker's report asks: Should I keep the old flag? Answer it in the chat so the lead adds it to the task, then Retry.")
  expect(failAsks('All done, nothing to ask.')).toBe('')
  expect(failAsks(null)).toBe('')
})

test('the "try N (role X):" label is left out of the report quote, like "try N:"', () => {
  expect(whyFailed(failed({ note: 'the worker made no change', history: hist('try 2 (role tester): Found the cause. → the worker made no change') })))
    .toBe('The worker finished without changing any files. Its report says: Found the cause.')
})

test('a report that only mentions NEED FILES or asks an early question gives no false alarm', () => {
  expect(failAsks('Fixed the parser so a `NEED FILES:` line is only read at the start of a line.')).toBe('')
  expect(failAsks('I checked it.\nneed files: a.ts\nAll good.')).toBe('')
  expect(failAsks('  NEED FILES: src/x.ts')).toBe('The worker asks for more files: src/x.ts. Ask the lead in the chat to add them to the task, then Retry.')
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

// Shaped like `claude plugin test .` output: test results on stdout, a test's console printout on stderr, which
// review.ts puts after stdout; each "(fail)" line has its error indented right after it.
const runnerOutput = (failures: { at: number; name: string; error: string[] }[], passes = 900) => {
  const out = ['$ claude plugin test . (exit 1)', '']
  for (let i = 0; i < passes; i++) {
    if (i % 100 === 0) out.push('', `tests/file-${i / 100}.test.ts:`)
    out.push(`(pass) passing test number ${i} does what its name says [${(i % 7) + 1}.25ms]`)
    for (const f of failures.filter(f => f.at === i)) out.push(`(fail) ${f.name} [5001.00ms]`, ...f.error.map(e => `  ${e}`))
  }
  out.push('', ` ${passes} pass`, ` ${failures.length} fail`, `Ran ${passes + failures.length} tests across 9 files. [48.0s]`)
  out.push('', 'scouts list printout:', ...Array.from({ length: 60 }, (_, i) => `  scout-${i}  every 30 min  last ran 2026-11-18`))
  return out.join('\n')
}

test('kept test output: every "(fail)" line and its error survive when the output is very long', () => {
  const failures = [
    { at: 3, name: 'f opens the search; typing shows only matching tasks', error: ['Error: timed out after 5000 ms'] },
    { at: 450, name: 'a merged task ends done', error: ['AssertionError: expect(received).toBe()', '', 'Expected: "done"', 'Received: "todo"'] },
    { at: 800, name: 'the last test in the run', error: ['Error: boom'] },
  ]
  const full = runnerOutput(failures)
  expect(full.length).toBeGreaterThan(50_000)
  const kept = testTail(full)
  // the old cut (only the end) lost them all: the end is the count lines and the printout
  expect(full.slice(-TEST_OUTPUT_CHARS)).not.toContain('(fail)')
  for (const f of failures) {
    expect(kept).toContain(`(fail) ${f.name} [5001.00ms]`)
    for (const e of f.error.filter(Boolean)) expect(kept).toContain(`  ${e}`)
  }
  // the command line first, then the heading, then the failures with their test file, then the end
  const lines = kept.split('\n')
  expect(lines[0]).toBe('$ claude plugin test . (exit 1)')
  expect(lines[1]).toBe(failedTestsHead(3))
  expect(lines[2]).toBe('tests/file-0.test.ts:')
  expect(lines[3]).toBe('(fail) f opens the search; typing shows only matching tasks [5001.00ms]')
  expect(kept).toContain('tests/file-4.test.ts:\n(fail) a merged task ends done')
  expect(kept.endsWith(full.slice(-TEST_OUTPUT_CHARS))).toBe(true)
  expect(kept).toContain(' 3 fail')
  // a passing test is never taken as a failure, and the error stops at the next test
  expect(kept).not.toContain('passing test number 4 ')
  expect(failBlocks(full)[1]).toBe('tests/file-4.test.ts:\n(fail) a merged task ends done [5001.00ms]\n  AssertionError: expect(received).toBe()\n\n  Expected: "done"\n  Received: "todo"')
  // the task page and the lead's board name them, counting each once (the kept output can show one twice)
  expect(failCount(kept)).toBe(3)
  expect(whyFailed(failed({ note: 'tests failed: `claude plugin test .` (exit 1)', test_output: kept })))
    .toBe('The tests failed (`claude plugin test .`, exit 1). 3 failing tests: (fail) f opens the search; typing shows only matching tasks | Error: timed out after 5000 ms; (fail) a merged task ends done; (fail) the last test in the run.')
})

test('kept test output: short output is kept whole, and long output with no failure keeps only its end', () => {
  const short = '$ claude plugin test . (exit 1)\n\ntests/a.test.ts:\n(pass) a [1ms]\n(fail) x [2ms]\n  Error: y\n\n 1 pass\n 1 fail\n'
  expect(short.length).toBeLessThan(TEST_OUTPUT_CHARS)
  expect(testTail(short)).toBe(short.trim())
  const typecheck = '$ sh scripts/typecheck.sh (exit 1)\n' + 'hooks/a.ts(1,1): error TS2322: nope\n'.repeat(400)
  const kept = testTail(typecheck)
  expect(kept).toBe('…' + typecheck.trim().slice(-TEST_OUTPUT_CHARS))
  expect(testTail('')).toBe('')
})

test('kept test output: a huge error is cut to its first lines, and past the room for errors only the "(fail)" lines stay', () => {
  const long = Array.from({ length: 200 }, (_, i) => `diff line ${i} ${'y'.repeat(400)}`)
  const many = Array.from({ length: 40 }, (_, i) => ({ at: 10 + i * 20, name: `broken test ${i}`, error: [`Error: wrong ${i}`, ...long] }))
  const kept = testTail(runnerOutput(many))
  // the first one with its error, then the next FAIL_LINES_SHOWN as short lines, then only a count of the rest
  for (let i = 0; i <= FAIL_LINES_SHOWN; i++) expect(kept).toContain(`(fail) broken test ${i} [5001.00ms]`)
  expect(kept).not.toContain(`(fail) broken test ${FAIL_LINES_SHOWN + 1} [`)
  expect(kept).toContain(moreFailingLine(40 - 1 - FAIL_LINES_SHOWN))
  expect(failCount(kept)).toBe(40)
  expect(kept).toContain('  Error: wrong 0')
  expect(kept).toContain(`  … (${long.length + 1 - FAIL_ERROR_LINES} more error lines)`)
  expect(kept).not.toContain('Error: wrong 39')
  expect(kept).not.toContain('diff line 150')
  // no line is longer than 300 characters, and the whole stays near its two limits
  expect(Math.max(...kept.split('\n').map(l => l.length))).toBeLessThanOrEqual(300)
  expect(kept.length).toBeLessThan(FAIL_BLOCK_CHARS + TEST_OUTPUT_CHARS + 40 * 120)
})

test('kept test output: 400 failing tests stay under a fixed size, with "… and N more failing tests" and the right total', () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ at: Math.floor(i * 2.2), name: `a shared helper broke test number ${i} of the board panel`, error: [`Error: helper threw on call ${i}`, '  at helper (hooks/core/x.ts:1:1)'] }))
  const full = runnerOutput(many)
  const kept = testTail(full)
  expect(kept.length).toBeLessThan(FAIL_BLOCK_CHARS + TEST_OUTPUT_CHARS + FAIL_LINES_CHARS)
  const lines = kept.split('\n')
  expect(lines[1]).toBe(failedTestsHead(400))
  const shown = lines.filter(l => l.startsWith('(fail)')).length
  const withError = failBlocks(kept.slice(0, kept.indexOf('… and '))).filter(b => b.includes('Error:')).length
  expect(withError).toBeGreaterThan(0)
  expect(kept).toContain(moreFailingLine(400 - withError - FAIL_LINES_SHOWN))
  expect(shown).toBeLessThanOrEqual(withError + FAIL_LINES_SHOWN + 5)
  // the real total, from the heading (and the runner's " 400 fail" line), not only the lines kept
  expect(failCount(kept)).toBe(400)
  expect(failingLines(kept, 2)).toContain('(and 398 more)')
  expect(whyFailed(failed({ note: 'tests failed: `claude plugin test .` (exit 1)', test_output: kept }))).toContain('400 failing tests: ')
  // the next worker is told what it gets: the failing tests, then the end
  expect(testOutputHeading(kept)).toBe('The failing tests and the end of the test output:')
  expect(testOutputHeading('…the end only')).toBe('The end of the test output:')
  expect(testOutputHeading('$ npm test (exit 1)\nall of it')).toBe('The test output:')
  // the lead's give-up text is short: the count, the first failing tests with their errors, how many more, where the rest is
  const lead = gaveUpTestsText(kept)
  expect(lead.length).toBeLessThan(2000)
  expect(lead.startsWith('400 failing tests, the first 3:\ntests/file-0.test.ts:\n(fail) a shared helper broke test number 0 of the board panel [5001.00ms]\n  Error: helper threw on call 0')).toBe(true)
  expect(lead).toContain(moreFailingLine(397))
  expect(lead).toContain("on the task's page")
  // output with no "(fail)" line gives its first errors
  expect(gaveUpTestsText('$ sh scripts/typecheck.sh (exit 1)\nhooks/a.ts(1,1): error TS2322: nope')).toContain('First errors: hooks/a.ts(1,1): error TS2322: nope')
})

test('kept test output: plain bun output, with the error printed above "(fail)", keeps that error too', () => {
  const bun = ['$ bun test (exit 1)', 'tests/a.test.ts:', '(pass) ok one [1ms]', '1 | import { test } from "bun:test"', '3 | test("bad one", () => { expect(1).toBe(2) })', '                                  ^',
    'error: expect(received).toBe(expected)', '', 'Expected: 2', 'Received: 1', '', '      at <anonymous> (/x/tests/a.test.ts:3:35)', '(fail) bad one [0.84ms]', '(fail) slow one [51.28ms]', '  ^ this test timed out after 50ms.',
    ...Array.from({ length: 200 }, (_, i) => `(pass) filler ${i} ${'z'.repeat(40)}`), '', ' 200 pass', ' 2 fail'].join('\n')
  const blocks = failBlocks(bun)
  expect(blocks).toEqual([
    'tests/a.test.ts:\nerror: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 1\n\n      at <anonymous> (/x/tests/a.test.ts:3:35)\n(fail) bad one [0.84ms]',
    '(fail) slow one [51.28ms]\n  ^ this test timed out after 50ms.',
  ])
  expect(testTail(bun)).toContain(blocks.join('\n'))
  expect(failingLines(testTail(bun), 3)).toBe('(fail) bad one | error: expect(received).toBe(expected) | Expected: 2; (fail) slow one')
})

test('kept test output: two failures in a row with "Error:" lines each keep only their own error', () => {
  const out = '(fail) zz throws [0.81ms]\n  Error: boom here\n  second line\n(fail) next [1ms]\n  Error: x\n'
  expect(failBlocks(out)).toEqual(['(fail) zz throws [0.81ms]\n  Error: boom here\n  second line', '(fail) next [1ms]\n  Error: x'])
  // the same inside a test file, with a passing test between the failures
  const filed = 'tests/a.test.ts:\n(fail) one [1ms]\n  Error: first\n(pass) fine [1ms]\n(fail) two [1ms]\n  Error: second\n'
  expect(failBlocks(filed)).toEqual(['tests/a.test.ts:\n(fail) one [1ms]\n  Error: first', '(fail) two [1ms]\n  Error: second'])
})

test('plain bun output: a named error such as "TypeError:" or "RangeError:" above "(fail)" is kept as its error', () => {
  const bun = ['$ bun test (exit 1)', 'tests/t.test.ts:', '1 | test("t", () => { const o: any = undefined; o.x.y })', '                                                  ^',
    'TypeError: undefined is not an object (evaluating \'o.x\')', '      at <anonymous> (/x/tests/t.test.ts:1:51)', '(fail) t [0.50ms]',
    '1 | test("r", () => { new Array(-1) })', 'RangeError: Array size must be a positive integer', '(fail) r [0.20ms]', '', ' 0 pass', ' 2 fail'].join('\n')
  expect(failBlocks(bun)).toEqual([
    'tests/t.test.ts:\nTypeError: undefined is not an object (evaluating \'o.x\')\n      at <anonymous> (/x/tests/t.test.ts:1:51)\n(fail) t [0.50ms]',
    'RangeError: Array size must be a positive integer\n(fail) r [0.20ms]',
  ])
  expect(failingLines(bun, 2)).toBe('(fail) t | TypeError: undefined is not an object (evaluating \'o.x\'); (fail) r')
})

test('failing tests with the same name in two test files both count, and a failure shown twice still counts once', () => {
  // shaped like real `claude plugin test` output where tests/a.test.ts and tests/b.test.ts both fail "same"
  const out = [
    '$ claude plugin test . (exit 1)', '', 'tests/a.test.ts:', '(fail) same [1.00ms]', '  Error: a broke', '(fail) only in a [1.00ms]', '  Error: a2',
    '', 'tests/b.test.ts:', '(pass) fine [1.00ms]', '(fail) same [2.00ms]', '  Error: b broke', '(fail) only in b [1.00ms]', '  Error: b2',
    '(fail) last [1.00ms]', '  Error: b3', ...Array.from({ length: 300 }, (_, i) => `(pass) filler ${i} ${'z'.repeat(40)}`),
    '', ' 300 pass', ' 5 fail', 'Ran 305 tests across 2 files. [1.0s]',
  ].join('\n')
  expect(failCount(out)).toBe(5)
  expect(failingLines(out, 3)).toBe('(fail) same | Error: a broke; (fail) only in a; (fail) same (and 2 more)')
  const why = whyFailed(failed({ note: 'tests failed: `claude plugin test .` (exit 1)', test_output: out }))
  expect(why).toContain('5 failing tests: ')
  expect(why).toContain('(and 2 more)')
  // the kept output shows them up front, each with its file; the count and the heading agree
  const kept = testTail(out)
  expect(kept.split('\n')[1]).toBe(failedTestsHead(5))
  expect(failCount(kept)).toBe(5)
  // the same test shown again in the cut end (its file line cut off, or in a runner's repeat list) counts once
  expect(failCount(kept + '\n…ts:\n(fail) same [2.00ms]\n(fail) last [1.00ms]')).toBe(5)
  expect(failCount(out + '\n\n2 tests failed:\n(fail) same [1.00ms]\n(fail) only in b [1.00ms]')).toBe(5)
  expect(failCount(kept + '\n…tests/b.test.ts:\n(fail) only in b [1.00ms]')).toBe(5)
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

test("a long checker report that quotes a \"(fail)\" line is cut plainly, with no failed-tests heading as its first problem", () => {
  const report = ['Problems:', '- tests/x.test.ts:12 fails:', '(fail) something [1ms]', '  Error: bad', ...Array.from({ length: 100 }, (_, i) => `detail line ${i} ${'q'.repeat(40)}`)].join('\n')
  const kept = checkerOutput(report)
  expect(kept).not.toContain(failedTestsHead(1))
  expect(kept).toEndWith(`detail line 99 ${'q'.repeat(40)}`)
  expect(kept.length).toBeLessThanOrEqual('The checker found these problems:\n…'.length + TEST_OUTPUT_CHARS)
  expect(firstProblem(kept)).not.toContain('failed test')
  // a short report is kept whole
  expect(checkerOutput('Problems:\n(fail) a [1ms]\n  Error: x')).toBe('The checker found these problems:\nProblems:\n(fail) a [1ms]\n  Error: x')
})

test("the checker's first problem: symcc's own comma format, numbered and bold lines, never a 'What passed' line", () => {
  const comma = 'I found one real problem.\n\nWhat passed:\n- The tests in tests/failure.test.ts pass.\n\nProblems:\nhooks/core/failure.ts:37, strips only "try N:"'
  expect(firstProblem(checkerOutput(comma))).toBe('hooks/core/failure.ts:37, strips only "try N:"')
  const numbered = 'One problem.\n\nWhat works:\n- tests/pane.test.tsx passes.\n\nProblems:\n1. hooks/x.ts:37 strips only the short label\n2. hooks/y.ts:9 bad'
  expect(firstProblem(checkerOutput(numbered))).toBe('hooks/x.ts:37 strips only the short label')
  const bold = 'One problem.\n\n**What passed:**\n- tests/a.test.ts passes\n\n**Problems:**\n- **hooks/a.ts:12** — bad'
  expect(firstProblem(checkerOutput(bold))).toBe('hooks/a.ts:12 — bad')
  // no "Problems:" heading: a "What passed" part is still skipped
  expect(firstProblem('Checked it.\nWhat passed:\n- tests/a.test.ts passes\nIssues:\n- hooks/b.ts:4, wrong count')).toBe('hooks/b.ts:4, wrong count')
})

test("the checker's first problem with no 'Problems:' heading and a long list is problem 1, not a later one", () => {
  const list = Array.from({ length: 10 }, (_, i) => `hooks/core/p${i + 1}.ts:${i + 1}, problem ${i + 1}`).join('\n')
  expect(firstProblem(checkerOutput(`I found ten problems with this work.\n\n${list}`))).toBe('hooks/core/p1.ts:1, problem 1')
  // a "What passed" part before the list is still skipped
  expect(firstProblem(`Ten problems.\nWhat passed:\n- tests/a.test.ts:3 passes\nThe rest:\n${list}`)).toBe('hooks/core/p1.ts:1, problem 1')

})

test("with no 'Problems:' heading, an intro line that only mentions files doesn't beat the real problem at the end", () => {
  const report = 'The checker found these problems:\nI read hooks/core/failure.ts and tests/failure.test.ts first.\n' + 'Step: looked around.\n'.repeat(9) + '- hooks/core/panel.ts misses r retry'
  expect(firstProblem(report)).toBe('hooks/core/panel.ts misses r retry')
})

test("a failed task's texts name the lead (who changes tasks), not the lead's change tool", () => {
  const asks = [failAsks('NEED FILES: src/b.ts'), failAsks('Should I keep the old flag?')]
  for (const text of [...CASES.map(([, t]) => failNext(t)), ...asks]) {
    expect(text).not.toMatch(/with change|changing the task|^change the task|, change the task/i)
  }
  for (const text of asks) expect(text).toContain('lead')
  expect(failNext(CASES.find(([, t]) => failedHow(t) === 'scope')![1])).toBe('Ask the lead in the chat to add those files to the task (or split it), then Retry; or Drop it.')
})

test("a failing command that isn't bun's test runner: its first error lines are quoted", () => {
  const out = '$ sh scripts/typecheck.sh (exit 2)\nhooks/a.ts(3,4): error TS2322: bad\n'
  expect(whyFailed(failed({ note: 'tests failed: `sh scripts/typecheck.sh` (exit 2). x', test_output: out })))
    .toBe('The tests failed (`sh scripts/typecheck.sh`, exit 2). First error: hooks/a.ts(3,4): error TS2322: bad.')
  expect(errorLines('$ x (exit 1)\nok line\nError: one\nFAIL two\nerror three')).toBe('Error: one | FAIL two')
})

test('a NEED FILES line that already ends in "." or "…" gets no second one', () => {
  expect(failAsks('NEED FILES: src/b.ts, because the tokens live there.')).toBe('The worker asks for more files: src/b.ts, because the tokens live there. Ask the lead in the chat to add them to the task, then Retry.')
  expect(failAsks(`NEED FILES: ${'a/b.ts '.repeat(40)}`)).toMatch(/… Ask the lead in the chat to add them to the task, then Retry\.$/)
})

// T-411: a final answer whose last paragraph says something still runs and the writer goes on when it finishes
// (T-399's try 1) reads as unfinished (only a warning note, see warnEndedEarly); normal reports, offers and quotes do not.
test('endedEarlyLine gives the sentence that counted; endedEarlyNote is the warning', () => {
  const s = "The background runs are still going; I'll continue when they finish."
  expect(endedEarlyLine(`Changed a.ts.\n\nStarted the tests. ${s}`)).toBe(s)
  expect(endedEarlyLine('Changed a.ts; tests/a.test.ts covers it.')).toBe('')
  // a fenced code block with a blank line in it is code, not the writer's words (checker's example): must not flag
  expect(endedEarlyLine("Changed it.\n\n```\nfoo\n\nbar still running; I'll continue when done\n```")).toBe('')
  // T-600: a closing "Learned:" section does not hide the warning
  const learned = '\n\nLearned:\n- Run one test with sh scripts/test-files.sh.\n- The guard refuses a new repo inside the project.'
  expect(endedEarlyLine(`Changed a.ts.\n\nStarted the tests. ${s}${learned}`)).toBe(s)
  expect(failAsks(`I changed a.ts.\nShould I also change b.ts?${learned}`)).toBe("The worker's report asks: Should I also change b.ts? Answer it in the chat so the lead adds it to the task, then Retry.")
  expect(endedEarlyNote('T-5', s)).toBe(`T-5's answer may have ended before its work finished: "${s}" (only a warning: its try goes on to the tests and merge as usual)`)
})

test('endedEarly: still running + the writer going on when it finishes counts; normal reports, offers and quotes do not', () => {
  const later = [
    "The background runs are still going; I'll continue when they finish.",
    // T-399's try 1, its real last paragraph: must flag
    "Changed the prompts and the check.\n\nThe background runs are still going; I'll continue when they finish.",
    'Changed hooks/a.ts and added a test.\n\nThe full test run is still running in the background; I will report back once it ends.',
    "The tests are still running and I'm waiting for them.",
  ]
  for (const a of later) expect([a, endedEarly(a)]).toEqual([a, true])
  const normal = [
    'Added the line to prompts/change.ts and a test in tests/prompts.test.tsx; `claude plugin test .` and typecheck pass.',
    '',
    // T-386's try 1, its real last paragraph (a bullet list): must not flag
    'Fixed the reload.\n\n- A checker still running at the reload is stopped. Its try is not counted.\n- When the stopped checker\'s "stopped" answer comes in, a new checker starts right away without waiting for a check.',
    'A checker still running at the reload is stopped. A new checker starts right away without waiting for a check.',
    'The checker is still running, so a new one starts without waiting for it.',
    'Changed the merge so a try still in progress makes the lead wait for it; tests/merge.test.ts covers it.',
    'A checker still running at the reload stops waiting for a verdict.',
    "A checker that is still running isn't waiting for the lead any more.",
    "The checker is still running when the merge starts, so I'll note it in the docs.",
    'Fixed it so the worker will report back its findings; tests/x.test.ts covers it.',
    // nothing still running: plain "I'll continue / resume / report back" is not enough
    "I'll resume once the typecheck is done.",
    'Will report back.',
    "I'll continue to keep the old name in the docs.\n\nChanged hooks/core/failure.ts; tests/failure.test.ts covers it.",
    // the checker's five sentences (offers and quotes): must not flag
    "Still unsure: whether the cache is shared. If you'd like, I'll come back to it in a follow-up task.",
    "If you want, I'll continue with the other files next.",
    'Let me continue with the summary: changed a.ts and b.ts.',
    'Changed the endedEarly check so "I\'ll report back" is caught; tests/failure.test.ts covers it.',
    'Added endedEarly, which flags answers like "The background runs are still going; I\'ll continue when they finish."',
    // the same in other quotes and code
    "Added endedEarly, which flags answers like `The background runs are still going; I'll continue when they finish.`",
    "Added endedEarly, which flags answers like “The tests are still running; I'll report back when they end.”",
    "Added endedEarly, which flags 'The tests are still running; I'll report back when they end.' answers.",
    // the checker's later false alarms: "waiting for" / "will" about a task or checker, not the writer
    'The scout found T-12 still in progress, waiting for files from T-9.',
    'A task still in progress: waiting for T-3 to merge first.',
    'Fixed the stall: a checker still running, waiting for the merge lock, now times out after 5 minutes; tests/checker.test.ts covers it.',
    'Answer: the lead sees the worker as still running; waiting for it is what blocks T-12 (hooks/plugin/workers.ts:640).',
    'Changed workers.ts so a try still running — will finish when its tests end — is not stopped.',
    // a hypothetical about the rule itself
    "If a command is still running, I'll now wait for it before I answer, as the prompt says.",
  ]
  for (const a of normal) expect([a, endedEarly(a)]).toEqual([a, false])
})
