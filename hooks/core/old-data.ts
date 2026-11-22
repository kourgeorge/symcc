// T-804: the one place that still knows the OLD shapes of symcc's data files. Nothing reads them on load any more: only
// /<name>-doctor's `migrate-data` item (app/migrate-data.ts) counts them (oldDataRows) and, when the owner says fix,
// brings every file to today's shape (upgradeBoard, upgradeArchiveTask, upgradeScoutUsage, migratedScoutRun) once.
// Pure functions on parsed JSON. Delete this file when the owner has run the fix.
import type { SymccHistoryEntry, SymccRun } from '../../types'
import { type FailReason, type HistoryFacts, type HistoryKind, AFTER_CHANGED, historyEntryOk, isHistoryKind, onPurposeStop, tryParts, withHistory } from './history'
import { addTokens, cleanTokens, isAgentId, sumTokens, tokenCount } from './runs'
import { isSoundSet, soundNotify, soundSetFor } from './board-file'
import { countFindings, isNothing } from './scouts'
import type { ScoutRunOutcome, ScoutRunRecord } from './scouts'

type Raw = Record<string, unknown>
const isObj = (x: unknown): x is Raw => !!x && typeof x === 'object' && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** The task fields the removed stage engine kept (T-332 to T-342): on the task `stage`, `stages` and `backs`, on a try `stage`. */
const STAGE_FIELDS = ['stage', 'stages', 'backs'] as const

/** Task `t` without the removed stage engine's fields, or null when it has none. */
export function withoutStages<T extends object>(t: T): T | null {
  const runs = (t as { runs?: unknown }).runs
  const runHas = Array.isArray(runs) && runs.some(r => isObj(r) && 'stage' in r)
  if (!STAGE_FIELDS.some(k => k in t) && !runHas) return null
  const out = { ...t } as Raw
  for (const k of STAGE_FIELDS) delete out[k]
  if (runHas) out.runs = (runs as unknown[]).map(r => {
    if (!isObj(r) || !('stage' in r)) return r
    const { stage: _stage, ...rest } = r
    return rest
  })
  return out as T
}

/** Tries whose tokens were saved as one number become { unsplit: n }. Null when no try needs it. */
export function migrateRunTokens(runs: unknown): SymccRun[] | null {
  if (!Array.isArray(runs) || !runs.some(r => isObj(r) && isNum(r.tokens))) return null
  return runs.map(r => (isObj(r) && isNum(r.tokens) ? { ...r, tokens: { unsplit: Math.max(0, r.tokens) } } : r))
}

/** The run fields T-805 moved onto the agent entries (and the task's agent and checker, and restarts[].agent). */
const RUN_SUMS = ['tokens', 'checker_tokens', 'cost', 'agent', 'checkers'] as const

type OldAgent = { id?: string; kind: 'worker' | 'checker'; started: string; ended?: string; ended_by?: string; tokens?: ReturnType<typeof cleanTokens>; cost?: number }

/** Whether a task (parsed JSON) still has what T-805 moved onto the agent entries of its tries. */
export function hasOldAgents(t: Raw): boolean {
  return 'agent' in t || 'checker' in t || (Array.isArray(t.runs) && t.runs.some(r => isObj(r) && (RUN_SUMS.some(k => k in r) || (Array.isArray(r.restarts) && r.restarts.some(e => isObj(e) && 'agent' in e)))))
}

/**
 * T-805: a task (parsed JSON) with each try's agents as the only store of its agents, tokens and cost. A try with no
 * agents gets a worker entry with tokens - checker_tokens (and the cost) and a checker entry with checker_tokens; a
 * try that has agents gets what its sums hold beyond them (debrief turns, dropped entries) added to its last worker.
 * The old ids (run.agent, run.checkers, restarts[].agent, task.agent, task.checker) become entries without tokens when
 * no entry names them. Null when the task has none of the old fields.
 */
export function migrateRunAgents(t: Raw): Raw | null {
  if (!hasOldAgents(t)) return null
  const runs = (Array.isArray(t.runs) ? t.runs : []) as unknown[]
  const out = runs.map((r0, ri) => {
    if (!isObj(r0)) return r0
    const { tokens: rawTok, checker_tokens: rawChk, cost, agent, checkers, restarts, agents: rawAgents, ...rest } = r0 as Raw
    const started = typeof rest.started === 'string' ? rest.started : ''
    const ended = typeof rest.ended === 'string' ? rest.ended : undefined
    const tokens = cleanTokens(rawTok)
    const chk = cleanTokens(rawChk)
    let agents = (Array.isArray(rawAgents) ? rawAgents : []).filter(isObj) as unknown as OldAgent[]

    const ids = (id: unknown) => isAgentId(id) && agents.some(a => a.id === id)
    const last = ri === runs.length - 1
    // The times of an id kept alone are not known, so its entry is marked "dropped": the guard still finds the id, but
    // the task page shows no made-up line for it.
    const mark = (kind: OldAgent['kind'], id: unknown, end?: string, open = false) => {
      if (!isAgentId(id) || ids(id)) return
      agents = [...agents, open ? { id, kind, started } : { id, kind, started, ...(end ? { ended: end } : {}), ended_by: 'dropped' }]
    }
    const stops = (Array.isArray(restarts) ? restarts : []).filter(isObj)
    for (const id of stops.map(e => e.agent)) if (isAgentId(id)) agents = agents.map(a => (a.id === id ? { ...a, ended_by: 'restarted' } : a))
    for (const e of stops) mark('worker', e.agent, typeof e.at === 'string' ? e.at : ended)
    const doing = last && t.status === 'doing'
    // the current worker of a task still doing stays open, so workerIdOf finds it
    const current = doing && !ended ? (isAgentId(t.agent) ? t.agent : agent) : undefined
    mark('worker', agent, ended, doing && !ended && agent === current)
    for (const c of Array.isArray(checkers) ? checkers : []) mark('checker', c, ended)
    if (doing) {
      mark('worker', t.agent, ended, !ended)
      mark('checker', t.checker, undefined, true)
    }
    // what the sums hold that the entries do not
    const sum = sumTokens(agents.map(a => a.tokens))
    const restTok = tokens ? addTokens(tokens, sum, -1) : undefined
    const restChk = chk ? addTokens(chk, sumTokens(agents.filter(a => a.kind === 'checker').map(a => a.tokens)), -1) : undefined
    const restCost = typeof cost === 'number' ? Math.max(0, cost - agents.reduce((s, a) => s + (a.cost ?? 0), 0)) : undefined
    const workerTok = restTok && restChk ? addTokens(restTok, restChk, -1) : restTok
    const give = (kind: OldAgent['kind'], tok: ReturnType<typeof cleanTokens>, usd?: number) => {
      const has = !!tok && tokenCount(tok) > 0
      if (!has && usd === undefined) return
      let i = agents.findLastIndex(a => a.kind === kind && a.ended_by !== 'restarted' && a.ended_by !== 'dropped')
      if (i < 0) i = agents.findLastIndex(a => a.kind === kind && a.ended_by !== 'restarted')
      if (i < 0) i = agents.findLastIndex(a => a.kind === kind)
      if (i < 0) {
        agents = [...agents, { kind, started: kind === 'worker' ? started : ended ?? started, ...(ended ? { ended } : {}) }]
        i = agents.length - 1
      }
      const a = agents[i]!
      agents = agents.map((x, k) => (k === i ? { ...a, ...(has ? { tokens: addTokens(a.tokens, tok) } : {}), ...(usd !== undefined ? { cost: (a.cost ?? 0) + usd } : {}) } : x))
    }
    give('worker', workerTok, restCost)
    give('checker', restChk && tokenCount(restChk) > 0 ? restChk : undefined)
    const left = stops.map(e => {
      const { agent: _a, ...keep } = e
      return keep
    })
    return { ...rest, ...(agents.length ? { agents } : {}), ...(left.length ? { restarts: left } : {}) }
  })
  const { agent: _a, checker: _c, ...task } = t
  return { ...task, ...(runs.length ? { runs: out } : {}) }
}

/** Roles that were built in before and are gone now, and the role a task with one gets. */
export const OLD_ROLES: Record<string, string> = { tests: 'tester', backend: 'general', frontend: 'general' }

/** Task `t` without the old conflict_tries field (T-548), or null when it has none. */
export function withoutConflictTries<T extends object>(t: T): T | null {
  if (!('conflict_tries' in t)) return null
  const { conflict_tries: _c, ...rest } = t as T & { conflict_tries?: unknown }
  return rest as T
}

/** The note of a task that waited to rerun only its tests when that rerun was removed (T-547): it is sent to a new try. */
export const TEST_RERUN_GONE_NOTE = 'its tests had run out of time; symcc no longer reruns only the tests, so a new try starts (raise test_minutes if the tests are just slow)'

/** Task `t` without test_rerun and rerun_minutes (T-547), or null when it has neither; a task that waited for that rerun goes back to "todo". */
export function withoutTestRerun(t: Raw): Raw | null {
  if (!('test_rerun' in t) && !('rerun_minutes' in t)) return null
  const { test_rerun, rerun_minutes: _m, ...rest } = t
  if (test_rerun === undefined || test_rerun === null || (t.status !== 'waiting' && t.status !== 'doing')) return rest
  const { session: _s, finishing: _f, checking: _c, options: _o, asked_files: _a, ...todo } = rest
  const hist = Array.isArray(t.history) ? (t.history as SymccHistoryEntry[]) : []
  return { ...todo, status: 'todo', question: null, note: TEST_RERUN_GONE_NOTE, history: withHistory(hist, typeof t.updated_at === 'string' ? t.updated_at : '', ['step', TEST_RERUN_GONE_NOTE]) }
}

/** Old lines that are not about a try, by how they start: [kind, start]. */
const PLAIN_KINDS: [HistoryKind, RegExp][] = [
  ['created', /^created by /],
  ['note', /^the lead added a note:/],
  ['answer', /^the owner answered:/],
  ['waits-changed', new RegExp(`^${AFTER_CHANGED}`)],
  ['files-refused', /^the owner didn't allow files:/],
  ['files-widened', /^(files widened:|the owner allowed files:|owner edited files)/],
  ['moved-backlog', /^(moved to the backlog|moved from the backlog)/],
  ['retried', /^brought back from/],
  ['resumed', /^resumed\b/],
  ['merge-into', /^now merges into /],
  ['merged', /^merged outside the board\b/],
  ['not-merged', /^(not merged|not started):/],
]

/** How symcc started a try's result, the words it put right after " → ": good results, then bad ones (T-806: only the migration reads them now). */
const OLD_GOOD = /^(merged into|already merged into|done\b)/
const OLD_BAD = /^(not merged|tests failed|the checker found problems|conflicts with the latest|symcc could not|could not|checking failed|the worker made no change|the worker ended its turn before|your files on|its checking and merging ran over|its merge ran over)/
const OLD_KNOWN = new RegExp(`${OLD_GOOD.source}|${OLD_BAD.source}|^(checks passed|the checker (was stopped|couldn't start|gave no verdict)|you have )`)

/** The index of the " → " that starts a try's result in `body`: the first one followed by words symcc writes there, else the last one; undefined when none. */
function oldResultArrow(body: string): number | undefined {
  const arrows = [...body.matchAll(/ → /g)].map(a => a.index!)
  return arrows.find(i => OLD_KNOWN.test(body.slice(i + 3))) ?? arrows.at(-1)
}

/**
 * Where the try's result starts in history line `l` (its " → "). When the line has " → the checker found problems:", that
 * is the result and nothing after it counts. Otherwise it is the last " → " followed by an outcome word symcc writes there; else the last one.
 */
const OLD_OUTCOME_WORDS = /^(tests failed\b|conflicts with the latest\b|changed files outside the task\b|the checker found problems\b|tests ran out of time\b|the worker made no change\b|not merged\b|checking failed\b|symcc could not\b|could not\b|the worker ended its turn before\b|your files on \S+ can't be updated\b|merged into\b|already merged into\b|checks passed\b)/
function oldCutAt(l: string): number {
  const checker = l.indexOf(' → the checker found problems:')
  if (checker >= 0) return checker
  for (let i = l.lastIndexOf(' → '); i >= 0; i = i ? l.lastIndexOf(' → ', i - 1) : -1) if (OLD_OUTCOME_WORDS.test(l.slice(i + 3))) return i
  return l.lastIndexOf(' → ')
}

/** A "not merged: the task was … while it was being checked" result that is an on-purpose stop. */
function oldNotMergedOnPurpose(outcome: string): boolean {
  const why = /^not merged: the task was (.*)$/.exec(outcome)?.[1]
  if (why === undefined) return false
  if (/^sent to the owner\b/.test(why)) return true
  return onPurposeStop(why.replace(/^stopped because\s+/, ''))
}

/** Why a try failed, read from one old history line; null when the line is not a clear failure. */
export function oldFailReason(line: string): FailReason | null {
  const l = String(line ?? '')
  if (!/^try \d+\b/.test(l)) return null
  const head = l.replace(/^try \d+(?: \([^)]*\))?:\s*/, '')
  if (/^rejected by the owner\b/.test(head)) return 'rejected'
  if (/^checker\b/.test(head)) return null
  if (/^restarted: the task was changed\b/.test(head)) return 'changed'
  if (/^(out of time\b|stopped after \d+ min \(out of time\)|its checking and merging ran over \d+ min\b)/.test(head)) return 'timeout'
  if (/^the worker ended without a result\b/.test(head)) return 'noresult'
  if (onPurposeStop(/^stopped:\s*(.*)$/.exec(head)?.[1])) return null
  if (/^restarted\b/.test(head)) return null
  if (/^stopped\b/.test(head)) return 'stopped'
  if (/^(approved by the owner|merging\b|merged once your files)/.test(head)) return null
  const cut = oldCutAt(l)
  const outcome = cut < 0 ? '' : l.slice(cut + 3)
  if (/^tests failed\b|the tests failed after your edits/.test(outcome)) return 'tests'
  if (/^conflicts with the latest\b/.test(outcome)) return 'clash'
  if (/^changed files outside the task\b/.test(outcome)) return 'scope'
  if (/^the checker found problems\b/.test(outcome)) return 'checker'
  if (/^tests ran out of time\b/.test(outcome)) return 'timeout'
  if (/^the worker made no change\b/.test(outcome)) return 'nochange'
  if (/^not merged\b/.test(outcome)) return oldNotMergedOnPurpose(outcome) || /\(not used: /.test(outcome) || /, and the task changed nothing else$/.test(outcome) ? null : 'notmerged'
  if (/^your files on \S+ can't be updated\b/.test(outcome)) return 'notmerged'
  if (/^(checking failed|symcc could not|could not|the worker ended its turn before)\b/.test(outcome)) return 'other'
  if (/; nothing was checked or merged$/.test(head)) return 'other'
  return null
}

/** The kinds of a try's result line, whose text is split at the " → ". */
const RESULT_LINE_KINDS: readonly string[] = ['merged', 'done', 'failed', 'try-result', 'not-merged', 'approved', 'approve-failed']

/** The stage words of a 'stage' line and the step each means. */
const STAGE_STEPS: [RegExp, NonNullable<HistoryFacts['step']>][] = [
  [/^worker started\b/, 'worker-start'], [/^worker handed back\b/, 'handed-back'], [/^prep started\b/, 'prep'], [/^checker started\b/, 'checker'],
  [/^waits in the merge queue\b/, 'queue'], [/^tests started\b/, 'tests'], [/^merge started\b/, 'merge'],
]

/** The facts (T-806) of an old history line, read out of its kind and text with the old patterns, one last time. */
export function oldHistoryFacts(e: { kind: string; text: string }): HistoryFacts {
  const parts = tryParts(e.text)
  const body = parts ? parts[2] : e.text
  const out: HistoryFacts = {}
  if (parts) out.try = parts[1]
  if (e.kind === 'stage') {
    const step = STAGE_STEPS.find(([re]) => re.test(body))?.[1]
    if (step) out.step = step
    const place = /^waits in the merge queue \(place (\d+)\)/.exec(body)
    if (place) out.place = Number(place[1])
  }
  if (parts && RESULT_LINE_KINDS.includes(e.kind)) {
    const arrow = oldResultArrow(body)
    if (arrow !== undefined && body.slice(arrow + 3)) out.result = body.slice(arrow + 3)
  }
  const reason = oldFailReason(e.text)
  if (reason) out.reason = reason
  if (e.kind === 'merged' && /^merged outside the board\b/.test(e.text)) out.how = 'outside'
  else if (e.kind === 'merged' && / → merged into /.test(e.text)) out.how = /approved by the owner/.test(e.text) ? 'approved' : 'own'
  if ((e.kind === 'not-merged' || e.kind === 'stopped') && (/\basked the owner\b/.test(body) || /\bpaused\b.*\bwait(?:s|ing)? (?:for|on) (?:the owner|you)\b/i.test(body))) out.owner = true
  if (e.kind === 'moved-backlog' && /^moved to the backlog\b/.test(e.text)) out.backlog = true
  return out
}

/** The kind of an old history line (a plain string from before T-522), guessed from how it starts and from its result words. */
export function guessHistoryKind(line: string): HistoryKind {
  const parts = tryParts(line)
  if (!parts) return PLAIN_KINDS.find(([, re]) => re.test(line))?.[0] ?? 'other'
  const body = parts[2]
  if (/^checker: OK\b/.test(body)) return 'checker-ok'
  if (/^checker found problems\b/.test(body)) return 'checker-problems'
  if (/^checker\b/.test(body)) return 'checker'
  if (/^(worker asked|the owner asked)/.test(body)) return 'asked'
  if (/^answered\b/.test(body)) return 'answered'
  if (/^restarted\b/.test(body)) return 'restarted'
  if (/^stopped/.test(body)) return 'stopped'
  if (/^rejected/.test(body)) return 'rejected'
  if (/^approved, but/.test(body)) return 'approve-failed'
  if (/^(out of time|ran \d+ min, over|time is up)/.test(body)) return 'out-of-time'
  if (/^the worker ended without a result|; nothing was checked or merged$/.test(body)) return 'failed'
  const arrow = oldResultArrow(body)
  if (arrow !== undefined) {
    const result = body.slice(arrow + 3)
    return /^done\b/.test(result) ? 'done' : OLD_GOOD.test(result) ? 'merged' : OLD_BAD.test(result) ? 'failed' : 'try-result'
  }
  if (/, so it is done$/.test(body)) return 'done'
  return 'step'
}

/** The fact fields of a history entry (T-806): one of them set means today's code wrote the line. */
const FACT_FIELDS = ['try', 'step', 'place', 'result', 'reason', 'how', 'owner', 'backlog']

/** Whether entry `e` is from before the facts: it has no fact field at all, and the old patterns find a fact in its text. Never true for a line today's code wrote (T-806). */
function lacksFacts(e: SymccHistoryEntry): boolean {
  if (FACT_FIELDS.some(k => (e as Record<string, unknown>)[k] !== undefined)) return false
  return Object.keys(oldHistoryFacts(e)).length > 0
}

/** An old history line (a plain string) as a record: kind guessed (guessHistoryKind), time guessed from the try it names or the task's created_at. */
export function oldHistoryEntry(line: string, t: { runs?: readonly SymccRun[]; created_at?: string } = {}): SymccHistoryEntry {
  const kind = guessHistoryKind(line)
  const n = tryParts(line)?.[1]
  const run = n ? t.runs?.[n - 1] : undefined
  const at = run ? run.ended ?? run.started : kind === 'created' ? t.created_at : undefined
  return { ...(typeof at === 'string' && at ? { at } : {}), kind, text: line, ...oldHistoryFacts({ kind, text: line }) }
}

/**
 * A task's history in the current shape: string lines become records, a record with a kind symcc doesn't know gets
 * "other", anything else is dropped. Null when there is nothing to convert.
 */
export function migrateHistory(t: { history?: unknown; runs?: readonly SymccRun[]; created_at?: string }): SymccHistoryEntry[] | null {
  const h = t.history
  if (!Array.isArray(h) || h.every(e => typeof e !== 'string' && historyEntryOk(e) && isHistoryKind((e as SymccHistoryEntry).kind) && !lacksFacts(e as SymccHistoryEntry))) return null
  const out: SymccHistoryEntry[] = []
  for (const e of h) {
    if (typeof e === 'string') { out.push(oldHistoryEntry(e, t)); continue }
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof (e as SymccHistoryEntry).text !== 'string') continue
    const r = e as SymccHistoryEntry
    const kind = r.kind === 'approved' ? 'approve-failed' : isHistoryKind(r.kind) ? r.kind : 'other'
    // the facts the old patterns read out of the line fill the ones it doesn't have (never replacing a saved one)
    const { at: _at, ...saved } = r
    const old = lacksFacts({ ...r, kind }) ? oldHistoryFacts({ kind, text: r.text }) : {}
    out.push({ ...(typeof r.at === 'string' && r.at ? { at: r.at } : {}), ...old, ...saved, kind, text: r.text })
  }
  return out
}

/**
 * A board task (parsed JSON) from an older board brought to the current shape, or null when it already has it:
 * no origin, old roles, tries left open, no merge_into (gets `into`, the board's old target_branch), the stage engine's
 * fields, string history lines, test_rerun, conflict_tries, and the "queue (n)" note.
 */
export function upgradeTask(t: Raw, into = 'main'): Raw | null {
  let out: Raw = withoutStages(t) ?? t
  if (!(typeof t.merge_into === 'string' && t.merge_into.trim())) out = { ...out, merge_into: into }
  const split = migrateRunTokens(out.runs)
  if (split) out = { ...out, runs: split }
  const agents = migrateRunAgents(out)
  if (agents) out = agents
  if (!('origin' in t)) out = { ...out, origin: { by: 'lead', why: 'made before origins were kept', at: typeof t.created_at === 'string' ? t.created_at : '' } }
  const role = typeof t.role === 'string' ? OLD_ROLES[t.role.trim().toLowerCase()] : undefined
  if (role) out = { ...out, role }
  const history = migrateHistory(out as Parameters<typeof migrateHistory>[0])
  if (history) out = { ...out, history }
  const rs = (Array.isArray(out.runs) ? out.runs : []) as SymccRun[]
  const open = (r: SymccRun, i: number) => isObj(r) && typeof r.started === 'string' && !r.ended && !(i === rs.length - 1 && t.status === 'doing')
  if (rs.some(open)) {
    out = {
      ...out,
      runs: rs.map((r, i) => {
        if (!open(r, i)) return r
        const end = rs[i + 1]?.started ?? (t.updated_at as string | undefined)
        return { ...r, ended: end && Date.parse(end) >= Date.parse(r.started) ? end : r.started }
      }),
    }
  }
  const rerun = withoutTestRerun(out)
  if (rerun) out = rerun
  const clash = withoutConflictTries(out)
  if (clash) out = clash
  const queue = typeof out.note === 'string' ? /^queue \((\d+)\)$/.exec(out.note) : null
  const checking = out.checking as Raw | undefined
  if (queue && (!isObj(checking) || checking.step !== 'queue')) out = isObj(checking) ? { ...out, checking: { ...checking, step: 'queue', place: Number(queue[1]) } } : { ...out, note: '' }
  return out === t ? null : out
}

/** An archived task (parsed JSON) without the stage engine's fields and conflict_tries, tokens as numbers made unsplit, string history made records; null when current. */
export function upgradeArchiveTask(t0: Raw): Raw | null {
  const stageless = withoutStages(t0) ?? t0
  const clash = withoutConflictTries(stageless) ?? stageless
  const split = migrateRunTokens(clash.runs)
  const history = migrateHistory(clash as Parameters<typeof migrateHistory>[0])
  const agents = migrateRunAgents({ ...clash, ...(split ? { runs: split } : {}) })
  if (clash === t0 && !split && !history && !agents) return null
  return { ...(agents ?? clash), ...(split && !agents ? { runs: split } : {}), ...(history ? { history } : {}) }
}

/** board.json's content (already joined with its parts, parsed) in today's shape: old settings renamed, every task upgraded. */
export function upgradeBoard(raw: unknown, root: string): unknown {
  if (!isObj(raw)) return raw
  const out: Raw = { ...raw }
  if (out.notify === 'sound') out.notify = soundNotify(isSoundSet(out.sound_set) ? out.sound_set : soundSetFor(root))
  delete out.sound_set
  if (out.mode === 'off') out.mode = 'paused'
  const into = typeof raw.target_branch === 'string' && raw.target_branch.trim() ? raw.target_branch.trim() : 'main'
  delete out.target_branch
  if (isObj(out.archived) && isNum(out.archived.tokens)) out.archived = { ...out.archived, tokens: cleanTokens({ unsplit: out.archived.tokens }) ?? {} }
  if (Array.isArray(out.tasks)) out.tasks = out.tasks.map(t => (isObj(t) ? upgradeTask(t, into) ?? t : t))
  return out
}

/** scouts.json's text with every usage total whose tokens were saved as one number made { unsplit: n }. Null when nothing needs it. */
export function upgradeScoutUsage(text: string | null | undefined): string | null {
  let raw: unknown
  try { raw = JSON.parse(text ?? '') } catch { return null }
  const u = isObj(raw) ? raw.usage : undefined
  if (!isObj(raw) || !isObj(u)) return null
  let changed = false
  const fix = (v: unknown): unknown => {
    if (!isObj(v) || typeof v.tokens !== 'number') return v
    changed = true
    return { ...v, tokens: cleanTokens({ unsplit: v.tokens }) ?? {} }
  }
  const usage = Object.fromEntries(Object.entries(u).map(([k, v]) => {
    const top = fix(v) as Raw
    const d = isObj(top) ? top.days : undefined
    return [k, isObj(d) ? { ...top, days: Object.fromEntries(Object.entries(d).map(([day, x]) => [day, fix(x)])) } : top]
  }))
  return changed ? JSON.stringify({ ...raw, usage }, null, 2) + '\n' : null
}

/** A scout's saved last report becomes its first run (ended at its last run, or `nowIso`), its report going to the file `report` names. Null when there is none. */
export function migratedScoutRun(mem: { last_run: string | null; last_report?: string } | undefined, report: (ended: string) => string, nowIso: string): { run: ScoutRunRecord; text: string } | null {
  if (!mem || mem.last_report === undefined) return null
  const text = mem.last_report.trim()
  const ended = mem.last_run && Number.isFinite(Date.parse(mem.last_run)) ? mem.last_run : nowIso
  const outcome: ScoutRunOutcome = isNothing(text) ? 'nothing' : 'found'
  const run: ScoutRunRecord = { started: null, ended, outcome, findings: outcome === 'found' ? countFindings(text) : 0 }
  if (text) run.report = report(ended)
  return { run, text }
}

/** One line of the count: how many, what, and whether the fix changes it (else it is only listed). */
export type OldRow = { n: number; text: string; fix: boolean }

/** What the doctor reads to count: every file already parsed. */
export type OldInput = {
  /** board.json joined with its parts files, parsed (null when it can't be read) */
  board: unknown
  /** the tasks of every archive file, parsed */
  archive: unknown[]
  /** scouts.json, parsed (null when missing) */
  scouts: unknown
  /** the names of the scouts that have a runs file */
  withRuns: ReadonlySet<string>
  /** whether .<name>/field-guide.md is there, and whether org-mem.md is */
  fieldGuide: boolean
  orgMem: boolean
  /** scout names that can't be a file name (the migration can't move their last report; only shown) */
  unsafeScouts?: readonly string[]
}

/** The count of everything in old shape, as lines; rows with n = 0 are left out. */
export function oldDataRows(i: OldInput): OldRow[] {
  const c = { unsplit: 0, numTok: 0, strHist: 0, badKind: 0, facts: 0, other: 0, attempts: 0, chk: 0, queue: 0, role: 0, stage: 0, origin: 0, openRun: 0, conflict: 0, rerun: 0, noInto: 0 }
  const task = (t: Raw, board: boolean) => {
    const runs = (Array.isArray(t.runs) ? t.runs : []).filter(isObj) as Raw[]
    for (const r of runs) {
      const tok = r.tokens
      if (isNum(tok)) c.numTok++
      else if (isObj(tok) && 'unsplit' in tok) c.unsplit++
    }
    if (hasOldAgents(t)) c.chk++
    if (withoutStages(t)) c.stage++
    if (withoutConflictTries(t)) c.conflict++
    for (const e of Array.isArray(t.history) ? t.history : []) {
      if (typeof e === 'string' || !isObj(e) || typeof e.text !== 'string') c.strHist++
      else if (!isHistoryKind(e.kind)) c.badKind++
      else if (e.kind === 'other') c.other++
      else if (lacksFacts(e as unknown as SymccHistoryEntry)) c.facts++
    }
    if (!board) return
    if (isNum(t.attempts) && Array.isArray(t.runs) && t.attempts !== t.runs.length) c.attempts++
    if (typeof t.note === 'string' && /^queue \(\d+\)$/.test(t.note)) c.queue++
    if (typeof t.role === 'string' && OLD_ROLES[t.role.trim().toLowerCase()]) c.role++
    if (!('origin' in t)) c.origin++
    if (!(typeof t.merge_into === 'string' && t.merge_into.trim())) c.noInto++
    if ('test_rerun' in t || 'rerun_minutes' in t) c.rerun++
    const rs = Array.isArray(t.runs) ? t.runs : []
    if (rs.some((r, k) => isObj(r) && typeof r.started === 'string' && !r.ended && !(k === rs.length - 1 && t.status === 'doing'))) c.openRun++
  }
  const b = isObj(i.board) ? i.board : {}
  for (const t of Array.isArray(b.tasks) ? b.tasks : []) if (isObj(t)) task(t, true)
  for (const t of i.archive) if (isObj(t)) task(t, false)
  const archTok = isObj(b.archived) && isNum(b.archived.tokens) ? 1 : 0
  let usage = 0
  const u = isObj(i.scouts) ? i.scouts.usage : undefined
  if (isObj(u)) for (const v of Object.values(u)) if (isObj(v)) usage += (typeof v.tokens === 'number' ? 1 : 0) + (isObj(v.days) ? Object.values(v.days).filter(x => isObj(x) && typeof x.tokens === 'number').length : 0)
  const memory = isObj(i.scouts) && isObj(i.scouts.scouts) ? i.scouts.scouts : {}
  const lastReport = Object.entries(memory).filter(([name, v]) => isObj(v) && typeof v.last_report === 'string' && !i.withRuns.has(name) && !(i.unsafeScouts ?? []).includes(name)).length
  const unsafe = (i.unsafeScouts ?? []).filter(name => isObj(memory[name]) && typeof memory[name].last_report === 'string')
  const settings = (b.mode === 'off' ? 1 : 0) + (b.notify === 'sound' || 'sound_set' in b ? 1 : 0) + ('target_branch' in b ? 1 : 0)
  const rows: OldRow[] = [
    { n: c.unsplit, text: 'tries with `unsplit` tokens (counts saved before the kinds were kept apart; shown as they are)', fix: false },
    { n: c.numTok, text: 'tries with tokens saved as one number', fix: true },
    { n: archTok, text: 'archived totals with tokens saved as one number', fix: true },
    { n: usage, text: 'scout usage totals with tokens saved as one number', fix: true },
    { n: c.strHist, text: 'history entries that are plain strings or not records', fix: true },
    { n: c.badKind, text: 'history entries with a kind symcc does not know', fix: true },
    { n: c.facts, text: 'history entries without their facts (try, step, result, reason ...)', fix: true },
    { n: c.other, text: 'history entries of kind `other` (shown as they are)', fix: false },
    { n: c.attempts, text: 'tasks where attempts is not the number of tries (shown as they are)', fix: false },
    { n: c.chk, text: 'tasks whose tries keep tokens, cost or agent ids outside their agent entries (agent, checker, tokens, checker_tokens, cost, checkers)', fix: true },
    { n: c.queue, text: 'tasks whose note is "queue (n)"', fix: true },
    { n: c.role, text: 'tasks with an old role (tests, backend, frontend)', fix: true },
    { n: c.stage, text: 'tasks with the removed stage engine\'s fields', fix: true },
    { n: c.origin, text: 'tasks with no origin', fix: true },
    { n: c.noInto, text: 'tasks with no merge_into', fix: true },
    { n: c.openRun, text: 'tasks with a try left open', fix: true },
    { n: c.rerun, text: 'tasks with test_rerun / rerun_minutes fields', fix: true },
    { n: c.conflict, text: 'tasks with a conflict_tries field', fix: true },
    { n: settings, text: 'old board settings (mode off, notify sound / sound_set, target_branch)', fix: true },
    { n: lastReport, text: 'scouts whose last report is not yet in a runs file', fix: true },
    { n: unsafe.length, text: `scouts whose name can't be a file name; rename them (${unsafe.join(', ')})`, fix: false },
    { n: i.fieldGuide && !i.orgMem ? 1 : 0, text: 'field-guide.md not yet moved to org-mem.md', fix: true },
  ]
  return rows.filter(r => r.n > 0)
}
