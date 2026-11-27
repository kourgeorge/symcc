// T-1155: a whole workspace on the Node host: a board folder (no repo) over two repos. A task in each project runs in
// its own repo's copy, is checked, tested with its own project's command and merged into its own repo; then the
// copies and branches are cleaned up. Each worker's prompt names its project.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, access } from 'node:fs/promises'
import { runCommand, PLUGIN_ROOT } from '../host'

const FAKE = `${PLUGIN_ROOT}/hosts/node/tests/fake-claude.sh`
const MAIN = `${PLUGIN_ROOT}/hosts/node/main.ts`
const isThere = (p: string) => access(p).then(() => true, () => false)

test('T-1155: two projects below one board: each task runs, is tested with its own command, merges into its own repo, and is cleaned up', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-wse-'))
  const log = `${board}.fake`
  const git = (cwd: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  try {
    for (const name of ['client', 'server']) {
      const d = `${board}/${name}`
      await mkdir(d, { recursive: true })
      await git(d, 'init', '-q', '-b', 'main')
      await writeFile(`${d}/${name}.txt`, name)
      await writeFile(`${d}/.gitignore`, '.scratch/\n')
      await git(d, 'add', '.')
      await git(d, 'commit', '-qm', 'init')
    }
    const cli = (...args: string[]) => runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, ...args], { cwd: board, env: { FAKE_LOG: log }, timeoutMs: 120_000 })
    await cli('cmd', 'symcc-init')
    // the board's own command would fail: each task may only run its project's command
    await cli('tool', 'settings', JSON.stringify({ test_commands: ['false'] }))
    await cli('tool', 'settings', JSON.stringify({ project: 'client', test_commands: ['test -f hello.txt && test -f client.txt'] }))
    await cli('tool', 'settings', JSON.stringify({ project: 'server', test_commands: ['test -f hello.txt && test -f server.txt'] }))
    for (const name of ['client', 'server']) {
      const out = await cli('tool', 'add', JSON.stringify({ title: `Hello in ${name}`, details: 'Write hello.txt', files: ['hello.txt'], project: name, why: 'test', origin_by: 'owner', request: 'test' }))
      expect(out.stdout).toContain('T-')
    }
    const tick = await cli('tick')
    expect(tick.exitCode).toBe(0)
    expect(tick.stdout).toContain('2 done')

    for (const name of ['client', 'server']) {
      expect((await git(`${board}/${name}`, 'log', '--format=%s', 'main')).stdout).toContain(`Hello in ${name}`)
      expect(await readFile(`${board}/${name}/hello.txt`, 'utf8')).toBe('hello from the fake worker\n')
      expect((await git(`${board}/${name}`, 'status', '--porcelain')).stdout.trim()).toBe('')
    }
    // the board folder is still no repo
    expect(await isThere(`${board}/.git`)).toBe(false)
    // each task's worker got its own project in the prompt (the last worker's prompt is the one saved)
    expect(await readFile(`${log}.prompt`, 'utf8')).toMatch(/The task's project is (client|server): /)

    // cleanup: the copies and the symcc/T-n branches are gone from their own repos
    await cli('tick')
    for (const [name, id] of [['client', 'T-1'], ['server', 'T-2']] as const) {
      expect(await isThere(`${board}/.symcc/worktrees/${id}`)).toBe(false)
      expect((await git(`${board}/${name}`, 'worktree', 'list')).stdout).not.toContain(id)
      expect((await git(`${board}/${name}`, 'branch', '--list')).stdout).not.toContain(`symcc/${id}`)
    }
  } finally {
    await rm(board, { recursive: true, force: true })
    for (const f of ['args', 'prompt', 'cwd']) await rm(`${log}.${f}`, { recursive: true, force: true })
  }
}, 300_000)

test('T-1182: tasks with no project on a workspace board: an investigation and an errand run in a plain folder; a change task needs a project', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-wsn-'))
  const log = `${board}.fake`
  const git = (cwd: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  try {
    for (const name of ['client', 'server']) {
      const d = `${board}/${name}`
      await mkdir(d, { recursive: true })
      await git(d, 'init', '-q', '-b', 'main')
      await writeFile(`${d}/${name}.txt`, name)
      await writeFile(`${d}/.gitignore`, '.scratch/\n')
      await git(d, 'add', '.')
      await git(d, 'commit', '-qm', 'init')
    }
    const cli = (...args: string[]) => runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, ...args], { cwd: board, env: { FAKE_LOG: log }, timeoutMs: 120_000 })
    const add = (input: Record<string, unknown>) => cli('tool', 'add', JSON.stringify({ details: 'Do it', why: 'test', origin_by: 'owner', request: 'test', ...input }))
    await cli('cmd', 'symcc-init')
    await cli('tool', 'settings', JSON.stringify({ project: 'client', test_commands: ['test -f hello.txt'] }))
    // a change task with no project is refused, and the reason names the projects
    const refused = await add({ title: 'Loose change', files: ['hello.txt'] })
    expect(`${refused.stdout}${refused.stderr}`).toContain('a change task needs a project: client, server')
    expect(`${refused.stdout}${refused.stderr}`).not.toContain('added T-')
    // an investigation and an errand with no project, and a project task beside them
    expect((await add({ title: 'Look around', kind: 'investigation' })).stdout).toContain('added T-1')
    // alone first: its worker started in a folder that is no git copy
    expect((await cli('tick')).exitCode).toBe(0)
    const cwd = (await readFile(`${log}.cwd`, 'utf8')).trim()
    expect(cwd.endsWith('/.symcc/worktrees/T-1')).toBe(true)
    expect(await isThere(`${cwd}/.git`)).toBe(false)
    expect((await readFile(`${log}.prompt`, 'utf8'))).toContain('plain folder')
    expect((await add({ title: 'Make a note', kind: 'errand' })).stdout).toContain('added T-2')
    expect((await add({ title: 'Hello in client', files: ['hello.txt'], project: 'client' })).stdout).toContain('added T-3')
    const tick = await cli('tick')
    expect(tick.exitCode).toBe(0)
    const b = JSON.parse(await readFile(`${board}/.symcc/board.json`, 'utf8')) as { tasks: { id: string; status: string }[] }
    const status = (id: string) => b.tasks.find(t => t.id === id)?.status
    expect(status('T-1')).toBe('review') // answered, waits for the owner
    expect(status('T-2')).toBe('done')
    expect(status('T-3')).toBe('done')
    // the worker of a task with no project ran in a folder that was no git copy (the last worker to run was T-3's, so check the repos instead)
    expect((await git(`${board}/client`, 'log', '--format=%s', 'main')).stdout).toContain('Hello in client')
    expect((await git(`${board}/server`, 'log', '--format=%s', 'main')).stdout).not.toContain('Look around')
    for (const name of ['client', 'server']) {
      expect((await git(`${board}/${name}`, 'status', '--porcelain')).stdout.trim()).toBe('')
      expect((await git(`${board}/${name}`, 'branch', '--list')).stdout).not.toMatch(/symcc\/T-[12]\b/)
      expect((await git(`${board}/${name}`, 'worktree', 'list')).stdout).not.toMatch(/T-[12]\b/)
    }
    // the errand's folder is gone; the answered investigation's stays until the owner reads it, and is no git copy
    expect(await isThere(`${board}/.symcc/worktrees/T-2`)).toBe(false)
    expect(await isThere(`${board}/.symcc/worktrees/T-1`)).toBe(true)
    expect(await isThere(`${board}/.symcc/worktrees/T-1/.git`)).toBe(false)
    expect(await isThere(`${board}/.git`)).toBe(false)
    // Keep as a note needs a project (the note is a docs task): refused, the answer stays
    const keep = await cli('tool', 'approve', JSON.stringify({ task: 'T-1', keep_note: true }))
    expect(`${keep.stdout}${keep.stderr}`).toContain('has no project')
    expect(await isThere(`${board}/.symcc/worktrees/T-1`)).toBe(true)
    // Done on the answer ends it, and its folder goes
    await cli('tool', 'approve', JSON.stringify({ task: 'T-1' }))
    expect(await isThere(`${board}/.symcc/worktrees/T-1`)).toBe(false)
  } finally {
    await rm(board, { recursive: true, force: true })
    for (const f of ['args', 'prompt', 'cwd']) await rm(`${log}.${f}`, { recursive: true, force: true })
  }
}, 300_000)

test('T-1182: an investigation given a project after its plain try: keep as a note leaves no folder; a retry still starts', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-wsp-'))
  const log = `${board}.fake`
  const git = (cwd: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  try {
    for (const name of ['client', 'server']) {
      const d = `${board}/${name}`
      await mkdir(d, { recursive: true })
      await git(d, 'init', '-q', '-b', 'main')
      await writeFile(`${d}/${name}.txt`, name)
      await writeFile(`${d}/.gitignore`, '.scratch/\n')
      await git(d, 'add', '.')
      await git(d, 'commit', '-qm', 'init')
    }
    const cli = (...args: string[]) => runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, ...args], { cwd: board, env: { FAKE_LOG: log }, timeoutMs: 120_000 })
    const add = (input: Record<string, unknown>) => cli('tool', 'add', JSON.stringify({ details: 'Do it', why: 'test', origin_by: 'owner', request: 'test', ...input }))
    const status = async (id: string) => (JSON.parse(await readFile(`${board}/.symcc/board.json`, 'utf8')) as { tasks: { id: string; status: string }[] }).tasks.find(t => t.id === id)?.status
    await cli('cmd', 'symcc-init')
    await cli('tool', 'settings', JSON.stringify({ project: 'client', test_commands: ['test -f hello.txt'] }))
    for (const title of ['Look one', 'Look two']) expect((await add({ title, kind: 'investigation' })).stdout).toContain('added T-')
    await cli('tick')
    expect(await status('T-1')).toBe('review')
    expect(await status('T-2')).toBe('review')
    // T-1: project given, then kept as a note: no folder is left behind
    await cli('tool', 'change', JSON.stringify({ task: 'T-1', project: 'client' }))
    await cli('tool', 'approve', JSON.stringify({ task: 'T-1', keep_note: true }))
    await cli('tick')
    expect(await status('T-1')).toBe('done')
    expect(await isThere(`${board}/.symcc/worktrees/T-1`)).toBe(false)
    // T-2: project given, then sent back: the next try starts in a git copy
    await cli('tool', 'change', JSON.stringify({ task: 'T-2', project: 'client' }))
    await cli('tool', 'reject', JSON.stringify({ task: 'T-2', reason: 'look deeper' }))
    await cli('tick')
    expect(await status('T-2')).not.toBe('failed')
    expect(await isThere(`${board}/.symcc/worktrees/T-2/.git`)).toBe(true)
  } finally {
    await rm(board, { recursive: true, force: true })
    for (const f of ['args', 'prompt', 'cwd']) await rm(`${log}.${f}`, { recursive: true, force: true })
  }
}, 300_000)

test('T-1194: only a plain folder symcc marked is deleted; a folder with no .git and no marker is left as it is', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-wsm-'))
  const log = `${board}.fake`
  const git = (cwd: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  try {
    for (const name of ['client', 'server']) {
      const d = `${board}/${name}`
      await mkdir(d, { recursive: true })
      await git(d, 'init', '-q', '-b', 'main')
      await writeFile(`${d}/${name}.txt`, name)
      await writeFile(`${d}/.gitignore`, '.scratch/\n')
      await git(d, 'add', '.')
      await git(d, 'commit', '-qm', 'init')
    }
    const cli = (...args: string[]) => runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, ...args], { cwd: board, env: { FAKE_LOG: log }, timeoutMs: 120_000 })
    const add = (input: Record<string, unknown>) => cli('tool', 'add', JSON.stringify({ details: 'Do it', why: 'test', origin_by: 'owner', request: 'test', ...input }))
    const status = async (id: string) => (JSON.parse(await readFile(`${board}/.symcc/board.json`, 'utf8')) as { tasks: { id: string; status: string }[] }).tasks.find(t => t.id === id)?.status
    await cli('cmd', 'symcc-init')
    await cli('tool', 'settings', JSON.stringify({ project: 'client', test_commands: ['test -f hello.txt'] }))
    for (const title of ['Look one', 'Look two']) expect((await add({ title, kind: 'investigation' })).stdout).toContain('added T-')
    await cli('tick')
    expect(await status('T-1')).toBe('review')
    expect(await status('T-2')).toBe('review')
    const dir = (n: number) => `${board}/.symcc/worktrees/T-${n}`
    // the marker is there in a folder symcc made
    expect(await isThere(`${dir(1)}/.symcc-plain`)).toBe(true)
    // a refused change deletes nothing
    const refused = await cli('tool', 'change', JSON.stringify({ task: 'T-2', project: 'client', merge_into: 'no-such-branch' }))
    expect(`${refused.stdout}${refused.stderr}`).toContain('Nothing changed')
    expect(await isThere(`${dir(2)}/.symcc-plain`)).toBe(true)
    // a folder with no marker (and no .git) and a file in it
    for (const n of [1, 2]) {
      await rm(`${dir(n)}/.symcc-plain`, { recursive: true, force: true })
      await writeFile(`${dir(n)}/mine.txt`, 'work')
    }
    // end: removeWorktree and cleanupMerged leave it
    await cli('tool', 'approve', JSON.stringify({ task: 'T-1' }))
    await cli('tick')
    expect(await isThere(`${dir(1)}/mine.txt`)).toBe(true)
    // change project: the folder stays; the next try fails with the reason instead of deleting
    await cli('tool', 'change', JSON.stringify({ task: 'T-2', project: 'client' }))
    expect(await isThere(`${dir(2)}/mine.txt`)).toBe(true)
    await cli('tool', 'reject', JSON.stringify({ task: 'T-2', reason: 'look deeper' }))
    await cli('tick')
    expect(await isThere(`${dir(2)}/mine.txt`)).toBe(true)
    expect(await isThere(`${dir(2)}/.git`)).toBe(false)
    const board2 = await readFile(`${board}/.symcc/board.json`, 'utf8')
    expect(board2).toContain("wasn't made as a plain folder")
  } finally {
    await rm(board, { recursive: true, force: true })
    for (const f of ['args', 'prompt', 'cwd']) await rm(`${log}.${f}`, { recursive: true, force: true })
  }
}, 300_000)
