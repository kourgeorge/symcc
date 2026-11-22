// The lead's notes in a task's details (T-851). "change add_details" adds "Note (lead, <date>): ..." as a new paragraph at
// the end (addDetailsText in history.ts). A worker's prompt lists them apart from the task text. Pure.

/** One note the lead added: its day ('' when it has none) and its text. */
export type LeadNote = { day: string; text: string }

const NOTE_START = /^Note \(lead(?:, ([^)]*))?\):\s*/
const ANSWER_START = /^(?:Owner's answer\b|Follow-up question \(owner\b)/

/**
 * `details` split into the task's own text and the lead's notes (oldest first). A note is a paragraph that starts
 * "Note (lead, <day>): "; the paragraphs after it that are not another note or the owner's answer belong to it.
 * The owner's answers stay in the text.
 */
export function splitLeadNotes(details: string): { text: string; notes: LeadNote[] } {
  const paras = String(details ?? '').split(/\n{2,}/)
  const text: string[] = []
  const notes: LeadNote[] = []
  let inNote = false
  for (const p of paras) {
    const m = NOTE_START.exec(p)
    if (m) {
      notes.push({ day: m[1]?.trim() ?? '', text: p.slice(m[0].length).trim() })
      inNote = true
    } else if (inNote && !ANSWER_START.test(p)) {
      notes[notes.length - 1]!.text += `\n\n${p.trim()}`
    } else {
      inNote = false
      text.push(p)
    }
  }
  return { text: text.join('\n\n').trim(), notes }
}

/** The "Notes from the lead" text: the rule for a clash, then the notes oldest first; null when there are none. */
export function leadNotesText(notes: readonly LeadNote[]): string | null {
  if (!notes.length) return null
  const list = notes.map(n => {
    const [first, ...rest] = (n.text || '(empty)').split('\n')
    return `- ${n.day ? `${n.day}: ` : ''}${first}${rest.map(l => `\n  ${l}`).join('')}`
  })
  return `Where a note and the text above differ, the newest note wins.\n\n${list.join('\n')}`
}
