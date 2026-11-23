// T-899: typing a follow-up question into the Ask more box of an answered investigation can never press a page
// action (the owner typed while the lead's pop-up held the keyboard, and the letter "a" pressed Done). While the box
// is open no Button on the page has a key; Done and Keep as a note never have one on an answered investigation.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { ICON } from '../hooks/name'
import { inProject } from './project'
import { ran, readText, entry, pause } from './fakes'
import { hist } from './history-fixture'
import { manual } from '../hooks/app/tools'

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const R1 = '.symcc/reports/T-1-try-1.md'
const answered = {
  id: 'T-1', title: 'Why is the cache slow', details: 'Find out why.', files: [], status: 'review', note: 'answered; waiting for you to read it', order: 1, after: [], attempts: 1,
  history: hist('try 1: answered: The cache is never cleared.'), branch: 'symcc/T-1', merge_into: 'main', origin: { by: 'owner', why: 'x', at: '' }, created_at: '', updated_at: '',
  kind: 'investigation', role: 'researcher', answer: 'The cache is never cleared.', runs: [{ started: '2026-11-22T10:00:00.000Z', ended: '2026-11-22T10:10:00.000Z', report: R1 }],
}

/** The answered investigation's page opened, its board on file; what is written is kept. */
function seed(on: On) {
  const written: Record<string, string> = {}
  const keys = new Set<string>()
  on('state.set', (_, e, next) => (keys.add(e.key), next(e)))
  inProject(on)
  const seeded: Record<string, unknown> = { opened: 'T-1', view: { shape: 'view-1', value: { tasks: [answered], working: [], scouts: [], mode: 'auto', test_commands: [] } } }
  on('state.get', (_, e, next) => (keys.has(e.key) ? next(e) : e.key in seeded ? { value: { value: seeded[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
  const board = JSON.stringify({ version: 1, next_id: 2, tasks: [answered], mode: 'auto', test_commands: [] })
  const report = 'The cache is never cleared.\n'
  on('fs.exists', (_, e, next) => (/\/board\.json$/.test(e.path) || /T-1-try-1\.md$/.test(e.path) ? { value: true } : /\/board\.lock$/.test(e.path) ? { value: false } : next(e)))
  on('fs.list', (_, e, next) => (/\.symcc$/.test(e.path) ? { value: [entry('board.json')] } : next(e)))
  on('fs.read', (_, e, next) => (/\/board\.json$/.test(e.path) ? readText(board) : /T-1-try-1\.md$/.test(e.path) ? readText(report) : next(e)))
  on('fs.write', (_, e) => ((written[e.path] = String(e.text)), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: ran() }))
  on('ui.toast', () => ({ value: undefined }))
  return written
}

type Found = { props: Record<string, unknown> }
/** The keys of every Button drawn on the page (hidden ones too). */
const hotkeys = async (ui: { findAll: (q: { type: string }) => Promise<Found[]> }) =>
  (await ui.findAll({ type: 'Button' })).map(b => b.props.hotkey).filter((k): k is string => typeof k === 'string')

/** The boards saved so far, oldest first. */
const saved = (written: Record<string, string>) => Object.entries(written).filter(([p]) => /board\.json\..*\.tmp$/.test(p)).map(([, text]) => JSON.parse(text) as { tasks: { id: string; status: string; details: string }[] })

// Terminal only: the VS Code task page (hooks/claude/ui/vscode-task.tsx) gives its Buttons no letter keys at all, on
// main as well, so typed letters there can never press Done; a VS Code run of this test would pass without the fix.
for (const surface of ['terminal'] as const)
  test(`T-899 ${surface}: Ask more opens the box; typing "a test question with a" fills it and presses nothing; Enter sends it to todo with the question`, async ($, on) => {
    const written = seed(on)
    const ui = await $.ui.mount({ ...PANE, surface })
    // Done and Keep as a note have no key at all; only Ask more's x (terminal)
    expect(await hotkeys(ui)).not.toContain('a')
    expect(await hotkeys(ui)).not.toContain('v')
    expect(await ui.find({ key: 'reject-reason' })).toBeUndefined()
    await ui.press({ key: 'ask-more' })
    expect((await ui.find({ key: 'reject-reason' }))?.props.label).toBe('Your follow-up question')
    // while the box is open, no Button on the page has a key: every typed letter belongs to the box
    expect(await hotkeys(ui)).toEqual([])
    // and the footer names only the box's way out, no page key that no longer works
    if (surface === 'terminal') expect((await ui.find({ key: 'task-keys-footer' }))?.text).toMatch(/[─-]+ *Enter sends to todo · Enter on empty cancels$/)
    const words = 'a test question with a'
    await ui.input({ key: 'reject-reason', text: words, kind: 'change' })
    expect(await ui.find({ key: 'reject-reason' })).toBeDefined()
    expect(await hotkeys(ui)).toEqual([])
    // nothing was sent: the task is still in review (a save, if any, only moved the old board file to today's shape)
    expect(saved(written).map(b => b.tasks.find(t => t.id === 'T-1')?.status).filter(s => s !== 'review')).toEqual([])
    await ui.input({ key: 'reject-reason', text: words })
    const t1 = () => saved(written).at(-1)?.tasks.find(t => t.id === 'T-1')
    for (let i = 0; i < 200 && t1()?.status !== 'todo'; i++) await pause(5)
    const last = t1()!
    expect(last.status).toBe('todo')
    expect(last.details).toContain(words)
    // the box closed once it was sent
    await ui.redraw()
    expect(await ui.find({ key: 'reject-reason' })).toBeUndefined()
    await ui.unmount()
  })

test('the help manual no longer names a or v for Done and Keep as a note on the Claude Code board; x still opens Ask more', () => {
  const text = manual('')
  expect(text).not.toContain('a done')
  expect(text).not.toContain('v keep as a note')
  expect(text).toContain('Done and Keep as a note (adds a docs task) are buttons with no letter key')
  expect(text).toContain('x ask more')
})
