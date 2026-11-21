// Board mode and stopping: pausing / resuming the board, disabling / enabling symcc, stopping workers (one, all, or
// before the host quits). Split out of workers.ts (T-603); it imports from workers.ts, never the other way.
import type { SymccMode } from '../../types'
import { type Board, modeOf, symccOn, patchTask, find, workerName, setMode, modeText, setEnabled, stoppedEntry, withHistory, endedBy } from '../board'
import { haltCheckers } from './checker'
import { publish } from './lead'
import { S, workers, queuedWorkers, type Worker, halt, scoutRuns, scoutState, leadQueue, meanwhile, sayQueue } from './state'
import type { Host } from '../host'
import { cancelStarts } from './starts'
import { load, change, now } from './store'
import { tellLead } from './tell'
import { pump, stopChecks, stoppedChecksText, onPurpose } from './workers'

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
 * Sets the board mode to `m`; `who` is said in the notes of stopped tasks. "paused" stops every
 * worker and scout at once (their tasks go back to "todo" and continue when work runs again);
 * "review" or "auto" from "paused" starts work again. Going to "auto" does not merge tasks already
 * in review. Returns one short line: the new mode, what it means, and what happened.
 */
export async function setBoardMode(host: Host, m: SymccMode, who: string): Promise<string> {
  const before = modeOf(await load(host))
  const b = await change(host, x => {
    const y = setMode(x, m)
    return [y, y] as [Board, Board]
  })
  const extra: string[] = []
  if (m === 'paused') {
    const ids: string[] = []
    await haltAll(host, `${who} paused the board`, async w => {
      ids.push(w.task)
      await change(host, x => {
        const cur = find(x, w.task)
        return patchTask(x, w.task, { status: 'todo', note: `stopped by ${who}; continues when the board runs again`, ...(cur ? { history: withHistory(cur.history, now(), stoppedEntry(cur, `${who} paused the board`)), ...endedBy(cur, now(), 'stopped', `${who} paused the board`) } : {}) }, now())
      })
    })
    if (ids.length) extra.push(`stopped ${ids.join(', ')}`)
    const checks = stoppedChecksText(await stopChecks(host, 'the board was paused'))
    if (checks) extra.push(checks)
    await publish(host, await load(host))
  } else {
    const inReview = b.tasks.filter(t => t.status === 'review').length
    if (m === 'auto' && inReview) extra.push(`${inReview} already in review still ${inReview === 1 ? 'waits' : 'wait'} for approve or reject`)
    if (before === 'paused') extra.push('work starts again')
    void pump(host)
  }
  return [modeText(m), ...extra].join('; ')
}

/** Drops every board update waiting for the lead (its queue, "Meanwhile" lines, timer) and the lines waiting to be said. */
export function dropLeadUpdates() {
  leadQueue.splice(0)
  meanwhile.splice(0)
  S.leadTimer?.cancel()
  S.leadTimer = null
  S.leadUrgent = false
  sayQueue.splice(0)
}

/**
 * Enables or disables the whole plugin (/<name>-enable, /<name>-disable, the enabled setting). Disabled: every
 * worker and scout stops (their tasks go back to "todo"), nothing new starts, the lead is not
 * told anything and the lead's guide leaves the system prompt from the next message. The board,
 * its mode, tasks and scouts are kept, so enabling brings everything back as it was.
 */
export async function setSymcc(host: Host, on: boolean): Promise<string> {
  const before = symccOn(await load(host))
  // (T-540) disabling counts from now: a board update waiting for its moment (tellLead's timer) must not go out while the
  // board write and the stops below run, or the lead gets it next to the /<name>-disable answer
  // (nor a new one queued meanwhile: tellLead sends nothing once enabledNow is false)
  const was = S.enabledNow
  if (!on) {
    S.enabledNow = false
    dropLeadUpdates()
  }
  const b = await change(host, x => {
    const y = setEnabled(x, on)
    return [y, y] as [Board, Board]
  }).catch(err => {
    S.enabledNow = was
    throw err
  })
  S.enabledNow = on && !S.offHere
  if (!on) {
    const ids: string[] = []
    await haltAll(host, `you disabled ${S.N.name}`, async w => {
      ids.push(w.task)
      await change(host, x => patchTask(x, w.task, { status: 'todo', note: `stopped: ${S.N.name} was disabled; continues when it is enabled again`, ...endedBy(find(x, w.task), now(), 'stopped', `${S.N.name} was disabled`) }, now()))
    })
    const checks = stoppedChecksText(await stopChecks(host, `${S.N.name} was disabled`))
    dropLeadUpdates()
    await publish(host, await load(host))
    const stopped = `${ids.length ? ` Stopped ${ids.join(', ')}.` : ''}${checks ? ` ${checks[0]!.toUpperCase()}${checks.slice(1)}.` : ''}`
    return `${S.N.name} is ${before ? 'now ' : 'already '}disabled: ${S.W.assistant} works as normal from your next message. The board, tasks and scouts are kept.${stopped} Turn it back on with /${S.N.name}-enable.`
  }
  await publish(host, b)
  void pump(host)
  if (!before) tellLead(host, `The owner enabled ${S.N.name} again with /${S.N.name}-enable. You are the lead again; the board is in mode ${modeOf(b)}.`)
  // (T-571) a paused board (/<name>-mode paused) is not the same as a disabled symcc: the strip shows "⏸ paused"
  // for it, and /<name>-enable (which only enables symcc itself) keeps the mode, so say plainly why nothing starts yet
  const paused = modeOf(b) === 'paused' ? ` ${S.N.name} itself is enabled, but the board is paused, so no work starts; start work with /${S.N.name}-mode review or /${S.N.name}-mode auto.` : ''
  return `${S.N.name} is ${before ? 'already ' : ''}enabled, in mode ${modeOf(b)}: ${modeText(modeOf(b))}.${paused}`
}

/**
 * The host is about to quit (`why`, e.g. a command line that stops waiting): every worker, scout and checker of this
 * copy is stopped, and the tasks they worked on go back to "todo" (their folders and branches are kept), so the next
 * run starts them again instead of finding them "doing" with no worker. Answers the ids of the tasks put back.
 */
export async function stopForQuit(host: Host, why: string): Promise<string[]> {
  const ids: string[] = []
  await haltAll(host, why, async w => {
    ids.push(w.task)
    await change(host, x => {
      const cur = find(x, w.task)
      if (cur?.status !== 'doing') return x
      return patchTask(x, w.task, { status: 'todo', note: `stopped: ${why}; continues on the next run`, history: withHistory(cur.history, now(), stoppedEntry(cur, why)), ...endedBy(cur, now(), 'stopped', why) }, now())
    })
  })
  ids.push(...(await stopChecks(host, why)).back)
  if (ids.length) await publish(host, await load(host))
  return ids
}
