// The board file itself: its shape, loading it safely, the lock, and finding a task.
import type { SymccMode, SymccRun, SymccStatus, SymccTask, SymccTokens } from '../../types'
import { dataDir, namesFor } from '../name'
import { cleanTokens } from './runs'
import { parseStamp } from './text'

export type Board = {
  version: 1
  next_id: number
  /** off: nothing runs; review: work runs and finished work waits for the owner; auto (the default): finished work that passes merges on its own */
  mode: SymccMode
  /** shell commands that must pass before a task's work is merged */
  test_commands: string[]
  target_branch: string
  max_parallel: number
  /** a worker running longer than this is stopped and its task marked failed */
  max_minutes: number
  /** how many new tries a task gets on its own after its tests fail, before it is marked failed */
  auto_retries: number
  /** open the board panel by itself when a session starts (true unless turned off) */
  open_on_start: boolean
  /**
   * what plays when a task is merged or a question waits for the owner: off, sound (a chime) or
   * voice ("T-3 done"); absent: the best this machine can play (see notifyOf)
   */
  notify?: Notify
  /** the whole plugin on or off (/<name>-on, /<name>-off); off: Claude works as normal, the board is kept. true unless turned off */
  enabled: boolean
  /** done and dropped tasks older than this many days move to archive.json (0 = never) */
  archive_days: number
  tasks: BoardTask[]
  /** what was moved to archive.json: counts and the tries' totals, so views don't read the archive */
  archived?: ArchivedTotals
  /** the ids of archived tasks that were done, so a task waiting on one still starts */
  archived_done?: string[]
}

/** What plays when a task is merged or waits for the owner. */
export type Notify = 'off' | 'sound' | 'voice'
export const NOTIFY_CHOICES: Notify[] = ['off', 'sound', 'voice']
export const isNotify = (x: unknown): x is Notify => NOTIFY_CHOICES.includes(x as Notify)

/** The running totals of archived tasks: how many were done and dropped, and their tries' time, tokens and cost. */
export type ArchivedTotals = { done: number; dropped: number; tries: number; ms: number; tokens?: SymccTokens; cost?: number }

/**
 * A task as the board file keeps it: while it is "doing", `session` names the session whose
 * worker owns it; `agent` is the agent id of the last worker started on it.
 */
export type BoardTask = SymccTask & { session?: string }

/** The data folder for the default name; the paths below are for it too. For another name use namesFor(name). */
export const DATA_DIR = dataDir()
export const BOARD_FILE = namesFor().boardFile
/** held by one session while it reads, changes and writes the board */
export const LOCK_FILE = namesFor().lockFile
/** a lock older than this was left by a session that died, and may be taken over */
export const LOCK_STALE_MS = 30_000

export type Lock = { session: string; at: number }

export const lockText = (session: string, at: number) => JSON.stringify({ session, at }) + '\n'

export function parseLock(text: string | null): Lock | null {
  return parseStamp(text, 'at', true)
}

/**
 * Whether a lock may be taken over: it is older than LOCK_STALE_MS (or dated far in
 * the future, a broken clock). A lock we can't read is judged by the file's own time.
 */
export function isLockStale(text: string | null, nowMs: number, fileMs?: number, maxAgeMs = LOCK_STALE_MS): boolean {
  const at = parseLock(text)?.at ?? fileMs
  if (at === undefined || !Number.isFinite(at)) return true
  return nowMs - at > maxAgeMs || at - nowMs > maxAgeMs
}
/** Names of the temp files takeLock and writeLead leave behind if their session is killed. */
const LEFTOVER_TMP = /^(?:board\.lock|lead\.json)\.[\w.-]+\.tmp$/

/**
 * Which files in the data folder are leftover temp files that may be deleted: only
 * board.lock.<session>.tmp and lead.json.<session>.tmp, and only once they are older than
 * maxAgeMs (a fresh one may still be in use by another session). A file with no usable
 * time, or dated in the future, is kept. Anything else (board.json, lead.json, ...) is never chosen.
 */
export function leftoverTmpFiles(files: { name: string; mtimeMs?: number }[], nowMs: number, maxAgeMs = LOCK_STALE_MS): string[] {
  if (!Array.isArray(files) || !Number.isFinite(nowMs)) return []
  return files
    .filter(f => typeof f?.name === 'string' && LEFTOVER_TMP.test(f.name))
    .filter(f => typeof f.mtimeMs === 'number' && Number.isFinite(f.mtimeMs) && f.mtimeMs <= nowMs && nowMs - f.mtimeMs > maxAgeMs)
    .map(f => f.name)
}
/** Open work. Backlog tasks are not open: they never start and block nothing (see BACKLOG_FROM). */
export const OPEN: SymccStatus[] = ['todo', 'doing', 'paused', 'waiting', 'review', 'failed']

/** The states a task may be stashed into the backlog from ("doing" only after its worker is stopped). */
export const BACKLOG_FROM: SymccStatus[] = ['todo', 'doing', 'paused', 'failed']

/** How many automatic retries after failing tests a new board allows. */
export const DEFAULT_AUTO_RETRIES = 2

/** How many days a done or dropped task stays on the board before it is archived, on a new board (0 = never). */
export const DEFAULT_ARCHIVE_DAYS = 14

/** A new board; `target_branch` is where finished work is merged (see startBranch for a new project). */
export function emptyBoard(target_branch = 'main'): Board {
  return { version: 1, next_id: 1, mode: 'auto', test_commands: [], target_branch, max_parallel: 3, max_minutes: 45, auto_retries: DEFAULT_AUTO_RETRIES, open_on_start: true, enabled: true, archive_days: DEFAULT_ARCHIVE_DAYS, tasks: [] }
}

/** What reading board.json found: the board, and what was wrong with the file (if anything). */
export type BoardRead = {
  board: Board
  /** set when the file can't be read at all (not JSON, or not a board): the reason. Never save over such a file. */
  broken?: string
  /** how many task entries were skipped because they were not a task (null, wrong shape, a repeated id) */
  skipped: number
  /** the settings whose value was bad and were set to their default */
  fixed: string[]
  /** how many tasks (and the archived totals, counted as one) were brought to the current shape (see migrateTask); the board should then be saved once */
  migrated: number
}

const STATUSES: SymccStatus[] = ['backlog', 'todo', 'doing', 'paused', 'waiting', 'review', 'failed', 'done', 'dropped']

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Each setting with the test its value must pass; a value that fails is replaced by the default. */
const SETTING_OK: { [K in Exclude<keyof Board, 'version' | 'tasks' | 'next_id' | 'archived' | 'archived_done'>]: (v: unknown) => boolean } = {
  mode: v => isMode(v),
  test_commands: v => Array.isArray(v) && v.every(c => typeof c === 'string'),
  target_branch: v => typeof v === 'string' && v.trim() !== '',
  max_parallel: v => isNum(v) && v >= 0,
  max_minutes: v => isNum(v) && v >= 0,
  auto_retries: v => isNum(v) && v >= 0,
  open_on_start: v => typeof v === 'boolean',
  notify: v => isNotify(v),
  enabled: v => typeof v === 'boolean',
  archive_days: v => isNum(v) && v >= 0,
}

/**
 * The archived totals from the file, or undefined when missing or not usable (they then start from zero).
 * Migration: tokens saved as one number (before the kinds were kept apart) become { unsplit: n }.
 */
function cleanArchived(v: unknown): ArchivedTotals | undefined {
  if (!isObj(v)) return undefined
  const n = (x: unknown) => (isNum(x) && x >= 0 ? x : 0)
  const out: ArchivedTotals = { done: n(v.done), dropped: n(v.dropped), tries: n(v.tries), ms: n(v.ms) }
  const tok = isNum(v.tokens) ? cleanTokens({ unsplit: v.tokens }) ?? {} : cleanTokens(v.tokens)
  if (tok) out.tokens = tok
  if (isNum(v.cost) && v.cost >= 0) out.cost = v.cost
  return out
}

/**
 * Migration: tries whose tokens were saved as one number (input, output and cache added up, before
 * the kinds were kept apart) get that number kept as-is, marked unsplit: { unsplit: n }. Null when no
 * try needs it.
 */
export function migrateRunTokens(runs: unknown): SymccRun[] | null {
  if (!Array.isArray(runs) || !runs.some(r => isNum((r as SymccRun)?.tokens))) return null
  return runs.map(r => (isNum(r?.tokens) ? { ...r, tokens: { unsplit: Math.max(0, r.tokens) } } : r))
}

/** A task entry from the file made usable, or null when it is not a task (it is then skipped). */
function cleanTask(t: unknown): BoardTask | null {
  if (!isObj(t) || typeof t.id !== 'string' || !t.id.trim() || !STATUSES.includes(t.status as SymccStatus)) return null
  const x = { ...t } as Record<string, unknown>
  for (const k of ['title', 'details', 'note']) if (typeof x[k] !== 'string') x[k] = ''
  for (const k of ['files', 'after', 'history']) if (!Array.isArray(x[k])) x[k] = []
  if (!isNum(x.order)) x.order = 0
  if (!isNum(x.attempts)) x.attempts = 0
  if (x.question !== null && typeof x.question !== 'string') x.question = null
  if (x.branch !== null && typeof x.branch !== 'string') x.branch = null
  for (const k of ['asked_files', 'options']) if (k in x && !(Array.isArray(x[k]) && (x[k] as unknown[]).every(v => typeof v === 'string'))) delete x[k]
  const { session, ...rest } = cleanCommitFields(x) as BoardTask
  return (typeof session === 'string' && session && x.status === 'doing' ? { ...rest, session } : rest) as BoardTask
}

/** Roles that were built in before and are gone now, and the role a task with one gets. */
const OLD_ROLES: Record<string, string> = { tests: 'tester', backend: 'general', frontend: 'general' }

/**
 * A task from an older board brought to the current shape, or null when it already has it. Run on
 * every read, but it only changes old data, so once the board is saved it never changes anything again:
 * - no origin: origin { by: 'lead', why: 'made before origins were kept' }, dated when the task was made;
 * - role tests, backend or frontend (no longer built in): tester, general, general;
 * - a try with no end time (left open by a reload) ends where the next try started, or at the task's
 *   last change; the last try of a task that is "doing" is running now and stays open;
 * - a try's tokens saved as one number: kept as-is, marked unsplit (see migrateRunTokens).
 */
export function migrateTask(t: BoardTask): BoardTask | null {
  let out = t
  const split = migrateRunTokens(t.runs)
  if (split) out = { ...out, runs: split }
  if (!('origin' in t)) out = { ...out, origin: { by: 'lead', why: 'made before origins were kept', at: typeof t.created_at === 'string' ? t.created_at : '' } }
  const role = typeof t.role === 'string' ? OLD_ROLES[t.role.trim().toLowerCase()] : undefined
  if (role) out = { ...out, role }
  const rs = Array.isArray(out.runs) ? out.runs : []
  const open = (r: SymccRun, i: number) => typeof r.started === 'string' && !r.ended && !(i === rs.length - 1 && t.status === 'doing')
  if (rs.some(open)) {
    out = {
      ...out,
      runs: rs.map((r, i) => {
        if (!open(r, i)) return r
        const end = rs[i + 1]?.started ?? t.updated_at
        return { ...r, ended: end && Date.parse(end) >= Date.parse(r.started) ? end : r.started }
      }),
    }
  }
  return out === t ? null : out
}

/**
 * Reads board.json's text. No text (no file) is a new, empty board. Text that is not JSON, or
 * not a board object, is `broken`: the board returned then is only a stand-in and must never be
 * saved over the file. Inside a readable file it is forgiving: a bad task entry is skipped (and
 * counted), a bad setting gets its default (and is named in `fixed`), every good value is kept.
 */
export function readBoard(text: string | null): BoardRead {
  if (text === null || text === undefined || !String(text).trim()) return { board: emptyBoard(), skipped: 0, fixed: [], migrated: 0 }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { board: emptyBoard(), broken: `not valid JSON (${String((e as Error)?.message ?? e).slice(0, 120)})`, skipped: 0, fixed: [], migrated: 0 }
  }
  if (!isObj(raw)) return { board: emptyBoard(), broken: 'it is not a board (the file holds no JSON object)', skipped: 0, fixed: [], migrated: 0 }
  if ('tasks' in raw && !Array.isArray(raw.tasks)) return { board: emptyBoard(), broken: '"tasks" is not a list', skipped: 0, fixed: [], migrated: 0 }
  const board = emptyBoard()
  const fixed: string[] = []
  for (const k of Object.keys(SETTING_OK) as (keyof typeof SETTING_OK)[]) {
    if (!(k in raw)) continue // a setting not in the file: the default, nothing to report
    if (SETTING_OK[k](raw[k])) (board as Record<string, unknown>)[k] = raw[k]
    else fixed.push(k)
  }
  const archived = cleanArchived(raw.archived)
  if (archived) board.archived = archived
  else if ('archived' in raw) fixed.push('archived')
  let migrated = archived && isObj(raw.archived) && isNum(raw.archived.tokens) ? 1 : 0
  if (Array.isArray(raw.archived_done)) board.archived_done = [...new Set(raw.archived_done.filter((x): x is string => typeof x === 'string').map(normId))]
  else if ('archived_done' in raw) fixed.push('archived_done')
  let skipped = 0
  const seen = new Set<string>()
  for (const t of (raw.tasks as unknown[] | undefined) ?? []) {
    const c = cleanTask(t)
    if (!c || seen.has(c.id)) {
      skipped++
      continue
    }
    seen.add(c.id)
    const m = migrateTask(c)
    if (m) migrated++
    board.tasks.push(m ?? c)
  }
  // next_id never goes back below a task already on the board (a new task must not reuse an id)
  // (nor an archived one: archived done ids count too)
  const top = Math.max(0, ...[...board.tasks.map(t => t.id), ...(board.archived_done ?? [])].map(id => Number(/^T-(\d+)$/.exec(id)?.[1] ?? 0)))
  if ('next_id' in raw && !(isNum(raw.next_id) && Number.isInteger(raw.next_id) && raw.next_id >= 1)) fixed.push('next_id')
  board.next_id = Math.max(isNum(raw.next_id) && Number.isInteger(raw.next_id) && raw.next_id >= 1 ? raw.next_id : 1, top + 1)
  return { board, skipped, fixed, migrated }
}

/** The board in board.json's text (see readBoard); a file that can't be read gives an empty stand-in. */
export function parseBoard(text: string | null): Board {
  return readBoard(text).board
}

/** What the owner and the lead are told about a board.json that can't be read. */
export const brokenBoardText = (file: string, reason: string, copy?: string) =>
  `${file} can't be read: ${reason}. Nothing is saved, started or merged until it is fixed; fix it${copy ? ` or restore the copy ${copy}` : ''}.`

/** "t3", "T-003", " 3 " and "003" all become "T-3"; anything else is only trimmed. */
export const normId = (id: string) => {
  const m = /^(?:t-?)?0*(\d+)$/i.exec(String(id ?? '').trim())
  return m ? `T-${m[1]}` : String(id ?? '').trim()
}

export const find = (b: Board, id: string) => b.tasks.find(t => t.id === normId(id))

/** Repository-relative paths only; never the plugin's data folder `dir` (the board) or Git internals. */
export function cleanFiles(files: unknown, dir: string = DATA_DIR): string[] {
  if (!Array.isArray(files)) return []
  return files
    .map(f => String(f).trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(f => f && !f.startsWith('/') && !f.split('/').includes('..') && !f.startsWith(dir) && !f.startsWith('.git/') && f !== '.git')
    .slice(0, 30)
}
/** The three board modes, in the order they are shown. */
export const MODES: SymccMode[] = ['off', 'review', 'auto']

/** Whether `m` is one of the board modes. */
export const isMode = (m: unknown): m is SymccMode => typeof m === 'string' && (MODES as string[]).includes(m)

/** The board's mode: "off", "review" or "auto"; a missing or bad value is "auto". */
export const modeOf = (b: { mode?: unknown } | null | undefined): SymccMode => (isMode(b?.mode) ? b!.mode as SymccMode : 'auto')
/** A full git commit id: 40 hex characters (SHA-1) or 64 (SHA-256). */
export const isSha = (x: unknown): x is string => typeof x === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(x)

/**
 * A task from board.json with its commit fields made safe: `runs[].commits` keeps only full
 * commit ids (a broken list is dropped), a run that is not an object is dropped, and a `merged`
 * that is not a full commit id is dropped (only full ids ever reach git).
 */
export function cleanCommitFields<T extends { runs?: unknown; merged?: unknown }>(t: T): T {
  if (!t || typeof t !== 'object') return t
  const out = { ...t } as T & { runs?: unknown; merged?: unknown }
  if ('merged' in out && !isSha(out.merged)) delete out.merged
  if (Array.isArray(out.runs)) {
    // a run that is not an object (hand-edited) is dropped: totals and the task page read every run
    out.runs = out.runs.filter(r => r && typeof r === 'object' && !Array.isArray(r)).map(r => {
      if (!('commits' in r)) return r
      const { commits, ...rest } = r as SymccRun
      const ok = Array.isArray(commits) ? commits.filter(isSha) : []
      return ok.length ? { ...rest, commits: ok } : rest
    })
  }
  return out
}

/** The word the owner sees for each status. */
export const STATUS_WORD: Record<SymccStatus, string> = { backlog: 'backlog', review: 'ready for review', waiting: 'waiting for you', failed: 'failed', doing: 'doing', paused: 'paused', todo: 'to do', done: 'done', dropped: 'dropped' }
