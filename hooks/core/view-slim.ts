// Keeping the published board view under Claude Code's 4 MB limit on one plugin value (the panel stores the view
// through slimView; the app measures the same trimmed view for its size warning).
import type { SymccView } from '../../types'
import { viewTask, viewStubFilled } from './board-parts'

/** Claude Code refuses a plugin value over this many characters (4 MB). */
export const VIEW_MAX_CHARS = 4 * 1024 * 1024
/** A done or dropped task changed within this long is kept whole in the view; older ones are slimmed (viewTask). */
export const VIEW_WHOLE_MS = 2 * 24 * 60 * 60_000
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

/**
 * The view as the panel keeps it, under Claude Code's 4 MB limit on one value. Steps, each only when the view is
 * still over VIEW_TARGET_CHARS: slim done or dropped tasks changed more than VIEW_WHOLE_MS ago (viewTask: no history,
 * details or long parts; their pages then show them empty); slim every finished task; leave out the archive copies;
 * drop the oldest finished tasks; and only last cut long texts (open tasks stay whole as long as possible). Never
 * throws, never gives back a view over the limit unless open tasks alone are that big.
 */
export function slimView(v: SymccView, nowMs = Date.now()): SymccView {
  const finished = (t: SymccView['tasks'][number]) => t.status === 'done' || t.status === 'dropped'
  const slim = (old: (t: SymccView['tasks'][number]) => boolean) => ({ ...v, tasks: (v.tasks ?? []).map(t => (finished(t) && old(t) ? viewStubFilled(viewTask(t)) : t)) })
  const ok = (x: SymccView) => size(x) <= VIEW_TARGET_CHARS
  let cur = slim(t => nowMs - Date.parse(t.updated_at ?? '') > VIEW_WHOLE_MS || !t.updated_at)
  if (ok(cur)) return cur
  cur = slim(() => true)
  if (ok(cur)) return cur
  const { archived: _a, archived_done: _d, ...rest } = cur as SymccView & { archived?: unknown; archived_done?: unknown }
  cur = rest as SymccView
  if (ok(cur)) return cur
  // oldest finished tasks first
  const order = cur.tasks
    .map((t, i) => ({ t, i }))
    .filter(x => finished(x.t))
    .sort((x, y) => Date.parse(x.t.updated_at ?? '') - Date.parse(y.t.updated_at ?? '') || x.i - y.i)
  const gone = new Set<number>()
  let total = size(cur)
  for (const { t, i } of order) {
    if (total <= VIEW_TARGET_CHARS) break
    total -= size(t) + 1
    gone.add(i)
  }
  cur = { ...cur, tasks: cur.tasks.filter((_t, i) => !gone.has(i)) }
  return ok(cur) ? cur : (cutTexts(cur) as SymccView)
}
