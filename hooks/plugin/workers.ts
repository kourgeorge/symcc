import type { SymccTask, SymccMode, SymccTokens } from '../../types'
import { type Board, type BoardTask, type RoleDef, roleSection, workerTypeFor, asBaseWorkers, modeOf, symccOn, ready, patchTask, find, mayStart, startRun, findRole, roleOf, workerName, workerDescription, isNotReady, onNotReady, type AgentInfo, ENDED_STATUSES, endRun, parseNeedFiles, tryLabel, needFilesQuestion, parseOptions, onConflict, MAX_CONFLICT_TRIES, DEFAULT_AUTO_RETRIES, onTestFail, reviewTask, ownerEditedLine, gitNote, intoOf, goneBranchQuestion, goneBranchOptions, setMode, modeText, setEnabled, liveDriver, emptyBoard, orphanMove, leftoverTmpFiles, ownedHere, liveWorkersFor, backToTodo, stoppedLine, cutLine, reportFile, reportText, endedBy, withEnd, finishedNote, inPlan, finishingNow, finishingStale, mergedThisTry, mergedDone, handedBack, addCommits, FINISH_BEAT_MS, finishLimitMs, ranOverNote, ranOverBefore, waitsForFiles, blockerFiles, asBlockers, waitFilesNote, stillBlocks, timeLimitOf, hardCapOf, overtimeQuestion, OVERTIME_OPTIONS, OVERTIME_NOTE, WRAP_UP_TEXT, WRAP_UP_GRACE_MS, parseOvertimeAnswer, outOfTimeNote, kindOf, ANSWER_MAX_CHARS, addTask, taskReports, investigationDone, keepNoteTask, noteFilesInUse } from '../board'
import { archiveOld } from './archive'
import { checkHealth } from './health'
import { gitReady, branchExists, homeBranch, prepareWorktree, removeWorktree, git, worktreeDir, cleanupMerged } from './git'
import { publish } from './lead'
import { type CheckResult, checkAndMerge, recordCommits, ownerEdits, alreadyMerged } from './review'
import { loadRoles } from './roles'
import { S, type $, workers, starting, type Worker, notReady, heard, finishing, approving, stopped, scoutRuns, scoutState, leadQueue, meanwhile, sayQueue, tmpWarned, reminded } from './state'
import { load, change, now, path, safeWrite, aboutToWait } from './store'
import { tellLead, noteForLead } from './tell'
import { sayDone, sayNeedsYou } from './voice'

// ---------------- workers ----------------

/** A task's history without the "created by ..." line: what earlier tries did. */
export const tries = (t: SymccTask) => t.history.filter(line => !line.startsWith('created by '))

export const WORKER_PROMPT = (t: BoardTask, b: Board, dir: string, role?: RoleDef) => (kindOf(t) === 'investigation' ? INVESTIGATION_PROMPT(t, dir, role) : CHANGE_PROMPT(t, b, dir, role))

/** The prompt of an investigation's worker: find the answer and hand it back in full; nothing it changes is kept. */
const INVESTIGATION_PROMPT = (t: BoardTask, dir: string, role?: RoleDef) => `You are a ${S.N.name} worker. Do exactly this one investigation, then stop.

This task is an investigation: your job is to find the answer and hand it back in full. Your hand-back is the result; the owner reads it. Nothing is committed, tested or merged.
Your own copy of the project, on branch ${t.branch ?? S.N.branch(t.id)}, is this folder:
  ${dir}
Read whatever you need. You may run read-only commands and experiments, outside the project or in that folder, but any file changes you make in the project are not kept. Never touch the main project folder. Do not run git commit, push or merge.

Task ${t.id}: ${t.title}
${t.details}
${roleSection(role)}${tries(t).length ? `\nEarlier tries:\n${tries(t).slice(-5).map(line => `- ${line}`).join('\n')}\n` : ''}
When you are done, hand back the full answer: what you found, how you know (the files, commands or sources you checked), and anything still unsure. Write it for the owner, in plain words. If you truly cannot continue without the owner deciding something, answer with one line starting "QUESTION:" and the question; the task will wait for the owner's answer and a new try continues with it. If the owner can pick from a few answers, add one more line after it: "OPTIONS: a | b | c" (2 to 6 short choices, split by |).`

/** The prompt of a change's worker: change the files, which are then committed, tested and merged. */
const CHANGE_PROMPT = (t: SymccTask, b: Board, dir: string, role?: RoleDef) => `You are a ${S.N.name} worker. Do exactly this one task, then stop.

Work ONLY inside this folder, your own copy of the project on branch ${t.branch ?? S.N.branch(t.id)}:
  ${dir}
Use absolute paths under that folder for every Read, Edit and Write. Never touch the main project folder.

Task ${t.id}: ${t.title}
${t.details}
${roleSection(role)}
Files you may change: ${t.files.length ? `${t.files.join(', ')}. This is the full list; if you change files anywhere else, those changes are undone and the try fails.
If you find you must change a file outside this list, do NOT change it. Stop at once and answer with just one line:
  NEED FILES: path/a, path/b — <one short reason>
(You don't need to finish anything else first; what you already changed in your folder is kept for the next try.)` : 'whatever the task needs.'}
${b.test_commands.length ? `After you finish, these must pass (run them in that folder to check): ${b.test_commands.join(' && ')}` : 'There is no test command; keep the change small and correct.'}
Do not run git commit, push or merge: ${S.N.name} commits, tests and merges your work.
${t.merge_main ? `\nFirst, ${intoOf(t)} has moved and your branch now conflicts with it. In that folder, run \`git merge ${intoOf(t)}\` and resolve the conflicts (for this one step only you may run that git merge; still don't commit). Keep this task's intent, keep the changes inside the task's files, and make sure the tests pass.\n` : ''}${t.test_output ? `\nYour last try failed these tests; fix it. The end of the test output:\n\`\`\`\n${t.test_output}\n\`\`\`\n` : ''}${tries(t).length ? `\nEarlier tries:\n${tries(t).slice(-5).map(line => `- ${line}`).join('\n')}\nDon't repeat those mistakes.\n` : ''}
When you are done, answer in one or two plain sentences: what you changed. If you truly cannot continue without the owner deciding something, answer with one line starting "QUESTION:" and the question; the task will wait for the owner's answer and a new try continues with it. If the owner can pick from a few answers, add one more line after it: "OPTIONS: a | b | c" (2 to 6 short choices, split by |).`

export async function pump($: $) {
  if (!S.startupDone) return // session.start hasn't finished; it pumps itself at its end
  if (!S.driving) return // another session drives the board and starts its work
  if (inPlan(S.plan)) return // plan mode: nothing starts; workers already running keep going
  const b = await load($)
  if (modeOf(b) === 'off' || !symccOn(b)) return
  if (!ready(b).length) return
  if (!(await gitReady($, b))) return // no git, no repo or no commit yet: nothing starts until it is set up
  for (const t of ready(b)) {
    if (workers.size >= b.max_parallel) break
    if (starting.has(t.id) || checkingNow(t.id) || [...workers.values()].some(w => w.task === t.id)) continue
    await startWorker($, t.id).catch(async (err: Error) => {
      await change($, x => patchTask(x, t.id, { status: 'failed', note: `couldn't start: ${err.message.slice(0, 200)}`, ...endedBy(find(x, t.id), now(), 'stopped', "couldn't start") }, now()))
      tellLead($, `${t.id} couldn't start: ${err.message.slice(0, 300)}`)
    })
  }
}

/**
 * Starts a worker on task `id`, but only if it is still "todo" and no live agent works on it
 * (see mayStart). The claim happens inside change(), so two starts can't both win.
 */
export async function startWorker($: $, id: string) {
  // Not while its last try is still being checked (it was resumed or retried meanwhile): it starts when the check ends.
  if (starting.has(id) || checkingNow(id) || [...workers.values()].some(w => w.task === id)) return
  starting.add(id)
  try {
    const listed = await agentsNow($)
    if (!listed) return // can't see which agents run; try again on the next pump
    const agents = [...listed, ...knownWorkers()]
    const b = await load($)
    const t0 = find(b, id)
    if (!mayStart(t0, agents, S.N.name)) return
    // Its last try's work is already on the branch it merges into (e.g. a reload sent it back, or
    // the owner retried it after it was wrongly failed): it is done, not tried again.
    if (await mergedBeforeStart($, t0!)) return
    // the branch it merges into is gone: it waits for the owner instead of failing
    if (await waitIfBranchGone($, b, t0!, 'start')) return
    const { dir, branch } = await prepareWorktree($, t0!, intoOf(t0!))
    const roles = await loadRoles($)
    const t = await change($, x => {
      const cur = find(x, id)
      if (!mayStart(cur, agents, S.N.name)) return [x, null]
      const at = now()
      const y = patchTask(x, id, { status: 'doing', session: S.me, attempts: cur!.attempts + 1, branch, note: 'worker on it', runs: startRun(cur!.runs, at, !!cur!.merge_main) }, at)
      return [y, find(y, id)!]
    })
    if (!t) return
    const before = find(b, id)!
    let agentId: string
    try {
      const role = findRole(roles, roleOf(t))
      const spawned = await $.agent.spawn({ prompt: WORKER_PROMPT(t, b, dir, role), name: workerName(S.N.name, t.id), description: workerDescription(t.title), subagentType: workerTypeFor(role, S.N.name), cwd: dir, ...(role?.model ? { model: role.model } : {}) })
      if ('deny' in spawned && spawned.deny) throw new Error(spawned.deny)
      if (!('agentId' in spawned) || !spawned.agentId) throw new Error('the worker did not start')
      agentId = spawned.agentId
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      const misses = notReady.get(id) ?? 0
      if (!isNotReady(msg, S.N.name) || onNotReady(misses) === 'fail') {
        notReady.delete(id)
        throw err
      }
      // Not the task's fault: the worker type isn't there yet (e.g. just after a reload).
      // Put the task back as it was, with no try counted; the next pump or check tries again.
      notReady.set(id, misses + 1)
      await change($, x =>
        find(x, id)?.status === 'doing' && find(x, id)?.session === S.me
          ? patchTask(x, id, { status: 'todo', session: before.session, attempts: before.attempts, branch: before.branch, note: before.note, runs: before.runs }, now())
          : x,
      )
      return
    }
    notReady.delete(id)
    workers.set(agentId, { task: id, worktree: dir, branch, since: Date.now() })
    // Record which agent works on the task, so a reloaded copy can find it.
    await change($, x => (find(x, id)?.status === 'doing' ? patchTask(x, id, { agent: agentId }, now()) : x))
  } finally {
    starting.delete(id)
  }
}

/**
 * Whether todo task `t`'s last try's work is already on the branch it merges into (see mergedThisTry
 * and alreadyMerged), whatever ended that try (a reload, a timeout, a retry): then it is marked done
 * here, and the lead is told, instead of starting a new try.
 */
async function mergedBeforeStart($: $, t: BoardTask): Promise<boolean> {
  if (!(t.attempts > 0)) return false
  const sha = mergedThisTry(t) ?? (await alreadyMerged($, t).catch(() => null))
  if (!sha) return false
  const done = await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== 'todo' || cur.attempts !== t.attempts) return [x, false] as [Board, boolean]
    return [{ ...x, tasks: x.tasks.map(y => (y.id === t.id ? mergedDone(cur, sha, 'tried again', now()) : y)) }, true] as [Board, boolean]
  })
  if (done) tellLead($, `✓ ${t.id} "${t.title}" is done: its work (${tryLabel(t)}) was already merged into ${intoOf(t)} (${sha.slice(0, 8)}), so no new try starts.`)
  return done
}

/**
 * When the branch task `t` merges into (intoOf) no longer exists, the task waits for the owner with
 * a question ("branch feature-x is gone: merge into main instead?"; main is the branch checked out
 * now, see homeBranch) instead of failing, and the lead is told. `when`: the task was about to start,
 * or its work was about to be merged. Returns whether the branch is gone (then nothing else happens).
 * Written only while the task is still as it was (same status and try).
 */
export async function waitIfBranchGone($: $, b: Board, t: SymccTask, when: 'start' | 'merge'): Promise<boolean> {
  const into = intoOf(t)
  if (await branchExists($, into)) return false
  const instead = await homeBranch($)
  const question = goneBranchQuestion(into, instead)
  const options = goneBranchOptions(into, instead)
  const asked = await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status !== t.status || cur.attempts !== t.attempts) return [x, false] as [Board, boolean]
    const line = `${when === 'start' ? 'not started' : 'not merged'}: branch ${into} is gone; asked the owner whether to merge into ${instead} instead`
    return [patchTask(x, t.id, { status: 'waiting', question, options, merge_wait: undefined, note: 'waiting for you', history: [...cur.history, line], ...endedBy(cur, now(), 'asked', `branch ${into} is gone`) }, now()), true] as [Board, boolean]
  })
  if (asked) {
    sayNeedsYou($, b, t, question)
    tellLead($, `${t.id} "${t.title}" ${when === 'start' ? "can't start" : "can't be merged"}: the branch it merges into, ${into}, is gone. It now waits for the owner: ${question} An answer of yes moves it to ${instead}; or ${S.N.name} change ${t.id} with merge_into set to an existing branch.`)
    await publish($, await load($))
  }
  return true
}

/** The agents of this session as $.agent.list() reports them; null if the list can't be read. */
export async function agentsNow($: $): Promise<AgentInfo[] | null> {
  const listed = (await $.agent.list().catch(() => null)) as AgentInfo[] | null
  return listed ? asBaseWorkers(listed, S.N.name) : null
}

/** The workers this copy of the plugin started, as agents (they may not be listed yet). */
export const knownWorkers = (): AgentInfo[] => [...workers].map(([id, w]) => ({ id, type: S.N.worker, status: 'running', description: w.task }))

/** How long a reload waits for old workers it stopped to really end. */
export const ORPHAN_WAIT_MS = 20_000

/** Waits up to `ms` until the agents `ids` have ended; returns those still alive (all of them if the list can't be read). */
export async function waitEnded($: $, ids: string[], ms: number): Promise<AgentInfo[]> {
  if (!ids.length) return []
  const until = Date.now() + ms
  for (;;) {
    const agents = await agentsNow($)
    const alive = agents ? agents.filter(a => ids.includes(a.id) && !ENDED_STATUSES.includes(a.status)) : ids.map(id => ({ id, type: S.N.worker, status: 'running' }))
    if (!alive.length || Date.now() > until) return alive
    aboutToWait()
    await $.clock.sleep(500)
  }
}

export async function workerFinished($: $, agentId: string, answer: string, aborted: boolean, tokens?: SymccTokens) {
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
    tryNo = await change($, x => {
      const t = find(x, w.task)
      if (t?.status !== 'doing') return [x, undefined] as [Board, undefined]
      limitMs = finishLimitMs(x.test_commands.length)
      return [patchTask(x, w.task, { finishing: ended, ...(t.runs?.length ? { runs: endRun(t.runs, ended, { tokens }) } : {}) }, ended), t.attempts] as [Board, number]
    })
    if (tryNo !== undefined) beat = everyMs($, FINISH_BEAT_MS, () => void markFinishing($, w.task, tryNo!).catch(() => undefined))
    // The whole step has a time limit (finishLimitMs: it grows with the test commands): the heartbeat above keeps going even when
    // the step hangs, so without it a stuck step would keep its task "doing" forever. Past the limit
    // the step is given up: it may still wake up later, but then it writes nothing (gaveUp).
    const how = await withLimit($, tryNo === undefined ? null : limitMs, (gaveUp, over, turn) => finishWork($, agentId, w, answer, aborted, gaveUp, over, turn))
    if (how === OVER) {
      beat?.cancel()
      beat = null
      finishing.delete(w.task)
      await finishRanOver($, w.task, tryNo!, limitMs)
    }
  } finally {
    beat?.cancel()
    if (tryNo !== undefined) await markFinishing($, w.task, tryNo, false).catch(() => undefined)
    finishing.delete(w.task)
    await endCheck($, w.task)
  }
  await pump($)
}

/** What withLimit gives back when the step ran over its limit. */
const OVER = Symbol('over')

/**
 * Runs a checking and merging step (`run`) under its time limit of `ms` (none when null; see
 * stepLimit). `run` gets `gaveUp` (whether the step was given up), `over` (settles when it is) and
 * `turn` (stepLimit's, only with a limit). Returns the step's result, or OVER when it ran over: then
 * the step is left to end on its own, its errors ignored.
 */
async function withLimit<T>($: $, ms: number | null, run: (gaveUp: () => boolean, over: Promise<unknown>, turn?: (go: boolean) => void) => Promise<T>): Promise<T | typeof OVER> {
  let gaveUp = false
  let letGo = () => {}
  const over = new Promise<typeof OVER>(r => (letGo = () => r(OVER)))
  const limit = ms === null ? null : stepLimit($, ms, () => ((gaveUp = true), letGo()))
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
function stepLimit($: $, ms: number, over: () => void) {
  let fired = false
  const fire = () => void (fired || ((fired = true), over()))
  let timer = afterMs($, ms, fire)
  const on = timer !== null
  const cancel = () => void (timer?.cancel(), (timer = null))
  return { on, cancel, turn: (go: boolean) => void (cancel(), go && on && !fired && (timer = afterMs($, ms, fire))) }
}

/** A one-time timer, if this Claude Code has one ($.clock.after); null when it has none. */
function afterMs($: $, ms: number, f: () => void): { cancel(): void } | null {
  try {
    return $.clock.after(ms, f) ?? null
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
async function finishRanOver($: $, id: string, tryNo: number, limitMs: number) {
  const min = Math.round(limitMs / 60_000)
  const still = (t: BoardTask | undefined): t is BoardTask => t?.status === 'doing' && t.attempts === tryNo
  const before = find(await load($).catch(() => null) ?? emptyBoard(), id)
  if (!still(before)) return
  const sha = mergedThisTry(before) ?? (S.gitState === 'ok' ? await alreadyMerged($, before).catch(() => null) : null)
  const twice = `its checking and merging ran over ${min} min twice in a row and was given up both times; nothing was merged`
  const out = await change($, x => {
    const cur = find(x, id)
    if (!still(cur)) return [x, null] as [Board, null]
    const again = !sha && ranOverBefore(cur)
    const next = sha ? mergedDone(cur, sha, `sent back to todo (its checking and merging ran over ${min} min)`, now()) : again ? ranOverFailed(cur, twice, `its checking and merging ran over ${min} min again`) : backToTodo(cur, `restarted: ${ranOverNote(min)}`, now())
    return [{ ...x, tasks: x.tasks.map(y => (y.id === id ? next : y)) }, { t: cur, again }] as [Board, { t: BoardTask; again: boolean }]
  })
  if (!out) return
  const { t, again } = out
  if (sha) tellLead($, `✓ ${id} "${t.title}" is done: its checking and merging ran over ${min} minutes, but its work was already merged (${sha.slice(0, 8)}).`)
  else if (again) tellLead($, `✗ ${id} "${t.title}" failed: its checking and merging ran over ${min} minutes twice in a row and was given up both times, so no new try starts. Its folder and branch are kept. Look at why the test commands are so slow or hang, then ${S.N.name} retry ${id}.`)
  else tellLead($, `${id} "${t.title}": its checking and merging ran over ${min} minutes and seemed stuck, so I stopped waiting for it and sent it back to todo for a fresh try (its folder and branch are kept). Nothing to do unless it gets stuck again.`)
}

/** Task `t` failed with `note`, its running try ended as stopped (`end`): its checking and merging was given up a second time in a row. */
function ranOverFailed(t: BoardTask, note: string, end: string): BoardTask {
  const { session: _s, finishing: _f, checking: _c, ...rest } = t
  return { ...rest, status: 'failed' as const, note, updated_at: now(), history: [...(t.history ?? []), `${tryLabel(t)}: ${note}`], ...endedBy(t, now(), 'stopped', end) }
}

/** A given-up step of task `t` ended late: when its work reached the branch anyway (`merged`, or else alreadyMerged), landedLate marks it done. */
async function landIfMerged($: $, t: SymccTask, merged: string | undefined, made: readonly string[], kind: 'finish' | 'approve' | 'merge', status: SymccTask['status']) {
  const sha = merged ?? (S.gitState === 'ok' ? await alreadyMerged($, t).catch(() => null) : null)
  if (sha) await landedLate($, t, sha, made, kind, status)
}

/**
 * A step of task `t` that was given up as stuck (`kind`: a finished worker's check, an approve or a
 * merge waiting for the owner's files) ended late, and its work reached the branch it merges into
 * (`sha`). While the task is still as the give-up left it (the same try, not yet started again:
 * "doing", "todo" or "failed" for a finish, still `status` for an approve or merge), it is done with
 * that commit and the step's commits (`made`) are recorded. Otherwise the lead is told the work landed,
 * so they can decide. The lead is told once either way.
 */
async function landedLate($: $, t: SymccTask, sha: string, made: readonly string[], kind: 'finish' | 'approve' | 'merge', status: SymccTask['status']) {
  const fits = (cur: BoardTask) => cur.attempts === t.attempts && (kind === 'finish' ? ['doing', 'todo', 'failed'].includes(cur.status) : cur.status === status)
  const short = sha.slice(0, 8)
  const into = intoOf(t)
  const r = await change($, x => {
    const cur = find(x, t.id)
    if (!cur || !fits(cur)) return [x, { done: false, cur }] as [Board, { done: boolean; cur?: BoardTask }]
    const next = mergedDone({ ...cur, runs: addCommits(cur.runs, [...made, sha]) }, sha, 'left as given up', now())
    const line = `${tryLabel(cur)}: its checking and merging was given up as stuck, but it ended late and its work was merged into ${into} (${short}), so it is done`
    return [{ ...x, tasks: x.tasks.map(y => (y.id === t.id ? { ...next, history: [...(cur.history ?? []), line] } : y)) }, { done: true, cur }] as [Board, { done: boolean; cur?: BoardTask }]
  }).catch((e: Error) => {
    tellLead($, `${t.id} "${t.title}": its given-up checking and merging ended late and its work was merged into ${into} (${short}), but the board could not be updated (${e.message.slice(0, 200)}).`)
    return null
  })
  if (!r) return
  if (r.done) {
    tellLead($, `✓ ${t.id} "${t.title}" is done after all: its checking and merging was given up as stuck, but it ended late and its work was merged into ${into} (${short}).`)
    if (await removeWorktree($, t.id, worktreeDir(t.id)).catch(() => false)) await git($, ['branch', '-d', t.branch ?? S.N.branch(t.id)]).catch(() => undefined)
    void pump($)
    return
  }
  if (r.cur?.status === 'done' && r.cur.merged) return // already found merged (or merged again) and told
  const now_ = r.cur ? `it is now ${r.cur.status}${r.cur.attempts !== t.attempts ? `, on try ${r.cur.attempts}` : ''}` : 'it is no longer on the board'
  tellLead($, `${t.id} "${t.title}": its checking and merging (${tryLabel(t)}) was given up as stuck, but it ended late and its work was merged into ${into} (${short}) after all. The task moved on meanwhile (${now_}), so I left it as it is: decide whether it is done (then drop the new try) or still needs work.`)
}

/** A repeating timer, if this Claude Code has one ($.clock.every); null when it has none. */
function everyMs($: $, ms: number, f: () => void): { cancel(): void } | null {
  try {
    return $.clock.every(ms, f)
  } catch {
    return null
  }
}

/** Refreshes (`on`) or removes task `id`'s "being tested and merged" mark and its check step (BoardTask.checking), only while it is still "doing" with try `tryNo`. */
async function markFinishing($: $, id: string, tryNo: number, on = true) {
  // nothing to remove (the task already left "doing", which drops the mark): don't write the board
  if (!on && !hasMark(find(await load($), id))) return
  await change($, x => {
    const t = find(x, id)
    if (t?.status !== 'doing' || t.attempts !== tryNo || (!on && !hasMark(t))) return x
    const at = now()
    return patchTask(x, id, on ? { finishing: at, ...(t.checking ? { checking: { ...t.checking, at } } : {}) } : { finishing: undefined, checking: undefined }, t.updated_at)
  })
}
const hasMark = (t: BoardTask | undefined) => !!(t?.finishing || t?.checking)

/** Refreshes (`on`) or removes the check step of task `id` (an approve or a merge waiting for files), only while it is still `status` with try `tryNo`. */
async function markChecking($: $, id: string, status: SymccTask['status'], tryNo: number, on = true) {
  if (!find(await load($), id)?.checking) return
  await change($, x => {
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
export async function lateHandBack($: $, agentId: string): Promise<boolean> {
  if (workers.has(agentId) || stopped.has(agentId) || scoutRuns.has(agentId)) return false
  const b = await load($).catch(() => null)
  const t = b?.tasks.find(x => x.agent === agentId)
  // A task whose worker already handed back (handedBack) is being, or was, checked: not taken again.
  if (!t || t.status !== 'doing' || t.session !== S.me || finishing.has(t.id) || starting.has(t.id) || handedBack(t)) return false
  if ([...workers.values()].some(w => w.task === t.id)) return false
  const started = Date.parse(t.runs?.[t.runs.length - 1]?.started ?? '')
  workers.set(agentId, { task: t.id, worktree: worktreeDir(t.id), branch: t.branch ?? S.N.branch(t.id), since: Number.isFinite(started) ? started : Date.now() })
  return true
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
export async function stopChecks($: $, why: string): Promise<{ back: string[]; review: string[] }> {
  const back: string[] = []
  const review: string[] = []
  for (const id of [...finishing, ...approving]) {
    if (stopAsked.has(id) || back.includes(id) || review.includes(id)) continue
    const kind = await change($, x => {
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
export async function endCheck($: $, id: string) {
  offAsked.delete(id)
  if (!stopAsked.has(id)) return
  stopAsked.delete(id)
  try {
    if (find(await load($), id)?.status === 'dropped') await removeWorktree($, id, worktreeDir(id))
  } catch {
    // the regular check removes leftover folders of dropped tasks (cleanupMerged)
  }
}

/**
 * Patches task `t` (read fresh, inside the change) only if it is still the same try: the same
 * status and try number as when its check began. Returns null when written, else the task as the
 * board has it now ('gone' when it is not on the board any more), and nothing is written.
 */
async function writeIfSame($: $, t: SymccTask, patch: (cur: SymccTask) => Partial<BoardTask>): Promise<SymccTask | 'gone' | null> {
  return change($, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, 'gone'] as [Board, 'gone']
    if (cur.status !== t.status || cur.attempts !== t.attempts) return [x, cur] as [Board, SymccTask]
    return [patchTask(x, t.id, patch(cur), now()), null] as [Board, null]
  })
}

/**
 * Task `t` was dropped, paused or sent to the owner while its work was checked (result `r`).
 * Its new status and history are kept and `line` is added to them; but when the merge already
 * happened, it is done, with a line saying the stop came too late.
 */
async function changedMeanwhile($: $, t: SymccTask, b: Board, r: CheckResult, line: string, worktree: string, agentId?: string) {
  const merged = r.ok && !r.review && !!r.merged
  const off = offAsked.get(t.id)
  const was = await change($, x => {
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
    tellLead($, off ? `${t.id} "${t.title}" was stopped while its work was being checked (${off}); nothing was merged and it is ${was} again, its files kept.` : `${t.id} "${t.title}" was ${was} while its work was being checked; nothing was merged and it stays ${was}.`)
    return
  }
  if (off) {
    sayDone($, b, t.id)
    if (await removeWorktree($, t.id, worktree, agentId, true).catch(() => false)) await git($, ['branch', '-d', t.branch ?? S.N.branch(t.id)])
    tellLead($, `✓ ${t.id} "${t.title}" is merged: ${off} too late, after the merge had already happened, so it is done.`)
    return
  }
  sayDone($, b, t.id)
  if (await removeWorktree($, t.id, worktree, agentId, true).catch(() => false)) await git($, ['branch', '-d', t.branch ?? S.N.branch(t.id)])
  tellLead($, `✓ ${t.id} "${t.title}" is merged: it was ${was} too late, after the merge had already happened, so it is done.`)
}

/** What the lead is told when a worker stopped with a QUESTION and its task now waits for the owner. */
export const workerQuestionText = (id: string, question: string, options?: readonly string[]) =>
  `${id} is waiting for the owner: ${question}${/[.?!]$/.test(question) ? '' : '.'}${options?.length ? ` Options: ${options.join(' | ')}.` : ''} Answer it yourself only if the owner already clearly said the answer: then ${S.N.name} change ${id} with answer: that answer, and tell the owner what you answered. Otherwise ask the owner in the chat now, plain and short${options?.length ? ', offering the options as choices they can pick (e.g. with AskUserQuestion), plus "or answer on the board"' : ', and say they can also answer on the board'}; put their answer into the task with ${S.N.name} change ${id} and answer: their words. If they answer on the board first (a "Meanwhile" line), don't ask again.`

/** Whether a report that could not be saved was already told (once per session, so it never floods). */
let reportWarned = false

/**
 * Saves try `t.attempts`'s full final answer to <dir>/reports/<id>-try-<N>.md (through a temp file
 * and a rename, cut at REPORT_MAX_CHARS) and puts its path on the try's run. A failure is told
 * once and never stops the task.
 */
export async function saveReport($: $, t: SymccTask, answer: string) {
  if (!answer.trim()) return
  const rel = reportFile(S.N.dir, t.id, t.attempts)
  try {
    await $.process.run(['mkdir', '-p', path(`${S.N.dir}/reports`)])
    await safeWrite($, path(rel), reportText(answer), 'the report')
    await change($, x => {
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
    $.ui.toast(S.N.toast(msg))
    tellLead($, msg)
  }
}

/**
 * `gaveUp`: whether workerFinished gave this step up as stuck (it ran over its limit, see finishLimitMs): from
 * then on it merges nothing and writes no outcome. `release` settles at that moment (see mergeTurn).
 * `turn`: stops and restarts its time limit around the merge turn (see checkAndMerge).
 */
export async function finishWork($: $, agentId: string, w: { task: string; worktree: string; branch: string }, answer: string, aborted: boolean, gaveUp: () => boolean = () => false, release?: Promise<unknown>, turn?: (go: boolean) => void) {
  const b = await load($)
  const t = find(b, w.task)
  if (!t || t.status !== 'doing') return // changed or dropped meanwhile
  await saveReport($, t, answer)
  const summary = cutLine(answer, 600) || '(no summary)'
  // Its time was up: what it handed back is its report; the task fails with its work kept, nothing is merged.
  if (t.wrap_up) {
    const limit = timeLimitOf(b.max_minutes, t)
    // An investigation's hand-back is its answer so far: it still goes to review for the owner to read.
    if (kindOf(t) === 'investigation') {
      if (gaveUp()) return
      await answered($, t, answer, summary, limit)
      return
    }
    if (await writeIfSame($, t, cur => ({ status: 'failed', note: outOfTimeNote(limit), history: [...cur.history, `${tryLabel(t)}: out of time; handed back: ${cutLine(summary, 300)} (its work so far is kept in its folder and branch)`], ...endedBy(cur, now(), 'timed out', `ran over ${limit} min`) }))) return
    tellLead($, `${t.id} "${t.title}": its time (${limit} minutes) was up, so its worker wrote down what it had and handed back, and the task failed. Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${t.id}); a retry (${S.N.name} retry) continues from there. Or split it, or drop it.`)
    return
  }
  const q = /^\s*QUESTION:\s*(.+)$/im.exec(answer)
  const need = parseNeedFiles(answer)
  if (aborted) {
    if (await writeIfSame($, t, cur => ({ status: 'failed', note: 'the worker was stopped', history: [...cur.history, `${tryLabel(t)}: stopped before finishing`], ...endedBy(cur, now(), 'stopped', 'stopped from Claude Code') }))) return
    tellLead($, `${t.id} "${t.title}": the worker was stopped before finishing.`)
  } else if (need) {
    const question = needFilesQuestion(t.id, need)
    if (await writeIfSame($, t, cur => ({ status: 'waiting', question: question.slice(0, 1000), asked_files: need.files, note: 'waiting for you', history: [...cur.history, `${tryLabel(t)}: worker asked for more files: ${need.files.join(', ')}${need.reason ? ` — ${need.reason}` : ''}`], ...endedBy(cur, now(), 'asked', 'NEED FILES') }))) return
    sayNeedsYou($, b, t, question)
    tellLead($, `${question}\nThe task now waits for the owner, who can allow the files from the board (Allow on its page). If they agree here instead, ${S.N.name} change ${t.id} with the wider files (that sends it back to work; what the worker already changed is kept). Otherwise ${S.N.name} drop it, or change it to a narrower plan that fits its files.`)
  } else if (q) {
    // Straight to the owner, like NEED FILES: the task waits with the question; their answer sends it back to work.
    const question = q[1]!.trim()
    const options = parseOptions(answer)
    if (await writeIfSame($, t, cur => ({ status: 'waiting', question: question.slice(0, 1000), ...(options ? { options } : {}), note: 'waiting for you', history: [...cur.history, `${tryLabel(t)}: worker asked: ${question}`], ...endedBy(cur, now(), 'asked', 'QUESTION') }))) return
    sayNeedsYou($, b, t, question)
    tellLead($, workerQuestionText(t.id, question, options))
  } else if (kindOf(t) === 'investigation') {
    if (gaveUp()) return
    await answered($, t, answer, summary)
  } else {
    if (gaveUp() || (await waitIfBranchGone($, b, t, 'merge'))) return
    await change($, x => (find(x, t.id)?.status === 'doing' && !gaveUp() ? patchTask(x, t.id, { note: 'checking and merging' }, now()) : x))
    const made: string[] = []
    const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
    const r: CheckResult = await checkAndMerge($, t, w.worktree, b, 'finish', made, stop, false, release, turn).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    // Given up meanwhile: the task was already sent back (or found merged); this late outcome is not
    // written over it, unless the work reached the branch after all (landedLate).
    if (gaveUp()) {
      await landIfMerged($, t, r.merged, made, 'finish', 'doing')
      return
    }
    await recordCommits($, t.id, made, r.merged)
    if (r.blocked) await holdForFiles($, t, b, r, `${tryLabel(t)}: ${cutLine(summary, 300)} → ${r.detail}`, w.worktree, agentId)
    else
      await settle($, t, b, r, summary, w.worktree, agentId).catch(async (e: unknown) => {
        // Merged, but the outcome could not be written: the work is on its branch, so it still ends done.
        if (!r.ok || r.review || !r.merged || !(await doneAfterMerge($, t, r.merged).catch(() => false))) throw e
      })
  }
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
async function answered($: $, t: SymccTask, answer: string, summary: string, limit?: number) {
  const text = answer.trim() || '(no answer)'
  const kept = text.length > ANSWER_MAX_CHARS ? `${text.slice(0, ANSWER_MAX_CHARS - 1)}…` : text
  const late = limit !== undefined
  if (await writeIfSame($, t, cur => ({ status: 'review', note: late ? ANSWERED_LATE_NOTE : ANSWERED_NOTE, answer: kept, merge_main: false, test_output: undefined, time_ask: undefined, wrap_up: undefined, history: [...cur.history, `${tryLabel(t)}: answered${late ? ` (time ran out after ${limit} min)` : ''}: ${cutLine(summary, 300)}`], ...endedBy(cur, now(), late ? 'timed out' : 'finished', late ? `answered; ran over ${limit} min` : 'answered') }))) return
  tellLead($, `${t.id} "${t.title}" is answered${late ? ` (its time of ${limit} minutes ran out, so this is its answer so far)` : ''} and waits for the owner to read it (nothing was committed, tested or merged). The answer is on the task (${S.N.name} board task ${t.id}, with the full report). Tell the owner it is ready to read. Then, on the owner's word: ${S.N.name} approve ${t.id} is Done (it ends, nothing merged); ${S.N.name} approve ${t.id} with keep_note: true is Keep as a note (also adds a docs task that writes the answer to docs/research/); ${S.N.name} reject ${t.id} with their follow-up question is Ask more (a fresh try).`)
}

/**
 * Task `t`'s try merged `sha`, but settle could not write that: it is marked done now (unless it
 * already is), whatever happened to it meanwhile. Returns whether the board says done afterwards.
 */
async function doneAfterMerge($: $, t: SymccTask, sha: string): Promise<boolean> {
  const done = await change($, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, false] as [Board, boolean]
    if (cur.status === 'done') return [x, true] as [Board, boolean]
    return [{ ...x, tasks: x.tasks.map(y => (y.id === t.id ? mergedDone({ ...cur, runs: addCommits(cur.runs, [sha]) }, sha, 'marked done', now()) : y)) }, true] as [Board, boolean]
  })
  if (done) tellLead($, `✓ ${t.id} "${t.title}" merged into ${intoOf(t)} (${sha.slice(0, 8)}); it is done.`)
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
async function holdForFiles($: $, t: SymccTask, b: Board, r: CheckResult, line: string, worktree: string, agentId?: string, quiet = false) {
  const files = r.blocked!
  const note = waitFilesNote(intoOf(t), files)
  const res = await change($, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, 'gone'] as [Board, 'gone']
    if (cur.status !== t.status || cur.attempts !== t.attempts) return [x, cur] as [Board, SymccTask]
    const first = !waitsForFiles(cur)
    const status = cur.status === 'review' ? 'review' : 'waiting'
    const y = patchTask(x, t.id, { status, merge_wait: files, note, ...(first ? { history: [...cur.history, line] } : {}), ...endedBy(cur, now(), 'finished', 'waiting for your files') }, now())
    return [y, first] as [Board, boolean]
  })
  if (res === 'gone') return
  if (typeof res !== 'boolean') return changedMeanwhile($, t, b, r, line, worktree, agentId)
  if (!res) return
  const text = `${t.id} "${t.title}" passed its checks, but its merge into ${intoOf(t)} waits for the owner's files there (${note.replace(/^waiting for your files on \S+: /, '')}). It merges on its own at the next regular check once they are out of the way, with no new worker; ${S.N.name} retry ${t.id} merges it at once. Tell the owner.`
  if (quiet) noteForLead(text)
  else tellLead($, text)
}

/**
 * The regular check's part for tasks whose finished work waits only for the owner's files
 * (BoardTask.merge_wait): each one whose files are out of the way now (or whose branch is not
 * checked out any more) is merged again, with no worker (see mergeWaiting). Not in mode off.
 */
export async function retryFileWaits($: $) {
  const b = await load($)
  if (modeOf(b) === 'off') return
  const waiting = b.tasks.filter(t => waitsForFiles(t) && !checkingNow(t.id))
  let current: string | null = null
  let status: string | null = null
  for (const t of waiting) {
    current ??= (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
    if (current === intoOf(t)) {
      if (status === null) {
        const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all', '--ignored=matching'])
        if (st.exitCode !== 0) return
        status = st.stdout
      }
      if (stillBlocks(status, blockerFiles(asBlockers(t.merge_wait)!), S.N.dir)) continue
    }
    await mergeWaiting($, t.id).catch(() => undefined)
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
export async function settle($: $, t: SymccTask, b: Board, r: CheckResult, summary: string, worktree: string, agentId?: string, approved = false) {
  const line = `${tryLabel(t)}: ${cutLine(summary, 300)} → ${r.detail}`
  // Every write below reads the task again and is skipped when it was dropped, paused or changed meanwhile.
  // A finished worker's try ends with the check's outcome (an approve is not a try: its task is in review, so nothing is set).
  const write = async (patch: (cur: SymccTask) => Partial<SymccTask>) => {
    const moved = await writeIfSame($, t, cur => ({ ...patch(cur), ...endedBy(cur, now(), 'finished', finishedNote(r)) }))
    if (moved && moved !== 'gone') await changedMeanwhile($, t, b, r, line, worktree, agentId)
    return !moved
  }
  if (r.review) {
    if (!(await write(cur => ({ status: 'review', note: 'ready for review: the checks passed, nothing merged yet', merge_main: false, test_output: undefined, history: [...cur.history, line] })))) return
    tellLead($, `${t.id} "${t.title}" is ready for review. The change is on branch ${t.branch ?? S.N.branch(t.id)} (folder ${S.N.dir}/worktrees/${t.id}). Show the owner what changed; then ${S.N.name} approve ${t.id} merges it, or ${S.N.name} reject ${t.id} with a reason sends it back to a fresh worker. The owner may also edit the files in that folder first; approve then commits those edits with the task and runs the tests again.`)
    return
  }
  const tries = t.conflict_tries ?? 0
  if (r.conflict && onConflict(t) === 'retry') {
    // Don't fail yet: a new worker merges main into the branch and resolves the conflicts.
    const note = `conflicts with the latest ${intoOf(t)}; a new try will merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES})`
    if (!(await write(cur => ({ status: 'todo', note, conflict_tries: tries + 1, merge_main: true, history: [...cur.history, line] })))) return
    tellLead($, `${t.id} "${t.title}" conflicts with the latest ${intoOf(t)}; starting a new try to merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES}).`)
    return
  }
  const retries = b.auto_retries ?? DEFAULT_AUTO_RETRIES
  const testTries = t.test_tries ?? 0
  if (r.testOutput !== undefined && onTestFail(t, retries) === 'retry') {
    // Don't fail yet: a new worker gets the failing test output and fixes it.
    const note = `tests failed; a new try will fix them (${testTries + 1} of ${retries})`
    if (!(await write(cur => ({ status: 'todo', note, test_tries: testTries + 1, test_output: r.testOutput, merge_main: false, history: [...cur.history, line] })))) return
    tellLead($, `${t.id} "${t.title}" failed its tests; retrying on its own (${testTries + 1} of ${retries}). Nothing to do.`)
    return
  }
  const detail = r.conflict ? `conflicts with the latest ${intoOf(t)}, still after ${tries} tries to merge it in` : r.detail
  const done = `${tryLabel(t)}: ${cutLine(summary, 300)} → ${detail}`
  if (!(await write(cur => ({ status: r.ok ? 'done' : 'failed', note: detail.slice(0, 300), merge_main: false, test_output: r.testOutput, history: [...cur.history, done], ...(r.ok && r.notes?.length ? { research_notes: r.notes } : {}), ...(r.ok && cur.status === 'waiting' && cur.attempts === t.attempts && cur.runs?.length ? { runs: withEnd(cur.runs, 'finished', 'merged', true) } : {}) })))) return
  if (r.ok) sayDone($, b, t.id)
  // Merged: its folder goes, then its branch (-d: git refuses if it isn't merged, so nothing is lost).
  if (r.ok && (await removeWorktree($, t.id, worktree, agentId, true))) await git($, ['branch', '-d', t.branch ?? S.N.branch(t.id)])
  const gaveUp = r.testOutput !== undefined ? `\nIt already had ${testTries} automatic ${testTries === 1 ? 'retry' : 'retries'}. The end of the last test output:\n${r.testOutput}` : ''
  if (r.ok && approved) return noteForLead(`✓ ${t.id} "${t.title}" ${r.detail}.`)
  tellLead($, r.ok ? `✓ ${t.id} "${t.title}" ${r.detail}.` : `✗ ${t.id} "${t.title}" was not merged: ${detail}${gaveUp}`)
}

/**
 * The owner approved task `id` (in "review"): the same checked merge as for a finished worker. An answered
 * investigation has nothing to merge: approve is its Done (see endInvestigation), and `keepNote` its Keep as a note.
 */
export async function approve($: $, id: string, keepNote = false): Promise<string> {
  const b = await load($)
  const t = reviewTask(b, id, 'approve')
  if (kindOf(t) === 'investigation') return endInvestigation($, t, keepNote)
  if (keepNote) throw new Error(`${t.id} is a change task: keep_note is only for an answered investigation. Approve it without keep_note to merge it.`)
  return mergeFinished($, b, t, 'approve')
}

/** The full answer of investigation `t`: its latest saved report (and that file), else the answer kept on the task. */
export async function fullAnswer($: $, t: BoardTask): Promise<{ text: string; file?: string }> {
  const last = taskReports(t).at(-1)
  const text = last ? await $.fs.read(path(last.file)).then(x => String(x), () => null) : null
  return text?.trim() ? { text: text.trim(), file: last!.file } : { text: t.answer?.trim() ?? '', ...(last ? { file: last.file } : {}) }
}

/**
 * Done on answered investigation `t`: it ends done (note "answered"), nothing merged, and its folder and branch
 * are removed as after a merge (the branch with -D: nothing on it was ever kept). With `keepNote` (Keep as a
 * note) a new small docs task is added too, made by the owner as a follow-up of `t`, that writes
 * docs/research/<topic>.md from the saved answer and merges as usual.
 */
async function endInvestigation($: $, t: BoardTask, keepNote: boolean): Promise<string> {
  const full = keepNote ? await fullAnswer($, t) : { text: '' }
  const merge_into = keepNote ? await homeBranch($) : undefined
  // notes already written: a new note never overwrites one (it gets -2, -3… instead)
  const notes = keepNote ? (await Promise.resolve().then(() => $.fs.list(path('docs/research'))).catch(() => [])).map(f => `docs/research/${f.name}`) : []
  const added = await change($, x => {
    if (!keepNote) return [investigationDone(x, t.id, now()), undefined] as [Board, BoardTask | undefined]
    const [y, n] = addTask(x, { ...keepNoteTask(find(x, t.id) ?? t, full.text, full.file, [...notes, ...noteFilesInUse(x)]), merge_into }, now(), S.N.dir)
    return [investigationDone(y, t.id, now(), n.id), n] as [Board, BoardTask | undefined]
  })
  if (await removeWorktree($, t.id, worktreeDir(t.id)).catch(() => false)) await git($, ['branch', '-D', t.branch ?? S.N.branch(t.id)])
  void pump($)
  if (!added) return `${t.id} done: the answer was read; nothing was merged`
  return `${t.id} done: the answer was read; nothing was merged. Added ${added.id} "${added.title}": it writes ${added.files[0]} from the answer and merges as usual`
}

/**
 * Task `id`'s finished work waits only for the owner's files (BoardTask.merge_wait): only the merge
 * step runs again, with no worker (brought up to date, tested only if its branch moved, then
 * merged). A task in review (an approve that was blocked) is approved again.
 */
export async function mergeWaiting($: $, id: string): Promise<string> {
  const b = await load($)
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (!waitsForFiles(t)) return `${t.id} is not waiting for your files`
  return mergeFinished($, b, t, t.status === 'review' ? 'approve' : 'merge')
}

/**
 * Merges task `t`'s finished work: `kind` 'approve' (the owner approved it, in "review") or 'merge'
 * (it was "waiting" only for the owner's files). The same checked merge as for a finished worker.
 */
async function mergeFinished($: $, b: Board, t: SymccTask, kind: 'approve' | 'merge'): Promise<string> {
  const stays = kind === 'approve' ? 'stays in review' : 'keeps waiting'
  if (approving.has(t.id)) return `${t.id} is already being merged`
  if (!(await gitReady($, b))) return `${t.id} ${stays}: ${gitNote(S.gitState)}`
  if (await waitIfBranchGone($, b, t, 'merge')) return `${t.id} was not merged: the branch it merges into, ${intoOf(t)}, is gone; it now waits for your answer`
  approving.add(t.id)
  // The same time limit as a finished worker's check (finishLimitMs): past it the merge is
  // given up (mergeRanOver), so it no longer holds the task, its id or the branch's merge turn.
  // It may still wake up later, but then it merges nothing and writes nothing (gaveUp).
  const limitMs = finishLimitMs(b.test_commands.length)
  // The step shown on the board (BoardTask.checking) is refreshed like a finishing mark, and removed when the merge ends or is given up.
  const beat = everyMs($, FINISH_BEAT_MS, () => void markChecking($, t.id, t.status, t.attempts).catch(() => undefined))
  try {
    const how = await withLimit($, limitMs, (gaveUp, over, turn) => mergeWork($, t, b, kind, gaveUp, over, turn))
    if (how !== OVER) return how
    beat?.cancel()
    await markChecking($, t.id, t.status, t.attempts, false).catch(() => undefined)
    approving.delete(t.id)
    await endCheck($, t.id)
    const out = await mergeRanOver($, t.id, t.status, kind, limitMs)
    void pump($)
    return out
  } finally {
    beat?.cancel()
    await markChecking($, t.id, t.status, t.attempts, false).catch(() => undefined)
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
async function mergeRanOver($: $, id: string, status: SymccTask['status'], kind: 'approve' | 'merge', limitMs: number): Promise<string> {
  const min = Math.round(limitMs / 60_000)
  const again = kind === 'approve' ? 'approve it again' : `${S.N.name} retry ${id}`
  const what = kind === 'approve' ? 'approved by the owner' : 'merging once your files were out of the way'
  const twice = `its merge ran over ${min} min twice in a row and was given up both times; nothing was merged`
  let secondTime = false
  const t = await change($, x => {
    const cur = find(x, id)
    if (cur?.status !== status) return [x, null] as [Board, null]
    secondTime = kind === 'merge' && mergeRanOverBefore(cur)
    if (secondTime) return [patchTask(x, id, { status: 'failed', note: twice, history: [...cur.history, `${tryLabel(cur)}: ${what} → ${twice}`] }, now()), cur] as [Board, BoardTask]
    const y = patchTask(x, id, { note: `${kind === 'approve' ? 'approved, but the' : 'the'} merge ran over ${min} min and was given up; ${again}`, ...(kind === 'approve' ? { merge_wait: undefined } : {}), history: [...cur.history, `${tryLabel(cur)}: ${what} → its checking and merging ran over ${min} min and was given up; nothing written, it stays ${STATUS_WORD_OF(status)}`] }, now())
    return [y, cur] as [Board, BoardTask]
  }).catch(() => null)
  const late = t ? null : find(await load($).catch(() => null) ?? emptyBoard(), id)
  if (late?.status === 'done' && late.merged) return `${id} is done: its checking and merging ran over ${min} minutes, but its work was merged into ${intoOf(late)} (${late.merged.slice(0, 8)}) after all.`
  if (kind === 'approve') {
    if (t) tellLead($, `${id} "${t.title}": the owner's approve ran over ${min} minutes and seemed stuck, so I stopped waiting for it. It stays in review; approve it again to retry the merge.`)
    return `${id} was not merged and stays in review: its checking and merging ran over ${min} minutes and was given up. Approve it again.`
  }
  if (secondTime) {
    if (t) tellLead($, `✗ ${id} "${t.title}" failed: its merge ran over ${min} minutes twice in a row and was given up both times, so it is not started again on its own. Its folder and branch are kept. Look at why the test commands are so slow or hang, then ${S.N.name} retry ${id}.`)
    return `${id} was not merged and failed: its checking and merging ran over ${min} minutes twice in a row and was given up both times.`
  }
  if (t) tellLead($, `${id} "${t.title}": its merge ran over ${min} minutes and seemed stuck, so I stopped waiting for it. It keeps waiting for the owner's files and merges on its own at the next regular check once they are out of the way; ${S.N.name} retry ${id} tries the merge again at once.`)
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
async function mergeWork($: $, t: SymccTask, b: Board, kind: 'approve' | 'merge', gaveUp: () => boolean, release: Promise<unknown>, turn?: (go: boolean) => void): Promise<string> {
  const status = t.status
  const stays = kind === 'approve' ? 'stays in review' : 'keeps waiting'
  const by = kind === 'approve' ? 'approved by the owner' : 'merged once your files were out of the way'
  try {
    const dir = worktreeDir(t.id)
    if (!(await $.fs.exists(`${dir}/.git`))) await prepareWorktree($, t, intoOf(t))
    // The owner's own edits in the folder since review (or edits whose tests failed on an
    // earlier approve, kept as test_output): those are committed with the task and always tested.
    const edits = await ownerEdits($, t, dir).catch(() => [] as string[])
    const retest = edits.length > 0 || (kind === 'approve' && t.test_output !== undefined)
    if (gaveUp()) return ''
    await change($, x => {
      const cur = find(x, t.id)
      if (cur?.status !== status || gaveUp()) return x
      return patchTask(x, t.id, { note: kind === 'approve' ? 'approved; checking and merging' : 'your files are out of the way; merging', ...(edits.length ? { history: [...cur.history, ownerEditedLine(edits)] } : {}) }, now())
    })
    const made: string[] = []
    const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
    const r: CheckResult = await checkAndMerge($, t, dir, b, kind, made, stop, retest, release, turn).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    // Given up meanwhile: mergeRanOver already wrote its note; this late outcome is not written over
    // it, unless the work reached the branch after all (landedLate).
    if (gaveUp()) {
      await landIfMerged($, t, r.merged, made, kind, status)
      return ''
    }
    await recordCommits($, t.id, made, r.merged)
    const cur = find(await load($), t.id)
    if (r.merged) {
      // The work is on the target branch: the task is done, whatever happened to it meanwhile
      // (settle marks it done; when it changed meanwhile, with a line saying the change came too late).
      const sha = r.merged.slice(0, 8)
      if (!cur) {
        tellLead($, `${t.id} "${t.title}" was merged into ${intoOf(t)} (${sha}), but it is no longer on the board.`)
        return `${t.id} was merged into ${intoOf(t)} (${sha}), but it is no longer on the board`
      }
      await settle($, t, b, r, by, dir, undefined, kind === 'approve')
      const off = offAsked.get(t.id)
      if (off && cur.status === status) {
        await change($, x => {
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
      await change($, x => {
        const c = find(x, t.id)
        return c?.status === status ? patchTask(x, t.id, { note: `${kind === 'approve' ? 'approved, but ' : ''}not merged: ${off} first; ${again}`, history: [...c.history, `${tryLabel(t)}: ${by.replace(/^merged /, 'merging ')} → not merged: ${off} while it was being merged; it ${stays}`] }, now()) : x
      })
      return `${t.id} was not merged and ${stays}: ${off} while it was being merged. ${kind === 'approve' ? 'Approve it again.' : `Retry it, or it merges at a later check.`}`
    }
    if (r.blocked) {
      // Only the owner's files are in the way: it waits for them (merge_wait); the regular check merges it once they are clear.
      await holdForFiles($, t, b, r, `${tryLabel(t)}: ${kind === 'approve' ? 'approved by the owner' : 'merging again'} → ${r.detail}`, dir, undefined, kind === 'approve')
      return `${t.id} was not merged and ${stays}: ${r.detail}.`
    }
    if (kind === 'approve' && retest && r.testOutput !== undefined) {
      // The owner's edits fail the tests: it stays in review with the output, not sent to a worker.
      const folder = `${S.N.dir}/worktrees/${t.id}`
      await change($, x => {
        const c = find(x, t.id)
        return c?.status === 'review' ? patchTask(x, t.id, { note: `approved, but your edits fail the tests: ${r.detail.slice(0, 220)}`, merge_wait: undefined, test_output: r.testOutput, history: [...c.history, `${tryLabel(t)}: approved by the owner → not merged, the tests failed after your edits: ${r.detail.slice(0, 250)}`] }, now()) : x
      })
      tellLead($, `${t.id} "${t.title}" was not merged: with the owner's edits the tests fail. It stays in review; the owner can fix the files in ${folder} and approve again.\n${r.testOutput}`)
      return `${t.id} was not merged and stays in review: ${r.detail}. Fix the files in ${folder}, then approve it again (the tests run again).`
    }
    if (kind === 'approve' && !r.ok && !r.conflict && r.testOutput === undefined) {
      // Not the work's fault (e.g. the owner's files could not be updated): it stays in review.
      await change($, x => (find(x, t.id)?.status === 'review' ? patchTask(x, t.id, { note: `approved, but not merged: ${r.detail.slice(0, 250)}`, merge_wait: undefined }, now()) : x))
      // An answer that already says to approve again needs no more advice; anything else gets it here.
      return `${t.id} was not merged and stays in review: ${r.detail}${/approve \S+ again$/.test(r.detail) ? '.' : '. Fix that, then approve it again.'}`
    }
    await settle($, cur, b, r, by, dir)
    const label = kind === 'approve' ? 'approved, but not merged' : 'not merged'
    return r.ok ? `${t.id} ${kind === 'approve' ? 'approved and merged' : 'merged'}: ${r.detail}` : `${t.id} ${label}: ${r.detail}${r.conflict || r.testOutput !== undefined ? ' (see the board for what happens next)' : ''}`
  } finally {
    // Given up: mergeFinished already let go of the id (a new merge may hold it now) and ended the check.
    if (!gaveUp()) {
      approving.delete(t.id)
      await endCheck($, t.id)
      void pump($) // after the check: a task sent back to "todo" (or resumed meanwhile) starts again
    }
  }
}

/** Ends an agent's work: from now on every tool it tries is refused, and it is told to stop. */
export async function halt($: $, agentId: string, why: string) {
  stopped.add(agentId)
  await $.session.send({ to: { agentId }, text: `Stop now: ${why}. Don't change anything else; answer "stopped" and end.` }).catch(() => undefined)
}

/** Stops the workers `which` picks (all by default), one by one; `then` runs after each is told to stop. */
export async function haltWorkers($: $, why: string, which: (w: Worker) => boolean = () => true, then?: (w: Worker) => Promise<unknown>) {
  for (const [agentId, w] of [...workers]) {
    if (!which(w)) continue
    workers.delete(agentId)
    await halt($, agentId, why)
    await then?.(w)
  }
}

/** Stops every worker, then every scout run; `then` runs after each worker is told to stop. */
export async function haltAll($: $, why: string, then?: (w: Worker) => Promise<unknown>) {
  await haltWorkers($, why, undefined, then)
  for (const agentId of [...scoutRuns.keys()]) await halt($, agentId, why)
  scoutRuns.clear()
  for (const s of scoutState.values()) s.running = false
}

export async function stopWorker($: $, taskId: string, why: string) {
  await haltWorkers($, why, w => w.task === taskId)
  await publish($, await load($))
}

/**
 * Sets the board mode to `m`; `who` is said in the notes of stopped tasks. "off" stops every
 * worker and scout at once (their tasks go back to "todo" and continue when work runs again);
 * "review" or "auto" from "off" starts work again. Going to "auto" does not merge tasks already
 * in review. Returns one short line: the new mode, what it means, and what happened.
 */
export async function setBoardMode($: $, m: SymccMode, who: string): Promise<string> {
  const before = modeOf(await load($))
  const b = await change($, x => {
    const y = setMode(x, m)
    return [y, y] as [Board, Board]
  })
  const extra: string[] = []
  if (m === 'off') {
    const ids: string[] = []
    await haltAll($, `${who} turned the board off`, async w => {
      ids.push(w.task)
      await change($, x => {
        const cur = find(x, w.task)
        return patchTask(x, w.task, { status: 'todo', note: `stopped by ${who}; continues when the board is on again`, ...(cur ? { history: [...cur.history, stoppedLine(cur, `${who} turned the board off`)], ...endedBy(cur, now(), 'stopped', `${who} turned the board off`) } : {}) }, now())
      })
    })
    if (ids.length) extra.push(`stopped ${ids.join(', ')}`)
    const checks = stoppedChecksText(await stopChecks($, 'the board was turned off'))
    if (checks) extra.push(checks)
    await publish($, await load($))
  } else {
    const inReview = b.tasks.filter(t => t.status === 'review').length
    if (m === 'auto' && inReview) extra.push(`${inReview} already in review still ${inReview === 1 ? 'waits' : 'wait'} for approve or reject`)
    if (before === 'off') extra.push('work starts again')
    void pump($)
  }
  return [modeText(m), ...extra].join('; ')
}

/**
 * Turns the whole plugin on or off (/<name>-on, /<name>-off, the enabled setting). Off: every
 * worker and scout stops (their tasks go back to "todo"), nothing new starts, the lead is not
 * told anything and the lead's guide leaves the system prompt from the next message. The board,
 * its mode, tasks and scouts are kept, so on brings everything back as it was.
 */
export async function setSymcc($: $, on: boolean): Promise<string> {
  const before = symccOn(await load($))
  const b = await change($, x => {
    const y = setEnabled(x, on)
    return [y, y] as [Board, Board]
  })
  S.enabledNow = on
  if (!on) {
    const ids: string[] = []
    await haltAll($, `you turned ${S.N.name} off`, async w => {
      ids.push(w.task)
      await change($, x => patchTask(x, w.task, { status: 'todo', note: `stopped: ${S.N.name} was turned off; continues when it is on again`, ...endedBy(find(x, w.task), now(), 'stopped', `${S.N.name} was turned off`) }, now()))
    })
    const checks = stoppedChecksText(await stopChecks($, `${S.N.name} was turned off`))
    leadQueue.splice(0)
    meanwhile.splice(0)
    S.leadTimer?.cancel()
    S.leadTimer = null
    sayQueue.splice(0)
    await publish($, await load($))
    const stopped = `${ids.length ? ` Stopped ${ids.join(', ')}.` : ''}${checks ? ` ${checks[0]!.toUpperCase()}${checks.slice(1)}.` : ''}`
    return `${S.N.name} is ${before ? 'now ' : ''}off: Claude works as normal from your next message. The board, tasks and scouts are kept.${stopped} Turn it back on with /${S.N.name}-on.`
  }
  await publish($, b)
  void pump($)
  if (!before) tellLead($, `The owner turned ${S.N.name} back on with /${S.N.name}-on. You are the lead again; the board is in mode ${modeOf(b)}.`)
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
export async function stopOrphans($: $, leadNow?: string | null): Promise<string[]> {
  // Every worker type (worker, worker-web, ...) counts as a worker here.
  const agents = asBaseWorkers(await $.agent.list().catch(() => []), S.N.name)
  // $.agent.list() names this session's agents only, but in case it ever lists another
  // session's too: never stop a worker whose task the live driver (another session) owns.
  const lead = leadNow !== undefined ? leadNow : await $.fs.read(path(S.N.leadFile)).catch(() => null)
  const live = liveDriver(lead, Date.now())
  const b = agents.some(a => a.type === S.N.worker) ? await load($).catch(() => emptyBoard()) : emptyBoard()
  const out: string[] = []
  for (const a of agents) {
    if (a.type !== S.N.worker && a.type !== S.N.scout) continue
    if (workers.has(a.id) || scoutRuns.has(a.id)) continue
    if (ENDED_STATUSES.includes(a.status)) continue
    if (a.type === S.N.worker) {
      // A worker of this session that was running when the plugin reloaded keeps working:
      // track it again instead of stopping it (see orphanMove for when).
      const taken = [...workers.values()].map(w => w.task)
      const m = orphanMove(a as AgentInfo, b, S.me, live, [...taken, ...starting, ...finishing], S.N.name)
      if (m.move === 'leave') continue
      if (m.move === 'adopt') {
        const t = find(b, m.task)!
        // Its worker already handed back (the agent is only idle): nothing to track or stop. The
        // task's check is still running, or the regular check recovers it (done when merged).
        if (handedBack(t)) continue
        const started = Date.parse(t.runs?.[t.runs.length - 1]?.started ?? '')
        workers.set(a.id, { task: t.id, worktree: worktreeDir(t.id), branch: t.branch ?? S.N.branch(t.id), since: Number.isFinite(started) ? started : Date.now() })
        if (t.agent !== a.id) await change($, x => (find(x, t.id)?.status === 'doing' && find(x, t.id)?.session === S.me ? patchTask(x, t.id, { agent: a.id }, now()) : x)).catch((e: Error) => $.ui.toast(S.N.toast(`kept ${t.id}'s worker after a reload but couldn't record it on the board: ${String(e?.message ?? e).slice(0, 150)}`)))
        continue
      }
    }
    stopped.add(a.id)
    if (LIVE.has(a.status)) await halt($, a.id, `${S.N.name} was reloaded and a new worker took over this task`)
    out.push(a.id)
  }
  // Just loaded (called from claimLead, with lead.json as it was): a "doing" task of this session
  // with no live worker and no merge mark may be one whose worker has only just handed back to the
  // old copy, which is about to mark it. Wait a moment and look again, so it is not sent back for nothing.
  if (leadNow !== undefined && (await waitingOnOld($, agents))) {
    aboutToWait()
    await $.clock.sleep(RELOAD_SETTLE_MS)
  }
  return out
}

/** How long a fresh copy of the plugin waits before deciding a "doing" task's old worker is gone. */
export const RELOAD_SETTLE_MS = 2_000

/** Whether a "doing" task of this session has no live worker (in `agents`), no merge mark and nothing in this copy working on it. */
async function waitingOnOld($: $, agents: AgentInfo[]): Promise<boolean> {
  if (!(await $.fs.exists(path(S.N.boardFile)).catch(() => false))) return false
  const b = await load($).catch(() => emptyBoard())
  const mine = new Set([...workers.values()].map(w => w.task))
  return b.tasks.some(t => t.status === 'doing' && t.session === S.me && !t.finishing && !mine.has(t.id) && !starting.has(t.id) && !finishing.has(t.id) && !liveWorkersFor(t, agents, S.N.name).length)
}

/**
 * Delete the temp files a killed session left in .<name>/ (see leftoverTmpFiles for which).
 * A file that is gone by the time we get to it is fine; other errors are reported once per
 * file in a toast, and never stop the check.
 */
export async function cleanLeftoverTmp($: $) {
  const dir = path(S.N.dir)
  const entries = await $.fs.list(dir).catch(() => [])
  const files: { name: string; mtimeMs?: number }[] = []
  for (const f of entries) {
    if (f.kind !== 'file' || !f.name.endsWith('.tmp')) continue
    const st = await $.fs.stat(`${dir}/${f.name}`).catch(() => null)
    if (st) files.push({ name: f.name, mtimeMs: st.mtimeMs })
  }
  const failed: string[] = []
  for (const name of leftoverTmpFiles(files, Date.now())) {
    const r = await $.process.run(['rm', '-f', `${dir}/${name}`]).catch((e: unknown) => ({ exitCode: 1, stderr: String(e), stdout: '' }))
    if (r.exitCode !== 0) failed.push(`${name}: ${(r.stderr || r.stdout).trim().slice(0, 100)}`)
  }
  // Say it once per file, not every two minutes.
  const fresh = failed.filter(f => !tmpWarned.has(f.split(':')[0]))
  fresh.forEach(f => tmpWarned.add(f.split(':')[0]))
  if (fresh.length) $.ui.toast(S.N.toast(`couldn't remove leftover temp files in ${S.N.dir}/: ${fresh.join('; ')}`))
}

/**
 * Task `id`'s worker ran out of time (its limit `max` minutes, after `minutes`) and was stopped: while it
 * is still "doing" on the same try (`t`, as the check read it), it fails, with a note that its work so far
 * is kept; but when that try's work is already on its branch, it is done instead. The lead is told.
 */
async function timedOut($: $, id: string, t: BoardTask | undefined, max: number, minutes: number) {
  const same = (cur: BoardTask | undefined): cur is BoardTask => cur?.status === 'doing' && (!t || cur.attempts === t.attempts)
  const before = find(await load($), id)
  if (!same(before)) return
  const sha = mergedThisTry(before) ?? (S.gitState === 'ok' ? await alreadyMerged($, before).catch(() => null) : null)
  const out = await change($, x => {
    const cur = find(x, id)
    if (!same(cur)) return [x, null] as [Board, null]
    const next = sha ? mergedDone(cur, sha, `stopped after ${Math.round(minutes)} min`, now()) : patchTask(x, id, { status: 'failed', note: outOfTimeNote(max), history: [...cur.history, `${tryLabel(cur)}: stopped after ${Math.round(minutes)} min (out of time); its work so far is kept in its folder and branch`], ...endedBy(cur, now(), 'timed out', `ran over ${max} min`) }, now()).tasks.find(y => y.id === id)!
    return [{ ...x, tasks: x.tasks.map(y => (y.id === id ? next : y)) }, cur] as [Board, BoardTask]
  })
  if (!out) return
  if (sha) tellLead($, `✓ ${id} "${out.title}" is done: its worker ran over ${max} minutes and was stopped, but its work was already merged (${sha.slice(0, 8)}).`)
  else tellLead($, `${id} "${out.title}": its time (${max} minutes) was up, so I stopped the worker and the task failed. Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${id}); a retry (${S.N.name} retry) continues from there. Or split it, or drop it. The limit can be changed with ${S.N.name} settings max_minutes.`)
}

/** What the lead is told when task `id`'s worker runs over its limit of `limit` minutes and the owner is asked. */
export const overtimeLeadText = (id: string, title: string, limit: number) =>
  `${overtimeQuestion(id, limit)} ("${title}": its worker ran past its time limit; it keeps working while the owner decides.) Options: ${OVERTIME_OPTIONS.join(' | ')}. Ask the owner in the chat now, plain and short, offering these as choices they can pick (e.g. with AskUserQuestion), plus "or answer on the board"; put their answer into the task with ${S.N.name} change ${id} and answer: their choice (e.g. "+30 min" or "Stop it"). With no answer by ${S.N.name}'s hard cap (the limit plus max_minutes again) the worker is told to wrap up and hand back, then stopped, and the task fails with its work kept. If they answer on the board first (a "Meanwhile" line), don't ask again.`

/** Task `id`'s worker runs over its limit: the task keeps "doing" with the question, the owner hears "needs you", the lead is told. */
async function askOvertime($: $, b: Board, id: string, limit: number) {
  const t = await change($, x => {
    const cur = find(x, id)
    if (cur?.status !== 'doing' || cur.time_ask || cur.wrap_up) return [x, null] as [Board, null]
    return [patchTask(x, id, { time_ask: now(), note: OVERTIME_NOTE, history: [...cur.history, `${tryLabel(cur)}: ran ${limit} min, over its time limit; asked the owner for more time`] }, now()), cur] as [Board, BoardTask]
  })
  if (!t) return
  sayNeedsYou($, b, t, overtimeQuestion(id, limit))
  tellLead($, overtimeLeadText(id, t.title, limit))
}

/** Task `id`'s time is up (`why`): its worker is told to write down what it has and hand back; it is stopped WRAP_UP_GRACE_MS later. */
async function wrapUp($: $, id: string, why: string) {
  const t = await change($, x => {
    const cur = find(x, id)
    if (cur?.status !== 'doing' || cur.wrap_up) return [x, null] as [Board, null]
    return [patchTask(x, id, { time_ask: undefined, wrap_up: now(), note: 'time is up: the worker was told to hand back', history: [...cur.history, `${tryLabel(cur)}: time is up (${why}); the worker was told to write down what it has and hand back`] }, now()), cur] as [Board, BoardTask]
  })
  if (!t) return false
  for (const [agentId, w] of workers) if (w.task === id) await $.session.send({ to: { agentId }, text: WRAP_UP_TEXT }).catch(() => undefined)
  return true
}

/**
 * The owner's answer (`answer`) to task `id`'s over-time question (see overtimeQuestion): "+N min" moves its
 * limit N minutes later and the worker goes on; "Stop it" tells the worker to wrap up. Returns what to say,
 * or undefined when the task has no such question (the answer is then handled like any other).
 */
export async function answerOvertime($: $, id: string, answer: string): Promise<string | undefined> {
  const b = await load($)
  const t = find(b, id)
  if (t?.status !== 'doing' || !t.time_ask) return undefined
  const pick = parseOvertimeAnswer(answer)
  if (!pick) throw new Error(`Nothing changed: ${t.id} asks for more time; answer one of ${OVERTIME_OPTIONS.join(', ')} (or "+N min").`)
  if ('stop' in pick) {
    await wrapUp($, t.id, 'the owner said stop')
    return `${t.id}: its worker was told to write down what it has and hand back; it is stopped in ${WRAP_UP_GRACE_MS / 60_000} min at the latest, and the task fails with its work kept.`
  }
  const out = await change($, x => {
    const cur = find(x, t.id)
    if (cur?.status !== 'doing' || !cur.time_ask) return [x, null] as [Board, null]
    const extra = (cur.extra_minutes ?? 0) + pick.add
    return [patchTask(x, t.id, { extra_minutes: extra, time_ask: undefined, note: '', history: [...cur.history, `${tryLabel(cur)}: the owner gave it ${pick.add} more min (limit now ${timeLimitOf(x.max_minutes, { extra_minutes: extra })} min)`] }, now()), timeLimitOf(x.max_minutes, { extra_minutes: extra })] as [Board, number]
  })
  if (out === null) return undefined
  return `${t.id} has ${pick.add} more minutes: its limit is now ${out} min, and its worker goes on.`
}

/** workers whose agent a check saw ended without a hand-back: failed on the next check if still not handed back */
export const seenEnded = new Set<string>()

/** The regular check, every two minutes: keeps work moving and makes sure nothing is stuck or forgotten. */
export async function check($: $) {
  if (!S.driving) return
  await cleanLeftoverTmp($).catch(() => undefined)
  await stopOrphans($)
  const b = await load($)
  if (!symccOn(b)) return
  const agents = await $.agent.list().catch(() => undefined)
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
      const cur = find(await load($), w.task)
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
        workers.delete(agentId)
        await halt($, agentId, `its time is up (it ran longer than ${limit} minutes)`)
        await timedOut($, w.task, t, limit, minutes)
      }
      continue
    }
    // Running too long: it keeps working while the owner is asked for more time; with no answer by the
    // hard cap it is told to wrap up (and stopped after a short grace).
    if (t?.status === 'doing' && minutes > limit) {
      if (!t.time_ask) await askOvertime($, b, w.task, limit)
      else if (minutes > hardCapOf(b.max_minutes, t)) await wrapUp($, w.task, `no answer from the owner after ${Math.round(minutes)} min`)
    }
    // The worker is gone without saying it finished (crashed, or lost): send the task back to the lead.
    // Its report may be on its way (turn.complete hands it on a moment after the agent ends), so it is
    // only failed when it was already seen ended on an earlier check and is still not handed back.
    const ended = minutes > 3 && info !== undefined && ENDED_STATUSES.includes(info.status)
    if (!ended) {
      seenEnded.delete(agentId)
      continue
    }
    if (!seenEnded.has(agentId)) {
      seenEnded.add(agentId)
      continue
    }
    seenEnded.delete(agentId)
    workers.delete(agentId)
    await change($, x => patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', history: [...(t?.history ?? []), `${t ? tryLabel(t) : 'try ?'}: the worker ended without a result`], ...endedBy(find(x, w.task), now(), 'stopped', 'the worker ended without a result') }, now()))
    tellLead($, `${w.task} "${t?.title ?? ''}": the worker ended without a result. Retry it (${S.N.name} retry), change it, or drop it.`)
  }
  // A task kept "doing" after a reload because its old worker was still alive, or because its work
  // was being tested and merged by the old copy of the plugin: once no live agent works on it any
  // more and no merge is going on for it (its finishing mark is no longer refreshed), it goes back
  // to "todo" for a fresh worker; or it is done, when its work already reached the target branch.
  if (agents) {
    const mine = new Set([...workers.values()].map(w => w.task))
    const live = liveDriver(await $.fs.read(path(S.N.leadFile)).catch(() => null), Date.now())
    const free = (t: BoardTask) => t.status === 'doing' && !mine.has(t.id) && !starting.has(t.id) && !finishing.has(t.id) && !finishingNow(t, Date.now())
    // A handed-back worker's agent may stay listed (idle): it doesn't hold its task any more.
    const idle = (await load($)).tasks.filter(t => free(t) && (t.session === S.me || finishingStale(t, Date.now())) && ownedHere(t, S.me, live) && (handedBack(t) || !liveWorkersFor(t, agents as AgentInfo[], S.N.name).length))
    const merged = new Map<string, string>()
    for (const t of idle) {
      const sha = mergedThisTry(t) ?? (S.gitState === 'ok' ? await alreadyMerged($, t).catch(() => null) : null)
      if (sha) merged.set(t.id, sha)
    }
    const ids = idle.map(t => t.id)
    if (ids.length)
      await change($, x => ({
        ...x,
        tasks: x.tasks.map(t => {
          if (!ids.includes(t.id) || !free(t) || [...workers.values()].some(w => w.task === t.id)) return t
          const sha = merged.get(t.id)
          if (sha) return mergedDone(t, sha, 'sent back to todo', now())
          return backToTodo(t, t.finishing ? 'restarted: its test and merge stopped before the end (the plugin reloaded)' : 'restarted: the old worker has ended', now())
        }),
      }))
    for (const id of merged.keys()) tellLead($, `✓ ${id} is done: its work was already merged (${merged.get(id)!.slice(0, 8)}) when the plugin reloaded.`)
  }
  // Failed tasks nobody acted on for 10 minutes: remind the lead once per failure.
  const late = (await load($)).tasks.filter(t => t.status === 'failed' && nowMs - Date.parse(t.updated_at || '') > 10 * 60_000 && reminded.get(t.id) !== t.updated_at)
  for (const t of late) reminded.set(t.id, t.updated_at)
  if (late.length) tellLead($, `Reminder: ${late.map(t => `${t.id} "${t.title}"`).join(', ')} ${late.length > 1 ? 'have' : 'has'} failed and nothing was done about ${late.length > 1 ? 'them' : 'it'}. Retry, change, ask the owner or drop each one.`)
  // Finished work waiting only for the owner's files: merged now (no worker) once they are out of the way.
  await retryFileWaits($).catch(() => undefined)
  if (S.gitState === 'ok') await cleanupMerged($, await load($)).catch(() => undefined)
  // old done and dropped tasks move to archive.json (at most once an hour)
  await archiveOld($).catch(() => undefined)
  // stuck, starving or too-serial tasks, or ones waiting on the owner too long: told once each
  checkHealth($, await load($))
  await pump($)
}
