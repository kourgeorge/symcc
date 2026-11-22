// T-805: a try's agent list is the only store of its agents, tokens and cost; these build tries for tests.
import type { SymccRun, SymccRunAgent, SymccTokens } from '../types'

/** A try started at `started` whose current worker is agent `id`. */
export const runBy = (id: string, started: string, extra: Partial<SymccRun> = {}): SymccRun => ({ started, ...extra, agents: [{ id, kind: 'worker' as const, started, ...(extra.ended ? { ended: extra.ended } : {}) }, ...(extra.agents ?? [])] })

/** A try with one stand-in worker entry carrying `tokens` (and `cost`), and a checker entry carrying `checker` tokens when given. */
export function usedRun(r: SymccRun, tokens?: SymccTokens, cost?: number, checker?: SymccTokens): SymccRun {
  const agents: SymccRunAgent[] = [
    ...(tokens || cost !== undefined ? [{ kind: 'worker' as const, started: r.started, ...(r.ended ? { ended: r.ended } : {}), ...(tokens ? { tokens } : {}), ...(cost !== undefined ? { cost } : {}) }] : []),
    ...(checker ? [{ kind: 'checker' as const, started: r.ended ?? r.started, ...(r.ended ? { ended: r.ended } : {}), tokens: checker }] : []),
  ]
  return { ...r, agents: [...(r.agents ?? []), ...agents] }
}
