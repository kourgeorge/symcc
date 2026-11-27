// T-1204: at start, the driving session checks GitHub once for a newer symcc minor or major release and tells the lead.
import { expect } from 'claude-code/testing'
import { newerMinor, updateLine, checkForUpdate, forgetUpdateCheck } from '../hooks/app/update-check'
import { S, leadQueue } from '../hooks/app/state'
import { test } from './reset'
import { fakeHost } from './fake-host'

test('newerMinor: only a higher minor or major part counts', () => {
  expect(newerMinor('0.5.40', '0.6.3')).toBe(true)
  expect(newerMinor('0.5.40', '0.5.51')).toBe(false)
  expect(newerMinor('0.6.0', '0.6.3')).toBe(false)
  expect(newerMinor('0.9.0', '1.0.0')).toBe(true)
  expect(newerMinor('0.6.3', '0.6.3')).toBe(false)
  expect(newerMinor('0.6.3', '0.5.9')).toBe(false)
  expect(newerMinor('0.5.40', 'nonsense')).toBe(false)
  expect(newerMinor('0.5.40', '')).toBe(false)
})

test('updateLine: Claude Code gets the update steps, other hosts just the news', () => {
  expect(updateLine('0.5.40', '0.6.3', 'claude plugin marketplace update symcc, then claude plugin update symcc@symcc, then /reload-plugins')).toBe('symcc 0.6.3 is out (you have 0.5.40). To update: claude plugin marketplace update symcc, then claude plugin update symcc@symcc, then /reload-plugins.')
  expect(updateLine('0.5.40', '0.6.3', '')).toBe('symcc 0.6.3 is out (you have 0.5.40); update it.')
})

function withFetch<T>(f: unknown, run: () => Promise<T>): Promise<T> {
  const g = globalThis as { fetch?: unknown }
  const old = g.fetch
  g.fetch = f
  return run().finally(() => (g.fetch = old))
}

function ready() {
  forgetUpdateCheck()
  S.version = '0.5.40'
  S.driving = true
  S.fresh = false
  S.guardOnly = false
  S.enabledNow = true
  leadQueue.length = 0
  return fakeHost({}).host
}

const answer = (version: string) => async () => ({ ok: true, text: async () => JSON.stringify({ name: 'symcc', version }) })

test('a newer minor reaches the lead once', async () => {
  const host = ready()
  await withFetch(answer('0.6.3'), async () => {
    await checkForUpdate(host)
    await checkForUpdate(host)
  })
  expect(leadQueue.filter(t => t.includes('0.6.3 is out')).length).toBe(1)
})

test('a patch release, a bad answer or a failing fetch adds nothing', async () => {
  for (const f of [answer('0.5.51'), async () => ({ ok: true, text: async () => 'not json' }), async () => ({ ok: false, text: async () => '' }), async () => { throw new Error('offline') }]) {
    const host = ready()
    await withFetch(f, () => checkForUpdate(host))
    expect(leadQueue.length).toBe(0)
  }
})

test('a window that does not drive does not check', async () => {
  const host = ready()
  S.driving = false
  await withFetch(answer('0.6.3'), () => checkForUpdate(host))
  expect(leadQueue.length).toBe(0)
})

test('a slow fetch is given up after the timeout and adds nothing', async () => {
  forgetUpdateCheck()
  let fire = () => {}
  const host = fakeHost({ clock: { after: (_ms: number, fn: () => void) => ((fire = fn), { cancel: () => undefined }) as never } }).host
  S.version = '0.5.40'
  S.driving = true
  S.fresh = false
  S.guardOnly = false
  S.enabledNow = true
  leadQueue.length = 0
  await withFetch(() => new Promise(() => undefined), async () => {
    const p = checkForUpdate(host)
    await Promise.resolve()
    fire()
    await p
  })
  expect(leadQueue.length).toBe(0)
})
