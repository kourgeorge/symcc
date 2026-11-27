// T-1154: on a board over several repos, git readiness, the task page's facts and the housekeeping look at each task's
// own repo: a client task's Changes and Branch facts come from client; the doctor lists and cleans a merged task branch in
// server; a project whose repo has no commit holds back only its own tasks.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { runCommand, PLUGIN_ROOT } from '../host'
import { openSession, closeSession, leadTool } from '../session'
import { claudeRunner } from '../../../hooks/process/claude-runner'
import { nodeProcessSystem } from '../system'
import { prepareWorktree, gitReady, taskGitReady } from '../../../hooks/app/git'
import { changedFiles } from '../../../hooks/app/review'
import { readTaskBranch } from '../../../hooks/app/branches'
import { change, load, now } from '../../../hooks/app/store'
import { S } from '../../../hooks/app/state'
import { find, intoOf, patchTask } from '../../../hooks/board'

const FAKE = `${PLUGIN_ROOT}/hosts/node/tests/fake-claude.sh`
const msg = (p: Promise<string>) => p.then(x => x, (e: Error) => `ERR ${e.message}`)

test('T-1154: readiness, Changes, Branch facts and the doctor look at each task\'s own repo', async () => {
  const board = await realpath(await mkdtemp('/tmp/symcc-node-wsr-'))
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
    // a project whose repo has no commit yet
    await mkdir(`${board}/empty`, { recursive: true })
    await git(`${board}/empty`, 'init', '-q', '-b', 'main')
    const MAIN = `${PLUGIN_ROOT}/hosts/node/main.ts`
    await runCommand(['bun', MAIN, '--root', board, '--claude', FAKE, 'cmd', 'symcc-init'], { cwd: board, timeoutMs: 120_000 })
    const s = await openSession({ root: board, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t1154' })
    try {
      const add = (title: string, project?: string) => leadTool(s, 'add', { title, details: 'Do it', files: ['x.txt'], ...(project ? { project } : {}), why: 'test', origin_by: 'owner', request: 'test' })
      expect(await add('Client work', 'client')).toContain('T-1')
      expect(await add('Server work', 'server')).toContain('T-2')
      expect(await add('Empty work', 'empty')).toContain('T-3')

      // readiness is per repo: the board folder has no .git, yet client and server tasks are ready; empty's is not
      await gitReady(s.host)
      expect(S.gitState).toBe('ok')
      const b0 = await load(s.host)
      expect(await taskGitReady(s.host, b0, find(b0, 'T-1'))).toBe(true)
      expect(await taskGitReady(s.host, b0, find(b0, 'T-2'))).toBe(true)
      expect(await taskGitReady(s.host, b0, find(b0, 'T-3'))).toBe(false)
      expect(await gitReady(s.host, b0, `${board}/empty`)).toBe(false)
      expect(await leadTool(s, 'run', { task: 'T-3' })).toContain("didn't start: git isn't set up in empty")
      expect((find(await load(s.host), 'T-3') as { status: string }).status).toBe('todo')

      // a client task's Changes and Branch facts come from client
      const t1 = find(await load(s.host), 'T-1')!
      const m1 = await prepareWorktree(s.host, t1, intoOf(t1))
      await writeFile(`${m1.dir}/new.txt`, 'hello\n')
      await git(m1.dir, 'add', '.')
      await git(m1.dir, 'commit', '-qm', 'client change')
      const files = await changedFiles(s.host, intoOf(t1), t1)
      expect(files.map(f => f.file)).toEqual(['new.txt'])
      const facts = await readTaskBranch(s.host, { ...t1, branch: m1.branch }, intoOf(t1), Date.now())
      expect(facts?.branch).toBe('symcc/T-1')
      expect(facts?.into).toBe('dev')
      expect(facts?.ahead).toBe(1)

      // a merged server task: its branch is listed and cleaned by the doctor, in server
      const t2 = find(await load(s.host), 'T-2')!
      const m2 = await prepareWorktree(s.host, t2, intoOf(t2))
      await writeFile(`${m2.dir}/s.txt`, 's\n')
      await git(m2.dir, 'add', '.')
      await git(m2.dir, 'commit', '-qm', 'server change')
      await git(`${board}/server`, 'merge', '-q', '--ff-only', 'symcc/T-2')
      await git(`${board}/server`, 'worktree', 'remove', '--force', m2.dir)
      await change(s.host, b => patchTask(b, 'T-2', { status: 'done' }, now()))
      expect(await leadTool(s, 'doctor', {})).toContain('symcc/T-2')
      expect(await leadTool(s, 'doctor', { fix: 'all' })).not.toContain('could not')
      expect((await git(`${board}/server`, 'branch', '--list', 'symcc/T-2')).stdout.trim()).toBe('')
      // the client branch is untouched
      expect((await git(`${board}/client`, 'branch', '--list', 'symcc/T-1')).stdout).toContain('symcc/T-1')

      // a project change: refused while a copy exists; with none yet, merge_into follows the new repo's branch
      expect(await msg(leadTool(s, 'change', { task: 'T-1', project: 'server' }))).toContain('already has a copy in client; drop and re-add it, or finish it first')
      expect(await add('Loose')).toContain('T-4')
      expect(intoOf(find(await load(s.host), 'T-4')!)).toBe('main')
      await leadTool(s, 'change', { task: 'T-4', project: 'client' })
      expect(intoOf(find(await load(s.host), 'T-4')!)).toBe('dev')
      // a project that is not text is refused, not turned into "no project"
      expect(await msg(leadTool(s, 'change', { task: 'T-4', project: 5 as never }))).toContain('project must be a project folder name (text)')
      expect((find(await load(s.host), 'T-4') as { project?: string }).project).toBe('client')
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(board, { recursive: true, force: true })
  }
}, 180_000)
