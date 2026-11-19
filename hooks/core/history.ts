// Short history lines for things that stop or restart a task, or that the owner said.
import type { SymccHistoryEntry, SymccRun, SymccTask } from '../../types'
import { tryLabel } from './roles'
import { ellipsis, squash } from './text'

/** How much of the owner's answer goes into a history line. */
export const ANSWER_LINE_CHARS = 300

/** The fields of a change that count as "what changed" in a restart line, in this order. */
const CHANGE_FIELDS = ['title', 'details', 'files', 'after', 'order', 'role', 'needs_review', 'merge_into'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The names of the fields `patch` really changes on task `t` (e.g. ["details", "files"]). */
export function changedFields(t: Partial<SymccTask>, patch: Partial<SymccTask>): string[] {
  return CHANGE_FIELDS.filter(k => patch[k] !== undefined && !same(patch[k], t[k]))
}

/** "restarted: the task was changed (details, files)": why a running worker was stopped by a change. */
export const changeRestartWhy = (fields: readonly string[]): string => `restarted: the task was changed${fields.length ? ` (${fields.join(', ')})` : ''}`

/** "try 2: restarted: the task was changed (details, files)": a running worker was stopped by a change. */
export function changeRestartLine(t: Pick<SymccTask, 'role' | 'attempts'>, fields: readonly string[]): string {
  return `${tryLabel(t)}: ${changeRestartWhy(fields)}`
}

/**
 * The try's end reason for a stop worded `why` as in stoppedLine: "restarted: X" is restarted
 * (note X), anything else is stopped (note `why`).
 */
export function stopEnd(why: string): [by: 'restarted' | 'stopped', note: string] {
  const m = /^restarted\b:?\s*(.*)$/.exec(why)
  return m ? ['restarted', m[1]!] : ['stopped', why]
}

/** "files widened: + a, + b": files the change adds to the task's list; null when it adds none. */
export function filesWidenedLine(before: readonly string[], after: readonly string[] | undefined): string | null {
  if (!after) return null
  const added = after.filter(f => !before.includes(f))
  return added.length ? `files widened: ${added.map(f => `+ ${f}`).join(', ')}` : null
}

/** The start of the history line written when a task's after list changes (the health check counts them). */
export const AFTER_CHANGED = 'waits on changed:'

/** "waits on changed: T-1 → T-1, T-3", or null when the list stays the same. */
export function afterChangedLine(before: readonly string[], after: readonly string[] | undefined): string | null {
  if (!after) return null
  if (before.length === after.length && before.every((x, i) => x === after[i])) return null
  const show = (l: readonly string[]) => (l.length ? l.join(', ') : 'nothing')
  return `${AFTER_CHANGED} ${show(before)} → ${show(after)}`
}

/** 'the owner answered: “...”', cut to ANSWER_LINE_CHARS. */
export const ownerAnsweredLine = (answer: string) => quotedLine('the owner answered', answer)

/** '<words>: “<text>”', the text on one line and cut to ANSWER_LINE_CHARS. */
const quotedLine = (words: string, text: string) => `${words}: “${ellipsis(squash(text), ANSWER_LINE_CHARS)}”`

/** "try 3: stopped: <why>": a running worker was stopped and its task waits or goes back to "todo". */
export function stoppedLine(t: Pick<SymccTask, 'role' | 'attempts'>, why: string): string {
  return `${tryLabel(t)}: ${/^restarted\b/.test(why) ? why : `stopped: ${why}`}`
}

/** stoppedLine as an entry to add: "restarted" when `why` says so, else "stopped". */
export const stoppedEntry = (t: Pick<SymccTask, 'role' | 'attempts'>, why: string): HistoryAdd => [/^restarted\b/.test(why) ? 'restarted' : 'stopped', stoppedLine(t, why)]

/**
 * The history lines of a change to task `t` (as it was) with `patch`: the restart line when its
 * worker was stopped (`wasDoing`), "files widened" when files were added, "waits on changed"
 * when its after list changed, the owner's answer and the lead's added note.
 */
export function changeLines(t: Pick<SymccTask, 'role' | 'attempts' | 'files'> & Partial<SymccTask>, patch: Partial<SymccTask>, wasDoing: boolean, answer?: string, note?: string): HistoryAdd[] {
  const lines: HistoryAdd[] = []
  if (wasDoing) lines.push(['restarted', changeRestartLine(t, changedFields(t, patch))])
  const widened = filesWidenedLine(t.files ?? [], patch.files)
  if (widened) lines.push(['files-widened', widened])
  const waits = afterChangedLine(t.after ?? [], patch.after)
  if (waits) lines.push(['waits-changed', waits])
  if (answer?.trim()) lines.push(['answer', ownerAnsweredLine(answer)])
  if (note?.trim()) lines.push(['note', noteAddedLine(note)])
  if (patch.merge_into !== undefined && patch.merge_into !== (t.merge_into ?? 'main')) lines.push(['merge-into', `now merges into ${patch.merge_into} (was ${t.merge_into ?? 'main'})`])
  return lines
}

/** "Note (lead, 2026-11-13): <note>" added to `details` as a new paragraph; the old text stays as it was. */
export function addDetailsText(details: string, note: string, day: string): string {
  const para = `Note (lead${day ? `, ${day}` : ''}): ${note.trim()}`
  return details.trim() ? `${details.trimEnd()}\n\n${para}` : para
}

/** 'the lead added a note: “...”', cut to ANSWER_LINE_CHARS. */
export const noteAddedLine = (note: string) => quotedLine('the lead added a note', note)

/** Why a change that gives both `details` (a full rewrite) and `add_details` (a note added) is refused; null when it is fine. */
export function detailsBothRefusal(a: { details?: unknown; add_details?: unknown }): string | null {
  const given = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return given(a.details) && given(a.add_details) ? 'Nothing changed: give either details (rewrites the whole text) or add_details (adds a note to it), not both. To rewrite and add a note, put the note at the end of the new details.' : null
}

/** How a history event went: well (✓), badly (✗), a step of a try (●), or anything else (○). */
export type HistoryTone = 'good' | 'bad' | 'step' | 'other'

/**
 * Every kind of history entry symcc writes (T-522), with how it went (its tone, and so its mark). This is the one list:
 * a new kind of event gets its name here.
 */
export const HISTORY_KINDS = {
  /** the task was made ("created by the owner because ...") */
  created: 'other',
  /** the lead added a note to its details */
  note: 'other',
  /** the owner answered a question */
  answer: 'other',
  /** its after list changed ("waits on changed: ...") */
  'waits-changed': 'other',
  /** files were added to the task (a change, the owner allowing a request, the owner's edits before an approve) */
  'files-widened': 'other',
  /** the owner didn't allow the files a worker asked for */
  'files-refused': 'other',
  /** moved to or from the backlog */
  'moved-backlog': 'other',
  /** brought back (from the archive, from dropped) */
  retried: 'other',
  /** resumed after a pause */
  resumed: 'other',
  /** the branch it merges into changed */
  'merge-into': 'other',
  /** someone asked something: the worker asked the owner, the lead asked the owner, the owner asked for a rerun */
  asked: 'step',
  /** an investigation's worker answered */
  answered: 'step',
  /** a checker step with no verdict (it was stopped, it could not start …) */
  checker: 'step',
  /** the checker passed the try */
  'checker-ok': 'good',
  /** the checker found problems */
  'checker-problems': 'bad',
  /** a try's result that neither merged nor failed (checks passed and waiting, files in the way …) */
  'try-result': 'step',
  /** any other step of a try (a warning, more time given, the tests run again …) */
  step: 'step',
  /** a running worker was stopped and its task starts again (the task was changed) */
  restarted: 'step',
  /** a running worker was stopped (paused, the board off, the lead's handover …) */
  stopped: 'bad',
  /** a try ran out of time, or went over its limit */
  'out-of-time': 'bad',
  /** the owner rejected the try */
  rejected: 'bad',
  /** the owner approved, but it could not merge (its edits fail the tests …) */
  approved: 'bad',
  /** a try's result that went badly (tests failed, conflicts, no change, ended without a result …) */
  failed: 'bad',
  /** something kept it from merging or starting ("not merged: ...", "not started: ...") */
  'not-merged': 'bad',
  /** its work was merged (by its try, by an earlier try, or outside the board) */
  merged: 'good',
  /** it is done without a merge (an answered investigation …) */
  done: 'good',
  /** anything else */
  other: 'other',
} as const satisfies Record<string, HistoryTone>

/** The name of a kind of history entry (see HISTORY_KINDS). */
export type HistoryKind = keyof typeof HISTORY_KINDS

/** A history entry (the record saved in board.json). */
export type HistoryEntry = SymccHistoryEntry

/** One entry to add: its kind and its text. */
export type HistoryAdd = [kind: HistoryKind, text: string]

/** Whether `k` is a kind symcc knows (see HISTORY_KINDS). */
export const isHistoryKind = (k: unknown): k is HistoryKind => typeof k === 'string' && Object.prototype.hasOwnProperty.call(HISTORY_KINDS, k)

/** The one way a history entry is made: `{ at, kind, text }`, `at` the time it happened (ISO). */
export const historyEntry = (kind: HistoryKind, text: string, at: string): HistoryEntry => ({ at, kind, text })

/** Task history `history` with entries added (each one [kind, text]), all at time `at`. */
export function withHistory(history: readonly HistoryEntry[] | undefined, at: string, ...adds: HistoryAdd[]): HistoryEntry[] {
  return [...(history ?? []), ...adds.map(([kind, text]) => historyEntry(kind, text, at))]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** When an entry happened, short and in local time: "10:42" for today, "Nov 18 22:49" for an older day; '' when it has no time. */
export function historyTime(at: string | undefined, nowMs = Date.now()): string {
  const ms = at ? Date.parse(at) : NaN
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const today = new Date(nowMs)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  return sameDay ? hm : `${MONTHS[d.getMonth()]} ${d.getDate()} ${hm}`
}

/** "10:42  try 1: checker: OK": an entry's line for plain text, its time first when it has one. */
export const historyLineText = (e: HistoryEntry, nowMs = Date.now()): string => {
  const when = historyTime(e.at, nowMs)
  return when ? `${when}  ${e.text}` : e.text
}

/** The mark drawn for each tone, the same in every view. */
export const HISTORY_MARK: Record<HistoryTone, string> = { good: '✓', bad: '✗', step: '●', other: '○' }

/** The theme color of each tone's mark (a try's good or bad result is drawn in it too), the same in every view. */
export const HISTORY_COLOR: Record<HistoryTone, string> = { good: 'success', bad: 'error', step: 'text', other: 'inactive' }

/** A history entry in parts (T-512), for drawing. */
export type HistoryEvent = {
  kind: HistoryKind
  tone: HistoryTone
  mark: string
  /** when it happened (ISO), or '' when the entry has no time */
  at: string
  /** the try it is about (0 when it names none) */
  try: number
  /** its "try 2" or "try 3 (role tester)" label ('' when it names none) */
  label: string
  /** the line without its label */
  text: string
  /** what was said before the " → " of a try's result line (else the whole text) */
  said: string
  /** a try's result, after its " → " ('' when there is none) */
  result: string
}

/** Old lines that are not about a try, by how they start: [kind, start]. */
const PLAIN_KINDS: [HistoryKind, RegExp][] = [
  ['created', /^created by /],
  ['note', /^the lead added a note:/],
  ['answer', /^the owner answered:/],
  ['waits-changed', new RegExp(`^${AFTER_CHANGED}`)],
  ['files-refused', /^the owner didn't allow files:/],
  ['files-widened', /^(files widened:|the owner allowed files:|owner edited files)/],
  ['moved-backlog', /^(moved to the backlog|moved from the backlog)/],
  ['retried', /^brought back from/],
  ['resumed', /^resumed\b/],
  ['merge-into', /^now merges into /],
  ['merged', /^merged outside the board\b/],
  ['not-merged', /^(not merged|not started):/],
]

/** How symcc starts a try's result, the words it puts right after " → ": good results, then bad ones. */
const RESULT_GOOD = /^(merged into|already merged into|done\b)/
const RESULT_BAD = /^(not merged|tests failed|the checker found problems|conflicts with the latest|symcc could not|could not|checking failed|the worker made no change|the worker ended its turn before|your files on|its checking and merging ran over|its merge ran over)/
const RESULT_KNOWN = new RegExp(`${RESULT_GOOD.source}|${RESULT_BAD.source}|^(checks passed|the checker (was stopped|couldn't start|gave no verdict)|you have )`)

/**
 * The index of the " → " that starts a try's result in `body`: the first one followed by words symcc writes there,
 * so a "→" in the worker's summary or in the test output never moves it (else the last one); undefined when none.
 */
function resultArrow(body: string): number | undefined {
  const arrows = [...body.matchAll(/ → /g)].map(a => a.index!)
  return arrows.find(i => RESULT_KNOWN.test(body.slice(i + 3))) ?? arrows.at(-1)
}

/** A line's "try 2 (role tester): " label split off: [label, try number, the rest], or null when it names no try. */
function tryParts(text: string): [label: string, n: number, body: string] | null {
  const m = /^(try (\d+)(?: \([^)]*\))?):\s*(.*)$/s.exec(text)
  return m ? [m[1]!, Number(m[2]), m[3]!] : null
}

/**
 * The kind of an old history line (a plain string from before T-522), guessed from how it starts and, for a try's
 * result, from the words symcc put after its " → ". Only used to convert old boards once (see oldHistoryEntry).
 */
export function guessHistoryKind(line: string): HistoryKind {
  const parts = tryParts(line)
  if (!parts) return PLAIN_KINDS.find(([, re]) => re.test(line))?.[0] ?? 'other'
  const body = parts[2]
  if (/^checker: OK\b/.test(body)) return 'checker-ok'
  if (/^checker found problems\b/.test(body)) return 'checker-problems'
  if (/^checker\b/.test(body)) return 'checker'
  if (/^(worker asked|the owner asked)/.test(body)) return 'asked'
  if (/^answered\b/.test(body)) return 'answered'
  if (/^restarted\b/.test(body)) return 'restarted'
  if (/^stopped/.test(body)) return 'stopped'
  if (/^rejected/.test(body)) return 'rejected'
  if (/^approved, but/.test(body)) return 'approved'
  if (/^(out of time|ran \d+ min, over|time is up)/.test(body)) return 'out-of-time'
  if (/^the worker ended without a result|; nothing was checked or merged$/.test(body)) return 'failed'
  const arrow = resultArrow(body)
  if (arrow !== undefined) {
    const result = body.slice(arrow + 3)
    return /^done\b/.test(result) ? 'done' : RESULT_GOOD.test(result) ? 'merged' : RESULT_BAD.test(result) ? 'failed' : 'try-result'
  }
  if (/, so it is done$/.test(body)) return 'done'
  return 'step'
}

/**
 * An old history line (a plain string) as a record: its kind guessed from its text (guessHistoryKind), its time
 * guessed from the try it names (that try's end, else its start) or, for "created", the task's created_at; no time
 * when neither is known. Only for the one-time conversion of old boards and archives.
 */
export function oldHistoryEntry(line: string, t: { runs?: readonly SymccRun[]; created_at?: string } = {}): HistoryEntry {
  const kind = guessHistoryKind(line)
  const n = tryParts(line)?.[1]
  const run = n ? t.runs?.[n - 1] : undefined
  const at = run ? run.ended ?? run.started : kind === 'created' ? t.created_at : undefined
  return { ...(typeof at === 'string' && at ? { at } : {}), kind, text: line }
}

/**
 * A task's history in the current shape (one-time conversion, T-522): old string lines become records (oldHistoryEntry),
 * a record with a kind symcc doesn't know gets "other". Null when there is nothing to convert.
 */
export function migrateHistory(t: { history?: unknown; runs?: readonly SymccRun[]; created_at?: string }): HistoryEntry[] | null {
  const h = t.history
  if (!Array.isArray(h) || h.every(e => typeof e !== 'string' && isHistoryKind((e as HistoryEntry)?.kind))) return null
  return h.map(e => (typeof e === 'string' ? oldHistoryEntry(e, t) : { ...(e as HistoryEntry), kind: isHistoryKind((e as HistoryEntry).kind) ? (e as HistoryEntry).kind : 'other' }))
}

/** Whether `v` can be a history entry read from a file: an old string line (converted on load) or a record with a text and a kind. */
export function historyEntryOk(v: unknown): boolean {
  if (typeof v === 'string') return true
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const e = v as Partial<HistoryEntry>
  return typeof e.text === 'string' && typeof e.kind === 'string' && (e.at === undefined || typeof e.at === 'string')
}

/** The kinds of a try's result line ("try 2: <what the worker said> → <the result>"), whose text is split at the " → ". */
const RESULT_KINDS = ['merged', 'done', 'failed', 'try-result', 'not-merged', 'approved'] as const satisfies readonly HistoryKind[]

/**
 * A history entry as an event to draw: its mark and tone come from its saved kind (HISTORY_KINDS), never from words in
 * its text. Its try label and, for a try's result, what was said before the " → " and the result after it, are split
 * off the text for drawing only.
 */
export function historyEvent(e: HistoryEntry): HistoryEvent {
  const kind: HistoryKind = isHistoryKind(e.kind) ? e.kind : 'other'
  const tone: HistoryTone = HISTORY_KINDS[kind]
  const parts = tryParts(e.text)
  const text = parts ? parts[2] : e.text
  const isResult = (RESULT_KINDS as readonly string[]).includes(kind)
  const arrow = parts && isResult ? resultArrow(text) : undefined
  return {
    kind, tone, mark: HISTORY_MARK[tone], at: e.at ?? '', try: parts ? parts[1] : 0, label: parts ? parts[0] : '', text,
    said: arrow === undefined ? text : text.slice(0, arrow), result: arrow === undefined ? '' : text.slice(arrow + 3),
  }
}
