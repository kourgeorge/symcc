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
export const timedOutTwiceQuestion = (id: string) => `${id}: the tests ran out of time twice; nothing failed. Run them again, or stop it?`

/** The choices for timedOutTwiceQuestion (T-510 will add one that gives the tests more time). */
export const TIMED_OUT_OPTIONS = ['Run the tests again', 'Stop it'] as const

/** The note of a task stopped by the owner after its tests ran out of time twice. */
export const TIMED_OUT_STOPPED_NOTE = 'stopped by the owner: the tests ran out of time twice; its work is kept in its folder and branch'

/** What the owner's answer to timedOutTwiceQuestion picks: run the tests again, stop it, or null (any other answer). */
export function parseTimedOutAnswer(answer: string): 'again' | 'stop' | null {
  const a = String(answer ?? '').trim().toLowerCase()
  if (!a) return null
  if (/^(run (the tests |them )?again|again|rerun|retest|run the tests)\b/.test(a)) return 'again'
  if (/^stop( it)?\b/.test(a)) return 'stop'
  return null
}

/** Whether task `t` waits for its tests to run again (they ran out of time once): "waiting", no question. */
export const rerunDue = (t: { status?: unknown; test_rerun?: unknown; question?: unknown }): boolean => t.status === 'waiting' && t.test_rerun === 1 && !t.question

/** Whether task `t` waits for the owner because its tests ran out of time twice. */
export const askedTimedOut = (t: { status?: unknown; test_rerun?: unknown; question?: unknown }): boolean => t.status === 'waiting' && t.test_rerun === 2 && !!t.question
