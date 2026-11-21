// T-727: the figures of the Live tab's Branches section (core/live.ts's liveBranches draws them): the main line's latest
// commits and, for each open task with a branch (doing, review, waiting, failed, paused), how many commits it is ahead
// of and behind the branch it merges into and where it forked. Read with read-only git commands only, and never while a
// page is drawn: publish() puts the last figures in the view at once and, when they are older than BRANCH_CACHE_MS (or
// the open branches changed), starts a new read in the background, which puts its figures in the view when done.
// A git command that fails leaves out only what it was for: a task's row, or (the main line's log) the whole section.
import type { Board } from '../board'
import { BRANCH_COMMITS, BRANCH_STATUSES, type BranchFacts, type BranchFigures } from '../core/live'
import { intoOf } from '../core/board-file'
import type { Host } from '../host'
import { S, updateView } from './state'
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
  const recent = b.tasks.some(t => t.status === 'done' && (t.history ?? []).some(h => h.kind === 'merged' && nowMs - (Date.parse(h.at ?? "") || 0) <= 2 * BRANCH_CACHE_MS))
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
