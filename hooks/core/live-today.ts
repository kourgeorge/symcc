// T-797: the Live tab's ▍Today section (split out of live.ts).
import type { SymccTask } from '../../types'
import { median, taskFigures } from './stats'
import { padWidth, textWidth, wrapLine } from './width'
import { gapsOf, checkerTokensOf, tryCost, tryTokens, fmtCost, fmtDuration, fmtTokens, tokenCount, TOKEN_SIGN, fmtTok } from './runs'
import { dayOf, localOffset } from './days'
import { TOKENS_NOTE, type LiveView } from './live'
import { marksOf, sentBackOf, type LiveSeg, segs, segText, fitText, ms, type TodayWho } from './live-seg'

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
