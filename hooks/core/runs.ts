// Time and cost of each try.
import type { SymccRun, SymccRunEnd, SymccTask } from '../../types'

// ---------------- time and cost of each try ----------------

/** The runs with a new try started at `now`; `mergeMain` marks a try that first merges main in after a clash. */
export const startRun = (runs: SymccRun[] | undefined, now: string, mergeMain = false): SymccRun[] => [...(runs ?? []), { started: now, ...(mergeMain ? { merge_main: true as const } : {}) }]

/**
 * The runs with the last try's end reason set to `by` (and `note`). The first reason wins: a try
 * that already has one keeps it, unless `overwrite` (e.g. the work was merged after all).
 */
export function withEnd(runs: SymccRun[] | undefined, by: SymccRunEnd, note?: string, overwrite = false): SymccRun[] {
  const out = [...(runs ?? [])]
  const last = out[out.length - 1]
  if (!last || (last.ended_by && !overwrite)) return out
  const { ended_note: _old, ...rest } = last
  out[out.length - 1] = { ...rest, ended_by: by, ...(note ? { ended_note: note } : {}) }
  return out
}

/**
 * The patch that ends task `t`'s running try at `now` with reason `by` (and `note`); empty when
 * `t` is not "doing" (no try of its own is running or being checked) or has no try.
 */
export function endedBy(t: Pick<SymccTask, 'status' | 'runs'> | undefined, now: string, by: SymccRunEnd, note?: string): { runs?: SymccRun[] } {
  if (t?.status !== 'doing' || !t.runs?.length) return {}
  return { runs: withEnd(endRun(t.runs, now), by, note) }
}

/** The short outcome of a finished try's check: "merged", "ready for review", "tests failed", "clash with main", "out of scope", ... */
export function finishedNote(r: { ok: boolean; detail: string; conflict?: boolean; testOutput?: string; review?: boolean }): string {
  if (r.review) return 'ready for review'
  if (r.ok) return 'merged'
  if (r.conflict) return 'clash with main'
  if (r.testOutput !== undefined) return 'tests failed'
  if (/^changed files outside the task/.test(r.detail)) return 'out of scope'
  if (/^checking failed/.test(r.detail)) return 'checking failed'
  if (/^the worker made no change/.test(r.detail)) return 'no change'
  return 'not merged'
}

/** How a try ended, in words: "merged main in (clash with main) · finished: merged"; '' when not known. */
export function runEndText(r: SymccRun): string {
  const end = r.ended_by ? `${r.ended_by}${r.ended_note ? `: ${r.ended_note}` : ''}` : ''
  return [r.merge_main && 'merged main in (clash with main)', end].filter(Boolean).join(' · ')
}

/**
 * The runs with the last try ended at `now`, adding what it used if known. A try already
 * ended keeps its end time (a second end does not move it), but missing tokens/cost are filled in.
 */
export function endRun(runs: SymccRun[] | undefined, now: string, used: { tokens?: number; cost?: number } = {}): SymccRun[] {
  const out = [...(runs ?? [])]
  const last = out[out.length - 1]
  if (!last) return out
  const add = {
    ...(used.tokens !== undefined && last.tokens === undefined ? { tokens: used.tokens } : {}),
    ...(used.cost !== undefined && last.cost === undefined ? { cost: used.cost } : {}),
  }
  out[out.length - 1] = { ...last, ...(last.ended ? {} : { ended: now }), ...add }
  return out
}

/**
 * All the tokens a turn result reports (input, cache reads, cache writes and output), or
 * undefined if it reports none. The worker's turn result gives token counts only, no dollar cost.
 */
export function usageTokens(u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined): number | undefined {
  if (!u) return undefined
  const n = [u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens].reduce<number>((s, x) => s + (typeof x === 'number' && Number.isFinite(x) ? x : 0), 0)
  return n > 0 ? n : undefined
}

/** How long one try took, in ms. A try still running counts up to `nowMs` (0 if not given). */
export function runMs(r: SymccRun, nowMs?: number): number {
  const a = Date.parse(r.started)
  const z = r.ended ? Date.parse(r.ended) : nowMs
  if (!Number.isFinite(a) || z === undefined || !Number.isFinite(z)) return 0
  return Math.max(0, z - a)
}

export type RunTotal = { ms: number; tokens?: number; cost?: number; tries: number }

/** Adds up tries: their time, and their tokens and cost where any try reports them. */
export function sumRuns(runs: SymccRun[] | undefined, nowMs?: number): RunTotal {
  const rs = runs ?? []
  const tok = rs.filter(r => typeof r.tokens === 'number')
  const usd = rs.filter(r => typeof r.cost === 'number')
  return {
    ms: rs.reduce((s, r) => s + runMs(r, nowMs), 0),
    tries: rs.length,
    ...(tok.length ? { tokens: tok.reduce((s, r) => s + r.tokens!, 0) } : {}),
    ...(usd.length ? { cost: usd.reduce((s, r) => s + r.cost!, 0) } : {}),
  }
}

/** What boardTotal needs: the tasks, and the totals of the tasks moved to the archive (if any). */
type Totalled = { tasks: Pick<SymccTask, 'runs'>[]; archived?: { tries: number; ms: number; tokens?: number; cost?: number } }

/** Adds up every try of every task on the board, and of the archived tasks. */
export function boardTotal(b: Totalled, nowMs?: number): RunTotal {
  const t = sumRuns(b.tasks.flatMap(t => t.runs ?? []), nowMs)
  const a = b.archived
  if (!a || !a.tries) return t
  const add = (x: number | undefined, y: number | undefined) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0))
  const tokens = add(t.tokens, a.tokens)
  const cost = add(t.cost, a.cost)
  return { ms: t.ms + a.ms, tries: t.tries + a.tries, ...(tokens !== undefined ? { tokens } : {}), ...(cost !== undefined ? { cost } : {}) }
}

/** A length of time: "45s", "12m", "1h 05m". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Dollars: "$0.42", "$3.40"; very small amounts "<$0.01". */
export function fmtCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00'
  return usd < 0.005 ? '<$0.01' : `$${usd.toFixed(2)}`
}

/** Token counts: "950", "12.3k", "1.2M". */
export function fmtTokens(n: number): string {
  const one = (x: number) => x.toFixed(1).replace(/\.0$/, '')
  if (n < 1000) return String(Math.round(n))
  if (n < 999_950) return `${one(n / 1000)}k`
  return `${one(n / 1_000_000)}M`
}

/** One total in words: "1h 12m · 1.2M tokens · ~$3.40" (tokens and cost only when known). */
export function fmtTotal(t: RunTotal): string {
  return [fmtDuration(t.ms), t.tokens !== undefined && `${fmtTokens(t.tokens)} tokens`, t.cost !== undefined && `~${fmtCost(t.cost)}`].filter(Boolean).join(' · ')
}

/** One try in words: "try 2: 12m · 40k tokens · finished: merged", with "(running)" while it has not ended. */
export function fmtRun(r: SymccRun, i: number, nowMs?: number): string {
  const end = runEndText(r)
  return `try ${i + 1}: ${fmtTotal(sumRuns([r], nowMs))}${end ? ` · ${end}` : ''}${r.ended ? '' : ' (running)'}`
}

/** The board's total line, e.g. "total: 1h 12m · ~$3.40 over 4 tries"; '' when no try has run. */
export function totalLine(b: Totalled, nowMs?: number): string {
  const t = boardTotal(b, nowMs)
  return t.tries ? `total: ${fmtTotal(t)} over ${t.tries} ${t.tries === 1 ? 'try' : 'tries'}` : ''
}
