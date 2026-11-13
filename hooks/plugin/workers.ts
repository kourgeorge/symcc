import type { SymccTask, SymccMode } from '../../types'
import { type Board, type RoleDef, roleSection, modeOf, symccOn, ready, patchTask, find, mayStart, startRun, findRole, roleOf, oldRoleSwap, workerName, workerDescription, isNotReady, onNotReady, type AgentInfo, ENDED_STATUSES, endRun, parseNeedFiles, tryLabel, needFilesQuestion, onConflict, MAX_CONFLICT_TRIES, DEFAULT_AUTO_RETRIES, onTestFail, reviewTask, ownerEditedLine, gitNote, missingBranchText, setMode, modeText, setEnabled, liveDriver, emptyBoard, orphanMove, leftoverTmpFiles, ownedHere, liveWorkersFor, backToTodo, stoppedLine, cutLine, reportFile, reportText } from '../board'
import { gitReady, targetReady, prepareWorktree, removeWorktree, git, worktreeDir, cleanupMerged } from './git'
import { publish } from './lead'
import { type CheckResult, checkAndMerge, recordCommits, ownerEdits } from './review'
import { loadRoles } from './roles'
import { S, type $, workers, starting, type Worker, notReady, heard, finishing, approving, stopped, scoutRuns, scoutState, leadQueue, sayQueue, tmpWarned, reminded } from './state'
import { load, change, now, path } from './store'
import { tellLead } from './tell'
import { sayDone, sayNeedsYou } from './voice'

// ---------------- workers ----------------

/** A task's history without the "created by ..." line: what earlier tries did. */
export const tries = (t: SymccTask) => t.history.filter(line => !line.startsWith('created by '))

export const WORKER_PROMPT = (t: SymccTask, b: Board, dir: string, role?: RoleDef) => `You are a ${S.N.name} worker. Do exactly this one task, then stop.

Work ONLY inside this folder, your own copy of the project on branch ${t.branch ?? S.N.branch(t.id)}:
  ${dir}
Use absolute paths under that folder for every Read, Edit and Write. Never touch the main project folder.

Task ${t.id}: ${t.title}
${t.details}
${roleSection(role)}
Files you may change: ${t.files.length ? `${t.files.join(', ')}. This is the full list; changes anywhere else are thrown away.
If you find you must change a file outside this list, do NOT change it. Stop at once and answer with just one line:
  NEED FILES: path/a, path/b — <one short reason>
(You don't need to finish anything else first; what you already changed in your folder is kept for the next try.)` : 'whatever the task needs.'}
${b.test_commands.length ? `After you finish, these must pass (run them in that folder to check): ${b.test_commands.join(' && ')}` : 'There is no test command; keep the change small and correct.'}
Do not run git commit, push or merge: ${S.N.name} commits, tests and merges your work.
${t.merge_main ? `\nFirst, ${b.target_branch} has moved and your branch now conflicts with it. In that folder, run \`git merge ${b.target_branch}\` and resolve the conflicts (for this one step only you may run that git merge; still don't commit). Keep this task's intent, keep the changes inside the task's files, and make sure the tests pass.\n` : ''}${t.test_output ? `\nYour last try failed these tests; fix it. The end of the test output:\n\`\`\`\n${t.test_output}\n\`\`\`\n` : ''}${tries(t).length ? `\nEarlier tries:\n${tries(t).slice(-5).map(line => `- ${line}`).join('\n')}\nDon't repeat those mistakes.\n` : ''}
When you are done, answer in one or two plain sentences: what you changed. If you truly cannot continue without the owner deciding something, answer with one line starting "QUESTION:" and the question; the task will wait for the owner's answer and a new try continues with it.`

export async function pump($: $) {
  if (!S.startupDone) return // session.start hasn't finished; it pumps itself at its end
  if (!S.driving) return // another session drives the board and starts its work
  const b = await load($)
  if (modeOf(b) === 'off' || !symccOn(b)) return
  if (!ready(b).length) return
  if (!(await gitReady($, b))) return // no git, no repo or no commit yet: nothing starts until it is set up
  if (!(await targetReady($, b))) return // nothing starts and nothing is marked failed
  for (const t of ready(b)) {
    if (workers.size >= b.max_parallel) break
    if (starting.has(t.id) || checkingNow(t.id) || [...workers.values()].some(w => w.task === t.id)) continue
    await startWorker($, t.id).catch(async (err: Error) => {
      await change($, x => patchTask(x, t.id, { status: 'failed', note: `couldn't start: ${err.message.slice(0, 200)}` }, now()))
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
    if (!(await targetReady($, b))) return // the branch to merge into is missing: leave the task "todo"
    const { dir, branch } = await prepareWorktree($, t0!, b.target_branch)
    const roles = await loadRoles($)
    const t = await change($, x => {
      const cur = find(x, id)
      if (!mayStart(cur, agents, S.N.name)) return [x, null]
      const at = now()
      // An old role (tests, backend, frontend) runs as its new one, with a history line saying so.
      const swap = oldRoleSwap(cur!, roles)
      const y = patchTask(x, id, { status: 'doing', session: S.me, attempts: cur!.attempts + 1, branch, note: 'worker on it', runs: startRun(cur!.runs, at), ...(swap ? { role: swap.role, history: [...cur!.history, swap.line] } : {}) }, at)
      return [y, find(y, id)!]
    })
    if (!t) return
    const before = find(b, id)!
    let agentId: string
    try {
      const role = findRole(roles, roleOf(t))
      const spawned = await $.agent.spawn({ prompt: WORKER_PROMPT(t, b, dir, role), name: workerName(S.N.name, t.id), description: workerDescription(t.title), subagentType: S.N.worker, cwd: dir, ...(role?.model ? { model: role.model } : {}) })
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

/** The agents of this session as $.agent.list() reports them; null if the list can't be read. */
export async function agentsNow($: $): Promise<AgentInfo[] | null> {
  return ((await $.agent.list().catch(() => null)) as AgentInfo[] | null) ?? null
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
    await $.clock.sleep(500)
  }
}

export async function workerFinished($: $, agentId: string, answer: string, aborted: boolean, tokens?: number) {
  const w = workers.get(agentId)
  if (!w) return
  workers.delete(agentId)
  const at = now()
  heard.workers[w.task] = at
  heard.last = { what: `${w.task} worker report`, at }
  finishing.add(w.task)
  try {
    // The try ends now (checking and merging is not counted). The turn result gives tokens but
    // no dollar cost, so `cost` stays empty until Claude Code reports one.
    const ended = now()
    await change($, x => {
      const t = find(x, w.task)
      return t?.status === 'doing' && t.runs?.length ? patchTask(x, w.task, { runs: endRun(t.runs, ended, { tokens }) }, ended) : x
    })
    await finishWork($, agentId, w, answer, aborted)
  } finally {
    finishing.delete(w.task)
    await endCheck($, w.task)
  }
  await pump($)
}

// ---------------- a task changed while its work is checked ----------------
// After a worker finishes, its task stays "doing" while the scope check, the tests and the merge
// run (finishWork; for approve, the task stays "review"). The lead can drop, pause or ask about it
// meanwhile: those write the new status at once, mark the task here, and leave its folder alone
// until the check ends (endCheck). The check then stops before the merge (gated), and settle
// keeps the new status. A change of the task during the check is refused (see tools.ts).

/** Tasks dropped, paused or sent to the owner while their work was being checked: task id → what happened. */
export const stopAsked = new Map<string, string>()

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
async function writeIfSame($: $, t: SymccTask, patch: (cur: SymccTask) => Partial<SymccTask>): Promise<SymccTask | 'gone' | null> {
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
  const was = await change($, x => {
    const cur = find(x, t.id)
    if (!cur) return [x, null] as [Board, null]
    const y = merged
      ? patchTask(x, t.id, { status: 'done', note: `merged; it was ${cur.status} too late to stop it`, merge_main: false, test_output: undefined, ...(r.notes?.length ? { research_notes: r.notes } : {}), history: [...cur.history, line, `${tryLabel(t)}: it was ${cur.status} while being merged, too late: the work was already merged, so it stays done`] }, now())
      : patchTask(x, t.id, { history: [...cur.history, `${line} (not used: the task was ${cur.status} meanwhile)`] }, now())
    return [y, cur.status] as [Board, string]
  })
  if (!was) return
  if (!merged) {
    tellLead($, `${t.id} "${t.title}" was ${was} while its work was being checked; nothing was merged and it stays ${was}.`)
    return
  }
  sayDone($, b, t.id)
  if (await removeWorktree($, t.id, worktree, agentId, true).catch(() => false)) await git($, ['branch', '-d', t.branch ?? S.N.branch(t.id)])
  tellLead($, `✓ ${t.id} "${t.title}" is merged: it was ${was} too late, after the merge had already happened, so it is done.`)
}

/** What the lead is told when a worker stopped with a QUESTION and its task now waits for the owner. */
export const workerQuestionText = (id: string, question: string) =>
  `${id} is waiting for the owner: ${question}${/[.?!]$/.test(question) ? '' : '.'} If you can answer it from what you know, answer with ${S.N.name} change ${id} (put the answer in the details); otherwise leave it for the owner.`

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
    const file = path(rel)
    const tmp = `${file}.tmp`
    await $.process.run(['mkdir', '-p', path(`${S.N.dir}/reports`)])
    await $.fs.write(tmp, reportText(answer))
    const r = await $.process.run(['mv', '-f', tmp, file])
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 200) || `mv exit ${r.exitCode}`)
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

export async function finishWork($: $, agentId: string, w: { task: string; worktree: string; branch: string }, answer: string, aborted: boolean) {
  const b = await load($)
  const t = find(b, w.task)
  if (!t || t.status !== 'doing') return // changed or dropped meanwhile
  await saveReport($, t, answer)
  const summary = cutLine(answer, 600) || '(no summary)'
  const q = /^\s*QUESTION:\s*(.+)$/im.exec(answer)
  const need = parseNeedFiles(answer)
  if (aborted) {
    if (await writeIfSame($, t, cur => ({ status: 'failed', note: 'the worker was stopped', history: [...cur.history, `${tryLabel(t)}: stopped before finishing`] }))) return
    tellLead($, `${t.id} "${t.title}": the worker was stopped before finishing.`)
  } else if (need) {
    const question = needFilesQuestion(t.id, need)
    if (await writeIfSame($, t, cur => ({ status: 'waiting', question: question.slice(0, 1000), note: 'waiting for you', history: [...cur.history, `${tryLabel(t)}: worker asked for more files: ${need.files.join(', ')}${need.reason ? ` — ${need.reason}` : ''}`] }))) return
    sayNeedsYou($, b, t, question)
    tellLead($, `${question}\nThe task now waits for the owner. If they agree, ${S.N.name} change ${t.id} with the wider files (that sends it back to work; what the worker already changed is kept). Otherwise ${S.N.name} drop it, or change it to a narrower plan that fits its files.`)
  } else if (q) {
    // Straight to the owner, like NEED FILES: the task waits with the question; their answer sends it back to work.
    const question = q[1]!.trim()
    if (await writeIfSame($, t, cur => ({ status: 'waiting', question: question.slice(0, 1000), note: 'waiting for you', history: [...cur.history, `${tryLabel(t)}: worker asked: ${question}`] }))) return
    sayNeedsYou($, b, t, question)
    tellLead($, workerQuestionText(t.id, question))
  } else {
    await change($, x => (find(x, t.id)?.status === 'doing' ? patchTask(x, t.id, { note: 'checking and merging' }, now()) : x))
    const made: string[] = []
    const r: CheckResult = await checkAndMerge($, t, w.worktree, b, 'finish', made, () => stopAsked.get(t.id)).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    await recordCommits($, t.id, made, r.merged)
    await settle($, t, b, r, summary, w.worktree, agentId)
  }
}

/**
 * What happens to task `t` after its work was checked (`r`): back to "todo" for a new try after
 * a conflict or failing tests (while it has tries left), "review" when it waits for the owner,
 * else "done" (merged) or "failed". `summary` is what the worker (or the owner, on approve) said.
 */
export async function settle($: $, t: SymccTask, b: Board, r: CheckResult, summary: string, worktree: string, agentId?: string) {
  const line = `${tryLabel(t)}: ${cutLine(summary, 300)} → ${r.detail}`
  // Every write below reads the task again and is skipped when it was dropped, paused or changed meanwhile.
  const write = async (patch: (cur: SymccTask) => Partial<SymccTask>) => {
    const moved = await writeIfSame($, t, patch)
    if (moved && moved !== 'gone') await changedMeanwhile($, t, b, r, line, worktree, agentId)
    return !moved
  }
  if (r.review) {
    if (!(await write(cur => ({ status: 'review', note: 'ready for review: the checks passed, nothing merged yet', merge_main: false, test_output: undefined, history: [...cur.history, line] })))) return
    tellLead($, `${t.id} "${t.title}" is ready for review. Worker: ${cutLine(summary, 300)}\nThe change is on branch ${t.branch ?? S.N.branch(t.id)} (folder ${S.N.dir}/worktrees/${t.id}). Show the owner what changed; then ${S.N.name} approve ${t.id} merges it, or ${S.N.name} reject ${t.id} with a reason sends it back to a fresh worker. The owner may also edit the files in that folder first; approve then commits those edits with the task and runs the tests again.`)
    return
  }
  const tries = t.conflict_tries ?? 0
  if (r.conflict && onConflict(t) === 'retry') {
    // Don't fail yet: a new worker merges main into the branch and resolves the conflicts.
    const note = `conflicts with the latest ${b.target_branch}; a new try will merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES})`
    if (!(await write(cur => ({ status: 'todo', note, conflict_tries: tries + 1, merge_main: true, history: [...cur.history, line] })))) return
    tellLead($, `${t.id} "${t.title}" conflicts with the latest ${b.target_branch}; starting a new try to merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES}).`)
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
  const detail = r.conflict ? `conflicts with the latest ${b.target_branch}, still after ${tries} tries to merge it in` : r.detail
  const done = `${tryLabel(t)}: ${cutLine(summary, 300)} → ${detail}`
  if (!(await write(cur => ({ status: r.ok ? 'done' : 'failed', note: detail.slice(0, 300), merge_main: false, test_output: r.testOutput, history: [...cur.history, done], ...(r.ok && r.notes?.length ? { research_notes: r.notes } : {}) })))) return
  if (r.ok) sayDone($, b, t.id)
  // Merged: its folder goes, then its branch (-d: git refuses if it isn't merged, so nothing is lost).
  if (r.ok && (await removeWorktree($, t.id, worktree, agentId, true))) await git($, ['branch', '-d', t.branch ?? S.N.branch(t.id)])
  const gaveUp = r.testOutput !== undefined ? `\nIt already had ${testTries} automatic ${testTries === 1 ? 'retry' : 'retries'}. The end of the last test output:\n${r.testOutput}` : ''
  tellLead($, r.ok ? `✓ ${t.id} "${t.title}" is merged. Worker: ${cutLine(summary, 300)}` : `✗ ${t.id} "${t.title}" was not merged: ${detail}\nWorker said: ${cutLine(summary, 300)}${gaveUp}`)
}

/** The owner approved task `id` (in "review"): the same checked merge as for a finished worker. */
export async function approve($: $, id: string): Promise<string> {
  const b = await load($)
  const t = reviewTask(b, id, 'approve')
  if (approving.has(t.id)) return `${t.id} is already being merged`
  if (!(await gitReady($, b))) return `${t.id} stays in review: ${gitNote(S.gitState)}`
  if (!(await targetReady($, b))) return `${t.id} stays in review: ${missingBranchText(b.target_branch)}`
  approving.add(t.id)
  try {
    const dir = worktreeDir(t.id)
    if (!(await $.fs.exists(`${dir}/.git`))) await prepareWorktree($, t, b.target_branch)
    // The owner's own edits in the folder since review (or edits whose tests failed on an
    // earlier approve, kept as test_output): those are committed with the task and always tested.
    const edits = await ownerEdits($, t, dir).catch(() => [] as string[])
    const retest = edits.length > 0 || t.test_output !== undefined
    await change($, x => {
      const cur = find(x, t.id)
      if (cur?.status !== 'review') return x
      return patchTask(x, t.id, { note: 'approved; checking and merging', ...(edits.length ? { history: [...cur.history, ownerEditedLine(edits)] } : {}) }, now())
    })
    const made: string[] = []
    const r: CheckResult = await checkAndMerge($, t, dir, b, 'approve', made, () => stopAsked.get(t.id), retest).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    await recordCommits($, t.id, made, r.merged)
    const cur = find(await load($), t.id)
    if (r.merged) {
      // The work is on the target branch: the task is done, whatever happened to it meanwhile
      // (settle marks it done; when it changed meanwhile, with a line saying the change came too late).
      const sha = r.merged.slice(0, 8)
      if (!cur) {
        tellLead($, `${t.id} "${t.title}" was merged into ${b.target_branch} (${sha}), but it is no longer on the board.`)
        return `${t.id} was merged into ${b.target_branch} (${sha}), but it is no longer on the board`
      }
      await settle($, t, b, r, 'approved by the owner', dir)
      return cur.status === 'review' ? `${t.id} approved and merged: ${r.detail}` : `${t.id} was merged into ${b.target_branch} (${sha}) before it was ${cur.status}; it is done`
    }
    if (cur?.status !== 'review') return `${t.id} changed while it was being merged (it is now ${cur?.status ?? 'gone'}); nothing was merged`
    if (retest && r.testOutput !== undefined) {
      // The owner's edits fail the tests: it stays in review with the output, not sent to a worker.
      const folder = `${S.N.dir}/worktrees/${t.id}`
      await change($, x => {
        const c = find(x, t.id)
        return c?.status === 'review' ? patchTask(x, t.id, { note: `approved, but your edits fail the tests: ${r.detail.slice(0, 220)}`, test_output: r.testOutput, history: [...c.history, `${tryLabel(t)}: approved by the owner → not merged, the tests failed after your edits: ${r.detail.slice(0, 250)}`] }, now()) : x
      })
      tellLead($, `${t.id} "${t.title}" was not merged: with the owner's edits the tests fail. It stays in review; the owner can fix the files in ${folder} and approve again.\n${r.testOutput}`)
      return `${t.id} was not merged and stays in review: ${r.detail}. Fix the files in ${folder}, then approve it again (the tests run again).`
    }
    if (!r.ok && !r.conflict && r.testOutput === undefined) {
      // Not the work's fault (e.g. uncommitted changes on the target branch): it stays in review.
      await change($, x => patchTask(x, t.id, { note: `approved, but not merged: ${r.detail.slice(0, 250)}` }, now()))
      return `${t.id} was not merged and stays in review: ${r.detail}. Fix that, then approve it again.`
    }
    await settle($, cur, b, r, 'approved by the owner', dir)
    return r.ok ? `${t.id} approved and merged: ${r.detail}` : `${t.id} approved, but not merged: ${r.detail}${r.conflict || r.testOutput !== undefined ? ' (see the board for what happens next)' : ''}`
  } finally {
    approving.delete(t.id)
    await endCheck($, t.id)
    void pump($) // after the check: a task sent back to "todo" (or resumed meanwhile) starts again
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
        return patchTask(x, w.task, { status: 'todo', note: `stopped by ${who}; continues when the board is on again`, ...(cur ? { history: [...cur.history, stoppedLine(cur, `${who} turned the board off`)] } : {}) }, now())
      })
    })
    if (ids.length) extra.push(`stopped ${ids.join(', ')}`)
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
      await change($, x => patchTask(x, w.task, { status: 'todo', note: `stopped: ${S.N.name} was turned off; continues when it is on again` }, now()))
    })
    leadQueue.splice(0)
    S.leadTimer?.cancel()
    S.leadTimer = null
    sayQueue.splice(0)
    await publish($, await load($))
    const stopped = ids.length ? ` Stopped ${ids.join(', ')}.` : ''
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
  const agents = await $.agent.list().catch(() => [])
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
  return out
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

/** The regular check, every two minutes: keeps work moving and makes sure nothing is stuck or forgotten. */
export async function check($: $) {
  if (!S.driving) return
  await cleanLeftoverTmp($).catch(() => undefined)
  await stopOrphans($)
  const b = await load($)
  if (!symccOn(b)) return
  const agents = await $.agent.list().catch(() => undefined)
  const nowMs = Date.now()
  for (const [agentId, w] of [...workers]) {
    const minutes = (nowMs - w.since) / 60_000
    const info = agents?.find(a => a.id === agentId)
    const t = find(b, w.task)
    // Running too long: stop it and let the lead decide.
    if (minutes > b.max_minutes) {
      workers.delete(agentId)
      await halt($, agentId, `it ran longer than ${b.max_minutes} minutes`)
      await change($, x => patchTask(x, w.task, { status: 'failed', note: `stopped: ran over ${b.max_minutes} min`, history: [...(t?.history ?? []), `${t ? tryLabel(t) : 'try ?'}: stopped after ${Math.round(minutes)} min (over the limit)`] }, now()))
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ran over ${b.max_minutes} minutes, so I stopped it. Retry it (${S.N.name} retry), split it, or drop it. The limit can be changed with ${S.N.name} settings max_minutes.`)
      continue
    }
    // The worker is gone without saying it finished (crashed, or lost): send the task back to the lead.
    const lost = minutes > 3 && info !== undefined && ENDED_STATUSES.includes(info.status)
    if (lost) {
      workers.delete(agentId)
      await change($, x => patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', history: [...(t?.history ?? []), `${t ? tryLabel(t) : 'try ?'}: the worker ended without a result`] }, now()))
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ended without a result. Retry it (${S.N.name} retry), change it, or drop it.`)
    }
  }
  // A task kept "doing" after a reload because its old worker was still alive: once no live
  // agent works on it any more, it goes back to "todo" for a fresh worker.
  if (agents) {
    const mine = new Set([...workers.values()].map(w => w.task))
    const live = liveDriver(await $.fs.read(path(S.N.leadFile)).catch(() => null), Date.now())
    const idle = (await load($)).tasks.filter(t => t.status === 'doing' && t.session === S.me && !mine.has(t.id) && !starting.has(t.id) && !finishing.has(t.id) && ownedHere(t, S.me, live) && !liveWorkersFor(t, agents as AgentInfo[], S.N.name).length).map(t => t.id)
    if (idle.length)
      await change($, x => ({
        ...x,
        tasks: x.tasks.map(t => {
          if (!idle.includes(t.id) || t.status !== 'doing' || [...workers.values()].some(w => w.task === t.id) || starting.has(t.id) || finishing.has(t.id)) return t
          return backToTodo(t, 'restarted: the old worker has ended', now())
        }),
      }))
  }
  // Failed tasks nobody acted on for 10 minutes: remind the lead once per failure.
  const late = (await load($)).tasks.filter(t => t.status === 'failed' && nowMs - Date.parse(t.updated_at || '') > 10 * 60_000 && reminded.get(t.id) !== t.updated_at)
  for (const t of late) reminded.set(t.id, t.updated_at)
  if (late.length) tellLead($, `Reminder: ${late.map(t => `${t.id} "${t.title}"`).join(', ')} ${late.length > 1 ? 'have' : 'has'} failed and nothing was done about ${late.length > 1 ? 'them' : 'it'}. Retry, change, ask the owner or drop each one.`)
  if (S.gitState === 'ok') await cleanupMerged($, await load($)).catch(() => undefined)
  await pump($)
}
