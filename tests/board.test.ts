import { expect, test } from 'claude-code/testing'

import { LOCK_STALE_MS, addTask, boardText, emptyBoard, isLockStale, lockText, outOfScope, parseLock, parseBoard, parseScout, patchTask, ready } from '../hooks/board'

const T = '2026-11-09T00:00:00.000Z'

test('tasks run in order, and a task waits for the ones it is after', async () => {
  let b = emptyBoard()
  const [b1, a] = addTask(b, { title: 'A', files: ['src/a.js'] }, T)
  const [b2, c] = addTask(b1, { title: 'C', after: [a.id] }, T)
  const [b3, d] = addTask(b2, { title: 'D', order: 0 }, T)
  b = b3
  expect(ready(b).map(t => t.id)).toEqual([d.id, a.id])
  b = patchTask(b, a.id, { status: 'done' }, T)
  expect(ready(b).map(t => t.id)).toContain(c.id)
  expect(parseBoard(JSON.stringify(b)).tasks.length).toBe(3)
  expect(boardText(b)).toContain('T-1')
})

test('a task can never be allowed to touch the board, Git internals or files outside the project', async () => {
  const [b] = addTask(emptyBoard(), { title: 'x', files: ['src/', './tests/**', '/etc/passwd', '../x', '.symcc/board.json', '.git/config'] }, T)
  expect(b.tasks[0]!.files).toEqual(['src/', 'tests/**'])
  expect(outOfScope(['src/a.js', 'docs/x.md'], ['src/'])).toEqual(['docs/x.md'])
  expect(outOfScope(['src/a.js'], ['src'])).toEqual([])
  expect(outOfScope(['.symcc/board.json'], [])).toEqual(['.symcc/board.json'])
  expect(outOfScope(['test/a.test.js'], ['test/**', 'src/a.js'])).toEqual([])
})

test('waiting tasks show their question; other statuses drop it', async () => {
  let [b, t] = addTask(emptyBoard(), { title: 'mode' }, T)
  b = patchTask(b, t.id, { status: 'waiting', question: 'half up or to even?' }, T)
  expect(boardText(b)).toContain('asks: half up or to even?')
  b = patchTask(b, t.id, { status: 'todo' }, T)
  expect(b.tasks[0]!.question).toBe(null)
})

test('a scout file: front matter sets how often, the body is its instructions', async () => {
  const s = parseScout('tests', '---\nevery_minutes: 15\nmodel: haiku\n---\nFind risky code with no tests.\n')
  expect(s).toEqual({ name: 'tests', every_minutes: 15, model: 'haiku', prompt: 'Find risky code with no tests.' })
  expect(parseScout('plain', 'Just instructions.')?.every_minutes).toBe(60)
  expect(parseScout('empty', '---\nevery_minutes: 5\n---\n')).toBe(null)
})

test('the board lists the newest task at the top and the oldest at the bottom', () => {
  const [b1] = addTask(emptyBoard(), { title: 'Old' }, '2026-01-01T00:00:00Z')
  const [b2] = addTask(b1, { title: 'Middle' }, '2026-01-02T00:00:00Z')
  const [b3] = addTask(b2, { title: 'New' }, '2026-01-03T00:00:00Z')
  const lines = boardText(b3).split('\n').slice(1)
  expect(lines.map(l => l.trim().split(/\s+/).pop())).toEqual(['New', 'Middle', 'Old'])
})

test('a paused task is not started, and a new board has a time limit for workers', () => {
  const [b1, t] = addTask(emptyBoard(), { title: 'A' }, '2026-01-01T00:00:00Z')
  expect(emptyBoard().max_minutes).toBe(45)
  expect(ready(b1).map(x => x.id)).toEqual([t.id])
  const b2 = patchTask(b1, t.id, { status: 'paused' }, '2026-01-01T00:01:00Z')
  expect(ready(b2)).toEqual([])
})

test('a board lock counts as stale only after about 30 seconds', () => {
  const t0 = 1_800_000_000_000
  const lock = lockText('session-a', t0)
  expect(parseLock(lock)).toEqual({ session: 'session-a', at: t0 })
  expect(LOCK_STALE_MS).toBe(30_000)
  expect(isLockStale(lock, t0)).toBe(false)
  expect(isLockStale(lock, t0 + 29_000)).toBe(false)
  expect(isLockStale(lock, t0 + 30_000)).toBe(false)
  expect(isLockStale(lock, t0 + 30_001)).toBe(true)
  // a lock dated far in the future (a broken clock) can't hold the board forever
  expect(isLockStale(lock, t0 - 60_000)).toBe(true)
  // a lock that can't be read is judged by the file's own time, or taken over
  expect(parseLock('{half')).toBe(null)
  expect(isLockStale('{half', t0 + 1_000, t0)).toBe(false)
  expect(isLockStale('{half', t0 + 31_000, t0)).toBe(true)
  expect(isLockStale('', t0)).toBe(true)
  expect(isLockStale(lock, t0 + 5_000, undefined, 1_000)).toBe(true)
})
