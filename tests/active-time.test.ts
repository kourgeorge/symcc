// T-863: board times count only real work. A try that went on after a reopen (T-743) has a long stretch when no session was
// open; that stretch is not work time. A step (queue, tests, ...) shows the time since the step began.
import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { goOnRun, activeFrom, agentLines, gapsOf, runMs, runsSummary, triesSummary, workerActiveMs } from '../hooks/core/runs'
import { timeLimitOf, hardCapOf } from '../hooks/core/task'
import { liveLanes, liveToday, laneRight } from '../hooks/core/live'
import { bandItems } from '../hooks/core/banner'
import { resetDoing, leadText, statsData, taskStages } from '../hooks/board'

const MIN = 60_000
const NOW = Date.now()
const at = (minAgo: number) => new Date(NOW - minAgo * MIN).toISOString()
const REOPEN = 'restarted after Claude Code was reopened'

/** Started 31h ago, the worker stopped 20 min later (Claude Code closed), the new worker started 12 min ago. */
const gapRun = (over: Record<string, unknown> = {}) => ({
  started: at(31 * 60),
  restarts: [{ at: at(31 * 60 - 20), why: REOPEN, started: at(12) }],
  agents: [
    { id: 'ag1', kind: 'worker' as const, started: at(31 * 60), ended: at(31 * 60 - 20), ended_by: 'restarted' as const },
    { id: 'ag2', kind: 'worker' as const, started: at(12) },
  ],
  ...over,
})

const task = (id: string, x: Record<string, unknown> = {}): SymccTask =>
  ({ id, title: `task ${id}`, details: '', files: [], status: 'doing', note: '', order: Number(id.slice(2)), after: [], attempts: 1, history: [], branch: null, created_at: at(32 * 60), updated_at: at(1), ...x }) as SymccTask

test('T-863: a try with a 30-hour gap between a reopen stop and its restart counts only its active minutes', () => {
  const r = gapRun()
  expect(gapsOf(r).length).toBe(1)
  // 20 min before the stop + 12 min since the restart
  expect(runMs(r, NOW)).toBe(32 * MIN)
  // a try that ended 2 min after the restart: 20 + 2
  expect(runMs({ ...r, ended: at(10) }, NOW)).toBe(22 * MIN)
  // a time since a point before the gap leaves the gap out; after it nothing changes
  expect(NOW - activeFrom(r, Date.parse(r.started))).toBe(32 * MIN)
  expect(activeFrom(r, NOW - 5 * MIN)).toBe(NOW - 5 * MIN)
  // a try with no restart counts as before
  expect(runMs({ started: at(50) }, NOW)).toBe(50 * MIN)
})

test('T-863: the task page lines (Tries, Runs, per-agent times) and the stats work time use the active time', () => {
  const t = task('T-52', { runs: [gapRun()] })
  const r = t.runs![0]!
  expect(triesSummary(t.runs, NOW)).toContain('32m (running)')
  expect(runsSummary(t.runs, NOW)).toContain('32m')
  expect(runsSummary(t.runs, NOW)).not.toMatch(/\d\d h|\d+h /)
  // each worker shows its own time; the stopped one ran 20 min, the new one 12
  const lines = agentLines(r, NOW).join('\n')
  expect(lines).toContain('20m')
  expect(lines).toContain('12m')
  const d = statsData({ tasks: [t], nowMs: NOW })
  expect(JSON.stringify(d)).not.toContain('31h')
  expect(d.perTry.sumMs).toBe(32 * MIN)
})

test('T-863: the Live lane and the band row show the active time of a worker that went on after a reopen', () => {
  const t = task('T-52', { runs: [gapRun()] })
  const v = { tasks: [t], checker: false, mode: 'auto' as const, max_parallel: 3 }
  const lane = liveLanes(v, NOW)[0]!
  expect(lane.station).toBe('work')
  expect(laneRight(lane, NOW)).toBe('32m')
  const row = bandItems(v, NOW)[0]!
  expect(row.forms[0]).toBe('32m')
})

test('T-863: a task waiting in the queue shows the time since it entered the queue, not since its try started', () => {
  const t = task('T-52', {
    runs: [gapRun({ ended: at(2) })],
    live: { checking: { step: 'queue', at: at(1), place: 4 } },
    history: [{ kind: 'stage', at: at(1), text: 'try 1: waits in the merge queue (place 4)', try: 1, step: 'queue' }],
  })
  const v = { tasks: [t], checker: false, mode: 'auto' as const, max_parallel: 3 }
  const lane = liveLanes(v, NOW)[0]!
  expect(lane.station).toBe('queue')
  const form = bandItems(v, NOW)[0]!.forms[0]!
  expect(form).toMatch(/queue 1m$/)
})

test('T-863: the stage chart does not count the idle stretch as work; lifetime and lead time stay wall-clock', () => {
  const t = task('T-52', {
    status: 'done',
    created_at: at(40 * 60),
    runs: [{ ...gapRun(), ended: at(10), ended_by: 'finished' }],
    history: [
      { kind: 'created', at: at(40 * 60), text: 'created by the owner' },
      { kind: 'stage', at: at(10), text: 'try 1: prep started', try: 1, step: 'prep' },
      { kind: 'stage', at: at(8), text: 'try 1: merge started', try: 1, step: 'merge' },
      { kind: 'merged', at: at(6), text: 'try 1: did it → merged into main (abc)' },
    ],
  })
  const s = taskStages(t, () => undefined)!
  expect(s.ms.work).toBe(22 * MIN)
  // the whole life from creation to done is still counted
  expect(s.lifetime).toBe(40 * 60 * MIN - 6 * MIN)
  // today's work time (liveToday's neighbour) never counts the gap either
  const today = liveToday([task('T-53', { runs: [gapRun()] })], NOW, 0)
  expect(today).toBeDefined()
})

test('T-863: a worker still running when Claude Code closed: the stop is stamped at the last heartbeat, so the closed hours do not count', () => {
  const t = task('T-52', { live: { session: 'me' }, runs: [{ started: at(31 * 60), agents: [{ id: 'ag1', kind: 'worker' as const, started: at(31 * 60) }] }] })
  const board = { tasks: [t] } as unknown as Parameters<typeof resetDoing>[0]
  const lead = leadText('me', NOW - (31 * 60 - 20) * MIN)
  const back = resetDoing(board, 'new', lead, NOW - 12 * MIN, REOPEN, at(12)).tasks[0]!
  expect(back.status).toBe('todo')
  const runs = goOnRun(back.runs, at(12))!
  const r = runs.at(-1)!
  expect(gapsOf(r).length).toBe(1)
  // 20 min before the close, 12 min since the reopen is not yet worked: the new worker started at the reopen
  expect(runMs(r, NOW)).toBe(32 * MIN)
  expect(agentLines(r, NOW).join('\n')).toContain('20m')
})

test('T-863: a try that handed back before the close: the gap starts at the last heartbeat, so prep and tests before it count', () => {
  const t = task('T-52', {
    live: { session: 'me' },
    runs: [{ started: at(1850), ended: at(1840), agents: [{ id: 'ag1', kind: 'worker' as const, started: at(1850), ended: at(1840) }] }],
    history: [{ kind: 'stage', at: at(1835), text: 'try 1: tests started', try: 1, step: 'tests' }],
  })
  const board = { tasks: [t] } as unknown as Parameters<typeof resetDoing>[0]
  const back = resetDoing(board, 'new', leadText('me', NOW - 1800 * MIN), NOW - 12 * MIN, REOPEN, at(12)).tasks[0]!
  const r = goOnRun(back.runs, at(12))!.at(-1)!
  const g = gapsOf(r)
  expect(g.length).toBe(1)
  expect(g[0]!.from).toBe(NOW - 1800 * MIN)
  expect(g[0]!.to).toBe(NOW - 12 * MIN)
  // 50 min before the close, 12 min since the reopen
  expect(runMs(r, NOW)).toBe(62 * MIN)
})

test('T-863: after a reopen the check step shows the time since its own prep line, not an older one', () => {
  const t = task('T-52', {
    runs: [{ started: at(31 * 60), restarts: [{ at: at(31 * 60 - 20), why: REOPEN, started: at(12) }], ended: at(10), ended_by: 'finished' }],
    live: { checking: { step: 'checker', at: at(8) } },
    history: [
      { kind: 'stage', at: at(31 * 60 - 25), text: 'try 1: prep started', try: 1, step: 'prep' },
      { kind: 'stage', at: at(9), text: 'try 1: prep started', try: 1, step: 'prep' },
      { kind: 'stage', at: at(8), text: 'try 1: checker started', try: 1, step: 'checker' },
    ],
  })
  const v = { tasks: [t], checker: true, mode: 'auto' as const, max_parallel: 3 }
  const lane = liveLanes(v, NOW)[0]!
  expect(lane.station).toBe('check')
  expect(laneRight(lane, NOW)).toBe('9m')
})

test('T-863: the stage chart counts the steps that ran before the close under their own names', () => {
  const t = task('T-52', {
    status: 'done',
    created_at: at(1860),
    runs: [{ started: at(1850), ended: at(10), ended_by: 'finished', restarts: [{ at: at(1800), why: REOPEN, started: at(12) }] }],
    history: [
      { kind: 'created', at: at(1860), text: 'created by the owner' },
      { kind: 'stage', at: at(1835), text: 'try 1: tests started', try: 1, step: 'tests' },
      { kind: 'stage', at: at(9), text: 'try 1: tests started', try: 1, step: 'tests' },
      { kind: 'merged', at: at(4), text: 'try 1: did it → merged into main (abc)' },
    ],
  })
  const s = taskStages(t, () => undefined)!
  expect(s.ms.tests).toBeGreaterThanOrEqual(35 * MIN)
  expect(s.ms.work).toBeLessThanOrEqual(20 * MIN)
})

test('T-873: the over-time check counts the try\'s active time from its first start, not the time since the restart', () => {
  const limit = timeLimitOf(45, undefined)
  // ran 40 min, Claude Code closed overnight, then the same try went on 10 min ago (its new worker's since)
  const r = {
    started: at(16 * 60 + 50),
    restarts: [{ at: at(16 * 60 + 10), why: REOPEN, started: at(10) }],
  }
  const since = NOW - 10 * MIN
  expect(workerActiveMs(r, since, NOW)).toBe(50 * MIN)
  expect(workerActiveMs(r, since, NOW) / MIN > limit).toBe(true)
  // at 44 active minutes (4 min after the restart) it is not asked yet; past 45 it is
  expect(workerActiveMs(r, since, NOW - 6 * MIN) / MIN > limit).toBe(false)
  expect(workerActiveMs(r, since, NOW - 4 * MIN) / MIN > limit).toBe(true)
  // the hard cap counts the same way, and time the owner added stays on top
  const t = { live: { extra_minutes: 10 } }
  expect(workerActiveMs(r, since, NOW) / MIN > timeLimitOf(45, t)).toBe(false)
  expect(workerActiveMs(r, since, NOW + 6 * MIN) / MIN > timeLimitOf(45, t)).toBe(true)
  expect(workerActiveMs(r, since, NOW + 51 * MIN) / MIN > hardCapOf(45, undefined)).toBe(true)
  // a try with no restart is asked at 45 min as before
  const plain = { started: at(44) }
  expect(workerActiveMs(plain, NOW - 44 * MIN, NOW) / MIN > limit).toBe(false)
  expect(workerActiveMs(plain, NOW - 44 * MIN, NOW + 2 * MIN) / MIN > limit).toBe(true)
  // no start on the board: the worker's own start
  expect(workerActiveMs(undefined, NOW - 46 * MIN, NOW) / MIN > limit).toBe(true)
})
