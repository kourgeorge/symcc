// T-397: every gating hook of register.tsx has a .catch, so a symcc error never fails open. agent.offer and
// agent.spawn keep symcc's own agent types away from the lead's model when they fail; the other hooks pass the
// event on as if symcc weren't there. Each failure is logged once (hookFailed, shared with T-390's guardFailed).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { register, symccAgentType } from '../hooks/register'
import { S, workers } from '../hooks/app/state'

type Handler = (...a: unknown[]) => unknown
/** register(on) with a fake `on`: each hook's handler and the .catch it was given (if any), by event name. */
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

/** A `$` with only what the .catch handlers read: the plugin's name and a log. */
function fake$(logs: string[] = []) {
  return { plugin: { name: 'symcc', root: '/plugin' }, ui: { log: (t: string) => void logs.push(t) } } as never
}

/** A `next` for a .catch handler: `error` and `called` as the engine sets them, and what it answered. */
function caughtNext(answer: unknown, o: { called?: boolean; message?: string } = {}) {
  const calls: unknown[] = []
  const next = Object.assign((e: unknown) => (calls.push(e), answer), { error: { kind: 'throw', message: o.message ?? 'boom', budget: 1000 }, called: !!o.called })
  return { next, calls }
}

const GATING = ['tool.call', 'tool.check', 'agent.offer', 'agent.spawn', 'prompt.submit', 'command.run', 'classic.UserPromptSubmit', 'classic.Stop', 'classic.SessionStart', 'classic.SubagentStop', 'ui.close', 'ui.focus', 'ui.scroll']

test('every gating hook symcc registers has a .catch', () => {
  const hooks = registered()
  for (const name of GATING) {
    expect(hooks.has(name)).toBe(true)
    expect(typeof hooks.get(name)!.caught).toBe('function')
  }
})

test("agent.offer: when the hook throws, symcc's worker and scout types stay hidden; any other type is offered as usual", async () => {
  const offer = registered().get('agent.offer')!
  // the handler itself throws: the plugin's name in use can't be read
  const N = S.N
  S.named = true
  Object.defineProperty(S, 'N', { configurable: true, get: () => { throw new Error('no name') } })
  try {
    expect(() => offer.handler(fake$(), { agent: 'symcc:worker' }, () => ({ isOffered: true }))).toThrow()
    const logs: string[] = []
    for (const agent of ['symcc:worker', 'symcc:worker-web', 'symcc:worker-websearch', 'symcc:scout']) {
      const { next, calls } = caughtNext({ isOffered: true })
      expect(await offer.caught!(fake$(logs), { agent }, next)).toEqual({ isOffered: false })
      expect(calls).toEqual([])
    }
    // hidden even when the failed hook had passed it on
    expect(await offer.caught!(fake$(logs), { agent: 'symcc:worker' }, caughtNext({ isOffered: true }, { called: true }).next)).toEqual({ isOffered: false })
    const { next, calls } = caughtNext({ isOffered: true })
    expect(await offer.caught!(fake$(logs), { agent: 'Explore' }, next)).toEqual({ isOffered: true })
    expect(calls.length).toBe(1)
  } finally {
    Object.defineProperty(S, 'N', { configurable: true, writable: true, enumerable: true, value: N })
  }
  // the failure is logged once per reason
  const logs: string[] = []
  for (const agent of ['symcc:worker', 'symcc:scout', 'Explore']) await offer.caught!(fake$(logs), { agent }, caughtNext({ isOffered: true }, { message: 'again' }).next)
  expect(logs.length).toBe(1)
  expect(logs[0]).toMatch(/the agent\.offer hook it failed \(again\)/)
})

test("symcc's agent types are known under the plugin.json name too, and odd input is no symcc type", () => {
  const $ = { plugin: { name: 'mine' } } as never
  expect(symccAgentType($, 'mine:worker')).toBe(true)
  expect(symccAgentType($, 'mine:scout')).toBe(true)
  expect(symccAgentType($, 'symcc:worker-web')).toBe(true)
  expect(symccAgentType($, 'mine:workers')).toBe(false)
  expect(symccAgentType($, 'Explore')).toBe(false)
  expect(symccAgentType($, undefined)).toBe(false)
  expect(symccAgentType($, { toString: () => 'symcc:worker' })).toBe(false)
  // a plugin name that can't be read still leaves the default one
  expect(symccAgentType({ get plugin(): never { throw new Error('x') } } as never, 'symcc:scout')).toBe(true)
})

test("agent.spawn: when the hook fails before passing it on, the start of a symcc agent type is refused; others start", async () => {
  const spawn = registered().get('agent.spawn')!
  const deny = caughtNext({ model: 'sonnet' })
  expect(await spawn.caught!(fake$(), { subagentType: 'symcc:worker' }, deny.next)).toEqual({ deny: "symcc couldn't check this agent start, so it was refused: it failed (boom)" })
  expect(deny.calls).toEqual([])
  const other = caughtNext({ model: 'sonnet' })
  expect(await spawn.caught!(fake$(), { subagentType: 'Explore' }, other.next)).toEqual({ model: 'sonnet' })
  // once it had passed the start on, that answer stands
  expect(await spawn.caught!(fake$(), { subagentType: 'symcc:worker' }, caughtNext({ model: 'sonnet' }, { called: true }).next)).toEqual({ model: 'sonnet' })
})

test("the other gating hooks pass the event on unchanged when they fail, and a failing log changes nothing", async () => {
  const hooks = registered()
  const broken = { plugin: { name: 'symcc' }, ui: { log: () => { throw new Error('no log') } } } as never
  for (const name of ['prompt.submit', 'command.run', 'classic.UserPromptSubmit', 'classic.Stop', 'classic.SessionStart', 'classic.SubagentStop', 'ui.close', 'ui.focus', 'ui.scroll']) {
    const e = { marker: name }
    const { next, calls } = caughtNext({ answer: name })
    expect(await hooks.get(name)!.caught!(broken, e, next)).toEqual({ answer: name })
    expect(calls).toEqual([e])
  }
})

test("T-390 tool.call: when the hook itself fails (findRoot throws), a worker's ask_owner is refused, the lead's symcc tool gets the error, the lead's other calls go on", async () => {
  const call = registered().get('tool.call')!
  const logs: string[] = []
  // the project folder is not known yet and the session can't tell it: findRoot throws
  const $ = {
    plugin: { name: 'symcc', root: '/plugin' },
    ui: { log: (t: string) => void logs.push(t) },
    session: { repo: () => { throw new Error('no repo') }, root: () => { throw new Error('no root') } },
  } as never
  workers.set('w1', { task: 'T-1', worktree: '/repo/.symcc/worktrees/T-1' } as never)
  const ask = { tool: 'mcp__symcc__ask_owner', agentId: 'w1', question: 'Which?' }
  let thrown = ''
  try {
    await call.handler($, ask, () => ({ result: 'ran' }))
  } catch (err) {
    thrown = (err as Error).message
  }
  expect(thrown).toBe('no repo')
  // what the engine then asks the .catch
  const worker = caughtNext({ result: 'ran' }, { message: thrown })
  expect(await call.caught!($, ask, worker.next)).toEqual({ deny: "symcc couldn't check this call, so it was refused: it failed (no repo)" })
  expect(worker.calls).toEqual([])
  const board = caughtNext({ result: 'ran' }, { message: thrown })
  expect(await call.caught!($, { tool: 'mcp__symcc__board' }, board.next)).toEqual({ result: "error: symcc couldn't run this tool: it failed (no repo)" })
  expect(board.calls).toEqual([])
  const read = caughtNext({ result: 'file text' }, { message: thrown })
  expect(await call.caught!($, { tool: 'Read', file_path: '/repo/a.ts' }, read.next)).toEqual({ result: 'file text' })
  expect(read.calls.length).toBe(1)
  // once the failed hook had passed the call on, that answer stands, even for a worker
  expect(await call.caught!($, ask, caughtNext({ result: 'ran' }, { called: true }).next)).toEqual({ result: 'ran' })
  expect(logs.filter(l => /the tool\.call hook it failed \(no repo\)/.test(l)).length).toBe(1)
})
