// Short history lines for things that stop or restart a task, or that the owner said.
import type { SymccFailReason, SymccHistoryEntry, SymccRun, SymccTask } from '../../types'
import { roleOf, tryLabel } from './roles'
import { ellipsis, isObj, squash } from './text'

/** How much of the owner's answer goes into a history line. */
export const ANSWER_LINE_CHARS = 300

/** The fields of a change that count as "what changed" in a restart line, in this order. */
const CHANGE_FIELDS = ['title', 'details', 'files', 'after', 'priority', 'role', 'needs_review', 'merge_into'] as const

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
 * T-806: whether a try stopped for `why` was stopped on purpose, not failed: paused (by the owner or the lead, or the
 * whole board), dropped, moved to the backlog, symcc turned off (disabled), or the lead asking the owner a question.
 */
export const onPurposeStop = (why: string | undefined): boolean =>
  /^(paused\b|dropped\b|moved to the backlog\b|the lead asked the owner a question\b|.* paused the board\b|the board was paused\b|\S+ was (disabled|turned off)\b)/.test(String(why ?? '').trim())

/**
 * Whether a stop or a not-merged line worded `why` puts the task to wait for the owner's answer: the lead's question, the
 * branch-gone question ("asked the owner ..."), or a pause whose reason waits for the owner ("paused: Waiting for the owner ...").
 */
export const waitsForOwner = (why: string): boolean => /\basked the owner\b/.test(why) || /\bpaused\b.*\bwait(?:s|ing)? (?:for|on) (?:the owner|you)\b/i.test(why)

/**
 * T-806: result line `line` with " (not used: <why>)" added: the check it ends was counted by another line of its own (the
 * try was stopped, or the task changed), so a "not merged" result keeps no reason, and the note is part of its result.
 */
export function notUsedEntry(line: HistoryAdd, why: string): HistoryAdd {
  const { result, reason, ...rest } = line[2] ?? {}
  const note = ` (not used: ${why})`
  const dropped = reason === 'notmerged' && (result ?? '').startsWith('not merged')
  return [line[0], line[1] + note, { ...rest, ...(result !== undefined ? { result: result + note } : {}), ...(reason && !dropped ? { reason } : {}) }]
}

/** The facts a history line carries besides its time, kind and text (T-806; see SymccHistoryEntry). */
export type HistoryFacts = Omit<SymccHistoryEntry, 'at' | 'kind' | 'text'>

/** "try 2: <body>" as an entry to add, with its `try` fact; `facts` adds the rest. */
export const tryEntry = (t: Pick<SymccTask, 'role' | 'attempts'>, kind: HistoryKind, body: string, facts: HistoryFacts = {}): HistoryAdd => [kind, `${tryLabel(t)}: ${body}`, { try: Number(t.attempts) || 0, ...facts }]

/** "try 2: <said> → <result>" as an entry to add: its `try` and `result` facts are set; `facts` adds the rest (the reason, ...). */
export const resultEntry = (t: Pick<SymccTask, 'role' | 'attempts'>, kind: HistoryKind, said: string, result: string, facts: HistoryFacts = {}): HistoryAdd =>
  tryEntry(t, kind, `${said} → ${result}`, { result, ...facts })

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

/**
 * stoppedLine as an entry to add: "restarted" when `why` says so, else "stopped". Its reason: "changed" for a restart
 * by a change, "stopped" for a stop that was not on purpose; a restart symcc did itself and an on-purpose stop have none.
 */
export const stoppedEntry = (t: Pick<SymccTask, 'role' | 'attempts'>, why: string): HistoryAdd => {
  const restarted = /^restarted\b/.test(why)
  const reason: FailReason | undefined = restarted ? (/^restarted: the task was changed\b/.test(why) ? 'changed' : undefined) : onPurposeStop(why) ? undefined : 'stopped'
  return [restarted ? 'restarted' : 'stopped', stoppedLine(t, why), { try: Number(t.attempts) || 0, ...(reason ? { reason } : {}), ...(!restarted && waitsForOwner(why) ? { owner: true as const } : {}) }]
}

/** T-723: the words of the 'stage' line written when a try's worker starts, and when it hands back (before "prep started"). */
export const WORKER_STARTED = 'worker started'
export const WORKER_HANDED_BACK = 'worker handed back'

/** T-806: why a try failed or was sent back, as a history line records it (`reason`). */
export type FailReason = SymccFailReason

/**
 * T-723: "try 2: worker started (role tester)", the 'stage' line of a try whose worker just started: "· merges main in
 * first" for a merge-it-in try (`mergeMain`), and "· same try number (note joined)" when this try number already had a
 * started worker (a change restarted a try that had only just started, T-678; "(task changed)" when no note came).
 * Only that T-678 path gives a try its number back without a "restarted"/"stopped" line: a drive hand-over (handedOff)
 * also takes the number back but writes its own "restarted" line, which already says why, so no mark is added then.
 */
export function workerStartedEntry(t: Pick<SymccTask, 'role' | 'attempts' | 'history'>, mergeMain: boolean): HistoryAdd {
  const history = t.history ?? []
  const last = history.findLastIndex(h => h.kind === 'stage' && h.step === 'worker-start' && h.try === (Number(t.attempts) || 0))
  const since = last < 0 ? [] : history.slice(last + 1)
  const changed = last >= 0 && !since.some(h => h.kind === 'restarted' || h.kind === 'stopped')
  const again = !changed ? '' : since.some(h => h.kind === 'note') ? ' · same try number (note joined)' : ' · same try number (task changed)'
  return ['stage', `try ${t.attempts}: ${WORKER_STARTED} (role ${roleOf(t)})${mergeMain ? ' · merges main in first' : ''}${again}`, { try: Number(t.attempts) || 0, step: 'worker-start' }]
}

/** T-723: "try 2: worker handed back", the 'stage' line of a try whose worker handed back its report. */
export const workerHandedBackEntry = (t: Pick<SymccTask, 'attempts'>): HistoryAdd => ['stage', `try ${t.attempts}: ${WORKER_HANDED_BACK}`, { try: Number(t.attempts) || 0, step: 'handed-back' }]

/**
 * The history lines of a change to task `t` (as it was) with `patch`: the restart line when its
 * worker was stopped (`wasDoing`), "files widened" when files were added, "waits on changed"
 * when its after list changed, the owner's answer and the lead's added note.
 */
export function changeLines(t: Pick<SymccTask, 'role' | 'attempts' | 'files'> & Partial<SymccTask>, patch: Partial<SymccTask>, wasDoing: boolean, answer?: string, note?: string): HistoryAdd[] {
  const lines: HistoryAdd[] = []
  if (wasDoing) lines.push(['restarted', changeRestartLine(t, changedFields(t, patch)), { try: Number(t.attempts) || 0, reason: 'changed' }])
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
  /** T-954: the owner's Run now started this try at once ("try 2: started now by the owner"), past the slots, a paused board or its after list */
  'run-now': 'other',
  /** the branch it merges into changed */
  'merge-into': 'other',
  /** someone asked something: the worker asked the owner, the lead asked the owner */
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
  /** T-616: a try went into a check stage ("checker started", "waits in the merge queue (place 2)"; see withStageHistory) */
  stage: 'step',
  /** a running worker was stopped and its task starts again (the task was changed) */
  restarted: 'step',
  /** a running worker was stopped (paused, the board paused, the lead's handover …) */
  stopped: 'bad',
  /** a try ran out of time, or went over its limit */
  'out-of-time': 'bad',
  /** the owner rejected the try */
  rejected: 'bad',
  /** the owner approved, but it could not merge (its edits fail the tests …) */
  'approve-failed': 'bad',
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

/** One entry to add: its kind, its text and its facts (see HistoryFacts). */
export type HistoryAdd = [kind: HistoryKind, text: string, facts?: HistoryFacts]

/** T-954: whether task `t` was ever started by the owner's Run now (a 'run-now' line): the health check doesn't count
 *  such a start as pushing older tasks back. */
export const ranNow = (t: Pick<SymccTask, 'history'>): boolean => (t.history ?? []).some(e => e.kind === 'run-now')

/** T-954: whether task `t`'s current try (its `attempts`) was started by the owner's Run now. */
export const ranNowThisTry = (t: Pick<SymccTask, 'history' | 'attempts'>): boolean => (t.history ?? []).some(e => e.kind === 'run-now' && e.try === Number(t.attempts))

/** Whether `k` is a kind symcc knows (see HISTORY_KINDS). */
export const isHistoryKind = (k: unknown): k is HistoryKind => typeof k === 'string' && Object.prototype.hasOwnProperty.call(HISTORY_KINDS, k)

/** The one way a history entry is made: `{ at, kind, text, ...facts }`, `at` the time it happened (ISO). */
export const historyEntry = (kind: HistoryKind, text: string, at: string, facts: HistoryFacts = {}): HistoryEntry => ({ at, kind, text, ...facts })

/** Task history `history` with entries added (each one [kind, text]), all at time `at`. */
export function withHistory(history: readonly HistoryEntry[] | undefined, at: string, ...adds: HistoryAdd[]): HistoryEntry[] {
  return [...(history ?? []), ...adds.map(([kind, text, facts]) => historyEntry(kind, text, at, facts))]
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

/** A line's "try 2 (role tester): " label split off: [label, try number, the rest], or null when it names no try. */
export function tryParts(text: string): [label: string, n: number, body: string] | null {
  const m = /^(try (\d+)(?: \([^)]*\))?):\s*(.*)$/s.exec(text)
  return m ? [m[1]!, Number(m[2]), m[3]!] : null
}

/** Whether `v` can be a history entry read from a file: a record with a text and a kind. */
export function historyEntryOk(v: unknown): boolean {
  if (!isObj(v)) return false
  const e = v as Partial<HistoryEntry>
  return typeof e.text === 'string' && typeof e.kind === 'string' && (e.at === undefined || typeof e.at === 'string')
}

/** The kinds of a try's result line ("try 2: <what the worker said> → <the result>"), whose text is split at the " → ". */
const RESULT_KINDS = ['merged', 'done', 'failed', 'try-result', 'not-merged', 'approve-failed'] as const satisfies readonly HistoryKind[]

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
  const result = parts && isResult && e.result && text.endsWith(` → ${e.result}`) ? e.result : ''
  return {
    kind, tone, mark: HISTORY_MARK[tone], at: e.at ?? '', try: parts ? parts[1] : 0, label: parts ? parts[0] : '', text,
    said: result ? text.slice(0, text.length - result.length - 3) : text, result,
  }
}
