// T-891: the Tasks list's search over finished tasks in Claude Code and VS Code (the shared part is core/search-parts.ts,
// which OpenCode's panel uses too): while the owner types a search, slim tasks' details and request are read from their
// parts files through the host. Nothing is read on publish or a normal redraw.
import type { SymccTask } from '../../types'
import { searchParts } from '../core/search-parts'
import type { Host } from '../host'
import { S } from './state'
import { path } from './store'

const cache = searchParts()
/** How many parts files were read since the start (for tests: publish and plain redraws read none). */
export const searchReads = cache.reads

/** What the search may match beyond a view task's own fields: a slim task's details and request, from what was read. */
export const searchMore = cache.more

/** Forgets what was read (the search ended). */
export const forgetSearchParts = cache.forget

/** Reads the slim tasks' details and request for search `query` (see core's searchParts load). Never throws. */
export async function loadSearchParts(host: Host, tasks: readonly SymccTask[], query: string): Promise<void> {
  // the project folder may not be known yet (path throws): then nothing is read
  await cache.load(tasks, query, rel => host.fs.read(path(`${S.N.dir}/${rel}`)))
}
