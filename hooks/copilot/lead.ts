// host.lead for GitHub Copilot CLI (T-957): the lead is the Copilot session the extension joined (the owner's own
// chat). A board update is a session.send into it with source "automation-symcc": mode "enqueue" (an idle session
// starts a turn about 1 s later, a busy one gets it once its turn ends), and "immediate" for an urgent one (a worker
// needs the owner, its time is up), which a busy lead takes at its next tool boundary (tested in T-955).
// The extension restarts on /clear or a session replace, so nothing here is kept in memory that the board needs:
// the board and lead.json stay on disk, as in every host. The lead's usage is not read yet (features.leadUsage off).
import type { HostLead, LeadSend } from '../host'
import type { CpSend, CpSession } from './sdk'

/** The source every send of symcc's carries, so Copilot (and symcc's prompt hook) can tell it from the owner's typing. */
export const SYMCC_SOURCE = 'automation-symcc' as const

/** Why a board update can't be given yet: the extension hasn't joined its session. */
export const NOT_JOINED = "symcc's Copilot extension has not joined its session yet"

/** The send for board update `text`: enqueue, or immediate when urgent. */
export const leadSend = (text: string, how?: LeadSend): CpSend => ({ prompt: text, mode: how?.urgent ? 'immediate' : 'enqueue', source: SYMCC_SOURCE })

/**
 * host.lead over the joined session (`session()`, undefined before the join). `sent` is told each prompt symcc sends,
 * so the prompt hook doesn't take it for the owner's. A send before the join rejects, so symcc's own retry keeps it
 * (app/tell.ts).
 */
export function copilotLead(session: () => CpSession | undefined, sent: (prompt: string) => void = () => undefined): HostLead {
  return {
    async send(text, how) {
      const s = session()
      if (!s) throw new Error(NOT_JOINED)
      const msg = leadSend(text, how)
      sent(msg.prompt)
      return s.send(msg)
    },
    usage: async () => ({}),
  }
}
