// T-804: /<name>-doctor's `migrate-data` item. symcc no longer brings old data shapes up to date when it reads a file;
// this counts what is still in an old shape (read-only, core/old-data.ts has the rules) and, on `fix`, keeps a dated
// backup of the data files and saves every file once in today's shape. At session start the count is only reported.
import { readBoardValue } from '../core/board-file'
import { archiveChunkFile, PARTS_DIR } from '../core/board-parts'
import { orgMemFile } from '../core/org-mem'
import { reportText } from '../core/reports'
import { readArchive, archiveText } from '../core/archive'
import { parseScoutMemory, safeScoutFile, scoutRunReportFile, scoutRunsText } from '../core/scouts'
import { type OldInput, migratedScoutRun, oldDataRows, upgradeArchiveTask, upgradeBoard, upgradeScoutUsage } from '../core/old-data'
import { BACKUP_MARK } from '../core/doctor'
import type { Host } from '../host'
import { S } from './state'
import { fileName, isStubbed, locked, now, path, readBoardRaw, readWhole, safeWrite, saveBoard } from './store'
import { saveArchive } from './archive'
import { changeScoutMemory, runsPath, scoutMemoryFile, writeRunReport } from './scouts'
import { tellLead } from './tell'

const MOST_ARCHIVE_FILES = 1000

const jsonOf = (text: string | null): unknown => {
  try { return JSON.parse(text ?? '') } catch { return null }
}

/** The tasks of every archive file, as parsed JSON (the files' own shape), with each file's name and text. */
async function archiveRaw(host: Host): Promise<{ file: string; text: string; tasks: unknown[] }[]> {
  const out: { file: string; text: string; tasks: unknown[] }[] = []
  for (let i = 0; i < MOST_ARCHIVE_FILES; i++) {
    const file = archiveChunkFile(path(S.N.archiveFile), i)
    if (!(await host.fs.exists(file).catch(() => false))) break
    const text = await readWhole(host, file).catch(() => '')
    const raw = jsonOf(text) as { tasks?: unknown } | null
    out.push({ file, text, tasks: Array.isArray(raw?.tasks) ? raw!.tasks : [] })
  }
  return out
}

/** board.json joined with its parts, without the tasks that loaded as bare stubs (their parts file is missing: nothing of them to count). */
async function boardForCount(host: Host): Promise<unknown | null> {
  const raw = await readBoardRaw(host)
  const b = raw as { tasks?: unknown } | null
  if (!b || !Array.isArray(b.tasks)) return raw
  return { ...b, tasks: b.tasks.filter(t => !(t && typeof t === 'object' && isStubbed(String((t as { id?: unknown }).id)))) }
}

/** Everything the count reads (read-only). */
async function oldInput(host: Host, all = true): Promise<OldInput> {
  if (!all) return { board: await boardForCount(host), archive: [], scouts: null, withRuns: new Set<string>(), fieldGuide: false, orgMem: false }
  const scoutsText = await host.fs.read(scoutMemoryFile()).catch(() => null)
  const scouts = jsonOf(scoutsText)
  const names = Object.keys((scouts as { scouts?: Record<string, unknown> } | null)?.scouts ?? {})
  const withRuns = new Set<string>()
  const unsafeScouts = names.filter(n => safeScoutFile(n, S.N.name) === null)
  for (const n of names) if (safeScoutFile(n, S.N.name) !== null && (await host.fs.exists(runsPath(n)).catch(() => false))) withRuns.add(n)
  return {
    board: await boardForCount(host),
    archive: (await archiveRaw(host)).flatMap(a => a.tasks),
    scouts,
    withRuns,
    unsafeScouts,
    fieldGuide: await host.fs.exists(path(`${S.N.dir}/field-guide.md`)).catch(() => false),
    orgMem: await host.fs.exists(path(orgMemFile(S.N.dir))).catch(() => false),
  }
}

/** What is still in an old shape: the lines (see oldDataRows), and whether the fix would change any of them. */
export async function oldDataFound(host: Host): Promise<{ rows: ReturnType<typeof oldDataRows>; fixable: boolean }> {
  const rows = oldDataRows(await oldInput(host))
  return { rows, fixable: rows.some(r => r.fix) }
}

/** The count as one sentence part: "3 tries with tokens saved as one number, 2 tasks with an old role". */
export const oldRowsText = (rows: ReturnType<typeof oldDataRows>): string => rows.map(r => `${r.n} ${r.text}`).join('; ')

/**
 * Brings old data shapes up to date before anything saves over them (T-804): when the board (and with `all`, the archive,
 * scouts.json and the old files too) is still in an old shape, it runs the migration (backup first) and tells the owner
 * and the lead once what it did. Nothing happens for data already current. Never throws; answers '' when all is well, or
 * the text of why the data could not be moved (then the caller must not save anything).
 */
export async function migrateIfOld(host: Host, all = true): Promise<string> {
  let why = ''
  try {
    if (S.guardOnly || !S.root) return ''
    const input = await oldInput(host, all)
    if (!oldDataRows(input).some(r => r.fix)) return ''
    // A migration that failed once is not tried again until the data files change (or the owner runs the doctor's fix).
    if (lastFailure && lastFailure.sig === (await filesSignature(host))) return lastFailure.msg
    const r = await migrateData(host)
    if (r.failed) why = r.failed
    else {
      const msg = `symcc moved your old data to the current shape; a backup is in ${r.backup}/`
      host.ui.toast(S.N.toast(msg))
      tellLead(host, msg)
      return ''
    }
  } catch (e) {
    why = String((e as Error)?.message ?? e).slice(0, 150)
  }
  const msg = `symcc couldn't move your old data to the current shape (${why}); nothing was saved. Run /${S.N.name}-doctor.`
  lastFailure = { sig: await filesSignature(host), msg }
  // told once: the same reason, whatever the time or backup folder in it
  const plain = msg
    .replace(/\S*data\.before-migrate-\S*?\//g, '<backup>')
    .replace(/[^\s/'"()]*\.\d+-[a-z0-9]+\.tmp/g, '<tmp>')
    .replace(/(^|[\s'"(])\/[^\s'"()]*/g, '$1<path>')
  if (plain !== toldFailure) {
    toldFailure = plain
    host.ui.toast(S.N.toast(msg))
    tellLead(host, msg)
  }
  return msg
}

/** The last failure text told to the owner (without the backup folder), so a repeated failure is told once. */
let toldFailure = ''

/** The last failed migration: what the data files looked like then, and the message. */
let lastFailure: { sig: string; msg: string } | null = null

/** Names, sizes and times of the data files: it changes when a file is written. Backup folders are not part of it. */
async function filesSignature(host: Host): Promise<string> {
  const dir = path(S.N.dir)
  const out: string[] = []
  const add = async (folder: string, keep: (n: string) => boolean) => {
    for (const f of await host.fs.list(folder).catch(() => [])) if (f.kind === 'file' && keep(f.name)) out.push(`${folder}/${f.name}:${f.size}:${f.mtimeMs}`)
  }
  await add(dir, n => /^(board|archive(-\d+)?|scouts)\.json$|^(org-mem|field-guide)\.md$/.test(n))
  await add(`${dir}/${PARTS_DIR}`, n => n.endsWith('.json'))
  await add(path(S.N.scouts), n => n.endsWith('.runs.json'))
  return out.sort().join('\n')
}

/** Copies the data files into a dated backup folder (data.before-migrate-<time>/) beside them. Throws when one can't be copied. */
async function backUp(host: Host): Promise<string> {
  const dir = path(S.N.dir)
  const to = `${dir}/data${BACKUP_MARK}${now().replace(/[:.]/g, '-')}`
  const copy = async (from: string, rel: string) => {
    const text = await host.fs.read(from)
    await host.fs.write(`${to}/${rel}`, text)
  }
  await host.run(['mkdir', '-p', `${to}/${PARTS_DIR}`, `${to}/scouts`])
  const top = await host.fs.list(dir).catch(() => [])
  for (const f of top) if (f.kind === 'file' && /^(board|archive(-\d+)?|scouts)\.json$|^(org-mem|field-guide)\.md$/.test(f.name)) await copy(`${dir}/${f.name}`, f.name)
  for (const f of await host.fs.list(`${dir}/${PARTS_DIR}`).catch(() => [])) if (f.kind === 'file' && f.name.endsWith('.json')) await copy(`${dir}/${PARTS_DIR}/${f.name}`, `${PARTS_DIR}/${f.name}`)
  for (const f of await host.fs.list(path(S.N.scouts)).catch(() => [])) if (f.kind === 'file' && f.name.endsWith('.runs.json')) await copy(`${path(S.N.scouts)}/${f.name}`, `scouts/${f.name}`)
  return fileName(to)
}

/**
 * Saves every data file once in today's shape, after a backup: board.json and its parts, the archive files, scouts.json
 * (usage totals, each scout's last report into its runs file) and field-guide.md as org-mem.md. Answers '' failed and
 * the lines of what it changed in `done`; a failure before the backup is complete changes nothing.
 */
export async function migrateData(host: Host): Promise<{ failed: string; done: string[]; backup?: string }> {
  if (S.guardOnly) return { failed: 'this window only guards a worker folder', done: [] }
  lastFailure = null // the owner (or a changed file) asks for it: try again
  const done: string[] = []
  let backup: string
  try {
    backup = await backUp(host)
  } catch (e) {
    return { failed: `the backup could not be made, nothing was changed (${String((e as Error)?.message ?? e).slice(0, 120)})`, done: [] }
  }
  done.push(`backup of the data files kept in ${backup}/`)
  const before = oldDataRows(await oldInput(host))
  const failed = await locked(host, async () => {
    // 1. board.json and its parts files
    const raw = await readBoardRaw(host)
    if (raw !== null) {
      const read = readBoardValue(upgradeBoard(raw, S.root))
      if (read.broken) return `board.json: ${read.broken}`
      await saveBoard(host, read.board)
      done.push(`board.json: ${read.board.tasks.length} tasks saved in the current shape`)
      if (read.skipped || read.fixed.length) done.push(`board.json: ${read.skipped} entries skipped, fixed: ${read.fixed.join('; ') || 'none'}`)
    }
    // 2. the archive files
    const files = await archiveRaw(host)
    const changed = new Map<string, unknown>()
    let n = 0
    for (const f of files)
      for (const t of f.tasks) {
        const up = t && typeof t === 'object' && !Array.isArray(t) ? upgradeArchiveTask(t as Record<string, unknown>) : null
        if (up) n++
        changed.set(String((t as { id?: unknown })?.id), up ?? t)
      }
    if (n) {
      const tasks = files.flatMap(f => f.tasks).map(t => changed.get(String((t as { id?: unknown })?.id)))
      const r = readArchive(archiveText({ version: 1, tasks: tasks as never }))
      if (r.broken) return `the archive: ${r.broken}`
      await saveArchive(host, r.archive)
      done.push(`archive: ${n} tasks brought to the current shape`)
    }
    return ''
  }).catch((e: Error) => String(e?.message ?? e).slice(0, 150))
  if (failed) return { failed: `${failed} (the backup is in ${backup}/)`, done, backup }
  // 3. scouts.json: usage totals, then each last report into its runs file
  let usage = false
  await changeScoutMemory(host, old => {
    const next = upgradeScoutUsage(old)
    usage = next !== null
    return next
  })
  if (usage) done.push('scouts.json: usage totals with one-number tokens made unsplit')
  const memory = parseScoutMemory(await host.fs.read(scoutMemoryFile()).catch(() => null))
  for (const [name, mem] of Object.entries(memory)) {
    if (safeScoutFile(name, S.N.name) === null || (await host.fs.exists(runsPath(name)).catch(() => false))) continue
    const m = migratedScoutRun(mem, ended => scoutRunReportFile(name, ended, S.N.name), now())
    if (!m) continue
    if (m.run.report) await writeRunReport(host, m.run.report, m.text)
    await host.run(['mkdir', '-p', path(S.N.scouts)])
    await safeWrite(host, runsPath(name), scoutRunsText([m.run]), `${name}'s runs file`)
    done.push(`scout ${name}: its last report is now its first run`)
  }
  // 4. field-guide.md → org-mem.md
  const from = path(`${S.N.dir}/field-guide.md`)
  const to = path(orgMemFile(S.N.dir))
  if ((await host.fs.exists(from).catch(() => false)) && !(await host.fs.exists(to).catch(() => false))) {
    await host.run(['mv', '-f', from, to])
    done.push('field-guide.md moved to org-mem.md')
  }
  const after = oldDataRows(await oldInput(host)).filter(r => r.fix)
  if (after.length) return { failed: `still in an old shape: ${oldRowsText(after)} (the backup is in ${backup}/)`, done, backup }
  if (!before.length) done.push('nothing was in an old shape')
  return { failed: '', done, backup }
}
