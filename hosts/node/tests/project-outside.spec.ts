// T-1196: a project is a repo path from the board's project table, anywhere on disk. A task whose project is a repo
// OUTSIDE the board folder gets its copy in <board>/.symcc/worktrees/T-n (a worktree of that repo) and merges into that
// repo's branch. A project name that is not in the table is refused.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { runCommand, PLUGIN_ROOT } from '../host'
import { openSession, closeSession, leadTool } from '../session'
import { claudeRunner } from '../../../hooks/process/claude-runner'
import { nodeProcessSystem } from '../system'
import { repoOf, taskGitReady } from '../../../hooks/app/git'
import { prepareWorktree, removeWorktree, worktreeDir } from '../../../hooks/app/worktree'
import { checkAndMerge } from '../../../hooks/app/review'
import { load } from '../../../hooks/app/store'
import { find, intoOf } from '../../../hooks/board'

const FAKE = `${PLUGIN_ROOT}/hosts/node/tests/fake-claude.sh`

test('T-1196: a project repo outside the board folder: worktree in <board>/.symcc/worktrees/T-1, merged into that repo\'s branch', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-board-'))
  const outside = await realpath(await mkdtemp('/tmp/symcc-node-api-'))
  const git = (cwd: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  try {
    await git(outside, 'init', '-q', '-b', 'main')
    await writeFile(`${outside}/api.txt`, 'api')
    await git(outside, 'add', '.')
    await git(outside, 'commit', '-qm', 'init')
    const MAIN = `${PLUGIN_ROOT}/hosts/node/main.ts`
    await runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, 'cmd', 'symcc-init'], { cwd: board, timeoutMs: 120_000 })
    // the table: the project's name and its path (adding one by a tool comes in a later step)
    const file = `${board}/.symcc/board.json`
    const raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    await writeFile(file, JSON.stringify({ ...raw, projects: { api: { path: outside, test_commands: ['test -f ok'] } } }, null, 2))
    const s = await openSession({ root: board, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t1196' })
    try {
      // a project name that is not in the table is refused
      expect(await leadTool(s, 'add', { title: 'Nope', details: 'x', files: ['a'], project: 'web', why: 'test', origin_by: 'owner', request: 'test' }).catch((e: Error) => e.message)).toContain('not a project')
      expect(await leadTool(s, 'add', { title: 'Api work', details: 'Do it', files: ['api.txt', 'ok'], project: 'api', why: 'test', origin_by: 'owner', request: 'test' })).toContain('T-1')
      const t = find(await load(s.host), 'T-1')!
      expect(repoOf(t)).toBe(outside)
      expect(intoOf(t)).toBe('main')
      expect(await taskGitReady(s.host, await load(s.host), t)).toBe(true)
      expect(await taskGitReady(s.host, await load(s.host), { project: 'web' })).toBe(false)
      const made = await prepareWorktree(s.host, t, intoOf(t))
      expect(made.dir).toBe(worktreeDir('T-1'))
      expect(made.dir).toBe(`${board}/.symcc/worktrees/T-1`)
      expect((await git(made.dir, 'rev-parse', '--git-common-dir')).stdout.trim()).toBe(`${outside}/.git`)
      expect((await git(outside, 'worktree', 'list')).stdout).toContain('.symcc/worktrees/T-1')
      await writeFile(`${made.dir}/api.txt`, 'changed')
      await writeFile(`${made.dir}/ok`, '')
      const r = await checkAndMerge(s.host, { ...t, attempts: 1 }, made.dir, await load(s.host), 'finish')
      expect(r.detail).toContain('merged into main')
      expect(r.ok).toBe(true)
      expect((await git(outside, 'rev-parse', 'main')).stdout.trim()).toBe(r.merged ?? '')
      expect(await readFile(`${outside}/api.txt`, 'utf8')).toBe('changed')
      await removeWorktree(s.host, 'T-1', made.dir).catch(() => false)
      expect((await git(outside, 'worktree', 'list')).stdout).not.toContain('T-1')
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(board, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
}, 180_000)

test('T-1196: a board that is its own repo: a task with no project runs, tests and merges in the board repo, no table', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-own-'))
  const git = (cwd: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  try {
    await git(board, 'init', '-q', '-b', 'main')
    await writeFile(`${board}/a.txt`, 'a')
    await writeFile(`${board}/.gitignore`, '.symcc/\n')
    await git(board, 'add', '.')
    await git(board, 'commit', '-qm', 'init')
    const MAIN = `${PLUGIN_ROOT}/hosts/node/main.ts`
    await runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, 'cmd', 'symcc-init'], { cwd: board, timeoutMs: 120_000 })
    const s = await openSession({ root: board, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t1196b' })
    try {
      expect(await leadTool(s, 'add', { title: 'Own', details: 'Do it', files: ['a.txt'], why: 'test', origin_by: 'owner', request: 'test' })).toContain('T-1')
      const t = find(await load(s.host), 'T-1')!
      expect(repoOf(t)).toBe(board)
      expect(await taskGitReady(s.host, await load(s.host), t)).toBe(true)
      const made = await prepareWorktree(s.host, t, intoOf(t))
      expect(made.dir).toBe(`${board}/.symcc/worktrees/T-1`)
      await writeFile(`${made.dir}/a.txt`, 'changed')
      const r = await checkAndMerge(s.host, { ...t, attempts: 1 }, made.dir, await load(s.host), 'finish')
      expect(r.detail).toContain('merged into main')
      expect((await git(board, 'rev-parse', 'main')).stdout.trim()).toBe(r.merged ?? '')
      expect(await readFile(`${board}/a.txt`, 'utf8')).toBe('changed')
      expect(JSON.parse(await readFile(`${board}/.symcc/board.json`, 'utf8')).projects).toBe(undefined)
      await removeWorktree(s.host, 'T-1', made.dir).catch(() => false)
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(board, { recursive: true, force: true })
  }
}, 180_000)
