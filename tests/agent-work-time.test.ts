// T-1231: ▍Today's "agent work" adds up the time of every agent that ran (workers, checkers, scouts), not tests or the merge queue.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccRun, SymccTask } from '../types'
import { todayMore, pastDays } from '../hooks/core/live-today'
import { todayAt } from './day-clock'

const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString()
const NOW = todayAt(23, 0)
const T0 = todayAt(10, 0)

const task = (runs: SymccRun[]): SymccTask => ({ id: 'T-1', status: 'done', runs, timeline: [] }) as unknown as SymccTask

// worker 10:00-10:10, tests to 10:20, checker 10:20-10:25, merge queue to 10:40
const base = (agents: SymccRun['agents'], ended: string | undefined = iso(T0 + 40 * MIN)): SymccRun => ({ started: iso(T0), ...(ended ? { ended } : {}), agents }) as SymccRun
const worker = { id: 'a1', kind: 'worker' as const, started: iso(T0), ended: iso(T0 + 10 * MIN) }
const checker = (id: string, from: number, to?: number) => ({ id, kind: 'checker' as const, started: iso(T0 + from * MIN), ...(to !== undefined ? { ended: iso(T0 + to * MIN) } : {}) })

test('a 10 minute worker and a 5 minute checker count 15 minutes; tests and the merge queue do not', () => {
  const t = { ...task([base([worker, checker('c1', 20, 25)])]), timeline: [{ at: iso(T0 + 40 * MIN), kind: 'merged', line: 'merged' }] } as unknown as SymccTask
  const m = todayMore([t], undefined, NOW)
  expect(m.workMs).toBe(15 * MIN)
  expect(m.perTask?.workMs).toBe(15 * MIN)
})

test('two checkers in one try both count', () => {
  expect(todayMore([task([base([worker, checker('c1', 20, 25), checker('c2', 30, 33)])])], undefined, NOW).workMs).toBe(18 * MIN)
})

test('a running checker counts up to now', () => {
  const now = T0 + 30 * MIN
  expect(todayMore([task([base([worker, checker('c1', 20)], undefined)])], undefined, now).workMs).toBe(20 * MIN)
})

test('scouts still count', () => {
  const m = todayMore([task([base([worker])])], { day: dayKey(), scout_ms: 7 * MIN }, NOW)
  expect(m.workMs).toBe(17 * MIN)
})

test('past days use the same rule', () => {
  const now = T0 + 24 * 60 * MIN
  expect(pastDays([task([base([worker, checker('c1', 20, 25)])])], now, 1).workMs).toBe(15 * MIN)
})

function dayKey(): string {
  const d = new Date(NOW)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
