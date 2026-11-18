import { type Archive, type BoardTask, ARCHIVE_EVERY_MS, addToArchive, archiveText, bringBack, brokenArchiveText, emptyArchive, find, normId, readArchive, removeArchived, symccOn, toArchive } from '../board'
import { publish } from './lead'
import { S } from './state'
import type { Host } from '../host'
import { load, locked, now, path, safeWrite, saveBoard } from './store'
import { tellLead } from './tell'

// ---------------- old tasks: archive.json ----------------
// Done and dropped tasks older than archive_days move from board.json to archive.json, so the board
// file stays small. The archive is written first; only then are the tasks taken off the board.

/** archive.json as it is now: missing is an empty archive; `broken` (with its text) when it can't be read. */
async function readArchiveFile(host: Host): Promise<{ archive: Archive; text: string | null; broken?: string; migrated?: number }> {
  const file = path(S.N.archiveFile)
  if (!(await host.fs.exists(file).catch(() => false))) return { archive: emptyArchive(), text: null }
  const text = await host.fs.read(file)
  return { ...readArchive(text), text }
}

/** Keeps a copy of a broken archive.json beside it and tells the owner and the lead, once per text. */
async function reportBroken(host: Host, text: string, reason: string) {
  if (S.archiveBroken === text) return
  S.archiveBroken = text
  const copy = `${S.N.archiveFile}.broken-${now().replace(/[:.]/g, '-')}`
  const ok = await host.fs.write(path(copy), text).then(() => true, () => false)
  const msg = brokenArchiveText(S.N.archiveFile, reason, ok ? copy : undefined)
  host.ui.toast(S.N.toast(msg))
  tellLead(host, msg)
}

/** Writes archive.json through a temp file and a rename, like board.json, so a crash never leaves half a file. */
export async function saveArchive(host: Host, a: Archive) {
  await safeWrite(host, path(S.N.archiveFile), archiveText(a), 'the archive')
}

/** Saves archive.json once in the current shape when reading it brought old tasks up to date (see readArchive's `migrated`). */
export async function saveArchiveMigrated(host: Host): Promise<void> {
  await locked(host, async () => {
    const r = await readArchiveFile(host)
    if (r.broken || !r.migrated) return
    await saveArchive(host, r.archive)
  })
}

/**
 * Moves old done and dropped tasks to archive.json (see toArchive): only in the driving session,
 * at most once an hour (`force` skips that wait). The archive is written first; if that fails, or
 * archive.json can't be read, nothing leaves the board. Returns the ids moved.
 */
export async function archiveOld(host: Host, nowMs = Date.now(), force = false): Promise<string[]> {
  if (!S.driving) return []
  if (!force && nowMs - S.lastArchive < ARCHIVE_EVERY_MS) return []
  S.lastArchive = nowMs
  const moved = await locked(host, async () => {
    const b = await load(host)
    if (!symccOn(b)) return null
    const old = toArchive(b, nowMs)
    if (!old.length) return null
    const r = await readArchiveFile(host)
    if (r.broken) {
      await reportBroken(host, r.text ?? '', r.broken)
      return null
    }
    S.archiveBroken = ''
    try {
      await saveArchive(host, addToArchive(r.archive, old))
    } catch (e) {
      host.ui.toast(S.N.toast(`old tasks were not archived: ${(e as Error).message}`))
      return null
    }
    const after = removeArchived(b, old)
    await saveBoard(host, after)
    return [after, old.map(t => t.id)] as const
  })
  if (!moved) return []
  await publish(host, moved[0])
  return [...moved[1]]
}

/** Task `id` from archive.json, or undefined when it isn't there (or the archive can't be read). */
export async function findArchived(host: Host, id: string): Promise<BoardTask | undefined> {
  const r = await readArchiveFile(host).catch(() => null)
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
export async function bringBackArchived(host: Host, id: string): Promise<string> {
  const t = await findArchived(host, id)
  if (!t) throw new Error(`${normId(id)} is not on the board`)
  if (t.status !== 'dropped') throw new Error(archivedText(t.id))
  const after = await locked(host, async () => {
    const b = await load(host)
    if (find(b, t.id)) return b
    const y = bringBack(b, t, now())
    await saveBoard(host, y)
    const r = await readArchiveFile(host)
    if (!r.broken) await saveArchive(host, { version: 1, tasks: r.archive.tasks.filter(x => x.id !== t.id) }).catch(() => undefined)
    return y
  })
  await publish(host, after)
  return `${t.id} brought back from the archive and queued`
}
