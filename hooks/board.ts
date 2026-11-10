// The task board: plain data, kept in <project>/.symcc/board.json. Every function
// here is pure (takes a board, returns a new one) so it can be tested without Claude.
import type { SymccStatus, SymccTask } from '../types'

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
  tasks: BoardTask[]
}

/** A task as the board file keeps it: while it is "doing", `session` names the session whose worker owns it. */
export type BoardTask = SymccTask & { session?: string }

export const BOARD_FILE = '.symcc/board.json'
/** held by one session while it reads, changes and writes the board */
export const LOCK_FILE = '.symcc/board.lock'
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

export function emptyBoard(): Board {
  return { version: 1, next_id: 1, paused: false, test_commands: [], target_branch: 'main', max_parallel: 3, max_minutes: 45, tasks: [] }
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

/** Repository-relative paths only; never the board itself or Git internals. */
export function cleanFiles(files: unknown): string[] {
  if (!Array.isArray(files)) return []
  return files
    .map(f => String(f).trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(f => f && !f.startsWith('/') && !f.split('/').includes('..') && !f.startsWith('.symcc') && !f.startsWith('.git/') && f !== '.git')
    .slice(0, 30)
}

export function addTask(b: Board, f: { title: string; details?: string; files?: unknown; after?: unknown; order?: number }, now: string): [Board, SymccTask] {
  const title = clean(f.title, 200)
  if (!title) throw new Error('a task needs a title')
  const after = (Array.isArray(f.after) ? f.after : []).map(x => normId(String(x))).filter(x => find(b, x))
  const t: SymccTask = {
    id: `T-${b.next_id}`,
    title,
    details: clean(f.details ?? title, 8000),
    files: cleanFiles(f.files),
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

export function patchTask(b: Board, id: string, patch: Partial<BoardTask>, now: string): Board {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  const next: BoardTask = { ...t, ...patch, updated_at: now }
  if (next.status !== 'doing' || !next.session) delete next.session
  if (patch.title !== undefined) next.title = clean(patch.title, 200)
  if (patch.details !== undefined) next.details = clean(patch.details, 8000)
  if (patch.files !== undefined) next.files = cleanFiles(patch.files)
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
export function outOfScope(changed: string[], allowed: string[]): string[] {
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
  return changed.filter(f => f.startsWith('.symcc/') || f.startsWith('.git/') || (allowed.length > 0 && !inside(f)))
}

/** For showing the board: newest task first (by when it was made, then by its number). */
export function newestFirst(x: SymccTask, y: SymccTask): number {
  const num = (id: string) => Number(id.replace(/\D/g, '')) || 0
  return (y.created_at || '').localeCompare(x.created_at || '') || num(y.id) - num(x.id)
}

/** One line per task for the model and for /board. */
export function boardText(b: Board): string {
  if (!b.tasks.length) return 'The board is empty.'
  const rows = [...b.tasks].sort(newestFirst)
  const lines = rows.map(t => {
    const extra = t.status === 'waiting' && t.question ? ` — asks: ${t.question}` : t.note ? ` — ${t.note}` : ''
    const after = t.after.length && t.status === 'todo' ? ` (after ${t.after.join(', ')})` : ''
    return `${t.id.padEnd(5)} ${t.status.padEnd(7)} ${t.title}${after}${extra}`
  })
  const head = `${b.paused ? 'PAUSED · ' : ''}tests: ${b.test_commands.join(' && ') || 'none set'} · up to ${b.max_parallel} at once · a worker may run ${b.max_minutes} min`
  return [head, ...lines].join('\n')
}

/** A scout file: `.symcc/scouts/<name>.md`, front matter + instructions. */
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

// ---------------- who drives the board ----------------
// Several sessions may have the same project open. Only one of them, the driver, starts
// workers, merges, runs scouts and the regular check. It writes .symcc/lead.json and
// refreshes the heartbeat in it; the others only read and change the board.

export const LEAD_FILE = '.symcc/lead.json'
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
 * is lead.json as it was before this session wrote its own heartbeat.
 */
export function resetDoing(b: Board, me: string, leadBefore: string | null, nowMs: number, note: string, now: string): Board {
  const live = liveDriver(leadBefore, nowMs)
  return {
    ...b,
    tasks: b.tasks.map(t => {
      if (t.status !== 'doing' || !ownedHere(t, me, live)) return t
      const { session: _gone, ...rest } = t
      return { ...rest, status: 'todo' as const, note, updated_at: now }
    }),
  }
}
