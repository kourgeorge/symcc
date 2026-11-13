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

// ---------------- moving the target branch (the last step of a merge) ----------------

/** One line of `git status --porcelain -z`: its two-letter code ("M ", "??", ...) and path. */
export type StatusEntry = { code: string; path: string }

/** The entries of `git status --porcelain -z` output. For a rename or copy, the new path (the old one is skipped). */
export function parseStatusZ(text: string): StatusEntry[] {
  const parts = String(text ?? '').split('\0')
  const out: StatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i]!
    if (s.length < 4) continue
    const code = s.slice(0, 2)
    out.push({ code, path: s.slice(3) })
    if (code[0] === 'R' || code[0] === 'C') i++
  }
  return out
}

/** Whether a file at `a` and one at `b` are in each other's way: the same path, or one is a folder holding the other. */
const clashes = (a: string, b: string) => {
  const x = a.replace(/\/+$/, '')
  const y = b.replace(/\/+$/, '')
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)
}

/**
 * What stops a merge from updating the owner's files, from
 * `git status --porcelain -z --untracked-files=all --ignored=matching`:
 * `dirty`, their uncommitted changes to tracked files; `untracked` and `ignored`, their untracked
 * and git-ignored files that the merge (`incoming`: the paths it changes) would create or overwrite.
 * Ignored files the merge doesn't touch (node_modules/ and the like) never count, and neither do
 * paths under `skipDir/` (the board).
 */
export function mergeBlockers(statusZ: string, incoming: readonly string[], skipDir: string): { dirty: string[]; untracked: string[]; ignored: string[] } {
  const dirty: string[] = []
  const untracked: string[] = []
  const ignored: string[] = []
  for (const e of parseStatusZ(statusZ)) {
    if (skipDir && (e.path === skipDir || e.path === `${skipDir}/` || e.path.startsWith(`${skipDir}/`))) continue
    if (e.code === '??' || e.code === '!!') {
      if (incoming.some(f => clashes(f, e.path))) (e.code === '!!' ? ignored : untracked).push(e.path)
    } else dirty.push(e.path)
  }
  return { dirty, untracked, ignored }
}

/** A path made safe to show: control characters (newlines, terminal escapes) become "?". */
const shown = (p: string) => p.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?')

/** A short list of files: "a, b, c and 4 more". */
const fileList = (files: readonly string[], n = 5) => {
  const f = files.map(shown)
  return f.length > n ? `${f.slice(0, n).join(', ')} and ${f.length - n} more` : f.join(', ')
}

/** Why a merge waits for the owner, or '' when nothing stops it. */
export function blockedText(target: string, id: string, b: { dirty: readonly string[]; untracked: readonly string[]; ignored?: readonly string[] }): string {
  if (b.dirty.length) return `you have uncommitted changes on ${target}; commit or stash them, then say "retry ${id}"`
  if (b.untracked.length) return `you have untracked files on ${target} that ${id} would overwrite (${fileList(b.untracked)}); move, rename or commit them, then say "retry ${id}"`
  if (b.ignored?.length) return `you have git-ignored files on ${target} that ${id} would overwrite (${fileList(b.ignored)}); move or rename them, then say "retry ${id}"`
  return ''
}

/** Runs one git command in the owner's folder. */
export type GitRun = (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

/** The first line of git's error output, cut short. */
const gitError = (r: { stdout: string; stderr: string }) => `${r.stderr}\n${r.stdout}`.split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 200) ?? 'git failed'

/**
 * Moves `target` from commit `from` to `to` (compare-and-swap). When the owner has `target`
 * checked out (`checkedOut`), their files are updated too, but never over their uncommitted
 * changes or untracked or git-ignored files the merge would overwrite: then it waits and says why. If updating
 * the files fails after the branch moved, the branch is put back, so the owner's folder is left as it was.
 * `ok` only when the branch moved and (if checked out) the files were updated.
 */
export async function moveTarget(run: GitRun, o: { target: string; id: string; from: string; to: string; checkedOut: boolean; note: string; skipDir: string }): Promise<{ ok: boolean; detail: string }> {
  const ref = `refs/heads/${o.target}`
  if (o.checkedOut) {
    const diff = await run(['diff', '--name-only', '--no-renames', '-z', o.from, o.to])
    if (diff.exitCode !== 0) return { ok: false, detail: `could not list the changes to merge: ${gitError(diff)}` }
    // --ignored=matching lists git-ignored files too (an ignored folder as one entry, not every
    // file in it): read-tree overwrites ignored files without a word, so they must be checked here.
    const st = await run(['status', '--porcelain', '-z', '--untracked-files=all', '--ignored=matching'])
    if (st.exitCode !== 0) return { ok: false, detail: `could not check your files on ${o.target}: ${gitError(st)}` }
    const why = blockedText(o.target, o.id, mergeBlockers(st.stdout, diff.stdout.split('\0').filter(Boolean), o.skipDir))
    if (why) return { ok: false, detail: why }
    // A dry run catches anything else that would stop the update, before the branch moves.
    const dry = await run(['read-tree', '-n', '-m', '-u', o.from, o.to])
    if (dry.exitCode !== 0) return { ok: false, detail: `your files on ${o.target} can't be updated (${gitError(dry)}); fix that, then say "retry ${o.id}"` }
  }
  const cas = await run(['update-ref', '-m', o.note, ref, o.to, o.from])
  if (cas.exitCode !== 0) return { ok: false, detail: `${o.target} moved during the merge; try again` }
  if (!o.checkedOut) return { ok: true, detail: '' }
  const rt = await run(['read-tree', '-m', '-u', o.from, o.to])
  if (rt.exitCode === 0) return { ok: true, detail: '' }
  const back = await run(['update-ref', '-m', `${o.note} (undone)`, ref, o.from, o.to])
  const after = back.exitCode === 0 ? `${o.target} is back where it was and your files are unchanged` : `and putting ${o.target} back failed too (${gitError(back)}); run "git reset --soft ${o.from.slice(0, 12)}" on ${o.target} to undo it`
  return { ok: false, detail: `not merged: your files on ${o.target} could not be updated (${gitError(rt)}); ${after}. Fix that, then say "retry ${o.id}"` }
}
