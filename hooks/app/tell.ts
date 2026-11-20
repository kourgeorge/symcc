import { cutLine } from '../core/reports'
import { S, leadQueue, meanwhile } from './state'
import type { Host } from '../host'

// ---------------- telling the lead ----------------
// Workers and scouts report to the main chat as a prompt from this plugin. Several
// reports close together go in one message, sent when the chat is idle (on a host that can't
// wake the lead, kept until the host takes it on its next hook: takeBoardUpdate).
// The owner's own actions (approve, drop, settings, ...) don't wake the lead: they wait
// as short "Meanwhile the owner:" lines at the top of the next update sent for a real reason.

/** At most this many "Meanwhile" lines are shown; the rest are counted ("+N more"). */
export const MEANWHILE_SHOWN = 10

/** The "Meanwhile the owner:" block for `lines` ('' when there are none). */
export function meanwhileText(lines: readonly string[], shown = MEANWHILE_SHOWN): string {
  if (!lines.length) return ''
  const more = lines.length - shown
  return ['Meanwhile the owner (nothing to answer):', ...lines.slice(0, shown).map(l => `- ${l}`), ...(more > 0 ? [`- +${more} more`] : [])].join('\n')
}

/**
 * Tells the lead `text` in the next board update. A host that wakes the lead at once (features.wakeLead 'now') sends
 * it in a moment, so several close together go in one message; on any other the update waits until the host takes
 * it (takeBoardUpdate) on its next hook that can carry text. `urgent`: the owner must act on it now (a worker needs
 * them, a worker's time is up); the update it goes in is sent as urgent (LeadSend: OpenCode gives it mid-turn).
 */
export function tellLead(host: Host, text: string, how?: { urgent?: boolean }) {
  if (!S.enabledNow) return // the plugin is disabled: no "[name] Board update" messages
  leadQueue.push(text)
  if (how?.urgent) S.leadUrgent = true
  if (host.features.wakeLead !== 'now') return
  // an update that failed to send goes out with this one, in a moment, not after the retry wait
  S.leadRetry?.cancel()
  S.leadRetry = null
  if (S.leadTimer) return
  S.leadTimer = host.clock.after(1500, () => {
    S.leadTimer = null
    sendBoardUpdate(host)
  })
}

/** How long a board update whose send failed waits before it is tried again (unless a new update comes first). */
export const LEAD_RETRY_MS = 2 * 60_000

/**
 * Sends the waiting board update to the lead. If the send fails (the lead's session is gone, the host is busy or
 * restarting), its lines go back to the front of the queue (still urgent if they were) and go out with the next
 * update, or after LEAD_RETRY_MS.
 */
function sendBoardUpdate(host: Host) {
  const urgent = S.leadUrgent
  const lines = leadQueue.slice()
  const before = meanwhile.slice()
  const update = takeBoardUpdate()
  if (!update) return
  void (urgent ? host.lead.send(update, { urgent: true }) : host.lead.send(update)).catch(err => {
    if (!S.enabledNow) return
    leadQueue.unshift(...lines)
    meanwhile.unshift(...before)
    if (urgent) S.leadUrgent = true
    host.ui.log(`${S.N.name}: a board update didn't reach the lead (${(err as Error)?.message ?? err}); it goes with the next one`, { to: 'debug' })
    if (S.leadTimer || S.leadRetry) return
    S.leadRetry = host.clock.after(LEAD_RETRY_MS, () => {
      S.leadRetry = null
      sendBoardUpdate(host)
    })
  })
}

/**
 * The board update waiting for the lead, taken from the queue (with the "Meanwhile the owner:" lines at its top);
 * undefined when nothing waits (only "Meanwhile" lines don't make one) or the plugin is disabled.
 */
export function takeBoardUpdate(): string | undefined {
  S.leadUrgent = false
  const body = leadQueue.splice(0).join('\n\n')
  if (!body || !S.enabledNow) return undefined
  const before = meanwhileText(meanwhile.splice(0))
  return `[${S.N.name}] Board update:\n\n${before ? `${before}\n\n` : ''}${body}\n\nLead: decide what happens next on the board (use the ${S.N.name} tools), then tell the owner briefly.`
}

/** An answer cut to one short line, for a "Meanwhile" line. */
export const brief = (text: string) => cutLine(text, 200)

/** The owner's own action (or a merge they approved): no message now; one short line in the next board update. */
export function noteForLead(text: string) {
  if (!S.enabledNow) return
  meanwhile.push(text.trim())
}
