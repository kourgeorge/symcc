// The board panel in VS Code's side panel has its own layout (hooks/plugin/ui/vscode.tsx, vscode-list.tsx); on the
// terminal and the desktop it draws exactly as before (board-snapshot.ts holds the trees captured before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_TASKS, BOARD_VIEW, T0, seedBoard, drawnData, changedTree } from './board-fixture'
import { BEFORE, BEFORE_DROPPED } from './board-snapshot'
import { plainLabel, CLICK_HINT } from '../hooks/plugin/ui/surface'
import { shortTests, logoWidthFor, vsLogoRow, VS_LOGO_COLUMNS, twoLines, MORE } from '../hooks/plugin/ui/vscode'
import { ASK_LEAD, ASK_LEAD_DRAFT } from '../hooks/plugin/ui/vscode-list'
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

// a board with only dropped tasks (and nothing run) keeps its empty counts line under the banner, as before
const DROPPED_VIEW = { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, working: [], tasks: BOARD_TASKS.filter(t => t.status === 'dropped') } }

test('a board with only dropped tasks on the terminal, the desktop and mobile draws exactly as before', async ($, on) => {
  seedBoard(on, { view: DROPPED_VIEW })
  on('ui.toast', () => ({ value: undefined }))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    for (const bodyColumns of [50, 90]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect(drawnData(await ui.drawn()), `${surface} ${bodyColumns}`).toEqual(BEFORE_DROPPED[`${surface} ${bodyColumns}`])
      await ui.unmount()
    }
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
  // every title is whole in its row button's label and drawn in a Text that wraps (cut at a word after two lines, then
  // "(more)"); nothing anywhere is cut with "…"
  for (const t of BOARD_TASKS) {
    const open = await ui.find({ key: t.id })
    expect([open?.type, open?.props.plain, open?.props.label], t.id).toEqual(['Button', true, `${t.id} ${t.title}`])
    const title = elements(open!.children).find(n => n.type === 'Text' && n.props?.wrap === 'wrap' && t.title.startsWith(texts(n).join('')) && texts(n).join('').length > 8)
    expect(title, t.id).toBeDefined()
    expect(STATUS_COLORS.has(String(title!.props?.color))).toBe(false)
  }
  expect(all.filter(s => s.includes('…'))).toEqual([])
  // each row is one plain button; the status color is on the status words only, not on the row's box or its title
  for (const t of BOARD_TASKS) {
    const rowBox = await ui.find({ key: `vs-task-${t.id}` })
    expect(rowBox, t.id).toBeDefined()
    expect(rowBox!.props.color ?? rowBox!.props.backgroundColor).toBeUndefined()
    expect((rowBox!.children as Node[]).filter(n => n && typeof n === 'object').map(n => n.type), t.id).toEqual(['Button'])
    const colored = elements(rowBox!.children).filter(n => n.type === 'Text' && STATUS_COLORS.has(String(n.props?.color)))
    expect(colored.length, t.id).toBeLessThanOrEqual(3) // the needs-you mark, the status words, a later try's "try 3"
    for (const n of colored) expect(texts(n).join(''), t.id).not.toContain(t.title)
  }
  expect((await ui.find({ key: 'vs-task-T-405' }))?.text).toMatch(/✗ failed/)
  // grouped by status under headings with a count badge, the folded groups as heading rows
  for (const [k, h] of [['Waiting for you', '? Waiting for you  1 '], ['Review', '◆ Review  2 '], ['Failed', '✗ Failed  1 '], ['Doing', '▶ Doing  2 '], ['To do', '○ To do  6 ']]) {
    expect((await ui.find({ key: `vs-head-${k}` }))?.text, k).toBe(h)
  }
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

// T-444: VS Code's lists: headings with a count badge, each task one button (the ID dim, the title up to two lines, a dim
// line with the status in color, the kind, the try and the time), the lead's questions in the warning tone, the closed
// groups folded, and a friendly empty board with one primary button.
const QUESTION = { id: 'Q-3', text: 'Should the board open by itself when a session starts?', options: ['Yes', 'No'], asked_at: new Date(T0 - 5 * 60_000).toISOString() }
const LONG = { ...BOARD_TASKS.find(t => t.id === 'T-410')!, id: 'T-421', order: 421, title: 'Draw the board list in the VS Code side panel with clear headings, count badges and one button per task, so it is easy to scan' }
const MIXED_VIEW = { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, LONG], questions: [QUESTION] } }
const EMPTY_VIEW = { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, working: [], tasks: [] } }

test('in VS Code the Tasks list at widths 40 and 80: headings with counts, rows as buttons, Done and Backlog folded', async ($, on) => {
  seedBoard(on, { view: MIXED_VIEW })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [40, 80]) {
    const at = `width ${bodyColumns}`
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    const tree = await ui.drawn()
    const all = texts(tree)
    // headings: the colored mark, the name, the count as a filled badge in the same color
    const heads: [string, string, string][] = [
      ['questions', '? Questions for you  1 ', 'warning'],
      ['Waiting for you', '? Waiting for you  1 ', 'warning'],
      ['Review', '◆ Review  2 ', 'warning'],
      ['Failed', '✗ Failed  1 ', 'error'],
      ['Doing', '▶ Doing  2 ', 'ide'],
      ['To do', '○ To do  7 ', 'inactive'],
    ]
    for (const [k, text, tone] of heads) {
      const head = await ui.find({ key: `vs-head-${k}` })
      expect(head?.text, `${at} ${k}`).toBe(text)
      const badge = elements(head!.children).find(n => n.type === 'Text' && n.props?.backgroundColor)
      expect([badge?.props?.backgroundColor, badge?.props?.color, badge?.props?.bold], `${at} ${k}`).toEqual([tone, 'inverseText', true])
    }
    // a line of space between the folded sections too (the open ones sit in the page's column, gap 1)
    expect((await ui.find({ key: 'vs-folded' }))?.props.gap, at).toBe(1)
    // Backlog, Done and Dropped are folded: heading buttons with a count badge, none of their tasks drawn
    const folds: [string, string, string][] = [
      ['day:backlog', '▸ Backlog (3)', '▸ Backlog  3 '],
      ['day:done', '▸ Done (3)', '▸ Done  3 '],
      ['day:dropped', '▸ Dropped (2)', '▸ Dropped  2 '],
    ]
    for (const [k, label, shown] of folds) {
      const fold = await ui.find({ key: k })
      expect([fold?.type, fold?.props.plain, fold?.props.label, texts(fold!.children).join('')], `${at} ${k}`).toEqual(['Button', true, label, shown])
    }
    for (const id of ['T-411', 'T-414', 'T-417']) expect(await ui.find({ key: `vs-task-${id}` }), `${at} ${id}`).toBeUndefined()
    // each open task is one plain button whose children are only text, its ID in the dim color
    for (const t of BOARD_TASKS.filter(t => !['backlog', 'done', 'dropped'].includes(t.status))) {
      const b = await ui.find({ key: t.id })
      expect([b?.type, b?.props.plain], `${at} ${t.id}`).toEqual(['Button', true])
      for (const c of (b!.children as unknown[]).flat(9)) if (c && typeof c === 'object') expect((c as Node).type, `${at} ${t.id}`).toBe('Text')
      expect(elements(b!.children).find(n => texts(n).join('') === t.id)?.props?.color, `${at} ${t.id}`).toBe('inactive')
    }
    const rowText = async (id: string) => texts((await ui.find({ key: id }))!.children).join('')
    // the dim line: the status in its color and its time, the kind or role, the question or why it failed, the try
    expect(await rowText('T-404'), at).toContain('\n? waiting for 1m · Yellow or blue for review?')
    expect(await rowText('T-405'), at).toContain('\n✗ failed 1m ago')
    expect(await rowText('T-401'), at).toContain('\n▶ 2m')
    expect(await rowText('T-403'), at).toContain('\n◆ review for 1m · ready for your review')
    expect(await rowText('T-420'), at).toMatch(/\n.*investigation/)
    const status = elements((await ui.find({ key: 'T-405' }))!.children).find(n => texts(n).join('') === '✗ failed 1m ago')
    expect(status?.props?.color, at).toBe('error')
    // a task that needs you gets a clear "●" mark first; one that runs starts with its ID
    for (const id of ['T-403', 'T-404', 'T-405', 'T-420']) expect(await rowText(id), `${at} ${id}`).toMatch(new RegExp(`^● ${id}  `))
    expect(await rowText('T-401'), at).toMatch(/^T-401  /)
    // a long title: whole when it fits two lines, at 80; at 40 cut at a word after about two lines, then "(more)" (the
    // whole title is on its page and in the button's label)
    const long = LONG.title
    const shown = texts((await ui.find({ key: 'T-421' }))!.children)
    expect((await ui.find({ key: 'T-421' }))?.props.label, at).toBe(`T-421 ${long}`)
    if (bodyColumns === 80) expect(shown, at).toContain(long)
    else {
      expect(shown, at).not.toContain(long)
      expect(shown, at).toContain(MORE)
      const cut = shown.find(s => long.startsWith(s) && s.length > 20)!
      expect(long.charAt(cut.length), at).toBe(' ')
    }
    // the lead's question: a row like a task's, in the warning tone
    const q = await ui.find({ key: 'Q-3' })
    expect([q?.type, q?.props.plain, q?.props.label], at).toEqual(['Button', true, `Q-3 ${QUESTION.text}`])
    expect(texts(q!.children).join(''), at).toBe(`● Q-3  ${QUESTION.text}\n? question for you for 5m · 2 choices`)
    expect(elements(q!.children).find(n => texts(n).join('') === '● ')?.props?.color, at).toBe('warning')
    // nothing cut with "…", no key hints, no primary button on a busy board
    expect(all.filter(s => s.includes('…')), at).toEqual([])
    for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), `${at} ${re}`).toEqual([])
    expect(elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary').length, at).toBe(0)
    // a fold opens on a press: Done's tasks are then rows too
    await ui.press({ key: 'day:done' })
    expect((await ui.find({ key: 'T-414' }))?.type, at).toBe('Button')
    await ui.press({ key: 'day:done' })
    await ui.unmount()
  }
})

test('in VS Code an empty board at widths 40 and 80: a friendly note and one primary button that starts a message to the lead', async ($, on) => {
  seedBoard(on, { view: EMPTY_VIEW })
  on('ui.toast', () => ({ value: undefined }))
  const filled: string[] = []
  on('prompt.fill', (_, e) => (filled.push(e.text), { isFilled: true }) as never)
  for (const bodyColumns of [40, 80]) {
    const at = `width ${bodyColumns}`
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    const tree = await ui.drawn()
    const all = texts(tree)
    expect((await ui.find({ key: 'vs-empty' }))?.text, at).toContain('✓ All clear. Nothing running or waiting.')
    const primary = elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary')
    expect(primary.length, at).toBe(1)
    expect((await ui.find({ key: 'vs-ask-lead' }))?.props.variant, at).toBe('primary')
    expect(primary[0]!.props?.label, at).toBe(ASK_LEAD)
    expect(await ui.find({ key: 'vs-folded' }), at).toBeUndefined()
    expect(all.filter(s => s.includes('…')), at).toEqual([])
    for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), `${at} ${re}`).toEqual([])
    await ui.press({ key: 'vs-ask-lead' })
    await ui.unmount()
  }
  expect(filled).toEqual([ASK_LEAD_DRAFT, ASK_LEAD_DRAFT])
})

test('twoLines: a title past about two lines is cut at a word; a short one stays whole', () => {
  expect(twoLines('short title', 40)).toEqual({ text: 'short title', cut: false })
  const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen'
  const t = twoLines(long, 20, 7)
  expect(t.cut).toBe(true)
  expect(long.startsWith(t.text) && long.charAt(t.text.length) === ' ').toBe(true)
  expect(t.text.length + MORE.length).toBeLessThanOrEqual(2 * 20 - 7)
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
