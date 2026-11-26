// /<name>-tasks (T-901): the open tasks as a short list for the chat, the same in every client. Grouped like the board:
// Questions for you and NEEDS YOU first, then what runs, what is in review, what failed and what is to do (in run order),
// then one line of counts and a hint. One line per task: mark, id, short state, title (cut to fit).
import { DEFAULT_NAME } from '../name'
import { type Board, type BoardTask } from './board-file'
import { openAfter } from './archive'
import { cutTitle, padWidth, textWidth } from './width'
import { boardSections, localOffset } from './days'
import { panelSections, rowMark, rowCell, MORE_TIME_CELL, SECTION_LABEL } from './panel'
import { asksMoreTime } from './commands'
import { openQuestions, questionLine, questionsLabel } from './questions'

/** The line /<name>-tasks prints when no task is open. */
export const NO_OPEN_TASKS = 'No open tasks.'

/** The last line of /<name>-tasks: where to go next. */
export const tasksHint = (name: string = DEFAULT_NAME) => `/${name}-board opens the board · /${name}-task T-n opens one task`

/** The line of counts under the list: "backlog 3 · done today 2 · dropped today 0". */
export function tasksCounts(b: Pick<Board, 'tasks'>, nowMs: number, offsetMin: number = localOffset(nowMs)): string {
  const s = boardSections(b.tasks, nowMs, offsetMin)
  const done = s.today.filter(t => t.status === 'done').length
  const dropped = s.today.filter(t => t.status === 'dropped').length
  return `backlog ${s.backlog.length} · done today ${done} · dropped today ${dropped}`
}

/** A task's short state on the list: its time (with "↺n" from the second try) while it runs, "waiting",
 *  "more time?", "review", "failed", "paused", "to do", or "after T-3" for a task to do that waits for open tasks. */
function stateOf(t: BoardTask, all: readonly BoardTask[], nowMs: number, group: string): string {
  if (asksMoreTime(t)) return MORE_TIME_CELL
  if (group === 'run') {
    const cell = rowCell(t, nowMs)
    const n = Number(t.attempts)
    const tries = n > 1 ? `↺${n}` : ''
    return [cell, tries].filter(Boolean).join(' ')
  }
  if (t.status === 'todo' || t.status === 'paused') {
    const open = openAfter({ tasks: all, archived_done: t.after }, t)
    if (open.length) return `${t.status === 'paused' ? 'paused, ' : ''}after ${open.join(', ')}`
    return t.status === 'paused' ? 'paused' : 'to do'
  }
  return t.status === 'waiting' ? 'waiting' : t.status
}

/**
 * The open tasks of board `b` as chat text (see the file's top): `width` columns at most per line. An empty board
 * (no open task) lists only "No open tasks." and the counts line, then the hint.
 */
export function tasksListText(b: Board, nowMs: number, name: string = DEFAULT_NAME, width = 80, offsetMin: number = localOffset(nowMs)): string {
  const p = panelSections(b.tasks, nowMs, offsetMin)
  const groups: { label: string; key: string; tasks: BoardTask[] }[] = [
    { label: SECTION_LABEL.needsYou, key: 'you', tasks: p.needsYou.filter(t => t.status !== 'review' && t.status !== 'failed') },
    { label: 'Running', key: 'run', tasks: p.doing },
    { label: 'In review', key: 'review', tasks: p.needsYou.filter(t => t.status === 'review') },
    { label: 'Failed', key: 'failed', tasks: p.needsYou.filter(t => t.status === 'failed') },
    { label: 'To do', key: 'todo', tasks: p.todo },
  ].filter(g => g.tasks.length)
  const asks = openQuestions(b)
  const out: string[] = []
  if (asks.length) {
    out.push(questionsLabel(asks.length))
    for (const q of asks) out.push(cutTitle(`  ? ${questionLine(q)}`, width))
  }
  const rows = groups.flatMap(g => g.tasks.map(t => ({ t, g: g.key, state: stateOf(t, b.tasks, nowMs, g.key) })))
  const idW = Math.max(0, ...rows.map(r => r.t.id.length))
  const stateW = Math.max(0, ...rows.map(r => textWidth(r.state)))
  for (const g of groups) {
    if (out.length) out.push('')
    out.push(`${g.label} (${g.tasks.length})`)
    for (const r of rows.filter(r => r.g === g.key)) {
      const lead = `  ${rowMark(r.t, nowMs)} ${r.t.id.padEnd(idW)}  ${padWidth(r.state, stateW)}  `
      out.push(lead + cutTitle(r.t.title, Math.max(8, width - textWidth(lead))))
    }
  }
  if (!rows.length) {
    if (out.length) out.push('')
    out.push(NO_OPEN_TASKS)
  }
  out.push('', tasksCounts(b, nowMs, offsetMin), tasksHint(name))
  return out.join('\n')
}
