// The commits of a task and the commit message.
import type { SymccRun, SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { isSha } from './board-file'
import { originOf } from './origin'

// ---------------- the commits of a task ----------------

/**
 * The runs with commit ids `shas` added to the last try (no repeats, only full ids). With no
 * try at all (a task from before tries were kept) the runs stay as they are.
 */
export function addCommits(runs: SymccRun[] | undefined, shas: readonly string[]): SymccRun[] {
  const out = [...(runs ?? [])]
  const last = out[out.length - 1]
  const add = shas.filter(isSha)
  if (!last || !add.length) return out
  const have = (last.commits ?? []).filter(isSha)
  const commits = [...have, ...add.filter((x, i) => !have.includes(x) && add.indexOf(x) === i)]
  out[out.length - 1] = { ...last, commits }
  return out
}

/**
 * The newest commit saved for a task (the last one of its newest try that saved any): the
 * commit its folder was at when it went to review. Undefined when none was saved.
 */
export function reviewedCommit(t: { runs?: SymccRun[] }): string | undefined {
  for (const r of [...(t.runs ?? [])].reverse()) {
    const c = (Array.isArray(r?.commits) ? r.commits : []).filter(isSha)
    if (c.length) return c[c.length - 1]
  }
  return undefined
}

/** One line of text for a commit message: control characters and line breaks become spaces, cut to `n` (with "…"). */
export function oneLine(s: unknown, n: number): string {
  // eslint-disable-next-line no-control-regex
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/** How long the Symcc-Why trailer may be. */
export const WHY_TRAILER_CHARS = 200

/** Who a task came from, for the Symcc-From trailer: "owner", "scout bugs", "T-12 (split)", "T-3 (worker report)", "lead" or "unknown". */
export function originTag(t: { origin?: unknown }): string {
  const o = originOf(t)
  if (!o) return 'unknown'
  if (o.by === 'owner') return 'owner'
  if (o.by === 'scout') return `scout ${oneLine(o.scout, 60) || '?'}`
  if (o.by === 'worker') return `${oneLine(o.task, 20) || '?'} (worker report)`
  if (o.task && o.how) return `${oneLine(o.task, 20)} (${o.how})`
  return 'lead'
}

/** The trailer key prefix for a plugin name: "symcc" → "Symcc"; only letters, digits and dashes. */
export function trailerPrefix(name: string = DEFAULT_NAME): string {
  const n = String(name ?? '').replace(/[^A-Za-z0-9-]/g, '').replace(/^-+/, '') || 'Symcc'
  return n[0]!.toUpperCase() + n.slice(1)
}

/**
 * The message of a commit symcc makes for task `t`: the first line (`subject`, by default
 * "T-x: title"), a blank line, then git trailers that `git log --format=%(trailers)` reads:
 *   Symcc-Task: T-73
 *   Symcc-From: owner | scout <name> | T-12 (split) | lead | unknown
 *   Symcc-Why: <the task's why on one line, cut to ~200 characters>
 *   Symcc-Try: <try number>
 * Line breaks and control characters in the title and why are made into spaces, so they
 * can never break the trailer block. Trailers with nothing to say (no why) are left out.
 */
export function commitMessage(t: Pick<SymccTask, 'id' | 'title' | 'attempts'> & { origin?: unknown }, o: { subject?: string; name?: string; tryNo?: number } = {}): string {
  const id = oneLine(t.id, 40) || '?'
  const subject = oneLine(o.subject ?? `${id}: ${t.title}`, 200) || id
  const k = trailerPrefix(o.name)
  const og = originOf(t)
  const why = oneLine(og?.why, WHY_TRAILER_CHARS)
  const n = Number(o.tryNo ?? t.attempts)
  const tryNo = Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : ''
  const trailers = [`${k}-Task: ${id}`, `${k}-From: ${originTag(t)}`, ...(why ? [`${k}-Why: ${why}`] : []), ...(tryNo ? [`${k}-Try: ${tryNo}`] : [])]
  return `${subject}\n\n${trailers.join('\n')}\n`
}

/** One commit of a task as shown: its full id, the try that made it, and whether it is the one that landed on the target branch. */
export type TaskCommit = { sha: string; try?: number; merged: boolean }

/** A task's commits, newest first; the merged one is marked (and listed even if no try recorded it). */
export function taskCommits(t: Pick<SymccTask, 'runs' | 'merged'>): TaskCommit[] {
  const merged = isSha(t.merged) ? t.merged : undefined
  const all: TaskCommit[] = []
  ;(t.runs ?? []).forEach((r, i) => {
    for (const sha of Array.isArray(r?.commits) ? r.commits : []) if (isSha(sha) && !all.some(c => c.sha === sha)) all.push({ sha, try: i + 1, merged: sha === merged })
  })
  if (merged && !all.some(c => c.sha === merged)) all.push({ sha: merged, merged: true })
  return all.reverse()
}

/** A short commit id, as git shows it: the first 8 characters. */
export const shortSha = (sha: string) => sha.slice(0, 8)

/** One commit in words: "47d4b71c (try 2, merged)". */
export const commitText = (c: TaskCommit) => {
  const more = [c.try ? `try ${c.try}` : '', c.merged ? 'merged' : ''].filter(Boolean).join(', ')
  return `${shortSha(c.sha)}${more ? ` (${more})` : ''}`
}
