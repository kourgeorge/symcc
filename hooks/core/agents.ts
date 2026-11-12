// Agent names, never two workers on one task, and a worker that can't start yet.
import { DEFAULT_NAME, namesFor } from '../name'
import { type Board, type BoardTask, normId } from './board-file'
import { ownedHere } from './lead'

// ---------------- never two workers on one task ----------------

// ---------------- agent names ----------------
// Workers and scouts are named after the plugin, so the agents list shows they are its own:
// "symcc-T-33", "symcc-scout-bugs". Agent names may only have letters, digits, "_" and "-"
// (and start with a letter or digit, at most 64 long), so anything else becomes "-". The name already has the task id or scout name, so the
// description doesn't repeat it. Lookups go by agentId; liveWorkersFor also reads these names.

/** How long an agent's description may be in the agents list. */
export const AGENT_DESCRIPTION_CHARS = 60

/** Makes a string a valid agent name: only letters, digits, "_" and "-", starting with a letter or digit, at most 64 long. */
export function agentSafeName(raw: string): string {
  const s = String(raw ?? '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[-_]+/, '').slice(0, 64).replace(/-+$/, '')
  return s || 'agent'
}

/** A worker's agent name: the plugin's name and the task id, e.g. "symcc-T-33". */
export function workerName(name: string, id: string): string {
  return agentSafeName(`${name}-${id}`)
}

/** A worker's agent description: the task title only (the name has the id), cut to fit. */
export function workerDescription(title: string): string {
  return String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, AGENT_DESCRIPTION_CHARS)
}

/** A scout's agent name: the plugin's name, "scout" and the scout's name, e.g. "symcc-scout-bugs". */
export function scoutAgentName(name: string, scout: string): string {
  return agentSafeName(`${name}-scout-${scout}`)
}

/**
 * A scout's agent description: what it does, the first line of its file's instructions
 * (without markdown marks), cut to fit; the scout's name when there are none.
 */
export function scoutDescription(scout: string, instructions = ''): string {
  const line = String(instructions ?? '').split('\n').map(l => l.replace(/^[\s#>*-]+/, '').trim()).find(Boolean) ?? ''
  return (line || scout).slice(0, AGENT_DESCRIPTION_CHARS)
}

/** An agent as $.agent.list() reports it. */
export type AgentInfo = { id: string; type?: string; status: string; description?: string; name?: string }

/** Agent statuses that mean it has ended; anything else counts as still alive. */
export const ENDED_STATUSES = ['completed', 'failed', 'killed']

/**
 * The plugin's live workers for task `id`: the one recorded on the task (`agent`), or any
 * whose name is workerName (e.g. "symcc-T-3") or the bare task id, maybe with a suffix the
 * host added ("symcc-T-3-2"), or whose description starts with the task id (older workers).
 */
export function liveWorkersFor(t: Pick<BoardTask, 'id' | 'agent'>, agents: AgentInfo[], name: string = DEFAULT_NAME): AgentInfo[] {
  const worker = namesFor(name).worker
  return agents.filter(a => {
    if (ENDED_STATUSES.includes(a.status)) return false
    if (t.agent && a.id === t.agent) return true
    if (a.type !== worker) return false
    const n = String(a.name ?? '')
    const full = workerName(name, t.id)
    if (n && (n === t.id || n.startsWith(`${t.id}-`) || n === full || n.startsWith(`${full}-`))) return true
    return normId(String(a.description ?? '').split(/\s/)[0] ?? '') === t.id
  })
}

/**
 * What a freshly loaded copy of the plugin does with a live worker agent it doesn't know
 * (its in-memory list of workers is empty after a reload, but the agents keep running):
 * - "adopt": the worker's task is still "doing" for this session (`me`) and the task names
 *   this agent (or no agent yet), and no other worker was adopted for it (`taken`): keep it
 *   working and track it again, so a reload does not stop it.
 * - "leave": the task belongs to another session that drives the board now: not ours to touch.
 * - "stop": anything else (task gone, not "doing", another worker named on it, a dead
 *   session's task): a real orphan.
 * Ended agents are always left alone. The task is found by the agent id recorded on it,
 * then by the worker's name.
 */
export type OrphanMove = { move: 'adopt'; task: string } | { move: 'leave' } | { move: 'stop' }
export function orphanMove(a: AgentInfo, b: Board, me: string, live: string | null, taken: string[] = [], name: string = DEFAULT_NAME): OrphanMove {
  if (!a || typeof a.id !== 'string' || !a.id) return { move: 'leave' }
  if (ENDED_STATUSES.includes(a.status)) return { move: 'leave' }
  const tasks = Array.isArray(b?.tasks) ? b.tasks : []
  const t = tasks.find(x => x.agent === a.id) ?? tasks.find(x => x.status === 'doing' && liveWorkersFor({ id: x.id }, [a], name).length > 0)
  if (!t || t.status !== 'doing') return { move: 'stop' }
  if (!ownedHere(t, me, live)) return { move: 'leave' }
  if (!!me && t.session === me && (!t.agent || t.agent === a.id) && !taken.includes(t.id)) return { move: 'adopt', task: t.id }
  return { move: 'stop' }
}

/**
 * Whether a new worker may start on task `t`: it is still "todo", and no live agent
 * (in `agents`, $.agent.list() plus the workers this session knows) works on it.
 */
export function mayStart(t: BoardTask | undefined, agents: AgentInfo[], name: string = DEFAULT_NAME): boolean {
  return !!t && t.status === 'todo' && liveWorkersFor(t, agents, name).length === 0
}

// ---------------- a worker that can't start yet ----------------
// Right after a reload the worker agent type may not be registered yet: spawning then fails
// with "Agent type '<name>:worker' not found". That is not the task's fault: it goes back to
// "todo" with no try counted, and is only marked failed after MAX_NOT_READY misses in a row.

/** How many "not ready" misses in a row a task gets before it is marked failed. */
export const MAX_NOT_READY = 3

/** Whether a spawn error only means the plugin isn't ready yet (its worker type isn't there). */
export function isNotReady(message: string, name: string = DEFAULT_NAME): boolean {
  const m = String(message ?? '')
  const worker = namesFor(name).worker.toLowerCase()
  const low = m.toLowerCase()
  if (/agent type .* not found/.test(low) && low.includes(worker)) return true
  return /\bnot (yet )?ready\b|not registered|still starting/.test(low)
}

/** After one more "not ready" miss (misses = the count so far): retry later, or fail now. */
export function onNotReady(misses: number, max = MAX_NOT_READY): 'retry' | 'fail' {
  return misses + 1 >= max ? 'fail' : 'retry'
}
