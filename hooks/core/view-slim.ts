// Keeping the published board view under Claude Code's 4 MB limit on one plugin value (the panel stores the view
// through slimView; the app measures the same trimmed view for its size warning).
import type { SymccView } from '../../types'
import { viewTask, viewStubFilled } from './board-parts'
import { isFinished } from './board-file'

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

/** How far slimView had to go: 0 slimmed old finished tasks, 1 slimmed all finished, 2 left out archive totals, 3 left out tasks, 4 cut texts. */
export type SlimStep = 0 | 1 | 2 | 3 | 4
/** The warning text when trimming went past slimming finished tasks (step 2 or more), else ''. */
export const trimNote = (step: SlimStep, left: number) =>
  step < 2 ? '' : step === 2 ? 'the board view was trimmed to fit the 4 MB limit: archive totals left out of the panel' : `the board view was trimmed to fit the 4 MB limit: ${left} old task${left === 1 ? '' : 's'} left out of the panel`

/**
 * The view as the panel keeps it, under Claude Code's 4 MB limit on one value. Steps, each only when the view is
 * still over VIEW_TARGET_CHARS: slim done or dropped tasks changed more than VIEW_WHOLE_MS ago (viewTask: no history,
 * details or long parts; their pages then show them empty); slim every finished task; leave out the archive totals;
 * drop the oldest finished tasks (their done ids go into archived_done, so waiting tasks still see them done); and
 * only last cut long texts (open tasks stay whole as long as possible). Never throws, never gives back a view over
 * the limit unless open tasks alone are that big. `step` says how far it went, `left` how many tasks it left out.
 */
export function slimViewStep(v: SymccView, nowMs = Date.now()): { view: SymccView; step: SlimStep; left: number } {
  const slim = (old: (t: SymccView['tasks'][number]) => boolean) => ({ ...v, tasks: (v.tasks ?? []).map(t => (isFinished(t) && old(t) ? viewStubFilled(viewTask(t)) : t)) })
  const ok = (x: SymccView) => size(x) <= VIEW_TARGET_CHARS
  let cur = slim(t => nowMs - Date.parse(t.updated_at ?? '') > VIEW_WHOLE_MS || !t.updated_at)
  if (ok(cur)) return { view: cur, step: 0, left: 0 }
  cur = slim(() => true)
  if (ok(cur)) return { view: cur, step: 1, left: 0 }
  const { archived: _a, ...rest } = cur as SymccView & { archived?: unknown }
  cur = rest as SymccView
  if (ok(cur)) return { view: cur, step: 2, left: 0 }
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
  return ok(cur) ? { view: cur, step: 3, left: gone.size } : { view: cutTexts(cur) as SymccView, step: 4, left: gone.size }
}

/** The view as the panel keeps it (see slimViewStep). */
export const slimView = (v: SymccView, nowMs = Date.now()): SymccView => slimViewStep(v, nowMs).view
