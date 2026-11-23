// GitHub Copilot's agents behind the host's Sdk (hosts/cursor/copilot.ts), with a fake of the Copilot SDK: a session's
// options, a turn's events as steps and its end, a plan turn that only reads, steering, stopping, models and sign-in.
// Run with `npx -y bun test ./tests/` in hosts/cursor/ (or `npm test` there).
import { test, expect } from 'bun:test'
import { PLAN_NOTE, copilotModels, copilotSdk, excludedTools, readOnlyRefusal, type CopilotClient, type CopilotEvent, type CopilotModule, type CopilotPermissionRequest, type CopilotSession, type CopilotSessionConfig } from '../copilot'
import { disallowedFor, sdkAgents } from '../agents'
import type { AgentRunEnd } from '../../../hooks/app/symcc'
import type { SdkStep } from '../sdk'
import { until } from './fake-sdk'

type Emit = (type: string, data?: Record<string, unknown>, agentId?: string) => void
/** What a fake session does with a turn's prompt: the events it emits, as the runtime would. */
type Script = (prompt: string, emit: Emit, s: FakeSession) => Promise<void>

type FakeSession = CopilotSession & {
  config: CopilotSessionConfig
  sent: { prompt: string; attachments?: unknown[]; mode?: string }[]
  models: { model: string; effort?: string }[]
  aborted: boolean
  closed: boolean
  abortedNow: Promise<void>
}

function fakeCopilot(script: Script, o: { signedIn?: () => boolean; models?: Parameters<typeof copilotModels>[0] } = {}) {
  const sessions: FakeSession[] = []
  let starts = 0
  let stops = 0
  const client = (): CopilotClient => ({
    start: async () => void starts++,
    stop: async () => void stops++,
    getAuthStatus: async () => (o.signedIn?.() === false ? { isAuthenticated: false, statusMessage: 'no token' } : { isAuthenticated: true }),
    listModels: async () => [...(o.models ?? [])],
    async createSession(config) {
      const handlers = new Set<(e: CopilotEvent) => void>()
      const emit: Emit = (type, data = {}, agentId) => {
        for (const h of [...handlers]) h({ type, data, ...(agentId ? { agentId } : {}) })
      }
      let aborted!: () => void
      const s: FakeSession = {
        sessionId: `copilot-${sessions.length + 1}`,
        config,
        sent: [],
        models: [],
        aborted: false,
        closed: false,
        abortedNow: new Promise<void>(r => (aborted = r)),
        on: h => (handlers.add(h), () => void handlers.delete(h)),
        async send(m) {
          s.sent.push(m)
          if (m.mode !== 'immediate') setTimeout(() => void script(m.prompt, emit, s), 0)
          return `m-${s.sent.length}`
        },
        abort: async () => ((s.aborted = true), aborted()),
        setModel: async (model, mo) => void s.models.push({ model, ...(mo?.reasoningEffort ? { effort: mo.reasoningEffort } : {}) }),
        disconnect: async () => void (s.closed = true),
        rpc: { history: { compact: async () => ({ success: true, summaryContent: 'We added a README.' }) } },
      }
      sessions.push(s)
      return s
    },
  })
  const module: CopilotModule = {
    CopilotClient: class {
      constructor() {
        return client()
      }
    } as unknown as CopilotModule['CopilotClient'],
    RuntimeConnection: { forSpawnedStdio: () => ({ kind: 'stdio' }) },
  }
  return { sessions, load: async () => module, starts: () => starts, stops: () => stops }
}

/** A turn that answers `answer`, streamed in two pieces. */
const answers =
  (answer: string): Script =>
  async (_p, emit) => {
    emit('assistant.message_delta', { messageId: 'a', deltaContent: answer.slice(0, 3) })
    emit('assistant.message_delta', { messageId: 'a', deltaContent: answer.slice(3) })
    emit('assistant.message', { messageId: 'a', content: answer })
    emit('session.idle', {})
  }

const tool = { description: 'the board', inputSchema: { type: 'object', properties: {} }, execute: async () => 'T-1 doing' }

test("a session gets symcc's tools, Copilot's tools in place of Cursor's names, and the project's settings only for the lead", async () => {
  const fake = fakeCopilot(answers('ok'))
  const sdk = copilotSdk({ load: fake.load })
  await sdk.create({ model: 'claude-sonnet-5.5', cwd: '/tmp/w', tools: { board: tool }, disallowedTools: disallowedFor({ kind: 'scout' }) })
  await sdk.create({ model: 'auto', cwd: '/tmp/p', tools: {}, disallowedTools: ['task'], settings: ['project', 'plugins'] })
  const [scout, lead] = fake.sessions.map(s => s.config)
  expect(fake.starts()).toBe(1)
  expect(scout!.model).toBe('claude-sonnet-5.5')
  expect(scout!.workingDirectory).toBe('/tmp/w')
  expect(scout!.tools.definitions.map(d => [d.name, d.skipPermission, d.defer])).toEqual([['board', true, 'never']])
  expect(await scout!.tools.definitions[0]!.handler({})).toBe('T-1 doing')
  for (const t of ['task', 'read_agent', 'web_fetch', 'edit', 'create']) expect(scout!.tools.excludedTools).toContain(t)
  expect(scout!.tools.excludedTools).not.toContain('bash')
  expect(scout!.events.streaming).toBe(true)
  expect([scout!.instructions.skipCustomInstructions, scout!.hooks.enableRepositoryHooks]).toEqual([true, false])
  expect([lead!.instructions.skipCustomInstructions, lead!.hooks.enableRepositoryHooks]).toEqual([false, true])
  expect(excludedTools(['task', 'task', 'shell', 'somethingElse'])).toEqual(['task', 'read_agent', 'list_agents', 'write_agent', 'bash', 'read_bash', 'write_bash', 'stop_bash', 'list_bash', 'somethingElse'])
  expect(sdk.name).toBe('Copilot')
  expect(sdk.defaultModel).toBe('auto')
})

test("a turn's events are its steps (a sub-agent's aside), and its end has the last answer and every model call's tokens", async () => {
  const fake = fakeCopilot(async (_p, emit) => {
    emit('assistant.reasoning_delta', { reasoningId: 'r', deltaContent: 'Looking at the board' })
    emit('assistant.reasoning', { reasoningId: 'r', content: 'Looking at the board' })
    emit('tool.execution_start', { toolCallId: 'c1', toolName: 'bash', arguments: { command: 'npm test', description: 'tests' } })
    emit('tool.execution_complete', { toolCallId: 'c1', success: false, error: { message: 'exit 1' } })
    emit('tool.execution_start', { toolCallId: 'c2', toolName: 'view', arguments: { path: 'src/a.ts' } })
    emit('tool.execution_complete', { toolCallId: 'c2', success: true })
    emit('assistant.message_delta', { messageId: 'x', deltaContent: 'not mine' }, 'sub-1')
    emit('assistant.usage', { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 })
    emit('assistant.usage', { inputTokens: 20, outputTokens: 5, cacheWriteTokens: 7 }, 'sub-1')
    emit('assistant.message', { messageId: 'm1', content: 'First, the tests.' })
    emit('assistant.message', { messageId: 'm2', content: '' })
    emit('assistant.message_delta', { messageId: 'm3', deltaContent: 'All ' })
    emit('assistant.message_delta', { messageId: 'm3', deltaContent: 'done.' })
    emit('assistant.message', { messageId: 'm3', content: 'All done.' })
    emit('session.idle', {})
  })
  const agent = await copilotSdk({ load: fake.load }).create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  const steps: SdkStep[] = []
  const r = await (await agent.send('go', { onStep: s => steps.push(s) })).wait()
  expect(r.status).toBe('finished')
  expect(r.result).toBe('All done.')
  expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 15, cacheReadTokens: 50, cacheWriteTokens: 7 })
  expect(steps).toEqual([
    { kind: 'thinking', text: 'Looking at the board' },
    { kind: 'tool', tool: 'bash', callId: 'c1', status: 'running', text: 'npm test' },
    { kind: 'tool', tool: 'bash', callId: 'c1', status: 'error', text: 'npm test → exit 1' },
    { kind: 'tool', tool: 'view', callId: 'c2', status: 'running', text: 'src/a.ts' },
    { kind: 'tool', tool: 'view', callId: 'c2', status: 'completed', text: 'src/a.ts' },
    { kind: 'text', text: 'First, the tests.' },
    { kind: 'text', text: 'All ' },
    { kind: 'text', text: 'done.' },
  ])
  expect(fake.sessions[0]!.sent).toEqual([{ prompt: 'go' }])
})

test('a plan turn is told it only reads, and Copilot is refused a write or a command that may change things', async () => {
  let ask!: (r: CopilotPermissionRequest) => string
  const fake = fakeCopilot(async (_p, emit, s) => {
    ask = r => s.config.permissions.onRequest(r).kind
    emit('session.idle', {})
  })
  const agent = await copilotSdk({ load: fake.load }).create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  const write: CopilotPermissionRequest = { kind: 'write', fileName: 'a.ts' }
  const ls: CopilotPermissionRequest = { kind: 'shell', commands: [{ identifier: 'ls', readOnly: true }] }
  const rm: CopilotPermissionRequest = { kind: 'shell', commands: [{ identifier: 'ls', readOnly: true }, { identifier: 'rm', readOnly: false }] }
  const redirect: CopilotPermissionRequest = { kind: 'shell', commands: [{ identifier: 'cat', readOnly: true }], hasWriteFileRedirection: true }
  const run = await agent.send('what would you change?', { mode: 'plan' })
  expect(fake.sessions[0]!.sent[0]!.prompt).toBe(`${PLAN_NOTE}\n\nwhat would you change?`)
  expect([write, ls, rm, redirect, { kind: 'mcp', toolName: 'db', readOnly: false }, { kind: 'read' }].map(r => fake.sessions[0]!.config.permissions.onRequest(r).kind)).toEqual(['reject', 'approve-once', 'reject', 'reject', 'reject', 'approve-once'])
  expect(readOnlyRefusal(write)).toMatch(/a\.ts stays as it is/)
  await run.wait()
  // once the plan turn ended, the next turn may change things again
  await (await agent.send('now do it')).wait()
  expect([ask(write), ask(rm)]).toEqual(['approve-once', 'approve-once'])
  expect(fake.sessions[0]!.sent[1]!.prompt).toBe('now do it')
})

test('a message while the turn runs goes into it; once it ended, the message is a new turn', async () => {
  let release!: () => void
  const fake = fakeCopilot(async (_p, emit) => {
    await new Promise<void>(r => (release = r))
    emit('assistant.message', { messageId: 'a', content: 'done, and wrapped up' })
    emit('session.idle', {})
  })
  const agent = await copilotSdk({ load: fake.load }).create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  const run = await agent.send('work')
  await until(() => release !== undefined, 2000, 'the turn to start')
  expect(await run.steer!('wrap up')).toBe('complete_delivered')
  release()
  expect((await run.wait()).result).toBe('done, and wrapped up')
  expect(await run.steer!('too late')).toBe('revert_to_followup')
  expect(fake.sessions[0]!.sent).toEqual([{ prompt: 'work' }, { prompt: 'wrap up', mode: 'immediate' }])
})

test('stopping a turn aborts it: it ends as cancelled', async () => {
  const fake = fakeCopilot(async (_p, emit, s) => {
    emit('tool.execution_start', { toolCallId: 'c1', toolName: 'bash', arguments: { command: 'sleep 40' } })
    await s.abortedNow
    emit('abort', { reason: 'user' })
    emit('session.idle', { aborted: true })
  })
  const agent = await copilotSdk({ load: fake.load }).create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  const run = await agent.send('sleep')
  await run.cancel()
  expect((await run.wait()).status).toBe('cancelled')
  expect(fake.sessions[0]!.aborted).toBe(true)
  // a stop after the end does nothing
  await run.cancel()
})

test('an error with no answer ends the turn as an error; its message says why', async () => {
  const fake = fakeCopilot(async (_p, emit) => {
    emit('session.error', { errorType: 'model', message: 'The model claude-x is not available' })
    emit('session.idle', {})
  })
  const agent = await copilotSdk({ load: fake.load }).create({ model: 'claude-x', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  const steps: SdkStep[] = []
  const r = await (await agent.send('go', { onStep: s => steps.push(s) })).wait()
  expect(r.status).toBe('error')
  expect(r.error).toBe('The model claude-x is not available')
  expect(steps).toEqual([{ kind: 'status', text: 'error: The model claude-x is not available' }])
})

test("a turn's model and reasoning are set when they change, back to the agent's own when none is named; pictures go along", async () => {
  const fake = fakeCopilot(answers('ok'))
  const agent = await copilotSdk({ load: fake.load }).create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  const opus = { id: 'claude-opus-5.5', params: [{ id: 'reasoning', value: 'high' }] }
  await (await agent.send('one', { model: opus, images: [{ data: 'iVBOR', mimeType: 'image/png' }] })).wait()
  await (await agent.send('two', { model: opus })).wait()
  await (await agent.send('three')).wait()
  const s = fake.sessions[0]!
  expect(s.models).toEqual([{ model: 'claude-opus-5.5', effort: 'high' }, { model: 'auto' }])
  expect(s.sent[0]!.attachments).toEqual([{ type: 'blob', data: 'iVBOR', mimeType: 'image/png' }])
  expect(s.sent[1]!.attachments).toBe(undefined)
})

test("summarizing compacts the session's history; closing lets go of the session, then of the runtime", async () => {
  const fake = fakeCopilot(answers('ok'))
  const sdk = copilotSdk({ load: fake.load })
  const agent = await sdk.create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  expect(await (await agent.summarize!()).wait()).toEqual({ status: 'finished', result: 'We added a README.' })
  await agent.close()
  expect(fake.sessions[0]!.closed).toBe(true)
  await sdk.close!()
  expect(fake.stops()).toBe(1)
})

test("Copilot's models as the picker's: the account's own, each with its reasoning efforts, medium unless the model says", () => {
  const list = copilotModels([
    { id: 'auto', name: 'Auto' },
    { id: 'claude-opus-5.5', name: 'Claude Opus 5.5', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'], billing: { multiplier: 3 } },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', supportedReasoningEfforts: ['none', 'low', 'high'], defaultReasoningEffort: 'high', policy: { state: 'enabled' } },
    { id: 'closed', name: 'Closed', policy: { state: 'disabled' } },
  ])
  expect(list.map(m => m.id)).toEqual(['auto', 'claude-opus-5.5', 'gpt-6-luna'])
  expect(list[0]).toEqual({ id: 'auto', label: 'Auto', options: [], variants: [{ params: {}, isDefault: true }] })
  expect(list[1]!.description).toBe('3× premium requests')
  expect(list[1]!.options[0]!.values.map(v => v.label)).toEqual(['Low', 'Medium', 'High', 'Extra high'])
  expect(list[1]!.variants.find(v => v.isDefault)?.params).toEqual({ reasoning: 'medium' })
  expect(list[2]!.variants.find(v => v.isDefault)?.params).toEqual({ reasoning: 'high' })
})

test('with no one signed in to Copilot an agent is refused with how to sign in; once signed in, the next one starts', async () => {
  let signedIn = false
  const fake = fakeCopilot(answers('ok'), { signedIn: () => signedIn })
  const sdk = copilotSdk({ load: fake.load })
  const why = await sdk.create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] }).then(
    () => '',
    (err: Error) => err.message,
  )
  expect(why).toMatch(/isn't signed in \(no token\): run `copilot login`/)
  signedIn = true
  await sdk.create({ model: 'auto', cwd: '/tmp/w', tools: {}, disallowedTools: [] })
  expect(fake.starts()).toBe(2)
  expect(fake.sessions.length).toBe(1)
})

test("symcc's agents run on Copilot as on Cursor: a worker's turn ends with its answer and tokens", async () => {
  const fake = fakeCopilot(async (p, emit) => {
    emit('assistant.usage', { inputTokens: 40, outputTokens: 4 })
    emit('assistant.message', { messageId: 'a', content: p.includes('Add a README') ? 'Added the README.' : 'what task?' })
    emit('session.idle', {})
  })
  const ends: AgentRunEnd[] = []
  const agents = sdkAgents({ sdk: copilotSdk({ load: fake.load }), model: 'claude-sonnet-5.5', onEnd: (_id, e) => ends.push(e), onTool: async () => '' })
  await agents.spawn({ kind: 'worker', name: 'T-1', description: 'T-1', prompt: 'Add a README', cwd: '/tmp/w' })
  await until(() => ends.length === 1, 2000, 'the worker to end')
  expect(ends[0]!.answer).toBe('Added the README.')
  expect(ends[0]!.end.reason).toBe('answer')
  expect(fake.sessions[0]!.config.model).toBe('claude-sonnet-5.5')
  expect(fake.sessions[0]!.config.tools.definitions.map(d => d.name)).toEqual(['ask_owner'])
  await agents.stopAll(100)
})
