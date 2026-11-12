import { type $, S, leadQueue } from './state'

// ---------------- telling the lead ----------------
// Workers and scouts report to the main chat as a prompt from this plugin. Several
// reports close together go in one message, sent when the chat is idle.

export function tellLead($: $, text: string) {
  if (!S.enabledNow) return // the plugin is off: no "[name] Board update" messages
  leadQueue.push(text)
  if (S.leadTimer) return
  S.leadTimer = $.clock.after(1500, () => {
    S.leadTimer = null
    const body = leadQueue.splice(0).join('\n\n')
    if (!body || !S.enabledNow) return
    void $.prompt.submit({ text: `[${S.N.name}] Board update:\n\n${body}\n\nLead: decide what happens next on the board (use the ${S.N.name} tools), then tell the owner briefly.` }).catch(() => undefined)
  })
}
