import { whoDrives, leadText, resetDoing, find, parseLead, relabelSession, openOnStart, type Board, gitNote, modeOf, notifyOf, notifyChoices, symccOn, statusLine, statusRoom, offStatusLine, inPlan } from '../board'
import { liveWorkersFor } from '../claude/agents'
import { homeBranch } from './git'
import { S, workers, type PaneView, scoutState, updateView } from './state'
import type { Host } from '../host'
import { path, locked, change, now, load, safeWrite } from './store'
import { openPane } from './ui/open'
import { playable } from './voice'
import { logoIdle, logoOnPublish } from './logo'
import { stopOrphans, waitEnded, ORPHAN_WAIT_MS, haltAll, haltWorkers } from './workers'

// ---------------- who drives the board ----------------
// Only one session (the driver) starts workers, merges, runs scouts and the regular check.
// It keeps .<name>/lead.json fresh; the others read and change the board but start nothing.

export async function writeLead($: Host, text: string) {
  await safeWrite($, path(S.N.leadFile), text, S.N.leadFile)
}

/**
 * Looks at lead.json and acts on it: becomes the driver if nobody drives, refreshes the
 * heartbeat if this session drives, takes over if the driver's heartbeat went stale, and
 * steps down if another session drives. `fresh` = this copy of the plugin just loaded,
 * so any worker it had is gone. Returns whether this session drives now.
 */
export async function claimLead($: Host, fresh = false): Promise<boolean> {
  const was = S.driving
  const [move, leadBefore] = await locked($, async () => {
    const text = await $.fs.read(path(S.N.leadFile)).catch(() => null)
    const m = whoDrives(text, S.me, Date.now())
    if (m !== 'follow') await writeLead($, leadText(S.me, Date.now()))
    return [m, text] as const
  })
  S.driving = move !== 'follow'
  if (S.driving && (!was || fresh)) {
    // Workers the old driver (or an earlier load of this plugin) left behind are stopped
    // first, and their tasks go back to "todo", so a task never has two workers.
    const orphans = await stopOrphans($, leadBefore)
    if (orphans.length) $.ui.toast(S.N.toast(`stopped ${orphans.length} old worker${orphans.length > 1 ? 's' : ''} left behind`))
    // A stopped worker may still be running for a while: wait until it has really ended.
    // A task whose old worker is still alive after that stays "doing"; the regular check
    // sends it back to "todo" once that worker has ended, so a task never has two workers.
    const alive = await waitEnded($, orphans, ORPHAN_WAIT_MS)
    const note = move === 'takeover' ? 'restarted: the session driving the board stopped answering' : move === 'keep' ? 'restarted: the plugin reloaded and the old worker was gone' : 'restarted after Claude Code was reopened'
    // Only tasks of this session, of a session that no longer drives, or with no session
    // recorded go back: a task whose worker runs in the live driver keeps it.
    if (await $.fs.exists(path(S.N.boardFile)))
      await change($, b => resetDoing(b, S.me, leadBefore, Date.now(), note, now(), b.tasks.filter(t => liveWorkersFor(t, alive, S.N.name).length > 0 || [...workers.values()].some(w => w.task === t.id)).map(t => t.id)))
    if (move === 'takeover' && !fresh) $.ui.toast(S.N.toast('the session driving the board stopped answering; this session drives it now'))
  }
  if (was && !S.driving) {
    // Another session took over (this one stopped answering for too long): its workers own the tasks now.
    await haltAll($, 'another session drives the board now')
    $.ui.toast(S.N.toast('another session drives the board now; this one only shows and changes it'))
  }
  if (S.driving) {
    // A task stopped, dropped or changed from another session: stop its worker here.
    const b = await load($)
    await haltWorkers($, 'the task was changed on the board', w => find(b, w.task)?.status !== 'doing')
  }
  if (was !== S.driving || fresh) await publish($, await load($))
  // the heartbeat (every 30 s) also looks whether the banner logo's idle sway is due
  void logoIdle($).catch(() => undefined)
  return S.driving
}

/** On session end the driver lets go of lead.json, so another session can take over at once. */
export async function releaseLead($: Host) {
  if (!S.driving) return
  S.driving = false
  await locked($, async () => {
    const file = path(S.N.leadFile)
    if (parseLead(await $.fs.read(file).catch(() => null))?.session === S.me) await $.process.run(['rm', '-f', file])
  }).catch(() => undefined)
}

/**
 * After /clear: this process goes on under a new session id. lead.json and this session's
 * "doing" tasks move to the new id (so our own live workers aren't taken for a dead
 * session's), and the board panel is shown again for the new session.
 */
export async function handOver($: Host) {
  const old = S.me
  const fresh = await $.session.id().catch(() => old)
  if (fresh && fresh !== old) {
    S.me = fresh
    if (S.driving)
      await locked($, async () => {
        const l = parseLead(await $.fs.read(path(S.N.leadFile)).catch(() => null))
        if (!l || l.session === old) await writeLead($, leadText(S.me, Date.now()))
      })
    if (await $.fs.exists(path(S.N.boardFile))) await change($, b => relabelSession(b, old, S.me))
  }
  const b = await load($)
  await publish($, b)
  if (openOnStart(b)) await openPane($, { focus: false, quiet: true })
}

export async function publish($: Host, b: Board) {
  const working = [...workers.values()].map(w => ({ task: w.task, since: w.since }))
  // Which branch the owner is on is looked at here, once per publish, not on every render.
  // (new tasks merge into it; a task that merges elsewhere shows "→ branch" in the list)
  const branch = S.gitState === 'ok' ? await homeBranch($) : ''
  const branch_note = gitNote(S.gitState)
  // The banner's facts ride along in the view (extra fields; SymccView itself is shared with other code).
  const can = await playable($)
  const v: PaneView = { tasks: b.tasks, working, scouts: [...scoutState.values()], mode: modeOf(b), test_commands: b.test_commands, branch, max_parallel: b.max_parallel, max_minutes: b.max_minutes, auto_retries: b.auto_retries, archive_days: b.archive_days, ...(b.archived ? { archived: b.archived } : {}), ...(b.archived_done?.length ? { archived_done: b.archived_done } : {}), open_on_start: openOnStart(b), notify: notifyOf(b, can), notify_choices: notifyChoices(can), enabled: symccOn(b), driving: S.driving, branch_note, git_state: S.gitState, plan_mode: inPlan(S.plan) }
  await updateView($, () => v)
  // the banner logo plays a move when something happened (a merge, a worker start, a scout finding, all done)
  void logoOnPublish($, v).catch(() => undefined)
  // the line above the prompt, with the workers and scouts (redrawn every minute while scouts are timed, see refreshStatus)
  const crew = { max_parallel: b.max_parallel, tasks: b.tasks, scouts: v.scouts }
  showStatus($, () => (symccOn(b) ? statusLine(b, S.driving, branch_note, modeOf(b), inPlan(S.plan), crew, Date.now(), statusRoom(S.N.name)) : offStatusLine(S.N.name)))
}

let statusText: (() => string | undefined) | undefined
/** Shows `text()` as the line above the prompt; refreshStatus draws it again later. */
function showStatus($: Host, text: () => string | undefined) {
  statusText = text
  $.ui.status(text())
}
/** Draws the line above the prompt again, so "next: x in 38m" counts down (scouts.ts calls it every minute). */
export function refreshStatus($: Host) {
  if (statusText) $.ui.status(statusText())
}
