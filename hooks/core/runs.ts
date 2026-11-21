// Time and cost of each try.
import type { SymccRun, SymccRunAgent, SymccRunEnd, SymccTask, SymccTokens } from '../../types'

// ---------------- time and cost of each try ----------------

/** The runs with a new try started at `now`; `mergeMain` marks a try that first merges main in after a clash. */
export const startRun = (runs: SymccRun[] | undefined, now: string, mergeMain = false): SymccRun[] => [...(runs ?? []), { started: now, ...(mergeMain ? { merge_main: true as const } : {}) }]

// ---------------- a restart symcc did itself (T-743) ----------------
// A try is one round of worker work plus what checks it. A restart symcc does itself (the app reopened, the plugin
// reloaded, the driving session changed, the old worker ended) is not a send-back: the next worker goes on with the
// SAME try (no new run, attempts stays), and the try keeps a record of each such restart.

/**
 * One restart symcc did itself on a try: when (the end time it took off the try), why (the try's end note then), the
 * worker it stopped, and when the next worker's part of the try started (its time limit counts from then).
 */
export type RunRestart = { at: string; why: string; agent?: string; started?: string }
/** A try as kept on the board, with the restarts symcc did itself (oldest first); see goOnRun. */
export type TryRun = SymccRun & { restarts?: RunRestart[] }

/** The restarts symcc did itself on try `r` ([] for none). */
export const restartsOf = (r: SymccRun | undefined): RunRestart[] => {
  const x = (r as TryRun | undefined)?.restarts
  return Array.isArray(x) ? x : []
}

/**
 * T-743: whether try `r` ended in a restart symcc did itself (a reopen, a reload, a hand-over, its old worker ended), so
 * the next worker goes on with the same try. A restart because the task was changed is on purpose: a new try.
 */
export const selfRestart = (r: SymccRun | undefined): boolean => r?.ended_by === 'restarted' && !/^the task was changed\b/.test(r.ended_note ?? '')

/**
 * T-743: the runs with the last try going on again after a restart symcc did itself (selfRestart): its end is taken
 * off (so its time counts from its first start to its next end), and the restart is kept on it (when, why, and the
 * worker it stopped, which is no longer this try's worker). Null when the last try did not end that way.
 */
export function goOnRun(runs: SymccRun[] | undefined, now: string): TryRun[] | null {
  const last = runs?.at(-1)
  if (!runs || !last || !selfRestart(last)) return null
  const { ended, ended_by: _b, ended_note, agent, ...rest } = last as TryRun
  const step: RunRestart = { at: ended ?? now, why: ended_note ?? '', ...(isAgentId(agent) ? { agent } : {}), started: now }
  // T-774: the worker it stopped keeps its own entry (and the tokens it had), ended at the restart
  const agents = rest.agents ? { agents: rest.agents.map(a => (a.ended ? a : { ...a, ended: step.at })) } : {}
  return [...runs.slice(0, -1), { ...rest, ...agents, restarts: [...restartsOf(last), step] }]
}

/**
 * T-743: goOnRun undone, for a claim whose worker never started (see unclaimed in app/workers.ts): the last try ends
 * again as it did at its latest restart. Null when the last try is not one that goOnRun opened (it is ended, it has a
 * worker, or it has no restart).
 */
export function undoGoOn(runs: SymccRun[] | undefined): TryRun[] | null {
  const last = runs?.at(-1) as TryRun | undefined
  const step = restartsOf(last).at(-1)
  if (!runs || !last || last.ended || last.agent || !step) return null
  const { restarts: _r, ...rest } = last
  const left = restartsOf(last).slice(0, -1)
  return [...runs.slice(0, -1), { ...rest, ended: step.at, ended_by: 'restarted', ...(step.why ? { ended_note: step.why } : {}), ...(step.agent ? { agent: step.agent } : {}), ...(left.length ? { restarts: left } : {}) }]
}

/**
 * T-743: when try `r`'s current worker started (ms): the latest restart's start on a try that went on after a restart
 * symcc did itself, else the try's own start; null when the board doesn't say. The try's total time still runs from
 * its first start (runMs); this is only for the worker's time limit.
 */
export function workerSince(r: SymccRun | undefined): number | null {
  const at = Date.parse(restartsOf(r).at(-1)?.started ?? r?.started ?? '')
  return Number.isFinite(at) ? at : null
}

/** T-743: whether agent `id` worked on try `r` before a restart symcc did itself (it is not that try's worker now). */
export const restartedAgent = (r: SymccRun | undefined, id: string): boolean => !!id && restartsOf(r).some(e => e?.agent === id)

/** How many of a task's latest tries keep their agent ids (SymccRun.agent and checkers); older tries lose them. */
export const AGENT_TRIES_KEPT = 5
/** How many checker ids one try keeps (the latest). */
export const CHECKERS_KEPT = 10
/** The most characters an agent id kept on a try may have; a longer one is not kept. */
const AGENT_ID_MAX = 200

/** Whether `v` can be an agent id kept on a try: a short string with no spaces or control characters. */
export const isAgentId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= AGENT_ID_MAX && /^[\x21-\x7e]+$/.test(v)

/**
 * The runs with agent `id` recorded on try `at` (the last try when not given): as its worker (`as` 'agent'), or added
 * to its checkers. A bad id, or no such try, changes nothing. Old tries' ids are then trimmed (keepAgentIds).
 */
export function withAgentId(runs: SymccRun[] | undefined, as: 'agent' | 'checker', id: unknown, at?: number): SymccRun[] | undefined {
  const i = at ?? (runs?.length ?? 0) - 1
  const r = runs?.[i]
  if (!runs || !r || !isAgentId(id)) return runs
  if (as === 'agent' ? r.agent === id : r.checkers?.includes(id)) return runs
  const out = [...runs]
  out[i] = as === 'agent' ? { ...r, agent: id } : { ...r, checkers: [...(r.checkers ?? []), id].slice(-CHECKERS_KEPT) }
  return keepAgentIds(out)
}

/**
 * The runs with their agent ids cleaned, for a board read from its file and after each change: a bad worker id is
 * dropped, the checkers keep only good ids (the latest CHECKERS_KEPT, empty dropped), and only the last
 * AGENT_TRIES_KEPT tries keep any. Returns `runs` itself when nothing changes.
 */
export function keepAgentIds<T extends SymccRun[] | undefined>(runs: T): T {
  if (!Array.isArray(runs)) return runs
  let changed = false
  const out = runs.map((r0, i) => {
    const old = i < runs.length - AGENT_TRIES_KEPT
    const r = keepAgents(keepRestarts(r0, old), old)
    if (r !== r0) changed = true
    if (!r || typeof r !== 'object' || !('agent' in r || 'checkers' in r)) return r
    const agent = !old && isAgentId(r.agent) ? r.agent : undefined
    const checkers = !old && Array.isArray(r.checkers) ? [...new Set(r.checkers.filter(isAgentId))].slice(-CHECKERS_KEPT) : []
    if (agent === r.agent && checkers.length && checkers.length === r.checkers?.length && checkers.every((c, k) => c === r.checkers![k])) return r
    if (agent === r.agent && !checkers.length && !('checkers' in r)) return r
    changed = true
    const { agent: _a, checkers: _c, ...rest } = r
    return { ...rest, ...(agent ? { agent } : {}), ...(checkers.length ? { checkers } : {}) }
  })
  return (changed ? out : runs) as T
}

// ---------------- each agent of a try (T-774) ----------------

/** T-774: how many agent entries one try keeps (the latest); an older one's tokens stay only in the try's sum. */
export const AGENTS_KEPT = 10

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))

/** T-774: `a` as a good agent entry (its bad parts dropped), or null when it can't be one (no good id, kind or start). */
function cleanAgent(a: unknown): SymccRunAgent | null {
  if (!a || typeof a !== 'object') return null
  const x = a as SymccRunAgent
  if (!isAgentId(x.id) || (x.kind !== 'worker' && x.kind !== 'checker') || !isIso(x.started)) return null
  const tokens = cleanTokens(x.tokens)
  const cost = typeof x.cost === 'number' && Number.isFinite(x.cost) && x.cost >= 0 ? x.cost : undefined
  const ended = isIso(x.ended) ? x.ended : undefined
  const want = 3 + (ended ? 1 : 0) + (tokens ? 1 : 0) + (cost !== undefined ? 1 : 0)
  if (Object.keys(x).length === want && ended === x.ended && cost === x.cost && (tokens ? JSON.stringify(tokens) === JSON.stringify(x.tokens) : x.tokens === undefined)) return x
  return { id: x.id, kind: x.kind, started: x.started, ...(ended ? { ended } : {}), ...(tokens ? { tokens } : {}), ...(cost !== undefined ? { cost } : {}) }
}

/**
 * T-774: try `r` with its agent entries cleaned: only good ones, the latest AGENTS_KEPT, and none at all on an `old`
 * try (as keepAgentIds does for the ids; its tokens and cost keep their sums). `r` itself when nothing changes.
 */
function keepAgents(r: SymccRun, old: boolean): SymccRun {
  if (!r || typeof r !== 'object' || !('agents' in r)) return r
  const all = r.agents as unknown
  const clean = old || !Array.isArray(all) ? [] : all.map(cleanAgent).filter((a): a is SymccRunAgent => !!a).slice(-AGENTS_KEPT)
  if (Array.isArray(all) && clean.length && clean.length === all.length && clean.every((a, k) => a === all[k])) return r
  const { agents: _a, ...rest } = r
  return { ...rest, ...(clean.length ? { agents: clean } : {}) }
}

/** T-774: the agent entries of try `r` ([] for none, e.g. a try from before T-774). */
export const agentsOf = (r: SymccRun | undefined): SymccRunAgent[] => (Array.isArray(r?.agents) ? r.agents : [])

/**
 * T-774: the runs with agent `id` started at `now` as a `kind` on the last try: a new entry (the latest AGENTS_KEPT
 * kept). An id that try already has, a bad id, or no try: the runs as they are.
 */
export function withAgentStart(runs: SymccRun[] | undefined, kind: SymccRunAgent['kind'], id: unknown, now: string): SymccRun[] | undefined {
  const last = runs?.at(-1)
  if (!runs || !last || !isAgentId(id) || agentsOf(last).some(a => a.id === id)) return runs
  return [...runs.slice(0, -1), { ...last, agents: [...agentsOf(last), { id, kind, started: now }].slice(-AGENTS_KEPT) }]
}

/**
 * T-774: the runs with what agent `id` (a `kind`) used added to its own entry, and the entry ended at `now` (an entry
 * already ended keeps its end). Its try is the one whose entries name it, else the last; a missing entry is added
 * (started at the worker's start on that try, or `now` for a checker). Only the entry changes: the caller adds `used`
 * to the try's own tokens and cost (endRun, or the checker's record), so the try's sum stays theirs.
 */
export function withAgentUsed(runs: SymccRun[] | undefined, kind: SymccRunAgent['kind'], id: unknown, now: string, used: { tokens?: SymccTokens; cost?: number } = {}): SymccRun[] | undefined {
  if (!runs?.length || !isAgentId(id)) return runs
  let i = runs.findLastIndex(r => agentsOf(r).some(a => a.id === id))
  if (i < 0) i = runs.length - 1
  const r = runs[i]!
  const have = agentsOf(r).find(a => a.id === id)
  const since = kind === 'worker' ? (restartsOf(r).at(-1)?.started ?? r.started) : now
  const a: SymccRunAgent = have ?? { id, kind, started: isIso(since) ? since : now }
  const tokens = used.tokens && tokenCount(used.tokens) ? addTokens(a.tokens, used.tokens) : a.tokens
  const cost = typeof used.cost === 'number' && Number.isFinite(used.cost) ? (a.cost ?? 0) + used.cost : a.cost
  const next: SymccRunAgent = { ...a, ended: a.ended ?? now, ...(tokens ? { tokens } : {}), ...(cost !== undefined ? { cost } : {}) }
  const list = have ? agentsOf(r).map(x => (x === have ? next : x)) : [...agentsOf(r), next].slice(-AGENTS_KEPT)
  const out = [...runs]
  out[i] = { ...r, agents: list }
  return out
}

/**
 * T-774: the tokens try `r`'s checkers used: their agent entries added up when it has any checker entry with tokens,
 * else its checker_tokens (T-769: a try from before T-774, or one whose entries were trimmed); undefined when not known.
 */
export function checkerTokensOf(r: SymccRun | undefined): SymccTokens | undefined {
  const own = agentsOf(r).filter(a => a.kind === 'checker' && a.tokens)
  return own.length ? sumTokens(own.map(a => a.tokens)) : r?.checker_tokens
}

/** T-774: a short agent id for a page: "ses…Qr2" (the first and last three characters of a long one). */
export function shortAgentId(id: string): string {
  const cs = [...id]
  return cs.length > 8 ? `${cs.slice(0, 3).join('')}…${cs.slice(-3).join('')}` : id
}

/** T-774: the mark of each kind of agent on the Runs part. */
export const AGENT_MARK: Record<SymccRunAgent['kind'], string> = { worker: '▸', checker: '⌕' }

/**
 * T-774: try `r`'s agents, one line each, for the task page's Runs part: "▸ worker  ses…Qr2  11m · 4.1M" (its time,
 * and its tokens and cost when known). An agent still at work counts up to `nowMs` (to the try's end once that ended).
 * [] for a try with no entries.
 */
export function agentLines(r: SymccRun, nowMs?: number): string[] {
  return agentsOf(r).map(a => {
    const end = a.ended ?? r.ended
    const ms = runMs({ started: a.started, ...(end ? { ended: end } : {}) }, nowMs)
    const used = [fmtDuration(ms), a.tokens && fmtTokens(tokenCount(a.tokens)), a.cost !== undefined && `~${fmtCost(a.cost)}`].filter(Boolean).join(' · ')
    return `${AGENT_MARK[a.kind]} ${a.kind.padEnd(7)} ${shortAgentId(a.id).padEnd(8)} ${used}`
  })
}

/**
 * T-774: the one-line sum of a task's own tries at the top of its Runs part: "3 tries · 21m · 10.1M tokens (3.6× the
 * usual task) · checkers 2.4M". The "× the usual" part only with a `usual` tokens figure (the board's usual tokens per
 * merged task, live.ts's usualTokens), the checkers' part only when their tokens are known; '' with no try.
 */
export function runsSummary(runs: SymccRun[] | undefined, nowMs?: number, usual?: number): string {
  const rs = runs ?? []
  if (!rs.length) return ''
  const t = sumRuns(rs, nowMs)
  const all = t.tokens !== undefined ? tokenCount(t.tokens) : undefined
  const times = all !== undefined && usual !== undefined && usual > 0 ? ` (${(all / usual).toFixed(1).replace(/\.0$/, '')}× the usual task)` : ''
  const chk = rs.map(checkerTokensOf).filter((x): x is SymccTokens => !!x)
  const chkN = chk.length ? tokenCount(sumTokens(chk)) : 0
  return [`${rs.length} ${rs.length === 1 ? 'try' : 'tries'}`, fmtDuration(t.ms), all !== undefined && `${fmtTokens(all)} tokens${times}`, chkN > 0 && `checkers ${fmtTokens(chkN)}`].filter(Boolean).join(' · ')
}

/** T-743: how many restarts one try keeps (the latest). */
const RESTARTS_KEPT = 10

/**
 * T-743: try `r` with its restarts cleaned (see TryRun): only entries with a time, the latest RESTARTS_KEPT, a bad
 * agent id dropped, and no agent ids at all on an `old` try (as keepAgentIds does). `r` itself when nothing changes.
 */
function keepRestarts(r: SymccRun, old: boolean): SymccRun {
  if (!r || typeof r !== 'object' || !('restarts' in r)) return r
  const all = (r as TryRun).restarts as unknown
  const ok = (Array.isArray(all) ? all : []).filter((e): e is RunRestart => !!e && typeof e === 'object' && typeof (e as RunRestart).at === 'string').slice(-RESTARTS_KEPT)
  const clean = ok.map(e => {
    const agent = !old && isAgentId(e.agent) ? e.agent : undefined
    const started = typeof e.started === 'string' ? e.started : undefined
    return agent === e.agent && typeof e.why === 'string' && started === e.started ? e : { at: e.at, why: typeof e.why === 'string' ? e.why : '', ...(agent ? { agent } : {}), ...(started ? { started } : {}) }
  })
  if (Array.isArray(all) && clean.length === all.length && clean.every((e, k) => e === all[k])) return r
  const { restarts: _r, ...rest } = r as TryRun
  return { ...rest, ...(clean.length ? { restarts: clean } : {}) } as SymccRun
}

/** Whether agent `id` is named on any of `runs` (as a try's worker, one of its checkers, or a worker a restart stopped). */
export const onRuns = (runs: SymccRun[] | undefined, id: string): boolean => !!id && !!runs?.some(r => r?.agent === id || (Array.isArray(r?.checkers) && r.checkers.includes(id)) || restartedAgent(r, id))

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

/** T-721: how many failing test names a failed try keeps (the first ones printed). */
export const FAILED_TESTS_KEPT = 10
/** T-721: the most characters one kept failing test name has (a longer one is cut, ending in "…"). */
export const FAILED_TEST_CHARS = 120

/**
 * T-721: the failing tests' names in test output: each "(fail) <name>" line (bun and `claude plugin test` print one per
 * failed test), without the "(fail)" mark and the time at its end, each once, at most FAILED_TESTS_KEPT, long ones cut.
 * [] when none can be read (and never throws: a try is never failed because of this).
 */
export function failedTestNames(output: unknown): string[] {
  try {
    const out: string[] = []
    for (const raw of String(output ?? '').split('\n')) {
      const m = /^\s*\(fail\)\s+(.*?)\s*(\[[\d.]+\s*m?s\])?\s*$/.exec(raw)
      const name = m?.[1]?.trim()
      if (!name) continue
      // whole characters (code points), so an emoji is never cut in half
      const chars = [...name]
      const cut = chars.length > FAILED_TEST_CHARS ? `${chars.slice(0, FAILED_TEST_CHARS - 1).join('')}…` : name
      if (!out.includes(cut)) out.push(cut)
      if (out.length >= FAILED_TESTS_KEPT) break
    }
    return out
  } catch {
    return []
  }
}

/**
 * T-721: the runs with the last try marked as failing test command `command`, with the failing tests' names read from
 * its `output` (failedTestNames; left out when none can be read). No command, or no try: the runs as they are.
 */
export function withFailedTests(runs: SymccRun[] | undefined, command: string | undefined, output: string | undefined): SymccRun[] | undefined {
  const last = runs?.at(-1)
  if (!runs || !last || !command) return runs
  const { failed_command: _c, failed_tests: _t, ...rest } = last
  const names = failedTestNames(output)
  return [...runs.slice(0, -1), { ...rest, failed_command: command, ...(names.length ? { failed_tests: names } : {}) }]
}

/**
 * The patch that ends task `t`'s running try at `now` with reason `by` (and `note`); empty when
 * `t` is not "doing" (no try of its own is running or being checked) or has no try.
 */
export function endedBy(t: Pick<SymccTask, 'status' | 'runs'> | undefined, now: string, by: SymccRunEnd, note?: string): { runs?: SymccRun[] } {
  if (t?.status !== 'doing' || !t.runs?.length) return {}
  return { runs: withEnd(endRun(t.runs, now), by, note) }
}

/** How long a try counts as just started (see freshTry): a change in that time joins it instead of using up a try. */
export const FRESH_TRY_MS = 60_000

/**
 * T-678: whether task `t`'s running try started less than FRESH_TRY_MS before `nowMs` and is still in its worker
 * step (not finishing, not being checked), e.g. the retry symcc started at once after a checker send-back. A change
 * then (the lead's note) starts that try again on the same try number, with no "restarted" line.
 */
export function freshTry(t: Pick<SymccTask, 'status' | 'runs'> & { finishing?: string; checking?: unknown }, nowMs: number): boolean {
  if (t.status !== 'doing' || t.finishing || t.checking) return false
  const last = t.runs?.at(-1)
  if (!last || last.ended) return false
  // T-743: a try that went on after a restart symcc did itself (goOnRun) is a whole round already under way: taking it
  // off would drop its tokens, time and restarts (and the stopped worker's id); a change ends it as a new try instead
  if (restartsOf(last).length) return false
  // its agent ids must be kept somewhere when its run is taken off (withoutOpenRun): on the try before it
  if (t.runs!.length < 2 && (last.agent || last.checkers?.length)) return false
  const age = nowMs - Date.parse(last.started)
  return Number.isFinite(age) && age >= 0 && age < FRESH_TRY_MS
}

/**
 * The runs with the last try taken off when it is still running (a fresh try started again on its number, see freshTry).
 * T-479: its worker's and checkers' ids move to the try before it (as checkers), so every copy still refuses them.
 */
export function withoutOpenRun(runs: SymccRun[] | undefined): SymccRun[] | undefined {
  if (!runs?.length || runs.at(-1)!.ended) return runs
  const open = runs.at(-1)!
  let out = runs.slice(0, -1)
  for (const id of [open.agent, ...(open.checkers ?? []), ...restartsOf(open).map(e => e.agent)]) out = withAgentId(out, 'checker', id) ?? out
  return out
}

/** The outcome of an investigation's try that handed back an answer (nothing committed, tested or merged). */
export const ANSWERED = 'answered'

/** Whether try `r` was an investigation's try that ended with an answer ("finished: answered", or "answered; ran over ..." when time ran out). */
export const isAnsweredRun = (r: Pick<SymccRun, 'ended_note'>): boolean => /^answered\b/.test(r.ended_note ?? '')

/** The short outcome of a finished try's check: "answered" (an investigation), "merged", "ready for review", "tests failed", "clash with main", "out of scope", ... */
export function finishedNote(r: { ok: boolean; detail: string; conflict?: boolean; testOutput?: string; review?: boolean; answered?: boolean; checker?: boolean; timedOut?: number }): string {
  if (r.answered) return ANSWERED
  if (r.timedOut !== undefined) return 'tests ran out of time'
  if (r.review) return 'ready for review'
  if (r.ok) return 'merged'
  if (r.conflict) return 'clash with main'
  if (r.checker) return 'checker found problems'
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
 * T-743: a try still running that already has tokens or a cost (it went on after a restart symcc did itself, see
 * goOnRun) gets what this end used added to them.
 */
export function endRun(runs: SymccRun[] | undefined, now: string, used: { tokens?: SymccTokens; cost?: number } = {}): SymccRun[] {
  const out = [...(runs ?? [])]
  const last = out[out.length - 1]
  if (!last) return out
  const open = !last.ended
  const add = {
    ...(used.tokens !== undefined && (last.tokens === undefined || open) ? { tokens: open && last.tokens !== undefined ? addTokens(last.tokens, used.tokens) : used.tokens } : {}),
    ...(used.cost !== undefined && (last.cost === undefined || open) ? { cost: open && last.cost !== undefined ? last.cost + used.cost : used.cost } : {}),
  }
  // T-774: an agent still open on the try (a worker stopped without a hand-back) ends with it
  const agents = open && last.agents?.some(a => !a.ended) ? { agents: last.agents.map(a => (a.ended ? a : { ...a, ended: now })) } : {}
  out[out.length - 1] = { ...last, ...(last.ended ? {} : { ended: now }), ...add, ...agents }
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
 */
export function fmtTotal(t: RunTotal): string {
  return [fmtDuration(t.ms), t.tokens !== undefined && `${fmtTokens(tokenCount(t.tokens))} tokens in all`, t.cost !== undefined && `~${fmtCost(t.cost)}`].filter(Boolean).join(' · ')
}

/** One try or a sum on the task page's Tries row: "6m · 0.9M tokens" (every kind added, no "in all"), "(running)" after
 *  the time while `running`; the tokens only when known. */
const triesPart = (t: RunTotal, running = false): string =>
  [`${fmtDuration(t.ms)}${running ? ' (running)' : ''}`, t.tokens !== undefined && `${fmtTokens(tokenCount(t.tokens))} tokens`].filter(Boolean).join(' · ')

/**
 * What the task page's Tries row says after the count: the latest try and the sum of all of them,
 * " · last: 6m · 0.9M tokens · all: 17m · 2.7M tokens"; with one try only that try, " · 6m · 0.9M tokens". A try still
 * running counts up to `nowMs` and says "(running)". '' when there is no try yet.
 */
export function triesSummary(runs: SymccRun[] | undefined, nowMs?: number): string {
  const rs = runs ?? []
  const last = rs[rs.length - 1]
  if (!last) return ''
  const one = triesPart(sumRuns([last], nowMs), !last.ended)
  return rs.length === 1 ? ` · ${one}` : ` · last: ${one} · all: ${triesPart(sumRuns(rs, nowMs))}`
}

/** One try in words: "try 2: 12m · 40k tokens in all · finished: merged", with "(running)" while it has not ended. */
export function fmtRun(r: SymccRun, i: number, nowMs?: number): string {
  const end = runEndText(r)
  return `try ${i + 1}: ${fmtTotal(sumRuns([r], nowMs))}${end ? ` · ${end}` : ''}${r.ended ? '' : ' (running)'}`
}

