// T-472: a copy of the plugin running in a worker's folder (a worktree) only guards. guardStart (and sessionStart, when
// the session's folder is a worktree) points S.root at the main project, never claims the lead, starts no timer, seeds
// no scouts and writes no file, while toolCheck still refuses a worker's edit outside its task's files. findRoot from
// a worktree path gives the main project too.
import { expect } from 'claude-code/testing'
import { evidenceWritten } from '../hooks/app/evidence'
import { addTask, emptyBoard, patchTask, blockedEditText } from '../hooks/board'
import { S, workers } from '../hooks/app/state'
import { findRoot, mainRoot, isAbsolute, normalPath } from '../hooks/app/store'
import { guardStart, sessionStart, sessionCleared, sessionEnd, toolCheck, toolCall, runCommand } from '../hooks/app/symcc'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'
import type { Host } from '../hooks/host'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`

/** A fake host whose session is in the worker's folder, with a board on disk; it records every write, command and timer. */
function inWorktree(gitAnswers = true, dir = WT, common = `${ROOT}/.git`) {
  const files = new Map<string, string>()
  const statuses: (string | undefined)[] = []
  const at = '2026-11-18T00:00:00.000Z'
  const [added] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a change', files: ['src/a.ts'] }, at)
  const b = patchTask(added, 'T-1', { status: 'doing', agent: 'ag1', session: 'driver' }, at)
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify(b))
  const writes: string[] = []
  const runs: string[][] = []
  const timers: number[] = []
  const mem = memoryFs(files)
  const { host, panel } = fakeHost({
    session: { id: async () => 'guard-session', repo: async () => ({ root: dir }), root: async () => dir },
    fs: { ...mem, write: async (p, t) => (writes.push(p), mem.write(p, t)) },
    run: async argv => {
      runs.push([...argv])
      if (gitAnswers && argv.join(' ') === 'git rev-parse --git-common-dir') return done({ stdout: `${common}\n` })
      if (gitAnswers && argv.join(' ') === 'git rev-parse --show-toplevel') return done({ stdout: `${dir}\n` })
      return done()
    },
    clock: { every: ms => (timers.push(ms), { cancel: () => undefined }), after: ms => (timers.push(ms), { cancel: () => undefined }) },
    ui: { status: t => void statuses.push(t) },
  })
  return { host, files, writes, runs, timers, statuses, panel }
}

/** No write, no timer, no lead claim, and no command but git's read of its shared folder. */
function nothingDone(w: ReturnType<typeof inWorktree>) {
  expect(w.writes).toEqual([])
  expect(w.timers).toEqual([])
  expect(w.files.has(`${ROOT}/.symcc/lead.json`)).toBe(false)
  expect(w.files.has(`${WT}/.symcc/board.json`)).toBe(false)
  expect(w.runs.every(r => ['git rev-parse --git-common-dir', 'git rev-parse --show-toplevel'].includes(r.join(' ')))).toBe(true)
  expect(S.driving).toBe(false)
}

test('guardStart from a worktree: the main project, no file, no timer, no lead, and toolCheck still refuses', async () => {
  const w = inWorktree()
  await guardStart(w.host)
  expect(S.root).toBe(ROOT)
  expect(S.guardOnly).toBe(true)
  nothingDone(w)
  // the worker as the copy that drives the board knows it (R2's board lookup will find it from the board)
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() })
  expect(await toolCheck(w.host, 'ag1', { path: `${WT}/src/b.ts` }, WT)).toBe(blockedEditText('src/b.ts'))
  workers.clear()
  // T-660: and logged in the main project's activity log, in the background
  await evidenceWritten()
  // the refusal is recorded on the task in the main project's board (as for any worker), never a new board
  expect(w.writes.every(p => p.startsWith(`${ROOT}/.symcc/board.`) || p.startsWith(`${ROOT}/.symcc/events.jsonl`))).toBe(true)
  expect(w.files.has(`${WT}/.symcc/board.json`)).toBe(false)
  w.writes.length = 0
  // symcc's own tools and commands do nothing here
  expect(await toolCall(w.host, 'board', undefined, {})).toEqual({ result: expect.stringContaining('only guards') })
  expect(await runCommand(w.host, 'symcc-mode', 'auto')).toEqual({ text: expect.stringContaining('only guards'), isTextDisplayOnly: true })
  await sessionEnd(w.host)
  expect(w.writes).toEqual([])
})

test('guardStart takes the root the host passes in', async () => {
  const w = inWorktree(false)
  await guardStart(w.host, '/elsewhere')
  expect(S.root).toBe('/elsewhere')
  expect(w.writes).toEqual([])
  expect(w.timers).toEqual([])
})

test('sessionStart in a worktree only guards', async () => {
  const w = inWorktree()
  await sessionStart(w.host)
  expect(S.root).toBe(ROOT)
  expect(S.guardOnly).toBe(true)
  nothingDone(w)
})

test('findRoot from a worktree gives the main project, with git and without it', async () => {
  for (const gitAnswers of [true, false]) {
    S.root = ''
    const w = inWorktree(gitAnswers)
    expect(await findRoot(w.host)).toBe(true)
    expect(S.root).toBe(ROOT)
  }
})

test('mainRoot: the main project answers itself, a relative .git is worked out', async () => {
  const at = (stdout: string): Host => fakeHost({ run: async () => done({ stdout }) }).host
  expect(await mainRoot(at('.git\n'), ROOT)).toBe(ROOT)
  expect(await mainRoot(at('../.git\n'), `${ROOT}/sub`)).toBe(ROOT)
  expect(await mainRoot(at(`${ROOT}/.git\n`), `${WT}/`)).toBe(ROOT)
  expect(await mainRoot(at(''), '/plain')).toBe('/plain')
  expect(await mainRoot(at(''), '')).toBe('')
})

test('mainRoot: a Windows git folder (drive or share) is kept as git wrote it', async () => {
  const at = (stdout: string): Host => fakeHost({ run: async () => done({ stdout }) }).host
  expect(await mainRoot(at('C:/proj/.git\n'), 'C:/proj/.symcc/worktrees/T-1')).toBe('C:/proj')
  expect(await mainRoot(at('C:\\proj\\.git\n'), 'C:\\proj\\.symcc\\worktrees\\T-1')).toBe('C:\\proj')
  expect(await mainRoot(at('\\\\server\\share\\proj\\.git\n'), '\\\\server\\share\\proj\\.symcc\\worktrees\\T-1')).toBe('\\\\server\\share\\proj')
  expect(await mainRoot(at('../.git\n'), 'C:/proj/sub')).toBe('C:/proj')
  expect(isAbsolute('C:/x')).toBe(true)
  expect(isAbsolute('\\\\server\\x')).toBe(true)
  expect(isAbsolute('../.git')).toBe(false)
  expect(normalPath('C:/proj/a/../b/./')).toBe('C:/proj/b')
  expect(normalPath('/')).toBe('/')
})

test('a guard-only refusal saves the main board but never publishes: no status line, no panel change', async () => {
  const w = inWorktree()
  await guardStart(w.host)
  const view = w.panel.view()
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() })
  expect(await toolCheck(w.host, 'ag1', { path: `${WT}/src/b.ts` }, WT)).toBe(blockedEditText('src/b.ts'))
  workers.clear()
  expect(w.writes.some(p => p.startsWith(`${ROOT}/.symcc/board.`))).toBe(true)
  expect(w.statuses).toEqual([])
  expect(w.panel.view()).toBe(view)
})

test("an owner's own second checkout (another git worktree) is not a worker's folder: it keeps its own root and runs normally", async () => {
  const own = '/home/me/proj-feature'
  const w = inWorktree(true, own, '/home/me/proj/.git')
  expect(await mainRoot(w.host, own)).toBe(own)
  await sessionStart(w.host)
  expect(S.root).toBe(own)
  expect(S.guardOnly).toBe(false)
  expect(await toolCall(w.host, 'board', undefined, {})).not.toEqual({ result: expect.stringContaining('only guards') })
  S.root = ''
  expect(await findRoot(w.host)).toBe(true)
  expect(S.root).toBe(own)
})

test("an owner's own git worktree inside the project (/repo/.worktrees/feature) keeps its own root and runs normally", async () => {
  const own = `${ROOT}/.worktrees/feature`
  const w = inWorktree(true, own)
  expect(await mainRoot(w.host, own)).toBe(own)
  await sessionStart(w.host)
  expect(S.root).toBe(own)
  expect(S.guardOnly).toBe(false)
  S.root = ''
  expect(await findRoot(w.host)).toBe(true)
  expect(S.root).toBe(own)
})

test('mainRoot: a folder inside the main project (toplevel is the main project) gives the main project', async () => {
  const w = inWorktree(true, `${ROOT}/src/deep`, '../../.git')
  ;(w.host as { run: Host['run'] }).run = async argv =>
    done({ stdout: argv.join(' ') === 'git rev-parse --show-toplevel' ? `${ROOT}\n` : '../../.git\n' })
  expect(await mainRoot(w.host, `${ROOT}/src/deep`)).toBe(ROOT)
})

test('/clear in a guard-only copy follows the new id but writes nothing and claims no lead', async () => {
  const w = inWorktree()
  await sessionStart(w.host)
  let id = 'new-id'
  ;(w.host.session as { id: () => Promise<string> }).id = async () => id
  await sessionCleared(w.host)
  expect(S.me).toBe(id)
  nothingDone(w)
})
