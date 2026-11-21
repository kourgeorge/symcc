// The board panel: picks the page to draw (Settings, a scout, the Scouts list, a task, a question for the owner, the Live tab, or the task list).
import { S } from '../../app/state'
import { type $ } from '../panel'
import { arrows, rowStops } from './arrows'
import { listPage } from './list'
import { type PaneEvent, type PaneHook, type PaneParts, paneParts } from './parts'
import { scoutEditPage, scoutsPage } from './scouts-page'
import { settingsPage } from './settings'
import { taskPage } from './task-page'
import { questionPage } from './question-page'
import { listPageVs } from './vscode-list'
import { livePage, stopLiveTick } from './live'
import { livePageVs } from './vscode-live'

/** The board panel: the list (each task a button), or one task with its actions; or the Scouts or Settings view. */
export async function renderPane($: $, e: PaneEvent, next: Parameters<PaneHook>[2]) {
  if (e.requestId !== S.N.pane) return next(e)
  arrows.move = false // the page's footer sets it when its key line says "↑↓ move"
  arrows.rows = new Set() // the page marks its list rows with row()
  const pane = await paneParts($, e)
  const tree = await page($, pane)
  arrows.stops = rowStops(tree, arrows.rows)
  return tree
}

/** The page the board panel shows now. */
function page($: $, pane: PaneParts) {
  // the Live tab redraws itself while it is shown (see live.tsx); any other page stops that
  if (!pane.onLive || pane.t) stopLiveTick()
  if (pane.onSettings) return settingsPage($, pane)
  if (pane.onScouts && S.draft) return scoutEditPage($, pane)
  if (pane.onScouts) return scoutsPage($, pane)
  if (pane.t) return taskPage($, pane, pane.t)
  if (pane.q) return questionPage($, pane, pane.q)
  if (pane.onLive) return pane.vscode ? livePageVs($, pane) : livePage($, pane)
  // VS Code's side panel has its own Tasks page: readable rows, buttons, no key hints (see vscode-list.tsx)
  return pane.vscode ? listPageVs($, pane) : listPage($, pane)
}
