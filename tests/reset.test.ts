// resetPlugin() (tests/reset.ts) must start each test as a reload does: S back to its start values, timers
// cancelled and dropped, and the private queues of store.ts and review.ts forgotten.
import { expect } from 'claude-code/testing'
import { test, resetPlugin } from './reset'
import { S, startS, timers, warnedPrompts } from '../hooks/plugin/state'
import { oneAtATime } from '../hooks/plugin/store'
import { mergeTurn } from '../hooks/plugin/review'

const never = () => new Promise<never>(() => undefined)

test('resetPlugin puts S.me, S.driving and S.root back to their start values', () => {
  S.me = 'session-1'
  S.driving = true
  S.root = '/somewhere'
  resetPlugin()
  expect(S.me).toBe('')
  expect(S.driving).toBe(false)
  expect(S.root).toBe('')
})

test('resetPlugin gives S fresh objects, not the ones an earlier test changed', () => {
  S.prompts.change = 'my prompt'
  S.roles.push({ name: 'x' } as never)
  resetPlugin()
  expect(S.prompts).toEqual({})
  expect(S.roles).toEqual([])
})

test('resetPlugin leaves S with the same fields as a fresh load, no more', () => {
  ;(S as Record<string, unknown>).leftOver = 1
  resetPlugin()
  expect(Object.keys(S).sort()).toEqual(Object.keys(startS()).sort())
})

test('resetPlugin cancels and drops the timers left over', () => {
  let cancelled = 0
  timers.push({ cancel: () => void cancelled++ }, { cancel: () => void cancelled++ })
  S.watchdog = { cancel: () => void cancelled++ }
  resetPlugin()
  expect(cancelled).toBe(3)
  expect(timers.length).toBe(0)
  expect(S.watchdog).toBe(null)
})

test('resetPlugin goes on when a left-over timer fails to cancel', () => {
  timers.push({ cancel: () => { throw new Error('gone') } })
  S.me = 'x'
  resetPlugin()
  expect(timers.length).toBe(0)
  expect(S.me).toBe('')
})

test('resetPlugin empties warnedPrompts', () => {
  warnedPrompts.set('/p/change.md', 'empty')
  resetPlugin()
  expect(warnedPrompts.size).toBe(0)
})

test('a merge into a branch left hanging before resetPlugin does not hold up the next one', async () => {
  void mergeTurn('main', never)
  resetPlugin()
  expect(await mergeTurn('main', async () => 'ran')).toBe('ran')
})

test('a job left hanging in a store queue before resetPlugin does not hold up the next one', async () => {
  void oneAtATime('board', never)
  resetPlugin()
  expect(await oneAtATime('board', async () => 'ran')).toBe('ran')
})

test('a test that leaves S.me and S.driving set (the next test checks they are gone)', () => {
  S.me = 'left-over'
  S.driving = true
  expect(S.me).toBe('left-over')
})

test('the reset test() starts with S.me and S.driving as a fresh load has them', () => {
  expect(S.me).toBe('')
  expect(S.driving).toBe(false)
})
