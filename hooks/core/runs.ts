// Time and cost of each try.
import type { SymccRun, SymccRunEnd, SymccTask, SymccTokens } from '../../types'

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
export function endRun(runs: SymccRun[] | undefined, now: string, used: { tokens?: SymccTokens; cost?: number } = {}): SymccRun[] {
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

// ---------------- tokens, each kind kept apart ----------------

/** The token kinds, in the order they are shown. */
export const TOKEN_KINDS = ['input', 'output', 'cache_write', 'cache_read', 'unsplit'] as const
export type TokenKind = (typeof TOKEN_KINDS)[number]
const KIND_WORD: Record<TokenKind, string> = { input: 'input', output: 'output', cache_write: 'cache write', cache_read: 'cache read', unsplit: 'unsplit' }

/**
 * Each kind's usual price compared with normal input (Anthropic's list prices): cache writes cost
 * about 1.25 times input, cache reads about a tenth, output about 5 times. Only an estimate:
 * the real ratios depend on the model and the cache time.
 */
export const PRICE_WEIGHT = { input: 1, cache_write: 1.25, cache_read: 0.1, output: 5 } as const

const cnt = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)

/** Only the known kinds with a count above 0 (anything else is dropped); undefined when none is left. */
export function cleanTokens(x: unknown): SymccTokens | undefined {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined
  const o = x as Record<string, unknown>
  const out: SymccTokens = {}
  for (const k of TOKEN_KINDS) if (cnt(o[k])) out[k] = cnt(o[k])
  return Object.keys(out).length ? out : undefined
}

/** Counts added up kind by kind (`sign` -1 takes `b` away, never below 0); kinds at 0 are left out. */
export function addTokens(a: SymccTokens | undefined, b: SymccTokens | undefined, sign: 1 | -1 = 1): SymccTokens {
  const out: SymccTokens = {}
  for (const k of TOKEN_KINDS) {
    const n = Math.max(0, cnt(a?.[k]) + sign * cnt(b?.[k]))
    if (n) out[k] = n
  }
  return out
}

/** All the counts added up kind by kind. */
export const sumTokens = (xs: (SymccTokens | undefined)[]): SymccTokens => xs.reduce<SymccTokens>((s, x) => addTokens(s, x), {})

/** Every token of every kind (and unsplit ones) as one plain count. */
export const tokenCount = (t: SymccTokens | undefined): number => TOKEN_KINDS.reduce((s, k) => s + cnt(t?.[k]), 0)

/**
 * The billed-equivalent count: the split kinds weighed by their price compared with input
 * (PRICE_WEIGHT), so it says how many plain input tokens would cost the same. An estimate;
 * unsplit tokens are left out (their kinds are not known).
 */
export const billedTokens = (t: SymccTokens | undefined): number =>
  cnt(t?.input) * PRICE_WEIGHT.input + cnt(t?.cache_write) * PRICE_WEIGHT.cache_write + cnt(t?.cache_read) * PRICE_WEIGHT.cache_read + cnt(t?.output) * PRICE_WEIGHT.output

/** The kinds in words: "input 1.2k · output 3k · cache write 40k · cache read 1.1M" (kinds at 0 left out; unsplit ones last); "0" for none. */
export function fmtTokenKinds(t: SymccTokens | undefined): string {
  const parts = TOKEN_KINDS.filter(k => cnt(t?.[k])).map(k => `${KIND_WORD[k]} ${fmtTokens(cnt(t?.[k]))}`)
  return parts.length ? parts.join(' · ') : '0'
}

/**
 * The tokens a turn result reports, each kind kept apart (input, output, cache writes, cache
 * reads), or undefined if it reports none. The worker's turn result gives token counts only, no dollar cost.
 */
export function usageTokens(u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined): SymccTokens | undefined {
  if (!u) return undefined
  return cleanTokens({ input: u.input_tokens, output: u.output_tokens, cache_write: u.cache_creation_input_tokens, cache_read: u.cache_read_input_tokens })
}

/** How long one try took, in ms. A try still running counts up to `nowMs` (0 if not given). */
export function runMs(r: SymccRun, nowMs?: number): number {
  const a = Date.parse(r.started)
  const z = r.ended ? Date.parse(r.ended) : nowMs
  if (!Number.isFinite(a) || z === undefined || !Number.isFinite(z)) return 0
  return Math.max(0, z - a)
}

export type RunTotal = { ms: number; tokens?: SymccTokens; cost?: number; tries: number }

/** Adds up tries: their time, and their tokens and cost where any try reports them. */
export function sumRuns(runs: SymccRun[] | undefined, nowMs?: number): RunTotal {
  const rs = runs ?? []
  const tok = rs.filter(r => r.tokens !== undefined)
  const usd = rs.filter(r => typeof r.cost === 'number')
  return {
    ms: rs.reduce((s, r) => s + runMs(r, nowMs), 0),
    tries: rs.length,
    ...(tok.length ? { tokens: sumTokens(tok.map(r => r.tokens)) } : {}),
    ...(usd.length ? { cost: usd.reduce((s, r) => s + r.cost!, 0) } : {}),
  }
}

/** What boardTotal needs: the tasks, and the totals of the tasks moved to the archive (if any). */
type Totalled = { tasks: Pick<SymccTask, 'runs'>[]; archived?: { tries: number; ms: number; tokens?: SymccTokens; cost?: number } }

/** Adds up every try of every task on the board, and of the archived tasks. */
export function boardTotal(b: Totalled, nowMs?: number): RunTotal {
  const t = sumRuns(b.tasks.flatMap(t => t.runs ?? []), nowMs)
  const a = b.archived
  if (!a || !a.tries) return t
  const tokens = t.tokens === undefined && a.tokens === undefined ? undefined : addTokens(t.tokens, a.tokens)
  const cost = t.cost === undefined && a.cost === undefined ? undefined : (t.cost ?? 0) + (a.cost ?? 0)
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

/**
 * One total in words: "1h 12m · 1.2M tokens in all · ~$3.40" (tokens and cost only when known).
 * The one tokens figure is every kind added up ("in all"); /<name>-stats shows the kinds apart.
 * `label` is the word after the figure; the banner passes just "tokens" so its line fits in 50 columns.
 */
export function fmtTotal(t: RunTotal, label = 'tokens in all'): string {
  return [fmtDuration(t.ms), t.tokens !== undefined && `${fmtTokens(tokenCount(t.tokens))} ${label}`, t.cost !== undefined && `~${fmtCost(t.cost)}`].filter(Boolean).join(' · ')
}

/** One try in words: "try 2: 12m · 40k tokens in all · finished: merged", with "(running)" while it has not ended. */
export function fmtRun(r: SymccRun, i: number, nowMs?: number): string {
  const end = runEndText(r)
  return `try ${i + 1}: ${fmtTotal(sumRuns([r], nowMs))}${end ? ` · ${end}` : ''}${r.ended ? '' : ' (running)'}`
}

/** The board's total line, e.g. "total: 1h 12m · 1.2M tokens in all over 4 tries"; '' when no try has run. */
export function totalLine(b: Totalled, nowMs?: number): string {
  const t = boardTotal(b, nowMs)
  return t.tries ? `total: ${fmtTotal(t)} over ${t.tries} ${t.tries === 1 ? 'try' : 'tries'}` : ''
}
