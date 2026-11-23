// T-891: the Tasks list's search over finished tasks. The view keeps a done or dropped task as a slim stub (no
// details, no request; see core/view-slim.ts), so while the owner types a search, their details and request are read
// from the tasks' parts files (.<name>/tasks/T-n.json) and matched too. What was read is kept for that search (typing
// more letters reads nothing again) and forgotten when the search ends. Nothing is read on publish or a normal redraw.
import type { SymccTask } from '../../types'
import { PARTS_KEY, readParts, safePartsFile } from '../core/board-parts'
import { parseSearch, type SearchMore } from '../core/panel'
import { isObj } from '../core/text'
import type { Host } from '../host'
import { S } from './state'
import { path } from './store'

/** Each slim task's details and request (by id), read for the search now on; '' when its file had none or can't be
 *  read (so each task's file is read once per search). */
const texts = new Map<string, string>()
/** How many parts files were read since the start (for tests: publish and plain redraws read none). */
export const searchReads = { files: 0 }

/** What the search may match beyond a view task's own fields: a slim task's details and request, from what was read. */
export const searchMore: SearchMore = t => texts.get(t.id) ?? ''

/** Forgets what was read (the search ended). */
export function forgetSearchParts() {
  texts.clear()
}

/**
 * Reads the details and request of every slim task in `tasks` whose parts file was not read yet for this search,
 * when `query` has plain words (filter words alone match no text). An empty query forgets what was read. Never throws:
 * a file that can't be read just adds nothing.
 */
export async function loadSearchParts(host: Host, tasks: readonly SymccTask[], query: string): Promise<void> {
  if (!query.trim()) return forgetSearchParts()
  if (!parseSearch(query).words.length) return
  const byFile = new Map<string, string[]>()
  for (const t of tasks) {
    const rel = (t as unknown as Record<string, unknown>)[PARTS_KEY]
    if (!safePartsFile(rel) || texts.has(t.id)) continue
    byFile.set(rel, [...(byFile.get(rel) ?? []), t.id])
  }
  await Promise.all([...byFile].map(async ([rel, ids]) => {
    searchReads.files++
    // the project folder may not be known yet (path throws): then nothing is read
    const text = await Promise.resolve().then(() => host.fs.read(path(`${S.N.dir}/${rel}`))).catch(() => null)
    const parts = text === null ? {} : readParts(text).tasks
    for (const id of ids) {
      const p = parts[id]
      const request = p && isObj(p.origin) ? p.origin.request : undefined
      texts.set(id, [p?.details, request].filter((x): x is string => typeof x === 'string').join('\n'))
    }
  }))
}
