// T-619: the Organizational memory page; T-687: it is opened from the "Organizational memory (n notes)" button (key m)
// at the bottom of the Live tab (no longer from Settings), and its Back returns to the Live tab. It lists org-mem's
// notes newest first (number, date, text; no task id since T-632); a note can be deleted there (x, then y), on the terminal and in
// VS Code; /symcc-settings orgmem delete N does the same from the prompt (OpenCode's page sends it).
import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { ICON } from '../hooks/name'
import { inProject } from './project'
import { ran, slash } from './fakes'
import { vsHref } from '../hooks/claude/ui/vscode'
import { showsHeader, type BoardPage } from '../hooks/board'
import { textWidth } from '../hooks/core/stats'

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
  surface: 'terminal',
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const VIEW = { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'review', test_commands: [] } }, tab: 'live' }
const SETTINGS_VIEW = { ...VIEW, tab: 'settings' }

const FILE = '/proj/.symcc/org-mem.md'

/** Three notes, oldest first, the middle one written by hand. */
const NOTES = '- 2026-11-18: run one test file with scripts/test-files.sh\n\n- written by hand, no date\n- 2026-11-20: the type check is separate\n'

/** A fake .symcc folder holding org-mem.md (`files.text`; null: no file); safeWrite's temp file and mv work on it. */
function fakeOrgMem(on: On, text: string | null) {
  const files: Record<string, string> = text === null ? {} : { [FILE]: text }
  const mine = (p: string) => p.startsWith('/proj/.symcc/org-mem')
  // any other file: what the kit or inProject answers, else not there (a slash command alone asks for more)
  on('fs.exists', async (_, e, next) => (mine(e.path) ? { value: e.path in files } : await Promise.resolve(next(e)).catch(() => ({ value: false }))))
  on('fs.read', (_, e, next) => {
    if (!mine(e.path)) return next(e)
    if (!(e.path in files)) throw new Error('no file')
    return { value: files[e.path]! }
  })
  on('fs.write', (_, e, next) => (mine(e.path) ? ((files[e.path] = String(e.text)), { value: undefined }) : next(e)))
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'mv') {
      const [from, to] = argv.slice(-2) as [string, string]
      if (from in files) ((files[to] = files[from]!), delete files[from])
    }
    if (argv[0] === 'rm') delete files[argv[argv.length - 1]!]
    return { value: ran() }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/proj' } }) as never)
  inProject(on)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  mock.clock(on, { now: 1_800_000_000_000 })
  return files
}

/** Starts the session and mounts the panel (on the Live tab, see VIEW). */
async function settings($: Engine, surface: 'terminal' | 'vscode' = 'terminal') {
  await $.session.start({ cwd: '/proj' } as never)
  return $.ui.mount({ ...PANE, surface })
}

type Node = { type?: string; key?: unknown; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : !n || typeof n !== 'object' ? '' : ((n as Node).children ?? []).map(textOf).join(''))
/** The lines of a drawn terminal page, top to bottom (a row Box is one line; hidden Boxes draw nothing). */
const pageLines = (n: unknown): string[] => {
  const x = n as Node
  if (Array.isArray(n)) return n.flatMap(pageLines)
  if (!x || typeof x !== 'object') return []
  if (x.type === 'Box') {
    if (x.props?.display === 'none') return []
    return x.props?.flexDirection === 'row' ? [textOf(x)] : (x.children ?? []).flatMap(pageLines)
  }
  return [textOf(x)]
}
/** The Live tab's org-mem section header line (terminal). */
const omHead = async (ui: { drawn: () => Promise<unknown> }) => pageLines(await ui.drawn()).find(l => l.startsWith('▍Organizational memory'))

/** Every drawn text of the page, joined. */
const pageText = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; children?: unknown[] }[]> }) =>
  (await ui.findAll({ type: 'Text' })).flatMap(t => (t.children ?? []).filter(c => typeof c === 'string')).join('\n') +
  '\n' +
  (await ui.findAll({ type: 'Markdown' })).map(m => String(m.props.text ?? '')).join('\n')

test('T-687: Settings no longer lists org-mem (terminal and VS Code); the Workers group has only Roles and Kinds', async ($, on) => {
  stateOf(on, SETTINGS_VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($)
  await ui.press({ key: 'group:Workers' })
  expect(await ui.find({ key: 'settings-roles' })).toBeDefined()
  expect(await ui.find({ key: 'settings-orgmem' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Org-mem|Organizational memory/ })).toBeUndefined()
  await ui.unmount()
  const vs = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await vs.find({ key: 'settings-roles' })).toBeDefined()
  expect(await vs.find({ key: 'settings-orgmem' })).toBeUndefined()
  expect(await pageText(vs as never)).not.toContain('Organizational memory')
  await vs.unmount()
})

test('T-687, T-718: the Live tab ends with the Organizational memory section (count, key m for all notes) just above the key hints; m opens the page, Back returns to the Live tab', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($)
  const button = await ui.find({ key: 'live-orgmem' })
  expect(button?.props.hotkey).toBe('m')
  expect((await omHead(ui))).toContain('3 / 60')
  // at the bottom: after it only the footer (its rule, the legend when there are lanes, and the key hints)
  const nodes = await ui.findAll({})
  const at = nodes.findIndex(n => n.key === 'live-orgmem')
  expect(at).toBeGreaterThan(nodes.findIndex(n => String(n.text ?? '').startsWith('next up')))
  const after = nodes.slice(at + 1).map(n => String(n.text ?? ''))
  expect(after.some(t => t.includes('m org-mem'))).toBe(true)
  expect(after.some(t => t.startsWith('next up') || t.startsWith('today'))).toBe(false)
  expect(await ui.find({ type: 'Text', text: /m org-mem/ })).toBeDefined()
  await ui.press({ key: 'live-orgmem' })
  expect(await ui.find({ type: 'Text', text: /▍Organizational memory \(org-mem\)/ })).toBeDefined()
  expect(await ui.find({ key: 'live-orgmem' })).toBeUndefined()
  await ui.press({ key: 'orgmem-back' })
  expect((await omHead(ui))).toContain('3 / 60')
  expect(await ui.find({ type: 'Text', text: /agents \d+\/\d+ busy/ })).toBeDefined()
  await ui.unmount()
})

/** T-704: walks one surface's board through its pages, from the Tasks list to a task's page and back, the tabs, the org-mem
 *  page and back, and checks that each draws the board header exactly when core's showsHeader says so. */
async function headerWalk($: Engine, on: On, surface: 'terminal' | 'vscode') {
  const task = { id: 'T-1', title: 'A task', details: '', files: [], status: 'todo', note: '', question: null, order: 1, after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '' }
  // only the view is seeded: the tab and the opened task start empty (the Tasks list) and are changed by pressing
  stateOf(on, { view: { ...VIEW.view, value: { ...VIEW.view.value, tasks: [task] } } })
  fakeOrgMem(on, NOTES)
  // no session start: it would publish the (empty) board over the seeded view
  const ui = await $.ui.mount({ ...PANE, surface })
  const vs = surface === 'vscode'
  // the header: on the terminal its tabs row and the thick rule under it, in VS Code its "vs-header" box
  const drawn = async () =>
    vs ? (await ui.find({ key: 'vs-header' })) !== undefined
      : (await ui.find({ type: 'Text', text: /^\[t\]: Tasks/ })) !== undefined && (await ui.find({ type: 'Text', text: /^━+$/ })) !== undefined
  const check = async (page: BoardPage) => expect([page, await drawn()]).toEqual([page, showsHeader(page)])
  const tab = (t: 'tasks' | 'live' | 'scouts' | 'settings') => (vs ? ui.press({ key: 'tabs', link: { href: vsHref('tab', t) } }) : ui.press({ key: `tab-key-${t}` }))
  await check('tasks')
  await (vs ? ui.press({ key: 'T-1', link: { href: vsHref('task', 'T-1') } }) : ui.press({ key: 'T-1' }))
  expect(await ui.find({ key: 'back' })).toBeDefined()
  await check('task')
  await ui.press({ key: 'back' })
  await check('tasks')
  await tab('scouts')
  await check('scouts')
  await tab('settings')
  await check('settings')
  await tab('live')
  await check('live')
  await (vs ? ui.press({ key: 'live-orgmem', link: { href: vsHref('page', 'orgmem') } }) : ui.press({ key: 'live-orgmem' }))
  expect(await pageText(ui as never)).toContain('Organizational memory (org-mem)')
  await check('orgmem')
  // T-704: the org-mem page is an opened page now (from Live), so no header on it
  expect([surface, await drawn()]).toEqual([surface, false])
  await (vs ? ui.press({ key: 'orgmem-back', link: { href: vsHref('page', 'back/orgmem-back') } }) : ui.press({ key: 'orgmem-back' }))
  expect(await ui.find({ key: 'live-orgmem' })).toBeDefined()
  await check('live')
  await ui.unmount()
}

test('T-704: the terminal panel draws the board header exactly where showsHeader says: the lists yes, a task page and the org-mem page (opened from Live) no', async ($, on) => {
  await headerWalk($, on, 'terminal')
})

test('T-704: VS Code draws the board header exactly where showsHeader says: the lists yes, a task page and the org-mem page (opened from Live) no', async ($, on) => {
  await headerWalk($, on, 'vscode')
})

test('T-619: the Organizational memory page lists the notes newest first with their date; x then y deletes exactly that line', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  const ui = await settings($)
  await ui.press({ key: 'live-orgmem' })
  expect(await ui.find({ type: 'Text', text: /▍Organizational memory \(org-mem\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\.symcc\/org-mem\.md \(at most 60 lines\).*the lead decides what goes in/ })).toBeDefined()
  // newest (last in the file) first; each row its number and date, then the text
  const rows = (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).filter(k => k.startsWith('orgmemRow:'))
  expect(rows).toEqual(['orgmemRow:3', 'orgmemRow:2', 'orgmemRow:1'])
  expect((await ui.find({ key: 'orgmemRow:3' }))?.props.label).toBe('#3 · 2026-11-20: the type check is separate')
  expect((await ui.find({ key: 'orgmemRow:2' }))?.props.label).toBe('#2 · written by hand: written by hand, no date')
  expect((await ui.find({ key: 'orgmemRow:1' }))?.props.label).toBe('#1 · 2026-11-18: run one test file with scripts/test-files.sh')
  expect(await ui.find({ type: 'Text', text: /↑↓ move · x delete · b back$/ })).toBeDefined()
  // Enter on note 2 asks first; Cancel leaves the file alone
  await ui.press({ key: 'orgmemRow:2' })
  expect(await ui.find({ type: 'Text', text: 'Delete note #2 · written by hand from .symcc/org-mem.md?' })).toBeDefined()
  await ui.press({ key: 'orgmem-delete-cancel' })
  expect(await ui.find({ key: 'orgmem-delete-box' })).toBeUndefined()
  expect(files[FILE]).toBe(NOTES)
  // Delete (x) asks about a note, Yes deletes exactly that line (the blank line and the others stay as written)
  await ui.press({ key: 'orgmemRow:2' })
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(files[FILE]).toBe('- 2026-11-18: run one test file with scripts/test-files.sh\n\n- 2026-11-20: the type check is separate\n')
  expect(await ui.find({ key: 'orgmemRow:3' })).toBeUndefined()
  expect((await ui.find({ key: 'orgmemRow:2' }))?.props.label).toBe('#2 · 2026-11-20: the type check is separate')
  // the x key's Button asks about the note under the focus (here the first, newest one)
  expect(await ui.find({ key: 'orgmem-delete' })).toBeDefined()
  await ui.press({ key: 'orgmem-delete' })
  expect(await ui.find({ type: 'Text', text: /^Delete note #2 · 2026-11-20/ })).toBeDefined()
  // Back goes to the Live tab, whose button has the new count
  await ui.press({ key: 'orgmem-delete-cancel' })
  await ui.press({ key: 'orgmem-back' })
  expect((await omHead(ui))).toContain('2 / 60')
  await ui.unmount()
})

test('T-742: the terminal page has Delete (x) and Back (b) on one row right under the title, before the first note; the focus starts on a note; x and b still work', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($)
  await ui.press({ key: 'live-orgmem' })
  const keys = (await ui.findAll({})).map(n => String(n.key ?? ''))
  const title = (await ui.findAll({})).findIndex(n => /▍Organizational memory \(org-mem\)/.test(String(n.text ?? '')))
  expect(title).toBeGreaterThanOrEqual(0)
  expect(keys.indexOf('orgmem-delete')).toBeGreaterThan(title)
  expect(keys.indexOf('orgmem-back')).toBeGreaterThan(keys.indexOf('orgmem-delete'))
  expect(keys.indexOf('orgmemRow:3')).toBeGreaterThan(keys.indexOf('orgmem-back'))
  // one row, the line just under the title
  const page = (await ui.drawn()) as Node
  const kids = (page.children ?? []) as Node[]
  const at = kids.findIndex(k => /Organizational memory \(org-mem\)/.test(textOf(k)))
  const row = kids[at + 1]!
  expect([row.type, row.key ?? row.props?.key, row.props?.flexDirection]).toEqual(['Box', 'orgmem-buttons', 'row'])
  expect(((row.children ?? []) as Node[]).map(b => b.props?.label)).toEqual(['Delete (x)', 'Back (b)'])
  // the focus on the newest note, not on the buttons
  const focused = (await ui.findAll({ type: 'Button' })).filter(b => b.props.autoFocus === true).map(b => String(b.key ?? ''))
  expect(focused).toEqual(['orgmemRow:3'])
  expect((await ui.find({ key: 'orgmem-delete' }))?.props.hotkey).toBe('x')
  expect((await ui.find({ key: 'orgmem-back' }))?.props.hotkey).toBe('b')
  // x asks about the focused note; while it asks there is no Delete; b goes back to Live
  await ui.press({ key: 'orgmem-delete' })
  expect(await ui.find({ type: 'Text', text: /^Delete note #3 · 2026-11-20/ })).toBeDefined()
  expect(await ui.find({ key: 'orgmem-delete' })).toBeUndefined()
  await ui.press({ key: 'orgmem-delete-cancel' })
  await ui.press({ key: 'orgmem-back' })
  expect((await omHead(ui))).toContain('3 / 60')
  await ui.unmount()
})

test('T-742: VS Code: the "← Live" link comes before the first note', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($, 'vscode')
  await ui.press({ key: 'live-orgmem', link: { href: vsHref('page', 'orgmem') } })
  const keys = (await ui.findAll({})).map(n => String(n.key ?? ''))
  expect(keys.indexOf('orgmem-back')).toBeGreaterThanOrEqual(0)
  expect(keys.indexOf('orgmem-back')).toBeLessThan(keys.indexOf('orgmemRow:3'))
  await ui.unmount()
})

test('T-619: with no org-mem file the section says 0 / 60 and "No notes yet.", and the page says "No notes yet." with no delete key', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, null)
  const ui = await settings($)
  expect((await omHead(ui))).toContain('0 / 60')
  expect(pageLines(await ui.drawn()).find(l => l.includes('No notes'))).toBe('     No notes yet.')
  await ui.press({ key: 'live-orgmem' })
  expect(await ui.find({ type: 'Text', text: /No notes yet\./ })).toBeDefined()
  expect(await ui.find({ key: 'orgmem-delete' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^b back$/ })).toBeDefined()
  // T-704: an opened page, so no "views" hint and no hidden t/l/s/c Buttons
  expect(await ui.find({ type: 'Text', text: /views/ })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).filter(b => String(b.key ?? '').startsWith('tab-key-')).length).toBe(0)
  await ui.unmount()
})

test('T-619, T-687: VS Code: the Live tab\'s Organizational memory link opens the page; a note\'s Delete link asks, Yes deletes that line; "← Live" returns', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  const ui = await settings($, 'vscode')
  const row = await ui.find({ key: 'live-orgmem' })
  expect(String(row?.props.text)).toContain('Organizational memory')
  expect(await pageText(ui as never)).toContain('3 / 60')
  // at the bottom of the Live tab, just above its footer
  const all = (await ui.findAll({})).map(n => String(n.key ?? ''))
  expect(all.indexOf('live-orgmem')).toBeGreaterThan(all.indexOf('live-next'))
  expect(all.indexOf('live-hint-footer')).toBeGreaterThan(all.indexOf('live-orgmem'))
  await ui.press({ key: 'live-orgmem', link: { href: vsHref('page', 'orgmem') } })
  const text = await pageText(ui as never)
  expect(text).toContain('Organizational memory (org-mem)')
  // newest first: #3 before #2 before #1
  expect(text.indexOf('#3 · 2026-11-20')).toBeGreaterThanOrEqual(0)
  expect(text.indexOf('#3 · 2026-11-20')).toBeLessThan(text.indexOf('#2 · written by hand'))
  expect(text.indexOf('#2 · written by hand')).toBeLessThan(text.indexOf('#1 · 2026-11-18'))
  expect(text).toContain('run one test file with scripts/test-files.sh')
  await ui.press({ key: 'orgmemRow:1', link: { href: vsHref('do', 'orgmem-delete/1') } })
  expect(await ui.find({ key: 'orgmem-delete-yes' })).toBeDefined()
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(files[FILE]).toBe('\n- written by hand, no date\n- 2026-11-20: the type check is separate\n')
  expect(String((await ui.find({ key: 'orgmem-back' }))?.props.text)).toContain('← Live')
  await ui.press({ key: 'orgmem-back', link: { href: vsHref('page', 'back/orgmem-back') } })
  expect(await pageText(ui as never)).toContain('2 / 60')
  await ui.unmount()
})

test('T-619: VS Code with no notes says "No notes yet."', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, '')
  const ui = await settings($, 'vscode')
  await ui.press({ key: 'live-orgmem', link: { href: vsHref('page', 'orgmem') } })
  expect(await pageText(ui as never)).toContain('No notes yet.')
  await ui.unmount()
})

test('T-619: /symcc-settings orgmem delete N deletes note N; a wrong number deletes nothing', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  await $.session.start({ cwd: '/proj' } as never)
  const r = String((await $.command.run(slash('symcc-settings', 'orgmem delete 3'))).text)
  expect(r).toContain('Deleted note 3 from .symcc/org-mem.md (2026-11-20)')
  expect(files[FILE]).toBe('- 2026-11-18: run one test file with scripts/test-files.sh\n\n- written by hand, no date\n')
  const bad = String((await $.command.run(slash('symcc-settings', 'orgmem delete 9'))).text)
  expect(bad).toContain('No note 9')
  expect(files[FILE]).toBe('- 2026-11-18: run one test file with scripts/test-files.sh\n\n- written by hand, no date\n')
})

// ---------------- T-718: the Live tab's Organizational memory section ----------------

/** A sample org-mem file with topics, oldest first: the newest are #8 (written by hand: unsorted), #7 (git), #6 (tests). */
const TOPIC_NOTES = [
  '- 2026-11-18 [tests] Run one test file with scripts/test-files.sh, never plain bun test here',
  '- 2026-11-19 [git] The guard refuses a new repo inside the project folder',
  '- 2026-11-19 [tests] Snapshot pictures are made again with snapshotEntry',
  '- 2026-11-20 [vs code · panel] VS Code keeps a Box key but drops a Text key, so wrap lines in Boxes',
  '- 2026-11-20 [opencode] OpenTUI boxes shrink unless they are given a fixed size',
  '- 2026-11-21 [tests] In tests, put dates relative to now, never a fixed date for windows',
  '- 2026-11-21 [git] Use a plain path for each scratch repository command',
  '- a note written by hand without a date',
  '',
].join('\n')

/** A markdown text as VS Code shows it: links as their words, escapes and bold marks taken off. */
const shown = (md: string) => md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\\(.)/g, '$1')

test('T-718: the terminal Live tab draws the org-mem section (header, 3 newest, topic counts) at 40 and 100 columns, nothing wider than the panel', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, TOPIC_NOTES)
  await $.session.start({ cwd: '/proj' } as never)
  for (const bodyColumns of [40, 100]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns } })
    const lines = pageLines(await ui.drawn())
    for (const l of lines) expect([bodyColumns, l, textWidth(l) <= bodyColumns]).toEqual([bodyColumns, l, true])
    // T-747: a "▍Organizational memory" heading with the count and bar on it, the lines under it indented by 3 more
    const head = lines.findIndex(l => l.startsWith('▍Organizational memory   8 / 60 ▕'))
    expect(head).toBeGreaterThan(0)
    expect(lines[head - 1]!.trim()).toBe('')
    expect(lines[head + 1]).toBe('     newest')
    expect(lines[head + 2]).toMatch(/^ {6}— +unsorted {2}a note written/)
    expect(lines[head + 3]).toMatch(/^ {6}11-21 {2}git +Use a plain path/)
    expect(lines[head + 4]).toMatch(/^ {6}11-21 {2}tests +In tests, put/)
    expect(lines[head + 5]).toBe('     topics')
    const grid = lines.slice(head + 6, lines.findIndex(l => l.startsWith('     ↑↓ move')))
    expect(grid.join(' ')).toMatch(/tests +3/)
    expect(grid.join(' ')).toMatch(/git +2/)
    expect(grid.join(' ')).toMatch(/vs code · panel +1/)
    expect(grid.at(-1)).toMatch(/unsorted +1$/)
    expect(grid.length).toBe(bodyColumns === 100 ? 2 : 3)
    expect(lines.join('\n')).toContain('Enter open topic')
    // the newest notes and the topics are ↑↓ rows (Buttons) that open the page
    const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).filter(k => k.startsWith('live-om-'))
    expect(keys).toEqual(['live-om-note:8', 'live-om-note:7', 'live-om-note:6', 'live-om-topic:tests', 'live-om-topic:git', 'live-om-topic:opencode', 'live-om-topic:vs code · panel', 'live-om-topic:unsorted'])
    await ui.unmount()
  }
})

test('T-718: Enter on a topic opens the page of its notes only, Back returns to Live; Delete there deletes the right note; Enter on a newest note opens all notes on it', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, TOPIC_NOTES)
  const ui = await settings($)
  await ui.press({ key: 'live-om-topic:tests' })
  expect(await ui.find({ type: 'Text', text: /▍Organizational memory · tests$/ })).toBeDefined()
  const rows = async () => (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).filter(k => k.startsWith('orgmemRow:'))
  expect(await rows()).toEqual(['orgmemRow:6', 'orgmemRow:3', 'orgmemRow:1'])
  // Back: the Live tab again
  await ui.press({ key: 'orgmem-back' })
  expect((await omHead(ui))).toContain('8 / 60')
  // again, and delete note 3 from the filtered page: exactly that line goes
  await ui.press({ key: 'live-om-topic:tests' })
  await ui.press({ key: 'orgmemRow:3' })
  expect(await ui.find({ type: 'Text', text: 'Delete note #3 · 2026-11-19 from .symcc/org-mem.md?' })).toBeDefined()
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(files[FILE]).toBe(TOPIC_NOTES.replace('- 2026-11-19 [tests] Snapshot pictures are made again with snapshotEntry\n', ''))
  // the page stays filtered: the topic's two other notes (the numbers after the deleted line moved up by one)
  expect(await rows()).toEqual(['orgmemRow:5', 'orgmemRow:1'])
  await ui.press({ key: 'orgmem-back' })
  expect((await omHead(ui))).toContain('7 / 60')
  expect(pageLines(await ui.drawn()).find(l => /tests +\d/.test(l))).toMatch(/tests +2( |$)/)
  // a newest note: all notes, the focus on it; m: all notes, the focus on the newest
  await ui.press({ key: 'live-om-note:6' })
  expect(await ui.find({ type: 'Text', text: /▍Organizational memory \(org-mem\)$/ })).toBeDefined()
  expect((await rows()).length).toBe(7)
  expect((await ui.find({ key: 'orgmemRow:6' }))?.props.autoFocus).toBe(true)
  expect((await ui.find({ key: 'orgmemRow:7' }))?.props.autoFocus).toBe(undefined)
  // delete an older note (#1) there: the picked note is now #5 and keeps the focus (it is kept by its text, not its number)
  await ui.press({ key: 'orgmemRow:1' })
  await ui.press({ key: 'orgmem-delete-yes' })
  expect((await rows()).length).toBe(6)
  const focused = (await ui.findAll({ type: 'Button' })).filter(b => b.props.autoFocus === true).map(b => String(b.key ?? ''))
  expect(focused).toEqual(['orgmemRow:5'])
  await ui.press({ key: 'orgmem-back' })
  await ui.press({ key: 'live-orgmem' })
  expect((await ui.find({ key: 'orgmemRow:6' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('T-718: VS Code draws the org-mem section (title link, count, bar, 3 newest, topic links with counts) at 40 and 100 columns; a topic link opens its page, delete there deletes the right note, "← Live" returns', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, TOPIC_NOTES)
  await $.session.start({ cwd: '/proj' } as never)
  for (const bodyColumns of [40, 100]) {
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode', props: { ...PANE.props, bodyColumns } })
    expect(shown(String((await ui.find({ key: 'live-orgmem' }))?.props.text))).toBe('Organizational memory')
    expect(await pageText(ui as never)).toContain('8 / 60')
    expect((await ui.findAll({ type: 'Svg' })).some(x => String(x.props.alt) === '8 notes of at most 60')).toBe(true)
    for (const k of ['live-om-note:8', 'live-om-note:7', 'live-om-note:6']) expect(await ui.find({ key: k })).toBeDefined()
    expect(shown(String((await ui.find({ key: 'live-om-note:7' }))?.props.text))).toMatch(/^Use a plain path/)
    expect((await ui.findAll({ type: 'Markdown' })).filter(m => String(m.key ?? '').startsWith('live-om-topic:')).length).toBe(5)
    // each grid row: its cells' words and the gaps between them fit the panel
    let n = 0
    for (let i = 0; ; i++) {
      const r = (await ui.find({ key: `live-om-row-${i}` })) as unknown as Node | undefined
      if (!r) break
      const cells = ((r.children ?? []) as Node[]).map(c => shown(String(c.props?.text ?? ''))).filter(Boolean)
      n += cells.length
      expect([bodyColumns, cells, textWidth(cells.join('   ')) + 1 <= bodyColumns]).toEqual([bodyColumns, cells, true])
    }
    expect(n).toBe(5)
    expect(shown(String((await ui.find({ key: 'live-om-topic:tests' }))?.props.text))).toBe('tests 3')
    expect(shown(String((await ui.find({ key: 'live-om-topic:unsorted' }))?.props.text))).toBe('unsorted 1')
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'live-om-topic:tests', link: { href: vsHref('page', 'orgmem-topic/tests') } })
  const text = await pageText(ui as never)
  expect(text).toContain('Organizational memory · tests')
  expect(text).toContain('#6 · 2026-11-21')
  expect(text).not.toContain('#7 · 2026-11-21')
  await ui.press({ key: 'orgmemRow:3', link: { href: vsHref('do', 'orgmem-delete/3') } })
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(files[FILE]).toBe(TOPIC_NOTES.replace('- 2026-11-19 [tests] Snapshot pictures are made again with snapshotEntry\n', ''))
  await ui.press({ key: 'orgmem-back', link: { href: vsHref('page', 'back/orgmem-back') } })
  expect(await pageText(ui as never)).toContain('7 / 60')
  // a newest note's link: all notes, that one marked
  await ui.press({ key: 'live-om-note:6', link: { href: vsHref('do', 'orgmem-note/6') } })
  expect(await pageText(ui as never)).toContain('Organizational memory (org-mem)')
  expect(String((await ui.find({ key: 'orgmemRow:6' }))?.props.text)).toMatch(/^▶ /)
  // delete an older note (#1) there: the ▶ stays on the picked note, now #5, and goes to no other one
  await ui.press({ key: 'orgmemRow:1', link: { href: vsHref('do', 'orgmem-delete/1') } })
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(shown(String((await ui.find({ key: 'orgmemRow:5' }))?.props.text))).toMatch(/^▶ #5 · 2026-11-21/)
  expect((await ui.findAll({ type: 'Markdown' })).filter(m => /^▶ /.test(String(m.props.text))).length).toBe(1)
  await ui.unmount()
})
