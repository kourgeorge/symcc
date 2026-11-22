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
import { fileName, load, locked, now, path, readBoardRaw, readWhole, safeWrite, saveBoard } from './store'
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

/** Everything the count reads (read-only). */
async function oldInput(host: Host): Promise<OldInput> {
  const scoutsText = await host.fs.read(scoutMemoryFile()).catch(() => null)
  const scouts = jsonOf(scoutsText)
  const names = Object.keys((scouts as { scouts?: Record<string, unknown> } | null)?.scouts ?? {})
  const withRuns = new Set<string>()
  for (const n of names) if (safeScoutFile(n, S.N.name) !== null && (await host.fs.exists(runsPath(n)).catch(() => false))) withRuns.add(n)
  return {
    board: await readBoardRaw(host),
    archive: (await archiveRaw(host)).flatMap(a => a.tasks),
    scouts,
    withRuns,
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

/** At session start: says once that old data is still in an old shape (never changes it). Never throws. */
export async function reportOldData(host: Host): Promise<void> {
  if (S.guardOnly || !S.root) return
  const { rows, fixable } = await oldDataFound(host)
  if (!fixable) return
  const msg = `Some of ${S.N.dir}/ is still in an old shape (${oldRowsText(rows.filter(r => r.fix))}). Run /${S.N.name}-doctor fix migrate-data to bring it up to date (a backup is kept first).`
  host.ui.toast(S.N.toast(msg))
  tellLead(host, msg)
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
export async function migrateData(host: Host): Promise<{ failed: string; done: string[] }> {
  if (S.guardOnly) return { failed: 'this window only guards a worker folder', done: [] }
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
      await load(host)
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
  if (failed) return { failed: `${failed} (the backup is in ${backup}/)`, done }
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
  if (after.length) return { failed: `still in an old shape: ${oldRowsText(after)} (the backup is in ${backup}/)`, done }
  if (!before.length) done.push('nothing was in an old shape')
  return { failed: '', done }
}
