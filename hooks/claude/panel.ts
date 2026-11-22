// The board panel's values, which only Claude Code's `$` holds (claude/host.ts carries them as the Host's ui.panel).
// Claude Code reads which values a plugin keeps from its code before it runs, so their owner must be written out here
// as text. It must be the plugin's name: on a rename, change it in these four lines and in types/claude.d.ts too.
// The loader lets read and update take only an atom written in the same file, so they are only reached through
// panelValues below.
import { type EngineInterface, atom, read, update } from 'claude-code'
import type { SymccView } from '../../types'
import type { PanelValues } from '../host'
import { viewTask, viewStubFilled } from '../core/board-parts'

/** Claude Code's `$`, as one hook hands it to the plugin. */
export type $ = EngineInterface

/** which task the board panel has open; '' = the list */
const opened = atom({ plugin: 'symcc', key: 'opened' } as const, '')
/** which view the board panel shows: 'live' (the start), 'tasks', 'scouts' or 'settings'; kept while the panel is open */
const tab = atom({ plugin: 'symcc', key: 'tab' } as const, 'live')
/** which scout the Scouts view has open; '' = the list */
const scoutOpen = atom({ plugin: 'symcc', key: 'scout' } as const, '')
/** Claude Code refuses a plugin value over this many characters (4 MB). */
export const VIEW_MAX_CHARS = 4 * 1024 * 1024
/** A done or dropped task changed within this long is kept whole in the view; older ones are slimmed (viewTask). */
export const VIEW_WHOLE_MS = 2 * 24 * 60 * 60_000

/** The view is kept under this many characters (a share of the limit, as Claude Code may count differently). */
export const VIEW_TARGET_CHARS = Math.floor(VIEW_MAX_CHARS * 0.7)
/** A long text in a view task is cut to this many characters in the last trimming steps. */
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
 * details or long parts; their pages then show them empty); slim every finished task; cut long texts everywhere;
 * leave out the archive copies; drop the oldest finished tasks. Never throws, never gives back a view over the limit
 * unless open tasks alone are that big.
 */
export function slimView(v: SymccView, nowMs = Date.now()): SymccView {
  const finished = (t: SymccView['tasks'][number]) => t.status === 'done' || t.status === 'dropped'
  const slim = (old: (t: SymccView['tasks'][number]) => boolean) => ({ ...v, tasks: (v.tasks ?? []).map(t => (finished(t) && old(t) ? viewStubFilled(viewTask(t)) : t)) })
  const ok = (x: SymccView) => size(x) <= VIEW_TARGET_CHARS
  let cur = slim(t => nowMs - Date.parse(t.updated_at ?? '') > VIEW_WHOLE_MS || !t.updated_at)
  if (ok(cur)) return cur
  cur = slim(() => true)
  if (ok(cur)) return cur
  cur = cutTexts(cur) as SymccView
  if (ok(cur)) return cur
  const { archived: _a, archived_done: _d, ...rest } = cur as SymccView & { archived?: unknown; archived_done?: unknown }
  cur = rest as SymccView
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
  return { ...cur, tasks: cur.tasks.filter((_t, i) => !gone.has(i)) }
}

const view = atom({ plugin: 'symcc', key: 'view' } as const, { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] } as SymccView, { shape: 'view-1' })

/** The board panel's values through Claude Code's `$` (for claude/host.ts, and the panel's own render code in claude/ui/). */
export function panelValues($: $): PanelValues {
  return {
    readOpened: () => read($, opened),
    updateOpened: change => update($, opened, change),
    readTab: () => read($, tab),
    updateTab: change => update($, tab, change),
    readScoutOpen: () => read($, scoutOpen),
    updateScoutOpen: change => update($, scoutOpen, change),
    readView: () => read($, view),
    // a refused value (too big) must never fail a board change or a worker start: say nothing, the next publish tries again
    updateView: async change => {
      try {
        await update($, view, v => slimView(change(v)))
      } catch {
        // dropped on purpose, see above
      }
    },
  }
}
