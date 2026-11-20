// T-619: the Organizational memory page under Settings: an "Org-mem: n notes" row opens a page listing org-mem's
// notes newest first (number, task id, date, text); a note can be deleted there (x, then y), on the terminal and in
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

const VIEW = { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'review', test_commands: [] } }, tab: 'settings' }

const FILE = '/proj/.symcc/org-mem.md'

/** Three notes, oldest first, the middle one written by hand. */
const NOTES = '- T-3 2026-11-18: run one test file with scripts/test-files.sh\n\n- written by hand, no id\n- T-7 2026-11-20: the type check is separate\n'

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

/** Starts the session and mounts the panel on Settings with the Workers group open. */
async function settings($: Engine, surface: 'terminal' | 'vscode' = 'terminal') {
  await $.session.start({ cwd: '/proj' } as never)
  const ui = await $.ui.mount({ ...PANE, surface })
  if (surface === 'terminal') await ui.press({ key: 'group:Workers' })
  return ui
}

/** Every drawn text of the page, joined. */
const pageText = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; children?: unknown[] }[]> }) =>
  (await ui.findAll({ type: 'Text' })).flatMap(t => (t.children ?? []).filter(c => typeof c === 'string')).join('\n') +
  '\n' +
  (await ui.findAll({ type: 'Markdown' })).map(m => String(m.props.text ?? '')).join('\n')

test('T-619: Settings has an Org-mem row with the count; its page lists the notes newest first with id and date; x then y deletes exactly that line', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  const ui = await settings($)
  expect((await ui.find({ key: 'settings-orgmem' }))?.props.label).toBe('Org-mem: 3 notes')
  await ui.press({ key: 'settings-orgmem' })
  expect(await ui.find({ type: 'Text', text: /▍Organizational memory \(org-mem\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Learned:.*\.symcc\/org-mem\.md.*newest 60 lines/ })).toBeDefined()
  // newest (last in the file) first; each row its number, task id and date, then the text
  const rows = (await ui.findAll({ type: 'Button' })).map(b => String(b.key ?? '')).filter(k => k.startsWith('orgmemRow:'))
  expect(rows).toEqual(['orgmemRow:3', 'orgmemRow:2', 'orgmemRow:1'])
  expect((await ui.find({ key: 'orgmemRow:3' }))?.props.label).toBe('#3 · T-7 · 2026-11-20: the type check is separate')
  expect((await ui.find({ key: 'orgmemRow:2' }))?.props.label).toBe('#2 · written by hand: written by hand, no id')
  expect((await ui.find({ key: 'orgmemRow:1' }))?.props.label).toBe('#1 · T-3 · 2026-11-18: run one test file with scripts/test-files.sh')
  expect(await ui.find({ type: 'Text', text: /↑↓ move · x delete · t s c views · b back/ })).toBeDefined()
  // Enter on note 2 asks first; Cancel leaves the file alone
  await ui.press({ key: 'orgmemRow:2' })
  expect(await ui.find({ type: 'Text', text: 'Delete note #2 · written by hand from .symcc/org-mem.md?' })).toBeDefined()
  await ui.press({ key: 'orgmem-delete-cancel' })
  expect(await ui.find({ key: 'orgmem-delete-box' })).toBeUndefined()
  expect(files[FILE]).toBe(NOTES)
  // Delete (x) asks about a note, Yes deletes exactly that line (the blank line and the others stay as written)
  await ui.press({ key: 'orgmemRow:2' })
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(files[FILE]).toBe('- T-3 2026-11-18: run one test file with scripts/test-files.sh\n\n- T-7 2026-11-20: the type check is separate\n')
  expect(await ui.find({ key: 'orgmemRow:3' })).toBeUndefined()
  expect((await ui.find({ key: 'orgmemRow:2' }))?.props.label).toBe('#2 · T-7 · 2026-11-20: the type check is separate')
  // the x key's Button asks about the note under the focus (here the first, newest one)
  expect(await ui.find({ key: 'orgmem-delete' })).toBeDefined()
  await ui.press({ key: 'orgmem-delete' })
  expect(await ui.find({ type: 'Text', text: /^Delete note #2 · T-7 · 2026-11-20/ })).toBeDefined()
  // Back goes to Settings, whose row has the new count
  await ui.press({ key: 'orgmem-delete-cancel' })
  await ui.press({ key: 'orgmem-back' })
  expect((await ui.find({ key: 'settings-orgmem' }))?.props.label).toBe('Org-mem: 2 notes')
  await ui.unmount()
})

test('T-619: with no org-mem file the row says 0 notes and the page says "No notes yet." with no delete key', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, null)
  const ui = await settings($)
  expect((await ui.find({ key: 'settings-orgmem' }))?.props.label).toBe('Org-mem: 0 notes')
  await ui.press({ key: 'settings-orgmem' })
  expect(await ui.find({ type: 'Text', text: /No notes yet\./ })).toBeDefined()
  expect(await ui.find({ key: 'orgmem-delete' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^t s c views · b back$/ })).toBeDefined()
  await ui.unmount()
})

test('T-619: VS Code: the Organizational memory link opens the page; a note\'s Delete link asks, Yes deletes that line', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  const ui = await settings($, 'vscode')
  const row = await ui.find({ key: 'settings-orgmem' })
  expect(String(row?.props.text)).toContain('Organizational memory')
  expect(String(row?.props.text)).toContain('3 notes')
  await ui.press({ key: 'settings-orgmem', link: { href: vsHref('page', 'orgmem') } })
  const text = await pageText(ui as never)
  expect(text).toContain('Organizational memory (org-mem)')
  // newest first: #3 before #2 before #1
  expect(text.indexOf('#3 · T-7 · 2026-11-20')).toBeGreaterThanOrEqual(0)
  expect(text.indexOf('#3 · T-7 · 2026-11-20')).toBeLessThan(text.indexOf('#2 · written by hand'))
  expect(text.indexOf('#2 · written by hand')).toBeLessThan(text.indexOf('#1 · T-3 · 2026-11-18'))
  expect(text).toContain('run one test file with scripts/test-files.sh')
  await ui.press({ key: 'orgmemRow:1', link: { href: vsHref('do', 'orgmem-delete/1') } })
  expect(await ui.find({ key: 'orgmem-delete-yes' })).toBeDefined()
  await ui.press({ key: 'orgmem-delete-yes' })
  expect(files[FILE]).toBe('\n- written by hand, no id\n- T-7 2026-11-20: the type check is separate\n')
  await ui.unmount()
})

test('T-619: VS Code with no notes says "No notes yet."', async ($, on) => {
  stateOf(on, VIEW)
  fakeOrgMem(on, '')
  const ui = await settings($, 'vscode')
  await ui.press({ key: 'settings-orgmem', link: { href: vsHref('page', 'orgmem') } })
  expect(await pageText(ui as never)).toContain('No notes yet.')
  await ui.unmount()
})

test('T-619: /symcc-settings orgmem delete N deletes note N; a wrong number deletes nothing', async ($, on) => {
  stateOf(on, VIEW)
  const files = fakeOrgMem(on, NOTES)
  await $.session.start({ cwd: '/proj' } as never)
  const r = String((await $.command.run(slash('symcc-settings', 'orgmem delete 3'))).text)
  expect(r).toContain('Deleted note 3 from .symcc/org-mem.md (T-7 2026-11-20)')
  expect(files[FILE]).toBe('- T-3 2026-11-18: run one test file with scripts/test-files.sh\n\n- written by hand, no id\n')
  const bad = String((await $.command.run(slash('symcc-settings', 'orgmem delete 9'))).text)
  expect(bad).toContain('No note 9')
  expect(files[FILE]).toBe('- T-3 2026-11-18: run one test file with scripts/test-files.sh\n\n- written by hand, no id\n')
})
