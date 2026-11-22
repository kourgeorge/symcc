import { type Archive, type BoardTask, ARCHIVE_EVERY_MS, addToArchive, bringBack, brokenArchiveText, emptyArchive, find, normId, readArchive, removeArchived, renameScoutOrigins, symccOn, toArchive } from '../board'
import { archiveChunkFile, archiveChunks } from '../core/board-parts'
import { publish } from './lead'
import { S, onHere } from './state'
import type { Host } from '../host'
import { fileName, isStubbed, load, locked, now, path, readWhole, safeWrite, writeBoard } from './store'
import { emitTaskEvents } from './events'
import { tellLead } from './tell'
import { migrateIfOld } from './migrate-data'

// ---------------- old tasks: archive.json ----------------
// Done and dropped tasks older than archive_days move from board.json to archive.json, so the board
// file stays small. The archive is written first; only then are the tasks taken off the board.

/** The most archive files read (archive.json, archive-2.json, ...): far more than a project fills. */
const MOST_ARCHIVE_FILES = 1000

/**
 * The archive as it is now (T-675: archive.json, then archive-2.json, archive-3.json, ... while they are there, each
 * kept under ARCHIVE_FILE_BYTES; see archiveChunks): missing is an empty archive; `broken` (the reason, `text` that
 * file's text) when one can't be read. An id in two files (a save cut short) counts once, the later one.
 * `texts`: each file read, in order.
 */
export async function readArchiveFile(host: Host): Promise<{ archive: Archive; text: string | null; texts: { file: string; text: string }[]; broken?: string }> {
  const base = path(S.N.archiveFile)
  const texts: { file: string; text: string }[] = []
  const tasks = new Map<string, BoardTask>()
  for (let i = 0; i < MOST_ARCHIVE_FILES; i++) {
    const file = archiveChunkFile(base, i)
    if (!(await host.fs.exists(file).catch(() => false))) break
    const text = await readWhole(host, file)
    texts.push({ file, text })
    const r = readArchive(text)
    if (r.broken) return { archive: emptyArchive(), text, texts, broken: i ? `${fileName(file)}: ${r.broken}` : r.broken }
    for (const t of r.archive.tasks) {
      tasks.delete(t.id)
      tasks.set(t.id, t)
    }
  }
  return { archive: { version: 1, tasks: [...tasks.values()] }, text: texts[0]?.text ?? null, texts }
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

/**
 * Writes the archive through a temp file and a rename, like board.json, so a crash never leaves half a file. It is
 * split by size (T-675, see archiveChunks) into archive.json, archive-2.json, ...; only the files whose text changed
 * are written, in order (a task moving to an earlier file is there before it leaves the later one), then any file
 * after the last one is removed.
 */
export async function saveArchive(host: Host, a: Archive) {
  const base = path(S.N.archiveFile)
  const chunks = archiveChunks(a.tasks)
  for (let i = 0; i < chunks.length; i++) {
    const file = archiveChunkFile(base, i)
    const now = await host.fs.exists(file).catch(() => false) ? await readWhole(host, file).catch(() => null) : null
    if (now !== chunks[i]) await safeWrite(host, file, chunks[i]!, i ? `the archive (${fileName(file)})` : 'the archive')
  }
  for (let i = chunks.length; i < MOST_ARCHIVE_FILES; i++) {
    const file = archiveChunkFile(base, i)
    if (!(await host.fs.exists(file).catch(() => false))) break
    await host.run(['rm', '-f', file]).catch(() => undefined)
  }
}

/**
 * The archive part of the one-time scout origin fix (T-712, see migrateScoutOrigins): archived tasks whose origin
 * names a scout by its agent name get the scout's own name. A broken archive, or one already current, is left as
 * it is. Returns the tasks renamed.
 */
export async function renameArchivedScoutOrigins(host: Host, known: readonly string[]): Promise<{ id: string; scout: string; at: string }[]> {
  if (await migrateIfOld(host)) return []
  return locked(host, async () => {
    const r = await readArchiveFile(host)
    if (r.broken) return []
    const next = renameScoutOrigins(r.archive.tasks, S.N.name, known)
    if (next.renamed.length) await saveArchive(host, { ...r.archive, tasks: next.tasks })
    return next.renamed
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
  if (await migrateIfOld(host)) return []
  const moved = await locked(host, async () => {
    const b = await load(host)
    if (!onHere(b)) return null
    // T-681: a task loaded as a stub (its parts file missing) stays: archived now, it would keep no history, and
    // putting the good parts file back would no longer restore it
    const old = toArchive(b, nowMs).filter(t => !isStubbed(t.id))
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
    const { board: after, events } = await writeBoard(host, b, removeArchived(b, old))
    return [after, old.map(t => t.id), events] as const
  })
  if (!moved) return []
  await emitTaskEvents(host, moved[2])
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
  const failed = await migrateIfOld(host)
  if (failed) throw new Error(failed)
  const t = await findArchived(host, id)
  if (!t) throw new Error(`${normId(id)} is not on the board`)
  if (t.status !== 'dropped') throw new Error(archivedText(t.id))
  const [after, events] = await locked(host, async () => {
    const b = await load(host)
    if (find(b, t.id)) return [b, []] as const
    const y = await writeBoard(host, b, bringBack(b, t, now()))
    const r = await readArchiveFile(host)
    if (!r.broken) await saveArchive(host, { version: 1, tasks: r.archive.tasks.filter(x => x.id !== t.id) }).catch(() => undefined)
    return [y.board, y.events] as const
  })
  await emitTaskEvents(host, events)
  await publish(host, after)
  return `${t.id} brought back from the archive and queued`
}
