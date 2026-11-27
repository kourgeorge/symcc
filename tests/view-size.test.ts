// The board panel's view stays under Claude Code's 4 MB limit on one plugin value: every done and dropped task is
// slimmed (no timeline, details or long parts, T-891), open ones stay whole, and a view still too big is trimmed.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { slimView, VIEW_MAX_CHARS } from '../hooks/claude/panel'
import { slimViewStep, trimNote } from '../hooks/core/view-slim'
import { depDone } from '../hooks/core/archive'
import type { SymccView } from '../types'
import { addTask, emptyBoard } from '../hooks/board'
import { change } from '../hooks/app/store'
import { publish } from '../hooks/app/lead'
import { S, sizeNotes } from '../hooks/app/state'
import { fakeHost, memoryFs } from './fake-host'

const now = Date.parse('2026-11-22T12:00:00Z')
const at = (msAgo: number) => new Date(now - msAgo).toISOString()
const long = 'x'.repeat(5000)
/** Two days: before T-891, finished tasks changed within this long were kept whole. */
const VIEW_WHOLE_MS = 2 * 24 * 60 * 60_000

function task(id: string, status: string, msAgo: number) {
  return { id, title: id, status, details: long, note: '', after: [], files: [], attempts: 1, created_at: at(msAgo), updated_at: at(msAgo), timeline: [{ at: at(msAgo), kind: 'merged', text: long }] }
}

function viewOf(tasks: unknown[]): SymccView {
  return { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } as unknown as SymccView
}

test('T-891: every finished task is slimmed, old or just finished; open ones stay whole', () => {
  const v = slimView(viewOf([task('T-1', 'done', VIEW_WHOLE_MS + 60_000), task('T-2', 'done', 60_000), task('T-3', 'todo', VIEW_WHOLE_MS * 3), task('T-4', 'dropped', VIEW_WHOLE_MS * 2)]))
  const byId = Object.fromEntries((v.tasks as unknown as { id: string; details: string; timeline: unknown[] }[]).map(t => [t.id, t]))
  expect(byId['T-1']?.details).toBe('')
  expect(byId['T-1']?.timeline).toEqual([])
  expect(byId['T-4']?.details).toBe('')
  expect(byId['T-2']?.details).toBe('')
  expect(byId['T-2']?.timeline).toEqual([])
  expect(byId['T-3']?.details).toBe(long)
})

test('a board with many long finished tasks makes a view under the 4 MB limit', () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => task(`T-${i}`, 'done', i < 900 ? VIEW_WHOLE_MS * 2 : 60_000))
  expect(JSON.stringify(viewOf(tasks)).length).toBeGreaterThan(VIEW_MAX_CHARS)
  expect(JSON.stringify(slimView(viewOf(tasks))).length).toBeLessThan(VIEW_MAX_CHARS)
})

test('a view of many just-finished tasks slims every one of them', () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => task(`T-${i}`, 'done', 60_000))
  const v = slimView(viewOf(tasks))
  expect(JSON.stringify(v).length).toBeLessThan(VIEW_MAX_CHARS)
  expect((v.tasks as unknown as { details: string }[]).every(t => t.details === '')).toBe(true)
})

test('a view over the limit is trimmed, oldest finished tasks first, instead of failing', () => {
  const tasks = Array.from({ length: 4000 }, (_, i) => ({ ...task(`T-${i}`, 'done', 60_000 + i * 1000), details: long.repeat(10), title: long.repeat(10) }))
  const v = { ...viewOf(tasks), archived: Array.from({ length: 200 }, () => ({ id: 'A', details: long.repeat(20) })) }
  const out = slimView(v as unknown as SymccView)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
  const ids = (out.tasks as unknown as { id: string }[]).map(t => t.id)
  expect(ids.includes('T-0')).toBe(true)
  expect(ids.includes('T-3999')).toBe(false)
})

test('open tasks are cut only after old finished tasks have gone', () => {
  const open = { ...task('T-open', 'todo', 60_000), details: long.repeat(4), timeline: Array.from({ length: 40 }, () => ({ at: at(0), kind: 'step', text: 'line' })) }
  const tasks = [open, ...Array.from({ length: 20000 }, (_, i) => ({ ...task(`T-${i}`, 'done', VIEW_WHOLE_MS * 2 + i), details: '', timeline: [] }))]
  const out = slimView(viewOf(tasks))
  const o = (out.tasks as unknown as { id: string; details: string; timeline: unknown[] }[]).find(t => t.id === 'T-open')
  expect(o?.details).toBe(long.repeat(4))
  expect(o?.timeline.length).toBe(40)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
})

/** A host whose panel keeps the view as Claude Code's panel does (slimView), refusing a value over the limit. */
function refusingWorld() {
  let stored = ''
  const w = fakeHost({ fs: memoryFs(new Map()) })
  const panel = {
    ...w.panel,
    updateView: async (f: (v: SymccView) => SymccView, fitted?: boolean) => {
      const text = JSON.stringify(fitted ? f(w.panel.view()) : slimView(f(w.panel.view())))
      if (text.length > VIEW_MAX_CHARS) throw new Error('$.state.set: the value is over the 4194304 limit')
      stored = text
    },
    fitView: (v: SymccView) => {
      const r = slimViewStep(v)
      return { view: r.view, note: trimNote(r.step, r.left) }
    },
  }
  S.root = '/repo'
  S.writing = Promise.resolve()
  S.enabledNow = true
  return { ...w, host: { ...w.host, ui: { ...w.host.ui, panel } }, stored: () => stored }
}

test('publish of a board with many long recent finished tasks stores a view under 4 MB and stays silent when only finished tasks were slimmed', async () => {
  const w = refusingWorld()
  const b = emptyBoard()
  const base = addTask(emptyBoard(), { origin: { why: 't' }, title: 'base' }, at(0))[0].tasks[0]!
  for (let i = 1; i <= 700; i++) b.tasks.push({ ...base, id: `T-${i}`, status: 'done', details: long, timeline: [{ at: at(0), kind: 'merged', text: long }], updated_at: at(60_000) } as never)
  expect(JSON.stringify(b.tasks).length).toBeGreaterThan(3_000_000)
  await publish(w.host, b)
  expect(w.stored().length).toBeGreaterThan(0)
  expect(w.stored().length).toBeLessThan(VIEW_MAX_CHARS)
  expect(sizeNotes.size).toBe(0)
})

test('publish and a board change survive a view the host refuses', async () => {
  const w = fakeHost({ fs: memoryFs(new Map()) })
  w.host.ui.panel!.updateView = async () => Promise.reject(new Error('$.state.set: the value is 4196705 characters, over the 4194304 limit'))
  S.root = '/repo'
  S.writing = Promise.resolve()
  S.enabledNow = true
  await publish(w.host, emptyBoard())
  await change(w.host, b => ({ ...b, mode: 'auto' }))
  expect(true).toBe(true)
})

test('open tasks stay while finished ones go', () => {
  const tasks = [task('T-open', 'todo', 60_000), ...Array.from({ length: 4000 }, (_, i) => ({ ...task(`T-${i}`, 'done', 60_000 + i), title: long.repeat(10) }))]
  const out = slimView(viewOf(tasks))
  expect((out.tasks as unknown as { id: string }[]).some(t => t.id === 'T-open')).toBe(true)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
})

test('the view size is counted in characters, not bytes', async () => {
  const w = refusingWorld()
  const b = emptyBoard()
  const base = addTask(emptyBoard(), { origin: { why: 't' }, title: 'base' }, at(0))[0].tasks[0]!
  for (let i = 1; i <= 1000; i++) b.tasks.push({ ...base, id: `T-${i}`, status: 'todo', details: 'é'.repeat(9000) } as never)
  await publish(w.host, b)
  expect(w.stored().length).toBeLessThan(VIEW_MAX_CHARS)
  expect([...sizeNotes.values()].some(n => n.includes('over the 4 MB'))).toBe(false)
})

/** A view of `n` old done tasks (T-0 the oldest) plus a todo task waiting on T-0 and on archived T-OLD. */
function bigView(n: number) {
  const done = Array.from({ length: n }, (_, i) => ({ ...task(`T-${i}`, 'done', VIEW_WHOLE_MS * 2 + (n - i) * 1000), title: long.repeat(2) }))
  const waiting = { ...task('T-5000', 'todo', 60_000), after: ['T-0', 'T-9999'] }
  return { ...viewOf([...done, waiting]), archived_done: ['T-9999'] } as unknown as SymccView
}

test('tasks left out of the view still count as done for tasks waiting on them', () => {
  const out = slimView(bigView(4000)) as unknown as { tasks: { id: string }[]; archived_done?: string[] }
  expect(out.tasks.some(t => t.id === 'T-0')).toBe(false)
  expect(depDone({ tasks: out.tasks as never, archived_done: out.archived_done }, 'T-0')).toBe(true)
  expect(depDone({ tasks: out.tasks as never, archived_done: out.archived_done }, 'T-9999')).toBe(true)
})

test('publish warns when tasks were left out of the view', async () => {
  const w = refusingWorld()
  const b = emptyBoard()
  const base = addTask(emptyBoard(), { origin: { why: 't' }, title: 'base' }, at(0))[0].tasks[0]!
  for (let i = 1; i <= 4000; i++) b.tasks.push({ ...base, id: `T-${i}`, status: 'done', title: long.repeat(2), updated_at: at(VIEW_WHOLE_MS * 2) } as never)
  await publish(w.host, b)
  expect(w.stored().length).toBeLessThan(VIEW_MAX_CHARS)
  expect([...sizeNotes.values()].some(n => n.includes('trimmed to fit') && n.includes('left out'))).toBe(true)
})

test('trimNote gives its own words when only the archive totals were left out', () => {
  const r = slimViewStep({ ...viewOf([task('T-1', 'todo', 60_000)]), archived: { big: 'y'.repeat(3_200_000) } } as unknown as SymccView)
  expect(r.step).toBe(1)
  expect(trimNote(r.step, r.left)).toBe('the board view was trimmed to fit the 4 MB limit: archive totals left out of the panel')
})

test('a host whose panel keeps every task gets no trim note for a big view', async () => {
  const w = fakeHost({ fs: memoryFs(new Map()) })
  S.root = '/repo'
  S.writing = Promise.resolve()
  S.enabledNow = true
  const b = emptyBoard()
  const base = addTask(emptyBoard(), { origin: { why: 't' }, title: 'base' }, at(0))[0].tasks[0]!
  for (let i = 1; i <= 4000; i++) b.tasks.push({ ...base, id: `T-${i}`, status: 'done', title: long.repeat(2), updated_at: at(VIEW_WHOLE_MS * 2) } as never)
  await publish(w.host, b)
  expect([...sizeNotes.values()].some(n => n.includes('left out'))).toBe(false)
})
