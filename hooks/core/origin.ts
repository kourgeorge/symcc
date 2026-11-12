// Where a task came from (owner, scout, worker, lead) and the evidence for it.
import type { SymccOrigin } from '../../types'
import { type Board, find, normId } from './board-file'
import { clean, squash } from './text'

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

/** A task's origin if it has a usable one (old boards have none; a hand-edited one may be broken). */
export const originOf = (t: { origin?: unknown }): SymccOrigin | undefined => {
  const o = t.origin as Record<string, unknown> | null | undefined
  if (!o || typeof o !== 'object' || Array.isArray(o) || !(ORIGIN_BY as readonly unknown[]).includes(o.by)) return undefined
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

/** Who made a task, in words: "the owner", "scout bugs", "the worker of T-3", "the lead"; "unknown" without an origin. */
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
 * The short "from:" text for the board and the task detail, e.g. 'from: owner — “add a search command…”',
 * 'from: scout bugs', 'from: T-12 (split)'; 'from: unknown' for a task made before origins were kept.
 */
export function fromText(t: { origin?: unknown }, quote = 60): string {
  const o = originOf(t)
  if (!o) return 'from: unknown'
  const how = o.how ?? (o.by === 'worker' ? 'worker report' : '')
  const taskPart = o.task ? `${o.task}${how ? ` (${how})` : ''}` : ''
  if (o.by === 'owner') {
    const r = (o.request ?? '').replace(/\s+/g, ' ').trim()
    const q = r ? ` — “${r.length > quote ? `${r.slice(0, quote - 1).trimEnd()}…` : r}”` : ''
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
const cutQuote = (s: string, n: number) => (squash(s).length > n ? `${squash(s).slice(0, n - 1).trimEnd()}…` : squash(s))

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
