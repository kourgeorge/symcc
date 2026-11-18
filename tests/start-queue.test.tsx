// T-391: Claude Code skips symcc's own hooks (tool.check, tool.call) for an agent symcc starts from a timer or from
// a lead tool call, so a worker's file limits, the Bash folder guard, a checker's git block and ask_owner would not
// work for it. Every start is queued instead (hooks/app/starts.ts) and started only from session.start, the main
// loop's turn.start and turn.complete, where the hooks are kept (T-384, T-389). An idle lead is woken once.
import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { type Board, addTask, emptyBoard, patchTask, startRun } from '../hooks/board'
import type { Host, HostAgentStart } from '../hooks/host'
import { ALL_FEATURES, noUi } from '../hooks/host'
import { S, leadQueue } from '../hooks/app/state'
import { queuedNeverStarted, unclaimQueued } from '../hooks/app/workers'
import { startAgent, drainStarts, leadTurn, queuedStarts, cancelStarts, startCancelled, QUEUED_NOTE, STARTING_NOTE } from '../hooks/app/starts'
import { ran } from './fakes'
import { fakeHost as sharedFakeHost } from './fake-host'

// ---------------- the queue itself ----------------

/** A host with only what the queue uses: agents.spawn (recorded; `fail` names make it throw) and a clock whose timers are kept. */
function fakeHost(fail: string[] = []) {
  const spawned: string[] = []
  const timers: { ms: number; f: () => void }[] = []
  const host = {
    agents: {
      spawn: async (a: HostAgentStart) => {
        spawned.push(a.name)
        if (fail.includes(a.name)) throw new Error(`${a.name} refused`)
        return { agentId: `id-${a.name}` }
      },
    },
    clock: { after: (ms: number, f: () => void) => (timers.push({ ms, f }), { cancel() {} }) },
    lead: { send: async () => undefined },
    ui: noUi,
    features: ALL_FEATURES,
  } as unknown as Host
  S.enabledNow = true
  return { host, spawned, timers }
}

const worker = (name: string): HostAgentStart => ({ kind: 'worker', prompt: 'do it', name, description: `task ${name}` })

test('a start is queued, not spawned; the next drain (a turn) starts it once and answers its id', async () => {
  const { host, spawned } = fakeHost()
  const p = startAgent(host, worker('symcc-T-1'))
  await Promise.resolve()
  expect(spawned).toEqual([])
  expect(queuedStarts()).toBe(1)
  await drainStarts(host)
  expect(await p).toEqual({ agentId: 'id-symcc-T-1' })
  expect(spawned).toEqual(['symcc-T-1'])
  // later turns start nothing again
  await drainStarts(host)
  await drainStarts(host)
  expect(spawned).toEqual(['symcc-T-1'])
})

test('a start taken back (cancelStarts) or no longer wanted (its still check) rejects as cancelled and never starts', async () => {
  const { host, spawned } = fakeHost()
  const a = startAgent(host, worker('symcc-T-1')).catch(e => e)
  const b = startAgent(host, worker('symcc-T-2'), async () => false).catch(e => e)
  const c = startAgent(host, worker('symcc-T-3'), () => true)
  expect(cancelStarts(x => x.name === 'symcc-T-1')).toBe(1)
  expect(startCancelled(await a)).toBe(true)
  await drainStarts(host)
  expect(startCancelled(await b)).toBe(true)
  expect(await c).toEqual({ agentId: 'id-symcc-T-3' })
  expect(spawned).toEqual(['symcc-T-3'])
})

test('two drains at once (two turns ending together) still start each queued agent once', async () => {
  const { host, spawned } = fakeHost()
  const ps = ['symcc-T-1', 'symcc-T-2', 'symcc-T-3'].map(n => startAgent(host, worker(n)))
  await Promise.all([drainStarts(host), drainStarts(host), drainStarts(host)])
  await Promise.all(ps)
  expect([...spawned].sort()).toEqual(['symcc-T-1', 'symcc-T-2', 'symcc-T-3'])
})

test('a start that fails rejects only its own wait; the others still start', async () => {
  const { host, spawned } = fakeHost(['symcc-T-2'])
  const a = startAgent(host, worker('symcc-T-1'))
  const b = startAgent(host, worker('symcc-T-2'))
  const c = startAgent(host, worker('symcc-T-3'))
  await drainStarts(host)
  expect(await a).toEqual({ agentId: 'id-symcc-T-1' })
  await expect(b).rejects.toThrow('symcc-T-2 refused')
  expect(await c).toEqual({ agentId: 'id-symcc-T-3' })
  expect(spawned).toEqual(['symcc-T-1', 'symcc-T-2', 'symcc-T-3'])
})

test('an idle lead is woken once for several queued starts; after the queue emptied, a new start wakes it again', async () => {
  const { host, timers } = fakeHost()
  void startAgent(host, worker('symcc-T-1'))
  void startAgent(host, worker('symcc-T-2'))
  void startAgent(host, { kind: 'scout', prompt: 'look', name: 'symcc-scout-a', description: 'scout a' })
  // one board update (tellLead's 1.5 s timer), with one line
  expect(timers.map(t => t.ms)).toEqual([1500])
  expect(leadQueue.length).toBe(1)
  expect(leadQueue[0]).toContain('Starting worker symcc-T-1 (task symcc-T-1)')
  expect(leadQueue[0]).toContain('Nothing to do for it.')
  await drainStarts(host)
  void startAgent(host, worker('symcc-T-4'))
  expect(leadQueue.length).toBe(2)
  expect(leadQueue[1]).toContain('symcc-T-4')
})

test('while the lead is in a turn, a queued start wakes nobody: that turn ends and starts it', async () => {
  const { host, spawned, timers } = fakeHost()
  leadTurn(true)
  void startAgent(host, worker('symcc-T-1'))
  expect(timers).toEqual([])
  expect(leadQueue).toEqual([])
  leadTurn(false)
  await drainStarts(host)
  expect(spawned).toEqual(['symcc-T-1'])
})

test('T-470: with no start queue (features.startQueue off) startAgent spawns at once: nothing queued, no wake-up, no lead message; a start no longer wanted is cancelled', async () => {
  const timers: number[] = []
  const f = sharedFakeHost({ features: { startQueue: false }, clock: { after: ms => (timers.push(ms), { cancel() {} }) } })
  S.enabledNow = true
  const p = startAgent(f.host, worker('symcc-T-1'))
  expect(queuedStarts()).toBe(0)
  expect(await p).toEqual({ agentId: 'agent-1' })
  expect(f.spawns.map(a => a.name)).toEqual(['symcc-T-1'])
  expect(startCancelled(await startAgent(f.host, worker('symcc-T-2'), () => false).catch(e => e))).toBe(true)
  expect(f.spawns.length).toBe(1)
  expect(timers).toEqual([])
  expect(leadQueue).toEqual([])
  expect(f.toLead).toEqual([])
})

// ---------------- through the loaded plugin ----------------

const T0 = 1_800_000_000_000
const ISO = new Date(T0 - 60_000).toISOString()
const BOARD = '/.symcc/board.json'

/** In-memory files (keyed from "/.symcc/" on), a git that says yes to everything, no agents running. `spawned`: the agents asked for, by name. */
function world(on: On) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const spawned: string[] = []
  const prompts: string[] = []
  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (files.set(key(e.path), (e as unknown as { text: string }).text), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // the test kit can't hand back a new agent's id, so each start then counts as failed: what matters is when it is asked for
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
  on('prompt.submit', (_, e) => (prompts.push(e.text), { text: e.text }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('session.send', () => ({ isDelivered: true }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 's1' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  const board = () => JSON.parse(files.get(BOARD)!) as Board
  return { files, spawned, prompts, clock, task: (id: string) => board().tasks.find(t => t.id === id)! }
}

/** A board in auto mode with `n` tasks to do. */
function todo(n: number, maxParallel = 2): Board {
  let b: Board = { ...emptyBoard(), mode: 'auto', max_parallel: maxParallel }
  for (let i = 1; i <= n; i++) b = addTask(b, { origin: { why: 'a test' }, title: `Change ${i}`, files: [`src${i}/`], merge_into: 'main' }, ISO)[0]
  return b
}

const wakeUps = (prompts: string[]) => prompts.filter(p => p.startsWith('[symcc] Board update:') && p.includes('starts agents only when a turn starts or ends'))
const leadTurnStarts = ($: Engine, id: string) => $.turn.start({ text: '', turnId: id } as never)
const leadTurnEnds = ($: Engine, id: string) => $.turn.complete({ answer: 'ok', isAborted: false, reason: 'answer', durationMs: 1000, turnId: id } as never)

test('loaded: work found by a timer (the start-up pump) is queued, the idle lead is woken once, and the wake-up turn starts it once', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(todo(2)))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  // both claimed, shown honestly as waiting to start, and not started from the timer
  expect(w.spawned).toEqual([])
  expect(w.task('T-1').status).toBe('doing')
  expect(w.task('T-1').note).toBe(QUEUED_NOTE)
  expect(w.task('T-2').note).toBe(QUEUED_NOTE)
  // one wake-up for both
  await w.clock.advance(1500)
  await w.clock.settle()
  expect(wakeUps(w.prompts).length).toBe(1)
  // the wake-up's turn starts them (inside turn.start, where Claude Code keeps symcc's hooks)
  await leadTurnStarts($, 'wake')
  await w.clock.settle()
  expect([...w.spawned].sort()).toEqual(['symcc-T-1', 'symcc-T-2'])
  // that turn's end, and later turns, start nothing twice
  await leadTurnEnds($, 'wake')
  await leadTurnStarts($, 'next')
  await leadTurnEnds($, 'next')
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect([...w.spawned].sort()).toEqual(['symcc-T-1', 'symcc-T-2'])
  expect(wakeUps(w.prompts).length).toBe(1)
})

test('T-471 loaded: claiming a new try clears the agent of the try before, so that old agent is never taken as the new try\'s worker', async ($, on) => {
  const w = world(on)
  const b = todo(1)
  b.tasks[0] = { ...b.tasks[0]!, attempts: 1, agent: 'w-old' }
  w.files.set(BOARD, JSON.stringify(b))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('doing')
  expect(w.task('T-1').note).toBe(QUEUED_NOTE)
  expect(w.task('T-1').attempts).toBe(2)
  expect(w.task('T-1').agent).toBeUndefined()
})

test('loaded: a worker asked for by a lead tool call (add) is queued, wakes nobody (the lead is in its turn), and starts at that turn\'s end', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(todo(0)))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  await leadTurnStarts($, 'lead')
  const r = (await $.tool.call({ tool: 'mcp__symcc__add', title: 'Fix it', why: 'a test', files: ['src/'], origin_by: 'lead' } as never)) as { result?: string }
  expect(String(r?.result ?? r)).toContain('added T-1')
  await w.clock.settle()
  await w.clock.advance(1500)
  await w.clock.settle()
  expect(w.spawned).toEqual([])
  expect(w.task('T-1').note).toBe(QUEUED_NOTE)
  expect(wakeUps(w.prompts)).toEqual([])
  await leadTurnEnds($, 'lead')
  await w.clock.settle()
  expect(w.spawned).toEqual(['symcc-T-1'])
})

test('loaded: an agent\'s turn.complete (a worker finishing) starts the queue too, and a new session.start does', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(todo(0, 3)))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  await leadTurnStarts($, 'lead')
  await $.tool.call({ tool: 'mcp__symcc__add', title: 'One', why: 'a test', files: ['a/'], origin_by: 'lead' } as never)
  await w.clock.settle()
  expect(w.spawned).toEqual([])
  // some other agent of the session ends its turn: the queue empties there
  await $.turn.complete({ agentId: 'other', answer: 'done', isAborted: false, reason: 'answer', durationMs: 1000, turnId: 'turn-other' } as never)
  await w.clock.settle()
  expect(w.spawned).toEqual(['symcc-T-1'])
  await $.tool.call({ tool: 'mcp__symcc__add', title: 'Two', why: 'a test', files: ['b/'], origin_by: 'lead' } as never)
  await w.clock.settle()
  expect(w.spawned).toEqual(['symcc-T-1'])
  // a session start (a reload, a resumed session) empties it as well
  await $.session.start({ cwd: '/repo' } as never)
  expect(w.spawned).toEqual(['symcc-T-1', 'symcc-T-2'])
  await w.clock.settle()
  // the same try started: a worker still in the queue is this copy's, so the session start doesn't send its task back
  expect(w.task('T-2').attempts).toBe(1)
})

// A worker still waiting in the queue is stopped like a running one: drop, pause and /symcc-off take it back out, so it never starts.
for (const [what, stop, status] of [
  ['dropped', ($: Engine) => $.tool.call({ tool: 'mcp__symcc__drop', task: 'T-1' } as never), 'dropped'],
  ['paused', ($: Engine) => $.tool.call({ tool: 'mcp__symcc__pause', task: 'T-1' } as never), 'paused'],
  ['turned off (/symcc-off)', ($: Engine) => $.command.run({ command: 'symcc-off', args: '', origin: { kind: 'composer' }, presentation: 'text' } as never), 'todo'],
] as const) {
  test(`loaded: a queued worker whose task is ${what} before the next turn never starts`, async ($, on) => {
    const w = world(on)
    w.files.set(BOARD, JSON.stringify(todo(1)))
    await $.session.start({ cwd: '/repo' } as never)
    await w.clock.settle()
    expect(w.task('T-1').note).toBe(QUEUED_NOTE)
    expect(w.spawned).toEqual([])
    await stop($)
    await w.clock.settle()
    expect(w.task('T-1').status).toBe(status)
    expect(w.task('T-1').note).not.toBe(QUEUED_NOTE)
    await leadTurnStarts($, 'lead')
    await leadTurnEnds($, 'lead')
    await w.clock.settle()
    expect(w.spawned).toEqual([])
  })
}

// ---------------- T-428: a queued start lost (a reload) is not a worker that ended ----------------

/**
 * Board `b` with task `id` claimed by session s1 and its worker only queued (QUEUED_NOTE), as queueWorker leaves it,
 * but with nothing in the loaded copy's start queue: what a reload (another task merging) leaves behind.
 */
const lostStart = (b: Board, id: string, session = 's1'): Board =>
  patchTask(b, id, { status: 'doing', session, attempts: 1, branch: `symcc/${id}`, note: QUEUED_NOTE, runs: startRun(undefined, ISO) }, ISO)

const sentBack = (h: string) => h.includes('old worker has ended') || h.includes('restarted')

test('T-428 loaded: after a reload lost the queue, the session start queues the task again on the same try, with no "restarted" line and no word to the lead', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(lostStart(todo(1), 'T-1')))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  // the fresh copy waits a moment (RELOAD_SETTLE_MS) before it decides about "doing" tasks with no worker
  await w.clock.advance(5_000)
  await w.clock.settle()
  expect(w.task('T-1').note).toBe(QUEUED_NOTE)
  expect(w.task('T-1').attempts).toBe(1)
  await leadTurnStarts($, 'wake')
  await w.clock.settle()
  expect(w.spawned).toEqual(['symcc-T-1'])
  const t = w.task('T-1')
  expect(t.attempts).toBe(1)
  expect(t.runs?.length).toBe(1)
  expect(t.history.some(sentBack)).toBe(false)
  expect(w.prompts.some(p => p.includes('no worker was working on'))).toBe(false)
})

test('T-428 loaded: the regular check, with no reload, finds a queued task its copy no longer holds: it gets its worker on the same try, not "the old worker has ended"', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify({ ...todo(1), max_parallel: 3 }))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  expect(w.task('T-1').note).toBe(QUEUED_NOTE)
  // T-2 is on the board as claimed by this session and queued, but this copy's start queue doesn't have it
  const b = JSON.parse(w.files.get(BOARD)!) as Board
  const [withT2] = addTask(b, { origin: { why: 'a test' }, title: 'Change 2', files: ['src2/'], merge_into: 'main' }, ISO)
  w.files.set(BOARD, JSON.stringify(lostStart(withT2, 'T-2')))
  for (let i = 0; i < 3; i++) {
    await w.clock.advance(2 * 60_000)
    await w.clock.settle()
  }
  expect(w.task('T-2').status).toBe('doing')
  expect(w.task('T-2').note).toBe(QUEUED_NOTE)
  await leadTurnStarts($, 'wake')
  await w.clock.settle()
  expect([...w.spawned].sort()).toEqual(['symcc-T-1', 'symcc-T-2'])
  for (const id of ['T-1', 'T-2']) {
    const t = w.task(id)
    expect(t.attempts).toBe(1)
    expect(t.history.some(sentBack)).toBe(false)
  }
  expect(w.prompts.some(p => p.includes('no worker was working on'))).toBe(false)
})

test('T-428: a doing task whose worker started (no longer the queued note) is not unclaimed; only a queued one is, with no try counted', () => {
  const [b0] = addTask({ ...emptyBoard(), mode: 'auto' }, { origin: { why: 'a test' }, title: 'One', files: ['a/'] }, ISO)
  const t = { ...b0.tasks[0]!, status: 'doing' as const, attempts: 1, note: 'worker on it', session: 's1', runs: [{ started: ISO }] }
  expect(queuedNeverStarted(t)).toBe(false)
  expect(unclaimQueued({ ...b0, tasks: [t] }, 's1', null, ISO).tasks[0]!.status).toBe('doing')
  // the same task still only queued: unclaimed, its try not counted and its run taken off
  const q = { ...t, note: QUEUED_NOTE }
  expect(queuedNeverStarted(q)).toBe(true)
  const u = unclaimQueued({ ...b0, tasks: [q] }, 's1', null, ISO).tasks[0]!
  expect(u.status).toBe('todo')
  expect(u.attempts).toBe(0)
  expect(u.runs).toBeUndefined()
  expect(u.history).toEqual(t.history)
})

test('T-470: a claim cut off before its worker started on a host with no start queue (note STARTING_NOTE) is unclaimed too, with no try counted', () => {
  const [b0] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'One', files: ['a/'] }, ISO)
  const t = { ...b0.tasks[0]!, status: 'doing' as const, session: 'old', attempts: 1, note: STARTING_NOTE, runs: [{ started: ISO }] }
  expect(STARTING_NOTE).toBe('worker starting')
  expect(queuedNeverStarted(t)).toBe(true)
  const u = unclaimQueued({ ...b0, tasks: [t] }, 'old', null, ISO).tasks[0]!
  expect(u.status).toBe('todo')
  expect(u.attempts).toBe(0)
  expect(u.runs).toBeUndefined()
})
