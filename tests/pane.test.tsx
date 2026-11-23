import { expect, mock, type Engine, type Mounted as TestMounted } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { ICON, ICON_ART } from '../hooks/name'
import { textWidth } from '../hooks/core/width'
import { SETTING_GROUPS, groupSummary, hintLines, hintLineText, listKeys, scoutKeys, scoutListKeys, settingsKeys, rolesKeys, statusCell, STATUS_MARK, PREP_NOTE, bandLeads, type KeyHint } from '../hooks/board'
import { keysFor } from './task-keys'
import { STEP_NOTE } from '../hooks/board'
const CHECKER_NOTE = STEP_NOTE.checker
import { arrowTarget, focusStops, isArrow, rowStops, saysArrowsMove } from '../hooks/claude/ui/arrows'
import type { SymccStatus } from '../types'
import { sayQueue } from '../hooks/app/state'
import { inProject } from './project'
import { ran, readText, entry, slash, print } from './fakes'
import { hist } from './history-fixture'
import { rowEndBoard, ROW_END, ROW_END_NOW } from './row-end-cases'
import { askShape } from './ask-shape'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it (and redraws). */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  // the project folder (the plugin's paths need it, see findRoot)
  inProject(on)
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seed ? { value: { value: seed[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
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

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '', origin: { by: 'owner', why: 'x', at: '' }, merge_into: 'main', ...askShape(extra) })

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
    const art = await Promise.all(ICON_ART.map(async l => (await ui.findAll({ type: 'Text', text: new RegExp(`^ ${esc(l)}  $`) })).find(t => t.props.color === 'ide')))
    expect(art.every(t => t !== undefined)).toBe(true)
    expect(new Set(art.map(t => t!.text.length)).size).toBe(1)
    expect((await ui.find({ type: 'Text', text: /^tests: npm test$/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /1 doing · 1 waiting for you · 1 done/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^━{50}$/ }))).toBeDefined()
    await ui.unmount()
  }
})

// T-643: the terminal panel of a session that doesn't drive: a warning line under the banner with how to take over
test('T-643: the terminal panel shows the yellow "another session drives" line when not driving, and none when driving', async ($, on) => {
  let driving = false
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks: [task('T-3', 'doing', 'Search command', { note: 'worker on it' })], working: [], scouts: [], mode: 'auto', test_commands: ['npm test'], driving } }, version: 1 } }))
  const warn = async () => {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 140 }, surface: 'terminal' })
    // the line's colored part (the outer Text of the line matches too, with no color of its own)
    const t = (await ui.findAll({ type: 'Text', text: /^⚠ Another session drives/ })).find(x => x.props.color)
    await ui.unmount()
    return t
  }
  const t = await warn()
  expect(t?.text).toBe('⚠ Another session drives. /symcc-drive to drive it from here.')
  expect(t?.props.color).toBe('warning')
  driving = true
  expect(await warn()).toBeUndefined()
})

test('T-773: a freshly opened board shows the Live tab; the tab row is Live, Tasks, Scouts, Settings; t, l, s and c go to their tabs', async ($, on) => {
  inProject(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'live-keys' })).toBeDefined()
  const keys = (await ui.findAll({})).map(n => String(n.key ?? '')).filter(k => /^tab-(live|tasks|scouts|settings)$/.test(k))
  expect(keys).toEqual(['tab-live', 'tab-tasks', 'tab-scouts', 'tab-settings'])
  const hotkeys = (await ui.findAll({})).filter(n => /^tab-key-/.test(String(n.key ?? ''))).map(n => n.props.hotkey)
  expect(hotkeys).toEqual(['l', 't', 's', 'c'])
  await ui.press({ key: 'tab-key-tasks' })
  expect(await ui.find({ key: 'live-keys' })).toBeUndefined()
  await ui.press({ key: 'tab-key-live' })
  expect(await ui.find({ key: 'live-keys' })).toBeDefined()
  await ui.unmount()
})

test('an empty board says what to do', async ($, on) => {
  stateOf(on, { tab: 'tasks' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^All clear\. Nothing running or waiting\.$/ }))?.props.color).toBe('inactive')
  expect((await ui.find({ type: 'Text', text: /^Tell the lead what you want next\.$/ }))?.props.color).toBe('inactive')
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

type BandNode = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
/** A drawn node's text; a Button reads as "[ label ]", as the terminal draws it. */
const bandTextOf = (n: unknown): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  const x = n as BandNode
  if (x.type === 'Button') return `[ ${String(x.props?.label ?? '')} ]`
  return (x.children ?? []).map(bandTextOf).join('')
}
/** The band's lines, top to bottom: a row Box is one line, a Text is one line. */
const bandLinesOf = (n: unknown): string[] => {
  const x = n as BandNode
  if (!x || typeof x !== 'object') return []
  if (x.type === 'Box') return x.props?.flexDirection === 'row' ? [bandTextOf(x)] : (x.children ?? []).flatMap(bandLinesOf)
  return [bandTextOf(x)]
}
const bandLines = async (ui: { drawn(): Promise<unknown> }) => bandLinesOf(await ui.drawn())

// T-776: line 1 is "𝄞 symcc", a short board summary and the button, no task; each running task on its own line under it
test('T-776: the band\'s first line has the brand, the board summary and the button; the work and what needs you are on the lines under it', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser'), task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' }), task('T-3', 'doing', 'Search command', { note: 'worker on it' }), task('T-4', 'todo', 'Docs'), task('T-5', 'todo', 'Later')], working: [], scouts: [scout('bugs')], mode: 'auto', max_parallel: 3, test_commands: [], driving: true } },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const lines = await bandLines(ui)
    // line 1: the brand, the summary (mode, agents busy of the slots, waiting, today's merged) and the button; no task
    expect(lines[0]).toMatch(new RegExp(`^${esc(ICON)} symcc  ⏵ auto merge · 1/3 agents busy · 2 tasks waiting +\\[ open board \\]$`, 'u'))
    expect(textWidth(lines[0]!)).toBe(80)
    expect(lines[0]).not.toMatch(/T-\d/)
    expect(await ui.find({ key: 'open-board' })).toBeDefined()
    // then the running task, next up (only the next task to start) and what needs you, each on its own line, indented 1 space
    expect(lines.slice(1)).toEqual([' ▶ T-3          Search command — worker on it',' ○ T-4  next up Docs', ' ? T-2  waiting Search mode — Case-sensitive?'])
    expect((await ui.find({ type: 'Text', text: /^T-2  waiting $/ }))?.props.color).toBe('warning')
    expect((await ui.find({ type: 'Text', text: /^▶$/ }))?.props.color).toBe('green')
    await ui.unmount()
  }
})

test('T-776: running scouts show on the band\'s first line, and a narrow band drops its summary parts from the end and cuts the titles, never past the width', async ($, on) => {
  const long = 'A rather long task title that cannot fit in a narrow band at all'
  on('state.get', () => ({
    value: {
      value: { shape: 'view-1', value: { tasks: [task('T-3', 'doing', long, { note: 'worker on it' }), task('T-4', 'todo', 'Docs'), task('T-6', 'review', 'Ready one')], working: [], scouts: [scout('bugs', { running: true })], questions: [{ id: 'Q-71', text: 'Raise the version of the plugin before the next release?', options: [], asked_at: new Date().toISOString() }], mode: 'auto', max_parallel: 3, test_commands: [], driving: false } },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const wide = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 140 }, surface: 'terminal' })
  expect((await bandLines(wide))[0]).toMatch(/⏵ auto merge · 1\/3 agents busy · 1 task waiting · 0 completed today · ⌕ 1 scout +\[ open board \]$/)
  await wide.unmount()
  for (const columns of [60, 44]) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: columns }, surface: 'terminal' })
    const lines = await bandLines(ui)
    for (const l of lines) expect([columns, l, textWidth(l) <= columns]).toEqual([columns, l, true])
    // the mode always stays; parts go from the end
    expect(lines[0]).toMatch(/^\S+ symcc {2}⏵ auto merge/u)
    expect(lines[0]).not.toMatch(/scout/)
    expect(lines[0]).toMatch(/\[ open board \]$/)
    // the task row keeps its front and cuts its title
    expect(lines[1]).toMatch(/^ ▶ T-3 +A rather long.*…$/)
    // the needs-you rows come after the work: the question, the review task, then the drive warning
    expect(lines.findIndex(l => /^ ⚠ 1 question for you/.test(l))).toBeGreaterThan(1)
    expect(lines.findIndex(l => /^ ◆ T-6/.test(l))).toBeGreaterThan(lines.findIndex(l => /^ ⚠ 1 question/.test(l)))
    expect(lines.at(-1)).toMatch(/^ ⚠ driven by another session/)
    await ui.unmount()
  }
  const tight = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 56 }, surface: 'terminal' })
  expect((await bandLines(tight))[0]).toMatch(/^\S+ symcc {2}⏵ auto merge · 1\/3 agents busy +\[ open board \]$/u)
  await tight.unmount()
})

test('T-748: the band lists the questions for you and the NEEDS YOU tasks in the warning color, and says when nothing runs', async ($, on) => {
  const questions = [{ id: 'Q-71', text: 'Raise the version?', options: ['Yes', 'No'], asked_at: new Date().toISOString() }]
  let tasks = [task('T-6', 'review', 'Ready one'), task('T-7', 'failed', 'Broke', { note: 'tests failed' }), task('T-1', 'done', 'Parser')]
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [], questions, driving: true } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const q = await ui.find({ type: 'Text', text: /^ ⚠ 1 question for you: Q-71 Raise the version\?$/ })
  expect(q?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^T-6  review $/ }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^T-7  failed $/ }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: /^ ✗ T-7  failed Broke — / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /next up/ })).toBeUndefined()
  await ui.unmount()
  // nothing runs, nothing is next and nothing needs you: line 1, and "nothing running" dim under it
  tasks = [task('T-1', 'done', 'Parser')]
  questions.length = 0
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const lines = await bandLines(idle)
  expect(lines[0]).toMatch(/\[ open board \]$/)
  expect(lines.slice(1)).toEqual([' nothing running'])
  expect((await idle.find({ type: 'Text', text: /^ nothing running$/ }))?.props.color).toBe('inactive')
  await idle.unmount()
})

// T-643: a session that doesn't drive: a yellow warning row in the band, and a claimed doing task's row says it runs
// in the other session (not "starting at the next turn", which never comes here); "it looks idle" after 5 minutes.
test('T-643: the band of a session that does not drive has a yellow "driven by another session" mark and "runs in the other session" rows', async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const view = (driving: boolean, ago: number) => ({ tasks: [task('T-3', 'doing', 'Search command', { note: 'starting at the next turn', updated_at: iso(T0 - ago) }), task('T-4', 'todo', 'Docs')], working: [], scouts: [], mode: 'auto', test_commands: [], driving })
  let v = view(false, 60_000)
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: v }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const band = async (columns = 80) => {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: columns }, surface: 'terminal' })
    const all = await ui.findAll({ type: 'Text' })
    await ui.unmount()
    return all
  }
  const mark = (all: Awaited<ReturnType<typeof band>>) => all.find(t => /^ ⚠ driven by another session/.test(String(t.text)))
  let all = await band()
  expect(mark(all)?.text).toBe(' ⚠ driven by another session')
  expect(mark(all)?.props.color).toBe('warning')
  expect(all.some(t => t.text === ' — runs in the other session')).toBe(true)
  expect(all.some(t => /starting at the next turn/.test(String(t.text)))).toBe(false)
  // still there when the band is narrow: it has its own row
  expect(mark(await band(50))).toBeDefined()
  // claimed 6 minutes ago and still not started there: it looks idle
  v = view(false, 6 * 60_000)
  expect(mark(await band())?.text).toBe(' ⚠ driven by another session (it looks idle)')
  // the driving session: no mark, and the row keeps its own note
  v = view(true, 60_000)
  all = await band()
  expect(mark(all)).toBeUndefined()
  expect(all.some(t => t.text === ' — starting at the next turn')).toBe(true)
})

test("T-748: a running row shows its stage's icon (no stage name, T-893), the time in that stage and the try from try 2 on, lined up", async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  const clock = mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const fresh = iso(T0 - 10_000)
  const tasks = [
    task('T-40', 'doing', 'Running worker', { note: 'worker on it', attempts: 1, runs: [{ started: iso(T0 - 12 * 60_000) }] }),
    task('T-41', 'doing', 'Being tested', { attempts: 1, runs: [{ started: iso(T0 - 20 * 60_000), ended: fresh }], live: { checking: { step: 'testing', at: fresh } }, }),
    task('T-42', 'doing', 'Being checked', { attempts: 2, runs: [{ started: iso(T0 - 20 * 60_000), ended: iso(T0 - 8 * 60_000) }], live: { checking: { step: 'checker', at: fresh } }, }),
    task('T-43', 'doing', 'Being merged', { attempts: 1, runs: [{ started: iso(T0 - 20 * 60_000), ended: fresh }], live: { checking: { step: 'merging', at: fresh } }, }),
    task('T-44', 'doing', 'Third try', { note: 'worker on it', attempts: 3, runs: [{ started: iso(T0 - 5 * 60_000) }] }),
  ]
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [], driving: true } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 140 }, surface: 'terminal' })
  // "⌕" + "checker 8m · try 2": the checker started when the try handed back, 8 minutes ago
  // one line each, the one that started first at the top
  const rows = [['⊛', 'T-41', '10s', 'Being tested'], ['⌕', 'T-42', '8m (try 2)', `Being checked — ${STEP_NOTE.checker}`], ['⇢', 'T-43', '10s', 'Being merged'], ['▶', 'T-40', '12m', 'Running worker'], ['▶', 'T-44', '5m (try 3)', 'Third try']]
  const width = '8m (try 2)'.length
  const want = rows.map(([icon, id, state, title]) => ` ${icon} ${id} ${state!.padEnd(width)} ${title}`)
  expect((await bandLines(ui)).slice(1)).toEqual(want)
  // no "doing" word and no "— worker on it" tail: the state says it
  expect(await ui.find({ type: 'Text', text: /doing/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /worker on it/ })).toBeUndefined()
  await ui.unmount()
  // narrow: the time goes first, then the try, so the titles keep their room
  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 38 }, surface: 'terminal' })
  const n = await bandLines(narrow)
  expect(n.some(l => l.startsWith(' ⌕ T-42 (try 2) Being checked')), 'narrow 42').toBe(true)
  expect(n, 'narrow 40').toContain(' ▶ T-40' + ' '.repeat(9) + 'Running worker')
  expect(n.some(l => /12m/.test(l))).toBe(false)
  await narrow.unmount()
  const tight = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 26 }, surface: 'terminal' })
  const t = await bandLines(tight)
  expect(t.some(l => l.startsWith(' ⌕ T-42 ') && !l.includes('try 2')), 'tight').toBe(true)
  expect(t.some(l => /\(try/.test(l))).toBe(false)
  await tight.unmount()
  // the time follows the host clock
  await clock.set(T0 + 3 * 60_000)
  const later = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 140 }, surface: 'terminal' })
  expect(await later.find({ type: 'Text', text: /^T-40 15m +$/ }), 'later').toBeDefined()
  await later.unmount()
})

test("T-542: the band shows symcc's own pre-merge step as its icon with its plain note, and a running checker as its icon", async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const fresh = iso(T0 - 10_000)
  const tasks = [
    task('T-50', 'doing', 'Prep one', { note: PREP_NOTE, attempts: 1, runs: [{ started: iso(T0 - 20 * 60_000), ended: fresh }], live: { checking: { step: 'prep', at: fresh } }, }),
    task('T-51', 'doing', 'Checked one', { note: CHECKER_NOTE, attempts: 1, runs: [{ started: iso(T0 - 20 * 60_000), ended: fresh }], live: { checking: { step: 'checker', at: fresh } }, }),
  ]
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 160 }, surface: 'terminal' })
  // the step's icon, no stage name (T-893); the note still says the step
  expect(await ui.find({ type: 'Text', text: new RegExp(`^ ✎ T-50 10s +Prep one — ${esc(PREP_NOTE)}`, 'u') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: new RegExp(`^ ⌕ T-51 10s +Checked one — ${esc(CHECKER_NOTE)}`, 'u') })).toBeDefined()
  await ui.unmount()
})

test('T-648: a task in the queue shows ⧗ and one in the test step ⊛, on the terminal list and the band', async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const fresh = iso(T0 - 10_000)
  const ran = [{ started: iso(T0 - 20 * 60_000), ended: fresh }]
  const tasks = [
    task('T-71', 'doing', 'Queued one', { note: 'queue (2)', attempts: 1, runs: ran, live: { checking: { step: 'queue', place: 2, at: fresh } }, }),
    task('T-72', 'doing', 'Tested one', { note: 'running the tests', attempts: 1, runs: ran, live: { checking: { step: 'testing', at: fresh } }, }),
  ]
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  // the list's row is keyed by its id, with the total work time; the band's is one Text line, with the stage's time (no stage name, T-893); one space before the title
  const want = { pane: [/^T-71 ⧗ 20m Queued one/, /^T-72 ⊛ 20m Tested one/], band: [/^ ⧗ T-71 10s Queued one/, /^ ⊛ T-72 10s Tested one/] }
  for (const [name, where] of [['pane', { ...PANE, props: { ...PANE.props, bodyColumns: 160 } }], ['band', { ...BAND, props: { ...BAND.props, bodyColumns: 160 } }]] as const) {
    const ui = await $.ui.mount({ ...where, surface: 'terminal' } as never) as TestMounted<"terminal", "AbovePrompt">
    const line = async (id: string) => (await ui.find({ key: id }))?.text ?? (await ui.find({ type: 'Text', text: new RegExp(`^ . ${id} `, 'u') }))?.text
    expect(await line('T-71')).toMatch(want[name][0]!)
    expect(await line('T-72')).toMatch(want[name][1]!)
    expect(await ui.find({ type: 'Text', text: /⋯/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('T-787: a running band row has its id in the accent color, its stage part in green and its title in the normal color', async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const tasks = [task('T-73', 'doing', 'Run title', { note: 'worker on it', attempts: 4, runs: [{ started: new Date(T0 - 7 * 60_000).toISOString() }] })]
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [], driving: true } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 140 }, surface: 'terminal' })
  const colorOf = async (text: RegExp) => (await ui.find({ type: 'Text', text }))?.props?.color
  expect(await colorOf(/^T-73$/)).toBe('claude')
  expect(await colorOf(/^7m \(try 4\)$/)).toBe('green')
  expect(await colorOf(/^Run title$/)).toBeUndefined()
  await ui.unmount()
})

test("every band row lines up in one title column: running rows, then the rows that need you (T-461)", async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const tasks = [
    task('T-62', 'doing', 'Run one', { note: 'worker on it', attempts: 1, runs: [{ started: iso(T0 - 12 * 60_000) }] }),
    task('T-63', 'doing', 'Run two', { note: 'worker on it', attempts: 2, runs: [{ started: iso(T0 - 3 * 60_000) }] }),
    task('T-60', 'waiting', 'Wait one', { question: 'Q?' }),
    task('T-61', 'review', 'Rev one', { note: 'ready for review' }),
    task('T-59', 'failed', 'Fail one', { note: 'tests failed' }),
  ]
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [], driving: true } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 140 }, surface: 'terminal' })
  const leads = [['T-62', '12m'], ['T-63', '3m (try 2)'], ['T-60', 'waiting'], ['T-61', 'review'], ['T-59', 'failed']].map(([id, state]) => `${id} ${state!.padEnd(10)} `)
  for (const lead of leads) expect(await ui.find({ type: 'Text', text: new RegExp(`^${esc(lead)}$`, 'u') }), lead).toBeDefined()
  // so every title starts in the same column, right after a lead of one width
  expect(new Set(leads.map(l => l.length)).size).toBe(1)
  const titles = ['Run one', 'Run two', 'Wait one', 'Rev one', 'Fail one']
  for (const [i, title] of titles.entries()) expect(await ui.find({ type: 'Text', text: new RegExp(`^ . ${esc(leads[i]!)}${esc(title)}`, 'u') })).toBeDefined()
  // the waiting row keeps its question as its tail
  expect(await ui.find({ type: 'Text', text: /Wait one — Q\?/ })).toBeDefined()
  await ui.unmount()
})

test("the band hides only the notes a doing row's state says; other notes stay as the row's tail (T-455)", async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const fresh = iso(T0 - 10_000)
  const tasks = [
    task('T-50', 'doing', 'Wrap up', { note: 'time is up: the worker was told to hand back', attempts: 1, runs: [{ started: iso(T0 - 62 * 60_000) }] }),
    task('T-51', 'doing', 'Being checked', { note: 'running the tests', attempts: 1, runs: [{ started: iso(T0 - 20 * 60_000), ended: fresh }], live: { checking: { step: 'testing', at: fresh } }, }),
    task('T-52', 'doing', 'Queued', { note: 'starting at the next turn', attempts: 1, runs: [{ started: iso(T0 - 60_000) }] }),
    // T-470's claim note on a host with no start queue (OpenCode): the time says it, so no stray note (T-466)
    task('T-53', 'doing', 'Starting', { note: 'worker starting', attempts: 1, runs: [{ started: iso(T0 - 60_000) }] }),
  ]
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 140 }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^ — time is up: the worker was told to hand back$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^T-50 1h2m *$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /running the tests/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /starting at the next turn/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /worker starting/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^T-53 1m/ })).toBeDefined()
  await ui.unmount()
})

test('with an empty board the band shows nothing of its own', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /symcc board/ })).toBeUndefined()
  await ui.unmount()
})

test('the board panel is interactive: open a task, see its details, go back', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'failed', 'Explore the market', { details: 'Research what is new.', note: 'the worker was stopped', history: hist('try 1: stopped') }), task('T-2', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
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
  const header = await ui.find({ type: 'Text', text: /^▸ Backlog  2$/ })
  expect(header).toBeDefined()
  expect(header?.props.color).toBe('text')
  // the open tasks come first, then a blank line, then the Backlog row; no dotted rule, no brackets
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const at = texts.findIndex(t => /^▸ Backlog  2$/.test(t))
  expect(texts.findIndex(t => /Write it up/.test(t))).toBeLessThan(at)
  expect(texts[at - 1]).toBe(' ')
  expect(texts.some(t => /┄/.test(t))).toBe(false)
  expect(texts.some(t => /^Enter open · ↑↓ move · l t s c views$/.test(t))).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^━+$/ }))?.props.color).toBe('ide')
  // folded by default: the items are hidden
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  expect((await ui.find({ key: 'T-1' }))).toBeDefined()
  // Enter on the header opens it; again folds it
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^▾ Backlog  2$/ }))).toBeDefined()
  expect((await ui.find({ key: 'T-2' }))).toBeDefined()
  expect((await ui.find({ key: 'T-3' }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /◇/ }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /2 in backlog/ }))).toBeDefined()
  expect(await ui.find({ key: 'day:backlog-more' })).toBeUndefined()
  await ui.press({ key: 'day:backlog' })
  expect((await ui.find({ type: 'Text', text: /^▸ Backlog  2$/ }))).toBeDefined()
  expect(await ui.find({ key: 'T-2' })).toBeUndefined()
  await ui.press({ key: 'day:backlog' })
  await ui.press({ key: 'T-2' })
  expect((await ui.find({ type: 'Text', text: /Maybe later: a dark theme/ }))).toBeDefined()
  const toTodo = await ui.find({ key: 'to-todo' })
  // T-751: words only on the button; its key is on a hidden Button and in the footer
  expect(toTodo?.props.label).toBe('Move to todo')
  expect((await ui.find({ key: 'to-todo-key' }))?.props.hotkey).toBe('o')
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
  // the row's id is its own Text at the first column (no indent)
  const heads = [/^NEEDS YOU$/, /^T-4 $/, /^▸ Backlog  1$/, /^▸ Done     1/, /^▸ Dropped  1$/].map(idx)
  expect(heads.every(i => i > -1)).toBe(true)
  expect([...heads].sort((a, b) => a - b)).toEqual(heads)
  // no DOING or TO DO titles: the doing row follows one blank line, the to-do rows follow it with no gap
  expect(texts.some(t => /^DOING$|^TO DO$/.test(t))).toBe(false)
  expect(texts.slice(heads[1]! - 1, heads[1]! + 1)).toEqual([' ', 'T-4 '])
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
  expect(texts.some(t => /^Enter open · ↑↓ move · l t s c views$/.test(t))).toBe(true)
  expect(texts.some(t => /a\/x|a approve|x reject/.test(t))).toBe(false)
  // folded by default: no done, dropped or backlog tasks shown
  for (const k of ['T-1', 'T-2', 'T-7']) expect(await ui.find({ key: k })).toBeUndefined()
  await ui.press({ key: 'day:done' })
  expect(await ui.find({ type: 'Text', text: /^▾ Done     1$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  expect(await ui.find({ key: 'T-7' })).toBeUndefined()
  await ui.press({ key: 'day:dropped' })
  expect(await ui.find({ type: 'Text', text: /^▾ Dropped  1$/ })).toBeDefined()
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
    expect((await ui.find({ key: 'day:done' }))?.text).toBe('▸ Done     3')
    expect(await ui.find({ type: 'Text', text: /last today/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('with nothing to do, need or run, two dimmer (inactive) "All clear" lines sit above the folded groups', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Parser', { updated_at: new Date().toISOString() }), task('T-2', 'backlog', 'Dark mode')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const line = texts.findIndex(t => t === 'All clear. Nothing running or waiting.')
  expect(line).toBeGreaterThan(-1)
  expect((await ui.find({ type: 'Text', text: /All clear/ }))?.props.color).toBe('inactive')
  expect(texts[line + 1]).toBe('Tell the lead what you want next.')
  expect(texts[line + 2]).toBe(' ')
  expect(line).toBeLessThan(texts.findIndex(t => /^▸ Backlog  1$/.test(t)))
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
  expect((await ui.find({ type: 'Text', text: /^▸ Backlog  7$/ }))).toBeDefined()
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

test("a task waiting only for the owner's files shows them and a Merge now button, with no answer box and no \"needs you\" sound", async ($, on) => {
  sayQueue.splice(0)
  const t = task('T-2', 'waiting', 'Search mode', { live: { merge_wait: { dirty: ['src/a.ts', 'README.md'], untracked: [], ignored: [] } }, note: 'waiting for your files on main: src/a.ts, README.md; commit or stash them' })
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { tasks: [t], working: [], scouts: [], mode: 'auto', notify: 'voice', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^waiting for your files on main: src\/a\.ts, README\.md; commit or stash them, it merges on its own$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /asks:/ })).toBeUndefined()
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  expect(await ui.find({ key: 'choice-1' })).toBeUndefined()
  expect((await ui.find({ key: 'merge-now-key' }))?.props.hotkey).toBe('r')
  expect((await ui.find({ key: 'back' }))?.props.autoFocus).toBe(true)
  expect(await ui.find({ type: 'Text', text: /r merge now/ })).toBeDefined()
  expect(sayQueue).toEqual([])
  await ui.unmount()
})

test("a task waiting for the owner's git-ignored file says move or rename it on its page, not commit or stash", async ($, on) => {
  const t = task('T-2', 'waiting', 'Search mode', { live: { merge_wait: { dirty: [], untracked: [], ignored: ['.env'] } }, note: 'waiting for your files on main: .env; move or rename them' })
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { tasks: [t], working: [], scouts: [], mode: 'auto', notify: 'voice', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^waiting for your files on main: \.env; move or rename them, it merges on its own$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /commit or stash/ })).toBeUndefined()
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  await ui.unmount()
})

test('a file request (NEED FILES) shows Allow, Don\'t allow and Answer… on keys 1-3; Allow widens the files and sends it back', async ($, on) => {
  const board = { tasks: [task('T-2', 'waiting', 'Search mode', { files: ['src/'], question: 'T-2 needs to change files outside its list: README.md. Allow them?', asked_files: ['README.md'] })] }
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const [n, label] of [[1, 'Allow'], [2, "Don't allow"], [3, 'Answer…']] as const) {
    const b = await ui.find({ key: `choice-${n}` })
    expect(b?.props.label).toBe(label)
    expect(b?.text).toBe(`${n}. ${label}`)
    expect((await ui.find({ key: `choice-key-${n}` }))?.props.hotkey).toBe(String(n))
  }
  // the keys are told once, in the dim line under the buttons, not again in the bottom key list (T-513)
  expect(await ui.find({ type: 'Text', text: 'keys 1-3 pick a choice' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^[\d-]+ allow/ })).toBeUndefined()
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  await ui.press({ key: 'choice-3' })
  expect(await ui.find({ key: 'answer' })).toBeDefined()
  await ui.press({ key: 'choice-1' })
  const saved = Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, text]) => JSON.parse(text))
  expect(saved.length).toBe(1)
  expect(saved[0].tasks[0]).toMatchObject({ status: 'todo', files: ['src/', 'README.md'] })
  expect(saved[0].tasks[0].history.at(-1)?.text).toBe('the owner allowed files: + README.md')
  await ui.unmount()
})

test('a question with options shows one button per option plus Answer…; picking one is the answer', async ($, on) => {
  const board = { tasks: [task('T-2', 'waiting', 'Search mode', { question: 'Which colour?', options: ['red', 'blue'] })] }
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'choice-1' }))?.props.label).toBe('red')
  expect((await ui.find({ key: 'choice-2' }))?.props.label).toBe('blue')
  expect((await ui.find({ key: 'choice-3' }))?.props.label).toBe('Answer…')
  expect(await ui.find({ type: 'Text', text: 'keys 1-3 pick a choice' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: / pick$/ })).toBeUndefined()
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  await ui.press({ key: 'choice-2' })
  const saved = Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, text]) => JSON.parse(text))
  expect(saved.length).toBe(1)
  expect(saved[0].tasks[0].status).toBe('todo')
  expect(saved[0].tasks[0].history.at(-1)?.text).toBe('the owner answered: “blue”')
  expect(saved[0].tasks[0]).not.toHaveProperty('options')
  await ui.unmount()
})

test('the answer keys are told once on the task page: the dim line under the buttons, not the bottom key list (terminal, desktop, mobile)', async ($, on) => {
  const options = ['Keep as is', 'Once a day', 'Every 2 days', 'Only on demand']
  const board = { tasks: [task('T-2', 'waiting', 'Checks', { question: 'How often?', options })] }
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.match(/pick/g)?.length, surface).toBe(1)
    expect(tree, surface).toContain('keys 1-5 pick a choice')
    expect(tree, surface).not.toContain('" answer"')
    await ui.unmount()
  }
})

test('the answer buttons show only the choice (no number key inside); keys 1-5 still pick, told in a dim line under them', async ($, on) => {
  const options = ['Keep as is', 'Once a day', 'Every 2 days', 'Only on demand']
  const board = { tasks: [task('T-2', 'waiting', 'Checks', { question: 'How often?', options })] }
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const [i, label] of [...options, 'Answer…'].entries()) {
    const b = await ui.find({ key: `choice-${i + 1}` })
    expect(b?.props.label).toBe(label)
    expect(b?.props.hotkey).toBe(undefined)
    expect((await ui.find({ key: `choice-key-${i + 1}` }))?.props.hotkey).toBe(String(i + 1))
  }
  expect(await ui.find({ type: 'Text', text: 'keys 1-5 pick a choice' })).toBeDefined()
  await ui.press({ key: 'choice-2' })
  const saved = Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, text]) => JSON.parse(text))
  expect(saved[0].tasks[0].history.at(-1)?.text).toBe('the owner answered: “Once a day”')
  await ui.unmount()
})

test('T-651: the choices are numbered lines like the question pop-up; a long one wraps inside the box, and a click on any of its lines or its number key answers', async ($, on) => {
  const options = ["Invalid: doctor and run reject it (scout's suggestion)", 'Unlimited: run until another cap stops it']
  const board = { tasks: [task('T-2', 'waiting', 'Caps', { question: 'What should a cap of 0 mean?', options })] }
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 44 }, surface: 'terminal' })
  // each choice in its own Box, one line under the other (a column), numbered, wrapped to the 40 columns inside the box
  const rows = await ui.find({ key: 'answer-choices' })
  expect(rows?.props.flexDirection).toBe('column')
  const shown = async (key: string) => !!(await ui.find({ key }))
  expect([await shown('choice-row-1'), await shown('choice-row-2'), await shown('choice-row-3'), await shown('choice-row-4')]).toEqual([true, true, true, false])
  expect([await shown('choice-1-line-2'), await shown('choice-1-line-3'), await shown('choice-2-line-2'), await shown('choice-3-line-2')]).toEqual([true, false, true, false])
  const text = async (key: string) => (await ui.find({ key }))?.text
  expect(await text('choice-1')).toBe('1. Invalid: doctor and run reject it')
  expect(await text('choice-1-line-2')).toBe("   (scout's suggestion)")
  expect(await text('choice-2')).toBe('2. Unlimited: run until another cap')
  expect(await text('choice-2-line-2')).toBe('   stops it')
  expect(await text('choice-3')).toBe('3. Answer…')
  for (const key of ['choice-1', 'choice-1-line-2', 'choice-2', 'choice-2-line-2', 'choice-3']) expect((await text(key))!.length <= 40, key).toBe(true)
  // no "[ … ]" around them: plain lines, and the number keys on hidden Buttons
  expect((await ui.find({ key: 'choice-1-line-2' }))?.props.plain).toBe(true)
  expect((await ui.find({ key: 'choice-key-1' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'choice-key-2' }))?.props.hotkey).toBe('2')
  const answered = () => Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, t]) => JSON.parse(t).tasks[0].history.at(-1)?.text)
  // a click on the second line of choice 1 answers with choice 1
  await ui.press({ key: 'choice-1-line-2' })
  expect(answered()).toEqual([`the owner answered: “${options[0]}”`])
  await ui.unmount()
})

test('T-651: on a task page the number key answers too (its hidden Button sends the same answer)', async ($, on) => {
  const options = ["Invalid: doctor and run reject it (scout's suggestion)", 'Unlimited: run until another cap stops it']
  const board = { tasks: [task('T-2', 'waiting', 'Caps', { question: 'What should a cap of 0 mean?', options })] }
  stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'choice-key-2' })
  const saved = Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, t]) => JSON.parse(t))
  expect(saved[0].tasks[0].history.at(-1)?.text).toBe(`the owner answered: “${options[1]}”`)
  await ui.unmount()
})

test('an opened task shows its details in full, in clear sections', async ($, on) => {
  const long = 'First line of the plan.\n\nSecond paragraph that is long. '.repeat(20)
  stateOf(on, { opened: 'T-3', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Base work'), task('T-3', 'todo', 'Build on it', { details: long + 'THE END', files: ['src/a.ts', 'test/'], after: ['T-1'], history: hist('try 1: old', 'try 2: new') })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
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
  { started: '2026-11-09T10:00:00.000Z', ended: '2026-11-09T10:12:00.000Z', agents: [{ kind: 'worker' as const, started: '2026-11-09T10:00:00.000Z', ended: '2026-11-09T10:12:00.000Z', tokens: { input: 40_000 } }] },
  { started: '2026-11-09T11:00:00.000Z', ended: '2026-11-09T12:00:00.000Z', agents: [{ kind: 'worker' as const, started: '2026-11-09T11:00:00.000Z', ended: '2026-11-09T12:00:00.000Z', cost: 0.42 }] },
]

test('an opened task shows the time of each try and the total', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Timed', { runs: RUNS })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // T-774: the ▍Runs heading sums this task's own tries
  expect(await ui.find({ type: 'Text', text: /Runs\s+2 tries · 1h 12m · 40k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 1: 12m · 40k tokens in all/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 2: 1h 00m · ~\$0\.42/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /total: 1h 12m · 40k tokens in all · ~\$0\.42/ })).toBeDefined()
  // no Σ note any more: the rows show only the total (T-557)
  expect(await ui.find({ type: 'Text', text: /Σ/ })).toBeUndefined()
  await ui.unmount()
})

test('the banner shows the counts but no all-time total of the tries (T-630: /symcc-stats has it)', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Timed', { runs: RUNS }), task('T-2', 'todo', 'Other')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 50 }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^1 to do · 1 done$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tokens|total:|1h 12m/ })).toBeUndefined()
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
  // no base indent (T-556): Done at column 0, the rows inside it 2 in, a day's tasks 4 in
  expect((await ui.find({ key: 'day:done' }))!.text).toMatch(/^▾ Done/)
  expect((await ui.find({ key: 'T-4' }))!.text).toMatch(/^ {2}T-4 /)
  expect(await ui.find({ type: 'Text', text: /^ {2}▸ \w{3} \d+ \w{3}(?: \d{4})? · 1 done$/ })).toBeDefined()
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  await ui.press({ key: oldKey })
  expect(await ui.find({ type: 'Text', text: /^ {2}▾ \w{3} \d+ \w{3}(?: \d{4})? · 1 done$/ })).toBeDefined()
  expect((await ui.find({ key: 'T-1' }))!.text).toMatch(/^ {4}T-1 /)
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
    // the tab row: both tabs, Tasks active; each a plain Button with no hotkey (so no "t: " and no "[ ]" frame is drawn)
    const tasksTab = await ui.find({ key: 'tab-tasks' })
    const scoutsTab = await ui.find({ key: 'tab-scouts' })
    expect(tasksTab?.props.plain).toBe(true)
    expect(scoutsTab?.props.plain).toBe(true)
    expect(tasksTab?.props.hotkey).toBeUndefined()
    expect(scoutsTab?.props.hotkey).toBeUndefined()
    // the letter keys sit on hidden Buttons in a Box drawn display="none"
    expect((await ui.find({ key: 'tab-keys' }))?.props.display).toBe('none')
    expect((await ui.find({ key: 'tab-key-tasks' }))?.props.hotkey).toBe('t')
    expect((await ui.find({ key: 'tab-key-scouts' }))?.props.hotkey).toBe('s')
    // each tab's one Text reads "[t] Tasks (1)" (at 50 columns the four tabs drop the ":", see tabRow), so the underline covers the key too
    expect(await ui.find({ type: 'Text', text: /^\[t\] Tasks \(1\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\[s\] Scouts \(2\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Enter open · ↑↓ move · l t s c views$/ })).toBeDefined()
    expect(await ui.find({ key: 'T-1' })).toBeDefined()
    // the Tasks view no longer lists the scouts at the bottom (they have their own view)
    expect(await ui.find({ type: 'Text', text: /^scouts: / })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\/symcc-scout / })).toBeUndefined()
    // "s" (its hidden Button) switches to the Scouts tab, and so does a click on the tab
    await ui.press({ key: 'tab-key-scouts' })
    expect(await ui.find({ key: 'T-1' })).toBeUndefined()
    await ui.press({ key: 'tab-key-tasks' })
    expect(await ui.find({ key: 'T-1' })).toBeDefined()
    await ui.press({ key: 'tab-scouts' })
    expect(await ui.find({ key: 'T-1' })).toBeUndefined()
    const active = (await ui.findAll({ type: 'Text', text: /^\[s\] Scouts \(2\)$/ })).find(x => x.props.bold)
    expect(active?.props.color).toBe('ide')
    // the active tab is underlined too; the others are not
    expect(active?.props.underline).toBe(true)
    for (const other of [/^\[t\] Tasks \(1\)$/, /^\[c\]: Settings$/]) expect((await ui.find({ type: 'Text', text: other }))?.props.underline).toBeFalsy()
    // one row per scout, running first
    const rows = await ui.findAll({ type: 'Button' })
    const keys = rows.map(r => r.props.key).filter(k => String(k).startsWith('scout:'))
    expect(keys).toEqual(['scout:tests', 'scout:bugs'])
    expect(await ui.find({ type: 'Text', text: /every 30 min/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /next in 12m/ })).toBeDefined()
    // 50 columns: the model and "last:" columns don't fit, so they are left out
    expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /last:/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Enter open · ↑↓ move · l t s c views · b back$/ })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /^▍Instructions$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Last report/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^▍Runs$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▍File$/ })).toBeDefined()
    expect(await ui.find({ key: 'scout-back' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\.symcc\/scouts\/bugs\.md/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Look for crashes/ })).toBeDefined()
    // T-516: the last report shows only on a run's page, not here
    expect(await ui.find({ type: 'Text', text: /crash in parser/ })).toBeUndefined()
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

test('a scout\'s page shows its summary as the subheader', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { summary: 'Crash hunter', prompt: 'Look for crashes.\nAnd leaks.' }), scout('docs', { prompt: 'Read the docs.\nFix typos.' })], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const sub = await ui.find({ type: 'Text', text: /^Crash hunter$/ })
  expect(sub?.props.color).toBe('text')
  // Instructions is always the whole text
  expect(await ui.find({ type: 'Text', text: /Look for crashes/ })).toBeDefined()
  const heads = (await ui.findAll({ type: 'Text', text: /^▍/ })).map(x => x.text)
  expect(heads).toEqual(['▍Instructions', '▍Runs', '▍Results', '▍File'])
  await ui.press({ key: 'scout-edit' })
  expect((await ui.find({ key: 'scout-summary' }))?.props.value).toBe('Crash hunter')
  await ui.unmount()
})

test('with no summary, a scout\'s page has no subheader: the first line of its instructions shows only under Instructions (T-686)', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'docs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('docs', { prompt: 'Read the docs.\nFix typos.' })], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text', text: /^Read the docs\.$/ })).find(x => x.props.color === 'inactive')).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Read the docs/ })).toBeDefined()
  await ui.unmount()
})

test('a scout with no runs kept says so under Runs, and shows no report text', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { last_run: new Date().toISOString(), last_report: 'NOTHING' })], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^  \(no runs yet\)$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /nothing found|NOTHING/ })).toBeUndefined()
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
  expect(await ui.find({ type: 'Text', text: /^in minutes · 0 = only on demand$/ })).toBeDefined()
  // the same section names, in the same order, as the scout's page
  const heads = (await ui.findAll({ type: 'Text', text: /^▍/ })).map(x => x.text)
  expect(heads).toEqual(['▍Runs every', '▍Model', '▍Findings', '▍Summary', '▍Instructions'])
  // no summary in the file: its box is empty and says the scouts list uses the first line of the instructions
  const summary = await ui.find({ key: 'scout-summary' })
  expect(summary?.props.value).toBe('')
  expect(summary?.props.placeholder).toBe('empty: the scouts list shows the first line of the instructions')
  // the panel can't rename: it says how
  expect(await ui.find({ type: 'Text', text: /to rename the scout, rename \.symcc\/scouts\/bugs\.md/ })).toBeDefined()
  // a bad every_minutes is refused with a short error
  await ui.input({ key: 'scout-every', text: '-5' })
  await ui.press({ key: 'scout-save' })
  expect(await ui.find({ type: 'Text', text: /^Runs every must be a whole number of minutes: 0 for only on demand, or 1 or more$/ })).toBeDefined()
  expect(await ui.find({ key: 'scout-save' })).toBeDefined()
  await ui.press({ key: 'scout-cancel' })
  expect(await ui.find({ key: 'scout-save' })).toBeUndefined()
  expect(await ui.find({ key: 'scout-edit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Instructions/ })).toBeDefined()
  await ui.unmount()
})

test('T-862: a scout\'s own findings choice shows in the list and on its page, and the edit box saves it in the file', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { findings: 'backlog', prompt: 'Look.' }), scout('docs', { prompt: 'Docs.' })], mode: 'auto', test_commands: [] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /findings → backlog/ })).toBeDefined()
  await ui.press({ key: 'scout-edit' })
  expect((await ui.find({ key: 'scout-findings' }))?.props.value).toBe('backlog')
  await ui.input({ key: 'scout-findings', text: 'sometimes' })
  await ui.press({ key: 'scout-save' })
  expect(await ui.find({ type: 'Text', text: /^Findings must be auto, backlog or default/ })).toBeDefined()
  await ui.unmount()
})

test('T-862: the Scouts list marks a scout with its own findings choice, and only that one', async ($, on) => {
  stateOf(on, { tab: 'scouts', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { findings: 'backlog', prompt: 'Look.' }), scout('docs', { prompt: 'Docs.' })], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 100 } })
  expect((await ui.find({ key: 'scout:bugs' }))?.text).toContain('→ backlog')
  expect((await ui.find({ key: 'scout:docs' }))?.text).not.toContain('→')
  await ui.unmount()
})

test('"New scout" asks for a name, refuses a bad or taken one, then opens the edit mode', async ($, on) => {
  stateOf(on, { tab: 'scouts', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs')], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'scout-new' })
  // the terminal draws "label: text", so the label itself has no separator: one colon on screen
  const box = await ui.find({ key: 'scout-new-name' })
  expect(`${box?.props.label}: docs`).toBe("New scout's name: docs")
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
  expect((await ui.find({ type: 'Text', text: /^\s*Enter to review$/ }))?.props.color).toBe('inactive')
  // a and x only work on the task's own page, so the list never offers them
  expect(await ui.find({ type: 'Text', text: /a approve|x reject|a\/x/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^⏸ approve merge $/ })).toBeDefined()
  expect((await ui.find({ key: 'mode' }))!.props.label).toBe('[m] auto merge')
  const rows = (await ui.findAll({ type: 'Text', text: /^T-\d+\s*$/ })).map(x => x.text.trim())
  expect(rows[0]).toBe('T-5')
  await ui.unmount()
})

const MODE_CASES = [
  ['auto', /^⏵ auto merge $/, '[m] approve merge'],
  ['paused', /^⏸ paused $/, '[m] approve merge'],
  ['later', /^⏵ auto merge $/, '[m] approve merge'],
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
  expect((await ui.find({ key: 'needs-review' }))!.props.label).toBe('☑ Needs review')
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
    const hint = texts.findIndex(t => (view === 'tasks' ? /^Enter open · ↑↓ move/ : /^Enter open · ↑↓ move · l t s c views · b back$/).test(t))
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
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Build it')], working: [], scouts: [], mode: 'review', test_commands: ['npm test'], branch: 'main', max_parallel: 5, max_minutes: 45, auto_retries: 2, open_on_start: true, notify: 'off', notify_choices: ['sound 1', 'sound 2', 'sound 3', 'off'] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const settingsTab = await ui.find({ key: 'tab-settings' })
  expect(settingsTab?.props.hotkey).toBeUndefined()
  expect((await ui.find({ key: 'tab-key-settings' }))?.props.hotkey).toBe('c')
  expect(await ui.find({ type: 'Text', text: /^\[c\] Settings$/ })).toBeDefined()
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ key: 'T-1' })).toBeUndefined()
  const active = (await ui.findAll({ type: 'Text', text: /^\[c\] Settings$/ })).find(x => x.props.bold)
  expect(active?.props.color).toBe('ide')
  expect(active?.props.underline).toBe(true)
  expect((await ui.find({ key: 'tab-settings' }))?.props.plain).toBe(true)
  const tasksTab = await ui.find({ type: 'Text', text: /^\[t\] Tasks \(1\)$/ })
  expect(tasksTab?.props.bold).toBeFalsy()
  expect(tasksTab?.props.color).toBe('inactive')
  for (const g of SETTING_GROUPS) await ui.press({ key: `group:${g.title}` })
  const keys = (await ui.findAll({ type: 'Button' })).map(r => String(r.props.key)).filter(k => k.startsWith('setting:'))
  expect(keys).toEqual(['mode', 'max_parallel', 'max_minutes', 'auto_retries', 'enabled', 'test_commands', 'test_minutes', 'tests_with_changes', 'checker', 'scout_findings', 'notify', 'open_on_start', 'archive_days'].map(n => `setting:${n}`))
  expect(await ui.find({ type: 'Text', text: /^ npm test$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ 5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /default 3 · 1-8 · how many workers run at once/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /default 45 · 5-600/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /one shell line, or a list of up to 5 lines/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ off$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ approve merge$/ })).toBeDefined()
  // Enter on a number opens an edit box; on mode a pick list of paused / approve merge / auto merge (stored review / auto)
  await ui.press({ key: 'setting:max_parallel' })
  expect(await ui.find({ key: 'setting-edit' })).toBeDefined()
  await ui.press({ key: 'setting:mode' })
  expect(await ui.find({ key: 'setting-edit' })).toBeUndefined()
  expect(await ui.find({ key: 'pick:paused' })).toBeDefined()
  expect(await ui.find({ key: 'pick:off' })).toBeUndefined()
  expect(await ui.find({ key: 'pick:review' })).toBeDefined()
  expect(await ui.find({ key: 'pick:auto' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '○ paused' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● approve merge' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '○ auto merge' })).toBeDefined()
  await ui.press({ key: 'setting-cancel' })
  expect(await ui.find({ key: 'pick:paused' })).toBeUndefined()
  // notify: a pick list of only what this machine can play (here no speech program: no voice)
  await ui.press({ key: 'setting:notify' })
  // T-695: one notify row holds the sound set too: sound 1 / sound 2 / sound 3, and off
  expect(await ui.find({ key: 'pick:off' })).toBeDefined()
  for (const n of [1, 2, 3]) expect(await ui.find({ key: `pick:sound ${n}` })).toBeDefined()
  expect(await ui.find({ key: 'pick:sound' })).toBeUndefined()
  expect(await ui.find({ key: 'pick:voice' })).toBeUndefined()
  await ui.press({ key: 'setting-cancel' })
  // "t" goes back to the tasks
  await ui.press({ key: 'tab-tasks' })
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  await ui.unmount()
})

test('Settings groups its rows under 5 headings, in order; with every group open ↑↓ go heading, its rows, next heading', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [], notify: 'off', notify_choices: ['off'] } } })
  fakeFiles(on, ROLE_FILES)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-settings' })
  const titles = ['Work', 'Checks before merging', 'Workers', 'Scouts', 'Board and alerts']
  expect(SETTING_GROUPS.map(g => g.title)).toEqual(titles)
  for (const t of titles) await ui.press({ key: `group:${t}` })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const at = titles.map(t => texts.indexOf(`▾ ${t}`))
  expect(at.every(i => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
  // each row's name sits under its own heading, before the next one
  const under: Record<string, string[]> = {
    Work: ['mode', 'max_parallel', 'max_minutes', 'auto_retries', 'enabled'],
    'Checks before merging': ['test_commands', 'test_minutes', 'tests_with_changes', 'checker'],
    Workers: ['Roles', 'Kinds'],
    Scouts: ['scout_findings'],
    'Board and alerts': ['notify', 'open_on_start', 'archive_days'],
  }
  titles.forEach((t, i) => {
    const from = at[i]!
    const to = at[i + 1] ?? texts.length
    for (const name of under[t]!) {
      const k = texts.findIndex((x, j) => j > from && x.trimEnd() === name)
      expect(k).toBeGreaterThan(from)
      expect(k).toBeLessThan(to)
    }
  })
  // the ↑↓ stops are each heading then its rows, category after category
  const rows = titles.flatMap(t => [`group:${t}`, ...under[t]!.map(n => (n === 'Roles' ? 'settings-roles' : n === 'Kinds' ? 'settings-kinds' : `setting:${n}`))])
  const isStop = (k: string) => k.startsWith('group:') || k.startsWith('setting:') || k === 'settings-roles' || k === 'settings-kinds'
  const stops = (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).filter(isStop)
  expect(stops).toEqual(rows)
  expect(arrowTarget(stops, 'setting:enabled', 1)).toBe('group:Checks before merging')
  expect(arrowTarget(stops, 'group:Checks before merging', 1)).toBe('setting:test_commands')
  expect(arrowTarget(stops, 'settings-kinds', 1)).toBe('group:Scouts')
  await ui.unmount()
})

test('Settings groups start closed with the first heading focused; Enter opens and closes one; a closed one shows its summary and ↑↓ skip its rows; it stays open after leaving the page', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'One')], working: [], scouts: [], mode: 'auto', test_commands: [], max_parallel: 3, max_minutes: 45, auto_retries: 2, notify: 'off', notify_choices: ['off'] } } })
  fakeFiles(on, ROLE_FILES)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-settings' })
  const isStop = (k: string) => k.startsWith('group:') || k.startsWith('setting:') || k === 'settings-roles' || k === 'settings-kinds'
  const stops = async () => (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).filter(isStop)
  // all closed: only the 5 headings, each a focusable row with its summary; the first one has the focus
  expect(await stops()).toEqual(SETTING_GROUPS.map(g => `group:${g.title}`))
  const work = await ui.find({ key: 'group:Work' })
  expect(work?.props.plain).toBe(true)
  expect(work?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'group:Scouts' }))?.props.autoFocus).toBeUndefined()
  expect(work?.props.label).toBe('▸ Work · auto merge · 3 at once · 45 min · 2 re…')
  expect(await ui.find({ type: 'Text', text: '▸ Work' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' · auto merge · 3 at once · 45 min · 2 re…' })).toBeDefined()
  expect(String((await ui.find({ key: 'group:Workers' }))?.props.label)).toMatch(/^▸ Workers · \d+ roles? · \d+ kinds?/)
  expect(await ui.find({ key: 'setting:mode' })).toBeUndefined()
  // Enter opens Work: its rows show under "▾ Work"; ↑↓ go from its last row to the next heading, past nothing hidden
  await ui.press({ key: 'group:Work' })
  expect((await ui.find({ key: 'group:Work' }))?.props.label).toBe('▾ Work')
  const open = await stops()
  expect(open).toEqual(['group:Work', 'setting:mode', 'setting:max_parallel', 'setting:max_minutes', 'setting:auto_retries', 'setting:enabled', ...SETTING_GROUPS.slice(1).map(g => `group:${g.title}`)])
  expect(arrowTarget(open, 'setting:enabled', 1)).toBe('group:Checks before merging')
  expect(arrowTarget(open, 'group:Checks before merging', 1)).toBe('group:Workers')
  // a setting's pick list opens inside its open group, as before
  await ui.press({ key: 'setting:mode' })
  expect(await ui.find({ key: 'pick:review' })).toBeDefined()
  await ui.press({ key: 'setting-cancel' })
  // leaving the page and coming back keeps Work open and the rest closed
  await ui.press({ key: 'tab-tasks' })
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  await ui.press({ key: 'tab-settings' })
  expect(await stops()).toEqual(open)
  // Enter again closes it
  await ui.press({ key: 'group:Work' })
  expect(await ui.find({ key: 'setting:mode' })).toBeUndefined()
  expect((await ui.find({ key: 'group:Work' }))?.props.label).toMatch(/^▸ Work · /)
  await ui.unmount()
})

test('a closed group summary is cut to fit', () => {
  const work = SETTING_GROUPS[0]!
  expect(groupSummary(work, { mode: 'auto', max_parallel: 3, max_minutes: 45, auto_retries: 2 }, 80)).toBe('Work · auto merge · 3 at once · 45 min · 2 retries')
  expect(groupSummary(work, { mode: 'auto', max_parallel: 3, max_minutes: 45, auto_retries: 2 }, 20)).toBe('Work · auto merge ·…')
  expect(groupSummary(work, { mode: 'auto', enabled: false }, 80)).toContain('disabled')
  const board = SETTING_GROUPS.find(g => g.title === 'Board and alerts')!
  expect(groupSummary(board, { archive_days: 0 }, 80)).toContain('never archive')
  expect(groupSummary(board, { archive_days: 0 }, 80)).not.toContain('archive after')
  expect(groupSummary(board, { archive_days: 1 }, 100)).toContain('archive after 1 day')
  // a long title is kept whole even when narrow; the values that don't fit are left out
  const checks = SETTING_GROUPS.find(g => g.title === 'Checks before merging')!
  expect(groupSummary(checks, { test_commands: ['npm test'] }, 20)).toBe('Checks before merging')
  expect(groupSummary(checks, { test_commands: ['npm test'] }, 21)).toBe('Checks before merging')
  // test commands in plain words: no brackets or quotes
  const two = groupSummary(checks, { test_commands: ['claude plugin test .', 'sh scripts/typecheck.sh'] }, 90)
  expect(two).toBe('Checks before merging · 2 test commands · tests 10 min · untested: ask · checker off')
  expect(two).not.toMatch(/[[\]"]/)
  expect(groupSummary(checks, { test_commands: ['claude plugin test .'] }, 80)).toMatch(/^Checks before merging · claude plugin test \. · /)
  expect(groupSummary(checks, { test_commands: ['cd web && npm run test:all -- --coverage'] }, 80)).toContain(' · cd web && npm run test:… · ')
  expect(groupSummary(checks, { test_commands: [] }, 80)).toContain(' · no tests · ')
})

test('a closed group heading draws its title bold in the text colour and its values dim; an open one is bold', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'auto', max_parallel: 3, test_commands: ['claude plugin test .', 'sh scripts/typecheck.sh'] } } })
  fakeFiles(on, ROLE_FILES)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-settings' })
  const title = await ui.find({ type: 'Text', text: /^▸ Work$/ })
  expect(title?.props.bold).toBe(true)
  expect(title?.props.color).toBe('text')
  const values = await ui.find({ type: 'Text', text: /^ · auto merge · 3 at once/ })
  expect(values?.props.color).toBe('inactive')
  expect(values?.props.bold).toBeFalsy()
  const checks = await ui.find({ key: 'group:Checks before merging' })
  expect(checks?.text).toMatch(/^▸ Checks before merging · 2 test commands/)
  expect(checks?.text).not.toMatch(/[[\]"]/)
  await ui.press({ key: 'group:Work' })
  const open = await ui.find({ type: 'Text', text: /^▾ Work$/ })
  expect(open?.props.bold).toBe(true)
  await ui.unmount()
})

test('the Settings key line says "Enter open/close" on a group heading and "Enter change" on a setting row', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  fakeFiles(on, ROLE_FILES)
  const keys = arrowKeys($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const heading = /^Enter open\/close · ↑↓ move/
  const change = /^Enter change · ↑↓ move/
  await ui.press({ key: 'tab-settings' })
  // the focus is not known yet (or is on a tab button): the normal page hint, not "open/close"
  expect(await ui.find({ type: 'Text', text: change })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: heading })).toBeUndefined()
  await keys.focus('tab-settings')
  expect(await ui.find({ type: 'Text', text: change })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: heading })).toBeUndefined()
  // a group heading gets the focus: "Enter open/close"
  await keys.focus('group:Work')
  expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: change })).toBeUndefined()
  // the focus moves to a setting row of the open group: "Enter change"; back on a heading: "Enter open/close"
  // (the test kit can't stand in for the plugin's own ↑↓ focus move, so the moves are made as Tab would)
  await ui.press({ key: 'group:Work' })
  await keys.focus('setting:mode')
  expect(await ui.find({ type: 'Text', text: change })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: heading })).toBeUndefined()
  await keys.focus('group:Scouts')
  expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: change })).toBeUndefined()
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
    dirOf(e.path) ? { value: Object.keys(files).filter(f => e.path.endsWith(f.slice(0, f.lastIndexOf('/'))) && files[f] !== null).map(f => entry(f.slice(f.lastIndexOf('/') + 1))) } : next(e),
  )
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  on('fs.write', (_, e) => ((written[e.path] = String(e.text)), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: ran() }))
  // the project folder (tool calls need it, see findRoot)
  inProject(on)
  return written
}

const ROLE_FILES = {
  '/roles/general.md': '---\ndescription: a plain worker\n---\n',
  '/roles/docs.md': '---\ndescription: writes the docs\n---\n- plain words\n',
  '/roles/tester.md': '---\ndescription: writes tests\nmodel: sonnet\n---\n- cover errors\n',
  '/roles/security.md': '---\ndescription: checks for holes\n---\n',
}

test('a running task shows its kind (never its role, T-722) at the right end in the inactive color; the list shows no try "(n)" (T-628), the band keeps it; a plain change shows no tag', async ($, on) => {
  const tasks = [task('T-1', 'doing', 'Plain work', { role: 'general', attempts: 2 }), task('T-12', 'doing', 'Cover the parser errors', { role: 'tester', attempts: 1 }), task('T-13', 'doing', 'Fix the parser', { kind: 'bug', role: 'tester', attempts: 3 }), task('T-14', 'todo', 'Write the guide', { kind: 'docs', role: 'docs' })]
  stateOf(on, { view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 60 }, surface: 'terminal' })
  const mark = await ui.find({ type: 'Text', text: /^ +\[bug\]$/ })
  expect(mark).toBeDefined()
  expect(mark?.props.color).toBe('inactive')
  expect((await ui.find({ key: 'T-14' }))?.text).toMatch(/Write the guide +\[docs\]$/)
  expect((await ui.find({ key: 'T-12' }))?.text).toMatch(/Cover the parser errors$/)
  expect(await ui.find({ type: 'Text', text: /tester/ })).toBeUndefined()
  // no try mark on any list row, not "(n)" and not "try n" (T-628: the band and the task page show it)
  expect(await ui.find({ type: 'Text', text: /^ ?\([23]\)$/ })).toBeUndefined()
  expect((await ui.find({ key: 'T-1' }))?.text).toMatch(/T-1 +▶ +Plain work$/)
  expect((await ui.find({ key: 'T-13' }))?.text).toMatch(/T-13 ▶ +Fix the parser +\[bug\]$/)
  for (const id of ['T-1', 'T-12', 'T-13']) expect((await ui.find({ key: id }))?.text).not.toMatch(/try|\(\d\)/)
  // the titles still start in one column
  const starts = await Promise.all(['T-1', 'T-12', 'T-13'].map(async id => {
    const text = (await ui.find({ key: id }))!.text
    return text.indexOf(tasks.find(t => t.id === id)!.title)
  }))
  expect(new Set(starts).size).toBe(1)
  expect(await ui.find({ type: 'Text', text: /general/ })).toBeUndefined()
  await ui.unmount()
  // the band above the prompt keeps the try (bandLeads)
  const leads = bandLeads(tasks as Parameters<typeof bandLeads>[0], Date.now())
  expect(leads.get('T-13')).toMatch(/^T-13 ▶ \(3\)$/)
  expect(leads.get('T-1')).toMatch(/^T-1 +▶ \(2\) *$/)
})

test('an open task shows its role and model; "Role" (l) opens a pick list of the roles, and picking one sets it', async ($, on) => {
  const board = { tasks: [task('T-1', 'todo', 'Write it up', { role: 'tester' })] }
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const written = fakeFiles(on, { ...ROLE_FILES, '/board.json': JSON.stringify(board), '/board.lock': null })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Role:\s+tester — writes tests · model sonnet$/ })).toBeDefined()
  expect(await ui.find({ key: 'role' })).toBeDefined()
  expect((await ui.find({ key: 'role-key' }))?.props.hotkey).toBe('l')
  expect(await ui.find({ type: 'Text', text: /l role/ })).toBeDefined()
  await ui.press({ key: 'role' })
  for (const r of ['general', 'tester', 'security', 'docs']) expect(await ui.find({ key: `role:${r}` })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^● tester$/ })).toBeDefined()
  await ui.press({ key: 'role:docs' })
  const saved = Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, text]) => text)
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
  // the header (T-751): id and title in bold; the state line under them says the status, in its own color; no Status row
  const id = await ui.find({ type: 'Text', text: /^T-3$/ })
  expect(id?.props.bold).toBe(true)
  // (the "[☐ Needs review]" button, T-775, is no badge)
  expect(L.some(l => /^\[[^\]]*(ready for review|review)[^\]]*\]$/.test(l) && !/Needs review/.test(l))).toBe(false)
  expect(L.some(l => l.startsWith('Status:'))).toBe(false)
  // the state line wraps between its groups at 50 columns: the origin goes on to the next line
  const state = L.findIndex(l => l.startsWith('◆ ready for review'))
  expect(L.slice(state, state + 2)).toEqual(['◆ ready for review   change · general · try 2/4', '♟ from you'])
  const badge = (await ui.findAll({ type: 'Text', text: /^◆ ready for review$/ })).find(t => t.props.color)
  expect(badge?.props.color).toBe('warning')
  expect(badge?.props.bold).toBe(true)
  for (const label of ['Steps', 'Added', 'Role', 'From', 'Why', 'Request', 'Seen', 'Files', 'After', 'Branch', 'Tries']) {
    const row = L.find(l => l.startsWith(`${label}:`))
    expect(row).toBeDefined()
    // every value starts in the same column
    expect(row!.slice(0, 10).trim()).toBe(`${label}:`)
    expect(row![10]).not.toBe(' ')
  }
  expect(L.some(l => /^From:     ♟ owner$/.test(l))).toBe(true)
  expect(L.some(l => /^Why:\s+Scouts mostly find/.test(l))).toBe(true)
  expect(L.some(l => /·\s*why:/.test(l))).toBe(false)
  // the request in full, in quotes, wrapped within the panel, never cut mid-word
  const at = L.findIndex(l => l.startsWith('Request:'))
  const seen = L.findIndex(l => l.startsWith('Seen:'))
  const wrapped = L.slice(at, seen).map(l => l.slice(10))
  expect(wrapped.length).toBeGreaterThan(1)
  expect(L.slice(at + 1, seen).every(l => l.startsWith(' '.repeat(10)))).toBe(true)
  expect(wrapped.join(' ')).toBe(`“${request}”`)
  for (const l of L.slice(at, seen)) expect(l.length).toBeLessThanOrEqual(50)
  expect(L.some(l => /^Seen:\s+last owner prompt/.test(l))).toBe(true)
  const seenPiece = await ui.find({ type: 'Text', text: /^last owner prompt/ })
  expect(seenPiece?.props.color).toBe('inactive')
  const who = await ui.find({ type: 'Text', text: /^owner$/ })
  expect(who?.props.color).toBe('claude')
  expect(L.some(l => /^Branch:\s+symcc\/T-3$/.test(l))).toBe(true)
  expect(L.some(l => /^Tries:\s+2$/.test(l))).toBe(true)
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
  expect((await ui.findAll({ type: 'Text', text: /^▶ doing$/ })).find(t => t.props.color)?.props.color).toBe('ide')
  expect((await lines(ui)).some(l => /^Request:/.test(l))).toBe(false)
  await ui.unmount()
})

test('T-587: the terminal task page Status row names the state (T-647), and its Stage row marks the step now, the steps before done; no badge under the title (T-693)', async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const fresh = iso(T0 - 10_000)
  const tasks = [task('T-4', 'doing', 'Fix it', { note: 'a checker agent is trying to break it before it merges', attempts: 1, runs: [{ started: iso(T0 - 9 * 60_000), ended: fresh }], live: { checking: { step: 'checker', at: fresh } }, })]
  stateOf(on, { opened: 'T-4', view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', checker: true, test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  expect(L).not.toContain('[⌕ checker · 9m]')
  // T-751: the header's state line names the state, the step and the time; the Steps row in Details the way to the merge
  expect(L.find(l => l.startsWith('▶ doing'))).toMatch(/^▶ doing · checker · ⏱ 9m\b/)
  const at = L.findIndex(l => l.startsWith('Steps:'))
  expect(L.slice(at, at + 2).join(' ').replace(/\s+/g, ' ')).toMatch(/^Steps: worker ✓ → prep ✓ → ● checker → queue → test → merge/)
  await ui.unmount()
})

test('T-587: with the checker setting off the Stage row leaves "checker" out; a task in test shows the steps before done', async ($, on) => {
  const T0 = Date.parse('2026-03-02T10:00:00Z')
  mock.clock(on, { now: T0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const fresh = iso(T0 - 10_000)
  const tasks = [task('T-4', 'doing', 'Fix it', { note: 'running the tests', attempts: 1, runs: [{ started: iso(T0 - 9 * 60_000), ended: fresh }], live: { checking: { step: 'testing', at: fresh } }, })]
  stateOf(on, { opened: 'T-4', view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  expect(L).not.toContain('[⊛ test · 9m]')
  const at = L.findIndex(l => l.startsWith('Steps:'))
  expect(L.slice(at, at + 2).join(' ').replace(/\s+/g, ' ')).toMatch(/^Steps: worker ✓ → prep ✓ → queue ✓ → ● test → merge/)
  await ui.unmount()
})

// the From row on the task page starts with the mark of its origin, in the value column
{
  const kinds: [Record<string, unknown>, string][] = [
    [{ by: 'owner', request: 'go', why: 'w', at: '' }, '♟ owner'],
    [{ by: 'scout', scout: 'bugs', why: 'w', at: '' }, '⌕ scout bugs'],
    [{ by: 'scout', scout: 'bugs', task: 'T-1', how: 'follow-up', why: 'w', at: '' }, '⌕ scout bugs, T-1 (follow-up)'],
    [{ by: 'worker', task: 'T-1', why: 'w', at: '' }, '▸ T-1 (worker report)'],
    [{ by: 'lead', why: 'w', at: '' }, '◆ lead'],
    [{ by: 'lead', task: 'T-1', how: 'split', why: 'w', at: '' }, '↳ T-1 (split)'],
    [{ by: 'worker', task: 'T-1', how: 'follow-up', why: 'w', at: '' }, '↳ T-1 (follow-up)'],
  ]
  for (const [origin, want] of kinds) test(`the task page's From row shows "${want}"`, async ($, on) => {
    stateOf(on, { opened: 'T-2', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Base'), task('T-2', 'todo', 'Next', { origin })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const row = (await lines(ui)).find(l => l.startsWith('From:'))
    expect(row).toBe(`${'From:'.padEnd(10)}${want}`)
    await ui.unmount()
  })
}

test('an old task without an origin still opens, with From: unknown and no Why row', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Old one', { origin: undefined })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  expect(L.some(l => /^From:\s+unknown/.test(l))).toBe(true)
  expect(L.some(l => /^Why:/.test(l))).toBe(false)
  expect(L.some(l => /^Files:\s+anywhere in the project$/.test(l))).toBe(true)
  expect(L.some(l => /^Tries:\s+0$/.test(l))).toBe(true)
  await ui.unmount()
})

test('the task page shows the Details rows in full with no fold and no e key', async ($, on) => {
  const origin = { by: 'owner', request: 'make it so', why: 'asked for it', at: '' }
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'review', 'Open one', { origin, attempts: 1, branch: 'symcc/T-1' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // shown without pressing anything, under a plain heading
  expect(await ui.find({ type: 'Text', text: /^▍Details$/ })).toBeDefined()
  const L = await lines(ui)
  for (const label of ['Steps', 'Added', 'Role', 'From', 'Why', 'Request', 'Files', 'Branch', 'Tries']) expect(L.some(l => new RegExp(`^${label}:`).test(l))).toBe(true)
  // no fold: no toggle, no "press e" hint, no e in the key hints; d stays Show changes
  expect(await ui.find({ key: 'details-toggle' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /press e|show details|hide details/ })).toBeUndefined()
  expect(L.some(l => /press e|· e /.test(l))).toBe(false)
  expect((await ui.find({ key: 'show-changes-key' }))?.props.hotkey).toBe('d')
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

test('the lead guide is in the system prompt while symcc is enabled, and left out once it is disabled', async ($, on) => {
  const files: Record<string, string | null> = { '/board.json': JSON.stringify({ tasks: [] }), '/board.lock': null }
  fakeFiles(on, files)
  // the engine's own sections, beneath the plugin
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  const ids = async () => (await $.prompt.compose(COMPOSE)).sections.map(x => x.id)
  // an old board without "enabled" is on
  expect(await ids()).toContain('symcc:lead')
  files['/board.json'] = JSON.stringify({ tasks: [], enabled: false })
  expect(await ids()).not.toContain('symcc:lead')
  files['/board.json'] = JSON.stringify({ tasks: [], enabled: true })
  expect(await ids()).toContain('symcc:lead')
})

test('while symcc is disabled its tools answer that it is disabled and leave the board alone', async ($, on) => {
  const board = { tasks: [task('T-1', 'todo', 'Build it')], enabled: false }
  const written = fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  const r = (await $.tool.call({ tool: 'mcp__symcc__add', title: 'More', why: 'test' } as never)) as { result?: unknown }
  expect(JSON.stringify(r.result)).toContain('symcc is disabled. The owner can turn it back on with /symcc-enable.')
  expect(Object.keys(written).some(p => /board\.json/.test(p))).toBe(false)
})

test('the Tasks view: no workers/scouts strip in the banner, NEEDS YOU then one doing / to do list with extras, aligned folded rows, a short hint', async ($, on) => {
  const now = Date.now()
  const iso = (m: number) => new Date(now + m * 60_000).toISOString()
  const tasks = [
    task('T-94', 'review', 'Clearer board view'),
    task('T-95', 'doing', 'Secrets scout example', { role: 'frontend', kind: 'bug', attempts: 1, runs: [{ started: iso(-4) }] }),
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
    // no status strip in the banner (the workers and scouts are in the line above the prompt)
    expect(texts.some(t => /workers|\d+ scouts?\b/.test(t))).toBe(false)
    const counts = texts.findIndex(t => /^2 doing · /.test(t))
    expect(counts).toBeGreaterThan(-1)
    expect(texts.findIndex(t => /^━+$/.test(t))).toBeGreaterThan(counts)
    // the mode line is in the footer, after the list, not under the banner
    expect(texts.findIndex(t => /^⏸ approve merge $/.test(t))).toBeGreaterThan(texts.findIndex(t => /^━+$/.test(t)))
    // every task row fits the panel; the hint is whole and fits too
    for (const id of ['T-94', 'T-95', 'T-96', 'T-97']) expect((await ui.find({ key: id }))!.text.length).toBeLessThanOrEqual(w)
    const hint = keyLines(texts, listKeys(), w)
    for (const l of hint) expect(l.length).toBeLessThanOrEqual(w)
    expect(hint.join(' · ')).toBe('Enter open · ↑↓ move · l t s c views')
    expect(texts.some(t => /a\/x|a approve|x reject/.test(t))).toBe(false)
    // folded rows: no brackets, counts lined up
    const backlog = (await ui.find({ key: 'day:backlog' }))!.text
    const done = (await ui.find({ key: 'day:done' }))!.text
    expect(backlog).toBe('▸ Backlog   3')
    expect(done).toBe('▸ Done     12')
    expect(await ui.find({ key: 'day:dropped' })).toBeUndefined()
    await ui.unmount()
  }
  // at 100 columns the extras sit at the right end of each row
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'terminal' })
  expect((await ui.find({ key: 'T-95' }))!.text).toMatch(/^T-95 ▶ 4m\s+Secrets scout example\s+\[bug\]$/)
  expect((await ui.find({ key: 'T-95' }))!.text.length).toBe(100)
  expect((await ui.find({ key: 'T-97' }))!.text).toMatch(/^T-97 ○\s+Rename "off" to "pause"\s+waits for T-96$/)
  expect((await ui.find({ key: 'T-94' }))!.text).toMatch(/^T-94 ◆ review\s+Clearer board view\s+Enter to review$/)
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

test('T-696: a long-title row in the terminal list keeps "waits for T-1" / "[feature]" at its end and cuts the title with "…"', async ($, on) => {
  const now = Date.now()
  const long = 'Board list: keep the row end visible by cutting the title instead of dropping the extra part'
  const tasks = [
    task('T-1', 'doing', 'Short one', { attempts: 1, runs: [{ started: new Date(now - 60_000).toISOString() }] }),
    task('T-2', 'todo', long, { after: ['T-1'] }),
    task('T-3', 'todo', long, { kind: 'feature' }),
  ]
  stateOf(on, { view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'review', max_parallel: 3, test_commands: [] } } })
  for (const w of [60, 100]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'terminal' })
    const t2 = (await ui.find({ key: 'T-2' }))!.text
    const t3 = (await ui.find({ key: 'T-3' }))!.text
    expect(t2).toMatch(/^T-2\s+○\s+Board list: .*…  +waits for T-1$/)
    expect(t3).toMatch(/^T-3\s+○\s+Board list: .*…  +\[feature\]$/)
    expect(t2.length).toBe(w)
    await ui.unmount()
  }
  // very narrow: the title keeps 20 columns and the extra is cut, then left out
  // (44: one column short of the whole "waits for T-1" since T-893 put one space, not two, before the title)
  for (const w of [44, 30]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'terminal' })
    const t2 = (await ui.find({ key: 'T-2' }))!.text
    expect(t2.length).toBeLessThanOrEqual(w)
    expect(t2).toMatch(w === 44 ? /^T-2\s+○\s+Board list: keep th…  waits.*…$/ : /^T-2\s+○\s+Board list: [^…]*…$/)
    await ui.unmount()
  }
})

const OFF_CASES = [
  ['symcc is disabled', { on_here: false }, /^symcc is disabled · $/],
  ['the board is paused', { mode: 'paused' }, /^⏸ paused: nothing starts$/],
] as const
for (const [when, extra, want] of OFF_CASES)
  test(`the banner's first line warns when ${when}`, async ($, on) => {
    stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [scout('bugs')], mode: 'auto', test_commands: [], ...extra } } })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
    const t = await ui.find({ type: 'Text', text: want })
    expect(t).toBeDefined()
    expect(t?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /workers · \d+ scouts?/ })).toBeUndefined()
    await ui.unmount()
  })

for (const surface of ['terminal', 'vscode'] as const)
  test(`symcc disabled (${surface}): the header says "symcc is disabled · /symcc-enable to turn it back on", the command in the accent color`, async ($, on) => {
    stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [], on_here: false } } })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface })
    const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(all.some(t => /symcc is disabled · \/symcc-enable to turn it back on/.test(t))).toBe(true)
    expect(all.some(t => /symcc off|symcc: symcc/.test(t))).toBe(false)
    const cmd = await ui.find({ type: 'Text', text: /^\/symcc-enable$/ })
    expect(cmd?.props.color).toBe('ide')
    expect(cmd?.props.bold).toBe(true)
    await ui.unmount()
  })

test('a task in review on a narrow or wide panel shows every key and every button in full, keys first by importance', async ($, on) => {
  stateOf(on, { opened: 'T-5', view: { shape: 'view-1', value: { tasks: [task('T-5', 'review', 'Blue button', { branch: 'symcc/T-5' })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  for (const w of [30, 50, 80]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'terminal' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const lines = keyLines(texts, keysFor('review'), w)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(w)
    expect(lines.join(' · ')).toBe('a approve · d show changes · x reject · n needs review · y copy · ↑↓ scroll · b back')
    if (w === 30) expect(lines).toEqual(['a approve · d show changes', 'x reject · n needs review', 'y copy · ↑↓ scroll · b back'])
    if (w === 80) expect(lines).toEqual(['a approve · d show changes · x reject · n needs review · y copy · ↑↓ scroll', 'b back'])
    // the keys are bold, the words in the inactive color
    expect((await ui.find({ type: 'Text', text: /^a$/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^ approve$/ }))?.props.color).toBe('inactive')
    // every action button is there, in the header's group order (T-751), then their hidden key Buttons
    const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.key))
    expect(keys).toEqual(['back', 'approve', 'show-changes', 'reject', 'drop', 'needs-review', 'copy', 'back-key', 'approve-key', 'show-changes-key', 'reject-key', 'needs-review-key', 'copy-key'])
    // no key inside a pill: only the hidden Buttons have one
    for (const k of keys.filter(x => !x.endsWith('-key'))) expect((await ui.find({ key: k }))?.props.hotkey, k).toBeUndefined()
    // T-575: the key hints are the buttons that have a key, in their order (b back and ↑↓ scroll last)
    const hotkeys = (await ui.findAll({ type: 'Button' })).map(b => b.props.hotkey).filter((k): k is string => typeof k === 'string' && k !== 'b')
    expect(hotkeys).toEqual(keysFor('review').map(k => k.key).filter(k => k !== 'b' && k !== '↑↓'))
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
    print(`Scouts list at ${width} columns:\n${rows.join('\n')}`)
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
    // icon colors: running blue, waiting plain, paused inactive; a finding in the warning color
    expect((await ui.findAll({ type: 'Text', text: /^  ◉ $/ }))[0]?.props.color).toBe('ide')
    expect((await ui.findAll({ type: 'Text', text: /^  ◎ $/ }))[0]?.props.color).toBe('text')
    expect((await ui.findAll({ type: 'Text', text: /^  ○ $/ }))[0]?.props.color).toBe('inactive')
    if (width === 90) {
      expect((await ui.find({ type: 'Text', text: /last: found 1/ }))?.props.color).toBe('warning')
      expect((await ui.find({ type: 'Text', text: /last: nothing/ }))?.props.color).toBe('inactive')
    }
    // a name for screen readers, "+ New scout" on top, and one hint line, no old help line
    expect((await ui.find({ key: 'scout:simplify' }))?.props.label).toBe('simplify: paused')
    expect(await ui.find({ type: 'Text', text: /^  \+ New scout$/ })).toBeDefined()
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.filter(t => /^Enter open · /.test(t))).toEqual(['Enter open · ↑↓ move · l t s c views · b back'])
    expect(texts.some(t => /run now \/ edit on its page/.test(t))).toBe(false)
    await ui.unmount()
  })
}

/** Fake scout files, scouts.json and the board; a write to a scouts.json temp file becomes scouts.json (the mv). */
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
  on('fs.list', (_, e, next) => (e.path.endsWith('/scouts') ? { value: ['bugs', ...Object.keys(more)].map(n => entry(`${n}.md`)) } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  on('fs.write', (_, e) => {
    if (/\/scouts\.json\..*\.tmp$/.test(e.path)) files['/scouts.json'] = String(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: ran() }))
  inProject(on)
  mock.clock(on, { now: Date.now() })
  return files
}

test('"p" on a scout\'s page pauses it (saved in scouts.json, its file untouched), and again resumes it', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { prompt: 'Look for crashes.' })], mode: 'auto', test_commands: [] } } })
  const files = scoutFiles(on, JSON.stringify({ scouts: {} }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // waiting: how often it runs on the header's state line, and p pause in the key hints
  expect(await ui.find({ type: 'Text', text: /^◷ every 30 min/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /p pause/ })).toBeDefined()
  expect((await ui.find({ key: 'scout-pause-key' }))?.props.hotkey).toBe('p')
  expect((await ui.find({ key: 'scout-pause' }))?.props.label).toBe('Pause')
  await ui.press({ key: 'scout-pause' })
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs).toEqual({ paused: true })
  expect(files['/scouts/bugs.md']).toBe('---\nevery_minutes: 30\n---\nLook for crashes.\n')
  expect(toasts.some(t => /bugs paused: it doesn't run on its timer until you resume it \(run now still runs it\)/.test(t))).toBe(true)
  // paused is said as a fact at the end of the buttons line
  expect((await ui.find({ type: 'Text', text: /^⏸ paused$/ }))?.props.color).toBe('inactive')
  expect(await ui.find({ type: 'Text', text: /p resume/ })).toBeDefined()
  expect((await ui.find({ key: 'scout-pause' }))?.props.label).toBe('Resume')
  // a paused scout still has Run now (button and r key); it isn't refused for the pause
  expect((await ui.find({ key: 'scout-run-key' }))?.props.hotkey).toBe('r')
  expect(await ui.find({ type: 'Text', text: /r run now/ })).toBeDefined()
  await ui.press({ key: 'scout-run' })
  expect(toasts.some(t => /is paused/.test(t))).toBe(false)
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs.paused).toBe(true)
  await ui.press({ key: 'scout-pause' })
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs?.paused).toBeUndefined()
  expect(toasts.some(t => /bugs resumed: it runs every 30 min again/.test(t))).toBe(true)
  expect((await ui.find({ key: 'scout-pause' }))?.props.label).toBe('Pause')
  await ui.unmount()
})

test('a running scout\'s page has no Run now button', async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [scout('bugs', { prompt: 'Look for crashes.', running: true })], mode: 'auto', test_commands: [] } } })
  scoutFiles(on, null)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^◉ running now$/ })).toBeDefined()
  expect(await ui.find({ key: 'scout-edit' })).toBeDefined()
  expect(await ui.find({ key: 'scout-run' })).toBeUndefined()
  await ui.unmount()
})

test('/symcc-scout <name> pause and resume, and run now not refused while paused', async ($, on) => {
  const files = scoutFiles(on, null)
  stateOf(on, {})
  const run = async (args: string) => String((await $.command.run(slash('symcc-scout', args))).text)
  expect(await run('bugs pause')).toMatch(/^bugs paused: it doesn't run on its timer until you resume it/)
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs).toEqual({ paused: true })
  expect(await run('bugs pause')).toMatch(/^bugs is already paused/)
  // a pause only stops the timer: run now goes on to the other checks (this session doesn't drive the board)
  expect(await run('bugs')).toBe('scouts run in the session that drives the board; run /symcc-scout bugs there')
  expect(JSON.parse(files['/scouts.json']!).scouts.bugs).toEqual({ paused: true })
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
  const list = String((await $.command.run(slash('symcc-scouts'))).text)
  expect(list).toMatch(/^bugs: every 30 min/m)
  expect(list).toMatch(/^secrets: on demand$/m)
  expect(list).toMatch(/^bad: on demand \(every_minutes "-5" is not valid: runs only on demand until fixed\)$/m)
  // only bugs is on the timer: the panel shows its next run, and none for secrets and bad
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 140 }, surface: 'terminal' })
  await ui.press({ key: 'tab-scouts' })
  expect(String((await ui.find({ key: 'scout:bugs' }))?.text)).toMatch(/every 30 min\s+next in 1m/)
  expect(String((await ui.find({ key: 'scout:secrets' }))?.text).trimEnd()).toMatch(/^  ◎ secrets\s+on demand\s+never ran$/)
  expect(String((await ui.find({ key: 'scout:bad' }))?.text).trimEnd()).toMatch(/^  ◎ bad\s+on demand\s+bad every_minutes\s+never ran$/)
  await ui.unmount()
  // run now is not refused because the scout runs only on demand
  const run = String((await $.command.run(slash('symcc-scout', 'secrets'))).text)
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
  expect(Object.keys(written).some(p => /board\.json(\..*\.tmp)?$/.test(p))).toBe(false)
  // one copy of the file as it was, and the owner is told why
  const copies = Object.entries(written).filter(([p]) => /board\.json\.broken-/.test(p))
  expect(copies.length).toBe(1)
  expect(copies[0]![1]).toBe(text)
  expect(toasts.some(t => /board\.json can't be read/.test(t))).toBe(true)
  expect(toasts.some(t => /T-1 role: docs/.test(t))).toBe(false)
  await ui.unmount()
})

test('archived tasks are only counted on the Done row, and /symcc-task still finds one in archive.json', async ($, on) => {
  const archived = { done: 96, dropped: 3, tries: 0, ms: 0 }
  const board = { version: 1, next_id: 13, tasks: [task('T-11', 'done', 'Still here'), task('T-12', 'todo', 'Waits on an old one', { after: ['T-5'] })], archived, archived_done: ['T-5'] }
  stateOf(on, { view: { shape: 'view-1', value: { tasks: board.tasks, working: [], scouts: [], mode: 'auto', test_commands: [], archived, archived_done: ['T-5'] } } })
  fakeFiles(on, { ...ROLE_FILES, '/board.json': JSON.stringify(board), '/board.lock': null, '/archive.json': JSON.stringify({ version: 1, tasks: [task('T-5', 'done', 'An old one')] }), '/archive-2.json': null })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^▸ Done +1 \(\+96 archived\)$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /An old one/ })).toBeUndefined()
  // T-12 waits on T-5, which is archived as done: no "waits for T-5"
  expect(await ui.find({ type: 'Text', text: /waits for T-5/ })).toBeUndefined()
  await ui.unmount()
  const shown = String((await $.command.run(slash('symcc-task', 'T-5'))).text)
  expect(shown).toMatch(/^T-5 is archived \(in \.symcc\/archive\.json; read-only\)/)
  expect(shown).toMatch(/An old one/)
  expect(String((await $.command.run(slash('symcc-approve', 'T-5'))).text)).toBe('T-5 is archived.')
  expect(String((await $.command.run(slash('symcc-task', 'T-6'))).text)).toBe('T-6 is not on the board.')
})

// ---------------- each try's report on the task page ----------------

const R1 = '.symcc/reports/T-1-try-1.md'
const R2 = '.symcc/reports/T-1-try-2.md'
const reportedTask = (extra: Record<string, unknown> = {}) =>
  task('T-1', 'done', 'Explore the market', { attempts: 2, runs: [{ started: '', ended: '', report: R1 }, { started: '', ended: '', report: R2 }], history: hist('try 1: first go → tests failed', 'try 2: second go → merged into main'), ...extra })

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
  // T-775: drawn "[Try 1] [● Try 2]", no key in the label; the keys are on hidden Buttons
  expect(L.filter(l => /Try \d/.test(l))).toEqual(['[Try 1]', '[● Try 2]'])
    expect((await ui.find({ key: 'report-try-1' }))?.props.hotkey).toBeUndefined()
  expect((await ui.find({ key: 'report-try-1-key' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'report-try-2' }))?.props.label).toBe('● Try 2')
  await ui.press({ key: 'report-try-1-key' })
  L = await lines(ui)
  expect(L.some(l => /^▍Report \(try 1, 1 of 2\)$/.test(l))).toBe(true)
  expect(L.some(l => /First try report: the tests failed\./.test(l))).toBe(true)
  expect(L.some(l => /Second try report/.test(l))).toBe(false)
  expect((await ui.find({ key: 'report-try-1' }))?.props.label).toBe('● Try 1')
  await ui.press({ key: 'report-try-2' })
  expect((await lines(ui)).some(l => /Second try report\./.test(l))).toBe(true)
  await ui.unmount()
})

test('T-775: on mobile the try buttons are native Buttons labelled "Try 1", with no brackets, and still pick a try', async ($, on) => {
  fakeFiles(on, { '/reports/T-1-try-1.md': 'First try report: the tests failed.\n', '/reports/T-1-try-2.md': 'Second try report.\n' })
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [reportedTask()], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  const b = await ui.find({ key: 'report-try-1' })
  expect(b?.type).toBe('Button')
  expect(b?.props.label).toBe('Try 1')
  expect(b?.props.variant).toBe('secondary')
  expect(b?.props.plain).toBe(undefined)
  expect(b?.text ?? '').not.toContain('[')
  expect((await ui.find({ key: 'report-try-1-key' }))?.props.hotkey).toBe('1')
  await ui.press({ key: 'report-try-1' })
  expect((await ui.find({ key: 'report-try-1' }))?.props.label).toBe('● Try 1')
  await ui.unmount()
})

const answeredTask = (extra: Record<string, unknown> = {}) =>
  task('T-1', 'review', 'Why is the cache slow', { kind: 'investigation', role: 'researcher', attempts: 1, note: 'answered; waiting for you to read it', answer: 'Saved short answer.', runs: [{ started: '', ended: '', report: R1 }], history: hist('try 1: answered: The cache is never cleared.'), ...extra })

test('an answered investigation opens with its full answer and Done, Keep as a note and Ask more instead of Approve and Reject', async ($, on) => {
  fakeFiles(on, { '/reports/T-1-try-1.md': `The cache is never cleared.\n\n${'It grows with every request and is never trimmed. '.repeat(4)}\nChecked in src/cache.ts.\n` })
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [answeredTask()], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  expect(L.some(l => /^▍Answer \(try 1\)$/.test(l))).toBe(true)
  expect(L.some(l => /The cache is never cleared\./.test(l))).toBe(true)
  expect(L.some(l => /Checked in src\/cache\.ts\./.test(l))).toBe(true)
  // the full answer from the report, not the short saved one; wrapped to the panel width
  expect(L.some(l => /Saved short answer/.test(l))).toBe(false)
  for (const l of L.filter(x => /grows with every request/.test(x))) expect(l.length).toBeLessThanOrEqual(50)
  // T-899: Done and Keep as a note end the task: buttons only, no letter key (a typed word could press them)
  expect(await ui.find({ key: 'done-key' })).toBeUndefined()
  expect(await ui.find({ key: 'keep-note-key' })).toBeUndefined()
  expect((await ui.find({ key: 'ask-more-key' }))?.props.hotkey).toBe('x')
  expect(await ui.find({ key: 'approve' })).toBeUndefined()
  expect(await ui.find({ key: 'reject' })).toBeUndefined()
  expect(await ui.find({ key: 'show-changes' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Changes \(/ })).toBeUndefined()
  expect(L.some(l => /^x ask more/.test(l))).toBe(true)
  expect(L.some(l => /a done|v keep as a note/.test(l))).toBe(false)
  expect(L.some(l => /^Kind:\s+investigation — nothing is merged$/.test(l))).toBe(true)
  // no badge under the title (T-693); the header's state line says it is answered (T-701, T-751)
  expect(L.some(l => /^\[◆ answered: read it\]$/.test(l))).toBe(false)
  expect(L.some(l => l.startsWith('◆ answered: read it'))).toBe(true)
  // one try: its report is the answer, so it is not shown twice
  expect(L.filter(l => /Checked in src\/cache\.ts\./.test(l)).length).toBe(1)
  // Ask more opens a box for the follow-up question
  expect(await ui.find({ key: 'reject-reason' })).toBeUndefined()
  await ui.press({ key: 'ask-more' })
  expect((await ui.find({ key: 'reject-reason' }))?.props.label).toBe('Your follow-up question')
  await ui.unmount()
})

test('an answered investigation without a readable report shows the answer saved on the task', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [answeredTask({ runs: [] })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  expect(L.some(l => /^▍Answer$/.test(l))).toBe(true)
  expect(L.some(l => /Saved short answer\./.test(l))).toBe(true)
  await ui.unmount()
})

test('the board list shows an answered investigation with ◆ "answer" and [investigation]; a change task in review still says review', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [answeredTask({ title: 'Cache slow?' }), task('T-2', 'review', 'Blue button')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'T-1' }))!.text).toMatch(/^T-1\s+◆ answer\s+Cache slow\?\s+\[investigation\]$/)
  expect((await ui.find({ key: 'T-2' }))!.text).toMatch(/^T-2\s+◆ review\s+Blue button\s+Enter to review$/)
  await ui.unmount()
})

test('the board list and the task page show ● for a to do task worked on before, ○ for a fresh one (T-528)', async ($, on) => {
  const tasks = [task('T-1', 'todo', 'Fresh one'), task('T-2', 'todo', 'Tried one', { attempts: 1 }), task('T-3', 'review', 'Blue button', { attempts: 1 })]
  stateOf(on, { view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'T-1' }))!.text).toMatch(/^T-1\s+○ /)
  expect((await ui.find({ key: 'T-2' }))!.text).toMatch(/^T-2\s+● /)
  expect((await ui.find({ key: 'T-3' }))!.text).toMatch(/^T-3\s+◆ review/)
  await ui.press({ key: 'T-2' })
  expect((await lines(ui)).some(l => l.startsWith('● to do   '))).toBe(true)
  await ui.unmount()
})

test('an old task without saved reports still opens and says "no saved report"', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'done', 'Old one', { attempts: 1, runs: [{ started: '', ended: '' }], history: hist('try 1: did it → merged into main') })], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
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
  expect((await lines(ui)).some(l => /^Research:\s+docs\/research\/market\.md$/.test(l))).toBe(true)
  await ui.unmount()
})

const ENDED_RUNS = [
  { started: '2026-11-09T10:00:00.000Z', ended: '2026-11-09T10:00:24.000Z', ended_by: 'restarted', ended_note: 'the task was changed (after, details)' },
  { started: '2026-11-09T11:00:00.000Z', ended: '2026-11-09T11:17:00.000Z', ended_by: 'finished', ended_note: 'clash with main', agents: [{ kind: 'worker' as const, started: '2026-11-09T11:00:00.000Z', ended: '2026-11-09T11:17:00.000Z', tokens: { cache_read: 5_000_000, input: 600_000 } }] },
  { started: '2026-11-09T12:00:00.000Z', ended: '2026-11-09T12:03:00.000Z', merge_main: true, ended_by: 'finished', ended_note: 'merged', agents: [{ kind: 'worker' as const, started: '2026-11-09T12:00:00.000Z', ended: '2026-11-09T12:03:00.000Z', tokens: { input: 232_500 } }] },
  { started: '2026-11-09T13:00:00.000Z', ended: '2026-11-09T13:01:00.000Z' },
]

test('the Runs rows say how each try ended; a run with no reason shows none', async ($, on) => {
  const t = task('T-1', 'done', 'Ended', { attempts: 4, runs: ENDED_RUNS })
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [t], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /try 1: 24s · restarted: the task was changed \(after, details\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 2: 17m · 5\.6M tokens in all · finished: clash with main/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /try 3: 3m · 232\.5k tokens in all · merged main in \(clash with main\) · finished: merged/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {2}try 4: 1m$/ })).toBeDefined()
  await ui.unmount()
})

test('/symcc-task says how each try ended next to its time and tokens', async ($, on) => {
  const t = task('T-1', 'done', 'Ended', { attempts: 4, runs: ENDED_RUNS })
  const board = { version: 1, next_id: 2, mode: 'auto', test_commands: [], tasks: [t] }
  fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null })
  stateOf(on, {})
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'the test has no terminal to place it in' } }))
  const text = String((await $.command.run(slash('symcc-task', 'T-1'))).text)
  expect(text).toContain('  try 1: 24s · restarted: the task was changed (after, details)\n')
  expect(text).toContain('  try 3: 3m · 232.5k tokens in all · merged main in (clash with main) · finished: merged\n')
  expect(text).toContain('  try 4: 1m\n')
})

test('/symcc-task shows the latest report, or its first 40 lines and where the full one is', async ($, on) => {
  const many = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')
  const board = { version: 1, next_id: 2, mode: 'auto', test_commands: [], tasks: [reportedTask({ research_notes: ['docs/research/market.md'] })] }
  fakeFiles(on, { '/board.json': JSON.stringify(board), '/board.lock': null, '/reports/T-1-try-1.md': 'Old.\n', '/reports/T-1-try-2.md': many })
  stateOf(on, {})
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'the test has no terminal to place it in' } }))
  const text = String((await $.command.run(slash('symcc-task', 'T-1'))).text)
  expect(text).toContain(`Report (try 2, ${R2}):`)
  expect(text).toContain('  line 40')
  expect(text).not.toContain('line 41\n')
  expect(text).toContain(`… (20 more lines) full report: ${R2}`)
  expect(text).toContain('Research: docs/research/market.md')
})

test('plan mode: add puts the task in the backlog and says so; leaving plan mode tells the lead once with the list', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  const files: Record<string, string | null> = { '/board.json': JSON.stringify({ tasks: [task('T-1', 'done', 'Old')] }), '/board.lock': null }
  inProject(on)
  // the plugin writes board.json to a temp file, then moves it in place with mv: keep the fake board in step
  const temp: Record<string, string> = {}
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  // the fake keeps only board.json: a parts file (.symcc/tasks/T-0.json) is never there (an exists check that fails
  // would make the board broken, T-681)
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : /\/tasks\/T-\d+\.json$/.test(e.path) ? { value: false } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  on('fs.write', (_, e) => ((temp[e.path] = String(e.text)), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv?: string[] }).argv ?? []
    if (argv[0] === 'mv' && /board\.json$/.test(argv[3] ?? '') && temp[argv[2]!] !== undefined) files['/board.json'] = temp[argv[2]!]!
    return { value: ran() }
  })
  // nothing beneath answers the classic events in a test: answer them empty
  on('classic.UserPromptSubmit', () => ({}) as never)
  on('classic.Stop', () => ({}) as never)
  const told: string[] = []
  on('prompt.submit', (_, e) => (told.push(String((e as { text?: string }).text ?? '')), { text: '' } as never))
  const add = async (title: string) => JSON.stringify(((await $.tool.call({ tool: 'mcp__symcc__add', title, details: 'd', why: 'test', origin_by: 'owner' } as never)) as { result?: unknown }).result)
  // no signal yet: behaves as today
  expect(await add('Before')).toContain('added T-2 Before')
  expect(JSON.parse(files['/board.json']!).tasks.find((t: { id: string }) => t.id === 'T-2').status).toBe('todo')
  await $.classic.UserPromptSubmit({ prompt: 'plan it', permission_mode: 'plan' } as never)
  await clock.advance(10)
  expect(await add('Planned')).toContain('plan mode: T-3 Planned added to the backlog; nothing starts')
  expect(JSON.parse(files['/board.json']!).tasks.find((t: { id: string }) => t.id === 'T-3').status).toBe('backlog')
  // a worker's event (agent_id) does not count for the main session
  await $.classic.Stop({ permission_mode: 'acceptEdits', agent_id: 'w1' } as never)
  await clock.advance(10)
  expect(await add('Also planned')).toContain('plan mode: T-4')
  await $.classic.Stop({ permission_mode: 'default' } as never)
  await $.classic.Stop({ permission_mode: 'default' } as never)
  await clock.advance(5000)
  const ends = told.filter(t => t.includes('Plan mode is off'))
  expect(ends.length).toBe(1)
  expect(ends[0]).toContain('- T-3 Planned')
  expect(ends[0]).toContain('- T-4 Also planned')
  // not moved by itself
  expect(JSON.parse(files['/board.json']!).tasks.find((t: { id: string }) => t.id === 'T-3').status).toBe('backlog')
  expect(await add('After')).toContain('added T-5 After')
})

type Mounted = TestMounted<'terminal', 'Pane'>
/** The page's footer: there is exactly one, it is the last thing on the page, it starts with the light rule, and
 *  the page's key hints are in it and nowhere else. Returns its text without the rule. */
async function footerOf(ui: Mounted, hints: KeyHint[], width = 50): Promise<string> {
  const boxes = await ui.findAll({ type: 'Box' })
  const feet = boxes.filter(b => String(b.key).endsWith('-footer'))
  expect(feet.length).toBe(1)
  const foot = feet[0]!.text
  expect(boxes[0]!.text.endsWith(foot)).toBe(true)
  expect(foot.startsWith('─'.repeat(width))).toBe(true)
  const lines = hintLines(hints, width).map(hintLineText)
  expect(foot.endsWith(lines.join(''))).toBe(true)
  // each hint line is drawn once on the page
  for (const l of lines) expect(boxes[0]!.text.split(l).length - 1).toBe(1)
  return foot.slice(width)
}

test('the Tasks page ends with a footer: the light rule, the mode line with [m], then its key hints; the header has no mode line', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-5', 'review', 'Blue button')], working: [], scouts: [], mode: 'review', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const foot = await footerOf(ui, listKeys())
  expect(foot).toBe('⏸ approve merge [m] auto merge  [f] search' + 'Enter open · ↑↓ move · l t s c views')
  expect((await ui.findAll({ type: 'Text', text: /^⏸ approve merge $/ })).length).toBe(1)
  expect((await ui.findAll({ key: 'mode' })).length).toBe(1)
  // the mode line comes after the list, not under the banner
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.indexOf('⏸ approve merge ')).toBeGreaterThan(texts.findIndex(t => /^\s*Enter to review$/.test(t)))
  await ui.unmount()
})

const NO_MODE_PAGES: [string, Record<string, unknown>, string | null, KeyHint[]][] = [
  ['task page', { opened: 'T-5' }, null, keysFor('review')],
  ['diff view', { opened: 'T-5' }, 'show-changes', [{ key: 'a', word: 'approve' }, { key: 'x', word: 'reject' }, { key: '↑↓', word: 'scroll' }, { key: 'b', word: 'back to the task' }]],
  ['scouts list', { tab: 'scouts' }, null, [{ key: 'Enter', word: 'open' }, { key: '↑↓', word: 'move' }, { key: 'l t s c', word: 'views' }, { key: 'b', word: 'back' }]],
  ['scout page', { tab: 'scouts', scout: 'bugs' }, null, [{ key: 'r', word: 'run now' }, { key: 'e', word: 'edit' }, { key: 'p', word: 'pause' }, { key: '↑↓', word: 'scroll' }, { key: 'b', word: 'back' }]],
  ['scout editor', { tab: 'scouts', scout: 'bugs' }, 'scout-edit', [{ key: '↑↓', word: 'move between boxes' }, { key: 'Cancel', word: 'leaves without saving' }]],
  ['settings', { tab: 'settings' }, null, [{ key: 'Enter', word: 'change' }, { key: '↑↓', word: 'move' }, { key: 'l t s c', word: 'views' }, { key: 'b', word: 'back' }]],
]
for (const [name, seed, press, hints] of NO_MODE_PAGES)
  test(`the ${name} ends with a footer of its own key hints and has no mode line`, async ($, on) => {
    stateOf(on, { ...seed, view: { shape: 'view-1', value: { tasks: [task('T-5', 'review', 'Blue button', { branch: 'symcc/T-5' })], working: [], scouts: [scout('bugs', { prompt: 'Look for crashes.' })], mode: 'review', test_commands: [] } } })
    on('ui.toast', () => ({ value: undefined }))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    if (press) await ui.press({ key: press })
    expect(await footerOf(ui, hints)).toBe(hintLines(hints, 50).map(hintLineText).join(''))
    expect(await ui.find({ key: 'mode' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^⏸ approve merge/ })).toBeUndefined()
    await ui.unmount()
  })

test('the banner text is in the unselected tabs\' color, not bold; warnings keep the warning color', async ($, on) => {
  const tasks = [task('T-1', 'doing', 'One'), task('T-2', 'todo', 'Two')]
  stateOf(on, { view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'review', max_parallel: 3, test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const re of [/^this session drives$|^driven by another session$/, /^3 at once$/, /^1 doing$/]) {
    const t = await ui.find({ type: 'Text', text: re })
    expect(t?.props.color).toBe('inactive')
    expect(t?.props.bold).toBeFalsy()
  }
  // the tabs that aren't selected use the same color
  expect((await ui.find({ type: 'Text', text: /^\[s\] Scouts \(/ }))?.props.color).toBe('inactive')
  expect((await ui.find({ type: 'Text', text: /^no test command$/ }))?.props.color).toBe('warning')
  await ui.unmount()
})

test('Copy (y) on a task page puts the task on the clipboard as plain text and says so; a no says why', async ($, on) => {
  const board = { tasks: [task('T-12', 'failed', 'Copy a task', { details: 'Add a Copy button.', files: ['docs/guide.md'], attempts: 1, origin: undefined, runs: [{ started: '', ended: '', report: '.symcc/reports/T-12-try-1.md' }] })] }
  stateOf(on, { opened: 'T-12', view: { shape: 'view-1', value: { ...board, working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  fakeFiles(on, { ...ROLE_FILES, '/board.json': JSON.stringify(board), '/reports/T-12-try-1.md': 'Did the button.\n' })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const copied: string[] = []
  let answer: { isCopied: true } | { isCopied: false; reason: 'no-clipboard' } = { isCopied: true }
  on('ui.copy', (_, e) => (copied.push(e.text), { value: answer }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'copy-key' }))?.props.hotkey).toBe('y')
  await ui.press({ key: 'copy' })
  expect(copied.length).toBe(1)
  expect(copied[0]).toMatch(/^T-12  Copy a task\nfailed · general · from: unknown\nWhat to do:\nAdd a Copy button\.\nMay change: docs\/guide\.md\nLatest report:\nDid the button\.\n$/)
  expect(toasts.some(t => /T-12 copied/.test(t))).toBe(true)
  answer = { isCopied: false, reason: 'no-clipboard' }
  await ui.press({ key: 'copy' })
  expect(copied.length).toBe(2)
  expect(toasts.some(t => /couldn't copy: this terminal has no clipboard access/.test(t))).toBe(true)
  await ui.unmount()
})

test('↑↓ move between the elements Tab walks, in order; past the first or last they scroll; the wheel and page keys scroll', () => {
  const stops = ['tab-tasks', 'T-1', 'T-2', 'mode']
  expect(arrowTarget(stops, 'T-1', 1)).toBe('T-2')
  expect(arrowTarget(stops, 'T-2', -1)).toBe('T-1')
  expect(arrowTarget(stops, 'mode', 1)).toBeUndefined()
  expect(arrowTarget(stops, 'tab-tasks', -1)).toBeUndefined()
  expect(arrowTarget(stops, undefined, 1)).toBeUndefined()
  expect(arrowTarget(stops, 'gone', 1)).toBeUndefined()
  const person = { kind: 'person' }
  expect(isArrow({ origin: person, by: 1 })).toBe(true)
  expect(isArrow({ origin: person, by: -1 })).toBe(true)
  expect(isArrow({ origin: person, by: 1, pointer: { column: 0, row: 0 } })).toBe(false)
  expect(isArrow({ origin: person, by: 20 })).toBe(false)
  expect(isArrow({ origin: { kind: 'plugin' }, by: 1 })).toBe(false)
  expect(saysArrowsMove(listKeys())).toBe(true)
  expect(saysArrowsMove(scoutListKeys())).toBe(true)
  expect(saysArrowsMove(settingsKeys())).toBe(true)
  expect(saysArrowsMove(rolesKeys())).toBe(true)
  expect(saysArrowsMove(keysFor('todo'))).toBe(false)
  expect(saysArrowsMove(scoutKeys())).toBe(false)
})

test('the focus stops of a drawn page are its Buttons and Inputs in order, without the hidden hotkey Buttons', () => {
  const el = (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props, children })
  const tree = el('Box', {}, [el('Box', { key: 'tabs' }, el('Button', { key: 'tab-tasks' }), el('Box', { display: 'none' }, el('Button', { key: 'tab-key-tasks' })))], el('Input', { key: 'search' }), [el('Button', { key: 'T-1' }, el('Text', {}, 'T-1')), null, 'x'], el('Box', {}, el('Button', { key: 'mode' })))
  expect(focusStops(tree)).toEqual(['tab-tasks', 'search', 'T-1', 'mode'])
})

test('every list page says "↑↓ move" in its key line; a task page says "↑↓ scroll"', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'One')], working: [], scouts: [scout('a')], mode: 'auto', test_commands: [] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Enter open · ↑↓ move · l t s c views$/ })).toBeDefined()
  await ui.press({ key: 'tab-scouts' })
  expect(await ui.find({ type: 'Text', text: /^Enter open · ↑↓ move · l t s c views · b back$/ })).toBeDefined()
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ type: 'Text', text: /^Enter change · ↑↓ move · l t s c views · b back$/ })).toBeDefined()
  await ui.press({ key: 'tab-tasks' })
  await ui.press({ key: 'T-1' })
  expect(await ui.find({ type: 'Text', text: /↑↓ scroll/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↑↓ move/ })).toBeUndefined()
  await ui.unmount()
})

test('the ↑↓ stops of a drawn page are only its list rows: the tabs, search, mode and Back are left to Tab', () => {
  const el = (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props, children })
  const tree = el('Box', {}, el('Box', { key: 'tabs' }, el('Button', { key: 'tab-tasks' }), el('Button', { key: 'tab-scouts' })), el('Button', { key: 'search-open' }), el('Button', { key: 'T-1' }), el('Button', { key: 'day:done' }), el('Button', { key: 'T-2' }), el('Button', { key: 'mode' }), el('Button', { key: 'scouts-back' }))
  const stops = rowStops(tree, new Set(['T-1', 'T-2', 'day:done']))
  expect(stops).toEqual(['T-1', 'day:done', 'T-2'])
  expect(arrowTarget(stops, 'T-1', 1)).toBe('day:done')
  expect(arrowTarget(stops, 'T-2', -1)).toBe('day:done')
  // past the last row ↓ and past the first row ↑ scroll (no target): never onto [m] mode, search or a tab
  expect(arrowTarget(stops, 'T-2', 1)).toBeUndefined()
  expect(arrowTarget(stops, 'T-1', -1)).toBeUndefined()
  // on a button that is not a row (Tab put the ring there), ↑↓ scroll
  expect(arrowTarget(stops, 'mode', -1)).toBeUndefined()
  expect(arrowTarget(stops, 'tab-tasks', 1)).toBeUndefined()
})

/** Drives the board panel's real `ui.focus` and `ui.scroll` hooks (noteFocus, arrowMove in register.tsx) as the
 *  engine raises them for the person's Tab or click (`focus`) and ↑ or ↓ (`arrow`); what reaches the bottom (the
 *  engine) is kept: where the ring is, and the scrolls. The test kit has no stand-in for the plugin's own
 *  `$.ui.focus` call, so only the scrolls past the ends (and off the rows) are checked here; the moves between rows
 *  are checked on arrowTarget and rowStops above. */
function arrowKeys($: Engine, on: On) {
  const seen = { focused: undefined as string | undefined, scrolls: [] as { by: number; offset: number }[] }
  on('ui.focus', (_, e) => ((seen.focused = e.element), {}))
  on('ui.scroll', (_, e) => (seen.scrolls.push({ by: e.by, offset: e.offset }), {}))
  on('ui.toast', () => ({ value: undefined }))
  const focus = (element: string) => $.ui.focus({ component: 'Pane', requestId: PANE.requestId, plugin: 'symcc', element, origin: { kind: 'person' } })
  const arrow = (by: 1 | -1) => $.ui.scroll({ component: 'Pane', requestId: PANE.requestId, offset: 5 + by, by, bodyRows: 20, contentRows: 60, origin: { kind: 'person' } })
  return { seen, focus, arrow }
}

/** The list rows' keys among the drawn Buttons, in order. */
const rowKeys = async (ui: { findAll: (q: { type: string }) => Promise<{ key: string | undefined }[]> }, isRow: (k: string) => boolean) =>
  (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '').filter(isRow)

/** ↓ on the last row and ↑ on the first scroll the panel (the scroll reaches the engine as sent) and the ring stays
 *  on the row; so do ↑↓ with the ring on a button that is not a row. */
async function scrollsPastTheEnds(keys: ReturnType<typeof arrowKeys>, rows: string[], others: string[]) {
  expect(rows.length).toBeGreaterThan(1)
  const pressed = (by: 1 | -1, on: string) => async () => {
    const before = keys.seen.scrolls.length
    await keys.focus(on)
    await keys.arrow(by)
    expect(keys.seen.focused).toBe(on)
    expect(keys.seen.scrolls.slice(before)).toEqual([{ by, offset: 5 + by }])
  }
  await pressed(1, rows.at(-1)!)()
  await pressed(-1, rows[0]!)()
  for (const k of others) {
    await pressed(1, k)()
    await pressed(-1, k)()
  }
}

test('↑↓ on the Tasks list stop at the first and last task and scroll there: they never reach a tab, [m] mode or [f] search', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'One'), task('T-2', 'todo', 'Two'), task('T-3', 'done', 'Three')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const keys = arrowKeys($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'mode' })).toBeDefined()
  expect(await ui.find({ key: 'search-open' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↑↓ move/ })).toBeDefined()
  const rows = await rowKeys(ui, k => /^T-\d+$/.test(k) || k.startsWith('day:'))
  await scrollsPastTheEnds(keys, rows, ['mode', 'search-open', 'tab-tasks'])
  await ui.unmount()
})

test('↑↓ on the Scouts, Settings and Roles lists stop at their first and last row: never onto a tab or Back', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'One')], working: [], scouts: [scout('a'), scout('b')], mode: 'auto', test_commands: [] } } })
  fakeFiles(on, ROLE_FILES)
  const keys = arrowKeys($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-scouts' })
  expect(await ui.find({ key: 'scouts-back' })).toBeDefined()
  await scrollsPastTheEnds(keys, await rowKeys(ui, k => k.startsWith('scout:')), ['scouts-back', 'tab-scouts'])
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ key: 'settings-back' })).toBeDefined()
  await ui.press({ key: 'group:Workers' })
  await scrollsPastTheEnds(keys, await rowKeys(ui, k => k.startsWith('group:') || k.startsWith('setting:') || k === 'settings-roles'), ['settings-back', 'tab-settings'])
  await ui.press({ key: 'settings-roles' })
  expect(await ui.find({ key: 'roles-back' })).toBeDefined()
  await scrollsPastTheEnds(keys, await rowKeys(ui, k => k.startsWith('roleRow:')), ['roles-back'])
  await ui.unmount()
})

test('the Scouts, Settings and Roles rows are plain Buttons like the task rows: no "[ ]" around them, and Enter still opens a scout', async ($, on) => {
  stateOf(on, { view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'One')], working: [], scouts: listScouts(), mode: 'auto', test_commands: [] } } })
  fakeFiles(on, ROLE_FILES)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const plainRows = async (isRow: (k: string) => boolean) => {
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => isRow(String(b.key)))
    expect(rows.length).toBeGreaterThan(0)
    for (const b of rows) {
      expect(b.props.plain).toBe(true)
      expect(String(b.text)).not.toMatch(/[[\]]/)
    }
  }
  await ui.press({ key: 'tab-scouts' })
  await plainRows(k => k.startsWith('scout:'))
  expect(String((await ui.find({ key: 'scout:gaps-bot' }))?.text).trimEnd()).toMatch(/^  ◎ gaps-bot\s+every hour/)
  await ui.press({ key: 'tab-settings' })
  await ui.press({ key: 'group:Work' })
  await ui.press({ key: 'group:Workers' })
  await plainRows(k => k.startsWith('group:') || k.startsWith('setting:') || k === 'settings-roles')
  await ui.press({ key: 'settings-roles' })
  await plainRows(k => k.startsWith('roleRow:'))
  await ui.press({ key: 'roles-back' })
  await ui.press({ key: 'tab-scouts' })
  await ui.press({ key: 'scout:gaps-bot' })
  expect(await ui.find({ key: 'scout-back' })).toBeDefined()
  expect(await ui.find({ key: 'scout:secrets' })).toBeUndefined()
  await ui.unmount()
})

// ---------------- a failed task's "Why it failed" block ----------------

test('a failed task page starts with "Why it failed": the reason, what the report asks and what to do next, before Details', async ($, on) => {
  fakeFiles(on, { '/reports/T-1-try-1.md': 'Found the cause: the cache key ignores the user.\nNo code change needed.\nNEED FILES: src/cache.ts\n' })
  const t = task('T-1', 'failed', 'Fix the cache', { attempts: 1, note: 'the worker made no change', runs: [{ started: '', ended: '', report: R1 }], history: hist('try 1: Found the cause: the cache key ignores the user. No code change needed. NEED FILES: src/cache.ts → the worker made no change') })
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [t], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  const head = L.findIndex(l => l === '▍Why it failed')
  expect(head).toBeGreaterThan(-1)
  expect(head).toBeLessThan(L.findIndex(l => l === '▍Details'))
  const block = L.slice(head, L.findIndex(l => l === '▍Details')).join(' ').replace(/\s+/g, ' ')
  expect(block).toContain('The worker finished without changing any files. Its report says: Found the cause: the cache key ignores the user.')
  expect(block).toContain('The worker asks for more files: src/cache.ts.')
  expect(block).toContain('Next: Read the report below; Retry if it should try again')
  for (const l of L.slice(head, L.findIndex(l => l === '▍Details'))) expect(l.length).toBeLessThanOrEqual(50)
  await ui.unmount()
})

test('the "Why it failed" block does not show an earlier try\'s file request when the failed try left no report', async ($, on) => {
  fakeFiles(on, { '/reports/T-1-try-1.md': 'I need one more file.\nNEED FILES: src/cache.ts\n' })
  const t = task('T-1', 'failed', 'Fix the cache', { attempts: 2, note: 'the worker ended without a result', runs: [{ started: '', ended: '', report: R1 }, { started: '', ended: '' }], history: hist('try 1: worker asked for more files: src/cache.ts', 'try 2: the worker ended without a result') })
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [t], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const L = await lines(ui)
  const head = L.findIndex(l => l === '▍Why it failed')
  expect(head).toBeGreaterThan(-1)
  const block = L.slice(head, L.findIndex(l => l === '▍Details')).join(' ').replace(/\s+/g, ' ')
  expect(block).toContain('The worker ended without handing back a result')
  expect(block).not.toContain('asks for more files')
  await ui.unmount()
})

test('a task that did not fail has no "Why it failed" block', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [task('T-1', 'todo', 'Write it up')], working: [], scouts: [], mode: 'auto', test_commands: [] } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await lines(ui)).some(l => l === '▍Why it failed')).toBe(false)
  await ui.unmount()
})

test('T-615: the band ends each row with the same text as OpenCode\'s band and the lead\'s board (rowEndText)', async ($, on) => {
  mock.clock(on, { now: ROW_END_NOW })
  const tasks = rowEndBoard().tasks
  // the band shows six rows at most, so one task at a time
  let shown = tasks
  on('state.get', () => ({ value: { value: { shape: 'view-1', value: { tasks: shown, working: [], scouts: [], mode: 'auto', test_commands: [] } }, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  for (const t of tasks) {
    shown = [t]
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 200 }, surface: 'terminal' })
    expect([t.id, !!(await ui.find({ type: 'Text', text: new RegExp(`^ — ${esc(ROW_END[t.id]!)}$`, 'u') }))]).toEqual([t.id, true])
    await ui.unmount()
  }
})
