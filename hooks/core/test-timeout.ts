// T-511: a test command before a merge that only ran out of time (it was stopped by its limit, not a command that
// finished with a failing exit code) is not a failed test. The task keeps its work, no new worker try starts and no
// auto retry is used: symcc runs only the test commands again, once, later (see app/workers.ts rerunTimedOutTests).
// When they run out of time a second time, the task waits for the owner (nothing failed). Pure functions only.

/** How many time-outs a task's current check had (BoardTask.test_rerun): 1 = the rerun is due (or running), 2 = it asks the owner. */
export type TestRerun = 1 | 2

/** `v` as a TestRerun when it is one, else undefined. */
export const asTestRerun = (v: unknown): TestRerun | undefined => (v === 1 || v === 2 ? v : undefined)

/**
 * Whether a test command's run ended because its time limit stopped it: the host threw (Claude Code:
 * "$.process.run(/bin/sh) aborted: still running after 600000ms"), or answered the Node host's
 * time-out (exit 124, its output ending "timed out after 600000 ms"). A command that finished with
 * a non-zero exit code (even 124 of its own) is a real failure.
 */
export function ranOutOfTime(r: { exitCode: number; stderr: string }, thrown?: string): boolean {
  if (thrown !== undefined) return /\bstill running after \d+\s*ms\b|\btimed out after \d+\s*ms\b/i.test(thrown)
  return r.exitCode === 124 && /\btimed out after \d+\s*ms\s*$/i.test(r.stderr)
}

/** A time limit in whole minutes (at least 1). */
export const limitMinutes = (ms: number) => Math.max(1, Math.round(ms / 60_000))

/** The check's detail when test command `cmd` ran out of time after `min` minutes. */
export const timedOutDetail = (cmd: string, min: number) => `tests ran out of time: \`${cmd}\` was still running after ${min} min; nothing failed`

/** The task's note and history line after the first time-out. */
export const rerunNote = (min: number) => `tests ran out of time (${min} min); running them again once, no new try`

/** The note while the rerun runs. */
export const RERUN_RUNNING_NOTE = 'running only the tests again (they ran out of time once)'

/** The owner's question after the second time-out. */
export const timedOutTwiceQuestion = (id: string) => `${id}: the tests ran out of time twice; nothing failed. Run them again, give them more time, or stop it?`

/** The choices for timedOutTwiceQuestion: "Give them more time" runs them again with twice the task's limit, for that run only (see moreTestMinutes). */
export const TIMED_OUT_OPTIONS = ['Run the tests again', 'Give them more time', 'Stop it'] as const

/** The most minutes the test_minutes setting may be. */
export const MAX_TEST_MINUTES = 120

/** A task's test limit for its next rerun after the owner's "Give them more time": twice `min`, at most MAX_TEST_MINUTES. */
export const moreTestMinutes = (min: number) => Math.min(MAX_TEST_MINUTES, Math.max(1, Math.round(min)) * 2)

/** The note of a task stopped by the owner after its tests ran out of time twice. */
export const TIMED_OUT_STOPPED_NOTE = 'stopped by the owner: the tests ran out of time twice; its work is kept in its folder and branch'

/** What the owner's answer to timedOutTwiceQuestion picks: run the tests again, give them more time, stop it, or null (any other answer). */
export function parseTimedOutAnswer(answer: string): 'again' | 'more' | 'stop' | null {
  const a = String(answer ?? '').trim().toLowerCase()
  if (!a) return null
  if (/^(give (them |it |the tests )?more time|more time)\b/.test(a)) return 'more'
  if (/^(run (the tests |them )?again|again|rerun|retest|run the tests)\b/.test(a)) return 'again'
  if (/^stop( it)?\b/.test(a)) return 'stop'
  return null
}

/** Whether task `t` waits for its tests to run again (they ran out of time once): "waiting", no question. */
// A task that waits for the owner's files (merge_wait) already passed its tests: retryFileWaits merges it, nothing reruns.
export const rerunDue = (t: { status?: unknown; test_rerun?: unknown; question?: unknown; merge_wait?: unknown }): boolean => t.status === 'waiting' && t.test_rerun === 1 && !t.question && !t.merge_wait

/** Whether task `t` waits for the owner because its tests ran out of time twice. */
export const askedTimedOut = (t: { status?: unknown; test_rerun?: unknown; question?: unknown }): boolean => t.status === 'waiting' && t.test_rerun === 2 && !!t.question

/**
 * The lead's line after the owner answered task `t`'s question with `answer` on a board panel: what happens now.
 * For the "the tests ran out of time twice" question, which of the two it is (only the tests run again, or it is
 * paused); for any other question, the task went back to work.
 */
export function answeredLeadLine(t: { id: string; status?: unknown; test_rerun?: unknown; question?: unknown }, answer: string, brief: (s: string) => string = s => s): string {
  const said = `The owner answered ${t.id} ("${brief(answer)}")`
  const pick = askedTimedOut(t) ? parseTimedOutAnswer(answer) : null
  if (pick === 'again') return `${said}: only its tests run again (they ran out of time twice), with no worker and no new try.`
  if (pick === 'more') return `${said}: only its tests run again, this once with twice the time per test command (at most ${MAX_TEST_MINUTES} min; the test_minutes setting is not changed), with no worker and no new try.`
  if (pick === 'stop') return `${said}: it is paused after its tests ran out of time twice; its work is kept.`
  return `${said}; it went back to work.`
}
