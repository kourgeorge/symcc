// The board view file (T-466, R6 of T-468): OpenCode's TUI part (opencode/tui.ts) runs in another process than the
// server part that runs symcc's engine, so it can't read the engine's memory. Each publish (app/lead.ts) hands the
// view to the Host's ui.panel.updateView; here that keeps it in memory and also writes it, with what the TUI needs
// to draw the banner and band (folder, home, name, version), to .<name>/view.json in the project's main folder. The
// TUI reads that file on a timer (board-view.ts parses it). Each scout's recent runs ride along (scout_runs, T-559:
// the TUI's scout page lists them; a run's report stays in its own file, which the TUI reads when the run is opened),
// and so do the roles and task types (T-562: the TUI's Roles and Task types pages under Settings list them), org-mem's notes (T-619: its Organizational memory page) and each task in review's changed files (T-580: the TUI runs no git).
// The panel's own values (which task, tab and scout are
// open) stay in the TUI; the server side keeps them in memory only, as their start values for symcc's logic.
import type { SymccView } from '../../types'
import type { Host, PanelValues } from '../host'
import { type PaneView, S } from '../app/state'
import { safeWrite } from '../app/store'
import { loadScoutResults } from '../app/scouts'
import { parseScoutRuns, safeScoutFile, scoutRunsFile, scoutRunTasks, mergeRoles, mergeKinds, intoOf, isAnswered, type BoardTask } from '../board'
import { changedFiles, mergedChanges } from '../app/review'
import { hasMergedChanges } from '../core/board-file'
import { roleLists, roleFileDay } from '../app/roles'
import { kindLists } from '../app/kinds'
import { orgMemNow } from '../app/org-mem'
import { viewTask } from '../core/board-parts'
import { VIEW_FILE, VIEW_RUNS_KEPT, viewFileText, viewDefs, type ScoutRuns, type ViewDef, type ViewChanges } from './board-view'

/** The empty view, as a panel starts with. */
const emptyView = (): SymccView => ({ tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] })

/**
 * The board panel's values for OpenCode's server part: each one in memory, and every new view also written to the
 * view file (in order, one write at a time; a failed write is only logged). Nothing is written before the project's
 * folder is known, nor by a copy that only guards (S.guardOnly: the engine copy owns the file).
 */
export function viewFilePanel(host: Pick<Host, 'fs' | 'run' | 'ui' | 'plugin'>): PanelValues {
  let opened = ''
  let tab = ''
  let scout = ''
  let view = emptyView()
  let writing: Promise<unknown> = Promise.resolve()
  /** T-841: the session that ran /enable last (the TUI window showing it opens the board once) */
  let openNow: { session: string; at: number } | undefined
  const write = (v: SymccView) => {
    if (!S.root || S.guardOnly || S.fresh) return writing
    const root = S.root
    const file = `${root}/${S.N.dir}/${VIEW_FILE}`
    const at = Date.now()
    writing = writing
      .then(async () => {
        const scout_runs = await scoutRunsOf(host, root, v)
        // T-622: each scout's "Results" line for its page (the TUI can't read scouts.json or the archive itself)
        const names = (v.scouts ?? []).map(sc => sc.name)
        const scout_results = names.length ? await loadScoutResults(host, names, v.tasks ?? [], at).catch(() => ({})) : {}
        const defs = await defsOf(host as Host).catch(() => ({}))
        const changes = await changesOf(host as Host, v)
        const org_mem = await orgMemNow(host as Host).then(r => r.notes).catch(() => [])
        const text = viewFileText({ root, home: S.home, name: S.N.name, version: S.version, written_at: at, ...(openNow ? { open_now: openNow } : {}), view: { ...(v as PaneView), tasks: (v.tasks ?? []).map(viewTask), ...(Object.keys(scout_runs).length ? { scout_runs } : {}), ...(Object.keys(scout_results).length ? { scout_results } : {}), ...defs, ...(Object.keys(changes).length ? { changes } : {}), org_mem } })
        await safeWrite(host as Host, file, text, 'the board view')
      })
      .catch((err: Error) => host.ui.log(`couldn't write ${file}: ${err?.message ?? err}`))
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
    openNow: async session => {
      openNow = { session, at: Date.now() }
      await write(view)
    },
    updateView: async change => {
      view = change(view)
      await write(view)
    },
  }
}

/** Each scout's recent runs (newest first, at most VIEW_RUNS_KEPT), each with the tasks made from it, from its runs
 *  file; a scout with no runs (or an unreadable file) is left out. */
export async function scoutRunsOf(host: Pick<Host, 'fs'>, root: string, v: SymccView): Promise<ScoutRuns> {
  const out: ScoutRuns = {}
  for (const sc of v.scouts ?? []) {
    if (safeScoutFile(sc.name, S.N.name) === null) continue
    const runs = parseScoutRuns(await host.fs.read(`${root}/${scoutRunsFile(sc.name, S.N.name)}`).catch(() => null))
    if (!runs.length) continue
    const made = scoutRunTasks(runs, v.tasks ?? [], sc.name)
    out[sc.name] = runs.map((run, i) => ({ run, tasks: made[i]! })).reverse().slice(0, VIEW_RUNS_KEPT)
  }
  return out
}

/** The files each task in review changed (T-580; not an answered investigation's: nothing to merge), against the
 *  branch it merges into, or why they can't be read: the TUI's task page lists them under Changes. */
export async function changesOf(host: Host, v: SymccView): Promise<ViewChanges> {
  const out: ViewChanges = {}
  for (const t of v.tasks ?? []) {
    // T-1086: a done change task's list comes from its merged commits (see mergedChanges; answers are kept in memory)
    if (hasMergedChanges(t)) {
      const got = await mergedChanges(host, t).catch(() => null)
      if (got) out[t.id] = { files: got.files, error: '' }
      continue
    }
    if (t.status !== 'review' || isAnswered(t as BoardTask)) continue
    out[t.id] = await changedFiles(host, intoOf(t), t).then(
      files => ({ files, error: '' }),
      (err: Error) => ({ files: [], error: err?.message ?? String(err) }),
    )
  }
  return out
}

/** The roles and task types for the TUI's Roles and Task types pages: each one (built-in, or the owner's over it), and the
 *  owner's files that can't be read (see viewDefs). */
export async function defsOf(host: Host): Promise<{ roles: ViewDef[]; kinds: ViewDef[] }> {
  const r = await roleLists(host)
  const k = await kindLists(host)
  return {
    roles: viewDefs('role', mergeRoles(r.builtIn, r.project), r.builtIn, r.project, r.broken, r.dir, Object.fromEntries(await Promise.all(r.project.map(async p => [p.name, await roleFileDay(host, p.name)] as const)))),
    kinds: viewDefs('kind', mergeKinds(k.builtIn, k.project), k.builtIn, k.project, k.broken, k.dir),
  }
}
