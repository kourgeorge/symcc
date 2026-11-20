// The record of running agent processes (T-474): one entry per worker, scout or checker process (its pid, agent id,
// task, folder, when it started, and the command it was started as), in the board folder (.symcc/processes.json).
// An entry is written when the process starts and removed when it ends, so a process an earlier run of the host left
// running (the host was killed, or reloaded) is still known after a fresh start: processAgents' stopLeftovers stops the
// ones still alive and drops the rest (stopOrphans in hooks/app/workers.ts calls it).
import type { Host } from '../host'

/** One running agent process. `command` is what it was started as (argv[0]), to tell it from a later process with its pid. */
export type ProcessEntry = { pid: number; agent: string; task?: string; folder?: string; started: string; command: string }

/** Where the record is kept: `file()` (asked each time, the board folder may only be known once the session started) on `fs`. */
export type ProcessRecord = { file: () => string; fs: Pick<Host['fs'], 'read' | 'write'> }

/** The file's name in the board folder. */
export const PROCESSES_FILE = 'processes.json'

/** The entries in the record's text; a missing or broken file, or a broken entry, counts as none. */
export function parseEntries(text: string | null): ProcessEntry[] {
  if (!text) return []
  try {
    const j = JSON.parse(text) as { processes?: unknown }
    const list = Array.isArray(j.processes) ? j.processes : []
    return list.filter((e): e is ProcessEntry => {
      const x = e as Partial<ProcessEntry> | null
      return !!x && Number.isInteger(x.pid) && (x.pid ?? 0) > 1 && typeof x.agent === 'string' && typeof x.command === 'string'
    })
  } catch {
    return []
  }
}

/** The record's text for `entries`. */
export const entriesText = (entries: readonly ProcessEntry[]): string => `${JSON.stringify({ processes: entries }, null, 2)}\n`

/**
 * Edits to one record, one at a time (an edit reads the file, changes the list and writes it back), so two process
 * ends at once never lose an entry. `idle()` waits until every edit asked for so far is written.
 */
export function recordEditor(r: ProcessRecord) {
  let chain: Promise<unknown> = Promise.resolve()
  const edit = <T>(fn: (entries: ProcessEntry[]) => Promise<{ entries: ProcessEntry[]; out: T }> | { entries: ProcessEntry[]; out: T }): Promise<T> => {
    const next = chain.then(async () => {
      const file = r.file()
      const before = parseEntries(await r.fs.read(file).catch(() => null))
      const { entries, out } = await fn(before)
      if (entriesText(entries) !== entriesText(before)) await r.fs.write(file, entriesText(entries))
      return out
    })
    chain = next.catch(() => undefined)
    return next
  }
  return { edit, idle: () => chain.then(() => undefined) }
}

/** The task id in an agent's name (e.g. "symcc-T-12" or "symcc checker T-12"), if it names one. */
export const taskInName = (name: string): string | undefined => /\bT-\d+\b/.exec(name)?.[0]
