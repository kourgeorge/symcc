// T-656: the debrief. A worker's or checker's main prompt is only about its task; right after it hands back, symcc
// sends the same agent one short follow-up message (DEBRIEF_TEXT, through host.agents.followUp), so it answers with
// its whole task still in mind: 0-3 suggested notes for organizational memory (org-mem). Its answer comes back as a run
// end for the same agent id (agentFinished hands it to debriefFinished first). The debrief never holds up the work:
// prep, the checker and the merge line go on from the main hand-back at once; the answer is applied when it comes
// (kept on the task, or told to the lead at once when the task is done by then), and its tokens count on the task's
// try. No answer within DEBRIEF_MS: nothing is kept, and the agent is told to stop. A host with no followUp gets
// LEARNED_ASK at the end of the main prompts instead (learnedAsk).
import type { SymccTokens } from '../../types'
import { addTokens, find, patchTask, type Board, type BoardTask } from '../board'
import { addSuggestions, suggestedText, DEBRIEF_MS, DEBRIEF_TEXT, LEARNED_ASK } from '../core/org-mem'
import type { Host, HostTimer } from '../host'
import { toolName } from './state'
import { change, now } from './store'
import { tellLead } from './tell'

/** A debrief waiting for its answer: the agent's task and try, its time limit, and the report it handed back. */
type Debrief = { task: string; attempts: number; timer: HostTimer | null; report: string }

/** The debriefs waiting for an answer, by agent id. */
export const debriefs = new Map<string, Debrief>()

/** Forgets every debrief and stops their timers (as a reload does; for the tests). */
export function resetDebriefs() {
  for (const d of debriefs.values()) d.timer?.cancel()
  debriefs.clear()
}

/** What the main prompts end with: '' when the host can send the debrief, else the "Learned:" ask (the fallback). */
export const learnedAsk = (host: Pick<Host, 'agents'>): string => (host.agents.followUp ? '' : LEARNED_ASK)

/**
 * Sends agent `agentId` (it just handed back try `attempts` of task `task`, with `report`) the debrief, when the host
 * can continue it. Returns at once: nothing waits for the answer.
 */
export function startDebrief(host: Host, agentId: string, task: string, attempts: number, report = '') {
  const followUp = host.agents.followUp
  if (!followUp || !agentId || debriefs.has(agentId)) return
  const d: Debrief = { task, attempts, timer: null, report: report.trim() }
  debriefs.set(agentId, d)
  try {
    d.timer =
      host.clock.after(DEBRIEF_MS, () => {
        if (debriefs.get(agentId) !== d) return
        debriefs.delete(agentId)
        void host.agents.stop(agentId, 'Stop now: no answer is needed any more. Change nothing; answer "stopped" and end.').catch(() => undefined)
      }) ?? null
  } catch {
    d.timer = null
  }
  // no time limit (a clock that gives no timer): no debrief, so an unanswered one can't stay waiting for good
  if (!d.timer) {
    debriefs.delete(agentId)
    return
  }
  const drop = () => {
    if (debriefs.get(agentId) !== d) return
    debriefs.delete(agentId)
    d.timer?.cancel()
  }
  // a send that fails, or one the host answers as not delivered (Claude Code: `{ isDelivered: false }`): dropped at once
  void Promise.resolve()
    .then(() => followUp(agentId, DEBRIEF_TEXT))
    .then(r => {
      if (r && typeof r === 'object' && (r as { isDelivered?: unknown }).isDelivered === false) drop()
    })
    .catch(drop)
}

/** Whether agent `agentId` is only answering its debrief (it has handed back: it holds no task any more). */
export const debriefing = (agentId: string): boolean => debriefs.has(agentId)

/** What a debrief's run end carries (the part of AgentRunEnd it reads). */
export type DebriefEnd = { answer: string; end: { reason: string }; isAborted: boolean; tokens?: SymccTokens; cost?: number }

/**
 * Agent `agentId`'s run ended: when it is a debrief's answer, it is applied in the background and true is answered
 * (the run is not a worker's or checker's hand-back); false: no debrief waits for this agent.
 */
export function debriefFinished(host: Host, agentId: string, run: DebriefEnd): boolean {
  const d = debriefs.get(agentId)
  if (!d) return false
  // the same report again (a repeated run end, not the answer): nothing more is taken from it, and the answer is still awaited
  if (d.report && String(run.answer ?? '').trim() === d.report) return true
  debriefs.delete(agentId)
  d.timer?.cancel()
  void applyDebrief(host, d, run).catch(() => undefined)
  return true
}

/**
 * A debrief's answer: its suggestions are kept on the task (a done task's are told to the lead at once, as its own were
 * listed at done already; a dropped task's are thrown away), and its tokens and cost are added to the task's try.
 */
async function applyDebrief(host: Host, d: Debrief, run: DebriefEnd) {
  const answered = !run.isAborted && run.end.reason === 'answer'
  const late = await change(host, x => {
    const cur = find(x, d.task) as BoardTask | undefined
    if (!cur) return [x, [] as string[]] as [Board, string[]]
    const patch: Partial<BoardTask> = {}
    const last = cur.runs?.at(-1)
    if (cur.attempts === d.attempts && last && (run.tokens || run.cost !== undefined)) {
      patch.runs = [...cur.runs!.slice(0, -1), { ...last, ...(run.tokens ? { tokens: addTokens(last.tokens, run.tokens) } : {}), ...(run.cost !== undefined ? { cost: (last.cost ?? 0) + run.cost } : {}) }]
    }
    let told: string[] = []
    if (answered && cur.status !== 'dropped') {
      const all = addSuggestions(cur.suggested, run.answer, true)
      const added = all.slice(cur.suggested?.length ?? 0)
      if (cur.status === 'done') told = added
      else if (added.length) patch.suggested = all
    }
    return [Object.keys(patch).length ? patchTask(x, d.task, patch, cur.updated_at) : x, told] as [Board, string[]]
  })
  if (late.length) tellLead(host, suggestedText(d.task, late, toolName('orgmem')))
}
