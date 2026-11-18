// session.start must not wait on the clock for old workers (T-185). A hook has 10 s, and claimLead can wait for
// old workers it stopped to end (up to ORPHAN_WAIT_MS, 20 s) and for the reload settle (RELOAD_SETTLE_MS, 2 s).
// session.start goes on without those waits; pump starts no work until they are over.
// The plugin runs as loaded by the test kit; files, git and agents are the fake world below, time is the fake clock.
import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { type Board, addTask, emptyBoard, patchTask } from '../hooks/board'
import { ORPHAN_WAIT_MS, RELOAD_SETTLE_MS } from '../hooks/app/workers'
import { ran } from './fakes'
import type { ProcessRunResult } from 'claude-code'

const T0 = 1_800_000_000_000
const ISO = new Date(T0 - 60_000).toISOString()
const BOARD = '/.symcc/board.json'

type Res = ProcessRunResult
const ok = (stdout = ''): Res => ran({ stdout })

/**
 * Files in memory (keyed from "/.symcc/" on), a fake git that says yes to everything, and the agents.
 * `agents` stay listed as running forever (a message to stop them does nothing): old workers that never end.
 * `spawned` has the workers pump asked to start.
 */
function world(on: On, o: { agents?: { id: string; type: string }[] } = {}) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const spawned: { name: string }[] = []
  const sent: string[] = []

  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (files.set(key(e.path), (e as unknown as { text: string }).text), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', (_, e) => (spawned.push({ name: String((e as unknown as { name?: string }).name) }), { model: 'sonnet' }) as never)
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git') return { value: rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree' ? ok('true\n') : ok() }
    // the board's lock and its save through a temp file (see store.ts)
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: ran({ exitCode: 1, stderr: 'File exists' }) }
      files.set(key(rest[1]!), files.get(key(rest[0]!)) ?? '')
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      files.set(key(to!), files.get(key(from!)) ?? '')
      files.delete(key(from!))
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(key(p))
    return { value: ok() }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('agent.list', () => ({ value: (o.agents ?? []).map(a => ({ ...a, status: 'running' })) }) as never)
  on('session.send', (_, e) => {
    const to = (e as unknown as { to: string | { agentId: string } }).to
    sent.push(typeof to === 'string' ? to : to.agentId)
    return { isDelivered: true } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  const board = () => JSON.parse(files.get(BOARD)!) as Board
  return { files, spawned, sent, clock, board, task: (id: string) => board().tasks.find(t => t.id === id)! }
}

/** T-1 "doing" in this session ("me") for agent ag9 (not listed: its worker is gone), and T-2 to do. */
function board(maxParallel: number): Board {
  let b: Board = { ...emptyBoard(), mode: 'auto', max_parallel: maxParallel }
  b = addTask(b, { origin: { why: 'a test' }, title: 'Change a', files: ['src/'], merge_into: 'main' }, ISO)[0]
  b = addTask(b, { origin: { why: 'a test' }, title: 'Change b', files: ['docs/'], merge_into: 'main' }, ISO)[0]
  return patchTask(b, 'T-1', { status: 'doing', attempts: 1, session: 'me', agent: 'ag9', branch: 'symcc/T-1', runs: [{ started: ISO }] } as never, ISO)
}

/** The lead's next turn starts (the wake-up symcc sent, or the owner's prompt): queued workers start there (T-391). */
async function nextTurn($: Engine, w: { clock: { settle(): Promise<unknown> } }) {
  await $.turn.start({ text: '', turnId: 'next' } as never)
  await w.clock.settle()
}

/** Starts the session without waiting for it; `done()` says whether session.start has returned. */
function start($: Engine) {
  let finished = false
  const p = ($.session.start({ cwd: '/repo' } as never) as Promise<unknown>).then(() => (finished = true))
  return { p, done: () => finished }
}

test('session.start returns without the clock moving while an old worker it stopped never ends', async ($, on) => {
  // no board: old1 has no task here, so it is an orphan and is told to stop; it keeps running
  const w = world(on, { agents: [{ id: 'old1', type: 'symcc:worker' }] })
  const s = start($)
  await w.clock.settle()
  expect(s.done()).toBe(true)
  expect(w.sent).toEqual(['old1'])
  // the wait for old1 goes on behind session.start (up to ORPHAN_WAIT_MS), and pump starts nothing meanwhile
  await w.clock.advance(5_000)
  await w.clock.settle()
  expect(w.spawned).toEqual([])
  expect(ORPHAN_WAIT_MS).toBeGreaterThan(10_000)
})

test('a "doing" task with no live agent goes back to todo after RELOAD_SETTLE_MS, not before', async ($, on) => {
  const w = world(on)
  // max_parallel 0: pump starts nothing, so the task stays where the reset put it
  w.files.set(BOARD, JSON.stringify(board(0)))
  const s = start($)
  await w.clock.settle()
  expect(s.done()).toBe(true)
  expect(RELOAD_SETTLE_MS).toBe(2_000)
  await w.clock.advance(1_999)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('doing')
  await w.clock.advance(1)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('todo')
  expect(w.task('T-1').note).toBe('restarted after Claude Code was reopened')
})

test('pump starts no work while session.start is still waiting for the reload settle', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(board(2)))
  const s = start($)
  await w.clock.settle()
  expect(s.done()).toBe(true)
  // T-2 is ready from the start, but nothing starts before the settle is over
  await w.clock.advance(1_999)
  await w.clock.settle()
  expect(w.spawned).toEqual([])
  await w.clock.advance(1)
  await w.clock.settle()
  // both are queued, and start at the lead's next turn
  expect(w.spawned).toEqual([])
  await nextTurn($, w)
  expect(w.spawned.map(x => x.name).sort()).toEqual(['symcc-T-1', 'symcc-T-2'])
})

test('two session.starts in a row: the older one finishing its wait starts no work; only the newer one does', async ($, on) => {
  const agents: { id: string; type: string }[] = []
  const w = world(on, { agents })
  w.files.set(BOARD, JSON.stringify(board(2)))
  // first start: T-1 "doing" with no live agent, so its claimLead waits RELOAD_SETTLE_MS
  const s1 = start($)
  await w.clock.settle()
  expect(s1.done()).toBe(true)
  // an old worker shows up before the second start: it is told to stop and keeps running, so the
  // second start's claimLead keeps waiting for it after the first one's wait is over
  agents.push({ id: 'old1', type: 'symcc:worker' })
  const s2 = start($)
  await w.clock.settle()
  expect(s2.done()).toBe(true)
  expect(w.sent).toEqual(['old1'])
  // the first start's claimLead ends (T-1 went back to todo), but T-2 must not start yet
  await w.clock.advance(RELOAD_SETTLE_MS)
  await w.clock.settle()
  expect(w.spawned.filter(x => x.name === 'symcc-T-2')).toEqual([])
  expect(w.task('T-1').status).toBe('todo')
  await w.clock.advance(1_500)
  await w.clock.settle()
  await nextTurn($, w)
  expect(w.spawned).toEqual([])
  // old1 ends: the second start's claimLead ends on its next look, and now T-2 gets one worker (at the next turn)
  agents.splice(0)
  await w.clock.advance(500)
  await w.clock.settle()
  await nextTurn($, w)
  expect(w.spawned.filter(x => x.name === 'symcc-T-2')).toHaveLength(1)
})
