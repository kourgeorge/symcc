// Claude Code's agent list and spawn errors. Only the Claude Code adapter knows these: the logic works on HostAgent
// (hooks/host.ts: symcc's worker, scout or another agent, and its status), and this file makes those from
// $.agent.list()'s entries, whose agent types are Claude Code's ("<name>:worker", "<name>:worker-web", "<name>:scout").
import { DEFAULT_NAME } from '../name'
import type { HostAgent } from '../host'
import { claudeNames, isWorkerType } from './agent-types'

/** An agent as $.agent.list() reports it. */
export type AgentInfo = { id: string; type?: string; status: string; description?: string; name?: string }

/** An agent from $.agent.list() in symcc's words: every worker type is a 'worker', the scout and checker types (T-905) a 'scout'. */
export function hostAgent(a: AgentInfo, name: string = DEFAULT_NAME): HostAgent {
  const { type, ...rest } = a
  const n = claudeNames(name)
  return { ...rest, kind: isWorkerType(type, name) ? 'worker' : type === n.scout || type === n.checker ? 'scout' : 'other' }
}

// Right after a reload the worker agent type may not be registered yet: spawning then fails
// with "Agent type '<name>:worker' not found".

/** Whether a spawn error only means the plugin isn't ready yet (its worker type isn't there). */
export function isNotReady(message: string, name: string = DEFAULT_NAME): boolean {
  const m = String(message ?? '')
  const worker = claudeNames(name).worker.toLowerCase()
  const low = m.toLowerCase()
  if (/agent type .* not found/.test(low) && low.includes(worker)) return true
  return /\bnot (yet )?ready\b|not registered|still starting/.test(low)
}

/** Whether a scout spawn error only means the plugin isn't ready yet (its scout type isn't there, e.g. just after
 *  a reload): then the run is tried again shortly, like a worker's. */
export function scoutNotReady(message: string, name: string = DEFAULT_NAME): boolean {
  const low = String(message ?? '').toLowerCase()
  const n = claudeNames(name)
  if (/agent type .* not found/.test(low) && (low.includes(n.scout.toLowerCase()) || low.includes(n.checker.toLowerCase()))) return true
  return isNotReady(message, name)
}
