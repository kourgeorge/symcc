// T-514: a task whose branch was merged outside the board (by hand) is marked done with the lead's "merged" tool or
// the task page's "Already merged (h)": symcc checks with git that the work is in the branch it merges into, then
// marks it done. Nothing is merged and no test runs. These run the real code on the shared fake Host with a small
// scripted fake git (as merge.test.ts does).
import { expect } from 'claude-code/testing'
import { type Board, addTask, emptyBoard, patchTask, find, ready, statsReport, isSha } from '../hooks/board'
import { S, leadQueue, meanwhile, workers } from '../hooks/app/state'
import { saveBoard, load } from '../hooks/app/store'
import { runTool } from '../hooks/app/tools'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'
import { hist } from './history-fixture'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const ISO = '2026-11-13T00:00:00.000Z'
// the task's two commits (C1, C2 = its branch tip), main before (M0) and the owner's merge commit on main (MERGE)
const [C1, C2, M0, MERGE] = ['c1', 'c2', 'a0', 'e1'].map(x => x.repeat(20)) as [string, string, string, string]

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

/** What the fake git knows: whether the branch is there, whether its tip is in main, and its commits main lacks (`missing`). */
type Git = { branch: boolean; merged: boolean; missing: number; worktree: boolean; status: string }

function world(g: Partial<Git> = {}) {
  const git: Git = { branch: true, merged: true, missing: 0, worktree: true, status: '', ...g }
  const files = new Map<string, string>()
  const calls: string[] = []
  const commitRec = (sha: string, n: number) => `${sha}\x1fT-1: Do it (try ${n})\n\nSymcc-Task: T-1\nSymcc-Try: ${n}\n\x1e`
  function runGit(a: string[], cwd: string): Res {
    const s = a.join(' ')
    if (s === '--version') return ok('git version 2.50.0')
    if (s === 'rev-parse --is-inside-work-tree') return ok('true')
    if (s === 'rev-parse --verify -q HEAD') return ok(M0)
    if (s === 'rev-parse --verify -q refs/heads/main') return ok(git.merged ? MERGE : M0)
    if (s === 'rev-parse --verify -q refs/heads/symcc/T-1') return git.branch ? ok(C2) : fail()
    if (a[0] === 'log' && a.includes('--grep=Symcc-Task: T-1')) return ok(commitRec(C2, 2) + '\n' + commitRec(C1, 1))
    if (a[0] === 'merge-base' && a[1] === '--is-ancestor') return git.merged ? ok() : fail()
    if (a[0] === 'rev-list' && a.includes('--ancestry-path')) return ok(`${MERGE} ${M0} ${C2}\n`)
    if (a[0] === 'cherry') return ok([...Array(2 - git.missing).fill(`- ${C1}`), ...Array(git.missing).fill(`+ ${C2}`)].join('\n'))
    if (a[0] === 'status') return ok(git.status)
    if (a[0] === 'worktree' && a[1] === 'list') return ok(`worktree ${ROOT}\nbranch refs/heads/main\n`)
    if (a[0] === 'worktree' && a[1] === 'remove') return files.delete(`${WT}/.git`), ok()
    if (a[0] === 'update-ref' && a[1] === '-d') return (git.branch = false), ok()
    return ok()
  }
  const { host, sent } = fakeHost({
    run: async (argv, o = {}) => {
      const cwd = o.cwd ?? ROOT
      const [cmd, ...rest] = argv
      calls.push(`${cwd === WT ? 'wt' : cwd === ROOT ? 'root' : cwd}: ${argv.join(' ')}`)
      if (cmd === 'git') return runGit(rest, cwd)
      if (cmd === 'ln') return files.has(rest[1]!) ? fail('File exists') : (files.set(rest[1]!, files.get(rest[0]!)!), ok())
      if (cmd === 'mv') return files.has(rest[1]!) ? (files.set(rest[2]!, files.get(rest[1]!)!), files.delete(rest[1]!), ok()) : fail('No such file')
      if (cmd === 'rm') return rest.filter(x => !x.startsWith('-')).forEach(p => files.delete(p)), ok()
      return ok()
    },
    fs: memoryFs(files),
    agents: { spawn: async () => Promise.reject(new Error('no agents in this world')) },
  })
  S.root = ROOT
  S.writing = Promise.resolve()
  S.driving = false
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  if (git.worktree) files.set(`${WT}/.git`, 'gitdir: x')
  return { $: host, git, files, calls, sent }
}

/** A board with T-1 (in `status`, two tries, its first commit recorded) and T-2 waiting on it. */
async function seed(w: ReturnType<typeof world>, status: string, extra: Record<string, unknown> = {}): Promise<Board> {
  const [b1] = addTask({ ...emptyBoard(), test_commands: ['npm test'] }, { origin: { why: 'a test' }, title: 'Do it', files: ['src/'], merge_into: 'main' }, ISO)
  const [b2] = addTask(b1, { origin: { why: 'a test' }, title: 'Then this', files: ['src/'], after: ['T-1'], merge_into: 'main' }, ISO)
  const runs = [{ started: ISO, ended: ISO, end: 'failed', commits: [C1] }, { started: ISO, ended: ISO, end: 'failed' }]
  const b = patchTask(b2, 'T-1', { status: status as never, attempts: 2, runs, history: hist('try 2 → failed: the tests ran out of time'), ...extra }, ISO)
  await saveBoard(w.$, b)
  return b
}

/** The commands that would merge or test: none may run. */
const mergesOrTests = (calls: string[]) => calls.filter(c => /: git (merge|commit|read-tree|update-ref -m|checkout)(?!-)\b|\/bin\/sh|npm test/.test(c))

test('a failed task whose branch is in main becomes done with the history line, its waiting task can start, and stats count it', async () => {
  const w = world()
  await seed(w, 'failed')
  expect(ready(await load(w.$)).map(t => t.id)).toEqual([])
  const out = await runTool(w.$, 'merged', { task: 'T-1' })
  expect(out).toContain('T-1 done: its work is already in main (e1e1e1e1), merged outside the board; nothing was merged or tested')
  const b = await load(w.$)
  const t = find(b, 'T-1')!
  expect(t.status).toBe('done')
  expect(t.merged).toBe(MERGE)
  expect(t.history.at(-1)?.text).toBe('merged outside the board (e1e1e1e1); marked done by the lead')
  // its commits are recorded on its last try, with the merge commit
  expect((t.runs?.at(-1)?.commits ?? []).filter(isSha)).toEqual([C1, C2, MERGE])
  // tasks waiting on it can start
  expect(ready(b).map(x => x.id)).toEqual(['T-2'])
  // its folder and branch are cleaned up like after a merge
  expect(w.files.has(`${WT}/.git`)).toBe(false)
  expect(w.calls).toContain(`root: git update-ref -d refs/heads/symcc/T-1 ${C2}`)
  expect(w.git.branch).toBe(false)
  // nothing merged, nothing tested
  expect(mergesOrTests(w.calls)).toEqual([])
  // stats count it as merged, not dropped or unclear
  const stats = statsReport({ tasks: b.tasks, nowMs: Date.parse(ISO) + 60_000 })
  expect(stats).toMatch(/How tasks ended \(1 done task\)/)
  expect(stats).toMatch(/merged outside the board +\S+ +1 +100%/)
  expect(stats).not.toContain('not clear from history')
})

test("a task whose branch has commits that aren't in main is refused with the reason, and nothing changes", async () => {
  const w = world({ merged: false, missing: 2 })
  const before = await seed(w, 'paused')
  const err = await runTool(w.$, 'merged', { task: 'T-1' }).then(() => '', (e: Error) => e.message)
  expect(err).toBe("T-1's branch has 2 commits that aren't in main yet")
  expect(find(await load(w.$), 'T-1')).toEqual(find(before, 'T-1'))
  expect(w.files.has(`${WT}/.git`)).toBe(true)
  expect(w.git.branch).toBe(true)
  expect(mergesOrTests(w.calls)).toEqual([])
  // one commit missing reads in the singular
  const w1 = world({ merged: false, missing: 1 })
  await seed(w1, 'failed')
  expect(await runTool(w1.$, 'merged', { task: 'T-1' }).then(() => '', (e: Error) => e.message)).toBe("T-1's branch has 1 commit that isn't in main yet")
})

test('a dropped task can be marked as merged (from the board: marked done by the owner)', async () => {
  const w = world({ worktree: false })
  await seed(w, 'dropped', { note: 'dropped by the lead' })
  await runTool(w.$, 'merged', { task: 'T-1', by: 'the owner' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.history.at(-1)?.text).toBe('merged outside the board (e1e1e1e1); marked done by the owner')
  expect(mergesOrTests(w.calls)).toEqual([])
})

test('a rebased branch whose commits are all in main as equal changes is marked done; its branch is kept', async () => {
  const w = world({ merged: false, missing: 0 })
  await seed(w, 'failed')
  const out = await runTool(w.$, 'merged', { task: 'T-1' })
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(out).toContain('its branch symcc/T-1 was kept')
  expect(w.git.branch).toBe(true)
})

test('a running task is marked done: its worker is stopped and its open try ends as finished with the note "merged"', async () => {
  const w = world()
  const runs = [{ started: ISO, ended: ISO, end: 'failed', commits: [C1] }, { started: ISO }]
  await seed(w, 'doing', { runs, session: S.me })
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const out = await runTool(w.$, 'merged', { task: 'T-1' })
  expect(out).toMatch(/; its worker was stopped$/)
  expect(workers.has('ag1')).toBe(false)
  expect(w.sent.map(s => s.to)).toContain('ag1')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.runs?.at(-1)?.ended_by).toBe('finished')
  expect(t.runs?.at(-1)?.ended_note).toBe('merged')
  expect(t.runs?.at(-1)?.ended).toBeTruthy()
  expect(mergesOrTests(w.calls)).toEqual([])
})

test('a folder with uncommitted changes is kept with its branch, and the answer says so', async () => {
  const w = world({ status: ' M src/a.ts\n' })
  await seed(w, 'failed')
  const out = await runTool(w.$, 'merged', { task: 'T-1' })
  expect(out).toContain(`; its folder ${S.N.dir}/worktrees/T-1 has uncommitted changes, so it and its branch were kept`)
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(w.files.has(`${WT}/.git`)).toBe(true)
  expect(w.git.branch).toBe(true)
  expect(w.calls.filter(c => /git (worktree remove|update-ref -d)/.test(c))).toEqual([])
})

test("a gone branch whose last recorded commit isn't in main is refused, and nothing changes", async () => {
  const w = world({ branch: false, merged: false })
  const before = await seed(w, 'failed')
  const err = await runTool(w.$, 'merged', { task: 'T-1' }).then(() => '', (e: Error) => e.message)
  expect(err).toMatch(/^T-1's last commit c1c1c1\w* isn't in main yet \(its branch symcc\/T-1 is gone\)$/)
  expect(await load(w.$)).toEqual(before)
  expect(mergesOrTests(w.calls)).toEqual([])
})

test('a done task, an investigation and a task not on the board are refused', async () => {
  const w = world()
  await seed(w, 'done')
  expect(await runTool(w.$, 'merged', { task: 'T-1' }).then(() => '', (e: Error) => e.message)).toBe('T-1 is already done')
  expect(await runTool(w.$, 'merged', { task: 'T-9' }).then(() => '', (e: Error) => e.message)).toMatch(/T-9/)
  const w2 = world()
  await seed(w2, 'review', { kind: 'investigation' })
  expect(await runTool(w2.$, 'merged', { task: 'T-1' }).then(() => '', (e: Error) => e.message)).toBe('T-1 is an investigation: it has nothing to merge')
})
