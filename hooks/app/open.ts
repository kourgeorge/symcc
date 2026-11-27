// Opening the board panel, and choosing what it shows. Host-free: a host with no panel (features.panel off) opens
// nothing. What only Claude Code's panel needs (taking the keys back after an Esc) is in claude/ui/open.ts.
import { boardTitle } from '../board'
import { recheckGit, allGitReady } from './git'
import { S, updateOpened, updateScoutOpen, updateTab } from './state'
import { resetRoleView } from './roles'
import { resetKindView } from './kinds'
import { resetOrgMemView } from './org-mem'
import type { Host } from '../host'

/** The board panel's views: its tabs. */
export type PaneTab = 'tasks' | 'live' | 'scouts' | 'settings'

/**
 * Sets what the board panel shows: task `task` opened ('' = the list). With `which`, it also
 * switches to that view ('tasks', 'live', 'scouts' or 'settings') with no scout (so no scout run) and no role opened; without, the view stays.
 */
export async function resetPane($: Host, which?: PaneTab, task = '') {
  await updateOpened($, () => task)
  if (!which) return
  resetRoleView()
  resetKindView()
  resetOrgMemView()
  await updateScoutOpen($, () => '')
  await updateTab($, () => which)
}

/**
 * Opens the board panel (see resetPane for `tab` and `task`). `focus` (default on) moves the
 * cursor into it and lets Esc close it; `quiet` ignores errors (the panel then just isn't shown).
 * A host with no panel (features.panel off) opens nothing: it answers isPlaced false, so the callers answer in text.
 */
export async function openPane($: Host, o: { tab?: PaneTab; task?: string; focus?: boolean; quiet?: boolean } = {}) {
  if (!$.features.panel) return { isPlaced: false }
  const go = async () => {
    // the notice is fresh when the panel opens; not while git is missing (T-887: the Mac's git stand-in opens Apple's install pop-up)
    if (!S.fresh && !allGitReady() && S.gitState !== 'no-git') await recheckGit($).catch(() => undefined)
    await resetPane($, o.tab, o.task)
    return $.ui.open(paneArgs(o.focus !== false))
  }
  return o.quiet ? go().catch(() => undefined) : go()
}

/** What $.ui.open gets for the board panel; `focus` asks for the keyboard and lets Esc reach ui.close. A panel
 *  opened without it (the one that opens by itself at the start) has no closeOnEscape, so Esc there never
 *  reaches ui.close: it only gives the keys to the prompt (docs/research/esc-in-panels.md). */
export const paneArgs = (focus: boolean) => ({ id: S.N.pane, title: boardTitle(S.root, S.N.name, S.version), ...(focus ? { focus: true as const, closeOnEscape: true as const } : {}) })
