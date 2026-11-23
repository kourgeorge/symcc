// The few parts of the Cursor SDK (@cursor/sdk) the Cursor host uses, behind a small interface so tests can hand in a
// fake (tests/fake-sdk.ts) and GitHub Copilot's agents can stand in (./copilot.ts). cursorSdk() loads the real SDK on
// first use. It isn't bundled: it ships native helpers.
import { argWords, short } from './steps'

/** A tool served from this process to an agent (the SDK's custom tools): it answers text. */
export type SdkTool = { description: string; inputSchema: Record<string, unknown>; execute: (input: Record<string, unknown>) => Promise<string> }

export type SdkUsage = { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }

/** How a run ended: `status` is "finished", "cancelled" or "error". */
export type SdkRunResult = { status: string; result?: string; usage?: SdkUsage; error?: unknown }

/**
 * One turn of an agent. `steer` puts a message into the running turn and answers "complete_delivered" when the turn
 * took it, or "revert_to_followup" when it ended first (then the message is the caller's to send as a new turn).
 */
export type SdkRun = { steer?: (text: string) => Promise<string>; cancel: () => Promise<void>; wait: () => Promise<SdkRunResult> }

/**
 * One step of a turn as the board shows it: what the agent said or thought, a tool it called (`callId` ties a call's
 * start to its end, `status` says which), or the run's status.
 */
export type SdkStep = { kind: 'text' | 'thinking' | 'tool' | 'status'; text: string; tool?: string; callId?: string; status?: 'running' | 'completed' | 'error' }

/** A model as the SDK takes it: its id, and the choice of its parameters (reasoning effort, ...) when it has any. */
export type SdkModel = { id: string; params?: { id: string; value: string }[]; maxMode?: boolean }

/**
 * A model the account can use, as Cursor's model picker shows it: its name, its options (context, reasoning, fast, ...)
 * with the values each can take, and the combinations of them the model has (`variants`, `params` by option id), one
 * of them its default; a `maxMode` variant costs more.
 */
export type SdkModelInfo = {
  id: string
  label: string
  description?: string
  options: { id: string; label: string; values: { value: string; label: string }[] }[]
  variants: { params: Record<string, string>; maxMode?: boolean; isDefault?: boolean }[]
}

/** A picture sent with a message: base64 `data` of type `mimeType` (image/png, ...). */
export type SdkImage = { data: string; mimeType: string }

/**
 * `plan`: a read-only turn; `model`: this turn's model, instead of the agent's; `images`: pictures with the message;
 * `onStep`: each step of the turn as it happens. Only one turn runs at a time: send waits for none, so the caller keeps
 * them apart.
 */
export type SdkSendOptions = { mode?: 'agent' | 'plan'; model?: SdkModel; images?: readonly SdkImage[]; onStep?: (s: SdkStep) => void }

/** `summarize` condenses the conversation to free context (a run, like a turn), where the SDK can. */
export type SdkAgent = { id: string; send: (text: string, o?: SdkSendOptions) => Promise<SdkRun>; summarize?: () => Promise<SdkRun>; close: () => Promise<void> }

/** Which of Cursor's own settings an agent loads: the project's rules, skills, AGENTS.md and MCP servers, the plugins'. */
export type SdkSettingSource = 'project' | 'plugins'

/**
 * `disallowedTools` in the Cursor SDK's tool names (shell, edit, delete, webSearch, task, ...), which another SDK maps to
 * its own; `settings`: none when absent.
 */
export type SdkAgentOptions = { model: string; cwd: string; tools: Record<string, SdkTool>; disallowedTools: readonly string[]; settings?: readonly SdkSettingSource[] }

/**
 * `name`: whose agents these are, in the owner's words ("Cursor"); `defaultModel`: the model of an agent nothing names
 * one for; `models` lists the models the account can use, where the SDK can; `close` lets go of what the SDK started.
 */
export type Sdk = { name: string; defaultModel: string; create: (o: SdkAgentOptions) => Promise<SdkAgent>; models?: () => Promise<SdkModelInfo[]>; close?: () => Promise<void> }

type CursorSdkModule = typeof import('@cursor/sdk')
type SdkMessage = { type: string; [k: string]: unknown }

type ModelListItem = {
  id: string
  displayName: string
  description?: string
  parameters?: { id: string; displayName?: string; values: { value: string; displayName?: string }[] }[]
  variants?: { params: { id: string; value: string }[]; isDefault?: boolean; isMaxMode?: boolean }[]
}

/** The SDK's model list as the host's: names fall back to ids, an option value without a name (fast's "false") is "Off". */
export function modelInfos(list: readonly ModelListItem[]): SdkModelInfo[] {
  return list.map(m => ({
    id: m.id,
    label: m.displayName || m.id,
    ...(m.description ? { description: m.description } : {}),
    options: (m.parameters ?? []).map(p => ({
      id: p.id,
      label: p.displayName || p.id,
      values: p.values.map(v => ({ value: v.value, label: v.displayName || (v.value === 'false' ? 'Off' : v.value) })),
    })),
    variants: (m.variants ?? []).map(v => ({
      params: Object.fromEntries(v.params.map(p => [p.id, p.value])),
      ...(v.isMaxMode ? { maxMode: true } : {}),
      ...(v.isDefault ? { isDefault: true } : {}),
    })),
  }))
}

/** A run of the SDK as the host's SdkRun, its steps going to `onStep` when the run can stream. */
function hostRun(run: import('@cursor/sdk').Run, onStep?: (s: SdkStep) => void): SdkRun {
  if (onStep && run.supports('stream'))
    void (async () => {
      for await (const m of run.stream()) {
        const s = stepOf(m as unknown as SdkMessage)
        if (s) onStep(s)
      }
    })().catch(() => undefined)
  return {
    ...(run.steer ? { steer: (t: string) => run.steer!(t) } : {}),
    cancel: () => run.cancel(),
    async wait() {
      const r = await run.wait()
      return { status: r.status, result: r.result, usage: r.usage, error: r.error }
    },
  }
}

/** A stream message of the SDK as a step (none for the ones the board has no use for: usage, requests, summaries). */
export function stepOf(m: SdkMessage): SdkStep | undefined {
  // what the agent says and thinks comes a few words at a time: kept as they are, spaces and all (steps.ts joins them)
  if (m.type === 'assistant') {
    const text = ((m.message as { content?: { type: string; text?: string }[] } | undefined)?.content ?? []).map(b => (b.type === 'text' ? (b.text ?? '') : '')).join('')
    return text ? { kind: 'text', text } : undefined
  }
  if (m.type === 'thinking') return typeof m.text === 'string' && m.text ? { kind: 'thinking', text: m.text } : undefined
  if (m.type === 'tool_call') {
    const status = m.status === 'error' ? 'error' : m.status === 'completed' ? 'completed' : 'running'
    const result = status === 'error' && m.result !== undefined ? ` → ${short(typeof m.result === 'string' ? m.result : JSON.stringify(m.result), 300)}` : ''
    return { kind: 'tool', tool: String(m.name ?? 'tool'), callId: String(m.call_id ?? ''), status, text: short(argWords(m.args), 400) + result }
  }
  if (m.type === 'status' && typeof m.status === 'string') return { kind: 'status', text: [m.status.toLowerCase(), typeof m.message === 'string' ? m.message : ''].filter(Boolean).join(': ') }
  return undefined
}

/**
 * The real SDK. Behind a proxy (HTTPS_PROXY), fetch and node:https go through it and the agent streams use HTTP/1.1:
 * before Node 24 neither fetch nor node:https reads HTTPS_PROXY, and node:http2 never can.
 */
export function cursorSdk(env: Record<string, string | undefined> = process.env): Sdk {
  let loaded: Promise<CursorSdkModule> | undefined
  const load = () =>
    (loaded ??= (async () => {
      const proxy = env.HTTPS_PROXY || env.https_proxy
      if (proxy) {
        const { setGlobalDispatcher, EnvHttpProxyAgent } = await import('undici')
        setGlobalDispatcher(new EnvHttpProxyAgent())
        const https = (await import('node:https')).default
        const { HttpsProxyAgent } = await import('https-proxy-agent')
        https.globalAgent = new HttpsProxyAgent(proxy) as unknown as typeof https.globalAgent
      }
      const sdk = await import('@cursor/sdk')
      if (proxy) sdk.configureCursorSdk({ local: { useHttp1ForAgent: true } })
      return sdk
    })())
  return {
    name: 'Cursor',
    defaultModel: 'composer-2.5',
    async create(o) {
      const { Agent } = await load()
      const customTools = Object.fromEntries(
        Object.entries(o.tools).map(([name, t]) => [
          name,
          { description: t.description, inputSchema: t.inputSchema as never, execute: (input: Record<string, unknown>) => t.execute(input) },
        ]),
      )
      const local = { cwd: o.cwd, customTools, ...(o.settings?.length ? { settingSources: [...o.settings] } : {}) }
      const agent = await Agent.create({ model: { id: o.model }, local, disallowedTools: [...o.disallowedTools] })
      return {
        id: agent.agentId,
        async send(text, so) {
          const message = so?.images?.length ? { text, images: so.images.map(i => ({ data: i.data, mimeType: i.mimeType })) } : text
          const options = { ...(so?.mode ? { mode: so.mode } : {}), ...(so?.model ? { model: so.model } : {}) }
          return hostRun(await agent.send(message, Object.keys(options).length ? options : undefined), so?.onStep)
        },
        summarize: async () => hostRun(await agent.summarize()),
        close: async () => void (await agent[Symbol.asyncDispose]()),
      }
    },
    async models() {
      const { Cursor } = await load()
      return modelInfos((await Cursor.models.list()) as unknown as ModelListItem[])
    },
  }
}
