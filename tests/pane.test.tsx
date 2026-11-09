import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: 'Board', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '', ...extra })

test('the panel shows the board, waiting tasks first, with their question', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' })], working: [], scouts: [{ name: 'tests', every_minutes: 30, last_run: null, running: true }], paused: false, test_commands: ['npm test'] },
      version: 1,
      shape: 'view-1',
    },
  }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /T-2 waiting for you/ }))?.text).toContain('Search mode')
    expect((await ui.find({ type: 'Text', text: /Case-sensitive/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /T-3 doing/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /scouts: tests \(running\)/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /tests: npm test/ }))).toBeDefined()
    await ui.unmount()
  }
})

test('an empty board says what to do', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /board is empty/ }))).toBeDefined()
  await ui.unmount()
})
