// symcc (the name comes from plugin.json, see hooks/name.ts): a shared task board, the main chat as its lead, workers that build tasks in
// parallel in their own Git worktrees and merge what passes the tests, and scouts you
// define in .<name>/scouts/*.md that do what their file asks on a timer.
//
// How work flows:
//   you ⇄ lead (the main chat)  ──board tools──▶  .<name>/board.json
//   a task is ready  ──▶  worktree + background worker subagent
//   worker done      ──▶  commit · scope check · tests · merge into main  ──▶  the lead is told
//   scout on a timer ──▶  report    ──▶  the lead is told and decides what goes on the board
//
// This file holds symcc's entry points: what a host calls when something happens (the session starts or ends, the owner types a
// prompt, a tool is called or checked, an agent's run ends, a slash command runs, a timer goes off). Each takes a
// Host (hooks/host.ts) and plain values in symcc's words, and answers plain values, so Claude Code's wiring
// (hooks/register.tsx) and another host (an OpenCode plugin, a standalone app) call the same code. Nothing here
// imports 'claude-code'; what is only Claude Code's (its event shapes, agent types, plan mode events, the panel's
// render hooks) stays in register.tsx and hooks/claude/.
//
// Before calling an entry point, the host calls useName (app/state.ts) with its plugin name, so S.N is right.
import { settingShown, type Command, boardText, shortHome, LEAD_BEAT_MS, openOnStart, symccOn, offAnswer, offHereAnswer, notSetUpAnswer, modeText, commandNames, parseCommand, modeOf, settingsText, notifyOf, find, STATUS_WORD, statText, cutDiff, everyText, intoOf, ASK_TOOL, guardReason, scoutToolRefusal, NEW_ROLE_TEMPLATE, NEW_KIND_TEMPLATE, NEW_SCOUT_EVERY, emptyBoard } from '../board'
import { type FileTouch, type Host, type HostFeatures, ALL_FEATURES } from '../host'
import type { SymccTokens } from '../../types'
import { findArchived } from './archive'
import { moveOldOrgMem, deleteOrgMem } from './org-mem'
import { migrateIfOld } from './migrate-data'
import { askCall, checkEdit, guardFailed, stoppedText, stoppedTextFor, movedAway, movedText, listedKind, type AgentKindOf } from './ask'
import { gitReady, setupGit, initGitIn } from './git'
import { claimLead, publish, handOver, releaseLead, driveHere, startOffHere, disableHere, enableHere, offHereBeat } from './lead'
import { changedFiles, changesText } from './review'
import { loadRoles, changeRole } from './roles'
import { loadKinds, changeKind } from './kinds'
import { checkerFinished } from './checker'
import { fileToolHits, scoutOriginsFixed, scheduleScouts, seedExampleScouts, scoutFinished, runScoutNow, setScoutPaused, unreadableScoutsText, leadScouts } from './scouts'
import { S, onHere, loadVersion, toolName, timers, heard, stopped, workers, scoutRuns, checkerRuns, scoutState, isOwnAgent } from './state'
import { path, load, change, isOn, now, saveMigrated, startWait, findRoot, projectRoot, sessionFolder, isWorkerFolder, startingText } from './store'
import { noteForLead, tellLead, brief, takeBoardUpdate } from './tell'
import { playable } from './voice'
import { TOOLS, leadGuide, runTool, type In, manual, ownerSettings, taskText, latestReport, statsText } from './tools'
import { openPane } from './open'
import { debriefFinished } from './debrief'
import { check, pump, workerFinished, lateHandBack, agentOnBoard, stoppedHandBack, type TurnEnd } from './workers'
import { setSymcc, setBoardMode } from './board-mode'
import { cleanLeftoverTmp } from './cleanup'
import { doctor } from './doctor'
import { isStarter } from './starts'
import { logRefusal, type Who } from './evidence'

/** What /symcc and /symcc-tasks answer after opening the board. No Esc hint: Esc doesn't reach the panel (T-158). */
export const BOARD_OPENED = 'Board opened: ↑↓ to move, Enter to open, f to search, t tasks, s scouts, c settings.'
/** BOARD_OPENED with the host's keys that go back to the board panel (HostWords.backToBoard), when it has them. */
export const boardOpened = (): string => (S.W.backToBoard ? `${BOARD_OPENED} (${S.W.backToBoard} goes back to it.)` : BOARD_OPENED)

/** symcc's slash commands, for the host to register: name, description and the hint for its arguments. `features`: the
 * host's (every one on unless given); without a panel, /symcc shows the board as text (OpenCode's panel is /symcc-board). */
export function COMMANDS(features: HostFeatures = ALL_FEATURES): { name: string; description: string; argumentHint?: string }[] {
  return [
    { name: S.N.name, description: features.panel ? `Open the ${S.N.name} board panel: tasks and scouts` : `Show the ${S.N.name} board as text (the panel: /${S.N.name}-board)` },
    { name: `${S.N.name}-tasks`, description: `Open the ${S.N.name} board panel on the tasks view` },
    { name: `${S.N.name}-scouts`, description: `Open the ${S.N.name} board panel on the scouts view and reload the scout files` },
    { name: `${S.N.name}-task`, description: `Open one ${S.N.name} task (/${S.N.name}-task T-3), or do one of its page's actions: /${S.N.name}-task T-3 pause, resume, retry, drop [reason], merged (already merged by hand), review on|off, stash (to the backlog), todo (out of the backlog), role <name>, or note (an answered investigation: keep it as a note)`, argumentHint: '<T-id> [pause|resume|retry|drop [reason]|merged|review on|off|stash|todo|role <name>|note]' },
    { name: `${S.N.name}-approve`, description: `Approve a ${S.N.name} task that is ready for review (merge it): /${S.N.name}-approve T-5`, argumentHint: '<T-id>' },
    { name: `${S.N.name}-reject`, description: `Reject a ${S.N.name} task in review, with the reason: /${S.N.name}-reject T-5 <reason>`, argumentHint: '<T-id> <reason>' },
    { name: `${S.N.name}-diff`, description: `Show what a ${S.N.name} task in review changed, or one file's diff: /${S.N.name}-diff T-5 [file]`, argumentHint: '<T-id> [file]' },
    { name: `${S.N.name}-scout`, description: `Run a ${S.N.name} scout now (/${S.N.name}-scout <name>), pause or resume it (/${S.N.name}-scout <name> pause|resume), or change it (/${S.N.name}-scout <name> every 30, model <model|none>, prompt <instructions>); a new one: /${S.N.name}-scout <name> new <instructions>`, argumentHint: '<name> [pause|resume|every N|model M|prompt TEXT|new TEXT]' },
    { name: `${S.N.name}-mode`, description: `Set the ${S.N.name} board mode: paused (nothing runs), review = approve merge (finished work waits for you) or auto = auto merge (it merges on its own); no word switches review and auto`, argumentHint: '[paused|review|auto]' },
    { name: `${S.N.name}-settings`, description: `See and change the ${S.N.name} settings: /${S.N.name}-settings opens them; /${S.N.name}-settings max_parallel 5 sets one; /${S.N.name}-settings role tester off (or kind, with on, off, reset or remove) changes a role or kind, role <name> add makes one, role <name> edit <field> <value> changes one part of it (save {"field":"value",...} several at once); /${S.N.name}-settings git setup sets up git (as the lead's setup_git)`, argumentHint: '[name value | role|kind <name> on|off|reset|remove | role|kind <name> add | role|kind <name> edit <field> <value> | role|kind <name> save {json} | git setup]' },
    { name: `${S.N.name}-stats`, description: `Show ${S.N.name} time and token stats: the whole team (lead, workers, scouts), totals, averages per task and per try, time per stage, outcomes, by role, origin and day, with bar charts; inside (with a day range) counts only the work inside it; html writes them as a web page with charts and opens it: /${S.N.name}-stats [full|html] [7d [inside]|T-100..T-130]`, argumentHint: '[full|html] [7d [inside]|T-1..T-9]' },
    { name: `${S.N.name}-doctor`, description: `Check ${S.N.dir}/ and git: old migration backups, task branches already merged, leftover task folders, files near the 4 MB limit, a stuck board; lists them with sizes and cleans up only with /${S.N.name}-doctor fix (all) or fix b-T-5 m-1101-1000 (the items with those ids)`, argumentHint: '[fix [all|id ...]]' },
    { name: `${S.N.name}-disable`, description: `Disable ${S.N.name} for this project: ${S.W.assistant} works as normal, nothing runs; the board is kept; "here" turns it off in this window only`, argumentHint: '[here]' },
    { name: `${S.N.name}-enable`, description: `Enable ${S.N.name} again for this project, in the mode the board had; "here" turns it on again in this window`, argumentHint: '[here]' },
    { name: `${S.N.name}-init`, description: `Set up ${S.N.name} in this folder, like git init: makes ${S.N.dir}/ here, turns it on and opens the board; with no .git of its own it asks first, then "git" sets up git here too; where a board exists it changes nothing`, argumentHint: '[git]' },
    { name: `${S.N.name}-drive`, description: `Make this session drive the ${S.N.name} board (start workers, merge, run scouts); another driving session hands over first` },
    { name: S.N.help, description: `Show the ${S.N.name} manual: how the board, lead, workers and scouts work, and every command`, argumentHint: '[topic]' },
  ]
}

// ---------------- session ----------------

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
 * claims the lead, loads scouts, roles and kinds, starts the timers and opens the board panel.
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
    S.me = await host.session.id().catch(() => `session-${Math.random().toString(36).slice(2, 10)}`)
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
    // A new project (no scouts folder yet) gets the plugin's example scouts, all paused (no timer runs them; run now still does); never stops the start.
    await seedExampleScouts(host).catch(() => undefined)
    await scheduleScouts(host).catch(() => undefined)
    await loadRoles(host).catch(() => undefined)
    await loadKinds(host).catch(() => undefined)
    await cleanLeftoverTmp(host).catch(() => undefined)
    startTimers(host)
    // A board.json that can't be read: load already kept a copy and told the owner (once); nothing
    // more happens now and board.json is left as it is. The heartbeat's pump starts work once it is fixed.
    const b = await load(host).catch(() => null)
    if (b) {
      // Look at git once now: with no git, no repo or no commit, the lead is told (once) and nothing starts.
      await gitReady(host, b).catch(() => undefined)
      await publish(host, b)
      // Open the board panel by itself (every session, driver or not), without taking the cursor
      // from the prompt. On a narrow terminal Claude Code may not place it (isPlaced: false);
      // that is fine: the band above the prompt and /<name> still work.
      if (openOnStart(b) && onHere(b)) await openPane(host, { tab: 'live', focus: false, quiet: true })
    }
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

/** A window that started with no board looks again for the nearest board; if one is there now, it starts the normal way (off here when another window drives, a lead otherwise). */
async function refreshFresh(host: Host) {
  if (!S.fresh || S.guardOnly) return
  const own = await sessionFolder(host)
  const main = (await projectRoot(host, own).catch(() => own)) || own
  if (await host.fs.exists(`${main}/${S.N.boardFile}`).catch(() => false)) await sessionStart(host).catch(() => undefined)
}

/**
 * T-844: /<name>-init, like the git command that starts a repo: creates the board in the folder the session started in,
 * turns symcc on, and starts what a normal start does (the lead claim, example scouts, timers, git check, the panel); the
 * lead is told it is the lead now. Where a board is found (here or above) it changes nothing. A folder with no .git of its
 * own is asked about first (the answer is /<name>-init git): then git is set up in this folder (never a parent folder's
 * repo). If another window already runs symcc here, this one stays off (see startOffHere).
 */
async function initProject(host: Host, tell: (text: string) => void, withGit: boolean): Promise<string> {
  const own = (await sessionFolder(host)).replace(/[\\/]+$/, '') || '/'
  // like git init: only a board in this exact folder stops it; one in a folder above does not (the nearest board wins)
  if (await host.fs.exists(`${own}/${S.N.boardFile}`).catch(() => false)) return S.offHere ? (S.offWhy === 'other' ? `${S.N.name} is already set up here. It runs in another window; /${S.N.name}-enable here turns it on in this one too.` : `${S.N.name} is already set up here, but it is off in this window. /${S.N.name}-enable here turns it back on.`) :`${S.N.name} is already set up here.`
  const hasGit = await host.fs.exists(`${own}/.git`).catch(() => false)
  if (!hasGit && !withGit) return `This folder has no git repo of its own (${S.N.name} never uses a folder above). ${S.N.name} needs git for its task branches. /${S.N.name}-init git sets up git here (a repo on main, a .gitignore and a first commit; never pushes) and creates the ${S.N.name} board here.`
  // this session already runs on a board in a folder above: the new board is made here, but the session keeps the old one
  const above = !S.fresh && !!S.root && S.root !== own ? S.root : ''
  const failed = await createBoardIn(host, own, !hasGit)
  if (failed) return `${S.N.name} was not set up here: ${failed}${hasGit ? '' : ` (nothing was created; /${S.N.name}-init git tries again)`}`
  if (above) return `${S.N.name} board created in ${shortHome(own, S.home)} (the nearest board wins there). This session still runs on the board in ${shortHome(above, S.home)}: start a new session in this folder to use the new one.`
  // the session's own folder with no board: it switches itself on, like a new start
  S.root = own
  S.fresh = false
  S.enabledNow = true
  await startOffHere(host).catch(() => undefined)
  if (S.offHere) {
    startTimers(host)
    await publish(host, await load(host))
    return `${S.N.name} already runs in another window. /${S.N.name}-enable here turns it on in this one too.`
  }
  S.startupDone = false
  try {
    await claimLead(host, true).catch(() => (S.driving = false))
    await seedExampleScouts(host).catch(() => undefined)
    await scheduleScouts(host).catch(() => undefined)
    await loadRoles(host).catch(() => undefined)
    await loadKinds(host).catch(() => undefined)
    startTimers(host)
    const b = await load(host)
    await gitReady(host, b).catch(() => undefined)
    await publish(host, b)
    if (openOnStart(b) && !(await host.ui.panes().then(ps => ps.some(p => p.id === S.N.pane && p.isShown), () => false))) await openPane(host, { tab: 'live', focus: false, quiet: true }).catch(() => undefined)
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
const guardOnlyText = () => `This ${S.N.name} copy runs in a worker's folder and only guards tool calls; use the ${S.N.name} board from the main project folder.`

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

// ---------------- the lead's prompt ----------------

/** The lead's guide, for the host to add to the lead's system prompt; undefined: add nothing (symcc is disabled, or the project is not known yet). */
export async function leadGuideText(host: Host): Promise<string | undefined> {
  // Before session start set the project folder (a plugin reload): learn it first; unknown, add nothing.
  if (!(await findRoot(host))) return undefined
  if (S.guardOnly) return undefined
  // Read on every call, so /<name>-disable and /<name>-enable count from the next message.
  if (!(await isOn(host))) return undefined
  return leadGuide(host.features)
}

/**
 * For a host that can't wake the lead (features.wakeLead 'next-turn'): the board update waiting for the lead, for the
 * host to add to its next hook that can carry text (e.g. when the lead's turn ends or the owner sends a prompt);
 * undefined when nothing waits. A host that wakes the lead at once never needs it: its updates are sent.
 */
export function leadUpdate(): string | undefined {
  return takeBoardUpdate()
}

/**
 * The owner typed a prompt (at the terminal or from the phone/web bridge; not a slash command, a hidden prompt or
 * symcc's own board update). It is kept, so a task added after it can point back to the request.
 */
export function ownerTyped(text: string) {
  if (text.trim()) heard.owner = { text: text.trim().slice(0, 2000), at: now() }
}

// ---------------- tools ----------------

let names: string[] | null = null
/** The names of the lead's tools, symcc's plain names (the host may call them otherwise, see toolName). */
const toolNames = () => (names ??= TOOLS().map(t => t.name))

/** Whether `tool` (the name the host calls it by) is one of symcc's own: the lead's tools or the workers' question tool. */
export function isSymccTool(tool: string): boolean {
  return tool === toolName(ASK_TOOL) || toolNames().some(t => tool === toolName(t))
}

/**
 * A tool is called (by the lead or by one of symcc's agents). Answers a refusal (`deny`) or symcc's tool's answer
 * (`result`); null: not symcc's call, the host runs it as usual and then calls otherToolDone.
 * A worker or scout symcc stopped can't do anything more, so every tool it tries is refused. A scout or checker may
 * only read the board (board and stats); its call of any other symcc tool is refused. The lead's own tools
 * and the workers' question tool (it knows the calling worker from `agentId`) run here.
 * An agent this copy doesn't hold is looked up on the board (agentOnBoard, T-471), so a checker or a stopped agent
 * of another session's copy is treated as here; an unreadable board throws (toolCallFailed then decides).
 * The lead is the caller with no `agentId` (the host's main chat; a host whose lead has an id of its own, as OpenCode's
 * session, passes none for it). Any other agent is refused the lead's tools (T-525), whether or not the board still
 * names it: an agent of an old try whose id the board no longer keeps (runs keeps only the last few) is never taken for
 * the lead.
 */
export async function toolCall(host: Host, tool: string, agentId: string | undefined, input: Record<string, unknown>): Promise<{ deny: string } | { result: string } | null> {
  // T-660: every refusal of an agent's call is logged (in the background, after the decision)
  const refuse = (text: string, guard: 'stopped' | 'tools', who: Who): { deny: string } => {
    logRefusal(host, who, { text, guard, what: tool })
    return { deny: text }
  }
  if (agentId && stopped.has(agentId)) return refuse(stoppedTextFor(agentId), 'stopped', { role: 'agent' })
  const on = agentId && !isOwnAgent(agentId) && (await findRoot(host)) ? await agentOnBoard(host, agentId) : undefined
  if (on?.kind === 'ended') return refuse(stoppedText(), 'stopped', { role: 'agent', task: on.task })
  // a scout or checker only reads the board: board and stats run, every other symcc tool (ask_owner too) is refused
  if (agentId && (scoutRuns.has(agentId) || checkerRuns.has(agentId) || on?.kind === 'checker')) {
    const short = tool === toolName(ASK_TOOL) ? ASK_TOOL : toolNames().find(t => tool === toolName(t))
    const why = short ? scoutToolRefusal(short, S.N.name) : null
    const scout = scoutRuns.get(agentId)
    const task = checkerRuns.get(agentId)?.task ?? (on?.kind === 'checker' ? on.task : undefined)
    if (why) return refuse(why, 'tools', scout !== undefined ? { role: 'scout', scout } : { role: 'checker', ...(task ? { task } : {}) })
  } else if (agentId) {
    // T-525: an agent that is no scout or checker (a worker, one symcc no longer has on record, or any other) never gets the lead's tools
    const lead = toolNames().find(t => tool === toolName(t))
    const w = workers.get(agentId) ?? (on?.kind === 'worker' ? on.worker : undefined)
    // T-759: a scout or worker of symcc's this copy has no record of, in a session that no longer drives the board
    // (driving moved to another session): stopped with that plain note, not told it isn't the lead
    if (lead && !w && !isOwnAgent(agentId) && (await listedKind(host, agentId)) === 'symcc' && (await movedAway(host, agentId))) return refuse(movedText(), 'stopped', { role: 'agent' })
    if (lead) return refuse(notLeadText(lead), 'tools', w ? { role: 'worker', task: w.task } : { role: 'agent' })
  }
  if (tool === toolName(ASK_TOOL)) {
    if (!(await findRoot(host))) return { result: startingText() }
    return { result: await askCall(host, agentId, input).catch((err: Error) => `error: ${err.message}`) }
  }
  const name = toolNames().find(t => tool === toolName(t))
  if (!name) return null
  // Before session start set the project folder (e.g. right after a plugin reload), learn it from the
  // session; if it still isn't known, answer and write nothing (never a board or lock path from "/").
  if (!(await findRoot(host))) return { result: startingText() }
  if (S.guardOnly) return { result: guardOnlyText() }
  if (!(await isOn(host))) return { result: S.fresh ? notSetUpAnswer(S.N.name) : S.offHere ? offHereAnswer(S.N.name) : offAnswer(S.N.name) }
  try {
    return { result: await runTool(host, name, input as In) }
  } catch (err) {
    return { result: `error: ${(err as Error).message}` }
  }
}

/** Why an agent's call of lead tool `tool` (plain name) is refused: only the lead (the main chat) may call it. */
export const notLeadText = (tool: string) =>
  `Refused: ${toolName(tool)} is only for the ${S.N.name} lead (the main chat), and you are not it. Change nothing on the board; put anything for it in your final answer, and end.`

/**
 * A tool that is not symcc's ran, and touched what `touch` says (a file it wrote or edited, or a shell command it ran;
 * null: none of those, as the host tells it from its own tool names, e.g. claude/tools.ts). Writing, editing or
 * deleting a scout file reschedules the scouts, a role or kind file reloads the roles or kinds, and the board is published again.
 * Runs in the background.
 */
export function otherToolDone(host: Host, touch: FileTouch | null) {
  if (!touch || S.guardOnly) return
  const hit = fileToolHits(touch, S.N.scouts, `${S.N.dir}/roles`, `${S.N.dir}/kinds`)
  if (!hit.scouts && !hit.roles && !hit.kinds) return
  void (async () => {
    // before session start (a plugin reload): learn the project folder first; unknown, change nothing
    if (!(await findRoot(host))) return
    if (hit.scouts) await scheduleScouts(host)
    if (hit.roles) await loadRoles(host).catch(() => undefined)
    if (hit.kinds) await loadKinds(host).catch(() => undefined)
    await publish(host, await load(host))
  })().catch(() => undefined)
}

/**
 * symcc's tool call handling threw or ran out of time, before the call was passed on. One of symcc's own agents is
 * refused (never let through unchecked); the lead's call of a symcc tool gets the error; null: any other call of the
 * lead goes on as if symcc were not there (see guardFailed).
 */
export function toolCallFailed(host: Host, tool: string, agentId: string | undefined, error: { kind?: string; message?: string } | undefined): { deny: string } | { result: string } | null {
  const deny = guardFailed(host, 'tool.call', agentId, error)
  if (deny) return { deny }
  return isSymccTool(tool) ? { result: `error: ${S.N.name} couldn't run this tool: ${guardReason(error?.kind, error?.message)}` } : null
}

/**
 * A tool is about to run, and would touch what `touch` says (a file it writes or edits, or a shell command it runs;
 * null: none of those, as the host tells it from its own tool names, e.g. claude/tools.ts editTouch): answers why it
 * is refused, or undefined to decide as usual. A worker's edit outside its change task's files is refused, and the
 * path is recorded as a request to the owner; an edit or shell command reaching the owner's copy outside the worker's
 * folder is refused (see checkEdit). `cwd` is the calling agent's own folder, when the host knows it. `kindOf` tells
 * whether an agent symcc has no record of was started as one of symcc's (default: the host's agent list). An error is not
 * swallowed: the host then calls toolCheckFailed.
 */
export async function toolCheck(host: Host, agentId: string | undefined, touch: FileTouch | null, cwd?: string, kindOf?: AgentKindOf): Promise<string | undefined> {
  return agentId ? await checkEdit(host, agentId, touch, cwd, kindOf) : undefined
}

/** toolCheck threw or ran out of time: a worker's, checker's or scout's call is refused (the reason), the lead's goes on (undefined). */
export function toolCheckFailed(host: Host, agentId: string | undefined, error: { kind?: string; message?: string } | undefined): string | undefined {
  return guardFailed(host, 'tool.check', agentId, error)
}

// ---------------- agents ----------------

/** How an agent's run ended: its final answer, why (`end`), whether it was cut off, the tokens it used, and its cost in US dollars when the host knows it (a worker's is kept on its try). */
export type AgentRunEnd = { answer: string; end: TurnEnd; isAborted: boolean; tokens: SymccTokens | undefined; cost?: number }

/** An agent's run ended (a worker, scout or checker of symcc's, or one this copy lost track of in a reload); other agents are left alone. */
export function agentFinished(host: Host, agentId: string | undefined, run: AgentRunEnd) {
  // T-831: the hidden starter is no worker, scout or checker: nothing is kept of it
  if (agentId && isStarter(agentId)) return
  // T-656: the answer to a debrief (the follow-up after a hand-back) only brings org-mem suggestions
  // (and, like any agent's end, it runs pump: a fast retry of its task, held back by nothing now, starts at once)
  if (agentId && debriefFinished(host, agentId, run)) {
    void pump(host).catch(() => undefined)
    return
  }
  const { answer, end, isAborted, tokens, cost } = run
  // a scout's or checker's turn that ended on an API error or a refusal: its half-written last text is no report or verdict
  const broken = !isAborted && (end.reason === 'error' || end.reason === 'refusal')
  if (agentId && workers.has(agentId)) void workerFinished(host, agentId, answer, end, tokens, cost).catch(() => undefined)
  else if (agentId && scoutRuns.has(agentId)) void scoutFinished(host, agentId, answer, broken ? end : isAborted, tokens)
  // a checker's verdict (the checker setting) goes to the finish step waiting for it
  else if (agentId && checkerRuns.has(agentId)) checkerFinished(agentId, answer, broken ? end : isAborted || end.reason === 'aborted', tokens)
  // a report from a worker this copy lost track of in a reload: still taken when its task waits for it
  // (a worker this copy stopped, e.g. an orphan after a reload: its task is put back to "todo" at once instead)
  else if (agentId) void lateHandBack(host, agentId).then(ok => (ok ? workerFinished(host, agentId, answer, end, tokens, cost) : stoppedHandBack(host, agentId, tokens, cost))).catch(() => undefined)
}

// ---------------- commands ----------------

type TaskDo = Extract<Command, { kind: 'task-do' }>

/** The lead's tool (and its input) that does /<name>-task T-5 <verb>: the same calls as the task page's buttons. */
export function taskDoTool(id: string, c: TaskDo): [string, In] {
  switch (c.verb) {
    case 'pause':
      return ['pause', { task: id, reason: 'paused by the owner' }]
    case 'resume':
    case 'retry':
      return [c.verb, { task: id }]
    case 'drop':
      return ['drop', { task: id, reason: c.reason || 'dropped by the owner' }]
    case 'merged':
      return ['merged', { task: id, by: 'the owner' }]
    case 'review':
      return ['change', { task: id, needs_review: !!c.on }]
    case 'stash':
    case 'todo':
      return ['change', { task: id, backlog: c.verb === 'stash' }]
    case 'role':
      return ['change', { task: id, role: c.role ?? '' }]
    case 'note':
      return ['approve', { task: id, keep_note: true }]
  }
}

/** What the lead is told the owner did with /<name>-task T-5 <verb> (the tool's answer follows). */
function taskDoLine(id: string, c: TaskDo): string {
  switch (c.verb) {
    case 'pause': return `The owner paused ${id}`
    case 'resume': return `The owner resumed ${id}`
    case 'retry': return `The owner retried ${id}`
    case 'drop': return `The owner dropped ${id}${c.reason ? ` ("${brief(c.reason)}")` : ''}`
    case 'merged': return `The owner marked ${id} done: its work was already merged outside the board`
    case 'review': return `The owner turned needs_review ${c.on ? 'on' : 'off'} for ${id}`
    case 'stash': return `The owner moved ${id} to the backlog`
    case 'todo': return `The owner moved ${id} from the backlog to todo`
    case 'role': return `The owner set the role of ${id} to ${c.role}`
    case 'note': return `The owner chose Keep as a note for ${id}`
  }
}

/** What a slash command answers: its text, and whether it is only shown to the owner (not given to the lead). */
export type CommandAnswer = { text: string; isTextDisplayOnly?: true }

/**
 * A slash command runs (`command` without the slash, and its arguments). Every one of symcc's starts with its name
 * (see parseCommand): /<name> opens the panel, /<name>-<word> does one thing. null: not symcc's, the host runs it.
 */
export async function runCommand(host: Host, command: string, args: string): Promise<CommandAnswer | null> {
  const isStats = command === `${S.N.name}-stats`
  const isDoctor = command === `${S.N.name}-doctor`
  if (!isStats && !isDoctor && !commandNames(S.N.name).includes(command)) return null
  // Before session start set the project folder (a plugin reload): learn it from the session first;
  // if it still isn't known, answer and write nothing (never a board or lock path from "/").
  if (!(await findRoot(host))) return { text: startingText(), isTextDisplayOnly: true }
  if (S.guardOnly) return { text: guardOnlyText(), isTextDisplayOnly: true }
  // T-858: with no board nothing is read or written (no stats file, no git): both point to /<name>-init
  if (isStats || isDoctor) {
    await refreshFresh(host)
    if (S.fresh) return { text: notSetUpAnswer(S.N.name), isTextDisplayOnly: true }
  }
  // /<name>-stats: a read-only text report (see statsText); it changes nothing on the board.
  if (isStats) return { text: await statsText(host, args ?? '').catch((err: Error) => `Could not build the stats: ${err.message}`), isTextDisplayOnly: true }
  // /<name>-doctor (T-676): checks .<name>/ and git; cleans up only with "fix" (all) or "fix <id> ..." (those)
  if (isDoctor) return { text: await doctor(host, args ?? '').catch((err: Error) => `${S.N.name} doctor failed: ${err.message}`), isTextDisplayOnly: true }
  // A broken board.json makes load throw (it is never written over): the commands that don't need the
  // board (help, opening the panel, a usage line) still work; the others answer with the reason.
  // T-844: /<name>-init comes before anything reads the session's board: a broken board above never blocks it
  const early = parseCommand(command, args, undefined, S.N.name)
  // T-844: a window that started with no board looks again: another window may have made the board since
  if (early && early.kind !== 'bad' && early.kind !== 'help') await refreshFresh(host)
  if (early?.kind === 'init') return { text: await initProject(host, t => tellLead(host, t), !!early.git), isTextDisplayOnly: true }
  const loaded = await load(host).then(
    board => ({ board, broken: '' }),
    (err: Error) => ({ board: null, broken: err.message }),
  )
  const cmd = parseCommand(command, args, loaded.board ? modeOf(loaded.board) : undefined, S.N.name)
  if (!cmd) return null
  const say = (text: string) => ({ text, isTextDisplayOnly: true as const })
  if (!loaded.board && !['bad', 'help', 'open', 'tasks'].includes(cmd.kind)) return say(`${loaded.broken} Then try again.`)
  const b = loaded.board!
  // T-795: in a folder with no board only /<name>-init (and help) work; everything else points to it
  if (S.fresh && !['bad', 'help'].includes(cmd.kind)) return say(notSetUpAnswer(S.N.name))
  switch (cmd.kind) {
    case 'bad':
      return say(cmd.message)
    case 'help':
      return say(manual(cmd.topic, host.features))
    case 'open':
    case 'tasks':
      // a host with no panel: the text board, as the board tool answers it (or why the board can't be read)
      if (!host.features.panel) return say(loaded.board ? boardText(b, Date.now(), shortHome(S.root, S.home), S.N.name, undefined, { driving: S.driving }, S.version) : `${loaded.broken} Then try again.`)
      await openPane(host, { tab: cmd.kind === 'tasks' ? 'tasks' : 'live' })
      return say(boardOpened())
    case 'scouts': {
      const defs = await scheduleScouts(host)
      await publish(host, await load(host))
      // Open the panel on the Scouts view; the text list below is the fallback when it can't be placed.
      const placed = await openPane(host, { tab: 'scouts' }).then(r => r?.isPlaced ?? false).catch(() => false)
      const skipped = unreadableScoutsText()
      const withSkipped = (text: string) => (skipped ? `${text}\n${skipped}` : text)
      if (placed) return say(withSkipped(`Scouts opened: Enter opens a scout, t tasks, b goes back to the tasks.`))
      if (!defs.length && skipped) return { text: skipped }
      if (!defs.length) return { text: `No scouts yet. Add one as ${S.N.scouts}/<name>.md:\n---\nevery_minutes: 30\n---\nLook for missing tests around risky code.` }
      return { text: defs.map(d => `${d.name}: ${everyText(d.every_minutes)}${d.warning ? ` (${d.warning})` : ''}${scoutState.get(d.name)?.last_run ? `, last ran ${scoutState.get(d.name)!.last_run!.slice(11, 16)}` : ''}${scoutState.get(d.name)?.running ? ' (running now)' : ''}${scoutState.get(d.name)?.paused ? ' (paused)' : ''}`).join('\n') + (skipped ? `\n${skipped}` : '') }
    }
    case 'scout':
      return { text: await runScoutNow(host, cmd.name) }
    case 'scout-pause':
      return say(await setScoutPaused(host, cmd.name, cmd.paused))
    case 'scout-edit': {
      // the same edit as the lead's scouts tool: the other parts of the file are kept, the scouts are rescheduled
      const part = cmd.field === 'every' ? { every_minutes: cmd.value } : cmd.field === 'model' ? { model: cmd.value } : { prompt: cmd.value }
      return say(await leadScouts(host, { action: 'edit', name: cmd.name, ...part }))
    }
    case 'scout-new': {
      // the lead's scouts tool's add, with the panel's new scout's timer (NEW_SCOUT_EVERY)
      const r = await leadScouts(host, { action: 'add', name: cmd.name, every_minutes: NEW_SCOUT_EVERY, prompt: cmd.prompt })
      if (r.startsWith('added')) noteForLead(`The owner added scout ${cmd.name}: ${brief(r)}`)
      return say(r)
    }
    case 'def':
    case 'def-add':
    case 'def-edit':
    case 'def-save': {
      // the lead's roles and kinds tools (changeRole, changeKind); add starts from the panel's template, edit changes
      // one field, save several in one edit (as the panel's Save: a bad value saves none)
      const input =
        cmd.kind === 'def' ? { action: cmd.action, name: cmd.name }
        : cmd.kind === 'def-add' ? { action: 'add', name: cmd.name, ...(cmd.def === 'role' ? NEW_ROLE_TEMPLATE : NEW_KIND_TEMPLATE) }
        : cmd.kind === 'def-save' ? { action: 'edit', name: cmd.name, ...cmd.fields }
        : { action: 'edit', name: cmd.name, [cmd.field]: cmd.value }
      const r = await (cmd.def === 'role' ? changeRole : changeKind)(host, input)
      if (r.ok) {
        const what = cmd.kind === 'def' ? cmd.action : cmd.kind === 'def-add' ? 'add' : cmd.kind === 'def-save' ? `edit ${Object.keys(cmd.fields).join(', ')}` : `edit ${cmd.field}`
        noteForLead(`The owner changed ${cmd.def} ${cmd.name} (${what}): ${brief(r.text)}`)
        // the board's view carries the roles and kinds for a panel that draws from it (OpenCode's view.json)
        await publish(host, await load(host))
      }
      return say(r.text)
    }
    case 'setup-git':
      // the lead's setup_git; it publishes the board and tells the lead itself
      return say(await setupGit(host, 'you'))
    case 'orgmem-delete': {
      const r = await deleteOrgMem(host, cmd.n, undefined, cmd.key)
      // the board's view carries the notes for a panel that draws from it (OpenCode's view.json)
      if (r.ok) await publish(host, await load(host))
      return say(r.text)
    }
    case 'settings': {
      S.settingEdit = null
      S.settingPick = null
      const placed = await openPane(host, { tab: 'settings' }).then(r => r?.isPlaced ?? false).catch(() => false)
      if (placed) return say(`Settings opened: Enter on a row changes it, t tasks, s scouts, b goes back to the tasks.`)
      return say(settingsText({ ...b, notify: notifyOf(b, await playable(host), S.root) }, S.N.name, S.root))
    }
    case 'set':
      return say(await ownerSettings(host, cmd.input, `with /${S.N.name}-settings`))
    case 'disable':
    case 'enable':
      if (cmd.here) return say(cmd.kind === 'enable' ? await enableHere(host, t => tellLead(host, t)) : await disableHere(host))
      return say(await setSymcc(host, cmd.kind === 'enable'))
    case 'drive':
      return say(await driveHere(host))
    case 'mode': {
      const r = await setBoardMode(host, cmd.mode, 'you')
      noteForLead(`The owner set the board mode to ${cmd.mode}: ${brief(r)}`)
      return say(r)
    }
    case 'show': {
      const t = find(b, cmd.id)
      if (!t) {
        // not on the board: it may have been moved to archive.json (read-only, shown as text)
        const old = await findArchived(host, cmd.id)
        if (!old) return say(`${cmd.id} is not on the board.`)
        return say(`${old.id} is archived (in ${S.N.archiveFile}; read-only).\n${taskText(old, false, b.tasks, undefined, b.archived_done)}`)
      }
      await openPane(host, { tab: 'tasks', task: t.id })
      return say(taskText(t, [...workers.values()].some(w => w.task === t.id), b.tasks, await latestReport(host, t), b.archived_done))
    }
    case 'task-do': {
      const t = find(b, cmd.id)
      if (!t) return say((await findArchived(host, cmd.id)) ? `${cmd.id} is archived.` : `${cmd.id} is not on the board.`)
      const r = await runTool(host, ...taskDoTool(t.id, cmd)).catch((err: Error) => `error: ${err.message}`)
      noteForLead(`${taskDoLine(t.id, cmd)}: ${brief(r)}`)
      return say(r)
    }
    case 'approve':
    case 'reject': {
      const t = find(b, cmd.id)
      if (!t) return say((await findArchived(host, cmd.id)) ? `${cmd.id} is archived.` : `${cmd.id} is not on the board.`)
      if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}).`)
      const r = await runTool(host, cmd.kind, cmd.kind === 'reject' ? { task: t.id, reason: cmd.reason } : { task: t.id }).catch((err: Error) => `error: ${err.message}`)
      noteForLead(cmd.kind === 'approve' ? `The owner approved ${t.id}: ${brief(r)}` : `The owner rejected ${t.id} ("${brief(cmd.reason)}"): ${brief(r)}`)
      return say(r)
    }
    case 'diff': {
      const t = find(b, cmd.id)
      if (!t) return say((await findArchived(host, cmd.id)) ? `${cmd.id} is archived.` : `${cmd.id} is not on the board.`)
      if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}); /${S.N.name}-diff shows the changes of a task in review.`)
      try {
        const files = await changedFiles(host, intoOf(t), t)
        if (!cmd.file) return say(statText(t.id, files, S.N.name))
        const f = cmd.file.replace(/^\.\//, '')
        if (!files.some(x => x.file === f)) return say(`${t.id} did not change ${f}. Changed: ${files.map(x => x.file).join(', ') || 'nothing'}`)
        const text = await changesText(host, intoOf(t), t, f)
        return say(cutDiff(text, t.id, 5000, f, S.N.name).join('\n') || `${f}: no text changes (binary?)`)
      } catch (err) {
        return say(`Could not read the changes of ${t.id}: ${(err as Error).message}`)
      }
    }
  }
  return null
}
