// T-755: the regular check and the reload recovery (sending back idle tasks, lost workers), moved out of workers.ts
// (imports go one way: this file imports workers.ts, never back).
import type { SymccTokens } from '../../types'
import { type Board, type BoardTask, liveWorkersFor, modeOf, patchTask, find, intoOf, liveDriver, ownedHere, backToTodo, withTimeline, tryEntry, endedBy, finishingNow, mergedThisTry, mergedDone, handedBack, waitsForFiles, blockerFiles, asBlockers, stillBlocks, timeLimitOf, hardCapOf, WRAP_UP_GRACE_MS, isInvestigation, shortSha, withStoppedUsed, workerActiveMs } from '../board'
import { archiveOld } from './archive'
import { checkHealth } from './health'
import { repoOf, projectGone, git } from './git'
import { cleanupMerged } from './worktree'
import { publish, readLeadText } from './lead'
import { alreadyMerged, AGAIN_MAX, RELOAD_AGAIN, againsThisTry } from './review'
import { S, onHere, workers, starting, type Worker, finishing, stopped, halt, hasWorker, reminded, timers } from './state'
import { type Host, type HostAgent, ENDED_STATUSES, agentState } from '../host'
import { rewakeStarts } from './starts'
import { load, change, now } from './store'
import { tellLead, noteForLead } from './tell'
import { mergeWaiting } from './approve'
import { cleanLeftoverTmp, stopOrphans, timedOut, askOvertime, wrapUp } from './cleanup'
import { afterMs, checkingNow, keptFor, mergeAgain, onPurpose, pump, queuedNeverStarted, restartCheckers, resumeKept, sameTry, unclaimed } from './workers'

/**
 * The regular check's part for tasks whose finished work waits only for the owner's files
 * (BoardTask.live?.merge_wait): each one whose files are out of the way now (or whose branch is not
 * checked out any more) is merged again, with no worker (see mergeWaiting). Not while the board is paused.
 */
export async function retryFileWaits(host: Host) {
  const b = await load(host)
  if (modeOf(b) === 'paused') return
  const waiting = b.tasks.filter(t => waitsForFiles(t) && !checkingNow(t.id))
  // T-1154: the branch checked out and the files in the way are looked at in each task's own repo
  const current = new Map<string, string>()
  const status = new Map<string, string>()
  for (const t of waiting) {
    if (projectGone(t)) continue // its repo is unknown; the board's notes say so
    const repo = repoOf(t)
    if (!current.has(repo)) current.set(repo, (await git(host, ['symbolic-ref', '--short', '-q', 'HEAD'], repo)).stdout.trim())
    if (current.get(repo) === intoOf(t)) {
      if (!status.has(repo)) {
        const st = await git(host, ['status', '--porcelain', '-z', '--untracked-files=all', '--ignored=matching'], repo)
        if (st.exitCode !== 0) return
        status.set(repo, st.stdout)
      }
      if (stillBlocks(status.get(repo)!, blockerFiles(asBlockers(t.live?.merge_wait)!), S.N.dir)) continue
    }
    await mergeWaiting(host, t.id).catch(() => undefined)
    // that merge may have changed the owner's files: look again for the next one
    current.delete(repo)
    status.delete(repo)
  }
}

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
    return patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', timeline: withTimeline(cur.timeline, now(), tryEntry(cur, 'failed', 'the worker ended without a result', { reason: 'noresult' })), ...endedBy(cur, now(), 'stopped', 'the worker ended without a result') }, now())
  })
  if (!failed) return
  tellLead(host, `${w.task} "${t.title}": the worker ended without a result. Retry it (${S.N.name} retry), change it, or drop it.`)
  await publish(host, await load(host))
}

/**
 * A "doing" task no live worker works on any more, with no merge going on for it, goes back to
 * "todo" for a fresh worker (its folder and branch are kept, so the next worker goes on from
 * there), with a timeline line, and the lead is told; or it is done, when its work already reached
 * its target branch. Such a task is left when its worker was lost: kept "doing" after a reload
 * because its old worker was still alive, a worker stopped by this copy (an orphan, see
 * stopOrphans), or its work was being tested and merged by an old copy of the plugin (its finishing
 * mark is no longer refreshed). An agent this copy stopped never counts as working on a task: every
 * tool it tries is refused, even while it is still listed. Only tasks this session may take over
 * (ownedHere) are touched, and never one whose worker is being stopped on purpose (onPurpose).
 */
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
      if (!was || !free(t) || !sameTry(t, was) || hasWorker(t.id)) return t
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
  if (back.length) noteForLead(`${back.map(t => `${t.id} "${t.title}"`).join(', ')}: no worker was working on ${back.length > 1 ? 'them' : 'it'} any more (${back.length > 1 ? 'their workers' : 'its worker'} stopped or ended), so ${back.length > 1 ? 'they go' : 'it goes'} back to todo; the next worker goes on from the same folder and branch.`)
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
