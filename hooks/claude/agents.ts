// Claude Code's agent list and spawn errors. Only the Claude Code adapter knows these: core/agents.ts works on
// AgentState (alive or not, one of the plugin's workers or not), and this file makes those from $.agent.list()'s
// entries, then binds the core functions to Claude Code's list under their usual names.
import { DEFAULT_NAME, namesFor } from '../name'
import type { Board, BoardTask } from '../core/board-file'
import * as core from '../core/agents'
import type { AgentState, OrphanMove } from '../core/agents'

/** An agent as $.agent.list() reports it. */
export type AgentInfo = { id: string; type?: string; status: string; description?: string; name?: string }

/** Agent statuses that mean it has ended; anything else counts as still alive. */
export const ENDED_STATUSES = ['completed', 'failed', 'killed']

/** An agent from $.agent.list() as core sees it: alive unless its status is an ended one; a worker when its type is "<name>:worker". */
export function agentState(a: AgentInfo, name: string = DEFAULT_NAME): AgentState {
  return { ...a, worker: a.type === namesFor(name).worker, alive: !ENDED_STATUSES.includes(a.status) }
}

/** The plugin's live workers for task `t`, from $.agent.list() (see core/agents.ts liveWorkersFor). */
export function liveWorkersFor(t: Pick<BoardTask, 'id' | 'agent'>, agents: AgentInfo[], name: string = DEFAULT_NAME): AgentInfo[] {
  return agents.filter(a => core.liveWorkersFor(t, [agentState(a, name)], name).length > 0)
}

/** What a freshly loaded copy does with a live worker agent it doesn't know (see core/agents.ts orphanMove). */
export function orphanMove(a: AgentInfo, b: Board, me: string, live: string | null, taken: string[] = [], name: string = DEFAULT_NAME): OrphanMove {
  if (!a || typeof a.id !== 'string' || !a.id) return { move: 'leave' }
  return core.orphanMove(agentState(a, name), b, me, live, taken, name)
}

/** Whether a new worker may start on task `t` (see core/agents.ts mayStart). */
export function mayStart(t: BoardTask | undefined, agents: AgentInfo[], name: string = DEFAULT_NAME): boolean {
  return core.mayStart(t, agents.map(a => agentState(a, name)), name)
}

// Right after a reload the worker agent type may not be registered yet: spawning then fails
// with "Agent type '<name>:worker' not found".

/** Whether a spawn error only means the plugin isn't ready yet (its worker type isn't there). */
export function isNotReady(message: string, name: string = DEFAULT_NAME): boolean {
  const m = String(message ?? '')
  const worker = namesFor(name).worker.toLowerCase()
  const low = m.toLowerCase()
  if (/agent type .* not found/.test(low) && low.includes(worker)) return true
  return /\bnot (yet )?ready\b|not registered|still starting/.test(low)
}

/** Whether a scout spawn error only means the plugin isn't ready yet (its scout type isn't there, e.g. just after
 *  a reload): then the run is tried again shortly, like a worker's. */
export function scoutNotReady(message: string, name: string = DEFAULT_NAME): boolean {
  const low = String(message ?? '').toLowerCase()
  if (/agent type .* not found/.test(low) && low.includes(namesFor(name).scout.toLowerCase())) return true
  return isNotReady(message, name)
}
