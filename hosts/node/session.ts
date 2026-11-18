// One symcc session on the Node host: the same entry points (hooks/app/symcc.ts) in the same order as Claude Code's
// wiring (hooks/register.tsx), with no logic of its own. A session starts (useName, sessionStarting, sessionStart, then
// the start queue is emptied), the lead's tools and slash commands run through toolCall and runCommand, an agent
// process that ends goes to agentFinished (then the start queue is emptied again, as after a turn.complete), and the
// session ends with sessionEnd. What the lead would be told is taken with leadUpdate and printed by the CLI.
import type { Host } from '../../hooks/host'
import { sessionStarting, sessionStart, sessionEnd, toolCall, runCommand, agentFinished, leadUpdate } from '../../hooks/app/symcc'
import { S, useName, toolName, workers, starting, finishing, approving, queuedWorkers, scoutRuns, checkerRuns } from '../../hooks/app/state'
import { drainStarts, queuedStarts, cancelStarts } from '../../hooks/app/starts'
import { nodeHost } from './host'
import { processAgents, type AgentRunner, type ProcessAgents } from './runner'

export type NodeSession = { host: Host; agents: ProcessAgents; say: (line: string) => void }

export type SessionOptions = { root: string; runner: AgentRunner; say?: (line: string) => void; sessionId?: string; pluginRoot?: string }

/** Starts a session on project `o.root` with agents from `o.runner`, as Claude Code's session.start hook does. */
export async function openSession(o: SessionOptions): Promise<NodeSession> {
  const say = o.say ?? ((line: string) => void process.stderr.write(`${line}\n`))
  const ref: { host?: Host } = {}
  const agents = processAgents(o.runner, (agentId, end) => {
    const host = ref.host!
    useName(host)
    for (const d of end.denied ?? []) say(`${agentId}: its permission rules refused ${d}`)
    agentFinished(host, agentId, end)
    void drainStarts(host).catch(() => undefined)
  })
  const host = nodeHost({ root: o.root, agents, say, cost: agents.cost, ...(o.sessionId ? { sessionId: o.sessionId } : {}), ...(o.pluginRoot ? { pluginRoot: o.pluginRoot } : {}) })
  ref.host = host
  useName(host)
  sessionStarting()
  await sessionStart(host)
  return { host, agents, say }
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

/** Whether nothing of symcc's runs or waits now: no agent process, no start, no check or merge. */
function idle(s: NodeSession): boolean {
  return s.agents.running() === 0 && queuedStarts() === 0 && workers.size === 0 && starting.size === 0 && queuedWorkers.size === 0 && finishing.size === 0 && approving.size === 0 && scoutRuns.size === 0 && checkerRuns.size === 0
}

/**
 * Waits until the session is quiet. `work` true (the CLI's tick): queued agents are started (the start queue is
 * emptied on every look, as Claude Code does on each turn) and their runs, checks and merges waited for. `work` false:
 * a start that got queued meanwhile (the add tool pumps) is taken back, so the task stays "todo" for the next tick.
 * Gives up after `timeoutMs`; answers whether it went quiet.
 */
export async function settle(s: NodeSession, work: boolean, timeoutMs = 60 * 60_000, lookMs = 200): Promise<boolean> {
  const until = Date.now() + timeoutMs
  let quiet = 0
  while (Date.now() < until) {
    if (work) await drainStarts(s.host).catch(() => undefined)
    else if (queuedStarts()) cancelStarts(() => true, 'started only by a tick')
    quiet = idle(s) ? quiet + 1 : 0
    if (quiet >= 3) return true
    await s.host.clock.sleep(lookMs)
  }
  return false
}

/** Ends the session (its timers stop and the lead is let go) and answers the board update waiting for the lead, if any. */
export async function closeSession(s: NodeSession): Promise<string | undefined> {
  await sessionEnd(s.host)
  return leadUpdate()
}
