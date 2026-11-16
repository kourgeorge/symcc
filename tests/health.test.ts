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
  // ready for 3 hours while two newer tasks started (and took the only slot)
  const old = task('T-1', { created_at: iso(180), updated_at: iso(180) })
  const full = { max_parallel: 1 }
  expect(reasons(board([old, task('T-2', { status: 'doing' }), task('T-3', { status: 'review' })], full))).toEqual(['starving:T-1'])
  expect(boardHealth(board([old, task('T-2', { status: 'doing' }), task('T-3', { status: 'review' })], full), NOW)[0]!.text).toContain('3+ hours while 2 newer tasks already started')
  // only one newer started, or not old enough: fine
  expect(reasons(board([old, task('T-2', { status: 'doing' }), task('T-3')], full))).toEqual([])
  expect(reasons(board([task('T-1', { created_at: iso(60), updated_at: iso(60) }), task('T-2', { status: 'doing' }), task('T-3', { status: 'done' })], full))).toEqual([])
  // a free slot: the pump starts it next, so it is not pushed back
  expect(reasons(board([old, task('T-2', { status: 'doing' }), task('T-3', { status: 'review' })], { max_parallel: 2 }))).toEqual([])
})

test('health: a task whose after task merged just now is not pushed back', () => {
  const full = { max_parallel: 1 }
  // made 5 hours ago, waited on T-2 (older work kept it fair), T-2 merged in this very board update
  const waiting = task('T-1', { created_at: iso(300), updated_at: iso(300), after: ['T-2'] })
  const merged = task('T-2', { status: 'done', updated_at: iso(0) })
  const newer = [task('T-3', { status: 'doing' }), task('T-4', { status: 'done' })]
  expect(reasons(board([waiting, merged, ...newer], full))).toEqual([])
  // merged an hour ago: it has been ready only an hour, still fine
  expect(reasons(board([waiting, { ...merged, updated_at: iso(60) }, ...newer], full))).toEqual([])
  // merged 3 hours ago and it still has not started while newer ones did: told
  const told = boardHealth(board([waiting, { ...merged, updated_at: iso(180) }, ...newer], full), NOW)
  expect(told.map(f => `${f.reason}:${f.tasks.join(',')}`)).toEqual(['starving:T-1'])
  expect(told[0]!.text).toContain('could start but has not, and it has waited 3+ hours')
  // changed (or moved back to todo) a minute ago: ready again only now
  expect(reasons(board([{ ...task('T-1', { created_at: iso(300), updated_at: iso(1) }) }, ...newer], full))).toEqual([])
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

test('health: a task waiting over an hour only for the owner\'s files says to commit or stash them, not to answer', () => {
  const old = new Date(NOW - OWNER_IDLE_MS - 60_000).toISOString()
  const files = boardHealth(board([{ ...task('T-4', { status: 'waiting', updated_at: old }), merge_wait: { dirty: ['src/a.ts'], untracked: [], ignored: [] } }]), NOW)
  expect(files.length).toBe(1)
  expect(files[0]!.text).toContain("T-4 waits for the owner's files on main")
  expect(files[0]!.consider).toContain('commit or stash src/a.ts on main')
  expect(files[0]!.consider).not.toContain('answer it')
  // a changed tracked file still says commit or stash; a git-ignored or untracked one says move or rename
  const tracked = boardHealth(board([{ ...task('T-4', { status: 'waiting', updated_at: old }), merge_wait: { dirty: ['src/a.ts'], untracked: [], ignored: [] } }]), NOW)
  expect(tracked[0]!.consider).toContain('commit or stash src/a.ts on main')
  const ignored = boardHealth(board([{ ...task('T-4', { status: 'waiting', updated_at: old }), merge_wait: { dirty: [], untracked: [], ignored: ['.env'] } }]), NOW)
  expect(ignored[0]!.consider).toBe("remind the owner to move or rename .env on main; T-4 then merges on its own (no answer needed)")
  const untracked = boardHealth(board([{ ...task('T-4', { status: 'waiting', updated_at: old }), merge_wait: { dirty: [], untracked: ['b.ts'], ignored: [] } }]), NOW)
  expect(untracked[0]!.consider).toContain('move, rename or commit b.ts on main')
  expect(untracked[0]!.consider).not.toContain('stash')
  // a waiting task with a question is unchanged
  const asked = boardHealth(board([task('T-5', { status: 'waiting', question: 'which one?', updated_at: old })]), NOW)
  expect(asked[0]!.consider).toBe("remind the owner of T-5's question, or answer it yourself if you can")
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
