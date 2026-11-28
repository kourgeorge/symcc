// T-1218: a board's friendly name (power-falcon): picked once, never clashing with another board's branches in a repo;
// task branches are symcc/<name>/T-n; the one-time migration renames this board's open symcc/T-n branches only.
import { expect } from 'claude-code/testing'
import { emptyBoard, bannerLines } from '../hooks/board'
import { pickBoardName, isBoardName } from '../hooks/core/board-name'
import { load, change } from '../hooks/app/store'
import { doctor } from '../hooks/app/doctor'
import { migrateIfOld, forgetMigrationFailure } from '../hooks/app/migrate-data'
import { readBranches } from '../hooks/app/branches'
import { newFriendlyName, useFriendly } from '../hooks/app/board-name'
import { taskBranch } from '../hooks/app/worktree'
import { branchesToDelete } from '../hooks/core/git-setup'
import { S } from '../hooks/app/state'
import type { HostRunResult } from '../hooks/host'
import { test } from './reset'
import { fakeHost, done } from './fake-host'

const ROOT = '/repo'
const D = `${ROOT}/.symcc`
const T = '2026-11-01T08:00:00.000Z'
const base = { details: '', files: [], priority: 1, after: [], created_at: T, updated_at: T, attempts: 0, note: '', timeline: [], merge_into: 'main', origin: { by: 'lead', why: 'w', at: T } }

/** An in-memory repo at /repo: branches by name, and a git that knows for-each-ref, rev-parse and branch -m. */
function world(branches: string[], board?: object) {
  const files = new Map<string, string>()
  if (board) files.set(`${D}/board.json`, JSON.stringify(board))
  const refs = new Set(branches)
  const run = async (argv: readonly string[]): Promise<HostRunResult> => {
    const [cmd, ...a] = argv
    if (cmd === 'ln') {
      if (files.has(a[1]!)) return done({ exitCode: 1, stderr: 'File exists' })
      files.set(a[1]!, files.get(a[0]!)!)
      return done()
    }
    if (cmd === 'mv') {
      files.set(a[2]!, files.get(a[1]!)!)
      files.delete(a[1]!)
      return done()
    }
    if (cmd === 'rm') {
      for (const p of a.filter(x => !x.startsWith('-'))) files.delete(p)
      return done()
    }
    if (cmd !== 'git') return done()
    if (a[0] === 'for-each-ref') {
      const pre = a[a.length - 1]!.replace('refs/heads/', '')
      return done({ stdout: [...refs].filter(r => r.startsWith(pre)).map(r => (a.some(x => x.includes('objectname')) ? `${r} abc` : `refs/heads/${r}`)).join('\n') })
    }
    if (a[0] === 'rev-parse' && a.includes('--verify')) return refs.has(a[a.length - 1]!.replace('refs/heads/', '')) ? done({ stdout: 'abc\n' }) : done({ exitCode: 1 })
    if (a[0] === 'branch' && a[1] === '-m') {
      refs.delete(a[2]!)
      refs.add(a[3]!)
      return done()
    }
    return done()
  }
  const w = fakeHost({
    run,
    fs: {
      read: async p => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return files.get(p)!
      },
      write: async (p, text) => void files.set(p, text),
      exists: async p => files.has(p) || [...files.keys()].some(f => f.startsWith(`${p}/`)),
      list: async () => [],
      stat: async p => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return { kind: 'file', size: files.get(p)!.length, mtimeMs: 0, isLink: false }
      },
    },
  })
  S.root = ROOT
  S.me = 'me'
  S.writing = Promise.resolve()
  S.enabledNow = true
  forgetMigrationFailure()
  return { ...w, files, refs }
}

test('T-1218: pickBoardName gives two words with a dash, and picks again when the name is taken', async () => {
  const seq = [0, 0, 0.5, 0.5]
  let i = 0
  const random = () => seq[i++ % seq.length]!
  const first = await pickBoardName(async () => false, random)
  expect(isBoardName(first)).toBe(true)
  i = 0
  const again = await pickBoardName(async n => n === first, random)
  expect(again).not.toBe(first)
  expect(isBoardName(again)).toBe(true)
})

test('T-1218: a new board gets a name that stays the same across loads and is saved with the board', async () => {
  const w = world([])
  const a = await load(w.host)
  expect(isBoardName(a.name)).toBe(true)
  await change(w.host, b => ({ ...b, max_parallel: 2 }))
  const saved = JSON.parse(w.files.get(`${D}/board.json`)!)
  expect(saved.name).toBe(a.name)
  expect((await load(w.host)).name).toBe(a.name)
  expect(S.N.branch('T-5')).toBe(`symcc/${a.name}/T-5`)
  expect(taskBranch({ id: 'T-5', branch: null })).toBe(`symcc/${a.name}/T-5`)
})

test('T-1218: the name is picked again when its prefix already exists in the repo', async () => {
  const w = world(['symcc/able-falcon/T-1'])
  S.root = ROOT
  const seq = [0, 0, 0, 0.1, 0.5, 0.5]
  let i = 0
  const name = await newFriendlyName(w.host, () => seq[Math.min(i++, seq.length - 1)]!)
  expect(name).not.toBe('able-falcon')
  expect(w.refs.has(`symcc/${name}/T-1`)).toBe(false)
})

test('T-1218: cleanup after a merge deletes only this board\'s branch', () => {
  const tasks = [{ id: 'T-5', status: 'done' as const, branch: undefined as never }]
  const merged = ['  symcc/quiet-river/T-5', '  symcc/power-falcon/T-5']
  expect(branchesToDelete(tasks, merged, 'symcc/power-falcon/')).toEqual(['symcc/power-falcon/T-5'])
})

test('T-1218: the migration renames this board\'s open symcc/T-n branch and leaves another task\'s alone', async () => {
  const board = { ...emptyBoard(), data_version: 2, tasks: [{ ...base, id: 'T-5', title: 'five', status: 'doing', branch: 'symcc/T-5', runs: [{ started: T }] }] }
  const w = world(['symcc/T-5', 'symcc/T-99', 'main'], board)
  expect(await migrateIfOld(w.host)).toBe('')
  const saved = JSON.parse(w.files.get(`${D}/board.json`)!)
  expect(isBoardName(saved.name)).toBe(true)
  expect(saved.tasks[0].branch).toBe(`symcc/${saved.name}/T-5`)
  expect(w.refs.has(`symcc/${saved.name}/T-5`)).toBe(true)
  expect(w.refs.has('symcc/T-5')).toBe(false)
  expect(w.refs.has('symcc/T-99')).toBe(true)
})

test('T-1218: the doctor leaves another board\'s branches alone', async () => {
  const board = { ...emptyBoard(), name: 'power-falcon', tasks: [{ ...base, id: 'T-5', title: 'five', status: 'done', branch: null, merged: 'abc' }] }
  const w = world(['symcc/quiet-river/T-5', 'symcc/power-falcon/T-5'], board)
  await load(w.host)
  const text = await doctor(w.host, '')
  expect(text).not.toContain('quiet-river')
})

test('T-1218: the board header shows the name between the version and the folder', () => {
  const b = { ...emptyBoard(), board_name: 'power-falcon' }
  const lines = bannerLines(b, '/home/me/repositories/symcc', '/home/me', true, 100, Date.now(), 'symcc', undefined, '0.6.0')
  const first = JSON.stringify(lines[0])
  expect(first).toContain(' · power-falcon')
})

test('T-1218: two boards (different names) on one repo each get their own T-5 branch and do not touch the other\'s', () => {
  const w = world(['symcc/quiet-river/T-5', 'main'])
  useFriendly('power-falcon')
  expect(taskBranch({ id: 'T-5', branch: undefined as never })).toBe('symcc/power-falcon/T-5')
  useFriendly('quiet-river')
  expect(taskBranch({ id: 'T-5', branch: undefined as never })).toBe('symcc/quiet-river/T-5')
  const all = ['  symcc/quiet-river/T-5', '  symcc/power-falcon/T-5']
  const t = [{ id: 'T-5', status: 'done' as const, branch: undefined as never }]
  expect(branchesToDelete(t, all, 'symcc/quiet-river/')).toEqual(['symcc/quiet-river/T-5'])
  expect(branchesToDelete(t, all, 'symcc/power-falcon/')).toEqual(['symcc/power-falcon/T-5'])
  expect(w.refs.has('symcc/quiet-river/T-5')).toBe(true)
  useFriendly('power-falcon')
})

test('T-1218: the Branches view reads only this board\'s task branches', async () => {
  const seen: string[] = []
  const w = fakeHost({
    run: async argv => {
      seen.push(argv.join(' '))
      const a = argv.slice(1)
      if (a[0] === 'log') return done({ stdout: `${'a'.repeat(40)} 1700000000\n` })
      if (a[0] === 'rev-list') return done({ stdout: '0\t1\n' })
      if (a[0] === 'merge-base') return done({ stdout: `${'a'.repeat(40)}\n` })
      return done()
    },
  })
  S.root = ROOT
  S.projects = {}
  const tasks = [{ ...base, id: 'T-5', title: 'five', status: 'doing', branch: 'symcc/power-falcon/T-5' }]
  const f = await readBranches(w.host, 'main', { tasks: tasks as never[] }, Date.now())
  expect(Object.keys(f?.tasks ?? {})).toEqual(['T-5'])
  expect(seen.some(s => s.includes('symcc/power-falcon/T-5'))).toBe(true)
  expect(seen.some(s => s.includes('quiet-river'))).toBe(false)
})
