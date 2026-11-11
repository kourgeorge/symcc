import { expect, test } from 'claude-code/testing'

import { folderName, shortHome, boardTitle, openOnStart, startRun, endRun, usageTokens, sumRuns, boardTotal, fmtDuration, fmtCost, fmtTokens, fmtTotal, fmtRun, liveWorkersFor, mayStart, DEFAULT_AUTO_RETRIES, TEST_OUTPUT_CHARS, clampRetries, onTestFail, testTail, MAX_CONFLICT_TRIES, onConflict, liveDriver, ownedHere, resetDoing, LEAD_STALE_MS, LOCK_STALE_MS, addTask, leadText, parseLead, whoDrives, boardText, emptyBoard, isLockStale, lockText, outOfScope, parseLock, parseBoard, parseScout, patchTask, ready } from '../hooks/board'

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

test('a conflict with main gets a new try at most twice, then the task fails', () => {
  let [b] = addTask(emptyBoard(), { title: 'A' }, T)
  expect(MAX_CONFLICT_TRIES).toBe(2)
  // a task that never conflicted (an old board has no count) is retried
  expect(onConflict(b.tasks[0]!)).toBe('retry')
  b = patchTask(b, 'T-1', { conflict_tries: 1 }, T)
  expect(onConflict(b.tasks[0]!)).toBe('retry')
  // the count is kept through a save and a load
  b = parseBoard(JSON.stringify(patchTask(b, 'T-1', { conflict_tries: 2 }, T)))
  expect(onConflict(b.tasks[0]!)).toBe('fail')
  expect(onConflict({ conflict_tries: 3 })).toBe('fail')
  expect(onConflict({ conflict_tries: 0 }, 0)).toBe('fail')
})

test('failing tests get a new try on their own until auto_retries, then the task fails', () => {
  let [b] = addTask(emptyBoard(), { title: 'A' }, T)
  expect(DEFAULT_AUTO_RETRIES).toBe(2)
  expect(emptyBoard().auto_retries).toBe(2)
  // an old board without the setting gets the default
  expect(parseBoard(JSON.stringify({ version: 1, tasks: [] })).auto_retries).toBe(2)
  // under the cap: retry
  expect(onTestFail(b.tasks[0]!, b.auto_retries)).toBe('retry')
  b = patchTask(b, 'T-1', { test_tries: 1, test_output: 'expected 1, got 2' }, T)
  expect(onTestFail(b.tasks[0]!, b.auto_retries)).toBe('retry')
  // at the cap: give up (the count and output survive a save and a load)
  b = parseBoard(JSON.stringify(patchTask(b, 'T-1', { test_tries: 2 }, T)))
  expect(b.tasks[0]!.test_output).toBe('expected 1, got 2')
  expect(onTestFail(b.tasks[0]!, b.auto_retries)).toBe('fail')
  expect(onTestFail({ test_tries: 0 }, 0)).toBe('fail')
  expect(onTestFail({}, 3)).toBe('retry')
  // the next worker sees only the end of long test output
  const long = 'x'.repeat(5000) + 'THE END'
  const tail = testTail(long)
  expect(tail.length).toBe(TEST_OUTPUT_CHARS + 1)
  expect(tail.endsWith('THE END')).toBe(true)
  expect(testTail('  short  ')).toBe('short')
  // the setting is kept to a sensible whole number
  expect(clampRetries(3.4)).toBe(3)
  expect(clampRetries(-1)).toBe(0)
  expect(clampRetries(99)).toBe(10)
})

test('a worker starts on a task only if it is "todo" and no live worker is on it', () => {
  let [b] = addTask(emptyBoard(), { title: 'A' }, T)
  const t = () => b.tasks[0]!
  // a "todo" task with no agent around: start
  expect(mayStart(t(), [])).toBe(true)
  // agents for other tasks, scouts, and ended workers don't count
  expect(mayStart(t(), [
    { id: 'x', type: 'symcc:worker', status: 'running', description: 'T-2 other' },
    { id: 'y', type: 'symcc:scout', status: 'running', description: 'scout: T-1 tests' },
    { id: 'z', type: 'symcc:worker', status: 'completed', description: 'T-1 A' },
    { id: 'k', type: 'symcc:worker', status: 'killed', description: 'T-1 A' },
  ])).toBe(true)
  // a live worker for the task (by its description): no start
  for (const status of ['running', 'pending', 'waiting'])
    expect(mayStart(t(), [{ id: 'w', type: 'symcc:worker', status, description: 'T-1 A' }])).toBe(false)
  expect(mayStart(t(), [{ id: 'w', type: 'symcc:worker', status: 'running', description: 'T-10 other' }])).toBe(true)
  // a live agent recorded on the task: no start, whatever its description says
  b = patchTask(b, 'T-1', { agent: 'w1' }, T)
  expect(parseBoard(JSON.stringify(b)).tasks[0]!.agent).toBe('w1')
  expect(mayStart(t(), [{ id: 'w1', status: 'running', description: 'something' }])).toBe(false)
  expect(mayStart(t(), [{ id: 'w1', status: 'completed', description: 'something' }])).toBe(true)
  expect(liveWorkersFor(t(), [{ id: 'w1', status: 'running' }]).map(a => a.id)).toEqual(['w1'])
  // a task that isn't "todo" (already claimed, paused, done...) never gets a new worker
  for (const status of ['doing', 'paused', 'waiting', 'failed', 'done', 'dropped'] as const)
    expect(mayStart(patchTask(b, 'T-1', { status }, T).tasks[0]!, [])).toBe(false)
  expect(mayStart(undefined, [])).toBe(false)
})

test('after a reload, a task whose old worker is still alive stays "doing"', () => {
  let b = emptyBoard()
  for (const title of ['alive', 'gone']) b = addTask(b, { title }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', session: 'me' }, T)
  b = patchTask(b, 'T-2', { status: 'doing', session: 'me' }, T)
  const after = resetDoing(b, 'me', null, 0, 'restarted', T, ['T-1'])
  expect(after.tasks.map(t => t.status)).toEqual(['doing', 'todo'])
})

test('time and cost: a try records its start and end, and leaving "doing" ends it', async () => {
  let [b, t] = addTask(emptyBoard(), { title: 'timed' }, T)
  b = patchTask(b, t.id, { status: 'doing', runs: startRun(undefined, '2026-11-09T10:00:00.000Z') }, T)
  expect(b.tasks[0]!.runs).toEqual([{ started: '2026-11-09T10:00:00.000Z' }])
  const ended = endRun(b.tasks[0]!.runs, '2026-11-09T10:12:00.000Z', { tokens: 1500 })
  expect(ended).toEqual([{ started: '2026-11-09T10:00:00.000Z', ended: '2026-11-09T10:12:00.000Z', tokens: 1500 }])
  // A second end keeps the first end time.
  expect(endRun(ended, '2026-11-09T11:00:00.000Z', { cost: 0.5 })[0]).toEqual({ ...ended[0], cost: 0.5 })
  // A task that leaves "doing" with an open try gets it ended.
  b = patchTask(b, t.id, { status: 'failed' }, '2026-11-09T10:05:00.000Z')
  expect(b.tasks[0]!.runs![0]!.ended).toBe('2026-11-09T10:05:00.000Z')
  expect(usageTokens({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 })).toBe(116)
  expect(usageTokens(undefined)).toBe(undefined)
})

test('time and cost: tries add up, and a running try counts up to now', async () => {
  const runs = [
    { started: '2026-11-09T10:00:00.000Z', ended: '2026-11-09T10:12:00.000Z', tokens: 1000, cost: 0.4 },
    { started: '2026-11-09T11:00:00.000Z', ended: '2026-11-09T12:00:00.000Z', cost: 3 },
    { started: '2026-11-09T13:00:00.000Z' },
  ]
  expect(sumRuns(runs, Date.parse('2026-11-09T13:05:00.000Z'))).toEqual({ ms: 77 * 60_000, tries: 3, tokens: 1000, cost: 3.4 })
  expect(sumRuns(runs).ms).toBe(72 * 60_000)
  expect(sumRuns([])).toEqual({ ms: 0, tries: 0 })
  expect(sumRuns([{ started: 'bad', ended: 'worse' }]).ms).toBe(0)
  expect(fmtRun(runs[2]!, 2, Date.parse('2026-11-09T13:05:00.000Z'))).toBe('try 3: 5m (running)')
  let [b] = addTask(emptyBoard(), { title: 'a' }, T)
  expect(boardText(b)).not.toContain('total:')
  b = { ...b, tasks: b.tasks.map(t => ({ ...t, runs: runs.slice(0, 2) })) }
  expect(boardTotal(b).tries).toBe(2)
  expect(boardText(b).split('\n').at(-1)).toBe('total: 1h 12m · 1k tokens · ~$3.40 over 2 tries')
})

test('time and cost: formatting', async () => {
  expect(fmtDuration(0)).toBe('0s')
  expect(fmtDuration(45_000)).toBe('45s')
  expect(fmtDuration(12 * 60_000)).toBe('12m')
  expect(fmtDuration(65 * 60_000)).toBe('1h 05m')
  expect(fmtDuration(72 * 60_000)).toBe('1h 12m')
  expect(fmtDuration(NaN)).toBe('0s')
  expect(fmtCost(0.42)).toBe('$0.42')
  expect(fmtCost(3.4)).toBe('$3.40')
  expect(fmtCost(0.001)).toBe('<$0.01')
  expect(fmtCost(0)).toBe('$0.00')
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(12_340)).toBe('12.3k')
  expect(fmtTokens(1_200_000)).toBe('1.2M')
  expect(fmtTotal({ ms: 72 * 60_000, tries: 1, cost: 3.4 })).toBe('1h 12m · ~$3.40')
  expect(fmtTotal({ ms: 60_000, tries: 1 })).toBe('1m')
})

test('the board panel opens on start unless the open_on_start setting is turned off', async () => {
  const b = emptyBoard()
  expect(b.open_on_start).toBe(true)
  expect(openOnStart(b)).toBe(true)
  expect(openOnStart(parseBoard(JSON.stringify({ version: 1, tasks: [] })))).toBe(true)
  expect(openOnStart({})).toBe(true)
  const off = { ...b, open_on_start: false }
  expect(openOnStart(off)).toBe(false)
  expect(openOnStart(parseBoard(JSON.stringify(off)))).toBe(false)
})

test('the project folder name is the last part of its path', () => {
  expect(folderName('/Users/me/repositories/symcc')).toBe('symcc')
  expect(folderName('/Users/me/repositories/symcc/')).toBe('symcc')
  expect(folderName('')).toBe('')
  expect(boardTitle('/Users/me/repositories/symcc')).toBe('Board · symcc')
  expect(boardTitle('')).toBe('Board')
})

test('the home folder is shortened to "~"', () => {
  expect(shortHome('/Users/me/repositories/symcc', '/Users/me')).toBe('~/repositories/symcc')
  expect(shortHome('/Users/me/repositories/symcc', '/Users/me/')).toBe('~/repositories/symcc')
  expect(shortHome('/Users/me', '/Users/me')).toBe('~')
  expect(shortHome('/Users/meg/x', '/Users/me')).toBe('/Users/meg/x')
  expect(shortHome('/opt/x', '')).toBe('/opt/x')
})

test('boardText starts with the project path when given', () => {
  expect(boardText(emptyBoard(), 0, '~/repositories/symcc').split('\n')[0]).toBe('~/repositories/symcc')
  expect(boardText(emptyBoard())).toBe('The board is empty.')
})
