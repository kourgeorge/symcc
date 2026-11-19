// The board view file (T-466, R6 of T-468): OpenCode's TUI part (opencode/tui.ts) runs in another process than the
// server part that runs symcc's engine, so it can't read the engine's memory. Each publish (app/lead.ts) hands the
// view to the Host's ui.panel.updateView; here that keeps it in memory and also writes it, with what the TUI needs
// to draw the banner and band (folder, home, name, version), to .<name>/view.json in the project's main folder. The
// TUI reads that file on a timer (board-view.ts parses it). The panel's own values (which task, tab and scout are
// open) stay in the TUI; the server side keeps them in memory only, as their start values for symcc's logic.
import type { SymccView } from '../../types'
import type { Host, PanelValues } from '../host'
import { type PaneView, S } from '../app/state'
import { safeWrite } from '../app/store'
import { VIEW_FILE, viewFileText } from './board-view'

/** The empty view, as a panel starts with. */
const emptyView = (): SymccView => ({ tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] })

/**
 * The board panel's values for OpenCode's server part: each one in memory, and every new view also written to the
 * view file (in order, one write at a time; a failed write is only logged). Nothing is written before the project's
 * folder is known, nor by a copy that only guards (S.guardOnly: the engine copy owns the file).
 */
export function viewFilePanel(host: Pick<Host, 'fs' | 'run' | 'ui'>): PanelValues {
  let opened = ''
  let tab = ''
  let scout = ''
  let view = emptyView()
  let writing: Promise<unknown> = Promise.resolve()
  const write = (v: SymccView) => {
    if (!S.root || S.guardOnly) return writing
    const file = `${S.root}/${S.N.dir}/${VIEW_FILE}`
    const text = viewFileText({ root: S.root, home: S.home, name: S.N.name, version: S.version, written_at: Date.now(), view: v as PaneView })
    writing = writing.then(() => safeWrite(host as Host, file, text, 'the board view')).catch((err: Error) => host.ui.log(`couldn't write ${file}: ${err?.message ?? err}`))
    return writing
  }
  return {
    readOpened: async () => opened,
    updateOpened: async change => (opened = change(opened)),
    readTab: async () => tab,
    updateTab: async change => (tab = change(tab)),
    readScoutOpen: async () => scout,
    updateScoutOpen: async change => (scout = change(scout)),
    readView: async () => view,
    updateView: async change => {
      view = change(view)
      await write(view)
    },
  }
}
