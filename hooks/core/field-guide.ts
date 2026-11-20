// T-600: the Field Guide. Workers, checkers and investigations may end their report with a "Learned:" section: up to
// LEARNED_MAX short lines about the project that would save the next agent time (how to test, a trap, where something
// is). symcc keeps them in <project>/.<name>/field-guide.md (one line each, with the task id and date, duplicates
// skipped, at most GUIDE_MAX_LINES lines, oldest dropped first) and puts the whole file into every new worker's,
// checker's and scout's prompt. The owner and the lead may edit or trim the file by hand. Everything here is pure.

/** The file's name inside symcc's data folder (e.g. .symcc/field-guide.md). */
export const GUIDE_FILE_NAME = 'field-guide.md'

/** The guide's path inside the project, for data folder `dir` (e.g. ".symcc"). */
export const guideFile = (dir: string) => `${dir}/${GUIDE_FILE_NAME}`

/** The most lines the guide keeps (older ones are dropped first). */
export const GUIDE_MAX_LINES = 60

/** The most "Learned:" lines taken from one report. */
export const LEARNED_MAX = 3

/** The longest a kept line may be (longer ones are cut, with "…"). */
export const LEARNED_LINE_CHARS = 200

/** What the prompts ask for at the end of a report (the same words in every prompt). */
export const LEARNED_ASK = `At the very end of your report you may add a "Learned:" section: 0 to ${LEARNED_MAX} short lines, each starting with "- ", about this project that would save the next agent time (how to test, a trap, where something is). Not about this task's own content, no file contents, and nothing secret. Leave it out when there is nothing new.`

/** The heading line of the section: "Learned:", maybe as **Learned:** or "## Learned", with an optional first line after it. */
const HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*learned\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*(.*)$/i
/** A heading must have a colon or be a markdown heading, so a sentence starting with "Learned" is not taken for one. */
const HEADING_MARK = /^\s*(?:#{1,6}\s*(?:\*\*|__)?\s*learned\b|(?:\*\*|__)?\s*learned\s*(?:\*\*|__)?\s*:)/i

/** A checker's OK line (see checkerVerdict), which may still come after the section. */
const OK_LINE = /^[*_`"'\s]*ok[.!]?[*_`"'\s]*$/i

/**
 * `answer` split into its body and its "Learned:" lines (raw, not cleaned yet). The section is the last "Learned:"
 * heading and everything after it; a lone OK line at its very end (a checker that put its verdict last anyway)
 * stays with the body. No section: the whole answer is the body and there are no lines.
 */
export function splitLearned(answer: string): { body: string; lines: string[] } {
  const text = String(answer ?? '')
  const all = text.split('\n')
  let at = -1
  for (let i = all.length - 1; i >= 0; i--) {
    if (HEADING_MARK.test(all[i]!)) {
      at = i
      break
    }
  }
  if (at < 0) return { body: text, lines: [] }
  const first = HEADING.exec(all[at]!)?.[1] ?? ''
  const rest = [first, ...all.slice(at + 1)].map(l => l.trim()).filter(Boolean)
  let ok = ''
  if (rest.length && OK_LINE.test(rest.at(-1)!)) ok = rest.pop()!
  const body = [...all.slice(0, at), ...(ok ? ['', ok] : [])].join('\n').trimEnd()
  return { body, lines: rest }
}

/** Text that looks like a secret: a key=value with a secret-ish name, a known token prefix, a private key, or one long unbroken token. */
const SECRET = [
  /\b(?:password|passwd|pwd|secret|token|api[_ -]?key|access[_ -]?key|private[_ -]?key)\b\s*[:=]\s*\S+/i,
  /\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})/,
  /-----BEGIN [A-Z ]*KEY-----/,
  /[A-Za-z0-9+=_-]{40,}/,
]

/** Whether `s` looks like it holds a secret (see SECRET). */
export const looksSecret = (s: string): boolean => SECRET.some(r => r.test(s))

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

/** A guide line's lesson, without its "- T-12 2026-11-20:" front (lines the owner wrote by hand are taken as they are). */
const lessonOf = (line: string) => line.replace(/^\s*[-*•]?\s*(?:T-\d+\s+)?(?:\d{4}-\d{2}-\d{2})?\s*:?\s*/, '')

/** The words of `s`, lower case, for comparing. */
const wordsOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Whether lessons `a` and `b` say the same (case-insensitive near-match): the same words, one holding the other, or mostly the same words. */
export function sameLesson(a: string, b: string): boolean {
  const x = wordsOf(lessonOf(a))
  const y = wordsOf(lessonOf(b))
  if (!x || !y) return false
  if (x === y) return true
  if (Math.min(x.length, y.length) >= 20 && (x.includes(y) || y.includes(x))) return true
  const xs = new Set(x.split(' '))
  const ys = new Set(y.split(' '))
  if (xs.size < 3 || ys.size < 3) return false
  const both = [...xs].filter(w => ys.has(w)).length
  return both / new Set([...xs, ...ys]).size >= 0.8
}

/** The guide's lines: its non-empty lines, as written. */
export const guideLines = (guide: string | null | undefined): string[] => String(guide ?? '').split('\n').map(l => l.trimEnd()).filter(l => l.trim())

/**
 * The guide `guide` with the "Learned:" lines of `answer` (task `id`'s report, on day `date`, e.g. "2026-11-20") added
 * at its end as "- T-12 2026-11-20: lesson", each once (a line that near-matches one already in the guide, or one
 * added just before, is skipped), and cut to its last `max` lines. `added`: the lessons added (none: `text` is the
 * guide as it was, so nothing needs writing).
 */
export function addLearned(guide: string | null | undefined, answer: string, id: string, date: string, max = GUIDE_MAX_LINES): { text: string; added: string[] } {
  const old = guideLines(guide)
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
 * The guide as a prompt shows it: a short heading, then its last GUIDE_MAX_LINES lines (each cut, so a hand-edited
 * file can't flood the prompt). `file`: where it is, named in the heading. '' when the guide is missing or empty.
 */
export function guideSection(guide: string | null | undefined, file: string): string {
  const lines = guideLines(guide).slice(-GUIDE_MAX_LINES).map(l => (l.length > 400 ? `${l.slice(0, 399)}…` : l))
  if (!lines.length) return ''
  return `\nNotes earlier agents left about this project (from ${file}; they may be out of date):\n${lines.join('\n')}\n`
}
