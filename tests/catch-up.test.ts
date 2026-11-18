// T-482: a task that waited on others kept its old branch, so its next try started from old code. Now, when a new try
// starts in an existing folder/branch with no commits of its own and no uncommitted changes, the branch is first
// fast-forwarded to the tip of the branch it merges into. A small fake git keeps each branch as a list of commits.
import { expect } from 'claude-code/testing'
import { type SymccTask } from '../types'
import { prepareWorktree, worktreeDir } from '../hooks/app/git'
import { behindNote } from '../hooks/app/workers'
import { S } from '../hooks/app/state'
import { test } from './reset'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

function world() {
  const files = new Set<string>()
  const branches = new Map<string, string[]>([['main', ['a', 'b']]])
  const checkedOut = new Map<string, string>() // folder -> branch
  const dirty = new Set<string>()
  const calls: string[] = []
  const ref = (r: string) => r.replace(/^refs\/heads\//, '')
  const runGit = (a: string[], cwd: string): Res => {
    if (a[0] === 'worktree' && a[1] === 'add') {
      const isNew = a[2] === '-b'
      const dir = isNew ? a[4]! : a[2]!
      const br = a[3]!
      if (isNew) branches.set(br, [...branches.get(a[5]!)!])
      files.add(`${dir}/.git`)
      checkedOut.set(dir, br)
      return ok()
    }
    if (a[0] === 'rev-parse' && a[1] === '--verify') return branches.has(ref(a.at(-1)!)) ? ok() : fail()
    if (a[0] === 'rev-list' && a[1] === '--count') {
      const [from, to] = a[2]!.split('..').map(ref) as [string, string]
      const have = new Set(branches.get(from) ?? [])
      return ok(String((branches.get(to) ?? []).filter(c => !have.has(c)).length))
    }
    if (a[0] === 'status') return ok(dirty.has(cwd) ? ' M src/x.ts' : '')
    if (a[0] === 'merge' && a.includes('--ff-only')) {
      const br = checkedOut.get(cwd)!
      const to = branches.get(ref(a.at(-1)!))!
      const mine = branches.get(br)!
      if (!mine.every(c => to.includes(c))) return fail('not possible to fast-forward')
      branches.set(br, [...to])
      return ok()
    }
    if (a[0] === 'ls-files') return ok('')
    return fail()
  }
  const { host: $ } = fakeHost({
    run: async (argv: readonly string[], o: { cwd?: string } = {}): Promise<Res> => {
      const [cmd, ...rest] = argv
      calls.push(argv.join(' '))
      return cmd === 'git' ? runGit(rest, o.cwd ?? ROOT) : ok()
    },
    fs: {
      exists: async (p: string) => files.has(p),
      read: async (p: string) => Promise.reject(new Error(`no file ${p}`)),
      write: async () => undefined,
    },
  })
  S.root = ROOT
  return { $, branches, dirty, calls }
}

const task = { id: 'T-1', title: 't', status: 'todo' } as SymccTask

test('a branch behind main with no commits of its own starts its next try at main\'s tip', async () => {
  const w = world()
  await prepareWorktree(w.$, task, 'main', true)
  // other tasks merge into main while T-1 waits
  w.branches.set('main', ['a', 'b', 'c', 'd'])
  const { behind } = await prepareWorktree(w.$, task, 'main', true)
  expect(w.branches.get(S.N.branch('T-1'))).toEqual(['a', 'b', 'c', 'd'])
  expect(behind).toBe(0)
})

test('the same happens when the folder was removed but the old branch is still there', async () => {
  const w = world()
  w.branches.set(S.N.branch('T-1'), ['a'])
  const { behind } = await prepareWorktree(w.$, task, 'main', true)
  expect(w.branches.get(S.N.branch('T-1'))).toEqual(['a', 'b'])
  expect(behind).toBe(0)
})

test('a branch with a commit of its own is not moved, and the worker is told it is behind', async () => {
  const w = world()
  w.branches.set(S.N.branch('T-1'), ['a', 'mine'])
  w.branches.set('main', ['a', 'b', 'c'])
  const { behind } = await prepareWorktree(w.$, task, 'main', true)
  expect(w.branches.get(S.N.branch('T-1'))).toEqual(['a', 'mine'])
  expect(w.calls.some(c => c.includes('--ff-only'))).toBe(false)
  expect(behind).toBe(2)
  expect(behindNote(behind, 'main')).toContain('main has 2 newer commits your branch lacks')
  expect(behindNote(0, 'main')).toBe('')
})

test('a folder with uncommitted changes is not moved', async () => {
  const w = world()
  await prepareWorktree(w.$, task, 'main', true)
  w.branches.set('main', ['a', 'b', 'c'])
  w.dirty.add(worktreeDir('T-1'))
  const { behind } = await prepareWorktree(w.$, task, 'main', true)
  expect(w.branches.get(S.N.branch('T-1'))).toEqual(['a', 'b'])
  expect(w.calls.some(c => c.includes('--ff-only'))).toBe(false)
  expect(behind).toBe(1)
})

test('without catchUp (e.g. a merge remaking the folder) the branch is left as it is', async () => {
  const w = world()
  w.branches.set(S.N.branch('T-1'), ['a'])
  await prepareWorktree(w.$, task, 'main')
  expect(w.branches.get(S.N.branch('T-1'))).toEqual(['a'])
})
