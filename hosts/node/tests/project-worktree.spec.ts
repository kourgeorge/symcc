// T-1152: on a board over several repos, a task's worker copy is a worktree of its own project's repo.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { runCommand, PLUGIN_ROOT } from '../host'
import { registerProjects } from './register-projects'
import { openSession, closeSession, leadTool } from '../session'
import { claudeRunner } from '../../../hooks/process/claude-runner'
import { nodeProcessSystem } from '../system'
import { prepareWorktree, removeWorktree, worktreeDir, repoOf } from '../../../hooks/app/git'
import { load } from '../../../hooks/app/store'
import { find, intoOf } from '../../../hooks/board'

const FAKE = `${PLUGIN_ROOT}/hosts/node/tests/fake-claude.sh`

test('T-1152: a task with project client gets its copy as a worktree of client, branch symcc/T-1, from client\'s current branch', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-ws-'))
  const git = (cwd: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  try {
    for (const [name, branch] of [['client', 'dev'], ['server', 'main']] as [string, string][]) {
      const d = `${board}/${name}`
      await mkdir(d, { recursive: true })
      await git(d, 'init', '-q', '-b', 'main')
      await writeFile(`${d}/${name}.txt`, name)
      await git(d, 'add', '.')
      await git(d, 'commit', '-qm', 'init')
      if (branch !== 'main') await git(d, 'checkout', '-q', '-b', branch)
    }
    const MAIN = `${PLUGIN_ROOT}/hosts/node/main.ts`
    await runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, 'cmd', 'symcc-init'], { cwd: board, timeoutMs: 120_000 })
    await registerProjects(board)
    const s = await openSession({ root: board, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t1152' })
    try {
      const out = await leadTool(s, 'add', { title: 'Client work', details: 'Do it', files: ['client.txt'], project: 'client', why: 'test', origin_by: 'owner', request: 'test' })
      expect(out).toContain('T-1')
      const t = find(await load(s.host), 'T-1')!
      expect((t as { project?: string }).project).toBe('client')
      expect(intoOf(t)).toBe('dev')
      expect(repoOf(t)).toBe(`${board}/client`)
      const made = await prepareWorktree(s.host, t, intoOf(t))
      expect(made.dir).toBe(worktreeDir('T-1'))
      expect(made.dir).toBe(`${board}/.symcc/worktrees/T-1`)
      // the copy is a worktree of client, on symcc/T-1, with client's files
      expect((await git(made.dir, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim()).toBe('symcc/T-1')
      expect((await git(made.dir, 'rev-parse', '--git-common-dir')).stdout.trim()).toBe(`${board}/client/.git`)
      expect((await git(`${board}/client`, 'worktree', 'list')).stdout).toContain('.symcc/worktrees/T-1')
      expect((await git(`${board}/client`, 'rev-parse', 'symcc/T-1')).stdout).toBe((await git(`${board}/client`, 'rev-parse', 'dev')).stdout)
      expect((await git(`${board}/server`, 'worktree', 'list')).stdout).not.toContain('T-1')
      // removing it cleans up in client
      expect(await removeWorktree(s.host, 'T-1', made.dir)).toBe(true)
      expect((await git(`${board}/client`, 'worktree', 'list')).stdout).not.toContain('T-1')
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(board, { recursive: true, force: true })
  }
}, 60_000)
