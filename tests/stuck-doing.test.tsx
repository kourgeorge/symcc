// T-376: the board said a task was "doing" while no worker ran. After a reload, a live worker of this
// session must be kept (adopted), not stopped; a worker this copy stopped never counts as working on a
// task, so its task goes back to "todo" (folder and branch kept) at its hand-back or by the next regular
// check, and the lead is told. The plugin runs as loaded by the test kit, against the in-memory world
// below and the kit's fake clock.
import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { type Board, addTask, emptyBoard, patchTask } from '../hooks/board'
import { ran } from './fakes'

const T0 = 1_800_000_000_000
const ISO = new Date(T0 - 10 * 60_000).toISOString()
const BOARD = '/.symcc/board.json'
const LEAD = '/.symcc/lead.json'

type Agent = { id: string; name: string; status: string }

/**
 * Files in memory (keyed from "/.symcc/" on), a fake git that says yes to everything, and the agents
 * (`agents`, changed by the test). A message to an agent does not end it (`sent` keeps who got one).
 * `prompts` has what the lead was told.
 */
function world(on: On, agents: Agent[], sid = 's1', gate: { wait?: Promise<void> } = {}) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const sent: string[] = []
  const prompts: string[] = []
  const spawned: string[] = []
  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (files.set(key(e.path), (e as unknown as { text: string }).text), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', (_, e) => (spawned.push(String((e as unknown as { name?: string }).name)), { model: 'sonnet' }) as never)
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git') return { value: rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree' ? ran({ stdout: 'true\n' }) : ran({}) }
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
    return { value: ran({}) }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('tool.check', () => ({ decision: 'allow' }) as never)
  on('prompt.submit', (_, e) => (prompts.push(e.text), { text: e.text }) as never)
  on('agent.list', () => ({ value: agents.map(a => ({ ...a, type: 'symcc:worker' })) }) as never)
  // `gate.wait`, when set, holds every message until it resolves (a slow session.send)
  on('session.send', async (_, e) => {
    const to = (e as unknown as { to: string | { agentId: string } }).to
    sent.push(typeof to === 'string' ? to : to.agentId)
    if (gate.wait) await gate.wait
    return { isDelivered: true } as never
  })
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: sid }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  const board = () => JSON.parse(files.get(BOARD)!) as Board
  return { files, sent, prompts, spawned, clock, board, task: (id: string) => board().tasks.find(t => t.id === id)! }
}

/**
 * T-1 "doing" for `session` with agent `agent`; max_parallel 0, so no new worker starts by itself.
 * Its run started `started` (the fake clock doesn't move Date.now(): pass a time from the real
 * Date.now() where minutes since the start matter).
 */
function doing(session: string, agent: string, started = ISO): Board {
  const [b] = addTask({ ...emptyBoard(), mode: 'auto', max_parallel: 0 }, { origin: { why: 'a test' }, title: 'Build it', files: ['src/'], merge_into: 'main' }, ISO)
  return patchTask(b, 'T-1', { status: 'doing', session, agent, attempts: 1, branch: 'symcc/T-1', runs: [{ started }] } as never, ISO)
}

const tool = async ($: Engine, name: string, args: Record<string, unknown>) => {
  const r = (await $.tool.call({ tool: `mcp__symcc__${name}`, ...args } as never)) as { result?: string } | string
  return String(typeof r === 'string' ? r : r?.result ?? '')
}

const start = async ($: Engine, w: ReturnType<typeof world>) => {
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
}

// guard: already worked before T-376 (main adopts this case too); kept so it stays that way
test('(a) after a reload, the live worker of this session whose task is doing for it is adopted, not stopped', async ($, on) => {
  const w = world(on, [{ id: 'w1', name: 'symcc-T-1', status: 'running' }])
  w.files.set(BOARD, JSON.stringify(doing('s1', 'w1')))
  w.files.set(LEAD, JSON.stringify({ session: 's1', heartbeat: T0 - 1000 }) + '\n')
  await start($, w)
  expect(w.sent).toEqual([])
  expect(w.task('T-1').status).toBe('doing')
  expect(w.task('T-1').agent).toBe('w1')
  // and the regular checks keep it: it is still working
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.sent).toEqual([])
  expect(w.task('T-1').status).toBe('doing')
})

test('(a) the task names an older session id that no longer drives, but this very agent: it is adopted and moves to this session', async ($, on) => {
  const w = world(on, [{ id: 'w1', name: 'symcc-T-1', status: 'running' }])
  w.files.set(BOARD, JSON.stringify(doing('s0', 'w1')))
  await start($, w)
  expect(w.sent).toEqual([])
  expect(w.task('T-1').status).toBe('doing')
  expect(w.task('T-1').session).toBe('s1')
})

test('(a) a board that cannot be read when the plugin loads stops no worker', async ($, on) => {
  const w = world(on, [{ id: 'w1', name: 'symcc-T-1', status: 'running' }])
  w.files.set(BOARD, '{ not json')
  await start($, w)
  expect(w.sent).toEqual([])
})

test('(b, c) a worker this copy stopped that stays listed does not keep its task doing: the next check puts it back to todo, branch kept, lead told once', async ($, on) => {
  // T-1 names w1 (gone); w9 is another live agent for T-1 (by its name), so it is an orphan and is stopped.
  // It never ends: it stays listed as running.
  const agents = [{ id: 'w9', name: 'symcc-T-1', status: 'running' }]
  const w = world(on, agents)
  w.files.set(BOARD, JSON.stringify(doing('s1', 'w1')))
  await start($, w)
  expect(w.sent).toEqual(['w9'])
  // the wait for the stopped worker to end runs out; the task stays "doing" for now
  await w.clock.advance(20_000)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('doing')
  // the next regular check: w9 was stopped here, so nobody works on T-1
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  const t = w.task('T-1')
  expect(t.status).toBe('todo')
  expect(t.branch).toBe('symcc/T-1')
  expect(t.history.at(-1)).toMatch(/restarted: the old worker has ended/)
  // w9 is not messaged again (that would wake it up)
  expect(w.sent).toEqual(['w9'])
  await w.clock.advance(2_000)
  await w.clock.settle()
  const told = w.prompts.filter(p => p.includes('T-1 "Build it": no worker was working on it any more'))
  expect(told).toHaveLength(1)
  // later checks change nothing more and tell nothing more
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.prompts.filter(p => p.includes('no worker was working on it any more'))).toHaveLength(1)
})

// guard: already worked before T-376 (main sends such a task back too); kept so it stays that way
test('(b) a doing task of this session whose worker ended with no hand-back goes back to todo at the next check', async ($, on) => {
  const w = world(on, [{ id: 'w1', name: 'symcc-T-1', status: 'completed' }])
  // no board at the start, so nothing is sent back then; then the board shows T-1 "doing" for w1, which
  // this copy never tracked (as after a reload) and which has ended
  await start($, w)
  w.files.set(BOARD, JSON.stringify(doing('s1', 'w1')))
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('todo')
  expect(w.task('T-1').branch).toBe('symcc/T-1')
})

test('the hand-back of a worker stopped as an orphan does not leave its task stuck: it goes back to todo at once', async ($, on) => {
  const agents = [{ id: 'w9', name: 'symcc-T-1', status: 'running' }]
  const w = world(on, agents)
  w.files.set(BOARD, JSON.stringify(doing('s1', 'w1')))
  await start($, w)
  expect(w.sent).toEqual(['w9'])
  expect(w.task('T-1').status).toBe('doing')
  // it answers "stopped" and stays listed (idle)
  await $.turn.complete({ agentId: 'w9', answer: 'Stopped', isAborted: false, reason: 'answer', durationMs: 1000, turnId: 'turn-w9' } as never)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('todo')
  expect(w.task('T-1').branch).toBe('symcc/T-1')
})

test('a task sent back to todo because its worker was stopped gets a fresh worker even while the stopped agent stays listed', async ($, on) => {
  const agents = [{ id: 'w9', name: 'symcc-T-1', status: 'running' }]
  const w = world(on, agents)
  w.files.set(BOARD, JSON.stringify({ ...doing('s1', 'w1'), max_parallel: 2 }))
  await start($, w)
  expect(w.sent).toEqual(['w9'])
  await $.turn.complete({ agentId: 'w9', answer: 'Stopped', isAborted: false, reason: 'answer', durationMs: 1000, turnId: 'turn-w9' } as never)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('todo')
  // w9 stays listed as running, but this copy stopped it: it does not hold T-1, so a new worker starts
  for (let i = 0; i < 5 && !w.spawned.length; i++) {
    await w.clock.advance(2 * 60_000)
    await w.clock.settle()
  }
  // (the test kit can't hand the plugin the new agent's id, so the start itself then counts as failed)
  expect(w.spawned).toEqual(['symcc-T-1'])
  expect(w.task('T-1').branch).toBe('symcc/T-1')
})

test('a worker stopped on purpose (pause) does not make the regular check send its task back, even while the stop is slow', async ($, on) => {
  const agents = [{ id: 'w1', name: 'symcc-T-1', status: 'running' }]
  const gate: { wait?: Promise<void> } = {}
  const w = world(on, agents, 's1', gate)
  w.files.set(BOARD, JSON.stringify({ ...doing('s1', 'w1', new Date(Date.now() - 10 * 60_000).toISOString()), max_parallel: 2 }))
  w.files.set(LEAD, JSON.stringify({ session: 's1', heartbeat: T0 - 1000 }) + '\n')
  await start($, w)
  expect(w.task('T-1').status).toBe('doing')
  // the message telling w1 to stop is slow: the pause waits for it
  let release = () => {}
  gate.wait = new Promise<void>(r => (release = r))
  const paused = tool($, 'pause', { task: 'T-1' })
  await w.clock.settle()
  expect(w.sent).toEqual(['w1'])
  // meanwhile the regular check runs (w1 is stopped and no longer tracked; T-1 is still "doing")
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('doing')
  release()
  gate.wait = undefined
  expect(await paused).toMatch(/T-1 paused/)
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  const t = w.task('T-1')
  expect(t.status).toBe('paused')
  expect(t.history.some(h => /restarted/.test(h))).toBe(false)
  expect(w.prompts.some(p => p.includes('no worker was working on it any more'))).toBe(false)
  expect(w.spawned).toEqual([])
})

test('(c) a tracked worker that ends with no hand-back: its task fails right after the first check that sees it ended, not a check later', async ($, on) => {
  const agents = [{ id: 'w1', name: 'symcc-T-1', status: 'running' }]
  const w = world(on, agents)
  w.files.set(BOARD, JSON.stringify(doing('s1', 'w1', new Date(Date.now() - 10 * 60_000).toISOString())))
  w.files.set(LEAD, JSON.stringify({ session: 's1', heartbeat: T0 - 1000 }) + '\n')
  await start($, w)
  expect(w.task('T-1').status).toBe('doing')
  // the adopted worker ends with no hand-back, 10 s in
  await w.clock.advance(10_000)
  agents[0]!.status = 'completed'
  // the first check (at 2:00) sees it ended; its report may still come, so it waits a short grace
  await w.clock.advance(2 * 60_000 - 10_000)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('doing')
  // no report in the grace: the task fails, long before the next check (at 4:00)
  await w.clock.advance(30_000)
  await w.clock.settle()
  const t = w.task('T-1')
  expect(t.status).toBe('failed')
  expect(t.note).toBe('the worker ended without a result')
  expect(t.branch).toBe('symcc/T-1')
  await w.clock.advance(2_000)
  await w.clock.settle()
  expect(w.prompts.filter(p => p.includes('T-1 "Build it": the worker ended without a result'))).toHaveLength(1)
  // the next check changes nothing more
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('failed')
  expect(w.prompts.filter(p => p.includes('the worker ended without a result'))).toHaveLength(1)
})

test('a worker stopped because its time is up: a "Stopped" answer during the slow stop does not send the task back, it fails', async ($, on) => {
  const agents = [{ id: 'w1', name: 'symcc-T-1', status: 'running' }]
  const gate: { wait?: Promise<void> } = {}
  const w = world(on, agents, 's1', gate)
  const tenAgo = new Date(Date.now() - 10 * 60_000).toISOString()
  w.files.set(BOARD, JSON.stringify(patchTask(doing('s1', 'w1', tenAgo), 'T-1', { wrap_up: tenAgo } as never, ISO)))
  w.files.set(LEAD, JSON.stringify({ session: 's1', heartbeat: T0 - 1000 }) + '\n')
  await start($, w)
  expect(w.task('T-1').status).toBe('doing')
  // the message telling w1 its time is up is slow
  let release = () => {}
  gate.wait = new Promise<void>(r => (release = r))
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.sent).toContain('w1')
  // w1 answers "Stopped" while the stop is still on its way
  await $.turn.complete({ agentId: 'w1', answer: 'Stopped', isAborted: false, reason: 'answer', durationMs: 1000, turnId: 'turn-w1' } as never)
  await w.clock.settle()
  release()
  gate.wait = undefined
  await w.clock.settle()
  const t = w.task('T-1')
  expect(t.status).toBe('failed')
  expect(t.history.some(h => /restarted/.test(h))).toBe(false)
  expect(w.prompts.some(p => p.includes('no worker was working on it any more'))).toBe(false)
  expect(w.spawned).toEqual([])
})
