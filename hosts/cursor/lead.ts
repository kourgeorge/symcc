// The lead chat on the Cursor SDK (the standalone note's "lead (a)": symcc runs the lead itself): one local agent in
// the project folder with symcc's lead tools served from this process. A message to an idle lead starts its turn at
// once (wakeLead 'now'); messages for a busy lead wait and go together as its next turn, except an urgent one, which
// is put into the running turn (steer). The lead guide comes in front of the chat's first message while symcc is on.
import type { Sdk, SdkAgent, SdkRun, SdkTool } from './sdk'

/** Who a lead message is from: the owner typed it, or symcc sent it (a board update). */
export type LeadFrom = 'owner' | 'symcc'

export type LeadEvent =
  | { type: 'message'; from: LeadFrom; text: string }
  | { type: 'answer'; text: string }
  | { type: 'error'; text: string }
  | { type: 'busy'; busy: boolean }

export type LeadChatOptions = {
  sdk: Sdk
  cwd: string
  model: string
  /** the lead's tools (symcc's lead tools), read once when the chat's agent is made */
  tools: () => Record<string, SdkTool>
  /** the lead guide, put in front of the first message sent while there is one (none while symcc is off) */
  guide: () => Promise<string | undefined>
  onEvent: (e: LeadEvent) => void
}

export type LeadChat = {
  /** gives the lead a message; resolves once it is started, queued or put into the running turn */
  send: (text: string, from: LeadFrom, how?: { urgent?: boolean }) => Promise<void>
  /** whether a turn runs now */
  busy: () => boolean
  /** resolves once no turn runs and nothing waits */
  idle: () => Promise<void>
  /** ends the running turn and lets go of the agent */
  close: () => Promise<void>
}

export function leadChat(o: LeadChatOptions): LeadChat {
  let agent: Promise<SdkAgent> | undefined
  let run: SdkRun | undefined
  let running = false
  let guided = false
  let closed = false
  const waiting: { text: string; from: LeadFrom }[] = []
  let idleWaiters: (() => void)[] = []

  const getAgent = () => (agent ??= o.sdk.create({ model: o.model, cwd: o.cwd, tools: o.tools(), disallowedTools: ['task'] }))

  function settled() {
    if (running || waiting.length) return
    const w = idleWaiters
    idleWaiters = []
    for (const f of w) f()
  }

  async function start(text: string, from: LeadFrom) {
    running = true
    o.onEvent({ type: 'busy', busy: true })
    o.onEvent({ type: 'message', from, text })
    try {
      const guide = guided ? undefined : await o.guide()
      if (guide) guided = true
      const message = guide ? `${guide}\n\n---\n\n${text}` : text
      run = await (await getAgent()).send(message)
      const r = await run.wait()
      if (r.status === 'finished') o.onEvent({ type: 'answer', text: r.result ?? '' })
      else if (r.status !== 'cancelled') o.onEvent({ type: 'error', text: `the lead's turn ended with status ${r.status}${r.error ? `: ${JSON.stringify(r.error).slice(0, 300)}` : ''}` })
    } catch (err) {
      o.onEvent({ type: 'error', text: `the lead could not run: ${(err as Error).message}` })
    }
    run = undefined
    running = false
    o.onEvent({ type: 'busy', busy: false })
    next()
  }

  function next() {
    if (closed || running || !waiting.length) return settled()
    const batch = waiting.splice(0)
    const from: LeadFrom = batch.some(m => m.from === 'owner') ? 'owner' : 'symcc'
    void start(batch.map(m => m.text).join('\n\n'), from)
  }

  return {
    async send(text, from, how) {
      if (closed) throw new Error('the lead chat is closed')
      if (!running) return void start(text, from)
      if (how?.urgent && run?.steer) {
        const outcome = await run.steer(text).catch(() => 'failed')
        if (outcome === 'complete_delivered') return void o.onEvent({ type: 'message', from, text })
      }
      waiting.push({ text, from })
      if (!running) next()
    },
    busy: () => running,
    idle: () => (running || waiting.length ? new Promise<void>(r => idleWaiters.push(r)) : Promise.resolve()),
    async close() {
      closed = true
      waiting.length = 0
      await run?.cancel().catch(() => undefined)
      if (agent) await (await agent.catch(() => undefined))?.close().catch(() => undefined)
      settled()
    },
  }
}
