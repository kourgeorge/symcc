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
export function digestText(tasks: readonly DigestTask[], sinceMs: number, nowMs: number, seen: Map<string, string> = new Map()): string | null {
  const lines: string[] = []
  const shown = new Map<string, string>()
  const open = tasks.filter(t => !ENDED.includes(t.status))
  const key = (t: DigestTask) => `${t.status}:${t.attempts}`
  // A task is named at most once per digest (the first line wins), and named again in a later digest only when its status
  // or try changed since it was last named.
  const fresh = (t: DigestTask) => !shown.has(t.id) && seen.get(t.id) !== key(t)
  // At most 3 names, then "and N more"; only the named ones count as told.
  const list = (items: DigestTask[], what: (t: DigestTask) => string) => {
    const head = items.slice(0, 3)
    head.forEach(t => shown.set(t.id, key(t)))
    return head.map(what).join(', ') + (items.length > 3 ? ` and ${items.length - 3} more` : '')
  }
  const running = (t: DigestTask) => t.status === 'doing' || t.status === 'review'
  const tries = open.filter(t => t.status !== 'backlog' && Number(t.attempts) >= 3 && (running(t) || fresh(t)))
  if (tries.length) lines.push(`On try 3 or more: ${list(tries, t => `${short(t)} (try ${t.attempts})`)}.`)
  const testFails = (t: DigestTask) => (t.history ?? []).filter(h => h.kind === 'failed' && h.reason === 'tests')
  // One line for test failures: worth saying when an open task failed tests in 2 or more tries, or 2 or more tasks failed.
  const testTasks = tasks.filter(t => testFails(t).some(h => since(h.at, sinceMs)))
  const testy = open.some(t => testTasks.includes(t) && testFails(t).length >= 2)
  const testNew = testTasks.filter(fresh)
  if ((testy || testTasks.length >= 2) && testNew.length) {
    const n = testTasks.length
    lines.push(`Tests failed since the last digest in ${n} task${n > 1 ? 's' : ''}: ${list(testNew, t => `${short(t)} (${testFails(t).length}x)`)}.`)
  }
  // Every task counts, merged and dropped ones too: the usual path is send back, fix, merge.
  const back = tasks.reduce((n, t) => n + (t.history ?? []).filter(h => h.kind === 'checker-problems' && since(h.at, sinceMs)).length, 0)
  if (back >= 2) {
    const merged = tasks.filter(t => t.status === 'done' && t.merged && since(t.updated_at, sinceMs))
    const first = merged.filter(t => (t.history ?? []).every(h => h.kind !== 'checker-problems') && Number(t.attempts) <= 1).length
    lines.push(`The checker sent work back ${back} times since the last digest${merged.length ? `; ${first} of ${merged.length} merged tasks passed on the first try` : ''}.`)
  }
  const old = (t: DigestTask) => nowMs - at(t.updated_at) > DIGEST_STUCK_MS
  const idle = open.filter(t => t.status === 'todo' && !(t.after ?? []).length && old(t) && fresh(t))
  if (idle.length) lines.push(`Waiting to start for a long time: ${list(idle, t => `${short(t)} (${hours(nowMs - at(t.updated_at))})`)}.`)
  const owner = open.filter(t => t.status === 'waiting' && old(t) && fresh(t))
  if (owner.length) lines.push(`Waiting on the owner for a long time: ${list(owner, t => `${short(t)} (${hours(nowMs - at(t.updated_at))})`)}.`)
  shown.forEach((v, k) => seen.set(k, v))
  return lines.length ? `Digest (what is stuck or repeating; agent reports are muted, read one with board task T-n):\n${lines.map(l => `- ${l}`).join('\n')}` : null
}
