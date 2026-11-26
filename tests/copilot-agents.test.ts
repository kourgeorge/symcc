// T-959: symcc's agents in GitHub Copilot CLI (hooks/copilot/agents.ts), run on a fake Copilot SDK (no Copilot at
// all): spawn makes a CopilotClient that spawns the copilot binary with the whole environment (the owner's own model
// provider, COPILOT_PROVIDER_*, kept), then a child session in the agent's folder with its model, its base prompt, only
// the tools symcc's guard knows (no `task`, no ask_user) and symcc's guard bound to its id; session.idle hands back its
// last message, session.error a failure; stop aborts and closes the client; followUp sends to the same session.
import { expect } from 'claude-code/testing'
import { addTask, emptyBoard, patchTask, blockedEditText } from '../hooks/board'
import { runBy } from './agent-fixture'
import { S, workers, scoutRuns } from '../hooks/app/state'
import { test } from './reset'
import { pause } from './fakes'
import { fakeHost, memoryFs, done } from './fake-host'
import type { Host, HostAgentStart } from '../hooks/host'
import type { AgentRunEnd } from '../hooks/app/symcc'
import { copilotAgents, copilotModel, parseModels, AGENT_BUILTIN_TOOLS, AGENT_EXCLUDED_TOOLS, MODELS_ENV, type CopilotAgentsOptions } from '../hooks/copilot/agents'
import { knownTool, shellWrap, unknownToolText } from '../hooks/copilot/guard'
import { startCopilot, PROVIDER_SECRETS } from '../hooks/copilot/extension'
import { COPILOT_WORDS } from '../hooks/copilot/host'
import type { CpChildSession, CpCreateSession, CpJoinOptions, CpSdk, CpSession, CpSessionEvent, CpSpawnedStdio, CpTool } from '../hooks/copilot/sdk'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const EXEC = '/opt/copilot/copilot'

/** A fake SDK: each client records how it was made, its sessions and whether it was stopped; each session its sends and handlers. */
function fakeSdk(opts: { failCreate?: boolean; ids?: string[] } = {}) {
  const approveAll = () => ({ kind: 'approved' })
  type FakeSession = CpChildSession & { sends: { prompt: string; mode?: string }[]; emit: (e: CpSessionEvent) => void; aborted: number; disconnected: number }
  const clients: { runtime: { kind: string } & CpSpawnedStdio; created: CpCreateSession[]; sessions: FakeSession[]; stopped: number }[] = []
  const ids = [...(opts.ids ?? ['ag1', 'ag2', 'ag3'])]
  const sdk: CpSdk = {
    approveAll,
    RuntimeConnection: { forSpawnedStdio: (o?: CpSpawnedStdio) => ({ kind: 'spawned-stdio', ...o }) },
    CopilotClient: class {
      rec: (typeof clients)[number]
      constructor(o: { mode: 'coding-agent'; runtime: unknown }) {
        expect(o.mode).toBe('coding-agent')
        this.rec = { runtime: o.runtime as (typeof clients)[number]['runtime'], created: [], sessions: [], stopped: 0 }
        clients.push(this.rec)
      }
      async createSession(c: CpCreateSession) {
        this.rec.created.push(c)
        if (opts.failCreate) throw new Error('no copilot here')
        const handlers: ((e: CpSessionEvent) => void)[] = []
        const s: FakeSession = {
          sessionId: ids.shift()!,
          sends: [],
          aborted: 0,
          disconnected: 0,
          send: async m => (s.sends.push(m), `m${s.sends.length}`),
          on: h => (handlers.push(h), () => void handlers.splice(handlers.indexOf(h), 1)),
          abort: async () => void s.aborted++,
          disconnect: async () => void s.disconnected++,
          emit: e => handlers.slice().forEach(h => h(e)),
        }
        this.rec.sessions.push(s)
        return s
      }
      async stop() {
        this.rec.stopped++
        return []
      }
    },
  }
  return { sdk, clients, approveAll }
}

/** A board whose task T-1 (files: src/a.ts) is done by worker "ag1" in WT, and a fake host with timers kept. */
function world() {
  const files = new Map<string, string>()
  const at = '2026-11-18T00:00:00.000Z'
  const [added] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a change', files: ['src/a.ts'] }, at)
  const b = patchTask(added, 'T-1', { status: 'doing', runs: [runBy('ag1', at)], live: { session: 'driver' } }, at)
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify(b))
  const timers: { ms: number; fn: () => void; cancelled?: true }[] = []
  const { host } = fakeHost({
    session: { id: async () => 'lead', repo: async () => ({ root: ROOT }), root: async () => ROOT },
    fs: memoryFs(files),
    run: async () => done(),
    words: COPILOT_WORDS,
    clock: {
      after: (ms, fn) => {
        const t: (typeof timers)[number] = { ms, fn }
        timers.push(t)
        return { cancel: () => void (t.cancelled = true) }
      },
      sleep: async () => undefined,
    },
  })
  S.root = ROOT
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() })
  return { host, timers }
}

const ENV = { HOME: '/home/me', PATH: '/bin', COPILOT_PROVIDER_TYPE: 'openai', COPILOT_PROVIDER_BASE_URL: 'http://localhost:4000', COPILOT_PROVIDER_API_KEY: 'sk-1', COPILOT_MODEL: 'gpt-x', [MODELS_ENV]: 'sonnet=litellm-sonnet, haiku = litellm-haiku' }

function agents(host: Host, extra: Partial<CopilotAgentsOptions> = {}) {
  const f = fakeSdk()
  const ends: { id: string; end: AgentRunEnd }[] = []
  const a = copilotAgents({ host: () => host, sdk: f.sdk, execPath: EXEC, environment: () => ENV, dir: ROOT, onEnd: (id, end) => void ends.push({ id, end }), ...extra })
  return { ...f, ends, a }
}

const WORKER: HostAgentStart = { kind: 'worker', prompt: 'Task T-1: change src/a.ts', name: 'T-1', description: 'a change', cwd: WT, model: 'sonnet' }
const settle = async () => {
  for (let i = 0; i < 20; i++) await pause(0)
}
const patch = (...lines: string[]) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')

test('spawn: a client spawns the copilot binary with the whole environment (BYOK kept); the session runs in the folder with the model, prompt, tool limits and guard', async () => {
  const { host } = world()
  const w = agents(host)
  expect(await w.a.spawn(WORKER)).toEqual({ agentId: 'ag1' })
  const c = w.clients[0]!
  expect(c.runtime.kind).toBe('spawned-stdio')
  expect(c.runtime.path).toBe(EXEC)
  // the owner's own provider reaches the agent's copilot process, as it reaches the lead's
  for (const k of ['COPILOT_PROVIDER_TYPE', 'COPILOT_PROVIDER_BASE_URL', 'COPILOT_PROVIDER_API_KEY', 'COPILOT_MODEL'] as const) expect(c.runtime.env?.[k]).toBe(ENV[k])
  const o = c.created[0]!
  expect(o.workingDirectory).toBe(WT)
  // a symcc model name maps to the BYOK model id
  expect(o.model).toBe('litellm-sonnet')
  expect(o.systemMessage?.mode).toBe('append')
  expect(o.systemMessage?.content.includes('You are a symcc worker')).toBe(true)
  expect(o.systemMessage?.content.includes('symcc_ask_owner')).toBe(true)
  expect(o.permissions?.onRequest).toBe(w.approveAll)
  // the worker's own symcc tool only; the tools offered are only ones the guard knows
  expect(o.tools?.definitions?.map(t => t.name)).toEqual(['symcc_ask_owner'])
  const avail = o.tools?.availableTools ?? []
  for (const t of ['bash', 'apply_patch', 'view', 'edit', 'symcc_ask_owner']) expect([t, avail.includes(t)]).toEqual([t, true])
  for (const t of avail) expect([t, knownTool(t)]).toEqual([t, true])
  // no Copilot sub-agents (task), no question dialog, no typing into a running shell, no lead tools, no web without a web role
  for (const t of ['task', 'ask_user', 'write_bash', 'symcc_board', 'web_fetch']) expect([t, avail.includes(t)]).toEqual([t, false])
  for (const t of ['task', 'ask_user', 'write_bash', 'web_fetch', 'web_search']) expect([t, o.tools?.excludedTools?.includes(t)]).toEqual([t, true])
  // once symcc has the worker on record, the task prompt is sent
  await settle()
  expect(c.sessions[0]!.sends).toEqual([{ prompt: WORKER.prompt }])
  expect(await w.a.list()).toEqual([{ id: 'ag1', kind: 'worker', status: 'running', name: 'T-1', description: 'a change' }])
  workers.clear()
})

test("each agent's session has the guard bound to its own id and folder; its shell call comes back wrapped to run from there", async () => {
  const { host } = world()
  const w = agents(host)
  await w.a.spawn(WORKER)
  const guard = w.clients[0]!.created[0]!.hooks!.handlers!.onPreToolUse!
  const call = (toolName: string, toolArgs: unknown) => guard({ toolName, toolArgs }, { sessionId: 'ag1' })
  // a file outside the task's list, and one in the owner's copy, are refused
  expect(await call('apply_patch', patch('*** Update File: README.md'))).toEqual({ permissionDecision: 'deny', permissionDecisionReason: blockedEditText('README.md') })
  expect((await call('apply_patch', patch('*** Update File: /repo/src/a.ts')))?.permissionDecision).toBe('deny')
  expect(await call('apply_patch', patch('*** Update File: src/a.ts'))).toBe(undefined)
  expect(await call('mcp_thing', {})).toEqual({ permissionDecision: 'deny', permissionDecisionReason: unknownToolText('mcp_thing') })
  // the hook's changed arguments: `cd src ; pwd` runs in a new shell started in the worktree
  expect(await call('bash', { command: 'cd src ; pwd' })).toEqual({ modifiedArgs: { command: shellWrap(WT, 'bash', 'cd src ; pwd') } })
  // a cd above the project (`cd /`) is refused by the path rule before any wrapping
  expect((await call('bash', { command: 'cd / ; pwd' }))?.permissionDecision).toBe('deny')
  workers.clear()
})

test("an agent's tools are bound to its id: a worker's ask_owner is its own, a scout gets board, stats and scouts only", async () => {
  const { host } = world()
  const w = agents(host, { ready: () => true })
  await w.a.spawn({ kind: 'scout', prompt: 'look', name: 'board-review', description: 'a scout', model: 'inherit' })
  const o = w.clients[0]!.created[0]!
  expect(o.workingDirectory).toBe(ROOT)
  expect('model' in o).toBe(false)
  expect(o.tools?.definitions?.map(t => t.name)).toEqual(['symcc_board', 'symcc_stats', 'symcc_scouts'])
  // a scout may use the web
  expect(o.tools?.availableTools?.includes('web_fetch')).toBe(true)
  expect(o.systemMessage?.content.includes('You are a symcc scout')).toBe(true)
  // the handler passes the agent's id to toolCall, so the scout is judged as itself, not as the lead: a scouts call
  // that would change them is refused
  workers.clear()
  scoutRuns.set('ag1', 'board-review')
  const scouts = o.tools!.definitions!.find(t => t.name === 'symcc_scouts') as CpTool
  const r = await scouts.handler({ action: 'add', name: 'x' }, { sessionId: 'ag1', toolCallId: 't', toolName: 'symcc_scouts', arguments: {} })
  expect(typeof r === 'string' ? r : r.resultType).toBe('failure')
  expect(typeof r === 'string' ? '' : r.textResultForLlm.includes('scouts can only read the board')).toBe(true)
  scoutRuns.clear()
})

test('session.idle hands back the last message and tokens; the client is kept for a follow-up, then stopped', async () => {
  const { host, timers } = world()
  const w = agents(host)
  await w.a.spawn(WORKER)
  await settle()
  const s = w.clients[0]!.sessions[0]!
  s.emit({ type: 'assistant.message', data: { content: 'Looking.' } })
  s.emit({ type: 'assistant.usage', data: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5 } })
  // a Copilot sub-agent's message is not the answer
  s.emit({ type: 'assistant.message', agentId: 'sub', data: { content: 'sub text' } })
  s.emit({ type: 'assistant.message', data: { content: 'I changed src/a.ts.' } })
  s.emit({ type: 'assistant.message', data: { content: '' } })
  s.emit({ type: 'session.idle', data: {} })
  expect(w.ends).toEqual([{ id: 'ag1', end: { answer: 'I changed src/a.ts.', end: { reason: 'answer' }, isAborted: false, tokens: { input: 100, output: 20, cache_read: 5 } } }])
  // a second idle hands back nothing more
  s.emit({ type: 'session.idle', data: {} })
  expect(w.ends.length).toBe(1)
  expect(w.clients[0]!.stopped).toBe(0)
  expect((await w.a.list())[0]!.status).toBe('completed')
  // the keep timer ends it: the session and its copilot process
  timers.find(t => !t.cancelled)!.fn()
  await settle()
  expect(w.clients[0]!.stopped).toBe(1)
  expect(s.disconnected).toBe(1)
  workers.clear()
})

test('session.error reports a failure and stops the client', async () => {
  const { host } = world()
  const w = agents(host)
  await w.a.spawn(WORKER)
  await settle()
  const s = w.clients[0]!.sessions[0]!
  s.emit({ type: 'session.error', data: { errorType: 'quota', message: 'quota exceeded' } })
  expect(w.ends).toEqual([{ id: 'ag1', end: { answer: 'quota exceeded', end: { reason: 'error', error: 'quota exceeded' }, isAborted: false, tokens: undefined } }])
  await settle()
  expect(w.clients[0]!.stopped).toBe(1)
  expect((await w.a.list())[0]!.status).toBe('failed')
  // the idle after it hands back nothing more
  s.emit({ type: 'session.idle', data: {} })
  expect(w.ends.length).toBe(1)
  workers.clear()
})

test('stop aborts the turn, reports it cut off and closes the client; send steers a running agent', async () => {
  const { host } = world()
  const w = agents(host)
  await w.a.spawn(WORKER)
  await settle()
  const s = w.clients[0]!.sessions[0]!
  await w.a.send('ag1', 'wrap up')
  expect(s.sends[1]).toEqual({ prompt: 'wrap up', mode: 'immediate' })
  await w.a.stop('ag1', 'stop now')
  expect(s.aborted).toBe(1)
  expect(w.ends.map(e => [e.id, e.end.isAborted, e.end.end.reason])).toEqual([['ag1', true, 'aborted']])
  expect(w.clients[0]!.stopped).toBe(1)
  expect(s.disconnected).toBe(1)
  expect((await w.a.list())[0]!.status).toBe('killed')
  // a later send goes nowhere, a second stop stops nothing more
  await w.a.send('ag1', 'more')
  await w.a.stop('ag1', 'again')
  expect(s.sends.length).toBe(2)
  expect(w.clients[0]!.stopped).toBe(1)
  workers.clear()
})

test('followUp sends one more prompt to the same session; its end has only its own answer and tokens', async () => {
  const { host, timers } = world()
  const w = agents(host)
  await w.a.spawn(WORKER)
  await settle()
  const s = w.clients[0]!.sessions[0]!
  s.emit({ type: 'assistant.usage', data: { inputTokens: 100, outputTokens: 20 } })
  s.emit({ type: 'assistant.message', data: { content: 'done' } })
  s.emit({ type: 'session.idle', data: {} })
  await w.a.followUp('ag1', 'any notes for org-mem?')
  expect(s.sends.at(-1)).toEqual({ prompt: 'any notes for org-mem?' })
  expect(w.clients.length).toBe(1)
  // the keep timer was cancelled: the follow-up keeps the client open
  expect(timers.every(t => t.cancelled)).toBe(true)
  s.emit({ type: 'assistant.usage', data: { inputTokens: 7, outputTokens: 3 } })
  s.emit({ type: 'assistant.message', data: { content: 'NOTHING' } })
  s.emit({ type: 'session.idle', data: {} })
  expect(w.ends[1]).toEqual({ id: 'ag1', end: { answer: 'NOTHING', end: { reason: 'answer' }, isAborted: false, tokens: { input: 7, output: 3 } } })
  // a closed session takes no follow-up
  await w.a.stop('ag1', '')
  expect(w.clients[0]!.stopped).toBe(1)
  expect(await w.a.followUp('ag1', 'x').then(() => 'sent', () => 'refused')).toBe('refused')
  workers.clear()
})

test('a session that fails to start stops its client; an agent symcc never records is not prompted', async () => {
  const { host } = world()
  const f = fakeSdk({ failCreate: true })
  const ends: AgentRunEnd[] = []
  const a = copilotAgents({ host: () => host, sdk: f.sdk, execPath: EXEC, environment: () => ({}), dir: ROOT, onEnd: (_, e) => void ends.push(e) })
  expect(await a.spawn(WORKER).then(() => 'started', (e: Error) => e.message)).toBe('no copilot here')
  expect(f.clients[0]!.stopped).toBe(1)
  // never recorded: the wait runs out (waitMs 0), it ends as an error with no prompt sent
  const w = agents(host, { ready: () => false, waitMs: 0 })
  await w.a.spawn({ ...WORKER, model: undefined })
  await settle()
  expect(w.clients[0]!.sessions[0]!.sends).toEqual([])
  expect(w.ends.map(e => e.end.end.reason)).toEqual(['error'])
  expect(w.clients[0]!.stopped).toBe(1)
  workers.clear()
})

test('model names: none picks Copilot\'s own (COPILOT_MODEL with BYOK); a mapped name is its BYOK id; any other passes', () => {
  expect(copilotModel(undefined)).toBe(undefined)
  expect(copilotModel('inherit')).toBe(undefined)
  expect(copilotModel('default')).toBe(undefined)
  expect(copilotModel('gpt-5.3-codex')).toBe('gpt-5.3-codex')
  expect(copilotModel('sonnet', parseModels(ENV[MODELS_ENV]))).toBe('litellm-sonnet')
  expect(copilotModel('haiku', parseModels(ENV[MODELS_ENV]))).toBe('litellm-haiku')
  expect(parseModels('a=b,=c,d=,e')).toEqual({ a: 'b' })
  // the tool lists stay inside what the guard knows
  for (const t of AGENT_BUILTIN_TOOLS) expect([t, knownTool(t)]).toEqual([t, true])
  expect(AGENT_EXCLUDED_TOOLS.includes('task')).toBe(true)
})

test('startCopilot with the SDK: agents start (no "not ready" stub), the provider secrets are asked for, and the session end stops every client', async () => {
  const files = new Map<string, string>()
  files.set(`${ROOT}/.git`, '')
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify({ ...emptyBoard(), mode: 'paused' }))
  const joined: CpJoinOptions[] = []
  const session: CpSession = { sessionId: 'cp-1', send: async () => 'm', log: async () => undefined }
  const f = fakeSdk()
  const timer = { cancel: () => undefined }
  const run = await startCopilot({
    joinSession: async o => (joined.push(o), session),
    dir: ROOT,
    pluginRoot: '/plugin',
    system: {
      fs: memoryFs(files),
      env: async () => undefined,
      run: async argv => done({ stdout: argv.includes('--show-toplevel') ? `${ROOT}\n` : 'true\n' }),
      clock: { after: () => timer, every: () => timer, sleep: async () => undefined },
    },
    agentSdk: { sdk: f.sdk, execPath: EXEC, environment: () => ENV },
  })
  expect(joined[0]!.requestedEnvironmentVariables).toEqual(PROVIDER_SECRETS)
  expect(await run.host.agents.spawn(WORKER)).toEqual({ agentId: 'ag1' })
  expect(typeof run.host.agents.followUp).toBe('function')
  await run.end()
  expect(f.clients[0]!.stopped).toBe(1)
})
