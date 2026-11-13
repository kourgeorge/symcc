import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { SymccTask } from '../types'
import { taskMatches, searchLine } from '../hooks/board'

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '', ...extra }) as unknown as SymccTask

test('taskMatches: the id with or without "T-", and not a longer id', () => {
  const t = task('T-12', 'todo', 'Parser')
  expect(taskMatches(t, 'T-12')).toBe(true)
  expect(taskMatches(t, 't-12')).toBe(true)
  expect(taskMatches(t, '12')).toBe(true)
  expect(taskMatches(task('T-120', 'todo', 'Parser'), '12')).toBe(false)
  expect(taskMatches(task('T-120', 'todo', 'Parser'), 'T-12')).toBe(false)
  // a number in the text still matches
  expect(taskMatches(task('T-7', 'todo', 'Fix issue 12'), '12')).toBe(true)
  // an empty search matches everything
  expect(taskMatches(t, '  ')).toBe(true)
})

test('taskMatches: every word must match, in any case, over title and details', () => {
  const t = task('T-3', 'todo', 'Voice notify', { details: 'Say "T-3 done" out loud on macOS.' })
  expect(taskMatches(t, 'NOTIFY')).toBe(true)
  expect(taskMatches(t, 'notify macos')).toBe(true)
  expect(taskMatches(t, 'notify linux')).toBe(false)
  expect(taskMatches(t, 'zzz')).toBe(false)
})

test('taskMatches: status (and its word), role and origin with its request', () => {
  const waiting = task('T-4', 'waiting', 'A', { role: 'tester' })
  expect(taskMatches(waiting, 'waiting')).toBe(true)
  expect(taskMatches(waiting, 'for you')).toBe(true)
  expect(taskMatches(waiting, 'tester')).toBe(true)
  expect(taskMatches(waiting, 'done')).toBe(false)
  // no role is the general role
  expect(taskMatches(task('T-5', 'todo', 'B'), 'general')).toBe(true)
  const fromScout = task('T-6', 'backlog', 'C', { origin: { by: 'scout', scout: 'secrets', why: 'x', at: '' } })
  expect(taskMatches(fromScout, 'secrets')).toBe(true)
  expect(taskMatches(fromScout, 'scout')).toBe(true)
  expect(taskMatches(fromScout, 'owner')).toBe(false)
  const fromOwner = task('T-8', 'done', 'D', { origin: { by: 'owner', request: 'make the board searchable', why: 'x', at: '' } })
  expect(taskMatches(fromOwner, 'owner searchable')).toBe(true)
  const followUp = task('T-9', 'todo', 'E', { origin: { by: 'worker', task: 'T-2', why: 'x', at: '' } })
  expect(taskMatches(followUp, 'T-2')).toBe(true)
  expect(taskMatches(followUp, 'worker')).toBe(true)
})

test('searchLine says what the filter is and how many match', () => {
  expect(searchLine(' notify ', 3, 144)).toBe('search: notify · 3 of 144 tasks · Esc clears')
  expect(searchLine('zzz', 0, 144)).toBe('search: zzz · no tasks match · Esc clears')
})

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it (and redraws). */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
}

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: 'symcc board', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('f opens the search; typing shows only matching tasks in every group, with the count line', async ($, on) => {
  const tasks = [
    task('T-1', 'todo', 'Voice notify'),
    task('T-2', 'todo', 'Parser'),
    task('T-3', 'backlog', 'Notify on Linux'),
    task('T-4', 'done', 'Sound notify', { updated_at: '2020-01-02T10:00:00.000Z' }),
    task('T-5', 'dropped', 'Old idea'),
  ]
  stateOf(on, { view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [], archived: { done: 50, dropped: 0 } } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // the footer offers the search; no search line yet
  expect((await ui.find({ key: 'search-open' }))?.props.hotkey).toBe('f')
  expect(await ui.find({ key: 'search' })).toBeUndefined()
  await ui.press({ key: 'search-open' })
  // the terminal draws "label: text" and "⏎ <submitLabel>": one colon ("search: notify"), and one Enter hint
  const box = await ui.find({ key: 'search' })
  expect(`${box?.props.label}: notify`).toBe('search: notify')
  expect(box?.props.submitLabel).toBe('keep')
  await ui.input({ key: 'search', text: 'notify', kind: 'change' })
  // matches from to do, the folded Backlog and an old Done day, all shown open; the rest hidden
  for (const id of ['T-1', 'T-3', 'T-4']) expect(await ui.find({ key: id })).toBeDefined()
  for (const id of ['T-2', 'T-5']) expect(await ui.find({ key: id })).toBeUndefined()
  expect(await ui.find({ key: 'day:dropped' })).toBeUndefined()
  expect((await ui.find({ key: 'day:backlog' }))?.text).toMatch(/^  ▾ Backlog/)
  // archived tasks are not searched, so the Done row has no "(+50 archived)"
  expect((await ui.find({ key: 'day:done' }))?.text).not.toMatch(/archived/)
  expect(await ui.find({ type: 'Text', text: /^3 of 5 tasks · Esc clears$/ })).toBeDefined()
  // Enter keeps the filter and closes the box
  await ui.input({ key: 'search', text: 'notify' })
  expect(await ui.find({ key: 'search' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^search: notify · 3 of 5 tasks · Esc clears$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  // two words: both must match
  await ui.press({ key: 'search-open' })
  await ui.input({ key: 'search', text: 'notify linux' })
  expect(await ui.find({ type: 'Text', text: /^search: notify linux · 1 of 5 tasks · Esc clears$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-3' })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  // nothing matches
  await ui.press({ key: 'search-open' })
  await ui.input({ key: 'search', text: 'zzz' })
  expect(await ui.find({ type: 'Text', text: /^search: zzz · no tasks match · Esc clears$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /All clear/ })).toBeUndefined()
  for (const id of ['T-1', 'T-2', 'T-3', 'T-4', 'T-5']) expect(await ui.find({ key: id })).toBeUndefined()
  // an empty search submitted clears it: everything is back
  await ui.press({ key: 'search-open' })
  await ui.input({ key: 'search', text: '' })
  expect(await ui.find({ type: 'Text', text: /^search: / })).toBeUndefined()
  expect(await ui.find({ key: 'T-2' })).toBeDefined()
  expect(await ui.find({ key: 'T-3' })).toBeUndefined() // the backlog is folded again
  await ui.unmount()
})
