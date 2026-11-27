// The health check keeps what it told in S and in .symcc/health-told.json, so a reload tells nothing twice.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { type BoardTask, emptyBoard } from '../hooks/board'
import { checkHealth } from '../hooks/app/health'
import { S, startS, leadQueue } from '../hooks/app/state'
import { fakeHost, memoryFs } from './fake-host'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()
function task(id: string, over: Partial<BoardTask> = {}): BoardTask {
  return { id, title: `task ${id}`, details: '', files: [`src/${id}.ts`], status: 'todo', note: '', priority: 0, after: [], attempts: 0, timeline: [], branch: null, created_at: iso(10), updated_at: iso(10), ...over }
}

test('health: a told pushed-back problem is not told again after a reload or when the task it waits for retries', async () => {
  const files = new Map<string, string>()
  const w = fakeHost({ fs: memoryFs(files) })
  S.root = '/repo'
  S.enabledNow = true
  S.driving = true
  S.fresh = false
  const newer = [task('T-5', { status: 'doing' }), task('T-6', { status: 'review' })]
  const t = task('T-1', { created_at: iso(300), updated_at: iso(300), after: ['T-4'] })
  const at = (tasks: BoardTask[]) => ({ ...emptyBoard(), max_parallel: 1, tasks })
  const told = () => leadQueue.filter(l => l.includes('pushed back')).length
  await checkHealth(w.host, at([t, task('T-4', { status: 'doing' }), ...newer]), NOW)
  expect(told()).toBe(1)
  expect([...files.keys()].some(k => k.endsWith('health-told.json'))).toBe(true)
  // the waiting task itself changed (updated_at) and T-4 got a new try: not told again
  await checkHealth(w.host, at([{ ...t, updated_at: iso(5) }, task('T-4', { status: 'doing', attempts: 2, updated_at: iso(1) }), ...newer]), NOW)
  expect(told()).toBe(1)
  // a reload: S starts again, the saved file is read back: still not told again
  Object.assign(S, startS(), { root: '/repo', enabledNow: true, driving: true, fresh: false })
  await checkHealth(w.host, at([t, task('T-4', { status: 'doing' }), ...newer]), NOW)
  expect(told()).toBe(1)
  // its after list changed: told again
  await checkHealth(w.host, at([{ ...t, after: ['T-4', 'T-5'] }, task('T-4', { status: 'doing' }), ...newer]), NOW)
  expect(told()).toBe(2)
})
