import { expect, test } from 'claude-code/testing'
import { arrows } from '../hooks/plugin/ui/arrows'
const PANE = { plugin: 'symcc', component: 'Pane', requestId: 'symcc-board', props: { title: 'x', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const
test('dbg', async ($, on) => {
  on('ui.focus', (_, e) => (console.log('FOCUS', JSON.stringify(e)), {}))
  on('ui.scroll', (_, e) => (console.log('SCROLL', e.by, e.offset), {}))
  on('state.get', (_, e, next) => e.key === 'view' ? { value: { value: { tasks: [{ id: 'T-1', title: 'a', details: '', files: [], status: 'todo', note: '', question: null, order: 1, after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '' },{ id: 'T-2', title: 'b', details: '', files: [], status: 'todo', note: '', question: null, order: 2, after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '' }], working: [], scouts: [], mode: 'auto', test_commands: [] }, version: 1 } } : next(e))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  console.log('ARROWS', JSON.stringify({ ...arrows, rows: [...arrows.rows] }))
  console.log('F', JSON.stringify(await $.ui.focus({ component: 'Pane', requestId: 'symcc-board', plugin: 'symcc', element: 'T-1', origin: { kind: 'person' } })))
  console.log('ARROWS', JSON.stringify({ ...arrows, rows: [...arrows.rows] }))
  console.log('S', JSON.stringify(await $.ui.scroll({ component: 'Pane', requestId: 'symcc-board', offset: 1, by: 1, bodyRows: 20, contentRows: 60, origin: { kind: 'person' } })))
  expect(1).toBe(1)
  await ui.unmount()
})
