// T-1173: the lead's periodic digest. Agent reports are muted, so every few hours the lead gets one short board update
// that names what is stuck or repeating. Nothing worth saying: no update.
import type { SymccTask } from '../../types'

/** At most one digest in this time. */
export const DIGEST_EVERY_MS = 2 * 3_600_000
/** A todo or waiting task older than this counts as stuck. */
export const DIGEST_STUCK_MS = 3 * 3_600_000

type DigestTask = Pick<SymccTask, 'id' | 'title' | 'status' | 'attempts' | 'updated_at'> & Partial<Pick<SymccTask, 'history' | 'after' | 'merged'>>

const ENDED = ['done', 'dropped']
const at = (s: string | undefined): number => (s ? Date.parse(s) : NaN)
const since = (s: string | undefined, sinceMs: number) => at(s) > sinceMs
const short = (t: DigestTask) => `${t.id} "${t.title.length > 50 ? `${t.title.slice(0, 49)}…` : t.title}"`
const hours = (ms: number) => `${Math.max(1, Math.round(ms / 3_600_000))}h`

/**
 * The digest text for `tasks` since `sinceMs` (the last digest, or the session's start), or null when there is nothing worth
 * saying: a task on try 3 or more, tests that failed in 2 or more tries, the checker sending work back 2 or more times,
 * or tasks stuck (todo, or waiting for the owner, for a long time).
 */
export function digestText(tasks: readonly DigestTask[], sinceMs: number, nowMs: number): string | null {
  const lines: string[] = []
  const open = tasks.filter(t => !ENDED.includes(t.status))
  const tries = open.filter(t => Number(t.attempts) >= 3)
  if (tries.length) lines.push(`On try 3 or more: ${tries.map(t => `${short(t)} (try ${t.attempts})`).join(', ')}.`)
  const testy = open.filter(t => (t.history ?? []).filter(h => h.kind === 'failed' && h.reason === 'tests').length >= 2 && (t.history ?? []).some(h => h.reason === 'tests' && since(h.at, sinceMs)))
  if (testy.length) lines.push(`Tests failed in 2 or more tries: ${testy.map(short).join(', ')}.`)
  const back = open.reduce((n, t) => n + (t.history ?? []).filter(h => h.kind === 'checker-problems' && since(h.at, sinceMs)).length, 0)
  if (back >= 2) {
    const merged = tasks.filter(t => t.status === 'done' && t.merged && since(t.updated_at, sinceMs))
    const first = merged.filter(t => Number(t.attempts) <= 1).length
    lines.push(`The checker sent work back ${back} times since the last digest${merged.length ? `; ${first} of ${merged.length} merged tasks passed on the first try` : ''}.`)
  }
  const old = (t: DigestTask) => nowMs - at(t.updated_at) > DIGEST_STUCK_MS
  const idle = open.filter(t => t.status === 'todo' && !(t.after ?? []).length && old(t))
  if (idle.length) lines.push(`Waiting to start for a long time: ${idle.map(t => `${short(t)} (${hours(nowMs - at(t.updated_at))})`).join(', ')}.`)
  const owner = open.filter(t => t.status === 'waiting' && old(t))
  if (owner.length) lines.push(`Waiting on the owner for a long time: ${owner.map(t => `${short(t)} (${hours(nowMs - at(t.updated_at))})`).join(', ')}.`)
  return lines.length ? `Digest (what is stuck or repeating; agent reports are muted, read one with board task T-n):\n${lines.map(l => `- ${l}`).join('\n')}` : null
}
