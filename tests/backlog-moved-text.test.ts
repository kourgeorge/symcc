import { expect, test } from 'claude-code/testing'
import { backlogMovedText } from '../hooks/core/run-now'

const task = (id: string, status: string, files: string[], extra: object = {}) => ({ id, status, files, ...extra }) as never

test('T-1046: the backlog move reply names open tasks sharing files that are not in after, and the priority', () => {
  const t = task('T-5', 'todo', ['a.ts'], { after: ['T-2'], priority: 3 })
  const all = [t, task('T-1', 'doing', ['a.ts']), task('T-2', 'doing', ['a.ts']), task('T-3', 'done', ['a.ts']), task('T-4', 'todo', ['a.ts']), task('T-6', 'todo', ['b.ts'])]
  expect(backlogMovedText(all, t)).toBe('T-5 moved from the backlog to todo; shares files with T-1 (doing), T-4 (todo); not in its after list; priority 3')
})

test('T-1046: the backlog move reply only adds the priority when nothing overlaps', () => {
  const t = task('T-5', 'todo', ['a.ts'])
  expect(backlogMovedText([t, task('T-6', 'todo', ['b.ts'])], t)).toBe('T-5 moved from the backlog to todo; priority 0')
})
