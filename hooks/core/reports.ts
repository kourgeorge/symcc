// Each try's full worker report, kept in a file (<dir>/reports/<T-id>-try-<N>.md), and short clean cuts of it.
import type { SymccTask } from '../../types'

/** The most of a report that is kept (characters); a longer one is cut there, with a line saying so. */
export const REPORT_MAX_CHARS = 50_000

/** How many lines of the latest report /<name>-task shows before pointing to the file. */
export const REPORT_PREVIEW_LINES = 40

/** Where try `attempt` of task `id` keeps its report, relative to the project: "<dir>/reports/T-3-try-2.md". */
export const reportFile = (dir: string, id: string, attempt: number) => `${dir}/reports/${id}-try-${attempt}.md`

/** The text saved for a report: the worker's answer, trimmed, cut at REPORT_MAX_CHARS with a line saying so. */
export function reportText(answer: string): string {
  const a = answer.trim()
  if (a.length <= REPORT_MAX_CHARS) return `${a}\n`
  return `${a.slice(0, REPORT_MAX_CHARS)}\n\n… (cut here: the report was longer than ${Math.round(REPORT_MAX_CHARS / 1000)} KB)\n`
}

/**
 * `text` on one line, at most `max` characters. A longer one is cut at the end of a sentence
 * (when one ends in the last part) or else between words, never inside a word, and ends with "…".
 */
export function cutLine(text: string, max: number): string {
  const s = text.replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const room = s.slice(0, Math.max(1, max - 1))
  // the end of a sentence in the last 40% of the room
  let sentence = -1
  for (const m of room.matchAll(/[.!?](?=\s)/g)) sentence = m.index! + 1
  if (sentence >= room.length * 0.6) return `${room.slice(0, sentence)} …`
  // else the last break between words (the cut-off word is dropped)
  const space = s[room.length] === ' ' ? room.length : room.lastIndexOf(' ')
  const cut = space > 0 ? room.slice(0, space) : room
  return `${cut.replace(/[\s,;:—–-]+$/, '')}…`
}

/**
 * The saved reports of task `t`, oldest first: the try number and the file. Empty for old tasks.
 * Only files of the form "<dir>/reports/<id>-try-<N>.md" count, so a hand-edited board can't point elsewhere.
 */
export function taskReports(t: Pick<SymccTask, 'runs'>): { try: number; file: string }[] {
  return (t.runs ?? []).flatMap(r => {
    const n = typeof r.report === 'string' ? /^\.?[\w-]+\/reports\/[\w-]+-try-(\d+)\.md$/.exec(r.report) : null
    return n ? [{ try: Number(n[1]), file: r.report! }] : []
  })
}

/** The research notes among changed files: those under docs/research/. */
export const researchNotes = (files: readonly string[]): string[] => [...new Set(files.filter(f => /^docs\/research\/[^/].*/.test(f)))].sort()

/**
 * The report as /<name>-task shows it: its first REPORT_PREVIEW_LINES lines, and when there are
 * more, a line naming the file with the full report.
 */
export function reportPreview(text: string, file: string, lines = REPORT_PREVIEW_LINES): string[] {
  const all = text.trimEnd().split('\n')
  if (all.length <= lines) return all
  return [...all.slice(0, lines), `… (${all.length - lines} more lines) full report: ${file}`]
}
