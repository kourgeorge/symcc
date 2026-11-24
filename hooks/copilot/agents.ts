// host.agents for GitHub Copilot CLI (T-959): each worker, scout or checker of symcc's is a child session of an SDK
// CopilotClient of its own, as the T-955 spike tried (docs/research/spike-test-a-small-copilot-cli-extension-for-the-4-open-host.md,
// point 4). The client spawns its own copilot process (RuntimeConnection.forSpawnedStdio with the copilot binary,
// process.execPath in the extension), since the default in-process runtime can't load inside an extension
// ("Cannot find the native Koffi module"). That process gets the extension's whole environment, so the owner's own
// model provider (BYOK: COPILOT_PROVIDER_*, COPILOT_MODEL) reaches the agents as it reaches the lead.
// Start: client.createSession in the agent's folder (workingDirectory), with its model, its base prompt appended to
// Copilot's system message, only the tools symcc's guard knows (availableTools; Copilot's own `task` sub-agents and
// ask_user left out), symcc's few tools for its kind (tools.ts copilotAgentTools), and symcc's guard bound to its id as
// onPreToolUse (guard.ts preToolUse). Once symcc has recorded it, the task prompt is sent. End: session.idle (its last
// message is the answer) or session.error (a failure) goes to `onEnd`, which hands it to symcc's agentFinished.
// Stop: session.abort, then the client is stopped. A finished agent's client is kept a while (keepMs) for a follow-up
// (T-656, the debrief: one more prompt in the same session), then stopped, so no copilot process is left behind.
// The SDK and the program parts are given in (`sdk`, `environment`): this folder imports no Node and no Copilot package.
import type { Host, HostAgent, HostAgentKind, HostAgentStart } from '../host'
import type { AgentRunEnd } from '../app/symcc'
import type { SymccTokens } from '../../types'
import { workers, scoutRuns, checkerRuns } from '../app/state'
import { addTokens, cleanTokens } from '../core/runs'
import { basePromptFor } from '../core/prompts'
import { preToolUse, deny, READ_ONLY_TOOLS } from './guard'
import { copilotAgentTools } from './tools'
import type { CpChildSession, CpClient, CpPreToolUseOutput, CpSdk, CpSessionEvent } from './sdk'

/** Copilot's built-in tools symcc's agents are offered: those the guard checks or knows only read, but the ones below. */
export const AGENT_BUILTIN_TOOLS: readonly string[] = [
  ...[...READ_ONLY_TOOLS].filter(t => !['task', 'read_agent', 'list_agents', 'ask_user', 'web_fetch', 'web_search'].includes(t)),
  'edit', 'create', 'str_replace_editor', 'str_replace', 'apply_patch', 'bash', 'powershell', 'local_shell',
]

/** The web tools: a worker gets them only when its role says `tools: web`; a scout or checker always (SCOUT_BASE says it may use the web). */
export const WEB_TOOLS: readonly string[] = ['web_fetch', 'web_search']

/**
 * Tools symcc's agents never get, even if a later Copilot offers them under these names: Copilot's own sub-agents
 * (`task`: whether their tool calls reach this session's onPreToolUse is not tried, so they are left out), its
 * question dialog (nobody watches an agent's session to answer it), and typing into a running shell (the guard
 * refuses it).
 */
export const AGENT_EXCLUDED_TOOLS: readonly string[] = ['task', 'read_agent', 'list_agents', 'ask_user', 'write_bash', 'write_powershell']

/** The environment variable that maps symcc's model names to the Copilot (or BYOK) model ids: "sonnet=my-sonnet,haiku=gpt-4o-mini". */
export const MODELS_ENV = 'SYMCC_COPILOT_MODELS'

/** A model map's text (MODELS_ENV) as a map: "name=id" pairs split on commas; anything else is left out. */
export function parseModels(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of (text ?? '').split(',')) {
    const at = pair.indexOf('=')
    const k = pair.slice(0, at).trim()
    const v = pair.slice(at + 1).trim()
    if (at > 0 && k && v) out[k] = v
  }
  return out
}

/**
 * The Copilot model for `name` (a role's or scout's `model:`): none (or "inherit", "default") is none, so Copilot
 * picks (its own choice, or COPILOT_MODEL with the owner's own provider); a name in `models` is its id there (a BYOK
 * model's id, say); any other is passed on as it is.
 */
export function copilotModel(name: string | undefined, models: Readonly<Record<string, string>> = {}): string | undefined {
  const m = (name ?? '').trim()
  if (!m || m === 'inherit' || m === 'default') return undefined
  return models[m] ?? m
}

/** The tools offered to agent `a`'s session (availableTools): the built-ins symcc's guard knows, the web ones when allowed, and its symcc tools. */
export function agentAvailableTools(a: Pick<HostAgentStart, 'kind' | 'tools'>, symccTools: readonly string[]): string[] {
  return [...AGENT_BUILTIN_TOOLS, ...(webAllowed(a) ? WEB_TOOLS : []), ...symccTools]
}

/** The tools left out of agent `a`'s session (excludedTools): AGENT_EXCLUDED_TOOLS, and the web ones when it may not use the web. */
export const agentExcludedTools = (a: Pick<HostAgentStart, 'kind' | 'tools'>): string[] => [...AGENT_EXCLUDED_TOOLS, ...(webAllowed(a) ? [] : WEB_TOOLS)]

/** Whether agent `a` may use the web: a scout or checker always, a worker when its role says `tools: web`. */
const webAllowed = (a: Pick<HostAgentStart, 'kind' | 'tools'>) => a.kind !== 'worker' || a.tools?.includes('web') === true

/** The base prompt agent `a` gets in its system message (WORKER_BASE or SCOUT_BASE, with Copilot's tool names). */
export const agentSystemPrompt = (a: Pick<HostAgentStart, 'kind' | 'tools' | 'prose'>, name: string): string =>
  basePromptFor(a.kind, name, t => `${name}_${t}`, { web: webAllowed(a), prose: a.prose === true })

/** Copilot's usage event (assistant.usage) in symcc's tokens. */
const usageTokens = (d: Record<string, unknown> | undefined): SymccTokens | undefined =>
  cleanTokens({ input: d?.inputTokens, output: d?.outputTokens, cache_read: d?.cacheReadTokens, cache_write: d?.cacheWriteTokens })

export type CopilotAgentsOptions = {
  /** the Host the agents' guards and tools run on (the Copilot host is built after its agents, so a getter) */
  host: () => Host
  /** CopilotClient, RuntimeConnection and approveAll from "@microsoft/copilot-sdk" */
  sdk: CpSdk
  /** the copilot binary each agent's client spawns (process.execPath in the extension) */
  execPath: string
  /** the environment each agent's copilot process gets: the extension's own (process.env), COPILOT_PROVIDER_* and all */
  environment: () => Record<string, string | undefined>
  /** the folder an agent with no `cwd` (a scout) works in */
  dir: string
  /** an agent's session ended (or a follow-up turn did): how, in symcc's words */
  onEnd: (id: string, end: AgentRunEnd) => void
  /** symcc's plugin name, for the base prompts' tool names (default "symcc") */
  name?: string
  /** symcc's model names to Copilot model ids (on top of MODELS_ENV in the environment) */
  models?: Record<string, string>
  /** whether symcc has recorded agent `id` (so its guard knows it); default: this copy's workers, scouts and checkers */
  ready?: (id: string, kind: HostAgentKind) => boolean | Promise<boolean>
  /** how long `ready` is waited for (default 20 s), and how often looked at (default 100 ms) */
  waitMs?: number
  pollMs?: number
  /** how long a finished agent's client is kept for a follow-up before it is stopped (default 10 min) */
  keepMs?: number
  /** a line for the debug log */
  log?: (text: string) => void
}

/** The agents copilotAgents keeps: Host['agents'] with followUp, plus `end` (stops every client, for the session's end). */
export type CopilotAgents = Required<Pick<Host['agents'], 'spawn' | 'list' | 'send' | 'stop' | 'followUp'>> & { end: () => Promise<void> }

type Run = HostAgent & {
  client: CpClient
  session: CpChildSession
  answer: string
  tokens?: SymccTokens
  error?: string
  off?: () => void
  closed?: true
  keep?: { cancel: () => void }
}

/** host.agents as Copilot child sessions, each with a client (and a copilot process) of its own. */
export function copilotAgents(o: CopilotAgentsOptions): CopilotAgents {
  const runs = new Map<string, Run>()
  const name = o.name ?? 'symcc'
  const log = o.log ?? (() => undefined)
  const waitMs = o.waitMs ?? 20_000
  const pollMs = o.pollMs ?? 100
  const keepMs = o.keepMs ?? 10 * 60_000
  const ready = o.ready ?? ((id: string) => workers.has(id) || scoutRuns.has(id) || checkerRuns.has(id))
  const ended = (r: Run) => r.status === 'completed' || r.status === 'failed' || r.status === 'killed'

  /** Stops run `r`'s session and client (once). */
  const close = async (r: Run) => {
    if (r.closed) return
    r.closed = true
    r.keep?.cancel()
    r.off?.()
    await r.session.disconnect().catch(() => undefined)
    await r.client.stop().catch(() => undefined)
    log(`${name}: Copilot client of ${r.kind} ${r.name} (${r.id}) stopped`)
  }

  /** Run `r`'s turn ended: its status, `onEnd`, then its client is kept for a follow-up (a finished one) or stopped. */
  const finish = (r: Run, end: AgentRunEnd) => {
    if (r.status !== 'running' && r.status !== 'pending' && r.status !== 'stopping') return
    r.status = end.isAborted ? 'killed' : end.end.reason === 'error' ? 'failed' : 'completed'
    o.onEnd(r.id, end)
    if (r.status !== 'completed') return void close(r)
    r.keep = o.host().clock.after(keepMs, () => void close(r))
  }

  /** What session `r` says: its answer, tokens, error and end. Sub-agents' events (agentId) only add their tokens. */
  const onEvent = (r: Run, e: CpSessionEvent) => {
    const d = e.data
    if (e.type === 'assistant.usage') return void (r.tokens = addTokens(r.tokens, usageTokens(d)))
    if (e.agentId) return
    if (e.type === 'assistant.message') {
      const text = typeof d?.content === 'string' ? d.content.trim() : ''
      if (text) r.answer = text
    } else if (e.type === 'session.error') {
      const error = typeof d?.message === 'string' && d.message ? d.message : 'the Copilot session failed'
      if (r.status === 'running') finish(r, { answer: r.answer || error, end: { reason: 'error', error }, isAborted: false, tokens: r.tokens })
    } else if (e.type === 'session.idle' && r.status === 'running') {
      if (d?.aborted === true) finish(r, { answer: r.answer, end: { reason: 'aborted' }, isAborted: true, tokens: r.tokens })
      else finish(r, { answer: r.answer, end: { reason: 'answer' }, isAborted: false, tokens: r.tokens })
    }
  }

  /** Waits until symcc has recorded `r`, then sends its task prompt. */
  const run = async (r: Run, a: HostAgentStart) => {
    const clock = o.host().clock
    for (const until = Date.now() + waitMs; !(await Promise.resolve(ready(r.id, a.kind)).catch(() => false)); ) {
      if (Date.now() >= until || r.status !== 'pending') {
        if (r.status === 'pending') finish(r, { answer: `${name} never recorded this ${a.kind}, so it was not started`, end: { reason: 'error' }, isAborted: false, tokens: undefined })
        return
      }
      await clock.sleep(pollMs)
    }
    if (r.status !== 'pending') return
    r.status = 'running'
    try {
      await r.session.send({ prompt: a.prompt })
      log(`${a.kind} ${a.name} prompted in Copilot session ${r.id}`)
    } catch (err) {
      finish(r, { answer: `the Copilot session failed: ${(err as Error)?.message ?? err}`, end: { reason: 'error' }, isAborted: false, tokens: r.tokens })
    }
  }

  return {
    async spawn(a) {
      const host = o.host()
      const env = { ...o.environment() }
      const models = { ...parseModels(env[MODELS_ENV]), ...o.models }
      const cwd = a.cwd ?? o.dir
      const client = new o.sdk.CopilotClient({ mode: 'coding-agent', runtime: o.sdk.RuntimeConnection.forSpawnedStdio({ path: o.execPath, env }) })
      // the session's id is only known once it is made: the guard and the tools refuse anything before that
      let id: string | undefined
      const symccTools = copilotAgentTools(host, a.kind, () => id)
      const model = copilotModel(a.model, models)
      let session: CpChildSession
      try {
        session = await client.createSession({
          workingDirectory: cwd,
          ...(model ? { model } : {}),
          systemMessage: { mode: 'append', content: agentSystemPrompt(a, name) },
          tools: { definitions: symccTools, availableTools: agentAvailableTools(a, symccTools.map(t => t.name)), excludedTools: agentExcludedTools(a) },
          permissions: { onRequest: o.sdk.approveAll },
          hooks: {
            handlers: {
              onPreToolUse: async input => {
                if (!id) return deny(`${name} has not started this agent yet`)
                return (await preToolUse(o.host(), cwd, id, input, async () => 'symcc')) as CpPreToolUseOutput | undefined
              },
            },
          },
        })
      } catch (err) {
        await client.stop().catch(() => undefined)
        throw err
      }
      id = session.sessionId
      const r: Run = { id, kind: a.kind === 'worker' ? 'worker' : 'scout', status: 'pending', name: a.name, description: a.description, client, session, answer: '' }
      runs.set(id, r)
      r.off = session.on(e => onEvent(r, e))
      log(`${a.kind} ${a.name}: Copilot session ${id} in ${cwd}${model ? ` on ${model}` : ''}`)
      void run(r, a)
      return { agentId: id }
    },
    list: async () => [...runs.values()].map(({ id, kind, status, name, description }) => ({ id, kind, status, name, description })),
    async send(agentId, text) {
      const r = runs.get(agentId)
      if (r?.status === 'running') await r.session.send({ prompt: text, mode: 'immediate' })
    },
    async stop(agentId) {
      const r = runs.get(agentId)
      if (!r) return
      if (!ended(r)) {
        r.status = 'stopping'
        await r.session.abort().catch(() => undefined)
        finish(r, { answer: r.answer, end: { reason: 'aborted' }, isAborted: true, tokens: r.tokens })
      }
      await close(r)
    },
    async followUp(agentId, text) {
      const r = runs.get(agentId)
      if (!r || r.status !== 'completed' || r.closed) throw new Error(`${agentId} is no finished agent session of ${name}'s that is still open`)
      r.keep?.cancel()
      r.keep = undefined
      // the follow-up's end has only its own answer and tokens
      Object.assign(r, { status: 'running', answer: '', tokens: undefined })
      try {
        await r.session.send({ prompt: text })
      } catch (err) {
        r.status = 'completed'
        r.keep = o.host().clock.after(keepMs, () => void close(r))
        throw err
      }
    },
    async end() {
      await Promise.all([...runs.values()].map(r => close(r)))
    },
  }
}
