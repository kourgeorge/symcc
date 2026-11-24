// T-458: Approve (and Done, Keep as a note, Merge now) gives feedback at once. The page redraws with a
// "Merging… (tests running)" line in place of its review buttons while the merge runs, a second press starts
// nothing, and once it ends the page shows the result. The merge here is slow on purpose: its first read of the
// board file waits until the test lets it go.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { ICON } from '../hooks/name'
import { inProject } from './project'
import { ran, readText, entry, pause } from './fakes'
import { MERGING_LINE } from '../hooks/claude/ui/task-page'

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', priority: 0, after: [], attempts: 1, history: [], branch: `symcc/${id}`, merge_into: 'main', origin: { by: 'lead', why: 'a test', at: '' }, created_at: '', updated_at: '', ...extra })

/** Holds the next read of board.json (the merge's first step) while `wait` is set and `hold` is on; `reads` counts the held ones. */
type Gate = { wait?: Promise<void>; hold?: boolean; reads: number }

/** The board with `t` on it, its page opened in the panel; returns the toasts shown. */
function seed(on: On, t: ReturnType<typeof task>, gate: Gate) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  inProject(on)
  const seeded: Record<string, unknown> = { opened: t.id, view: { shape: 'view-1', value: { tasks: [t], working: [], scouts: [], mode: 'review', test_commands: ['true'] } } }
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seeded ? { value: { value: seeded[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
  const board = JSON.stringify({ version: 1, next_id: 10, tasks: [t], mode: 'review', test_commands: ['true'] })
  on('fs.exists', (_, e, next) => (/\/board\.json$/.test(e.path) ? { value: true } : /\/board\.lock$/.test(e.path) ? { value: false } : next(e)))
  on('fs.list', (_, e, next) => (/\.symcc$/.test(e.path) ? { value: [entry('board.json')] } : next(e)))
  on('fs.read', async (_, e, next) => {
    if (!/\/board\.json$/.test(e.path)) return next(e)
    if (gate.hold && gate.wait) {
      gate.hold = false
      gate.reads++
      await gate.wait
    }
    return readText(board)
  })
  on('fs.write', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: ran() }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  return toasts
}


type Ui = { find: (q: { type?: string; key?: string; text?: RegExp }) => Promise<unknown> }
const MERGING = new RegExp(`^${MERGING_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
/** The merging line on the page, if drawn. */
const mergingShown = (ui: Ui) => ui.find({ type: 'Text', text: MERGING })

/** Lets the stubbed merge go on and waits until the press's work ends (the merging line is gone). */
async function finish(ui: Ui, release: () => void) {
  release()
  for (let i = 0; i < 400 && (await mergingShown(ui)); i++) await pause(5)
}

for (const surface of ['terminal', 'vscode'] as const)
  test(`${surface}: pressing Approve redraws at once with the merging line and no review buttons; a second press starts nothing; the result shows after`, async ($, on) => {
    const gate: Gate = { reads: 0 }
    const toasts = seed(on, task('T-5', 'review', 'Blue button'), gate)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'approve' })).toBeDefined()
    expect(await mergingShown(ui)).toBeUndefined()
    let release = () => {}
    gate.wait = new Promise<void>(r => (release = r))
    gate.hold = true
    await ui.press({ key: 'approve' })
    // at once, while the (held) merge has not finished: the merging line, no Approve or Reject
    expect(gate.reads).toBe(1)
    expect(await mergingShown(ui)).toBeDefined()
    expect(await ui.find({ key: 'approve' })).toBeUndefined()
    expect(await ui.find({ key: 'reject' })).toBeUndefined()
    expect(toasts.filter(x => /Approving T-5: running the tests, then merging…/.test(x)).length).toBe(1)
    // a redraw while it runs still draws the merging state, so the buttons can't come back for a second press
    await ui.redraw()
    expect(await mergingShown(ui)).toBeDefined()
    expect(await ui.find({ key: 'approve' })).toBeUndefined()
    await expect(ui.press({ key: 'approve' })).rejects.toThrow()
    expect(toasts.filter(x => /Approving T-5/.test(x)).length).toBe(1)
    await finish(ui, release)
    gate.wait = undefined
    expect(await mergingShown(ui)).toBeUndefined()
    // the result: here git can't run, so it stays in review and says why, on the page and in a toast
    const said = toasts.at(-1) ?? ''
    expect(said).toMatch(/T-5 stays in review/)
    expect(await ui.find({ type: 'Text', text: /^T-5 stays in review/ })).toBeDefined()
    expect(await ui.find({ key: 'approve' })).toBeDefined()
    await ui.unmount()
  })

for (const surface of ['terminal', 'vscode'] as const)
  test(`${surface}: while the merge runs, the changes view shows no approve or reject key either`, async ($, on) => {
    const gate: Gate = { reads: 0 }
    seed(on, task('T-5', 'review', 'Blue button'), gate)
    const ui = await $.ui.mount({ ...PANE, surface })
    let release = () => {}
    gate.wait = new Promise<void>(r => (release = r))
    gate.hold = true
    await ui.press({ key: 'approve' })
    expect(await mergingShown(ui)).toBeDefined()
    // Show changes stays while it merges (core's taskActions, T-575), on both surfaces; the terminal's changes view is checked
    expect(await ui.find({ key: 'show-changes' })).toBeDefined()
    if (surface === 'terminal') await ui.press({ key: 'show-changes' })
    await ui.redraw()
    // the changes view is open (its Back button), but offers neither approve nor reject while the merge runs
    if (surface === 'terminal') expect(await ui.find({ key: 'diff-back' })).toBeDefined()
    expect(await ui.find({ key: 'approve' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\ba approve\b/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\bx reject\b/ })).toBeUndefined()
    if (surface === 'terminal') await ui.press({ key: 'diff-back' })
    await finish(ui, release)
    // a failed approve: its result is drawn in the warning color
    expect((await ui.find({ type: 'Text', text: /^T-5 stays in review/ }))?.props.color).toBe('warning')
    await ui.unmount()
  })

for (const surface of ['terminal', 'vscode'] as const)
  test(`${surface}: a Done that kept the branch because git could not tell is drawn as a success, not by its words`, async ($, on) => {
    const gate: Gate = { reads: 0 }
    const toasts = seed(on, task('T-6', 'review', 'Why is the cache slow', { kind: 'investigation', role: 'researcher', note: 'answered; waiting for you to read it', answer: 'The cache is never cleared.' }), gate)
    const ui = await $.ui.mount({ ...PANE, surface })
    let release = () => {}
    gate.wait = new Promise<void>(r => (release = r))
    gate.hold = true
    await ui.press({ key: 'done' })
    expect(await ui.find({ type: 'Text', text: /^Marking it done…$/ })).toBeDefined()
    expect(await ui.find({ key: 'done' })).toBeUndefined()
    release()
    for (let i = 0; i < 400 && (await ui.find({ type: 'Text', text: /^Marking it done…$/ })); i++) await pause(5)
    expect(toasts.at(-1) ?? '').toMatch(/T-6 done: .*could not tell/)
    const line = await ui.find({ type: 'Text', text: /^T-6 done: the answer was read/ })
    expect(line).toBeDefined()
    expect((line as { props: { color?: string } }).props.color).toBe('success')
    await ui.unmount()
  })

// T-614: right after an approve, before the merge's first step is on the board, the whole page says it runs:
// the Stage line says "prep", the Status row "doing" (T-647), none says
// "ready for review"
for (const surface of ['terminal', 'vscode'] as const)
  test(`${surface}: right after Approve the header's state line says doing and prep, and the Steps line prep`, async ($, on) => {
    const gate: Gate = { reads: 0 }
    seed(on, task('T-5', 'review', 'Blue button'), gate)
    const ui = await $.ui.mount({ ...PANE, surface })
    let release = () => {}
    gate.wait = new Promise<void>(r => (release = r))
    gate.hold = true
    await ui.press({ key: 'approve' })
    expect(await mergingShown(ui)).toBeDefined()
    const all = (await (ui as unknown as { findAll: (q: object) => Promise<{ text: string }[]> }).findAll({ type: 'Text' })).map(x => x.text)
    const page = all.join('\n')
    expect(page).not.toContain('ready for review')
    // T-751: the page header's state line (a chip in VS Code)
    if (surface === 'terminal') {
      expect(all).not.toContain('[✎ prep]')
      expect(all).toContain('▶ doing · prep   change · general · try 1/3   ◆ lead')
    } else expect(all).toContain('▶ doing · prep') // T-973: a padded Box pill, no space padding in the text
    // the Steps line: every step up to review done, then the approve's prep now
    expect(page).toMatch(/review ✓[\s\S]*● prep[\s\S]*merge/)
    await finish(ui, release)
    await ui.unmount()
  })
