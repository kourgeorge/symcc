// T-727: the figures of the Live tab's Branches section (core/live.ts's liveBranches draws them): the main line's latest
// commits and, for each open task with a branch (doing, review, waiting, failed, paused), how many commits it is ahead
// of and behind the branch it merges into and where it forked (T-794: a task merged in the last 10 minutes keeps its row too). Read with read-only git commands only, and never while a
// page is drawn: publish() puts the last figures in the view at once and, when they are older than BRANCH_CACHE_MS (or
// the open branches changed), starts a new read in the background, which puts its figures in the view when done.
// A git command that fails leaves out only what it was for: a task's row, or (the main line's log) the whole section.
import type { Board } from '../board'
import { BRANCH_COMMITS, BRANCH_STATUSES, liveFinishedLanes, type BranchFacts, type BranchFigures } from '../core/live'
import { intoOf, isFinished, isSha } from '../core/board-file'
import { TASK_BRANCH_COMMITS, TASK_BRANCH_MAIN, type TaskBranchCommit, type TaskBranchFacts } from '../core/task-branch'
import { trailerPrefix } from '../core/commits'
import type { BranchCommit } from '../core/live'
import type { SymccTask } from '../../types'
import type { Host } from '../host'
import { type PaneView, S, updateView } from './state'
import { git } from './git'

/** How long the figures are kept before they are read again. */
export const BRANCH_CACHE_MS = 30_000
const GIT_MS = 15_000

/** The last figures read (`key`: the main branch and open branches they were read for), and whether a read runs now. */
const cache = { facts: undefined as BranchFacts | undefined, key: '', readAt: -Infinity, running: false }

/** Forgets the figures (a reload, a test). */
export function resetBranches() {
  cache.facts = undefined
  cache.key = ''
  cache.readAt = -Infinity
  cache.running = false
  resetTaskBranches()
}

/** A name git can be given as a revision (never an option). */
const safe = (name: string) => !!name && !name.startsWith('-') && !/\s/.test(name)

/** The open tasks of `b` whose branch is shown: id, branch and the branch it merges into. */
function openBranches(b: Pick<Board, 'tasks'>): { id: string; branch: string; into: string }[] {
  return b.tasks.filter(t => BRANCH_STATUSES.includes(t.status) && typeof t.branch === 'string' && safe(t.branch)).map(t => ({ id: t.id, branch: t.branch!, into: intoOf(t) }))
}

/**
 * Reads the figures with git (in the project's main folder): `git log -N --format=%H %ct <into>` for the main line, and
 * for each open branch `git rev-list --left-right --count <its into>...<branch>` (behind, ahead) and `git merge-base`.
 * Null when the main line can't be read; a task whose commands fail is left out.
 */
export async function readBranches(host: Host, into: string, b: Pick<Board, 'tasks'>, nowMs: number): Promise<BranchFacts | null> {
  if (!safe(into)) return null
  const run = (args: string[]) => git(host, args, S.root, GIT_MS).catch(() => null)
  const log = await run(['log', `-${BRANCH_COMMITS}`, '--format=%H %ct', into, '--'])
  if (!log || log.exitCode !== 0) return null
  const commits = log.stdout
    .split('\n')
    .map(l => l.trim().split(/\s+/))
    .filter(p => /^[0-9a-f]{7,64}$/.test(p[0] ?? '') && /^\d+$/.test(p[1] ?? ''))
    .map(p => ({ sha: p[0]!, at: Number(p[1]) * 1000 }))
  if (!commits.length) return null
  const tasks: Record<string, BranchFigures> = {}
  await Promise.all(
    openBranches(b).map(async t => {
      if (!safe(t.into)) return
      const count = await run(['rev-list', '--left-right', '--count', `${t.into}...${t.branch}`])
      const m = count?.exitCode === 0 ? /^(\d+)\s+(\d+)$/.exec(count.stdout.trim()) : null
      if (!m) return
      const base = await run(['merge-base', t.into, t.branch])
      const sha = base?.exitCode === 0 ? base.stdout.trim() : ''
      if (!/^[0-9a-f]{7,64}$/.test(sha)) return
      tasks[t.id] = { behind: Number(m[1]), ahead: Number(m[2]), base: sha }
    }),
  )
  return { into, commits, tasks, at: nowMs }
}

/**
 * The figures for the view now (the last ones read; none when git isn't ready or no task has a branch), and starts a
 * read in the background when they are stale (see the top of this file). `done` (tests) is the read started, if any.
 */
export function branchFacts(host: Host, b: Pick<Board, 'tasks'>, into: string, nowMs = Date.now()): { facts: BranchFacts | undefined; done?: Promise<void> } {
  if (S.gitState !== 'ok' || !S.root) return { facts: undefined }
  const open = openBranches(b)
  // T-794: the tasks merged in the last 10 minutes keep a row (the same ones ▍Tasks keeps: liveFinishedLanes)
  const recent = liveFinishedLanes({ tasks: b.tasks as SymccTask[] }, nowMs).length > 0
  if (!open.length && !recent) return { facts: undefined }
  const key = [into, ...open.map(t => `${t.id}:${t.branch}:${t.into}`), ...b.tasks.filter(t => t.status === 'done' && t.merged).map(t => t.merged)].join(' ')
  const fresh = cache.key === key && nowMs - cache.readAt < BRANCH_CACHE_MS
  if (fresh || cache.running) return { facts: cache.facts }
  cache.running = true
  const done = readBranches(host, into, b, nowMs)
    .then(async facts => {
      cache.facts = facts ?? undefined
      cache.key = key
      cache.readAt = nowMs
      await updateView(host, v => ({ ...v, branches: cache.facts }))
    })
    .catch(() => undefined)
    .finally(() => {
      cache.running = false
    })
  return { facts: cache.facts, done }
}

// ---------------- T-761: one task's branch, for its page's Branch section (core/task-branch.ts) ----------------
// Read like the figures above: never while a page is drawn. taskBranchFacts gives the last facts read for a task at
// once and, when they are older than BRANCH_CACHE_MS (or the task's branch, merge or try changed), starts a new read
// in the background; when it is done, the callers waiting for it are told (the page redraws). publish() reads them for
// the open tasks with a branch and the latest merged ones and puts them in the view (`task_branches`), as OpenCode's
// panel can only draw what the view file holds; Claude Code's task page asks for the task it shows.

/** How many of the latest merged (and of the latest dropped) tasks publish() reads the branch of. */
export const TASK_BRANCH_MERGED = 5

/** The last facts read per task (`key`: what they were read for), and the reads running now with who waits for them. */
const taskCache = new Map<string, { facts: TaskBranchFacts | null; key: string; readAt: number }>()
const taskRunning = new Map<string, (() => void)[]>()

/** Forgets every task's branch facts (a reload, a test). */
export function resetTaskBranches() {
  taskCache.clear()
  taskRunning.clear()
}

/** One line of the branch's log (see logFormat): sha, parents, time, the Symcc-Task and Symcc-Try lines. */
type LogLine = { sha: string; parents: string[]; at: number; task: string; tryNo?: number }
const logFormat = () => {
  const k = trailerPrefix(S.N.name)
  return `--format=%H%x09%P%x09%ct%x09%(trailers:key=${k}-Task,valueonly,separator=%x2C)%x09%(trailers:key=${k}-Try,valueonly,separator=%x2C)`
}
function logLines(stdout: string): LogLine[] {
  return stdout
    .split('\n')
    .map(l => l.split('\t'))
    .filter(p => /^[0-9a-f]{7,64}$/.test(p[0]?.trim() ?? '') && /^\d+$/.test(p[2]?.trim() ?? ''))
    .map(p => {
      const tryNo = Number(String(p[4] ?? '').split(',')[0]!.trim())
      return { sha: p[0]!.trim(), parents: String(p[1] ?? '').trim().split(/\s+/).filter(Boolean), at: Number(p[2]) * 1000, task: String(p[3] ?? '').split(',')[0]!.trim(), ...(tryNo > 0 ? { tryNo } : {}) }
    })
}
/** How many of main's commits after a merged task's merge are read (the first ones after it). */
const MAIN_AFTER_MERGE = 3
/** "sha time" lines (git log --format=%H %ct) as commits. */
const shaTimes = (stdout: string): BranchCommit[] =>
  stdout
    .split('\n')
    .map(l => l.trim().split(/\s+/))
    .filter(p => /^[0-9a-f]{7,64}$/.test(p[0] ?? '') && /^\d+$/.test(p[1] ?? ''))
    .map(p => ({ sha: p[0]!, at: Number(p[1]) * 1000 }))

/**
 * Reads task `t`'s branch with read-only git (in the project's main folder). A merged task (done, with `merged`): its
 * commits are the first-parent line down from the merged commit while they carry its Symcc-Task line or are among the
 * commits its runs saved (a worker's own commits, T-1053), and the commit
 * under them is the fork. An open one: `git rev-list --left-right --count <into>...<branch>` (behind, ahead) and
 * `git log --first-parent <into>..<branch>` (its commits; a merge is a catch-up), the fork the first parent of the
 * oldest (else `git merge-base`). Then into's commits since the fork (`git log <fork>..<into>`), the newest one its tip;
 * for a merged task, into's commits between the fork and the merge (`git log <fork>..<merged>`) and the first few after.
 * Null when the branch can't be read (none yet, deleted) or git fails.
 */
export async function readTaskBranch(host: Host, t: Pick<SymccTask, 'id' | 'status' | 'branch' | 'merged' | 'history'> & Partial<Pick<SymccTask, 'runs'>>, into: string, nowMs: number): Promise<TaskBranchFacts | null> {
  if (!safe(into)) return null
  const run = (args: string[]) => git(host, args, S.root, GIT_MS).then(r => (r.exitCode === 0 ? String(r.stdout ?? '') : null), () => null)
  const branch = typeof t.branch === 'string' ? t.branch : ''
  const merged = t.status === 'done' && isSha(t.merged) ? t.merged : ''
  let commits: LogLine[] = []
  let fork: BranchCommit | undefined
  let ahead: number | undefined
  let behind: number | undefined
  if (merged) {
    const out = await run(['log', '--first-parent', `-${TASK_BRANCH_COMMITS + 1}`, logFormat(), merged, '--'])
    if (out === null) return null
    const lines = logLines(out)
    // T-1053: a worker's own commits carry no Task line; the ones its tries saved still count as the task's
    const saved = new Set((t.runs ?? []).flatMap(r => (Array.isArray(r?.commits) ? r.commits : [])))
    const n = lines.findIndex(l => l.task !== t.id && !saved.has(l.sha))
    commits = lines.slice(0, n < 0 ? lines.length : n)
    if (!commits.length) return null
    const under = n >= 0 ? lines[n] : undefined
    if (under) fork = { sha: under.sha, at: under.at }
  } else {
    if (!safe(branch)) return null
    const count = await run(['rev-list', '--left-right', '--count', `${into}...${branch}`])
    const m = count === null ? null : /^(\d+)\s+(\d+)$/.exec(count.trim())
    if (!m) return null
    behind = Number(m[1])
    ahead = Number(m[2])
    const out = await run(['log', '--first-parent', `-${TASK_BRANCH_COMMITS}`, logFormat(), `${into}..${branch}`, '--'])
    if (out === null) return null
    commits = logLines(out)
    const oldest = commits[commits.length - 1]
    const base = oldest ? oldest.parents[0] : (await run(['merge-base', into, branch]))?.trim()
    if (base && /^[0-9a-f]{7,64}$/.test(base)) {
      const at = shaTimes((await run(['log', '-1', '--format=%H %ct', base, '--'])) ?? '')[0]
      if (at) fork = at
    }
  }
  let main: BranchCommit[]
  let tip: BranchCommit | undefined
  if (merged && fork) {
    // a merged task: the commits main got between the fork and the merge, plus the first few after the merge (the
    // newest of <fork>..main would all come after the merge once main moved on far enough); main's tip on its own
    const between = await run(['log', `-${TASK_BRANCH_MAIN}`, '--format=%H %ct', `${fork.sha}..${merged}`, '--'])
    const head = await run(['log', '-1', '--format=%H %ct', into, '--'])
    const count = await run(['rev-list', '--count', `${merged}..${into}`])
    if (between === null || head === null || count === null) return null
    const later = Number(count.trim()) || 0
    const after = later > 0 ? await run(['log', `--skip=${Math.max(0, later - MAIN_AFTER_MERGE)}`, `-${MAIN_AFTER_MERGE}`, '--format=%H %ct', `${merged}..${into}`, '--']) : ''
    if (after === null) return null
    main = [...shaTimes(after), ...shaTimes(between)]
    tip = shaTimes(head)[0] ?? main[0] ?? fork
  } else {
    const since = fork ? await run(['log', `-${TASK_BRANCH_MAIN}`, '--format=%H %ct', `${fork.sha}..${into}`, '--']) : await run(['log', '-1', '--format=%H %ct', into, '--'])
    if (since === null) return null
    main = shaTimes(since)
    tip = main[0] ?? fork
  }
  if (!tip) return null
  const own = new Set(commits.map(c => c.sha))
  const mergedLine = commits.find(c => c.sha === merged)
  const mergedAt = Math.max(-Infinity, ...(t.history ?? []).filter(h => h.kind === 'merged').map(h => Date.parse(h.at ?? '') || -Infinity))
  return {
    branch: branch || S.N.branch(t.id),
    into,
    tip,
    ...(fork ? { fork } : {}),
    main: (fork ? main.filter(c => !own.has(c.sha)) : []).reverse(),
    commits: commits.map((c): TaskBranchCommit => ({ sha: c.sha, at: c.at, ...(c.tryNo ? { try: c.tryNo } : {}), ...(c.parents.length > 1 ? { catchUp: true } : {}) })).reverse(),
    ...(ahead !== undefined ? { ahead } : {}),
    ...(behind !== undefined ? { behind } : {}),
    ...(merged ? { merged: { sha: merged, at: Number.isFinite(mergedAt) ? mergedAt : (mergedLine?.at ?? nowMs) } } : {}),
    at: nowMs,
  }
}

/** Whether task `t` may have a branch to draw: a merged commit (done), or a branch named on it (open, failed, dropped). */
export const hasTaskBranch = (t: Pick<SymccTask, 'status' | 'branch' | 'merged'>): boolean => (t.status === 'done' ? isSha(t.merged) : typeof t.branch === 'string' && safe(t.branch))

/**
 * Task `t`'s branch facts now (the last read; undefined when none was read yet, git isn't ready or it has no branch),
 * and starts a read in the background when they are stale (see above); `onRead` is called once that read is done.
 * `done` (tests) is the read started, if any.
 */
export function taskBranchFacts(host: Host, t: Pick<SymccTask, 'id' | 'status' | 'branch' | 'merged' | 'history' | 'attempts'> & Partial<Pick<SymccTask, 'runs'>>, into: string, nowMs = Date.now(), onRead?: () => void): { facts: TaskBranchFacts | undefined; done?: Promise<void> } {
  if (S.gitState !== 'ok' || !S.root || !hasTaskBranch(t)) return { facts: undefined }
  const key = [into, t.status, t.branch ?? '', t.merged ?? '', t.attempts].join(' ')
  const got = taskCache.get(t.id)
  const facts = got?.key === key ? (got.facts ?? undefined) : undefined
  const waiting = taskRunning.get(t.id)
  if (waiting) {
    if (onRead) waiting.push(onRead)
    return { facts }
  }
  if (got?.key === key && nowMs - got.readAt < BRANCH_CACHE_MS) return { facts }
  const waiters: (() => void)[] = onRead ? [onRead] : []
  taskRunning.set(t.id, waiters)
  const done = readTaskBranch(host, t, into, nowMs)
    .catch(() => null)
    .then(read => {
      taskCache.set(t.id, { facts: read, key, readAt: nowMs })
      taskRunning.delete(t.id)
      for (const w of waiters) {
        try {
          w()
        } catch {
          // a page gone meanwhile
        }
      }
    })
  return { facts, done }
}

/** The tasks publish() reads the branch of: the open ones with a branch, and the TASK_BRANCH_MERGED latest merged and
 *  latest dropped ones (a dropped task keeps its branch, drawn dim; capped since they pile up). */
export function viewBranchTasks<T extends Pick<SymccTask, 'id' | 'status' | 'branch' | 'merged' | 'updated_at'>>(tasks: readonly T[]): T[] {
  const open = tasks.filter(t => !isFinished(t) && hasTaskBranch(t))
  const latest = (status: string) =>
    tasks
      .filter(t => t.status === status && hasTaskBranch(t))
      .sort((a, b) => (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0))
      .slice(0, TASK_BRANCH_MERGED)
  return [...open, ...latest('done'), ...latest('dropped')]
}

/** The branch facts for the view (`task_branches`, by task id): the last ones read for viewBranchTasks; a read that
 *  ends puts its facts in the view. */
export function taskBranchesView(host: Host, b: Pick<Board, 'tasks'>, nowMs = Date.now()): { facts: Record<string, TaskBranchFacts>; done: Promise<void>[] } {
  const facts: Record<string, TaskBranchFacts> = {}
  const done: Promise<void>[] = []
  for (const t of viewBranchTasks(b.tasks)) {
    const into = intoOf(t)
    const put = () => {
      if (S.gitState !== 'ok') return
      const f = taskCache.get(t.id)?.facts
      void updateView(host, v => {
        const all = { ...((v as PaneView).task_branches ?? {}) }
        if (f) all[t.id] = f
        else delete all[t.id]
        return { ...v, task_branches: all } as typeof v
      }).catch(() => undefined)
    }
    const got = taskBranchFacts(host, t, into, nowMs, put)
    if (got.facts) facts[t.id] = got.facts
    if (got.done) done.push(got.done)
  }
  return { facts, done }
}
