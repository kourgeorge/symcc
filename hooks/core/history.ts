// Short history lines for things that stop or restart a task, or that the owner said.
import type { SymccTask } from '../../types'
import { tryLabel } from './roles'

/** How much of the owner's answer goes into a history line. */
export const ANSWER_LINE_CHARS = 300

/** The fields of a change that count as "what changed" in a restart line, in this order. */
const CHANGE_FIELDS = ['title', 'details', 'files', 'after', 'order', 'role', 'needs_review'] as const

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

/** 'the owner answered: “...”', cut to ANSWER_LINE_CHARS. */
export function ownerAnsweredLine(answer: string): string {
  const a = answer.trim().replace(/\s+/g, ' ')
  return `the owner answered: “${a.length > ANSWER_LINE_CHARS ? `${a.slice(0, ANSWER_LINE_CHARS - 1)}…` : a}”`
}

/** "try 3: stopped: <why>": a running worker was stopped and its task waits or goes back to "todo". */
export function stoppedLine(t: Pick<SymccTask, 'role' | 'attempts'>, why: string): string {
  return `${tryLabel(t)}: ${/^restarted\b/.test(why) ? why : `stopped: ${why}`}`
}

/**
 * The history lines of a change to task `t` (as it was) with `patch`: the restart line when its
 * worker was stopped (`wasDoing`), "files widened" when files were added, and the owner's answer.
 */
export function changeLines(t: Pick<SymccTask, 'role' | 'attempts' | 'files'> & Partial<SymccTask>, patch: Partial<SymccTask>, wasDoing: boolean, answer?: string): string[] {
  const lines: string[] = []
  if (wasDoing) lines.push(changeRestartLine(t, changedFields(t, patch)))
  const widened = filesWidenedLine(t.files ?? [], patch.files)
  if (widened) lines.push(widened)
  if (answer?.trim()) lines.push(ownerAnsweredLine(answer))
  return lines
}
