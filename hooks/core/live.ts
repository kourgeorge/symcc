// The board panel's Live tab (T-690): one "railway lane" per task in doing, showing the station it is at on its way to
// the merge (work → check → queue → tests → merged), its tokens, then what starts next and today's numbers. Everything
// a client needs is worked out here, the lane text included (cut titles, station marks, the blinking current station),
// so each client (Claude Code's terminal panel now; VS Code and OpenCode later) only draws the segments.
import type { SymccMode, SymccTask } from '../../types'
import { type BoardTask, DEFAULT_AUTO_RETRIES, emptyBoard, kindOf, isInvestigation, modeOf } from './board-file'
import { taskPhase, type PhaseStage } from './phase'
import { handedBack, shownStatus } from './lead'
import { STAGE_LINE } from './events'
import { cutTitle, median, padWidth, textWidth } from './stats'
import { fmtTokens, sumTokens, tokenCount } from './runs'
import { type KeyHint, LIVE_VIEW_KEYS, rowDuration, waitOrder } from './panel'
import { depDone } from './archive'
import { dayOf, localOffset } from './days'
import { modeLabel } from './review'
import { num } from './text'
import { viewMarks } from './board-parts'

/** The stations of a lane, in the order a task passes them. */
export type LiveStation = 'work' | 'check' | 'queue' | 'tests' | 'merged'
export const LIVE_STATIONS: readonly LiveStation[] = ['work', 'check', 'queue', 'tests', 'merged']
/** The line under the lanes that says what the "·" after a station name means. */
export const LIVE_LEGEND = '· = needs an agent slot'
/** What the Live tab says when no task is in doing. */
export const LIVE_EMPTY = 'No task is running right now.'
/** The stations shown: check only when the checker setting is on. */
export const liveStations = (checker: boolean): LiveStation[] => LIVE_STATIONS.filter(s => s !== 'check' || checker)

/** The terminal panel's tabs in order, with their keys: Tasks, Live, Scouts, Settings. */
export const LIVE_TABS = [
  { tab: 'tasks', label: 'Tasks', key: 't' },
  { tab: 'live', label: 'Live', key: 'l' },
  { tab: 'scouts', label: 'Scouts', key: 's' },
  { tab: 'settings', label: 'Settings', key: 'c' },
] as const
/** The keys under the Live tab. */
export const liveKeys = (): KeyHint[] => [
  { key: '↑↓', word: 'move' },
  { key: 'Enter', word: 'open task' },
  { key: 'w', word: 'watch worker' },
  { key: 'm', word: 'org-mem' },
  { key: LIVE_VIEW_KEYS, word: 'views' },
  { key: 'Esc', word: 'close' },
]

/**
 * The tab row's words for `width` columns: "[t]: Tasks (20)" with " │ " between; when that is too wide, "[t] Tasks (20)",
 * then with "│" alone between, then "[t]Tasks (20)", then with no counts. `tabs` are the tabs' key, label and count (none: no count).
 */
export function tabRow(tabs: readonly { key: string; label: string; count?: number }[], width: number): { labels: string[]; gap: string } {
  const forms = [
    { mark: (k: string) => `[${k}]: `, gap: ' │ ' },
    { mark: (k: string) => `[${k}] `, gap: ' │ ' },
    { mark: (k: string) => `[${k}] `, gap: '│' },
    { mark: (k: string) => `[${k}]`, gap: '│' },
    { mark: (k: string) => `[${k}]`, gap: '│', bare: true },
  ]
  const build = (f: (typeof forms)[number]) => ({ labels: tabs.map(t => `${f.mark(t.key)}${t.label}${t.count === undefined || ('bare' in f && f.bare) ? '' : ` (${t.count})`}`), gap: f.gap })
  for (const f of forms) {
    const r = build(f)
    if (textWidth(r.labels.join(r.gap)) <= width) return r
  }
  return build(forms[forms.length - 1]!)
}

/** What the Live tab reads of the board view. */
export type LiveView = { tasks: SymccTask[]; checker?: boolean; auto_retries?: number; max_parallel?: number; mode?: SymccMode; archived_done?: string[] }

/**
 * One lane: a task in doing. `station` is where it is (`at` its place in `stations`); `sinceMs` when it got there;
 * `place` its place in the merge queue (in the queue only); `tryNo`/`tries` its try and how many it may have
 * (its auto retries after failing tests included); `tokens` what its current try has recorded (a running worker's
 * tokens are only recorded when it hands back, so none while it works); `usual` the board's usual tokens per
 * merged task; `sentBack` how often the checker sent it back; `enteredMs` when its current doing spell began (its
 * current try's start); `agent` whether an agent (its worker or checker) runs on it now.
 */
export type LiveLane = {
  id: string
  title: string
  kind: string
  stations: LiveStation[]
  station: LiveStation
  at: number
  stage: PhaseStage
  sinceMs?: number
  place?: number
  tryNo: number
  tries: number
  tokens?: number
  usual?: number
  sentBack: number
  enteredMs: number
  agent: boolean
}

/** The station of a check stage: prep counts at check when the checker is on (it comes just before it), else at work. */
function stationOf(stage: PhaseStage, checker: boolean): LiveStation {
  switch (stage) {
    case 'worker':
      return 'work'
    case 'prep':
      return checker ? 'check' : 'work'
    case 'checker':
      return checker ? 'check' : 'work'
    case 'queue':
      return 'queue'
    case 'test':
      return 'tests'
    case 'merge':
      return 'merged'
  }
}

/** The board's usual tokens per merged task: the middle value over the done tasks (not investigations) with tokens. */
export function usualTokens(tasks: readonly SymccTask[]): number | undefined {
  const xs = tasks
    .filter(t => t.status === 'done' && !isInvestigation(t) && (t.runs ?? []).some(r => r.tokens))
    .map(t => tokenCount(sumTokens((t.runs ?? []).map(r => r.tokens))))
    .filter(n => n > 0)
  return median(xs)
}

const ms = (iso: string | undefined): number | undefined => {
  const n = iso ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** When task `t` got to `station` in its try that started at `startMs`: the history's stage lines (T-616), else the hand-back, else the check step's mark. */
function stationSince(t: BoardTask, station: LiveStation, startMs: number | undefined): number | undefined {
  if (station === 'work') return startMs
  const stageAt = (stages: PhaseStage[], first: boolean) => {
    const words = stages.map(s => STAGE_LINE[s]).filter((w): w is string => !!w)
    const hits = (t.history ?? []).filter(h => h.kind === 'stage' && words.some(w => h.text.includes(`: ${w}`))).map(h => ms(h.at)).filter((n): n is number => n !== undefined && (startMs === undefined || n >= startMs))
    return hits.length ? (first ? Math.min(...hits) : Math.max(...hits)) : undefined
  }
  const found = station === 'check' ? stageAt(['prep', 'checker'], true) : station === 'queue' ? stageAt(['queue'], false) : station === 'tests' ? stageAt(['test'], false) : stageAt(['merge'], false)
  return found ?? (station === 'check' ? ms(t.runs?.[t.runs.length - 1]?.ended) : undefined) ?? ms(t.checking?.at)
}

/** When the approve (or files-merge) running on task `t` (in review or waiting) started: its last "prep started" line
 *  after its try ended, else its check step's mark. */
function approveSince(t: BoardTask, endMs: number | undefined): number | undefined {
  const word = STAGE_LINE.prep!
  const preps = (t.history ?? []).filter(h => h.kind === 'stage' && h.text.includes(`: ${word}`)).map(h => ms(h.at)).filter((n): n is number => n !== undefined && (endMs === undefined || n >= endMs))
  return preps.length ? Math.max(...preps) : ms(t.checking?.at)
}

/** The lanes of the Live tab: one per task the board shows as doing (shownStatus: a task in doing, or one in review or
 *  waiting whose approve or merge runs, with a fresh check step), the one that entered doing (or whose approve began) first at the top. */
export function liveLanes(view: LiveView, nowMs: number): LiveLane[] {
  const checker = view.checker === true
  const stations = liveStations(checker)
  const usual = usualTokens(view.tasks)
  const retries = view.auto_retries ?? DEFAULT_AUTO_RETRIES
  const lanes = view.tasks
    .filter(t => shownStatus(t as BoardTask, nowMs) === 'doing')
    .map((x): LiveLane => {
      const t = x as BoardTask
      let stage: PhaseStage = taskPhase(t, nowMs).stage ?? 'worker'
      if (stage === 'worker' && handedBack(t)) stage = 'prep'
      const station = stationOf(stage, checker)
      const run = t.runs?.[t.runs.length - 1]
      const startMs = ms(run?.started)
      const approving = t.status !== 'doing'
      const enteredMs = (approving ? approveSince(t, ms(run?.ended)) : startMs) ?? ms(t.updated_at) ?? ms(t.created_at) ?? 0
      const sinceMs = stationSince(t, station, approving ? enteredMs : startMs)
      const tryNo = Math.max(1, Number(t.attempts) || 1)
      const auto = Number(t.test_tries ?? 0) || 0
      const place = stage === 'queue' ? t.checking?.place : undefined
      return {
        id: t.id,
        title: t.title,
        kind: kindOf(t),
        stations,
        station,
        at: stations.indexOf(station),
        stage,
        ...(sinceMs !== undefined ? { sinceMs } : {}),
        ...(place ? { place } : {}),
        tryNo,
        tries: Math.max(tryNo, tryNo - auto + retries),
        ...(run?.tokens ? { tokens: tokenCount(run.tokens) } : {}),
        ...(usual ? { usual } : {}),
        sentBack: (t.history ?? []).filter(h => h.kind === 'checker-problems').length,
        enteredMs,
        agent: stage === 'worker' || (stage === 'checker' && !!t.checker),
      }
    })
  return lanes.sort((a, b) => a.enteredMs - b.enteredMs || num(a.id) - num(b.id))
}

/** "⏵ auto · agents 2/3 busy": the board mode and the agents running (workers and checkers) against max_parallel. */
export function liveHeader(view: LiveView, lanes: readonly LiveLane[]): string {
  const max = view.max_parallel ?? emptyBoard().max_parallel
  return `${modeLabel(modeOf(view))} · agents ${lanes.filter(l => l.agent).length}/${max} busy`
}

/** The current station's mark on redraw number `frame`: ◉ and ◎ in turn; always ◉ when `steady` (reduced motion). */
export const liveBlink = (frame: number, steady = false): string => (steady || frame % 2 === 0 ? '◉' : '◎')

/** How a lane's text is colored: each client picks its own colors for these. */
export type LiveTone = 'id' | 'title' | 'passed' | 'current' | 'future' | 'text' | 'dim' | 'warning' | 'bar'
/** A piece of a lane's line in one tone. */
export type LiveSeg = { text: string; tone: LiveTone }
/** Each tone's color name, the same in every client. */
export const LIVE_TONE: Record<LiveTone, string> = { id: 'claude', title: 'text', passed: 'success', current: 'ide', future: 'inactive', text: 'text', dim: 'inactive', warning: 'warning', bar: 'ide' }

/** How the lanes are laid out at a width: the id and title columns, the gap between stations, the station names, the right column. */
export type LiveLayout = { width: number; idW: number; titleW: number; gap: number; labels: string[]; rightW: number; sep: number; stations: LiveStation[] }

const LABELS: Record<LiveStation, string>[] = [
  { work: 'work·', check: 'check·', queue: 'queue', tests: 'tests', merged: 'merged' },
  { work: 'wrk·', check: 'chk·', queue: 'que', tests: 'tst', merged: 'mrg' },
  { work: 'w·', check: 'c·', queue: 'q', tests: 't', merged: 'm' },
]
const MAX_GAP = 8
const MIN_GAP = 2
const TITLE_W = 12
const TITLE_MAX = 40
const RIGHT_W = 6

/** A lane line's width with these columns. */
const laneWidth = (idW: number, titleW: number, k: number, gap: number, sep: number, rightW = RIGHT_W) => 1 + idW + (titleW ? 1 + titleW : 0) + sep + k + (k - 1) * gap + sep + rightW

/**
 * The layout of `lanes` at `width` columns: gaps of 8 and a 12-column title (wider, up to the longest title, when the
 * panel is wider); narrower, first the gaps shrink (to 2), then the title (to 3, then the id alone), then the
 * spaces around the stations. Station names get shorter as the gaps do, so they always fit over their marks.
 */
export function liveLayout(lanes: readonly Pick<LiveLane, 'id' | 'title'>[], stations: readonly LiveStation[], width: number): LiveLayout {
  const idW = Math.max(4, ...lanes.map(l => textWidth(l.id)))
  const k = stations.length
  const longest = Math.max(3, ...lanes.map(l => textWidth(l.title)))
  const make = (titleW: number, gap: number, sep: number): LiveLayout => {
    const set = LABELS.find(s => stations.slice(0, -1).every(st => textWidth(s[st]) <= gap)) ?? LABELS[LABELS.length - 1]!
    return { width, idW, titleW, gap, labels: stations.map(s => set[s]), rightW: RIGHT_W, sep, stations: [...stations] }
  }
  const base = Math.min(TITLE_W, longest)
  for (let gap = MAX_GAP; gap >= MIN_GAP; gap--) {
    if (laneWidth(idW, base, k, gap, 2) <= width) {
      const room = width - laneWidth(idW, base, k, gap, 2)
      return make(gap === MAX_GAP ? Math.min(TITLE_MAX, longest, base + room) : base, gap, 2)
    }
  }
  for (let titleW = base - 1; titleW >= 3; titleW--) if (laneWidth(idW, titleW, k, MIN_GAP, 2) <= width) return make(titleW, MIN_GAP, 2)
  if (laneWidth(idW, 0, k, MIN_GAP, 2) <= width) return make(0, MIN_GAP, 2)
  return make(0, MIN_GAP, 1)
}

/** The width of the name column (id, space, title) of a layout. */
const nameWidth = (l: LiveLayout) => l.idW + (l.titleW ? 1 + l.titleW : 0)

/** The station names' line over the lanes, each name starting over its mark. */
export function liveLabelLine(l: LiveLayout): string {
  const lead = ' '.repeat(1 + nameWidth(l) + l.sep)
  return lead + l.labels.map((s, i) => (i < l.labels.length - 1 ? padWidth(s, l.gap + 1) : s)).join('')
}

/** A bar of `cells` blocks for `value` against `full`: "▕████░░░░▏". */
const tokenBar = (value: number, full: number, cells: number) => {
  const n = Math.max(0, Math.min(cells, Math.round((value / full) * cells)))
  return `▕${'█'.repeat(n)}${'░'.repeat(cells - n)}▏`
}

/** The text at a lane's right: its place in the queue ("#2"), else the time at its station ("2m"); '' when not known. */
export function laneRight(lane: Pick<LiveLane, 'station' | 'place' | 'sinceMs'>, nowMs: number): string {
  if (lane.station === 'queue' && lane.place) return `#${lane.place}`
  return lane.sinceMs !== undefined ? rowDuration(Math.max(0, nowMs - lane.sinceMs)) : ''
}

/** Joins segments, dropping empty ones. */
const segs = (...xs: (LiveSeg | false | undefined)[]): LiveSeg[] => xs.filter((x): x is LiveSeg => !!x && !!x.text)
/** The plain text of segments. */
export const segText = (xs: readonly LiveSeg[]): string => xs.map(x => x.text).join('')

/**
 * A lane's two lines as segments, never wider than the layout's width (unless even the tightest layout is wider):
 * 1. " T-684 /symcc-doc…  ●━━━━━━━━●━━━━━━━━◉────────○────────○      #2": passed stations ●━━, the current one blinking
 *    (`frame`, liveBlink), future ──○; the right column the queue place or the time at the station;
 * 2. "  change try 2/3     ▕████████░░░░░▏ 1.1M  ↺×1": kind and try, the current try's token bar against twice the
 *    board's usual tokens per merged task (warning past it, with ⚠), and the checker's send-backs. Parts that don't fit
 *    are left out (the bar first, then the kind), never cut. A running worker's tokens are known only at its hand-back.
 */
export function laneLines(lane: LiveLane, l: LiveLayout, o: { nowMs: number; frame: number; steady?: boolean }): [LiveSeg[], LiveSeg[]] {
  const sep = ' '.repeat(l.sep)
  const track: LiveSeg[] = []
  l.stations.forEach((_, i) => {
    if (i) track.push(i <= lane.at ? { text: '━'.repeat(l.gap), tone: 'passed' } : { text: '─'.repeat(l.gap), tone: 'future' })
    track.push(i < lane.at ? { text: '●', tone: 'passed' } : i === lane.at ? { text: liveBlink(o.frame, o.steady), tone: 'current' } : { text: '○', tone: 'future' })
  })
  const name = segs({ text: ` ${padWidth(lane.id, l.idW)}`, tone: 'id' }, l.titleW > 0 && { text: ` ${padWidth(cutTitle(lane.title, l.titleW), l.titleW)}`, tone: 'title' })
  const first = [...name, { text: sep, tone: 'text' as const }, ...track, { text: sep + laneRight(lane, o.nowMs).padStart(l.rightW), tone: 'dim' as const }]
  // the second line
  const trackW = l.stations.length + (l.stations.length - 1) * l.gap
  const indent = 1 + nameWidth(l) + l.sep
  const kindTry = ` ${lane.kind} try ${lane.tryNo}/${lane.tries}`
  const back = lane.sentBack ? `  ↺×${lane.sentBack}` : ''
  const over = lane.tokens !== undefined && lane.usual !== undefined && lane.tokens > 2 * lane.usual
  const fits = (xs: LiveSeg[]) => textWidth(segText(xs)) <= l.width
  const tokens = (form: 'bar' | 'plain' | 'none'): LiveSeg[] => {
    if (form === 'none') return []
    if (lane.tokens === undefined) return [{ text: 'tokens at hand-back', tone: 'dim' }]
    const cells = Math.min(13, Math.max(4, trackW - 2))
    return segs(form === 'bar' && lane.usual !== undefined && { text: tokenBar(lane.tokens, 2 * lane.usual, cells) + ' ', tone: over ? 'warning' : 'bar' }, { text: fmtTokens(lane.tokens), tone: over ? 'warning' : 'text' }, over && { text: ' ⚠', tone: 'warning' })
  }
  const tries: LiveSeg[][] = []
  for (const withKind of [true, false])
    for (const form of ['bar', 'plain', 'none'] as const) {
      const lead = ' ' + (withKind ? kindTry : ` try ${lane.tryNo}/${lane.tries}`)
      const pad = Math.max(2, indent - textWidth(lead))
      const rest = tokens(form)
      tries.push(segs({ text: lead, tone: 'dim' }, rest.length > 0 && { text: ' '.repeat(pad), tone: 'text' }, ...rest, { text: back, tone: 'dim' }))
    }
  tries.push(segs({ text: `  try ${lane.tryNo}/${lane.tries}`, tone: 'dim' }))
  return [first, tries.find(fits) ?? tries[tries.length - 1]!]
}

/** A todo task as "next up" lists it: its id, title and the tasks it still waits for. */
export type NextUp = { id: string; title: string; after: string[] }

/** The todo tasks in the order they will start (the board's order: by order and id, each one after the tasks it waits for), with what they still wait for. */
export function nextUp(view: LiveView): NextUp[] {
  const todo = view.tasks.filter(t => t.status === 'todo')
  const board = { tasks: view.tasks as BoardTask[], archived_done: view.archived_done ?? [] }
  return waitOrder(todo, (x, y) => x.order - y.order || num(x.id) - num(y.id)).map(t => ({ id: t.id, title: t.title, after: (t.after ?? []).filter(a => !depDone(board, a)) }))
}

/**
 * The "next up" line in `width` columns: "next up  T-690 Live tab… · T-691 VS Code l… (after T-690) · 2 more in todo";
 * as many tasks as fit (at most 3) with titles cut to 12, else to 6, else with no titles; "nothing in todo" for none.
 */
export function nextUpLine(items: readonly NextUp[], width: number): string {
  const head = 'next up  '
  if (!items.length) return `${head}nothing in todo`
  const one = (x: NextUp, w: number) => `${x.id}${w ? ` ${cutTitle(x.title, w)}` : ''}${x.after.length ? ` (after ${x.after.join(', ')})` : ''}`
  const line = (n: number, w: number) => {
    const more = items.length - n
    return head + [...items.slice(0, n).map(x => one(x, w)), ...(more ? [`${more} more in todo`] : [])].join(' · ')
  }
  for (const w of [12, 6]) for (let n = Math.min(3, items.length); n >= 1; n--) if (textWidth(line(n, w)) <= width) return line(n, w)
  for (let n = Math.min(3, items.length); n >= 1; n--) if (textWidth(line(n, 0)) <= width) return line(n, 0)
  return line(1, 0)
}

/** Today's numbers: tasks merged, checker send-backs, tasks failed, and the worker tries' tokens. */
export type LiveToday = { merged: number; sentBack: number; failed: number; tokens: number }

/** Today's numbers at `nowMs` (the owner's day, `offsetMin` east of UTC): merged (a "merged" history line today), sent back
 *  (the checker's send-backs today; a task given without its history, as a board view's done one, is counted by its
 *  history marks, see viewTask), failed (tasks failed now that failed today), tokens (of the tries that ended today, or run today). */
export function liveToday(tasks: readonly SymccTask[], nowMs: number, offsetMin: number = localOffset(nowMs)): LiveToday {
  const today = dayOf(nowMs, offsetMin)
  const isToday = (iso: string | undefined) => {
    const n = ms(iso)
    return n !== undefined && dayOf(n, offsetMin) === today
  }
  let merged = 0
  let sentBack = 0
  let failed = 0
  let tokens = 0
  for (const t of tasks) {
    // A board view's done or dropped task (viewTask, e.g. OpenCode's) comes without its history: its history marks (the
    // kinds and times of its merge and send-back lines) stand in for it.
    const history: readonly { kind: string; at?: string }[] = Array.isArray(t.history) ? t.history : (viewMarks(t) ?? [])
    if (history.some(h => h.kind === 'merged' && isToday(h.at))) merged++
    sentBack += history.filter(h => h.kind === 'checker-problems' && isToday(h.at)).length
    if (t.status === 'failed' && isToday(t.updated_at)) failed++
    for (const r of t.runs ?? []) if (r.tokens && isToday(r.ended ?? r.started)) tokens += tokenCount(r.tokens)
  }
  return { merged, sentBack, failed, tokens }
}

/** The "today" lines in `width` columns: "today    ✓ 6 merged   ↺ 9 sent back   ✗ 1 failed   Σ 18.4M tokens", on more lines (never cut) when narrow. */
export function todayLines(d: LiveToday, width: number): string[] {
  const head = 'today    '
  const parts = [`✓ ${d.merged} merged`, `↺ ${d.sentBack} sent back`, `✗ ${d.failed} failed`, `Σ ${fmtTokens(d.tokens)} tokens`]
  for (const gap of ['   ', '  ', ' ']) {
    const one = head + parts.join(gap)
    if (textWidth(one) <= width) return [one]
  }
  const out: string[] = []
  let cur = ''
  for (const p of parts) {
    const next = cur ? `${cur}  ${p}` : p
    if (cur && textWidth(head + next) > width) {
      out.push(cur)
      cur = p
    } else cur = next
  }
  out.push(cur)
  return out.map((x, i) => (i ? ' '.repeat(head.length) : head) + x)
}
