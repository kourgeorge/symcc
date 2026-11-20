// T-600, T-620: organizational memory (org-mem) on disk (<project>/.<name>/org-mem.md; the pure parts are in core/org-mem.ts).
// A worker's or checker's report adds its "Learned:" lines (learnFrom); every new worker, checker and scout gets the
// org-mem in its prompt (orgMemText). The owner and the lead may edit or trim the file by hand.
import { addLearned, deleteOrgMemNote, orgMemFile, orgMemNotes, orgMemSection, type OrgMemNote } from '../core/org-mem'
import type { Host } from '../host'
import { S } from './state'
import { now, oneAtATime, path, safeWrite } from './store'

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
 * Adds the "Learned:" lines of task `id`'s report `answer` to org-mem (see addLearned), one save at a time. Nothing
 * is written when the report has no new lines. Never throws: org-mem is a help, so a failure only loses the lines.
 */
export async function learnFrom(host: Host, id: string, answer: string): Promise<void> {
  if (S.guardOnly || !S.root) return
  const file = orgMemFile(S.N.dir)
  await oneAtATime(file, async () => {
    const old = await readGuide(host)
    const { text, added } = addLearned(old, answer, id, now().slice(0, 10))
    if (added.length) await safeWrite(host, path(file), text, 'the organizational memory (org-mem)')
  }).catch(() => undefined)
}

/**
 * T-620: the one-time move of the old notes file (.<name>/field-guide.md, its name before T-620) to org-mem.md, at
 * session start. Only when the old file exists and org-mem.md doesn't; nothing else reads the old name. Never throws.
 */
export async function moveOldOrgMem(host: Host): Promise<void> {
  if (S.guardOnly || !S.root) return
  const from = path(`${S.N.dir}/field-guide.md`)
  const to = path(orgMemFile(S.N.dir))
  try {
    if (!(await host.fs.exists(from)) || (await host.fs.exists(to))) return
    await host.run(['mv', '-f', from, to])
  } catch {
    // the old notes stay where they are; org-mem starts empty
  }
}

/** T-619: what the Organizational memory page under Settings shows: whether it is open, and the note whose delete
 *  waits for a yes (its number, see OrgMemNote; null for none). */
export const orgMemView = { open: false, confirm: null as number | null }

/** Closes the Organizational memory page. */
export function resetOrgMemView() {
  orgMemView.open = false
  orgMemView.confirm = null
}

/** T-619: org-mem's notes for the Settings page (newest first, see orgMemNotes) and its file's path in the project
 *  (".symcc/org-mem.md"); no notes when the file is missing or can't be read. */
export async function orgMemNow(host: Host): Promise<{ notes: OrgMemNote[]; file: string }> {
  return { notes: S.root ? orgMemNotes(await readGuide(host)) : [], file: orgMemFile(S.N.dir) }
}

/**
 * T-619: deletes note `n` (its place in the file, see OrgMemNote) from org-mem, one save at a time with the other
 * writers; `expect`: its text as the page showed it (see deleteOrgMemNote). What happened, in a short line.
 */
export async function deleteOrgMem(host: Host, n: number, expect?: string): Promise<{ ok: boolean; text: string }> {
  if (!S.root) return { ok: false, text: 'No project folder yet.' }
  const file = orgMemFile(S.N.dir)
  return oneAtATime(file, async () => {
    const old = await readGuide(host)
    const { text, removed } = deleteOrgMemNote(old, n, expect)
    if (!removed) return { ok: false, text: `No note ${n} in ${file} (it may have changed): nothing deleted.` }
    await safeWrite(host, path(file), text, 'the organizational memory (org-mem)')
    return { ok: true, text: `Deleted note ${n} from ${file}${removed.id ? ` (${removed.id}${removed.date ? ` ${removed.date}` : ''})` : ''}.` }
  }).catch((err: Error) => ({ ok: false, text: `Couldn't delete note ${n}: ${err?.message ?? err}` }))
}
