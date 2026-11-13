// Board titles, the status line, the banner at the top of the panel, and the board as text.
import type { SymccMode, SymccStatus, SymccTask } from '../../types'
import { DEFAULT_NAME, ICON, ICON_ART, namesFor } from '../name'
import { type Board, modeOf, STATUS_WORD } from './board-file'
import { boardSections, type BoardSections, groupLabel, localOffset } from './days'
import { fromText } from './origin'
import { modeLabel, modeText } from './review'
import { roleMark } from './roles'
import { archivedLine, archivedNote, archivedOf } from './archive'
import { boardTotal, fmtTotal, totalLine } from './runs'

/** The project's folder name, the last part of a path: "/Users/me/repositories/app" → "app". */
export function folderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? ''
}

/** A path with the home folder shortened to "~": "/Users/me/x" → "~/x". */
export function shortHome(path: string, home?: string): string {
  const h = (home ?? '').replace(/\/+$/, '')
  if (!h) return path
  if (path === h) return '~'
  return path.startsWith(h + '/') ? '~' + path.slice(h.length) : path
}

/** "<icon> <name> board": the bold, colored part of a title (ICON from name.ts, then namesFor(name).boardName). */
export const boardBrand = (name: string = DEFAULT_NAME) => `${ICON} ${namesFor(name).boardName}`
/** " · <folder>": the dimmed project part of a title, or '' when the folder is unknown. */
export const boardWhere = (root: string) => (folderName(root) ? ` · ${folderName(root)}` : '')
/** The board's title: "<icon> <name> board · <folder>", or just "<icon> <name> board" when the folder is unknown. */
export const boardTitle = (root: string, name: string = DEFAULT_NAME) => `${boardBrand(name)}${boardWhere(root)}`
/** The status line label, without the mark (Claude Code adds its own): "<name> board · <folder>". */
export const boardLabel = (root: string, name: string = DEFAULT_NAME) => `${namesFor(name).boardName}${boardWhere(root)}`

/**
 * The status line text. Claude Code already puts the plugin name in front, so this starts with
 * just the folder: "app · 1 doing · 2 to do", "app (driven by another session) · empty".
 * undefined when there is nothing to say (the status is cleared).
 */
/** At most this many task IDs are listed for one state in the status line; the rest show as "+N". */
export const STATUS_IDS = 3

/** "T-1, T-2, T-3 +2" for the first STATUS_IDS IDs. */
function idList(ids: string[]): string {
  const shown = ids.slice(0, STATUS_IDS).join(', ')
  return ids.length > STATUS_IDS ? `${shown} +${ids.length - STATUS_IDS}` : shown
}

/**
 * The short status text Claude Code shows after "symcc:", e.g. "⏸ review merge · T-26, T-27 doing · 1 to review (T-5) · 2 to do".
 * It starts with the board mode (modeLabel: "⏹ off", "⏸ review merge", "⏵ auto"), so the mode is always in the same spot.
 * Tasks being done, in review and failed are listed by ID; other open states are counts. No folder name (the pane title has it).
 * undefined when there is nothing to say: an empty board this session drives, in mode auto, with no branch note.
 */
export function statusLine(b: { tasks: Pick<SymccTask, 'id' | 'status'>[] }, driving: boolean, branch_note = '', mode: SymccMode = 'auto'): string | undefined {
  const join = (xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' · ')
  const ids = (st: SymccStatus) => b.tasks.filter(t => t.status === st).map(t => t.id)
  const other = driving ? '' : ' (driven by another session)'
  const m = modeOf({ mode })
  const label = modeLabel(m)
  if (b.tasks.length) {
    const doing = ids('doing'), review = ids('review'), failed = ids('failed')
    const parts = [
      doing.length && `${idList(doing)} ${STATUS_WORD.doing}`,
      review.length && `${review.length} to review (${idList(review)})`,
      ...statusCounts(b.tasks, ['todo', 'paused', 'waiting']),
      failed.length && `${failed.length} ${STATUS_WORD.failed} (${idList(failed)})`,
    ].filter((x): x is string => !!x)
    // backlog stays out of the line, except when it is all that is left: then say so, so parked ideas aren't hidden
    const parked = ids('backlog').length
    return join([label, (join(parts) || (parked ? `all done · ${parked} in backlog` : 'all done')) + other, branch_note])
  }
  if (!driving) return join([label, 'empty' + other, branch_note])
  // an empty board in mode auto stays quiet, so a fresh project shows nothing
  if (m !== 'auto') return join([label, branch_note])
  return branch_note || undefined
}

// ---------------- the banner at the top of the board panel ----------------

/** Below this many columns the drawing is dropped and only the text lines are shown. */
export const BANNER_NARROW = 50
/** How a piece of banner text is drawn: accent (the 'ide' theme color), plain, dim or warning. */
export type BannerTone = 'accent' | 'plain' | 'dim' | 'warning'
export type BannerPart = { text: string; tone: BannerTone; bold?: boolean }
/** One banner line: the drawing part on the left ('' or spaces when none) and the text beside it. */
export type BannerLine = { art: string; parts: BannerPart[] }
/** What the banner needs from the board. */
/** `branch_note`: a warning about the branch (see branchWarning, missingBranchText), shown in place of the branch name. */
export type BannerBoard = Pick<Board, 'test_commands' | 'target_branch' | 'max_parallel' | 'max_minutes' | 'auto_retries'> & Partial<Pick<Board, 'archived'>> & { tasks: Pick<SymccTask, 'status' | 'runs'>[]; branch_note?: string }

/** "2 doing", "1 to do", ... for each status in `order` that has tasks, in that order. */
export function statusCounts(tasks: Pick<SymccTask, 'status'>[], order: SymccStatus[]): string[] {
  return order.map(st => [tasks.filter(t => t.status === st).length, STATUS_WORD[st]] as const).filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`)
}

const BANNER_ORDER: SymccStatus[] = ['doing', 'review', 'waiting', 'failed', 'paused', 'todo', 'backlog', 'done']

/** Cuts parts so their text fits in `room` columns, ending with "…" when something was cut. */
function cutParts(parts: BannerPart[], room: number): BannerPart[] {
  const len = parts.reduce((s, p) => s + p.text.length, 0)
  if (len <= room) return parts
  const out: BannerPart[] = []
  let left = Math.max(0, room - 1)
  for (const p of parts) {
    if (left <= 0) break
    out.push({ ...p, text: p.text.slice(0, left) })
    left -= p.text.length
  }
  if (room > 0) out.push({ text: '…', tone: out[out.length - 1]?.tone ?? 'dim' })
  return out
}

/**
 * The banner lines for the board panel: the name and folder, where and who drives, the
 * settings, and (when there are tasks) the counts and total. With `width` of at least
 * BANNER_NARROW the drawing sits on the left; narrower, only the text, cut to fit.
 * The separator under it is `bannerRule(width)`.
 */
export function bannerLines(b: BannerBoard, root: string, home: string, driving: boolean, width: number, nowMs?: number, name: string = DEFAULT_NAME): BannerLine[] {
  const sep: BannerPart = { text: ' · ', tone: 'dim' }
  const join = (groups: BannerPart[][]) => groups.flatMap((g, i) => (i ? [sep, ...g] : g))
  const dim = (text: string): BannerPart[] => [{ text, tone: 'dim' }]
  const folder = folderName(root)
  const l1: BannerPart[] = [{ text: namesFor(name).boardName, tone: 'accent', bold: true }, ...(folder ? [{ text: ` · ${folder}`, tone: 'plain' as const }] : [])]
  const l2 = join([
    ...(root ? [dim(shortHome(root, home))] : []),
    b.branch_note ? [{ text: b.branch_note, tone: 'warning' as const }] : dim(b.target_branch),
    dim(driving ? 'this session drives' : 'driven by another session'),
  ])
  const l3 = join([
    b.test_commands.length ? dim(`tests: ${b.test_commands.join(' && ')}`) : [{ text: 'no test command', tone: 'warning' as const }],
    dim(`${b.max_parallel} at once`),
    dim(`${b.max_minutes} min`),
    dim(`${b.auto_retries} ${b.auto_retries === 1 ? 'retry' : 'retries'}`),
  ])
  const texts = [l1, l2, l3]
  const gone = archivedOf(b).done
  if (b.tasks.length || gone) {
    const counts = statusCounts(b.tasks, BANNER_ORDER).map(c => c.replace(/^(\d+) backlog$/, '$1 in backlog').replace(/^(\d+) done$/, `$1 done${gone ? ` ${archivedNote(gone)}` : ''}`))
    if (gone && !b.tasks.some(t => t.status === 'done')) counts.push(`${gone} done (archived)`)
    const t = boardTotal(b, nowMs)
    texts.push(dim([...counts, ...(t.tries ? [fmtTotal(t)] : [])].join(' · ')))
  }
  const w = Math.max(1, Math.floor(width))
  const wide = w >= BANNER_NARROW
  // The three fixed lines sit beside the drawing; the drawing's lower lines (the clef's hook)
  // stand alone, and the counts line goes under the drawing, from the left edge, so it keeps the full width.
  if (wide) texts.splice(3, 0, ...Array.from({ length: Math.max(0, ICON_ART.length - 3) }, () => [] as BannerPart[]))
  return texts.map((parts, i) => {
    const art = wide && ICON_ART[i] ? `${ICON_ART[i]}  ` : ''
    return { art, parts: cutParts(parts, w - art.length) }
  })
}

/** The strong separator under the banner and tabs, as wide as the panel's body (drawn in the accent color). */
export const bannerRule = (width: number) => '━'.repeat(Math.max(1, Math.floor(width)))

/** The light dotted break inside the list, under the Backlog section (drawn in the subtle color). */
export const listRule = (width: number) => '┄'.repeat(Math.max(1, Math.floor(width)))

/** A banner line as plain text (for tests and plain output). */
export const bannerText = (l: BannerLine) => l.art + l.parts.map(p => p.text).join('')

/** One line per task for the model and for /<name> (with a short "from:" line under it, see fromText), then the total time (and cost) of all tries.
 *  With `where` (the project's path), that comes first so you can tell boards apart.
 *  Open tasks come first, then the backlog, then today's others; finished tasks of older days are one line per
 *  day (see boardSections), seen from `nowMs` in time zone `offsetMin`. Without `nowMs`, every task is listed. */
export function boardText(b: Board, nowMs?: number, where?: string, name: string = DEFAULT_NAME, offsetMin: number = localOffset(nowMs)): string {
  const top = where ? [`${boardBrand(name)} · ${where}`] : []
  const gone = archivedLine(b, name)
  if (!b.tasks.length) return [...top, 'The board is empty.', ...(gone ? [gone] : [])].join('\n')
  const s: BoardSections = nowMs === undefined ? boardSections(b.tasks, NaN, offsetMin) : boardSections(b.tasks, nowMs, offsetMin)
  const rows = [...s.open, ...s.backlog, ...s.today]
  const lines = rows.map(t => {
    const extra = t.status === 'waiting' && t.question ? ` — asks: ${t.question}` : t.note ? ` — ${t.note}` : t.status === 'review' ? ` — ${STATUS_WORD.review}` : ''
    const after = t.after.length && (t.status === 'todo' || t.status === 'backlog') ? ` (after ${t.after.join(', ')})` : ''
    const role = roleMark(t) ? ` [${roleMark(t)}]` : ''
    return [`${t.id.padEnd(5)} ${t.status.padEnd(7)} ${t.title}${role}${after}${extra}`, `${' '.repeat(14)}${fromText(t)}`]
  }).flat()
  const head = `${modeText(modeOf(b))} · tests: ${b.test_commands.join(' && ') || 'none set'} · up to ${b.max_parallel} at once · a worker may run ${b.max_minutes} min · ${b.auto_retries} auto retries on failing tests`
  const total = totalLine(b, nowMs)
  const days = s.days.map(g => groupLabel(g))
  return [...top, head, ...lines, ...days, ...(gone ? [gone] : []), ...(total ? [total] : [])].join('\n')
}
