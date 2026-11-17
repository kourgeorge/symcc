// The checker setting (see core/checker.ts): a fresh agent tries to break a finished change before it merges.
// finishWork (workers.ts) holds the change before its merge (or review), runs a checker here and waits for its
// verdict; turn.complete (register.tsx) hands the checker's answer back through checkerFinished.
import type { SymccTask, SymccTokens } from '../../types'
import { type Board, CHECKER_ROLE, type CheckerVerdict, addTokens, agentSafeName, checkerDiff, checkerLine, checkerPrompt, checkerVerdict, cutLine, find, findRole, intoOf, patchTask, roleSection, tryLabel } from '../board'
import { git, taskBranch } from './git'
import { markStep } from './review'
import { loadRoles } from './roles'
import { S, type $, type CheckerEnd, checkerRuns, stopped } from './state'
import { change, now } from './store'

/** What a checker came to: its verdict, or null with why there is none (it was stopped, ran over its time, or didn't start). */
export type CheckerOutcome = { verdict: CheckerVerdict | null; why?: string }

/** The agent name of task `id`'s checker: "symcc-T-3-checker". */
export const checkerName = (name: string, id: string) => agentSafeName(`${name}-${id}-checker`)

/**
 * Runs a checker on task `t`'s finished work in its folder `dir` (everything is committed there) and waits for its
 * verdict. The board shows the task's step as "checking" meanwhile. The checker runs as the read-only scout type
 * (no Edit or Write), and whatever it still changed in the folder is thrown away after. Its time limit is the board's
 * max_minutes: past it, it is stopped and there is no verdict. Its verdict goes into the task's history and its
 * tokens are added to the task's current try. Never throws: a checker that can't start gives no verdict.
 * `stop`: why the task was stopped (dropped, paused, sent to the owner), if it was; looked at once the checker
 * started too, so a stop that came while it was starting up (before haltChecker could see it) still stops it at once.
 */
export async function runChecker($: $, t: SymccTask, b: Board, dir: string, stop: () => string | undefined = () => undefined): Promise<CheckerOutcome> {
  await markStep($, t, 'checking', () => undefined)
  await change($, x => (find(x, t.id)?.status === t.status && find(x, t.id)?.attempts === t.attempts ? patchTask(x, t.id, { note: 'a checker is trying to break it before it merges' }, now()) : x)).catch(() => undefined)
  const into = intoOf(t)
  const roles = await loadRoles($).catch(() => S.roles)
  const role = findRole(roles, CHECKER_ROLE)
  const d = await git($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', `refs/heads/${into}...HEAD`], dir).catch(() => null)
  const prompt = checkerPrompt({ name: S.N.name, task_id: t.id, title: t.title, details: t.details, branch: taskBranch(t), folder: dir, into, role: roleSection(role), diff: checkerDiff(d && d.exitCode === 0 ? d.stdout : '') })
  const early = stop()
  if (early) {
    const why = `not started: the task was ${early}`
    await record($, t, null, why)
    return { verdict: null, why }
  }
  let agentId: string
  try {
    const spawned = await $.agent.spawn({ prompt, name: checkerName(S.N.name, t.id), description: `${S.N.name} checker for ${t.id}`, subagentType: S.N.scout, cwd: dir, ...(role?.model ? { model: role.model } : {}) })
    if ('deny' in spawned && spawned.deny) throw new Error(spawned.deny)
    if (!('agentId' in spawned) || !spawned.agentId) throw new Error('the checker did not start')
    agentId = spawned.agentId
  } catch (err) {
    const why = `the checker couldn't start: ${cutLine((err as Error)?.message ?? String(err), 200)}`
    await record($, t, null, why)
    return { verdict: null, why }
  }
  const end = await new Promise<CheckerEnd>(resolve => {
    let timer: { cancel(): void } | null = null
    const done = (e: CheckerEnd) => {
      if (checkerRuns.get(agentId)?.end !== done) return
      checkerRuns.delete(agentId)
      timer?.cancel()
      resolve(e)
    }
    checkerRuns.set(agentId, { task: t.id, end: done })
    const min = b.max_minutes
    try {
      timer = $.clock.after(min * 60_000, () => {
        stopped.add(agentId)
        void $.session.send({ to: { agentId }, text: 'Stop now: your time is up. Answer "stopped" and end.' }).catch(() => undefined)
        done({ answer: null, why: `it ran over ${min} min and was stopped` })
      }) ?? null
    } catch {
      timer = null
    }
    const late = stop()
    if (late) {
      stopped.add(agentId)
      void $.session.send({ to: { agentId }, text: `Stop now: the task was ${late}. Don't change anything else; answer "stopped" and end.` }).catch(() => undefined)
      done({ answer: null, why: `the task was ${late}` })
    }
  })
  await cleanFolder($, dir)
  const verdict = end.answer === null ? null : checkerVerdict(end.answer)
  const why = end.answer === null ? end.why : verdict ? undefined : 'it handed back nothing'
  await record($, t, verdict, why, end.tokens)
  return { verdict, ...(why ? { why } : {}) }
}

/** The checker's verdict (`v`, or none with `why`) as a history line of task `t`, and its tokens added to the current try; only while `t` is still on that try. */
async function record($: $, t: SymccTask, v: CheckerVerdict | null, why?: string, tokens?: SymccTokens) {
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.attempts !== t.attempts) return x
    const runs = cur.runs?.length && tokens ? [...cur.runs.slice(0, -1), { ...cur.runs.at(-1)!, tokens: addTokens(cur.runs.at(-1)!.tokens, tokens) }] : undefined
    return patchTask(x, t.id, { history: [...cur.history, checkerLine(tryLabel(cur), v, why)], ...(runs ? { runs } : {}) }, now())
  }).catch(() => undefined)
}

/** Throws away anything the checker changed in folder `dir` (symcc committed the work before it ran, so nothing of the task's is lost). */
async function cleanFolder($: $, dir: string) {
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir).catch(() => null)
  if (!st || st.exitCode !== 0 || !st.stdout) return
  await git($, ['reset', '-q', '--hard', 'HEAD'], dir).catch(() => undefined)
  await git($, ['clean', '-fdq'], dir).catch(() => undefined)
}

/** A checker's turn ended (turn.complete): its answer goes to the step waiting for it; `aborted`: it was stopped, so there is no verdict. */
export function checkerFinished(agentId: string, answer: string, aborted = false, tokens?: SymccTokens) {
  const run = checkerRuns.get(agentId)
  if (!run) return
  run.end(aborted ? { answer: null, why: 'it was stopped', ...(tokens ? { tokens } : {}) } : { answer, ...(tokens ? { tokens } : {}) })
}

/** Stops every running checker (`why`, e.g. the board was turned off): each one's step goes on with no verdict. */
export async function haltCheckers($: $, why: string) {
  await haltCheckersOf($, why, () => true)
}

/** Stops the running checker of task `taskId` (it was dropped, paused or sent to the owner): its step goes on at once with no verdict. */
export async function haltChecker($: $, taskId: string, why: string) {
  await haltCheckersOf($, why, task => task === taskId)
}

async function haltCheckersOf($: $, why: string, which: (task: string) => boolean) {
  for (const [agentId, run] of [...checkerRuns]) {
    if (!which(run.task)) continue
    stopped.add(agentId)
    await $.session.send({ to: { agentId }, text: `Stop now: ${why}. Don't change anything else; answer "stopped" and end.` }).catch(() => undefined)
    run.end({ answer: null, why })
  }
}
