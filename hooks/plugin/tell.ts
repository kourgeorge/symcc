import { cutLine } from '../core/reports'
import { type $, S, leadQueue, meanwhile } from './state'

// ---------------- telling the lead ----------------
// Workers and scouts report to the main chat as a prompt from this plugin. Several
// reports close together go in one message, sent when the chat is idle.
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

/** Tells the lead `text` now (in the next board update, sent in a moment when the chat is idle). */
export function tellLead($: $, text: string) {
  if (!S.enabledNow) return // the plugin is off: no "[name] Board update" messages
  leadQueue.push(text)
  if (S.leadTimer) return
  S.leadTimer = $.clock.after(1500, () => {
    S.leadTimer = null
    const body = leadQueue.splice(0).join('\n\n')
    if (!body || !S.enabledNow) return
    const before = meanwhileText(meanwhile.splice(0))
    void $.prompt.submit({ text: `[${S.N.name}] Board update:\n\n${before ? `${before}\n\n` : ''}${body}\n\nLead: decide what happens next on the board (use the ${S.N.name} tools), then tell the owner briefly.` }).catch(() => undefined)
  })
}

/** An answer cut to one short line, for a "Meanwhile" line. */
export const brief = (text: string) => cutLine(text, 200)

/** The owner's own action (or a merge they approved): no message now; one short line in the next board update. */
export function noteForLead(text: string) {
  if (!S.enabledNow) return
  meanwhile.push(text.trim())
}
