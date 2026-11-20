// Leftover and overtime cleanup for the regular check: stopping orphan agents after a reload, removing leftover
// temp files, and a worker that runs over its time limit (ask the owner, wrap up, time out). Split out of
// workers.ts (T-603); workers.ts's check() imports it, and it never imports workers.ts.
import { type Board, type BoardTask, orphanMove, liveWorkersFor, putTask, find, patchTask, tryLabel, liveDriver, emptyBoard, leftoverTmpFiles, withHistory, endedBy, mergedThisTry, mergedDone, handedBack, timeLimitOf, overtimeQuestion, OVERTIME_OPTIONS, OVERTIME_NOTE, WRAP_UP_TEXT, WRAP_UP_GRACE_MS, parseOvertimeAnswer, outOfTimeNote, shortSha } from '../board'
import { worktreeDir, taskBranch } from './git'
import { alreadyMerged } from './review'
import { S, workers, starting, finishing, stopped, isOwnAgent, halt, tmpWarned } from './state'
import { type Host, type HostAgent, ENDED_STATUSES, agentState } from '../host'
import { load, change, now, path, aboutToWait } from './store'
import { tellLead } from './tell'
import { sayNeedsYou } from './voice'
import { optionsVia, popupTied } from './questions'

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
  // T-474: agent processes an earlier run of the host recorded and left running (it was killed): not in list() any
  // more, so they are stopped from the record (dead entries are dropped); their tasks go back like any orphan's
  const leftovers = (await host.agents.stopLeftovers?.().catch(() => [] as string[])) ?? []
  // Every worker type (worker, worker-web, ...) is listed as a worker (see HostAgent).
  const agents = await host.agents.list().catch(() => [])
  // host.agents.list() names this session's agents only, but in case it ever lists another
  // session's too: never stop a worker whose task the live driver (another session) owns.
  const lead = leadNow !== undefined ? leadNow : await host.fs.read(path(S.N.leadFile)).catch(() => null)
  const live = liveDriver(lead, Date.now())
  // A board that can't be read (being fixed, or a read failing now) says nothing about whose
  // worker is whose: then no worker is stopped (the next check looks again), only scouts are.
  const b = agents.some(a => a.kind === 'worker') ? await load(host).catch(() => null) : emptyBoard()
  const out: string[] = [...leftovers]
  for (const a of agents) {
    if (a.kind === 'other') continue
    // Already tracked, or already told to stop: not taken back, and not messaged again (a message would wake it up).
    if (isOwnAgent(a.id)) continue
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
export async function timedOut(host: Host, id: string, t: BoardTask | undefined, max: number, minutes: number) {
  const same = (cur: BoardTask | undefined): cur is BoardTask => cur?.status === 'doing' && (!t || cur.attempts === t.attempts)
  const before = find(await load(host), id)
  if (!same(before)) return
  const sha = mergedThisTry(before) ?? (S.gitState === 'ok' ? await alreadyMerged(host, before).catch(() => null) : null)
  const out = await change(host, x => {
    const cur = find(x, id)
    if (!same(cur)) return [x, null] as [Board, null]
    const next = sha ? putTask(x, mergedDone(cur, sha, `stopped after ${Math.round(minutes)} min`, now())) : patchTask(x, id, { status: 'failed', note: outOfTimeNote(max), history: withHistory(cur.history, now(), ['out-of-time', `${tryLabel(cur)}: stopped after ${Math.round(minutes)} min (out of time); its work so far is kept in its folder and branch`]), ...endedBy(cur, now(), 'timed out', `ran over ${max} min`) }, now())
    return [next, cur] as [Board, BoardTask]
  })
  if (!out) return
  if (sha) tellLead(host, `✓ ${id} "${out.title}" is done: its worker ran over ${max} minutes and was stopped, but its work was already merged (${shortSha(sha)}).`)
  else tellLead(host, `${id} "${out.title}": its time (${max} minutes) was up, so I stopped the worker and the task failed. Its work so far is kept in its folder and branch, and its report (${S.N.name} board task ${id}); a retry (${S.N.name} retry) continues from there. Or split it, or drop it. The limit can be changed with ${S.N.name} settings max_minutes.`)
}

/** What the lead is told when task `id`'s worker runs over its limit of `limit` minutes and the owner is asked. */
export const overtimeLeadText = (id: string, title: string, limit: number) =>
  `${overtimeQuestion(id, limit)} ("${title}": its worker ran past its time limit; it keeps working while the owner decides.) Options: ${OVERTIME_OPTIONS.join(' | ')}. Ask the owner in the chat now, plain and short, offering these ${optionsVia(OVERTIME_OPTIONS.length)}, plus "or answer on the board"; put their answer into the task with ${S.N.name} change ${id} and answer: their choice (e.g. "+30 min" or "Stop it"). With no answer by ${S.N.name}'s hard cap (the limit plus max_minutes again) the worker is told to wrap up and hand back, then stopped, and the task fails with its work kept. If they answer on the board first (a "Meanwhile" line), don't ask again.${popupTied(id)}`

/** Task `id`'s worker runs over its limit: the task keeps "doing" with the question, the owner hears "needs you", the lead is told. */
export async function askOvertime(host: Host, b: Board, id: string, limit: number) {
  const t = await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== 'doing' || cur.time_ask || cur.wrap_up) return [x, null] as [Board, null]
    return [patchTask(x, id, { time_ask: now(), note: OVERTIME_NOTE, history: withHistory(cur.history, now(), ['out-of-time', `${tryLabel(cur)}: ran ${limit} min, over its time limit; asked the owner for more time`]) }, now()), cur] as [Board, BoardTask]
  })
  if (!t) return
  sayNeedsYou(host, b, t, overtimeQuestion(id, limit))
  tellLead(host, overtimeLeadText(id, t.title, limit), { urgent: true })
}

/** Task `id`'s time is up (`why`): its worker is told to write down what it has and hand back; it is stopped WRAP_UP_GRACE_MS later. */
export async function wrapUp(host: Host, id: string, why: string) {
  const t = await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== 'doing' || cur.wrap_up) return [x, null] as [Board, null]
    return [patchTask(x, id, { time_ask: undefined, wrap_up: now(), note: 'time is up: the worker was told to hand back', history: withHistory(cur.history, now(), ['out-of-time', `${tryLabel(cur)}: time is up (${why}); the worker was told to write down what it has and hand back`]) }, now()), cur] as [Board, BoardTask]
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
    return [patchTask(x, t.id, { extra_minutes: extra, time_ask: undefined, note: '', history: withHistory(cur.history, now(), ['step', `${tryLabel(cur)}: the owner gave it ${pick.add} more min (limit now ${timeLimitOf(x.max_minutes, { extra_minutes: extra })} min)`]) }, now()), timeLimitOf(x.max_minutes, { extra_minutes: extra })] as [Board, number]
  })
  if (out === null) return undefined
  return `${t.id} has ${pick.add} more minutes: its limit is now ${out} min, and its worker goes on.`
}
