// The lead's questions for the owner on the board (see core/questions.ts): the lead's question tool, and the
// owner's answer from the board panel's question page.
import { type Board, type BoardTask, type OwnerQuestion, type QuestionClose, addQuestion, answerQuestion, dropQuestion, normQid, questionsText, closedText, boardAnswerLine, openQuestions, questionsForYou, QUESTION_MAX, QUESTION_OPTIONS, OPTION_MAX, taskAsks, asksOwner, isAnswered, find } from '../board'
import { clean, squash } from '../core/text'
import { S } from './state'
import type { Host } from '../host'
import { change, load, now, findRoot, isOn } from './store'
import { tellLead, noteForLead, brief } from './tell'
import { sayQuestion } from './voice'
import { runTool, allowAskedFiles, refuseAskedFiles } from './tools'

type In = Record<string, unknown>

/** The pop-up option that sends the owner to the board for the options it can't show: not an answer (T-579). */
export const REST_ON_BOARD = 'the rest on the board'

/** Does pop-up answer `a` pick REST_ON_BOARD (alone, or among a multi-select's comma-joined picks)? Then it is no answer. */
const restOnBoard = (a: string) => a.split(',').some(p => squash(p).toLowerCase() === REST_ON_BOARD)

/** How the lead offers n options in the chat: with the host's pop-up question tool (it takes at most 4, so with
 *  more the first 3 plus "the rest on the board"), or as numbered plain chat text when the host has none (T-570). */
export const optionsVia = (n: number): string =>
  S.W.askPopup
    ? `with ${S.W.askPopup}${n > 4 ? ` (it takes at most 4 options: show the first 3 plus "${REST_ON_BOARD}", or the owner types one under Other)` : ''}`
    : 'as numbered plain chat text'

/** After "If they answer on the board first …": with a pop-up, one whose header is task `id` is tied to its board question (T-579); '' with none. */
export const popupTied = (id: string): string =>
  S.W.askPopup
    ? ` Set the ${S.W.askPopup} question's header to exactly ${id}: ${S.N.name} then ties the pop-up to ${id}'s board question, so whichever the owner answers first closes the other. A board answer comes back as the pop-up's answer; a pop-up answer is put into ${id} for you (the tool result says what was done, and what is left for you).`
    : ''

/** The question tool's actions. */
export const QUESTION_ACTIONS = ['add', 'list', 'answer', 'drop'] as const

/** "(1 more question open)" after a close, or '' when none is left. */
const stillOpen = (b: Board) => {
  const n = openQuestions(b).length
  return n ? ` (${questionsForYou(n)} still open)` : ''
}

/** The lead's question tool: add, list, answer (the owner answered in the chat) or drop a question for the owner. */
export async function questionTool(host: Host, a: In): Promise<string> {
  const action = typeof a.action === 'string' && a.action.trim() ? a.action.trim() : 'list'
  if (action === 'list') return questionsText(await load(host))
  if (action === 'add') {
    const [q, b] = await change(host, x => {
      const [y, q] = addQuestion(x, a.text, a.options, now())
      return [y, [q, y]] as [Board, [typeof q, Board]]
    })
    sayQuestion(host, b, q.id)
    if (S.W.askPopup)
      return `added ${q.id} "${q.text}" with the options ${q.options.join(' | ')} (the owner can also type their own). It shows on the board under "Questions for you" until it is answered. Ask it briefly in the chat too, offering the options ${optionsVia(q.options.length)}, with the same question text: ${S.N.name} ties that pop-up to ${q.id}, so whichever the owner answers first closes the other, and a board answer comes back as the pop-up's answer. (Next time just ask with ${S.W.askPopup}: it puts the question on the board by itself.)`
    return `added ${q.id} "${q.text}" with the options ${q.options.join(' | ')} (the owner can also type their own). It shows on the board under "Questions for you" until it is answered. Ask it briefly in the chat too, offering the options ${optionsVia(q.options.length)}, plus "or answer on the board". If the owner answers in the chat, close it with ${S.N.name} question action answer, id ${q.id} and their answer; a board answer reaches you at once in a board update ("The owner answered your question ${q.id} …: … Act on it.").`
  }
  if (action === 'answer' || action === 'drop') {
    const id = normQid(a.id)
    if (!id) throw new Error(`id is missing: the question, e.g. Q-3 (see ${S.N.name} question with action list)`)
    const [r, b] = await change(host, x => {
      const [y, r] = action === 'answer' ? answerQuestion(x, id, a.answer, 'chat', now()) : dropQuestion(x, id, now())
      return [y, [r, y]] as [Board, [QuestionClose, Board]]
    })
    if (!r.closed) return `${r.q.id} was already closed (${closedText(r.q)}); nothing changed.${r.q.answered_by === 'board' ? ' Use that answer and tell the owner it was taken.' : ''}`
    return action === 'answer' ? `${r.q.id} closed with the owner's answer: "${r.q.answer}"${stillOpen(b)}` : `${r.q.id} dropped; it is off the board${stillOpen(b)}`
  }
  throw new Error(`unknown action "${action}": use one of ${QUESTION_ACTIONS.join(', ')}`)
}

/**
 * The owner answered question `id` on the board (a choice button or their own words): it is closed, and a board
 * update goes to the lead right away (like a finished task), with the answer in its own "act on it" block. What to
 * show the owner, in a toast.
 */
export async function answerOnBoard(host: Host, id: string, answer: string): Promise<string> {
  const text = answer.trim()
  if (!text) throw new Error('type an answer first')
  const r = await change(host, x => answerQuestion(x, id, text, 'board', now()))
  if (!r.closed) return `${r.q.id} was already closed (${closedText(r.q)})`
  // the lead's pop-up asks this very question: it gets the answer (and closes), so no board update as well
  const q = r.q
  if (boardAnswered(q.id, q.answer ?? text, () => tellLead(host, boardAnswerLine(q)))) return `${r.q.id} answered: ${r.q.answer}; the lead's pop-up got it`
  tellLead(host, boardAnswerLine(r.q))
  return `${r.q.id} answered: ${r.q.answer}; the lead will take it from here`
}

// ---------------------------------------------------------------------------------------------------------------
// T-579: the lead's pop-up question (AskUserQuestion in Claude Code) also goes on the board. Each question of the
// call is tied to a board question: the task's own one when it names a task waiting for the owner (a review, an
// answered investigation, a worker's question or file request, more time), else a Q-n (the lead's own open one with
// the same text, or a new one). Whichever the owner answers first closes the other: board answers are returned as
// the pop-up's answer (the open dialog then closes); a pop-up answer closes the Q-n or is put into the task.

/** One question of a pop-up call, as the host's tool takes it (Claude Code's AskUserQuestion input). */
type PopupQuestion = { question: string; header?: string; options?: { label?: unknown }[] }

/** A pop-up question's board question: a Q-n, or task `id`'s own question. */
type PopupLink = { kind: 'question' | 'task'; id: string }

/** The pop-ups open now, by the board question they are tied to (Q-3, T-5): each takes the board's answer, and the
 *  usual lead update for it, sent only if the pop-up ends without passing the answer on (the dialog was ended). */
const popupWaits = new Map<string, (answer: string, tell: () => void) => void>()

/**
 * The owner answered board question `id` (a Q-n, or a task's own question: T-5) on the board with `answer`: an open
 * pop-up tied to it gets that answer. Whether one was waiting (then the lead reads the answer there). `tell` sends
 * the lead the usual board update instead; the pop-up runs it (once) if it ends without a result, so the answer
 * isn't lost.
 */
export function boardAnswered(id: string, answer: string, tell: () => void = () => {}): boolean {
  const take = popupWaits.get(id)
  if (!take) return false
  popupWaits.delete(id)
  take(answer, tell)
  return true
}

/** Does task `t` wait for the owner's answer: it asks something (taskAsks), or is in review? */
const waitsForOwner = (t: BoardTask) => asksOwner(t) || t.status === 'review'

/**
 * The task waiting for the owner that pop-up question `q` is about: its header is exactly that task's id (T-5), or
 * undefined. A task id only mentioned in the question text doesn't count (it may be about something else).
 */
export function popupTask(b: Board, q: Pick<PopupQuestion, 'question' | 'header'>): string | undefined {
  const m = /^T-(\d+)$/i.exec(typeof q.header === 'string' ? q.header.trim() : '')
  if (!m) return undefined
  const t = find(b, `T-${m[1]}`) as BoardTask | undefined
  return t && waitsForOwner(t) ? t.id : undefined
}

/** The pop-up questions of a call's input (`questions`), each with a text; others left out. */
function popupQuestions(input: Record<string, unknown>): PopupQuestion[] {
  const qs: unknown[] = Array.isArray(input.questions) ? input.questions : []
  return qs.filter((q): q is PopupQuestion => !!q && typeof q === 'object' && typeof (q as PopupQuestion).question === 'string' && !!(q as PopupQuestion).question.trim())
}

/** A pop-up question's option labels as the board keeps them (cleaned, no repeats, no "the rest on the board"), at most QUESTION_OPTIONS.max. */
const labels = (q: PopupQuestion): string[] =>
  [...new Set((Array.isArray(q.options) ? q.options : [])
    .map(o => (o && typeof o.label === 'string' ? clean(squash(o.label), OPTION_MAX) : '')))]
    .filter(l => l && l.toLowerCase() !== REST_ON_BOARD)
    .slice(0, QUESTION_OPTIONS.max)

/**
 * Ties each pop-up question to its board question: a task waiting for the owner that it names, else the lead's open
 * Q-n with the same text, else a new Q-n (one with fewer than 2 options can't be a board question: left untied).
 */
async function linkQuestions(host: Host, qs: PopupQuestion[]): Promise<(PopupLink | undefined)[]> {
  const [links, made, b] = await change(host, x => {
    let y = x
    const added: OwnerQuestion[] = []
    const out = qs.map((q): PopupLink | undefined => {
      const task = popupTask(y, q)
      if (task) return { kind: 'task', id: task }
      const text = clean(squash(q.question), QUESTION_MAX)
      const same = openQuestions(y).find(o => o.text === text)
      if (same) return { kind: 'question', id: same.id }
      const opts = labels(q)
      if (opts.length < QUESTION_OPTIONS.min) return undefined
      const [z, nq] = addQuestion(y, q.question, opts, now())
      y = z
      added.push(nq)
      return { kind: 'question', id: nq.id }
    })
    return [y, [out, added, y]] as [Board, [(PopupLink | undefined)[], OwnerQuestion[], Board]]
  })
  for (const q of made) sayQuestion(host, b, q.id)
  return links
}

/** Does `answer` pick option `label` (its words at the start, any case)? */
const picks = (answer: string, label: string) => answer.trim().toLowerCase().startsWith(label.toLowerCase())

/**
 * The owner answered task `id`'s question in the pop-up with `answer`: it is put into the task as the board's buttons
 * would (Allow, Don't allow, an answer, more time; Approve, Done, Keep as a note). What the lead reads about it.
 */
export async function popupToTask(host: Host, id: string, answer: string): Promise<string> {
  const b = await load(host)
  const t = find(b, id) as BoardTask | undefined
  const n = S.N.name
  if (!t || !waitsForOwner(t)) return `${id} no longer waits for the owner; ${n} put nothing into it.`
  const asks = taskAsks(t, b.max_minutes)
  try {
    if (asks) {
      if (asks.files.length && picks(answer, "Don't allow")) return `${n} put the owner's answer into ${id}: ${await refuseAskedFiles(host, id)}.`
      if (asks.files.length && picks(answer, 'Allow')) return `${n} put the owner's answer into ${id}: ${await allowAskedFiles(host, id)}.`
      return `${n} put the owner's answer into ${id}: ${await runTool(host, 'change', { task: id, answer: answer.trim() })} Don't send it again with ${n} change.`
    }
    // in review: the merge runs for minutes, so it is started and not waited for (as the board's Approve does)
    const answered = isAnswered(t)
    const keep = answered && picks(answer, 'Keep as a note')
    if (keep || (answered && picks(answer, 'Done')) || (!answered && picks(answer, 'Approve'))) {
      void runTool(host, 'approve', keep ? { task: id, keep_note: true } : { task: id }).then(
        r => noteForLead(`The owner's pop-up answer "${brief(answer)}" on ${id}: ${brief(r)}`),
        (err: Error) => noteForLead(`The owner's pop-up answer "${brief(answer)}" on ${id} failed: ${brief(err.message)}`),
      )
      return `${n} is applying the owner's answer to ${id} (${keep ? 'approve with keep_note' : 'approve'}); a board update says how it ends. Don't approve it again.`
    }
  } catch (err) {
    return `${n} could not put the owner's answer into ${id} (${(err as Error).message}): do it yourself.`
  }
  return `${n} did not apply this answer to ${id}: do it yourself (e.g. ${n} reject ${id} with the owner's reason or follow-up question).`
}

/** What the pop-up tool answers when the board's answers came first: the questions asked and an answer for each (keyed by question text). */
export type PopupBoardResult = { result: { questions: unknown; answers: Record<string, string> }; context: string[] }

/**
 * The lead's call (`agentId` undefined) of the host's pop-up question tool with `input`: its questions are tied to
 * board questions (see linkQuestions), `notice` shows "or answer on the board (Q-3)" under the open dialog, and
 * `open` (the host's own dialog: next(e) in Claude Code) races the board. When the board answers every tied question
 * first, those answers are the tool's result (the host then closes the dialog). When the dialog answers first, its
 * answers close the Q-ns and go into the tasks, and what was done rides along as context. Any other call (an
 * agent's, or with symcc not on here) is only `open()`.
 */
export async function popupCall<R>(host: Host, agentId: string | undefined, input: Record<string, unknown>, open: () => Promise<R>, notice: (text: string | undefined) => void): Promise<R | PopupBoardResult> {
  if (agentId || !S.W.askPopup) return open()
  const qs = popupQuestions(input)
  if (!qs.length || !(await findRoot(host)) || S.guardOnly || !(await isOn(host))) return open()
  const links = await linkQuestions(host, qs)
  const tied = qs.flatMap((q, i) => (links[i] ? [{ q, link: links[i]! }] : []))
  if (!tied.length) return open()
  // the board may close the dialog only when it can answer every question in it: with an untied one (e.g. free
  // text) board answers are kept, but the dialog stays open for the rest
  const boardCloses = tied.length === qs.length && qs.length === (Array.isArray(input.questions) ? input.questions.length : 0)
  // the board's answers, by question text (as the pop-up's result keys them)
  const fromBoard: Record<string, string> = {}
  const ids = [...new Set(tied.map(x => x.link.id))]
  let left = ids.length
  let allIn = () => {}
  const boardDone = new Promise<void>(res => (allIn = res))
  const takers = new Map<string, (answer: string, tell: () => void) => void>()
  // the lead updates of the board answers taken so far: sent only when the pop-up ends without passing them on
  const tells: (() => void)[] = []
  const tellBoardAnswers = () => {
    for (const t of tells.splice(0)) {
      try {
        t()
      } catch {
        // one failed update doesn't stop the others
      }
    }
  }
  for (const id of ids) {
    const take = (answer: string, tell: () => void) => {
      tells.push(tell)
      for (const x of tied) if (x.link.id === id) fromBoard[x.q.question] = answer
      if (--left === 0) allIn()
    }
    takers.set(id, take)
    popupWaits.set(id, take)
  }
  const name = S.N.name
  notice(`or answer on the board (${ids.join(', ')})`)
  let won: { board: true } | { dialog: R }
  try {
    const opened = open()
    // once the board has won, the dialog is closed under it: how it ends no longer matters
    opened.catch(() => undefined)
    const dialog = opened.then(r => ({ dialog: r }))
    won = await (boardCloses ? Promise.race([dialog, boardDone.then(() => ({ board: true as const }))]) : dialog)
  } catch (err) {
    // the dialog (or the turn) ended without a result: the board answers already taken reach the lead the usual way
    tellBoardAnswers()
    throw err
  } finally {
    for (const [id, take] of takers) if (popupWaits.get(id) === take) popupWaits.delete(id)
  }
  if ('board' in won)
    return { result: { questions: input.questions, answers: fromBoard }, context: [`The owner answered on the ${name} board (${ids.join(', ')}), which closed the pop-up; the board question is closed. Act on the answer and don't ask again.`] }
  const r = won.dialog
  const res = (r as { result?: { answers?: unknown; response?: unknown } } | null)?.result
  const answers = { ...((res?.answers ?? {}) as Record<string, unknown>) }
  const typed = typeof res?.response === 'string' ? res.response.trim() : ''
  const notes: string[] = []
  // the owner typed instead of picking (only `response`, no answers): with one question that is its answer;
  // with more, which one it answers is unknown, so the lead is told what is still open
  if (typed && !Object.values(answers).some(a => typeof a === 'string' && a.trim())) {
    if (qs.length === 1) answers[qs[0]!.question] = typed
    else {
      const open = [...new Set(tied.filter(x => fromBoard[x.q.question] === undefined).map(x => x.link.id))]
      if (open.length)
        notes.push(`The owner typed "${brief(typed)}" instead of picking, so ${name} could not tell which question it answers: ${open.join(', ')} still ${open.length === 1 ? 'waits' : 'wait'} on the board. Close ${open.length === 1 ? 'it' : 'them'} yourself from their words (${name} question action answer for a Q-n, ${name} change with answer, approve or reject for a task), or ask again.`)
    }
  }
  for (const { q, link } of tied) {
    const board = fromBoard[q.question]
    if (board !== undefined) {
      notes.push(`${link.id} was already answered on the board: "${brief(board)}" (that answer stands for it).`)
      continue
    }
    const a = answers[q.question]
    if (typeof a !== 'string' || !a.trim()) continue
    if (restOnBoard(a)) {
      notes.push(`The owner picked "${REST_ON_BOARD}" for ${link.id}: that is no answer, so ${link.id} stays open on the board. A board update tells you their answer; don't ask again.`)
      continue
    }
    if (link.kind === 'question') {
      await change(host, x => answerQuestion(x, link.id, a, 'chat', now())).catch(() => undefined)
      notes.push(`${name} closed ${link.id} on the board with the owner's answer "${brief(a)}".`)
    } else notes.push(await popupToTask(host, link.id, a))
  }
  if (!r || typeof r !== 'object') {
    // no result to carry the notes: the board answers reach the lead the usual way
    tellBoardAnswers()
    return r
  }
  if (!notes.length) return r
  const had = (r as { context?: readonly string[] }).context ?? []
  return { ...r, context: [...had, ...notes] }
}

