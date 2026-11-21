import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import type { SymccTask } from '../types'
import { parseSearch, searchTasks, taskMatches, boardText, emptyBoard, type Board } from '../hooks/board'

// T-539: filter words in a search (last:N, top:N, since:, status:, kind:, role:), the same in the panel and the board tool

const NOW = Date.parse('2026-11-19T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: hoursAgo(500), updated_at: hoursAgo(500), ...extra }) as unknown as SymccTask

// done tasks changed 1h, 2h, ... 8h ago (T-1 newest); some to do ones in a run order unlike their numbers
const tasks: SymccTask[] = [
  ...Array.from({ length: 8 }, (_, i) => task(`T-${i + 1}`, 'done', `Done ${i + 1}${i === 0 ? ' notify' : ''}`, { updated_at: hoursAgo(i + 1), kind: i % 2 ? 'bug' : 'feature', role: i === 2 ? 'tester' : undefined })),
  task('T-20', 'todo', 'Third to run', { order: 30 }),
  task('T-21', 'todo', 'First to run', { order: 10 }),
  task('T-22', 'todo', 'Second to run', { order: 20, updated_at: hoursAgo(100) }),
  task('T-23', 'todo', 'Waits for T-20', { order: 5, after: ['T-20'] }),
  task('T-24', 'backlog', 'An idea notify', { order: 1 }),
]
const ids = (ts: SymccTask[]) => ts.map(t => t.id)

test('last:5 status:done: the 5 most recently changed done tasks, newest first', () => {
  expect(ids(searchTasks(tasks, 'last:5 status:done', NOW))).toEqual(['T-1', 'T-2', 'T-3', 'T-4', 'T-5'])
  expect(ids(searchTasks(tasks, 'status:done last:2', NOW))).toEqual(['T-1', 'T-2'])
})

test('top:3: the next 3 to run, in run order (after waits count)', () => {
  expect(ids(searchTasks(tasks, 'top:3', NOW))).toEqual(['T-21', 'T-22', 'T-20'])
  expect(ids(searchTasks(tasks, 'top:10', NOW))).toEqual(['T-21', 'T-22', 'T-20', 'T-23'])
})

test('since:, kind:, role: and status:open filter; filters mix with plain words', () => {
  expect(ids(searchTasks(tasks, 'since:3h', NOW))).toEqual(['T-1', 'T-2', 'T-3'])
  expect(ids(searchTasks(tasks, 'since:2d status:todo', NOW))).toEqual([])
  expect(ids(searchTasks(tasks, 'since:5d status:todo', NOW))).toEqual(['T-22'])
  expect(parseSearch('since:2026-11-19', NOW, 0).sinceMs).toBe(Date.parse('2026-11-19T00:00:00Z'))
  expect(parseSearch('since:2026-11-19', NOW, 120).sinceMs).toBe(Date.parse('2026-11-18T22:00:00Z'))
  expect(ids(searchTasks(tasks, 'kind:bug', NOW))).toEqual(['T-2', 'T-4', 'T-6', 'T-8'])
  expect(ids(searchTasks(tasks, 'role:tester', NOW))).toEqual(['T-3'])
  expect(ids(searchTasks(tasks, 'status:open', NOW))).toEqual(['T-20', 'T-21', 'T-22', 'T-23'])
  expect(ids(searchTasks(tasks, 'notify', NOW))).toEqual(['T-1', 'T-24'])
  expect(ids(searchTasks(tasks, 'notify status:done', NOW))).toEqual(['T-1'])
  expect(ids(searchTasks(tasks, 'kind:feature last:2 done', NOW))).toEqual(['T-1', 'T-3'])
})

test('an unknown filter word (foo:bar) or a bad value stays a plain word', () => {
  const q = parseSearch('foo:bar last:x since:soon status:finished', NOW, 0)
  expect(q.words).toEqual(['foo:bar', 'last:x', 'since:soon', 'status:finished'])
  expect(q.pick).toBeUndefined()
  expect(q.errors[0]).toMatch(/unknown status "finished"/)
  expect(taskMatches(task('T-9', 'todo', 'about foo:bar'), 'foo:bar', NOW)).toBe(true)
  expect(searchTasks(tasks, 'foo:bar', NOW)).toEqual([])
  // a kind not in the known list is an error only when the list is given
  expect(parseSearch('kind:nope', NOW, 0).errors).toEqual([])
  expect(parseSearch('kind:nope', NOW, 0, ['change', 'bug']).errors[0]).toMatch(/unknown kind "nope"/)
})

// T-720: dependency words. A chain T-101 ← T-102 ← T-103 (T-103 waits for T-102, which waits for T-101), a done
// T-100 at its start, a task waiting on a failed one, one waiting on a missing id, and one stuck through a chain.
const deps: SymccTask[] = [
  task('T-100', 'done', 'Done base'),
  task('T-101', 'doing', 'Chain start', { after: ['T-100'] }),
  task('T-102', 'todo', 'Chain middle', { after: ['T-101'] }),
  task('T-103', 'todo', 'Chain end', { after: ['T-102'], kind: 'bug' }),
  task('T-104', 'review', 'Also waits on the start', { after: ['T-101'] }),
  task('T-110', 'failed', 'Broke'),
  task('T-111', 'todo', 'Waits on a failed one', { after: ['T-110'] }),
  task('T-112', 'todo', 'Waits on a missing id', { after: ['T-99'] }),
  task('T-113', 'todo', 'Stuck through a chain', { after: ['T-111'] }),
  task('T-114', 'paused', 'Waits on a failed one too', { after: ['T-110'] }),
]

test('waits-on:T-n: tasks waiting on T-n directly or through a chain; mixes with other words', () => {
  expect(ids(searchTasks(deps, 'waits-on:T-101', NOW))).toEqual(['T-102', 'T-103', 'T-104'])
  expect(ids(searchTasks(deps, 'waits-on:t-101 status:todo', NOW))).toEqual(['T-102', 'T-103'])
  expect(ids(searchTasks(deps, 'waits-on:101 kind:bug', NOW))).toEqual(['T-103'])
  expect(ids(searchTasks(deps, 'waits-on:T-100', NOW))).toEqual(['T-101', 'T-102', 'T-103', 'T-104'])
  expect(ids(searchTasks(deps, 'waits-on:T-110,T-102', NOW))).toEqual(['T-103', 'T-111', 'T-113', 'T-114'])
  expect(ids(searchTasks(deps, 'waits-on:T-99', NOW))).toEqual(['T-112'])
  expect(ids(searchTasks(deps, 'waits-on:T-103', NOW))).toEqual([])
  // a value that isn't an id stays a plain word
  expect(parseSearch('waits-on:soon', NOW, 0).words).toEqual(['waits-on:soon'])
})

test('blocks:T-n: the not-done tasks T-n still waits for, through the chain; a done one ends it', () => {
  expect(ids(searchTasks(deps, 'blocks:T-103', NOW))).toEqual(['T-101', 'T-102'])
  expect(ids(searchTasks(deps, 'blocks:T-103 status:doing', NOW))).toEqual(['T-101'])
  expect(ids(searchTasks(deps, 'blocks:T-113', NOW))).toEqual(['T-110', 'T-111'])
  expect(ids(searchTasks(deps, 'blocks:T-112', NOW))).toEqual([])
  expect(ids(searchTasks(deps, 'blocks:T-101', NOW))).toEqual([])
})

test('stuck: todo tasks held back by a failed, paused, waiting or dropped task, or a missing id', () => {
  expect(ids(searchTasks(deps, 'stuck', NOW))).toEqual(['T-111', 'T-112', 'T-113'])
  expect(ids(searchTasks(deps, 'stuck missing', NOW))).toEqual(['T-112'])
  expect(ids(searchTasks(deps, 'stuck waits-on:T-111', NOW))).toEqual(['T-113'])
  expect(ids(searchTasks(deps, 'stuck top:1', NOW))).toEqual(['T-111'])
  for (const s of ['paused', 'waiting', 'dropped']) {
    const b = [task('T-1', s, 'Held'), task('T-2', 'todo', 'Waits', { after: ['T-1'] })]
    expect(ids(searchTasks(b, 'stuck', NOW))).toEqual(['T-2'])
  }
  // waiting on a doing / review / todo task is a normal wait, not stuck
  expect(ids(searchTasks(deps, 'stuck waits-on:T-101', NOW))).toEqual([])
})

test('board tool: the dependency words filter its rows too', () => {
  const out = boardText({ ...emptyBoard(), tasks: deps as never }, NOW, undefined, 'symcc', 0, { search: 'waits-on:T-101 status:todo' })
  const rows = out.split('\n').filter(l => /^T-\d+/.test(l)).map(l => l.split(' ')[0])
  expect(rows.sort()).toEqual(['T-102', 'T-103'])
})

test('stuck / blocks: an archived done id counts as done, not missing (as depDone)', () => {
  const t2 = [task('T-2', 'todo', 'Waits on an archived done one', { after: ['T-1'] })]
  expect(ids(searchTasks(t2, 'stuck', NOW, ['T-1']))).toEqual([])
  expect(ids(searchTasks(t2, 'stuck', NOW))).toEqual(['T-2'])
  const out = boardText({ ...emptyBoard(), archived_done: ['T-1'], tasks: t2 as never }, NOW, undefined, 'symcc', 0, { search: 'stuck' })
  expect(out.split('\n').filter(l => /^T-\d+/.test(l))).toEqual([])
  // through a chain: T-4 waits on T-3, which waits on the archived done T-1
  const chain = [task('T-3', 'todo', 'Middle', { after: ['T-1'] }), task('T-4', 'todo', 'End', { after: ['T-3'] })]
  expect(ids(searchTasks(chain, 'stuck', NOW, ['T-1']))).toEqual([])
  expect(ids(searchTasks(chain, 'blocks:T-4', NOW, ['T-1']))).toEqual(['T-3'])
})

const board = (): Board =>({ ...emptyBoard(), tasks: tasks as never })

test('board tool: limit / sort are the same as last: / top:, and the line says how many matched in all', () => {
  const show = (f: Parameters<typeof boardText>[5]) => boardText(board(), NOW, undefined, 'symcc', 0, f)
  const rowsOf = (out: string) => out.split('\n').filter(l => /^T-\d+/.test(l)).map(l => l.split(' ')[0])
  const last = show({ search: 'last:3 status:done' })
  expect(rowsOf(last)).toEqual(['T-1', 'T-2', 'T-3'])
  expect(rowsOf(show({ status: ['done'], limit: 3 }))).toEqual(['T-1', 'T-2', 'T-3'])
  expect(rowsOf(show({ status: ['done'], limit: 3, sort: 'newest' }))).toEqual(['T-1', 'T-2', 'T-3'])
  expect(last).toContain('3 of 8 matching shown (13 tasks on the board; last: 3; search: last:3 status:done)')
  expect(rowsOf(show({ search: 'top:2' }))).toEqual(['T-21', 'T-22'])
  expect(rowsOf(show({ limit: 2, sort: 'order' }))).toEqual(['T-21', 'T-22'])
  expect(show({ limit: 2, sort: 'order' })).toContain('2 of 4 matching shown')
  // an unknown status or kind gives a clear error; foo:bar is a plain word
  expect(() => show({ search: 'status:finished' })).toThrow('unknown status "finished"')
  expect(() => show({ search: 'kind:nope', kinds: ['change', 'bug', 'feature'] })).toThrow('unknown kind "nope"')
  expect(show({ search: 'foo:bar' })).toContain('No tasks match (search: foo:bar).')
})

// ---------------- the panels: the same words filter the terminal and VS Code lists ----------------

function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seed ? { value: { value: seed[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
}

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: 'symcc board', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const view = () => ({ view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } } })

test('terminal panel: last:2 status:done shows only those two, and the box hint names the filter words', async ($, on) => {
  stateOf(on, view())
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'search-open' })
  expect(String((await ui.find({ key: 'search' }))?.props.placeholder)).toMatch(/last:N top:N since:2d status: kind: role:/)
  await ui.input({ key: 'search', text: 'last:2 status:done' })
  for (const id of ['T-1', 'T-2']) expect(await ui.find({ key: id })).toBeDefined()
  for (const id of ['T-3', 'T-21']) expect(await ui.find({ key: id })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^search: last:2 status:done · 2 of 13 tasks$/ })).toBeDefined()
  await ui.press({ key: 'search-open' })
  await ui.input({ key: 'search', text: 'kind:bug role:tester foo:bar' })
  expect(await ui.find({ type: 'Text', text: /no tasks match$/ })).toBeDefined()
  await ui.unmount()
})

test('VS Code panel: the same words filter its list', async ($, on) => {
  stateOf(on, view())
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(String((await ui.find({ key: 'search' }))?.props.placeholder)).toMatch(/last:N/)
  await ui.input({ key: 'search', text: 'role:tester' })
  expect(await ui.find({ key: 'vs-task-T-3' })).toBeDefined()
  expect(await ui.find({ key: 'vs-task-T-1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^1 of 13 tasks match "role:tester"$/ })).toBeDefined()
  await ui.input({ key: 'search', text: 'top:1' })
  expect(await ui.find({ key: 'vs-task-T-21' })).toBeDefined()
  expect(await ui.find({ key: 'vs-task-T-22' })).toBeUndefined()
  await ui.unmount()
})
