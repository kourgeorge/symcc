// T-1117: one refresh of the task pages' Branch facts updates the view once, and the finished tasks are read again
// only when main's tip moved.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { done, fakeHost, memoryPanel } from './fake-host'
import { S } from '../hooks/app/state'
import { resetBranches, taskBranchesView, BRANCH_CACHE_MS } from '../hooks/app/branches'
import { sha } from './branches-fixture'

test('T-1117: a refresh of 13 tasks updates the view once; finished tasks are read again only when main moves', async () => {
  let tip = sha('aa')
  const calls: string[][] = []
  let updates = 0
  const panel = memoryPanel()
  const counted = { ...panel, updateView: async (f: Parameters<typeof panel.updateView>[0]) => (updates++, panel.updateView(f)) }
  const { host } = fakeHost({
    ui: { panel: counted },
    run: async cmd => {
      const args = cmd.slice(1)
      calls.push(args)
      if (args[0] === 'rev-parse') return done({ stdout: tip + '\n' })
      return done({ exitCode: 1 })
    },
  })
  S.root = '/proj'
  S.gitState = 'ok'
  resetBranches()
  const iso = (n: number) => new Date(Date.UTC(2026, 10, 20, 0, n)).toISOString()
  const task = (id: string, x: Record<string, unknown>) => ({ id, title: id, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: `symcc/${id}`, created_at: iso(0), updated_at: iso(1), ...x })
  const tasks = [
    ...[1, 2, 3].map(n => task(`T-${n}`, {})),
    ...[4, 5, 6, 7, 8].map(n => task(`T-${n}`, { status: 'done', merged: sha(`c${n}`) })),
    ...[9, 10, 11, 12, 13].map(n => task(`T-${n}`, { status: 'dropped' })),
  ]
  const b = { tasks } as never
  const t0 = 1_000_000
  const refresh = async (now: number) => {
    calls.length = 0
    updates = 0
    await Promise.all(taskBranchesView(host, b, now).done)
  }
  await refresh(t0)
  expect(updates).toBe(1)
  const first = calls.length
  expect(first).toBeGreaterThan(3)

  // 31 s later, main unchanged: the open tasks are read again, plus the one rev-parse
  await refresh(t0 + BRANCH_CACHE_MS + 1000)
  expect(updates).toBe(1)
  expect(calls.filter(a => a[0] === 'rev-parse' && a[1] === 'refs/heads/main').length).toBe(1)
  const branchesRead = new Set(calls.flatMap(a => a.filter(x => x.startsWith('symcc/') || x.includes('..symcc/') || x.includes('...symcc/'))))
  expect([...branchesRead].every(x => /T-[123]$/.test(x))).toBe(true)
  expect(calls.some(a => a[0] === 'log' && a.some(x => /^c[4-8]/.test(x)))).toBe(false)

  // main moves: the finished tasks are read again
  tip = sha('bb')
  await refresh(t0 + 2 * (BRANCH_CACHE_MS + 1000))
  expect(updates).toBe(1)
  expect(calls.length).toBeGreaterThan(first - 3)
  expect(calls.some(a => a[0] === 'log' && a.some(x => /^c[4-8]/.test(x)))).toBe(true)
})
