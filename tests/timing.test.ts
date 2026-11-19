// T-509: the speed-check helpers of tests/timing.ts. bestPairMsOf times the small and the big case in turns, so a busy
// stretch of the machine slows both alike instead of only the big runs (what made T-436's growth check flaky).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { bestPairMsOf, growsSlowly, GROWTH_SLACK_MS, SPEED_CAP_MS } from './timing'

test('bestPairMsOf runs the small and the big case in turns, as often as asked, and answers the fastest of each', () => {
  const order: string[] = []
  const r = bestPairMsOf(() => order.push('s'), () => order.push('b'), 4)
  expect(order).toEqual(['s', 'b', 's', 'b', 's', 'b', 's', 'b'])
  expect(r.small >= 0 && r.big >= 0).toBe(true)
  expect(Number.isFinite(r.small) && Number.isFinite(r.big)).toBe(true)
  // five turns by default
  const n = { s: 0, b: 0 }
  bestPairMsOf(() => n.s++, () => n.b++)
  expect(n).toEqual({ s: 5, b: 5 })
})

test('growsSlowly: within the ratio plus slack and under the cap passes; past the ratio or the cap fails', () => {
  expect(growsSlowly(10, 10 * 3 + GROWTH_SLACK_MS - 1, 3)).toBe(true)
  expect(growsSlowly(10, 10 * 3 + GROWTH_SLACK_MS, 3)).toBe(false)
  expect(growsSlowly(SPEED_CAP_MS, SPEED_CAP_MS, 10)).toBe(false)
  expect(growsSlowly(0, 0, 10)).toBe(true)
})
