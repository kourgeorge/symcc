// The task page's sections (T-580), as plain data: what the Claude Code terminal's task page shows under its title and
// buttons, in its order and with its headings: ▍Done (T-1080, what the whole task has done so far), ▍Why it failed, ▍Answer, ▍Details, ▍Branch (T-761), ▍Changes, ▍What to do, ▍History,
// ▍Runs (time and cost, with a one-line sum) and ▍Report (T-1104: the report of the agent picked in ▍Runs, worker or checker). Each section is lines of colored pieces (Seg), some with what a press or click on
// them does (a changed file opens its diff). The terminal (hooks/claude/ui/task-page.tsx) and OpenCode's panel
// (hooks/opencode/board-view.ts) draw them; VS Code's card (vscode-task.tsx) takes their contents but keeps its own
// layout. Nothing here reads a file: the report texts and the changed files come in as facts.
import type { SymccTask, SymccRun } from '../../types'
import { type Seg, detailRows, detailRowLines, wrapSegs, showsAnswer, answerText } from './details'
import { type BoardTask, hasMergedChanges } from './board-file'
import { isAnswered } from './task'
import { taskReports } from './reports'
import { whyFailed, failNext, failAsks } from './failure'
import { historyEvent, historyTime, HISTORY_COLOR, type HistoryEntry } from './history'
import { agentRows, fmtRun, fmtTotal, runsSummary, sumRuns, shortAgentId } from './runs'
import { usualTokens } from './live'
import { type DiffFile, YOUR_EDITS } from './review'
import { taskBranchLines, taskBranchTitle, type TaskBranchFacts } from './task-branch'
import { cutTitle } from './width'

/** The sections, in the page's order. */
export type TaskSectionId = 'done' | 'why' | 'answer' | 'details' | 'branch' | 'changes' | 'what' | 'history' | 'runs' | 'report'

/** What a press on a line does: show a changed file's diff. */
export type SectionAction = { diff: string }

/**
 * One line of a section: its colored pieces ([] = an empty line), what a press on it does, and for drawing: a stable
 * `key`, and `plain` when its pieces share one look and are drawn as one text (not wrapped).
 */
export type SectionLine = { segs: Seg[]; action?: SectionAction; key?: string; plain?: boolean; pick?: ReportPick; shown?: boolean }

/** T-1104: whose report the Report section shows: try `try`'s worker or checker report; `id` the agent whose line was pressed (none: the try's last one of that kind). */
export type ReportPick = { try: number; kind: 'worker' | 'checker'; id?: string }

/** T-1104: the report a pick shows (the latest worker report with no pick): its try, kind, agent id and file; null when there is none. */
export function resolveReport(t: Pick<SymccTask, 'runs' | 'history'>, pick?: ReportPick | null): { try: number; kind: 'worker' | 'checker'; id?: string; file: string } | null {
  const lastId = (n: number, kind: 'worker' | 'checker') => {
    const r = t.runs?.[n - 1]
    return r ? agentRows(r).filter(a => a.kind === kind).at(-1)?.id : undefined
  }
  if (pick?.kind === 'checker') {
    const c = checkerReportOf(t, pick.try)
    if (c) {
      const id = pick.id ?? lastId(pick.try, 'checker')
      return { try: pick.try, kind: 'checker', file: c.file, ...(id ? { id } : {}) }
    }
  }
  const reports = taskReports(t)
  const r = (pick?.kind === 'worker' ? reports.find(x => x.try === pick.try) : undefined) ?? reports.at(-1)
  if (!r) return null
  const id = (pick?.kind === 'worker' && pick.try === r.try ? pick.id : undefined) ?? lastId(r.try, 'worker')
  return { try: r.try, kind: 'worker', file: r.file, ...(id ? { id } : {}) }
}

/** A section: its id, its heading (without the "▍"), its lines, for the report its tries to pick from, and for the runs
 *  (T-774) the one-line sum in its heading (runsSummary). */
export type TaskSection = { id: TaskSectionId; title: string; lines: SectionLine[]; tries?: { try: number; shown: boolean; key?: string }[]; summary?: string }

/** What the sections need besides the task. */
export type TaskSectionFacts = {
  /** the page's width: lines are wrapped to it */
  width: number
  nowMs: number
  /** what detailRows needs for the Details rows */
  detail: Omit<Parameters<typeof detailRows>[1], 'nowMs'>
  /** the report texts read so far, by file (null: it can't be read; left out: not read) */
  texts?: Record<string, string | null | undefined>
  /** the report picked by the owner in the Runs section (default: the latest try's worker report) */
  shown?: ReportPick
  /** a task in review's changed files, or why they can't be read (left out: not known) */
  changes?: { files: DiffFile[]; error: string } | null
  /** the branch its changes are against */
  target?: string
  /** the data folder, as the page names the task's own folder under it (".symcc": ".symcc/worktrees/T-3") */
  dataDir?: string
  /** the hint under the changed files: how this page shows a diff (default: Claude Code's, Enter on a file or d) */
  changesHint?: string
  /** the number keys answer a question, so the report's tries get none */
  numberKeysTaken?: boolean
  /** T-761: what git says of the task's branch (app/branches.ts's taskBranchFacts); left out: no Branch section */
  branch?: TaskBranchFacts | null
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

/** T-1086: the heading of a done task's Changes section: how many files and the short id of the commit that merged them. */
export const mergedChangesTitle = (files: readonly DiffFile[], merged: string) => `Changes (${files.length} ${files.length === 1 ? 'file' : 'files'}, merged ${merged.slice(0, 7)})`

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
      ...(e.by ? [{ text: `${e.by}: `, color: 'inactive' } as Seg] : []),
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

/**
 * T-1079: the saved report of the latest checker of try `tryNo` of task `t`: its file, its agent name ('' on an old entry) and
 * the verdict ('ok' or 'problems'); null when that try had no checker with a saved report.
 */
export function checkerReportOf(t: Pick<SymccTask, 'history'>, tryNo: number): { try: number; file: string; agent: string; ok: boolean } | null {
  const e = (t.history as HistoryEntry[]).findLast(h => h.report && h.try === tryNo && (h.kind === 'checker-ok' || h.kind === 'checker-problems'))
  return e?.report ? { try: tryNo, file: e.report, agent: e.agent ?? '', ok: e.kind === 'checker-ok' } : null
}

/**
 * T-1104: try `r` (the i-th) of task `t` in the Runs section: its try line, and one line per agent. An agent line with a
 * report file (a worker's: the try's report; a checker's: its saved report) carries a `pick`, and is marked "●" when it is
 * the one the Report shows. A try with no agent lines has its try line as the pick when its worker report exists.
 */
export function runLines(t: Pick<SymccTask, 'runs' | 'history'>, r: SymccRun, i: number, nowMs: number, shown: { try: number; kind: string; id?: string } | null): SectionLine[] {
  const n = i + 1
  const rows = agentRows(r, nowMs)
  const files = { worker: taskReports(t).some(x => x.try === n), checker: !!checkerReportOf(t, n) }
  const on = (kind: 'worker' | 'checker', id?: string) => !!shown && shown.try === n && shown.kind === kind && shown.id === id
  const tryPick = rows.length === 0 && files.worker
  const mark = tryPick && on('worker')
  const head = plainLine(`${mark ? '  ● ' : '  '}${fmtRun(r, i, nowMs)}`, r.ended ? 'inactive' : 'success', { key: `run-${i}`, ...(tryPick ? { pick: { try: n, kind: 'worker' as const }, shown: mark } : {}) })
  return [
    head,
    ...rows.map((a, k): SectionLine => {
      const pressable = files[a.kind]
      const here = pressable && on(a.kind, a.id)
      return plainLine(`${here ? '  ● ' : '    '}${a.text}`, 'inactive', { key: `run-${i}-agent-${k}`, ...(pressable ? { pick: { try: n, kind: a.kind, id: a.id }, shown: here } : {}) })
    }),
  ]
}

/** The task page's sections for task `t`, in order (see the top of this file). */
export function taskSections(t: SymccTask, f: TaskSectionFacts): TaskSection[] {
  const bt = t as BoardTask
  const width = f.width
  const out: TaskSection[] = []
  const reports = taskReports(t)
  const latest = reports[reports.length - 1]
  // T-1080: what the whole task has done so far, from its worker's latest "Done:" line; none on a task that has none (an old one)
  const doneText = bt.done?.trim()
  if (doneText) out.push({ id: 'done', title: 'Done', lines: indented(doneText, 'text', width, 'done') })
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
  // T-761: the task's branch against the one it merges into (core/task-branch.ts); none before it has a branch
  if (f.branch) out.push({ id: 'branch', title: cutTitle(taskBranchTitle(f.branch), Math.max(1, width - 1)), lines: taskBranchLines(t, f.branch, f.nowMs, width).map((segs, i): SectionLine => ({ segs, key: `branch-${i}` })) })
  // T-1086: a done change task keeps its Changes: the files its merge brought into main, read from git (no folder line)
  const doneChanges = hasMergedChanges(bt) && !!f.changes
  if ((doneChanges || (t.status === 'review' && !isAnswered(bt))) && f.changes) {
    const files = f.changes.files
    const fileWidth = Math.max(4, ...files.map(x => x.file.length))
    out.push({
      id: 'changes',
      title: doneChanges ? mergedChangesTitle(files, bt.merged!) : changesTitle(files, f.target ?? 'main'),
      lines: [
        ...(doneChanges ? [] : [plainLine(['  folder: ', f.dataDir ?? '.symcc', '/worktrees/', t.id, ' · edit files there, then approve (the tests run again)'], 'inactive')]),
        ...(f.changes.error ? [plainLine(`  Could not read the changes: ${f.changes.error}`, 'error')] : []),
        ...(!f.changes.error && !files.length ? [plainLine('  no changes', 'inactive')] : []),
        ...files.map((x): SectionLine => ({ segs: changedFileSegs(x, fileWidth), action: { diff: x.file }, key: `file:${x.file}` })),
        plainLine(f.changesHint ?? '  Enter on a file shows its diff · d all files', 'inactive'),
      ],
    })
  }
  out.push({ id: 'what', title: 'What to do', lines: t.details.trim() ? detailsLines(t.details.trimEnd(), width) : [plainLine('(no details)', 'inactive')] })
  if (t.history.length) out.push({ id: 'history', title: `History (${t.history.length}, newest first)`, lines: historyLines(t, width, f.nowMs) })
  // T-1104: one Report section for the agent picked in Runs (its heading says whose report and which try)
  const shown = resolveReport(t, f.shown)
  const summary = t.runs?.length ? runsSummary(t.runs, f.nowMs, usualTokens(f.detail.all)) : ''
  if (t.runs?.length)
    out.push({
      id: 'runs',
      // T-774: the heading sums this task's own tries ("3 tries · 21m · 10.1M tokens (3.6× the usual task) · checkers 2.4M"),
      // and each try has one dim line per agent (worker or checker) under it
      title: `Runs   ${summary}`,
      summary,
      lines: [...t.runs.flatMap((r, i) => runLines(t, r, i, f.nowMs, shown)), plainLine(`  total: ${fmtTotal(sumRuns(t.runs, f.nowMs))}`, 'text', { bold: true })],
    })
  // An answered investigation with one try: its report is the Answer above, so it is not shown twice.
  if ((reports.length > 0 || t.attempts > 0 || shown) && !(answerShown && latest && reports.length === 1 && shown?.kind !== 'checker')) {
    const body = shown ? textOf(f, shown.file) : null
    const read = shown ? f.texts?.[shown.file] !== undefined : false
    out.push({
      id: 'report',
      title: shown ? `Report · try ${shown.try} · ${shown.kind}${shown.id ? ` ${shortAgentId(shown.id)}` : ''}` : 'Report',
      lines: [
        ...(!shown ? [plainLine('  no saved report', 'inactive')] : [plainLine(['  ', shown.file], 'inactive')]),
        ...(shown && !read ? [plainLine('  (reading the report…)', 'inactive')] : []),
        ...(shown && read && body === null ? [plainLine(`  Could not read the ${shown.kind === 'checker' ? 'checker ' : ''}report file.`, 'error')] : []),
        ...(body !== null ? indented(body.trimEnd(), 'text', width, 'report') : []),
      ],
      ...(reports.length > 1 ? { tries: reports.map(r => ({ try: r.try, shown: r.try === shown?.try && shown.kind === 'worker', ...(r.try <= 9 && !f.numberKeysTaken ? { key: String(r.try) } : {}) })) } : {}),
    })
  }
  return out
}
