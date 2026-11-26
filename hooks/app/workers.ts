import type { SymccTask, SymccTokens } from '../../types'
import { PREP_NOTE, makeAsk, type Board, type BoardTask, type RoleDef, roleSection, mayStart, liveWorkersFor, modeOf, symccOn, ready, patchTask, putTask, find, startRun, findRole, roleOf, workerName, workerDescription, onNotReady, endRun, tryLabel, needFilesQuestion, DEFAULT_AUTO_RETRIES, onTestFail, reviewTask, ownerEditedLine, gitNote, intoOf, goneBranchQuestion, goneBranchOptions, liveDriver, emptyBoard, ownedHere, backToTodo, stoppedEntry, withHistory, historyEntry, type HistoryAdd, type HistoryFacts, tryEntry, resultEntry, notUsedEntry, taskWasResult, type HistoryKind, cutLine, reportFile, reportText, endedBy, withEnd, finishedNote, inPlan, finishingNow, mergedThisTry, mergedDone, handedBack, addCommits, FINISH_BEAT_MS, finishLimitMs, mergeTestCount, testMinutesOf, ranOverNote, waitsForFiles, blockerFiles, asBlockers, waitFilesNote, stillBlocks, timeLimitOf, hardCapOf, WRAP_UP_GRACE_MS, WRAP_UP_TEXT, outOfTimeNote, checkerOn, docsOnly, checkerOutput, isCheckerOutput, checkerLine, checkerRetryText, kindOf, isInvestigation, isErrand, kindSection, ANSWER_MAX_CHARS, addTask, taskReports, investigationDone, keepNoteTask, ASK_TOOL, ASK_LINE, noteFilesInUse, askedMore, ANSWERED, fillPrompt, shortSha, secretsLeftText, gaveUpTestsText, endedEarlyLine, endedEarlyNote, ENDED_EARLY_NOTE, isUsageLimit, workerStartedEntry, workerHandedBackEntry, withFailedTests, withAgentUsed, withStoppedUsed, goOnRun, undoGoOn, restartsOf, restartedAgent, workerIdOf, checkerIdOf, onTask, withAgentStart, withWorkerStart, DEFAULT_ROLE, workerSince, workerActiveMs, isProseRole } from '../board'
import { archiveOld } from './archive'
import { checkHealth } from './health'
import { gitReady, branchExists, homeBranch, prepareWorktree, removeWorktree, git, worktreeDir, cleanupMerged, taskWork, resetScratch, clearScratch, taskBranch, copyReports, deleteMergedBranch, type BehindWhy } from './git'
import { publish, drivesHere, drivenElsewhere, readLeadText } from './lead'
import { type BeforeLine, type CheckResult, checkAndMerge, recordCommits, ownerEdits, alreadyMerged, AGAIN_MAX, RELOAD_AGAIN, againsThisTry, noteAgain } from './review'
import type { TurnLimit } from './merge-line'
import { timedOutRetryNote } from '../core/test-timeout'
import { mayBeStale, changedSincePaths, pathsNamed, CHANGED_SINCE_MAX, type ChangedSince } from '../core/changed-since'
import { logNeedsFiles } from './evidence'
import { loadRoles } from './roles'
import { runChecker, checkerName, cleanFolder, STOPPED_AGAIN } from './checker'
import { loadKinds } from './kinds'
import { S, onHere, workers, starting, queuedWorkers, type Worker, notReady, checkerNotReady, heard, finishing, approving, stopped, isOwnAgent, rememberOnBoard, halt, checkerRuns, adoptedCheckers, meanwhile, reminded, timers, haltedAnywhere, movedRefused } from './state'
import { type Host, type HostAgent, type HostAgentStarted, ENDED_STATUSES, agentState, notReadyYet } from '../host'
import { startAgent, startCancelled, claimNote, rewakeStarts } from './starts'
import { load, change, now, path, safeWrite, aboutToWait, holdPublish } from './store'
import { tellLead, noteForLead } from './tell'
import { sayDone, sayNeedsYou } from './voice'
import { optionsVia, popupTied } from './questions'
import { changeValues, investigationValues } from './prompt-values'
import { debriefing, learnedAsk, startDebrief } from './debrief'
import { orgMemText, keepSuggestions } from './org-mem'
import { cleanLeftoverTmp, stopOrphans, timedOut, askOvertime, wrapUp, ownerAddedMinutes, ownerTimeState } from './cleanup'
import { plural } from '../core/text'

// ---------------- workers ----------------

/** The prompt a worker on task `t` is started with: its kind's built-in prompt with the placeholders filled in for this task.
 *  The role's checklist goes in {{role}}, with its own placeholders filled in from the same values. `guide`: organizational memory (org-mem) as
 *  the prompt shows it (orgMemText; '' for none). `learned`: the end-of-report ask for org-mem suggestions, only on a host
 *  with no debrief (learnedAsk, T-656); '' by default: the debrief asks after the hand-back instead. */
export const WORKER_PROMPT = (t: BoardTask, b: Board, dir: string, role?: RoleDef, guide = '', learned = '', commits: readonly string[] = [], since: ChangedSince | null = null) => {
  const kind = isInvestigation(t) ? 'investigation' : 'change'
  const values = { ...(kind === 'investigation' ? investigationValues(t, dir) : changeValues(t, b, dir)), learned }
  return fillPrompt(kind, { ...values, role: roleSection(role, values, t), org_mem: guide }, t, b, commits, since)
}

/**
 * T-936: for a task from the backlog or written over a day before this try (mayBeStale), the commits on the branch it
 * merges into since it was written, limited to its files (else the paths its details name; else only how many), newest
 * first, at most CHANGED_SINCE_MAX. null for a fresh task, when no commit changed them, or when git can't say.
 */
export async function changedSince(host: Host, t: BoardTask, dir: string, nowMs = Date.now()): Promise<ChangedSince | null> {
  if (!mayBeStale(t, nowMs)) return null
  let tracked: string[] = []
  const named = t.files?.length ? [] : pathsNamed(`${t.title ?? ''}\n${t.details ?? ''}`)
  if (named.length) {
    const r = await git(host, ['ls-files', '--', ...named], dir).catch(() => null)
    tracked = r && r.exitCode === 0 ? r.stdout.split('\n').map(l => l.trim()).filter(Boolean) : []
  }
  const { paths, scope } = changedSincePaths(t, tracked)
  // --no-merges: the "bring up to date with main" merges would fill the lines
  const range = ['--no-merges', `--since=${t.created_at}`, `refs/heads/${intoOf(t)}`, ...(paths.length ? ['--', ...paths] : [])]
  const count = await git(host, ['rev-list', '--count', ...range], dir).catch(() => null)
  const total = count && count.exitCode === 0 ? Number(count.stdout.trim()) : NaN
  if (!Number.isFinite(total) || total <= 0) return null
  let commits: string[] = []
  if (scope !== 'none') {
    const r = await git(host, ['log', '--format=%h %s', '-n', String(CHANGED_SINCE_MAX), ...range], dir).catch(() => null)
    commits = r && r.exitCode === 0 ? r.stdout.split('\n').map(l => l.trim()).filter(Boolean) : []
  }
  return { created: t.created_at, nowMs, commits, total, scope }
}

/**
 * T-851: the commits earlier tries left on the task's branch (not yet on the branch it merges into), one line each
 * ("abc1234 subject", newest first, at most 10), for the prompt's "Where you work". [] when no try made a commit or git can't say.
 */
export async function earlierCommits(host: Host, t: BoardTask, dir: string): Promise<string[]> {
  if (!t.runs?.some(r => r.commits?.length)) return []
  const r = await git(host, ['log', '--format=%h %s', '-n', '10', `refs/heads/${intoOf(t)}..HEAD`], dir).catch(() => null)
  return r && r.exitCode === 0 ? r.stdout.split('\n').map(l => l.trim()).filter(Boolean) : []
}

/**
 * The text added to a worker's prompt when its branch still lacks `behind` commits of the branch it merges into
 * (`into`) (T-482), so it knows it starts from older code. `why` (from catchUpBranch, T-483) picks the reason it is
 * told: its branch has commits from an earlier try, its folder has uncommitted work from one, or moving the branch
 * failed. '' when it is up to date.
 */
/**
 * T-927: the prompt line naming the earlier answers copied into the worker's folder (`copied`, see copyReports) that
 * its `details` don't already name by file: the task it comes from's latest report, or one asked for as
 * "T-920's answer". '' when there are none.
 */
export const reportsNote = (copied: readonly string[], details: string) => {
  const extra = copied.filter(f => !details.includes(f))
  if (!extra.length) return ''
  const many = extra.length > 1
  return `\n\nEarlier answer${many ? 's' : ''} for this task: ${extra.join(', ')}. ${many ? 'They are' : 'It is'} copied into your own folder at that path (git-ignored, never committed): read ${many ? 'them' : 'it'} there before you start, not in the main project folder.`
}

export const behindNote = (behind: number, into: string, why: BehindWhy = 'commits') => {
  if (behind <= 0) return ''
  const n = plural(behind, 'commit')
  // T-745: merging it in before the try clashed, so the worker merges it in itself (the try runs with merge_main)
  if (why === 'clash') return `\n\nNote: ${into} has ${plural(behind, 'new commit')} you don't have yet; merge them in first.`
  const head =
    why === 'changes' ? `your folder has uncommitted work from an earlier try and is ${n} behind ${into}.`
    : why === 'failed' ? `symcc could not move your branch up to ${into}, so it is ${n} behind ${into}.`
    : `your branch has commits from an earlier try, and ${into} has ${plural(behind, 'newer commit')} your branch lacks.`
  return `\n\nNote: ${head} Your folder shows the older code; symcc brings your work up to date with ${into} when it merges.`
}

export async function pump(host: Host) {
  if (!S.startupDone) return // session.start hasn't finished; it pumps itself at its end
  if (!S.driving) return // another session drives the board and starts its work
  if (inPlan(S.plan)) return // plan mode: nothing starts; workers already running keep going
  const b = await load(host)
  if (modeOf(b) === 'paused' || !onHere(b)) return
  if (!ready(b).length) return
  // T-887: while git is missing, pump (every 30 s from the lead heartbeat, every 2 min from the watchdog) runs no git:
  // on a Mac without the command-line tools the /usr/bin/git stand-in opens Apple's install pop-up each time.
  // Check again or a new session looks again, and Check again pumps when git is there.
  if (S.gitState === 'no-git') return
  if (!(await gitReady(host, b))) return // no git, no repo or no commit yet: nothing starts until it is set up
  const failed = (id: string) => (err: Error) => startFailed(host, id, err)
  // Each task is made ready and claimed in turn; their starts then wait in the queue together (see app/starts.ts),
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

/** A worker's start on task `id` failed for good: the task fails with the reason and the lead is told. */
async function startFailed(host: Host, id: string, err: Error) {
  await change(host, x => patchTask(x, id, { status: 'failed', note: `couldn't start: ${err.message.slice(0, 200)}`, ...endedBy(find(x, id), now(), 'stopped', "couldn't start") }, now()))
  tellLead(host, `${id} couldn't start: ${err.message.slice(0, 300)}`)
}

/**
 * T-954: Run now: claims to-do task `id` and queues its worker at once, as the pump would, but past max_parallel, a
 * paused board and its after list (the caller checked those and set it to todo). `line` is the history line written
 * once it is claimed (the try's number goes in front). Its start goes on in the background (a failure fails the task,
 * as in the pump). False when it was not claimed here (another start has it, or it can't start now).
 */
export async function startNow(host: Host, id: string, line: string): Promise<boolean> {
  const q = await queueWorker(host, id).catch(async (err: Error) => (await startFailed(host, id, err), null))
  if (!q) return false
  await change(host, x => {
    const cur = find(x, id)
    return cur?.status === 'doing' ? patchTask(x, id, { history: withHistory(cur.history, now(), tryEntry(cur, 'run-now', line)) }, now()) : x
  }).catch(() => undefined)
  void q.started.catch((err: Error) => startFailed(host, id, err))
  return true
}

/**
 * Starts a worker on task `id`, but only if it is still "todo" and no live agent works on it
 * (see mayStart). The claim happens inside change(), so two starts can't both win. Settles once the worker
 * started (it waits in the start queue meanwhile, see app/starts.ts).
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
    const agents = [...listed, ...knownWorkers()].filter(a => !stopped.has(a.id) && !debriefing(a.id))
    const b = await load(host)
    const t0 = find(b, id)
    if (!mayStart(t0, agents.map(agentState), S.N.name)) return null
    // Its last try's work is already on the branch it merges into (e.g. a reload sent it back, or
    // the owner retried it after it was wrongly failed): it is done, not tried again.
    if (await mergedBeforeStart(host, t0!)) return null
    // the branch it merges into is gone: it waits for the owner instead of failing
    if (await waitIfBranchGone(host, b, t0!, 'start')) return null
    // T-764: the catch-up merge commit names the try about to start (the same one when T-743's go-on rule keeps it)
    const tryNo = t0!.attempts > 0 && goOnRun(t0!.runs, now()) ? t0!.attempts : t0!.attempts + 1
    const { dir, branch, behind, why, merged, commit } = await prepareWorktree(host, { ...t0!, attempts: tryNo }, intoOf(t0!), true)
    // the earlier answers its details name (a keep-note task's reports) are read inside its own folder
    // (and, T-927, the latest answer of the task it comes from); the prompt names the ones its details don't
    const reports = await copyReports(host, t0!, dir).catch(() => [] as string[])
    const roles = await loadRoles(host)
    // the kind files are read again too, so the prompt has the kind's description as it is now
    await loadKinds(host).catch(() => undefined)
    const t = await change(host, x => {
      const cur = find(x, id)
      if (!mayStart(cur, agents.map(agentState), S.N.name)) return [x, null]
      const at = now()
      // T-743: after a restart symcc did itself (a reopen, a reload, ...) the same try goes on: no new run, no new try number
      const goOn = cur!.attempts > 0 ? goOnRun(cur!.runs, at) : null
      const attempts = goOn ? cur!.attempts : cur!.attempts + 1
      // T-745: the branch had its own commits and main was merged in before this try
      const upToDate = merged ? { history: withHistory(cur!.history, at, tryEntry({ ...cur!, attempts }, 'stage', `brought up to date with ${intoOf(cur!)} (${plural(merged, 'commit')})`)) } : {}
      // and when merging it in clashed, this try merges it in itself (its prompt asks, the git guard lets it), as the clash retry does
      const clash = why === 'clash' && !cur!.merge_main ? { merge_main: true as const } : {}
      // T-873: the same try going on keeps the minutes the owner gave it (the reopen dropped its live record)
      const added = goOn ? ownerAddedMinutes(cur!.history, attempts) : 0
      // T-885: and stays stopped after a "Stop it" (or keeps its open "more time?" question)
      const time = goOn ? ownerTimeState(cur!.history, attempts, at) : {}
      const y = patchTask(x, id, { status: 'doing', live: { session: S.me, phase: 'claimed', ...(added > 0 ? { extra_minutes: added } : {}), ...time }, attempts, branch, note: claimNote(host), runs: addCommits(goOn ?? startRun(cur!.runs, at, !!cur!.merge_main || why === 'clash'), commit ? [commit] : []), ...upToDate, ...clash }, at)
      return [y, find(y, id)!]
    })
    if (!t) return null
    const before = find(b, id)!
    const role = findRole(roles, roleOf(t))
    // Right before it starts, the task must still be this try's (not dropped, paused, changed or sent back meanwhile)
    // and symcc still on; a stop while it waits takes it out of the queue at once (see haltWorkers).
    const still = async () => {
      if (!S.enabledNow) return false
      // T-759: a session that no longer drives the board (driving moved to another session) starts no worker
      if (!(await drivesHere(host))) return false
      const cur = find(await load(host), id)
      return cur?.status === 'doing' && cur.live?.session === S.me && cur.attempts === t.attempts
    }
    const spawn = startAgent(host, { kind: 'worker', prompt: WORKER_PROMPT(t, b, dir, role, await orgMemText(host), learnedAsk(host), await earlierCommits(host, t, dir), await changedSince(host, t, dir, Date.parse(now()))) + reportsNote(reports, t.details) + behindNote(behind, intoOf(t), why), name: workerName(S.N.name, t.id), description: workerDescription(t.title), ...(role?.tools ? { tools: role.tools } : {}), ...(isProseRole(role) && !isInvestigation(t) ? { prose: true as const } : {}), ...(!isInvestigation(t) && t.files?.length ? { files: t.files } : {}), cwd: dir, ...(role?.model ? { model: role.model } : {}) }, still)
    queued = true
    queuedWorkers.set(id, { task: id, worktree: dir, branch, since: Date.now() })
    return { started: workerStarted(host, id, before, dir, branch, spawn, t.attempts).finally(() => (starting.delete(id), queuedWorkers.delete(id))) }
  } finally {
    if (!queued) starting.delete(id)
  }
}

/** Task `id`'s queued worker (`spawn`, see queueWorker) started, or didn't: it is recorded on the task, or the task is put back as it was (`before`). */
async function workerStarted(host: Host, id: string, before: BoardTask, dir: string, branch: string, spawn: Promise<HostAgentStarted>, claimed: number) {
  let agentId: string
  try {
    const spawned = await spawn
    if (!spawned.agentId) throw new Error('the worker did not start')
    agentId = spawned.agentId
  } catch (err) {
    // taken back before it started (its task was stopped, dropped, paused or changed meanwhile): nothing failed.
    // T-428: when the task is still claimed for this very try, only queued (nobody stopped it on purpose), its claim
    // is undone at once: left "doing" with no worker, the regular check would send it back as if a worker had ended.
    if (startCancelled(err)) {
      if (!onPurpose.has(id))
        await change(host, x => {
          const cur = find(x, id)
          return cur?.status === 'doing' && cur.live?.phase === 'claimed' && cur.attempts === claimed && !handedBack(cur) ? putTask(x, unclaimed(cur, now())) : x
        }).catch(() => undefined)
      return
    }
    const misses = notReady.get(id) ?? 0
    if (!notReadyYet(err) || onNotReady(misses) === 'fail') {
      notReady.delete(id)
      throw err
    }
    // Not the task's fault: the worker type isn't there yet (e.g. just after a reload).
    // Put the task back as it was, with no try counted; the next pump or check tries again.
    notReady.set(id, misses + 1)
    await change(host, x =>
      find(x, id)?.status === 'doing' && find(x, id)?.live?.session === S.me
        ? patchTask(x, id, { status: 'todo', attempts: before.attempts, branch: before.branch, note: before.note, runs: before.runs }, now())
        : x,
    )
    return
  }
  notReady.delete(id)
  workers.set(agentId, { task: id, worktree: dir, branch, since: Date.now() })
  // Record which agent works on the task, so a reloaded copy can find it; the note says it runs now.
  // T-723: its history says the try's worker started (with its role, and whether it merges main in first or reuses its try number)
  await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== 'doing') return x
    const at = now()
    // T-743: a try that goes on after a restart symcc did itself says so ("try 2: worker restarted after the app was reopened")
    const again = restartsOf(cur.runs?.at(-1)).at(-1)
    const entry = again && !workerIdOf(cur) ? workerRestartedEntry(cur, again.why) : workerStartedEntry(cur, !!cur.runs?.at(-1)?.merge_main)
    const line = cur.attempts === claimed ? { history: withHistory(cur.history, at, entry) } : {}
    return patchTask(x, id, { runs: withWorkerStart(cur.runs, agentId, at), ...(cur.live?.phase === 'claimed' ? { note: 'worker on it', live: { phase: 'worker' as const } } : {}), ...line }, at)
  })
  // T-885: a try whose time was up before a reopen goes on stopped: its new worker is told to hand back too
  const cur = find(await load(host), id)
  if (cur?.status === 'doing' && cur.attempts === claimed && cur.live?.wrap_up) await host.agents.send(agentId, WRAP_UP_TEXT).catch(() => undefined)
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
    return [patchTask(x, t.id, { status: 'waiting', ask: makeAsk('symcc', question, now(), { options }), live: { merge_wait: undefined }, note: 'waiting for you', history: withHistory(cur.history, now(), ['not-merged', line, { owner: true }]), ...endedBy(cur, now(), 'asked', `branch ${into} is gone`) }, now()), true] as [Board, boolean]
  })
  if (asked) {
    sayNeedsYou(host, b, t, question)
    tellLead(host, `${t.id} "${t.title}" ${when === 'start' ? "can't start" : "can't be merged"}: the branch it merges into, ${into}, is gone. It now waits for the owner: ${question} An answer of yes moves it to ${instead}; or ${S.N.name} change ${t.id} with merge_into set to an existing branch.`, { urgent: true })
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

/**
 * Why a worker's turn ended (from turn.complete): answered, stopped, refused (with what the API said) or an API error.
 * `background`: the agent's background commands the host saw still running when its turn ended ([] for none);
 * absent when the host can't tell. A non-empty list with no hand-back report fails the try (ENDED_EARLY_NOTE); with a
 * report, the commands are stopped (`stopBackground`) and the hand-back goes on (T-724). The answer's text alone
 * (endedEarlyLine) only adds a warning (see warnEndedEarly).
 * `stopBackground`: when the host can, stops those commands of the agent (only its own, never by name) and answers how many it stopped.
 */
export type TurnEnd = { reason: TurnEndReason; refusal?: TurnRefusal; error?: string; background?: readonly string[]; stopBackground?: () => Promise<number> }
/** Why a turn ended: the model answered, it was interrupted, the model refused, or an error ended it. */
export type TurnEndReason = 'answer' | 'aborted' | 'refusal' | 'error'
/** What was said about a refusal that ended a turn: its category and explanation, each null when none was given. */
export type TurnRefusal = { category: string | null; explanation: string | null }

/** A worker's hand-back `answer` arrived; `end`: why its turn ended. */
/** `cost`: what the try cost in US dollars, when the host knows it (e.g. a `claude -p` process's result says it). */
export async function workerFinished(host: Host, agentId: string, answer: string, end: TurnEnd = { reason: 'answer' }, tokens?: SymccTokens, cost?: number) {
  const w = workers.get(agentId)
  if (!w) return
  workers.delete(agentId)
  // T-740: this copy is already checking a hand-back for this task (a second one for the same try, e.g. from the old
  // worker it took back after a reopen): ignored, so one hand-back leads to one prep and one checker
  if (finishing.has(w.task)) return
  const at = now()
  heard.workers[w.task] = at
  heard.last = { what: `${w.task} worker report`, at }
  finishing.add(w.task)
  let tryNo: number | undefined | null
  let limitMs = finishLimitMs(0)
  // The try ends now (checking and merging is not counted). The turn result gives tokens but
  // no dollar cost, so `cost` stays empty until Claude Code reports one.
  // The task is marked as being tested and merged (refreshed while that runs), so a reloaded
  // copy of the plugin sees it and doesn't send the task back to "todo" meanwhile.
  // T-613: its worker has handed back, so a "more time?" question still open is dropped: a task in a check step
  // never waits for the owner's time answer.
  const ended = now()
  // T-883: its session ended on an error (or was cut off) because symcc itself stopped it (a reload, a takeover, driving
  // moved): the try is not failed, it ends as restarted and the next worker goes on with the same try
  const bySymcc = await stoppedBySymcc(host, agentId, end)
  let restarted = false
  // T-1029: the changes of this hand-back (up to the check's start) draw the view once, when finishTry lets go of the hold
  const letGo = holdPublish(host)
  handBackHolds.set(w.task, letGo)
  try {
    tryNo = await change(host, x => {
      const t = find(x, w.task)
      if (t?.status !== 'doing') return [x, undefined] as [Board, undefined]
      // T-740: this try already handed back (another copy checks it), or the agent is not this try's worker (an
      // earlier try's worker, still alive after a reopen): nothing is written and nothing is checked
      if (handedBack(t) || notThisTry(t, agentId)) return [x, null] as [Board, null]
      // (a question it asked or edits refused before the stop still make it wait, below; a time-up stop still fails)
      if (bySymcc && !t.live?.wrap_up && !t.live?.ask && !t.live?.refused?.length) {
        restarted = true
        const runs = t.runs?.length ? withAgentUsed(t.runs, 'worker', agentId, ended, { tokens, ...(cost !== undefined ? { cost } : {}) }) : t.runs
        return [putTask(x, backToTodo({ ...t, ...(runs ? { runs } : {}) }, SYMCC_STOPPED_NOTE, ended)), null] as [Board, null]
      }
      limitMs = finishLimitMs(mergeTestCount(x), testMinutesOf(x))
      // T-723: its history says the worker handed back (its own line, just before the "prep started" the check writes)
      return [patchTask(x, w.task, { live: { checking: { step: 'prep', at: ended }, phase: undefined, time_ask: undefined }, history: withHistory(t.history, ended, workerHandedBackEntry(t)), ...(t.runs?.length ? { runs: endRun(withAgentUsed(t.runs, 'worker', agentId, ended, { tokens, ...(cost !== undefined ? { cost } : {}) }), ended) } : {}) }, ended), t.attempts] as [Board, number]
    })
  } catch {
    // T-452: board.json can't be read (load already told the owner, once). The report is kept here and
    // finished as usual by the regular check once the board can be read again (resumeKept); board.json is
    // left as it is, and the task is not sent back to "todo" meanwhile (see sendBackIdle).
    keptHandBacks.set(agentId, { w, answer, end, tokens, cost })
    finishing.delete(w.task)
    handBackHolds.delete(w.task)
    await letGo()
    return
  }
  if (tryNo === null) {
    finishing.delete(w.task)
    handBackHolds.delete(w.task)
    await letGo()
    if (restarted) await pump(host)
    return
  }
  // T-656: the same agent is asked for org-mem suggestions in one follow-up turn; nothing below waits for its answer
  if (tryNo !== undefined && end.reason === 'answer' && !stopped.has(agentId)) startDebrief(host, agentId, w.task, tryNo, answer)
  try {
    await finishUnderLimit(host, w.task, tryNo, limitMs, (gaveUp, over, limit) => finishWork(host, agentId, w, answer, end, gaveUp, over, limit))
  } finally {
    handBackHolds.delete(w.task)
    await letGo()
  }
}

/** T-1029: the hold on drawing the view that workerFinished takes for its task's hand-back; finishTry lets go of it before the check starts. */
const handBackHolds = new Map<string, () => Promise<void>>()

/**
 * Runs task `id`'s checking and merging step `step` for try `tryNo` (a worker's hand-back, or one started again after a
 * reload), with the finishing mark refreshed by a heartbeat meanwhile. Its merge turn has a time limit (`limitMs`, see
 * finishLimitMs: it grows with the test commands): the heartbeat keeps going even when the step hangs, so without it a
 * stuck turn would keep its task "doing" forever. Past the limit the step is given up (finishRanOver): it may still wake
 * up later, but then it writes nothing (gaveUp). With no try (`tryNo` undefined) there is no heartbeat and no limit.
 * Then the mark is removed, the check ends, and the next checker and workers are started.
 */
async function finishUnderLimit(host: Host, id: string, tryNo: number | undefined, limitMs: number, step: (gaveUp: () => boolean, over: Promise<unknown>, limit?: TurnLimit) => Promise<unknown>) {
  let beat: { cancel(): void } | null = null
  try {
    if (tryNo !== undefined) beat = everyMs(host, FINISH_BEAT_MS, () => void markFinishing(host, id, tryNo).catch(() => undefined))
    const how = await withLimit(host, tryNo === undefined ? null : limitMs, step)
    if (how === OVER) {
      beat?.cancel()
      beat = null
      finishing.delete(id)
      await finishRanOver(host, id, tryNo!, limitMs)
    }
  } finally {
    beat?.cancel()
    await endFinishing(host, id, tryNo)
  }
  await checkerAgainNow(host, id)
  await pump(host)
}

/** Removes task `id`'s finishing mark (only with a try `tryNo`), lets go of it in `finishing` and ends its check. */
async function endFinishing(host: Host, id: string, tryNo: number | undefined) {
  if (tryNo !== undefined) await markFinishing(host, id, tryNo, false).catch(() => undefined)
  finishing.delete(id)
  await endCheck(host, id)
}

/** T-883: the "restarted" note of a task whose worker's session ended because symcc itself stopped it. */
export const SYMCC_STOPPED_NOTE = `restarted: its worker was stopped by a reload or a takeover`

/**
 * T-883: whether a worker's session that ended with `end` ended because symcc itself stopped it: it ended on an error or
 * was cut off (never a real answer or a refusal), and some copy of symcc in this process told it to stop (haltedAnywhere,
 * movedRefused), or lead.json says another session drives the board now (a takeover or hand-over). A real API error with
 * no such stop is not one: it fails the try as before.
 */
export async function stoppedBySymcc(host: Host, agentId: string, end: TurnEnd): Promise<boolean> {
  if (end.reason !== 'error' && end.reason !== 'aborted') return false
  if (stopped.has(agentId) || haltedAnywhere().has(agentId) || movedRefused().has(agentId)) return true
  return drivenElsewhere(host).catch(() => false)
}

/**
 * T-740: whether agent `agentId` is not the worker of task `t`'s current try: the try names another worker, or it
 * names none yet while `agentId` worked on an earlier try (its hand-back belongs to that try, which already ended).
 * T-743: or `agentId` is the worker a restart symcc did itself stopped on this try (a new worker goes on with it).
 */
export function notThisTry(t: BoardTask, agentId: string): boolean {
  const last = t.runs?.at(-1)
  const cur = workerIdOf(t)
  if (cur && cur !== agentId) return true
  return cur !== agentId && (onTask({ runs: t.runs?.slice(0, -1) }, agentId) || restartedAgent(last, agentId))
}

/**
 * T-743: "try 2: worker restarted after the app was reopened (role tester)", the 'stage' line of a try whose new worker
 * goes on with the same try after a restart symcc did itself (`why`: that restart's end note, e.g. "after the app was
 * reopened" or "the plugin reloaded and the old worker was gone").
 */
export function workerRestartedEntry(t: Pick<BoardTask, 'role' | 'attempts'>, why: string): HistoryAdd {
  const w = why.trim()
  const reason = !w ? '' : /^after\b/.test(w) ? ` ${w}` : `: ${w}`
  const role = roleOf(t)
  return ['stage', `try ${t.attempts}: worker restarted${reason}${role === DEFAULT_ROLE ? '' : ` (role ${role})`}`, { try: Number(t.attempts) || 0 }]
}

/** T-452: hand-backs of workers whose task couldn't be marked finished (board.json couldn't be read), by agent id; resumeKept finishes them. */
const keptHandBacks = new Map<string, { w: Worker; answer: string; end: TurnEnd; tokens?: SymccTokens; cost?: number }>()

/** Whether task `id` has a worker's hand-back kept until board.json can be read again (see keptHandBacks). */
const keptFor = (id: string) => [...keptHandBacks.values()].some(k => k.w.task === id)

/** T-452: board.json can be read again: each kept hand-back is finished as usual (tests, merge); one that fails to again is kept again. */
function resumeKept(host: Host) {
  for (const [agentId, k] of [...keptHandBacks]) {
    keptHandBacks.delete(agentId)
    workers.set(agentId, k.w)
    // workerFinished marks the task as finishing before its first wait, so the rest of the check leaves it alone
    void workerFinished(host, agentId, k.answer, k.end, k.tokens, k.cost).catch(() => undefined)
  }
}

/** T-428: tasks whose checker was stopped before its verdict (see afterChecker): their checker step starts again once the step that ran it is over. */
const checkerAgain = new Set<string>()

/** T-428: task `id`'s checker was stopped before its verdict: a new checker starts now (restartCheckers), not only at the next check. */
async function checkerAgainNow(host: Host, id: string) {
  if (!checkerAgain.delete(id)) return
  const agents = await agentsNow(host)
  if (agents) await restartCheckers(host, agents).catch(() => undefined)
}

/** What withLimit gives back when the step ran over its limit. */
const OVER = Symbol('over')

/**
 * Runs a checking and merging step (`run`) whose merge turns have a time limit of `ms` (none when null; see
 * stepLimit). `run` gets `gaveUp` (whether the step was given up), `over` (settles when it is) and `limit` (the
 * TurnLimit to hand to its merge turns, only with a limit). Returns the step's result, or OVER when it ran over:
 * then the step is left to end on its own, its errors ignored.
 */
async function withLimit<T>(host: Host, ms: number | null, run: (gaveUp: () => boolean, over: Promise<unknown>, limit?: TurnLimit) => Promise<T>): Promise<T | typeof OVER> {
  let gaveUp = false
  let letGo = () => {}
  const over = new Promise<typeof OVER>(r => (letGo = () => r(OVER)))
  const limit = ms === null ? undefined : stepLimit(host, ms, () => ((gaveUp = true), letGo()))
  const step = run(() => gaveUp, over, limit)
  // with no limit (or no timer in this Claude Code) `over` never settles
  const how = await Promise.race([step, over])
  limit?.stop()
  if (how === OVER) step.catch(() => undefined)
  return how
}

/**
 * The time limit of a step's merge turns (one limit, see finishLimitMs): `over` runs once a turn has run `ms`.
 * The merge line starts it from zero when a turn begins and stops it when the turn ends, so waiting in line (and the
 * checker, which has its own limit) never counts. Nothing runs when this Claude Code has no timer.
 */
function stepLimit(host: Host, ms: number, over: () => void): TurnLimit {
  let fired = false
  let timer: { cancel(): void } | null = null
  const stop = () => void (timer?.cancel(), (timer = null))
  const fire = () => void (fired || ((fired = true), over()))
  return { start: () => void (stop(), fired || (timer = afterMs(host, ms, fire))), stop }
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
 * Task `id`'s merge turn (of try `tryNo`) ran over its limit (`limitMs`, see finishLimitMs) and was given up. While it is
 * still "doing" on that try, it is one normal failed try (ranOverTry): back to "todo" for a new try while it has
 * automatic retries left (its folder and branch are kept), else failed. Done instead when its work already reached its
 * branch. The lead is told once.
 */
async function finishRanOver(host: Host, id: string, tryNo: number, limitMs: number) {
  const min = Math.round(limitMs / 60_000)
  const still = (t: BoardTask | undefined): t is BoardTask => t?.status === 'doing' && t.attempts === tryNo
  const before = find(await load(host).catch(() => null) ?? emptyBoard(), id)
  if (!still(before)) return
  const sha = mergedThisTry(before) ?? (S.gitState === 'ok' ? await alreadyMerged(host, before).catch(() => null) : null)
  const out = await change(host, x => {
    const cur = find(x, id)
    if (!still(cur)) return [x, null] as [Board, null]
    const retries = x.auto_retries ?? DEFAULT_AUTO_RETRIES
    const next = sha ? mergedDone(cur, sha, `sent back to todo (its checking and merging ran over ${min} min)`, now()) : ranOverTry(cur, min, retries)
    return [putTask(x, next), { t: cur, next, retries }] as [Board, { t: BoardTask; next: BoardTask; retries: number }]
  })
  if (!out) return
  const { t, next, retries } = out
  if (sha) tellLead(host, `✓ ${id} "${t.title}" is done: its checking and merging ran over ${min} minutes, but its work was already merged (${shortSha(sha)}).`)
  else tellLead(host, ranOverText(next, min, retries))
}

/**
 * Task `t` after its merge turn ran over `min` minutes and was stopped: one normal failed try, like failing tests
 * (onTestFail). Back to "todo" with one automatic retry used while it has any of `retries` left, else failed. A try
 * still running ends as stopped; the task no longer waits for the owner's files (a new try merges again).
 */
function ranOverTry(t: BoardTask, min: number, retries: number): BoardTask {
  const { live: _l, test_output: _o, ...rest } = t
  const tries = t.test_tries ?? 0
  const retry = onTestFail(t, retries) === 'retry'
  const note = retry ? `${ranOverNote(min)}; a new try will look at it (${tries + 1} of ${retries})` : `${ranOverNote(min)}; nothing was merged (after ${tries} automatic ${tries === 1 ? 'retry' : 'retries'})`
  return { ...rest, status: retry ? 'todo' : 'failed', note, ...(retry ? { test_tries: tries + 1 } : {}), updated_at: now(), history: withHistory(t.history, now(), tryEntry(t, 'failed', note, { reason: 'timeout' })), ...(t.status === 'doing' ? endedBy(t, now(), 'stopped', ranOverNote(min)) : {}) }
}

/** What the lead is told about task `t` (as ranOverTry left it, with `retries` automatic retries) after its merge turn ran over `min` minutes. */
function ranOverText(t: BoardTask, min: number, retries: number): string {
  if (t.status === 'failed') return `✗ ${t.id} "${t.title}" failed: its checking and merging ran over ${min} minutes and was stopped, and it has no automatic retries left; nothing was merged. Its folder and branch are kept. Look at why the test commands are so slow or hang, then ${S.N.name} retry ${t.id}.`
  return `${t.id} "${t.title}": its checking and merging ran over ${min} minutes and was stopped, so it counts as a failed try; retrying on its own (${t.test_tries ?? 1} of ${retries}), its folder and branch kept. Nothing to do unless it keeps running over.`
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
 * still `status`, "todo" or "failed" for a finish or merge, still in review for an approve), it is done with
 * that commit and the step's commits (`made`) are recorded. Otherwise the lead is told the work landed,
 * so they can decide. The lead is told once either way.
 */
async function landedLate(host: Host, t: SymccTask, sha: string, made: readonly string[], kind: 'finish' | 'approve' | 'merge', status: SymccTask['status']) {
  const fits = (cur: BoardTask) => cur.attempts === t.attempts && (kind === 'approve' ? cur.status === status : [status, 'todo', 'failed'].includes(cur.status))
  const short = shortSha(sha)
  const into = intoOf(t)
  const r = await change(host, x => {
    const cur = find(x, t.id)
    if (!cur || !fits(cur)) return [x, { done: false, cur }] as [Board, { done: boolean; cur?: BoardTask }]
    const next = mergedDone({ ...cur, runs: addCommits(cur.runs, [...made, sha]) }, sha, 'left as given up', now())
    const line = `${tryLabel(cur)}: its checking and merging was given up as stuck, but it ended late and its work was merged into ${into} (${short}), so it is done`
    return [putTask(x, { ...next, history: withHistory(cur.history, now(), ['merged', line, { try: cur.attempts }]) }), { done: true, cur }] as [Board, { done: boolean; cur?: BoardTask }]
  }).catch((e: Error) => {
    tellLead(host, `${t.id} "${t.title}": its given-up checking and merging ended late and its work was merged into ${into} (${short}), but the board could not be updated (${e.message.slice(0, 200)}).`)
    return null
  })
  if (!r) return
  if (r.done) {
    tellLead(host, `✓ ${t.id} "${t.title}" is done after all: its checking and merging was given up as stuck, but it ended late and its work was merged into ${into} (${short}).`)
    if (await removeWorktree(host, t.id, worktreeDir(t.id)).catch(() => false)) await deleteMergedBranch(host, taskBranch(t), into).catch(() => false)
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

/** Refreshes (`on`) or removes task `id`'s "being tested and merged" mark and its check step (Live.checking), only while it is still "doing" with try `tryNo`. */
async function markFinishing(host: Host, id: string, tryNo: number, on = true) {
  // nothing to remove (the task already left "doing", which drops the mark): don't write the board
  if (!on && !hasMark(find(await load(host), id))) return
  await change(host, x => {
    const t = find(x, id)
    if (t?.status !== 'doing' || t.attempts !== tryNo || (!on && !hasMark(t))) return x
    const at = now()
    return patchTask(x, id, { live: { checking: on ? { ...(t.live?.checking ?? { step: 'prep' as const }), at } : undefined } }, t.updated_at)
  })
}
const hasMark = (t: BoardTask | undefined) => !!t?.live?.checking

/** Refreshes (`on`) or removes the check step of task `id` (an approve or a merge waiting for files), only while it is still `status` with try `tryNo`. */
async function markChecking(host: Host, id: string, status: SymccTask['status'], tryNo: number, on = true) {
  if (!find(await load(host), id)?.live?.checking) return
  await change(host, x => {
    const t = find(x, id)
    if (!t?.live?.checking || t.status !== status || t.attempts !== tryNo) return x
    return patchTask(x, id, { live: { checking: on ? { ...t.live.checking, at: now() } : undefined } }, t.updated_at)
  })
}

/**
 * A worker's report arrived but this copy of the plugin doesn't track the agent (it reloaded and
 * hadn't found the worker again yet): when the board still has the agent's task "doing" for this
 * session, the report is taken as that worker's, so its work is still checked and merged.
 */
export async function lateHandBack(host: Host, agentId: string): Promise<boolean> {
  if (isOwnAgent(agentId)) return false
  const b = await load(host).catch(() => null)
  const t = b?.tasks.find(x => workerIdOf(x) === agentId)
  // A task whose worker already handed back (handedBack) is being, or was, checked: not taken again.
  if (!t || t.status !== 'doing' || t.live?.session !== S.me || finishing.has(t.id) || starting.has(t.id) || handedBack(t)) return false
  if ([...workers.values()].some(w => w.task === t.id)) return false
  // T-743: the time limit counts from this worker's own start, not the first start of a try that went on after a reopen
  workers.set(agentId, { task: t.id, worktree: worktreeDir(t.id), branch: taskBranch(t), since: workerSince(t.runs?.at(-1)) ?? Date.now() })
  return true
}

/**
 * What agent `agentId` is on the board, whatever session's copy of the plugin started it (T-471), for the guards:
 * - a running worker: the agent of a task "doing" whose try hasn't handed back yet (its folder is the task's own);
 * - a running checker: the checker recorded on a task "doing" (checkerIdOf);
 * - an ended agent: the agent of a task that isn't running it any more (another status, or its try handed back),
 *   which may do nothing more;
 * undefined when it isn't on the board (the lead's own agents, say), or the project folder isn't known.
 * Nothing is added to `workers` (a hand-back keeps lateHandBack's rule). An unreadable board throws, so a guard
 * refuses rather than lets a call through unchecked (see guardFailed). Each agent found is remembered (rememberOnBoard).
 */
export type OnBoard = { kind: 'worker'; worker: Worker } | { kind: 'checker'; task: string; worktree: string } | { kind: 'ended'; task: string }
export async function agentOnBoard(host: Host, agentId: string): Promise<OnBoard | undefined> {
  if (!agentId || !S.root) return undefined
  const b = await load(host)
  const chk = b.tasks.find(x => x.status === 'doing' && checkerIdOf(x) === agentId)
  const t = b.tasks.find(x => workerIdOf(x) === agentId)
  // T-479: an id kept on a try (its worker, or one of its checkers) that isn't running now has ended
  const was = !chk && !t ? b.tasks.find(x => onTask(x, agentId)) : undefined
  const found: OnBoard | undefined = chk
    ? { kind: 'checker', task: chk.id, worktree: worktreeDir(chk.id) }
    : !t
      ? was
        ? { kind: 'ended', task: was.id }
        : undefined
      : t.status !== 'doing' || handedBack(t) || starting.has(t.id) || queuedWorkers.has(t.id)
        ? { kind: 'ended', task: t.id }
        : { kind: 'worker', worker: { task: t.id, worktree: worktreeDir(t.id), branch: taskBranch(t), since: runStart(t) } }
  if (found) rememberOnBoard(agentId)
  return found
}

/** When task `t`'s current worker started (ms; T-743: its own start on a try that went on after a reopen), or now when the board doesn't say. */
function runStart(t: BoardTask): number {
  return workerSince(t.runs?.at(-1)) ?? Date.now()
}

/**
 * The running worker behind `agentId`, for the guards: from memory, or else from the board (agentOnBoard), whatever
 * session started it. Undefined when it is no running worker. An unreadable board throws.
 */
export async function workerOf(host: Host, agentId: string): Promise<Worker | undefined> {
  const w = workers.get(agentId)
  if (w) return w
  const on = await agentOnBoard(host, agentId)
  return on?.kind === 'worker' ? on.worker : undefined
}

// ---------------- a task changed while its work is checked ----------------
// After a worker finishes, its task stays "doing" while the scope check, the tests and the merge
// run (finishWork; for approve, the task stays "review"). The lead can drop, pause or ask about it
// meanwhile: those write the new status at once, mark the task here, and leave its folder alone
// until the check ends (endCheck). The check then stops before the merge (gated), and settle
// keeps the new status. A change of the task during the check is refused (see tools.ts).

/** Tasks dropped, paused or sent to the owner while their work was being checked: task id → what happened. */
export const stopAsked = new Map<string, string>()

/** Tasks whose check was stopped because symcc was disabled or the board paused: task id → why (e.g. "symcc was disabled"). */
export const offAsked = new Map<string, string>()

/**
 * Symcc was disabled or the board paused (`why`): every check and merge running now stops before the
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
      const y = patchTask(x, id, { status: 'todo', note: `stopped: ${why} while its work was being checked; nothing merged, continues when it is on again`, history: withHistory(cur.history, now(), stoppedEntry(cur, `${why} while its work was being checked; nothing merged, its files are kept`)), ...endedBy(cur, now(), 'stopped', `${why} while its work was being checked`) }, now())
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
 * T-724: the worker handed back its report while commands it started were still running (end.background): its own
 * leftovers are stopped through the host (end.stopBackground; never by name) and a history line says so; the try goes on.
 */
async function stopLeftovers(host: Host, t: SymccTask, end: TurnEnd) {
  const running = end.background?.length ?? 0
  if (!running) return
  const stopped = end.stopBackground ? await end.stopBackground().catch(() => 0) : 0
  const cmds = (n: number) => plural(n, 'command')
  const text = stopped >= running ? `stopped ${cmds(stopped)} still running at hand-back` : stopped > 0 ? `stopped ${cmds(stopped)} of ${running} still running at hand-back` : `${cmds(running)} still running at hand-back (could not stop ${running === 1 ? 'it' : 'them'})`
  await change(host, x => {
    const cur = find(x, t.id)
    return cur && cur.status === t.status && cur.attempts === t.attempts ? patchTask(x, t.id, { history: withHistory(cur.history, now(), tryEntry(t, 'step', text)) }, now()) : x
  })
}

/**
 * T-411: when the answer's text reads as ended before its work finished (endedEarlyLine), a warning note goes to the
 * task's history and the lead's board update. Only a warning: the text check can be wrong, so the try goes on as usual.
 */
async function warnEndedEarly(host: Host, t: SymccTask, answer: string) {
  const line = endedEarlyLine(answer)
  if (!line) return
  const note = endedEarlyNote(t.id, line)
  await change(host, x => {
    const cur = find(x, t.id)
    return cur && cur.status === t.status && cur.attempts === t.attempts ? patchTask(x, t.id, { history: withHistory(cur.history, now(), tryEntry(t, 'step', `warning: ${note}`)) }, now()) : x
  })
  tellLead(host, note)
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
async function changedMeanwhile(host: Host, t: SymccTask, b: Board, r: CheckResult, line: HistoryAdd, worktree: string, agentId?: string) {
  const merged = r.ok && !r.review && !!r.merged
  const off = offAsked.get(t.id)
  const was = await change(host, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, null] as [Board, null]
    const late = off ? `${off} while it was being merged, too late` : `it was ${cur.status} while being merged, too late`
    const y = merged
      ? patchTask(x, t.id, { status: 'done', note: off ? `merged; ${off} too late to stop it` : `merged; it was ${cur.status} too late to stop it`, merge_main: undefined, test_output: undefined, ...(r.notes?.length ? { research_notes: r.notes } : {}), history: withHistory(cur.history, now(), line, tryEntry(t, 'merged', `${late}: the work was already merged, so it stays done`)), ...(cur.attempts === t.attempts && cur.runs?.length ? { runs: withEnd(cur.runs, 'finished', 'merged', true) } : {}) }, now())
      : patchTask(x, t.id, { history: withHistory(cur.history, now(), notUsedEntry(line, off ?? `the task was ${cur.status} meanwhile`)) }, now())
    return [y, cur.status] as [Board, string]
  })
  if (!was) return
  if (!merged) {
    tellLead(host, off ? `${t.id} "${t.title}" was stopped while its work was being checked (${off}); nothing was merged and it is ${was} again, its files kept.` : `${t.id} "${t.title}" was ${was} while its work was being checked; nothing was merged and it stays ${was}.`)
    return
  }
  if (off) {
    sayDone(host, b, t.id)
    if (await removeWorktree(host, t.id, worktree, agentId, true).catch(() => false)) await deleteMergedBranch(host, taskBranch(t), intoOf(t))
    tellLead(host, `✓ ${t.id} "${t.title}" is merged: ${off} too late, after the merge had already happened, so it is done.`)
    return
  }
  sayDone(host, b, t.id)
  if (await removeWorktree(host, t.id, worktree, agentId, true).catch(() => false)) await deleteMergedBranch(host, taskBranch(t), intoOf(t))
  tellLead(host, `✓ ${t.id} "${t.title}" is merged: it was ${was} too late, after the merge had already happened, so it is done.`)
}

/**
 * Why a try whose turn ended on an API error or a refusal failed: "the worker's turn ended on an error", or "the model refused: <its explanation>".
 * T-928: when the host knows the session's error (`end.error`), it is said ("… ended on an error: <it>"), and a usage or provider limit is named so.
 */
export function endFailure(end: TurnEnd): string {
  if (end.reason === 'error') {
    // its last full stop goes, as the note is followed by "; nothing was checked …" or ", so …"
    const said = cutLine(String(end.error ?? '').replace(/\s+/g, ' ').trim(), 300).replace(/\.+$/, '')
    if (!said) return "the worker's turn ended on an error (retries used up or the context limit)"
    return `the worker's turn ended on an error${isUsageLimit(said) ? ' (usage limit)' : ''}: ${said}`
  }
  const said = [end.refusal?.category, end.refusal?.explanation].filter(Boolean).join(': ')
  return `the model refused to go on${said ? ` (${cutLine(said, 300)})` : ''}`
}

/** What the lead is told when a worker asked a question (ask_owner) and its task now waits for the owner. */
export const workerQuestionText = (id: string, question: string, options?: readonly string[]) =>
  `${id} is waiting for the owner: ${question}${/[.?!]$/.test(question) ? '' : '.'}${options?.length ? ` Options: ${options.join(' | ')}.` : ''} Answer it yourself only if the owner already clearly said the answer: then ${S.N.name} change ${id} with answer: that answer, and tell the owner what you answered. Otherwise ask the owner in the chat now, plain and short${options?.length ? `, offering the options ${optionsVia(options.length)}, plus "or answer on the board"` : ', and say they can also answer on the board'}; put their answer into the task with ${S.N.name} change ${id} and answer: their words. If they answer on the board first (a "Meanwhile" line), don't ask again.${popupTied(id)}`

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
 * then on it merges nothing and writes no outcome. `release` settles at that moment (see inMergeLine).
 * `turn`: stops and restarts its time limit around the merge turn (see checkAndMerge).
 * What happens is decided from what the try recorded on the board (try_question, try_refused) and why its turn ended, never from the hand-back's text (which
 * stays its report, an investigation's answer; it only adds a warning, see warnEndedEarly), in this order: a question (ask_owner) → waiting with it; edits refused
 * as outside the task's files → waiting for those files (nothing merged, even with half-done edits); stopped → failed;
 * an API error or a refusal → failed with the reason; the host saw a background command still running (end.background) with no report → failed (ENDED_EARLY_NOTE);
 * else done (T-724: commands still running at a hand-back with a report are stopped first, see stopLeftovers): checked and merged (an investigation: its answer).
 * Once the try has ended (its outcome written), the folder's .scratch/ throwaway folder is emptied (clearScratch, T-456);
 * not when the task changed meanwhile, was given up, or a checker starts again there.
 */
export async function finishWork(host: Host, agentId: string, w: Pick<Worker, 'task' | 'worktree' | 'branch'>, answer: string, end: TurnEnd = { reason: 'answer' }, gaveUp: () => boolean = () => false, release?: Promise<unknown>, limit?: TurnLimit) {
  const ended = await finishTry(host, agentId, w, answer, end, gaveUp, release, limit)
  if (ended && !gaveUp()) await clearScratch(host, w.worktree).catch(() => false)
}

/** finishWork's body: true when this try's outcome was written (its folder's .scratch/ may be emptied), false when it was not ours to end. */
async function finishTry(host: Host, agentId: string, w: Pick<Worker, 'task' | 'worktree' | 'branch'>, answer: string, end: TurnEnd, gaveUp: () => boolean, release?: Promise<unknown>, limit?: TurnLimit): Promise<boolean> {
  const letGo = handBackHolds.get(w.task)
  handBackHolds.delete(w.task)
  try {
    return await finishTryBody(host, agentId, w, answer, end, gaveUp, release, limit, letGo)
  } finally {
    await letGo?.()
  }
}

async function finishTryBody(host: Host, agentId: string, w: Pick<Worker, 'task' | 'worktree' | 'branch'>, answer: string, end: TurnEnd, gaveUp: () => boolean, release: Promise<unknown> | undefined, limit: TurnLimit | undefined, letGo: (() => Promise<void>) | undefined): Promise<boolean> {
  const b = await load(host)
  const t = find(b, w.task)
  if (!t || t.status !== 'doing') return false // changed or dropped meanwhile
  await saveReport(host, t, answer)
  // T-632: its "Learned:" lines are only suggestions for org-mem, kept on the task for the lead (see keepSuggestions)
  await keepSuggestions(host, t.id, answer)
  const summary = cutLine(answer, 600) || '(no summary)'
  // Its time was up: what it handed back is its report; the task fails with its work kept, nothing is merged.
  if (t.live?.wrap_up) {
    const limit = timeLimitOf(b.max_minutes, t)
    // An investigation's hand-back is its answer so far: it still goes to review for the owner to read.
    if (isInvestigation(t)) {
      if (gaveUp()) return false
      await answered(host, t, answer, summary, limit, agentId)
      return true
    }
    if (await writeIfSame(host, t, cur => ({ status: 'failed', note: outOfTimeNote(limit), history: withHistory(cur.history, now(), tryEntry(t, 'out-of-time', `out of time; handed back: ${cutLine(summary, 300)} (its work so far is kept in its folder and branch)`, { reason: 'timeout' })), ...endedBy(cur, now(), 'timed out', `ran over ${limit} min`) }))) return false
    tellLead(host, `${t.id} "${t.title}": its time (${limit} minutes) was up, so its worker wrote down what it had and handed back, and the task failed. Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${t.id}); a retry (${S.N.name} retry) continues from there. Or split it, or drop it.`)
    return true
  }
  const q = t.live?.ask
  const need = isInvestigation(t) ? [] : (t.live?.refused ?? [])
  if (q) {
    // Straight to the owner: the task waits with the question; their answer sends it back to work.
    const question = q.text
    const options = q.options
    if (await writeIfSame(host, t, cur => ({ status: 'waiting', ask: { ...q, text: question.slice(0, 1000), asked_at: now() }, note: 'waiting for you', history: withHistory(cur.history, now(), tryEntry(t, 'asked', `worker asked: ${question}`)), ...endedBy(cur, now(), 'asked', 'question') }))) return false
    sayNeedsYou(host, b, t, question)
    tellLead(host, workerQuestionText(t.id, question, options), { urgent: true })
  } else if (need.length) {
    const question = needFilesQuestion(t.id, need)
    if (await writeIfSame(host, t, cur => ({ status: 'waiting', ask: makeAsk('symcc', question.slice(0, 1000), now(), { files: need }), note: 'waiting for you', history: withHistory(cur.history, now(), tryEntry(t, 'asked', `worker asked for more files: ${need.join(', ')}`)), ...endedBy(cur, now(), 'asked', 'files outside its list') }))) return false
    logNeedsFiles(host, t.id, Number(t.attempts) || 0, need)
    sayNeedsYou(host, b, t, question)
    tellLead(host, `${question}\nThe task now waits for the owner, who can allow the files from the board (Allow on its page). If they agree here instead, ${S.N.name} change ${t.id} with the wider files (that sends it back to work; what the worker already changed is kept). Otherwise ${S.N.name} drop it, or change it to a narrower plan that fits its files.`, { urgent: true })
  } else if (end.reason === 'aborted') {
    if (await writeIfSame(host, t, cur => ({ status: 'failed', note: 'the worker was stopped', history: withHistory(cur.history, now(), tryEntry(t, 'stopped', 'stopped before finishing', { reason: 'stopped' })), ...endedBy(cur, now(), 'stopped', `stopped from ${S.W.app}`) }))) return false
    tellLead(host, `${t.id} "${t.title}": the worker was stopped before finishing.`)
  } else if (end.reason === 'error' || end.reason === 'refusal') {
    const why = endFailure(end)
    if (await writeIfSame(host, t, cur => ({ status: 'failed', note: why, history: withHistory(cur.history, now(), tryEntry(t, 'failed', `${why}; nothing was checked or merged`, { reason: 'other' })), ...endedBy(cur, now(), 'stopped', why) }))) return false
    const limited = end.reason === 'error' && isUsageLimit(end.error)
    tellLead(host, `${t.id} "${t.title}": ${why}, so nothing was checked or merged and the task failed.${limited ? ` This is a usage or provider limit: a retry will likely fail the same way until the owner fixes the provider (or switches models), so tell the owner instead of retrying.` : ''} Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${t.id}); ${S.N.name} retry ${t.id} starts a fresh try that continues from there. Or change, split or drop it.`)
  } else if (end.background?.length && !answer.trim()) {
    // The host saw a background command of it still running when its turn ended with no report: its work isn't done.
    if (await writeIfSame(host, t, cur => ({ status: 'failed', note: ENDED_EARLY_NOTE, history: withHistory(cur.history, now(), resultEntry(t, 'failed', cutLine(summary, 300), `${ENDED_EARLY_NOTE}; nothing was checked or merged`, { reason: 'other' })), ...endedBy(cur, now(), 'stopped', ENDED_EARLY_NOTE) }))) return false
    tellLead(host, `${t.id} "${t.title}": ${ENDED_EARLY_NOTE} (something it started was still running, but ending its turn ends its work), so nothing was checked or merged and the task failed. Its work so far is kept in its folder and branch; ${S.N.name} retry ${t.id} starts a fresh try that continues from there.`)
  } else if (isInvestigation(t)) {
    if (gaveUp()) return false
    await stopLeftovers(host, t, end)
    await warnEndedEarly(host, t, answer)
    await answered(host, t, answer, summary, undefined, agentId)
  } else {
    if (gaveUp()) return false
    await stopLeftovers(host, t, end)
    await warnEndedEarly(host, t, answer)
    if (await waitIfBranchGone(host, b, t, 'merge')) return true
    await change(host, x => (find(x, t.id)?.status === 'doing' && !gaveUp() ? patchTask(x, t.id, { note: PREP_NOTE }, now()) : x))
    const made: string[] = []
    const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
    // T-1029: the quick steps of the hand-back are done: the view is drawn once now, before the long check starts
    await letGo?.()
    // The checker setting: a change that is not docs only gets a checker after its prep step, before it joins the merge line (checkerFirst).
    const first = checkerOn(b) ? checkerFirst(host, t, b, w.worktree, made, stop) : undefined
    const r: CheckResult = await checkAndMerge(host, t, w.worktree, b, 'finish', made, stop, false, release, limit, first).catch((e: Error) => ({ ok: false, reason: 'other' as const, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    // T-428: the checker was stopped before its verdict: the task stays "doing" in its checker step, and a new checker starts (restartCheckers)
    if (r.again) return false
    await finishTail(host, t, b, r, made, summary, w.worktree, agentId, gaveUp)
  }
  return true
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
  // T-440: the branch it merges into was deleted during the tests, the merge-line wait or the checker: it waits with the "branch is gone" question, its work kept, no failed try
  if (r.gone && (await waitIfBranchGone(host, b, t, 'merge'))) return
  if (r.blocked) await holdForFiles(host, t, b, r, resultEntry(t, 'try-result', cutLine(summary, 300), r.detail), worktree, agentId)
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
 * `agents`) gets a new checker on the same branch commit (its work is committed), and then joins the merge line.
 * This is not a new try (no retry is counted). The lead is told once per restart.
 */
export async function restartCheckers(host: Host, agents: HostAgent[]) {
  const b = await load(host).catch(() => null)
  if (!b || !onHere(b)) return
  const live = liveDriver(await readLeadText(host), Date.now())
  const adoptedIds = new Set([...adoptedCheckers.values()].map(v => v.id))
  const running = new Set([...checkerRuns].filter(([id]) => !adoptedIds.has(id)).map(([, r]) => r.task))
  const checkerAlive = (id: string) => agents.some(a => a.name === checkerName(S.N.name, id) && !stopped.has(a.id) && !ENDED_STATUSES.includes(a.status))
  const lost = b.tasks.filter(t => t.status === 'doing' && t.live?.phase === 'checker' && handedBack(t) && ownedHere(t, S.me, live) && !finishing.has(t.id) && !approving.has(t.id) && !starting.has(t.id) && !running.has(t.id) && !onPurpose.has(t.id) && ![...workers.values()].some(w => w.task === t.id) && (!checkerAlive(t.id) || adoptedCheckers.has(t.id)))
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
  let go: { b: Board; t: SymccTask; dir: string } | undefined
  try {
    const b = await load(host)
    const t = find(b, id)
    if (!t || !sameTry(t, t0) || t.live?.phase !== 'checker') return
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
    const note = "restarted: its checker stopped when the plugin reloaded, and its folder couldn't be read to start it again"
    if (await folderGone(host, t0, note, `${id} "${t.title}": its checker stopped when the plugin reloaded and could not be started again (its folder couldn't be read), so it goes back to todo; the next try goes on from the same branch. This is not counted as a retry.`)) return
    await markFinishing(host, id, tryNo).catch(() => undefined)
    // told once: a start tried again because the agent type wasn't loaded yet is the same restart
    if (!checkerNotReady.has(id) && !adoptedCheckers.has(id)) tellLead(host, `${id} "${t.title}": its checker stopped when the plugin reloaded, so I started a new checker on the same work. This is not counted as a retry; nothing to do.`)
    go = { b, t, dir }
  } finally {
    if (!go) await endFinishing(host, id, tryNo)
  }
  const { b, t, dir } = go
  await finishUnderLimit(host, id, tryNo, finishLimitMs(mergeTestCount(b), testMinutesOf(b)), (gaveUp, over, limit) => checkerStepAgain(host, t, b, dir, true, gaveUp, over, limit))
}

/**
 * Whether task `t0`'s folder can't be read any more (no commit in it). Then the task goes back to "todo" with `note`
 * (only while it is still on the same try), and the lead is told `tell`.
 */
async function folderGone(host: Host, t0: BoardTask, note: string, tell: string): Promise<boolean> {
  const head = await git(host, ['rev-parse', '-q', '--verify', 'HEAD'], worktreeDir(t0.id)).catch(() => null)
  if (head && head.exitCode === 0 && head.stdout.trim()) return false
  const back = await change(host, x => {
    const cur = find(x, t0.id)
    return cur && sameTry(cur, t0) ? ([putTask(x, backToTodo(cur, note, now())), true] as [Board, boolean]) : ([x, false] as [Board, boolean])
  })
  if (back) tellLead(host, tell)
  return true
}

/**
 * The checker step of task `t` (in folder `dir`) run again after a reload: its prep step passed before, so its work is
 * committed. With `fromChecker` (its checker was lost, see restartCheckers) anything the old checker left in the folder is
 * thrown away first (so the prep step commits none of it), and a new checker always runs; then the check runs as after a
 * hand-back: prep, the checker, and on its OK the merge line. Without it (its test and merge was cut off, see mergeAgain)
 * a checker runs first only when the checker setting is on and this try has no checker OK yet.
 */
async function checkerStepAgain(host: Host, t: SymccTask, b: Board, dir: string, fromChecker: boolean, gaveUp: () => boolean, release: Promise<unknown>, limit?: TurnLimit) {
  const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
  const made: string[] = []
  const why = fromChecker ? stop() : undefined
  if (fromChecker && !why && !adoptedCheckers.has(t.id)) await cleanFolder(host, dir)
  // T-1068: a checker that kept running over the reload is only waited for (no prep, no folder clean: its try's prep ran before);
  // its verdict then goes on as a fresh checker's would, through the merge line's prep
  const adoptedWas = fromChecker && !why && adoptedCheckers.has(t.id)
  const waited = adoptedWas ? await afterChecker(host, t, b, dir, made, stop, true) : undefined
  const checker = fromChecker || (checkerOn(b) && !t.history.some(h => h.text === checkerLine(tryLabel(t), { ok: true })))
  const r: CheckResult = why
    ? taskWasResult(why)
    : await checkAndMerge(host, t, dir, b, 'finish', made, stop, false, release, limit, adoptedWas ? async () => waited : checker ? checkerFirst(host, t, b, dir, made, stop, true) : undefined).catch((e: Error) => ({ ok: false, reason: 'other' as const, detail: `checking failed: ${e.message.slice(0, 300)}` }))
  // the checker's agent type isn't loaded yet (just after a reload): the task stays "doing" in its checker step, and the next check starts it again (restartCheckers)
  if (r.again) return
  await finishTail(host, t, b, r, made, await reportSummary(host, t), dir, workerIdOf(t), gaveUp)
}

/**
 * T-733: task `t0`'s test and merge was cut off by a reload (sendBackIdle found it "doing" with a finishing mark no copy
 * refreshes any more): the same branch goes back into the merge line (prep, catch up, test, merge) with the same finishing
 * mark, heartbeat and time limit as a hand-back, instead of failing the try. A checker runs first only when the checker
 * setting is on and this try has no checker OK yet. The history says "tests cut off by a reload; testing again"; at most
 * AGAIN_MAX times per try (sendBackIdle sends it back to todo after that). `finishing` is already taken by sendBackIdle.
 */
async function mergeAgain(host: Host, t0: BoardTask) {
  const id = t0.id
  const tryNo = t0.attempts
  let go: { b: Board; t: SymccTask; dir: string } | undefined
  try {
    const b = await load(host)
    const t = find(b, id)
    if (!t || !sameTry(t, t0)) return
    const dir = worktreeDir(id)
    const note = "restarted: its test and merge stopped before the end (the plugin reloaded), and its folder couldn't be read to test it again"
    if (await folderGone(host, t0, note, `${id} "${t.title}": its test and merge stopped when the plugin reloaded and could not be started again (its folder couldn't be read), so it goes back to todo; the next worker goes on from the same folder and branch.`)) return
    await noteAgain(host, t, RELOAD_AGAIN)
    await markFinishing(host, id, tryNo).catch(() => undefined)
    tellLead(host, `${id} "${t.title}": its test and merge stopped when the plugin reloaded, so I put the same branch back in the merge line to test and merge it again. This is not a new try; nothing to do.`)
    go = { b, t, dir }
  } finally {
    if (!go) await endFinishing(host, id, tryNo)
  }
  const { b, t, dir } = go
  await finishUnderLimit(host, id, tryNo, finishLimitMs(mergeTestCount(b), testMinutesOf(b)), (gaveUp, over, limit) => checkerStepAgain(host, t, b, dir, false, gaveUp, over, limit))
}

/** The worker's report of task `t`'s current try, cut short (from its report file), for the history line. */
async function reportSummary(host: Host, t: SymccTask): Promise<string> {
  const rel = t.runs?.at(-1)?.report
  const text = rel ? await host.fs.read(path(rel)).catch(() => '') : ''
  return cutLine(text, 600) || '(no summary)'
}

/**
 * T-551: the checker step of task `t` (checkAndMerge's `first`), run once its prep step passed and before it joins
 * the merge line, on its own change in folder `dir`, so checkers of several tasks run side by side. A docs-only change
 * skips it (see docsOnly). Otherwise a checker tries to break it (afterChecker).
 * `restarted`: a checker started again after a reload (see afterChecker).
 */
const checkerFirst = (host: Host, t: SymccTask, b: Board, dir: string, made: string[], stop: () => string | undefined, restarted = false) => async (changed: readonly string[]): Promise<BeforeLine> => {
  if (docsOnly(changed)) {
    // T-846: the board's Live lanes draw check as skipped once they know this try's commit changed only docs
    await change(host, x => {
      const cur = find(x, t.id)
      const runs = cur?.runs
      if (!cur || !runs?.length) return x
      return patchTask(x, t.id, { runs: runs.map((r, i) => (i === runs.length - 1 ? { ...r, docs_only: true as const } : r)) }, cur.updated_at)
    }).catch(() => undefined)
    return undefined
  }
  const why = stop()
  if (why) return { result: taskWasResult(why) }
  return afterChecker(host, t, b, dir, made, stop, restarted)
}

/**
 * Task `t`'s finished work passed its prep step: a checker tries to break it (runChecker; it has its own time limit, and
 * runs outside the merge line, so the step's limit doesn't count it). OK: undefined, the task joins the merge line
 * (catch up, tests, then review or merge: its tests run once, there). Problems: a result like failing tests, with the
 * checker's report, so settle sends it back to its worker (counting a retry) or fails it; it never joins the line.
 * No verdict (the checker was stopped, ran over its time or didn't start): it joins the line and waits for the owner's
 * review after the tests (`noVerdict`).
 */
async function afterChecker(host: Host, t: SymccTask, b: Board, dir: string, made: string[], stop: () => string | undefined, restarted = false): Promise<BeforeLine> {
  // the try's commits are saved now, before the checker runs: a reload meanwhile loses `made`, and the checker step started again (checkerStepAgain) only knows the board
  if (!adoptedCheckers.has(t.id)) await recordCommits(host, t.id, made)
  // `restarted` (a checker started again after a reload): a start that fails only because the agent type isn't
  // loaded yet is tried again at the next check, up to MAX_NOT_READY starts; after that it goes to review as below
  const tryLater = () => {
    const misses = checkerNotReady.get(t.id) ?? 0
    if (onNotReady(misses) === 'fail') return false
    checkerNotReady.set(t.id, misses + 1)
    return true
  }
  // the checkers symcc had stopped before this one ran: one it stops meanwhile (a reload's orphan stop, a halt) is told apart below
  const stoppedBefore = new Set(stopped)
  const c = await runChecker(host, t, b, dir, stop, restarted ? tryLater : undefined)
  const stoppedResult = (why: string): BeforeLine => ({ result: taskWasResult(why) })
  // T-740: symcc stopped this checker (runChecker knows it from symcc's own record of the stop): no verdict, whatever it answered
  if (c.stopped) {
    const why = stop()
    if (why) return stoppedResult(why)
    checkerAgain.add(t.id)
    return { result: { ok: false, again: true, detail: 'the checker was stopped before its verdict; a new checker starts' } }
  }
  // T-428: a checker that only answered "stopped", or that symcc itself stopped, gives no verdict: it found nothing.
  // Its step starts again as after a reload (T-386, restartCheckers), with no retry counted.
  if (c.verdict && 'report' in c.verdict && (stoppedAnswer(c.verdict.report) || (await checkerStopped(host, t.id, stoppedBefore)))) {
    await unsayProblems(host, t, c.verdict.report)
    const why = stop()
    if (why) return stoppedResult(why)
    checkerAgain.add(t.id)
    return { result: { ok: false, again: true, detail: 'the checker was stopped before its verdict; a new checker starts' } }
  }
  if (c.again) return { result: { ok: false, again: true, detail: `the checker couldn't start yet (${c.why}); tried again at the next check` } }
  checkerNotReady.delete(t.id)
  if (c.verdict?.ok) return undefined
  if (c.verdict && 'report' in c.verdict) return { result: { ok: false, checker: true, reason: 'checker', detail: `the checker found problems: ${cutLine(c.verdict.report, 300)}`, testOutput: checkerOutput(c.verdict.report) } }
  const why = stop()
  if (why) return stoppedResult(why)
  return { noVerdict: `the checker gave no verdict (${c.why ?? 'no answer'})` }
}

/** T-428: whether a checker's answer is only "stopped" (what symcc tells an agent it stops to answer), not a problems report. */
export const stoppedAnswer = (answer: string) => /^[\s*_`"'.]*stopped[\s*_`"'.!]*$/i.test(String(answer ?? ''))

/** T-428: whether task `id`'s checker was stopped by symcc while it ran (an agent named as its checker, stopped since `before`). */
async function checkerStopped(host: Host, id: string, before: Set<string>): Promise<boolean> {
  const fresh = [...stopped].filter(a => !before.has(a))
  if (!fresh.length) return false
  const agents = await agentsNow(host)
  return !!agents?.some(a => fresh.includes(a.id) && a.name === checkerName(S.N.name, id))
}

/** T-428: task `t`'s "checker found problems" history line for `report` (written by runChecker) becomes a no-verdict line, as the checker was only stopped. */
async function unsayProblems(host: Host, t: SymccTask, report: string) {
  await change(host, x => {
    const cur = find(x, t.id)
    if (!cur || cur.attempts !== t.attempts) return x
    const said = checkerLine(tryLabel(cur), { ok: false, report })
    const at = cur.history.map(h => h.text).lastIndexOf(said)
    if (at < 0) return x
    const history = [...cur.history]
    history[at] = historyEntry('checker', checkerLine(tryLabel(cur), null, STOPPED_AGAIN), cur.history[at]!.at ?? now(), { try: cur.attempts })
    return patchTask(x, t.id, { history }, now())
  }).catch(() => undefined)
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
async function answered(host: Host, t: SymccTask, answer: string, summary: string, limit?: number, agentId?: string) {
  const text = answer.trim() || '(no answer)'
  const kept = text.length > ANSWER_MAX_CHARS ? `${text.slice(0, ANSWER_MAX_CHARS - 1)}…` : text
  const late = limit !== undefined
  // An errand ends done on its own (nothing for the owner to read first): same end as the owner's Done on an investigation.
  const errand = isErrand(t)
  if (await writeIfSame(host, t, cur => ({ status: 'review', note: late ? ANSWERED_LATE_NOTE : ANSWERED_NOTE, answer: kept, merge_main: undefined, test_output: undefined, time_ask: undefined, wrap_up: undefined, history: withHistory(cur.history, now(), tryEntry(t, 'answered', `answered${late ? ` (time ran out after ${limit} min)` : ''}: ${cutLine(summary, 300)}`)), ...endedBy(cur, now(), late ? 'timed out' : 'finished', late ? `${ANSWERED}; ran over ${limit} min` : finishedNote({ ok: true, detail: '', answered: true })) }))) return
  if (errand) {
    await endInvestigation(host, t, false, agentId)
    tellLead(host, `${t.id} "${t.title}" (errand) is done${late ? ` (its time of ${limit} minutes ran out, so this is what it had)` : ''}; nothing was merged. Its report is on the task (${S.N.name} board task ${t.id}). Tell the owner what it did.`)
    return
  }
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
async function holdForFiles(host: Host, t: SymccTask, b: Board, r: CheckResult, line: HistoryAdd, worktree: string, agentId?: string, quiet = false) {
  const files = r.blocked!
  const note = waitFilesNote(intoOf(t), files)
  const res = await change<SymccTask | 'gone' | boolean>(host, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, 'gone']
    if (cur.status !== t.status || cur.attempts !== t.attempts) return [x, cur]
    const first = !waitsForFiles(cur)
    const status = cur.status === 'review' ? 'review' : 'waiting'
    const y = patchTask(x, t.id, { status, live: { merge_wait: files }, note, ...(first ? { history: withHistory(cur.history, now(), line) } : {}), ...endedBy(cur, now(), 'finished', 'waiting for your files') }, now())
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
 * (BoardTask.live?.merge_wait): each one whose files are out of the way now (or whose branch is not
 * checked out any more) is merged again, with no worker (see mergeWaiting). Not while the board is paused.
 */
export async function retryFileWaits(host: Host) {
  const b = await load(host)
  if (modeOf(b) === 'paused') return
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
      if (stillBlocks(status, blockerFiles(asBlockers(t.live?.merge_wait)!), S.N.dir)) continue
    }
    await mergeWaiting(host, t.id).catch(() => undefined)
    // that merge may have changed the owner's files: look again for the next one
    current = null
    status = null
  }
}

/** The kind of the history entry of a check's result `r`: not finished yet (waits for you, review, files), merged, or failed. */
const resultKind = (r: CheckResult): HistoryKind => (r.blocked || r.ask || r.review ? 'try-result' : r.ok ? 'merged' : 'failed')

/**
 * What happens to task `t` after its work was checked (`r`): back to "todo" for a new try after
 * a conflict or failing tests (while it has tries left), "review" when it waits for the owner,
 * else "done" (merged) or "failed". `summary` is what the worker (or the owner, on approve) said.
 * The lead is told only the outcome: the worker's own report already reached it as the agent's hand-back.
 * A merge the owner approved (`approved`) wakes nobody: it waits as a "Meanwhile" line.
 */
export async function settle(host: Host, t: SymccTask, b: Board, r: CheckResult, summary: string, worktree: string, agentId?: string, approved = false, mergedBy?: 'approved', fromMerge = false) {
  // T-736: an approve (or the merge once the owner's files are out of the way) is not a try of its own: its line keeps no fail reason
  const facts: HistoryFacts = { ...(r.reason && !fromMerge ? { reason: r.reason } : {}), ...(resultKind(r) === 'merged' && !r.earlier ? { how: mergedBy ?? 'own' } : {}) }
  const line: HistoryAdd = resultEntry(t, resultKind(r), cutLine(summary, 300), r.detail, facts)
  // Every write below reads the task again and is skipped when it was dropped, paused or changed meanwhile.
  // A finished worker's try ends with the check's outcome (an approve is not a try: its task is in review, so nothing is set).
  const write = async (patch: (cur: SymccTask) => Partial<BoardTask>) => {
    // T-721: a try that failed a test command keeps that command and the failing tests' names on its run (for the stats)
    const ended = (cur: SymccTask) => {
      const e = endedBy(cur, now(), 'finished', finishedNote(r))
      return e.runs && !r.ok && !r.checker && r.command && r.testOutput !== undefined ? { runs: withFailedTests(e.runs, r.command, r.testOutput) } : e
    }
    const moved = await writeIfSame(host, t, cur => ({ ...patch(cur), ...ended(cur) }))
    if (moved && moved !== 'gone') await changedMeanwhile(host, t, b, r, line, worktree, agentId)
    return !moved
  }
  if (r.ask) {
    // The change was only files whose names look like secrets (see checkAndMerge): nothing merged, the task waits for the owner.
    const ask = r.ask
    const moved = await writeIfSame(host, t, cur => ({ status: 'waiting', ask: makeAsk('symcc', ask.slice(0, 1000), now()), note: 'waiting for you', merge_main: undefined, test_output: undefined, history: withHistory(cur.history, now(), line), ...endedBy(cur, now(), 'asked', 'only secret-looking files') }))
    if (moved) {
      if (moved !== 'gone') await changedMeanwhile(host, t, b, r, line, worktree, agentId)
      return
    }
    sayNeedsYou(host, b, t, ask)
    tellLead(host, `${ask} The task now waits for the owner. Ask them in the chat, plain and short (they can also answer on the board); put their answer into the task with ${S.N.name} change ${t.id} with answer: their words, or ${S.N.name} drop ${t.id}.`, { urgent: true })
    return
  }
  if (r.review) {
    if (!(await write(cur => ({ status: 'review', note: `ready for review: ${r.noVerdict ? `the tests passed, but ${r.noVerdict}` : 'the checks passed'}, nothing merged yet${r.untested ? ` (${r.untested})` : ''}`, merge_main: undefined, test_output: undefined, history: withHistory(cur.history, now(), line) })))) return
    tellLead(host, `${r.noVerdict ? `${t.id}: ${r.noVerdict}. ` : ''}${r.untested ? `${r.untested}. ` : ''}${r.secrets?.length ? `${t.id}: ${secretsLeftText(r.secrets)}. ` : ''}${t.id} "${t.title}" is ready for review. The change is on branch ${taskBranch(t)} (folder ${S.N.dir}/worktrees/${t.id}). Show the owner what changed; then ${S.N.name} approve ${t.id} merges it, or ${S.N.name} reject ${t.id} with a reason sends it back to a fresh worker. The owner may also edit the files in that folder first; approve then commits those edits with the task and runs the tests again.`)
    return
  }
  const retries = b.auto_retries ?? DEFAULT_AUTO_RETRIES
  const tries = t.test_tries ?? 0
  // A clash with the branch it merges into is one normal failed try (T-548): the merge line keeps that branch still
  // during a turn, so the clash is real. Like failing tests it uses one auto retry; the new worker merges that branch in first.
  if (r.conflict && onTestFail(t, retries) === 'retry') {
    const note = `conflicts with the latest ${intoOf(t)}; a new try will merge it in (${tries + 1} of ${retries})`
    if (!(await write(cur => ({ status: 'todo', note, test_tries: tries + 1, test_output: undefined, merge_main: true, history: withHistory(cur.history, now(), line) })))) return
    tellLead(host, `${t.id} "${t.title}" conflicts with the latest ${intoOf(t)}; retrying on its own, the new try merges it in first (${tries + 1} of ${retries}). Nothing to do.`)
    return
  }
  if (r.testOutput !== undefined && onTestFail(t, retries) === 'retry') {
    // Don't fail yet: a new worker gets the failing test output (or the checker's report) and fixes it.
    // T-547: tests that ran out of time fail the same way; the note says so (and to raise test_minutes if they are just slow).
    const note = r.timedOut !== undefined ? timedOutRetryNote(r.timedOut, tries + 1, retries) : `${r.checker ? 'the checker found problems' : 'tests failed'}; a new try will fix them (${tries + 1} of ${retries})`
    if (!(await write(cur => ({ status: 'todo', note, test_tries: tries + 1, test_output: r.testOutput, merge_main: undefined, history: withHistory(cur.history, now(), line) })))) return
    tellLead(host, `${t.id} "${t.title}" ${r.checker ? 'was sent back by the checker' : r.timedOut !== undefined ? `ran out of time in its tests (${r.timedOut} min)` : 'failed its tests'}; retrying on its own (${tries + 1} of ${retries}). Nothing to do.`)
    return
  }
  const detail = r.conflict ? `conflicts with the latest ${intoOf(t)} (after ${tries} automatic ${tries === 1 ? 'retry' : 'retries'})` : r.detail
  const done = resultEntry(t, resultKind(r), cutLine(summary, 300), detail, facts)
  if (!(await write(cur => ({ status: r.ok ? 'done' : 'failed', note: detail.slice(0, 300), merge_main: undefined, failed_on: r.conflict ? 'clash' as const : undefined, test_output: r.testOutput, history: withHistory(cur.history, now(), done), ...(r.ok && r.notes?.length ? { research_notes: r.notes } : {}), ...(r.ok && cur.status === 'waiting' && cur.attempts === t.attempts && cur.runs?.length ? { runs: withEnd(cur.runs, 'finished', 'merged', true) } : {}) })))) return
  if (r.ok) sayDone(host, b, t.id)
  // Merged: its folder goes, then its branch, only when all its work is in the branch it merged into (deleteMergedBranch), so nothing is lost.
  if (r.ok && (await removeWorktree(host, t.id, worktree, agentId, true))) await deleteMergedBranch(host, taskBranch(t), intoOf(t))
  const gaveUp = r.testOutput !== undefined ? `\nIt already had ${tries} automatic ${tries === 1 ? 'retry' : 'retries'}. ${r.checker ? `The checker's report:\n${r.testOutput.replace(/^[^\n]*\n/, '')}` : `The last test run: ${gaveUpTestsText(r.testOutput)}`}` : ''
  if (r.ok && approved) return noteForLead(`✓ ${t.id} "${t.title}" ${r.detail}.`)
  tellLead(host, r.ok ? `✓ ${t.id} "${t.title}" ${r.detail}.${r.untested ? ` ${r.untested}: add a test task, or ask the owner.` : ''}` : `✗ ${t.id} "${t.title}" was not merged: ${detail}${gaveUp}`)
}

/** How the last Approve, Done, Keep as a note or Merge now of each task ended: 'merged', 'done' (an investigation's Done), or 'failed'. */
const outcomes = new Map<string, 'merged' | 'done' | 'failed'>()
/** How task `id`'s last Approve, Done, Keep as a note or Merge now ended (see outcomes); undefined when none ran. */
export const mergeOutcome = (id: string) => outcomes.get(id)

/**
 * The owner approved task `id` (in "review"): the same checked merge as for a finished worker. An answered
 * investigation has nothing to merge: approve is its Done (see endInvestigation), and `keepNote` its Keep as a note.
 */
export async function approve(host: Host, id: string, keepNote = false): Promise<string> {
  if (!approving.has(id)) outcomes.set(id, 'failed')
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
async function endInvestigation(host: Host, t: BoardTask, keepNote: boolean, handBackFrom?: string): Promise<string> {
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
  const what = commits === null ? `git could not tell whether it has commits ${intoOf(t)} doesn't have` : `it has ${plural(commits, 'commit')} from an earlier change try that ${intoOf(t)} doesn't have`
  const kept = keep ? ` Its branch ${branch} was kept: ${what}. Delete it by hand once that work is not needed.` : ''
  if ((await removeWorktree(host, t.id, worktreeDir(t.id), handBackFrom, handBackFrom !== undefined).catch(() => false)) && !keep) await git(host, ['branch', '-D', branch])
  if (kept) tellLead(host, `${t.id} "${t.title}" is done.${kept}`)
  void pump(host)
  outcomes.set(t.id, 'done')
  if (!added) return `${t.id} done: the answer was read; nothing was merged${kept ? `.${kept}` : ''}`
  return `${t.id} done: the answer was read; nothing was merged. Added ${added.id} "${added.title}": it writes ${added.files[0]} from the answer and merges as usual${kept ? `.${kept}` : ''}`
}

/**
 * Task `id`'s finished work waits only for the owner's files (BoardTask.live?.merge_wait): only the merge
 * step runs again, with no worker (brought up to date, tested only if its branch moved, then
 * merged). A task in review (an approve that was blocked) is approved again.
 */
export async function mergeWaiting(host: Host, id: string): Promise<string> {
  if (!approving.has(id)) outcomes.set(id, 'failed')
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
  const limitMs = finishLimitMs(mergeTestCount(b), testMinutesOf(b))
  // The step shown on the board (BoardTask.live?.checking) is refreshed like a finishing mark, and removed when the merge ends or is given up.
  const beat = everyMs(host, FINISH_BEAT_MS, () => void markChecking(host, t.id, t.status, t.attempts).catch(() => undefined))
  try {
    const how = await withLimit(host, limitMs, (gaveUp, over, limit) => mergeWork(host, t, b, kind, gaveUp, over, limit))
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
 * The merge turn of task `id` (an approve, or a merge waiting for the owner's files) ran over its limit (`limitMs`, see
 * finishLimitMs) and was given up, while the task is still `status`. An approve is not a try: the task stays in review
 * with a note and a history line saying so. A merge waiting for the owner's files is one normal failed try
 * (ranOverTry): a new try while it has automatic retries left, else failed. The lead is told once. Should the work
 * still land later, landedLate marks it done.
 */
async function mergeRanOver(host: Host, id: string, status: SymccTask['status'], kind: 'approve' | 'merge', limitMs: number): Promise<string> {
  const min = Math.round(limitMs / 60_000)
  let retries = DEFAULT_AUTO_RETRIES
  const out = await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== status) return [x, null] as [Board, null]
    if (kind === 'merge') {
      retries = x.auto_retries ?? DEFAULT_AUTO_RETRIES
      const next = ranOverTry(cur, min, retries)
      return [putTask(x, next), next] as [Board, BoardTask]
    }
    const y = patchTask(x, id, { note: `approved, but the merge ran over ${min} min and was given up; approve it again`, live: { merge_wait: undefined }, history: withHistory(cur.history, now(), resultEntry(cur, 'failed', 'approved by the owner', `its checking and merging ran over ${min} min and was given up; nothing written, it stays ${STATUS_WORD_OF(status)}`)) }, now())
    return [y, cur] as [Board, BoardTask]
  }).catch(() => null)
  const late = out ? null : find(await load(host).catch(() => null) ?? emptyBoard(), id)
  if (late?.status === 'done' && late.merged) return `${id} is done: its checking and merging ran over ${min} minutes, but its work was merged into ${intoOf(late)} (${shortSha(late.merged)}) after all.`
  if (kind === 'approve') {
    if (out) tellLead(host, `${id} "${out.title}": the owner's approve ran over ${min} minutes and seemed stuck, so I stopped waiting for it. It stays in review; approve it again to retry the merge.`)
    return `${id} was not merged and stays in review: its checking and merging ran over ${min} minutes and was given up. Approve it again.`
  }
  if (out) tellLead(host, ranOverText(out, min, retries))
  if (out?.status === 'failed') return `${id} was not merged and failed: its checking and merging ran over ${min} minutes and was stopped, with no automatic retries left.`
  return `${id} was not merged: its checking and merging ran over ${min} minutes and was stopped, so it counts as a failed try; a new try starts on its own.`
}

/** How a status is said in a history line: "in review", "waiting". */
const STATUS_WORD_OF = (s: SymccTask['status']) => (s === 'review' ? 'in review' : s)

/** The body of mergeFinished, once the task is marked as being merged. `gaveUp`, `release`, `limit`: as for finishWork. */
async function mergeWork(host: Host, t: SymccTask, b: Board, kind: 'approve' | 'merge', gaveUp: () => boolean, release: Promise<unknown>, limit?: TurnLimit): Promise<string> {
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
      return patchTask(x, t.id, { note: PREP_NOTE, ...(edits.length ? { history: withHistory(cur.history, now(), ['files-widened', ownerEditedLine(edits)]) } : {}) }, now())
    })
    const made: string[] = []
    const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
    const r: CheckResult = await checkAndMerge(host, t, dir, b, kind, made, stop, retest, release, limit).catch((e: Error) => ({ ok: false, reason: 'other' as const, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    // Given up meanwhile: mergeRanOver already wrote its note; this late outcome is not written over
    // it, unless the work reached the branch after all (landedLate).
    if (gaveUp()) {
      await landIfMerged(host, t, r.merged, made, kind, status)
      return ''
    }
    await recordCommits(host, t.id, made, r.merged)
    const cur = find(await load(host), t.id)
    if (r.merged) {
      outcomes.set(t.id, 'merged')
      // The work is on the target branch: the task is done, whatever happened to it meanwhile
      // (settle marks it done; when it changed meanwhile, with a line saying the change came too late).
      const sha = shortSha(r.merged)
      if (!cur) {
        tellLead(host, `${t.id} "${t.title}" was merged into ${intoOf(t)} (${sha}), but it is no longer on the board.`)
        return `${t.id} was merged into ${intoOf(t)} (${sha}), but it is no longer on the board`
      }
      await settle(host, t, b, r, by, dir, undefined, kind === 'approve', kind === 'approve' ? 'approved' : undefined, true)
      const off = offAsked.get(t.id)
      if (off && cur.status === status) {
        await change(host, x => {
          const c = find(x, t.id)
          return c?.status === 'done' ? patchTask(x, t.id, { history: withHistory(c.history, now(), tryEntry(t, 'merged', `${off} while it was being merged, too late: the work was already merged, so it stays done`)) }, now()) : x
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
        return c?.status === status ? patchTask(x, t.id, { note: `${kind === 'approve' ? 'approved, but ' : ''}not merged: ${off} first; ${again}`, history: withHistory(c.history, now(), resultEntry(t, 'not-merged', by.replace(/^merged /, 'merging '), `not merged: ${off} while it was being merged; it ${stays}`)) }, now()) : x
      })
      return `${t.id} was not merged and ${stays}: ${off} while it was being merged. ${kind === 'approve' ? 'Approve it again.' : `Retry it, or it merges at a later check.`}`
    }
    // T-440: the branch it merges into was deleted while it was being merged: it waits with the "branch is gone" question
    if (r.gone && (await waitIfBranchGone(host, b, t, 'merge'))) return `${t.id} was not merged: the branch it merges into, ${intoOf(t)}, is gone; it now waits for your answer`
    if (r.blocked) {
      // Only the owner's files are in the way: it waits for them (merge_wait); the regular check merges it once they are clear.
      await holdForFiles(host, t, b, r, resultEntry(t, 'try-result', kind === 'approve' ? 'approved by the owner' : 'merging again', r.detail), dir, undefined, kind === 'approve')
      return `${t.id} was not merged and ${stays}: ${r.detail}.`
    }
    if (kind === 'approve' && retest && r.testOutput !== undefined) {
      // The owner's edits fail the tests: it stays in review with the output, not sent to a worker.
      const folder = `${S.N.dir}/worktrees/${t.id}`
      await change(host, x => {
        const c = find(x, t.id)
        return c?.status === 'review' ? patchTask(x, t.id, { note: `approved, but your edits fail the tests: ${r.detail.slice(0, 220)}`, live: { merge_wait: undefined }, test_output: r.testOutput, history: withHistory(c.history, now(), resultEntry(t, 'approve-failed', 'approved by the owner', `not merged, the tests failed after your edits: ${r.detail.slice(0, 250)}`)) }, now()) : x
      })
      tellLead(host, `${t.id} "${t.title}" was not merged: with the owner's edits the tests fail. It stays in review; the owner can fix the files in ${folder} and approve again.\n${r.testOutput}`)
      return `${t.id} was not merged and stays in review: ${r.detail}. Fix the files in ${folder}, then approve it again (the tests run again).`
    }
    if (kind === 'approve' && !r.ok && !r.conflict && r.testOutput === undefined) {
      // Not the work's fault (e.g. the owner's files could not be updated): it stays in review.
      await change(host, x => (find(x, t.id)?.status === 'review' ? patchTask(x, t.id, { note: `approved, but not merged: ${r.detail.slice(0, 250)}`, live: { merge_wait: undefined } }, now()) : x))
      // An answer that already says to approve again needs no more advice; anything else gets it here.
      const next = /approve \S+ again$/.test(r.detail) ? '.' : '. Fix that, then approve it again.'
      return `${t.id} was not merged and stays in review: ${r.detail}${next}`
    }
    await settle(host, cur, b, r, by, dir, undefined, false, kind === 'approve' ? 'approved' : undefined, true)
    if (r.ok) outcomes.set(t.id, 'merged')
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
    return patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', history: withHistory(cur.history, now(), tryEntry(cur, 'failed', 'the worker ended without a result', { reason: 'noresult' })), ...endedBy(cur, now(), 'stopped', 'the worker ended without a result') }, now())
  })
  if (!failed) return
  tellLead(host, `${w.task} "${t.title}": the worker ended without a result. Retry it (${S.N.name} retry), change it, or drop it.`)
  await publish(host, await load(host))
}

/** `cur` is still "doing" on the same try as `was` (same agent, if any, and same run): nothing took it over or ended it meanwhile. */
function sameTry(cur: BoardTask, was: BoardTask, agentId?: string) {
  return cur.status === 'doing' && workerIdOf(cur) === workerIdOf(was) && (agentId === undefined || (workerIdOf(cur) ?? agentId) === agentId) && (cur.runs?.length ?? 0) === (was.runs?.length ?? 0) && cur.runs?.[cur.runs.length - 1]?.started === was.runs?.[was.runs.length - 1]?.started
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
/**
 * T-428: whether "doing" task `t` was only claimed and its worker queued or starting (its phase is "claimed"), but its
 * worker never started and this copy no longer has it in its start queue (a reload emptied the queue, or the queued
 * start was taken back). Its worker didn't end: it never began. Such a task is unclaimed (see unclaimed), not sent back.
 */
export const queuedNeverStarted = (t: BoardTask) => t.status === 'doing' && t.live?.phase === 'claimed' && !handedBack(t) && !starting.has(t.id) && !queuedWorkers.has(t.id)

/**
 * T-428: task `t`'s claim undone, as if it had never been claimed: "todo" again, its try not counted (attempts back
 * one, the run the claim opened taken off), no history line. The next pump claims it again on the same try number.
 */
export function unclaimed(t: BoardTask, at: string): BoardTask {
  const { live: _l, runs: _r, ...rest } = t
  // T-743: a claim that went on with the same try (goOnRun) opened no run and counted no try: its try ends again as it was
  const back = undoGoOn(t.runs)
  if (back) return { ...rest, status: 'todo' as const, note: '', updated_at: at, runs: back }
  const last = t.runs?.at(-1)
  const runs = last && !last.ended ? t.runs!.slice(0, -1) : t.runs
  return { ...rest, status: 'todo' as const, note: '', attempts: Math.max(0, t.attempts - 1), updated_at: at, ...(runs?.length ? { runs } : {}) }
}

/** T-428: board `b` with every task of this session (or a session that no longer drives, see ownedHere) whose queued worker never started unclaimed (see queuedNeverStarted), except those in `keep` (a live worker works on them after all). */
export function unclaimQueued(b: Board, me: string, live: string | null, at: string, keep: string[] = []): Board {
  return { ...b, tasks: b.tasks.map(t => (queuedNeverStarted(t) && ownedHere(t, me, live) && !keep.includes(t.id) ? unclaimed(t, at) : t)) }
}

export async function sendBackIdle(host: Host, agents: HostAgent[]) {
  const mine = new Set([...workers.values()].map(w => w.task))
  const live = liveDriver(await readLeadText(host), Date.now())
  const working = agents.filter(a => !stopped.has(a.id))
  const free = (t: BoardTask) => t.status === 'doing' && !mine.has(t.id) && !keptFor(t.id) && !starting.has(t.id) && !finishing.has(t.id) && !onPurpose.has(t.id) && !finishingNow(t, Date.now())
  // A handed-back worker's agent may stay listed (idle): it doesn't hold its task any more.
  const idle = (await load(host)).tasks.filter(t => free(t) && ownedHere(t, S.me, live) && (handedBack(t) || !liveWorkersFor(t, working.map(agentState), S.N.name).length))
  const merged = new Map<string, string>()
  for (const t of idle) {
    if (queuedNeverStarted(t)) continue // never started: unclaimed below, not looked up as merged
    const sha = mergedThisTry(t) ?? (S.gitState === 'ok' ? await alreadyMerged(host, t).catch(() => null) : null)
    if (sha) merged.set(t.id, sha)
  }
  const ids = idle.map(t => t.id)
  if (!ids.length) return
  const back: BoardTask[] = []
  const again: BoardTask[] = []
  await change(host, x => ({
    ...x,
    tasks: x.tasks.map(t => {
      // Re-read here: left as it is if its status, agent or run changed since it was picked.
      const was = idle.find(i => i.id === t.id)
      if (!was || !free(t) || !sameTry(t, was) || [...workers.values()].some(w => w.task === t.id)) return t
      // T-428: its worker was only queued and the queue lost it (a reload): it never started, so no try is counted,
      // no "restarted" line is written and the lead is not told; the next pump queues it again on the same try number
      if (queuedNeverStarted(t)) return unclaimed(t, now())
      const sha = merged.get(t.id)
      if (sha) return mergedDone(t, sha, 'sent back to todo', now())
      // T-733: a reload cut off its test and merge: the same branch is tested and merged again (mergeAgain), no new try,
      // at most AGAIN_MAX times per try; taken (finishing) once the board is saved, so a failed save leaves it to the next check.
      // An investigation's result is its answer, never tested or merged: it goes back to todo as before.
      if (t.live?.checking && !isInvestigation(t) && t.live.phase !== 'checker' && againsThisTry(t, RELOAD_AGAIN) < AGAIN_MAX && !again.some(a => a.id === t.id)) {
        again.push(t)
        return t
      }
      back.push(t)
      return backToTodo(t, t.live?.checking ? 'restarted: its test and merge stopped before the end (the plugin reloaded)' : 'restarted: the old worker has ended', now())
    }),
  }))
  for (const t of again) {
    if (finishing.has(t.id)) continue
    finishing.add(t.id)
    void mergeAgain(host, t).catch(() => undefined)
  }
  for (const id of merged.keys()) tellLead(host, `✓ ${id} is done: its work was already merged (${shortSha(merged.get(id)!)}) when the plugin reloaded.`)
  if (back.length) tellLead(host, `${back.map(t => `${t.id} "${t.title}"`).join(', ')}: no worker was working on ${back.length > 1 ? 'them' : 'it'} any more (${back.length > 1 ? 'their workers' : 'its worker'} stopped or ended), so ${back.length > 1 ? 'they go' : 'it goes'} back to todo; the next worker goes on from the same folder and branch.`)
}

/**
 * A hand-back from an agent this copy had stopped (e.g. an orphan after a reload): its report is not
 * taken, but its task must not stay "doing" with nobody on it, so it is put back right away (see sendBackIdle).
 */
export async function stoppedHandBack(host: Host, agentId: string, tokens?: SymccTokens, cost?: number) {
  if (!S.driving || !stopped.has(agentId)) return
  // T-784: what the stopped worker used stays on its agent entry and in its try (open or already ended)
  if (tokens || cost !== undefined) {
    await change(host, x => {
      const t = x.tasks.find(y => y.runs?.some(r => r.agents?.some(a => a.id === agentId && a.kind === 'worker')))
      const runs = t && withStoppedUsed(t.runs, agentId, now(), { tokens, cost })
      return runs && runs !== t!.runs ? patchTask(x, t!.id, { runs }, t!.updated_at) : x
    }).catch(() => undefined)
  }
  const agents = await host.agents.list().catch(() => undefined)
  // a stopped checker's hand-back: its task gets a new checker at once (see restartCheckers)
  if (agents) await restartCheckers(host, agents)
  if (agents) await sendBackIdle(host, agents)
  await pump(host)
}

/** The regular check, every two minutes: keeps work moving and makes sure nothing is stuck or forgotten. */
export async function check(host: Host) {
  // T-884: a queued start whose wake-up was lost is woken again here, not left for the owner's next prompt
  rewakeStarts(host)
  if (!S.driving) return
  await cleanLeftoverTmp(host).catch(() => undefined)
  await stopOrphans(host)
  const b = await load(host)
  resumeKept(host)
  if (!onHere(b)) return
  const agents = await host.agents.list().catch(() => undefined)
  const nowMs = Date.now()
  for (const id of seenEnded) if (!workers.has(id)) seenEnded.delete(id)
  for (const [agentId, w] of [...workers]) {
    // An earlier step of this loop waited (halt, change): the worker may have finished meanwhile.
    if (workers.get(agentId) !== w) continue
    const info = agents?.find(a => a.id === agentId)
    const t = find(b, w.task)
    // T-873: the try's active time from its first start (closed-app gaps left out), as the band and Live tab show
    const minutes = workerActiveMs(t?.status === 'doing' ? t.runs?.at(-1) : undefined, w.since, nowMs) / 60_000
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
    if (t?.status === 'doing' && t.live?.wrap_up) {
      if (nowMs - Date.parse(t.live?.wrap_up) >= WRAP_UP_GRACE_MS) {
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
      if (!t.live?.time_ask) await askOvertime(host, b, w.task, limit)
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
