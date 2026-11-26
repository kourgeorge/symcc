// GitHub Copilot's agents (@microsoft/copilot-sdk) behind the host's Sdk (./sdk.ts), so the engine, the lead chat and
// the board run on them as on Cursor's: each agent is one Copilot session in its folder, symcc's tools are served to it
// from this process, its events are the board's steps, and symcc's guard (./guard.ts, given in as `guard`) is its
// onPreToolUse hook, so each tool call is judged before it runs. copilotSdk() starts the Copilot runtime on first use (the
// SDK's own, or COPILOT_CLI_PATH's), signed in as the copilot CLI is (`copilot login`, or GH_TOKEN). The SDK isn't
// bundled, nor typed here: it ships the runtime (some 200 MB), so it is an optional dependency the engine loads by name.
import type { Sdk, SdkAgent, SdkAgentOptions, SdkModel, SdkModelInfo, SdkRun, SdkRunResult, SdkSendOptions, SdkStep, SdkToolGuard, SdkUsage } from './sdk'
import { argWords, short } from './steps'

/** A session event: `agentId` is set on a sub-agent's. */
export type CopilotEvent = { type: string; agentId?: string; data?: Record<string, unknown> }

/** What Copilot asks before one of its own tools runs (the fields symcc reads). */
export type CopilotPermissionRequest = {
  kind: string
  commands?: { identifier: string; readOnly: boolean }[]
  hasWriteFileRedirection?: boolean
  fileName?: string
  toolName?: string
  readOnly?: boolean
}
export type CopilotPermissionResult = { kind: 'approve-once' } | { kind: 'reject'; feedback?: string }

/** A tool served from this process: its parameters as JSON schema; it answers text. `defer: never` keeps it loaded. */
export type CopilotTool = { name: string; description: string; parameters: Record<string, unknown>; skipPermission: boolean; defer: 'auto' | 'never'; handler: (args: unknown) => Promise<string> }

export type CopilotSessionConfig = {
  clientName: string
  model: string
  workingDirectory: string
  tools: { definitions: CopilotTool[]; excludedTools: string[] }
  permissions: { onRequest: (r: CopilotPermissionRequest) => CopilotPermissionResult }
  events: { streaming: boolean }
  instructions: { skipCustomInstructions: boolean }
  hooks: { enableRepositoryHooks: boolean; handlers?: { onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => Promise<CopilotPreToolUseOutput | undefined> } }
}

/** onPreToolUse's answer: refuse the call with a reason, or run it with changed arguments. */
export type CopilotPreToolUseOutput = { permissionDecision: 'deny'; permissionDecisionReason: string } | { modifiedArgs: unknown }

export type CopilotSession = {
  sessionId: string
  on: (handler: (e: CopilotEvent) => void) => () => void
  send: (o: { prompt: string; attachments?: { type: 'blob'; data: string; mimeType: string }[]; mode?: 'enqueue' | 'immediate' }) => Promise<string>
  abort: () => Promise<void>
  setModel: (model: string, o?: { reasoningEffort?: string }) => Promise<void>
  disconnect: () => Promise<void>
  rpc: { history: { compact: () => Promise<{ success: boolean; summaryContent?: string }> } }
}

export type CopilotModel = {
  id: string
  name: string
  supportedReasoningEfforts?: string[]
  defaultReasoningEffort?: string
  policy?: { state: string }
  billing?: { multiplier?: number }
}

export type CopilotClient = {
  start: () => Promise<void>
  stop: () => Promise<unknown>
  getAuthStatus: () => Promise<{ isAuthenticated: boolean; statusMessage?: string }>
  listModels: () => Promise<CopilotModel[]>
  createSession: (o: CopilotSessionConfig) => Promise<CopilotSession>
}

/** The parts of the SDK's module copilotSdk() uses. */
export type CopilotModule = {
  CopilotClient: new (o: { mode: 'coding-agent'; runtime: unknown }) => CopilotClient
  RuntimeConnection: { forSpawnedStdio: () => unknown }
}

const COPILOT_SDK = '@microsoft/copilot-sdk'

async function loadCopilot(): Promise<CopilotModule> {
  try {
    return (await import(COPILOT_SDK)) as CopilotModule
  } catch (err) {
    throw new Error(`symcc on Copilot needs ${COPILOT_SDK}: run npm install in hosts/cursor (${(err as Error).message})`)
  }
}

/** The Cursor SDK's tool names, as the host disallows them, in Copilot's built-in tools (a name not here is its own). */
export const COPILOT_TOOLS: Record<string, readonly string[]> = {
  task: ['task', 'read_agent', 'list_agents', 'write_agent'],
  shell: ['bash', 'read_bash', 'write_bash', 'stop_bash', 'list_bash'],
  edit: ['edit', 'create'],
  delete: [],
  applyAgentDiff: [],
  generateImage: [],
  webSearch: ['web_search'],
  webFetch: ['web_fetch'],
}

export const excludedTools = (disallowed: readonly string[]): string[] => [...new Set(disallowed.flatMap(n => COPILOT_TOOLS[n] ?? [n]))]

/** Copilot's tools that type into a running shell (hooks/copilot/guard.ts refuses them to symcc's agents). */
const SHELL_INPUT = ['write_bash', 'write_powershell']

/** symcc's guard as Copilot's onPreToolUse hook. */
export const guarded =
  (guard: SdkToolGuard) =>
  async (input: { toolName: string; toolArgs: unknown }): Promise<CopilotPreToolUseOutput | undefined> => {
    const v = await guard({ toolName: input.toolName, toolArgs: input.toolArgs })
    if (!v) return undefined
    return 'deny' in v ? { permissionDecision: 'deny', permissionDecisionReason: v.deny } : { modifiedArgs: v.args }
  }

/** What a plan turn is told first: Copilot's own plan mode waits on the owner to leave it, so a plan turn is a read-only one. */
export const PLAN_NOTE = 'This turn only reads: look, think and answer, but change no files and run nothing that changes anything (a change is refused).'

/** Why a read-only turn refuses Copilot's request `r` (undefined: it may go ahead). */
export function readOnlyRefusal(r: CopilotPermissionRequest): string | undefined {
  const why = 'This turn only reads'
  if (r.kind === 'write') return `${why}: ${r.fileName ?? 'the file'} stays as it is. Say what you would change instead.`
  if (r.kind === 'shell') return !r.hasWriteFileRedirection && r.commands?.length && r.commands.every(c => c.readOnly) ? undefined : `${why}: run only commands that change nothing.`
  if (r.kind === 'mcp' && !r.readOnly) return `${why}: ${r.toolName ?? 'that tool'} may change things.`
  return undefined
}

const EFFORT_WORDS: Record<string, string> = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }

/** Copilot's model list as the host's: the ones the account may use, each with its reasoning efforts (medium by default). */
export function copilotModels(list: readonly CopilotModel[]): SdkModelInfo[] {
  return list
    .filter(m => !m.policy || m.policy.state === 'enabled')
    .map(m => {
      const efforts = m.supportedReasoningEfforts ?? []
      const fallback = efforts.includes('medium') ? 'medium' : efforts[0]
      const def = m.defaultReasoningEffort && efforts.includes(m.defaultReasoningEffort) ? m.defaultReasoningEffort : fallback
      const cost = m.billing?.multiplier
      return {
        id: m.id,
        label: m.name || m.id,
        ...(cost !== undefined ? { description: cost === 0 ? 'included' : `${cost}× premium requests` } : {}),
        options: efforts.length ? [{ id: 'reasoning', label: 'Reasoning', values: efforts.map(v => ({ value: v, label: EFFORT_WORDS[v] ?? v })) }] : [],
        variants: efforts.length ? efforts.map(v => ({ params: { reasoning: v }, ...(v === def ? { isDefault: true } : {}) })) : [{ params: {}, isDefault: true }],
      }
    })
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const count = (v: unknown) => (typeof v === 'number' ? v : 0)

/** One Copilot session as the host's agent. */
function copilotAgent(session: CopilotSession, model: string, turn: { readOnly: boolean }): SdkAgent {
  let now: { id: string; effort?: string } = { id: model }
  const useModel = async (m: SdkModel | undefined) => {
    const want = { id: m?.id ?? model, effort: m?.params?.find(p => p.id === 'reasoning')?.value }
    if (want.id === now.id && want.effort === now.effort) return
    await session.setModel(want.id, want.effort ? { reasoningEffort: want.effort } : undefined)
    now = want
  }
  return {
    id: session.sessionId,
    async send(prompt, so?: SdkSendOptions): Promise<SdkRun> {
      await useModel(so?.model)
      turn.readOnly = so?.mode === 'plan'
      const step = (s: SdkStep) => so?.onStep?.(s)
      const usage: SdkUsage = {}
      const tools = new Map<string, { tool: string; args: string }>()
      const streamed = new Set<string>()
      let answer = ''
      let error: string | undefined
      let live = true
      let finish!: (r: SdkRunResult) => void
      const ended = new Promise<SdkRunResult>(r => (finish = r))
      const off = session.on(e => {
        const d = e.data ?? {}
        if (e.type === 'assistant.usage') {
          usage.inputTokens = (usage.inputTokens ?? 0) + count(d.inputTokens)
          usage.outputTokens = (usage.outputTokens ?? 0) + count(d.outputTokens)
          usage.cacheReadTokens = (usage.cacheReadTokens ?? 0) + count(d.cacheReadTokens)
          usage.cacheWriteTokens = (usage.cacheWriteTokens ?? 0) + count(d.cacheWriteTokens)
          return
        }
        if (e.agentId) return
        // what the agent says and thinks streams a few words at a time; a message that didn't stream comes whole
        if (e.type === 'assistant.message_delta' || e.type === 'assistant.reasoning_delta') {
          streamed.add(text(d.messageId) || text(d.reasoningId))
          const t = text(d.deltaContent)
          if (t) step({ kind: e.type === 'assistant.message_delta' ? 'text' : 'thinking', text: t })
        } else if (e.type === 'assistant.message') {
          const t = text(d.content)
          if (t.trim()) answer = t
          if (t && !streamed.has(text(d.messageId))) step({ kind: 'text', text: t })
        } else if (e.type === 'assistant.reasoning') {
          const t = text(d.content)
          if (t && !streamed.has(text(d.reasoningId))) step({ kind: 'thinking', text: t })
        } else if (e.type === 'tool.execution_start') {
          const call = { tool: text(d.toolName) || 'tool', args: short(argWords(d.arguments), 400) }
          tools.set(text(d.toolCallId), call)
          step({ kind: 'tool', tool: call.tool, callId: text(d.toolCallId), status: 'running', text: call.args })
        } else if (e.type === 'tool.execution_complete') {
          const call = tools.get(text(d.toolCallId)) ?? { tool: 'tool', args: '' }
          const failed = d.success === false
          const why = failed ? text((d.error as { message?: unknown } | undefined)?.message) : ''
          step({ kind: 'tool', tool: call.tool, callId: text(d.toolCallId), status: failed ? 'error' : 'completed', text: call.args + (why ? ` → ${short(why, 300)}` : '') })
        } else if (e.type === 'session.error') {
          error = text(d.message) || 'Copilot failed'
          step({ kind: 'status', text: `error: ${error}` })
        } else if (e.type === 'session.compaction_start') {
          step({ kind: 'status', text: 'summarizing the conversation so far' })
        } else if (e.type === 'session.idle') {
          live = false
          off()
          turn.readOnly = false
          const status = d.aborted === true ? 'cancelled' : error && !answer ? 'error' : 'finished'
          finish({ status, result: answer, usage, ...(error ? { error } : {}) })
        }
      })
      try {
        const images = so?.images?.length ? { attachments: so.images.map(i => ({ type: 'blob' as const, data: i.data, mimeType: i.mimeType })) } : {}
        await session.send({ prompt: turn.readOnly ? `${PLAN_NOTE}\n\n${prompt}` : prompt, ...images })
      } catch (err) {
        off()
        turn.readOnly = false
        throw err
      }
      return {
        // a message sent while the turn runs is taken by it ("immediate"); once it ended, it is a new turn
        async steer(t) {
          if (!live) return 'revert_to_followup'
          await session.send({ prompt: t, mode: 'immediate' })
          return 'complete_delivered'
        },
        cancel: async () => void (live && (await session.abort())),
        wait: () => ended,
      }
    },
    async summarize() {
      const done = session.rpc.history.compact().then(
        (r): SdkRunResult => (r.success ? { status: 'finished', result: r.summaryContent ?? '' } : { status: 'error', error: 'Copilot could not summarize the conversation' }),
        (err): SdkRunResult => ({ status: 'error', error: (err as Error).message }),
      )
      return { cancel: async () => undefined, wait: () => done }
    },
    close: () => session.disconnect(),
  }
}

/** `load`: the SDK's module (a test's fake; the real one when absent). */
export type CopilotSdkOptions = { load?: () => Promise<CopilotModule>; defaultModel?: string; guard?: Sdk['guard'] }

/** GitHub Copilot's agents as the host's Sdk. One runtime serves every agent; it starts on first use. */
export function copilotSdk(o: CopilotSdkOptions = {}): Sdk {
  let client: Promise<CopilotClient> | undefined
  const started = () =>
    (client ??= (async () => {
      const m = await (o.load ?? loadCopilot)()
      const c = new m.CopilotClient({ mode: 'coding-agent', runtime: m.RuntimeConnection.forSpawnedStdio() })
      await c.start()
      const auth = await c.getAuthStatus()
      if (!auth.isAuthenticated) {
        await c.stop().catch(() => undefined)
        throw new Error(`GitHub Copilot isn't signed in${auth.statusMessage ? ` (${auth.statusMessage})` : ''}: run \`copilot login\` in a terminal, or set GH_TOKEN, then restart symcc`)
      }
      return c
    })().catch(err => {
      // the next agent tries again: the owner may have signed in since
      client = undefined
      throw err
    }))
  return {
    name: 'Copilot',
    defaultModel: o.defaultModel ?? 'auto',
    ...(o.guard ? { guard: o.guard } : {}),
    async create(a: SdkAgentOptions) {
      const c = await started()
      const turn = { readOnly: false }
      const project = a.settings?.includes('project') === true
      const session = await c.createSession({
        clientName: 'symcc',
        model: a.model,
        workingDirectory: a.cwd,
        tools: {
          // symcc's prompts name its tools, so they are always there rather than found through Copilot's tool search
          definitions: Object.entries(a.tools).map(([name, t]) => ({
            name,
            description: t.description,
            parameters: t.inputSchema,
            skipPermission: true,
            defer: 'never' as const,
            handler: (args: unknown) => t.execute((args ?? {}) as Record<string, unknown>),
          })),
          // symcc's guard judges each shell command whole, so a guarded agent can't type into a running shell
          excludedTools: excludedTools([...a.disallowedTools, ...(a.guard ? SHELL_INPUT : [])]),
        },
        permissions: {
          onRequest: r => {
            const no = turn.readOnly ? readOnlyRefusal(r) : undefined
            return no ? { kind: 'reject', feedback: no } : { kind: 'approve-once' }
          },
        },
        events: { streaming: true },
        // the project's instructions (AGENTS.md, .github/copilot-instructions.md) and hooks only where the project's settings load
        instructions: { skipCustomInstructions: !project },
        hooks: { enableRepositoryHooks: project, ...(a.guard ? { handlers: { onPreToolUse: guarded(a.guard) } } : {}) },
      })
      return copilotAgent(session, a.model, turn)
    },
    models: async () => copilotModels(await (await started()).listModels()),
    async close() {
      const c = await client?.catch(() => undefined)
      await c?.stop()
    },
  }
}
