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
import { emptyBoard, showsHeader,type BoardPage } from '../hooks/board'
import { textWidth } from '../hooks/core/width'

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it (and redraws). */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seed ? { value: { value: seed[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
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
  const mine = (p: string) => p.startsWith('/proj/.symcc/org-mem') || p === '/proj/.symcc/board.json'
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
const omHead = async (ui: { drawn: () => Promise<unknown> }) => pageLines(await ui.drawn()).find(l => l.startsWith('─── ❯ ORGANIZATIONAL MEMORY'))

/** Every drawn text of the page, joined. */
const pageText = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; children?: unknown[] }[]> }) =>
  (await ui.findAll({ type: 'Text' })).flatMap(t => (t.children ?? []).filter(c => typeof c === 'string')).join('\n') +
  '\n' +
  (await ui.findAll({ type: 'Markdown' })).map(m => String(m.props.text ?? '')).join('\n')

test('T-687: Settings no longer lists org-mem (terminal and VS Code); the Workers group has only Roles and Task types', async ($, on) => {
  stateOf(on, SETTINGS_VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($)
  // T-773: the session start opens the board on Live; go to Settings
  await ui.press({ key: 'tab-settings' })
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

test('T-687, T-718, T-866: the Live tab ends with the Organizational memory section (count, "newest [all]"), no key hint line and no m key; [all] opens the page, Back returns to the Live tab', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($)
  // T-866: no hidden m Button, no "m org-mem" in the footer, no "↑↓ move · Enter open topic" line
  expect(await ui.find({ key: 'live-orgmem' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).some(b => b.props.hotkey === 'm')).toBe(false)
  const lines = pageLines(await ui.drawn())
  expect(lines.some(l => l.includes('Enter open topic'))).toBe(false)
  expect(lines.some(l => l.includes('m org-mem') || l.includes('m all notes'))).toBe(false)
  expect(lines).toContain(' newest [all]')
  expect((await omHead(ui))).toContain('3 / 60')
  // at the bottom: after the Today section
  const nodes = await ui.findAll({})
  const at = nodes.findIndex(n => n.key === 'live-om-all')
  expect(at).toBeGreaterThan(nodes.findIndex(n => String(n.text ?? '').includes('sent back')))
  expect(nodes.slice(at + 1).some(n => String(n.text ?? '').includes('sent back'))).toBe(false)
  // [all] is a plain ↑↓ row Button drawn "[all]"
  const all = await ui.find({ key: 'live-om-all' })
  expect([all?.props.plain, all?.props.label, all?.props.hotkey]).toEqual([true, 'all', undefined])
  await ui.press({ key: 'live-om-all' })
  expect(await ui.find({ type: 'Text', text: /^Organizational memory \(org-mem\)$/ })).toBeDefined()
  expect(await ui.find({ key: 'live-om-all' })).toBeUndefined()
  await ui.press({ key: 'orgmem-back' })
  expect((await omHead(ui))).toContain('3 / 60')
  expect(await ui.find({ type: 'Text', text: /agents \d+\/\d+ busy/ })).toBeDefined()
  await ui.unmount()
})

/** T-704: walks one surface's board through its pages, from the Tasks list to a task's page and back, the tabs, the org-mem
 *  page and back, and checks that each draws the board header exactly when core's showsHeader says so. */
async function headerWalk($: Engine, on: On, surface: 'terminal' | 'vscode') {
  const task = { id: 'T-1', title: 'A task', details: '', files: [], status: 'todo', note: '', priority: 1, after: [], attempts: 0, timeline: [], branch: null, created_at: '', updated_at: '' }
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
  const tab = (t: 'tasks' | 'live' | 'scouts' | 'settings') => (vs ? ui.press({ key: `tab-${t}` }) : ui.press({ key: `tab-key-${t}` }))
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
  await (vs ? ui.press({ key: 'live-om-all', link: { href: vsHref('page', 'orgmem') } }) : ui.press({ key: 'live-om-all' }))
  expect(await pageText(ui as never)).toContain('Organizational memory (org-mem)')
  await check('orgmem')
  // T-704: the org-mem page is an opened page now (from Live), so no header on it
  expect([surface, await drawn()]).toEqual([surface, false])
  await ui.press({ key: 'orgmem-back' })
  expect(await ui.find({ key: 'live-om-all' })).toBeDefined()
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
  await ui.press({ key: 'live-om-all' })
  expect(await ui.find({ type: 'Text', text: /^Organizational memory \(org-mem\)$/ })).toBeDefined()
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

test('T-790: the terminal page has the shared detail header: "‹ [Live]" and "3 / 60", title, subtitle, "[Delete]" (no key in it), a thin rule, then ▍About and ▍Notes; x and b still work', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($)
  await ui.press({ key: 'live-om-all' })
  const lines = pageLines(await ui.drawn())
  const at = lines.findIndex(l => l.startsWith('‹ [Live]'))
  expect(at).toBeGreaterThanOrEqual(0)
  expect(lines[at]).toMatch(/^‹ \[Live\] +3 \/ 60$/)
  expect(lines.slice(at + 1, at + 4)).toEqual(['Organizational memory (org-mem)', 'Notes shared with workers, checkers and scouts', '[Delete]'])
  expect(lines[at + 4]).toMatch(/^─+$/)
  expect(lines[at + 5]).toBe('▍About')
  expect(lines[at + 6]).toMatch(/^ Notes for the agents: symcc puts /)
  const notes = lines.findIndex(l => l === '▍Notes')
  expect(notes).toBeGreaterThan(at + 6)
  expect(lines[notes + 1]).toContain('#3 · 2026-11-20')
  // the old Back button is gone; the keys are in hidden Buttons
  expect(lines.some(l => l.includes('Back (b)') || l.includes('Delete (x)'))).toBe(false)
  expect((await ui.find({ key: 'orgmem-back' }))?.props.label).toBe('Live')
  expect((await ui.find({ key: 'orgmem-back-key' }))?.props.hotkey).toBe('b')
  expect((await ui.find({ key: 'orgmem-delete-key' }))?.props.hotkey).toBe('x')
  // the focus on the newest note, not on the buttons
  const focused = (await ui.findAll({ type: 'Button' })).filter(b => b.props.autoFocus === true).map(b => String(b.key ?? ''))
  expect(focused).toEqual(['orgmemRow:3'])
  // x asks about the focused note; while it asks there is no Delete; b goes back to Live
  await ui.press({ key: 'orgmem-delete-key' })
  expect(await ui.find({ type: 'Text', text: /^Delete note #3 · 2026-11-20/ })).toBeDefined()
  expect(await ui.find({ key: 'orgmem-delete' })).toBeUndefined()
  await ui.press({ key: 'orgmem-delete-cancel' })
  await ui.press({ key: 'orgmem-back-key' })
  expect((await omHead(ui))).toContain('3 / 60')
  await ui.unmount()
})

test('T-790: VS Code: the org-mem page has the same header (back button, count, title, subtitle, Delete button, divider) then About and Notes', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($, 'vscode')
  await ui.press({ key: 'live-om-all', link: { href: vsHref('page', 'orgmem') } })
  const text = await pageText(ui as never)
  for (const w of ['Organizational memory (org-mem)', 'Notes shared with workers, checkers and scouts', '3 / 60', 'About', 'Notes']) expect(text).toContain(w)
  expect(text).not.toContain('▍')
  expect(await ui.find({ key: 'vs-header-rule' })).toBeUndefined()
  expect((await ui.find({ key: 'orgmem-delete' }))?.props.label).toBe('Delete')
  await ui.press({ key: 'orgmem-delete' })
  expect(await ui.find({ key: 'orgmem-delete-yes' })).toBeDefined()
  await ui.unmount()
})

test('T-742: VS Code: the "← Live" link comes before the first note', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($, 'vscode')
  await ui.press({ key: 'live-om-all', link: { href: vsHref('page', 'orgmem') } })
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
  expect(pageLines(await ui.drawn()).find(l => l.includes('No notes'))).toBe('   No notes yet.')
  await ui.press({ key: 'live-om-all' })
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
  // T-1003: one line: the name and "3 / 60", then an "All notes" link
  expect((await ui.find({ key: 'live-om-head' }))?.text).toBe('Organizational memory3 / 60')
  const allButton = await ui.find({ key: 'live-om-all' })
  expect([allButton?.type, allButton?.props.text]).toEqual(['Markdown', `[All notes](${vsHref('page', 'orgmem')})`])
  // at the bottom of the Live tab, just above its footer
  const all = (await ui.findAll({})).map(n => String(n.key ?? ''))
  expect(all.indexOf('live-om-all')).toBeGreaterThan(all.indexOf('live-today-rows'))
  expect(all.indexOf('live-hint-footer')).toBeGreaterThan(all.indexOf('live-om-all'))
  await ui.press({ key: 'live-om-all', link: { href: vsHref('page', 'orgmem') } })
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
  expect((await ui.find({ key: 'orgmem-back' }))?.props.label).toBe('Live')
  await ui.press({ key: 'orgmem-back' })
  expect(await pageText(ui as never)).toContain('2 / 60')
  await ui.unmount()
})

test('T-619: VS Code with no notes says "No notes yet."', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, '')
  const ui = await settings($, 'vscode')
  await ui.press({ key: 'live-om-all', link: { href: vsHref('page', 'orgmem') } })
  expect(await pageText(ui as never)).toContain('No notes yet.')
  await ui.unmount()
})

test('T-619: /symcc-settings orgmem delete N deletes note N; a wrong number deletes nothing', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  files['/proj/.symcc/board.json'] = JSON.stringify(emptyBoard()) // T-795: a project with a board
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
    // T-747, T-789: an "ORGANIZATIONAL MEMORY" heading with the count and a thin rule (no bar) on it, an empty line under it, the lines under that indented (T-767: by 1)
    const head = lines.findIndex(l => l.startsWith('─── ❯ ORGANIZATIONAL MEMORY   8 / 60 ─'))
    expect(head).toBeGreaterThan(0)
    expect(textWidth(lines[head]!)).toBe(bodyColumns)
    expect(lines[head - 1]!.trim()).toBe('')
    expect(lines[head + 1]!.trim()).toBe('')
    expect(lines[head + 2]).toBe(' newest [all]')
    expect(lines[head + 3]).toMatch(/^ {3}— +unsorted {2}a note written/)
    expect(lines[head + 4]).toMatch(/^ {3}11-21 {2}git +Use a plain path/)
    expect(lines[head + 5]).toMatch(/^ {3}11-21 {2}tests +In tests, put/)
    expect(lines[head + 6]).toBe(' topics')
    const grid = lines.slice(head + 7, lines.findIndex((l, i) => i > head + 7 && !l.startsWith('   ')))
    expect(grid.join(' ')).toMatch(/tests +3/)
    expect(grid.join(' ')).toMatch(/git +2/)
    expect(grid.join(' ')).toMatch(/vs code · panel +1/)
    expect(grid.at(-1)).toMatch(/unsorted +1$/)
    expect(grid.length).toBe(bodyColumns === 100 ? 2 : 3)
    // T-866: no key hint line under the section
    expect(lines.join('\n')).not.toContain('Enter open topic')
    // [all], the newest notes and the topics are ↑↓ rows (Buttons) that open the page
    const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).filter(k => k.startsWith('live-om-'))
    expect(keys).toEqual(['live-om-all', 'live-om-note:8', 'live-om-note:7', 'live-om-note:6', 'live-om-topic:tests', 'live-om-topic:git', 'live-om-topic:opencode', 'live-om-topic:vs code · panel', 'live-om-topic:unsorted'])
    await ui.unmount()
  }
})

test('T-718: Enter on a topic opens the page of its notes only, Back returns to Live; Delete there deletes the right note; Enter on a newest note opens all notes on it', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, TOPIC_NOTES)
  const ui = await settings($)
  await ui.press({ key: 'live-om-topic:tests' })
  expect(await ui.find({ type: 'Text', text: /^Organizational memory · tests$/ })).toBeDefined()
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
  // a newest note: all notes, the focus on it; [all]: all notes, the focus on the newest
  await ui.press({ key: 'live-om-note:6' })
  expect(await ui.find({ type: 'Text', text: /^Organizational memory \(org-mem\)$/ })).toBeDefined()
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
  await ui.press({ key: 'live-om-all' })
  expect((await ui.find({ key: 'orgmemRow:6' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('T-718, T-1003: VS Code draws the org-mem section as one line at 40 and 100 columns; All notes opens the page, delete there deletes the right note, "← Live" returns', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, TOPIC_NOTES)
  await $.session.start({ cwd: '/proj' } as never)
  for (const bodyColumns of [40, 100]) {
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode', props: { ...PANE.props, bodyColumns } })
    // one line: no notes, no topics, no rule, no blank row, no fold
    expect((await ui.find({ key: 'live-om-head' }))?.text).toBe('Organizational memory8 / 60')
    expect(await ui.find({ key: 'live-om-note:8' })).toBeUndefined()
    expect(await ui.find({ key: 'live-om-topic:tests' })).toBeUndefined()
    const section = (await ui.find({ key: 'live-om' })) as unknown as Node
    expect(((section.children ?? []) as Node[]).length).toBe(2)
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'live-om-all', link: { href: vsHref('page', 'orgmem') } })
  const text = await pageText(ui as never)
  expect(text).toContain('Organizational memory (org-mem)')
  expect(text).toContain('#6 · 2026-11-21')
  await ui.press({ key: 'orgmemRow:3', link: { href: vsHref('do', 'orgmem-delete/3') } })
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(files[FILE]).toBe(TOPIC_NOTES.replace('- 2026-11-19 [tests] Snapshot pictures are made again with snapshotEntry\n', ''))
  await ui.press({ key: 'orgmem-back' })
  expect(await pageText(ui as never)).toContain('7 / 60')
  expect((await ui.findAll({ type: 'Button' })).some(b => b.props.hotkey === 'm')).toBe(false)
  await ui.unmount()
})

/** An org-mem file of n dated notes. */
const manyNotes = (n: number) => Array.from({ length: n }, (_, i) => `- 2026-11-20 [tests] note number ${i + 1}`).join('\n') + '\n'

test('T-772: the terminal Live tab draws the org-mem meter at 30 / 60 and 60 / 60 in the same calm colors (dim count, the quiet bar color), never the warning color', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, manyNotes(30))
  await $.session.start({ cwd: '/proj' } as never)
  const looks: string[] = []
  for (const n of [30, 60]) {
    files[FILE] = manyNotes(n)
    const ui = await $.ui.mount(PANE)
    const texts = await ui.findAll({ type: 'Text' })
    const count = texts.find(t => (t.children ?? []).join('') === `${n} / 60`)
    // T-810: no bar any more
    expect(texts.some(t => /▕[█░]+▏/.test((t.children ?? []).join('')))).toBe(false)
    expect([n, count?.props.color]).toEqual([n, 'inactive'])
    looks.push(`${count?.props.color}`)
    await ui.unmount()
  }
  expect(looks[0]).toBe(looks[1]!)
})

test('T-772: VS Code draws the org-mem meter at 30 / 60 and 60 / 60 in the same calm color: a grey count badge (T-973), no bar (T-810), never the warning ink', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, manyNotes(30))
  await $.session.start({ cwd: '/proj' } as never)
  for (const n of [30, 60]) {
    files[FILE] = manyNotes(n)
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    const count = await ui.find({ key: 'live-om-head' })
    expect([n, count?.type, count?.text, count?.props.backgroundColor, count?.props.borderColor]).toEqual([n, 'Box', `Organizational memory${n} / 60`, undefined, undefined])
    expect((await ui.findAll({ type: 'Svg' })).some(x => String(x.props.alt).endsWith('of at most 60'))).toBe(false)
    await ui.unmount()
  }
})

test('T-819: the org-mem topic labels (the newest rows, and the topic grid on the terminal) are in the info blue "ide", not green or the accent; "unsorted" stays dim', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, '- 2026-11-18 [tests] run one test file with scripts/test-files.sh\n- 2026-11-20 [git] the guard refuses a repo in the folder\n- a note by hand\n')
  await $.session.start({ cwd: '/proj' } as never)
  const textColors = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; children?: unknown[] }[]> }, word: string) =>
    (await ui.findAll({ type: 'Text' })).filter(t => (t.children ?? []).join('').trim() === word).map(t => t.props.color)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // the newest row and the grid cell of each topic
  expect(await textColors(term, 'git')).toEqual(['ide', 'ide'])
  expect(await textColors(term, 'tests')).toEqual(['ide', 'ide'])
  expect(await textColors(term, 'unsorted')).toEqual(['inactive', 'inactive'])
  await term.unmount()
})

// T-1009: the org-mem page in VS Code has no tab header, no rule and no border; Delete asks inline
for (const bodyColumns of [40, 64, 100])
  test(`T-1009: VS Code org-mem page: no tab header, rules or borders, Delete asks inline, nothing wider than the panel (${bodyColumns} columns)`, async ($, on) => {
    stateOf(on, VIEW)
    fakeOrgMem(on, NOTES)
    await $.session.start({ cwd: '/proj' } as never)
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    await ui.press({ key: 'live-om-all', link: { href: vsHref('page', 'orgmem') } })
    await ui.press({ key: 'orgmemRow:3', link: { href: vsHref('do', 'orgmem-delete/3') } })
    const all = await ui.findAll({})
    expect(all.filter(n => n.props?.borderStyle)).toEqual([])
    expect(all.some(n => /^(tab-|vs-header)/.test(String(n.key ?? '')))).toBe(false)
    const texts = all.filter(n => n.type === 'Text').map(n => String(n.text ?? ''))
    expect(texts.some(t => /[─▍]/.test(t))).toBe(false)
    expect(texts).toContain('Delete #3?')
    expect(await ui.find({ key: 'orgmem-delete-box' })).toBeDefined()
    expect((await ui.find({ key: 'orgmem-delete-yes' }))?.props.label).toBe('Yes, delete')
    expect((await ui.find({ key: 'orgmem-delete-cancel' }))?.props.text).toBe(`[Cancel](${vsHref('do', 'orgmem-delete/cancel')})`)
    for (const n of all) {
      if (typeof n.props?.width === 'number') expect(n.props.width / (n.type === 'Svg' ? 8 : 1), String(n.key)).toBeLessThanOrEqual(bodyColumns)
    }
    await ui.unmount()
  })
