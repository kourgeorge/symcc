// /<name>-status (T-902): the board's Live tab as plain text for the chat, the same in every client. Every line is made by
// the Live tab's own helpers (core/live.ts), so the numbers always match the panel; this file only puts them in order:
// the mode line, NEEDS YOU (only while something waits), TASKS (one line per lane: its id, title, stations and time, with
// "(try n)" from a second try; the waiting trains hung under it), BRANCHES (when git's figures were read), TODAY (with the
// yesterday and last 7 days lines) and ORGANIZATIONAL MEMORY (the count and the newest notes), then one hint line, then (when lanes show) the ✧ / ⌀ legend
// as the last lines (T-933: never under the task rows).
import { DEFAULT_NAME } from '../name'
import { LIVE_INDENT, LIVE_SECTIONS, liveIdle, laneLines, liveBranches, liveColumns, liveHeaderSegs, liveHeading, liveInner, liveLabelSegs, liveLayout, liveLegend, liveNeeds, liveOrgMem, liveTaskLanes, liveTodayLines, liveTrains, segText, trainRows, type LiveSeg, type LiveView } from './live'
import type { OrgMemNote } from './org-mem'
import { localOffset } from './days'

/** What /<name>-status reads: the Live tab's view, with the open questions and the scouts (for the mode line's scout mark). */
export type StatusView = LiveView & Parameters<typeof liveNeeds>[0] & Parameters<typeof liveHeaderSegs>[0] & { max_minutes?: number }

/** The last line of /<name>-status: where to go next. */
export const statusHint = (name: string = DEFAULT_NAME) => `/${name}-board opens the board · /${name}-tasks lists the tasks`

/** The " (try n)" after a lane's line from its second try on. */
const tryText = (n: number) => (n > 1 ? ` (try ${n})` : '')

/**
 * The Live tab of `view` as chat text in `width` columns (see the top of this file); `notes`: org-mem's notes, newest first
 * (orgMemNotes). The current station is always ◉ (no blink in a chat).
 */
export function liveStatusText(view: StatusView, notes: readonly OrgMemNote[], nowMs: number, name: string = DEFAULT_NAME, width = 80, offsetMin: number = localOffset(nowMs)): string {
  const w = Math.max(20, Math.floor(width))
  const inner = liveInner(w)
  const out: string[] = []
  const line = (xs: readonly LiveSeg[]) => out.push(segText(xs).trimEnd())
  const under = (xs: readonly LiveSeg[]) => out.push((LIVE_INDENT + segText(xs)).trimEnd())
  const heading = (label: string) => (out.push(''), line(liveHeading(label, w)))
  const lanes = liveTaskLanes(view, nowMs)
  const running = lanes.filter(l => !l.done)
  line(liveHeaderSegs(view, running, nowMs, w))
  // NEEDS YOU: only while something waits for the owner
  const needs = liveNeeds(view, nowMs, inner)
  if (needs.length) {
    heading(LIVE_SECTIONS.needs)
    for (const n of needs) under(n.segs)
  }
  // TASKS: one line per lane (room kept for "(try n)"), its waiting trains under it
  heading(LIVE_SECTIONS.tasks)
  if (!running.length) for (const x of liveIdle(view, nowMs, inner)) out.push(LIVE_INDENT + x)
  // T-924: one empty line between the idle lines and the lanes
  if (!running.length && lanes.length) out.push('')
  if (lanes.length) {
    const room = Math.max(0, ...lanes.map(l => (l.done ? 0 : tryText(l.tryNo).length)))
    const layout = liveLayout(lanes, liveColumns(lanes, view.checker === true), Math.max(1, inner - room))
    const trains = liveTrains(view, nowMs, lanes)
    under(liveLabelSegs(layout))
    for (const l of lanes) {
      const [first] = laneLines(l, layout, { nowMs, frame: 0, steady: true })
      out.push((LIVE_INDENT + segText(first) + (l.done ? '' : tryText(l.tryNo))).trimEnd())
      for (const r of trainRows(trains.lanes[l.id] ?? [], inner)) under(r.segs)
    }
  }
  // BRANCHES: the last figures git gave (none until read)
  const br = liveBranches(view, nowMs, w)
  if (br) {
    out.push('')
    line(br.head)
    under(br.main)
    for (const r of br.rows) under(r.segs)
  }
  // TODAY: today's figures, then the yesterday and last 7 days lines
  heading(LIVE_SECTIONS.today)
  for (const t of liveTodayLines(view, nowMs, inner, offsetMin, !lanes.length)) under(t)
  // ORGANIZATIONAL MEMORY: the count (in the heading) and the newest notes
  const om = liveOrgMem(notes, w)
  out.push('')
  line(om.head)
  if (om.empty) out.push(LIVE_INDENT + om.empty)
  for (const x of om.newest) under(x.segs)
  out.push('', statusHint(name))
  // T-933: the ✧ / ⌀ legend (only when lanes show those marks) is the text's last lines, after the hint line
  if (lanes.length) for (const x of liveLegend(inner)) out.push(LIVE_INDENT + x)
  return out.join('\n')
}
