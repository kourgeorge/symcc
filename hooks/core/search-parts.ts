// T-891, T-904: the Tasks list's search over finished tasks, shared by every client (Claude Code and VS Code through
// app/search-parts.ts, OpenCode's panel in opencode/tui.ts). The view keeps a done or dropped task as a slim stub (no
// details, no request; see core/view-slim.ts), so while the owner types a search, their details and request are read
// from the tasks' parts files (.<name>/tasks/T-n.json) and matched too. What was read is kept for that search (typing
// more letters reads nothing again) and forgotten when the search ends. Nothing is read on a normal redraw.
import type { SymccTask } from '../../types'
import { PARTS_KEY, readParts, safePartsFile } from './board-parts'
import { parseSearch, type SearchMore } from './panel'
import { isObj } from './text'

/** Reads a parts file by its path inside the data folder ("tasks/T-n.json"); null (or a throw) when it can't. */
export type ReadPartsFile = (rel: string) => Promise<string | null> | string | null

/** One client's search cache: `more` gives searchTasks a slim task's details and request from what was read. */
export type SearchParts = {
  more: SearchMore
  /** Forgets what was read (the search ended). */
  forget(): void
  /** Reads the details and request of every slim task in `tasks` whose parts file was not read yet for this search,
   *  when `query` has plain words (filter words alone match no text). An empty query forgets what was read. Never
   *  throws: a file that can't be read just adds nothing. Says whether anything new was read. */
  load(tasks: readonly SymccTask[], query: string, read: ReadPartsFile): Promise<boolean>
  /** How many parts files were read since the start (for tests: plain redraws read none). */
  reads: { files: number }
}

export function searchParts(): SearchParts {
  // each slim task's details and request (by id); '' when its file had none or can't be read (so each task's file is
  // read once per search)
  const texts = new Map<string, string>()
  const reads = { files: 0 }
  const forget = () => texts.clear()
  return {
    more: t => texts.get(t.id) ?? '',
    forget,
    reads,
    async load(tasks, query, read) {
      if (!query.trim()) return forget(), false
      if (!parseSearch(query).words.length) return false
      const byFile = new Map<string, string[]>()
      for (const t of tasks) {
        const rel = (t as unknown as Record<string, unknown>)[PARTS_KEY]
        if (!safePartsFile(rel) || texts.has(t.id)) continue
        byFile.set(rel, [...(byFile.get(rel) ?? []), t.id])
      }
      await Promise.all([...byFile].map(async ([rel, ids]) => {
        reads.files++
        const text = await Promise.resolve().then(() => read(rel)).catch(() => null)
        const parts = typeof text === 'string' ? readParts(text).tasks : {}
        for (const id of ids) {
          const p = parts[id]
          const request = p && isObj(p.origin) ? p.origin.request : undefined
          texts.set(id, [p?.details, request].filter((x): x is string => typeof x === 'string').join('\n'))
        }
      }))
      return byFile.size > 0
    },
  }
}
