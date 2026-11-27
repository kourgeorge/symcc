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
