// ---------------- the start queue (T-391) ----------------
// Claude Code skips a plugin's own hooks for an agent the plugin starts from a timer (no tool.check, no tool.call)
// or from a lead tool call (no tool.call). Without them a worker's edit limits, the Bash folder guard, a checker's
// git block and ask_owner don't work. Started from inside session.start, the main loop's turn.start or any
// turn.complete, the agent gets every hook (T-384, T-389). So symcc never starts an agent where it is asked to:
// startAgent puts the start in this queue, and drainStarts, called from those hooks only (register.tsx), starts
// what waits. When the lead is idle (no turn will start or end soon), the lead is woken once with a short board
// update (tellLead): that turn's turn.start empties the queue, about 2 s later.
import type { Host, HostAgentStart, HostAgentStarted } from '../host'
import { S } from './state'
import { tellLead } from './tell'

type Waiting = { input: HostAgentStart; resolve: (r: HostAgentStarted) => void; reject: (err: unknown) => void }

/** The starts waiting for a hook where Claude Code keeps symcc's hooks; each is taken once. */
const waiting: Waiting[] = []
/** The lead is in a turn now (its turn.start came, its turn.complete not yet): that turn's end empties the queue. */
let leadBusy = false
/** A wake-up was asked for since the queue last emptied, so no second one is sent. */
let woke = false

/** The line of the lead's wake-up for a start (the board update the wake-up is). */
export const wakeLine = (a: HostAgentStart) => `Starting ${a.kind} ${a.name} (${a.description}): ${S.N.name} starts agents only when a turn starts or ends, so this short update lets it start now. Nothing to do for it.`

/** The note of a task whose worker is queued: it starts when a turn starts or ends (see drainStarts). */
export const QUEUED_NOTE = 'starting at the next turn'

/**
 * Asks for agent `input` to start: queued until the next drainStarts, never started here. Settles once it started
 * (with host.agents.spawn's answer, or its error). The lead is woken once when it is idle.
 */
export function startAgent(host: Host, input: HostAgentStart): Promise<HostAgentStarted> {
  return new Promise<HostAgentStarted>((resolve, reject) => {
    waiting.push({ input, resolve, reject })
    if (leadBusy || woke) return
    woke = true
    if (S.enabledNow) tellLead(host, wakeLine(input))
    else host.ui.toast(S.N.toast(`${input.kind} ${input.name} starts at the next turn`))
  })
}

/** How many starts wait in the queue. */
export const queuedStarts = () => waiting.length

/**
 * Starts every queued agent with `host`, the host of the hook running now. Call it only from a hook where Claude
 * Code keeps symcc's hooks for the agents it starts: session.start, the main loop's turn.start, and turn.complete.
 * Each start is taken from the queue once, so nothing starts twice, even when two hooks empty it at once.
 */
export async function drainStarts(host: Host) {
  woke = false
  for (let w = waiting.shift(); w; w = waiting.shift()) {
    try {
      w.resolve(await host.agents.spawn(w.input))
    } catch (err) {
      w.reject(err)
    }
  }
}

/** The lead's turn started (`busy`) or ended: while it runs, a queued start needs no wake-up (the turn's end starts it). */
export function leadTurn(busy: boolean) {
  leadBusy = busy
}

/** Empties the queue (its waiting starts never settle) and the lead's turn state, as a reload does; for the tests' resetPlugin() only. */
export function resetStarts() {
  waiting.length = 0
  leadBusy = false
  woke = false
}
