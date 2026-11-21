// T-769: a board with three tasks merged today and the lead's, scouts' and cost figures, for the ▍Today tests
// (tests/live-today.test.tsx and the OpenCode one in hooks/opencode/tests).
import type { TodayTeam } from '../hooks/core/live'
import { dayOf } from '../hooks/core/days'

/**
 * Three tasks merged by `t0` (tokens 1M, 3M, 2M; work 10m, 30m, 5m; first start to merge 20m, 170m, 30m), the
 * checkers' part kept apart; every time within 200 minutes before `t0` (so within its day when `t0` is 12:00 UTC).
 */
export function todayTasks(t0: number) {
  const iso = (minAgo: number) => new Date(t0 - minAgo * 60_000).toISOString()
  const task = (id: string, x: Record<string, unknown>) => ({ id, title: id, details: '', files: [], status: 'done', note: '', question: null, order: 1, after: [], attempts: 1, history: [], branch: null, created_at: iso(200), updated_at: iso(1), ...x })
  const merged = (minAgo: number) => [{ kind: 'merged', at: iso(minAgo), text: 'try 1 → merged into main' }]
  return [
    task('T-1', { runs: [{ started: iso(100), ended: iso(90), tokens: { input: 1_000_000 }, checker_tokens: { input: 100_000 } }], history: merged(80) }),
    task('T-2', { attempts: 2, runs: [{ started: iso(200), ended: iso(190), tokens: { input: 2_000_000 } }, { started: iso(60), ended: iso(40), tokens: { input: 1_000_000 }, checker_tokens: { input: 200_000 } }], history: merged(30) }),
    task('T-3', { runs: [{ started: iso(50), ended: iso(45), tokens: { input: 2_000_000 } }], history: merged(20) }),
  ]
}

/** The lead's 1M, the scouts' 3M and 30m, the session's $12.40, for the day of `t0` at `offsetMin`; `hours` the lead's and scouts' hours (none: left out). */
export const todayTeamOf = (t0: number, offsetMin: number, hours?: Record<number, number>): TodayTeam => ({
  day: dayOf(t0, offsetMin),
  lead: 1_000_000,
  scouts: 3_000_000,
  scout_ms: 30 * 60_000,
  usd: 12.4,
  ...(hours ? { hours: Array.from({ length: 24 }, (_, h) => hours[h] ?? 0) } : {}),
})

/** The second and third lines these give at a wide panel (the bar's shares: workers 5.7M, checkers 0.3M, scouts 3M, lead 1M). */
export const TODAY_LINE_2 = '⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work · ≈ $12'
export const TODAY_BAR_START = '████████▓▒▒▒▒▒░░ workers 57% · checkers 3% · scouts 30% · lead 10%'
