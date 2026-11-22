// The board panel's values, which only Claude Code's `$` holds (claude/host.ts carries them as the Host's ui.panel).
// Claude Code reads which values a plugin keeps from its code before it runs, so their owner must be written out here
// as text. It must be the plugin's name: on a rename, change it in these four lines and in types/claude.d.ts too.
// The loader lets read and update take only an atom written in the same file, so they are only reached through
// panelValues below.
import { type EngineInterface, atom, read, update } from 'claude-code'
import type { SymccView } from '../../types'
import type { PanelValues } from '../host'
import { slimView, slimViewStep, trimNote, VIEW_MAX_CHARS, VIEW_TARGET_CHARS } from '../core/view-slim'
export { slimView, VIEW_MAX_CHARS, VIEW_TARGET_CHARS }

/** Claude Code's `$`, as one hook hands it to the plugin. */
export type $ = EngineInterface

/** which task the board panel has open; '' = the list */
const opened = atom({ plugin: 'symcc', key: 'opened' } as const, '')
/** which view the board panel shows: 'live' (the start), 'tasks', 'scouts' or 'settings'; kept while the panel is open */
const tab = atom({ plugin: 'symcc', key: 'tab' } as const, 'live')
/** which scout the Scouts view has open; '' = the list */
const scoutOpen = atom({ plugin: 'symcc', key: 'scout' } as const, '')
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
    fitView: v => {
      const r = slimViewStep(v)
      return { view: r.view, note: trimNote(r.step, r.left) }
    },
    // a refused value (too big) must never fail a board change or a worker start: say nothing, the next publish tries again
    updateView: async (change, fitted) => {
      try {
        await update($, view, v => (fitted ? change(v) : slimView(change(v))))
      } catch {
        // dropped on purpose, see above
      }
    },
  }
}
