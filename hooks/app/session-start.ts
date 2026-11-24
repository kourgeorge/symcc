// The session's start and end, split out of symcc.ts (T-877): sessionStarting, sessionStart and the steps it shares
// with /<name>-init (initProject), the watchdog and heartbeat timers, the guard-only start of a worker's folder, and
// /clear and session end. symcc.ts re-exports the entry points; this file imports neither symcc.ts nor slash-commands.ts.
import { type Board, settingShown, LEAD_BEAT_MS, openOnStart, modeText, modeOf, emptyBoard } from '../board'
import type { Host } from '../host'
import { moveOldOrgMem } from './org-mem'
import { migrateIfOld } from './migrate-data'
import { gitReady, initGitIn, recheckGit } from './git'
import { claimLead, carryDriver, publish, handOver, releaseLead, startOffHere, offHereBeat } from './lead'
import { loadRoles } from './roles'
import { loadKinds } from './kinds'
import { scoutOriginsFixed, scheduleScouts, seedExampleScouts } from './scouts'
import { S, onHere, loadVersion, timers } from './state'
import { path, load, saveMigrated, startWait, projectRoot, sessionFolder, isWorkerFolder } from './store'
import { openPane } from './open'
import { check, pump } from './workers'
import { cleanLeftoverTmp } from './cleanup'
import { isDamSession } from './dam'

/** Counts sessionStart runs, so a late claimLead of an earlier start doesn't end a newer one's wait. */
let starts = 0

/**
 * The session is starting: no work starts until sessionStart has finished. Call it first, then register the host's
 * agent types, tools and commands (a pump started meanwhile, e.g. by a lead tool call, must find the worker type),
 * then call sessionStart.
 */
export function sessionStarting() {
  S.startupDone = false
}

/** The watchdog's timer went off (every 2 minutes): look for stuck workers and tasks. */
export function watchdogTick(host: Host) {
  if (S.guardOnly) return // a worker folder only guards: the timers touch nothing
  // git init by hand clears the notice. T-887: not while git is missing: on a Mac without the command-line tools,
  // running the /usr/bin/git stand-in opens Apple's install pop-up each time; Check again or a new session looks then
  if (!S.fresh && S.gitState !== 'ok' && S.gitState !== 'no-git') void recheckGit(host).catch(() => undefined)
  void check(host).catch(() => undefined)
}

/** The lead heartbeat's timer went off: the driver refreshes its heartbeat; the others look whether it went stale and take over. */
export function leadBeat(host: Host) {
  // T-793: a window off here drives nothing; it only looks whether the window with symcc on is gone
  if (S.fresh || S.guardOnly) return // guardOnly: a worker folder never claims a lead
  if (S.offHere) return void offHereBeat(host).catch(() => undefined)
  void claimLead(host)
    .then(async d => (d ? pump(host) : undefined))
    .catch(() => undefined)
}

/**
 * The session started (after sessionStarting and the host's registration): learns the project, migrates old files,
 * claims the lead, loads scouts, roles and task types, starts the timers and opens the board panel.
 */
export async function sessionStart(host: Host) {
  // A session in one of symcc's worker folders (<main project>/.<name>/worktrees/...) only guards (see guardStart);
  // any other folder, an owner's own second checkout too, runs normally with its own root.
  const own = await sessionFolder(host)
  const main = await projectRoot(host, own).catch(() => own)
  if (await isWorkerFolder(host, own, main).catch(() => false)) return guardStart(host, main)
  S.guardOnly = false
  // claimLead may wait on the clock: for the board lock (up to 5 s), for old workers it stopped
  // to end (up to ORPHAN_WAIT_MS, 20 s) and for the reload settle (2 s). A hook has 10 s and
  // clock waits count against it, so session start doesn't wait for those: once claimLead is
  // about to wait (startWait.mark), the rest of the start goes on and claimLead finishes on its
  // own. S.startupDone stays false until claimLead has finished, so pump starts no work before
  // old tasks went back to "todo". When nothing waits, all of it runs in order as before.
  const run = ++starts
  let leadDone = true
  let lead: Promise<unknown> = Promise.resolve()
  // Even if a later step throws, pump must not stay blocked for the whole session.
  try {
    await loadVersion(host)
    S.root = main || own
    S.home = (await host.env('HOME').catch(() => undefined)) ?? ''
    // T-1016: a window that drove under the old id and now has a new one is still the same window
    const oldMe = S.me
    const wasDriving = S.driving && !S.fresh && !S.offHere && !!oldMe
    S.me = await host.session.id().catch(() => `session-${Math.random().toString(36).slice(2, 10)}`)
    S.dam = await isDamSession(host)
    // T-795: a new project (no board.json) stays off, like plain Claude, until the owner runs /<name>-init (T-844: no .<name> in this folder or above): nothing is
    // written, no lead is claimed, no scouts are seeded and no timer starts; only the band and status line say so.
    S.fresh = !(await host.fs.exists(path(S.N.boardFile)).catch(() => false))
    S.offHere = false
    S.driving = false
    if (S.fresh) {
      S.enabledNow = false
      await publish(host, await load(host))
      return
    }
    // T-804: old data shapes are brought up to date first (backup kept), before anything below can save over them.
    // If that fails, nothing below that saves runs (the owner was told once).
    if (!(await migrateIfOld(host))) {
      // Finished tasks kept whole in board.json move to their parts files once (T-675).
      await saveMigrated(host).catch(() => undefined)
      await scoutOriginsFixed(host).catch(() => undefined)
      await moveOldOrgMem(host).catch(() => undefined)
    }
    // T-793: another live window with symcc on makes this one start off here (plain), before it can claim the lead
    if (wasDriving && oldMe !== S.me) await carryDriver(host, oldMe).catch(() => undefined)
    await startOffHere(host).catch(() => undefined)
    // Become the driver if nobody drives the board. As the driver, old workers still running
    // from before a reload are stopped first and their tasks go back to "todo".
    const waits = new Promise<void>(r => (startWait.mark = r))
    leadDone = false
    lead = claimLead(host, true)
      .catch(() => (S.driving = false))
      .finally(() => (leadDone = true))
    await Promise.race([lead, waits])
    startWait.mark = null
    if (!(await host.fs.exists(path(S.N.boardFile)))) await publish(host, await load(host))
    // A board.json that can't be read: load already kept a copy and told the owner (once); nothing
    // more happens now and board.json is left as it is. The heartbeat's pump starts work once it is fixed.
    // The board panel opens by itself every session, driver or not.
    await startSteps(host, { cleanTmp: true, unreadable: 'skip', openIf: b => openOnStart(b) && onHere(b) })
  } finally {
    startWait.mark = null
    const done = () => {
      if (run !== starts) return
      S.startupDone = true
      void pump(host).catch(() => undefined)
    }
    if (leadDone) done()
    else void lead.then(done)
  }
}

/**
 * The start steps sessionStart and initProject share, once the lead claim is under way: the example scouts (a new
 * project, no scouts folder yet, gets the plugin's, all paused; run now still runs them), the scouts' timers, the roles
 * and kinds, (with `cleanTmp`) the temp files a killed session left, the watchdog and heartbeat; then the board is read,
 * git looked at once (with no git, no repo or no commit, the lead is told once and nothing starts), the board published
 * and the panel opened when `openIf` says so, without taking the cursor from the prompt (on a narrow terminal Claude
 * Code may not place it; the band above the prompt and /<name> still work). None of the steps before the read stops
 * the start. `unreadable`: what a board.json that can't be read does: 'skip' the rest (answers null), or 'throw'.
 */
async function startSteps(host: Host, o: { cleanTmp: boolean; unreadable: 'skip' | 'throw'; openIf: (b: Board) => boolean | Promise<boolean> }): Promise<Board | null> {
  await seedExampleScouts(host).catch(() => undefined)
  await scheduleScouts(host).catch(() => undefined)
  await loadRoles(host).catch(() => undefined)
  await loadKinds(host).catch(() => undefined)
  if (o.cleanTmp) await cleanLeftoverTmp(host).catch(() => undefined)
  startTimers(host)
  const b = o.unreadable === 'skip' ? await load(host).catch(() => null) : await load(host)
  if (!b) return null
  await gitReady(host, b).catch(() => undefined)
  await publish(host, b)
  if (await o.openIf(b)) await openPane(host, { tab: 'live', focus: false, quiet: true })
  return b
}

/** The watchdog and the lead heartbeat start (again). */
function startTimers(host: Host) {
  S.watchdog?.cancel()
  S.watchdog = host.clock.every(2 * 60_000, () => watchdogTick(host))
  S.beat?.cancel()
  S.beat = host.clock.every(LEAD_BEAT_MS, () => leadBeat(host))
}

/**
 * T-844: makes the board in `dir`, a folder the session may not even run in. It names `dir` everywhere and never reads or sets
 * the session's state (S.root, S.guardOnly, S.fresh, S.gitState, S.toldGit), so a running session's board is untouched
 * while it works. Git first: with no .git of its own, git init and a first commit run here first; if that fails nothing
 * is created and the error comes back, so running it again retries. Only then is board.json written. Returns the error, '' when done.
 */
async function createBoardIn(host: Host, dir: string, setUpGit: boolean): Promise<string> {
  if (setUpGit) {
    const failed = await initGitIn(host, dir).then(() => '', (err: Error) => err.message)
    if (failed) return failed
  }
  try {
    await host.run(['mkdir', '-p', `${dir}/${S.N.dir}`], { cwd: dir })
    await host.fs.write(`${dir}/${S.N.boardFile}`, JSON.stringify(emptyBoard(), null, 2) + '\n')
  } catch (err) {
    return (err as Error).message
  }
  return ''
}

/** A window that started with no board looks again for a board in its own folder; if one is there now, it starts the normal way (off here when another window drives, a lead otherwise). */
export async function refreshFresh(host: Host) {
  if (!S.fresh || S.guardOnly) return
  const own = await sessionFolder(host)
  const main = (await projectRoot(host, own).catch(() => own)) || own
  if (await host.fs.exists(`${main}/${S.N.boardFile}`).catch(() => false)) await sessionStart(host).catch(() => undefined)
}

/**
 * T-844: /<name>-init, like the git command that starts a repo: creates the board in the folder the session started in,
 * turns symcc on, and starts what a normal start does (the lead claim, example scouts, timers, git check, the panel); the
 * lead is told it is the lead now. Where a board is found (here or above) it changes nothing. A folder with no .git of its
 * own still gets its board (T-861): the board shows a "no git" notice with a Set up git button (never a parent folder's
 * repo), and no worker starts until git is set up. /<name>-init git sets git up here first, then makes the board.
 * If another window already runs symcc here, this one stays off (see startOffHere).
 */
export async function initProject(host: Host, tell: (text: string) => void, withGit: boolean): Promise<string> {
  const own = (await sessionFolder(host)).replace(/[\\/]+$/, '') || '/'
  // like git init: only a board in this exact folder stops it; one in a folder above does not
  if (await host.fs.exists(`${own}/${S.N.boardFile}`).catch(() => false)) return S.offHere ? (S.offWhy === 'other' ? `${S.N.name} is already set up here. It runs in another window; /${S.N.name}-enable turns it on in this one too.` : `${S.N.name} is already set up here, but it is off in this window. /${S.N.name}-enable turns it back on.`) :`${S.N.name} is already set up here.`
  const hasGit = await host.fs.exists(`${own}/.git`).catch(() => false)
  // T-861: plain init always makes the board; with no git the board shows a notice and its Set up git button does the git part
  const failed = await createBoardIn(host, own, !hasGit && withGit)
  if (failed) return `${S.N.name} was not set up here: ${failed}${hasGit || !withGit ? '' : ` (nothing was created; /${S.N.name}-init git tries again)`}`
  // the session's own folder with no board: it switches itself on, like a new start
  S.root = own
  S.fresh = false
  S.enabledNow = true
  await startOffHere(host).catch(() => undefined)
  if (S.offHere) {
    startTimers(host)
    await publish(host, await load(host))
    return `${S.N.name} already runs in another window. /${S.N.name}-enable turns it on in this one too.`
  }
  S.startupDone = false
  try {
    await claimLead(host, true).catch(() => (S.driving = false))
    // no leftover temp files to clean in a board just made (the regular check cleans them anyway); the panel opens unless it is shown already
    const b = (await startSteps(host, { cleanTmp: false, unreadable: 'throw', openIf: async b => openOnStart(b) && !(await host.ui.panes().then(ps => ps.some(p => p.id === S.N.pane && p.isShown), () => false)) }))!
    tell(`The owner ran /${S.N.name}-init in this folder. You are the lead now; the board is in mode ${modeOf(b)}.${S.driving ? '' : ' Another window drives the board.'}`)
    return `${S.N.name} is on in this project, in mode ${settingShown('mode', modeOf(b))}: ${modeText(modeOf(b))}.`
  } finally {
    S.startupDone = true
    void pump(host).catch(() => undefined)
  }
}

/**
 * A "guard only" start, for a copy of the plugin running in a worker's folder (a worktree): S.root is the main project
 * (`root` when the host passes it, else from git, see mainRoot), and the roles, kinds and board are read, so toolCheck
 * and checkEdit can judge that copy's tool calls. It never claims lead.json, starts no timer, seeds no scouts, and
 * never publishes or creates board.json; the session that drives the board does all of that.
 */
export async function guardStart(host: Host, root?: string) {
  S.guardOnly = true
  S.driving = false
  await loadVersion(host).catch(() => undefined)
  S.root = root || (await projectRoot(host, await sessionFolder(host)).catch(() => '')) || S.root
  S.home = (await host.env('HOME').catch(() => undefined)) ?? ''
  S.me = await host.session.id().catch(() => `session-${Math.random().toString(36).slice(2, 10)}`)
  if (!S.root) return
  await loadRoles(host).catch(() => undefined)
  await loadKinds(host).catch(() => undefined)
  await load(host).catch(() => undefined)
}

/** What a guard-only copy (see guardStart) answers for symcc's own tools and commands: the board is run from the main project. */
export const guardOnlyText = () => `This ${S.N.name} copy runs in a worker's folder and only guards tool calls; use the ${S.N.name} board from the main project folder.`

/**
 * The chat was cleared (Claude Code's /clear): the session ends but the process goes on under a new session id, and
 * no session start follows: the timers, workers and scouts are kept, and the lead is handed over to the new id.
 */
export async function sessionCleared(host: Host) {
  // a guard-only copy only follows the new id: it never touches the lead or the board
  if (S.guardOnly) {
    S.me = (await host.session.id().catch(() => S.me)) || S.me
    return
  }
  await handOver(host).catch(() => undefined)
}

/** The session ends: the timers stop and the lead is let go. */
export async function sessionEnd(host: Host) {
  for (const t of timers.splice(0)) t.cancel()
  S.watchdog?.cancel()
  S.watchdog = null
  S.beat?.cancel()
  S.beat = null
  // a guard-only copy never claimed the lead, so it has nothing to let go (and takes no board lock for it)
  if (!S.guardOnly) await releaseLead(host)
}
