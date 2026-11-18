// The board panel in VS Code's side panel has its own layout (hooks/plugin/ui/vscode.tsx, vscode-list.tsx); on the
// terminal and the desktop it draws exactly as before (board-snapshot.ts holds the trees captured before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_TASKS, seedBoard, plainTree } from './board-fixture'
import { BEFORE } from './board-snapshot'
import { plainLabel, CLICK_HINT } from '../hooks/plugin/ui/surface'
import { shortTests } from '../hooks/plugin/ui/vscode'

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
/** All the text of a tree (string children and Button / Input labels), each piece on its own. */
function texts(tree: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') return void out.push(n)
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const e = n as Node
    for (const p of ['label', 'placeholder'] as const) if (typeof e.props?.[p] === 'string') out.push(e.props[p] as string)
    for (const c of e.children ?? []) walk(c)
  }
  walk(tree)
  return out
}
const STATUS_COLORS = new Set(['warning', 'error', 'ide', 'permission', 'success', 'suggestion'])
const KEY_HINTS = [/\[[a-z]\]:/, /Enter open/, /↑↓ move/, /t s c views/, /\[m\]/, /\[f\]/, /Enter to/]

test('the board on the terminal and the desktop draws exactly as before the VS Code layout', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const bodyColumns of [50, 90]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect(plainTree(await ui.drawn())).toEqual(plainTree(BEFORE[`${surface} ${bodyColumns}`]))
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'T-405' })
    expect(plainTree(await ui.drawn())).toEqual(plainTree(BEFORE[`${surface} task`]))
    await ui.press({ key: 'back' })
    await ui.press({ key: 'tab-scouts' })
    expect(plainTree(await ui.drawn())).toEqual(plainTree(BEFORE[`${surface} scouts`]))
    await ui.press({ key: 'tab-settings' })
    expect(plainTree(await ui.drawn())).toEqual(plainTree(BEFORE[`${surface} settings`]))
    await ui.press({ key: 'tab-tasks' }) // the next surface starts on the Tasks page again
    await ui.unmount()
  }
})

test('in VS Code the Tasks page shows whole titles, status colors on the marks, buttons and no key hints', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  // open the folded groups, so every task is drawn
  for (const k of ['day:backlog', 'day:done', 'day:dropped']) await ui.press({ key: k })
  const tree = await ui.drawn()
  const all = texts(tree)
  // every title is drawn whole, in a Text that wraps; nothing anywhere is cut with "…"
  for (const t of BOARD_TASKS) {
    const title = await ui.find({ type: 'Text', text: t.title })
    expect(title, t.id).toBeDefined()
    expect(title!.props.wrap).toBe('wrap')
    expect(STATUS_COLORS.has(String(title!.props.color))).toBe(false)
  }
  expect(all.filter(s => s.includes('…'))).toEqual([])
  // each row: its ID is a plain button; the status color is on the mark only, not on the row's box or its title
  for (const t of BOARD_TASKS) {
    const rowBox = await ui.find({ key: `vs-task-${t.id}` })
    expect(rowBox, t.id).toBeDefined()
    expect(rowBox!.props.color ?? rowBox!.props.backgroundColor).toBeUndefined()
    const colored = elements(rowBox!.children).filter(n => n.type === 'Text' && STATUS_COLORS.has(String(n.props?.color)))
    expect(colored.length, t.id).toBeLessThanOrEqual(2) // the mark, and a later try's "try 3" in the warning color
    for (const n of colored) expect(texts(n).join(''), t.id).not.toContain(t.title)
    const open = await ui.find({ key: t.id })
    expect(open?.type).toBe('Button')
    expect(open?.props.plain).toBe(true)
  }
  expect((await ui.find({ key: 'vs-task-T-405' }))?.text).toMatch(/✗ failed/)
  // grouped by status under small headings, the folded groups as heading rows
  for (const h of ['Waiting for you (1)', 'Review (2)', 'Failed (1)', 'Doing (2)', 'To do (6)']) expect(all, h).toContain(h)
  expect(all).toContain('▾ Backlog (3)')
  expect(all).toContain('▾ Dropped (2)')
  // tabs without key labels, the one shown marked
  expect((await ui.find({ key: 'tab-tasks' }))?.props.label).toBe('● Tasks (20)')
  expect((await ui.find({ key: 'tab-scouts' }))?.props.label).toBe('Scouts (1)')
  // the header on readable lines: the tests line short, the mode with its meaning
  expect(await ui.find({ type: 'Text', text: 'tests: claude plugin test . (+1 more)' })).toBeDefined()
  expect(all.join(' ')).toMatch(/mode .*auto/)
  // no key hints; at most one primary button; the mode switch is a Button and the search an Input
  for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), String(re)).toEqual([])
  expect(elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary').length).toBeLessThanOrEqual(1)
  const mode = await ui.find({ key: 'mode' })
  expect(mode?.type).toBe('Button')
  expect(mode?.props.label).toBe('Switch to review merge')
  expect((await ui.find({ key: 'search' }))?.type).toBe('Input')
  await ui.unmount()
})

test('in VS Code the search box filters as you type, and Clear search takes it off', async ($, on) => {
  seedBoard(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.input({ key: 'search', text: 'scout', kind: 'change' })
  expect(await ui.find({ key: 'vs-task-T-406' })).toBeDefined()
  expect(await ui.find({ key: 'vs-task-T-401' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /tasks match "scout"/ })).toBeDefined()
  await ui.press({ key: 'search-clear' })
  expect(await ui.find({ key: 'vs-task-T-401' })).toBeDefined()
  expect(await ui.find({ key: 'search-clear' })).toBeUndefined()
  await ui.unmount()
})

test('in VS Code the other pages drop key marks from labels and print no key hints', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const check = async (page: string) => {
    const tree = await ui.drawn()
    const labels = elements(tree).filter(n => n.type === 'Button').map(n => String(n.props?.label ?? ''))
    expect(labels.filter(l => /\s\([a-z]\)$|^\[[a-z]\]/.test(l)), page).toEqual([])
    expect(texts(tree).filter(s => /↑↓|Enter open|Esc back/.test(s)), page).toEqual([])
  }
  await ui.press({ key: 'T-405' })
  await check('task')
  expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'tab-scouts' })
  await check('scouts')
  expect((await ui.find({ key: 'tab-scouts' }))?.props.label).toBe('● Scouts (1)')
  expect((await ui.find({ key: 'scouts-back' }))?.props.label).toBe('Back')
  await ui.press({ key: 'tab-settings' })
  await check('settings')
  await ui.unmount()
})

test('plainLabel and shortTests', () => {
  expect(plainLabel('Cancel (x)')).toBe('Cancel')
  expect(plainLabel('[m] review merge')).toBe('review merge')
  expect(plainLabel('[t]: Tasks (3)')).toBe('Tasks (3)')
  expect(plainLabel('Approve')).toBe('Approve')
  expect(plainLabel('+ New scout')).toBe('+ New scout')
  expect(shortTests(['npm test'])).toBe('npm test')
  expect(shortTests(['a', 'b', 'c'])).toBe('a (+2 more)')
  expect(shortTests([])).toBe('')
})
