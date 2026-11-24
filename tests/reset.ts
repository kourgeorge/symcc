// The plugin keeps its memory in module-level sets and maps (hooks/app/state.ts and a few next to the
// code that uses them). Every test file shares one copy, so what one test leaves there (an agent id in
// `stopped`, a task in `finishing`, S.me, ...) changes what a later test sees. resetPlugin() empties them all
// and puts S back to its start values, as a plugin reload does, so a test starts the same whatever ran before it.
import { test as plainTest, type TestBody, type TestOptions, type TestRest } from 'claude-code/testing'
import { emptyHeard, useAssistantWord } from '../hooks/board'
import { SYMCC_WORDS } from '../hooks/host'
import { S, startS, timers, workers, starting, queuedWorkers, finishing, scoutRuns, checkerRuns, stopped, movedAgents, movedRefused, haltedAnywhere, boardAgents, reminded, healthTold, scoutState, leadQueue, meanwhile, meanwhileHeard, notReady, checkerNotReady, openDays, heard, sayQueue, keptDirty, changesCache, scratchUse, approving, tmpWarned, skippedRoles, skippedKinds } from '../hooks/app/state'
import { resetScoutRuns } from '../hooks/app/scouts'
import { resetStarts } from '../hooks/app/starts'
import { resetStore } from '../hooks/app/store'
import { resetMergeLine } from '../hooks/app/merge-line'
import { resetLogo } from '../hooks/app/logo'
import { stopAsked, offAsked, seenEnded, onPurpose } from '../hooks/app/workers'
import { saidNeedsYou } from '../hooks/app/voice'
import { guardLogged } from '../hooks/app/ask'
import { resetBackground } from '../hooks/claude/background'
import { resetClaudeSelf } from '../hooks/claude/host'
import { resetDebriefs } from '../hooks/app/debrief'
import { resetEvidence } from '../hooks/app/evidence'
import { live, stopLiveTick } from '../hooks/claude/ui/live'
import { resetBranches } from '../hooks/app/branches'
import { resetTodayTeam } from '../hooks/app/lead'
import { forgetSearchParts } from '../hooks/app/search-parts'

/** Empties the plugin's in-memory state (agents, tasks being checked, queues for the lead, timers, S): what a reload starts with. */
export function resetPlugin() {
  // A timer left by an earlier test must not go off during this one.
  for (const t of [...timers, S.watchdog, S.leadTimer, S.leadRetry, S.beat, S.sayTimer]) {
    try {
      t?.cancel()
    } catch {
      // already gone
    }
  }
  timers.length = 0
  for (const k of Object.keys(S)) delete (S as Record<string, unknown>)[k]
  Object.assign(S, startS())
  useAssistantWord(SYMCC_WORDS.assistant)
  resetScoutRuns()
  resetStarts()
  resetStore()
  resetMergeLine()
  resetLogo()
  stopLiveTick()
  live.frame = 0
  resetBackground()
  resetClaudeSelf()
  resetDebriefs()
  resetEvidence()
  resetBranches()
  resetTodayTeam()
  forgetSearchParts()
  for (const m of [workers, queuedWorkers, onPurpose, scoutRuns, checkerRuns, reminded, scoutState, notReady, checkerNotReady, changesCache, scratchUse, skippedRoles, skippedKinds, stopAsked, offAsked]) m.clear()
  for (const s of [starting, finishing, stopped, movedAgents, boardAgents, healthTold, openDays, keptDirty, approving, tmpWarned, seenEnded, saidNeedsYou, guardLogged]) s.clear()
  movedRefused().clear()
  haltedAnywhere().clear()
  for (const q of [leadQueue, meanwhile, meanwhileHeard, sayQueue]) q.length = 0
  for (const k of Object.keys(heard)) delete (heard as Record<string, unknown>)[k]
  Object.assign(heard, emptyHeard())
}

/**
 * How long a test made with this test() may run, unless it says otherwise. The runtime's own limit is 5 s, and
 * a test that loads the plugin (a screen or a hook test) takes 1-4 s alone, but more than 5 s when the machine is
 * busy (several workers, checkers and test runs at once: T-244 and T-399 saw them time out at a load of ~150).
 * The tests use the runtime's fake clock, so this only bounds real waiting; a hung test still fails, just later.
 */
export const RESET_TEST_TIMEOUT_MS = 30_000

/** The options test() hands the runtime: RESET_TEST_TIMEOUT_MS unless the test gave its own timeoutMs. */
export const withTimeout = (options: TestOptions = {}): TestOptions => ({ ...options, timeoutMs: options.timeoutMs ?? RESET_TEST_TIMEOUT_MS })

/**
 * The runtime's test(), but each test starts with resetPlugin() (the runtime has no beforeEach) and may run
 * RESET_TEST_TIMEOUT_MS. Use it in place of the plain test() in a file whose tests touch the plugin's memory. What
 * the runtime passes a test (`$` and a hook test's `on`) is passed on, and options given before the body
 * (timeoutMs, ...) too.
 */
export const test = (name: string, ...rest: TestRest): void => {
  const fresh = (body: TestBody): TestBody => ($, on) => {
    resetPlugin()
    return body($, on)
  }
  if (rest.length === 1) plainTest(name, withTimeout(), fresh(rest[0]))
  else plainTest(name, withTimeout(rest[0]), fresh(rest[1]))
}
