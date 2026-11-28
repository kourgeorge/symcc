// /<name>-stats and the lead's stats tool: time and token figures built only from what the board
// already keeps (tasks, their tries in runs[], their timeline), plus the archived tasks.
// Every function here is pure; the plugin reads board.json and archive.json and passes the tasks in. The text report
// is in ./stats-text, the scouts.json usage format in ./scout-usage.
import type { SymccTimelineEntry, SymccRun, SymccStatus, SymccTask, SymccTokens } from '../../types'
import { type FailReason, onPurposeStop } from './timeline'
import { DEFAULT_NAME } from '../name'
import { INVESTIGATION, isErrand, isInvestigation, kindOf, STATUS_WORD } from './board-file'
import { dayLabel, dayOf } from './days'
import { ORIGIN_MARK } from './origin'
import { plural } from './text'
// hooks/claude/stats-lines.ts still reads these two from here.
export { cutTitle, textWidth } from './width'
import { gapsOf, billedTokens, fmtDuration, fmtTokens, isAnsweredRun, PRICE_WEIGHT, runMs, sumTokens, tokenCount, tryTokens } from './runs'
import { scoutTotals, type ScoutUsage, type ScoutUsageFigures } from './scout-usage'

// ---------------- the range ----------------

/** Which tasks the report covers: all, those changed in the last `days` days, or ids from..to. */
export type StatsRange = { kind: 'all' } | { kind: 'days'; days: number } | { kind: 'ids'; from: number; to: number }

/** The usage line for /<name>-stats. */
export const statsUsage = (name: string = DEFAULT_NAME) => `Use: /${name}-stats, /${name}-stats 7d (the last 7 days) or /${name}-stats T-100..T-130 (an id range); add "full" for every detail, e.g. /${name}-stats full 7d, or "inside" to count only the work inside the days, e.g. /${name}-stats 7d inside`

/** Reads the range words: "" (all), "7d" (last 7 days), "T-100..T-130" (ids). `bad` for anything else. */
export function parseStatsRange(args: string, name: string = DEFAULT_NAME): StatsRange | { kind: 'bad'; message: string } {
  const s = String(args ?? '').trim()
  if (!s || /^all$/i.test(s)) return { kind: 'all' }
  const d = /^(\d+)\s*d(ays?)?$/i.exec(s)
  if (d && Number(d[1]) > 0) return { kind: 'days', days: Number(d[1]) }
  const r = /^t-?(\d+)\s*\.\.\s*(?:t-?)?(\d+)$/i.exec(s)
  if (r) {
    const a = Number(r[1])
    const b = Number(r[2])
    return { kind: 'ids', from: Math.min(a, b), to: Math.max(a, b) }
  }
  return { kind: 'bad', message: statsUsage(name) }
}

/** The range in words: "all tasks", "the last 7 days", "T-100..T-130". */
export function rangeText(r: StatsRange): string {
  if (r.kind === 'days') return `the last ${r.days} ${r.days === 1 ? 'day' : 'days'}`
  if (r.kind === 'ids') return `T-${r.from}..T-${r.to}`
  return 'all tasks'
}

const idNum = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? NaN)

/** Whether task `t` is in range `r` at `nowMs` (days: last changed, else made, within that many days). */
export function inRange(t: Pick<SymccTask, 'id' | 'created_at' | 'updated_at'>, r: StatsRange, nowMs: number): boolean {
  if (r.kind === 'all') return true
  if (r.kind === 'ids') {
    const n = idNum(t.id)
    return Number.isFinite(n) && n >= r.from && n <= r.to
  }
  const at = Date.parse(t.updated_at || t.created_at || '')
  return Number.isFinite(at) && at >= nowMs - r.days * 86_400_000
}

// ---------------- small number helpers ----------------

/** The average, or undefined for no numbers. */
export function mean(xs: number[]): number | undefined {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined
}

/** The middle value (the average of the two middle ones for an even count), or undefined for no numbers. */
export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1]! + s[m]!) / 2
}

// ---------------- one task ----------------

/**
 * One task's figures: worker time (ms), tokens (each kind apart, when any try reports them) and
 * `tok`, the same added up into one count ("in all"), tries, and whether it has try data at all.
 */
export type TaskFigures = { ms: number; tokens?: SymccTokens; tok?: number; tries: number; hasData: boolean }

export function taskFigures(t: Pick<SymccTask, 'runs'>, nowMs?: number): TaskFigures {
  const runs = t.runs ?? []
  const tok = runs.map(tryTokens).filter((x): x is SymccTokens => x !== undefined)
  const tokens = tok.length ? sumTokens(tok) : undefined
  return { ms: runs.reduce((s, r) => s + runMs(r, nowMs), 0), tries: runs.length, hasData: runs.length > 0, ...(tokens ? { tokens, tok: tokenCount(tokens) } : {}) }
}

/** Why a try failed or was sent back: the `reason` a timeline line records (T-806). */
export type { FailReason }

/** The label of each reason in "Failed tries by reason", in the order they are shown. */
export const FAIL_LABEL: Record<FailReason, string> = { tests: 'tests failed', checker: 'sent back by checker', clash: 'clash with main', scope: 'files out of scope', timeout: 'ran out of time', noresult: 'no result', nochange: 'no change', notmerged: 'not merged', other: 'other', changed: 'restarted by a change', stopped: 'stopped', rejected: 'rejected by you' }

/** Reasons with fewer tries than this are folded into "other" in the list of why tries were sent back. */
export const FOLD_BELOW = 3

/** The "Why tries were sent back" rows from the counts `reasons`: biggest count first, small ones folded into "other" (named in `folded`), none for a count of 0. */
export function failedRows(reasons: Record<FailReason, number>): { key: FailReason; label: string; n: number; folded?: string }[] {
  const keys = (Object.keys(FAIL_LABEL) as FailReason[]).filter(k => k !== 'other')
  const rows = keys.filter(k => reasons[k] >= FOLD_BELOW).map(key => ({ key, label: FAIL_LABEL[key], n: reasons[key] })).sort((a, b) => b.n - a.n)
  const small = keys.filter(k => reasons[k] > 0 && reasons[k] < FOLD_BELOW).sort((a, b) => reasons[b] - reasons[a])
  const other = reasons.other + small.reduce((sum, k) => sum + reasons[k], 0)
  return other ? [...rows, { key: 'other', label: FAIL_LABEL.other, n: other, ...(small.length ? { folded: small.map(k => `${FAIL_LABEL[k]} ${reasons[k]}`).join(', ') } : {}) }] : rows
}

/**
 * How a done task ended: merged on its own, approved by the owner, merged outside the board (by hand, then
 * marked done), "answered" for an investigation (nothing is merged), or null when its timeline doesn't say.
 */
export function mergedHow(t: Pick<SymccTask, 'timeline'> & { kind?: unknown }): 'own' | 'approved' | 'answered' | 'errand' | 'outside' | null {
  if (isErrand(t as { kind?: unknown })) return 'errand'
  if (kindOf(t as { kind?: unknown }) === INVESTIGATION) return 'answered'
  // T-514: merged by hand, then marked done on the board
  if (t.timeline.some(l => l.how === 'outside')) return 'outside'
  const merged = t.timeline.filter(l => l.how === 'own' || l.how === 'approved')
  if (!merged.length) return null
  return merged.some(l => l.how === 'approved') ? 'approved' : 'own'
}

/** Who a task came from, as one word: "owner", "scout bugs", "worker", "lead", or "unknown" (no usable origin). */
export function originKey(t: Pick<SymccTask, 'origin'>): string {
  const o = t.origin
  if (!o?.by) return 'unknown'
  return o.by === 'scout' && o.scout ? `scout ${o.scout}` : o.by
}

/**
 * Whether investigation `t` has been answered: read by the owner (done), waiting to be read
 * (review), or a try of it handed back an answer.
 */
export const isAnsweredInvestigation = (t: Pick<SymccTask, 'status' | 'runs'> & { kind?: unknown }): boolean =>
  kindOf(t as { kind?: unknown }) === INVESTIGATION && (t.status === 'done' || t.status === 'review' || (t.runs ?? []).some(isAnsweredRun))

// ---------------- time per stage (T-719) ----------------

/**
 * The stages a task's life is cut into, read from its tries and its timed timeline: waiting to start (to do, free),
 * waiting on other tasks (to do, an `after` task not done yet), in the backlog, work (worker tries), prep, check
 * (the checker), the merge queue, tests, merge, and waiting for you (a question, or ready for review).
 */
export type Stage = 'free' | 'blocked' | 'backlog' | 'work' | 'prep' | 'check' | 'queue' | 'tests' | 'merge' | 'owner'
export const STAGES: readonly Stage[] = ['free', 'blocked', 'backlog', 'work', 'prep', 'check', 'queue', 'tests', 'merge', 'owner']
/** The stages that are work being done (by a worker, a checker or symcc's own checks); the rest is waiting. */
export const ACTIVE_STAGES: readonly Stage[] = ['work', 'prep', 'check', 'tests', 'merge']
export const STAGE_LABEL: Record<Stage, string> = { free: 'waiting to start', blocked: 'waiting on tasks', backlog: 'in the backlog', work: 'work', prep: 'prep', check: 'check', queue: 'merge queue', tests: 'tests', merge: 'merge', owner: 'waiting for you' }

/** One task's time in each stage (ms) and its lifetime (made to done; both cut to the window when one is given). */
export type TaskStages = { ms: Record<Stage, number>; lifetime: number }

const zeroStages = (): Record<Stage, number> => ({ free: 0, blocked: 0, backlog: 0, work: 0, prep: 0, check: 0, queue: 0, tests: 0, merge: 0, owner: 0 })

/** When task `t` was done: its last "merged" or "done" timeline entry, else (done) its last change; undefined when not done. */
export function doneAtMs(t: Pick<SymccTask, 'status' | 'timeline' | 'updated_at'>): number | undefined {
  if (t.status !== 'done') return undefined
  const end = [...t.timeline].reverse().find(e => e.kind === 'merged' || e.kind === 'done')
  const ms = Date.parse(end?.at ?? t.updated_at ?? '')
  return Number.isFinite(ms) ? ms : undefined
}

/** The stage a timeline entry moves a task into: a stage, 'end' (merged or done), or null (it changes nothing). */
const STEP_STAGE: Partial<Record<string, Stage>> = { prep: 'prep', checker: 'check', queue: 'queue', tests: 'tests', merge: 'merge' }
function entryStage(e: SymccTimelineEntry): Stage | 'end' | null {
  if (e.kind === 'stage') return (e.step && STEP_STAGE[e.step]) || null
  switch (e.kind) {
    case 'merged':
    case 'done':
      return 'end'
    case 'asked':
    case 'answered':
    case 'try-result':
      return 'owner'
    case 'moved-backlog':
      return e.backlog ? 'backlog' : 'free'
    case 'not-merged':
    case 'stopped':
      // the lead's question, the branch-gone question and a pause that waits for the owner's answer ('owner' is set on
      // those lines when they are written) wait for the owner, until it is resumed
      return e.owner ? 'owner' : 'free'
    case 'answer':
    case 'resumed':
    case 'run-now':
    case 'retried':
    case 'checker-problems':
    case 'failed':
    case 'out-of-time':
    case 'restarted':
    case 'rejected':
    case 'approve-failed':
      return 'free'
    default:
      return null
  }
}

/**
 * Task `t`'s time per stage (see Stage), from its tries' start and end and the timeline lines between them, cut to
 * `clip` when given. Null when it can't be read reliably: not a done task, a timeline entry with no time (older boards),
 * no finished try, or no stage line (boards from before the stage lines). `doneAt` gives when another task was done,
 * so to-do time before its `after` tasks were done counts as waiting on them.
 */
export function taskStages(t: SymccTask, doneAt: (id: string) => number | undefined, clip?: { from?: number; to?: number }): TaskStages | null {
  const made = Date.parse(t.created_at || '')
  const end = doneAtMs(t)
  const runs = (t.runs ?? []).filter(r => Number.isFinite(Date.parse(r.started)) && Number.isFinite(Date.parse(r.ended ?? '')))
  if (!Number.isFinite(made) || end === undefined || end < made || !runs.length) return null
  if (t.timeline.some(e => !Number.isFinite(Date.parse(e.at ?? '')))) return null
  if (!t.timeline.some(e => e.kind === 'stage')) return null
  // the points where the stage may change, in time order: a try's end, then timeline lines, then a try's start
  type Point = { ms: number; prio: number; run?: 'start' | 'end'; idle?: 'from' | 'to'; to?: Stage | 'end' | null }
  // T-863: a try that went on after a restart symcc did itself has idle stretches (no session was open): there nothing
  // runs, so the time is waiting, never work
  const idle = runs.flatMap(r => gapsOf(r).filter(g => g.from >= Date.parse(r.started) && g.to <= Date.parse(r.ended!)))
  // steps that ran before such a stretch began (prep, queue, tests before Claude Code closed) count under their own name
  const early = runs.flatMap(r => gapsOf(r).map(g => ({ s: Date.parse(r.started), from: g.from })))
  const points: Point[] = [
    ...runs.flatMap(r => [{ ms: Date.parse(r.started), prio: 2, run: 'start' as const }, { ms: Date.parse(r.ended!), prio: 0, run: 'end' as const }]),
    ...idle.flatMap(g => [{ ms: g.from, prio: 0, idle: 'from' as const }, { ms: g.to, prio: 0, idle: 'to' as const }]),
    ...t.timeline.map(e => ({ ms: Date.parse(e.at!), prio: 1, to: entryStage(e) })),
  ].sort((a, b) => a.ms - b.ms || a.prio - b.prio)
  const depsDone = Math.max(made, ...(t.after ?? []).map(id => doneAt(id) ?? made))
  const ms = zeroStages()
  const lo = Math.max(made, clip?.from ?? -Infinity)
  const hi = Math.min(end, clip?.to ?? Infinity)
  const add = (s: Stage, a: number, b: number) => {
    const x = Math.max(a, lo)
    const y = Math.min(b, hi)
    if (y > x) ms[s] += y - x
  }
  // a task made straight into the backlog has no "moved to the backlog" line: its first backlog line is the move out
  const firstBacklog = t.timeline.find(e => e.kind === 'moved-backlog')
  let cur: Stage = firstBacklog && !firstBacklog.backlog ? 'backlog' : 'free'
  let since = made
  let inRun = false
  let pending: Stage | null = null
  const close = (at: number) => {
    const b = Math.min(at, end)
    if (cur === 'free' && depsDone > since) {
      add('blocked', since, Math.min(b, depsDone))
      add('free', Math.max(since, depsDone), b)
    } else add(cur, since, b)
    since = Math.max(since, b)
  }
  let idleNow = false
  for (const p of points) {
    if (p.ms >= end) break
    if (p.idle === 'from') {
      if (!inRun) continue
      close(p.ms)
      cur = 'free'
      idleNow = true
    } else if (p.idle === 'to') {
      if (!idleNow) continue
      close(p.ms)
      cur = 'work'
      idleNow = false
    } else if (idleNow) {
      // timeline lines inside an idle stretch change nothing; the try's end after it does
      if (p.run === 'end') {
        close(p.ms)
        cur = pending ?? 'free'
        inRun = false
        pending = null
        idleNow = false
      }
    } else if (p.run === 'start') {
      close(p.ms)
      cur = 'work'
      inRun = true
      pending = null
    } else if (p.run === 'end') {
      if (!inRun) continue
      close(p.ms)
      cur = pending ?? 'free'
      inRun = false
      pending = null
    } else if (p.to && p.to !== 'end') {
      if (inRun && !early.some(e => p.ms >= e.s && p.ms < e.from)) pending = p.to
      else {
        close(p.ms)
        cur = p.to
      }
    }
  }
  close(end)
  return { ms, lifetime: Math.max(0, hi - lo) }
}

/** The stage figures of a set of done tasks: per stage the sum and the average per task, active and waiting, lifetime. */
export type StageFigures = { n: number; lacking: number; stages: { stage: Stage; label: string; ms: number; avgMs: number }[]; active: number; waiting: number; lifetime: number; avgLifetime: number }

/** The stage figures of `tasks` (done change tasks), each cut to `clip` when given; tasks with no time in it are left out. */
export function stageFigures(tasks: SymccTask[], doneAt: (id: string) => number | undefined, clip?: { from?: number; to?: number }): StageFigures {
  const read = tasks.map(t => taskStages(t, doneAt, clip))
  const ok = read.filter((s): s is TaskStages => s !== null && s.lifetime > 0)
  const lacking = read.filter(s => s === null).length
  const n = ok.length
  const sum = (s: Stage) => ok.reduce((a, x) => a + x.ms[s], 0)
  const stages = STAGES.map(s => ({ stage: s, label: STAGE_LABEL[s], ms: sum(s), avgMs: n ? sum(s) / n : 0 }))
  const active = stages.filter(s => ACTIVE_STAGES.includes(s.stage)).reduce((a, s) => a + s.ms, 0)
  const lifetime = ok.reduce((a, x) => a + x.lifetime, 0)
  return { n, lacking, stages, active, waiting: lifetime - active, lifetime, avgLifetime: n ? lifetime / n : 0 }
}

/** Task `t` with only the part of its tries inside the window from `fromMs` on: tries that ended before it left out, the rest started no earlier than it. */
export function clipRuns<T extends Pick<SymccTask, 'runs'>>(t: T, fromMs: number): T {
  if (!t.runs) return t
  const runs = t.runs
    .filter(r => !r.ended || !(Date.parse(r.ended) < fromMs))
    .map(r => (Date.parse(r.started) < fromMs ? { ...r, started: new Date(fromMs).toISOString() } : r))
  return { ...t, runs }
}

// ---------------- the report ----------------

export type StatsInput = {
  /** the tasks on the board */
  tasks: SymccTask[]
  /** the tasks in archive.json */
  archived?: SymccTask[]
  /** why archived tasks are missing (archive.json can't be read), said in the report */
  archiveProblem?: string
  range?: StatsRange
  nowMs: number
  /** the owner's time zone, minutes east of UTC */
  offsetMin?: number
  name?: string
  /** the lead's and scouts' usage for the "Whole team" part; left out, that part is not shown */
  team?: TeamInput
  /** T-719: count only the work inside the window (tries and stages cut to it); only a day range has one */
  inside?: boolean
  /** T-719: each scout's runs (from its runs file), for the "not linked to a run" line; a scout left out gets no line */
  scoutRuns?: Record<string, { ended?: string; tasks?: string[] }[]>
}

/** How the report counts: whole tries of the tasks in the range, or only the work inside the window. */
export type StatsCounting = 'whole' | 'inside'

/**
 * The "Counting:" line: which way the report counted (T-719); null when there is no window to count inside (all tasks
 * or an id range) and "inside" was not asked for.
 */
export function countingText(r: StatsRange, counting: StatsCounting, asked: boolean, name: string = DEFAULT_NAME): string | null {
  if (counting === 'inside') return `Counting: only the work inside ${rangeText(r)} (tries and stages cut to it; the tokens of tries that ended in it)`
  if (asked) return `Counting: whole tries ("inside" needs a day range, e.g. /${name}-stats 7d inside)`
  if (r.kind === 'days') return `Counting: whole tries of tasks changed in ${rangeText(r)} (or add "inside")`
  return null
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const avgDur = (xs: number[]) => (xs.length ? fmtDuration(mean(xs)!) : '-')
const avgTok = (xs: number[]) => (xs.length ? fmtTokens(mean(xs)!) : '-')

/** The widest a bar may be, in blocks. */
export const BAR_WIDTH = 16

/**
 * A plain bar for `value` out of `max` (the biggest value of its section), at most `width` blocks:
 * whole blocks ▇, the last one a third (▂) or two thirds (▅) when it falls between; any value
 * above 0 shows at least ▂, and 0 shows nothing.
 */
export function bar(value: number, max: number, width = BAR_WIDTH): string {
  if (!(value > 0) || !(max > 0)) return ''
  const thirds = Math.max(1, Math.round((Math.min(value, max) / max) * width * 3))
  const r = thirds % 3
  return '▇'.repeat(Math.floor(thirds / 3)) + (r === 1 ? '▂' : r === 2 ? '▅' : '')
}


/** How the billed-equivalent figure is made, said next to it in the full view. */
export const BILLED_NOTE = `an estimate: each kind weighed by its usual price compared with input (input ${PRICE_WEIGHT.input}, cache write ${PRICE_WEIGHT.cache_write}, cache read ${PRICE_WEIGHT.cache_read}, output ${PRICE_WEIGHT.output})`

/** The short footnote for "billed" in the summary view. */
export const BILLED_FOOTNOTE = `* billed (an estimate): input ×${PRICE_WEIGHT.input}, output ×${PRICE_WEIGHT.output}, cache write ×${PRICE_WEIGHT.cache_write}, cache read ×${PRICE_WEIGHT.cache_read}`

/** The billed-equivalent figure in words: "150k (an estimate: ...)", plus the unsplit tokens it leaves out. */
export function billedText(t: SymccTokens | undefined): string {
  const un = t?.unsplit ?? 0
  return `${fmtTokens(billedTokens(t))} (${BILLED_NOTE}${un ? `; leaves out ${fmtTokens(un)} unsplit tokens, saved before the kinds were kept apart` : ''})`
}

/** Tokens in plain words: "292M in all, about 35M billed*", plus the unsplit tokens the billed figure leaves out. */
export function tokensText(t: SymccTokens | undefined): string {
  const un = t?.unsplit ?? 0
  return `${fmtTokens(tokenCount(t))} in all, about ${fmtTokens(billedTokens(t))} billed*${un ? ` (leaves out ${fmtTokens(un)} unsplit)` : ''}`
}


const STATUS_ORDER: SymccStatus[] = ['done', 'dropped', 'doing', 'todo', 'review', 'waiting', 'paused', 'failed', 'backlog']

/**
 * Reads the /<name>-stats words: "full" anywhere asks for the full view, "html" for the HTML report (T-674), "inside"
 * for only the work inside the window (T-719); the rest is the range.
 */
export function parseStatsArgs(args: string): { full: boolean; html: boolean; inside: boolean; range: string } {
  const words = String(args ?? '').trim().split(/\s+/).filter(Boolean)
  const full = words.some(w => /^full$/i.test(w))
  const html = words.some(w => /^html$/i.test(w))
  const inside = words.some(w => /^inside$/i.test(w))
  return { full, html, inside, range: words.filter(w => !/^(full|html|inside)$/i.test(w)).join(' ') }
}

/**
 * A group of tasks (a role, an origin): how many, and their average and total tokens ("in all") and time (undefined
 * when none of them has any).
 */
export type StatsGroup = { key: string; label: string; n: number; avgTok?: number; avgMs?: number; sumTok?: number; sumMs?: number }
/**
 * One scout under "Where tasks came from": its group, its results, `idle` for a scout that used tokens but made no task
 * here, and `unlinked`: its tasks here that its runs file doesn't list (only tasks made since its oldest kept run; left
 * out when its runs are not known).
 */
export type StatsScout = StatsGroup & { results: ScoutResults; idle?: boolean; unlinked?: number }

/**
 * How many of scout tasks `mine` none of `runs` lists (T-719). Only tasks made since the oldest kept run that lists its
 * tasks (or, when none does, the oldest kept run) count, as older runs are no longer kept; undefined with no runs.
 */
export function unlinkedCount(mine: Pick<SymccTask, 'id' | 'created_at'>[], runs: { ended?: string; tasks?: string[] }[]): number | undefined {
  if (!runs.length) return undefined
  const linked = new Set(runs.flatMap(r => r.tasks ?? []))
  const since = Date.parse((runs.find(r => r.tasks) ?? runs[0]!).ended ?? '')
  return mine.filter(t => !linked.has(t.id) && !(Number.isFinite(since) && Date.parse(t.created_at || '') < since)).length
}
/** One row of "Most tokens" / "Most time". */
export type StatsTop = { id: string; title: string; value: number }
/** One day of "Done per day": tasks done, work time and tokens of the tries started that day. */
/** T-721: one failed try: its task, try number, how it ended, and (when its tests failed) the command and first failing test. */
export type StatsFailedTry = { id: string; title: string; try: number; reason: string; ended?: string; command?: string; test?: string }
/** T-721: a test that failed: on how many failed tries, and of how many different tasks. */
export type StatsFailedTest = { name: string; tries: number; tasks: number }

/** T-721: whether try `r` did not fail: not ended yet, restarted, asking, merged, ready for review, passed but waiting for the owner's files, or an investigation's answer; T-735: also a try stopped on purpose (onPurposeStop). */
const okEnd = (r: SymccRun) => !r.ended_by || r.ended_by === 'restarted' || r.ended_by === 'asked' || isAnsweredRun(r) || /^(merged|ready for review|waiting for your files)\b/.test(r.ended_note ?? '') || (r.ended_by === 'stopped' && onPurposeStop(r.ended_note))

/**
 * T-721: the failed tries of `tasks` (oldest end first) and the tests that failed in them, the ones that failed most different tasks first.
 * Tries that ended before `fromMs` (the "inside" window) are left out; the try number is still the task's own (pass the tasks before clipRuns).
 */
export function failedTryFigures(tasks: Pick<SymccTask, 'id' | 'title' | 'runs'>[], fromMs = -Infinity): { tries: StatsFailedTry[]; tests: StatsFailedTest[] } {
  const tries: StatsFailedTry[] = []
  const tests = new Map<string, { tries: number; tasks: Set<string> }>()
  for (const t of tasks)
    (t.runs ?? []).forEach((r, i) => {
      if (!r || okEnd(r) || (r.ended && Date.parse(r.ended) < fromMs)) return
      const names = Array.isArray(r.failed_tests) ? r.failed_tests.filter(n => typeof n === 'string' && n) : []
      tries.push({ id: t.id, title: t.title, try: i + 1, reason: r.ended_note || r.ended_by!, ...(r.ended ? { ended: r.ended } : {}), ...(r.failed_command ? { command: r.failed_command } : {}), ...(names[0] ? { test: names[0] } : {}) })
      for (const n of new Set(names)) {
        const e = tests.get(n) ?? (tests.set(n, { tries: 0, tasks: new Set() }), tests.get(n)!)
        e.tries++
        e.tasks.add(t.id)
      }
    })
  tries.sort((a, b) => (a.ended ?? '').localeCompare(b.ended ?? '') || a.id.localeCompare(b.id) || a.try - b.try)
  const ranked = [...tests.entries()].map(([name, e]) => ({ name, tries: e.tries, tasks: e.tasks.size })).sort((a, b) => b.tasks - a.tasks || b.tries - a.tries || a.name.localeCompare(b.name))
  return { tries, tests: ranked }
}

export type StatsDay = { day: string; label: string; done: number; ms: number; tokens: number }

/**
 * Every figure of /<name>-stats, worked out once (T-674): the text report (statsReport) and the HTML report
 * (statsHtml, core/stats-html.ts) both only lay these out, so they can't disagree.
 */
export type StatsData = {
  name: string
  full: boolean
  range: StatsRange
  /** T-719: how it counted (whole tries, or only the work inside the window), and whether "inside" was asked for */
  counting: StatsCounting
  insideAsked: boolean
  /** tasks in the range, and how many of them come from archive.json */
  total: number
  archivedIn: number
  archiveProblem?: string
  /** tasks with try data, and those without (left out of averages) */
  withData: number
  noData: number
  /** done change tasks (investigations left out), investigations and how many are answered */
  done: number
  invCount: number
  /** errands that ended done (they are not investigations and not change tasks) */
  errandsDone: number
  answered: number
  /** worker time and tokens of every task with data; tokKnown: how many of them report tokens */
  workMs: number
  tokens: SymccTokens
  tokKnown: number
  /** done change tasks with data, and how many of them took one try */
  doneWithData: number
  first: number
  states: { status: SymccStatus; label: string; n: number }[]
  inv: { readByOwner: number; waiting: number; withData: number; ms: number; avgMs?: number; tokKnown: number; tokens: SymccTokens; avgTok?: number; tries: number; avgTries?: number }
  /** the "Whole team" part, when team input was given */
  team?: { label: string; data: TeamData }
  perDone: { avgMs?: number; medianMs?: number; avgTok?: number; medianTok?: number; avgTries?: number; sumMs?: number; sumTok?: number }
  /** T-845: the spread of time and of tokens over the done tasks (the same ones the averages use) */
  spreadTime: Spread
  spreadTok: Spread
  leadTime: { n: number; avgMs?: number; medianMs?: number; sumMs?: number }
  perTry: { n: number; avgMs?: number; avgTok?: number; sumMs?: number; sumTok?: number }
  /** T-719: the done change tasks' time per stage (see stageFigures) */
  stages: StageFigures
  topTokens: StatsTop[]
  topTime: StatsTop[]
  /** done tasks (investigations too) and how they ended */
  finished: number
  ended: { label: string; n: number }[]
  /** the reasons, biggest count first; those with fewer than FOLD_BELOW tries are folded into the last row, "other" (`folded` names them) */
  failed: { key: FailReason; label: string; n: number; folded?: string }[]
  failedTotal: number
  /** T-721: every failed try in the range (oldest first), and the tests that failed most (most tasks first) */
  failedTries: StatsFailedTry[]
  failedTests: StatsFailedTest[]
  roles: StatsGroup[]
  origins: (StatsGroup & { scouts?: StatsScout[] })[]
  /** today's day ("YYYY-MM-DD" in the owner's time zone) and the last 7 days with activity, oldest first */
  today: string
  days: StatsDay[]
}

/** The origin groups' labels in the report. */
export const ORIGIN_LABEL: Record<string, string> = { lead: `${ORIGIN_MARK.lead} lead`, owner: `${ORIGIN_MARK.owner} you`, worker: `${ORIGIN_MARK.worker} workers`, scout: `${ORIGIN_MARK.scout} all scouts`, unknown: '? unknown' }

/** Every figure of the report for `input` (see StatsData). */
export function statsData(input: StatsInput & { full?: boolean }): StatsData {
  const { nowMs } = input
  const off = input.offsetMin ?? 0
  const range = input.range ?? { kind: 'all' }
  const onBoard = new Set(input.tasks.map(t => t.id))
  const old = (input.archived ?? []).filter(t => !onBoard.has(t.id))
  const everyTask = [...input.tasks, ...old]
  const whole = everyTask.filter(t => inRange(t, range, nowMs))
  // T-719: "inside" (a day range only): every try cut to the window, so only the work inside it counts
  const counting: StatsCounting = input.inside && range.kind === 'days' ? 'inside' : 'whole'
  const winFrom = range.kind === 'days' ? nowMs - range.days * 86_400_000 : -Infinity
  const all = counting === 'inside' ? whole.map(t => clipRuns(t, winFrom)) : whole
  const fig = new Map(all.map(t => [t.id, taskFigures(t, nowMs)]))
  const F = (t: SymccTask) => fig.get(t.id)!
  const withData = all.filter(t => F(t).hasData)
  const tokKnown = withData.filter(t => F(t).tokens !== undefined)
  const totalTok = sumTokens(tokKnown.map(t => F(t).tokens))
  // Investigations hand back an answer and merge nothing: they are counted on their own, not in the
  // done, first-try and merge figures (those are for change tasks).
  const isInv = (t: SymccTask) => kindOf(t as { kind?: unknown }) === INVESTIGATION
  const notChange = (t: SymccTask) => isInvestigation(t as { kind?: unknown })
  const inv = all.filter(isInv)
  const answered = inv.filter(isAnsweredInvestigation)
  const finished = all.filter(t => t.status === 'done')
  const doneAll = finished.filter(t => !notChange(t))
  const done = withData.filter(t => t.status === 'done' && !notChange(t))
  const first = done.filter(t => F(t).tries === 1).length
  const span = rangeSpan(range, all, nowMs)

  const invData = inv.filter(t => F(t).hasData)
  const invTokKnown = invData.filter(t => F(t).tokens !== undefined)

  const doneMs = done.map(t => F(t).ms)
  const doneTok = done.filter(t => F(t).tok !== undefined).map(t => F(t).tok!)
  const runs = withData.flatMap(t => t.runs ?? [])
  const lead = doneAll.map(t => Date.parse(t.updated_at) - Date.parse(t.created_at)).filter(ms => Number.isFinite(ms) && ms >= 0)

  const top = (pick: (t: SymccTask) => number | undefined): StatsTop[] =>
    done.filter(t => pick(t) !== undefined).sort((a, b) => pick(b)! - pick(a)! || a.id.localeCompare(b.id)).slice(0, 5).map(t => ({ id: t.id, title: t.title, value: pick(t)! }))

  const how = finished.map(mergedHow)
  const own = how.filter(h => h === 'own').length
  const approved = how.filter(h => h === 'approved').length
  const answeredDone = how.filter(h => h === 'answered').length
  const errandsDone = how.filter(h => h === 'errand').length
  const outside = how.filter(h => h === 'outside').length
  const unclear = finished.length - own - approved - answeredDone - errandsDone - outside
  const reasons = Object.fromEntries(Object.keys(FAIL_LABEL).map(k => [k, 0])) as Record<FailReason, number>
  for (const t of all) for (const l of t.timeline) {
    if (l.reason && l.reason in reasons) reasons[l.reason]++
  }
  const ended = [{ label: 'merged on its own', n: own }, { label: 'approved by you', n: approved }, ...(outside ? [{ label: 'merged outside the board', n: outside }] : []), ...(answeredDone ? [{ label: 'answered (investigation)', n: answeredDone }] : []), ...(errandsDone ? [{ label: 'errand done', n: errandsDone }] : []), ...(unclear ? [{ label: 'not clear from timeline', n: unclear }] : [])]
  const failed = failedRows(reasons)

  const group = (key: string, label: string, ts: SymccTask[]): StatsGroup => {
    const d = ts.filter(t => F(t).hasData)
    const avgTok = mean(d.filter(t => F(t).tok !== undefined).map(t => F(t).tok!))
    const toks = d.filter(t => F(t).tok !== undefined).map(t => F(t).tok!)
    const avgMs = mean(d.map(t => F(t).ms))
    return { key, label, n: ts.length, ...(avgTok === undefined ? {} : { avgTok, sumTok: toks.reduce((s, x) => s + x, 0) }), ...(avgMs === undefined ? {} : { avgMs, sumMs: d.reduce((s, t) => s + F(t).ms, 0) }) }
  }
  const sorted = (m: Map<string, SymccTask[]>) => [...m.entries()].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
  const groupBy = (ts: SymccTask[], key: (t: SymccTask) => string) => {
    const m = new Map<string, SymccTask[]>()
    for (const t of ts) m.set(key(t), [...(m.get(key(t)) ?? []), t])
    return m
  }
  const roles = sorted(groupBy(all, t => t.role || 'general')).map(([k, ts]) => group(k, k, ts))
  const byOrigin = groupBy(all, t => (originKey(t).startsWith('scout') ? 'scout' : originKey(t)))
  const origins = sorted(byOrigin)
  const scoutGroups = sorted(groupBy(byOrigin.get('scout') ?? [], t => originKey(t).replace(/^scout ?/, '') || 'scout'))
  // T-622: each scout's results (merged / dropped / open, its own tokens in the range, tokens per merged task);
  // scouts that used tokens in the range but made no task here are listed too
  const usage = input.team?.scouts ?? {}
  const scoutTok = (s: string) => (Object.hasOwn(usage, s) ? tokenCount(scoutTotals({ [s]: usage[s]! }, span).tokens) : 0)
  const idle = Object.keys(usage).filter(s => !scoutGroups.some(([k]) => k === s) && scoutTok(s) > 0).sort()
  if (idle.length && !byOrigin.has('scout')) origins.push(['scout', []])
  const runsOf = input.scoutRuns ?? {}
  const unlinked = (s: string, st: SymccTask[]) => {
    const n = Object.hasOwn(runsOf, s) ? unlinkedCount(st, runsOf[s]!) : undefined
    return n === undefined ? {} : { unlinked: n }
  }
  const scouts: StatsScout[] = [...scoutGroups.map(([s, st]) => ({ ...group(s, s, st), results: countResults(st, scoutTok(s)), ...unlinked(s, st) })), ...idle.map(s => ({ key: s, label: s, n: 0, results: countResults([], scoutTok(s)), idle: true }))]

  const days = new Map<string, { done: number; ms: number; tokens: number }>()
  const at = (d: string) => days.get(d) ?? (days.set(d, { done: 0, ms: 0, tokens: 0 }), days.get(d)!)
  for (const t of finished) {
    const d = dayOf(Date.parse(t.updated_at || ''), off)
    if (d) at(d).done++
  }
  for (const r of runs) {
    const d = dayOf(Date.parse(r.started), off)
    if (!d) continue
    at(d).ms += runMs(r, nowMs)
    at(d).tokens += tokenCount(tryTokens(r))
  }
  const failing = failedTryFigures(whole, counting === 'inside' ? winFrom : -Infinity)
  const doneAt = new Map(everyTask.map(t => [t.id, doneAtMs(t)]))
  const stages = stageFigures(whole.filter(t => t.status === 'done' && !notChange(t)), id => doneAt.get(id), counting === 'inside' ? { from: winFrom, to: nowMs } : undefined)
  const sumOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) : undefined)
  const tryTok = runs.filter(r => tryTokens(r) !== undefined).map(r => tokenCount(tryTokens(r)))
  const today = dayOf(nowMs, off)
  const last = [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7).reverse()

  const opt = <K extends string>(k: K, v: number | undefined) => (v === undefined ? {} : { [k]: v }) as { [P in K]?: number }
  const counts = STATUS_ORDER.map(s => ({ status: s, label: STATUS_WORD[s] ?? s, n: all.filter(t => t.status === s).length })).filter(x => x.n)
  const teamLabel = range.kind === 'all' ? 'all time' : range.kind === 'days' ? rangeText(range) : `${rangeText(range)}; lead and scouts over the time these tasks span`
  return {
    name: input.name ?? DEFAULT_NAME,
    full: input.full === true,
    range,
    counting,
    insideAsked: input.inside === true,
    total: all.length,
    archivedIn: all.filter(t => !onBoard.has(t.id)).length,
    ...(input.archiveProblem ? { archiveProblem: input.archiveProblem } : {}),
    withData: withData.length,
    noData: all.length - withData.length,
    done: doneAll.length,
    invCount: inv.length,
    errandsDone,
    answered: answered.length,
    workMs: withData.reduce((s, t) => s + F(t).ms, 0),
    tokens: totalTok,
    tokKnown: tokKnown.length,
    doneWithData: done.length,
    first,
    states: counts,
    inv: {
      readByOwner: finished.filter(isInv).length,
      waiting: inv.filter(t => t.status === 'review').length,
      withData: invData.length,
      ms: invData.reduce((s, t) => s + F(t).ms, 0),
      ...opt('avgMs', mean(invData.map(t => F(t).ms))),
      tokKnown: invTokKnown.length,
      tokens: sumTokens(invTokKnown.map(t => F(t).tokens)),
      ...opt('avgTok', mean(invTokKnown.map(t => F(t).tok!))),
      tries: invData.reduce((s, t) => s + F(t).tries, 0),
      ...opt('avgTries', mean(invData.map(t => F(t).tries))),
    },
    ...(input.team ? { team: { label: teamLabel, data: teamData(input.team, span, { tokens: totalTok, tries: withData.reduce((s, t) => s + F(t).tries, 0) }, doneAll.length) } } : {}),
    perDone: { ...opt('avgMs', mean(doneMs)), ...opt('medianMs', median(doneMs)), ...opt('avgTok', mean(doneTok)), ...opt('medianTok', median(doneTok)), ...opt('avgTries', mean(done.map(t => F(t).tries))), ...opt('sumMs', sumOf(doneMs)), ...opt('sumTok', sumOf(doneTok)) },
    spreadTime: spreadOf('Time per done task', done.map(t => ({ id: t.id, value: F(t).ms })), fmtDuration, roundTimeEdge, 'very fast', 'slowest'),
    spreadTok: spreadOf('Tokens per done task', done.filter(t => F(t).tok !== undefined).map(t => ({ id: t.id, value: F(t).tok! })), fmtTokens, roundTokEdge, 'very small', 'biggest'),
    leadTime: { n: lead.length, ...opt('avgMs', mean(lead)), ...opt('medianMs', median(lead)), ...opt('sumMs', sumOf(lead)) },
    perTry: { n: runs.length, ...opt('avgMs', mean(runs.map(r => runMs(r, nowMs)))), ...opt('avgTok', mean(tryTok)), ...opt('sumMs', sumOf(runs.map(r => runMs(r, nowMs)))), ...opt('sumTok', sumOf(tryTok)) },
    stages,
    topTokens: top(t => F(t).tok),
    topTime: top(t => F(t).ms),
    finished: finished.length,
    ended,
    failed,
    failedTotal: Object.values(reasons).reduce((s, n) => s + n, 0),
    failedTries: failing.tries,
    failedTests: failing.tests,
    roles,
    origins: origins.map(([k, ts]) => ({ ...group(k, ORIGIN_LABEL[k] ?? k, ts), ...(k === 'scout' ? { scouts } : {}) })),
    today,
    days: last.map(([d, v]) => ({ day: d, label: d === today ? 'Today' : dayLabel(d, today), ...v })),
  }
}

/** T-845: one row of a spread chart: its range, how many tasks fall in it, and a note (the outer rows: "very fast", or the 3 biggest tasks). */
export type SpreadRow = { label: string; n: number; note?: string; top?: { id: string; value: number }[] }
/** A spread chart: 6 rows centered on the median, edges at median ÷4, ÷2, ×1, ×2, ×4. No rows when there are too few tasks. */
export type Spread = { title: string; n: number; median?: number; medianText?: string; rows?: SpreadRow[]; tooFew?: string }
/** The fewest tasks a spread chart is drawn for. */
export const SPREAD_MIN = 10

/** An edge in whole seconds (under a minute) or whole minutes. */
const roundTimeEdge = (ms: number) => (ms < 60_000 ? Math.round(ms / 1000) * 1000 : Math.round(ms / 60_000) * 60_000)
/** An edge to 2 significant figures. */
const roundTokEdge = (n: number) => Number(n.toPrecision(2))

function spreadOf(title: string, items: { id: string; value: number }[], fmt: (n: number) => string, round: (n: number) => number, low: string, high: string): Spread {
  const m = median(items.map(i => i.value))
  if (items.length < SPREAD_MIN || m === undefined || !(m > 0)) return { title, n: items.length, tooFew: `${title}: too few tasks for a chart (${items.length}${m === 0 ? ', median 0' : ''}; it needs ${SPREAD_MIN})` }
  const e = [m / 4, m / 2, m, m * 2, m * 4].map(round)
  const f = e.map(fmt)
  const labels = [`< ${f[0]}`, `${f[0]} – ${f[1]}`, `${f[1]} – ${f[2]}`, `${f[2]} – ${f[3]}`, `${f[3]} – ${f[4]}`, `> ${f[4]}`]
  const buckets: { id: string; value: number }[][] = labels.map(() => [])
  // a value exactly on an edge goes to the upper bucket
  for (const i of items) buckets[e.filter(x => i.value >= x).length]!.push(i)
  const rows: SpreadRow[] = buckets.map((b, i) => ({ label: labels[i]!, n: b.length }))
  rows[0]!.note = low
  const top = [...buckets[5]!].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).slice(0, 3)
  rows[5]!.top = top
  if (top.length) rows[5]!.note = `${high}: ${top.map(t => `${t.id} ${fmt(t.value)}`).join(' · ')}`
  return { title, n: items.length, median: m, medianText: fmt(m), rows }
}

/** A percentage in words: "39%", "-" out of nothing. */
export const pctText = (a: number, b: number) => pct(a, b)
/** An average in words, "-" for none. */
export const durOr = (x: number | undefined) => (x === undefined ? '-' : fmtDuration(x))
export const tokOr = (x: number | undefined) => (x === undefined ? '-' : fmtTokens(x))

/** T-721: the short report lists only the latest this many failed tries, and the top this many failing tests. */
export const FAILED_TRIES_SHORT = 10
export const FAILED_TESTS_SHORT = 5
/** The failed tries and failing tests a report lists: all of them when full, else the latest tries and the top tests. */
export const failedShown = (d: Pick<StatsData, 'full' | 'failedTries' | 'failedTests'>) => ({
  tries: d.full ? d.failedTries : d.failedTries.slice(-FAILED_TRIES_SHORT),
  tests: d.full ? d.failedTests : d.failedTests.slice(0, FAILED_TESTS_SHORT),
})

/** The report's first line: "symcc stats · all tasks (12 tasks, incl. 2 archived)". */
export const statsTitle = (d: StatsData) => `${d.name} stats · ${rangeText(d.range)} (${plural(d.total, 'task')}${d.archivedIn ? `, incl. ${d.archivedIn} archived` : ''})`

/** "2 tasks not linked to a run": a scout's tasks its runs file doesn't list (T-719). */
export const unlinkedText = (n: number) => `${plural(n, 'task')} not linked to a run`

/** How the stage times are read, said in the full view. */
export const STAGES_NOTE = 'read from each done task\'s tries (work) and its timed timeline lines ("prep started", "checker started", "waits in the merge queue", "tests started", "merge started", "merged", questions, answers and results); a task whose timeline has an entry with no time (older boards) or no stage line is left out and counted as lacking data.'

// ---------------- the whole team: scouts and the lead ----------------

/** One API call of the lead, as the host's adapter reads it (for Claude Code, see claude/lead-usage.ts): its message id,
 *  when, its tokens (each kind apart), and where it was read from (shown by /<name>-stats full). */
export type LeadCall = { id: string; atMs: number; tokens: SymccTokens; from?: string }

/** The time span a range covers, in ms ([from, to], either open); for an id range, from the first task made to the last change. */
export function rangeSpan(r: StatsRange, tasks: Pick<SymccTask, 'created_at' | 'updated_at'>[], nowMs: number): { from?: number; to?: number } {
  if (r.kind === 'days') return { from: nowMs - r.days * 86_400_000 }
  if (r.kind === 'all') return {}
  const made = tasks.map(t => Date.parse(t.created_at || '')).filter(Number.isFinite)
  const changed = tasks.map(t => Date.parse(t.updated_at || t.created_at || '')).filter(Number.isFinite)
  if (!made.length) return { from: Infinity }
  return { from: Math.min(...made), to: Math.max(...changed) }
}

// ---------------- a scout's results (T-622) ----------------

/**
 * What one scout's findings became: the tasks whose origin names it, split into merged (done), dropped and open
 * (every other status, backlog too); the scout's own tokens; and the merged tasks' worker tokens.
 */
export type ScoutResults = { tasks: number; merged: number; dropped: number; open: number; scoutTokens: number; mergedTokens: number }

/** Scout `scout`'s results among `tasks` (only those whose origin names it count), with its own `scoutTokens`. */
export function scoutResults(tasks: Pick<SymccTask, 'status' | 'runs' | 'origin'>[], scout: string, scoutTokens: number): ScoutResults {
  return countResults(tasks.filter(t => originKey(t) === `scout ${scout}`), scoutTokens)
}

/** The results of tasks `mine` (already one scout's, e.g. a /symcc-stats group, whose unnamed "scout" group has no name to match). */
export function countResults(mine: Pick<SymccTask, 'status' | 'runs'>[], scoutTokens: number): ScoutResults {
  const merged = mine.filter(t => t.status === 'done')
  const dropped = mine.filter(t => t.status === 'dropped').length
  return { tasks: mine.length, merged: merged.length, dropped, open: mine.length - merged.length - dropped, scoutTokens, mergedTokens: merged.reduce((s, t) => s + (taskFigures(t).tok ?? 0), 0) }
}

/** Tokens per merged task: the scout's tokens plus its merged tasks' tokens, divided by how many merged; null when none merged. */
export const perMergedTokens = (r: ScoutResults): number | null => (r.merged ? (r.scoutTokens + r.mergedTokens) / r.merged : null)

/** The results in words: "3 tasks (1 merged, 1 dropped, 1 open) · 2k scout tokens · 7k per merged" ("—" when none merged). */
export function scoutResultsText(r: ScoutResults): string {
  const per = perMergedTokens(r)
  return `${r.tasks ? `${plural(r.tasks, 'task')} (${r.merged} merged, ${r.dropped} dropped, ${r.open} open)` : 'no tasks'} · ${fmtTokens(r.scoutTokens)} scout tokens · ${per === null ? '—' : fmtTokens(per)} per merged`
}

/**
 * A scout page's "Results" figures, shown under its own "Results" heading just before File (T-686): two lines, the
 * last 7 days (tasks made or changed then, its tokens of those days) and then in all, joined by a newline. `usage` is its entry in scouts.json; `tasks` the board's tasks plus the archived ones.
 */
export function scoutResultsLine(tasks: Pick<SymccTask, 'id' | 'status' | 'runs' | 'origin' | 'created_at' | 'updated_at'>[], scout: string, usage: ScoutUsage | undefined, nowMs: number): string {
  const week: StatsRange = { kind: 'days', days: 7 }
  const tok = (s: { from?: number; to?: number }) => (usage ? tokenCount(scoutTotals({ [scout]: usage }, s).tokens) : 0)
  const w = scoutResults(tasks.filter(t => inRange(t, week, nowMs)), scout, tok(rangeSpan(week, [], nowMs)))
  const a = scoutResults(tasks, scout, tok({}))
  return `last 7 days: ${scoutResultsText(w)}\nin all: ${scoutResultsText(a)}`
}

/** The lead's calls and tokens within span `s`. */
export function leadTotals(calls: LeadCall[], s: { from?: number; to?: number }): { calls: number; tokens: SymccTokens } {
  const inside = calls.filter(c => (s.from === undefined || (Number.isFinite(c.atMs) && c.atMs >= s.from)) && (s.to === undefined || (Number.isFinite(c.atMs) && c.atMs <= s.to)))
  return { calls: inside.length, tokens: sumTokens(inside.map(c => c.tokens)) }
}

/** What the "Whole team" part needs: the lead's calls (or why they can't be read) and where they come from, the scouts' usage, and this session's $ if the host reports it. */
export type TeamInput = { lead?: LeadCall[]; leadSessions?: number; leadProblem?: string; leadFrom?: string; leadUnread?: number; scouts?: Record<string, ScoutUsage>; sessionUsd?: number }

/** What a host's lead usage, the workers and the scouts add up to within a span (see teamData). */
export type TeamData = {
  /** the lead's calls and tokens, or null when they can't be read (`leadProblem` says why) */
  lead: { calls: number; tokens: SymccTokens; sessions?: number; from?: string } | null
  leadProblem?: string
  /** how many of the lead's session logs couldn't be read at all, so the lead's figure is short (T-762) */
  leadUnread?: number
  workers: { tokens: SymccTokens; tries: number }
  scouts: ScoutUsageFigures
  total: SymccTokens
  merged: number
  sessionUsd?: number
}

/** The "Whole team" figures: lead, workers and scouts within span `span`, their total, and how many tasks merged. */
export function teamData(team: TeamInput, span: { from?: number; to?: number }, workers: { tokens: SymccTokens; tries: number }, merged: number): TeamData {
  const lt = team.lead ? leadTotals(team.lead, span) : null
  const from = team.leadFrom ?? team.lead?.find(c => c.from)?.from
  const lead = lt ? { ...lt, ...(team.leadSessions !== undefined ? { sessions: team.leadSessions } : {}), ...(from ? { from } : {}) } : null
  const sc = scoutTotals(team.scouts ?? {}, span)
  return { lead, ...(lead ? {} : { leadProblem: team.leadProblem ?? 'no session logs' }), ...(team.leadUnread ? { leadUnread: team.leadUnread } : {}), workers, scouts: sc, total: sumTokens([lead?.tokens, workers.tokens, sc.tokens]), merged, ...(team.sessionUsd !== undefined ? { sessionUsd: team.sessionUsd } : {}) }
}
