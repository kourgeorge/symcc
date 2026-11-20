// The task page's sections (T-580), as plain data: what the Claude Code terminal's task page shows under its title and
// buttons, in its order and with its headings: ▍Why it failed, ▍Answer, ▍Details, ▍Changes, ▍What to do, ▍History,
// ▍Report and ▍Runs (time and cost). Each section is lines of colored pieces (Seg), some with what a press or click on
// them does (a changed file opens its diff). The terminal (hooks/claude/ui/task-page.tsx) and OpenCode's panel
// (hooks/opencode/board-view.ts) draw them; VS Code's card (vscode-task.tsx) takes their contents but keeps its own
// layout. Nothing here reads a file: the report texts and the changed files come in as facts.
import type { SymccTask } from '../../types'
import { type Seg, detailRows, detailRowLines, wrapSegs, showsAnswer, answerText } from './details'
import type { BoardTask } from './board-file'
import { isAnswered } from './task'
import { taskReports } from './reports'
import { whyFailed, failNext, failAsks } from './failure'
import { historyEvent, historyTime, HISTORY_COLOR } from './history'
import { fmtRun, fmtTotal, sumRuns } from './runs'
import { type DiffFile, YOUR_EDITS } from './review'

/** The sections, in the page's order. */
export type TaskSectionId = 'why' | 'answer' | 'details' | 'changes' | 'what' | 'history' | 'report' | 'runs'

/** What a press on a line does: show a changed file's diff. */
export type SectionAction = { diff: string }

/**
 * One line of a section: its colored pieces ([] = an empty line), what a press on it does, and for drawing: a stable
 * `key`, and `plain` when its pieces share one look and are drawn as one text (not wrapped).
 */
export type SectionLine = { segs: Seg[]; action?: SectionAction; key?: string; plain?: boolean }

/** A section: its id, its heading (without the "▍"), its lines, and for the report its tries to pick from. */
export type TaskSection = { id: TaskSectionId; title: string; lines: SectionLine[]; tries?: { try: number; shown: boolean; key?: string }[] }

/** What the sections need besides the task. */
export type TaskSectionFacts = {
  /** the page's width: lines are wrapped to it */
  width: number
  nowMs: number
  /** what detailRows needs for the Details rows */
  detail: Omit<Parameters<typeof detailRows>[1], 'nowMs'>
  /** the report texts read so far, by file (null: it can't be read; left out: not read) */
  texts?: Record<string, string | null | undefined>
  /** the report try picked by the owner (default: the latest) */
  shownTry?: number
  /** a task in review's changed files, or why they can't be read (left out: not known) */
  changes?: { files: DiffFile[]; error: string } | null
  /** the branch its changes are against */
  target?: string
  /** the data folder, as the page names the task's own folder under it (".symcc": ".symcc/worktrees/T-3") */
  dataDir?: string
  /** the number keys answer a question, so the report's tries get none */
  numberKeysTaken?: boolean
}

/** The text of `file` among the facts: null when it can't be read or was not read. */
const textOf = (f: TaskSectionFacts, file: string | undefined): string | null => (file ? (f.texts?.[file] ?? null) : null)

/** Text wrapped under two spaces, one line per wrapped line; an empty line of it becomes an empty line. */
function indented(text: string, color: string, width: number, key: string): SectionLine[] {
  return text.split('\n').flatMap((l, i) =>
    l.trim() ? wrapSegs([{ text: l, color }], Math.max(12, width - 2)).map((w, j) => ({ segs: [{ text: '  ', color: 'text' }, ...w], key: `${key}-${i}-${j}` })) : [{ segs: [], key: `${key}-${i}` }],
  )
}

/** Pieces of one color as one line (not wrapped). */
const plainLine = (text: string | string[], color: string, extra: Partial<SectionLine> & { bold?: boolean } = {}): SectionLine => {
  const { bold, ...rest } = extra
  return { segs: (typeof text === 'string' ? [text] : text).map(x => ({ text: x, color, ...(bold ? { bold } : {}) })), plain: true, ...rest }
}

/** Text with task ids, `code` and file paths picked out in color (as the terminal's details are drawn). */
export function richSegs(text: string, base = 'text'): Seg[] {
  const parts = text.split(/(\bT-\d+\b|`[^`\n]+`|(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:md|ts|tsx|js|json|py|txt|csv|yml|yaml)\b)/g)
  return parts.flatMap((p, i): Seg[] =>
    !p ? [] : i % 2 === 0 ? [{ text: p, color: base }] : /^T-\d+$/.test(p) ? [{ text: p, color: 'claude', bold: true }] : p.startsWith('`') ? [{ text: p.slice(1, -1), color: 'ide' }] : [{ text: p, color: 'autoAccept' }],
  )
}

/** A task's details ("What to do") line by line, wrapped to `width`: headings, bullets and numbered steps stand out. */
export function detailsLines(text: string, width: number): SectionLine[] {
  const w = Math.max(12, width)
  return text.split('\n').flatMap((line, i): SectionLine[] => {
    if (!line.trim()) return [{ segs: [] }]
    const head = /^\s*#{1,6}\s+(.*)$/.exec(line)
    if (head) return wrapSegs([{ text: head[1]!, color: 'claude', bold: true }], w).map(segs => ({ segs }))
    const li = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(line)
    const kv = li ? null : /^(\s*)([A-Z][\w ]{1,30}):\s+(.*)$/.exec(line)
    const front: Seg[] = li ? [{ text: li[1]!, color: 'text' }, { text: /\d/.test(li[2]!) ? li[2]! : '•', color: 'claude' }, { text: ' ', color: 'text' }] : kv ? [{ text: kv[1]!, color: 'text' }, { text: `${kv[2]}:`, color: 'text', bold: true }, { text: ' ', color: 'text' }] : []
    const rest = li ? li[3]! : kv ? kv[3]! : line
    const lead = front.map(s => s.text).join('').length
    return wrapSegs(richSegs(rest), Math.max(8, w - lead)).map((segs, j) => ({ segs: j ? [{ text: ' '.repeat(lead), color: 'text' }, ...segs] : [...front.filter(s => s.text), ...segs], key: `what-${i}-${j}` }))
  })
}

/** The heading of a task in review's Changes section: how many files, against which branch, and whether the owner's edits are in. */
export const changesTitle = (files: readonly DiffFile[], target: string) =>
  `Changes (${files.length} ${files.length === 1 ? 'file' : 'files'}, against ${target})${files.some(f => f.edited) ? ` ${YOUR_EDITS}` : ''}`

/** A changed file's line: its name (padded to `width`), +added -removed (or "binary"), and "edited by you". */
export function changedFileSegs(f: DiffFile, width: number): Seg[] {
  return [
    { text: f.file.padEnd(width), color: 'autoAccept' },
    ...(f.binary ? [{ text: '  binary', color: 'inactive' }] : [{ text: '  ', color: 'text' }, { text: `+${f.added}`, color: 'success' }, { text: ' ', color: 'text' }, { text: `-${f.removed}`, color: 'error' }]),
    ...(f.edited ? [{ text: '  edited by you', color: 'warning' }] : []),
  ]
}

/** The history as a timeline (T-512), newest first: each event's mark in its tone, when it happened (T-522), its try
 *  label in bold, the words wrapped under the mark with the connector (│) beside them, and a connector line between events. */
export function historyLines(t: Pick<SymccTask, 'history'>, width: number, nowMs: number): SectionLine[] {
  const events = [...t.history].reverse().map(historyEvent)
  return events.flatMap((e, i) => {
    const last = i === events.length - 1
    const at = historyTime(e.at, nowMs)
    const words: Seg[] = [
      ...(at ? [{ text: `${at} `, color: 'inactive' } as Seg] : []),
      ...(e.label ? [{ text: `${e.label}: `, color: 'text', bold: true } as Seg] : []),
      { text: e.said, color: e.tone === 'bad' && !e.result ? 'error' : 'inactive' },
      ...(e.result ? [{ text: ` → ${e.result}`, color: e.tone === 'good' || e.tone === 'bad' ? HISTORY_COLOR[e.tone] : 'text' } as Seg] : []),
    ]
    return [
      ...wrapSegs(words, Math.max(12, width - 2)).map((w, j): SectionLine => ({ segs: [j ? { text: last ? '  ' : '│ ', color: 'inactive' } : { text: `${e.mark} `, color: HISTORY_COLOR[e.tone], bold: true }, ...w], key: `history-${i}-${j}` })),
      ...(last ? [] : [{ segs: [{ text: '│', color: 'inactive' }], key: `history-${i}-line` }]),
    ]
  })
}

/** The task page's sections for task `t`, in order (see the top of this file). */
export function taskSections(t: SymccTask, f: TaskSectionFacts): TaskSection[] {
  const bt = t as BoardTask
  const width = f.width
  const out: TaskSection[] = []
  const reports = taskReports(t)
  const picked = f.shownTry !== undefined ? reports.findIndex(r => r.try === f.shownTry) : -1
  const at = picked >= 0 ? picked : reports.length - 1
  const shown = reports[at]
  const latest = reports[reports.length - 1]
  // A failed task: why (the same sentence as its board row), what the failed try's report asks for, and what to do
  // next. Only the report of the try that failed counts.
  if (t.status === 'failed') {
    const body = latest && latest.try === t.attempts ? textOf(f, latest.file) : null
    const asks = failAsks(body ?? t.history.at(-1)?.text ?? '')
    const under = (text: string, color: string, key: string) => wrapSegs([{ text, color }], Math.max(12, width - 2)).map((w, j): SectionLine => ({ segs: [{ text: '  ', color: 'text' }, ...w], key: `${key}-${j}` }))
    out.push({ id: 'why', title: 'Why it failed', lines: [...under(whyFailed(t), 'text', 'why'), ...(asks ? under(asks, 'warning', 'why-asks') : []), ...under(`Next: ${failNext(t)}`, 'inactive', 'why-next')] })
  }
  // An investigation's answer: the full text from its latest report, else the answer saved on the task.
  const answerShown = showsAnswer(bt)
  if (answerShown) {
    const answer = answerText(bt, textOf(f, latest?.file)).trimEnd()
    out.push({
      id: 'answer',
      title: latest ? `Answer (try ${latest.try})` : 'Answer',
      lines: [
        ...(latest ? [plainLine(['  ', latest.file], 'inactive')] : []),
        ...(answer ? indented(answer, 'text', width, 'answer') : [plainLine('  (no answer saved)', 'inactive')]),
      ],
    })
  }
  out.push({ id: 'details', title: 'Details', lines: detailRows(t, { ...f.detail, nowMs: f.nowMs }).flatMap((r, i) => detailRowLines(r, width).map((segs, j) => ({ segs, key: `row-${i}-${j}` }))) })
  if (t.status === 'review' && !isAnswered(bt) && f.changes) {
    const files = f.changes.files
    const fileWidth = Math.max(4, ...files.map(x => x.file.length))
    out.push({
      id: 'changes',
      title: changesTitle(files, f.target ?? 'main'),
      lines: [
        plainLine(['  folder: ', f.dataDir ?? '.symcc', '/worktrees/', t.id, ' · edit files there, then approve (the tests run again)'], 'inactive'),
        ...(f.changes.error ? [plainLine(`  Could not read the changes: ${f.changes.error}`, 'error')] : []),
        ...(!f.changes.error && !files.length ? [plainLine('  no changes', 'inactive')] : []),
        ...files.map((x): SectionLine => ({ segs: changedFileSegs(x, fileWidth), action: { diff: x.file }, key: `file:${x.file}` })),
        plainLine('  Enter on a file shows its diff · d all files', 'inactive'),
      ],
    })
  }
  out.push({ id: 'what', title: 'What to do', lines: t.details.trim() ? detailsLines(t.details.trimEnd(), width) : [plainLine('(no details)', 'inactive')] })
  if (t.history.length) out.push({ id: 'history', title: `History (${t.history.length}, newest first)`, lines: historyLines(t, width, f.nowMs) })
  // An answered investigation with one try: its report is the Answer above, so it is not shown twice.
  if ((reports.length > 0 || t.attempts > 0) && !(answerShown && latest && reports.length === 1)) {
    const body = shown ? textOf(f, shown.file) : null
    const read = shown ? f.texts?.[shown.file] !== undefined : false
    out.push({
      id: 'report',
      title: shown ? `Report (try ${shown.try}${reports.length > 1 ? `, ${at + 1} of ${reports.length}` : ''})` : 'Report',
      lines: [
        ...(!shown ? [plainLine('  no saved report', 'inactive')] : [plainLine(['  ', shown.file], 'inactive')]),
        ...(shown && !read ? [plainLine('  (reading the report…)', 'inactive')] : []),
        ...(shown && read && body === null ? [plainLine('  Could not read the report file.', 'error')] : []),
        ...(body !== null ? indented(body.trimEnd(), 'text', width, 'report') : []),
      ],
      ...(reports.length > 1 ? { tries: reports.map((r, i) => ({ try: r.try, shown: i === at, ...(r.try <= 9 && !f.numberKeysTaken ? { key: String(r.try) } : {}) })) } : {}),
    })
  }
  if (t.runs?.length)
    out.push({
      id: 'runs',
      title: 'Runs (time and cost)',
      lines: [...t.runs.map((r, i) => plainLine(`  ${fmtRun(r, i, f.nowMs)}`, r.ended ? 'inactive' : 'success')), plainLine(`  total: ${fmtTotal(sumRuns(t.runs, f.nowMs))}`, 'text', { bold: true })],
    })
  return out
}
