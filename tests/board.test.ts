import { expect, test } from 'claude-code/testing'

import { liveDriver, ownedHere, resetDoing, LEAD_STALE_MS, LOCK_STALE_MS, addTask, leadText, parseLead, whoDrives, boardText, emptyBoard, isLockStale, lockText, outOfScope, parseLock, parseBoard, parseScout, patchTask, ready } from '../hooks/board'

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

test('only one session drives the board: the first one, until its heartbeat goes stale', () => {
  const t0 = 1_800_000_000_000
  expect(LEAD_STALE_MS).toBe(180_000)
  // nobody drives yet (no file, or a broken one): this session becomes the driver
  expect(whoDrives(null, 'a', t0)).toBe('become')
  expect(whoDrives('', 'a', t0)).toBe('become')
  expect(whoDrives('{half', 'a', t0)).toBe('become')
  const lead = leadText('a', t0)
  expect(parseLead(lead)).toEqual({ session: 'a', heartbeat: t0 })
  // the driver keeps driving
  expect(whoDrives(lead, 'a', t0 + 30_000)).toBe('keep')
  // another session follows while the heartbeat is fresh
  expect(whoDrives(lead, 'b', t0)).toBe('follow')
  expect(whoDrives(lead, 'b', t0 + 179_000)).toBe('follow')
  expect(whoDrives(lead, 'b', t0 + 180_000)).toBe('follow')
  // and takes over once it is stale
  expect(whoDrives(lead, 'b', t0 + 180_001)).toBe('takeover')
  // a heartbeat dated far in the future (a broken clock) can't hold the lead forever
  expect(whoDrives(lead, 'b', t0 - 10 * 60_000)).toBe('takeover')
})


test('at session start, only "doing" tasks of this session, a dead session or no session go back to "todo"', () => {
  const t0 = 1_800_000_000_000
  let b = emptyBoard()
  for (const title of ['mine', 'dead', 'old', 'live', 'idle']) b = addTask(b, { title }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', session: 'me' }, T)
  b = patchTask(b, 'T-2', { status: 'doing', session: 'gone' }, T)
  b = patchTask(b, 'T-3', { status: 'doing' }, T)
  b = patchTask(b, 'T-4', { status: 'doing', session: 'other' }, T)
  // the session is kept through a save and a load
  b = parseBoard(JSON.stringify(b))
  expect(b.tasks.map(t => t.session)).toEqual(['me', 'gone', undefined, 'other', undefined])
  const lead = leadText('other', t0)
  expect(liveDriver(lead, t0 + 60_000)).toBe('other')
  const after = resetDoing(b, 'me', lead, t0 + 60_000, 'restarted', T)
  expect(after.tasks.map(t => t.status)).toEqual(['todo', 'todo', 'todo', 'doing', 'todo'])
  expect(after.tasks.map(t => t.session)).toEqual([undefined, undefined, undefined, 'other', undefined])
  // once the other session's heartbeat is stale, its tasks are reset too
  expect(liveDriver(lead, t0 + LEAD_STALE_MS + 1)).toBe(null)
  expect(resetDoing(b, 'me', lead, t0 + LEAD_STALE_MS + 1, 'restarted', T).tasks.every(t => t.status === 'todo')).toBe(true)
  // no lead file: nobody else drives, so every running task is ours to restart
  expect(resetDoing(b, 'me', null, t0, 'restarted', T).tasks.every(t => t.status === 'todo')).toBe(true)
  // the live driver's own workers are never ours to stop
  expect(ownedHere(b.tasks[3]!, 'me', 'other')).toBe(false)
  expect(ownedHere(b.tasks[3]!, 'me', null)).toBe(true)
})

test('a task forgets its session when it leaves "doing"', () => {
  let [b] = addTask(emptyBoard(), { title: 'A' }, T)
  b = patchTask(b, 'T-1', { status: 'doing', session: 'me' }, T)
  expect(b.tasks[0]!.session).toBe('me')
  b = patchTask(b, 'T-1', { note: 'checking and merging' }, T)
  expect(b.tasks[0]!.session).toBe('me')
  b = patchTask(b, 'T-1', { status: 'failed' }, T)
  expect('session' in b.tasks[0]!).toBe(false)
  // a session left on a task that isn't running is dropped on load
  const text = JSON.stringify({ ...b, tasks: [{ ...b.tasks[0], status: 'todo', session: 'x' }] })
  expect('session' in parseBoard(text).tasks[0]!).toBe(false)
})
