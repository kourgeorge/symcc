// The scouts' tokens and time, kept in scouts.json under "usage": reading it, adding a run, keeping it when the file
// is saved again, and adding it up over a span.
import type { SymccTokens } from '../../types'
import { dayOf } from './days'
import { isObj, jsonObj } from './text'
import { addTokens, cleanTokens } from './runs'

/** One scout's tokens and time: runs, tokens (each kind apart) and ms in all, and the same per day (UTC "YYYY-MM-DD") for the range. */
export type ScoutUsageFigures = { runs: number; tokens: SymccTokens; ms: number }
export type ScoutUsage = ScoutUsageFigures & { days: Record<string, ScoutUsageFigures> }

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
const figs = (v: unknown): ScoutUsageFigures | null => {
  if (!isObj(v)) return null
  const o = v as Record<string, unknown>
  // a total saved before the kinds were kept apart (one number) is kept as `unsplit` until /<name>-doctor fix migrate-data saves it so
  return { runs: num(o.runs), tokens: cleanTokens(typeof o.tokens === 'number' ? { unsplit: o.tokens } : o.tokens) ?? {}, ms: num(o.ms) }
}

/** The scouts' tokens and time kept in scouts.json under "usage" (scout name → totals); {} for a missing or broken file. */
export function parseScoutUsage(text: string | null | undefined): Record<string, ScoutUsage> {
  const u = jsonObj(text)?.usage
  const out: Record<string, ScoutUsage> = Object.create(null)
  if (!isObj(u)) return out
  for (const [name, v] of Object.entries(u as Record<string, unknown>)) {
    const f = figs(v)
    if (!name || !f) continue
    const days: Record<string, ScoutUsageFigures> = {}
    const d = (v as { days?: unknown }).days
    if (isObj(d))
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
  const days = { ...(cur?.days ?? {}), ...(day ? { [day]: add(cur?.days[day]) } : {}) }
  // T-808: only the last year's days are kept (the totals above stay whole)
  const from = dayOf(run.endMs - 365 * 86_400_000, 0)
  for (const k of Object.keys(days)) if (from && k < from) delete days[k]
  usage[name] = { ...add(cur), days }
  return JSON.stringify({ ...raw, usage }, null, 2) + '\n'
}

/** New scouts.json text `next` with the "usage" of the file's text before (`prev`) kept, when `next` carries none. */
export function keepScoutUsage(next: string, prev: string | null | undefined): string {
  const n = jsonObj(next)
  const usage = jsonObj(prev)?.usage
  if (!n || n.usage !== undefined || usage === undefined) return next
  return JSON.stringify({ ...n, usage }, null, 2) + '\n'
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
