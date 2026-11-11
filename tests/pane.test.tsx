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
      value: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' })], working: [], scouts: [{ name: 'tests', every_minutes: 30, last_run: null, running: true }], paused: false, test_commands: ['npm test'] } },
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
      value: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' }), task('T-4', 'todo', 'Docs')], working: [], scouts: [], paused: false, test_commands: [] } },
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

test('an opened task shows its details in full, in clear sections', async ($, on) => {
  const long = 'First line of the plan.\n\nSecond paragraph that is long. '.repeat(20)
  stateOf(on, { opened: 'T-3', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Base work'), task('T-3', 'todo', 'Build on it', { details: long + 'THE END', files: ['src/a.ts', 'test/'], after: ['T-1'], history: ['try 1: old', 'try 2: new'] })], working: [], scouts: [], paused: false, test_commands: [] } } })
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
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Build it')], working: [], scouts: [], paused: false, test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'pause' })).toBeDefined()
  expect(await ui.find({ key: 'resume' })).toBeUndefined()
  await ui.unmount()
})

test('a paused task shows as paused and can be resumed from the board', async ($, on) => {
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { tasks: [task('T-2', 'paused', 'Later')], working: [], scouts: [], paused: false, test_commands: [] } } })
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
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Timed', { runs: RUNS })], working: [], scouts: [], paused: false, test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Time and cost/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 1: 12m · 40k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 2: 1h 00m · ~\$0\.42/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /total: 1h 12m · 40k tokens · ~\$0\.42/ })).toBeDefined()
  await ui.unmount()
})

test('the banner shows the counts and the total time and cost of all tries', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Timed', { runs: RUNS }), task('T-2', 'todo', 'Other')], working: [], scouts: [], paused: false, test_commands: [] } } })
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
        paused: false,
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
        paused: false,
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
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { last_run: new Date().toISOString(), last_report: 'NOTHING' })], paused: false, test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^nothing found$/ })).toBeDefined()
  await ui.unmount()
})

test('with no scouts the Scouts view shows how to add one', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], paused: false, test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-scouts' })
  expect(await ui.find({ type: 'Text', text: /No scouts yet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\.symcc\/scouts\/<name>\.md/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /every_minutes: 30/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /examples\/scouts\// })).toBeDefined()
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})
