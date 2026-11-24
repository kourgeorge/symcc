// T-967: a task's priority works like Unix nice: a whole number from -20 to 19, 0 for every new task, lower runs
// first, ties by task number (older first). It replaced the growing `order` number.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccTask } from '../types'
import { addTask, emptyBoard, patchTask, ready, searchTasks, boardText, isPriority, priorityError, priorityMark, type Board } from '../hooks/board'
import { upgradeArchiveTask, upgradeTask, withPriority } from '../hooks/core/old-data'

const T = '2026-11-24T10:00:00.000Z'
const W = { why: 'a test' }

/** A board with one todo task per [title, priority], added in that order (T-1, T-2, ...). */
function boardOf(...xs: [string, number][]): Board {
  let b = emptyBoard()
  for (const [title, priority] of xs) b = addTask(b, { origin: W, title }, T)[0]
  b.tasks.forEach((t, i) => (b = patchTask(b, t.id, { priority: xs[i]![1] }, T)))
  return b
}

test('T-967: the start loop takes -2 before -1 before 0 before 3, ties by task number', () => {
  const b = boardOf(['three', 3], ['zero a', 0], ['minus one', -1], ['minus two', -2], ['zero b', 0], ['minus one b', -1])
  expect(ready(b).map(t => t.title)).toEqual(['minus two', 'minus one', 'minus one b', 'zero a', 'zero b', 'three'])
})

test('T-967: a new task gets priority 0, even when the others have other priorities', () => {
  const b = boardOf(['urgent', -5], ['later', 7])
  const [, t] = addTask(b, { origin: W, title: 'new' }, T)
  expect(t.priority).toBe(0)
  expect('order' in t).toBe(false)
  expect(addTask(b, { origin: W, title: 'given', priority: -3 }, T)[1].priority).toBe(-3)
  // a bad one is not kept
  expect(addTask(b, { origin: W, title: 'bad', priority: 1.5 }, T)[1].priority).toBe(0)
})

test('T-967: a priority is a whole number from -20 to 19', () => {
  for (const ok of [-20, -1, 0, 3, 19]) expect([ok, isPriority(ok), priorityError(ok)]).toEqual([ok, true, ''])
  for (const bad of [20, -21, 1.5, 'text', '1', null, NaN]) {
    expect(isPriority(bad)).toBe(false)
    expect(priorityError(bad)).toContain('whole number from -20 to 19')
  }
})

test('T-967: top:N and sort "order" follow the priority, then the task number', () => {
  const b = boardOf(['a', 2], ['b', 0], ['c', -1], ['d', 0])
  const ids = (ts: SymccTask[]) => ts.map(t => t.title)
  expect(ids(searchTasks(b.tasks, 'top:3', Date.parse(T)))).toEqual(['c', 'b', 'd'])
  expect(ids(searchTasks(b.tasks, 'top:10', Date.parse(T)))).toEqual(['c', 'b', 'd', 'a'])
  const text = boardText(b, Date.parse(T), '~/p', 'symcc', undefined, { limit: 2, sort: 'order' })
  expect(text.indexOf('T-3')).toBeLessThan(text.indexOf('T-2'))
  expect(text).not.toContain('T-1 ')
})

test('T-967: the lead\'s board text marks a priority other than 0 and nothing for 0', () => {
  expect([priorityMark(0), priorityMark(-1), priorityMark(2)]).toEqual(['', 'p-1', 'p+2'])
  const text = boardText(boardOf(['normal', 0], ['urgent', -2]), Date.parse(T))
  expect(text).toContain('urgent [p-2]')
  expect(text).not.toContain('normal [')
})

test('T-967: the old order becomes a priority: 10 or less is -1, any other 0, and order is removed', () => {
  expect(withPriority({ id: 'T-1', order: 10 })).toEqual({ id: 'T-1', priority: -1 })
  expect(withPriority({ id: 'T-1', order: 0 })).toEqual({ id: 'T-1', priority: -1 })
  expect(withPriority({ id: 'T-1', order: 11 })).toEqual({ id: 'T-1', priority: 0 })
  expect(withPriority({ id: 'T-1', order: 959 })).toEqual({ id: 'T-1', priority: 0 })
  expect(withPriority({ id: 'T-1', priority: 3 })).toBe(null)
  expect(withPriority({ id: 'T-1', priority: 3, order: 0 })).toEqual({ id: 'T-1', priority: 3 })
  expect(withPriority({ id: 'T-1', priority: 99, order: 5 })).toEqual({ id: 'T-1', priority: -1 })
  expect(withPriority({ id: 'T-1', order: 5 })).toEqual({ id: 'T-1', priority: -1 })
  expect(withPriority({ id: 'T-1', order: 50 })).toEqual({ id: 'T-1', priority: 0 })
  const kept = upgradeTask({ id: 'T-4', title: 'x', status: 'todo', priority: 5, order: 0, origin: W, merge_into: 'main', history: [] })
  expect(kept?.priority).toBe(5)
  expect(kept && 'order' in kept).toBe(false)
  const up = upgradeTask({ id: 'T-2', title: 'x', status: 'todo', order: 4, origin: W, merge_into: 'main', history: [] })
  expect(up?.priority).toBe(-1)
  expect(up && 'order' in up).toBe(false)
  const arch = upgradeArchiveTask({ id: 'T-3', title: 'x', status: 'done', order: 500, history: [] })
  expect(arch).toEqual({ id: 'T-3', title: 'x', status: 'done', priority: 0, history: [] })
})
