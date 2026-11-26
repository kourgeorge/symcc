// The lead chat on the Cursor SDK (the standalone note's "lead (a)": symcc runs the lead itself): one local agent in
// the project folder with symcc's lead tools served from this process. A message to an idle lead starts its turn at
// once (wakeLead 'now'); messages for a busy lead wait and go together as its next turn, except an urgent one, which
// is put into the running turn (steer): the owner's messages are, unless they ask to queue. The lead guide comes in
// front of the chat's first message while symcc is on. The owner picks the model and mode of the lead's turns from the
// chat (configure), and can stop or summarize it. A turn the agent service cut off is sent on (./retry.ts).
import type { Sdk, SdkAgent, SdkImage, SdkModel, SdkRun, SdkRunResult, SdkSendOptions, SdkSettingSource, SdkStep, SdkTool, SdkToolGuard } from './sdk'
import { RETRY_DELAYS_MS, pause, resumeText, serviceError, serviceErrorText } from './retry'

/** Who a lead message is from: the owner typed it, or symcc sent it (a board update). */
export type LeadFrom = 'owner' | 'symcc'

export type LeadEvent =
  | { type: 'message'; from: LeadFrom; text: string }
  | { type: 'answer'; text: string }
  | { type: 'error'; text: string }
  | { type: 'busy'; busy: boolean }
  | { type: 'stopped' }
  | { type: 'summarized'; text: string }
  | { type: 'retry'; text: string }

/** Where a message to the lead went: it started a turn, went into the running one, or waits for the next. */
export type LeadSent = 'started' | 'steered' | 'queued'

/** The model and mode of the lead's turns from now on (`model` undefined: the chat's own). */
export type LeadChoice = { model?: SdkModel; mode: 'agent' | 'plan' }

export type LeadChatOptions = {
  sdk: Sdk
  cwd: string
  model: string
  /** the lead's tools (symcc's lead tools), read once when the chat's agent is made */
  tools: () => Record<string, SdkTool>
  /** the lead guide, put in front of the first message sent while there is one (none while symcc is off) */
  guide: () => Promise<string | undefined>
  /** the owner's board actions waiting as "Meanwhile" lines (app/tell.ts meanwhileForPrompt), put in front of a turn
   *  with the owner's message; `back` queues them again when that turn never starts */
  meanwhile?: () => { text: string; back: () => void }
  onEvent: (e: LeadEvent) => void
  /** each step of the lead's turns as it happens */
  onStep?: (s: SdkStep) => void
  /** which of Cursor's settings the lead loads (none when absent) */
  settings?: readonly SdkSettingSource[]
  /** symcc's guard for the lead's tool calls, when the SDK can check a call before it runs (Sdk.guard) */
  guard?: SdkToolGuard
  /** how long to wait before each new try of a turn the agent service cut off */
  retryDelaysMs?: readonly number[]
}

export type LeadChat = {
  /** gives the lead a message; resolves once it is started, queued or put into the running turn */
  send: (text: string, from: LeadFrom, how?: { urgent?: boolean; images?: readonly SdkImage[] }) => Promise<LeadSent>
  /** whether a turn runs now */
  busy: () => boolean
  /** the model and mode of the turns that start from now on */
  configure: (c: Partial<LeadChoice>) => LeadChoice
  choice: () => LeadChoice
  /** ends the running turn (what waits still goes, as the next turn) */
  stop: () => Promise<void>
  /** condenses the chat so far to free the lead's context; answers why not when it can't (a turn runs, nothing to condense) */
  summarize: () => Promise<string | undefined>
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
  let stopped = false
  let wake: (() => void) | undefined
  const waiting: { text: string; from: LeadFrom; images?: readonly SdkImage[] }[] = []
  let idleWaiters: (() => void)[] = []
  let choice: LeadChoice = { mode: 'agent' }

  const getAgent = () => (agent ??= o.sdk.create({ model: o.model, cwd: o.cwd, tools: o.tools(), disallowedTools: ['task'], ...(o.settings ? { settings: o.settings } : {}), ...(o.guard ? { guard: o.guard } : {}) }))

  function settled() {
    if (running || waiting.length) return
    const w = idleWaiters
    idleWaiters = []
    for (const f of w) f()
  }

  async function start(text: string, from: LeadFrom, images?: readonly SdkImage[]) {
    running = true
    o.onEvent({ type: 'busy', busy: true })
    o.onEvent({ type: 'message', from, text })
    const meanwhile = from === 'owner' ? o.meanwhile?.() : undefined
    stopped = false
    let started = false
    try {
      const guide = guided ? undefined : await o.guide()
      if (guide) guided = true
      const body = meanwhile?.text ? `${meanwhile.text}\n\n${text}` : text
      const message = guide ? `${guide}\n\n---\n\n${body}` : body
      const how: SdkSendOptions = { ...(o.onStep ? { onStep: o.onStep } : {}), ...(choice.model ? { model: choice.model } : {}), ...(choice.mode === 'plan' ? { mode: 'plan' as const } : {}) }
      const delays = o.retryDelaysMs ?? RETRY_DELAYS_MS
      for (let n = 0, say = message; ; n++) {
        let r: SdkRunResult | undefined
        let failed = ''
        try {
          const sent = n ? { ...how, force: true } : images?.length ? { ...how, images } : how
          run = await (await getAgent()).send(say, Object.keys(sent).length ? sent : undefined)
          started = true
          r = await run.wait()
        } catch (err) {
          failed = (err as Error).message
        }
        run = undefined
        const why = stopped || closed ? undefined : r ? serviceError(r) : serviceErrorText(failed)
        if (why && n < delays.length) {
          o.onEvent({ type: 'retry', text: `The agent service cut the lead's turn off (${why}). symcc sends it on in ${Math.round(delays[n]! / 1000)}s (${n + 1} of ${delays.length}).` })
          const p = pause(delays[n]!)
          wake = p.wake
          await p.done
          wake = undefined
          if (!stopped && !closed) {
            say = resumeText(why, true)
            continue
          }
          r = { status: 'cancelled' }
        }
        if (!r) {
          if (!started) meanwhile?.back()
          o.onEvent({ type: 'error', text: `the lead could not run: ${failed}` })
        } else if (r.status === 'finished') o.onEvent({ type: 'answer', text: r.result ?? '' })
        else if (r.status === 'cancelled') o.onEvent({ type: 'stopped' })
        else o.onEvent({ type: 'error', text: `the lead's turn ended with status ${r.status}${r.error ? `: ${JSON.stringify(r.error).slice(0, 300)}` : ''}` })
        break
      }
    } catch (err) {
      if (!started) meanwhile?.back()
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
    void start(
      batch.map(m => m.text).join('\n\n'),
      from,
      batch.flatMap(m => m.images ?? []),
    )
  }

  return {
    async send(text, from, how) {
      if (closed) throw new Error('the lead chat is closed')
      if (!running) {
        void start(text, from, how?.images)
        return 'started'
      }
      // a steered message carries no pictures: one with pictures waits for the next turn
      if (how?.urgent && run?.steer && !how.images?.length) {
        const outcome = await run.steer(text).catch(() => 'failed')
        if (outcome === 'complete_delivered') {
          o.onEvent({ type: 'message', from, text })
          return 'steered'
        }
      }
      waiting.push({ text, from, ...(how?.images?.length ? { images: how.images } : {}) })
      if (!running) next()
      return 'queued'
    },
    busy: () => running,
    configure: c => (choice = { ...choice, ...c }),
    choice: () => choice,
    async stop() {
      stopped = true
      wake?.()
      await run?.cancel().catch(() => undefined)
    },
    async summarize() {
      if (running) return 'the lead is working: summarize once its turn is done'
      if (!agent) return 'there is nothing to summarize yet'
      const a = await agent.catch(() => undefined)
      if (!a?.summarize) return "the lead's chat can't be summarized here"
      running = true
      o.onEvent({ type: 'busy', busy: true })
      let why: string | undefined
      try {
        const r = await (run = await a.summarize()).wait()
        if (r.status === 'finished') o.onEvent({ type: 'summarized', text: r.result ?? '' })
        else if (r.status === 'cancelled') o.onEvent({ type: 'stopped' })
        else why = `summarizing ended with status ${r.status}`
      } catch (err) {
        why = `couldn't summarize: ${(err as Error).message}`
      }
      run = undefined
      running = false
      o.onEvent({ type: 'busy', busy: false })
      next()
      return why
    },
    idle: () => (running || waiting.length ? new Promise<void>(r => idleWaiters.push(r)) : Promise.resolve()),
    async close() {
      closed = true
      waiting.length = 0
      wake?.()
      await run?.cancel().catch(() => undefined)
      if (agent) await (await agent.catch(() => undefined))?.close().catch(() => undefined)
      settled()
    },
  }
}
