// The board panel's view for the Cursor extension, worked out from the view each publish hands the host
// (app/lead.ts publish -> ui.panel.updateView): what needs the owner, the running lanes, the tasks, today's news and
// the scouts, in the board's own words. The webview only draws it; every rule about what a task needs lives in core/.
import type { SymccTask } from '../../types'
import type { PaneView } from '../../hooks/app/state'
import { type BoardTask, type DiffFile, type TaskAction, isAnswered, kindOf, isFinished, needsYou, newestFirst, taskAsks, taskActions, whyFailed, liveLanes, liveFinishedLanes, onDemand, everyText, shownStatus, roleOf, HISTORY_KINDS, isHistoryKind, MODE_NAME, MODE_MEANING } from '../../hooks/board'
import { isOpenQuestion } from '../../hooks/core/questions'
import { viewMarks } from '../../hooks/core/board-parts'
import type { PanelAction, PanelActionId, PanelLane, PanelNeed, PanelNews, PanelScout, PanelTask, PanelView } from './protocol'

const ms = (iso: unknown): number | undefined => {
  const n = typeof iso === 'string' ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** The task actions the panel has a button for (taskActions' others need the terminal: copy, role, watch). */
const PANEL_ACTIONS: ReadonlySet<string> = new Set<PanelActionId>(['approve', 'reject', 'done', 'keep-note', 'ask-more', 'retry', 'drop', 'pause', 'resume', 'show-changes', 'to-todo', 'merge-now'])

/** The box hint of an action that needs the owner's words first. */
const ASKS: Partial<Record<PanelActionId, string>> = { reject: 'What is wrong, for the next worker', 'ask-more': 'Your follow-up question', drop: 'Why (optional)' }

function panelAction(x: TaskAction): PanelAction | null {
  if (!PANEL_ACTIONS.has(x.id)) return null
  const id = x.id as PanelActionId
  const label = id === 'reject' || id === 'ask-more' ? `${x.label}…` : x.label
  return { id, label, ...(x.group === 'main' ? { primary: true } : {}), ...(ASKS[id] ? { ask: ASKS[id] } : {}) }
}

const actionsOf = (t: BoardTask): PanelAction[] => taskActions(t).map(panelAction).filter((a): a is PanelAction => !!a)

/** The status as the owner reads it. */
export function statusWord(t: BoardTask, nowMs: number): string {
  const s = shownStatus(t, nowMs)
  if (s === 'doing') return 'running'
  if (s === 'review') return isAnswered(t) ? 'answer to read' : 'ready for review'
  return ({ todo: 'up next', backlog: 'backlog', paused: 'paused', waiting: 'waits for you', failed: 'failed', done: 'done', dropped: 'dropped' } as Record<string, string>)[s] ?? s
}

const kindWord = (t: { kind?: unknown }) => (kindOf(t) === 'change' ? '' : kindOf(t))
const tryWord = (t: { attempts?: number }) => (Number(t.attempts) > 1 ? `try ${t.attempts}` : '')
const meta = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ')

function taskNeed(t: BoardTask, v: PaneView, changes: Record<string, DiffFile[]>): PanelNeed {
  const base = { id: t.id, choices: [] as string[], actions: [] as PanelAction[] }
  if (t.status === 'review') {
    const answer = isAnswered(t)
    const files = (changes[t.id] ?? []).map(f => ({ file: f.file, added: f.added, removed: f.removed }))
    const add = files.reduce((n, f) => n + f.added, 0)
    const del = files.reduce((n, f) => n + f.removed, 0)
    return {
      ...base,
      kind: answer ? 'answer' : 'review',
      title: t.title,
      meta: meta(t.id, answer ? 'answer to read' : 'ready for review', tryWord(t)),
      ...(answer && t.answer ? { text: t.answer } : files.length ? { text: `+${add} −${del} in ${files.length} file${files.length === 1 ? '' : 's'} · tests passed` } : {}),
      ...(files.length ? { files } : {}),
      sinceMs: ms(t.runs?.[t.runs.length - 1]?.ended) ?? ms(t.updated_at),
      actions: actionsOf(t).filter(a => ['approve', 'done', 'keep-note', 'show-changes', 'reject', 'ask-more'].includes(a.id)),
    }
  }
  if (t.status === 'failed')
    return { ...base, kind: 'failed', title: t.title, meta: meta(t.id, 'failed', tryWord(t)), text: whyFailed(t), sinceMs: ms(t.updated_at), actions: actionsOf(t).filter(a => a.id === 'retry' || a.id === 'drop') }
  const a = taskAsks(t, v.max_minutes)
  return {
    ...base,
    kind: a?.overtime ? 'time' : a?.files.length ? 'files' : 'asks',
    title: a?.text ?? t.title,
    meta: meta(t.id, t.title, a?.overtime ? 'more time?' : a?.files.length ? 'asks for files' : 'question from the worker'),
    ...(a?.files.length ? { text: a.files.join(', ') } : {}),
    choices: a?.choices ?? [],
    sinceMs: ms(t.ask?.asked_at) ?? ms(t.updated_at),
  }
}

function panelTask(t: BoardTask, nowMs: number): PanelTask {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    word: statusWord(t, nowMs),
    kind: kindWord(t),
    role: roleOf(t),
    attempts: Number(t.attempts) || 0,
    ...(ms(t.updated_at) !== undefined ? { updatedMs: ms(t.updated_at)! } : {}),
    ...(t.note?.trim() ? { note: t.note.trim() } : {}),
    ...(t.details?.trim() ? { details: t.details.trim() } : {}),
    needsYou: needsYou(t, nowMs),
    actions: actionsOf(t),
  }
}

/** The kinds of history entry that are news for the owner. */
const NEWS_KINDS: ReadonlySet<string> = new Set(['created', 'merged', 'done', 'failed', 'checker-problems', 'rejected', 'approve-failed', 'stopped'])
/** How far back the stream's board news goes. */
export const NEWS_DAYS = 3
const NEWS_MAX = 80

function newsOf(tasks: readonly BoardTask[], nowMs: number): PanelNews[] {
  const from = nowMs - NEWS_DAYS * 86_400_000
  const out: PanelNews[] = []
  for (const t of tasks) {
    // a finished task's history is kept in its own part file; the board keeps only its marks (merged, failed)
    const lines = t.history?.length ? t.history : (viewMarks(t) ?? []).map(m => ({ kind: m.kind, at: m.at, text: m.reason ?? '' }))
    lines.forEach((h, i) => {
      const at = ms(h.at)
      if (at === undefined || at < from || !NEWS_KINDS.has(h.kind)) return
      const tone = isHistoryKind(h.kind) ? HISTORY_KINDS[h.kind] : 'other'
      out.push({ key: `${t.id}:${i}:${h.kind}`, task: t.id, title: t.title, tone: tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'other', kind: h.kind, text: h.text, atMs: at })
    })
  }
  return out.sort((a, b) => a.atMs - b.atMs).slice(-NEWS_MAX)
}

function panelLane(l: ReturnType<typeof liveLanes>[number]): PanelLane {
  return {
    id: l.id,
    title: l.title,
    kind: l.kind === 'change' ? '' : l.kind,
    stations: l.stations,
    at: l.at,
    skipped: l.skipped ?? [],
    ...(l.sinceMs !== undefined ? { sinceMs: l.sinceMs } : {}),
    tryNo: l.tryNo,
    tries: l.tries,
    ...(l.tokens ? { tokens: l.tokens } : {}),
    agent: l.agent,
    ...(l.done ? { doneMs: l.done.atMs } : {}),
  }
}

const startOfDay = (nowMs: number) => {
  const d = new Date(nowMs)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * The panel's view of published view `v` at `nowMs`. `changes` holds the changed files of each task in review (read
 * with git by the caller, see session.ts); `project` is the project folder's name.
 */
export function panelView(v: PaneView, o: { project: string; nowMs: number; changes?: Record<string, DiffFile[]> }): PanelView {
  const nowMs = o.nowMs
  const tasks = (v.tasks ?? []) as BoardTask[]
  const questions = (v.questions ?? []).filter(q => isOpenQuestion(q))
  const needs: PanelNeed[] = [
    ...questions.map((q): PanelNeed => ({ id: q.id, kind: 'question', title: q.text, meta: meta(q.id, 'question from the lead'), choices: [...q.options, 'Answer…'], actions: [], ...(ms(q.asked_at) !== undefined ? { sinceMs: ms(q.asked_at)! } : {}) })),
    ...tasks.filter(t => needsYou(t, nowMs)).sort(newestFirst as (a: SymccTask, b: SymccTask) => number).map(t => taskNeed(t, v, o.changes ?? {})),
  ]
  const view = { tasks, checker: v.checker, auto_retries: v.auto_retries, max_parallel: v.max_parallel, mode: v.mode, ...(v.archived_done ? { archived_done: v.archived_done } : {}) }
  const lanes = [...liveLanes(view, nowMs), ...liveFinishedLanes(view, nowMs)].map(panelLane)
  const open = tasks.filter(t => !isFinished(t) || (ms(t.updated_at) ?? 0) >= startOfDay(nowMs))
  const next = tasks.filter(t => t.status === 'todo').sort((a, b) => a.order - b.order)
  const scouts = (v.scouts ?? []).map(
    (s): PanelScout => ({
      name: s.name,
      ...(s.summary ? { summary: s.summary } : {}),
      every: onDemand(s) ? 'on demand' : everyText(s.every_minutes),
      running: !!s.running,
      paused: !!s.paused,
      ...(ms(s.last_run) !== undefined ? { lastRunMs: ms(s.last_run)! } : {}),
      ...(ms(s.next_run) !== undefined ? { nextRunMs: ms(s.next_run)! } : {}),
      ...(s.last_report ? { lastReport: s.last_report } : {}),
      ...(s.warning ? { warning: s.warning } : {}),
    }),
  )
  const off = v.on_here === false ? (v.off_here === 'new' ? 'symcc is not set up in this project yet.' : typeof v.off_here === 'string' ? v.off_here : 'symcc is off in this project.') : undefined
  return {
    on: v.on_here !== false,
    ...(off ? { off } : {}),
    project: o.project,
    branch: v.home_branch ?? '',
    mode: v.mode,
    modes: (['paused', 'review', 'auto'] as const).map(m => ({ mode: m, name: MODE_NAME[m], meaning: MODE_MEANING[m] })),
    maxParallel: v.max_parallel ?? 0,
    needs,
    lanes,
    next: next.map(t => panelTask(t, nowMs)),
    tasks: open.map(t => panelTask(t, nowMs)),
    news: newsOf(tasks, nowMs),
    scouts,
    counts: {
      needs: needs.length,
      running: lanes.filter(l => l.doneMs === undefined && l.stations[l.at] !== 'you').length,
      next: next.length,
      doneToday: tasks.filter(t => t.status === 'done' && (ms(t.updated_at) ?? 0) >= startOfDay(nowMs)).length,
      backlog: tasks.filter(t => t.status === 'backlog').length,
    },
    ...(v.branch_note ? { note: v.branch_note } : {}),
    nowMs,
  }
}
