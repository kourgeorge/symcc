// T-514: mark a task done when its work was already merged outside the board (by hand), checked with git.
// Nothing is merged and no test runs: the work is already in the branch it merges into.
import { type BoardTask, find, putTask, intoOf, isInvestigation, isSha, isTaskCommit, trailerPrefix, taskCommits, shortSha, STATUS_WORD, gitNote, mergedOutside, notMergedText, MERGED_OUTSIDE_FROM } from '../board'
import { S } from './state'
import { type Host } from '../host'
import { load, change, now } from './store'
import { git, gitReady, branchExists, taskBranch, worktreeDir, removeWorktree, deleteMergedBranch } from './git'
import { pump, stopWorker, checkingNow, mergingNow, CHECKING_TEXT, MERGING_TEXT } from './workers'

/** What git found: the commit on the target that holds the work (`sha`) and the task's own commits (`commits`, oldest first). */
export type MergedFound = { sha: string; commits: string[]; rebased?: boolean }

/** At most this many of a task's own commits are looked for (and recorded). */
const OWN_COMMITS_MAX = 50

/** The commits of task `id` reachable from `tip` (its trailer says so), oldest first. */
async function ownCommits($: Host, id: string, tip: string): Promise<string[]> {
  const r = await git($, ['log', `-n${OWN_COMMITS_MAX}`, '--format=%H%x1f%B%x1e', '-F', `--grep=${trailerPrefix(S.N.name)}-Task: ${id}`, tip])
  if (r.exitCode !== 0) return []
  const out: string[] = []
  for (const rec of r.stdout.split('\x1e')) {
    const [sha, msg] = rec.replace(/^\s+/, '').split('\x1f')
    if (sha && isSha(sha.trim()) && isTaskCommit(msg ?? '', id, S.N.name)) out.push(sha.trim())
  }
  return out.reverse()
}

/** Whether commit `a` is in `b` (an ancestor of it, or the same). */
const inBranch = async ($: Host, a: string, b: string) => (await git($, ['merge-base', '--is-ancestor', a, b])).exitCode === 0

/**
 * The commit on `into` that brought `tip` in: the merge commit whose other parent is `tip`, or `tip` itself when
 * the branch was fast-forwarded (or git could not tell).
 */
async function mergeCommitOf($: Host, tip: string, into: string): Promise<string> {
  const r = await git($, ['rev-list', '--ancestry-path', '--topo-order', '--reverse', '--parents', `${tip}..refs/heads/${into}`])
  const first = r.exitCode === 0 ? (r.stdout.split('\n')[0] ?? '').trim().split(/\s+/) : []
  return first.length > 2 && isSha(first[0]) && first[1] !== tip && first.slice(2).includes(tip) ? first[0]! : tip
}

/**
 * Checks with git that task `t`'s work is all in the branch it merges into. Its branch's tip must be in it (merged or
 * fast-forwarded), or else every commit of the branch must have an equal change there (rebased or cherry-picked).
 * With no branch left, its newest recorded commit must be in it. Throws a plain reason when it isn't.
 */
export async function findMerged($: Host, t: BoardTask): Promise<MergedFound> {
  const into = intoOf(t)
  const branch = taskBranch(t)
  if (!(await branchExists($, into))) throw new Error(`${t.id} merges into ${into}, but that branch is gone, so there is nothing to check its work against`)
  const recorded = taskCommits(t).map(c => c.sha)
  const hasBranch = await branchExists($, branch)
  if (!hasBranch) {
    const last = recorded[0]
    if (!last) throw new Error(`${t.id} has no branch ${branch} and no recorded commits, so there is no work to find in ${into}`)
    if (!(await inBranch($, last, `refs/heads/${into}`))) throw new Error(`${t.id}'s last commit ${shortSha(last)} isn't in ${into} yet (its branch ${branch} is gone)`)
    return { sha: await mergeCommitOf($, last, into), commits: [...recorded].reverse() }
  }
  const tip = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`])).stdout.trim()
  if (!isSha(tip)) throw new Error(`git could not read ${t.id}'s branch ${branch}`)
  const own = await ownCommits($, t.id, tip)
  if (!own.length && !recorded.length) throw new Error(`${t.id}'s branch ${branch} has no commits of its own, so there is no work to find in ${into}`)
  if (await inBranch($, tip, `refs/heads/${into}`)) return { sha: await mergeCommitOf($, tip, into), commits: own }
  // Not merged as it is: every commit may still be in `into` as an equal change (a rebase or cherry-pick).
  const ch = await git($, ['cherry', `refs/heads/${into}`, `refs/heads/${branch}`])
  if (ch.exitCode !== 0) throw new Error(`git could not compare ${t.id}'s branch ${branch} with ${into}: ${(ch.stderr || ch.stdout).trim().slice(0, 200)}`)
  const lines = ch.stdout.split('\n').map(l => l.trim()).filter(Boolean)
  const missing = lines.filter(l => l.startsWith('+')).length
  if (missing || !lines.length) throw new Error(notMergedText(t.id, missing || 1, into))
  // the newest commit on `into` with a change equal to one of the branch's
  const eq = await git($, ['log', '--left-only', '--cherry-mark', '--no-merges', '--format=%m%H', `refs/heads/${into}...refs/heads/${branch}`])
  const same = eq.exitCode === 0 ? eq.stdout.split('\n').map(l => l.trim()).find(l => l.startsWith('=')) : undefined
  const sha = same?.slice(1)
  const head = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${into}`])).stdout.trim()
  return { sha: sha && isSha(sha) ? sha : head, commits: own, rebased: true }
}

/**
 * Marks task `id` done because its work is already merged into the branch it merges into, outside the board (checked
 * with git, see findMerged). `by` is who did it ("the owner", "the lead"), said in its history. A running task is
 * stopped first. Nothing is merged or tested; its folder and branch are cleaned up like after a merge, and tasks
 * waiting on it can start. Throws a plain reason when it can't.
 */
export async function markMerged($: Host, id: string, by: string): Promise<string> {
  const b = await load($)
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (t.status === 'done') throw new Error(`${t.id} is already done`)
  if (!MERGED_OUTSIDE_FROM.includes(t.status)) throw new Error(`${t.id} is ${STATUS_WORD[t.status]}; only a task that is to do, running, failed, waiting, paused, in review or dropped can be marked as merged`)
  if (isInvestigation(t)) throw new Error(`${t.id} is an investigation: it has nothing to merge`)
  if (mergingNow(t.id)) throw new Error(MERGING_TEXT(t.id))
  if (checkingNow(t.id)) throw new Error(`${CHECKING_TEXT(t.id)}; try again when that ends`)
  if (!(await gitReady($, b))) throw new Error(`${t.id} was not marked as merged: ${gitNote(S.gitState)}`)
  const found = await findMerged($, t)
  const into = intoOf(t)
  const wasDoing = t.status === 'doing'
  if (wasDoing) await stopWorker($, t.id, 'its work was merged outside the board')
  const marked = await change($, x => {
    const cur = find(x, t.id)
    if (!cur || cur.status === 'done') return [x, false] as [typeof x, boolean]
    return [putTask(x, mergedOutside(cur, found.sha, by, found.commits, now())), true] as [typeof x, boolean]
  })
  if (!marked) return `${t.id} is already done`
  // cleaned up like after a merge; a folder with uncommitted changes is kept (and so its branch, checked out there)
  const dir = worktreeDir(t.id)
  let kept = ''
  if (await $.fs.exists(`${dir}/.git`)) {
    const st = await git($, ['status', '--porcelain'], dir)
    if (st.exitCode !== 0 || st.stdout.trim()) kept = `; its folder ${S.N.dir}/worktrees/${t.id} has uncommitted changes, so it and its branch were kept`
    else if (!(await removeWorktree($, t.id, dir).catch(() => false))) kept = '; its folder is still in use, so it was kept for now'
  }
  const branch = taskBranch(t)
  if (!kept && (await branchExists($, branch))) {
    if (found.rebased) kept = `; its branch ${branch} was kept (its commits are in ${into} as equal changes, not as they are); delete it by hand when you like`
    else if (!(await deleteMergedBranch($, branch, into).catch(() => false))) kept = `; its branch ${branch} was kept (it could not be deleted now)`
  }
  void pump($)
  return `${t.id} done: its work is already in ${into} (${shortSha(found.sha)}), merged outside the board; nothing was merged or tested${wasDoing ? '; its worker was stopped' : ''}${kept}`
}
