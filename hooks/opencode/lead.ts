// host.lead for OpenCode (T-464): the lead is the OpenCode session the owner talks to (plugin.ts finds it: the last
// session in the main folder given a prompt that is no child session and none of symcc's agents, kept per board owner).
// A board update is a session.prompt into it: delivery "queue" (an idle lead wakes up, a busy one gets it once its turn
// ends), and "steer" for an urgent one (a worker needs the owner, its time is up), which a busy lead takes mid-turn.
// symcc's own batching stays as it is (app/tell.ts: one update for reports close together, the owner's actions as
// "Meanwhile" lines), and starting an agent sends nothing (HostFeatures.startQueue is off here, T-470).
// symcc's agents are children of the lead's session, and OpenCode tells a parent on its own when a child ends (a
// synthetic "subagent completed" message). symcc's board update about the same agent says what happens next, so each
// update is labelled: the lead takes the board update as the one to act on, and the automatic message as no news.
// The lead's usage (T-486): one entry per assistant message of the lead's session (session.context, the one call of
// OpenCode 2.3's plugin context that lists a session's messages), each with its own tokens and stamped with its own time
// (completed, else created), so the stats for "7d" and a task range count the lead within the span. Reasoning tokens
// count as output, as for workers (ocTokens). Cost is 0 for subscription models, so it is not read. If the messages
// can't be read, the whole session's total from session.get is counted in the stats for everything only, and a ranged
// call leaves the lead out and says why.
import type { HostLead, LeadSend, LeadUsage } from '../host'
import type { OcSessionApi } from './ctx'
import { ocTokens } from './agents'

/** Where the lead's tokens come from, for the stats. */
export const OPENCODE_LEAD_FROM = "OpenCode's session.context on the lead's session (each answer's own tokens, at the time it finished)"

/** Where the lead's tokens come from when its messages couldn't be read: the whole session's total. */
export const OPENCODE_LEAD_TOTAL_FROM = "OpenCode's session.get on the lead's session (the whole session so far, since its messages couldn't be read)"

/** Why the lead's tokens can't be told before any lead session is known. */
export const NO_LEAD_YET = 'no OpenCode lead session yet (the owner has not typed in one)'

/** Why the lead is left out of a ranged stats call ("7d", an id range) when its messages couldn't be read. */
export const leadMessagesUnread = (why: string) => `couldn't read the OpenCode lead session's messages (${why}), and its whole total can't be split by time`

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
  /** `had` didn't reach the lead: they wait again at the front (still at most 20), and go with the next update. */
  const putBack = (had: typeof kept, err: unknown) => {
    kept.unshift(...had)
    if (kept.length > 20) kept.splice(0, kept.length - 20)
    log(`board update kept: the send to the lead failed (${(err as Error)?.message ?? err})`)
  }
  return {
    async send(text: string, how?: LeadSend) {
      const id = o.lead()
      const urgent = how?.urgent === true
      if (id && kept.length) {
        // the lead became known through another main copy: what this copy kept goes first, with this one
        const had = kept.splice(0)
        const all = [...had, { text, urgent }]
        try {
          return await give(id, all.map(k => k.text).join('\n\n'), all.some(k => k.urgent))
        } catch (err) {
          // the kept ones wait again; this one goes back to its sender's queue (app/tell.ts) through the error
          putBack(had, err)
          throw err
        }
      }
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
      await give(id, all.map(k => k.text).join('\n\n'), all.some(k => k.urgent)).catch(err => putBack(all, err))
    },
    async usage(_root, range, nowMs): Promise<LeadUsage> {
      const id = o.lead()
      if (!id) return { leadProblem: NO_LEAD_YET }
      let unread: string
      try {
        const lead = []
        for (const m of await api.context({ sessionID: id })) {
          if (m.type !== 'assistant') continue
          const tokens = ocTokens(m.tokens)
          const atMs = m.time?.completed ?? m.time?.created
          if (tokens && typeof atMs === 'number') lead.push({ id, atMs, tokens, from: OPENCODE_LEAD_FROM })
        }
        // the stats count each within the span asked for (leadTotals), so all of them go back
        return { lead, leadSessions: 1, leadFrom: OPENCODE_LEAD_FROM }
      } catch (err) {
        unread = (err as Error)?.message ?? String(err)
        log(`the lead's messages couldn't be read: ${unread}`)
      }
      if (range.kind !== 'all') return { leadProblem: leadMessagesUnread(unread) }
      try {
        const tokens = ocTokens((await api.get({ sessionID: id })).tokens)
        return { lead: tokens ? [{ id, atMs: nowMs, tokens, from: OPENCODE_LEAD_TOTAL_FROM }] : [], leadSessions: 1, leadFrom: OPENCODE_LEAD_TOTAL_FROM }
      } catch (err) {
        return { leadProblem: `couldn't read the OpenCode lead session: ${(err as Error)?.message ?? err}` }
      }
    },
  }
}
