import { settingShown, testMinutesOf, openQuestions, liveWorkersFor, whoDrives, drivesAfter, driveAsk, handRequest, noHandRequest, handedText, handedOff, HANDOVER_NOTE, putTask, leadText, resetDoing, find, parseLead, relabelSession, openOnStart, type Board, gitNote, modeOf, notifyOf, notifyChoices, symccOn, statusLine, statusRoom, offHereAnswer, modeText, offStatusLine, inPlan, liveDriver, backToTodo, restartsOf, type TodayTeam, dayOf, localOffset, tokenCount, safeScoutFile, parseScoutRuns, scoutRunsFile } from '../board'
import { homeBranch } from './git'
import { S, onHere, workers, queuedWorkers, scoutRuns, type PaneView, scoutState, updateView, fitView, sizeNotes, MOVED_WHY, TAKEN_WHY } from './state'
import { type Host, agentState } from '../host'
import { path, locked, change, now, load, safeWrite, boardMtime } from './store'
import { openPane } from './open'
import { playable, sayGone } from './voice'
import { logoIdle, logoOnPublish } from './logo'
import { pump, waitEnded, ORPHAN_WAIT_MS, unclaimQueued, queuedNeverStarted, unclaimed } from './workers'
import { haltAll, haltWorkers, dropLeadUpdates, setSymcc } from './board-mode'
import { stopOrphans } from './cleanup'
import { branchFacts, taskBranchesView } from './branches'
import type { StatusView } from '../core/live-text'

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
export async function claimLead(host: Host, fresh = false): Promise<boolean> {
  // T-793: a window turned off here never drives (nor takes driving back)
  if (S.offHere || S.fresh) {
    S.driving = false
    return false
  }
  const was = S.driving
  const [move, leadBefore] = await locked(host, async () => {
    const text = await readLeadText(host)
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
    await haltAll(host, TAKEN_WHY)
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

/** The text of the take-over notice (a window off here tells it once when the window with symcc on is gone). */
const takeoverText = () => `the ${S.N.name} window closed · /${S.N.name}-enable to take over`

/** At session start: when another window with symcc on is live (a fresh heartbeat in lead.json), this window starts off here. */
export async function startOffHere(host: Host) {
  S.offHere = false
  S.sawOther = false
  S.takeoverTold = false
  S.missingSince = null
  const b = await load(host).catch(() => null)
  if (!b || b.enabled === false) return
  const live = liveDriver(await readLeadText(host), Date.now())
  if (!live || live === S.me) return
  S.offHere = true
  S.offWhy = 'other'
  S.enabledNow = false
  S.sawOther = true
  host.ui.toast(S.N.toast(`${S.N.name} runs in another window · /${S.N.name}-enable to use it here too`))
}

/** /<name>-disable here: this window works as plain ${S.W.app}; if it drove the board it hands driving over. Answers what happened. */
export async function disableHere(host: Host): Promise<string> {
  if (S.offHere) return `${S.N.name} is already off in this window. /${S.N.name}-enable turns it back on.`
  S.offHere = true
  S.offWhy = 'off'
  S.enabledNow = false
  S.sawOther = false
  S.takeoverTold = false
  S.missingSince = null
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
  S.sawOther = false
  S.takeoverTold = false
  S.missingSince = null
  await publish(host, b)
  if (openOnStart(b)) await openPane(host, { tab: 'live', focus: false, quiet: true }).catch(() => undefined)
  await claimLead(host).catch(() => false)
  void pump(host)
  tell(`The owner turned ${S.N.name} on in this window with /${S.N.name}-enable. You are a lead again; the board is in mode ${modeOf(b)}.`)
  return onHereText(b)
}

/** T-793: how long after the take-over line first showed, with nobody taking over, the "needs you" reminder plays (once). */
export const GONE_REMIND_MS = 15 * 60_000

/** The shared note for one gone episode: when the take-over line first showed and which window played the reminder. */
const goneFile = () => path(`${S.N.dir}/gone.json`)

/** Under the board lock: starts the note, drops it when a window is live, and says whether this window plays the reminder now. */
async function goneReminder(host: Host, live: boolean, nowMs: number): Promise<boolean> {
  return locked(host, async () => {
    const raw = await host.fs.read(goneFile()).catch(() => null)
    let g: { since?: number; played?: string } | null = null
    try { g = raw ? JSON.parse(raw) : null } catch { g = null }
    if (live) {
      if (g) await host.run(['rm', '-f', goneFile()])
      return false
    }
    if (!g || typeof g.since !== 'number') {
      await safeWrite(host, goneFile(), JSON.stringify({ since: nowMs }), `${S.N.dir}/gone.json`)
      return false
    }
    if (g.played || nowMs - g.since < GONE_REMIND_MS) return false
    await safeWrite(host, goneFile(), JSON.stringify({ since: g.since, played: S.me }), `${S.N.dir}/gone.json`)
    return true
  }).catch(() => false)
}

/** T-793: how long lead.json may be missing or stale before the take-over line shows (one heartbeat plus a margin), so a second on-window can claim it. */
export const GONE_GRACE_MS = 90_000

/** The heartbeat of a window off here: it drives nothing; it looks whether the window with symcc on is gone and tells the owner once. */
export async function offHereBeat(host: Host, nowMs = Date.now()) {
  // a hand-over that landed on this window (it asked with /drive before turning off): give the board straight back
  await locked(host, async () => {
    const l = await readLead(host)
    if (l && l.session === S.me && l.handFrom) await host.run(['rm', '-f', path(S.N.leadFile)])
  }).catch(() => undefined)
  const live = liveDriver(await readLeadText(host), nowMs)
  const was = S.offWhy
  if (live && live !== S.me) {
    S.sawOther = true
    S.takeoverTold = false
    S.missingSince = null
    if (S.offWhy === 'gone') S.offWhy = 'other'
  } else if (S.sawOther && !S.takeoverTold && (S.missingSince ??= nowMs, nowMs - S.missingSince >= GONE_GRACE_MS)) {
    S.takeoverTold = true
    S.offWhy = 'gone'
    host.ui.toast(S.N.toast(takeoverText()))
  }
  if (S.offWhy !== was) await publish(host, await load(host)).catch(() => undefined)
  // nobody took over: 15 minutes after the take-over line first showed, ONE window (the first to see the time up,
  // under the board lock) plays "needs you"; a live window drops the note
  const other = !!live && live !== S.me
  if (S.offWhy === 'gone' || other) {
    if (await goneReminder(host, other, nowMs)) sayGone(host, await load(host))
  }
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

export async function publish(host: Host, b: Board) {
  // the board drawn here is the one last loaded or saved, so its mtime now counts as seen (T-431)
  S.boardMtime = S.readMtime
  const working = [...workers.values()].map(w => ({ task: w.task, since: w.since }))
  // Which branch the owner is on is looked at here, once per publish, not on every render.
  // (new tasks merge into it; a task that merges elsewhere shows "→ branch" in the list)
  const branch = S.gitState === 'ok' ? await homeBranch(host) : ''
  // T-675: a data file close to the 4 MB read limit is warned about where the git warning goes (banner and status line)
  const size_note = [...sizeNotes.values()].join('; ')
  const branch_note = [gitNote(S.gitState), size_note].filter(Boolean).join('; ')
  // The banner's facts ride along in the view (extra fields; SymccView itself is shared with other code).
  const can = await playable(host)
  // T-727: the Live tab's Branches figures: the last ones read (a stale read starts in the background, never waited for here)
  const branches = branchFacts(host, b, branch || 'main').facts
  // T-769: ▍Today's lead, scout and cost figures, the last ones read (a stale read starts in the background);
  // read on every host, not only those with a panel: OpenCode draws ▍Today from the published view.json
  const team = todayTeam(host, [...scoutState.keys()]).team
  // T-761: each task page's Branch section, read the same way (OpenCode's panel draws only what the view holds)
  const task_branches = taskBranchesView(host, b).facts
  const v: PaneView = { tasks: b.tasks, working, scouts: [...scoutState.values()].map(s => (s.running && [...scoutRuns.values()].includes(s.name) ? { ...s, started: true } : s)), mode: modeOf(b), test_commands: b.test_commands, home_branch: branch, max_parallel: b.max_parallel, max_minutes: b.max_minutes, auto_retries: b.auto_retries, test_minutes: testMinutesOf(b), archive_days: b.archive_days, ...(b.archived ? { archived: b.archived } : {}), ...(b.archived_done?.length ? { archived_done: b.archived_done } : {}), open_on_start: openOnStart(b), notify_now: notifyOf(b, can, S.root), scout_findings: b.scout_findings, tests_with_changes: b.tests_with_changes, checker: b.checker, notify_choices: notifyChoices(can), on_here: onHere(b), ...(S.offHere ? { off_here: S.offWhy } : S.fresh ? { off_here: 'new' as const } : {}), driving: S.driving, branch_note, ...(size_note ? { size_note } : {}), git_state: S.gitState, ...(S.gitInstall ? { git_install: S.gitInstall } : {}), plan_mode: inPlan(S.plan), ...(branches ? { branches } : {}), ...(team ? { today_team: team } : {}), ...(Object.keys(task_branches).length ? { task_branches } : {}), ...(openQuestions(b).length ? { questions: openQuestions(b) } : {}) }
  // T-891: the view as it is stored (trimmed by slimView), worked out once here and written as it is: the owner is
  // told when trimming had to leave tasks out of the panel
  const fit = fitView(host, v)
  if (fit.note) sizeNotes.set('the board view', fit.note)
  else sizeNotes.delete('the board view')
  // the view's own size note may have just changed: show it now, not at the next publish
  const size_now = [...sizeNotes.values()].join('; ')
  if (size_now !== size_note) {
    for (const x of new Set([v, fit.view as PaneView])) {
      x.branch_note = [gitNote(S.gitState), size_now].filter(Boolean).join('; ')
      if (size_now) x.size_note = size_now
      else delete x.size_note
    }
  }
  await updateView(host, () => fit.view, fit.fitted)
  // the banner logo plays a move when something happened (a merge, a worker start, a scout finding, all done)
  void logoOnPublish(host, v).catch(() => undefined)
  // the status line under the prompt: the board's facts (mode, who drives, branch, next scout, today's merged and cost),
  // no task counts (the band above the prompt shows the work, T-748); redrawn every minute while scouts are timed, see refreshStatus.
  // Disabled: "disabled · /symcc-enable to turn it back on" without the name, as Claude Code puts "symcc: " in front; its status line
  // takes plain text only (no colors), so the command can't stand out there.
  const facts = { tasks: b.tasks, questions: b.questions, scouts: v.scouts, home_branch: branch, branch_note, mode: modeOf(b) }
  showStatus(host, () => (onHere(b) ? statusLine(facts, S.driving, { plan: inPlan(S.plan), nowMs: Date.now(), width: statusRoom(S.N.name) }) : offStatusLine(S.N.name, false, S.offHere ? S.offWhy : S.fresh ? 'new' : false)))
}

/** T-902: what /<name>-status draws for board `b`: the Live tab's fields of the view publish() writes, from the same
 *  sources (the branch and ▍Today team figures as last read; a stale read starts in the background, never waited for). */
export async function statusView(host: Host, b: Board): Promise<StatusView> {
  const branch = S.gitState === 'ok' ? await homeBranch(host) : ''
  const branches = branchFacts(host, b, branch || 'main').facts
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
/** Draws the line above the prompt again, so "next: x in 38m" counts down (scouts.ts calls it every minute). */
export function refreshStatus(host: Host) {
  if (statusText && host.features.band) host.ui.status(statusText())
}
