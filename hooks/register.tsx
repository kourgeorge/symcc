// symcc (the name comes from plugin.json, see name.ts): a shared task board, the main chat as its lead, workers that build tasks in
// parallel in their own Git worktrees and merge what passes the tests, and scouts you
// define in .<name>/scouts/*.md that do what their file asks on a timer.
//
// How work flows:
//   you ⇄ lead (the main chat)  ──board tools──▶  .<name>/board.json
//   a task is ready  ──▶  worktree + background worker subagent
//   worker done      ──▶  commit · scope check · tests · merge into main  ──▶  the lead is told
//   scout on a timer ──▶  report    ──▶  the lead is told and decides what goes on the board
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SymccMode, SymccScout, SymccTask, SymccView } from '../types'
import { DEFAULT_NAME, cleanName, dataDir, namesFor } from './name'
import type { Seg } from './board'
import {
  LEAD_BEAT_MS,
  leftoverTmpFiles,
  parseScoutMemory,
  scoutMemoryText,
  workerName,
  workerDescription,
  scoutAgentName,
  scoutDescription,
  addTask,
  fromText,
  evidenceText,
  makeOrigin,
  emptyHeard,
  type Heard,
  boardText,
  boardBrand,
  statusLine,
  boardTitle,
  boardWhere,
  SCOUT_REPORT_CHARS,
  scoutFile,
  scoutHowTo,
  scoutLeadMessage,
  scoutPrompt,
  recentClosed,
  scoutReport,
  scoutRow,
  sortScouts,
  bannerLines,
  bannerRule,
  listRule,
  branchWarning,
  missingBranchText,
  branchesToDelete,
  worktreesToRemove,
  cleanupText,
  noBranchText,
  gitStateOf,
  gitNote,
  noGitText,
  setupAskText,
  gitignoreBase,
  gitignoreWith,
  parseLsTree,
  riskyFiles,
  ignoreLineFor,
  setupDoneText,
  type GitState,
  startBranch,
  type BannerTone,
  shortHome,
  newestFirst,
  boardSections,
  groupLabel,
  backlogHeader,
  backlogMoreLabel,
  BACKLOG_SHOWN,
  localOffset,
  emptyBoard,
  find,
  isLockStale,
  leadText,
  liveWorkersFor,
  mayStart,
  type AgentInfo,
  liveDriver,
  lockText,
  normId,
  onConflict,
  MAX_CONFLICT_TRIES,
  DEFAULT_AUTO_RETRIES,
  openOnStart,
  spokenDone,
  voiceOn,
  symccOn,
  setEnabled,
  offAnswer,
  offStatusLine,
  onTestFail,
  testTail,
  startRun,
  endRun,
  usageTokens,
  sumRuns,
  fmtRun,
  fmtTotal,
  ownedHere,
  orphanMove,
  outOfScope,
  outOfScopeText,
  parseNeedFiles,
  needFilesQuestion,
  parseBoard,
  parseScout,
  parseRole,
  roleSkipReason,
  skippedRoleNote,
  roleMark,
  detailRows,
  detailRowLines,
  foldDetails,
  DETAILS_KEY,
  wrapSegs,
  STATUS_BADGE,
  STATUS_MARK,
  roleChoices,
  mergeRoles,
  findRole,
  checkRole,
  roleOf,
  tryLabel,
  commitMessage,
  addCommits,
  taskCommits,
  commitText,
  roleSection,
  rolesLeadText,
  type RoleDef,
  scoutText,
  scoutNameError,
  scoutDraftError,
  everyMinutesOf,
  parseLead,
  patchTask,
  ready,
  isNotReady,
  onNotReady,
  resetDoing,
  relabelSession,
  whoDrives,
  backToTodo,
  needsReview,
  rejectTask,
  stashTask,
  promoteTask,
  reviewTask,
  setMode,
  modeOf,
  isMode,
  modeLabel,
  modeButton,
  nextMode,
  parseDiffStat,
  statText,
  cutDiff,
  diffKinds,
  DIFF_COLOR,
  DIFF_LINES,
  parseCommand,
  commandNames,
  modeText,
  needsYouFirst,
  type DiffFile,
  ENDED_STATUSES,
  OPEN,
  STATUS_WORD,
  statusCounts,
  type Board,
  type ScoutDef,
  SETTINGS,
  applySettings,
  parseSettingValue,
  settingSetText,
  settingValue,
  settingsText,
  type SettingChange,
  type SettingName,
  type SettingsInput,
} from './board'

type $ = EngineInterface

// ---------------- the plugin's name ----------------
// Everything made from the name (data folder, branches, agent types, tool names, text) comes
// from N. It starts as DEFAULT_NAME and is set once, from $.plugin.name (plugin.json), the
// first time any hook runs: every hook calls useName($) first.

// The one exception: the panel's state values. Claude Code reads which values a plugin keeps
// from its code before it runs, so their owner must be written out here as text. It must be
// the plugin's name: on a rename, change it in these four lines and in types/index.d.ts too.
/** which task the board panel has open; '' = the list */
const opened = atom({ plugin: 'symcc', key: 'opened' } as const, '')
/** which view the board panel shows: 'scouts', or anything else for the tasks; kept while the panel is open */
const tab = atom({ plugin: 'symcc', key: 'tab' } as const, '')
/** which scout the Scouts view has open; '' = the list */
const scoutOpen = atom({ plugin: 'symcc', key: 'scout' } as const, '')
const view = atom({ plugin: 'symcc', key: 'view' } as const, { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] } as SymccView, { shape: 'view-1' })
let N = namesFor(DEFAULT_NAME)
let named = false

/** Takes the plugin's name from plugin.json (via $.plugin.name), once; DEFAULT_NAME if it has none. */
function useName($: $) {
  if (named) return
  named = true
  const name = cleanName($.plugin.name)
  if (name === N.name) return
  N = namesFor(name)
}

/** The view as published: SymccView plus the facts the panel's banner shows. */
type PaneView = SymccView & Partial<Pick<Board, 'target_branch' | 'max_parallel' | 'max_minutes' | 'auto_retries' | 'open_on_start' | 'voice' | 'enabled'> & { driving: boolean; branch_note: string; git_state: GitState }>

// ---------------- what this module holds while it is loaded ----------------
// A hot reload starts these over: the board itself is always on disk, and a task
// whose worker was lost to a reload goes back to "todo" at session.start.
let root = ''
/** whether the plugin is on, as the board said when it was last read (see load); for the places that can't wait */
let enabledNow = true
/** the worker roles: the plugin's roles/ with the project's .<name>/roles/ over them (see loadRoles) */
let roles: RoleDef[] = []
/** the role files already reported as skipped (file → reason), so the owner and the lead hear it once */
const skippedRoles = new Map<string, string>()
/** the home folder, to shorten it to "~" where the project's path is shown */
let home = ''
type Worker = { task: string; worktree: string; branch: string; since: number }
const workers = new Map<string, Worker>() // agentId → work
/** tasks this copy has claimed and is starting a worker for (not yet in `workers`) */
const starting = new Set<string>()
/** tasks whose worker finished and whose work is being checked and merged now */
const finishing = new Set<string>()
const scoutRuns = new Map<string, string>() // agentId → scout name
/** agents this plugin has stopped: every tool they try is refused, so they can't change anything and end soon */
const stopped = new Set<string>()
/** failed tasks the lead has already been reminded about (task id → its updated_at then) */
const reminded = new Map<string, string>()
let watchdog: { cancel(): void } | null = null
const scoutState = new Map<string, SymccScout>()
const timers: { cancel(): void }[] = []
const leadQueue: string[] = []
let leadTimer: { cancel(): void } | null = null
let writing: Promise<unknown> = Promise.resolve()
/** this session's id, and whether it drives the board (only the driver starts work; see .<name>/lead.json) */
let me = ''
let driving = false
let beat: { cancel(): void } | null = null
/** the Settings view's edit box (numbers, test_commands): which setting, what is typed, the last error */
let settingEdit: { name: SettingName; value: string; error: string } | null = null
/** the Settings view's pick list (mode, target_branch): which setting and its choices */
let settingPick: { name: SettingName; options: string[] } | null = null
/** set by pump when target_branch doesn't exist (no work starts then); '' when it does */
let missingBranch = ''
/** the target_branch the lead was last told is missing, so it is told once, not every check */
let toldMissing = ''
/** what the last git check found (see probeGit); work starts only when 'ok' */
let gitState: GitState = 'ok'
/** the git state the lead was last told about, so it is told once, not every check */
let toldGit: GitState = 'ok'
/** set while setupGit runs, so a second press waits */
let settingUp = false
/** set at the end of session.start: until then pump starts no work (the worker type may not be registered yet) */
let startupDone = false
/** task id → spawns in a row that failed only because the plugin wasn't ready yet (see isNotReady) */
const notReady = new Map<string, number>()
/** the older days ("YYYY-MM-DD") the owner has opened in the board panel; kept only while the panel is open */
const openDays = new Set<string>()
/** whether the owner has opened the Backlog section in the board panel (folded by default); folded again when the panel closes */
let backlogOpen = false
/** whether the owner asked to see every backlog item (not just the first BACKLOG_SHOWN); reset when the panel closes */
let backlogAll = false
/** the scout being edited in the board panel (its edit mode), or null; `isNew` for one made with "new scout" */
type ScoutDraft = { scout: string; isNew: boolean; every: string; model: string; body: string; error: string }
let draft: ScoutDraft | null = null
/** the "new scout" name box on the Scouts view, or null when it isn't shown */
let naming: { name: string; error: string } | null = null
/** the changes of a task in review shown in the board panel: `file` '' = all files; null = not shown */
let diffOpen: { task: string; file: string } | null = null
/** the reason box for rejecting a task in review from the board panel, or null when it isn't shown */
let rejecting: { task: string; reason: string } | null = null
/** the role pick list on an open task in the board panel: the task and the role names; null when it isn't shown */
let rolePick: { task: string; options: string[] } | null = null
/** whether the open task's whole "What to do" text is shown; back to folded each time a task is opened */
let detailsOpen = false
/** the task the board panel showed last ('' = the list), to fold the text again when another task opens */
let shownTask = ''

/**
 * What reached the lead in this session, for a new task's evidence (see evidenceText): the owner's
 * last typed prompt (from prompt.submit) and when each scout's and worker's report was sent to the lead.
 * Kept in memory only: a new session starts empty.
 */
const heard: Heard = emptyHeard()

// ---------------- the board on disk ----------------

const now = () => new Date().toISOString()
const path = (rel: string) => `${root}/${rel}`

async function load($: $): Promise<Board> {
  const exists = await $.fs.exists(path(N.boardFile))
  // A new board starts on the branch the owner has checked out (existing boards keep theirs).
  const b = exists ? parseBoard(await $.fs.read(path(N.boardFile))) : emptyBoard(await firstBranch($))
  enabledNow = symccOn(b)
  return b
}

/** Is the plugin on for this project? Read from the board file each time (a missing or broken board: on). Never throws. */
async function isOn($: $): Promise<boolean> {
  const text = await $.fs.read(path(N.boardFile)).catch(() => null)
  return (enabledNow = symccOn(parseBoard(typeof text === 'string' ? text : null)))
}

/**
 * Take .<name>/board.lock so no other session reads or writes the board meanwhile.
 * The lock is written to its own temp file first and then hard-linked into place:
 * `ln` fails if the lock exists, so only one session can win, and nobody ever sees
 * a half-written lock. A stale lock (its session died) is removed and taken over.
 */
async function takeLock($: $): Promise<string> {
  const lock = path(N.lockFile)
  const me = `${await $.session.id().catch(() => 'unknown')}:${Math.random().toString(36).slice(2, 10)}`
  const mine = lockText(me, Date.now())
  const tmp = `${lock}.${me.replace(/[^\w.-]/g, '_')}.tmp`
  await $.fs.write(tmp, mine)
  try {
    const until = Date.now() + 5_000
    for (;;) {
      if ((await $.process.run(['ln', tmp, lock])).exitCode === 0) return mine
      const held = await $.fs.read(lock).catch(() => null)
      const st = await $.fs.stat(lock).catch(() => null)
      if (held !== null && isLockStale(held, Date.now(), st?.mtimeMs)) {
        // remove it only if it is still the same stale lock we just read
        if ((await $.fs.read(lock).catch(() => null)) === held) await $.process.run(['rm', '-f', lock])
        continue
      }
      if (Date.now() > until) throw new Error(`the board is busy (another session holds ${N.lockFile}); try again`)
      await $.clock.sleep(100)
    }
  } finally {
    await $.process.run(['rm', '-f', tmp]).catch(() => undefined)
  }
}

async function dropLock($: $, mine: string) {
  const lock = path(N.lockFile)
  if ((await $.fs.read(lock).catch(() => null)) === mine) await $.process.run(['rm', '-f', lock]).catch(() => undefined)
}

/** Write to a temp file, then rename it over board.json, so a crash mid-write never leaves a broken board. */
async function saveBoard($: $, b: Board) {
  const file = path(N.boardFile)
  const tmp = `${file}.tmp`
  await $.fs.write(tmp, JSON.stringify(b, null, 2) + '\n')
  // $.fs has no rename; mv within one folder is an atomic rename
  const r = await $.process.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) throw new Error(`couldn't save the board: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
}

/**
 * Every change goes through here, one at a time, so two workers finishing together
 * never lose an update; the lock file does the same between sessions.
 */
function change<T>($: $, fn: (b: Board) => [Board, T] | Board): Promise<T> {
  return locked($, async () => {
    const before = await load($)
    const out = fn(before)
    const [after, value] = Array.isArray(out) ? out : [out, undefined as T]
    await saveBoard($, after)
    return [after, value] as const
  }).then(async ([after, value]) => {
    await publish($, after)
    return value
  })
}

/** Runs fn while holding the board lock, one at a time within this session too. */
function locked<T>($: $, fn: () => Promise<T>): Promise<T> {
  const run = writing.then(async () => {
    const mine = await takeLock($)
    try {
      return await fn()
    } finally {
      await dropLock($, mine)
    }
  })
  writing = run.catch(() => undefined)
  return run
}

// ---------------- who drives the board ----------------
// Only one session (the driver) starts workers, merges, runs scouts and the regular check.
// It keeps .<name>/lead.json fresh; the others read and change the board but start nothing.

async function writeLead($: $, text: string) {
  const file = path(N.leadFile)
  const tmp = `${file}.${me.replace(/[^\w.-]/g, '_')}.tmp`
  await $.fs.write(tmp, text)
  const r = await $.process.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) throw new Error(`couldn't write ${N.leadFile}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
}

/**
 * Looks at lead.json and acts on it: becomes the driver if nobody drives, refreshes the
 * heartbeat if this session drives, takes over if the driver's heartbeat went stale, and
 * steps down if another session drives. `fresh` = this copy of the plugin just loaded,
 * so any worker it had is gone. Returns whether this session drives now.
 */
async function claimLead($: $, fresh = false): Promise<boolean> {
  const was = driving
  const [move, leadBefore] = await locked($, async () => {
    const text = await $.fs.read(path(N.leadFile)).catch(() => null)
    const m = whoDrives(text, me, Date.now())
    if (m !== 'follow') await writeLead($, leadText(me, Date.now()))
    return [m, text] as const
  })
  driving = move !== 'follow'
  if (driving && (!was || fresh)) {
    // Workers the old driver (or an earlier load of this plugin) left behind are stopped
    // first, and their tasks go back to "todo", so a task never has two workers.
    const orphans = await stopOrphans($, leadBefore)
    if (orphans.length) $.ui.toast(N.toast(`stopped ${orphans.length} old worker${orphans.length > 1 ? 's' : ''} left behind`))
    // A stopped worker may still be running for a while: wait until it has really ended.
    // A task whose old worker is still alive after that stays "doing"; the regular check
    // sends it back to "todo" once that worker has ended, so a task never has two workers.
    const alive = await waitEnded($, orphans, ORPHAN_WAIT_MS)
    const note = move === 'takeover' ? 'restarted: the session driving the board stopped answering' : move === 'keep' ? 'restarted: the plugin reloaded and the old worker was gone' : 'restarted after Claude Code was reopened'
    // Only tasks of this session, of a session that no longer drives, or with no session
    // recorded go back: a task whose worker runs in the live driver keeps it.
    if (await $.fs.exists(path(N.boardFile)))
      await change($, b => resetDoing(b, me, leadBefore, Date.now(), note, now(), b.tasks.filter(t => liveWorkersFor(t, alive, N.name).length > 0 || [...workers.values()].some(w => w.task === t.id)).map(t => t.id)))
    if (move === 'takeover' && !fresh) $.ui.toast(N.toast('the session driving the board stopped answering; this session drives it now'))
  }
  if (was && !driving) {
    // Another session took over (this one stopped answering for too long): its workers own the tasks now.
    await haltAll($, 'another session drives the board now')
    $.ui.toast(N.toast('another session drives the board now; this one only shows and changes it'))
  }
  if (driving) {
    // A task stopped, dropped or changed from another session: stop its worker here.
    const b = await load($)
    await haltWorkers($, 'the task was changed on the board', w => find(b, w.task)?.status !== 'doing')
  }
  if (was !== driving || fresh) await publish($, await load($))
  return driving
}

/** On session end the driver lets go of lead.json, so another session can take over at once. */
async function releaseLead($: $) {
  if (!driving) return
  driving = false
  await locked($, async () => {
    const file = path(N.leadFile)
    if (parseLead(await $.fs.read(file).catch(() => null))?.session === me) await $.process.run(['rm', '-f', file])
  }).catch(() => undefined)
}

/**
 * After /clear: this process goes on under a new session id. lead.json and this session's
 * "doing" tasks move to the new id (so our own live workers aren't taken for a dead
 * session's), and the board panel is shown again for the new session.
 */
async function handOver($: $) {
  const old = me
  const fresh = await $.session.id().catch(() => old)
  if (fresh && fresh !== old) {
    me = fresh
    if (driving)
      await locked($, async () => {
        const l = parseLead(await $.fs.read(path(N.leadFile)).catch(() => null))
        if (!l || l.session === old) await writeLead($, leadText(me, Date.now()))
      })
    if (await $.fs.exists(path(N.boardFile))) await change($, b => relabelSession(b, old, me))
  }
  const b = await load($)
  await publish($, b)
  if (openOnStart(b)) await openPane($, { focus: false, quiet: true })
}

async function publish($: $, b: Board) {
  const working = [...workers.values()].map(w => ({ task: w.task, since: w.since }))
  // Which branch the owner is on is looked at here, once per publish, not on every render.
  const branch_note = gitNote(gitState) || missingBranch || branchWarning(b.target_branch, await currentBranch($))
  // The banner's facts ride along in the view (extra fields; SymccView itself is shared with other code).
  const v: PaneView = { tasks: b.tasks, working, scouts: [...scoutState.values()], mode: modeOf(b), test_commands: b.test_commands, target_branch: b.target_branch, max_parallel: b.max_parallel, max_minutes: b.max_minutes, auto_retries: b.auto_retries, open_on_start: openOnStart(b), voice: voiceOn(b), enabled: symccOn(b), driving, branch_note, git_state: gitState }
  await update($, view, () => v)
  $.ui.status(symccOn(b) ? statusLine(b, driving, branch_note, modeOf(b)) : offStatusLine(N.name))
}

// ---------------- telling the lead ----------------
// Workers and scouts report to the main chat as a prompt from this plugin. Several
// reports close together go in one message, sent when the chat is idle.

function tellLead($: $, text: string) {
  if (!enabledNow) return // the plugin is off: no "[name] Update" messages
  leadQueue.push(text)
  if (leadTimer) return
  leadTimer = $.clock.after(1500, () => {
    leadTimer = null
    const body = leadQueue.splice(0).join('\n\n')
    if (!body || !enabledNow) return
    void $.prompt.submit({ text: `[${N.name}] Update from the team:\n\n${body}\n\nDecide what happens next on the board (use the ${N.name} tools), then tell me briefly.` }).catch(() => undefined)
  })
}

// ---------------- saying it out loud ----------------

/** task ids merged but not yet said; joined into one line so lines never talk over each other */
const sayQueue: string[] = []
let sayTimer: { cancel(): void } | null = null
let saying = false
/** how this machine speaks: a command that takes the text last, or null for silence (found once) */
let speaker: Promise<string[][]> | null = null

function speakers($: $): Promise<string[][]> {
  speaker ??= $.process
    .run(['uname', '-s'], { timeoutMs: 5000 })
    .then(r => {
      const os = String(r.stdout ?? '').trim()
      if (os === 'Darwin') return [['say', '-r', '200']]
      if (os === 'Linux') return [['spd-say', '-w'], ['espeak']]
      return []
    })
    .catch(() => [])
  return speaker
}

/** Says "T-3 done" for a merged task, if this session drives the board and voice is on. Never waits, never shows an error. */
function sayDone($: $, b: Board, id: string) {
  if (!driving || !voiceOn(b) || !symccOn(b)) return
  sayQueue.push(id)
  if (sayTimer || saying) return
  sayTimer = $.clock.after(1500, () => {
    sayTimer = null
    void sayNext($)
  })
}

async function sayNext($: $) {
  if (saying) return
  const text = spokenDone(sayQueue.splice(0))
  if (!text) return
  saying = true
  try {
    for (const cmd of await speakers($)) {
      const r = await $.process.run([...cmd, text], { timeoutMs: 30_000 }).catch(() => null)
      if (r && r.exitCode === 0) break
    }
  } catch {
    // stay silent
  } finally {
    saying = false
  }
  if (sayQueue.length) void sayNext($)
}

// ---------------- git ----------------

async function git($: $, args: string[], cwd = root, timeoutMs = 120_000) {
  return $.process.run(['git', ...args], { cwd, timeoutMs })
}
async function gitOk($: $, args: string[], cwd = root, timeoutMs = 120_000) {
  const r = await git($, args, cwd, timeoutMs)
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
  return r.stdout.trim()
}

/** The branch checked out in the project, '' when none (a detached HEAD). */
async function currentBranch($: $): Promise<string> {
  if (!root) return ''
  return (await git($, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => null))?.stdout.trim() ?? ''
}

/** The project's local branches. */
async function branchList($: $): Promise<string[]> {
  const r = await git($, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => null)
  return (r?.stdout ?? '').split('\n').map(x => x.trim()).filter(Boolean)
}

/** Whether `name` is a local branch. */
async function branchExists($: $, name: string): Promise<boolean> {
  if (!name || name.startsWith('-')) return false
  return (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${name}`]).catch(() => null))?.exitCode === 0
}

/** The branch a new board merges into: see startBranch. */
async function firstBranch($: $): Promise<string> {
  if (!root) return emptyBoard().target_branch
  const origin = (await git($, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']).catch(() => null))?.stdout.trim() ?? ''
  return startBranch(await currentBranch($), origin, await branchList($))
}

/**
 * Whether target_branch exists, so work may start. If not, nothing starts or fails: the lead
 * is told once (per branch name) and the banner and status line say so until it is fixed.
 */
async function targetReady($: $, b: Board): Promise<boolean> {
  const ok = await branchExists($, b.target_branch)
  const note = ok ? '' : missingBranchText(b.target_branch)
  if (note !== missingBranch) {
    missingBranch = note
    await publish($, b)
  }
  if (ok) toldMissing = ''
  else if (toldMissing !== b.target_branch) {
    toldMissing = b.target_branch
    const some = (await branchList($)).slice(0, 5)
    tellLead($, `No work can start: the ${N.name} board merges into branch '${b.target_branch}', which doesn't exist in this project. Set an existing branch with ${N.name} settings target_branch${some.length ? ` (branches here: ${some.join(', ')})` : ''}.`)
  }
  return ok
}

/** Looks whether git is installed, the project is inside a git work tree, and it has a commit. */
async function probeGit($: $): Promise<GitState> {
  if (!root) return 'ok'
  const run = (args: string[]) => git($, args, root, 15_000).catch(() => null)
  const v = await run(['--version'])
  const hasGit = !!v && v.exitCode === 0
  const inside = hasGit && (await run(['rev-parse', '--is-inside-work-tree']))?.stdout.trim() === 'true'
  const hasHead = inside && (await run(['rev-parse', '--verify', '-q', 'HEAD']))?.exitCode === 0
  return gitStateOf({ hasGit, inside, hasHead })
}

/**
 * Whether git is ready for work (a repo with a commit). If not, nothing starts or fails: the
 * banner and status line say so, and the lead (only the driver) is told once per state: how
 * to install git, or the question whether to set up a repo.
 */
async function gitReady($: $, b?: Board): Promise<boolean> {
  const s = await probeGit($)
  if (s !== gitState) {
    gitState = s
    await publish($, b ?? (await load($)))
  }
  if (s === 'ok') toldGit = 'ok'
  else if (driving && toldGit !== s) {
    toldGit = s
    tellLead($, s === 'no-git' ? noGitText(N.name) : setupAskText(s, N.name))
  }
  return s === 'ok'
}

/**
 * Sets up git in the project, once the owner said yes: git init on main (if there is no repo),
 * a .gitignore with the data folder and common safe lines, and a first commit of the current
 * files, leaving out files that look like secrets or are over 50 MB (they go in .gitignore).
 * Never pushes, never adds a remote. Then target_branch is set to the new branch and work starts.
 */
async function setupGit($: $, who: string): Promise<string> {
  if (settingUp) return 'git is being set up already'
  const s = await probeGit($)
  if (s === 'ok') return 'git is set up already: this folder is a git repo with commits'
  if (s === 'no-git') return noGitText(N.name)
  settingUp = true
  try {
    const init = s === 'no-repo'
    if (init) {
      const r = await git($, ['init', '-q', '-b', 'main'])
      if (r.exitCode !== 0) {
        // an old git has no -b: init, then point HEAD at main
        await gitOk($, ['init', '-q'])
        await gitOk($, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
      }
    }
    // The branch the first commit lands on: whatever HEAD points at (main after our init).
    const branch = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim() || 'main'
    // The repo's top: with an existing repo it may be above this folder.
    const top = (await gitOk($, ['rev-parse', '--show-toplevel'])) || root
    const ignoreFile = `${top}/.gitignore`
    const old = (await $.fs.exists(ignoreFile)) ? await $.fs.read(ignoreFile) : null
    const rel = top === root ? N.dir : `${root.slice(top.length + 1)}/${N.dir}`
    let text = gitignoreWith(old, gitignoreBase(rel))
    if (text !== (old ?? '')) await $.fs.write(ignoreFile, text)
    // Stage everything, look at what would be committed, and take out the risky files.
    await gitOk($, ['add', '-A'], top)
    const tree = await gitOk($, ['write-tree'], top)
    const left = riskyFiles(parseLsTree((await git($, ['ls-tree', '-r', '-l', '-z', tree], top)).stdout))
    if (left.length) {
      text = gitignoreWith(text, left.map(x => ignoreLineFor(x.file)))
      await $.fs.write(ignoreFile, text)
      for (let i = 0; i < left.length; i += 100) await gitOk($, ['rm', '-q', '--cached', '--ignore-unmatch', '--', ...left.slice(i, i + 100).map(x => x.file)], top)
      await gitOk($, ['add', '--', '.gitignore'], top)
    }
    const files = (await gitOk($, ['ls-files', '--cached'], top)).split('\n').filter(Boolean).length
    await gitOk($, ['-c', `user.name=${N.author.name}`, '-c', `user.email=${N.author.email}`, 'commit', '-q', '--no-verify', '--allow-empty', '-m', `Initial commit (by ${N.name})`], top)
    await change($, b => ({ ...b, target_branch: branch }))
    missingBranch = ''
    toldMissing = ''
    toldGit = 'ok'
    gitState = 'ok'
    await publish($, await load($))
    const out = setupDoneText({ init, branch, files, left, gitignore: old === null ? 'made' : text === old ? 'kept' : 'added', name: N.name })
    if (who !== 'the lead') tellLead($, `The owner set up git from the board. ${out}`)
    void pump($)
    return out
  } finally {
    settingUp = false
  }
}

const worktreeDir = (id: string) => `${root}/${N.worktrees}/${id}`

async function prepareWorktree($: $, t: SymccTask, target: string) {
  const dir = worktreeDir(t.id)
  const branch = t.branch ?? N.branch(t.id)
  if (await $.fs.exists(`${dir}/.git`)) return { dir, branch }
  await git($, ['worktree', 'prune'])
  const has = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`])).exitCode === 0
  if (has) await gitOk($, ['worktree', 'add', dir, branch])
  else await gitOk($, ['worktree', 'add', '-b', branch, dir, target])
  return { dir, branch }
}

/**
 * Removes a task's worktree, but never while a live agent may still use it (`except` = the
 * worker that just finished there). Returns whether it was removed.
 */
async function removeWorktree($: $, taskId: string, dir: string, except?: string): Promise<boolean> {
  const agents = await agentsNow($)
  if (!agents) return false
  const t = find(await load($), taskId)
  if (liveWorkersFor({ id: taskId, agent: t?.agent }, agents, N.name).some(a => a.id !== except)) return false
  await git($, ['worktree', 'remove', '--force', dir])
  await git($, ['worktree', 'prune'])
  return true
}

/** whether the lead was told about a bigger cleanup already (once per session) */
let toldCleanup = false
/** task ids whose leftover folder was skipped for uncommitted changes (told once each) */
const keptDirty = new Set<string>()

/**
 * Part of the regular check: removes leftover worktrees of done and dropped tasks (never with
 * --force, never while a worker runs there) and deletes the branches of done tasks that git
 * lists as merged into the target branch. Only the plugin's own branches (N.branch) are touched.
 */
async function cleanupMerged($: $, b: Board) {
  const agents = await agentsNow($)
  if (!agents) return
  const busy = new Set([...workers.values()].map(w => w.task))
  const existing: string[] = []
  for (const t of b.tasks) if ((t.status === 'done' || t.status === 'dropped') && (await $.fs.exists(`${worktreeDir(t.id)}/.git`))) existing.push(t.id)
  let dirs = 0
  for (const id of worktreesToRemove(b.tasks, existing)) {
    const t = find(b, id)
    if (busy.has(id) || starting.has(id) || finishing.has(id) || approving.has(id) || liveWorkersFor({ id, agent: t?.agent }, agents, N.name).length) continue
    const dir = worktreeDir(id)
    const st = await git($, ['status', '--porcelain'], dir)
    if (st.exitCode !== 0) continue
    if (st.stdout.trim()) {
      if (!keptDirty.has(id)) tellLead($, `Note: ${id} is ${t?.status ?? 'closed'} but its folder ${N.dir}/worktrees/${id} has uncommitted changes, so I left it. Remove it by hand when it is no longer needed.`)
      keptDirty.add(id)
      continue
    }
    if ((await git($, ['worktree', 'remove', dir])).exitCode === 0) dirs++
  }
  await git($, ['worktree', 'prune'])
  const merged = await git($, ['branch', '--merged', b.target_branch, '--format=%(refname:short)'])
  let branches = 0
  if (merged.exitCode === 0) {
    for (const br of branchesToDelete(b.tasks, merged.stdout.split('\n'), N.branch(''))) if ((await git($, ['branch', '-d', br])).exitCode === 0) branches++
  }
  const text = toldCleanup ? '' : cleanupText(branches, dirs)
  if (text) {
    toldCleanup = true
    tellLead($, text)
  }
}

// ---------------- a task's changes, for review ----------------

/** The changes of a task: from where its branch left the target branch (the merge base) to the branch's tip. */
const diffRange = (target: string, t: Pick<SymccTask, 'id' | 'branch'>) => `${target}...${t.branch ?? N.branch(t.id)}`
/** read changes, by task, its last change and what was asked; forgotten when the panel closes */
const changesCache = new Map<string, Promise<string>>()

function gitDiff($: $, target: string, t: SymccTask, opts: string[], file = ''): Promise<string> {
  const key = `${t.id}|${t.updated_at}|${target}|${opts.join(' ')}|${file}`
  let p = changesCache.get(key)
  if (!p) {
    if (changesCache.size > 50) changesCache.clear()
    p = gitOk($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', ...opts, diffRange(target, t), ...(file ? ['--', file] : [])])
    changesCache.set(key, p)
    p.catch(() => changesCache.delete(key))
  }
  return p
}

/** The files a task changed, with +/- line counts (git diff --stat against the merge base). */
async function changedFiles($: $, target: string, t: SymccTask): Promise<DiffFile[]> {
  return parseDiffStat(await gitDiff($, target, t, ['--stat=1000,800']))
}

/** The diff of a task's changes (all files, or just `file`) against the merge base. */
const changesText = ($: $, target: string, t: SymccTask, file = '') => gitDiff($, target, t, [], file)

/** What checking (and maybe merging) a task's work came to; `review`: the checks passed and it now waits for the owner. */
type CheckResult = { ok: boolean; detail: string; conflict?: boolean; testOutput?: string; review?: boolean; merged?: string }

/**
 * Commit the worker's changes, check scope, bring in the latest main, test, then move main forward.
 * `mode` 'finish' (a worker just finished): when the task needs review (see needsReview), stop
 * after the tests, before merging, and return `review`. 'approve' (the owner approved a task in
 * review): the same checked merge, but the tests run again only if main had to be merged in.
 */
async function checkAndMerge($: $, t: SymccTask, dir: string, b: Board, mode: 'finish' | 'approve' = 'finish', made: string[] = []): Promise<CheckResult> {
  const target = b.target_branch
  await git($, ['add', '-A', '--', '.'], dir)
  const before = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
  // The message ends with trailers (task, origin, why, try); see commitMessage.
  const c = await git($, ['-c', `user.name=${N.author.name}`, '-c', `user.email=${N.author.email}`, 'commit', '-q', '--no-verify', '-m', commitMessage(t, { name: N.name })], dir)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const head = await gitOk($, ['rev-parse', 'HEAD'], dir)
  // Nothing to commit is fine (exit 1, HEAD unchanged); only a new HEAD counts as a commit of this try.
  if (c.exitCode === 0 && head !== before) made.push(head)
  const base = (await git($, ['merge-base', main, head])).stdout.trim() || main
  const changed = (await gitOk($, ['diff', '--name-only', '--no-renames', `${base}..${head}`])).split('\n').filter(Boolean)
  if (!changed.length) return { ok: false, detail: 'the worker made no change' }
  const bad = outOfScope(changed, t.files, N.dir)
  if (bad.length) return { ok: false, detail: outOfScopeText(bad, t.files) }
  let candidate = head
  if ((await git($, ['merge-base', '--is-ancestor', main, head])).exitCode !== 0) {
    const m = await git($, ['-c', `user.name=${N.author.name}`, '-c', `user.email=${N.author.email}`, 'merge', '--no-edit', '-m', commitMessage(t, { name: N.name, subject: `${t.id}: bring up to date with ${target}` }), main], dir)
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      return { ok: false, detail: `conflicts with the latest ${target}`, conflict: true }
    }
    candidate = await gitOk($, ['rev-parse', 'HEAD'], dir)
    made.push(candidate)
  }
  const testsRun = mode === 'finish' || candidate !== head
  for (const cmd of testsRun ? b.test_commands : []) {
    const r = await $.process.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: 600_000 }).catch((e: Error) => ({ exitCode: 1, stdout: '', stderr: e.message }))
    if (r.exitCode !== 0) {
      const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
      return { ok: false, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}`, testOutput: testTail(`$ ${cmd} (exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`) }
    }
  }
  if (mode === 'finish' && needsReview(b, t)) return { ok: true, review: true, detail: `checks passed${b.test_commands.length ? '; tests passed' : '; no test command set'}; ready for review, nothing merged yet` }
  // Move main forward (compare-and-swap). If the person has main checked out, update
  // their files too, but never over uncommitted changes.
  const current = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
  if (current === target) {
    const st = (await git($, ['status', '--porcelain', '--untracked-files=no'])).stdout.split('\n').filter(l => l && !l.slice(3).startsWith(`${N.dir}/`))
    if (st.length) return { ok: false, detail: `you have uncommitted changes on ${target}; commit or stash them, then say "retry ${t.id}"` }
  }
  const cas = await git($, ['update-ref', '-m', `${N.name} ${t.id}`, `refs/heads/${target}`, candidate, main])
  if (cas.exitCode !== 0) return { ok: false, detail: `${target} moved during the merge; try again` }
  if (current === target) await git($, ['read-tree', '-m', '-u', main, candidate])
  const tests = !b.test_commands.length ? '; no test command set' : testsRun ? '; tests passed' : ''
  return { ok: true, merged: candidate, detail: `merged into ${target} (${candidate.slice(0, 8)})${mode === 'approve' ? '; approved by the owner' : ''}${tests}` }
}

/**
 * Saves on the board the commits a try made (on its last run) and, once merged, the commit that
 * landed on the target branch (`merged`). Read fresh inside the change, so no other write is lost.
 * A failure to save is told to the lead, never hidden; the merge itself already happened.
 */
async function recordCommits($: $, id: string, made: readonly string[], merged?: string) {
  if (!made.length && !merged) return
  try {
    await change($, x => {
      const cur = find(x, id)
      if (!cur) return x
      return patchTask(x, id, { runs: addCommits(cur.runs, made), ...(merged ? { merged } : {}) }, now())
    })
  } catch (e) {
    tellLead($, `${id}: could not save its commits on the board (${(e as Error).message.slice(0, 200)}). Commits: ${[...made, ...(merged ? [merged] : [])].join(', ')}`)
  }
}

// ---------------- workers ----------------

/** A task's history without the "created by ..." line: what earlier tries did. */
const tries = (t: SymccTask) => t.history.filter(line => !line.startsWith('created by '))

const WORKER_PROMPT = (t: SymccTask, b: Board, dir: string, role?: RoleDef) => `You are a ${N.name} worker. Do exactly this one task, then stop.

Work ONLY inside this folder, your own copy of the project on branch ${t.branch ?? N.branch(t.id)}:
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
Do not run git commit, push or merge: ${N.name} commits, tests and merges your work.
${t.merge_main ? `\nFirst, ${b.target_branch} has moved and your branch now conflicts with it. In that folder, run \`git merge ${b.target_branch}\` and resolve the conflicts (for this one step only you may run that git merge; still don't commit). Keep this task's intent, keep the changes inside the task's files, and make sure the tests pass.\n` : ''}${t.test_output ? `\nYour last try failed these tests; fix it. The end of the test output:\n\`\`\`\n${t.test_output}\n\`\`\`\n` : ''}${tries(t).length ? `\nEarlier tries:\n${tries(t).slice(-5).map(line => `- ${line}`).join('\n')}\nDon't repeat those mistakes.\n` : ''}
When you are done, answer in one or two plain sentences: what you changed. If you truly cannot continue without the owner deciding something, answer with one line starting "QUESTION:" and the question.`

async function pump($: $) {
  if (!startupDone) return // session.start hasn't finished; it pumps itself at its end
  if (!driving) return // another session drives the board and starts its work
  const b = await load($)
  if (modeOf(b) === 'off' || !symccOn(b)) return
  if (!ready(b).length) return
  if (!(await gitReady($, b))) return // no git, no repo or no commit yet: nothing starts until it is set up
  if (!(await targetReady($, b))) return // nothing starts and nothing is marked failed
  for (const t of ready(b)) {
    if (workers.size >= b.max_parallel) break
    if (starting.has(t.id) || [...workers.values()].some(w => w.task === t.id)) continue
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
async function startWorker($: $, id: string) {
  if (starting.has(id) || [...workers.values()].some(w => w.task === id)) return
  starting.add(id)
  try {
    const listed = await agentsNow($)
    if (!listed) return // can't see which agents run; try again on the next pump
    const agents = [...listed, ...knownWorkers()]
    const b = await load($)
    const t0 = find(b, id)
    if (!mayStart(t0, agents, N.name)) return
    if (!(await targetReady($, b))) return // the branch to merge into is missing: leave the task "todo"
    const { dir, branch } = await prepareWorktree($, t0!, b.target_branch)
    const t = await change($, x => {
      const cur = find(x, id)
      if (!mayStart(cur, agents, N.name)) return [x, null]
      const at = now()
      const y = patchTask(x, id, { status: 'doing', session: me, attempts: cur!.attempts + 1, branch, note: 'worker on it', runs: startRun(cur!.runs, at) }, at)
      return [y, find(y, id)!]
    })
    if (!t) return
    const before = find(b, id)!
    let agentId: string
    try {
      const role = findRole(await loadRoles($), roleOf(t))
      const spawned = await $.agent.spawn({ prompt: WORKER_PROMPT(t, b, dir, role), name: workerName(N.name, t.id), description: workerDescription(t.title), subagentType: N.worker, cwd: dir, ...(role?.model ? { model: role.model } : {}) })
      if ('deny' in spawned && spawned.deny) throw new Error(spawned.deny)
      if (!('agentId' in spawned) || !spawned.agentId) throw new Error('the worker did not start')
      agentId = spawned.agentId
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      const misses = notReady.get(id) ?? 0
      if (!isNotReady(msg, N.name) || onNotReady(misses) === 'fail') {
        notReady.delete(id)
        throw err
      }
      // Not the task's fault: the worker type isn't there yet (e.g. just after a reload).
      // Put the task back as it was, with no try counted; the next pump or check tries again.
      notReady.set(id, misses + 1)
      await change($, x =>
        find(x, id)?.status === 'doing' && find(x, id)?.session === me
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
async function agentsNow($: $): Promise<AgentInfo[] | null> {
  return ((await $.agent.list().catch(() => null)) as AgentInfo[] | null) ?? null
}

/** The workers this copy of the plugin started, as agents (they may not be listed yet). */
const knownWorkers = (): AgentInfo[] => [...workers].map(([id, w]) => ({ id, type: N.worker, status: 'running', description: w.task }))

/** How long a reload waits for old workers it stopped to really end. */
const ORPHAN_WAIT_MS = 20_000

/** Waits up to `ms` until the agents `ids` have ended; returns those still alive (all of them if the list can't be read). */
async function waitEnded($: $, ids: string[], ms: number): Promise<AgentInfo[]> {
  if (!ids.length) return []
  const until = Date.now() + ms
  for (;;) {
    const agents = await agentsNow($)
    const alive = agents ? agents.filter(a => ids.includes(a.id) && !ENDED_STATUSES.includes(a.status)) : ids.map(id => ({ id, type: N.worker, status: 'running' }))
    if (!alive.length || Date.now() > until) return alive
    await $.clock.sleep(500)
  }
}

async function workerFinished($: $, agentId: string, answer: string, aborted: boolean, tokens?: number) {
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
  }
  await pump($)
}

async function finishWork($: $, agentId: string, w: { task: string; worktree: string; branch: string }, answer: string, aborted: boolean) {
  const b = await load($)
  const t = find(b, w.task)
  if (!t || t.status !== 'doing') return // changed or dropped meanwhile
  const summary = answer.trim().slice(0, 600) || '(no summary)'
  const q = /^\s*QUESTION:\s*(.+)$/im.exec(answer)
  const need = parseNeedFiles(answer)
  if (aborted) {
    await change($, x => patchTask(x, t.id, { status: 'failed', note: 'the worker was stopped', history: [...t.history, `${tryLabel(t)}: stopped before finishing`] }, now()))
    tellLead($, `${t.id} "${t.title}": the worker was stopped before finishing.`)
  } else if (need) {
    const question = needFilesQuestion(t.id, need)
    await change($, x => patchTask(x, t.id, { status: 'waiting', question: question.slice(0, 1000), note: 'waiting for you', history: [...t.history, `${tryLabel(t)}: worker asked for more files: ${need.files.join(', ')}${need.reason ? ` — ${need.reason}` : ''}`] }, now()))
    tellLead($, `${question}\nThe task now waits for the owner. If they agree, ${N.name} change ${t.id} with the wider files (that sends it back to work; what the worker already changed is kept). Otherwise ${N.name} drop it, or change it to a narrower plan that fits its files.`)
  } else if (q) {
    await change($, x => patchTask(x, t.id, { status: 'failed', note: `worker asks: ${q[1]!.slice(0, 200)}`, history: [...t.history, `${tryLabel(t)}: worker asked: ${q[1]}`] }, now()))
    tellLead($, `${t.id} "${t.title}": the worker stopped with a question: ${q[1]}\nAnswer it yourself and change the task, or ask the owner with ${N.name} ask.`)
  } else {
    await change($, x => patchTask(x, t.id, { note: 'checking and merging' }, now()))
    const made: string[] = []
    const r: CheckResult = await checkAndMerge($, t, w.worktree, b, 'finish', made).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    await recordCommits($, t.id, made, r.merged)
    await settle($, t, b, r, summary, w.worktree, agentId)
  }
}

/**
 * What happens to task `t` after its work was checked (`r`): back to "todo" for a new try after
 * a conflict or failing tests (while it has tries left), "review" when it waits for the owner,
 * else "done" (merged) or "failed". `summary` is what the worker (or the owner, on approve) said.
 */
async function settle($: $, t: SymccTask, b: Board, r: CheckResult, summary: string, worktree: string, agentId?: string) {
  const line = `${tryLabel(t)}: ${summary.slice(0, 300)} → ${r.detail}`
  if (r.review) {
    await change($, x => patchTask(x, t.id, { status: 'review', note: 'ready for review: the checks passed, nothing merged yet', merge_main: false, test_output: undefined, history: [...t.history, line] }, now()))
    tellLead($, `${t.id} "${t.title}" is ready for review. Worker: ${summary.slice(0, 300)}\nThe change is on branch ${t.branch ?? N.branch(t.id)} (folder ${N.dir}/worktrees/${t.id}). Show the owner what changed; then ${N.name} approve ${t.id} merges it, or ${N.name} reject ${t.id} with a reason sends it back to a fresh worker.`)
    return
  }
  const tries = t.conflict_tries ?? 0
  if (r.conflict && onConflict(t) === 'retry') {
    // Don't fail yet: a new worker merges main into the branch and resolves the conflicts.
    const note = `conflicts with the latest ${b.target_branch}; a new try will merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES})`
    await change($, x => patchTask(x, t.id, { status: 'todo', note, conflict_tries: tries + 1, merge_main: true, history: [...t.history, line] }, now()))
    tellLead($, `${t.id} "${t.title}" conflicts with the latest ${b.target_branch}; starting a new try to merge it in (${tries + 1} of ${MAX_CONFLICT_TRIES}).`)
    return
  }
  const retries = b.auto_retries ?? DEFAULT_AUTO_RETRIES
  const testTries = t.test_tries ?? 0
  if (r.testOutput !== undefined && onTestFail(t, retries) === 'retry') {
    // Don't fail yet: a new worker gets the failing test output and fixes it.
    const note = `tests failed; a new try will fix them (${testTries + 1} of ${retries})`
    await change($, x => patchTask(x, t.id, { status: 'todo', note, test_tries: testTries + 1, test_output: r.testOutput, merge_main: false, history: [...t.history, line] }, now()))
    tellLead($, `${t.id} "${t.title}" failed its tests; retrying on its own (${testTries + 1} of ${retries}). Nothing to do.`)
    return
  }
  const detail = r.conflict ? `conflicts with the latest ${b.target_branch}, still after ${tries} tries to merge it in` : r.detail
  const done = `${tryLabel(t)}: ${summary.slice(0, 300)} → ${detail}`
  await change($, x => patchTask(x, t.id, { status: r.ok ? 'done' : 'failed', note: detail.slice(0, 300), merge_main: false, test_output: r.testOutput, history: [...t.history, done] }, now()))
  if (r.ok) sayDone($, b, t.id)
  // Merged: its folder goes, then its branch (-d: git refuses if it isn't merged, so nothing is lost).
  if (r.ok && (await removeWorktree($, t.id, worktree, agentId))) await git($, ['branch', '-d', t.branch ?? N.branch(t.id)])
  const gaveUp = r.testOutput !== undefined ? `\nIt already had ${testTries} automatic ${testTries === 1 ? 'retry' : 'retries'}. The end of the last test output:\n${r.testOutput}` : ''
  tellLead($, r.ok ? `✓ ${t.id} "${t.title}" is merged. Worker: ${summary.slice(0, 300)}` : `✗ ${t.id} "${t.title}" was not merged: ${detail}\nWorker said: ${summary.slice(0, 300)}${gaveUp}`)
}

/** tasks being approved (checked and merged) now in this session, so a second approve waits its turn */
const approving = new Set<string>()

/** The owner approved task `id` (in "review"): the same checked merge as for a finished worker. */
async function approve($: $, id: string): Promise<string> {
  const b = await load($)
  const t = reviewTask(b, id, 'approve')
  if (approving.has(t.id)) return `${t.id} is already being merged`
  if (!(await gitReady($, b))) return `${t.id} stays in review: ${gitNote(gitState)}`
  if (!(await targetReady($, b))) return `${t.id} stays in review: ${missingBranchText(b.target_branch)}`
  approving.add(t.id)
  try {
    const dir = worktreeDir(t.id)
    if (!(await $.fs.exists(`${dir}/.git`))) await prepareWorktree($, t, b.target_branch)
    await change($, x => (find(x, t.id)?.status === 'review' ? patchTask(x, t.id, { note: 'approved; checking and merging' }, now()) : x))
    const made: string[] = []
    const r: CheckResult = await checkAndMerge($, t, dir, b, 'approve', made).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    await recordCommits($, t.id, made, r.merged)
    const cur = find(await load($), t.id)
    if (cur?.status !== 'review') return `${t.id} changed while it was being merged (it is now ${cur?.status ?? 'gone'}); nothing more done`
    if (!r.ok && !r.conflict && r.testOutput === undefined) {
      // Not the work's fault (e.g. uncommitted changes on the target branch): it stays in review.
      await change($, x => patchTask(x, t.id, { note: `approved, but not merged: ${r.detail.slice(0, 250)}` }, now()))
      return `${t.id} was not merged and stays in review: ${r.detail}. Fix that, then approve it again.`
    }
    await settle($, cur, b, r, 'approved by the owner', dir)
    void pump($)
    return r.ok ? `${t.id} approved and merged: ${r.detail}` : `${t.id} approved, but not merged: ${r.detail}${r.conflict || r.testOutput !== undefined ? ' (see the board for what happens next)' : ''}`
  } finally {
    approving.delete(t.id)
  }
}

/** Ends an agent's work: from now on every tool it tries is refused, and it is told to stop. */
async function halt($: $, agentId: string, why: string) {
  stopped.add(agentId)
  await $.session.send({ to: { agentId }, text: `Stop now: ${why}. Don't change anything else; answer "stopped" and end.` }).catch(() => undefined)
}

/** Stops the workers `which` picks (all by default), one by one; `then` runs after each is told to stop. */
async function haltWorkers($: $, why: string, which: (w: Worker) => boolean = () => true, then?: (w: Worker) => Promise<unknown>) {
  for (const [agentId, w] of [...workers]) {
    if (!which(w)) continue
    workers.delete(agentId)
    await halt($, agentId, why)
    await then?.(w)
  }
}

/** Stops every worker, then every scout run; `then` runs after each worker is told to stop. */
async function haltAll($: $, why: string, then?: (w: Worker) => Promise<unknown>) {
  await haltWorkers($, why, undefined, then)
  for (const agentId of [...scoutRuns.keys()]) await halt($, agentId, why)
  scoutRuns.clear()
  for (const s of scoutState.values()) s.running = false
}

async function stopWorker($: $, taskId: string, why: string) {
  await haltWorkers($, why, w => w.task === taskId)
  await publish($, await load($))
}

/**
 * Sets the board mode to `m`; `who` is said in the notes of stopped tasks. "off" stops every
 * worker and scout at once (their tasks go back to "todo" and continue when work runs again);
 * "review" or "auto" from "off" starts work again. Going to "auto" does not merge tasks already
 * in review. Returns one short line: the new mode, what it means, and what happened.
 */
async function setBoardMode($: $, m: SymccMode, who: string): Promise<string> {
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
      await change($, x => patchTask(x, w.task, { status: 'todo', note: `stopped by ${who}; continues when the board is on again` }, now()))
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
async function setSymcc($: $, on: boolean): Promise<string> {
  const before = symccOn(await load($))
  const b = await change($, x => {
    const y = setEnabled(x, on)
    return [y, y] as [Board, Board]
  })
  enabledNow = on
  if (!on) {
    const ids: string[] = []
    await haltAll($, `you turned ${N.name} off`, async w => {
      ids.push(w.task)
      await change($, x => patchTask(x, w.task, { status: 'todo', note: `stopped: ${N.name} was turned off; continues when it is on again` }, now()))
    })
    leadQueue.splice(0)
    leadTimer?.cancel()
    leadTimer = null
    sayQueue.splice(0)
    await publish($, await load($))
    const stopped = ids.length ? ` Stopped ${ids.join(', ')}.` : ''
    return `${N.name} is ${before ? 'now ' : ''}off: Claude works as normal from your next message. The board, tasks and scouts are kept.${stopped} Turn it back on with /${N.name}-on.`
  }
  await publish($, b)
  void pump($)
  if (!before) tellLead($, `The owner turned ${N.name} back on with /${N.name}-on. You are the lead again; the board is in mode ${modeOf(b)}.`)
  return `${N.name} is ${before ? 'already ' : ''}on, in mode ${modeOf(b)}: ${modeText(modeOf(b))}`
}

const LIVE = new Set(['pending', 'running', 'waiting'])

/**
 * Stops this plugin's workers and scouts this copy of the plugin doesn't know about. A reload of the
 * plugin forgets which worker belongs to which task while the old workers keep running in the
 * same folders; without this, every reload adds one more worker per running task.
 * A live worker of this session whose task is still "doing" for it is not an orphan: it is
 * tracked again (adopted) and keeps working, so a reload never stops a worker mid-task.
 * Only live agents are messaged: a message to an ended agent would wake it up again.
 */
async function stopOrphans($: $, leadNow?: string | null): Promise<string[]> {
  const agents = await $.agent.list().catch(() => [])
  // $.agent.list() names this session's agents only, but in case it ever lists another
  // session's too: never stop a worker whose task the live driver (another session) owns.
  const lead = leadNow !== undefined ? leadNow : await $.fs.read(path(N.leadFile)).catch(() => null)
  const live = liveDriver(lead, Date.now())
  const b = agents.some(a => a.type === N.worker) ? await load($).catch(() => emptyBoard()) : emptyBoard()
  const out: string[] = []
  for (const a of agents) {
    if (a.type !== N.worker && a.type !== N.scout) continue
    if (workers.has(a.id) || scoutRuns.has(a.id)) continue
    if (ENDED_STATUSES.includes(a.status)) continue
    if (a.type === N.worker) {
      // A worker of this session that was running when the plugin reloaded keeps working:
      // track it again instead of stopping it (see orphanMove for when).
      const taken = [...workers.values()].map(w => w.task)
      const m = orphanMove(a as AgentInfo, b, me, live, [...taken, ...starting, ...finishing], N.name)
      if (m.move === 'leave') continue
      if (m.move === 'adopt') {
        const t = find(b, m.task)!
        const started = Date.parse(t.runs?.[t.runs.length - 1]?.started ?? '')
        workers.set(a.id, { task: t.id, worktree: worktreeDir(t.id), branch: t.branch ?? N.branch(t.id), since: Number.isFinite(started) ? started : Date.now() })
        if (t.agent !== a.id) await change($, x => (find(x, t.id)?.status === 'doing' && find(x, t.id)?.session === me ? patchTask(x, t.id, { agent: a.id }, now()) : x)).catch((e: Error) => $.ui.toast(N.toast(`kept ${t.id}'s worker after a reload but couldn't record it on the board: ${String(e?.message ?? e).slice(0, 150)}`)))
        continue
      }
    }
    stopped.add(a.id)
    if (LIVE.has(a.status)) await halt($, a.id, `${N.name} was reloaded and a new worker took over this task`)
    out.push(a.id)
  }
  return out
}

/**
 * Delete the temp files a killed session left in .<name>/ (see leftoverTmpFiles for which).
 * A file that is gone by the time we get to it is fine; other errors are reported once per
 * file in a toast, and never stop the check.
 */
async function cleanLeftoverTmp($: $) {
  const dir = path(N.dir)
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
  if (fresh.length) $.ui.toast(N.toast(`couldn't remove leftover temp files in ${N.dir}/: ${fresh.join('; ')}`))
}
const tmpWarned = new Set<string>()

/** The regular check, every two minutes: keeps work moving and makes sure nothing is stuck or forgotten. */
async function check($: $) {
  if (!driving) return
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
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ran over ${b.max_minutes} minutes, so I stopped it. Retry it (${N.name} retry), split it, or drop it. The limit can be changed with ${N.name} settings max_minutes.`)
      continue
    }
    // The worker is gone without saying it finished (crashed, or lost): send the task back to the lead.
    const lost = minutes > 3 && info !== undefined && ENDED_STATUSES.includes(info.status)
    if (lost) {
      workers.delete(agentId)
      await change($, x => patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', history: [...(t?.history ?? []), `${t ? tryLabel(t) : 'try ?'}: the worker ended without a result`] }, now()))
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ended without a result. Retry it (${N.name} retry), change it, or drop it.`)
    }
  }
  // A task kept "doing" after a reload because its old worker was still alive: once no live
  // agent works on it any more, it goes back to "todo" for a fresh worker.
  if (agents) {
    const mine = new Set([...workers.values()].map(w => w.task))
    const live = liveDriver(await $.fs.read(path(N.leadFile)).catch(() => null), Date.now())
    const idle = (await load($)).tasks.filter(t => t.status === 'doing' && t.session === me && !mine.has(t.id) && !starting.has(t.id) && !finishing.has(t.id) && ownedHere(t, me, live) && !liveWorkersFor(t, agents as AgentInfo[], N.name).length).map(t => t.id)
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
  if (gitState === 'ok') await cleanupMerged($, await load($)).catch(() => undefined)
  await pump($)
}

// ---------------- worker roles ----------------

/** The role files in folder `dir`, shown as `shown` (e.g. ".symcc/roles"); a file that can't be used is skipped with a note (see skippedRole). */
async function roleFiles($: $, dir: string, shown: string): Promise<RoleDef[]> {
  if (!(await $.fs.exists(dir).catch(() => false))) return []
  const out: RoleDef[] = []
  for (const f of await $.fs.list(dir).catch(() => [])) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const text = await $.fs.read(`${dir}/${f.name}`).catch(() => '')
    const body = typeof text === 'string' ? text : ''
    const name = f.name.replace(/\.md$/, '')
    const r = parseRole(name, body)
    if (r) {
      out.push(r)
      skippedRoles.delete(`${shown}/${f.name}`)
    } else skippedRole($, `${shown}/${f.name}`, roleSkipReason(name, body) ?? 'it can not be used')
  }
  return out
}

/** Says once (a toast for the owner, a note for the lead) that a role file was skipped and why; again only when the reason changes. */
function skippedRole($: $, file: string, reason: string) {
  const note = skippedRoleNote(file, reason, N.name)
  $.ui.log(note, { to: 'debug' })
  if (skippedRoles.get(file) === reason) return
  skippedRoles.set(file, reason)
  $.ui.toast(N.toast(`skipped ${file}: ${reason}`))
  tellLead($, `${note}. That role can't be used until the file is fixed (front matter with a description; a name of letters, digits, - and _).`)
}

/** Reads the roles again: the plugin's roles/, then the project's .<name>/roles/ over them. */
async function loadRoles($: $): Promise<RoleDef[]> {
  roles = mergeRoles(await roleFiles($, `${$.plugin.root}/roles`, 'roles'), root ? await roleFiles($, path(`${N.dir}/roles`), `${N.dir}/roles`) : [])
  return roles
}

// ---------------- scouts ----------------

async function loadScouts($: $): Promise<ScoutDef[]> {
  const dir = path(N.scouts)
  if (!(await $.fs.exists(dir))) return []
  const out: ScoutDef[] = []
  for (const f of await $.fs.list(dir)) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const s = parseScout(f.name.replace(/\.md$/, ''), await $.fs.read(`${dir}/${f.name}`))
    if (s) out.push(s)
  }
  return out
}

async function runScout($: $, s: ScoutDef) {
  const st = scoutState.get(s.name)
  if (!st || st.running || !driving || gitState !== 'ok') return
  const b = await load($)
  if (modeOf(b) === 'off' || !symccOn(b)) return
  const lastRun = st.last_run
  const lastReport = st.last_report
  st.running = true
  st.last_run = now()
  await publish($, b)
  const open = b.tasks.filter(t => OPEN.includes(t.status) || t.status === 'backlog').map(t => `${t.id} ${t.title}${t.status === 'backlog' ? ' (backlog)' : ''}`)
  const prompt = scoutPrompt({ scout: s.name, root, instructions: s.prompt, open, closed: recentClosed(b.tasks), lastReport, lastRun, name: N.name })
  const spawned = await $.agent.spawn({ prompt, name: scoutAgentName(N.name, s.name), description: scoutDescription(s.name, s.prompt), subagentType: N.scout, ...(s.model ? { model: s.model } : {}) }).catch((e: Error) => ({ deny: e.message }))
  const agentId = 'agentId' in spawned ? spawned.agentId : undefined
  if (!agentId) {
    st.running = false
    await publish($, await load($))
    return
  }
  scoutRuns.set(agentId, s.name)
}

/** <dir>/scouts.json: each scout's last run time and last report, so a restart doesn't make it "first run" again. */
const scoutMemoryFile = () => path(`${N.dir}/scouts.json`)

/** The saved scout memory; a missing or broken file counts as "no scout has run yet". */
async function loadScoutMemory($: $) {
  const text = await $.fs.read(scoutMemoryFile()).catch(() => null)
  return parseScoutMemory(text)
}

/** Saves the scouts in scoutState (temp file + rename, like board.json); scouts no longer in scouts/ are dropped. */
async function saveScoutMemory($: $) {
  const file = scoutMemoryFile()
  const tmp = `${file}.tmp`
  await $.fs.write(tmp, scoutMemoryText(scoutState.values()))
  const r = await $.process.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) throw new Error(`couldn't save ${N.dir}/scouts.json: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
}

async function scoutFinished($: $, agentId: string, answer: string) {
  const name = scoutRuns.get(agentId)!
  scoutRuns.delete(agentId)
  const st = scoutState.get(name)
  if (st) {
    st.running = false
    st.last_report = answer.trim().slice(0, SCOUT_REPORT_CHARS)
    await saveScoutMemory($).catch((e: Error) => tellLead($, `Note: scout ${name}'s last run was not saved (${e.message}); after a restart it will start as a first run.`))
  }
  await publish($, await load($))
  const msg = scoutLeadMessage(name, answer)
  if (msg) {
    const at = now()
    heard.scouts[name] = at
    heard.last = { what: `scout ${name} report`, at }
    tellLead($, msg)
  }
}

async function scheduleScouts($: $) {
  for (const t of timers.splice(0)) t.cancel()
  const defs = await loadScouts($)
  for (const k of [...scoutState.keys()]) if (!defs.some(d => d.name === k)) scoutState.delete(k)
  // after a restart the map is empty: take each scout's last run and report from scouts.json
  const saved = defs.some(d => !scoutState.has(d.name)) ? await loadScoutMemory($) : {}
  for (const s of defs) {
    const old: Pick<SymccScout, 'last_run' | 'running' | 'last_report'> | undefined = scoutState.get(s.name) ?? (saved[s.name] ? { ...saved[s.name]!, running: false } : undefined)
    const ms = s.every_minutes * 60_000
    const st: SymccScout = { name: s.name, every_minutes: s.every_minutes, last_run: old?.last_run ?? null, running: old?.running ?? false, prompt: s.prompt, next_run: new Date(Date.now() + ms).toISOString() }
    if (s.model) st.model = s.model
    if (old?.last_report !== undefined) st.last_report = old.last_report
    scoutState.set(s.name, st)
    timers.push(
      $.clock.every(ms, () => {
        st.next_run = new Date(Date.now() + ms).toISOString()
        void runScout($, s)
      }),
    )
  }
  return defs
}

/** Runs scout `name` now (/<name>-scout <scout>, or "run now" in the panel); says what happened. */
async function runScoutNow($: $, name: string): Promise<string> {
  const defs = await scheduleScouts($)
  const s = defs.find(d => d.name === name)
  if (!s) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  if (!driving) return `scouts run in the session that drives the board; run /${N.name}-scout ${s.name} there`
  const cur = await load($)
  if (!symccOn(cur)) return offAnswer(N.name)
  if (modeOf(cur) === 'off') return `the board is off, so no scout runs; turn it on with /${N.name}-mode review or /${N.name}-mode auto`
  void runScout($, s)
  return `scout ${s.name} started`
}

/** A scout file's text, or null when there is none (or it can't be read). */
async function readScoutFile($: $, scout: string): Promise<string | null> {
  const file = path(scoutFile(scout, N.name))
  return (await $.fs.exists(file).catch(() => false)) ? await $.fs.read(file).catch(() => null) : null
}

/** Opens the panel's edit mode for scout `sc`, filled from its file (or from what the panel knows). */
async function editScout($: $, sc: SymccScout) {
  const text = await readScoutFile($, sc.name)
  const def = text === null ? null : parseScout(sc.name, text)
  draft = { scout: sc.name, isNew: false, every: String(def?.every_minutes ?? sc.every_minutes), model: def?.model ?? sc.model ?? '', body: def?.prompt ?? sc.prompt ?? '', error: '' }
  $.ui.invalidate('ui.render')
}

/** Starts a new scout named as typed: refused when the name is bad or taken; else opens the edit mode. */
async function newScout($: $, name: string, shown: string[] = []) {
  const s = name.trim()
  const have = [...shown, ...scoutState.keys(), ...(await loadScouts($).catch(() => [] as ScoutDef[])).map(d => d.name)]
  let err = scoutNameError(s, have)
  if (!err && (await readScoutFile($, s)) !== null) err = `a scout named ${s} already exists`
  if (err) {
    naming = { name: s, error: err }
  } else {
    naming = null
    draft = { scout: s, isNew: true, every: '60', model: '', body: '', error: '' }
  }
  $.ui.invalidate('ui.render')
}

/** Saves the edit mode to .<name>/scouts/<scout>.md, keeping the other front matter keys, and reloads the scouts. */
async function saveScout($: $) {
  const d = draft
  if (!d) return
  const err = scoutDraftError(d)
  if (err) {
    d.error = err
    $.ui.invalidate('ui.render')
    return
  }
  const old = await readScoutFile($, d.scout)
  if (d.isNew && old !== null) {
    d.error = `a scout named ${d.scout} already exists`
    $.ui.invalidate('ui.render')
    return
  }
  const text = scoutText(old, { every_minutes: everyMinutesOf(d.every)!, model: d.model }, d.body)
  await $.process.run(['mkdir', '-p', path(N.scouts)])
  await $.fs.write(path(scoutFile(d.scout, N.name)), text)
  draft = null
  // The same path as a Write to a scout file: reschedule, so the new timing applies now.
  await scheduleScouts($)
  await publish($, await load($))
  await update($, scoutOpen, () => d.scout)
  $.ui.toast(N.toast(`saved ${scoutFile(d.scout, N.name)}`))
  $.ui.invalidate('ui.render')
}

/** Leaves the edit mode (and the new scout name box) without saving. */
function cancelScoutEdit($: $) {
  draft = null
  naming = null
  $.ui.invalidate('ui.render')
}

/** The board panel's views: its tabs. */
type PaneTab = 'tasks' | 'scouts' | 'settings'

/**
 * Sets what the board panel shows: task `task` opened ('' = the list). With `which`, it also
 * switches to that view ('tasks', 'scouts' or 'settings') with no scout opened; without, the view stays.
 */
async function resetPane($: $, which?: PaneTab, task = '') {
  await update($, opened, () => task)
  if (!which) return
  await update($, scoutOpen, () => '')
  await update($, tab, () => which)
}

/**
 * Opens the board panel (see resetPane for `tab` and `task`). `focus` (default on) moves the
 * cursor into it and lets Esc close it; `quiet` ignores errors (the panel then just isn't shown).
 */
async function openPane($: $, o: { tab?: PaneTab; task?: string; focus?: boolean; quiet?: boolean } = {}) {
  const go = async () => {
    await resetPane($, o.tab, o.task)
    return $.ui.open({ id: N.pane, title: boardTitle(root, N.name), ...(o.focus !== false ? { focus: true as const, closeOnEscape: true as const } : {}) })
  }
  return o.quiet ? go().catch(() => undefined) : go()
}

// ---------------- the lead's tools ----------------

/** A short date and time, like "Nov 11, 09:30"; "?" when there is none. */
const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?')

function taskText(t: SymccTask, running: boolean, all: SymccTask[] = []): string {
  const word = STATUS_WORD
  const L = [`${t.id}  [${word[t.status]}]  ${t.title}`, `added ${when(t.created_at)} · changed ${when(t.updated_at)} · tries ${t.attempts}`]
  L.push(fromText(t, 120))
  if (t.origin?.why) L.push(`why: ${t.origin.why}`)
  if (t.origin?.evidence) L.push(`seen by ${N.name}: ${t.origin.evidence}`)
  if (t.note) L.push(`now: ${t.note}`)
  if (t.status === 'waiting' && t.question) L.push('', `ASKS: ${t.question}`)
  L.push('', 'What to do:', ...(t.details.trim() ? t.details.split('\n').map(l => (l.trim() ? `  ${l}` : '')) : ['  (no details)']))
  L.push('', 'May change:', ...(t.files.length ? t.files.map(f => `  ${f}`) : ['  anywhere in the project']))
  if (t.after.length) {
    L.push('', 'Waits for:')
    for (const id of t.after) {
      const dep = all.find(x => x.id === id)
      L.push(`  ${id} ${dep ? `[${word[dep.status]}] ${dep.title}` : '[missing]'}`)
    }
  }
  if (t.history.length) L.push('', `What happened (${t.history.length}, newest first):`, ...[...t.history].reverse().map(line => `  • ${line}`))
  if (t.runs?.length) L.push('', 'Time and cost:', ...t.runs.map((r, i) => `  ${fmtRun(r, i, Date.now())}`), `  total: ${fmtTotal(sumRuns(t.runs, Date.now()))}`)
  const commits = taskCommits(t)
  if (commits.length) L.push('', 'Commits (newest first):', ...commits.map(c => `  ${commitText(c)}`))
  if (t.branch) L.push('', `branch: ${t.branch}`)
  if (running) L.push('', 'A worker is on it now: open it from the agents list to watch.')
  return L.join('\n')
}

const MANUAL = (): Record<string, string> => ({
  overview: `${N.name} turns this session into a small team.
  • The board (${N.dir}/board.json) holds the tasks. You and the lead manage it by talking.
  • The lead is this chat. It turns what you want into tasks and decides what happens next.
  • Workers are background agents. Each builds one task in its own copy of the code
    (${N.dir}/worktrees/T-n). When it finishes, ${N.name} checks the files it changed, runs the
    tests and merges into the target branch (target_branch) only if they pass. In mode
    review (or for a task with needs_review) it waits for your approve or reject first.
  • The board has one mode: off (nothing runs), review (work runs; finished work waits for
    you) or auto (work runs; finished work that passes merges on its own; the default).
  • Scouts are background agents on a timer. Each does what its file asks (reading the
    project, running shell commands, searching the web) and reports to the lead, which
    decides what goes on the board.
  Topics: /${N.help} commands · tasks · lead · workers · scouts · safety`,
  commands: `Commands
  /${N.name} opens everything; /${N.name}-WORD does one thing: a plural noun opens a view
  (tasks, scouts), a singular noun acts on one named item (task, scout), a verb acts
  (approve, reject, diff), and mode and settings change how the board works. The "board" is
  the whole panel: tasks, scouts and settings.
  /${N.name}                     open the board panel (↑↓ move, Enter opens, t / s / c switch views, Esc closes)
  /${N.name}-tasks               open the panel on the tasks view
  /${N.name}-scouts              open the panel on the scouts view and reload the scout files
  /${N.name}-task T-3            open one task
  /${N.name}-approve T-5         merge a task that is ready for review
  /${N.name}-reject T-5 REASON   send it back to "todo" with the reason
  /${N.name}-diff T-5 [FILE]     the files it changed (+/- lines), or one file's diff
  /${N.name}-scout NAME          run a scout now
  /${N.name}-mode [off|review|auto]  set the board mode; no word switches review and auto
                       (from off, no word goes to review)
                       off: stop every worker and scout now, start nothing new
                       review: work runs; finished tasks wait for your approve or reject
                       auto: work runs; finished tasks that pass merge on their own
  /${N.name}-settings [NAME VALUE]  open the settings view, or set one setting, e.g.
                       /${N.name}-settings max_parallel 5 · /${N.name}-settings voice off
                       /${N.name}-settings mode review · /${N.name}-settings test_commands "npm test"
                       (several test commands: join them with " && "; "none" clears them)
                       a value over its limit is cut to it, and the answer says so
  /${N.name}-off                 turn ${N.name} off for this project: Claude works as normal (no lead
                       guide, no workers, scouts, updates or voice); the board is kept
  /${N.name}-on                  turn it back on, in the mode the board had
  /${N.help} [TOPIC]           this manual
On the board: t tasks · s scouts · c settings · m switch review / auto.
In the settings view: Enter on a row changes it: on/off flips, mode and target_branch
  open a pick list, numbers and test_commands an edit box · Esc cancels.
In an open task: b back · p pause · u resume · r retry · x drop · w watch the worker · n needs review on/off
  · k stash to the backlog (a task to do, paused or failed)
  · l pick the worker role (a task to do, paused, failed or in the backlog).
In a backlog task: o move to todo · x drop · l role.
On the board list a task's role shows after its status ("T-12 doing · tests"); general shows nothing.
On the board list, the "▸ Backlog · N" section comes first, above the open tasks, folded; Enter on it opens it (5 items, then "… N more").
Backlog tasks are ideas and unclear work; they start only when you move them to todo (o).
In a task ready for review: a approve · x reject (asks for a reason) · d show changes.
On the board list: m switches the mode between review and auto (never to off).
Everything else, just say to the lead: "pause T-5", "drop T-2", "do T-4 first",
"set the test command to npm test", "give workers 90 minutes".`,
  tasks: `Tasks
  Fields: title, details (what to do and how we know it works), files (what the worker
  may change; empty = anywhere), after (tasks that must be done first), order (lower
  runs first), role (the worker role: general, frontend, backend, tests, docs, refactor,
  security, or one in .${N.name}/roles/; it brings a checklist, skills and maybe a model), plus status, note, question, tries, history, branch, when added/changed.
  Statuses:
    to do            waiting for a free worker (and for its "after" tasks)
    doing            a worker is on it
    paused           stopped on purpose; resume to continue
    waiting for you  the lead asked you a question; answer it in the board panel
                     (also when a worker answered NEED FILES: it needs files outside its list)
    ready for review the worker is done and the checks passed; nothing is merged until you
                     approve it (or reject it with a reason, which sends it back to "todo")
    failed           tests failed, files outside its list changed, or the worker stopped
    done             merged into the target branch
    dropped          given up
    backlog          an idea or work that is not clear yet; it never starts until you
                     move it to todo ("stash this idea", "show the backlog", "move T-5 to todo")
  The board lists the newest task at the top.`,
  lead: `The lead (this chat) has these tools:
  board · add · change · retry · ask · drop · pause · resume · settings
  approve · reject (only for a task ready for review)
  settings: target_branch (the branch work is merged into; a new board starts on the branch
  you have checked out, and it must be an existing branch), test_commands (must pass before
  a merge), max_parallel (workers at once, 1-8),
  max_minutes (a worker running longer is stopped), auto_retries (new tries on their own
  after failing tests, 2 by default), open_on_start (open the board panel when a
  session starts, on by default), voice (say "T-3 done" out loud when a task is merged;
  only the session driving the board speaks; on by default), mode (off stops every
  worker and scout and starts nothing new; review makes every finished task wait for
  your approve or reject; auto, the default, merges a finished task that passes at once).
  You can also change every setting yourself with /${N.name}-settings (or the c tab in the
  board). A value over its limit is cut to it, and the answer says so.
  add and change also take needs_review: that one task waits for review even in mode auto.
  Going from review to auto does not merge tasks already in review; approve or reject them.
  Tasks in review can be approved or rejected in every mode, also off.
  After each worker finishes, the lead gets a "[${N.name}] Update" message and decides what
  to do next: retry, change, split, ask you, or drop.`,
  workers: `Workers
  • Up to max_parallel run at once (3 by default), one per task.
  • A worker gets only its task, its folder, its allowed files and the test commands.
    It can't see the board or this chat, and must not commit, push or merge.
  • A resumed or retried task starts over with a fresh worker.
  • A worker that must change a file outside its list doesn't; it stops and answers
    "NEED FILES: a, b — reason". The task then waits for you: allow the files (change)
    or drop it. A worker that changes such files anyway fails its try.
  • Every two minutes ${N.name} checks by itself: starts ready tasks, stops a worker running
    longer than max_minutes (45 by default), notices a worker that ended without a result,
    reminds the lead about failed tasks nobody handled, and stops old workers left over
    from a plugin reload.
  • A stopped worker can't do anything more: ${N.name} refuses every tool it tries.`,
  scouts: `Scouts
  A scout is a file ${N.dir}/scouts/NAME.md in the project:
      ---
      every_minutes: 60
      model: sonnet
      ---
      What to do, in plain words.
  It does what the file says. It can read files, run shell commands and search or fetch
  web pages, but must not change the project (no edits, installs or git changes). It sends
  its whole report to the lead, or nothing when it answers NOTHING. The lead adds tasks,
  tells you, or ignores it. Run /${N.name}-scouts after adding or deleting a file.
  Examples: examples/scouts/ in the plugin.`,
  safety: `Safety
  • Changes outside a task's files, or that fail the tests, are never merged.
  • Review step (optional): in mode review (/${N.name}-mode review) or for a task with needs_review,
    finished work that passes waits as "ready for review" (its branch and folder are kept).
    approve runs the same checked merge (brought up to date, scope checked, tests again if it
    had to merge); reject with a reason sends it back to "todo" for a fresh worker.
  • The target branch only moves by a checked merge; with uncommitted changes on it, ${N.name} waits.
  • A new board merges into the branch you had checked out when it was made. If you are on
    another branch, the banner and status line say so ("merging into main · you're on x").
    Change it with ${N.name} settings target_branch. If that branch doesn't exist, no work
    starts (nothing is marked failed) until you set an existing one.
  • Workers can edit files in their own folder without asking. Their shell commands follow
    your normal permission rules (your settings' allow list applies to them too).
  • Scouts can't edit or write files. They can run shell commands (these follow your normal
    permission rules, like workers) and search and fetch web pages. They are told not to
    change the project; changes only go through board tasks.
  • Test commands are run by ${N.name} itself, without a permission prompt.
  • Add ${N.dir}/ to the project's .gitignore.
  • A folder with no git repo (or no commits yet): nothing starts. ${N.name} asks first, then
    (press g in the board, or the lead's setup_git) runs git init on main, writes a .gitignore
    and makes a first commit of your files, leaving out secrets (.env, *.pem, id_rsa) and files
    over 50 MB. It never pushes or adds a remote. With git not installed nothing starts at all.`,
})

function manual(arg: string): string {
  const MAN = MANUAL()
  const key = arg.trim().toLowerCase()
  if (!key) return Object.values(MAN).join('\n\n')
  const hit = Object.keys(MAN).find(k => k.startsWith(key))
  return hit ? MAN[hit]! : `No topic "${arg.trim()}". Topics: ${Object.keys(MAN).join(', ')}`
}

const leadGuide = () => `## ${N.name}: you are the lead (main conversation only)
This section is for the main conversation only. If you are a subagent (a ${N.name} worker or scout, or any other), ignore it and do the job you were given.

The project has a shared task board (${N.dir}/board.json) that you and the owner manage together by talking. You decide how the work runs:
- Turn what the owner wants into tasks with ${N.name} add (title, details = what to build and how we know it works, files = the narrowest files/folders the worker may change incl. tests, after = tasks that must be done first). Keep tasks small; split big wishes.
- Every ${N.name} add must say where the task came from, so it can be traced back: why (one line, required), origin_by, and: for an owner request, request = the owner's words quoted exactly; for a scout finding, scout = the scout's name; for a split or follow-up, from_task = that task's id (and how: split or follow-up); for something a worker reported, origin_by worker with from_task; for your own idea, origin_by lead. ${N.name} also notes what it saw itself (the last owner prompt, the last scout or worker report).
- When two tasks may change the same files, make the later one wait for the earlier one (after), so they don't clash when merging. Tasks with different files can run in parallel. Decide this yourself; don't ask the owner.
- A task waits until every task in its after list is done; if one of those is dropped or failed, change the waiting task's after (or drop it), or it waits forever.
- Workers start by themselves on ready tasks, each in its own copy of the code. When one finishes, its change is tested and, if it passes, merged into main. You then get a "[${N.name}] Update" message: decide what's next (retry with ${N.name} change / ${N.name} retry, split, ${N.name} ask the owner, or ${N.name} drop).
- The board has one mode (${N.name} settings mode): "off" stops every worker and scout and starts nothing new, "review" runs work but every finished task that passes waits for the owner, "auto" (the default) merges finished work that passes on its own. Tasks in review can be approved or rejected in every mode.
- Review before merge (optional): in mode review, or with needs_review on one task (${N.name} add / change), a finished task that passes stays "ready for review" instead of merging. You get "T-5 is ready for review": show the owner the change (its branch), then ${N.name} approve T-5 (merge it) or ${N.name} reject T-5 with the owner's reason (a fresh worker redoes it). Only approve when the owner says so. Going from review to auto does not merge tasks already in review.
- A worker that needs files outside its task's files stops and answers "NEED FILES: ..."; the task then waits for the owner. If they allow it, ${N.name} change the task with the wider files (it goes back to work); otherwise ${N.name} drop it or change it to a narrower plan. A worker that changes such files without asking fails its try.
- When the owner answers a waiting task, put the answer into the task with ${N.name} change (that sends it back to work).
- If you are told the folder has no git repo (or no commits), ask the owner whether to set one up; only when they say yes, run ${N.name} setup_git. Never do it without asking.
- Set the test command with ${N.name} settings (e.g. ["npm test"]); for a new project pick the stack and test command when you plan the first tasks.
- To stop work: ${N.name} pause pauses one task (its worker is stopped; ${N.name} resume continues it later, with a fresh worker). ${N.name} settings mode "off" stops every worker and scout; mode "review" or "auto" starts work again.
- Ideas or work that is not clear yet go to the backlog (${N.name} add with backlog: true); they never start until moved to todo (${N.name} change backlog: false). Say 'stash this' / 'move T-5 to todo'. A scout's "maybe later" finding can go to the backlog too. ${N.name} change backlog: true stashes a to do, paused or failed task (a running one is stopped first). The mode (off, review, auto) does not touch backlog items.
- ${N.name} checks every two minutes on its own: it starts ready tasks, stops a worker that runs longer than max_minutes (${N.name} settings), and reminds you about failed tasks nobody handled.
${rolesLeadText(roles, N.name)}
- Don't do the tasks' work yourself in the main conversation; let the workers do it. Talk about tasks by ID (T-3). Use ${N.name} board to see the board.`

const TOOLS = () => [
  { name: 'board', description: `Show the ${N.name} task board.`, inputSchema: { type: 'object', properties: {} } },
  {
    name: 'add',
    description: `Add a task to the ${N.name} board. A worker starts on it when it is ready.`,
    inputSchema: { type: 'object', required: ['title', 'details', 'why', 'origin_by'], properties: { title: { type: 'string' }, details: { type: 'string', description: 'What to build and how we know it works.' }, files: { type: 'array', items: { type: 'string' }, description: 'Files/folders the worker may change, e.g. ["src/search.js", "test/"]. Empty = anywhere.' }, after: { type: 'array', items: { type: 'string' }, description: 'Task IDs that must be done first.' }, order: { type: 'number', description: 'Lower runs first.' }, needs_review: { type: 'boolean', description: 'Wait for the owner to approve before merging, even when the board merges on its own (mode auto).' }, backlog: { type: 'boolean', description: 'Put it straight into the backlog: an idea or not-yet-clear work that never starts until moved to todo.' }, role: { type: 'string', description: 'The worker role that fits the task (see your instructions for the list); general when unsure.' }, why: { type: 'string', description: 'Required. One line: why this task exists.' }, origin_by: { type: 'string', enum: ['owner', 'scout', 'worker', 'lead'], description: "Who it came from: the owner's request, a scout's report, a worker's report, or your own idea (lead)." }, request: { type: 'string', description: "For an owner request: the owner's words, quoted exactly." }, scout: { type: 'string', description: "For a scout finding: the scout's name." }, from_task: { type: 'string', description: 'For a split or follow-up, or a worker report: the task id it comes from, e.g. T-12.' }, how: { type: 'string', enum: ['split', 'follow-up'], description: 'With from_task: "split" (part of a bigger task) or "follow-up" (more work after it).' } } },
  },
  {
    name: 'change',
    description: 'Rewrite a task. A running task restarts on the new version; a waiting, failed or in-review one goes back to work; a backlog one stays in the backlog. Changing only needs_review (wait for the owner before merging) just sets that flag. backlog: true stashes the task in the backlog (a running one is stopped first); backlog: false moves it from the backlog to todo.',
    inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, title: { type: 'string' }, details: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, after: { type: 'array', items: { type: 'string' } }, order: { type: 'number' }, needs_review: { type: 'boolean' }, backlog: { type: 'boolean', description: 'true: stash in the backlog (never starts); false: move from the backlog to todo.' }, role: { type: 'string', description: 'The worker role for the task; general when unsure.' } } },
  },
  { name: 'approve', description: 'Approve a task that is ready for review: its work is merged into the target branch by the same checked merge as always (brought up to date, scope checked, tests run again if it had to merge). Only for a task in "review".', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'reject', description: 'Reject a task that is ready for review: nothing is merged, it goes back to "todo" with the reason in its history, and a fresh worker picks it up. Only for a task in "review".', inputSchema: { type: 'object', required: ['task', 'reason'], properties: { task: { type: 'string' }, reason: { type: 'string', description: 'What is wrong and what to change, for the next worker.' } } } },
  { name: 'retry', description: 'Put a task (back) to "todo" so a worker picks it up again, e.g. after it failed.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'ask', description: 'Make a task wait for the owner with a question.', inputSchema: { type: 'object', required: ['task', 'question'], properties: { task: { type: 'string' }, question: { type: 'string' } } } },
  { name: 'drop', description: 'Stop and drop a task.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'pause', description: `Pause one task: its worker (if running) is stopped and no new worker starts on it until ${N.name} resume.`, inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'resume', description: 'Continue a paused task: it goes back to "todo" and a fresh worker picks it up.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  {
    name: 'setup_git',
    description: `Set up git in a project folder that has no git repo or no commits yet (${N.name} needs one: each worker gets its own git worktree). Only run it after the owner said yes. It runs git init on branch main (if there is no repo), writes or adds to .gitignore (${N.dir}/, node_modules/, .env, .env.*, .DS_Store, dist/, build/, __pycache__/, .venv/), and makes a first commit of the current files, leaving out (and ignoring) files that look like secrets or are over 50 MB. Sets target_branch to that branch. Never pushes, adds no remote.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'settings',
    description: 'Change how the team works: target_branch (the existing branch finished work is merged into; a new board starts on the branch checked out then), test_commands (shell commands that must pass before merging), max_parallel (workers at once), max_minutes (a worker running longer is stopped), auto_retries (new tries a task gets on its own after failing tests, 0-10, default 2), open_on_start (open the board panel by itself when a session starts, default true), voice (say it out loud when a task is merged, e.g. "T-3 done"; only the session driving the board speaks, default true), mode ("off": stop every running worker and scout now and start nothing new, tasks in review can still be approved or rejected; "review": work runs and every finished task that passes waits for the owner to approve or reject it; "auto", the default: work runs and finished work that passes merges on its own; going from off to review or auto starts work again, and going from review to auto does not merge tasks already in review).',
    inputSchema: { type: 'object', properties: { target_branch: { type: 'string', description: 'An existing local branch to merge finished work into.' }, test_commands: { type: 'array', items: { type: 'string' } }, max_parallel: { type: 'number' }, max_minutes: { type: 'number' }, auto_retries: { type: 'number' }, open_on_start: { type: 'boolean' }, voice: { type: 'boolean' }, mode: { type: 'string', enum: ['off', 'review', 'auto'] } } },
  },
]

type In = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined)

/** Task `id` from the board; throws "<id> is not on the board" if there is none. */
async function taskOrThrow($: $, id: string) {
  const t = find(await load($), id)
  if (!t) throw new Error(`${id} is not on the board`)
  return t
}

async function runTool($: $, name: string, a: In): Promise<string> {
  const id = str(a.task) ?? ''
  switch (name) {
    case 'board':
      return boardText(await load($), Date.now(), shortHome(root, home), N.name)
    case 'add': {
      const role = str(a.role)?.trim() ? checkRole(await loadRoles($), str(a.role)!) : undefined
      if (!str(a.why)?.trim()) throw new Error('why is missing: say in one line why this task exists (and fill origin_by, plus request, scout or from_task)')
      const said = { by: a.origin_by, scout: a.scout, task: a.from_task, how: a.how, request: a.request, why: a.why }
      const t = await change($, b => {
        // check what the lead said first, then add the plugin's own evidence next to it
        const o = makeOrigin(said, now(), b)
        return addTask(b, { title: str(a.title) ?? '', details: str(a.details), files: a.files, after: a.after, order: typeof a.order === 'number' ? a.order : undefined, needs_review: a.needs_review === true, backlog: a.backlog === true, role, origin: { ...said, evidence: evidenceText(o, heard) } }, now(), N.dir)
      })
      void pump($)
      return `added ${t.id} ${t.title}${t.status === 'backlog' ? ' (in the backlog; it starts only when moved to todo)' : ''}`
    }
    case 'change': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done') throw new Error(`${t.id} is done; add a new task instead`)
      const role = str(a.role)?.trim() ? checkRole(await loadRoles($), str(a.role)!) : undefined
      const fields = (): Partial<SymccTask> => {
        const p: Partial<SymccTask> = {}
        if (str(a.title)) p.title = str(a.title)
        if (str(a.details)) p.details = str(a.details)
        if (list(a.files)) p.files = list(a.files)
        if (list(a.after)) p.after = list(a.after)
        if (typeof a.order === 'number') p.order = a.order
        if (typeof a.needs_review === 'boolean') p.needs_review = a.needs_review
        if (role) p.role = role
        return p
      }
      if (a.backlog === true) {
        const wasRunning = t.status === 'doing'
        if (t.status !== 'backlog' && !['todo', 'doing', 'paused', 'failed'].includes(t.status)) throw new Error(`${t.id} is ${STATUS_WORD[t.status]}; only a task that is to do, paused or failed can go to the backlog`)
        if (wasRunning) await stopWorker($, t.id, 'moved to the backlog')
        await change($, x => stashTask(patchTask(x, t.id, fields(), now(), N.dir), t.id, now()))
        void pump($)
        return `${t.id} is in the backlog${wasRunning ? ' (its worker was stopped)' : ''}; it starts only when moved to todo`
      }
      if (a.backlog === false) {
        if (t.status !== 'backlog') throw new Error(`${t.id} is not in the backlog (it is ${STATUS_WORD[t.status]})`)
        await change($, x => promoteTask(patchTask(x, t.id, fields(), now(), N.dir), t.id, now()))
        void pump($)
        return `${t.id} moved from the backlog to todo`
      }
      if (t.status === 'backlog') {
        await change($, x => patchTask(x, t.id, fields(), now(), N.dir))
        return `${t.id} updated (still in the backlog)`
      }
      const flagOnly = typeof a.needs_review === 'boolean' && ['title', 'details', 'files', 'after', 'order', 'role'].every(k => a[k] === undefined)
      if (flagOnly) {
        await change($, x => patchTask(x, t.id, { needs_review: a.needs_review as boolean }, now(), N.dir))
        return `${t.id} ${a.needs_review ? 'will wait for review before merging' : 'no longer needs its own review'}`
      }
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, 'the task changed')
      const patch: Partial<SymccTask> = { status: t.status === 'dropped' ? 'dropped' : 'todo', note: wasDoing ? 'changed; restarting' : 'changed' }
      if (str(a.title)) patch.title = str(a.title)
      if (str(a.details)) patch.details = str(a.details)
      if (list(a.files)) patch.files = list(a.files)
      if (list(a.after)) patch.after = list(a.after)
      if (typeof a.order === 'number') patch.order = a.order
      if (typeof a.needs_review === 'boolean') patch.needs_review = a.needs_review
      if (role) patch.role = role
      await change($, x => patchTask(x, t.id, patch, now(), N.dir))
      void pump($)
      return `${t.id} updated${wasDoing ? ' (restarting)' : ''}`
    }
    case 'retry': {
      const t = await taskOrThrow($, id)
      if (t.status === 'doing') return `${t.id} is already running`
      if (t.status === 'done') return `${t.id} is already done`
      await change($, x => patchTask(x, t.id, { status: 'todo', note: 'queued', test_tries: 0 }, now()))
      void pump($)
      return `${t.id} queued`
    }
    case 'ask': {
      const t = await taskOrThrow($, id)
      if (t.status === 'doing') await stopWorker($, t.id, 'waiting for the owner')
      await change($, x => patchTask(x, t.id, { status: 'waiting', question: (str(a.question) ?? '').slice(0, 1000), note: 'waiting for you' }, now()))
      return `${t.id} now waits for the owner`
    }
    case 'drop': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done') throw new Error(`${t.id} is already done`)
      if (t.status === 'doing') await stopWorker($, t.id, 'dropped')
      await change($, x => patchTask(x, t.id, { status: 'dropped', note: str(a.reason) ?? 'dropped' }, now()))
      await removeWorktree($, t.id, worktreeDir(t.id)).catch(() => undefined)
      void pump($)
      return `${t.id} dropped`
    }
    case 'pause': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done' || t.status === 'dropped') return `${t.id} is already ${t.status}`
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, str(a.reason) ?? 'the lead paused this task')
      await change($, x => patchTask(x, t.id, { status: 'paused', note: `paused${str(a.reason) ? `: ${str(a.reason)}` : ''}` }, now()))
      void pump($)
      return `${t.id} paused${wasDoing ? ' (its worker was stopped)' : ''}; ${N.name} resume ${t.id} continues it`
    }
    case 'resume': {
      const t = await taskOrThrow($, id)
      if (t.status !== 'paused') return `${t.id} is not paused (it is ${t.status})`
      await change($, x => patchTask(x, t.id, { status: 'todo', note: 'resumed' }, now()))
      void pump($)
      return `${t.id} resumed`
    }
    case 'approve':
      return approve($, id)
    case 'reject': {
      const reason = str(a.reason) ?? ''
      await change($, x => rejectTask(x, id, reason, now()))
      void pump($)
      return `${find(await load($), id)?.id ?? id} rejected: back to "todo"; a fresh worker picks it up with the reason`
    }
    case 'setup_git':
      return setupGit($, 'the lead')
    case 'settings': {
      const r = await saveSettings($, a, 'the lead')
      if (r.error) return r.error
      const parts = r.changes.map(c => c.said + c.cut)
      if (r.mode) parts.push(r.mode)
      return parts.join('; ') || 'nothing changed'
    }
  }
  throw new Error(`unknown tool ${name}`)
}

/**
 * Saves settings for the lead's settings tool and for the owner (/<name>-settings, the Settings
 * view): the same checks and limits (see applySettings). `error` when nothing changed because
 * mode or target_branch is wrong; `mode` is setBoardMode's answer when the mode was set.
 */
async function saveSettings($: $, a: SettingsInput, who: string): Promise<{ error?: string; changes: SettingChange[]; mode?: string }> {
  const target = str(a.target_branch)?.trim()
  if (a.mode !== undefined && !isMode(a.mode)) return { error: `mode must be "off", "review" or "auto" (got ${JSON.stringify(a.mode)})`, changes: [] }
  if (a.target_branch !== undefined && !(target && (await branchExists($, target)))) {
    return { error: noBranchText(target ?? String(a.target_branch), await branchList($)), changes: [] }
  }
  const changes = await change($, b => {
    const r = applySettings(b, a)
    return [r.board, r.changes] as [Board, SettingChange[]]
  })
  if (target && missingBranch) {
    missingBranch = ''
    toldMissing = ''
    await publish($, await load($))
  }
  const mode = isMode(a.mode) ? await setBoardMode($, a.mode, who) : undefined
  void pump($)
  return { changes, mode }
}

/** The owner changes settings (/<name>-settings or the Settings view): the answer to show, e.g. "max_parallel set to 5"; the lead is told too. */
async function ownerSettings($: $, a: SettingsInput, where: string): Promise<string> {
  // the on/off switch is the owner's alone and works like /<name>-off and /<name>-on
  if (typeof a.enabled === 'boolean') {
    const { enabled, ...rest } = a
    const said = await setSymcc($, enabled)
    return Object.keys(rest).length ? `${said}; ${await ownerSettings($, rest, where)}` : said
  }
  const r = await saveSettings($, a, 'you')
  if (r.error) return r.error
  const parts = r.changes.map(settingSetText)
  if (r.mode) parts.push(`mode set to ${a.mode}: ${r.mode}`)
  const text = parts.join('; ') || 'nothing changed'
  if (parts.length) tellLead($, `The owner changed the ${N.name} settings ${where}: ${text}`)
  return text
}

// ---------------- registration ----------------

/** Registers the worker and scout agent types, the lead's tools and the slash commands. Each one on its own: one failing doesn't stop the rest. */
async function registerAll($: $) {
  const ok = (p: Promise<unknown>) => p.catch(() => undefined)
  await ok($.agent.register({
    name: 'worker',
    description: `${N.name} worker: builds one task from the ${N.name} board in its own worktree. Started by ${N.name} only.`,
    prompt: `You are a ${N.name} worker. You get exactly one task and the folder (your own copy of the project) to do it in. Do it there, keep the change small and inside the task's files, run the tests you were given, and finish with a one or two sentence summary.`,
    tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
    background: true,
    permissionMode: 'acceptEdits',
  }))
  await ok($.agent.register({
    name: 'scout',
    description: `${N.name} scout: does what its scout file asks (reading the project, shell commands, the web) and reports to the lead. Started by ${N.name} only.`,
    prompt: `You are a ${N.name} scout. You do the job your scout file gives you, using the project, the shell and the web, and end with a short plain report (or exactly NOTHING). You never change, create or delete files in the project.`,
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'],
    background: true,
  }))
  for (const t of TOOLS()) await ok($.tool.register({ ...t, isDeferred: false }))
  for (const c of [
    { name: N.name, description: `Open the ${N.name} board panel: tasks and scouts` },
    { name: `${N.name}-tasks`, description: `Open the ${N.name} board panel on the tasks view` },
    { name: `${N.name}-scouts`, description: `Open the ${N.name} board panel on the scouts view and reload the scout files` },
    { name: `${N.name}-task`, description: `Open one ${N.name} task: /${N.name}-task T-3`, argumentHint: '<T-id>' },
    { name: `${N.name}-approve`, description: `Approve a ${N.name} task that is ready for review (merge it): /${N.name}-approve T-5`, argumentHint: '<T-id>' },
    { name: `${N.name}-reject`, description: `Reject a ${N.name} task in review, with the reason: /${N.name}-reject T-5 <reason>`, argumentHint: '<T-id> <reason>' },
    { name: `${N.name}-diff`, description: `Show what a ${N.name} task in review changed, or one file's diff: /${N.name}-diff T-5 [file]`, argumentHint: '<T-id> [file]' },
    { name: `${N.name}-scout`, description: `Run a ${N.name} scout now: /${N.name}-scout <name>`, argumentHint: '<name>' },
    { name: `${N.name}-mode`, description: `Set the ${N.name} board mode: off (nothing runs), review (finished work waits for you) or auto (it merges on its own); no word switches review and auto`, argumentHint: '[off|review|auto]' },
    { name: `${N.name}-settings`, description: `See and change the ${N.name} settings: /${N.name}-settings opens them; /${N.name}-settings max_parallel 5 sets one`, argumentHint: '[name value]' },
    { name: `${N.name}-off`, description: `Turn ${N.name} off for this project: Claude works as normal, nothing runs; the board is kept` },
    { name: `${N.name}-on`, description: `Turn ${N.name} back on for this project, in the mode the board had` },
    { name: N.help, description: `Show the ${N.name} manual: how the board, lead, workers and scouts work, and every command`, argumentHint: '[topic]' },
  ])
    await ok($.command.register(c))
}

export const register: Register = on => {
  // Every hook starts with useName($), so N (the plugin's name) is right everywhere.
  on('session.start', async ($, e, next) => {
    useName($)
    startupDone = false
    // Register the agent types, tools and commands first, before anything that can wait
    // (claimLead may wait for old workers to stop) or throw: a pump started meanwhile, e.g.
    // by a lead tool call, must find the worker type.
    await registerAll($)
    const result = await next(e)
    // Even if a later step throws, pump must not stay blocked for the whole session.
    try {
      root = (await $.session.repo())?.root ?? (await $.session.root())
      // After a rename the old board stays in the old folder: say so once, never move it.
      if (N.dir !== dataDir() && !(await $.fs.exists(path(N.dir))) && (await $.fs.exists(path(dataDir()))))
        $.ui.toast(N.toast(`the old board is in ${dataDir()}/; move it to ${N.dir}/ to keep it`))
      home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
      me = await $.session.id().catch(() => `session-${Math.random().toString(36).slice(2, 10)}`)
      // Become the driver if nobody drives the board. As the driver, old workers still running
      // from before a reload are stopped first and their tasks go back to "todo".
      await claimLead($, true).catch(() => (driving = false))
      if (!(await $.fs.exists(path(N.boardFile)))) await publish($, await load($))
      await scheduleScouts($)
      await loadRoles($).catch(() => undefined)
      await cleanLeftoverTmp($).catch(() => undefined)
      watchdog?.cancel()
      watchdog = $.clock.every(2 * 60_000, () => void check($).catch(() => undefined))
      // The driver refreshes its heartbeat; the others look whether it went stale and take over.
      beat?.cancel()
      beat = $.clock.every(LEAD_BEAT_MS, () =>
        void claimLead($)
          .then(async d => (d ? pump($) : undefined))
          .catch(() => undefined),
      )
      const b = await load($)
      // Look at git once now: with no git, no repo or no commit, the lead is told (once) and nothing starts.
      await gitReady($, b).catch(() => undefined)
      await publish($, b)
      // Open the board panel by itself (every session, driver or not), without taking the cursor
      // from the prompt. On a narrow terminal Claude Code may not place it (isPlaced: false);
      // that is fine: the band above the prompt and /<name> still work.
      if (openOnStart(b) && symccOn(b)) await openPane($, { focus: false, quiet: true })
    } finally {
      startupDone = true
    }
    void pump($)
    return result
  })

  on('session.end', async ($, e, next) => {
    useName($)
    // /clear ends the session but the process goes on under a new session id, and no
    // session.start follows: keep the timers, workers and scouts, and hand over to the new id.
    if ((e as { reason?: string }).reason === 'clear') {
      const result = await next(e)
      await handOver($).catch(() => undefined)
      return result
    }
    for (const t of timers.splice(0)) t.cancel()
    watchdog?.cancel()
    watchdog = null
    beat?.cancel()
    beat = null
    await releaseLead($)
    return next(e)
  })

  // The lead's guide, appended to the system prompt.
  on('prompt.compose', async ($, e, next) => {
    useName($)
    const r = await next(e)
    // Read on every render (prompt.compose is not cached), so /<name>-off and /<name>-on count from the next message.
    if (!(await isOn($))) return r
    return { sections: [...r.sections, { id: `${N.name}:lead`, text: leadGuide(), scope: 'session' as const }] }
  })

  // Keep the owner's last typed prompt (at the terminal or from the phone/web bridge), so a task
  // added after it can point back to the request. Slash commands, hidden prompts and the plugin's
  // own "[name] Update" messages are not the owner's request and are left out.
  on('prompt.submit', async ($, e, next) => {
    useName($)
    const r = await next(e)
    const kind = e.origin?.kind
    if ((kind === 'composer' || kind === 'bridge') && !e.command && !e.isMeta && 'text' in r && typeof r.text === 'string' && r.text.trim()) heard.owner = { text: r.text.trim().slice(0, 2000), at: now() }
    return r
  })

  // Workers and scouts only reach the agents through the plugin itself.
  // (The name is only known once a hook runs, so these match inside rather than by a filter.)
  on('agent.offer', ($, e, next) => {
    useName($)
    return e.agent === N.worker || e.agent === N.scout ? { isOffered: false } : next(e)
  })

  // One tool.call hook for every tool (the name is only known once a hook runs):
  // a worker or scout the plugin stopped can't do anything more, so every tool it tries is
  // refused; and the lead's own tools, mcp__<name>__<tool>, run here.
  const toolNames = TOOLS().map(t => t.name)
  on('tool.call', async ($, e, next) => {
    useName($)
    if (e.agentId && stopped.has(e.agentId)) return { deny: `${N.name} stopped this agent. Do nothing more; answer "stopped" and end.` }
    const name = toolNames.find(t => e.tool === N.tool(t))
    if (!name) return next(e)
    if (!(await isOn($))) return { result: offAnswer(N.name) }
    try {
      return { result: await runTool($, name, e as unknown as In) }
    } catch (err) {
      return { result: `error: ${(err as Error).message}` }
    }
  })

  // A worker's or scout's run ended: its final answer arrives here.
  on('turn.complete', async ($, e, next) => {
    useName($)
    const r = await next(e)
    if (e.agentId && workers.has(e.agentId)) void workerFinished($, e.agentId, e.answer, e.isAborted, usageTokens(e.usage))
    else if (e.agentId && scoutRuns.has(e.agentId)) void scoutFinished($, e.agentId, e.answer)
    return r
  })

  // Editing a scout file reschedules the scouts.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    useName($)
    const r = await next(e)
    if (String((e as { file_path?: string }).file_path ?? '').includes(`${N.scouts}/`)) void scheduleScouts($)
    if (String((e as { file_path?: string }).file_path ?? '').includes(`${N.dir}/roles/`)) void loadRoles($).catch(() => undefined)
    return r
  })

  // Every slash command starts with the plugin's name (see parseCommand): /<name> opens the
  // panel, /<name>-<word> does one thing. Registered under the plugin's name, so matched here.
  on('command.run', async ($, e, next) => {
    useName($)
    if (!commandNames(N.name).includes(e.command)) return next(e)
    const b = await load($)
    const cmd = parseCommand(e.command, e.args, modeOf(b), N.name)
    if (!cmd) return next(e)
    const say = (text: string) => ({ text, isTextDisplayOnly: true })
    switch (cmd.kind) {
      case 'bad':
        return say(cmd.message)
      case 'help':
        return say(manual(cmd.topic))
      case 'open':
      case 'tasks':
        await openPane($, cmd.kind === 'tasks' ? { tab: 'tasks' } : {})
        return say(`Board opened: ↑↓ to move, Enter to open, t tasks, s scouts, c settings, Esc to close. (ctrl+x tab goes back to it.)`)
      case 'scouts': {
        const defs = await scheduleScouts($)
        await publish($, await load($))
        // Open the panel on the Scouts view; the text list below is the fallback when it can't be placed.
        const placed = await openPane($, { tab: 'scouts' }).then(r => r.isPlaced).catch(() => false)
        if (placed) return say(`Scouts opened: Enter opens a scout, t tasks, Esc closes.`)
        if (!defs.length) return { text: `No scouts yet. Add one as ${N.scouts}/<name>.md:\n---\nevery_minutes: 30\n---\nLook for missing tests around risky code.` }
        return { text: defs.map(d => `${d.name}: every ${d.every_minutes} min${scoutState.get(d.name)?.last_run ? `, last ran ${scoutState.get(d.name)!.last_run!.slice(11, 16)}` : ''}${scoutState.get(d.name)?.running ? ' (running now)' : ''}`).join('\n') }
      }
      case 'scout':
        return { text: await runScoutNow($, cmd.name) }
      case 'settings': {
        settingEdit = null
        settingPick = null
        const placed = await openPane($, { tab: 'settings' }).then(r => r.isPlaced).catch(() => false)
        if (placed) return say(`Settings opened: Enter on a row changes it, t tasks, s scouts, Esc closes.`)
        return say(settingsText(b, N.name))
      }
      case 'set':
        return say(await ownerSettings($, cmd.input, `with /${N.name}-settings`))
      case 'off':
      case 'on':
        return say(await setSymcc($, cmd.kind === 'on'))
      case 'mode': {
        const r = await setBoardMode($, cmd.mode, 'you')
        tellLead($, `The owner set the board mode to ${cmd.mode} with /${N.name}-mode: ${r}`)
        return say(r)
      }
      case 'show': {
        const t = find(b, cmd.id)
        if (!t) return say(`${cmd.id} is not on the board.`)
        await openPane($, { tab: 'tasks', task: t.id })
        return say(taskText(t, [...workers.values()].some(w => w.task === t.id), b.tasks))
      }
      case 'approve':
      case 'reject': {
        const t = find(b, cmd.id)
        if (!t) return say(`${cmd.id} is not on the board.`)
        if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}).`)
        const r = await runTool($, cmd.kind, cmd.kind === 'reject' ? { task: t.id, reason: cmd.reason } : { task: t.id }).catch((err: Error) => `error: ${err.message}`)
        tellLead($, cmd.kind === 'approve' ? `The owner approved ${t.id} with /${N.name}-approve: ${r}` : `The owner rejected ${t.id} with /${N.name}-reject ("${cmd.reason}"): ${r}`)
        return say(r)
      }
      case 'diff': {
        const t = find(b, cmd.id)
        if (!t) return say(`${cmd.id} is not on the board.`)
        if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}); /${N.name}-diff shows the changes of a task in review.`)
        try {
          const files = await changedFiles($, b.target_branch, t)
          if (!cmd.file) return say(statText(t.id, files, N.name))
          const f = cmd.file.replace(/^\.\//, '')
          if (!files.some(x => x.file === f)) return say(`${t.id} did not change ${f}. Changed: ${files.map(x => x.file).join(', ') || 'nothing'}`)
          const text = await changesText($, b.target_branch, t, f)
          return say(cutDiff(text, t.id, 5000, f, N.name).join('\n') || `${f}: no text changes (binary?)`)
        } catch (err) {
          return say(`Could not read the changes of ${t.id}: ${(err as Error).message}`)
        }
      }
    }
    return next(e)
  })

  // The band above the prompt: the board, always in view inside Claude Code's own screen.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    useName($)
    if (e.props.hasSurvey || e.props.view.agentId) return next(e)
    const v = await read($, view)
    const tasks = v?.tasks ?? []
    if (!tasks.length || (v as PaneView | undefined)?.enabled === false) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const summary = statusCounts(tasks, ['doing', 'todo', 'paused', 'review', 'waiting', 'failed', 'done']).join(' · ')
    const order = ['review', 'waiting', 'failed', 'doing']
    const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
    const room = Math.max(1, Math.min(6, (e.props.maxRows ?? 8) - 1))
    const color: Record<string, string> = { review: 'cyan', waiting: 'yellow', failed: 'red', doing: 'green' }
    const word: Record<string, string> = STATUS_WORD
    const running = (v?.scouts ?? []).filter(s => s.running).map(s => s.name)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text wrap="truncate">
          <Text bold color={'ide' as never}>{boardBrand(N.name)}</Text>
          <Text dimColor>
            {boardWhere(root)}{' '}
            {summary}
            {` · ${modeLabel(modeOf(v))}`}
            {running.length ? ` · scouting: ${running.join(', ')}` : ''}{' '}
          </Text>
          </Text>
          <Button key="open-board" label="open board" dimColor onPress={() => void openPane($)} />
        </Box>
        {live.slice(0, room).map(t => (
          <Text wrap="truncate">
            <Text color={color[t.status] as never}>
              {t.id} {word[t.status]}
            </Text>
            <Text> {t.title}</Text>
            <Text dimColor>{t.status === 'waiting' ? ` — ${t.question ?? t.note}` : t.note ? ` — ${t.note}` : ''}</Text>
          </Text>
        ))}
        {live.length > room && <Text dimColor>+{live.length - room} more · /{N.name}</Text>}
      </Box>
    )
  })

  // Esc in an opened scout goes back to the Scouts list (the panel stays open).
  // Opened days and the active view are forgotten when the board panel closes.
  on('ui.close', async ($, e, next) => {
    useName($)
    if (e.id !== N.pane) return next(e)
    // Esc in the reject box or the role pick list cancels it; Esc in a task's changes goes back to the task.
    if (e.origin.kind === 'person' && (rejecting || diffOpen || rolePick) && (await read($, tab)) !== 'scouts' && (await read($, opened))) {
      if (rolePick) rolePick = null
      else if (rejecting) rejecting = null
      else diffOpen = null
      $.ui.invalidate('ui.render')
      return { value: undefined }
    }
    // Esc in a setting's edit box or pick list cancels it.
    if (e.origin.kind === 'person' && (settingEdit || settingPick) && (await read($, tab)) === 'settings') {
      settingEdit = null
      settingPick = null
      $.ui.invalidate('ui.render')
      return { value: undefined }
    }
    // Esc in a scout's edit mode (or the new scout name box) cancels it.
    if (e.origin.kind === 'person' && (draft || naming) && (await read($, tab)) === 'scouts') {
      cancelScoutEdit($)
      return { value: undefined }
    }
    if (e.origin.kind === 'person' && (await read($, tab)) === 'scouts' && (await read($, scoutOpen))) {
      await update($, scoutOpen, () => '')
      return { value: undefined }
    }
    openDays.clear()
    backlogOpen = false
    backlogAll = false
    draft = null
    naming = null
    diffOpen = null
    rejecting = null
    rolePick = null
    settingEdit = null
    settingPick = null
    changesCache.clear()
    await update($, tab, () => '').catch(() => undefined)
    await update($, scoutOpen, () => '').catch(() => undefined)
    return next(e)
  })

  // The board panel: the list (each task a button), or one task with its actions.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    useName($)
    if (e.requestId !== N.pane) return next(e)
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const v: PaneView = await read($, view)
    const open = await read($, opened)
    const width = Math.max(20, e.props.bodyColumns ?? 60)
    // Theme colors, so the board reads well in both light and dark themes.
    const color: Record<string, string> = { backlog: 'subtle', review: 'suggestion', waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }
    const word: Record<string, string> = STATUS_WORD
    const mark: Record<string, string> = { backlog: '◇', review: '◆', waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }
    const act = (fn: () => Promise<unknown>) => () => void fn().catch((err: Error) => $.ui.toast(N.toast(err.message)))
    const tabNow = await read($, tab)
    const onScouts = tabNow === 'scouts'
    const onSettings = tabNow === 'settings'
    const t = open && !onScouts && !onSettings ? v.tasks.find(x => x.id === open) : undefined
    const C = (c: string) => c as never
    const scouts = sortScouts(Array.isArray(v.scouts) ? v.scouts : [])
    const mode = modeOf(v)
    /** What the m key switches to: review and auto swap; from off it goes to review (m never turns the board off). */
    const switchTo: SymccMode = nextMode(mode)
    const target = v.target_branch ?? emptyBoard().target_branch
    /** Switches the board mode between review and auto, the same as /<name>-mode with no word. */
    const switchMode = act(async () => {
      const r = await setBoardMode($, switchTo, 'you')
      $.ui.toast(N.toast(r))
      tellLead($, `The owner set the board mode to ${switchTo} from the board: ${r}`)
    })
    /** The banner at the top: the drawing, the board's facts and the board mode. */
    const banner = () => {
      const d = emptyBoard()
      const facts = { ...v, target_branch: v.target_branch ?? d.target_branch, max_parallel: v.max_parallel ?? d.max_parallel, max_minutes: v.max_minutes ?? d.max_minutes, auto_retries: v.auto_retries ?? d.auto_retries }
      const tone: Record<BannerTone, string> = { accent: 'ide', plain: 'text', dim: 'subtle', warning: 'warning' }
      return [
        ...bannerLines(facts, root, home, v.driving ?? driving, width, Date.now(), N.name).map((l, i) => (
          <Text key={`banner-${i}`} wrap="truncate">
            {l.art ? <Text color={C(l.art.trim() ? 'ide' : 'subtle')}>{l.art}</Text> : null}
            {l.parts.map(p => (
              <Text bold={p.bold} color={C(tone[p.tone])}>{p.text}</Text>
            ))}
          </Text>
        )),
        <Box key="banner-mode" flexDirection="row">
          <Text wrap="truncate">
            <Text bold color={C(mode === 'off' ? 'warning' : mode === 'review' ? 'suggestion' : 'text')}>{modeLabel(mode)}</Text>{' '}
          </Text>
          <Button key="mode" label={modeButton(mode)} hotkey="m" dimColor onPress={switchMode} />
        </Box>,
        ...(v.git_state === 'no-repo' || v.git_state === 'no-commits'
          ? [
              <Box key="banner-git" flexDirection="row">
                <Text wrap="truncate" color={C('warning')}>{v.git_state === 'no-repo' ? 'No git repo here; nothing starts. ' : 'No commits yet; nothing starts. '}</Text>
                <Button key="setup-git" label="Set up git (g)" hotkey="g" onPress={act(async () => $.ui.toast(N.toast(await setupGit($, 'you'))))} />
              </Box>,
            ]
          : []),
      ]
    }
    /** The tab row under the banner: "[t] Tasks (12) │ [s] Scouts (3) │ [c] Settings", the active one bold in the accent color. "t", "s" and "c" switch. */
    const tabs = () => {
      const go = (which: PaneTab) => act(async () => ((draft = null), (naming = null), (diffOpen = null), (rejecting = null), (settingEdit = null), (settingPick = null), await resetPane($, which)))
      const one = (which: PaneTab, label: string) => {
        const active = which === 'scouts' ? onScouts : which === 'settings' ? onSettings : !onScouts && !onSettings
        return (
          <Button key={`tab-${which}`} hotkey={which === 'settings' ? 'c' : which[0]} onPress={go(which)}>
            <Text bold={active} color={C(active ? 'ide' : 'subtle')}>{label}</Text>
          </Button>
        )
      }
      return (
        <Box key="tabs" flexDirection="row">
          {one('tasks', `[t] Tasks (${v.tasks.length})`)}
          <Text color={C('subtle')}> │ </Text>
          {one('scouts', `[s] Scouts (${scouts.length})`)}
          <Text color={C('subtle')}> │ </Text>
          {one('settings', '[c] Settings')}
        </Box>
      )
    }
    /** The whole header: banner, then the tab row, then the rule under them. */
    const header = () => [...banner(), tabs(), <Text key="header-rule" wrap="truncate" color={C('ide')}>{bannerRule(width)}</Text>]
    const HINT = 'Enter opens · t tasks · s scouts · c settings · Esc closes'

    /** Text with task IDs, `code` and file paths picked out in color. */
    const rich = (text: string, base = 'text') => {
      const parts = text.split(/(\bT-\d+\b|`[^`\n]+`|(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:md|ts|tsx|js|json|py|txt|csv|yml|yaml)\b)/g)
      return parts.map((p, i) =>
        i % 2 === 0 ? (
          p
        ) : /^T-\d+$/.test(p) ? (
          <Text bold color={C('claude')}>{p}</Text>
        ) : p.startsWith('`') ? (
          <Text color={C('ide')}>{p.slice(1, -1)}</Text>
        ) : (
          <Text color={C('autoAccept')}>{p}</Text>
        ),
      ).map(x => (typeof x === 'string' ? (x ? <Text color={C(base)}>{x}</Text> : null) : x))
    }

    // Shared by the task page and the scout page.
    const heading = (label: string) => (
      <Text bold color={C('suggestion')}>
        ▍{label}
      </Text>
    )
    // The details, line by line: headings, bullets and numbered steps stand out.
    const paragraphs = (text: string) =>
      text.split(/\n/).map((line, i) => {
        if (!line.trim()) return <Text key={`gap-${i}`}> </Text>
        const head = /^\s*#{1,6}\s+(.*)$/.exec(line)
        if (head) return <Text bold color={C('claude')}>{head[1]}</Text>
        const li = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(line)
        if (li)
          return (
            <Text>
              {li[1]}
              <Text color={C('claude')}>{/\d/.test(li[2]!) ? li[2] : '•'}</Text> {rich(li[3]!)}
            </Text>
          )
        const kv = /^(\s*)([A-Z][\w ]{1,30}):\s+(.*)$/.exec(line)
        if (kv)
          return (
            <Text>
              {kv[1]}
              <Text bold color={C('text')}>{kv[2]}:</Text> {rich(kv[3]!)}
            </Text>
          )
        return <Text>{rich(line)}</Text>
      })
    if (onSettings) {
      const nameWidth = Math.max(...SETTINGS.map(x => x.name.length))
      const saveIt = (input: SettingsInput) => act(async () => {
        const r = await ownerSettings($, input, 'from the board')
        settingEdit = null
        settingPick = null
        $.ui.toast(N.toast(r))
        $.ui.invalidate('ui.render')
      })
      /** Enter on a row: on/off flips, mode and target_branch open a pick list, the rest an edit box. */
      const pressRow = (name: SettingName) => act(async () => {
        const info = SETTINGS.find(x => x.name === name)!
        const now = settingValue(v, name)
        if (info.kind === 'onoff') return saveIt({ [name]: now !== 'on' })()
        settingEdit = null
        settingPick = null
        if (info.kind === 'mode') settingPick = { name, options: ['off', 'review', 'auto'] }
        else if (info.kind === 'branch') settingPick = { name, options: await branchList($) }
        else settingEdit = { name, value: now === 'none' && info.kind === 'commands' ? '' : now, error: '' }
        $.ui.invalidate('ui.render')
      })
      const editBox = (name: SettingName) => {
        if (settingEdit?.name !== name) return null
        const ed = settingEdit
        const info = SETTINGS.find(x => x.name === name)!
        return (
          <Box key={`setting-box-${name}`} flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
            <Input
              key="setting-edit"
              label={`${name}: `}
              value={ed.value}
              placeholder={info.kind === 'commands' ? 'e.g. npm test && npm run lint (empty: none)' : `a whole number, ${info.range}`}
              autoFocus
              onInput={value => void (ed.value = value)}
              onSubmit={value => {
                const r = parseSettingValue(name, info.kind === 'commands' && !value.trim() ? 'none' : value)
                if (!r.ok) return void ((ed.error = r.message), $.ui.invalidate('ui.render'))
                saveIt(r.input)()
              }}
            />
            {ed.error ? <Text color={C('error')}>{ed.error}</Text> : null}
            <Text color={C('subtle')}>{info.kind === 'commands' ? 'join commands with " && " · ' : ''}Enter saves · Esc cancels</Text>
          </Box>
        )
      }
      const pickBox = (name: SettingName) => {
        if (settingPick?.name !== name) return null
        const now = settingValue(v, name)
        return (
          <Box key={`setting-pick-${name}`} flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
            {settingPick.options.length ? null : <Text color={C('warning')}>No local branches found.</Text>}
            {settingPick.options.map(o => (
              <Button key={`pick:${o}`} autoFocus={o === now ? true : undefined} onPress={saveIt({ [name]: o })}>
                <Text bold={o === now} color={C(o === now ? 'ide' : 'text')}>{o === now ? `● ${o}` : `○ ${o}`}</Text>
              </Button>
            ))}
            <Button key="setting-cancel" label="Cancel" onPress={() => ((settingPick = null), $.ui.invalidate('ui.render'))} />
            <Text color={C('subtle')}>Enter picks · Esc cancels</Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {header()}
          {SETTINGS.flatMap((x, i) => [
            <Button key={`setting:${x.name}`} autoFocus={i === 0 && !settingEdit && !settingPick ? true : undefined} onPress={pressRow(x.name)}>
              <Text bold color={C('claude')}>{x.name.padEnd(nameWidth)}</Text>
              <Text bold color={C('text')}> {settingValue(v, x.name)}</Text>
              <Text color={C('subtle')}> · default {x.default} · {x.range} · {x.meaning}</Text>
            </Button>,
            ...[editBox(x.name), pickBox(x.name)].filter(Boolean),
          ])}
          <Text wrap="truncate" color={C('subtle')}>Enter changes a setting (on/off flips) · /{N.name}-settings NAME VALUE · or tell the lead</Text>
          <Text wrap="truncate" color={C('subtle')}>{HINT.replace('Enter opens · ', '')}</Text>
        </Box>
      )
    }
    if (onScouts && draft) {
      // A scout's edit mode: the same header as its page, then a box per part of its file.
      const d = draft
      const sc = scouts.find(x => x.name === d.scout)
      const r = sc ? scoutRow(sc, Date.now()) : undefined
      const file = scoutFile(d.scout, N.name)
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text>
              <Text bold color={C('claude')}>{d.scout}</Text>{' '}
              <Text bold color={C('warning')}>{d.isNew ? 'new scout' : 'editing'}</Text>
              {r ? <Text color={C('subtle')}> · {r.every}{r.model ? ` · ${r.model}` : ''} · {r.ran}</Text> : null}
            </Text>
            <Text color={C('subtle')}>save writes {file}</Text>
          </Box>

          <Box flexDirection="row" gap={1}>
            <Button key="scout-save" label="Save" onPress={act(() => saveScout($))} />
            <Button key="scout-cancel" label="Cancel" onPress={() => cancelScoutEdit($)} />
          </Box>

          {d.error ? <Text color={C('error')}>{d.error}</Text> : null}

          <Box flexDirection="column">
            {heading('every (minutes)')}
            <Input key="scout-every" value={d.every} placeholder="a whole number, 1 or more" autoFocus submitLabel="keep" onInput={value => void (d.every = value)} onSubmit={value => void (d.every = value)} />
          </Box>

          <Box flexDirection="column">
            {heading('model')}
            <Input key="scout-model" value={d.model} placeholder="empty: the session's model" submitLabel="keep" onInput={value => void (d.model = value)} onSubmit={value => void (d.model = value)} />
          </Box>

          <Box flexDirection="column">
            {heading('instructions')}
            <Input key="scout-body" value={d.body} rows={8} placeholder="what to look for, in plain words" submitLabel="keep" onInput={value => void (d.body = value)} onSubmit={value => void (d.body = value)} />
          </Box>
          <Text color={C('subtle')}>↑↓ move between boxes · other front matter keys are kept · Esc cancels</Text>
        </Box>
      )
    }
    if (onScouts) {
      const nowMs = Date.now()
      const opener = await read($, scoutOpen)
      const sc = typeof opener === 'string' && opener ? scouts.find(x => x.name === opener) : undefined
      if (sc) {
        const r = scoutRow(sc, nowMs)
        const file = scoutFile(sc.name, N.name)
        const report = scoutReport(sc.last_report)
        const title = (sc.prompt ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? sc.name
        return (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text>
                <Text bold color={C('claude')}>{sc.name}</Text>{' '}
                {r.state ? (
                  <Text bold color={C(sc.running ? 'success' : 'text')}>
                    {sc.running ? '▶ ' : ''}
                    {r.state}
                  </Text>
                ) : null}
                <Text color={C('subtle')}>
                  {r.state ? ' · ' : ''}
                  {r.every}
                  {r.model ? ` · ${r.model}` : ''} · {r.ran}
                </Text>
              </Text>
              <Text bold color={C('text')}>
                {title}
              </Text>
            </Box>

            <Box flexDirection="row" gap={1}>
              <Button key="scout-back" label="Back" hotkey="b" autoFocus onPress={act(() => update($, scoutOpen, () => ''))} />
              <Button key="scout-run" label="Run now" hotkey="r" onPress={act(async () => $.ui.toast(N.toast(await runScoutNow($, sc.name))))} />
              <Button key="scout-edit" label="Edit" hotkey="e" onPress={act(() => editScout($, sc))} />
            </Box>

            <Box flexDirection="column">
              {heading('What it looks for')}
              {sc.prompt?.trim() ? paragraphs(sc.prompt.trim()) : <Text color={C('subtle')}>(not loaded yet: run /{N.name}-scouts)</Text>}
            </Box>

            <Box flexDirection="column">
              {heading('Last report')}
              {report === 'nothing found' ? <Text color={C('subtle')}>{sc.last_run ? 'nothing found' : 'nothing found (it has not run yet)'}</Text> : paragraphs(report)}
            </Box>

            <Box flexDirection="column">
              {heading('File')}
              <Text>
                {'  '}
                <Text color={C('autoAccept')}>{file}</Text>
              </Text>
            </Box>
            <Text color={C('subtle')}>↑↓ scroll · b back · r run now · e edit</Text>
          </Box>
        )
      }
      /** "New scout": a button, or (once pressed) the box that asks for its name. */
      const newBox = () =>
        naming ? (
          <Box flexDirection="column">
            <Input
              key="scout-new-name"
              label="New scout's name: "
              placeholder="letters, digits, - and _"
              value={naming.name}
              autoFocus
              submitLabel="next"
              onInput={value => void (naming && (naming.name = value))}
              onSubmit={value => act(() => newScout($, value, scouts.map(x => x.name)))()}
            />
            {naming.error ? <Text color={C('error')}>{naming.error}</Text> : null}
            <Text color={C('subtle')}>Enter goes on to its file · Esc cancels</Text>
          </Box>
        ) : (
          <Button key="scout-new" label="New scout" hotkey="n" autoFocus={scouts.length === 0 ? true : undefined} onPress={() => ((naming = { name: '', error: '' }), $.ui.invalidate('ui.render'))} />
        )
      const nameWidth = Math.max(4, ...scouts.map(x => x.name.length))
      const everyWidth = Math.max(0, ...scouts.map(x => scoutRow(x, nowMs).every.length))
      return (
        <Box flexDirection="column">
          {header()}
          {scouts.length === 0 && scoutHowTo(N.name).map((line, i) => <Text color={C(i === 0 ? 'text' : 'subtle')}>{line}</Text>)}
          {newBox()}
          {scouts.map((x, i) => {
            const r = scoutRow(x, nowMs)
            return (
              <Button key={`scout:${x.name}`} autoFocus={i === 0 ? true : undefined} onPress={act(() => update($, scoutOpen, () => x.name))}>
                <Text bold color={C('claude')}>{x.name.padEnd(nameWidth)}</Text>
                <Text color={C('subtle')}> {r.every.padEnd(everyWidth)}</Text>
                {r.model ? <Text color={C('subtle')}> · {r.model}</Text> : null}
                {r.state ? <Text color={C(x.running ? 'success' : 'text')}> · {r.state}</Text> : null}
                <Text color={C('subtle')}> · {r.ran}</Text>
              </Button>
            )
          })}
          {scouts.length > 0 && <Text wrap="truncate" color={C('subtle')}>Enter opens a scout · run now / edit on its page · /{N.name}-scout &lt;name&gt;</Text>}
          {scouts.length > 0 && <Text wrap="truncate" color={C('subtle')}>{HINT}</Text>}
        </Box>
      )
    }
    if (t) {
      if (!roles.length) await loadRoles($).catch(() => undefined)
      const agentId = [...workers.entries()].find(([, w]) => w.task === t.id)?.[0]
      const inReview = t.status === 'review'
      const showDiff = (file: string) => () => ((diffOpen = { task: t.id, file }), $.ui.invalidate('ui.render'))
      const approveIt = act(async () => {
        const r = await runTool($, 'approve', { task: t.id })
        diffOpen = null
        rejecting = null
        $.ui.toast(N.toast(r))
        tellLead($, `The owner approved ${t.id} from the board: ${r}`)
      })
      const askReason = () => ((rejecting = { task: t.id, reason: '' }), $.ui.invalidate('ui.render'))
      const reviewButtons = inReview
        ? [<Button key="approve" label="Approve" hotkey="a" onPress={approveIt} />, <Button key="reject" label="Reject" hotkey="x" onPress={askReason} />]
        : []
      /** The box that asks why, once Reject was pressed. */
      const rejectBox =
        inReview && rejecting?.task === t.id ? (
          <Box flexDirection="column" borderStyle="round" borderColor={C('error')} paddingX={1}>
            <Input
              key="reject-reason"
              label="Why reject it? "
              placeholder="what to change, for the next worker; Enter sends it back"
              value={rejecting.reason}
              autoFocus
              onInput={value => void (rejecting && (rejecting.reason = value))}
              onSubmit={value =>
                act(async () => {
                  const why = value.trim()
                  if (!why) return void $.ui.toast(N.toast('give a short reason, so the next worker knows what to fix'))
                  const r = await runTool($, 'reject', { task: t.id, reason: why })
                  rejecting = null
                  diffOpen = null
                  $.ui.toast(N.toast(r))
                  tellLead($, `The owner rejected ${t.id} from the board: "${why}". ${r}`)
                })()
              }
            />
            <Text color={C('subtle')}>Enter sends it back to "todo" with the reason · Esc cancels</Text>
          </Box>
        ) : null
      if (inReview && diffOpen?.task === t.id) {
        // The changes themselves: the diff against the merge base, colored line by line.
        const d = diffOpen
        const got = await changesText($, target, t, d.file).then(
          x => ({ lines: cutDiff(x, t.id, DIFF_LINES, d.file, N.name), error: '' }),
          (err: Error) => ({ lines: [] as string[], error: err.message }),
        )
        const kinds = diffKinds(got.lines)
        return (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text>
                <Text bold color={C('claude')}>{t.id}</Text>{' '}
                <Text bold color={C(color.review!)}>
                  {mark.review} {word.review}
                </Text>
                <Text color={C('subtle')}> · changes in {d.file || 'all files'}</Text>
              </Text>
              <Text bold color={C('text')}>
                {t.title}
              </Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Button key="diff-back" label="Back" hotkey="b" autoFocus={rejectBox ? undefined : true} onPress={() => ((diffOpen = null), $.ui.invalidate('ui.render'))} />
              {reviewButtons}
              {d.file ? <Button key="diff-all" label="All files" hotkey="d" onPress={showDiff('')} /> : null}
            </Box>
            {rejectBox}
            <Box flexDirection="column">
              {got.error ? <Text color={C('error')}>Could not read the changes: {got.error}</Text> : null}
              {!got.error && !got.lines.length ? <Text color={C('subtle')}>no text changes</Text> : null}
              {got.lines.map((l, i) => (
                <Text key={`diff-${i}`} bold={kinds[i] === 'hunk' || (kinds[i] === 'header' && l.startsWith('diff '))} color={C(DIFF_COLOR[kinds[i]!])}>
                  {l.replace(/\t/g, '    ') || ' '}
                </Text>
              ))}
            </Box>
            <Text color={C('subtle')}>↑↓ scroll · b back to the task · a approve · x reject{d.file ? ' · d all files' : ''}</Text>
          </Box>
        )
      }
      // The owner's role override: a pick list of the known roles, set the same way as the lead's change role.
      const canPickRole = ['todo', 'paused', 'failed', 'backlog'].includes(t.status)
      if (rolePick && (rolePick.task !== t.id || !canPickRole)) rolePick = null
      const openRolePick = act(async () => {
        rolePick = { task: t.id, options: roleChoices(await loadRoles($).catch(() => roles)) }
        $.ui.invalidate('ui.render')
      })
      const pickRole = (name: string) =>
        act(async () => {
          rolePick = null
          $.ui.invalidate('ui.render')
          const r = await runTool($, 'change', { task: t.id, role: name })
          $.ui.toast(N.toast(`${t.id} role: ${name}`))
          tellLead($, `The owner set the role of ${t.id} to ${name} from the board: ${r}`)
        })
      const nowRole = roleOf(t).toLowerCase()
      const roleBox =
        rolePick?.task === t.id ? (
          <Box flexDirection="column" borderStyle="round" borderColor={C('ide')} paddingX={1}>
            <Text bold color={C('text')}>Pick a role for {t.id}</Text>
            {rolePick.options.map(o => {
              const cur = o.toLowerCase() === nowRole
              const d = findRole(roles, o)?.description
              return (
                <Button key={`role:${o}`} autoFocus={cur ? true : undefined} onPress={pickRole(o)}>
                  <Text bold={cur} color={C(cur ? 'ide' : 'text')}>{cur ? `● ${o}` : `○ ${o}`}</Text>
                  {d ? <Text color={C('subtle')}> — {d}</Text> : null}
                </Button>
              )
            })}
            <Button key="role-cancel" label="Cancel" onPress={() => ((rolePick = null), $.ui.invalidate('ui.render'))} />
            <Text color={C('subtle')}>Enter picks · Esc cancels</Text>
          </Box>
        ) : null
      // A task in review: the files it changed, each opening its diff.
      const changes = inReview
        ? await changedFiles($, target, t).then(
            files => ({ files, error: '' }),
            (err: Error) => ({ files: [] as DiffFile[], error: err.message }),
          )
        : null
      const fileWidth = Math.max(4, ...(changes?.files ?? []).map(f => f.file.length))
      // History lines: the try number, then the result colored by how it went.
      const historyLine = (line: string) => {
        const m = /^(try \S+:)\s*(.*)$/.exec(line)
        const body = m ? m[2]! : line
        const [said, result] = body.includes(' → ') ? [body.slice(0, body.lastIndexOf(' → ')), body.slice(body.lastIndexOf(' → ') + 3)] : [body, '']
        const bad = /not merged|fail|stopped|refused|error|outside|without a result/i.test(result || body)
        const good = /merged into|^merged/i.test(result)
        return (
          <Text>
            <Text color={C(bad ? 'error' : good ? 'success' : 'subtle')}>{bad ? '✗' : good ? '✓' : '•'}</Text>{' '}
            {m && <Text bold color={C('subtle')}>{m[1]} </Text>}
            <Text color={C('subtle')}>{said}</Text>
            {result && (
              <Text color={C(bad ? 'error' : good ? 'success' : 'text')}>
                {' '}→ {result}
              </Text>
            )}
          </Text>
        )
      }
      // One line of colored pieces (from detailRowLines / wrapSegs).
      const segLine = (segs: Seg[], key: string) => (
        <Text key={key}>
          {segs.map((g, i) => (
            <Text key={`${key}-${i}`} bold={g.bold} italic={g.italic} color={C(g.color)}>
              {g.text}
            </Text>
          ))}
        </Text>
      )
      const rows = detailRows(t, { roles, all: v.tasks, when, nowMs: Date.now() })
      if (shownTask !== t.id) detailsOpen = false
      shownTask = t.id
      const fold = foldDetails(t.details, detailsOpen)
      const toggleDetails = () => ((detailsOpen = !detailsOpen), $.ui.invalidate('ui.render'))
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            {wrapSegs([{ text: t.id, color: 'claude', bold: true }, { text: `  ${t.title}`, color: 'text', bold: true }], width).map((l, i) => segLine(l, `title-${i}`))}
            <Text>
              <Text bold color={C(STATUS_BADGE[t.status])}>{`[${STATUS_MARK[t.status]} ${word[t.status]}]`}</Text>
              {agentId ? <Text color={C('subtle')}> · a worker is on it now</Text> : null}
            </Text>
          </Box>

          <Box flexDirection="row" gap={1}>
            <Button key="back" label="Back" hotkey="b" autoFocus={t.status === 'waiting' || rejectBox ? undefined : true} onPress={act(async () => ((diffOpen = null), (rejecting = null), await update($, opened, () => '')))} />
            {reviewButtons}
            {inReview && <Button key="show-changes" label="Show changes" hotkey="d" onPress={showDiff('')} />}
            {agentId && <Button key="watch" label="Watch worker" hotkey="w" onPress={act(() => $.ui.view({ agentId }))} />}
            {(t.status === 'doing' || t.status === 'todo') && (
              <Button key="pause" label="Pause" hotkey="p" onPress={act(async () => (await runTool($, 'pause', { task: t.id, reason: 'paused by the owner' }), tellLead($, `The owner paused ${t.id} from the board.`)))} />
            )}
            {t.status === 'paused' && (
              <Button key="resume" label="Resume" hotkey="u" onPress={act(async () => (await runTool($, 'resume', { task: t.id }), tellLead($, `The owner resumed ${t.id} from the board.`)))} />
            )}
            {(t.status === 'failed' || t.status === 'dropped') && (
              <Button key="retry" label="Retry" hotkey="r" onPress={act(async () => (await runTool($, 'retry', { task: t.id }), tellLead($, `The owner retried ${t.id} from the board.`)))} />
            )}
            {t.status === 'backlog' && (
              <Button key="to-todo" label="Move to todo (o)" hotkey="o" onPress={act(async () => (await runTool($, 'change', { task: t.id, backlog: false }), tellLead($, `The owner moved ${t.id} from the backlog to todo on the board.`)))} />
            )}
            {(t.status === 'todo' || t.status === 'paused' || t.status === 'failed') && (
              <Button key="stash" label="Stash to backlog (k)" hotkey="k" onPress={act(async () => (await runTool($, 'change', { task: t.id, backlog: true }), tellLead($, `The owner moved ${t.id} to the backlog on the board.`)))} />
            )}
            {canPickRole && <Button key="role" label="Role (l)" hotkey="l" onPress={openRolePick} />}
            {t.status !== 'done' && t.status !== 'dropped' && (
              <Button key="drop" label="Drop" hotkey={inReview ? undefined : 'x'} onPress={act(async () => (await runTool($, 'drop', { task: t.id, reason: 'dropped by the owner' }), tellLead($, `The owner dropped ${t.id} from the board.`)))} />
            )}
            {t.status !== 'done' && t.status !== 'dropped' && (
              <Button
                key="needs-review"
                label={`Needs review: ${t.needs_review ? 'on' : 'off'}`}
                hotkey="n"
                onPress={act(async () => {
                  const r = await runTool($, 'change', { task: t.id, needs_review: !t.needs_review })
                  $.ui.toast(N.toast(r))
                  tellLead($, `The owner turned needs_review ${t.needs_review ? 'off' : 'on'} for ${t.id} from the board.`)
                })}
              />
            )}
          </Box>

          {rejectBox}
          {roleBox}

          <Box flexDirection="column">
            {heading('Details')}
            {rows.flatMap((r, i) => detailRowLines(r, width).map((l, j) => segLine(l, `row-${i}-${j}`)))}
          </Box>

          {changes && (
            <Box flexDirection="column">
              {heading(`Changes (${changes.files.length} ${changes.files.length === 1 ? 'file' : 'files'}, against ${target})`)}
              {changes.error ? <Text color={C('error')}>  Could not read the changes: {changes.error}</Text> : null}
              {!changes.error && !changes.files.length ? <Text color={C('subtle')}>  no changes</Text> : null}
              {changes.files.map(f => (
                <Button key={`file:${f.file}`} onPress={showDiff(f.file)}>
                  <Text color={C('autoAccept')}>{f.file.padEnd(fileWidth)}</Text>
                  {f.binary ? (
                    <Text color={C('subtle')}>  binary</Text>
                  ) : (
                    <Text>
                      {'  '}
                      <Text color={C('success')}>+{f.added}</Text> <Text color={C('error')}>-{f.removed}</Text>
                    </Text>
                  )}
                </Button>
              ))}
              <Text color={C('subtle')}>  Enter on a file shows its diff · d all files</Text>
            </Box>
          )}

          {t.status === 'waiting' && (
            <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
              <Text>
                <Text bold color={C('warning')}>asks: </Text>
                <Text color={C('text')}>{t.question ?? '(no question)'}</Text>
              </Text>
              <Input
                key="answer"
                label="Your answer: "
                placeholder="type and press Enter"
                autoFocus
                onSubmit={value =>
                  act(async () => {
                    if (!value.trim()) return
                    await runTool($, 'change', { task: t.id, details: `${t.details}\n\nOwner's answer to "${t.question ?? ''}": ${value.trim()}` })
                    tellLead($, `The owner answered ${t.id} on the board: "${value.trim()}". I put it into the task and sent it back to work.`)
                  })()
                }
              />
            </Box>
          )}

          <Box flexDirection="column">
            {heading('What to do')}
            {t.details.trim() ? paragraphs(fold.text) : <Text color={C('subtle')}>(no details)</Text>}
            {t.details.trim() && fold.hint ? (
              <Button key="details-toggle" hotkey={DETAILS_KEY} onPress={toggleDetails}>
                <Text color={C('subtle')}>{fold.hint}</Text>
              </Button>
            ) : null}
          </Box>

          {t.history.length > 0 && (
            <Box flexDirection="column">
              {heading(`History (${t.history.length}, newest first)`)}
              {[...t.history].reverse().map(historyLine)}
            </Box>
          )}

          {(t.runs?.length ?? 0) > 0 && (
            <Box flexDirection="column">
              {heading('Runs (time and cost)')}
              {t.runs!.map((r, i) => (
                <Text color={C(r.ended ? 'subtle' : 'success')}>{`  ${fmtRun(r, i, Date.now())}`}</Text>
              ))}
              <Text bold color={C('text')}>{`  total: ${fmtTotal(sumRuns(t.runs, Date.now()))}`}</Text>
            </Box>
          )}

          <Text color={C('subtle')}>↑↓ scroll · b back{inReview ? ' · a approve · x reject · d show changes' : ''}{t.status === 'backlog' ? ' · o move to todo · x drop' : ''}{t.status === 'todo' || t.status === 'paused' || t.status === 'failed' ? ' · k stash to backlog' : ''}{['todo', 'paused', 'failed', 'backlog'].includes(t.status) ? ' · l role' : ''}{agentId ? ' · w watch worker' : ''}{fold.hint ? ` · ${DETAILS_KEY} ${detailsOpen ? 'hide what to do' : 'show all of what to do'}` : ''}</Text>
        </Box>
      )
    }

    shownTask = ''
    const nowMs = Date.now()
    const parts = boardSections(v.tasks, nowMs, localOffset(nowMs))
    for (const d of [...openDays]) if (!parts.days.some(g => g.day === d)) openDays.delete(d)
    const toggleDay = (day: string) => () => {
      if (openDays.has(day)) openDays.delete(day)
      else openDays.add(day)
      $.ui.invalidate('ui.render')
    }
    const toggleBacklog = () => ((backlogOpen = !backlogOpen), $.ui.invalidate('ui.render'))
    const showAllBacklog = () => ((backlogAll = true), $.ui.invalidate('ui.render'))
    type Row = { task: SymccTask; indent: boolean } | { day: string; label: string }
    const backlogShown = backlogAll ? parts.backlog : parts.backlog.slice(0, BACKLOG_SHOWN)
    const backlogMore = parts.backlog.length - backlogShown.length
    const backlogRows: Row[] = parts.backlog.length
      ? [
          { day: 'backlog', label: backlogHeader(parts.backlog.length, backlogOpen) },
          ...(!backlogOpen ? [] : [...backlogShown.map(task => ({ task, indent: true })), ...(backlogMore > 0 ? [{ day: 'backlog-more', label: backlogMoreLabel(backlogMore) }] : [])]),
        ]
      : []
    const rest: Row[] = [
      ...needsYouFirst(parts.open).map(task => ({ task, indent: false })),
      ...parts.today.map(task => ({ task, indent: false })),
      ...parts.days.flatMap(g => [{ day: g.day, label: groupLabel(g, openDays.has(g.day)) }, ...(openDays.has(g.day) ? g.tasks.map(task => ({ task, indent: true })) : [])]),
    ]
    // the Backlog section comes first; a light dotted rule keeps it apart from the tasks below it
    const list: Row[] = [...backlogRows, ...rest]
    const ruleAfter = backlogRows.length && rest.length ? backlogRows.length - 1 : -1
    const rows = list.flatMap(r => ('task' in r ? [r.task] : []))
    const idWidth = Math.max(4, ...rows.map(x => x.id.length))
    const wordWidth = Math.max(...rows.map(x => word[x.status]!.length), 5)
    const backlogRule = <Text key="backlog-rule" wrap="truncate" color={C('subtle')}>{listRule(width)}</Text>
    return (
      <Box flexDirection="column">
        {header()}
        {list.length === 0 && <Text color={C('subtle')}>The board is empty. Tell the lead what you want.</Text>}
        {list.map((r, i) => {
          if (!('task' in r)) {
            const button = (
              <Button key={`day:${r.day}`} autoFocus={i === 0 ? true : undefined} onPress={r.day === 'backlog' ? toggleBacklog : r.day === 'backlog-more' ? showAllBacklog : toggleDay(r.day)}>
                <Text bold={r.day === 'backlog'} color={C(r.day === 'backlog' ? 'planMode' : 'subtle')}>
                  {r.day === 'backlog-more' ? '  ' : ''}
                  {r.label}
                </Text>
              </Button>
            )
            return i === ruleAfter ? [button, backlogRule] : button
          }
          const x = r.task
          if (x.status === 'backlog') {
            const row = (
              <Button key={x.id} autoFocus={i === 0 ? true : undefined} onPress={act(() => update($, opened, () => x.id))}>
                <Text>{'  '}</Text>
                <Text color={C('subtle')}>{x.id.padEnd(idWidth)}</Text>
                <Text color={C('planMode')}> {mark.backlog}</Text>
                <Text color={C('subtle')}> {x.title.slice(0, Math.max(10, width - idWidth - 8))}</Text>
                {x.note && x.note !== 'in the backlog' ? <Text color={C('subtle')}> — {x.note}</Text> : null}
              </Button>
            )
            return i === ruleAfter ? [row, backlogRule] : row
          }
          const closed = x.status === 'done' || x.status === 'dropped'
          const extra = x.status === 'waiting' ? x.question ?? '' : x.note
          return (
            <Button key={x.id} autoFocus={i === 0 ? true : undefined} onPress={act(() => update($, opened, () => x.id))}>
              {r.indent ? <Text>{'  '}</Text> : null}
              <Text bold={!closed} color={C(closed ? 'inactive' : 'claude')}>
                {x.id.padEnd(idWidth)}
              </Text>
              <Text color={C(color[x.status]!)}>
                {' '}
                {mark[x.status]} {word[x.status]!.padEnd(roleMark(x) ? 0 : wordWidth)}
              </Text>
              {roleMark(x) ? <Text color={C('subtle')}>{` · ${roleMark(x)}`.padEnd(Math.max(0, wordWidth - word[x.status]!.length))}</Text> : null}
              <Text bold={x.status === 'waiting' || x.status === 'failed' || x.status === 'review'} color={C(closed ? 'inactive' : 'text')}>
                {' '}
                {x.title.slice(0, Math.max(10, width - idWidth - wordWidth - roleMark(x).length - 11))}
              </Text>
              {extra ? <Text color={C(x.status === 'waiting' ? 'warning' : x.status === 'failed' ? 'error' : x.status === 'review' ? color.review! : 'subtle')}> — {extra}</Text> : null}
            </Button>
          )
        })}
        {list.length > 0 && <Text key="list-hint" wrap="truncate" color={C('subtle')}>{parts.backlog.length ? `${HINT} · Enter on Backlog opens it` : HINT}</Text>}
      </Box>
    )
  })
}
