// Where a task came from (owner, scout, worker, lead) and the evidence for it.
import type { SymccOrigin } from '../../types'
import { type Board, find, normId } from './board-file'
import { clean, ellipsis, isObj, squash } from './text'
import { agentSafeName, scoutAgentName } from './agents'

/** Who can start a task: the owner, a scout's report, a worker's report, or the lead's own idea. */
export const ORIGIN_BY = ['owner', 'scout', 'worker', 'lead'] as const
export const ORIGIN_HOW = ['split', 'follow-up'] as const

/** What the caller says about where a task came from (as the add tool gets it; nothing checked yet). */
export type OriginInput = { by?: unknown; scout?: unknown; task?: unknown; how?: unknown; request?: unknown; why?: unknown; evidence?: unknown }

/**
 * Checks and cleans where a task came from. Throws a clear error when `why` is empty, `by` is not
 * one of ORIGIN_BY, a scout task names no scout, a worker task names no task, or the named task is
 * not on board `b`. Without `by` it is worked out: a scout named → scout, a task → worker,
 * the owner's words → owner, else lead.
 */
export function makeOrigin(o: OriginInput | undefined, now: string, b?: Board): SymccOrigin {
  const why = clean(o?.why, 300).replace(/\s+/g, ' ')
  if (!why) throw new Error('a task needs a "why": one line saying why this task exists')
  const scout = clean(o?.scout, 64)
  const task = o?.task === undefined || o?.task === null || String(o.task).trim() === '' ? '' : normId(clean(o.task, 32))
  const request = clean(o?.request, 1000)
  const rawBy = clean(o?.by, 16).toLowerCase()
  if (rawBy && !(ORIGIN_BY as readonly string[]).includes(rawBy)) throw new Error(`origin_by must be one of ${ORIGIN_BY.join(', ')} (got "${rawBy}")`)
  const by = (rawBy || (scout ? 'scout' : task ? 'worker' : request ? 'owner' : 'lead')) as SymccOrigin['by']
  if (by === 'scout' && !scout) throw new Error('origin_by is scout: name the scout whose report led to this task (scout)')
  if (by === 'worker' && !task) throw new Error('origin_by is worker: name the task whose worker report led to this task (from_task)')
  if (task && b && !find(b, task)) throw new Error(`from_task ${task} is not on the board`)
  const rawHow = clean(o?.how, 16).toLowerCase()
  if (rawHow && !(ORIGIN_HOW as readonly string[]).includes(rawHow)) throw new Error(`how must be ${ORIGIN_HOW.join(' or ')} (got "${rawHow}")`)
  if (rawHow && !task) throw new Error(`a ${rawHow} needs the task it comes from (from_task)`)
  const evidence = clean(o?.evidence, 600)
  return {
    by,
    ...(scout ? { scout } : {}),
    ...(task ? { task } : {}),
    ...(rawHow ? { how: rawHow as SymccOrigin['how'] } : {}),
    ...(request ? { request } : {}),
    why,
    ...(evidence ? { evidence } : {}),
    at: now,
  }
}

/**
 * A scout's name from what the lead gave. A name of one of the `known` scouts is kept; a scout's agent name (what its
 * message comes from, see scoutAgentName: "symcc-scout-bugs", with "." made "-" and cut to 64 characters) becomes the
 * name of the known scout it belongs to ("bugs", "deps.v2" for "symcc-scout-deps-v2"). Any other agent name loses its
 * "<plugin>-scout-" start (a scout no longer known); other text is only trimmed.
 */
export function scoutNameOf(raw: unknown, plugin: string, known: readonly string[] = []): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s || known.includes(s)) return s
  const match = [...known].sort().find(k => scoutAgentName(plugin, k) === s)
  if (match) return match
  const prefix = `${agentSafeName(plugin)}-scout-`
  return s.startsWith(prefix) && s.length > prefix.length ? s.slice(prefix.length) : s
}

/** What the add tool says for a scout name that is not one of the `known` scouts. */
export function unknownScoutText(name: string, known: string[]): string {
  const list = [...new Set(known)].sort()
  return `there is no scout "${name}": give the scout's name (as on the board, not its agent name)${list.length ? `; the scouts are: ${list.join(', ')}` : '; there are no scouts'}`
}

/**
 * Tasks whose origin names a scout by its agent name ("symcc-scout-bugs", from before T-712), with the scout's own
 * name instead ("bugs", matched through the `known` scouts, see scoutNameOf); `renamed` lists each changed task (its id, the scout and when it was made). Others are kept as they are.
 */
export function renameScoutOrigins<T extends { id: string; created_at?: string; origin?: unknown }>(tasks: T[], plugin: string, known: readonly string[] = []): { tasks: T[]; renamed: { id: string; scout: string; at: string }[] } {
  const renamed: { id: string; scout: string; at: string }[] = []
  const out = tasks.map(t => {
    const o = t.origin as Record<string, unknown> | null | undefined
    if (!o || typeof o !== 'object' || o.by !== 'scout' || typeof o.scout !== 'string') return t
    const scout = scoutNameOf(o.scout, plugin, known)
    if (scout === o.scout) return t
    renamed.push({ id: t.id, scout, at: String(t.created_at || o.at || '') })
    return { ...t, origin: { ...o, scout } }
  })
  return { tasks: out, renamed }
}

/** A task's origin if it has a usable one (a hand-edited one may be broken or missing). */
export const originOf = (t: { origin?: unknown }): SymccOrigin | undefined => {
  const o = t.origin as Record<string, unknown> | null | undefined
  if (!isObj(o) || !(ORIGIN_BY as readonly unknown[]).includes(o.by)) return undefined
  // keep only text fields that really are text, so one hand-edited task can't break the board
  const text = (k: string) => (typeof o[k] === 'string' ? { [k]: o[k] as string } : {})
  return {
    by: o.by as SymccOrigin['by'],
    ...text('scout'),
    ...text('task'),
    ...((ORIGIN_HOW as readonly unknown[]).includes(o.how) ? { how: o.how as SymccOrigin['how'] } : {}),
    ...text('request'),
    why: typeof o.why === 'string' ? o.why : '',
    ...text('evidence'),
    at: typeof o.at === 'string' ? o.at : '',
  }
}

/** Who made a task, in words: "the owner", "scout bugs", "the worker of T-3", "the lead"; "unknown" without a usable origin. */
export function originWho(t: { origin?: unknown }): string {
  const o = originOf(t)
  if (!o) return 'unknown'
  if (o.by === 'owner') return 'the owner'
  if (o.by === 'scout') return `scout ${o.scout || '?'}`
  if (o.by === 'worker') return `the worker of ${o.task || '?'}`
  return 'the lead'
}

/** The first history line of a new task. */
export const createdLine = (o: SymccOrigin) => `created by ${originWho({ origin: o })} because ${o.why}`

/**
 * The small one-width mark in front of a "from:" line, by who made the task: ♟ owner, ⌕ scout, ▸ worker report,
 * ◆ lead, ↳ split or follow-up (for a worker or lead task; an owner or scout task keeps its own mark). '' when unknown.
 */
export const ORIGIN_MARK = { owner: '♟', scout: '⌕', worker: '▸', lead: '◆', from: '↳' } as const

/**
 * The short "from:" text for the board and the task detail, after its mark (ORIGIN_MARK) and one space, e.g.
 * '♟ from: owner — “add a search command…”', '⌕ from: scout bugs', '↳ from: T-12 (split)';
 * 'from: unknown' (no mark) when its origin is missing or broken (hand-edited).
 */
export function fromText(t: { origin?: unknown }, quote = 60): string {
  const o = originOf(t)
  if (!o) return 'from: unknown'
  return `${originMark(o)} ${fromWords(o, quote)}`
}

/** The ORIGIN_MARK for a usable origin: its maker's mark, or ↳ for a worker or lead split or follow-up of a task. */
export const originMark = (o: SymccOrigin): string => (o.by === 'owner' || o.by === 'scout' || !o.how || !o.task ? ORIGIN_MARK[o.by] : ORIGIN_MARK.from)

function fromWords(o: SymccOrigin, quote: number): string {
  const how = o.how ?? (o.by === 'worker' ? 'worker report' : '')
  const taskPart = o.task ? `${o.task}${how ? ` (${how})` : ''}` : ''
  if (o.by === 'owner') {
    const r = squash(o.request ?? '')
    const q = r ? ` — “${ellipsis(r, quote)}”` : ''
    return `from: owner${q}${taskPart ? `, ${taskPart}` : ''}`
  }
  if (o.by === 'scout') return `from: scout ${o.scout || '?'}${taskPart ? `, ${taskPart}` : ''}`
  if (o.by === 'lead' && o.task && !o.how) return `from: lead, about ${o.task}`
  if (taskPart) return `from: ${taskPart}`
  return 'from: lead'
}

/**
 * What the plugin itself saw reach the lead in this session (kept in memory, not on the board):
 * the owner's last typed prompt, and when each scout's and each task's worker report was delivered.
 */
export type Heard = { owner?: { text: string; at: string }; scouts: Record<string, string>; workers: Record<string, string>; last?: { what: string; at: string } }

export const emptyHeard = (): Heard => ({ scouts: {}, workers: {} })

/** An ISO time as "2026-11-12 14:05 UTC" (the text itself when it is not a time). */
export const utcTime = (iso: string) => (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(iso) ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : iso)
const cutQuote = (s: string, n: number) => ellipsis(squash(s), n)

/**
 * The plugin's own short link to the evidence for a new task, next to what the lead said:
 * the last owner prompt (and whether the lead's quote is really in it), "scout <name> report at <time>",
 * "<task> worker report at <time>", or a plain note that nothing like it was seen in this session.
 */
export function evidenceText(o: Pick<SymccOrigin, 'by' | 'scout' | 'task' | 'request'>, h: Heard): string {
  const ownerLine = h.owner ? `last owner prompt at ${utcTime(h.owner.at)}: “${cutQuote(h.owner.text, 200)}”` : ''
  if (o.by === 'owner') {
    if (!h.owner) return 'no owner prompt was seen by the plugin in this session'
    const off = o.request && !squash(h.owner.text).toLowerCase().includes(squash(o.request).toLowerCase())
    return `${ownerLine}${off ? ' (the quoted request is not word for word in it)' : ''}`
  }
  if (o.by === 'scout') {
    const at = o.scout ? h.scouts[o.scout] : undefined
    return at ? `scout ${o.scout} report at ${utcTime(at)}` : `no report from scout ${o.scout ?? '?'} reached the lead in this session`
  }
  if (o.by === 'worker') {
    const id = o.task ? normId(o.task) : ''
    const at = id ? h.workers[id] : undefined
    return at ? `${id} worker report at ${utcTime(at)}` : `no worker report from ${id || '?'} reached the lead in this session`
  }
  const parts = [ownerLine, h.last ? `last report: ${h.last.what} at ${utcTime(h.last.at)}` : ''].filter(Boolean)
  return parts.length ? parts.join('; ') : 'nothing from the owner, a scout or a worker was seen in this session'
}
