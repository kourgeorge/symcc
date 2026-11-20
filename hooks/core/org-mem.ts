// T-600, T-620: organizational memory (org-mem). Workers, checkers and investigations may end their report with a "Learned:" section: up to
// LEARNED_MAX short lines about the project that would save the next agent time (how to test, a trap, where something
// is). symcc keeps them in <project>/.<name>/org-mem.md (one line each, with the task id and date, duplicates
// skipped, at most ORG_MEM_MAX_LINES lines, oldest dropped first) and puts the whole file into every new worker's,
// checker's and scout's prompt. The owner and the lead may edit or trim the file by hand. Everything here is pure.
// T-619: the owner sees the notes on a page under Settings (orgMemNotes) and may delete one there (deleteOrgMemNote).
import type { KeyHint } from './panel'

/** The file's name inside symcc's data folder (e.g. .symcc/org-mem.md). */
export const ORG_MEM_FILE_NAME = 'org-mem.md'

/** Org-mem's path inside the project, for data folder `dir` (e.g. ".symcc"). */
export const orgMemFile = (dir: string) => `${dir}/${ORG_MEM_FILE_NAME}`

/** The most lines org-mem keeps (older ones are dropped first). */
export const ORG_MEM_MAX_LINES = 60

/** The most "Learned:" lines taken from one report. */
export const LEARNED_MAX = 3

/** The longest a kept line may be (longer ones are cut, with "…"). */
export const LEARNED_LINE_CHARS = 200

/** What the prompts ask for at the end of a report (the same words in every prompt). */
export const LEARNED_ASK = `As the very last part of your report (after everything else) you may add a "Learned:" section: 0 to ${LEARNED_MAX} short lines, each starting with "- ", about this project that would save the next agent time (how to test, a trap, where something is). Not about this task's own content, no file contents, and nothing secret. Leave it out when there is nothing new.`

/** The heading line of the section: "Learned:", maybe as **Learned:** or "## Learned", with an optional first line after it. */
const HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*learned\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*(.*)$/i
/** A heading must have a colon or be a markdown heading, so a sentence starting with "Learned" is not taken for one. */
const HEADING_MARK = /^\s*(?:#{1,6}\s*(?:\*\*|__)?\s*learned\b|(?:\*\*|__)?\s*learned\s*(?:\*\*|__)?\s*:)/i

/** A list line of the section: "- x" (or "* x", "• x", "1. x"). */
const BULLET = /^\s*(?:[-*•+]|\d+[.)])\s+\S/
/** A code fence line (``` or ~~~), which opens or closes a block of file contents. */
const FENCE = /^\s*(?:```|~~~)/

/**
 * `answer` split into its body and its "Learned:" lines (raw, not cleaned yet). The section is the last "Learned:"
 * heading (with any text after it on the same line) and the list lines right after it; it ends at its first blank
 * line or first line that isn't a list line, and whatever comes after (a question, a "NEED FILES:" line, a checker's
 * OK) stays in the body. A fenced code block inside the section is dropped whole (fences and all): file contents
 * never go into org-mem. No section: the whole answer is the body and there are no lines.
 */
export function splitLearned(answer: string): { body: string; lines: string[] } {
  const text = String(answer ?? '').replace(/\r\n?/g, '\n')
  const all = text.split('\n')
  // the last heading outside fenced code blocks (a quoted example holding "Learned:" is not the section)
  let at = -1
  let fenced = false
  for (let i = 0; i < all.length; i++) {
    if (FENCE.test(all[i]!)) fenced = !fenced
    else if (!fenced && HEADING_MARK.test(all[i]!)) at = i
  }
  if (at < 0) return { body: String(answer ?? ''), lines: [] }
  const lines: string[] = []
  const first = (HEADING.exec(all[at]!)?.[1] ?? '').trim()
  if (first) lines.push(first)
  let i = at + 1
  // a blank line right after the heading line (before any list line) is allowed
  if (!first) while (i < all.length && !all[i]!.trim() && i + 1 < all.length && (BULLET.test(all[i + 1]!) || !all[i + 1]!.trim())) i++
  while (i < all.length) {
    const l = all[i]!
    if (FENCE.test(l)) {
      // the whole block goes: skip to its closing fence (or the end)
      i++
      while (i < all.length && !FENCE.test(all[i]!)) i++
      i++
      continue
    }
    if (!BULLET.test(l)) break
    lines.push(l.trim())
    i++
  }
  const before = all.slice(0, at).join('\n').trimEnd()
  const after = all.slice(i).join('\n').trim()
  const body = after ? (before ? `${before}\n\n${after}` : after) : before
  return { body, lines }
}

/** Text that looks like a secret: a key=value with a secret-ish name, a known token prefix, or a private key (long random tokens: see longToken). */
const SECRET = [
  /\b(?:password|passwd|pwd|secret|token|api[_ -]?key|access[_ -]?key|private[_ -]?key)\b\s*[:=]\s*\S+/i,
  /\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})/,
  /-----BEGIN [A-Z ]*KEY-----/,
]

/** A file or folder name made of short words: "word-word-word", maybe with an ".ext" (e.g. research-a-short-notice.md). */
const NAME_LIKE = /^[A-Za-z0-9]{1,24}(?:[-_.][A-Za-z0-9]{1,24})+$/

/**
 * Whether word `w` looks like a long random token (a key or password): 32 or more characters of letters and digits
 * mixed, with no path or name separators. A path (has "/") or a hyphenated name (NAME_LIKE) is not one.
 */
function longToken(w: string): boolean {
  const s = w.replace(/^[`'"([{<]+|[`'")\]}>.,;:!?]+$/g, '')
  if (s.length < 32 || s.includes('/') || NAME_LIKE.test(s)) return false
  return /^[A-Za-z0-9+=_-]+$/.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s)
}

/** Whether `s` looks like it holds a secret (see SECRET and longToken). */
export const looksSecret = (s: string): boolean => SECRET.some(r => r.test(s)) || s.split(/\s+/).some(longToken)

/** Lines that are file contents or a diff, not a lesson: a code fence, a diff header or hunk. */
const CONTENTS = /```|^(?:diff --git|@@ |\+\+\+ |--- )/

/** A line that says there is nothing: "none", "nothing", "n/a", "-". */
const NOTHING = /^[\s(]*(?:none|nothing|nothing new|n\/a|na|-+)[\s.)]*$/i

/**
 * Raw "Learned:" lines cleaned: the list mark taken off, made one line (spaces squeezed), cut at LEARNED_LINE_CHARS;
 * empty, "none", secret-looking and file-content lines are left out; at most LEARNED_MAX are kept.
 */
export function cleanLearned(lines: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of lines) {
    if (CONTENTS.test(raw.trim())) continue
    const s = raw.replace(/\s+/g, ' ').trim().replace(/^(?:[-*•+]|\d+[.)])\s+/, '').trim()
    if (!s || NOTHING.test(s) || looksSecret(s)) continue
    out.push(s.length > LEARNED_LINE_CHARS ? `${s.slice(0, LEARNED_LINE_CHARS - 1).trimEnd()}…` : s)
    if (out.length >= LEARNED_MAX) break
  }
  return out
}

/** An org-mem line's lesson, without its "- T-12 2026-11-20:" front (lines the owner wrote by hand are taken as they are). */
const lessonOf = (line: string) => line.replace(/^\s*[-*•]?\s*(?:T-\d+\s+)?(?:\d{4}-\d{2}-\d{2})?\s*:?\s*/, '')

/** The words of `s`, lower case, for comparing. */
const wordsOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Words that turn a lesson around ("don't use …", "… no longer …"); after wordsOf, "don't" reads "don t". */
const NEGATION = /\b(?:not|no|never|none|nor|cannot|avoid|without|instead|t)\b/g

/** How many turning-around words `words` (from wordsOf) has. */
const negations = (words: string) => (words.match(NEGATION) ?? []).length

/**
 * Whether lessons `a` and `b` say the same (case-insensitive near-match): the same words, one holding the other, or
 * mostly the same words. Not when one turns the other around ("don't use X" corrects "use X", so it is kept).
 */
export function sameLesson(a: string, b: string): boolean {
  const x = wordsOf(lessonOf(a))
  const y = wordsOf(lessonOf(b))
  if (!x || !y) return false
  if (x === y) return true
  if (negations(x) !== negations(y)) return false
  if (Math.min(x.length, y.length) >= 20 && (x.includes(y) || y.includes(x))) return true
  const xs = new Set(x.split(' '))
  const ys = new Set(y.split(' '))
  if (xs.size < 3 || ys.size < 3) return false
  const both = [...xs].filter(w => ys.has(w)).length
  return both / new Set([...xs, ...ys]).size >= 0.8
}

/** Org-mem's lines: its non-empty lines, as written. */
export const orgMemLines = (guide: string | null | undefined): string[] => String(guide ?? '').split('\n').map(l => l.trimEnd()).filter(l => l.trim())

/**
 * Org-mem `guide` with the "Learned:" lines of `answer` (task `id`'s report, on day `date`, e.g. "2026-11-20") added
 * at its end as "- T-12 2026-11-20: lesson", each once (a line that near-matches one already in org-mem, or one
 * added just before, is skipped), and cut to its last `max` lines. `added`: the lessons added (none: `text` is the
 * memory as it was, so nothing needs writing).
 */
export function addLearned(guide: string | null | undefined, answer: string, id: string, date: string, max = ORG_MEM_MAX_LINES): { text: string; added: string[] } {
  const old = orgMemLines(guide)
  const added: string[] = []
  for (const s of cleanLearned(splitLearned(answer).lines)) {
    if ([...old, ...added].some(l => sameLesson(l, s))) continue
    added.push(s)
  }
  if (!added.length) return { text: String(guide ?? ''), added }
  const lines = [...old, ...added.map(s => `- ${id} ${date}: ${s}`)].slice(-max)
  return { text: `${lines.join('\n')}\n`, added }
}

/**
 * Org-mem as a prompt shows it: a short heading, then its last ORG_MEM_MAX_LINES lines (each cut, so a hand-edited
 * file can't flood the prompt). `file`: where it is, named in the heading. '' when org-mem is missing or empty.
 */
export function orgMemSection(guide: string | null | undefined, file: string): string {
  const lines = orgMemLines(guide).slice(-ORG_MEM_MAX_LINES).map(l => (l.length > 400 ? `${l.slice(0, 399)}…` : l))
  if (!lines.length) return ''
  return `\nOrganizational memory (org-mem): notes earlier agents left about this project (from ${file}; they may be out of date):\n${lines.join('\n')}\n`
}

// ---------------- T-619: the Organizational memory page under Settings ----------------

/** One note of org-mem as the Settings page lists it: `n` is its place in the file (1 = the first, oldest line), so
 *  appending new notes keeps the numbers; `id` and `date` are '' for a line the owner wrote by hand without them. */
export type OrgMemNote = { n: number; id: string; date: string; text: string }

/** The page's title. */
export const ORG_MEM_TITLE = 'Organizational memory (org-mem)'

/** What the page says when org-mem has no notes. */
export const ORG_MEM_EMPTY = 'No notes yet.'

/** "3 notes" (the Settings row's count). */
export const orgMemCount = (n: number) => `${n} note${n === 1 ? '' : 's'}`

/** A closed Settings group's short value for org-mem: "org-mem 3 notes"; '' (left out) with no notes. */
export const orgMemSummary = (n: number) => (n ? `org-mem ${orgMemCount(n)}` : '')

/** The page's one-line explanation: where the file is, who adds to it, and its limit. */
export const orgMemAbout = (file: string) =>
  `Notes agents left for the next ones: a worker's or checker's report may end with "Learned:" lines, which symcc keeps in ${file} (the newest ${ORG_MEM_MAX_LINES} lines) and puts into every new worker's, checker's and scout's prompt. You may edit the file by hand too.`

/** The front of a note line: "- T-12 2026-11-20: ". */
const NOTE_FRONT = /^\s*(?:[-*•]\s+)?(?:(T-\d+)\s+)?(?:(\d{4}-\d{2}-\d{2}))?\s*:?\s*/

/** Org-mem's notes, newest (last in the file) first, each with its id, date and text (see OrgMemNote). */
export function orgMemNotes(guide: string | null | undefined): OrgMemNote[] {
  return orgMemLines(guide)
    .map((line, i): OrgMemNote => {
      const m = NOTE_FRONT.exec(line)!
      const id = m[1] ?? ''
      const date = m[2] ?? ''
      // a hand-written line without an id or date keeps its text whole (only its list mark is taken off)
      const text = id || date ? line.slice(m[0].length).trim() : line.replace(/^\s*[-*•]\s+/, '').trim()
      return { n: i + 1, id, date, text }
    })
    .reverse()
}

/**
 * A short check word for a note's text (6 hex letters), sent with a delete that only carries the note's number
 * (OpenCode's slash command): if a new note pushed the oldest one out, or the file was edited, the number now points
 * at another note, whose check word differs, so nothing is deleted (see deleteOrgMemNote).
 */
export function orgMemNoteKey(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0').slice(0, 6)
}

/**
 * Org-mem `guide` without note `n` (its place in the file, see OrgMemNote): exactly that line goes, every other line
 * (blank ones too) stays as written. `expect`: the note's text as the page showed it; `key`: its check word
 * (orgMemNoteKey); when either is given and the line no longer matches it (the file changed meanwhile), nothing is
 * removed. `removed`: the note taken out, or null.
 */
export function deleteOrgMemNote(guide: string | null | undefined, n: number, expect?: string, key?: string): { text: string; removed: OrgMemNote | null } {
  const text = String(guide ?? '')
  const note = orgMemNotes(text).find(x => x.n === n)
  if (!note || (expect !== undefined && note.text !== expect) || (key !== undefined && orgMemNoteKey(note.text) !== key.toLowerCase())) return { text, removed: null }
  const raw = text.split('\n')
  let seen = 0
  const at = raw.findIndex(l => l.trim() && ++seen === n)
  raw.splice(at, 1)
  return { text: raw.join('\n'), removed: note }
}

/** A note's line on the page above its text: "#3 · T-12 · 2026-11-20" ("#3 · written by hand" without an id or date). */
export const orgMemNoteHead = (x: OrgMemNote) => [`#${x.n}`, ...(x.id || x.date ? [x.id, x.date].filter(Boolean) : ['written by hand'])].join(' · ')

/** The page's key hints: x deletes the note under the cursor (after a confirm step: y yes, x cancel). */
export const orgMemKeys = (confirming = false, notes = true): KeyHint[] =>
  confirming
    ? [{ key: 'y', word: 'yes, delete' }, { key: 'x', word: 'cancel' }]
    : [...(notes ? [{ key: '↑↓', word: 'move' }, { key: 'x', word: 'delete' }] : []), { key: 't s c', word: 'views' }, { key: 'b', word: 'back' }]

/** The confirm step's question: "Delete note #3 · T-12 · 2026-11-20 from .symcc/org-mem.md?" */
export const orgMemDeleteAsk = (x: OrgMemNote, file: string) => `Delete note ${orgMemNoteHead(x)} from ${file}?`
