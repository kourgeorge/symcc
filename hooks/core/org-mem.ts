// T-600, T-620, T-632: organizational memory (org-mem). T-656: right after a worker or checker hands back, symcc asks the
// same agent one follow-up question (DEBRIEF_TEXT) for up to LEARNED_MAX suggested notes (useful to agents on other
// tasks, short); a host that can't continue an agent asks for a "Learned:" section at the end of the report instead. symcc
// keeps the suggestions on the task (addSuggestions); when the task merges (or an investigation is Done) the lead's
// board update lists them (suggestedText), and the lead decides what goes into <project>/.<name>/org-mem.md with its
// orgmem tool (orgMemAdd, orgMemRemove, orgMemReplace, orgMemSetTopic, orgMemList). A note is one line, "- 2026-11-21 [topic] lesson"
// (T-717: one topic label each, set only by the lead; an old "- 2026-11-20: lesson" line reads as topic "unsorted"), at
// most ORG_MEM_MAX_LINES of them; the whole file goes into every new worker's, checker's and scout's prompt. The
// owner may edit the file by hand. Everything here is pure.
// T-619, T-687, T-718: the owner sees the notes on a page opened from the Live tab's Organizational memory section (orgMemNotes; the
// section's newest notes and topic counts: orgMemNewest, orgMemTopicCounts, drawn by core/live.ts's liveOrgMem) and may delete one there (deleteOrgMemNote).
import type { KeyHint } from './panel'

/** The file's name inside symcc's data folder (e.g. .symcc/org-mem.md). */
export const ORG_MEM_FILE_NAME = 'org-mem.md'

/** Org-mem's path inside the project, for data folder `dir` (e.g. ".symcc"). */
export const orgMemFile = (dir: string) => `${dir}/${ORG_MEM_FILE_NAME}`

/** The most lines org-mem keeps (the lead's orgmem tool refuses an add past it). */
export const ORG_MEM_MAX_LINES = 60

/** The most "Learned:" suggestions taken from one report. */
export const LEARNED_MAX = 3

/** The longest a kept line may be (longer ones are cut, with "…"); org-mem goes into every prompt, so notes stay short. */
export const LEARNED_LINE_CHARS = 100

/**
 * T-656: the debrief. After a worker or checker hands back, symcc sends the same agent this one follow-up message (it
 * still holds its whole task in mind), so its main prompt is only about the task. Its answer's "Suggested for
 * org-mem:" lines are kept as suggestions, like "Learned:" lines (addSuggestions).
 */
export const DEBRIEF_TEXT = `Before you finish: is there a fact from this task that would help other agents on other tasks in this project? For example: how to test or check something quickly, a trap or a refusal and the way around it, where something lives, a workflow step that wasted time and what works instead, or a rule in the notes above that turned out wrong. Suggest 0-${LEARNED_MAX}, under "Suggested for org-mem:", each one short plain sentence (at most ~20 words) that is true beyond this task, not already in the org-mem notes above (not even in other words), with no task ids, file contents or secrets. The lead decides what goes in. Most tasks have nothing to add: then answer "none". Answer only; change no files and run nothing.`

/** T-656: how long symcc waits for a debrief answer; none by then: nothing is kept. */
export const DEBRIEF_MS = 3 * 60_000

/**
 * What the prompts ask for at the end of a report, only on a host that can't send an agent a follow-up message (no
 * debrief there, T-656); elsewhere the debrief asks instead and the prompts leave it out.
 */
export const LEARNED_ASK = `As the very last part of your report (after everything else) you may add a "Learned:" section: 0 to ${LEARNED_MAX} suggested notes for org-mem, each one line starting with "- ". Nothing goes into org-mem on its own: the lead reads your suggestions when the task ends and decides. Suggest a note only when it is all of these: useful to agents working on other tasks in this project (how to test or check something quickly, a trap or a refusal and the way around it, where something lives, a workflow step that wasted time), true beyond this task, one short plain sentence (at most ~20 words), and not already in the org-mem notes shown above (not even in other words). No file contents, nothing secret, no task ids. Leaving the section out is the normal case.`

/** The words of a heading: "Learned", or the debrief's "Suggested for org-mem" (T-656). */
const HEAD_WORDS = '(?:learned|suggested\\s+for\\s+org-?mem(?:ory)?)'
/** The heading line of the section: "Learned:", maybe as **Learned:** or "## Learned", with an optional first line after it. */
const HEADING = new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:\\*\\*|__)?\\s*${HEAD_WORDS}\\s*(?:\\*\\*|__)?\\s*:?\\s*(?:\\*\\*|__)?\\s*(.*)$`, 'i')
/** A heading must have a colon or be a markdown heading, so a sentence starting with "Learned" is not taken for one. */
const HEADING_MARK = new RegExp(`^\\s*(?:#{1,6}\\s*(?:\\*\\*|__)?\\s*${HEAD_WORDS}\\b|(?:\\*\\*|__)?\\s*${HEAD_WORDS}\\s*(?:\\*\\*|__)?\\s*:)`, 'i')

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

/** `s` with every secret-looking part (see looksSecret) put as "[hidden]": a key=value's value, a known token, a long random word. */
export function hideSecrets(s: string): string {
  let out = s.replace(/-----BEGIN [A-Z ]*KEY-----[\s\S]*/g, '[hidden]')
  out = out.replace(/\b((?:password|passwd|pwd|secret|token|api[_ -]?key|access[_ -]?key|private[_ -]?key)\b\s*[:=]\s*)\S+/gi, '$1[hidden]')
  out = out.replace(new RegExp(SECRET[1]!.source, 'g'), '[hidden]')
  return out
    .split(/(\s+)/)
    .map(w => (longToken(w) ? '[hidden]' : w))
    .join('')
}

/** Lines that are file contents or a diff, not a lesson: a code fence, a diff header or hunk. */
const CONTENTS = /```|^(?:diff --git|@@ |\+\+\+ |--- )/

/**
 * A line that says there is nothing: "-", "na", or one that starts with the whole word "no", "none", "nothing" or
 * "n/a" (any case, any words after: "None — nothing here is true beyond this task.", "No new facts.", "No."); "Nonetheless"
 * and "Note" are kept.
 */
const NOTHING = /^[\s("'*_]*(?:(?:no|none|nothing|n\/a)\b|(?:na|-+)[\s.)]*$)/i

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

/** A note's text without its list mark and an old "2026-11-20:" front (the text a lead gives keeps any "[WIP]" or "[link](url)" start). */
const plainLesson = (line: string) => line.replace(/^\s*[-*•]?\s*(?:\d{4}-\d{2}-\d{2}\s*:)?\s*/, '')

/**
 * An org-mem line's lesson, for comparing: without its "- 2026-11-21 [tests] " front (T-717: the "[topic]" is taken
 * off only right after a date with no colon, and only when followed by a space) or its old "- 2026-11-20:" front.
 * Anything else (a new note's text, a line written by hand) is taken as plainLesson gives it.
 */
function lessonOf(line: string): string {
  const m = /^\s*[-*•]?\s*\d{4}-\d{2}-\d{2}(?!\s*:)\s+/.exec(line)
  if (!m) return plainLesson(line)
  const rest = line.slice(m[0].length)
  const t = /^\[([^\]\n]{1,40})\]\s+/.exec(rest)
  return t && cleanTopic(t[1]) ? rest.slice(t[0].length) : rest
}

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
 * T-656: the suggested lines of a debrief answer (raw, see splitLearned): its "Suggested for org-mem:" (or "Learned:")
 * section; with no heading, an answer made only of list lines is taken as the list. Anything else ("none", a
 * sentence) gives none.
 */
export function debriefLines(answer: string): string[] {
  const split = splitLearned(answer)
  if (split.lines.length) return split.lines
  const lines = String(answer ?? '').split(/\r?\n/).filter(l => l.trim())
  return lines.length && lines.every(l => BULLET.test(l)) ? lines.map(l => l.trim()) : []
}

/** The most suggestions one task keeps (over all its tries, workers and checkers). */
export const SUGGESTIONS_MAX = 12

/**
 * Task suggestions `kept` with the "Learned:" lines of report `answer` added at the end (cleaned, see cleanLearned);
 * an exact repeat (the same words, case and marks aside) of one already kept is skipped. At most SUGGESTIONS_MAX.
 */
export function addSuggestions(kept: readonly string[] | undefined, answer: string, debrief = false): string[] {
  const out = [...(kept ?? [])]
  for (const s of cleanLearned(debrief ? debriefLines(answer) : splitLearned(answer).lines)) {
    if (out.length >= SUGGESTIONS_MAX) break
    if (!out.some(x => wordsOf(x) === wordsOf(s))) out.push(s)
  }
  return out
}

/**
 * The lead's board update lines for task `id`'s org-mem suggestions (`tool`: how the lead calls the orgmem tool, e.g.
 * "symcc orgmem"); '' when there are none (nothing to add).
 */
export function suggestedText(id: string, lines: readonly string[], tool: string): string {
  if (!lines.length) return ''
  return [`${id}: Suggested for org-mem (decide with ${tool}; most are skipped):`, ...lines.map(l => `- ${l}`)].join('\n')
}

/** T-717: the topic of a note written without one (old lines, lines written by hand). */
export const TOPIC_UNSORTED = 'unsorted'

/** T-717: the longest a topic name may be. */
export const TOPIC_MAX_CHARS = 24

/**
 * T-717: topic name `raw` made plain (lower case, spaces squeezed, trimmed); '' when it is empty, longer than
 * TOPIC_MAX_CHARS or has anything but letters, digits, spaces, "·" and "-".
 */
export function cleanTopic(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const s = raw.replace(/\s+/g, ' ').trim().toLowerCase()
  return s && s.length <= TOPIC_MAX_CHARS && /^[a-z0-9][a-z0-9 ·-]*$/.test(s) ? s : ''
}

/** Why a topic name was refused (for the lead's tool answers). */
export const BAD_TOPIC = `a topic is a short name: lower case letters, digits, spaces, "·" and "-", at most ${TOPIC_MAX_CHARS} characters`

/** An org-mem line for lesson `text` on day `date` with topic `topic` (T-717): "- 2026-11-21 [tests] lesson" ("- [tests] lesson" without a date). */
export const orgMemLine = (date: string, text: string, topic: string) => `- ${date ? `${date} ` : ''}[${topic}] ${text}`

/** T-717: a note the lead adds: its text and its topic. */
export type OrgMemNewNote = { text: string; topic: string }

/** A note the lead gives, made one plain line (list mark, any old "T-12 " task id and any "2026-11-20:" front off, cut at LEARNED_LINE_CHARS); '' when it is empty, secret-looking or file contents. */
export function cleanNote(raw: string): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/^(?:[-*•+]|\d+[.)])\s+/, '').replace(/^T-\d+\s+/, '')
  return cleanLearned([plainLesson(s)])[0] ?? ''
}

/** Org-mem `lines` joined back into the file's text ('' with none). */
const joinLines = (lines: readonly string[]) => (lines.length ? `${lines.join('\n')}\n` : '')

/**
 * Org-mem `guide` with `notes` added at its end as "- 2026-11-21 [topic] lesson" (day `date`, T-717: each note's
 * topic, see cleanTopic). A note that near-matches one already there, or one added just before (sameLesson), is
 * refused as a repeat; an empty or secret-looking one as bad; one with a missing or bad topic as `noTopic`. When the
 * new notes would take org-mem past `max` lines, nothing is added (`full`). `text` is the new file (unchanged when
 * nothing was added).
 */
export function orgMemAdd(guide: string | null | undefined, notes: readonly OrgMemNewNote[], date: string, max = ORG_MEM_MAX_LINES): { text: string; added: string[]; repeats: string[]; bad: string[]; noTopic: string[]; full: boolean } {
  const old = orgMemLines(guide)
  const added: OrgMemNewNote[] = []
  const repeats: string[] = []
  const bad: string[] = []
  const noTopic: string[] = []
  for (const raw of notes) {
    const s = cleanNote(raw.text)
    const topic = cleanTopic(raw.topic)
    if (!s) bad.push(String(raw.text ?? ''))
    else if (!topic) noTopic.push(s)
    else if ([...old, ...added.map(x => x.text)].some(l => sameLesson(l, s))) repeats.push(s)
    else added.push({ text: s, topic })
  }
  const text = String(guide ?? '')
  const said = added.map(x => x.text)
  if (added.length && old.length + added.length > max) return { text, added: [], repeats, bad, noTopic, full: true }
  if (!added.length) return { text, added: said, repeats, bad, noTopic, full: false }
  return { text: joinLines([...old, ...added.map(x => orgMemLine(date, x.text, x.topic))]), added: said, repeats, bad, noTopic, full: false }
}

/**
 * The note of org-mem `guide` that `which` names: a number (its place in the file, see OrgMemNote; "3" and "#3"
 * too), or its text (the same words, else the one note that near-matches it, see sameLesson). Null for none, or when
 * the text near-matches more than one.
 */
export function findOrgMemNote(guide: string | null | undefined, which: string | number): OrgMemNote | null {
  const notes = orgMemNotes(guide)
  const num = typeof which === 'number' ? which : /^\s*#?\d+\s*$/.test(String(which)) ? Number(String(which).replace(/\D/g, '')) : NaN
  if (!Number.isNaN(num)) return notes.find(x => x.n === num) ?? null
  const w = wordsOf(lessonOf(String(which ?? '')))
  if (!w) return null
  const same = notes.find(x => wordsOf(x.text) === w)
  if (same) return same
  const near = notes.filter(x => sameLesson(x.text, String(which)))
  return near.length === 1 ? near[0]! : null
}

/** Org-mem `guide` without the note `which` names (see findOrgMemNote): `removed` is it, or null (nothing changed). */
export function orgMemRemove(guide: string | null | undefined, which: string | number): { text: string; removed: OrgMemNote | null } {
  const note = findOrgMemNote(guide, which)
  if (!note) return { text: String(guide ?? ''), removed: null }
  return deleteOrgMemNote(guide, note.n, note.text)
}

/**
 * Org-mem `guide` with the note `which` names (see findOrgMemNote) replaced, in its place, by note `by` on day
 * `date`, keeping the old note's topic, or (T-717) taking `topic` when given. Refused (nothing changed, `why` says
 * why) when there is no such note, `by` is empty or secret-looking, `topic` is bad (see cleanTopic), or `by`
 * near-matches another note (sameLesson).
 */
export function orgMemReplace(guide: string | null | undefined, which: string | number, by: string, date: string, topic?: string): { text: string; old: OrgMemNote | null; now: string; topic: string; why?: string } {
  const text = String(guide ?? '')
  const old = findOrgMemNote(guide, which)
  if (!old) return { text, old: null, now: '', topic: '', why: 'no such note' }
  const s = cleanNote(by)
  if (!s) return { text, old, now: '', topic: old.topic, why: 'the new note is empty, looks secret or is file contents' }
  const t = topic === undefined ? old.topic : cleanTopic(topic)
  if (!t) return { text, old, now: s, topic: old.topic, why: BAD_TOPIC }
  const twin = orgMemNotes(guide).find(x => x.n !== old.n && sameLesson(x.text, s))
  if (twin) return { text, old, now: s, topic: t, why: `the new note repeats note ${twin.n} ("${twin.text}")` }
  return { text: setLine(text, old.n, orgMemLine(date, s, t)), old, now: s, topic: t }
}

/** Text `text` with its `n`th non-empty line (1 = the first) put as `line`; every other line stays as written. */
function setLine(text: string, n: number, line: string): string {
  const raw = text.split('\n')
  let seen = 0
  const at = raw.findIndex(l => l.trim() && ++seen === n)
  if (at >= 0) raw[at] = line
  return raw.join('\n')
}

/**
 * T-717: org-mem `guide` with topic `topic` set on several notes at once, keeping their dates and texts: the notes
 * `which` names (numbers from list, e.g. "3,7,12" or "3 7 12"), and every note of topic `from` (to rename a topic or
 * merge it into another). `why` (nothing changed) when the topic is bad or nothing is named; `missing`: the numbers
 * that name no note (the others still change). A note written by hand without a date gets day `date` (today when
 * left out), since only a dated line carries a topic: "- [WIP] x" becomes "- 2026-11-21 [tests] [WIP] x".
 */
export function orgMemSetTopic(guide: string | null | undefined, which: string | number | undefined, topic: string, from?: string, date = new Date().toISOString().slice(0, 10)): { text: string; changed: OrgMemNote[]; missing: string[]; why?: string } {
  const text = String(guide ?? '')
  const t = cleanTopic(topic)
  if (!t) return { text, changed: [], missing: [], why: BAD_TOPIC }
  const notes = orgMemNotes(guide)
  const parts = which === undefined ? [] : String(which).split(/[\s,;]+/).map(x => x.replace(/^#/, '')).filter(Boolean)
  const missing: string[] = []
  const picked = new Set<number>()
  for (const p of parts) {
    const n = /^\d+$/.test(p) ? Number(p) : NaN
    if (notes.some(x => x.n === n)) picked.add(n)
    else missing.push(p)
  }
  const fromTopic = from === undefined ? '' : cleanTopic(from)
  if (from !== undefined && !fromTopic) return { text, changed: [], missing, why: `from: ${BAD_TOPIC}` }
  if (fromTopic) for (const x of notes) if (x.topic === fromTopic) picked.add(x.n)
  if (!picked.size) return { text, changed: [], missing, why: fromTopic ? `no note has topic "${fromTopic}"` : 'which names no note (give numbers from list, e.g. "3,7,12", or from: a topic)' }
  let next = text
  const changed: OrgMemNote[] = []
  for (const x of [...notes].reverse()) {
    if (!picked.has(x.n) || x.topic === t) continue
    next = setLine(next, x.n, orgMemLine(x.date || date, x.text, t))
    changed.push(x)
  }
  return { text: next, changed, missing }
}

/** T-717: the topics of `notes` with how many notes each has, the biggest first (then by name). */
export function orgMemTopics(notes: readonly OrgMemNote[]): { topic: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const x of notes) counts.set(x.topic, (counts.get(x.topic) ?? 0) + 1)
  return [...counts].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}

/** Org-mem's notes as the lead's orgmem list shows them: one per line, "#3 2026-11-20 [tests] lesson", oldest first, with the count and limit, then (T-717) the topics with their counts. */
export function orgMemList(guide: string | null | undefined, file: string): string {
  const notes = [...orgMemNotes(guide)].reverse()
  if (!notes.length) return `${file} has no notes yet (at most ${ORG_MEM_MAX_LINES}).`
  return [
    `${file}: ${orgMemCount(notes.length)} (at most ${ORG_MEM_MAX_LINES}), oldest first:`,
    ...notes.map(x => `#${x.n} ${x.date ? `${x.date} ` : ''}[${x.topic}] ${x.text}`),
    `Topics (${orgMemTopics(notes).length}): ${orgMemTopics(notes).map(x => `${x.topic} ${x.count}`).join(', ')}`,
  ].join('\n')
}

/**
 * T-632: org-mem `guide` with the task ids taken off its old lines ("- T-12 2026-11-20: x" becomes "- 2026-11-20: x"),
 * for the one-time conversion; `changed` when any line had one.
 */
export function dropTaskIds(guide: string | null | undefined): { text: string; changed: boolean } {
  const text = String(guide ?? '')
  const next = text.replace(/^(\s*[-*•]\s+)T-\d+\s+(?=\d{4}-\d{2}-\d{2})/gm, '$1')
  return { text: next, changed: next !== text }
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

// ---------------- T-619, T-687: the Organizational memory page (opened from the bottom of the Live tab) ----------------

/** One note of org-mem as the Organizational memory page lists it: `n` is its place in the file (1 = the first, oldest line), so
 *  appending new notes keeps the numbers; `date` is '' for a line the owner wrote by hand without one; `topic` (T-717) is the
 *  "[topic]" after the date, TOPIC_UNSORTED for a line without one. */
export type OrgMemNote = { n: number; date: string; topic: string; text: string }

/** The page's title. */
export const ORG_MEM_TITLE = 'Organizational memory (org-mem)'

/** What the page says when org-mem has no notes. */
export const ORG_MEM_EMPTY = 'No notes yet.'

/** "3 notes". */
export const orgMemCount = (n: number) => `${n} note${n === 1 ? '' : 's'}`


/** The Live tab's key for the page with all notes (free there: m is the board mode only on the Tasks page). */
export const ORG_MEM_KEY = 'm'

/** The page's one-line explanation: where the file is, who adds to it, and its limit. */
export const orgMemAbout = (file: string) =>
  `Notes for the agents: symcc puts ${file} (at most ${ORG_MEM_MAX_LINES} lines) into every new worker's, checker's and scout's prompt. Agents may suggest notes right after they hand back a task (one short follow-up question); the lead decides what goes in. You may edit the file by hand too.`

/** The front of a note line: "- 2026-11-20: " (old) or "- 2026-11-21 " (T-717, a "[topic]" follows). */
const NOTE_FRONT = /^\s*(?:[-*•]\s+)?(\d{4}-\d{2}-\d{2})\s*(:?)\s*/

/** T-717: a "[topic] " at the front of the rest of a line: the "]" is followed by a space or the end, so a markdown link ("[link](url)") is not a topic. */
const TOPIC_FRONT = /^\[([^\]\n]{1,40})\](?:\s+|$)/

/** `rest` (a line after its date) split into its topic (TOPIC_UNSORTED without a good "[topic]") and text. */
function topicAndText(rest: string): { topic: string; text: string } {
  const m = TOPIC_FRONT.exec(rest)
  const topic = m ? cleanTopic(m[1]) : ''
  return topic ? { topic, text: rest.slice(m![0].length).trim() } : { topic: TOPIC_UNSORTED, text: rest.trim() }
}

/** Org-mem's notes, newest (last in the file) first, each with its date, topic and text (see OrgMemNote). */
export function orgMemNotes(guide: string | null | undefined): OrgMemNote[] {
  return orgMemLines(guide)
    .map((line, i): OrgMemNote => {
      const m = NOTE_FRONT.exec(line)
      // a hand-written line without a date never has a topic: it is "unsorted" with its text whole (only its list
      // mark is taken off), so "- [WIP] x" keeps "[WIP]"
      if (!m) return { n: i + 1, date: '', topic: TOPIC_UNSORTED, text: line.replace(/^\s*[-*•]\s+/, '').trim() }
      const rest = line.slice(m[0].length)
      // an old line ("2026-11-20: ...") has no topic: its text stays whole, even when it starts with "[WIP]"
      if (m[2]) return { n: i + 1, date: m[1]!, topic: TOPIC_UNSORTED, text: rest.trim() }
      return { n: i + 1, date: m[1]!, ...topicAndText(rest) }
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

/** A note's line on the page above its text: "#3 · 2026-11-20" ("#3 · written by hand" without a date). */
export const orgMemNoteHead = (x: OrgMemNote) => `#${x.n} · ${x.date || 'written by hand'}`

/** The page's key hints: x deletes the note under the cursor (after a confirm step: y yes, x cancel). No "views" hint: it is a page opened from Live, like a role's or a question's page (T-704). */
export const orgMemKeys = (confirming = false, notes = true): KeyHint[] =>
  confirming
    ? [{ key: 'y', word: 'yes, delete' }, { key: 'x', word: 'cancel' }]
    : [...(notes ? [{ key: '↑↓', word: 'move' }, { key: 'x', word: 'delete' }] : []), { key: 'b', word: 'back' }]

// ---------------- T-718: the Live tab's Organizational memory section (drawn by core/live.ts's liveOrgMem) ----------------

/** How many of the newest notes the Live tab's section shows. */
export const ORG_MEM_NEWEST = 3

/** The `n` newest notes of `notes` (orgMemNotes gives them newest first). */
export const orgMemNewest = (notes: readonly OrgMemNote[], n = ORG_MEM_NEWEST): OrgMemNote[] => notes.slice(0, n)

/** The topics of `notes` with their counts as the Live tab lists them: the biggest first (then by name), "unsorted" last. */
export function orgMemTopicCounts(notes: readonly OrgMemNote[]): { topic: string; count: number }[] {
  const all = orgMemTopics(notes)
  return [...all.filter(x => x.topic !== TOPIC_UNSORTED), ...all.filter(x => x.topic === TOPIC_UNSORTED)]
}

/** The notes of topic `topic` (all of them when it is null or ''), in the same order. */
export const orgMemOfTopic = (notes: readonly OrgMemNote[], topic?: string | null): OrgMemNote[] => (topic ? notes.filter(x => x.topic === topic) : [...notes])

/** Note `pick` in `notes` now: a delete moves the numbers of the lines after it, so a picked note is found again by
 *  its date, topic and text (the one nearest its old number when the same note is there twice); undefined once it is gone. */
export function orgMemFind(notes: readonly OrgMemNote[], pick: OrgMemNote | null | undefined): OrgMemNote | undefined {
  if (!pick) return undefined
  const same = notes.filter(x => x.date === pick.date && x.topic === pick.topic && x.text === pick.text)
  return same.sort((a, b) => Math.abs(a.n - pick.n) - Math.abs(b.n - pick.n))[0]
}

/** The org-mem page's title: ORG_MEM_TITLE for all notes, "Organizational memory · tests" for one topic's. */
export const orgMemPageTitle = (topic?: string | null) => (topic ? `Organizational memory · ${topic}` : ORG_MEM_TITLE)

/** What a topic's page says when it has no notes (its last one was deleted). */
export const orgMemTopicEmpty = (topic: string) => `No notes with topic "${topic}" now.`

/** The key hints under the Live tab's section: "↑↓ move · Enter open topic · m all notes". */
export const orgMemSectionKeys = (): KeyHint[] => [
  { key: '↑↓', word: 'move' },
  { key: 'Enter', word: 'open topic' },
  { key: ORG_MEM_KEY, word: 'all notes' },
]

/** A note's day as the section shows it: "11-21" (month and day); "—" for a line written by hand without one. */
export const orgMemShortDay = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5) : '—')

/** The confirm step's question: "Delete note #3 · 2026-11-20 from .symcc/org-mem.md?" */
export const orgMemDeleteAsk = (x: OrgMemNote, file: string) => `Delete note ${orgMemNoteHead(x)} from ${file}?`
