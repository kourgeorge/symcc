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
import { type KeyHint, LIVE_VIEW_KEYS, hintLineText, hintLines, rowDuration, waitOrder } from './panel'
import { ORG_MEM_EMPTY, ORG_MEM_MAX_LINES, TOPIC_UNSORTED, orgMemNearCap, orgMemNewest, orgMemSectionKeys, orgMemShortDay, orgMemTopicCounts, type OrgMemNote } from './org-mem'
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

// T-715: waiting trains. A todo task that still waits for an unfinished task hangs, as a "train" (└─◇), under the lane
// of the running task it waits for, or under the train of the todo task it waits for (a chain), down to a lane:
//                  work   check  queue  tests  merged
//  T-712 Scout or… ●━━━━━━◉──────○──────○──────○  2m
//   bug  try 1/3   ▕████░░░░▏ 1.1M
//    └─◇ T-713 Task files: no si…  waits
//       └─◇ T-714 Help: /symcc-h…  waits
//    └─◇ T-716 Live deps…  waits  + also T-690
// "next up" then lists only the tasks free to start, and those stuck behind a failed, paused or owner-waiting task.

/** A waiting train: a todo task hung under the lane or train it waits for; `also` the other unfinished tasks it waits
 *  for (it is shown once, under the one furthest from merging); `trains` the todo tasks hung under it, in start order. */
export type LiveTrain = { id: string; title: string; also: string[]; trains: LiveTrain[] }
/** A task "next up" lists: free to start (`stuck` empty), or waiting only for tasks that don't run nor wait to run
 *  (`stuck`: each one's id and what it is: "failed", "paused", "needs you" ...), so the owner sees it is stuck. */
export type NextUp = { id: string; title: string; stuck: { id: string; status: string }[] }
/** The trains of each lane (by its task's id), next up, `more` (the other todo tasks: they wait for a todo task that
 *  runs on no lane) and `hung` (how many tasks hang as trains). */
export type LiveTrains = { lanes: Record<string, LiveTrain[]>; next: NextUp[]; more: number; hung: number }

/** How a blocker that neither runs nor waits to run is named in next up's "(waits T-n, failed)". */
const STUCK_WORD: Partial<Record<SymccTask['status'], string>> = { failed: 'failed', paused: 'paused', waiting: 'needs you', review: 'in review', backlog: 'in backlog', dropped: 'dropped', doing: 'stopped' }

/**
 * The waiting trains of the Live tab and its next up list. A todo task whose after-list has an unfinished task hangs
 * once: under the running lane it waits for or under the train of a todo task it waits for (that one hung itself), the
 * one furthest from merging when there are several (a todo blocker before any running one, the one that starts last
 * first; else the lane at the earliest station, ties: the one that started latest); the others are its `also`.
 * A todo task waiting only for tasks that are neither running nor todo (failed, paused, waiting for the owner ...) is
 * "stuck" and goes to next up with them; so does every task free to start. Next up is in start order (the board's).
 */
export function liveTrains(view: LiveView, nowMs: number, lanes: readonly LiveLane[] = liveLanes(view, nowMs)): LiveTrains {
  const board = { tasks: view.tasks as BoardTask[], archived_done: view.archived_done ?? [] }
  const byId = new Map(view.tasks.map(t => [t.id, t]))
  const laneOf = new Map(lanes.map(l => [l.id, l]))
  const todo = waitOrder(view.tasks.filter(t => t.status === 'todo'), (x, y) => x.order - y.order || num(x.id) - num(y.id))
  const rank = new Map(todo.map((t, i) => [t.id, i]))
  const open = new Map(todo.map(t => [t.id, [...new Set((t.after ?? []).filter(a => a !== t.id && !depDone(board, a)))]]))
  const parent = new Map<string, string>()
  /** Whether `id`'s chain of parents (up to a lane) passes `through`. */
  const under = (id: string, through: string) => {
    const seen = new Set<string>()
    for (let x: string | undefined = id; x && !seen.has(x); x = parent.get(x)) {
      if (x === through) return true
      seen.add(x)
    }
    return false
  }
  /** Furthest from merging first: a todo blocker (the later it starts, the further), then the earliest station, then the latest start. */
  const further = (a: string, b: string) => {
    const la = laneOf.get(a)
    const lb = laneOf.get(b)
    if (!la || !lb) return la ? 1 : lb ? -1 : (rank.get(b) ?? 0) - (rank.get(a) ?? 0)
    return la.at - lb.at || lb.enteredMs - la.enteredMs || num(b) - num(a)
  }
  // a task can hang once its todo blocker hangs: go over them until nothing changes (a chain settles in its length's passes)
  for (let pass = 0, changed = true; changed && pass <= todo.length; pass++) {
    changed = false
    for (const t of todo) {
      const can = open.get(t.id)!.filter(a => laneOf.has(a) || (parent.has(a) && !under(a, t.id)))
      const best = can.sort(further)[0]
      if (best && parent.get(t.id) !== best) parent.set(t.id, best), (changed = true)
    }
  }
  const build = (id: string): LiveTrain[] =>
    todo.filter(t => parent.get(t.id) === id).map(t => ({ id: t.id, title: t.title, also: open.get(t.id)!.filter(a => a !== id), trains: build(t.id) }))
  const next: NextUp[] = []
  let more = 0
  for (const t of todo) {
    if (parent.has(t.id)) continue
    const waits = open.get(t.id)!
    const stuck = waits.every(a => !laneOf.has(a) && byId.get(a)?.status !== 'todo')
    if (stuck) next.push({ id: t.id, title: t.title, stuck: waits.map(a => ({ id: a, status: STUCK_WORD[byId.get(a)?.status ?? 'done'] ?? (byId.has(a) ? byId.get(a)!.status : 'not found') })) })
    else more++
  }
  return { lanes: Object.fromEntries(lanes.map(l => [l.id, build(l.id)])), next, more, hung: parent.size }
}

/** A row of a lane's trains: a train (`id`, at `depth` 1, 2, 3 ...) or the "└─ +N more waiting" row (no id). */
export type TrainRow = { id?: string; depth: number; segs: LiveSeg[] }
/** At most this many levels of trains under a lane, and this many trains; the rest are "└─ +N more waiting". */
export const TRAIN_DEPTH = 3
export const TRAIN_MAX = 6
const TRAIN_TITLE = 24

/** Cuts text to `width` columns, with "…" when cut. */
const fitText = (s: string, width: number) => (textWidth(s) <= width ? s : cutTitle(s, Math.max(1, width)))

/**
 * A lane's trains as rows in `width` columns, top to bottom (each train, then the trains hung under it), never wider
 * than `width`: "   └─◇ T-713 Task files: no si…  waits  + also T-690". Narrower, the title gets shorter, the
 * "+ also" names give way to a count, "waits" goes, then the title. Past TRAIN_DEPTH levels or TRAIN_MAX trains, one
 * "   └─ +N more waiting" row counts the rest.
 */
export function trainRows(trains: readonly LiveTrain[], width: number): TrainRow[] {
  const out: TrainRow[] = []
  let hidden = 0
  const count = (xs: readonly LiveTrain[]): number => xs.reduce((n, x) => n + 1 + count(x.trains), 0)
  const walk = (xs: readonly LiveTrain[], depth: number) => {
    for (const x of xs) {
      if (depth > TRAIN_DEPTH || out.length >= TRAIN_MAX) {
        hidden += 1 + count(x.trains)
        continue
      }
      out.push({ id: x.id, depth, segs: trainLine(x, depth, width) })
      walk(x.trains, depth + 1)
    }
  }
  walk(trains, 1)
  if (hidden) out.push({ depth: 1, segs: [{ text: fitText(`   └─ +${hidden} more waiting`, width), tone: 'dim' }] })
  return out
}

/** One train's row (see trainRows). */
function trainLine(x: LiveTrain, depth: number, width: number): LiveSeg[] {
  const lead = `${' '.repeat(3 * depth)}└─◇ `
  const n = x.also.length
  const alsos = n ? [`  + also ${x.also.join(', ')}`, ...(n > 1 ? [`  + also ${x.also[0]} +${n - 1}`] : []), `  +${n}`] : ['']
  const tries: { also: string; waits: string }[] = []
  for (const waits of ['  waits', '']) for (const also of alsos) tries.push({ also, waits })
  const make = (t: { also: string; waits: string }, titleW: number): LiveSeg[] =>
    segs({ text: lead, tone: 'dim' }, { text: x.id, tone: 'id' }, titleW > 0 && { text: ` ${cutTitle(x.title, titleW)}`, tone: 'title' }, { text: t.waits, tone: 'dim' }, { text: t.also, tone: 'dim' })
  for (const least of [8, 3])
    for (const t of tries) {
      const room = width - textWidth(lead + x.id + t.waits + t.also) - 1
      if (room >= Math.min(least, textWidth(x.title))) return make(t, Math.min(room, TRAIN_TITLE))
    }
  for (const t of tries) if (textWidth(lead + x.id + t.waits + t.also) <= width) return make(t, 0)
  // narrower than its lead and id: cut
  return [{ text: fitText(lead + x.id, width), tone: 'dim' }]
}

/**
 * The "next up" line in `width` columns: "next up  T-690 Live tab… · T-692 Help pa… (waits T-601, failed) · 2 more";
 * the tasks free to start and the stuck ones (see liveTrains) in start order, as many as fit (at most 3) with titles
 * cut to 12, else to 6, else with no titles, then how many more todo tasks are not shown (trains aside);
 * "nothing in todo" when there is no todo task, "nothing free to start" when all of them wait.
 */
export function nextUpLine(t: Pick<LiveTrains, 'next' | 'more' | 'hung'>, width: number): string {
  const head = 'next up  '
  const items = t.next
  if (!items.length) return t.more + t.hung ? fitText(`${head}nothing free to start${t.more ? ` · ${t.more} more` : ''}`, width) : `${head}nothing in todo`
  const one = (x: NextUp, w: number) => `${x.id}${w ? ` ${cutTitle(x.title, w)}` : ''}${x.stuck.length ? ` (waits ${x.stuck.map(s => `${s.id}, ${s.status}`).join('; ')})` : ''}`
  const line = (n: number, w: number) => {
    const more = items.length - n + t.more
    return head + [...items.slice(0, n).map(x => one(x, w)), ...(more ? [`${more} more`] : [])].join(' · ')
  }
  for (const w of [12, 6]) for (let n = Math.min(3, items.length); n >= 1; n--) if (textWidth(line(n, w)) <= width) return line(n, w)
  for (let n = Math.min(3, items.length); n >= 1; n--) if (textWidth(line(n, 0)) <= width) return line(n, 0)
  return fitText(line(1, 0), width)
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

// ---------------- T-718: the Organizational memory section at the bottom of the Live tab ----------------
//  ── Organizational memory ───────────────────── 57 / 60 ▕█████████░▏
//   newest
//    11-21  tests      In tests, put dates relative to now, never a…
//   topics
//    tests · snapshots   14    git & guards       11    OpenCode   9
//   ↑↓ move · Enter open topic · m all notes

/** One topic cell of the section's grid: its topic, count and text (with the indent or gap before it, padded to its column). */
export type OrgMemCell = { topic: string; count: number; segs: LiveSeg[] }

/** The section as lines in a width: the header, the newest notes (each with its note), the topic grid (rows of cells), the key hints. */
export type LiveOrgMem = {
  head: LiveSeg[]
  newestLabel: string
  newest: { note: OrgMemNote; segs: LiveSeg[] }[]
  /** '' or what is said in place of the newest notes (no notes yet) */
  empty: string
  topicsLabel: string
  grid: OrgMemCell[][]
  keys: string[]
}

/** The most columns of the topic grid. */
export const ORG_MEM_GRID_MAX = 4
const GRID_LEAD = '   '
const GRID_GAP = '    '
const NEWEST_TOPIC_MAX = 16

/** The section's header in `width` columns: the title, a rule, the count of the cap and a fill bar (shorter, then
 *  left out, then the title shorter, when narrow). Near the cap (orgMemNearCap) the count and bar are warnings. */
function orgMemHead(n: number, width: number): LiveSeg[] {
  const warn = orgMemNearCap(n)
  const count = `${n} / ${ORG_MEM_MAX_LINES}`
  for (const title of ['Organizational memory', 'Org-mem'])
    for (const cells of [10, 6, 0]) {
      const bar = cells ? ` ${tokenBar(n, ORG_MEM_MAX_LINES, cells)}` : ''
      const fixed = textWidth(` ── ${title} `) + textWidth(` ${count}${bar}`)
      if (fixed + 3 > width) continue
      return segs(
        { text: ' ── ', tone: 'dim' },
        { text: title, tone: 'text' },
        { text: ` ${'─'.repeat(width - fixed)} `, tone: 'dim' },
        { text: count, tone: warn ? 'warning' : 'text' },
        { text: bar, tone: warn ? 'warning' : 'bar' },
      )
    }
  return [{ text: fitText(`Org-mem ${count}`, width), tone: 'text' }]
}

/** The newest notes' lines: "   11-21  tests      text cut with …", the topic column as wide as the longest topic shown (cut when narrow). */
function newestLines(notes: readonly OrgMemNote[], width: number): { note: OrgMemNote; segs: LiveSeg[] }[] {
  const lead = '   '
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
      { text: `  ${padWidth(fitText(note.topic, topicW), topicW)}`, tone: note.topic === TOPIC_UNSORTED ? 'dim' : 'id' },
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
        { text: `${c ? GRID_GAP : GRID_LEAD}${padWidth(fitText(x.topic, nameW[c]!), nameW[c]!)}`, tone: x.topic === TOPIC_UNSORTED ? 'dim' : 'text' },
        { text: `  ${String(x.count).padStart(countW[c]!)}`, tone: 'dim' },
      ],
    })
  })
  return rows
}

/** The Live tab's Organizational memory section for `notes` (orgMemNotes: newest first) in `width` columns (see
 *  above): no line wider than `width`. */
export function liveOrgMem(notes: readonly OrgMemNote[], width: number): LiveOrgMem {
  const w = Math.max(1, Math.floor(width))
  const keys = hintLines(orgMemSectionKeys(), w - 2).map(l => `  ${hintLineText(l)}`)
  return {
    head: orgMemHead(notes.length, w),
    newestLabel: '  newest',
    newest: newestLines(orgMemNewest(notes), w),
    empty: notes.length ? '' : `  ${ORG_MEM_EMPTY}`,
    topicsLabel: '  topics',
    grid: topicGrid(orgMemTopicCounts(notes), w),
    keys: keys.map(k => fitText(k, w)),
  }
}
