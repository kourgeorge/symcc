import { expect, test } from 'claude-code/testing'
import type { SymccScout, SymccTask } from '../types'

import { parseScoutMemory, scoutMemoryText } from '../hooks/board'
import { detailRows, wrapSegs, makeOrigin, fromText, originWho, createdLine, evidenceText, emptyHeard, utcTime } from '../hooks/board'
import { DEFAULT_NAME, ICON, ICON_ART, cleanName, namesFor } from '../hooks/name'
import { everyText, scoutStateText, scoutRanText, scoutRow, scoutOrder, sortScouts, scoutFile, scoutReport, scoutHowTo, scoutPrompt, recentClosed, SCOUT_CLOSED_SHOWN, scoutLeadMessage, SCOUT_REPORT_CHARS, boardSections, dayLabel, groupLabel, taskDay, bannerLines, bannerRule, listRule, bannerText, startBranch, branchWarning, missingBranchText, branchesToDelete, worktreesToRemove, cleanupText, noBranchText, gitStateOf, gitNote, noGitText, setupAskText, gitignoreBase, gitignoreWith, isSecretName, parseLsTree, riskyFiles, ignoreLineFor, setupDoneText, BIG_FILE_BYTES, folderName, shortHome, boardTitle, boardLabel, statusLine, openOnStart, spokenDone, voiceOn, startRun, endRun, usageTokens, sumRuns, boardTotal, fmtDuration, fmtCost, fmtTokens, fmtTotal, fmtRun, liveWorkersFor, mayStart, orphanMove, workerName, workerDescription, scoutAgentName, scoutDescription, AGENT_DESCRIPTION_CHARS, DEFAULT_AUTO_RETRIES, TEST_OUTPUT_CHARS, clampRetries, onTestFail, testTail, MAX_CONFLICT_TRIES, onConflict, MAX_NOT_READY, isNotReady, onNotReady, liveDriver, ownedHere, resetDoing, relabelSession, isFresh, backToTodo, statusCounts, STATUS_WORD, LEAD_STALE_MS, LOCK_STALE_MS, addTask, leadText, parseLead, whoDrives, boardText, emptyBoard, isLockStale, lockText, outOfScope, outOfScopeText, parseNeedFiles, needFilesQuestion, parseLock, parseBoard, parseScout, scoutText, scoutNameError, everyMinutesOf, scoutDraftError, patchTask, ready, needsReview, rejectTask, reviewTask, setMode, modeOf, modeLabel, MODE_LABEL, MODE_NAME, modeButton, nextMode, parseDiffStat, statCount, statText, cutDiff, diffKinds, DIFF_COLOR, parseCommand, parseModeCommand, commandNames, modeText, needsYouFirst, stashTask, promoteTask, backlogLabel, backlogHeader, backlogMoreLabel, BACKLOG_SHOWN, panelSections, sectionHeader, doneExtra, foldedRow, statusStrip, nextScoutText, statusCell, rowExtra, fitRow, hintLines, hintLineText, hintText, packRows, listKeys, viewKeys, taskKeys, diffKeys, scoutKeys, scoutListKeys, scoutIcon, scoutTone, scoutLastText, countFindings, scoutListRows, scoutListText, scoutPausedText, scoutMayRun, scoutWhyNot, scoutPausedAnswer, OPEN, SETTINGS, applySettings, parseSettingValue, settingSetText, settingValue, settingsText, parseRole, roleSkipReason, skippedRoleNote, roleMark, roleLine, roleChoices, mergeRoles, findRole, checkRole, roleOf, tryLabel, roleSection, rolesLeadText, oldRoleSwap, OLD_ROLES, BUILT_IN_ROLES, leftoverTmpFiles, normId, dayOf, runMs, isNothing, agentSafeName, onDemand, readBoard } from '../hooks/board'

const T = '2026-11-09T00:00:00.000Z'
// every new task needs a reason it exists
const W = { why: 'a test' }

test('tasks run in order, and a task waits for the ones it is after', async () => {
  let b = emptyBoard()
  const [b1, a] = addTask(b, { origin: W, title: 'A', files: ['src/a.js'] }, T)
  const [b2, c] = addTask(b1, { origin: W, title: 'C', after: [a.id] }, T)
  const [b3, d] = addTask(b2, { origin: W, title: 'D', order: 0 }, T)
  b = b3
  expect(ready(b).map(t => t.id)).toEqual([d.id, a.id])
  b = patchTask(b, a.id, { status: 'done' }, T)
  expect(ready(b).map(t => t.id)).toContain(c.id)
  expect(parseBoard(JSON.stringify(b)).tasks.length).toBe(3)
  expect(boardText(b)).toContain('T-1')
})

test('a task can never be allowed to touch the board, Git internals or files outside the project', async () => {
  const [b] = addTask(emptyBoard(), { origin: W, title: 'x', files: ['src/', './tests/**', '/etc/passwd', '../x', '.symcc/board.json', '.git/config'] }, T)
  expect(b.tasks[0]!.files).toEqual(['src/', 'tests/**'])
  expect(outOfScope(['src/a.js', 'docs/x.md'], ['src/'])).toEqual(['docs/x.md'])
  expect(outOfScope(['src/a.js'], ['src'])).toEqual([])
  expect(outOfScope(['.symcc/board.json'], [])).toEqual(['.symcc/board.json'])
  expect(outOfScope(['test/a.test.js'], ['test/**', 'src/a.js'])).toEqual([])
})

test('waiting tasks show their question; other statuses drop it', async () => {
  let [b, t] = addTask(emptyBoard(), { origin: W, title: 'mode' }, T)
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

test('a scout file with every_minutes 0 runs only on demand; a bad value too, with a warning', () => {
  expect(parseScout('s', '---\nevery_minutes: 0\n---\nLook.\n')).toEqual({ name: 's', every_minutes: 0, model: undefined, prompt: 'Look.' })
  expect(parseScout('s', '---\nevery: 0\n---\nLook.\n')?.every_minutes).toBe(0)
  for (const bad of ['-5', 'ten', '1.5']) {
    const s = parseScout('s', `---\nevery_minutes: ${bad}\n---\nLook.\n`)!
    expect(s.every_minutes).toBe(0)
    expect(s.warning).toBe(`every_minutes "${bad}" is not valid: runs only on demand until fixed`)
    expect(s.bad_every).toBe(bad)
    expect(onDemand(s)).toBe(true)
  }
  expect(parseScout('s', '---\nmodel: haiku\n---\nLook.\n')).toEqual({ name: 's', every_minutes: 60, model: 'haiku', prompt: 'Look.' })
  expect(parseScout('s', '---\nevery_minutes: 30\n---\nLook.\n')?.warning).toBeUndefined()
  expect(onDemand({ every_minutes: 30 })).toBe(false)
  // run now still works: being on demand doesn't stop a run
  expect(scoutMayRun({ running: false }, { driving: true, gitOk: true, mode: 'auto', on: true })).toBe(true)
  // shown as "on demand", with no "next in …", and skipped as the next scout
  const at = Date.parse('2026-11-12T10:00:00.000Z')
  const soon = new Date(at + 5 * 60_000).toISOString()
  expect(everyText(0)).toBe('on demand')
  expect(scoutStateText({ every_minutes: 0, running: false, next_run: soon }, at)).toBe('')
  expect(scoutStateText({ every_minutes: 0, running: true }, at)).toBe('running now…')
  expect(scoutRow({ name: 'secrets', every_minutes: 0, last_run: null, running: false }, at)).toEqual({ name: 'secrets', every: 'on demand', model: '', state: '', ran: 'never ran' })
  expect(nextScoutText([{ name: 'a', every_minutes: 0, running: false, next_run: soon }], at)).toBe('')
  expect(nextScoutText([{ name: 'a', every_minutes: 0, running: false, next_run: soon }, { name: 'b', every_minutes: 30, running: false, next_run: soon }], at)).toBe('next: b in 5m')
  const rows = scoutListRows(
    [
      { name: 'secrets', every_minutes: 0, last_run: '2026-11-12T09:00:00.000Z', running: false, last_report: 'NOTHING' },
      { name: 'bad', every_minutes: 0, last_run: null, running: false, warning: 'every_minutes "-5" is not valid: runs only on demand until fixed' },
    ],
    at,
    90,
  )
  expect(rows.map(r => scoutListText(r))).toEqual(['  ◎ secrets  on demand                     last: nothing', '  ◎ bad      on demand  bad every_minutes  never ran'])
  expect(rows[1]!.stateTone).toBe('warning')
  expect(rows[0]!.stateTone).toBe('text')
  expect(rows.map(r => scoutListText(r)).some(t => /next in/.test(t))).toBe(false)
  // alone, an on-demand scout's row is just its icon, name, "on demand" and last
  expect(scoutListText(scoutListRows([{ name: 'secrets', every_minutes: 0, last_run: '2026-11-12T09:00:00.000Z', running: false, last_report: 'NOTHING' }], at, 90)[0]!)).toBe('  ◎ secrets  on demand  last: nothing')
})

test('the board lists the newest task at the top and the oldest at the bottom', () => {
  const [b1] = addTask(emptyBoard(), { origin: W, title: 'Old' }, '2026-01-01T00:00:00Z')
  const [b2] = addTask(b1, { origin: W, title: 'Middle' }, '2026-01-02T00:00:00Z')
  const [b3] = addTask(b2, { origin: W, title: 'New' }, '2026-01-03T00:00:00Z')
  const lines = boardText(b3).split('\n').slice(1).filter(l => !l.trim().startsWith('from:'))
  expect(lines.map(l => l.trim().split(/\s+/).pop())).toEqual(['New', 'Middle', 'Old'])
})

test('a paused task is not started, and a new board has a time limit for workers', () => {
  const [b1, t] = addTask(emptyBoard(), { origin: W, title: 'A' }, '2026-01-01T00:00:00Z')
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
  for (const title of ['mine', 'dead', 'old', 'live', 'idle']) b = addTask(b, { origin: W, title }, T)[0]
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
  let [b] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
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
  let [b] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
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
  let [b] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
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
  let [b] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
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

test('a worker is found by its name: the task id, or the id with a suffix the host added', () => {
  const w = (id: string, name: string) => ({ id, name, type: 'symcc:worker', status: 'running' })
  const agents = [w('a', 'T-3'), w('b', 'T-3-2'), w('c', 'T-30'), w('d', 'T-30-2')]
  expect(liveWorkersFor({ id: 'T-3' }, agents).map(a => a.id)).toEqual(['a', 'b'])
  expect(liveWorkersFor({ id: 'T-30' }, agents).map(a => a.id)).toEqual(['c', 'd'])
  expect(liveWorkersFor({ id: 'T-3' }, [w('c', 'T-30')])).toEqual([])
  expect(liveWorkersFor({ id: 'T-3' }, [{ ...w('a', 'T-3'), status: 'completed' }])).toEqual([])
})

test('after a reload, a task whose old worker is still alive stays "doing"', () => {
  let b = emptyBoard()
  for (const title of ['alive', 'gone']) b = addTask(b, { origin: W, title }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', session: 'me' }, T)
  b = patchTask(b, 'T-2', { status: 'doing', session: 'me' }, T)
  const after = resetDoing(b, 'me', null, 0, 'restarted', T, ['T-1'])
  expect(after.tasks.map(t => t.status)).toEqual(['doing', 'todo'])
})

test('time and cost: a try records its start and end, and leaving "doing" ends it', async () => {
  let [b, t] = addTask(emptyBoard(), { origin: W, title: 'timed' }, T)
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
  let [b] = addTask(emptyBoard(), { origin: W, title: 'a' }, T)
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

test('a merged task is said out loud, several are joined into one line, and the voice setting turns it off', async () => {
  expect(spokenDone(['T-3'])).toBe('T-3 done')
  expect(spokenDone(['T-3', 'T-4'])).toBe('T-3 and T-4 done')
  expect(spokenDone(['T-3', 'T-4', 'T-5'])).toBe('T-3, T-4 and T-5 done')
  expect(spokenDone(['T-3', 'T-3'])).toBe('T-3 done')
  expect(spokenDone([])).toBe('')
  const b = emptyBoard()
  expect(b.voice).toBe(true)
  expect(voiceOn(b)).toBe(true)
  expect(voiceOn({})).toBe(true)
  expect(voiceOn(parseBoard(JSON.stringify({ version: 1, tasks: [] })))).toBe(true)
  const off = { ...b, voice: false }
  expect(voiceOn(off)).toBe(false)
  expect(voiceOn(parseBoard(JSON.stringify(off)))).toBe(false)
})

test('the project folder name is the last part of its path', () => {
  expect(folderName('/Users/me/repositories/symcc')).toBe('symcc')
  expect(folderName('/Users/me/repositories/symcc/')).toBe('symcc')
  expect(folderName('')).toBe('')
  expect(boardTitle('/Users/me/repositories/symcc')).toBe(`${ICON} symcc board · symcc`)
  expect(boardTitle('')).toBe(`${ICON} symcc board`)
  expect(boardLabel('/Users/me/repositories/symcc')).toBe('symcc board · symcc')
  expect(boardLabel('')).toBe('symcc board')
})

test('the home folder is shortened to "~"', () => {
  expect(shortHome('/Users/me/repositories/symcc', '/Users/me')).toBe('~/repositories/symcc')
  expect(shortHome('/Users/me/repositories/symcc', '/Users/me/')).toBe('~/repositories/symcc')
  expect(shortHome('/Users/me', '/Users/me')).toBe('~')
  expect(shortHome('/Users/meg/x', '/Users/me')).toBe('/Users/meg/x')
  expect(shortHome('/opt/x', '')).toBe('/opt/x')
})

test('boardText starts with the project path when given', () => {
  expect(boardText(emptyBoard(), 0, '~/repositories/symcc').split('\n')[0]).toBe(`${ICON} symcc board · ~/repositories/symcc`)
  expect(boardText(emptyBoard())).toBe('The board is empty.')
})

test('the icon: one treble clef character for one-line spots, a small clef drawing for the banner', () => {
  expect(ICON).toBe('\u{1D11E}')
  expect([...ICON]).toHaveLength(1)
  expect(boardTitle('/x/app').startsWith(`${ICON} `)).toBe(true)
  expect(boardLabel('/x/app')).not.toContain(ICON) // the status line keeps no icon
  expect(ICON_ART.length >= 3 && ICON_ART.length <= 4).toBe(true)
  const w = ICON_ART[0]!.length
  expect(w <= 7).toBe(true)
  expect(ICON_ART.every(l => l.length === w)).toBe(true)
})

test('the banner: the clef drawing beside the name, where, who drives and the settings', () => {
  const b = { ...emptyBoard(), test_commands: ['claude plugin test .'] }
  const lines = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', true, 80)
  const [a0, a1, a2, a3] = ICON_ART.map(l => `${l}  `)
  expect(lines.map(l => l.art)).toEqual(ICON_ART.map(l => `${l}  `))
  expect(lines.map(bannerText)).toEqual([
    `${a0}symcc board · symcc`,
    `${a1}~/repositories/symcc · main · this session drives`,
    `${a2}tests: claude plugin test . · 3 at once · 45 min · 2 retries`,
    `${a3}`,
  ])
  expect(lines[0]!.parts[0]).toEqual({ text: 'symcc board', tone: 'accent', bold: true })
  expect(bannerRule(12)).toBe('━'.repeat(12))
  expect(listRule(12)).toBe('┄'.repeat(12))
  // driven elsewhere, no test command, and a counts line under the drawing, at full width
  const run = { started: '2026-01-01T00:00:00.000Z', ended: '2026-01-01T00:08:00.000Z', tokens: 643_700 }
  const tasks = [{ status: 'doing', runs: [run] }, { status: 'doing' }, { status: 'todo' }, { status: 'done' }] as never[]
  const more = bannerLines({ ...emptyBoard(), mode: 'off', auto_retries: 1, tasks }, '/Users/me/repositories/symcc', '/Users/me', false, 80)
  expect(more.map(bannerText)).toEqual([
    `${a0}symcc board · symcc`,
    `${a1}~/repositories/symcc · main · driven by another session`,
    `${a2}no test command · 3 at once · 45 min · 1 retry`,
    `${a3}`,
    '2 doing · 1 to do · 1 done · 8m · 643.7k tokens',
  ])
  expect(more[2]!.parts[0]).toEqual({ text: 'no test command', tone: 'warning' })
})

test('a narrow banner drops the drawing and cuts lines to fit', () => {
  const b = { ...emptyBoard(), test_commands: ['claude plugin test .'] }
  const lines = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', true, 30)
  const text = lines.map(bannerText)
  expect(text[0]).toBe('symcc board · symcc')
  expect(text.every(l => l.length <= 30 && !l.includes(ICON_ART[0]!.trim()) && !l.includes('\n'))).toBe(true)
  expect(text[1]).toBe('~/repositories/symcc · main ·…')
  expect(text[2]!.endsWith('…')).toBe(true)
  // a wide banner also never runs past the width
  expect(bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', true, 55).every(l => bannerText(l).length <= 55)).toBe(true)
})

test('another plugin name changes every path, branch, agent type and text made from it', () => {
  const n = namesFor('crew')
  const root = '/Users/me/repositories/app'
  const b = { ...emptyBoard(), test_commands: ['npm test'] }
  const [b1, t] = addTask(b, { origin: W, title: 'x', files: ['src/', '.crew/board.json', '.symcc/old.json'] }, T, n.dir)
  const made = [
    n.dir, n.boardFile, n.lockFile, n.leadFile, n.worktrees, n.scouts,
    n.branch('T-1'), n.author.name, n.author.email, n.worker, n.scout, n.tool('board'), n.pane, n.boardName, n.help, n.toast('stopped 1 old worker'),
    boardTitle(root, 'crew'), boardLabel(root, 'crew'), boardText(b1, 0, '~/repositories/app', 'crew'),
    ...bannerLines(b1, root, '/Users/me', true, 80, 0, 'crew').map(bannerText),
  ]
  expect(made.filter(s => s.includes('symcc'))).toEqual([])
  expect([n.dir, n.boardFile, n.lockFile, n.leadFile, n.worktrees, n.scouts]).toEqual(['.crew', '.crew/board.json', '.crew/board.lock', '.crew/lead.json', '.crew/worktrees', '.crew/scouts'])
  expect([n.branch('T-1'), n.worker, n.scout, n.tool('add'), n.help]).toEqual(['crew/T-1', 'crew:worker', 'crew:scout', 'mcp__crew__add', 'crew-help'])
  expect(n.author).toEqual({ name: 'crew', email: 'crew@localhost' })
  expect(boardTitle(root, 'crew')).toBe(`${ICON} crew board · app`)
  // the new data folder is never a task's file, and a change in it is always out of scope
  expect(t.files).toEqual(['src/', '.symcc/old.json'])
  expect(outOfScope(['.crew/board.json', 'src/a.js'], ['src/'], n.dir)).toEqual(['.crew/board.json'])
  // a worker of this name counts; one of another name does not
  expect(liveWorkersFor({ id: 'T-1' }, [{ id: 'a', type: 'crew:worker', status: 'running', description: 'T-1 x' }, { id: 'b', type: 'symcc:worker', status: 'running', description: 'T-1 x' }], 'crew').map(a => a.id)).toEqual(['a'])
  // the defaults stay as they were
  expect(namesFor().boardFile).toBe('.symcc/board.json')
  expect([cleanName(''), cleanName('a/b'), cleanName('crew')]).toEqual([DEFAULT_NAME, DEFAULT_NAME, 'crew'])
})

test('a new board starts on the branch the owner is on, else the repo main branch', async () => {
  expect(startBranch('my-feature', 'origin/main', ['main', 'my-feature'])).toBe('my-feature')
  expect(startBranch('', 'origin/develop', ['main', 'develop'])).toBe('develop')
  expect(startBranch('', '', ['master', 'x'])).toBe('master')
  expect(startBranch('', '', ['main', 'master'])).toBe('main')
  expect(startBranch('', '', [])).toBe('main')
  expect(emptyBoard('master').target_branch).toBe('master')
  expect(emptyBoard().target_branch).toBe('main')
})

test('the banner warns when the owner is on another branch, or the target is missing', async () => {
  expect(branchWarning('main', 'main')).toBe('')
  expect(branchWarning('main', '')).toBe('')
  expect(branchWarning('main', 'my-feature')).toBe("merging into main · you're on my-feature")
  expect(missingBranchText('main')).toBe("branch 'main' doesn't exist; set target_branch")
  const b = { ...emptyBoard(), branch_note: branchWarning('main', 'my-feature') }
  const l2 = bannerLines(b, '/Users/me/app', '/Users/me', true, 120)[1]!
  expect(bannerText(l2)).toContain("merging into main · you're on my-feature")
  expect(l2.parts.find(p => p.text.includes('you\'re on'))!.tone).toBe('warning')
  expect(bannerText(bannerLines(emptyBoard(), '/Users/me/app', '/Users/me', true, 120)[1]!)).toContain('main')
})

test('setting target_branch to a missing branch is refused with a few that exist', async () => {
  expect(noBranchText('mian', ['main', 'dev'])).toBe("Nothing changed: 'mian' is not a branch in this project. target_branch must be an existing branch, e.g. main, dev.")
  expect(noBranchText('x', [])).toBe("Nothing changed: 'x' is not a branch in this project. target_branch must be an existing branch.")
})

// ---------------- today in full, older days folded ----------------

const at = (id: string, status: string, updated: string, created = updated) =>
  ({ id, title: id, details: '', files: [], status, note: '', question: null, order: 0, after: [], attempts: 0, history: [], branch: null, created_at: created, updated_at: updated }) as SymccTask
const NOW = Date.parse('2026-11-11T12:00:00Z')

test('open tasks from old days stay on top, today in full, older days grouped newest day first', () => {
  const tasks = [
    at('T-1', 'done', '2026-11-04T10:00:00Z'),
    at('T-2', 'failed', '2026-11-01T10:00:00Z'),
    at('T-3', 'done', '2026-11-10T09:00:00Z'),
    at('T-4', 'dropped', '2026-11-09T09:00:00Z'),
    at('T-5', 'done', '2026-11-09T10:00:00Z'),
    at('T-6', 'done', '2026-11-11T08:00:00Z'),
    at('T-7', 'todo', '2026-10-01T08:00:00Z'),
    at('T-8', 'dropped', '2026-11-11T09:00:00Z'),
    at('T-9', 'done', '2026-11-10T11:00:00Z'),
  ]
  const s = boardSections(tasks, NOW, 0)
  expect(s.open.map(t => t.id).sort()).toEqual(['T-2', 'T-7'])
  expect(s.today.map(t => t.id).sort()).toEqual(['T-6', 'T-8'])
  expect(s.days.map(g => g.day)).toEqual(['2026-11-10', '2026-11-09', '2026-11-04'])
  expect(s.days.map(g => groupLabel(g))).toEqual(['▸ Yesterday · 2 done', '▸ Mon 9 Nov · 1 done · 1 dropped', '▸ Wed 4 Nov · 1 done'])
  expect(groupLabel(s.days[0]!, true)).toBe('▾ Yesterday · 2 done')
  expect(s.days[1]!.tasks.map(t => t.id).sort()).toEqual(['T-4', 'T-5'])
})

test("a task's day is its local updated_at, else created_at, in the owner's time zone", () => {
  expect(taskDay(at('T-1', 'done', '2026-11-10T23:30:00Z'), 0)).toBe('2026-11-10')
  expect(taskDay(at('T-1', 'done', '2026-11-10T23:30:00Z'), 60)).toBe('2026-11-11')
  expect(taskDay(at('T-1', 'done', '', '2026-11-08T12:00:00Z'), 0)).toBe('2026-11-08')
  expect(taskDay(at('T-1', 'done', '', ''), 0)).toBe('')
  // late yesterday in UTC is already today one hour east, so it shows in full
  expect(boardSections([at('T-1', 'done', '2026-11-10T23:30:00Z')], NOW, 60).today.length).toBe(1)
  expect(boardSections([at('T-1', 'done', '2026-11-10T23:30:00Z')], NOW, 0).days.length).toBe(1)
  // a task with no readable time is shown in full
  expect(boardSections([at('T-1', 'done', '', '')], NOW, 0).today.length).toBe(1)
})

test('day labels: Yesterday, then the date, with the year only for another year', () => {
  expect(dayLabel('2026-11-10', '2026-11-11')).toBe('Yesterday')
  expect(dayLabel('2026-11-04', '2026-11-11')).toBe('Wed 4 Nov')
  expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Yesterday')
  expect(dayLabel('2025-12-30', '2026-01-02')).toBe('Tue 30 Dec 2025')
})

test('boardText lists open and today in full, and one line per older day', () => {
  const b = { ...emptyBoard(), tasks: [at('T-1', 'done', '2026-11-09T10:00:00Z'), at('T-2', 'todo', '2026-11-01T10:00:00Z'), at('T-3', 'done', '2026-11-11T10:00:00Z'), at('T-4', 'done', '2026-11-10T10:00:00Z')] }
  const lines = boardText(b, NOW, undefined, DEFAULT_NAME, 0).split('\n').slice(1).filter(l => !l.trim().startsWith('from:'))
  expect(lines.map(l => l.split(/\s+/)[0])).toEqual(['T-2', 'T-3', '▸', '▸'])
  expect(lines.slice(2)).toEqual(['▸ Yesterday · 1 done', '▸ Mon 9 Nov · 1 done'])
  expect(lines.join('\n')).not.toContain('T-1')
})

test('a scout row says how often it runs, when it runs next and when it last ran', async () => {
  const at = Date.parse('2026-11-09T12:00:00.000Z')
  const iso = (min: number) => new Date(at + min * 60_000).toISOString()
  expect(everyText(30)).toBe('every 30 min')
  expect(everyText(60)).toBe('every hour')
  expect(everyText(120)).toBe('every 2 hours')
  expect(everyText(90)).toBe('every 90 min')
  expect(scoutStateText({ running: true, next_run: iso(5) }, at)).toBe('running now…')
  expect(scoutStateText({ running: false, paused: true, next_run: iso(5) }, at)).toBe('paused')
  expect(scoutStateText({ running: true, paused: true, next_run: iso(5) }, at)).toBe('running now…')
  expect(scoutStateText({ running: false, next_run: iso(12) }, at)).toBe('next in 12m')
  expect(scoutStateText({ running: false, next_run: iso(-1) }, at)).toBe('due now')
  expect(scoutStateText({ running: false }, at)).toBe('')
  expect(scoutRanText({ last_run: iso(-8) }, at)).toBe('ran 8m ago')
  expect(scoutRanText({ last_run: null }, at)).toBe('never ran')
  expect(scoutRow({ name: 'tests', every_minutes: 30, last_run: null, running: false, model: 'sonnet', next_run: iso(12) }, at)).toEqual({ name: 'tests', every: 'every 30 min', model: 'sonnet', state: 'next in 12m', ran: 'never ran' })
  expect(scoutRow({ name: 'bugs', every_minutes: 60, last_run: iso(-8), running: true }, at)).toEqual({ name: 'bugs', every: 'every hour', model: '', state: 'running now…', ran: 'ran 8m ago' })
  expect(scoutFile('bugs')).toBe('.symcc/scouts/bugs.md')
  expect(scoutFile('bugs', 'other')).toBe('.other/scouts/bugs.md')
  expect(scoutReport('')).toBe('nothing found')
  expect(scoutReport('NOTHING')).toBe('nothing found')
  expect(scoutReport('- a | b | c')).toBe('- a | b | c')
  expect(scoutReport('x'.repeat(900), 800)).toBe('x'.repeat(800) + '…')
  expect(scoutHowTo('other').join('\n')).toContain('.other/scouts/<name>.md')
  expect(scoutHowTo().join('\n')).toContain('examples/scouts/')
})

test('scout prompt: the file is the job, with the open tasks and the no-changes rule', () => {
  const p = scoutPrompt({ scout: 'deps', root: '/p', instructions: 'Check deps for new versions.', open: ['T-3 Fix login', 'T-4 Add docs'], name: 'symcc' })
  expect(p).toContain('Check deps for new versions.')
  expect(p).toContain('/p')
  expect(p).toContain('T-3 Fix login')
  expect(p).toContain('T-4 Add docs')
  expect(p).toContain("Don't change, create or delete files")
  expect(p).toContain('NOTHING')
  expect(p).not.toContain('|')
  expect(p).not.toContain('look for problems')
  expect(scoutPrompt({ scout: 'x', root: '/p', instructions: 'Go.', open: [] })).toContain('(none)')
})

test('scout prompt: recent closed tasks, the last report, the since-time and the rules for a good finding', () => {
  const p = scoutPrompt({ scout: 'bugs', root: '/p', instructions: 'Find crashes.', open: [], closed: ['T-7 Fix parser (done)', 'T-8 Rename x (dropped)'], lastReport: 'crash in src/p.ts:3', lastRun: '2026-11-12T08:00:00.000Z' })
  expect(p).toContain('T-7 Fix parser (done)')
  expect(p).toContain('T-8 Rename x (dropped)')
  expect(p).toContain('crash in src/p.ts:3')
  expect(p).toContain("don't repeat it unless it is still true and still not on the board")
  expect(p).toContain('git log --since=2026-11-12T08:00:00.000Z --stat')
  expect(p).toContain('Check before you report')
  expect(p).toContain('file:line')
  expect(p).toContain('sure or likely')
  expect(p).toContain('suggested task')
  expect(p).toContain('at most 3 findings')
  expect(p).toContain("Leave out anything you can't show proof for")
  expect(p).toContain('answer exactly: NOTHING. That is a good result, not a failure.')
  expect(p).toContain("Don't change, create or delete files")
})

test('scout prompt: works with no last report, no last run and no closed tasks', () => {
  for (const extra of [{}, { lastReport: null, lastRun: null, closed: [] }, { lastReport: 'NOTHING', lastRun: 'not a time' }, { lastReport: '   ' }]) {
    const p = scoutPrompt({ scout: 'x', root: '/p', instructions: 'Go.', open: [], ...extra })
    expect(p).toContain('This is your first run')
    expect(p).not.toContain('--since=')
    expect(p).not.toContain('undefined')
    expect(p).not.toContain('null')
    expect(p).toMatch(/Your last report[^\n]*\n\(none\)/)
    expect(p).toMatch(/recently finished or dropped[^\n]*\n\(none\)/)
  }
})

test('recent closed tasks: done and dropped only, newest first, capped', () => {
  const t = (id: string, status: string, updated_at?: string) => ({ id, title: `title ${id}`, status, updated_at, created_at: '2026-01-01T00:00:00Z' }) as any
  const tasks = [t('T-1', 'done', '2026-11-01T00:00:00Z'), t('T-2', 'todo', '2026-11-11T00:00:00Z'), t('T-3', 'dropped', '2026-11-10T00:00:00Z'), t('T-4', 'done', 'bad'), t('T-5', 'backlog')]
  expect(recentClosed(tasks)).toEqual(['T-3 title T-3 (dropped)', 'T-1 title T-1 (done)', 'T-4 title T-4 (done)'])
  expect(recentClosed(tasks, 1)).toEqual(['T-3 title T-3 (dropped)'])
  expect(recentClosed(tasks, -2)).toEqual([])
  expect(recentClosed([])).toEqual([])
  const many = Array.from({ length: 30 }, (_, i) => t(`T-${i}`, 'done', new Date(Date.UTC(2026, 0, 1 + i)).toISOString()))
  const r = recentClosed(many)
  expect(r.length).toBe(SCOUT_CLOSED_SHOWN)
  expect(r[0]).toBe('T-29 title T-29 (done)')
})

test('scout lead message: the whole report, trimmed; NOTHING gives none', () => {
  const report = 'line one\nline two\n- a\n- b\n- c\n- d'
  const m = scoutLeadMessage('deps', `  ${report}  `)!
  expect(m).toContain('Scout "deps" reports:')
  expect(m).toContain(report)
  expect(m).toContain('Add tasks for anything worth doing')
  expect(scoutLeadMessage('deps', 'x'.repeat(SCOUT_REPORT_CHARS + 500))).toContain('x'.repeat(SCOUT_REPORT_CHARS))
  expect(scoutLeadMessage('deps', 'x'.repeat(SCOUT_REPORT_CHARS + 500))).not.toContain('x'.repeat(SCOUT_REPORT_CHARS + 1))
  expect(scoutLeadMessage('deps', 'NOTHING')).toBeNull()
  expect(scoutLeadMessage('deps', ' NOTHING \n')).toBeNull()
  expect(scoutLeadMessage('deps', '')).toBeNull()
})

test('scouts are sorted running first, then by their next run', async () => {
  const s = (name: string, running: boolean, next_run?: string) => ({ name, every_minutes: 30, last_run: null, running, ...(next_run ? { next_run } : {}) })
  const sorted = sortScouts([s('late', false, '2026-11-09T13:00:00.000Z'), s('none', false), s('soon', false, '2026-11-09T12:05:00.000Z'), s('busy', true, '2026-11-09T14:00:00.000Z'), s('also', true)])
  expect(sorted.map(x => x.name)).toEqual(['busy', 'also', 'soon', 'late', 'none'])
  expect(scoutOrder(s('a', false), s('b', false))).toBeLessThan(0)
})

test('a spawn that fails because the worker type is not registered yet is "not ready", other errors are real', async () => {
  const N = namesFor(DEFAULT_NAME)
  expect(isNotReady(`Agent type '${N.worker}' not found`)).toBe(true)
  expect(isNotReady(`Error: Agent type '${N.worker}' not found. Available agents: general-purpose`)).toBe(true)
  expect(isNotReady(`Agent type 'other:worker' not found`, 'other')).toBe(true)
  expect(isNotReady(`Agent type 'someone-else:helper' not found`)).toBe(false)
  expect(isNotReady('the worker did not start')).toBe(false)
  expect(isNotReady('permission denied')).toBe(false)
  expect(isNotReady('')).toBe(false)
})

test('a task is only failed after 3 "not ready" misses in a row', async () => {
  expect(MAX_NOT_READY).toBe(3)
  expect(onNotReady(0)).toBe('retry')
  expect(onNotReady(1)).toBe('retry')
  expect(onNotReady(2)).toBe('fail')
  expect(onNotReady(5)).toBe('fail')
})

test('a heartbeat is fresh only within the stale time, in either direction', async () => {
  expect(isFresh(1000, 1000 + LEAD_STALE_MS)).toBe(true)
  expect(isFresh(1000, 1000 + LEAD_STALE_MS + 1)).toBe(false)
  expect(isFresh(1000 + LEAD_STALE_MS + 1, 1000)).toBe(false)
  expect(isFresh(0, 50, 100)).toBe(true)
})

test('backToTodo sends a task back to "todo" and forgets its session', async () => {
  const [b] = addTask(emptyBoard(), { origin: W, title: 'x' }, T)
  const t = { ...b.tasks[0]!, status: 'doing' as const, session: 's1' }
  const back = backToTodo(t, 'restarted', '2026-11-10T00:00:00.000Z')
  expect(back.status).toBe('todo')
  expect(back.note).toBe('restarted')
  expect(back.updated_at).toBe('2026-11-10T00:00:00.000Z')
  expect('session' in back).toBe(false)
  expect(t.session).toBe('s1')
})

test('statusCounts names only statuses that have tasks, in the order given', async () => {
  const tasks = [{ status: 'todo' }, { status: 'doing' }, { status: 'todo' }, { status: 'waiting' }] as Pick<SymccTask, 'status'>[]
  expect(statusCounts(tasks, ['doing', 'todo', 'paused', 'waiting'])).toEqual(['1 doing', '2 to do', '1 waiting for you'])
  expect(statusCounts(tasks, ['waiting', 'doing'])).toEqual(['1 waiting for you', '1 doing'])
  expect(statusCounts([], ['doing'])).toEqual([])
  expect(STATUS_WORD.todo).toBe('to do')
})

test('a scout file is written from its front matter and body, keeping the other keys', async () => {
  const old = '---\nname: Bugs finder\nevery: 30\nmodel: sonnet\ncolor: "blue"\n---\nOld text.\n'
  const text = scoutText(old, { every_minutes: 15, model: 'opus' }, '  Look for crashes.\nAnd leaks.\n')
  expect(text).toBe('---\nname: Bugs finder\nevery_minutes: 15\nmodel: opus\ncolor: "blue"\n---\n\nLook for crashes.\nAnd leaks.\n')
  // round-trips through the scout parser
  expect(parseScout('bugs', text)).toEqual({ name: 'Bugs finder', every_minutes: 15, model: 'opus', prompt: 'Look for crashes.\nAnd leaks.' })
  // an empty model is dropped: the session's model is used
  const noModel = scoutText(old, { every_minutes: 45, model: ' ' }, 'Body.')
  expect(noModel).not.toContain('model:')
  expect(noModel).toContain('color: "blue"')
  expect(parseScout('bugs', noModel)).toEqual({ name: 'Bugs finder', every_minutes: 45, model: undefined, prompt: 'Body.' })
  // a new scout (no old file)
  const fresh = scoutText(null, { every_minutes: 60 }, 'Look around.')
  expect(fresh).toBe('---\nevery_minutes: 60\n---\n\nLook around.\n')
  expect(parseScout('new', fresh)).toEqual({ name: 'new', every_minutes: 60, model: undefined, prompt: 'Look around.' })
  // an old file without front matter gets some
  expect(parseScout('x', scoutText('Just text.', { every_minutes: 5, model: 'haiku' }, 'Just text.'))).toEqual({ name: 'x', every_minutes: 5, model: 'haiku', prompt: 'Just text.' })
})

test('a new scout name and every_minutes are checked', async () => {
  expect(scoutNameError('my-scout_2', ['bugs'])).toBe('')
  expect(scoutNameError('', [])).toMatch(/name/)
  expect(scoutNameError('has space', [])).toMatch(/letters, digits, - and _/)
  expect(scoutNameError('a.b', [])).toMatch(/letters, digits/)
  expect(scoutNameError('../x', [])).toMatch(/letters, digits/)
  expect(scoutNameError('bugs', ['bugs'])).toMatch(/already exists/)
  expect(scoutNameError('Bugs', ['bugs'])).toMatch(/already exists/)
  expect(everyMinutesOf('30')).toBe(30)
  expect(everyMinutesOf(' 1 ')).toBe(1)
  expect(everyMinutesOf('0')).toBe(0)
  expect(everyMinutesOf('-5')).toBeNull()
  expect(everyMinutesOf('1.5')).toBeNull()
  expect(everyMinutesOf('ten')).toBeNull()
  expect(everyMinutesOf('')).toBeNull()
  expect(scoutDraftError({ every: '30', body: 'Look.' })).toBe('')
  expect(scoutDraftError({ every: '0', body: 'Look.' })).toBe('')
  expect(scoutDraftError({ every: '-5', body: 'Look.' })).toBe('every (minutes) must be a whole number: 0 for only on demand, or 1 or more')
  expect(scoutDraftError({ every: '1.5', body: 'Look.' })).toMatch(/0 for only on demand/)
  expect(scoutDraftError({ every: '30', body: '  ' })).toMatch(/looks for/)
})

test('after /clear, this session\'s "doing" tasks move to the new session id', () => {
  let b = emptyBoard()
  for (const title of ['mine', 'other', 'done', 'none']) b = addTask(b, { origin: W, title }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', session: 'old' }, T)
  b = patchTask(b, 'T-2', { status: 'doing', session: 'other' }, T)
  // a finished task that still names the old session (patchTask would drop it) is left alone
  b = { ...b, tasks: b.tasks.map(t => (t.id === 'T-3' ? { ...t, status: 'done' as const, session: 'old' } : t)) }
  b = patchTask(b, 'T-4', { status: 'doing' }, T)
  const after = relabelSession(b, 'old', 'new')
  expect(after.tasks.map(t => t.session)).toEqual(['new', 'other', 'old', undefined])
  expect(after.tasks.map(t => t.status)).toEqual(['doing', 'doing', 'done', 'doing'])
  // the new session sees its own task as its own, even with the old id gone
  expect(ownedHere(after.tasks[0]!, 'new', 'new')).toBe(true)
  // same id, or no id: nothing changes
  expect(relabelSession(b, 'old', 'old')).toBe(b)
  expect(relabelSession(b, 'old', '')).toBe(b)
})

test('the status line lists running and failed task IDs, without the folder or "<name> board"', () => {
  let n = 0
  const t = (status: SymccTask['status'], id = `T-${++n}`) => ({ id, status })
  const board = namesFor(DEFAULT_NAME).boardName
  const lines = [
    statusLine({ tasks: [t('done')] }, true),
    statusLine({ tasks: [t('doing', 'T-26'), t('doing', 'T-27'), t('todo'), t('todo')] }, true),
    statusLine({ tasks: [t('failed', 'T-28'), t('done')] }, true),
    statusLine({ tasks: [t('failed', 'T-28'), t('failed', 'T-29')] }, true),
    statusLine({ tasks: [t('todo')] }, true, '', 'off'),
    statusLine({ tasks: [t('waiting'), t('paused')] }, true),
    statusLine({ tasks: [t('done')] }, false),
    statusLine({ tasks: [] }, false),
    statusLine({ tasks: [] }, true, 'on dev, not main'),
    statusLine({ tasks: ['T-1', 'T-2', 'T-3', 'T-4', 'T-5'].map(id => t('doing', id)) }, true),
    statusLine({ tasks: ['T-1', 'T-2', 'T-3', 'T-4'].map(id => t('failed', id)) }, true),
  ]
  expect(lines).toEqual([
    '⏵ auto · all done',
    '⏵ auto · T-26, T-27 doing · 2 to do',
    '⏵ auto · 1 failed (T-28)',
    '⏵ auto · 2 failed (T-28, T-29)',
    '⏹ off · 1 to do',
    '⏵ auto · 1 paused · 1 waiting for you',
    '⏵ auto · all done (driven by another session)',
    '⏵ auto · empty (driven by another session)',
    'on dev, not main',
    '⏵ auto · T-1, T-2, T-3 +2 doing',
    '⏵ auto · 4 failed (T-1, T-2, T-3 +1)',
  ])
  for (const l of lines) {
    expect(l).not.toContain(board)
    expect(l).not.toContain(DEFAULT_NAME) // this repo's folder name
  }
  expect(statusLine({ tasks: [] }, true)).toBeUndefined()
})

test('the status line keeps the backlog quiet, but says "all done · N in backlog" when only backlog is left', () => {
  const t = (status: SymccTask['status'], id: string) => ({ id, status })
  expect(statusLine({ tasks: [t('done', 'T-1'), t('backlog', 'T-2'), t('backlog', 'T-3')] }, true)).toBe('⏵ auto · all done · 2 in backlog')
  expect(statusLine({ tasks: [t('backlog', 'T-2')] }, false)).toBe('⏵ auto · all done · 1 in backlog (driven by another session)')
  expect(statusLine({ tasks: [t('todo', 'T-1'), t('backlog', 'T-2')] }, true)).toBe('⏵ auto · 1 to do')
  expect(backlogLabel(3)).toBe('▸ Backlog (3)')
  expect(backlogLabel(3, true)).toBe('▾ Backlog (3)')
})

test('the status line starts with the board mode: off, review or auto', () => {
  const t = (status: SymccTask['status'], id: string) => ({ id, status })
  const tasks = [t('doing', 'T-26'), t('review', 'T-27')]
  expect(MODE_LABEL).toEqual({ off: '⏹ off', review: '⏸ review merge', auto: '⏵ auto' })
  expect(MODE_NAME).toEqual({ off: 'off', review: 'review merge', auto: 'auto' })
  expect(modeButton('auto')).toBe('[m] review merge')
  expect(modeButton('review')).toBe('[m] auto')
  expect(modeButton('off')).toBe('[m] review merge')
  expect(nextMode('off')).toBe('review')
  expect(nextMode('review')).toBe('auto')
  expect(nextMode('auto')).toBe('review')
  expect(statusLine({ tasks }, true, '', 'off')).toBe('⏹ off · T-26 doing · 1 to review (T-27)')
  expect(statusLine({ tasks }, true, '', 'review')).toBe('⏸ review merge · T-26 doing · 1 to review (T-27)')
  expect(statusLine({ tasks }, true, '', 'auto')).toBe('⏵ auto · T-26 doing · 1 to review (T-27)')
  expect(statusLine({ tasks }, true)).toBe('⏵ auto · T-26 doing · 1 to review (T-27)')
  // empty board this session drives: off and review show the label; auto stays quiet
  expect(statusLine({ tasks: [] }, true, '', 'off')).toBe('⏹ off')
  expect(statusLine({ tasks: [] }, true, '', 'review')).toBe('⏸ review merge')
  expect(statusLine({ tasks: [] }, true, 'on dev, not main', 'review')).toBe('⏸ review merge · on dev, not main')
  expect(statusLine({ tasks: [] }, true, '', 'auto')).toBeUndefined()
  expect(statusLine({ tasks: [] }, true, 'on dev, not main', 'auto')).toBe('on dev, not main')
  // driven by another session: the label shows in every mode
  expect(statusLine({ tasks: [] }, false, '', 'off')).toBe('⏹ off · empty (driven by another session)')
  expect(statusLine({ tasks: [] }, false, '', 'review')).toBe('⏸ review merge · empty (driven by another session)')
  expect(statusLine({ tasks: [] }, false, '', 'auto')).toBe('⏵ auto · empty (driven by another session)')
  expect(statusLine({ tasks: [t('todo', 'T-1')] }, false, '', 'review')).toBe('⏸ review merge · 1 to do (driven by another session)')
  // a bad mode shows as auto
  expect(statusLine({ tasks }, true, '', 'later' as never)).toBe('⏵ auto · T-26 doing · 1 to review (T-27)')
  expect(modeLabel('off')).toBe('⏹ off')
})

// ---------------- review before merge ----------------

test('the board mode is "auto" by default, also for a board without it or with a bad value', () => {
  expect(emptyBoard().mode).toBe('auto')
  expect(parseBoard(null).mode).toBe('auto')
  expect(parseBoard(JSON.stringify({ version: 1, next_id: 1, tasks: [] })).mode).toBe('auto')
  expect(parseBoard(JSON.stringify({ mode: 'off', tasks: [] })).mode).toBe('off')
  expect(parseBoard(JSON.stringify({ mode: 'review', tasks: [] })).mode).toBe('review')
  expect(parseBoard(JSON.stringify({ mode: 'auto', tasks: [] })).mode).toBe('auto')
  for (const bad of ['later', 'OFF', '', 1, true, null, ['off']]) expect(parseBoard(JSON.stringify({ mode: bad, tasks: [] })).mode).toBe('auto')
  expect(modeOf({})).toBe('auto')
  expect(modeOf(undefined)).toBe('auto')
  // keys a board does not have are not kept
  expect(Object.keys(parseBoard(JSON.stringify({ old_key: true, tasks: [] }))).includes('old_key')).toBe(false)
})

test('needsReview: mode review (or off) makes every task wait; in auto only a task with needs_review waits', () => {
  for (const mode of ['review', 'off'] as const) {
    expect(needsReview({ mode }, {})).toBe(true)
    expect(needsReview({ mode }, { needs_review: true })).toBe(true)
  }
  expect(needsReview({ mode: 'auto' }, {})).toBe(false)
  expect(needsReview({ mode: 'auto' }, { needs_review: false })).toBe(false)
  expect(needsReview({ mode: 'auto' }, { needs_review: true })).toBe(true)
  expect(needsReview({}, {})).toBe(false)
  expect(needsReview({}, { needs_review: true })).toBe(true)
})

test('add and change set needs_review on a task', () => {
  const [b1, t] = addTask(emptyBoard(), { origin: W, title: 'A', needs_review: true }, T)
  expect(b1.tasks[0]!.needs_review).toBe(true)
  const b2 = patchTask(b1, t.id, { needs_review: false }, T)
  expect(b2.tasks[0]!.needs_review).toBe(undefined)
  const [b3] = addTask(emptyBoard(), { origin: W, title: 'B' }, T)
  expect(b3.tasks[0]!.needs_review).toBe(undefined)
})

test('reject sends a task in review back to "todo" with the reason in its history', () => {
  let [b, t] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
  b = patchTask(b, t.id, { status: 'review', attempts: 1, test_tries: 1, history: ['try 1: did it → checks passed'] }, T)
  const r = rejectTask(b, 't-1', 'the button should be blue', '2026-11-09T01:00:00.000Z')
  const x = r.tasks[0]!
  expect(x.status).toBe('todo')
  expect(x.note).toContain('the button should be blue')
  expect(x.history[x.history.length - 1]).toContain('rejected by the owner: the button should be blue')
  expect(x.history.length).toBe(2)
  expect(x.test_tries).toBe(0)
  expect(ready(r).map(y => y.id)).toEqual([t.id])
  const c = rejectTask(patchTask(b, t.id, { conflict_tries: 2, merge_main: true }, T), t.id, 'try again', T).tasks[0]!
  expect(c.conflict_tries).toBe(0)
  expect(c.merge_main).toBe(false)
  expect(onConflict(c)).toBe('retry')
  expect(() => rejectTask(b, t.id, '  ', T)).toThrow()
})

test('approve and reject refuse a task that is not in review', () => {
  for (const status of ['todo', 'doing', 'paused', 'waiting', 'failed', 'done', 'dropped'] as const) {
    let [b, t] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
    b = patchTask(b, t.id, { status }, T)
    expect(() => reviewTask(b, t.id, 'approve')).toThrow('not ready for review')
    expect(() => rejectTask(b, t.id, 'no', T)).toThrow('not ready for review')
  }
  let [b, t] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
  b = patchTask(b, t.id, { status: 'review' }, T)
  expect(reviewTask(b, t.id, 'approve').id).toBe(t.id)
  expect(() => reviewTask(b, 'T-99', 'approve')).toThrow('not on the board')
})

test('going from review to auto leaves tasks in review as they are', () => {
  let [b, t] = addTask(setMode(emptyBoard(), 'review'), { origin: W, title: 'A' }, T)
  expect(b.mode).toBe('review')
  b = patchTask(b, t.id, { status: 'review' }, T)
  const a = setMode(b, 'auto')
  expect(a.mode).toBe('auto')
  expect(a.tasks[0]!.status).toBe('review')
  expect(a.tasks).toEqual(b.tasks)
})

test('a task in review counts as open and shows as "ready for review"', () => {
  expect(STATUS_WORD.review).toBe('ready for review')
  expect(statusLine({ tasks: [{ id: 'T-5', status: 'review' }] }, true)).toBe('⏵ auto · 1 to review (T-5)')
})

test('the status line lists tasks to review by ID, cut after 3', () => {
  const t = (status: SymccTask['status'], id: string) => ({ id, status })
  expect(statusLine({ tasks: [t('doing', 'T-1'), t('review', 'T-5'), t('todo', 'T-6'), t('failed', 'T-7')] }, true)).toBe('⏵ auto · T-1 doing · 1 to review (T-5) · 1 to do · 1 failed (T-7)')
  expect(statusLine({ tasks: ['T-1', 'T-2', 'T-3', 'T-4', 'T-5'].map(id => t('review', id)) }, true)).toBe('⏵ auto · 5 to review (T-1, T-2, T-3 +2)')
})

test('the board text names a task in review', () => {
  let [b, t] = addTask(emptyBoard(), { origin: W, title: 'Blue button' }, T)
  b = patchTask(b, t.id, { status: 'review' }, T)
  expect(boardText(b)).toMatch(/T-1\s+review\s+Blue button — ready for review/)
  expect(boardText(b)).toContain(modeText('auto'))
  b = patchTask(setMode(b, 'review'), t.id, { note: 'ready for review: the checks passed' }, T)
  expect(boardText(b)).toContain('⏸ review merge: work runs; finished tasks wait for your approve or reject')
  expect(boardText(b)).toContain('— ready for review: the checks passed')
})

test('git diff --stat output becomes one row per file with +/- counts', () => {
  const out = [
    ' hooks/board.ts       | 12 +++++++++---',
    ' README.md            |  4 ----',
    ' tests/new.test.ts    |  3 +++',
    ' img/logo.png         | Bin 0 -> 1234 bytes',
    ' "odd name.txt"       |  1 +',
    ' empty.txt            |  0',
    ' 6 files changed, 16 insertions(+), 7 deletions(-)',
  ].join('\n')
  expect(parseDiffStat(out)).toEqual([
    { file: 'hooks/board.ts', added: 9, removed: 3 },
    { file: 'README.md', added: 0, removed: 4 },
    { file: 'tests/new.test.ts', added: 3, removed: 0 },
    { file: 'img/logo.png', added: 0, removed: 0, binary: true },
    { file: 'odd name.txt', added: 1, removed: 0 },
    { file: 'empty.txt', added: 0, removed: 0 },
  ])
  // a bar git shrank to fit: the counts are scaled back to the total
  expect(parseDiffStat(' big.ts | 300 ++++++++----')).toEqual([{ file: 'big.ts', added: 200, removed: 100 }])
  expect(parseDiffStat('')).toEqual([])
  expect(statCount({ file: 'a', added: 2, removed: 1 })).toBe('+2 -1')
  expect(statCount({ file: 'a', added: 0, removed: 0, binary: true })).toBe('binary')
  const text = statText('T-5', parseDiffStat(out).slice(0, 2))
  expect(text.split('\n')[0]).toBe('T-5 changes 2 files (+9 -7):')
  expect(text).toContain('hooks/board.ts  +9 -3')
  expect(text).toContain('/symcc-diff T-5 <file>')
  expect(statText('T-5', parseDiffStat(out).slice(0, 2), 'crew')).toContain('/crew-diff T-5 <file>')
  expect(statText('T-5', [])).toContain('no changes')
})

test('a long diff is cut with a note on how many lines are left and where to see them', () => {
  const diff = Array.from({ length: 450 }, (_, i) => `+line ${i}`).join('\n') + '\n'
  const cut = cutDiff(diff, 'T-5', 110)
  expect(cut.length).toBe(111)
  expect(cut[109]).toBe('+line 109')
  expect(cut[110]).toBe('… 340 more lines (see /symcc-diff T-5)')
  expect(cutDiff(diff, 'T-5', 449, 'a.ts').at(-1)).toBe('… 1 more line (see /symcc-diff T-5 a.ts)')
  expect(cutDiff(diff, 'T-5', 449, 'a.ts', 'crew').at(-1)).toBe('… 1 more line (see /crew-diff T-5 a.ts)')
  expect(cutDiff('+a\n-b\n', 'T-5', 10)).toEqual(['+a', '-b'])
  expect(cutDiff('', 'T-5')).toEqual([])
})

test('diff lines are colored: added in success, removed in error, headers and hunks apart', () => {
  const lines = ['diff --git a/x.ts b/x.ts', 'index 1..2 100644', '--- a/x.ts', '+++ b/x.ts', '@@ -1,3 +1,3 @@', ' same', '-old', '+new', '--- a line that starts with dashes', '\\ No newline at end of file', '… 3 more lines (see /symcc-diff T-5)']
  const kinds = diffKinds(lines)
  expect(kinds).toEqual(['header', 'header', 'header', 'header', 'hunk', 'context', 'remove', 'add', 'remove', 'context', 'note'])
  expect(kinds.map(k => DIFF_COLOR[k])).toEqual(['subtle', 'subtle', 'subtle', 'subtle', 'ide', 'text', 'error', 'success', 'error', 'text', 'warning'])
})

test('slash commands all start with the plugin name: open, views, one task, approve, reject, diff, scout, help', () => {
  expect(commandNames()).toEqual(['symcc', 'symcc-tasks', 'symcc-scouts', 'symcc-task', 'symcc-approve', 'symcc-reject', 'symcc-diff', 'symcc-scout', 'symcc-mode', 'symcc-settings', 'symcc-help', 'symcc-off', 'symcc-on'])
  expect(commandNames('crew')[0]).toBe('crew')
  expect(commandNames('crew')).toContain('crew-help')
  expect(parseCommand('symcc', '')).toEqual({ kind: 'open' })
  expect(parseCommand('symcc', 'T-3')!.kind).toBe('bad')
  expect(parseCommand('symcc-tasks', '')).toEqual({ kind: 'tasks' })
  expect(parseCommand('symcc-scouts', ' ')).toEqual({ kind: 'scouts' })
  expect(parseCommand('symcc-task', ' t-3 ')).toEqual({ kind: 'show', id: 'T-3' })
  expect(parseCommand('symcc-approve', 'T-5')).toEqual({ kind: 'approve', id: 'T-5' })
  expect(parseCommand('symcc-approve', 't5')).toEqual({ kind: 'approve', id: 'T-5' })
  expect(parseCommand('symcc-reject', 'T-5 the button  should be blue')).toEqual({ kind: 'reject', id: 'T-5', reason: 'the button  should be blue' })
  expect(parseCommand('symcc-diff', 'T-5')).toEqual({ kind: 'diff', id: 'T-5' })
  expect(parseCommand('symcc-diff', 'T-5 hooks/board.ts')).toEqual({ kind: 'diff', id: 'T-5', file: 'hooks/board.ts' })
  expect(parseCommand('symcc-scout', 'bugs')).toEqual({ kind: 'scout', name: 'bugs' })
  expect(parseCommand('symcc-help', '')).toEqual({ kind: 'help', topic: '' })
  expect(parseCommand('symcc-help', ' scouts ')).toEqual({ kind: 'help', topic: 'scouts' })
  expect(parseCommand('symcc-mode', 'off')).toEqual({ kind: 'mode', mode: 'off' })
  const bads: [string, string][] = [['symcc-tasks', 'x'], ['symcc-scouts', 'run bugs'], ['symcc-task', ''], ['symcc-task', 'banana'], ['symcc-task', 'T-3 T-4'], ['symcc-approve', ''], ['symcc-approve', 'banana'], ['symcc-approve', 'T-5 now'], ['symcc-reject', 'T-5'], ['symcc-reject', ''], ['symcc-diff', ''], ['symcc-diff', 'x.ts'], ['symcc-scout', ''], ['symcc-scout', 'a b'], ['symcc-mode', 'later']]
  for (const [c, a] of bads) expect(parseCommand(c, a)!.kind).toBe('bad')
  expect((parseCommand('symcc-reject', 'T-5') as { message: string }).message).toContain('/symcc-reject T-5 <reason>')
  expect((parseCommand('symcc-approve', '') as { message: string }).message).toBe('Use: /symcc-approve T-5')
  // not ours: old names and other plugins' commands
  for (const c of ['board', 'scouts', 'symccx', 'other-mode', 'symcc-board', 'symcc-'])
    expect(parseCommand(c, '')).toBeNull()
  // a renamed plugin gets its own prefix
  expect(parseCommand('crew-approve', 'T-5', 'auto', 'crew')).toEqual({ kind: 'approve', id: 'T-5' })
  expect(parseCommand('symcc-approve', 'T-5', 'auto', 'crew')).toBeNull()
  expect((parseCommand('crew-task', '', 'auto', 'crew') as { message: string }).message).toBe('Use: /crew-task T-3')
})

test('in the panel, tasks in review, waiting and failed come first, the rest keep their order', () => {
  const ts = (['done', 'doing', 'failed', 'todo', 'review', 'waiting', 'review'] as const).map((status, i) => ({ id: `T-${i}`, status }))
  expect(needsYouFirst(ts).map(t => t.id)).toEqual(['T-4', 'T-6', 'T-5', 'T-2', 'T-0', 'T-1', 'T-3'])
})

test('/symcc-mode: no word switches review and auto (off goes to review), a word sets it, junk gives usage', () => {
  expect(parseModeCommand('', 'auto')).toEqual({ kind: 'mode', mode: 'review' })
  expect(parseModeCommand('', 'review')).toEqual({ kind: 'mode', mode: 'auto' })
  expect(parseModeCommand('  ', 'off')).toEqual({ kind: 'mode', mode: 'review' })
  for (const now of ['off', 'review', 'auto'] as const) {
    expect(parseModeCommand('off', now)).toEqual({ kind: 'mode', mode: 'off' })
    expect(parseModeCommand(' Review ', now)).toEqual({ kind: 'mode', mode: 'review' })
    expect(parseModeCommand('AUTO', now)).toEqual({ kind: 'mode', mode: 'auto' })
  }
  for (const junk of ['on', 'paused', 'auto review', 'maybe']) {
    const r = parseModeCommand(junk, 'auto')
    expect(r.kind).toBe('bad')
    expect((r as { message: string }).message).toContain('/symcc-mode')
  }
  expect((parseModeCommand('x', 'auto', 'crew') as { message: string }).message).toContain('/crew-mode off|review|auto')
  // the same through parseCommand, with the board's mode
  expect(parseCommand('symcc-mode', '', 'review')).toEqual({ kind: 'mode', mode: 'auto' })
  expect(parseCommand('symcc-mode', '', 'off')).toEqual({ kind: 'mode', mode: 'review' })
  expect(modeText('off')).toBe('⏹ off: no work runs; tasks in review can still be approved or rejected')
  expect(modeText('review')).toBe('⏸ review merge: work runs; finished tasks wait for your approve or reject')
  expect(modeText('auto')).toBe('⏵ auto: work runs; finished tasks that pass merge on their own')
})

test('agent names start with the plugin name', () => {
  expect(workerName('symcc', 'T-33')).toBe('symcc-T-33')
  expect(workerName('other', 'T-1')).toBe('other-T-1')
  expect(workerDescription('One mode  (off / review / auto)')).toBe('One mode (off / review / auto)')
  expect(workerDescription('x'.repeat(100)).length).toBe(AGENT_DESCRIPTION_CHARS)
  expect(scoutAgentName('symcc', 'bugs')).toBe('symcc-scout-bugs')
  expect(scoutAgentName('my.plugin', 'odd name!')).toBe('my-plugin-scout-odd-name')
  for (const n of [workerName('symcc', 'T-33'), scoutAgentName('symcc', 'bugs'), scoutAgentName('x', 'y'.repeat(200))]) expect(n).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
  expect(scoutDescription('bugs', '\n# Find bugs in the code\nmore')).toBe('Find bugs in the code')
  expect(scoutDescription('bugs', '')).toBe('bugs')
  expect(scoutDescription('bugs', 'y'.repeat(100)).length).toBe(AGENT_DESCRIPTION_CHARS)
  // a worker is still found for its task by its new name, with or without a host suffix
  const [b] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
  const t = b.tasks[0]!
  expect(mayStart(t, [{ id: 'w', type: 'symcc:worker', status: 'running', name: 'symcc-T-1', description: 'A' }])).toBe(false)
  expect(mayStart(t, [{ id: 'w', type: 'symcc:worker', status: 'running', name: 'symcc-T-1-2', description: 'A' }])).toBe(false)
  expect(mayStart(t, [{ id: 'w', type: 'symcc:worker', status: 'running', name: 'symcc-T-10', description: 'A' }])).toBe(true)
  expect(mayStart(t, [{ id: 'w', type: 'my:worker', status: 'running', name: 'my-T-1', description: 'A' }], 'my')).toBe(false)
  expect(mayStart(t, [{ id: 's', type: 'symcc:scout', status: 'running', name: 'symcc-scout-T-1', description: 'T-1' }])).toBe(true)
})

test('a worker asking for more files is read from its answer', async () => {
  expect(parseNeedFiles('NEED FILES: README.md — the docs mention it')).toEqual({ files: ['README.md'], reason: 'the docs mention it' })
  expect(parseNeedFiles('I looked around.\n  NEED FILES: README.md, tests/x.test.ts - both need the new name')).toEqual({ files: ['README.md', 'tests/x.test.ts'], reason: 'both need the new name' })
  expect(parseNeedFiles('NEED FILES: `src/my-file.ts`, `./docs/a.md` — rename')).toEqual({ files: ['src/my-file.ts', 'docs/a.md'], reason: 'rename' })
  expect(parseNeedFiles('need files:  a.js ,  b.js ')).toEqual({ files: ['a.js', 'b.js'], reason: '' })
  expect(parseNeedFiles('I changed hooks/board.ts and added tests.')).toBeUndefined()
  expect(parseNeedFiles('QUESTION: which colour?')).toBeUndefined()
  expect(parseNeedFiles('NEED FILES: — no files named')).toBeUndefined()
})

test('the waiting question and the failure note for files outside the list', async () => {
  expect(needFilesQuestion('T-7', { files: ['README.md', 'tests/x.test.ts'], reason: 'docs' })).toBe('T-7 needs to change files outside its list: README.md, tests/x.test.ts — docs. Allow them?')
  expect(needFilesQuestion('T-7', { files: ['a.js'], reason: '' })).toBe('T-7 needs to change files outside its list: a.js. Allow them?')
  const note = outOfScopeText(['docs/x.md'], ['src/'])
  expect(note).toContain('docs/x.md')
  expect(note).toContain('add them to files with change, or split the task')
})

test('a backlog task never starts until it is moved to todo', async () => {
  let b = emptyBoard()
  const [b1, idea] = addTask(b, { origin: W, title: 'Idea: requests and triage', backlog: true }, T)
  const [b2, later] = addTask(b1, { origin: W, title: 'After the idea', after: [idea.id] }, T)
  b = b2
  expect(idea.status).toBe('backlog')
  expect(ready(b).map(t => t.id)).toEqual([])
  expect(mayStart(b.tasks[0], [])).toBe(false)
  expect(OPEN).not.toContain('backlog')
  // modes do not change it
  for (const m of ['off', 'review', 'auto'] as const) expect(ready(setMode(b, m)).map(t => t.id)).toEqual([])
  // promote: backlog -> todo, with a history line
  b = promoteTask(b, idea.id, T)
  const p = b.tasks.find(t => t.id === idea.id)!
  expect(p.status).toBe('todo')
  expect(p.history[p.history.length - 1]).toBe('moved from the backlog to todo')
  expect(ready(b).map(t => t.id)).toEqual([idea.id])
  expect(ready(b).map(t => t.id)).not.toContain(later.id)
  expect(() => promoteTask(b, idea.id, T)).toThrow()
})

test('stash: a todo, paused or failed task goes to the backlog with a history line', async () => {
  let b = emptyBoard()
  const [b1, a] = addTask(b, { origin: W, title: 'A' }, T)
  const [b2, c] = addTask(b1, { origin: W, title: 'C' }, T)
  const [b3, d] = addTask(b2, { origin: W, title: 'D' }, T)
  b = patchTask(patchTask(b3, c.id, { status: 'paused' }, T), d.id, { status: 'failed' }, T)
  b = stashTask(b, a.id, T, 'not clear yet')
  const x = b.tasks.find(t => t.id === a.id)!
  expect(x.status).toBe('backlog')
  expect(x.history[x.history.length - 1]).toBe('moved to the backlog (was todo): not clear yet')
  expect(ready(b).map(t => t.id)).toEqual([])
  b = stashTask(stashTask(b, c.id, T), d.id, T)
  expect(b.tasks.every(t => t.status === 'backlog')).toBe(true)
  expect(b.tasks.find(t => t.id === d.id)!.history.at(-1)).toBe('moved to the backlog (was failed)')
  b = patchTask(b, a.id, { status: 'done' }, T)
  expect(() => stashTask(b, a.id, T)).toThrow()
})

test('the board text lists open tasks first, then the backlog, then done ones; the status line stays quiet', async () => {
  let b = emptyBoard()
  const [b1, done] = addTask(b, { origin: W, title: 'Finished' }, '2026-11-09T03:00:00.000Z')
  const [b2, idea] = addTask(b1, { origin: W, title: 'Idea: requests and triage', backlog: true }, '2026-11-09T01:00:00.000Z')
  const [b3, open] = addTask(b2, { origin: W, title: 'Open work' }, '2026-11-09T00:30:00.000Z')
  b = patchTask(b3, done.id, { status: 'done' }, '2026-11-09T03:00:00.000Z')
  for (const text of [boardText(b), boardText(b, Date.parse('2026-11-09T12:00:00.000Z'), undefined, DEFAULT_NAME, 0)]) {
    const lines = text.split('\n')
    const at = (id: string) => lines.findIndex(l => l.startsWith(id + ' '))
    expect(at(open.id)).toBeLessThan(at(idea.id))
    expect(at(idea.id)).toBeLessThan(at(done.id))
    expect(lines[at(idea.id)]).toBe(`${idea.id}   backlog Idea: requests and triage`)
  }
  const s = boardSections(b.tasks, Date.parse('2026-11-12T12:00:00.000Z'), 0)
  expect(s.backlog.map(t => t.id)).toEqual([idea.id])
  expect(s.days.flatMap(g => g.tasks).map(t => t.id)).toEqual([done.id])
  expect(statusLine(b, true)).not.toContain('backlog')
  expect(STATUS_WORD.backlog).toBe('backlog')
})

test('old boards without backlog still parse', async () => {
  const old = { version: 1, next_id: 3, mode: 'auto', test_commands: [], target_branch: 'main', max_parallel: 3, max_minutes: 45, auto_retries: 2, tasks: [
    { id: 'T-1', title: 'A', details: 'A', files: [], status: 'todo', note: '', question: null, order: 1, after: [], attempts: 0, history: [], branch: null, created_at: T, updated_at: T },
    { id: 'T-2', title: 'B', details: 'B', files: [], status: 'done', note: '', question: null, order: 2, after: [], attempts: 1, history: [], branch: null, created_at: T, updated_at: T },
  ] }
  const b = parseBoard(JSON.stringify(old))
  expect(b.tasks.map(t => t.status)).toEqual(['todo', 'done'])
  expect(ready(b).map(t => t.id)).toEqual(['T-1'])
  const [b2, t] = addTask(b, { origin: W, title: 'C', backlog: true }, T)
  expect(parseBoard(JSON.stringify(b2)).tasks.find(x => x.id === t.id)!.status).toBe('backlog')
})

test('the backlog header and "… N more" line, and the banner says "N in backlog"', () => {
  expect(backlogHeader(2)).toBe('▸ Backlog (2)')
  expect(backlogHeader(2, true)).toBe('▾ Backlog (2)')
  expect(backlogMoreLabel(3)).toBe('… 3 more (Enter to show all)')
  expect(BACKLOG_SHOWN).toBe(5)
  const b = { ...emptyBoard(), tasks: [{ status: 'backlog' }, { status: 'backlog' }, { status: 'todo' }] } as never
  expect(bannerLines(b, '/x/p', '/x', true, 80).map(bannerText).join('\n')).toContain('2 in backlog')
})

test('a folder without git: the state, the notes and the question asked first', async () => {
  expect(gitStateOf({ hasGit: false, inside: false, hasHead: false })).toBe('no-git')
  expect(gitStateOf({ hasGit: true, inside: false, hasHead: false })).toBe('no-repo')
  expect(gitStateOf({ hasGit: true, inside: true, hasHead: false })).toBe('no-commits')
  expect(gitStateOf({ hasGit: true, inside: true, hasHead: true })).toBe('ok')
  expect(gitNote('ok')).toBe('')
  expect(gitNote('no-git')).toBe('git is not installed')
  expect(gitNote('no-repo')).toContain('(g)')
  expect(noGitText()).toContain('xcode-select --install')
  expect(noGitText()).toContain('https://git-scm.com')
  const ask = setupAskText('no-repo')
  expect(ask).toContain('This folder has no git repo. symcc needs one to give each worker its own copy. Set it up? (git init, a .gitignore, a first commit of the current files.)')
  expect(ask).toContain('symcc setup_git')
  expect(ask).toContain('only if they say yes')
  const ask2 = setupAskText('no-commits')
  expect(ask2).toContain('no commits yet')
  expect(ask2).not.toContain('git init')
})

test('setup .gitignore: the safe lines are added once, never twice', async () => {
  const base = gitignoreBase()
  expect(base[0]).toBe('.symcc/')
  for (const l of ['node_modules/', '.env', '.env.*', '.DS_Store', 'dist/', 'build/', '__pycache__/', '.venv/']) expect(base).toContain(l)
  const fresh = gitignoreWith(null, base)
  expect(fresh).toBe(base.join('\n') + '\n')
  expect(gitignoreWith(fresh, base)).toBe(fresh)
  // lines already there (written a bit differently) are not added again; a missing newline is fixed
  const old = '/node_modules\n.symcc\n# mine\nlogs/'
  const out = gitignoreWith(old, base)
  expect(out.startsWith(old + '\n')).toBe(true)
  expect(out.split('\n').filter(l => l.includes('node_modules')).length).toBe(1)
  expect(out.split('\n').filter(l => l.includes('.symcc')).length).toBe(1)
  expect(out).toContain('.venv/\n')
  expect(gitignoreWith('', ['a', 'a', ' ', 'a/'])).toBe('a\n')
})

test('setup leaves secrets and big files out of the first commit', async () => {
  for (const f of ['.env', 'app/.env.local', 'certs/server.pem', 'k.key', '.ssh/id_rsa', 'id_ed25519']) expect(isSecretName(f)).toBe(true)
  for (const f of ['env.ts', 'id_rsa.pub', 'README.md', 'src/.envrc', 'keys.ts']) expect(isSecretName(f)).toBe(false)
  const ls = ['100644 blob aaa 12\tsrc/a.ts', `100644 blob bbb ${BIG_FILE_BYTES + 1}\tdata/big.bin`, '100644 blob ccc 5\t.env', '160000 commit ddd -\tvendor/sub', '100644 blob eee 3\tdir with space/x y.txt'].join('\0') + '\0'
  const files = parseLsTree(ls)
  expect(files.map(f => f.file)).toEqual(['src/a.ts', 'data/big.bin', '.env', 'vendor/sub', 'dir with space/x y.txt'])
  expect(files[3]!.size).toBe(null)
  const left = riskyFiles(files)
  expect(left.map(x => x.file)).toEqual(['data/big.bin', '.env'])
  expect(left[0]!.why).toContain('50 MB')
  expect(ignoreLineFor('data/big.bin')).toBe('/data/big.bin')
  expect(ignoreLineFor('a[1]*.txt')).toBe('/a\\[1\\]\\*.txt')
  const done = setupDoneText({ init: true, branch: 'main', files: 3, left, gitignore: 'made' })
  expect(done).toContain('made a git repo')
  expect(done).toContain('Initial commit (by symcc)')
  expect(done).toContain('data/big.bin')
  expect(done).toContain('no remote')
  expect(setupDoneText({ init: false, branch: 'main', files: 1, left: [], gitignore: 'kept' })).not.toContain('Warning')
})

test('/symcc-settings: no words opens the view; NAME VALUE sets one setting; bad names and values say why', () => {
  expect(parseCommand('symcc-settings', '')).toEqual({ kind: 'settings' })
  expect(parseCommand('symcc-settings', 'max_parallel 5')).toEqual({ kind: 'set', setting: 'max_parallel', input: { max_parallel: 5 } })
  expect(parseCommand('symcc-settings', 'voice off')).toEqual({ kind: 'set', setting: 'voice', input: { voice: false } })
  expect(parseCommand('symcc-settings', 'open_on_start on')).toEqual({ kind: 'set', setting: 'open_on_start', input: { open_on_start: true } })
  expect(parseCommand('symcc-settings', 'mode review')).toEqual({ kind: 'set', setting: 'mode', input: { mode: 'review' } })
  expect(parseCommand('symcc-settings', 'target_branch dev')).toEqual({ kind: 'set', setting: 'target_branch', input: { target_branch: 'dev' } })
  expect(parseCommand('symcc-settings', 'test_commands "npm test"')).toEqual({ kind: 'set', setting: 'test_commands', input: { test_commands: ['npm test'] } })
  expect(parseCommand('symcc-settings', 'test_commands npm test && npm run lint')).toEqual({ kind: 'set', setting: 'test_commands', input: { test_commands: ['npm test', 'npm run lint'] } })
  expect(parseCommand('symcc-settings', 'test_commands none')).toEqual({ kind: 'set', setting: 'test_commands', input: { test_commands: [] } })
  const bad = (args: string) => {
    const c = parseCommand('symcc-settings', args)
    return c?.kind === 'bad' ? c.message : ''
  }
  expect(bad('x 1')).toBe('There is no setting called x; settings are: test_commands, target_branch, max_parallel, max_minutes, auto_retries, open_on_start, voice, mode, enabled')
  expect(bad('max_parallel lots')).toBe('max_parallel must be a whole number, 1-8')
  expect(bad('max_parallel')).toContain('/symcc-settings max_parallel <1-8>')
  expect(bad('voice maybe')).toBe('voice must be on or off')
  expect(bad('mode later')).toBe('mode must be off, review or auto')
  expect(bad('target_branch two words')).toContain('target_branch must be one')
  expect(parseSettingValue('max_minutes', '90')).toEqual({ ok: true, input: { max_minutes: 90 } })
})

test('settings keep their limits, and a value cut to its limit says so', () => {
  const b = emptyBoard()
  const r = applySettings(b, { max_parallel: 12, max_minutes: 2, auto_retries: 4, voice: false, test_commands: [' npm test ', ''] })
  expect(r.board.max_parallel).toBe(8)
  expect(r.board.max_minutes).toBe(5)
  expect(r.board.auto_retries).toBe(4)
  expect(r.board.voice).toBe(false)
  expect(r.board.test_commands).toEqual(['npm test'])
  expect(b.max_parallel).toBe(3)
  const by = Object.fromEntries(r.changes.map(c => [c.name, c]))
  expect(settingSetText(by.max_parallel!)).toBe('max_parallel set to 8 (cut from 12 to the limit: max_parallel must be 1-8)')
  expect(settingSetText(by.max_minutes!)).toBe('max_minutes set to 5 (cut from 2 to the limit: max_minutes must be 5-600)')
  expect(settingSetText(by.auto_retries!)).toBe('auto_retries set to 4')
  expect(settingSetText(by.voice!)).toBe('voice set to off')
  expect(settingSetText(by.test_commands!)).toBe('test_commands set to npm test')
  // the lead's wording keeps its text and gets the same note
  expect(by.max_parallel!.said + by.max_parallel!.cut).toBe('up to 8 at once (cut from 12 to the limit: max_parallel must be 1-8)')
  expect(applySettings(b, { auto_retries: -3 }).changes[0]!.cut).toContain('auto_retries must be 0-10')
  expect(applySettings(b, { max_parallel: 5 }).changes[0]!.cut).toBe('')
  expect(applySettings(b, { test_commands: ['a', 'b', 'c', 'd', 'e', 'f'] }).changes[0]!.cut).toContain('only the first 5 kept')
  // wrong types are left alone
  expect(applySettings(b, { max_parallel: 'x', voice: 'no' }).changes).toEqual([])
})

test('every setting has a row: value, default, range and meaning', () => {
  expect(SETTINGS.map(s => s.name)).toEqual(['test_commands', 'target_branch', 'max_parallel', 'max_minutes', 'auto_retries', 'open_on_start', 'voice', 'mode', 'enabled'])
  const b = { ...emptyBoard('main'), test_commands: ['npm test', 'npm run lint'], voice: false }
  expect(settingValue(b, 'test_commands')).toBe('npm test && npm run lint')
  expect(settingValue(b, 'voice')).toBe('off')
  expect(settingValue(b, 'open_on_start')).toBe('on')
  expect(settingValue(b, 'mode')).toBe('auto')
  expect(settingValue({}, 'max_parallel')).toBe('3')
  const text = settingsText(b, 'crew')
  expect(text).toContain('max_parallel')
  expect(text).toMatch(/max_parallel\s+3  \(default 3 · 1-8\) how many workers run at once/)
  expect(text).toContain('/crew-settings max_parallel 5')
})

test('a role file: front matter gives the model, skills and description; the body is its checklist', async () => {
  const r = parseRole('tests', '---\nmodel: sonnet   # optional\nskills: [code-review, "testing"]\ndescription: writes tests\n---\n- cover error paths\n')
  expect(r).toEqual({ name: 'tests', description: 'writes tests', model: 'sonnet', skills: ['code-review', 'testing'], prompt: '- cover error paths' })
  expect(parseRole('docs', '---\ndescription: docs\nskills: a, b\n---\n')?.skills).toEqual(['a', 'b'])
  expect(parseRole('general', '---\ndescription: plain\n---\n')).toEqual({ name: 'general', description: 'plain', skills: [], prompt: '' })
  // bad files are skipped: no front matter, no description, a bad name
  expect(parseRole('x', 'just text')).toBe(null)
  expect(parseRole('x', '---\nmodel: haiku\n---\nbody')).toBe(null)
  expect(parseRole('bad name', '---\ndescription: d\n---\n')).toBe(null)
})

test('a project role overrides a built-in one with the same name and adds new ones', async () => {
  const built = [parseRole('general', '---\ndescription: plain\n---\n')!, parseRole('tests', '---\ndescription: built-in tests\n---\nA')!]
  const project = [parseRole('Tests', '---\ndescription: our tests\n---\nB')!, parseRole('mobile', '---\ndescription: phone apps\n---\nC')!]
  const all = mergeRoles(built, project)
  expect(all.map(r => r.name)).toEqual(['general', 'mobile', 'Tests'])
  expect(findRole(all, 'tests')?.prompt).toBe('B')
  expect(rolesLeadText(all)).toContain('mobile (phone apps)')
})

test('an unknown role is refused with the list of roles; a missing role means general', async () => {
  const all = mergeRoles([parseRole('general', '---\ndescription: plain\n---\n')!, parseRole('docs', '---\ndescription: d\n---\nx')!], [])
  expect(() => checkRole(all, 'design')).toThrow('unknown role "design"; the roles are: general, docs')
  expect(checkRole(all, 'DOCS')).toBe('docs')
  const [b, t] = addTask(emptyBoard(), { origin: W, title: 'x' }, T)
  expect(roleOf(t)).toBe('general')
  expect(findRole(all, t.role)?.name).toBe('general')
  expect(tryLabel({ ...t, attempts: 2 })).toBe('try 2')
  const b2 = patchTask(b, t.id, { role: 'docs' }, T)
  const t2 = parseBoard(JSON.stringify(b2)).tasks[0]!
  expect(t2.role).toBe('docs')
  expect(tryLabel({ ...t2, attempts: 2 })).toBe('try 2 (role docs)')
  expect(boardText(b2)).toContain('x [docs]')
  expect(patchTask(b2, t.id, { role: 'general' }, T).tasks[0]!.role).toBe(undefined)
})

test('the worker prompt gets the role section; general adds nothing', async () => {
  const r = parseRole('tests', '---\nskills: [code-review]\ndescription: writes tests\n---\n- no sleeps or real network\n')!
  const s = roleSection(r)
  expect(s).toContain('Your role: tests')
  expect(s).toContain('- no sleeps or real network')
  expect(s).toContain('Use these skills if they are available: code-review.')
  expect(roleSection(parseRole('general', '---\ndescription: plain\n---\n')!)).toBe('')
  expect(roleSection(undefined)).toBe('')
})

test('a skipped role file says why, in a note for the owner and the lead', async () => {
  expect(roleSkipReason('x', '---\nmodel: haiku\n---\nbody')).toBe('no description')
  expect(roleSkipReason('x', 'just text')).toMatch(/^no front matter/)
  expect(roleSkipReason('bad name', '---\ndescription: d\n---\n')).toMatch(/^bad name "bad name"/)
  expect(roleSkipReason('ok', '---\ndescription: d\n---\n')).toBe(null)
  expect(skippedRoleNote('.symcc/roles/x.md', 'no description')).toBe('symcc: skipped .symcc/roles/x.md: no description')
  expect(skippedRoleNote('.crew/roles/x.md', 'no description', 'crew')).toBe('crew: skipped .crew/roles/x.md: no description')
})

test('the role mark: the role name, nothing for general; the open task\'s role line has the description and model', async () => {
  expect(roleMark({})).toBe('')
  expect(roleMark({ role: 'general' })).toBe('')
  expect(roleMark({ role: 'tests' })).toBe('tests')
  const all = mergeRoles([parseRole('general', '---\ndescription: plain\n---\n')!, parseRole('tests', '---\ndescription: writes tests\nmodel: sonnet\n---\n')!], [])
  expect(roleLine({ role: 'tests' }, all)).toBe('Role: tests — writes tests · model sonnet')
  expect(roleLine({}, all)).toBe('Role: general — plain')
  expect(roleLine({ role: 'gone' }, all)).toBe('Role: gone')
  expect(roleChoices(all)).toEqual(['general', 'tests'])
  expect(roleChoices([])).toEqual(['general'])
  // the text board keeps the short mark
  const [b] = addTask(emptyBoard(), { origin: W, title: 'Cover the parser errors', role: 'tests' }, T)
  expect(boardText(b)).toContain('Cover the parser errors [tests]')
  const [b2] = addTask(emptyBoard(), { origin: W, title: 'Plain', role: 'general' }, T)
  expect(boardText(b2)).not.toContain('[general]')
})

test('the built-in roles are general, docs, refactor, security and tester', async () => {
  expect([...BUILT_IN_ROLES]).toEqual(['general', 'docs', 'refactor', 'security', 'tester'])
  for (const old of ['tests', 'backend', 'frontend']) expect(BUILT_IN_ROLES).not.toContain(old)
  expect(Object.values(OLD_ROLES).every(r => BUILT_IN_ROLES.includes(r))).toBe(true)
})

test('a task with an old role keeps its name until it starts; then tests runs as tester, backend and frontend as general', async () => {
  const built = ['general', 'docs', 'refactor', 'security', 'tester'].map(n => parseRole(n, '---\ndescription: d\n---\n')!)
  expect(OLD_ROLES).toEqual({ tests: 'tester', backend: 'general', frontend: 'general' })
  expect(roleMark({ role: 'frontend' })).toBe('frontend')
  expect(roleLine({ role: 'backend' }, built)).toBe('Role: backend')
  expect(oldRoleSwap({ role: 'tests' }, built)).toEqual({ role: 'tester', line: 'role tests is no longer built in; runs as tester' })
  expect(oldRoleSwap({ role: 'backend' }, built)).toEqual({ role: 'general', line: 'role backend is no longer built in; runs as general' })
  expect(oldRoleSwap({ role: 'frontend' }, built)?.role).toBe('general')
  expect(oldRoleSwap({ role: 'tester' }, built)).toBe(null)
  expect(oldRoleSwap({}, built)).toBe(null)
  // A started task gets the new role and a history line; general is stored as no role.
  const [b0, t] = addTask(emptyBoard(), { origin: W, title: 'Old', role: 'frontend' }, '2026-01-01T00:00:00Z')
  const swap = oldRoleSwap(t, built)!
  const b1 = patchTask(b0, t.id, { status: 'doing', role: swap.role, history: [...t.history, swap.line] }, '2026-01-01T00:01:00Z')
  expect(b1.tasks.find(x => x.id === t.id)?.role).toBeUndefined()
  expect(b1.tasks.find(x => x.id === t.id)?.history.at(-1)).toBe('role frontend is no longer built in; runs as general')
})

test('a project role file still adds or overrides a role, also bringing an old one back', async () => {
  const built = ['general', 'tester'].map(n => parseRole(n, '---\ndescription: built in\n---\n')!)
  const all = mergeRoles(built, [parseRole('frontend', '---\ndescription: our web pages\n---\nF')!, parseRole('tester', '---\ndescription: our tests\n---\nT')!])
  expect(all.map(r => r.name)).toEqual(['general', 'frontend', 'tester'])
  expect(findRole(all, 'tester')?.prompt).toBe('T')
  expect(oldRoleSwap({ role: 'frontend' }, all)).toBe(null)
  expect(checkRole(all, 'frontend')).toBe('frontend')
})

test('the lead is told: one task, one role; split big work by role and link the parts with after', async () => {
  const text = rolesLeadText([parseRole('general', '---\ndescription: plain\n---\n')!])
  expect(text).toContain('One task, one role.')
  expect(text).toContain('split it into one task per role and link them with after')
  expect(text).toContain('each extra task costs a worker run, a test run and a merge')
})

test('after merge: only done tasks lose their branch, and only the plugin\'s merged branches', async () => {
  const tasks = [
    { id: 'T-1', status: 'done' as const },
    { id: 'T-2', status: 'done' as const, branch: 'feature/x' },
    { id: 'T-3', status: 'dropped' as const },
    { id: 'T-4', status: 'review' as const },
    { id: 'T-5', status: 'done' as const },
    { id: 'T-6', status: 'failed' as const },
    { id: 'T-7', status: 'todo' as const },
  ]
  const merged = ['main', '  symcc/T-1', 'feature/x', 'symcc/T-3', 'symcc/T-4', 'symcc/T-6', 'symcc/T-7', '']
  // T-5 is done but not listed as merged; T-2's branch lacks the prefix; the rest are not done.
  expect(branchesToDelete(tasks, merged, 'symcc/')).toEqual(['symcc/T-1'])
  expect(branchesToDelete(tasks, merged, '')).toEqual([])
  for (const s of ['todo', 'doing', 'review', 'failed', 'paused', 'backlog', 'waiting', 'dropped'] as const)
    expect(branchesToDelete([{ id: 'T-9', status: s }], ['symcc/T-9'], 'symcc/')).toEqual([])
})

test('leftover worktrees of done and dropped tasks may be removed, others are kept', async () => {
  const tasks = [
    { id: 'T-1', status: 'done' as const },
    { id: 'T-2', status: 'dropped' as const },
    { id: 'T-3', status: 'review' as const },
    { id: 'T-4', status: 'doing' as const },
    { id: 'T-5', status: 'done' as const },
  ]
  expect(worktreesToRemove(tasks, ['T-1', 'T-2', 'T-3', 'T-4'])).toEqual(['T-1', 'T-2'])
  expect(cleanupText(57, 2)).toBe('Cleaned up 57 merged task branches and 2 leftover task folders.')
  expect(cleanupText(1, 1)).toBe('')
})

test('leftover temp files: old ones that match are chosen', () => {
  const now = 1_000_000_000
  const old = now - LOCK_STALE_MS - 1
  expect(leftoverTmpFiles([
    { name: 'board.lock.abc-123_x9.tmp', mtimeMs: old },
    { name: 'lead.json.session-1.tmp', mtimeMs: old },
  ], now)).toEqual(['board.lock.abc-123_x9.tmp', 'lead.json.session-1.tmp'])
})

test('leftover temp files: fresh ones, or ones with no or future time, are kept', () => {
  const now = 1_000_000_000
  expect(leftoverTmpFiles([
    { name: 'board.lock.abc.tmp', mtimeMs: now - 1_000 },
    { name: 'lead.json.abc.tmp', mtimeMs: now - LOCK_STALE_MS },
    { name: 'lead.json.def.tmp' },
    { name: 'board.lock.ghi.tmp', mtimeMs: NaN },
    { name: 'board.lock.jkl.tmp', mtimeMs: now + 60_000 },
  ], now)).toEqual([])
  expect(leftoverTmpFiles([{ name: 'lead.json.a.tmp', mtimeMs: now - 10 }], now, 5)).toEqual(['lead.json.a.tmp'])
})

test('leftover temp files: other names are never chosen', () => {
  const now = 1_000_000_000
  const old = now - 10 * LOCK_STALE_MS
  const names = ['board.json', 'lead.json', 'board.lock', 'board.json.tmp', 'board.lock..tmp', 'lead.json.tmp', 'other.abc.tmp', 'board.lock.a/b.tmp', 'xboard.lock.a.tmp', 'board.lock.a.tmp.bak', 'scouts']
  expect(leftoverTmpFiles(names.map(name => ({ name, mtimeMs: old })), now)).toEqual([])
  expect(leftoverTmpFiles(null as unknown as [], now)).toEqual([])
})

test('normId: t3, T-003, spaces and lower case all become T-3', () => {
  expect(normId('t3')).toBe('T-3')
  expect(normId('T3')).toBe('T-3')
  expect(normId('t-3')).toBe('T-3')
  expect(normId('T-003')).toBe('T-3')
  expect(normId(' T-3 ')).toBe('T-3')
  expect(normId('T-0')).toBe('T-0')
  expect(normId('T-000')).toBe('T-0')
})

test('normId: a bare number, with spaces or leading zeros, becomes T-<n>', () => {
  expect(normId('3')).toBe('T-3')
  expect(normId(' 3 ')).toBe('T-3')
  expect(normId('003')).toBe('T-3')
  expect(normId('0')).toBe('T-0')
  expect(normId('-3')).toBe('-3')
  expect(normId('3.5')).toBe('3.5')
})

test('addTask: after ["3"] keeps the dependency on T-3; unknown ids are still dropped', () => {
  let b = emptyBoard()
  for (const title of ['a', 'b', 'c']) b = addTask(b, { origin: W, title }, '2026-11-12T00:00:00Z', '.symcc')[0]
  const [, t] = addTask(b, { origin: W, title: 'd', after: ['3', ' 001 ', '99', 'nope'] }, '2026-11-12T00:00:00Z', '.symcc')
  expect(t.after).toEqual(['T-3', 'T-1'])
})

test('parseCommand: slash commands still want a T-id, a bare number is not taken', () => {
  expect(parseCommand('symcc-task', '3')!.kind).toBe('bad')
})

test('normId: garbage or empty input is only trimmed, not turned into an id', () => {
  expect(normId(' abc ')).toBe('abc')
  expect(normId('T--3')).toBe('T--3')
  expect(normId('T-3a')).toBe('T-3a')
  expect(normId('T-3.5')).toBe('T-3.5')
  expect(normId('')).toBe('')
  expect(normId(undefined as unknown as string)).toBe('')
})

test('dayOf: midnight edges in UTC', () => {
  const midnight = Date.UTC(2026, 10, 10)
  expect(dayOf(midnight, 0)).toBe('2026-11-10')
  expect(dayOf(midnight - 1, 0)).toBe('2026-11-09')
})

test('dayOf: a positive offset moves late evening UTC into the next day', () => {
  const late = Date.UTC(2026, 10, 9, 23, 30)
  expect(dayOf(late, 0)).toBe('2026-11-09')
  expect(dayOf(late, 29)).toBe('2026-11-09')
  expect(dayOf(late, 30)).toBe('2026-11-10')
  expect(dayOf(Date.UTC(2026, 10, 9, 10), 14 * 60)).toBe('2026-11-10')
})

test('dayOf: a negative offset moves early morning UTC back to the day before, across a year end', () => {
  const early = Date.UTC(2026, 10, 10, 0, 30)
  expect(dayOf(early, -30)).toBe('2026-11-10')
  expect(dayOf(early, -31)).toBe('2026-11-09')
  expect(dayOf(Date.UTC(2027, 0, 1), -1)).toBe('2026-12-31')
  expect(dayOf(Date.UTC(2026, 10, 9, 11), -12 * 60)).toBe('2026-11-08')
})

test('dayOf: a time that is not a number gives an empty day', () => {
  expect(dayOf(NaN, 0)).toBe('')
  expect(dayOf(Infinity, 60)).toBe('')
  expect(dayOf(Date.parse('not a date'), 0)).toBe('')
})

test('isNothing: empty, missing or NOTHING (any case, with an optional dot) means nothing', () => {
  expect(isNothing(undefined)).toBe(true)
  expect(isNothing('')).toBe(true)
  expect(isNothing('  \n ')).toBe(true)
  expect(isNothing('NOTHING')).toBe(true)
  expect(isNothing(' nothing. ')).toBe(true)
})

test('isNothing: any real text, even with NOTHING in it, is something', () => {
  expect(isNothing('NOTHING..')).toBe(false)
  expect(isNothing('Nothing found')).toBe(false)
  expect(isNothing('found a bug')).toBe(false)
})

test('agentSafeName: odd characters become dashes, and leading or trailing dashes go', () => {
  expect(agentSafeName('symcc T-3')).toBe('symcc-T-3')
  expect(agentSafeName('a.b/c')).toBe('a-b-c')
  expect(agentSafeName('--_x')).toBe('x')
  expect(agentSafeName('x!!')).toBe('x')
  expect(agentSafeName('x_')).toBe('x_')
})

test('agentSafeName: empty or all-odd input gives "agent"', () => {
  expect(agentSafeName('')).toBe('agent')
  expect(agentSafeName('!!!')).toBe('agent')
  expect(agentSafeName(undefined as unknown as string)).toBe('agent')
})

test('agentSafeName: long names are cut to 64 characters, without a dash at the end', () => {
  expect(agentSafeName('a'.repeat(100))).toBe('a'.repeat(64))
  expect(agentSafeName('a'.repeat(63) + '-b')).toBe('a'.repeat(63))
})

test('runMs: a finished try lasts from start to end', () => {
  expect(runMs({ started: '2026-11-09T00:00:00.000Z', ended: '2026-11-09T00:01:30.000Z' })).toBe(90_000)
})

test('runMs: an unfinished try counts up to now, or 0 when now is not given', () => {
  const r = { started: '2026-11-09T00:00:00.000Z' }
  expect(runMs(r, Date.parse('2026-11-09T00:00:05.000Z'))).toBe(5_000)
  expect(runMs(r)).toBe(0)
  expect(runMs({ ...r, ended: '' }, Date.parse('2026-11-09T00:00:02.000Z'))).toBe(2_000)
})

test('runMs: bad times or an end before the start give 0', () => {
  expect(runMs({ started: 'bad', ended: '2026-11-09T00:00:01.000Z' })).toBe(0)
  expect(runMs({ started: '2026-11-09T00:00:00.000Z', ended: 'bad' })).toBe(0)
  expect(runMs({ started: '2026-11-09T00:00:10.000Z', ended: '2026-11-09T00:00:00.000Z' })).toBe(0)
  expect(runMs({ started: '2026-11-09T00:00:00.000Z' }, NaN)).toBe(0)
})

test('a new task keeps where it came from, and its first history line says who and why', () => {
  const [b1, a] = addTask(emptyBoard(), { title: 'Search', origin: { by: 'owner', request: 'add a search command that finds tasks by word', why: 'the owner asked for search' } }, T)
  expect(a.origin).toEqual({ by: 'owner', request: 'add a search command that finds tasks by word', why: 'the owner asked for search', at: T })
  expect(a.history[0]).toBe('created by the owner because the owner asked for search')
  const [b2, s] = addTask(b1, { title: 'Fix crash', origin: { by: 'scout', scout: 'bugs', why: 'the bugs scout found a crash', evidence: 'scout bugs report at 2026-11-09 00:00 UTC' } }, T)
  expect(s.origin).toMatchObject({ by: 'scout', scout: 'bugs', evidence: 'scout bugs report at 2026-11-09 00:00 UTC' })
  expect(s.history[0]).toBe('created by scout bugs because the bugs scout found a crash')
  const [b3, w] = addTask(b2, { title: 'Half of search', origin: { by: 'lead', task: 't1', how: 'split', why: 'search was too big' } }, T)
  expect(w.origin).toMatchObject({ by: 'lead', task: 'T-1', how: 'split' })
  // it survives a save and load, and a change keeps it even when a patch tries to replace it
  const back = parseBoard(JSON.stringify(b3))
  expect(back.tasks[0]!.origin).toEqual(a.origin)
  const changed = patchTask(back, a.id, { title: 'Search v2', origin: { by: 'lead', why: 'other', at: T } }, '2026-11-10T00:00:00.000Z')
  expect(changed.tasks[0]!.origin).toEqual(a.origin)
  expect(changed.tasks[0]!.history[0]).toBe('created by the owner because the owner asked for search')
})

test('a task without a why, or with a wrong origin, is refused with a clear error', () => {
  const b = emptyBoard()
  expect(() => addTask(b, { title: 'x' }, T)).toThrow('needs a "why"')
  expect(() => addTask(b, { title: 'x', origin: { why: '   ' } }, T)).toThrow('needs a "why"')
  expect(() => addTask(b, { title: 'x', origin: { by: 'boss', why: 'y' } }, T)).toThrow('origin_by must be one of owner, scout, worker, lead')
  expect(() => addTask(b, { title: 'x', origin: { by: 'scout', why: 'y' } }, T)).toThrow('name the scout')
  expect(() => addTask(b, { title: 'x', origin: { by: 'worker', why: 'y' } }, T)).toThrow('from_task')
  expect(() => addTask(b, { title: 'x', origin: { by: 'lead', task: 'T-9', why: 'y' } }, T)).toThrow('T-9 is not on the board')
  expect(() => addTask(b, { title: 'x', origin: { how: 'split', why: 'y' } }, T)).toThrow('needs the task it comes from')
  expect(b.tasks.length).toBe(0)
  // without origin_by it is worked out from what was given
  expect(makeOrigin({ why: 'y' }, T).by).toBe('lead')
  expect(makeOrigin({ why: 'y', request: 'please' }, T).by).toBe('owner')
  expect(makeOrigin({ why: 'y', scout: 'docs' }, T).by).toBe('scout')
})

test('old boards whose tasks have no origin still load, and show "unknown"', () => {
  const old = { version: 1, next_id: 2, mode: 'auto', test_commands: [], target_branch: 'main', max_parallel: 3, max_minutes: 45, auto_retries: 2, tasks: [
    { id: 'T-1', title: 'A', details: 'A', files: [], status: 'todo', note: '', question: null, order: 1, after: [], attempts: 0, history: [], branch: null, created_at: T, updated_at: T },
  ] }
  const b = parseBoard(JSON.stringify(old))
  expect(b.tasks[0]!.origin).toBeUndefined()
  expect(fromText(b.tasks[0]!)).toBe('from: unknown')
  expect(originWho(b.tasks[0]!)).toBe('unknown')
  expect(fromText({ origin: { by: 'nobody' } })).toBe('from: unknown')
  expect(boardText(b)).toContain('from: unknown')
  // a change on an old task does not invent an origin
  expect(patchTask(b, 'T-1', { title: 'B' }, T).tasks[0]!.origin).toBeUndefined()
  const [b2, t] = addTask(b, { title: 'C', after: ['T-1'], origin: { from: 'x', why: 'follow up', task: 'T-1', how: 'follow-up' } as never }, T)
  expect(t.origin?.task).toBe('T-1')
  expect(b2.tasks.length).toBe(2)
})

test('the "from:" text is short: the owner\'s words, the scout, or the task it came from', () => {
  const o = (x: Record<string, unknown>) => ({ origin: makeOrigin(x, T) })
  expect(fromText(o({ by: 'owner', request: 'add a search command', why: 'w' }))).toBe('from: owner — “add a search command”')
  expect(fromText(o({ by: 'owner', request: 'add a search command that also looks in the details of every task and the history', why: 'w' }))).toBe('from: owner — “add a search command that also looks in the details of ever…”')
  expect(fromText(o({ by: 'owner', why: 'w' }))).toBe('from: owner')
  expect(fromText(o({ by: 'scout', scout: 'bugs', why: 'w' }))).toBe('from: scout bugs')
  const b = addTask(emptyBoard(), { title: 'big', origin: W }, T)[0]
  const t = (x: Record<string, unknown>) => ({ origin: makeOrigin(x, T, b) })
  expect(fromText(t({ by: 'lead', task: 'T-1', how: 'split', why: 'w' }))).toBe('from: T-1 (split)')
  expect(fromText(t({ by: 'worker', task: 'T-1', why: 'w' }))).toBe('from: T-1 (worker report)')
  expect(fromText(t({ by: 'worker', task: 'T-1', how: 'follow-up', why: 'w' }))).toBe('from: T-1 (follow-up)')
  expect(fromText(t({ by: 'lead', task: 'T-1', why: 'w' }))).toBe('from: lead, about T-1')
  expect(fromText(t({ by: 'lead', why: 'w' }))).toBe('from: lead')
  expect(createdLine(makeOrigin({ by: 'worker', task: 'T-1', why: 'tests were missing' }, T, b))).toBe('created by the worker of T-1 because tests were missing')
  const [b2] = addTask(b, { title: 'small', origin: { by: 'scout', scout: 'bugs', why: 'w' } }, T)
  const lines = boardText(b2).split('\n')
  expect(lines[lines.findIndex(l => l.startsWith('T-2 ')) + 1]!.trim()).toBe('from: scout bugs')
})

test('the plugin links a new task to what it saw itself: the owner prompt or the report', () => {
  const h = emptyHeard()
  expect(evidenceText({ by: 'owner', request: 'x' }, h)).toBe('no owner prompt was seen by the plugin in this session')
  expect(evidenceText({ by: 'scout', scout: 'bugs' }, h)).toBe('no report from scout bugs reached the lead in this session')
  expect(evidenceText({ by: 'worker', task: 'T-3' }, h)).toBe('no worker report from T-3 reached the lead in this session')
  expect(evidenceText({ by: 'lead' }, h)).toBe('nothing from the owner, a scout or a worker was seen in this session')
  h.owner = { text: 'Please  add a search\ncommand, thanks', at: '2026-11-12T14:05:09.000Z' }
  h.scouts.bugs = '2026-11-12T14:00:00.000Z'
  h.workers['T-3'] = '2026-11-12T13:00:00.000Z'
  h.last = { what: 'scout bugs report', at: '2026-11-12T14:00:00.000Z' }
  expect(evidenceText({ by: 'owner', request: 'add a search command' }, h)).toBe('last owner prompt at 2026-11-12 14:05 UTC: “Please add a search command, thanks”')
  expect(evidenceText({ by: 'owner', request: 'make it blue' }, h)).toContain('(the quoted request is not word for word in it)')
  expect(evidenceText({ by: 'scout', scout: 'bugs' }, h)).toBe('scout bugs report at 2026-11-12 14:00 UTC')
  expect(evidenceText({ by: 'worker', task: 't3' }, h)).toBe('T-3 worker report at 2026-11-12 13:00 UTC')
  expect(evidenceText({ by: 'lead' }, h)).toBe('last owner prompt at 2026-11-12 14:05 UTC: “Please add a search command, thanks”; last report: scout bugs report at 2026-11-12 14:00 UTC')
  expect(utcTime('soon')).toBe('soon')
})

test('wrapSegs breaks between words within the width and keeps every word', () => {
  const out = wrapSegs([{ text: 'one two three ', color: 'text' }, { text: 'four five', color: 'subtle' }], 9)
  expect(out.map(l => l.map(s => s.text).join(''))).toEqual(['one two', 'three', 'four five'])
  expect(wrapSegs([{ text: 'abcdefghij', color: 'text' }], 4).map(l => l.map(s => s.text).join(''))).toEqual(['abcd', 'efgh', 'ij'])
  expect(wrapSegs([], 10)).toEqual([[]])
})

test('scout memory: last run and report survive a save and load', async () => {
  const text = scoutMemoryText([
    { name: 'recent-changes', last_run: T, last_report: 'found T-1' },
    { name: 'docs', last_run: T },
    { name: 'never', last_run: null },
    { name: 'gone', last_run: T, last_report: 'old' },
  ], ['recent-changes', 'docs', 'never'])
  const m = parseScoutMemory(text)
  expect(m).toEqual({ 'recent-changes': { last_run: T, last_report: 'found T-1' }, docs: { last_run: T } })
  expect(parseScoutMemory(scoutMemoryText([{ name: 'a', last_run: T, last_report: 'x'.repeat(SCOUT_REPORT_CHARS + 50) }])).a!.last_report!.length).toBe(SCOUT_REPORT_CHARS)
})

test('scout memory: a missing file means no scout has run yet', async () => {
  expect(parseScoutMemory(null)).toEqual({})
  expect(parseScoutMemory(undefined)).toEqual({})
  expect(parseScoutMemory('')).toEqual({})
})

test('scout memory: a broken file is treated as never run, bad entries are skipped', async () => {
  expect(parseScoutMemory('{"scouts": {')).toEqual({})
  expect(parseScoutMemory('[1,2]')).toEqual({})
  expect(parseScoutMemory('{"scouts": []}')).toEqual({})
  expect(parseScoutMemory('null')).toEqual({})
  expect(parseScoutMemory(JSON.stringify({ scouts: { a: 5, b: { last_run: 'not a date' }, c: { last_run: 7, last_report: 'r' }, d: { last_run: T } } }))).toEqual({ c: { last_run: null, last_report: 'r' }, d: { last_run: T } })
})

test('a hand-broken task origin does not break the board or the task page', () => {
  for (const origin of [
    { by: 'owner', why: 5, request: 7 },
    { by: 'owner', why: null, request: null, scout: null, task: null, how: null, evidence: null, at: null },
    { by: 'scout', scout: 3, task: {}, how: 'nope', evidence: [1], why: 'real' },
  ]) {
    const [b0, t0] = addTask(emptyBoard(), { origin: W, title: 'broken' }, T)
    const t = { ...t0, origin } as unknown as SymccTask
    const b = { ...b0, tasks: [t] }
    expect(boardText(b)).toContain('broken')
    expect(() => fromText(t)).not.toThrow()
    expect(() => originWho(t)).not.toThrow()
    const rows = detailRows(t, { roles: [], all: [t], when: s => s, nowMs: 0 })
    expect(rows.some(r => r.label === 'From')).toBe(true)
    expect(rows.some(r => r.label === 'Request')).toBe(false)
  }
  const ok = { ...addTask(emptyBoard(), { origin: W, title: 'x' }, T)[1], origin: { by: 'owner', why: 'w', request: 'add search', at: T } } as unknown as SymccTask
  expect(fromText(ok)).toContain('add search')
  expect(fromText({ origin: { by: 'scout', scout: 9, why: 'w' } })).toBe('from: scout ?')
})

// ---------------- the commits of a task (T-85) ----------------
import { commitMessage, originTag, trailerPrefix, oneLine, isSha, addCommits, cleanCommitFields, taskCommits, find, commitText, shortSha, WHY_TRAILER_CHARS } from '../hooks/board'

const SHA1 = 'a'.repeat(40)
const SHA2 = 'b'.repeat(40)
const SHA3 = 'c'.repeat(40)

test('a commit message keeps "T-x: title" first, then a blank line and the Symcc trailers', () => {
  const [, t] = addTask(emptyBoard(), { title: 'Add search', origin: { by: 'owner', why: 'people cannot find things', request: 'add search' } }, T)
  const msg = commitMessage({ ...t, attempts: 2 })
  expect(msg).toBe('T-1: Add search\n\nSymcc-Task: T-1\nSymcc-From: owner\nSymcc-Why: people cannot find things\nSymcc-Try: 2\n')
  const merge = commitMessage({ ...t, attempts: 2 }, { subject: 'T-1: bring up to date with main' })
  expect(merge.split('\n')[0]).toBe('T-1: bring up to date with main')
  expect(merge).toContain('Symcc-Try: 2')
})

test('commit message trailers survive odd characters: line breaks, control characters, long why', () => {
  const t = { id: 'T-7', title: 'Fix\nthe\r\nthing\u0000 now', attempts: 1, origin: { by: 'lead', why: `line one\nSymcc-Task: T-999\n\n${'x'.repeat(500)}`, at: T } }
  const msg = commitMessage(t)
  const lines = msg.trimEnd().split('\n')
  expect(lines[0]).toBe('T-7: Fix the thing now')
  expect(lines[1]).toBe('')
  // exactly four trailer lines, each "Key: value", none injected from the why
  expect(lines.slice(2).length).toBe(4)
  for (const l of lines.slice(2)) expect(l).toMatch(/^Symcc-(Task|From|Why|Try): \S/)
  const why = lines.find(l => l.startsWith('Symcc-Why: '))!.slice('Symcc-Why: '.length)
  expect(why.length).toBeLessThanOrEqual(WHY_TRAILER_CHARS)
  expect(why.startsWith('line one Symcc-Task: T-999 xxx')).toBe(true)
  expect(why.endsWith('…')).toBe(true)
  expect(oneLine('a b\tc', 10)).toBe('a b c')
})

test('a commit message for a task with no (or a broken) origin says unknown and leaves out Why', () => {
  for (const origin of [undefined, null, 'x', { by: 'alien', why: 'w' }]) {
    const msg = commitMessage({ id: 'T-2', title: 'Old', attempts: 0, origin } as never)
    expect(msg).toContain('Symcc-From: unknown')
    expect(msg).not.toContain('Symcc-Why')
    expect(msg).not.toContain('Symcc-Try') // no try number known
  }
})

test('Symcc-From names the owner, a scout, a split, a worker report or the lead', () => {
  expect(originTag({ origin: { by: 'owner', why: 'w' } })).toBe('owner')
  expect(originTag({ origin: { by: 'scout', scout: 'bugs\nmore', why: 'w' } })).toBe('scout bugs more')
  expect(originTag({ origin: { by: 'lead', task: 'T-12', how: 'split', why: 'w' } })).toBe('T-12 (split)')
  expect(originTag({ origin: { by: 'worker', task: 'T-3', why: 'w' } })).toBe('T-3 (worker report)')
  expect(originTag({ origin: { by: 'lead', why: 'w' } })).toBe('lead')
  expect(originTag({})).toBe('unknown')
  expect(trailerPrefix('symcc')).toBe('Symcc')
  expect(trailerPrefix('my team!')).toBe('Myteam')
  expect(trailerPrefix('')).toBe('Symcc')
})

test('run.commits and merged are saved on the task and kept through a board save and load', () => {
  let [b, t] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
  b = patchTask(b, t.id, { status: 'doing', attempts: 1, runs: startRun(undefined, T) }, T)
  b = patchTask(b, t.id, { runs: addCommits(find(b, t.id)!.runs, [SHA1, SHA2, SHA1, 'not-a-sha']) }, T)
  b = patchTask(b, t.id, { status: 'done', merged: SHA2 }, T)
  const back = parseBoard(JSON.stringify(b)).tasks[0]!
  expect(back.runs![0]!.commits).toEqual([SHA1, SHA2])
  expect(back.merged).toBe(SHA2)
  // a second try adds to its own run only
  const runs = addCommits(startRun(back.runs, T), [SHA3])
  expect(runs.map(r => r.commits)).toEqual([[SHA1, SHA2], [SHA3]])
  expect(addCommits(undefined, [SHA1])).toEqual([])
  expect(addCommits(back.runs, [])).toEqual(back.runs!)
})

test('old boards without commits still load, and broken commit fields are dropped, not fatal', () => {
  const old = { version: 1, next_id: 2, tasks: [{ id: 'T-1', title: 'old', details: '', files: [], status: 'done', note: 'merged into main (47d4b71c)', question: null, order: 1, after: [], attempts: 1, history: [], runs: [{ started: T, ended: T }], branch: null, created_at: T, updated_at: T }] }
  const t = parseBoard(JSON.stringify(old)).tasks[0]!
  expect(t.runs).toEqual([{ started: T, ended: T }])
  expect('merged' in t).toBe(false)
  expect(taskCommits(t)).toEqual([])
  const broken = { ...old, tasks: [{ ...old.tasks[0], merged: 42, runs: [{ started: T, commits: 'abc' }, { started: T, commits: [SHA1, 7, 'zz'] }, null] }] }
  const bt = parseBoard(JSON.stringify(broken)).tasks[0]!
  expect('merged' in bt).toBe(false)
  expect(bt.runs).toEqual([{ started: T }, { started: T, commits: [SHA1] }])
  expect(() => detailRows(bt, { roles: [], all: [bt], when: s => s, nowMs: 0 })).not.toThrow()
  expect(cleanCommitFields({ merged: SHA1 })).toEqual({ merged: SHA1 })
  expect(isSha(SHA1)).toBe(true)
  expect(isSha('A'.repeat(40))).toBe(false)
  expect(isSha('a'.repeat(64))).toBe(true)
})

test('a task lists its commits newest first with the merged one marked', () => {
  const t = { runs: [{ started: T, commits: [SHA1] }, { started: T, commits: [SHA2, SHA3] }], merged: SHA3 }
  expect(taskCommits(t).map(commitText)).toEqual(['cccccccc (try 2, merged)', 'bbbbbbbb (try 2)', 'aaaaaaaa (try 1)'])
  // merged but no try recorded it (e.g. a task from before tries were kept)
  expect(taskCommits({ merged: SHA1 }).map(commitText)).toEqual(['aaaaaaaa (merged)'])
  expect(shortSha(SHA1)).toBe('aaaaaaaa')
  const [, base] = addTask(emptyBoard(), { origin: W, title: 'x' }, T)
  const rows = detailRows({ ...base, ...t }, { roles: [], all: [], when: s => s, nowMs: 0 })
  const row = rows.find(r => r.label === 'Commits')!
  expect(row.segs.map(s => s.text).join('')).toBe('cccccccc (merged), bbbbbbbb (try 2), aaaaaaaa (try 1)')
  expect(row.segs.find(s => s.text === 'cccccccc')!.color).toBe('success')
  expect(rows.findIndex(r => r.label === 'Commits')).toBe(rows.findIndex(r => r.label === 'Tries') - 1)
  expect(detailRows(base, { roles: [], all: [], when: s => s, nowMs: 0 }).some(r => r.label === 'Commits')).toBe(false)
})

import { symccOn, setEnabled, offAnswer, offStatusLine } from '../hooks/board'

test('symcc is on for old boards and new ones, and off only when the board says so', () => {
  expect(symccOn(parseBoard(JSON.stringify({ tasks: [] })))).toBe(true)
  expect(symccOn(parseBoard(null))).toBe(true)
  expect(symccOn(emptyBoard())).toBe(true)
  const off = parseBoard(JSON.stringify({ tasks: [], mode: 'review', enabled: false }))
  expect(symccOn(off)).toBe(false)
  // turning it on keeps the mode and the tasks
  const b = setEnabled({ ...off, tasks: [] }, true)
  expect(symccOn(b)).toBe(true)
  expect(b.mode).toBe('review')
  expect(settingValue(off, 'enabled')).toBe('off')
  expect(settingValue(b, 'enabled')).toBe('on')
  expect(offAnswer()).toBe('symcc is off. The owner can turn it on with /symcc-on.')
  expect(offStatusLine()).toBe('symcc off · /symcc-on')
})

test('/symcc-off and /symcc-on parse, and take no words', () => {
  expect(parseCommand('symcc-off', '')).toEqual({ kind: 'off' })
  expect(parseCommand('/symcc-on', '  ')).toEqual({ kind: 'on' })
  expect(parseCommand('symcc-off', 'now')?.kind).toBe('bad')
  expect(parseCommand('symcc-on', 'x')?.kind).toBe('bad')
  expect(commandNames()).toContain('symcc-off')
  expect(commandNames()).toContain('symcc-on')
  expect(parseCommand('other-off', '')).toBe(null)
})

test('/symcc-settings enabled off reads as the on/off switch', () => {
  expect(parseCommand('symcc-settings', 'enabled off')).toEqual({ kind: 'set', setting: 'enabled', input: { enabled: false } })
})

test('after a plugin reload, a worker of this session is adopted, not stopped (T-87)', () => {
  const [b0] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
  const b = patchTask(b0, 'T-1', { status: 'doing', session: 'me', agent: 'w1' }, T)
  const w = (id: string, name = 'symcc-T-1', status = 'running') => ({ id, name, type: 'symcc:worker', status, description: 'A' })
  // the reloaded copy knows no workers: the running one of its own task is kept
  expect(orphanMove(w('w1'), b, 'me', 'me')).toEqual({ move: 'adopt', task: 'T-1' })
  expect(orphanMove(w('w1'), b, 'me', null)).toEqual({ move: 'adopt', task: 'T-1' })
  // found by its name when no agent was recorded yet (reload right after the spawn)
  const noAgent = patchTask(b, 'T-1', { agent: undefined }, T)
  expect(orphanMove(w('w9'), noAgent, 'me', 'me')).toEqual({ move: 'adopt', task: 'T-1' })
  // but only one worker per task: a second one is stopped
  expect(orphanMove(w('w9'), noAgent, 'me', 'me', ['T-1'])).toEqual({ move: 'stop' })
  // another agent is recorded on the task: this one is a real orphan
  expect(orphanMove(w('w2'), b, 'me', 'me')).toEqual({ move: 'stop' })
  // the task is no longer "doing" (stopped, dropped, done): stop
  expect(orphanMove(w('w1'), patchTask(b, 'T-1', { status: 'todo' }, T), 'me', 'me')).toEqual({ move: 'stop' })
  // no task for it at all: stop
  expect(orphanMove(w('w3', 'symcc-T-99'), b, 'me', 'me')).toEqual({ move: 'stop' })
  // the task belongs to another session that drives the board now: leave it alone
  const theirs = patchTask(b, 'T-1', { session: 'other' }, T)
  expect(orphanMove(w('w1'), theirs, 'me', 'other')).toEqual({ move: 'leave' })
  // the task belongs to a dead session: not ours to keep, stop
  expect(orphanMove(w('w1'), theirs, 'me', 'me')).toEqual({ move: 'stop' })
  // ended agents are never touched; bad input is left alone
  expect(orphanMove(w('w1', 'symcc-T-1', 'completed'), b, 'me', 'me')).toEqual({ move: 'leave' })
  expect(orphanMove({ id: '', status: 'running' }, b, 'me', 'me')).toEqual({ move: 'leave' })
  expect(orphanMove(w('w1'), { ...b, tasks: undefined as never }, 'me', 'me')).toEqual({ move: 'stop' })
  // no session id known: never adopt
  expect(orphanMove(w('w1'), patchTask(b, 'T-1', { session: '' }, T), '', null)).toEqual({ move: 'stop' })
})

test('the panel sections: needs you, doing, to do by run order then paused, backlog, done and dropped finished-last first', () => {
  const tasks = [
    { ...at('T-1', 'done', '2026-11-10T10:00:00Z'), title: 'Yesterday work' },
    { ...at('T-2', 'todo', '2026-11-11T10:00:00Z'), order: 5 },
    { ...at('T-3', 'paused', '2026-11-11T10:00:00Z'), order: 1 },
    { ...at('T-4', 'todo', '2026-11-11T10:00:00Z'), order: 2 },
    at('T-5', 'failed', '2026-11-11T10:00:00Z'),
    at('T-6', 'review', '2026-11-11T09:00:00Z'),
    at('T-7', 'doing', '2026-11-11T10:00:00Z'),
    { ...at('T-8', 'done', '2026-11-11T11:00:00Z', '2026-11-01T00:00:00Z'), title: 'Task page: collapse the Details rows' },
    at('T-9', 'dropped', '2026-11-09T10:00:00Z'),
    at('T-10', 'dropped', '2026-11-11T10:00:00Z'),
    at('T-11', 'backlog', '2026-11-11T10:00:00Z'),
  ]
  const s = panelSections(tasks, NOW, 0)
  expect(s.needsYou.map(t => t.id)).toEqual(['T-6', 'T-5'])
  expect(s.doing.map(t => t.id)).toEqual(['T-7'])
  expect(s.todo.map(t => t.id)).toEqual(['T-4', 'T-2', 'T-3'])
  expect(s.backlog.map(t => t.id)).toEqual(['T-11'])
  expect(s.done.map(t => t.id)).toEqual(['T-8', 'T-1'])
  expect(s.doneToday.map(t => t.id)).toEqual(['T-8'])
  expect(s.doneDays.map(g => groupLabel(g))).toEqual(['▸ Yesterday · 1 done'])
  expect(s.dropped.map(t => t.id)).toEqual(['T-10', 'T-9'])
  expect(sectionHeader('Done', 42)).toBe('Done (42)')
  expect(sectionHeader('Done', 42, false)).toBe('▸ Done (42)')
  expect(sectionHeader('Done', 42, true)).toBe('▾ Done (42)')
  const head = foldedRow('Done', 2, false)
  expect(head).toBe('▸ Done     2')
  expect(doneExtra(s.done[0], NOW, 0, head)).toBe('last today: T-8 Task page: collapse the Details rows')
  expect(doneExtra(s.done[1], NOW, 0, head)).toBe('last yesterday: T-1 Yesterday work')
  const cut = doneExtra(s.done[0], NOW, 0, head, 50)
  expect(cut).toBe('last today: T-8 Task page: collaps…')
  expect(head.length + 3 + cut.length).toBeLessThanOrEqual(50)
  // too narrow for even a short title: just the count
  expect(doneExtra(s.done[0], NOW, 0, head, 30)).toBe('')
  expect(doneExtra(undefined, NOW, 0, head)).toBe('')
})

test('folded rows line up their counts; no brackets', () => {
  const rows = [foldedRow('Backlog', 3, false, 2), foldedRow('Done', 87, false, 2), foldedRow('Dropped', 3, true, 2)]
  expect(rows).toEqual(['▸ Backlog   3', '▸ Done     87', '▾ Dropped   3'])
  expect(new Set(rows.map(r => r.length)).size).toBe(1)
  expect(rows.some(r => /[()[\]]/.test(r))).toBe(false)
})

test('the status strip: name, mode, busy/max workers, scouts and the next scout when it fits; off when disabled', () => {
  const now = Date.parse('2026-11-11T12:00:00Z')
  const scouts = [
    { name: 'tests', running: false, next_run: '2026-11-11T13:00:00Z' },
    { name: 'secrets', running: false, next_run: '2026-11-11T12:38:00Z' },
    { name: 'docs', running: false, next_run: null },
  ]
  const tasks = [{ status: 'doing' as const }, { status: 'todo' as const }]
  expect(statusStrip({ mode: 'auto', max_parallel: 3, tasks, scouts }, now)).toBe('symcc · auto · 1/3 workers · 3 scouts (next: secrets in 38m)')
  expect(statusStrip({ mode: 'review', max_parallel: 3, tasks, scouts }, now, 40)).toBe('symcc · review · 1/3 workers · 3 scouts')
  expect(statusStrip({ mode: 'off', max_parallel: 3, tasks, scouts }, now)).toBe('symcc · off · 1/3 workers · 3 scouts')
  expect(statusStrip({ mode: 'auto', tasks: [], scouts: [scouts[0]!] }, now)).toBe('symcc · auto · 0/3 workers · 1 scout (next: tests in 1h 00m)')
  expect(statusStrip({ mode: 'auto', enabled: false, tasks, scouts }, now)).toBe('symcc off · /symcc-on')
  expect(nextScoutText([{ name: 'bugs', running: true, next_run: null }, ...scouts], now)).toBe('running: bugs')
  expect(nextScoutText([], now)).toBe('')
})

test('task rows: a short status column and a subtle extra; the extra goes first when the row is narrow', () => {
  const now = Date.parse('2026-11-11T12:00:00Z')
  const base = { ...at('T-5', 'doing', '2026-11-11T10:00:00Z'), title: 'Secrets scout example', role: 'frontend', attempts: 1, runs: [{ started: '2026-11-11T11:56:00Z' }] }
  const tasks = [base, { ...at('T-6', 'todo', '2026-11-11T10:00:00Z'), after: ['T-5', 'T-1'] }, at('T-1', 'done', '2026-11-11T10:00:00Z'), at('T-7', 'review', '2026-11-11T10:00:00Z')]
  expect(statusCell(base, now)).toBe('4m')
  expect(statusCell({ ...base, runs: [] }, now, now - 60_000)).toBe('1m')
  expect(statusCell({ ...base, runs: [] }, now)).toBe('')
  expect(['review', 'waiting', 'failed', 'paused', 'todo', 'done'].map(status => statusCell({ status: status as never }, now))).toEqual(['review', 'waiting', 'failed', 'paused', '', ''])
  expect(rowExtra(base, tasks)).toBe('frontend · try 1')
  expect(rowExtra({ ...base, role: 'general' }, tasks)).toBe('try 1')
  expect(rowExtra(tasks[1]!, tasks)).toBe('after T-5')
  expect(rowExtra({ ...tasks[1]!, after: ['T-1'] }, tasks)).toBe('')
  expect(rowExtra(tasks[3]!, tasks)).toBe('Enter to review')
  expect(rowExtra(tasks[2]!, tasks)).toBe('')
  // the extra sits at the right end; when the whole title does not fit beside it, it goes, then the title is cut
  const wide = fitRow(20, 'Secrets scout example', 'frontend · try 1', 60)
  expect(20 + wide.title.length + wide.pad.length + wide.extra.length).toBe(60)
  expect(wide.title).toBe('Secrets scout example')
  expect(fitRow(20, 'Secrets scout example', 'frontend · try 1', 50)).toEqual({ title: 'Secrets scout example', pad: '', extra: '' })
  expect(fitRow(20, 'Secrets scout example', 'frontend · try 1', 30)).toEqual({ title: 'Secrets s…', pad: '', extra: '' })
})

test('key hints: in order for the task state, laid out at 30, 50 and 80 columns, never split or cut', () => {
  const words = (hs: { key: string; word: string }[]) => hs.map(hintText)
  expect(words(taskKeys('review'))).toEqual(['a approve', 'x reject', 'd show changes', '↑↓ scroll', 'b back'])
  expect(words(taskKeys('review', true))).toEqual(['a approve', 'x reject', 'd show changes', 'w watch worker', '↑↓ scroll', 'b back'])
  expect(words(taskKeys('backlog'))).toEqual(['o move to todo', 'x drop', 'l role', '↑↓ scroll', 'b back'])
  expect(words(taskKeys('todo', true))).toEqual(['w watch worker', 'k stash to backlog', 'l role', '↑↓ scroll', 'b back'])
  expect(words(taskKeys('done'))).toEqual(['↑↓ scroll', 'b back'])
  expect(words(diffKeys(true, true))).toEqual(['a approve', 'x reject', 'd all files', '↑↓ scroll', 'b back to the task'])
  expect(words(diffKeys(false, false))).toEqual(['↑↓ scroll', 'b back to the task'])
  expect(words(scoutKeys())).toEqual(['r run now', 'e edit', 'p pause', '↑↓ scroll', 'b back'])
  expect(words(scoutKeys(true))).toEqual(['r run now', 'e edit', 'p resume', '↑↓ scroll', 'b back'])
  // while the scout runs there is no "r run now" (like the button)
  expect(words(scoutKeys(false, true))).toEqual(['e edit', 'p pause', '↑↓ scroll', 'b back'])
  expect(words(scoutListKeys())).toEqual(['Enter open', 't s c views', 'Esc close'])
  expect(words(viewKeys(false))).toEqual(['t tasks', 's scouts', 'c settings', 'Esc closes'])
  const all = [taskKeys('review', true), taskKeys('backlog'), taskKeys('todo', true), listKeys(), viewKeys(), scoutKeys(), diffKeys(true, true)]
  for (const w of [30, 50, 80])
    for (const hs of all) {
      const lines = hintLines(hs, w)
      // every item, whole and in order, and each line fits
      expect(lines.flat()).toEqual(hs)
      for (const l of lines) expect(hintLineText(l).length).toBeLessThanOrEqual(w)
      // no line could take the next line's first item
      for (let i = 1; i < lines.length; i++) expect(hintLineText([...lines[i - 1]!, lines[i]![0]!]).length).toBeGreaterThan(w)
    }
  expect(hintLines(taskKeys('review', true), 80).map(hintLineText)).toEqual(['a approve · x reject · d show changes · w watch worker · ↑↓ scroll · b back'])
  expect(hintLines(taskKeys('review', true), 30).map(hintLineText)).toEqual(['a approve · x reject', 'd show changes', 'w watch worker · ↑↓ scroll', 'b back'])
  // the list only offers keys that work there: never a or x
  expect(words(listKeys())).toEqual(['Enter open', '↑↓ move', 't s c views', 'Esc close'])
  expect(listKeys().some(h => h.key === 'a' || h.key === 'x')).toBe(false)
})

test('packRows keeps order, fills each row, and gives a too-wide item a row of its own', () => {
  expect(packRows([4, 7, 6, 12], 20, 1)).toEqual([[0, 1, 2], [3]])
  expect(packRows([4, 25, 3], 20, 1)).toEqual([[0], [1], [2]])
  expect(packRows([], 20, 1)).toEqual([])
})

test('a paused scout is saved in scouts.json and read back; old files without it are not paused', () => {
  const text = scoutMemoryText([
    { name: 'bugs', last_run: '2026-11-12T08:00:00.000Z', last_report: 'NOTHING', paused: true },
    { name: 'docs', last_run: null, paused: true },
    { name: 'tests', last_run: '2026-11-12T09:00:00.000Z' },
    { name: 'never', last_run: null, paused: false },
  ])
  const m = parseScoutMemory(text)
  expect(m.bugs).toEqual({ last_run: '2026-11-12T08:00:00.000Z', last_report: 'NOTHING', paused: true })
  // a scout that never ran is still kept when it is paused
  expect(m.docs).toEqual({ last_run: null, paused: true })
  expect(m.tests).toEqual({ last_run: '2026-11-12T09:00:00.000Z' })
  expect(m.never).toBeUndefined()
  // an old file (no paused key) and odd values mean "not paused"
  expect(parseScoutMemory('{"scouts":{"a":{"last_run":"2026-11-12T08:00:00.000Z"},"b":{"last_run":"2026-11-12T08:00:00.000Z","paused":"yes"}}}')).toEqual({ a: { last_run: '2026-11-12T08:00:00.000Z' }, b: { last_run: '2026-11-12T08:00:00.000Z' } })
  // pausing and resuming one scout keeps the others as they are
  const paused = parseScoutMemory(scoutPausedText(m, 'tests', true))
  expect(paused.tests).toEqual({ last_run: '2026-11-12T09:00:00.000Z', paused: true })
  expect(paused.bugs).toEqual(m.bugs)
  expect(parseScoutMemory(scoutPausedText({}, 'new', true))).toEqual({ new: { last_run: null, paused: true } })
  const resumed = parseScoutMemory(scoutPausedText(paused, 'tests', false))
  expect(resumed.tests).toEqual({ last_run: '2026-11-12T09:00:00.000Z' })
  expect(parseScoutMemory(scoutPausedText({ x: { last_run: null, paused: true } }, 'x', false))).toEqual({})
})

test('a paused scout is not run by its timer or by run now', () => {
  const ok = { driving: true, gitOk: true, mode: 'auto' as const, on: true }
  expect(scoutMayRun({ running: false }, ok)).toBe(true)
  expect(scoutMayRun({ running: false, paused: false }, ok)).toBe(true)
  expect(scoutMayRun({ running: false, paused: true }, ok)).toBe(false)
  expect(scoutMayRun({ running: true }, ok)).toBe(false)
  expect(scoutMayRun({ running: false }, { ...ok, driving: false })).toBe(false)
  expect(scoutMayRun({ running: false }, { ...ok, gitOk: false })).toBe(false)
  expect(scoutMayRun({ running: false }, { ...ok, mode: 'off' })).toBe(false)
  expect(scoutMayRun({ running: false }, { ...ok, on: false })).toBe(false)
  // run now says why it can't start, one message for each check; '' (so "started") only when it may run
  const why = (s: { running: boolean; paused?: boolean }, o = ok) => scoutWhyNot({ name: 'gaps-bot', ...s }, o)
  expect(why({ running: false })).toBe('')
  expect(why({ running: true })).toBe('gaps-bot is already running')
  expect(why({ running: false, paused: true })).toBe('gaps-bot is paused; resume it first (p on its page, or /symcc-scout gaps-bot resume)')
  expect(why({ running: false }, { ...ok, driving: false })).toBe('scouts run in the session that drives the board; run /symcc-scout gaps-bot there')
  expect(why({ running: false }, { ...ok, gitOk: false })).toBe("git isn't set up in this folder yet (no repo or no commit); nothing runs until it is")
  expect(why({ running: false }, { ...ok, on: false })).toBe('symcc is off. The owner can turn it on with /symcc-on.')
  expect(why({ running: false }, { ...ok, mode: 'off' })).toBe('the board is off, so no scout runs; turn it on with /symcc-mode review or /symcc-mode auto')
  for (const s of [{ running: false }, { running: true }, { running: false, paused: true }])
    for (const o of [ok, { ...ok, driving: false }, { ...ok, gitOk: false }, { ...ok, on: false }, { ...ok, mode: 'off' as const }])
      expect(why(s, o) === '').toBe(scoutMayRun(s, o))
  expect(scoutPausedAnswer('gaps-bot')).toBe('gaps-bot is paused; resume it first (p on its page, or /symcc-scout gaps-bot resume)')
  // the status strip's next scout skips a paused one
  const at = Date.parse('2026-11-12T10:00:00.000Z')
  const iso = (m: number) => new Date(at + m * 60_000).toISOString()
  expect(nextScoutText([{ name: 'a', running: false, next_run: iso(5), paused: true }, { name: 'b', running: false, next_run: iso(30) }], at)).toBe('next: b in 30m')
  expect(nextScoutText([{ name: 'a', running: false, next_run: iso(5), paused: true }], at)).toBe('')
  // the lead hears that a scout paused during its run won't run again
  expect(scoutLeadMessage('a', '1. bug', undefined, true)).toContain('The owner has paused "a": it doesn\'t run again until the owner resumes it.')
  expect(scoutLeadMessage('a', '1. bug')).not.toContain('paused')
})

test('/symcc-scout <name> pause and resume', () => {
  expect(parseCommand('symcc-scout', 'bugs pause')).toEqual({ kind: 'scout-pause', name: 'bugs', paused: true })
  expect(parseCommand('symcc-scout', ' bugs  Resume ')).toEqual({ kind: 'scout-pause', name: 'bugs', paused: false })
  expect(parseCommand('symcc-scout', 'bugs')).toEqual({ kind: 'scout', name: 'bugs' })
  for (const args of ['bugs stop', 'bugs pause now', 'pause']) {
    const c = parseCommand('symcc-scout', args)
    if (args === 'pause') expect(c).toEqual({ kind: 'scout', name: 'pause' })
    else expect(c).toEqual({ kind: 'bad', message: 'Use: /symcc-scout <name> (run it now), /symcc-scout <name> pause, or /symcc-scout <name> resume' })
  }
})

test('scout list: icons, "last:" and the order with paused ones last', () => {
  expect(scoutIcon({ running: true })).toBe('◉')
  expect(scoutIcon({ running: true, paused: true })).toBe('◉')
  expect(scoutIcon({ running: false })).toBe('◎')
  expect(scoutIcon({ running: false, paused: true })).toBe('○')
  expect([scoutTone({ running: true }), scoutTone({ running: false }), scoutTone({ running: false, paused: true })]).toEqual(['ide', 'text', 'subtle'])
  expect(countFindings('**1. Crash in parser**\nmore\n**2. Missing test**\n  1. step one\n## 3) Leak')).toBe(3)
  expect(countFindings('1. a\n2. b\n1. a again')).toBe(2)
  expect(countFindings('A crash in src/p.ts:3')).toBe(0)
  expect(scoutLastText({ last_run: null })).toEqual({ text: 'never ran', tone: 'subtle' })
  expect(scoutLastText({ last_run: '2026-11-12T08:00:00.000Z', last_report: 'NOTHING' })).toEqual({ text: 'last: nothing', tone: 'subtle' })
  expect(scoutLastText({ last_run: '2026-11-12T08:00:00.000Z', last_report: '' })).toEqual({ text: 'last: nothing', tone: 'subtle' })
  expect(scoutLastText({ last_run: '2026-11-12T08:00:00.000Z', last_report: '1. bug at a.ts:3' })).toEqual({ text: 'last: found 1', tone: 'warning' })
  expect(scoutLastText({ last_run: '2026-11-12T08:00:00.000Z', last_report: 'a bug at a.ts:3' })).toEqual({ text: 'last: found something', tone: 'warning' })
  const s = (name: string, extra: Partial<SymccScout> = {}): SymccScout => ({ name, every_minutes: 60, last_run: null, running: false, ...extra })
  const at = Date.parse('2026-11-12T10:00:00.000Z')
  const iso = (m: number) => new Date(at + m * 60_000).toISOString()
  expect(sortScouts([s('z', { paused: true, next_run: iso(1) }), s('b', { next_run: iso(50) }), s('a', { running: true, paused: true })]).map(x => x.name)).toEqual(['a', 'b', 'z'])
})

/** The example list from the task: one running, three waiting, one paused. */
function exampleScouts(at: number): SymccScout[] {
  const iso = (m: number) => new Date(at + m * 60_000).toISOString()
  return [
    { name: 'recent-changes', every_minutes: 90, last_run: iso(-1), running: true, next_run: iso(89) },
    { name: 'gaps-bot', every_minutes: 60, last_run: iso(-30), running: false, next_run: iso(59), last_report: '**1. No test for parse()**' },
    { name: 'secrets', every_minutes: 240, last_run: iso(-60), running: false, next_run: iso(239), last_report: 'NOTHING' },
    { name: 'test-gaps', every_minutes: 240, last_run: null, running: false, next_run: iso(239), model: 'sonnet' },
    { name: 'simplify', every_minutes: 600, last_run: null, running: false, next_run: iso(599), model: 'sonnet', paused: true },
  ]
}

test('scout list rows: aligned columns; on a narrow panel the model goes first, then "last:", never the name', () => {
  const at = Date.parse('2026-11-12T10:00:00.000Z')
  const text = (w: number) => scoutListRows(sortScouts(exampleScouts(at)), at, w).map(r => scoutListText(r))
  expect(text(90)).toEqual([
    '  ◉ recent-changes  every 90 min    running now…',
    '  ◎ gaps-bot        every hour      next in 59m     last: found 1',
    '  ◎ secrets         every 4 hours   next in 3h 59m  last: nothing',
    '  ◎ test-gaps       every 4 hours   next in 3h 59m  never ran      sonnet',
    '  ○ simplify        every 10 hours  paused          never ran      sonnet',
  ])
  for (const w of [90, 72, 50, 40, 20]) for (const line of text(w)) if (w >= 50) expect(line.length).toBeLessThanOrEqual(w)
  // 66 columns: no model column
  expect(text(66)[3]).toBe('  ◎ test-gaps       every 4 hours   next in 3h 59m  never ran')
  // 50 columns: no model and no "last:"
  expect(text(50)).toEqual([
    '  ◉ recent-changes  every 90 min    running now…',
    '  ◎ gaps-bot        every hour      next in 59m',
    '  ◎ secrets         every 4 hours   next in 3h 59m',
    '  ◎ test-gaps       every 4 hours   next in 3h 59m',
    '  ○ simplify        every 10 hours  paused',
  ])
  // very narrow: the name stays whole
  for (const line of text(20)) expect(line).toMatch(/^  [◉◎○] [a-z-]+/)
  expect(text(20)[0]).toBe('  ◉ recent-changes')
  const long = 'a-very-long-scout-name-that-is-wider-than-the-panel'
  expect(scoutListText(scoutListRows([{ name: long, every_minutes: 30, last_run: null, running: false }], at, 30)[0]!)).toBe(`  ◎ ${long}`)
})

import { parseStatusZ, mergeBlockers, blockedText, moveTarget, type GitRun } from '../hooks/board'

test('git status -z is read into codes and paths; a rename keeps only its new path', () => {
  expect(parseStatusZ(' M a.txt\0?? new dir/x.txt\0R  b.txt\0old.txt\0')).toEqual([
    { code: ' M', path: 'a.txt' },
    { code: '??', path: 'new dir/x.txt' },
    { code: 'R ', path: 'b.txt' },
  ])
  expect(parseStatusZ('')).toEqual([])
})

test('a merge waits for uncommitted changes and for untracked files it would overwrite, but not for other untracked files', () => {
  const st = '?? new.txt\0?? notes.txt\0?? lib\0?? .symcc/board.json\0'
  const b = mergeBlockers(st, ['a.txt', 'new.txt', 'lib/x.js'], '.symcc')
  expect(b).toEqual({ dirty: [], untracked: ['new.txt', 'lib'], ignored: [] })
  expect(blockedText('main', 'T-3', b)).toBe('you have untracked files on main that T-3 would overwrite (new.txt, lib); move, rename or commit them, then say "retry T-3"')
  expect(mergeBlockers(' M a.txt\0 M .symcc/x\0', ['b.txt'], '.symcc').dirty).toEqual(['a.txt'])
  expect(blockedText('main', 'T-3', { dirty: ['a.txt'], untracked: [] })).toContain('uncommitted changes on main')
  expect(blockedText('main', 'T-3', mergeBlockers('?? other.txt\0', ['a.txt'], '.symcc'))).toBe('')
})

/** A fake git: answers by the command's first word; records every call. */
function fakeGit(answers: Record<string, { exitCode: number; stdout?: string; stderr?: string }[]>) {
  const calls: string[][] = []
  const run: GitRun = async args => {
    calls.push(args)
    const key = args[0] === 'read-tree' && args[1] === '-n' ? 'dry-run' : args[0]!
    const a = answers[key]?.shift() ?? { exitCode: 0 }
    return { exitCode: a.exitCode, stdout: a.stdout ?? '', stderr: a.stderr ?? '' }
  }
  return { run, calls }
}
const MOVE = { target: 'main', id: 'T-3', from: 'aaaa', to: 'bbbb', checkedOut: true, note: 'symcc T-3', skipDir: '.symcc' }

test('an untracked file the task would create blocks the merge before the branch moves', async () => {
  const g = fakeGit({ diff: [{ exitCode: 0, stdout: 'a.txt\0new.txt\0' }], status: [{ exitCode: 0, stdout: '?? new.txt\0' }] })
  const r = await moveTarget(g.run, MOVE)
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('new.txt')
  expect(g.calls.some(c => c[0] === 'update-ref' || c[0] === 'read-tree')).toBe(false)
})

test('a failed file update after the branch moved puts the branch back and is not merged', async () => {
  const g = fakeGit({ diff: [{ exitCode: 0, stdout: 'a.txt\0' }], 'read-tree': [{ exitCode: 128, stderr: "error: Untracked working tree file 'new.txt' would be overwritten by merge." }] })
  const r = await moveTarget(g.run, MOVE)
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('not merged')
  expect(r.detail).toContain('back where it was')
  const refs = g.calls.filter(c => c[0] === 'update-ref')
  expect(refs.map(c => c.slice(-3))).toEqual([['refs/heads/main', 'bbbb', 'aaaa'], ['refs/heads/main', 'aaaa', 'bbbb']])
})

test('a dry run that fails stops the merge before the branch moves', async () => {
  const g = fakeGit({ 'dry-run': [{ exitCode: 128, stderr: 'error: something in the way' }] })
  const r = await moveTarget(g.run, MOVE)
  expect(r).toEqual({ ok: false, detail: 'your files on main can\'t be updated (error: something in the way); fix that, then say "retry T-3"' })
  expect(g.calls.some(c => c[0] === 'update-ref')).toBe(false)
})

test('the normal merge moves the branch and updates the files; another branch checked out only moves the branch', async () => {
  const g = fakeGit({ diff: [{ exitCode: 0, stdout: 'a.txt\0new.txt\0' }], status: [{ exitCode: 0, stdout: '?? other.txt\0' }] })
  expect(await moveTarget(g.run, MOVE)).toEqual({ ok: true, detail: '' })
  expect(g.calls.map(c => c[0] + (c[1] === '-n' ? ' -n' : ''))).toEqual(['diff', 'status', 'read-tree -n', 'update-ref', 'read-tree'])
  const h = fakeGit({})
  expect((await moveTarget(h.run, { ...MOVE, checkedOut: false })).ok).toBe(true)
  expect(h.calls.map(c => c[0])).toEqual(['update-ref'])
  const moved = fakeGit({ 'update-ref': [{ exitCode: 1 }] })
  expect((await moveTarget(moved.run, { ...MOVE, checkedOut: false })).detail).toBe('main moved during the merge; try again')
})

// ---------------- a board.json that can't be read ----------------

test('a board.json that is not valid JSON is broken, not an empty board', () => {
  const r = readBoard('{ "version": 1, "next_id": 9, "mode": "review", "tasks": [], }')
  expect(typeof r.broken).toBe('string')
  for (const bad of ['null', '[]', '42', '"x"', '{"tasks": {}}']) expect(typeof readBoard(bad).broken).toBe('string')
})

test('no board.json (or an empty one) is a new, empty board', () => {
  for (const none of [null, '', '  \n']) {
    const r = readBoard(none)
    expect(r.broken).toBeUndefined()
    expect(r.board).toEqual(emptyBoard())
    expect(r.skipped).toBe(0)
  }
})

test('inside a readable board.json, a bad task entry is skipped and counted; the rest and the settings are kept', () => {
  const [b1] = addTask(emptyBoard(), { origin: W, title: 'A' }, T)
  const [b2] = addTask(b1, { origin: W, title: 'B' }, T)
  const raw = { ...b2, mode: 'review', target_branch: 'dev', max_parallel: 'lots', tasks: [b2.tasks[0], null, 7, { id: 'T-9' }, { ...b2.tasks[0] }, b2.tasks[1]] }
  const r = readBoard(JSON.stringify(raw))
  expect(r.broken).toBeUndefined()
  expect(r.board.tasks.map(t => t.id)).toEqual(['T-1', 'T-2'])
  expect(r.skipped).toBe(4)
  expect(r.board.mode).toBe('review')
  expect(r.board.target_branch).toBe('dev')
  expect(r.board.max_parallel).toBe(3)
  expect(r.fixed).toEqual(['max_parallel'])
  expect(r.board.next_id).toBe(3)
  // a task missing a list field gets an empty one, so the code that reads it never breaks
  const t = readBoard(JSON.stringify({ tasks: [{ id: 'T-4', status: 'todo', title: 'x' }] })).board
  expect(t.tasks[0]!.history).toEqual([])
  expect(t.next_id).toBe(5)
})

// ---------------- a scout run that fails to start, or is stopped ----------------
import { runScout, runScoutNow, scoutFinished } from '../hooks/plugin/scouts'
import { S as PS, scoutState, scoutRuns, timers as scoutTimers, leadQueue as scoutLeadQueue } from '../hooks/plugin/state'

/** A small fake `$` for the scout code: in-memory files, a board in auto mode, one scout "gaps", and a spawn
 *  that answers with `spawn` (a function so a test can change it between calls). */
function scoutWorld(spawn: () => Promise<{ agentId?: string; deny?: string }>) {
  const ROOT = '/repo'
  const files = new Map<string, string>()
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify({ ...emptyBoard('main'), mode: 'auto' }))
  files.set(`${ROOT}/.symcc/scouts/gaps.md`, '---\nevery_minutes: 0\n---\nLook for gaps.\n')
  const toasts: string[] = []
  const later: { ms: number; f: () => void }[] = []
  const prompts: string[] = []
  const state = new Map<string, { value: unknown; version: number }>()
  const $ = {
    fs: {
      exists: async (p: string) => files.has(p) || [...files.keys()].some(k => k.startsWith(`${p}/`)),
      read: async (p: string) => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return files.get(p)!
      },
      write: async (p: string, t: string) => void files.set(p, t),
      list: async (d: string) => [...files.keys()].filter(k => k.startsWith(`${d}/`)).map(k => ({ kind: 'file', name: k.slice(d.length + 1) })),
    },
    process: {
      run: async (argv: string[]) => {
        if (argv[0] === 'mv') {
          files.set(argv[3]!, files.get(argv[2]!)!)
          files.delete(argv[2]!)
        }
        return { exitCode: 0, stdout: argv[0] === 'git' ? 'main' : '', stderr: '' }
      },
    },
    agent: {
      spawn: async (o: { prompt: string }) => {
        prompts.push(o.prompt)
        return spawn()
      },
      list: async () => [],
    },
    ui: { toast: (t: unknown) => void toasts.push(String(t)), status: () => undefined, invalidate: () => undefined },
    clock: {
      after: (ms: number, f: () => void) => (later.push({ ms, f }), { cancel() {} }),
      every: () => ({ cancel() {} }),
    },
    prompt: { submit: async () => undefined },
    session: { id: async () => 'me', send: async () => undefined },
    state: {
      get: async (e: { key: string }) => state.get(e.key) ?? { value: undefined, version: 0 },
      set: async (e: { key: string; value: unknown }) => {
        const version = (state.get(e.key)?.version ?? 0) + 1
        state.set(e.key, { value: e.value, version })
        return { isSet: true, version }
      },
    },
  }
  PS.root = ROOT
  PS.driving = true
  PS.gitState = 'ok'
  PS.enabledNow = true
  PS.leadTimer = null
  scoutState.clear()
  scoutRuns.clear()
  scoutTimers.splice(0)
  scoutLeadQueue.splice(0)
  return { $: $ as never, files, toasts, later, prompts }
}

const OLD_RUN = '2026-11-01T10:00:00.000Z'

test('a scout whose start fails keeps its old last_run, and "run now" says why instead of "started"', async () => {
  const w = scoutWorld(async () => ({ deny: 'no agents allowed here' }))
  expect(await runScoutNow(w.$, 'gaps')).toBe("scout gaps didn't start: no agents allowed here")
  const st = scoutState.get('gaps')!
  st.last_run = OLD_RUN
  const why = await runScout(w.$, { name: 'gaps', every_minutes: 0, prompt: 'Look for gaps.' })
  expect(why).toContain('no agents allowed here')
  expect(st.last_run).toBe(OLD_RUN)
  expect(st.running).toBe(false)
  // the owner is told once, not on every failed try
  expect(w.toasts.filter(t => t.includes("didn't start")).length).toBe(1)
  expect(w.later.length).toBe(0)
})

test('a scout whose type is not ready yet is tried again shortly, then starts with the old last_run in its prompt', async () => {
  let ready = false
  const w = scoutWorld(async () => (ready ? { agentId: 'a1' } : { deny: "Agent type 'symcc:scout' not found" }))
  await runScoutNow(w.$, 'gaps')
  const st = scoutState.get('gaps')!
  st.last_run = OLD_RUN
  const why = await runScout(w.$, { name: 'gaps', every_minutes: 0, prompt: 'Look for gaps.' })
  expect(why).toContain('trying again')
  expect(st.last_run).toBe(OLD_RUN)
  expect(w.toasts.length).toBe(0)
  expect(w.later.length).toBe(2)
  ready = true
  w.later.at(-1)!.f()
  for (let i = 0; i < 20 && !scoutRuns.has('a1'); i++) await new Promise(r => setTimeout(r, 0))
  expect(scoutRuns.get('a1')).toBe('gaps')
  expect(st.running).toBe(true)
  expect(st.last_run).not.toBe(OLD_RUN)
  expect(w.prompts.at(-1)).toContain(OLD_RUN)
})

test('a scout run stopped from the agent controls is not saved as a report and not sent to the lead', async () => {
  const w = scoutWorld(async () => ({ agentId: 'a2' }))
  await runScoutNow(w.$, 'gaps') // first, so the scout is known
  const st0 = scoutState.get('gaps')!
  st0.running = false
  st0.last_run = OLD_RUN
  st0.last_report = 'the real report'
  expect(await runScoutNow(w.$, 'gaps')).toBe('scout gaps started')
  const st = scoutState.get('gaps')! // "run now" schedules the scouts again, which makes a new state object
  expect(st.last_run).not.toBe(OLD_RUN)
  await scoutFinished(w.$, 'a2', 'I was halfway through check', true)
  expect(st.running).toBe(false)
  expect(st.last_run).toBe(OLD_RUN)
  expect(st.last_report).toBe('the real report')
  expect(scoutLeadQueue.length).toBe(0)
  expect(w.files.has('/repo/.symcc/scouts.json')).toBe(false)
  expect(w.toasts.some(t => t.includes('scout gaps was stopped; nothing reported'))).toBe(true)
})
