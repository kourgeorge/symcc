// /<name>-stats and the lead's stats tool: time and token figures built only from what the board
// already keeps (tasks, their tries in runs[], their history), plus the archived tasks.
// Every function here is pure; the plugin reads board.json and archive.json and passes the tasks in.
import type { SymccStatus, SymccTask, SymccTokens } from '../../types'
import { DEFAULT_NAME } from '../name'
import { STATUS_WORD } from './board-file'
import { dayLabel, dayOf } from './days'
import { ORIGIN_MARK } from './origin'
import { addTokens, billedTokens, cleanTokens, fmtCost, fmtDuration, fmtTokenKinds, fmtTokens, PRICE_WEIGHT, runMs, sumTokens, tokenCount } from './runs'

// ---------------- the range ----------------

/** Which tasks the report covers: all, those changed in the last `days` days, or ids from..to. */
export type StatsRange = { kind: 'all' } | { kind: 'days'; days: number } | { kind: 'ids'; from: number; to: number }

/** The usage line for /<name>-stats. */
export const statsUsage = (name: string = DEFAULT_NAME) => `Use: /${name}-stats, /${name}-stats 7d (the last 7 days) or /${name}-stats T-100..T-130 (an id range); add "full" for every detail, e.g. /${name}-stats full 7d`

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
  const tok = runs.filter(r => r.tokens !== undefined)
  const tokens = tok.length ? sumTokens(tok.map(r => r.tokens)) : undefined
  return { ms: runs.reduce((s, r) => s + runMs(r, nowMs), 0), tries: runs.length, hasData: runs.length > 0, ...(tokens ? { tokens, tok: tokenCount(tokens) } : {}) }
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

/** Who a task came from, as one word: "owner", "scout bugs", "worker", "lead", or "unknown" (no usable origin). */
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

/** The text split into whole characters (graphemes where the runtime knows them, else code points), never half of one. */
const chars = (s: string): string[] => {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter
  return Seg ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), x => x.segment) : Array.from(s)
}
/** Wide characters (CJK, full-width forms, emoji) take two screen columns. */
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]|\p{Extended_Pictographic}\uFE0F|\p{Emoji_Presentation}/u
/** Marks that take no column of their own (combining marks, joiners, variation selectors). */
const ZERO = /^[\p{M}\u200B-\u200F\uFE00-\uFE0F]+$/u
const charWidth = (c: string) => (ZERO.test(c) ? 0 : WIDE.test(c) ? 2 : 1)
/** How many screen columns the text takes. */
export const textWidth = (s: string) => chars(s).reduce((w, c) => w + charWidth(c), 0)
/** The text padded with spaces on the right to `n` screen columns. */
export const padWidth = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - textWidth(s)))
/** The text cut to at most `n` screen columns, ending in "…" when cut; whole characters only. */
export function cutTitle(s: string, n = 35): string {
  if (textWidth(s) <= n) return s
  let out = ''
  let w = 0
  for (const c of chars(s)) {
    const cw = charWidth(c)
    if (w + cw > n - 1) break
    out += c
    w += cw
  }
  return `${out}…`
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const avgDur = (xs: number[]) => (xs.length ? fmtDuration(mean(xs)!) : '-')
const avgTok = (xs: number[]) => (xs.length ? fmtTokens(mean(xs)!) : '-')
const row = (label: string, text: string, w = 12) => `  ${label.padEnd(w)} ${text}`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The widest a line of the report may be. */
export const STATS_WIDTH = 80
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

/** One bar row: "  label  ▇▇▇▇  81  39%" plus any `rest`; the bar padded so the numbers line up. */
const barRow = (label: string, w: number, value: number, max: number, total: number | null, rest = '') =>
  `  ${label.padEnd(w)} ${bar(value, max).padEnd(BAR_WIDTH)} ${String(value).padStart(4)}${total === null ? '' : ` ${pct(value, total).padStart(4)}`}${rest ? `  ${rest}` : ''}`

/** Line `l` cut into lines of at most `width` columns at spaces; the next lines start under its text (after a label), else 4 further in. */
export function wrapLine(l: string, width = STATS_WIDTH): string[] {
  if (l.length <= width || textWidth(l) <= width) return [l]
  const gap = /^ *\S.*?\S {2,}(?=\S)/.exec(l)?.[0].length ?? 0
  const pad = ' '.repeat(gap && gap <= 30 ? gap : Math.min(20, (/^ */.exec(l)?.[0].length ?? 0) + 4))
  const out: string[] = []
  let rest = l
  while (rest.length > width) {
    const cut = rest.lastIndexOf(' ', width)
    if (cut <= pad.length) break
    out.push(rest.slice(0, cut).trimEnd())
    rest = pad + rest.slice(cut + 1).trimStart()
  }
  return [...out, rest]
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

/** The kinds of `t` on their own line under a figure, e.g. "               input 1k · output 2k · ..."; none for no tokens. */
const kindsRow = (t: SymccTokens | undefined, w = 12): string[] => (tokenCount(t) ? [row('', fmtTokenKinds(t), w)] : [])

const STATUS_ORDER: SymccStatus[] = ['done', 'dropped', 'doing', 'todo', 'review', 'waiting', 'paused', 'failed', 'backlog']

/** Reads the /<name>-stats words: "full" anywhere asks for the full view; the rest is the range. */
export function parseStatsArgs(args: string): { full: boolean; range: string } {
  const words = String(args ?? '').trim().split(/\s+/).filter(Boolean)
  const full = words.some(w => /^full$/i.test(w))
  return { full, range: words.filter(w => !/^full$/i.test(w)).join(' ') }
}

/**
 * The whole /<name>-stats report as plain text, every line at most 80 columns. The summary view
 * keeps every figure, with bars; `full` adds the long explanations (how billed is weighed,
 * where the lead's tokens come from, why waiting time is not shown).
 */
export function statsReport(input: StatsInput & { full?: boolean }): string {
  const { nowMs } = input
  const full = input.full === true
  const name = input.name ?? DEFAULT_NAME
  const off = input.offsetMin ?? 0
  const range = input.range ?? { kind: 'all' }
  const onBoard = new Set(input.tasks.map(t => t.id))
  const old = (input.archived ?? []).filter(t => !onBoard.has(t.id))
  const all = [...input.tasks, ...old].filter(t => inRange(t, range, nowMs))
  const archivedIn = all.filter(t => !onBoard.has(t.id)).length
  const out: string[] = []
  const done$ = () => out.flatMap(l => wrapLine(l)).join('\n')
  out.push(`${name} stats · ${rangeText(range)} (${plural(all.length, 'task')}${archivedIn ? `, incl. ${archivedIn} archived` : ''})${full ? ' · full' : ''}`)
  if (input.archiveProblem) out.push(`Archived tasks are not counted: ${input.archiveProblem}`)
  if (!all.length) {
    out.push('', range.kind === 'all' ? 'No tasks yet.' : 'No tasks in this range.')
    return done$()
  }
  const fig = new Map(all.map(t => [t.id, taskFigures(t, nowMs)]))
  const F = (t: SymccTask) => fig.get(t.id)!
  const withData = all.filter(t => F(t).hasData)
  const noData = all.length - withData.length
  const totalMs = withData.reduce((s, t) => s + F(t).ms, 0)
  const tokKnown = withData.filter(t => F(t).tokens !== undefined)
  const totalTok = sumTokens(tokKnown.map(t => F(t).tokens))
  const doneAll = all.filter(t => t.status === 'done')
  const done = withData.filter(t => t.status === 'done')
  const first = done.filter(t => F(t).tries === 1).length

  // The one-line summary
  out.push('', [`${doneAll.length} done`, `${fmtDuration(totalMs)} of work`, ...(tokKnown.length ? [`${fmtTokens(tokenCount(totalTok))} tokens`] : []), ...(done.length ? [`${pct(first, done.length)} right first try`] : [])].join(' · '))
  if (noData) out.push(`(${plural(noData, 'task')} with no try data ${noData === 1 ? 'is' : 'are'} left out of averages)`)

  // Tasks by status
  const counts = STATUS_ORDER.map(s => [s, all.filter(t => t.status === s).length] as const).filter(([, n]) => n)
  const maxCount = Math.max(...counts.map(([, n]) => n))
  out.push('', 'Tasks')
  for (const [s, n] of counts) out.push(barRow(STATUS_WORD[s] ?? s, 12, n, maxCount, all.length))

  // Worker totals
  out.push('', 'Work')
  out.push(row('worker time', fmtDuration(totalMs)))
  out.push(row('tokens', tokKnown.length ? `${tokensText(totalTok)}${tokKnown.length < withData.length ? ` (${tokKnown.length} of ${withData.length} tasks report tokens)` : ''}` : '-'))
  if (tokKnown.length) out.push(...kindsRow(totalTok))
  if (full && tokKnown.length) out.push(row('billed-eq.', billedText(totalTok)))
  out.push(row('with data', `${withData.length} of ${all.length} tasks`))

  // Whole team: the lead and the scouts too, not only the workers
  if (input.team) {
    const tries = withData.reduce((s, t) => s + F(t).tries, 0)
    const span = rangeSpan(range, all, nowMs)
    out.push('', `Whole team (${range.kind === 'all' ? 'all time' : range.kind === 'days' ? rangeText(range) : `${rangeText(range)}; lead and scouts over the time these tasks span`})`)
    out.push(...teamLines(input.team, span, { tokens: totalTok, tries }, doneAll.length, name, full))
  }

  // Per done task, per try, lead time
  const doneMs = done.map(t => F(t).ms)
  const doneTok = done.filter(t => F(t).tok !== undefined).map(t => F(t).tok!)
  const runs = withData.flatMap(t => t.runs ?? [])
  const runTok = runs.filter(r => r.tokens !== undefined).map(r => tokenCount(r.tokens))
  const lead = doneAll.map(t => Date.parse(t.updated_at) - Date.parse(t.created_at)).filter(ms => Number.isFinite(ms) && ms >= 0)
  out.push('', `Per done task (${plural(done.length, 'done task')} with data)`)
  if (done.length) {
    out.push(row('time', `avg ${avgDur(doneMs)} · median ${fmtDuration(median(doneMs)!)}`))
    out.push(row('tokens', doneTok.length ? `avg ${avgTok(doneTok)} · median ${fmtTokens(median(doneTok)!)} (in all)` : '-'))
    out.push(row('tries', `avg ${(mean(done.map(t => F(t).tries)) ?? 0).toFixed(1)} per task`))
    out.push(row('first try', `${pct(first, done.length)} of done tasks (${first} of ${done.length})`))
  } else out.push('  no done tasks with data')
  out.push(row('lead time', lead.length ? `avg ${avgDur(lead)} · median ${fmtDuration(median(lead)!)} (made to done, ${plural(lead.length, 'task')})` : '-'))
  out.push('', `Per try (${plural(runs.length, 'try', 'tries')})`)
  out.push(row('time', `avg ${avgDur(runs.map(r => runMs(r, nowMs)))}`))
  out.push(row('tokens', `avg ${avgTok(runTok)} in all`))

  // The biggest tasks
  const top = (title: string, pick: (t: SymccTask) => number | undefined, fmt: (n: number) => string) => {
    const ts = done.filter(t => pick(t) !== undefined).sort((a, b) => pick(b)! - pick(a)! || a.id.localeCompare(b.id)).slice(0, 5)
    if (!ts.length) return
    const max = pick(ts[0]!)!
    out.push('', title, ...ts.map(t => `  ${t.id.padEnd(6)} ${padWidth(cutTitle(t.title), 35)} ${bar(pick(t)!, max).padEnd(BAR_WIDTH)} ${fmt(pick(t)!).padStart(7)}`))
  }
  top('Most tokens', t => F(t).tok, fmtTokens)
  top('Most time', t => F(t).ms, fmtDuration)

  // How tasks ended
  const how = doneAll.map(mergedHow)
  const own = how.filter(h => h === 'own').length
  const approved = how.filter(h => h === 'approved').length
  const unclear = doneAll.length - own - approved
  const reasons: Record<FailReason, number> = { tests: 0, clash: 0, scope: 0, stopped: 0, rejected: 0 }
  for (const t of all) for (const l of t.history) {
    const r = failReason(l)
    if (r) reasons[r]++
  }
  const ended: [string, number][] = [['merged on its own', own], ['approved by you', approved], ...(unclear ? [['not clear from history', unclear] as [string, number]] : [])]
  out.push('', `How tasks ended (${plural(doneAll.length, 'done task')})`)
  const maxEnd = Math.max(...ended.map(([, n]) => n))
  for (const [k, n] of ended) out.push(barRow(k, 22, n, maxEnd, doneAll.length))
  const failed: [string, number][] = [['tests failed', reasons.tests], ['clash with main', reasons.clash], ['files out of scope', reasons.scope], ['stopped', reasons.stopped], ['rejected by you', reasons.rejected]]
  const maxFail = Math.max(...failed.map(([, n]) => n))
  out.push(`  Failed tries (${Object.values(reasons).reduce((s, n) => s + n, 0)}, from history)`)
  for (const [k, n] of failed) out.push(barRow(`  ${k}`, 22, n, maxFail, null))

  // By role and by origin: tasks, share, avg tokens and avg time per group
  const figsOf = (ts: SymccTask[]) => {
    const d = ts.filter(t => F(t).hasData)
    const tok = d.filter(t => F(t).tok !== undefined).map(t => F(t).tok!)
    return `avg ${avgTok(tok).padStart(6)} tok · ${avgDur(d.map(t => F(t).ms)).padStart(7)}`
  }
  const sorted = (m: Map<string, SymccTask[]>) => [...m.entries()].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
  const groupBy = (ts: SymccTask[], key: (t: SymccTask) => string) => {
    const m = new Map<string, SymccTask[]>()
    for (const t of ts) m.set(key(t), [...(m.get(key(t)) ?? []), t])
    return m
  }
  const roles = sorted(groupBy(all, t => t.role || 'general'))
  const roleW = Math.max(12, ...roles.map(([k]) => k.length))
  out.push('', 'By role (tasks · share · avg tokens · avg time)')
  for (const [k, ts] of roles) out.push(barRow(k, roleW, ts.length, roles[0]![1].length, all.length, figsOf(ts)))

  const ORIGIN_LABEL: Record<string, string> = { lead: `${ORIGIN_MARK.lead} lead`, owner: `${ORIGIN_MARK.owner} you`, worker: `${ORIGIN_MARK.worker} workers`, scout: `${ORIGIN_MARK.scout} all scouts`, unknown: '? unknown' }
  const byOrigin = groupBy(all, t => (originKey(t).startsWith('scout') ? 'scout' : originKey(t)))
  const origins = sorted(byOrigin)
  const scouts = sorted(groupBy(byOrigin.get('scout') ?? [], t => originKey(t).replace(/^scout ?/, '') || 'scout'))
  const originW = Math.max(14, ...scouts.map(([k]) => k.length + 4))
  const maxOrigin = origins[0]![1].length
  out.push('', 'Where tasks came from (tasks · share · avg tokens · avg time)')
  for (const [k, ts] of origins) {
    out.push(barRow(ORIGIN_LABEL[k] ?? k, originW, ts.length, maxOrigin, all.length, figsOf(ts)))
    if (k === 'scout') for (const [s, st] of scouts) out.push(barRow(`    ${s}`, originW, st.length, maxOrigin, all.length, figsOf(st)))
  }

  // Done per day
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
    at(d).tokens += tokenCount(r.tokens)
  }
  const today = dayOf(nowMs, off)
  const last = [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7).reverse()
  const maxDay = Math.max(0, ...last.map(([, v]) => v.done))
  out.push('', 'Done per day (the last 7 days with activity: done · work · tokens)')
  if (!last.length) out.push('  no activity')
  for (const [d, v] of last) out.push(barRow(d === today ? 'Today' : dayLabel(d, today), 12, v.done, maxDay, null, `${fmtDuration(v.ms).padStart(7)} · ${fmtTokens(v.tokens).padStart(6)} tokens`))

  // Footnotes
  out.push('')
  if (full) out.push(`Waiting: time waiting for you is not shown: history lines carry no times, so it can't be read reliably.`, `Tokens "in all" add every kind up; billed is ${BILLED_NOTE}.`)
  else out.push(BILLED_FOOTNOTE, 'Time waiting for you is not shown: history lines carry no times.', `Every detail: /${name}-stats full`)
  return done$()
}

// ---------------- the whole team: scouts and the lead ----------------

/** One scout's tokens and time: runs, tokens (each kind apart) and ms in all, and the same per day (UTC "YYYY-MM-DD") for the range. */
export type ScoutUsageFigures = { runs: number; tokens: SymccTokens; ms: number }
export type ScoutUsage = ScoutUsageFigures & { days: Record<string, ScoutUsageFigures> }

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
const figs = (v: unknown): ScoutUsageFigures | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return { runs: num(o.runs), tokens: cleanTokens(o.tokens) ?? {}, ms: num(o.ms) }
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
export function addScoutRun(text: string | null | undefined, name: string, run: { endMs: number; ms: number; tokens?: SymccTokens }): string {
  const raw = jsonObj(text) ?? { scouts: {} }
  const usage = parseScoutUsage(text)
  const ms = num(run.ms)
  const add = (f: ScoutUsageFigures | undefined): ScoutUsageFigures => ({ runs: (f?.runs ?? 0) + 1, tokens: addTokens(f?.tokens, run.tokens), ms: (f?.ms ?? 0) + ms })
  const cur = usage[name]
  const day = dayOf(run.endMs, 0)
  usage[name] = { ...add(cur), days: { ...(cur?.days ?? {}), ...(day ? { [day]: add(cur?.days[day]) } : {}) } }
  return JSON.stringify({ ...raw, usage }, null, 2) + '\n'
}

/**
 * Migration: scouts.json's text with every usage total whose tokens were saved as one number
 * (before the kinds were kept apart) kept as-is, marked unsplit: { unsplit: n }. Null when nothing needs it.
 */
export function migrateScoutUsage(text: string | null | undefined): string | null {
  const raw = jsonObj(text)
  const u = raw?.usage
  if (!raw || !u || typeof u !== 'object' || Array.isArray(u)) return null
  let changed = false
  const fix = (v: unknown): unknown => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || typeof (v as { tokens?: unknown }).tokens !== 'number') return v
    changed = true
    return { ...(v as object), tokens: cleanTokens({ unsplit: (v as { tokens: number }).tokens }) ?? {} }
  }
  const usage = Object.fromEntries(Object.entries(u as Record<string, unknown>).map(([k, v]) => {
    const top = fix(v) as Record<string, unknown>
    const d = top && typeof top === 'object' ? top.days : undefined
    return [k, d && typeof d === 'object' && !Array.isArray(d) ? { ...top, days: Object.fromEntries(Object.entries(d as Record<string, unknown>).map(([day, x]) => [day, fix(x)])) } : top]
  }))
  return changed ? JSON.stringify({ ...raw, usage }, null, 2) + '\n' : null
}

/** New scouts.json text `next` with the "usage" of the file's text before (`prev`) kept, when `next` carries none. */
export function keepScoutUsage(next: string, prev: string | null | undefined): string {
  const n = jsonObj(next)
  const usage = jsonObj(prev)?.usage
  if (!n || n.usage !== undefined || usage === undefined) return next
  return JSON.stringify({ ...n, usage }, null, 2) + '\n'
}

/** One API call of the lead, read from Claude Code's session log: its message id, when, and its tokens (each kind apart). */
export type LeadCall = { id: string; atMs: number; tokens: SymccTokens }

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
    const tokens = cleanTokens({ input: u.input_tokens, output: u.output_tokens, cache_write: u.cache_creation_input_tokens, cache_read: u.cache_read_input_tokens })
    if (!tokens) continue
    const id = typeof m!.id === 'string' && m!.id ? m!.id : `line-${n++}`
    const atMs = Date.parse(typeof o.timestamp === 'string' ? o.timestamp : '')
    const old = byId.get(id)
    if (!old || tokenCount(tokens) > tokenCount(old.tokens)) byId.set(id, { id, atMs, tokens })
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
  const out: ScoutUsageFigures = { runs: 0, tokens: {}, ms: 0 }
  const open = s.from === undefined && s.to === undefined
  const lo = s.from === undefined ? '' : s.from === Infinity ? '9999' : dayOf(s.from, 0)
  const hi = s.to === undefined ? '9999' : dayOf(s.to, 0)
  for (const u of Object.values(usage)) {
    const parts = open ? [u] : Object.entries(u.days).filter(([d]) => d >= lo && d <= hi).map(([, f]) => f)
    for (const f of parts) {
      out.runs += f.runs
      out.tokens = addTokens(out.tokens, f.tokens)
      out.ms += f.ms
    }
  }
  return out
}

/** The lead's calls and tokens within span `s`. */
export function leadTotals(calls: LeadCall[], s: { from?: number; to?: number }): { calls: number; tokens: SymccTokens } {
  const inside = calls.filter(c => (s.from === undefined || (Number.isFinite(c.atMs) && c.atMs >= s.from)) && (s.to === undefined || (Number.isFinite(c.atMs) && c.atMs <= s.to)))
  return { calls: inside.length, tokens: sumTokens(inside.map(c => c.tokens)) }
}

/** What the "Whole team" part needs: the lead's calls (or why they can't be read), the scouts' usage, and this session's $ if Claude Code reports it. */
export type TeamInput = { lead?: LeadCall[]; leadSessions?: number; leadProblem?: string; scouts?: Record<string, ScoutUsage>; sessionUsd?: number }

/**
 * The "Whole team" lines: lead · workers · scouts with bars, each with its kinds apart on the next
 * line, the total with its billed-equivalent, the tokens per merged task and the dollar line.
 * `full` adds where the lead's tokens come from and how billed is weighed.
 */
export function teamLines(team: TeamInput, span: { from?: number; to?: number }, workers: { tokens: SymccTokens; tries: number }, merged: number, name: string = DEFAULT_NAME, full = false): string[] {
  const lead = team.lead ? leadTotals(team.lead, span) : null
  const sc = scoutTotals(team.scouts ?? {}, span)
  const total = sumTokens([lead?.tokens, workers.tokens, sc.tokens])
  const max = Math.max(tokenCount(lead?.tokens), tokenCount(workers.tokens), tokenCount(sc.tokens))
  const n = (t: SymccTokens) => fmtTokens(tokenCount(t)).padStart(6)
  const w = 12
  const part = (label: string, t: SymccTokens, what: string) => [`  ${label.padEnd(w)} ${bar(tokenCount(t), max).padEnd(BAR_WIDTH)} ${n(t)} tokens · ${what}`, ...kindsRow(t, w)]
  const out: string[] = []
  if (lead) out.push(...part(`${ORIGIN_MARK.lead} lead`, lead.tokens, `${plural(lead.calls, 'call')}${team.leadSessions !== undefined ? ` · ${plural(team.leadSessions, 'session')}` : ''}${full ? ", from Claude Code's session logs" : ''}`))
  else out.push(row(`${ORIGIN_MARK.lead} lead`, `not counted: ${team.leadProblem ?? 'no session logs'}`))
  out.push(...part(`${ORIGIN_MARK.worker} workers`, workers.tokens, plural(workers.tries, 'try', 'tries')))
  out.push(...part(`${ORIGIN_MARK.scout} scouts`, sc.tokens, `${plural(sc.runs, 'run')}${sc.runs ? ` · ${fmtDuration(sc.ms)}` : ''}`))
  out.push(row('total', `${tokensText(total)}${lead ? '' : ' (without the lead)'}`), ...kindsRow(total))
  if (full) out.push(row('billed-eq.', billedText(total)))
  out.push(row('per merged', merged ? `${fmtTokens(tokenCount(total) / merged)} in all, about ${fmtTokens(billedTokens(total) / merged)} billed per merged task (${merged} merged)` : '- no merged tasks'))
  out.push(row('dollars', `not shown: ${name} doesn't know the model prices${team.sessionUsd !== undefined ? ` (this session so far, as /cost says: ${fmtCost(team.sessionUsd)}, all of it, not split by range)` : ''}`))
  return out
}
