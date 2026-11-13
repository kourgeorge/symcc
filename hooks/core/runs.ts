// Time and cost of each try.
import type { SymccRun, SymccTask } from '../../types'

// ---------------- time and cost of each try ----------------

/** The runs with a new try started at `now`. */
export const startRun = (runs: SymccRun[] | undefined, now: string): SymccRun[] => [...(runs ?? []), { started: now }]

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

/** One try in words: "try 2: 12m · 40k tokens", with "(running)" while it has not ended. */
export function fmtRun(r: SymccRun, i: number, nowMs?: number): string {
  return `try ${i + 1}: ${fmtTotal(sumRuns([r], nowMs))}${r.ended ? '' : ' (running)'}`
}

/** The board's total line, e.g. "total: 1h 12m · ~$3.40 over 4 tries"; '' when no try has run. */
export function totalLine(b: Totalled, nowMs?: number): string {
  const t = boardTotal(b, nowMs)
  return t.tries ? `total: ${fmtTotal(t)} over ${t.tries} ${t.tries === 1 ? 'try' : 'tries'}` : ''
}
