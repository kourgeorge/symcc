// host.agents as Cursor SDK local agents (or GitHub Copilot's, through the same Sdk): each worker, scout or checker is
// one agent in its folder, given its base prompt and its task's prompt as one turn. Unlike a `claude -p` process (hooks/process/agents.ts) a running agent
// takes messages (send: the SDK's steer, e.g. "wrap up"), and symcc's own tools are served to it from this process
// (the workers' ask_owner; the scouts' board, stats and scouts), so its prompt names them as Claude Code's does.
import type { Host, HostAgent, HostAgentStart } from '../../hooks/host'
import { SYMCC_WORDS } from '../../hooks/host'
import type { AgentRunEnd } from '../../hooks/app/symcc'
import { basePromptFor } from '../../hooks/core/prompts'
import { ASK_TOOL_DEF } from '../../hooks/app/ask'
import { TOOLS } from '../../hooks/app/tools'
import { SCOUT_BOARD_TOOLS, SCOUT_LIST_TOOL } from '../../hooks/core/scouts'
import { cleanTokens } from '../../hooks/core/runs'
import { S } from '../../hooks/app/state'
import type { Sdk, SdkAgent, SdkRun, SdkRunResult, SdkStep, SdkTool } from './sdk'

/** A tool's definition as symcc lists it (TOOLS, ASK_TOOL_DEF). */
export type ToolDef = { name: string; description: string; inputSchema: unknown }

/** symcc's tools an agent of `kind` gets: a worker asks the owner; a scout or checker reads the board (a scout also lists the scouts). */
export function agentToolDefs(kind: HostAgentStart['kind']): ToolDef[] {
  if (kind === 'worker') return [ASK_TOOL_DEF()]
  const names = kind === 'scout' ? [...SCOUT_BOARD_TOOLS, SCOUT_LIST_TOOL] : [...SCOUT_BOARD_TOOLS]
  return TOOLS().filter(t => names.includes(t.name))
}

/** The SDK tools agent `a` may not use: no subagents; the web only when its role gives it web tools; a scout or checker never edits. */
export function disallowedFor(a: Pick<HostAgentStart, 'kind' | 'tools'>): string[] {
  const web = a.tools?.includes('web') ? [] : ['webSearch', 'webFetch']
  const edits = a.kind === 'worker' ? [] : ['edit', 'delete', 'applyAgentDiff']
  return ['task', 'generateImage', ...web, ...edits]
}

/** The prompt agent `a` runs with: its base prompt in symcc's words, naming its tools, then its task's prompt. */
export const withCursorPrompt = (a: Pick<HostAgentStart, 'kind' | 'prompt' | 'tools' | 'prose'>): string => {
  const tool = (t: string) => SYMCC_WORDS.tool(S.N.name, t)
  const base = basePromptFor(a.kind, S.N.name, tool, { symccTools: true, web: a.tools?.includes('web') === true, prose: a.prose === true })
  return `${base}\n\n${a.prompt}`
}

/** Role models in Claude Code's words mean "symcc's default" here; any other name is a model id of the SDK's. */
const CLAUDE_MODEL_WORDS = /^(opus|sonnet|haiku|inherit|default)$/i

/** How a run of `who`'s agent ended, in symcc's words. */
export function runEnd(r: SdkRunResult, killed: boolean, who = 'Cursor'): AgentRunEnd {
  const u = r.usage
  const tokens = u ? cleanTokens({ input: u.inputTokens, output: u.outputTokens, cache_read: u.cacheReadTokens, cache_write: u.cacheWriteTokens }) : undefined
  if (killed || r.status === 'cancelled') return { answer: r.result ?? '', end: { reason: 'aborted' }, isAborted: true, tokens }
  if (r.status === 'finished') return { answer: r.result ?? '', end: { reason: 'answer' }, isAborted: false, tokens }
  const why = r.error === undefined ? '' : `: ${typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}`.slice(0, 500)
  return { answer: r.result || `the ${who} agent run ended with status ${r.status}${why}`, end: { reason: 'error' }, isAborted: false, tokens }
}

export type SdkAgentsOptions = {
  sdk: Sdk
  /** the model for an agent whose role names none (or names a Claude Code model word) */
  model: string
  /** a run of agent `agentId` ended (once per run: its first run, and each follow-up) */
  onEnd: (agentId: string, end: AgentRunEnd) => void
  /** agent `agentId` called symcc's tool `tool`; answers the text it gets back */
  onTool: (agentId: string, tool: string, input: Record<string, unknown>) => Promise<string>
  /** each step of agent `agentId`'s turns as it happens */
  onStep?: (agentId: string, s: SdkStep) => void
  /** a line for the debug log */
  log?: (line: string) => void
}

/** The agents sdkAgents keeps: Host['agents'], plus what the session waits on. */
export type SdkAgents = Host['agents'] & {
  /** how many runs go on now */
  running: () => number
  /** ends every run (they end as aborted) and lets go of every agent */
  stopAll: (graceMs?: number) => Promise<void>
}

export function sdkAgents(o: SdkAgentsOptions): SdkAgents {
  type Entry = { agent: HostAgent; start: HostAgentStart; sdk?: SdkAgent; run?: SdkRun; killed: boolean; ended: Promise<void> }
  const entries = new Map<string, Entry>()
  const log = o.log ?? (() => undefined)
  let n = 0

  const tools = (agentId: string, kind: HostAgentStart['kind']): Record<string, SdkTool> =>
    Object.fromEntries(
      agentToolDefs(kind).map(d => [
        d.name,
        { description: d.description, inputSchema: d.inputSchema as Record<string, unknown>, execute: (input: Record<string, unknown>) => o.onTool(agentId, d.name, input) },
      ]),
    )

  /** Runs one turn of `e` with `text`; its end goes to onEnd once. */
  async function turn(id: string, e: Entry, text: string, mode?: 'plan') {
    e.agent = { ...e.agent, status: 'running' }
    let done!: () => void
    e.ended = new Promise<void>(r => (done = r))
    let end: AgentRunEnd
    try {
      e.run = await e.sdk!.send(text, { ...(mode ? { mode } : {}), ...(o.onStep ? { onStep: (s: SdkStep) => o.onStep!(id, s) } : {}) })
      if (e.killed) await e.run.cancel().catch(() => undefined)
      end = runEnd(await e.run.wait(), e.killed, o.sdk.name)
    } catch (err) {
      end = e.killed ? runEnd({ status: 'cancelled' }, true) : { answer: `the ${o.sdk.name} agent could not run: ${(err as Error).message}`.slice(0, 800), end: { reason: 'error' }, isAborted: false, tokens: undefined }
    }
    e.run = undefined
    e.agent = { ...e.agent, status: end.isAborted ? 'killed' : end.end.reason === 'answer' ? 'completed' : 'failed' }
    done()
    log(`${id} ended: ${e.agent.status}`)
    try {
      o.onEnd(id, end)
    } catch (err) {
      log(`${id}: onEnd threw ${(err as Error).message}`)
    }
  }

  return {
    async spawn(a) {
      const id = `${o.sdk.name.toLowerCase()}-${++n}-${Date.now().toString(36)}`
      const e: Entry = { agent: { id, kind: a.kind === 'worker' ? 'worker' : 'scout', status: 'pending', name: a.name, description: a.description }, start: a, killed: false, ended: Promise.resolve() }
      const model = a.model && !CLAUDE_MODEL_WORDS.test(a.model) ? a.model : o.model
      e.sdk = await o.sdk.create({ model, cwd: a.cwd ?? S.root, tools: tools(id, a.kind), disallowedTools: disallowedFor(a) })
      entries.set(id, e)
      log(`${id} started (${a.kind}, ${model}) in ${a.cwd ?? S.root}`)
      void turn(id, e, withCursorPrompt(a))
      return { agentId: id }
    },
    list: async () => [...entries.values()].map(e => e.agent),
    async send(agentId, text) {
      const run = entries.get(agentId)?.run
      if (!run?.steer) return
      const outcome = await run.steer(text)
      log(`${agentId}: message ${outcome === 'complete_delivered' ? 'delivered' : 'not delivered (the turn ended first)'}`)
    },
    async stop(agentId) {
      const e = entries.get(agentId)
      if (!e || (e.agent.status !== 'running' && e.agent.status !== 'pending')) return
      e.killed = true
      await e.run?.cancel().catch(() => undefined)
    },
    // T-656: a finished agent gets one more turn with its whole memory of the task; a follow-up only reads
    async followUp(agentId, text) {
      const e = entries.get(agentId)
      if (!e?.sdk || e.agent.status !== 'completed') throw new Error(`${agentId} is no finished agent`)
      e.killed = false
      void turn(agentId, e, text, 'plan')
    },
    running: () => [...entries.values()].filter(e => e.agent.status === 'running' || e.agent.status === 'pending').length,
    async stopAll(graceMs = 10_000) {
      const live = [...entries.values()].filter(e => e.agent.status === 'running' || e.agent.status === 'pending')
      for (const e of live) {
        e.killed = true
        await e.run?.cancel().catch(() => undefined)
      }
      await Promise.race([Promise.all(live.map(e => e.ended)), new Promise(r => setTimeout(r, graceMs))])
      await Promise.all([...entries.values()].map(e => e.sdk?.close().catch(() => undefined)))
    },
  }
}
