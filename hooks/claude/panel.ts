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

/**
 * The view as the panel keeps it, under Claude Code's 4 MB limit on one value: a done or dropped task changed more
 * than VIEW_WHOLE_MS ago is slimmed like OpenCode's view file (viewTask: no history, details or long parts; its page
 * then shows them empty), and if the view is still near the limit every finished task is slimmed.
 */
export function slimView(v: SymccView, nowMs = Date.now()): SymccView {
  const finished = (t: SymccView['tasks'][number]) => t.status === 'done' || t.status === 'dropped'
  const slim = (old: (t: SymccView['tasks'][number]) => boolean) => ({ ...v, tasks: (v.tasks ?? []).map(t => (finished(t) && old(t) ? viewStubFilled(viewTask(t)) : t)) })
  const some = slim(t => nowMs - Date.parse(t.updated_at ?? '') > VIEW_WHOLE_MS || !t.updated_at)
  if (JSON.stringify(some).length < VIEW_MAX_CHARS * 0.9) return some
  return slim(() => true)
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
    updateView: change => update($, view, v => slimView(change(v))),
  }
}
