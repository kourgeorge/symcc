// T-1101: the one short, chat-friendly text shape (used while the owner writes from a chat app, S.chat): the tasks list,
// the Live status, the no-panel board and one task's page. Plain lines only: no padded columns, rules, bars or box
// characters; one task per line ("T-5 running: test, try 2, 12m: title"); a question is its own line with its choices
// numbered under it, never dropped (a very long one is cut with …); each text at most CHAT_MAX characters, cut at a line end with a "+N more" line.
import type { SymccTask } from '../../types'
import { type BoardTask, isFinished, STATUS_WORD } from './board-file'
import { boardSections, localOffset } from './days'
import { panelSections, rowCell } from './panel'
import { taskAsks } from './panel'
import { asksMoreTime, needsYou } from './commands'
import { openQuestions, type OwnerQuestion } from './questions'
import { checkStepNow } from './lead'
import { STEP_WORD } from './panel'
import { fromText } from './origin'
import { historyLineText } from './history'
import { liveToday, todayMore, type TodayTeam } from './live'
import { fmtDuration, fmtTokens } from './runs'
import type { OrgMemNote } from './org-mem'

/** The most characters one chat text has. */
export const CHAT_MAX = 3500
/** A task's title is cut to this many characters on its line. */
const TITLE_MAX = 70
/** The What to do and the report parts are cut to this many characters. */
const PART_MAX = 600

/** `s` as one plain line: marks other than ✓ ✗ ▶ ? ↺ dropped, spaces squeezed, any ".symcc/" path made a plain word. */
export function plain(s: string): string {
  return s
    .replace(/\S*\.symcc\/\S*/g, 'a saved file')
    .replace(/[𝄞♟◆◇‖⧗⊛✎⌕⇢⏵⏸✧⌀⏱Σ•●○◉◎─━│┃┌┐└┘├┤┬┴┼▍▕▏█▁▂▃▄▅▆▇]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `s` as one plain line, cut with … when longer than `n`. */
export const cut = (s: string, n: number): string => {
  const p = plain(s)
  return p.length > n ? `${p.slice(0, n - 1).trimEnd()}…` : p
}

/** Page `page` of `lines`: each page fits CHAT_MAX characters (cut at a line end), then "+N more: <more>" when lines are left for later pages. */
export function fitChat(lines: readonly string[], more: string, page = 1): string {
  const room = CHAT_MAX - 60
  const all = lines.map(l => l.trimStart()).map(l => (l.length > room ? `${l.slice(0, room - 1).trimEnd()}…` : l))
  if (page <= 1 && all.join('\n').length <= CHAT_MAX) return all.join('\n')
  const pages: string[][] = [[]]
  let used = 0
  for (const l of all) {
    if (used + l.length + 1 > room && pages[pages.length - 1]!.length) {
      pages.push([])
      used = 0
    }
    pages[pages.length - 1]!.push(l)
    used += l.length + 1
  }
  const n = Math.max(1, Math.floor(page))
  if (n > pages.length) return 'Nothing more.'
  const left = pages.slice(n).reduce((x, p) => x + p.length, 0)
  return [...pages[n - 1]!, ...(left ? [`+${left} more: ${more}`] : [])].join('\n')
}

/** A question is cut to this many characters, and each of its choices to CHOICE_MAX (cut with …, never dropped). */
const ASK_MAX = 800
const CHOICE_MAX = 300

/** A question as lines: the question on one line, its choices numbered under it. A long text is cut with …; no choice is dropped. */
export function askLines(text: string, choices: readonly string[]): string[] {
  return [`? ${cut(text, ASK_MAX)}`, ...choices.map((c, i) => `${i + 1}. ${cut(c, CHOICE_MAX)}`)]
}

type TaskView = { tasks: SymccTask[]; questions?: readonly (Pick<OwnerQuestion, 'id' | 'text' | 'answered_at' | 'dropped'> & { options?: string[] })[] }

/** A task's short word on its line: "running: test, try 2, 12m" is made by runningState; here the rest. */
function stateWord(t: BoardTask, all: readonly SymccTask[]): string {
  if (asksMoreTime(t)) return 'needs more time?'
  if (t.status === 'review') return 'review'
  if (t.status === 'todo' || t.status === 'paused') {
    const open = (t.after ?? []).filter(id => all.some(x => x.id === id && !isFinished(x)))
    if (open.length) return `${t.status === 'paused' ? 'paused, ' : ''}waiting for ${open.join(', ')}`
    return t.status === 'paused' ? 'paused' : 'to do'
  }
  return t.status
}

/** "test, try 2, 12m": the step, the try (from the second) and the time of a running task. */
function runningState(t: BoardTask, nowMs: number): string {
  const step = checkStepNow(t, nowMs)
  const n = Number(t.attempts)
  const time = plain(rowCell(t, nowMs))
  return [step ? STEP_WORD[step] : '', n > 1 ? `try ${n}` : '', step || n > 1 || !/^0s?$/.test(time) ? time : 'starting'].filter(Boolean).join(', ')
}

/** The choices of a task's question: the real ones only (not the board's "answer here" extras). */
function askChoices(t: BoardTask, a: ReturnType<typeof taskAsks>): string[] {
  if (!a || a.overtime) return a?.choices ?? []
  return t.ask?.lead?.options?.length ? t.ask.lead.options : (t.ask?.options ?? [])
}

/** One task: its line, then (while it waits for an answer) its question and numbered choices. */
function taskLines(t: BoardTask, all: readonly SymccTask[], nowMs: number, running = false): string[] {
  const detail = running ? runningState(t, nowMs) : ''
  const head = `${t.id} ${running ? 'running' : stateWord(t, all)}: ${detail ? `${detail}: ` : ''}${cut(t.title, TITLE_MAX)}`
  const out = [head]
  if (needsYou(t, nowMs) && (t.status === 'waiting' || asksMoreTime(t))) {
    const a = taskAsks(t)
    if (a) out.push(...askLines(a.text, askChoices(t, a)))
  }
  return out
}

/** The groups of an open board as lines: Needs you (questions and waiting tasks), Running, Review, Failed, Waiting, To do. */
function groupLines(view: TaskView, nowMs: number, offsetMin: number): { groups: { label: string; lines: string[] }[]; lines: string[]; backlog: number; doneToday: number } {
  const p = panelSections(view.tasks as BoardTask[], nowMs, offsetMin)
  const all = view.tasks
  const asks = openQuestions(view)
  const you = p.needsYou.filter(t => t.status !== 'review' && t.status !== 'failed')
  const waiting = p.todo.filter(t => stateWord(t, all).includes('waiting for'))
  const groups: { label: string; lines: string[] }[] = [
    { label: 'Needs you', lines: [...asks.flatMap(q => [`${q.id} question:`, ...askLines(q.text, q.options ?? [])]), ...you.flatMap(t => taskLines(t, all, nowMs))] },
    { label: 'Running', lines: p.doing.filter(t => !you.includes(t)).flatMap(t => taskLines(t, all, nowMs, true)) },
    { label: 'Review', lines: p.needsYou.filter(t => t.status === 'review').flatMap(t => taskLines(t, all, nowMs)) },
    { label: 'Failed', lines: p.needsYou.filter(t => t.status === 'failed').flatMap(t => taskLines(t, all, nowMs)) },
    { label: 'Waiting', lines: waiting.flatMap(t => taskLines(t, all, nowMs)) },
    { label: 'To do', lines: p.todo.filter(t => !waiting.includes(t)).flatMap(t => taskLines(t, all, nowMs)) },
  ].filter(g => g.lines.length)
  const lines: string[] = []
  for (const g of groups) lines.push(...(lines.length ? [''] : []), g.label, ...g.lines)
  const s = boardSections(view.tasks, nowMs, offsetMin)
  return { groups, lines, backlog: s.backlog.length, doneToday: s.today.filter(t => t.status === 'done').length }
}

/** The open tasks as chat text (the tasks list and, with `mode`, the no-panel board). */
export function chatTasksText(view: TaskView, nowMs: number, offsetMin: number = localOffset(nowMs), mode = '', page = 1): string {
  const g = groupLines(view, nowMs, offsetMin)
  const lines = g.lines.length ? g.lines : ['No open tasks.']
  const tail = ['', ...(mode ? [`Mode: ${plain(mode)}`] : []), `Backlog: ${g.backlog} ideas`, `Done today: ${g.doneToday}`, "Say: status, show T-5, more tasks"]
  return fitChat([...lines, ...tail], "say 'more tasks'", page).replace(/\n{3,}/g, '\n\n')
}

/** Tasks picked by a filter as chat lines (one per task), with how many matched. */
export function chatRowsText(tasks: readonly SymccTask[], all: readonly SymccTask[], nowMs: number, count: string, page = 1): string {
  const lines = tasks.flatMap(t => taskLines(t as BoardTask, all, nowMs, t.status === 'doing'))
  return fitChat([...(lines.length ? lines : ['No tasks match.']), '', plain(count)], "say 'more tasks'", page)
}

/** The Live status as chat text: Needs you, each running task, one Today line and one Org-mem line. */
export function chatStatusText(view: TaskView & { today_team?: TodayTeam }, notes: readonly OrgMemNote[], nowMs: number, offsetMin: number = localOffset(nowMs), page = 1): string {
  const g = groupLines(view, nowMs, offsetMin)
  const lines = g.groups.filter(x => x.label === 'Needs you' || x.label === 'Running').flatMap((x, i) => [...(i ? [''] : []), x.label, ...x.lines])
  const d = liveToday(view.tasks, nowMs, offsetMin)
  const work = todayMore(view.tasks, view.today_team, nowMs, offsetMin).workMs
  const today = `Today: ${d.merged} merged, ${fmtTokens(d.tokens)} tokens, ${fmtDuration(work)} work`
  return fitChat([...(lines.length ? lines : ['Nothing needs you or runs now.']), '', today, `Org-mem: ${notes.length} notes`, 'Say: tasks, show T-5'], "say 'more status'", page)
}

/** What a task page reads of the latest saved report. */
export type ChatReport = { try: number; text: string | null }

const cutPart = (s: string, n: number): string => {
  const lines = s.trim().split('\n').map(l => plain(l)).filter((l, i, a) => l || (i && a[i - 1]))
  const joined = lines.join('\n')
  return joined.length > n ? `${joined.slice(0, n).trimEnd()}…` : joined
}

/** One task's page as chat text. */
export function chatTaskText(t: SymccTask, report: ChatReport | null | undefined, nowMs: number, page = 1): string {
  const L =[`${t.id}: ${plain(t.title)}`]
  const changed = historyLineText({ at: t.updated_at } as never, nowMs).split('  ')[0]
  L.push(`Status: ${STATUS_WORD[t.status]}${Number(t.attempts) > 0 ? `, try ${t.attempts}` : ''}${changed ? `, changed ${changed}` : ''}`)
  L.push(t.origin?.why ? `Why: ${plain(t.origin.why)}` : plain(fromText(t, 100)))
  if (t.status === 'waiting' && t.ask?.text) L.push(...askLines(taskAsks(t as BoardTask)?.text ?? t.ask.text, askChoices(t as BoardTask, taskAsks(t as BoardTask))))
  L.push('What to do:', t.details.trim() ? cutPart(t.details, PART_MAX) : '(no details)')
  if (t.history.length) L.push('Last events:', ...t.history.slice(-5).reverse().map(h => plain(historyLineText(h, nowMs))))
  if (report?.text) L.push(`Report (try ${report.try}):`, cutPart(report.text, PART_MAX))
  L.push("Say: approve, reject, tasks")
  return fitChat(L.join('\n').split('\n'), `say 'more ${t.id}'`, page)
}
