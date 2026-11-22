// T-838: the hidden starter (T-831, `<name>:starter`) through Claude Code's side: the registered hooks of
// register.tsx and the Claude host's startTrigger. tests/start-queue.test.tsx checks the queue itself on a fake host;
// these check the wiring: turn.complete drains the queue at the starter's end, agent.offer and agent.spawn keep the
// starter type away from the lead's model, startTrigger maps $.agent.spawn's answer, and only one starter runs.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { register, symccAgentType } from '../hooks/register'
import { S, leadQueue } from '../hooks/app/state'
import { claudeAgents, claudeHost } from '../hooks/claude/host'
import { drainStarts, leadTurn, startAgent, starterEnded } from '../hooks/app/starts'
import type { HostAgentStart } from '../hooks/host'

type Handler = (...a: unknown[]) => unknown
/** register(on) with a fake `on`: each hook's handler and the .catch it was given (if any), by event name (as in hook-catch.test.tsx). */
function registered() {
  const hooks = new Map<string, { handler: Handler; caught?: Handler }>()
  const on = (name: string, ...rest: unknown[]) => {
    const entry: { handler: Handler; caught?: Handler } = { handler: rest[rest.length - 1] as Handler }
    hooks.set(name, entry)
    return { catch: (h: Handler) => void (entry.caught = h) }
  }
  register(on as never, {} as never)
  return hooks
}

/** A `next` for a .catch handler: `error` and `called` as the engine sets them, and what it answered. */
function caughtNext(answer: unknown, o: { called?: boolean } = {}) {
  const calls: unknown[] = []
  const next = Object.assign((e: unknown) => (calls.push(e), answer), { error: { kind: 'throw', message: 'boom', budget: 1000 }, called: !!o.called })
  return { next, calls }
}

/**
 * A Claude Code `$` with what the starter's path uses. agent.spawn answers the starter type with `starter` (by default
 * a new id "starter-<n>") and records every other start by name in `spawned`; a board read or write, a prompt to the
 * lead, and each timer are recorded too.
 */
function fake$(starter: (n: number) => unknown = n => ({ agentId: `starter-${n}` })) {
  const spawned: string[] = []
  const starterInputs: Record<string, unknown>[] = []
  const prompts: string[] = []
  const fsCalls: string[] = []
  const timers: { ms: number; f: () => void }[] = []
  const fsCall = (what: string) => (p: string) => (fsCalls.push(`${what} ${p}`), Promise.reject(new Error(`no file ${p}`)))
  const $ = {
    plugin: { name: 'symcc', root: '/plugin' },
    agent: {
      spawn: async (input: Record<string, unknown>) => {
        if (input.subagentType === 'symcc:starter') {
          starterInputs.push(input)
          return starter(starterInputs.length)
        }
        spawned.push(String(input.name))
        return { agentId: `id-${String(input.name)}` }
      },
      list: async () => [],
    },
    prompt: { submit: async (p: { text: string }) => (prompts.push(p.text), { isDelivered: true }) },
    fs: { read: fsCall('read'), write: fsCall('write'), exists: fsCall('exists'), list: fsCall('list'), stat: fsCall('stat') },
    clock: { after: (ms: number, f: () => void) => (timers.push({ ms, f }), { cancel() {} }), every: () => ({ cancel() {} }), sleep: async () => {} },
    ui: { toast: () => {}, status: () => {}, log: () => {}, invalidate: () => {}, open: () => {}, panes: () => [] },
    session: { send: async () => ({ isDelivered: true }) },
    tool: { call: async () => ({ result: 'ran' }) },
  }
  S.enabledNow = true
  S.root = '/repo' // the project folder is known, so a board read would reach $.fs
  return { $: $ as never, spawned, starterInputs, prompts, fsCalls, timers }
}

const worker = (name: string): HostAgentStart => ({ kind: 'worker', prompt: 'do it', name, description: `task ${name}` })

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

// ---------------- through the registered turn.complete hook ----------------

test("T-838 turn.complete: the starter's end starts both queued workers in that call, with no board update for the lead and no board read", async () => {
  const f = fake$()
  const host = claudeHost(f.$)
  void startAgent(host, worker('symcc-T-1'))
  void startAgent(host, worker('symcc-T-2'))
  await settle()
  // one hidden starter, under the starter type and its own name; no worker yet
  expect(f.starterInputs.length).toBe(1)
  expect(f.starterInputs[0]!.name).toBe('symcc-starter')
  expect(f.spawned).toEqual([])
  const complete = registered().get('turn.complete')!
  const r = await complete.handler(f.$, { agentId: 'starter-1', answer: 'OK' }, () => ({ passed: true }))
  expect(r).toEqual({ passed: true })
  expect(f.spawned).toEqual(['symcc-T-1', 'symcc-T-2'])
  // the lead was never woken: nothing queued for it, nothing sent
  expect(leadQueue).toEqual([])
  expect(f.prompts.filter(p => p.includes('Board update'))).toEqual([])
  // the starter is no board agent: its end reads and writes no board file
  await settle()
  expect(f.fsCalls).toEqual([])
})

test('T-838 turn.complete: an agent that is not the starter is looked up on the board (control for the no-board-read check)', async () => {
  const f = fake$()
  const host = claudeHost(f.$)
  void startAgent(host, worker('symcc-T-1'))
  await settle()
  await registered().get('turn.complete')!.handler(f.$, { agentId: 'some-worker', answer: 'done' }, () => ({}))
  await settle()
  expect(f.fsCalls.length).toBeGreaterThan(0)
})

// ---------------- agent.offer, symccAgentType and agent.spawn's .catch ----------------

test('T-838 agent.offer: the starter type is never offered to the lead, by the hook or by its .catch', async () => {
  const offer = registered().get('agent.offer')!
  const f = fake$()
  const passed = caughtNext({ isOffered: true })
  expect(await offer.handler(f.$, { agent: 'symcc:starter' }, passed.next)).toEqual({ isOffered: false })
  expect(passed.calls).toEqual([])
  const caught = caughtNext({ isOffered: true })
  expect(await offer.caught!(f.$, { agent: 'symcc:starter' }, caught.next)).toEqual({ isOffered: false })
  expect(caught.calls).toEqual([])
  // control: another type is offered as usual
  expect(await offer.handler(f.$, { agent: 'Explore' }, () => ({ isOffered: true }))).toEqual({ isOffered: true })
})

test("T-838 symccAgentType: '<plugin.json name>:starter' is symcc's own type", () => {
  expect(symccAgentType({ plugin: { name: 'mine' } } as never, 'mine:starter')).toBe(true)
  expect(symccAgentType({ plugin: { name: 'mine' } } as never, 'other:starter')).toBe(false)
})

test('T-838 agent.spawn: when the hook fails before passing it on, a start of the starter type is refused', async () => {
  const spawn = registered().get('agent.spawn')!
  const f = fake$()
  const { next, calls } = caughtNext({ model: 'sonnet' })
  const r = (await spawn.caught!(f.$, { subagentType: 'symcc:starter' }, next)) as { deny?: string }
  expect(typeof r.deny).toBe('string')
  expect(calls).toEqual([])
})

// ---------------- the Claude host's startTrigger ----------------

test("T-838 startTrigger: $.agent.spawn's deny makes it reject, an answer with no id gives {}", async () => {
  const denied = fake$(() => ({ deny: 'no' }))
  let err = ''
  await claudeAgents(denied.$).startTrigger!().catch(e => (err = (e as Error).message))
  expect(err).toBe('no')
  expect(await claudeAgents(fake$(() => ({})).$).startTrigger!()).toEqual({})
  expect(await claudeAgents(fake$().$).startTrigger!()).toEqual({ agentId: 'starter-1' })
})

test('T-857 startTrigger: stops the starter with TaskStop right after it gets its id; a failing stop changes nothing', async () => {
  const calls: unknown[] = []
  const f = fake$()
  const $ = f.$ as unknown as { tool: { call: (c: unknown) => Promise<unknown> } }
  $.tool.call = async c => (calls.push(c), { result: 'ok' })
  expect(await claudeAgents(f.$).startTrigger!()).toEqual({ agentId: 'starter-1' })
  expect(calls).toEqual([{ tool: 'TaskStop', task_id: 'starter-1' }])
  const g = fake$()
  ;(g.$ as unknown as { tool: { call: () => Promise<unknown> } }).tool.call = async () => {
    throw new Error('no stop')
  }
  expect(await claudeAgents(g.$).startTrigger!()).toEqual({ agentId: 'starter-1' })
})

test('T-857 stopped starter: its turn.complete with an empty answer still starts the queued workers', async () => {
  const f = fake$()
  const host = claudeHost(f.$)
  void startAgent(host, worker('symcc-T-1'))
  await settle()
  const r = await registered().get('turn.complete')!.handler(f.$, { agentId: 'starter-1', answer: '' }, () => ({ passed: true }))
  expect(r).toEqual({ passed: true })
  expect(f.spawned).toEqual(['symcc-T-1'])
})

for (const [what, answer] of [['refused', { deny: 'no' }], ['answers no id', {}]] as const) {
  test(`T-838 startTrigger ${what}: startAgent wakes the lead once and the worker starts at the next drainStarts`, async () => {
    const f = fake$(() => answer)
    const host = claudeHost(f.$)
    void startAgent(host, worker('symcc-T-1'))
    void startAgent(host, worker('symcc-T-2'))
    await settle()
    expect(f.starterInputs.length).toBe(1)
    expect(leadQueue.length).toBe(1)
    expect(leadQueue[0]).toContain('Starting worker symcc-T-1')
    expect(f.spawned).toEqual([])
    await drainStarts(host)
    expect(f.spawned).toEqual(['symcc-T-1', 'symcc-T-2'])
    expect(leadQueue.length).toBe(1)
  })
}

// ---------------- only one starter at a time ----------------

test('T-838 wake: while a starter runs, a new queued start starts no second one; that starter\'s end drains it', async () => {
  const f = fake$()
  const host = claudeHost(f.$)
  void startAgent(host, worker('symcc-T-1'))
  await settle()
  expect(f.starterInputs.length).toBe(1)
  // a lead turn starts and ends first: it drains A, the starter is still running
  leadTurn(true)
  await drainStarts(host)
  leadTurn(false)
  expect(f.spawned).toEqual(['symcc-T-1'])
  void startAgent(host, worker('symcc-T-2'))
  await settle()
  expect(f.starterInputs.length).toBe(1)
  expect(leadQueue).toEqual([])
  expect(f.spawned).toEqual(['symcc-T-1'])
  expect(await starterEnded(host, 'starter-1')).toBe(true)
  await drainStarts(host)
  expect(f.spawned).toEqual(['symcc-T-1', 'symcc-T-2'])
})
