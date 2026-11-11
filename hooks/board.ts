// The task board: plain data, kept in <project>/.<name>/board.json (see name.ts). Every function
// here is pure (takes a board, returns a new one) so it can be tested without Claude.
import type { SymccRun, SymccScout, SymccStatus, SymccTask } from '../types'
import { DEFAULT_NAME, ICON, ICON_ART, dataDir, namesFor } from './name'

export type Board = {
  version: 1
  next_id: number
  paused: boolean
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

export function parseLock(text: string | null): Lock | null {
  try {
    const l = JSON.parse(text ?? '') as Partial<Lock>
    return typeof l.session === 'string' && typeof l.at === 'number' && Number.isFinite(l.at) ? { session: l.session, at: l.at } : null
  } catch {
    return null
  }
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
export const OPEN: SymccStatus[] = ['todo', 'doing', 'paused', 'waiting', 'failed']

/** A new board; `target_branch` is where finished work is merged (see startBranch for a new project). */
export function emptyBoard(target_branch = 'main'): Board {
  return { version: 1, next_id: 1, paused: false, test_commands: [], target_branch, max_parallel: 3, max_minutes: 45, auto_retries: 2, open_on_start: true, voice: true, tasks: [] }
}

export function parseBoard(text: string | null): Board {
  if (!text) return emptyBoard()
  try {
    const b = JSON.parse(text) as Partial<Board>
    const tasks = (Array.isArray(b.tasks) ? b.tasks : []).map(t => {
      const { session, ...rest } = t
      return typeof session === 'string' && session && t.status === 'doing' ? { ...rest, session } : rest
    })
    return { ...emptyBoard(), ...b, tasks }
  } catch {
    return emptyBoard()
  }
}

export const normId = (id: string) => {
  const m = /^t-?0*(\d+)$/i.exec(String(id ?? '').trim())
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

export function addTask(b: Board, f: { title: string; details?: string; files?: unknown; after?: unknown; order?: number }, now: string, dir: string = DATA_DIR): [Board, SymccTask] {
  const title = clean(f.title, 200)
  if (!title) throw new Error('a task needs a title')
  const after = (Array.isArray(f.after) ? f.after : []).map(x => normId(String(x))).filter(x => find(b, x))
  const t: SymccTask = {
    id: `T-${b.next_id}`,
    title,
    details: clean(f.details ?? title, 8000),
    files: cleanFiles(f.files, dir),
    status: 'todo',
    note: '',
    question: null,
    order: typeof f.order === 'number' ? f.order : Math.max(0, ...b.tasks.map(x => x.order)) + 1,
    after,
    attempts: 0,
    history: [],
    branch: null,
    created_at: now,
    updated_at: now,
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
  if (patch.title !== undefined) next.title = clean(patch.title, 200)
  if (patch.details !== undefined) next.details = clean(patch.details, 8000)
  if (patch.files !== undefined) next.files = cleanFiles(patch.files, dir)
  if (patch.after !== undefined) next.after = patch.after.map(normId).filter(x => x !== t.id && find(b, x))
  if (next.status !== 'waiting') next.question = null
  return { ...b, tasks: b.tasks.map(x => (x.id === t.id ? next : x)) }
}

/** Tasks a worker could start now: to do, and everything they wait for is done. */
export function ready(b: Board): SymccTask[] {
  const num = (id: string) => Number(id.replace(/\D/g, '')) || 0
  return b.tasks
    .filter(t => t.status === 'todo' && t.after.every(a => find(b, a)?.status === 'done'))
    .sort((x, y) => x.order - y.order || num(x.id) - num(y.id))
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

// ---------------- when the tests fail ----------------

/** How many automatic retries after failing tests a new board allows. */
export const DEFAULT_AUTO_RETRIES = 2
/** How much of the failing test output the next worker is shown (the end of it). */
export const TEST_OUTPUT_CHARS = 3000

/**
 * A task's tests failed. 'retry': send it back to "todo" so a new worker fixes it, with the
 * test output; 'fail': it already had `max` automatic retries, so the lead decides.
 */
export function onTestFail(t: Pick<SymccTask, 'test_tries'>, max = DEFAULT_AUTO_RETRIES): 'retry' | 'fail' {
  return (t.test_tries ?? 0) < max ? 'retry' : 'fail'
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

// ---------------- when the branch conflicts with main ----------------

/** How many new tries a task gets to merge main into its branch after a conflict. */
export const MAX_CONFLICT_TRIES = 2

/**
 * A task's branch conflicted with the latest main. 'retry': send it back to "todo" so a new
 * worker merges main and resolves the conflict; 'fail': it was already tried `max` times.
 */
export function onConflict(t: Pick<SymccTask, 'conflict_tries'>, max = MAX_CONFLICT_TRIES): 'retry' | 'fail' {
  return (t.conflict_tries ?? 0) < max ? 'retry' : 'fail'
}

/** For showing the board: newest task first (by when it was made, then by its number). */
export function newestFirst(x: SymccTask, y: SymccTask): number {
  const num = (id: string) => Number(id.replace(/\D/g, '')) || 0
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
export type BoardSections<T extends SymccTask = SymccTask> = { open: T[]; today: T[]; days: DayGroup<T>[] }

/**
 * Sorts tasks for showing the board at `nowMs` in time zone `offsetMin`: `open` (still need
 * something, whatever their day), `today` (today's finished tasks, and any whose day can't be
 * read or lies ahead), and `days` (older finished tasks, one group per day, newest day first).
 * Inside each part, the newest task comes first.
 */
export function boardSections<T extends SymccTask>(tasks: T[], nowMs: number, offsetMin: number): BoardSections<T> {
  const today = dayOf(nowMs, offsetMin)
  const all = [...tasks].sort(newestFirst)
  const open = all.filter(t => OPEN.includes(t.status))
  const closed = all.filter(t => !OPEN.includes(t.status))
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
  return { open, today: closed.filter(t => !isOld(t)), days }
}

/** A day group's row: "▸ Yesterday · 6 done", "▾ Mon 9 Nov · 4 done · 1 dropped" when opened. */
export function groupLabel(g: Pick<DayGroup, 'label' | 'done' | 'dropped'>, opened = false): string {
  const counts = [g.done && `${g.done} done`, g.dropped && `${g.dropped} dropped`].filter(Boolean)
  return [`${opened ? '▾' : '▸'} ${g.label}`, ...counts].join(' · ')
}

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

/** The board's name for the default plugin name ("<name> board"), and the small mark shown before it. All titles are built from these. */
export const BOARD_NAME = namesFor().boardName
export const BOARD_MARK = ICON
/** "<icon> <name> board": the bold, colored part of a title. */
export const boardBrand = (name: string = DEFAULT_NAME) => `${BOARD_MARK} ${namesFor(name).boardName}`
/** " · <folder>": the dimmed project part of a title, or '' when the folder is unknown. */
export const boardWhere = (root: string) => (folderName(root) ? ` · ${folderName(root)}` : '')
/** The board's title: "<icon> <name> board · <folder>", or just "<icon> <name> board" when the folder is unknown. */
export const boardTitle = (root: string, name: string = DEFAULT_NAME) => `${boardBrand(name)}${boardWhere(root)}`
/** The status line label, without the mark (Claude Code adds its own): "<name> board · <folder>". */
export const boardLabel = (root: string, name: string = DEFAULT_NAME) => `${namesFor(name).boardName}${boardWhere(root)}`

// ---------------- the banner at the top of the board panel ----------------

/** The small drawing beside the banner: the plugin's icon drawing (a treble clef, ICON_ART in name.ts). */
export const BANNER_ART = ICON_ART
/** Below this many columns the drawing is dropped and only the text lines are shown. */
export const BANNER_NARROW = 50
/** How a piece of banner text is drawn: accent (the 'ide' theme color), plain, dim or warning. */
export type BannerTone = 'accent' | 'plain' | 'dim' | 'warning'
export type BannerPart = { text: string; tone: BannerTone; bold?: boolean }
/** One banner line: the drawing part on the left ('' or spaces when none) and the text beside it. */
export type BannerLine = { art: string; parts: BannerPart[] }
/** What the banner needs from the board. */
/** `branch_note`: a warning about the branch (see branchWarning, missingBranchText), shown in place of the branch name. */
export type BannerBoard = Pick<Board, 'paused' | 'test_commands' | 'target_branch' | 'max_parallel' | 'max_minutes' | 'auto_retries'> & { tasks: Pick<SymccTask, 'status' | 'runs'>[]; branch_note?: string }

const BANNER_COUNTS: [SymccStatus, string][] = [['doing', 'doing'], ['waiting', 'waiting for you'], ['failed', 'failed'], ['paused', 'paused'], ['todo', 'to do'], ['done', 'done']]

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
    ...(b.paused ? [[{ text: 'PAUSED', tone: 'warning' as const }]] : []),
  ])
  const l3 = join([
    b.test_commands.length ? dim(`tests: ${b.test_commands.join(' && ')}`) : [{ text: 'no test command', tone: 'warning' as const }],
    dim(`${b.max_parallel} at once`),
    dim(`${b.max_minutes} min`),
    dim(`${b.auto_retries} ${b.auto_retries === 1 ? 'retry' : 'retries'}`),
  ])
  const texts = [l1, l2, l3]
  if (b.tasks.length) {
    const counts = BANNER_COUNTS.map(([st, word]) => [b.tasks.filter(t => t.status === st).length, word] as const).filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`)
    const t = boardTotal(b, nowMs)
    texts.push(dim([...counts, ...(t.tries ? [fmtTotal(t)] : [])].join(' · ')))
  }
  const w = Math.max(1, Math.floor(width))
  const wide = w >= BANNER_NARROW
  // The three fixed lines sit beside the drawing; the drawing's lower lines (the clef's hook)
  // stand alone, and the counts line goes under the drawing, from the left edge, so it keeps the full width.
  if (wide) texts.splice(3, 0, ...Array.from({ length: Math.max(0, BANNER_ART.length - 3) }, () => [] as BannerPart[]))
  return texts.map((parts, i) => {
    const art = wide && BANNER_ART[i] ? `${BANNER_ART[i]}  ` : ''
    return { art, parts: cutParts(parts, w - art.length) }
  })
}

/** The dim separator under the banner, as wide as the panel's body. */
export const bannerRule = (width: number) => '─'.repeat(Math.max(1, Math.floor(width)))

/** A banner line as plain text (for tests and plain output). */
export const bannerText = (l: BannerLine) => l.art + l.parts.map(p => p.text).join('')

/** One line per task for the model and for /board, then the total time (and cost) of all tries.
 *  With `where` (the project's path), that comes first so you can tell boards apart.
 *  Open tasks come first, then today's others; finished tasks of older days are one line per
 *  day (see boardSections), seen from `nowMs` in time zone `offsetMin`. Without `nowMs`, every task is listed. */
export function boardText(b: Board, nowMs?: number, where?: string, name: string = DEFAULT_NAME, offsetMin: number = localOffset(nowMs)): string {
  const top = where ? [`${boardBrand(name)} · ${where}`] : []
  if (!b.tasks.length) return [...top, 'The board is empty.'].join('\n')
  const s: BoardSections = nowMs === undefined ? { open: [], today: [...b.tasks].sort(newestFirst), days: [] } : boardSections(b.tasks, nowMs, offsetMin)
  const rows = [...s.open, ...s.today]
  const lines = rows.map(t => {
    const extra = t.status === 'waiting' && t.question ? ` — asks: ${t.question}` : t.note ? ` — ${t.note}` : ''
    const after = t.after.length && t.status === 'todo' ? ` (after ${t.after.join(', ')})` : ''
    return `${t.id.padEnd(5)} ${t.status.padEnd(7)} ${t.title}${after}${extra}`
  })
  const head = `${b.paused ? 'PAUSED · ' : ''}tests: ${b.test_commands.join(' && ') || 'none set'} · up to ${b.max_parallel} at once · a worker may run ${b.max_minutes} min · ${b.auto_retries} auto retries on failing tests`
  const total = totalLine(b, nowMs)
  const days = s.days.map(g => groupLabel(g))
  return [...top, head, ...lines, ...days, ...(total ? [total] : [])].join('\n')
}

/** A scout file: `.<plugin name>/scouts/<name>.md`, front matter + instructions. */
export type ScoutDef = { name: string; every_minutes: number; model?: string; prompt: string }

export function parseScout(name: string, text: string): ScoutDef | null {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text)
  const meta: Record<string, string> = {}
  if (m) for (const line of m[1]!.split('\n')) {
    const kv = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i.exec(line)
    if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.replace(/^["']|["']$/g, '')
  }
  const prompt = (m ? m[2]! : text).trim()
  if (!prompt) return null
  const every = Number(meta.every_minutes ?? meta.every ?? 60)
  return { name: meta.name || name, every_minutes: Number.isFinite(every) && every >= 1 ? every : 60, model: meta.model || undefined, prompt }
}

// ---------------- scouts in the board panel ----------------

/** How much of a scout's last answer is kept (SymccScout.last_report). */
export const SCOUT_REPORT_CHARS = 2000

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

/** A scout's row as one line of text: "tests · every 30 min · sonnet · next in 12m · ran 8m ago". */
export function scoutRowText(s: SymccScout, nowMs: number): string {
  const r = scoutRow(s, nowMs)
  return [r.name, r.every, r.model, r.state, r.ran].filter(Boolean).join(' · ')
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
  if (!s || /^NOTHING\.?$/i.test(s)) return 'nothing found'
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

/** The how-to shown when there are no scouts. */
export function scoutHowTo(name: string = DEFAULT_NAME): string[] {
  return [
    'No scouts yet. A scout reads the project on a timer and suggests work.',
    `Add one as ${namesFor(name).scouts}/<name>.md:`,
    '  ---',
    '  every_minutes: 30',
    '  model: sonnet        (optional)',
    '  ---',
    '  What to look for, in plain words.',
    `examples/scouts/ in the plugin has two to copy. Then run /scouts.`,
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
  try {
    const l = JSON.parse(text ?? '') as Partial<Lead>
    return typeof l.session === 'string' && l.session && typeof l.heartbeat === 'number' && Number.isFinite(l.heartbeat) ? { session: l.session, heartbeat: l.heartbeat } : null
  } catch {
    return null
  }
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
  const fresh = nowMs - l.heartbeat <= staleMs && l.heartbeat - nowMs <= staleMs
  return fresh ? 'follow' : 'takeover'
}

// ---------------- which session owns a running task ----------------

/** The session that drives the board now, by lead.json `text` at `nowMs`; null if nobody does (or its heartbeat is stale). */
export function liveDriver(text: string | null, nowMs: number, staleMs = LEAD_STALE_MS): string | null {
  const l = parseLead(text)
  if (!l) return null
  const fresh = nowMs - l.heartbeat <= staleMs && l.heartbeat - nowMs <= staleMs
  return fresh ? l.session : null
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
      const { session: _gone, ...rest } = t
      return { ...rest, status: 'todo' as const, note, updated_at: now }
    }),
  }
}

// ---------------- never two workers on one task ----------------

/** An agent as $.agent.list() reports it. */
export type AgentInfo = { id: string; type?: string; status: string; description?: string }

/** Agent statuses that mean it has ended; anything else counts as still alive. */
export const ENDED_STATUSES = ['completed', 'failed', 'killed']

/** The plugin's live workers for task `id`: the one recorded on the task (`agent`), or any whose description starts with the task id. */
export function liveWorkersFor(t: Pick<BoardTask, 'id' | 'agent'>, agents: AgentInfo[], name: string = DEFAULT_NAME): AgentInfo[] {
  const worker = namesFor(name).worker
  return agents.filter(a => {
    if (ENDED_STATUSES.includes(a.status)) return false
    if (t.agent && a.id === t.agent) return true
    return a.type === worker && normId(String(a.description ?? '').split(/\s/)[0] ?? '') === t.id
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
