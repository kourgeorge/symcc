// T-675: board.json stays small. Done and dropped tasks keep a stub in board.json and the rest (history, tries,
// details, origin, ...) in .symcc/tasks/T-<n>.json; reading the board joins them back, so every view and the stats
// see each task whole. The archive is split by size, the board view file leaves out finished tasks' long parts, and a
// data file close to the 4 MB read limit is warned about (a read refused for size says so).
import { expect } from 'claude-code/testing'
import type { SymccHistoryEntry, SymccRun } from '../types'
import { type Board, type BoardTask, addTask, emptyBoard, parseBoard, readBoard } from '../hooks/board'
import { ARCHIVE_FILE_BYTES, READ_LIMIT_BYTES, SIZE_WARN_BYTES, archiveChunks, fieldSizes, joinedText, partsFileOf, sizeWarnText, viewStubFilled, viewTask, withViewParts } from '../hooks/core/board-parts'
import { scoutToolLines } from '../hooks/core/scouts'
import { change, load, readWhole, resetStore, saveBoard, saveMigrated } from '../hooks/app/store'
import { archiveOld, readArchiveFile, saveArchive } from '../hooks/app/archive'
import { publish } from '../hooks/app/lead'
import { cleanLeftoverTmp } from '../hooks/app/cleanup'
import { statsText } from '../hooks/app/tools'
import { S, leadQueue, sizeNotes, type PaneView } from '../hooks/app/state'
import { fakeHost, memoryFs, done } from './fake-host'
import { test } from './reset'

const ROOT = '/repo'
const BOARD = `${ROOT}/.symcc/board.json`
const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

/** A fake host on `files`, whose mv, ln and rm work on them; the owner's toasts are kept. */
function world(files = new Map<string, string>()) {
  const toasts: string[] = []
  const w = fakeHost({
    fs: memoryFs(files),
    ui: { toast: (t: string) => void toasts.push(t) },
    run: async ([cmd, ...a]) => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
      if (cmd === 'rm') for (const f of a.filter(v => !v.startsWith('-'))) files.delete(f)
      return done()
    },
  })
  S.root = ROOT
  S.writing = Promise.resolve()
  S.enabledNow = true
  return { ...w, files, toasts, runs: [] as string[][] }
}

const words = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}${i % 7 ? 'work' : 'check'}`).join(' ')

/**
 * A board like the owner's on 2026-11-20: 700 tasks, 660 of them done or dropped, each with a long history (about
 * 30 lines), three tries, long details and an origin quoting the owner; the rest open.
 */
function bigBoard(): Board {
  const b = emptyBoard()
  for (let i = 1; i <= 700; i++) {
    const at = iso(NOW - (700 - i) * 15 * 60_000)
    const history: SymccHistoryEntry[] = Array.from({ length: 30 }, (_, k) => ({ at, kind: k % 3 ? 'step' : 'stage', text: `try ${1 + (k % 3)}: ${words(14, `h${k}`)}`, try: 1 + (k % 3) }))
    const runs: SymccRun[] = [0, 1, 2].map(k => ({ started: at, ended: iso(Date.parse(at) + (k + 1) * 60_000), commits: ['a'.repeat(40)], report: `.symcc/reports/T-${i}-try-${k + 1}.md`, ended_by: 'finished', ended_note: 'merged into main (aaaaaaa); tests passed', agents: [{ id: `agent-${i}-${k}`, kind: 'worker' as const, started: at, ended: iso(Date.parse(at) + (k + 1) * 60_000), tokens: { input: 1200 + k, output: 30_000 + i, cache_write: 90_000, cache_read: 1_500_000 }, cost: 1.25 }] }))
    const status: BoardTask['status'] = i > 660 ? (i % 2 ? 'todo' : 'backlog') : i % 10 === 0 ? 'dropped' : 'done'
    const open = status !== 'done' && status !== 'dropped'
    b.tasks.push({
      id: `T-${i}`, title: `Task ${i}: ${words(8, 't')}`, details: words(220, 'd'), files: ['hooks/app/', 'tests/'], status, note: open ? '' : 'merged into main (aaaaaaa); tests passed',
      priority: 0, after: i > 1 ? [`T-${i - 1}`] : [], attempts: open ? 0 : 3, history: open ? [] : history, ...(open ? {} : { runs, merged: 'b'.repeat(40) }), branch: open ? null : `symcc/T-${i}`, merge_into: 'main',
      origin: { by: 'owner', why: words(12, 'w'), request: words(60, 'r'), evidence: `last owner prompt: ${words(110, 'e')}`, at }, kind: 'bug', role: 'general', created_at: at, updated_at: at,
    } as BoardTask)
  }
  b.next_id = 701
  return b
}

/** The whole board as a session reads it (the plugin's own load). */
const loaded = (w: ReturnType<typeof world>) => load(w.host)

test('T-675: a board like today\'s (700 tasks, most done with long histories) saves a board.json under 1.5 MB, and loads back whole', async () => {
  const w = world()
  const b = bigBoard()
  const whole = JSON.stringify(b, null, 2).length
  // the board kept whole, as before, is close to the 4 MB limit
  expect(whole).toBeGreaterThan(SIZE_WARN_BYTES)
  // what makes it big: the done tasks' history, details, origin and tries
  expect(fieldSizes(b).filter(f => !f.field.includes(':') && !f.field.includes('.')).slice(0, 4).map(f => f.field).sort()).toEqual(['details', 'history', 'origin', 'runs'])
  await saveBoard(w.host, b)
  const size = w.files.get(BOARD)!.length
  expect(size).toBeLessThan(1.5 * 1024 * 1024)
  // every parts file is far from the limit too
  const parts = [...w.files.keys()].filter(f => f.startsWith(`${ROOT}/.symcc/tasks/`))
  expect(parts.length).toBe(14)
  for (const f of parts) expect(w.files.get(f)!.length).toBeLessThan(SIZE_WARN_BYTES / 4)
  // a done task's stub says where the rest is; an open task stays whole
  const raw = JSON.parse(w.files.get(BOARD)!) as { tasks: Record<string, unknown>[] }
  expect(raw.tasks[611]).toEqual({ id: 'T-612', title: b.tasks[611]!.title, status: 'done', priority: 0, after: ['T-611'], kind: 'bug', role: 'general', attempts: 3, branch: 'symcc/T-612', merge_into: 'main', merged: 'b'.repeat(40), created_at: b.tasks[611]!.created_at, updated_at: b.tasks[611]!.updated_at, parts: 'tasks/T-600.json' })
  expect(raw.tasks[690]!.details).toBe(b.tasks[690]!.details)
  // loading gives back every task whole: history, tries, details and origin
  const back = await loaded(w)
  const want = readBoard(JSON.stringify(b)).board.tasks
  expect(back.tasks.length).toBe(700)
  expect(back.tasks).toEqual(want)
  expect(back.tasks[611]!.history.length).toBe(30)
  // and the files alone can be read back whole too
  expect(parseBoard(joinedText(w.files.get(BOARD)!, rel => w.files.get(`${ROOT}/.symcc/${rel}`) ?? null)).tasks).toEqual(want)
  expect(partsFileOf('T-612')).toBe('tasks/T-600.json')
  expect(partsFileOf('T-49')).toBe('tasks/T-0.json')
})

test('T-675: a save writes only the parts files that changed, and a task that leaves the board leaves its parts file', async () => {
  const w = world()
  const b = bigBoard()
  await saveBoard(w.host, b)
  await load(w.host)
  const before = new Map(w.files)
  // one done task gets a new history line: only board.json and its own parts file change
  const changed = { ...b, tasks: b.tasks.map(t => (t.id === 'T-5' ? { ...t, history: [...t.history, { at: iso(NOW), kind: 'note', text: 'one more' }] } : t)) }
  await saveBoard(w.host, changed)
  const differ = [...w.files.keys()].filter(f => w.files.get(f) !== before.get(f) && !f.endsWith('.tmp'))
  expect(differ.sort()).toEqual([`${ROOT}/.symcc/tasks/T-0.json`])
  expect((await load(w.host)).tasks[4]!.history.at(-1)!.text).toBe('one more')
  // every task of T-650 to T-699 that was finished leaves the board: their parts file has only what is left (none: gone)
  const fewer = { ...changed, tasks: changed.tasks.filter(t => !(Number(t.id.slice(2)) >= 650 && Number(t.id.slice(2)) <= 660)) }
  await saveBoard(w.host, fewer)
  expect(w.files.has(`${ROOT}/.symcc/tasks/T-650.json`)).toBe(false)
  expect((await load(w.host)).tasks.length).toBe(fewer.tasks.length)
})

test('T-675: the owner\'s board from before is migrated once, a copy kept first; nothing is lost and the stats are unchanged', async () => {
  const w = world()
  const b = bigBoard()
  const old = JSON.stringify(b, null, 2) + '\n'
  w.files.set(BOARD, old)
  const stats = await statsText(w.host, '')
  const all = await statsText(w.host, 'full')
  await saveMigrated(w.host)
  const copies = [...w.files.keys()].filter(f => f.startsWith(`${BOARD}.before-migrate-`))
  expect(copies.length).toBe(1)
  expect(w.files.get(copies[0]!)).toBe(old)
  expect(w.toasts.join('\n')).toMatch(/history, tries and details were moved to \.symcc\/tasks\//)
  // the board about to be migrated is not warned about as close to the limit (the migration makes it small)
  expect(w.toasts.some(t => t.includes('close to the 4 MB limit'))).toBe(false)
  expect(leadQueue.some(t => t.includes('close to the 4 MB limit'))).toBe(false)
  expect(sizeNotes.size).toBe(0)
  expect(w.files.get(BOARD)!.length).toBeLessThan(1.5 * 1024 * 1024)
  // every task, whole
  expect((await load(w.host)).tasks).toEqual(readBoard(old).board.tasks)
  // the same numbers in the stats
  expect(await statsText(w.host, '')).toBe(stats)
  expect(await statsText(w.host, 'full')).toBe(all)
  // once: a second start changes nothing
  const text = w.files.get(BOARD)
  await saveMigrated(w.host)
  expect(w.files.get(BOARD)).toBe(text)
  expect([...w.files.keys()].filter(f => f.startsWith(`${BOARD}.before-migrate-`)).length).toBe(1)
})

test('T-675: a parts file that is not one makes the board broken (never saved over); a missing one loads the stubs and says so', async () => {
  const w = world()
  await saveBoard(w.host, bigBoard())
  const file = `${ROOT}/.symcc/tasks/T-100.json`
  const good = w.files.get(file)!
  w.files.set(file, '{ not json')
  await expect(load(w.host)).rejects.toThrow(/its parts file \.symcc\/tasks\/T-100\.json can't be read/)
  w.files.delete(file)
  const b = await load(w.host)
  expect(b.tasks[120]!.history).toEqual([])
  expect(w.toasts.join('\n')).toMatch(/T-121: its history, tries and details are missing from tasks\/T-100\.json/)
  w.files.set(file, good)
  expect((await load(w.host)).tasks[120]!.history.length).toBe(30)
})

test('T-681: a parts file whose exists check fails makes the board broken: the load throws, a save is refused, the file is kept', async () => {
  const w = world()
  await saveBoard(w.host, bigBoard())
  const file = `${ROOT}/.symcc/tasks/T-100.json`
  const good = w.files.get(file)!
  const exists = w.host.fs.exists
  w.host.fs.exists = async p => (p === file ? Promise.reject(new Error('timed out')) : exists(p))
  await expect(load(w.host)).rejects.toThrow(/its parts file \.symcc\/tasks\/T-100\.json can't be checked \(timed out\)/)
  await expect(change(w.host, b => ({ ...b, tasks: b.tasks.map(t => (t.id === 'T-700' ? { ...t, note: 'queued' } : t)) }))).rejects.toThrow(/T-100\.json can't be checked/)
  expect(w.files.get(file) === good).toBe(true)
  w.host.fs.exists = exists
  expect((await load(w.host)).tasks[120]!.history.length).toBe(30)
})

test('T-681: a save after a parts file went missing never writes empty parts over it; putting it back restores every task', async () => {
  const w = world()
  await saveBoard(w.host, bigBoard())
  const file = `${ROOT}/.symcc/tasks/T-100.json`
  const good = w.files.get(file)!
  w.files.delete(file)
  const b = await load(w.host)
  expect(b.tasks[120]!.history).toEqual([])
  expect(w.toasts.join('\n')).toMatch(/T-121: its history, tries and details are missing from tasks\/T-100\.json/)
  await change(w.host, x => ({ ...x, tasks: x.tasks.map(t => (t.id === 'T-700' ? { ...t, note: 'queued' } : t)) }))
  expect(w.files.has(file)).toBe(false)
  // the stubs still point to the parts file
  expect((JSON.parse(w.files.get(BOARD)!) as { tasks: Record<string, unknown>[] }).tasks[120]!.parts).toBe('tasks/T-100.json')
  w.files.set(file, good)
  const back = await load(w.host)
  expect(back.tasks[120]!.history.length).toBe(30)
  expect(back.tasks[699]!.note).toBe('queued')
})

test('T-681: a task finished while its parts file is missing stays whole in board.json; putting the file back keeps both', async () => {
  const w = world()
  await saveBoard(w.host, bigBoard())
  const file = `${ROOT}/.symcc/tasks/T-650.json`
  const good = w.files.get(file)!
  w.files.delete(file)
  await load(w.host)
  const line: SymccHistoryEntry = { at: iso(NOW), kind: 'stage', text: 'finished by hand' }
  await change(w.host, x => ({ ...x, tasks: x.tasks.map(t => (t.id === 'T-661' ? { ...t, status: 'done', history: [line] } : t)) }))
  expect(w.files.has(file)).toBe(false)
  expect((await load(w.host)).tasks[660]!.history.length).toBe(1)
  expect(w.toasts.join('\n')).not.toMatch(/moved to \.symcc\/tasks/)
  w.files.set(file, good)
  const back = await load(w.host)
  expect(back.tasks[650]!.history.length).toBe(30)
  expect(back.tasks[660]!.history.length).toBe(1)
  // the next save moves T-661's parts into the good file, next to the others
  await saveBoard(w.host, back)
  const again = await load(w.host)
  expect(again.tasks[650]!.history.length).toBe(30)
  expect(again.tasks[660]!.history.length).toBe(1)
  expect((JSON.parse(w.files.get(BOARD)!) as { tasks: Record<string, unknown>[] }).tasks[660]!.parts).toBe('tasks/T-650.json')
})

test('T-681: a reload forgets which tasks the last read loaded as stubs, so a fresh save writes their parts again', async () => {
  const w = world()
  await saveBoard(w.host, bigBoard())
  const file = `${ROOT}/.symcc/tasks/T-100.json`
  w.files.delete(file)
  await load(w.host)
  resetStore()
  const fresh = world()
  await saveBoard(fresh.host, bigBoard())
  expect(fresh.files.has(file)).toBe(true)
  expect((await load(fresh.host)).tasks[120]!.history.length).toBe(30)
})

test('T-681: archiving while a parts file is missing leaves its stubbed tasks on the board; putting the file back restores them', async () => {
  const w = world()
  await saveBoard(w.host, { ...bigBoard(), archive_days: 1 })
  const file = `${ROOT}/.symcc/tasks/T-100.json`
  const good = w.files.get(file)!
  w.files.delete(file)
  await load(w.host)
  S.driving = true
  const moved = await archiveOld(w.host, NOW + 400 * 86_400_000, true)
  expect(moved.length > 0).toBe(true)
  expect(moved.includes('T-121')).toBe(false)
  expect(moved.includes('T-1')).toBe(true)
  const b = await load(w.host)
  const t = b.tasks.find(x => x.id === 'T-121')
  expect(t?.history.length).toBe(0)
  expect(w.files.has(file)).toBe(false)
  w.files.set(file, good)
  expect((await load(w.host)).tasks.find(x => x.id === 'T-121')?.history.length).toBe(30)
})

test('T-681: while a parts file is missing, several changes warn once and keep one board.json copy', async () => {
  const w = world()
  await saveBoard(w.host, bigBoard())
  const file = `${ROOT}/.symcc/tasks/T-100.json`
  w.files.delete(file)
  const copies: string[] = []
  const write = w.host.fs.write
  w.host.fs.write = async (p, t) => {
    if (p.includes('board.json.before-fix-')) copies.push(p)
    return write(p, t)
  }
  for (const note of ['one', 'two', 'three']) {
    await change(w.host, x => ({ ...x, tasks: x.tasks.map(t => (t.id === 'T-700' ? { ...t, note } : t)) }))
    await load(w.host)
  }
  expect(w.toasts.filter(t => t.includes('missing from tasks/T-100.json')).length).toBe(1)
  expect(copies.length).toBe(1)
  expect((await load(w.host)).tasks[699]!.note).toBe('three')
})

test('T-681: a parts file that is there but lacks one task\'s entry gets it back on the first save: one warning, one copy', async () => {
  const w = world()
  const b = emptyBoard()
  for (const id of ['T-1', 'T-2', 'T-3']) {
    const at = iso(NOW)
    b.tasks.push({ id, title: id, details: 'd', files: [], status: id === 'T-3' ? 'todo' : 'done', note: '', priority: 1, after: [], attempts: 1, history: [{ at, kind: 'stage', text: 'x' }], branch: null, merge_into: 'main', kind: 'bug', role: 'general', created_at: at, updated_at: at } as BoardTask)
  }
  b.next_id = 4
  await saveBoard(w.host, b)
  const file = `${ROOT}/.symcc/tasks/T-0.json`
  const p = JSON.parse(w.files.get(file)!) as { tasks: Record<string, unknown> }
  delete p.tasks['T-1']
  w.files.set(file, JSON.stringify(p))
  resetStore()
  S.root = ROOT
  S.writing = Promise.resolve()
  S.enabledNow = true
  const copies: string[] = []
  const write = w.host.fs.write
  w.host.fs.write = async (f, t) => {
    if (f.includes('board.json.before-fix-')) copies.push(f)
    return write(f, t)
  }
  for (const note of ['one', 'two', 'three']) await change(w.host, x => ({ ...x, tasks: x.tasks.map(t => (t.id === 'T-3' ? { ...t, note } : t)) }))
  await load(w.host)
  expect(w.toasts.filter(t => t.includes('missing from tasks/T-0.json')).length).toBe(1)
  expect(copies.length).toBe(1)
  expect('T-1' in (JSON.parse(w.files.get(file)!) as { tasks: Record<string, unknown> }).tasks).toBe(true)
})

test('T-675: a data file past 3 MB warns the owner, the lead and the board once; a read refused for size says so', async () => {
  const w = world()
  const b0 = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Big one' }, iso(NOW))[0]
  const b = { ...b0, tasks: [{ ...b0.tasks[0]!, details: 'x'.repeat(SIZE_WARN_BYTES + 200_000) }] }
  await saveBoard(w.host, b)
  const warn = '.symcc/board.json is 3.2 MB, close to the 4 MB limit on reading or writing one file'
  expect(sizeNotes.get('.symcc/board.json')).toMatch(new RegExp(`^${warn.replace(/\./g, '\\.')}`))
  expect(w.toasts.filter(t => t.includes(warn)).length).toBe(1)
  expect(leadQueue.filter(t => t.includes(warn)).length).toBe(1)
  // the board shows it where the git warning goes
  await publish(w.host, emptyBoard())
  const v = w.panel.view() as PaneView
  expect(v.branch_note).toContain(warn)
  expect(v.size_note).toContain(warn)
  // told once, not on every save
  await saveBoard(w.host, b)
  expect(w.toasts.filter(t => t.includes(warn)).length).toBe(1)
  // smaller again: the warning goes
  await saveBoard(w.host, emptyBoard())
  expect(sizeNotes.size).toBe(0)
  // a file over 4 MB that the host refuses to read: a clear error, not the host's bare one
  const big = `${ROOT}/.symcc/archive.json`
  w.host.fs.read = async () => Promise.reject(new Error('EFBIG'))
  w.host.fs.stat = async () => ({ kind: 'file', size: READ_LIMIT_BYTES + 300_000, mtimeMs: 0, isLink: false })
  const toastsBefore = w.toasts.length
  const leadBefore = leadQueue.length
  await expect(readWhole(w.host, big)).rejects.toThrow('.symcc/archive.json is 4.3 MB, over the 4 MB limit on reading one file, so symcc can\'t read it')
  expect(leadQueue.some(t => t.includes('.symcc/archive.json is 4.3 MB, over the 4 MB limit'))).toBe(true)
  // one message each to the owner and the lead, not two
  expect(w.toasts.slice(toastsBefore).length).toBe(1)
  expect(w.toasts.slice(toastsBefore)[0]).toContain('over the 4 MB limit')
  expect(leadQueue.slice(leadBefore).length).toBe(1)
  // said once per file: a second refused read of it is quiet; board.json refused for load is said on its own
  await expect(readWhole(w.host, big)).rejects.toThrow('over the 4 MB limit')
  expect(w.toasts.slice(toastsBefore).length).toBe(1)
  await expect(load(w.host)).rejects.toThrow('.symcc/board.json is 4.3 MB, over the 4 MB limit')
  expect(w.toasts.slice(toastsBefore).length).toBe(2)
  expect(leadQueue.slice(leadBefore).length).toBe(2)
})

test('T-675: a read without the lock that sees another session\'s save half done reads again: no alarm, no copy, the task whole', async () => {
  const w = world()
  const b0 = bigBoard()
  const b = { ...b0, tasks: b0.tasks.slice(0, 60) }
  await saveBoard(w.host, b)
  // another session turns done T-1 back to todo (a retry) right after this one read board.json, before it reads the parts
  const retried = { ...b, tasks: b.tasks.map(t => (t.id === 'T-1' ? { ...t, status: 'todo' as const } : t)) }
  const read = w.host.fs.read
  let other = true
  w.host.fs.read = async (f: string) => {
    const t = await read(f)
    if (f === BOARD && other) {
      other = false
      await saveBoard(w.host, retried)
    }
    return t
  }
  const toasts = w.toasts.length
  const got = await load(w.host)
  const t1 = got.tasks.find(t => t.id === 'T-1')!
  expect(t1.status).toBe('todo')
  expect(t1.history.length).toBe(30)
  expect(t1.details).toBe(b.tasks[0]!.details)
  expect(w.toasts.slice(toasts)).toEqual([])
  expect([...w.files.keys()].filter(f => f.includes('.before-fix-'))).toEqual([])
  // every other task is whole too
  expect(got.tasks.find(t => t.id === 'T-2')!.history.length).toBe(30)
})

test('T-675: the archive is split by size into archive.json, archive-2.json, ...; each stays under 2 MB and all read back', async () => {
  const w = world()
  const task = (i: number): BoardTask => ({ ...bigBoard().tasks[0]!, id: `T-${i}`, details: 'd'.repeat(900_000) })
  const tasks = [1, 2, 3, 4, 5].map(task)
  expect(archiveChunks(tasks).length).toBe(3)
  await saveArchive(w.host, { version: 1, tasks })
  const names = [...w.files.keys()].filter(f => /archive(-\d+)?\.json$/.test(f)).sort()
  expect(names).toEqual([`${ROOT}/.symcc/archive-2.json`, `${ROOT}/.symcc/archive-3.json`, `${ROOT}/.symcc/archive.json`])
  for (const f of names) expect(w.files.get(f)!.length).toBeLessThan(ARCHIVE_FILE_BYTES)
  expect((await readArchiveFile(w.host)).archive.tasks.map(t => t.id)).toEqual(['T-1', 'T-2', 'T-3', 'T-4', 'T-5'])
  // fewer tasks: the files no longer needed go
  await saveArchive(w.host, { version: 1, tasks: tasks.slice(0, 2) })
  expect(w.files.has(`${ROOT}/.symcc/archive-2.json`)).toBe(false)
  expect((await readArchiveFile(w.host)).archive.tasks.map(t => t.id)).toEqual(['T-1', 'T-2'])
  // a task found in two files (a save cut short) counts once
  w.files.set(`${ROOT}/.symcc/archive-2.json`, w.files.get(`${ROOT}/.symcc/archive.json`)!)
  expect((await readArchiveFile(w.host)).archive.tasks.map(t => t.id)).toEqual(['T-1', 'T-2'])
})

test('T-675: the board view file leaves out a finished task\'s long parts; its page gets them back from its parts file', async () => {
  const w = world()
  const b = bigBoard()
  await saveBoard(w.host, b)
  const done = b.tasks[611]!
  const slim = viewTask(done) as BoardTask & { parts?: string }
  expect(slim.parts).toBe('tasks/T-600.json')
  expect(slim.history).toBe(undefined as never)
  expect(slim.details).toBe(undefined as never)
  // T-692: only the kinds and times of its merge and send-back lines stay, for the Live tab's today (no text)
  expect((slim as unknown as Record<string, unknown>).history_marks).toEqual(done.history.filter(h => h.kind === 'merged' || h.kind === 'checker-problems').map(h => ({ kind: h.kind, ...(h.at ? { at: h.at } : {}) })))
  expect(slim.origin).toEqual({ by: 'owner', why: done.origin!.why, at: done.origin!.at })
  // the tries stay, for the totals
  expect(slim.runs).toEqual(done.runs)
  expect(JSON.stringify(b.tasks.map(viewTask)).length).toBeLessThan(1.5 * 1024 * 1024)
  // an open task is whole
  expect(viewTask(b.tasks[690]!)).toEqual(b.tasks[690]!)
  // the page joins the parts file back: the history, details and full origin are there again
  expect(withViewParts(slim, w.files.get(`${ROOT}/.symcc/tasks/T-600.json`)!)).toEqual(done)
  expect(withViewParts(slim, null)).toEqual(slim)
})

test('T-675: a file already over the 4 MB limit is said to be over it, not close to it', () => {
  expect(sizeWarnText('.symcc/board.json', 5 * 1024 * 1024)).toBe('.symcc/board.json is 5.0 MB, over the 4 MB limit on reading or writing one file, so symcc can\'t read it')
  expect(sizeWarnText('.symcc/board.json', SIZE_WARN_BYTES + 200_000)).toContain('3.2 MB, close to the 4 MB limit')
})

test('T-675: a scout without symcc\'s tools is told where a done task\'s history, runs and details are', () => {
  const line = scoutToolLines('symcc', { symccTools: false }).board
  expect(line).toContain('.symcc/board.json')
  expect(line).toContain('its history, runs and details are in the file its parts field names (e.g. .symcc/tasks/T-600.json, under its id)')
})

test('T-675: a slim view task gets empty details and history to draw with; a whole one is left as it is', () => {
  const b = bigBoard()
  const slim = viewTask(b.tasks[611]!)
  expect(viewStubFilled(slim)).toEqual({ ...slim, details: '', history: [] })
  expect(viewStubFilled(b.tasks[690]!)).toBe(b.tasks[690]!)
})

test('T-675: leftover temp files of archive-2.json and of the parts files in .symcc/tasks/ are cleaned up', async () => {
  const w = world()
  const keep = [`${ROOT}/.symcc/archive-2.json`, `${ROOT}/.symcc/tasks/T-600.json`]
  const gone = [`${ROOT}/.symcc/archive-2.json.s.1-ab.tmp`, `${ROOT}/.symcc/tasks/T-600.json.s.2-cd.tmp`, `${ROOT}/.symcc/board.json.s.3-ef.tmp`]
  for (const f of [...keep, ...gone]) w.files.set(f, 'x')
  w.host.fs.list = async (dir: string) => [...w.files.keys()].filter(f => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/')).map(f => ({ name: f.slice(dir.length + 1), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false }))
  // old enough (mtime 0 in this fake)
  await cleanLeftoverTmp(w.host)
  expect(gone.filter(f => w.files.has(f))).toEqual([])
  expect(keep.filter(f => w.files.has(f))).toEqual(keep)
})

test('T-1056: the tasks folder is made once per session, and again after a write fails because it was deleted', async () => {
  resetStore()
  const w = world()
  const inner = w.host.run
  w.host.run = async (argv, o) => (w.runs.push([...argv]), inner(argv, o))
  const mkdirs = () => w.runs.filter(r => r[0] === 'mkdir').length
  const b = bigBoard()
  await saveBoard(w.host, b)
  expect(mkdirs()).toBe(1)
  await saveBoard(w.host, b)
  await saveBoard(w.host, b)
  expect(mkdirs()).toBe(1)
})
