// The task page: its labelled rows and wrapping them to the panel width.
import type { SymccStatus, SymccTask } from '../../types'
import { STATUS_WORD } from './board-file'
import { shortSha, taskCommits } from './commits'
import { originOf } from './origin'
import { findRole, type RoleDef, roleOf } from './roles'
import { fmtTotal, sumRuns } from './runs'
import { squash } from './text'

/** A piece of text on the task page with its theme color name (see C() in plugin/ui/parts.tsx). */
export type Seg = { text: string; color: string; bold?: boolean; italic?: boolean }
/** One labelled row on the task page ("Role:", "From:", …); a row with an empty label continues the one above. */
export type DetailRow = { label: string; segs: Seg[] }

/** The status badge colors on the task page: doing blue, review and waiting yellow, done green, failed red, the rest dim. */
export const STATUS_BADGE: Record<SymccStatus, string> = { backlog: 'subtle', todo: 'subtle', doing: 'ide', review: 'warning', waiting: 'warning', paused: 'suggestion', failed: 'error', done: 'success', dropped: 'subtle' }
export const STATUS_MARK: Record<SymccStatus, string> = { backlog: '◇', review: '◆', waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }

/** Who a task came from, with its own color: the owner, scout NAME, T-x (split), the lead; "unknown" for old tasks. */
export function originSegs(t: { origin?: unknown }): Seg[] {
  const o = originOf(t)
  if (!o) return [{ text: 'unknown', color: 'subtle' }, { text: ' (made before origins were kept)', color: 'subtle' }]
  const how = o.how ?? (o.by === 'worker' ? 'worker report' : '')
  const taskPart: Seg[] = o.task ? [{ text: o.task, color: 'claude', bold: true }, ...(how ? [{ text: ` (${how})`, color: 'subtle' }] : [])] : []
  const then = (who: Seg[]) => (taskPart.length ? [...who, { text: ', ', color: 'subtle' }, ...taskPart] : who)
  if (o.by === 'owner') return then([{ text: 'owner', color: 'claude', bold: true }])
  if (o.by === 'scout') return then([{ text: `scout ${o.scout || '?'}`, color: 'suggestion', bold: true }])
  if (o.by === 'lead' && o.task && !o.how) return [{ text: 'lead', color: 'success', bold: true }, { text: ', about ', color: 'subtle' }, ...taskPart]
  if (taskPart.length) return taskPart
  return [{ text: 'lead', color: 'success', bold: true }]
}

/**
 * The labelled rows of the task page, in order: Status, Note, Role, From, Why, Request, Seen, Files, After, Research, Branch, Commits, Tries.
 * `when` turns an ISO time into a short date; `all` finds the tasks this one waits for.
 */
export function detailRows(t: SymccTask, o: { roles: RoleDef[]; all: SymccTask[]; when: (iso: string) => string; nowMs: number; archivedDone?: string[] }): DetailRow[] {
  const R: DetailRow[] = []
  R.push({ label: 'Status', segs: [{ text: `${STATUS_MARK[t.status]} ${STATUS_WORD[t.status]}`, color: STATUS_BADGE[t.status], bold: true }, { text: ` · added ${o.when(t.created_at)} · changed ${o.when(t.updated_at)}`, color: 'subtle' }] })
  if (t.note) R.push({ label: 'Note', segs: [{ text: t.note, color: 'subtle', italic: true }] })
  const name = roleOf(t)
  const r = findRole(o.roles, name)
  const more = [r?.description, r?.model ? `model ${r.model}` : ''].filter(Boolean).join(' · ')
  R.push({ label: 'Role', segs: [{ text: r?.name ?? name, color: 'ide', bold: true }, ...(more ? [{ text: ` — ${more}`, color: 'subtle' }] : [])] })
  R.push({ label: 'From', segs: originSegs(t) })
  const og = originOf(t)
  if (og?.why) R.push({ label: 'Why', segs: [{ text: squash(og.why), color: 'text' }] })
  if (og?.by === 'owner' && og.request?.trim()) R.push({ label: 'Request', segs: [{ text: `“${squash(og.request)}”`, color: 'text', italic: true }] })
  if (og?.evidence) R.push({ label: 'Seen', segs: [{ text: squash(og.evidence), color: 'subtle' }] })
  R.push({ label: 'Files', segs: t.files.length ? t.files.flatMap((f, i) => [...(i ? [{ text: ', ', color: 'subtle' }] : []), { text: f, color: 'autoAccept' }]) : [{ text: 'anywhere in the project', color: 'subtle' }] })
  t.after.forEach((id, i) => {
    const dep = o.all.find(x => x.id === id)
    // a done task moved to archive.json counts as done
    const gone = !dep && (o.archivedDone ?? []).includes(id)
    const state: Seg = dep ? { text: `${STATUS_MARK[dep.status]} ${STATUS_WORD[dep.status]}`, color: STATUS_BADGE[dep.status] } : gone ? { text: `${STATUS_MARK.done} ${STATUS_WORD.done} (archived)`, color: STATUS_BADGE.done } : { text: 'missing', color: 'error' }
    R.push({
      label: i ? '' : 'After',
      segs: [{ text: id, color: 'claude', bold: true }, { text: ' ', color: 'text' }, state, ...(dep ? [{ text: ` · ${dep.title}`, color: 'subtle' }] : [])],
    })
  })
  // research notes the merged work added or changed (docs/research/…), one row each
  const notes = t.research_notes ?? []
  notes.forEach((f, i) => R.push({ label: i ? '' : 'Research', segs: [{ text: f, color: 'autoAccept' }] }))
  if (t.branch) R.push({ label: 'Branch', segs: [{ text: t.branch, color: 'ide' }] })
  const commits = taskCommits(t)
  if (commits.length) {
    R.push({
      label: 'Commits',
      segs: commits.flatMap((c, i) => [
        ...(i ? [{ text: ', ', color: 'subtle' }] : []),
        { text: shortSha(c.sha), color: c.merged ? 'success' : 'ide', bold: c.merged },
        ...(c.merged ? [{ text: ' (merged)', color: 'success' }] : c.try ? [{ text: ` (try ${c.try})`, color: 'subtle' }] : []),
      ]),
    })
  }
  const tries: Seg[] = [{ text: `${t.attempts} ${t.attempts === 1 ? 'try' : 'tries'}`, color: t.attempts > 2 ? 'warning' : 'text', bold: t.attempts > 2 }]
  if (t.runs?.length) tries.push({ text: ` · ${fmtTotal(sumRuns(t.runs, o.nowMs))}`, color: 'subtle' })
  R.push({ label: 'Tries', segs: tries })
  return R
}

/** The width of the label column on the task page: the longest label, its colon and a space. */
export const DETAIL_LABEL_WIDTH = 'Research: '.length

/**
 * Splits colored text into lines of at most `width` characters, breaking between words
 * (a word longer than a line is cut). Spaces at a line break are dropped.
 */
export function wrapSegs(segs: Seg[], width: number): Seg[][] {
  const w = Math.max(1, width)
  const lines: Seg[][] = []
  let line: Seg[] = []
  let len = 0
  const add = (s: Seg, text: string) => {
    const last = line[line.length - 1]
    if (last && last.color === s.color && !!last.bold === !!s.bold && !!last.italic === !!s.italic) last.text += text
    else line.push({ ...s, text })
    len += text.length
  }
  const breakLine = () => {
    const last = line[line.length - 1]
    if (last) last.text = last.text.trimEnd()
    lines.push(line.filter(s => s.text))
    line = []
    len = 0
  }
  for (const s of segs) {
    for (const tok of s.text.replace(/\s+/g, ' ').match(/ +|[^ ]+/g) ?? []) {
      if (tok.startsWith(' ')) {
        if (len && len + 1 <= w) add(s, ' ')
        continue
      }
      let word = tok
      if (len && len + word.length > w) breakLine()
      while (word.length > w) {
        add(s, word.slice(0, w))
        word = word.slice(w)
        breakLine()
      }
      if (word) add(s, word)
    }
  }
  if (line.length || !lines.length) breakLine()
  return lines
}

/** A labelled row as lines of colored text within `width`: the label (padded) on the first line, spaces under it after. */
export function detailRowLines(row: DetailRow, width: number): Seg[][] {
  const pad = DETAIL_LABEL_WIDTH
  return wrapSegs(row.segs, Math.max(12, width - pad)).map((l, i) => [{ text: (i === 0 && row.label ? `${row.label}:` : '').padEnd(pad), color: 'text', bold: true }, ...l])
}
