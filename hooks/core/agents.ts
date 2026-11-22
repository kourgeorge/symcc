// Agent names, never two workers on one task, and a worker that can't start yet.
import { DEFAULT_NAME } from '../name'
import { type Board, type BoardTask, normId } from './board-file'
import { ownedHere } from './lead'
import { workerIdOf } from './runs'

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

/**
 * An agent as symcc sees it, whatever the host: its id, whether it is one of the plugin's (base) workers, whether it
 * is still alive, and its name and description. The logic makes these from host.agents.list() (agentState in
 * hooks/host.ts); each host's adapter lists its agents in symcc's words (for Claude Code, see claude/agents.ts).
 */
export type AgentState = { id: string; worker: boolean; alive: boolean; description?: string; name?: string }

/**
 * The plugin's live workers for task `id`: the one recorded on the task's last try (workerIdOf), or any
 * whose name is workerName (e.g. "symcc-T-3") or the bare task id, maybe with a suffix the
 * host added ("symcc-T-3-2"), or whose description starts with the task id (older workers).
 */
export function liveWorkersFor<A extends AgentState>(t: Pick<BoardTask, 'id' | 'runs'>, agents: A[], name: string = DEFAULT_NAME): A[] {
  return agents.filter(a => {
    if (!a.alive) return false
    if (workerIdOf(t) && a.id === workerIdOf(t)) return true
    if (!a.worker) return false
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
 *   working and track it again, so a reload does not stop it. It is also adopted when the task
 *   names this very agent but a session that no longer drives the board (the host's agent list has
 *   only this process's agents, so it is ours; the session id may have changed over the reload).
 * - "leave": the task belongs to another session that drives the board now: not ours to touch.
 * - "stop": anything else (task gone, not "doing", another worker named on it, a dead
 *   session's task found only by the worker's name): a real orphan.
 * Ended agents are always left alone. The task is found by the agent id recorded on it,
 * then by the worker's name.
 */
export type OrphanMove = { move: 'adopt'; task: string } | { move: 'leave' } | { move: 'stop' }
export function orphanMove(a: AgentState, b: Board, me: string, live: string | null, taken: string[] = [], name: string = DEFAULT_NAME): OrphanMove {
  if (!a || typeof a.id !== 'string' || !a.id) return { move: 'leave' }
  if (!a.alive) return { move: 'leave' }
  const tasks = Array.isArray(b?.tasks) ? b.tasks : []
  const t = tasks.find(x => workerIdOf(x) === a.id) ?? tasks.find(x => x.status === 'doing' && liveWorkersFor({ id: x.id }, [a], name).length > 0)
  if (!t || t.status !== 'doing') return { move: 'stop' }
  if (!ownedHere(t, me, live)) return { move: 'leave' }
  if (!me || taken.includes(t.id)) return { move: 'stop' }
  if (t.live?.session === me && (!workerIdOf(t) || workerIdOf(t) === a.id)) return { move: 'adopt', task: t.id }
  // The task names this very agent but a session that doesn't drive the board (e.g. this process's
  // session id changed over the reload): the agent is listed here, so it is this process's own worker.
  if (workerIdOf(t) === a.id) return { move: 'adopt', task: t.id }
  return { move: 'stop' }
}

/**
 * Whether a new worker may start on task `t`: it is still "todo", and no live agent
 * (in `agents`, the host's agent list plus the workers this session knows) works on it.
 */
export function mayStart(t: BoardTask | undefined, agents: AgentState[], name: string = DEFAULT_NAME): boolean {
  return !!t && t.status === 'todo' && liveWorkersFor(t, agents, name).length === 0
}

// ---------------- a worker that can't start yet ----------------
// Right after a reload the host may not have the plugin's worker agent type yet, so spawning fails (for Claude
// Code, see isNotReady in claude/agents.ts). That is not the task's fault: it goes back to "todo" with no try
// counted, and is only marked failed after MAX_NOT_READY misses in a row.

/** How many "not ready" misses in a row a task gets before it is marked failed. */
export const MAX_NOT_READY = 3

/** After one more "not ready" miss (misses = the count so far): retry later, or fail now. */
export function onNotReady(misses: number, max = MAX_NOT_READY): 'retry' | 'fail' {
  return misses + 1 >= max ? 'fail' : 'retry'
}
