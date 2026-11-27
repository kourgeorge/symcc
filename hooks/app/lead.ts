import { settingShown, testMinutesOf, openQuestions, liveWorkersFor, whoDrives, drivesAfter, driveAsk, handRequest, noHandRequest, handedText, handedOff, HANDOVER_NOTE, putTask, leadText, beatText, driverTimes, carriedText, resetDoing, find, parseLead, relabelSession, openOnStart, type Board, gitNote, modeOf, notifyOf, notifyChoices, symccOn, statusLine, statusRoom, offHereAnswer, modeText, offStatusLine, driveNoticeParts, inPlan, liveDriver, backToTodo, restartsOf, type TodayTeam, dayOf, localOffset, tokenCount, safeScoutFile, parseScoutRuns, scoutRunsFile } from '../board'
import { homeBranch, noProjectText, openProjects, projectNotes, projectPath } from './git'
import { S, onHere, workers, queuedWorkers, scoutRuns, type PaneView, scoutState, updateView, fitView, sizeNotes, MOVED_WHY, TAKEN_WHY } from './state'
import { type Host, agentState } from '../host'
import { timed } from './slow-log'
import { path, locked, change, now, load, safeWrite, boardMtime } from './store'
import { openPane } from './open'
import { playable } from './voice'
import { logoIdle, logoOnPublish } from './logo'
import { pump, waitEnded, ORPHAN_WAIT_MS, unclaimQueued, queuedNeverStarted, unclaimed } from './workers'
import { haltAll, haltWorkers, dropLeadUpdates, setSymcc } from './board-mode'
import { stopOrphans } from './cleanup'
import { branchFacts, taskBranchesView } from './branches'
import type { StatusView } from '../core/live-text'
import { type DriverFacts, driverFacts, noticeText } from '../core/driver-notice'

// ---------------- who drives the board ----------------
// Only one session (the driver) starts workers, merges, runs scouts and the regular check.
// It keeps .<name>/lead.json fresh; the others read and change the board but start nothing.

export async function writeLead(host: Host, text: string) {
  await safeWrite(host, path(S.N.leadFile), text, S.N.leadFile)
}

/** lead.json's text, or null when it can't be read (no file yet). */
export const readLeadText = (host: Host): Promise<string | null> => host.fs.read(path(S.N.leadFile)).catch(() => null)
/** lead.json read and parsed (parseLead), null when it is missing or broken. */
export const readLead = async (host: Host) => parseLead(await readLeadText(host))

/**
 * Looks at lead.json and acts on it: becomes the driver if nobody drives, refreshes the
 * heartbeat if this session drives, takes over if the driver's heartbeat went stale, and
 * steps down if another session drives. `fresh` = this copy of the plugin just loaded,
 * so any worker it had is gone. Returns whether this session drives now.
 */
/** T-984: while this window still holds a made-up session id (the host could not answer at start), ask again; swap in the real one. */
async function refreshMe(host: Host) {
  // T-1016: also when the same window got a new id (e.g. after a summary): it keeps driving under the new id
  const id = await host.session.id().catch(() => '')
  if (!id || id === S.me) return
  // a real id that changed: only the window that holds lead.json is the same window (others just have another id)
  if (!S.me.startsWith('session-') && !(S.driving && !S.fresh && (await readLead(host))?.session === S.me)) return
  const old = S.me
  S.me = id
  if (!S.driving || S.fresh) return
  // driving under the made-up id: lead.json and the doing tasks move to the real id (as handOver does after /clear)
  await locked(host, async () => {
    const l = await readLead(host)
    if (!l || l.session === old) await writeLead(host, carriedText(l, S.me, Date.now()))
  })
  if (await host.fs.exists(path(S.N.boardFile))) await change(host, b => relabelSession(b, old, S.me))
}

/** T-1016: session start ran again in the window that drove under `old`, and it has a new id: lead.json moves to the new id (same window). Returns whether it moved. */
export async function carryDriver(host: Host, old: string): Promise<boolean> {
  if (!old || old === S.me) return false
  let moved = false
  await locked(host, async () => {
    const l = await readLead(host)
    if (l && l.session === old) {
      await writeLead(host, carriedText(l, S.me, Date.now()))
      moved = true
    }
  })
  if (moved && (await host.fs.exists(path(S.N.boardFile)))) await change(host, b => relabelSession(b, old, S.me)).catch(() => undefined)
  return moved
}

export function claimLead(host: Host, fresh = false): Promise<boolean> {
  return timed(host, 'claimLead', () => claimLeadNow(host, fresh))
}

async function claimLeadNow(host: Host, fresh: boolean): Promise<boolean> {
  await refreshMe(host)
  // T-793: a window turned off here never drives (nor takes driving back)
  if (S.offHere || S.fresh) {
    S.driving = false
    return false
  }
  const was = S.driving
  const [move, leadBefore] = await locked(host, async () => {
    const text = await readLeadText(host)
    const m = whoDrives(text, S.me, Date.now())
    // T-952: the heartbeat keeps `since` (when this window claimed the board) and saves `active` (its owner's last prompt or turn end)
    if (drivesAfter(m)) await writeLead(host, beatText(text, S.me, Date.now(), S.activeAt))
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
    await haltAll(host, TAKEN_WHY)
    host.ui.toast(S.N.toast('another session drives the board now; this one only shows and changes it'))
  }
  if (S.driving) {
    // A task stopped, dropped or changed from another session: stop its worker here.
    const b = await load(host)
    await haltWorkers(host, 'the task was changed on the board', w => find(b, w.task)?.status !== 'doing')
  }
  if (!S.driving) seeDriver(leadBefore)
  else S.driver = undefined
  if (was !== S.driving || fresh) await publish(host, await load(host))
  else if (!S.driving) {
    await followBoard(host)
    await showDriver(host)
  }
  // the heartbeat (every 30 s) also looks whether the banner logo's idle sway is due
  void logoIdle(host).catch(() => undefined)
  return S.driving
}

/** Set while this session hands the board over, so a heartbeat meanwhile doesn't start a second hand-over. */
let handing = false

/**
 * T-759: whether lead.json says another session drives the board, or that this one is handing it to another session.
 * Read from the file itself, not from S.driving, so a copy of the plugin whose S.driving is out of date (its heartbeat
 * hasn't run yet, or an older copy still running in this session) sees it too. No (or a broken) lead.json: false.
 */
export async function drivenElsewhere(host: Host): Promise<boolean> {
  const l = await readLead(host)
  if (!l) return false
  return l.session !== S.me || (!!l.handTo && l.handTo !== S.me)
}

/**
 * T-759: whether this session may start a scout or a worker now: it drives the board (S.driving), it isn't handing the
 * board over, and lead.json doesn't say driving moved to another session (see drivenElsewhere). Asked right before
 * each start, so a run is never started by a session that no longer drives.
 */
export async function drivesHere(host: Host): Promise<boolean> {
  if (!S.driving || handing) return false
  return !(await drivenElsewhere(host))
}

/** Stops driving: no new start, workers and scouts stopped, their tasks back to "todo" without using up a try (see handedOff), and waits for them to end. */
async function stopDriving(host: Host) {
  S.driving = false
  const agents = [...workers.keys()]
  await haltAll(host, MOVED_WHY, async w => {
    await change(host, x => {
      const cur = find(x, w.task)
      if (cur?.status !== 'doing') return x
      // T-743: a try that already went on after a restart symcc did itself is not taken off (that would lose its
      // earlier part): it ends as restarted, and the next worker goes on with it again
      const goneOn = restartsOf(cur.runs?.at(-1)).length > 0
      return putTask(x, queuedNeverStarted(cur) ? unclaimed(cur, now()) : goneOn ? backToTodo(cur, HANDOVER_NOTE, now()) : handedOff(cur, now()))
    }).catch(() => undefined)
  })
  await waitEnded(host, agents, ORPHAN_WAIT_MS)
}

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
    await stopDriving(host)
    await locked(host, async () => {
      const l = await readLead(host)
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
  if (S.offHere) return offHereAnswer(S.N.name)
  if (handing) return 'This session is handing the board over to another session right now; type it again in a minute.'
  const [ask, text] = await locked(host, async () => {
    const t = await readLeadText(host)
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
  const running = (await load(host).catch(() => null))?.tasks.filter(t => t.status === 'doing' && t.live?.session === driver).map(t => t.id) ?? []
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

// ---------------- one window off (T-793) ----------------
// /<name>-disable here turns symcc off in this window only: S.offHere (never saved). Such a window never drives; it
// hands driving over (another window claims lead.json on its heartbeat) and, with no other window left, waits.

/** At session start: this window starts on. When another window with symcc on is live (a fresh heartbeat in lead.json), it follows: a lead that does not drive (claimLead leaves driving to the other window). */
export async function startHere(host: Host) {
  S.offHere = false
  // T-984: the session id as the host says it now; a window that started with a made-up id (the host could not answer
  // yet) must still know itself in lead.json, or it would take its own fresh heartbeat for another window's
  const id = await host.session.id().catch(() => '')
  if (id) S.me = id
  const b = await load(host).catch(() => null)
  if (!b || b.enabled === false) return
  const text = await readLeadText(host)
  const live = liveDriver(text, Date.now())
  if (!live || live === S.me || parseLead(text)?.session === S.me) return
  seeDriver(text)
  host.ui.toast(S.N.toast(noticeText(driveNoticeParts([], Date.now(), S.N.name, Infinity, S.driver))))
}

/** /<name>-disable here: this window works as plain ${S.W.app}; if it drove the board it hands driving over. Answers what happened. */
export async function disableHere(host: Host): Promise<string> {
  if (S.offHere) return `${S.N.name} is already off in this window. /${S.N.name}-enable turns it back on.`
  S.offHere = true
  S.enabledNow = false
  dropLeadUpdates()
  const drove = S.driving
  if (drove) {
    handing = true
    try {
      await stopDriving(host)
      await locked(host, async () => {
        const l = await readLead(host)
        if (l && l.session === S.me) await host.run(['rm', '-f', path(S.N.leadFile)])
      })
    } finally {
      handing = false
    }
  } else {
    // a hand-over this window asked for earlier (/drive) or was given (handFrom) must not land on an off-here window
    await locked(host, async () => {
      const text = await readLeadText(host)
      const l = parseLead(text)
      if (!l) return
      if (l.session === S.me && l.handFrom) await host.run(['rm', '-f', path(S.N.leadFile)])
      else if (l.handTo === S.me) await writeLead(host, noHandRequest(text)!)
    }).catch(() => undefined)
  }
  await publish(host, await load(host)).catch(() => undefined)
  return `${S.N.name} is now off in this window: ${S.W.assistant} works as normal here from your next message. Other windows are not changed.${drove ? ' This window handed driving over; another window takes over within 30 s (if none is open, work waits until one is).' : ''} Turn it back on with /${S.N.name}-enable.`
}

/** T-875: the answer of /<name>-enable once it turned something on: what it did, the mode, and how to start work when paused. */
const onHereText = (b: Board) => {
  const m = modeOf(b)
  const paused = m === 'paused' ? ` No work starts while the board is paused; /${S.N.name}-mode auto (or review) starts it.` : ''
  return `${S.N.name} is on in this window, in mode ${settingShown('mode', m)}: ${modeText(m)}.${paused}`
}

/**
 * /<name>-enable (T-875: "here" is the same): symcc on, in this window. It turns the project on if it was disabled and this
 * window on if it was off here; this window is then a lead and may drive again by the normal rules. "already enabled"
 * only when both were on already.
 */
export async function enableHere(host: Host, tell: (text: string) => void): Promise<string> {
  let b = await load(host)
  if (b.enabled !== false && !S.offHere) return setSymcc(host, true)
  if (b.enabled === false) {
    // with S.offHere still set, setSymcc neither tells the lead nor opens the panel; the steps below do that once
    await setSymcc(host, true)
    b = await load(host)
    if (!S.offHere) return onHereText(b)
  }
  S.offHere = false
  S.enabledNow = true
  await publish(host, b)
  if (openOnStart(b)) await openPane(host, { tab: 'live', focus: false, quiet: true }).catch(() => undefined)
  await claimLead(host).catch(() => false)
  void pump(host)
  tell(`The owner turned ${S.N.name} on in this window with /${S.N.name}-enable. You are a lead again; the board is in mode ${modeOf(b)}.`)
  return onHereText(b)
}

/** The heartbeat of a window off here: it drives nothing and only keeps the driver notice fresh. */
export async function offHereBeat(host: Host) {
  await refreshMe(host)
  // a hand-over that landed on this window (it asked with /drive before turning off): give the board straight back
  await locked(host, async () => {
    const l = await readLead(host)
    if (l && l.session === S.me && l.handFrom) await host.run(['rm', '-f', path(S.N.leadFile)])
  }).catch(() => undefined)
  // a window turned off on purpose stays off, whatever other windows do, until /<name>-enable: it only keeps the driver notice fresh
  seeDriver(await readLeadText(host))
  await showDriver(host)
  await followBoard(host)
}

/** On session end the driver lets go of lead.json, so another session can take over at once. */
export async function releaseLead(host: Host) {
  if (S.fresh) return // T-795: a new project has no lead.json and gets none
  const was = S.driving
  S.driving = false
  await locked(host, async () => {
    const text = await readLeadText(host)
    const l = parseLead(text)
    if (!l) return
    // the driver, or a session the board was just handed to (before its heartbeat claimed it): let go at once
    if (l.session === S.me && (was || l.handFrom)) await host.run(['rm', '-f', path(S.N.leadFile)])
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
  if (S.fresh) {
    if (fresh) S.me = fresh
    return // T-795: a new project: nothing to hand over, nothing to publish or open
  }
  if (fresh && fresh !== old) {
    S.me = fresh
    await locked(host, async () => {
      const l = await readLead(host)
      if (S.driving) {
        if (!l || l.session === old) await writeLead(host, carriedText(l, S.me, Date.now()))
        return
      }
      if (!l) return
      // a hand-over this session asked for (/<name>-drive) follows it to the new id, keeping its time
      if (l.handTo === old) await writeLead(host, leadText(l.session, l.heartbeat, { ...driverTimes(l), handTo: S.me, ...(l.handAt !== undefined ? { handAt: l.handAt } : {}) }))
      // the board was handed to this session and its heartbeat hasn't claimed it yet: the new id gets it
      else if (l.session === old && l.handFrom) await writeLead(host, handedText(S.me, l.handFrom, l.heartbeat))
    })
    if (await host.fs.exists(path(S.N.boardFile))) await change(host, b => relabelSession(b, old, S.me))
  }
  const b = await load(host)
  await publish(host, b)
  if (onHere(b) && openOnStart(b)) await openPane(host, { tab: 'live', focus: false, quiet: true })
}

// ---------------- T-769: ▍Today's lead, scout and cost figures ----------------
// The Live tab's ▍Today shows who spent today's tokens (the lead and the scouts too) and the session's cost. Those are
// not on the board: the lead's are read from the host's logs (host.lead.usage, slow on a big log), the scouts' from
// their runs files, the cost from host.session.usage. They are read in the background at most every TEAM_CACHE_MS,
// never waited for by publish(), and put into the view when read (as the Branches figures are).

/** How long a read of ▍Today's team figures is used before it is read again. */
export const TEAM_CACHE_MS = 2 * 60_000
const teamCache: { day: string; readAt: number; running: boolean; value: TodayTeam | undefined } = { day: '', readAt: 0, running: false, value: undefined }

/** The ▍Today team figures for the owner's day at `nowMs`, as last read (undefined until read, or none); starts a new read in the background when stale. */
export function todayTeam(host: Host, scouts: readonly string[], nowMs = Date.now()): { team: TodayTeam | undefined; done?: Promise<void> } {
  const day = dayOf(nowMs, localOffset(nowMs))
  const cur = teamCache.value?.day === day ? teamCache.value : undefined
  if (teamCache.running || (teamCache.day === day && nowMs - teamCache.readAt < TEAM_CACHE_MS)) return { team: cur }
  teamCache.running = true
  const done = readTodayTeam(host, scouts, nowMs)
    .then(async team => {
      const had = teamCache.value !== undefined
      teamCache.value = team
      teamCache.day = day
      teamCache.readAt = nowMs
      if (team || had)
        await updateView(host, v => {
          const { today_team: _old, ...rest } = v as PaneView
          return (team ? { ...rest, today_team: team } : rest) as typeof v
        })
    })
    .catch(() => undefined)
    .finally(() => {
      teamCache.running = false
    })
  return { team: cur, done }
}

/** Forgets the last read (the tests start each one fresh). */
export function resetTodayTeam() {
  Object.assign(teamCache, { day: '', readAt: 0, running: false, value: undefined })
}

/** Reads ▍Today's team figures now: the lead's tokens today (when the host can tell them), the scouts' runs that ended today, the session's cost. */
export async function readTodayTeam(host: Host, scouts: readonly string[], nowMs: number): Promise<TodayTeam | undefined> {
  const off = localOffset(nowMs)
  const day = dayOf(nowMs, off)
  const dayStart = nowMs - (((nowMs + off * 60_000) % 86_400_000) + 86_400_000) % 86_400_000
  const hours = Array.from({ length: 24 }, () => 0)
  const at = (ms: number, n: number) => {
    const h = Math.floor((ms - dayStart) / 3_600_000)
    if (h >= 0 && h < 24 && n > 0) hours[h]! += n
  }
  const out: TodayTeam = { day }
  if (host.features.leadUsage) {
    const u = await host.lead.usage(S.root, { kind: 'days', days: 1 }, nowMs).catch(() => null)
    if (u && Array.isArray(u.lead)) {
      let lead = 0
      for (const c of u.lead)
        if (dayOf(c.atMs, off) === day) {
          const n = tokenCount(c.tokens)
          lead += n
          at(c.atMs, n)
        }
      out.lead = lead
    }
  }
  let scoutTok = 0
  let scoutMs = 0
  for (const s of new Set(scouts)) {
    if (safeScoutFile(s, S.N.name) === null) continue
    const runs = parseScoutRuns(await host.fs.read(path(scoutRunsFile(s, S.N.name))).catch(() => null))
    for (const r of runs) {
      const end = Date.parse(r.ended)
      if (!Number.isFinite(end) || dayOf(end, off) !== day) continue
      const start = Date.parse(r.started ?? '')
      if (Number.isFinite(start) && end > start) scoutMs += end - Math.max(start, dayStart)
      if (r.tokens) {
        const n = tokenCount(r.tokens)
        scoutTok += n
        at(end, n)
      }
    }
  }
  if (scoutTok) out.scouts = scoutTok
  if (scoutMs) out.scout_ms = scoutMs
  const usd = (await host.session.usage().catch(() => null))?.cost?.usd
  if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) out.usd = usd
  if (hours.some(n => n > 0)) out.hours = hours
  return out.lead === undefined && out.scouts === undefined && out.scout_ms === undefined && out.usd === undefined ? undefined : out
}

/**
 * T-1154: the branch line: the board repo's branch, then "project: branch" for each project that has open tasks and a
 * repo that is ready ("main · client: dev"). Without projects it is the board repo's branch alone, as before.
 */
async function branchLine(host: Host, b: Board, own: string): Promise<string> {
  const parts = own ? [own] : []
  for (const p of openProjects(b)) {
    const repo = projectPath(p)
    if (!repo) continue
    if (S.repoGit.get(repo) && S.repoGit.get(repo) !== 'ok') continue
    const br = await homeBranch(host, repo).catch(() => '')
    if (br) parts.push(`${p}: ${br}`)
  }
  return parts.join(' · ')
}

export function publish(host: Host, b: Board) {
  return timed(host, 'publish', () => publishView(host, b))
}

async function publishView(host: Host, b: Board) {
  // the board drawn here is the one last loaded or saved, so its mtime now counts as seen (T-431)
  S.boardMtime = S.readMtime
  const working = [...workers.values()].map(w => ({ task: w.task, since: w.since }))
  // Which branch the owner is on is looked at here, once per publish, not on every render.
  // (new tasks merge into it; a task that merges elsewhere shows "→ branch" in the list)
  const own = S.gitState === 'ok' && S.gitRoot === 'ok' ? await homeBranch(host) : ''
  const branch = await branchLine(host, b, own)
  // T-675: a data file close to the 4 MB read limit is warned about where the git warning goes (banner and status line)
  const size_note = [...sizeNotes.values()].join('; ')
  const projectNote = projectNotes(openProjects(b)) // T-1154: a project whose repo is not ready holds back only its own tasks
  const branch_note = [gitNote(S.gitState), projectNote, noProjectText(b), size_note].filter(Boolean).join('; ')
  // The banner's facts ride along in the view (extra fields; SymccView itself is shared with other code).
  const can = await playable(host)
  // T-727: the Live tab's Branches figures: the last ones read (a stale read starts in the background, never waited for here)
  const branches = branchFacts(host, b, own || 'main').facts
  // T-769: ▍Today's lead, scout and cost figures, the last ones read (a stale read starts in the background);
  // read on every host, not only those with a panel: OpenCode draws ▍Today from the published view.json
  const team = todayTeam(host, [...scoutState.keys()]).team
  // T-761: each task page's Branch section, read the same way (OpenCode's panel draws only what the view holds)
  const task_branches = taskBranchesView(host, b).facts
  const v: PaneView = { tasks: b.tasks, working, scouts: [...scoutState.values()].map(s => (s.running && [...scoutRuns.values()].includes(s.name) ? { ...s, started: true } : s)), mode: modeOf(b), test_commands: b.test_commands, ...(b.projects && Object.keys(b.projects).length ? { projects: b.projects } : {}), ...(b.docs_test_commands?.length ? { docs_test_commands: b.docs_test_commands } : {}), home_branch: own, ...(branch !== own ? { branch_line: branch } : {}), max_parallel: b.max_parallel, max_minutes: b.max_minutes, auto_retries: b.auto_retries, test_minutes: testMinutesOf(b), archive_days: b.archive_days, ...(b.archived ? { archived: b.archived } : {}), ...(b.archived_done?.length ? { archived_done: b.archived_done } : {}), open_on_start: openOnStart(b), notify_now: notifyOf(b, can), scout_findings: b.scout_findings, tests_with_changes: b.tests_with_changes, checker: b.checker, notify_choices: notifyChoices(can), on_here: onHere(b), ...(!S.driving && S.driver ? { driver: S.driver } : {}), ...(S.offHere ? { off_here: 'off' as const } : S.fresh ? { off_here: 'new' as const } : {}), driving: S.driving, branch_note, ...(size_note ? { size_note } : {}), git_state: S.gitState, ...(S.gitInstall ? { git_install: S.gitInstall } : {}), plan_mode: inPlan(S.plan), ...(branches ? { branches } : {}), ...(team ? { today_team: team } : {}), ...(Object.keys(task_branches).length ? { task_branches } : {}), ...(openQuestions(b).length ? { questions: openQuestions(b) } : {}) }
  // T-891: the view as it is stored (trimmed by slimView), worked out once here and written as it is: the owner is
  // told when trimming had to leave tasks out of the panel
  const fit = fitView(host, v)
  if (fit.note) sizeNotes.set('the board view', fit.note)
  else sizeNotes.delete('the board view')
  // the view's own size note may have just changed: show it now, not at the next publish
  const size_now = [...sizeNotes.values()].join('; ')
  if (size_now !== size_note) {
    for (const x of new Set([v, fit.view as PaneView])) {
      x.branch_note = [gitNote(S.gitState), projectNote, noProjectText(b), size_now].filter(Boolean).join('; ')
      if (size_now) x.size_note = size_now
      else delete x.size_note
    }
  }
  await updateView(host, () => fit.view, fit.fitted)
  shownDriver = v.driver
  // the banner logo plays a move when something happened (a merge, a worker start, a scout finding, all done)
  void logoOnPublish(host, v).catch(() => undefined)
  // the status line under the prompt: the board's facts (mode, who drives, branch, next scout, today's merged and cost),
  // no task counts (the band above the prompt shows the work, T-748); redrawn every minute while scouts are timed, see refreshStatus.
  // Disabled: "disabled · /symcc-enable to turn it back on" without the name, as Claude Code puts "symcc: " in front; its status line
  // takes plain text only (no colors), so the command can't stand out there.
  const facts = { tasks: b.tasks, questions: b.questions, scouts: v.scouts, home_branch: branch, branch_note, mode: modeOf(b) }
  showStatus(host, () => (onHere(b) ? statusLine(facts, S.driving, { plan: inPlan(S.plan), nowMs: Date.now(), width: statusRoom(S.N.name), ...(!S.driving && S.driver ? { driver: S.driver } : {}) }) : offStatusLine(S.N.name, false, S.offHere ? 'off' : S.fresh ? 'new' : false)))
}

/** T-902: what /<name>-status draws for board `b`: the Live tab's fields of the view publish() writes, from the same
 *  sources (the branch and ▍Today team figures as last read; a stale read starts in the background, never waited for). */
export async function statusView(host: Host, b: Board): Promise<StatusView> {
  const own = S.gitState === 'ok' && S.gitRoot === 'ok' ? await homeBranch(host) : ''
  const branches = branchFacts(host, b, own || 'main').facts
  const team = todayTeam(host, [...scoutState.keys()]).team
  const scouts = [...scoutState.values()].map(s => (s.running && [...scoutRuns.values()].includes(s.name) ? { ...s, started: true } : s))
  const questions = openQuestions(b)
  return { tasks: b.tasks, scouts, mode: modeOf(b), max_parallel: b.max_parallel, max_minutes: b.max_minutes, auto_retries: b.auto_retries, checker: b.checker, ...(b.archived_done?.length ? { archived_done: b.archived_done } : {}), ...(branches ? { branches } : {}), ...(team ? { today_team: team } : {}), ...(questions.length ? { questions } : {}) }
}

let statusText: (() => string | undefined) | undefined
/** Shows `text()` as the line above the prompt; refreshStatus draws it again later. A host with no band (features.band off) shows it nowhere. */
function showStatus(host: Host, text: () => string | undefined) {
  statusText = text
  if (host.features.band) host.ui.status(text())
}
// ---------------- the driving window, as other windows show it (T-952) ----------------

/** S.driver from lead.json `text`: the driving window's facts (heartbeat, since, active), undefined when this window drives or nobody does. */
function seeDriver(text: string | null) {
  const l = parseLead(text)
  S.driver = l && l.session !== S.me && !S.driving ? driverFacts(l) : undefined
}

/** The driver facts in the view as last written (publish or showDriver). */
let shownDriver: DriverFacts | undefined
/** With no `active` saved, the view's heartbeat is written again once it is this much older than lead.json's, so "checked in … ago" stays near the truth. */
const BEAT_SHOWN_MS = 60_000

/** On a heartbeat of a window that doesn't drive: the status line is drawn again (its "active … ago" counts on), and the
 *  view's driver facts are written again when they changed (a new driver, a new `active`, or an old heartbeat age). */
async function showDriver(host: Host) {
  refreshStatus(host)
  const d = S.driver
  const old = shownDriver
  const same = d?.since === old?.since && d?.active === old?.active && (d?.active !== undefined || !d || !old || d.heartbeat - old.heartbeat < BEAT_SHOWN_MS)
  if (same && !!d === !!old) return
  shownDriver = d
  await updateView(host, v => {
    const { driver: _, ...rest } = v as PaneView
    return (d ? { ...rest, driver: d } : rest) as typeof v
  })
}

/** Draws the line above the prompt again, so "next: x in 38m" counts down (scouts.ts calls it every minute). */
export function refreshStatus(host: Host) {
  if (statusText && host.features.band) host.ui.status(statusText())
}
