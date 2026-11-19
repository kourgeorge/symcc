// A test command before a merge that runs past its limit (test_minutes) fails the check like a failing test (T-547):
// a new worker try gets the output (it counts in auto_retries), and the note says it ran out of time and to raise
// test_minutes if the tests are just slow. Pure functions only.

/**
 * Whether a test command's run ended because its time limit stopped it: the host threw (Claude Code:
 * "$.process.run(/bin/sh) aborted: still running after 600000ms"), or answered the Node host's
 * time-out (exit 124, its output ending "timed out after 600000 ms"). A command that finished with
 * a non-zero exit code (even 124 of its own) is a plain failure.
 */
export function ranOutOfTime(r: { exitCode: number; stderr: string }, thrown?: string): boolean {
  if (thrown !== undefined) return /\bstill running after \d+\s*ms\b|\btimed out after \d+\s*ms\b/i.test(thrown)
  return r.exitCode === 124 && /\btimed out after \d+\s*ms\s*$/i.test(r.stderr)
}

/** A time limit in whole minutes (at least 1). */
export const limitMinutes = (ms: number) => Math.max(1, Math.round(ms / 60_000))

/** The advice for a time-out: the tests may just be slow. */
export const RAISE_TEST_MINUTES = 'raise test_minutes if the tests are just slow'

/** The check's detail when test command `cmd` ran out of time after `min` minutes. */
export const timedOutDetail = (cmd: string, min: number) => `tests ran out of time: \`${cmd}\` was still running after ${min} min (${RAISE_TEST_MINUTES})`

/** The first line of the test output a new try gets when test command `cmd` ran out of time after `min` minutes. */
export const timedOutHead = (cmd: string, min: number) => `$ ${cmd} (ran out of time after ${min} min; ${RAISE_TEST_MINUTES})`

/** The task's note when its tests ran out of time after `min` minutes and a new try starts (`n` of `max` auto retries). */
export const timedOutRetryNote = (min: number, n: number, max: number) => `tests ran out of time after ${min} min; a new try will look at them (${n} of ${max}); ${RAISE_TEST_MINUTES}`

/** The most minutes the test_minutes setting may be. */
export const MAX_TEST_MINUTES = 120
