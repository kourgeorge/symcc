import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ICON, ICON_ART } from '../hooks/name'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '', ...extra })

test('the panel shows the board, newest task first, with their question', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' })], working: [], scouts: [{ name: 'tests', every_minutes: 30, last_run: null, running: true }], mode: 'auto', test_commands: ['npm test'] } },
      version: 1,
    },
  }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^T-2\s*$/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /waiting for you/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Search mode/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Case-sensitive/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^T-3\s*$/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /▶ doing/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^symcc board$/ }))).toBeDefined()
    // every line of the clef drawing is drawn, in the accent color, all the same width so the text beside it lines up
    // (a line with only the drawing matches twice: the whole line, and the colored drawing in it)
    const art = await Promise.all(ICON_ART.map(async l => (await ui.findAll({ type: 'Text', text: new RegExp(`^${esc(l)}  $`) })).find(t => t.props.color === 'ide')))
    expect(art.every(t => t !== undefined)).toBe(true)
    expect(new Set(art.map(t => t!.text.length)).size).toBe(1)
    expect((await ui.find({ type: 'Text', text: /^tests: npm test$/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /1 doing · 1 waiting for you · 1 done/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^━{50}$/ }))).toBeDefined()
    await ui.unmount()
  }
})

test('an empty board says what to do', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /board is empty/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^symcc board$/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^━{50}$/ }))).toBeDefined()
  await ui.unmount()
})

test('a narrow panel shows the banner without the drawing', async $ => {
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 30 }, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^symcc board$/ }))).toBeDefined()
  expect(await ui.find({ type: 'Text', text: new RegExp(esc(ICON_ART[0]!.trim())) })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^━{30}$/ }))).toBeDefined()
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
      value: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' }), task('T-4', 'todo', 'Docs')], working: [], scouts: [], mode: 'auto', test_commands: [] } },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: new RegExp(`^${ICON} symcc board$`, 'u') }))).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /symcc board/ })).toBeUndefined()
  await ui.unmount()
})

test('the board panel is interactive: open a task, see its details, go back', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'failed', 'Explore the market', { details: 'Research what is new.', note: 'the worker was stopped', history: ['try 1: stopped'] }), task('T-2', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
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

test('backlog tasks are a section folded by default under a short header; Enter opens it; one can move to todo or be dropped', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up'), task('T-2', 'backlog', 'Dark mode', { details: 'Maybe later: a dark theme.' }), task('T-3', 'backlog', 'Export')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const header = await ui.find({ type: 'Text', text: /^▸ Backlog \(2\)$/ })
  expect(header).toBeDefined()
  expect(header?.props.color).toBe('planMode')
  expect(header?.props.bold).toBe(true)
  // the open tasks come first, then a light dotted rule, then the Backlog header (no blank line)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const at = texts.findIndex(t => /^▸ Backlog \(2\)$/.test(t))
  expect(texts.findIndex(t => /Write it up/.test(t))).toBeLessThan(at)
  expect(/^┄+$/.test(texts[at - 1] ?? '') || /^┄+$/.test(texts[at - 2] ?? '')).toBe(true)
  expect(texts.indexOf(' ')).toBe(-1)
  expect(texts.some(t => /Enter on a ▸ heading opens it/.test(t))).toBe(true)
  // the dotted rule is subtle, the header rule uses the accent color
  expect((await ui.find({ type: 'Text', text: /^┄+$/ }))?.props.color).toBe('subtle')
  expect((await ui.find({ type: 'Text', text: /^━+$/ }))?.props.color).toBe('ide')
  // folded by default: the items are hidden
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  expect((await ui.find({ key: 'T-1' }))).toBeDefined()
  // Enter on the header opens it; again folds it
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^▾ Backlog \(2\)$/ }))).toBeDefined()
  expect((await ui.find({ key: 'T-2' }))).toBeDefined()
  expect((await ui.find({ key: 'T-3' }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /◇/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /2 in backlog/ }))).toBeDefined()
  expect(await ui.find({ key: 'day:backlog-more' })).toBeUndefined()
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^▸ Backlog \(2\)$/ }))).toBeDefined()
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  await ui.press({ key: 'day:backlog' })
  await ui.press({ key: 'T-2' })
  expect((await ui.find({ type: 'Text', text: /Maybe later: a dark theme/ }))).toBeDefined()
  const toTodo = await ui.find({ key: 'to-todo' })
  expect(toTodo?.props.label).toBe('Move to todo (o)')
  expect(toTodo?.props.hotkey).toBe('o')
  expect((await ui.find({ key: 'drop' }))).toBeDefined()
  expect(await ui.find({ key: 'stash' })).toBeUndefined()
  await ui.unmount()
})

test('the list goes: Needs you, Doing, To do, then Backlog, Done and Dropped, with a dotted rule between', async ($, on) => {
  const now = new Date().toISOString()
  stateOf(on, {
    view: {
      shape: 'view-1',
      value: {
        tasks: [
          task('T-1', 'done', 'Parser', { updated_at: now }),
          task('T-2', 'backlog', 'Dark mode'),
          task('T-3', 'todo', 'Write it up', { order: 9 }),
          task('T-4', 'doing', 'Search command'),
          task('T-5', 'waiting', 'Search mode', { question: 'Case-sensitive?' }),
          task('T-6', 'review', 'Blue button'),
          task('T-7', 'dropped', 'Old idea', { updated_at: now }),
          task('T-8', 'paused', 'Later work', { order: 1 }),
          task('T-9', 'todo', 'First up', { order: 2 }),
          task('T-10', 'failed', 'Broken', { note: 'tests failed' }),
        ],
        working: [],
        scouts: [],
        mode: 'auto',
        test_commands: [],
      },
    },
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.key)).filter(k => /^T-\d+$|^day:/.test(k))
  // review, waiting, failed (needsYouFirst); then doing; then todo by run order, then paused; then the folded headers
  expect(keys).toEqual(['T-6', 'T-5', 'T-10', 'T-4', 'T-9', 'T-3', 'T-8', 'day:backlog', 'day:done', 'day:dropped'])
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const idx = (re: RegExp) => texts.findIndex(t => re.test(t))
  const heads = [/^Needs you \(3\)$/, /^Doing \(1\)$/, /^To do \(3\)$/, /^▸ Backlog \(1\)$/, /^▸ Done \(1\)/, /^▸ Dropped \(1\)$/].map(idx)
  expect(heads.every(i => i > -1)).toBe(true)
  expect([...heads].sort((a, b) => a - b)).toEqual(heads)
  // one dotted rule between each pair of sections, none after the last
  for (let k = 1; k < heads.length; k++) expect(texts.slice(heads[k - 1]!, heads[k]!).filter(t => /^┄+$/.test(t)).length).toBe(1)
  expect(texts.slice(heads.at(-1)!).filter(t => /^┄+$/.test(t)).length).toBe(0)
  // the always-open headers are bold, not buttons
  expect((await ui.find({ type: 'Text', text: /^Doing \(1\)$/ }))?.props.bold).toBe(true)
  // folded by default: no done, dropped or backlog tasks shown
  for (const k of ['T-1', 'T-2', 'T-7']) expect(await ui.find({ key: k })).toBeUndefined()
  await ui.press({ key: 'day:done' })
  expect(await ui.find({ type: 'Text', text: /^▾ Done \(1\)$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  expect(await ui.find({ key: 'T-7' })).toBeUndefined()
  await ui.press({ key: 'day:dropped' })
  expect(await ui.find({ type: 'Text', text: /^▾ Dropped \(1\)$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-7' })).toBeDefined()
  await ui.press({ key: 'day:done' })
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  expect(await ui.find({ key: 'T-7' })).toBeDefined()
  await ui.unmount()
})

test('the Done header shows the count and the task that finished last, with its day', async ($, on) => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  stateOf(on, {
    view: {
      shape: 'view-1',
      value: {
        tasks: [
          task('T-1', 'done', 'Older work', { updated_at: day(1) }),
          task('T-2', 'done', 'Task page: collapse the Details rows', { updated_at: day(0) }),
          task('T-3', 'done', 'Made first', { updated_at: day(2), created_at: day(0) }),
          task('T-4', 'todo', 'Next'),
        ],
        working: [],
        scouts: [],
        mode: 'auto',
        test_commands: [],
      },
    },
  })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  const head = await ui.find({ key: 'day:done' })
  expect(head?.text).toBe('▸ Done (3) · last: T-2 Task page: collapse the Details rows · today')
  expect((await ui.find({ type: 'Text', text: /^ · last: T-2/ }))?.props.color).toBe('subtle')
  await ui.unmount()
  // a narrow panel cuts the title, but keeps the day
  const narrow = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const cut = (await narrow.find({ key: 'day:done' }))?.text ?? ''
  expect(cut).toMatch(/^▸ Done \(3\) · last: T-2 .+… · today$/)
  expect(cut.length).toBeLessThanOrEqual(50)
  await narrow.unmount()
})

test('with nothing to do, need or run, one subtle line says so above the folded groups', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser', { updated_at: new Date().toISOString() }), task('T-2', 'backlog', 'Dark mode')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const line = texts.findIndex(t => t === 'Nothing running. Add a task by talking to the lead.')
  expect(line).toBeGreaterThan(-1)
  expect((await ui.find({ type: 'Text', text: /^Nothing running/ }))?.props.color).toBe('subtle')
  expect(line).toBeLessThan(texts.findIndex(t => /^▸ Backlog \(1\)$/.test(t)))
  expect(/^┄+$/.test(texts[line + 1] ?? '')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /board is empty/ })).toBeUndefined()
  // the first button (the Backlog header) gets the focus
  expect((await ui.findAll({ type: 'Button' })).find(b => b.props.autoFocus)?.key).toBe('day:backlog')
  await ui.unmount()
})

test('a board with only active work has no folded groups and no dotted rule after the last section', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^To do \(1\)$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Nothing running/ })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).filter(t => /^┄+$/.test(t.text)).length).toBe(0)
  expect((await ui.findAll({ type: 'Text' })).some(t => /Enter on a ▸ heading/.test(t.text))).toBe(false)
  await ui.unmount()
})

test('over 5 backlog items the opened Backlog shows 5 and "… N more"', async ($, on) => {
  const ideas = [2, 3, 4, 5, 6, 7, 8].map(n => task(`T-${n}`, 'backlog', `Idea ${n}`))
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), ...ideas], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  const first = buttons.findIndex(k => k === 'day:backlog' || k === 'day:done' || /^T-\d$/.test(String(k)))
  expect(buttons[first]).toBe('day:backlog')
  expect((await ui.find({ type: 'Text', text: /^▸ Backlog \(7\)$/ }))).toBeDefined()
  await ui.press({ key: 'day:backlog' })
  const opened = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  expect(opened.filter(k => /^T-[2-8]$/.test(String(k))).length).toBe(5)
  expect((await ui.find({ type: 'Text', text: /^ *… 2 more \(Enter to show all\)$/ }))).toBeDefined()
  await ui.press({ key: 'day:backlog-more' })
  const all = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  expect(all.filter(k => /^T-[2-8]$/.test(String(k))).length).toBe(7)
  expect(await ui.find({ key: 'day:backlog-more' })).toBeUndefined()
  await ui.unmount()
})

test('an empty backlog shows no Backlog section', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up'), task('T-2', 'done', 'Parser')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'day:backlog' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Backlog \(/ })).toBeUndefined()
  // only the strong rule under the header, and one dotted rule between To do and Done
  expect((await ui.findAll({ type: 'Text' })).filter(t => /^━+$/.test(t.text)).length).toBe(1)
  expect((await ui.findAll({ type: 'Text' })).filter(t => /^┄+$/.test(t.text)).length).toBe(1)
  await ui.unmount()
})

test('an open task to do has a "Stash to backlog" button', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'stash' }))).toBeDefined()
  expect(await ui.find({ key: 'to-todo' })).toBeUndefined()
  await ui.unmount()
})

test('a waiting task opens with a box to answer it', async ($, on) => {
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { tasks: [task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /asks: Case-sensitive/ }))).toBeDefined()
  expect((await ui.find({ key: 'answer' }))).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeUndefined()
  await ui.unmount()
})

test('an opened task shows its details in full, in clear sections', async ($, on) => {
  const long = 'First line of the plan.\n\nSecond paragraph that is long. '.repeat(20)
  stateOf(on, { opened: 'T-3', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Base work'), task('T-3', 'todo', 'Build on it', { details: long + 'THE END', files: ['src/a.ts', 'test/'], after: ['T-1'], history: ['try 1: old', 'try 2: new'] })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /What to do/ })).toBeDefined()
  // long "What to do" text is shown in full; the Details rows open with e
  expect(await ui.find({ type: 'Text', text: /THE END/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /src\/a\.ts/ })).toBeUndefined()
  await ui.press({ key: 'details-toggle' })
  expect(await ui.find({ type: 'Text', text: /src\/a\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^After:\s+T-1 ✓ done · Base work$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Base work/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /newest first/ })).toBeDefined()
  await ui.unmount()
})

test('a task that is not running can be paused from the board', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Build it')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'pause' })).toBeDefined()
  expect(await ui.find({ key: 'resume' })).toBeUndefined()
  await ui.unmount()
})

test('a paused task shows as paused and can be resumed from the board', async ($, on) => {
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { tasks: [task('T-2', 'paused', 'Later')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /paused/ })).toBeDefined()
  expect(await ui.find({ key: 'resume' })).toBeDefined()
  expect(await ui.find({ key: 'pause' })).toBeUndefined()
  await ui.unmount()
})

const RUNS = [
  { started: '2026-11-09T10:00:00.000Z', ended: '2026-11-09T10:12:00.000Z', tokens: 40_000 },
  { started: '2026-11-09T11:00:00.000Z', ended: '2026-11-09T12:00:00.000Z', cost: 0.42 },
]

test('an opened task shows the time of each try and the total', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Timed', { runs: RUNS })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Runs \(time and cost\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 1: 12m · 40k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 2: 1h 00m · ~\$0\.42/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /total: 1h 12m · 40k tokens · ~\$0\.42/ })).toBeDefined()
  await ui.unmount()
})

test('the banner shows the counts and the total time and cost of all tries', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Timed', { runs: RUNS }), task('T-2', 'todo', 'Other')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^1 to do · 1 done · 1h 12m · 40k tokens · ~\$0\.42$/ })).toBeDefined()
  await ui.unmount()
})

test('inside the opened Done, older days fold into one row per day, which opens on Enter', async ($, on) => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  const old = new Date(Date.now() - 3 * 86_400_000)
  const oldKey = `day:${new Date(old.getTime() - old.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)}`
  stateOf(on, {
    view: {
      shape: 'view-1',
      value: {
        tasks: [
          task('T-1', 'done', 'Old work', { updated_at: day(3) }),
          task('T-2', 'dropped', 'Old idea', { updated_at: day(3) }),
          task('T-3', 'failed', 'Old but open', { updated_at: day(5) }),
          task('T-4', 'done', 'Fresh work', { updated_at: day(0) }),
        ],
        working: [],
        scouts: [],
        mode: 'auto',
        test_commands: [],
      },
    },
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'T-3' })).toBeDefined()
  // Done is folded: no task and no day row until it is opened
  expect(await ui.find({ key: 'T-4' })).toBeUndefined()
  expect(await ui.find({ key: oldKey })).toBeUndefined()
  await ui.press({ key: 'day:done' })
  // opened: today's done task in full, then one folded row per older day (done only; dropped ones are in Dropped)
  expect(await ui.find({ key: 'T-4' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ *▸ \w{3} \d+ \w{3}(?: \d{4})? · 1 done$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  await ui.press({ key: oldKey })
  expect(await ui.find({ type: 'Text', text: /^ *▾ \w{3} \d+ \w{3}(?: \d{4})? · 1 done$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  await ui.press({ key: oldKey })
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  await ui.press({ key: 'day:dropped' })
  expect(await ui.find({ key: 'T-2' })).toBeDefined()
  await ui.unmount()
})

const scout = (name: string, extra: Record<string, unknown> = {}) => ({ name, every_minutes: 30, last_run: null, running: false, ...extra })

test('"s" and the Scouts tab switch the panel to the scouts, and Enter opens one', async ($, on) => {
  const soon = new Date(Date.now() + 12 * 60_000 + 20_000).toISOString()
  const ran = new Date(Date.now() - 8 * 60_000).toISOString()
  stateOf(on, {
    view: {
      shape: 'view-1',
      value: {
        tasks: [task('T-1', 'todo', 'Build it')],
        working: [],
        scouts: [scout('bugs', { model: 'sonnet', next_run: soon, last_run: ran, prompt: 'Look for crashes.', last_report: '- crash in parser | src/p.ts:3 | src/p.ts' }), scout('tests', { running: true })],
        mode: 'auto',
        test_commands: [],
      },
    },
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // the tab row: both tabs, Tasks active; each a Button with its letter key
    const tasksTab = await ui.find({ key: 'tab-tasks' })
    const scoutsTab = await ui.find({ key: 'tab-scouts' })
    expect(tasksTab?.props.hotkey).toBe('t')
    expect(scoutsTab?.props.hotkey).toBe('s')
    expect(await ui.find({ type: 'Text', text: /^\[t\] Tasks \(1\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\[s\] Scouts \(2\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Enter opens · t tasks · s scouts · c settings · Esc closes/ })).toBeDefined()
    expect(await ui.find({ key: 'T-1' })).toBeDefined()
    // the Tasks view no longer lists the scouts at the bottom (they have their own view)
    expect(await ui.find({ type: 'Text', text: /^scouts: / })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\/symcc-scout / })).toBeUndefined()
    // "s" presses the Scouts tab
    await ui.press({ key: 'tab-scouts' })
    expect(await ui.find({ key: 'T-1' })).toBeUndefined()
    const active = (await ui.findAll({ type: 'Text', text: /^\[s\] Scouts \(2\)$/ })).find(x => x.props.bold)
    expect(active?.props.color).toBe('ide')
    // one row per scout, running first
    const rows = await ui.findAll({ type: 'Button' })
    const keys = rows.map(r => r.props.key).filter(k => String(k).startsWith('scout:'))
    expect(keys).toEqual(['scout:tests', 'scout:bugs'])
    expect(await ui.find({ type: 'Text', text: /every 30 min/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /next in 12m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ran 8m ago/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /never ran/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Enter opens a scout · run now \/ edit on its page · \/symcc-scout <name>$/ })).toBeDefined()
    expect(await ui.find({ key: 'scout-new' })).toBeDefined()
    const running = (await ui.findAll({ type: 'Text', text: /running/ })).find(x => x.props.color === 'success')
    expect(running).toBeDefined()
    // Enter on a scout opens its detail
    await ui.press({ key: 'scout:bugs' })
    // laid out like an opened task: no tabs, sections with headings
    expect(await ui.find({ key: 'tab-tasks' })).toBeUndefined()
    expect(await ui.find({ key: 'tab-scouts' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /What it looks for/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Last report/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▍File$/ })).toBeDefined()
    expect(await ui.find({ key: 'scout-back' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\.symcc\/scouts\/bugs\.md/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Look for crashes/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /crash in parser/ })).toBeDefined()
    expect(await ui.find({ key: 'scout-run' })).toBeDefined()
    expect(await ui.find({ key: 'scout-edit' })).toBeDefined()
    await ui.press({ key: 'scout-back' })
    expect(await ui.find({ key: 'scout:bugs' })).toBeDefined()
    // "t" goes back to the tasks
    await ui.press({ key: 'tab-tasks' })
    expect(await ui.find({ key: 'T-1' })).toBeDefined()
    await ui.unmount()
  }
})

test('a scout that found nothing says so', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { last_run: new Date().toISOString(), last_report: 'NOTHING' })], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^nothing found$/ })).toBeDefined()
  await ui.unmount()
})

test('with no scouts the Scouts view shows how to add one', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-scouts' })
  expect(await ui.find({ type: 'Text', text: /No scouts yet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\.symcc\/scouts\/<name>\.md/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /every_minutes: 30/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /examples\/scouts\// })).toBeDefined()
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test('"Edit" on a scout\'s page opens its edit mode, and "Cancel" goes back', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { model: 'sonnet', prompt: 'Look for crashes.\nAnd leaks.' })], mode: 'auto', test_commands: [] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'scout-edit' })
  expect(await ui.find({ type: 'Text', text: /^editing$/ })).toBeDefined()
  expect((await ui.find({ key: 'scout-every' }))?.props.value).toBe('30')
  expect((await ui.find({ key: 'scout-model' }))?.props.value).toBe('sonnet')
  const body = await ui.find({ key: 'scout-body' })
  expect(body?.props.value).toBe('Look for crashes.\nAnd leaks.')
  expect(Number(body?.props.rows)).toBeGreaterThan(1)
  expect(await ui.find({ key: 'scout-save' })).toBeDefined()
  // a bad every_minutes is refused with a short error
  await ui.input({ key: 'scout-every', text: '0' })
  await ui.press({ key: 'scout-save' })
  expect(await ui.find({ type: 'Text', text: /whole number, 1 or more/ })).toBeDefined()
  expect(await ui.find({ key: 'scout-save' })).toBeDefined()
  await ui.press({ key: 'scout-cancel' })
  expect(await ui.find({ key: 'scout-save' })).toBeUndefined()
  expect(await ui.find({ key: 'scout-edit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /What it looks for/ })).toBeDefined()
  await ui.unmount()
})

test('"New scout" asks for a name, refuses a bad or taken one, then opens the edit mode', async ($, on) => {
  stateOf(on, { tab: 'scouts', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs')], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'scout-new' })
  await ui.input({ key: 'scout-new-name', text: 'bugs' })
  expect(await ui.find({ type: 'Text', text: /already exists/ })).toBeDefined()
  await ui.input({ key: 'scout-new-name', text: 'bad name' })
  expect(await ui.find({ type: 'Text', text: /letters, digits, - and _/ })).toBeDefined()
  await ui.input({ key: 'scout-new-name', text: 'docs' })
  expect(await ui.find({ type: 'Text', text: /^new scout$/ })).toBeDefined()
  expect((await ui.find({ key: 'scout-every' }))?.props.value).toBe('60')
  expect((await ui.find({ key: 'scout-body' }))?.props.value).toBe('')
  await ui.press({ key: 'scout-cancel' })
  expect(await ui.find({ key: 'scout:bugs' })).toBeDefined()
  await ui.unmount()
})

test('a task in review is listed near the top as "ready for review", and the banner shows the board mode', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'doing', 'Busy'), task('T-2', 'todo', 'Later'), task('T-5', 'review', 'Blue button')], working: [], scouts: [], mode: 'review', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /◆ ready for review/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^⏸ review merge $/ })).toBeDefined()
  expect((await ui.find({ key: 'mode' }))!.props.label).toBe('[m] auto')
  const rows = (await ui.findAll({ type: 'Text', text: /^T-\d+\s*$/ })).map(x => x.text.trim())
  expect(rows[0]).toBe('T-5')
  await ui.unmount()
})

const MODE_CASES = [
  ['auto', /^⏵ auto $/, '[m] review merge'],
  ['off', /^⏹ off $/, '[m] review merge'],
  ['later', /^⏵ auto $/, '[m] review merge'],
] as const
for (const [mode, text, label] of MODE_CASES)
  test(`the banner shows mode "${mode}" with its label, and m switches only between review and auto`, async ($, on) => {
    stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Later')], working: [], scouts: [], mode, test_commands: [] } } })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
    expect((await ui.find({ key: 'mode' }))!.props.label).toBe(label)
    await ui.unmount()
  })

test('a task in review opens with Approve, Reject and Show changes; Reject asks for a reason', async ($, on) => {
  stateOf(on, { opened: 'T-5', view: { shape: 'view-1', value: { tasks: [task('T-5', 'review', 'Blue button', { branch: 'symcc/T-5' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /ready for review/ })).toBeDefined()
  expect(await ui.find({ key: 'approve' })).toBeDefined()
  expect(await ui.find({ key: 'reject' })).toBeDefined()
  expect(await ui.find({ key: 'show-changes' })).toBeDefined()
  expect(await ui.find({ key: 'needs-review' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Changes \(/ })).toBeDefined()
  expect(await ui.find({ key: 'reject-reason' })).toBeUndefined()
  await ui.press({ key: 'reject' })
  expect(await ui.find({ key: 'reject-reason' })).toBeDefined()
  // Show changes opens the diff view (here git can't run, so it says so), with Approve and Reject still there
  await ui.press({ key: 'show-changes' })
  expect(await ui.find({ key: 'diff-back' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /changes in all files/ })).toBeDefined()
  expect(await ui.find({ key: 'approve' })).toBeDefined()
  expect(await ui.find({ key: 'reject' })).toBeDefined()
  await ui.press({ key: 'diff-back' })
  expect(await ui.find({ key: 'show-changes' })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.unmount()
})

test('a task not in review has a needs_review toggle but no review buttons', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Build it', { needs_review: true })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'needs-review' })).toBeDefined()
  expect((await ui.find({ key: 'needs-review' }))!.props.label).toBe('Needs review: on')
  expect(await ui.find({ key: 'approve' })).toBeUndefined()
  expect(await ui.find({ key: 'show-changes' })).toBeUndefined()
  await ui.unmount()
})

test('the Tasks / Scouts tabs sit in the header, above the line, in both views', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [scout('bugs')], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const view of ['tasks', 'scouts'] as const) {
    if (view === 'scouts') await ui.press({ key: 'tab-scouts' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const tab = texts.findIndex(t => t === '[t] Tasks (1)')
    const rule = texts.findIndex(t => /^━{50}$/.test(t))
    const hint = texts.findIndex(t => /^Enter opens · t tasks/.test(t))
    const row = texts.findIndex(t => (view === 'tasks' ? /Write it up/ : /^bugs/).test(t))
    expect(tab).toBeGreaterThan(-1)
    expect(rule).toBeGreaterThan(tab)
    // the hint sits at the bottom, after the last row, not between the line and the list
    expect(row).toBeGreaterThan(rule)
    expect(texts.slice(rule + 1, row).some(t => /^Enter opens/.test(t))).toBe(false)
    expect(hint).toBeGreaterThan(row)
    expect(texts.slice(hint + 1).some(t => /Write it up|^bugs/.test(t))).toBe(false)
  }
  expect(await ui.find({ key: 'scout:bugs' })).toBeDefined()
  await ui.unmount()
})

test('"c" and the Settings tab show one row per setting, with value, default and range', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Build it')], working: [], scouts: [], mode: 'review', test_commands: ['npm test'], target_branch: 'main', max_parallel: 5, max_minutes: 45, auto_retries: 2, open_on_start: true, voice: false } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const settingsTab = await ui.find({ key: 'tab-settings' })
  expect(settingsTab?.props.hotkey).toBe('c')
  expect(await ui.find({ type: 'Text', text: /^\[c\] Settings$/ })).toBeDefined()
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  const active = (await ui.findAll({ type: 'Text', text: /^\[c\] Settings$/ })).find(x => x.props.bold)
  expect(active?.props.color).toBe('ide')
  const keys = (await ui.findAll({ type: 'Button' })).map(r => String(r.props.key)).filter(k => k.startsWith('setting:'))
  expect(keys).toEqual(['test_commands', 'target_branch', 'max_parallel', 'max_minutes', 'auto_retries', 'open_on_start', 'voice', 'mode', 'enabled'].map(n => `setting:${n}`))
  expect(await ui.find({ type: 'Text', text: /^ npm test$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ 5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /default 3 · 1-8 · how many workers run at once/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /default 45 · 5-600/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /commands joined with " && "/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ off$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ review$/ })).toBeDefined()
  // Enter on a number opens an edit box; on mode a pick list of off / review / auto
  await ui.press({ key: 'setting:max_parallel' })
  expect(await ui.find({ key: 'setting-edit' })).toBeDefined()
  await ui.press({ key: 'setting:mode' })
  expect(await ui.find({ key: 'setting-edit' })).toBeUndefined()
  expect(await ui.find({ key: 'pick:off' })).toBeDefined()
  expect(await ui.find({ key: 'pick:review' })).toBeDefined()
  expect(await ui.find({ key: 'pick:auto' })).toBeDefined()
  await ui.press({ key: 'setting-cancel' })
  expect(await ui.find({ key: 'pick:off' })).toBeUndefined()
  // "t" goes back to the tasks
  await ui.press({ key: 'tab-tasks' })
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  await ui.unmount()
})

/**
 * A small fake of the files: `files` maps the end of a path (e.g. "/roles/docs.md") to its text; folders come
 * from those paths. Writes go to `written` (path → text). Other paths go on to the test kit.
 */
function fakeFiles(on: On, files: Record<string, string | null>) {
  const written: Record<string, string> = {}
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  const dirOf = (p: string) => Object.keys(files).some(f => f.startsWith('/') && p.endsWith(f.slice(0, f.lastIndexOf('/'))))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : dirOf(e.path) ? { value: true } : next(e)))
  on('fs.list', (_, e, next) =>
    dirOf(e.path) ? { value: Object.keys(files).filter(f => e.path.endsWith(f.slice(0, f.lastIndexOf('/'))) && files[f] !== null).map(f => ({ name: f.slice(f.lastIndexOf('/') + 1), kind: 'file' })) } : next(e),
  )
  on('fs.read', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] } : next(e)))
  on('fs.write', (_, e) => ((written[e.path] = String(e.text)), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  return written
}

const ROLE_FILES = {
  '/roles/general.md': '---\ndescription: a plain worker\n---\n',
  '/roles/docs.md': '---\ndescription: writes the docs\n---\n- plain words\n',
  '/roles/tests.md': '---\ndescription: writes tests\nmodel: sonnet\n---\n- cover errors\n',
  '/roles/security.md': '---\ndescription: checks for holes\n---\n',
}

test('a task shows its role after the status in a subtle color; general shows nothing', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Plain work', { role: 'general' }), task('T-12', 'doing', 'Cover the parser errors', { role: 'tests' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const mark = await ui.find({ type: 'Text', text: /^ · tests\s*$/ })
  expect(mark).toBeDefined()
  expect(mark?.props.color).toBe('subtle')
  expect(await ui.find({ type: 'Text', text: /general/ })).toBeUndefined()
  await ui.unmount()
})

test('an open task shows its role and model; "Role" (l) opens a pick list of the roles, and picking one sets it', async ($, on) => {
  const board = { tasks: [task('T-1', 'todo', 'Write it up', { role: 'tests' })] }
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { ...ROLE_FILES, '/board.json': JSON.stringify(board), '/board.lock': null })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'details-toggle' }) // the Details rows start folded
  expect(await ui.find({ type: 'Text', text: /^Role:\s+tests — writes tests · model sonnet$/ })).toBeDefined()
  const button = await ui.find({ key: 'role' })
  expect(button?.props.hotkey).toBe('l')
  expect(await ui.find({ type: 'Text', text: /l role/ })).toBeDefined()
  await ui.press({ key: 'role' })
  for (const r of ['general', 'tests', 'security', 'docs']) expect(await ui.find({ key: `role:${r}` })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^● tests$/ })).toBeDefined()
  await ui.press({ key: 'role:docs' })
  const saved = Object.entries(written).filter(([p]) => /board\.json\.tmp$/.test(p)).map(([, text]) => text)
  expect(saved.length).toBe(1)
  expect(JSON.parse(saved[0]!).tasks[0].role).toBe('docs')
  expect(toasts.some(t => /T-1 role: docs/.test(t))).toBe(true)
  expect(await ui.find({ key: 'role:docs' })).toBeUndefined()
  await ui.unmount()
})

test('a running task shows its role but has no Role button', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'doing', 'Busy')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  fakeFiles(on, ROLE_FILES)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'details-toggle' }) // the Details rows start folded
  expect(await ui.find({ type: 'Text', text: /^Role:\s+general — a plain worker$/ })).toBeDefined()
  expect(await ui.find({ key: 'role' })).toBeUndefined()
  await ui.unmount()
})

test('a role file that is skipped is said once in a toast, with the reason', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  fakeFiles(on, { ...ROLE_FILES, '/roles/x.md': '---\nmodel: haiku\n---\nno description here' })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(String(e.text ?? JSON.stringify(e))), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'role' })
  await ui.press({ key: 'role-cancel' })
  await ui.press({ key: 'role' })
  expect(await ui.find({ key: 'role:x' })).toBeUndefined()
  expect(await ui.find({ key: 'role:docs' })).toBeDefined()
  expect(toasts.filter(t => t.includes('symcc: skipped roles/x.md: no description')).length).toBe(1)
  await ui.unmount()
})

/** The whole lines of the panel, in order (without the colored pieces inside them). */
const lines = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) => {
  const out: string[] = []
  // a colored piece comes right after the line it is part of: skip it
  for (const { text } of await ui.findAll({ type: 'Text' })) if (!out.length || !out[out.length - 1]!.includes(text)) out.push(text)
  return out
}

test('the task page shows one labelled row per fact, From and Why on their own rows, and the full request', async ($, on) => {
  const request = 'improve the scouts so that they will find real issues and be less noisy about small doc nits that nobody cares about'
  const origin = { by: 'owner', request, why: 'Scouts mostly find small doc nits and repeat known items', evidence: 'last owner prompt at 2026-11-12 09:00 UTC', at: '' }
  stateOf(on, { opened: 'T-3', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Base work'), task('T-3', 'review', 'Better scouts', { origin, files: ['hooks/a.ts'], after: ['T-1'], branch: 'symcc/T-3', attempts: 2 })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'details-toggle' }) // the Details rows start folded
  const L = await lines(ui)
  // the header: id and title in bold, then the status badge in its own color
  const id = await ui.find({ type: 'Text', text: /^T-3$/ })
  expect(id?.props.bold).toBe(true)
  const badge = (await ui.findAll({ type: 'Text', text: /^\[◆ ready for review\]$/ })).find(t => t.props.color)
  expect(badge?.props.color).toBe('warning')
  expect(badge?.props.bold).toBe(true)
  for (const label of ['Status', 'Role', 'From', 'Why', 'Request', 'Seen', 'Files', 'After', 'Branch', 'Tries']) {
    const row = L.find(l => l.startsWith(`${label}:`))
    expect(row).toBeDefined()
    // every value starts in the same column
    expect(row!.slice(0, 9).trim()).toBe(`${label}:`)
    expect(row![9]).not.toBe(' ')
  }
  expect(L.some(l => /^From:\s+owner$/.test(l))).toBe(true)
  expect(L.some(l => /^Why:\s+Scouts mostly find/.test(l))).toBe(true)
  expect(L.some(l => /·\s*why:/.test(l))).toBe(false)
  // the request in full, in quotes, wrapped within the panel, never cut mid-word
  const at = L.findIndex(l => l.startsWith('Request:'))
  const seen = L.findIndex(l => l.startsWith('Seen:'))
  const wrapped = L.slice(at, seen).map(l => l.slice(9))
  expect(wrapped.length).toBeGreaterThan(1)
  expect(L.slice(at + 1, seen).every(l => l.startsWith(' '.repeat(9)))).toBe(true)
  expect(wrapped.join(' ')).toBe(`“${request}”`)
  for (const l of L.slice(at, seen)) expect(l.length).toBeLessThanOrEqual(50)
  expect(L.some(l => /^Seen:\s+last owner prompt/.test(l))).toBe(true)
  const seenPiece = await ui.find({ type: 'Text', text: /^last owner prompt/ })
  expect(seenPiece?.props.color).toBe('subtle')
  const who = await ui.find({ type: 'Text', text: /^owner$/ })
  expect(who?.props.color).toBe('claude')
  expect(L.some(l => /^Branch:\s+symcc\/T-3$/.test(l))).toBe(true)
  expect(L.some(l => /^Tries:\s+2 tries$/.test(l))).toBe(true)
  // the section headings, in order
  const heads = L.filter(l => /^▍/.test(l))
  expect(heads[0]).toBe('▍Details  press e to hide')
  expect(heads).toContain('▍What to do')
  await ui.unmount()
})

test('From shows a scout or a split task in its own color', async ($, on) => {
  stateOf(on, { opened: 'T-4', view: { shape: 'view-1', value: { tasks: [task('T-4', 'doing', 'Fix it', { origin: { by: 'scout', scout: 'bugs', why: 'it breaks', at: '' } }), task('T-5', 'todo', 'Part', { origin: { by: 'lead', task: 'T-4', how: 'split', why: 'too big', at: '' } })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'details-toggle' }) // the Details rows start folded
  expect((await ui.find({ type: 'Text', text: /^scout bugs$/ }))?.props.color).toBe('suggestion')
  expect((await ui.findAll({ type: 'Text', text: /^\[▶ doing\]$/ })).find(t => t.props.color)?.props.color).toBe('ide')
  expect((await lines(ui)).some(l => /^Request:/.test(l))).toBe(false)
  await ui.unmount()
})

test('an old task without an origin still opens, with From: unknown and no Why row', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Old one')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'details-toggle' }) // the Details rows start folded
  const L = await lines(ui)
  expect(L.some(l => /^From:\s+unknown/.test(l))).toBe(true)
  expect(L.some(l => /^Why:/.test(l))).toBe(false)
  expect(L.some(l => /^Files:\s+anywhere in the project$/.test(l))).toBe(true)
  expect(L.some(l => /^Tries:\s+0 tries$/.test(l))).toBe(true)
  await ui.unmount()
})

test('the task page folds the Details rows to one summary line; e shows them and hides them again', async ($, on) => {
  const origin = { by: 'owner', request: 'make it so', why: 'asked for it', at: '' }
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'review', 'Folded one', { origin, attempts: 1, branch: 'symcc/T-1' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // folded by default: heading plus one summary line, no rows; d stays Show changes
  expect(await ui.find({ type: 'Text', text: /^▍Details$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}\S+ .+ · \w+ · from owner · 1 try · press e to show$/ })).toBeDefined()
  let L = await lines(ui)
  for (const label of ['Status', 'Role', 'From', 'Why', 'Request', 'Files', 'Branch', 'Tries']) expect(L.some(l => new RegExp(`^${label}:`).test(l))).toBe(false)
  expect((await ui.find({ key: 'details-toggle' }))?.props.hotkey).toBe('e')
  expect((await ui.find({ key: 'show-changes' }))?.props.hotkey).toBe('d')
  expect(await ui.find({ type: 'Text', text: /· e show details/ })).toBeDefined()
  // e shows all the rows
  await ui.press({ key: 'details-toggle' })
  L = await lines(ui)
  for (const label of ['Status', 'Role', 'From', 'Why', 'Request', 'Files', 'Branch', 'Tries']) expect(L.some(l => new RegExp(`^${label}:`).test(l))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^ {2}press e to hide$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /· e hide details/ })).toBeDefined()
  // and folds them again
  await ui.press({ key: 'details-toggle' })
  expect((await lines(ui)).some(l => /^Tries:/.test(l))).toBe(false)
  expect(await ui.find({ type: 'Text', text: /press e to show$/ })).toBeDefined()
  await ui.unmount()
})

test('the Details summary of an old task without an origin says from unknown', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Old one', { attempts: 3 })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /from unknown · 3 tries · press e to show$/ })).toBeDefined()
  await ui.unmount()
})

test('long "What to do" text is shown in full, with no fold hint', async ($, on) => {
  const details = Array.from({ length: 15 }, (_, i) => `step number ${i + 1}`).join('\n')
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Long one', { details })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (let n = 1; n <= 15; n++) expect(await ui.find({ type: 'Text', text: new RegExp(`^step number ${n}$`) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /more lines|show all/ })).toBeUndefined()
  await ui.unmount()
})

test('the task page shows a Commits row: short ids, newest first, the merged one marked', async ($, on) => {
  const a = '1'.repeat(40)
  const b = '2'.repeat(40)
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Merged one', { attempts: 1, runs: [{ started: '', ended: '', commits: [a, b] }], merged: b })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'details-toggle' }) // the Details rows start folded
  const L = await lines(ui)
  expect(L.some(l => /^Commits:\s+22222222 \(merged\), 11111111 \(try 1\)$/.test(l))).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^22222222$/ }))?.props.color).toBe('success')
  await ui.unmount()
})

const COMPOSE = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as never

test('the lead guide is in the system prompt while symcc is on, and left out once it is off', async ($, on) => {
  const files: Record<string, string | null> = { '/board.json': JSON.stringify({ tasks: [] }), '/board.lock': null }
  fakeFiles(on, files)
  // the engine's own sections, beneath the plugin
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  const ids = async () => ((await $.prompt.compose(COMPOSE)) as { sections: { id: string }[] }).sections.map(x => x.id)
  // an old board without "enabled" is on
  expect(await ids()).toContain('symcc:lead')
  files['/board.json'] = JSON.stringify({ tasks: [], enabled: false })
  expect(await ids()).not.toContain('symcc:lead')
  files['/board.json'] = JSON.stringify({ tasks: [], enabled: true })
  expect(await ids()).toContain('symcc:lead')
})

test('while symcc is off its tools answer that it is off and leave the board alone', async ($, on) => {
  const board = { tasks: [task('T-1', 'todo', 'Build it')], enabled: false }
  const written = fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  const r = (await $.tool.call({ tool: 'mcp__symcc__add', title: 'More', why: 'test' } as never)) as { result?: unknown }
  expect(JSON.stringify(r.result)).toContain('symcc is off. The owner can turn it on with /symcc-on.')
  expect(Object.keys(written).some(p => /board\.json/.test(p))).toBe(false)
})
