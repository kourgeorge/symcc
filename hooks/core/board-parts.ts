// Keeping board.json small (T-675). Claude Code reads and writes a file whole and refuses one over 4 MiB, and a
// busy board grows by about a megabyte a day, nearly all of it from done and dropped tasks (their history, tries,
// details, origin and notes). So a finished task keeps only a short stub in board.json (STUB_KEYS, and `parts`: the
// file holding the rest), and the rest goes to a parts file of its own under .<name>/tasks/, one file per
// PARTS_PER_FILE task ids (tasks/T-600.json holds T-600 to T-649). Reading the board joins them back (joinParts),
// so every view, stats, search and task page still sees each task whole; saving splits them again (splitBoard).
// archive.json is split the same way, by size (archiveChunks): archive.json, archive-2.json, ... each kept under
// ARCHIVE_FILE_BYTES. Every function here is pure; app/store.ts and app/archive.ts read and write the files.
import type { SymccStatus } from '../../types'
import type { Board, BoardTask } from './board-file'
import { failReason } from './stats'

/** The folder (inside the data folder) that holds the finished tasks' parts files. */
export const PARTS_DIR = 'tasks'
/** How many task ids share one parts file. */
export const PARTS_PER_FILE = 50
/** The task fields a finished task keeps in board.json; everything else is in its parts file. */
export const STUB_KEYS = ['id', 'title', 'status', 'order', 'after', 'kind', 'role', 'attempts', 'branch', 'merge_into', 'merged', 'created_at', 'updated_at'] as const
/** The stub's field naming its parts file (relative to the data folder, e.g. "tasks/T-600.json"). */
export const PARTS_KEY = 'parts'

/** A file symcc reads whole: over this many bytes the lead and the board are warned (Claude Code refuses READ_LIMIT_BYTES). */
export const SIZE_WARN_BYTES = 3 * 1024 * 1024
/** The most one read or write may take in Claude Code (4 MiB). */
export const READ_LIMIT_BYTES = 4 * 1024 * 1024
/** One archive file is kept under this; a bigger archive goes on in archive-2.json, archive-3.json, ... */
export const ARCHIVE_FILE_BYTES = 2 * 1024 * 1024

const FINISHED: SymccStatus[] = ['done', 'dropped']

/** Whether task `t` keeps only a stub in board.json (done and dropped tasks). */
export const splits = (t: { status?: unknown }): boolean => FINISHED.includes(t?.status as SymccStatus)

/** The parts file of task `id`, relative to the data folder ("tasks/T-600.json" for T-600 to T-649); '' for an id with no number. */
export function partsFileOf(id: string): string {
  const m = /^T-(\d+)$/.exec(String(id ?? ''))
  if (!m) return ''
  const start = Math.floor(Number(m[1]) / PARTS_PER_FILE) * PARTS_PER_FILE
  return `${PARTS_DIR}/T-${start}.json`
}

/** A parts file's content: each task's parts by id. */
export type PartsFile = { version: 1; tasks: Record<string, Record<string, unknown>> }

/** A parts file's text: one line, the ids in order. */
export function partsText(tasks: Record<string, Record<string, unknown>>): string {
  const ids = Object.keys(tasks).sort((a, b) => idNum(a) - idNum(b) || a.localeCompare(b))
  return JSON.stringify({ version: 1, tasks: Object.fromEntries(ids.map(id => [id, tasks[id]])) }) + '\n'
}

const idNum = (id: string) => Number(/^T-(\d+)$/.exec(id)?.[1] ?? Number.MAX_SAFE_INTEGER)
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** A parts file's text read: its tasks' parts, or `broken` (the reason) when it is not a parts file. */
export function readParts(text: string): { tasks: Record<string, Record<string, unknown>>; broken?: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { tasks: {}, broken: `not valid JSON (${String((e as Error)?.message ?? e).slice(0, 120)})` }
  }
  if (!isObj(raw) || !isObj(raw.tasks)) return { tasks: {}, broken: 'it holds no "tasks" object' }
  return { tasks: Object.fromEntries(Object.entries(raw.tasks).filter(([, v]) => isObj(v))) as Record<string, Record<string, unknown>> }
}

/** A finished task's stub for board.json: STUB_KEYS only, and where the rest is. */
function stubOf(t: BoardTask, file: string): Record<string, unknown> {
  const x = t as unknown as Record<string, unknown>
  return { ...Object.fromEntries(STUB_KEYS.filter(k => k in x).map(k => [k, x[k]])), [PARTS_KEY]: file }
}

/** A finished task's parts: every field not in its stub. */
function partsOf(t: BoardTask): Record<string, unknown> {
  const keep = new Set<string>(STUB_KEYS)
  return Object.fromEntries(Object.entries(t).filter(([k]) => !keep.has(k)))
}

/**
 * Board `b` as saved: what board.json holds (each done and dropped task as a stub) and each parts file's tasks
 * (by file, relative to the data folder). A task whose id has no number stays whole in board.json, and so does one in
 * `whole` (T-681: its parts file is missing, so it is not written until the good one is put back).
 */
export function splitBoard(b: Board, whole?: Set<string>): { board: Record<string, unknown>; parts: Map<string, Record<string, Record<string, unknown>>> } {
  const parts = new Map<string, Record<string, Record<string, unknown>>>()
  const tasks = b.tasks.map(t => {
    const file = splits(t) && !whole?.has(t.id) ? partsFileOf(t.id) : ''
    if (!file) return t
    const inFile = parts.get(file) ?? {}
    inFile[t.id] = partsOf(t)
    parts.set(file, inFile)
    return stubOf(t, file)
  })
  return { board: { ...b, tasks }, parts }
}

/** The parts files board.json's parsed content `raw` names (each stub's `parts`), each once. */
export function partsFilesNamed(raw: unknown): string[] {
  if (!isObj(raw) || !Array.isArray(raw.tasks)) return []
  const out = new Set<string>()
  for (const t of raw.tasks) if (isObj(t) && typeof t[PARTS_KEY] === 'string' && safePartsFile(t[PARTS_KEY])) out.add(t[PARTS_KEY])
  return [...out]
}

/** Whether `f` is a parts file name symcc writes ("tasks/T-<n>.json"), so a hand-edited stub can't point elsewhere. */
export const safePartsFile = (f: unknown): f is string => typeof f === 'string' && new RegExp(`^${PARTS_DIR}/T-\\d+\\.json$`).test(f)

/**
 * board.json's parsed content `raw` with each stub joined with its parts (read from `files`: each parts file's tasks
 * by name; a file missing from it was not there), its `parts` field gone. Where its board.json fields and its parts
 * both have a field, board.json's wins. `missing`: what could not be found, in words (e.g. "T-612: its history,
 * tries and details are missing from tasks/T-600.json"); such a task loads as its stub alone. `stubbed`: those
 * tasks' ids and parts files, in the same order as `missing` (a save must not write their empty parts over a parts file put back later, T-681).
 */
export function joinParts(raw: unknown, files: Map<string, Record<string, Record<string, unknown>>>): { raw: unknown; missing: string[]; stubbed: { id: string; file: string }[] } {
  if (!isObj(raw) || !Array.isArray(raw.tasks)) return { raw, missing: [], stubbed: [] }
  const missing: string[] = []
  const stubbed: { id: string; file: string }[] = []
  const tasks = raw.tasks.map(t => {
    if (!isObj(t) || !(PARTS_KEY in t)) return t
    const { [PARTS_KEY]: file, ...stub } = t
    const parts = typeof file === 'string' ? files.get(file)?.[String(t.id)] : undefined
    if (!parts) {
      missing.push(`${String(t.id)}: its history, tries and details are missing from ${String(file)}`)
      stubbed.push({ id: String(t.id), file: String(file) })
      return stub
    }
    return { ...parts, ...stub }
  })
  return { raw: { ...raw, tasks }, missing, stubbed }
}

/** Whether board.json's parsed content `raw` still has a done or dropped task kept whole (a board from before T-675). */
export function hasWholeFinished(raw: unknown, held?: Set<string>): boolean {
  return isObj(raw) && Array.isArray(raw.tasks) && raw.tasks.some(t => isObj(t) && splits(t) && !(PARTS_KEY in t) && !!partsFileOf(String(t.id)) && !held?.has(partsFileOf(String(t.id))))
}

/** The fields a finished task leaves out of the board view file (OpenCode's TUI reads its parts file when its page opens). */
export const VIEW_LEFT_OUT = ['history', 'details', 'test_output', 'answer', 'suggested', 'research_notes'] as const

/** The view task's field with the times of its history lines the Live tab's "today" counts (VIEW_MARK_KINDS), without their text. */
export const VIEW_MARKS_KEY = 'history_marks'
/** The history kinds whose times a finished view task keeps (merges, the checker's send-backs and the 'failed' lines of tests failed or a clash with main, see core/live.ts liveToday). */
export const VIEW_MARK_KINDS: readonly string[] = ['merged', 'checker-problems', 'failed']
/** A history line's kind and time, as a finished view task keeps it. */
export type ViewMark = { kind: string; at?: string }

/** The history marks of view task `t`: its own `history_marks` when it is a finished one slimmed by viewTask, else undefined. */
export function viewMarks(t: object): ViewMark[] | undefined {
  const m = (t as Record<string, unknown>)[VIEW_MARKS_KEY]
  return Array.isArray(m) ? (m.filter(isObj) as ViewMark[]) : undefined
}

/**
 * A task as the board view file carries it: an open task whole; a done or dropped one without its long parts
 * (VIEW_LEFT_OUT, and its origin's request and evidence), with `parts` naming the file that has them. Its tries stay,
 * for the totals, and so do the kinds and times of its merge and send-back lines (VIEW_MARKS_KEY), for the Live tab's today.
 */
export function viewTask<T extends { id: string; status: SymccStatus }>(t: T): T {
  const file = splits(t) ? partsFileOf(t.id) : ''
  if (!file) return t
  const x = { ...t } as Record<string, unknown>
  const history = Array.isArray(x.history) ? x.history.filter(isObj) : []
  x[VIEW_MARKS_KEY] = history.filter(h => VIEW_MARK_KINDS.includes(String(h.kind)) && (h.kind !== 'failed' || ['tests', 'clash'].includes(String(failReason(String(h.text)))))).map(h => ({ kind: String(h.kind), ...(typeof h.at === 'string' ? { at: h.at } : {}) }))
  for (const k of VIEW_LEFT_OUT) delete x[k]
  if (isObj(x.origin)) {
    const { request: _r, evidence: _e, ...origin } = x.origin
    x.origin = origin
  }
  return { ...x, [PARTS_KEY]: file } as unknown as T
}

/**
 * View task `t` safe to draw while its parts are not (yet) read: a task viewTask slimmed gets an empty `details` and
 * `history` where they are missing (pages read both). Any other task comes back as it is.
 */
export function viewStubFilled<T extends object>(t: T): T {
  const x = t as Record<string, unknown>
  if (!(PARTS_KEY in x) || (typeof x.details === 'string' && Array.isArray(x.history))) return t
  return { ...x, details: typeof x.details === 'string' ? x.details : '', history: Array.isArray(x.history) ? x.history : [] } as T
}

/** View task `t` with its parts (from its parts file's text) put back; `t` itself when it has none or they can't be read. */
export function withViewParts<T extends object>(t: T, text: string | null): T {
  const file = (t as Record<string, unknown>)[PARTS_KEY]
  if (typeof file !== 'string' || text === null) return t
  const r = readParts(text)
  const parts = r.tasks[String((t as Record<string, unknown>).id)]
  if (!parts) return t
  const { [PARTS_KEY]: _f, [VIEW_MARKS_KEY]: _m, ...own } = t as Record<string, unknown>
  return { ...parts, ...own, ...(isObj(parts.origin) && isObj(own.origin) ? { origin: { ...parts.origin, ...own.origin } } : {}) } as T
}

/** The archive files, in order: archive.json, then archive-2.json, archive-3.json, ... (`base` is archive.json's path). */
export const archiveChunkFile = (base: string, i: number) => (i === 0 ? base : base.replace(/\.json$/, `-${i + 1}.json`))

/**
 * The archive's tasks packed into files in order, each under `maxBytes` (a single bigger task still gets a file of
 * its own): their texts, the first for archive.json. Packing always starts from the first task, so adding tasks only
 * changes the last file(s). An empty archive is one file with no tasks.
 */
export function archiveChunks(tasks: readonly unknown[], maxBytes = ARCHIVE_FILE_BYTES): string[] {
  const head = '{"version":1,"tasks":[\n'
  const tail = '\n]}\n'
  const out: string[] = []
  let cur: string[] = []
  let size = head.length + tail.length
  for (const t of tasks) {
    const line = JSON.stringify(t)
    const add = utf8Bytes(line) + 2
    if (cur.length && size + add > maxBytes) {
      out.push(head + cur.join(',\n') + tail)
      cur = []
      size = head.length + tail.length
    }
    cur.push(line)
    size += add
  }
  out.push(head + cur.join(',\n') + tail)
  return out
}

/** How many bytes `text` takes as UTF-8. */
export function utf8Bytes(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4
      i++
    } else n += 3
  }
  return n
}

/** Bytes as the owner reads them: "3.2 MB" (MB here is 1024 × 1024 bytes, as the 4 MB limit is). */
export const mbText = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/** The warning for file `file` (as the owner knows it, e.g. ".symcc/board.json") of `bytes` bytes, past SIZE_WARN_BYTES. */
export const sizeWarnText = (file: string, bytes: number) =>
  bytes > READ_LIMIT_BYTES
    ? `${file} is ${mbText(bytes)}, over the 4 MB limit on reading or writing one file, so symcc can't read it`
    : `${file} is ${mbText(bytes)}, close to the 4 MB limit on reading or writing one file; past it symcc can't read it`

/** `text` with every sizeWarnText warning in it put short, for a narrow line (T-748): "board.json 3.8 MB, near the
 *  4 MB limit"; over the limit (a sizeWarnText or tooBigText) the key words come first and the folder goes, so it
 *  fits the status line (T-763): "board.json 4.2 MB: too big, can't read it" (or "write"). Other text stays
 *  as it is. */
export const shortSizeWarns = (text: string) =>
  text
    .replace(/(\S+) is ([\d.]+ MB), over the 4 MB limit on (?:reading or writing|reading|writing) one file, so symcc can't (read|write) it(?:; nothing that needs it works until it is smaller)?/g,
      (_m, file: string, mb: string, doing: string) => `${file.split('/').pop()} ${mb}: too big, can't ${doing} it`)
    .replace(/(\S+) is ([\d.]+ MB), close to the 4 MB limit on reading or writing one file; past it symcc can't read it/g, '$1 $2, near the 4 MB limit')

/** The error for file `file` of `bytes` bytes, too big to be read (or written). */
export const tooBigText = (file: string, bytes: number, doing: 'read' | 'write' = 'read') =>
  `${file} is ${mbText(bytes)}, over the 4 MB limit on ${doing === 'read' ? 'reading' : 'writing'} one file, so symcc can't ${doing} it; nothing that needs it works until it is smaller`

/**
 * What makes a board big, per field across its tasks (each field's JSON bytes, history counted per entry kind too),
 * biggest first: for finding what to keep out of board.json.
 */
export function fieldSizes(b: { tasks?: unknown }): { field: string; bytes: number }[] {
  const sum = new Map<string, number>()
  const add = (k: string, n: number) => sum.set(k, (sum.get(k) ?? 0) + n)
  for (const t of Array.isArray(b?.tasks) ? b.tasks : []) {
    if (!isObj(t)) continue
    for (const [k, v] of Object.entries(t)) {
      add(k, utf8Bytes(JSON.stringify(v) ?? ''))
      if (k === 'history' && Array.isArray(v)) for (const e of v) if (isObj(e)) add(`history:${String(e.kind)}`, utf8Bytes(JSON.stringify(e)))
      if (k === 'origin' && isObj(v)) for (const [ok, ov] of Object.entries(v)) add(`origin.${ok}`, utf8Bytes(JSON.stringify(ov) ?? ''))
    }
  }
  return [...sum].map(([field, bytes]) => ({ field, bytes })).sort((a, b) => b.bytes - a.bytes)
}

/**
 * board.json's text `text` with each stub joined with its parts again, as board.json text (`partsOf(rel)`: the text
 * of parts file `rel`, e.g. "tasks/T-600.json", null when it is missing). For reading a saved board whole from its
 * files alone (tests, probes); text that is not JSON is given back as it is.
 */
export function joinedText(text: string, partsOf: (rel: string) => string | null): string {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return text
  }
  const files = new Map<string, Record<string, Record<string, unknown>>>()
  for (const rel of partsFilesNamed(raw)) {
    const t = partsOf(rel)
    if (t !== null) files.set(rel, readParts(t).tasks)
  }
  return JSON.stringify(joinParts(raw, files).raw)
}
