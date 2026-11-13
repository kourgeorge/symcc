import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { type Board, emptyBoard, boardHealth, newFindings, healthText, shareFiles, afterChanges, afterChangedLine, changeLines, OWNER_IDLE_MS } from '../hooks/board'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()

function task(id: string, over: Partial<SymccTask> = {}): SymccTask {
  return { id, title: `task ${id}`, details: '', files: [`src/${id}.ts`], status: 'todo', note: '', question: null, order: 0, after: [], attempts: 0, history: [], branch: null, created_at: iso(10), updated_at: iso(10), ...over }
}
const board = (tasks: SymccTask[], extra: Partial<Board> = {}): Board => ({ ...emptyBoard(), tasks, ...extra })
const reasons = (b: Board) => boardHealth(b, NOW).map(f => `${f.reason}:${f.tasks.join(',')}`)

test('health: a healthy board finds nothing and sends nothing', () => {
  const b = board([task('T-1', { status: 'done' }), task('T-2', { after: ['T-1'] }), task('T-3', { status: 'doing' }), task('T-4', { status: 'waiting', updated_at: iso(5) })])
  expect(boardHealth(b, NOW)).toEqual([])
  expect(newFindings(boardHealth(b, NOW), new Set()).fresh).toEqual([])
})

test('health: stuck on a dropped, failed or missing task', () => {
  const b = board([task('T-5', { status: 'dropped' }), task('T-6', { status: 'failed' }), task('T-7', { after: ['T-5'] }), task('T-8', { status: 'backlog', after: ['T-6'] }), task('T-9', { after: ['T-2'] }), task('T-10', { after: ['T-3'] })], { archived_done: ['T-3'] })
  expect(reasons(b)).toEqual(['stuck:T-7,T-5', 'stuck:T-8,T-6', 'stuck:T-9,T-2'])
  const text = healthText(boardHealth(b, NOW))
  expect(text).toContain('Triage needed')
  expect(text).toContain('T-7 waits on T-5, which was dropped — it will never start')
  expect(text).toContain('T-9 waits on T-2, which is not on the board')
})

test('health: a dependency loop is found once', () => {
  const b = board([task('T-1', { after: ['T-2'] }), task('T-2', { after: ['T-1'] }), task('T-3', { after: ['T-1'] })])
  const f = boardHealth(b, NOW).filter(x => x.reason === 'loop')
  expect(f.length).toBe(1)
  expect(f[0]!.tasks).toEqual(['T-1', 'T-2'])
  expect(f[0]!.text).toContain('T-1 after T-2 after T-1')
})

test('health: starving after 3 changes of its after list, or 2+ hours while newer tasks started', () => {
  const h = ['waits on changed: nothing → T-2', 'waits on changed: T-2 → T-3', 'waits on changed: T-3 → T-4']
  expect(afterChanges({ history: h })).toBe(3)
  // its after list changed 3 times, and it waits only on a newer task
  expect(reasons(board([task('T-1', { history: h, after: ['T-4'], files: ['a/'] }), task('T-4', { status: 'doing', files: ['a/'] })]))).toEqual(['starving:T-1'])
  // waiting on an older task is fair
  expect(reasons(board([task('T-1', { status: 'doing' }), task('T-2', { history: h, after: ['T-1'] })]))).toEqual([])
  // ready for 3 hours while two newer tasks started
  const old = task('T-1', { created_at: iso(180) })
  expect(reasons(board([old, task('T-2', { status: 'doing' }), task('T-3', { status: 'review' })]))).toEqual(['starving:T-1'])
  expect(boardHealth(board([old, task('T-2', { status: 'doing' }), task('T-3', { status: 'review' })]), NOW)[0]!.text).toContain('3+ hours while 2 newer tasks already started')
  // only one newer started, or not old enough: fine
  expect(reasons(board([old, task('T-2', { status: 'doing' }), task('T-3')]))).toEqual([])
  expect(reasons(board([task('T-1', { created_at: iso(60) }), task('T-2', { status: 'doing' }), task('T-3', { status: 'done' })]))).toEqual([])
})

test('health: too serial: a chain of 3+ todo tasks that share no files', () => {
  const chain = [task('T-1'), task('T-2', { after: ['T-1'] }), task('T-3', { after: ['T-2'] })]
  expect(reasons(board(chain))).toEqual(['serial:T-1,T-2,T-3'])
  expect(boardHealth(board(chain), NOW)[0]!.text).toContain('T-1 → T-2 → T-3')
  // neighbours sharing files is a real chain
  const shared = [task('T-1', { files: ['hooks/'] }), task('T-2', { after: ['T-1'], files: ['hooks/core/a.ts'] }), task('T-3', { after: ['T-2'], files: ['hooks/**'] })]
  expect(reasons(board(shared))).toEqual([])
  // two links are not a chain of three
  expect(reasons(board(chain.slice(0, 2)))).toEqual([])
  expect(shareFiles([], ['a'])).toBe(true)
  expect(shareFiles(['docs/x.md'], ['hooks/'])).toBe(false)
})

test('health: a task waiting on the owner over an hour is told once, again only after it changes', () => {
  const t = task('T-4', { status: 'review', updated_at: new Date(NOW - OWNER_IDLE_MS - 60_000).toISOString() })
  const b = board([t])
  expect(reasons(b)).toEqual(['owner:T-4'])
  const first = newFindings(boardHealth(b, NOW), new Set())
  expect(first.fresh.length).toBe(1)
  // the next check finds the same thing: nothing new to tell
  const second = newFindings(boardHealth(b, NOW + 120_000), first.told)
  expect(second.fresh).toEqual([])
  // the task changed (still idle long after): told again
  const changed = board([{ ...t, status: 'waiting', updated_at: new Date(NOW - 2 * OWNER_IDLE_MS).toISOString() }])
  expect(newFindings(boardHealth(changed, NOW), second.told).fresh.length).toBe(1)
})

test('health: no repeat for the same tasks and reason; reset once the problem is gone', () => {
  const b = board([task('T-5', { status: 'dropped' }), task('T-7', { after: ['T-5'] })])
  const a = newFindings(boardHealth(b, NOW), new Set())
  expect(a.fresh.length).toBe(1)
  expect(newFindings(boardHealth(b, NOW), a.told).fresh).toEqual([])
  const fixed = board([task('T-5', { status: 'dropped' }), task('T-7', { updated_at: iso(1) })])
  const c = newFindings(boardHealth(fixed, NOW), a.told)
  expect(c.fresh).toEqual([])
  expect(c.told.size).toBe(0)
})

test('the after list changing writes a "waits on changed" history line', () => {
  expect(afterChangedLine(['T-1'], ['T-1'])).toBe(null)
  expect(afterChangedLine(['T-1'], undefined)).toBe(null)
  expect(afterChangedLine(['T-1'], ['T-2', 'T-3'])).toBe('waits on changed: T-1 → T-2, T-3')
  expect(changeLines({ attempts: 0, files: [], after: ['T-1'] }, { after: [] }, false)).toEqual(['waits on changed: T-1 → nothing'])
})
