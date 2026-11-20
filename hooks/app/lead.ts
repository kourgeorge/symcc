import { testMinutesOf, openQuestions, liveWorkersFor, whoDrives, drivesAfter, driveAsk, handRequest, noHandRequest, handedText, handedOff, HANDOVER_NOTE, putTask, leadText, resetDoing, find, parseLead, relabelSession, openOnStart, type Board, gitNote, modeOf, notifyOf, notifyChoices, symccOn, statusLine, statusRoom, offStatusLine, inPlan, liveDriver } from '../board'
import { homeBranch } from './git'
import { S, workers, queuedWorkers, type PaneView, scoutState, updateView } from './state'
import { type Host, agentState } from '../host'
import { path, locked, change, now, load, safeWrite, boardMtime } from './store'
import { openPane } from './open'
import { playable } from './voice'
import { logoIdle, logoOnPublish } from './logo'
import { waitEnded, ORPHAN_WAIT_MS, unclaimQueued, queuedNeverStarted, unclaimed } from './workers'
import { haltAll, haltWorkers } from './board-mode'
import { stopOrphans } from './cleanup'

// ---------------- who drives the board ----------------
// Only one session (the driver) starts workers, merges, runs scouts and the regular check.
// It keeps .<name>/lead.json fresh; the others read and change the board but start nothing.

export async function writeLead(host: Host, text: string) {
  await safeWrite(host, path(S.N.leadFile), text, S.N.leadFile)
}

/**
 * Looks at lead.json and acts on it: becomes the driver if nobody drives, refreshes the
 * heartbeat if this session drives, takes over if the driver's heartbeat went stale, and
 * steps down if another session drives. `fresh` = this copy of the plugin just loaded,
 * so any worker it had is gone. Returns whether this session drives now.
 */
export async function claimLead(host: Host, fresh = false): Promise<boolean> {
  const was = S.driving
  const [move, leadBefore] = await locked(host, async () => {
    const text = await host.fs.read(path(S.N.leadFile)).catch(() => null)
    const m = whoDrives(text, S.me, Date.now())
    if (drivesAfter(m)) await writeLead(host, leadText(S.me, Date.now()))
    return [m, text] as const
  })
  // the owner asked another session to drive (/<name>-drive): stop the workers here, then hand lead.json over
  if (move === 'handover') {
    await stepDown(host, leadBefore)
    return S.driving
  }
  S.driving = drivesAfter(move)
  if (S.driving && (!was || fresh)) {
    // Workers the old driver (or an earlier load of this plugin) left behind are stopped
    // first, and their tasks go back to "todo", so a task never has two workers.
    const orphans = await stopOrphans(host, leadBefore)
    if (orphans.length) host.ui.toast(S.N.toast(`stopped ${orphans.length} old worker${orphans.length > 1 ? 's' : ''} left behind`))
    // A stopped worker may still be running for a while: wait until it has really ended.
    // A task whose old worker is still alive after that stays "doing"; the regular check
    // sends it back to "todo" once that worker has ended, so a task never has two workers.
    const alive = await waitEnded(host, orphans, ORPHAN_WAIT_MS)
    const note = move === 'claim' ? HANDOVER_NOTE : move === 'takeover' ? 'restarted: the session driving the board stopped answering' : move === 'keep' ? 'restarted: the plugin reloaded and the old worker was gone' : `restarted after ${S.W.app} was reopened`
    // Only tasks of this session, of a session that no longer drives, or with no session
    // recorded go back: a task whose worker runs in the live driver keeps it.
    if (await host.fs.exists(path(S.N.boardFile)))
      await change(host, b => {
        const keep = b.tasks.filter(t => liveWorkersFor(t, alive.map(agentState), S.N.name).length > 0 || [...workers.values()].some(w => w.task === t.id) || queuedWorkers.has(t.id)).map(t => t.id)
        // T-428: a task whose worker was only queued when the plugin reloaded (the reload emptied the queue) never
        // started: its claim is undone with no try counted and no "restarted" line, and the next pump queues it again
        const unqueued = unclaimQueued(b, S.me, liveDriver(leadBefore, Date.now()), now(), keep)
        return resetDoing(unqueued, S.me, leadBefore, Date.now(), note, now(), keep)
      })
    if (move === 'takeover' && !fresh) host.ui.toast(S.N.toast('the session driving the board stopped answering; this session drives it now'))
    if (move === 'claim') host.ui.toast(S.N.toast('the other session handed the board over; this session drives it now'))
  }
  if (was && !S.driving) {
    // Another session took over (this one stopped answering for too long): its workers own the tasks now.
    await haltAll(host, 'another session drives the board now')
    host.ui.toast(S.N.toast('another session drives the board now; this one only shows and changes it'))
  }
  if (S.driving) {
    // A task stopped, dropped or changed from another session: stop its worker here.
    const b = await load(host)
    await haltWorkers(host, 'the task was changed on the board', w => find(b, w.task)?.status !== 'doing')
  }
  if (was !== S.driving || fresh) await publish(host, await load(host))
  else if (!S.driving) await followBoard(host)
  // the heartbeat (every 30 s) also looks whether the banner logo's idle sway is due
  void logoIdle(host).catch(() => undefined)
  return S.driving
}

/** Set while this session hands the board over, so a heartbeat meanwhile doesn't start a second hand-over. */
let handing = false

/**
 * The hand-over the owner asked for (/<name>-drive in another session, T-430), seen on this driver's heartbeat
 * (lead.json `leadBefore` names this session with `handTo`). This session stops driving first (S.driving false, so
 * nothing new starts), stops its workers and scouts (the same haltAll as when another session drives the board now),
 * puts their tasks back to "todo" without using up a try (see handedOff), waits a little for them to end, and only
 * then writes lead.json for the new session: so the board never has two drivers, and a task never two workers.
 */
async function stepDown(host: Host, leadBefore: string | null) {
  const to = parseLead(leadBefore)?.handTo
  if (handing || !to) return
  handing = true
  try {
    S.driving = false
    const agents = [...workers.keys()]
    await haltAll(host, 'the owner moved driving to another session', async w => {
      await change(host, x => {
        const cur = find(x, w.task)
        if (cur?.status !== 'doing') return x
        return putTask(x, queuedNeverStarted(cur) ? unclaimed(cur, now()) : handedOff(cur, now()))
      }).catch(() => undefined)
    })
    await waitEnded(host, agents, ORPHAN_WAIT_MS)
    await locked(host, async () => {
      const l = parseLead(await host.fs.read(path(S.N.leadFile)).catch(() => null))
      // still ours and still asked for by `to` (nobody took over meanwhile): hand it over
      if (l && l.session === S.me && l.handTo === to) await writeLead(host, handedText(to, S.me, Date.now()))
    })
    host.ui.toast(S.N.toast('another session drives the board now; this one only shows and changes it'))
    await publish(host, await load(host))
  } finally {
    handing = false
  }
}

/** A session id as said to the owner: its first 8 characters. */
const shortSession = (id: string) => id.slice(0, 8)

/**
 * /<name>-drive (T-430): makes this session drive the board. Already driving: nothing changes. Nobody drives, or the
 * driver is gone (stale heartbeat): it takes over now, as claimLead does. Another session drives: a hand-over request
 * goes into lead.json; that session hands over on its next heartbeat (see stepDown) and this one claims on its own
 * after that. Answers plainly what happened, with the workers that will be stopped and restarted.
 */
export async function driveHere(host: Host): Promise<string> {
  if (handing) return 'This session is handing the board over to another session right now; type it again in a minute.'
  const [ask, text] = await locked(host, async () => {
    const t = await host.fs.read(path(S.N.leadFile)).catch(() => null)
    const a = driveAsk(t, S.me, Date.now())
    if (a === 'ask' || a === 'asked') await writeLead(host, handRequest(t, S.me, Date.now()))
    if (a === 'cancel') await writeLead(host, noHandRequest(t)!)
    return [a, t] as const
  })
  if (ask === 'already') return 'This session already drives the board; nothing changed.'
  if (ask === 'cancel') return 'This session already drives the board; the hand-over another session asked for is cancelled.'
  if (ask === 'now') {
    const drives = await claimLead(host)
    return drives ? 'This session drives the board now.' : 'Another session took the board just now; type it again to ask it to hand over.'
  }
  const driver = parseLead(text)!.session
  const running = (await load(host).catch(() => null))?.tasks.filter(t => t.status === 'doing' && t.session === driver).map(t => t.id) ?? []
  const restart = running.length ? ` Its ${running.length} running ${running.length === 1 ? 'worker' : 'workers'} (${running.join(', ')}) ${running.length === 1 ? 'stops' : 'stop'} and ${running.length === 1 ? 'is' : 'are'} restarted here from the kept folder and branch; that doesn't use up a try.` : ''
  const head = ask === 'asked' ? `Already asked session ${shortSession(driver)} to hand over` : `Asked session ${shortSession(driver)} to hand over`
  return `${head}; it will within 30 s, and this session drives the board within 30 s after that.${restart} If it doesn't answer within a few minutes, this session takes over anyway.`
}

/**
 * A session that does not drive gets no "Board update" and runs no regular check, so on its heartbeat it looks
 * whether board.json changed (its mtime differs from the one last seen) and, if so, loads it and redraws the panel
 * and status line (T-429). A missing or unreadable (or broken) file does nothing: the heartbeat goes on.
 */
async function followBoard(host: Host) {
  const m = await boardMtime(host).catch(() => null)
  if (m === null || m === S.boardMtime) return
  S.boardMtime = m
  const b = await load(host).catch(() => null)
  if (b) await publish(host, b).catch(() => undefined)
}

/** On session end the driver lets go of lead.json, so another session can take over at once. */
export async function releaseLead(host: Host) {
  const was = S.driving
  S.driving = false
  await locked(host, async () => {
    const file = path(S.N.leadFile)
    const text = await host.fs.read(file).catch(() => null)
    const l = parseLead(text)
    if (!l) return
    // the driver, or a session the board was just handed to (before its heartbeat claimed it): let go at once
    if (l.session === S.me && (was || l.handFrom)) await host.run(['rm', '-f', file])
    // a hand-over this session asked for (/<name>-drive) is dropped: the driver keeps driving
    else if (l.handTo === S.me) await writeLead(host, noHandRequest(text)!)
  }).catch(() => undefined)
}

/**
 * After /clear: this process goes on under a new session id. lead.json and this session's
 * "doing" tasks move to the new id (so our own live workers aren't taken for a dead
 * session's), and the board panel is shown again for the new session.
 */
export async function handOver(host: Host) {
  const old = S.me
  const fresh = await host.session.id().catch(() => old)
  if (fresh && fresh !== old) {
    S.me = fresh
    await locked(host, async () => {
      const l = parseLead(await host.fs.read(path(S.N.leadFile)).catch(() => null))
      if (S.driving) {
        if (!l || l.session === old) await writeLead(host, leadText(S.me, Date.now(), l?.handTo ? { handTo: l.handTo, ...(l.handAt !== undefined ? { handAt: l.handAt } : {}) } : {}))
        return
      }
      if (!l) return
      // a hand-over this session asked for (/<name>-drive) follows it to the new id, keeping its time
      if (l.handTo === old) await writeLead(host, leadText(l.session, l.heartbeat, { handTo: S.me, ...(l.handAt !== undefined ? { handAt: l.handAt } : {}) }))
      // the board was handed to this session and its heartbeat hasn't claimed it yet: the new id gets it
      else if (l.session === old && l.handFrom) await writeLead(host, handedText(S.me, l.handFrom, l.heartbeat))
    })
    if (await host.fs.exists(path(S.N.boardFile))) await change(host, b => relabelSession(b, old, S.me))
  }
  const b = await load(host)
  await publish(host, b)
  if (openOnStart(b)) await openPane(host, { focus: false, quiet: true })
}

export async function publish(host: Host, b: Board) {
  // the board drawn here is the one last loaded or saved, so its mtime now counts as seen (T-431)
  S.boardMtime = S.readMtime
  const working = [...workers.values()].map(w => ({ task: w.task, since: w.since }))
  // Which branch the owner is on is looked at here, once per publish, not on every render.
  // (new tasks merge into it; a task that merges elsewhere shows "→ branch" in the list)
  const branch = S.gitState === 'ok' ? await homeBranch(host) : ''
  const branch_note = gitNote(S.gitState)
  // The banner's facts ride along in the view (extra fields; SymccView itself is shared with other code).
  const can = await playable(host)
  const v: PaneView = { tasks: b.tasks, working, scouts: [...scoutState.values()], mode: modeOf(b), test_commands: b.test_commands, branch, max_parallel: b.max_parallel, max_minutes: b.max_minutes, auto_retries: b.auto_retries, test_minutes: testMinutesOf(b), archive_days: b.archive_days, ...(b.archived ? { archived: b.archived } : {}), ...(b.archived_done?.length ? { archived_done: b.archived_done } : {}), open_on_start: openOnStart(b), notify: notifyOf(b, can), scout_findings: b.scout_findings, tests_with_changes: b.tests_with_changes, checker: b.checker, notify_choices: notifyChoices(can), enabled: symccOn(b), driving: S.driving, branch_note, git_state: S.gitState, plan_mode: inPlan(S.plan), ...(openQuestions(b).length ? { questions: openQuestions(b) } : {}) }
  await updateView(host, () => v)
  // the banner logo plays a move when something happened (a merge, a worker start, a scout finding, all done)
  void logoOnPublish(host, v).catch(() => undefined)
  // the line above the prompt, with the workers and scouts (redrawn every minute while scouts are timed, see refreshStatus).
  // Disabled: "disabled · /symcc-enable to turn it back on" without the name, as Claude Code puts "⚠ symcc: " in front; its status line
  // takes plain text only (no colors), so the command can't stand out there.
  const crew = { max_parallel: b.max_parallel, tasks: b.tasks, scouts: v.scouts }
  showStatus(host, () => (symccOn(b) ? statusLine(b, S.driving, branch_note, modeOf(b), inPlan(S.plan), crew, Date.now(), statusRoom(S.N.name)) : offStatusLine(S.N.name, false)))
}

let statusText: (() => string | undefined) | undefined
/** Shows `text()` as the line above the prompt; refreshStatus draws it again later. A host with no band (features.band off) shows it nowhere. */
function showStatus(host: Host, text: () => string | undefined) {
  statusText = text
  if (host.features.band) host.ui.status(text())
}
/** Draws the line above the prompt again, so "next: x in 38m" counts down (scouts.ts calls it every minute). */
export function refreshStatus(host: Host) {
  if (statusText && host.features.band) host.ui.status(statusText())
}
