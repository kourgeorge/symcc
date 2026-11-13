import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { failReason, inRange, mean, median, mergedHow, originKey, parseStatsRange, statsReport, taskFigures } from '../hooks/board'

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
  expect(text).toContain("Scout runs aren't counted")
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
