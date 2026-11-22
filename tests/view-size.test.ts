// The board panel's view stays under Claude Code's 4 MB limit on one plugin value: old done and dropped tasks are
// slimmed (no history, details or long parts), recent ones and open ones stay whole, and a view that is still too
// big slims every finished task.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { slimView, VIEW_MAX_CHARS, VIEW_WHOLE_MS } from '../hooks/claude/panel'
import type { SymccView } from '../types'
import { addTask, emptyBoard } from '../hooks/board'
import { change } from '../hooks/app/store'
import { publish } from '../hooks/app/lead'
import { S, sizeNotes } from '../hooks/app/state'
import { fakeHost, memoryFs } from './fake-host'

const now = Date.parse('2026-11-22T12:00:00Z')
const at = (msAgo: number) => new Date(now - msAgo).toISOString()
const long = 'x'.repeat(5000)

function task(id: string, status: string, msAgo: number) {
  return { id, title: id, status, details: long, note: '', after: [], files: [], attempts: 1, created_at: at(msAgo), updated_at: at(msAgo), history: [{ at: at(msAgo), kind: 'merged', text: long }] }
}

function viewOf(tasks: unknown[]): SymccView {
  return { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } as unknown as SymccView
}

test('old finished tasks are slimmed, recent and open ones stay whole', () => {
  const v = slimView(viewOf([task('T-1', 'done', VIEW_WHOLE_MS + 60_000), task('T-2', 'done', 60_000), task('T-3', 'todo', VIEW_WHOLE_MS * 3), task('T-4', 'dropped', VIEW_WHOLE_MS * 2)]), now)
  const byId = Object.fromEntries((v.tasks as unknown as { id: string; details: string; history: unknown[] }[]).map(t => [t.id, t]))
  expect(byId['T-1']?.details).toBe('')
  expect(byId['T-1']?.history).toEqual([])
  expect(byId['T-4']?.details).toBe('')
  expect(byId['T-2']?.details).toBe(long)
  expect(byId['T-3']?.details).toBe(long)
})

test('a board with many long finished tasks makes a view under the 4 MB limit', () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => task(`T-${i}`, 'done', i < 900 ? VIEW_WHOLE_MS * 2 : 60_000))
  expect(JSON.stringify(viewOf(tasks)).length).toBeGreaterThan(VIEW_MAX_CHARS)
  expect(JSON.stringify(slimView(viewOf(tasks), now)).length).toBeLessThan(VIEW_MAX_CHARS)
})

test('a view still too big after slimming old tasks slims every finished task', () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => task(`T-${i}`, 'done', 60_000))
  const v = slimView(viewOf(tasks), now)
  expect(JSON.stringify(v).length).toBeLessThan(VIEW_MAX_CHARS)
  expect((v.tasks as unknown as { details: string }[]).every(t => t.details === '')).toBe(true)
})

test('a view over the limit is trimmed, oldest finished tasks first, instead of failing', () => {
  const tasks = Array.from({ length: 4000 }, (_, i) => ({ ...task(`T-${i}`, 'done', 60_000 + i * 1000), details: long.repeat(10), title: long.repeat(10) }))
  const v = { ...viewOf(tasks), archived: Array.from({ length: 200 }, () => ({ id: 'A', details: long.repeat(20) })) }
  const out = slimView(v as unknown as SymccView, now)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
  const ids = (out.tasks as unknown as { id: string }[]).map(t => t.id)
  expect(ids.includes('T-0')).toBe(true)
  expect(ids.includes('T-3999')).toBe(false)
})

test('open tasks are cut only after old finished tasks have gone', () => {
  const open = { ...task('T-open', 'todo', 60_000), details: long.repeat(4), history: Array.from({ length: 40 }, () => ({ at: at(0), kind: 'step', text: 'line' })) }
  const tasks = [open, ...Array.from({ length: 20000 }, (_, i) => ({ ...task(`T-${i}`, 'done', VIEW_WHOLE_MS * 2 + i), details: '', history: [] }))]
  const out = slimView(viewOf(tasks), now)
  const o = (out.tasks as unknown as { id: string; details: string; history: unknown[] }[]).find(t => t.id === 'T-open')
  expect(o?.details).toBe(long.repeat(4))
  expect(o?.history.length).toBe(40)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
})

/** A host whose panel keeps the view as Claude Code's panel does (slimView), refusing a value over the limit. */
function refusingWorld() {
  let stored = ''
  const w = fakeHost({ fs: memoryFs(new Map()) })
  const panel = {
    ...w.panel,
    updateView: async (f: (v: SymccView) => SymccView) => {
      const text = JSON.stringify(slimView(f(w.panel.view()), now))
      if (text.length > VIEW_MAX_CHARS) throw new Error('$.state.set: the value is over the 4194304 limit')
      stored = text
    },
  }
  S.root = '/repo'
  S.writing = Promise.resolve()
  S.enabledNow = true
  return { ...w, host: { ...w.host, ui: { ...w.host.ui, panel } }, stored: () => stored }
}

test('publish of a board with many long finished tasks stores a view under 4 MB and warns about nothing', async () => {
  const w = refusingWorld()
  const b = emptyBoard()
  const base = addTask(emptyBoard(), { origin: { why: 't' }, title: 'base' }, at(0))[0].tasks[0]!
  for (let i = 1; i <= 700; i++) b.tasks.push({ ...base, id: `T-${i}`, status: 'done', details: long, history: [{ at: at(0), kind: 'merged', text: long }], updated_at: at(VIEW_WHOLE_MS * 3) } as never)
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
  const out = slimView(viewOf(tasks), now)
  expect((out.tasks as unknown as { id: string }[]).some(t => t.id === 'T-open')).toBe(true)
  expect(JSON.stringify(out).length).toBeLessThan(VIEW_MAX_CHARS)
})
