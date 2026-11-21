// Which background commands of an agent were still running when its turn ended (TurnEnd.background), from Claude Code.
//
// Claude Code's classic.SubagentStop input has `agent_id` and `background_tasks`: the background work still in flight,
// but for the whole session (the lead's, every worker's, the subagents themselves), and an entry says nothing of who
// started it. So the owner is learned here as each command starts: a Bash call's result carries the id of the
// background task it started (`backgroundTaskId`, also when the command was moved to the background later), and the
// call carries the agent's id. At SubagentStop the list is cut to that agent's own commands and kept until its
// turn.complete (a stop hook can still keep the turn going, so it is heard before the turn's end) takes it.

/** One entry of SubagentStop's background_tasks (Claude Code's BackgroundTaskSummary, the fields used here). */
export type BackgroundTask = { id?: unknown; type?: unknown; command?: unknown; description?: unknown }

/** Per agent: the ids of the background tasks its Bash calls started, and the commands of those whose result had no id. */
const started = new Map<string, { ids: Set<string>; commands: Set<string> }>()
/** Per agent: its own commands still running at its last SubagentStop (with their task ids), until its turn.complete takes them. */
const atStop = new Map<string, { id: string; command: string }[]>()
/** Per agent: the task ids of its commands still running at its turn's end (takeBackground), until stopBackground stops them. */
const left = new Map<string, string[]>()
/** How a background task is stopped by its id (Claude Code's TaskStop tool, set by claudeHost); none until a host sets it. */
let stopTask: ((id: string) => Promise<unknown>) | undefined

/** Sets how a background task of this session is stopped by its id (claude/host.ts: Claude Code's TaskStop tool). */
export function useTaskStop(stop: (id: string) => Promise<unknown>) {
  stopTask = stop
}

/** A tool call of agent `agentId` finished with `result`: a Bash command it sent to the background is noted as its own. */
export function noteBackground(agentId: string | undefined, call: Record<string, unknown>, result: unknown) {
  if (!agentId || call.tool !== 'Bash') return
  const out = result && typeof result === 'object' ? (result as { result?: unknown }).result : undefined
  const id = out && typeof out === 'object' ? (out as { backgroundTaskId?: unknown }).backgroundTaskId : undefined
  const mine = started.get(agentId) ?? { ids: new Set<string>(), commands: new Set<string>() }
  if (typeof id === 'string' && id) mine.ids.add(id)
  else if (call.run_in_background === true && typeof call.command === 'string') mine.commands.add(call.command)
  else return
  started.set(agentId, mine)
}

/**
 * SubagentStop of agent `agentId`: of the session's `tasks`, its own shell commands still running are kept for its turn's end.
 * A command is only ever tied to the agent by its task id, never by its text alone (another agent may run the same
 * text). A command tied to it by id that is still running is always kept. Only when none is, some of its commands had
 * no id and a running shell task is tied to no agent by id, whose that is can't be told: nothing is kept (unknown), and
 * the text check stands in.
 */
export function stopSeen(agentId: unknown, tasks: unknown) {
  if (typeof agentId !== 'string' || !agentId || !Array.isArray(tasks)) return
  const mine = started.get(agentId)
  const shells = (tasks as BackgroundTask[]).filter(t => !!t && t.type === 'shell')
  const isMine = (t: BackgroundTask) => !!mine && typeof t.id === 'string' && mine.ids.has(t.id)
  const ownedBySomeone = (t: BackgroundTask) => typeof t.id === 'string' && [...started.values()].some(s => s.ids.has(t.id as string))
  const own = shells.filter(isMine)
  if (own.length === 0 && mine && mine.commands.size > 0 && shells.some(t => !ownedBySomeone(t))) {
    atStop.delete(agentId)
    return
  }
  atStop.set(agentId, own.map(t => ({ id: t.id as string, command: (typeof t.command === 'string' && t.command) || (typeof t.description === 'string' && t.description) || String(t.id) })))
}

/**
 * At the turn's end of agent `agentId`: its own background commands still running at its SubagentStop ([] for none),
 * or undefined when no SubagentStop was heard or whose commands they are can't be told (the text check stands in). Taken once.
 */
export function takeBackground(agentId: string | undefined): string[] | undefined {
  if (!agentId) return undefined
  const own = atStop.get(agentId)
  atStop.delete(agentId)
  if (own?.length) left.set(agentId, own.map(t => t.id))
  else left.delete(agentId)
  return own?.map(t => t.command)
}

/**
 * T-724: stops the background commands of agent `agentId` that takeBackground found still running at its turn's end:
 * only its own, by their task ids (never by name), through the host's task stop. Answers how many were stopped. Taken once.
 */
export async function stopBackground(agentId: string): Promise<number> {
  const ids = left.get(agentId) ?? []
  left.delete(agentId)
  const stop = stopTask
  if (!stop) return 0
  let stopped = 0
  for (const id of ids) {
    try {
      await stop(id)
      stopped++
    } catch {
      // already ended, or it can't be stopped: not counted
    }
  }
  return stopped
}

/** Forgets everything noted (a plugin reload starts with nothing). */
export function resetBackground() {
  started.clear()
  atStop.clear()
  left.clear()
}
