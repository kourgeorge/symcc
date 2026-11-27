// The board panel's Live tab (T-690): one "railway lane" per task in doing, showing the station it is at on its way to
// the merge (work → check → queue → tests → done), its tokens, then what starts next and today's numbers. Everything
// a client needs is worked out here, the lane text included (cut titles, station marks, the blinking current station),
// so each client (Claude Code's terminal panel now; VS Code and OpenCode later) only draws the segments.
import type { SymccMode, SymccTask } from '../../types'
import { type BoardTask, type ChangeSize, OPEN, byRunOrder, DEFAULT_AUTO_RETRIES, emptyBoard, kindOf, isInvestigation, modeOf } from './board-file'
import { stageStep, taskPhase, type PhaseStage } from './phase'
import { handedBack, shownStatus } from './lead'
import { median, taskFigures } from './stats'
import { cutTitle, fitSegs, padWidth, textWidth, wrapLine } from './width'
import { activeFrom, restartsOf, gapsOf, agentsOf, agentsOnTask, sumRuns,checkerIdOf, checkerTokensOf, tryCost, tryTokens, fmtCost, fmtDuration, fmtTokens, sumTokens, tokenCount, TOKEN_SIGN, fmtTok } from './runs'
import { type KeyHint, LIVE_VIEW_KEYS, hintLineText, hintLines, rowDuration, waitOrder } from './panel'
import { ORG_MEM_EMPTY, ORG_MEM_MAX_LINES, TOPIC_UNSORTED, ORG_MEM_ALL, orgMemNewest, orgMemShortDay, orgMemTopicCounts, type OrgMemNote } from './org-mem'
import { depDone, openAfter } from './archive'
import { dayOf, localOffset } from './days'
import { modeLabel, needsReview } from './review'
import { num, plural } from './text'
import { asksMoreTime, needsYou } from './commands'
import { fileWaitText, rowMark, rowTitle, STEP_WORD, taskAsks } from './panel'
import { isOpenQuestion } from './questions'
import { whyFailed } from './failure'
import { newestFirst } from './settings'
import { isAnswered } from './task'
import { viewMarks } from './board-parts'
import { STATUS_MARK } from './details'
import { sizeText } from './commits'

/**
 * The kinds and times of task `t`'s timeline lines. A board view's done or dropped task (viewTask, e.g. OpenCode's)
 * comes without its timeline, and OpenCode's TUI then fills it in as `timeline: []` (viewStubFilled): its timeline marks
 * (the kinds and times of its merge and send-back lines) stand in for it whenever it has them and no timeline lines.
 */
function marksOf(t: { timeline?: readonly { kind: string; at?: string; reason?: string }[] }): readonly { kind: string; at?: string; reason?: string }[] {
  const timeline = Array.isArray(t.timeline) ? t.timeline : []
  return timeline.length > 0 ? timeline : (viewMarks(t) ?? timeline)
}

/**
 * T-781: task `t`'s send-backs on one day (`isToday` tells by the mark's time): `all` counts every one the way /symcc-stats
 * lists failed tries (the checker's problems, tests failed, a clash with main), `checker` only the checker's. A finished
 * task's board view keeps marks (no text) of the checker's lines and of its tests-failed and clash lines (with their reason).
 */
function sentBackOf(t: { timeline?: readonly { kind: string; at?: string; reason?: string }[] }, isToday: (at: string | undefined) => boolean): { all: number; checker: number } {
  const marks = marksOf(t) as readonly { kind: string; at?: string; reason?: string }[]
  const checker = marks.filter(h => h.kind === 'checker-problems' && isToday(h.at)).length
  const other = marks.filter(h => (h.reason === 'tests' || h.reason === 'clash') && isToday(h.at)).length
  return { all: checker + other, checker }
}

/** The stations of a lane, in the order a task passes them. */
export type LiveStation = 'work' | 'check' | 'queue' | 'tests' | 'you' | 'done'
/** T-846: every station, in the order the lanes' columns have them. 'you' (the owner reads and approves) sits before 'done' on
 *  a task that needs review; 'done' ends every lane, an investigation's too (work → done). */
export const LIVE_STATIONS: readonly LiveStation[] = ['work', 'check', 'queue', 'tests', 'you', 'done']
/** T-760: the mark after a station name where an agent works (work, check): those stations need an agent slot. */
export const LIVE_AGENT_MARK = '✧'
/** The line under the lanes that says what LIVE_AGENT_MARK after a station name means. */
export const LIVE_LEGEND = `${LIVE_AGENT_MARK} = an agent works here (needs an agent slot) · ${TOKEN_SIGN} = tokens`
/** T-855: the dim note ending ▍Today when no lane shows the key line. */
export const TOKENS_NOTE = `${TOKEN_SIGN} = tokens`
/** The legend under the lanes in `width` columns: LIVE_LEGEND, cut at spaces onto more lines when narrow (never wider).
 *  T-867: the lanes have no token bar any more, so nothing about a bar. */
export function liveLegend(width: number): string[] {
  // T-760: the mark's line is long, so a narrow panel wraps it
  return wrapLine(LIVE_LEGEND, Math.max(1, Math.floor(width)))
}
/** T-903: what the Live tab's TASKS section says, dim, when no task runs: why nothing runs and what to do next. */
export const LIVE_IDLE = {
  paused: 'Paused: nothing starts. /symcc-mode auto starts work again.',
  fresh: 'No tasks yet. Tell the lead what you want built.',
  done: 'All done',
  next: "Tell the lead what's next",
} as const
/** The most reasons the "Nothing running · n waiting: ..." line names. */
const IDLE_REASONS = 3
/** T-924: how many backlog items the "All done" lines list. */
export const IDLE_BACKLOG = 3
/** "12m", "3h 05m", "2d": how long ago, short. */
const idleAgo = (ms: number) => (ms >= 86_400_000 ? `${Math.floor(ms / 86_400_000)}d` : fmtDuration(ms))
/** Why open task `t` does not run while nothing runs: "needs you", "waits for T-6", "paused", "ready" ... */
function idleReason(t: BoardTask, view: LiveView, nowMs: number): string {
  if (needsYou(t, nowMs)) return 'needs you'
  if (t.status === 'paused') return 'paused'
  if (t.status === 'doing') return 'stopped'
  if (t.status === 'todo') {
    const board = { tasks: view.tasks as BoardTask[], archived_done: view.archived_done ?? [] }
    const open = openAfter(board, t)
    // only the first open task, plus a count of the rest: no ", " inside one reason (", " parts the tasks' reasons)
    if (open.length) return `waits for ${open[0]}${open.length > 1 ? ` +${open.length - 1}` : ''}`
    return 'ready'
  }
  return STUCK_WORD[t.status] ?? t.status
}
/**
 * T-903: the dim line or two the Live tab's TASKS section shows (and the band's first line, and /<name>-status) when no
 * task runs, in `width` columns, by why nothing runs: a new board (no tasks ever), the paused mode, open tasks that wait
 * ("Nothing running · 3 waiting: T-5 needs you, T-7 waits for T-6", the first reasons that fit), or no open task at all
 * ("All done · last merged T-891, 12m ago", then what to do next, with the backlog's count when it has items).
 */
export function liveIdle(view: Pick<LiveView, 'tasks' | 'mode' | 'archived_done'>, nowMs: number, width = 80): string[] {
  const w = Math.max(1, Math.floor(width))
  // cut at spaces onto more lines when narrow, no indent on the next lines
  const wrap = (s: string) => {
    const out: string[] = []
    let rest = s
    while (textWidth(rest) > w) {
      const cut = rest.lastIndexOf(' ', w)
      if (cut <= 0) break
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut + 1)
    }
    return [...out, fitText(rest, w)]
  }
  const tasks = view.tasks as BoardTask[]
  if (!tasks.length && !(view.archived_done ?? []).length) return wrap(LIVE_IDLE.fresh)
  if (modeOf(view) === 'paused') return wrap(LIVE_IDLE.paused)
  const open = tasks.filter(t => OPEN.includes(t.status))
  if (open.length) {
    const sorted = [...open.filter(t => needsYou(t, nowMs)), ...open.filter(t => !needsYou(t, nowMs))]
    const head = `Nothing running · ${open.length} waiting`
    let text = head
    for (let i = 0; i < Math.min(IDLE_REASONS, sorted.length); i++) {
      const t = sorted[i]!
      const more = `${i ? ', ' : ': '}${t.id} ${idleReason(t, view as LiveView, nowMs)}`
      if (i && textWidth(text + more) > w) break
      text += more
    }
    return [fitText(text, w)]
  }
  const { last, items } = idleDone(tasks)
  const backlog = items.length
  const first = last ? `${LIVE_IDLE.done} · last merged ${last.t.id}, ${idleAgo(nowMs - last.at)} ago` : LIVE_IDLE.done
  const second = `${LIVE_IDLE.next}${backlog ? `, or move ${backlog === 1 ? 'the backlog item' : `one of ${backlog} backlog items`} to todo` : ''}.`
  // T-924: the next backlog items (lowest priority first, then oldest), one line each, then how many more
  const next = items.slice(0, IDLE_BACKLOG).map(t => fitText(`  ${STATUS_MARK.backlog} ${t.id}  ${rowTitle(t)}`, w))
  const more = backlog - next.length
  return [fitText(first, w), ...wrap(second), ...next, ...(more > 0 ? [fitText(`  … ${more} more in the backlog`, w)] : [])]
}
/** The last merged task (when it is known) and the backlog items in run order: what the "All done" lines name. */
function idleDone(tasks: readonly BoardTask[]): { last?: { t: BoardTask; at: number }; items: BoardTask[] } {
  const last = tasks
    .filter(t => t.status === 'done')
    .map(t => ({ t, at: finishedAt(t)?.atMs }))
    .filter((x): x is { t: BoardTask; at: number } => x.at !== undefined)
    .sort((a, b) => b.at - a.at || num(b.t.id) - num(a.t.id))[0]
  return { ...(last ? { last } : {}), items: tasks.filter(t => t.status === 'backlog').sort(byRunOrder) }
}

/**
 * T-973: what nothing running means, in parts, for a client that draws the idle lines its own way (VS Code's Live tab):
 * `kind` (a new board, the paused mode, open tasks that wait, or all done), `text` the first line liveIdle says (whole),
 * and for all done the last merge (its id and how long ago, "20h") and the first IDLE_BACKLOG backlog items, with how
 * many more there are.
 */
export type LiveIdleFacts = { kind: 'fresh' | 'paused' | 'waiting' | 'done'; text: string; last?: { id: string; ago: string }; next: { id: string; title: string }[]; more: number; backlog: number }
export function liveIdleFacts(view: Pick<LiveView, 'tasks' | 'mode' | 'archived_done'>, nowMs: number): LiveIdleFacts {
  const tasks = view.tasks as BoardTask[]
  const text = liveIdle(view, nowMs, Infinity)[0] ?? ''
  const none = { next: [], more: 0, backlog: 0 }
  if (!tasks.length && !(view.archived_done ?? []).length) return { kind: 'fresh', text, ...none }
  if (modeOf(view) === 'paused') return { kind: 'paused', text, ...none }
  if (tasks.some(t => OPEN.includes(t.status))) return { kind: 'waiting', text, ...none }
  const { last, items } = idleDone(tasks)
  const next = items.slice(0, IDLE_BACKLOG).map(t => ({ id: t.id, title: rowTitle(t) }))
  return { kind: 'done', text, ...(last ? { last: { id: last.t.id, ago: idleAgo(nowMs - last.at) } } : {}), next, more: items.length - next.length, backlog: items.length }
}

/** T-903: the one idle line the band shows: liveIdle's first line, but a sentence that does not fit is cut with "…"
 *  (never broken at a space, which would read like a broken line). */
export function liveIdleLine(view: Pick<LiveView, 'tasks' | 'mode' | 'archived_done'>, nowMs: number, width = 80): string {
  const w = Math.max(1, Math.floor(width))
  const whole = liveIdle(view, nowMs, Infinity)[0] ?? ''
  // the waiting line already drops the reasons that don't fit at `w`; the others are one sentence, cut with "…"
  return textWidth(whole) <= w ? whole : whole.startsWith('Nothing running') ? (liveIdle(view, nowMs, w)[0] ?? '') : fitText(whole, w)
}
/** The stations of a normal code task that merges on its own: check only when the checker setting is on. */
export const liveStations = (checker: boolean): LiveStation[] => LIVE_STATIONS.filter(s => s !== 'you' && (s !== 'check' || checker))
/** T-846: the stations of one task's real path: an investigation goes work → done; a task that needs review has "you" before done. */
export function laneStations(t: { kind?: unknown }, checker: boolean, review: boolean): LiveStation[] {
  if (isInvestigation(t as SymccTask)) return ['work', 'done']
  return LIVE_STATIONS.filter(s => (s !== 'check' || checker) && (s !== 'you' || review))
}
/** T-846: the columns the lanes share (the label line over them): every station any lane has, in order; the usual stations when no lane runs. */
export function liveColumns(lanes: readonly Pick<LiveLane, 'stations'>[], checker: boolean): LiveStation[] {
  if (!lanes.length) return liveStations(checker)
  return LIVE_STATIONS.filter(s => lanes.some(l => l.stations.includes(s)))
}

/** The terminal panel's tabs in order, with their keys: Live, Tasks, Scouts, Settings. */
export const LIVE_TABS = [
  { tab: 'live', label: 'Live', key: 'l' },
  { tab: 'tasks', label: 'Tasks', key: 't' },
  { tab: 'scouts', label: 'Scouts', key: 's' },
  { tab: 'settings', label: 'Settings', key: 'c' },
] as const
/** The keys under the Live tab. */
export const liveKeys = (): KeyHint[] => [
  { key: '↑↓', word: 'move' },
  { key: 'Enter', word: 'open task' },
  { key: 'w', word: 'watch worker' },
  { key: LIVE_VIEW_KEYS, word: 'views' },
  { key: 'Esc', word: 'close' },
]

/**
 * The tab row's words for `width` columns: "[l]: Live │ [t]: Tasks (20)" with " │ " between; when that is too wide, "[t] Tasks (20)",
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
export type LiveView = { tasks: SymccTask[]; checker?: boolean; auto_retries?: number; max_parallel?: number; mode?: SymccMode; archived_done?: string[]; branches?: BranchFacts; /** T-769: ▍Today's lead, scout and cost figures (app/lead.ts) */ today_team?: TodayTeam }

/**
 * One lane: a task in doing. `station` is where it is (`at` its place in `stations`); `sinceMs` when it got there;
 * `place` its place in the merge queue (in the queue only); `tryNo`/`tries` its try and how many it may have
 * (its auto retries after failing tests included); `tokens` what the whole task has recorded so far, all its tries
 * (a running worker's tokens are only recorded when it hands back, so none for its try while it works: then `more`
 * is set and `tokens` is the earlier tries' sum, or left out when there is none); `usual` the board's usual tokens per
 * merged task;`sentBack` how often the checker sent it back; `enteredMs` when its current doing spell began (its
 * current try's start); `agent` whether an agent (its worker or checker) runs on it now.
 */
export type LiveLane = {
  id: string
  title: string
  kind: string
  stations: LiveStation[]
  station: LiveStation
  /** the place of `station` in this lane's own `stations` */
  at: number
  /** T-846: stations on this lane that the task skips (check, for a docs-only change): drawn as a dim "–" */
  skipped?: LiveStation[]
  stage: PhaseStage
  sinceMs?: number
  place?: number
  tryNo: number
  tries: number
  tokens?: number
  more?: boolean
  usual?: number
  /** T-867: the task's active time so far, all its tries (runMs: closed-app stretches left out), in ms */
  activeMs?: number
  /** T-867: the task's tokens split by agent kind (its tries' agent entries), left out when 0 */
  workerTokens?: number
  checkerTokens?: number
  sentBack: number
  enteredMs: number
  agent: boolean
  /** T-771: set on a finished lane (a task merged in the last LIVE_FINISHED_MS):
   *  when it merged and the word its right column says ("merged 3m ago"). */
  done?: { atMs: number; word: 'merged' }
  /** T-1080: a finished lane's change size (the task's saved size); ends its second line as "+539 −3,722" */
  size?: ChangeSize
}

/** T-771: how long a just-merged task keeps its lane (drawn finished, dim), and at most how many such lanes there are. */
export const LIVE_FINISHED_MS = 10 * 60_000
export const LIVE_FINISHED_MAX = 3

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
      return 'done'
  }
}

/** T-867: task `t`'s active time (all tries, up to `nowMs`) and its tokens by agent kind, as lane fields (0s left out). */
function usageOf(t: SymccTask, nowMs?: number): Pick<LiveLane, 'activeMs' | 'workerTokens' | 'checkerTokens'> {
  const activeMs = sumRuns(t.runs, nowMs).ms
  const agents = agentsOnTask(t)
  const of = (kind: 'worker' | 'checker') => tokenCount(sumTokens(agents.filter(a => a.kind === kind).map(a => a.tokens)))
  const worker = of('worker')
  const checker = of('checker')
  return { ...(activeMs > 0 ? { activeMs } : {}), ...(worker > 0 ? { workerTokens: worker } : {}), ...(checker > 0 ? { checkerTokens: checker } : {}) }
}

/** The board's usual tokens per merged task: the middle value over the done tasks (not investigations) with tokens. */
export function usualTokens(tasks: readonly SymccTask[]): number | undefined {
  const xs = tasks
    .filter(t => t.status === 'done' && !isInvestigation(t) && (t.runs ?? []).some(r => tryTokens(r)))
    .map(t => tokenCount(sumTokens((t.runs ?? []).map(tryTokens))))
    .filter(n => n > 0)
  return median(xs)
}

const ms = (iso: string | undefined): number | undefined => {
  const n = iso ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** When task `t` got to `station` in its try that started at `startMs`: the timeline's stage lines (T-616), else the hand-back, else the check step's mark. */
function stationSince(t: BoardTask, station: LiveStation, startMs: number | undefined): number | undefined {
  if (station === 'work') return startMs
  // T-863: the check step starts at the first prep or checker line after the last restart (older lines belong to the closed session's hand-back)
  const restartMs = ms(restartsOf(t.runs?.[t.runs.length - 1]).at(-1)?.started)
  const from = station === 'check' && restartMs !== undefined ? Math.max(restartMs, startMs ?? restartMs) : startMs
  const stageAt = (steps: string[], first: boolean) => {
    const hits = (t.timeline ?? []).filter(h => h.kind === 'stage' && h.step !== undefined && steps.includes(h.step)).map(h => ms(h.at)).filter((n): n is number => n !== undefined && (from === undefined || n >= from))
    return hits.length ? (first ? Math.min(...hits) : Math.max(...hits)) : undefined
  }
  const found = station === 'check' ? stageAt(['prep', 'checker'], true) : station === 'queue' ? stageAt(['queue'], false) : station === 'tests' ? stageAt(['tests'], false) : stageAt(['merge'], false)
  return found ?? (station === 'check' ? ms(t.runs?.[t.runs.length - 1]?.ended) : undefined) ?? ms(t.live?.checking?.at)
}

/** When the approve (or files-merge) running on task `t` (in review or waiting) started: its last "prep started" line
 *  after its try ended, else its check step's mark. */
function approveSince(t: BoardTask, endMs: number | undefined): number | undefined {
  const preps = (t.timeline ?? []).filter(h => h.kind === 'stage' && h.step === 'prep').map(h => ms(h.at)).filter((n): n is number => n !== undefined && (endMs === undefined || n >= endMs))
  return preps.length ? Math.max(...preps) : ms(t.live?.checking?.at)
}

/**
 * T-846: whether task `t`'s checker is skipped, so its lane draws "check –": no checker ran on this try and the
 * task's files are docs only (the checker skips such a change; known once it handed back). Before its hand-back nothing
 * is known, so nothing is skipped.
 */
function checkSkipped(t: BoardTask, stage: PhaseStage, waiting: boolean): boolean {
  if (!waiting && (stage === 'worker' || stage === 'checker')) return false
  const ran = agentsOf(t.runs?.[t.runs.length - 1]).some(a => a.kind === 'checker') || (t.timeline ?? []).some(h => h.kind === 'stage' && h.step === 'checker')
  if (ran) return false
  // the files this try's commit really changed (saved on the try by the prep step); until prep knows, check is drawn as usual
  return t.runs?.[t.runs.length - 1]?.docs_only === true
}

/** The lanes of the Live tab: one per task the board shows as doing (shownStatus: a task in doing, or one in review or
 *  waiting whose approve or merge runs, with a fresh check step), the one that entered doing (or whose approve began) first at the top. */
export function liveLanes(view: LiveView, nowMs: number): LiveLane[] {
  const checker = view.checker === true
  const usual = usualTokens(view.tasks)
  const retries = view.auto_retries ?? DEFAULT_AUTO_RETRIES
  const lanes = view.tasks
    // T-846: a task in review (tests passed, waits for the owner) keeps its lane, sitting at "you"
    .filter(t => shownStatus(t as BoardTask, nowMs) === 'doing' || (t.status === 'review' && !isInvestigation(t)))
    .map((x): LiveLane => {
      const t = x as BoardTask
      const waiting = shownStatus(t, nowMs) !== 'doing'
      const stations = laneStations(t, checker, waiting || t.status === 'review' || needsReview(view, t))
      let stage: PhaseStage = taskPhase(t, nowMs).stage ?? 'worker'
      if (stage === 'worker' && handedBack(t)) stage = 'prep'
      const investigation = isInvestigation(t)
      // an approve running on a task with a "you" station: the owner said yes, so it sits at done, never back at tests
      let station: LiveStation = waiting ? 'you' : investigation ? (stage === 'worker' ? 'work' : 'done') : t.status !== 'doing' && stations.includes('you') ? 'done' : stationOf(stage, checker)
      const skipped = checker && !investigation && checkSkipped(t, stage, waiting)
      // a docs-only change has no check to sit at: in prep it is already waiting for the queue
      if (skipped && station === 'check') station = 'queue'
      const run = t.runs?.[t.runs.length - 1]
      const startMs = ms(run?.started)
      const approving = t.status !== 'doing' && !waiting
      const enteredMs = (waiting ? ms(run?.ended) : approving ? approveSince(t, ms(run?.ended)) : startMs) ?? ms(t.updated_at) ?? ms(t.created_at) ?? 0
      // T-863: a step's time is the active time since the step began: stretches when no session was open (a try goes on after a reopen) are left out
      const stepMs = waiting ? enteredMs : stationSince(t, station, approving ? enteredMs : startMs)
      const sinceMs = stepMs !== undefined && !waiting ? activeFrom(run, stepMs) : stepMs
      const tryNo = Math.max(1, Number(t.attempts) || 1)
      const auto = Number(t.test_tries ?? 0) || 0
      const place = stage === 'queue' ? t.live?.checking?.place : undefined
      // T-757: the whole task's tokens (every try); the current try's are known only once it hands back
      const runs = t.runs ?? []
      const more = !!run && !tryTokens(run)
      const total = tokenCount(sumTokens(runs.map(tryTokens)))
      return {
        id: t.id,
        title: rowTitle(t),
        kind: kindOf(t),
        stations,
        station,
        at: stations.indexOf(station),
        ...(skipped ? { skipped: ['check' as const] } : {}),
        stage: waiting ? 'test' : stage,
        ...(sinceMs !== undefined ? { sinceMs } : {}),
        ...(place ? { place } : {}),
        tryNo,
        tries: Math.max(tryNo, tryNo - auto + retries),
        ...(total > 0 ? { tokens: total } : {}),
        ...(more && total > 0 ? { more } : {}),
        ...(usual ? { usual } : {}),
        ...usageOf(t, nowMs),
        sentBack: (t.timeline ?? []).filter(h => h.kind === 'checker-problems').length,
        enteredMs,
        agent: !waiting && stage === 'worker' || (stage === 'checker' && !!checkerIdOf(t)),
      }
    })
  return lanes.sort((a, b) => a.enteredMs - b.enteredMs || num(a.id) - num(b.id))
}

/** T-771: when done task `t` merged: its last "merged" timeline line (else its last try's end, when it has such a
 *  line without a time). Undefined when it did not merge (investigations never do). */
function finishedAt(t: SymccTask): { atMs: number; word: 'merged' } | undefined {
  const marks = marksOf(t)
  const lastEnd = ms(t.runs?.[t.runs.length - 1]?.ended)
  const latest = (kind: string) => {
    const xs = marks.filter(h => h.kind === kind).map(h => ms(h.at)).filter((n): n is number => n !== undefined)
    return xs.length ? Math.max(...xs) : undefined
  }
  if (isInvestigation(t) || !marks.some(h => h.kind === 'merged')) return undefined
  const at = latest('merged') ?? lastEnd
  return at !== undefined ? { atMs: at, word: 'merged' } : undefined
}

/**
 * T-771: the finished lanes: the tasks merged in the last LIVE_FINISHED_MS, newest first,
 * at most LIVE_FINISHED_MAX. Each is drawn as passed every station, ✓ at the last one, dim (laneLines), "merged 3m ago"
 * at its right. Failed or dropped tasks get none.
 */
export function liveFinishedLanes(view: LiveView, nowMs: number): LiveLane[] {
  const usual = usualTokens(view.tasks)
  const retries = view.auto_retries ?? DEFAULT_AUTO_RETRIES
  return view.tasks
    .filter(t => t.status === 'done')
    .map(t => ({ t, done: finishedAt(t) }))
    .filter((x): x is { t: SymccTask; done: NonNullable<LiveLane['done']> } => !!x.done && nowMs - x.done.atMs < LIVE_FINISHED_MS && x.done.atMs - nowMs < LIVE_FINISHED_MS)
    .sort((a, b) => b.done.atMs - a.done.atMs || num(b.t.id) - num(a.t.id))
    .slice(0, LIVE_FINISHED_MAX)
    .map(({ t, done }): LiveLane => {
      const stations = laneStations(t, view.checker === true, needsReview(view, t))
      const at = stations.length - 1
      const tryNo = Math.max(1, Number(t.attempts) || 1)
      const auto = Number(t.test_tries ?? 0) || 0
      const total = tokenCount(sumTokens((t.runs ?? []).map(tryTokens)))
      return {
        id: t.id,
        title: rowTitle(t),
        kind: kindOf(t),
        stations,
        station: stations[at]!,
        at,
        stage: 'merge',
        tryNo,
        tries: Math.max(tryNo, tryNo - auto + retries),
        ...(total > 0 ? { tokens: total } : {}),
        ...(usual ? { usual } : {}),
        ...((t as BoardTask).size ? { size: (t as BoardTask).size } : {}),
        ...usageOf(t),
        sentBack: marksOf(t).filter(h => h.kind === 'checker-problems').length,
        enteredMs: done.atMs,
        agent: false,
        done,
      }
    })
}

/** T-771: the ▍Tasks section's lanes: the running ones (liveLanes), then the finished ones under them (liveFinishedLanes). */
export function liveTaskLanes(view: LiveView, nowMs: number): LiveLane[] {
  const running = liveLanes(view, nowMs)
  const ids = new Set(running.map(l => l.id))
  return [...running, ...liveFinishedLanes(view, nowMs).filter(l => !ids.has(l.id))]
}

/** "⏵ auto merge · agents 2/3 busy": the board mode and the agents running (workers and checkers) against max_parallel. */
export function liveHeader(view: LiveView, lanes: readonly LiveLane[]): string {
  const max = view.max_parallel ?? emptyBoard().max_parallel
  return `${modeLabel(modeOf(view))} · agents ${lanes.filter(l => l.agent).length}/${max} busy`
}

/** T-770: a scout run going now (started, not queued for a slot): its name and when it started (ms). */
export type LiveScoutRun = { name: string; since: number }
/** T-808: the scout runs going now, worked out from the scouts: those started (not only queued), since their last run started (their last_run). */
export function scoutsRunning(scouts: readonly { name: string; running?: boolean; started?: boolean; last_run?: string | null }[] | undefined): LiveScoutRun[] {
  return (Array.isArray(scouts) ? scouts : []).flatMap(s => {
    const since = Date.parse(s?.last_run ?? '')
    return s?.running && s.started && Number.isFinite(since) ? [{ name: s.name, since }] : []
  }).sort((x, y) => x.since - y.since)
}
/** T-847: the scout whose timer fires soonest: its name and when (ms). */
export type LiveScoutNext = { name: string; at: number }
type ScoutLike = { name: string; running?: boolean; started?: boolean; last_run?: string | null; next_run?: string; paused?: boolean; every_minutes?: number }
/** T-847: the next scout due: not paused, not on demand, not running, with a next run time; the soonest one. null when none. */
export function scoutNext(scouts: readonly ScoutLike[] | undefined): LiveScoutNext | null {
  let best: LiveScoutNext | null = null
  for (const s of Array.isArray(scouts) ? scouts : []) {
    if (!s || s.paused || s.running) continue
    if (s.every_minutes !== undefined && !(Number.isFinite(s.every_minutes) && s.every_minutes >= 1)) continue
    const at = Date.parse(s.next_run ?? '')
    if (Number.isFinite(at) && (!best || at < best.at)) best = { name: s.name, at }
  }
  return best
}
/** T-770: the mark in front of the running scouts at the end of the mode line, drawn in the scout color. */
export const LIVE_SCOUT_MARK = '⌕'
/** What goes between the mode line and the scout mark. */
export const LIVE_SCOUT_GAP = ' · '

/**
 * T-770: the scout mark at the end of the Live tab's mode line ("⌕ gaps-bot 4m, board-review 1m · next: simplify in 40m"), or null when no
 * scout runs and none is due. `room`: the columns left after the mode line. The names and times when they fit (oldest run first),
 * else "⌕ 3 scouts", else "⌕ 3", else nothing. T-847: `next` (the scout due soonest) is added at the end while it fits, and dropped first.
 * `text` is what comes after the mark (with its leading space, '' when only "next" shows), drawn dim; `next` is the "next" part (with its leading separator), drawn dim.
 */
export function liveScoutMark(runs: readonly LiveScoutRun[] | undefined, nowMs: number, room = Infinity, next?: LiveScoutNext | null): { gap: string; mark: string; text: string; next?: string } | null {
  const list = (Array.isArray(runs) ? runs : []).filter(r => r && typeof r.name === 'string' && Number.isFinite(r.since)).slice().sort((a, b) => a.since - b.since)
  const n = list.length
  const nextText = next && Number.isFinite(next.at) ? `next: ${next.name} in ${fmtDuration(next.at - nowMs)}` : ''
  if (!n) {
    const text = nextText ? ` ${nextText}` : ''
    return text && textWidth(LIVE_SCOUT_GAP + LIVE_SCOUT_MARK + text) <= room ? { gap: LIVE_SCOUT_GAP, mark: LIVE_SCOUT_MARK, text } : null
  }
  const names = list.map(r => `${r.name} ${fmtDuration(nowMs - r.since)}`).join(', ')
  if (nextText) {
    const text = ` ${names}`, tail = ` · ${nextText}`
    if (textWidth(LIVE_SCOUT_GAP + LIVE_SCOUT_MARK + text + tail) <= room) return { gap: LIVE_SCOUT_GAP, mark: LIVE_SCOUT_MARK, text, next: tail }
  }
  for (const f of [names, plural(n, 'scout'), `${n}`]) {
    const text = ` ${f}`
    if (textWidth(LIVE_SCOUT_GAP + LIVE_SCOUT_MARK + text) <= room) return { gap: LIVE_SCOUT_GAP, mark: LIVE_SCOUT_MARK, text }
  }
  return null
}

/** T-770: the mode line with its scout mark as segments, within `width` columns: the line ('text'), then the gap
 *  ('text'), the mark ('scouts') and the names ('dim') while scouts run; T-847: then the next scout due ('dim'). */
export function liveHeaderSegs(view: LiveView & { scouts?: readonly ScoutLike[] }, lanes: readonly LiveLane[], nowMs: number, width = Infinity): LiveSeg[] {
  const head = liveHeader(view, lanes)
  const m = liveScoutMark(scoutsRunning(view.scouts), nowMs, width - textWidth(head), scoutNext(view.scouts))
  return [{ text: head, tone: 'text' }, ...(m ? [{ text: m.gap, tone: 'text' as const }, { text: m.mark, tone: 'scouts' as const }, { text: m.text, tone: 'dim' as const }, ...(m.next ? [{ text: m.next, tone: 'dim' as const }] : [])] : [])]
}

/** T-938: the label of ▍Today's first row, the mode line ("Now: ⏵ auto merge · agents 1/3 busy · ⌕ …"). */
export const LIVE_NOW_LABEL = 'Now: '
/** T-938: ▍Today's first row in `width` columns (the room under LIVE_INDENT): the dim "Now: " label, then the mode line
 *  with its scout mark (liveHeaderSegs: the label's segment first, the mode line's second, then the scout parts). As
 *  the old stand-alone line, when narrow the scout parts drop from the end; then (narrower than the label and the mode
 *  line) "agents n/m busy" goes too; the mode always stays. */
export function liveNowSegs(view: LiveView & { scouts?: readonly ScoutLike[] }, lanes: readonly LiveLane[], nowMs: number, width = Infinity): LiveSeg[] {
  const room = width - textWidth(LIVE_NOW_LABEL)
  const segs = textWidth(liveHeader(view, lanes)) <= room ? liveHeaderSegs(view, lanes, nowMs, room) : [{ text: modeLabel(modeOf(view)), tone: 'text' as const }]
  return [{ text: LIVE_NOW_LABEL, tone: 'dim' }, ...segs]
}

/** The current station's mark on redraw number `frame`: ◉ and ◎ in turn; always ◉ when `steady` (reduced motion). */
export const liveBlink = (frame: number, steady = false): string => (steady || frame % 2 === 0 ? '◉' : '◎')

/** How a lane's text is colored: each client picks its own colors for these. */
export type LiveTone = 'id' | 'title' | 'passed' | 'current' | 'future' | 'text' | 'dim' | 'warning' | 'bar' | 'heading' | 'mark' | 'run' | 'wait' | 'topic' | 'now' | 'failed' | 'paused' | TodayWho
/** A piece of a lane's line in one tone. */
export type LiveSeg = { text: string; tone: LiveTone }
/** Each tone's color name, the same in every client; a section heading ("▍Tasks") and (T-760) the agent mark "✧" have
 *  the task page's heading color. T-767: a running lane's "▶ " and id are 'run' (bold, the accent color; its title is normal text); a
 *  waiting train's id is 'run' too (T-819) and its title 'wait' (dim, as the rest of its row); an org-mem topic is 'topic' (blue, T-819). */
export const LIVE_TONE: Record<LiveTone, string> = { id: 'claude', title: 'text', passed: 'success', current: 'ide', future: 'inactive', text: 'text', dim: 'inactive', warning: 'warning', bar: 'ide', heading: 'suggestion', mark: 'suggestion', run: 'claude', now: 'claude', wait: 'inactive', topic: 'ide', failed: 'error', paused: 'permission', workers: 'ide', checkers: 'autoAccept', scouts: 'suggestion', lead: 'success' }
/** Whether a tone is drawn bold. */
export const liveBold = (tone: LiveTone): boolean => tone === 'id' || tone === 'current' || tone === 'heading' || tone === 'run'
/** T-846: the mark at a station the task skips. */
export const LIVE_SKIP_MARK = '–'
/** T-771: the mark at a finished lane's last station. */
export const LIVE_DONE_MARK = '✓'
/** T-767: what a running lane's first line starts with (before its id). */
export const LIVE_RUN_MARK = '▶ '

// T-747: the Live tab's sections (Tasks, Today, Branches, Organizational memory; T-820 put Today after Branches) each start with a "▍Name" heading,
// as the task page's "▍Details", and the lines under it are indented by LIVE_INDENT.
/** The section names, in their order on the tab. */
export const LIVE_SECTIONS = { needs: 'Needs you', tasks: 'Tasks', branches: 'Branches', today: 'Today', orgMem: 'Organizational memory' } as const
/** T-786: one row of the Live tab's ▍Needs you section: `id` (Q-n or T-n) opens on Enter; `segs` is the row in the warning tone. */
export type LiveNeed = { id: string; segs: LiveSeg[] }
/** T-786: the rows of ▍Needs you, in `inner` columns (each cut to fit): the open board questions, then the tasks that need the owner
 *  (the same list as the band and the board's NEEDS YOU: needsYou), newest first. Empty while nothing waits. */
export function liveNeeds(view: LiveView & { questions?: readonly { id: string; text: string; answered_at?: string; dropped?: boolean }[] }, nowMs: number, inner: number): LiveNeed[] {
  const open = (view.questions ?? []).filter(q => isOpenQuestion(q))
  const tasks = (view.tasks as BoardTask[]).filter(t => needsYou(t, nowMs)).sort(newestFirst)
  const idW = Math.max(0, ...open.map(q => q.id.length), ...tasks.map(t => t.id.length))
  const row = (id: string, rest: string): LiveNeed => ({ id, segs: [{ text: cutTitle(`⚠ ${id.padEnd(idW)} ${rest.replace(/\s+/g, ' ').trim()}`, Math.max(1, inner)), tone: 'warning' }] })
  const qs = open.map(q => row(q.id, q.text))
  const ts = tasks.map(t => {
    if (asksMoreTime(t)) {
      const a = taskAsks(t, (view as { max_minutes?: number }).max_minutes)
      if (t.ask?.lead?.text) return row(t.id, a?.text ?? '')
      return row(t.id, (a?.text ?? '').replace(t.id, '').trim().replace(/\. Give it more time\?$/, ': more time?'))
    }
    if (t.status === 'review') return row(t.id, `${isAnswered(t) ? 'answer to read' : 'ready for review'}: ${t.title}`)
    if (t.status === 'failed') return row(t.id, `failed: ${whyFailed(t)}`)
    const files = fileWaitText(t)
    if (files) return row(t.id, `asks: ${files}`)
    return row(t.id, `asks: ${taskAsks(t)?.text ?? t.title}`)
  })
  return [...qs, ...ts]
}
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

/** How the lanes are laid out at a width: the id and title columns, the gap between stations, the station names. The track
 *  ends at the right edge (T-1177): the title column takes all the room between the id and the track. */
export type LiveLayout = { width: number; idW: number; titleW: number; gap: number; labels: string[]; sep: number; stations: LiveStation[] }

const LABELS: Record<LiveStation, string>[] = [
  { work: 'work✧', check: 'check✧', queue: 'queue', tests: 'tests', you: 'you', done: 'done' },
  { work: 'wrk✧', check: 'chk✧', queue: 'que', tests: 'tst', you: 'you', done: 'done' },
  { work: 'w✧', check: 'c✧', queue: 'q', tests: 't', you: 'y', done: 'd' },
  { work: 'w', check: 'c', queue: 'q', tests: 't', you: 'y', done: 'd' },
]
const MAX_GAP = 8
const MIN_GAP = 2
const TITLE_W = 12
/** T-1193: blank columns after the track's last mark, so the last name ("done") starts over its mark and ends at the edge. */
export const LIVE_TAIL = 3

/** A lane's first line width with these columns (T-1193: the width includes the LIVE_TAIL blank columns after the last mark). */
const laneWidth = (idW: number, titleW: number, k: number, gap: number, sep: number, tail = LIVE_TAIL) => tail + LIVE_RUN_MARK.length + idW + (titleW ? 1 + titleW : 0) + sep + k + (k - 1) * gap

/**
 * The layout of `lanes` at `width` columns: gaps of 8 and a 12-column title (wider, up to the longest title, when the
 * panel is wider); narrower, first the gaps shrink (to 2), then the title (to 3, then the id alone), then the
 * spaces around the stations. Station names get shorter as the gaps do, so they always fit over their marks.
 */
export function liveLayout(lanes: readonly (Pick<LiveLane, 'id' | 'title'> & Partial<Pick<LiveLane, 'done'>>)[], stations: readonly LiveStation[], width: number): LiveLayout {
  const idW = Math.max(4, ...lanes.map(l => textWidth(l.id)))
  const k = stations.length
  const longest = Math.max(3, ...lanes.map(l => textWidth(l.title)))
  const make = (titleW: number, gap: number, sep: number): LiveLayout => {
    const set = LABELS.find(s => stations.slice(0, -1).every(st => textWidth(s[st]) <= gap)) ?? LABELS[LABELS.length - 1]!
    return { width, idW, titleW, gap, labels: stations.map(s => set[s]), sep, stations: [...stations] }
  }
  const base = Math.min(TITLE_W, longest)
  // the title column fills what the track leaves, so every lane's track ends at the same column (the right edge)
  const fill = (gap: number, sep: number) => Math.max(0, width - laneWidth(idW, 0, k, gap, sep) - 1)
  for (let gap = MAX_GAP; gap >= MIN_GAP; gap--) if (laneWidth(idW, base, k, gap, 2) <= width) return make(fill(gap, 2), gap, 2)
  for (let titleW = base - 1; titleW >= 3; titleW--) if (laneWidth(idW, titleW, k, MIN_GAP, 2) <= width) return make(fill(MIN_GAP, 2), MIN_GAP, 2)
  if (laneWidth(idW, 0, k, MIN_GAP, 2) <= width) return make(0, MIN_GAP, 2)
  // T-846: with many shared columns even that is too wide: the spacing between columns shrinks first (gap 1, then the
  // spaces around the stations, then gap 0), only then the labels (the one-letter set picks itself)
  // (the blank tail goes only now, after the title is at its minimum)
  if (laneWidth(idW, 0, k, 1, 2, 0) <= width) return make(0, 1, 2)
  if (laneWidth(idW, 0, k, 1, 1, 0) <= width) return make(0, 1, 1)
  return make(0, 0, 1)
}

/** The width of the name column (id, space, title) of a layout. */
const nameWidth = (l: LiveLayout) => l.idW + (l.titleW ? 1 + l.titleW : 0)

/** The station names' line over the lanes, each name starting over its mark. */
export function liveLabelLine(l: LiveLayout): string {
  return segText(liveLabelSegs(l))
}
/** T-760: liveLabelLine in pieces: the names dim, each LIVE_AGENT_MARK in the 'mark' tone (the accent color). */
export function liveLabelSegs(l: LiveLayout): LiveSeg[] {
  const lead = ' '.repeat(LIVE_RUN_MARK.length + nameWidth(l) + l.sep)
  const init = l.labels.slice(0, -1).map(s => padWidth(s, l.gap + 1)).join('')
  const text = lead + init + (l.labels[l.labels.length - 1] ?? '')
  return text.split(LIVE_AGENT_MARK).flatMap((x, i): LiveSeg[] => [...(i ? [{ text: LIVE_AGENT_MARK, tone: 'mark' as const }] : []), ...(x ? [{ text: x, tone: 'dim' as const }] : [])])
}

/** T-867: from this many times the board's median tokens per task, a lane's "(n× median)" is in the warning tone. */
export const LANE_WARN_TIMES = 2
/** How many times the median, rounded to one decimal as shown ("7.6", "1", "0.4"); the tone is decided on this
 *  rounded number, so "(2× median)" is always in the warning tone. Under 0.05 it reads "<0.1", never "0". */
export function laneTimes(x: number): { text: string; warn: boolean } {
  const r = Math.round(x * 10) / 10
  return { text: r < 0.1 ? '<0.1' : r.toFixed(1).replace(/\.0$/, ''), warn: r >= LANE_WARN_TIMES }
}

/** The text at a lane's right: its place in the queue ("#2"), else the time at its station ("2m"); '' when not known. */
export function laneRight(lane: Pick<LiveLane, 'station' | 'place' | 'sinceMs'> & Partial<Pick<LiveLane, 'done'>>, nowMs: number, room = Infinity): string {
  // T-771: a finished lane: "merged 3m ago", or "3m ago" (else "3m") when its column is narrow
  if (lane.done) {
    const time = rowDuration(Math.max(0, nowMs - lane.done.atMs))
    return [`${lane.done.word} ${time} ago`, `${time} ago`].find(x => textWidth(x) <= room) ?? time
  }
  if (lane.station === 'queue' && lane.place) return `#${lane.place}`
  return lane.sinceMs !== undefined ? rowDuration(Math.max(0, nowMs - lane.sinceMs)) : ''
}

/** Joins segments, dropping empty ones. */
const segs = (...xs: (LiveSeg | false | undefined)[]): LiveSeg[] => xs.filter((x): x is LiveSeg => !!x && !!x.text)
/** The plain text of segments. */
export const segText = (xs: readonly LiveSeg[]): string => xs.map(x => x.text).join('')

/**
 * A lane's two lines as segments, never wider than the layout's width (unless even the tightest layout is wider):
 * 1. "▶ T-684 /symcc-doc…  ●━━━━━━━━●━━━━━━━━◉────────○────────○      #2": passed stations ●━━, the current one blinking
 *    (`frame`, liveBlink), future ──○; the right column the queue place or the time at the station;
 * 2. "  bug try 4/4 · ⏱ 41m · ⌀ 7.3M (7.6× median) · worker 5.4M · checker 1.9M · ⌕ × 2" (T-867, T-931): kind and
 *    try, its active time (all tries), the whole task's tokens (all its tries) and how many times the board's median
 *    tokens per merged task that is (the warning tone from LANE_WARN_TIMES), its tokens by agent kind in < > (a 0 part
 *    left out, no < > when there is none) and the checker's send-backs. When narrow, parts go: the < > split, then
 *    "× median", then the kind, then ⌀, then ⏱ (never before the tokens); never cut. A running worker's tokens are known
 *    only at its hand-back: until then the earlier tries' sum with " + …", or "⌀ at hand-back".
 */
export function laneLines(lane: LiveLane, l: LiveLayout, o: { nowMs: number; frame: number; steady?: boolean; noTime?: boolean; noKind?: boolean }): [LiveSeg[], LiveSeg[]] {
  const sep = ' '.repeat(l.sep)
  const track: LiveSeg[] = []
  const done = !!lane.done
  // T-846: the columns are shared by all lanes; a lane draws its own stations (lane.stations) on them, and its line runs
  // through the columns it has no station at (an investigation has no check, queue, tests or merge)
  const own = lane.stations ?? l.stations
  const ahead = (i: number): number | null => {
    for (let j = i; j < l.stations.length; j++) {
      const k = own.indexOf(l.stations[j]!)
      if (k >= 0) return k
    }
    return null
  }
  l.stations.forEach((s, i) => {
    const next = ahead(i)
    if (i) track.push(next === null ? { text: ' '.repeat(l.gap), tone: 'text' } : next <= lane.at ? { text: '━'.repeat(l.gap), tone: 'passed' } : { text: '─'.repeat(l.gap), tone: 'future' })
    const k = own.indexOf(s)
    if (k < 0) track.push(next === null ? { text: ' ', tone: 'text' } : next <= lane.at ? { text: '━', tone: 'passed' } : { text: '─', tone: 'future' })
    // T-846: a station this task skips (check, for a docs-only change) is a dim "–"
    else if (lane.skipped?.includes(s) && k !== lane.at) track.push({ text: LIVE_SKIP_MARK, tone: 'dim' })
    // T-771: a finished lane has ✓ (done color) at its last station instead of the blinking mark
    else track.push(k < lane.at ? { text: '●', tone: 'passed' } : k === lane.at ? (done ? { text: LIVE_DONE_MARK, tone: 'passed' } : { text: liveBlink(o.frame, o.steady), tone: 'current' }) : { text: '○', tone: 'future' })
  })
  // T-767: "▶ " before the id; the mark and id bold in the accent color ('run'), the title normal text; T-771: a finished lane's title dim
  // T-850: a finished lane has "✓ " (dim) there instead, its id stays in the accent color
  const name = segs({ text: done ? `${LIVE_DONE_MARK} ` : LIVE_RUN_MARK, tone: done ? 'dim' : 'run' }, { text: padWidth(lane.id, l.idW), tone: 'run' }, l.titleW > 0 && { text: ` ${padWidth(cutTitle(lane.title, l.titleW), l.titleW)}`, tone: done ? 'dim' : 'text' })
  const first = [...name, { text: sep, tone: 'text' as const }, ...track]
  // the second line (T-867: plain numbers, no bar)
  // T-982: the checker's send-backs, "⌕ × 2" (spaces around ×, at every width)
  const back: LiveSeg | false = lane.sentBack > 0 && { text: `⌕ × ${lane.sentBack}`, tone: 'dim' }
  const fits = (xs: LiveSeg[]) => textWidth(segText(xs)) <= l.width
  // "(7.6× median)": against the board's usual tokens per merged task; the warning tone from twice it
  const times = lane.tokens !== undefined && lane.usual ? lane.tokens / lane.usual : undefined
  const shown = times !== undefined && laneTimes(times)
  const median: LiveSeg | false = shown && { text: ` (${shown.text}×median)`, tone: shown.warn ? 'warning' : 'dim' }
  const tokens = (withMedian: boolean): LiveSeg[] =>
    lane.tokens === undefined
      ? done ? [] : [{ text: `${TOKEN_SIGN} at hand-back`, tone: 'dim' }]
      : segs({ text: fmtTok(lane.tokens), tone: 'text' }, lane.more && { text: ' + …', tone: 'dim' }, withMedian && median)
  const time: LiveSeg[] = lane.activeMs && !o.noTime ? [{ text: `⏱ ${rowDuration(lane.activeMs)}`, tone: 'dim' }] : []
  // T-931: the tokens by agent kind together in ‹ ›, without ⌀ ("<worker 2.1M · checker 380.9k>"); none when no split
  const agents = [lane.workerTokens && `worker ${fmtTokens(lane.workerTokens)}`, lane.checkerTokens && `checker ${fmtTokens(lane.checkerTokens)}`].filter((x): x is string => !!x)
  const split: LiveSeg[] = agents.length ? [{ text: agents.join(' · '), tone: 'dim' }] : []
  /** The line with the parts up to `level` (4: all; 3: no split; 2: no "×median"; 1: no ⌀; 0: no ⏱).
   *  T-931: the clock first, then the tokens, then the split; the clock is dropped only after the tokens. */
  // T-1080: a finished lane's change size ends the line ("+539 −3,722", no files part); it is the first part dropped
  const size: LiveSeg[] = lane.size ? [{ text: sizeText(lane.size, false), tone: 'dim' }] : []
  // T-1177: a finished lane's "merged 3m ago" starts its second line (the first line has no right column); VS Code
  // (noTime) draws it itself. Only after every other part is gone does it shorten to "3m ago".
  const doneAge = lane.done && !o.noTime ? rowDuration(Math.max(0, o.nowMs - lane.done.atMs)) : ''
  const doneNote = (short = false) => (doneAge ? `${short ? '' : `${lane.done!.word} `}${doneAge} ago · ` : '')
  const line = (level: number, withSize = false, short = false): LiveSeg[] => {
    const lead: LiveSeg = { text: `  ${doneNote(short)}try ${lane.tryNo}/${lane.tries}`, tone: 'dim' }
    const parts = [level >= 1 ? time : [], level >= 2 ? tokens(level >= 3) : [], level >= 4 ? split : [], back ? [back] : [], withSize ? size : []].filter(x => x.length)
    return segs(lead, ...parts.flatMap((x, i): LiveSeg[] => [{ text: ' · ', tone: 'dim' }, ...x]))
  }
  // T-1074: the task type ends the second line (dim, two spaces after the meta text); dropped (never wrapped) when it does not fit
  const withKind = (xs: LiveSeg[]): LiveSeg[] => [...xs, { text: `  ${lane.kind}`, tone: 'dim' as const }]
  // each level with the kind, then without it, before a part of the meta text goes
  const tries: LiveSeg[][] = [...(size.length ? [o.noKind ? line(4, true) : withKind(line(4, true))] : []), ...[4, 3, 2, 1, 0].flatMap(n => (o.noKind ? [line(n)] : [withKind(line(n)), line(n)]))]
  tries.push(line(0, false, false), line(0, false, true))
  tries.push(segs({ text: `  try ${lane.tryNo}/${lane.tries}`, tone: 'dim' }))
  const second = tries.find(fits) ?? tries[tries.length - 1]!
  // T-771: a finished lane's second line is dim throughout
  return [first, done ? second.map(x => (x.tone === 'text' && !x.text.trim() ? x : { ...x, tone: 'dim' })) : second]
}

// T-715: waiting trains. A todo task that still waits for an unfinished task hangs, as a "train" (└─◇), under the lane
// of the running task it waits for, or under the train of the todo task it waits for (a chain), down to a lane:
//                  work   check  queue  tests  done
// ▶ T-712 Scout or… ●━━━━━━◉──────○──────○──────○  2m
//   bug try 1/3 · ⏱ 2m · ⌀ 1.1M (0.3× median) · <worker 1.1M>
//   └─◇ T-713 Task files: no si…  waits
//      └─◇ T-714 Help: /symcc-h…  waits
//   └─◇ T-716 Live deps…  waits  + also T-690
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
  const todo = waitOrder(view.tasks.filter(t => t.status === 'todo'), byRunOrder)
  const rank = new Map(todo.map((t, i) => [t.id, i]))
  const open = new Map(todo.map(t => [t.id, openAfter(board, t)]))
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
    return LIVE_STATIONS.indexOf(la.station) - LIVE_STATIONS.indexOf(lb.station) || lb.enteredMs - la.enteredMs || num(b) - num(a)
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
    todo.filter(t => parent.get(t.id) === id).map(t => ({ id: t.id, title: rowTitle(t), also: open.get(t.id)!.filter(a => a !== id), trains: build(t.id) }))
  const next: NextUp[] = []
  let more = 0
  for (const t of todo) {
    if (parent.has(t.id)) continue
    const waits = open.get(t.id)!
    const stuck = waits.every(a => !laneOf.has(a) && byId.get(a)?.status !== 'todo')
    if (stuck) next.push({ id: t.id, title: rowTitle(t), stuck: waits.map(a => ({ id: a, status: STUCK_WORD[byId.get(a)?.status ?? 'done'] ?? (byId.has(a) ? byId.get(a)!.status : 'not found') })) })
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
 * than `width`: "  └─◇ T-713 Task files: no si…  waits  + also T-690". Narrower, the title gets shorter, the
 * "+ also" names give way to a count, "waits" goes, then the title. Past TRAIN_DEPTH levels or TRAIN_MAX trains, one
 * "  └─ +N more waiting" row counts the rest.
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
  if (hidden) out.push({ depth: 1, segs: [{ text: fitText(`  └─ +${hidden} more waiting`, width), tone: 'dim' }] })
  return out
}

/** One train's row (see trainRows). */
function trainLine(x: LiveTrain, depth: number, width: number): LiveSeg[] {
  const lead = `${' '.repeat(3 * depth - 1)}└─◇ `
  const n = x.also.length
  const alsos = n ? [`  + also ${x.also.join(', ')}`, ...(n > 1 ? [`  + also ${x.also[0]} +${n - 1}`] : []), `  +${n}`] : ['']
  const tries: { also: string; waits: string }[] = []
  for (const waits of ['  waits', '']) for (const also of alsos) tries.push({ also, waits })
  const make = (t: { also: string; waits: string }, titleW: number): LiveSeg[] =>
    segs({ text: lead, tone: 'dim' }, { text: x.id, tone: 'run' }, titleW > 0 && { text: ` ${cutTitle(x.title, titleW)}`, tone: 'wait' }, { text: t.waits, tone: 'dim' }, { text: t.also, tone: 'dim' })
  for (const least of [8, 3])
    for (const t of tries) {
      const room = width - textWidth(lead + x.id + t.waits + t.also) - 1
      if (room >= Math.min(least, textWidth(x.title))) return make(t, Math.min(room, TRAIN_TITLE))
    }
  for (const t of tries) if (textWidth(lead + x.id + t.waits + t.also) <= width) return make(t, 0)
  // narrower than its lead and id: cut
  return [{ text: fitText(lead + x.id, width), tone: 'dim' }]
}

/** Today's numbers: tasks merged, checker send-backs, tasks failed, and the worker tries' tokens. */
export type LiveToday = { merged: number; sentBack: number; failed: number; tokens: number }

/** Today's numbers at `nowMs` (the owner's day, `offsetMin` east of UTC): merged (a "merged" timeline line today), sent back
 *  (the checker's send-backs today; a task given without its timeline, as a board view's done one, is counted by its
 *  timeline marks, see viewTask), failed (tasks failed now that failed today), tokens (of the tries that ended today, or run today). */
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
    const timeline = marksOf(t)
    if (timeline.some(h => h.kind === 'merged' && isToday(h.at))) merged++
    sentBack += sentBackOf(t, isToday).all
    if (t.status === 'failed' && isToday(t.updated_at)) failed++
    for (const r of t.runs ?? []) if (tryTokens(r) && isToday(r.ended ?? r.started)) tokens += tokenCount(tryTokens(r))
  }
  return { merged, sentBack, failed, tokens }
}

/** Today's cost in dollars (T-748, the status line's "$312"): the cost of the tries that ended today (or run today),
 *  where a try reports one; 0 when none does. The same day as liveToday's. */
export function todayCost(tasks: readonly Pick<SymccTask, 'runs'>[], nowMs: number, offsetMin: number = localOffset(nowMs)): number {
  const today = dayOf(nowMs, offsetMin)
  let usd = 0
  for (const t of tasks) {
    for (const r of t.runs ?? []) {
      const at = ms(r.ended ?? r.started)
      const cost = tryCost(r)
      if (typeof cost === 'number' && Number.isFinite(cost) && at !== undefined && dayOf(at, offsetMin) === today) usd += cost
    }
  }
  return usd
}

/** T-799: after Σ when the lead's and scouts' tokens aren't known (Σ is the tries only). */
export const TRIES_ONLY = ' (tries only)'

/** The ▍Today figures in `width` columns: "✓ 6 merged   ↺ 9 sent back   ✗ 1 failed   Σ ⌀ 18.4M", on more lines when narrow (a part wider than the page alone is cut). */
export function todayLines(d: LiveToday, width: number, triesOnly = false): string[] {
  const parts = [`✓ ${d.merged} merged`, `↺ ${d.sentBack} sent back`, `✗ ${d.failed} failed`, `Σ ${fmtTok(d.tokens)}${triesOnly ? TRIES_ONLY : ''}`]
  for (const gap of ['   ', '  ', ' ']) {
    const one = parts.join(gap)
    if (textWidth(one) <= width) return [one]
  }
  const out: string[] = []
  let cur = ''
  for (const p of parts) {
    const next = cur ? `${cur}  ${p}` : p
    if (cur && textWidth(next) > width) {
      out.push(cur)
      cur = p
    } else cur = next
  }
  out.push(cur)
  // T-769: a part wider than the page on its own is cut
  return out.map(l => fitText(l, Math.max(1, Math.floor(width))))
}

// ---------------- T-769: ▍Today's second and third lines ----------------
//   ⌀ per task 2.8M · 9m work · 23m start-to-merge   ⏱ 13h 06m agent work · ≈ $64
//   ████████████████ lead 3% · workers 84% · checkers 8% · scouts 5%
//   08 ▁▂▃▅▇▆▅▃▅▇█▆▃ 20   busiest 14:00 · 42.1M tokens   first try 34%   ⌀ 2.4 tries   ⌕ 68 sent back by the checker

/** Who spent today's tokens, in the bar's order. */
export type TodayWho = 'workers' | 'checkers' | 'scouts' | 'lead'
export const TODAY_WHO: readonly TodayWho[] = ['lead', 'workers', 'checkers', 'scouts']
/** How many cells the stacked bar has. */
export const TODAY_BAR = 16
const SPARK = '▁▂▃▄▅▆▇█'

/**
 * What ▍Today reads beyond the board's tasks (the board view's `today_team`, filled by app/lead.ts): the owner's day it
 * is for (figures of another day are not shown), the lead's tokens today (absent when they can't be read here), the
 * scouts' tokens and run time today, the session's cost so far as /cost says (absent when the host doesn't tell it), and
 * the lead's and scouts' tokens per hour of that day (24 numbers, the owner's hours).
 */
export type TodayTeam = { day: string; lead?: number; scouts?: number; scout_ms?: number; usd?: number; hours?: number[] }

/**
 * ▍Today's extra figures: the medians per task merged today (its tokens, its tries' work time, from its first try's start
 * to the merge), today's agent work time (the tries' time inside today, and the scouts'), the cost when known, today's
 * tokens by who spent them (only the known ones with tokens), and the tokens per hour from the first busy hour to now.
 */
export type TodayMore = {
  perTask?: { tokens?: number; workMs?: number; mergeMs?: number }
  workMs: number
  usd?: number
  who: { who: TodayWho; tokens: number }[]
  hours: number[]
  /** T-799: the lead's or the scouts' tokens today are known (so the Σ of everyone is complete) */
  teamKnown?: boolean
  /** T-781: of the tasks merged today with try data: the share merged on the first try (percent), the tries per task, and the checker's send-backs today */
  firstTry?: number
  avgTries?: number
  sentBack?: number
}

const HOUR = 3_600_000

/** ▍Today's extra figures at `nowMs` (the same day as liveToday's), from the tasks and the view's `team`. */
export function todayMore(tasks: readonly SymccTask[], team: TodayTeam | undefined, nowMs: number, offsetMin: number = localOffset(nowMs)): TodayMore {
  const today = dayOf(nowMs, offsetMin)
  const shifted = nowMs + offsetMin * 60_000
  const dayStart = nowMs - (((shifted % 86_400_000) + 86_400_000) % 86_400_000)
  const hourOf = (at: number) => Math.floor((at - dayStart) / HOUR)
  const isToday = (at: number | undefined): at is number => at !== undefined && dayOf(at, offsetMin) === today
  const hours = Array.from({ length: 24 }, () => 0)
  let workers = 0
  let checkers = 0
  let workMs = 0
  const tok: number[] = []
  const work: number[] = []
  const toMerge: number[] = []
  const tries: number[] = []
  let checkerBack = 0
  for (const t of tasks) {
    for (const r of t.runs ?? []) {
      const start = ms(r.started)
      const end = ms(r.ended)
      if (start !== undefined) {
        const from = Math.max(start, dayStart)
        const to = Math.min(end ?? nowMs, nowMs)
        if (to > from) workMs += to - from - gapsOf(r).reduce((n, g) => n + Math.max(0, Math.min(g.to, to) - Math.max(g.from, from)), 0)
      }
      const at = end ?? start
      if (!tryTokens(r) || !isToday(at)) continue
      const all = tokenCount(tryTokens(r))
      // T-785: the checkers' part from the try's checker entries
      const chkTok = checkerTokensOf(r)
      const chk = Math.min(all, chkTok ? tokenCount(chkTok) : 0)
      workers += all - chk
      checkers += chk
      const h = hourOf(at)
      if (h >= 0 && h < 24) hours[h]! += all
    }
    checkerBack += sentBackOf(t, at => isToday(ms(at))).checker
    const mergedAt = marksOf(t).filter(h => h.kind === 'merged').map(h => ms(h.at)).filter(isToday)
    if (!mergedAt.length) continue
    const f = taskFigures(t)
    if (f.tok !== undefined) tok.push(f.tok)
    if (f.hasData) {
      work.push(f.ms)
      tries.push(f.tries)
    }
    const first = ms(t.runs?.[0]?.started)
    if (first !== undefined && Math.max(...mergedAt) >= first) toMerge.push(Math.max(...mergedAt) - first)
  }
  const mine = team && typeof team === 'object' && team.day === today ? team : undefined
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)
  for (const [h, x] of (Array.isArray(mine?.hours) ? mine.hours : []).entries()) if (h < 24) hours[h]! += n(x)
  const counts: Record<TodayWho, number> = { workers, checkers, scouts: n(mine?.scouts), lead: n(mine?.lead) }
  const who = TODAY_WHO.flatMap(w => (counts[w] > 0 ? [{ who: w, tokens: counts[w] }] : []))
  const now = Math.min(23, Math.max(0, hourOf(nowMs)))
  const firstHour = hours.findIndex(n => n > 0)
  const perTask = { ...(tok.length ? { tokens: median(tok) } : {}), ...(work.length ? { workMs: median(work) } : {}), ...(toMerge.length ? { mergeMs: median(toMerge) } : {}) }
  const usd = mine?.usd
  return {
    ...(Object.keys(perTask).length ? { perTask } : {}),
    workMs: workMs + n(mine?.scout_ms),
    ...(n(usd) ? { usd: n(usd) } : {}),
    who,
    ...(typeof mine?.lead === 'number' || typeof mine?.scouts === 'number' ? { teamKnown: true } : {}),
    hours: firstHour < 0 || firstHour > now ? [] : hours.slice(0, now + 1),
    ...(tries.length ? { firstTry: (100 * tries.filter(n => n === 1).length) / tries.length, avgTries: tries.reduce((a, b) => a + b, 0) / tries.length } : {}),
    ...(checkerBack ? { sentBack: checkerBack } : {}),
  }
}

/** Dollars, short: "≈ $64" from ten dollars on, else "≈ $4.20". */
export const todayCostText = (usd: number) => `≈ ${usd >= 10 ? `$${Math.round(usd)}` : fmtCost(usd)} this session`

/** The shares of `who`'s tokens in whole percents ("<1%" for a small one). */
function shares(who: TodayMore['who']): string[] {
  const all = who.reduce((s, w) => s + w.tokens, 0)
  return who.map(w => {
    const p = (100 * w.tokens) / all
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
  })
}

/** The stacked bar's cells for `who` in `n` cells (each with tokens gets one at least, when there is room). */
export function todayBar(who: TodayMore['who'], n: number = TODAY_BAR): LiveSeg[] {
  const all = who.reduce((s, w) => s + w.tokens, 0)
  if (!all || n < 1) return []
  const raw = who.map(w => (n * w.tokens) / all)
  const cells = raw.map(x => Math.floor(x))
  // largest remainders get the cells left
  const order = raw.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)
  for (let k = 0, left = n - cells.reduce((s, c) => s + c, 0); left > 0; k++, left--) cells[order[k % order.length]!.i]!++
  // a part with tokens and no cell borrows one from the biggest
  for (let i = 0; i < cells.length; i++)
    if (cells[i] === 0 && n >= who.length) {
      const big = cells.indexOf(Math.max(...cells))
      cells[big]!--
      cells[i] = 1
    }
  return who.flatMap((w, i) => (cells[i]! > 0 ? [{ text: '█'.repeat(cells[i]!), tone: w.who }] : []))
}

/** The hours as a sparkline, ▁ to █ (a space for an hour with no tokens). */
export function sparkline(hours: readonly number[]): string {
  const max = Math.max(0, ...hours)
  return hours.map(n => (n > 0 && max > 0 ? SPARK[Math.min(SPARK.length - 1, Math.max(0, Math.ceil((n / max) * SPARK.length) - 1))]! : ' ')).join('')
}

const hh = (h: number) => String(h).padStart(2, '0')

/** T-817: the dim mark for an hour still to come. */
const SPARK_FUTURE = '·'
/** T-864: the thin borders of the hour sparkline (like the lane bars) and the dim floor of a past hour with no tokens. */
const SPARK_EDGE_L = '▕'
const SPARK_EDGE_R = '▏'
const SPARK_FLOOR = '▁'

/** T-817: line 4's sparkline always spans the whole day, 00 to 24: this many cells when `per` hours share one cell. */
export const sparkCells = (per: number): number => Math.ceil(24 / Math.max(1, Math.min(24, Math.floor(per))))

/**
 * T-781, T-817: line 4's sparkline: neighbouring hours merged (their tokens added), `per` hours to a cell. Never fewer
 * than one hour to a cell.
 */
export function squeezeHours(hours: readonly number[], per: number): number[] {
  const g = Math.max(1, Math.floor(per))
  const out: number[] = []
  for (let i = 0; i < hours.length; i += g) out.push(hours.slice(i, i + g).reduce((s, n) => s + n, 0))
  return out
}

/**
 * T-817: the whole day's sparkline as segments: `hours` are the tokens from 00 to now, `per` hours to a cell. The past
 * cells are bars (a space for none), the cell with the current hour is in the accent color ('now'), and the hours still
 * to come are dim dots, so the cells always span 00 to 24.
 */
export function sparkSegs(hours: readonly number[], per: number): LiveSeg[] {
  const g = Math.max(1, Math.min(24, Math.floor(per)))
  const cells = squeezeHours(hours, g)
  const text = sparkline(cells)
  const cur = cells.length - 1
  const out: LiveSeg[] = [{ text: SPARK_EDGE_L, tone: 'dim' }]
  const add = (t: string, tone: LiveSeg['tone']) => {
    const last = out[out.length - 1]!
    if (last.tone === tone) last.text += t
    else out.push({ text: t, tone })
  }
  // T-864: a past hour with no tokens is a dim ▁ (one joined floor); an hour with tokens is its bar
  cells.forEach((n, i) => (i === cur ? add(n > 0 ? text[i]! : SPARK_FLOOR, 'now') : n > 0 ? add(text[i]!, 'bar') : add(SPARK_FLOOR, 'dim')))
  if (sparkCells(g) > cells.length) add(SPARK_FUTURE.repeat(sparkCells(g) - cells.length), 'dim')
  add(SPARK_EDGE_R, 'dim')
  return out
}

/**
 * ▍Today's second, third and fourth lines in `width` columns: (2) the stacked bar of who spent the tokens with their
 * shares, alone; (3) the medians per merged task, first try, tries and the checker's send-backs; (4) the agent work
 * time, the cost, the busiest hour, then the hour sparkline (00 to 24) at the very end. When narrow,
 * each line drops parts from its end; line 4 drops busiest, then the cost, then shortens ⌀/h to ⌀, then squeezes the sparkline; the ⌀ label and the sparkline stay together, last.
 * Never wider than `width`. A line with nothing to say is left out.
 */
export function todayMoreLines(m: TodayMore, width: number): LiveSeg[][] {
  const w = Math.max(1, Math.floor(width))
  const per = m.perTask
  const perParts = per ? [per.tokens !== undefined && fmtTok(per.tokens), per.workMs !== undefined && `${fmtDuration(per.workMs)} work`, per.mergeMs !== undefined && `${fmtDuration(per.mergeMs)} start-to-merge`].filter((x): x is string => !!x) : []
  const sh = shares(m.who)
  // line 2: the who-spent bar and its shares, alone
  const line2 = (words: boolean, barW = TODAY_BAR, sign = true): LiveSeg[] => {
    if (!m.who.length) return []
    const out: LiveSeg[] = [...(sign ? [{ text: `${TOKEN_SIGN} `, tone: 'dim' as const }] : []), ...todayBar(m.who, barW)]
    if (words) m.who.forEach((x, i) => out.push({ text: i ? ' · ' : ' ', tone: 'dim' }, { text: `${x.who} ${sh[i]}`, tone: x.who }))
    return out
  }
  // line 3: the per-task medians, then first try, tries and the checker's send-backs; `keep` parts stay (dropped from the end)
  const extras3: string[] = [
    ...(m.firstTry !== undefined ? [`first try ${Math.round(m.firstTry)}%`] : []),
    ...(m.avgTries !== undefined ? [`avg ${m.avgTries.toFixed(1)} tries/task`] : []),
    ...(m.sentBack !== undefined ? [`⌕ ${m.sentBack} sent back by the checker`] : []),
  ]
  const line3 = (keep: number): LiveSeg[] => {
    const out: LiveSeg[] = []
    const p = perParts.slice(0, keep)
    // T-855: "median ⌀ 2M/task · 10m work · 30m start-to-merge" (median dim; ⌀ is the token sign now)
    if (p.length) out.push({ text: 'median ', tone: 'dim' }, { text: p.map((x, i) => (i ? x : `${x}/task`)).join(' · '), tone: 'text' })
    const rest = keep > perParts.length ? extras3.slice(0, keep - perParts.length) : []
    rest.forEach((x, i) => out.push({ text: out.length ? (i && !x.startsWith('⌕') ? ' · ' : '   ') : '', tone: i && !x.startsWith('⌕') ? 'dim' : 'text' }, { text: x, tone: 'dim' }))
    return out
  }
  const busiest = m.hours.length ? m.hours.indexOf(Math.max(...m.hours)) : -1
  // line 4: agent work time, the cost, the busiest hour, then the sparkline with its labels at the very end
  const line4 = (cost: boolean, busy: boolean, per: number, label: 'long' | 'short' = 'short'): LiveSeg[] => {
    const out: LiveSeg[] = []
    const gap = () => out.length && out.push({ text: '   ', tone: 'text' })
    if (m.workMs > 0) out.push({ text: '⏱ ', tone: 'dim' }, { text: `${fmtDuration(m.workMs)} agent work`, tone: 'text' })
    if (cost && m.usd !== undefined) {
      if (out.length) out.push({ text: ' · ', tone: 'dim' })
      out.push({ text: todayCostText(m.usd), tone: 'text' })
    }
    if (busy && busiest >= 0) {
      gap()
      out.push({ text: `busiest hour ${hh(busiest)}:00 · ${fmtTok(m.hours[busiest]!)}`, tone: 'dim' })
    }
    if (per > 0 && m.hours.length) {
      gap()
      out.push({ text: label === 'long' ? `${TOKEN_SIGN}/h 00` : `${TOKEN_SIGN} 00`, tone: 'dim' }, ...sparkSegs(m.hours, per), { text: '24', tone: 'dim' })
    }
    return out
  }
  const fits = (xs: LiveSeg[]) => textWidth(segText(xs)) <= w
  let two = line2(true)
  if (!fits(two)) two = line2(false, Math.min(TODAY_BAR, Math.max(1, w - 2)))
  if (!fits(two)) two = line2(false, Math.min(TODAY_BAR, w), false)
  let three: LiveSeg[] = []
  for (let keep = perParts.length + extras3.length; keep >= 1; keep--) {
    three = line3(keep)
    if (fits(three)) break
  }
  if (!fits(three)) three = [{ text: fitText(segText(three), w), tone: 'text' }]
  // line 4 drops busiest, then the cost, then squeezes the sparkline (labels stay), then drops it, then the work time
  const n = m.hours.length
  let four: LiveSeg[] = []
  const tries: [boolean, boolean, number, 'long' | 'short'][] = [[true, true, 1, 'long'], [true, false, 1, 'long'], [false, false, 1, 'long'], [false, false, 1, 'short']]
  for (const [c, b, k, l] of tries) {
    four = line4(c, b, k, l)
    if (fits(four)) break
  }
  // squeezed: 2, 3, 4 (and more) hours to a cell, the smallest that fits, the labels staying
  const squeezed = (work: boolean) => {
    for (let per = 2; per <= 24; per++) {
      const x = work ? line4(false, false, per) : [{ text: `${TOKEN_SIGN} 00`, tone: 'dim' as const }, ...sparkSegs(m.hours, per), { text: '24', tone: 'dim' as const }]
      if (fits(x)) return x
    }
    return null
  }
  if (!fits(four) && n) four = squeezed(true) ?? four
  // still too wide: the work time goes, the sparkline (squeezed) stays alone
  if (!fits(four) && n) four = squeezed(false) ?? four
  if (!fits(four)) four = line4(false, false, 0)
  if (!fits(four)) four = four.length ? [{ text: fitText(segText(four), w), tone: 'text' }] : four
  return [two, three, four].filter(x => x.length)
}

// ---------------- T-889: ▍Today's dim "yesterday" and "last 7 days" lines ----------------
//   yesterday:   ✓ 77 merged · ⌀ 355M · ⏱ 34h
//   last 7 days: ✓ 176 merged · ⌀ 854M · ⏱ 53h

/** One earlier stretch of days: tasks merged in it, the tries' tokens in it, the tries' worker time in it (closed-app time left out). */
export type PastDays = { merged: number; tokens: number; workMs: number }

/**
 * T-889: the figures of the `days` whole local days before `nowMs`'s day (today left out), counted as ▍Today counts:
 * a task with a merge in them, the tokens of the tries that ended (or started, when not ended) in them, and the tries'
 * time inside them without their closed-app stretches.
 */
export function pastDays(tasks: readonly SymccTask[], nowMs: number, days: number, offsetMin: number = localOffset(nowMs)): PastDays {
  const shifted = nowMs + offsetMin * 60_000
  const to = nowMs - (((shifted % 86_400_000) + 86_400_000) % 86_400_000)
  const from = to - Math.max(0, Math.floor(days)) * 86_400_000
  const inside = (at: number | undefined): at is number => at !== undefined && at >= from && at < to
  let merged = 0
  let tokens = 0
  let workMs = 0
  for (const t of tasks) {
    if (marksOf(t).some(h => h.kind === 'merged' && inside(ms(h.at)))) merged++
    for (const r of t.runs ?? []) {
      const start = ms(r.started)
      const end = ms(r.ended)
      if (tryTokens(r) && inside(end ?? start)) tokens += tokenCount(tryTokens(r))
      if (start === undefined) continue
      const a = Math.max(start, from)
      const b = Math.min(end ?? nowMs, to)
      if (b > a) workMs += b - a - gapsOf(r).reduce((n, g) => n + Math.max(0, Math.min(g.to, b) - Math.max(g.from, a)), 0)
    }
  }
  return { merged, tokens, workMs: Math.max(0, workMs) }
}

/** T-889: a worker time, short: "45m", "3h 05m" under 10 hours, else whole hours ("34h"). */
const pastTime = (n: number) => (n >= 10 * HOUR ? `${Math.round(n / HOUR)}h` : fmtDuration(n))

/** T-889: the labels of the two lines, padded to the same width when there is room. */
export const PAST_LABELS = { yesterday: 'yesterday:', week: 'last 7 days:' } as const

/**
 * T-889: the dim "yesterday" and "last 7 days" lines in `width` columns. A part that is 0 is left out, and a line with
 * nothing is left out. When narrow, ⏱ goes first, then ⌀, then the labels' padding; still too wide, the line is cut.
 */
export function pastLines(yesterday: PastDays, week: PastDays, width: number): LiveSeg[][] {
  const w = Math.max(1, Math.floor(width))
  const padTo = Math.max(textWidth(PAST_LABELS.yesterday), textWidth(PAST_LABELS.week)) + 1
  const line = (label: string, d: PastDays): LiveSeg[] => {
    const parts = (keep: number) => [d.merged > 0 && `✓ ${d.merged} merged`, keep >= 2 && d.tokens > 0 && fmtTok(d.tokens), keep >= 3 && d.workMs >= 1000 && `⏱ ${pastTime(d.workMs)}`].filter((x): x is string => !!x)
    if (!parts(3).length) return []
    let text = ''
    for (const [keep, pad] of [[3, true], [2, true], [1, true], [1, false]] as const) {
      const p = parts(keep)
      if (!p.length) continue
      text = `${pad ? padWidth(label, padTo) : `${label} `}${p.join(' · ')}`
      if (textWidth(text) <= w) break
    }
    return [{ text: fitText(text, w), tone: 'dim' }]
  }
  return [line(PAST_LABELS.yesterday, yesterday), line(PAST_LABELS.week, week)].filter(x => x.length)
}

/** All of ▍Today's lines in `width` columns (each under LIVE_INDENT): the figures (todayLines), then todayMoreLines. */
export function liveTodayLines(v: Pick<LiveView, 'tasks' | 'today_team'>, nowMs: number, width: number, offsetMin: number = localOffset(nowMs), note = false): LiveSeg[][] {
  const more = todayMore(v.tasks, v.today_team, nowMs, offsetMin)
  const d = liveToday(v.tasks, nowMs, offsetMin)
  // T-799: Σ is everyone's tokens (the bar's total), never less than the busiest hour
  const tokens = Math.max(more.who.reduce((s, x) => s + x.tokens, 0), d.tokens, ...more.hours)
  const triesOnly = !more.teamKnown
  const first = todayLines({ ...d, tokens }, width, triesOnly).map((text): LiveSeg[] =>
    text.endsWith(TRIES_ONLY) ? [{ text: text.slice(0, -TRIES_ONLY.length), tone: 'text' }, { text: TRIES_ONLY, tone: 'dim' }] : [{ text, tone: 'text' }])
  // T-855: with no lane there is no key line, so the dim note that ⌀ means tokens ends the section
  // T-889: then the dim yesterday and last 7 days lines (T-1043: after one blank line)
  const past = pastLines(pastDays(v.tasks, nowMs, 1, offsetMin), pastDays(v.tasks, nowMs, 7, offsetMin), width)
  return [...first, ...todayMoreLines(more, width), ...(past.length ? [[] as LiveSeg[]] : []), ...past, ...(note ? wrapLine(TOKENS_NOTE, width).map((text): LiveSeg[] => [{ text, tone: 'dim' }]) : [])]
}

/** T-973: one label/value row of a section (VS Code's Live tab): its key, its label ("Tokens") and its value in parts. */
export type LiveRow = { key: string; label: string; segs: LiveSeg[] }
/** T-973: the labels of the Today rows. */
export const TODAY_ROW = { results: 'Results', tokens: 'Tokens', time: 'Agent time', perTask: 'Per task', hours: 'Hours', yesterday: 'Yesterday', week: '7 days' } as const

/**
 * T-973: ▍Today's figures as label/value rows (VS Code's Live tab draws them as a block, the labels in one column), the
 * same numbers as liveTodayLines: Results (✓ merged · ↺ sent back · ✗ failed), Tokens (everyone's, then who spent them),
 * Agent time (and the cost when known), Per task (the medians, first try, tries, the checker's send-backs; only when
 * there are some), Hours (the day's sparkline and the busiest hour; only once tokens were spent), Yesterday and 7 days
 * (merged · tokens · time; only when not all 0). Nothing is cut: the client wraps.
 */
export function liveTodayRows(v: Pick<LiveView, 'tasks' | 'today_team'>, nowMs: number, offsetMin: number = localOffset(nowMs)): LiveRow[] {
  const more = todayMore(v.tasks, v.today_team, nowMs, offsetMin)
  const d = liveToday(v.tasks, nowMs, offsetMin)
  const tokens = Math.max(more.who.reduce((s, x) => s + x.tokens, 0), d.tokens, ...more.hours)
  const dot: LiveSeg = { text: ' · ', tone: 'dim' }
  const rows: LiveRow[] = [
    { key: 'results', label: TODAY_ROW.results, segs: [{ text: `✓ ${d.merged} merged`, tone: 'passed' }, dot, { text: `↺ ${d.sentBack} sent back`, tone: 'warning' }, dot, { text: `✗ ${d.failed} failed`, tone: 'failed' }] },
  ]
  const sh = shares(more.who)
  rows.push({
    key: 'tokens',
    label: TODAY_ROW.tokens,
    segs: [{ text: fmtTokens(tokens), tone: 'text' }, ...more.who.flatMap((x, i): LiveSeg[] => [dot, { text: `${x.who} ${sh[i]}`, tone: x.who }]), ...(more.teamKnown ? [] : [{ text: TRIES_ONLY, tone: 'dim' as const }])],
  })
  rows.push({ key: 'time', label: TODAY_ROW.time, segs: [{ text: fmtDuration(more.workMs), tone: 'text' }, ...(more.usd !== undefined ? [dot, { text: todayCostText(more.usd), tone: 'dim' as const }] : [])] })
  const per = more.perTask
  const perParts = [
    ...(per?.tokens !== undefined ? [`⌀ ${fmtTokens(per.tokens)}/task`] : []),
    ...(per?.workMs !== undefined ? [`${fmtDuration(per.workMs)} work`] : []),
    ...(per?.mergeMs !== undefined ? [`${fmtDuration(per.mergeMs)} start-to-merge`] : []),
    ...(more.firstTry !== undefined ? [`first try ${Math.round(more.firstTry)}%`] : []),
    ...(more.avgTries !== undefined ? [`avg ${more.avgTries.toFixed(1)} tries/task`] : []),
    ...(more.sentBack !== undefined ? [`⌕ ${more.sentBack} sent back by the checker`] : []),
  ]
  // "median" goes on the first part shown, when it is one of the medians (tokens, work, start-to-merge)
  if (per && perParts.length && (per.tokens !== undefined || per.workMs !== undefined || per.mergeMs !== undefined)) perParts[0] = `median ${perParts[0]}`
  if (perParts.length) rows.push({ key: 'per-task', label: TODAY_ROW.perTask, segs: perParts.flatMap((x, i): LiveSeg[] => [...(i ? [dot] : []), { text: x, tone: 'text' }]) })
  if (more.hours.length) {
    const busiest = more.hours.indexOf(Math.max(...more.hours))
    rows.push({ key: 'hours', label: TODAY_ROW.hours, segs: [{ text: '00', tone: 'dim' }, ...sparkSegs(more.hours, 1), { text: '24', tone: 'dim' }, { text: `   busiest ${hh(busiest)}:00 · ${fmtTokens(more.hours[busiest]!)}`, tone: 'dim' }] })
  }
  const past = (key: string, label: string, p: PastDays) => {
    const parts = [p.merged > 0 && `${p.merged} merged`, p.tokens > 0 && fmtTokens(p.tokens), p.workMs >= 1000 && pastTime(p.workMs)].filter((x): x is string => !!x)
    if (parts.length) rows.push({ key, label, segs: [{ text: parts.join(' · '), tone: 'text' }] })
  }
  const before = rows.length
  past('yesterday', TODAY_ROW.yesterday, pastDays(v.tasks, nowMs, 1, offsetMin))
  past('week', TODAY_ROW.week, pastDays(v.tasks, nowMs, 7, offsetMin))
  // T-1043: one blank row between today's rows and the past rows (only when a past row shows)
  if (rows.length > before) rows.splice(before, 0, { key: 'gap', label: '', segs: [] })
  return rows
}

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

// ---------------- T-727: the Branches section under the lanes ----------------
//  ▍Branches
//  main   ●───●───●───●───●───●───●   c11a736 · 2 min ago
//         │       │           │   ╰─◀ T-724  merged 3m ago (c11a736)
//         │       │           ╰─────○ T-721  +3 commits · 1 behind
//         │       ╰─────────────────○ T-725  +0 commits · 4 behind
//         ╰─────────────────────────○ T-726  not started
// The figures come from git, read by the app side (hooks/app/branches.ts) and put in the view (`branches`).

/** One commit of the main line: its full sha and when it was made (ms). */
export type BranchCommit = { sha: string; at: number }
/** What git says of a task's branch: commits on it not in the branch it merges into (`ahead`), commits there not on
 *  it (`behind`), and where it forked (`base`, the merge-base's full sha). */
export type BranchFigures = { ahead: number; behind: number; base: string }
/** The branch figures in the view (T-727): the branch the main line shows (`into`), its latest commits (newest first),
 *  each open task's branch figures by task id (a task whose git command failed is left out), and when they were read. */
export type BranchFacts = { into: string; commits: BranchCommit[]; tasks: Record<string, BranchFigures>; at: number; /** T-1199: on a board with projects, each repo's own figures (its tasks' project is `project`, '' = the board folder's repo); the first fields are then the first repo's */ repos?: BranchRepo[] }
/** T-1199: one repo's branch figures: its project name ('' = the board folder), the name shown, the branch its tasks merge into, its latest commits and its tasks' figures. */
export type BranchRepo = { project: string; name: string; into: string; commits: BranchCommit[]; tasks: Record<string, BranchFigures> }

/** The task statuses whose branch gets a row. */
export const BRANCH_STATUSES: readonly SymccTask['status'][] = ['doing', 'review', 'waiting', 'failed', 'paused']
/** How many commits the main line shows at most. */
export const BRANCH_COMMITS = 7
/** At most this many task rows, then "+N more". */
export const BRANCH_ROWS_MAX = 8
/** At most this many "not started" rows (next-up todo tasks with no branch yet). */
export const BRANCH_NEW_MAX = 3
/** Past this many commits behind, "N behind" is a warning. */
export const BRANCH_BEHIND_WARN = 5

/** What a row of the section is: a task's branch, a just-merged task, a task not started yet, or the "+N more" line. */
export type BranchRowKind = 'branch' | 'merged' | 'new' | 'more'
/**
 * A row of the section: its task (`id`, none on "+N more"), what it is, the commit it hangs from (`col`, 0 = the
 * leftmost shown), the columns of the rows under it whose lines pass by (`lines`), whether one of them hangs from the
 * same commit (`tee`: "├" instead of "╰"), its whole line (`segs`) and the text after its mark (`label`).
 */
export type BranchRow = { id?: string; kind: BranchRowKind; col: number; lines: number[]; tee: boolean; segs: LiveSeg[]; label: LiveSeg[] }
/** The section in a width: its header, the main line (`main`: its segments; `name` the branch, `commits` the shown ones
 *  oldest first, `step` the columns from one dot to the next, `indent` the columns before the first dot, `right` the
 *  newest commit's sha and age), and the rows. */
export type LiveBranches = { /** T-1199: with several repos, the line above this repo's main line ("client · merges into dev"); absent on a board with no projects */ repoHead?: LiveSeg[]; head: LiveSeg[]; main: LiveSeg[]; name: string; commits: BranchCommit[]; step: number; indent: number; right: string; rows: BranchRow[] }

/** "just now", "2 min ago", "3 h ago", "4 d ago". */
export function agoText(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}

type BranchItem = { id: string; kind: 'branch' | 'merged' | 'new'; fig?: BranchFigures; merged?: string; atMs?: number; state?: BranchState }

/** T-913: a branch row's task state after its id, in the board list's own mark and colour (rowMark, LIST_TONE): the
 *  mark ("‖", "✗", "?", "◆", or a running task's stage icon "▶", "⊛", ...) and a short word ("paused", "in review"). */
export type BranchState = { mark: string; word: string; tone: LiveTone }
/** The short word of each state a branch row shows (BRANCH_STATUSES); a running task shows its step's word instead. */
export const BRANCH_STATE_WORD: Record<string, string> = { doing: 'running', review: 'in review', waiting: 'waiting', failed: 'failed', paused: 'paused' }
const BRANCH_STATE_TONE: Record<string, LiveTone> = { doing: 'bar', review: 'warning', waiting: 'warning', failed: 'failed', paused: 'paused' }

/** T-913: the state a branch row shows for task `t` at `nowMs`: a task shown as doing (shownStatus: also one in review or
 *  waiting while its approve runs) has its stage's icon and word ("⊛ test", "▶ running"), the others their status. */
export function branchState(t: LiveView['tasks'][number], nowMs: number): BranchState {
  const shown = shownStatus(t as BoardTask, nowMs)
  const step = stageStep(taskPhase(t as BoardTask, nowMs).stage)
  const word = shown === 'doing' && step ? STEP_WORD[step] : BRANCH_STATE_WORD[shown] ?? shown
  return { mark: rowMark(t as BoardTask, nowMs), word, tone: BRANCH_STATE_TONE[shown] ?? 'dim' }
}

/** The tasks the section shows, in the order they are kept when there are too many: the open tasks with a branch git
 *  answered for (by id), then (T-794) the tasks ▍Tasks keeps as finished lanes (liveFinishedLanes: merged in the last
 *  LIVE_FINISHED_MS, at most LIVE_FINISHED_MAX, newest first), then up to BRANCH_NEW_MAX next-up tasks with no branch yet. */
function branchItems(view: LiveView, facts: Pick<BranchFacts, 'tasks'>, nowMs: number, project?: string): BranchItem[] {
  const open: BranchItem[] = []
  // T-1199: with a project ('' = none), only that repo's tasks
  const mine = (id: string) => project === undefined || ((view.tasks.find(t => t.id === id) as { project?: string } | undefined)?.project ?? '') === project
  for (const t of view.tasks) {
    if (t.status === 'done' || !mine(t.id)) continue
    const fig = facts.tasks[t.id]
    if (BRANCH_STATUSES.includes(t.status) && t.branch && fig) open.push({ id: t.id, kind: 'branch', fig, state: branchState(t, nowMs) })
  }
  const merged = liveFinishedLanes(view, nowMs).filter(l => mine(l.id)).map((l): BranchItem => {
    const sha = view.tasks.find(t => t.id === l.id)?.merged
    return { id: l.id, kind: 'merged', ...(sha ? { merged: sha } : {}), atMs: l.done?.atMs ?? nowMs }
  })
  const next = liveTrains(view, nowMs)
    .next.filter(x => mine(x.id) && !x.stuck.length && !(view.tasks.find(t => t.id === x.id)?.branch))
    .slice(0, BRANCH_NEW_MAX)
    .map((x): BranchItem => ({ id: x.id, kind: 'new' }))
  const byId = (a: BranchItem, b: BranchItem) => num(a.id) - num(b.id)
  return [...open.sort(byId), ...merged, ...next]
}

/** The text after a row's mark, longest first: " T-721  +3 commits · 1 behind" (warning past BRANCH_BEHIND_WARN), then shorter. */
function branchLabels(x: BranchItem, nowMs: number): LiveSeg[][] {
  const id: LiveSeg = { text: ` ${x.id}`, tone: 'id' }
  if (x.kind === 'merged') {
    const time = rowDuration(Math.max(0, nowMs - (x.atMs ?? nowMs)))
    const sha = x.merged ? x.merged.slice(0, 7) : ''
    return [
      ...(sha ? [[id, { text: `  merged ${time} ago (${sha})`, tone: 'dim' as const }]] : []),
      [id, { text: `  merged ${time} ago`, tone: 'dim' }],
      [id, { text: ` merged ${time}`, tone: 'dim' }],
    ]
  }
  if (x.kind === 'new') return [[id, { text: '  not started', tone: 'dim' }]]
  const { ahead, behind } = x.fig!
  const late: LiveTone = behind > BRANCH_BEHIND_WARN ? 'warning' : 'dim'
  const dot: LiveSeg = { text: ' · ', tone: 'dim' }
  const st = x.state
  // T-913: the state after the id ("‖ paused"); when narrow the word goes first, the mark stays
  const word: LiveSeg[] = st ? [{ text: ` ${st.mark} ${st.word}`, tone: st.tone }, dot] : [{ text: ' ', tone: 'dim' }]
  const mark: LiveSeg[] = st ? [{ text: ` ${st.mark}`, tone: st.tone }, { text: ' ', tone: 'dim' }] : [{ text: ' ', tone: 'dim' }]
  const long: LiveSeg[] = [{ text: `+${plural(ahead, 'commit')}`, tone: 'text' }, dot, { text: `${behind} behind`, tone: late }]
  const mid: LiveSeg[] = [{ text: `+${ahead}`, tone: 'text' }, dot, { text: `${behind} behind`, tone: late }]
  return [
    [id, ...word, ...long],
    [id, ...mark, ...long],
    [id, ...word, ...mid],
    [id, ...mark, ...mid],
    [id, ...mark, { text: `+${ahead}`, tone: 'text' }, { text: ` ↓${behind}`, tone: late }],
  ]
}
const LABEL_ROOM = textWidth(' T-000 ‖ +0 · 0 behind')

/**
 * The Branches section (see above) for the view's branch figures in `width` columns, or null when there are none
 * (git isn't ready, or not read yet). The main line shows up to BRANCH_COMMITS of the newest commits, fewer and closer
 * when narrow, so each row keeps room for its words; a row hangs from the commit its branch forked from (a just-merged
 * task from its merge commit, else the newest), or from the leftmost commit when that one isn't shown (and a task not
 * started). Rows are ordered so their lines never cross; past BRANCH_ROWS_MAX rows, "+N more". The heading is in
 * `width`, the lines under it in liveInner(width) (words are cut with "…"), for the client to indent (LIVE_INDENT).
 */
export function liveBranches(view: LiveView, nowMs: number, width: number): LiveBranches | null {
  return liveBranchBlocks(view, nowMs, width)[0] ?? null
}

/**
 * T-1199: the Branches section as one block per repo (a board with no projects has one block, drawn as ever; its
 * `repoHead` is absent). Each block is a liveBranches-shaped section: its main line is its own repo's, its rows hang off
 * that line, and (with several repos or projects) `repoHead` names the repo and the branch its tasks merge into.
 * Only repos with open or just-merged tasks have a block; the clients draw the heading once, above the first.
 */
export function liveBranchBlocks(view: LiveView, nowMs: number, width: number): LiveBranches[] {
  const facts = view.branches
  if (!facts) return []
  if (!facts.repos) return [branchBlock(view, facts, nowMs, width)].flatMap(x => (x ? [x] : []))
  return facts.repos.flatMap(r => {
    const x = branchBlock(view, r, nowMs, width, r.project)
    if (!x) return []
    const head: LiveSeg[] = [{ text: ` ${r.name}`, tone: 'title' }, { text: ` · merges into ${r.into}`, tone: 'dim' }]
    return [{ ...x, repoHead: head }]
  })
}

function branchBlock(view: LiveView, facts: Pick<BranchFacts, 'into' | 'commits' | 'tasks'>, nowMs: number, width: number, project?: string): LiveBranches | null {
  if (!facts.commits.length) return null
  const full = Math.max(1, Math.floor(width))
  const w = liveInner(full)
  const items = branchItems(view, facts, nowMs, project)
  if (!items.length) return null
  const kept = items.slice(0, BRANCH_ROWS_MAX)
  const hidden = items.length - kept.length
  const nameW = Math.min(12, Math.max(4, textWidth(facts.into)))
  const n = Math.min(BRANCH_COMMITS, facts.commits.length)
  // the most commits, then the widest step, that leave each row room for its words
  let pick: { k: number; step: number; indent: number } | undefined
  for (const gap of [3, 1])
    for (let k = n; k >= Math.min(2, n) && !pick; k--)
      for (const step of [4, 3, 2]) {
        const indent = 1 + nameW + gap
        if (indent + 1 + (k - 1) * step + 2 + LABEL_ROOM <= w) {
          pick = { k, step, indent }
          break
        }
      }
  const { k, step, indent } = pick ?? { k: Math.min(2, n), step: 2, indent: 1 + nameW + 1 }
  const shown = facts.commits.slice(0, k).reverse()
  const trackW = 1 + (k - 1) * step
  const markAt = trackW + 1
  const colOf = (sha: string | undefined, none: number) => {
    const i = sha ? shown.findIndex(c => c.sha === sha || (sha.length >= 7 && c.sha.startsWith(sha))) : -1
    return i >= 0 ? i : none
  }
  const placed = kept.map(x => ({ x, col: x.kind === 'merged' ? colOf(x.merged, 0) : x.kind === 'branch' ? colOf(x.fig!.base, 0) : 0 }))
  // same commit: the open tasks first, then the finished ones (newest first), then the ones not started
  const rank = (x: BranchItem) => (x.kind === 'branch' ? 0 : x.kind === 'merged' ? 1 : 2)
  placed.sort((a, b) => b.col - a.col || rank(a.x) - rank(b.x) || (b.x.atMs ?? 0) - (a.x.atMs ?? 0) || num(a.x.id) - num(b.x.id))
  // the header
  const head = liveHeading(LIVE_SECTIONS.branches, full)
  // the main line
  const newest = shown[shown.length - 1]!
  const sha = newest.sha.slice(0, 7)
  const room = w - indent - trackW
  const right = [`   ${sha} · ${agoText(nowMs - newest.at)}`, `  ${sha}`, ''].find(s => textWidth(s) <= room) ?? ''
  const name = cutTitle(facts.into, nameW)
  const track: LiveSeg[] = []
  shown.forEach((_, i) => {
    if (i) track.push({ text: '─'.repeat(step - 1), tone: 'dim' })
    track.push({ text: '●', tone: 'bar' })
  })
  const main = fitSegs<LiveSeg>([{ text: ` ${padWidth(name, indent - 1)}`, tone: 'title' }, ...track, ...(right ? [{ text: right, tone: 'dim' as const }] : [])], w)
  // the rows
  const rows: BranchRow[] = placed.map(({ x, col }, i) => {
    const below = placed.slice(i + 1).map(p => p.col)
    const tee = below.includes(col)
    const cells = Array.from({ length: markAt }, () => ' ')
    for (const c of below) cells[c * step] = '│'
    cells[col * step] = tee ? '├' : '╰'
    for (let c = col * step + 1; c < markAt; c++) cells[c] = '─'
    const graph = cells.join('')
    const mark: LiveSeg = { text: x.kind === 'merged' ? '◀' : '○', tone: x.kind === 'merged' ? 'dim' : 'future' }
    const lead: LiveSeg[] = [{ text: ' '.repeat(indent), tone: 'text' }, { text: graph, tone: 'dim' }, mark]
    const leadW = textWidth(segText(lead))
    const labels = branchLabels(x, nowMs)
    const label = labels.find(l => leadW + textWidth(segText(l)) <= w) ?? fitSegs(labels[labels.length - 1]!, Math.max(0, w - leadW))
    return { id: x.id, kind: x.kind, col, lines: below, tee, segs: fitSegs([...lead, ...label], w), label }
  })
  if (hidden) rows.push({ kind: 'more', col: 0, lines: [], tee: false, segs: [{ text: fitText(`${' '.repeat(indent)}+${hidden} more`, w), tone: 'dim' }], label: [{ text: `+${hidden} more`, tone: 'dim' }] })
  return { head, main, name, commits: shown, step, indent, right: right.trim(), rows }
}
