import { expect } from 'claude-code/testing'
import { test } from './reset'
import { parseOvertimeAnswer } from '../hooks/core/task'
import { waitOrder } from '../hooks/core/panel'
import type { SymccTask } from '../types'

// T-359 made these pass the strict type check; they must still work the same way.

test('waitOrder puts each task after the tasks it waits for, ties by the given order', () => {
  const t = (id: string, after: string[] = []): SymccTask => ({ id, title: id, details: '', files: [], status: 'todo', note: '', priority: 0, after, attempts: 0, timeline: [], branch: null, created_at: '', updated_at: '' })
  const byId = (x: SymccTask, y: SymccTask) => x.id.localeCompare(y.id)
  expect(waitOrder([t('A', ['C']), t('B'), t('C')], byId).map(x => x.id)).toEqual(['B', 'C', 'A'])
  expect(waitOrder([], byId)).toEqual([])
  // a loop keeps tie order at the end
  expect(waitOrder([t('A', ['B']), t('B', ['A']), t('C')], byId).map(x => x.id)).toEqual(['C', 'A', 'B'])
})

test('parseOvertimeAnswer reads a bare number (no unit words) as minutes', () => {
  expect(parseOvertimeAnswer('45')).toEqual({ add: 45 })
  expect(parseOvertimeAnswer('45 more')).toEqual({ add: 45 })
  expect(parseOvertimeAnswer('2 hours')).toEqual({ add: 120 })
  expect(parseOvertimeAnswer('3 days')).toBeUndefined()
})
