// Which day a task belongs to, and grouping the board by day.
import type { SymccTask } from '../../types'
import { OPEN } from './board-file'
import { newestFirst } from './settings'

// ---------------- which day a task belongs to ----------------
// The board shows open tasks first, then today's finished tasks in full, then one folded
// row per older day. `offsetMin` is the owner's time zone: minutes to add to UTC to get
// local time (e.g. 120 for UTC+2), i.e. `-new Date().getTimezoneOffset()`.

/** The owner's time zone offset now, in minutes east of UTC. */
export const localOffset = (atMs: number = Date.now()) => -new Date(atMs).getTimezoneOffset()

/** The local day of a moment, as "YYYY-MM-DD"; '' when the time can't be read. */
export function dayOf(ms: number, offsetMin: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms + offsetMin * 60_000).toISOString().slice(0, 10)
}

/** The local day a task belongs to: that of its `updated_at`, else its `created_at`; '' when neither can be read. */
export function taskDay(t: Pick<SymccTask, 'updated_at' | 'created_at'>, offsetMin: number): string {
  for (const iso of [t.updated_at, t.created_at]) {
    const d = dayOf(Date.parse(iso || ''), offsetMin)
    if (d) return d
  }
  return ''
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How a day ("YYYY-MM-DD") is named, seen from `today`: "Yesterday", "Wed 4 Nov", or "Wed 4 Nov 2025" in another year. */
export function dayLabel(day: string, today: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(d.getTime())) return day
  const t = new Date(`${today}T00:00:00Z`)
  if (Number.isFinite(t.getTime()) && t.getTime() - d.getTime() === 86_400_000) return 'Yesterday'
  const year = day.slice(0, 4) !== today.slice(0, 4) ? ` ${d.getUTCFullYear()}` : ''
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`
}

/** One older day's finished tasks, folded into one row. */
export type DayGroup<T extends SymccTask = SymccTask> = { day: string; label: string; done: number; dropped: number; tasks: T[] }
export type BoardSections<T extends SymccTask = SymccTask> = { open: T[]; backlog: T[]; today: T[]; days: DayGroup<T>[] }

/**
 * Sorts tasks for showing the board at `nowMs` in time zone `offsetMin`: `open` (still need
 * something, whatever their day), `backlog` (ideas, whatever their day), `today` (today's finished tasks, and any whose day can't be
 * read or lies ahead), and `days` (older finished tasks, one group per day, newest day first).
 * Inside each part, the newest task comes first.
 */
export function boardSections<T extends SymccTask>(tasks: T[], nowMs: number, offsetMin: number): BoardSections<T> {
  const today = dayOf(nowMs, offsetMin)
  const all = [...tasks].sort(newestFirst)
  const open = all.filter(t => OPEN.includes(t.status))
  const backlog = all.filter(t => t.status === 'backlog')
  const closed = all.filter(t => !OPEN.includes(t.status) && t.status !== 'backlog')
  const isOld = (t: T) => {
    const d = taskDay(t, offsetMin)
    return !!today && !!d && d < today
  }
  const byDay = new Map<string, T[]>()
  for (const t of closed.filter(isOld)) {
    const d = taskDay(t, offsetMin)
    byDay.set(d, [...(byDay.get(d) ?? []), t])
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, ts]) => ({ day, label: dayLabel(day, today), done: ts.filter(t => t.status === 'done').length, dropped: ts.filter(t => t.status === 'dropped').length, tasks: ts }))
  return { open, backlog, today: closed.filter(t => !isOld(t)), days }
}

/** A day group's row: "▸ Yesterday · 6 done", "▾ Mon 9 Nov · 4 done · 1 dropped" when opened. */
export function groupLabel(g: Pick<DayGroup, 'label' | 'done' | 'dropped'>, opened = false): string {
  const counts = [g.done && `${g.done} done`, g.dropped && `${g.dropped} dropped`].filter(Boolean)
  return [`${opened ? '▾' : '▸'} ${g.label}`, ...counts].join(' · ')
}
