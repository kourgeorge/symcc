// The "Earlier tries" table of a worker's prompt (T-851), built from the try facts on the task's history lines
// (T-805, T-806: the try, result and reason of each line). One row per try, the last few tries, no notes of the lead.
import type { SymccHistoryEntry, SymccTask } from '../../types'
import { tryParts } from './history'

/** How many tries the table lists. */
export const TRIES_SHOWN = 5

/** One row: the try, how it ended, why, what its worker said it did, and (for a checker send-back) the checker's first finding. */
export type TryRow = { try: number; ended: string; reason: string; said: string; finding: string }

/** The lines that end a try (the others are steps, notes or the owner's words). */
const ENDINGS = new Set(['checker-problems', 'merged', 'done', 'failed', 'try-result', 'not-merged', 'out-of-time', 'rejected', 'approve-failed', 'stopped', 'restarted', 'answered'])

const REASON_WORDS: Record<string, string> = {
  tests: 'tests failed',
  checker: 'sent back by the checker',
  clash: 'clash with main',
  scope: 'changed files outside the task',
  timeout: 'ran out of time',
  noresult: 'ended without a result',
  nochange: 'made no change',
  notmerged: 'not merged',
  other: 'failed',
  changed: 'restarted',
  stopped: 'stopped',
  rejected: 'rejected by the owner',
}

/** The first sentence of `s` on one line; a very long one is cut at a word with "…". */
export function firstSentence(s: string, max = 200): string {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim()
  // A sentence ends at . ! ? before a capital letter (or the end), not at "e.g." or "etc." mid-thought.
  const m = /^(.*?(?<!\b(?:e\.g|i\.e|etc|vs|approx|cf))[.!?])(?=\s+[A-Z`"'(\[*]|$)/.exec(one)
  const sentence = m ? m[1]! : one
  if (sentence.length <= max) return sentence
  const cut = sentence.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2))}…`
}

/**
 * The first problem of an old checker line (T-859): the text after "problem: " / "problems: ", cut at its first
 * sentence. Never a list item from a "What works" part; '' when the line has no such text.
 */
export function firstFinding(line: string): string {
  const after = /\bproblems?:([\s\S]*)$/i.exec(String(line ?? ''))
  if (!after) return ''
  // Strip any run of list marks, bold/italic marks and spaces from the start.
  const text = after[1]!.replace(/^(?:[\s\-*_•]|\d+[.)])+/, '')
  return text ? firstSentence(text) : ''
}

const tryNo = (e: SymccHistoryEntry): number => e.try ?? tryParts(e.text)?.[1] ?? 0
const bodyOf = (e: SymccHistoryEntry): string => tryParts(e.text)?.[2] ?? e.text

/** What the worker said, from a result line "try 2: <said> → <result>"; '' when the line has no such part. */
function saidOf(e: SymccHistoryEntry): string {
  const body = bodyOf(e)
  const arrow = e.result !== undefined && body.endsWith(` → ${e.result}`) ? body.length - e.result.length - 3 : body.lastIndexOf(' → ')
  return arrow > 0 ? body.slice(0, arrow) : ''
}

/** The result words of an ending line: its result fact, else what follows the kind's own words. */
const resultOf = (e: SymccHistoryEntry): string => e.result ?? bodyOf(e).replace(/^(?:stopped|restarted|rejected(?: by the owner)?):\s*/, '')

function endedWord(e: SymccHistoryEntry): string {
  if (e.kind === 'merged' || e.kind === 'done') return 'merged'
  if (e.kind === 'checker-problems') return REASON_WORDS.checker!
  if (e.kind === 'restarted') return 'restarted'
  if (e.kind === 'stopped') return 'stopped'
  if (e.reason && REASON_WORDS[e.reason]) return REASON_WORDS[e.reason]!
  if (e.kind === 'rejected') return 'rejected by the owner'
  if (e.kind === 'out-of-time') return 'ran out of time'
  if (e.kind === 'answered') return 'answered'
  return e.kind === 'try-result' ? 'waits for a check' : 'not merged'
}

/** The rows of `t`'s last tries, oldest first. */
export function triesRows(t: Pick<SymccTask, 'history'>, max = TRIES_SHOWN): TryRow[] {
  const byTry = new Map<number, SymccHistoryEntry[]>()
  for (const e of t.history ?? []) {
    const n = tryNo(e)
    if (!n || e.kind === 'stage' || e.kind === 'created' || e.kind === 'note' || e.kind === 'answer') continue
    byTry.set(n, [...(byTry.get(n) ?? []), e])
  }
  const rows: TryRow[] = []
  for (const n of [...byTry.keys()].sort((a, b) => a - b)) {
    const lines = byTry.get(n)!
    const end = lines.findLast(e => ENDINGS.has(e.kind) && e.kind !== 'checker-problems') ?? lines.findLast(e => e.kind === 'checker-problems')
    if (!end) continue
    const problems = lines.findLast(e => e.kind === 'checker-problems')
    const ended = endedWord(end)
    const checkerSent = end.reason === 'checker' || end.kind === 'checker-problems' || (!!problems && end.kind === 'failed' && !end.reason)
    const finding = checkerSent ? (problems?.problems?.[0] ? firstSentence(problems.problems[0]) : firstFinding(problems ? bodyOf(problems).replace(/^checker found problems:\s*/, '') : resultOf(end).replace(/^the checker found problems:?\s*/, ''))) : ''
    const reason = checkerSent ? 'the checker found problems' : ended === 'merged' ? '' : firstSentence(resultOf(end))
    rows.push({ try: n, ended: checkerSent ? REASON_WORDS.checker! : ended, reason, said: firstSentence(saidOf(end)), finding })
  }
  return rows.slice(-max)
}

const cell = (s: string): string => (s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '-')

/** The table of the last tries as markdown; null when no try has ended. The finding column is there only when some try was sent back. */
export function triesTable(t: Pick<SymccTask, 'history'>, max = TRIES_SHOWN): string | null {
  const rows = triesRows(t, max)
  if (!rows.length) return null
  const finds = rows.some(r => r.finding)
  const head = ['try', 'how it ended', 'reason', 'what the worker said', ...(finds ? ["checker's first finding"] : [])]
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`]
  for (const r of rows) lines.push(`| ${[String(r.try), r.ended, r.reason, r.said, ...(finds ? [r.finding] : [])].map(cell).join(' | ')} |`)
  return lines.join('\n')
}
