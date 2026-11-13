// Opening the board panel, and choosing what it shows.
import { boardTitle } from '../../board'
import { type $, S, updateOpened, updateScoutOpen, updateTab } from '../state'

/** The board panel's views: its tabs. */
export type PaneTab = 'tasks' | 'scouts' | 'settings'

/**
 * Sets what the board panel shows: task `task` opened ('' = the list). With `which`, it also
 * switches to that view ('tasks', 'scouts' or 'settings') with no scout opened; without, the view stays.
 */
export async function resetPane($: $, which?: PaneTab, task = '') {
  await updateOpened($, () => task)
  if (!which) return
  await updateScoutOpen($, () => '')
  await updateTab($, () => which)
}

/**
 * Opens the board panel (see resetPane for `tab` and `task`). `focus` (default on) moves the
 * cursor into it and lets Esc close it; `quiet` ignores errors (the panel then just isn't shown).
 */
export async function openPane($: $, o: { tab?: PaneTab; task?: string; focus?: boolean; quiet?: boolean } = {}) {
  const go = async () => {
    await resetPane($, o.tab, o.task)
    return $.ui.open(paneArgs(o.focus !== false))
  }
  return o.quiet ? go().catch(() => undefined) : go()
}

/** What $.ui.open gets for the board panel; `focus` asks for the keyboard and lets Esc reach ui.close. */
const paneArgs = (focus: boolean) => ({ id: S.N.pane, title: boardTitle(S.root, S.N.name), ...(focus ? { focus: true as const, closeOnEscape: true as const } : {}) })

/**
 * Asks for the keyboard back after an Esc the panel kept open. Claude Code always hands the keys to its
 * prompt on Esc (from a text box, a button or a pick list) before the panel hears of it, and a plugin
 * can't stop that; so the panel asks for them again, at once and once more a moment later in case the
 * prompt took them after. Claude Code says no while the prompt holds text: the keys then stay there.
 */
export function takeKeysBack($: $) {
  const ask = () => void $.ui.open(paneArgs(true)).catch(() => undefined)
  ask()
  $.clock.after(50, ask)
}
