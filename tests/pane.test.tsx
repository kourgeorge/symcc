import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
  props: { title: 'Board', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '', ...extra })

test('the panel shows the board, waiting tasks first, with their question', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' })], working: [], scouts: [{ name: 'tests', every_minutes: 30, last_run: null, running: true }], paused: false, test_commands: ['npm test'] } },
      version: 1,
    },
  }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /T-2 waiting for you/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Search mode/ }))).toBeDefined()
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

const BAND = {
  plugin: 'symcc',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

test('the band above the prompt sums up the board and lists what needs you or is running', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' }), task('T-4', 'todo', 'Docs')], working: [], scouts: [], paused: false, test_commands: [] } },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /1 doing · 1 to do · 1 waiting for you · 1 done/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /T-2 waiting for you/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Case-sensitive/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /T-3 doing/ }))).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Docs/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('with an empty board the band shows nothing of its own', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Board/ })).toBeUndefined()
  await ui.unmount()
})

test('the board panel is interactive: open a task, see its details, go back', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'failed', 'Explore the market', { details: 'Research what is new.', note: 'the worker was stopped', history: ['try 1: stopped'] }), task('T-2', 'todo', 'Write it up')], working: [], scouts: [], paused: false, test_commands: [] } } })
  on('ui.toast', () => ({ value: undefined }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'T-1' })
    expect((await ui.find({ type: 'Text', text: /Research what is new/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /try 1: stopped/ }))).toBeDefined()
    expect((await ui.find({ key: 'retry' }))).toBeDefined()
    expect((await ui.find({ key: 'drop' }))).toBeDefined()
    await ui.press({ key: 'back' })
    expect((await ui.find({ key: 'T-2' }))).toBeDefined()
    await ui.unmount()
  }
})

test('a waiting task opens with a box to answer it', async ($, on) => {
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { tasks: [task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' })], working: [], scouts: [], paused: false, test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /asks: Case-sensitive/ }))).toBeDefined()
  expect((await ui.find({ key: 'answer' }))).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeUndefined()
  await ui.unmount()
})
