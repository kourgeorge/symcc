// The checker setting (see core/checker.ts): a fresh agent tries to break a finished change before it merges.
// finishWork (workers.ts) runs a checker here after the prep step and before the task joins the merge line, and waits
// for its verdict; turn.complete (agentFinished in app/symcc.ts) hands the checker's answer back through checkerFinished.
import type { SymccTask, SymccTokens } from '../../types'
import { emptyBoard, type Board, CHECKER_ROLE, type CheckerVerdict, roleSection, checkerIdOf, withAgentStart, agentSafeName, checkerDiff, checkerChangedFiles, checkerTestsText, testCommandsOf, checkerEntry, checkerPrompt, checkerVerdict, checkerReportFile, reportText, cutLine, find, findRole, intoOf, patchTask, tryLabel, withTimeline, withAgentUsed, type TimelineAdd } from '../board'
import { git } from './git'
import { taskBranch } from './worktree'
import { markStep } from './review'
import { loadRoles } from './roles'
import { changeValues } from './prompt-values'
import { S, type CheckerEnd, checkerRuns, adoptedCheckers, halt, stopped, movedAway } from './state'
import { type Host, notReadyYet } from '../host'
import type { TurnEnd } from './workers'
import { change, load, now, path, safeWrite } from './store'
import { startAgent } from './starts'
import { logVerdict } from './evidence'
import { orgMemText, keepSuggestions } from './org-mem'
import { learnedAsk, startDebrief } from './debrief'
import { addTokens } from '../core/runs'

/** What a checker came to: its verdict, or null with why there is none (it was stopped, ran over its time, or didn't start). */
/** `stopped` (T-740): symcc itself stopped this checker (its agent is in `stopped`) before its verdict, so whatever it answered is no verdict. */
export type CheckerOutcome = { verdict: CheckerVerdict | null; why?: string; again?: boolean; stopped?: boolean }

/** The no-verdict reason of a checker symcc stopped before its verdict, when a new checker starts on the same try. */
export const STOPPED_AGAIN = 'it was stopped; a new checker starts'

/** The agent name of task `id`'s checker: "symcc-T-3-checker". */
export const checkerName = (name: string, id: string) => agentSafeName(`${name}-${id}-checker`)

/**
 * Runs a checker on task `t`'s finished work in its folder `dir` (everything is committed there) and waits for its
 * verdict. The board shows the task's step as "checker" meanwhile. The checker runs as the read-only scout type
 * (no Edit or Write), and whatever it still changed in the folder is thrown away after; if it moved the task's branch
 * (a commit, a reset), the branch is put back where it was (putBack). Its time limit is the board's
 * max_minutes: past it, it is stopped and there is no verdict. Its verdict goes into the task's timeline and its
 * tokens are added to the task's current try. Never throws: a checker that can't start gives no verdict.
 * `stop`: why the task was stopped (dropped, paused, sent to the owner), if it was; looked at once the checker
 * started too, so a stop that came while it was starting up (before haltChecker could see it) still stops it at once.
 * `tryLater`: asked when the checker couldn't start only because its agent type isn't loaded yet (just after a
 * reload); when it says yes, nothing is written and the outcome is `again` (the caller tries again at the next check).
 */
export async function runChecker($: Host, t: SymccTask, b: Board, dir: string, stop: () => string | undefined = () => undefined, tryLater?: () => boolean): Promise<CheckerOutcome> {
  // T-1068: a checker that kept running over a plugin reload is only waited for: its prep and prompt were done before the reload
  const adopted = adoptedCheckers.get(t.id)
  adoptedCheckers.delete(t.id)
  const held = adopted ? checkerRuns.get(adopted.id)?.held : undefined
  let agentId = adopted?.id ?? ''
  let saved: Awaited<ReturnType<typeof gitPlace>> = null
  if (adopted) {
    // the tested commit the try recorded when this checker started; the branch is put back there (as for a fresh checker)
    const tested = find(await load($).catch(() => emptyBoard()), t.id)?.live?.tested
    if (tested) saved = { head: tested, on: `refs/heads/${taskBranch(t)}`, tip: tested, branch: taskBranch(t) }
  } else {
    await markStep($, t, 'checker', () => undefined)
    const into = intoOf(t)
    const roles = await loadRoles($).catch(() => S.roles)
    const role = findRole(roles, CHECKER_ROLE)
    const d = await git($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', `refs/heads/${into}...HEAD`], dir).catch(() => null)
    const n = await git($, ['diff', '--name-only', '--no-renames', '-z', `refs/heads/${into}...HEAD`], dir).catch(() => null)
    const changed = n && n.exitCode === 0 ? n.stdout.split('\0').filter(Boolean) : []
    // T-551: the project's tests run once, in the merge line, after the checker: it is told not to run them
    const tests = checkerTestsText(S.N.name, testCommandsOf(b, t))
    // the checker role's checklist gets the same placeholders a change worker's role does (the task's files, kind, ...); its {{test_command}} is the checker's own tests line
    const facts = { ...changeValues(t, b, dir), test_command: tests }
    const prompt = checkerPrompt({ name: S.N.name, task_id: t.id, title: t.title, branch: taskBranch(t), folder: dir, details: t.details, into, role: roleSection(role, facts, t), kind_name: t.kind ?? 'change', diff: checkerDiff(d && d.exitCode === 0 ? d.stdout : ''), changed_files: checkerChangedFiles(changed), tests, org_mem: await orgMemText($), learned: learnedAsk($) }, t)
    const early = stop()
    if (early) {
      const why = `not started: the task was ${early}`
      await record($, t, null, why)
      return { verdict: null, why }
    }
    // where the task's branch is now (the committed work): put back after the checker if it moved it
    saved = await gitPlace($, dir, taskBranch(t))
    // T-1068: kept on the board, so a checker that runs on over a plugin reload is put back there too
    if (saved) await change($, x => { const cur = find(x, t.id); return cur && cur.status === 'doing' && cur.attempts === t.attempts ? patchTask(x, t.id, { live: { tested: saved!.head } }, cur.updated_at) : x }).catch(() => undefined)
    try {
      // queued: it starts at the next turn's start or end, where Claude Code keeps symcc's hooks (see starts.ts)
      const spawned = await startAgent($, { kind: 'checker', prompt, name: checkerName(S.N.name, t.id), description: `${S.N.name} checker for ${t.id}`, cwd: dir, ...(role?.model ? { model: role.model } : {}) })
      if (!spawned.agentId) throw new Error('the checker did not start')
      agentId = spawned.agentId
    } catch (err) {
      const why = `the checker couldn't start: ${cutLine((err as Error)?.message ?? String(err), 200)}`
      if (notReadyYet(err) && tryLater?.()) return { verdict: null, why, again: true }
      await record($, t, null, why)
      return { verdict: null, why }
    }
  }
  // checkerRuns is set at once (in the promise below, before any await), and the board then names the checker too, so
  // the guards of another session's copy of the plugin know it (T-471); it is taken off when the checker ends
  // its time ran out (symcc stops it then too, but that is no stop to start a new checker for)
  let overTime = false
  const ended = new Promise<CheckerEnd>(resolve => {
    let timer: { cancel(): void } | null = null
    const done = (e: CheckerEnd) => {
      if (checkerRuns.get(agentId)?.end !== done) return
      checkerRuns.delete(agentId)
      timer?.cancel()
      resolve(e)
    }
    checkerRuns.set(agentId, { task: t.id, worktree: dir, end: done, ...(held ? { held } : {}) })
    const min = b.max_minutes
    try {
      timer = $.clock.after(min * 60_000, () => {
        overTime = true
        void halt($, agentId, 'your time is up')
        done(checkerTimeUp(agentId, min))
      }) ?? null
    } catch {
      timer = null
    }
    // its hand-back came before this step waited for it (see stopOrphans): that verdict is used now
    if (adopted?.early) done(adopted.early)
    const late = stop()
    if (late) {
      void halt($, agentId, `the task was ${late}`)
      done({ answer: null, why: `the task was ${late}` })
    }
  })
  await markChecker($, t, agentId, true)
  const end = await ended
  await markChecker($, t, agentId, false)
  await cleanFolder($, dir)
  const back = await putBack($, dir, saved)
  // T-740: symcc stopped this checker (a reload's orphan stop, a halt): known from symcc's own record of the stop, not
  // from its answer's text; whatever it answered ("stopped", or "I found nothing before the stop") is no verdict
  const bySymcc = !overTime && stopped.has(agentId)
  if (bySymcc) {
    // a halt of every checker (the board paused, symcc disabled) ends it with no answer and its own reason (end.why),
    // as on main: that comes first, even when the task's stop was set meanwhile; else read the stop again here
    const own = end.answer === null && end.why ? end.why : undefined
    const late = own ? undefined : stop()
    const why = own ?? (late ? `the task was ${late}` : undefined)
    await record($, t, null, why ?? STOPPED_AGAIN, end.tokens, undefined, agentId)
    return { verdict: null, why: why ?? 'it was stopped', stopped: true }
  }
  // T-600, T-632: its "Learned:" lines are kept on the task as org-mem suggestions for the lead, whatever its verdict
  if (end.answer) await keepSuggestions($, t.id, end.answer)
  // T-656: it handed back: one follow-up turn asks it for org-mem suggestions; nothing waits for that answer
  if (end.answer !== null) startDebrief($, agentId, t.id, t.attempts, end.answer)
  let verdict = end.answer === null ? null : checkerVerdict(end.answer)
  let why = end.answer === null ? end.why : verdict ? undefined : 'it handed back nothing'
  if (back === 'failed') {
    // the branch is not where it was: no verdict, so nothing merges on the checker's word
    verdict = null
    why = `it moved the task's branch ${taskBranch(t)} and it could not be put back`
  }
  const reportFile = end.answer?.trim() ? await saveCheckerReport($, t, end.answer) : undefined
  await record($, t, verdict, why, end.tokens, back === 'moved' ? `${tryLabel(t)}: the checker moved the branch ${taskBranch(t)}; it was put back at ${saved!.head.slice(0, 10)}, so nothing it made is merged` : undefined, agentId, reportFile)
  logVerdict($, t.id, Number(t.attempts) || 0, verdict)
  return { verdict, ...(why ? { why } : {}) }
}

/**
 * Names checker `agentId` on task `t`'s current try on the board (`on`), or takes it off (only when it is still that
 * checker), while the task is still "doing" on that try. Never throws: a board that can't be written leaves only
 * this copy's own memory (checkerRuns) to know the checker.
 */
async function markChecker($: Host, t: SymccTask, agentId: string, on: boolean) {
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== 'doing' || cur.attempts !== t.attempts) return x
    if (on ? checkerIdOf(cur) === agentId : checkerIdOf(cur) !== agentId) return x
    // T-805: the checker is the try's last open checker entry: started here, ended when it is taken off
    const runs = on ? withAgentStart(cur.runs, 'checker', agentId, now()) : withAgentUsed(cur.runs, 'checker', agentId, now())
    return runs === cur.runs ? x : patchTask(x, t.id, { runs }, cur.updated_at)
  }).catch(() => undefined)
}

/** The checker's verdict (`v`, or none with `why`) as a timeline line of task `t`, and its tokens added to the current try; only while `t` is still on that try. */
async function record($: Host, t: SymccTask, v: CheckerVerdict | null, why?: string, tokens?: SymccTokens, before?: string, agentId?: string, report?: string) {
  await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.attempts !== t.attempts) return x
    if (!v && movedAway.has(t.id)) return x // the lead moved the task: its own "moved to ..." line is the only one
    // T-774, T-805: the checker's tokens go only on its own agent entry, ended now (a stopped checker keeps the tokens it had)
    const runs = cur.runs?.length && (agentId || tokens) ? withAgentUsed(cur.runs, 'checker', agentId, now(), tokens ? { tokens } : {}) : undefined
    return patchTask(x, t.id, { timeline: withTimeline(cur.timeline, now(), ...(before ? [['step', before, { try: cur.attempts }] as TimelineAdd] : []), checkerEntry(tryLabel(cur), v, why, cur.attempts, { ...(agentId ? { agent: checkerName(S.N.name, t.id) } : {}), ...(report ? { report } : {}) })), ...(runs ? { runs } : {}) }, now())
  }).catch(() => undefined)
}

/**
 * T-1079: saves checker answer `answer` (its full report) of task `t`'s current try to <dir>/reports/<id>-try-<N>-checker.md
 * (through a temp file and a rename) and gives its path; undefined when it could not be saved (the task goes on).
 */
async function saveCheckerReport($: Host, t: SymccTask, answer: string): Promise<string | undefined> {
  const rel = checkerReportFile(S.N.dir, t.id, t.attempts)
  try {
    await $.run(['mkdir', '-p', path(`${S.N.dir}/reports`)])
    await safeWrite($, path(rel), reportText(answer), 'the checker report')
    return rel
  } catch {
    return undefined
  }
}

/** Throws away anything the checker changed in folder `dir` (symcc committed the work before it ran, so nothing of the task's is lost). */
export async function cleanFolder($: Host, dir: string) {
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir).catch(() => null)
  if (!st || st.exitCode !== 0 || !st.stdout) return
  await git($, ['reset', '-q', '--hard', 'HEAD'], dir).catch(() => undefined)
  await git($, ['clean', '-fdq'], dir).catch(() => undefined)
}

/** Where folder `dir` is in git: the commit of HEAD, the branch HEAD is on (empty when detached), and the commit of the task's branch `branch`. Null when HEAD can't be read. */
type Place = { head: string; on: string; tip: string; branch: string }
async function gitPlace($: Host, dir: string, branch: string): Promise<Place | null> {
  const [h, on, tip] = await Promise.all([
    git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir).catch(() => null),
    git($, ['symbolic-ref', '-q', 'HEAD'], dir).catch(() => null),
    git($, ['rev-parse', '-q', '--verify', `refs/heads/${branch}`], dir).catch(() => null),
  ])
  const head = h && h.exitCode === 0 ? h.stdout.trim() : ''
  if (!/^[0-9a-f]{7,64}$/.test(head)) return null
  return { head, on: on && on.exitCode === 0 ? on.stdout.trim() : '', tip: tip && tip.exitCode === 0 ? tip.stdout.trim() : '', branch }
}

/**
 * The checker may have run git in folder `dir` (a commit, a reset, a checkout...): when HEAD, the branch it is on or
 * the task's branch moved from `saved`, the task's branch is put back at the saved commit and checked out again, so
 * only the committed work can merge. 'same': nothing moved; 'moved': it moved and was put back; 'failed': it couldn't be.
 */
async function putBack($: Host, dir: string, saved: Place | null): Promise<'same' | 'moved' | 'failed'> {
  if (!saved) return 'same'
  const now = await gitPlace($, dir, saved.branch)
  if (now && now.head === saved.head && now.on === saved.on && now.tip === saved.tip) return 'same'
  // -B sets the branch to the saved commit (wherever the checker left it) and checks it out; -f drops what is in the way
  const r = await git($, ['checkout', '-q', '-f', '-B', saved.branch, saved.head], dir).catch(() => null)
  await git($, ['clean', '-fdq'], dir).catch(() => undefined)
  const after = r && r.exitCode === 0 ? await gitPlace($, dir, saved.branch) : null
  return after && after.head === saved.head && after.tip === saved.head ? 'moved' : 'failed'
}

/**
 * A checker's turn ended (turn.complete): its answer goes to the step waiting for it. `end`: why it ended (true:
 * it was stopped); a turn that was stopped, or ended on an API error or a refusal, gives no verdict, as its last
 * text is only half an answer.
 */
export function checkerFinished(agentId: string, answer: string, end: boolean | TurnEnd = false, tokens?: SymccTokens, background?: readonly string[]) {
  const run = checkerRuns.get(agentId)
  if (!run) return
  // T-919: a turn that ended on an answer while shell commands it sent to the background still run is no hand-back:
  // the host wakes the checker again (same id) when they end, so it stays in checkerRuns (known to the guards) and
  // its verdict is its later turn's; its time limit (max_minutes) still ends it if it is never woken
  const answered = end === false || (end !== true && end.reason === 'answer')
  const held = run.held
  if (held?.tokens) tokens = addTokens(held.tokens, tokens)
  if (answered && background?.length && !stopped.has(agentId)) {
    run.held = { answer: answer.trim() ? answer : (held?.answer ?? answer), ...(tokens ? { tokens } : {}) }
    return
  }
  if (held && !answer.trim()) answer = held.answer
  delete run.held
  const why = checkerNoVerdict(end === true ? { reason: 'aborted' } : end === false ? { reason: 'answer' } : end)
  run.end(why ? { answer: null, why, ...(tokens ? { tokens } : {}) } : { answer, ...(tokens ? { tokens } : {}) })
}

/**
 * How a checker's run ends when its time limit (`min` minutes) is up. T-919: a checker that already answered but left a
 * background command running has that answer held (checkerFinished); it was never woken again, so the held answer
 * (with its tokens) is its verdict, as when no command was left running; with nothing held there is no verdict.
 */
export function checkerTimeUp(agentId: string, min: number): CheckerEnd {
  const held = checkerRuns.get(agentId)?.held
  const tokens = held?.tokens ? { tokens: held.tokens } : {}
  if (held?.answer.trim()) return { answer: held.answer, ...tokens }
  return { answer: null, why: `it ran over ${min} min and was stopped`, ...tokens }
}

/** Why a checker's turn that ended this way gives no verdict, or undefined when it answered. */
function checkerNoVerdict(end: TurnEnd): string | undefined {
  if (end.reason === 'aborted') return 'it was stopped'
  if (end.reason === 'error') return 'its turn ended on an error (retries used up or the context limit)'
  if (end.reason === 'refusal') {
    const said = [end.refusal?.category, end.refusal?.explanation].filter(Boolean).join(': ')
    return `the model refused to go on${said ? ` (${cutLine(said, 300)})` : ''}`
  }
  return undefined
}

/** Stops every running checker (`why`, e.g. the board was paused): each one's step goes on with no verdict. */
export async function haltCheckers($: Host, why: string) {
  await haltCheckersOf($, why, () => true)
}

/** Stops the running checker of task `taskId` (it was dropped, paused or sent to the owner): its step goes on at once with no verdict. */
export async function haltChecker($: Host, taskId: string, why: string) {
  await haltCheckersOf($, why, task => task === taskId)
}

async function haltCheckersOf($: Host, why: string, which: (task: string) => boolean) {
  for (const [agentId, run] of [...checkerRuns]) {
    if (!which(run.task)) continue
    await halt($, agentId, why)
    run.end({ answer: null, why })
  }
}
