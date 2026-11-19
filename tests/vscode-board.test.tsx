// The board panel in VS Code's side panel has its own layout (hooks/claude/ui/vscode.tsx, vscode-list.tsx); on the
// terminal and the desktop it draws exactly as before (board-snapshot.ts holds the trees captured before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_TASKS, BOARD_VIEW, T0, seedBoard, drawnData, changedTree } from './board-fixture'
import { BEFORE, BEFORE_DROPPED } from './board-snapshot'
import { plainLabel, CLICK_HINT } from '../hooks/claude/ui/surface'
import { shortTests, logoWidthFor, twoLines, MORE, vsHref, mdText, mdLink } from '../hooks/claude/ui/vscode'
import { ASK_LEAD, ASK_LEAD_DRAFT } from '../hooks/claude/ui/vscode-list'
import { drawNow } from '../hooks/claude/ui/now'
import { mayMove } from '../hooks/core/logo'
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
/** A Markdown's text as it reads: each link its words, the bold marks and the escapes taken off. */
const mdPlain = (md: string) => md.replace(/\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\\(.)/g, '$1')
/** All the text of a tree (string children, Button / Input labels and a Markdown's text as it reads), each piece on its own. */
function texts(tree: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') return void out.push(n)
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const e = n as Node
    for (const p of ['label', 'placeholder'] as const) if (typeof e.props?.[p] === 'string') out.push(e.props[p] as string)
    if (e.type === 'Markdown' && typeof e.props?.text === 'string') out.push(mdPlain(e.props.text))
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
  // open the folded groups (each a link), so every task is drawn
  for (const k of ['day:backlog', 'day:done', 'day:dropped']) await ui.press({ key: k, link: { href: vsHref('fold', k) } })
  const tree = await ui.drawn()
  const all = texts(tree)
  // every row is text that wraps: a Markdown whose ID is a link to the task, then the title (cut at a word after about
  // two lines, then "(more)"); nothing anywhere is cut with "…"
  for (const t of BOARD_TASKS) {
    const open = await ui.find({ key: t.id })
    expect([open?.type, open?.props.pressableLinks], t.id).toEqual(['Markdown', [vsHref('task', t.id)]])
    const md = String(open!.props.text)
    expect(md.startsWith(mdLink(t.id, vsHref('task', t.id))), t.id).toBe(true)
    const shown = mdPlain(md).slice(t.id.length).trim().replace(new RegExp(`${MORE.replace(/[()]/g, '\\$&')}$`), '')
    expect(t.title.startsWith(shown) && shown.length > 8, t.id).toBe(true)
  }
  expect(all.filter(s => s.includes('…'))).toEqual([])
  // no Button in a row; the status color is on the status words only, not on the row's box or its title
  for (const t of BOARD_TASKS) {
    const rowBox = await ui.find({ key: `vs-task-${t.id}` })
    expect(rowBox, t.id).toBeDefined()
    expect(rowBox!.props.color ?? rowBox!.props.backgroundColor).toBeUndefined()
    expect(elements(rowBox).filter(n => n.type === 'Button').length, t.id).toBe(0)
    const colored = elements(rowBox!.children).filter(n => n.type === 'Text' && STATUS_COLORS.has(String(n.props?.color)))
    expect(colored.length, t.id).toBeLessThanOrEqual(3) // the needs-you mark, the status words, a later try's "try 3"
    for (const n of colored) expect(texts(n).join(''), t.id).not.toContain(t.title)
  }
  expect((await ui.find({ key: 'vs-task-T-405' }))?.text).toMatch(/✗ failed/)
  // grouped by status under headings with a count badge, the folded groups as heading rows
  for (const [k, h] of [['Waiting for you', '? Waiting for you  1 '], ['Review', '◆ Review  2 '], ['Failed', '✗ Failed  1 '], ['Doing', '▶ Doing  2 '], ['To do', '○ To do  6 ']]) {
    expect((await ui.find({ key: `vs-head-${k}` }))?.text, k).toBe(h)
  }
  expect(all).toContain('▾ Backlog 3')
  expect(all).toContain('▾ Dropped 2')
  // tabs without key labels, the one shown bold and not a link
  expect((await ui.find({ key: 'tabs' }))?.props.text).toBe(`**Tasks 20** \u00a0·\u00a0 ${mdLink('Scouts 1', vsHref('tab', 'scouts'))} \u00a0·\u00a0 ${mdLink('Settings', vsHref('tab', 'settings'))}`)
  // the header on readable lines: the tests line short, the mode with its meaning
  expect(await ui.find({ type: 'Text', text: 'tests: claude plugin test . (+1 more)' })).toBeDefined()
  expect(all.join(' ')).toMatch(/⏵ auto/)
  // no key hints; at most one primary button; the mode switch is a quiet link and the search an Input
  for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), String(re)).toEqual([])
  expect(elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary').length).toBeLessThanOrEqual(1)
  const mode = await ui.find({ key: 'mode' })
  expect(mode?.type).toBe('Markdown')
  expect(mode?.props.text).toBe(mdLink('Switch to review merge', vsHref('mode', 'review')))
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
  await ui.press({ key: 'T-405', link: { href: vsHref('task', 'T-405') } })
  await check('task')
  expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
  await ui.press({ key: 'back' })
  // the tabs are links: the shown one is bold and no link, the others switch the page
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'scouts') } })
  await check('scouts')
  expect((await ui.find({ key: 'tabs' }))?.props.text).toBe(`${mdLink('Tasks 20', vsHref('tab', 'tasks'))} \u00a0·\u00a0 **Scouts 1** \u00a0·\u00a0 ${mdLink('Settings', vsHref('tab', 'settings'))}`)
  expect((await ui.find({ key: 'tabs' }))?.props.pressableLinks).toEqual([vsHref('tab', 'tasks'), vsHref('tab', 'settings')])
  expect((await ui.find({ key: 'scouts-back' }))?.props.label).toBe('← Tasks')
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'settings') } })
  await check('settings')
  expect((await ui.find({ key: 'tabs' }))?.props.text).toMatch(/\*\*Settings\*\*$/)
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  expect(await ui.find({ key: 'vs-task-T-405' })).toBeDefined()
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
    // the logo: the single 𝄞 glyph, large and bold in the accent color (VS Code's font breaks the multi-row clef apart)
    const logoBox = await ui.find({ key: 'vs-logo' })
    const rows = elements(logoBox!.children).filter(n => n.type === 'Text')
    expect(rows.map(n => texts(n).join('')), at).toEqual(['\u{1D11E}'])
    expect([rows[0]!.props?.bold, rows[0]!.props?.size, rows[0]!.props?.color], at).toEqual([true, 'title', 'ide'])
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
    // the tabs: one line of text that wraps (a Markdown, no Button and no bordered box): the shown tab bold and no link,
    // the others links
    const tabs = await ui.find({ key: 'tabs' })
    expect(tabs?.type, at).toBe('Markdown')
    expect(tabs?.props.text, at).toBe(`**Tasks 20** \u00a0·\u00a0 ${mdLink('Scouts 1', vsHref('tab', 'scouts'))} \u00a0·\u00a0 ${mdLink('Settings', vsHref('tab', 'settings'))}`)
    expect(tabs?.props.pressableLinks, at).toEqual([vsHref('tab', 'scouts'), vsHref('tab', 'settings')])
    expect(elements(await ui.find({ key: 'vs-header' })).filter(n => n.type === 'Button'), at).toEqual([])
    // nothing cut, no key hints anywhere in the header
    const head = texts(await ui.find({ key: 'vs-header' }))
    expect(head.filter(s => s.includes('…')), at).toEqual([])
    for (const re of KEY_HINTS) expect(head.filter(s => re.test(s)), `${at} ${re}`).toEqual([])
    await ui.unmount()
  }
})

// T-444, T-448: VS Code's lists: headings with a count badge, each task two lines of text that wrap (its ID a link that
// opens it, the title up to two lines, then a dim line with the status in color, the kind, the try and the time), the
// lead's questions in the warning tone, the closed groups folded behind links, and a friendly empty board with one
// primary button. No Buttons for rows, folds or tabs: VS Code draws a Button as a filled blue box whose label never wraps.
const QUESTION = { id: 'Q-3', text: 'Should the board open by itself when a session starts?', options: ['Yes', 'No'], asked_at: new Date(T0 - 5 * 60_000).toISOString() }
const LONG = { ...BOARD_TASKS.find(t => t.id === 'T-410')!, id: 'T-421', order: 421, title: 'Draw the board list in the VS Code side panel with clear headings, count badges and one button per task, so it is easy to scan' }
const MIXED_VIEW = { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, LONG], questions: [QUESTION] } }
const EMPTY_VIEW = { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, working: [], tasks: [] } }

type Mounted = { find: (q: { key: string }) => Promise<unknown> }
/** A row's two lines as they read ("● T-404  title" and its dim line), "\n" between; `kind` the row's key start. */
async function rowText(ui: Mounted, id: string, kind = id.startsWith('Q-') ? 'vs-question' : 'vs-task') {
  const [top, info] = ((await ui.find({ key: `${kind}-${id}` })) as Node).children!.filter(n => n && typeof n === 'object')
  return `${texts(top).join('')}\n${texts(info).join('')}`
}
/** A row's dim second line. */
const infoLine = async (ui: Mounted, id: string) => ((await ui.find({ key: `vs-task-${id}` })) as Node).children!.filter(n => n && typeof n === 'object')[1]

test('in VS Code the Tasks list at widths 40 and 80: headings with counts, rows and folds as links, no Buttons', async ($, on) => {
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
    // no Button anywhere on the busy Tasks page: rows, folds, tabs and the mode switch are links; nothing is cut to one
    // line but the rules, so nothing runs off the right edge
    expect(elements(tree).filter(n => n.type === 'Button').map(n => n.props?.key), at).toEqual([])
    expect(elements(tree).filter(n => n.type === 'Text' && n.props?.wrap === 'truncate' && !/^[─━]+$/.test(texts(n).join(''))), at).toEqual([])
    // a line of space between the folded sections too (the open ones sit in the page's column, gap 1)
    expect((await ui.find({ key: 'vs-folded' }))?.props.gap, at).toBe(1)
    // Backlog, Done and Dropped are folded: bold links that read as headings, with their count; none of their tasks drawn
    const folds: [string, string][] = [
      ['day:backlog', '▸ Backlog 3'],
      ['day:done', '▸ Done 3'],
      ['day:dropped', '▸ Dropped 2'],
    ]
    for (const [k, shown] of folds) {
      const fold = await ui.find({ key: k })
      expect([fold?.type, fold?.props.text, fold?.props.pressableLinks], `${at} ${k}`).toEqual(['Markdown', `**${mdLink(shown, vsHref('fold', k))}**`, [vsHref('fold', k)]])
    }
    for (const id of ['T-411', 'T-414', 'T-417']) expect(await ui.find({ key: `vs-task-${id}` }), `${at} ${id}`).toBeUndefined()
    // each open task's first line is a Markdown: its ID the one link, to the task
    for (const t of BOARD_TASKS.filter(t => !['backlog', 'done', 'dropped'].includes(t.status))) {
      const b = await ui.find({ key: t.id })
      expect([b?.type, b?.props.pressableLinks], `${at} ${t.id}`).toEqual(['Markdown', [vsHref('task', t.id)]])
      expect(String(b?.props.text).startsWith(mdLink(t.id, vsHref('task', t.id))), `${at} ${t.id}`).toBe(true)
    }
    // the dim line: the status in its color and its time, the kind or role, the question or why it failed, the try
    expect(await rowText(ui, 'T-404'), at).toContain('\n? waiting for 1m · Yellow or blue for review?')
    expect(await rowText(ui, 'T-405'), at).toContain('\n✗ failed 1m ago')
    expect(await rowText(ui, 'T-401'), at).toContain('\n▶ 2m')
    expect(await rowText(ui, 'T-403'), at).toContain('\n◆ review for 1m · ready for your review')
    expect(await rowText(ui, 'T-420'), at).toMatch(/\n.*investigation/)
    const status = elements(await infoLine(ui, 'T-405')).find(n => texts(n).join('') === '✗ failed 1m ago')
    expect(status?.props?.color, at).toBe('error')
    // a task that needs you gets a clear "●" mark first (in its tone) and a bold title; one that runs starts with its ID
    for (const id of ['T-403', 'T-404', 'T-405', 'T-420']) {
      expect(await rowText(ui, id), `${at} ${id}`).toMatch(new RegExp(`^● ${id}\\s+\\S`))
      expect(String((await ui.find({ key: id }))?.props.text), `${at} ${id}`).toMatch(/\*\*.+\*\*$/)
    }
    expect(await rowText(ui, 'T-401'), at).toMatch(/^T-401\s+\S/)
    // a long title: whole when it fits two lines, at 80; at 40 cut at a word after about two lines, then "(more)" (the
    // whole title is on its page)
    const long = LONG.title
    const shown = (await rowText(ui, 'T-421')).split('\n')[0]!.replace(/^T-421\s+/, '')
    if (bodyColumns === 80) expect(shown, at).toBe(long)
    else {
      expect(shown.endsWith(MORE), at).toBe(true)
      const cut = shown.slice(0, -MORE.length)
      expect(long.startsWith(cut) && cut.length > 20 && long.charAt(cut.length) === ' ', at).toBe(true)
    }
    // the lead's question: a row like a task's, in the warning tone; its ID links to its answer page
    const q = await ui.find({ key: 'Q-3' })
    expect([q?.type, q?.props.pressableLinks], at).toEqual(['Markdown', [vsHref('question', 'Q-3')]])
    expect((await rowText(ui, 'Q-3')).replace(/^● Q-3\s+/, '● Q-3 '), at).toBe(`● Q-3 ${QUESTION.text}\n? question for you for 5m · 2 choices`)
    expect(elements(await ui.find({ key: 'vs-question-Q-3-top' })).find(n => texts(n).join('') === '● ')?.props?.color, at).toBe('warning')
    // nothing cut with "…", no key hints, no primary button on a busy board
    expect(all.filter(s => s.includes('…')), at).toEqual([])
    for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), `${at} ${re}`).toEqual([])
    // a press on a fold's link opens it: Done's tasks are then rows too (links); a second press closes it
    await ui.press({ key: 'day:done', link: { href: vsHref('fold', 'day:done') } })
    expect((await ui.find({ key: 'day:done' }))?.props.text, at).toBe(`**${mdLink('▾ Done 3', vsHref('fold', 'day:done'))}**`)
    expect((await ui.find({ key: 'T-414' }))?.type, at).toBe('Markdown')
    await ui.press({ key: 'day:done', link: { href: vsHref('fold', 'day:done') } })
    expect(await ui.find({ key: 'T-414' }), at).toBeUndefined()
    // a press on a row's link opens that task's page; on a question's, its answer page
    await ui.press({ key: 'T-404', link: { href: vsHref('task', 'T-404') } })
    expect((await ui.find({ key: 'vs-head' }))?.text, at).toMatch(/^T-404/)
    await ui.press({ key: 'back' })
    await ui.press({ key: 'Q-3', link: { href: vsHref('question', 'Q-3') } })
    expect(await ui.find({ key: 'vs-task-T-404' }), at).toBeUndefined()
    expect(texts(await ui.drawn()).join(' '), at).toContain(QUESTION.text)
    await ui.press({ key: 'question-back', link: { href: vsHref('page', 'back/question-back') } })
    expect(await ui.find({ key: 'vs-task-T-404' }), at).toBeDefined()
    await ui.unmount()
  }
})

test('in VS Code a done or dropped task is one line: its mark, the ID link, the title; open tasks keep their status line', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  for (const k of ['day:done', 'day:dropped']) await ui.press({ key: k, link: { href: vsHref('fold', k) } })
  for (const [id, m, tone] of [['T-414', '✓', 'success'], ['T-417', '–', 'inactive']] as const) {
    const box = (await ui.find({ key: `vs-task-${id}` })) as Node
    const parts = box.children!.filter(n => n && typeof n === 'object') as Node[]
    expect(parts.length, id).toBe(1) // no second "done" line
    const top = parts[0]!
    expect(texts(top).join(''), id).toMatch(new RegExp(`^${m} ${id}\\s+\\S`))
    expect(elements(top).find(n => texts(n).join('') === `${m} `)?.props?.color, id).toBe(tone)
    const md = await ui.find({ key: id })
    expect([md?.type, md?.props.dimColor, md?.props.pressableLinks], id).toEqual(['Markdown', true, [vsHref('task', id)]])
    expect(String(md?.props.text).startsWith(mdLink(id, vsHref('task', id))), id).toBe(true)
  }
  // a doing and a waiting task keep their dim status line
  expect(await rowText(ui, 'T-401')).toContain('\n▶ 2m')
  expect(await rowText(ui, 'T-404')).toMatch(/\n\? waiting/)
  // the done row's link still opens its page
  await ui.press({ key: 'T-414', link: { href: vsHref('task', 'T-414') } })
  expect((await ui.find({ key: 'vs-head' }))?.text).toMatch(/^T-414/)
  await ui.unmount()
})

test('in VS Code the mode switch is a link that switches the mode', async ($, on) => {
  seedBoard(on)
  const toasts: string[] = []
  on('ui.toast', () => (toasts.push('toast'), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'mode', link: { href: vsHref('mode', 'review') } })
  await ui.unmount()
  expect(toasts.length).toBe(1)
})

test('mdText keeps a title plain in markdown', () => {
  expect(mdText('Fix *bold* [x] <b> `code` _u_ #1 & a|b')).toBe('Fix \\*bold\\* \\[x\\] \\<b\\> \\`code\\` \\_u\\_ \\#1 \\& a\\|b')
  expect(mdText('two\nlines  here')).toBe('two lines here')
  expect(mdLink('a]b', 'https://symcc.invalid/task/T-1')).toBe('[a\\]b](https://symcc.invalid/task/T-1)')
  expect(vsHref('fold', 'day:backlog')).toBe('https://symcc.invalid/fold/day%3Abacklog')
  expect(mdPlain(mdLink('a]b *c*', vsHref('task', 'T-1')))).toBe('a]b *c*')
})

test('in VS Code a row keeps its kind when its question or reason has the same word, and one option is "1 choice"', async ($, on) => {
  const base = BOARD_TASKS.find(t => t.id === 'T-404')!
  const DOCS = { ...base, id: 'T-501', order: 501, kind: 'docs', question: 'Should the docs page list every setting?' }
  const BUG = { ...BOARD_TASKS.find(t => t.id === 'T-405')!, id: 'T-502', order: 502, kind: 'bug', note: 'the bug is still there', history: ['try 1: the bug is still there'] }
  const ONE = { ...QUESTION, id: 'Q-4', options: ['Yes'] }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, DOCS, BUG], questions: [ONE] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.drawn()
  const line = (id: string) => rowText(ui, id)
  expect(await line('T-501')).toContain('\n? waiting for 1m · docs · Should the docs page list every setting?')
  expect(await line('T-502')).toMatch(/\n✗ failed 1m ago · bug · .*bug/)
  expect(await line('Q-4')).toMatch(/ · 1 choice$/)
  // an investigation's tag is not shown twice
  expect((await line('T-420')).match(/investigation/g)?.length).toBe(1)
  await ui.unmount()
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

test('in VS Code the logo is one still glyph: no move plays there; the terminal still tells its own width', () => {
  expect(logoWidthFor(true, 40)).toBe(0)
  expect(logoWidthFor(true, 80)).toBe(0)
  expect(mayMove({ shown: true, mode: 'auto', width: logoWidthFor(true, 80) })).toBe(false)
  // the terminal still tells its own width: no move below LOGO_MIN_WIDTH there
  expect(logoWidthFor(false, 40)).toBe(40)
  expect(mayMove({ shown: true, mode: 'auto', width: logoWidthFor(false, 40) })).toBe(false)
  expect(mayMove({ shown: true, mode: 'auto', width: logoWidthFor(false, 80) })).toBe(true)
})

test('in VS Code a to do task worked on before shows ● in the list and on its page; a fresh one keeps ○ (T-528)', async ($, on) => {
  const tried = BOARD_TASKS.map(t => (t.id === 'T-408' ? { ...t, attempts: 1 } : t))
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: tried } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await rowText(ui, 'T-408')).split('\n')[1]).toMatch(/^● /)
  expect((await rowText(ui, 'T-406')).split('\n')[1]).toMatch(/^○ /)
  await ui.press({ key: 'T-408', link: { href: vsHref('task', 'T-408') } })
  expect((await ui.find({ key: 'vs-status' }))?.text).toMatch(/^ ● to do /)
  await ui.unmount()
})

test('T-532: in VS Code a task waiting only to rerun its tests is under Doing as "retest", and its page badge says it reruns its tests', async ($, on) => {
  const rerun = { ...BOARD_TASKS.find(t => t.id === 'T-404')!, id: 'T-499', title: 'Rerun the tests that ran out of time once', question: null, test_rerun: 1 }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, rerun] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  // the waiting task with a question (T-404) is still the only one waiting for you
  expect((await ui.find({ key: 'vs-head-Waiting for you' }))?.text).toBe('? Waiting for you  1 ')
  expect((await ui.find({ key: 'vs-head-Doing' }))?.text).toBe('▶ Doing  3 ')
  const row = await rowText(ui, 'T-499')
  expect(row.startsWith('T-499')).toBe(true) // no "●": it does not need you
  expect(row).toMatch(/\n▶ retest/)
  expect(await rowText(ui, 'T-404')).toMatch(/^● T-404/)
  await ui.press({ key: 'T-499', link: { href: vsHref('task', 'T-499') } })
  expect((await ui.find({ key: 'vs-status' }))?.text).toMatch(/^ ▶ rerunning its tests /)
  await ui.unmount()
})

test("T-542: in VS Code symcc's own pre-merge step shows \"prep\" and a running checker \"checker\"; the page says what each does", async ($, on) => {
  const fresh = new Date(T0 - 10_000).toISOString()
  const base = BOARD_TASKS.find(t => t.id === 'T-401')!
  const prep = { ...base, id: 'T-497', title: 'In the prep step', note: 'preparing to merge: committing and checking files', runs: [{ started: new Date(T0 - 600_000).toISOString(), ended: fresh }], checking: { step: 'prep', at: fresh } }
  const checker = { ...prep, id: 'T-498', title: 'Checker on it', note: 'a checker agent is trying to break it before it merges', checking: { step: 'checker', at: fresh } }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, prep, checker] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await rowText(ui, 'T-497')).toMatch(/\n▶ prep/)
  expect(await rowText(ui, 'T-498')).toMatch(/\n▶ checker/)
  // only the task whose checker runs says "checker"
  expect(texts(await ui.drawn()).join('\n').match(/▶ checker/g)?.length).toBe(1)
  await ui.press({ key: 'T-497', link: { href: vsHref('task', 'T-497') } })
  expect(texts(await ui.drawn()).join('\n')).toContain('preparing to merge: committing and checking files')
  await ui.unmount()
})
