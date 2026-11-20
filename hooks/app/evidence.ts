// Evidence events (T-660, core/evidence.ts) added to the activity log: a guard refusal, a "needs files" stop, a
// worker's question, a checker's verdict, a merge-queue outcome. Written in the background, after the decision, under
// the board lock (as the task events are, so two sessions never lose each other's lines); the caller never waits on
// it, and a failure to log is ignored: logging never changes or slows what the guard answers.
import type { Host } from '../host'
import { find } from '../board'
import { type EvidenceEvent, type EvidenceGuard, type EvidenceRole, cleanBit, cleanFiles, commandHead, problemCount, shortReason, WHAT_MAX } from '../core/evidence'
import type { CheckerVerdict } from '../core/checker'
import type { FileTouch } from '../host'
import { logEvents } from './events'
import { S } from './state'
import { load, locked } from './store'

/** The evidence writes started and not yet done (tests wait on them with evidenceWritten). */
let pending: Promise<unknown> = Promise.resolve()

/** Settles once every evidence write started so far is done (or failed). */
export const evidenceWritten = (): Promise<void> => pending.then(() => undefined)

/** Forgets the writes started so far (a plugin reload; tests). */
export function resetEvidence() {
  pending = Promise.resolve()
}

/**
 * Adds `e` to the activity log in the background. An event of a task with no `try` gets the task's try number from
 * the board. Never throws and never waits: it answers at once.
 */
export function logEvidence(host: Host, e: EvidenceEvent): void {
  try {
    if (!S.root) return
    const run = locked(host, async () => {
      let ev = e
      if (ev.task && ev.try === undefined) {
        const b = await load(host).catch(() => null)
        const t = b ? find(b, ev.task) : undefined
        ev = { ...ev, try: Number(t?.attempts) || 0 } as EvidenceEvent
      }
      await logEvents([ev], host)
    }).catch(() => undefined)
    pending = pending.then(() => run)
  } catch {
    // no log: the decision still stands
  }
}

const at = () => new Date().toISOString()

/** Who a refused call came from: its role and its task (or a scout's name). */
export type Who = { role: EvidenceRole; task?: string; scout?: string; try?: number }

/** A guard's refusal: the text the agent reads, which guard, and what it refused (a path, or git's command), when known. */
export type Refusal = { text: string; guard: EvidenceGuard; what?: string }

/** Logs refusal `r` of `who`'s call that touched `touch` (see logEvidence): a short cleaned reason, and the refused path or the command's head. */
export function logRefusal(host: Host, who: Who, r: Refusal, touch?: FileTouch | null): void {
  try {
    const what = r.what !== undefined ? cleanBit(r.what, WHAT_MAX) : touch ? ('command' in touch ? commandHead(touch.command) : cleanBit(touch.path, WHAT_MAX)) : undefined
    logEvidence(host, { kind: 'refused', at: at(), ...who, guard: r.guard, reason: shortReason(r.text), ...(what ? { what } : {}) })
  } catch {
    // no log: the decision still stands
  }
}

/** Logs a "needs files" stop of task `task` on try `n`: the files it asked for. */
export const logNeedsFiles = (host: Host, task: string, n: number, files: readonly string[]) => logEvidence(host, { kind: 'needs-files', at: at(), task, try: n, files: cleanFiles(files) })

/** Logs that a worker of task `task` asked the owner a question (no text). */
export const logAsked = (host: Host, task: string, n: number) => logEvidence(host, { kind: 'asked', at: at(), task, try: n })

/** Logs a checker's verdict on task `task` (null: none): ok, or problems with their count. */
export function logVerdict(host: Host, task: string, n: number, v: CheckerVerdict | null) {
  logEvidence(host, { kind: 'verdict', at: at(), task, try: n, verdict: !v ? 'none' : v.ok ? 'ok' : 'problems', ...(v && !v.ok ? { count: problemCount(v.report) } : {}) })
}

/** What a merge-queue turn gave, in the words checkAndMerge's result uses (see CheckResult in review.ts). */
export type QueueResult = { ok: boolean; merged?: string; review?: boolean; conflict?: boolean; timedOut?: number; command?: string }

/** Logs task `task`'s merge-queue outcome `r`: merged with its commit, stopped for review after the tests, tests failed or timed out (which command), a conflict, or not merged. */
export function logQueue(host: Host, task: string, n: number, r: QueueResult) {
  const outcome = r.ok ? (r.merged ? 'merged' : 'review') : r.conflict ? 'conflict' : r.timedOut ? 'timed-out' : r.command ? 'tests-failed' : 'not-merged'
  logEvidence(host, {
    kind: 'queue',
    at: at(),
    task,
    try: n,
    outcome,
    ...(r.command && !r.ok ? { command: commandHead(r.command, 4) } : {}),
    // a commit id is plain hex (it would look like a long random token to the cleaning); anything else is left out
    ...(r.ok && r.merged && /^[0-9a-f]{4,64}$/i.test(r.merged) ? { commit: r.merged } : {}),
  })
}
