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
    return $.ui.open({ id: S.N.pane, title: boardTitle(S.root, S.N.name), ...(o.focus !== false ? { focus: true as const, closeOnEscape: true as const } : {}) })
  }
  return o.quiet ? go().catch(() => undefined) : go()
}
