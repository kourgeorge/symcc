// The lead's questions for the owner that are not about one task ("raise the version?", "add a scout?"): kept on
// the board file (board.questions), so they don't scroll away in the chat. Open ones show in the board panel's
// "Questions for you" list, in the band and in the status line; an answer (on the board or in the chat) closes one,
// and it stays in the file as history.
import type { SymccAsk } from '../../types'
import { clean, isObj, squash, plural } from './text'

/**
 * One question for the owner: the one Ask record (see SymccAsk in types) with an id. `by` is 'lead'. `answer` and
 * `answered_at` are set once it is closed; `dropped` when the lead took it back.
 */
export type OwnerQuestion = SymccAsk & {
  /** "Q-3" */
  id: string
  /** 2 to 6 short choices (always a list here, maybe empty in an old file); the owner may also type their own answer */
  options: string[]
  /** where the answer came from: the board's buttons or box, or the chat (the lead put it in) */
  answered_by?: 'board' | 'chat'
  /** the lead took the question back (action drop) */
  dropped?: boolean
  /** why it was dropped, when it wasn't the lead's own drop (T-753: "the owner turned the question down in the chat") */
  drop_note?: string
}

const strs = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : undefined)

/** `v` as one Ask record (see SymccAsk), with only the fields it may hold; undefined when it is not one. */
export function cleanAsk(v: unknown): SymccAsk | undefined {
  if (!isObj(v)) return undefined
  const r = v as Record<string, unknown>
  if (typeof r.text !== 'string' || !(r.by === 'worker' || r.by === 'lead' || r.by === 'symcc')) return undefined
  const a: SymccAsk = { by: r.by, text: r.text, asked_at: typeof r.asked_at === 'string' ? r.asked_at : '' }
  const options = strs(r.options)
  if (options?.length) a.options = options
  const files = strs(r.files)
  if (files?.length) a.files = files
  if (typeof r.answer === 'string') a.answer = r.answer
  if (typeof r.answered_at === 'string' && r.answered_at) a.answered_at = r.answered_at
  const lead = r.lead
  if (isObj(lead) && typeof (lead as { text?: unknown }).text === 'string' && (lead as { text: string }).text.trim()) {
    const lo = strs((lead as { options?: unknown }).options)
    a.lead = { text: (lead as { text: string }).text, ...(lo?.length ? { options: lo } : {}) }
  }
  return a
}

/** An Ask record (see SymccAsk) made by `by` at `at`; empty options and files are left out. */
export function makeAsk(by: SymccAsk['by'], text: string, at: string, extra: { options?: readonly string[]; files?: readonly string[] } = {}): SymccAsk {
  return { by, text, asked_at: at, ...(extra.options?.length ? { options: [...extra.options] } : {}), ...(extra.files?.length ? { files: [...extra.files] } : {}) }
}

/** What the owner is shown of an ask: the lead's own wording (T-801) when it has one, else the asker's text. */
export const askText = (a: Pick<SymccAsk, 'text' | 'lead'> | null | undefined): string => a?.lead?.text || a?.text || ''

/** The fewest and most choices a question may have. */
export const QUESTION_OPTIONS = { min: 2, max: 6 } as const
/** A choice is cut to this many characters (it is a button). */
export const OPTION_MAX = 60
/** A question is cut to this many characters. */
export const QUESTION_MAX = 500
/** At most this many closed questions are kept as history; older ones are let go. */
export const QUESTIONS_KEPT = 50

type WithQuestions = { questions?: OwnerQuestion[]; next_question?: number }

/** "q3", "Q-3", "3" and " Q-003 " all become "Q-3"; anything else is only trimmed. */
export const normQid = (id: unknown) => {
  const s = String(id ?? '').trim()
  const m = /^(?:q-?)?0*(\d+)$/i.exec(s)
  return m ? `Q-${m[1]}` : s
}

/** Is question `q` still open (not answered, not dropped)? */
export const isOpenQuestion = (q: Pick<OwnerQuestion, 'answered_at' | 'dropped'>) => !q.answered_at && !q.dropped

/** The open questions of board `b`, oldest first. */
export function openQuestions<Q extends Pick<OwnerQuestion, 'answered_at' | 'dropped'>>(b: { questions?: readonly Q[] }): Q[] {
  return (b.questions ?? []).filter(isOpenQuestion)
}

/** "1 question for you", "2 questions for you"; '' for none. */
export const questionsForYou = (n: number) => (n > 0 ? `${plural(n, 'question')} for you` : '')

/** The title over the open questions in the board panel: "Questions for you (2)". */
export const questionsLabel = (n: number) => `Questions for you (${n})`

/** The question entries from the file made usable (bad entries left out), or undefined when there is no usable list. */
export function cleanQuestions(v: unknown): OwnerQuestion[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: OwnerQuestion[] = []
  const seen = new Set<string>()
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const id = normQid(r.id)
    if (!/^Q-\d+$/.test(id) || seen.has(id) || typeof r.text !== 'string') continue
    seen.add(id)
    const base = cleanAsk({ ...r, by: 'lead' }) ?? { by: 'lead' as const, text: r.text, asked_at: '' }
    const q: OwnerQuestion = { ...base, id, options: base.options ?? [] }
    if (typeof r.answer === 'string') q.answer = r.answer
    if (typeof r.answered_at === 'string' && r.answered_at) q.answered_at = r.answered_at
    if (r.answered_by === 'board' || r.answered_by === 'chat') q.answered_by = r.answered_by
    if (r.dropped === true) {
      q.dropped = true
      if (typeof r.drop_note === 'string' && r.drop_note) q.drop_note = r.drop_note
    }
    out.push(q)
  }
  return out
}

/** The next free question number of `b` (never one already used). */
function nextNumber(b: WithQuestions): number {
  const top = Math.max(0, ...(b.questions ?? []).map(q => Number(/^Q-(\d+)$/.exec(q.id)?.[1] ?? 0)))
  return Math.max(Number.isInteger(b.next_question) && b.next_question! >= 1 ? b.next_question! : 1, top + 1)
}

/** At most QUESTIONS_KEPT closed questions, the newest; every open one is kept. */
function trimmed(qs: OwnerQuestion[]): OwnerQuestion[] {
  const closed = qs.filter(q => !isOpenQuestion(q))
  const extra = closed.length - QUESTIONS_KEPT
  if (extra <= 0) return qs
  const gone = new Set(closed.slice(0, extra).map(q => q.id))
  return qs.filter(q => !gone.has(q.id))
}

/** Adds question `text` with `options` to board `b`: the new board and the question. Throws when the text or the options don't do. */
export function addQuestion<B extends WithQuestions>(b: B, text: unknown, options: unknown, at: string): [B, OwnerQuestion] {
  const words = clean(squash(String(text ?? '')), QUESTION_MAX)
  if (!words) throw new Error('text is missing: the question for the owner, plain and short')
  const opts = [...new Set((Array.isArray(options) ? options : []).map(o => clean(squash(String(o ?? '')), OPTION_MAX)).filter(Boolean))]
  if (opts.length < QUESTION_OPTIONS.min || opts.length > QUESTION_OPTIONS.max)
    throw new Error(`options: give ${QUESTION_OPTIONS.min} to ${QUESTION_OPTIONS.max} short choices (the owner can always type their own answer too); got ${opts.length}`)
  const n = nextNumber(b)
  const q: OwnerQuestion = { id: `Q-${n}`, by: 'lead', text: words, options: opts, asked_at: at }
  return [{ ...b, questions: trimmed([...(b.questions ?? []), q]), next_question: n + 1 }, q]
}

/** Question `id` of board `b`, or undefined. */
export const findQuestion = (b: WithQuestions, id: unknown) => (b.questions ?? []).find(q => q.id === normQid(id))

/** What closing a question did: `q` as it is now; `closed` false when it was already closed (nothing changed). */
export type QuestionClose = { q: OwnerQuestion; closed: boolean }

/** Closes question `id` with `answer`, given `by` the board or the chat. Already closed: nothing changes. Throws when there is no such question or no answer. */
export function answerQuestion<B extends WithQuestions>(b: B, id: unknown, answer: unknown, by: 'board' | 'chat', at: string): [B, QuestionClose] {
  const q = findQuestion(b, id)
  if (!q) throw new Error(`${normQid(id) || 'that question'} is not on the board (see question with action list)`)
  if (!isOpenQuestion(q)) return [b, { q, closed: false }]
  const words = clean(String(answer ?? ''), 2000)
  if (!words) throw new Error('answer is missing: the owner\'s answer, in their words or the option they picked')
  const done: OwnerQuestion = { ...q, answer: words, answered_at: at, answered_by: by }
  return [{ ...b, questions: trimmed((b.questions ?? []).map(x => (x.id === q.id ? done : x))) }, { q: done, closed: true }]
}

/** Takes question `id` back (the lead's drop; `note` says why when it was something else): closed without an answer. Already closed: nothing changes. */
export function dropQuestion<B extends WithQuestions>(b: B, id: unknown, at: string, note = ''): [B, QuestionClose] {
  const q = findQuestion(b, id)
  if (!q) throw new Error(`${normQid(id) || 'that question'} is not on the board (see question with action list)`)
  if (!isOpenQuestion(q)) return [b, { q, closed: false }]
  const done: OwnerQuestion = note ? { ...q, dropped: true, answered_at: at, drop_note: note } : { ...q, dropped: true, answered_at: at }
  return [{ ...b, questions: trimmed((b.questions ?? []).map(x => (x.id === q.id ? done : x))) }, { q: done, closed: true }]
}

/** One question as a line: "Q-3 Raise the version? (Yes | No)". */
export const questionLine = (q: OwnerQuestion) => `${q.id} ${q.text}${q.options?.length ? ` (${q.options.join(' | ')})` : ''}`

/** How a closed question ended, in a few words: 'answered on the board: "Yes"', 'dropped'. */
export function closedText(q: OwnerQuestion): string {
  if (q.dropped) return q.drop_note ? `dropped: ${q.drop_note}` : 'dropped'
  return `answered ${q.answered_by === 'chat' ? 'in the chat' : 'on the board'}: "${q.answer ?? ''}"`
}

/** The block the lead gets, in a board update sent at once, when the owner answered its question on the board. */
export function boardAnswerLine(q: OwnerQuestion): string {
  const answer = (q.answer ?? '').trim()
  const end = /[.?!]$/.test(answer) ? '' : '.'
  return `The owner answered your question ${q.id} ("${q.text}"): ${answer}${end} The question is closed. Act on it.`
}

/** The question tool's list: the open questions, then the last few closed ones. */
export function questionsText(b: WithQuestions, recent = 5): string {
  const open = openQuestions(b)
  const closed = (b.questions ?? []).filter(q => !isOpenQuestion(q)).slice(-recent).reverse()
  const L = [open.length ? `Open questions for the owner (${open.length}):` : 'No open questions for the owner.', ...open.map(q => `- ${questionLine(q)}`)]
  if (closed.length) L.push('', 'Closed lately (newest first):', ...closed.map(q => `- ${q.id} ${q.text}: ${closedText(q)}`))
  return L.join('\n')
}
