// T-1103: the board as one self-contained page (.symcc/board.html): inline CSS only, no script, no outside files or
// links, readable on a phone, light and dark with the system. Order: Needs you (questions with their whole choices,
// reviews, failed with why), Running, To do (next first), Done today (with the merge commit), then the counts.
// Every text from the board is HTML-escaped. The words and marks are the board's own (STATUS_WORD, statusMark).
import type { SymccTask } from '../../types'
import { type BoardTask, STATUS_WORD } from './board-file'
import { askChoices, plain, runningState, stateWord } from './chat-text'
import { asksMoreTime } from './commands'
import { shortSha, taskCommits } from './commits'
import { statusMark } from './details'
import { localOffset } from './days'
import { fromText } from './origin'
import { panelSections, projectTag, taskAsks } from './panel'
import { openQuestions, type OwnerQuestion } from './questions'
import { escapeHtml as E } from './stats-html'

/** The first this many characters of a task's details are its "what to do". */
const TODO_MAX = 300

const CSS = `:root{--bg:#f6f7fa;--fg:#1c2230;--muted:#667085;--card:#fff;--line:#dfe3ea;--amber:#b25e00;--red:#c0262d;--blue:#1f5fbf;--green:#1a7f42;--purple:#7a3fc0}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e6e9f0;--muted:#98a0b3;--card:#1b2029;--line:#2b3240;--amber:#f0a040;--red:#ff7b80;--blue:#6aa5ff;--green:#4cc27a;--purple:#b98cff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:12px}h1{font-size:1.3rem;margin:.2em 0;overflow-wrap:anywhere}h2{font-size:1.05rem;margin:1.2em 0 .4em;border-bottom:1px solid var(--line);padding-bottom:.2em}
.task{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:6px 0;overflow-wrap:anywhere}
.head{font-weight:600}.mark{display:inline-block;min-width:1.2em}.meta{color:var(--muted);font-size:.85rem}
.ask{margin:.4em 0;font-weight:600}ol{margin:.2em 0 .2em 1.4em;padding:0}.todo{margin:.3em 0 0;white-space:pre-wrap}
.s-waiting{border-left:4px solid var(--amber)}.s-failed{border-left:4px solid var(--red)}.s-review{border-left:4px solid var(--purple)}.s-doing{border-left:4px solid var(--blue)}.s-done{border-left:4px solid var(--green)}
.muted{color:var(--muted)}code{font-family:ui-monospace,Menlo,monospace}`

/** One task as a card: mark, id, title; its state; kind and who asked; the question with numbered choices; a short "what to do". */
function card(t: BoardTask, all: readonly SymccTask[], nowMs: number, opts: { running?: boolean; ask?: boolean; why?: boolean; commit?: boolean } = {}): string {
  const state = opts.running ? `${STATUS_WORD.doing}: ${runningState(t, nowMs)}` : t.status === 'waiting' || t.status === 'failed' || t.status === 'review' || t.status === 'done' ? STATUS_WORD[t.status] : stateWord(t, all)
  const meta = [state, projectTag(t), t.kind ? `kind: ${t.kind}` : '', plain(fromText(t, 80))].filter(Boolean).join(' · ')
  const a = opts.ask ? taskAsks(t) : null
  const ask = a ? `<div class="ask">${E(a.text)}</div><ol>${askChoices(t, a).map(c => `<li>${E(c)}</li>`).join('')}</ol>` : ''
  const why = opts.why && t.note ? `<div class="meta">why: ${E(t.note)}</div>` : ''
  const sha = opts.commit ? taskCommits(t).find(c => c.merged) : undefined
  const commit = sha ? `<div class="meta">merged <code>${E(shortSha(sha.sha))}</code></div>` : ''
  const todo = (t.details ?? '').trim()
  const short = todo.length > TODO_MAX ? `${todo.slice(0, TODO_MAX).trimEnd()}…` : todo
  return `<div class="task s-${E(t.status)}"><div class="head"><span class="mark">${E(statusMark(t))}</span>${E(t.id)} ${E(t.title)}</div><div class="meta">${E(meta)}</div>${ask}${why}${commit}${short ? `<div class="todo">${E(short)}</div>` : ''}</div>`
}

const section = (title: string, cards: string[]) => (cards.length ? `<h2>${E(title)} (${cards.length})</h2>${cards.join('')}` : '')

/** The board as one HTML page. `project` is the folder's name, for the title. */
export function boardHtml(view: { tasks: SymccTask[]; questions?: readonly (Pick<OwnerQuestion, 'id' | 'text' | 'answered_at' | 'dropped'> & { options?: string[] })[] }, project: string, nowMs: number, offsetMin: number = localOffset(nowMs)): string {
  const all = view.tasks
  const p = panelSections(all as BoardTask[], nowMs, offsetMin)
  const asking = (t: BoardTask) => t.status === 'waiting' || asksMoreTime(t)
  const you = p.needsYou
  const questions = openQuestions(view).map(q => `<div class="task s-waiting"><div class="head"><span class="mark">?</span>${E(q.id)}</div><div class="ask">${E(q.text)}</div><ol>${(q.options ?? []).map(c => `<li>${E(c)}</li>`).join('')}</ol></div>`)
  const needs = [...questions, ...you.map(t => card(t, all, nowMs, { ask: asking(t), why: t.status === 'failed' }))]
  const body = [
    section('Needs you', needs),
    section('Running', p.doing.filter(t => !you.includes(t)).map(t => card(t, all, nowMs, { running: true }))),
    section('To do', p.todo.map(t => card(t, all, nowMs))),
    section('Done today', p.doneToday.map(t => card(t, all, nowMs, { commit: true }))),
  ].join('')
  const counts = `<h2>Counts</h2><div class="task">Backlog: ${p.backlog.length} · Done: ${p.done.length} · Dropped: ${p.dropped.length}</div>`
  const empty = body ? '' : '<p class="muted">No open tasks.</p>'
  const title = `${project} board`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(title)}</title><style>${CSS}</style></head><body><main><h1>${E(title)}</h1>${empty}${body}${counts}</main></body></html>\n`
}
