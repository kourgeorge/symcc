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
 * it (takeBoardUpdate) on its next hook that can carry text.
 */
export function tellLead(host: Host, text: string) {
  if (!S.enabledNow) return // the plugin is off: no "[name] Board update" messages
  leadQueue.push(text)
  if (host.features.wakeLead !== 'now') return
  if (S.leadTimer) return
  S.leadTimer = host.clock.after(1500, () => {
    S.leadTimer = null
    const update = takeBoardUpdate()
    if (update) void host.lead.send(update).catch(() => undefined)
  })
}

/**
 * The board update waiting for the lead, taken from the queue (with the "Meanwhile the owner:" lines at its top);
 * undefined when nothing waits (only "Meanwhile" lines don't make one) or the plugin is off.
 */
export function takeBoardUpdate(): string | undefined {
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
