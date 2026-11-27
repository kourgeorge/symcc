// T-1153: on a board over several repos, a task's merge runs in its own project's repo, tested with that project's
// test commands: the change lands on client's branch (client's checked-out files update), while the board folder and
// server stay untouched; a failing client test sends it back.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, access } from 'node:fs/promises'
import { runCommand, PLUGIN_ROOT } from '../host'
import { openSession, closeSession, leadTool } from '../session'
import { claudeRunner } from '../../../hooks/process/claude-runner'
import { nodeProcessSystem } from '../system'
import { prepareWorktree, removeWorktree } from '../../../hooks/app/git'
import { checkAndMerge, alreadyMerged } from '../../../hooks/app/review'
import { findMerged } from '../../../hooks/app/merged'
import { load } from '../../../hooks/app/store'
import { find, intoOf } from '../../../hooks/board'

const isThere = (p: string) => access(p).then(() => true, () => false)
const FAKE = `${PLUGIN_ROOT}/hosts/node/tests/fake-claude.sh`

test('T-1153: a client task is tested with client\'s command and merged into client\'s branch; the board folder and server are untouched', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-wsm-'))
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
    const serverHead = (await git(`${board}/server`, 'rev-parse', 'HEAD')).stdout.trim()
    const MAIN = `${PLUGIN_ROOT}/hosts/node/main.ts`
    await runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, 'cmd', 'symcc-init'], { cwd: board, timeoutMs: 120_000 })
    const s = await openSession({ root: board, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t1153' })
    try {
      // the board's own test command would fail: only client's own one may run for a client task
      await leadTool(s, 'settings', { test_commands: ['false'] })
      await leadTool(s, 'settings', { project: 'client', test_commands: ['test -f ok'] })
      expect(await leadTool(s, 'add', { title: 'Client work', details: 'Do it', files: ['client.txt', 'ok'], project: 'client', why: 'test', origin_by: 'owner', request: 'test' })).toContain('T-1')
      const t = find(await load(s.host), 'T-1')!
      const made = await prepareWorktree(s.host, t, intoOf(t))
      // a try whose client test fails is sent back, and nothing moves on client's branch
      await writeFile(`${made.dir}/client.txt`, 'changed')
      const devBefore = (await git(`${board}/client`, 'rev-parse', 'dev')).stdout.trim()
      const failed = await checkAndMerge(s.host, { ...t, attempts: 1 }, made.dir, await load(s.host), 'finish')
      expect(failed.ok).toBe(false)
      expect(failed.reason).toBe('tests')
      expect(failed.command).toBe('test -f ok')
      expect((await git(`${board}/client`, 'rev-parse', 'dev')).stdout.trim()).toBe(devBefore)
      // the next try adds the file client's test looks for: it passes and merges into client's dev
      await writeFile(`${made.dir}/ok`, '')
      const r = await checkAndMerge(s.host, { ...t, attempts: 2 }, made.dir, await load(s.host), 'finish')
      expect(r.detail).toContain('merged into dev')
      expect(r.ok).toBe(true)
      const dev = (await git(`${board}/client`, 'rev-parse', 'dev')).stdout.trim()
      expect(dev).toBe(r.merged ?? '')
      // the owner's checked-out files in client updated
      expect(await readFile(`${board}/client/client.txt`, 'utf8')).toBe('changed')
      expect(await isThere(`${board}/client/ok`)).toBe(true)
      expect((await git(`${board}/client`, 'status', '--porcelain')).stdout.trim()).toBe('')
      // "already merged?" checks look in client too
      expect(await alreadyMerged(s.host, { ...t, attempts: 2 })).toBe(dev)
      expect((await findMerged(s.host, find(await load(s.host), 'T-1')!)).sha).toBe(dev)
      // the board folder is still no repo, and server is as it was
      expect(await isThere(`${board}/.git`)).toBe(false)
      expect((await git(`${board}/server`, 'rev-parse', 'HEAD')).stdout.trim()).toBe(serverHead)
      expect((await git(`${board}/server`, 'status', '--porcelain')).stdout.trim()).toBe('')
      expect((await git(`${board}/server`, 'branch', '--list')).stdout).not.toContain('symcc/T-1')
      await removeWorktree(s.host, 'T-1', made.dir).catch(() => false)
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(board, { recursive: true, force: true })
  }
}, 180_000)
