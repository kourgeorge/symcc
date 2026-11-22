// The board file itself: its shape, loading it safely, the lock, and finding a task.
import type { SymccMode, SymccRun, SymccStatus, SymccTask, SymccTokens } from '../../types'
import { dataDir } from '../name'
import { cleanTokens, keepAgentIds } from './runs'
import { parseStamp } from './text'
import { historyEntryOk } from './history'
import type { WorkerQuestion } from './ask'
import { type OwnerQuestion, cleanQuestions } from './questions'

export type Board = {
  version: 1
  next_id: number
  /** paused: nothing runs; review: work runs and finished work waits for the owner; auto (the default): finished work that passes merges on its own */
  mode: SymccMode
  /** shell commands that must pass before a task's work is merged */
  test_commands: string[]
  max_parallel: number
  /** a worker running longer than this (plus its task's extra_minutes) makes symcc ask the owner for more time (see overtimeQuestion) */
  max_minutes: number
  /** how many new tries a task gets on its own after its tests fail, before it is marked failed */
  auto_retries: number
  /** how many minutes each test command may run before merging (see testMinutesOf); absent: 10 */
  test_minutes?: number
  /** open the board panel by itself when a session starts (true unless turned off) */
  open_on_start: boolean
  /**
   * what plays when a task is merged or a question waits for the owner: voice ("T-3 done"), sound 1 / 2 / 3
   * (a chime from that sound set) or off; absent: the best this machine can play (see notifyOf)
   */
  notify?: Notify
  /** the whole plugin enabled or disabled (/<name>-enable, /<name>-disable); disabled: Claude works as normal, the board is kept. true unless disabled */
  enabled: boolean
  /** done and dropped tasks older than this many days move to archive.json (0 = never) */
  archive_days: number
  /**
   * where tasks added from a scout finding go: auto (the default; absent = auto) lets the lead decide,
   * so a finding goes to todo and runs; backlog puts every scout-origin task in the backlog
   */
  scout_findings?: ScoutFindings
  /**
   * a change task whose commit edits code but no test file: off (nothing), ask (the default; absent = ask:
   * it merges and the lead is told) or review (it waits for the owner's review instead of merging)
   */
  tests_with_changes?: TestsWithChanges
  /**
   * the checker setting: true (on) makes a fresh checker try to break each change after the prep step, before it
   * joins the merge line where its tests run (see core/checker.ts); absent or false: off, the default
   */
  checker?: boolean
  tasks: BoardTask[]
  /** what was moved to archive.json: counts and the tries' totals, so views don't read the archive */
  archived?: ArchivedTotals
  /** the ids of archived tasks that were done, so a task waiting on one still starts */
  archived_done?: string[]
  /** the lead's questions for the owner that are not about one task (see core/questions.ts); absent until the first one */
  questions?: OwnerQuestion[]
  /** the next question number ("Q-n"); absent until the first question */
  next_question?: number
}

/** The 3 sound sets a "sound N" notify can play, so the owner can tell which project chimed. */
export type SoundSet = 1 | 2 | 3
export const SOUND_SETS: SoundSet[] = [1, 2, 3]
export const isSoundSet = (x: unknown): x is SoundSet => SOUND_SETS.includes(x as SoundSet)

/** What plays when a task is merged or waits for the owner: the voice, a chime of sound set N, or nothing. */
export type Notify = 'voice' | `sound ${SoundSet}` | 'off'
export const NOTIFY_CHOICES: Notify[] = ['voice', 'sound 1', 'sound 2', 'sound 3', 'off']
export const isNotify = (x: unknown): x is Notify => NOTIFY_CHOICES.includes(x as Notify)
/** The notify choice that chimes sound set `set` ("sound 2"). */
export const soundNotify = (set: SoundSet): Notify => `sound ${set}`
/** The sound set a notify choice chimes (2 for "sound 2"), or null for voice and off. */
export const notifySet = (n: Notify): SoundSet | null => (n.startsWith('sound ') ? (Number(n.slice(6)) as SoundSet) : null)
/** What kind of thing a notify choice plays: off, sound (any set) or voice. */
export const notifyKind = (n: Notify): 'off' | 'sound' | 'voice' => (n === 'off' || n === 'voice' ? n : 'sound')

/** The project's folder name: the last part of `root` ('' when there is none). */
export const projectFolder = (root: string): string => String(root ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''

/**
 * The sound set a project gets when none is chosen: a stable hash (FNV-1a) of its folder name, as 1, 2 or 3,
 * so two projects usually chime differently with no setup. The same name always gives the same set.
 */
export function soundSetFor(root: string): SoundSet {
  const name = projectFolder(root).toLowerCase()
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0
  return SOUND_SETS[h % SOUND_SETS.length]!
}

/** Where tasks added from a scout finding go: auto (the lead decides) or backlog (always the backlog). */
export type ScoutFindings = 'auto' | 'backlog'
export const SCOUT_FINDINGS_CHOICES: ScoutFindings[] = ['auto', 'backlog']
export const isScoutFindings = (x: unknown): x is ScoutFindings => SCOUT_FINDINGS_CHOICES.includes(x as ScoutFindings)
/** The scout_findings setting in use: the board's choice, else auto. */
export const scoutFindingsOf = (b: { scout_findings?: unknown } | null | undefined): ScoutFindings => (isScoutFindings(b?.scout_findings) ? b!.scout_findings as ScoutFindings : 'auto')

/** What happens to a change task that edits code but no test file: off, ask (merge and tell the lead) or review (wait for the owner). */
export type TestsWithChanges = 'off' | 'ask' | 'review'
export const TESTS_WITH_CHANGES_CHOICES: TestsWithChanges[] = ['off', 'ask', 'review']
export const isTestsWithChanges = (x: unknown): x is TestsWithChanges => TESTS_WITH_CHANGES_CHOICES.includes(x as TestsWithChanges)
/** The tests_with_changes setting in use: the board's choice, else ask. */
export const testsWithChangesOf = (b: { tests_with_changes?: unknown } | null | undefined): TestsWithChanges => (isTestsWithChanges(b?.tests_with_changes) ? b!.tests_with_changes as TestsWithChanges : 'ask')

/** The running totals of archived tasks: how many were done and dropped, and their tries' time, tokens and cost. */
export type ArchivedTotals = { done: number; dropped: number; tries: number; ms: number; tokens?: SymccTokens; cost?: number }

/**
 * A task as the board file keeps it: while it is "doing", `session` names the session whose
 * worker owns it; `agent` is the agent id of the last worker started on it. `finishing`: while
 * its finished work is being tested and merged, when that copy of the plugin last said it is
 * still at it (an ISO time, refreshed often), so a reloaded copy doesn't send the task back meanwhile.
 * `merge_wait`: its work is finished and checked (on its branch), and only the merge waits for these
 * files of the owner on the branch it merges into (uncommitted changes, untracked or ignored files in
 * the way); only while "waiting" (a finished worker's try) or "review" (an approve). The regular
 * check, a retry or an approve then only merges it, with no new worker.
 * `checking`: the step symcc is in while it checks the task's finished work (a finished try, an approve
 * or a merge that waited for the owner's files), with when that was last said (refreshed like `finishing`);
 * the board list shows the step instead of the time. Only while "doing", "review" or "waiting".
 * Over time (a worker running past max_minutes, see overtimeQuestion), all only while "doing" on one try:
 * `extra_minutes`: the minutes the owner added to this try's limit; `time_ask`: when the owner was asked
 * for more time (the worker keeps working meanwhile); `wrap_up`: when the worker was told its time is up
 * and to hand back (it is stopped WRAP_UP_GRACE_MS later).
 * What the running try recorded for its hand-back, kept here (not only in the plugin's memory) so a plugin
 * reload mid-try doesn't lose it; only while "doing" on one try: `try_question`: its worker's ask_owner call
 * (the last one wins); `try_refused`: the paths of its edits refused as outside the task's files.
 * `checker`: the agent id of the checker running on this try now (the checker setting), so the guards of any copy
 * of the plugin know it, not only the copy that started it (T-471); its folder is the task's own. Only while "doing" on one try.
 */
export type BoardTask = SymccTask & { session?: string; finishing?: string; checking?: Checking; merge_wait?: Blockers; extra_minutes?: number; time_ask?: string; wrap_up?: string; answer?: string; try_question?: WorkerQuestion; try_refused?: string[]; suggested?: string[] }

/**
 * What a task is for: the name of a kind file (see core/kinds.ts), e.g. "bug" or "docs". Every kind ends in a
 * commit, tests and a merge like a "change" (the default), except "investigation", which ends in its worker's
 * hand-back (the answer), with nothing committed, tested or merged. Stored only when it is not "change".
 */
export type TaskKind = string
/** The kind a task has when none is set. */
export const DEFAULT_KIND = 'change'
/** The kind whose task hands back an answer and merges nothing. */
export const INVESTIGATION = 'investigation'
/** A kind's name: letters, digits, - and _ only (it is a file name), stored in lowercase. */
export const KIND_NAME = /^[a-z0-9_-]{1,64}$/
/** Whether `k` could be a kind's name (whether such a kind file exists is checked where the kinds are loaded). */
export const isKind = (k: unknown): k is TaskKind => typeof k === 'string' && KIND_NAME.test(k.trim().toLowerCase())
/** A task's kind, in lowercase: "change" when it has none. */
export const kindOf = (t: { kind?: unknown } | undefined): TaskKind => {
  const k = t?.kind
  return isKind(k) ? k.trim().toLowerCase() : DEFAULT_KIND
}
/** Whether task `t` (or kind name `t`) is an investigation: it hands back an answer and nothing is merged. Every other kind runs as a change. */
export const isInvestigation = (t: { kind?: unknown } | string | undefined): boolean =>
  (typeof t === 'string' ? t.trim().toLowerCase() : kindOf(t)) === INVESTIGATION
/** The most of an investigation's answer kept on the task (the full text stays in its report file). */
export const ANSWER_MAX_CHARS = 4000

/** The step of checking a task's finished work: "prep" (symcc's own commit, secret-name and scope check before the merge),
 *  "checker" (a checker agent tries to break it; only with the checker setting on), "queue" (waiting for its turn in
 *  the merge line, see inMergeLine), "testing" (catching up with its target branch and running the test commands),
 *  "merging" (moving the branch). */
export type CheckStep = 'prep' | 'testing' | 'checker' | 'queue' | 'merging'
/** The check steps a merge turn marks with markStep (the queue is marked by the merge line itself). */
export type TurnStep = Exclude<CheckStep, 'queue'>
/** A task's check step and when it was last marked fresh; `place` only in the queue (1 = its turn is next). */
export type Checking = { step: CheckStep; at: string; place?: number }
export const CHECK_STEPS: readonly CheckStep[] = ['prep', 'testing', 'checker', 'queue', 'merging']
/** The statuses a task may be checked in: a finished try ("doing"), an approve ("review"), a merge waiting for the owner's files ("waiting"). */
export const CHECKED_STATUSES: readonly SymccStatus[] = ['doing', 'review', 'waiting']

/** `c` when it is a proper checking step, else undefined. */
export function asChecking(c: unknown): Checking | undefined {
  if (!c || typeof c !== 'object') return undefined
  const { step, at, place } = c as Checking
  if (!CHECK_STEPS.includes(step) || typeof at !== 'string' || !at) return undefined
  return step === 'queue' && Number.isInteger(place) && place! > 0 ? { step, at, place } : { step, at }
}

/** The owner's files that stop a merge: uncommitted changes (`dirty`), untracked and git-ignored files, each only where the merge changes files. */
export type Blockers = { dirty: string[]; untracked: string[]; ignored: string[] }

/** All the owner's files in `b`, in the order dirty, untracked, ignored. */
export const blockerFiles = (b: Blockers): string[] => [...b.dirty, ...b.untracked, ...b.ignored]

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

/** `v` as Blockers when it is one, else undefined. */
export function asBlockers(v: unknown): Blockers | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Record<string, unknown>
  const pick = (k: string) => (o[k] === undefined ? [] : strings(o[k]) ? (o[k] as string[]) : null)
  const dirty = pick('dirty'), untracked = pick('untracked'), ignored = pick('ignored')
  return dirty && untracked && ignored ? { dirty, untracked, ignored } : undefined
}

/** Whether task `t` only waits for the owner's files before its finished work is merged (see BoardTask.merge_wait). */
export const waitsForFiles = (t: { status?: unknown; merge_wait?: unknown } | undefined): boolean => {
  if (!t || (t.status !== 'waiting' && t.status !== 'review')) return false
  const b = asBlockers(t.merge_wait)
  return !!b && blockerFiles(b).length > 0
}

/** The data folder for the default name. For another name use namesFor(name). */
export const DATA_DIR = dataDir()
/** a lock older than this was left by a session that died, and may be taken over */
export const LOCK_STALE_MS = 30_000

/** A board lock: who holds it, since when, and (T-659, when the host can tell) the holder's process: its pid and start time. */
export type Lock = { session: string; at: number; pid?: number; started?: number }

export const lockText = (session: string, at: number, holder?: { pid: number; started: number }) =>
  JSON.stringify(holder ? { session, at, pid: holder.pid, started: holder.started } : { session, at }) + '\n'

export function parseLock(text: string | null): Lock | null {
  const l = parseStamp(text, 'at', true)
  if (!l) return null
  const o = JSON.parse(text ?? '') as { pid?: unknown; started?: unknown }
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  return ok(o.pid) && Number.isInteger(o.pid) && o.pid > 0 && ok(o.started) ? { ...l, pid: o.pid, started: o.started } : l
}

/** The process lock text `text` names as its holder, or undefined (an older lock, or one from a host that can't see processes). */
export function lockHolder(text: string | null): { pid: number; started: number } | undefined {
  const l = parseLock(text)
  return l?.pid !== undefined && l.started !== undefined ? { pid: l.pid, started: l.started } : undefined
}

/**
 * Whether a lock may be taken over: its holder's process is gone (`holderAlive` false, T-659), or it is older than
 * LOCK_STALE_MS (or dated far in the future, a broken clock). `holderAlive` undefined (no pid in the lock, or the host
 * can't tell) keeps the time rule alone. A lock we can't read is judged by the file's own time.
 */
export function isLockStale(text: string | null, nowMs: number, fileMs?: number, maxAgeMs = LOCK_STALE_MS, holderAlive?: boolean): boolean {
  if (holderAlive === false) return true
  const at = parseLock(text)?.at ?? fileMs
  if (at === undefined || !Number.isFinite(at)) return true
  return nowMs - at > maxAgeMs || at - nowMs > maxAgeMs
}

/** How many minutes one test command may run before merging, on a board without test_minutes. */
export const DEFAULT_TEST_MINUTES = 10

/** The minutes one test command of board `b` may run before merging: its test_minutes (absent or not usable: DEFAULT_TEST_MINUTES). */
export const testMinutesOf = (b: { test_minutes?: unknown }): number => (typeof b?.test_minutes === 'number' && Number.isFinite(b.test_minutes) && b.test_minutes >= 1 ? Math.round(b.test_minutes) : DEFAULT_TEST_MINUTES)

/**
 * The project-wide merge line (<data folder>/merge-line.json, T-546): every way into a merge (a hand-back, an approve, a
 * finished work whose files are clear again, a checker's pass) joins it, across tasks and sessions, and only
 * the task at its front has its turn: catch up with the target branch, run the tests, move the branch (see inMergeLine
 * in app/merge-line.ts). Entries are kept oldest first: the task, a key for that one go, its session, when it joined,
 * and `at`, the last time its copy of the plugin said it is still alive. An entry dated more than mergeLineStaleMs
 * ago (twice one test command's time limit, the board's test_minutes) is stale. MERGE_LINE_STALE_MS is that with the
 * default 10 minutes. The file survives a reload; a task that was in line then simply joins again.
 */
export const MERGE_LINE_FILE = 'merge-line.json'
export const mergeLineStaleMs = (testMinutes: number) => 2 * testMinutes * 60_000
export const MERGE_LINE_STALE_MS = mergeLineStaleMs(DEFAULT_TEST_MINUTES)
export type LineEntry = { task: string; key: string; session: string; joined: string; at: number }
export const mergeLineText = (line: readonly LineEntry[]) => JSON.stringify({ line }, null, 2) + '\n'
/** The entries of merge line file text `text`, oldest first; entries that are not one are skipped, a file that can't be read is an empty line. */
export function parseMergeLine(text: string | null): LineEntry[] {
  let raw: unknown
  try {
    raw = (JSON.parse(text ?? '') as { line?: unknown })?.line
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const str = (v: unknown) => typeof v === 'string' && v.length > 0
  return raw.filter((e): e is LineEntry => !!e && typeof e === 'object' && str(e.task) && str(e.key) && typeof e.session === 'string' && typeof e.joined === 'string' && typeof e.at === 'number' && Number.isFinite(e.at))
}
/** Whether line entry `e` is older (or dated further ahead) than `maxAgeMs`. */
export const lineEntryStale = (e: Pick<LineEntry, 'at'>, nowMs: number, maxAgeMs: number) => nowMs - e.at > maxAgeMs || e.at - nowMs > maxAgeMs
/** A task's note while it waits in the merge queue ("queue (n)"), `n` being its place in it (the task whose turn it is now is 1). */
export const inLineNote = (n: number) => `queue (${n})`

/**
 * The temp file a save of `file` writes first (then renames over `file`): `<file>.<session>.<n>.tmp`, where `n`
 * is new for every save (a counter and a random part). Two saves of one file at the same time, in one session
 * or two, never share a temp file, so neither can rename the other's away.
 */
export function tmpName(file: string, session: string, n: string): string {
  const safe = (x: string) => String(x ?? '').replace(/[^\w-]/g, '_') || 'unknown'
  return `${file}.${safe(session)}.${safe(n)}.tmp`
}

/** Names of the temp files a save leaves behind if its session is killed mid-save (see tmpName): <name>.json (.lock, .md) + .<session>.<n>.tmp. T-804: any file, not a list of owners. */
const LEFTOVER_TMP = /^[\w-][\w.-]*\.(?:json|lock|md)\.[\w-][\w.-]*\.tmp$/

/**
 * Which files in the data folder are leftover temp files that may be deleted: only
 * <file>.<session>[.<n>].tmp of any .json, .lock or .md file symcc saves (see tmpName), and only once they are older than maxAgeMs (a fresh one may still be in use by another
 * session). A file with no usable time, or dated in the future, is kept. Anything else (board.json, lead.json,
 * ...) is never chosen.
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

/** A new board. There is no board-wide branch: each task merges into the branch it was made on (see intoOf). */
export function emptyBoard(): Board {
  return { version: 1, next_id: 1, mode: 'auto', test_commands: [], max_parallel: 3, max_minutes: 45, auto_retries: DEFAULT_AUTO_RETRIES, open_on_start: true, enabled: true, archive_days: DEFAULT_ARCHIVE_DAYS, tasks: [] }
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
}

const STATUSES: SymccStatus[] = ['backlog', 'todo', 'doing', 'paused', 'waiting', 'review', 'failed', 'done', 'dropped']

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Each setting with the test its value must pass; a value that fails is replaced by the default. */
const SETTING_OK: { [K in Exclude<keyof Board, 'version' | 'tasks' | 'next_id' | 'archived' | 'archived_done' | 'questions' | 'next_question'>]: (v: unknown) => boolean } = {
  mode: v => isMode(v),
  test_commands: v => Array.isArray(v) && v.every(c => typeof c === 'string'),
  max_parallel: v => isNum(v) && v >= 0,
  max_minutes: v => isNum(v) && v >= 0,
  auto_retries: v => isNum(v) && v >= 0,
  test_minutes: v => isNum(v) && v >= 1,
  open_on_start: v => typeof v === 'boolean',
  notify: v => isNotify(v),
  enabled: v => typeof v === 'boolean',
  archive_days: v => isNum(v) && v >= 0,
  scout_findings: v => isScoutFindings(v),
  tests_with_changes: v => isTestsWithChanges(v),
  checker: v => typeof v === 'boolean',
}

/**
 * The archived totals from the file, or undefined when missing or not usable (they then start from zero).
 */
function cleanArchived(v: unknown): ArchivedTotals | undefined {
  if (!isObj(v)) return undefined
  const n = (x: unknown) => (isNum(x) && x >= 0 ? x : 0)
  const out: ArchivedTotals = { done: n(v.done), dropped: n(v.dropped), tries: n(v.tries), ms: n(v.ms) }
  const tok = cleanTokens(v.tokens)
  if (tok) out.tokens = tok
  if (isNum(v.cost) && v.cost >= 0) out.cost = v.cost
  return out
}

/** What each list field of a task may hold; anything else in it is dropped (see cleanTask). */
const LIST_OK: Record<'files' | 'after' | 'history', (v: unknown) => boolean> = {
  files: v => typeof v === 'string' && !!v.trim(),
  after: v => typeof v === 'string' && /^T-\d+$/.test(normId(v)),
  history: historyEntryOk,
}

/**
 * A task entry from the file made usable, or null when it is not a task (it is then skipped).
 * What it had to drop from inside the task (bad list entries, bad tries) is added to `fixed`.
 */
function cleanTask(t: unknown, fixed: string[] = []): BoardTask | null {
  if (!isObj(t) || typeof t.id !== 'string' || !t.id.trim() || !STATUSES.includes(t.status as SymccStatus)) return null
  const x = { ...t } as Record<string, unknown>
  const id = t.id
  for (const k of ['title', 'details', 'note']) if (typeof x[k] !== 'string') x[k] = ''
  for (const k of ['files', 'after', 'history'] as const) {
    if (!Array.isArray(x[k])) {
      x[k] = []
      continue
    }
    const all = x[k] as unknown[]
    const ok = all.filter(LIST_OK[k])
    if (ok.length < all.length) fixed.push(`${id}: ${all.length - ok.length} bad ${k} ${all.length - ok.length === 1 ? 'entry' : 'entries'} dropped`)
    x[k] = k === 'after' ? [...new Set((ok as string[]).map(normId))] : ok
  }
  if ('runs' in x) {
    if (!Array.isArray(x.runs)) {
      fixed.push(`${id}: runs was not a list, cleared`)
      x.runs = []
    } else {
      const bad = x.runs.filter(r => !isObj(r)).length
      if (bad) fixed.push(`${id}: ${bad} bad ${bad === 1 ? 'try' : 'tries'} dropped`)
      // T-479: the agent ids kept on its tries, cleaned (a bad or extra one is dropped)
      const kept = keepAgentIds(x.runs as SymccRun[])
      if (kept !== x.runs) {
        fixed.push(`${id}: bad agent ids on its tries dropped`)
        x.runs = kept
      }
    }
  }
  if (!isNum(x.order)) x.order = 0
  if (!isNum(x.attempts)) x.attempts = 0
  if (x.question !== null && typeof x.question !== 'string') x.question = null
  if (x.branch !== null && typeof x.branch !== 'string') x.branch = null
  if ('question_lead' in x && !(typeof x.question_lead === 'string' && x.question_lead.trim())) delete x.question_lead
  if ('merge_into' in x && !(typeof x.merge_into === 'string' && x.merge_into.trim())) delete x.merge_into
  for (const k of ['asked_files', 'options', 'options_lead']) if (k in x && !strings(x[k])) delete x[k]
  if ('kind' in x) {
    if (kindOf(x) === DEFAULT_KIND) delete x.kind
    else x.kind = kindOf(x)
  }
  if ('answer' in x && typeof x.answer !== 'string') delete x.answer
  // T-632: org-mem suggestions from its reports (see addSuggestions), kept until it is done or dropped
  if ('suggested' in x && !(strings(x.suggested) && (x.suggested as string[]).length)) delete x.suggested
  if ('merge_wait' in x) {
    const mw = asBlockers(x.merge_wait)
    if (mw) x.merge_wait = mw
    else delete x.merge_wait
  }
  if ('merge_wait' in x && !waitsForFiles(x)) delete x.merge_wait
  const { session, finishing, checking: rawChecking, ...rest } = cleanCommitFields(x) as BoardTask
  const doing = x.status === 'doing'
  const checking = CHECKED_STATUSES.includes(x.status as SymccStatus) ? asChecking(rawChecking) : undefined
  return { ...rest, ...(typeof session === 'string' && session && doing ? { session } : {}), ...(typeof finishing === 'string' && finishing && doing ? { finishing } : {}), ...(checking ? { checking } : {}) } as BoardTask
}

/** The branch a task merges into (see SymccTask.merge_into); "main" for a task that has none (made by hand or in a test). */
export const intoOf = (t: { merge_into?: unknown }): string => (typeof t?.merge_into === 'string' && t.merge_into.trim() ? t.merge_into.trim() : 'main')

/**
 * Reads board.json's text. No text (no file) is a new, empty board. Text that is not JSON, or
 * not a board object, is `broken`: the board returned then is only a stand-in and must never be
 * saved over the file. Inside a readable file it is forgiving: a bad task entry is skipped (and
 * counted), a bad setting gets its default (and is named in `fixed`), every good value is kept.
 */
export function readBoard(text: string | null): BoardRead {
  if (text === null || text === undefined || !String(text).trim()) return { board: emptyBoard(), skipped: 0, fixed: [] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { board: emptyBoard(), broken: `not valid JSON (${String((e as Error)?.message ?? e).slice(0, 120)})`, skipped: 0, fixed: [] }
  }
  return readBoardValue(raw)
}

/** readBoard for board.json's content already parsed (e.g. joined with its finished tasks' parts, see core/board-parts.ts). */
export function readBoardValue(raw: unknown): BoardRead {
  if (!isObj(raw)) return { board: emptyBoard(), broken: 'it is not a board (the file holds no JSON object)', skipped: 0, fixed: [] }
  if ('tasks' in raw && !Array.isArray(raw.tasks)) return { board: emptyBoard(), broken: '"tasks" is not a list', skipped: 0, fixed: [] }
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
  if (Array.isArray(raw.archived_done)) board.archived_done = [...new Set(raw.archived_done.filter((x): x is string => typeof x === 'string').map(normId))]
  else if ('archived_done' in raw) fixed.push('archived_done')
  const questions = cleanQuestions(raw.questions)
  if (questions) board.questions = questions
  else if ('questions' in raw) fixed.push('questions')
  if (questions?.length || 'next_question' in raw) {
    const top = Math.max(0, ...(questions ?? []).map(q => Number(/^Q-(\d+)$/.exec(q.id)?.[1] ?? 0)))
    board.next_question = Math.max(isNum(raw.next_question) && Number.isInteger(raw.next_question) && raw.next_question >= 1 ? raw.next_question : 1, top + 1)
  }
  let skipped = 0
  const seen = new Set<string>()
  for (const t of (raw.tasks as unknown[] | undefined) ?? []) {
    const c = cleanTask(t, fixed)
    if (!c || seen.has(c.id)) {
      skipped++
      continue
    }
    seen.add(c.id)
    board.tasks.push(c)
  }
  // next_id never goes back below a task already on the board (a new task must not reuse an id)
  // (nor an archived one: archived done ids count too)
  const top = Math.max(0, ...[...board.tasks.map(t => t.id), ...(board.archived_done ?? [])].map(id => Number(/^T-(\d+)$/.exec(id)?.[1] ?? 0)))
  if ('next_id' in raw && !(isNum(raw.next_id) && Number.isInteger(raw.next_id) && raw.next_id >= 1)) fixed.push('next_id')
  board.next_id = Math.max(isNum(raw.next_id) && Number.isInteger(raw.next_id) && raw.next_id >= 1 ? raw.next_id : 1, top + 1)
  return { board, skipped, fixed }
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

/** Repository-relative paths only ("." anywhere in the list means the whole project, so the list is empty); never the plugin's data folder `dir` (the board) or Git internals. */
export function cleanFiles(files: unknown, dir: string = DATA_DIR): string[] {
  if (!Array.isArray(files)) return []
  const all = files.map(f => String(f).trim().replace(/\\/g, '/'))
  // "." or "./" is the whole project: the same as an empty list (anywhere).
  if (all.some(f => f === '.' || f === './')) return []
  return all
    .map(f => f.replace(/^\.\//, ''))
    .filter(f => f && !f.startsWith('/') && !f.split('/').includes('..') && !f.startsWith(dir) && !f.startsWith('.git/') && f !== '.git')
  // T-713: no limit on how many files a task lists. A silent cut here made allowFiles say "allowed"
  // for files it dropped, and the worker was refused the same file again, round after round.
}
/** The three board modes, in the order they are shown. */
export const MODES: SymccMode[] = ['paused', 'review', 'auto']

/** Whether `m` is one of the board modes. */
export const isMode = (m: unknown): m is SymccMode => typeof m === 'string' && (MODES as string[]).includes(m)

/** The board's mode: "paused", "review" or "auto"; a missing or bad value is "auto". */
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
