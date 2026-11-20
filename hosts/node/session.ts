// One symcc session on the Node host: the same entry points (hooks/app/symcc.ts) in the same order as Claude Code's
// wiring (hooks/register.tsx), with no logic of its own. A session starts (useName, sessionStarting, sessionStart),
// the lead's tools and slash commands run through toolCall and runCommand, an agent process that ends goes to
// agentFinished, and the session ends with sessionEnd. What the lead would be told is taken with leadUpdate and
// printed by the CLI. This host has no start queue (features.startQueue off): an agent starts at once, but only
// during a tick (settle with `work`); any other time its start is taken back, so its task stays "todo".
import type { Host } from '../../hooks/host'
import { sessionStarting, sessionStart, sessionEnd, toolCall, runCommand, agentFinished, leadUpdate } from '../../hooks/app/symcc'
import { S, useName, toolName, workers, starting, finishing, approving, queuedWorkers, scoutRuns, checkerRuns } from '../../hooks/app/state'
import { StartCancelled } from '../../hooks/app/starts'
import { stopForQuit, pump } from '../../hooks/app/workers'
import { processAgents, type AgentRunner, type ProcessAgents } from '../../hooks/process/agents'
import { PROCESSES_FILE } from '../../hooks/process/record'
import { nodeHost, nodeFs } from './host'
import { nodeProcessSystem } from './system'

/** `working`: a tick runs now, so agents may start (see settle). */
export type NodeSession = { host: Host; agents: ProcessAgents; say: (line: string) => void; closing: boolean; working: boolean }

export type SessionOptions = { root: string; runner: AgentRunner; say?: (line: string) => void; sessionId?: string; pluginRoot?: string }

/** Starts a session on project `o.root` with agents from `o.runner`, as Claude Code's session.start hook does. */
export async function openSession(o: SessionOptions): Promise<NodeSession> {
  const say = o.say ?? ((line: string) => void process.stderr.write(`${line}\n`))
  const ref: { host?: Host; s?: NodeSession } = {}
  const agents = processAgents(o.runner, (agentId, end) => {
    const host = ref.host!
    useName(host)
    for (const d of end.denied ?? []) say(`${agentId}: its permission rules refused ${d}`)
    agentFinished(host, agentId, end)
    // the record sits next to board.json, in the project's top folder that sessionStart set as S.root (T-588), not in
    // o.root, which may be a subfolder; read only when used, so after sessionStart
  }, { system: nodeProcessSystem, record: { fs: nodeFs, file: () => `${S.root || o.root}/${S.N.dir}/${PROCESSES_FILE}` } })
  // Agents start only while a tick runs and the session isn't closing; any other start is taken back.
  const gated: ProcessAgents = { ...agents, spawn: a => (ref.s?.working && !ref.s.closing ? agents.spawn(a) : Promise.reject(new StartCancelled('started only by a tick'))) }
  const host = nodeHost({ root: o.root, agents: gated, say, cost: agents.cost, ...(o.sessionId ? { sessionId: o.sessionId } : {}), ...(o.pluginRoot ? { pluginRoot: o.pluginRoot } : {}) })
  ref.host = host
  useName(host)
  sessionStarting()
  await sessionStart(host)
  return (ref.s = { host, agents, say, closing: false, working: false })
}

/** Runs one of the lead's tools (`tool` in symcc's plain words, e.g. "add") as the lead, and answers its text. */
export async function leadTool(s: NodeSession, tool: string, input: Record<string, unknown>): Promise<string> {
  const r = await toolCall(s.host, toolName(tool), undefined, input)
  if (!r) return `${tool} is not one of ${S.N.name}'s tools`
  return 'deny' in r ? `refused: ${r.deny}` : r.result
}

/** Runs one of symcc's slash commands (`command` without the slash, e.g. "symcc-mode") and answers its text. */
export async function slashCommand(s: NodeSession, command: string, args: string): Promise<string> {
  return (await runCommand(s.host, command, args))?.text ?? `/${command} is not one of ${S.N.name}'s commands`
}

/**
 * Whether nothing of symcc's runs or waits now: no agent process, no start, no check or merge, and the session start
 * has finished (its claimLead may still wait for old workers it stopped, e.g. ones from the record of running processes,
 * before their tasks go back to "todo" and the start's own pump starts them again).
 */
function idle(s: NodeSession): boolean {
  return (S.startupDone || S.guardOnly) && s.agents.running() === 0 && workers.size === 0 && starting.size === 0 && queuedWorkers.size === 0 && finishing.size === 0 && approving.size === 0 && scoutRuns.size === 0 && checkerRuns.size === 0
}

/**
 * Waits until the session is quiet. `work` true (the CLI's tick): agents may start, the ready tasks are started
 * (pump) and their runs, checks and merges waited for. `work` false: nothing starts (a start, e.g. from the add
 * tool's pump, is taken back, see openSession), so the task stays "todo" for the next tick. Gives up after
 * `timeoutMs`; answers whether it went quiet.
 */
export async function settle(s: NodeSession, work: boolean, timeoutMs = 60 * 60_000, lookMs = 200): Promise<boolean> {
  const until = Date.now() + timeoutMs
  let quiet = 0
  s.working = work
  if (work) await pump(s.host).catch(() => undefined)
  while (Date.now() < until) {
    quiet = idle(s) ? quiet + 1 : 0
    if (quiet >= 3) return true
    await s.host.clock.sleep(lookMs)
  }
  return false
}

/**
 * Ends the session and answers the board update waiting for the lead, if any. Agents still running (a tick that
 * stopped waiting) are stopped first and their tasks go back to "todo", so the next run starts them again instead of
 * finding them "doing" with no worker; then every agent process is ended for sure, and the timers stop.
 */
export async function closeSession(s: NodeSession, why = 'the command line stopped waiting'): Promise<string | undefined> {
  s.closing = true
  s.working = false
  const back = await stopForQuit(s.host, why).catch(() => [] as string[])
  await s.agents.stopAll()
  await sessionEnd(s.host)
  if (back.length) s.say(`stopped ${back.join(', ')}: back to todo for the next tick`)
  return leadUpdate()
}
