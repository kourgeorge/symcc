// Adding and changing tasks, which ones may start, and the backlog.
import type { SymccTask } from '../../types'
import { BACKLOG_FROM, type Board, type BoardTask, cleanFiles, cleanLive, type Live, DEFAULT_KIND, INVESTIGATION, isInvestigation, isKind, kindOf, type TaskKind, DATA_DIR, find, intoOf, isFinished, normId, STATUS_WORD, waitsForFiles } from './board-file'
import { depDone } from './archive'
import { historyEntry, withHistory } from './history'
import { createdLine, makeOrigin, type OriginInput } from './origin'
import { endRun, keepAgentIds } from './runs'
import { clean, num, shownPath } from './text'

/** The most a task's details may hold (addTask and patchTask cut the rest). */
const DETAILS_MAX = 8000

/** Whether `id` may stand in a task's `after`: on the board, or archived as done (it then counts as done). */
const knownDep = (b: Board, id: string) => !!find(b, id) || (b.archived_done ?? []).includes(id)

/** A task's role as stored: the name, or '' for general (which is the same as no role). */
const cleanRole = (r: unknown): string => {
  const s = clean(r, 64)
  return s.toLowerCase() === 'general' ? '' : s
}

/** The kind a task gets: `kind` when given (in lowercase), else "investigation" for a researcher, else "change". */
export const kindFor = (kind: unknown, role: unknown): TaskKind => (isKind(kind) ? kindOf({ kind }) : cleanRole(role).toLowerCase() === 'researcher' ? INVESTIGATION : DEFAULT_KIND)

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
    details: clean(f.details ?? title, DETAILS_MAX),
    files: cleanFiles(f.files, dir),
    status: f.backlog === true ? 'backlog' : 'todo',
    note: '',
    order: typeof f.order === 'number' ? f.order : Math.max(0, ...b.tasks.map(x => x.order)) + 1,
    after,
    attempts: 0,
    history: [historyEntry('created', createdLine(origin), now)],
    origin,
    merge_into: intoOf({ merge_into: f.merge_into }),
    branch: null,
    created_at: now,
    updated_at: now,
    ...(f.needs_review === true ? { needs_review: true } : {}),
    ...(cleanRole(f.role) ? { role: cleanRole(f.role) } : {}),
    // "change" is the default, so it is never stored
    ...(kindFor(f.kind, f.role) !== DEFAULT_KIND ? { kind: kindFor(f.kind, f.role) } : {}),
  }
  return [{ ...b, next_id: b.next_id + 1, tasks: [...b.tasks, t] }, t]
}

/** A patch of a task: its fields as they are, except `live`, which is merged into the task's own (a field set to undefined is dropped; null clears all of it). */
export type TaskPatch = Omit<Partial<BoardTask>, 'live'> & { live?: Live | null }

/** The live object of `t` after `patch`, as the new `next` (its status and try) may keep it; undefined when it holds nothing. */
function liveFor(t: BoardTask, patch: TaskPatch, next: BoardTask): Live | undefined {
  const sameTry = next.status === t.status && next.attempts === t.attempts
  const kept: Live = patch.live === null ? {} : { ...(t.live ?? {}) }
  // the over-time marks, the hand-back record and the check step belong to one try, and to the status it was in
  if (!sameTry) for (const k of ['extra_minutes', 'time_ask', 'wrap_up', 'ask', 'refused', 'checking'] as const) delete kept[k]
  // waiting only for the owner's files to merge: kept while the task stays where it is (or the patch sets it again)
  if (next.status !== t.status) delete kept.merge_wait
  const set = patch.live ? patch.live : {}
  const merged = { ...kept, ...set } as Record<string, unknown>
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k]
  return cleanLive(merged, next.status)
}

export function patchTask(b: Board, id: string, patch: TaskPatch, now: string, dir: string = DATA_DIR): Board {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  const { live: _l, ...plain } = patch
  const next: BoardTask = { ...t, ...plain, updated_at: now }
  // Leaving "doing" ends the worker's try, however it ended (finished, stopped, over time, lost).
  if (t.status === 'doing' && next.status !== 'doing' && next.runs?.length && !next.runs[next.runs.length - 1]!.ended) next.runs = endRun(next.runs, now)
  // T-479: each try keeps its agents' ids, after it ends too, so every copy of the plugin refuses them then (the old tries' ids are cut)
  if (next.runs?.length) next.runs = keepAgentIds(next.runs)
  // Everything that belongs to one running try (see Live) is kept or dropped here, in one place.
  const live = liveFor(t, patch, next)
  if (live) next.live = live
  else delete next.live
  // "merge it in first" is stored only when true; why a task failed only while it is failed
  if (!next.merge_main) delete next.merge_main
  if (next.status !== 'failed' || !next.failed_on) delete next.failed_on
  // Where a task came from never changes once it is made.
  if ('origin' in patch) {
    if (t.origin) next.origin = t.origin
    else delete next.origin
  }
  if (patch.title !== undefined) next.title = clean(patch.title, 200)
  if (patch.details !== undefined) next.details = clean(patch.details, DETAILS_MAX)
  if (patch.files !== undefined) next.files = cleanFiles(patch.files, dir)
  if (patch.role !== undefined) {
    const role = cleanRole(patch.role)
    if (role) next.role = role
    else delete next.role
  }
  if (patch.kind !== undefined) {
    const kind = kindOf(patch)
    if (kind !== DEFAULT_KIND) next.kind = kind
    else delete next.kind
  }
  if (patch.needs_review !== undefined) {
    if (patch.needs_review === true) next.needs_review = true
    else delete next.needs_review
  }
  if (patch.after !== undefined) next.after = patch.after.map(normId).filter(x => x !== t.id && knownDep(b, x))
  // The question the task waits on (T-808: one Ask record, with the lead's wording, T-801, and a file request's files): only while it waits
  // (or, for the lead's wording of the "more time?" question, while a worker runs over its time), and kept only while it stays as it was or the patch sets it.
  const sameAsk = next.status === t.status && patch.ask === undefined && patch.live?.time_ask === undefined && (next.status === 'waiting' || (next.status === 'doing' && !!next.live?.time_ask))
  if (!('ask' in patch) && !sameAsk) delete next.ask
  if (next.status !== 'waiting' && !(next.status === 'doing' && next.live?.time_ask)) delete next.ask
  if (next.ask === undefined) delete next.ask
  return putTask(b, next)
}

/** Board `b` with the task of the same id as `t` swapped for `t`. */
export const putTask = (b: Board, t: BoardTask): Board => ({ ...b, tasks: b.tasks.map(x => (x.id === t.id ? t : x)) })

/** Tasks a worker could start now: to do (never backlog), and everything they wait for is done (an archived done task counts). */
export function ready(b: Board): SymccTask[] {
  return b.tasks
    .filter(t => t.status === 'todo' && t.after.every(a => depDone(b, a)))
    .sort((x, y) => x.order - y.order || num(x.id) - num(y.id))
}

// ---------------- the backlog ----------------

/**
 * T-703: a task that failed because its branch clashes with the branch it merges into. Whatever moves it
 * back (a change, a retry, the backlog) keeps that: its next try is a "merge it in" try (merge_main).
 */
export const failedOnClash = (t: Pick<BoardTask, 'status' | 'failed_on'>): boolean => t.status === 'failed' && t.failed_on === 'clash'

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
  return patchTask(b, t.id, { status: 'backlog', note: why ? `in the backlog: ${why}` : 'in the backlog', ...(failedOnClash(t) ? { merge_main: true } : {}), history: withHistory(t.history, now, ['moved-backlog', `moved to the backlog (was ${t.status})${why ? `: ${why}` : ''}`, { backlog: true }]) }, now)
}

/** "Promote": task `id` leaves the backlog for "todo", so a worker may start on it. A history line says so. */
export function promoteTask(b: Board, id: string, now: string): Board {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (t.status !== 'backlog') throw new Error(`${t.id} is not in the backlog (it is ${STATUS_WORD[t.status]})`)
  return patchTask(b, t.id, { status: 'todo', note: 'moved from the backlog', history: withHistory(t.history, now, ['moved-backlog', 'moved from the backlog to todo']) }, now)
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

/** The question a task waits with after its worker's edits of `files` (outside its list) were refused. */
export function needFilesQuestion(id: string, files: readonly string[]): string {
  return `${id} needs to change files outside its list: ${files.join(', ')}. Allow them?`
}

/** 'the owner allowed files: + a, + b': the history line when the owner allows a file request. */
export const filesAllowedLine = (files: readonly string[]) => `the owner allowed files: ${files.map(f => `+ ${f}`).join(', ')}`

/** What the lead is told when the owner does not allow a waiting task's file request. */
export const filesRefusedText = (id: string, files: readonly string[]) => `The owner didn't allow ${files.join(', ')} for ${id}: drop it or narrow the plan.`

/** Task `id` waits with a file request (its worker's edits outside its files were refused); throws otherwise. */
function askedFilesOf(b: Board, id: string): [BoardTask, string[]] {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  const files = t.ask?.files
  if (t.status !== 'waiting' || !files?.length) throw new Error(`${t.id} is not waiting for files to be allowed`)
  return [t, files]
}

/** The owner allows a waiting task's file request: its files grow by them and it goes back to work, in one change. */
export function allowFiles(b: Board, id: string, now: string, dir: string = DATA_DIR): Board {
  const [t, asked] = askedFilesOf(b, id)
  // T-713: a path a task's files can't hold (outside the project, under .git or the data folder) is never
  // added, so Allow refuses instead of saying "allowed" and sending the worker back to be refused again.
  const bad = asked.filter(f => !cleanFiles([f], dir).length)
  if (bad.length) throw new Error(cantAllowText(t.id, bad, dir))
  const kept = cleanFiles(asked, dir)
  const added = kept.filter(f => !t.files.includes(f))
  return patchTask(b, t.id, { status: 'todo', note: 'files allowed; queued', files: [...t.files, ...added], history: withHistory(t.history, now, ['files-widened', filesAllowedLine(added.length ? added : kept)]) }, now, dir)
}

/** Why Allow refused a file request: `bad` can't be in a task's files. The task keeps waiting. */
export function cantAllowText(id: string, bad: readonly string[], dir: string = DATA_DIR): string {
  return `Can't allow ${bad.join(', ')} for ${id}: a task's files can't name the whole project or paths outside it, under .git or under ${dir.replace(/\/$/, '')}, so nothing was added and ${id} keeps waiting. Press Don't allow, or the lead can change the task.`
}

/** The owner does not allow a waiting task's file request: it keeps waiting (for the lead to drop or narrow it). */
export function refuseFiles(b: Board, id: string, now: string): Board {
  const [t, asked] = askedFilesOf(b, id)
  return patchTask(b, t.id, { note: 'files not allowed', history: withHistory(t.history, now, ['files-refused', `the owner didn't allow files: ${asked.join(', ')}`]) }, now)
}

/** Why a try failed when files outside the task's list changed. `undone`: they were undone on the task's branch (a worker's try), so the next try starts without them. */
export function outOfScopeText(bad: string[], allowed: string[], undone = false): string {
  const head = `changed files outside the task (${bad.slice(0, 5).map(shownPath).join(', ')}); allowed: ${allowed.join(', ') || '-'}`
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
export const timeLimitOf = (max: number, t: { live?: { extra_minutes?: number } } | undefined) => max + (t?.live?.extra_minutes ?? 0)

/**
 * With no answer from the owner, a worker over its limit is told to wrap up once it ran this long:
 * its limit plus max_minutes again (so twice max_minutes when no time was added).
 */
export const hardCapOf = (max: number, t: { live?: { extra_minutes?: number } } | undefined) => timeLimitOf(max, t) + max

/** The question a task shows while its worker runs over its limit of `limit` minutes. */
export const overtimeQuestion = (id: string, limit: number) => `${id} has run ${limit} min. Give it more time?`

/** The note of a task whose worker runs over time while the owner is asked. */
export const OVERTIME_NOTE = 'over time; asked the owner'

/** What a worker is told when its time is up: write down what it has and hand back now. */
export const WRAP_UP_TEXT = "Time is up: write down what you have done and found, save notes into your task's files, and hand back now (answer with what you did, what you found and what is left)."

/** The whole answers that stop a worker (lower case, punctuation dropped): stopping can't be undone, so only these count. */
const STOP_ANSWERS = new Set(['stop', 'stop it', 'stop now', 'no', 'no more', 'no more time', 'end it', 'fail it'])

/**
 * The owner's answer to the over-time question: { add: N } for "+N min" (or a plain number of minutes;
 * "+1 hour" / "1.5 h" count 60 minutes each, rounded up to whole minutes; "an hour" / "another hour" 60, "half an hour" 30;
 * 1-600 minutes in all), { stop: true } only for a whole stop answer ("Stop it", "stop", "no", "no more time", "end it", ...;
 * case and punctuation ignored), or undefined when it is neither, the number has another unit ("3 days"), other words are
 * left over, or a stop word comes with an amount ("stop in 30 min"). Filler words are skipped: "give it 30 more minutes",
 * "+1 extra hour", "45 more", "another 20 min please", and a leading clause: "no rush, give it another hour".
 */
export function parseOvertimeAnswer(answer: string): { add: number } | { stop: true } | undefined {
  let a = String(answer ?? '').trim().toLowerCase()
  if (STOP_ANSWERS.has(a.replace(/[^a-z]+/g, ' ').trim())) return { stop: true }
  a = a
    .replace(/\bhalf\s+an?\s+hour\b/g, '30 min')
    .replace(/\b(?:an|another|one)\s+(?:(?:more|extra|additional)\s+)?hour\b/g, '60 min')
  // a stop word with anything else is unclear: refuse it rather than stop or go on
  if (/\b(stop|end\s+it|fail\s+it)\b/.test(a)) return undefined
  a = a.replace(/[.,!?]+$/, '')
  // the amount may follow a leading clause: "no problem, +30 min", "ending soon? give it 20 min"
  const starts = [0, ...[...a.matchAll(/[,;:!?+]|\.\s/g)].map(m => (m[0] === '+' ? m.index : m.index + m[0].length))]
  for (const at of starts) {
    const add = amountOf(a.slice(at).trim())
    if (add !== undefined) return { add }
  }
  return undefined
}

/** The minutes in an answer that is only an amount with filler words ("give it +30 more min"), or undefined. */
function amountOf(a: string): number | undefined {
  a = a.replace(/^(please\s*,?\s+)?(give\s+it\s+)?(please\s+)?/, '')
  const m = /^(?:(?:another|an?|extra|additional|more)\s+)?\+?\s*(\d{0,3}\.\d+|\d{1,3})(?![\d.])\s*(.*)$/.exec(a)
  if (!m) return undefined
  const words = (m[2] ?? '').split(/[\s,]+/).filter(w => w && !/^(more|extra|another|additional|please)$/.test(w))
  if (words.length > 1) return undefined
  const unit = words[0] ?? ''
  const per = /^(h|hr|hrs|hours?)$/.test(unit) ? 60 : /^(|m|min|mins|minutes?)$/.test(unit) ? 1 : 0
  const n = Math.ceil(Number(m[1]) * per)
  return n >= 1 && n <= 600 ? n : undefined
}

/** The failed note of a task whose worker ran out of time and was stopped. */
export const outOfTimeNote = (limit: number) => `stopped: ran over ${limit} min; the work so far is in its folder and report, and a retry continues from there`

// ---------------- an answered investigation: Done, Keep as a note, Ask more ----------------

/** Whether `t` is an investigation whose answer waits in review for the owner to read it. */
export const isAnswered = (t: Pick<BoardTask, 'status' | 'kind'> | undefined): boolean => t?.status === 'review' && isInvestigation(t)

/** Task `id` on board `b`, which must be an answered investigation (see isAnswered); throws otherwise. `what` is said in the error. */
function answeredTask(b: Board, id: string, what: string): BoardTask {
  const t = find(b, id)
  if (!t) throw new Error(`${id} is not on the board`)
  if (!isAnswered(t)) throw new Error(`${t.id} is not an answered investigation (it is ${STATUS_WORD[t.status]}${isInvestigation(t) ? '' : ', a change task'}); only an answered investigation can be ${what}`)
  return t
}

/**
 * "Done" on answered investigation `id`: it ends done with the note "answered"; nothing is merged.
 * `kept`: the id of the docs task that keeps its answer as a note (Keep as a note), said in its history.
 */
export function investigationDone(b: Board, id: string, now: string, kept?: string): Board {
  const t = answeredTask(b, id, 'marked done')
  const line = `try ${t.attempts}: the owner read the answer → done (nothing merged)${kept ? `; kept as a note by ${kept}` : ''}`
  return patchTask(b, t.id, { status: 'done', note: kept ? `answered; kept as a note by ${kept}` : 'answered', merge_main: undefined, test_output: undefined, history: withHistory(t.history, now, ['done', line, { try: Number(t.attempts) || 0, result: `done (nothing merged)${kept ? `; kept as a note by ${kept}` : ''}` }]) }, now)
}

/** `s` in lower case with every run of other characters turned into one "-", and no "-" at either end. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** The file name part of a research note for a task titled `title`: "why-is-the-cache-slow" (at most 60 characters; `id` in lower case, "t-123", when nothing is left). */
export function noteTopic(title: string, id = ''): string {
  const s = slug(String(title ?? ''))
  return s.slice(0, 60).replace(/-+$/, '') || slug(id) || 'answer'
}

/** The docs/research files an open task on board `b` (not done or dropped) is to write, so a new note doesn't pick them too. */
export const noteFilesInUse = (b: Board): string[] => b.tasks.filter(t => !isFinished(t)).flatMap(t => t.files.filter(f => f.startsWith('docs/research/')))

/** docs/research/<topic>.md for task `t`, with -2, -3… added when `taken` (files that exist or open tasks write) has it. */
export function noteFile(t: Pick<BoardTask, 'id' | 'title'>, taken: readonly string[] = []): string {
  const topic = noteTopic(t.title, t.id)
  const used = new Set(taken.map(f => f.replace(/^\.\//, '').toLowerCase()))
  let file = `docs/research/${topic}.md`
  for (let n = 2; used.has(file); n++) file = `docs/research/${topic}-${n}.md`
  return file
}

/**
 * The new docs task that keeps answered investigation `t`'s answer as a research note, as addTask takes it:
 * it writes docs/research/<topic>.md from the saved answer (`answer`, the latest full report when there is one) and
 * merges as usual. `reports`: every try's report file (a single file is taken too). After Ask more a later try's
 * answer may be only changes to an earlier one, so with more than one report the details list them all, oldest first,
 * and ask the docs worker to write the final, complete answer from them. Made by the owner, as a follow-up of `t`.
 * `taken`: files the note must not use (existing docs/research files and those open tasks write, see
 * noteFilesInUse); -2, -3… is added then.
 */
export function keepNoteTask(t: BoardTask, answer: string, reports: string | readonly string[] = [], taken: readonly string[] = []): { title: string; details: string; files: string[]; role: string; kind: TaskKind; origin: OriginInput } {
  const file = noteFile(t, taken)
  const files = [...new Set(typeof reports === 'string' ? [reports] : reports)].sort((a, b) => tryOf(a) - tryOf(b))
  const many = files.length > 1
  const head = `Write ${file}: a research note that keeps the answer of ${t.id} ("${t.title}"), so later tasks can read it. Use the answer${many ? 's' : ''} below as ${many ? 'they are' : 'it is'}: tidy it into a short note with a title, the question, the answer and how it was found. Don't look into the question again.`
  const where = many
    ? `\n\nThis investigation had ${files.length} tries (the owner asked more), and each try's answer is in its report, oldest first: ${files.join(', ')}. A later try's answer may give only changes to an earlier one ("everything else is the same"). Read them all and combine them: write the final, complete answer, applying each later try's changes to the earlier answers, not only the last answer.`
    : files.length ? `\n\nThe full answer is in ${files[0]}.` : ''
  const copied = files.length ? ` ${many ? 'These report files are' : 'That report file is'} copied into your own folder at the same path when you start (git-ignored, never committed): read ${many ? 'them' : 'it'} there, not in the main project folder.` : ''
  const label = many ? `The latest answer (try ${tryOf(files.at(-1)!)})` : 'The answer'
  const room = DETAILS_MAX - head.length - where.length - copied.length - label.length - 40
  const body = answer.trim() || t.answer?.trim() || '(no answer saved)'
  const text = body.length > room ? `${body.slice(0, Math.max(0, room - 1))}…` : body
  return {
    title: `Keep ${t.id}'s answer as a note: ${t.title}`.slice(0, 200),
    details: `${head}${where}${copied}\n\n${label}:\n${text}`,
    files: [file],
    role: 'docs',
    kind: 'change',
    origin: { by: 'owner', task: t.id, how: 'follow-up', why: `the owner kept the answer of ${t.id} as a research note` },
  }
}

/**
 * The report files task details `details` name, each once, in the order they come: a keep-note task's earlier
 * answers, or an earlier task's answer, copied into its folder when it starts (see copyReports). An exact file
 * (<dir>/reports/<id>-try-<N>.md) comes back as it is; T-927: "<id>-try-*.md" (with or without the folder) and a bare
 * "T-920's answer" / "the answer of T-920" come back as "<dir>/reports/<id>-try-*.md", meaning that task's latest
 * report (see latestReportOf).
 */
export function namedReports(details: string, dir: string = DATA_DIR): string[] {
  const esc = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const id = '[A-Za-z]+-\\d+'
  const re = new RegExp(
    `${esc}/reports/[A-Za-z0-9_-]+-try-\\d+\\.md|(?:${esc}/reports/)?(${id})-try-\\*\\.md|\\b(${id})['’]s (?:latest |last |research )?(?:answer|report)\\b|\\b(?:answer|report) of (${id})\\b`,
    'g',
  )
  const out: string[] = []
  for (const m of String(details ?? '').matchAll(re)) {
    const who = m[1] ?? m[2] ?? m[3]
    out.push(who ? latestReportPattern(dir, who) : m[0])
  }
  return [...new Set(out)]
}

/** T-927: how namedReports writes "task `id`'s latest report": "<dir>/reports/<id>-try-*.md". */
export const latestReportPattern = (dir: string, id: string) => `${dir}/reports/${id}-try-*.md`

/**
 * T-927: the latest report of task `id` among the file names `names` (of the reports folder): the "<id>-try-<N>.md"
 * with the highest N, or null when there is none.
 */
export function latestReportOf(id: string, names: readonly string[]): string | null {
  let best: string | null = null
  let n = -1
  for (const name of names) {
    const m = /^(.+)-try-(\d+)\.md$/.exec(name)
    if (!m || m[1] !== id) continue
    if (Number(m[2]) > n) [best, n] = [name, Number(m[2])]
  }
  return best
}

/** The try number in a report file's name (…-try-<N>.md), 0 when there is none. */
const tryOf = (file: string) => Number(/-try-(\d+)\.md$/.exec(file)?.[1] ?? 0)

/** How each part Ask more adds to a task's details starts. */
const ASK_MARK = '\n\nFollow-up question (owner, '

/** Whether the owner asked more on `t` (its details hold a follow-up question), so its next try follows an earlier answer. */
export const askedMore = (t: Pick<BoardTask, 'details'>): boolean => t.details.includes(ASK_MARK)

/** An earlier Ask more part with its answer replaced by the path to its report (or a word that it was cut). */
function shortAsk(part: string): string {
  const m = /^(\n\nFollow-up question \(owner, [\s\S]*?\nThe earlier answer \(try \d+\))(?: \(in full in (\S+)\))?:\n/.exec(part)
  if (!m) return part
  return `${m[1]}${m[2] ? ` is in ${m[2]}` : ' was cut to fit'}.`
}

/**
 * `details` with `added` at its end, within DETAILS_MAX: `added` (the newest question) always stays whole; when it
 * doesn't fit, the oldest text gives way first: earlier answers become their report paths (oldest first), then the
 * task's own details are cut, then the oldest Ask more parts go.
 */
function withAsk(details: string, added: string): string {
  const parts = details.split(ASK_MARK)
  let base = parts[0]!
  const asks = parts.slice(1).map(p => ASK_MARK + p)
  const size = () => base.length + asks.reduce((n, p) => n + p.length, 0) + added.length
  for (let i = 0; i < asks.length && size() > DETAILS_MAX; i++) asks[i] = shortAsk(asks[i]!)
  if (size() > DETAILS_MAX) {
    const room = DETAILS_MAX - (size() - base.length)
    base = room > 1 ? `${base.slice(0, room - 1).trimEnd()}…` : ''
  }
  while (size() > DETAILS_MAX && asks.length) asks.shift()
  return `${base}${asks.join('')}${added}`
}

/**
 * "Ask more" on answered investigation `id`: it goes back to "todo" for a fresh try, with the owner's follow-up
 * `question` and the earlier answer added to its details. The answer is `answer` (the full report, else the saved one)
 * when it fits; else (or when there is none) a pointer to its report file `report`. The new question and that
 * pointer always stay: when the details would pass 8000 characters, the oldest text is shortened instead (see withAsk).
 */
export function askMoreTask(b: Board, id: string, question: string, answer: string, report: string | undefined, now: string): Board {
  const t = answeredTask(b, id, 'asked more')
  const q = clean(question, 1000)
  if (!q) throw new Error('give the follow-up question, so the next try knows what to look into')
  const day = now.slice(0, 10)
  const head = `\n\nFollow-up question (owner, ${day}): ${q}\nThe earlier answer (try ${t.attempts})`
  const where = report ? ` is in ${report}` : ''
  const body = answer.trim() || t.answer?.trim() || ''
  const fits = body && t.details.length + head.length + body.length + where.length + 40 <= DETAILS_MAX
  const added = fits ? `${head}${report ? ` (in full in ${report})` : ''}:\n${body}` : `${head}${where || ' was not saved'}.`
  return patchTask(b, t.id, { status: 'todo', note: `asked more: ${q.slice(0, 280)}`, details: withAsk(t.details.trimEnd(), added), answer: undefined, test_tries: 0, test_output: undefined, merge_main: undefined, history: withHistory(t.history, now, ['asked', `try ${t.attempts}: the owner asked more: ${q}`, { try: Number(t.attempts) || 0 }]) }, now)
}
