// The board panel's Live tab (T-690): one "railway lane" per task in doing, showing the station it is at on its way to
// the merge (work → check → queue → tests → done), its tokens, then what starts next and today's numbers. Everything
// a client needs is worked out here, the lane text included (cut titles, station marks, the blinking current station),
// so each client (Claude Code's terminal panel now; VS Code and OpenCode later) only draws the segments.
// T-797: the sections have their own files: live-today.ts, live-orgmem.ts, live-branches.ts; the shared pieces are in live-seg.ts.
import type { SymccMode, SymccTask } from '../../types'
import { type BoardTask, type ChangeSize, OPEN, byRunOrder, DEFAULT_AUTO_RETRIES, emptyBoard, kindOf, isInvestigation, modeOf } from './board-file'
import { taskPhase, type PhaseStage } from './phase'
import { handedBack, shownStatus } from './lead'
import { median } from './stats'
import { cutTitle, padWidth, textWidth, wrapLine } from './width'
import { activeFrom, restartsOf, agentsOf, agentsOnTask, sumRuns, checkerIdOf, tryTokens, fmtDuration, fmtTokens, sumTokens, tokenCount, TOKEN_SIGN, fmtTok } from './runs'
import { type KeyHint, LIVE_VIEW_KEYS, rowDuration, waitOrder, fileWaitText, rowTitle, taskAsks } from './panel'
import { openAfter } from './archive'
import { modeLabel, needsReview } from './review'
import { num, plural } from './text'
import { asksMoreTime, needsYou } from './commands'
import { isOpenQuestion } from './questions'
import { whyFailed } from './failure'
import { newestFirst } from './settings'
import { isAnswered } from './task'
import { STATUS_MARK } from './details'
import { sizeText } from './commits'
import { marksOf, type LiveTone, type LiveSeg, segs, segText, fitText, ms } from './live-seg'
import type { TodayTeam } from './live-today'
import type { BranchFacts } from './live-branches'

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

/** Whether a tone is drawn bold. */
export const liveBold = (tone: LiveTone): boolean => tone === 'id' || tone === 'current' || tone === 'heading' || tone === 'run'
/** T-846: the mark at a station the task skips. */
export const LIVE_SKIP_MARK = '–'
/** T-771: the mark at a finished lane's last station. */
export const LIVE_DONE_MARK = '✓'
/** T-767: what a running lane's first line starts with (before its id). */
export const LIVE_RUN_MARK = '▶ '

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
