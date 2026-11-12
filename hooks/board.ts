// The task board: plain data, kept in <project>/.<name>/board.json (see name.ts). Every function
// here is pure (takes a board, returns a new one) so it can be tested without Claude.
import type { SymccMode, SymccOrigin, SymccRun, SymccScout, SymccStatus, SymccTask } from '../types'
import { DEFAULT_NAME, ICON, ICON_ART, dataDir, namesFor } from './name'

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
  /** say it out loud when a task is merged (true unless turned off) */
  voice: boolean
  tasks: BoardTask[]
}

/**
 * A task as the board file keeps it: while it is "doing", `session` names the session whose
 * worker owns it; `agent` is the agent id of the last worker started on it.
 */
export type BoardTask = SymccTask & { session?: string; agent?: string }

/** The data folder for the default name; the paths below are for it too. For another name use namesFor(name). */
export const DATA_DIR = dataDir()
export const BOARD_FILE = namesFor().boardFile
/** held by one session while it reads, changes and writes the board */
export const LOCK_FILE = namesFor().lockFile
/** a lock older than this was left by a session that died, and may be taken over */
export const LOCK_STALE_MS = 30_000

export type Lock = { session: string; at: number }

export const lockText = (session: string, at: number) => JSON.stringify({ session, at }) + '\n'

/** Reads `{ session, <key> }` JSON: the session a string, the number finite; null if it isn't that. */
function parseStamp<K extends string>(text: string | null, key: K, emptyOk: boolean): ({ session: string } & Record<K, number>) | null {
  try {
    const l = JSON.parse(text ?? '') as Record<string, unknown>
    const n = l[key]
    if (typeof l.session !== 'string' || (!emptyOk && !l.session) || typeof n !== 'number' || !Number.isFinite(n)) return null
    return { session: l.session, [key]: n } as { session: string } & Record<K, number>
  } catch {
    return null
  }
}

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

/** 'retry' while fewer than `max` tries were used, else 'fail'. */
const retryOrFail = (tries: number | undefined, max: number): 'retry' | 'fail' => ((tries ?? 0) < max ? 'retry' : 'fail')

/** A new board; `target_branch` is where finished work is merged (see startBranch for a new project). */
export function emptyBoard(target_branch = 'main'): Board {
  return { version: 1, next_id: 1, mode: 'auto', test_commands: [], target_branch, max_parallel: 3, max_minutes: 45, auto_retries: DEFAULT_AUTO_RETRIES, open_on_start: true, voice: true, tasks: [] }
}

export function parseBoard(text: string | null): Board {
  if (!text) return emptyBoard()
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    // only the keys a board has: anything else in the file is dropped
    const fresh = emptyBoard()
    const b = Object.fromEntries(Object.entries(raw ?? {}).filter(([k]) => k in fresh)) as Partial<Board>
    const tasks = (Array.isArray(b.tasks) ? b.tasks : []).map(t => {
      const { session, ...rest } = cleanCommitFields(t)
      return typeof session === 'string' && session && t.status === 'doing' ? { ...rest, session } : rest
    })
    return { ...emptyBoard(), ...b, mode: modeOf(b), tasks }
  } catch {
    return emptyBoard()
  }
}

/** "t3", "T-003", " 3 " and "003" all become "T-3"; anything else is only trimmed. */
export const normId = (id: string) => {
  const m = /^(?:t-?)?0*(\d+)$/i.exec(String(id ?? '').trim())
  return m ? `T-${m[1]}` : String(id ?? '').trim()
}

export const find = (b: Board, id: string) => b.tasks.find(t => t.id === normId(id))

// eslint-disable-next-line no-control-regex
const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n)

/** Repository-relative paths only; never the plugin's data folder `dir` (the board) or Git internals. */
export function cleanFiles(files: unknown, dir: string = DATA_DIR): string[] {
  if (!Array.isArray(files)) return []
  return files
    .map(f => String(f).trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(f => f && !f.startsWith('/') && !f.split('/').includes('..') && !f.startsWith(dir) && !f.startsWith('.git/') && f !== '.git')
    .slice(0, 30)
}

/** A task's role as stored: the name, or '' for general (which is the same as no role). */
const cleanRole = (r: unknown): string => {
  const s = clean(r, 64)
  return s.toLowerCase() === 'general' ? '' : s
}

/** Who can start a task: the owner, a scout's report, a worker's report, or the lead's own idea. */
export const ORIGIN_BY = ['owner', 'scout', 'worker', 'lead'] as const
export const ORIGIN_HOW = ['split', 'follow-up'] as const

/** What the caller says about where a task came from (as the add tool gets it; nothing checked yet). */
export type OriginInput = { by?: unknown; scout?: unknown; task?: unknown; how?: unknown; request?: unknown; why?: unknown; evidence?: unknown }

/**
 * Checks and cleans where a task came from. Throws a clear error when `why` is empty, `by` is not
 * one of ORIGIN_BY, a scout task names no scout, a worker task names no task, or the named task is
 * not on board `b`. Without `by` it is worked out: a scout named → scout, a task → worker,
 * the owner's words → owner, else lead.
 */
export function makeOrigin(o: OriginInput | undefined, now: string, b?: Board): SymccOrigin {
  const why = clean(o?.why, 300).replace(/\s+/g, ' ')
  if (!why) throw new Error('a task needs a "why": one line saying why this task exists')
  const scout = clean(o?.scout, 64)
  const task = o?.task === undefined || o?.task === null || String(o.task).trim() === '' ? '' : normId(clean(o.task, 32))
  const request = clean(o?.request, 1000)
  const rawBy = clean(o?.by, 16).toLowerCase()
  if (rawBy && !(ORIGIN_BY as readonly string[]).includes(rawBy)) throw new Error(`origin_by must be one of ${ORIGIN_BY.join(', ')} (got "${rawBy}")`)
  const by = (rawBy || (scout ? 'scout' : task ? 'worker' : request ? 'owner' : 'lead')) as SymccOrigin['by']
  if (by === 'scout' && !scout) throw new Error('origin_by is scout: name the scout whose report led to this task (scout)')
  if (by === 'worker' && !task) throw new Error('origin_by is worker: name the task whose worker report led to this task (from_task)')
  if (task && b && !find(b, task)) throw new Error(`from_task ${task} is not on the board`)
  const rawHow = clean(o?.how, 16).toLowerCase()
  if (rawHow && !(ORIGIN_HOW as readonly string[]).includes(rawHow)) throw new Error(`how must be ${ORIGIN_HOW.join(' or ')} (got "${rawHow}")`)
  if (rawHow && !task) throw new Error(`a ${rawHow} needs the task it comes from (from_task)`)
  const evidence = clean(o?.evidence, 600)
  return {
    by,
    ...(scout ? { scout } : {}),
    ...(task ? { task } : {}),
    ...(rawHow ? { how: rawHow as SymccOrigin['how'] } : {}),
    ...(request ? { request } : {}),
    why,
    ...(evidence ? { evidence } : {}),
    at: now,
  }
}

/** A task's origin if it has a usable one (old boards have none; a hand-edited one may be broken). */
const originOf = (t: { origin?: unknown }): SymccOrigin | undefined => {
  const o = t.origin as Record<string, unknown> | null | undefined
  if (!o || typeof o !== 'object' || Array.isArray(o) || !(ORIGIN_BY as readonly unknown[]).includes(o.by)) return undefined
  // keep only text fields that really are text, so one hand-edited task can't break the board
  const text = (k: string) => (typeof o[k] === 'string' ? { [k]: o[k] as string } : {})
  return {
    by: o.by as SymccOrigin['by'],
    ...text('scout'),
    ...text('task'),
    ...((ORIGIN_HOW as readonly unknown[]).includes(o.how) ? { how: o.how as SymccOrigin['how'] } : {}),
    ...text('request'),
    why: typeof o.why === 'string' ? o.why : '',
    ...text('evidence'),
    at: typeof o.at === 'string' ? o.at : '',
  }
}

/** Who made a task, in words: "the owner", "scout bugs", "the worker of T-3", "the lead"; "unknown" without an origin. */
export function originWho(t: { origin?: unknown }): string {
  const o = originOf(t)
  if (!o) return 'unknown'
  if (o.by === 'owner') return 'the owner'
  if (o.by === 'scout') return `scout ${o.scout || '?'}`
  if (o.by === 'worker') return `the worker of ${o.task || '?'}`
  return 'the lead'
}

/** The first history line of a new task. */
export const createdLine = (o: SymccOrigin) => `created by ${originWho({ origin: o })} because ${o.why}`

/**
 * The short "from:" text for the board and the task detail, e.g. 'from: owner — “add a search command…”',
 * 'from: scout bugs', 'from: T-12 (split)'; 'from: unknown' for a task made before origins were kept.
 */
export function fromText(t: { origin?: unknown }, quote = 60): string {
  const o = originOf(t)
  if (!o) return 'from: unknown'
  const how = o.how ?? (o.by === 'worker' ? 'worker report' : '')
  const taskPart = o.task ? `${o.task}${how ? ` (${how})` : ''}` : ''
  if (o.by === 'owner') {
    const r = (o.request ?? '').replace(/\s+/g, ' ').trim()
    const q = r ? ` — “${r.length > quote ? `${r.slice(0, quote - 1).trimEnd()}…` : r}”` : ''
    return `from: owner${q}${taskPart ? `, ${taskPart}` : ''}`
  }
  if (o.by === 'scout') return `from: scout ${o.scout || '?'}${taskPart ? `, ${taskPart}` : ''}`
  if (o.by === 'lead' && o.task && !o.how) return `from: lead, about ${o.task}`
  if (taskPart) return `from: ${taskPart}`
  return 'from: lead'
}

/**
 * What the plugin itself saw reach the lead in this session (kept in memory, not on the board):
 * the owner's last typed prompt, and when each scout's and each task's worker report was delivered.
 */
export type Heard = { owner?: { text: string; at: string }; scouts: Record<string, string>; workers: Record<string, string>; last?: { what: string; at: string } }

export const emptyHeard = (): Heard => ({ scouts: {}, workers: {} })

/** An ISO time as "2026-11-12 14:05 UTC" (the text itself when it is not a time). */
export const utcTime = (iso: string) => (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(iso) ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : iso)

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const cutQuote = (s: string, n: number) => (squash(s).length > n ? `${squash(s).slice(0, n - 1).trimEnd()}…` : squash(s))

/**
 * The plugin's own short link to the evidence for a new task, next to what the lead said:
 * the last owner prompt (and whether the lead's quote is really in it), "scout <name> report at <time>",
 * "<task> worker report at <time>", or a plain note that nothing like it was seen in this session.
 */
export function evidenceText(o: Pick<SymccOrigin, 'by' | 'scout' | 'task' | 'request'>, h: Heard): string {
  const ownerLine = h.owner ? `last owner prompt at ${utcTime(h.owner.at)}: “${cutQuote(h.owner.text, 200)}”` : ''
  if (o.by === 'owner') {
    if (!h.owner) return 'no owner prompt was seen by the plugin in this session'
    const off = o.request && !squash(h.owner.text).toLowerCase().includes(squash(o.request).toLowerCase())
    return `${ownerLine}${off ? ' (the quoted request is not word for word in it)' : ''}`
  }
  if (o.by === 'scout') {
    const at = o.scout ? h.scouts[o.scout] : undefined
    return at ? `scout ${o.scout} report at ${utcTime(at)}` : `no report from scout ${o.scout ?? '?'} reached the lead in this session`
  }
  if (o.by === 'worker') {
    const id = o.task ? normId(o.task) : ''
    const at = id ? h.workers[id] : undefined
    return at ? `${id} worker report at ${utcTime(at)}` : `no worker report from ${id || '?'} reached the lead in this session`
  }
  const parts = [ownerLine, h.last ? `last report: ${h.last.what} at ${utcTime(h.last.at)}` : ''].filter(Boolean)
  return parts.length ? parts.join('; ') : 'nothing from the owner, a scout or a worker was seen in this session'
}

export function addTask(b: Board, f: { title: string; details?: string; files?: unknown; after?: unknown; order?: number; needs_review?: boolean; backlog?: boolean; role?: string; origin?: OriginInput }, now: string, dir: string = DATA_DIR): [Board, SymccTask] {
  const title = clean(f.title, 200)
  if (!title) throw new Error('a task needs a title')
  const origin = makeOrigin(f.origin, now, b)
  const after = (Array.isArray(f.after) ? f.after : []).map(x => normId(String(x))).filter(x => find(b, x))
  const t: SymccTask = {
    id: `T-${b.next_id}`,
    title,
    details: clean(f.details ?? title, 8000),
    files: cleanFiles(f.files, dir),
    status: f.backlog === true ? 'backlog' : 'todo',
    note: '',
    question: null,
    order: typeof f.order === 'number' ? f.order : Math.max(0, ...b.tasks.map(x => x.order)) + 1,
    after,
    attempts: 0,
    history: [createdLine(origin)],
    origin,
    branch: null,
    created_at: now,
    updated_at: now,
    ...(f.needs_review === true ? { needs_review: true } : {}),
    ...(cleanRole(f.role) ? { role: cleanRole(f.role) } : {}),
  }
  return [{ ...b, next_id: b.next_id + 1, tasks: [...b.tasks, t] }, t]
}

export function patchTask(b: Board, id: string, patch: Partial<BoardTask>, now: string, dir: string = DATA_DIR): Board {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  const next: BoardTask = { ...t, ...patch, updated_at: now }
  // Leaving "doing" ends the worker's try, however it ended (finished, stopped, over time, lost).
  if (t.status === 'doing' && next.status !== 'doing' && next.runs?.length && !next.runs[next.runs.length - 1]!.ended) next.runs = endRun(next.runs, now)
  if (next.status !== 'doing' || !next.session) delete next.session
  // Where a task came from never changes once it is made.
  if ('origin' in patch) {
    if (t.origin) next.origin = t.origin
    else delete next.origin
  }
  if (patch.title !== undefined) next.title = clean(patch.title, 200)
  if (patch.details !== undefined) next.details = clean(patch.details, 8000)
  if (patch.files !== undefined) next.files = cleanFiles(patch.files, dir)
  if (patch.role !== undefined) {
    const role = cleanRole(patch.role)
    if (role) next.role = role
    else delete next.role
  }
  if (patch.needs_review !== undefined) {
    if (patch.needs_review === true) next.needs_review = true
    else delete next.needs_review
  }
  if (patch.after !== undefined) next.after = patch.after.map(normId).filter(x => x !== t.id && find(b, x))
  if (next.status !== 'waiting') next.question = null
  return { ...b, tasks: b.tasks.map(x => (x.id === t.id ? next : x)) }
}

/** A task id's number ("T-12" → 12; 0 when there is none), for ordering. */
const num = (id: string) => Number(id.replace(/\D/g, '')) || 0

/** Tasks a worker could start now: to do (never backlog), and everything they wait for is done. */
export function ready(b: Board): SymccTask[] {
  return b.tasks
    .filter(t => t.status === 'todo' && t.after.every(a => find(b, a)?.status === 'done'))
    .sort((x, y) => x.order - y.order || num(x.id) - num(y.id))
}

// ---------------- the backlog ----------------

/**
 * "Stash": task `id` goes to the backlog, from todo, paused or failed (or doing, once its worker
 * was stopped). It keeps everything else and never starts until promoted. A history line says so.
 */
export function stashTask(b: Board, id: string, now: string, reason = ''): Board {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (t.status === 'backlog') return b
  if (!BACKLOG_FROM.includes(t.status)) throw new Error(`${t.id} is ${STATUS_WORD[t.status]}; only a task that is to do, paused or failed can go to the backlog`)
  const why = clean(reason, 280)
  return patchTask(b, t.id, { status: 'backlog', note: why ? `in the backlog: ${why}` : 'in the backlog', history: [...t.history, `moved to the backlog (was ${t.status})${why ? `: ${why}` : ''}`] }, now)
}

/** "Promote": task `id` leaves the backlog for "todo", so a worker may start on it. A history line says so. */
export function promoteTask(b: Board, id: string, now: string): Board {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (t.status !== 'backlog') throw new Error(`${t.id} is not in the backlog (it is ${STATUS_WORD[t.status]})`)
  return patchTask(b, t.id, { status: 'todo', note: 'moved from the backlog', history: [...t.history, 'moved from the backlog to todo'] }, now)
}

/** Changed files outside the task's files (or touching the board / Git). Empty `allowed` = anywhere. */
export function outOfScope(changed: string[], allowed: string[], dir: string = DATA_DIR): string[] {
  const re = (g: string) => {
    let s = g.trim().replace(/^\.\//, '')
    if (s.endsWith('/')) s += '**'
    let out = ''
    for (let i = 0; i < s.length; i++) {
      const c = s[i]!
      if (c === '*') {
        if (s[i + 1] === '*') {
          const slash = s[i + 2] === '/'
          out += slash ? '(?:.*/)?' : '.*'
          i += slash ? 2 : 1
        } else out += '[^/]*'
      } else if (c === '?') out += '[^/]'
      else if ('\\^$+.()|{}[]'.includes(c)) out += '\\' + c
      else out += c
    }
    return new RegExp(`^${out}$`)
  }
  const inside = (f: string) =>
    allowed.some(g => {
      const n = g.trim().replace(/^\.\//, '')
      return re(n).test(f) || (!/[*?]/.test(n) && f.startsWith(n.replace(/\/$/, '') + '/'))
    })
  return changed.filter(f => f.startsWith(dir + '/') || f.startsWith('.git/') || (allowed.length > 0 && !inside(f)))
}

/**
 * A worker that must change files outside its list stops and answers
 * `NEED FILES: path/a, path/b — reason`. Returns the files and the reason (may be empty), or
 * undefined when the answer is not that. Spaces and backticks around the paths are fine.
 */
export function parseNeedFiles(answer: string): { files: string[]; reason: string } | undefined {
  const m = /^[\s`*]*NEED\s+FILES\s*:\s*(.*)$/im.exec(answer)
  if (!m) return undefined
  const rest = m[1]!.trim()
  const cut = /\s+(?:—|–|--|-)\s+|\s*[—–]\s*/.exec(rest)
  const list = cut ? rest.slice(0, cut.index) : rest
  const reason = cut ? rest.slice(cut.index + cut[0].length).trim() : ''
  const files = [...new Set(list.split(/[,\s]+/).map(f => f.replace(/[`'"]/g, '').trim().replace(/^\.\//, '')).filter(Boolean))]
  return files.length ? { files, reason } : undefined
}

/** The question a task waits with after its worker asked for more files. */
export function needFilesQuestion(id: string, need: { files: string[]; reason: string }): string {
  return `${id} needs to change files outside its list: ${need.files.join(', ')}${need.reason ? ` — ${need.reason}` : ''}. Allow them?`
}

/** Why a try failed when the worker changed files outside its list without asking. */
export function outOfScopeText(bad: string[], allowed: string[]): string {
  return `changed files outside the task (${bad.slice(0, 5).join(', ')}); allowed: ${allowed.join(', ') || '-'}. To fix: add them to files with change, or split the task`
}

// ---------------- review before merge ----------------

/** The three board modes, in the order they are shown. */
export const MODES: SymccMode[] = ['off', 'review', 'auto']

/** Whether `m` is one of the board modes. */
export const isMode = (m: unknown): m is SymccMode => typeof m === 'string' && (MODES as string[]).includes(m)

/** The board's mode: "off", "review" or "auto"; a missing or bad value is "auto". */
export const modeOf = (b: { mode?: unknown } | null | undefined): SymccMode => (isMode(b?.mode) ? b!.mode as SymccMode : 'auto')

/** Whether a finished task that passed its checks waits for the owner: every task unless the mode is "auto", or a task with needs_review. */
export function needsReview(b: { mode?: unknown }, t: Pick<SymccTask, 'needs_review'>): boolean {
  return modeOf(b) !== 'auto' || t.needs_review === true
}

/**
 * The board in mode `m`. Tasks already in "review" stay there (going to "auto" does not merge
 * them); the new mode applies to tasks that finish from now on.
 */
export function setMode(b: Board, m: SymccMode): Board {
  return { ...b, mode: isMode(m) ? m : 'auto' }
}

/** The short name of a mode, as shown at a glance: "off", "review merge", "auto". */
export const MODE_NAME: Record<SymccMode, string> = { off: 'off', review: 'review merge', auto: 'auto' }
const MODE_ICON: Record<SymccMode, string> = { off: '⏹', review: '⏸', auto: '⏵' }

/** The label for a mode, in the panel banner and at the start of the status line: "⏹ off", "⏸ review merge", "⏵ auto". */
export const MODE_LABEL: Record<SymccMode, string> = { off: `${MODE_ICON.off} ${MODE_NAME.off}`, review: `${MODE_ICON.review} ${MODE_NAME.review}`, auto: `${MODE_ICON.auto} ${MODE_NAME.auto}` }
export const modeLabel = (m: SymccMode): string => MODE_LABEL[isMode(m) ? m : 'auto']

/** The mode the panel's m button switches to: review and auto swap; off goes to review. */
export const nextMode = (m: SymccMode): SymccMode => (modeOf({ mode: m }) === 'review' ? 'auto' : 'review')

/** The panel's m button: "[m] review merge" in auto (and off), "[m] auto" in review. */
export const modeButton = (m: SymccMode): string => `[m] ${MODE_NAME[nextMode(m)]}`

/** What a mode means, in a few words. */
export const MODE_MEANING: Record<SymccMode, string> = {
  off: 'no work runs; tasks in review can still be approved or rejected',
  review: 'work runs; finished tasks wait for your approve or reject',
  auto: 'work runs; finished tasks that pass merge on their own',
}

/** The one line shown for a mode: "⏵ auto: work runs; finished tasks that pass merge on their own". */
export const modeText = (m: SymccMode): string => `${modeLabel(m)}: ${MODE_MEANING[isMode(m) ? m : 'auto']}`

/** Task `id`, which must be in "review" for approve / reject; throws otherwise. */
export function reviewTask(b: Board, id: string, what: 'approve' | 'reject'): BoardTask {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (t.status !== 'review') throw new Error(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}); only a task in review can be ${what === 'approve' ? 'approved' : 'rejected'}`)
  return t
}

/**
 * The owner rejected task `id` (in "review") because of `reason`: it goes back to "todo" with the
 * reason in its note and history, so the next worker sees it; its test retries start over.
 */
export function rejectTask(b: Board, id: string, reason: string, now: string): Board {
  const t = reviewTask(b, id, 'reject')
  const why = clean(reason, 1000)
  if (!why) throw new Error('give a reason for rejecting, so the next worker knows what to fix')
  return patchTask(b, t.id, { status: 'todo', note: `rejected: ${why.slice(0, 280)}`, test_tries: 0, test_output: undefined, merge_main: false, history: [...t.history, `try ${t.attempts}: rejected by the owner: ${why}`] }, now)
}

// ---------------- looking at a task's changes (review) ----------------

/** One changed file from `git diff --stat`: its path, lines added and removed, or binary. */
export type DiffFile = { file: string; added: number; removed: number; binary?: boolean }

/** Strips git's quoting of an unusual path ("a b\".txt" → a b".txt). */
const unquote = (s: string) => (/^".*"$/.test(s) ? s.slice(1, -1).replace(/\\(.)/g, '$1') : s)

/**
 * The rows of `git diff --stat` output (run with --no-renames): one per file. The +/- counts come
 * from the bar; when git shrank the bar to fit, they are scaled back to the total it gives.
 * The summary line ("2 files changed, ...") and anything else is skipped.
 */
export function parseDiffStat(text: string): DiffFile[] {
  const out: DiffFile[] = []
  for (const line of String(text ?? '').split('\n')) {
    const m = /^\s*(.+?)\s+\|\s+(.*)$/.exec(line)
    if (!m) continue
    const file = unquote(m[1]!.trim())
    const rest = m[2]!.trim()
    if (/^Bin\b/.test(rest)) {
      out.push({ file, added: 0, removed: 0, binary: true })
      continue
    }
    const n = /^(\d+)\s*(\+*)(-*)$/.exec(rest)
    if (!n) continue
    const total = Number(n[1])
    const plus = n[2]!.length
    const minus = n[3]!.length
    const bar = plus + minus
    const added = bar === 0 ? 0 : bar === total ? plus : Math.round((total * plus) / bar)
    out.push({ file, added, removed: bar === 0 ? 0 : total - added })
  }
  return out
}

/** A file row's short count: "+12 -3", "binary". */
export const statCount = (f: DiffFile) => (f.binary ? 'binary' : `+${f.added} -${f.removed}`)

/** How many diff lines the board panel shows before cutting. */
export const DIFF_LINES = 400

/**
 * A diff cut to its first `max` lines; when longer, a last line says how many more there are
 * and where to see them: "… 340 more lines (see /symcc-diff T-5)". `file` goes into that hint.
 */
export function cutDiff(text: string, id: string, max = DIFF_LINES, file = '', name: string = DEFAULT_NAME): string[] {
  const lines = String(text ?? '').replace(/\n+$/, '').split('\n')
  if (lines.length === 1 && !lines[0]) return []
  if (lines.length <= max) return lines
  const more = lines.length - max
  return [...lines.slice(0, max), `… ${more} more ${more === 1 ? 'line' : 'lines'} (see /${name}-diff ${id}${file ? ` ${file}` : ''})`]
}

/** What a diff line is: an added or removed line, a hunk start (@@), a file header, a cut note, or context. */
export type DiffKind = 'add' | 'remove' | 'hunk' | 'header' | 'note' | 'context'

/**
 * The kind of each line of a unified diff. Lines between "diff --git" and the first "@@" are
 * headers (so "--- a/x" and "+++ b/x" are not taken for removed and added lines).
 */
export function diffKinds(lines: string[]): DiffKind[] {
  let inHeader = false
  return lines.map(l => {
    if (l.startsWith('diff --git ') || l.startsWith('diff --cc ')) return ((inHeader = true), 'header')
    if (l.startsWith('@@')) return ((inHeader = false), 'hunk')
    if (/^… \d+ more lines?\b/.test(l)) return 'note'
    if (inHeader) return 'header'
    if (l.startsWith('+')) return 'add'
    if (l.startsWith('-')) return 'remove'
    return 'context'
  })
}

/** The theme color for each kind of diff line: added in the success color, removed in the error color. */
export const DIFF_COLOR: Record<DiffKind, string> = { add: 'success', remove: 'error', hunk: 'ide', header: 'subtle', note: 'warning', context: 'text' }

// ---------------- the slash commands ----------------

/**
 * What a slash command asks for (see parseCommand). Every command starts with the plugin's name:
 * /<name> opens the panel, /<name>-<word> does one thing.
 */
export type Command =
  | { kind: 'open' }
  | { kind: 'tasks' }
  | { kind: 'scouts' }
  | { kind: 'show'; id: string }
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string; reason: string }
  | { kind: 'diff'; id: string; file?: string }
  | { kind: 'scout'; name: string }
  | { kind: 'mode'; mode: SymccMode }
  | { kind: 'help'; topic: string }
  | { kind: 'settings' }
  | { kind: 'set'; setting: SettingName; input: SettingsInput }
  | { kind: 'bad'; message: string }

/** The words after the plugin's name, one per command: /<name>-tasks, /<name>-approve, ... */
export const COMMAND_WORDS = ['tasks', 'scouts', 'task', 'approve', 'reject', 'diff', 'scout', 'mode', 'settings', 'help'] as const

/** Every slash command's name (without the slash): "<name>" and "<name>-<word>". */
export const commandNames = (name: string = DEFAULT_NAME): string[] => [name, ...COMMAND_WORDS.map(w => `${name}-${w}`)]

const isId = (s: string | undefined) => !!s && /^t-?\d+$/i.test(s)

/**
 * The new mode for /<name>-mode: with no word, review and auto switch (off goes to review, never
 * to off); "off", "review" or "auto" set it; anything else gives a usage line.
 */
export function parseModeCommand(args: string, current: SymccMode, name: string = DEFAULT_NAME): { kind: 'mode'; mode: SymccMode } | { kind: 'bad'; message: string } {
  const s = String(args ?? '').trim().toLowerCase()
  if (!s) return { kind: 'mode', mode: modeOf({ mode: current }) === 'review' ? 'auto' : 'review' }
  if (isMode(s)) return { kind: 'mode', mode: s }
  return { kind: 'bad', message: `Use: /${name}-mode (switch review and auto), or /${name}-mode off|review|auto` }
}

/**
 * Reads a slash command: `command` is its name without the slash ("symcc-approve"), `args` the
 * words after it, `current` the board's mode (for /<name>-mode with no word). null when the
 * command is not one of this plugin's. Wrong use gives `bad` with a short usage line.
 */
export function parseCommand(command: string, args: string, current: SymccMode = 'auto', name: string = DEFAULT_NAME): Command | null {
  const s = String(args ?? '').trim()
  const words = s ? s.split(/\s+/) : []
  const id = words[0]
  const use = (text: string): Command => ({ kind: 'bad', message: `Use: ${text}` })
  const c = String(command ?? '').trim().replace(/^\//, '')
  if (c === name) return s ? use(`/${name} (open the board), or /${name}-help for every command`) : { kind: 'open' }
  if (!c.startsWith(`${name}-`)) return null
  switch (c.slice(name.length + 1)) {
    case 'tasks':
      return s ? use(`/${name}-tasks`) : { kind: 'tasks' }
    case 'scouts':
      return s ? use(`/${name}-scouts (to run one: /${name}-scout <name>)`) : { kind: 'scouts' }
    case 'task':
      return isId(id) && words.length === 1 ? { kind: 'show', id: normId(id!) } : use(`/${name}-task T-3`)
    case 'approve':
      return isId(id) && words.length === 1 ? { kind: 'approve', id: normId(id!) } : use(`/${name}-approve T-5`)
    case 'reject': {
      if (!isId(id)) return use(`/${name}-reject T-5 <reason>`)
      const reason = s.replace(/^\S+\s*/, '').trim()
      if (!reason) return { kind: 'bad', message: `Say why, so the next worker knows what to fix: /${name}-reject ${normId(id!)} <reason>` }
      return { kind: 'reject', id: normId(id!), reason }
    }
    case 'diff': {
      if (!isId(id)) return use(`/${name}-diff T-5, or /${name}-diff T-5 <file>`)
      const file = s.replace(/^\S+\s*/, '').trim()
      return file ? { kind: 'diff', id: normId(id!), file } : { kind: 'diff', id: normId(id!) }
    }
    case 'scout':
      return words.length === 1 ? { kind: 'scout', name: id! } : use(`/${name}-scout <name>`)
    case 'mode':
      return parseModeCommand(s, current, name)
    case 'settings':
      return parseSettingsCommand(s, name)
    case 'help':
      return { kind: 'help', topic: s }
  }
  return null
}

/** The changed files as text lines for /<name>-diff: "hooks/board.ts  +12 -3", then a total. */
export function statText(id: string, files: DiffFile[], name: string = DEFAULT_NAME): string {
  if (!files.length) return `${id} has no changes against the target branch.`
  const w = Math.max(...files.map(f => f.file.length))
  const add = files.reduce((n, f) => n + f.added, 0)
  const del = files.reduce((n, f) => n + f.removed, 0)
  return [`${id} changes ${files.length} ${files.length === 1 ? 'file' : 'files'} (+${add} -${del}):`, ...files.map(f => `  ${f.file.padEnd(w)}  ${statCount(f)}`), `One file in full: /${name}-diff ${id} <file>`].join('\n')
}

/** Where the review/waiting/failed tasks go in the panel's list: those first (in this order), the rest after. */
export const NEEDS_YOU: SymccStatus[] = ['review', 'waiting', 'failed']

/** For the panel: tasks that need the owner (NEEDS_YOU) first, the rest keep their order. */
export function needsYouFirst<T extends Pick<SymccTask, 'status'>>(tasks: T[]): T[] {
  const rank = (t: T) => {
    const i = NEEDS_YOU.indexOf(t.status)
    return i < 0 ? NEEDS_YOU.length : i
  }
  return tasks.map((t, i) => [t, i] as const).sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j).map(([t]) => t)
}

// ---------------- which branch work is merged into ----------------

/**
 * The branch a new board merges into: the branch checked out now (`current`). With none
 * (a detached HEAD), the repo's main branch: origin's HEAD (e.g. "origin/main") if set,
 * else "main" or "master", whichever of `branches` exists; "main" when nothing helps.
 */
export function startBranch(current: string, originHead: string, branches: string[]): string {
  const cur = String(current ?? '').trim()
  if (cur) return cur
  const origin = String(originHead ?? '').trim().replace(/^(refs\/remotes\/)?origin\//, '')
  if (origin && origin !== 'HEAD') return origin
  return ['main', 'master'].find(x => branches.includes(x)) ?? 'main'
}

/** The warning when the owner's checked-out branch is not the one work merges into; '' when they match (or no branch is checked out). */
export function branchWarning(target: string, current: string): string {
  const cur = String(current ?? '').trim()
  return cur && cur !== target ? `merging into ${target} · you're on ${cur}` : ''
}

/** The settings tool's answer when target_branch names a branch that doesn't exist; lists a few that do. */
export function noBranchText(name: string, branches: string[]): string {
  const some = branches.slice(0, 8)
  return `Nothing changed: '${name}' is not a branch in this project. target_branch must be an existing branch${some.length ? `, e.g. ${some.join(', ')}` : ''}.`
}

/** The note when the branch work merges into doesn't exist. */
export const missingBranchText = (target: string) => `branch '${target}' doesn't exist; set target_branch`

// ---------------- cleaning up after merged tasks ----------------
// A done task's branch and worktree are removed (the branch only when git lists it as merged).
// A dropped task keeps its branch (it may hold work the owner wants to see), but loses its worktree.

/** A task's branch: its own `branch`, else `prefix` + id (prefix is e.g. "symcc/"). */
const branchOf = (t: Pick<SymccTask, 'id' | 'branch'>, prefix: string) => t.branch ?? `${prefix}${t.id}`

/**
 * The branches that may be deleted: those of done tasks only, that start with `prefix` (the
 * plugin's own branches) and that `merged` (from `git branch --merged <target>`) lists.
 */
export function branchesToDelete(tasks: Pick<SymccTask, 'id' | 'status' | 'branch'>[], merged: string[], prefix: string): string[] {
  if (!prefix) return []
  const ok = new Set(merged.map(x => x.replace(/^[*+]?\s*/, '').trim()).filter(Boolean))
  const out = tasks.filter(t => t.status === 'done').map(t => branchOf(t, prefix)).filter(x => x.startsWith(prefix) && ok.has(x))
  return [...new Set(out)]
}

/** The tasks whose leftover worktree may be removed: done or dropped, with a folder still there (`existing` = task ids with a worktree). */
export function worktreesToRemove(tasks: Pick<SymccTask, 'id' | 'status'>[], existing: string[]): string[] {
  const has = new Set(existing)
  return tasks.filter(t => (t.status === 'done' || t.status === 'dropped') && has.has(t.id)).map(t => t.id)
}

/** The one line for the lead after a cleanup, or '' when it cleaned only a few (`few` or less). */
export function cleanupText(branches: number, worktrees: number, few = 3): string {
  if (branches + worktrees <= few) return ''
  const parts = [branches ? `${branches} merged task branch${branches === 1 ? '' : 'es'}` : '', worktrees ? `${worktrees} leftover task folder${worktrees === 1 ? '' : 's'}` : ''].filter(Boolean)
  return `Cleaned up ${parts.join(' and ')}.`
}

// ---------------- a folder without git ----------------
// Workers each get a git worktree, so the project must be a git repo with at least one commit.
// With none, nothing starts; symcc offers to set one up (it asks first: it makes a .git folder
// and commits the owner's files).

/** ok: a repo with commits; no-git: the git program is missing; no-repo: not inside a git work tree; no-commits: a repo with no commit yet. */
export type GitState = 'ok' | 'no-git' | 'no-repo' | 'no-commits'

/** What the three checks found, as a GitState. */
export function gitStateOf(p: { hasGit: boolean; inside: boolean; hasHead: boolean }): GitState {
  if (!p.hasGit) return 'no-git'
  if (!p.inside) return 'no-repo'
  return p.hasHead ? 'ok' : 'no-commits'
}

/** The short note on the banner and status line; '' when git is fine. */
export function gitNote(s: GitState): string {
  if (s === 'no-git') return 'git is not installed'
  if (s === 'no-repo') return 'no git repo here; set up git (g)'
  if (s === 'no-commits') return 'no commits yet; set up git (g)'
  return ''
}

/** The one message the lead gets when the git program is missing. */
export function noGitText(name: string = DEFAULT_NAME): string {
  return `No work can start: git is not installed. ${name} needs git to give each worker its own copy of the project (git worktrees), so it can't work without it. Tell the owner how to install it: on macOS run \`xcode-select --install\` (or get it from https://git-scm.com); on Linux use the package manager (e.g. \`sudo apt install git\`). Then start a new session.`
}

/** The question the lead passes on to the owner when the folder has no repo (or no commits); `setup` = how to say yes. */
export function setupAskText(s: GitState, name: string = DEFAULT_NAME, setup = `${name} setup_git`): string {
  const what = s === 'no-commits' ? 'This folder has a git repo but no commits yet' : 'This folder has no git repo'
  const steps = s === 'no-commits' ? 'a .gitignore, a first commit of the current files' : 'git init, a .gitignore, a first commit of the current files'
  return `${what}. ${name} needs one to give each worker its own copy. Set it up? (${steps}.) Nothing starts until it's done. Ask the owner; only if they say yes, run ${setup} (or they press g in the board panel). It never pushes and adds no remote.`
}

/** The lines a .gitignore made by setup holds (the data folder first). */
export const gitignoreBase = (dir: string = DATA_DIR) => [`${dir}/`, 'node_modules/', '.env', '.env.*', '.DS_Store', 'dist/', 'build/', '__pycache__/', '.venv/']

/** A .gitignore line as git matches it, to spot one already there: no leading "/", no trailing "/", no spaces around. */
const ignoreKey = (line: string) => line.trim().replace(/^\//, '').replace(/\/+$/, '')

/**
 * The .gitignore text after adding `lines` to `old` (null = no file yet): only the lines not
 * there already (and each once), at the end. Returns `old` unchanged when nothing is missing.
 */
export function gitignoreWith(old: string | null, lines: string[]): string {
  const text = old ?? ''
  const have = new Set(text.split(/\r?\n/).map(ignoreKey).filter(Boolean))
  const add: string[] = []
  for (const l of lines.map(x => x.trim()).filter(Boolean)) {
    const k = ignoreKey(l)
    if (!k || have.has(k)) continue
    have.add(k)
    add.push(l)
  }
  if (!add.length) return text
  const head = text && !text.endsWith('\n') ? `${text}\n` : text
  return `${head}${add.join('\n')}\n`
}

/** Files bigger than this are left out of the first commit. */
export const BIG_FILE_BYTES = 50 * 1024 * 1024

/** Whether a file's name looks like a secret: .env and .env.*, *.pem, *.key, and SSH private keys (id_rsa, id_ed25519, ...; not their .pub). */
export function isSecretName(file: string): boolean {
  const base = file.split('/').pop() ?? ''
  if (base === '.env' || base.startsWith('.env.')) return true
  if (/\.(pem|key)$/i.test(base)) return true
  return /^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)
}

/** One file `git ls-tree -r -l -z` lists: its path and size in bytes (null for a submodule). */
export type TreeFile = { file: string; size: number | null }

/** Reads `git ls-tree -r -l -z` output ("mode type hash size\tpath", NUL between entries). */
export function parseLsTree(text: string): TreeFile[] {
  return text
    .split('\0')
    .filter(Boolean)
    .map(e => {
      const tab = e.indexOf('\t')
      const size = Number(e.slice(0, tab).trim().split(/\s+/)[3])
      return { file: e.slice(tab + 1), size: Number.isFinite(size) ? size : null }
    })
    .filter(f => f.file)
}

/** The files to leave out of the first commit, each with why: a secret-like name or over `max` bytes. */
export function riskyFiles(files: TreeFile[], max = BIG_FILE_BYTES): { file: string; why: string }[] {
  const out: { file: string; why: string }[] = []
  for (const f of files) {
    if (isSecretName(f.file)) out.push({ file: f.file, why: 'looks like a secret' })
    else if (f.size !== null && f.size > max) out.push({ file: f.file, why: `${Math.round(f.size / 1024 / 1024)} MB, over ${Math.round(max / 1024 / 1024)} MB` })
  }
  return out
}

/** The .gitignore line for one left-out file: its exact path from the repo's top (special characters escaped). */
export const ignoreLineFor = (file: string) => `/${file.replace(/([*?[\]!#\\])/g, '\\$1').replace(/^ /, '\\ ')}`

/** What setup tells the lead and owner when it is done. */
export function setupDoneText(o: { init: boolean; branch: string; files: number; left: { file: string; why: string }[]; gitignore: 'made' | 'added' | 'kept'; name?: string }): string {
  const name = o.name ?? DEFAULT_NAME
  const steps = [o.init ? 'made a git repo' : '', o.gitignore === 'made' ? 'wrote a .gitignore' : o.gitignore === 'added' ? 'added lines to .gitignore' : '', `committed ${o.files} file${o.files === 1 ? '' : 's'} on ${o.branch} ("Initial commit (by ${name})")`].filter(Boolean)
  const warn = o.left.length ? ` Warning: left out of the commit and added to .gitignore: ${o.left.slice(0, 10).map(x => `${x.file} (${x.why})`).join(', ')}${o.left.length > 10 ? `, and ${o.left.length - 10} more` : ''}.` : ''
  return `Git is set up: ${steps.join(', ')}. Work merges into ${o.branch}; nothing was pushed and no remote was added.${warn}`
}

// ---------------- when the tests fail ----------------

/** How much of the failing test output the next worker is shown (the end of it). */
export const TEST_OUTPUT_CHARS = 3000

/**
 * A task's tests failed. 'retry': send it back to "todo" so a new worker fixes it, with the
 * test output; 'fail': it already had `max` automatic retries, so the lead decides.
 */
export function onTestFail(t: Pick<SymccTask, 'test_tries'>, max = DEFAULT_AUTO_RETRIES): 'retry' | 'fail' {
  return retryOrFail(t.test_tries, max)
}

/** The last `n` characters of the test output, so it fits in the next worker's prompt. */
export function testTail(output: string, n = TEST_OUTPUT_CHARS): string {
  const s = String(output ?? '').trim()
  return s.length > n ? '…' + s.slice(-n) : s
}

/** Should the board panel open by itself when a session starts? Yes unless the board turned it off. */
export const openOnStart = (b: Partial<Pick<Board, 'open_on_start'>>) => b.open_on_start !== false

/** Should a merged task be said out loud? Yes unless the board turned voice off. */
export const voiceOn = (b: Partial<Pick<Board, 'voice'>>) => b.voice !== false

/** The spoken line for tasks just merged: "T-3 done", "T-3 and T-4 done", "T-3, T-4 and T-5 done". '' for none. */
export function spokenDone(ids: string[]): string {
  const xs = [...new Set(ids.map(x => String(x ?? '').trim()).filter(Boolean))]
  if (!xs.length) return ''
  const list = xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  return `${list} done`
}

/** A settings value for auto_retries: a whole number from 0 to 10. */
export const clampRetries = (n: number) => Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : DEFAULT_AUTO_RETRIES)))

// ---------------- settings ----------------
// One list of settings, used by the lead's settings tool, /<name>-settings and the panel's Settings view.

export const SETTING_NAMES = ['test_commands', 'target_branch', 'max_parallel', 'max_minutes', 'auto_retries', 'open_on_start', 'voice', 'mode'] as const
export type SettingName = (typeof SETTING_NAMES)[number]
/** commands: test_commands; branch: target_branch; number: a whole number within min-max; onoff: true/false; mode: off/review/auto */
export type SettingKind = 'commands' | 'branch' | 'number' | 'onoff' | 'mode'
export type SettingInfo = { name: SettingName; kind: SettingKind; min?: number; max?: number; default: string; range: string; meaning: string }

/** How many test commands a board keeps. */
export const MAX_TEST_COMMANDS = 5

export const SETTINGS: SettingInfo[] = [
  { name: 'test_commands', kind: 'commands', default: 'none', range: 'commands joined with " && "', meaning: 'must all pass before work is merged' },
  { name: 'target_branch', kind: 'branch', default: 'the branch checked out', range: 'an existing local branch', meaning: 'the branch finished work is merged into' },
  { name: 'max_parallel', kind: 'number', min: 1, max: 8, default: '3', range: '1-8', meaning: 'how many workers run at once' },
  { name: 'max_minutes', kind: 'number', min: 5, max: 600, default: '45', range: '5-600', meaning: 'a worker running longer is stopped' },
  { name: 'auto_retries', kind: 'number', min: 0, max: 10, default: String(DEFAULT_AUTO_RETRIES), range: '0-10', meaning: 'new tries on their own after failing tests' },
  { name: 'open_on_start', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'open the board panel when a session starts' },
  { name: 'voice', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'say "T-3 done" out loud when a task is merged' },
  { name: 'mode', kind: 'mode', default: 'auto', range: 'off / review / auto', meaning: 'off: nothing runs; review: finished work waits for you; auto: it merges on its own' },
]

export const settingInfo = (name: string): SettingInfo | undefined => SETTINGS.find(s => s.name === name)

/** A setting's current value as text: "npm test && npm run lint", "on", "5", "none". */
export function settingValue(b: Partial<Board>, name: SettingName): string {
  const d = emptyBoard()
  switch (name) {
    case 'test_commands':
      return (b.test_commands ?? []).join(' && ') || 'none'
    case 'target_branch':
      return b.target_branch ?? d.target_branch
    case 'open_on_start':
      return openOnStart(b) ? 'on' : 'off'
    case 'voice':
      return voiceOn(b) ? 'on' : 'off'
    case 'mode':
      return modeOf(b)
    default:
      return String(b[name] ?? d[name])
  }
}

/** What the settings tool takes: each key optional; anything of the wrong type is left alone. */
export type SettingsInput = Record<string, unknown>

/** One changed setting: `value` as text, `said` the lead's wording, `cut` a note when the value was cut to its limit ('' if not). */
export type SettingChange = { name: SettingName; value: string; said: string; cut: string }

/**
 * Applies the settings in `a` to the board, with the same limits for the lead and the owner:
 * max_parallel 1-8, max_minutes 5-600, auto_retries 0-10, up to 5 test commands. A value
 * outside its limit is cut to it, and the change says so. target_branch must already be
 * checked to exist; mode is not set here (see setBoardMode).
 */
export function applySettings(b: Board, a: SettingsInput): { board: Board; changes: SettingChange[] } {
  const y = { ...b }
  const changes: SettingChange[] = []
  const add = (name: SettingName, said: string, cut = '') => changes.push({ name, value: settingValue(y, name), said, cut })
  const target = typeof a.target_branch === 'string' ? a.target_branch.trim() : ''
  if (target) ((y.target_branch = target), add('target_branch', `work merges into ${target}`))
  if (Array.isArray(a.test_commands)) {
    const all = a.test_commands.map(x => String(x).trim()).filter(Boolean)
    y.test_commands = all.slice(0, MAX_TEST_COMMANDS)
    add('test_commands', `tests: ${y.test_commands.join(' && ') || 'none'}`, all.length > MAX_TEST_COMMANDS ? ` (only the first ${MAX_TEST_COMMANDS} kept: test_commands holds up to ${MAX_TEST_COMMANDS})` : '')
  }
  for (const name of ['max_parallel', 'max_minutes', 'auto_retries'] as const) {
    const n = a[name]
    if (typeof n !== 'number' || !Number.isFinite(n)) continue
    const s = settingInfo(name)!
    const v = Math.max(s.min!, Math.min(s.max!, Math.round(n)))
    y[name] = v
    const cut = v !== Math.round(n) ? ` (cut from ${n} to the limit: ${name} must be ${s.range})` : ''
    add(name, name === 'max_parallel' ? `up to ${v} at once` : name === 'max_minutes' ? `a worker may run ${v} min` : `${v} automatic ${v === 1 ? 'retry' : 'retries'} after failing tests`, cut)
  }
  if (typeof a.open_on_start === 'boolean') ((y.open_on_start = a.open_on_start), add('open_on_start', a.open_on_start ? 'the board opens when a session starts' : 'the board no longer opens when a session starts'))
  if (typeof a.voice === 'boolean') ((y.voice = a.voice), add('voice', a.voice ? 'merged tasks are said out loud' : 'merged tasks are no longer said out loud'))
  return { board: y, changes }
}

/** The owner's wording of a change: "max_parallel set to 5", plus the cut note. */
export const settingSetText = (c: SettingChange) => `${c.name} set to ${c.value}${c.cut}`

const unquoteValue = (s: string) => {
  const t = s.trim()
  return t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0] ? t.slice(1, -1).trim() : t
}

/**
 * Reads a typed value for one setting into settings tool input: numbers as whole numbers
 * (outside the limit they are cut later, by applySettings), on/off, a mode, one branch name,
 * or test commands joined with " && " ("none" or "" for none).
 */
export function parseSettingValue(name: SettingName, raw: string): { ok: true; input: SettingsInput } | { ok: false; message: string } {
  const s = settingInfo(name)!
  const v = unquoteValue(String(raw ?? ''))
  const bad = (message: string) => ({ ok: false as const, message })
  switch (s.kind) {
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(v) ? { ok: true, input: { [name]: Number(v) } } : bad(`${name} must be a whole number, ${s.range}`)
    case 'onoff': {
      const w = v.toLowerCase()
      if (['on', 'true', 'yes'].includes(w)) return { ok: true, input: { [name]: true } }
      if (['off', 'false', 'no'].includes(w)) return { ok: true, input: { [name]: false } }
      return bad(`${name} must be on or off`)
    }
    case 'mode': {
      const w = v.toLowerCase()
      return isMode(w) ? { ok: true, input: { mode: w } } : bad('mode must be off, review or auto')
    }
    case 'branch':
      return v && !/\s/.test(v) ? { ok: true, input: { target_branch: v } } : bad('target_branch must be one existing branch name')
    case 'commands':
      return { ok: true, input: { test_commands: v.toLowerCase() === 'none' ? [] : v.split(/\s+&&\s+/).map(x => x.trim()).filter(Boolean) } }
  }
}

/**
 * /<name>-settings: no words opens the Settings view; "NAME VALUE" sets one setting
 * (e.g. "max_parallel 5", "voice off", 'test_commands "npm test"').
 */
export function parseSettingsCommand(args: string, name: string = DEFAULT_NAME): { kind: 'settings' } | { kind: 'set'; setting: SettingName; input: SettingsInput } | { kind: 'bad'; message: string } {
  const s = String(args ?? '').trim()
  if (!s) return { kind: 'settings' }
  const word = s.split(/\s+/)[0]!
  const info = settingInfo(word.toLowerCase().replace(/-/g, '_'))
  if (!info) return { kind: 'bad', message: `There is no setting called ${word}; settings are: ${SETTING_NAMES.join(', ')}` }
  const rest = s.slice(word.length).trim()
  if (!rest) return { kind: 'bad', message: `Give a value: /${name}-settings ${info.name} <${info.range}> (${info.meaning})` }
  const r = parseSettingValue(info.name, rest)
  return r.ok ? { kind: 'set', setting: info.name, input: r.input } : { kind: 'bad', message: r.message }
}

/** The settings as text lines: name, value, default, range and meaning (when the panel can't be shown). */
export function settingsText(b: Partial<Board>, name: string = DEFAULT_NAME): string {
  const w = Math.max(...SETTING_NAMES.map(n => n.length))
  return [
    ...SETTINGS.map(s => `${s.name.padEnd(w)}  ${settingValue(b, s.name)}  (default ${s.default} · ${s.range}) ${s.meaning}`),
    `Change one: /${name}-settings NAME VALUE, e.g. /${name}-settings max_parallel 5`,
  ].join('\n')
}

// ---------------- when the branch conflicts with main ----------------

/** How many new tries a task gets to merge main into its branch after a conflict. */
export const MAX_CONFLICT_TRIES = DEFAULT_AUTO_RETRIES

/**
 * A task's branch conflicted with the latest main. 'retry': send it back to "todo" so a new
 * worker merges main and resolves the conflict; 'fail': it was already tried `max` times.
 */
export function onConflict(t: Pick<SymccTask, 'conflict_tries'>, max = MAX_CONFLICT_TRIES): 'retry' | 'fail' {
  return retryOrFail(t.conflict_tries, max)
}

/** For showing the board: newest task first (by when it was made, then by its number). */
export function newestFirst(x: SymccTask, y: SymccTask): number {
  return (y.created_at || '').localeCompare(x.created_at || '') || num(y.id) - num(x.id)
}

// ---------------- which day a task belongs to ----------------
// The board shows open tasks first, then today's finished tasks in full, then one folded
// row per older day. `offsetMin` is the owner's time zone: minutes to add to UTC to get
// local time (e.g. 120 for UTC+2), i.e. `-new Date().getTimezoneOffset()`.

/** The owner's time zone offset now, in minutes east of UTC. */
export const localOffset = (atMs: number = Date.now()) => -new Date(atMs).getTimezoneOffset()

/** The local day of a moment, as "YYYY-MM-DD"; '' when the time can't be read. */
export function dayOf(ms: number, offsetMin: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms + offsetMin * 60_000).toISOString().slice(0, 10)
}

/** The local day a task belongs to: that of its `updated_at`, else its `created_at`; '' when neither can be read. */
export function taskDay(t: Pick<SymccTask, 'updated_at' | 'created_at'>, offsetMin: number): string {
  for (const iso of [t.updated_at, t.created_at]) {
    const d = dayOf(Date.parse(iso || ''), offsetMin)
    if (d) return d
  }
  return ''
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How a day ("YYYY-MM-DD") is named, seen from `today`: "Yesterday", "Wed 4 Nov", or "Wed 4 Nov 2025" in another year. */
export function dayLabel(day: string, today: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(d.getTime())) return day
  const t = new Date(`${today}T00:00:00Z`)
  if (Number.isFinite(t.getTime()) && t.getTime() - d.getTime() === 86_400_000) return 'Yesterday'
  const year = day.slice(0, 4) !== today.slice(0, 4) ? ` ${d.getUTCFullYear()}` : ''
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`
}

/** One older day's finished tasks, folded into one row. */
export type DayGroup<T extends SymccTask = SymccTask> = { day: string; label: string; done: number; dropped: number; tasks: T[] }
export type BoardSections<T extends SymccTask = SymccTask> = { open: T[]; backlog: T[]; today: T[]; days: DayGroup<T>[] }

/**
 * Sorts tasks for showing the board at `nowMs` in time zone `offsetMin`: `open` (still need
 * something, whatever their day), `backlog` (ideas, whatever their day), `today` (today's finished tasks, and any whose day can't be
 * read or lies ahead), and `days` (older finished tasks, one group per day, newest day first).
 * Inside each part, the newest task comes first.
 */
export function boardSections<T extends SymccTask>(tasks: T[], nowMs: number, offsetMin: number): BoardSections<T> {
  const today = dayOf(nowMs, offsetMin)
  const all = [...tasks].sort(newestFirst)
  const open = all.filter(t => OPEN.includes(t.status))
  const backlog = all.filter(t => t.status === 'backlog')
  const closed = all.filter(t => !OPEN.includes(t.status) && t.status !== 'backlog')
  const isOld = (t: T) => {
    const d = taskDay(t, offsetMin)
    return !!today && !!d && d < today
  }
  const byDay = new Map<string, T[]>()
  for (const t of closed.filter(isOld)) {
    const d = taskDay(t, offsetMin)
    byDay.set(d, [...(byDay.get(d) ?? []), t])
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, ts]) => ({ day, label: dayLabel(day, today), done: ts.filter(t => t.status === 'done').length, dropped: ts.filter(t => t.status === 'dropped').length, tasks: ts }))
  return { open, backlog, today: closed.filter(t => !isOld(t)), days }
}

/** A day group's row: "▸ Yesterday · 6 done", "▾ Mon 9 Nov · 4 done · 1 dropped" when opened. */
export function groupLabel(g: Pick<DayGroup, 'label' | 'done' | 'dropped'>, opened = false): string {
  const counts = [g.done && `${g.done} done`, g.dropped && `${g.dropped} dropped`].filter(Boolean)
  return [`${opened ? '▾' : '▸'} ${g.label}`, ...counts].join(' · ')
}

/** The backlog group's row in the board panel: "▸ Backlog · 3", "▾ Backlog · 3" when opened. */
export const backlogLabel = (n: number, opened = false): string => `${opened ? '▾' : '▸'} Backlog · ${n}`

/** How many backlog items the board panel lists before a "… N more" line. */
export const BACKLOG_SHOWN = 5
/** The backlog section's header in the board panel, folded by default: "▸ Backlog · 3", "▾ Backlog · 3" when opened. */
export const backlogHeader = (n: number, opened = false): string => backlogLabel(n, opened)
/** The line under the first BACKLOG_SHOWN backlog items when there are more. */
export const backlogMoreLabel = (more: number): string => `… ${more} more (Enter to show all)`

// ---------------- time and cost of each try ----------------

/** The runs with a new try started at `now`. */
export const startRun = (runs: SymccRun[] | undefined, now: string): SymccRun[] => [...(runs ?? []), { started: now }]

/**
 * The runs with the last try ended at `now`, adding what it used if known. A try already
 * ended keeps its end time (a second end does not move it), but missing tokens/cost are filled in.
 */
export function endRun(runs: SymccRun[] | undefined, now: string, used: { tokens?: number; cost?: number } = {}): SymccRun[] {
  const out = [...(runs ?? [])]
  const last = out[out.length - 1]
  if (!last) return out
  const add = {
    ...(used.tokens !== undefined && last.tokens === undefined ? { tokens: used.tokens } : {}),
    ...(used.cost !== undefined && last.cost === undefined ? { cost: used.cost } : {}),
  }
  out[out.length - 1] = { ...last, ...(last.ended ? {} : { ended: now }), ...add }
  return out
}

/**
 * All the tokens a turn result reports (input, cache reads, cache writes and output), or
 * undefined if it reports none. The worker's turn result gives token counts only, no dollar cost.
 */
export function usageTokens(u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined): number | undefined {
  if (!u) return undefined
  const n = [u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens].reduce<number>((s, x) => s + (typeof x === 'number' && Number.isFinite(x) ? x : 0), 0)
  return n > 0 ? n : undefined
}

/** How long one try took, in ms. A try still running counts up to `nowMs` (0 if not given). */
export function runMs(r: SymccRun, nowMs?: number): number {
  const a = Date.parse(r.started)
  const z = r.ended ? Date.parse(r.ended) : nowMs
  if (!Number.isFinite(a) || z === undefined || !Number.isFinite(z)) return 0
  return Math.max(0, z - a)
}

export type RunTotal = { ms: number; tokens?: number; cost?: number; tries: number }

/** Adds up tries: their time, and their tokens and cost where any try reports them. */
export function sumRuns(runs: SymccRun[] | undefined, nowMs?: number): RunTotal {
  const rs = runs ?? []
  const tok = rs.filter(r => typeof r.tokens === 'number')
  const usd = rs.filter(r => typeof r.cost === 'number')
  return {
    ms: rs.reduce((s, r) => s + runMs(r, nowMs), 0),
    tries: rs.length,
    ...(tok.length ? { tokens: tok.reduce((s, r) => s + r.tokens!, 0) } : {}),
    ...(usd.length ? { cost: usd.reduce((s, r) => s + r.cost!, 0) } : {}),
  }
}

/** Adds up every try of every task on the board. */
export function boardTotal(b: { tasks: Pick<SymccTask, 'runs'>[] }, nowMs?: number): RunTotal {
  return sumRuns(b.tasks.flatMap(t => t.runs ?? []), nowMs)
}

/** A length of time: "45s", "12m", "1h 05m". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Dollars: "$0.42", "$3.40"; very small amounts "<$0.01". */
export function fmtCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00'
  return usd < 0.005 ? '<$0.01' : `$${usd.toFixed(2)}`
}

/** Token counts: "950", "12.3k", "1.2M". */
export function fmtTokens(n: number): string {
  const one = (x: number) => x.toFixed(1).replace(/\.0$/, '')
  if (n < 1000) return String(Math.round(n))
  if (n < 999_950) return `${one(n / 1000)}k`
  return `${one(n / 1_000_000)}M`
}

/** One total in words: "1h 12m · 1.2M tokens · ~$3.40" (tokens and cost only when known). */
export function fmtTotal(t: RunTotal): string {
  return [fmtDuration(t.ms), t.tokens !== undefined && `${fmtTokens(t.tokens)} tokens`, t.cost !== undefined && `~${fmtCost(t.cost)}`].filter(Boolean).join(' · ')
}

/** One try in words: "try 2: 12m · 40k tokens", with "(running)" while it has not ended. */
export function fmtRun(r: SymccRun, i: number, nowMs?: number): string {
  return `try ${i + 1}: ${fmtTotal(sumRuns([r], nowMs))}${r.ended ? '' : ' (running)'}`
}

/** The board's total line, e.g. "total: 1h 12m · ~$3.40 over 4 tries"; '' when no try has run. */
export function totalLine(b: { tasks: Pick<SymccTask, 'runs'>[] }, nowMs?: number): string {
  const t = boardTotal(b, nowMs)
  return t.tries ? `total: ${fmtTotal(t)} over ${t.tries} ${t.tries === 1 ? 'try' : 'tries'}` : ''
}

// ---------------- the commits of a task ----------------

/** A full git commit id: 40 hex characters (SHA-1) or 64 (SHA-256). */
export const isSha = (x: unknown): x is string => typeof x === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(x)

/**
 * A task from board.json with its commit fields made safe: `runs[].commits` keeps only full
 * commit ids (a broken list is dropped), a run that is not an object is dropped, and a `merged`
 * that is not a full commit id is dropped. Old boards
 * without these fields load as they are.
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

/**
 * The runs with commit ids `shas` added to the last try (no repeats, only full ids). With no
 * try at all (a task from before tries were kept) the runs stay as they are.
 */
export function addCommits(runs: SymccRun[] | undefined, shas: readonly string[]): SymccRun[] {
  const out = [...(runs ?? [])]
  const last = out[out.length - 1]
  const add = shas.filter(isSha)
  if (!last || !add.length) return out
  const have = (last.commits ?? []).filter(isSha)
  const commits = [...have, ...add.filter((x, i) => !have.includes(x) && add.indexOf(x) === i)]
  out[out.length - 1] = { ...last, commits }
  return out
}

/** One line of text for a commit message: control characters and line breaks become spaces, cut to `n` (with "…"). */
export function oneLine(s: unknown, n: number): string {
  // eslint-disable-next-line no-control-regex
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/** How long the Symcc-Why trailer may be. */
export const WHY_TRAILER_CHARS = 200

/** Who a task came from, for the Symcc-From trailer: "owner", "scout bugs", "T-12 (split)", "T-3 (worker report)", "lead" or "unknown". */
export function originTag(t: { origin?: unknown }): string {
  const o = originOf(t)
  if (!o) return 'unknown'
  if (o.by === 'owner') return 'owner'
  if (o.by === 'scout') return `scout ${oneLine(o.scout, 60) || '?'}`
  if (o.by === 'worker') return `${oneLine(o.task, 20) || '?'} (worker report)`
  if (o.task && o.how) return `${oneLine(o.task, 20)} (${o.how})`
  return 'lead'
}

/** The trailer key prefix for a plugin name: "symcc" → "Symcc"; only letters, digits and dashes. */
export function trailerPrefix(name: string = DEFAULT_NAME): string {
  const n = String(name ?? '').replace(/[^A-Za-z0-9-]/g, '').replace(/^-+/, '') || 'Symcc'
  return n[0]!.toUpperCase() + n.slice(1)
}

/**
 * The message of a commit symcc makes for task `t`: the first line (`subject`, by default
 * "T-x: title"), a blank line, then git trailers that `git log --format=%(trailers)` reads:
 *   Symcc-Task: T-73
 *   Symcc-From: owner | scout <name> | T-12 (split) | lead | unknown
 *   Symcc-Why: <the task's why on one line, cut to ~200 characters>
 *   Symcc-Try: <try number>
 * Line breaks and control characters in the title and why are made into spaces, so they
 * can never break the trailer block. Trailers with nothing to say (no why) are left out.
 */
export function commitMessage(t: Pick<SymccTask, 'id' | 'title' | 'attempts'> & { origin?: unknown }, o: { subject?: string; name?: string; tryNo?: number } = {}): string {
  const id = oneLine(t.id, 40) || '?'
  const subject = oneLine(o.subject ?? `${id}: ${t.title}`, 200) || id
  const k = trailerPrefix(o.name)
  const og = originOf(t)
  const why = oneLine(og?.why, WHY_TRAILER_CHARS)
  const n = Number(o.tryNo ?? t.attempts)
  const tryNo = Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : ''
  const trailers = [`${k}-Task: ${id}`, `${k}-From: ${originTag(t)}`, ...(why ? [`${k}-Why: ${why}`] : []), ...(tryNo ? [`${k}-Try: ${tryNo}`] : [])]
  return `${subject}\n\n${trailers.join('\n')}\n`
}

/** One commit of a task as shown: its full id, the try that made it, and whether it is the one that landed on the target branch. */
export type TaskCommit = { sha: string; try?: number; merged: boolean }

/** A task's commits, newest first; the merged one is marked (and listed even if no try recorded it). */
export function taskCommits(t: Pick<SymccTask, 'runs' | 'merged'>): TaskCommit[] {
  const merged = isSha(t.merged) ? t.merged : undefined
  const all: TaskCommit[] = []
  ;(t.runs ?? []).forEach((r, i) => {
    for (const sha of Array.isArray(r?.commits) ? r.commits : []) if (isSha(sha) && !all.some(c => c.sha === sha)) all.push({ sha, try: i + 1, merged: sha === merged })
  })
  if (merged && !all.some(c => c.sha === merged)) all.push({ sha: merged, merged: true })
  return all.reverse()
}

/** A short commit id, as git shows it: the first 8 characters. */
export const shortSha = (sha: string) => sha.slice(0, 8)

/** One commit in words: "47d4b71c (try 2, merged)". */
export const commitText = (c: TaskCommit) => {
  const more = [c.try ? `try ${c.try}` : '', c.merged ? 'merged' : ''].filter(Boolean).join(', ')
  return `${shortSha(c.sha)}${more ? ` (${more})` : ''}`
}

/** The project's folder name, the last part of a path: "/Users/me/repositories/app" → "app". */
export function folderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? ''
}

/** A path with the home folder shortened to "~": "/Users/me/x" → "~/x". */
export function shortHome(path: string, home?: string): string {
  const h = (home ?? '').replace(/\/+$/, '')
  if (!h) return path
  if (path === h) return '~'
  return path.startsWith(h + '/') ? '~' + path.slice(h.length) : path
}

/** "<icon> <name> board": the bold, colored part of a title (ICON from name.ts, then namesFor(name).boardName). */
export const boardBrand = (name: string = DEFAULT_NAME) => `${ICON} ${namesFor(name).boardName}`
/** " · <folder>": the dimmed project part of a title, or '' when the folder is unknown. */
export const boardWhere = (root: string) => (folderName(root) ? ` · ${folderName(root)}` : '')
/** The board's title: "<icon> <name> board · <folder>", or just "<icon> <name> board" when the folder is unknown. */
export const boardTitle = (root: string, name: string = DEFAULT_NAME) => `${boardBrand(name)}${boardWhere(root)}`
/** The status line label, without the mark (Claude Code adds its own): "<name> board · <folder>". */
export const boardLabel = (root: string, name: string = DEFAULT_NAME) => `${namesFor(name).boardName}${boardWhere(root)}`

/**
 * The status line text. Claude Code already puts the plugin name in front, so this starts with
 * just the folder: "app · 1 doing · 2 to do", "app (driven by another session) · empty".
 * undefined when there is nothing to say (the status is cleared).
 */
/** At most this many task IDs are listed for one state in the status line; the rest show as "+N". */
export const STATUS_IDS = 3

/** "T-1, T-2, T-3 +2" for the first STATUS_IDS IDs. */
function idList(ids: string[]): string {
  const shown = ids.slice(0, STATUS_IDS).join(', ')
  return ids.length > STATUS_IDS ? `${shown} +${ids.length - STATUS_IDS}` : shown
}

/**
 * The short status text Claude Code shows after "symcc:", e.g. "⏸ review merge · T-26, T-27 doing · 1 to review (T-5) · 2 to do".
 * It starts with the board mode (modeLabel: "⏹ off", "⏸ review merge", "⏵ auto"), so the mode is always in the same spot.
 * Tasks being done, in review and failed are listed by ID; other open states are counts. No folder name (the pane title has it).
 * undefined when there is nothing to say: an empty board this session drives, in mode auto, with no branch note.
 */
export function statusLine(b: { tasks: Pick<SymccTask, 'id' | 'status'>[] }, driving: boolean, branch_note = '', mode: SymccMode = 'auto'): string | undefined {
  const join = (xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' · ')
  const ids = (st: SymccStatus) => b.tasks.filter(t => t.status === st).map(t => t.id)
  const other = driving ? '' : ' (driven by another session)'
  const m = modeOf({ mode })
  const label = modeLabel(m)
  if (b.tasks.length) {
    const doing = ids('doing'), review = ids('review'), failed = ids('failed')
    const parts = [
      doing.length && `${idList(doing)} ${STATUS_WORD.doing}`,
      review.length && `${review.length} to review (${idList(review)})`,
      ...statusCounts(b.tasks, ['todo', 'paused', 'waiting']),
      failed.length && `${failed.length} ${STATUS_WORD.failed} (${idList(failed)})`,
    ].filter((x): x is string => !!x)
    // backlog stays out of the line, except when it is all that is left: then say so, so parked ideas aren't hidden
    const parked = ids('backlog').length
    return join([label, (join(parts) || (parked ? `all done · ${parked} in backlog` : 'all done')) + other, branch_note])
  }
  if (!driving) return join([label, 'empty' + other, branch_note])
  // an empty board in mode auto stays quiet, so a fresh project shows nothing
  if (m !== 'auto') return join([label, branch_note])
  return branch_note || undefined
}

// ---------------- the banner at the top of the board panel ----------------

/** Below this many columns the drawing is dropped and only the text lines are shown. */
export const BANNER_NARROW = 50
/** How a piece of banner text is drawn: accent (the 'ide' theme color), plain, dim or warning. */
export type BannerTone = 'accent' | 'plain' | 'dim' | 'warning'
export type BannerPart = { text: string; tone: BannerTone; bold?: boolean }
/** One banner line: the drawing part on the left ('' or spaces when none) and the text beside it. */
export type BannerLine = { art: string; parts: BannerPart[] }
/** What the banner needs from the board. */
/** `branch_note`: a warning about the branch (see branchWarning, missingBranchText), shown in place of the branch name. */
export type BannerBoard = Pick<Board, 'test_commands' | 'target_branch' | 'max_parallel' | 'max_minutes' | 'auto_retries'> & { tasks: Pick<SymccTask, 'status' | 'runs'>[]; branch_note?: string }

/** The word the owner sees for each status. */
export const STATUS_WORD: Record<SymccStatus, string> = { backlog: 'backlog', review: 'ready for review', waiting: 'waiting for you', failed: 'failed', doing: 'doing', paused: 'paused', todo: 'to do', done: 'done', dropped: 'dropped' }

/** "2 doing", "1 to do", ... for each status in `order` that has tasks, in that order. */
export function statusCounts(tasks: Pick<SymccTask, 'status'>[], order: SymccStatus[]): string[] {
  return order.map(st => [tasks.filter(t => t.status === st).length, STATUS_WORD[st]] as const).filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`)
}

const BANNER_ORDER: SymccStatus[] = ['doing', 'review', 'waiting', 'failed', 'paused', 'todo', 'backlog', 'done']

/** Cuts parts so their text fits in `room` columns, ending with "…" when something was cut. */
function cutParts(parts: BannerPart[], room: number): BannerPart[] {
  const len = parts.reduce((s, p) => s + p.text.length, 0)
  if (len <= room) return parts
  const out: BannerPart[] = []
  let left = Math.max(0, room - 1)
  for (const p of parts) {
    if (left <= 0) break
    out.push({ ...p, text: p.text.slice(0, left) })
    left -= p.text.length
  }
  if (room > 0) out.push({ text: '…', tone: out[out.length - 1]?.tone ?? 'dim' })
  return out
}

/**
 * The banner lines for the board panel: the name and folder, where and who drives, the
 * settings, and (when there are tasks) the counts and total. With `width` of at least
 * BANNER_NARROW the drawing sits on the left; narrower, only the text, cut to fit.
 * The separator under it is `bannerRule(width)`.
 */
export function bannerLines(b: BannerBoard, root: string, home: string, driving: boolean, width: number, nowMs?: number, name: string = DEFAULT_NAME): BannerLine[] {
  const sep: BannerPart = { text: ' · ', tone: 'dim' }
  const join = (groups: BannerPart[][]) => groups.flatMap((g, i) => (i ? [sep, ...g] : g))
  const dim = (text: string): BannerPart[] => [{ text, tone: 'dim' }]
  const folder = folderName(root)
  const l1: BannerPart[] = [{ text: namesFor(name).boardName, tone: 'accent', bold: true }, ...(folder ? [{ text: ` · ${folder}`, tone: 'plain' as const }] : [])]
  const l2 = join([
    ...(root ? [dim(shortHome(root, home))] : []),
    b.branch_note ? [{ text: b.branch_note, tone: 'warning' as const }] : dim(b.target_branch),
    dim(driving ? 'this session drives' : 'driven by another session'),
  ])
  const l3 = join([
    b.test_commands.length ? dim(`tests: ${b.test_commands.join(' && ')}`) : [{ text: 'no test command', tone: 'warning' as const }],
    dim(`${b.max_parallel} at once`),
    dim(`${b.max_minutes} min`),
    dim(`${b.auto_retries} ${b.auto_retries === 1 ? 'retry' : 'retries'}`),
  ])
  const texts = [l1, l2, l3]
  if (b.tasks.length) {
    const counts = statusCounts(b.tasks, BANNER_ORDER).map(c => c.replace(/^(\d+) backlog$/, '$1 in backlog'))
    const t = boardTotal(b, nowMs)
    texts.push(dim([...counts, ...(t.tries ? [fmtTotal(t)] : [])].join(' · ')))
  }
  const w = Math.max(1, Math.floor(width))
  const wide = w >= BANNER_NARROW
  // The three fixed lines sit beside the drawing; the drawing's lower lines (the clef's hook)
  // stand alone, and the counts line goes under the drawing, from the left edge, so it keeps the full width.
  if (wide) texts.splice(3, 0, ...Array.from({ length: Math.max(0, ICON_ART.length - 3) }, () => [] as BannerPart[]))
  return texts.map((parts, i) => {
    const art = wide && ICON_ART[i] ? `${ICON_ART[i]}  ` : ''
    return { art, parts: cutParts(parts, w - art.length) }
  })
}

/** The strong separator under the banner and tabs, as wide as the panel's body (drawn in the accent color). */
export const bannerRule = (width: number) => '━'.repeat(Math.max(1, Math.floor(width)))

/** The light dotted break inside the list, under the Backlog section (drawn in the subtle color). */
export const listRule = (width: number) => '┄'.repeat(Math.max(1, Math.floor(width)))

/** A banner line as plain text (for tests and plain output). */
export const bannerText = (l: BannerLine) => l.art + l.parts.map(p => p.text).join('')

/** One line per task for the model and for /<name> (with a short "from:" line under it, see fromText), then the total time (and cost) of all tries.
 *  With `where` (the project's path), that comes first so you can tell boards apart.
 *  The backlog comes first, then open tasks, then today's others; finished tasks of older days are one line per
 *  day (see boardSections), seen from `nowMs` in time zone `offsetMin`. Without `nowMs`, every task is listed. */
export function boardText(b: Board, nowMs?: number, where?: string, name: string = DEFAULT_NAME, offsetMin: number = localOffset(nowMs)): string {
  const top = where ? [`${boardBrand(name)} · ${where}`] : []
  if (!b.tasks.length) return [...top, 'The board is empty.'].join('\n')
  const s: BoardSections = nowMs === undefined ? boardSections(b.tasks, NaN, offsetMin) : boardSections(b.tasks, nowMs, offsetMin)
  const rows = [...s.backlog, ...s.open, ...s.today]
  const lines = rows.map(t => {
    const extra = t.status === 'waiting' && t.question ? ` — asks: ${t.question}` : t.note ? ` — ${t.note}` : t.status === 'review' ? ` — ${STATUS_WORD.review}` : ''
    const after = t.after.length && (t.status === 'todo' || t.status === 'backlog') ? ` (after ${t.after.join(', ')})` : ''
    const role = roleMark(t) ? ` [${roleMark(t)}]` : ''
    return [`${t.id.padEnd(5)} ${t.status.padEnd(7)} ${t.title}${role}${after}${extra}`, `${' '.repeat(14)}${fromText(t)}`]
  }).flat()
  const head = `${modeText(modeOf(b))} · tests: ${b.test_commands.join(' && ') || 'none set'} · up to ${b.max_parallel} at once · a worker may run ${b.max_minutes} min · ${b.auto_retries} auto retries on failing tests`
  const total = totalLine(b, nowMs)
  const days = s.days.map(g => groupLabel(g))
  return [...top, head, ...lines, ...days, ...(total ? [total] : [])].join('\n')
}

/** A scout file: `.<plugin name>/scouts/<name>.md`, front matter + instructions. */
export type ScoutDef = { name: string; every_minutes: number; model?: string; prompt: string }

/**
 * A file's front matter (the lines between the opening and closing `---`) and the body after it.
 * `lines` is null when the file has no front matter; then the body is the whole text.
 */
function splitFrontMatter(text: string): { lines: string[] | null; body: string } {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text)
  return m ? { lines: m[1]!.split('\n'), body: text.slice(m[0].length) } : { lines: null, body: text }
}

/** A front matter `key: value` line as its lowercased key and trimmed value, or null for other lines. */
function frontMatterLine(line: string): { key: string; value: string } | null {
  const kv = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i.exec(line)
  return kv ? { key: kv[1]!.toLowerCase(), value: kv[2]! } : null
}

export function parseScout(name: string, text: string): ScoutDef | null {
  const fm = splitFrontMatter(text)
  const meta: Record<string, string> = {}
  for (const line of fm.lines ?? []) {
    const kv = frontMatterLine(line)
    if (kv) meta[kv.key] = kv.value.replace(/^["']|["']$/g, '')
  }
  const prompt = fm.body.trim()
  if (!prompt) return null
  const every = Number(meta.every_minutes ?? meta.every ?? 60)
  return { name: meta.name || name, every_minutes: Number.isFinite(every) && every >= 1 ? every : 60, model: meta.model || undefined, prompt }
}

/**
 * A scout file's text from its front matter and body, as the panel's edit mode saves it.
 * `old` is the file as it was (or null for a new scout): every front matter line it has is kept
 * as it was, except every_minutes (an old "every" is replaced by it) and model (dropped when empty).
 */
export function scoutText(old: string | null, set: { every_minutes: number; model?: string }, body: string): string {
  const lines: string[] = []
  let everyDone = false
  let modelDone = false
  const model = (set.model ?? '').trim()
  for (const line of (old ? splitFrontMatter(old).lines : null) ?? []) {
    const key = frontMatterLine(line)?.key
    if (key === 'every_minutes' || key === 'every') {
      if (!everyDone) lines.push(`every_minutes: ${set.every_minutes}`)
      everyDone = true
    } else if (key === 'model') {
      if (!modelDone && model) lines.push(`model: ${model}`)
      modelDone = true
    } else lines.push(line)
  }
  if (!everyDone) lines.push(`every_minutes: ${set.every_minutes}`)
  if (!modelDone && model) lines.push(`model: ${model}`)
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`
}

/** Why a new scout's name can't be used ('' when it can): letters, digits, - and _ only, and not one that exists. */
export function scoutNameError(name: string, existing: string[]): string {
  const s = name.trim()
  if (!s) return 'give the scout a name'
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) return 'use only letters, digits, - and _'
  if (existing.some(x => x.toLowerCase() === s.toLowerCase())) return `a scout named ${s} already exists`
  return ''
}

/** every_minutes as typed: a whole number of 1 or more, or null. */
export function everyMinutesOf(text: string): number | null {
  const s = text.trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n >= 1 ? n : null
}

/** Why a scout's edit can't be saved ('' when it can). */
export function scoutDraftError(d: { every: string; body: string }): string {
  if (everyMinutesOf(d.every) === null) return 'every (minutes) must be a whole number, 1 or more'
  if (!d.body.trim()) return 'write what the scout looks for'
  return ''
}

// ---------------- worker roles ----------------

/**
 * A worker role: a file `roles/<name>.md` in the plugin, or `.<plugin name>/roles/<name>.md` in the
 * project (which overrides a built-in one with the same name). Front matter: description (needed),
 * model and skills (optional); the body is the role's checklist (may be empty, as for "general").
 */
export type RoleDef = { name: string; description: string; model?: string; skills: string[]; prompt: string }

/** The role a task gets when none is set: today's plain worker. */
export const DEFAULT_ROLE = 'general'

/** A role's name: letters, digits, - and _ only. */
const ROLE_NAME = /^[A-Za-z0-9_-]{1,64}$/

/** A front matter list: "[a, b]" or "a, b", quotes dropped. */
function frontMatterList(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean)
}

/**
 * A role file as a RoleDef, or null when it can't be used (no front matter, no description,
 * or a name with other characters than letters, digits, - and _); the caller skips it with a note.
 */
export function parseRole(name: string, text: string): RoleDef | null {
  const r = readRole(name, text)
  return typeof r === 'string' ? null : r
}

/** Why a role file can't be used ("no front matter", "no description", "bad name ..."), or null when it can. */
export function roleSkipReason(name: string, text: string): string | null {
  const r = readRole(name, text)
  return typeof r === 'string' ? r : null
}

/** The note shown (once) when a role file is skipped: "symcc: skipped .symcc/roles/x.md: no description". */
export function skippedRoleNote(file: string, reason: string, name: string = DEFAULT_NAME): string {
  return `${name}: skipped ${file}: ${reason}`
}

/** A role file as a RoleDef, or the reason it can't be used. */
function readRole(name: string, text: string): RoleDef | string {
  const fm = splitFrontMatter(text)
  if (!fm.lines) return 'no front matter (it starts with a --- line, then description: ..., then ---)'
  const meta: Record<string, string> = {}
  for (const line of fm.lines) {
    const kv = frontMatterLine(line)
    if (kv) meta[kv.key] = kv.value.replace(/\s+#.*$/, '')
  }
  const unquote = (s: string | undefined) => (s ?? '').trim().replace(/^["']|["']$/g, '').trim()
  const roleName = unquote(meta.name) || name
  const description = unquote(meta.description)
  if (!ROLE_NAME.test(roleName)) return `bad name "${roleName}" (use letters, digits, - and _ only)`
  if (!description) return 'no description'
  const model = unquote(meta.model)
  return { name: roleName, description: description.slice(0, 200), ...(model ? { model } : {}), skills: frontMatterList(meta.skills ?? ''), prompt: fm.body.trim() }
}

/** The built-in roles with the project's added: a project role replaces a built-in one with the same name. Sorted by name, general first. */
export function mergeRoles(builtIn: RoleDef[], project: RoleDef[]): RoleDef[] {
  const out = new Map<string, RoleDef>()
  for (const r of [...builtIn, ...project]) out.set(r.name.toLowerCase(), r)
  return [...out.values()].sort((a, b) => (a.name === DEFAULT_ROLE ? -1 : b.name === DEFAULT_ROLE ? 1 : a.name.localeCompare(b.name)))
}

/** A task's role name: its role, or general when none is set. */
export const roleOf = (t: Pick<SymccTask, 'role'>): string => t.role?.trim() || DEFAULT_ROLE

/** Role `name` from `roles` (any case); general when the name is missing. */
export function findRole(roles: RoleDef[], name: string | undefined): RoleDef | undefined {
  const n = (name ?? '').trim().toLowerCase() || DEFAULT_ROLE
  return roles.find(r => r.name.toLowerCase() === n)
}

/** The known role name for `name` (spelled as in its file), or throws a clear error listing the roles. */
export function checkRole(roles: RoleDef[], name: string): string {
  const r = findRole(roles, name)
  if (r) return r.name
  if (name.trim().toLowerCase() === DEFAULT_ROLE) return DEFAULT_ROLE
  const have = roles.map(x => x.name)
  if (!have.some(x => x.toLowerCase() === DEFAULT_ROLE)) have.unshift(DEFAULT_ROLE)
  throw new Error(`unknown role "${name}"; the roles are: ${have.join(', ')}`)
}

/** The short role mark for lists: the role name, or '' for general (which shows nothing). */
export function roleMark(t: Pick<SymccTask, 'role'>): string {
  const role = roleOf(t)
  return role.toLowerCase() === DEFAULT_ROLE ? '' : role
}

/** The open task's role line: "Role: tests — writes tests · model sonnet" (just "Role: tests" when the role is not known). */
export function roleLine(t: Pick<SymccTask, 'role'>, roles: RoleDef[]): string {
  const name = roleOf(t)
  const r = findRole(roles, name)
  return `Role: ${r?.name ?? name}${r ? ` — ${r.description}` : ''}${r?.model ? ` · model ${r.model}` : ''}`
}

/** The roles to pick from in the board panel: the known ones, general first (general alone when none are loaded). */
export function roleChoices(roles: RoleDef[]): string[] {
  const names = roles.map(r => r.name)
  return names.some(n => n.toLowerCase() === DEFAULT_ROLE) ? names : [DEFAULT_ROLE, ...names]
}

/** "try 2", or "try 2 (role tests)" when the task has a role other than general. */
export function tryLabel(t: Pick<SymccTask, 'role'> & { attempts: number | string }): string {
  const role = roleOf(t)
  return `try ${t.attempts}${role === DEFAULT_ROLE ? '' : ` (role ${role})`}`
}

/**
 * The worker prompt's role section: "Your role: <name>", the role's checklist and the skills to use.
 * Empty for a role with no checklist and no skills (general: today's worker).
 */
export function roleSection(r: RoleDef | undefined): string {
  if (!r || (!r.prompt && !r.skills.length)) return ''
  const skills = r.skills.length ? `Use these skills if they are available: ${r.skills.join(', ')}.` : ''
  return `\nYour role: ${r.name}\n${[r.prompt, skills].filter(Boolean).join('\n')}\n`
}

/** The lead's paragraph about roles: each one with its description, and how to pick. */
export function rolesLeadText(roles: RoleDef[], name: string = DEFAULT_NAME): string {
  const list = roles.length ? roles.map(r => `${r.name} (${r.description})`).join('; ') : `${DEFAULT_ROLE} (a plain worker)`
  return `- Worker roles: ${list}. Pick the role that fits each task (role in ${name} add / change); ${DEFAULT_ROLE} when unsure; the owner can override. Put the task's own focus in its details. A project can add or override roles in ${namesFor(name).dir}/roles/<name>.md.
- One task, one role. When a request needs several kinds of work (e.g. backend, frontend, tests, docs) and each part is big enough to stand alone, or a role really helps (security, a careful test suite, a refactor with no behavior change), split it into one task per role and link them with after (the frontend waits for the backend it uses; tests and docs wait for the code they cover; parts with different files run in parallel). When the request is small, keep it as one task with the ${DEFAULT_ROLE} role: each extra task costs a worker run, a test run and a merge.`
}

// ---------------- scouts in the board panel ----------------

/** How much of a scout's last answer is kept (SymccScout.last_report). */
export const SCOUT_REPORT_CHARS = 2000

/** What is kept about one scout between restarts (in <dir>/scouts.json). */
export type ScoutMemory = { last_run: string | null; last_report?: string }

/**
 * Reads scouts.json. A missing, empty or broken file means "no scout has run" ({}), never an error;
 * entries with a bad shape are skipped one by one, and reports are cut to SCOUT_REPORT_CHARS.
 */
export function parseScoutMemory(text: string | null | undefined): Record<string, ScoutMemory> {
  const out: Record<string, ScoutMemory> = {}
  if (!text || !text.trim()) return out
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return out
  }
  const scouts = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { scouts?: unknown }).scouts : undefined
  if (!scouts || typeof scouts !== 'object' || Array.isArray(scouts)) return out
  for (const [name, v] of Object.entries(scouts as Record<string, unknown>)) {
    if (!name || !v || typeof v !== 'object' || Array.isArray(v)) continue
    const e = v as { last_run?: unknown; last_report?: unknown }
    const last_run = typeof e.last_run === 'string' && !Number.isNaN(Date.parse(e.last_run)) ? e.last_run : null
    const m: ScoutMemory = { last_run }
    if (typeof e.last_report === 'string') m.last_report = e.last_report.slice(0, SCOUT_REPORT_CHARS)
    if (m.last_run === null && m.last_report === undefined) continue
    out[name] = m
  }
  return out
}

/** The text of scouts.json for these scouts; only the names in `keep` (if given) are written. */
export function scoutMemoryText(scouts: Iterable<{ name: string; last_run: string | null; last_report?: string }>, keep?: string[]): string {
  const out: Record<string, ScoutMemory> = {}
  for (const s of scouts) {
    if (keep && !keep.includes(s.name)) continue
    if (s.last_run === null && s.last_report === undefined) continue
    const m: ScoutMemory = { last_run: s.last_run }
    if (s.last_report !== undefined) m.last_report = s.last_report.slice(0, SCOUT_REPORT_CHARS)
    out[s.name] = m
  }
  return JSON.stringify({ scouts: out }, null, 2) + '\n'
}

/** How often a scout runs: "every 30 min", "every hour", "every 2 hours", "every 90 min". */
export function everyText(minutes: number): string {
  const m = Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 60))
  if (m === 60) return 'every hour'
  if (m % 60 === 0) return `every ${m / 60} hours`
  return `every ${m} min`
}

/** What a scout is doing: "running", "next in 12m", "due now", or '' when no run is planned. */
export function scoutStateText(s: Pick<SymccScout, 'running' | 'next_run'>, nowMs: number): string {
  if (s.running) return 'running'
  const at = Date.parse(s.next_run ?? '')
  if (!Number.isFinite(at)) return ''
  return at <= nowMs ? 'due now' : `next in ${fmtDuration(at - nowMs)}`
}

/** When a scout last ran: "ran 8m ago", or "never ran". */
export function scoutRanText(s: Pick<SymccScout, 'last_run'>, nowMs: number): string {
  const at = Date.parse(s.last_run ?? '')
  return Number.isFinite(at) ? `ran ${fmtDuration(Math.max(0, nowMs - at))} ago` : 'never ran'
}

/** The pieces of a scout's row in the panel; `model` and `state` are '' when there is none. */
export function scoutRow(s: SymccScout, nowMs: number): { name: string; every: string; model: string; state: string; ran: string } {
  return { name: s.name, every: everyText(s.every_minutes), model: s.model ?? '', state: scoutStateText(s, nowMs), ran: scoutRanText(s, nowMs) }
}

/** The order of scouts in the panel: running ones first, then the soonest next run (none planned last), then by name. */
export function scoutOrder(a: Pick<SymccScout, 'name' | 'running' | 'next_run'>, b: Pick<SymccScout, 'name' | 'running' | 'next_run'>): number {
  if (a.running !== b.running) return a.running ? -1 : 1
  const at = (s: { next_run?: string }) => {
    const t = Date.parse(s.next_run ?? '')
    return Number.isFinite(t) ? t : Infinity
  }
  const d = at(a) - at(b)
  if (d) return d
  return a.name.localeCompare(b.name)
}

/** Sorted for the panel; see scoutOrder. */
export const sortScouts = <S extends SymccScout>(scouts: S[]): S[] => [...scouts].sort(scoutOrder)

/** A scout's file in the project: ".<plugin name>/scouts/<scout>.md". */
export const scoutFile = (scout: string, name: string = DEFAULT_NAME) => `${namesFor(name).scouts}/${scout}.md`

/** A scout's last report for the panel: "nothing found" when empty (or NOTHING), else its text cut to `n` characters. */
export function scoutReport(text: string | undefined, n = 800): string {
  const s = String(text ?? '').trim()
  if (isNothing(s)) return 'nothing found'
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

/** True when a scout's answer means "nothing to report": empty, or exactly NOTHING. */
export const isNothing = (answer: string | undefined): boolean => {
  const s = String(answer ?? '').trim()
  return !s || /^NOTHING\.?$/i.test(s)
}

/** How many recently finished or dropped tasks a scout is shown. */
export const SCOUT_CLOSED_SHOWN = 20

/**
 * The most recently finished and dropped tasks, newest first, as "T-5 title (done)" lines,
 * so a scout doesn't report what was just fixed or turned down. Tasks with no readable time go last.
 */
export function recentClosed(tasks: Pick<SymccTask, 'id' | 'title' | 'status' | 'updated_at' | 'created_at'>[], n = SCOUT_CLOSED_SHOWN): string[] {
  const at = (t: Pick<SymccTask, 'updated_at' | 'created_at'>) => {
    const v = Date.parse(t.updated_at ?? t.created_at ?? '')
    return Number.isFinite(v) ? v : -Infinity
  }
  return tasks
    .filter(t => t.status === 'done' || t.status === 'dropped')
    .sort((a, b) => at(b) - at(a))
    .slice(0, Math.max(0, Math.floor(Number.isFinite(n) ? n : SCOUT_CLOSED_SHOWN)))
    .map(t => `${t.id} ${t.title} (${t.status})`)
}

/**
 * The prompt a scout run gets: its file's instructions as its job, the project folder,
 * the open tasks on the board (`open`: "T-3 title" lines), the recently closed ones (`closed`),
 * its own last report and last run time (both optional), and the rules for a good finding.
 */
export function scoutPrompt(o: { scout: string; root: string; instructions: string; open: string[]; name?: string; closed?: string[]; lastReport?: string | null; lastRun?: string | null }): string {
  const name = o.name ?? DEFAULT_NAME
  const closed = Array.isArray(o.closed) ? o.closed : []
  const report = typeof o.lastReport === 'string' && !isNothing(o.lastReport) ? o.lastReport.trim() : ''
  const runAt = typeof o.lastRun === 'string' && Number.isFinite(Date.parse(o.lastRun)) ? o.lastRun : ''
  const since = runAt
    ? `You last ran at ${runAt}. Start with what changed since then, since new code is where new bugs are:\n  git log --since=${runAt} --stat`
    : 'This is your first run (or the time of your last run is not known). Look at the whole project, starting with the most recent changes (git log --stat -n 20).'
  return `You are the ${name} scout "${o.scout}". The project is in ${o.root}. Your job, from your scout file:

${o.instructions.trim()}

Tasks already open on the board (don't suggest these again):
${o.open.length ? o.open.join('\n') : '(none)'}

Tasks recently finished or dropped (don't report these again: they were just fixed or turned down):
${closed.length ? closed.join('\n') : '(none)'}

Your last report (don't repeat it unless it is still true and still not on the board):
${report || '(none)'}

Since when to look:
${since}

What makes a good finding:
- Check before you report. Read the code around it. Reproduce it if you can: run the tests, run a command that only looks, or try the input. Check that it isn't already handled somewhere else or already on the board.
- For each finding give: where (file:line); the proof (the command and its output, or the exact lines); what goes wrong for a user, and when; how sure you are (sure or likely); and a suggested task (a title and the files to change).
- Report at most 3 findings, the most important first. Real bugs, broken promises (the docs say one thing, the code does another), missing error handling and missing tests for risky code matter more than style, naming or typos.
- Leave out anything you can't show proof for.
- If nothing passes this bar, answer exactly: NOTHING. That is a good result, not a failure.

Rules:
- Don't change, create or delete files in the project: no edits, no installs, no git commands that change anything (commit, checkout, reset, stash, ...). Changes are made through board tasks, not by you.
- You may read files, run shell commands that only look, and search or fetch pages on the web.
- End with a short plain report of your findings. If there is nothing worth reporting, answer exactly: NOTHING`
}

/** What the lead is told when a scout finishes: its whole report cut to `n` characters, or null for NOTHING. */
export function scoutLeadMessage(scout: string, answer: string | undefined, n = SCOUT_REPORT_CHARS): string | null {
  if (isNothing(answer)) return null
  const report = String(answer).trim().slice(0, n).trimEnd()
  return `Scout "${scout}" reports:\n${report}\nAdd tasks for anything worth doing, tell the owner what matters, or ignore it.`
}

/** The how-to shown when there are no scouts. */
export function scoutHowTo(name: string = DEFAULT_NAME): string[] {
  return [
    'No scouts yet. A scout runs on a timer, does what its file asks and reports to the lead.',
    `Add one as ${namesFor(name).scouts}/<name>.md:`,
    '  ---',
    '  every_minutes: 30',
    '  model: sonnet        (optional)',
    '  ---',
    '  What to do, in plain words.',
    `examples/scouts/ in the plugin has examples to copy. Then run /${name}-scouts.`,
    'Or press "New scout" (n) to write one right here.',
  ]
}

// ---------------- who drives the board ----------------
// Several sessions may have the same project open. Only one of them, the driver, starts
// workers, merges, runs scouts and the regular check. It writes .<name>/lead.json and
// refreshes the heartbeat in it; the others only read and change the board.

export const LEAD_FILE = namesFor().leadFile
/** how often the driver refreshes its heartbeat (and the others look at it) */
export const LEAD_BEAT_MS = 30_000
/** a heartbeat older than this means the driver is gone, and another session may take over */
export const LEAD_STALE_MS = 3 * 60_000

export type Lead = { session: string; heartbeat: number }

export const leadText = (session: string, heartbeat: number) => JSON.stringify({ session, heartbeat }) + '\n'

export function parseLead(text: string | null): Lead | null {
  return parseStamp(text, 'heartbeat', false)
}

/** Whether a heartbeat is no more than `staleMs` old (and not dated more than that in the future, a broken clock). */
export function isFresh(heartbeat: number, nowMs: number, staleMs = LEAD_STALE_MS): boolean {
  return nowMs - heartbeat <= staleMs && heartbeat - nowMs <= staleMs
}

/**
 * Who should drive, as seen by session `me` reading lead.json (`text`) at `nowMs`:
 * - 'become': nobody drives (no file, or one we can't read); `me` starts driving.
 * - 'keep': `me` already drives; refresh the heartbeat.
 * - 'follow': another session drives and its heartbeat is fresh.
 * - 'takeover': another session's heartbeat is stale (or dated far in the future, a
 *   broken clock); `me` takes over and first stops what the old driver left running.
 */
export type LeadMove = 'become' | 'keep' | 'follow' | 'takeover'

export function whoDrives(text: string | null, me: string, nowMs: number, staleMs = LEAD_STALE_MS): LeadMove {
  const l = parseLead(text)
  if (!l) return 'become'
  if (l.session === me) return 'keep'
  return isFresh(l.heartbeat, nowMs, staleMs) ? 'follow' : 'takeover'
}

// ---------------- which session owns a running task ----------------

/** The session that drives the board now, by lead.json `text` at `nowMs`; null if nobody does (or its heartbeat is stale). */
export function liveDriver(text: string | null, nowMs: number, staleMs = LEAD_STALE_MS): string | null {
  const l = parseLead(text)
  if (!l) return null
  return isFresh(l.heartbeat, nowMs, staleMs) ? l.session : null
}

/**
 * Whether session `me` may take over a task's worker: the task names no session (an old
 * board), names `me`, or names a session that no longer drives the board (`live`).
 * A task owned by the live driver, another session, is never touched.
 */
export function ownedHere(t: BoardTask, me: string, live: string | null): boolean {
  return !t.session || t.session === me || t.session !== live
}

/**
 * At session start the driver sends "doing" tasks whose worker is gone back to "todo":
 * those of this session, of a dead session, or with no session recorded. `leadBefore`
 * is lead.json as it was before this session wrote its own heartbeat. Tasks in `keep`
 * (an old worker of theirs is still alive) stay "doing" until that worker has ended.
 */
export function resetDoing(b: Board, me: string, leadBefore: string | null, nowMs: number, note: string, now: string, keep: string[] = []): Board {
  const live = liveDriver(leadBefore, nowMs)
  return {
    ...b,
    tasks: b.tasks.map(t => {
      if (t.status !== 'doing' || !ownedHere(t, me, live) || keep.includes(t.id)) return t
      return backToTodo(t, note, now)
    }),
  }
}

/**
 * After /clear the same process goes on under a new session id: its "doing" tasks move
 * from `oldId` to `newId`, so they are not taken for a dead session's tasks.
 */
export function relabelSession(b: Board, oldId: string, newId: string): Board {
  if (!oldId || !newId || oldId === newId) return b
  return {
    ...b,
    tasks: b.tasks.map(t => (t.status === 'doing' && t.session === oldId ? { ...t, session: newId } : t)),
  }
}

/** Task `t` back to "todo" with `note`, no longer tied to a session. */
export function backToTodo(t: BoardTask, note: string, now: string): BoardTask {
  const { session: _gone, ...rest } = t
  return { ...rest, status: 'todo' as const, note, updated_at: now }
}

// ---------------- never two workers on one task ----------------

// ---------------- agent names ----------------
// Workers and scouts are named after the plugin, so the agents list shows they are its own:
// "symcc-T-33", "symcc-scout-bugs". Agent names may only have letters, digits, "_" and "-"
// (and start with a letter or digit, at most 64 long), so anything else becomes "-". The name already has the task id or scout name, so the
// description doesn't repeat it. Lookups go by agentId; liveWorkersFor also reads these names.

/** How long an agent's description may be in the agents list. */
export const AGENT_DESCRIPTION_CHARS = 60

/** Makes a string a valid agent name: only letters, digits, "_" and "-", starting with a letter or digit, at most 64 long. */
export function agentSafeName(raw: string): string {
  const s = String(raw ?? '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[-_]+/, '').slice(0, 64).replace(/-+$/, '')
  return s || 'agent'
}

/** A worker's agent name: the plugin's name and the task id, e.g. "symcc-T-33". */
export function workerName(name: string, id: string): string {
  return agentSafeName(`${name}-${id}`)
}

/** A worker's agent description: the task title only (the name has the id), cut to fit. */
export function workerDescription(title: string): string {
  return String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, AGENT_DESCRIPTION_CHARS)
}

/** A scout's agent name: the plugin's name, "scout" and the scout's name, e.g. "symcc-scout-bugs". */
export function scoutAgentName(name: string, scout: string): string {
  return agentSafeName(`${name}-scout-${scout}`)
}

/**
 * A scout's agent description: what it does, the first line of its file's instructions
 * (without markdown marks), cut to fit; the scout's name when there are none.
 */
export function scoutDescription(scout: string, instructions = ''): string {
  const line = String(instructions ?? '').split('\n').map(l => l.replace(/^[\s#>*-]+/, '').trim()).find(Boolean) ?? ''
  return (line || scout).slice(0, AGENT_DESCRIPTION_CHARS)
}

/** An agent as $.agent.list() reports it. */
export type AgentInfo = { id: string; type?: string; status: string; description?: string; name?: string }

/** Agent statuses that mean it has ended; anything else counts as still alive. */
export const ENDED_STATUSES = ['completed', 'failed', 'killed']

/**
 * The plugin's live workers for task `id`: the one recorded on the task (`agent`), or any
 * whose name is workerName (e.g. "symcc-T-3") or the bare task id, maybe with a suffix the
 * host added ("symcc-T-3-2"), or whose description starts with the task id (older workers).
 */
export function liveWorkersFor(t: Pick<BoardTask, 'id' | 'agent'>, agents: AgentInfo[], name: string = DEFAULT_NAME): AgentInfo[] {
  const worker = namesFor(name).worker
  return agents.filter(a => {
    if (ENDED_STATUSES.includes(a.status)) return false
    if (t.agent && a.id === t.agent) return true
    if (a.type !== worker) return false
    const n = String(a.name ?? '')
    const full = workerName(name, t.id)
    if (n && (n === t.id || n.startsWith(`${t.id}-`) || n === full || n.startsWith(`${full}-`))) return true
    return normId(String(a.description ?? '').split(/\s/)[0] ?? '') === t.id
  })
}

/**
 * Whether a new worker may start on task `t`: it is still "todo", and no live agent
 * (in `agents`, $.agent.list() plus the workers this session knows) works on it.
 */
export function mayStart(t: BoardTask | undefined, agents: AgentInfo[], name: string = DEFAULT_NAME): boolean {
  return !!t && t.status === 'todo' && liveWorkersFor(t, agents, name).length === 0
}

// ---------------- a worker that can't start yet ----------------
// Right after a reload the worker agent type may not be registered yet: spawning then fails
// with "Agent type '<name>:worker' not found". That is not the task's fault: it goes back to
// "todo" with no try counted, and is only marked failed after MAX_NOT_READY misses in a row.

/** How many "not ready" misses in a row a task gets before it is marked failed. */
export const MAX_NOT_READY = 3

/** Whether a spawn error only means the plugin isn't ready yet (its worker type isn't there). */
export function isNotReady(message: string, name: string = DEFAULT_NAME): boolean {
  const m = String(message ?? '')
  const worker = namesFor(name).worker.toLowerCase()
  const low = m.toLowerCase()
  if (/agent type .* not found/.test(low) && low.includes(worker)) return true
  return /\bnot (yet )?ready\b|not registered|still starting/.test(low)
}

/** After one more "not ready" miss (misses = the count so far): retry later, or fail now. */
export function onNotReady(misses: number, max = MAX_NOT_READY): 'retry' | 'fail' {
  return misses + 1 >= max ? 'fail' : 'retry'
}

/** A piece of text on the task page with its theme color name (see C() in register.tsx). */
export type Seg = { text: string; color: string; bold?: boolean; italic?: boolean }
/** One labelled row on the task page ("Role:", "From:", …); a row with an empty label continues the one above. */
export type DetailRow = { label: string; segs: Seg[] }

/** The status badge colors on the task page: doing blue, review and waiting yellow, done green, failed red, the rest dim. */
export const STATUS_BADGE: Record<SymccStatus, string> = { backlog: 'subtle', todo: 'subtle', doing: 'ide', review: 'warning', waiting: 'warning', paused: 'suggestion', failed: 'error', done: 'success', dropped: 'subtle' }
export const STATUS_MARK: Record<SymccStatus, string> = { backlog: '◇', review: '◆', waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }

/** Who a task came from, with its own color: the owner, scout NAME, T-x (split), the lead; "unknown" for old tasks. */
export function originSegs(t: { origin?: unknown }): Seg[] {
  const o = originOf(t)
  if (!o) return [{ text: 'unknown', color: 'subtle' }, { text: ' (made before origins were kept)', color: 'subtle' }]
  const how = o.how ?? (o.by === 'worker' ? 'worker report' : '')
  const taskPart: Seg[] = o.task ? [{ text: o.task, color: 'claude', bold: true }, ...(how ? [{ text: ` (${how})`, color: 'subtle' }] : [])] : []
  const then = (who: Seg[]) => (taskPart.length ? [...who, { text: ', ', color: 'subtle' }, ...taskPart] : who)
  if (o.by === 'owner') return then([{ text: 'owner', color: 'claude', bold: true }])
  if (o.by === 'scout') return then([{ text: `scout ${o.scout || '?'}`, color: 'suggestion', bold: true }])
  if (o.by === 'lead' && o.task && !o.how) return [{ text: 'lead', color: 'success', bold: true }, { text: ', about ', color: 'subtle' }, ...taskPart]
  if (taskPart.length) return taskPart
  return [{ text: 'lead', color: 'success', bold: true }]
}

/**
 * The labelled rows of the task page, in order: Status, Note, Role, From, Why, Request, Seen, Files, After, Branch, Commits, Tries.
 * `when` turns an ISO time into a short date; `all` finds the tasks this one waits for.
 */
export function detailRows(t: SymccTask, o: { roles: RoleDef[]; all: SymccTask[]; when: (iso: string) => string; nowMs: number }): DetailRow[] {
  const R: DetailRow[] = []
  R.push({ label: 'Status', segs: [{ text: `${STATUS_MARK[t.status]} ${STATUS_WORD[t.status]}`, color: STATUS_BADGE[t.status], bold: true }, { text: ` · added ${o.when(t.created_at)} · changed ${o.when(t.updated_at)}`, color: 'subtle' }] })
  if (t.note) R.push({ label: 'Note', segs: [{ text: t.note, color: 'subtle', italic: true }] })
  const name = roleOf(t)
  const r = findRole(o.roles, name)
  const more = [r?.description, r?.model ? `model ${r.model}` : ''].filter(Boolean).join(' · ')
  R.push({ label: 'Role', segs: [{ text: r?.name ?? name, color: 'ide', bold: true }, ...(more ? [{ text: ` — ${more}`, color: 'subtle' }] : [])] })
  R.push({ label: 'From', segs: originSegs(t) })
  const og = originOf(t)
  if (og?.why) R.push({ label: 'Why', segs: [{ text: squash(og.why), color: 'text' }] })
  if (og?.by === 'owner' && og.request?.trim()) R.push({ label: 'Request', segs: [{ text: `“${squash(og.request)}”`, color: 'text', italic: true }] })
  if (og?.evidence) R.push({ label: 'Seen', segs: [{ text: squash(og.evidence), color: 'subtle' }] })
  R.push({ label: 'Files', segs: t.files.length ? t.files.flatMap((f, i) => [...(i ? [{ text: ', ', color: 'subtle' }] : []), { text: f, color: 'autoAccept' }]) : [{ text: 'anywhere in the project', color: 'subtle' }] })
  t.after.forEach((id, i) => {
    const dep = o.all.find(x => x.id === id)
    R.push({
      label: i ? '' : 'After',
      segs: [{ text: id, color: 'claude', bold: true }, { text: ' ', color: 'text' }, dep ? { text: `${STATUS_MARK[dep.status]} ${STATUS_WORD[dep.status]}`, color: STATUS_BADGE[dep.status] } : { text: 'missing', color: 'error' }, ...(dep ? [{ text: ` · ${dep.title}`, color: 'subtle' }] : [])],
    })
  })
  if (t.branch) R.push({ label: 'Branch', segs: [{ text: t.branch, color: 'ide' }] })
  const commits = taskCommits(t)
  if (commits.length) {
    R.push({
      label: 'Commits',
      segs: commits.flatMap((c, i) => [
        ...(i ? [{ text: ', ', color: 'subtle' }] : []),
        { text: shortSha(c.sha), color: c.merged ? 'success' : 'ide', bold: c.merged },
        ...(c.merged ? [{ text: ' (merged)', color: 'success' }] : c.try ? [{ text: ` (try ${c.try})`, color: 'subtle' }] : []),
      ]),
    })
  }
  const tries: Seg[] = [{ text: `${t.attempts} ${t.attempts === 1 ? 'try' : 'tries'}`, color: t.attempts > 2 ? 'warning' : 'text', bold: t.attempts > 2 }]
  if (t.runs?.length) tries.push({ text: ` · ${fmtTotal(sumRuns(t.runs, o.nowMs))}`, color: 'subtle' })
  R.push({ label: 'Tries', segs: tries })
  return R
}

/** The width of the label column on the task page: the longest label, its colon and a space. */
export const DETAIL_LABEL_WIDTH = 'Request: '.length

/**
 * Splits colored text into lines of at most `width` characters, breaking between words
 * (a word longer than a line is cut). Spaces at a line break are dropped.
 */
export function wrapSegs(segs: Seg[], width: number): Seg[][] {
  const w = Math.max(1, width)
  const lines: Seg[][] = []
  let line: Seg[] = []
  let len = 0
  const add = (s: Seg, text: string) => {
    const last = line[line.length - 1]
    if (last && last.color === s.color && !!last.bold === !!s.bold && !!last.italic === !!s.italic) last.text += text
    else line.push({ ...s, text })
    len += text.length
  }
  const breakLine = () => {
    const last = line[line.length - 1]
    if (last) last.text = last.text.trimEnd()
    lines.push(line.filter(s => s.text))
    line = []
    len = 0
  }
  for (const s of segs) {
    for (const tok of s.text.replace(/\s+/g, ' ').match(/ +|[^ ]+/g) ?? []) {
      if (tok.startsWith(' ')) {
        if (len && len + 1 <= w) add(s, ' ')
        continue
      }
      let word = tok
      if (len && len + word.length > w) breakLine()
      while (word.length > w) {
        add(s, word.slice(0, w))
        word = word.slice(w)
        breakLine()
      }
      if (word) add(s, word)
    }
  }
  if (line.length || !lines.length) breakLine()
  return lines
}

/** A labelled row as lines of colored text within `width`: the label (padded) on the first line, spaces under it after. */
export function detailRowLines(row: DetailRow, width: number): Seg[][] {
  const pad = DETAIL_LABEL_WIDTH
  return wrapSegs(row.segs, Math.max(12, width - pad)).map((l, i) => [{ text: (i === 0 && row.label ? `${row.label}:` : '').padEnd(pad), color: 'text', bold: true }, ...l])
}

/** How many lines of a task's "What to do" text the task page shows before it is expanded. */
export const DETAILS_SHOWN = 3
/** The key that shows or hides the rest of the "What to do" text on the task page ("d" is taken there by Show changes). */
export const DETAILS_KEY = 'e'

/**
 * The "What to do" text cut to its first DETAILS_SHOWN lines unless `open`, with the hint line
 * under it; text of DETAILS_SHOWN lines or fewer is shown whole with no hint ('').
 */
export function foldDetails(text: string, open: boolean): { text: string; hint: string } {
  const all = text.trimEnd().split('\n')
  const more = all.length - DETAILS_SHOWN
  if (more <= 0) return { text: all.join('\n'), hint: '' }
  if (open) return { text: all.join('\n'), hint: `press ${DETAILS_KEY} to hide` }
  return { text: all.slice(0, DETAILS_SHOWN).join('\n'), hint: `… ${more} more ${more === 1 ? 'line' : 'lines'} · press ${DETAILS_KEY} to show all` }
}
