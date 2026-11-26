// T-1029: do less work per board change, so symcc doesn't keep the shared hooks worker busy for seconds.
// (a) a second load reads none of the parts files that did not change; (b) a hand-back draws the view once, not once
// per change; (c) the 30 s finishing beat with nothing new saves and draws nothing.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { type Board, addTask, emptyBoard, patchTask, find } from '../hooks/board'
import { S, workers, finishing } from '../hooks/app/state'
import { change, load, resetStore, saveBoard } from '../hooks/app/store'
import { PREP_NOTE } from '../hooks/core/panel'
import { workerFinished } from '../hooks/app/workers'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'
const BOARD = `${ROOT}/.symcc/board.json`
const ISO = '2026-11-20T10:00:00.000Z'

/** A fake host on in-memory files (with mtimes that move on each write); it counts the reads of files, the writes and the view's redraws. */
function world() {
  const files = new Map<string, string>()
  const mtimes = new Map<string, number>()
  let clock = 1000
  const reads: string[] = []
  const writes: string[] = []
  let views = 0
  const fs = memoryFs(files, p => mtimes.get(p) ?? 0)
  const w = fakeHost({
    fs: {
      ...fs,
      read: async p => (reads.push(p), fs.read(p)),
      write: async (p, t) => (writes.push(p), mtimes.set(p, ++clock), fs.write(p, t)),
    },
    run: async ([cmd, ...a]) => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), mtimes.set(y!, ++clock), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), mtimes.set(y!, ++clock), files.delete(x!), done())
      if (cmd === 'rm') for (const f of a.filter(v => !v.startsWith('-'))) files.delete(f)
      return done()
    },
  })
  const update = w.panel.updateView
  // one publish also moves the logo and the status; only the board's own view write (called by publish) counts
  // (T-1038: each of those views is kept in `drawn`, in order)
  const drawn: ReturnType<typeof w.panel.view>[] = []
  w.panel.updateView = async f => {
    const mine = new Error().stack!.split('\n')[3]!.includes('publish')
    if (mine) views++
    await update(f)
    if (mine) drawn.push(w.panel.view())
  }
  S.root = ROOT
  S.me = 'me'
  S.writing = Promise.resolve()
  S.enabledNow = true
  return { ...w, files, reads, writes, drawn, views: () => views }
}

/** A board with a done task (its parts go to a parts file) and a task being worked on that asked a question. */
function board(asked = true): Board {
  let b = emptyBoard()
  let t
  ;[b, t] = addTask(b, { origin: { why: 'a test' }, title: 'Old', details: 'Done when: done.', files: ['src/'] }, ISO)
  b = patchTask(b, t.id, { status: 'done', history: [{ at: ISO, kind: 'step', text: 'merged' }] }, ISO)
  ;[b, t] = addTask(b, { origin: { why: 'a test' }, title: 'Now', details: 'Do it.\nDone when: done.', files: ['src/'] }, ISO)
  const run = { started: ISO, agents: [{ id: 'w1', kind: 'worker' as const, started: ISO }] }
  return patchTask(b, t.id, { status: 'doing', attempts: 1, branch: 'symcc/T-2', runs: [run], live: { session: 'me', ...(asked ? { ask: { text: 'Which one?', asked_at: ISO, by: 'worker' } as never } : {}) } }, ISO)
}

test('T-1029: a second load reads no parts file that did not change, and reads one that did', async () => {
  resetStore()
  const w = world()
  await saveBoard(w.host, board())
  const parts = [...w.files.keys()].filter(f => f.includes('/.symcc/tasks/'))
  expect(parts.length).toBeGreaterThan(0)
  w.reads.length = 0
  await load(w.host)
  expect(w.reads.filter(f => parts.includes(f))).toEqual([])
  expect(w.reads).toContain(BOARD)
  // a parts file written by someone else (its mtime moves) is read again
  const p = parts[0]!
  // same text and size, only the mtime moves
  w.host.fs.stat = async f => ({ kind: 'file', size: w.files.get(f)!.length, mtimeMs: f === p ? 99_999 : 1, isLink: false })
  w.reads.length = 0
  await load(w.host)
  expect(w.reads.filter(f => f === p).length).toBe(1)
})

test('T-1029: a hand-back draws the view once, not once per change', async () => {
  resetStore()
  const w = world()
  await saveBoard(w.host, board())
  workers.set('w1', { task: 'T-2', worktree: `${ROOT}/.symcc/worktrees/T-2`, branch: 'symcc/T-2', since: Date.now() })
  const before = w.views()
  const savedBefore = w.writes.filter(f => f === BOARD || f.startsWith(`${BOARD}.`)).length
  await workerFinished(w.host, 'w1', 'Done, but which one?')
  expect(find(await load(w.host), 'T-2')!.status).toBe('waiting')
  // board.json was written by more than one change, the view only once
  expect(w.writes.filter(f => f.startsWith(`${BOARD}.`)).length - savedBefore).toBeGreaterThan(1)
  expect(w.views() - before).toBe(1)
  expect(finishing.has('T-2')).toBe(false)
})

test('T-1029: a parts file whose size changed but not its mtime is read again', async () => {
  resetStore()
  const w = world()
  await saveBoard(w.host, board())
  const p = [...w.files.keys()].filter(f => f.includes('/.symcc/tasks/'))[0]!
  const was = await w.host.fs.stat(p)
  w.files.set(p, w.files.get(p)!.replace('merged', 'merged and more'))
  w.host.fs.stat = async f => ({ kind: 'file', size: w.files.get(f)!.length, mtimeMs: f === p ? was.mtimeMs : 1, isLink: false })
  w.reads.length = 0
  await load(w.host)
  expect(w.reads.filter(f => f === p).length).toBe(1)
})

test('T-1029: a step of the hand-back that throws still draws the view once', async () => {
  resetStore()
  const w = world()
  await saveBoard(w.host, board())
  workers.set('w1', { task: 'T-2', worktree: `${ROOT}/.symcc/worktrees/T-2`, branch: 'symcc/T-2', since: Date.now() })
  const before = w.views()
  // the first two board writes work, every one from the third on fails: two changes finish, then the error leaves workerFinished
  const write = w.host.fs.write
  let n = 0
  w.host.fs.write = async (p, t) => {
    if (p.startsWith(`${BOARD}.`) && ++n >= 3) throw new Error('disk full')
    return write(p, t)
  }
  await expect(workerFinished(w.host, 'w1', 'Done, but which one?')).rejects.toThrow('disk full')
  expect(n).toBeGreaterThan(2)
  expect(w.views() - before).toBe(1)
})

// ---------------- T-1038: the view hold with two hand-backs at once, a long check, and early returns ----------------

const workerOf = (task: string) => ({ task, worktree: `${ROOT}/.symcc/worktrees/${task}`, branch: `symcc/${task}`, since: Date.now() })
/** One unrelated board change: T-1's title. */
const touch = (w: ReturnType<typeof world>, title = 'Old, renamed') => change(w.host, b => patchTask(b, 'T-1', { title }, ISO))
const viewStatus = (w: ReturnType<typeof world>, id: string) => w.panel.view().tasks.find(t => t.id === id)?.status

test('T-1038: two hand-backs at once draw the view at most twice, both tasks waiting, and the hold count is back at 0', async () => {
  resetStore()
  const w = world()
  let b = board()
  let t
  ;[b, t] = addTask(b, { origin: { why: 'a test' }, title: 'Also now', details: 'Do it.\nDone when: done.', files: ['src/'] }, ISO)
  const run = { started: ISO, agents: [{ id: 'w2', kind: 'worker' as const, started: ISO }] }
  b = patchTask(b, t.id, { status: 'doing', attempts: 1, branch: 'symcc/T-3', runs: [run], live: { session: 'me', ask: { text: 'This or that?', asked_at: ISO, by: 'worker' } as never } }, ISO)
  await saveBoard(w.host, b)
  workers.set('w1', workerOf('T-2'))
  workers.set('w2', workerOf('T-3'))
  const before = w.views()
  await Promise.all([workerFinished(w.host, 'w1', 'a'), workerFinished(w.host, 'w2', 'b')])
  const after = await load(w.host)
  expect([find(after, 'T-2')!.status, find(after, 'T-3')!.status]).toEqual(['waiting', 'waiting'])
  expect([viewStatus(w, 'T-2'), viewStatus(w, 'T-3')]).toEqual(['waiting', 'waiting'])
  const drawn = w.views() - before
  expect(drawn >= 1 && drawn <= 2).toBe(true)
  // nothing is held any more: one plain change draws the view straight away
  const n = w.views()
  await touch(w)
  expect(w.views() - n).toBe(1)
})

test('T-1038: the view is drawn before a long check starts, and a lead change during the check draws at once', async () => {
  resetStore()
  const w = world()
  const b = { ...board(false), test_commands: ['npm test'] }
  expect(find(b, 'T-2')!.live?.ask).toBeUndefined()
  await saveBoard(w.host, b)
  w.files.set(`${ROOT}/.symcc/worktrees/T-2/.git`, 'gitdir: x')
  let reached = () => {}
  const atTest = new Promise<void>(r => (reached = r))
  let release = () => {}
  const gate = new Promise<void>(r => (release = r))
  const run = w.host.run
  w.host.run = async (argv, o) => {
    // the merge's test command waits until the test lets it go
    if (argv[0] === '/bin/sh') {
      reached()
      await gate
      return done()
    }
    if (argv[0] === 'git' && argv.includes('diff') && argv.includes('--name-only')) return done({ stdout: argv.includes('-z') ? 'src/a.ts' : 'src/a.ts\n' })
    return run(argv, o)
  }
  workers.set('w1', workerOf('T-2'))
  const before = w.views()
  const handBack = workerFinished(w.host, 'w1', 'made the change')
  await atTest
  try {
    // the hand-back's quick steps were drawn before the check (its own steps then draw as usual)
    expect(w.views() - before).toBeGreaterThan(0)
    const first = w.drawn[before]?.tasks.find(t => t.id === 'T-2')
    expect([first?.status, first?.note]).toEqual(['doing', PREP_NOTE])
    const n = w.views()
    await change(w.host, x => addTask(x, { origin: { why: 'the lead' }, title: 'New one', details: 'Done when: done.', files: ['src/'] }, ISO))
    expect(w.views() - n).toBe(1)
    expect(w.panel.view().tasks.map(t => t.title)).toContain('New one')
  } finally {
    release()
    await handBack
  }
})

test('T-1038: a task dropped during its hand-back lets go of the hold: a later change draws the view', async () => {
  resetStore()
  const w = world()
  await saveBoard(w.host, patchTask(board(), 'T-2', { status: 'dropped' }, ISO))
  workers.set('w1', workerOf('T-2'))
  await workerFinished(w.host, 'w1', 'Done, but which one?')
  expect(find(await load(w.host), 'T-2')!.status).toBe('dropped')
  const n = w.views()
  await touch(w)
  expect(w.views() - n).toBe(1)
})
