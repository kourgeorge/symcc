// A stand-in for the Cursor SDK (no model): each turn of an agent runs a script the test gives (`Behave`), which can
// write files in the agent's folder, call the tools it was given, wait for a message put into the turn (steer), and
// answers how the turn ended. Every agent made and every turn sent is recorded for the test to look at.
import type { Sdk, SdkAgentOptions, SdkImage, SdkModel, SdkModelInfo, SdkRunResult, SdkStep, SdkTool } from '../sdk'

export type Turn = {
  agent: FakeAgent
  text: string
  mode?: 'agent' | 'plan'
  model?: SdkModel
  images?: readonly SdkImage[]
  /** messages put into this turn so far */
  steered: string[]
  /** resolves with the next message put into the turn (or at once with one that came already) */
  nextSteer: () => Promise<string>
  /** whether the turn was cancelled */
  cancelled: () => boolean
  /** resolves when the turn is cancelled */
  onCancel: Promise<void>
  /** streams a step of the turn, as the SDK's run.stream() would */
  step: (s: SdkStep) => void
}

export type FakeAgent = { id: string; options: SdkAgentOptions; turns: Turn[]; closed: boolean; tools: Record<string, SdkTool>; summarized: number }

export type Behave = (t: Turn) => Promise<SdkRunResult>

/** `models`: what the account's model list answers. */
export function fakeSdk(behave: Behave, models: SdkModelInfo[] = []): Sdk & { agents: FakeAgent[] } {
  const agents: FakeAgent[] = []
  return {
    name: 'Cursor',
    defaultModel: 'composer-2.5',
    agents,
    models: async () => models,
    async create(options) {
      const agent: FakeAgent = { id: `fake-${agents.length + 1}`, options, turns: [], closed: false, tools: options.tools, summarized: 0 }
      agents.push(agent)
      return {
        id: agent.id,
        async send(text, so) {
          let cancelled = false
          let cancel!: () => void
          const onCancel = new Promise<void>(r => (cancel = r))
          const waiters: ((m: string) => void)[] = []
          let taken = 0
          const turn: Turn = {
            agent,
            text,
            ...(so?.mode ? { mode: so.mode } : {}),
            ...(so?.model ? { model: so.model } : {}),
            ...(so?.images ? { images: so.images } : {}),
            steered: [],
            nextSteer: () => (turn.steered.length > taken ? Promise.resolve(turn.steered[taken++]!) : new Promise<string>(r => waiters.push(m => (taken++, r(m))))),
            cancelled: () => cancelled,
            onCancel,
            step: s => so?.onStep?.(s),
          }
          agent.turns.push(turn)
          let ended = false
          const result = behave(turn).then(r => ((ended = true), r))
          return {
            async steer(m) {
              if (ended || cancelled) return 'revert_to_followup'
              turn.steered.push(m)
              waiters.shift()?.(m)
              return 'complete_delivered'
            },
            async cancel() {
              cancelled = true
              cancel()
            },
            wait: () => Promise.race([result, onCancel.then((): SdkRunResult => ({ status: 'cancelled' }))]),
          }
        },
        async summarize() {
          agent.summarized++
          return { cancel: async () => undefined, wait: async (): Promise<SdkRunResult> => ({ status: 'finished', result: 'Summarized the chat.' }) }
        },
        async close() {
          agent.closed = true
        },
      }
    },
  }
}

/** Resolves once `cond` holds, checking every 50 ms; throws after `ms`. */
export async function until(cond: () => boolean | Promise<boolean>, ms = 20_000, what = 'the condition'): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (await cond()) return
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}
