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
    expect((await ui.find({ type: 'Text', text: /^─{50}$/ }))).toBeDefined()
    await ui.unmount()
  }
})

test('an empty board says what to do', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /board is empty/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^symcc board$/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^─{50}$/ }))).toBeDefined()
  await ui.unmount()
})

test('a narrow panel shows the banner without the drawing', async $ => {
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 30 }, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^symcc board$/ }))).toBeDefined()
  expect(await ui.find({ type: 'Text', text: new RegExp(esc(ICON_ART[0]!.trim())) })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^─{30}$/ }))).toBeDefined()
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
  const header = await ui.find({ type: 'Text', text: /^▸ Backlog · 2$/ })
  expect(header).toBeDefined()
  expect(header?.props.color).toBe('planMode')
  expect(header?.props.bold).toBe(true)
  // a blank line right above the header sets it apart from the open tasks
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const at = texts.findIndex(t => /^▸ Backlog · 2$/.test(t))
  expect(texts.slice(0, at).reverse().find(t => t !== '')).toBe(' ')
  expect(texts.some(t => /Enter on Backlog opens it/.test(t))).toBe(true)
  // folded by default: the items are hidden
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  expect((await ui.find({ key: 'T-1' }))).toBeDefined()
  // Enter on the header opens it; again folds it
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^▾ Backlog · 2$/ }))).toBeDefined()
  expect((await ui.find({ key: 'T-2' }))).toBeDefined()
  expect((await ui.find({ key: 'T-3' }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /◇/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /2 in backlog/ }))).toBeDefined()
  expect(await ui.find({ key: 'day:backlog-more' })).toBeUndefined()
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^▸ Backlog · 2$/ }))).toBeDefined()
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

test('the Backlog section sits after open tasks and before done ones', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'backlog', 'Dark mode'), task('T-3', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'day:backlog' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k === 'T-1' || k === 'T-2' || k === 'T-3' || k === 'day:backlog')
  expect(keys).toEqual(['T-3', 'day:backlog', 'T-2', 'T-1'])
  await ui.unmount()
})

test('with no open tasks the Backlog section comes first; over 5 items it shows 5 and "… N more"', async ($, on) => {
  const ideas = [2, 3, 4, 5, 6, 7, 8].map(n => task(`T-${n}`, 'backlog', `Idea ${n}`))
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), ...ideas], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  const first = buttons.findIndex(k => k === 'day:backlog' || k === 'T-1' || /^T-\d$/.test(String(k)))
  expect(buttons[first]).toBe('day:backlog')
  expect((await ui.find({ type: 'Text', text: /^▸ Backlog · 7$/ }))).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /Backlog ·/ })).toBeUndefined()
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
  expect(await ui.find({ type: 'Text', text: /THE END/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /src\/a\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Waits for/ })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /Time and cost/ })).toBeDefined()
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

test('finished tasks of older days fold into one row per day, which opens on Enter', async ($, on) => {
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
  expect(await ui.find({ key: 'T-4' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▸ \w{3} \d+ \w{3}(?: \d{4})? · 1 done · 1 dropped$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  await ui.press({ key: oldKey })
  expect(await ui.find({ type: 'Text', text: /^▾ \w{3} \d+ \w{3}(?: \d{4})? · 1 done · 1 dropped$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  expect(await ui.find({ key: 'T-2' })).toBeDefined()
  await ui.press({ key: oldKey })
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
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
    expect(await ui.find({ type: 'Text', text: /Enter opens · t tasks · s scouts · Esc closes/ })).toBeDefined()
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
    const rule = texts.findIndex(t => /^─{50}$/.test(t))
    const hint = texts.findIndex(t => /^Enter opens/.test(t))
    expect(tab).toBeGreaterThan(-1)
    expect(rule).toBeGreaterThan(tab)
    expect(hint).toBeGreaterThan(rule)
  }
  expect(await ui.find({ key: 'scout:bugs' })).toBeDefined()
  await ui.unmount()
})
