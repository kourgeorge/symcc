// /<name>-stats and the lead's stats tool: time and token figures built only from what the board
// already keeps (tasks, their tries in runs[], their history), plus the archived tasks.
// Every function here is pure; the plugin reads board.json and archive.json and passes the tasks in.
import type { SymccRun, SymccStatus, SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { STATUS_WORD } from './board-file'
import { dayLabel, dayOf } from './days'
import { fmtCost, fmtDuration, fmtTokens, runMs } from './runs'

// ---------------- the range ----------------

/** Which tasks the report covers: all, those changed in the last `days` days, or ids from..to. */
export type StatsRange = { kind: 'all' } | { kind: 'days'; days: number } | { kind: 'ids'; from: number; to: number }

/** The usage line for /<name>-stats. */
export const statsUsage = (name: string = DEFAULT_NAME) => `Use: /${name}-stats, /${name}-stats 7d (the last 7 days) or /${name}-stats T-100..T-130 (an id range)`

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
 * A task's tries with an end time each. Older boards have tries that never got one (left open by a
 * reload); counting those up to now would add hours. Such a try ends where the next try started,
 * or, for the last try, at `nowMs` while the task is "doing", else at the task's last change.
 * `open` counts how many were filled in.
 */
export function endedRuns(t: Pick<SymccTask, 'runs'> & Partial<Pick<SymccTask, 'status' | 'updated_at'>>, nowMs?: number): { runs: SymccRun[]; open: number } {
  const rs = t.runs ?? []
  let open = 0
  const runs = rs.map((r, i) => {
    if (r.ended) return r
    const next = rs[i + 1]?.started
    const end = next ?? (t.status === 'doing' && nowMs !== undefined ? new Date(nowMs).toISOString() : t.updated_at)
    if (!next && t.status === 'doing') return { ...r, ...(end ? { ended: end } : {}) }
    open++
    return end && Date.parse(end) >= Date.parse(r.started) ? { ...r, ended: end } : { ...r, ended: r.started }
  })
  return { runs, open }
}

/** One task's figures: worker time (ms), tokens (when any try reports them), tries, and whether it has try data at all. */
export type TaskFigures = { ms: number; tokens?: number; tries: number; hasData: boolean }

export function taskFigures(t: Pick<SymccTask, 'runs'> & Partial<Pick<SymccTask, 'status' | 'updated_at'>>, nowMs?: number): TaskFigures {
  const runs = endedRuns(t, nowMs).runs
  const tok = runs.filter(r => typeof r.tokens === 'number')
  return { ms: runs.reduce((s, r) => s + runMs(r, nowMs), 0), tries: runs.length, hasData: runs.length > 0, ...(tok.length ? { tokens: tok.reduce((s, r) => s + r.tokens!, 0) } : {}) }
}

/** Why a try failed, read from one history line; null when the line is not a clear failure. */
export type FailReason = 'tests' | 'clash' | 'scope' | 'stopped' | 'rejected'

export function failReason(line: string): FailReason | null {
  const l = String(line ?? '')
  if (!/^try \d+\b/.test(l)) return null
  const head = l.replace(/^try \d+(?: \([^)]*\))?:\s*/, '')
  if (/^rejected by the owner\b/.test(head)) return 'rejected'
  if (/^(stopped\b|restarted\b)/.test(head)) return 'stopped'
  const cut = l.lastIndexOf(' → ')
  const outcome = cut < 0 ? '' : l.slice(cut + 3)
  if (/^tests failed\b|the tests failed after your edits/.test(outcome)) return 'tests'
  if (/^conflicts with the latest\b/.test(outcome)) return 'clash'
  if (/^changed files outside the task\b/.test(outcome)) return 'scope'
  return null
}

/** How a done task got merged: on its own, approved by the owner, or null when its history doesn't say. */
export function mergedHow(t: Pick<SymccTask, 'history'>): 'own' | 'approved' | null {
  const merged = t.history.filter(l => / → merged into /.test(l))
  if (!merged.length) return null
  return merged.some(l => /approved by the owner/.test(l)) ? 'approved' : 'own'
}

/** Who a task came from, as one word: "owner", "scout bugs", "worker", "lead", or "unknown" (made before it was kept). */
export function originKey(t: Pick<SymccTask, 'origin'>): string {
  const o = t.origin
  if (!o?.by) return 'unknown'
  return o.by === 'scout' && o.scout ? `scout ${o.scout}` : o.by
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
}

const cutTitle = (s: string, n = 35) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const avgDur = (xs: number[]) => (xs.length ? fmtDuration(mean(xs)!) : '-')
const avgTok = (xs: number[]) => (xs.length ? fmtTokens(mean(xs)!) : '-')
const row = (label: string, text: string, w = 14) => `  ${label.padEnd(w)} ${text}`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const STATUS_ORDER: SymccStatus[] = ['done', 'dropped', 'doing', 'todo', 'review', 'waiting', 'paused', 'failed', 'backlog']

/** The whole /<name>-stats report as plain text. */
export function statsReport(input: StatsInput): string {
  const { nowMs } = input
  const name = input.name ?? DEFAULT_NAME
  const off = input.offsetMin ?? 0
  const range = input.range ?? { kind: 'all' }
  const onBoard = new Set(input.tasks.map(t => t.id))
  const old = (input.archived ?? []).filter(t => !onBoard.has(t.id))
  const all = [...input.tasks, ...old].filter(t => inRange(t, range, nowMs))
  const archivedIn = all.filter(t => !onBoard.has(t.id)).length
  const out: string[] = []
  const head = `${name} stats: ${rangeText(range)} (${plural(all.length, 'task')}${archivedIn ? `, incl. ${archivedIn} archived` : ''})`
  out.push(head)
  if (input.archiveProblem) out.push(`Archived tasks are not counted: ${input.archiveProblem}`)
  if (!all.length) {
    out.push(range.kind === 'all' ? 'No tasks yet.' : 'No tasks in this range.')
    return out.join('\n')
  }
  const fig = new Map(all.map(t => [t.id, taskFigures(t, nowMs)]))
  const F = (t: SymccTask) => fig.get(t.id)!
  const withData = all.filter(t => F(t).hasData)
  const noData = all.length - withData.length
  if (noData) out.push(`${plural(noData, 'task')} with no try data (older tasks) ${noData === 1 ? 'is' : 'are'} left out of averages.`)
  const open = withData.reduce((s, t) => s + endedRuns(t, nowMs).open, 0)
  if (open) out.push(`${plural(open, 'try', 'tries')} with no end time (older boards) count up to the next try, or the task's last change.`)

  // 1. Totals
  const counts = STATUS_ORDER.map(s => [s, all.filter(t => t.status === s).length] as const).filter(([, n]) => n)
  const totalMs = withData.reduce((s, t) => s + F(t).ms, 0)
  const tokKnown = withData.filter(t => F(t).tokens !== undefined)
  const totalTok = tokKnown.reduce((s, t) => s + F(t).tokens!, 0)
  out.push('', '1. Totals')
  out.push(row('tasks', counts.map(([s, n]) => `${n} ${STATUS_WORD[s] ?? s}`).join(' · ')))
  out.push(row('worker time', fmtDuration(totalMs)))
  out.push(row('tokens', tokKnown.length ? `${fmtTokens(totalTok)}${tokKnown.length < withData.length ? ` (${tokKnown.length} of ${withData.length} tasks report tokens)` : ''}` : '-'))
  out.push(row('with data', `${withData.length} of ${all.length} tasks`))

  // Whole team: the lead and the scouts too, not only the workers
  if (input.team) {
    const tries = withData.reduce((s, t) => s + F(t).tries, 0)
    const span = rangeSpan(range, all, nowMs)
    out.push('', `   Whole team (${range.kind === 'all' ? 'all time' : range.kind === 'days' ? rangeText(range) : `${rangeText(range)}; lead and scouts over the time these tasks span`})`)
    out.push(...teamLines(input.team, span, { tokens: totalTok, tries }, all.filter(t => t.status === 'done').length, name))
  }

  // 2. Per task (done tasks with data)
  const done = withData.filter(t => t.status === 'done')
  const doneMs = done.map(t => F(t).ms)
  const doneTok = done.filter(t => F(t).tokens !== undefined).map(t => F(t).tokens!)
  out.push('', `2. Per task (${plural(done.length, 'done task')} with data)`)
  if (done.length) {
    out.push(row('time', `avg ${avgDur(doneMs)} · median ${fmtDuration(median(doneMs)!)}`))
    out.push(row('tokens', doneTok.length ? `avg ${avgTok(doneTok)} · median ${fmtTokens(median(doneTok)!)}` : '-'))
    out.push(row('tries', `avg ${(mean(done.map(t => F(t).tries)) ?? 0).toFixed(1)} per task`))
    const top = (pick: (t: SymccTask) => number | undefined, fmt: (n: number) => string) =>
      done
        .filter(t => pick(t) !== undefined)
        .sort((a, b) => pick(b)! - pick(a)! || a.id.localeCompare(b.id))
        .slice(0, 5)
        .map(t => `    ${t.id.padEnd(6)} ${cutTitle(t.title).padEnd(36)} ${fmt(pick(t)!)}`)
    const byTok = top(t => F(t).tokens, fmtTokens)
    if (byTok.length) out.push('  most tokens:', ...byTok)
    out.push('  most time:', ...top(t => F(t).ms, fmtDuration))
  } else out.push('  no done tasks with data')

  // 3. Per try
  const runs = withData.flatMap(t => endedRuns(t, nowMs).runs)
  const runTok = runs.filter(r => typeof r.tokens === 'number').map(r => r.tokens!)
  const first = done.filter(t => F(t).tries === 1).length
  out.push('', `3. Per try (${plural(runs.length, 'try', 'tries')})`)
  out.push(row('time', `avg ${avgDur(runs.map(r => runMs(r, nowMs)))}`))
  out.push(row('tokens', `avg ${avgTok(runTok)}`))
  out.push(row('first try', done.length ? `${pct(first, done.length)} of done tasks (${first} of ${done.length})` : '-'))

  // 4. Flow
  const lead = all
    .filter(t => t.status === 'done')
    .map(t => Date.parse(t.updated_at) - Date.parse(t.created_at))
    .filter(ms => Number.isFinite(ms) && ms >= 0)
  out.push('', '4. Flow')
  out.push(row('lead time', lead.length ? `avg ${avgDur(lead)} · median ${fmtDuration(median(lead)!)} (made to done, ${plural(lead.length, 'task')})` : '-'))
  out.push(row('waiting', `not shown: history lines carry no times, so time waiting for you can't be read reliably`))

  // 5. Outcomes
  const doneAll = all.filter(t => t.status === 'done')
  const how = doneAll.map(mergedHow)
  const own = how.filter(h => h === 'own').length
  const approved = how.filter(h => h === 'approved').length
  const unclear = doneAll.length - own - approved
  const reasons: Record<FailReason, number> = { tests: 0, clash: 0, scope: 0, stopped: 0, rejected: 0 }
  for (const t of all) for (const l of t.history) {
    const r = failReason(l)
    if (r) reasons[r]++
  }
  out.push('', '5. Outcomes')
  out.push(row('merged', `${own} on its own · ${approved} approved by you${unclear ? ` · ${unclear} not clear from history` : ''}`))
  out.push(row('failed tries', `tests ${reasons.tests} · clash with main ${reasons.clash} · scope ${reasons.scope} · stopped ${reasons.stopped} · rejected ${reasons.rejected} (from history)`))

  // 6. By role and by origin
  const groups = (key: (t: SymccTask) => string) => {
    const m = new Map<string, SymccTask[]>()
    for (const t of all) m.set(key(t), [...(m.get(key(t)) ?? []), t])
    const w = Math.max(12, ...[...m.keys()].map(k => k.length))
    return [...m.entries()]
      .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
      .map(([k, ts]) => {
        const d = ts.filter(t => F(t).hasData)
        const tok = d.filter(t => F(t).tokens !== undefined).map(t => F(t).tokens!)
        return row(k, `${plural(ts.length, 'task').padStart(9)} · avg ${avgTok(tok).padStart(6)} tokens · avg ${avgDur(d.map(t => F(t).ms)).padStart(7)}`, w)
      })
  }
  out.push('', '6. By role', ...groups(t => t.role || 'general'))
  out.push('   By origin', ...groups(originKey))

  // 7. By day
  const days = new Map<string, { done: number; ms: number; tokens: number }>()
  const at = (d: string) => days.get(d) ?? (days.set(d, { done: 0, ms: 0, tokens: 0 }), days.get(d)!)
  for (const t of doneAll) {
    const d = dayOf(Date.parse(t.updated_at || ''), off)
    if (d) at(d).done++
  }
  for (const r of runs) {
    const d = dayOf(Date.parse(r.started), off)
    if (!d) continue
    at(d).ms += runMs(r, nowMs)
    at(d).tokens += r.tokens ?? 0
  }
  const today = dayOf(nowMs, off)
  const last = [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7)
  out.push('', '7. By day (the last 7 days with activity)')
  if (!last.length) out.push('  no activity')
  for (const [d, v] of last) out.push(row(d === today ? 'Today' : dayLabel(d, today), `${String(v.done).padStart(3)} done · ${fmtDuration(v.ms).padStart(7)} · ${fmtTokens(v.tokens).padStart(6)} tokens`))
  return out.join('\n')
}

// ---------------- the whole team: scouts and the lead ----------------

/** One scout's tokens and time: runs, tokens and ms in all, and the same per day (UTC "YYYY-MM-DD") for the range. */
export type ScoutUsageFigures = { runs: number; tokens: number; ms: number }
export type ScoutUsage = ScoutUsageFigures & { days: Record<string, ScoutUsageFigures> }

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
const figs = (v: unknown): ScoutUsageFigures | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return { runs: num(o.runs), tokens: num(o.tokens), ms: num(o.ms) }
}
const jsonObj = (text: string | null | undefined): Record<string, unknown> | null => {
  try {
    const raw = JSON.parse(String(text ?? ''))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The scouts' tokens and time kept in scouts.json under "usage" (scout name → totals); {} for a missing or broken file. */
export function parseScoutUsage(text: string | null | undefined): Record<string, ScoutUsage> {
  const u = jsonObj(text)?.usage
  const out: Record<string, ScoutUsage> = {}
  if (!u || typeof u !== 'object' || Array.isArray(u)) return out
  for (const [name, v] of Object.entries(u as Record<string, unknown>)) {
    const f = figs(v)
    if (!name || !f) continue
    const days: Record<string, ScoutUsageFigures> = {}
    const d = (v as { days?: unknown }).days
    if (d && typeof d === 'object' && !Array.isArray(d))
      for (const [k, x] of Object.entries(d as Record<string, unknown>)) {
        const g = figs(x)
        if (g && /^\d{4}-\d{2}-\d{2}$/.test(k)) days[k] = g
      }
    out[name] = { ...f, days }
  }
  return out
}

/** scouts.json's text `text` with one more run of scout `name` added to its usage (ended at `endMs`, `ms` long, `tokens` when reported); the rest kept as it is. */
export function addScoutRun(text: string | null | undefined, name: string, run: { endMs: number; ms: number; tokens?: number }): string {
  const raw = jsonObj(text) ?? { scouts: {} }
  const usage = parseScoutUsage(text)
  const tok = num(run.tokens)
  const ms = num(run.ms)
  const add = (f: ScoutUsageFigures | undefined): ScoutUsageFigures => ({ runs: (f?.runs ?? 0) + 1, tokens: (f?.tokens ?? 0) + tok, ms: (f?.ms ?? 0) + ms })
  const cur = usage[name]
  const day = dayOf(run.endMs, 0)
  usage[name] = { ...add(cur), days: { ...(cur?.days ?? {}), ...(day ? { [day]: add(cur?.days[day]) } : {}) } }
  return JSON.stringify({ ...raw, usage }, null, 2) + '\n'
}

/** New scouts.json text `next` with the "usage" of the file's text before (`prev`) kept, when `next` carries none. */
export function keepScoutUsage(next: string, prev: string | null | undefined): string {
  const n = jsonObj(next)
  const usage = jsonObj(prev)?.usage
  if (!n || n.usage !== undefined || usage === undefined) return next
  return JSON.stringify({ ...n, usage }, null, 2) + '\n'
}

/** One API call of the lead, read from Claude Code's session log: its message id, when, and its tokens. */
export type LeadCall = { id: string; atMs: number; tokens: number }

/**
 * The lead's calls in one session log (Claude Code's <session>.jsonl): only assistant lines of the main chat
 * (not sidechains) with usage; only the usage numbers are read. A call written over several lines counts once.
 */
export function leadCalls(jsonl: string): LeadCall[] {
  const byId = new Map<string, LeadCall>()
  let n = 0
  for (const line of String(jsonl ?? '').split('\n')) {
    if (!line.includes('"usage"')) continue
    const o = jsonObj(line)
    if (!o || o.type !== 'assistant' || o.isSidechain === true) continue
    const m = o.message as { id?: unknown; usage?: Record<string, unknown> } | undefined
    const u = m?.usage
    if (!u || typeof u !== 'object') continue
    const tokens = num(u.input_tokens) + num(u.output_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens)
    if (!tokens) continue
    const id = typeof m!.id === 'string' && m!.id ? m!.id : `line-${n++}`
    const atMs = Date.parse(typeof o.timestamp === 'string' ? o.timestamp : '')
    const old = byId.get(id)
    if (!old || tokens > old.tokens) byId.set(id, { id, atMs, tokens })
  }
  return [...byId.values()]
}

/** Claude Code's folder name for a project path under ~/.claude/projects: every character not a letter or digit becomes "-". */
export const projectFolderName = (root: string) => String(root ?? '').replace(/[^a-zA-Z0-9]/g, '-')

/** The time span a range covers, in ms ([from, to], either open); for an id range, from the first task made to the last change. */
export function rangeSpan(r: StatsRange, tasks: Pick<SymccTask, 'created_at' | 'updated_at'>[], nowMs: number): { from?: number; to?: number } {
  if (r.kind === 'days') return { from: nowMs - r.days * 86_400_000 }
  if (r.kind === 'all') return {}
  const made = tasks.map(t => Date.parse(t.created_at || '')).filter(Number.isFinite)
  const changed = tasks.map(t => Date.parse(t.updated_at || t.created_at || '')).filter(Number.isFinite)
  if (!made.length) return { from: Infinity }
  return { from: Math.min(...made), to: Math.max(...changed) }
}

/** The scouts' runs, tokens and time within span `s` (all of it when the span is open on both ends; by whole UTC days otherwise). */
export function scoutTotals(usage: Record<string, ScoutUsage>, s: { from?: number; to?: number }): ScoutUsageFigures {
  const out = { runs: 0, tokens: 0, ms: 0 }
  const open = s.from === undefined && s.to === undefined
  const lo = s.from === undefined ? '' : s.from === Infinity ? '9999' : dayOf(s.from, 0)
  const hi = s.to === undefined ? '9999' : dayOf(s.to, 0)
  for (const u of Object.values(usage)) {
    const parts = open ? [u] : Object.entries(u.days).filter(([d]) => d >= lo && d <= hi).map(([, f]) => f)
    for (const f of parts) {
      out.runs += f.runs
      out.tokens += f.tokens
      out.ms += f.ms
    }
  }
  return out
}

/** The lead's calls and tokens within span `s`. */
export function leadTotals(calls: LeadCall[], s: { from?: number; to?: number }): { calls: number; tokens: number } {
  const inside = calls.filter(c => (s.from === undefined || (Number.isFinite(c.atMs) && c.atMs >= s.from)) && (s.to === undefined || (Number.isFinite(c.atMs) && c.atMs <= s.to)))
  return { calls: inside.length, tokens: inside.reduce((n, c) => n + c.tokens, 0) }
}

/** What the "Whole team" part needs: the lead's calls (or why they can't be read), the scouts' usage, and this session's $ if Claude Code reports it. */
export type TeamInput = { lead?: LeadCall[]; leadSessions?: number; leadProblem?: string; scouts?: Record<string, ScoutUsage>; sessionUsd?: number }

/** The "Whole team" lines: lead · workers · scouts · total for the range, and the cost per merged task. */
export function teamLines(team: TeamInput, span: { from?: number; to?: number }, workers: { tokens: number; tries: number }, merged: number, name: string = DEFAULT_NAME): string[] {
  const lead = team.lead ? leadTotals(team.lead, span) : null
  const sc = scoutTotals(team.scouts ?? {}, span)
  const total = (lead?.tokens ?? 0) + workers.tokens + sc.tokens
  const out: string[] = []
  out.push(row('lead', lead ? `${fmtTokens(lead.tokens).padStart(6)} tokens (${plural(lead.calls, 'call')}, from Claude Code's session logs${team.leadSessions !== undefined ? `, ${plural(team.leadSessions, 'session')}` : ''})` : `     - not counted: ${team.leadProblem ?? 'no session logs'}`))
  out.push(row('workers', `${fmtTokens(workers.tokens).padStart(6)} tokens (${plural(workers.tries, 'try', 'tries')})`))
  out.push(row('scouts', `${fmtTokens(sc.tokens).padStart(6)} tokens (${plural(sc.runs, 'run')}${sc.runs ? `, ${fmtDuration(sc.ms)}` : ''})`))
  out.push(row('total', `${fmtTokens(total).padStart(6)} tokens${lead ? '' : ' (without the lead)'}`))
  out.push(row('per merged', merged ? `${fmtTokens(total / merged).padStart(6)} tokens per merged task (${merged} merged)` : '     - no merged tasks'))
  out.push(row('dollars', `not shown: ${name} doesn't know the model prices${team.sessionUsd !== undefined ? ` (this session so far, as /cost says: ${fmtCost(team.sessionUsd)}, all of it, not split by range)` : ''}`))
  return out
}
