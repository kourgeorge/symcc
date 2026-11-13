import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ICON, ICON_ART } from '../hooks/name'
import { hintLines, hintLineText, listKeys, taskKeys, type KeyHint } from '../hooks/board'

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

/** The lines of a key hint as the panel draws them at `width`, each found whole, in order, among its texts. */
function keyLines(texts: string[], hints: KeyHint[], width: number): string[] {
  const want = hintLines(hints, width).map(hintLineText)
  let at = -1
  for (const l of want) {
    const k = texts.indexOf(l, at + 1)
    expect(k).toBeGreaterThan(at)
    at = k
  }
  return want
}

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
    expect((await ui.find({ type: 'Text', text: /^ \? waiting\s*$/ }))?.props.color).toBe('warning')
    expect((await ui.find({ type: 'Text', text: /Search mode/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Case-sensitive/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^T-3\s*$/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^ ▶ / }))?.props.color).toBe('ide')
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
  expect((await ui.find({ type: 'Text', text: /^  All clear\. Nothing running or waiting\.$/ }))?.props.color).toBe('subtle')
  expect((await ui.find({ type: 'Text', text: /^  Tell the lead what you want next\.$/ }))?.props.color).toBe('subtle')
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
  const header = await ui.find({ type: 'Text', text: /^  ▸ Backlog  2$/ })
  expect(header).toBeDefined()
  expect(header?.props.color).toBe('text')
  // the open tasks come first, then a blank line, then the Backlog row; no dotted rule, no brackets
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const at = texts.findIndex(t => /^  ▸ Backlog  2$/.test(t))
  expect(texts.findIndex(t => /Write it up/.test(t))).toBeLessThan(at)
  expect(texts[at - 1]).toBe(' ')
  expect(texts.some(t => /┄/.test(t))).toBe(false)
  expect(texts.some(t => /^Enter open · ↑↓ move · t s c views · Esc close$/.test(t))).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^━+$/ }))?.props.color).toBe('ide')
  // folded by default: the items are hidden
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  expect((await ui.find({ key: 'T-1' }))).toBeDefined()
  // Enter on the header opens it; again folds it
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^  ▾ Backlog  2$/ }))).toBeDefined()
  expect((await ui.find({ key: 'T-2' }))).toBeDefined()
  expect((await ui.find({ key: 'T-3' }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /◇/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /2 in backlog/ }))).toBeDefined()
  expect(await ui.find({ key: 'day:backlog-more' })).toBeUndefined()
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^  ▸ Backlog  2$/ }))).toBeDefined()
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

test('the list goes: NEEDS YOU, then doing and to do as one untitled list, then Backlog, Done and Dropped, with blank lines and no rules', async ($, on) => {
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
  // the row's id is its own Text, after the two-space indent
  const heads = [/^NEEDS YOU$/, /^T-4 $/, /^  ▸ Backlog  1$/, /^  ▸ Done     1/, /^  ▸ Dropped  1$/].map(idx)
  expect(heads.every(i => i > -1)).toBe(true)
  expect([...heads].sort((a, b) => a - b)).toEqual(heads)
  // no DOING or TO DO titles: the doing row follows one blank line, the to-do rows follow it with no gap
  expect(texts.some(t => /^DOING$|^TO DO$/.test(t))).toBe(false)
  expect(texts.slice(heads[1]! - 2, heads[1]! + 1)).toEqual([' ', '  ', 'T-4 '])
  expect(texts.slice(heads[1]!, heads[2]! - 1).filter(t => t === ' ')).toEqual([])
  expect(texts.filter(t => /^T-\d+ *$/.test(t))).toEqual(['T-6 ', 'T-5 ', 'T-10', 'T-4 ', 'T-9 ', 'T-3 ', 'T-8 '])
  // a blank line before the folded rows, which sit together; no rules, no brackets
  expect(texts[heads[2]! - 1]).toBe(' ')
  expect(texts.some(t => /┄/.test(t))).toBe(false)
  expect(texts.slice(heads[0]!).some(t => /[[\]]/.test(t))).toBe(false)
  // the rows are plain Buttons, so the terminal draws no "[ … ]" around them
  for (const b of (await ui.findAll({ type: 'Button' })).filter(b => /^T-\d+$|^day:/.test(String(b.key)))) expect(b.props.plain).toBe(true)
  // the NEEDS YOU label is bold, not a button
  expect((await ui.find({ type: 'Text', text: /^NEEDS YOU$/ }))?.props.bold).toBe(true)
  // review and the rest of the rows: the short status word, failed in red
  expect((await ui.find({ type: 'Text', text: /^ ✗ failed\s*$/ }))?.props.color).toBe('error')
  expect((await ui.find({ type: 'Text', text: /^ ‖ paused\s*$/ }))).toBeDefined()
  // even with a task in review the hint offers only keys that work in the list: no a or x
  expect(texts.some(t => /^Enter open · ↑↓ move · t s c views · Esc close$/.test(t))).toBe(true)
  expect(texts.some(t => /a\/x|a approve|x reject/.test(t))).toBe(false)
  // folded by default: no done, dropped or backlog tasks shown
  for (const k of ['T-1', 'T-2', 'T-7']) expect(await ui.find({ key: k })).toBeUndefined()
  await ui.press({ key: 'day:done' })
  expect(await ui.find({ type: 'Text', text: /^  ▾ Done     1$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  expect(await ui.find({ key: 'T-7' })).toBeUndefined()
  await ui.press({ key: 'day:dropped' })
  expect(await ui.find({ type: 'Text', text: /^  ▾ Dropped  1$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-7' })).toBeDefined()
  await ui.press({ key: 'day:done' })
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  expect(await ui.find({ key: 'T-7' })).toBeDefined()
  await ui.unmount()
})

test('the Done row shows just the count, at any width', async ($, on) => {
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
  for (const cols of [80, 50, 30]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: cols }, surface: 'terminal' })
    expect((await ui.find({ key: 'day:done' }))?.text).toBe('  ▸ Done     3')
    expect(await ui.find({ type: 'Text', text: /last today/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('with nothing to do, need or run, two subtle "All clear" lines sit above the folded groups', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser', { updated_at: new Date().toISOString() }), task('T-2', 'backlog', 'Dark mode')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const line = texts.findIndex(t => t === '  All clear. Nothing running or waiting.')
  expect(line).toBeGreaterThan(-1)
  expect((await ui.find({ type: 'Text', text: /All clear/ }))?.props.color).toBe('subtle')
  expect(texts[line + 1]).toBe('  Tell the lead what you want next.')
  expect(texts[line + 2]).toBe(' ')
  expect(line).toBeLessThan(texts.findIndex(t => /^  ▸ Backlog  1$/.test(t)))
  expect(texts.some(t => /┄|NEEDS YOU|DOING|TO DO/.test(t))).toBe(false)
  // the first button (the Backlog header) gets the focus
  expect((await ui.findAll({ type: 'Button' })).find(b => b.props.autoFocus)?.key).toBe('day:backlog')
  await ui.unmount()
})

test('a board with only active work has no folded rows, no All clear lines and no rules', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^NEEDS YOU$|^DOING$|^TO DO$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /All clear/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /▸/ })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).filter(t => /┄/.test(t.text)).length).toBe(0)
  await ui.unmount()
})

test('over 5 backlog items the opened Backlog shows 5 and "… N more"', async ($, on) => {
  const ideas = [2, 3, 4, 5, 6, 7, 8].map(n => task(`T-${n}`, 'backlog', `Idea ${n}`))
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), ...ideas], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  const first = buttons.findIndex(k => k === 'day:backlog' || k === 'day:done' || /^T-\d$/.test(String(k)))
  expect(buttons[first]).toBe('day:backlog')
  expect((await ui.find({ type: 'Text', text: /^  ▸ Backlog  7$/ }))).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /Backlog/ })).toBeUndefined()
  // only the strong rule under the header, and no dotted rule
  expect((await ui.findAll({ type: 'Text' })).filter(t => /^━+$/.test(t.text)).length).toBe(1)
  expect((await ui.findAll({ type: 'Text' })).filter(t => /┄/.test(t.text)).length).toBe(0)
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
  // long "What to do" text and the Details rows are both shown in full
  expect(await ui.find({ type: 'Text', text: /THE END/ })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /^Enter open · ↑↓ move · t s c views · Esc close$/ })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /next in 12m/ })).toBeDefined()
    // 50 columns: the model and "last:" columns don't fit, so they are left out
    expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /last:/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Enter open · t s c views · Esc close$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Enter opens a scout/ })).toBeUndefined()
    expect(await ui.find({ key: 'scout-new' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^  \+ New scout$/ })).toBeDefined()
    const running = (await ui.findAll({ type: 'Text', text: /running now…/ })).find(x => x.props.color === 'ide')
    expect(running).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: /^  ◉ $/ })).find(x => x.props.color === 'ide')).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^  ◎ $/ })).toBeDefined()
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
  // under the box, a hint that 0 means only on demand
  expect(await ui.find({ type: 'Text', text: /^0 = only on demand$/ })).toBeDefined()
  // a bad every_minutes is refused with a short error
  await ui.input({ key: 'scout-every', text: '-5' })
  await ui.press({ key: 'scout-save' })
  expect(await ui.find({ type: 'Text', text: /^every \(minutes\) must be a whole number: 0 for only on demand, or 1 or more$/ })).toBeDefined()
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

test('a task in review is listed near the top as "review" with its keys, and the banner shows the board mode', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'doing', 'Busy'), task('T-2', 'todo', 'Later'), task('T-5', 'review', 'Blue button')], working: [], scouts: [], mode: 'review', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^ ◆ review\s*$/ }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^\s*Enter to review$/ }))?.props.color).toBe('subtle')
  // a and x only work on the task's own page, so the list never offers them
  expect(await ui.find({ type: 'Text', text: /a approve|x reject|a\/x/ })).toBeUndefined()
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
    const hint = texts.findIndex(t => (view === 'tasks' ? /^Enter open · ↑↓ move/ : /^Enter open · t s c views · Esc close$/).test(t))
    const row = texts.findIndex(t => (view === 'tasks' ? /Write it up/ : /^bugs/).test(t))
    expect(tab).toBeGreaterThan(-1)
    expect(rule).toBeGreaterThan(tab)
    // the hint sits at the bottom, after the last row, not between the line and the list
    expect(row).toBeGreaterThan(rule)
    expect(texts.slice(rule + 1, row).some(t => /^Enter open/.test(t))).toBe(false)
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
  '/roles/tester.md': '---\ndescription: writes tests\nmodel: sonnet\n---\n- cover errors\n',
  '/roles/security.md': '---\ndescription: checks for holes\n---\n',
}

test('a running task shows its role and try at the right end in a subtle color; general shows only the try', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'doing', 'Plain work', { role: 'general', attempts: 2 }), task('T-12', 'doing', 'Cover the parser errors', { role: 'tester', attempts: 1 })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 60 }, surface: 'terminal' })
  const mark = await ui.find({ type: 'Text', text: /^ +tester · try 1$/ })
  expect(mark).toBeDefined()
  expect(mark?.props.color).toBe('subtle')
  expect((await ui.find({ key: 'T-12' }))?.text.length).toBe(60)
  expect(await ui.find({ type: 'Text', text: /^ +try 2$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /general/ })).toBeUndefined()
  await ui.unmount()
})

test('an open task shows its role and model; "Role" (l) opens a pick list of the roles, and picking one sets it', async ($, on) => {
  const board = { tasks: [task('T-1', 'todo', 'Write it up', { role: 'tester' })] }
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { ...ROLE_FILES, '/board.json': JSON.stringify(board), '/board.lock': null })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Role:\s+tester — writes tests · model sonnet$/ })).toBeDefined()
  const button = await ui.find({ key: 'role' })
  expect(button?.props.hotkey).toBe('l')
  expect(await ui.find({ type: 'Text', text: /l role/ })).toBeDefined()
  await ui.press({ key: 'role' })
  for (const r of ['general', 'tester', 'security', 'docs']) expect(await ui.find({ key: `role:${r}` })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^● tester$/ })).toBeDefined()
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
  expect(heads[0]).toBe('▍Details')
  expect(heads).toContain('▍What to do')
  await ui.unmount()
})

test('From shows a scout or a split task in its own color', async ($, on) => {
  stateOf(on, { opened: 'T-4', view: { shape: 'view-1', value: { tasks: [task('T-4', 'doing', 'Fix it', { origin: { by: 'scout', scout: 'bugs', why: 'it breaks', at: '' } }), task('T-5', 'todo', 'Part', { origin: { by: 'lead', task: 'T-4', how: 'split', why: 'too big', at: '' } })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^scout bugs$/ }))?.props.color).toBe('suggestion')
  expect((await ui.findAll({ type: 'Text', text: /^\[▶ doing\]$/ })).find(t => t.props.color)?.props.color).toBe('ide')
  expect((await lines(ui)).some(l => /^Request:/.test(l))).toBe(false)
  await ui.unmount()
})

test('an old task without an origin still opens, with From: unknown and no Why row', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Old one')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  expect(L.some(l => /^From:\s+unknown/.test(l))).toBe(true)
  expect(L.some(l => /^Why:/.test(l))).toBe(false)
  expect(L.some(l => /^Files:\s+anywhere in the project$/.test(l))).toBe(true)
  expect(L.some(l => /^Tries:\s+0 tries$/.test(l))).toBe(true)
  await ui.unmount()
})

test('the task page shows the Details rows in full with no fold and no e key', async ($, on) => {
  const origin = { by: 'owner', request: 'make it so', why: 'asked for it', at: '' }
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'review', 'Open one', { origin, attempts: 1, branch: 'symcc/T-1' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // shown without pressing anything, under a plain heading
  expect(await ui.find({ type: 'Text', text: /^▍Details$/ })).toBeDefined()
  const L = await lines(ui)
  for (const label of ['Status', 'Role', 'From', 'Why', 'Request', 'Files', 'Branch', 'Tries']) expect(L.some(l => new RegExp(`^${label}:`).test(l))).toBe(true)
  // no fold: no toggle, no "press e" hint, no e in the key hints; d stays Show changes
  expect(await ui.find({ key: 'details-toggle' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /press e|show details|hide details/ })).toBeUndefined()
  expect(L.some(l => /press e|· e /.test(l))).toBe(false)
  expect((await ui.find({ key: 'show-changes' }))?.props.hotkey).toBe('d')
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

test('the Tasks view: a status strip on top, NEEDS YOU then one doing / to do list with extras, aligned folded rows, a short hint', async ($, on) => {
  const now = Date.now()
  const iso = (m: number) => new Date(now + m * 60_000).toISOString()
  const tasks = [
    task('T-94', 'review', 'Clearer board view'),
    task('T-95', 'doing', 'Secrets scout example', { role: 'frontend', attempts: 1, runs: [{ started: iso(-4) }] }),
    task('T-96', 'doing', 'Version 0.3.0', { role: 'docs', attempts: 1, runs: [{ started: iso(-1) }] }),
    task('T-97', 'todo', 'Rename "off" to "pause"', { after: ['T-96'] }),
    ...[1, 2, 3].map(n => task(`T-${n}`, 'backlog', `Idea ${n}`)),
    ...Array.from({ length: 12 }, (_, k) => task(`T-${k + 10}`, 'done', `Work ${k}`, { updated_at: iso(-5 - k) })),
  ]
  const scouts = [scout('secrets', { next_run: iso(38.2) }), scout('bugs', { next_run: iso(90) })]
  stateOf(on, { view: { shape: 'view-1', value: { tasks, working: [], scouts, mode: 'review', max_parallel: 3, test_commands: [] } } })
  for (const w of [40, 60, 100]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'terminal' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    // the strip sits right above the strong rule; the next scout only when it fits
    const strip = texts.findIndex(t => /^symcc · review · 2\/3 workers · 2 scouts/.test(t))
    expect(strip).toBeGreaterThan(-1)
    expect(/^━+$/.test(texts[strip + 1] ?? '')).toBe(true)
    expect(texts[strip]!.length).toBeLessThanOrEqual(w)
    if (w >= 100) expect(texts[strip]).toBe('symcc · review · 2/3 workers · 2 scouts (next: secrets in 38m)')
    // every task row fits the panel; the hint is whole and fits too
    for (const id of ['T-94', 'T-95', 'T-96', 'T-97']) expect((await ui.find({ key: id }))!.text.length).toBeLessThanOrEqual(w)
    const hint = keyLines(texts, listKeys(), w)
    for (const l of hint) expect(l.length).toBeLessThanOrEqual(w)
    expect(hint.join(' · ')).toBe('Enter open · ↑↓ move · t s c views · Esc close')
    expect(texts.some(t => /a\/x|a approve|x reject/.test(t))).toBe(false)
    // folded rows: no brackets, counts lined up
    const backlog = (await ui.find({ key: 'day:backlog' }))!.text
    const done = (await ui.find({ key: 'day:done' }))!.text
    expect(backlog).toBe('  ▸ Backlog   3')
    expect(done).toBe('  ▸ Done     12')
    expect(await ui.find({ key: 'day:dropped' })).toBeUndefined()
    await ui.unmount()
  }
  // at 100 columns the extras sit at the right end of each row
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'terminal' })
  expect((await ui.find({ key: 'T-95' }))!.text).toMatch(/^  T-95 ▶ 4m\s+Secrets scout example\s+frontend · try 1$/)
  expect((await ui.find({ key: 'T-95' }))!.text.length).toBe(100)
  expect((await ui.find({ key: 'T-97' }))!.text).toMatch(/^  T-97 ○\s+Rename "off" to "pause"\s+after T-96$/)
  expect((await ui.find({ key: 'T-94' }))!.text).toMatch(/^  T-94 ◆ review\s+Clearer board view\s+Enter to review$/)
  // focus starts on the first task, and the order is tasks first, then folded rows
  const buttons = (await ui.findAll({ type: 'Button' })).filter(b => /^T-\d+$|^day:/.test(String(b.key)))
  expect(buttons.find(b => b.props.autoFocus)?.key).toBe('T-94')
  expect(buttons.map(b => String(b.key))).toEqual(['T-94', 'T-96', 'T-95', 'T-97', 'day:backlog', 'day:done'])
  await ui.unmount()
  // a narrow panel drops the extra first, then cuts the title
  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 30 }, surface: 'terminal' })
  const row = (await narrow.find({ key: 'T-95' }))!.text
  expect(row).not.toMatch(/try 1/)
  expect(row).toMatch(/…$/)
  expect(row.length).toBeLessThanOrEqual(30)
  await narrow.unmount()
})

const STRIP_CASES = [
  ['symcc is turned off', { enabled: false }, /^symcc off · \/symcc-on$/],
  ['the board is in mode off', { mode: 'off' }, /^symcc · off · 0\/3 workers · 1 scout$/],
] as const
for (const [when, extra, want] of STRIP_CASES)
  test(`the status strip when ${when}: a warning, and no next scout`, async ($, on) => {
    const soon = new Date(Date.now() + 10 * 60_000).toISOString()
    stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [scout('bugs', { next_run: soon })], mode: 'auto', test_commands: [], ...extra } } })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
    const strip = await ui.find({ type: 'Text', text: want })
    expect(strip).toBeDefined()
    expect(strip?.props.color).toBe('warning')
    await ui.unmount()
  })

test('a task in review on a narrow or wide panel shows every key and every button in full, keys first by importance', async ($, on) => {
  stateOf(on, { opened: 'T-5', view: { shape: 'view-1', value: { tasks: [task('T-5', 'review', 'Blue button', { branch: 'symcc/T-5' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  for (const w of [30, 50, 80]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'terminal' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const lines = keyLines(texts, taskKeys('review'), w)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(w)
    expect(lines.join(' · ')).toBe('a approve · x reject · d show changes · ↑↓ scroll · b back')
    if (w === 30) expect(lines).toEqual(['a approve · x reject', 'd show changes · ↑↓ scroll', 'b back'])
    if (w === 80) expect(lines).toEqual(['a approve · x reject · d show changes · ↑↓ scroll · b back'])
    // the keys are bold, the words in the inactive color
    expect((await ui.find({ type: 'Text', text: /^a$/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^ approve$/ }))?.props.color).toBe('inactive')
    // every action button is there, in the same order as before
    const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.key))
    expect(keys).toEqual(['back', 'approve', 'reject', 'show-changes', 'drop', 'needs-review'])
    await ui.unmount()
  }
})

/** The Scouts list of the task's example, for the list tests. */
function listScouts() {
  const at = Date.now()
  const iso = (m: number) => new Date(at + m * 60_000 + 20_000).toISOString()
  return [
    scout('recent-changes', { every_minutes: 90, running: true, last_run: iso(-1), next_run: iso(89) }),
    scout('gaps-bot', { every_minutes: 60, last_run: iso(-30), next_run: iso(59), last_report: '**1. No test for parse()**' }),
    scout('secrets', { every_minutes: 240, last_run: iso(-60), next_run: iso(239), last_report: 'NOTHING' }),
    scout('test-gaps', { every_minutes: 240, next_run: iso(239), model: 'sonnet' }),
    scout('simplify', { every_minutes: 600, next_run: iso(599), model: 'sonnet', paused: true }),
  ]
}

for (const width of [50, 90]) {
  test(`the Scouts list at ${width} columns: icons, aligned columns, one hint line`, async ($, on) => {
    stateOf(on, { tab: 'scouts', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: listScouts(), mode: 'auto', test_commands: [] } } })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: width }, surface: 'terminal' })
    const names = ['recent-changes', 'gaps-bot', 'secrets', 'test-gaps', 'simplify']
    const rows: string[] = []
    for (const n of names) rows.push(String((await ui.find({ key: `scout:${n}` }))?.text).trimEnd())
    console.log(`Scouts list at ${width} columns:\n${rows.join('\n')}`)
    for (const r of rows) expect(r.length).toBeLessThanOrEqual(width)
    if (width === 90)
      expect(rows).toEqual([
        '  ◉ recent-changes  every 90 min    running now…',
        '  ◎ gaps-bot        every hour      next in 59m     last: found 1',
        '  ◎ secrets         every 4 hours   next in 3h 59m  last: nothing',
        '  ◎ test-gaps       every 4 hours   next in 3h 59m  never ran      sonnet',
        '  ○ simplify        every 10 hours  paused          never ran      sonnet',
      ])
    else
      expect(rows).toEqual([
        '  ◉ recent-changes  every 90 min    running now…',
        '  ◎ gaps-bot        every hour      next in 59m',
        '  ◎ secrets         every 4 hours   next in 3h 59m',
        '  ◎ test-gaps       every 4 hours   next in 3h 59m',
        '  ○ simplify        every 10 hours  paused',
      ])
    // icon colors: running blue, waiting plain, paused subtle; a finding in the warning color
    expect((await ui.findAll({ type: 'Text', text: /^  ◉ $/ }))[0]?.props.color).toBe('ide')
    expect((await ui.findAll({ type: 'Text', text: /^  ◎ $/ }))[0]?.props.color).toBe('text')
    expect((await ui.findAll({ type: 'Text', text: /^  ○ $/ }))[0]?.props.color).toBe('subtle')
    if (width === 90) {
      expect((await ui.find({ type: 'Text', text: /last: found 1/ }))?.props.color).toBe('warning')
      expect((await ui.find({ type: 'Text', text: /last: nothing/ }))?.props.color).toBe('subtle')
    }
    // a name for screen readers, "+ New scout" on top, and one hint line, no old help line
    expect((await ui.find({ key: 'scout:simplify' }))?.props.label).toBe('simplify: paused')
    expect(await ui.find({ type: 'Text', text: /^  \+ New scout$/ })).toBeDefined()
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.filter(t => /^Enter open · /.test(t))).toEqual(['Enter open · t s c views · Esc close'])
    expect(texts.some(t => /run now \/ edit on its page/.test(t))).toBe(false)
    await ui.unmount()
  })
}

/** Fake scout files, scouts.json and the board; a write to scouts.json.tmp becomes scouts.json (the mv). */
function scoutFiles(on: On, memory: string | null, more: Record<string, string> = {}) {
  const files: Record<string, string | null> = {
    '/scouts/bugs.md': '---\nevery_minutes: 30\n---\nLook for crashes.\n',
    ...Object.fromEntries(Object.entries(more).map(([n, t]) => [`/scouts/${n}.md`, t])),
    '/scouts.json': memory,
    '/board.json': JSON.stringify({ tasks: [] }),
    '/board.lock': null,
  }
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : e.path.endsWith('/scouts') ? { value: true } : next(e)))
  on('fs.list', (_, e, next) => (e.path.endsWith('/scouts') ? { value: ['bugs', ...Object.keys(more)].map(n => ({ name: `${n}.md`, kind: 'file' })) } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? (files[fileOf(e.path)!] === null ? Promise.reject(new Error('no file')) : { value: files[fileOf(e.path)!] }) : next(e)))
  on('fs.write', (_, e) => {
    if (e.path.endsWith('/scouts.json.tmp')) files['/scouts.json'] = String(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  mock.clock(on, { now: Date.now() })
  return files
}

test('"p" on a scout\'s page pauses it (saved in scouts.json, its file untouched), and again resumes it', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { prompt: 'Look for crashes.' })], mode: 'auto', test_commands: [] } } })
  const files = scoutFiles(on, JSON.stringify({ scouts: { bugs: { last_run: '2026-11-12T08:00:00.000Z', last_report: 'NOTHING' } } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // waiting: the ◎ icon, and p pause in the key hints
  expect(await ui.find({ type: 'Text', text: /^◎ waiting$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /p pause/ })).toBeDefined()
  const button = await ui.find({ key: 'scout-pause' })
  expect(button?.props.hotkey).toBe('p')
  expect(button?.props.label).toBe('Pause')
  await ui.press({ key: 'scout-pause' })
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs).toEqual({ last_run: '2026-11-12T08:00:00.000Z', last_report: 'NOTHING', paused: true })
  expect(files['/scouts/bugs.md']).toBe('---\nevery_minutes: 30\n---\nLook for crashes.\n')
  expect(toasts.some(t => /bugs paused: it doesn't run until you resume it/.test(t))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^○ paused$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^○ paused$/ }))?.props.color).toBe('subtle')
  expect(await ui.find({ type: 'Text', text: /p resume/ })).toBeDefined()
  expect((await ui.find({ key: 'scout-pause' }))?.props.label).toBe('Resume')
  // run now is refused while it is paused
  await ui.press({ key: 'scout-run' })
  expect(toasts.some(t => /bugs is paused; resume it first/.test(t))).toBe(true)
  await ui.press({ key: 'scout-pause' })
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs.paused).toBeUndefined()
  expect(toasts.some(t => /bugs resumed: it runs every 30 min again/.test(t))).toBe(true)
  expect((await ui.find({ key: 'scout-pause' }))?.props.label).toBe('Pause')
  await ui.unmount()
})

test('a running scout\'s page has no Run now button', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { prompt: 'Look for crashes.', running: true })], mode: 'auto', test_commands: [] } } })
  scoutFiles(on, null)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /running now…/ })).toBeDefined()
  expect(await ui.find({ key: 'scout-edit' })).toBeDefined()
  expect(await ui.find({ key: 'scout-run' })).toBeUndefined()
  await ui.unmount()
})

test('/symcc-scout <name> pause and resume, and run now refused while paused', async ($, on) => {
  const files = scoutFiles(on, null)
  stateOf(on, {})
  const run = async (args: string) => String((await $.command.run({ command: 'symcc-scout', args })).text)
  expect(await run('bugs pause')).toMatch(/^bugs paused: it doesn't run until you resume it/)
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs).toEqual({ last_run: null, paused: true })
  expect(await run('bugs pause')).toMatch(/^bugs is already paused/)
  expect(await run('bugs')).toBe('bugs is paused; resume it first (p on its page, or /symcc-scout bugs resume)')
  expect(await run('bugs resume')).toBe('bugs resumed: it runs every 30 min again')
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs).toBeUndefined()
  expect(await run('bugs')).not.toMatch(/paused/)
  // this session doesn't drive the board, so run now says why and never "started"
  expect(await run('bugs')).toBe('scouts run in the session that drives the board; run /symcc-scout bugs there')
  expect(await run('nope pause')).toMatch(/^no scout named nope/)
  expect(await run('bugs stop')).toMatch(/^Use: \/symcc-scout <name>/)
})

test('every_minutes 0 or a bad value: no timer, "on demand" in /symcc-scouts with the warning, and run now still works', async ($, on) => {
  scoutFiles(on, null, { secrets: '---\nevery_minutes: 0\n---\nLook for keys.\n', bad: '---\nevery_minutes: -5\n---\nLook around.\n' })
  stateOf(on, {})
  const list = String((await $.command.run({ command: 'symcc-scouts', args: '' })).text)
  expect(list).toMatch(/^bugs: every 30 min/m)
  expect(list).toMatch(/^secrets: on demand$/m)
  expect(list).toMatch(/^bad: on demand \(every_minutes "-5" is not valid: runs only on demand until fixed\)$/m)
  // only bugs is on the timer: the panel shows its next run, and none for secrets and bad
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 120 }, surface: 'terminal' })
  await ui.press({ key: 'tab-scouts' })
  expect(String((await ui.find({ key: 'scout:bugs' }))?.text)).toMatch(/every 30 min\s+next in 30m/)
  expect(String((await ui.find({ key: 'scout:secrets' }))?.text).trimEnd()).toMatch(/^  ◎ secrets\s+on demand\s+never ran$/)
  expect(String((await ui.find({ key: 'scout:bad' }))?.text).trimEnd()).toMatch(/^  ◎ bad\s+on demand\s+bad every_minutes\s+never ran$/)
  await ui.unmount()
  // run now is not refused because the scout runs only on demand
  const run = String((await $.command.run({ command: 'symcc-scout', args: 'secrets' })).text)
  expect(run).not.toMatch(/no scout named|on demand|paused/)
})

test('an on-demand scout\'s page says "on demand" with no "next in", and a bad value shows its warning', async ($, on) => {
  const soon = new Date(Date.now() + 12 * 60_000).toISOString()
  const warning = 'every_minutes "-5" is not valid: runs only on demand until fixed'
  stateOf(on, { tab: 'scouts', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('secrets', { every_minutes: 0, prompt: 'Look for keys.' }), scout('bad', { every_minutes: 0, warning, prompt: 'Look around.' }), scout('bugs', { next_run: soon })], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 90 }, surface: 'terminal' })
  expect(String((await ui.find({ key: 'scout:secrets' }))?.text).trimEnd()).toMatch(/^  ◎ secrets\s+on demand\s+never ran$/)
  expect(String((await ui.find({ key: 'scout:bad' }))?.text).trimEnd()).toMatch(/^  ◎ bad\s+on demand\s+bad every_minutes\s+never ran$/)
  expect((await ui.find({ type: 'Text', text: /bad every_minutes/ }))?.props.color).toBe('warning')
  await ui.press({ key: 'scout:secrets' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(texts).toMatch(/on demand/)
  expect(texts).not.toMatch(/next in/)
  expect(texts).not.toMatch(/not valid/)
  await ui.press({ key: 'scout-back' })
  await ui.press({ key: 'scout:bad' })
  expect((await ui.find({ type: 'Text', text: new RegExp(`^${esc(warning)}$`) }))?.props.color).toBe('warning')
  await ui.unmount()
})

test('a broken board.json is never saved over: a change is refused, a copy is kept, and the owner is told', async ($, on) => {
  const text = JSON.stringify({ version: 1, next_id: 2, mode: 'review', tasks: [task('T-1', 'todo', 'Write it up')] }).replace(/]}$/, ',]}')
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [], mode: 'review', test_commands: [] } } })
  const written = fakeFiles(on, { ...ROLE_FILES, '/board.json': text, '/board.lock': null })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'role' })
  await ui.press({ key: 'role:docs' })
  // nothing was written to board.json or its temp file
  expect(Object.keys(written).some(p => /board\.json(\.tmp)?$/.test(p))).toBe(false)
  // one copy of the file as it was, and the owner is told why
  const copies = Object.entries(written).filter(([p]) => /board\.json\.broken-/.test(p))
  expect(copies.length).toBe(1)
  expect(copies[0]![1]).toBe(text)
  expect(toasts.some(t => /board\.json can't be read/.test(t))).toBe(true)
  expect(toasts.some(t => /T-1 role: docs/.test(t))).toBe(false)
  await ui.unmount()
})

// ---------------- each try's report on the task page ----------------

const R1 = '.symcc/reports/T-1-try-1.md'
const R2 = '.symcc/reports/T-1-try-2.md'
const reportedTask = (extra: Record<string, unknown> = {}) =>
  task('T-1', 'done', 'Explore the market', { attempts: 2, runs: [{ started: '', ended: '', report: R1 }, { started: '', ended: '', report: R2 }], history: ['try 1: first go → tests failed', 'try 2: second go → merged into main'], ...extra })

test('the task page shows the latest try\'s full report, and a try\'s number key shows that try\'s report', async ($, on) => {
  fakeFiles(on, { '/reports/T-1-try-1.md': 'First try report: the tests failed.\n', '/reports/T-1-try-2.md': `Second try report.\n\n${'A long line of words that must wrap. '.repeat(6)}\nLast line.\n` })
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [reportedTask()], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  let L = await lines(ui)
  expect(L.some(l => /^▍Report \(try 2, 2 of 2\)$/.test(l))).toBe(true)
  expect(L.some(l => /Second try report\./.test(l))).toBe(true)
  expect(L.some(l => /Last line\./.test(l))).toBe(true)
  expect(L.some(l => /First try report/.test(l))).toBe(false)
  // wrapped to the panel width
  for (const l of L.filter(x => /A long line/.test(x))) expect(l.length).toBeLessThanOrEqual(50)
  expect(L.some(l => /1-2 a try's report/.test(l))).toBe(true)
  expect((await ui.find({ key: 'report-try-1' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'report-try-2' }))?.props.label).toBe('● Try 2 (2)')
  await ui.press({ key: 'report-try-1' })
  L = await lines(ui)
  expect(L.some(l => /^▍Report \(try 1, 1 of 2\)$/.test(l))).toBe(true)
  expect(L.some(l => /First try report: the tests failed\./.test(l))).toBe(true)
  expect(L.some(l => /Second try report/.test(l))).toBe(false)
  expect((await ui.find({ key: 'report-try-1' }))?.props.label).toBe('● Try 1 (1)')
  await ui.press({ key: 'report-try-2' })
  expect((await lines(ui)).some(l => /Second try report\./.test(l))).toBe(true)
  await ui.unmount()
})

test('an old task without saved reports still opens and says "no saved report"', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Old one', { attempts: 1, runs: [{ started: '', ended: '' }], history: ['try 1: did it → merged into main'] })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  expect(L.some(l => /^▍Report$/.test(l))).toBe(true)
  expect(L.some(l => /no saved report/.test(l))).toBe(true)
  expect(await ui.find({ key: 'report-try-1' })).toBeUndefined()
  await ui.unmount()
})

test('a research task shows its note as a row in Details', async ($, on) => {
  fakeFiles(on, { '/reports/T-1-try-2.md': 'Wrote it.\n', '/reports/T-1-try-1.md': 'Tried.\n' })
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [reportedTask({ research_notes: ['docs/research/market.md'] })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await lines(ui)).some(l => /^Note:\s+docs\/research\/market\.md \(research note\)$/.test(l))).toBe(true)
  await ui.unmount()
})

test('/symcc-task shows the latest report, or its first 40 lines and where the full one is', async ($, on) => {
  const many = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')
  const board = { version: 1, next_id: 2, mode: 'auto', test_commands: [], target_branch: 'main', tasks: [reportedTask({ research_notes: ['docs/research/market.md'] })] }
  fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null, '/reports/T-1-try-1.md': 'Old.\n', '/reports/T-1-try-2.md': many })
  stateOf(on, {})
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  const text = String((await $.command.run({ command: 'symcc-task', args: 'T-1' })).text)
  expect(text).toContain(`Report (try 2, ${R2}):`)
  expect(text).toContain('  line 40')
  expect(text).not.toContain('line 41\n')
  expect(text).toContain(`… (20 more lines) full report: ${R2}`)
  expect(text).toContain('Note: docs/research/market.md')
})
