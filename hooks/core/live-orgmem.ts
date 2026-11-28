// T-797: the Live tab's ▍Organizational memory section (split out of live.ts).
import { padWidth, textWidth } from './width'
import { ORG_MEM_EMPTY, ORG_MEM_MAX_LINES, TOPIC_UNSORTED, ORG_MEM_ALL, orgMemNewest, orgMemShortDay, orgMemTopicCounts, type OrgMemNote } from './org-mem'
import { type LiveSeg, LIVE_SECTIONS, liveInner, liveRuleText, LIVE_HEAD_LEAD, liveHeadParts, segs, fitText } from './live-seg'

// ---------------- T-718: the Organizational memory section at the bottom of the Live tab ----------------
//  ▍Organizational memory   57 / 60 ▕█████████░▏
//   newest [all]
//    11-21  tests      In tests, put dates relative to now, never a…
//   topics
//    tests · snapshots   14    git & guards       11    OpenCode   9
// T-866: no key hint line and no m key; the "[all]" button next to "newest" opens all notes (a click, or Enter on it).

/** One topic cell of the section's grid: its topic, count and text (with the indent or gap before it, padded to its column). */
export type OrgMemCell = { topic: string; count: number; segs: LiveSeg[] }

/** The section as lines in a width: the header, the newest notes (each with its note), the topic grid (rows of cells). */
export type LiveOrgMem = {
  head: LiveSeg[]
  newestLabel: string
  /** T-866: the button after newestLabel that opens all notes: its label ("all") and how the terminal draws it ("[all]") */
  all: { label: string; text: string }
  newest: { note: OrgMemNote; segs: LiveSeg[] }[]
  /** '' or what is said in place of the newest notes (no notes yet) */
  empty: string
  topicsLabel: string
  grid: OrgMemCell[][]
}

/** The most columns of the topic grid. */
export const ORG_MEM_GRID_MAX = 4
const GRID_LEAD = '  '
const GRID_GAP = '    '
const NEWEST_TOPIC_MAX = 16

/** The spaces between an Organizational memory heading's title and its count. */
export const ORG_MEM_COUNT_GAP = '   '
/** T-915: the Organizational memory heading in parts, so every client draws the same words: the lead (with its space),
 *  the title ("ORGANIZATIONAL MEMORY", else "ORG-MEM"), the spaces before the count, and the count ('' when even
 *  "ORG-MEM" and the count don't fit; the name is then cut as liveHeading cuts it). */
export type LiveOrgMemHeadParts = { lead: string; title: string; gap: string; count: string }
export function liveOrgMemHeadParts(n: number, width: number): LiveOrgMemHeadParts {
  const w = Math.max(1, Math.floor(width))
  const count = `${n} / ${ORG_MEM_MAX_LINES}`
  for (const title of [LIVE_SECTIONS.orgMem.toUpperCase(), 'ORG-MEM']) {
    const used = textWidth(`${LIVE_HEAD_LEAD}${title}${ORG_MEM_COUNT_GAP}${count}`)
    if (used > w) continue
    return { lead: LIVE_HEAD_LEAD, title, gap: ORG_MEM_COUNT_GAP, count }
  }
  const p = liveHeadParts('Org-mem', w, 1)
  return { lead: p.lead, title: p.name, gap: '', count: '' }
}
/** The columns an Organizational memory heading's words take, drawn as one line (its lead's trailing space included). */
export const liveOrgMemHeadUsed = (p: LiveOrgMemHeadParts): number => p.lead.length + textWidth(p.title) + (p.count ? textWidth(p.gap) + textWidth(p.count) : 0)

/** The section's heading in `width` columns: "─── ❯ ORGANIZATIONAL MEMORY   57 / 60 ────" (T-810: the count of the cap, no
 *  bar, then the thin rule; the title shorter when narrow). T-772: the count is dim, never a warning. */
function orgMemHead(n: number, width: number): LiveSeg[] {
  const p = liveOrgMemHeadParts(n, width)
  const rule = liveRuleText(liveOrgMemHeadUsed(p), width)
  return segs({ text: p.lead, tone: 'heading' }, { text: p.title, tone: 'heading' }, { text: p.gap, tone: 'text' }, { text: p.count, tone: 'dim' }, { text: rule, tone: 'heading' })
}

/** The newest notes' lines: "   11-21  tests      text cut with …", the topic column as wide as the longest topic shown (cut when narrow). */
function newestLines(notes: readonly OrgMemNote[], width: number): { note: OrgMemNote; segs: LiveSeg[] }[] {
  const lead = '  '
  const dayW = 5
  const longest = Math.max(0, ...notes.map(x => textWidth(x.topic)))
  // the text keeps at least about half of the room; the topic column gives way first
  const fixed = textWidth(lead) + dayW + 2 + 2
  const topicW = Math.max(3, Math.min(longest, NEWEST_TOPIC_MAX, Math.floor((width - fixed) / 3)))
  const textW = Math.max(1, width - fixed - topicW)
  return notes.map(note => ({
    note,
    segs: segs(
      { text: lead, tone: 'text' },
      { text: padWidth(orgMemShortDay(note.date), dayW), tone: 'dim' },
      { text: `  ${padWidth(fitText(note.topic, topicW), topicW)}`, tone: note.topic === TOPIC_UNSORTED ? 'dim' : 'topic' },
      { text: `  ${fitText(note.text, textW)}`, tone: 'text' },
    ),
  }))
}

/** The topic grid in `width` columns: as many columns as fit (at most ORG_MEM_GRID_MAX), filled row by row in
 *  orgMemTopicCounts' order, each column as wide as its longest name and count; never wider than `width` (a name
 *  too long even for one column is cut). */
export function topicGrid(topics: readonly { topic: string; count: number }[], width: number): OrgMemCell[][] {
  if (!topics.length) return []
  const layout = (cols: number) => {
    const nameW: number[] = []
    const countW: number[] = []
    topics.forEach((x, i) => {
      const c = i % cols
      nameW[c] = Math.max(nameW[c] ?? 0, textWidth(x.topic))
      countW[c] = Math.max(countW[c] ?? 0, String(x.count).length)
    })
    const total = textWidth(GRID_LEAD) + nameW.reduce((s, w, c) => s + w + 2 + countW[c]!, 0) + textWidth(GRID_GAP) * (nameW.length - 1)
    return { nameW, countW, total }
  }
  let cols = Math.min(ORG_MEM_GRID_MAX, topics.length)
  while (cols > 1 && layout(cols).total > width) cols--
  const { nameW, countW, total } = layout(cols)
  if (total > width) nameW[0] = Math.max(1, nameW[0]! - (total - width))
  const rows: OrgMemCell[][] = []
  topics.forEach((x, i) => {
    const c = i % cols
    if (!c) rows.push([])
    rows[rows.length - 1]!.push({
      topic: x.topic,
      count: x.count,
      segs: [
        { text: `${c ? GRID_GAP : GRID_LEAD}${padWidth(fitText(x.topic, nameW[c]!), nameW[c]!)}`, tone: x.topic === TOPIC_UNSORTED ? 'dim' : 'topic' },
        { text: `  ${String(x.count).padStart(countW[c]!)}`, tone: 'dim' },
      ],
    })
  })
  return rows
}

/** The Live tab's Organizational memory section for `notes` (orgMemNotes: newest first) in `width` columns (see
 *  above): the heading in `width`, the lines under it in liveInner(width), for the client to indent (LIVE_INDENT). */
export function liveOrgMem(notes: readonly OrgMemNote[], width: number): LiveOrgMem {
  const full = Math.max(1, Math.floor(width))
  const w = liveInner(full)
  return {
    head: orgMemHead(notes.length, full),
    newestLabel: 'newest',
    all: { label: ORG_MEM_ALL, text: `[${ORG_MEM_ALL}]` },
    newest: newestLines(orgMemNewest(notes), w),
    empty: notes.length ? '' : `  ${ORG_MEM_EMPTY}`,
    topicsLabel: 'topics',
    grid: topicGrid(orgMemTopicCounts(notes), w),
  }
}
