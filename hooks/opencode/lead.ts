// host.lead for OpenCode (T-464): the lead is the OpenCode session the owner talks to (plugin.ts finds it: the last
// session in the main folder given a prompt that is no child session and none of symcc's agents, kept per board owner).
// A board update is a session.prompt into it: delivery "queue" (an idle lead wakes up, a busy one gets it once its turn
// ends), and "steer" for an urgent one (a worker needs the owner, its time is up), which a busy lead takes mid-turn.
// symcc's own batching stays as it is (app/tell.ts: one update for reports close together, the owner's actions as
// "Meanwhile" lines), and starting an agent sends nothing (HostFeatures.startQueue is off here, T-470).
// symcc's agents are children of the lead's session, and OpenCode tells a parent on its own when a child ends (a
// synthetic "subagent completed" message). symcc's board update about the same agent says what happens next, so each
// update is labelled: the lead takes the board update as the one to act on, and the automatic message as no news.
// The lead's usage: its tokens from session.get (the whole session so far; cost is 0 for subscription models).
// See docs/research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md, point 3.
import type { HostLead, LeadSend, LeadUsage } from '../host'
import { cleanTokens } from '../core/runs'
import type { OcSessionApi } from './ctx'

/** Where the lead's tokens come from, for the stats. */
export const OPENCODE_LEAD_FROM = "OpenCode's session.get on the lead's session (the whole session so far, counted at once)"

/** Why the lead's tokens can't be told before any lead session is known. */
export const NO_LEAD_YET = 'no OpenCode lead session yet (the owner has not typed in one)'

/** The label at the end of every board update: OpenCode's own "subagent completed" messages are not news of their own. */
export const SUBAGENT_LABEL =
  `OpenCode also posts its own "subagent completed" message when one of symcc's agents ends: that is not a second report and needs no answer; act on this board update.`

/** The board update `text` as the lead is given it: with SUBAGENT_LABEL after it. */
export const leadText = (text: string) => `${text}\n\n(${SUBAGENT_LABEL})`

export type OpencodeLeadOptions = {
  /** the lead's OpenCode session, once known */
  lead: () => string | undefined
  /** a line for the debug log */
  log?: (text: string) => void
}

/** host.lead over OpenCode's session API, plus `known`: the lead session was just found, so updates kept for it go now. */
export type OpencodeLead = HostLead & { known: () => Promise<void> }

/** host.lead over `api` (ctx.session). Updates sent before the lead is known wait (at most the last 20), and go once it is. */
export function opencodeLead(api: OcSessionApi, o: OpencodeLeadOptions): OpencodeLead {
  const log = o.log ?? (() => undefined)
  const kept: { text: string; urgent: boolean }[] = []
  const give = (sessionID: string, text: string, urgent: boolean) => {
    log(`board update to the lead ${sessionID} (${urgent ? 'steer' : 'queue'})`)
    return api.prompt({ sessionID, text: leadText(text), delivery: urgent ? 'steer' : 'queue' })
  }
  return {
    async send(text: string, how?: LeadSend) {
      const id = o.lead()
      const urgent = how?.urgent === true
      if (id) return give(id, text, urgent)
      kept.push({ text, urgent })
      if (kept.length > 20) kept.shift()
      log('board update kept: no lead session yet')
      return undefined
    },
    async known() {
      const id = o.lead()
      if (!id || !kept.length) return
      const all = kept.splice(0)
      await give(id, all.map(k => k.text).join('\n\n'), all.some(k => k.urgent)).catch(() => undefined)
    },
    async usage(_root, _range, nowMs): Promise<LeadUsage> {
      const id = o.lead()
      if (!id) return { leadProblem: NO_LEAD_YET }
      try {
        const t = (await api.get({ sessionID: id })).tokens
        const tokens = t ? cleanTokens({ input: t.input, output: (t.output ?? 0) + (t.reasoning ?? 0), cache_read: t.cache?.read, cache_write: t.cache?.write }) : undefined
        return { lead: tokens ? [{ id, atMs: nowMs, tokens, from: OPENCODE_LEAD_FROM }] : [], leadSessions: 1, leadFrom: OPENCODE_LEAD_FROM }
      } catch (err) {
        return { leadProblem: `couldn't read the OpenCode lead session: ${(err as Error)?.message ?? err}` }
      }
    },
  }
}
