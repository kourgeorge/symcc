// Task events (T-616): every board write (see writeBoard in store.ts) compares each task before and after and emits
// what changed (phaseEvents in core/events.ts) to the listeners here. The first listener keeps the activity log,
// .<name>/events.jsonl; the history's stage lines are added to the board by writeBoard itself (withStageHistory).
import type { TaskEvent } from '../core/events'
import type { Host } from '../host'
import { S } from './state'

export type { TaskEvent } from '../core/events'

/** A listener gets the events of one board write (never empty), in order, and the host that wrote it. */
export type TaskEventListener = (events: readonly TaskEvent[], host: Host) => void | Promise<void>

/** The most lines kept in the activity log; older ones are dropped. */
export const EVENT_LOG_LINES = 5000

/** The activity log, inside the project's data folder. */
export const eventsFile = () => `${S.root}/${S.N.dir}/events.jsonl`

/** Appends `events` to the activity log, one JSON line each, keeping the last EVENT_LOG_LINES lines. */
export async function logEvents(events: readonly TaskEvent[], host: Host): Promise<void> {
  if (!S.root) return
  const file = eventsFile()
  const old = await host.fs.read(file).catch(() => '')
  const lines = [...String(old ?? '').split('\n').filter(l => l.trim()), ...events.map(e => JSON.stringify(e))]
  // a temp file renamed over the log (as the board is saved), so a crash never leaves half a line
  const tmp = `${file}.tmp-${Math.random().toString(36).slice(2, 10)}`
  await host.fs.write(tmp, lines.slice(-EVENT_LOG_LINES).join('\n') + '\n')
  const r = await host.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) {
    await host.run(['rm', '-f', tmp]).catch(() => undefined)
    throw new Error(`couldn't save ${S.N.dir}/events.jsonl: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
  }
}

const listeners = new Set<TaskEventListener>([logEvents])
/** Listeners that failed and were already reported (each one is reported once). */
const failed = new WeakSet<TaskEventListener>()

/** Calls `fn` with the events of every board write from now on; answers a function that stops it. */
export function onTaskEvent(fn: TaskEventListener): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/**
 * Hands `events` to every listener, one after the other. A listener that throws (or whose promise fails) never
 * stops the others or the board write; the owner is told once per listener. Never throws.
 */
export async function emitTaskEvents(host: Host, events: readonly TaskEvent[]): Promise<void> {
  if (!events.length) return
  for (const fn of [...listeners]) {
    try {
      await fn(events, host)
    } catch (e) {
      if (failed.has(fn)) continue
      failed.add(fn)
      try {
        host.ui.toast(S.N.toast(`a task event listener failed: ${(e as Error)?.message ?? String(e)}`))
      } catch {
        // nothing more to do
      }
    }
  }
}
