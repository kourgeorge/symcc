// T-774: each agent of a try (every worker and checker) keeps its own token count on the try's `agents` list, and the
// try's tokens are their sum. The task page's Runs part shows one dim line per agent under each try, and its heading
// sums the task's own tries (how many, the time, the tokens against the board's usual task, the checkers' share).
// Old tries (saved before the list, or past the last few) keep only their sums.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccRun, SymccTask } from '../types'
import { type Board, addTask, emptyBoard, patchTask, find, parseBoard } from '../hooks/board'
import { AGENT_TRIES_KEPT, AGENTS_KEPT, agentLines, checkerTokensOf, endRun, goOnRun, keepAgentIds, runsSummary, startRun, sumRuns, tokenCount, withAgentUsed, withEnd } from '../hooks/core/runs'
import { taskSections, type TaskSection } from '../hooks/core/task-sections'
import { todayMore } from '../hooks/core/live'
import { when } from '../hooks/core/days'

const NOW = Date.now()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const MIN = 60_000
const W1 = 'ses_worker_one_Qr2'
const W2 = 'ses_worker_two_Zx9'
const C1 = 'a01a5f7e9c3b'
const C2 = 'b02b6e8d0a4c'

/** A board with task T-1 "doing" on try 1 (started 20 minutes ago), its worker W1 started then. */
function doing(): Board {
  const [b, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', details: 'd', files: ['src/'] }, iso(30 * MIN))
  const y = patchTask(b, t.id, { status: 'doing', attempts: 1, runs: startRun(undefined, iso(20 * MIN)) }, iso(20 * MIN))
  return patchTask(y, t.id, { agent: W1 }, iso(20 * MIN))
}
const runsOf = (b: Board) => find(b, 'T-1')!.runs!
/** What the worker's hand-back writes (as workerFinished does): its own entry, and the try ended with its tokens added. */
const workerHandsBack = (b: Board, id: string, at: string, tokens: SymccRun['tokens']) =>
  patchTask(b, 'T-1', { runs: endRun(withAgentUsed(runsOf(b), 'worker', id, at, { tokens }), at, { tokens }) }, at)
/** A checker started and ended (as checker.ts's markChecker and record do): named on the try, then its tokens on its entry and the try. */
function checkerRuns(b: Board, id: string, from: string, to: string, tokens: SymccRun['tokens']): Board {
  const y = patchTask(b, 'T-1', { checker: id }, from)
  const rs = runsOf(y)
  const last = rs.at(-1)!
  const added = [...rs.slice(0, -1), { ...last, tokens: { ...last.tokens, input: (last.tokens?.input ?? 0) + (tokens?.input ?? 0) } }]
  return patchTask(patchTask(y, 'T-1', { checker: undefined }, to), 'T-1', { runs: withAgentUsed(added, 'checker', id, to, { tokens }) }, to)
}

test('T-774: a try with a worker and two checkers (one stopped, one new) keeps three agent entries with their tokens, and its tokens are their sum', () => {
  let b = doing()
  b = workerHandsBack(b, W1, iso(9 * MIN), { input: 4_100_000 })
  b = checkerRuns(b, C1, iso(9 * MIN), iso(7 * MIN), { input: 500_000 })
  b = checkerRuns(b, C2, iso(7 * MIN), iso(4 * MIN), { input: 1_600_000 })
  const r = runsOf(b)[0]!
  expect(r.agents!.map(a => [a.kind, a.id, a.tokens])).toEqual([
    ['worker', W1, { input: 4_100_000 }],
    ['checker', C1, { input: 500_000 }],
    ['checker', C2, { input: 1_600_000 }],
  ])
  expect(r.agents!.map(a => [a.started, a.ended])).toEqual([[iso(20 * MIN), iso(9 * MIN)], [iso(9 * MIN), iso(7 * MIN)], [iso(7 * MIN), iso(4 * MIN)]])
  expect(tokenCount(r.tokens)).toBe(r.agents!.reduce((s, a) => s + tokenCount(a.tokens), 0))
  expect(tokenCount(r.tokens)).toBe(6_200_000)
  // the checkers' share is read from the entries' kinds
  expect(tokenCount(checkerTokensOf(r))).toBe(2_100_000)
  // and it all survives a save and a read back
  expect(parseBoard(JSON.stringify(b)).tasks[0]!.runs![0]!.agents).toEqual(r.agents)
})

test('T-774: a worker restarted after a reopen (the same try goes on) adds a second worker entry to that try', () => {
  let b = doing()
  // the app reopened: symcc restarts the worker itself, so the try goes on (T-743)
  const stopAt = iso(15 * MIN)
  b = patchTask(b, 'T-1', { status: 'todo', runs: withEnd(endRun(runsOf(b), stopAt), 'restarted', 'the app reopened') }, stopAt)
  const goOn = goOnRun(runsOf(b), iso(14 * MIN))!
  b = patchTask(b, 'T-1', { status: 'doing', runs: goOn }, iso(14 * MIN))
  b = patchTask(b, 'T-1', { agent: W2 }, iso(14 * MIN))
  b = workerHandsBack(b, W2, iso(5 * MIN), { input: 2_000_000, output: 10_000 })
  const rs = runsOf(b)
  expect(rs.length).toBe(1)
  expect(rs[0]!.agents!.map(a => [a.kind, a.id, a.started, a.ended])).toEqual([
    ['worker', W1, iso(20 * MIN), stopAt],
    ['worker', W2, iso(14 * MIN), iso(5 * MIN)],
  ])
  // the first worker gave no tokens (it was stopped, the host said none): the try's tokens are the second one's
  expect(rs[0]!.agents![0]!.tokens).toBeUndefined()
  expect(rs[0]!.tokens).toEqual({ input: 2_000_000, output: 10_000 })
})

const facts = (all: SymccTask[] = []) => ({ width: 100, nowMs: NOW, detail: { roles: [], all, when } })
const text = (s: TaskSection | undefined) => (s?.lines ?? []).map(l => l.segs.map(g => g.text).join(''))

test("T-774: the task page's Runs part shows one dim line per agent under its try", () => {
  let b = doing()
  b = workerHandsBack(b, W1, iso(9 * MIN), { input: 4_100_000 })
  b = checkerRuns(b, C1, iso(9 * MIN), iso(6 * MIN), { input: 2_100_000 })
  b = patchTask(b, 'T-1', { runs: withEnd(runsOf(b), 'finished', 'merged') }, iso(6 * MIN))
  const t = find(b, 'T-1')! as SymccTask
  const runs = taskSections(t, facts()).find(s => s.id === 'runs')!
  expect(text(runs)).toEqual([
    '  try 1: 11m · 6.2M tokens in all · finished: merged',
    '    ▸ worker  ses…Qr2  11m · 4.1M',
    '    ⌕ checker a01…c3b  3m · 2.1M',
    '  total: 11m · 6.2M tokens in all',
  ])
  expect(runs.lines[1]!.segs.every(g => g.color === 'inactive')).toBe(true)
  expect(agentLines(t.runs![0]!, NOW)).toEqual(['▸ worker  ses…Qr2  11m · 4.1M', '⌕ checker a01…c3b  3m · 2.1M'])
})

/** Task `id`, done or doing, with `runs`. */
const withRuns = (id: string, status: SymccTask['status'], runs: SymccRun[]): SymccTask =>
  ({ id, title: id, details: '', files: [], status, note: '', question: null, order: 1, after: [], attempts: runs.length, history: [], branch: null, created_at: iso(60 * MIN), updated_at: iso(MIN), runs }) as SymccTask

test("T-774: the Runs heading sums this task's own tries, with and without the board's usual figure", () => {
  // 3 tries: 7m each; the last one's checkers used 2.4M (from its entries), the first one's 0.3M (an older try, only checker_tokens)
  const runs: SymccRun[] = [
    { started: iso(60 * MIN), ended: iso(53 * MIN), tokens: { input: 3_000_000 }, checker_tokens: { input: 300_000 } },
    { started: iso(50 * MIN), ended: iso(43 * MIN), tokens: { input: 3_000_000 } },
    { started: iso(40 * MIN), ended: iso(33 * MIN), tokens: { input: 4_100_000 }, agents: [{ id: W1, kind: 'worker', started: iso(40 * MIN), ended: iso(36 * MIN), tokens: { input: 1_700_000 } }, { id: C1, kind: 'checker', started: iso(36 * MIN), ended: iso(33 * MIN), tokens: { input: 2_400_000 } }] },
  ]
  const t = withRuns('T-9', 'doing', runs)
  // no usual figure (no merged task on the board): no "× the usual" part
  const alone = taskSections(t, facts([t])).find(s => s.id === 'runs')!
  expect(alone.title).toBe('Runs   3 tries · 21m · 10.1M tokens · checkers 2.7M')
  expect(alone.summary).toBe('3 tries · 21m · 10.1M tokens · checkers 2.7M')
  // with merged tasks of 2.8M tokens each, the usual task: 10.1M is 3.6 times it
  const done = ['T-1', 'T-2', 'T-3'].map(id => withRuns(id, 'done', [{ started: iso(100 * MIN), ended: iso(90 * MIN), tokens: { input: 2_800_000 } }]))
  expect(taskSections(t, facts([...done, t])).find(s => s.id === 'runs')!.title).toBe('Runs   3 tries · 21m · 10.1M tokens (3.6× the usual task) · checkers 2.7M')
  // no checker tokens known: that part is left out; one try says "try"
  expect(runsSummary([runs[1]!], NOW, 1_000_000)).toBe('1 try · 7m · 3M tokens (3× the usual task)')
  expect(runsSummary([{ started: iso(5 * MIN) }], NOW)).toBe('1 try · 5m')
  expect(runsSummary([], NOW)).toBe('')
})

test('T-774: a try saved before the agent list still shows and counts as before', () => {
  const old: SymccRun = { started: iso(30 * MIN), ended: iso(20 * MIN), tokens: { input: 900_000 }, checker_tokens: { input: 100_000 }, ended_by: 'finished', ended_note: 'merged' }
  const t = withRuns('T-8', 'done', [old])
  const runs = taskSections(t, facts()).find(s => s.id === 'runs')!
  expect(text(runs)).toEqual(['  try 1: 10m · 900k tokens in all · finished: merged', '  total: 10m · 900k tokens in all'])
  expect(agentLines(old)).toEqual([])
  expect(sumRuns([old]).tokens).toEqual({ input: 900_000 })
  // read from the file, it is kept as it is
  expect(keepAgentIds([old])).toEqual([old])
  // the Live tab's split (T-769) still reads its checker_tokens, and a try with entries reads their kinds
  expect(checkerTokensOf(old)).toEqual({ input: 100_000 })
  const today = todayMore([t], undefined, NOW - 20 * MIN + 1000)
  expect(today.who).toEqual([{ who: 'workers', tokens: 800_000 }, { who: 'checkers', tokens: 100_000 }])
  const listed: SymccRun = { ...old, checker_tokens: undefined, agents: [{ id: W1, kind: 'worker', started: old.started, ended: old.ended, tokens: { input: 600_000 } }, { id: C1, kind: 'checker', started: old.started, ended: old.ended, tokens: { input: 300_000 } }] }
  expect(todayMore([withRuns('T-8', 'done', [listed])], undefined, NOW - 20 * MIN + 1000).who).toEqual([{ who: 'workers', tokens: 600_000 }, { who: 'checkers', tokens: 300_000 }])
})

test('T-774: only the last few tries keep their agent list (older ones keep only their sums), and a try keeps only its latest agents', () => {
  const entry = (i: number) => ({ id: `c${i}`, kind: 'checker' as const, started: iso(10 * MIN), ended: iso(9 * MIN), tokens: { input: 10 } })
  const runs: SymccRun[] = Array.from({ length: AGENT_TRIES_KEPT + 2 }, (_, i) => ({ started: iso((50 - i) * MIN), ended: iso((49 - i) * MIN), tokens: { input: 100 + i }, agents: [entry(i)] }))
  const kept = keepAgentIds(runs)
  expect(kept.map(r => !!r.agents)).toEqual([false, false, ...Array(AGENT_TRIES_KEPT).fill(true)])
  // the old tries keep their sums
  expect(kept.map(r => r.tokens)).toEqual(runs.map(r => r.tokens))
  // a try with too many agents keeps the latest AGENTS_KEPT; bad entries are dropped
  const many: SymccRun = { started: iso(10 * MIN), agents: [...Array.from({ length: AGENTS_KEPT + 3 }, (_, i) => entry(i)), { id: 'bad id', kind: 'worker', started: iso(MIN) }, { id: 'x', kind: 'scout', started: iso(MIN) } as never] }
  const one = keepAgentIds([many])[0]!
  expect(one.agents!.map(a => a.id)).toEqual(Array.from({ length: AGENTS_KEPT }, (_, i) => `c${i + 3}`))
  // a board file read back trims them too
  const [b0, t0] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'x', details: 'd' }, iso(MIN))
  const b = { ...b0, tasks: b0.tasks.map(t => (t.id === t0.id ? { ...t, runs } : t)) }
  expect(parseBoard(JSON.stringify(b)).tasks[0]!.runs!.map(r => !!r.agents)).toEqual([false, false, ...Array(AGENT_TRIES_KEPT).fill(true)])
})
