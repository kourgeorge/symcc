// The board panel's view for the Cursor extension, worked out from the view each publish hands the host
// (app/lead.ts publish -> ui.panel.updateView): what needs the owner, the running lanes, the tasks, today's news and
// the scouts, in the board's own words. The webview only draws it; every rule about what a task needs lives in core/.
import type { SymccTask } from '../../types'
import type { PaneView } from '../../hooks/app/state'
import { type BoardTask, type DiffFile, type TaskAction, isAnswered, kindOf, isFinished, needsYou, newestFirst, taskAsks, taskActions, whyFailed, liveLanes, liveFinishedLanes, onDemand, everyText, shownStatus, roleOf, HISTORY_KINDS, isHistoryKind, MODE_NAME, MODE_MEANING, driveNoticeParts, showsDriveButton, DRIVE_HERE_LABEL, sizeText, type ChangeSize, type Seg, historyEvent, historyTime, taskReports } from '../../hooks/board'
import { DEFAULT_NAME } from '../../hooks/name'
import { sizeSegs } from '../../hooks/core/page-header'
import { checkerReportOf } from '../../hooks/core/task-sections'
import { isOpenQuestion } from '../../hooks/core/questions'
import { viewMarks } from '../../hooks/core/board-parts'
import { byRunOrder } from '../../hooks/core/board-file'
import { liveIdle, liveIdleFacts } from '../../hooks/core/live'
import { ORG_MEM_EMPTY, ORG_MEM_MAX_LINES, ORG_MEM_SUBTITLE, ORG_MEM_TITLE, orgMemAbout, orgMemDeleteAsk, orgMemNoteHead, orgMemNoteKey, orgMemTopicCounts, type OrgMemNote } from '../../hooks/core/org-mem'
import type { PanelAction, PanelActionId, PanelChecker, PanelFollows, PanelHistory, PanelIdle, PanelLane, PanelNeed, PanelNews, PanelOrgMem, PanelScout, PanelSession, PanelSize, PanelTask, PanelView } from './protocol'

const ms = (iso: unknown): number | undefined => {
  const n = typeof iso === 'string' ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** The task actions the panel has a button for (taskActions' others need the terminal: copy, role, watch). */
const PANEL_ACTIONS: ReadonlySet<string> = new Set<PanelActionId>(['approve', 'reject', 'done', 'keep-note', 'ask-more', 'retry', 'run-now', 'drop', 'pause', 'resume', 'show-changes', 'to-todo', 'merge-now'])

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

/** The agents that worked on task `t`, newest first: "Try 5", and "Try 4 (2)" for a try's second agent (a restart). */
export function taskSessions(t: BoardTask): PanelSession[] {
  const out: PanelSession[] = []
  ;(t.runs ?? []).forEach((r, i) => {
    const agents = (r.agents ?? []).filter((a): a is typeof a & { id: string } => typeof a.id === 'string' && !!a.id)
    agents.forEach((a, j) => out.push({ label: `Try ${i + 1}${agents.length > 1 ? ` (${j + 1})` : ''}${a.kind && a.kind !== 'worker' ? ` ${a.kind}` : ''}`, agent: a.id, running: !r.ended && !a.ended }))
  })
  return out.reverse()
}

/** The board's pieces of a size as the panel's: its added lines and its removed lines marked. */
const sizePieces = (segs: readonly Seg[]): PanelSize => segs.map(s => ({ text: s.text, ...(s.color === 'success' ? { tone: 'added' as const } : s.color === 'error' ? { tone: 'removed' as const } : {}) }))

/** A merged lane's size as the Live row ends with it: the lines added and removed, no files part. */
function laneSize(z: ChangeSize): PanelSize {
  const [added = '', removed = ''] = sizeText(z, false).split(' ')
  return sizePieces([{ text: added, color: 'success' }, { text: ' ', color: 'text' }, { text: removed, color: 'error' }])
}

/** The most history lines of a task the panel gets, newest first. */
export const HISTORY_SHOWN = 30
/** The most of a checker's report the panel gets; the rest is in its file. */
export const CHECKER_SHOWN_CHARS = 12_000

/** A task's history, newest first, each line with who wrote it, as the task page draws it (core/task-sections.ts historyLines). */
function panelHistory(t: BoardTask, nowMs: number): PanelHistory[] {
  return t.history
    .slice(-HISTORY_SHOWN)
    .reverse()
    .map(h => {
      const e = historyEvent(h)
      const at = historyTime(e.at, nowMs)
      return { mark: e.mark, tone: e.tone, said: e.said, ...(at ? { at } : {}), ...(e.by ? { by: e.by } : {}), ...(e.label ? { label: e.label } : {}), ...(e.result ? { result: e.result } : {}) }
    })
}

/** The checker's report a task's page shows: the latest checker's of the try its latest report is about. */
export const checkerOf = (t: SymccTask) => checkerReportOf(t, taskReports(t).at(-1)?.try ?? t.attempts)

function panelChecker(t: BoardTask, texts: Record<string, string>): PanelChecker | undefined {
  const c = checkerOf(t)
  if (!c) return undefined
  const text = texts[c.file]?.trimEnd()
  const cut = text !== undefined && text.length > CHECKER_SHOWN_CHARS
  return { title: `Checker (try ${c.try})${c.agent ? ` · ${c.agent}` : ''}`, ok: c.ok, file: c.file, text: text === undefined ? null : cut ? text.slice(0, CHECKER_SHOWN_CHARS) : text, ...(cut ? { cut } : {}) }
}

function panelTask(t: BoardTask, nowMs: number, checkers: Record<string, string> = {}): PanelTask {
  const size = sizeSegs(t)
  const checker = panelChecker(t, checkers)
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
    ...(t.done?.trim() ? { done: t.done.trim() } : {}),
    ...(size ? { size: sizePieces(size) } : {}),
    ...(t.history?.length ? { history: panelHistory(t, nowMs), historyCount: t.history.length } : {}),
    ...(checker ? { checker } : {}),
    needsYou: needsYou(t, nowMs),
    actions: actionsOf(t),
    sessions: taskSessions(t),
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
      // a long command in it (the test command that failed) is the board's own setting, not news
      const why = typeof (h as { result?: unknown }).result === 'string' ? (h as { result: string }).result.replace(/`[^`]{60,}`/g, '`…`') : undefined
      out.push({ key: `${t.id}:${i}:${h.kind}`, task: t.id, title: t.title, tone: tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'other', kind: h.kind, text: h.text, atMs: at, ...(why ? { why } : {}) })
    })
  }
  return out.sort((a, b) => a.atMs - b.atMs).slice(-NEWS_MAX)
}

function panelLane(l: ReturnType<typeof liveLanes>[number], t: BoardTask | undefined): PanelLane {
  const now = t ? taskSessions(t).find(x => x.running) : undefined
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
    ...(now ? { agentId: now.agent } : {}),
    ...(l.done ? { doneMs: l.done.atMs } : {}),
    ...(l.done && l.size ? { size: laneSize(l.size) } : {}),
  }
}

function panelOrgMem(notes: OrgMemNote[], file: string): PanelOrgMem {
  return {
    file,
    max: ORG_MEM_MAX_LINES,
    title: ORG_MEM_TITLE,
    subtitle: ORG_MEM_SUBTITLE,
    about: orgMemAbout(file),
    empty: ORG_MEM_EMPTY,
    topics: orgMemTopicCounts(notes),
    notes: notes.map(x => ({ ...x, key: orgMemNoteKey(x.text), head: orgMemNoteHead(x), ask: orgMemDeleteAsk(x, file) })),
  }
}

function panelIdle(view: Parameters<typeof liveIdleFacts>[0], nowMs: number): PanelIdle {
  const f = liveIdleFacts(view, nowMs)
  const hint = f.kind === 'done' ? liveIdle(view, nowMs, Infinity)[1] : undefined
  return { kind: f.kind, text: f.text, ...(hint ? { hint } : {}), next: f.next, more: f.more }
}

/** Another window drives the board and this one is on: the board's notice and its Drive here button; none while this
 *  window drives, and none before the first publish says (driving unknown). */
function followsOf(v: PaneView, name: string, nowMs: number): PanelFollows | undefined {
  if (!showsDriveButton(v, v.driving ?? true)) return undefined
  return { parts: driveNoticeParts(v.tasks ?? [], nowMs, name, Infinity, v.driver), button: DRIVE_HERE_LABEL.replace(/\s*\(\w\)$/, ''), command: `${name}-drive` }
}

const startOfDay = (nowMs: number) => {
  const d = new Date(nowMs)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * The panel's view of published view `v` at `nowMs`. `changes` holds the changed files of each task in review (read
 * with git by the caller, see session.ts); `project` is the project folder's name; `name` the plugin's (its commands'
 * prefix); `orgMem` org-mem's notes and file (hooks/app/org-mem.ts orgMemNow, also read by the caller); `checkers` the
 * texts of the checker reports (checkerOf) read so far, by file.
 */
export function panelView(v: PaneView, o: { project: string; dir: string; nowMs: number; name?: string; changes?: Record<string, DiffFile[]>; orgMem?: { notes: OrgMemNote[]; file: string }; checkers?: Record<string, string> }): PanelView {
  const nowMs = o.nowMs
  const follows = followsOf(v, o.name ?? DEFAULT_NAME, nowMs)
  const tasks = (v.tasks ?? []) as BoardTask[]
  const questions = (v.questions ?? []).filter(q => isOpenQuestion(q))
  const needs: PanelNeed[] = [
    ...questions.map((q): PanelNeed => ({ id: q.id, kind: 'question', title: q.text, meta: meta(q.id, 'question from the lead'), choices: [...q.options, 'Answer…'], actions: [], ...(ms(q.asked_at) !== undefined ? { sinceMs: ms(q.asked_at)! } : {}) })),
    ...tasks.filter(t => needsYou(t, nowMs)).sort(newestFirst as (a: SymccTask, b: SymccTask) => number).map(t => taskNeed(t, v, o.changes ?? {})),
  ]
  const view = { tasks, checker: v.checker, auto_retries: v.auto_retries, max_parallel: v.max_parallel, mode: v.mode, ...(v.archived_done ? { archived_done: v.archived_done } : {}) }
  const byId = new Map(tasks.map(t => [t.id, t]))
  const lanes = [...liveLanes(view, nowMs), ...liveFinishedLanes(view, nowMs)].map(l => panelLane(l, byId.get(l.id)))
  const open = tasks.filter(t => !isFinished(t) || (ms(t.updated_at) ?? 0) >= startOfDay(nowMs))
  const next = tasks.filter(t => t.status === 'todo').sort(byRunOrder)
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
    next: next.map(t => panelTask(t, nowMs, o.checkers)),
    tasks: open.map(t => panelTask(t, nowMs, o.checkers)),
    news: newsOf(tasks, nowMs),
    scouts,
    counts: {
      needs: needs.length,
      running: lanes.filter(l => l.doneMs === undefined && l.stations[l.at] !== 'you').length,
      next: next.length,
      doneToday: tasks.filter(t => t.status === 'done' && (ms(t.updated_at) ?? 0) >= startOfDay(nowMs)).length,
      backlog: tasks.filter(t => t.status === 'backlog').length,
    },
    idle: panelIdle(view, nowMs),
    orgMem: panelOrgMem(o.orgMem?.notes ?? [], o.orgMem?.file ?? `${o.dir}/org-mem.md`),
    ...(v.branch_note ? { note: v.branch_note } : {}),
    ...(follows ? { follows } : {}),
    dir: o.dir,
    nowMs,
  }
}
