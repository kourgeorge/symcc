// The plugin keeps its memory in module-level sets and maps (hooks/plugin/state.ts and a few next to the
// code that uses them). Every test file shares one copy, so what one test leaves there (an agent id in
// `stopped`, a task in `finishing`, ...) changes what a later test sees. resetPlugin() empties them all,
// as a plugin reload does, so a test starts the same whatever ran before it.
import { test as plainTest } from 'claude-code/testing'
import { emptyHeard } from '../hooks/board'
import { workers, starting, finishing, scoutRuns, stopped, reminded, healthTold, scoutState, leadQueue, meanwhile, notReady, openDays, heard, sayQueue, keptDirty, changesCache, approving, tmpWarned, skippedRoles } from '../hooks/plugin/state'
import { stopAsked, offAsked, seenEnded } from '../hooks/plugin/workers'
import { saidNeedsYou } from '../hooks/plugin/voice'

/** Empties the plugin's in-memory state (agents, tasks being checked, queues for the lead): what a reload starts with. */
export function resetPlugin() {
  for (const m of [workers, scoutRuns, reminded, scoutState, notReady, changesCache, skippedRoles, stopAsked, offAsked]) m.clear()
  for (const s of [starting, finishing, stopped, healthTold, openDays, keptDirty, approving, tmpWarned, seenEnded, saidNeedsYou]) s.clear()
  for (const q of [leadQueue, meanwhile, sayQueue]) q.length = 0
  for (const k of Object.keys(heard)) delete (heard as Record<string, unknown>)[k]
  Object.assign(heard, emptyHeard())
}

/**
 * The runtime's test(), but each test starts with resetPlugin() (the runtime has no beforeEach).
 * Use it in place of the plain test() in a file whose tests touch the plugin's memory.
 */
export const test = ((name: string, fn: () => unknown, ...rest: unknown[]) =>
  (plainTest as (...a: unknown[]) => unknown)(name, () => {
    resetPlugin()
    return fn()
  }, ...rest)) as typeof plainTest
