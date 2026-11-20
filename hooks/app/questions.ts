// The lead's questions for the owner on the board (see core/questions.ts): the lead's question tool, and the
// owner's answer from the board panel's question page.
import { type Board, type QuestionClose, addQuestion, answerQuestion, dropQuestion, normQid, questionsText, closedText, boardAnswerLine, openQuestions, questionsForYou } from '../board'
import { S } from './state'
import type { Host } from '../host'
import { change, load, now } from './store'
import { tellLead } from './tell'
import { sayQuestion } from './voice'

type In = Record<string, unknown>

/** How the lead offers n options in the chat: with the host's pop-up question tool (it takes at most 4, so with
 *  more the first 3 plus "the rest on the board"), or as numbered plain chat text when the host has none (T-570). */
export const optionsVia = (n: number): string =>
  S.W.askPopup
    ? `with ${S.W.askPopup}${n > 4 ? ` (it takes at most 4 options: show the first 3 plus "the rest on the board", or the owner types one under Other)` : ''}`
    : 'as numbered plain chat text'

/** After "If they answer on the board first …": with a pop-up, it stays open, so say so once; '' with none. */
export const popupStaysOpen = (): string => (S.W.askPopup ? ` The ${S.W.askPopup} pop-up then stays open: say once "answered on the board; you can close the pop-up".` : '')

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
    return `added ${q.id} "${q.text}" with the options ${q.options.join(' | ')} (the owner can also type their own). It shows on the board under "Questions for you" until it is answered. Ask it briefly in the chat too, offering the options ${optionsVia(q.options.length)}, plus "or answer on the board". If the owner answers in the chat, close it with ${S.N.name} question action answer, id ${q.id} and their answer; a board answer reaches you at once in a board update ("The owner answered your question ${q.id} …: … Act on it.").${popupStaysOpen()}`
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
  tellLead(host, boardAnswerLine(r.q))
  return `${r.q.id} answered: ${r.q.answer}; the lead will take it from here`
}

