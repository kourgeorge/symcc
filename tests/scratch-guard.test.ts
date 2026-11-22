// T-501: a worker's edit in its own .scratch/ (T-456) goes through checkEdit's whole path (the board, the data-folder
// check, realpath on a disk where /tmp is a link to /private/tmp, the worktree match and scratchOn) and is allowed,
// for an absolute path, a relative one and either macOS name of the folder. Only where git keeps files under .scratch
// (or git can't tell) is it judged by the task's files as any other edit.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { addTask, emptyBoard, patchTask, find, blockedEditText } from '../hooks/board'
import { runBy } from './agent-fixture'
import { S, scratchUse } from '../hooks/app/state'
import { checkEdit } from '../hooks/app/ask'
import { load } from '../hooks/app/store'
import { fakeHost, memoryFs, done } from './fake-host'
import { fakeDisk } from './fake-disk'
import type { Host } from '../hooks/host'

const ISO = '2026-11-19T00:00:00.000Z'
const REAL_ROOT = '/private/tmp/x1/repo'
const REAL_WT = `${REAL_ROOT}/.symcc/worktrees/T-1`

/**
 * A copy of the plugin in session "me" with task T-1 (files src/) "doing" for worker w9, the project at `root` (either
 * name of /private/tmp/x1/repo). The disk has /tmp as a link to /private/tmp and the worker's .scratch/ made;
 * `lsFiles` is what `git ls-files -- .scratch` answers in the worker's folder.
 */
async function world(root: string, lsFiles: { exitCode?: number; stdout?: string } = {}) {
  const files = new Map<string, string>()
  const disk = fakeDisk({
    '/tmp': '-> /private/tmp',
    '/private': 'dir',
    '/private/tmp': 'dir',
    '/private/tmp/x1': 'dir',
    [REAL_ROOT]: 'dir',
    [`${REAL_ROOT}/.symcc`]: 'dir',
    [`${REAL_ROOT}/.symcc/worktrees`]: 'dir',
    [REAL_WT]: 'dir',
    [`${REAL_WT}/src`]: 'dir',
    [`${REAL_WT}/.scratch`]: 'dir',
  })
  const mem = memoryFs(files)
  const fs: Host['fs'] = {
    ...mem,
    list: async dir => disk.list(dir).map(e => ({ ...e, kind: 'dir' as const })) as never,
    stat: async (p, opts) => {
      if (!opts?.resolve) return mem.stat(p)
      const realPath = await disk.real(p)
      if (realPath === undefined) throw new Error(`ENOENT ${p}`)
      return { kind: 'file', size: 0, mtimeMs: 0, isLink: false, realPath }
    },
  }
  const gitCalls: string[] = []
  const run = async (argv: readonly string[], o?: { cwd?: string }) => {
    if (argv[0] === 'git' && argv[1] === 'ls-files') {
      gitCalls.push(`${o?.cwd}: ${argv.join(' ')}`)
      return done(lsFiles)
    }
    // the board lock is a hard link (ln), its safe write renames a temp file (mv), and both remove theirs (rm): done on `files`
    const [cmd, ...rest] = argv
    const args = rest.filter(x => !x.startsWith('-'))
    if (cmd === 'ln') {
      if (files.has(args[1]!)) return done({ exitCode: 1, stderr: 'File exists' })
      files.set(args[1]!, files.get(args[0]!)!)
    }
    if (cmd === 'mv' && files.has(args[0]!)) {
      files.set(args[1]!, files.get(args[0]!)!)
      files.delete(args[0]!)
    }
    if (cmd === 'rm') for (const p of args) files.delete(p)
    return done()
  }
  const { host } = fakeHost({ fs, session: { id: async () => 'me' }, run: run as never })
  S.root = root
  S.me = 'me'
  const [b0, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', details: 'Do it.\nDone when: done.', files: ['src/'] }, ISO)
  const b = patchTask(b0, t.id, { status: 'doing', attempts: 1, live: { session: 'me' }, branch: 'symcc/T-1', runs: [runBy('w9', ISO)] }, ISO)
  files.set(`${root}/${S.N.boardFile}`, JSON.stringify(b))
  return { host, gitCalls }
}

for (const root of ['/tmp/x1/repo', REAL_ROOT]) {
  const wt = `${root}/.symcc/worktrees/T-1`
  const other = root === REAL_ROOT ? '/tmp/x1/repo/.symcc/worktrees/T-1' : `/private${wt}`

  test(`a worker's new file in its own .scratch/ by its absolute path is allowed (project at ${root})`, async () => {
    const { host } = await world(root)
    expect(await checkEdit(host, 'w9', { path: `${wt}/.scratch/x.py` })).toBeUndefined()
    expect(find(await load(host), 'T-1')!.live?.refused).toBeUndefined()
  })

  test(`a worker's .scratch/ file by a relative path is allowed (project at ${root})`, async () => {
    const { host } = await world(root)
    expect(await checkEdit(host, 'w9', { path: '.scratch/x.py' })).toBeUndefined()
    expect(await checkEdit(host, 'w9', { path: './.scratch/deeper/probe.ts' })).toBeUndefined()
  })

  test(`a worker's .scratch/ file by the folder's other macOS name (/private or not) is allowed (project at ${root})`, async () => {
    const { host } = await world(root)
    expect(await checkEdit(host, 'w9', { path: `${other}/.scratch/x.py` })).toBeUndefined()
    expect(find(await load(host), 'T-1')!.live?.refused).toBeUndefined()
  })

  test(`edits next to .scratch/ are still judged by the task's files (project at ${root})`, async () => {
    const { host } = await world(root)
    expect(await checkEdit(host, 'w9', { path: `${wt}/.scratch/../README.md` })).toBe(blockedEditText('README.md'))
    expect(await checkEdit(host, 'w9', { path: `${wt}/.scratchy/x.py` })).toBe(blockedEditText('.scratchy/x.py'))
    expect(await checkEdit(host, 'w9', { path: `${wt}/src/.scratch/x.py` })).toBeUndefined()
    expect(await checkEdit(host, 'w9', { path: `${wt}/docs/.scratch/x.py` })).toBe(blockedEditText('docs/.scratch/x.py'))
  })
}

test('scratchOn asks git once per worker folder, by the name the board gives it', async () => {
  const { host, gitCalls } = await world('/tmp/x1/repo')
  await checkEdit(host, 'w9', { path: '/tmp/x1/repo/.symcc/worktrees/T-1/.scratch/a.py' })
  await checkEdit(host, 'w9', { path: `${REAL_WT}/.scratch/b.py` })
  expect(gitCalls).toEqual(['/tmp/x1/repo/.symcc/worktrees/T-1: git ls-files -- .scratch'])
  expect([...scratchUse.entries()]).toEqual([['/tmp/x1/repo/.symcc/worktrees/T-1', true]])
})

test('where git keeps files under .scratch/, an edit there is refused as outside the task\'s files and recorded', async () => {
  const { host } = await world('/tmp/x1/repo', { stdout: '.scratch/keep.txt\n' })
  expect(await checkEdit(host, 'w9', { path: '.scratch/x.py' })).toBe(blockedEditText('.scratch/x.py'))
  expect(find(await load(host), 'T-1')!.live?.refused).toEqual(['.scratch/x.py'])
})

test('when git cannot tell whether .scratch/ is kept, an edit there is refused (never let through on a guess)', async () => {
  const { host } = await world('/tmp/x1/repo', { exitCode: 128, stdout: '' })
  expect(await checkEdit(host, 'w9', { path: '/tmp/x1/repo/.symcc/worktrees/T-1/.scratch/x.py' })).toBe(blockedEditText('.scratch/x.py'))
})
