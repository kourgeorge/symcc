// Worker folders get the main folder's .claude-plugin/types (T-358): tsconfig.json extends it, and it is generated and
// git-ignored, so a fresh `git worktree add` lacks it and `tsc` there would fall back to loose settings. The test runtime
// has no real git or disk, so a small fake below keeps files in memory and answers the few commands used.
import { expect } from 'claude-code/testing'
import { type SymccTask } from '../types'
import { prepareWorktree, copyTypes, worktreeDir, TYPES_DIR, clearScratch } from '../hooks/app/git'
import { S } from '../hooks/app/state'
import { test } from './reset'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

const EXCLUDE = `${ROOT}/.git/info/exclude`

/**
 * `types`: the main folder has .claude-plugin/types; `ignored`: git ignores it (as this project's .gitignore does).
 * `excludes`: git names the checkout's info/exclude (`git rev-parse --git-path info/exclude`), and ignores what it lists.
 */
function world({ types = true, ignored = true, excludes = false } = {}) {
  const files = new Map<string, string>()
  const calls: string[] = []
  if (types) {
    files.set(`${ROOT}/${TYPES_DIR}/tsconfig.json`, '{"compilerOptions":{"strict":true}}')
    files.set(`${ROOT}/${TYPES_DIR}/claude-code.d.ts`, 'declare const x: 1')
  }
  const under = (dir: string) => [...files.keys()].filter(k => k.startsWith(`${dir}/`))
  const isIgnored = (rel: string) => (ignored && rel.startsWith(`${TYPES_DIR}/`)) || (rel.startsWith('.scratch/') && (files.get(EXCLUDE) ?? '').split('\n').includes('/.scratch/'))
  const runGit = (a: string[], cwd: string): Res => {
    if (a[0] === 'worktree' && a[1] === 'add') {
      const dir = a[2] === '-b' ? a[4]! : a[2]!
      files.set(`${dir}/.git`, 'gitdir: x')
      files.set(`${dir}/tsconfig.json`, `{"extends":"./${TYPES_DIR}/tsconfig.json"}`)
      return ok()
    }
    if (a[0] === 'rev-parse') return excludes && a[1] === '--git-path' && a[2] === 'info/exclude' ? ok(EXCLUDE) : fail()
    if (a[0] === 'check-ignore') return isIgnored(a.at(-1)!) ? ok() : fail()
    if (a[0] === 'status') {
      // new files only (the fake's tracked file is tsconfig.json): what the scope check and commit would see
      const changed = under(cwd)
        .map(k => k.slice(cwd.length + 1))
        .filter(r => r !== '.git' && r !== 'tsconfig.json' && !isIgnored(r))
      return ok(changed.map(r => `?? ${r}`).join('\n'))
    }
    return ok()
  }
  const { host: $ } = fakeHost({
    run: async (argv: readonly string[], o: { cwd?: string } = {}): Promise<Res> => {
      const [cmd, ...rest] = argv
      calls.push(argv.join(' '))
      if (cmd === 'git') return runGit(rest, o.cwd ?? ROOT)
      if (cmd === 'rm') {
        for (const p of rest.filter(x => !x.startsWith('-'))) for (const k of [p, ...under(p)]) files.delete(k)
        return ok()
      }
      if (cmd === 'cp') {
        const [from, to] = rest.filter(x => !x.startsWith('-')) as [string, string]
        for (const k of under(from)) files.set(`${to}${k.slice(from.length)}`, files.get(k)!)
        return ok()
      }
      return ok()
    },
    fs: {
      exists: async (p: string) => files.has(p) || under(p).length > 0,
      read: async (p: string) => files.get(p) ?? Promise.reject(new Error(`no file ${p}`)),
      write: async (p: string, text: string) => void files.set(p, text),
    },
  })
  S.root = ROOT
  return { $, files, calls, status: async (dir: string) => (await $.run(['git', 'status', '--porcelain'], { cwd: dir })).stdout }
}

const task = { id: 'T-1', title: 't', status: 'todo' } as SymccTask

test('a new worker folder gets the main folder\'s .claude-plugin/types, and it is not a changed file', async () => {
  const w = world()
  const { dir } = await prepareWorktree(w.$, task, 'main')
  expect(dir).toBe(worktreeDir('T-1'))
  expect(w.files.get(`${dir}/${TYPES_DIR}/tsconfig.json`)).toBe('{"compilerOptions":{"strict":true}}')
  expect(w.files.get(`${dir}/${TYPES_DIR}/claude-code.d.ts`)).toBe('declare const x: 1')
  // a real copy, not a link that leads outside the folder
  expect(w.calls).toContain(`cp -R ${ROOT}/${TYPES_DIR} ${dir}/${TYPES_DIR}`)
  expect(w.calls.some(c => c.startsWith('ln '))).toBe(false)
  expect(await w.status(dir)).toBe('')
})

test('no .claude-plugin/types in the main folder: the worker folder is made as before, nothing copied', async () => {
  const w = world({ types: false })
  const { dir } = await prepareWorktree(w.$, task, 'main')
  expect(w.files.has(`${dir}/.git`)).toBe(true)
  expect([...w.files.keys()].some(k => k.includes(TYPES_DIR))).toBe(false)
  expect(w.calls.some(c => c.startsWith('cp ') || c.startsWith('rm '))).toBe(false)
  expect(await copyTypes(w.$, dir)).toBe(false)
})

test('where git would not ignore it, it is not copied, so it can never land in the commit', async () => {
  const w = world({ ignored: false })
  const { dir } = await prepareWorktree(w.$, task, 'main')
  expect(w.files.has(`${dir}/${TYPES_DIR}/tsconfig.json`)).toBe(false)
  expect(w.calls.some(c => c.startsWith('cp ') || c.startsWith('rm '))).toBe(false)
  expect(await w.status(dir)).toBe('')
})

test('a reused worker folder gets a fresh copy: old files from an earlier copy go', async () => {
  const w = world()
  const { dir } = await prepareWorktree(w.$, task, 'main')
  w.files.set(`${dir}/${TYPES_DIR}/old.d.ts`, 'stale')
  w.files.set(`${ROOT}/${TYPES_DIR}/tsconfig.json`, '{"compilerOptions":{"strict":false}}')
  const adds = w.calls.filter(c => c.includes('worktree add')).length
  await prepareWorktree(w.$, task, 'main')
  expect(w.calls.filter(c => c.includes('worktree add')).length).toBe(adds)
  expect(w.files.has(`${dir}/${TYPES_DIR}/old.d.ts`)).toBe(false)
  expect(w.files.get(`${dir}/${TYPES_DIR}/tsconfig.json`)).toBe('{"compilerOptions":{"strict":false}}')
})

test('a worker folder gets an empty .scratch/ that git ignores through info/exclude, never .gitignore; a reused folder gets it emptied (T-456)', async () => {
  const w = world({ excludes: true })
  w.files.set(EXCLUDE, '# local ignores\n*.log')
  const { dir } = await prepareWorktree(w.$, task, 'main')
  expect(w.files.get(EXCLUDE)).toBe('# local ignores\n*.log\n/.scratch/\n')
  expect([...w.files.keys()].some(k => k.endsWith('.gitignore'))).toBe(false)
  expect(w.calls).toContain(`mkdir -p ${dir}/.scratch`)
  // a throwaway script there is not a change git sees, so the commit and the scope check never get it
  w.files.set(`${dir}/.scratch/edit.py`, 'print(1)')
  expect(await w.status(dir)).toBe('')
  // the folder used again: the line is not added twice, and the old script is gone
  await prepareWorktree(w.$, task, 'main')
  expect(w.files.get(EXCLUDE)!.match(/\/\.scratch\//g)).toHaveLength(1)
  expect(w.files.has(`${dir}/.scratch/edit.py`)).toBe(false)
})

test('.scratch/ is never emptied where git does not ignore it (it could be the project\'s own files)', async () => {
  const w = world()
  const dir = worktreeDir('T-1')
  w.files.set(`${dir}/.git`, 'gitdir: x')
  w.files.set(`${dir}/.scratch/tracked.txt`, 'mine')
  expect(await clearScratch(w.$, dir)).toBe(false)
  expect(w.files.get(`${dir}/.scratch/tracked.txt`)).toBe('mine')
})
