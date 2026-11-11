// symcc (the name comes from plugin.json, see name.ts): a shared task board, the main chat as its lead, workers that build tasks in
// parallel in their own Git worktrees and merge what passes the tests, and scouts you
// define in .<name>/scouts/*.md that look for issues on a timer.
//
// How work flows:
//   you ⇄ lead (the main chat)  ──board tools──▶  .<name>/board.json
//   a task is ready  ──▶  worktree + background worker subagent
//   worker done      ──▶  commit · scope check · tests · merge into main  ──▶  the lead is told
//   scout on a timer ──▶  findings  ──▶  the lead is told and decides what goes on the board
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SymccScout, SymccTask, SymccView } from '../types'
import { DEFAULT_NAME, cleanName, dataDir, namesFor } from './name'
import {
  LEAD_BEAT_MS,
  addTask,
  boardText,
  boardBrand,
  boardLabel,
  boardTitle,
  boardWhere,
  SCOUT_REPORT_CHARS,
  scoutFile,
  scoutHowTo,
  scoutReport,
  scoutRow,
  sortScouts,
  bannerLines,
  bannerRule,
  branchWarning,
  missingBranchText,
  noBranchText,
  startBranch,
  type BannerTone,
  shortHome,
  newestFirst,
  boardSections,
  groupLabel,
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
  clampRetries,
  openOnStart,
  spokenDone,
  voiceOn,
  onTestFail,
  testTail,
  startRun,
  endRun,
  usageTokens,
  sumRuns,
  fmtRun,
  fmtTotal,
  ownedHere,
  outOfScope,
  parseBoard,
  parseScout,
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
  whoDrives,
  backToTodo,
  ENDED_STATUSES,
  STATUS_WORD,
  statusCounts,
  type Board,
  type ScoutDef,
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
const view = atom({ plugin: 'symcc', key: 'view' } as const, { tasks: [], working: [], scouts: [], paused: false, test_commands: [] } as SymccView, { shape: 'view-1' })
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
type PaneView = SymccView & Partial<Pick<Board, 'target_branch' | 'max_parallel' | 'max_minutes' | 'auto_retries'> & { driving: boolean; branch_note: string }>

// ---------------- what this module holds while it is loaded ----------------
// A hot reload starts these over: the board itself is always on disk, and a task
// whose worker was lost to a reload goes back to "todo" at session.start.
let root = ''
/** the home folder, to shorten it to "~" where the project's path is shown */
let home = ''
const workers = new Map<string, { task: string; worktree: string; branch: string; since: number }>() // agentId → work
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
/** set by pump when target_branch doesn't exist (no work starts then); '' when it does */
let missingBranch = ''
/** the target_branch the lead was last told is missing, so it is told once, not every check */
let toldMissing = ''
/** set at the end of session.start: until then pump starts no work (the worker type may not be registered yet) */
let startupDone = false
/** task id → spawns in a row that failed only because the plugin wasn't ready yet (see isNotReady) */
const notReady = new Map<string, number>()
/** the older days ("YYYY-MM-DD") the owner has opened in the board panel; kept only while the panel is open */
const openDays = new Set<string>()
/** the scout being edited in the board panel (its edit mode), or null; `isNew` for one made with "new scout" */
type ScoutDraft = { scout: string; isNew: boolean; every: string; model: string; body: string; error: string }
let draft: ScoutDraft | null = null
/** the "new scout" name box on the Scouts view, or null when it isn't shown */
let naming: { name: string; error: string } | null = null

// ---------------- the board on disk ----------------

const now = () => new Date().toISOString()
const path = (rel: string) => `${root}/${rel}`

async function load($: $): Promise<Board> {
  const exists = await $.fs.exists(path(N.boardFile))
  // A new board starts on the branch the owner has checked out (existing boards keep theirs).
  return exists ? parseBoard(await $.fs.read(path(N.boardFile))) : emptyBoard(await firstBranch($))
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
    const note = move === 'takeover' ? 'restarted: the session driving the board stopped answering' : 'restarted after Claude Code was reopened'
    // Only tasks of this session, of a session that no longer drives, or with no session
    // recorded go back: a task whose worker runs in the live driver keeps it.
    if (await $.fs.exists(path(N.boardFile)))
      await change($, b => resetDoing(b, me, leadBefore, Date.now(), note, now(), b.tasks.filter(t => liveWorkersFor(t, alive, N.name).length > 0).map(t => t.id)))
    if (move === 'takeover' && !fresh) $.ui.toast(N.toast('the session driving the board stopped answering; this session drives it now'))
  }
  if (was && !driving) {
    // Another session took over (this one stopped answering for too long): its workers own the tasks now.
    for (const [agentId] of [...workers]) {
      workers.delete(agentId)
      await halt($, agentId, 'another session drives the board now')
    }
    for (const agentId of [...scoutRuns.keys()]) await halt($, agentId, 'another session drives the board now')
    scoutRuns.clear()
    for (const st of scoutState.values()) st.running = false
    $.ui.toast(N.toast('another session drives the board now; this one only shows and changes it'))
  }
  if (driving) {
    // A task stopped, dropped or changed from another session: stop its worker here.
    const b = await load($)
    for (const [agentId, w] of [...workers]) {
      if (find(b, w.task)?.status === 'doing') continue
      workers.delete(agentId)
      await halt($, agentId, 'the task was changed on the board')
    }
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

async function publish($: $, b: Board) {
  const working = [...workers.values()].map(w => ({ task: w.task, since: w.since }))
  // Which branch the owner is on is looked at here, once per publish, not on every render.
  const branch_note = missingBranch || branchWarning(b.target_branch, await currentBranch($))
  // The banner's facts ride along in the view (extra fields; SymccView itself is shared with other code).
  const v: PaneView = { tasks: b.tasks, working, scouts: [...scoutState.values()], paused: b.paused, test_commands: b.test_commands, target_branch: b.target_branch, max_parallel: b.max_parallel, max_minutes: b.max_minutes, auto_retries: b.auto_retries, driving, branch_note }
  await update($, view, () => v)
  const parts = statusCounts(b.tasks, ['doing', 'todo', 'paused', 'waiting', 'failed'])
  const label = `${boardLabel(root, N.name)}${driving ? '' : ' (driven by another session)'}`
  const note = branch_note ? ` · ${branch_note}` : ''
  $.ui.status(b.tasks.length ? `${label}: ${parts.join(' · ') || 'all done'}${b.paused ? ' · paused' : ''}${note}` : !driving ? `${label}: empty${note}` : note ? `${label}${note}` : undefined)
}

// ---------------- telling the lead ----------------
// Workers and scouts report to the main chat as a prompt from this plugin. Several
// reports close together go in one message, sent when the chat is idle.

function tellLead($: $, text: string) {
  leadQueue.push(text)
  if (leadTimer) return
  leadTimer = $.clock.after(1500, () => {
    leadTimer = null
    const body = leadQueue.splice(0).join('\n\n')
    if (!body) return
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
  if (!driving || !voiceOn(b)) return
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

/** Commit the worker's changes, check scope, bring in the latest main, test, then move main forward. */
async function checkAndMerge($: $, t: SymccTask, dir: string, branch: string, b: Board): Promise<{ ok: boolean; detail: string; conflict?: boolean; testOutput?: string }> {
  const target = b.target_branch
  await git($, ['add', '-A', '--', '.'], dir)
  await git($, ['-c', `user.name=${N.author.name}`, '-c', `user.email=${N.author.email}`, 'commit', '-q', '--no-verify', '-m', `${t.id}: ${t.title}`], dir)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const head = await gitOk($, ['rev-parse', 'HEAD'], dir)
  const base = (await git($, ['merge-base', main, head])).stdout.trim() || main
  const changed = (await gitOk($, ['diff', '--name-only', '--no-renames', `${base}..${head}`])).split('\n').filter(Boolean)
  if (!changed.length) return { ok: false, detail: 'the worker made no change' }
  const bad = outOfScope(changed, t.files, N.dir)
  if (bad.length) return { ok: false, detail: `changed files outside the task (${bad.slice(0, 5).join(', ')}); allowed: ${t.files.join(', ') || '-'}` }
  let candidate = head
  if ((await git($, ['merge-base', '--is-ancestor', main, head])).exitCode !== 0) {
    const m = await git($, ['-c', `user.name=${N.author.name}`, '-c', `user.email=${N.author.email}`, 'merge', '--no-edit', '-m', `${t.id}: bring up to date with ${target}`, main], dir)
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      return { ok: false, detail: `conflicts with the latest ${target}`, conflict: true }
    }
    candidate = await gitOk($, ['rev-parse', 'HEAD'], dir)
  }
  for (const cmd of b.test_commands) {
    const r = await $.process.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: 600_000 }).catch((e: Error) => ({ exitCode: 1, stdout: '', stderr: e.message }))
    if (r.exitCode !== 0) {
      const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
      return { ok: false, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}`, testOutput: testTail(`$ ${cmd} (exit ${r.exitCode})\n${r.stdout}\n${r.stderr}`) }
    }
  }
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
  return { ok: true, detail: `merged into ${target} (${candidate.slice(0, 8)})${b.test_commands.length ? `; tests passed` : '; no test command set'}` }
}

// ---------------- workers ----------------

const WORKER_PROMPT = (t: SymccTask, b: Board, dir: string) => `You are a ${N.name} worker. Do exactly this one task, then stop.

Work ONLY inside this folder, your own copy of the project on branch ${t.branch ?? N.branch(t.id)}:
  ${dir}
Use absolute paths under that folder for every Read, Edit and Write. Never touch the main project folder.

Task ${t.id}: ${t.title}
${t.details}

Files you may change: ${t.files.length ? t.files.join(', ') : 'whatever the task needs'}. Changes anywhere else are thrown away.
${b.test_commands.length ? `After you finish, these must pass (run them in that folder to check): ${b.test_commands.join(' && ')}` : 'There is no test command; keep the change small and correct.'}
Do not run git commit, push or merge: ${N.name} commits, tests and merges your work.
${t.merge_main ? `\nFirst, ${b.target_branch} has moved and your branch now conflicts with it. In that folder, run \`git merge ${b.target_branch}\` and resolve the conflicts (for this one step only you may run that git merge; still don't commit). Keep this task's intent, keep the changes inside the task's files, and make sure the tests pass.\n` : ''}${t.test_output ? `\nYour last try failed these tests; fix it. The end of the test output:\n\`\`\`\n${t.test_output}\n\`\`\`\n` : ''}${t.history.length ? `\nEarlier tries:\n${t.history.slice(-5).map(line => `- ${line}`).join('\n')}\nDon't repeat those mistakes.\n` : ''}
When you are done, answer in one or two plain sentences: what you changed. If you truly cannot continue without the owner deciding something, answer with one line starting "QUESTION:" and the question.`

async function pump($: $) {
  if (!startupDone) return // session.start hasn't finished; it pumps itself at its end
  if (!driving) return // another session drives the board and starts its work
  const b = await load($)
  if (b.paused) return
  if (!ready(b).length) return
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
      const spawned = await $.agent.spawn({ prompt: WORKER_PROMPT(t, b, dir), description: `${t.id} ${t.title}`.slice(0, 60), subagentType: N.worker, cwd: dir })
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
    const alive = agents ? agents.filter(a => ids.includes(a.id) && !ENDED.has(a.status)) : ids.map(id => ({ id, type: N.worker, status: 'running' }))
    if (!alive.length || Date.now() > until) return alive
    await $.clock.sleep(500)
  }
}

async function workerFinished($: $, agentId: string, answer: string, aborted: boolean, tokens?: number) {
  const w = workers.get(agentId)
  if (!w) return
  workers.delete(agentId)
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
  if (aborted) {
    await change($, x => patchTask(x, t.id, { status: 'failed', note: 'the worker was stopped', history: [...t.history, `try ${t.attempts}: stopped before finishing`] }, now()))
    tellLead($, `${t.id} "${t.title}": the worker was stopped before finishing.`)
  } else if (q) {
    await change($, x => patchTask(x, t.id, { status: 'failed', note: `worker asks: ${q[1]!.slice(0, 200)}`, history: [...t.history, `try ${t.attempts}: worker asked: ${q[1]}`] }, now()))
    tellLead($, `${t.id} "${t.title}": the worker stopped with a question: ${q[1]}\nAnswer it yourself and change the task, or ask the owner with ${N.name} ask.`)
  } else {
    await change($, x => patchTask(x, t.id, { note: 'checking and merging' }, now()))
    const r: { ok: boolean; detail: string; conflict?: boolean; testOutput?: string } = await checkAndMerge($, t, w.worktree, w.branch, b).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    const line = `try ${t.attempts}: ${summary.slice(0, 300)} → ${r.detail}`
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
    const done = `try ${t.attempts}: ${summary.slice(0, 300)} → ${detail}`
    await change($, x => patchTask(x, t.id, { status: r.ok ? 'done' : 'failed', note: detail.slice(0, 300), merge_main: false, test_output: r.testOutput, history: [...t.history, done] }, now()))
    if (r.ok) sayDone($, b, t.id)
    if (r.ok) await removeWorktree($, t.id, w.worktree, agentId)
    const gaveUp = r.testOutput !== undefined ? `\nIt already had ${testTries} automatic ${testTries === 1 ? 'retry' : 'retries'}. The end of the last test output:\n${r.testOutput}` : ''
    tellLead($, r.ok ? `✓ ${t.id} "${t.title}" is merged. Worker: ${summary.slice(0, 300)}` : `✗ ${t.id} "${t.title}" was not merged: ${detail}\nWorker said: ${summary.slice(0, 300)}${gaveUp}`)
  }
}

/** Ends an agent's work: from now on every tool it tries is refused, and it is told to stop. */
async function halt($: $, agentId: string, why: string) {
  stopped.add(agentId)
  await $.session.send({ to: { agentId }, text: `Stop now: ${why}. Don't change anything else; answer "stopped" and end.` }).catch(() => undefined)
}

async function stopWorker($: $, taskId: string, why: string) {
  for (const [agentId, w] of [...workers]) {
    if (w.task !== taskId) continue
    workers.delete(agentId)
    await halt($, agentId, why)
  }
  await publish($, await load($))
}

/** Stops every worker and scout and pauses the board. Stopped tasks go back to "todo" and continue after resume. */
async function stopAll($: $, who: string): Promise<string> {
  await change($, b => ({ ...b, paused: true }))
  const ids: string[] = []
  for (const [agentId, w] of [...workers]) {
    workers.delete(agentId)
    ids.push(w.task)
    await halt($, agentId, `${who} stopped all work`)
    await change($, x => patchTask(x, w.task, { status: 'todo', note: `stopped by ${who}; continues after resume` }, now()))
  }
  for (const agentId of [...scoutRuns.keys()]) await halt($, agentId, `${who} stopped all work`)
  scoutRuns.clear()
  for (const s of scoutState.values()) s.running = false
  await publish($, await load($))
  return `${ids.length ? `Stopped ${ids.join(', ')}` : 'No workers were running'}. Nothing new starts until resume.`
}

async function resumeAll($: $): Promise<string> {
  await change($, b => ({ ...b, paused: false }))
  void pump($)
  return 'Resumed: workers start on ready tasks again.'
}

const ENDED = new Set(ENDED_STATUSES)
const LIVE = new Set(['pending', 'running', 'waiting'])

/**
 * Stops this plugin's workers and scouts this copy of the plugin doesn't know about. A reload of the
 * plugin forgets which worker belongs to which task while the old workers keep running in the
 * same folders; without this, every reload adds one more worker per running task.
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
    if (ENDED.has(a.status)) continue
    if (a.type === N.worker) {
      const t = find(b, normId(a.description.split(/\s/)[0] ?? ''))
      if (t && t.status === 'doing' && !ownedHere(t, me, live)) continue
    }
    stopped.add(a.id)
    if (LIVE.has(a.status)) await halt($, a.id, `${N.name} was reloaded and a new worker took over this task`)
    out.push(a.id)
  }
  return out
}

/** The regular check, every two minutes: keeps work moving and makes sure nothing is stuck or forgotten. */
async function check($: $) {
  if (!driving) return
  await stopOrphans($)
  const b = await load($)
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
      await change($, x => patchTask(x, w.task, { status: 'failed', note: `stopped: ran over ${b.max_minutes} min`, history: [...(t?.history ?? []), `try ${t?.attempts ?? '?'}: stopped after ${Math.round(minutes)} min (over the limit)`] }, now()))
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ran over ${b.max_minutes} minutes, so I stopped it. Retry it (${N.name} start), split it, or drop it. The limit can be changed with ${N.name} settings max_minutes.`)
      continue
    }
    // The worker is gone without saying it finished (crashed, or lost): send the task back to the lead.
    const lost = minutes > 3 && info !== undefined && ENDED.has(info.status)
    if (lost) {
      workers.delete(agentId)
      await change($, x => patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', history: [...(t?.history ?? []), `try ${t?.attempts ?? '?'}: the worker ended without a result`] }, now()))
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ended without a result. Retry it (${N.name} start), change it, or drop it.`)
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
  await pump($)
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
  if (!st || st.running || !driving) return
  const b = await load($)
  if (b.paused) return
  st.running = true
  st.last_run = now()
  await publish($, b)
  const open = b.tasks.filter(t => t.status !== 'done' && t.status !== 'dropped').map(t => `${t.id} ${t.title}`).join('\n') || '(none)'
  const prompt = `You are the ${N.name} scout "${s.name}". Read the project in ${root} (read only: never change a file) and look for what your instructions ask.

${s.prompt}

Don't report anything already on the board:
${open}

Answer with at most 3 findings, one per line, as:  - <short title> | <why it matters, with file:line> | <files a fix would touch>
If you find nothing worth doing, answer exactly: NOTHING`
  const spawned = await $.agent.spawn({ prompt, description: `scout: ${s.name}`, subagentType: N.scout, ...(s.model ? { model: s.model } : {}) }).catch((e: Error) => ({ deny: e.message }))
  const agentId = 'agentId' in spawned ? spawned.agentId : undefined
  if (!agentId) {
    st.running = false
    await publish($, await load($))
    return
  }
  scoutRuns.set(agentId, s.name)
}

async function scoutFinished($: $, agentId: string, answer: string) {
  const name = scoutRuns.get(agentId)!
  scoutRuns.delete(agentId)
  const st = scoutState.get(name)
  if (st) {
    st.running = false
    st.last_report = answer.trim().slice(0, SCOUT_REPORT_CHARS)
  }
  await publish($, await load($))
  const found = answer.split('\n').filter(l => /^\s*-\s+\S/.test(l)).slice(0, 3)
  if (!found.length || /^\s*NOTHING\s*$/m.test(answer)) return
  tellLead($, `Scout "${name}" found:\n${found.join('\n')}\nAdd the worthwhile ones as tasks (${N.name} add), or ignore them.`)
}

async function scheduleScouts($: $) {
  for (const t of timers.splice(0)) t.cancel()
  const defs = await loadScouts($)
  for (const k of [...scoutState.keys()]) if (!defs.some(d => d.name === k)) scoutState.delete(k)
  for (const s of defs) {
    const old = scoutState.get(s.name)
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

/** Runs scout `name` now (/scouts run <name>, or "run now" in the panel); says what happened. */
async function runScoutNow($: $, name: string): Promise<string> {
  const defs = await scheduleScouts($)
  const s = defs.find(d => d.name === name)
  if (!s) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  if (!driving) return `scouts run in the session that drives the board; run /scouts run ${s.name} there`
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

/** Opens the board panel on a view ('tasks' or 'scouts'), with nothing opened in it. */
async function openPane($: $, which: 'tasks' | 'scouts', focus = true) {
  await update($, opened, () => '')
  await update($, scoutOpen, () => '')
  await update($, tab, () => which)
  return $.ui.open({ id: N.pane, title: boardTitle(root, N.name), ...(focus ? { focus: true as const, closeOnEscape: true as const } : {}) })
}

// ---------------- the lead's tools ----------------

/** A short date and time, like "Nov 11, 09:30"; "?" when there is none. */
const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?')

function taskText(t: SymccTask, running: boolean, all: SymccTask[] = []): string {
  const word = STATUS_WORD
  const L = [`${t.id}  [${word[t.status]}]  ${t.title}`, `added ${when(t.created_at)} · changed ${when(t.updated_at)} · tries ${t.attempts}`]
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
    tests and merges into the target branch (target_branch) only if they pass.
  • Scouts are background agents on a timer. They read the project and suggest work;
    the lead decides whether to add it.
  Topics: /${N.man} commands · tasks · lead · workers · scouts · safety`,
  commands: `Commands
  /board            open the board panel (↑↓ move, Enter opens a task, Esc closes)
  /board T-3        open one task
  /scouts           show the scouts in the board panel (t / s switch views) and reload their files
  /scouts run NAME  run a scout now
  /stop-all         stop every worker and scout, pause the board
  /resume-all       start work again
  /${N.man} [TOPIC] this manual
In an open task: b back · p pause · u resume · r retry · x drop · w watch the worker.
Everything else, just say to the lead: "pause T-5", "drop T-2", "do T-4 first",
"set the test command to npm test", "give workers 90 minutes".`,
  tasks: `Tasks
  Fields: title, details (what to do and how we know it works), files (what the worker
  may change; empty = anywhere), after (tasks that must be done first), order (lower
  runs first), plus status, note, question, tries, history, branch, when added/changed.
  Statuses:
    to do            waiting for a free worker (and for its "after" tasks)
    doing            a worker is on it
    paused           stopped on purpose; resume to continue
    waiting for you  the lead asked you a question; answer it in the board panel
    failed           tests failed, files outside its list changed, or the worker stopped
    done             merged into the target branch
    dropped          given up
  The board lists the newest task at the top.`,
  lead: `The lead (this chat) has these tools:
  board · add · change · start · ask · drop · stop · resume · stop_all · resume_all · settings
  settings: target_branch (the branch work is merged into; a new board starts on the branch
  you have checked out, and it must be an existing branch), test_commands (must pass before
  a merge), max_parallel (workers at once, 1-8),
  max_minutes (a worker running longer is stopped), auto_retries (new tries on their own
  after failing tests, 2 by default), open_on_start (open the board panel when a
  session starts, on by default), voice (say "T-3 done" out loud when a task is merged;
  only the session driving the board speaks; on by default), paused.
  After each worker finishes, the lead gets a "[${N.name}] Update" message and decides what
  to do next: retry, change, split, ask you, or drop.`,
  workers: `Workers
  • Up to max_parallel run at once (3 by default), one per task.
  • A worker gets only its task, its folder, its allowed files and the test commands.
    It can't see the board or this chat, and must not commit, push or merge.
  • A resumed or retried task starts over with a fresh worker.
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
      What to look for, in plain words.
  It can only read files. It reports up to 3 findings to the lead, or nothing. Run
  /scouts after adding or deleting a file. Examples: examples/scouts/ in the plugin.`,
  safety: `Safety
  • Changes outside a task's files, or that fail the tests, are never merged.
  • The target branch only moves by a checked merge; with uncommitted changes on it, ${N.name} waits.
  • A new board merges into the branch you had checked out when it was made. If you are on
    another branch, the banner and status line say so ("merging into main · you're on x").
    Change it with ${N.name} settings target_branch. If that branch doesn't exist, no work
    starts (nothing is marked failed) until you set an existing one.
  • Workers can edit files in their own folder without asking. Their shell commands follow
    your normal permission rules (your settings' allow list applies to them too).
  • Test commands are run by ${N.name} itself, without a permission prompt.
  • Add ${N.dir}/ to the project's .gitignore.`,
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
- Workers start by themselves on ready tasks, each in its own copy of the code. When one finishes, its change is tested and, if it passes, merged into main. You then get a "[${N.name}] Update" message: decide what's next (retry with ${N.name} change / ${N.name} start, split, ${N.name} ask the owner, or ${N.name} drop).
- When the owner answers a waiting task, put the answer into the task with ${N.name} change (that sends it back to work).
- Set the test command with ${N.name} settings (e.g. ["npm test"]); for a new project pick the stack and test command when you plan the first tasks.
- To stop work: ${N.name} stop pauses one task (its worker is stopped; ${N.name} resume continues it later, with a fresh worker). ${N.name} stop_all stops every worker and scout and pauses the board; ${N.name} resume_all starts work again.
- ${N.name} checks every two minutes on its own: it starts ready tasks, stops a worker that runs longer than max_minutes (${N.name} settings), and reminds you about failed tasks nobody handled.
- Don't do the tasks' work yourself in the main conversation; let the workers do it. Talk about tasks by ID (T-3). Use ${N.name} board to see the board.`

const TOOLS = () => [
  { name: 'board', description: `Show the ${N.name} task board.`, inputSchema: { type: 'object', properties: {} } },
  {
    name: 'add',
    description: `Add a task to the ${N.name} board. A worker starts on it when it is ready.`,
    inputSchema: { type: 'object', required: ['title', 'details'], properties: { title: { type: 'string' }, details: { type: 'string', description: 'What to build and how we know it works.' }, files: { type: 'array', items: { type: 'string' }, description: 'Files/folders the worker may change, e.g. ["src/search.js", "test/"]. Empty = anywhere.' }, after: { type: 'array', items: { type: 'string' }, description: 'Task IDs that must be done first.' }, order: { type: 'number', description: 'Lower runs first.' } } },
  },
  {
    name: 'change',
    description: 'Rewrite a task. A running task restarts on the new version; a waiting or failed one goes back to work.',
    inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, title: { type: 'string' }, details: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, after: { type: 'array', items: { type: 'string' } }, order: { type: 'number' } } },
  },
  { name: 'start', description: 'Put a task (back) to "todo" so a worker picks it up, e.g. to retry.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'ask', description: 'Make a task wait for the owner with a question.', inputSchema: { type: 'object', required: ['task', 'question'], properties: { task: { type: 'string' }, question: { type: 'string' } } } },
  { name: 'drop', description: 'Stop and drop a task.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'stop', description: `Pause one task: its worker (if running) is stopped and no new worker starts on it until ${N.name} resume.`, inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'resume', description: 'Continue a paused task: it goes back to "todo" and a fresh worker picks it up.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'stop_all', description: `Stop every running worker and scout now and pause the board; nothing new starts until ${N.name} resume_all. Stopped tasks go back to "todo".`, inputSchema: { type: 'object', properties: {} } },
  { name: 'resume_all', description: 'Unpause the board: workers start on ready tasks again.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'settings',
    description: 'Change how the team works: target_branch (the existing branch finished work is merged into; a new board starts on the branch checked out then), test_commands (shell commands that must pass before merging), max_parallel (workers at once), max_minutes (a worker running longer is stopped), auto_retries (new tries a task gets on its own after failing tests, 0-10, default 2), open_on_start (open the board panel by itself when a session starts, default true), voice (say it out loud when a task is merged, e.g. "T-3 done"; only the session driving the board speaks, default true), paused (stop starting new work; running workers go on, use stop_all to stop them too).',
    inputSchema: { type: 'object', properties: { target_branch: { type: 'string', description: 'An existing local branch to merge finished work into.' }, test_commands: { type: 'array', items: { type: 'string' } }, max_parallel: { type: 'number' }, max_minutes: { type: 'number' }, auto_retries: { type: 'number' }, open_on_start: { type: 'boolean' }, voice: { type: 'boolean' }, paused: { type: 'boolean' } } },
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
      const t = await change($, b => addTask(b, { title: str(a.title) ?? '', details: str(a.details), files: a.files, after: a.after, order: typeof a.order === 'number' ? a.order : undefined }, now(), N.dir))
      void pump($)
      return `added ${t.id} ${t.title}`
    }
    case 'change': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done') throw new Error(`${t.id} is done; add a new task instead`)
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, 'the task changed')
      const patch: Partial<SymccTask> = { status: t.status === 'dropped' ? 'dropped' : 'todo', note: wasDoing ? 'changed; restarting' : 'changed' }
      if (str(a.title)) patch.title = str(a.title)
      if (str(a.details)) patch.details = str(a.details)
      if (list(a.files)) patch.files = list(a.files)
      if (list(a.after)) patch.after = list(a.after)
      if (typeof a.order === 'number') patch.order = a.order
      await change($, x => patchTask(x, t.id, patch, now(), N.dir))
      void pump($)
      return `${t.id} updated${wasDoing ? ' (restarting)' : ''}`
    }
    case 'start': {
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
    case 'stop': {
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
    case 'stop_all':
      return stopAll($, 'the lead')
    case 'resume_all':
      return resumeAll($)
    case 'settings': {
      const parts: string[] = []
      const target = str(a.target_branch)?.trim()
      if (a.target_branch !== undefined && !(target && (await branchExists($, target)))) {
        return noBranchText(target ?? String(a.target_branch), await branchList($))
      }
      await change($, b => {
        const y = { ...b }
        if (target) ((y.target_branch = target), parts.push(`work merges into ${target}`))
        if (list(a.test_commands)) ((y.test_commands = list(a.test_commands)!.map(x => x.trim()).filter(Boolean).slice(0, 5)), parts.push(`tests: ${y.test_commands.join(' && ') || 'none'}`))
        if (typeof a.max_parallel === 'number') ((y.max_parallel = Math.max(1, Math.min(8, Math.round(a.max_parallel)))), parts.push(`up to ${y.max_parallel} at once`))
        if (typeof a.max_minutes === 'number') ((y.max_minutes = Math.max(5, Math.min(600, Math.round(a.max_minutes)))), parts.push(`a worker may run ${y.max_minutes} min`))
        if (typeof a.auto_retries === 'number') ((y.auto_retries = clampRetries(a.auto_retries)), parts.push(`${y.auto_retries} automatic ${y.auto_retries === 1 ? 'retry' : 'retries'} after failing tests`))
        if (typeof a.open_on_start === 'boolean') ((y.open_on_start = a.open_on_start), parts.push(a.open_on_start ? 'the board opens when a session starts' : 'the board no longer opens when a session starts'))
        if (typeof a.voice === 'boolean') ((y.voice = a.voice), parts.push(a.voice ? 'merged tasks are said out loud' : 'merged tasks are no longer said out loud'))
        if (typeof a.paused === 'boolean') ((y.paused = a.paused), parts.push(a.paused ? 'paused' : 'resumed'))
        return y
      })
      if (target && missingBranch) {
        missingBranch = ''
        toldMissing = ''
        await publish($, await load($))
      }
      void pump($)
      return parts.join('; ') || 'nothing changed'
    }
  }
  throw new Error(`unknown tool ${name}`)
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
    description: `${N.name} scout: reads the project and reports problems or improvements. Started by ${N.name} only.`,
    prompt: `You are a ${N.name} scout. You read a project and report a few concrete, evidence-backed problems or improvements, in the format you are given. You never change a file.`,
    tools: ['Read', 'Glob', 'Grep'],
    background: true,
  }))
  for (const t of TOOLS()) await ok($.tool.register({ ...t, isDeferred: false }))
  for (const c of [
    { name: 'board', description: `Show the ${N.name} task board, or one task in full: /board T-3`, argumentHint: '[T-id]' },
    { name: 'scouts', description: `List ${N.name} scouts, or run one now: /scouts run <name>`, argumentHint: '[run <name>]' },
    { name: 'stop-all', description: `Stop every ${N.name} worker and scout now; nothing new starts until /resume-all` },
    { name: 'resume-all', description: `Let ${N.name} start work again` },
    { name: N.man, description: `Show the ${N.name} manual: how the board, lead, workers and scouts work, and every command`, argumentHint: '[topic]' },
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
      await publish($, b)
      // Open the board panel by itself (every session, driver or not), without taking the cursor
      // from the prompt. On a narrow terminal Claude Code may not place it (isPlaced: false);
      // that is fine: the band above the prompt and /board still work.
      if (openOnStart(b))
        await update($, opened, () => '')
          .then(() => $.ui.open({ id: N.pane, title: boardTitle(root, N.name) }))
          .catch(() => undefined)
    } finally {
      startupDone = true
    }
    void pump($)
    return result
  })

  on('session.end', async ($, e, next) => {
    useName($)
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
    return { sections: [...r.sections, { id: `${N.name}:lead`, text: leadGuide(), scope: 'session' as const }] }
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
    return r
  })

  // /board prints the board; in fullscreen it also opens it as a sidebar beside the chat.
  on('command.run', { command: 'board' }, async ($, e) => {
    useName($)
    const b = await load($)
    const arg = e.args.trim()
    if (arg) {
      const t = find(b, arg)
      if (!t) return { text: `${arg} is not on the board` }
      await update($, opened, () => t.id)
      await update($, tab, () => 'tasks')
      await $.ui.open({ id: N.pane, title: boardTitle(root, N.name), focus: true, closeOnEscape: true })
      return { text: taskText(t, [...workers.values()].some(w => w.task === t.id), b.tasks), isTextDisplayOnly: true }
    }
    await openPane($, 'tasks')
    return { text: `Board opened: ↑↓ to move, Enter to open a task, Esc to close. (ctrl+x tab goes back to it.)`, isTextDisplayOnly: true }
  })

  // The band above the prompt: the board, always in view inside Claude Code's own screen.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    useName($)
    if (e.props.hasSurvey || e.props.view.agentId) return next(e)
    const v = await read($, view)
    const tasks = v?.tasks ?? []
    if (!tasks.length) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const summary = statusCounts(tasks, ['doing', 'todo', 'paused', 'waiting', 'failed', 'done']).join(' · ')
    const order = ['waiting', 'failed', 'doing']
    const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
    const room = Math.max(1, Math.min(6, (e.props.maxRows ?? 8) - 1))
    const color: Record<string, string> = { waiting: 'yellow', failed: 'red', doing: 'green' }
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
            {v?.paused ? ' · PAUSED (/resume-all)' : ''}
            {running.length ? ` · scouting: ${running.join(', ')}` : ''}{' '}
          </Text>
          </Text>
          <Button key="open-board" label="open board" dimColor onPress={() => void update($, opened, () => '').then(() => $.ui.open({ id: N.pane, title: boardTitle(root, N.name), focus: true, closeOnEscape: true }))} />
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
        {live.length > room && <Text dimColor>+{live.length - room} more · /board</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'scouts' }, async ($, e) => {
    useName($)
    const m = /^run\s+(\S+)/.exec(e.args.trim())
    if (m) return { text: await runScoutNow($, m[1]!) }
    const defs = await scheduleScouts($)
    await publish($, await load($))
    // Open the panel on the Scouts view; the text list below is the fallback when it can't be placed.
    const placed = await openPane($, 'scouts').then(r => r.isPlaced).catch(() => false)
    if (placed) return { text: `Scouts opened: Enter opens a scout, t tasks, Esc closes.`, isTextDisplayOnly: true }
    if (!defs.length) return { text: `No scouts yet. Add one as ${N.scouts}/<name>.md:\n---\nevery_minutes: 30\n---\nLook for missing tests around risky code.` }
    return { text: defs.map(d => `${d.name}: every ${d.every_minutes} min${scoutState.get(d.name)?.last_run ? `, last ran ${scoutState.get(d.name)!.last_run!.slice(11, 16)}` : ''}${scoutState.get(d.name)?.running ? ' (running now)' : ''}`).join('\n') }
  })

  on('command.run', { command: 'stop-all' }, async $ => {
    useName($)
    return { text: await stopAll($, 'you') }
  })

  on('command.run', { command: 'resume-all' }, async $ => {
    useName($)
    return { text: await resumeAll($) }
  })

  // /<name>-man: registered under the plugin's name, so it is matched inside.
  on('command.run', async ($, e, next) => {
    useName($)
    return e.command === N.man ? { text: manual(e.args), isTextDisplayOnly: true } : next(e)
  })

  // Esc in an opened scout goes back to the Scouts list (the panel stays open).
  // Opened days and the active view are forgotten when the board panel closes.
  on('ui.close', async ($, e, next) => {
    useName($)
    if (e.id !== N.pane) return next(e)
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
    draft = null
    naming = null
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
    const color: Record<string, string> = { waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }
    const word: Record<string, string> = STATUS_WORD
    const mark: Record<string, string> = { waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }
    const act = (fn: () => Promise<unknown>) => () => void fn().catch((err: Error) => $.ui.toast(N.toast(err.message)))
    const onScouts = (await read($, tab)) === 'scouts'
    const t = open && !onScouts ? v.tasks.find(x => x.id === open) : undefined
    const C = (c: string) => c as never
    const scouts = sortScouts(Array.isArray(v.scouts) ? v.scouts : [])
    /** The banner at the top: the drawing, the board's facts, and the rule under them. */
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
        <Text wrap="truncate" color={C('subtle')}>{bannerRule(width)}</Text>,
      ]
    }
    /** The tab row under the banner: "[t] Tasks (12) │ [s] Scouts (3)", the active one bold in the accent color. "t" and "s" switch. */
    const tabs = () => {
      const go = (which: 'tasks' | 'scouts') => act(async () => ((draft = null), (naming = null), await update($, opened, () => ''), await update($, scoutOpen, () => ''), await update($, tab, () => which)))
      const one = (which: 'tasks' | 'scouts', label: string) => {
        const active = which === 'scouts' ? onScouts : !onScouts
        return (
          <Button key={`tab-${which}`} hotkey={which[0]} onPress={go(which)}>
            <Text bold={active} color={C(active ? 'ide' : 'subtle')}>{label}</Text>
          </Button>
        )
      }
      return (
        <Box flexDirection="row">
          {one('tasks', `[t] Tasks (${v.tasks.length})`)}
          <Text color={C('subtle')}> │ </Text>
          {one('scouts', `[s] Scouts (${scouts.length})`)}
        </Box>
      )
    }
    const HINT = 'Enter opens · t tasks · s scouts · Esc closes'

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
              {sc.prompt?.trim() ? paragraphs(sc.prompt.trim()) : <Text color={C('subtle')}>(not loaded yet: run /scouts)</Text>}
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
          {banner()}
          {tabs()}
          {scouts.length > 0 && <Text wrap="truncate" color={C('subtle')}>{HINT}</Text>}
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
          {scouts.length > 0 && <Text wrap="truncate" color={C('subtle')}>Enter opens a scout · run now / edit on its page · /scouts run &lt;name&gt;</Text>}
        </Box>
      )
    }
    if (t) {
      const agentId = [...workers.entries()].find(([, w]) => w.task === t.id)?.[0]
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
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text>
              <Text bold color={C('claude')}>{t.id}</Text>{' '}
              <Text color={C(color[t.status]!)} bold>
                {mark[t.status]} {word[t.status]}
              </Text>
              <Text color={C('subtle')}>
                {' '}· added {when(t.created_at)} · changed {when(t.updated_at)} · tries{' '}
              </Text>
              <Text color={C(t.attempts > 2 ? 'warning' : 'subtle')}>{t.attempts}</Text>
            </Text>
            <Text bold color={C('text')}>
              {t.title}
            </Text>
            {t.note && (
              <Text>
                <Text color={C(color[t.status]!)}>now: </Text>
                <Text italic color={C('subtle')}>{t.note}</Text>
              </Text>
            )}
          </Box>

          <Box flexDirection="row" gap={1}>
            <Button key="back" label="Back" hotkey="b" autoFocus={t.status === 'waiting' ? undefined : true} onPress={act(() => update($, opened, () => ''))} />
            {agentId && <Button key="watch" label="Watch worker" hotkey="w" onPress={act(() => $.ui.view({ agentId }))} />}
            {(t.status === 'doing' || t.status === 'todo') && (
              <Button key="pause" label="Pause" hotkey="p" onPress={act(async () => (await runTool($, 'stop', { task: t.id, reason: 'paused by the owner' }), tellLead($, `The owner paused ${t.id} from the board.`)))} />
            )}
            {t.status === 'paused' && (
              <Button key="resume" label="Resume" hotkey="u" onPress={act(async () => (await runTool($, 'resume', { task: t.id }), tellLead($, `The owner resumed ${t.id} from the board.`)))} />
            )}
            {(t.status === 'failed' || t.status === 'dropped') && (
              <Button key="retry" label="Retry" hotkey="r" onPress={act(async () => (await runTool($, 'start', { task: t.id }), tellLead($, `The owner retried ${t.id} from the board.`)))} />
            )}
            {t.status !== 'done' && t.status !== 'dropped' && (
              <Button key="drop" label="Drop" hotkey="x" onPress={act(async () => (await runTool($, 'drop', { task: t.id, reason: 'dropped by the owner' }), tellLead($, `The owner dropped ${t.id} from the board.`)))} />
            )}
          </Box>

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
            {t.details.trim() ? paragraphs(t.details) : <Text color={C('subtle')}>(no details)</Text>}
          </Box>

          <Box flexDirection="column">
            {heading('May change')}
            {t.files.length ? (
              t.files.map(f => (
                <Text>
                  {'  '}
                  <Text color={C('autoAccept')}>{f}</Text>
                </Text>
              ))
            ) : (
              <Text color={C('subtle')}>  anywhere in the project</Text>
            )}
          </Box>

          {t.after.length > 0 && (
            <Box flexDirection="column">
              {heading('Waits for')}
              {t.after.map(id => {
                const dep = v.tasks.find(x => x.id === id)
                return (
                  <Text>
                    {'  '}
                    <Text bold color={C('claude')}>{id}</Text>{' '}
                    <Text color={C(dep ? color[dep.status]! : 'error')}>{dep ? `${mark[dep.status]} ${word[dep.status]}` : 'missing'}</Text>
                    {dep ? <Text color={C('subtle')}> · {dep.title}</Text> : null}
                  </Text>
                )
              })}
            </Box>
          )}

          {t.history.length > 0 && (
            <Box flexDirection="column">
              {heading(`What happened (${t.history.length}, newest first)`)}
              {[...t.history].reverse().map(historyLine)}
            </Box>
          )}

          {(t.runs?.length ?? 0) > 0 && (
            <Box flexDirection="column">
              {heading('Time and cost')}
              {t.runs!.map((r, i) => (
                <Text color={C(r.ended ? 'subtle' : 'success')}>{`  ${fmtRun(r, i, Date.now())}`}</Text>
              ))}
              <Text bold color={C('text')}>{`  total: ${fmtTotal(sumRuns(t.runs, Date.now()))}`}</Text>
            </Box>
          )}

          {t.branch && (
            <Text>
              <Text color={C('subtle')}>branch: </Text>
              <Text color={C('ide')}>{t.branch}</Text>
            </Text>
          )}
          <Text color={C('subtle')}>↑↓ scroll · b back{agentId ? ' · w watch worker' : ''}</Text>
        </Box>
      )
    }

    const nowMs = Date.now()
    const parts = boardSections(v.tasks, nowMs, localOffset(nowMs))
    for (const d of [...openDays]) if (!parts.days.some(g => g.day === d)) openDays.delete(d)
    const toggleDay = (day: string) => () => {
      if (openDays.has(day)) openDays.delete(day)
      else openDays.add(day)
      $.ui.invalidate('ui.render')
    }
    type Row = { task: SymccTask; indent: boolean } | { day: string; label: string }
    const list: Row[] = [
      ...[...parts.open, ...parts.today].map(task => ({ task, indent: false })),
      ...parts.days.flatMap(g => [{ day: g.day, label: groupLabel(g, openDays.has(g.day)) }, ...(openDays.has(g.day) ? g.tasks.map(task => ({ task, indent: true })) : [])]),
    ]
    const rows = list.flatMap(r => ('task' in r ? [r.task] : []))
    const idWidth = Math.max(4, ...rows.map(x => x.id.length))
    const wordWidth = Math.max(...rows.map(x => word[x.status]!.length), 5)
    return (
      <Box flexDirection="column">
        {banner()}
        {tabs()}
        {list.length > 0 && <Text wrap="truncate" color={C('subtle')}>{HINT}</Text>}
        {list.length === 0 && <Text color={C('subtle')}>The board is empty. Tell the lead what you want.</Text>}
        {list.map((r, i) => {
          if (!('task' in r))
            return (
              <Button key={`day:${r.day}`} autoFocus={i === 0 ? true : undefined} onPress={toggleDay(r.day)}>
                <Text color={C('subtle')}>{r.label}</Text>
              </Button>
            )
          const x = r.task
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
                {mark[x.status]} {word[x.status]!.padEnd(wordWidth)}
              </Text>
              <Text bold={x.status === 'waiting' || x.status === 'failed'} color={C(closed ? 'inactive' : 'text')}>
                {' '}
                {x.title.slice(0, Math.max(10, width - idWidth - wordWidth - 8))}
              </Text>
              {extra ? <Text color={C(x.status === 'waiting' ? 'warning' : x.status === 'failed' ? 'error' : 'subtle')}> — {extra}</Text> : null}
            </Button>
          )
        })}
      </Box>
    )
  })
}
