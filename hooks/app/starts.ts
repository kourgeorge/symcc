// ---------------- the start queue (T-391) ----------------
// Claude Code skips a plugin's own hooks for an agent the plugin starts from a timer (no tool.check, no tool.call)
// or from a lead tool call (no tool.call). Without them a worker's edit limits, the Bash folder guard, a checker's
// git block and ask_owner don't work. Started from inside session.start, the main loop's turn.start or any
// turn.complete, the agent gets every hook (T-384, T-389). So symcc never starts an agent where it is asked to:
// startAgent puts the start in this queue, and drainStarts, called from those hooks only (register.tsx), starts
// what waits. When the lead is idle (no turn will start or end soon), the lead is woken once with a short board
// update (tellLead): that turn's turn.start empties the queue, about 2 s later.
// Only a host that needs it has the queue (features.startQueue, Claude Code's): on any other host startAgent starts
// the agent at once, with no wake-up and no "starting at the next turn" note, and nothing needs draining.
import type { Host, HostAgentStart, HostAgentStarted } from '../host'
import { S } from './state'
import { START_LINE_END, tellLead } from './tell'

type Waiting = { input: HostAgentStart; resolve: (r: HostAgentStarted) => void; reject: (err: unknown) => void; still?: () => boolean | Promise<boolean> }

/** The error a queued start rejects with when it was taken back before it started (see cancelStarts, startAgent's `still`). */
export class StartCancelled extends Error {
  readonly cancelled = true
  constructor(why = 'it was stopped before it started') {
    super(why)
  }
}

/** Whether `err` only says a queued start was taken back (StartCancelled): nothing failed. */
export const startCancelled = (err: unknown) => !!(err as { cancelled?: unknown } | null)?.cancelled

/** The starts waiting for a hook where Claude Code keeps symcc's hooks; each is taken once. */
const waiting: Waiting[] = []
/** The lead is in a turn now (its turn.start came, its turn.complete not yet): that turn's end empties the queue. */
let leadBusy = false
/** A wake-up was asked for since the queue last emptied, so no second one is sent. */
let woke = false

/** The line of the lead's wake-up for a start (the board update the wake-up is). */
export const wakeLine = (a: HostAgentStart) => `Starting ${a.kind} ${a.name} (${a.description}): ${S.N.name} starts agents only when a turn starts or ends, so this short update lets it start now.${START_LINE_END}`

/** The note of a task whose worker is queued: it starts when a turn starts or ends (see drainStarts). */
export const QUEUED_NOTE = 'starting at the next turn'

/**
 * Asks for agent `input` to start. A host with no start queue (features.startQueue off) starts it at once, after
 * asking `still`. Else it is queued until the next drainStarts, never started here. Settles once it started
 * (with host.agents.spawn's answer, or its error). The lead is woken once when it is idle. `still`, asked right
 * before the start, says whether it is still wanted (e.g. its task wasn't dropped meanwhile): if not, it rejects
 * with StartCancelled and nothing starts.
 */
export function startAgent(host: Host, input: HostAgentStart, still?: () => boolean | Promise<boolean>): Promise<HostAgentStarted> {
  if (!host.features.startQueue) return startNow(host, { input, ...(still ? { still } : {}) })
  return new Promise<HostAgentStarted>((resolve, reject) => {
    waiting.push({ input, resolve, reject, ...(still ? { still } : {}) })
    if (leadBusy || woke) return
    woke = true
    if (S.enabledNow) wake(host, input)
    else host.ui.toast(S.N.toast(`${input.kind} ${input.name} starts at the next turn`))
  })
}

/** T-831: how long the hidden starter may take to end before the lead is woken instead. */
export const STARTER_TIMEOUT_MS = 60_000

/** The running starter: its id once known, the start that answers it, and its timeout timer. Only one at a time. */
type Starter = { id?: string; spawning: Promise<unknown>; timer?: { cancel(): void } }
let starter = null as Starter | null
/** Every starter's id this copy started (a late one must still be told apart from a worker). */
const starterIds = new Set<string>()

/** Whether `agentId` is a hidden starter this copy started. */
export const isStarter = (agentId: string) => starterIds.has(agentId)

/** Wakes the lead for the queue (a board update), as before the starter. */
function wakeLeadFor(host: Host) {
  const first = waiting[0]
  if (first && S.enabledNow) tellLead(host, wakeLine(first.input))
}

/**
 * T-831: gets the queue started without waking the lead. A host with startTrigger (Claude Code) starts a tiny hidden
 * agent; its end (starterEnded, in turn.complete) is a hook where drainStarts runs. If it can't start, or its end
 * doesn't come within STARTER_TIMEOUT_MS, the lead is woken (tellLead) as always, so a start is never lost.
 */
function wake(host: Host, input: HostAgentStart) {
  if (!host.agents.startTrigger) return tellLead(host, wakeLine(input))
  if (starter) return // the running starter's end drains whatever is queued by then
  const mine: Starter = { spawning: Promise.resolve() }
  starter = mine
  let release = () => {}
  const released = new Promise<void>(r => (release = r))
  const giveUp = () => {
    release() // lets turn ends that wait for a start that never answers go on
    if (starter !== mine) return
    mine.timer?.cancel()
    starter = null
    if (waiting.length) wakeLeadFor(host)
  }
  mine.timer = host.clock.after(STARTER_TIMEOUT_MS, giveUp)
  const started = host.agents.startTrigger().then(r => {
    if (!r.agentId) return giveUp()
    starterIds.add(r.agentId)
    mine.id = r.agentId
  }, giveUp)
  mine.spawning = Promise.race([started, released])
}

/**
 * T-831: whether the turn that ended for `agentId` is the hidden starter's (then it is no agent of the board: nothing
 * else looks at it). The caller then runs drainStarts as at any turn's end.
 */
export async function starterEnded(_host: Host, agentId: string | undefined): Promise<boolean> {
  if (!agentId) return false
  const cur = starter
  if (cur && !cur.id) await cur.spawning // its end can come before the start answered
  if (!starterIds.has(agentId)) return false
  if (starter && starter.id === agentId) {
    starter.timer?.cancel()
    starter = null
  }
  return true
}

/** T-884: the oldest queued start the last regular check saw (rewakeStarts). */
let lastSeen: Waiting | undefined

/**
 * T-884: called by the regular check (every 2 minutes). When the oldest queued start was already waiting at the check
 * before (so for one whole check interval: its wake-up was lost, or the lead's turn end never came), the "already
 * woken" and "lead busy" marks are cleared and the queue is woken again, so a start never waits for the owner's next
 * prompt. A running hidden starter has its own timeout, so nothing is done then. Returns whether it woke the queue.
 */
export function rewakeStarts(host: Host): boolean {
  const first = waiting[0]
  if (!first || !host.features.startQueue) return ((lastSeen = undefined), false)
  if (first !== lastSeen) return ((lastSeen = first), false)
  if (starter || !S.enabledNow) return false
  // the next wake-up comes at the earliest two checks later
  lastSeen = undefined
  leadBusy = false
  woke = true
  wake(host, first.input)
  return true
}

/** How many starts wait in the queue. */
export const queuedStarts = () => waiting.length

/**
 * Takes the queued starts `which` picks back out of the queue: none of them starts, each rejects with
 * StartCancelled (`why`). Returns how many were taken back.
 */
export function cancelStarts(which: (a: HostAgentStart) => boolean, why?: string): number {
  const out = waiting.filter(w => which(w.input))
  for (const w of out) waiting.splice(waiting.indexOf(w), 1)
  for (const w of out) w.reject(new StartCancelled(why))
  return out.length
}

/**
 * Starts every queued agent with `host`, the host of the hook running now. Call it only from a hook where Claude
 * Code keeps symcc's hooks for the agents it starts: session.start, the main loop's turn.start, and turn.complete.
 * Each start is taken from the queue once, so nothing starts twice, even when two hooks empty it at once.
 */
export async function drainStarts(host: Host) {
  woke = false
  for (let w = waiting.shift(); w; w = waiting.shift()) await startNow(host, w).then(w.resolve, w.reject)
}

/** Starts `w.input` now, unless its `still` says it is no longer wanted (then it rejects with StartCancelled). */
async function startNow(host: Host, w: Pick<Waiting, 'input' | 'still'>): Promise<HostAgentStarted> {
  // still wanted? (a stop while it waited takes it out with cancelStarts; this catches every other change)
  if (w.still && !(await w.still())) throw new StartCancelled()
  return host.agents.spawn(w.input)
}

/** The note of a just-claimed task on a host with no start queue, while its worker is being started. */
export const STARTING_NOTE = 'worker starting'

/** The note of a task whose worker is being started: QUEUED_NOTE on a host with the start queue, else STARTING_NOTE. */
export const claimNote = (host: Host) => (host.features.startQueue ? QUEUED_NOTE : STARTING_NOTE)

/** The lead's turn started (`busy`) or ended: while it runs, a queued start needs no wake-up (the turn's end starts it). */
export function leadTurn(busy: boolean) {
  leadBusy = busy
  // T-952: the lead's turn end counts as this window being active (lead.json's `active` while it drives)
  if (!busy) S.activeAt = Date.now()
}

/** Empties the queue (its waiting starts never settle) and the lead's turn state, as a reload does; for the tests' resetPlugin() only. */
export function resetStarts() {
  waiting.length = 0
  starter?.timer?.cancel()
  starter = null
  starterIds.clear()
  leadBusy = false
  woke = false
  lastSeen = undefined
}
