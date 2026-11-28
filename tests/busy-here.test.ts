// T-1083: hasWorker and busyHere (hooks/app/state.ts) replace the hand-written worker lookups.
import { expect } from 'claude-code/testing'
import { workers, starting, finishing, approving, hasWorker, busyHere } from '../hooks/app/state'
import { test } from './reset'

test('T-1083: hasWorker is true only while a worker of this session works on the task', () => {
  expect(hasWorker('T-1')).toBe(false)
  workers.set('ag1', { task: 'T-1', worktree: '/wt', branch: 'symcc/T-1', since: 0 })
  expect(hasWorker('T-1')).toBe(true)
  expect(hasWorker('T-2')).toBe(false)
})

test('T-1083: busyHere covers starting, finishing, approving and a running worker', () => {
  expect(busyHere('T-1')).toBe(false)
  starting.add('T-1')
  expect(busyHere('T-1')).toBe(true)
  starting.clear()
  finishing.add('T-1')
  expect(busyHere('T-1')).toBe(true)
  finishing.clear()
  approving.add('T-1')
  expect(busyHere('T-1')).toBe(true)
  approving.clear()
  workers.set('ag1', { task: 'T-1', worktree: '/wt', branch: 'symcc/T-1', since: 0 })
  expect(busyHere('T-1')).toBe(true)
  expect(busyHere('T-2')).toBe(false)
})
