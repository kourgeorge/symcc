// Evidence events (T-660, core/evidence.ts): a guard refusal, a "needs files" stop, a worker's question, a checker's
// verdict, a merge-queue outcome. They go to their own file, .symcc/evidence.jsonl (never the activity log
// events.jsonl, which symcc reads and rewrites), each as one small append of one JSON line (appendLine), outside the
// board lock and its write queue, never waited on by the caller; a failure to log is ignored: logging never changes or
// slows what the guard answers. symcc never reads that file back or rewrites it, so no line can be lost; past
// EVIDENCE_MAX_BYTES the same append first renames it to evidence-archive-<time>.jsonl and starts a fresh one.
import type { Host } from '../host'
import { find, readBoard } from '../board'
import { type EvidenceEvent, type EvidenceGuard, type EvidenceRole, cleanBit, cleanFiles, commandHead, programName, problemCount, shortReason, WHAT_MAX } from '../core/evidence'
import type { CheckerVerdict } from '../core/checker'
import type { FileTouch } from '../host'
import { S } from './state'
import { path } from './store'

/** The evidence writes started and not yet done (tests wait on them with evidenceWritten). */
let pending: Promise<unknown> = Promise.resolve()

/** Settles once every evidence write started so far is done (or failed). */
export const evidenceWritten = (): Promise<void> => pending.then(() => undefined)

/** Forgets the writes started so far (a plugin reload; tests). */
export function resetEvidence() {
  pending = Promise.resolve()
}

/** The evidence file, inside the project's data folder. */
export const evidenceFile = () => `${S.root}/${S.N.dir}/evidence.jsonl`

/** Past this size the evidence file is renamed to an archive (evidenceArchiveFile) and a fresh one started. */
export const EVIDENCE_MAX_BYTES = 2 * 1024 * 1024

/** Where a full evidence file goes: evidence-archive-<UTC time>.jsonl, next to it. */
export const evidenceArchiveFile = (d = new Date()) => `${S.root}/${S.N.dir}/evidence-archive-${d.toISOString().replace(/[:.]/g, '-')}.jsonl`

/**
 * The shell script of one evidence append: $1 the line, $2 the file, $3 its size limit, $4 the archive. A file past
 * the limit (its size from `wc -c`, never read by symcc) is renamed to the archive first; then the line is appended.
 */
export const APPEND_SCRIPT = 'if [ -f "$2" ] && [ "$(wc -c < "$2")" -gt "$3" ]; then mv -n "$2" "$4"; fi; printf "%s\\n" "$1" >> "$2"'

/** Appends `line` and a newline to `file` with one shell command (no read by symcc, no lock), moving a full file to its archive first. */
async function appendLine(host: Host, file: string, line: string) {
  await host.run(['sh', '-c', APPEND_SCRIPT, 'sh', line, file, String(EVIDENCE_MAX_BYTES), evidenceArchiveFile()])
}

/** Task `id`'s try number, read from the board file without the lock (0 when it can't be read). */
async function tryOf(host: Host, id: string): Promise<number> {
  const text = await host.fs.read(path(S.N.boardFile)).catch(() => null)
  const r = readBoard(text)
  return r.broken ? 0 : Number(find(r.board, id)?.attempts) || 0
}

/**
 * Adds `e` to the evidence file in the background, as one appended line. An event of a task with no `try` gets the
 * task's try number from the board. Never throws and never waits: it answers at once.
 */
export function logEvidence(host: Host, e: EvidenceEvent): void {
  try {
    if (!S.root) return
    const file = evidenceFile()
    const run = (async () => {
      const ev = e.task && e.try === undefined ? ({ ...e, try: await tryOf(host, e.task) } as EvidenceEvent) : e
      await appendLine(host, file, JSON.stringify(ev))
    })().catch(() => undefined)
    pending = Promise.all([pending, run])
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
    const what = r.what !== undefined ? cleanBit(r.what, WHAT_MAX) : touch ? ('command' in touch ? programName(touch.command) : cleanBit(touch.path, WHAT_MAX)) : undefined
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
