// Task events (T-616): every board write (see writeBoard in store.ts) compares each task before and after and emits
// what changed (phaseEvents in core/events.ts). writeBoard itself keeps the activity log, .<name>/events.jsonl
// (logTaskEvents, under the board lock), and adds the history's stage lines (withStageHistory); the listeners here
// get the events only after the board lock is let go, so a listener may write the board itself.
import type { TaskEvent } from '../core/events'
import type { EvidenceEvent } from '../core/evidence'
import type { Host } from '../host'
import { S } from './state'

export type { TaskEvent } from '../core/events'

/** A listener gets the events of one board write (never empty), in order, and the host that wrote it. */
export type TaskEventListener = (events: readonly TaskEvent[], host: Host) => void | Promise<void>

/** The most lines kept in the activity log; older ones move to the archive (eventsArchiveFile). */
export const EVENT_LOG_LINES = 5000

/** The activity log, inside the project's data folder. */
export const eventsFile = () => `${S.root}/${S.N.dir}/events.jsonl`
/** Where the activity log's older lines go (T-660), so the history is never lost. */
export const eventsArchiveFile = () => `${S.root}/${S.N.dir}/events-archive.jsonl`

/** One line of the activity log: a task event (core/events.ts) or an evidence event (core/evidence.ts). */
export type LogEvent = TaskEvent | EvidenceEvent

/** Writes `text` to `file` through a temp file renamed over it (as the board is saved), so a crash never leaves half a line. */
async function writeWhole(host: Host, file: string, name: string, text: string) {
  const tmp = `${file}.tmp-${Math.random().toString(36).slice(2, 10)}`
  await host.fs.write(tmp, text)
  const r = await host.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) {
    await host.run(['rm', '-f', tmp]).catch(() => undefined)
    throw new Error(`couldn't save ${S.N.dir}/${name}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
  }
}

/**
 * Appends `events` to the activity log, one JSON line each, keeping the last EVENT_LOG_LINES lines; the older ones
 * are added to the end of the archive first (an archive that can't be written keeps them in the log for now).
 */
export async function logEvents(events: readonly LogEvent[], host: Host): Promise<void> {
  if (!S.root) return
  const file = eventsFile()
  const old = await host.fs.read(file).catch(() => '')
  let lines = [...String(old ?? '').split('\n').filter(l => l.trim()), ...events.map(e => JSON.stringify(e))]
  if (lines.length > EVENT_LOG_LINES) {
    const older = lines.slice(0, lines.length - EVENT_LOG_LINES)
    const arch = eventsArchiveFile()
    const kept = String((await host.fs.read(arch).catch(() => '')) ?? '')
    const moved = await writeWhole(host, arch, 'events-archive.jsonl', `${kept}${kept && !kept.endsWith('\n') ? '\n' : ''}${older.join('\n')}\n`).then(
      () => true,
      () => false,
    )
    // an archive that keeps failing never lets the log grow past twice its limit
    lines = lines.slice(moved ? -EVENT_LOG_LINES : -2 * EVENT_LOG_LINES)
  }
  await writeWhole(host, file, 'events.jsonl', lines.join('\n') + '\n')
}

const listeners = new Set<TaskEventListener>()
/** Listeners that failed and were already reported (each one is reported once). */
const failed = new WeakSet<object>()

/** Calls `fn` with the events of every board write from now on; answers a function that stops it. */
export function onTaskEvent(fn: TaskEventListener): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/** Reports a failed listener (or log write) `fn` once. Never throws. */
function reportOnce(host: Host, fn: object, what: string, e: unknown) {
  if (failed.has(fn)) return
  failed.add(fn)
  try {
    host.ui.toast(S.N.toast(`${what}: ${(e as Error)?.message ?? String(e)}`))
  } catch {
    // nothing more to do
  }
}

/** Appends `events` to the activity log (logEvents); a failure is reported once and never stops the board write. */
export async function logTaskEvents(host: Host, events: readonly TaskEvent[]): Promise<void> {
  if (!events.length) return
  await logEvents(events, host).catch(e => reportOnce(host, logEvents, 'the activity log was not written', e))
}

/**
 * Hands `events` to every listener, one after the other. A listener that throws (or whose promise fails) never
 * stops the others or the board write; the owner is told once per listener. Never throws. Called after the board
 * lock is let go (never inside `locked`), so a listener that writes the board (change) doesn't wait on itself.
 */
export async function emitTaskEvents(host: Host, events: readonly TaskEvent[]): Promise<void> {
  if (!events.length) return
  for (const fn of [...listeners]) {
    try {
      await fn(events, host)
    } catch (e) {
      reportOnce(host, fn, 'a task event listener failed', e)
    }
  }
}
