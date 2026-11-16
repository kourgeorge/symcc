// Adding and changing tasks, which ones may start, and the backlog.
import type { SymccTask } from '../../types'
import { BACKLOG_FROM, type Board, type BoardTask, cleanFiles, isKind, kindOf, type TaskKind, DATA_DIR, find, intoOf, normId, STATUS_WORD, waitsForFiles } from './board-file'
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

/** The kind a task gets: `kind` when given, else "investigation" for a researcher, else "change". */
export const kindFor = (kind: unknown, role: unknown): TaskKind => (isKind(kind) ? kind : cleanRole(role).toLowerCase() === 'researcher' ? 'investigation' : 'change')

/**
 * A new task on board `b`. `merge_into` is the branch it merges into (and its worker's copy starts
 * from): the branch checked out in the project now; "main" when not given.
 */
export function addTask(b: Board, f: { title: string; details?: string; files?: unknown; after?: unknown; order?: number; needs_review?: boolean; backlog?: boolean; role?: string; kind?: unknown; origin?: OriginInput; merge_into?: string }, now: string, dir: string = DATA_DIR): [Board, BoardTask] {
  const title = clean(f.title, 200)
  if (!title) throw new Error('a task needs a title')
  const origin = makeOrigin(f.origin, now, b)
  const after = (Array.isArray(f.after) ? f.after : []).map(x => normId(String(x))).filter(x => knownDep(b, x))
  const t: BoardTask = {
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
    merge_into: intoOf({ merge_into: f.merge_into }),
    branch: null,
    created_at: now,
    updated_at: now,
    ...(f.needs_review === true ? { needs_review: true } : {}),
    ...(cleanRole(f.role) ? { role: cleanRole(f.role) } : {}),
    ...(kindFor(f.kind, f.role) === 'investigation' ? { kind: 'investigation' as const } : {}),
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
  // the "being tested and merged" mark only means something while the task is "doing"
  if (next.status !== 'doing' || !next.finishing) delete next.finishing
  // the over-time marks belong to one try while it runs
  for (const k of ['extra_minutes', 'time_ask', 'wrap_up'] as const) if (next.status !== 'doing' || next.attempts !== t.attempts || !next[k]) delete next[k]
  // the step of a check only means something while the task stays as it was when checked
  if (!next.checking || next.status !== t.status || next.attempts !== t.attempts) delete next.checking
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
  if (patch.kind !== undefined) {
    if (patch.kind === 'investigation') next.kind = 'investigation'
    else delete next.kind
  }
  if (patch.needs_review !== undefined) {
    if (patch.needs_review === true) next.needs_review = true
    else delete next.needs_review
  }
  if (patch.after !== undefined) next.after = patch.after.map(normId).filter(x => x !== t.id && knownDep(b, x))
  if (next.status !== 'waiting') next.question = null
  // The worker's file request and choices belong to the question they came with.
  for (const k of ['asked_files', 'options'] as const) if (next.status !== 'waiting' || (patch.question !== undefined && !(k in patch)) || !next[k]?.length) delete next[k]
  // Waiting only for the owner's files to merge: kept while the task stays where it is (or the patch sets it again).
  if (!waitsForFiles(next) || (next.status !== t.status && !('merge_wait' in patch))) delete next.merge_wait
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
  // "." or "./" is the whole project, like an empty list.
  if (allowed.some(g => ['.', './', ''].includes(g.trim()))) allowed = []
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

/** Why a try failed when files outside the task's list changed. `undone`: they were undone on the task's branch (a worker's try), so the next try starts without them. */
export function outOfScopeText(bad: string[], allowed: string[], undone = false): string {
  // A name may hold any character but NUL: control characters (newlines, terminal escapes) are shown as "?".
  // eslint-disable-next-line no-control-regex
  const shown = (p: string) => p.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?')
  const head = `changed files outside the task (${bad.slice(0, 5).map(shown).join(', ')}); allowed: ${allowed.join(', ') || '-'}`
  if (undone) return `${head}. Those changes were undone on the task's branch, so the next try starts without them; if the task needs those files, add them to files with change (or split the task) before it tries again`
  // approve: change sends a task in review back to work (a fresh worker runs); the edits stay committed on the task's branch
  return `${head}. To fix: add them to files with change, or split the task. Adding them with change sends the task back to work with these edits kept, and it comes back to review, where you approve it again`
}

// ---------------- a worker over its time limit ----------------

/** The owner's choices when a worker runs past its time limit (see overtimeQuestion). */
export const OVERTIME_OPTIONS = ['+30 min', '+60 min', 'Stop it'] as const

/** How long a worker told its time is up (WRAP_UP_TEXT) gets to hand back before it is stopped. */
export const WRAP_UP_GRACE_MS = 3 * 60_000

/** The minutes task `t`'s worker may run now: max_minutes plus what the owner added for this try. */
export const timeLimitOf = (max: number, t: { extra_minutes?: number } | undefined) => max + (t?.extra_minutes ?? 0)

/**
 * With no answer from the owner, a worker over its limit is told to wrap up once it ran this long:
 * its limit plus max_minutes again (so twice max_minutes when no time was added).
 */
export const hardCapOf = (max: number, t: { extra_minutes?: number } | undefined) => timeLimitOf(max, t) + max

/** The question a task shows while its worker runs over its limit of `limit` minutes. */
export const overtimeQuestion = (id: string, limit: number) => `${id} has run ${limit} min. Give it more time?`

/** The note of a task whose worker runs over time while the owner is asked. */
export const OVERTIME_NOTE = 'over time; asked the owner'

/** What a worker is told when its time is up: write down what it has and hand back now. */
export const WRAP_UP_TEXT = "Time is up: write down what you have done and found, save notes into your task's files, and hand back now (answer with what you did, what you found and what is left)."

/**
 * The owner's answer to the over-time question: { add: N } for "+N min" (or a plain number of minutes;
 * "+1 hour" / "2 h" count 60 minutes each; 1-600 minutes in all), { stop: true } for "Stop it", or undefined when it
 * is neither or the number has another unit ("3 days").
 */
export function parseOvertimeAnswer(answer: string): { add: number } | { stop: true } | undefined {
  const a = String(answer ?? '').trim().toLowerCase()
  if (/^(stop|no\b|end|fail)/.test(a)) return { stop: true }
  const num = /^\+?\s*(\d{1,3})(?:\s*([a-z]+))?/
  const m = num.exec(a) ?? /\+\s*(\d{1,3})(?:\s*([a-z]+))?/.exec(a)
  if (!m) return undefined
  const unit = m[2] ?? ''
  const per = /^(h|hr|hrs|hours?)$/.test(unit) ? 60 : /^(|m|min|mins|minutes?)$/.test(unit) ? 1 : 0
  const n = Number(m[1]) * per
  return n >= 1 && n <= 600 ? { add: n } : undefined
}

/** The failed note of a task whose worker ran out of time and was stopped. */
export const outOfTimeNote = (limit: number) => `stopped: ran over ${limit} min; the work so far is in its folder and report, and a retry continues from there`

// ---------------- an answered investigation: Done, Keep as a note, Ask more ----------------

/** Whether `t` is an investigation whose answer waits in review for the owner to read it. */
export const isAnswered = (t: Pick<BoardTask, 'status' | 'kind'> | undefined): boolean => t?.status === 'review' && kindOf(t) === 'investigation'

/** Task `id` on board `b`, which must be an answered investigation (see isAnswered); throws otherwise. `what` is said in the error. */
function answeredTask(b: Board, id: string, what: string): BoardTask {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (!isAnswered(t)) throw new Error(`${t.id} is not an answered investigation (it is ${STATUS_WORD[t.status]}${kindOf(t) === 'investigation' ? '' : ', a change task'}); only an answered investigation can be ${what}`)
  return t
}

/**
 * "Done" on answered investigation `id`: it ends done with the note "answered"; nothing is merged.
 * `kept`: the id of the docs task that keeps its answer as a note (Keep as a note), said in its history.
 */
export function investigationDone(b: Board, id: string, now: string, kept?: string): Board {
  const t = answeredTask(b, id, 'marked done')
  const line = `try ${t.attempts}: the owner read the answer → done (nothing merged)${kept ? `; kept as a note by ${kept}` : ''}`
  return patchTask(b, t.id, { status: 'done', note: kept ? `answered; kept as a note by ${kept}` : 'answered', merge_main: false, test_output: undefined, history: [...t.history, line] }, now)
}

/** The file name part of a research note for a task titled `title`: "why-is-the-cache-slow" (at most 60 characters; "answer" when nothing is left). */
export function noteTopic(title: string): string {
  const s = String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s.slice(0, 60).replace(/-+$/, '') || 'answer'
}

/**
 * The new docs task that keeps answered investigation `t`'s answer as a research note, as addTask takes it:
 * it writes docs/research/<topic>.md from the saved answer (`answer`, the full report when there is one; `report`:
 * that report's file) and merges as usual. Made by the owner, as a follow-up of `t`.
 */
export function keepNoteTask(t: BoardTask, answer: string, report?: string): { title: string; details: string; files: string[]; role: string; kind: TaskKind; origin: OriginInput } {
  const file = `docs/research/${noteTopic(t.title)}.md`
  const head = `Write ${file}: a research note that keeps the answer of ${t.id} ("${t.title}"), so later tasks can read it. Use the answer below as it is: tidy it into a short note with a title, the question, the answer and how it was found. Don't look into the question again.`
  const where = report ? `\n\nThe full answer is in ${report}.` : ''
  const room = 8000 - head.length - where.length - 40
  const body = answer.trim() || t.answer?.trim() || '(no answer saved)'
  const text = body.length > room ? `${body.slice(0, Math.max(0, room - 1))}…` : body
  return {
    title: `Keep ${t.id}'s answer as a note: ${t.title}`.slice(0, 200),
    details: `${head}${where}\n\nThe answer:\n${text}`,
    files: [file],
    role: 'docs',
    kind: 'change',
    origin: { by: 'owner', task: t.id, how: 'follow-up', why: `the owner kept the answer of ${t.id} as a research note` },
  }
}

/**
 * "Ask more" on answered investigation `id`: it goes back to "todo" for a fresh try, with the owner's follow-up
 * `question` and the earlier answer added to its details. The answer is `answer` (the full report, else the saved one)
 * when it fits; else (or when there is none) a pointer to its report file `report`.
 */
export function askMoreTask(b: Board, id: string, question: string, answer: string, report: string | undefined, now: string): Board {
  const t = answeredTask(b, id, 'asked more')
  const q = clean(question, 1000)
  if (!q) throw new Error('give the follow-up question, so the next try knows what to look into')
  const day = now.slice(0, 10)
  const head = `\n\nFollow-up question (owner, ${day}): ${q}\nThe earlier answer (try ${t.attempts})`
  const where = report ? ` is in ${report}` : ''
  const body = answer.trim() || t.answer?.trim() || ''
  const fits = body && t.details.length + head.length + body.length + where.length + 40 <= 8000
  const added = fits ? `${head}${report ? ` (in full in ${report})` : ''}:\n${body}` : `${head}${where || ' was not saved'}.`
  return patchTask(b, t.id, { status: 'todo', note: `asked more: ${q.slice(0, 280)}`, details: `${t.details.trimEnd()}${added}`, answer: undefined, test_tries: 0, conflict_tries: 0, test_output: undefined, merge_main: false, history: [...t.history, `try ${t.attempts}: the owner asked more: ${q}`] }, now)
}
