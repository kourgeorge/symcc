import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { addScoutRun, bar, cutTitle, textWidth, parseStatsArgs, wrapLine, billedTokens, billedText, failReason, migrateScoutUsage, readArchive, archiveText, tokenCount, fmtTokenKinds, inRange, keepScoutUsage, leadCalls, leadTotals, mean, median, mergedHow, originKey, parseScoutMemory, parseScoutUsage, parseStatsRange, projectFolderName, rangeSpan, scoutMemoryText, scoutTotals, statsReport, taskFigures, readBoard, boardTotal } from '../hooks/board'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()

/** A task made `ageMin` minutes ago; `tries` are [minutes, tokens] per try (the tokens as plain input), each starting at the task's creation. */
function task(id: string, over: Partial<SymccTask> = {}, tries: [number, number?][] = [], ageMin = 60): SymccTask {
  const runs = tries.map(([min, tokens]) => ({ started: iso(ageMin), ended: iso(ageMin - min), ...(tokens !== undefined ? { tokens: { input: tokens } } : {}) }))
  return { id, title: `task ${id}`, details: '', files: [], status: 'done', note: '', question: null, order: 0, after: [], attempts: tries.length, history: [], branch: null, created_at: iso(ageMin), updated_at: iso(0), ...(runs.length ? { runs } : {}), ...over }
}

test('stats: averages and medians', () => {
  expect(mean([])).toBe(undefined)
  expect(mean([1, 2, 6])).toBe(3)
  expect(median([])).toBe(undefined)
  expect(median([5, 1, 3])).toBe(3)
  expect(median([4, 1, 3, 2])).toBe(2.5)
  const f = taskFigures(task('T-1', {}, [[10, 1000], [20]]), NOW)
  expect(f.ms).toBe(30 * 60_000)
  expect(f.tokens).toEqual({ input: 1000 })
  expect(f.tok).toBe(1000)
  expect(f.tries).toBe(2)
  expect(taskFigures(task('T-2')).hasData).toBe(false)
})

test('stats: per-task averages leave out tasks with no try data, and say how many', () => {
  const tasks = [task('T-1', {}, [[10, 1000]]), task('T-2', {}, [[30, 3000]]), task('T-3', {}, [[20, 2000], [20, 2000]]), task('T-4')]
  const text = statsReport({ tasks, nowMs: NOW })
  expect(text).toContain('1 task with no try data')
  expect(text).toContain('Per done task (3 done tasks with data)')
  // times 10m, 30m, 40m: avg 27m, median 30m; tokens 1k, 3k, 4k: avg 2.7k, median 3k
  expect(text).toMatch(/time\s+avg 27m · median 30m/)
  expect(text).toMatch(/tokens\s+avg 2\.7k · median 3k/)
  expect(text).toMatch(/tries\s+avg 1\.3 per task/)
  expect(text).toContain('67% of done tasks (2 of 3)')
  expect(text).not.toContain('Whole team')
  expect(text).toMatch(/with data\s+3 of 4 tasks/)
})

test('stats: archived tasks are included and said; a task on the board wins over its archived copy', () => {
  const tasks = [task('T-5', {}, [[10, 100]])]
  const archived = [task('T-1', {}, [[10, 100]], 60 * 24 * 30), task('T-5', {}, [[99, 99_999]])]
  const text = statsReport({ tasks, archived, nowMs: NOW })
  expect(text).toContain('(2 tasks, incl. 1 archived)')
  expect(text).toMatch(/worker time\s+20m/)
  expect(statsReport({ tasks, archived: [], archiveProblem: 'x is broken', nowMs: NOW })).toContain('Archived tasks are not counted: x is broken')
})

test('stats: the range is days or an id range; anything else gives the usage line', () => {
  expect(parseStatsRange('')).toEqual({ kind: 'all' })
  expect(parseStatsRange('7d')).toEqual({ kind: 'days', days: 7 })
  expect(parseStatsRange('T-130..T-100')).toEqual({ kind: 'ids', from: 100, to: 130 })
  expect(parseStatsRange('t100..130')).toEqual({ kind: 'ids', from: 100, to: 130 })
  expect(parseStatsRange('soon').kind).toBe('bad')
  expect(parseStatsRange('0d').kind).toBe('bad')
  const old = task('T-1', { updated_at: iso(60 * 24 * 10) })
  expect(inRange(old, { kind: 'days', days: 7 }, NOW)).toBe(false)
  expect(inRange(old, { kind: 'days', days: 14 }, NOW)).toBe(true)
  expect(inRange(task('T-120'), { kind: 'ids', from: 100, to: 130 }, NOW)).toBe(true)
  expect(inRange(task('T-131'), { kind: 'ids', from: 100, to: 130 }, NOW)).toBe(false)
  const text = statsReport({ tasks: [task('T-1', {}, [[5, 10]]), task('T-2', {}, [[7, 10]]), task('T-3', {}, [[9, 10]])], range: { kind: 'ids', from: 2, to: 3 }, nowMs: NOW })
  expect(text).toContain('stats · T-2..T-3 (2 tasks)')
  expect(statsReport({ tasks: [old], range: { kind: 'days', days: 7 }, nowMs: NOW })).toContain('No tasks in this range.')
})

test('stats: an empty board says so', () => {
  const text = statsReport({ tasks: [], nowMs: NOW })
  expect(text).toContain('(0 tasks)')
  expect(text).toContain('No tasks yet.')
})

test('stats: outcomes, origins and days are read from what the board keeps', () => {
  expect(failReason('try 1: did it → tests failed: `npm test` (exit 1). x')).toBe('tests')
  expect(failReason('try 2 (role docs): ok → conflicts with the latest main')).toBe('clash')
  expect(failReason('try 1: done → changed files outside the task (a.ts); allowed: b.ts')).toBe('scope')
  expect(failReason('try 3: stopped: paused by the owner')).toBe('stopped')
  expect(failReason('try 1: restarted: the task was changed (details)')).toBe('stopped')
  expect(failReason('try 1: rejected by the owner: too long')).toBe('rejected')
  expect(failReason('try 1: tests failed → merged into main (abc)')).toBe(null)
  expect(failReason('moved to the backlog')).toBe(null)
  expect(mergedHow({ history: ['try 1: x → merged into main (abc)'] })).toBe('own')
  expect(mergedHow({ history: ['try 1: x → checks passed; ready for review', 'try 1: approved by the owner → merged into main (abc); approved by the owner'] })).toBe('approved')
  expect(mergedHow({ history: [] })).toBe(null)
  expect(originKey({ origin: { by: 'scout', scout: 'bugs', why: '', at: '' } })).toBe('scout bugs')
  expect(originKey({})).toBe('unknown')
  const tasks = [
    task('T-1', { history: ['try 1: a → tests failed: x', 'try 2: b → merged into main (1)'], origin: { by: 'owner', why: 'w', at: iso(60) } }, [[10, 100], [10, 100]]),
    task('T-2', { role: 'docs', history: ['try 1: approved by the owner → merged into main (2); approved by the owner'] }, [[5, 50]]),
  ]
  const text = statsReport({ tasks, nowMs: NOW })
  expect(text).toMatch(/merged on its own +▇+ +1 +50%/)
  expect(text).toMatch(/approved by you +▇+ +1 +50%/)
  expect(text).toMatch(/tests failed +▇+ +1\n/)
  expect(text).toMatch(/clash with main +0\n/)
  expect(text).toMatch(/♟ you +▇+ +1 +50%  avg +200 tok/)
  expect(text).toMatch(/docs +▇+ +1 +50%  avg +50 tok/)
  expect(text).toMatch(/Today +▇+ +2 +25m/)
  expect(text).toContain('Time waiting for you is not shown')
  expect(statsReport({ tasks, nowMs: NOW, full: true })).toContain("time waiting for you is not shown: history lines carry no times, so it")
})

test('stats: a try left with no end time by an older board is closed once when the board is read, so the board total and stats agree', () => {
  const t = task('T-1', { updated_at: iso(50), runs: [{ started: iso(60) }, { started: iso(58), ended: iso(55), tokens: 10 }, { started: iso(54) }] })
  const read = (x: typeof t) => readBoard(JSON.stringify({ version: 1, tasks: [x] }))
  const r = read(t)
  expect(r.migrated).toBe(1)
  // 2m (to the next try) + 3m + 4m (to the last change), not 54 minutes up to now
  expect(r.board.tasks[0]!.runs!.map(x => x.ended)).toEqual([iso(58), iso(55), iso(50)])
  expect(taskFigures(r.board.tasks[0]!, NOW).ms).toBe(9 * 60_000)
  expect(boardTotal(r.board, NOW).ms).toBe(9 * 60_000)
  expect(statsReport({ tasks: r.board.tasks, nowMs: NOW })).not.toContain('no end time')
  // a running task's last try is left open and counts up to now
  const doing = read({ ...t, status: 'doing' }).board.tasks[0]!
  expect(doing.runs!.at(-1)!.ended).toBeUndefined()
  expect(taskFigures(doing, NOW).ms).toBe((2 + 3 + 54) * 60_000)
})

/** One assistant line of a Claude Code session log, with only what leadCalls reads (plus a content block it must ignore). */
const logLine = (id: string, minAgo: number, u: { i?: number; o?: number; cr?: number; cc?: number }, over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'assistant', isSidechain: false, timestamp: iso(minAgo), message: { id, model: 'm', content: [{ type: 'text', text: 'secret words' }], usage: { input_tokens: u.i ?? 0, output_tokens: u.o ?? 0, cache_read_input_tokens: u.cr ?? 0, cache_creation_input_tokens: u.cc ?? 0 } }, ...over })

test('stats: a scout run adds its tokens and time to scouts.json, and the rest of the file is kept', () => {
  const mem = scoutMemoryText([{ name: 'bugs', last_run: iso(5), last_report: 'all fine' }])
  let text = addScoutRun(mem, 'bugs', { endMs: NOW, ms: 120_000, tokens: { input: 1000, output: 500, cache_write: 500, cache_read: 3000 } })
  text = addScoutRun(text, 'bugs', { endMs: NOW - 86_400_000 * 3, ms: 60_000 })
  text = addScoutRun(text, 'docs', { endMs: NOW, ms: 30_000, tokens: { input: 700 } })
  expect(parseScoutMemory(text).bugs?.last_report).toBe('all fine')
  const u = parseScoutUsage(text)
  // each kind is kept apart, not one sum
  expect(u.bugs).toMatchObject({ runs: 2, tokens: { input: 1000, output: 500, cache_write: 500, cache_read: 3000 }, ms: 180_000 })
  expect(u.bugs!.days['2026-11-13']).toEqual({ runs: 1, tokens: { input: 1000, output: 500, cache_write: 500, cache_read: 3000 }, ms: 120_000 })
  expect(u.docs?.tokens).toEqual({ input: 700 })
  // a later save of the scouts' memory (which knows nothing of usage) keeps it
  const saved = keepScoutUsage(scoutMemoryText([{ name: 'bugs', last_run: iso(1), last_report: 'new' }]), text)
  expect(parseScoutUsage(saved)).toEqual(u)
  expect(parseScoutMemory(saved).bugs?.last_report).toBe('new')
  expect(parseScoutUsage('not json')).toEqual({})
  // the range: the last 2 days leave out the run 3 days ago
  const both = { input: 1700, output: 500, cache_write: 500, cache_read: 3000 }
  expect(scoutTotals(u, {})).toEqual({ runs: 3, tokens: both, ms: 210_000 })
  expect(scoutTotals(u, rangeSpan({ kind: 'days', days: 2 }, [], NOW))).toEqual({ runs: 2, tokens: both, ms: 150_000 })
})

test('stats: the lead is summed from session log lines, each call once, main chat only', () => {
  const jsonl = [
    logLine('a', 10, { i: 2, o: 80, cr: 900, cc: 18 }),
    logLine('a', 10, { i: 2, o: 98, cr: 900, cc: 18 }), // the same call, written again with its final count
    logLine('b', 60 * 24 * 5, { i: 1000 }),
    logLine('c', 5, { i: 500 }, { isSidechain: true }),
    JSON.stringify({ type: 'user', message: { content: 'hi', usage: { input_tokens: 9 } } }),
    'broken {',
    '',
  ].join('\n')
  const calls = leadCalls(jsonl)
  expect(calls.length).toBe(2)
  // each kind kept apart: input, output, cache writes (cache_creation) and cache reads
  expect(leadTotals(calls, {})).toEqual({ calls: 2, tokens: { input: 1002, output: 98, cache_write: 18, cache_read: 900 } })
  expect(leadTotals(calls, rangeSpan({ kind: 'days', days: 1 }, [], NOW))).toEqual({ calls: 1, tokens: { input: 2, output: 98, cache_write: 18, cache_read: 900 } })
  expect(projectFolderName('/Users/me/repos/my.app')).toBe('-Users-me-repos-my-app')
})

test('stats: the whole team adds up lead, workers and scouts, and gives tokens per merged task', () => {
  const tasks = [task('T-1', {}, [[10, 1000]]), task('T-2', {}, [[10, 3000]]), task('T-3', { status: 'doing' }, [[5, 1000]])]
  const lead = leadCalls([logLine('a', 10, { i: 4000 }), logLine('b', 60 * 24 * 20, { i: 90_000 })].join('\n'))
  const scouts = parseScoutUsage(addScoutRun(null, 'bugs', { endMs: NOW, ms: 60_000, tokens: { input: 2000 } }))
  const text = statsReport({ tasks, nowMs: NOW, team: { lead, leadSessions: 1, scouts, sessionUsd: 1.5 } })
  expect(text).toContain('Whole team (all time)')
  expect(text).toMatch(/◆ lead +▇{16} +94k tokens · 2 calls · 1 session\n/)
  expect(text).toMatch(/▸ workers +▇ +5k tokens · 3 tries/)
  expect(text).toMatch(/⌕ scouts +▂ +2k tokens · 1 run · 1m/)
  expect(text).toMatch(/total\s+101k in all, about 101k billed\*/)
  expect(text).toMatch(/per merged\s+50\.5k in all, about 50\.5k billed per merged task \(2 merged\)/)
  expect(text).toContain("symcc doesn't know the model prices (this session so")
  expect(text).toContain('$1.50')
  expect(statsReport({ tasks, nowMs: NOW, full: true, team: { lead, leadSessions: 1, scouts } })).toMatch(/1 session, from Claude\s+Code's session logs/)
  // the last 7 days: the lead's call 20 days ago is left out
  const week = statsReport({ tasks, range: { kind: 'days', days: 7 }, nowMs: NOW, team: { lead, scouts } })
  expect(week).toContain('Whole team (the last 7 days)')
  expect(week).toMatch(/lead\s+▇{12}▅\s+4k tokens · 1 call/)
  expect(week).toMatch(/total\s+11k in all/)
  // no logs: the lead is said to be left out, the rest still adds up
  const none = statsReport({ tasks, nowMs: NOW, team: { leadProblem: 'no session logs in ~/x' } })
  expect(none).toContain('not counted: no session logs in ~/x')
  expect(none).toMatch(/total\s+5k in all, about 5k billed\* \(without the lead\)/)
})

test('stats: an id range counts the lead and scouts over the time its tasks span', () => {
  const tasks = [task('T-1', { updated_at: iso(60 * 24 * 9) }, [[10, 1000]], 60 * 24 * 10), task('T-2', {}, [[10, 3000]])]
  const lead = leadCalls([logLine('old', 60 * 24 * 9.5, { i: 700 }), logLine('new', 10, { i: 9000 })].join('\n'))
  const text = statsReport({ tasks, range: { kind: 'ids', from: 1, to: 1 }, nowMs: NOW, team: { lead } })
  expect(text).toContain('Whole team (T-1..T-1; lead and scouts over the time these tasks span)')
  expect(text).toMatch(/lead\s+▇+▂?\s+700 tokens · 1 call/)
  expect(text).toMatch(/total\s+1.7k in all/)
})

test('stats: a worker try keeps its kinds apart, and the report shows them with a billed-equivalent estimate', () => {
  const t = task('T-1', { runs: [{ started: iso(60), ended: iso(50), tokens: { input: 1000, output: 2000, cache_write: 4000, cache_read: 100_000 } }] })
  const team = { lead: leadCalls(logLine('a', 10, { i: 10, o: 20, cr: 1000, cc: 40 })) }
  const text = statsReport({ tasks: [t], nowMs: NOW, team })
  // the summary: tokens in plain words, the kinds on one line under, and a short footnote for billed
  expect(text).toMatch(/tokens\s+107k in all, about 26k billed\*\n\s+input 1k · output 2k · cache write 4k · cache read 100k\n/)
  expect(text).toContain('* billed (an estimate): input ×1, output ×5, cache write ×1.25, cache read ×0.1')
  expect(text).not.toContain('an estimate: each kind weighed')
  // the whole team: each part and the total with their kinds
  expect(text).toMatch(/lead\s+▂\s+1.1k tokens · 1 call\n\s+input 10 · output 20 · cache write 40 · cache read 1k/)
  expect(text).toMatch(/workers\s+▇{16}\s+107k tokens · 1 try\n\s+input 1k · output 2k · cache write 4k · cache read 100k/)
  expect(text).toMatch(/total\s+108.1k in all, about 26\.3k billed\*\n\s+input 1k · output 2k · cache write 4k · cache read 101k/)
  // the full view adds the long billed-equivalent lines
  const fullText = statsReport({ tasks: [t], nowMs: NOW, team, full: true })
  expect(fullText).toMatch(/billed-eq\.\s+26k \(an estimate: each kind weighed by its usual price compared\n\s+with input \(input 1, cache write 1\.25, cache read 0\.1, output 5\)\)/)
  expect(fullText).toMatch(/billed-eq\.\s+26\.3k \(an estimate/)
})

test('stats: the billed-equivalent weighs input 1, cache write 1.25, cache read 0.1 and output 5, and leaves out unsplit tokens', () => {
  expect(billedTokens({ input: 1000, output: 100, cache_write: 400, cache_read: 10_000 })).toBe(1000 + 500 + 500 + 1000)
  expect(billedTokens({})).toBe(0)
  expect(billedTokens({ input: 10, unsplit: 5000 })).toBe(10)
  expect(tokenCount({ input: 10, output: 1, cache_write: 2, cache_read: 3, unsplit: 4 })).toBe(20)
  expect(billedText({ input: 1000, unsplit: 2000 })).toMatch(/^1k \(an estimate: .*; leaves out 2k unsplit tokens, saved before the kinds were kept apart\)$/)
  expect(fmtTokenKinds({ cache_read: 5, unsplit: 7, input: 1 })).toBe('input 1 · cache read 5 · unsplit 7')
})

test('stats: old saved runs with one number are migrated once, kept as-is and shown as unsplit', () => {
  // board.json: a try's tokens and the archived totals
  const old = { ...task('T-1', { runs: [] }), runs: [{ started: iso(60), ended: iso(50), tokens: 5000 }, { started: iso(40), ended: iso(30), tokens: { input: 10 } }] }
  const r = readBoard(JSON.stringify({ version: 1, tasks: [old], archived: { done: 1, dropped: 0, tries: 1, ms: 60_000, tokens: 300 } }))
  expect(r.migrated).toBe(2)
  expect(r.board.tasks[0]!.runs!.map(x => x.tokens)).toEqual([{ unsplit: 5000 }, { input: 10 }])
  expect(r.board.archived!.tokens).toEqual({ unsplit: 300 })
  expect(readBoard(JSON.stringify(r.board)).migrated).toBe(0)
  const text = statsReport({ tasks: r.board.tasks, nowMs: NOW })
  expect(text).toMatch(/tokens\s+5k in all, about 10 billed\* \(leaves out 5k unsplit\)\n\s+input 10 · unsplit 5k\n/)
  expect(statsReport({ tasks: r.board.tasks, nowMs: NOW, full: true })).toMatch(/billed-eq\.\s+10 \([^]*leaves out 5k unsplit tokens/)
  // archive.json: its tasks' tries too
  const a = readArchive(JSON.stringify({ version: 1, tasks: [{ ...old, status: 'done' }] }))
  expect(a.migrated).toBe(1)
  expect(a.archive.tasks[0]!.runs![0]!.tokens).toEqual({ unsplit: 5000 })
  expect(readArchive(archiveText(a.archive)).migrated).toBeUndefined()
  // scouts.json: the usage totals, all and per day
  const scouts = JSON.stringify({ scouts: {}, usage: { bugs: { runs: 2, tokens: 900, ms: 10, days: { '2026-11-13': { runs: 1, tokens: 400, ms: 5 } } } } })
  const moved = migrateScoutUsage(scouts)!
  expect(parseScoutUsage(moved).bugs).toEqual({ runs: 2, tokens: { unsplit: 900 }, ms: 10, days: { '2026-11-13': { runs: 1, tokens: { unsplit: 400 }, ms: 5 } } })
  expect(migrateScoutUsage(moved)).toBe(null)
  expect(migrateScoutUsage(addScoutRun(moved, 'bugs', { endMs: NOW, ms: 1, tokens: { input: 1 } }))).toBe(null)
  expect(parseScoutUsage(addScoutRun(moved, 'bugs', { endMs: NOW, ms: 1, tokens: { input: 1 } })).bugs!.tokens).toEqual({ input: 1, unsplit: 900 })
})

test('stats: a bar is scaled to the biggest value, at most 16 blocks, and a small value still shows', () => {
  expect(bar(16, 16)).toBe('▇'.repeat(16))
  expect(bar(8, 16)).toBe('▇'.repeat(8))
  expect(bar(1, 3)).toBe('▇▇▇▇▇▂') // 5.33 blocks
  expect(bar(2, 3)).toBe('▇▇▇▇▇▇▇▇▇▇▅') // 10.67 blocks
  expect(bar(1, 1000)).toBe('▂')
  expect(bar(0, 10)).toBe('')
  expect(bar(5, 0)).toBe('')
  expect(bar(20, 10)).toBe('▇'.repeat(16))
  expect(bar(3, 4, 8)).toBe('▇'.repeat(6))
})

test('stats: "full" anywhere in the words asks for the full view; the rest is the range', () => {
  expect(parseStatsArgs('')).toEqual({ full: false, range: '' })
  expect(parseStatsArgs('full')).toEqual({ full: true, range: '' })
  expect(parseStatsArgs('7d FULL')).toEqual({ full: true, range: '7d' })
  expect(parseStatsArgs('full T-1..T-9')).toEqual({ full: true, range: 'T-1..T-9' })
})

test('stats: a long line is wrapped under its text, within 80 columns', () => {
  const l = `  dollars      ${'word '.repeat(30)}`
  const w = wrapLine(l)
  expect(w.length).toBeGreaterThan(1)
  for (const x of w) expect(x.length).toBeLessThanOrEqual(80)
  expect(w[1]!.startsWith(' '.repeat(15) + 'word')).toBe(true)
  expect(wrapLine('short')).toEqual(['short'])
})

/** Five tasks with known origins, roles, outcomes and days, for the bar charts. */
function knownTasks(): SymccTask[] {
  const scout = (s: string) => ({ origin: { by: 'scout' as const, scout: s, why: '', at: '' } })
  const merged = { history: ['try 1: x → merged into main (1)'] }
  return [
    task('T-1', { ...merged, origin: { by: 'lead', why: '', at: '' } }, [[10, 1000]]),
    task('T-2', { ...merged, origin: { by: 'lead', why: '', at: '' } }, [[20, 2000]]),
    task('T-3', { ...merged, origin: { by: 'owner', why: '', at: '' }, role: 'docs' }, [[30, 4000]]),
    task('T-4', { history: ['try 1: x → tests failed: y', 'try 2: approved by the owner → merged into main (2); approved by the owner'], ...scout('gaps-bot') }, [[40, 8000], [5, 0]]),
    task('T-5', { status: 'todo', ...scout('test-gaps'), updated_at: iso(60 * 24 * 2) }),
  ]
}

test('stats: the summary view shows bars with counts and percentages for a known set of tasks', () => {
  const text = statsReport({ tasks: knownTasks(), nowMs: NOW, team: { leadProblem: 'no logs' } })
  const lines = text.split('\n')
  // the one-line summary
  expect(lines[2]).toBe('4 done · 1h 45m of work · 15k tokens · 75% right first try')
  // by status: 4 done is the biggest (16 blocks), 1 to do is a quarter (4 blocks)
  expect(text).toContain(`  done         ${'▇'.repeat(16)}    4  80%`)
  expect(text).toContain(`  to do        ${'▇'.repeat(4).padEnd(16)}    1  20%`)
  // where tasks came from: lead 2, all scouts 2 (each scout on its own line), you 1
  expect(text).toMatch(/◆ lead +▇{16} +2 +40%  avg +1\.5k tok · +15m/)
  expect(text).toMatch(/⌕ all scouts +▇{16} +2 +40%/)
  expect(text).toMatch(/\n {6}gaps-bot +▇{8} +1 +20%/)
  expect(text).toMatch(/\n {6}test-gaps +▇{8} +1 +20%/)
  expect(text).toMatch(/♟ you +▇{8} +1 +20%/)
  // how tasks ended and failed tries
  expect(text).toMatch(/merged on its own +▇{16} +3 +75%/)
  expect(text).toMatch(/approved by you +▇{5}▂ +1 +25%/)
  // the biggest tasks by tokens: T-4 biggest, T-1 an eighth
  expect(text).toMatch(/Most tokens\n {2}T-4 +task T-4 +▇{16} +8k\n {2}T-3 +task T-3 +▇{8} +4k/)
  expect(text).toMatch(/\n {2}T-1 +task T-1 +▇{2} +1k\n/)
  // the days: oldest first, today last
  expect(text).toMatch(/Today +▇{16} +4 +1h 45m · +15k tokens/)
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(80)
})

test('stats: the summary keeps every figure of the full view; full only adds the explanations', () => {
  const lead = leadCalls([logLine('a', 10, { i: 4000, o: 10, cr: 90_000, cc: 50 })].join('\n'))
  const scouts = parseScoutUsage(addScoutRun(null, 'gaps-bot', { endMs: NOW, ms: 60_000, tokens: { input: 2000 } }))
  const input = { tasks: knownTasks(), nowMs: NOW, team: { lead, leadSessions: 3, scouts, sessionUsd: 2.25 } }
  const short = statsReport(input)
  const full = statsReport({ ...input, full: true })
  for (const want of ['4 done', 'to do ', 'worker time  1h 45m', 'with data    4 of 5 tasks', '1 call · 3 sessions', '5 tries', '1 run · 1m', 'per merged', '$2.25',
    'avg 26m · median 25m', 'avg 3.8k · median 3k (in all)', 'avg 1.3 per task', '75% of done tasks (3 of 4)', 'lead time    avg 1h 00m · median 1h 00m (made to done, 4 tasks)',
    'avg 21m', 'avg 3k in all', 'Most time', 'input 4k · output 10 · cache write 50 · cache read 90k', 'Failed tries (1, from history)']) {
    expect(short).toContain(want)
    expect(full).toContain(want)
  }
  expect(full).toContain('billed-eq.')
  expect(full).toMatch(/from Claude\s+Code's session logs/)
  expect(short).toContain('Every detail: /symcc-stats full')
  for (const l of [...short.split('\n'), ...full.split('\n')]) expect(l.length).toBeLessThanOrEqual(80)
})

test('stats: zero tasks shows a clear "no tasks yet" line, in both views', () => {
  expect(statsReport({ tasks: [], nowMs: NOW })).toBe('symcc stats · all tasks (0 tasks)\n\nNo tasks yet.')
  expect(statsReport({ tasks: [], nowMs: NOW, full: true })).toContain('No tasks yet.')
})

test('stats: wide titles (Japanese, emoji) are cut and padded by screen width, never splitting a character', () => {
  expect(textWidth('abc')).toBe(3)
  expect(textWidth('日本語')).toBe(6)
  expect(textWidth('🚀🎉')).toBe(4)
  expect(cutTitle('a'.repeat(40))).toBe(`${'a'.repeat(34)}…`)
  expect(cutTitle('short title')).toBe('short title')
  const jp = 'データベースの接続をもっと速くして、ログに残すようにする'
  const emoji = '🚀 launch 🎉 party 👨‍👩‍👧 family 🐛 bug fix 🔥🔥🔥🔥🔥🔥🔥🔥'
  for (const t of [jp, emoji]) {
    const c = cutTitle(t)
    expect(textWidth(c)).toBeLessThanOrEqual(35)
    expect(c.endsWith('…')).toBe(true)
    expect(t.startsWith(c.slice(0, -1))).toBe(true)
    expect(c).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\u200D…/)
  }
  const tasks = [task('T-1', { title: jp }, [[30, 8000]]), task('T-2', { title: emoji }, [[20, 4000]]), task('T-3', {}, [[10, 1000]])]
  const text = statsReport({ tasks, nowMs: NOW })
  expect(text).not.toContain('\uFFFD')
  const rows = text.split('\n').filter(l => /^ {2}T-[123] /.test(l))
  expect(rows.length).toBe(6)
  for (const l of text.split('\n')) expect(textWidth(l)).toBeLessThanOrEqual(80)
  // the bars start at the same screen column in every row
  for (const l of rows) expect(textWidth(l.slice(0, l.indexOf('▇')))).toBe(2 + 6 + 1 + 35 + 1)
})

test('stats: investigations end "answered", are counted on their own, and stay out of the done, first-try and merge figures', () => {
  const inv = (id: string, over: Partial<SymccTask>, tries: [number, number?][]) => {
    const t = task(id, { kind: 'investigation', role: 'researcher', ...over } as Partial<SymccTask>, tries)
    return { ...t, runs: t.runs?.map(r => ({ ...r, ended_by: 'finished' as const, ended_note: 'answered' })) }
  }
  expect(mergedHow({ kind: 'investigation', history: ['try 1: the owner read the answer → done (nothing merged)'] })).toBe('answered')
  const tasks = [
    ...knownTasks(),
    inv('T-6', { history: ['try 1: answered: x', 'try 1: the owner read the answer → done (nothing merged)'] }, [[10, 3000], [20, 5000]]),
    inv('T-7', { status: 'review', history: ['try 1: answered: y'] }, [[30, 2000]]),
  ]
  for (const full of [false, true]) {
    const text = statsReport({ tasks, nowMs: NOW, full, team: { leadProblem: 'no logs' } })
    // the summary: still 4 done change tasks, 75% right first try (T-6 took two tries but is not counted)
    expect(text.split('\n')[2]).toBe('4 done · 2 answered · 2h 45m of work · 25k tokens · 75% right first try')
    expect(text).toContain('Investigations (2, 2 answered; not in done, first-try or merge figures)')
    expect(text).toContain('  answered     2 of 2 (1 read by you, 1 waiting to be read)')
    expect(text).toContain('  time         1h 00m in all · avg 30m per investigation')
    expect(text).toContain('  tokens       10k in all · avg 5k per investigation')
    expect(text).toContain('  tries        3 in all · avg 1.5 per investigation')
    expect(text).toContain('75% of done tasks (3 of 4)')
    expect(text).toContain('Per done task (4 done tasks with data, investigations left out)')
    expect(text).toMatch(/How tasks ended \(5 done tasks\)/)
    expect(text).toMatch(/answered \(investigation\) +[▇▅▂]+ +1 +20%/)
    expect(text).not.toContain('not clear from history')
    // the most tokens list is of change tasks only
    expect(text).not.toMatch(/Most tokens[^]*T-6/)
    for (const l of text.split('\n')) expect(l.length).toBeLessThanOrEqual(80)
  }
  const none = statsReport({ tasks: knownTasks(), nowMs: NOW })
  expect(none).toContain('Investigations (0, 0 answered;')
  expect(none.split('\n')[2]).toBe('4 done · 1h 45m of work · 15k tokens · 75% right first try')
})
