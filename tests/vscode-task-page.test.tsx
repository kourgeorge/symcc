// The task page in VS Code's side panel has its own wide layout (hooks/plugin/ui/vscode-task.tsx); on the terminal and
// the desktop it draws exactly as before (task-page-snapshot.ts holds the trees captured from the code before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0, plainTree, changedTree } from './board-fixture'
import { TASK_BEFORE } from './task-page-snapshot'
import { LONG_TITLE, RICH_IDS, RICH_TASKS, seedRich } from './task-page-fixture'
import { CLICK_HINT } from '../hooks/plugin/ui/surface'
import { reportPart } from '../hooks/plugin/ui/vscode-task'

type Node = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }

/** Every element of a drawn tree, depth first. */
function elements(tree: unknown): Node[] {
  const out: Node[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    out.push(n as Node)
    for (const c of (n as Node).children ?? []) walk(c)
  }
  walk(tree)
  return out
}
/** All the text of a tree: string children, Button and Input labels and placeholders, Markdown texts. */
function texts(tree: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') return void out.push(n)
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const e = n as Node
    for (const p of ['label', 'placeholder', 'text'] as const) if (typeof e.props?.[p] === 'string') out.push(e.props[p] as string)
    for (const c of e.children ?? []) walk(c)
  }
  walk(tree)
  return out
}
const KEY_HINTS = [/\[[a-z]\]:/, /Enter open/, /↑↓ move/, /Esc back/, /Enter sends/, /Enter on empty/, /Enter picks/, /\s\([a-z0-9]\)$/]

/** The action buttons each rich task shows in VS Code, in order, and the one primary (if any) on its page. */
const ACTIONS: Record<string, { keys: string[]; primary?: string }> = {
  'T-501': { keys: ['approve', 'reject', 'show-changes', 'drop', 'needs-review', 'copy'], primary: 'approve' },
  'T-502': { keys: ['retry', 'stash', 'role', 'drop', 'needs-review', 'copy'], primary: 'retry' },
  'T-503': { keys: ['drop', 'needs-review', 'copy'], primary: 'choice-1' },
  'T-504': { keys: ['pause', 'drop', 'needs-review', 'copy'] },
  'T-505': { keys: ['resume', 'stash', 'role', 'drop', 'needs-review', 'copy'], primary: 'resume' },
  'T-506': { keys: ['pause', 'stash', 'role', 'drop', 'needs-review', 'copy'] },
  'T-507': { keys: ['to-todo', 'role', 'drop', 'needs-review', 'copy'], primary: 'to-todo' },
  'T-508': { keys: ['copy'] },
  'T-509': { keys: ['retry', 'copy'] },
  'T-510': { keys: ['done', 'keep-note', 'ask-more', 'drop', 'needs-review', 'copy'], primary: 'done' },
  'T-511': { keys: ['drop', 'needs-review', 'copy'], primary: 'choice-1' },
}

for (const id of RICH_IDS) {
  test(`${id}'s task page on the terminal and the desktop draws exactly as before the VS Code task page`, async ($, on) => {
    seedRich(on, id)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(plainTree(await ui.drawn()), `${surface} ${id}`).toEqual(plainTree(TASK_BEFORE[`${surface} ${id}`]))
      await ui.unmount()
    }
  })

  test(`${id}'s task page in VS Code at width 50: whole text, its sections, only the fitting buttons, one primary at most`, async ($, on) => {
    seedRich(on, id)
    const t = RICH_TASKS.find(x => x.id === id)!
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    const tree = await ui.drawn()
    const all = texts(tree)
    // nothing is cut with "…"; the title is drawn whole in a Text that wraps
    expect(all.filter(s => s.includes('…')), id).toEqual([])
    const title = await ui.find({ type: 'Text', text: t.title })
    expect(title, id).toBeDefined()
    expect(title!.props.wrap).toBe('wrap')
    expect(t.title.startsWith(LONG_TITLE)).toBe(true)
    // the status line, then the sections
    expect((await ui.find({ key: 'vs-status' }))?.text, id).toMatch(new RegExp(`^${id}  `))
    const want = ['Title', 'Why / where it came from', 'What to do', 'Files it may change', 'Waits for', 'Time and cost']
    if (t.history.length) want.push('History (2, newest first)')
    if (t.attempts) want.push(t.status === 'doing' ? 'Report (try 1)' : 'Report (try 2, 2 of 2)') // the running try has no report yet
    if (t.status === 'failed') want.push('Why it failed')
    if (t.status === 'waiting') want.push('Question for you')
    for (const h of want) expect(all, `${id} ${h}`).toContain(h)
    // the details and the report are Markdown, given whole (the report: its first part)
    const md = elements(tree).filter(n => n.type === 'Markdown').map(n => String(n.props?.text))
    expect(md, id).toContain(t.details.trimEnd())
    // the action row: exactly the buttons that fit, and at most one primary on the page
    const row = await ui.find({ key: 'vs-actions' })
    expect(elements(row!.children).filter(n => n.type === 'Button').map(n => n.props?.key), id).toEqual(ACTIONS[id]!.keys)
    const primary = elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary').map(n => n.props?.key)
    expect(primary, id).toEqual(ACTIONS[id]!.primary ? [ACTIONS[id]!.primary] : [])
    // the tasks it waits for are buttons that open them; back to the list is a clear button; no key hints
    expect((await ui.find({ key: 'after-T-499' }))?.type).toBe('Button')
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('← Tasks')
    for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), `${id} ${re}`).toEqual([])
    expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
    await ui.unmount()
  })
}

// T-437: T-504's try is running, so its page shows running times; they follow the host's clock, not the computer's.
const TEN_MIN = 10 * 60_000
/** T-504's running times at T0 (in the snapshot) and 10 minutes later. */
const T504_LATER: [string, string][] = [
  ['" · 25m · 4.6k tokens in all ·"', '" · 35m · 4.6k tokens in all ·"'],
  ['"  try 2: 5m (running)"', '"  try 2: 15m (running)"'],
  ['"  total: 25m · 4.6k', '"  total: 35m · 4.6k'],
]

test("T-504's task page follows the host clock: 10 minutes later only its running times change", async ($, on) => {
  const clock = seedRich(on, 'T-504')
  await clock.set(T0 + TEN_MIN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(plainTree(await ui.drawn()), surface).toEqual(changedTree(TASK_BEFORE[`${surface} T-504`], T504_LATER))
    await ui.unmount()
  }
})

test("T-504's task page snapshot comparison still fails when the drawn tree really changes", async ($, on) => {
  seedRich(on, 'T-504')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const drawn = plainTree(await ui.drawn())
  expect(drawn).toEqual(plainTree(TASK_BEFORE['terminal T-504']))
  expect(drawn).not.toEqual(changedTree(TASK_BEFORE['terminal T-504'], [['"Runs (time and cost)"', '"Runs"']]))
  expect(drawn).not.toEqual(changedTree(TASK_BEFORE['terminal T-504'], [['"  try 2: 5m (running)"', '"  try 2: 6m (running)"']]))
  await ui.unmount()
})

test('in VS Code a long report shows its first part, and "Show all" shows the rest', async ($, on) => {
  seedRich(on, 'T-508')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const report = async () => String((await ui.find({ key: 'vs-report-md' }))?.props.text)
  expect(await report()).toMatch(/line 1 of/)
  expect(await report()).not.toMatch(/claude plugin test \. passed/)
  expect((await ui.find({ key: 'report-all' }))?.props.label).toMatch(/^Show all \(\d+ more lines\)$/)
  await ui.press({ key: 'report-all' })
  expect(await report()).toMatch(/claude plugin test \. passed/)
  expect((await ui.find({ key: 'report-all' }))?.props.label).toBe('Show less')
  // the other try's report, by its button
  await ui.press({ key: 'report-try-1' })
  expect(await report()).toBe('First try: the tests failed.')
  await ui.unmount()
})

test('in VS Code a waiting question shows plainly, with its answers as buttons and a box for your own', async ($, on) => {
  seedRich(on, 'T-503')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: /^Should the report show all of its lines/ })).toBeDefined()
  expect((await ui.find({ key: 'choice-1' }))?.props.label).toBe('Only the first part')
  expect((await ui.find({ key: 'choice-2' }))?.props.label).toBe('All of it')
  expect(await ui.find({ key: 'choice-3' })).toBeUndefined() // no "Answer…": the box is always there
  expect((await ui.find({ key: 'answer' }))?.type).toBe('Input')
  await ui.unmount()
})

test('in VS Code a file request shows the files, with Allow files and Don\'t allow', async ($, on) => {
  seedRich(on, 'T-511')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: '  hooks/board.ts' })).toBeDefined()
  expect((await ui.find({ key: 'choice-1' }))?.props.label).toBe('Allow files')
  expect((await ui.find({ key: 'choice-2' }))?.props.label).toBe("Don't allow")
  await ui.unmount()
})

test('in VS Code a task it waits for opens by its button, and "← Tasks" goes back to the list', async ($, on) => {
  seedRich(on, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'T-506' })
  expect((await ui.find({ key: 'vs-status' }))?.text).toMatch(/^T-506  ○ to do/)
  await ui.press({ key: 'after-T-499' })
  expect((await ui.find({ key: 'vs-status' }))?.text).toMatch(/^T-499  ✓ done/)
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'vs-actions' })).toBeUndefined()
  expect(await ui.find({ key: 'vs-task-T-506' })).toBeDefined()
  await ui.unmount()
})

test('reportPart cuts at a line and closes an open code block', () => {
  expect(reportPart('a\nb', 5)).toEqual({ text: 'a\nb', more: 0 })
  expect(reportPart('a\n```\nb\nc\nd', 3)).toEqual({ text: 'a\n```\nb\n```', more: 2 })
})

// Copy copies on the screen it was pressed on, in VS Code as on the terminal
for (const surface of ['terminal', 'vscode'] as const)
  test(`copy surface on ${surface}`, async ($, on) => {
    seedRich(on, 'T-501')
    const seen: unknown[] = []
    on('ui.copy', (_, e) => (seen.push(e.surface ?? 'NONE'), { value: { isCopied: true } }))
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'copy' })
    expect(seen).toEqual([surface])
    await ui.unmount()
  })
