// The board panel: picks the page to draw (Settings, a scout, the Scouts list, a task, or the task list).
import { type $, S } from '../state'
import { listPage } from './list'
import { type PaneEvent, type PaneHook, paneParts } from './parts'
import { scoutEditPage, scoutsPage } from './scouts-page'
import { settingsPage } from './settings'
import { taskPage } from './task-page'

/** The board panel: the list (each task a button), or one task with its actions; or the Scouts or Settings view. */
export async function renderPane($: $, e: PaneEvent, next: Parameters<PaneHook>[2]) {
  if (e.requestId !== S.N.pane) return next(e)
  const pane = await paneParts($, e)
  if (pane.onSettings) return settingsPage($, pane)
  if (pane.onScouts && S.draft) return scoutEditPage($, pane)
  if (pane.onScouts) return scoutsPage($, pane)
  if (pane.t) return taskPage($, pane, pane.t)
  return listPage($, pane)
}
