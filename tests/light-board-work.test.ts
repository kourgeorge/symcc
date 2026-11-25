// T-1029: do less work per board change, so symcc doesn't keep the shared hooks worker busy for seconds.
// (a) a second load reads none of the parts files that did not change; (b) a hand-back draws the view once, not once
// per change; (c) the 30 s finishing beat with nothing new saves and draws nothing.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { type Board, addTask, emptyBoard, patchTask, find } from '../hooks/board'
import { S, workers, finishing } from '../hooks/app/state'
import { load, resetStore, saveBoard } from '../hooks/app/store'
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
  w.panel.updateView = async f => (new Error().stack!.split('\n')[3]!.includes('publish') && views++, update(f))
  S.root = ROOT
  S.me = 'me'
  S.writing = Promise.resolve()
  S.enabledNow = true
  return { ...w, files, reads, writes, views: () => views }
}

/** A board with a done task (its parts go to a parts file) and a task being worked on that asked a question. */
function board(): Board {
  let b = emptyBoard()
  let t
  ;[b, t] = addTask(b, { origin: { why: 'a test' }, title: 'Old', details: 'Done when: done.', files: ['src/'] }, ISO)
  b = patchTask(b, t.id, { status: 'done', history: [{ at: ISO, kind: 'step', text: 'merged' }] }, ISO)
  ;[b, t] = addTask(b, { origin: { why: 'a test' }, title: 'Now', details: 'Do it.\nDone when: done.', files: ['src/'] }, ISO)
  const run = { started: ISO, agents: [{ id: 'w1', kind: 'worker' as const, started: ISO }] }
  return patchTask(b, t.id, { status: 'doing', attempts: 1, branch: 'symcc/T-2', runs: [run], live: { session: 'me', ask: { text: 'Which one?', asked_at: ISO, by: 'worker' } as never } }, ISO)
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
  w.files.set(p, w.files.get(p)!.replace('merged', 'merged!'))
  w.writes.push('other')
  const m = new Map<string, number>()
  m.set(p, 99_999)
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
  // every board write from the second one on fails, so the error leaves workerFinished
  const write = w.host.fs.write
  let n = 0
  w.host.fs.write = async (p, t) => {
    if (p.startsWith(`${BOARD}.`) && ++n >= 2) throw new Error('disk full')
    return write(p, t)
  }
  await expect(workerFinished(w.host, 'w1', 'Done, but which one?')).rejects.toThrow('disk full')
  expect(n).toBeGreaterThan(1)
  expect(w.views() - before).toBe(1)
})
