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

test('T-687: the Live tab ends with an Organizational memory button (count, key m) just above the key hints; it opens the page, Back returns to the Live tab', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, NOTES)
  const ui = await settings($)
  const button = await ui.find({ key: 'live-orgmem' })
  expect(button?.props.label).toBe('Organizational memory (3 notes) (m)')
  expect(button?.props.hotkey).toBe('m')
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
  expect((await ui.find({ key: 'live-orgmem' }))?.props.label).toBe('Organizational memory (3 notes) (m)')
  expect(await ui.find({ type: 'Text', text: /agents \d+\/\d+ busy/ })).toBeDefined()
  await ui.unmount()
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
  expect(await ui.find({ type: 'Text', text: /↑↓ move · x delete · t l s c views · b back/ })).toBeDefined()
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
  expect((await ui.find({ key: 'live-orgmem' }))?.props.label).toBe('Organizational memory (2 notes) (m)')
  await ui.unmount()
})

test('T-619: with no org-mem file the button says 0 notes and the page says "No notes yet." with no delete key', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, null)
  const ui = await settings($)
  expect((await ui.find({ key: 'live-orgmem' }))?.props.label).toBe('Organizational memory (0 notes) (m)')
  await ui.press({ key: 'live-orgmem' })
  expect(await ui.find({ type: 'Text', text: /No notes yet\./ })).toBeDefined()
  expect(await ui.find({ key: 'orgmem-delete' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^t l s c views · b back$/ })).toBeDefined()
  await ui.unmount()
})

test('T-619, T-687: VS Code: the Live tab\'s Organizational memory link opens the page; a note\'s Delete link asks, Yes deletes that line; "← Live" returns', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  const ui = await settings($, 'vscode')
  const row = await ui.find({ key: 'live-orgmem' })
  expect(String(row?.props.text)).toContain('Organizational memory (3 notes)')
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
  expect(String((await ui.find({ key: 'live-orgmem' }))?.props.text)).toContain('Organizational memory (2 notes)')
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
