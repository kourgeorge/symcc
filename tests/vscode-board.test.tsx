// The board panel in VS Code's side panel has its own layout (hooks/plugin/ui/vscode.tsx, vscode-list.tsx); on the
// terminal and the desktop it draws exactly as before (board-snapshot.ts holds the trees captured before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_TASKS, T0, seedBoard, drawnData, changedTree } from './board-fixture'
import { BEFORE } from './board-snapshot'
import { plainLabel, CLICK_HINT } from '../hooks/plugin/ui/surface'
import { shortTests, logoWidthFor, vsLogoRow, VS_LOGO_COLUMNS } from '../hooks/plugin/ui/vscode'
import { drawNow } from '../hooks/plugin/ui/now'
import { LOGO_AREA, LOGO_MIN_WIDTH, mayMove, restFrame, swayFrames } from '../hooks/core/logo'
import { modeLabel, MODE_MEANING } from '../hooks/board'

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

test('the board on the terminal, the desktop and mobile draws exactly as before the VS Code layout', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    for (const bodyColumns of [50, 90]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect(drawnData(await ui.drawn())).toEqual(BEFORE[`${surface} ${bodyColumns}`])
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'T-405' })
    expect(drawnData(await ui.drawn())).toEqual(BEFORE[`${surface} task`])
    await ui.press({ key: 'back' })
    await ui.press({ key: 'tab-scouts' })
    expect(drawnData(await ui.drawn())).toEqual(BEFORE[`${surface} scouts`])
    await ui.press({ key: 'tab-settings' })
    expect(drawnData(await ui.drawn())).toEqual(BEFORE[`${surface} settings`])
    await ui.press({ key: 'tab-tasks' }) // the next surface starts on the Tasks page again
    await ui.unmount()
  }
})

// T-437: the pages are drawn at the host's clock ($.clock.now, the kit's mock clock at T0 here), never at the computer's
// (Date.now can't be faked in a test: it is read-only), so the comparison above passes whatever the time of day the tests
// run at; moving the host's clock 10 minutes on changes only the running time; and a real change in the tree still fails.
const TEN_MIN = 10 * 60_000

test('the board follows the host clock: 10 minutes later only the running time changes ("▶ 2m" to "▶ 12m")', async ($, on) => {
  const clock = seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  await clock.set(T0 + TEN_MIN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(drawnData(await ui.drawn()), surface).toEqual(changedTree(BEFORE[`${surface} 50`], [['▶ 2m       ', '▶ 12m      ']]))
    await ui.unmount()
  }
})

test('the board snapshot comparison still fails when the drawn tree really changes', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const drawn = drawnData(await ui.drawn())
  expect(drawn).toEqual(BEFORE['terminal 50'])
  // one word of one title, one running time, one color: each alone is caught
  expect(drawn).not.toEqual(changedTree(BEFORE['terminal 50'], [['Show the plugin version in the', 'Show the plugin release in the']]))
  expect(drawn).not.toEqual(changedTree(BEFORE['terminal 50'], [['▶ 2m       ', '▶ 3m       ']]))
  expect(drawn).not.toEqual(changedTree(BEFORE['terminal 50'], [['"color":"ide"', '"color":"text"']]))
  await ui.unmount()
})

test("drawNow: the host clock's time; the computer's when the host can't answer or answers no number", async () => {
  expect(await drawNow({ clock: { now: async () => T0 } } as never)).toBe(T0)
  for (const now of [async () => { throw new Error('no clock') }, async () => Number.NaN, async () => undefined]) {
    const before = Date.now()
    const ms = await drawNow({ clock: { now } } as never)
    expect(ms >= before && ms <= Date.now()).toBe(true)
  }
})

test('changedTree throws when the text to change is not in the tree', () => {
  expect(() => changedTree(BEFORE['terminal 50'], [['no such text anywhere', 'x']])).toThrow('is not in the tree')
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
  expect((await ui.find({ key: 'tab-tasks' }))?.props.label).toBe('Tasks 20')
  expect((await ui.find({ key: 'tab-scouts' }))?.props.label).toBe('Scouts 1')
  expect((await ui.find({ key: 'tab-box-tasks' }))?.props.borderColor).toBe('ide')
  // the header on readable lines: the tests line short, the mode with its meaning
  expect(await ui.find({ type: 'Text', text: 'tests: claude plugin test . (+1 more)' })).toBeDefined()
  expect(all.join(' ')).toMatch(/⏵ auto/)
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
  expect((await ui.find({ key: 'tab-scouts' }))?.props.label).toBe('Scouts 1')
  expect((await ui.find({ key: 'tab-box-scouts' }))?.props.borderColor).toBe('ide')
  expect((await ui.find({ key: 'tab-box-tasks' }))?.props.borderColor).toBe('subtle')
  expect((await ui.find({ key: 'scouts-back' }))?.props.label).toBe('← Tasks')
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

// T-442: VS Code's header: the logo beside the facts, the mode as a pill, fewer lines, the counts as badges, and a tab strip.
test('in VS Code the header shows the logo, a short banner and a tab strip with the shown tab marked, at widths 40 and 80', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [40, 80]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    const at = `width ${bodyColumns}`
    // the logo: the clef at rest, one Text per row, bold in the accent color, in its own column of LOGO_AREA columns
    const logoBox = await ui.find({ key: 'vs-logo' })
    expect(logoBox?.props.width, at).toBe(LOGO_AREA)
    const rows = elements(logoBox!.children).filter(n => n.type === 'Text')
    expect(rows.map(n => texts(n).join('')), at).toEqual(restFrame().map(vsLogoRow))
    for (const r of rows) expect([r.props?.bold, r.props?.mono, r.props?.color], at).toEqual([true, true, 'ide'])
    // beside it four lines (one fewer than before, and no path line): name, version and folder; the mode pill and its
    // meaning; branch and driver; tests and limits; each wraps, none is cut
    const facts = await ui.find({ key: 'vs-facts' })
    const lines = (facts!.children as Node[]).filter(n => n && typeof n === 'object')
    expect(lines.length, at).toBe(4)
    for (const n of lines) expect([n.type, n.props?.wrap], at).toEqual(['Text', 'wrap'])
    expect(texts(lines[0]).join(''), at).toMatch(/^symcc( v\S+)? · /)
    expect(texts(lines[1]).join(''), at).toBe(` ${modeLabel('auto')}  ${MODE_MEANING.auto}`)
    const pill = elements(lines[1]).find(n => n.type === 'Text' && n.props?.backgroundColor)
    expect([pill?.props?.backgroundColor, pill?.props?.color], at).toEqual(['success', 'inverseText'])
    expect(texts(lines[2]).join(''), at).toBe('branch main · driven by another session')
    expect(texts(lines[3]).join(''), at).toMatch(/^tests: claude plugin test \. \(\+1 more\) · \d+ at once · \d+ min · \d+ retr(y|ies)$/)
    // the counts as badges: a colored dot, then the count, " · " between
    const counts = await ui.find({ key: 'vs-counts' })
    expect(counts?.props.flexWrap, at).toBe('wrap')
    const badges = (counts!.children as Node[]).filter(n => n && typeof n === 'object')
    expect(texts(badges[0]).join(''), at).toBe('● 2 doing · ')
    expect(elements(badges[0]).find(n => texts(n).join('') === '● ')?.props?.color, at).toBe('success')
    // the tabs: a segmented row that wraps, each tab a bordered box around one plain button ("Tasks 20"); the one shown
    // has a bold accent border, its name bold in the accent color and its count a filled badge; the others a dim border
    const row = await ui.find({ key: 'tabs' })
    expect([row?.props.flexDirection, row?.props.flexWrap], at).toEqual(['row', 'wrap'])
    const tabs: [string, string, boolean][] = [['tasks', 'Tasks 20', true], ['scouts', 'Scouts 1', false], ['settings', 'Settings', false]]
    for (const [which, label, active] of tabs) {
      const box = await ui.find({ key: `tab-box-${which}` })
      expect([box?.props.borderStyle, box?.props.borderColor, box?.props.borderDimColor], `${at} ${which}`).toEqual(active ? ['bold', 'ide', false] : ['round', 'subtle', true])
      const b = await ui.find({ key: `tab-${which}` })
      expect([b?.type, b?.props.plain, b?.props.label, b?.props.hotkey], `${at} ${which}`).toEqual(['Button', true, label, undefined])
      expect(texts(b!.children).join(''), `${at} ${which}`).toBe(active ? 'Tasks  20 ' : label)
    }
    const tab = elements((await ui.find({ key: 'tab-tasks' }))!.children)
    expect(tab.filter(n => n.props?.bold && n.props?.color === 'ide').map(n => texts(n).join('')), at).toEqual(['Tasks'])
    const badge = tab.find(n => n.props?.backgroundColor)
    expect([texts(badge).join(''), badge?.props?.backgroundColor, badge?.props?.color], at).toEqual([' 20 ', 'ide', 'inverseText'])
    // nothing cut, no key hints anywhere in the header
    const head = texts(await ui.find({ key: 'vs-header' }))
    expect(head.filter(s => s.includes('…')), at).toEqual([])
    for (const re of KEY_HINTS) expect(head.filter(s => re.test(s)), `${at} ${re}`).toEqual([])
    await ui.unmount()
  }
})

test('in VS Code the logo may move at any panel width (it always shows there); its rows keep their spaces', () => {
  expect(logoWidthFor(true, 40)).toBe(LOGO_MIN_WIDTH)
  expect(logoWidthFor(true, 80)).toBe(80)
  expect(mayMove({ shown: true, mode: 'auto', width: logoWidthFor(true, 40) })).toBe(true)
  // the terminal still tells its own width: no move below LOGO_MIN_WIDTH there
  expect(logoWidthFor(false, 40)).toBe(40)
  expect(mayMove({ shown: true, mode: 'auto', width: logoWidthFor(false, 40) })).toBe(false)
  // every frame of a move fits the logo's column, with no-break spaces in place of spaces
  for (const f of [restFrame(), ...swayFrames()]) {
    for (const r of f) {
      expect([...vsLogoRow(r)].length).toBe(VS_LOGO_COLUMNS)
      expect(vsLogoRow(r)).not.toContain(' ')
      expect(vsLogoRow(r).replace(/ /g, ' ')).toBe(r)
    }
  }
})
