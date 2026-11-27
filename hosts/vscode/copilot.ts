// GitHub Copilot's agents (@microsoft/copilot-sdk) behind the host's Sdk (./sdk.ts), so the engine, the lead chat and
// the board run on them as on Cursor's: each agent is one Copilot session in its folder, symcc's tools are served to it
// from this process, its events are the board's steps, and symcc's guard (./guard.ts, given in as `guard`) is its
// onPreToolUse hook, so each tool call is judged before it runs. copilotSdk() starts the Copilot runtime on first use
// (COPILOT_CLI_PATH's, else the SDK's own, else the owner's copilot CLI), signed in as the copilot CLI is (`copilot
// login`, or GH_TOKEN). The SDK isn't typed here, and dist/engine.mjs loads it by name: its own runtime is some 200 MB,
// so it is an optional dependency. editor/serve.mjs bundles the SDK without that runtime and runs the owner's CLI.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { copilotModels, type CopilotModel } from './copilot-models'
import type { Sdk, SdkAgent, SdkAgentOptions, SdkModel, SdkModelInfo, SdkRun, SdkRunResult, SdkSendOptions, SdkStep, SdkToolGuard, SdkUsage } from './sdk'
import { argWords, short } from './steps'

export { copilotModels, type CopilotModel }

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
  rpc: { timeline: { compact: () => Promise<{ success: boolean; summaryContent?: string }> } }
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
  RuntimeConnection: { forSpawnedStdio: (o?: { path?: string }) => unknown }
}

const COPILOT_SDK = '@microsoft/copilot-sdk'

async function loadCopilot(): Promise<CopilotModule> {
  try {
    return (await import(COPILOT_SDK)) as CopilotModule
  } catch (err) {
    throw new Error(`symcc on Copilot needs ${COPILOT_SDK}: run npm install in hosts/vscode (${(err as Error).message})`)
  }
}

export type CliFs = { exists: (p: string) => boolean; real: (p: string) => string; read: (p: string) => string }
const nodeFs: CliFs = { exists: existsSync, real: p => realpathSync(p), read: p => readFileSync(p, 'utf8') }

/**
 * The owner's copilot CLI: `copilot` on the PATH, else where its installers put it (an editor started from the desktop
 * may have a short PATH). An npm install answers its JavaScript entry, which the SDK runs with this Node.
 */
export function copilotCli(env: Record<string, string | undefined> = process.env, os: string = process.platform, fs: CliFs = nodeFs): string | undefined {
  const win = os === 'win32'
  const { join } = win ? win32 : posix
  const home = env.HOME || env.USERPROFILE || homedir()
  const known = win ? [join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links'), join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'npm')] : [join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
  const dirs = [...(env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter(Boolean), ...known]
  // an npm install on Windows is a copilot.cmd beside node_modules/@github/copilot, whose package names the entry
  const npmEntry = (dir: string) => {
    const pkg = join(dir, 'node_modules', '@github', 'copilot')
    try {
      const bin = (JSON.parse(fs.read(join(pkg, 'package.json'))) as { bin?: string | Record<string, string> }).bin
      const entry = typeof bin === 'string' ? bin : bin?.copilot
      return entry && fs.exists(join(pkg, entry)) ? join(pkg, entry) : undefined
    } catch {
      return undefined
    }
  }
  for (const dir of dirs) {
    if (!win && fs.exists(join(dir, 'copilot'))) return fs.real(join(dir, 'copilot'))
    if (win && fs.exists(join(dir, 'copilot.exe'))) return join(dir, 'copilot.exe')
    if (win && fs.exists(join(dir, 'copilot.cmd'))) {
      const entry = npmEntry(dir)
      if (entry) return entry
    }
  }
  return undefined
}

const UPDATE_SYMCC = 'In Claude Code: claude plugin marketplace update symcc && claude plugin update symcc@symcc. In Copilot CLI: copilot plugin marketplace update symcc && copilot plugin update symcc@symcc. From a clone: git pull.'

/** The SDK's protocol mismatch in the owner's words, with what to update (undefined: `message` is another error). */
export function protocolWords(message: string, cli: string): string | undefined {
  const m = /SDK supports versions (\d+)-(\d+), but server (?:reports version (\d+)|does not report)/.exec(message)
  if (!m) return undefined
  const [low, high, theirs] = [Number(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3])]
  const ours = low === high ? `${high}` : `${low} to ${high}`
  if (theirs !== undefined && theirs > high) return `The copilot CLI at ${cli} is newer than this symcc: it speaks protocol ${theirs}, and symcc speaks ${ours}. Update symcc, then restart it. ${UPDATE_SYMCC}`
  return `The copilot CLI at ${cli} is older than this symcc: it speaks protocol ${theirs ?? 'none'}, and symcc speaks ${ours}. Update it with copilot update (or npm install -g @github/copilot), then restart symcc.`
}

const NO_CLI = 'symcc on Copilot runs your copilot CLI, and found none. Install it (npm install -g @github/copilot), sign in with copilot login, then restart symcc. Or set COPILOT_CLI_PATH to it.'

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
      const done = session.rpc.timeline.compact().then(
        (r): SdkRunResult => (r.success ? { status: 'finished', result: r.summaryContent ?? '' } : { status: 'error', error: 'Copilot could not summarize the conversation' }),
        (err): SdkRunResult => ({ status: 'error', error: (err as Error).message }),
      )
      return { cancel: async () => undefined, wait: () => done }
    },
    close: () => session.disconnect(),
  }
}

/** `load`: the SDK's module (a test's fake; the real one when absent). `cli`: finds the owner's copilot CLI. */
export type CopilotSdkOptions = { load?: () => Promise<CopilotModule>; defaultModel?: string; guard?: Sdk['guard']; cli?: () => string | undefined; env?: Record<string, string | undefined> }

/** GitHub Copilot's agents as the host's Sdk. One runtime serves every agent; it starts on first use. */
export function copilotSdk(o: CopilotSdkOptions = {}): Sdk {
  let client: Promise<CopilotClient> | undefined
  const env = o.env ?? process.env
  const started = () =>
    (client ??= (async () => {
      const m = await (o.load ?? loadCopilot)()
      const start = async (path?: string) => {
        const c = new m.CopilotClient({ mode: 'coding-agent', runtime: m.RuntimeConnection.forSpawnedStdio(path ? { path } : undefined) })
        try {
          await c.start()
          return c
        } catch (err) {
          await c.stop().catch(() => undefined)
          const words = protocolWords((err as Error).message, path ?? env.COPILOT_CLI_PATH ?? 'COPILOT_CLI_PATH')
          throw words ? new Error(words) : err
        }
      }
      let c: CopilotClient
      if (env.COPILOT_CLI_PATH) c = await start()
      else
        c = await start().catch(async (own: Error) => {
          // no runtime of the SDK's own (editor/serve.mjs has none): the owner's CLI
          if (/protocol/.test(own.message)) throw own
          const cli = (o.cli ?? (() => copilotCli(env)))()
          if (!cli) throw new Error(NO_CLI)
          return start(cli)
        })
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
