// Esc in the board panel: one step back, the innermost first, when Claude Code sends the Esc to `ui.close`
// (origin person); paneClosing calls escBack there and keeps the panel open when it went back. Claude Code
// only does that for a panel opened with closeOnEscape, and the owner saw no step from the search box (see
// docs/research/esc-in-panels.md), so nothing in the panel needs Esc: every box and page has its own way out
// (Enter on an empty box, a Cancel or Back button, the search's [x] clear search). This is the extra.
import { cancelScoutEdit } from '../scouts'
import { S, openDays, changesCache } from '../state'
import { type $, panelValues } from '../../claude/panel'
import { resetPane, takeKeysBack } from './open'
import { claudeHost } from '../../claude/host'

/** What Esc does on the board panel; null: nothing left to go back from, the panel closes. */
export type EscStep =
  | 'cancel setting' // a setting's edit box or pick list
  | 'cancel scout edit' // a scout's edit page or the new scout name box
  | 'scouts list' // an opened scout goes back to the Scouts list
  | 'cancel role pick'
  | 'cancel reject'
  | 'close changes' // a task's changes: back to the task
  | 'cancel answer' // the "Your answer" box opened with Answer…
  | 'board list' // a task page, the Scouts list or Settings: back to the board list
  | 'clear search' // the board list's search: its box, or the filter kept
  | null

/** Where the panel is: its view ('scouts', 'settings', else the tasks), the opened task and scout ('' = none). */
export type PanePlace = { tab: string; opened: string; scout: string }

/** The step Esc takes from `at`, given the panel's open boxes in `s` (S, or a test's copy). */
export function escStep(at: PanePlace, s: Pick<typeof S, 'settingEdit' | 'settingPick' | 'draft' | 'naming' | 'rolePick' | 'rejecting' | 'diffOpen' | 'answering' | 'search'>): EscStep {
  if (at.tab === 'settings') return s.settingEdit || s.settingPick ? 'cancel setting' : 'board list'
  if (at.tab === 'scouts') return s.draft || s.naming ? 'cancel scout edit' : at.scout ? 'scouts list' : 'board list'
  if (at.opened) {
    if (s.rolePick) return 'cancel role pick'
    if (s.rejecting) return 'cancel reject'
    if (s.diffOpen) return 'close changes'
    if (s.answering === at.opened) return 'cancel answer'
    return 'board list'
  }
  return s.search ? 'clear search' : null
}

/** Takes the board panel one step back (see escStep) and says whether it did; false: the panel closes. */
export async function escBack($: $): Promise<boolean> {
  const step = escStep({ tab: await panelValues($).readTab(), opened: await panelValues($).readOpened(), scout: await panelValues($).readScoutOpen() }, S)
  if (!step) return false
  if (step === 'cancel scout edit') cancelScoutEdit(claudeHost($))
  else if (step === 'scouts list') await resetPane(claudeHost($), 'scouts')
  else if (step === 'board list') await resetPane(claudeHost($), 'tasks')
  else {
    if (step === 'cancel setting') (S.settingEdit = null), (S.settingPick = null)
    if (step === 'cancel role pick') S.rolePick = null
    if (step === 'cancel reject') S.rejecting = null
    if (step === 'close changes') S.diffOpen = null
    if (step === 'cancel answer') S.answering = null
    if (step === 'clear search') S.search = null
    $.ui.invalidate('ui.render')
  }
  return true
}

/** The board panel closed: the opened days, the search, every open box and the active view are forgotten. */
export async function forgetPane($: $) {
  openDays.clear()
  S.backlogOpen = false
  S.backlogAll = false
  S.doneOpen = false
  S.droppedOpen = false
  S.search = null
  S.draft = null
  S.naming = null
  S.diffOpen = null
  S.rejecting = null
  S.rolePick = null
  S.answering = null
  S.settingEdit = null
  S.settingPick = null
  changesCache.clear()
  await panelValues($).updateTab(() => '').catch(() => undefined)
  await panelValues($).updateScoutOpen(() => '').catch(() => undefined)
}

/**
 * The board panel is closing (`origin`: who closed it). Esc from the owner goes one step back (see escBack) and keeps
 * the panel open, then asks for the keyboard back, which Claude Code gave to its prompt on Esc: answers true. Else the
 * panel closes and forgets its place (forgetPane): false. Each close is written to the debug log (claude --debug), to
 * see whether an Esc reached the panel at all (docs/research/esc-in-panels.md).
 */
export async function paneClosing($: $, origin: string): Promise<boolean> {
  const back = origin === 'person' && (await escBack($))
  $.ui.log(`${S.N.name} board: ui.close from ${origin}${back ? ', went one step back' : ''}`, { to: 'debug' })
  if (back) {
    takeKeysBack($)
    return true
  }
  await forgetPane($)
  return false
}
