// The board panel's view stays under Claude Code's 4 MB limit on one plugin value: old done and dropped tasks are
// slimmed (no history, details or long parts), recent ones and open ones stay whole, and a view that is still too
// big slims every finished task.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { slimView, VIEW_MAX_CHARS, VIEW_WHOLE_MS } from '../hooks/claude/panel'
import type { SymccView } from '../types'

const now = Date.parse('2026-11-22T12:00:00Z')
const at = (msAgo: number) => new Date(now - msAgo).toISOString()
const long = 'x'.repeat(5000)

function task(id: string, status: string, msAgo: number) {
  return { id, title: id, status, details: long, note: '', after: [], files: [], attempts: 1, created_at: at(msAgo), updated_at: at(msAgo), history: [{ at: at(msAgo), kind: 'merged', text: long }] }
}

function viewOf(tasks: unknown[]): SymccView {
  return { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } as unknown as SymccView
}

test('old finished tasks are slimmed, recent and open ones stay whole', () => {
  const v = slimView(viewOf([task('T-1', 'done', VIEW_WHOLE_MS + 60_000), task('T-2', 'done', 60_000), task('T-3', 'todo', VIEW_WHOLE_MS * 3), task('T-4', 'dropped', VIEW_WHOLE_MS * 2)]), now)
  const byId = Object.fromEntries((v.tasks as unknown as { id: string; details: string; history: unknown[] }[]).map(t => [t.id, t]))
  expect(byId['T-1']?.details).toBe('')
  expect(byId['T-1']?.history).toEqual([])
  expect(byId['T-4']?.details).toBe('')
  expect(byId['T-2']?.details).toBe(long)
  expect(byId['T-3']?.details).toBe(long)
})

test('a board with many long finished tasks makes a view under the 4 MB limit', () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => task(`T-${i}`, 'done', i < 900 ? VIEW_WHOLE_MS * 2 : 60_000))
  expect(JSON.stringify(viewOf(tasks)).length).toBeGreaterThan(VIEW_MAX_CHARS)
  expect(JSON.stringify(slimView(viewOf(tasks), now)).length).toBeLessThan(VIEW_MAX_CHARS)
})

test('a view still too big after slimming old tasks slims every finished task', () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => task(`T-${i}`, 'done', 60_000))
  const v = slimView(viewOf(tasks), now)
  expect(JSON.stringify(v).length).toBeLessThan(VIEW_MAX_CHARS)
  expect((v.tasks as unknown as { details: string }[]).every(t => t.details === '')).toBe(true)
})

test('a view over the limit is trimmed, oldest finished tasks first, instead of failing', () => {
  const tasks = Array.from({ length: 4000 }, (_, i) => ({ ...task(`T-${i}`, 'done', 60_000 + i * 1000), details: long.repeat(10), title: long.repeat(10) }))
  const v = { ...viewOf(tasks), archived: Array.from({ length: 200 }, () => ({ id: 'A', details: long.repeat(20) })) }
  const out = slimView(v as unknown as SymccView, now)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
  const ids = (out.tasks as unknown as { id: string }[]).map(t => t.id)
  expect(ids.includes('T-0')).toBe(true)
  expect(ids.includes('T-3999')).toBe(false)
})

test('open tasks stay while finished ones go', () => {
  const tasks = [task('T-open', 'todo', 60_000), ...Array.from({ length: 4000 }, (_, i) => ({ ...task(`T-${i}`, 'done', 60_000 + i), title: long.repeat(10) }))]
  const out = slimView(viewOf(tasks), now)
  expect((out.tasks as unknown as { id: string }[]).some(t => t.id === 'T-open')).toBe(true)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
})
