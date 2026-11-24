// symcc (the name comes from plugin.json, see hooks/name.ts): a shared task board, the main chat as its lead, workers that build tasks in
// parallel in their own Git worktrees and merge what passes the tests, and scouts you
// define in .<name>/scouts/*.md that do what their file asks on a timer.
//
// How work flows:
//   you ⇄ lead (the main chat)  ──board tools──▶  .<name>/board.json
//   a task is ready  ──▶  worktree + background worker subagent
//   worker done      ──▶  commit · scope check · tests · merge into main  ──▶  the lead is told
//   scout on a timer ──▶  report    ──▶  the lead is told and decides what goes on the board
//
// This file holds symcc's entry points: what a host calls when something happens (the session starts or ends, the owner types a
// prompt, a tool is called or checked, an agent's run ends, a slash command runs, a timer goes off). Each takes a
// Host (hooks/host.ts) and plain values in symcc's words, and answers plain values, so Claude Code's wiring
// (hooks/register.tsx) and another host (an OpenCode plugin, a standalone app) call the same code. Nothing here
// imports 'claude-code'; what is only Claude Code's (its event shapes, agent types, plan mode events, the panel's
// render hooks) stays in register.tsx and hooks/claude/.
//
// Before calling an entry point, the host calls useName (app/state.ts) with its plugin name, so S.N is right.
import { offAnswer, offHereAnswer, notSetUpAnswer, ASK_TOOL, guardReason, scoutToolRefusal } from '../board'
import type { FileTouch, Host } from '../host'
import type { SymccTokens } from '../../types'
import { askCall, checkEdit, guardFailed, stoppedText, stoppedTextFor, movedAway, movedText, listedKind, type AgentKindOf } from './ask'
import { publish } from './lead'
import { loadRoles } from './roles'
import { loadKinds } from './kinds'
import { checkerFinished } from './checker'
import { fileToolHits, scheduleScouts, scoutFinished, scoutTurnEnded } from './scouts'
import { S, toolName, heard, stopped, workers, scoutRuns, checkerRuns, isOwnAgent } from './state'
import { load, isOn, now, findRoot, startingText } from './store'
import { takeBoardUpdate } from './tell'
// T-968: the host attaches this to the owner's prompt (see meanwhileForPrompt)
export { meanwhileForPrompt } from './tell'
import { TOOLS, leadGuide, runTool, type In } from './tools'
import { debriefFinished } from './debrief'
import { pump, workerFinished, lateHandBack, agentOnBoard, stoppedHandBack, type TurnEnd } from './workers'
import { isStarter } from './starts'
import { DAM_POST_LINE, notDrivingText } from '../core/dam'
import { logRefusal, type Who } from './evidence'
import { guardOnlyText } from './session-start'

// The session's start and end live in session-start.ts, the slash commands in slash-commands.ts (T-877); a host
// still imports every entry point from here.
export { sessionStarting, watchdogTick, leadBeat, sessionStart, guardStart, sessionCleared, sessionEnd } from './session-start'
export { BOARD_OPENED, boardOpened, noPanelText, COMMANDS, taskDoTool, runCommand, type CommandAnswer } from './slash-commands'

// ---------------- the lead's prompt ----------------

/** The lead's guide, for the host to add to the lead's system prompt; undefined: add nothing (symcc is disabled, or the project is not known yet). */
export async function leadGuideText(host: Host): Promise<string | undefined> {
  // Before session start set the project folder (a plugin reload): learn it first; unknown, add nothing.
  if (!(await findRoot(host))) return undefined
  if (S.guardOnly) return undefined
  // Read on every call, so /<name>-disable and /<name>-enable count from the next message.
  if (!(await isOn(host))) return undefined
  // T-922: a window that doesn't drive gets no board updates and starts no work; the lead says so plainly
  const notDriving = S.driving ? '' : `\n\nThis window does not drive the board now. When the owner asks about board work here, tell them plainly: "${notDrivingText(S.N.name)}".`
  const dam = S.dam ? `\n\n${DAM_POST_LINE}` : ''
  return `${leadGuide(host.features)}${notDriving}${dam}`
}

/**
 * For a host that can't wake the lead (features.wakeLead 'next-turn'): the board update waiting for the lead, for the
 * host to add to its next hook that can carry text (e.g. when the lead's turn ends or the owner sends a prompt);
 * undefined when nothing waits. A host that wakes the lead at once never needs it: its updates are sent.
 */
export function leadUpdate(): string | undefined {
  return takeBoardUpdate()
}

/**
 * The owner typed a prompt (at the terminal or from the phone/web bridge; not a slash command, a hidden prompt or
 * symcc's own board update). It is kept, so a task added after it can point back to the request.
 */
export function ownerTyped(text: string) {
  if (text.trim()) heard.owner = { text: text.trim().slice(0, 2000), at: now() }
  // T-952: the owner's prompt counts as this window being active (lead.json's `active` while it drives)
  S.activeAt = Date.now()
}

// ---------------- tools ----------------

let names: string[] | null = null
/** The names of the lead's tools, symcc's plain names (the host may call them otherwise, see toolName). */
const toolNames = () => (names ??= TOOLS().map(t => t.name))

/** Whether `tool` (the name the host calls it by) is one of symcc's own: the lead's tools or the workers' question tool. */
export function isSymccTool(tool: string): boolean {
  return tool === toolName(ASK_TOOL) || toolNames().some(t => tool === toolName(t))
}

/**
 * A tool is called (by the lead or by one of symcc's agents). Answers a refusal (`deny`) or symcc's tool's answer
 * (`result`); null: not symcc's call, the host runs it as usual and then calls otherToolDone.
 * A worker or scout symcc stopped can't do anything more, so every tool it tries is refused. A scout or checker may
 * only read the board (board and stats; a scout also scouts with action list, T-895); its call of any other symcc tool is refused. The lead's own tools
 * and the workers' question tool (it knows the calling worker from `agentId`) run here.
 * An agent this copy doesn't hold is looked up on the board (agentOnBoard, T-471), so a checker or a stopped agent
 * of another session's copy is treated as here; an unreadable board throws (toolCallFailed then decides).
 * The lead is the caller with no `agentId` (the host's main chat; a host whose lead has an id of its own, as OpenCode's
 * session, passes none for it). Any other agent is refused the lead's tools (T-525), whether or not the board still
 * names it: an agent of an old try whose id the board no longer keeps (runs keeps only the last few) is never taken for
 * the lead.
 */
export async function toolCall(host: Host, tool: string, agentId: string | undefined, input: Record<string, unknown>): Promise<{ deny: string } | { result: string } | null> {
  // T-660: every refusal of an agent's call is logged (in the background, after the decision)
  const refuse = (text: string, guard: 'stopped' | 'tools', who: Who): { deny: string } => {
    logRefusal(host, who, { text, guard, what: tool })
    return { deny: text }
  }
  if (agentId && stopped.has(agentId)) return refuse(stoppedTextFor(agentId), 'stopped', { role: 'agent' })
  const on = agentId && !isOwnAgent(agentId) && (await findRoot(host)) ? await agentOnBoard(host, agentId) : undefined
  if (on?.kind === 'ended') return refuse(stoppedText(), 'stopped', { role: 'agent', task: on.task })
  // a scout or checker only reads the board: board and stats run (and, for a scout, scouts with action list), every other symcc tool (ask_owner too) is refused
  if (agentId && (scoutRuns.has(agentId) || checkerRuns.has(agentId) || on?.kind === 'checker')) {
    const short = tool === toolName(ASK_TOOL) ? ASK_TOOL : toolNames().find(t => tool === toolName(t))
    const scout = scoutRuns.get(agentId)
    // T-895: a scout (not a checker) may also list the scouts (the scouts tool with action list)
    const why = short ? scoutToolRefusal(short, S.N.name, input, scout !== undefined ? 'scout' : 'checker') : null
    const task = checkerRuns.get(agentId)?.task ?? (on?.kind === 'checker' ? on.task : undefined)
    if (why) return refuse(why, 'tools', scout !== undefined ? { role: 'scout', scout } : { role: 'checker', ...(task ? { task } : {}) })
  } else if (agentId) {
    // T-525: an agent that is no scout or checker (a worker, one symcc no longer has on record, or any other) never gets the lead's tools
    const lead = toolNames().find(t => tool === toolName(t))
    const w = workers.get(agentId) ?? (on?.kind === 'worker' ? on.worker : undefined)
    // T-759: a scout or worker of symcc's this copy has no record of, in a session that no longer drives the board
    // (driving moved to another session): stopped with that plain note, not told it isn't the lead
    if (lead && !w && !isOwnAgent(agentId) && (await listedKind(host, agentId)) === 'symcc' && (await movedAway(host, agentId))) return refuse(movedText(), 'stopped', { role: 'agent' })
    if (lead) return refuse(notLeadText(lead), 'tools', w ? { role: 'worker', task: w.task } : { role: 'agent' })
  }
  if (tool === toolName(ASK_TOOL)) {
    if (!(await findRoot(host))) return { result: startingText() }
    return { result: await askCall(host, agentId, input).catch((err: Error) => `error: ${err.message}`) }
  }
  const name = toolNames().find(t => tool === toolName(t))
  if (!name) return null
  // Before session start set the project folder (e.g. right after a plugin reload), learn it from the
  // session; if it still isn't known, answer and write nothing (never a board or lock path from "/").
  if (!(await findRoot(host))) return { result: startingText() }
  if (S.guardOnly) return { result: guardOnlyText() }
  if (!(await isOn(host))) return { result: S.fresh ? notSetUpAnswer(S.N.name) : S.offHere ? offHereAnswer(S.N.name, S.offWhy, S.driver) : offAnswer(S.N.name) }
  try {
    return { result: await runTool(host, name, input as In) }
  } catch (err) {
    return { result: `error: ${(err as Error).message}` }
  }
}

/** Why an agent's call of lead tool `tool` (plain name) is refused: only the lead (the main chat) may call it. */
export const notLeadText = (tool: string) =>
  `Refused: ${toolName(tool)} is only for the ${S.N.name} lead (the main chat), and you are not it. Change nothing on the board; put anything for it in your final answer, and end.`

/**
 * A tool that is not symcc's ran, and touched what `touch` says (a file it wrote or edited, or a shell command it ran;
 * null: none of those, as the host tells it from its own tool names, e.g. claude/tools.ts). Writing, editing or
 * deleting a scout file reschedules the scouts, a role or task type file reloads the roles or task types, and the board is published again.
 * Runs in the background.
 */
export function otherToolDone(host: Host, touch: FileTouch | null) {
  if (!touch || S.guardOnly) return
  const hit = fileToolHits(touch, S.N.scouts, `${S.N.dir}/roles`, `${S.N.dir}/kinds`)
  if (!hit.scouts && !hit.roles && !hit.kinds) return
  void (async () => {
    // before session start (a plugin reload): learn the project folder first; unknown, change nothing
    if (!(await findRoot(host))) return
    if (hit.scouts) await scheduleScouts(host)
    if (hit.roles) await loadRoles(host).catch(() => undefined)
    if (hit.kinds) await loadKinds(host).catch(() => undefined)
    await publish(host, await load(host))
  })().catch(() => undefined)
}

/**
 * symcc's tool call handling threw or ran out of time, before the call was passed on. One of symcc's own agents is
 * refused (never let through unchecked); the lead's call of a symcc tool gets the error; null: any other call of the
 * lead goes on as if symcc were not there (see guardFailed).
 */
export function toolCallFailed(host: Host, tool: string, agentId: string | undefined, error: { kind?: string; message?: string } | undefined): { deny: string } | { result: string } | null {
  const deny = guardFailed(host, 'tool.call', agentId, error)
  if (deny) return { deny }
  return isSymccTool(tool) ? { result: `error: ${S.N.name} couldn't run this tool: ${guardReason(error?.kind, error?.message)}` } : null
}

/**
 * A tool is about to run, and would touch what `touch` says (a file it writes or edits, or a shell command it runs;
 * null: none of those, as the host tells it from its own tool names, e.g. claude/tools.ts editTouch): answers why it
 * is refused, or undefined to decide as usual. A worker's edit outside its change task's files is refused, and the
 * path is recorded as a request to the owner; an edit or shell command reaching the owner's copy outside the worker's
 * folder is refused (see checkEdit). `cwd` is the calling agent's own folder, when the host knows it. `kindOf` tells
 * whether an agent symcc has no record of was started as one of symcc's (default: the host's agent list). An error is not
 * swallowed: the host then calls toolCheckFailed.
 */
export async function toolCheck(host: Host, agentId: string | undefined, touch: FileTouch | null, cwd?: string, kindOf?: AgentKindOf): Promise<string | undefined> {
  return agentId ? await checkEdit(host, agentId, touch, cwd, kindOf) : undefined
}

/** toolCheck threw or ran out of time: a worker's, checker's or scout's call is refused (the reason), the lead's goes on (undefined). */
export function toolCheckFailed(host: Host, agentId: string | undefined, error: { kind?: string; message?: string } | undefined): string | undefined {
  return guardFailed(host, 'tool.check', agentId, error)
}

// ---------------- agents ----------------

/** How an agent's run ended: its final answer, why (`end`), whether it was cut off, the tokens it used, and its cost in US dollars when the host knows it (a worker's is kept on its try). */
export type AgentRunEnd = { answer: string; end: TurnEnd; isAborted: boolean; tokens: SymccTokens | undefined; cost?: number }

/** An agent's run ended (a worker, scout or checker of symcc's, or one this copy lost track of in a reload); other agents are left alone. */
export function agentFinished(host: Host, agentId: string | undefined, run: AgentRunEnd) {
  // T-831: the hidden starter is no worker, scout or checker: nothing is kept of it
  if (agentId && isStarter(agentId)) return
  // T-656: the answer to a debrief (the follow-up after a hand-back) only brings org-mem suggestions
  // (and, like any agent's end, it runs pump: a fast retry of its task, held back by nothing now, starts at once)
  if (agentId && debriefFinished(host, agentId, run)) {
    void pump(host).catch(() => undefined)
    return
  }
  const { answer, end, isAborted, tokens, cost } = run
  // a scout's or checker's turn that ended on an API error or a refusal: its half-written last text is no report or verdict
  const broken = !isAborted && (end.reason === 'error' || end.reason === 'refusal')
  if (agentId && workers.has(agentId)) void workerFinished(host, agentId, answer, end, tokens, cost).catch(() => undefined)
  // T-919: a scout whose turn ended while its background commands still run is woken again by the host: its run goes on
  else if (agentId && scoutRuns.has(agentId)) {
    if (isAborted || broken || !scoutTurnEnded(host, agentId, answer, end.background, tokens)) void scoutFinished(host, agentId, answer, broken ? end : isAborted, tokens)
  }
  // a checker's verdict (the checker setting) goes to the finish step waiting for it
  else if (agentId && checkerRuns.has(agentId)) checkerFinished(agentId, answer, broken ? end : isAborted || end.reason === 'aborted', tokens, end.background)
  // a report from a worker this copy lost track of in a reload: still taken when its task waits for it
  // (a worker this copy stopped, e.g. an orphan after a reload: its task is put back to "todo" at once instead)
  else if (agentId) void lateHandBack(host, agentId).then(ok => (ok ? workerFinished(host, agentId, answer, end, tokens, cost) : stoppedHandBack(host, agentId, tokens, cost))).catch(() => undefined)
}
