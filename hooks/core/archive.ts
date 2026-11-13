// Old finished tasks: moving done and dropped tasks out of board.json into archive.json.
// Every function here is pure; the plugin (plugin/archive.ts) reads and writes the files.
import type { SymccStatus } from '../../types'
import { DEFAULT_NAME, namesFor } from '../name'
import { type ArchivedTotals, type Board, type BoardTask, cleanCommitFields, find, migrateRunTokens, normId } from './board-file'
import { addTokens, sumRuns } from './runs'

/** Archiving runs at most this often (ms), on the regular check of the driving session. */
export const ARCHIVE_EVERY_MS = 60 * 60_000

/** The archive file: the archived tasks, oldest archived first. */
export type Archive = { version: 1; tasks: BoardTask[] }

export const emptyArchive = (): Archive => ({ version: 1, tasks: [] })

/** Zero totals: nothing archived yet. */
export const noArchived = (): ArchivedTotals => ({ done: 0, dropped: 0, tries: 0, ms: 0 })

/** The board's archived totals (zeros on a board that never archived). */
export const archivedOf = (b: Partial<Pick<Board, 'archived'>>): ArchivedTotals => b.archived ?? noArchived()

/** How many tasks were archived. */
export const archivedCount = (b: Partial<Pick<Board, 'archived'>>): number => archivedOf(b).done + archivedOf(b).dropped

const FINISHED: SymccStatus[] = ['done', 'dropped']

/**
 * What reading archive.json found: the archive, or `broken` (the reason) when the text is not an
 * archive. A broken archive must never be written over (keep a copy, tell the owner, stop archiving).
 * `migrated`: how many tasks were brought to the current shape; the file should then be saved once.
 */
export function readArchive(text: string | null): { archive: Archive; broken?: string; migrated?: number } {
  if (text === null || text === undefined || !String(text).trim()) return { archive: emptyArchive() }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { archive: emptyArchive(), broken: `not valid JSON (${String((e as Error)?.message ?? e).slice(0, 120)})` }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { archive: emptyArchive(), broken: 'it is not an archive (the file holds no JSON object)' }
  const tasks = (raw as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) return { archive: emptyArchive(), broken: '"tasks" is not a list' }
  const ok = tasks.filter((t): t is BoardTask => !!t && typeof t === 'object' && typeof (t as BoardTask).id === 'string' && FINISHED.includes((t as BoardTask).status))
  // Migration: tries with tokens saved as one number get it marked unsplit (see migrateRunTokens); `migrated` counts the tasks changed so the file is saved once.
  let migrated = 0
  const clean = ok.map(t => {
    const split = migrateRunTokens(t.runs)
    if (split) migrated++
    return { ...cleanCommitFields(split ? { ...t, runs: split } : t), after: Array.isArray(t.after) ? t.after : [], history: Array.isArray(t.history) ? t.history : [], files: Array.isArray(t.files) ? t.files : [] }
  })
  return { archive: { version: 1, tasks: clean }, ...(migrated ? { migrated } : {}) }
}

/** The archive as file text. */
export const archiveText = (a: Archive) => JSON.stringify(a, null, 2) + '\n'

/** What the owner and the lead are told about an archive.json that can't be read. */
export const brokenArchiveText = (file: string, reason: string, copy?: string) =>
  `${file} can't be read: ${reason}. Nothing more is archived until it is fixed; fix it${copy ? ` or restore the copy ${copy}` : ''}.`

/** Task ids that an unfinished task (todo, doing, review, waiting, paused, failed, backlog) still lists in its `after`. */
function waitedOn(b: Board): Set<string> {
  return new Set(b.tasks.filter(t => !FINISHED.includes(t.status)).flatMap(t => t.after.map(normId)))
}

/**
 * The tasks to archive now: done or dropped, last changed more than `archive_days` days before
 * `nowMs`, and not listed in the `after` of a task that is not finished. None when archive_days is 0.
 */
export function toArchive(b: Board, nowMs: number): BoardTask[] {
  const days = b.archive_days
  if (!(typeof days === 'number' && days > 0) || !Number.isFinite(nowMs)) return []
  const cut = nowMs - days * 24 * 60 * 60_000
  const keep = waitedOn(b)
  return b.tasks.filter(t => {
    if (!FINISHED.includes(t.status) || keep.has(t.id)) return false
    const at = Date.parse(t.updated_at || t.created_at || '')
    return Number.isFinite(at) && at < cut
  })
}

/** The archive with `tasks` added (a task already in it is replaced, so an id is never there twice). */
export function addToArchive(a: Archive, tasks: BoardTask[]): Archive {
  const ids = new Set(tasks.map(t => t.id))
  return { version: 1, tasks: [...a.tasks.filter(t => !ids.has(t.id)), ...tasks.map(({ session: _s, ...t }) => t as BoardTask)] }
}

/** Totals with one task's tries added (`sign` 1) or taken away (`sign` -1). */
function addTotals(x: ArchivedTotals, t: BoardTask, sign: 1 | -1): ArchivedTotals {
  const r = sumRuns(t.runs)
  const out: ArchivedTotals = { ...x, tries: Math.max(0, x.tries + sign * r.tries), ms: Math.max(0, x.ms + sign * r.ms) }
  if (t.status === 'done') out.done = Math.max(0, x.done + sign)
  else out.dropped = Math.max(0, x.dropped + sign)
  if (r.tokens !== undefined) out.tokens = addTokens(x.tokens, r.tokens, sign)
  if (r.cost !== undefined) out.cost = Math.max(0, (x.cost ?? 0) + sign * r.cost)
  return out
}

/**
 * The board with `tasks` taken off: their counts and tries go into `archived`, and the ids of the
 * done ones into `archived_done` (so a task waiting on one still starts). next_id never changes.
 */
export function removeArchived(b: Board, tasks: BoardTask[]): Board {
  const ids = new Set(tasks.map(t => t.id))
  const gone = b.tasks.filter(t => ids.has(t.id))
  if (!gone.length) return b
  const archived = gone.reduce((s, t) => addTotals(s, t, 1), archivedOf(b))
  const done = [...new Set([...(b.archived_done ?? []), ...gone.filter(t => t.status === 'done').map(t => t.id)])]
  return { ...b, tasks: b.tasks.filter(t => !ids.has(t.id)), archived, archived_done: done }
}

/**
 * An archived dropped task back on the board as "todo", with a history line; its counts and tries
 * leave `archived`. Throws for a done task (it stays archived) or a task already on the board.
 */
export function bringBack(b: Board, t: BoardTask, now: string): Board {
  if (find(b, t.id)) throw new Error(`${t.id} is already on the board`)
  if (t.status !== 'dropped') throw new Error(`${t.id} is archived and done; add a new task instead`)
  const back: BoardTask = { ...t, status: 'todo', note: 'brought back from the archive; queued', question: null, test_tries: 0, conflict_tries: 0, history: [...t.history, 'brought back from the archive (was dropped)'], updated_at: now }
  return { ...b, archived: addTotals(archivedOf(b), t, -1), tasks: [...b.tasks, back] }
}

/** Whether task `id`, which another task waits for, counts as done: done on the board, or archived as done. */
export function depDone(b: Pick<Board, 'tasks'> & Partial<Pick<Board, 'archived_done'>>, id: string): boolean {
  const n = normId(id)
  const t = b.tasks.find(x => x.id === n)
  return t ? t.status === 'done' : (b.archived_done ?? []).includes(n)
}

/** "(+96 archived)" after the Done count, or '' when nothing done was archived. */
export const archivedNote = (n: number) => (n > 0 ? `(+${n} archived)` : '')

/** One line for the board as text: "archived: 96 done, 3 dropped (in .symcc/archive.json)"; '' when none. */
export function archivedLine(b: Partial<Pick<Board, 'archived'>>, name: string = DEFAULT_NAME): string {
  const a = archivedOf(b)
  if (!a.done && !a.dropped) return ''
  return `archived: ${[a.done ? `${a.done} done` : '', a.dropped ? `${a.dropped} dropped` : ''].filter(Boolean).join(', ')} (in ${namesFor(name).archiveFile}; /${name}-task T-n still shows one)`
}
