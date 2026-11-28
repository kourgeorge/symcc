// T-797: the Live tab's shared pieces: its segments and tones, the section names and headings, and small helpers the
// sections (live.ts, live-today.ts, live-orgmem.ts, live-branches.ts) share.
import { cutTitle, textWidth } from './width'
import { viewMarks } from './board-parts'

/**
 * The kinds and times of task `t`'s timeline lines. A board view's done or dropped task (viewTask, e.g. OpenCode's)
 * comes without its timeline, and OpenCode's TUI then fills it in as `timeline: []` (viewStubFilled): its timeline marks
 * (the kinds and times of its merge and send-back lines) stand in for it whenever it has them and no timeline lines.
 */
export function marksOf(t: { timeline?: readonly { kind: string; at?: string; reason?: string }[] }): readonly { kind: string; at?: string; reason?: string }[] {
  const timeline = Array.isArray(t.timeline) ? t.timeline : []
  return timeline.length > 0 ? timeline : (viewMarks(t) ?? timeline)
}

/**
 * T-781: task `t`'s send-backs on one day (`isToday` tells by the mark's time): `all` counts every one the way /symcc-stats
 * lists failed tries (the checker's problems, tests failed, a clash with main), `checker` only the checker's. A finished
 * task's board view keeps marks (no text) of the checker's lines and of its tests-failed and clash lines (with their reason).
 */
export function sentBackOf(t: { timeline?: readonly { kind: string; at?: string; reason?: string }[] }, isToday: (at: string | undefined) => boolean): { all: number; checker: number } {
  const marks = marksOf(t) as readonly { kind: string; at?: string; reason?: string }[]
  const checker = marks.filter(h => h.kind === 'checker-problems' && isToday(h.at)).length
  const other = marks.filter(h => (h.reason === 'tests' || h.reason === 'clash') && isToday(h.at)).length
  return { all: checker + other, checker }
}

/** How a lane's text is colored: each client picks its own colors for these. */
export type LiveTone = 'id' | 'title' | 'passed' | 'current' | 'future' | 'text' | 'dim' | 'warning' | 'bar' | 'heading' | 'mark' | 'run' | 'wait' | 'topic' | 'now' | 'failed' | 'paused' | TodayWho
/** A piece of a lane's line in one tone. */
export type LiveSeg = { text: string; tone: LiveTone }
/** Each tone's color name, the same in every client; a section heading ("▍Tasks") and (T-760) the agent mark "✧" have
 *  the task page's heading color. T-767: a running lane's "▶ " and id are 'run' (bold, the accent color; its title is normal text); a
 *  waiting train's id is 'run' too (T-819) and its title 'wait' (dim, as the rest of its row); an org-mem topic is 'topic' (blue, T-819). */
export const LIVE_TONE: Record<LiveTone, string> = { id: 'claude', title: 'text', passed: 'success', current: 'ide', future: 'inactive', text: 'text', dim: 'inactive', warning: 'warning', bar: 'ide', heading: 'suggestion', mark: 'suggestion', run: 'claude', now: 'claude', wait: 'inactive', topic: 'ide', failed: 'error', paused: 'permission', workers: 'ide', checkers: 'autoAccept', scouts: 'suggestion', lead: 'success' }

// T-747: the Live tab's sections (Tasks, Today, Branches, Organizational memory; T-820 put Today after Branches) each start with a "▍Name" heading,
// as the task page's "▍Details", and the lines under it are indented by LIVE_INDENT.
/** The section names, in their order on the tab. */
export const LIVE_SECTIONS = { needs: 'Needs you', tasks: 'Tasks', branches: 'Branches', today: 'Today', orgMem: 'Organizational memory' } as const

/** What the lines under a section heading start with. */
export const LIVE_INDENT = ' '
/** The width left for a section's lines in `width` columns (after LIVE_INDENT). */
export const liveInner = (width: number): number => Math.max(1, Math.floor(width) - LIVE_INDENT.length)
/** T-810/T-915: the thin dashes that take a heading line in `width` columns from `used` to the right edge, after the
 *  `gapCols` columns a client's own gaps take between its cells (one that writes a space into the text passes 1):
 *  none in under 4 columns, or when there is no room. */
export const liveRuleDash = (used: number, width: number, gapCols = 1): string => {
  const room = Math.floor(width) - used - gapCols
  return Math.floor(width) < 4 || room < 1 ? '' : '─'.repeat(room)
}
/** T-810: the thin rule (─) after a heading that used `used` columns of `width`: a space, then ─ to the right edge
 *  (shorter when narrow, none in under 4 columns). */
export const liveRuleText = (used: number, width: number): string => {
  const dashes = liveRuleDash(used, width, 1)
  return dashes ? ` ${dashes}` : ''
}
/** T-915: what a section heading starts with: three thin rule characters, a space, ❯ and a space. */
export const LIVE_HEAD_LEAD = '─── ❯ '
/** T-915: the shorter start when the full one and the name don't fit. */
export const LIVE_HEAD_LEAD_NARROW = '─ ❯ '
/** T-915: the start of a heading whose name (and what follows it) takes `nameW` columns of `width`: the full one when it all
 *  fits, else the short one (the name is then cut), none in under 5 columns. */
export const liveHeadLead = (nameW: number, width: number): string => {
  const w = Math.floor(width)
  return nameW + LIVE_HEAD_LEAD.length <= w ? LIVE_HEAD_LEAD : w >= LIVE_HEAD_LEAD_NARROW.length + 1 ? LIVE_HEAD_LEAD_NARROW : ''
}
/** T-915: a section heading in parts, so every client draws the same words: the lead (with its space), the name in
 *  UPPERCASE (cut when narrow) and the rule's dashes (none when there is no room). `gapCols`: the columns the client puts
 *  after the name before the dashes (the terminal's space; VS Code's Box gap={1}, its lead drawn without its space). */
export type LiveHeadParts = { lead: string; name: string; rule: string }
export const liveHeadParts = (name: string, width: number, gapCols = 1): LiveHeadParts => {
  const w = Math.max(1, Math.floor(width))
  const upper = name.toUpperCase()
  const lead = liveHeadLead(textWidth(upper), w)
  const text = fitText(upper, Math.max(1, w - lead.length))
  return { lead, name: text, rule: liveRuleDash(lead.length + textWidth(text), w, gapCols) }
}
/** T-789/T-810/T-915: a section's heading in `width` columns: "─── ❯ ", the name in UPPERCASE ("TASKS"), bold, then a thin
 *  rule to the right edge, all in the heading color ("─── ❯ TASKS ─────…"). When narrow: "─ ❯ " and the name cut.
 *  The client puts one empty line above it (none above the first) and one under it. */
export const liveHeading = (name: string, width: number): LiveSeg[] => {
  const p = liveHeadParts(name, width, 1)
  return [...(p.lead ? [{ text: p.lead, tone: 'heading' as const }] : []), { text: p.name, tone: 'heading' }, ...(p.rule ? [{ text: ` ${p.rule}`, tone: 'heading' as const }] : [])]
}
/** A line under a section heading: LIVE_INDENT, then its segments. */
export const liveIndented = (xs: readonly LiveSeg[]): LiveSeg[] => [{ text: LIVE_INDENT, tone: 'text' }, ...xs]

/** Joins segments, dropping empty ones. */
export const segs = (...xs: (LiveSeg | false | undefined)[]): LiveSeg[] => xs.filter((x): x is LiveSeg => !!x && !!x.text)
/** The plain text of segments. */
export const segText = (xs: readonly LiveSeg[]): string => xs.map(x => x.text).join('')

/** Cuts text to `width` columns, with "…" when cut. */
export const fitText = (s: string, width: number) => (textWidth(s) <= width ? s : cutTitle(s, Math.max(1, width)))

export const ms = (iso: string | undefined): number | undefined => {
  const n = iso ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** Who spent today's tokens, in the bar's order. */
export type TodayWho = 'workers' | 'checkers' | 'scouts' | 'lead'
