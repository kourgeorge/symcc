// Short history lines for things that stop or restart a task, or that the owner said.
import type { SymccTask } from '../../types'
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

/**
 * The history lines of a change to task `t` (as it was) with `patch`: the restart line when its
 * worker was stopped (`wasDoing`), "files widened" when files were added, "waits on changed"
 * when its after list changed, the owner's answer and the lead's added note.
 */
export function changeLines(t: Pick<SymccTask, 'role' | 'attempts' | 'files'> & Partial<SymccTask>, patch: Partial<SymccTask>, wasDoing: boolean, answer?: string, note?: string): string[] {
  const lines: string[] = []
  if (wasDoing) lines.push(changeRestartLine(t, changedFields(t, patch)))
  const widened = filesWidenedLine(t.files ?? [], patch.files)
  if (widened) lines.push(widened)
  const waits = afterChangedLine(t.after ?? [], patch.after)
  if (waits) lines.push(waits)
  if (answer?.trim()) lines.push(ownerAnsweredLine(answer))
  if (note?.trim()) lines.push(noteAddedLine(note))
  if (patch.merge_into !== undefined && patch.merge_into !== (t.merge_into ?? 'main')) lines.push(`now merges into ${patch.merge_into} (was ${t.merge_into ?? 'main'})`)
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

/** What kind of event a history line is (see historyEvent). */
export type HistoryKind = 'created' | 'note' | 'answer' | 'waits' | 'files' | 'backlog' | 'checker' | 'result' | 'stopped' | 'step' | 'other'

/** How a history event went: well (✓), badly (✗), a step of a try (●), or anything else (○). */
export type HistoryTone = 'good' | 'bad' | 'step' | 'other'

/** The mark drawn for each tone, the same in every view. */
export const HISTORY_MARK: Record<HistoryTone, string> = { good: '✓', bad: '✗', step: '●', other: '○' }

/** The theme color of each tone's mark (a try's good or bad result is drawn in it too), the same in every view. */
export const HISTORY_COLOR: Record<HistoryTone, string> = { good: 'success', bad: 'error', step: 'text', other: 'inactive' }

/** A history line in parts (T-512). */
export type HistoryEvent = {
  kind: HistoryKind
  tone: HistoryTone
  mark: string
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

/** Lines that are not about a try, by how they start: [kind, start]. */
const PLAIN_KINDS: [HistoryKind, RegExp][] = [
  ['created', /^created by /],
  ['note', /^the lead added a note:/],
  ['answer', /^the owner answered:/],
  ['waits', new RegExp(`^${AFTER_CHANGED}`)],
  ['files', /^(files widened:|the owner allowed files:|the owner didn't allow files:|owner edited files)/],
  ['backlog', /^(moved to the backlog|moved from the backlog|brought back from the archive)/],
  ['stopped', /^(not merged|not started):/],
]

/** How a try's own line (no result) starts when it went badly. */
const TRY_BAD = /^(stopped|out of time|rejected|the worker ended without a result|ran \d+ min, over|time is up|approved, but)|; nothing was checked or merged$/

/** How a try's line starts when it is a step that is not a result, whatever words follow (a question, an answer, a rerun). */
const TRY_STEP = /^(worker asked|answered\b|the owner asked)/

/**
 * How symcc starts a try's result, the words it puts right after " → " (hooks/app/review.ts, workers.ts): good results,
 * then bad ones. Any other result is a step (checks passed and waiting, a new checker starts, the owner's files in the way …).
 */
const RESULT_GOOD = /^(merged into|already merged into|done\b)/
const RESULT_BAD = /^(not merged|tests failed|the checker found problems|conflicts with the latest|symcc could not|could not|checking failed|the worker made no change|the worker ended its turn before|your files on|its checking and merging ran over|its merge ran over)/
const RESULT_KNOWN = new RegExp(`${RESULT_GOOD.source}|${RESULT_BAD.source}|^(checks passed|the checker (was stopped|couldn't start|gave no verdict)|you have )`)

/**
 * A history line as an event: its kind, how it went (and so its mark), its try and its words. The kind and the tone come
 * from what symcc wrote the line for (a try's result, a checker verdict, created, a note, waits changed …), read from
 * how the line starts and, for a try's result, from the words symcc put after its " → ". Words inside quoted text,
 * a reason or a worker's summary never make a line bad or good.
 */
export function historyEvent(line: string): HistoryEvent {
  const m = /^(try (\d+)(?: \([^)]*\))?):\s*(.*)$/s.exec(line)
  const ev = (kind: HistoryKind, tone: HistoryTone, said: string, result = ''): HistoryEvent => ({
    kind, tone, mark: HISTORY_MARK[tone], try: m ? Number(m[2]) : 0, label: m ? m[1]! : '', text: m ? m[3]! : line, said, result,
  })
  if (!m) {
    const kind = PLAIN_KINDS.find(([, re]) => re.test(line))?.[0] ?? 'other'
    return ev(kind, kind === 'stopped' ? 'bad' : 'other', line)
  }
  const body = m[3]!
  if (/^checker: OK\b/.test(body)) return ev('checker', 'good', body)
  if (/^checker found problems\b/.test(body)) return ev('checker', 'bad', body)
  if (/^checker\b/.test(body)) return ev('checker', 'step', body)
  if (TRY_STEP.test(body)) return ev('step', 'step', body)
  if (TRY_BAD.test(body)) return ev('stopped', 'bad', body)
  // The result starts after the first " → " followed by words symcc writes there, so a "→" in the worker's summary
  // or in the test output inside the result never moves it.
  const arrows = [...body.matchAll(/ → /g)].map(a => a.index!)
  const arrow = arrows.find(i => RESULT_KNOWN.test(body.slice(i + 3))) ?? arrows.at(-1)
  if (arrow !== undefined) {
    const said = body.slice(0, arrow)
    const result = body.slice(arrow + 3)
    const tone: HistoryTone = RESULT_GOOD.test(result) ? 'good' : RESULT_BAD.test(result) ? 'bad' : 'step'
    return ev('result', tone, said, result)
  }
  if (/, so it is done$/.test(body)) return ev('result', 'good', body)
  return ev('step', 'step', body)
}
