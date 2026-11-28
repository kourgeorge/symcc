// T-1238: a try start once failed with "a branch named symcc/<name>/T-1 already exists": two starts of the same task
// (the pump's and a direct call) both saw no branch, then both ran `git worktree add -b`. Now starts of one task run one
// after the other, and a branch (or folder) made by someone else between the check and the add is reused.
import { expect } from 'claude-code/testing'
import { type SymccTask } from '../types'
import { prepareWorktree, addWorktree, worktreeDir } from '../hooks/app/worktree'
import { S } from '../hooks/app/state'
import { test } from './reset'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

/** A fake git that, like the real one, refuses a branch or folder that is already there. Each call waits a tick. */
function world() {
  const files = new Set<string>()
  const branches = new Set<string>(['main'])
  const adds: string[] = []
  /** Runs once, just before the next `worktree add -b` (the gap between the check and the add). */
  const hook = { beforeAddB: undefined as undefined | (() => void) }
  const runGit = (a: string[]): Res => {
    if (a[0] === 'worktree' && a[1] === 'add') {
      const isNew = a[2] === '-b'
      if (isNew && hook.beforeAddB) { const f = hook.beforeAddB; hook.beforeAddB = undefined; f() }
      const dir = isNew ? a[4]! : a[2]!
      const br = a[3]!
      adds.push(a.join(' '))
      if (isNew && branches.has(br)) return fail(`fatal: a branch named '${br}' already exists`)
      if (isNew && !branches.has(a[5]!)) return fail(`fatal: invalid reference: ${a[5]}`)
      if (files.has(`${dir}/.git`)) return fail(`fatal: '${dir}' already exists`)
      if (!isNew && !branches.has(br)) return fail(`fatal: invalid reference: ${br}`)
      if (isNew) branches.add(br)
      files.add(`${dir}/.git`)
      return ok()
    }
    if (a[0] === 'rev-parse' && a[1] === '--verify') return branches.has(a.at(-1)!.replace(/^refs\/heads\//, '')) ? ok() : fail()
    if (a[0] === 'ls-files') return ok('')
    if (a[0] === 'worktree' && a[1] === 'prune') return ok()
    return fail()
  }
  const { host: $ } = fakeHost({
    run: async (argv: readonly string[]): Promise<Res> => {
      await Promise.resolve()
      const [cmd, ...rest] = argv
      return cmd === 'git' ? runGit(rest) : ok()
    },
    fs: {
      exists: async (p: string) => (await Promise.resolve(), files.has(p)),
      read: async (p: string) => Promise.reject(new Error(`no file ${p}`)),
      write: async () => undefined,
    },
  })
  S.root = ROOT
  return { $, files, branches, adds, hook }
}

const task = { id: 'T-1', title: 't', status: 'todo' } as SymccTask
const newBranchAdds = (adds: string[]) => adds.filter(a => a.startsWith('worktree add -b')).length

test('T-1238: two starts of the same task at once both get its folder and branch, and the branch is made once', async () => {
  const w = world()
  const [a, b] = await Promise.all([prepareWorktree(w.$, task, 'main'), prepareWorktree(w.$, task, 'main')])
  expect(a.dir).toBe(worktreeDir('T-1'))
  expect(b.dir).toBe(a.dir)
  expect(b.branch).toBe(a.branch)
  expect(newBranchAdds(w.adds)).toBe(1)
})

test('T-1238: a start that fails does not block the next start of the same task', async () => {
  const w = world()
  const first = await prepareWorktree(w.$, task, 'nope').then(() => 'ok', () => 'failed')
  expect(first).toBe('failed')
  const { dir } = await prepareWorktree(w.$, task, 'main')
  expect(dir).toBe(worktreeDir('T-1'))
})

test('T-1238: a branch made between the check and the add is reused, not an error', async () => {
  const w = world()
  const branch = S.N.branch('T-1')
  w.hook.beforeAddB = () => w.branches.add(branch)
  const made = await addWorktree(w.$, worktreeDir('T-1'), branch, 'main', ROOT)
  expect(made).toBe(false)
  expect(w.files.has(`${worktreeDir('T-1')}/.git`)).toBe(true)
  expect(w.adds.at(-1)).toBe(`worktree add ${worktreeDir('T-1')} ${branch}`)
})

test('T-1238: when another start made both the branch and the folder in the gap, the folder is kept as it is', async () => {
  const w = world()
  const branch = S.N.branch('T-1')
  const dir = worktreeDir('T-1')
  w.hook.beforeAddB = () => { w.branches.add(branch); w.files.add(`${dir}/.git`) }
  const made = await addWorktree(w.$, dir, branch, 'main', ROOT)
  expect(made).toBe(false)
  expect(w.adds.length).toBe(1)
})

test('T-1238: a new branch that fails for another reason still fails with git\'s words', async () => {
  const w = world()
  w.files.add(`${worktreeDir('T-1')}/.git`)
  const err = await addWorktree(w.$, worktreeDir('T-1'), S.N.branch('T-1'), 'main', ROOT).then(() => '', (e: Error) => e.message)
  expect(err).toContain('already exists')
  expect(err).toContain('worktree add -b')
})

test('T-1238: a branch that is already there is checked out without -b', async () => {
  const w = world()
  const branch = S.N.branch('T-1')
  w.branches.add(branch)
  const made = await addWorktree(w.$, worktreeDir('T-1'), branch, 'main', ROOT)
  expect(made).toBe(false)
  expect(newBranchAdds(w.adds)).toBe(0)
})
