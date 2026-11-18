import type { SymccTask, SymccMode, SymccTokens } from '../../types'
import { type Board, type BoardTask, type RoleDef, roleSection, mayStart, orphanMove, liveWorkersFor, modeOf, symccOn, ready, patchTask, putTask, find, startRun, findRole, roleOf, workerName, workerDescription, onNotReady, endRun, tryLabel, needFilesQuestion, onConflict, MAX_CONFLICT_TRIES, DEFAULT_AUTO_RETRIES, onTestFail, reviewTask, ownerEditedLine, gitNote, intoOf, goneBranchQuestion, goneBranchOptions, setMode, modeText, setEnabled, liveDriver, emptyBoard, leftoverTmpFiles, ownedHere, backToTodo, stoppedLine, cutLine, reportFile, reportText, endedBy, withEnd, finishedNote, inPlan, finishingNow, mergedThisTry, mergedDone, handedBack, addCommits, FINISH_BEAT_MS, finishLimitMs, ranOverNote, ranOverBefore, waitsForFiles, blockerFiles, asBlockers, waitFilesNote, stillBlocks, timeLimitOf, hardCapOf, overtimeQuestion, OVERTIME_OPTIONS, OVERTIME_NOTE, WRAP_UP_TEXT, WRAP_UP_GRACE_MS, parseOvertimeAnswer, outOfTimeNote, checkerOn, docsOnly, checkerOutput, isCheckerOutput, checkerRetryText, kindOf, isInvestigation, kindSection, ANSWER_MAX_CHARS, addTask, taskReports, investigationDone, keepNoteTask, ASK_TOOL, ASK_LINE, noteFilesInUse, askedMore, ANSWERED, fillPrompt, shortSha, secretsLeftText, needsReview, testsWithChangesOf, untestedChange, untestedText, gaveUpTestsText } from '../board'
import { archiveOld } from './archive'
import { checkHealth } from './health'
import { gitReady, branchExists, homeBranch, prepareWorktree, removeWorktree, git, worktreeDir, cleanupMerged, taskWork, resetScratch, taskBranch, copyReports } from './git'
import { publish } from './lead'
import { type CheckResult, checkAndMerge, recordCommits, ownerEdits, alreadyMerged } from './review'
import { loadRoles } from './roles'
import { runChecker, haltCheckers, checkerName, CHECKER_NOTE } from './checker'
import { loadKinds } from './kinds'
import { S, workers, starting, queuedWorkers, type Worker, notReady, checkerNotReady, heard, finishing, approving, stopped, scoutRuns, checkerRuns, scoutState, leadQueue, meanwhile, sayQueue, tmpWarned, reminded, timers } from './state'
import { type Host, type HostAgent, type HostAgentStarted, ENDED_STATUSES, agentState, notReadyYet } from '../host'
import { startAgent, cancelStarts, startCancelled, QUEUED_NOTE } from './starts'
import { load, change, now, path, safeWrite, aboutToWait } from './store'
import { tellLead, noteForLead } from './tell'
import { sayDone, sayNeedsYou } from './voice'
import { changeValues, investigationValues } from './prompt-values'

// ---------------- workers ----------------

/** The prompt a worker on task `t` is started with: its kind's built-in prompt with the placeholders filled in for this task.
 *  The role's checklist goes in {{role}}, with its own placeholders filled in from the same values. */
export const WORKER_PROMPT = (t: BoardTask, b: Board, dir: string, role?: RoleDef) => {
  const kind = isInvestigation(t) ? 'investigation' : 'change'
  const values = kind === 'investigation' ? investigationValues(t, dir) : changeValues(t, b, dir)
  return fillPrompt(kind, { ...values, role: roleSection(role, values, S.W.roleTools) })
}

export async function pump(host: Host) {
  if (!S.startupDone) return // session.start hasn't finished; it pumps itself at its end
  if (!S.driving) return // another session drives the board and starts its work
  if (inPlan(S.plan)) return // plan mode: nothing starts; workers already running keep going
  const b = await load(host)
  if (modeOf(b) === 'off' || !symccOn(b)) return
  if (!ready(b).length) return
  if (!(await gitReady(host, b))) return // no git, no repo or no commit yet: nothing starts until it is set up
  const failed = (id: string) => async (err: Error) => {
    await change(host, x => patchTask(x, id, { status: 'failed', note: `couldn't start: ${err.message.slice(0, 200)}`, ...endedBy(find(x, id), now(), 'stopped', "couldn't start") }, now()))
    tellLead(host, `${id} couldn't start: ${err.message.slice(0, 300)}`)
  }
  // Each task is made ready and claimed in turn; their starts then wait in the queue together (see plugin/starts.ts),
  // so one wake-up starts them all. A worker still in the queue counts as running (it is in `starting`).
  const queued: Promise<void>[] = []
  for (const t of ready(b)) {
    if (workers.size + starting.size >= b.max_parallel) break
    if (starting.has(t.id) || checkingNow(t.id) || [...workers.values()].some(w => w.task === t.id)) continue
    const q = await queueWorker(host, t.id).catch(async (err: Error) => (await failed(t.id)(err), null))
    if (q) queued.push(q.started.catch(failed(t.id)))
  }
  await Promise.all(queued)
}

/**
 * Starts a worker on task `id`, but only if it is still "todo" and no live agent works on it
 * (see mayStart). The claim happens inside change(), so two starts can't both win. Settles once the worker
 * started (it waits in the start queue meanwhile, see plugin/starts.ts).
 */
export async function startWorker(host: Host, id: string) {
  const q = await queueWorker(host, id)
  await q?.started
}

/**
 * startWorker up to the queue: prepares task `id`'s folder, claims the task ("doing", noted as starting at the next
 * turn) and queues its worker's start. Null when it doesn't start; else `started` settles once the worker started
 * (or rejects: the start failed for good). The task stays in `starting` until then.
 */
async function queueWorker(host: Host, id: string): Promise<{ started: Promise<void> } | null> {
  // Not while its last try is still being checked (it was resumed or retried meanwhile): it starts when the check ends.
  if (starting.has(id) || checkingNow(id) || [...workers.values()].some(w => w.task === id)) return null
  starting.add(id)
  onPurpose.delete(id) // a new try: an old stop on purpose is over
  let queued = false
  try {
    const listed = await agentsNow(host)
    if (!listed) return null // can't see which agents run; try again on the next pump
    // An agent this copy stopped (an orphan, see stopOrphans) doesn't hold its task any more, even
    // while it stays listed: every tool it tries is refused, so a fresh worker may start (sendBackIdle
    // sent its task back to todo for exactly that).
    const agents = [...listed, ...knownWorkers()].filter(a => !stopped.has(a.id))
    const b = await load(host)
    const t0 = find(b, id)
    if (!mayStart(t0, agents.map(agentState), S.N.name)) return null
    // Its last try's work is already on the branch it merges into (e.g. a reload sent it back, or
    // the owner retried it after it was wrongly failed): it is done, not tried again.
    if (await mergedBeforeStart(host, t0!)) return null
    // the branch it merges into is gone: it waits for the owner instead of failing
    if (await waitIfBranchGone(host, b, t0!, 'start')) return null
    const { dir, branch } = await prepareWorktree(host, t0!, intoOf(t0!))
    // the earlier answers its details name (a keep-note task's reports) are read inside its own folder
    await copyReports(host, t0!, dir).catch(() => [])
    const roles = await loadRoles(host)
    // the kind files are read again too, so the prompt has the kind's description as it is now
    await loadKinds(host).catch(() => undefined)
    const t = await change(host, x => {
      const cur = find(x, id)
      if (!mayStart(cur, agents.map(agentState), S.N.name)) return [x, null]
      const at = now()
      const y = patchTask(x, id, { status: 'doing', session: S.me, attempts: cur!.attempts + 1, branch, note: QUEUED_NOTE, runs: startRun(cur!.runs, at, !!cur!.merge_main) }, at)
      return [y, find(y, id)!]
    })
    if (!t) return null
    const before = find(b, id)!
    const role = findRole(roles, roleOf(t))
    // Right before it starts, the task must still be this try's (not dropped, paused, changed or sent back meanwhile)
    // and symcc still on; a stop while it waits takes it out of the queue at once (see haltWorkers).
    const still = async () => {
      if (!S.enabledNow) return false
      const cur = find(await load(host), id)
      return cur?.status === 'doing' && cur.session === S.me && cur.attempts === t.attempts
    }
    const spawn = startAgent(host, { kind: 'worker', prompt: WORKER_PROMPT(t, b, dir, role), name: workerName(S.N.name, t.id), description: workerDescription(t.title), ...(role?.tools ? { tools: role.tools } : {}), cwd: dir, ...(role?.model ? { model: role.model } : {}) }, still)
    queued = true
    queuedWorkers.set(id, { task: id, worktree: dir, branch, since: Date.now() })
    return { started: workerStarted(host, id, before, dir, branch, spawn).finally(() => (starting.delete(id), queuedWorkers.delete(id))) }
  } finally {
    if (!queued) starting.delete(id)
  }
}

/** Task `id`'s queued worker (`spawn`, see queueWorker) started, or didn't: it is recorded on the task, or the task is put back as it was (`before`). */
async function workerStarted(host: Host, id: string, before: BoardTask, dir: string, branch: string, spawn: Promise<HostAgentStarted>) {
  let agentId: string
  try {
    const spawned = await spawn
    if (!spawned.agentId) throw new Error('the worker did not start')
    agentId = spawned.agentId
  } catch (err) {
    // taken back before it started (its task was stopped, dropped, paused or changed meanwhile): nothing failed
    if (startCancelled(err)) return
    const misses = notReady.get(id) ?? 0
    if (!notReadyYet(err) || onNotReady(misses) === 'fail') {
      notReady.delete(id)
      throw err
    }
    // Not the task's fault: the worker type isn't there yet (e.g. just after a reload).
    // Put the task back as it was, with no try counted; the next pump or check tries again.
    notReady.set(id, misses + 1)
    await change(host, x =>
      find(x, id)?.status === 'doing' && find(x, id)?.session === S.me
        ? patchTask(x, id, { status: 'todo', session: before.session, attempts: before.attempts, branch: before.branch, note: before.note, runs: before.runs }, now())
        : x,
    )
    return
  }
  notReady.delete(id)
  workers.set(agentId, { task: id, worktree: dir, branch, since: Date.now() })
  // Record which agent works on the task, so a reloaded copy can find it; the note says it runs now.
  await change(host, x => (find(x, id)?.status === 'doing' ? patchTask(x, id, { agent: agentId, ...(find(x, id)!.note === QUEUED_NOTE ? { note: 'worker on it' } : {}) }, now()) : x))
}

/**
 * Whether todo task `t`'s last try's work is already on the branch it merges into (see mergedThisTry
 * and alreadyMerged), whatever ended that try (a reload, a timeout, a retry): then it is marked done
 * here, and the lead is told, instead of starting a new try.
 */
async function mergedBeforeStart(host: Host, t: BoardTask): Promise<boolean> {
  if (!(t.attempts > 0)) return false
  const sha = mergedThisTry(t) ?? (await alreadyMerged(host, t).catch(() => null))
  if (!sha) return false
  const done = await change(host, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== 'todo' || cur.attempts !== t.attempts) return [x, false] as [Board, boolean]
    return [putTask(x, mergedDone(cur, sha, 'tried again', now())), true] as [Board, boolean]
  })
  if (done) tellLead(host, `✓ ${t.id} "${t.title}" is done: its work (${tryLabel(t)}) was already merged into ${intoOf(t)} (${shortSha(sha)}), so no new try starts.`)
  return done
}

/**
 * When the branch task `t` merges into (intoOf) no longer exists, the task waits for the owner with
 * a question ("branch feature-x is gone: merge into main instead?"; main is the branch checked out
 * now, see homeBranch) instead of failing, and the lead is told. `when`: the task was about to start,
 * or its work was about to be merged. Returns whether the branch is gone (then nothing else happens).
 * Written only while the task is still as it was (same status and try).
 */
export async function waitIfBranchGone(host: Host, b: Board, t: SymccTask, when: 'start' | 'merge'): Promise<boolean> {
  const into = intoOf(t)
  if (await branchExists(host, into)) return false
  const instead = await homeBranch(host)
  const question = goneBranchQuestion(into, instead)
  const options = goneBranchOptions(into, instead)
  const asked = await change(host, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts) return [x, false] as [Board, boolean]
    const line = `${when === 'start' ? 'not started' : 'not merged'}: branch ${into} is gone; asked the owner whether to merge into ${instead} instead`
    return [patchTask(x, t.id, { status: 'waiting', question, options, merge_wait: undefined, note: 'waiting for you', history: [...cur.history, line], ...endedBy(cur, now(), 'asked', `branch ${into} is gone`) }, now()), true] as [Board, boolean]
  })
  if (asked) {
    sayNeedsYou(host, b, t, question)
    tellLead(host, `${t.id} "${t.title}" ${when === 'start' ? "can't start" : "can't be merged"}: the branch it merges into, ${into}, is gone. It now waits for the owner: ${question} An answer of yes moves it to ${instead}; or ${S.N.name} change ${t.id} with merge_into set to an existing branch.`)
    await publish(host, await load(host))
  }
  return true
}

/** The agents of this session as host.agents.list() reports them; null if the list can't be read. */
export async function agentsNow(host: Host): Promise<HostAgent[] | null> {
  return host.agents.list().catch(() => null)
}

/** The workers this copy of the plugin started, as agents (they may not be listed yet). */
export const knownWorkers = (): HostAgent[] => [...workers].map(([id, w]) => ({ id, kind: 'worker', status: 'running', description: w.task }))

/** How long a reload waits for old workers it stopped to really end. */
export const ORPHAN_WAIT_MS = 20_000

/** Waits up to `ms` until the agents `ids` have ended; returns those still alive (all of them if the list can't be read). */
export async function waitEnded(host: Host, ids: string[], ms: number): Promise<HostAgent[]> {
  if (!ids.length) return []
  const until = Date.now() + ms
  // The time waited is also counted in host.clock sleeps, so the wait ends on host.clock's time too (not only the wall clock's).
  for (let waited = 0; ; waited += 500) {
    const agents = await agentsNow(host)
    const alive = agents ? agents.filter(a => ids.includes(a.id) && !ENDED_STATUSES.includes(a.status)) : ids.map((id): HostAgent => ({ id, kind: 'worker', status: 'running' }))
    if (!alive.length || waited >= ms || Date.now() > until) return alive
    aboutToWait()
    await host.clock.sleep(500)
  }
}

/** Why a worker's turn ended (from turn.complete): answered, stopped, refused (with what the API said) or an API error. */
export type TurnEnd = { reason: TurnEndReason; refusal?: TurnRefusal }
/** Why a turn ended: the model answered, it was interrupted, the model refused, or an error ended it. */
export type TurnEndReason = 'answer' | 'aborted' | 'refusal' | 'error'
/** What was said about a refusal that ended a turn: its category and explanation, each null when none was given. */
export type TurnRefusal = { category: string | null; explanation: string | null }

/** A worker's hand-back `answer` arrived; `end`: why its turn ended. */
export async function workerFinished(host: Host, agentId: string, answer: string, end: TurnEnd = { reason: 'answer' }, tokens?: SymccTokens) {
  const w = workers.get(agentId)
  if (!w) return
  workers.delete(agentId)
  const at = now()
  heard.workers[w.task] = at
  heard.last = { what: `${w.task} worker report`, at }
  finishing.add(w.task)
  let beat: { cancel(): void } | null = null
  let tryNo: number | undefined
  let limitMs = finishLimitMs(0)
  try {
    // The try ends now (checking and merging is not counted). The turn result gives tokens but
    // no dollar cost, so `cost` stays empty until Claude Code reports one.
    // The task is marked as being tested and merged (refreshed while that runs), so a reloaded
    // copy of the plugin sees it and doesn't send the task back to "todo" meanwhile.
    const ended = now()
    tryNo = await change(host, x => {
      const t = find(x, w.task)
      if (t?.status !== 'doing') return [x, undefined] as [Board, undefined]
      limitMs = finishLimitMs(x.test_commands.length)
      return [patchTask(x, w.task, { finishing: ended, ...(t.runs?.length ? { runs: endRun(t.runs, ended, { tokens }) } : {}) }, ended), t.attempts] as [Board, number]
    })
    if (tryNo !== undefined) beat = everyMs(host, FINISH_BEAT_MS, () => void markFinishing(host, w.task, tryNo!).catch(() => undefined))
    // The whole step has a time limit (finishLimitMs: it grows with the test commands): the heartbeat above keeps going even when
    // the step hangs, so without it a stuck step would keep its task "doing" forever. Past the limit
    // the step is given up: it may still wake up later, but then it writes nothing (gaveUp).
    const how = await withLimit(host, tryNo === undefined ? null : limitMs, (gaveUp, over, turn) => finishWork(host, agentId, w, answer, end, gaveUp, over, turn))
    if (how === OVER) {
      beat?.cancel()
      beat = null
      finishing.delete(w.task)
      await finishRanOver(host, w.task, tryNo!, limitMs)
    }
  } finally {
    beat?.cancel()
    if (tryNo !== undefined) await markFinishing(host, w.task, tryNo, false).catch(() => undefined)
    finishing.delete(w.task)
    await endCheck(host, w.task)
  }
  await pump(host)
}

/** What withLimit gives back when the step ran over its limit. */
const OVER = Symbol('over')

/**
 * Runs a checking and merging step (`run`) under its time limit of `ms` (none when null; see
 * stepLimit). `run` gets `gaveUp` (whether the step was given up), `over` (settles when it is) and
 * `turn` (stepLimit's, only with a limit). Returns the step's result, or OVER when it ran over: then
 * the step is left to end on its own, its errors ignored.
 */
async function withLimit<T>(host: Host, ms: number | null, run: (gaveUp: () => boolean, over: Promise<unknown>, turn?: (go: boolean) => void) => Promise<T>): Promise<T | typeof OVER> {
  let gaveUp = false
  let letGo = () => {}
  const over = new Promise<typeof OVER>(r => (letGo = () => r(OVER)))
  const limit = ms === null ? null : stepLimit(host, ms, () => ((gaveUp = true), letGo()))
  const step = run(() => gaveUp, over, limit?.turn)
  const how = limit?.on ? await Promise.race([step, over]) : await step
  limit?.cancel()
  if (how === OVER) step.catch(() => undefined)
  return how
}

/**
 * The time limit of a checking and merging step: `over` runs once, `ms` after the start (`on`: false
 * when this Claude Code has no timer). `turn(false)` stops the clock while the step waits in line for
 * its merge turn (the merge in front has its own limit); `turn(true)` starts it again from zero when
 * the step's own go begins (see checkAndMerge), so only the task's own work counts.
 */
function stepLimit(host: Host, ms: number, over: () => void) {
  let fired = false
  const fire = () => void (fired || ((fired = true), over()))
  let timer = afterMs(host, ms, fire)
  const on = timer !== null
  const cancel = () => void (timer?.cancel(), (timer = null))
  return { on, cancel, turn: (go: boolean) => void (cancel(), go && on && !fired && (timer = afterMs(host, ms, fire))) }
}

/** A one-time timer, if this Claude Code has one (host.clock.after); null when it has none. */
function afterMs(host: Host, ms: number, f: () => void): { cancel(): void } | null {
  try {
    return host.clock.after(ms, f) ?? null
  } catch {
    return null
  }
}

/**
 * Task `id`'s checking and merging (of try `tryNo`) ran over its limit (`limitMs`, see finishLimitMs)
 * and was given up: while it is still "doing" on that try, it goes back to "todo" for a fresh try
 * (its folder and branch are kept), or is done when its work already reached its branch. When its
 * try before was given up the same way, it is failed instead, so it never loops. The lead is told once.
 */
async function finishRanOver(host: Host, id: string, tryNo: number, limitMs: number) {
  const min = Math.round(limitMs / 60_000)
  const still = (t: BoardTask | undefined): t is BoardTask => t?.status === 'doing' && t.attempts === tryNo
  const before = find(await load(host).catch(() => null) ?? emptyBoard(), id)
  if (!still(before)) return
  const sha = mergedThisTry(before) ?? (S.gitState === 'ok' ? await alreadyMerged(host, before).catch(() => null) : null)
  const twice = `its checking and merging ran over ${min} min twice in a row and was given up both times; nothing was merged`
  const out = await change(host, x => {
    const cur = find(x, id)
    if (!still(cur)) return [x, null] as [Board, null]
    const again = !sha && ranOverBefore(cur)
    const next = sha ? mergedDone(cur, sha, `sent back to todo (its checking and merging ran over ${min} min)`, now()) : again ? ranOverFailed(cur, twice, `its checking and merging ran over ${min} min again`) : backToTodo(cur, `restarted: ${ranOverNote(min)}`, now())
    return [putTask(x, next), { t: cur, again }] as [Board, { t: BoardTask; again: boolean }]
  })
  if (!out) return
  const { t, again } = out
  if (sha) tellLead(host, `✓ ${id} "${t.title}" is done: its checking and merging ran over ${min} minutes, but its work was already merged (${shortSha(sha)}).`)
  else if (again) tellLead(host, `✗ ${id} "${t.title}" failed: its checking and merging ran over ${min} minutes twice in a row and was given up both times, so no new try starts. Its folder and branch are kept. Look at why the test commands are so slow or hang, then ${S.N.name} retry ${id}.`)
  else tellLead(host, `${id} "${t.title}": its checking and merging ran over ${min} minutes and seemed stuck, so I stopped waiting for it and sent it back to todo for a fresh try (its folder and branch are kept). Nothing to do unless it gets stuck again.`)
}

/** Task `t` failed with `note`, its running try ended as stopped (`end`): its checking and merging was given up a second time in a row. */
function ranOverFailed(t: BoardTask, note: string, end: string): BoardTask {
  const { session: _s, finishing: _f, checking: _c, ...rest } = t
  return { ...rest, status: 'failed' as const, note, updated_at: now(), history: [...(t.history ?? []), `${tryLabel(t)}: ${note}`], ...endedBy(t, now(), 'stopped', end) }
}

/** A given-up step of task `t` ended late: when its work reached the branch anyway (`merged`, or else alreadyMerged), landedLate marks it done. */
async function landIfMerged(host: Host, t: SymccTask, merged: string | undefined, made: readonly string[], kind: 'finish' | 'approve' | 'merge', status: SymccTask['status']) {
  const sha = merged ?? (S.gitState === 'ok' ? await alreadyMerged(host, t).catch(() => null) : null)
  if (sha) await landedLate(host, t, sha, made, kind, status)
}

/**
 * A step of task `t` that was given up as stuck (`kind`: a finished worker's check, an approve or a
 * merge waiting for the owner's files) ended late, and its work reached the branch it merges into
 * (`sha`). While the task is still as the give-up left it (the same try, not yet started again:
 * "doing", "todo" or "failed" for a finish, still `status` for an approve or merge), it is done with
 * that commit and the step's commits (`made`) are recorded. Otherwise the lead is told the work landed,
 * so they can decide. The lead is told once either way.
 */
async function landedLate(host: Host, t: SymccTask, sha: string, made: readonly string[], kind: 'finish' | 'approve' | 'merge', status: SymccTask['status']) {
  const fits = (cur: BoardTask) => cur.attempts === t.attempts && (kind === 'finish' ? ['doing', 'todo', 'failed'].includes(cur.status) : cur.status === status)
  const short = shortSha(sha)
  const into = intoOf(t)
  const r = await change(host, x => {
    const cur = find(x, t.id)
    if (!cur || !fits(cur)) return [x, { done: false, cur }] as [Board, { done: boolean; cur?: BoardTask }]
    const next = mergedDone({ ...cur, runs: addCommits(cur.runs, [...made, sha]) }, sha, 'left as given up', now())
    const line = `${tryLabel(cur)}: its checking and merging was given up as stuck, but it ended late and its work was merged into ${into} (${short}), so it is done`
    return [putTask(x, { ...next, history: [...(cur.history ?? []), line] }), { done: true, cur }] as [Board, { done: boolean; cur?: BoardTask }]
  }).catch((e: Error) => {
    tellLead(host, `${t.id} "${t.title}": its given-up checking and merging ended late and its work was merged into ${into} (${short}), but the board could not be updated (${e.message.slice(0, 200)}).`)
    return null
  })
  if (!r) return
  if (r.done) {
    tellLead(host, `✓ ${t.id} "${t.title}" is done after all: its checking and merging was given up as stuck, but it ended late and its work was merged into ${into} (${short}).`)
    if (await removeWorktree(host, t.id, worktreeDir(t.id)).catch(() => false)) await git(host, ['branch', '-d', taskBranch(t)]).catch(() => undefined)
    void pump(host)
    return
  }
  if (r.cur?.status === 'done' && r.cur.merged) return // already found merged (or merged again) and told
  const now_ = r.cur ? `it is now ${r.cur.status}${r.cur.attempts !== t.attempts ? `, on try ${r.cur.attempts}` : ''}` : 'it is no longer on the board'
  tellLead(host, `${t.id} "${t.title}": its checking and merging (${tryLabel(t)}) was given up as stuck, but it ended late and its work was merged into ${into} (${short}) after all. The task moved on meanwhile (${now_}), so I left it as it is: decide whether it is done (then drop the new try) or still needs work.`)
}

/** A repeating timer, if this Claude Code has one (host.clock.every); null when it has none. */
function everyMs(host: Host, ms: number, f: () => void): { cancel(): void } | null {
  try {
    return host.clock.every(ms, f)
  } catch {
    return null
  }
}

/** Refreshes (`on`) or removes task `id`'s "being tested and merged" mark and its check step (BoardTask.checking), only while it is still "doing" with try `tryNo`. */
async function markFinishing(host: Host, id: string, tryNo: number, on = true) {
  // nothing to remove (the task already left "doing", which drops the mark): don't write the board
  if (!on && !hasMark(find(await load(host), id))) return
  await change(host, x => {
    const t = find(x, id)
    if (t?.status !== 'doing' || t.attempts !== tryNo || (!on && !hasMark(t))) return x
    const at = now()
    return patchTask(x, id, on ? { finishing: at, ...(t.checking ? { checking: { ...t.checking, at } } : {}) } : { finishing: undefined, checking: undefined }, t.updated_at)
  })
}
const hasMark = (t: BoardTask | undefined) => !!(t?.finishing || t?.checking)

/** Refreshes (`on`) or removes the check step of task `id` (an approve or a merge waiting for files), only while it is still `status` with try `tryNo`. */
async function markChecking(host: Host, id: string, status: SymccTask['status'], tryNo: number, on = true) {
  if (!find(await load(host), id)?.checking) return
  await change(host, x => {
    const t = find(x, id)
    if (!t?.checking || t.status !== status || t.attempts !== tryNo) return x
    return patchTask(x, id, { checking: on ? { ...t.checking, at: now() } : undefined }, t.updated_at)
  })
}

/**
 * A worker's report arrived but this copy of the plugin doesn't track the agent (it reloaded and
 * hadn't found the worker again yet): when the board still has the agent's task "doing" for this
 * session, the report is taken as that worker's, so its work is still checked and merged.
 */
export async function lateHandBack(host: Host, agentId: string): Promise<boolean> {
  if (workers.has(agentId) || stopped.has(agentId) || scoutRuns.has(agentId) || checkerRuns.has(agentId)) return false
  const b = await load(host).catch(() => null)
  const t = b?.tasks.find(x => x.agent === agentId)
  // A task whose worker already handed back (handedBack) is being, or was, checked: not taken again.
  if (!t || t.status !== 'doing' || t.session !== S.me || finishing.has(t.id) || starting.has(t.id) || handedBack(t)) return false
  if ([...workers.values()].some(w => w.task === t.id)) return false
  const started = Date.parse(t.runs?.[t.runs.length - 1]?.started ?? '')
  workers.set(agentId, { task: t.id, worktree: worktreeDir(t.id), branch: taskBranch(t), since: Number.isFinite(started) ? started : Date.now() })
  return true
}

/** The worker behind `agentId`: from memory, or (after a plugin reload) picked back up from the board by lateHandBack. Undefined when it can't be found. */
export async function workerOf(host: Host, agentId: string): Promise<Worker | undefined> {
  if (!workers.has(agentId)) await lateHandBack(host, agentId).catch(() => false)
  return workers.get(agentId)
}

// ---------------- a task changed while its work is checked ----------------
// After a worker finishes, its task stays "doing" while the scope check, the tests and the merge
// run (finishWork; for approve, the task stays "review"). The lead can drop, pause or ask about it
// meanwhile: those write the new status at once, mark the task here, and leave its folder alone
// until the check ends (endCheck). The check then stops before the merge (gated), and settle
// keeps the new status. A change of the task during the check is refused (see tools.ts).

/** Tasks dropped, paused or sent to the owner while their work was being checked: task id → what happened. */
export const stopAsked = new Map<string, string>()

/** Tasks whose check was stopped because symcc or the board was turned off: task id → why (e.g. "symcc was turned off"). */
export const offAsked = new Map<string, string>()

/**
 * Symcc or the board was turned off (`why`): every check and merge running now stops before the
 * merge. A finishing task goes back to "todo" at once (its files are kept); an approve in progress
 * stays in review. Tasks already stopped another way are left alone. Returns the ids of both kinds.
 */
export async function stopChecks(host: Host, why: string): Promise<{ back: string[]; review: string[] }> {
  const back: string[] = []
  const review: string[] = []
  for (const id of [...finishing, ...approving]) {
    if (stopAsked.has(id) || back.includes(id) || review.includes(id)) continue
    const kind = await change(host, x => {
      const cur = find(x, id)
      if ((cur?.status === 'review' || cur?.status === 'waiting') && approving.has(id)) return [x, 'review'] as [Board, string]
      if (cur?.status !== 'doing' || !finishing.has(id)) return [x, null] as [Board, null]
      const y = patchTask(x, id, { status: 'todo', note: `stopped: ${why} while its work was being checked; nothing merged, continues when it is on again`, history: [...cur.history, stoppedLine(cur, `${why} while its work was being checked; nothing merged, its files are kept`)], ...endedBy(cur, now(), 'stopped', `${why} while its work was being checked`) }, now())
      return [y, 'back'] as [Board, string]
    })
    if (!kind) continue
    stopAsked.set(id, `stopped because ${why}`)
    offAsked.set(id, why)
    ;(kind === 'back' ? back : review).push(id)
  }
  return { back, review }
}

/** The part of an off reply that names the checks it stopped (empty when there were none). */
export function stoppedChecksText(s: { back: string[]; review: string[] }): string {
  const out: string[] = []
  if (s.back.length) out.push(`${s.back.join(', ')} ${s.back.length === 1 ? 'was' : 'were'} being tested and merged and went back to todo`)
  if (s.review.length) out.push(`${s.review.join(', ')} ${s.review.length === 1 ? 'was' : 'were'} already merging and stayed in review`)
  return out.length ? `${out.join('; ')} (if a merge had already happened, that task is done)` : ''
}

/** Whether task `id`'s finished work is being checked and merged right now. */
export const checkingNow = (id: string) => finishing.has(id) || approving.has(id)

/** The words the lead's tools use when a task they stop is being checked. */
export const CHECKING_TEXT = (id: string) => `${id} is being tested and merged`

/** Whether the owner's approve of task `id` is merging it right now: drop, reject, retry, change and ask refuse it meanwhile. */
export const mergingNow = (id: string) => approving.has(id)

/** What those tools answer while task `id` is being approved and merged. */
export const MERGING_TEXT = (id: string) => `${id} is being merged; wait a moment`

/** The check of task `id` has ended: forget a stop asked meanwhile, and remove the folder of a task dropped meanwhile. */
export async function endCheck(host: Host, id: string) {
  offAsked.delete(id)
  if (!stopAsked.has(id)) return
  stopAsked.delete(id)
  try {
    if (find(await load(host), id)?.status === 'dropped') await removeWorktree(host, id, worktreeDir(id))
  } catch {
    // the regular check removes leftover folders of dropped tasks (cleanupMerged)
  }
}

/**
 * Patches task `t` (read fresh, inside the change) only if it is still the same try: the same
 * status and try number as when its check began. Returns null when written, else the task as the
 * board has it now ('gone' when it is not on the board any more), and nothing is written.
 */
async function writeIfSame(host: Host, t: SymccTask, patch: (cur: SymccTask) => Partial<BoardTask>): Promise<SymccTask | 'gone' | null> {
  return change<SymccTask | 'gone' | null>(host, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, 'gone']
    if (cur.status !== t.status || cur.attempts !== t.attempts) return [x, cur]
    return [patchTask(x, t.id, patch(cur), now()), null]
  })
}

/**
 * Task `t` was dropped, paused or sent to the owner while its work was checked (result `r`).
 * Its new status and history are kept and `line` is added to them; but when the merge already
 * happened, it is done, with a line saying the stop came too late.
 */
async function changedMeanwhile(host: Host, t: SymccTask, b: Board, r: CheckResult, line: string, worktree: string, agentId?: string) {
  const merged = r.ok && !r.review && !!r.merged
  const off = offAsked.get(t.id)
  const was = await change(host, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, null] as [Board, null]
    const late = off ? `${off} while it was being merged, too late` : `it was ${cur.status} while being merged, too late`
    const y = merged
      ? patchTask(x, t.id, { status: 'done', note: off ? `merged; ${off} too late to stop it` : `merged; it was ${cur.status} too late to stop it`, merge_main: false, test_output: undefined, ...(r.notes?.length ? { research_notes: r.notes } : {}), history: [...cur.history, line, `${tryLabel(t)}: ${late}: the work was already merged, so it stays done`], ...(cur.attempts === t.attempts && cur.runs?.length ? { runs: withEnd(cur.runs, 'finished', 'merged', true) } : {}) }, now())
      : patchTask(x, t.id, { history: [...cur.history, `${line} (not used: ${off ?? `the task was ${cur.status} meanwhile`})`] }, now())
    return [y, cur.status] as [Board, string]
  })
  if (!was) return
  if (!merged) {
    tellLead(host, off ? `${t.id} "${t.title}" was stopped while its work was being checked (${off}); nothing was merged and it is ${was} again, its files kept.` : `${t.id} "${t.title}" was ${was} while its work was being checked; nothing was merged and it stays ${was}.`)
    return
  }
  if (off) {
    sayDone(host, b, t.id)
    if (await removeWorktree(host, t.id, worktree, agentId, true).catch(() => false)) await git(host, ['branch', '-d', taskBranch(t)])
    tellLead(host, `✓ ${t.id} "${t.title}" is merged: ${off} too late, after the merge had already happened, so it is done.`)
    return
  }
  sayDone(host, b, t.id)
  if (await removeWorktree(host, t.id, worktree, agentId, true).catch(() => false)) await git(host, ['branch', '-d', taskBranch(t)])
  tellLead(host, `✓ ${t.id} "${t.title}" is merged: it was ${was} too late, after the merge had already happened, so it is done.`)
}

/** Why a try whose turn ended on an API error or a refusal failed: "the worker's turn ended on an error", or "the model refused: <its explanation>". */
export function endFailure(end: TurnEnd): string {
  if (end.reason === 'error') return "the worker's turn ended on an error (retries used up or the context limit)"
  const said = [end.refusal?.category, end.refusal?.explanation].filter(Boolean).join(': ')
  return `the model refused to go on${said ? ` (${cutLine(said, 300)})` : ''}`
}

/** " (not AskUserQuestion: ...)" after "numbered plain chat text", with the host's pop-up question tool; '' when it has none. */
const notAskPopup = () => (S.W.askPopup ? ` (not ${S.W.askPopup}: its dialog stays open if they answer on the board)` : '')

/** What the lead is told when a worker asked a question (ask_owner) and its task now waits for the owner. */
export const workerQuestionText = (id: string, question: string, options?: readonly string[]) =>
  `${id} is waiting for the owner: ${question}${/[.?!]$/.test(question) ? '' : '.'}${options?.length ? ` Options: ${options.join(' | ')}.` : ''} Answer it yourself only if the owner already clearly said the answer: then ${S.N.name} change ${id} with answer: that answer, and tell the owner what you answered. Otherwise ask the owner in the chat now, plain and short${options?.length ? `, offering the options as numbered plain chat text${notAskPopup()}, plus "or answer on the board"` : ', and say they can also answer on the board'}; put their answer into the task with ${S.N.name} change ${id} and answer: their words. If they answer on the board first (a "Meanwhile" line), don't ask again.`

/** Whether a report that could not be saved was already told (once per session, so it never floods). */
let reportWarned = false

/**
 * Saves try `t.attempts`'s full final answer to <dir>/reports/<id>-try-<N>.md (through a temp file
 * and a rename, cut at REPORT_MAX_CHARS) and puts its path on the try's run. A failure is told
 * once and never stops the task.
 */
export async function saveReport(host: Host, t: SymccTask, answer: string) {
  if (!answer.trim()) return
  const rel = reportFile(S.N.dir, t.id, t.attempts)
  try {
    await host.run(['mkdir', '-p', path(`${S.N.dir}/reports`)])
    await safeWrite(host, path(rel), reportText(answer), 'the report')
    await change(host, x => {
      const cur = find(x, t.id)
      if (!cur?.runs?.length || cur.attempts !== t.attempts) return x
      const runs = [...cur.runs]
      runs[runs.length - 1] = { ...runs[runs.length - 1]!, report: rel }
      return patchTask(x, t.id, { runs }, now())
    })
  } catch (e) {
    if (reportWarned) return
    reportWarned = true
    const msg = `${t.id}: could not save the worker's report to ${rel} (${(e as Error).message.slice(0, 200)}); the task goes on. Later reports that fail are not told again.`
    host.ui.toast(S.N.toast(msg))
    tellLead(host, msg)
  }
}

/**
 * `gaveUp`: whether workerFinished gave this step up as stuck (it ran over its limit, see finishLimitMs): from
 * then on it merges nothing and writes no outcome. `release` settles at that moment (see mergeTurn).
 * `turn`: stops and restarts its time limit around the merge turn (see checkAndMerge).
 * What happens is decided from what the try recorded on the board (try_question, try_refused) and why its turn ended, never from the hand-back's text (which
 * stays its report, an investigation's answer), in this order: a question (ask_owner) → waiting with it; edits refused
 * as outside the task's files → waiting for those files (nothing merged, even with half-done edits); stopped → failed;
 * an API error or a refusal → failed with the reason; else done: checked and merged (an investigation: its answer).
 */
export async function finishWork(host: Host, agentId: string, w: Pick<Worker, 'task' | 'worktree' | 'branch'>, answer: string, end: TurnEnd = { reason: 'answer' }, gaveUp: () => boolean = () => false, release?: Promise<unknown>, turn?: (go: boolean) => void) {
  const b = await load(host)
  const t = find(b, w.task)
  if (!t || t.status !== 'doing') return // changed or dropped meanwhile
  await saveReport(host, t, answer)
  const summary = cutLine(answer, 600) || '(no summary)'
  // Its time was up: what it handed back is its report; the task fails with its work kept, nothing is merged.
  if (t.wrap_up) {
    const limit = timeLimitOf(b.max_minutes, t)
    // An investigation's hand-back is its answer so far: it still goes to review for the owner to read.
    if (isInvestigation(t)) {
      if (gaveUp()) return
      await answered(host, t, answer, summary, limit)
      return
    }
    if (await writeIfSame(host, t, cur => ({ status: 'failed', note: outOfTimeNote(limit), history: [...cur.history, `${tryLabel(t)}: out of time; handed back: ${cutLine(summary, 300)} (its work so far is kept in its folder and branch)`], ...endedBy(cur, now(), 'timed out', `ran over ${limit} min`) }))) return
    tellLead(host, `${t.id} "${t.title}": its time (${limit} minutes) was up, so its worker wrote down what it had and handed back, and the task failed. Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${t.id}); a retry (${S.N.name} retry) continues from there. Or split it, or drop it.`)
    return
  }
  const q = t.try_question
  const need = isInvestigation(t) ? [] : (t.try_refused ?? [])
  if (q) {
    // Straight to the owner: the task waits with the question; their answer sends it back to work.
    const { question, options } = q
    if (await writeIfSame(host, t, cur => ({ status: 'waiting', question: question.slice(0, 1000), ...(options ? { options } : {}), note: 'waiting for you', history: [...cur.history, `${tryLabel(t)}: worker asked: ${question}`], ...endedBy(cur, now(), 'asked', 'question') }))) return
    sayNeedsYou(host, b, t, question)
    tellLead(host, workerQuestionText(t.id, question, options))
  } else if (need.length) {
    const question = needFilesQuestion(t.id, need)
    if (await writeIfSame(host, t, cur => ({ status: 'waiting', question: question.slice(0, 1000), asked_files: need, note: 'waiting for you', history: [...cur.history, `${tryLabel(t)}: worker asked for more files: ${need.join(', ')}`], ...endedBy(cur, now(), 'asked', 'files outside its list') }))) return
    sayNeedsYou(host, b, t, question)
    tellLead(host, `${question}\nThe task now waits for the owner, who can allow the files from the board (Allow on its page). If they agree here instead, ${S.N.name} change ${t.id} with the wider files (that sends it back to work; what the worker already changed is kept). Otherwise ${S.N.name} drop it, or change it to a narrower plan that fits its files.`)
  } else if (end.reason === 'aborted') {
    if (await writeIfSame(host, t, cur => ({ status: 'failed', note: 'the worker was stopped', history: [...cur.history, `${tryLabel(t)}: stopped before finishing`], ...endedBy(cur, now(), 'stopped', 'stopped from Claude Code') }))) return
    tellLead(host, `${t.id} "${t.title}": the worker was stopped before finishing.`)
  } else if (end.reason === 'error' || end.reason === 'refusal') {
    const why = endFailure(end)
    if (await writeIfSame(host, t, cur => ({ status: 'failed', note: why, history: [...cur.history, `${tryLabel(t)}: ${why}; nothing was checked or merged`], ...endedBy(cur, now(), 'stopped', why) }))) return
    tellLead(host, `${t.id} "${t.title}": ${why}, so nothing was checked or merged and the task failed. Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${t.id}); ${S.N.name} retry ${t.id} starts a fresh try that continues from there. Or change, split or drop it.`)
  } else if (isInvestigation(t)) {
    if (gaveUp()) return
    await answered(host, t, answer, summary)
  } else {
    if (gaveUp() || (await waitIfBranchGone(host, b, t, 'merge'))) return
    await change(host, x => (find(x, t.id)?.status === 'doing' && !gaveUp() ? patchTask(x, t.id, { note: 'checking and merging' }, now()) : x))
    const made: string[] = []
    const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
    // The checker setting: a change that is not docs only is held before it merges (or goes to review), and a checker tries to break it first.
    const hold = checkerOn(b) ? (changed: readonly string[]) => !docsOnly(changed) : undefined
    let r: CheckResult = await checkAndMerge(host, t, w.worktree, b, 'finish', made, stop, false, release, turn, hold).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    if (r.ok && r.held && !gaveUp() && !stop()) r = await afterChecker(host, t, b, r, w.worktree, made, stop, release, turn)
    await finishTail(host, t, b, r, made, summary, w.worktree, agentId, gaveUp)
  }
}

/** The end of a finished try's check (finishWork, or a checker started again after a reload): its commits recorded and its outcome `r` written. */
async function finishTail(host: Host, t: SymccTask, b: Board, r: CheckResult, made: string[], summary: string, worktree: string, agentId: string | undefined, gaveUp: () => boolean) {
  // Given up meanwhile: the task was already sent back (or found merged); this late outcome is not
  // written over it, unless the work reached the branch after all (landedLate).
  if (gaveUp()) {
    await landIfMerged(host, t, r.merged, made, 'finish', 'doing')
    return
  }
  await recordCommits(host, t.id, made, r.merged)
  if (r.blocked) await holdForFiles(host, t, b, r, `${tryLabel(t)}: ${cutLine(summary, 300)} → ${r.detail}`, worktree, agentId)
  else
    await settle(host, t, b, r, summary, worktree, agentId).catch(async (e: unknown) => {
      // Merged, but the outcome could not be written: the work is on its branch, so it still ends done.
      if (!r.ok || r.review || !r.merged || !(await doneAfterMerge(host, t, r.merged).catch(() => false))) throw e
    })
}

/**
 * T-386: tasks whose checker was lost to a reload. After a reload the old copy's checker is stopped as an
 * orphan (stopOrphans), and its answer never reaches the step that waited for it, so the task would stay
 * "doing" in its checker step with nobody on it. Such a task (this session's, its worker handed back, its
 * note the checker's, and no checker of this copy and no live, not stopped checker agent on it, see
 * `agents`) gets a new checker on the same branch commit: its work is committed and its tests passed already.
 * This is not a new try (no retry is counted). The lead is told once per restart.
 */
export async function restartCheckers(host: Host, agents: HostAgent[]) {
  const b = await load(host).catch(() => null)
  if (!b || !symccOn(b)) return
  const live = liveDriver(await host.fs.read(path(S.N.leadFile)).catch(() => null), Date.now())
  const running = new Set([...checkerRuns.values()].map(r => r.task))
  const checkerAlive = (id: string) => agents.some(a => a.name === checkerName(S.N.name, id) && !stopped.has(a.id) && !ENDED_STATUSES.includes(a.status))
  const lost = b.tasks.filter(t => t.status === 'doing' && t.note === CHECKER_NOTE && handedBack(t) && ownedHere(t, S.me, live) && !finishing.has(t.id) && !approving.has(t.id) && !starting.has(t.id) && !running.has(t.id) && !onPurpose.has(t.id) && ![...workers.values()].some(w => w.task === t.id) && !checkerAlive(t.id))
  for (const t of lost) void checkAgain(host, t).catch(() => undefined)
}

/**
 * Starts task `t0`'s checker again (see restartCheckers), with the same finishing mark, heartbeat and time limit
 * as a worker's hand-back (workerFinished). When its folder can't be read, the task goes back to "todo"
 * instead (its branch is kept, so the next try goes on from there and the merge path runs again).
 */
async function checkAgain(host: Host, t0: BoardTask) {
  const id = t0.id
  const tryNo = t0.attempts
  if (finishing.has(id)) return
  // taken at once (before any wait), so a regular check meanwhile doesn't send it back or start it twice
  finishing.add(id)
  let beat: { cancel(): void } | null = null
  try {
    const b = await load(host)
    const t = find(b, id)
    if (!t || !sameTry(t, t0) || t.note !== CHECKER_NOTE) return
    // The checker may have said OK already and the work reached its branch before the reload (a symcc task's
    // merge reloads the plugin): then it is done, as sendBackIdle would have made it, and no new checker starts.
    const sha = mergedThisTry(t) ?? (S.gitState === 'ok' ? await alreadyMerged(host, t).catch(() => null) : null)
    if (sha) {
      const done = await change(host, x => {
        const cur = find(x, id)
        return cur && cur.status === 'doing' && sameTry(cur, t0) ? ([putTask(x, mergedDone(cur, sha, 'checked again', now())), true] as [Board, boolean]) : ([x, false] as [Board, boolean])
      })
      if (done) tellLead(host, `✓ ${id} is done: its work was already merged (${shortSha(sha)}) when the plugin reloaded.`)
      return
    }
    const dir = worktreeDir(id)
    const head = await git(host, ['rev-parse', '-q', '--verify', 'HEAD'], dir).catch(() => null)
    if (!head || head.exitCode !== 0 || !head.stdout.trim()) {
      const note = "restarted: its checker stopped when the plugin reloaded, and its folder couldn't be read to start it again"
      const back = await change(host, x => {
        const cur = find(x, id)
        return cur && sameTry(cur, t0) ? ([putTask(x, backToTodo(cur, note, now())), true] as [Board, boolean]) : ([x, false] as [Board, boolean])
      })
      if (back) tellLead(host, `${id} "${t.title}": its checker stopped when the plugin reloaded and could not be started again (its folder couldn't be read), so it goes back to todo; the next try goes on from the same branch. This is not counted as a retry.`)
      return
    }
    await markFinishing(host, id, tryNo).catch(() => undefined)
    beat = everyMs(host, FINISH_BEAT_MS, () => void markFinishing(host, id, tryNo).catch(() => undefined))
    // told once: a start tried again because the agent type wasn't loaded yet is the same restart
    if (!checkerNotReady.has(id)) tellLead(host, `${id} "${t.title}": its checker stopped when the plugin reloaded, so I started a new checker on the same work (its tests had passed). This is not counted as a retry; nothing to do.`)
    const limitMs = finishLimitMs(b.test_commands.length)
    const how = await withLimit(host, limitMs, (gaveUp, over, turn) => checkHeldAgain(host, t, b, dir, gaveUp, over, turn))
    if (how === OVER) {
      beat?.cancel()
      beat = null
      finishing.delete(id)
      await finishRanOver(host, id, tryNo, limitMs)
    }
  } finally {
    beat?.cancel()
    await markFinishing(host, id, tryNo, false).catch(() => undefined)
    finishing.delete(id)
    await endCheck(host, id)
  }
  await pump(host)
}

/** The checker step of task `t` (in folder `dir`) run again: its work was held for a checker after its checks passed (see afterChecker). */
async function checkHeldAgain(host: Host, t: SymccTask, b: Board, dir: string, gaveUp: () => boolean, release: Promise<unknown>, turn?: (go: boolean) => void) {
  const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
  // what checkAndMerge said when it held the work: to review or not, and the tests_with_changes flag
  const names = await git(host, ['diff', '--name-only', '--no-renames', '-z', `refs/heads/${intoOf(t)}...HEAD`], dir).catch(() => null)
  const changed = names && names.exitCode === 0 ? names.stdout.split('\0').filter(Boolean) : []
  const flag = testsWithChangesOf(b)
  const untested = flag !== 'off' && untestedChange(changed) ? untestedText(t.id) : ''
  const tests = b.test_commands.length ? '; tests passed' : '; no test command set'
  const held: CheckResult = { ok: true, held: true, ...(needsReview(b, t) || (untested && flag === 'review') ? { review: true } : {}), ...(untested ? { untested } : {}), detail: `checks passed${tests}; the checker looks at it before it merges` }
  const made: string[] = []
  const r = stop() ? { ok: false, detail: `not merged: the task was ${stop()} while it was being checked` } : await afterChecker(host, t, b, held, dir, made, stop, release, turn, true)
  // the checker's agent type isn't loaded yet (just after a reload): the task stays "doing" in its checker step, and the next check starts it again (restartCheckers)
  if (r.again) return
  await finishTail(host, t, b, r, made, await reportSummary(host, t), dir, t.agent, gaveUp)
}

/** The worker's report of task `t`'s current try, cut short (from its report file), for the history line. */
async function reportSummary(host: Host, t: SymccTask): Promise<string> {
  const rel = t.runs?.at(-1)?.report
  const text = rel ? await host.fs.read(path(rel)).catch(() => '') : ''
  return cutLine(text, 600) || '(no summary)'
}

/**
 * Task `t`'s finished work passed its checks and was held for the checker (`r.held`): a checker tries to break it
 * (runChecker; the step's time limit stops meanwhile, the checker has its own). OK: it goes on as without the checker,
 * to review (`r.review`) or merged now (its tests run again only if its branch moved). Problems: a result like
 * failing tests, with the checker's report, so settle sends it back to its worker (counting a retry) or fails it.
 * No verdict (the checker was stopped, ran over its time or didn't start): it waits for the owner's review.
 */
async function afterChecker(host: Host, t: SymccTask, b: Board, r: CheckResult, dir: string, made: string[], stop: () => string | undefined, release?: Promise<unknown>, turn?: (go: boolean) => void, restarted = false): Promise<CheckResult & { again?: boolean }> {
  // the try's commits are saved now, before the checker runs: a reload meanwhile loses `made`, and the checker step started again (checkHeldAgain) only knows the board
  await recordCommits(host, t.id, made)
  turn?.(false)
  // `restarted` (a checker started again after a reload): a start that fails only because the agent type isn't
  // loaded yet is tried again at the next check, up to MAX_NOT_READY starts; after that it goes to review as below
  const tryLater = () => {
    const misses = checkerNotReady.get(t.id) ?? 0
    if (onNotReady(misses) === 'fail') return false
    checkerNotReady.set(t.id, misses + 1)
    return true
  }
  const c = await runChecker(host, t, b, dir, stop, restarted ? tryLater : undefined)
  turn?.(true)
  if (c.again) return { ok: false, again: true, detail: `the checker couldn't start yet (${c.why}); tried again at the next check` }
  checkerNotReady.delete(t.id)
  const { held: _held, ...passed } = r
  if (c.verdict?.ok) {
    if (passed.review) return passed
    return checkAndMerge(host, t, dir, b, 'merge', made, stop, false, release, turn).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
  }
  if (c.verdict && 'report' in c.verdict) return { ok: false, checker: true, detail: `the checker found problems: ${cutLine(c.verdict.report, 300)}`, testOutput: checkerOutput(c.verdict.report) }
  const why = stop()
  if (why) return { ok: false, detail: `not merged: the task was ${why} while it was being checked` }
  const noVerdict = `the checker gave no verdict (${c.why ?? 'no answer'})`
  return { ...passed, review: true, noVerdict, detail: `checks passed, but ${noVerdict}; ready for review, nothing merged yet` }
}

/** The note of an investigation that was answered and waits for the owner to read it. */
export const ANSWERED_NOTE = 'answered; waiting for you to read it'
/** The note of an investigation whose time ran out: what it handed back is its answer so far. */
export const ANSWERED_LATE_NOTE = 'answered (time ran out); waiting for you to read it'

/**
 * Investigation `t`'s worker handed back `answer`: nothing is committed, tested or merged. The answer is
 * kept on the task (cut to ANSWER_MAX_CHARS; the full text is in the report file) and the task waits in
 * review for the owner to read it, in every board mode. Its folder stays as it is for now. `limit`: set when
 * its time ran out (it was told to wrap up), so the answer is only what it had so far.
 */
async function answered(host: Host, t: SymccTask, answer: string, summary: string, limit?: number) {
  const text = answer.trim() || '(no answer)'
  const kept = text.length > ANSWER_MAX_CHARS ? `${text.slice(0, ANSWER_MAX_CHARS - 1)}…` : text
  const late = limit !== undefined
  if (await writeIfSame(host, t, cur => ({ status: 'review', note: late ? ANSWERED_LATE_NOTE : ANSWERED_NOTE, answer: kept, merge_main: false, test_output: undefined, time_ask: undefined, wrap_up: undefined, history: [...cur.history, `${tryLabel(t)}: answered${late ? ` (time ran out after ${limit} min)` : ''}: ${cutLine(summary, 300)}`], ...endedBy(cur, now(), late ? 'timed out' : 'finished', late ? `${ANSWERED}; ran over ${limit} min` : finishedNote({ ok: true, detail: '', answered: true })) }))) return
  tellLead(host, `${t.id} "${t.title}" is answered${late ? ` (its time of ${limit} minutes ran out, so this is its answer so far)` : ''} and waits for the owner to read it (nothing was committed, tested or merged). The answer is on the task (${S.N.name} board task ${t.id}, with the full report). Tell the owner it is ready to read. Then, on the owner's word: ${S.N.name} approve ${t.id} is Done (it ends, nothing merged); ${S.N.name} approve ${t.id} with keep_note: true is Keep as a note (also adds a docs task that writes the answer to docs/research/); ${S.N.name} reject ${t.id} with their follow-up question is Ask more (a fresh try).`)
}

/**
 * Task `t`'s try merged `sha`, but settle could not write that: it is marked done now (unless it
 * already is), whatever happened to it meanwhile. Returns whether the board says done afterwards.
 */
async function doneAfterMerge(host: Host, t: SymccTask, sha: string): Promise<boolean> {
  const done = await change(host, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, false] as [Board, boolean]
    if (cur.status === 'done') return [x, true] as [Board, boolean]
    return [putTask(x, mergedDone({ ...cur, runs: addCommits(cur.runs, [sha]) }, sha, 'marked done', now())), true] as [Board, boolean]
  })
  if (done) tellLead(host, `✓ ${t.id} "${t.title}" merged into ${intoOf(t)} (${shortSha(sha)}); it is done.`)
  return done
}

/**
 * Task `t`'s finished work passed its checks, but the owner's files on the branch it merges into
 * are in the way of the merge (`r.blocked`, nothing moved): it waits with merge_wait and a note
 * naming the files ("waiting" after a worker's try; a task in review stays in review). No worker is
 * needed again: the regular check, a retry or an approve only merges it once they are out of the
 * way. The lead is told the first time only (not when it already waited for files). `line` goes
 * into its history that first time. Written only while the task is still as it was.
 */
async function holdForFiles(host: Host, t: SymccTask, b: Board, r: CheckResult, line: string, worktree: string, agentId?: string, quiet = false) {
  const files = r.blocked!
  const note = waitFilesNote(intoOf(t), files)
  const res = await change<SymccTask | 'gone' | boolean>(host, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, 'gone']
    if (cur.status !== t.status || cur.attempts !== t.attempts) return [x, cur]
    const first = !waitsForFiles(cur)
    const status = cur.status === 'review' ? 'review' : 'waiting'
    const y = patchTask(x, t.id, { status, merge_wait: files, note, ...(first ? { history: [...cur.history, line] } : {}), ...endedBy(cur, now(), 'finished', 'waiting for your files') }, now())
    return [y, first]
  })
  if (res === 'gone') return
  if (typeof res !== 'boolean') return changedMeanwhile(host, t, b, r, line, worktree, agentId)
  if (!res) return
  const text = `${t.id} "${t.title}" passed its checks, but its merge into ${intoOf(t)} waits for the owner's files there (${note.replace(/^waiting for your files on \S+: /, '')}). It merges on its own at the next regular check once they are out of the way, with no new worker; ${S.N.name} retry ${t.id} merges it at once. Tell the owner.`
  if (quiet) noteForLead(text)
  else tellLead(host, text)
}

/**
 * The regular check's part for tasks whose finished work waits only for the owner's files
 * (BoardTask.merge_wait): each one whose files are out of the way now (or whose branch is not
 * checked out any more) is merged again, with no worker (see mergeWaiting). Not in mode off.
 */
export async function retryFileWaits(host: Host) {
  const b = await load(host)
  if (modeOf(b) === 'off') return
  const waiting = b.tasks.filter(t => waitsForFiles(t) && !checkingNow(t.id))
  let current: string | null = null
  let status: string | null = null
  for (const t of waiting) {
    current ??= (await git(host, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
    if (current === intoOf(t)) {
      if (status === null) {
        const st = await git(host, ['status', '--porcelain', '-z', '--untracked-files=all', '--ignored=matching'])
        if (st.exitCode !== 0) return
        status = st.stdout
      }
      if (stillBlocks(status, blockerFiles(asBlockers(t.merge_wait)!), S.N.dir)) continue
    }
    await mergeWaiting(host, t.id).catch(() => undefined)
    // that merge may have changed the owner's files: look again for the next one
    current = null
    status = null
  }
}

/**
 * What happens to task `t` after its work was checked (`r`): back to "todo" for a new try after
 * a conflict or failing tests (while it has tries left), "review" when it waits for the owner,
 * else "done" (merged) or "failed". `summary` is what the worker (or the owner, on approve) said.
 * The lead is told only the outcome: the worker's own report already reached it as the agent's hand-back.
 * A merge the owner approved (`approved`) wakes nobody: it waits as a "Meanwhile" line.
 */
export async function settle(host: Host, t: SymccTask, b: Board, r: CheckResult, summary: string, worktree: string, agentId?: string, approved = false) {
  const line = `${tryLabel(t)}: ${cutLine(summary, 300)} → ${r.detail}`
  // Every write below reads the task again and is skipped when it was dropped, paused or changed meanwhile.
  // A finished worker's try ends with the check's outcome (an approve is not a try: its task is in review, so nothing is set).
  const write = async (patch: (cur: SymccTask) => Partial<SymccTask>) => {
    const moved = await writeIfSame(host, t, cur => ({ ...patch(cur), ...endedBy(cur, now(), 'finished', finishedNote(r)) }))
    if (moved && moved !== 'gone') await changedMeanwhile(host, t, b, r, line, worktree, agentId)
    return !moved
  }
  if (r.ask) {
    // The change was only files whose names look like secrets (see checkAndMerge): nothing merged, the task waits for the owner.
    const ask = r.ask
    const moved = await writeIfSame(host, t, cur => ({ status: 'waiting', question: ask.slice(0, 1000), note: 'waiting for you', merge_main: false, test_output: undefined, history: [...cur.history, line], ...endedBy(cur, now(), 'asked', 'only secret-looking files') }))
    if (moved) {
      if (moved !== 'gone') await changedMeanwhile(host, t, b, r, line, worktree, agentId)
      return
    }
    sayNeedsYou(host, b, t, ask)
    tellLead(host, `${ask} The task now waits for the owner. Ask them in the chat, plain and short (they can also answer on the board); put their answer into the task with ${S.N.name} change ${t.id} with answer: their words, or ${S.N.name} drop ${t.id}.`)
    return
  }
  if (r.review) {
    if (!(await write(cur => ({ status: 'review', note: `ready for review: ${r.noVerdict ? `the tests passed, but ${r.noVerdict}` : 'the checks passed'}, nothing merged yet${r.untested ? ` (${r.untested})` : ''}`, merge_main: false, test_output: undefined, history: [...cur.history, line] })))) return
    tellLead(host, `${r.noVerdict ? `${t.id}: ${r.noVerdict}. ` : ''}${r.untested ? `${r.untested}. ` : ''}${r.secrets?.length ? `${t.id}: ${secretsLeftText(r.secrets)}. ` : ''}${t.id} "${t.title}" is ready for review. The change is on branch ${taskBranch(t)} (folder ${S.N.dir}/worktrees/${t.id}). Show the owner what changed; then ${S.N.name} approve ${t.id} merges it, or ${S.N.name} reject ${t.id} with a reason sends it back to a fresh worker. The owner may also edit the files in that folder first; approve then commits those edits with the task and runs the tests again.`)
    return
  }
  const tries = t.conflict_tries ?? 0
  if (r.conflict && onConflict(t) === 'retry') {
    // Don't fail yet: a new worker merges main into the branch and resolves the conflicts.
    const note = `conflicts with the latest ${intoOf(t)}; a new try will merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES})`
    if (!(await write(cur => ({ status: 'todo', note, conflict_tries: tries + 1, merge_main: true, history: [...cur.history, line] })))) return
    tellLead(host, `${t.id} "${t.title}" conflicts with the latest ${intoOf(t)}; starting a new try to merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES}).`)
    return
  }
  const retries = b.auto_retries ?? DEFAULT_AUTO_RETRIES
  const testTries = t.test_tries ?? 0
  if (r.testOutput !== undefined && onTestFail(t, retries) === 'retry') {
    // Don't fail yet: a new worker gets the failing test output (or the checker's report) and fixes it.
    const note = `${r.checker ? 'the checker found problems' : 'tests failed'}; a new try will fix them (${testTries + 1} of ${retries})`
    if (!(await write(cur => ({ status: 'todo', note, test_tries: testTries + 1, test_output: r.testOutput, merge_main: false, history: [...cur.history, line] })))) return
    tellLead(host, `${t.id} "${t.title}" ${r.checker ? 'was sent back by the checker' : 'failed its tests'}; retrying on its own (${testTries + 1} of ${retries}). Nothing to do.`)
    return
  }
  const detail = r.conflict ? `conflicts with the latest ${intoOf(t)}, still after ${tries} tries to merge it in` : r.detail
  const done = `${tryLabel(t)}: ${cutLine(summary, 300)} → ${detail}`
  if (!(await write(cur => ({ status: r.ok ? 'done' : 'failed', note: detail.slice(0, 300), merge_main: false, test_output: r.testOutput, history: [...cur.history, done], ...(r.ok && r.notes?.length ? { research_notes: r.notes } : {}), ...(r.ok && cur.status === 'waiting' && cur.attempts === t.attempts && cur.runs?.length ? { runs: withEnd(cur.runs, 'finished', 'merged', true) } : {}) })))) return
  if (r.ok) sayDone(host, b, t.id)
  // Merged: its folder goes, then its branch (-d: git refuses if it isn't merged, so nothing is lost).
  if (r.ok && (await removeWorktree(host, t.id, worktree, agentId, true))) await git(host, ['branch', '-d', taskBranch(t)])
  const gaveUp = r.testOutput !== undefined ? `\nIt already had ${testTries} automatic ${testTries === 1 ? 'retry' : 'retries'}. ${r.checker ? `The checker's report:\n${r.testOutput.replace(/^[^\n]*\n/, '')}` : `The last test run: ${gaveUpTestsText(r.testOutput)}`}` : ''
  if (r.ok && approved) return noteForLead(`✓ ${t.id} "${t.title}" ${r.detail}.`)
  tellLead(host, r.ok ? `✓ ${t.id} "${t.title}" ${r.detail}.${r.untested ? ` ${r.untested}: add a test task, or ask the owner.` : ''}` : `✗ ${t.id} "${t.title}" was not merged: ${detail}${gaveUp}`)
}

/**
 * The owner approved task `id` (in "review"): the same checked merge as for a finished worker. An answered
 * investigation has nothing to merge: approve is its Done (see endInvestigation), and `keepNote` its Keep as a note.
 */
export async function approve(host: Host, id: string, keepNote = false): Promise<string> {
  const b = await load(host)
  const t = reviewTask(b, id, 'approve')
  if (isInvestigation(t)) return endInvestigation(host, t, keepNote)
  if (keepNote) throw new Error(`${t.id} is a change task: keep_note is only for an answered investigation. Approve it without keep_note to merge it.`)
  return mergeFinished(host, b, t, 'approve')
}

/** The full answer of investigation `t`: its latest saved report (and that file), else the answer kept on the task. */
export async function fullAnswer(host: Host, t: BoardTask): Promise<{ text: string; file?: string }> {
  const last = taskReports(t).at(-1)
  const text = last ? await host.fs.read(path(last.file)).then(x => String(x), () => null) : null
  return text?.trim() ? { text: text.trim(), file: last!.file } : { text: t.answer?.trim() ?? '', ...(last ? { file: last.file } : {}) }
}

/** Every try's report file of `t` (oldest first), with `latest` (the one the full answer was read from) too. */
const everyReport = (t: BoardTask, latest?: string): string[] => [...new Set([...taskReports(t).sort((a, b) => a.try - b.try).map(r => r.file), ...(latest ? [latest] : [])])]

/**
 * Done on answered investigation `t`: it ends done (note "answered"), nothing merged. Its folder's uncommitted
 * changes are its own scratch edits (a switch to an investigation is refused while the folder holds a change
 * try's work), so they are thrown away, and the folder is removed. Its branch is deleted too (with -D), unless it has
 * commits its target branch doesn't have (from an earlier change try): then it is kept and the lead is told. With `keepNote` (Keep as a
 * note) a new small docs task is added too, made by the owner as a follow-up of `t`, that writes
 * docs/research/<topic>.md from the saved answer and merges as usual.
 */
async function endInvestigation(host: Host, t: BoardTask, keepNote: boolean): Promise<string> {
  const full = keepNote ? await fullAnswer(host, t) : { text: '' }
  const merge_into = keepNote ? await homeBranch(host) : undefined
  // notes already written: a new note never overwrites one (it gets -2, -3… instead)
  const notes = keepNote ? (await Promise.resolve().then(() => host.fs.list(path('docs/research'))).catch(() => [])).map(f => `docs/research/${f.name}`) : []
  const added = await change(host, x => {
    if (!keepNote) return [investigationDone(x, t.id, now()), undefined] as [Board, BoardTask | undefined]
    const [y, n] = addTask(x, { ...keepNoteTask(find(x, t.id) ?? t, full.text, everyReport(find(x, t.id) ?? t, full.file), [...notes, ...noteFilesInUse(x)]), merge_into }, now(), S.N.dir)
    return [investigationDone(y, t.id, now(), n.id), n] as [Board, BoardTask | undefined]
  })
  const branch = taskBranch(t)
  await resetScratch(host, t.id).catch(() => undefined)
  const { commits } = await taskWork(host, t).catch(() => ({ commits: null }))
  const keep = commits !== 0
  const what = commits === null ? `git could not tell whether it has commits ${intoOf(t)} doesn't have` : `it has ${commits} commit${commits === 1 ? '' : 's'} from an earlier change try that ${intoOf(t)} doesn't have`
  const kept = keep ? ` Its branch ${branch} was kept: ${what}. Delete it by hand once that work is not needed.` : ''
  if ((await removeWorktree(host, t.id, worktreeDir(t.id)).catch(() => false)) && !keep) await git(host, ['branch', '-D', branch])
  if (kept) tellLead(host, `${t.id} "${t.title}" is done.${kept}`)
  void pump(host)
  if (!added) return `${t.id} done: the answer was read; nothing was merged${kept ? `.${kept}` : ''}`
  return `${t.id} done: the answer was read; nothing was merged. Added ${added.id} "${added.title}": it writes ${added.files[0]} from the answer and merges as usual${kept ? `.${kept}` : ''}`
}

/**
 * Task `id`'s finished work waits only for the owner's files (BoardTask.merge_wait): only the merge
 * step runs again, with no worker (brought up to date, tested only if its branch moved, then
 * merged). A task in review (an approve that was blocked) is approved again.
 */
export async function mergeWaiting(host: Host, id: string): Promise<string> {
  const b = await load(host)
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (!waitsForFiles(t)) return `${t.id} is not waiting for your files`
  return mergeFinished(host, b, t, t.status === 'review' ? 'approve' : 'merge')
}

/**
 * Merges task `t`'s finished work: `kind` 'approve' (the owner approved it, in "review") or 'merge'
 * (it was "waiting" only for the owner's files). The same checked merge as for a finished worker.
 */
async function mergeFinished(host: Host, b: Board, t: SymccTask, kind: 'approve' | 'merge'): Promise<string> {
  const stays = kind === 'approve' ? 'stays in review' : 'keeps waiting'
  if (approving.has(t.id)) return `${t.id} is already being merged`
  if (!(await gitReady(host, b))) return `${t.id} ${stays}: ${gitNote(S.gitState)}`
  if (await waitIfBranchGone(host, b, t, 'merge')) return `${t.id} was not merged: the branch it merges into, ${intoOf(t)}, is gone; it now waits for your answer`
  approving.add(t.id)
  // The same time limit as a finished worker's check (finishLimitMs): past it the merge is
  // given up (mergeRanOver), so it no longer holds the task, its id or the branch's merge turn.
  // It may still wake up later, but then it merges nothing and writes nothing (gaveUp).
  const limitMs = finishLimitMs(b.test_commands.length)
  // The step shown on the board (BoardTask.checking) is refreshed like a finishing mark, and removed when the merge ends or is given up.
  const beat = everyMs(host, FINISH_BEAT_MS, () => void markChecking(host, t.id, t.status, t.attempts).catch(() => undefined))
  try {
    const how = await withLimit(host, limitMs, (gaveUp, over, turn) => mergeWork(host, t, b, kind, gaveUp, over, turn))
    if (how !== OVER) return how
    beat?.cancel()
    await markChecking(host, t.id, t.status, t.attempts, false).catch(() => undefined)
    approving.delete(t.id)
    await endCheck(host, t.id)
    const out = await mergeRanOver(host, t.id, t.status, kind, limitMs)
    void pump(host)
    return out
  } finally {
    beat?.cancel()
    await markChecking(host, t.id, t.status, t.attempts, false).catch(() => undefined)
  }
}

/**
 * The merge of task `id` (an approve, or a merge waiting for the owner's files) ran over
 * its limit (`limitMs`, see finishLimitMs) and was given up: while it is still `status` it stays
 * there, with a note and a history line saying so; the lead is told once. A merge waiting for the
 * owner's files (`kind` 'merge') keeps its merge_wait: it still waits for them, merges on its own
 * once they are clear, and a retry only merges it. But when its merge before was given up the same
 * way (mergeRanOverBefore), it is failed instead, so the regular check never starts it again on
 * its own; the lead is told once. Should it still land later, landedLate marks it done.
 */
async function mergeRanOver(host: Host, id: string, status: SymccTask['status'], kind: 'approve' | 'merge', limitMs: number): Promise<string> {
  const min = Math.round(limitMs / 60_000)
  const again = kind === 'approve' ? 'approve it again' : `${S.N.name} retry ${id}`
  const what = kind === 'approve' ? 'approved by the owner' : 'merging once your files were out of the way'
  const twice = `its merge ran over ${min} min twice in a row and was given up both times; nothing was merged`
  let secondTime = false
  const t = await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== status) return [x, null] as [Board, null]
    secondTime = kind === 'merge' && mergeRanOverBefore(cur)
    if (secondTime) return [patchTask(x, id, { status: 'failed', note: twice, history: [...cur.history, `${tryLabel(cur)}: ${what} → ${twice}`] }, now()), cur] as [Board, BoardTask]
    const y = patchTask(x, id, { note: `${kind === 'approve' ? 'approved, but the' : 'the'} merge ran over ${min} min and was given up; ${again}`, ...(kind === 'approve' ? { merge_wait: undefined } : {}), history: [...cur.history, `${tryLabel(cur)}: ${what} → its checking and merging ran over ${min} min and was given up; nothing written, it stays ${STATUS_WORD_OF(status)}`] }, now())
    return [y, cur] as [Board, BoardTask]
  }).catch(() => null)
  const late = t ? null : find(await load(host).catch(() => null) ?? emptyBoard(), id)
  if (late?.status === 'done' && late.merged) return `${id} is done: its checking and merging ran over ${min} minutes, but its work was merged into ${intoOf(late)} (${shortSha(late.merged)}) after all.`
  if (kind === 'approve') {
    if (t) tellLead(host, `${id} "${t.title}": the owner's approve ran over ${min} minutes and seemed stuck, so I stopped waiting for it. It stays in review; approve it again to retry the merge.`)
    return `${id} was not merged and stays in review: its checking and merging ran over ${min} minutes and was given up. Approve it again.`
  }
  if (secondTime) {
    if (t) tellLead(host, `✗ ${id} "${t.title}" failed: its merge ran over ${min} minutes twice in a row and was given up both times, so it is not started again on its own. Its folder and branch are kept. Look at why the test commands are so slow or hang, then ${S.N.name} retry ${id}.`)
    return `${id} was not merged and failed: its checking and merging ran over ${min} minutes twice in a row and was given up both times.`
  }
  if (t) tellLead(host, `${id} "${t.title}": its merge ran over ${min} minutes and seemed stuck, so I stopped waiting for it. It keeps waiting for the owner's files and merges on its own at the next regular check once they are out of the way; ${S.N.name} retry ${id} tries the merge again at once.`)
  return `${id} was not merged and keeps waiting: its checking and merging ran over ${min} minutes and was given up. Retry it.`
}

/**
 * Whether task `t`'s last merge (waiting for the owner's files) was given up for running over: its
 * last try line says so (a line like "owner edited files before approving", which that merge may
 * add, is skipped).
 */
const mergeRanOverBefore = (t: BoardTask) => /^try [^:]*: merging once your files were out of the way → its checking and merging ran over \d+ min and was given up\b/.test(t.history.findLast(h => /^try \d/.test(h)) ?? '')

/** How a status is said in a history line: "in review", "waiting". */
const STATUS_WORD_OF = (s: SymccTask['status']) => (s === 'review' ? 'in review' : s)

/** The body of mergeFinished, once the task is marked as being merged. `gaveUp`, `release`, `turn`: as for finishWork. */
async function mergeWork(host: Host, t: SymccTask, b: Board, kind: 'approve' | 'merge', gaveUp: () => boolean, release: Promise<unknown>, turn?: (go: boolean) => void): Promise<string> {
  const status = t.status
  const stays = kind === 'approve' ? 'stays in review' : 'keeps waiting'
  const by = kind === 'approve' ? 'approved by the owner' : 'merged once your files were out of the way'
  try {
    const dir = worktreeDir(t.id)
    if (!(await host.fs.exists(`${dir}/.git`))) await prepareWorktree(host, t, intoOf(t))
    // The owner's own edits in the folder since review (or edits whose tests failed on an
    // earlier approve, kept as test_output): those are committed with the task and always tested.
    const edits = await ownerEdits(host, t, dir).catch(() => [] as string[])
    const retest = edits.length > 0 || (kind === 'approve' && t.test_output !== undefined)
    if (gaveUp()) return ''
    await change(host, x => {
      const cur = find(x, t.id)
      if (cur?.status !== status || gaveUp()) return x
      return patchTask(x, t.id, { note: kind === 'approve' ? 'approved; checking and merging' : 'your files are out of the way; merging', ...(edits.length ? { history: [...cur.history, ownerEditedLine(edits)] } : {}) }, now())
    })
    const made: string[] = []
    const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
    const r: CheckResult = await checkAndMerge(host, t, dir, b, kind, made, stop, retest, release, turn).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    // Given up meanwhile: mergeRanOver already wrote its note; this late outcome is not written over
    // it, unless the work reached the branch after all (landedLate).
    if (gaveUp()) {
      await landIfMerged(host, t, r.merged, made, kind, status)
      return ''
    }
    await recordCommits(host, t.id, made, r.merged)
    const cur = find(await load(host), t.id)
    if (r.merged) {
      // The work is on the target branch: the task is done, whatever happened to it meanwhile
      // (settle marks it done; when it changed meanwhile, with a line saying the change came too late).
      const sha = shortSha(r.merged)
      if (!cur) {
        tellLead(host, `${t.id} "${t.title}" was merged into ${intoOf(t)} (${sha}), but it is no longer on the board.`)
        return `${t.id} was merged into ${intoOf(t)} (${sha}), but it is no longer on the board`
      }
      await settle(host, t, b, r, by, dir, undefined, kind === 'approve')
      const off = offAsked.get(t.id)
      if (off && cur.status === status) {
        await change(host, x => {
          const c = find(x, t.id)
          return c?.status === 'done' ? patchTask(x, t.id, { history: [...c.history, `${tryLabel(t)}: ${off} while it was being merged, too late: the work was already merged, so it stays done`] }, now()) : x
        })
        return `${t.id} was merged into ${intoOf(t)} (${sha}) before ${off}; it is done`
      }
      return cur.status === status ? `${t.id} ${kind === 'approve' ? 'approved and merged' : 'merged'}: ${r.detail}` : `${t.id} was merged into ${intoOf(t)} (${sha}) before it was ${cur.status}; it is done`
    }
    if (cur?.status !== status) return `${t.id} changed while it was being merged (it is now ${cur?.status ?? 'gone'}); nothing was merged`
    const off = offAsked.get(t.id)
    if (off) {
      const again = kind === 'approve' ? 'approve it again' : 'it merges at a later check'
      await change(host, x => {
        const c = find(x, t.id)
        return c?.status === status ? patchTask(x, t.id, { note: `${kind === 'approve' ? 'approved, but ' : ''}not merged: ${off} first; ${again}`, history: [...c.history, `${tryLabel(t)}: ${by.replace(/^merged /, 'merging ')} → not merged: ${off} while it was being merged; it ${stays}`] }, now()) : x
      })
      return `${t.id} was not merged and ${stays}: ${off} while it was being merged. ${kind === 'approve' ? 'Approve it again.' : `Retry it, or it merges at a later check.`}`
    }
    if (r.blocked) {
      // Only the owner's files are in the way: it waits for them (merge_wait); the regular check merges it once they are clear.
      await holdForFiles(host, t, b, r, `${tryLabel(t)}: ${kind === 'approve' ? 'approved by the owner' : 'merging again'} → ${r.detail}`, dir, undefined, kind === 'approve')
      return `${t.id} was not merged and ${stays}: ${r.detail}.`
    }
    if (kind === 'approve' && retest && r.testOutput !== undefined) {
      // The owner's edits fail the tests: it stays in review with the output, not sent to a worker.
      const folder = `${S.N.dir}/worktrees/${t.id}`
      await change(host, x => {
        const c = find(x, t.id)
        return c?.status === 'review' ? patchTask(x, t.id, { note: `approved, but your edits fail the tests: ${r.detail.slice(0, 220)}`, merge_wait: undefined, test_output: r.testOutput, history: [...c.history, `${tryLabel(t)}: approved by the owner → not merged, the tests failed after your edits: ${r.detail.slice(0, 250)}`] }, now()) : x
      })
      tellLead(host, `${t.id} "${t.title}" was not merged: with the owner's edits the tests fail. It stays in review; the owner can fix the files in ${folder} and approve again.\n${r.testOutput}`)
      return `${t.id} was not merged and stays in review: ${r.detail}. Fix the files in ${folder}, then approve it again (the tests run again).`
    }
    if (kind === 'approve' && !r.ok && !r.conflict && r.testOutput === undefined) {
      // Not the work's fault (e.g. the owner's files could not be updated): it stays in review.
      await change(host, x => (find(x, t.id)?.status === 'review' ? patchTask(x, t.id, { note: `approved, but not merged: ${r.detail.slice(0, 250)}`, merge_wait: undefined }, now()) : x))
      // An answer that already says to approve again needs no more advice; anything else gets it here.
      return `${t.id} was not merged and stays in review: ${r.detail}${/approve \S+ again$/.test(r.detail) ? '.' : '. Fix that, then approve it again.'}`
    }
    await settle(host, cur, b, r, by, dir)
    const label = kind === 'approve' ? 'approved, but not merged' : 'not merged'
    return r.ok ? `${t.id} ${kind === 'approve' ? 'approved and merged' : 'merged'}: ${r.detail}` : `${t.id} ${label}: ${r.detail}${r.conflict || r.testOutput !== undefined ? ' (see the board for what happens next)' : ''}`
  } finally {
    // Given up: mergeFinished already let go of the id (a new merge may hold it now) and ended the check.
    if (!gaveUp()) {
      approving.delete(t.id)
      await endCheck(host, t.id)
      void pump(host) // after the check: a task sent back to "todo" (or resumed meanwhile) starts again
    }
  }
}

/** Ends an agent's work: from now on every tool it tries is refused, and it is told to stop. */
export async function halt(host: Host, agentId: string, why: string) {
  stopped.add(agentId)
  await host.agents.stop(agentId, `Stop now: ${why}. Don't change anything else; answer "stopped" and end.`).catch(() => undefined)
}

/**
 * Tasks whose worker is being stopped on purpose (pause, drop, ask, change, the board or symcc turned
 * off, ...), with how many regular checks have seen the mark: the one stopping it changes the task's
 * status right after, so meanwhile the regular check must not send it back to todo (sendBackIdle skips
 * it). A mark is gone once the task is no longer "doing", or after one check saw it (the status change
 * then failed: the task is treated as any other again).
 */
export const onPurpose = new Map<string, number>()

/** Ages the stop-on-purpose marks at a regular check (see onPurpose). */
function ageOnPurpose(b: Board) {
  for (const [id, seen] of [...onPurpose]) {
    if (find(b, id)?.status !== 'doing' || seen >= 1) onPurpose.delete(id)
    else onPurpose.set(id, seen + 1)
  }
}

/** Stops the workers `which` picks (all by default), one by one; `then` runs after each is told to stop. */
export async function haltWorkers(host: Host, why: string, which: (w: Worker) => boolean = () => true, then?: (w: Worker) => Promise<unknown>) {
  for (const [agentId, w] of [...workers]) {
    if (!which(w)) continue
    onPurpose.set(w.task, 0)
    workers.delete(agentId)
    await halt(host, agentId, why)
    await then?.(w)
  }
  // the workers still waiting in the start queue are stopped too: taken back out, so they never start
  for (const w of [...queuedWorkers.values()]) {
    if (!which(w)) continue
    onPurpose.set(w.task, 0)
    queuedWorkers.delete(w.task)
    cancelStarts(a => a.kind === 'worker' && a.name === workerName(S.N.name, w.task), why)
    await then?.(w)
  }
}

/** Stops every worker, then every scout run; `then` runs after each worker is told to stop. */
export async function haltAll(host: Host, why: string, then?: (w: Worker) => Promise<unknown>) {
  await haltWorkers(host, why, undefined, then)
  for (const agentId of [...scoutRuns.keys()]) await halt(host, agentId, why)
  scoutRuns.clear()
  for (const s of scoutState.values()) s.running = false
  await haltCheckers(host, why)
  // scouts and checkers still waiting in the start queue never start
  cancelStarts(a => a.kind !== 'worker', why)
}

export async function stopWorker(host: Host, taskId: string, why: string) {
  await haltWorkers(host, why, w => w.task === taskId)
  await publish(host, await load(host))
}

/**
 * Sets the board mode to `m`; `who` is said in the notes of stopped tasks. "off" stops every
 * worker and scout at once (their tasks go back to "todo" and continue when work runs again);
 * "review" or "auto" from "off" starts work again. Going to "auto" does not merge tasks already
 * in review. Returns one short line: the new mode, what it means, and what happened.
 */
export async function setBoardMode(host: Host, m: SymccMode, who: string): Promise<string> {
  const before = modeOf(await load(host))
  const b = await change(host, x => {
    const y = setMode(x, m)
    return [y, y] as [Board, Board]
  })
  const extra: string[] = []
  if (m === 'off') {
    const ids: string[] = []
    await haltAll(host, `${who} turned the board off`, async w => {
      ids.push(w.task)
      await change(host, x => {
        const cur = find(x, w.task)
        return patchTask(x, w.task, { status: 'todo', note: `stopped by ${who}; continues when the board is on again`, ...(cur ? { history: [...cur.history, stoppedLine(cur, `${who} turned the board off`)], ...endedBy(cur, now(), 'stopped', `${who} turned the board off`) } : {}) }, now())
      })
    })
    if (ids.length) extra.push(`stopped ${ids.join(', ')}`)
    const checks = stoppedChecksText(await stopChecks(host, 'the board was turned off'))
    if (checks) extra.push(checks)
    await publish(host, await load(host))
  } else {
    const inReview = b.tasks.filter(t => t.status === 'review').length
    if (m === 'auto' && inReview) extra.push(`${inReview} already in review still ${inReview === 1 ? 'waits' : 'wait'} for approve or reject`)
    if (before === 'off') extra.push('work starts again')
    void pump(host)
  }
  return [modeText(m), ...extra].join('; ')
}

/**
 * Turns the whole plugin on or off (/<name>-on, /<name>-off, the enabled setting). Off: every
 * worker and scout stops (their tasks go back to "todo"), nothing new starts, the lead is not
 * told anything and the lead's guide leaves the system prompt from the next message. The board,
 * its mode, tasks and scouts are kept, so on brings everything back as it was.
 */
export async function setSymcc(host: Host, on: boolean): Promise<string> {
  const before = symccOn(await load(host))
  const b = await change(host, x => {
    const y = setEnabled(x, on)
    return [y, y] as [Board, Board]
  })
  S.enabledNow = on
  if (!on) {
    const ids: string[] = []
    await haltAll(host, `you turned ${S.N.name} off`, async w => {
      ids.push(w.task)
      await change(host, x => patchTask(x, w.task, { status: 'todo', note: `stopped: ${S.N.name} was turned off; continues when it is on again`, ...endedBy(find(x, w.task), now(), 'stopped', `${S.N.name} was turned off`) }, now()))
    })
    const checks = stoppedChecksText(await stopChecks(host, `${S.N.name} was turned off`))
    leadQueue.splice(0)
    meanwhile.splice(0)
    S.leadTimer?.cancel()
    S.leadTimer = null
    sayQueue.splice(0)
    await publish(host, await load(host))
    const stopped = `${ids.length ? ` Stopped ${ids.join(', ')}.` : ''}${checks ? ` ${checks[0]!.toUpperCase()}${checks.slice(1)}.` : ''}`
    return `${S.N.name} is ${before ? 'now ' : ''}off: Claude works as normal from your next message. The board, tasks and scouts are kept.${stopped} Turn it back on with /${S.N.name}-on.`
  }
  await publish(host, b)
  void pump(host)
  if (!before) tellLead(host, `The owner turned ${S.N.name} back on with /${S.N.name}-on. You are the lead again; the board is in mode ${modeOf(b)}.`)
  return `${S.N.name} is ${before ? 'already ' : ''}on, in mode ${modeOf(b)}: ${modeText(modeOf(b))}`
}

export const LIVE = new Set(['pending', 'running', 'waiting'])

/**
 * Stops this plugin's workers and scouts this copy of the plugin doesn't know about. A reload of the
 * plugin forgets which worker belongs to which task while the old workers keep running in the
 * same folders; without this, every reload adds one more worker per running task.
 * A live worker of this session whose task is still "doing" for it is not an orphan: it is
 * tracked again (adopted) and keeps working, so a reload never stops a worker mid-task.
 * Only live agents are messaged: a message to an ended agent would wake it up again.
 */
export async function stopOrphans(host: Host, leadNow?: string | null): Promise<string[]> {
  // Every worker type (worker, worker-web, ...) is listed as a worker (see HostAgent).
  const agents = await host.agents.list().catch(() => [])
  // host.agents.list() names this session's agents only, but in case it ever lists another
  // session's too: never stop a worker whose task the live driver (another session) owns.
  const lead = leadNow !== undefined ? leadNow : await host.fs.read(path(S.N.leadFile)).catch(() => null)
  const live = liveDriver(lead, Date.now())
  // A board that can't be read (being fixed, or a read failing now) says nothing about whose
  // worker is whose: then no worker is stopped (the next check looks again), only scouts are.
  const b = agents.some(a => a.kind === 'worker') ? await load(host).catch(() => null) : emptyBoard()
  const out: string[] = []
  for (const a of agents) {
    if (a.kind === 'other') continue
    if (workers.has(a.id) || scoutRuns.has(a.id) || checkerRuns.has(a.id)) continue
    // Already told to stop: not taken back, and not messaged again (a message would wake it up).
    if (stopped.has(a.id)) continue
    if (ENDED_STATUSES.includes(a.status)) continue
    if (a.kind === 'worker' && !b) continue
    if (a.kind === 'worker' && b) {
      // A worker of this session that was running when the plugin reloaded keeps working:
      // track it again instead of stopping it (see orphanMove for when).
      const taken = [...workers.values()].map(w => w.task)
      const m = orphanMove(agentState(a), b, S.me, live, [...taken, ...starting, ...finishing], S.N.name)
      if (m.move === 'leave') continue
      if (m.move === 'adopt') {
        const t = find(b, m.task)!
        // Its worker already handed back (the agent is only idle): nothing to track or stop. The
        // task's check is still running, or the regular check recovers it (done when merged).
        if (handedBack(t)) continue
        const started = Date.parse(t.runs?.[t.runs.length - 1]?.started ?? '')
        workers.set(a.id, { task: t.id, worktree: worktreeDir(t.id), branch: taskBranch(t), since: Number.isFinite(started) ? started : Date.now() })
        // The task is recorded as this session's, with this agent (its session id may have changed over the reload).
        if (t.agent !== a.id || t.session !== S.me) await change(host, x => (find(x, t.id)?.status === 'doing' && (find(x, t.id)?.agent ?? a.id) === a.id ? patchTask(x, t.id, { agent: a.id, session: S.me }, now()) : x)).catch((e: Error) => host.ui.toast(S.N.toast(`kept ${t.id}'s worker after a reload but couldn't record it on the board: ${String(e?.message ?? e).slice(0, 150)}`)))
        continue
      }
    }
    stopped.add(a.id)
    if (LIVE.has(a.status)) await halt(host, a.id, `${S.N.name} was reloaded and a new worker took over this task`)
    out.push(a.id)
  }
  // Just loaded (called from claimLead, with lead.json as it was): a "doing" task of this session
  // with no live worker and no merge mark may be one whose worker has only just handed back to the
  // old copy, which is about to mark it. Wait a moment and look again, so it is not sent back for nothing.
  if (leadNow !== undefined && (await waitingOnOld(host, agents))) {
    aboutToWait()
    await host.clock.sleep(RELOAD_SETTLE_MS)
  }
  return out
}

/** How long a fresh copy of the plugin waits before deciding a "doing" task's old worker is gone. */
export const RELOAD_SETTLE_MS = 2_000

/** Whether a "doing" task of this session has no live worker (in `agents`), no merge mark and nothing in this copy working on it. */
async function waitingOnOld(host: Host, agents: HostAgent[]): Promise<boolean> {
  if (!(await host.fs.exists(path(S.N.boardFile)).catch(() => false))) return false
  const b = await load(host).catch(() => emptyBoard())
  const mine = new Set([...workers.values()].map(w => w.task))
  return b.tasks.some(t => t.status === 'doing' && t.session === S.me && !t.finishing && !mine.has(t.id) && !starting.has(t.id) && !finishing.has(t.id) && !liveWorkersFor(t, agents.map(agentState), S.N.name).length)
}

/**
 * Delete the temp files a killed session left in .<name>/ (see leftoverTmpFiles for which).
 * A file that is gone by the time we get to it is fine; other errors are reported once per
 * file in a toast, and never stop the check.
 */
export async function cleanLeftoverTmp(host: Host) {
  const dir = path(S.N.dir)
  const entries = await host.fs.list(dir).catch(() => [])
  const files: { name: string; mtimeMs?: number }[] = []
  for (const f of entries) {
    if (f.kind !== 'file' || !f.name.endsWith('.tmp')) continue
    const st = await host.fs.stat(`${dir}/${f.name}`).catch(() => null)
    if (st) files.push({ name: f.name, mtimeMs: st.mtimeMs })
  }
  const failed: string[] = []
  for (const name of leftoverTmpFiles(files, Date.now())) {
    const r = await host.run(['rm', '-f', `${dir}/${name}`]).catch((e: unknown) => ({ exitCode: 1, stderr: String(e), stdout: '' }))
    if (r.exitCode !== 0) failed.push(`${name}: ${(r.stderr || r.stdout).trim().slice(0, 100)}`)
  }
  // Say it once per file, not every two minutes.
  const nameOf = (f: string) => f.slice(0, f.indexOf(':'))
  const fresh = failed.filter(f => !tmpWarned.has(nameOf(f)))
  fresh.forEach(f => tmpWarned.add(nameOf(f)))
  if (fresh.length) host.ui.toast(S.N.toast(`couldn't remove leftover temp files in ${S.N.dir}/: ${fresh.join('; ')}`))
}

/**
 * Task `id`'s worker ran out of time (its limit `max` minutes, after `minutes`) and was stopped: while it
 * is still "doing" on the same try (`t`, as the check read it), it fails, with a note that its work so far
 * is kept; but when that try's work is already on its branch, it is done instead. The lead is told.
 */
async function timedOut(host: Host, id: string, t: BoardTask | undefined, max: number, minutes: number) {
  const same = (cur: BoardTask | undefined): cur is BoardTask => cur?.status === 'doing' && (!t || cur.attempts === t.attempts)
  const before = find(await load(host), id)
  if (!same(before)) return
  const sha = mergedThisTry(before) ?? (S.gitState === 'ok' ? await alreadyMerged(host, before).catch(() => null) : null)
  const out = await change(host, x => {
    const cur = find(x, id)
    if (!same(cur)) return [x, null] as [Board, null]
    const next = sha ? putTask(x, mergedDone(cur, sha, `stopped after ${Math.round(minutes)} min`, now())) : patchTask(x, id, { status: 'failed', note: outOfTimeNote(max), history: [...cur.history, `${tryLabel(cur)}: stopped after ${Math.round(minutes)} min (out of time); its work so far is kept in its folder and branch`], ...endedBy(cur, now(), 'timed out', `ran over ${max} min`) }, now())
    return [next, cur] as [Board, BoardTask]
  })
  if (!out) return
  if (sha) tellLead(host, `✓ ${id} "${out.title}" is done: its worker ran over ${max} minutes and was stopped, but its work was already merged (${shortSha(sha)}).`)
  else tellLead(host, `${id} "${out.title}": its time (${max} minutes) was up, so I stopped the worker and the task failed. Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${id}); a retry (${S.N.name} retry) continues from there. Or split it, or drop it. The limit can be changed with ${S.N.name} settings max_minutes.`)
}

/** What the lead is told when task `id`'s worker runs over its limit of `limit` minutes and the owner is asked. */
export const overtimeLeadText = (id: string, title: string, limit: number) =>
  `${overtimeQuestion(id, limit)} ("${title}": its worker ran past its time limit; it keeps working while the owner decides.) Options: ${OVERTIME_OPTIONS.join(' | ')}. Ask the owner in the chat now, plain and short, offering these as numbered plain chat text${notAskPopup()}, plus "or answer on the board"; put their answer into the task with ${S.N.name} change ${id} and answer: their choice (e.g. "+30 min" or "Stop it"). With no answer by ${S.N.name}'s hard cap (the limit plus max_minutes again) the worker is told to wrap up and hand back, then stopped, and the task fails with its work kept. If they answer on the board first (a "Meanwhile" line), don't ask again.`

/** Task `id`'s worker runs over its limit: the task keeps "doing" with the question, the owner hears "needs you", the lead is told. */
async function askOvertime(host: Host, b: Board, id: string, limit: number) {
  const t = await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== 'doing' || cur.time_ask || cur.wrap_up) return [x, null] as [Board, null]
    return [patchTask(x, id, { time_ask: now(), note: OVERTIME_NOTE, history: [...cur.history, `${tryLabel(cur)}: ran ${limit} min, over its time limit; asked the owner for more time`] }, now()), cur] as [Board, BoardTask]
  })
  if (!t) return
  sayNeedsYou(host, b, t, overtimeQuestion(id, limit))
  tellLead(host, overtimeLeadText(id, t.title, limit))
}

/** Task `id`'s time is up (`why`): its worker is told to write down what it has and hand back; it is stopped WRAP_UP_GRACE_MS later. */
async function wrapUp(host: Host, id: string, why: string) {
  const t = await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== 'doing' || cur.wrap_up) return [x, null] as [Board, null]
    return [patchTask(x, id, { time_ask: undefined, wrap_up: now(), note: 'time is up: the worker was told to hand back', history: [...cur.history, `${tryLabel(cur)}: time is up (${why}); the worker was told to write down what it has and hand back`] }, now()), cur] as [Board, BoardTask]
  })
  if (!t) return false
  for (const [agentId, w] of workers) if (w.task === id) await host.agents.send(agentId, WRAP_UP_TEXT).catch(() => undefined)
  return true
}

/**
 * The owner's answer (`answer`) to task `id`'s over-time question (see overtimeQuestion): "+N min" moves its
 * limit N minutes later and the worker goes on; "Stop it" tells the worker to wrap up. Returns what to say,
 * or undefined when the task has no such question (the answer is then handled like any other).
 */
export async function answerOvertime(host: Host, id: string, answer: string): Promise<string | undefined> {
  const b = await load(host)
  const t = find(b, id)
  if (t?.status !== 'doing' || !t.time_ask) return undefined
  const pick = parseOvertimeAnswer(answer)
  if (!pick) throw new Error(`Nothing changed: ${t.id} asks for more time; answer one of ${OVERTIME_OPTIONS.join(', ')} (or "+N min").`)
  if ('stop' in pick) {
    await wrapUp(host, t.id, 'the owner said stop')
    return `${t.id}: its worker was told to write down what it has and hand back; it is stopped in ${WRAP_UP_GRACE_MS / 60_000} min at the latest, and the task fails with its work kept.`
  }
  const out = await change(host, x => {
    const cur = find(x, t.id)
    if (cur?.status !== 'doing' || !cur.time_ask) return [x, null] as [Board, null]
    const extra = (cur.extra_minutes ?? 0) + pick.add
    return [patchTask(x, t.id, { extra_minutes: extra, time_ask: undefined, note: '', history: [...cur.history, `${tryLabel(cur)}: the owner gave it ${pick.add} more min (limit now ${timeLimitOf(x.max_minutes, { extra_minutes: extra })} min)`] }, now()), timeLimitOf(x.max_minutes, { extra_minutes: extra })] as [Board, number]
  })
  if (out === null) return undefined
  return `${t.id} has ${pick.add} more minutes: its limit is now ${out} min, and its worker goes on.`
}

/** workers whose agent a check saw ended (or missing from the agent list) without a hand-back: failed a short while later (ENDED_GRACE_MS; a missing one on the next check), or on the next check, if still not handed back */
export const seenEnded = new Set<string>()

/** How long after a check saw a worker's agent ended its report may still come (turn.complete hands it on a moment after the agent ends). */
export const ENDED_GRACE_MS = 20_000

/** A tracked worker whose agent ended with no hand-back: its task fails (not "todo", so a crashing worker doesn't start again and again). */
async function failLost(host: Host, agentId: string, w: Worker) {
  if (workers.get(agentId) !== w || finishing.has(w.task)) return
  const t = find(await load(host), w.task)
  if (t && handedBack(t)) return
  seenEnded.delete(agentId)
  workers.delete(agentId)
  // Only while the task is still "doing" on this agent's try: dropped, paused or changed meanwhile
  // (from another session, a tool or a board edit), or taken by a new try, it is left as it is now.
  if (!t || !sameTry(t, t, agentId)) return
  let failed = false
  await change(host, x => {
    const cur = find(x, w.task)
    if (!cur || !sameTry(cur, t, agentId) || handedBack(cur)) return x
    failed = true
    return patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', history: [...cur.history, `${tryLabel(cur)}: the worker ended without a result`], ...endedBy(cur, now(), 'stopped', 'the worker ended without a result') }, now())
  })
  if (!failed) return
  tellLead(host, `${w.task} "${t.title}": the worker ended without a result. Retry it (${S.N.name} retry), change it, or drop it.`)
  await publish(host, await load(host))
}

/** `cur` is still "doing" on the same try as `was` (same agent, if any, and same run): nothing took it over or ended it meanwhile. */
function sameTry(cur: BoardTask, was: BoardTask, agentId?: string) {
  return cur.status === 'doing' && cur.agent === was.agent && (agentId === undefined || (cur.agent ?? agentId) === agentId) && (cur.runs?.length ?? 0) === (was.runs?.length ?? 0) && cur.runs?.[cur.runs.length - 1]?.started === was.runs?.[was.runs.length - 1]?.started
}

/**
 * A "doing" task no live worker works on any more, with no merge going on for it, goes back to
 * "todo" for a fresh worker (its folder and branch are kept, so the next worker goes on from
 * there), with a history line, and the lead is told; or it is done, when its work already reached
 * its target branch. Such a task is left when its worker was lost: kept "doing" after a reload
 * because its old worker was still alive, a worker stopped by this copy (an orphan, see
 * stopOrphans), or its work was being tested and merged by an old copy of the plugin (its finishing
 * mark is no longer refreshed). An agent this copy stopped never counts as working on a task: every
 * tool it tries is refused, even while it is still listed. Only tasks this session may take over
 * (ownedHere) are touched, and never one whose worker is being stopped on purpose (onPurpose).
 */
export async function sendBackIdle(host: Host, agents: HostAgent[]) {
  const mine = new Set([...workers.values()].map(w => w.task))
  const live = liveDriver(await host.fs.read(path(S.N.leadFile)).catch(() => null), Date.now())
  const working = agents.filter(a => !stopped.has(a.id))
  const free = (t: BoardTask) => t.status === 'doing' && !mine.has(t.id) && !starting.has(t.id) && !finishing.has(t.id) && !onPurpose.has(t.id) && !finishingNow(t, Date.now())
  // A handed-back worker's agent may stay listed (idle): it doesn't hold its task any more.
  const idle = (await load(host)).tasks.filter(t => free(t) && ownedHere(t, S.me, live) && (handedBack(t) || !liveWorkersFor(t, working.map(agentState), S.N.name).length))
  const merged = new Map<string, string>()
  for (const t of idle) {
    const sha = mergedThisTry(t) ?? (S.gitState === 'ok' ? await alreadyMerged(host, t).catch(() => null) : null)
    if (sha) merged.set(t.id, sha)
  }
  const ids = idle.map(t => t.id)
  if (!ids.length) return
  const back: BoardTask[] = []
  await change(host, x => ({
    ...x,
    tasks: x.tasks.map(t => {
      // Re-read here: left as it is if its status, agent or run changed since it was picked.
      const was = idle.find(i => i.id === t.id)
      if (!was || !free(t) || !sameTry(t, was) || [...workers.values()].some(w => w.task === t.id)) return t
      const sha = merged.get(t.id)
      if (sha) return mergedDone(t, sha, 'sent back to todo', now())
      back.push(t)
      return backToTodo(t, t.finishing ? 'restarted: its test and merge stopped before the end (the plugin reloaded)' : 'restarted: the old worker has ended', now())
    }),
  }))
  for (const id of merged.keys()) tellLead(host, `✓ ${id} is done: its work was already merged (${shortSha(merged.get(id)!)}) when the plugin reloaded.`)
  if (back.length) tellLead(host, `${back.map(t => `${t.id} "${t.title}"`).join(', ')}: no worker was working on ${back.length > 1 ? 'them' : 'it'} any more (${back.length > 1 ? 'their workers' : 'its worker'} stopped or ended), so ${back.length > 1 ? 'they go' : 'it goes'} back to todo; the next worker goes on from the same folder and branch.`)
}

/**
 * A hand-back from an agent this copy had stopped (e.g. an orphan after a reload): its report is not
 * taken, but its task must not stay "doing" with nobody on it, so it is put back right away (see sendBackIdle).
 */
export async function stoppedHandBack(host: Host, agentId: string) {
  if (!S.driving || !stopped.has(agentId)) return
  const agents = await host.agents.list().catch(() => undefined)
  // a stopped checker's hand-back: its task gets a new checker at once (see restartCheckers)
  if (agents) await restartCheckers(host, agents)
  if (agents) await sendBackIdle(host, agents)
  await pump(host)
}

/** The regular check, every two minutes: keeps work moving and makes sure nothing is stuck or forgotten. */
export async function check(host: Host) {
  if (!S.driving) return
  await cleanLeftoverTmp(host).catch(() => undefined)
  await stopOrphans(host)
  const b = await load(host)
  if (!symccOn(b)) return
  const agents = await host.agents.list().catch(() => undefined)
  const nowMs = Date.now()
  for (const id of seenEnded) if (!workers.has(id)) seenEnded.delete(id)
  for (const [agentId, w] of [...workers]) {
    // An earlier step of this loop waited (halt, change): the worker may have finished meanwhile.
    if (workers.get(agentId) !== w) continue
    const minutes = (nowMs - w.since) / 60_000
    const info = agents?.find(a => a.id === agentId)
    const t = find(b, w.task)
    // Its worker already handed back (its work is being, or was, checked and merged): this entry is
    // left over. Only the merge's own time limit applies now, never max_minutes.
    if (finishing.has(w.task) || (t && handedBack(t))) {
      const cur = find(await load(host), w.task)
      if (finishing.has(w.task) || (cur && handedBack(cur))) {
        if (workers.get(agentId) === w) workers.delete(agentId)
        seenEnded.delete(agentId)
        continue
      }
    }
    // Told its time is up: stopped once its short grace to hand back is over.
    const limit = timeLimitOf(b.max_minutes, t)
    if (t?.status === 'doing' && t.wrap_up) {
      if (nowMs - Date.parse(t.wrap_up) >= WRAP_UP_GRACE_MS) {
        // Stopped on purpose: a "Stopped" answer meanwhile must not send it back to todo (it fails below).
        onPurpose.set(w.task, 0)
        workers.delete(agentId)
        await halt(host, agentId, `its time is up (it ran longer than ${limit} minutes)`)
        await timedOut(host, w.task, t, limit, minutes)
      }
      continue
    }
    // Running too long: it keeps working while the owner is asked for more time; with no answer by the
    // hard cap it is told to wrap up (and stopped after a short grace).
    if (t?.status === 'doing' && minutes > limit) {
      if (!t.time_ask) await askOvertime(host, b, w.task, limit)
      else if (minutes > hardCapOf(b.max_minutes, t)) await wrapUp(host, w.task, `no answer from the owner after ${Math.round(minutes)} min`)
    }
    // The worker is gone without saying it finished (crashed, or lost): send the task back to the lead.
    // Its report may be on its way (turn.complete hands it on a moment after the agent ends), so the
    // first check that sees it ended gives it a short grace (ENDED_GRACE_MS) and fails it then if still
    // not handed back; with no timer here, the next check fails it.
    // Claude Code drops an ended agent from host.agents.list() a while after it ends: a tracked worker
    // missing from a list we did get counts as ended too, once it stays missing for one whole check.
    const missing = agents !== undefined && info === undefined
    const ended = missing || (info !== undefined && ENDED_STATUSES.includes(info.status))
    if (!ended) {
      seenEnded.delete(agentId)
      continue
    }
    if (!seenEnded.has(agentId)) {
      seenEnded.add(agentId)
      if (missing) continue
      const timer = afterMs(host, ENDED_GRACE_MS, () => void failLost(host, agentId, w).catch(() => undefined))
      if (timer) timers.push(timer)
      continue
    }
    await failLost(host, agentId, w)
  }
  ageOnPurpose(await load(host))
  // a task whose checker was lost to a reload gets a new one (before sendBackIdle could send it back)
  if (agents) await restartCheckers(host, agents)
  if (agents) await sendBackIdle(host, agents)
  // Failed tasks nobody acted on for 10 minutes: remind the lead once per failure.
  const late = (await load(host)).tasks.filter(t => t.status === 'failed' && nowMs - Date.parse(t.updated_at || '') > 10 * 60_000 && reminded.get(t.id) !== t.updated_at)
  for (const t of late) reminded.set(t.id, t.updated_at)
  if (late.length) tellLead(host, `Reminder: ${late.map(t => `${t.id} "${t.title}"`).join(', ')} ${late.length > 1 ? 'have' : 'has'} failed and nothing was done about ${late.length > 1 ? 'them' : 'it'}. Retry, change, ask the owner or drop each one.`)
  // Finished work waiting only for the owner's files: merged now (no worker) once they are out of the way.
  await retryFileWaits(host).catch(() => undefined)
  if (S.gitState === 'ok') await cleanupMerged(host, await load(host)).catch(() => undefined)
  // old done and dropped tasks move to archive.json (at most once an hour)
  await archiveOld(host).catch(() => undefined)
  // stuck, starving or too-serial tasks, or ones waiting on the owner too long: told once each
  checkHealth(host, await load(host))
  await pump(host)
}
