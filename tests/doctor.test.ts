// /symcc-doctor (T-676): each check finds its case, nothing changes without "fix", unmerged branches and folders with
// uncommitted changes are never deleted, and after "fix" the listed items are gone. Runs on the fake Host with a
// scripted fake git and an in-memory folder tree.
import { expect } from 'claude-code/testing'
import { type BoardTask, emptyBoard, leadText } from '../hooks/board'
import { oldBackups, parseDoctorArgs, backupIds } from '../hooks/core/doctor'
import { doctor } from '../hooks/app/doctor'
import { runCommand, COMMANDS } from '../hooks/app/symcc'
import { runTool, TOOLS, manual } from '../hooks/app/tools'
import { S, finishing, workers, starting } from '../hooks/app/state'
import type { HostFileEntry, HostRunResult } from '../hooks/host'
import { test } from './reset'
import { fakeHost, done } from './fake-host'

const ROOT = '/repo'
const D = `${ROOT}/.symcc`
const MB = 1024 * 1024
const NOW = Date.now()
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()
const sha = (c: string) => c.repeat(40)

function task(id: string, status: BoardTask['status'], over: Partial<BoardTask> = {}): BoardTask {
  return { id, title: `task ${id}`, details: '', files: [], status, note: '', priority: 0, after: [], attempts: 1, history: [], branch: `symcc/${id}`, merge_into: 'main', created_at: iso(60), updated_at: iso(60), origin: { by: 'lead', why: 'x', at: iso(60) }, ...over } as BoardTask
}

/**
 * The owner's case in small: three board.json migration backups (the newest is kept) and one of archive.json, a big
 * view.json, a .DS_Store and an empty scratch/ folder; task folders of a done task (clean), a dropped one (with
 * changes) and a running one; branches of done and dropped tasks in main, and one of a dropped task with unmerged
 * work; a stale worktree entry; a lead.json of a session gone an hour ago and a running task with no worker.
 */
function world(over: { tasks?: BoardTask[]; folders?: string[] } = {}) {
  const files = new Map<string, { size: number; text?: string }>()
  const dirs = new Set<string>([D, `${D}/worktrees`, `${D}/reports`, `${D}/scratch`, `${D}/tasks`])
  const tasks = over.tasks ?? [task('T-2', 'done'), task('T-3', 'dropped'), task('T-5', 'done'), task('T-6', 'dropped'), task('T-494', 'dropped'), task('T-7', 'doing', { runs: [{ started: iso(30) }] }), task('T-8', 'todo')]
  const add = (p: string, size: number, text?: string) => files.set(p, { size, ...(text !== undefined ? { text } : {}) })
  add(`${D}/board.json`, 2000, JSON.stringify({ ...emptyBoard(), tasks }))
  add(`${D}/lead.json`, 60, leadText('old-session', NOW - 60 * 60_000))
  add(`${D}/board.json.before-migrate-2026-11-01T10-00-00-000Z`, 1.5 * MB)
  add(`${D}/board.json.before-migrate-2026-11-02T10-00-00-000Z`, 1.5 * MB)
  add(`${D}/board.json.before-migrate-2026-11-03T10-00-00-000Z`, 1.5 * MB)
  add(`${D}/archive.json.before-migrate-2026-11-02T10-00-00-000Z`, 1 * MB)
  add(`${D}/view.json`, 3.5 * MB)
  add(`${D}/.DS_Store`, 6000)
  add(`${D}/org-mem.md`, 500)
  add(`${D}/reports/T-2-try-1.md`, 300)
  for (const id of ['T-5', 'T-6', 'T-7', ...(over.folders ?? [])]) {
    dirs.add(`${D}/worktrees/${id}`)
    add(`${D}/worktrees/${id}/.git`, 40)
  }
  const dirty = new Set([`${D}/worktrees/T-6`, `${D}/worktrees/T-7`])
  const branches = new Map([['symcc/T-2', sha('a')], ['symcc/T-3', sha('b')], ['symcc/T-5', sha('c')], ['symcc/T-6', sha('d')], ['symcc/T-494', sha('e')], ['symcc/T-7', sha('f')]])
  const statusOf = new Map<string, string>()
  const inMain = new Set([sha('a'), sha('b'), sha('c'), sha('d')])
  /** HEAD commits of folders that are not on their task's branch (a detached HEAD) */
  const heads = new Map<string, string>()
  /** HEAD commits a folder gets after its first look (a commit made between the list and the fix) */
  const later = new Map<string, string>()
  let stale = 1
  let merging = false
  const writes: string[] = []
  const list = async (p: string): Promise<HostFileEntry[]> => {
    if (!dirs.has(p)) throw new Error(`no folder ${p}`)
    const kids = new Map<string, HostFileEntry>()
    for (const [f, v] of files) if (f.startsWith(`${p}/`) && !f.slice(p.length + 1).includes('/')) kids.set(f, { name: f.slice(p.length + 1), kind: 'file', size: v.size, mtimeMs: 0, isLink: false })
    for (const d of dirs) if (d.startsWith(`${p}/`) && !d.slice(p.length + 1).includes('/')) kids.set(d, { name: d.slice(p.length + 1), kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
    return [...kids.values()]
  }
  const run = async (argv: readonly string[], init?: { cwd?: string }): Promise<HostRunResult> => {
    const a = [...argv]
    const j = a.join(' ')
    if (a[0] === 'rm') {
      writes.push(j)
      files.delete(a[2]!)
      return done()
    }
    if (a[0] === 'du') return done({ stdout: `2048\t${a[2]}\n` })
    if (a[0] !== 'git') return done()
    const g = a.slice(1)
    const s = g.join(' ')
    if (s === 'rev-parse -q --verify MERGE_HEAD') return merging ? done({ stdout: sha('9') }) : done({ exitCode: 1 })
    if (s === 'rev-parse -q --verify HEAD') {
      const dir = init?.cwd ?? ''
      const h = heads.get(dir) ?? branches.get(`symcc/${dir.split('/').pop()}`)
      if (later.has(dir)) heads.set(dir, later.get(dir)!)
      return h ? done({ stdout: `${h}\n` }) : done({ exitCode: 1 })
    }
    if (g[0] === 'branch' && g[1] === '--contains') return done({ stdout: [...branches].filter(([, h]) => h === g[2]).map(([b]) => `${b}\n`).join('') })
    if (s === 'status --porcelain --untracked-files=all') return done({ stdout: statusOf.get(init?.cwd ?? '') ?? (dirty.has(init?.cwd ?? '') ? ' M a.txt\n' : '') })
    if (s === 'worktree prune --dry-run -v') return done({ stderr: stale ? 'Removing worktrees/T-9: gitdir file points to non-existent location\n' : '' })
    if (s === 'worktree prune') return (writes.push(j), (stale = 0), done())
    if (g[0] === 'worktree' && g[1] === 'remove') {
      writes.push(j)
      const dir = g.at(-1)!
      if (dirty.has(dir) && !g.includes('--force')) return done({ exitCode: 128, stderr: 'contains modified files' })
      dirs.delete(dir)
      for (const f of [...files.keys()]) if (f.startsWith(`${dir}/`)) files.delete(f)
      return done()
    }
    if (s === 'worktree list --porcelain') return done({ stdout: [...dirs].filter(d => d.startsWith(`${D}/worktrees/`)).map(d => `worktree ${d}\nbranch refs/heads/symcc/${d.split('/').pop()}\n`).join('\n') })
    if (g[0] === 'for-each-ref') return done({ stdout: [...branches].map(([b, h]) => `${b} ${h}`).join('\n') + '\n' })
    if (g[0] === 'merge-base' && g[1] === '--is-ancestor') return done({ exitCode: inMain.has(g[2]!) ? 0 : 1 })
    if (g[0] === 'rev-list' && g[1] === '--count') return done({ stdout: '3\n' })
    if (g[0] === 'rev-parse' && g[1] === '--verify' && g[2] === '-q') {
      const h = branches.get(String(g[3]).replace('refs/heads/', ''))
      return h ? done({ stdout: `${h}\n` }) : done({ exitCode: 1 })
    }
    if (g[0] === 'branch' && g[1] === '-D') {
      writes.push(j)
      branches.delete(g[2]!)
      return done()
    }
    if (g[0] === 'update-ref' && g[1] === '-d') {
      writes.push(j)
      branches.delete(g[2]!.replace('refs/heads/', ''))
      return done()
    }
    return done()
  }
  const w = fakeHost({
    run,
    fs: {
      read: async p => {
        const f = files.get(p)
        if (f?.text === undefined) throw new Error(`no file ${p}`)
        return f.text
      },
      write: async (p, text) => (writes.push(`write ${p}`), void files.set(p, { size: text.length, text })),
      exists: async p => files.has(p) || dirs.has(p),
      list,
      stat: async p => {
        const f = files.get(p)
        if (!f) throw new Error(`no file ${p}`)
        return { kind: 'file', size: f.size, mtimeMs: 0, isLink: false }
      },
    },
  })
  S.root = ROOT
  S.me = 'me'
  S.writing = Promise.resolve()
  return { ...w, files, dirs, branches, writes, heads, later, statusOf, setMerging: (on: boolean) => void (merging = on) }
}

test('T-676: the doctor lists each case it finds, with sizes, and changes nothing without fix', async () => {
  const w = world()
  const before = new Map(w.files)
  const text = (await runCommand(w.host, 'symcc-doctor', ''))!.text
  // every finding of the owner's case, the fixable ones numbered
  expect(text).toContain('m-1101-1000  old migration backup .symcc/board.json.before-migrate-2026-11-01')
  expect(text).not.toContain('archive.json.before-migrate')
  expect(text).not.toContain('board.json.before-migrate-2026-11-03')
  expect(text).toContain('.symcc/board.json.before-migrate-2026-11-01T10-00-00-000Z (a newer one is kept)  (1.5 MB)')
  expect(text).toContain('.symcc/board.json.before-migrate-2026-11-02T10-00-00-000Z')
  expect(text).toContain('m-1102-1000  old migration backup')
  expect(text).toContain('w-T-5  folder .symcc/worktrees/T-5/ (T-5 is done)  (2.0 MB)')
  expect(text).toContain('p-worktrees  1 git worktree entry whose folder is gone')
  expect(text).toContain('b-T-2  branch symcc/T-2 (T-2 is done; all of it is already in main)')
  expect(text).toContain('b-T-5  branch symcc/T-5 (T-5 is done; all of it is already in main) (goes after its folder, w-T-5)')
  // merged, but checked out in a folder kept for its uncommitted changes: git can't delete it, so it is only listed
  // T-1031: a dropped task's folder with changes and branch with unmerged commits are offered, saying what is lost
  expect(text).toContain('w-T-6  folder .symcc/worktrees/T-6/ (T-6 is dropped): deletes 1 uncommitted changed file  (2.0 MB)')
  expect(text).toContain('b-T-6  branch symcc/T-6 (T-6 is dropped; all of it is already in main) (goes after its folder, w-T-6)')
  expect(text).toContain('b-T-3  branch symcc/T-3 (T-3 is dropped; all of it is already in main)')
  expect(text).toContain('b-T-494  branch symcc/T-494 (T-494 is dropped): deletes 3 commits not in main')
  expect(text).toContain('.symcc/view.json is close to the 4.0 MB limit')
  expect(text).toContain('stray file .symcc/.DS_Store')
  expect(text).toContain('empty folder .symcc/scratch/')
  expect(text).toContain('.symcc/lead.json names a session that stopped 60 min ago')
  expect(text).toContain('/symcc-drive')
  expect(text).toContain('T-7 is running but has no live worker (for 30 min): /symcc-task T-7 retry')
  expect(text).toContain('To clean up all 10: /symcc-doctor fix · only some: /symcc-doctor fix m-1101-1000 m-1102-1000')
  // a running task's folder and branch are not offered
  expect(text).not.toContain('worktrees/T-7/ (')
  expect(text).not.toContain('symcc/T-7 (')
  // nothing was changed
  expect(w.writes).toEqual([])
  expect([...w.files.keys()]).toEqual([...before.keys()])
  expect(w.branches.size).toBe(6)
})

test('T-676: fix cleans up every listed item, and never reports, org-mem, or a running tasks folder or branch', async () => {
  const w = world()
  const said = await doctor(w.host, 'fix')
  expect(said).toContain('cleaned up 10 of 10')
  expect(said).toContain('Freed about')
  // backups: the newest one of each file is kept
  expect(w.files.has(`${D}/board.json.before-migrate-2026-11-01T10-00-00-000Z`)).toBe(false)
  expect(w.files.has(`${D}/board.json.before-migrate-2026-11-02T10-00-00-000Z`)).toBe(false)
  expect(w.files.has(`${D}/board.json.before-migrate-2026-11-03T10-00-00-000Z`)).toBe(true)
  expect(w.files.has(`${D}/archive.json.before-migrate-2026-11-02T10-00-00-000Z`)).toBe(true)
  // folders: the done task's is gone (without --force), the dropped one with changes goes with --force, the running one stays
  expect(w.dirs.has(`${D}/worktrees/T-5`)).toBe(false)
  expect(w.dirs.has(`${D}/worktrees/T-6`)).toBe(false)
  expect(w.dirs.has(`${D}/worktrees/T-7`)).toBe(true)
  expect(w.writes).toContain(`git worktree remove ${D}/worktrees/T-5`)
  expect(w.writes).toContain(`git worktree remove --force ${D}/worktrees/T-6`)
  expect(w.writes).toContain('git branch -D symcc/T-494')
  expect(w.writes).toContain('git worktree prune')
  // branches: those of done and dropped tasks are gone (T-5's and T-6's after their folders went); the running one stays
  expect([...w.branches.keys()]).toEqual(['symcc/T-7'])
  expect(said).not.toContain('✗')
  // never touched
  for (const f of ['org-mem.md', 'reports/T-2-try-1.md', 'board.json', 'lead.json', 'view.json', '.DS_Store']) expect(w.files.has(`${D}/${f}`)).toBe(true)
  // checked again: only the listed items are left
  const again = await doctor(w.host, '')
  expect(again).not.toContain('Can be cleaned up')
})

test('T-676: fix with ids cleans up only those; an id no longer offered is skipped, never matched to another item', async () => {
  const w = world()
  expect(await doctor(w.host, 'fix b-T-99')).toContain('Not offered any more, nothing done: b-T-99')
  expect('bad' in parseDoctorArgs('fix 2', 'symcc')).toBe(true)
  expect(w.writes).toEqual([])
  // the owner sees the list, then one item goes away before the fix (here the oldest backup)
  const seen = await doctor(w.host, '')
  expect(seen).toContain('m-1101-1000  ')
  expect(seen).toContain('m-1102-1000  ')
  w.files.delete(`${D}/board.json.before-migrate-2026-11-01T10-00-00-000Z`)
  const said = await doctor(w.host, 'fix m-1101-1000 m-1102-1000 b-t-2')
  expect(said).toContain('cleaned up 2 of 2')
  expect(said).toContain('Not offered any more, nothing done: m-1101-1000')
  // only the confirmed ones that were still offered went; the newest backup and every other item stay
  expect(w.writes).toEqual([`rm -f ${D}/board.json.before-migrate-2026-11-02T10-00-00-000Z`, 'git update-ref -d refs/heads/symcc/T-2 ' + sha('a')])
  expect(w.files.has(`${D}/board.json.before-migrate-2026-11-03T10-00-00-000Z`)).toBe(true)
  expect(w.branches.size).toBe(5)
})

test('T-684: during a merge the doctor still lists (leaving out the merging task) and changes nothing', async () => {
  // T-7 is being merged on the board: its folder and branch are marked "being merged", never offered
  const tasks = [task('T-2', 'done'), task('T-5', 'done'), task('T-7', 'doing', { live: { checking: { step: 'prep', at: new Date().toISOString() } }, })]
  const w = world({ tasks })
  const text = await doctor(w.host, '')
  expect(text).toContain("A merge is in progress (T-7's work is being checked and merged): this is only the list; /symcc-doctor fix waits until it is done.")
  expect(text).toContain('m-1101-1000  old migration backup')
  expect(text).toContain('w-T-5  folder .symcc/worktrees/T-5/ (T-5 is done)')
  expect(text).toContain('b-T-2  branch symcc/T-2')
  expect(text).toContain('- folder .symcc/worktrees/T-7/ (T-7 is being merged), left alone')
  expect(text).toContain('- branch symcc/T-7 (T-7 is being merged), left alone')
  expect(text).not.toContain('w-T-7')
  expect(text).not.toContain('b-T-7')
  // nobody drives the board and T-7 has no worker, yet it is not called stuck: it is being merged
  expect(text).not.toContain('T-7 is running but has no live worker')
  expect(text).not.toContain('T-7 retry')
  expect(w.writes).toEqual([])
  // a done task this copy is merging now (in `finishing`): its folder and branch are not offered either
  const m = world()
  finishing.add('T-5')
  const mine = await doctor(m.host, '')
  expect(mine).toContain("A merge is in progress (T-5's work is being checked and merged)")
  expect(mine).toContain('- folder .symcc/worktrees/T-5/ (T-5 is being merged), left alone')
  expect(mine).not.toContain('w-T-5')
  expect(mine).not.toContain('b-T-5')
  expect(mine).toContain('b-T-2  branch symcc/T-2')
  finishing.clear()
  expect(m.writes).toEqual([])
})

test('T-684: during a merge, fix changes nothing and says which merge runs (the list is still shown)', async () => {
  const w = world({ tasks: [task('T-2', 'done'), task('T-9', 'doing', { live: { checking: { step: 'prep', at: new Date().toISOString() } }, })] })
  const said = await doctor(w.host, 'fix')
  expect(said).toContain("doesn't fix anything while a merge is in progress (T-9's work is being checked and merged); nothing was changed. Try /symcc-doctor fix again when it is done.")
  expect(said).toContain('b-T-2  branch symcc/T-2')
  expect(said).not.toContain('doctor cleaned up')
  const g = world()
  g.setMerging(true)
  const git = await runTool(g.host, 'doctor', { fix: 'all' })
  expect(git).toContain("doesn't fix anything while a merge is in progress (git is in the middle of a merge in the project folder)")
  expect(git).toContain('w-T-5  folder')
  expect([...w.writes, ...g.writes]).toEqual([])
  expect(g.branches.size).toBe(6)
  // once the merge is done, the same fix works as before
  g.setMerging(false)
  expect(await doctor(g.host, 'fix')).toContain('cleaned up 10 of 10')
  expect(g.dirs.has(`${D}/worktrees/T-5`)).toBe(false)
})

test('T-676: the lead tool, the command and the words', async () => {
  expect(COMMANDS().some(c => c.name === 'symcc-doctor')).toBe(true)
  expect(TOOLS().some(t => t.name === 'doctor')).toBe(true)
  const w = world()
  expect(await runTool(w.host, 'doctor', {})).toContain('Can be cleaned up')
  expect(w.writes).toEqual([])
  expect(await runTool(w.host, 'doctor', { fix: 'w-T-5' })).toContain('cleaned up 1 of 1')
  expect(w.dirs.has(`${D}/worktrees/T-5`)).toBe(false)
  expect(parseDoctorArgs('', 'symcc')).toEqual({ fix: null })
  expect(parseDoctorArgs('fix all', 'symcc')).toEqual({ fix: 'all' })
  expect(parseDoctorArgs('fix b-T-3, w-T-3 b-t-3', 'symcc')).toEqual({ fix: ['b-T-3', 'w-T-3'] })
  expect('bad' in parseDoctorArgs('clean', 'symcc')).toBe(true)
  const ids = backupIds(['board.json.before-migrate-2026-11-13T09-05-01-000Z', 'board.json.before-migrate-2026-11-13T09-05-30-000Z', 'board.json.before-migrate-2026-11-14T08-00-00-000Z', 'archive.json.before-migrate-2026-11-14T08-00-00-000Z'])
  expect([...ids.values()]).toEqual(['m-1113-090501', 'm-1113-090530', 'm-1114-0800', 'm-archive-1114-0800'])
  expect(oldBackups([{ name: 'board.json.before-migrate-b' }, { name: 'board.json.before-migrate-a' }, { name: 'board.json' }]).map(f => f.name)).toEqual(['board.json.before-migrate-a'])
})

test('T-676: a board that can not be read: no folder, worktree entry or branch is offered, only the file checks', async () => {
  const w = world({ folders: ['T-20'] })
  w.files.set(`${D}/board.json`, { size: 9, text: '{ broken' })
  const text = await doctor(w.host, '')
  expect(text).toContain("the board can't be read, so folders and branches are left alone")
  expect(text).toContain('m-1101-1000  old migration backup')
  expect(text).toContain('.symcc/view.json is close to the 4.0 MB limit')
  expect(text).not.toContain('w-T-')
  expect(text).not.toContain('b-T-')
  expect(text).not.toContain('p-worktrees')
  expect(text).not.toContain('worktrees/T-20')
  const said = await doctor(w.host, 'fix')
  expect(said).toContain('cleaned up 2 of 2')
  expect(w.dirs.has(`${D}/worktrees/T-20`)).toBe(true)
  expect(w.dirs.has(`${D}/worktrees/T-5`)).toBe(true)
  expect(w.branches.size).toBe(6)
  expect(w.writes.some(x => x.startsWith('git '))).toBe(false)
})

test('T-676: a folder of a task not on the board is only listed, never offered', async () => {
  const w = world({ folders: ['T-20'] })
  const text = await doctor(w.host, '')
  expect(text).toContain('- folder .symcc/worktrees/T-20/ (T-20 is not on the board), kept')
  expect(text).not.toContain('w-T-20')
  expect(await doctor(w.host, 'fix w-T-20')).toContain('Not offered any more, nothing done: w-T-20')
  await doctor(w.host, 'fix')
  expect(w.dirs.has(`${D}/worktrees/T-20`)).toBe(true)
  expect(w.writes.some(x => x.includes('T-20'))).toBe(false)
})

test('T-676: a clean folder whose HEAD holds commits on no branch is kept, also when they come between the list and the fix', async () => {
  const w = world()
  w.heads.set(`${D}/worktrees/T-5`, sha('z'))
  const text = await doctor(w.host, '')
  expect(text).toContain('- folder .symcc/worktrees/T-5/ (T-5 is done) holds commits on no branch, kept')
  expect(text).not.toContain('w-T-5')
  expect(text).not.toContain('b-T-5')
  await doctor(w.host, 'fix')
  expect(w.dirs.has(`${D}/worktrees/T-5`)).toBe(true)
  expect(w.branches.has('symcc/T-5')).toBe(true)
  // a HEAD on some branch (here not in main) is safe: the folder can go
  const o = world()
  o.heads.set(`${D}/worktrees/T-5`, sha('e'))
  expect(await doctor(o.host, '')).toContain('w-T-5  folder')
  // checked again right before removal: a commit made after the check keeps the folder
  const r = world()
  r.later.set(`${D}/worktrees/T-5`, sha('z'))
  const said = await doctor(r.host, 'fix w-T-5')
  expect(said).toContain('✗ w-T-5')
  expect(said).toContain('holds commits on no branch now')
  expect(r.dirs.has(`${D}/worktrees/T-5`)).toBe(true)
  expect(r.writes.some(x => x.startsWith('git worktree remove'))).toBe(false)
})

test('T-1031: a failed or paused task keeps its folder with changes and its branch with unmerged commits, never offered or deleted', async () => {
  const tasks = [task('T-6', 'failed'), task('T-494', 'paused'), task('T-3', 'dropped')]
  const w = world({ tasks })
  const text = await doctor(w.host, '')
  expect(text).not.toContain('w-T-6')
  expect(text).not.toContain('b-T-6')
  expect(text).not.toContain('b-T-494')
  expect(text).toContain('b-T-3  branch symcc/T-3')
  await doctor(w.host, 'fix all')
  expect(w.dirs.has(`${D}/worktrees/T-6`)).toBe(true)
  expect(w.branches.has('symcc/T-6')).toBe(true)
  expect(w.branches.has('symcc/T-494')).toBe(true)
  expect(w.writes.some(x => x.includes('--force') || x.includes('branch -D symcc/T-494'))).toBe(false)
})

test('T-1031: fix with ids removes a dropped tasks folder with changes and its unmerged branch', async () => {
  const w = world()
  const said = await doctor(w.host, 'fix w-T-6 b-T-494')
  expect(said).toContain('cleaned up 2 of 2')
  expect(w.dirs.has(`${D}/worktrees/T-6`)).toBe(false)
  expect(w.branches.has('symcc/T-494')).toBe(false)
  expect(w.branches.has('symcc/T-6')).toBe(true)
  // the task is brought back between the list and the fix: nothing goes
  const v = world()
  await doctor(v.host, '')
  const b = JSON.parse(v.files.get(`${D}/board.json`)!.text!)
  for (const t of b.tasks) if (t.id === 'T-494' || t.id === 'T-6') t.status = 'todo'
  v.files.set(`${D}/board.json`, { size: 2000, text: JSON.stringify(b) })
  expect(await doctor(v.host, 'fix w-T-6 b-T-494')).toContain('Not offered any more')
  expect(v.dirs.has(`${D}/worktrees/T-6`)).toBe(true)
  expect(v.branches.has('symcc/T-494')).toBe(true)
})

test('T-1031: an archived dropped task is offered and removed too; an untracked folder counts every file in it', async () => {
  const w = world({ tasks: [task('T-2', 'done'), task('T-7', 'doing', { runs: [{ started: iso(30) }] })] })
  const arch = [task('T-6', 'dropped'), task('T-494', 'dropped')]
  w.files.set(`${D}/archive.json`, { size: 500, text: JSON.stringify({ version: 1, tasks: arch }) })
  w.statusOf.set(`${D}/worktrees/T-6`, '?? d/a\n?? d/b\n?? d/c\n?? d/d\n?? d/e\n')
  const text = await doctor(w.host, '')
  expect(text).toContain('deletes 5 uncommitted changed files')
  const said = await doctor(w.host, 'fix w-T-6 b-T-6 b-T-494')
  expect(said).toContain('cleaned up 3 of 3')
  expect(w.dirs.has(`${D}/worktrees/T-6`)).toBe(false)
  expect(w.branches.has('symcc/T-6')).toBe(false)
  expect(w.branches.has('symcc/T-494')).toBe(false)
})

test('T-1032: a live worker of a dropped task keeps its dirty folder, never removed with --force; other dropped items still go', async () => {
  const w = world()
  w.host.agents.list = async () => [{ id: 'ag-6', kind: 'worker', status: 'running', description: 'T-6 fix the thing' }]
  const text = await doctor(w.host, '')
  expect(text).toContain('- folder .symcc/worktrees/T-6/ (T-6 is dropped): an agent may still use it, kept')
  expect(text).not.toContain('w-T-6')
  expect(text).toContain('b-T-494  branch symcc/T-494 (T-494 is dropped): deletes 3 commits not in main')
  await doctor(w.host, 'fix all')
  expect(w.writes).not.toContain(`git worktree remove --force ${D}/worktrees/T-6`)
  expect(w.dirs.has(`${D}/worktrees/T-6`)).toBe(true)
  expect(w.branches.has('symcc/T-494')).toBe(false)
})

test('T-1032: when the agent list fails, no task folder or dropped branch is offered or deleted, and nothing is forced', async () => {
  const w = world()
  w.host.agents.list = async () => {
    throw new Error('agents unknown')
  }
  const text = await doctor(w.host, '')
  expect(text).not.toContain('w-T-')
  expect(text).not.toContain('b-T-494')
  expect(text).not.toContain('b-T-6')
  expect(text).not.toContain('b-T-3')
  expect(text).toContain('- branch symcc/T-494 (T-494 is dropped): an agent may still use it, kept')
  await doctor(w.host, 'fix all')
  for (const id of ['T-5', 'T-6']) expect(w.dirs.has(`${D}/worktrees/${id}`)).toBe(true)
  for (const id of ['T-3', 'T-6', 'T-494']) expect(w.branches.has(`symcc/${id}`)).toBe(true)
  expect(w.writes.some(x => x.includes('--force') || x.includes('branch -D') || x.includes('worktree remove'))).toBe(false)
})

test('T-1032: a worker of this window started between the list and the fix keeps a dropped branch', async () => {
  const w = world()
  // the doctor asks for the agents once for the list and again right before the fix: this window's worker starts in between
  let asked = 0
  w.host.agents.list = async () => {
    if (++asked === 2) workers.set('ag-494', { task: 'T-494', worktree: `${D}/worktrees/T-494`, branch: 'symcc/T-494', since: 0 })
    return []
  }
  const said = await doctor(w.host, 'fix b-T-494')
  expect(said).toContain('cleaned up 0 of 1')
  expect(said).toContain('✗ b-T-494')
  expect(said).toContain('kept, an agent may still use it')
  expect(w.branches.has('symcc/T-494')).toBe(true)
  expect(w.writes.some(x => x.includes('branch -D'))).toBe(false)
})

test('T-1035: a worker of this window started between the list and the fix keeps a dropped task folder', async () => {
  const w = world()
  // the second agents.list call is the folder fix's last-moment check: this window's worker for T-6 starts in between
  let asked = 0
  w.host.agents.list = async () => {
    if (++asked === 2) workers.set('ag-6', { task: 'T-6', worktree: `${D}/worktrees/T-6`, branch: 'symcc/T-6', since: 0 })
    return []
  }
  const said = await doctor(w.host, 'fix w-T-6')
  expect(asked).toBe(2)
  expect(said).toContain('cleaned up 0 of 1')
  expect(said).toContain('✗ w-T-6')
  expect(said).toContain('kept, an agent may still use it')
  expect(w.dirs.has(`${D}/worktrees/T-6`)).toBe(true)
  expect(w.writes.some(x => x.includes('worktree remove'))).toBe(false)
})

test('T-1032: a worker of this window keeps its dropped task folder and branch out of the list', async () => {
  const w = world()
  workers.set('ag-6', { task: 'T-6', worktree: `${D}/worktrees/T-6`, branch: 'symcc/T-6', since: 0 })
  starting.add('T-494')
  const text = await doctor(w.host, '')
  expect(text).toContain('- folder .symcc/worktrees/T-6/ (T-6 is dropped): an agent may still use it, kept')
  expect(text).not.toContain('w-T-6')
  expect(text).not.toContain('b-T-494')
  expect(text).toContain('b-T-3  branch symcc/T-3')
  await doctor(w.host, 'fix all')
  expect(w.dirs.has(`${D}/worktrees/T-6`)).toBe(true)
  expect(w.branches.has('symcc/T-494')).toBe(true)
  expect(w.branches.has('symcc/T-3')).toBe(false)
})

test('T-1033: the manual and the command say fix deletes a dropped task\'s unsaved folder and unmerged branch', async () => {
  const text = manual('')
  const line = text.slice(text.indexOf('/symcc-doctor [fix'))
  const doctorLine = line.slice(0, line.indexOf('/symcc-help'))
  expect(doctorLine).toContain('For a dropped')
  expect(doctorLine).toContain('unmerged')
  expect(doctorLine).toContain('for other tasks such work is only listed')
  expect(doctorLine).not.toContain('Unmerged\n')
  const cmd = COMMANDS().find(c => c.name === 'symcc-doctor')!
  expect(cmd.description).toContain('for a dropped task, fix also deletes its folder with unsaved changes and its unmerged branch')
})
