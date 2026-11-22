// T-600, T-620, T-632: organizational memory (org-mem) on disk (<project>/.<name>/org-mem.md; the pure parts are in core/org-mem.ts).
// Every new worker, checker and scout gets org-mem in its prompt (orgMemText). The debrief's answer (app/debrief.ts,
// T-656) and a report's "Learned:" lines (a host with no debrief) are only suggestions: they are kept on the task (keepSuggestions) and listed in the lead's board update when the task is
// done (a dropped task's are thrown away; see the task event listener below). Only the lead changes org-mem, with its
// orgmem tool (orgMemTool); the owner may delete notes on the org-mem page (its button is at the bottom of the Live tab) or edit the file by hand.
import { addSuggestions, cleanTopic, deleteOrgMemNote, dropTaskIds, orgMemAdd, orgMemFile, orgMemList, orgMemNotes, orgMemRemove, orgMemReplace, orgMemSection, orgMemSetTopic, suggestedText, BAD_TOPIC, ORG_MEM_MAX_LINES, type OrgMemNewNote, type OrgMemNote } from '../core/org-mem'
import { find, isFinished, type Board, type BoardTask } from '../core/board-file'
import { patchTask } from '../core/task'
import type { Host } from '../host'
import { onTaskEvent } from './events'
import { S, toolName } from './state'
import { change, load, now, oneAtATime, path, safeWrite } from './store'
import { tellLead } from './tell'

/** Org-mem's text, or null when it is missing or can't be read. */
async function readGuide(host: Host): Promise<string | null> {
  try {
    return await host.fs.read(path(orgMemFile(S.N.dir)))
  } catch {
    return null
  }
}

/** Org-mem as a new agent's prompt shows it (see orgMemSection): '' when the file is missing, empty or can't be read. */
export async function orgMemText(host: Host): Promise<string> {
  return orgMemSection(await readGuide(host), orgMemFile(S.N.dir))
}

/**
 * Keeps the "Learned:" lines of task `id`'s report `answer` on the task as org-mem suggestions (see addSuggestions);
 * org-mem itself is not touched. Nothing is written when the report has no new ones. Never throws: a failure only
 * loses the suggestions.
 */
export async function keepSuggestions(host: Host, id: string, answer: string): Promise<void> {
  if (!S.root) return
  const b = await load(host).catch(() => null)
  const t = b ? (find(b, id) as BoardTask | undefined) : undefined
  if (!t) return
  const next = addSuggestions(t.suggested, answer)
  if (next.length === (t.suggested?.length ?? 0)) return
  await change(host, b => {
    const cur = find(b, id) as BoardTask | undefined
    if (!cur) return b
    const all = addSuggestions(cur.suggested, answer)
    return all.length === (cur.suggested?.length ?? 0) ? b : patchTask(b, id, { suggested: all }, now(), S.N.dir)
  }).catch(() => undefined)
}

/**
 * T-632: when a task becomes done, the lead's next board update lists its org-mem suggestions (suggestedText) and
 * they are taken off the task; when it is dropped, they are thrown away. Nothing happens for a task without any.
 */
async function onDoneOrDropped(events: readonly { task: string; kind: string; to: string | null }[], host: Host): Promise<void> {
  if (S.guardOnly || !S.root) return
  const ends = events.filter(e => e.kind === 'state' && isFinished({ status: e.to }))
  if (!ends.length) return
  const b = await load(host)
  const ids = ends.map(e => e.task).filter(id => ((find(b, id) as BoardTask | undefined)?.suggested?.length ?? 0) > 0)
  if (!ids.length) return
  const told = await change(host, x => {
    const out: [string, string[]][] = []
    let y = x
    for (const id of ids) {
      const t = find(y, id) as BoardTask | undefined
      if (!t?.suggested?.length || !isFinished(t)) continue
      if (t.status === 'done') out.push([id, t.suggested])
      y = { ...y, tasks: y.tasks.map(z => (z.id === id ? (({ suggested: _, ...rest }) => rest)(z as BoardTask) : z)) }
    }
    return [y, out] as [Board, [string, string[]][]]
  })
  for (const [id, lines] of told) tellLead(host, suggestedText(id, lines, toolName('orgmem')))
}

onTaskEvent(onDoneOrDropped)

/** What the lead's orgmem tool gets (see TOOLS in tools.ts). */
export type OrgMemInput = { action?: unknown; notes?: unknown; note?: unknown; which?: unknown; by?: unknown; topic?: unknown; from?: unknown }

/** T-717: add's notes as {text, topic}: each item an object {text, topic}, or a plain string taking the call's `topic`. */
function newNotes(a: OrgMemInput): OrgMemNewNote[] {
  const all = Array.isArray(a.notes) ? a.notes : [a.notes ?? a.note]
  const shared = typeof a.topic === 'string' ? a.topic : ''
  const out: OrgMemNewNote[] = []
  for (const x of all) {
    if (typeof x === 'string') {
      if (x.trim()) out.push({ text: x, topic: shared })
    } else if (x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string' && (x as { text: string }).text.trim()) {
      const t = (x as { topic?: unknown }).topic
      out.push({ text: (x as { text: string }).text, topic: typeof t === 'string' ? t : shared })
    }
  }
  return out
}

/**
 * T-632: the lead's orgmem tool. list (the default): every note with its number and topic, then the topics with their
 * counts; add: `notes` (one or more, each with a topic, T-717) at the end, refused past ORG_MEM_MAX_LINES lines or as
 * a near repeat (sameLesson); remove: the note `which` names (its number or text); replace: the note `which` names by
 * `by`, in its place (its topic kept unless `topic` is given); topic (T-717): sets `topic` on the notes `which` names
 * ("3,7,12") and on every note of topic `from`. Writes org-mem one save at a time with the other writers. Answers what
 * happened, in short lines.
 */
export async function orgMemTool(host: Host, a: OrgMemInput): Promise<string> {
  if (!S.root) return 'No project folder yet.'
  const file = orgMemFile(S.N.dir)
  const action = typeof a.action === 'string' && a.action.trim() ? a.action.trim().toLowerCase() : 'list'
  const date = now().slice(0, 10)
  const save = (text: string) => safeWrite(host, path(file), text, 'the organizational memory (org-mem)')
  const which = typeof a.which === 'number' || typeof a.which === 'string' ? a.which : undefined
  if (action === 'list') return orgMemList(await readGuide(host), file)
  return oneAtATime(file, async (): Promise<string> => {
    const old = await readGuide(host)
    if (action === 'add') {
      const notes = newNotes(a)
      if (!notes.length) throw new Error('add needs notes: one or more {text, topic}')
      const r = orgMemAdd(old, notes, date)
      const parts: string[] = []
      if (r.full) parts.push(`Not added: ${file} would go past ${ORG_MEM_MAX_LINES} lines. Remove or replace a note first (action list shows them).`)
      if (r.added.length) {
        await save(r.text)
        parts.push(`Added to ${file}: ${r.added.map(x => `"${x}"`).join(', ')}.`)
      }
      if (r.repeats.length) parts.push(`Not added, already there (or close to a note there; use replace to improve it): ${r.repeats.map(x => `"${x}"`).join(', ')}.`)
      if (r.bad.length) parts.push(`Not added (empty, looks secret or is file contents): ${r.bad.length}.`)
      if (r.noTopic.length) parts.push(`Not added, no good topic (${BAD_TOPIC}): ${r.noTopic.map(x => `"${x}"`).join(', ')}.`)
      return parts.join('\n')
    }
    if (action === 'topic') {
      const from = typeof a.from === 'string' && a.from.trim() ? a.from : undefined
      const r = orgMemSetTopic(old, which, typeof a.topic === 'string' ? a.topic : '', from, date)
      const missing = r.missing.length ? ` No note ${r.missing.join(', ')} (skipped).` : ''
      if (r.why) return `Topics not changed: ${r.why}.${missing}`
      if (r.changed.length) await save(r.text)
      const t = cleanTopic(a.topic)
      return r.changed.length ? `Set topic "${t}" on ${r.changed.length === 1 ? 'note' : 'notes'} ${r.changed.map(x => x.n).join(', ')} in ${file}.${missing}` : `Those notes already have topic "${t}": nothing changed.${missing}`
    }
    if (which === undefined) throw new Error(`${action} needs which: the note's number (see action list) or its text`)
    if (action === 'remove') {
      const r = orgMemRemove(old, which)
      if (!r.removed) return `No note ${JSON.stringify(which)} in ${file} (a number from action list, or the note's text): nothing removed.`
      await save(r.text)
      return `Removed note ${r.removed.n} from ${file}: "${r.removed.text}".`
    }
    if (action === 'replace') {
      const by = typeof a.by === 'string' ? a.by : typeof a.note === 'string' ? a.note : ''
      const r = orgMemReplace(old, which, by, date, typeof a.topic === 'string' ? a.topic : undefined)
      if (r.why) return `Not replaced: ${r.why}.`
      await save(r.text)
      return `Replaced note ${r.old!.n} in ${file}: "${r.old!.text}" is now "${r.now}" [${r.topic}].`
    }
    throw new Error(`action must be list, add, remove, replace or topic (got ${JSON.stringify(a.action)})`)
  })
}

/**
 * T-632: at session start, the task ids are taken off org-mem's old lines ("- T-12 2026-11-20: x" becomes
 * "- 2026-11-20: x", see dropTaskIds); a file without any is not written. Never throws.
 * (The old .<name>/field-guide.md is moved to org-mem.md by /<name>-doctor fix migrate-data.)
 */
export async function moveOldOrgMem(host: Host): Promise<void> {
  if (S.guardOnly || !S.root) return
  const to = path(orgMemFile(S.N.dir))
  try {
    await oneAtATime(orgMemFile(S.N.dir), async () => {
      const r = dropTaskIds(await readGuide(host))
      if (r.changed) await safeWrite(host, to, r.text, 'the organizational memory (org-mem)')
    })
  } catch {
    // the old lines keep their ids
  }
}

/** T-619: what the Organizational memory page (opened from the Live tab) shows: whether it is open, and the note whose delete
 *  waits for a yes (its number, see OrgMemNote; null for none). */
export const orgMemView = { open: false, confirm: null as number | null }

/** Closes the Organizational memory page. */
export function resetOrgMemView() {
  orgMemView.open = false
  orgMemView.confirm = null
}

/** T-619: org-mem's notes for the org-mem page opened from the Live tab (newest first, see orgMemNotes) and its file's path in the project
 *  (".symcc/org-mem.md"); no notes when the file is missing or can't be read. */
export async function orgMemNow(host: Host): Promise<{ notes: OrgMemNote[]; file: string }> {
  return { notes: S.root ? orgMemNotes(await readGuide(host)) : [], file: orgMemFile(S.N.dir) }
}

/**
 * T-619: deletes note `n` (its place in the file, see OrgMemNote) from org-mem, one save at a time with the other
 * writers; `expect`: its text as the page showed it, `key`: its check word (orgMemNoteKey; see deleteOrgMemNote). What happened, in a short line.
 */
export async function deleteOrgMem(host: Host, n: number, expect?: string, key?: string): Promise<{ ok: boolean; text: string }> {
  if (!S.root) return { ok: false, text: 'No project folder yet.' }
  const file = orgMemFile(S.N.dir)
  return oneAtATime(file, async () => {
    const old = await readGuide(host)
    const { text, removed } = deleteOrgMemNote(old, n, expect, key)
    if (!removed) return { ok: false, text: `No note ${n} in ${file} (it may have changed): nothing deleted.` }
    await safeWrite(host, path(file), text, 'the organizational memory (org-mem)')
    return { ok: true, text: `Deleted note ${n} from ${file}${removed.date ? ` (${removed.date})` : ''}.` }
  }).catch((err: Error) => ({ ok: false, text: `Couldn't delete note ${n}: ${err?.message ?? err}` }))
}
