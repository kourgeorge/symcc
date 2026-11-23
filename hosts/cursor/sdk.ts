// The few parts of the Cursor SDK (@cursor/sdk) the Cursor host uses, behind a small interface so tests can hand in a
// fake (tests/fake-sdk.ts). cursorSdk() loads the real SDK on first use. It isn't bundled: it ships native helpers.

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

/** `plan`: a read-only turn. Only one turn runs at a time: send waits for none, so the caller keeps them apart. */
export type SdkAgent = { id: string; send: (text: string, o?: { mode?: 'agent' | 'plan' }) => Promise<SdkRun>; close: () => Promise<void> }

/** `disallowedTools` in the SDK's tool names (shell, edit, delete, webSearch, task, ...). */
export type SdkAgentOptions = { model: string; cwd: string; tools: Record<string, SdkTool>; disallowedTools: readonly string[] }

export type Sdk = { create: (o: SdkAgentOptions) => Promise<SdkAgent> }

type CursorSdkModule = typeof import('@cursor/sdk')

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
    async create(o) {
      const { Agent } = await load()
      const customTools = Object.fromEntries(
        Object.entries(o.tools).map(([name, t]) => [
          name,
          { description: t.description, inputSchema: t.inputSchema as never, execute: (input: Record<string, unknown>) => t.execute(input) },
        ]),
      )
      const agent = await Agent.create({ model: { id: o.model }, local: { cwd: o.cwd, customTools }, disallowedTools: [...o.disallowedTools] })
      return {
        id: agent.agentId,
        async send(text, so) {
          const run = await agent.send(text, so?.mode ? { mode: so.mode } : undefined)
          return {
            ...(run.steer ? { steer: (t: string) => run.steer!(t) } : {}),
            cancel: () => run.cancel(),
            async wait() {
              const r = await run.wait()
              return { status: r.status, result: r.result, usage: r.usage, error: r.error }
            },
          }
        },
        close: async () => void (await agent[Symbol.asyncDispose]()),
      }
    },
  }
}
