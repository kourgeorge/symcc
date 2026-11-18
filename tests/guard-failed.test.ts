// T-390: a guard hook (tool.check, tool.call) that throws or runs out of time refuses the call of symcc's own agents
// (workers, checkers, scouts) and lets the lead's (and any other agent's) call go on; the reason is short and on one line.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { guardFailed } from '../hooks/plugin/ask'
import { guardReason, guardFailedText, GUARD_REASON_MAX_CHARS } from '../hooks/board'
import { workers, scoutRuns, checkerRuns, stopped, isOwnAgent } from '../hooks/plugin/state'

const quiet = { ui: { log: () => undefined } } as never

test("a failed guard refuses a worker's, a checker's, a scout's and a stopped agent's call", () => {
  workers.set('w1', { task: 'T-1', worktree: '/repo/.symcc/worktrees/T-1' } as never)
  checkerRuns.set('c1', { task: 'T-1', worktree: '/repo/.symcc/worktrees/T-1', end: () => undefined })
  scoutRuns.set('s1', 'bugs')
  stopped.add('x1')
  for (const id of ['w1', 'c1', 's1', 'x1']) {
    expect(isOwnAgent(id)).toBe(true)
    expect(guardFailed(quiet, 'tool.check', id, { kind: 'throw', message: 'boom' })).toBe("symcc couldn't check this call, so it was refused: it failed (boom)")
  }
  expect(guardFailed(quiet, 'tool.call', 'w1', { kind: 'timeout' })).toBe("symcc couldn't check this call, so it was refused: it ran out of time")
})

test("a failed guard lets the lead's call (no agentId) and another agent's call go on", () => {
  expect(guardFailed(quiet, 'tool.check', undefined, { kind: 'throw', message: 'boom' })).toBeUndefined()
  expect(guardFailed(quiet, 'tool.check', 'someone-else', { kind: 'timeout' })).toBeUndefined()
  expect(guardFailed(quiet, 'tool.call', undefined, undefined)).toBeUndefined()
})

test('the failure is logged once per hook and reason, and a failing log changes nothing', () => {
  const logs: string[] = []
  const $ = { ui: { log: (t: string) => logs.push(t) } } as never
  scoutRuns.set('s1', 'bugs')
  guardFailed($, 'tool.check', 's1', { kind: 'throw', message: 'boom' })
  guardFailed($, 'tool.check', 's1', { kind: 'throw', message: 'boom' })
  guardFailed($, 'tool.call', 's1', { kind: 'throw', message: 'boom' })
  expect(logs.length).toBe(2)
  const broken = { ui: { log: () => { throw new Error('no log') } } } as never
  expect(guardFailed(broken, 'tool.check', 's1', { kind: 'throw', message: 'other' })).toMatch(/refused/)
})

test("the reason is one line and short: control characters can't fake lines, a long message is cut", () => {
  expect(guardReason('throw', 'a\nb\r\u0007c')).toBe('it failed (a b c)')
  expect(guardReason('throw', '   ')).toBe('it failed')
  expect(guardReason(undefined)).toBe('it failed')
  const long = guardReason('throw', 'x'.repeat(5000))
  expect(long.length).toBe(GUARD_REASON_MAX_CHARS)
  expect(guardFailedText('symcc', 'it failed')).toBe("symcc couldn't check this call, so it was refused: it failed")
})
