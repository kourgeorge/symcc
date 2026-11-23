// host.agents as OpenCode sessions (T-463): each worker, scout or checker of symcc's is an OpenCode session of its own.
// Start: session.create (a child of the lead's session when it is known, with the model its role asks for, or the lead's own
// current model when it names none, T-504), then
// session.move into its folder, because a child made with parentID ignores `location` (and the move takes effect a
// moment later, so it is waited for with session.get), then session.prompt with its base prompt and task prompt.
// The prompt waits until symcc has recorded the agent (`ready`): a worker's tool calls are judged by the copy of the
// plugin for its folder, which only knows it from the board. End: session.wait, then session.get (outcome, tokens,
// cost) and session.context (its final text) go to `onEnd`, which hands them to symcc's agentFinished. Stop:
// session.interrupt. Follow-up (T-656, the debrief): one more queued prompt in a finished agent's session; its end
// goes to `onEnd` again, with only that turn's tokens. See docs/research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md, points 2 and 7.
import type { HostAgent, HostAgentKind, HostAgentStart } from '../host'
import type { AgentRunEnd } from '../app/symcc'
import type { SymccTokens } from '../../types'
import { addTokens, cleanTokens } from '../core/runs'
import { basePromptFor } from '../core/prompts'
import type { OcModelRef, OcSessionApi, OcSessionInfo, OcSessionMessage, OcTokens } from './ctx'
import { realPathOf } from './guard'

/**
 * The OpenCode model each kind of agent runs on when its role (or scout file) names none and the lead's own model
 * can't be found (no lead session known yet, or OpenCode couldn't say).
 */
export const DEFAULT_MODELS: Record<HostAgentKind, string> = { worker: 'claude-agent/sonnet', scout: 'claude-agent/haiku', checker: 'claude-agent/haiku' }

/** OpenCode's own "Claude Agent" provider: the real Claude Code, signed in with the owner's Claude Code login. */
export const CLAUDE_AGENT = 'claude-agent'

/** Claude's model families, as the Claude Agent provider names its models. */
const CLAUDE_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable']

/** Whether a role's or scout's `model:` names no model: none, "inherit" or "default". */
export function namesNoModel(name: string | undefined): boolean {
  const m = (name ?? '').trim()
  return !m || m === 'inherit' || m === 'default'
}

/**
 * The OpenCode model for `name` (a role's or scout's `model:`), for an agent of kind `kind` (R8): "provider/model"
 * as it is (e.g. "openai/gpt-5", "claude-agent/opus"); a Claude name as Claude Code says it ("sonnet",
 * "claude-opus-4-5", "opus[1m]") becomes that family on the Claude Agent provider; any other bare name is taken as a
 * Claude Agent model id. None (or "inherit", "default"): the lead's current model `lead` when known (T-504), else
 * DEFAULT_MODELS for the kind.
 */
export function opencodeModel(name: string | undefined, kind: HostAgentKind, lead?: OcModelRef): OcModelRef {
  if (namesNoModel(name)) return (lead && modelRef(lead)) || opencodeModel(DEFAULT_MODELS[kind], kind)
  const m = name!.trim()
  const at = m.indexOf('/')
  if (at > 0 && at < m.length - 1) return { providerID: m.slice(0, at), id: m.slice(at + 1) }
  const family = CLAUDE_FAMILIES.find(f => new RegExp(`(^|[^a-z])${f}([^a-z]|$)`, 'i').test(m))
  return { providerID: CLAUDE_AGENT, id: family ?? m }
}

/** `m` as a model for session.create, if it is one: provider, id and (when set) variant. */
function modelRef(m: unknown): OcModelRef | undefined {
  const o = m && typeof m === 'object' ? (m as Record<string, unknown>) : {}
  if (typeof o.providerID !== 'string' || !o.providerID || typeof o.id !== 'string' || !o.id) return undefined
  return { providerID: o.providerID, id: o.id, ...(typeof o.variant === 'string' && o.variant ? { variant: o.variant } : {}) }
}

/**
 * The model lead session `sessionID` is using now (T-504): session.get's `model`, else the model of its latest
 * assistant or "model-switched" message (session.context). Undefined when neither says one; throws when OpenCode fails.
 */
export async function leadModel(api: OcSessionApi, sessionID: string): Promise<OcModelRef | undefined> {
  const now = modelRef((await api.get({ sessionID })).model)
  if (now) return now
  const messages = await api.context({ sessionID })
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    const ref = m.type === 'assistant' || m.type === 'model-switched' ? modelRef(m.model) : undefined
    if (ref) return ref
  }
  return undefined
}

/**
 * OpenCode's own rules for symcc's agent sessions, on top of its Build agent's: no `question` tool, as nobody watches
 * a background session to answer it (it would wait for ever). Everything else is judged by symcc's guard (guard.ts).
 */
export const AGENT_PERMISSIONS = [{ action: 'question', resource: '*', effect: 'deny' as const }]

/** OpenCode's words for a tool of plugin `name` (as hooks/opencode/host.ts OPENCODE_WORDS.tool). */
const ocTool = (name: string, tool: string) => `${name}_${tool}`

/** The prompt agent `a` is given: its base prompt (WORKER_BASE or SCOUT_BASE, with OpenCode's tool names), then its task's prompt. */
export const sessionPrompt = (a: Pick<HostAgentStart, 'kind' | 'prompt' | 'prose'>, name: string): string => `${basePromptFor(a.kind, name, t => ocTool(name, t), a.prose ? { prose: true } : {})}\n\n${a.prompt}`

/** The text of a session's final answer: the text parts of its last assistant message that has any. */
export function finalText(messages: ReadonlyArray<OcSessionMessage>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.type !== 'assistant') continue
    const text = (m.content ?? []).filter(p => p.type === 'text' && typeof p.text === 'string').map(p => p.text!).join('\n').trim()
    if (text) return text
  }
  return ''
}

/** OpenCode's token counts (a session's or one message's) in symcc's words. Reasoning tokens count as output. */
export function ocTokens(t: OcTokens | undefined): SymccTokens | undefined {
  return t ? cleanTokens({ input: t.input, output: (t.output ?? 0) + (t.reasoning ?? 0), cache_read: t.cache?.read, cache_write: t.cache?.write }) : undefined
}

/** How a finished session ended, in symcc's words (AgentRunEnd), from session.get and session.context. Reasoning tokens count as output. */
export function sessionEnd(info: OcSessionInfo, messages: ReadonlyArray<OcSessionMessage>): AgentRunEnd {
  const tokens = ocTokens(info.tokens)
  const answer = finalText(messages)
  const last = [...messages].reverse().find(m => m.type === 'assistant')
  const cost = typeof info.cost === 'number' && info.cost > 0 ? { cost: info.cost } : {}
  if (info.outcome === 'interrupted') return { answer, end: { reason: 'aborted' }, isAborted: true, tokens, ...cost }
  if (last?.finish === 'content-filter') return { answer, end: { reason: 'refusal', refusal: { category: null, explanation: answer || null } }, isAborted: false, tokens, ...cost }
  const failed = info.outcome === 'failed' || last?.finish === 'error' || !!last?.error
  return { answer: answer || (failed ? errorText(last?.error) : ''), end: { reason: failed ? 'error' : 'answer' }, isAborted: false, tokens, ...cost }
}

/**
 * T-656: how a follow-up turn of a finished session ended: as sessionEnd, but with the tokens and cost of only the
 * messages after the first `before` ones (the session's own counts are for its whole life).
 */
export function followUpEnd(info: OcSessionInfo, messages: ReadonlyArray<OcSessionMessage>, before: number): AgentRunEnd {
  const fresh = messages.slice(before)
  const end = sessionEnd({ ...info, tokens: undefined, cost: undefined }, fresh)
  const mine = fresh.filter(m => m.type === 'assistant')
  let tokens: SymccTokens | undefined
  for (const m of mine) {
    const t = ocTokens(m.tokens)
    if (t) tokens = tokens ? addTokens(tokens, t) : t
  }
  const cost = mine.reduce((n, m) => n + (typeof m.cost === 'number' ? m.cost : 0), 0)
  return { ...end, tokens, ...(cost > 0 ? { cost } : {}) }
}

/** A session error's message, as far as it says one. */
function errorText(e: unknown): string {
  const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
  return typeof o.message === 'string' ? o.message : e ? JSON.stringify(e).slice(0, 500) : 'the session failed'
}

export type OpencodeAgentsOptions = {
  /** symcc's plugin name, for the base prompts' tool names (default "symcc") */
  name?: string
  /** the folder of the copy that starts agents: an agent with no `cwd` (a scout) works there */
  dir: string
  /** the lead's OpenCode session, when known: agents are made its children */
  lead?: () => string | undefined
  /** whether symcc has recorded agent `id` (so the guard of its folder's copy knows it); its prompt waits for that */
  ready?: (id: string, kind: HostAgentKind) => Promise<boolean>
  /** an agent's session ended: how, in symcc's words */
  onEnd: (id: string, end: AgentRunEnd) => void
  /** how long a move into the agent's folder, and `ready`, are waited for (default 20 s), and how often looked at (default 200 ms) */
  waitMs?: number
  pollMs?: number
  /** a pause (default: a timer) */
  sleep?: (ms: number) => Promise<void>
  /** a line for the debug log */
  log?: (text: string) => void
}

/** The agents an OpencodeAgents keeps: Host['agents'], plus whether a session is one of them. */
export type OpencodeAgents = {
  spawn: (a: HostAgentStart) => Promise<{ agentId?: string }>
  list: () => Promise<HostAgent[]>
  send: (agentId: string, text: string) => Promise<unknown>
  stop: (agentId: string, text: string) => Promise<unknown>
  /** T-656: one more prompt in a finished agent's session (see Host['agents'].followUp); its end goes to `onEnd` again */
  followUp: (agentId: string, text: string) => Promise<unknown>
  /** whether `sessionID` is an agent this started */
  has: (sessionID: string) => boolean
}

/** host.agents over OpenCode's session API `api` (ctx.session). */
export function opencodeAgents(api: OcSessionApi, o: OpencodeAgentsOptions): OpencodeAgents {
  const runs = new Map<string, HostAgent>()
  const waitMs = o.waitMs ?? 20_000
  const pollMs = o.pollMs ?? 200
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>(res => setTimeout(res, ms)))
  const log = o.log ?? (() => undefined)
  const name = o.name ?? 'symcc'
  let saidNoLeadModel = false

  /**
   * The model agent `a` runs on, and whether it is the lead's: a named one as opencodeModel says; none, the lead's
   * current model, else DEFAULT_MODELS (said once in the log).
   */
  const modelFor = async (a: HostAgentStart, parentID: string | undefined): Promise<{ model: OcModelRef; fromLead: boolean }> => {
    if (!namesNoModel(a.model)) return { model: opencodeModel(a.model, a.kind), fromLead: false }
    let why = 'no lead session known yet'
    if (parentID) {
      try {
        const lead = await leadModel(api, parentID)
        if (lead) return { model: opencodeModel(a.model, a.kind, lead), fromLead: true }
        why = "OpenCode didn't say the lead session's model"
      } catch (err) {
        why = `couldn't read the lead session's model: ${(err as Error)?.message ?? err}`
      }
    }
    if (!saidNoLeadModel) {
      saidNoLeadModel = true
      log(`agents with no model of their own run on symcc's default models (${Object.entries(DEFAULT_MODELS).map(([k, v]) => `${k} ${v}`).join(', ')}): ${why}`)
    }
    return { model: opencodeModel(a.model, a.kind), fromLead: false }
  }

  /** Waits until `check` says yes, looking every pollMs for at most waitMs; answers whether it did. */
  const until = async (check: () => Promise<boolean>) => {
    for (const end = Date.now() + waitMs; ; ) {
      if (await check().catch(() => false)) return true
      if (Date.now() >= end) return false
      await sleep(pollMs)
    }
  }

  /** Moves session `id` into folder `cwd`, and waits until session.get shows it there (the move lands a moment later). */
  const moveTo = async (id: string, cwd: string) => {
    const want = await realPathOf(cwd)
    let looks = 0
    const there = async () => (looks++, (await realPathOf((await api.get({ sessionID: id })).location.directory)) === want)
    if (await there().catch(() => false)) return
    await api.move({ sessionID: id, directory: cwd })
    looks = 0
    if (!(await until(there))) throw new Error(`OpenCode didn't move the session into ${cwd} within ${Math.round(waitMs / 1000)} s`)
    log(`session ${id} moved into ${cwd} (seen there on look ${looks})`)
  }

  /** Session `id` ended (or never got going): its end is read and handed on once. */
  const finish = async (id: string, fallback?: AgentRunEnd) => {
    const run = runs.get(id)
    if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'killed') return
    let end: AgentRunEnd
    if (fallback) end = fallback
    else {
      try {
        end = sessionEnd(await api.get({ sessionID: id }), await api.context({ sessionID: id }).catch(() => []))
      } catch (err) {
        end = { answer: `couldn't read how the OpenCode session ended: ${(err as Error)?.message ?? err}`, end: { reason: 'error' }, isAborted: false, tokens: undefined }
      }
    }
    runs.set(id, { ...run, status: end.isAborted ? 'killed' : end.end.reason === 'error' ? 'failed' : 'completed' })
    o.onEnd(id, end)
  }

  /** Prompts session `id` once symcc has recorded it, then waits for its end. */
  const run = async (id: string, a: HostAgentStart) => {
    if (o.ready && !(await until(() => o.ready!(id, a.kind)))) {
      await api.interrupt({ sessionID: id }).catch(() => undefined)
      return finish(id, { answer: `${name} never recorded this ${a.kind}, so it was not started`, end: { reason: 'error' }, isAborted: false, tokens: undefined })
    }
    if (runs.get(id)?.status !== 'pending') return
    try {
      await api.prompt({ sessionID: id, text: sessionPrompt(a, name), delivery: 'queue' })
      // stopped while the prompt was landing: its interrupt came too early, so interrupt again, and don't hand on a second end
      if (runs.get(id)?.status !== 'pending') {
        await api.interrupt({ sessionID: id }).catch(() => undefined)
        return
      }
      runs.set(id, { ...runs.get(id)!, status: 'running' })
      log(`${a.kind} ${a.name} prompted in OpenCode session ${id}`)
      await api.wait({ sessionID: id })
    } catch (err) {
      return finish(id, { answer: `the OpenCode session failed: ${(err as Error)?.message ?? err}`, end: { reason: 'error' }, isAborted: false, tokens: undefined })
    }
    await finish(id)
  }

  return {
    async spawn(a) {
      const parentID = o.lead?.()
      const { model, fromLead } = await modelFor(a, parentID)
      const s = await api.create({ ...(parentID ? { parentID } : {}), title: a.description || a.name, model, location: { directory: a.cwd ?? o.dir }, metadata: { symcc: a.kind }, permissions: AGENT_PERMISSIONS })
      const id = s.id
      runs.set(id, { id, kind: a.kind === 'worker' ? 'worker' : 'scout', status: 'pending', name: a.name, description: a.description })
      log(`${a.kind} ${a.name}: OpenCode session ${id} on ${model.providerID}/${model.id}${fromLead ? " (the lead's model)" : ''}`)
      try {
        if (a.cwd) await moveTo(id, a.cwd)
      } catch (err) {
        runs.delete(id)
        await api.remove?.({ sessionID: id }).catch(() => undefined)
        throw err
      }
      void run(id, a)
      return { agentId: id }
    },
    list: async () => [...runs.values()],
    async send(agentId, text) {
      if (runs.get(agentId)?.status === 'running') await api.prompt({ sessionID: agentId, text, delivery: 'steer' })
    },
    async stop(agentId) {
      const r = runs.get(agentId)
      if (!r || (r.status !== 'running' && r.status !== 'pending')) return
      if (r.status === 'pending') runs.set(agentId, { ...r, status: 'stopping' })
      await api.interrupt({ sessionID: agentId }).catch(() => undefined)
      if (r.status === 'pending') await finish(agentId, { answer: '', end: { reason: 'aborted' }, isAborted: true, tokens: undefined })
    },
    async followUp(agentId, text) {
      const r = runs.get(agentId)
      if (!r || r.status !== 'completed') throw new Error(`${agentId} is no finished agent session of ${name}'s`)
      const before = (await api.context({ sessionID: agentId }).catch(() => [])).length
      runs.set(agentId, { ...r, status: 'running' })
      try {
        await api.prompt({ sessionID: agentId, text, delivery: 'queue' })
      } catch (err) {
        runs.set(agentId, r)
        throw err
      }
      void (async () => {
        let end: AgentRunEnd
        try {
          await api.wait({ sessionID: agentId })
          end = followUpEnd(await api.get({ sessionID: agentId }), await api.context({ sessionID: agentId }).catch(() => []), before)
        } catch (err) {
          end = { answer: `the OpenCode session failed: ${(err as Error)?.message ?? err}`, end: { reason: 'error' }, isAborted: false, tokens: undefined }
        }
        if (runs.get(agentId)?.status !== 'running') return
        runs.set(agentId, { ...r, status: end.isAborted ? 'killed' : end.end.reason === 'error' ? 'failed' : 'completed' })
        o.onEnd(agentId, end)
      })()
    },
    has: id => runs.has(id),
  }
}
