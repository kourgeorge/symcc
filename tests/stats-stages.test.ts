// T-719: /symcc-stats time per stage, totals next to averages, the "inside" window and the scout-linkage line.
import { expect, test } from 'claude-code/testing'
import type { SymccHistoryEntry, SymccTask } from '../types'
import { statsData, statsReport, stageFigures, taskStages, doneAtMs, unlinkedCount } from '../hooks/board'
import { statsHtml } from '../hooks/core/stats-html'
import { hist } from './history-fixture'

const NOW = Date.now()
const MIN = 60_000
/** The ISO time `min` minutes ago. */
const at = (min: number) => new Date(NOW - min * MIN).toISOString()
const h = (min: number, kind: string, text: string): SymccHistoryEntry => ({ at: at(min), kind, text })
const stage = (min: number, n: number, words: string) => h(min, 'stage', `try ${n}: ${words}`)

function task(id: string, over: Partial<SymccTask>): SymccTask {
  return { id, title: `task ${id}`, details: '', files: [], status: 'done', note: '', question: null, order: 0, after: [], attempts: 1, history: [], branch: null, created_at: at(600), updated_at: at(0), ...over }
}

/** Made 600m ago; works 590..560; prep 2m, check 8m, queue 5m, tests 5m, merge 2m; merged 538m ago (lifetime 62m). */
const plain = () => task('T-1', {
  created_at: at(600),
  runs: [{ started: at(590), ended: at(560), tokens: { input: 1000 } }],
  history: [h(600, 'created', 'created by the owner'), stage(560, 1, 'prep started'), stage(558, 1, 'checker started'), h(550, 'checker-ok', 'try 1: checker: OK'), stage(550, 1, 'waits in the merge queue (place 1)'), stage(545, 1, 'tests started'), stage(540, 1, 'merge started'), h(538, 'merged', 'try 1: did it → merged into main (abc)')],
})

/** Made 600m ago, waits on T-1 (done 538m ago): 62m waiting on it, then 8m to start; lifetime 111m. */
const waiter = () => task('T-2', {
  created_at: at(600),
  after: ['T-1'],
  runs: [{ started: at(530), ended: at(500), tokens: { input: 3000 } }],
  history: [h(600, 'created', 'created by the lead'), stage(500, 1, 'prep started'), stage(499, 1, 'checker started'), stage(495, 1, 'waits in the merge queue'), stage(494, 1, 'tests started'), stage(490, 1, 'merge started'), h(489, 'merged', 'try 1: x → merged into main (def)')],
})

/** Made 300m ago: asks (30m waiting for you), a second try, then ready for review for 115m; lifetime 206m. */
const asker = () => task('T-3', {
  created_at: at(300),
  attempts: 2,
  runs: [{ started: at(290), ended: at(280) }, { started: at(240), ended: at(220) }],
  history: [
    h(300, 'created', 'created by the owner'),
    h(281, 'asked', 'try 1: worker asked: which file?'),
    h(250, 'answer', 'the owner answered: “a.ts”'),
    stage(220, 2, 'prep started'),
    stage(219, 2, 'checker started'),
    h(215, 'try-result', 'try 2: done → checks passed; ready for review'),
    stage(100, 2, 'prep started'),
    stage(99, 2, 'tests started'),
    stage(95, 2, 'merge started'),
    h(94, 'merged', 'try 2: approved by the owner → merged into main (123); approved by the owner'),
  ],
})

/** History from an older board: no times, so no stage data. */
const old = () => task('T-4', { runs: [{ started: at(50), ended: at(40) }], history: hist('try 1: x → merged into main (9)') })

const board = () => [plain(), waiter(), asker(), old()]
const doneAt = (ts: SymccTask[]) => (id: string) => doneAtMs(ts.find(t => t.id === id) ?? task('x', { status: 'todo' }))

test('stats stages: each stage of one task is read from its tries and timed history lines', () => {
  const ts = board()
  const m = (x: number) => x * MIN
  expect(taskStages(ts[0]!, doneAt(ts))?.ms).toEqual({ free: m(10), blocked: 0, backlog: 0, work: m(30), prep: m(2), check: m(8), queue: m(5), tests: m(5), merge: m(2), owner: 0 })
  // waited on T-1 until it merged (538m ago), then 8m free before its try started
  expect(taskStages(ts[1]!, doneAt(ts))?.ms).toEqual({ free: m(8), blocked: m(62), backlog: 0, work: m(30), prep: m(1), check: m(4), queue: m(1), tests: m(4), merge: m(1), owner: 0 })
  // the question during try 1 waits for the owner until the answer; review waits until the approve
  expect(taskStages(ts[2]!, doneAt(ts))?.ms).toEqual({ free: m(20), blocked: 0, backlog: 0, work: m(30), prep: m(2), check: m(4), queue: 0, tests: m(4), merge: m(1), owner: m(145) })
  expect(taskStages(ts[3]!, doneAt(ts))).toBe(null)
})

test('stats stages: a task made straight into the backlog counts that time as backlog, not waiting to start', () => {
  const m = (x: number) => x * MIN
  // made in the backlog 1200m ago (no "moved to the backlog" line), moved to todo 600m ago, starts 540m ago
  const t = task('T-5', {
    created_at: at(1200),
    runs: [{ started: at(540), ended: at(480) }],
    history: [h(1200, 'created', 'created by the lead'), h(600, 'moved-backlog', 'moved from the backlog to todo'), stage(480, 1, 'prep started'), stage(478, 1, 'checker started'), stage(470, 1, 'waits in the merge queue'), stage(465, 1, 'tests started'), stage(460, 1, 'merge started'), h(458, 'merged', 'try 1: x → merged into main (b1)')],
  })
  expect(taskStages(t, () => undefined)?.ms).toEqual({ free: m(60), blocked: 0, backlog: m(600), work: m(60), prep: m(2), check: m(8), queue: m(5), tests: m(5), merge: m(2), owner: 0 })
  // one moved to the backlog later still starts as waiting to start
  const u = task('T-6', {
    created_at: at(1200),
    runs: [{ started: at(540), ended: at(480) }],
    history: [h(1200, 'created', 'created by the lead'), h(1100, 'moved-backlog', 'moved to the backlog (was todo)'), h(600, 'moved-backlog', 'moved from the backlog to todo'), stage(480, 1, 'prep started'), h(458, 'merged', 'try 1: x → merged into main (b2)')],
  })
  expect(taskStages(u, () => undefined)?.ms).toEqual({ free: m(160), blocked: 0, backlog: m(500), work: m(60), prep: m(22), check: 0, queue: 0, tests: 0, merge: 0, owner: 0 })
})

test('stats stages: sums and averages per stage; active + waiting add up to the lifetime; lacking tasks counted', () => {
  const ts = board()
  const f = stageFigures(ts, doneAt(ts))
  expect(f.n).toBe(3)
  expect(f.lacking).toBe(1)
  const by = Object.fromEntries(f.stages.map(s => [s.stage, s.ms / MIN]))
  expect(by).toEqual({ free: 38, blocked: 62, backlog: 0, work: 90, prep: 5, check: 16, queue: 6, tests: 13, merge: 4, owner: 145 })
  expect(f.stages.find(s => s.stage === 'work')!.avgMs).toBe(30 * MIN)
  expect(f.lifetime).toBe((62 + 111 + 206) * MIN)
  expect(f.active).toBe(128 * MIN)
  expect(f.waiting).toBe(251 * MIN)
  expect(f.active + f.waiting).toBe(f.lifetime)

  const text = statsReport({ tasks: ts, nowMs: NOW })
  expect(text).toContain('Time per stage (3 done tasks; 1 without timed history, left out)')
  expect(text).toMatch(/\n {2}work +▇+ +1h 30m · avg +30m +24%\n/)
  expect(text).toMatch(/\n {2}waiting on tasks +▇+ +1h 02m · avg +21m +16%\n/)
  expect(text).toMatch(/\n {2}waiting for you +▇+ +2h 25m · avg +48m +38%\n/)
  expect(text).toMatch(/\n {2}active +2h 08m · avg +43m +34%\n/)
  expect(text).toMatch(/\n {2}waiting +4h 11m · avg +1h 24m +66%\n/)
  expect(text).toMatch(/\n {2}lifetime +6h 19m · avg +2h 06m +100%\n/)
  for (const l of text.split('\n')) expect(l.length).toBeLessThanOrEqual(80)
  const html = statsHtml(statsData({ tasks: ts, nowMs: NOW }), 'p')
  expect(html).toContain('Time per stage (3 done tasks; 1 without timed history, left out)')
  expect(html).toContain('1h 30m · avg 30m · 24%')
})

test('stats: totals sit next to averages (per done task, per try, lead time, by role and origin)', () => {
  const ts = board()
  const text = statsReport({ tasks: ts, nowMs: NOW })
  // work: 30m, 30m, 30m, 10m = 1h 40m over 4 done tasks; tokens 1k + 3k
  expect(text).toMatch(/time +avg 25m · median 30m · total 1h 40m/)
  expect(text).toMatch(/tokens +avg 2k · median 2k · total 4k \(in all\)/)
  expect(text).toMatch(/Per try \(5 tries\)\n +time +avg 20m · total 1h 40m\n +tokens +avg 2k in all · total 4k/)
  expect(text).toMatch(/lead time +avg [^\n]* · total [\s\S]*\(made to done, 4\s+tasks\)/)
  expect(text).toMatch(/general +▇+ +4 +100%  avg +2k tok · +25m\n {4}total 4k tok · 1h 40m/)
  const d = statsData({ tasks: ts, nowMs: NOW })
  expect(d.perDone.sumMs).toBe(100 * MIN)
  expect(d.perTry.sumTok).toBe(4000)
})

test('stats: "inside" counts only the work inside the window, cutting a try that started before it', () => {
  const H = 60
  // a try from 26h to 23h ago: 1h of it is inside the last day; merged 22h ago
  const t = task('T-5', {
    created_at: at(30 * H),
    updated_at: at(22 * H),
    runs: [{ started: at(26 * H), ended: at(23 * H), tokens: { input: 500 } }],
    history: [h(30 * H, 'created', 'created by the owner'), stage(23 * H, 1, 'prep started'), stage(22 * H + 5, 1, 'merge started'), h(22 * H, 'merged', 'try 1: x → merged into main (1)')],
  })
  const whole = statsReport({ tasks: [t], nowMs: NOW, range: { kind: 'days', days: 1 } })
  const inside = statsReport({ tasks: [t], nowMs: NOW, range: { kind: 'days', days: 1 }, inside: true })
  expect(whole).toContain('Counting: whole tries of tasks changed in the last 1 day (or add "inside")')
  expect(whole).toMatch(/worker time +3h 00m/)
  expect(inside).toContain('Counting: only the work inside the last 1 day')
  expect(inside).toMatch(/worker time +1h 00m/)
  expect(inside).toMatch(/\n {2}work +▇+ +1h 00m · avg +1h 00m +50%\n/)
  expect(inside).toMatch(/\n {2}lifetime +2h 00m/)
  expect(inside).toContain('500 in all')
  // without a day range, inside can't apply and says so
  expect(statsReport({ tasks: [t], nowMs: NOW, inside: true })).toContain('Counting: whole tries ("inside" needs a day range')
})

test('stats: per scout, how many of its tasks no run of it lists', () => {
  const scout = (id: string, made: number) => task(id, { status: 'todo', created_at: at(made), origin: { by: 'scout', scout: 'bugs', why: 'w', at: at(made) } })
  // T-8 was made before the oldest kept run, so it can't be told and is not counted
  const ts = [scout('T-6', 5), scout('T-7', 50), scout('T-8', 300)]
  const runs = [{ ended: at(200), tasks: ['T-7'] }]
  expect(unlinkedCount(ts, runs)).toBe(1)
  expect(unlinkedCount(ts, [])).toBe(undefined)
  const text = statsReport({ tasks: ts, nowMs: NOW, scoutRuns: { bugs: runs } })
  expect(text).toMatch(/\n {6}bugs .*\n(.*\n)* {8}1 task not linked to a run\n/)
  expect(statsReport({ tasks: ts, nowMs: NOW })).not.toContain('not linked to a run')
  expect(statsHtml(statsData({ tasks: ts, nowMs: NOW, scoutRuns: { bugs: runs } }), 'p')).toContain('1 task not linked to a run')
})
