import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { addScoutRun, failReason, inRange, keepScoutUsage, leadCalls, leadTotals, mean, median, mergedHow, originKey, parseScoutMemory, parseScoutUsage, parseStatsRange, projectFolderName, rangeSpan, scoutMemoryText, scoutTotals, statsReport, taskFigures } from '../hooks/board'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()

/** A task made `ageMin` minutes ago; `tries` are [minutes, tokens] per try, each starting at the task's creation. */
function task(id: string, over: Partial<SymccTask> = {}, tries: [number, number?][] = [], ageMin = 60): SymccTask {
  const runs = tries.map(([min, tokens]) => ({ started: iso(ageMin), ended: iso(ageMin - min), ...(tokens !== undefined ? { tokens } : {}) }))
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
  expect(f.tokens).toBe(1000)
  expect(f.tries).toBe(2)
  expect(taskFigures(task('T-2')).hasData).toBe(false)
})

test('stats: per-task averages leave out tasks with no try data, and say how many', () => {
  const tasks = [task('T-1', {}, [[10, 1000]]), task('T-2', {}, [[30, 3000]]), task('T-3', {}, [[20, 2000], [20, 2000]]), task('T-4')]
  const text = statsReport({ tasks, nowMs: NOW })
  expect(text).toContain('1 task with no try data')
  expect(text).toContain('2. Per task (3 done tasks with data)')
  // times 10m, 30m, 40m: avg 27m, median 30m; tokens 1k, 3k, 4k: avg 2.7k, median 3k
  expect(text).toMatch(/time\s+avg 27m · median 30m/)
  expect(text).toMatch(/tokens\s+avg 2\.7k · median 3k/)
  expect(text).toMatch(/tries\s+avg 1\.3 per task/)
  expect(text).toContain('67% of done tasks (2 of 3)')
  expect(text).not.toContain('Whole team')
  expect(text).toContain('with data      3 of 4 tasks')
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
  expect(text).toContain('stats: T-2..T-3 (2 tasks)')
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
  expect(text).toContain('1 on its own · 1 approved by you')
  expect(text).toContain('tests 1 · clash with main 0')
  expect(text).toMatch(/owner\s+1 task · avg/)
  expect(text).toMatch(/docs\s+1 task · avg/)
  expect(text).toMatch(/Today\s+2 done/)
  expect(text).toContain("time waiting for you can't be read reliably")
})

test('stats: a try left with no end time counts up to the next try, or the task last change, not up to now', () => {
  const t = task('T-1', { updated_at: iso(50), runs: [{ started: iso(60) }, { started: iso(58), ended: iso(55), tokens: 10 }, { started: iso(54) }] })
  // 2m (to the next try) + 3m + 4m (to the last change), not 54 minutes up to now
  expect(taskFigures(t, NOW).ms).toBe(9 * 60_000)
  expect(statsReport({ tasks: [t], nowMs: NOW })).toContain('2 tries with no end time')
  // a running task's last try counts up to now
  expect(taskFigures({ ...t, status: 'doing' }, NOW).ms).toBe((2 + 3 + 54) * 60_000)
})

/** One assistant line of a Claude Code session log, with only what leadCalls reads (plus a content block it must ignore). */
const logLine = (id: string, minAgo: number, u: { i?: number; o?: number; cr?: number; cc?: number }, over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'assistant', isSidechain: false, timestamp: iso(minAgo), message: { id, model: 'm', content: [{ type: 'text', text: 'secret words' }], usage: { input_tokens: u.i ?? 0, output_tokens: u.o ?? 0, cache_read_input_tokens: u.cr ?? 0, cache_creation_input_tokens: u.cc ?? 0 } }, ...over })

test('stats: a scout run adds its tokens and time to scouts.json, and the rest of the file is kept', () => {
  const mem = scoutMemoryText([{ name: 'bugs', last_run: iso(5), last_report: 'all fine' }])
  let text = addScoutRun(mem, 'bugs', { endMs: NOW, ms: 120_000, tokens: 5000 })
  text = addScoutRun(text, 'bugs', { endMs: NOW - 86_400_000 * 3, ms: 60_000 })
  text = addScoutRun(text, 'docs', { endMs: NOW, ms: 30_000, tokens: 700 })
  expect(parseScoutMemory(text).bugs?.last_report).toBe('all fine')
  const u = parseScoutUsage(text)
  expect(u.bugs).toMatchObject({ runs: 2, tokens: 5000, ms: 180_000 })
  expect(u.bugs!.days['2026-11-13']).toEqual({ runs: 1, tokens: 5000, ms: 120_000 })
  expect(u.docs?.tokens).toBe(700)
  // a later save of the scouts' memory (which knows nothing of usage) keeps it
  const saved = keepScoutUsage(scoutMemoryText([{ name: 'bugs', last_run: iso(1), last_report: 'new' }]), text)
  expect(parseScoutUsage(saved)).toEqual(u)
  expect(parseScoutMemory(saved).bugs?.last_report).toBe('new')
  expect(parseScoutUsage('not json')).toEqual({})
  // the range: the last 2 days leave out the run 3 days ago
  expect(scoutTotals(u, {})).toEqual({ runs: 3, tokens: 5700, ms: 210_000 })
  expect(scoutTotals(u, rangeSpan({ kind: 'days', days: 2 }, [], NOW))).toEqual({ runs: 2, tokens: 5700, ms: 150_000 })
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
  expect(leadTotals(calls, {})).toEqual({ calls: 2, tokens: 2018 })
  expect(leadTotals(calls, rangeSpan({ kind: 'days', days: 1 }, [], NOW))).toEqual({ calls: 1, tokens: 1018 })
  expect(projectFolderName('/Users/me/repos/my.app')).toBe('-Users-me-repos-my-app')
})

test('stats: the whole team adds up lead, workers and scouts, and gives tokens per merged task', () => {
  const tasks = [task('T-1', {}, [[10, 1000]]), task('T-2', {}, [[10, 3000]]), task('T-3', { status: 'doing' }, [[5, 1000]])]
  const lead = leadCalls([logLine('a', 10, { i: 4000 }), logLine('b', 60 * 24 * 20, { i: 90_000 })].join('\n'))
  const scouts = parseScoutUsage(addScoutRun(null, 'bugs', { endMs: NOW, ms: 60_000, tokens: 2000 }))
  const text = statsReport({ tasks, nowMs: NOW, team: { lead, leadSessions: 1, scouts, sessionUsd: 1.5 } })
  expect(text).toContain('Whole team (all time)')
  expect(text).toMatch(/lead\s+94k tokens \(2 calls, from Claude Code's session logs, 1 session\)/)
  expect(text).toMatch(/workers\s+5k tokens \(3 tries\)/)
  expect(text).toMatch(/scouts\s+2k tokens \(1 run, 1m\)/)
  expect(text).toMatch(/total\s+101k tokens/)
  expect(text).toMatch(/per merged\s+50\.5k tokens per merged task \(2 merged\)/)
  expect(text).toContain("symcc doesn't know the model prices (this session so far, as /cost says: $1.50")
  // the last 7 days: the lead's call 20 days ago is left out
  const week = statsReport({ tasks, range: { kind: 'days', days: 7 }, nowMs: NOW, team: { lead, scouts } })
  expect(week).toContain('Whole team (the last 7 days)')
  expect(week).toMatch(/lead\s+4k tokens \(1 call/)
  expect(week).toMatch(/total\s+11k tokens/)
  // no logs: the lead is said to be left out, the rest still adds up
  const none = statsReport({ tasks, nowMs: NOW, team: { leadProblem: 'no session logs in ~/x' } })
  expect(none).toContain('not counted: no session logs in ~/x')
  expect(none).toMatch(/total\s+5k tokens \(without the lead\)/)
})

test('stats: an id range counts the lead and scouts over the time its tasks span', () => {
  const tasks = [task('T-1', { updated_at: iso(60 * 24 * 9) }, [[10, 1000]], 60 * 24 * 10), task('T-2', {}, [[10, 3000]])]
  const lead = leadCalls([logLine('old', 60 * 24 * 9.5, { i: 700 }), logLine('new', 10, { i: 9000 })].join('\n'))
  const text = statsReport({ tasks, range: { kind: 'ids', from: 1, to: 1 }, nowMs: NOW, team: { lead } })
  expect(text).toContain('Whole team (T-1..T-1; lead and scouts over the time these tasks span)')
  expect(text).toMatch(/lead\s+700 tokens \(1 call/)
  expect(text).toMatch(/total\s+1.7k tokens/)
})
