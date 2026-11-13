// Adding and changing tasks, which ones may start, and the backlog.
import type { SymccTask } from '../../types'
import { BACKLOG_FROM, type Board, type BoardTask, cleanFiles, DATA_DIR, find, normId, STATUS_WORD } from './board-file'
import { depDone } from './archive'
import { createdLine, makeOrigin, type OriginInput } from './origin'
import { endRun } from './runs'
import { clean, num } from './text'

/** Whether `id` may stand in a task's `after`: on the board, or archived as done (it then counts as done). */
const knownDep = (b: Board, id: string) => !!find(b, id) || (b.archived_done ?? []).includes(id)

/** A task's role as stored: the name, or '' for general (which is the same as no role). */
const cleanRole = (r: unknown): string => {
  const s = clean(r, 64)
  return s.toLowerCase() === 'general' ? '' : s
}

export function addTask(b: Board, f: { title: string; details?: string; files?: unknown; after?: unknown; order?: number; needs_review?: boolean; backlog?: boolean; role?: string; origin?: OriginInput }, now: string, dir: string = DATA_DIR): [Board, SymccTask] {
  const title = clean(f.title, 200)
  if (!title) throw new Error('a task needs a title')
  const origin = makeOrigin(f.origin, now, b)
  const after = (Array.isArray(f.after) ? f.after : []).map(x => normId(String(x))).filter(x => knownDep(b, x))
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
  if (patch.after !== undefined) next.after = patch.after.map(normId).filter(x => x !== t.id && knownDep(b, x))
  if (next.status !== 'waiting') next.question = null
  // The worker's file request and choices belong to the question they came with.
  for (const k of ['asked_files', 'options'] as const) if (next.status !== 'waiting' || (patch.question !== undefined && !(k in patch)) || !next[k]?.length) delete next[k]
  return { ...b, tasks: b.tasks.map(x => (x.id === t.id ? next : x)) }
}

/** Tasks a worker could start now: to do (never backlog), and everything they wait for is done (an archived done task counts). */
export function ready(b: Board): SymccTask[] {
  return b.tasks
    .filter(t => t.status === 'todo' && t.after.every(a => depDone(b, a)))
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
  const reason = need.reason.trim()
  return `${id} needs to change files outside its list: ${need.files.join(', ')}${reason ? ` — ${reason}` : ''}${/[.?!]$/.test(reason) ? '' : '.'} Allow them?`
}

/** How many choices a worker's OPTIONS line may give. */
export const OPTIONS_MIN = 2
export const OPTIONS_MAX = 6

/**
 * The choices on a worker's `OPTIONS: a | b | c` line (given after its QUESTION line), or
 * undefined when there is none or it gives fewer than 2 or more than 6.
 */
export function parseOptions(answer: string): string[] | undefined {
  const m = /^[\s`*]*OPTIONS\s*:\s*(.*)$/im.exec(answer)
  if (!m) return undefined
  const opts = [...new Set(m[1]!.split('|').map(o => o.replace(/[`*]+$/, '').trim().slice(0, 200)).filter(Boolean))]
  return opts.length >= OPTIONS_MIN && opts.length <= OPTIONS_MAX ? opts : undefined
}

/** 'the owner allowed files: + a, + b': the history line when the owner allows a file request. */
export const filesAllowedLine = (files: readonly string[]) => `the owner allowed files: ${files.map(f => `+ ${f}`).join(', ')}`

/** What the lead is told when the owner does not allow a waiting task's file request. */
export const filesRefusedText = (id: string, files: readonly string[]) => `The owner didn't allow ${files.join(', ')} for ${id}: drop it or narrow the plan.`

/** Task `id` waits with a file request (NEED FILES); throws otherwise. */
function askedFilesOf(b: Board, id: string): [BoardTask, string[]] {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (t.status !== 'waiting' || !t.asked_files?.length) throw new Error(`${t.id} is not waiting for files to be allowed`)
  return [t, t.asked_files]
}

/** The owner allows a waiting task's file request: its files grow by them and it goes back to work, in one change. */
export function allowFiles(b: Board, id: string, now: string, dir: string = DATA_DIR): Board {
  const [t, asked] = askedFilesOf(b, id)
  const added = asked.filter(f => !t.files.includes(f))
  return patchTask(b, t.id, { status: 'todo', note: 'files allowed; queued', files: [...t.files, ...added], history: [...t.history, filesAllowedLine(added.length ? added : asked)] }, now, dir)
}

/** The owner does not allow a waiting task's file request: it keeps waiting (for the lead to drop or narrow it). */
export function refuseFiles(b: Board, id: string, now: string): Board {
  const [t, asked] = askedFilesOf(b, id)
  return patchTask(b, t.id, { note: 'files not allowed', history: [...t.history, `the owner didn't allow files: ${asked.join(', ')}`] }, now)
}

/** Why a try failed when the worker changed files outside its list without asking. */
export function outOfScopeText(bad: string[], allowed: string[]): string {
  // A name may hold any character but NUL: control characters (newlines, terminal escapes) are shown as "?".
  // eslint-disable-next-line no-control-regex
  const shown = (p: string) => p.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?')
  return `changed files outside the task (${bad.slice(0, 5).map(shown).join(', ')}); allowed: ${allowed.join(', ') || '-'}. To fix: add them to files with change, or split the task`
}
