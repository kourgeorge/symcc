// T-755: Approve, Done and Merge now, moved out of workers.ts (imports go one way: this file imports workers.ts, never back).
import type { SymccTask } from '../../types'
import { PREP_NOTE, type Board, type BoardTask, patchTask, putTask, find, DEFAULT_AUTO_RETRIES, reviewTask, ownerEditedLine, gitNote, intoOf, emptyBoard, withTimeline, tryEntry, resultEntry, FINISH_BEAT_MS, finishLimitMs, mergeTestCount, testMinutesOf, waitsForFiles, isInvestigation, shortSha } from '../board'
import { workspaceNow, projectNames, projectGone, taskGitReady, gitStateOfTask, projectNotes } from './git'
import { prepareWorktree, worktreeDir } from './worktree'
import { type CheckResult, checkAndMerge, recordCommits } from './review'
import { ownerEdits } from './changes'
import type { TurnLimit } from './merge-line'
import { S, approving } from './state'
import { type Host } from '../host'
import { load, change, now } from './store'
import { tellLead } from './tell'
import { OVER, endCheck, endInvestigation, everyMs, holdForFiles, landIfMerged, markChecking, offAsked, outcomes, pump, ranOverText, ranOverTry, settle, stopAsked, waitIfBranchGone, withLimit } from './workers'

/** How task `id`'s last Approve, Done, Keep as a note or Merge now ended (see outcomes); undefined when none ran. */
export const mergeOutcome = (id: string) => outcomes.get(id)

/**
 * The owner approved task `id` (in "review"): the same checked merge as for a finished worker. An answered
 * investigation has nothing to merge: approve is its Done (see endInvestigation), and `keepNote` its Keep as a note.
 */
export async function approve(host: Host, id: string, keepNote = false): Promise<string> {
  if (!approving.has(id)) outcomes.set(id, 'failed')
  const b = await load(host)
  const t = reviewTask(b, id, 'approve')
  // T-1182: the note is a docs task, which needs a project on a board over several repos
  if (isInvestigation(t) && keepNote && workspaceNow() && !t.project) throw new Error(`${t.id} has no project, and a note is a docs task that needs one on a board over several repos (${projectNames().join(', ')}): give ${t.id} a project (${S.N.name} change project), then keep it as a note`)
  if (isInvestigation(t)) return endInvestigation(host, t, keepNote)
  if (keepNote) throw new Error(`${t.id} is a change task: keep_note is only for an answered investigation. Approve it without keep_note to merge it.`)
  return mergeFinished(host, b, t, 'approve')
}

/**
 * Task `id`'s finished work waits only for the owner's files (BoardTask.live?.merge_wait): only the merge
 * step runs again, with no worker (brought up to date, tested only if its branch moved, then
 * merged). A task in review (an approve that was blocked) is approved again.
 */
export async function mergeWaiting(host: Host, id: string): Promise<string> {
  if (!approving.has(id)) outcomes.set(id, 'failed')
  const b = await load(host)
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (!waitsForFiles(t)) return `${t.id} is not waiting for your files`
  return mergeFinished(host, b, t, t.status === 'review' ? 'approve' : 'merge')
}

/**
 * Merges task `t`'s finished work: `kind` 'approve' (the owner approved it, in "review") or 'merge'
 * (it was "waiting" only for the owner's files). The same checked merge as for a finished worker.
 */
export async function mergeFinished(host: Host, b: Board, t: SymccTask, kind: 'approve' | 'merge', force = false): Promise<string> {
  const stays = kind === 'approve' ? 'stays in review' : 'keeps waiting'
  if (approving.has(t.id)) return `${t.id} is already being merged`
  if (!(await taskGitReady(host, b, t))) return `${t.id} ${stays}: ${projectGone(t) || gitNote(gitStateOfTask(t)) || projectNotes() || gitNote(S.gitState)}`
  if (await waitIfBranchGone(host, b, t, 'merge')) return `${t.id} was not merged: the branch it merges into, ${intoOf(t)}, is gone; it now waits for your answer`
  approving.add(t.id)
  // The same time limit as a finished worker's check (finishLimitMs): past it the merge is
  // given up (mergeRanOver), so it no longer holds the task, its id or the branch's merge turn.
  // It may still wake up later, but then it merges nothing and writes nothing (gaveUp).
  const limitMs = finishLimitMs(mergeTestCount(b, t), testMinutesOf(b))
  // The step shown on the board (BoardTask.live?.checking) is refreshed like a finishing mark, and removed when the merge ends or is given up.
  const beat = everyMs(host, FINISH_BEAT_MS, () => void markChecking(host, t.id, t.status, t.attempts).catch(() => undefined))
  try {
    const how = await withLimit(host, limitMs, (gaveUp, over, limit) => mergeWork(host, t, b, kind, gaveUp, over, limit, force))
    if (how !== OVER) return how
    beat?.cancel()
    await markChecking(host, t.id, t.status, t.attempts, false).catch(() => undefined)
    approving.delete(t.id)
    await endCheck(host, t.id)
    const out = await mergeRanOver(host, t.id, t.status, kind, limitMs)
    void pump(host)
    return out
  } finally {
    beat?.cancel()
    await markChecking(host, t.id, t.status, t.attempts, false).catch(() => undefined)
  }
}

/**
 * The merge turn of task `id` (an approve, or a merge waiting for the owner's files) ran over its limit (`limitMs`, see
 * finishLimitMs) and was given up, while the task is still `status`. An approve is not a try: the task stays in review
 * with a note and a timeline line saying so. A merge waiting for the owner's files is one normal failed try
 * (ranOverTry): a new try while it has automatic retries left, else failed. The lead is told once. Should the work
 * still land later, landedLate marks it done.
 */
async function mergeRanOver(host: Host, id: string, status: SymccTask['status'], kind: 'approve' | 'merge', limitMs: number): Promise<string> {
  const min = Math.round(limitMs / 60_000)
  let retries = DEFAULT_AUTO_RETRIES
  const out = await change(host, x => {
    const cur = find(x, id)
    if (cur?.status !== status) return [x, null] as [Board, null]
    if (kind === 'merge') {
      retries = x.auto_retries ?? DEFAULT_AUTO_RETRIES
      const next = ranOverTry(cur, min, retries)
      return [putTask(x, next), next] as [Board, BoardTask]
    }
    const y = patchTask(x, id, { note: `approved, but the merge ran over ${min} min and was given up; approve it again`, live: { merge_wait: undefined }, timeline: withTimeline(cur.timeline, now(), resultEntry(cur, 'failed', 'approved by the owner', `its checking and merging ran over ${min} min and was given up; nothing written, it stays ${STATUS_WORD_OF(status)}`, { by: 'you' })) }, now())
    return [y, cur] as [Board, BoardTask]
  }).catch(() => null)
  const late = out ? null : find(await load(host).catch(() => null) ?? emptyBoard(), id)
  if (late?.status === 'done' && late.merged) return `${id} is done: its checking and merging ran over ${min} minutes, but its work was merged into ${intoOf(late)} (${shortSha(late.merged)}) after all.`
  if (kind === 'approve') {
    if (out) tellLead(host, `${id} "${out.title}": the owner's approve ran over ${min} minutes and seemed stuck, so I stopped waiting for it. It stays in review; approve it again to retry the merge.`)
    return `${id} was not merged and stays in review: its checking and merging ran over ${min} minutes and was given up. Approve it again.`
  }
  if (out) tellLead(host, ranOverText(out, min, retries))
  if (out?.status === 'failed') return `${id} was not merged and failed: its checking and merging ran over ${min} minutes and was stopped, with no automatic retries left.`
  return `${id} was not merged: its checking and merging ran over ${min} minutes and was stopped, so it counts as a failed try; a new try starts on its own.`
}

/** How a status is said in a timeline line: "in review", "waiting". */
const STATUS_WORD_OF = (s: SymccTask['status']) => (s === 'review' ? 'in review' : s)

/** The body of mergeFinished, once the task is marked as being merged. `gaveUp`, `release`, `limit`: as for finishWork. */
async function mergeWork(host: Host, t: SymccTask, b: Board, kind: 'approve' | 'merge', gaveUp: () => boolean, release: Promise<unknown>, limit?: TurnLimit, force = false): Promise<string> {
  const status = t.status
  const stays = kind === 'approve' ? 'stays in review' : 'keeps waiting'
  const who: 'you' | 'lead' | 'symcc' = force ? 'lead' : kind === 'approve' ? 'you' : 'symcc'
  const by = force ? 'moved to tests by the lead' : kind === 'approve' ? 'approved by the owner' : 'merged once your files were out of the way'
  try {
    const dir = worktreeDir(t.id)
    if (!(await host.fs.exists(`${dir}/.git`))) await prepareWorktree(host, t, intoOf(t))
    // The owner's own edits in the folder since review (or edits whose tests failed on an
    // earlier approve, kept as test_output): those are committed with the task and always tested.
    const edits = await ownerEdits(host, t, dir).catch(() => [] as string[])
    const retest = force || edits.length > 0 || (kind === 'approve' && t.test_output !== undefined)
    if (gaveUp()) return ''
    await change(host, x => {
      const cur = find(x, t.id)
      if (cur?.status !== status || gaveUp()) return x
      return patchTask(x, t.id, { note: PREP_NOTE, ...(edits.length ? { timeline: withTimeline(cur.timeline, now(), ['files-widened', ownerEditedLine(edits)]) } : {}) }, now())
    })
    const made: string[] = []
    const stop = () => (gaveUp() ? 'given up after running too long' : stopAsked.get(t.id))
    const r: CheckResult = await checkAndMerge(host, t, dir, b, force && kind === 'merge' ? 'finish' : kind, made, stop, retest, release, limit).catch((e: Error) => ({ ok: false, reason: 'other' as const, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    // Given up meanwhile: mergeRanOver already wrote its note; this late outcome is not written over
    // it, unless the work reached the branch after all (landedLate).
    if (gaveUp()) {
      await landIfMerged(host, t, r.merged, made, kind, status)
      return ''
    }
    await recordCommits(host, t.id, made, r.merged, r.size)
    const cur = find(await load(host), t.id)
    if (r.ok && r.review && !r.merged) {
      // A move to tests in board mode "review": the tests passed; it waits for the owner's approve like any finished task.
      // T-1081: written like a finished try's review (timeline line, untested flag, secrets text, the real detail)
      await settle(host, t, b, r, by, dir, undefined, false, undefined, who)
      await change(host, x => (find(x, t.id)?.status === 'review' ? patchTask(x, t.id, { live: { merge_wait: undefined } }, now()) : x))
      return `${t.id} passed its tests and is ready for review (nothing merged yet); approve it to merge`
    }
    if (r.merged) {
      outcomes.set(t.id, 'merged')
      // The work is on the target branch: the task is done, whatever happened to it meanwhile
      // (settle marks it done; when it changed meanwhile, with a line saying the change came too late).
      const sha = shortSha(r.merged)
      if (!cur) {
        tellLead(host, `${t.id} "${t.title}" was merged into ${intoOf(t)} (${sha}), but it is no longer on the board.`)
        return `${t.id} was merged into ${intoOf(t)} (${sha}), but it is no longer on the board`
      }
      await settle(host, t, b, r, by, dir, undefined, kind === 'approve', kind === 'approve' ? 'approved' : undefined, who)
      const off = offAsked.get(t.id)
      if (off && cur.status === status) {
        await change(host, x => {
          const c = find(x, t.id)
          return c?.status === 'done' ? patchTask(x, t.id, { timeline: withTimeline(c.timeline, now(), tryEntry(t, 'merged', `${off} while it was being merged, too late: the work was already merged, so it stays done`)) }, now()) : x
        })
        return `${t.id} was merged into ${intoOf(t)} (${sha}) before ${off}; it is done`
      }
      return cur.status === status ? `${t.id} ${kind === 'approve' ? 'approved and merged' : 'merged'}: ${r.detail}` : `${t.id} was merged into ${intoOf(t)} (${sha}) before it was ${cur.status}; it is done`
    }
    if (cur?.status !== status) return `${t.id} changed while it was being merged (it is now ${cur?.status ?? 'gone'}); nothing was merged`
    const off = offAsked.get(t.id)
    if (off) {
      const again = kind === 'approve' ? 'approve it again' : 'it merges at a later check'
      await change(host, x => {
        const c = find(x, t.id)
        return c?.status === status ? patchTask(x, t.id, { note: `${kind === 'approve' ? 'approved, but ' : ''}not merged: ${off} first; ${again}`, timeline: withTimeline(c.timeline, now(), resultEntry(t, 'not-merged', by.replace(/^merged /, 'merging '), `not merged: ${off} while it was being merged; it ${stays}`, { by: who })) }, now()) : x
      })
      return `${t.id} was not merged and ${stays}: ${off} while it was being merged. ${kind === 'approve' ? 'Approve it again.' : `Retry it, or it merges at a later check.`}`
    }
    // T-440: the branch it merges into was deleted while it was being merged: it waits with the "branch is gone" question
    if (r.gone && (await waitIfBranchGone(host, b, t, 'merge'))) return `${t.id} was not merged: the branch it merges into, ${intoOf(t)}, is gone; it now waits for your answer`
    if (r.blocked) {
      // Only the owner's files are in the way: it waits for them (merge_wait); the regular check merges it once they are clear.
      await holdForFiles(host, t, b, r, resultEntry(t, 'try-result', kind === 'approve' ? 'approved by the owner' : 'merging again', r.detail, { by: who }), dir, undefined, kind === 'approve')
      return `${t.id} was not merged and ${stays}: ${r.detail}.`
    }
    if (kind === 'approve' && retest && r.testOutput !== undefined) {
      // The owner's edits fail the tests: it stays in review with the output, not sent to a worker.
      const folder = `${S.N.dir}/worktrees/${t.id}`
      await change(host, x => {
        const c = find(x, t.id)
        return c?.status === 'review' ? patchTask(x, t.id, { note: `approved, but your edits fail the tests: ${r.detail.slice(0, 220)}`, live: { merge_wait: undefined }, test_output: r.testOutput, timeline: withTimeline(c.timeline, now(), resultEntry(t, 'approve-failed', 'approved by the owner', `not merged, the tests failed after your edits: ${r.detail.slice(0, 250)}`)) }, now()) : x
      })
      tellLead(host, `${t.id} "${t.title}" was not merged: with the owner's edits the tests fail. It stays in review; the owner can fix the files in ${folder} and approve again.\n${r.testOutput}`)
      return `${t.id} was not merged and stays in review: ${r.detail}. Fix the files in ${folder}, then approve it again (the tests run again).`
    }
    if (kind === 'approve' && !r.ok && !r.conflict && r.testOutput === undefined) {
      // Not the work's fault (e.g. the owner's files could not be updated): it stays in review.
      await change(host, x => (find(x, t.id)?.status === 'review' ? patchTask(x, t.id, { note: `approved, but not merged: ${r.detail.slice(0, 250)}`, live: { merge_wait: undefined } }, now()) : x))
      // An answer that already says to approve again needs no more advice; anything else gets it here.
      const next = /approve \S+ again$/.test(r.detail) ? '.' : '. Fix that, then approve it again.'
      return `${t.id} was not merged and stays in review: ${r.detail}${next}`
    }
    await settle(host, cur, b, r, by, dir, undefined, false, kind === 'approve' ? 'approved' : undefined, who)
    if (r.ok) outcomes.set(t.id, 'merged')
    const label = kind === 'approve' ? 'approved, but not merged' : 'not merged'
    return r.ok ? `${t.id} ${kind === 'approve' ? 'approved and merged' : 'merged'}: ${r.detail}` : `${t.id} ${label}: ${r.detail}${r.conflict || r.testOutput !== undefined ? ' (see the board for what happens next)' : ''}`
  } finally {
    // Given up: mergeFinished already let go of the id (a new merge may hold it now) and ended the check.
    if (!gaveUp()) {
      approving.delete(t.id)
      await endCheck(host, t.id)
      void pump(host) // after the check: a task sent back to "todo" (or resumed meanwhile) starts again
    }
  }
}
