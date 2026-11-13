import { type Archive, type BoardTask, ARCHIVE_EVERY_MS, addToArchive, archiveText, bringBack, brokenArchiveText, emptyArchive, find, normId, readArchive, removeArchived, symccOn, toArchive } from '../board'
import { publish } from './lead'
import { S, type $ } from './state'
import { load, locked, now, path, saveBoard } from './store'
import { tellLead } from './tell'

// ---------------- old tasks: archive.json ----------------
// Done and dropped tasks older than archive_days move from board.json to archive.json, so the board
// file stays small. The archive is written first; only then are the tasks taken off the board.

/** archive.json as it is now: missing is an empty archive; `broken` (with its text) when it can't be read. */
async function readArchiveFile($: $): Promise<{ archive: Archive; text: string | null; broken?: string }> {
  const file = path(S.N.archiveFile)
  if (!(await $.fs.exists(file).catch(() => false))) return { archive: emptyArchive(), text: null }
  const text = await $.fs.read(file)
  return { ...readArchive(text), text }
}

/** Keeps a copy of a broken archive.json beside it and tells the owner and the lead, once per text. */
async function reportBroken($: $, text: string, reason: string) {
  if (S.archiveBroken === text) return
  S.archiveBroken = text
  const copy = `${S.N.archiveFile}.broken-${now().replace(/[:.]/g, '-')}`
  const ok = await $.fs.write(path(copy), text).then(() => true, () => false)
  const msg = brokenArchiveText(S.N.archiveFile, reason, ok ? copy : undefined)
  $.ui.toast(S.N.toast(msg))
  tellLead($, msg)
}

/** Writes archive.json through a temp file and a rename, like board.json, so a crash never leaves half a file. */
export async function saveArchive($: $, a: Archive) {
  const file = path(S.N.archiveFile)
  const tmp = `${file}.tmp`
  await $.fs.write(tmp, archiveText(a))
  const r = await $.process.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) throw new Error(`couldn't save the archive: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
}

/**
 * Moves old done and dropped tasks to archive.json (see toArchive): only in the driving session,
 * at most once an hour (`force` skips that wait). The archive is written first; if that fails, or
 * archive.json can't be read, nothing leaves the board. Returns the ids moved.
 */
export async function archiveOld($: $, nowMs = Date.now(), force = false): Promise<string[]> {
  if (!S.driving) return []
  if (!force && nowMs - S.lastArchive < ARCHIVE_EVERY_MS) return []
  S.lastArchive = nowMs
  const moved = await locked($, async () => {
    const b = await load($)
    if (!symccOn(b)) return null
    const old = toArchive(b, nowMs)
    if (!old.length) return null
    const r = await readArchiveFile($)
    if (r.broken) {
      await reportBroken($, r.text ?? '', r.broken)
      return null
    }
    S.archiveBroken = ''
    try {
      await saveArchive($, addToArchive(r.archive, old))
    } catch (e) {
      $.ui.toast(S.N.toast(`old tasks were not archived: ${(e as Error).message}`))
      return null
    }
    const after = removeArchived(b, old)
    await saveBoard($, after)
    return [after, old.map(t => t.id)] as const
  })
  if (!moved) return []
  await publish($, moved[0])
  return [...moved[1]]
}

/** Task `id` from archive.json, or undefined when it isn't there (or the archive can't be read). */
export async function findArchived($: $, id: string): Promise<BoardTask | undefined> {
  const r = await readArchiveFile($).catch(() => null)
  if (!r || r.broken) return undefined
  const n = normId(id)
  return r.archive.tasks.find(t => t.id === n)
}

/** What a tool that changes a task answers for an archived one. */
export const archivedText = (id: string) => `${id} is archived (in ${S.N.archiveFile}); archived tasks can't be changed. Add a new task instead.`

/**
 * Brings an archived dropped task back to the board as "todo", with a history line. The board is
 * saved first, then the task leaves the archive (so it is never lost on the way). Throws for a done one.
 */
export async function bringBackArchived($: $, id: string): Promise<string> {
  const t = await findArchived($, id)
  if (!t) throw new Error(`${normId(id)} is not on the board`)
  if (t.status !== 'dropped') throw new Error(archivedText(t.id))
  const after = await locked($, async () => {
    const b = await load($)
    if (find(b, t.id)) return b
    const y = bringBack(b, t, now())
    await saveBoard($, y)
    const r = await readArchiveFile($)
    if (!r.broken) await saveArchive($, { version: 1, tasks: r.archive.tasks.filter(x => x.id !== t.id) }).catch(() => undefined)
    return y
  })
  await publish($, after)
  return `${t.id} brought back from the archive and queued`
}
