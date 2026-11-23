// Keeping the published board view under Claude Code's 4 MB limit on one plugin value (the panel stores the view
// through slimView; the app measures the same trimmed view for its size warning).
import type { SymccView } from '../../types'
import { viewTask, viewStubFilled, VIEW_SEARCH_KEY, searchWordsOf, viewSearchWords } from './board-parts'
import { isFinished } from './board-file'
import { isObj } from './text'

/** Claude Code refuses a plugin value over this many characters (4 MB). */
export const VIEW_MAX_CHARS = 4 * 1024 * 1024
/** The view is kept under this many characters (a share of the limit, as Claude Code may count differently). */
export const VIEW_TARGET_CHARS = Math.floor(VIEW_MAX_CHARS * 0.7)
/** A long text in a view task is cut to this many characters in the last trimming step. */
const CUT_TEXT = 1500

const size = (v: unknown) => JSON.stringify(v).length

/** `x` with every string over CUT_TEXT characters cut (deep), and every array of more than 20 history lines cut to the last 20. */
function cutTexts(x: unknown): unknown {
  if (typeof x === 'string') return x.length > CUT_TEXT ? x.slice(0, CUT_TEXT) : x
  if (Array.isArray(x)) return x.map(cutTexts)
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, k === 'history' && Array.isArray(val) && val.length > 20 ? val.slice(-20).map(cutTexts) : cutTexts(val)]))
  return x
}

/** How far slimView had to go: 0 slimmed the finished tasks, 1 left out archive totals, 2 left out tasks, 3 cut texts. */
export type SlimStep = 0 | 1 | 2 | 3
/** The warning text when trimming went past slimming finished tasks (step 1 or more), else ''. */
export const trimNote = (step: SlimStep, left: number) =>
  step < 1 ? '' : step === 1 ?'the board view was trimmed to fit the 4 MB limit: archive totals left out of the panel' : `the board view was trimmed to fit the 4 MB limit: ${left} old task${left === 1 ? '' : 's'} left out of the panel`

/**
 * The view as the panel keeps it, under Claude Code's 4 MB limit on one value. Every done or dropped task is always
 * slimmed (T-891, viewTask: no history, details or long parts; its page reads them back from its parts file,
 * taskWithParts; its tries and history marks stay, for the lists, the Live tab and ▍Today; one changed in the last 2
 * days also keeps the words of its details and request, for the board search, slimFinished). Then, each only when the
 * view is still over VIEW_TARGET_CHARS: leave out the archive totals; drop the oldest finished tasks (their done ids
 * go into archived_done, so waiting tasks still see them done); and only last cut long texts (open tasks stay whole
 * as long as possible). Never throws, never gives back a view over the limit unless open tasks alone are that big.
 * `step` says how far it went, `left` how many tasks it left out.
 */
export function slimViewStep(v: SymccView, nowMs: number = Date.now()): { view: SymccView; step: SlimStep; left: number } {
  const ok = (x: SymccView) => size(x) <= VIEW_TARGET_CHARS
  let cur: SymccView = { ...v, tasks: (v.tasks ?? []).map(t => (isFinished(t) ? slimFinished(t, nowMs) : t)) }
  if (ok(cur)) return { view: cur, step: 0, left: 0 }
  // too big: the search words go first (the search then works as for old finished tasks)
  cur = { ...cur, tasks: cur.tasks.map(t => {
    if (!(VIEW_SEARCH_KEY in t)) return t
    const x = { ...t } as Record<string, unknown>
    delete x[VIEW_SEARCH_KEY]
    return x as unknown as typeof t
  }) }
  if (ok(cur)) return { view: cur, step: 0, left: 0 }
  const { archived: _a, ...rest } = cur as SymccView & { archived?: unknown }
  cur = rest as SymccView
  if (ok(cur)) return { view: cur, step: 1, left: 0 }
  // oldest finished tasks first
  const order = cur.tasks
    .map((t, i) => ({ t, i }))
    .filter(x => isFinished(x.t))
    .sort((x, y) => Date.parse(x.t.updated_at ?? '') - Date.parse(y.t.updated_at ?? '') || x.i - y.i)
  const gone = new Set<number>()
  let total = size(cur)
  for (const { t, i } of order) {
    if (total <= VIEW_TARGET_CHARS) break
    total -= size(t) + 1 - (t.status === 'done' ? size(t.id) + 1 : 0)
    gone.add(i)
  }
  const doneIds = cur.tasks.filter((t, i) => gone.has(i) && t.status === 'done').map(t => t.id)
  const kept = [...new Set([...((cur as { archived_done?: string[] }).archived_done ?? []), ...doneIds])]
  cur = { ...cur, tasks: cur.tasks.filter((_t, i) => !gone.has(i)), ...(kept.length ? { archived_done: kept } : {}) } as SymccView
  return ok(cur) ? { view: cur, step: 2, left: gone.size } : { view: cutTexts(cur) as SymccView, step: 3, left: gone.size }
}

/** The view as the panel keeps it (see slimViewStep). */
export const slimView = (v: SymccView, nowMs: number = Date.now()): SymccView => slimViewStep(v, nowMs).view

/** Finished tasks changed within this long keep the words of their details and request for the board search. */
export const VIEW_SEARCH_MS = 2 * 24 * 60 * 60_000

/** Finished task `t` slimmed (viewTask); changed in the last VIEW_SEARCH_MS, it keeps its search words (VIEW_SEARCH_KEY),
 *  so the board search still finds it by words in its details or the owner's request (as before T-891). */
function slimFinished<T extends SymccView['tasks'][number]>(t: T, nowMs: number): T {
  const slim = viewStubFilled(viewTask(t)) as Record<string, unknown>
  const changed = Date.parse(t.updated_at || t.created_at || '')
  const fresh = Number.isFinite(changed) && nowMs - changed <= VIEW_SEARCH_MS
  const words = fresh ? searchWordsOf(t.details, isObj(t.origin) ? (t.origin as Record<string, unknown>).request : undefined) || viewSearchWords(t) : ''
  if (words) slim[VIEW_SEARCH_KEY] = words
  else delete slim[VIEW_SEARCH_KEY]
  return slim as T
}
