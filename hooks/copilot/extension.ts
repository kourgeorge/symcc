// symcc's GitHub Copilot CLI extension (T-957): what its extension.mjs runs. It builds the Host (host.ts), joins the
// session with symcc's lead tools, /symcc commands and hooks (tools.ts), then starts symcc's engine, in the same order
// as every host (hooks/register.tsx, hosts/node/session.ts): useName, sessionStarting, sessionStart. The session's end
// ends it (sessionEnd). Copilot starts this again after /clear or a session replace; the board and lead.json are on
// disk, so the new start picks up where the old one left off.
// joinSession and the program parts (`system`) are given in: the extension's entry passes the SDK's joinSession and
// plain Node's parts; the tests pass fakes. Building that entry (one bundled extension.mjs and the plugin manifest) is
// a later task. Extensions are experimental in Copilot CLI 1.0.114: start it with --experimental.
import type { Host } from '../host'
import { sessionStarting, sessionStart, sessionEnd } from '../app/symcc'
import { useName } from '../app/state'
import type { CpJoinSession, CpSession } from './sdk'
import { copilotHost, type CopilotHostOptions } from './host'
import { copilotTools, copilotCommands, copilotHooks } from './tools'

export type CopilotStartOptions = Omit<CopilotHostOptions, 'session' | 'sent'> & {
  /** joinSession from "@microsoft/copilot-sdk/extension" */
  joinSession: CpJoinSession
}

/** A started extension: its Host, its session, and `end` (what the session's end runs; safe to call twice). */
export type CopilotRun = { host: Host; session: CpSession; end: () => Promise<void> }

/** How many of symcc's own sends are remembered, so the prompt hook can tell them from the owner's. */
const SENT_KEPT = 20

/** Joins the Copilot session with symcc's tools, commands and hooks, and starts the engine. */
export async function startCopilot(o: CopilotStartOptions): Promise<CopilotRun> {
  const ref: { session?: CpSession } = {}
  const sent: string[] = []
  const remember = (prompt: string) => {
    sent.push(prompt)
    if (sent.length > SENT_KEPT) sent.shift()
  }
  const ours = (prompt: string) => {
    const i = sent.indexOf(prompt)
    if (i < 0) return false
    sent.splice(i, 1)
    return true
  }
  const { joinSession, ...hostOptions } = o
  const host = copilotHost({ ...hostOptions, session: () => ref.session, sent: remember })
  useName(host)
  let ended = false
  const end = async () => {
    if (ended) return
    ended = true
    useName(host)
    await sessionEnd(host).catch(() => undefined)
  }
  ref.session = await joinSession({
    tools: { definitions: copilotTools(host) },
    commands: copilotCommands(host, () => ref.session, remember),
    hooks: { handlers: copilotHooks(host, ours, end) },
  })
  useName(host)
  sessionStarting()
  await sessionStart(host)
  return { host, session: ref.session, end }
}
