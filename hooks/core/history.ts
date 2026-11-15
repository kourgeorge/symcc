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
