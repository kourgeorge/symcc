// resetPlugin() (tests/reset.ts) must start each test as a reload does: S back to its start values, timers
// cancelled and dropped, and the private queues of store.ts and review.ts forgotten.
import { expect } from 'claude-code/testing'
import { test, resetPlugin } from './reset'
import { S, startS, timers } from '../hooks/plugin/state'
import { oneAtATime } from '../hooks/plugin/store'
import { mergeTurn } from '../hooks/plugin/review'
import { logo, playLogo, resetLogo } from '../hooks/plugin/logo'

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
  S.roles.push({ name: 'x' } as never)
  resetPlugin()
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

test('another test that leaves S.me set (the next one, given options, checks it is gone)', () => {
  S.me = 'left-over'
  expect(S.me).toBe('left-over')
})

test('the reset test() given options before the body still starts fresh and runs the body with $', { timeoutMs: 5000 }, $ => {
  expect(S.me).toBe('')
  expect(typeof $.ui).toBe('object')
})

/** A stand-in $ for the logo player: a shown, placed board pane and a frame timer ticked by hand. */
function logo$() {
  const ticks: (() => void)[] = []
  return {
    ui: { panes: async () => [{ id: 'symcc-board', title: '', isShown: true, isFocused: false, isPlaced: true }], refresh: () => undefined },
    clock: { every: (_ms: number, f: () => void) => (ticks.push(f), { cancel: () => void ticks.splice(ticks.indexOf(f), 1) }) },
    ticks,
  }
}

test('resetPlugin puts every logo field back to its start value and stops a running frame timer', async () => {
  const $ = logo$()
  logo.width = 80
  expect(await playLogo($ as never, 'check', { enabled: true, mode: 'auto' })).toBe(true)
  $.ticks.slice().forEach(f => f())
  logo.last = 1
  logo.before = { tasks: [{ id: 'T-1', status: 'doing' as never }], scouts: [] }
  expect(logo.ticker).not.toBe(null)
  expect($.ticks.length).toBe(1)
  const t0 = Date.now()
  resetPlugin()
  expect(logo.play).toBe(null)
  expect(logo.t).toBe(0)
  expect(logo.last).toBeGreaterThanOrEqual(t0)
  expect(logo.before).toBe(undefined)
  expect(logo.width).toBe(0)
  expect(logo.ticker).toBe(null)
  // the frame timer was cancelled: nothing is left to fire
  expect($.ticks.length).toBe(0)
})

test('resetLogo with nothing playing leaves the logo at its start values', () => {
  resetLogo()
  expect(logo).toEqual({ play: null, t: 0, last: logo.last, before: undefined, width: 0, ticker: null })
})

test('resetLogo goes on when the frame timer fails to stop', () => {
  logo.ticker = () => { throw new Error('gone') }
  logo.t = 500
  resetLogo()
  expect(logo.ticker).toBe(null)
  expect(logo.t).toBe(0)
})
