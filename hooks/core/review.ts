// The board modes (review before merge) and looking at a task's changes.
import type { SymccMode, SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { type Board, type BoardTask, find, isMode, modeOf, STATUS_WORD } from './board-file'
import { patchTask } from './task'
import { clean } from './text'

// ---------------- review before merge ----------------

/** Whether a finished task that passed its checks waits for the owner: every task unless the mode is "auto", or a task with needs_review. */
export function needsReview(b: { mode?: unknown }, t: Pick<SymccTask, 'needs_review'>): boolean {
  return modeOf(b) !== 'auto' || t.needs_review === true
}

/**
 * The board in mode `m`. Tasks already in "review" stay there (going to "auto" does not merge
 * them); the new mode applies to tasks that finish from now on.
 */
export function setMode(b: Board, m: SymccMode): Board {
  return { ...b, mode: isMode(m) ? m : 'auto' }
}

/** The short name of a mode, as shown at a glance: "off", "review merge", "auto". */
export const MODE_NAME: Record<SymccMode, string> = { off: 'off', review: 'review merge', auto: 'auto' }
const MODE_ICON: Record<SymccMode, string> = { off: '⏹', review: '⏸', auto: '⏵' }

/** The label for a mode, in the panel banner and at the start of the status line: "⏹ off", "⏸ review merge", "⏵ auto". */
export const MODE_LABEL: Record<SymccMode, string> = { off: `${MODE_ICON.off} ${MODE_NAME.off}`, review: `${MODE_ICON.review} ${MODE_NAME.review}`, auto: `${MODE_ICON.auto} ${MODE_NAME.auto}` }
export const modeLabel = (m: SymccMode): string => MODE_LABEL[isMode(m) ? m : 'auto']

/** The mode the panel's m button switches to: review and auto swap; off goes to review. */
export const nextMode = (m: SymccMode): SymccMode => (modeOf({ mode: m }) === 'review' ? 'auto' : 'review')

/** The panel's m button: "[m] review merge" in auto (and off), "[m] auto" in review. */
export const modeButton = (m: SymccMode): string => `[m] ${MODE_NAME[nextMode(m)]}`

/** What a mode means, in a few words. */
export const MODE_MEANING: Record<SymccMode, string> = {
  off: 'no work runs; tasks in review can still be approved or rejected',
  review: 'work runs; finished tasks wait for your approve or reject',
  auto: 'work runs; finished tasks that pass merge on their own',
}

/** The one line shown for a mode: "⏵ auto: work runs; finished tasks that pass merge on their own". */
export const modeText = (m: SymccMode): string => `${modeLabel(m)}: ${MODE_MEANING[isMode(m) ? m : 'auto']}`

/** Task `id`, which must be in "review" for approve / reject; throws otherwise. */
export function reviewTask(b: Board, id: string, what: 'approve' | 'reject'): BoardTask {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (t.status !== 'review') throw new Error(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}); only a task in review can be ${what === 'approve' ? 'approved' : 'rejected'}`)
  return t
}

/**
 * The owner rejected task `id` (in "review") because of `reason`: it goes back to "todo" with the
 * reason in its note and history, so the next worker sees it; its test retries start over.
 */
export function rejectTask(b: Board, id: string, reason: string, now: string): Board {
  const t = reviewTask(b, id, 'reject')
  const why = clean(reason, 1000)
  if (!why) throw new Error('give a reason for rejecting, so the next worker knows what to fix')
  return patchTask(b, t.id, { status: 'todo', note: `rejected: ${why.slice(0, 280)}`, test_tries: 0, test_output: undefined, merge_main: false, history: [...t.history, `try ${t.attempts}: rejected by the owner: ${why}`] }, now)
}

// ---------------- looking at a task's changes (review) ----------------

/** One changed file from `git diff --stat`: its path, lines added and removed, or binary. */
export type DiffFile = { file: string; added: number; removed: number; binary?: boolean }

/** Strips git's quoting of an unusual path ("a b\".txt" → a b".txt). */
const unquote = (s: string) => (/^".*"$/.test(s) ? s.slice(1, -1).replace(/\\(.)/g, '$1') : s)

/**
 * The rows of `git diff --stat` output (run with --no-renames): one per file. The +/- counts come
 * from the bar; when git shrank the bar to fit, they are scaled back to the total it gives.
 * The summary line ("2 files changed, ...") and anything else is skipped.
 */
export function parseDiffStat(text: string): DiffFile[] {
  const out: DiffFile[] = []
  for (const line of String(text ?? '').split('\n')) {
    const m = /^\s*(.+?)\s+\|\s+(.*)$/.exec(line)
    if (!m) continue
    const file = unquote(m[1]!.trim())
    const rest = m[2]!.trim()
    if (/^Bin\b/.test(rest)) {
      out.push({ file, added: 0, removed: 0, binary: true })
      continue
    }
    const n = /^(\d+)\s*(\+*)(-*)$/.exec(rest)
    if (!n) continue
    const total = Number(n[1])
    const plus = n[2]!.length
    const minus = n[3]!.length
    const bar = plus + minus
    const added = bar === 0 ? 0 : bar === total ? plus : Math.round((total * plus) / bar)
    out.push({ file, added, removed: bar === 0 ? 0 : total - added })
  }
  return out
}

/** A file row's short count: "+12 -3", "binary". */
export const statCount = (f: DiffFile) => (f.binary ? 'binary' : `+${f.added} -${f.removed}`)

/** How many diff lines the board panel shows before cutting. */
export const DIFF_LINES = 400

/**
 * A diff cut to its first `max` lines; when longer, a last line says how many more there are
 * and where to see them: "… 340 more lines (see /symcc-diff T-5)". `file` goes into that hint.
 */
export function cutDiff(text: string, id: string, max = DIFF_LINES, file = '', name: string = DEFAULT_NAME): string[] {
  const lines = String(text ?? '').replace(/\n+$/, '').split('\n')
  if (lines.length === 1 && !lines[0]) return []
  if (lines.length <= max) return lines
  const more = lines.length - max
  return [...lines.slice(0, max), `… ${more} more ${more === 1 ? 'line' : 'lines'} (see /${name}-diff ${id}${file ? ` ${file}` : ''})`]
}

/** What a diff line is: an added or removed line, a hunk start (@@), a file header, a cut note, or context. */
export type DiffKind = 'add' | 'remove' | 'hunk' | 'header' | 'note' | 'context'

/**
 * The kind of each line of a unified diff. Lines between "diff --git" and the first "@@" are
 * headers (so "--- a/x" and "+++ b/x" are not taken for removed and added lines).
 */
export function diffKinds(lines: string[]): DiffKind[] {
  let inHeader = false
  return lines.map(l => {
    if (l.startsWith('diff --git ') || l.startsWith('diff --cc ')) return ((inHeader = true), 'header')
    if (l.startsWith('@@')) return ((inHeader = false), 'hunk')
    if (/^… \d+ more lines?\b/.test(l)) return 'note'
    if (inHeader) return 'header'
    if (l.startsWith('+')) return 'add'
    if (l.startsWith('-')) return 'remove'
    return 'context'
  })
}

/** The theme color for each kind of diff line: added in the success color, removed in the error color. */
export const DIFF_COLOR: Record<DiffKind, string> = { add: 'success', remove: 'error', hunk: 'ide', header: 'subtle', note: 'warning', context: 'text' }
