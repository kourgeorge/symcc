// T-1218: the board's friendly name ("power-falcon") and the branches made from it (symcc/<name>/T-n).
import { pickBoardName } from '../core/board-name'
import { namesFor } from '../name'
import type { Board } from '../core/board-file'
import type { Host } from '../host'
import { S } from './state'
import { git, repoOf, projectGone } from './git'

/** Makes `friendly` the name this window's task branches carry (S.N.branch). */
export const useFriendly = (friendly: string) => {
  if (S.N.friendly !== friendly) { S.N = namesFor(S.N.name, friendly) }
}

/** The repos of this board: its own folder and every project's. */
const reposOf = (): string[] => [...new Set([S.root, ...Object.values(S.projects)].filter(Boolean))]

/** Whether some repo of this board already has branches under symcc/<friendly>/ (another board's). Never throws. */
async function prefixTaken(host: Host, friendly: string): Promise<boolean> {
  for (const repo of reposOf()) {
    const r = await git(host, ['for-each-ref', '--format=%(refname)', `refs/heads/${S.N.name}/${friendly}/`], repo).catch(() => null)
    if (r?.exitCode === 0 && r.stdout.trim()) return true
  }
  return false
}

/** A new name for this board that no repo of it has branches under. */
export const newFriendlyName = (host: Host, random?: () => number): Promise<string> => pickBoardName(n => prefixTaken(host, n), random)

/**
 * The one-time move (T-1218): each of the board's tasks whose branch is still the old `<name>/T-n` (stored on the task or
 * the usual one) is renamed in its repo to `<name>/<friendly>/T-n`; the task's own `branch` follows. A rename git refuses
 * is left (the task's next try start renames it, see prepareWorktree). Answers the changed tasks and a line for each.
 */
export async function renameOldBranches(host: Host, b: Board, friendly: string): Promise<{ board: Board; lines: string[] }> {
  const lines: string[] = []
  const tasks = [] as Board['tasks']
  for (const t of b.tasks) {
    const old = `${S.N.name}/${t.id}`
    const next = `${S.N.name}/${friendly}/${t.id}`
    if ((t.branch ?? old) !== old || projectGone(t)) {
      tasks.push(t)
      continue
    }
    const repo = repoOf(t)
    const has = (await git(host, ['rev-parse', '--verify', '-q', `refs/heads/${old}`], repo).catch(() => null))?.exitCode === 0
    if (!has) {
      tasks.push(t.branch ? { ...t, branch: next } : t)
      continue
    }
    if ((await git(host, ['rev-parse', '--verify', '-q', `refs/heads/${next}`], repo).catch(() => null))?.exitCode === 0) {
      tasks.push(t)
      continue
    }
    const r = await git(host, ['branch', '-m', old, next], repo).catch(() => null)
    if (r?.exitCode === 0) {
      lines.push(`branch ${old} renamed to ${next}`)
      tasks.push({ ...t, branch: next })
    } else {
      lines.push(`branch ${old} could not be renamed (${((r?.stderr || r?.stdout) ?? 'git failed').trim().slice(0, 100)}); it is renamed when ${t.id} starts a try`)
      tasks.push(t)
    }
  }
  return { board: { ...b, tasks }, lines }
}

/** The branch a task's try starts on: its own, but an old-style `<name>/T-n` is renamed to the board's name first (T-1218). */
export async function renameIfOld(host: Host, t: { id: string; branch?: string | null }, repo: string): Promise<string | undefined> {
  const old = `${S.N.name}/${t.id}`
  if (!S.N.friendly || (t.branch ?? old) !== old) return t.branch ?? undefined
  const next = S.N.branch(t.id)
  const has = (await git(host, ['rev-parse', '--verify', '-q', `refs/heads/${old}`], repo).catch(() => null))?.exitCode === 0
  if (!has) return next
  const r = await git(host, ['branch', '-m', old, next], repo).catch(() => null)
  return r?.exitCode === 0 ? next : old
}
