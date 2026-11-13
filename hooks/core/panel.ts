// The Tasks view of the board panel: sections, rows, the status strip and key hints.
import type { SymccMode, SymccScout, SymccStatus, SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { emptyBoard } from './board-file'
import { NEEDS_YOU, needsYouFirst } from './commands'
import { boardSections, type DayGroup, dayLabel, dayOf, taskDay } from './days'
import { roleMark } from './roles'
import { onDemand } from './scouts'
import { fmtDuration, runMs } from './runs'
import { offStatusLine } from './settings'
import { num } from './text'

/** A section's header in the board panel: "▸ Done (42)" folded, "▾ Done (42)" open; with `opened` left out (a section
 *  that is always open, like "Doing") there is no arrow: "Doing (1)". */
export const sectionHeader = (label: string, n: number, opened?: boolean): string => `${opened === undefined ? '' : opened ? '▾ ' : '▸ '}${label} (${n})`

/** The backlog group's row in the board panel: "▸ Backlog (3)", "▾ Backlog (3)" when opened. */
export const backlogLabel = (n: number, opened = false): string => sectionHeader('Backlog', n, opened)

/** How many backlog items the board panel lists before a "… N more" line. */
export const BACKLOG_SHOWN = 5
/** The backlog section's header in the board panel, folded by default: "▸ Backlog (3)", "▾ Backlog (3)" when opened. */
export const backlogHeader = (n: number, opened = false): string => backlogLabel(n, opened)
/** The line under the first BACKLOG_SHOWN backlog items when there are more. */
export const backlogMoreLabel = (more: number): string => `… ${more} more (Enter to show all)`

/** The two subtle lines shown in the board panel when nothing needs the owner, runs or waits to run. */
export const ALL_CLEAR = ['All clear. Nothing running or waiting.', 'Tell the lead what you want next.'] as const

/** The bold label over the board panel's NEEDS YOU section; doing and to-do tasks follow as one untitled list. */
export const SECTION_LABEL = { needsYou: 'NEEDS YOU' } as const

/** What the next scout run is: "secrets in 38m", "secrets now", "running: secrets", or '' when none is planned.
 *  Paused scouts and scouts that run only on demand (every_minutes 0) are skipped. */
export function nextScoutText(scouts: (Pick<SymccScout, 'name' | 'running' | 'next_run' | 'paused'> & { every_minutes?: number })[], nowMs: number): string {
  const running = scouts.find(s => s.running)
  if (running) return `running: ${running.name}`
  const next = scouts
    .filter(s => !s.paused && !(s.every_minutes !== undefined && onDemand({ every_minutes: s.every_minutes })))
    .map(s => ({ name: s.name, at: Date.parse(s.next_run ?? '') }))
    .filter(s => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name))[0]
  if (!next) return ''
  return next.at <= nowMs ? `next: ${next.name} now` : `next: ${next.name} in ${fmtDuration(next.at - nowMs)}`
}

/** The one-line status strip on top of the board list: "symcc · auto · 1/3 workers · 4 scouts (next: secrets in 38m)".
 *  The part in brackets is left out when it does not fit in `width` (or the board is in mode off); a plugin that is
 *  turned off shows "symcc off · /symcc-on". Busy workers are the tasks being worked on. */
export function statusStrip(
  v: { mode: SymccMode; enabled?: boolean; max_parallel?: number; tasks: Pick<SymccTask, 'status'>[]; scouts: (Pick<SymccScout, 'name' | 'running' | 'next_run' | 'paused'> & { every_minutes?: number })[] },
  nowMs: number,
  width = Infinity,
  name: string = DEFAULT_NAME,
): string {
  if (v.enabled === false) return offStatusLine(name)
  const busy = v.tasks.filter(t => t.status === 'doing').length
  const n = v.scouts.length
  const base = [name, v.mode, `${busy}/${v.max_parallel ?? emptyBoard().max_parallel} workers`, n === 1 ? '1 scout' : `${n} scouts`].join(' · ')
  const next = v.mode === 'off' ? '' : nextScoutText(v.scouts, nowMs)
  const full = next ? `${base} (${next})` : base
  return full.length <= width ? full : base
}

/** The short status column of a task row in the board list: the time of the running try ("4m") for a task being
 *  worked on, "review", "waiting", "failed" or "paused", and '' for the rest (the mark says enough). `since` is when
 *  this session's worker started, used when the task has no open try. */
export function statusCell(t: Pick<SymccTask, 'status' | 'runs'>, nowMs: number, since?: number | string): string {
  if (t.status === 'doing') {
    const last = t.runs?.[t.runs.length - 1]
    if (last && !last.ended) return fmtDuration(runMs(last, nowMs))
    const at = typeof since === 'number' ? since : Date.parse(since ?? '')
    return Number.isFinite(at) ? fmtDuration(Math.max(0, nowMs - at)) : ''
  }
  return ({ review: 'review', waiting: 'waiting', failed: 'failed', paused: 'paused' } as Partial<Record<SymccStatus, string>>)[t.status] ?? ''
}

/** The subtle text at the right end of a task row: "tester · try 1" for a task being worked on, "after T-3" for
 *  one waiting on unfinished tasks (else its role), "Enter to review" in review (a and x only work on the task's
 *  own page, so the list does not offer them), the question of a
 *  waiting task, the note of a failed or backlog one, and '' for finished ones. */
export function rowExtra(t: SymccTask, tasks: Pick<SymccTask, 'id' | 'status'>[]): string {
  switch (t.status) {
    case 'doing':
      return [roleMark(t), t.attempts > 0 ? `try ${t.attempts}` : ''].filter(Boolean).join(' · ')
    case 'todo':
    case 'paused': {
      const open = (t.after ?? []).filter(id => tasks.some(x => x.id === id && x.status !== 'done'))
      return open.length ? `after ${open.join(', ')}` : roleMark(t)
    }
    case 'review':
      return 'Enter to review'
    case 'waiting':
      return t.question ?? ''
    case 'failed':
      return t.note
    case 'backlog':
      return t.note && t.note !== 'in the backlog' ? t.note : ''
    default:
      return ''
  }
}

/** Cuts text to `n` columns, ending with "…" when cut. */
const cutTo = (s: string, n: number) => (s.length <= n ? s : n <= 1 ? '…'.slice(0, Math.max(0, n)) : `${s.slice(0, n - 1).trimEnd()}…`)

/** Fits a task row's title and extra after `lead` columns (indent, id, mark and status) in `width` columns: the
 *  extra goes to the right end (`pad` fills the gap, at least two spaces) when the whole title fits beside it;
 *  otherwise the extra is left out first, then the title is cut with "…". */
export function fitRow(lead: number, title: string, extra: string, width: number): { title: string; pad: string; extra: string } {
  const room = Math.max(1, width - lead)
  if (extra && title.length + 2 + extra.length <= room) return { title, pad: ' '.repeat(room - title.length - extra.length), extra }
  return { title: cutTo(title, room), pad: '', extra: '' }
}

/** The longest label of a folded section, so their counts line up. */
const FOLDED_LABEL = 7
/** A folded section's row: "▸ Backlog   3", "▾ Done     87"; the counts right-aligned in `countWidth` columns. */
export const foldedRow = (label: string, n: number, opened: boolean, countWidth = 1): string =>
  `${opened ? '▾' : '▸'} ${label.padEnd(FOLDED_LABEL)}  ${String(n).padStart(countWidth)}`

/** One key hint: the key to press and a short word for what it does ("a" "approve"). */
export type KeyHint = { key: string; word: string }

/** The columns a hint takes: "a approve". */
export const hintText = (h: KeyHint): string => `${h.key} ${h.word}`

/** The hints on one line, as plain text: "a approve · x reject". */
export const hintLineText = (line: KeyHint[]): string => line.map(hintText).join(' · ')

/** Lays hints out over as many lines as needed to fit `width` columns, " · " between them on a line. A line breaks
 *  only between hints, so no hint is ever split or cut (one wider than the panel gets a line of its own). */
export function hintLines(hints: KeyHint[], width: number): KeyHint[][] {
  return packRows(hints.map(h => hintText(h).length), width, 3).map(row => row.map(i => hints[i]!))
}

/** Packs items of the given widths into rows of at most `width` columns, `gap` columns between items on a row,
 *  keeping their order; returns each row's item indexes. An item wider than `width` gets a row of its own. */
export function packRows(widths: number[], width: number, gap: number): number[][] {
  const rows: number[][] = []
  let used = 0
  widths.forEach((w, i) => {
    const row = rows[rows.length - 1]
    if (row && used + gap + w <= width) {
      row.push(i)
      used += gap + w
    } else {
      rows.push([i])
      used = w
    }
  })
  return rows
}

/** The keys under the board list: only keys that work in the list (a and x work only on a task's own page). */
export const listKeys = (): KeyHint[] => [
  { key: 'Enter', word: 'open' },
  { key: '↑↓', word: 'move' },
  { key: 't s c', word: 'views' },
  { key: 'Esc', word: 'close' },
]

/** The view keys under the scouts and settings pages; `enter` adds "Enter opens" first. */
export const viewKeys = (enter = true): KeyHint[] => [
  ...(enter ? [{ key: 'Enter', word: 'opens' }] : []),
  { key: 't', word: 'tasks' },
  { key: 's', word: 'scouts' },
  { key: 'c', word: 'settings' },
  { key: 'Esc', word: 'closes' },
]

/** The keys at the bottom of a task's page, the ones that matter most for its state first; "↑↓ scroll" and
 *  "b back" always come last. `worker`: a worker is on the task now (w opens it). */
export function taskKeys(status: SymccStatus, worker = false): KeyHint[] {
  const k = (key: string, word: string): KeyHint => ({ key, word })
  const keys: KeyHint[] = []
  if (status === 'review') keys.push(k('a', 'approve'), k('x', 'reject'), k('d', 'show changes'))
  if (status === 'backlog') keys.push(k('o', 'move to todo'), k('x', 'drop'))
  if (worker) keys.push(k('w', 'watch worker'))
  if (status === 'todo' || status === 'paused' || status === 'failed') keys.push(k('k', 'stash to backlog'))
  if (['todo', 'paused', 'failed', 'backlog'].includes(status)) keys.push(k('l', 'role'))
  return [...keys, k('↑↓', 'scroll'), k('b', 'back')]
}

/** The keys at the bottom of a task's diff view: a and x while it is in review, d when one file is shown. */
export const diffKeys = (review: boolean, oneFile: boolean): KeyHint[] => [
  ...(review ? [{ key: 'a', word: 'approve' }, { key: 'x', word: 'reject' }] : []),
  ...(oneFile ? [{ key: 'd', word: 'all files' }] : []),
  { key: '↑↓', word: 'scroll' },
  { key: 'b', word: 'back to the task' },
]

/** The keys under the Scouts list. */
export const scoutListKeys = (): KeyHint[] => [
  { key: 'Enter', word: 'open' },
  { key: 't s c', word: 'views' },
  { key: 'Esc', word: 'close' },
]

/** The keys at the bottom of a scout's page; p pauses it, or resumes it when `paused`. No "r run now" while
 *  the scout is `running` (like the button). */
export const scoutKeys = (paused = false, running = false): KeyHint[] => [
  ...(running ? [] : [{ key: 'r', word: 'run now' }]),
  { key: 'e', word: 'edit' },
  { key: 'p', word: paused ? 'resume' : 'pause' },
  { key: '↑↓', word: 'scroll' },
  { key: 'b', word: 'back' },
]

/** When a task finished (its updated_at, else created_at), in ms; NaN when neither can be read. */
const finishedMs = (t: Pick<SymccTask, 'updated_at' | 'created_at'>) => {
  const u = Date.parse(t.updated_at || '')
  return Number.isFinite(u) ? u : Date.parse(t.created_at || '')
}
/** Finished tasks, the one that finished last first (then the higher number). */
const finishedFirst = (x: SymccTask, y: SymccTask) => (finishedMs(y) || 0) - (finishedMs(x) || 0) || num(y.id) - num(x.id)

/** The board panel's list, top to bottom: what needs the owner, what runs, what waits to run, the backlog, then
 *  the finished work. `done` is split into `doneToday` (today's, and any whose day can't be read) and `doneDays`
 *  (older days, newest day first); `dropped` and the done lists put the task that finished last first. */
export type PanelSections<T extends SymccTask = SymccTask> = {
  needsYou: T[]
  doing: T[]
  todo: T[]
  backlog: T[]
  done: T[]
  doneToday: T[]
  doneDays: DayGroup<T>[]
  dropped: T[]
}

/** Sorts tasks into the board panel's sections (see PanelSections), seen at `nowMs` in time zone `offsetMin`. */
export function panelSections<T extends SymccTask>(tasks: T[], nowMs: number, offsetMin: number): PanelSections<T> {
  const s = boardSections(tasks, nowMs, offsetMin)
  const runOrder = (x: T, y: T) => x.order - y.order || num(x.id) - num(y.id)
  const today = dayOf(nowMs, offsetMin)
  const done = tasks.filter(t => t.status === 'done').sort(finishedFirst)
  const isOld = (t: T) => {
    const d = taskDay(t, offsetMin)
    return !!today && !!d && d < today
  }
  const byDay = new Map<string, T[]>()
  for (const t of done.filter(isOld)) {
    const d = taskDay(t, offsetMin)
    byDay.set(d, [...(byDay.get(d) ?? []), t])
  }
  const doneDays = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, ts]) => ({ day, label: dayLabel(day, today), done: ts.length, dropped: 0, tasks: ts }))
  return {
    needsYou: needsYouFirst(s.open.filter(t => NEEDS_YOU.includes(t.status))),
    doing: s.open.filter(t => t.status === 'doing'),
    todo: [...s.open.filter(t => t.status === 'todo').sort(runOrder), ...s.open.filter(t => t.status === 'paused').sort(runOrder)],
    backlog: s.backlog,
    done,
    doneToday: done.filter(t => !isOld(t)),
    doneDays,
    dropped: tasks.filter(t => t.status === 'dropped').sort(finishedFirst),
  }
}

/** The subtle text after the folded Done row: "last today: T-88 Task page: collapse the Details rows" ("yesterday",
 *  or the date for older days). The title is cut with "…" so `head`, three spaces and this fit in `width` columns;
 *  '' when even a short title does not fit. */
export function doneExtra(last: SymccTask | undefined, nowMs: number, offsetMin: number, head: string, width = Infinity): string {
  if (!last) return ''
  const today = dayOf(nowMs, offsetMin)
  const day = taskDay(last, offsetMin)
  const when = !day || !today || day >= today ? 'today' : dayLabel(day, today) === 'Yesterday' ? 'yesterday' : dayLabel(day, today)
  const lead = `last ${when}: ${last.id} `
  const room = width - head.length - 3 - lead.length
  if (room < Math.min(8, last.title.length)) return ''
  return `${lead}${cutTo(last.title, room)}`
}
