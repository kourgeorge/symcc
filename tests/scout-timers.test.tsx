import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { SCOUT_SOON_MS, SCOUT_SPREAD_MS } from '../hooks/app/scouts'
import { inProject } from './project'
import { ran, readText, entry, pause } from './fakes'

const MIN = 60_000

/**
 * Fake scouts folder, scouts.json and board on a fake clock. Each published view is kept, so a test can read
 * every scout's next_run; a Write of a scout file (the engine's Write, faked) makes the plugin reschedule.
 */
function setup(on: On, files: Record<string, string | null>) {
  const views: { scouts?: { name: string; next_run?: string }[] }[] = []
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : /\/scouts$/.test(e.path) ? { value: true } : next(e)))
  on('fs.list', (_, e, next) =>
    e.path.endsWith('/.symcc/scouts') ? { value: Object.keys(files).filter(f => f.startsWith('/.symcc/scouts/') && files[f] !== null).map(f => entry(f.slice('/.symcc/scouts/'.length))) } : next(e),
  )
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  on('fs.write', () => ({ value: undefined }))
  on('state.set', (_, e, next) => {
    if (e.key === 'view') views.push(JSON.parse(JSON.stringify((e as { value?: { value?: unknown } }).value?.value ?? (e as { value?: unknown }).value)))
    return next(e)
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: ran() }))
  on('tool.call', (_, e) => {
    const a = e as unknown as { tool: string; file_path?: string; content?: string }
    if (a.tool === 'Write') files[a.file_path!.slice(a.file_path!.indexOf('/.symcc/'))] = a.content ?? ''
    return { result: 'ok' }
  })
  inProject(on)
  const clock = mock.clock(on, { now: Date.now() })
  return { views, clock }
}

const scoutFile = (every: number, body = 'Look around.') => `---\nevery_minutes: ${every}\n---\n${body}\n`
const memory = (m: Record<string, object>) => JSON.stringify({ scouts: m })

/** Writes scout `name`'s file through the (fake) Write tool and waits for the board to show it with that text. */
async function write($: { tool: { call(a: never): Promise<unknown> } }, views: unknown[], name: string, text: string) {
  const before = views.length
  await $.tool.call({ tool: 'Write', file_path: `/proj/.symcc/scouts/${name}.md`, content: text } as never)
  for (let i = 0; i < 100 && views.length === before; i++) await pause(5)
}
const nextAt = (views: { scouts?: { name: string; next_run?: string }[] }[], name: string) => Date.parse(views[views.length - 1]?.scouts?.find(s => s.name === name)?.next_run ?? '')

test('after a restart the next run is last_run + every_minutes, not now + every_minutes', async ($, on) => {
  const start = Date.now()
  const last = new Date(start - 30 * MIN).toISOString()
  const files: Record<string, string | null> = { '/.symcc/scouts/docs.md': scoutFile(120), '/scouts.json': memory({ docs: { last_run: last } }), '/board.json': JSON.stringify({ tasks: [] }), '/board.lock': null }
  const { views } = setup(on, files)
  await write($, views, 'docs', scoutFile(120))
  expect(nextAt(views, 'docs')).toBe(Date.parse(last) + 120 * MIN)
})

test('an overdue scout runs at the first check, and a scout that never ran runs soon after; they are spread apart', async ($, on) => {
  const start = Date.now()
  const files: Record<string, string | null> = {
    '/.symcc/scouts/a-old.md': scoutFile(2880),
    '/.symcc/scouts/b-new.md': scoutFile(2880),
    '/scouts.json': memory({ 'a-old': { last_run: new Date(start - 5 * 2880 * MIN).toISOString() } }),
    '/board.json': JSON.stringify({ tasks: [] }),
    '/board.lock': null,
  }
  const { views, clock } = setup(on, files)
  await write($, views, 'a-old', scoutFile(2880))
  const t0 = Date.now()
  expect(nextAt(views, 'a-old') - t0).toBeGreaterThanOrEqual(SCOUT_SOON_MS - 1000)
  expect(nextAt(views, 'a-old') - t0).toBeLessThanOrEqual(SCOUT_SOON_MS)
  expect(nextAt(views, 'b-new') - nextAt(views, 'a-old')).toBe(SCOUT_SPREAD_MS)
  const b = nextAt(views, 'b-new')
  // at the first check a-old's time comes: it tries to run (this test session doesn't drive the board, so it
  // doesn't start and waits a whole interval); b-new is still waiting for its turn
  await clock.advance(SCOUT_SOON_MS)
  await write($, views, 'c', scoutFile(0))
  expect(nextAt(views, 'a-old')).toBeGreaterThan(t0 + 2880 * MIN - 2 * MIN)
  expect(nextAt(views, 'b-new')).toBe(b)
  // (the write above set the timers again from the real time, which the fake clock doesn't move: wait b-new's whole wait)
  await clock.advance(SCOUT_SOON_MS + SCOUT_SPREAD_MS)
  await write($, views, 'c', scoutFile(0, 'Again.'))
  expect(nextAt(views, 'b-new')).toBeGreaterThan(t0 + 2880 * MIN - 2 * MIN)
})

test("editing scout A leaves scout B's next run alone; changing A's every_minutes counts from A's last run", async ($, on) => {
  const start = Date.now()
  const last = new Date(start - 10 * MIN).toISOString()
  const files: Record<string, string | null> = {
    '/.symcc/scouts/a.md': scoutFile(60),
    '/.symcc/scouts/b.md': scoutFile(60),
    '/scouts.json': memory({ a: { last_run: last }, b: { last_run: last } }),
    '/board.json': JSON.stringify({ tasks: [] }),
    '/board.lock': null,
  }
  const { views, clock } = setup(on, files)
  await write($, views, 'a', scoutFile(60))
  const b = nextAt(views, 'b')
  expect(b).toBe(Date.parse(last) + 60 * MIN)
  await clock.advance(20 * MIN)
  await write($, views, 'a', scoutFile(90))
  expect(nextAt(views, 'a')).toBe(Date.parse(last) + 90 * MIN)
  expect(nextAt(views, 'b')).toBe(b)
  await write($, views, 'a', scoutFile(90, 'Look harder.'))
  expect(nextAt(views, 'a')).toBe(Date.parse(last) + 90 * MIN)
  expect(nextAt(views, 'b')).toBe(b)
})

test('a paused scout keeps its next run but does not run', async ($, on) => {
  const start = Date.now()
  const last = new Date(start - 50 * MIN).toISOString()
  const files: Record<string, string | null> = { '/.symcc/scouts/p.md': scoutFile(60), '/scouts.json': memory({ p: { last_run: last, paused: true } }), '/board.json': JSON.stringify({ tasks: [] }), '/board.lock': null }
  const { views, clock } = setup(on, files)
  await write($, views, 'p', scoutFile(60))
  expect(nextAt(views, 'p')).toBe(Date.parse(last) + 60 * MIN)
  await clock.advance(30 * MIN)
  await write($, views, 'p', scoutFile(60, 'Same.'))
  expect(nextAt(views, 'p')).toBe(Date.parse(last) + 60 * MIN)
})
