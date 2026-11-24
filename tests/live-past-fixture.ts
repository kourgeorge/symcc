// T-889: a board with tasks merged yesterday, earlier in the week, today and 9 days ago, for ▍Today's dim
// "yesterday" and "last 7 days" lines (tests/live.test.tsx and the OpenCode one in hooks/opencode/tests).
import { dayStartOf, inToday } from './day-clock'

const HOUR = 3_600_000

/**
 * At `nowMs`: T-1 worked 2h yesterday (3M, merged yesterday), T-2 1h three days ago (2M, merged then), T-3 today (5M,
 * merged today: in neither line), T-4 nine days ago (7M: in neither line). T-5 is yesterday's 30m try that waited 10m
 * with the app closed (so 20m), no tokens, not merged.
 */
export function pastTasks(nowMs: number) {
  const y = dayStartOf(nowMs) // today's midnight: yesterday is the day before it
  const iso = (at: number) => new Date(at).toISOString()
  const task = (id: string, x: Record<string, unknown>) => ({ id, title: id, details: '', files: [], status: 'done', note: '', priority: 1, after: [], attempts: 1, history: [], branch: null, created_at: iso(y - 10 * 24 * HOUR), updated_at: iso(nowMs), ...x })
  const run = (from: number, to: number, tokens: number) => ({ started: iso(from), ended: iso(to), agents: [{ kind: 'worker' as const, started: iso(from), ended: iso(to), tokens: { input: tokens } }] })
  const merged = (at: number) => [{ kind: 'merged', at: iso(at), text: 'try 1 → merged into main' }]
  const t0 = inToday(nowMs, 0.2)
  return [
    task('T-1', { runs: [run(y - 14 * HOUR, y - 12 * HOUR, 3_000_000)], history: merged(y - 11 * HOUR) }),
    task('T-2', { runs: [run(y - 74 * HOUR, y - 73 * HOUR, 2_000_000)], history: merged(y - 72 * HOUR) }),
    task('T-3', { runs: [run(t0, inToday(nowMs, 0.3), 5_000_000)], history: merged(inToday(nowMs, 0.4)) }),
    task('T-4', { runs: [run(y - 9 * 24 * HOUR, y - 9 * 24 * HOUR + HOUR, 7_000_000)], history: merged(y - 9 * 24 * HOUR + 2 * HOUR) }),
    task('T-5', { status: 'failed', runs: [{ started: iso(y - 5 * HOUR), ended: iso(y - 4.5 * HOUR), restarts: [{ at: iso(y - 4.9 * HOUR), why: 'reload', started: iso(y - (4.9 - 1 / 6) * HOUR) }] }] }),
  ]
}

/** The two lines these give at a wide panel. */
export const PAST_YESTERDAY = 'yesterday:   ✓ 1 merged · ⌀ 3M · ⏱ 2h 20m'
export const PAST_WEEK = 'last 7 days: ✓ 2 merged · ⌀ 5M · ⏱ 3h 20m'
