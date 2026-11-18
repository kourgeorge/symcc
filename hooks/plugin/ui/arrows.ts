// ↑ and ↓ on the board panel's lists (Tasks, Scouts, Settings, Roles): they move the focus to the row above or below,
// as Shift+Tab and Tab do, but only between the list's rows (never onto the tabs, the mode, search or Back buttons:
// those only by Tab). Claude Code turns the arrows into a scroll of the panel (`ui.scroll`) once the page is
// taller than the panel; pane.tsx and the footer in parts.tsx note what the page drew, and register.tsx hooks `ui.scroll` and `ui.focus`
// for the board panel and calls the two below.
// Claude Code keeps the focused element in view on its own, so the panel still scrolls as the focus moves.
import type { MatchedHook } from 'claude-code'
import type { KeyHint } from '../../board'
import { type $, S } from '../state'

type ScrollHook = MatchedHook<'ui.scroll', { component: 'Pane' }>
type FocusHook = MatchedHook<'ui.focus', { component: 'Pane' }>

/** What the board panel drew last: whether its key line says "↑↓ move", the keys of its list rows (`rows`, marked
 *  with `row` while the page draws), the rows among its Buttons in the order Tab walks them (`stops`, the ↑↓ stops),
 *  and the element that holds the focus. Tab still reaches every button; ↑↓ only the rows. */
export const arrows = { move: false, rows: new Set<string>(), stops: [] as string[], focused: undefined as string | undefined }

/** Marks a Button's key as a list row (a task or day row, a scout, a setting, a role), so ↑↓ stop on it; gives the key back. */
export const row = (key: string) => (arrows.rows.add(key), key)

/** The ↑↓ stops of a drawn page: its focus stops (in Tab order) that are list rows; the tabs, the mode, search and
 *  Back buttons are left to Tab and Shift+Tab. */
export const rowStops = (tree: unknown, rows: ReadonlySet<string>) => focusStops(tree).filter(k => rows.has(k))

/** True when a page's key hints say ↑↓ moves (not "move between boxes", not "scroll"). */
export const saysArrowsMove = (hints: readonly KeyHint[]) => hints.some(h => h.key === '↑↓' && h.word === 'move')

/** The keys of the elements Tab stops on in a drawn tree, in order; a Box drawn `display="none"` (the hidden hotkey
 *  Buttons of the tab row) is left out. */
export function focusStops(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(focusStops)
  if (!node || typeof node !== 'object') return []
  const n = node as { type?: unknown; key?: unknown; children?: unknown; props?: { key?: unknown; display?: unknown; children?: unknown } }
  const p = n.props ?? {}
  if (n.type === 'Box' && p.display === 'none') return []
  if (n.type === 'Button' || n.type === 'Input' || n.type === 'Select') {
    const key = p.key ?? n.key
    return typeof key === 'string' ? [key] : []
  }
  return focusStops(n.children ?? p.children)
}

/** True only when a Settings group heading is known to have the focus (its key line then says "Enter open/close");
 *  a focus on a tab, on any other button, or not known yet is not a heading, so the page keeps its normal hint. */
export const headingFocused = (focused: string | undefined) => focused?.startsWith('group:') ?? false

/** Notes that the focus moved to `to`; on the Settings page (its rows include group headings) a move between a
 *  heading and any other element redraws the page, so its key line follows the focus. */
function focusMoved($: $, to: string | undefined) {
  const from = arrows.focused
  arrows.focused = to
  if (arrows.stops.some(k => k.startsWith('group:')) && headingFocused(from) !== headingFocused(to)) $.ui.invalidate('ui.render')
}

/** `ui.focus` on the board panel: remembers which element holds the focus once it moved. */
export async function noteFocus($: $, e: Parameters<FocusHook>[1], next: Parameters<FocusHook>[2]) {
  if (e.requestId !== S.N.pane) return next(e)
  const r = await next(e)
  if (!r.deny) focusMoved($, e.element)
  return r
}

/** Where ↑ (`by` -1) or ↓ (`by` 1) takes the focus from `focused` among `stops` (the list rows); undefined (scroll
 *  instead) when the focus is not on one of them, or already on the first (↑) or last (↓). */
export function arrowTarget(stops: readonly string[], focused: string | undefined, by: number): string | undefined {
  const at = focused === undefined ? -1 : stops.indexOf(focused)
  return at < 0 || Math.abs(by) !== 1 ? undefined : stops[at + by]
}

/** True for a `ui.scroll` that is the person's ↑ or ↓ key: one row, not the wheel (which has a pointer), not a page key. */
export const isArrow = (e: { origin: { kind: string }; pointer?: unknown; by: number }) => e.origin.kind === 'person' && !e.pointer && Math.abs(e.by) === 1

/** `ui.scroll` on the board panel: a person's ↑ or ↓ on a list page moves the focus to the row above or below
 *  instead of scrolling. At the first or last row (or off the rows, or with no known focus) it scrolls as before, so
 *  the banner and the key line can still be reached and the tab, mode and search buttons are only reached by Tab;
 *  so it does when Claude Code refuses the move. */
export async function arrowMove($: $, e: Parameters<ScrollHook>[1], next: Parameters<ScrollHook>[2]) {
  if (e.requestId !== S.N.pane || !arrows.move || !isArrow(e)) return next(e)
  const to = arrowTarget(arrows.stops, arrows.focused, e.by)
  if (to === undefined) return next(e)
  const r = await $.ui.focus({ requestId: S.N.pane, key: to }).catch((err: Error) => ({ deny: err.message }))
  if (r.deny) return next(e)
  focusMoved($, to)
  return {}
}
