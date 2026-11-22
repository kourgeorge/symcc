// The board panel's Live tab (T-690): one "railway lane" per task in doing, showing the station it is at on its way to
// the merge (work → check → queue → tests → merged), its tokens, then what starts next and today's numbers. Everything
// a client needs is worked out here, the lane text included (cut titles, station marks, the blinking current station),
// so each client (Claude Code's terminal panel now; VS Code and OpenCode later) only draws the segments.
import type { SymccMode, SymccTask } from '../../types'
import { type BoardTask, DEFAULT_AUTO_RETRIES, emptyBoard, kindOf, isInvestigation, modeOf } from './board-file'
import { taskPhase, type PhaseStage } from './phase'
import { handedBack, shownStatus } from './lead'
import { cutTitle, median, padWidth, taskFigures, textWidth, wrapLine } from './stats'
import { checkerIdOf, checkerTokensOf, tryCost, tryTokens, fmtCost, fmtDuration, fmtTokens, sumTokens, tokenCount } from './runs'
import { type KeyHint, LIVE_VIEW_KEYS, hintLineText, hintLines, rowDuration, waitOrder } from './panel'
import { ORG_MEM_EMPTY, ORG_MEM_MAX_LINES, TOPIC_UNSORTED, orgMemNewest, orgMemSectionKeys, orgMemShortDay, orgMemTopicCounts, type OrgMemNote } from './org-mem'
import { depDone } from './archive'
import { dayOf, localOffset } from './days'
import { modeLabel } from './review'
import { num } from './text'
import { asksMoreTime, needsYou } from './commands'
import { fileWaitText, taskAsks } from './panel'
import { isOpenQuestion } from './questions'
import { whyFailed } from './failure'
import { newestFirst } from './settings'
import { isAnswered } from './task'
import { viewMarks } from './board-parts'

/**
 * The kinds and times of task `t`'s history lines. A board view's done or dropped task (viewTask, e.g. OpenCode's)
 * comes without its history, and OpenCode's TUI then fills it in as `history: []` (viewStubFilled): its history marks
 * (the kinds and times of its merge and send-back lines) stand in for it whenever it has them and no history lines.
 */
function marksOf(t: { history?: readonly { kind: string; at?: string; reason?: string }[] }): readonly { kind: string; at?: string; reason?: string }[] {
  const history = Array.isArray(t.history) ? t.history : []
  return history.length > 0 ? history : (viewMarks(t) ?? history)
}

/**
 * T-781: task `t`'s send-backs on one day (`isToday` tells by the mark's time): `all` counts every one the way /symcc-stats
 * lists failed tries (the checker's problems, tests failed, a clash with main), `checker` only the checker's. A finished
 * task's board view keeps marks (no text) of the checker's lines and of its tests-failed and clash lines (with their reason).
 */
function sentBackOf(t: { history?: readonly { kind: string; at?: string; reason?: string }[] }, isToday: (at: string | undefined) => boolean): { all: number; checker: number } {
  const marks = marksOf(t) as readonly { kind: string; at?: string; reason?: string }[]
  const checker = marks.filter(h => h.kind === 'checker-problems' && isToday(h.at)).length
  const other = marks.filter(h => (h.reason === 'tests' || h.reason === 'clash') && isToday(h.at)).length
  return { all: checker + other, checker }
}

/** The stations of a lane, in the order a task passes them. */
export type LiveStation = 'work' | 'check' | 'queue' | 'tests' | 'merged'
export const LIVE_STATIONS: readonly LiveStation[] = ['work', 'check', 'queue', 'tests', 'merged']
/** T-760: the mark after a station name where an agent works (work, check): those stations need an agent slot. */
export const LIVE_AGENT_MARK = '✧'
/** The line under the lanes that says what LIVE_AGENT_MARK after a station name means. */
export const LIVE_LEGEND = `${LIVE_AGENT_MARK} = an agent works here (needs an agent slot)`
/** T-757: what the token bar means, with the board's usual tokens per merged task. */
export const liveBarLegend = (usual: number): string => `bar: tokens of the task so far, full = usual per task (${fmtTokens(usual)})`
/** The legend under the lanes in `width` columns: LIVE_LEGEND, then (when the usual tokens per task are known, so the
 *  lanes draw bars) what the bar means; on one line when it fits, else on more (each cut at spaces, never wider). */
export function liveLegend(lanes: readonly Pick<LiveLane, 'usual'>[], width: number): string[] {
  const usual = lanes.find(l => l.usual)?.usual
  const w = Math.max(1, Math.floor(width))
  // T-760: the mark's line is longer now, so a narrow panel wraps it too
  const mark = wrapLine(LIVE_LEGEND, w)
  if (!usual) return mark
  const bar = liveBarLegend(usual)
  const one = `${LIVE_LEGEND}   ${bar}`
  if (textWidth(one) <= width) return [one]
  return [...mark, ...wrapLine(bar, w)]
}
/** What the Live tab says when no task is in doing. */
export const LIVE_EMPTY = 'No task is running right now.'
/** The stations shown: check only when the checker setting is on. */
export const liveStations = (checker: boolean): LiveStation[] => LIVE_STATIONS.filter(s => s !== 'check' || checker)

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
  { key: 'm', word: 'org-mem' },
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
  at: number
  stage: PhaseStage
  sinceMs?: number
  place?: number
  tryNo: number
  tries: number
  tokens?: number
  more?: boolean
  usual?: number
  sentBack: number
  enteredMs: number
  agent: boolean
  /** T-771: set on a finished lane (a task merged in the last LIVE_FINISHED_MS):
   *  when it merged and the word its right column says ("merged 3m ago"). */
  done?: { atMs: number; word: 'merged' }
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
      return 'merged'
  }
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

/** When task `t` got to `station` in its try that started at `startMs`: the history's stage lines (T-616), else the hand-back, else the check step's mark. */
function stationSince(t: BoardTask, station: LiveStation, startMs: number | undefined): number | undefined {
  if (station === 'work') return startMs
  const stageAt = (steps: string[], first: boolean) => {
    const hits = (t.history ?? []).filter(h => h.kind === 'stage' && h.step !== undefined && steps.includes(h.step)).map(h => ms(h.at)).filter((n): n is number => n !== undefined && (startMs === undefined || n >= startMs))
    return hits.length ? (first ? Math.min(...hits) : Math.max(...hits)) : undefined
  }
  const found = station === 'check' ? stageAt(['prep', 'checker'], true) : station === 'queue' ? stageAt(['queue'], false) : station === 'tests' ? stageAt(['tests'], false) : stageAt(['merge'], false)
  return found ?? (station === 'check' ? ms(t.runs?.[t.runs.length - 1]?.ended) : undefined) ?? ms(t.live?.checking?.at)
}

/** When the approve (or files-merge) running on task `t` (in review or waiting) started: its last "prep started" line
 *  after its try ended, else its check step's mark. */
function approveSince(t: BoardTask, endMs: number | undefined): number | undefined {
  const preps = (t.history ?? []).filter(h => h.kind === 'stage' && h.step === 'prep').map(h => ms(h.at)).filter((n): n is number => n !== undefined && (endMs === undefined || n >= endMs))
  return preps.length ? Math.max(...preps) : ms(t.live?.checking?.at)
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
      const place = stage === 'queue' ? t.live?.checking?.place : undefined
      // T-757: the whole task's tokens (every try); the current try's are known only once it hands back
      const runs = t.runs ?? []
      const more = !!run && !tryTokens(run)
      const total = tokenCount(sumTokens(runs.map(tryTokens)))
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
        ...(total > 0 ? { tokens: total } : {}),
        ...(more && total > 0 ? { more } : {}),
        ...(usual ? { usual } : {}),
        sentBack: (t.history ?? []).filter(h => h.kind === 'checker-problems').length,
        enteredMs,
        agent: stage === 'worker' || (stage === 'checker' && !!checkerIdOf(t)),
      }
    })
  return lanes.sort((a, b) => a.enteredMs - b.enteredMs || num(a.id) - num(b.id))
}

/** T-771: when done task `t` merged: its last "merged" history line (else its last try's end, when it has such a
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
  const stations = liveStations(view.checker === true)
  const usual = usualTokens(view.tasks)
  const retries = view.auto_retries ?? DEFAULT_AUTO_RETRIES
  const at = stations.length - 1
  return view.tasks
    .filter(t => t.status === 'done')
    .map(t => ({ t, done: finishedAt(t) }))
    .filter((x): x is { t: SymccTask; done: NonNullable<LiveLane['done']> } => !!x.done && nowMs - x.done.atMs < LIVE_FINISHED_MS && x.done.atMs - nowMs < LIVE_FINISHED_MS)
    .sort((a, b) => b.done.atMs - a.done.atMs || num(b.t.id) - num(a.t.id))
    .slice(0, LIVE_FINISHED_MAX)
    .map(({ t, done }): LiveLane => {
      const tryNo = Math.max(1, Number(t.attempts) || 1)
      const auto = Number(t.test_tries ?? 0) || 0
      const total = tokenCount(sumTokens((t.runs ?? []).map(tryTokens)))
      return {
        id: t.id,
        title: t.title,
        kind: kindOf(t),
        stations,
        station: stations[at]!,
        at,
        stage: 'merge',
        tryNo,
        tries: Math.max(tryNo, tryNo - auto + retries),
        ...(total > 0 ? { tokens: total } : {}),
        ...(usual ? { usual } : {}),
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
/** T-770: the mark in front of the running scouts at the end of the mode line, drawn in the scout color. */
export const LIVE_SCOUT_MARK = '⌕'
/** What goes between the mode line and the scout mark. */
export const LIVE_SCOUT_GAP = ' · '

/**
 * T-770: the scout mark at the end of the Live tab's mode line ("⌕ gaps-bot 4m, board-review 1m"), or null when no
 * scout runs. `room`: the columns left after the mode line. The names and times when they fit (oldest run first),
 * else "⌕ 3 scouts", else "⌕ 3", else nothing. `text` is what comes after the mark (with its leading space), drawn dim.
 */
export function liveScoutMark(runs: readonly LiveScoutRun[] | undefined, nowMs: number, room = Infinity): { gap: string; mark: string; text: string } | null {
  const list = (Array.isArray(runs) ? runs : []).filter(r => r && typeof r.name === 'string' && Number.isFinite(r.since)).slice().sort((a, b) => a.since - b.since)
  if (!list.length) return null
  const n = list.length
  const forms = [list.map(r => `${r.name} ${fmtDuration(nowMs - r.since)}`).join(', '), `${n} scout${n === 1 ? '' : 's'}`, `${n}`]
  for (const f of forms) {
    const text = ` ${f}`
    if (textWidth(LIVE_SCOUT_GAP + LIVE_SCOUT_MARK + text) <= room) return { gap: LIVE_SCOUT_GAP, mark: LIVE_SCOUT_MARK, text }
  }
  return null
}

/** T-770: the mode line with its scout mark as segments, within `width` columns: the line ('text'), then the gap
 *  ('text'), the mark ('scouts') and the names ('dim') while scouts run. */
export function liveHeaderSegs(view: LiveView & { scouts?: readonly { name: string; running?: boolean; started?: boolean; last_run?: string | null }[] }, lanes: readonly LiveLane[], nowMs: number, width = Infinity): LiveSeg[] {
  const head = liveHeader(view, lanes)
  const m = liveScoutMark(scoutsRunning(view.scouts), nowMs, width - textWidth(head))
  return [{ text: head, tone: 'text' }, ...(m ? [{ text: m.gap, tone: 'text' as const }, { text: m.mark, tone: 'scouts' as const }, { text: m.text, tone: 'dim' as const }] : [])]
}

/** The current station's mark on redraw number `frame`: ◉ and ◎ in turn; always ◉ when `steady` (reduced motion). */
export const liveBlink = (frame: number, steady = false): string => (steady || frame % 2 === 0 ? '◉' : '◎')

/** How a lane's text is colored: each client picks its own colors for these. */
export type LiveTone = 'id' | 'title' | 'passed' | 'current' | 'future' | 'text' | 'dim' | 'warning' | 'bar' | 'heading' | 'mark' | 'run' | 'wait' | 'topic' | 'now' | TodayWho
/** A piece of a lane's line in one tone. */
export type LiveSeg = { text: string; tone: LiveTone }
/** Each tone's color name, the same in every client; a section heading ("▍Tasks") and (T-760) the agent mark "✧" have
 *  the task page's heading color. T-767: a running lane's "▶ " and id are 'run' (bold, the accent color; its title is normal text); a
 *  waiting train's id is 'run' too (T-819) and its title 'wait' (dim, as the rest of its row); an org-mem topic is 'topic' (blue, T-819). */
export const LIVE_TONE: Record<LiveTone, string> = { id: 'claude', title: 'text', passed: 'success', current: 'ide', future: 'inactive', text: 'text', dim: 'inactive', warning: 'warning', bar: 'ide', heading: 'suggestion', mark: 'suggestion', run: 'claude', now: 'claude', wait: 'inactive', topic: 'ide', workers: 'ide', checkers: 'autoAccept', scouts: 'suggestion', lead: 'success' }
/** Whether a tone is drawn bold. */
export const liveBold = (tone: LiveTone): boolean => tone === 'id' || tone === 'current' || tone === 'heading' || tone === 'run'
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
/** T-810: the thin rule (─) after a heading that used `used` columns of `width`: a space, then ─ to the right edge
 *  (shorter when narrow, none in under 4 columns). */
export const liveRuleText = (used: number, width: number): string => {
  const room = Math.floor(width) - used - 1
  return Math.floor(width) < 4 || room < 1 ? '' : ` ${'─'.repeat(room)}`
}
/** T-789/T-810: a section's heading in `width` columns: the name in UPPERCASE ("TASKS", cut when narrow), bold, then a thin
 *  rule in the heading color to the right edge. The client puts one empty line above it (none above the first) and one under it. */
export const liveHeading = (name: string, width: number): LiveSeg[] => {
  const text = fitText(name.toUpperCase(), Math.max(1, Math.floor(width)))
  const rule = liveRuleText(textWidth(text), width)
  return [{ text, tone: 'heading' }, ...(rule ? [{ text: rule, tone: 'heading' as const }] : [])]
}
/** A line under a section heading: LIVE_INDENT, then its segments. */
export const liveIndented = (xs: readonly LiveSeg[]): LiveSeg[] => [{ text: LIVE_INDENT, tone: 'text' }, ...xs]

/** How the lanes are laid out at a width: the id and title columns, the gap between stations, the station names, the right column. */
export type LiveLayout = { width: number; idW: number; titleW: number; gap: number; labels: string[]; rightW: number; sep: number; stations: LiveStation[] }

const LABELS: Record<LiveStation, string>[] = [
  { work: 'work✧', check: 'check✧', queue: 'queue', tests: 'tests', merged: 'merged' },
  { work: 'wrk✧', check: 'chk✧', queue: 'que', tests: 'tst', merged: 'mrg' },
  { work: 'w✧', check: 'c✧', queue: 'q', tests: 't', merged: 'm' },
]
const MAX_GAP = 8
const MIN_GAP = 2
const TITLE_W = 12
const TITLE_MAX = 40
const RIGHT_W = 6

/** A lane line's width with these columns. */
const laneWidth = (idW: number, titleW: number, k: number, gap: number, sep: number, rightW = RIGHT_W) => LIVE_RUN_MARK.length + idW + (titleW ? 1 + titleW : 0) + sep + k + (k - 1) * gap + sep + rightW

/**
 * The layout of `lanes` at `width` columns: gaps of 8 and a 12-column title (wider, up to the longest title, when the
 * panel is wider); narrower, first the gaps shrink (to 2), then the title (to 3, then the id alone), then the
 * spaces around the stations. Station names get shorter as the gaps do, so they always fit over their marks.
 */
export function liveLayout(lanes: readonly (Pick<LiveLane, 'id' | 'title'> & Partial<Pick<LiveLane, 'done'>>)[], stations: readonly LiveStation[], width: number): LiveLayout {
  const idW = Math.max(4, ...lanes.map(l => textWidth(l.id)))
  const k = stations.length
  const longest = Math.max(3, ...lanes.map(l => textWidth(l.title)))
  const make = (titleW: number, gap: number, sep: number, rightW = RIGHT_W): LiveLayout => {
    const set = LABELS.find(s => stations.slice(0, -1).every(st => textWidth(s[st]) <= gap)) ?? LABELS[LABELS.length - 1]!
    return { width, idW, titleW, gap, labels: stations.map(s => set[s]), rightW, sep, stations: [...stations] }
  }
  const base = Math.min(TITLE_W, longest)
  // T-771: a finished lane's "merged 10m ago" wants a wider right column; when the stations and the title can't keep
  // their room beside it, the right column stays narrow and the lane says the shorter "10m ago" (laneRight)
  const wide = Math.max(RIGHT_W, ...lanes.map(l => (l.done ? textWidth(`${l.done.word} 10m ago`) : 0)))
  if (wide > RIGHT_W)
    for (let gap = MAX_GAP; gap >= MIN_GAP; gap--) {
      if (laneWidth(idW, base, k, gap, 2, wide) <= width) {
        const room = width - laneWidth(idW, base, k, gap, 2, wide)
        return make(gap === MAX_GAP ? Math.min(TITLE_MAX, longest, base + room) : base, gap, 2, wide)
      }
    }
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
  return segText(liveLabelSegs(l))
}
/** T-760: liveLabelLine in pieces: the names dim, each LIVE_AGENT_MARK in the 'mark' tone (the accent color). */
export function liveLabelSegs(l: LiveLayout): LiveSeg[] {
  const lead = ' '.repeat(LIVE_RUN_MARK.length + nameWidth(l) + l.sep)
  const text = lead + l.labels.map((s, i) => (i < l.labels.length - 1 ? padWidth(s, l.gap + 1) : s)).join('')
  return text.split(LIVE_AGENT_MARK).flatMap((x, i): LiveSeg[] => [...(i ? [{ text: LIVE_AGENT_MARK, tone: 'mark' as const }] : []), ...(x ? [{ text: x, tone: 'dim' as const }] : [])])
}

/** A bar of `cells` blocks for `value` against `full`: "▕████░░░░▏". */
const tokenBar = (value: number, full: number, cells: number) => {
  const n = Math.max(0, Math.min(cells, Math.round((value / full) * cells)))
  return `▕${'█'.repeat(n)}${'░'.repeat(cells - n)}▏`
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
 * 2. "  change try 2/3     ▕████████░░░░░▏ 1.1M  ↺×1": kind and try, the whole task's token bar (all its tries) against
 *    the board's usual tokens per merged task (full at the usual, staying full past it; warning past twice it, with ⚠),
 *    and the checker's send-backs. Parts that don't fit are left out (the bar first, then the kind), never cut. A running
 *    worker's tokens are known only at its hand-back: until then the earlier tries' sum with " + …", or "tokens at hand-back".
 */
export function laneLines(lane: LiveLane, l: LiveLayout, o: { nowMs: number; frame: number; steady?: boolean }): [LiveSeg[], LiveSeg[]] {
  const sep = ' '.repeat(l.sep)
  const track: LiveSeg[] = []
  const done = !!lane.done
  l.stations.forEach((_, i) => {
    if (i) track.push(i <= lane.at ? { text: '━'.repeat(l.gap), tone: 'passed' } : { text: '─'.repeat(l.gap), tone: 'future' })
    // T-771: a finished lane has ✓ (done color) at its last station instead of the blinking mark
    track.push(i < lane.at ? { text: '●', tone: 'passed' } : i === lane.at ? (done ? { text: LIVE_DONE_MARK, tone: 'passed' } : { text: liveBlink(o.frame, o.steady), tone: 'current' }) : { text: '○', tone: 'future' })
  })
  // T-767: "▶ " before the id; the mark and id bold in the accent color ('run'), the title normal text; T-771: a finished lane's dim, no mark
  const nameTone: LiveTone = done ? 'dim' : 'run'
  const name = segs({ text: done ? ' '.repeat(LIVE_RUN_MARK.length) : LIVE_RUN_MARK, tone: done ? 'text' : 'run' }, { text: padWidth(lane.id, l.idW), tone: nameTone }, l.titleW > 0 && { text: ` ${padWidth(cutTitle(lane.title, l.titleW), l.titleW)}`, tone: done ? 'dim' : 'text' })
  const first = [...name, { text: sep, tone: 'text' as const }, ...track, { text: sep + laneRight(lane, o.nowMs, l.rightW).padStart(l.rightW), tone: 'dim' as const }]
  // the second line
  const trackW = l.stations.length + (l.stations.length - 1) * l.gap
  const indent = LIVE_RUN_MARK.length + nameWidth(l) + l.sep
  const kindTry = ` ${lane.kind} try ${lane.tryNo}/${lane.tries}`
  const back = lane.sentBack ? `  ↺×${lane.sentBack}` : ''
  const over = lane.tokens !== undefined && lane.usual !== undefined && lane.tokens > 2 * lane.usual
  const fits = (xs: LiveSeg[]) => textWidth(segText(xs)) <= l.width
  const tokens = (form: 'bar' | 'plain' | 'none'): LiveSeg[] => {
    if (form === 'none') return []
    if (lane.tokens === undefined) return done ? [] : [{ text: 'tokens at hand-back', tone: 'dim' }]
    const cells = Math.min(13, Math.max(4, trackW - 2))
    // T-757: full bar = the usual tokens per task (it stays full past it); the warning only past twice the usual
    return segs(
      form === 'bar' && lane.usual !== undefined && { text: tokenBar(lane.tokens, lane.usual, cells) + ' ', tone: over ? 'warning' : 'bar' },
      { text: fmtTokens(lane.tokens), tone: over ? 'warning' : 'text' },
      lane.more && { text: ' + …', tone: 'dim' },
      over && { text: ' ⚠', tone: 'warning' },
    )
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
  const second = tries.find(fits) ?? tries[tries.length - 1]!
  // T-771: a finished lane's second line is dim throughout
  return [first, done ? second.map(x => (x.tone === 'text' && !x.text.trim() ? x : { ...x, tone: 'dim' })) : second]
}

// T-715: waiting trains. A todo task that still waits for an unfinished task hangs, as a "train" (└─◇), under the lane
// of the running task it waits for, or under the train of the todo task it waits for (a chain), down to a lane:
//                  work   check  queue  tests  merged
// ▶ T-712 Scout or… ●━━━━━━◉──────○──────○──────○  2m
//   bug  try 1/3   ▕████░░░░▏ 1.1M
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
    const history = marksOf(t)
    if (history.some(h => h.kind === 'merged' && isToday(h.at))) merged++
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

/** The ▍Today figures in `width` columns: "✓ 6 merged   ↺ 9 sent back   ✗ 1 failed   Σ 18.4M tokens", on more lines when narrow (a part wider than the page alone is cut). */
export function todayLines(d: LiveToday, width: number, triesOnly = false): string[] {
  const parts = [`✓ ${d.merged} merged`, `↺ ${d.sentBack} sent back`, `✗ ${d.failed} failed`, `Σ ${fmtTokens(d.tokens)} tokens${triesOnly ? TRIES_ONLY : ''}`]
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
//   ████████████▓▓▒░ workers 84% · checkers 8% · scouts 5% · lead 3%
//   08 ▁▂▃▅▇▆▅▃▅▇█▆▃ 20   busiest 14:00 · 42.1M tokens   first try 34%   ⌀ 2.4 tries   ⌕ 68 sent back by the checker

/** Who spent today's tokens, in the bar's order. */
export type TodayWho = 'workers' | 'checkers' | 'scouts' | 'lead'
export const TODAY_WHO: readonly TodayWho[] = ['workers', 'checkers', 'scouts', 'lead']
/** The bar's cell for each, so the parts can be told apart without colors too. */
export const TODAY_WHO_CELL: Record<TodayWho, string> = { workers: '█', checkers: '▓', scouts: '▒', lead: '░' }
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
        if (to > from) workMs += to - from
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
  return who.flatMap((w, i) => (cells[i]! > 0 ? [{ text: TODAY_WHO_CELL[w.who].repeat(cells[i]!), tone: w.who }] : []))
}

/** The hours as a sparkline, ▁ to █ (a space for an hour with no tokens). */
export function sparkline(hours: readonly number[]): string {
  const max = Math.max(0, ...hours)
  return hours.map(n => (n > 0 && max > 0 ? SPARK[Math.min(SPARK.length - 1, Math.max(0, Math.ceil((n / max) * SPARK.length) - 1))]! : ' ')).join('')
}

const hh = (h: number) => String(h).padStart(2, '0')

/** T-817: the dim mark for an hour still to come. */
const SPARK_FUTURE = '·'

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
  return [
    ...(cur > 0 ? [{ text: text.slice(0, cur), tone: 'bar' as const }] : []),
    ...(cur >= 0 ? [{ text: text.slice(cur), tone: 'now' as const }] : []),
    ...(sparkCells(g) > cells.length ? [{ text: SPARK_FUTURE.repeat(sparkCells(g) - cells.length), tone: 'dim' as const }] : []),
  ]
}

/**
 * ▍Today's second, third and fourth lines in `width` columns: (2) the stacked bar of who spent the tokens with their
 * shares, alone; (3) the medians per merged task, first try, tries and the checker's send-backs; (4) the agent work
 * time, the cost, the busiest hour, then the hour sparkline (00 to 24) at the very end. When narrow,
 * each line drops parts from its end; line 4 drops busiest, then the cost, then squeezes the sparkline (labels stay).
 * Never wider than `width`. A line with nothing to say is left out.
 */
export function todayMoreLines(m: TodayMore, width: number): LiveSeg[][] {
  const w = Math.max(1, Math.floor(width))
  const per = m.perTask
  const perParts = per ? [per.tokens !== undefined && fmtTokens(per.tokens), per.workMs !== undefined && `${fmtDuration(per.workMs)} work`, per.mergeMs !== undefined && `${fmtDuration(per.mergeMs)} start-to-merge`].filter((x): x is string => !!x) : []
  const sh = shares(m.who)
  // line 2: the who-spent bar and its shares, alone
  const line2 = (words: boolean, barW = TODAY_BAR): LiveSeg[] => {
    if (!m.who.length) return []
    const out: LiveSeg[] = [...todayBar(m.who, barW)]
    if (words) m.who.forEach((x, i) => out.push({ text: i ? ' · ' : ' ', tone: 'dim' }, { text: `${x.who} ${sh[i]}`, tone: x.who }))
    return out
  }
  // line 3: the per-task medians, then first try, tries and the checker's send-backs; `keep` parts stay (dropped from the end)
  const extras3: string[] = [
    ...(m.firstTry !== undefined ? [`first try ${Math.round(m.firstTry)}%`] : []),
    ...(m.avgTries !== undefined ? [`⌀ ${m.avgTries.toFixed(1)} tries`] : []),
    ...(m.sentBack !== undefined ? [`⌕ ${m.sentBack} sent back by the checker`] : []),
  ]
  const line3 = (keep: number): LiveSeg[] => {
    const out: LiveSeg[] = []
    const p = perParts.slice(0, keep)
    if (p.length) out.push({ text: '⌀ ', tone: 'dim' }, { text: `per task ${p.join(' · ')}`, tone: 'text' })
    const rest = keep > perParts.length ? extras3.slice(0, keep - perParts.length) : []
    rest.forEach((x, i) => out.push({ text: out.length ? (i && !x.startsWith('⌕') ? ' · ' : '   ') : '', tone: i && !x.startsWith('⌕') ? 'dim' : 'text' }, { text: x, tone: 'dim' }))
    return out
  }
  const busiest = m.hours.length ? m.hours.indexOf(Math.max(...m.hours)) : -1
  // line 4: agent work time, the cost, the busiest hour, then the sparkline with its labels at the very end
  const line4 = (cost: boolean, busy: boolean, per: number): LiveSeg[] => {
    const out: LiveSeg[] = []
    const gap = () => out.length && out.push({ text: '   ', tone: 'text' })
    if (m.workMs > 0) out.push({ text: '⏱ ', tone: 'dim' }, { text: `${fmtDuration(m.workMs)} agent work`, tone: 'text' })
    if (cost && m.usd !== undefined) {
      if (out.length) out.push({ text: ' · ', tone: 'dim' })
      out.push({ text: todayCostText(m.usd), tone: 'text' })
    }
    if (busy && busiest >= 0) {
      gap()
      out.push({ text: `busiest hour ${hh(busiest)}:00 · ${fmtTokens(m.hours[busiest]!)}`, tone: 'dim' })
    }
    if (per > 0 && m.hours.length) {
      gap()
      out.push({ text: '00 ', tone: 'dim' }, ...sparkSegs(m.hours, per), { text: ' 24', tone: 'dim' })
    }
    return out
  }
  const fits = (xs: LiveSeg[]) => textWidth(segText(xs)) <= w
  let two = line2(true)
  if (!fits(two)) two = line2(false, Math.min(TODAY_BAR, w))
  let three: LiveSeg[] = []
  for (let keep = perParts.length + extras3.length; keep >= 1; keep--) {
    three = line3(keep)
    if (fits(three)) break
  }
  if (!fits(three)) three = [{ text: fitText(segText(three), w), tone: 'text' }]
  // line 4 drops busiest, then the cost, then squeezes the sparkline (labels stay), then drops it, then the work time
  const n = m.hours.length
  let four: LiveSeg[] = []
  const tries: [boolean, boolean, number][] = [[true, true, 1], [true, false, 1], [false, false, 1]]
  for (const [c, b, k] of tries) {
    four = line4(c, b, k)
    if (fits(four)) break
  }
  // squeezed: 2, 3, 4 (and more) hours to a cell, the smallest that fits, the labels staying
  const squeezed = (work: boolean) => {
    for (let per = 2; per <= 24; per++) {
      const x = work ? line4(false, false, per) : [{ text: '00 ', tone: 'dim' as const }, ...sparkSegs(m.hours, per), { text: ' 24', tone: 'dim' as const }]
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

/** All of ▍Today's lines in `width` columns (each under LIVE_INDENT): the figures (todayLines), then todayMoreLines. */
export function liveTodayLines(v: Pick<LiveView, 'tasks' | 'today_team'>, nowMs: number, width: number, offsetMin: number = localOffset(nowMs)): LiveSeg[][] {
  const more = todayMore(v.tasks, v.today_team, nowMs, offsetMin)
  const d = liveToday(v.tasks, nowMs, offsetMin)
  // T-799: Σ is everyone's tokens (the bar's total), never less than the busiest hour
  const tokens = Math.max(more.who.reduce((s, x) => s + x.tokens, 0), d.tokens, ...more.hours)
  const triesOnly = !more.teamKnown
  const first = todayLines({ ...d, tokens }, width, triesOnly).map((text): LiveSeg[] =>
    text.endsWith(TRIES_ONLY) ? [{ text: text.slice(0, -TRIES_ONLY.length), tone: 'text' }, { text: TRIES_ONLY, tone: 'dim' }] : [{ text, tone: 'text' }])
  return [...first, ...todayMoreLines(more, width)]
}

// ---------------- T-718: the Organizational memory section at the bottom of the Live tab ----------------
//  ▍Organizational memory   57 / 60 ▕█████████░▏
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

/** The section's heading in `width` columns: "ORGANIZATIONAL MEMORY   57 / 60 ────" (T-810: the count of the cap, no bar,
 *  then the thin rule; the title shorter when narrow). T-772: the count is dim, never a warning. */
function orgMemHead(n: number, width: number): LiveSeg[] {
  const count = `${n} / ${ORG_MEM_MAX_LINES}`
  for (const title of [LIVE_SECTIONS.orgMem.toUpperCase(), 'ORG-MEM']) {
    const used = textWidth(`${title}   ${count}`)
    if (used > width) continue
    const rule = liveRuleText(used, width)
    return segs({ text: title, tone: 'heading' }, { text: '   ', tone: 'text' }, { text: count, tone: 'dim' }, { text: rule, tone: 'heading' })
  }
  return liveHeading('Org-mem', width)
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
  const keys = hintLines(orgMemSectionKeys(), w - 2).map(l => `  ${hintLineText(l)}`)
  return {
    head: orgMemHead(notes.length, full),
    newestLabel: '  newest',
    newest: newestLines(orgMemNewest(notes), w),
    empty: notes.length ? '' : `  ${ORG_MEM_EMPTY}`,
    topicsLabel: '  topics',
    grid: topicGrid(orgMemTopicCounts(notes), w),
    keys: keys.map(k => fitText(k, w)),
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
export type BranchFacts = { into: string; commits: BranchCommit[]; tasks: Record<string, BranchFigures>; at: number }

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
export type LiveBranches = { head: LiveSeg[]; main: LiveSeg[]; name: string; commits: BranchCommit[]; step: number; indent: number; right: string; rows: BranchRow[] }

/** "just now", "2 min ago", "3 h ago", "4 d ago". */
export function agoText(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}

/** Cuts segments to `width` columns, the one that crosses the edge ending in "…". */
function fitSegs(xs: readonly LiveSeg[], width: number): LiveSeg[] {
  const out: LiveSeg[] = []
  let used = 0
  for (const x of xs) {
    const w = textWidth(x.text)
    if (used + w <= width) {
      out.push(x)
      used += w
      continue
    }
    const room = width - used
    if (room > 0) out.push({ text: cutTitle(x.text, room), tone: x.tone })
    break
  }
  return out
}

type BranchItem = { id: string; kind: 'branch' | 'merged' | 'new'; fig?: BranchFigures; merged?: string; atMs?: number }

/** The tasks the section shows, in the order they are kept when there are too many: the open tasks with a branch git
 *  answered for (by id), then (T-794) the tasks ▍Tasks keeps as finished lanes (liveFinishedLanes: merged in the last
 *  LIVE_FINISHED_MS, at most LIVE_FINISHED_MAX, newest first), then up to BRANCH_NEW_MAX next-up tasks with no branch yet. */
function branchItems(view: LiveView, facts: BranchFacts, nowMs: number): BranchItem[] {
  const open: BranchItem[] = []
  for (const t of view.tasks) {
    if (t.status === 'done') continue
    const fig = facts.tasks[t.id]
    if (BRANCH_STATUSES.includes(t.status) && t.branch && fig) open.push({ id: t.id, kind: 'branch', fig })
  }
  const merged = liveFinishedLanes(view, nowMs).map((l): BranchItem => {
    const sha = view.tasks.find(t => t.id === l.id)?.merged
    return { id: l.id, kind: 'merged', ...(sha ? { merged: sha } : {}), atMs: l.done?.atMs ?? nowMs }
  })
  const next = liveTrains(view, nowMs)
    .next.filter(x => !x.stuck.length && !(view.tasks.find(t => t.id === x.id)?.branch))
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
  return [
    [id, { text: `  +${ahead} commit${ahead === 1 ? '' : 's'}`, tone: 'text' }, { text: ' · ', tone: 'dim' }, { text: `${behind} behind`, tone: late }],
    [id, { text: `  +${ahead}`, tone: 'text' }, { text: ' · ', tone: 'dim' }, { text: `${behind} behind`, tone: late }],
    [id, { text: ` +${ahead}`, tone: 'text' }, { text: ` ↓${behind}`, tone: late }],
  ]
}
const LABEL_ROOM = textWidth(' T-000  +0 · 0 behind')

/**
 * The Branches section (see above) for the view's branch figures in `width` columns, or null when there are none
 * (git isn't ready, or not read yet). The main line shows up to BRANCH_COMMITS of the newest commits, fewer and closer
 * when narrow, so each row keeps room for its words; a row hangs from the commit its branch forked from (a just-merged
 * task from its merge commit, else the newest), or from the leftmost commit when that one isn't shown (and a task not
 * started). Rows are ordered so their lines never cross; past BRANCH_ROWS_MAX rows, "+N more". The heading is in
 * `width`, the lines under it in liveInner(width) (words are cut with "…"), for the client to indent (LIVE_INDENT).
 */
export function liveBranches(view: LiveView, nowMs: number, width: number): LiveBranches | null {
  const facts = view.branches
  if (!facts || !facts.commits.length) return null
  const full = Math.max(1, Math.floor(width))
  const w = liveInner(full)
  const items = branchItems(view, facts, nowMs)
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
  const main = fitSegs([{ text: ` ${padWidth(name, indent - 1)}`, tone: 'title' }, ...track, ...(right ? [{ text: right, tone: 'dim' as const }] : [])], w)
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
