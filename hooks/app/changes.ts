import type { SymccTask } from '../../types'
import { parseNumstat, hasMergedChanges, type BoardTask, type DiffFile, parseDiffStat, parseStatusZ, reviewedCommit, YOUR_EDITS, isTaskCommit, shortSha, secretFiles } from '../board'
import { gitOk, git, worktreeDir, taskBranch, repoOf, projectGone } from './git'
import { S, changesCache } from './state'
import type { Host } from '../host'

// ---------------- a task's changes, for the task page ----------------

/** The changes of a task: from where its work branch left the branch it merges into (the merge base) to the branch's tip. */
export const diffRange = (target: string, t: Pick<SymccTask, 'id' | 'branch'>) => `${target}...${taskBranch(t)}`

export function gitDiff($: Host, target: string, t: SymccTask, opts: string[], file = ''): Promise<string> {
  if (projectGone(t)) return Promise.reject(new Error(projectGone(t))) // an unknown project has no repo to read
  const key = `${t.id}|${t.updated_at}|${target}|${opts.join(' ')}|${file}`
  let p = changesCache.get(key)
  if (!p) {
    if (changesCache.size > 50) changesCache.clear()
    p = gitOk($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', ...opts, diffRange(target, t), ...(file ? ['--', file] : [])], repoOf(t))
    changesCache.set(key, p)
    p.catch(() => changesCache.delete(key))
  }
  return p
}

/**
 * The files the owner changed by hand in task `t`'s folder `dir` since it went to review:
 * uncommitted changes (new files too), and the files of commits newer than the reviewed one
 * (see reviewedCommit). Sorted, no repeats; the board folder is skipped.
 */
export async function ownerEdits($: Host, t: SymccTask, dir: string): Promise<string[]> {
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir)
  if (st.exitCode !== 0) throw new Error(`git status: ${(st.stderr || st.stdout).trim().slice(0, 300)}`)
  // Secret-looking files (see secretFiles) never merge, so they are not edits that count: a file a check left out stays
  // in the folder, and must not show in the task's diff as the owner's edit or make approve retest. Deleting one still counts.
  const files = parseStatusZ(st.stdout).filter(e => !leftOutKind(e)).map(e => e.path)
  const seen = reviewedCommit(t)
  if (seen) {
    const head = (await git($, ['rev-parse', '-q', '--verify', 'HEAD'], dir)).stdout.trim()
    if (head && head !== seen) {
      const d = await git($, ['diff', '--name-only', '--no-renames', '-z', `${seen}..${head}`], dir)
      files.push(...(d.exitCode === 0 ? d.stdout.split('\0').filter(Boolean) : [`(commits after ${shortSha(seen)})`]))
    }
  }
  const skip = S.N.dir
  return [...new Set(files)].filter(f => f !== skip && !f.startsWith(`${skip}/`)).sort()
}

/**
 * Task `t`'s changes as its folder has them now, uncommitted edits included, against where it
 * left the target branch. New files the owner added are marked "intent to add" (git add -N) so
 * the diff shows them; approve commits them anyway. `edits`: see ownerEdits. With no folder or
 * no edits, this is the branch's diff (gitDiff, cached).
 */
export async function folderDiff($: Host, target: string, t: SymccTask, opts: string[], file = ''): Promise<{ text: string; edits: string[] }> {
  const dir = worktreeDir(t.id)
  const edits = (await $.fs.exists(`${dir}/.git`)) ? await ownerEdits($, t, dir) : []
  if (!edits.length) return { text: await gitDiff($, target, t, opts, file), edits }
  const st = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], dir)
  const entries = parseStatusZ(st.stdout)
  const fresh = entries.filter(e => e.code === '??' && !leftOutKind(e)).map(e => e.path)
  if (fresh.length) await git($, ['add', '-N', '--', ...fresh], dir)
  // secret-looking files left in the folder are never shown: they are not part of what merges
  const hide = entries.filter(leftOutKind).map(e => `:(exclude,literal)${e.path}`)
  const paths = file ? [file, ...hide] : hide
  const base = await gitOk($, ['merge-base', `refs/heads/${target}`, 'HEAD'], dir)
  const text = await gitOk($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', ...opts, base, ...(paths.length ? ['--', ...paths] : [])], dir)
  return { text, edits }
}

/** Whether a `git status` entry is a secret-looking file (see secretFiles) that is there, not deleted: one a check leaves out of a task's change. */
const leftOutKind = (e: { code: string; path: string }) => !e.code.includes('D') && secretFiles([e.path]).length > 0

/** The files a task changed, with +/- line counts, as its folder has them now (see folderDiff); the owner's edited files are marked. */
export async function changedFiles($: Host, target: string, t: SymccTask): Promise<DiffFile[]> {
  const d = await folderDiff($, target, t, ['--stat=1000,800'])
  return parseDiffStat(d.text).map(f => (d.edits.includes(f.file) ? { ...f, edited: true } : f))
}

/**
 * The diff of a task's changes (all files, or just `file`) as its folder has them now, against
 * the merge base. When the owner's edits are in it, it starts with a line saying so (YOUR_EDITS).
 */
// A function declaration, not an arrow: the plugin loader follows $ past an import only into one.
export async function changesText($: Host, target: string, t: SymccTask, file = '') {
  const d = await folderDiff($, target, t, [], file)
  const mine = d.edits.length && d.text.trim() && (!file || d.edits.includes(file))
  return mine ? `${YOUR_EDITS}\n${d.text}` : d.text
}

// ---------------- a done task's merged changes ----------------

/** T-1086: what main was before a done task's merged commit: the second parent of symcc's catch-up merge (its parents are the task's tip, then main);
 *  else the first commit down the first-parent line that is not the task's own. '' when git does not have the commit; null when a git call failed (try again). */
export async function mergedBefore($: Host, t: Pick<SymccTask, 'id' | 'runs'>, merged: string): Promise<string | null> {
  const repo = repoOf(t) // T-1154: the task's own repo
  // T-1096: commits the worker made itself have no Task line; the try saved them, so they count as the task's own too
  const saved = new Set((t.runs ?? []).flatMap(r => (Array.isArray(r?.commits) ? r.commits : [])))
  const own = (sha: string, msg: string) => saved.has(sha) || isTaskCommit(msg, t.id, S.N.name)
  const p = await git($, ['rev-list', '--parents', '-n', '1', merged], repo).catch(() => null)
  if (!p || p.exitCode !== 0) {
    // a failed call (timeout, failed start) is not "no commit": only a commit git says it has not got is final
    const c = await git($, ['cat-file', '-e', `${merged}^{commit}`], repo).catch(() => null)
    return c && (c.exitCode === 1 || c.exitCode === 128) ? '' : null
  }
  const [, first, second] = String(p.stdout ?? '').trim().split(/\s+/)
  if (!first) return ''
  if (second) {
    // symcc's own merge commit (the task's trailer): main is its second parent. A merge made by hand on main: its first parent is main.
    const m = await git($, ['log', '-n', '1', '--format=%B', merged], repo).catch(() => null)
    if (!m || m.exitCode !== 0) return null
    if (isTaskCommit(String(m.stdout ?? ''), t.id, S.N.name)) return second
    // the worker's own merge of main (saved in the runs) sits on the task's line: its first parent is the task's own commit
    if (saved.has(merged)) {
      const f = await git($, ['log', '-n', '1', '--format=%B', first], repo).catch(() => null)
      if (f && f.exitCode === 0 && own(first, String(f.stdout ?? ''))) return second
    }
    return first
  }
  const log = await git($, ['log', '--first-parent', '-n', '200', '--format=%H%x1f%P%x1f%B%x1e', merged], repo).catch(() => null)
  if (!log || log.exitCode !== 0) return first
  for (const entry of String(log.stdout ?? '').split('\x1e')) {
    const [sha, parents, msg] = entry.trim().split('\x1f')
    if (!sha) continue
    if (!own(sha, msg ?? '')) return sha
    // the task's own merge of main (symcc's catch-up, or the worker's own): main as it was then is its second parent
    const second = (parents ?? '').split(' ')[1]
    if (second) return second
  }
  return first
}

/** What a done task's page shows under Changes: its files, the commit it merged as, and what main was before it. */
export type MergedChanges = { files: DiffFile[]; error: string; merged: string; before: string }

/** T-1086: the answers kept in memory for the page (nothing is saved in the data folder); null: nothing to show. */
const mergedMemo = new Map<string, MergedChanges | null>()

/** Forgets the answers kept in memory (a plugin reload; tests). */
export function resetMergedChanges() {
  mergedMemo.clear()
}

/**
 * T-1086: a done change task's Changes: `git diff --numstat <main before> <merged commit>`, read from the commits
 * the task recorded; null for an investigation or errand, a task with no merged commit, or when git has none of it.
 */
export async function mergedChanges($: Host, t: SymccTask): Promise<MergedChanges | null> {
  if (!hasMergedChanges(t) || projectGone(t)) return null
  const merged = (t as BoardTask).merged!
  const key = `${t.id}:${merged}`
  if (mergedMemo.has(key)) return mergedMemo.get(key)!
  const before = await mergedBefore($, t, merged)
  if (before === null) return null // git could not be read: not kept, the next open tries again
  const r = before ? await git($, ['diff', '--numstat', '--no-renames', before, merged], repoOf(t)).catch(() => null) : null
  const files = r && r.exitCode === 0 ? parseNumstat(String(r.stdout ?? '')) : []
  const got = files.length ? { files, error: '', merged, before } : null
  // a missing commit or an empty diff is a final answer (kept); a failed git diff is tried again next time
  if (!before || r?.exitCode === 0) mergedMemo.set(key, got)
  return got
}

/** T-1086: said in place of a done task's diff when git no longer has its commits. */
export const DIFF_GONE = 'diff not available'

/** T-1086: a done task's diff (all files, or just `file`) from git: `git diff <before> <merged> -- <file>`; DIFF_GONE when git has no such commits. */
export async function mergedDiff($: Host, t: SymccTask, file = ''): Promise<string> {
  const c = await mergedChanges($, t).catch(() => null)
  if (!c) return DIFF_GONE
  const r = await git($, ['diff', '--no-color', '--no-ext-diff', '--no-renames', c.before, c.merged, ...(file ? ['--', file] : [])], repoOf(t)).catch(() => null)
  return r && r.exitCode === 0 ? String(r.stdout ?? '') : DIFF_GONE
}
