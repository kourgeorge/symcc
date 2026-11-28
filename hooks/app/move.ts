import type { Host } from '../host'
import { find, patchTask, withTimeline, endedBy, isInvestigation, intoOf, failedOnClash, gitNote, type BoardTask } from '../board'
import { S, finishing, movedAway } from './state'
import { load, change, now } from './store'
import { repoOf, taskGitReady, gitStateOfTask, projectNotes, projectGone, branchExists, prepareWorktree, taskBranch, worktreeDir } from './git'
import { haltChecker } from './checker'
import { stopWorker } from './board-mode'
import { checkingNow, mergingNow, MERGING_TEXT, CHECKING_TEXT, stopAsked, checkAgain, pump } from './workers'
import { mergeFinished } from './approve'

/** The stages the lead can move a task to (the `stage` of symcc change). */
export const STAGES = ['work', 'check', 'tests', 'review'] as const
type Stage = (typeof STAGES)[number]

const NOT_TESTED = 'not tested yet: moved to review by the lead'

/** The statuses a task can be moved from. */
const MOVABLE: readonly BoardTask['status'][] = ['todo', 'doing', 'failed', 'waiting', 'review']

/**
 * The lead moves task `id`, with its branch as it is, to `stage`: "work" (a new worker try), "check" (a fresh checker now, then
 * the merge line as usual), "tests" (the merge line now, no checker: it merges when its tests pass) or "review" (waits for the
 * owner). A running worker or checker is stopped first. Nothing here counts an automatic retry (the count starts over).
 */
export async function moveStage($: Host, id: string, word: string): Promise<string> {
  const stage = word.trim().toLowerCase() as Stage
  if (!STAGES.includes(stage)) throw new Error(`stage must be one of ${STAGES.join(', ')} (got "${word}")`)
  const t = find(await load($), id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (!MOVABLE.includes(t.status)) throw new Error(`${t.id} is ${t.status}; a task can be moved from todo, doing, failed, waiting or review`)
  if (mergingNow(t.id)) throw new Error(MERGING_TEXT(t.id))
  // A running worker may have half-done uncommitted edits: only "work" may stop it (a move never commits or deletes them).
  // Whether this session tracks the worker or not (another session's, or not found again after a reload).
  if (stage !== 'work' && t.status === 'doing' && !checkingNow(t.id) && t.live?.phase !== 'checker') throw new Error(`${t.id}'s worker is still running; move it to work, or wait until it hands back`)
  if (stage !== 'work') {
    if (isInvestigation(t)) throw new Error(`${t.id} is an investigation: it has no work to check, test or review`)
    if (projectGone(t)) throw new Error(`${t.id} can't be moved to ${stage} now: ${projectGone(t)}`)
    if (!(await branchExists($, taskBranch(t), repoOf(t)))) throw new Error(`${t.id} has no branch yet (no worker has made work for it); move it to work instead`)
    if (!(await taskGitReady($, await load($), t))) throw new Error(`${t.id} can't be moved to ${stage} now: ${projectGone(t) || gitNote(gitStateOfTask(t)) || projectNotes() || gitNote(S.gitState)}`)
  }
  const why = `moved to ${stage} by the lead`
  // The task is written in a status the old step can't write over; then what ran is stopped and let go of.
  let said = false // one timeline line per move
  const write = (status: BoardTask['status'], note: string, extra: Partial<BoardTask> = {}) =>
    change($, x => {
      const cur = find(x, t.id) ?? t
      const timeline = said ? cur.timeline : withTimeline(cur.timeline, now(), ['other', why])
      said = true
      return patchTask(x, t.id, { status, note, test_tries: 0, ...extra, timeline, ...endedBy(cur, now(), 'stopped', why) }, now(), S.N.dir)
    })
  if (checkingNow(t.id)) {
    // Only a checker can be stopped; prep, tests and the merge are let to end first.
    if (t.live?.checking && t.live.checking.step !== 'checker') throw new Error(`${CHECKING_TEXT(t.id)}; try again in a moment`)
    stopAsked.set(t.id, why)
    movedAway.add(t.id)
    await write(stage === 'work' ? 'todo' : 'review', why)
    await haltChecker($, t.id, why)
    for (const end = Date.now() + 15_000; finishing.has(t.id) && Date.now() < end; ) await $.clock.sleep(50)
    if (finishing.has(t.id)) throw new Error(`${t.id} is still stopping; try again in a moment`)
  } else if (t.status === 'doing') {
    await stopWorker($, t.id, why)
  }
  const now_ = find(await load($), t.id) ?? t
  const clash = failedOnClash(now_) || (now_.status !== 'failed' && !!now_.merge_main)
  if (stage === 'work') {
    // the made-up text of a move to review is no test output (reject clears it the same way)
    await write('todo', 'moved to work by the lead; queued', { merge_main: clash || undefined, ...(now_.test_output === NOT_TESTED ? { test_output: undefined } : {}) })
    void pump($)
    return `${t.id} moved to work: a new worker try is queued${clash ? '; it merges the latest main first' : ''}`
  }
  if (stage === 'review') {
    await write('review', 'moved to review by the lead: nothing merged yet; approve runs the tests', { test_output: NOT_TESTED })
    void pump($)
    return `${t.id} moved to review: it waits for the owner (approve runs its tests)`
  }
  const dir = worktreeDir(t.id)
  if (!(await $.fs.exists(`${dir}/.git`))) await prepareWorktree($, t, intoOf(t))
  if (stage === 'tests') {
    await write('review', 'moved to tests by the lead')
    const b = await load($)
    return mergeFinished($, b, find(b, t.id)!, 'merge', true)
  }
  // check: a fresh checker on the branch as it is, then the merge line
  await write('doing', 'moved to check by the lead', { live: { session: S.me, phase: 'checker', checking: { step: 'checker', at: now() } } })
  const cur = find(await load($), t.id)!
  void checkAgain($, cur, true).catch(() => undefined)
  return `${t.id} moved to check: a fresh checker starts on its branch (no new worker try)`
}
