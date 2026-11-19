// The Tasks view of the board panel: sections, rows and key hints; and the workers and scouts of the line above the prompt.
import type { SymccMode, SymccScout, SymccStatus, SymccTask } from '../../types'
import { asBlockers, type BoardTask, type CheckStep, emptyBoard, OPEN, intoOf, isInvestigation, kindOf, STATUS_WORD, waitsForFiles } from './board-file'
import { asksMoreTime, needsYou, needsYouFirst } from './commands'
import { boardSections, type DayGroup, dayLabel, dayOf, localOffset, taskDay } from './days'
import { checkStepNow, finishingNow } from './lead'
import { originOf } from './origin'
import { overtimeQuestion, timeLimitOf } from './task'
import { waitFilesNote } from './review'
import { kindMark } from './kinds'
import { roleMark, roleOf, tryMark } from './roles'
import { onDemand } from './scouts'
import { fmtDuration, runMs, sumRuns } from './runs'
import { ellipsis, num } from './text'
import { whyFailed } from './failure'
import { rerunDue } from './test-timeout'

export * from './failure'

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

/** The two secondary-color (inactive) lines shown in the board panel when nothing needs the owner, runs or waits to run. */
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

/** What the workers and scouts part of the line above the prompt needs. Busy workers are the tasks being worked on;
 *  a doing task whose work symcc is testing and merging now (see finishingNow) is "merging", not a worker. */
export type CrewBoard = { mode?: SymccMode; plan_mode?: boolean; max_parallel?: number; tasks: Pick<BoardTask, 'status' | 'finishing'>[]; scouts: (Pick<SymccScout, 'name' | 'running' | 'next_run' | 'paused'> & { every_minutes?: number })[] }

/** The workers and scouts, each '' when there is nothing to say: `workers` "1/3 workers", then "1 merging" for tasks
 *  symcc is testing and merging (each left out while there are none: "all done" or the counts already say so), `scouts` "5 scouts", and `next` "next: gaps-bot in 1h 00m" or
 *  "running: gaps-bot" (no "next" in plan mode or board mode off, as no scout starts then). */
export function crewParts(c: CrewBoard, nowMs: number): { workers: string; scouts: string; next: string } {
  const merging = c.tasks.filter(t => finishingNow(t, nowMs)).length
  const busy = c.tasks.filter(t => t.status === 'doing').length - merging
  const n = c.scouts.length
  const running = c.scouts.find(s => s.running)
  const next = !n ? '' : running ? `running: ${running.name}` : c.plan_mode || c.mode === 'off' ? '' : nextScoutText(c.scouts, nowMs)
  const workers = [busy ? `${busy}/${c.max_parallel ?? emptyBoard().max_parallel} workers` : '', merging ? `${merging} merging` : ''].filter(Boolean).join(' · ')
  return { workers, scouts: !n ? '' : n === 1 ? '1 scout' : `${n} scouts`, next }
}

/** Builds a line with the workers and scouts in it (`build` gets the workers text and the scouts text) so it fits in
 *  `width` columns: the full line, else without the "(next: …)" part, else without the scouts. When even that is
 *  too long it is given back as it is (Claude Code cuts it). No `crew`: the line without them. */
export function withCrew(build: (workers: string, scouts: string) => string, crew: CrewBoard | undefined, nowMs: number, width = Infinity): string {
  if (!crew) return build('', '')
  const p = crewParts(crew, nowMs)
  const tries = [build(p.workers, p.next ? `${p.scouts} (${p.next})` : p.scouts), build(p.workers, p.scouts), build(p.workers, '')]
  return tries.find(t => t.length <= width) ?? tries[tries.length - 1]!
}

/** The status column of a task whose worker ran over its time limit while the owner is asked for more time. */
export const MORE_TIME_CELL = 'more time?'

/** The status column of a task whose tests ran out of time once and run again on their own (T-511: rerunDue). */
export const RERUN_CELL = 'retest'

/** The short word every board view (terminal list, band, VS Code, OpenCode, text board) shows for each check step:
 *  "prep" for symcc's own pre-merge step, "checker" only while a checker agent runs (the checker setting). */
export const STEP_WORD: Record<CheckStep, string> = { prep: 'prep', testing: 'test', checker: 'checker', merging: 'merge' }

/** The note of a finished task while symcc's own pre-merge step runs (step "prep"): it says plainly what it does. */
export const PREP_NOTE = 'preparing to merge: committing and checking files'

/** The note a finished task gets while symcc checks and merges it (it replaces PREP_NOTE once the prep step is over). */
export const FINISH_NOTE = 'checking and merging'

/** The note of a task while its checker runs; a reloaded copy finds a task whose checker it lost by it (see restartCheckers in workers.ts). */
export const CHECKER_NOTE = 'a checker agent is trying to break it before it merges'

/** The note task `note` gets when check step `step` begins: PREP_NOTE in the prep step of a plain finish (also after
 *  the checker's verdict, so the checker note doesn't stay once no checker runs), back to FINISH_NOTE in the test and
 *  merge steps; the checker step keeps it (runChecker then sets CHECKER_NOTE), and any other note stays. */
export function stepNote(step: CheckStep, note: string | undefined): string | undefined {
  if (step === 'checker') return note
  if (step === 'prep') return note === FINISH_NOTE || note === CHECKER_NOTE ? PREP_NOTE : note
  return note === PREP_NOTE || note === CHECKER_NOTE ? FINISH_NOTE : note
}

/** The short status column of a task row in the board list: the step while symcc checks its finished work
 *  ("prep", "test", "checker", "merge", the short words for checkStepNow's steps), else the time of the running try ("4m") for a task being
 *  worked on ("more time?" while its worker, over its time limit, waits for the owner's answer), "review", "waiting",
 *  "failed" or "paused", and '' for the rest (the mark says enough). `since` is when
 *  this session's worker started, used when the task has no open try. */
export function statusCell(t: Pick<SymccTask, 'status' | 'runs'> & Pick<BoardTask, 'checking' | 'time_ask' | 'kind'> & { test_rerun?: unknown; question?: unknown; merge_wait?: unknown }, nowMs: number, since?: number | string): string {
  const step = checkStepNow(t, nowMs)
  if (step) return STEP_WORD[step]
  if (rerunDue(t)) return RERUN_CELL
  if (asksMoreTime(t)) return MORE_TIME_CELL
  if (t.status === 'doing') {
    const last = t.runs?.[t.runs.length - 1]
    if (last && !last.ended) return fmtDuration(runMs(last, nowMs))
    const at = typeof since === 'number' ? since : Date.parse(since ?? '')
    return Number.isFinite(at) ? fmtDuration(Math.max(0, nowMs - at)) : ''
  }
  // an answered investigation waits for the owner to read its answer, not to review a change
  if (t.status === 'review' && isInvestigation(t)) return ANSWER_CELL
  return ({ review: 'review', waiting: 'waiting', failed: 'failed', paused: 'paused' } as Partial<Record<SymccStatus, string>>)[t.status] ?? ''
}

/** Whether a doing row shows the total of all tries ("Σ1h 40m", see triesTotal) or leaves it out (narrow rows). */
export type TotalForm = 'total' | 'none'
/** The forms in the order a too narrow row tries them: with the total, then without it. */
export const TOTAL_FORMS: readonly TotalForm[] = ['total', 'none']
/** The mark before a row's total work time of all tries: "Σ1h 40m". */
export const TOTAL_MARK = 'Σ'
/** What the mark means, said once on the task page (next to its total) and in docs/guide.md. */
export const TOTAL_MARK_NOTE = `${TOTAL_MARK} on its row: total work time of all tries`

/** Whether a doing task has tries before this one: more than one try on record (the last is this one, ended too
 *  while it is tested, checked or merged). */
const hasEarlierTries = (runs: SymccTask['runs']): boolean => (runs ?? []).length > 1

/**
 * The total work time of all of a doing task's tries, for its row: "Σ1h 40m" (the short mark, so the title keeps its
 * room); '' on the first try, for a task not doing, or with `form` 'none'. Work time is each try's started→ended added
 * up (the one running now up to `nowMs`), the same number as the task page's "Time and cost" total (sumRuns), so time
 * paused, waiting for the owner or other tasks, or in todo between tries is not counted.
 */
export function triesTotal(t: Pick<SymccTask, 'status' | 'runs'>, nowMs: number, form: TotalForm = 'total'): string {
  if (t.status !== 'doing' || form === 'none' || !hasEarlierTries(t.runs)) return ''
  return `${TOTAL_MARK}${fmtDuration(sumRuns(t.runs, nowMs).ms)}`
}

/** The status cell of a list row with the total of all tries after it for a doing task on a later try: "15m · Σ1h 40m"
 *  (see statusCell, triesTotal); just the cell when it is '' (nothing to put the total after). */
export function cellWithTotal(t: Parameters<typeof statusCell>[0], nowMs: number, since?: number | string, form: TotalForm = 'total'): string {
  const cell = statusCell(t, nowMs, since)
  // no time to show (e.g. the last try has ended and no step is fresh): no total either, so the cell has no stray " · "
  const total = cell ? triesTotal(t, nowMs, form) : ''
  return total ? `${cell} · ${total}` : cell
}

/** The status cells of a list's rows (cellWithTotal), with the total when the widest cell still fits in `room`
 *  characters, else without it. */
export function fittedCells<T extends Parameters<typeof statusCell>[0] & { id: string }>(tasks: T[], nowMs: number, since: (id: string) => number | string | undefined, room: number): Map<string, string> {
  let cells = new Map<string, string>()
  for (const form of TOTAL_FORMS) {
    cells = new Map(tasks.map(x => [x.id, cellWithTotal(x, nowMs, since(x.id), form)]))
    if (Math.max(0, ...[...cells.values()].map(c => c.length)) <= room) break
  }
  return cells
}

/** Room for a list row's title that a status cell must leave (see fittedCells). */
export const TITLE_ROOM = 20

/** The status column of an answered investigation in review (see statusCell). */
export const ANSWER_CELL = 'answer'

/** The tag of a task's kind in the board list: "[investigation]", "[bug]"; '' for a plain change (to keep lines short). */
export const kindTag = (t: { kind?: unknown }): string => (kindMark(t) ? `[${kindMark(t)}]` : '')

/** The role part of a task row: its kind and its role (see roleMark), e.g. "[bug · tester]", "[investigation]", or just "tester" for a change. */
export const roleTag = (t: { kind?: unknown; role?: string }): string => {
  const kind = kindMark(t)
  const role = roleMark(t)
  return kind ? `[${[kind, role].filter(Boolean).join(' · ')}]` : role
}

/** The secondary-color (inactive) text at the right end of a task row: "tester", or "tester · try 2" on a later try (see tryMark), for a task being worked on (its
 *  question, "T-4 has run 50 min. Give it more time?", while it asks the owner for more time), "after T-3" for
 *  one waiting on unfinished tasks (else its role; an investigation's starts with "[investigation]"), "Enter to review"
 *  in review ("[investigation]" for an answered investigation, whose status column says "answer"; a and x only work on the task's
 *  own page, so the list does not offer them), the question of a
 *  waiting task, why a failed one failed (whyFailed, the same sentence as the lead's board and its page), the note of a backlog one, and '' for finished ones. With `here` (the branch checked
 *  out now), a task that merges into another branch starts with "→ that-branch", so the usual case stays clean.
 *  `maxMinutes`: the board's max_minutes, for the time limit in the more-time question. */
export function rowExtra(t: BoardTask, tasks: Pick<SymccTask, 'id' | 'status'>[], here = '', maxMinutes: number = emptyBoard().max_minutes): string {
  const into = intoOf(t)
  const other = here && into !== here ? `→ ${into}` : ''
  const rest = fileWaitText(t) || rowExtraOf(t, tasks, maxMinutes)
  return [other, rest].filter(Boolean).join(' · ')
}

function rowExtraOf(t: BoardTask, tasks: Pick<SymccTask, 'id' | 'status'>[], maxMinutes: number): string {
  switch (t.status) {
    case 'doing':
      if (asksMoreTime(t)) return overtimeQuestion(t.id, timeLimitOf(maxMinutes, t))
      return [roleTag(t), tryMark(t)].filter(Boolean).join(' · ')
    case 'todo':
    case 'paused': {
      const open = (t.after ?? []).filter(id => tasks.some(x => x.id === id && x.status !== 'done'))
      return open.length ? `after ${open.join(', ')}` : roleTag(t)
    }
    case 'review':
      return isInvestigation(t) ? kindTag(t) : 'Enter to review'
    case 'waiting':
      return t.question ?? ''
    case 'failed':
      return whyFailed(t)
    case 'backlog':
      return t.note && t.note !== 'in the backlog' ? t.note : ''
    default:
      return ''
  }
}

/** What a task whose finished work waits only for the owner's files (BoardTask.merge_wait) says, in the board list,
 *  on its page and above the prompt: "waiting for your files on main: a.ts, b.ts; commit or stash them, it merges on
 *  its own" (or "move or rename them" for untracked or ignored files, as the task's note says). '' for any other task. */
export function fileWaitText(t: Pick<BoardTask, 'status' | 'merge_wait' | 'merge_into'>): string {
  if (!waitsForFiles(t)) return ''
  return `${waitFilesNote(intoOf(t), asBlockers(t.merge_wait)!)}, it merges on its own`
}

/** Cuts text to `n` columns, ending with "…" when cut. */
const cutTo = (s: string, n: number) => (n <= 0 ? '' : ellipsis(s, n))

/** Fits a task row's title and extra after `lead` columns (indent, id, mark and status) in `width` columns: the
 *  extra goes to the right end (`pad` fills the gap, at least two spaces) when the whole title fits beside it;
 *  otherwise the extra is left out first (or, with `cutExtra`, cut to fit), then the title is cut with "…". */
export function fitRow(lead: number, title: string, extra: string, width: number, cutExtra = false): { title: string; pad: string; extra: string } {
  const room = Math.max(1, width - lead)
  if (extra && title.length + 2 + extra.length <= room) return { title, pad: ' '.repeat(room - title.length - extra.length), extra }
  // `cutExtra` (a failed task's reason): the extra is cut with "…" to the room the whole title leaves, when that is 12 columns or more
  if (extra && cutExtra && room - title.length - 2 >= 12) return { title, pad: '  ', extra: cutTo(extra, room - title.length - 2) }
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

/** The status words a search (status:) and the lead's board tool take; "open" stands for every OPEN status (not done, dropped or backlog). */
export const BOARD_STATUSES: SymccStatus[] = ['todo', 'doing', 'review', 'waiting', 'failed', 'paused', 'done', 'dropped', 'backlog']

/** A search, read once from its text (see parseSearch): the plain words, the filter words, and how many to keep in which order. */
export type SearchQuery = {
  /** Plain words: every one must match the task's text (see taskMatches). */
  words: string[]
  status?: SymccStatus[]
  kinds?: string[]
  roles?: string[]
  /** since:<when>: only tasks changed at or after this moment (ms). */
  sinceMs?: number
  /** last:N (newest: the most recently changed first) or top:N (order: what runs next first); `n` left out = all. */
  pick?: { by: 'newest' | 'order'; n?: number }
  /** What's wrong with a status: or kind: word (an unknown status or kind); the panel ignores these and keeps the word plain. */
  errors: string[]
}

/** The filter words a search takes, for hints and help. */
export const SEARCH_WORDS = 'last:N top:N since:2d status: kind: role:'

/** How long ago `when` points, in ms ("30m", "2h", "2d", "1w"), or the moment of a local day ("2026-11-18");
 *  undefined when it can't be read. */
function sinceOf(when: string, nowMs: number, offsetMin: number): number | undefined {
  const ago = /^(\d+)(m|h|d|w)$/.exec(when)
  if (ago) return nowMs - Number(ago[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 }[ago[2] as 'm']
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) {
    const at = Date.parse(`${when}T00:00:00Z`)
    return Number.isFinite(at) ? at - offsetMin * 60_000 : undefined
  }
  return undefined
}

/** Reads a search text: plain words, and the filter words last:N, top:N, since:<30m|2h|2d|1w|2026-11-18>,
 *  status:<word or open>, kind:<kind> and role:<role> (case-insensitive; a value may list several, "status:done,dropped").
 *  A word that isn't a filter word, or whose value can't be read (foo:bar, last:x), stays a plain word. An unknown
 *  status (or a kind not in `kinds`, when given) is noted in `errors` and the word stays plain too. */
export function parseSearch(query: string, nowMs: number = Date.now(), offsetMin: number = localOffset(nowMs), kinds?: readonly string[]): SearchQuery {
  const q: SearchQuery = { words: [], errors: [] }
  for (const w of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const m = /^(last|top|since|status|kind|role):(.+)$/.exec(w)
    if (!m) {
      q.words.push(w)
      continue
    }
    const [, key, value] = m as unknown as [string, string, string]
    const list = value.split(',').filter(Boolean)
    if (key === 'last' || key === 'top') {
      if (/^\d+$/.test(value) && Number(value) > 0) q.pick = { by: key === 'last' ? 'newest' : 'order', n: Number(value) }
      else q.words.push(w)
    } else if (key === 'since') {
      const at = sinceOf(value, nowMs, offsetMin)
      if (at === undefined) q.words.push(w)
      else q.sinceMs = Math.max(q.sinceMs ?? -Infinity, at)
    } else if (key === 'status') {
      const bad = list.filter(s => s !== 'open' && !(BOARD_STATUSES as string[]).includes(s))
      if (bad.length) {
        q.errors.push(`unknown status "${bad[0]}": use ${BOARD_STATUSES.join(', ')} or open`)
        q.words.push(w)
      } else q.status = [...new Set([...(q.status ?? []), ...list.flatMap(s => (s === 'open' ? OPEN : [s as SymccStatus]))])]
    } else if (key === 'kind') {
      const bad = kinds ? list.filter(k => !kinds.includes(k)) : []
      if (bad.length) {
        q.errors.push(`unknown kind "${bad[0]}"; the kinds are: ${kinds!.join(', ')}`)
        q.words.push(w)
      } else q.kinds = [...(q.kinds ?? []), ...list]
    } else q.roles = [...(q.roles ?? []), ...list]
  }
  return q
}

/** When a task last changed (its updated_at, else created_at), in ms; NaN when neither can be read. */
export const changedMs = (t: Pick<SymccTask, 'updated_at' | 'created_at'>) => {
  const u = Date.parse(t.updated_at || '')
  return Number.isFinite(u) ? u : Date.parse(t.created_at || '')
}

/** Whether task `t` matches the board panel's search `query` (a text, read with parseSearch, or one already read):
 *  every filter word (status:, kind:, role:, since:) and every plain word must match (AND); last: and top: pick from
 *  the list instead (see searchTasks). Plain words are case-insensitive. A word
 *  shaped like a task id ("T-12", "t12" or just "12") matches that task's id exactly (not T-120), or the word in its
 *  text; any other
 *  word matches part of the id, title, details, role, status (its word too, e.g. "waiting for you"), origin (owner,
 *  scout or worker, the scout's name, the task it came from) or the owner's request. An empty query matches every task. */
export function taskMatches(t: SymccTask, query: string | SearchQuery, nowMs: number = Date.now()): boolean {
  const q = typeof query === 'string' ? parseSearch(query, nowMs) : query
  if (q.status && !q.status.includes(t.status)) return false
  if (q.kinds && !q.kinds.includes(kindOf(t))) return false
  if (q.roles && !q.roles.includes(roleOf(t).toLowerCase())) return false
  if (q.sinceMs !== undefined && !(changedMs(t) >= q.sinceMs)) return false
  const words = q.words
  if (!words.length) return true
  const o = originOf(t)
  const text = [t.title, t.details, roleOf(t), kindOf(t), t.status, STATUS_WORD[t.status] ?? '', o?.by ?? '', o?.scout ?? '', o?.task ?? '', o?.request ?? ''].join('\n').toLowerCase()
  const id = num(t.id)
  return words.every(w => {
    const asId = /^(?:t-?)?(\d+)$/.exec(w)
    if (asId) return Number(asId[1]) === id || text.includes(w)
    return t.id.toLowerCase().includes(w) || text.includes(w)
  })
}

/** Run order: lower `order` first, then the lower number (each task after the ones it waits for, see waitOrder). */
const byRunOrder = (x: SymccTask, y: SymccTask) => x.order - y.order || num(x.id) - num(y.id)

/** The tasks of `tasks` that match the search `query` (see taskMatches). With last:N, the N changed most recently,
 *  newest first; with top:N, the first N in run order (what runs next: without a status: word only the tasks waiting
 *  to run, todo, are taken). Without either, the matches in the order given. */
export function searchTasks<T extends SymccTask>(tasks: T[], query: string | SearchQuery, nowMs: number = Date.now()): T[] {
  const q = typeof query === 'string' ? parseSearch(query, nowMs) : query
  const hits = tasks.filter(t => taskMatches(t, q, nowMs))
  if (!q.pick) return hits
  const sorted = q.pick.by === 'newest'
    ? [...hits].sort((x, y) => (changedMs(y) || 0) - (changedMs(x) || 0) || num(y.id) - num(x.id))
    : waitOrder(q.status ? hits : hits.filter(t => t.status === 'todo'), byRunOrder)
  return q.pick.n === undefined ? sorted : sorted.slice(0, q.pick.n)
}

/** The line over the board list while a search filter is on: "search: notify · 3 of 144 tasks", or
 *  "search: notify · no tasks match". The [x] clear search button under it takes the filter off. */
export const searchLine = (query: string, shown: number, all: number): string =>
  `search: ${query.trim()} · ${shown ? `${shown} of ${all} tasks` : 'no tasks match'}`

/** The line under the open search box: how many match, and how to leave the box (Esc doesn't reach the panel
 *  from a text box). `count` is "3 of 144 tasks", "no tasks match" or "type to filter the tasks". */
export const searchBoxHint = (count: string): string => `${count} · Enter on empty clears`

/** The hint under a text box that Enter on empty cancels: what Enter does, then "Enter on empty cancels"
 *  ("goes back" when there is nothing to cancel back to but the page). Kept within 50 columns. */
export const boxHint = (enter: string, empty: 'cancels' | 'goes back' = 'cancels'): string => `${enter} · Enter on empty ${empty}`

/** The hint under a pick list: Enter picks, `key` (its Cancel button's hotkey) cancels. */
export const pickHint = (key: string): string => `Enter picks · ${key} cancels`

/** The keys under the board list: only keys that work in the list (a and x work only on a task's own page). */
export const listKeys = (): KeyHint[] => [
  { key: 'Enter', word: 'open' },
  { key: '↑↓', word: 'move' },
  { key: 't s c', word: 'views' },
]

/** The view keys under the scouts and settings pages; `enter` adds "Enter opens" first. */
export const viewKeys = (enter = true): KeyHint[] => [
  ...(enter ? [{ key: 'Enter', word: 'opens' }] : []),
  { key: 't', word: 'tasks' },
  { key: 's', word: 'scouts' },
  { key: 'c', word: 'settings' },
]

/** The keys at the bottom of a task's page, the ones that matter most for its state first; "y copy", "↑↓ scroll" and
 *  "b back" always come last. `worker`: a worker is on the task now (w opens it). `reports`: the tries
 *  with a saved report; with more than one, their numbers (1-9) show that try's report. `answering`: a waiting
 *  task's answer buttons are shown; they then take the number keys instead of the reports, and the dim line under
 *  them tells those keys (choiceKeysHint), so they are not listed here again. `fileWait`:
 *  its finished work waits only for the owner's files (fileWaitText), so r merges it now. `investigation`: the task is an investigation (in review: a done · k keep as a note · x ask more). */
export function taskKeys(status: SymccStatus, worker = false, reports: readonly number[] = [], answering = false, fileWait = false, investigation = false): KeyHint[] {
  const k = (key: string, word: string): KeyHint => ({ key, word })
  const keys: KeyHint[] = []
  // an answered investigation: Done, Keep as a note, Ask more instead of approve and reject
  if (status === 'review' && investigation) keys.push(k('a', 'done'), k('k', 'keep as a note'), k('x', 'ask more'))
  else if (status === 'review') keys.push(k('a', 'approve'), k('x', 'reject'), k('d', 'show changes'))
  if (status === 'backlog') keys.push(k('o', 'move to todo'), k('x', 'drop'))
  if (status === 'failed') keys.push(k('r', 'retry'), k('x', 'drop'))
  if (fileWait) keys.push(k('r', 'merge now'))
  if (worker) keys.push(k('w', 'watch worker'))
  if (status === 'todo' || status === 'paused' || status === 'failed') keys.push(k('k', 'stash to backlog'))
  if (['todo', 'paused', 'failed', 'backlog'].includes(status)) keys.push(k('l', 'role'))
  // A waiting task's answer buttons (Allow, Don't allow, Answer… or the worker's options), or a running one's
  // "more time?" buttons, take the number keys (told under the buttons).
  const keyed = answering && (status === 'waiting' || status === 'doing') ? [] : reports.filter(n => n >= 1 && n <= 9)
  if (reports.length > 1 && keyed.length) keys.push(k(keyed.length > 1 ? `${keyed[0]}-${keyed[keyed.length - 1]}` : `${keyed[0]}`, "a try's report"))
  return [...keys, k('y', 'copy'), k('↑↓', 'scroll'), k('b', 'back')]
}

/** The answer buttons of a waiting task, keyed 1, 2, 3...: Allow / Don't allow / Answer… for a file
 *  request (`files`), else the worker's `options` and Answer…; none (the text box) for a plain question. */
export function answerChoices(files: readonly string[] | undefined, options: readonly string[] | undefined): string[] {
  if (files?.length) return ['Allow', "Don't allow", 'Answer…']
  if (options?.length) return [...options.slice(0, 8), 'Answer…']
  return []
}

/** The keys at the bottom of a task's diff view: a and x while it is in review, d when one file is shown. */
export const diffKeys = (review: boolean, oneFile: boolean): KeyHint[] => [
  ...(review ? [{ key: 'a', word: 'approve' }, { key: 'x', word: 'reject' }] : []),
  ...(oneFile ? [{ key: 'd', word: 'all files' }] : []),
  { key: '↑↓', word: 'scroll' },
  { key: 'b', word: 'back to the task' },
]

/** The keys at the bottom of the Settings page; `heading`: a group heading has the focus, so Enter opens or closes it. */
export const settingsKeys = (heading = false): KeyHint[] => [
  { key: 'Enter', word: heading ? 'open/close' : 'change' },
  { key: '↑↓', word: 'move' },
  { key: 't s c', word: 'views' },
  { key: 'b', word: 'back' },
]

/** The keys at the bottom of the Roles page (opened from Settings). */
export const rolesKeys = (): KeyHint[] => [
  { key: 'Enter', word: 'open' },
  { key: 'n', word: 'new role' },
  { key: '↑↓', word: 'move' },
  { key: 't s c', word: 'views' },
  { key: 'b', word: 'back' },
]

/** The keys at the bottom of the view of the built-in prompt a role goes in (view only). */
export const rolePromptKeys = (): KeyHint[] => [{ key: 'b', word: 'back' }]

/** The keys at the bottom of the Kinds page (opened from Settings): the same as the Roles page's. A kind's own page and
 *  edit page use roleKeys and roleEditKeys. */
export const kindsKeys = (): KeyHint[] => [
  { key: 'Enter', word: 'open' },
  { key: 'n', word: 'new kind' },
  { key: '↑↓', word: 'move' },
  { key: 't s c', word: 'views' },
  { key: 'b', word: 'back' },
]

/** The keys at the bottom of a role's page; which ones depend on its buttons. */
export function roleKeys(o: { canEdit?: boolean; canOff: boolean; off: boolean; canReset: boolean; canRemove: boolean; canSeePrompt?: boolean }): KeyHint[] {
  return [
    ...(o.canEdit === false ? [] : [{ key: 'e', word: 'edit' }]),
    ...(o.canSeePrompt ? [{ key: 'p', word: 'the prompt it goes in' }] : []),
    ...(o.canOff ? [{ key: 'o', word: o.off ? 'turn on' : 'turn off' }] : []),
    ...(o.canReset ? [{ key: 'r', word: 'reset to built-in' }] : []),
    ...(o.canRemove ? [{ key: 'd', word: 'remove' }] : []),
    { key: 'b', word: 'back' },
  ]
}

/** The keys at the bottom of a role's edit page: its boxes take every letter, so the way out is its Cancel button. */
export const roleEditKeys = (): KeyHint[] => [
  { key: '↑↓', word: 'move between boxes' },
  { key: 'Cancel', word: 'leaves without saving' },
]

/** The keys at the bottom of a scout's edit page: its boxes take every letter, so the way out is its Cancel button. */
export const scoutEditKeys = (): KeyHint[] => [
  { key: '↑↓', word: 'move between boxes' },
  { key: 'Cancel', word: 'leaves without saving' },
]

/** The keys under the Scouts list. */
export const scoutListKeys = (): KeyHint[] => [
  { key: 'Enter', word: 'open' },
  { key: '↑↓', word: 'move' },
  { key: 't s c', word: 'views' },
  { key: 'b', word: 'back' },
]

/** The keys at the bottom of a scout's page; p pauses its timer, or resumes it when `paused`. "r run now" shows
 *  for a paused scout too (run now still runs it), but not while the scout is `running` (like the button). */
export const scoutKeys = (paused = false, running = false): KeyHint[] => [
  ...(running ? [] : [{ key: 'r', word: 'run now' }]),
  { key: 'e', word: 'edit' },
  { key: 'p', word: paused ? 'resume' : 'pause' },
  { key: '↑↓', word: 'scroll' },
  { key: 'b', word: 'back' },
]

/** When a task finished (its updated_at, else created_at), in ms; NaN when neither can be read. */
const finishedMs = changedMs
/** Finished tasks, the one that finished last first (then the higher number). */
const finishedFirst = (x: SymccTask, y: SymccTask) => (finishedMs(y) || 0) - (finishedMs(x) || 0) || num(y.id) - num(x.id)

/** `tasks` in dependency order: each one after every task of `tasks` it waits for (its `after`), ties broken by
 *  `tie` (lowest first). Waits on tasks not in `tasks` don't count. Tasks caught in a loop keep `tie` order at the end. */
export function waitOrder<T extends SymccTask>(tasks: T[], tie: (x: T, y: T) => number): T[] {
  const ids = new Set(tasks.map(t => t.id))
  const waits = new Map(tasks.map(t => [t.id, new Set((t.after ?? []).filter(a => a !== t.id && ids.has(a)))]))
  const left = [...tasks].sort(tie)
  const out: T[] = []
  const placed = new Set<string>()
  for (let i = 0; i < left.length; ) {
    const t = left[i]!
    if ([...waits.get(t.id)!].every(a => placed.has(a))) {
      out.push(t)
      placed.add(t.id)
      left.splice(i, 1)
      i = 0
    } else i++
  }
  return [...out, ...left]
}

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
    needsYou: needsYouFirst(s.open.filter(needsYou)),
    // T-511: a task whose tests run again on their own (rerunDue) shows with the running ones, not under NEEDS YOU
    doing: s.open.filter(t => (t.status === 'doing' && !asksMoreTime(t)) || rerunDue(t)),
    todo: waitOrder(s.open.filter(t => t.status === 'todo' || t.status === 'paused'), (x, y) => +(x.status === 'paused') - +(y.status === 'paused') || runOrder(x, y)),
    backlog: s.backlog,
    done,
    doneToday: done.filter(t => !isOld(t)),
    doneDays,
    dropped: tasks.filter(t => t.status === 'dropped').sort(finishedFirst),
  }
}

