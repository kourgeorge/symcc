// The plugin keeps its memory in module-level sets and maps (hooks/plugin/state.ts and a few next to the
// code that uses them). Every test file shares one copy, so what one test leaves there (an agent id in
// `stopped`, a task in `finishing`, S.me, ...) changes what a later test sees. resetPlugin() empties them all
// and puts S back to its start values, as a plugin reload does, so a test starts the same whatever ran before it.
import { test as plainTest, type TestBody, type TestRest } from 'claude-code/testing'
import { emptyHeard } from '../hooks/board'
import { S, startS, timers, workers, starting, finishing, scoutRuns, checkerRuns, stopped, reminded, healthTold, scoutState, leadQueue, meanwhile, notReady, openDays, heard, sayQueue, keptDirty, changesCache, approving, tmpWarned, skippedRoles, skippedKinds } from '../hooks/plugin/state'
import { resetScoutRuns } from '../hooks/plugin/scouts'
import { resetStore } from '../hooks/plugin/store'
import { resetMergeTurns } from '../hooks/plugin/review'
import { resetLogo } from '../hooks/plugin/logo'
import { stopAsked, offAsked, seenEnded } from '../hooks/plugin/workers'
import { saidNeedsYou } from '../hooks/plugin/voice'

/** Empties the plugin's in-memory state (agents, tasks being checked, queues for the lead, timers, S): what a reload starts with. */
export function resetPlugin() {
  // A timer left by an earlier test must not go off during this one.
  for (const t of [...timers, S.watchdog, S.leadTimer, S.beat, S.sayTimer]) {
    try {
      t?.cancel()
    } catch {
      // already gone
    }
  }
  timers.length = 0
  for (const k of Object.keys(S)) delete (S as Record<string, unknown>)[k]
  Object.assign(S, startS())
  resetScoutRuns()
  resetStore()
  resetMergeTurns()
  resetLogo()
  for (const m of [workers, scoutRuns, checkerRuns, reminded, scoutState, notReady, changesCache, skippedRoles, skippedKinds, stopAsked, offAsked]) m.clear()
  for (const s of [starting, finishing, stopped, healthTold, openDays, keptDirty, approving, tmpWarned, seenEnded, saidNeedsYou]) s.clear()
  for (const q of [leadQueue, meanwhile, sayQueue]) q.length = 0
  for (const k of Object.keys(heard)) delete (heard as Record<string, unknown>)[k]
  Object.assign(heard, emptyHeard())
}

/**
 * The runtime's test(), but each test starts with resetPlugin() (the runtime has no beforeEach).
 * Use it in place of the plain test() in a file whose tests touch the plugin's memory. What the runtime passes
 * a test (`$` and a hook test's `on`) is passed on, and options given before the body (timeoutMs, ...) too.
 */
export const test = (name: string, ...rest: TestRest): void => {
  const fresh = (body: TestBody): TestBody => ($, on) => {
    resetPlugin()
    return body($, on)
  }
  if (rest.length === 1) plainTest(name, fresh(rest[0]))
  else plainTest(name, rest[0], fresh(rest[1]))
}
