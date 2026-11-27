// T-863: board times count only real work. A try that went on after a reopen (T-743) has a long stretch when no session was
// open; that stretch is not work time. A step (queue, tests, ...) shows the time since the step began.
import { expect, test } from 'claude-code/testing'
import type { SymccRun, SymccTask } from '../types'
import { goOnRun, activeFrom, agentLines, gapsOf, keepAgentIds, runMs, runsSummary, triesSummary, workerActiveMs, withWorkerStart, startRun, workerSince } from '../hooks/core/runs'
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
  ({ id, title: `task ${id}`, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, timeline: [], branch: null, created_at: at(32 * 60), updated_at: at(1), ...x }) as SymccTask

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
    timeline: [{ kind: 'stage', at: at(1), text: 'try 1: waits in the merge queue (place 4)', try: 1, step: 'queue' }],
  })
  const v = { tasks: [t], checker: false, mode: 'auto' as const, max_parallel: 3 }
  const lane = liveLanes(v, NOW)[0]!
  expect(lane.station).toBe('queue')
  const form = bandItems(v, NOW)[0]!.forms[0]!
  expect(form).toBe('1m')
})

test('T-863: the stage chart does not count the idle stretch as work; lifetime and lead time stay wall-clock', () => {
  const t = task('T-52', {
    status: 'done',
    created_at: at(40 * 60),
    runs: [{ ...gapRun(), ended: at(10), ended_by: 'finished' }],
    timeline: [
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

test('T-885: a lead.json heartbeat dated in the future is ignored: the gap starts at the board\'s updated_at, so the closed hours do not count', () => {
  const t = task('T-52', { live: { session: 'me' }, updated_at: at(31 * 60 - 20), runs: [{ started: at(31 * 60), agents: [{ id: 'ag1', kind: 'worker' as const, started: at(31 * 60) }] }] })
  const board = { tasks: [t] } as unknown as Parameters<typeof resetDoing>[0]
  const back = resetDoing(board, 'new', leadText('me', NOW + 99 * MIN), NOW - 12 * MIN, REOPEN, at(12)).tasks[0]!
  const r = goOnRun(back.runs, at(12))!.at(-1)!
  const g = gapsOf(r)
  expect(g.length).toBe(1)
  expect(g[0]!.from).toBe(NOW - (31 * 60 - 20) * MIN)
  expect(runMs(r, NOW)).toBe(32 * MIN)
})

test('T-863: a try that handed back before the close: the gap starts at the last heartbeat, so prep and tests before it count', () => {
  const t = task('T-52', {
    live: { session: 'me' },
    runs: [{ started: at(1850), ended: at(1840), agents: [{ id: 'ag1', kind: 'worker' as const, started: at(1850), ended: at(1840) }] }],
    timeline: [{ kind: 'stage', at: at(1835), text: 'try 1: tests started', try: 1, step: 'tests' }],
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
    timeline: [
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
    timeline: [
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

test('T-884: a claim that waited 3 h in the start queue counts its try time from the worker\'s start, so it is not asked for more time', () => {
  const limit = timeLimitOf(45, undefined)
  // claimed 3 h ago, its worker started 5 min ago
  const runs = withWorkerStart(startRun(undefined, at(180)), 'ag1', at(5))!
  const r = runs.at(-1)!
  expect(r.started).toBe(at(5))
  expect(workerSince(r)).toBe(NOW - 5 * MIN)
  expect(runMs(r, NOW)).toBe(5 * MIN)
  expect(workerActiveMs(r, NOW - 5 * MIN, NOW) / MIN > limit).toBe(false)
  expect(workerActiveMs(r, NOW - 5 * MIN, NOW) / MIN > hardCapOf(45, undefined)).toBe(false)
  // a second worker on the same try (a checker send-back is a new try; this is any later start) moves nothing
  const again = withWorkerStart(runs, 'ag2', at(1))!.at(-1)!
  expect(again.started).toBe(at(5))
  // a try that went on after a reopen: its restart's start moves to the new worker's start, so the queue wait is a gap
  const goOn = [{ started: at(300), restarts: [{ at: at(290), why: REOPEN, started: at(200) }], agents: [{ id: 'ag0', kind: 'worker' as const, started: at(300), ended: at(290), ended_by: 'restarted' as const }] }]
  const g = withWorkerStart(goOn, 'ag3', at(2))!.at(-1)!
  expect(g.restarts![0]!.started).toBe(at(2))
  expect(runMs(g, NOW)).toBe(12 * MIN)
})

/**
 * T-882: 10 min of work, Claude Code closed 12 h, then `short` quick restarts (1 min of work, 1 min closed each), the
 * last worker started 9 min ago. Active: 10 + short × 1 + 9 min.
 */
const longGapThenRestarts = (short: number) => {
  const back = 9 + 2 * short // minutes ago the first worker after the long gap started
  return {
    started: at(back + 12 * 60 + 10),
    restarts: [
      { at: at(back + 12 * 60), why: REOPEN, started: at(back) },
      ...Array.from({ length: short }, (_, k) => ({ at: at(back - 2 * k - 1), why: REOPEN, started: at(back - 2 * k - 2) })),
    ],
  }
}

test('T-882: a try with 11+ restarts after a long closed-app gap keeps its active minutes when the board is saved (old restarts trimmed)', () => {
  const r = longGapThenRestarts(11)
  expect(runMs(r, NOW)).toBe(30 * MIN)
  // saving the board keeps only the last 10 restarts; the long gap's time is kept as a saved total
  const [kept] = keepAgentIds([r])
  expect(kept!.restarts!.length).toBe(10)
  expect(runMs(kept!, NOW)).toBe(30 * MIN)
  expect(workerActiveMs(kept!, NOW - 9 * MIN, NOW)).toBe(30 * MIN)
  expect(NOW - activeFrom(kept!, Date.parse(kept!.started))).toBe(30 * MIN)
  // saved again: nothing changes
  expect(keepAgentIds([kept!])[0]).toBe(kept)
  // more restarts trimmed later add to the saved total
  const r2 = longGapThenRestarts(15)
  expect(runMs(r2, NOW)).toBe(34 * MIN)
  const [once] = keepAgentIds([{ ...r2, restarts: r2.restarts.slice(0, 13) }])
  const [twice] = keepAgentIds([{ ...once!, restarts: [...once!.restarts!, ...r2.restarts.slice(13)] }])
  expect(twice!.restarts!.length).toBe(10)
  expect(runMs(twice!, NOW)).toBe(34 * MIN)
  // the task page and the stats show the same time
  const t = task('T-53', { runs: [kept] })
  expect(triesSummary(t.runs, NOW)).toContain('30m (running)')
  expect(statsData({ tasks: [t], nowMs: NOW }).perTry.sumMs).toBe(30 * MIN)
})

test('T-882: trimmed closed-app stretches stay at their real times, so work between two trimmed gaps still counts', () => {
  // 2 h work, closed 20 h, a worker works 6 h, then 11 quick restarts (1 min closed each), the last worker started 9 min ago
  const q = 31
  const r = {
    started: at(q + 360 + 1200 + 120),
    restarts: [
      { at: at(q + 360 + 1200), why: REOPEN, started: at(q + 360) },
      ...Array.from({ length: 11 }, (_, k) => ({ at: at(q - 2 * k - 1), why: REOPEN, started: at(q - 2 * k - 2) })),
    ],
    agents: [
      { id: 'ag1', kind: 'worker' as const, started: at(q + 360 + 1200 + 120), ended: at(q + 360 + 1200), ended_by: 'restarted' as const },
      { id: 'ag2', kind: 'worker' as const, started: at(q + 360), ended: at(q - 1), ended_by: 'restarted' as const },
      { id: 'ag3', kind: 'worker' as const, started: at(9) },
    ],
  }
  const [kept] = keepAgentIds([r])
  expect(kept!.restarts!.length).toBe(10)
  expect((kept as SymccRun).idle!.length).toBe(2)
  expect(runMs(kept!, NOW)).toBe(runMs(r, NOW))
  expect(runMs(kept!, NOW)).toBe(500 * MIN)
  // the 6 h worker keeps its 6 h, and the active time since it started is the same
  expect(agentLines(kept!, NOW)).toEqual(agentLines(r, NOW))
  expect(agentLines(kept!, NOW).join('\n')).toContain('6h 01m')
  expect(NOW - activeFrom(kept!, Date.parse(at(q + 360)))).toBe(NOW - activeFrom(r, Date.parse(at(q + 360))))
  expect(NOW - activeFrom(kept!, Date.parse(at(q + 360)))).toBe(380 * MIN)
})
