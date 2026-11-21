// The board panel in VS Code's side panel has its own layout (hooks/claude/ui/vscode.tsx, vscode-list.tsx); on the
// terminal and the desktop it draws exactly as before (board-snapshot.ts holds the trees captured before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_TASKS, BOARD_VIEW, T0, seedBoard, drawnData, changedTree } from './board-fixture'
import { BEFORE, BEFORE_DROPPED } from './board-snapshot'
import { plainLabel, CLICK_HINT } from '../hooks/claude/ui/surface'
import { shortTests, logoWidthFor, twoLines, MORE, vsHref, mdText, mdLink } from '../hooks/claude/ui/vscode'
import { ASK_LEAD, ASK_LEAD_DRAFT, vsFit, vsRowRoom, VS_ROW_SCALE, NEEDS_YOU_OTHER } from '../hooks/claude/ui/vscode-list'
import { drawNow } from '../hooks/claude/ui/now'
import { mayMove } from '../hooks/core/logo'
import { modeLabel, MODE_MEANING, panelSections, fitRow } from '../hooks/board'
import { paneWidth, VS_WIDE } from '../hooks/claude/ui/parts'
import { hist } from './history-fixture'

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
const KEY_HINTS = [/\[[a-z]\]:/, /Enter open/, /↑↓ move/, /t l s c views/, /\[m\]/, /\[f\]/, /Enter to/]

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
  expect(drawn).not.toEqual(changedTree(BEFORE['terminal 50'], [['Show the plugin version', 'Show the plugin release']]))
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
  // every row is text: a Markdown whose ID is a link to the task, then the title (an open row's cut with "…" when its
  // line is too wide; a done one's at a word after about two lines, then "(more)")
  for (const t of BOARD_TASKS) {
    const open = await ui.find({ key: t.id })
    expect([open?.type, open?.props.pressableLinks], t.id).toEqual(['Markdown', [vsHref('task', t.id)]])
    const md = String(open!.props.text)
    expect(md.startsWith(mdLink(t.id, vsHref('task', t.id))), t.id).toBe(true)
    // an open row's title is its own Markdown after the state cell (T-644); a done one's follows the ID
    const own = await ui.find({ key: `${t.id}-title` })
    const shown = (own ? mdPlain(String(own.props.text)) : mdPlain(md).slice(t.id.length)).trim().replace(new RegExp(`${MORE.replace(/[()]/g, '\\$&')}$`), '').replace(/…$/, '')
    expect(t.title.startsWith(shown) && shown.length >= 6, t.id).toBe(true)
  }
  // "…" only in an open row's title or state part (cut to its one line), never "(more)" there
  for (const t of BOARD_TASKS.filter(t => t.status !== 'done' && t.status !== 'dropped')) expect(await rowText(ui, t.id), t.id).not.toContain(MORE.trim())
  // no Button in a row; the status color is on the status words only, not on the row's box or its title
  for (const t of BOARD_TASKS) {
    const rowBox = await ui.find({ key: `vs-task-${t.id}` })
    expect(rowBox, t.id).toBeDefined()
    expect(rowBox!.props.color ?? rowBox!.props.backgroundColor).toBeUndefined()
    expect(elements(rowBox).filter(n => n.type === 'Button').length, t.id).toBe(0)
    const colored = elements(rowBox!.children).filter(n => n.type === 'Text' && STATUS_COLORS.has(String(n.props?.color)))
    expect(colored.length, t.id).toBeLessThanOrEqual(3) // the needs-you mark, the status words, a later try's "(3)"
    for (const n of colored) expect(texts(n).join(''), t.id).not.toContain(t.title)
  }
  expect((await ui.find({ key: 'vs-task-T-405' }))?.text).toMatch(/✗\sfailed/)
  // what needs you under headings with a count badge, doing and to do as one list with no heading (T-644), the
  // folded groups as heading rows
  for (const [k, h] of [['Waiting for you', '? Waiting for you  1 '], ['Review', '◆ Review  2 '], ['Failed', '✗ Failed  1 ']]) {
    expect((await ui.find({ key: `vs-head-${k}` }))?.text, k).toBe(h)
  }
  for (const k of ['Doing', 'To do']) expect(await ui.find({ key: `vs-head-${k}` }), k).toBeUndefined()
  expect(all).toContain('▾ Backlog 3')
  expect(all).toContain('▾ Dropped 2')
  // tabs without key labels, the one shown bold and not a link
  expect((await ui.find({ key: 'tabs' }))?.props.text).toBe(`**Tasks 20** \u00a0·\u00a0 ${mdLink('Live', vsHref('tab', 'live'))} \u00a0·\u00a0 ${mdLink('Scouts 1', vsHref('tab', 'scouts'))} \u00a0·\u00a0 ${mdLink('Settings', vsHref('tab', 'settings'))}`)
  // the header on readable lines: the tests line short, the mode with its meaning
  expect(await ui.find({ type: 'Text', text: 'tests: claude, typecheck' })).toBeDefined()
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
  expect((await ui.find({ key: 'tabs' }))?.props.text).toBe(`${mdLink('Tasks 20', vsHref('tab', 'tasks'))} \u00a0·\u00a0 ${mdLink('Live', vsHref('tab', 'live'))} \u00a0·\u00a0 **Scouts 1** \u00a0·\u00a0 ${mdLink('Settings', vsHref('tab', 'settings'))}`)
  expect((await ui.find({ key: 'tabs' }))?.props.pressableLinks).toEqual([vsHref('tab', 'tasks'), vsHref('tab', 'live'), vsHref('tab', 'settings')])
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
  expect(shortTests(['a', 'b', 'c'])).toBe('a, b, c')
  expect(shortTests(['npx tsc --noEmit', 'node --test x', 'sh a.sh', 'sh b.sh', 'claude plugin test .'].map(c => c + ' --with-a-long-flag'))).toBe('tsc, node, a, b, claude')
  expect(shortTests(Array(5).fill('AI_API_KEY=test-not-a-real-key node --test $(ls tests)'))).toBe('5 commands')
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
    expect(texts(lines[2]).join(''), at).toBe('branch main · this session drives')
    expect(texts(lines[3]).join(''), at).toMatch(/^tests: claude, typecheck · \d+ at once · \d+ min · \d+ retr(y|ies)$/)
    // the counts as badges: a colored dot, then the count, " · " between
    const counts = await ui.find({ key: 'vs-counts' })
    expect(counts?.props.flexWrap, at).toBe('wrap')
    const badges = (counts!.children as Node[]).filter(n => n && typeof n === 'object')
    expect(texts(badges[0]).join(''), at).toBe('● 2 doing · ')
    expect(elements(badges[0]).find(n => texts(n).join('') === '● ')?.props?.color, at).toBe('success')
    // no all-time total of the tries among the counts (T-630): /symcc-stats has it
    expect(texts(counts!).join(''), at).not.toMatch(/tokens|total:/)
    // the tabs: one line of text that wraps (a Markdown, no Button and no bordered box): the shown tab bold and no link,
    // the others links
    const tabs = await ui.find({ key: 'tabs' })
    expect(tabs?.type, at).toBe('Markdown')
    expect(tabs?.props.text, at).toBe(`**Tasks 20** \u00a0·\u00a0 ${mdLink('Live', vsHref('tab', 'live'))} \u00a0·\u00a0 ${mdLink('Scouts 1', vsHref('tab', 'scouts'))} \u00a0·\u00a0 ${mdLink('Settings', vsHref('tab', 'settings'))}`)
    expect(tabs?.props.pressableLinks, at).toEqual([vsHref('tab', 'live'), vsHref('tab', 'scouts'), vsHref('tab', 'settings')])
    expect(elements(await ui.find({ key: 'vs-header' })).filter(n => n.type === 'Button'), at).toEqual([])
    // nothing cut, no key hints anywhere in the header
    const head = texts(await ui.find({ key: 'vs-header' }))
    expect(head.filter(s => s.includes('…')), at).toEqual([])
    for (const re of KEY_HINTS) expect(head.filter(s => re.test(s)), `${at} ${re}`).toEqual([])
    await ui.unmount()
  }
})

// T-643, T-694: a session that doesn't drive the board gets a short warning line in the warning color right under the
// tests/limits line (inside the facts column), with how to take over, and
// "it looks idle" when a task has waited more than 5 minutes for its worker to start in the driving session.
const QUEUED_402 = { ...BOARD_TASKS.find(t => t.id === 'T-402')!, note: 'starting at the next turn', updated_at: new Date(T0 - 6 * 60_000).toISOString() }
for (const [name, driving, tasks, want] of [
  ['the driving session has no warning line', true, BOARD_TASKS, undefined],
  ['another session drives: the warning line', false, BOARD_TASKS, '⚠ Another session drives. /symcc-drive to drive it from here.'],
  ['another session drives and a task waits 6 min to start: "it looks idle"', false, [...BOARD_TASKS.filter(t => t.id !== 'T-402'), QUEUED_402], '⚠ Another session drives, but looks idle. /symcc-drive to drive it from here.'],
] as const)
  test(`T-643: in VS Code ${name}`, async ($, on) => {
    on('ui.toast', () => ({ value: undefined }))
    seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks, driving } } })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 }, surface: 'vscode' })
    // the line right under the tests/limits line, in the facts column, in the warning color, wrapped (never cut)
    const warn = elements(await ui.find({ key: 'vs-header' })).find(n => n.type === 'Text' && texts(n).join('').startsWith('⚠'))
    expect(warn ? texts(warn).join('') : undefined).toBe(want)
    if (warn) expect([warn.props?.color, warn.props?.wrap]).toEqual(['warning', 'wrap'])
    // inside the facts column, the last line there, right after the tests/limits line's text
    const facts = texts(await ui.find({ key: 'vs-facts' }))
    const limits = facts.findIndex(t => / at once · /.test(t))
    expect(limits >= 0).toBe(true)
    expect(facts.slice(limits + 1)).toEqual(want ? [want] : [])
    await ui.unmount()
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
/** A row as it reads, on its one line ("● T-404  title · ? waiting for 1m · …"); `kind` the row's key start. */
async function rowText(ui: Mounted, id: string, kind = id.startsWith('Q-') ? 'vs-question' : 'vs-task') {
  return texts((await ui.find({ key: `${kind}-${id}` })) as Node).join('').replace(/\u00a0/g, ' ')
}
/** A row's one line (its title and then its dim state part). */
/** The panel columns VS Code reports when its list rows get at most `room` characters (see VS_ROW_SCALE). */
const colsFor = (room: number) => Math.floor(room / VS_ROW_SCALE + 1e-9)
const infoLine = async (ui: Mounted, id: string) => (await ui.find({ key: `vs-task-${id}-top` })) as Node

test('in VS Code the Tasks list at widths 42 and 80: headings with counts, rows and folds as links, no Buttons', async ($, on) => {
  seedBoard(on, { view: MIXED_VIEW })
  on('ui.toast', () => ({ value: undefined }))
  // 42: the narrowest panel (20 columns, see paneWidth) times VS_ROW_SCALE
  for (const bodyColumns of [42, 80]) {
    const at = `width ${bodyColumns}`
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: colsFor(bodyColumns) }, surface: 'vscode' })
    const tree = await ui.drawn()
    const all = texts(tree)
    // headings: the colored mark, the name, the count as a filled badge in the same color
    const heads: [string, string, string][] = [
      ['questions', '? Questions for you  1 ', 'warning'],
      ['Waiting for you', '? Waiting for you  1 ', 'warning'],
      ['Review', '◆ Review  2 ', 'warning'],
      ['Failed', '✗ Failed  1 ', 'error'],
    ]
    for (const [k, text, tone] of heads) {
      const head = await ui.find({ key: `vs-head-${k}` })
      expect(head?.text, `${at} ${k}`).toBe(text)
      const badge = elements(head!.children).find(n => n.type === 'Text' && n.props?.backgroundColor)
      expect([badge?.props?.backgroundColor, badge?.props?.color, badge?.props?.bold], `${at} ${k}`).toEqual([tone, 'inverseText', true])
    }
    for (const k of ['Doing', 'To do']) expect(await ui.find({ key: `vs-head-${k}` }), `${at} ${k}`).toBeUndefined()
    // no Button anywhere on the busy Tasks page: rows, folds, tabs and the mode switch are links; nothing is cut to one
    // line but the rules and a row's state part (already fitted to the width), so nothing runs off the right edge
    expect(elements(tree).filter(n => n.type === 'Button').map(n => n.props?.key), at).toEqual([])
    expect(elements(tree).filter(n => n.type === 'Text' && n.props?.wrap === 'truncate' && !/^[─━]+$/.test(texts(n).join('')) && !texts(n).join('').startsWith(' · ')), at).toEqual([])
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
    // between the ID and the title the status in its color and its time; after the title, dim, the kind or role, the
    // question or why it failed (a question takes about half the free room, cut at a word; at 40 it does not fit
    // beside the cut title)
    expect(await rowText(ui, 'T-404'), at).toMatch(bodyColumns === 80 ? /^● T-404 \? waiting for 1m\s+Pick.* · Yellow or blue for( review\?|…)$/ : /^● T-404 \? waiting for 1m\s+\S/)
    expect(await rowText(ui, 'T-405'), at).toMatch(/^● T-405 ✗ failed 1m ago\s+\S/)
    expect(await rowText(ui, 'T-401'), at).toMatch(/^T-401 ▶ 2m\s+Show/)
    expect(await rowText(ui, 'T-403'), at).toMatch(bodyColumns === 80 ? /^● T-403 ◆ review for 1m\s+.* · ready for your review$/ : /^● T-403 ◆ review for 1m\s+\S/)
    expect(await rowText(ui, 'T-420'), at).toMatch(bodyColumns === 80 ? /^● T-420 ◆ answer for 1m\s+.* · .*investigation/ : /^● T-420 ◆ answer for 1m\s+\S/)
    const status = elements(await infoLine(ui, 'T-405')).find(n => n.type === 'Text' && texts(n).join('').replace(/\u00a0/g, ' ').trim() === '✗ failed 1m ago')
    expect(status?.props?.color, at).toBe('error')
    // a task that needs you gets a clear "●" mark first (in its tone) and a bold title; one that runs starts with its ID
    for (const id of ['T-403', 'T-404', 'T-405', 'T-420']) {
      expect(await rowText(ui, id), `${at} ${id}`).toMatch(new RegExp(`^● ${id}\\s+\\S`))
      expect(String((await ui.find({ key: `${id}-title` }))?.props.text), `${at} ${id}`).toMatch(/^\*\*.+\*\*$/)
    }
    expect(await rowText(ui, 'T-401'), at).toMatch(/^T-401\s+\S/)
    // a long title: one line, the title cut with "…" so the state part stays on it (the whole title is on its page)
    const line = await rowText(ui, 'T-421')
    expect(line.length, at).toBeLessThanOrEqual(bodyColumns)
    expect(line, at).toMatch(/^T-421 ○\s+Draw the board list.*…/)
    const cut = line.replace(/^T-421 ○\s+/, '').split('…')[0]!
    expect(LONG.title.startsWith(cut) && cut.length >= 8, at).toBe(true)
    // the lead's question: a row like a task's, in the warning tone; its ID links to its answer page
    const q = await ui.find({ key: 'Q-3' })
    expect([q?.type, q?.props.pressableLinks], at).toEqual(['Markdown', [vsHref('question', 'Q-3')]])
    const ask = await rowText(ui, 'Q-3')
    // one line: how long ago it was asked between the ID and the question, the question cut with "…" (at 40 the
    // choices do not fit too) so the row is no wider than the panel
    expect(ask, at).toMatch(bodyColumns === 80 ? /^● Q-3 \? 5m\s+Should the board open by itself.* · 2 choices$/ : /^● Q-3 \? 5m\s+Sh\S*( \S+)*…( · 2 choices)?$/)
    expect(ask.length, at).toBeLessThanOrEqual(bodyColumns)
    expect(elements(await ui.find({ key: 'vs-question-Q-3-top' })).find(n => texts(n).join('') === '● ')?.props?.color, at).toBe('warning')
    // no "(more)" on an open row, no key hints, no primary button on a busy board
    for (const t of [...BOARD_TASKS.filter(t => !['done', 'dropped', 'backlog'].includes(t.status)), LONG]) expect(await rowText(ui, t.id), `${at} ${t.id}`).not.toContain(MORE.trim())
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
  expect(await rowText(ui, 'T-401')).toMatch(/^T-401 ▶ 2m\s+\S/)
  expect(await rowText(ui, 'T-404')).toMatch(/^● T-404 \? waiting/)
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
  const BUG = { ...BOARD_TASKS.find(t => t.id === 'T-405')!, id: 'T-502', order: 502, kind: 'bug', note: 'the bug is still there', history: hist('try 1: the bug is still there') }
  const ONE = { ...QUESTION, id: 'Q-4', options: ['Yes'] }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, DOCS, BUG], questions: [ONE] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.drawn()
  const line = (id: string) => rowText(ui, id)
  expect(await line('T-501')).toMatch(/^● T-501 \? waiting for 1m\s+.* · docs · Should the docs( \S+)*…?$/)
  expect(await line('T-502')).toMatch(/^● T-502 ✗ failed 1m ago\s+.* · bug · .*bug/)
  expect(await line('Q-4')).toMatch(/ · 1 choice$/)
  // an investigation's tag is not shown twice
  expect((await line('T-420')).match(/investigation/g)?.length).toBe(1)
  await ui.unmount()
})

test('T-722: in VS Code a row tag is only the kind ("[docs]", "[bug]"), never the role; a plain change with a role shows no tag', async ($, on) => {
  const doing = BOARD_TASKS.find(t => t.id === 'T-402')!
  const todo = BOARD_TASKS.find(t => t.id === 'T-408')!
  const DOCS = { ...doing, id: 'T-601', order: 601, kind: 'docs', role: 'docs' }
  const BUG = { ...todo, id: 'T-602', order: 602, kind: 'bug', role: 'tester' }
  const PLAIN = { ...todo, id: 'T-603', order: 603, role: 'tester' }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, DOCS, BUG, PLAIN] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.drawn()
  expect(await rowText(ui, 'T-601')).toMatch(/ · \[docs\]$/)
  expect(await rowText(ui, 'T-602')).toMatch(/ · \[bug\]$/)
  for (const id of ['T-601', 'T-602', 'T-603']) expect(await rowText(ui, id)).not.toMatch(/tester|docs ·|· docs\]/)
  expect(await rowText(ui, 'T-603')).not.toMatch(/\[/)
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
  expect(await rowText(ui, 'T-408')).toMatch(/^T-408 ●\s+Add/)
  expect(await rowText(ui, 'T-406')).toMatch(/^T-406 ○\s+Write/)
  await ui.press({ key: 'T-408', link: { href: vsHref('task', 'T-408') } })
  expect((await ui.find({ key: 'vs-row-status' }))?.text).toMatch(/^Status● to do/)
  await ui.unmount()
})

test('T-648: in VS Code a task in the queue shows ⧗ and one in the test step ⊛', async ($, on) => {
  const fresh = new Date(T0 - 10_000).toISOString()
  const base = BOARD_TASKS.find(t => t.id === 'T-401')!
  const ran = [{ started: new Date(T0 - 600_000).toISOString(), ended: fresh }]
  const queued = { ...base, id: 'T-493', title: 'Queued one', status: 'doing', note: 'queue (2)', runs: ran, checking: { step: 'queue', place: 2, at: fresh } }
  const tested = { ...base, id: 'T-494', title: 'Tested one', status: 'doing', note: 'running the tests', runs: ran, checking: { step: 'testing', at: fresh } }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, queued, tested] } } as never })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await rowText(ui, 'T-493')).toMatch(/^T-493 ⧗ \d+m\s+Queued one/)
  expect(await rowText(ui, 'T-494')).toMatch(/^T-494 ⊛ \d+m\s+Tested one/)
  expect(texts(await ui.drawn()).join('\n')).not.toContain('⋯')
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
  // the step's icon and the time, no step word (T-581)
  expect(await rowText(ui, 'T-497')).toMatch(/^T-497 ✎ \d+m\s+In the prep step/)
  expect(await rowText(ui, 'T-498')).toMatch(/^T-498 ⌕ \d+m\s+Checker on it/)
  expect(await rowText(ui, 'T-498')).not.toMatch(/[▶⌕] checker/)
  // only the task whose checker runs shows ⌕
  expect(texts(await ui.drawn()).join('\n').match(/\n\u00a0⌕\u00a0/g)?.length).toBe(1)
  await ui.press({ key: 'T-497', link: { href: vsHref('task', 'T-497') } })
  const page = texts(await ui.drawn()).join('\n')
  expect(page).toContain('preparing to merge: committing and checking files')
  // the badge names the state and the time (T-647), and the Stage stepper marks the step now
  expect((await ui.find({ key: 'vs-row-status' }))?.text).toMatch(/▶ doing · \d+m/)
  expect((await ui.find({ key: 'vs-row-stage' }))?.text).toBe('Stageworker ✓ → ● prep → queue → test → merge')
  await ui.unmount()
})

test('T-587: in VS Code the task page badge names the state (T-647) and the Stage stepper the step, with checker only when it runs; a task in review passed every step before review', async ($, on) => {
  const fresh = new Date(T0 - 10_000).toISOString()
  const base = BOARD_TASKS.find(t => t.id === 'T-401')!
  const checker = { ...base, id: 'T-498', title: 'Checker on it', status: 'doing', note: 'a checker agent is trying to break it before it merges', runs: [{ started: new Date(T0 - 600_000).toISOString(), ended: fresh }], checking: { step: 'checker', at: fresh } }
  const done = { ...base, id: 'T-499', title: 'Passed, waits for review', status: 'review', note: '', runs: [{ started: new Date(T0 - 600_000).toISOString(), ended: fresh }] }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, mode: 'auto', checker: true, tasks: [...BOARD_TASKS, checker, done] } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'T-498', link: { href: vsHref('task', 'T-498') } })
  expect((await ui.find({ key: 'vs-row-status' }))?.text).toMatch(/▶ doing · \d+m/)
  expect((await ui.find({ key: 'vs-row-stage' }))?.text).toBe('Stageworker ✓ → prep ✓ → ● checker → queue → test → merge')
  await ui.press({ key: 'back' })
  await ui.press({ key: 'T-499', link: { href: vsHref('task', 'T-499') } })
  expect((await ui.find({ key: 'vs-row-stage' }))?.text).toBe('Stageworker ✓ → prep ✓ → checker ✓ → queue ✓ → test ✓ → ● review → merge')
  expect((await ui.find({ key: 'vs-row-status' }))?.text).toContain('◆ ready for review')
  await ui.unmount()
})

test('in VS Code a doing row shows only the total work time of all tries, no Σ, never "in all"; try 1 only its own time (T-557)', async ($, on) => {
  const at = (min: number) => new Date(T0 - min * 60_000).toISOString()
  const runs = [{ started: at(300), ended: at(250) }, { started: at(200), ended: at(165) }, { started: at(2) }]
  const tasks = BOARD_TASKS.map(t => (t.id === 'T-402' ? { ...t, attempts: 3, runs } : t))
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks } } })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await rowText(ui, 'T-402')).toContain('▶ 1h27m')
  // no try mark on the list row, not "(3)" and not "try 3" (T-628: the band and the task page show it)
  expect(await rowText(ui, 'T-402')).not.toContain('(3)')
  expect(await rowText(ui, 'T-402')).not.toContain('try 3')
  expect(await rowText(ui, 'T-402')).not.toContain('Σ')
  expect(await rowText(ui, 'T-402')).not.toContain('in all')
  expect(await rowText(ui, 'T-401')).not.toContain('Σ')
  await ui.unmount()
})

test('T-590: in VS Code each open task and question is one line: id, state, then the title; a long title is cut with "…" first', async ($, on) => {
  const long = 'Let the lead read every archived task and its whole history when the owner asks about old work from months ago'
  const after = { ...BOARD_TASKS.find(t => t.id === 'T-407')!, id: 'T-578', order: 578, kind: 'feature', title: long, after: ['T-406'] }
  const doing = { ...BOARD_TASKS.find(t => t.id === 'T-401')!, kind: 'investigation', role: 'researcher', attempts: 2 }
  const reason = 'the tests still fail because the merge line runs the old copy of the plugin and never sees the new code that the worker wrote'
  const failed = { ...BOARD_TASKS.find(t => t.id === 'T-405')!, id: 'T-579', order: 579, kind: 'bug', title: long, note: reason, history: hist(`try 1: ${reason}`) }
  const tasks = [...BOARD_TASKS.map(t => (t.id === 'T-401' ? doing : t)), after, failed]
  const ask = { ...QUESTION, text: 'Should the board open by itself when a session starts, or only when the owner asks for it?' }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks, questions: [ask] } } })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [42, 63, 80]) {
    const at = `width ${bodyColumns}`
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: colsFor(bodyColumns) }, surface: 'vscode' })
    await ui.drawn()
    // a row is one row box: no second info line under it, never "(more)"
    for (const [id, kind] of [['T-401', 'vs-task'], ['T-406', 'vs-task'], ['T-404', 'vs-task'], ['T-578', 'vs-task'], ['Q-3', 'vs-question']] as const) {
      const box = (await ui.find({ key: `${kind}-${id}` })) as Node
      const parts = box.children!.filter(n => n && typeof n === 'object') as Node[]
      expect(parts.length, `${at} ${id}`).toBe(1)
      expect(parts[0]!.props?.flexDirection, `${at} ${id}`).toBe('row')
      const line = await rowText(ui, id)
      expect(line, `${at} ${id}`).not.toContain('(more)')
      expect(line, `${at} ${id}`).not.toContain('\n')
    }
    // doing, to do and waiting: id, state, title on the same line (T-644)
    // the tag is only the kind, never the role (T-722); it goes at 42 (fitRow, T-702)
    expect(await rowText(ui, 'T-401'), at).toMatch(bodyColumns === 42 ? /^T-401 ▶ 2m\s+Show[^·]*…$/ : /^T-401 ▶ 2m\s+Show the.*… · \[investigation\]$/)
    expect(await rowText(ui, 'T-406'), at).toMatch(/^T-406 ○\s+Write the guide/)
    expect(await rowText(ui, 'T-404'), at).toMatch(/^● T-404 \? waiting for 1m\s+Pick the/)
    // a long title is cut with "…" and "waits for T-406 · feature" stays on the line (fitRow, T-702): whole at 80, cut
    // from its end at 63; at 42 there is no room for both the title's floor and the end, so the end goes, as on the
    // terminal list
    const line = await rowText(ui, 'T-578')
    expect(line, at).toMatch(bodyColumns === 42 ? /^T-578 ○\s+Let[^·]*…$/ : bodyColumns === 63 ? /^T-578 ○\s+Let.*… · waits for T-406 · featu…$/ : /^T-578 ○\s+Let.*… · waits for T-406 · feature$/)
    expect(line.length, at).toBeLessThanOrEqual(bodyColumns)
    const q = await rowText(ui, 'Q-3')
    expect(q, at).toMatch(bodyColumns === 42 ? /^● Q-3 \? 5m\s+Sh\S*( \S+)*…( · 2 choices)?$/ : /^● Q-3 \? 5m\s+Should the.*… · 2 choices$/)
    // never wider than the row: the title is cut (below its floor when it must) before the state part
    expect(q.length, at).toBeLessThanOrEqual(bodyColumns)
    for (const id of ['T-401', 'T-404', 'T-406']) expect((await rowText(ui, id)).length, `${at} ${id}`).toBeLessThanOrEqual(bodyColumns)
    // a long failure reason: the title keeps its floor, the reason is cut with "…" (fitRow, T-702)
    const why = await rowText(ui, 'T-579')
    expect(why.length, at).toBeLessThanOrEqual(bodyColumns)
    expect(why, at).toMatch(/^● T-579 ✗ failed 1m ago\s+Let the.*…/)
    if (bodyColumns === 80) {
      expect(why, at).toMatch(/… · bug · It failed: the\S*( \S+)*…$/)
      const shownWhy = why.split(' · bug · ')[1]!.replace(/…$/, '')
      const whole = `It failed: ${reason}`
      expect(whole.startsWith(shownWhy), at).toBe(true)
      const title = why.replace(/^● T-579 ✗ failed 1m ago\s+/, '').split(' · ')[0]!
      expect(title.length, at).toBeGreaterThan(16)
    }
    // the row still opens the task page, where the whole title is shown
    await ui.press({ key: 'T-578', link: { href: vsHref('task', 'T-578') } })
    expect(texts(await ui.drawn()).join(' ').replace(/\s+/g, ' '), at).toContain(long)
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('T-702: vsFit is the shared fitRow with one more lead column for " · ": a long title is cut, the row\'s end stays whole', () => {
  const long = 'Let the lead read every archived task and its whole history when the owner asks about old work from months ago'
  for (const room of [42, 63, 80, 126]) {
    for (const end of ['waits for T-690', '[feature]', 'waits for T-406 · feature', '']) {
      const fit = vsFit(12, long, end, room)
      const shared = fitRow(13, long, end, room)
      expect(fit, `${room} ${end}`).toEqual({ title: shared.title, rest: shared.extra })
      // never wider than the room: lead, title, " · " and the end
      expect(12 + fit.title.length + (fit.rest ? 3 + fit.rest.length : 0), `${room} ${end}`).toBeLessThanOrEqual(room)
    }
  }
  // room for the title's floor: the whole end stays, the title is cut with "…"
  expect(vsFit(12, long, 'waits for T-690', 63)).toEqual({ title: `${long.slice(0, 32)}…`, rest: 'waits for T-690' })
  expect(vsFit(12, long, '[feature]', 50).rest).toBe('[feature]')
  // too narrow for the title's floor and a cut end: the end goes, the title takes the room
  expect(vsFit(12, long, '[feature]', 42)).toEqual({ title: `${long.slice(0, 28)}…`, rest: '' })
  // a failed task's reason (cutEnd): the whole title is kept when the reason still gets 12 columns
  const reason = 'It failed: the tests still fail because of the old copy'
  const failed = vsFit(12, 'Fix it', reason, 50, true)
  expect(failed.title).toBe('Fix it')
  expect(failed.rest).toBe(fitRow(13, 'Fix it', reason, 50, true).extra)
  expect(failed.rest.endsWith('…')).toBe(true)
})

test('T-702: in VS Code a row waiting on another task says "waits for T-…" and a long-titled row keeps its whole end, as fitRow fits it', async ($, on) => {
  const long = 'Board list: keep the row\'s end visible by cutting the title instead, so the owner sees what the task waits for'
  const waits = { ...BOARD_TASKS.find(t => t.id === 'T-407')!, id: 'T-702', order: 702, title: long, after: ['T-406'] }
  const tagged = { ...BOARD_TASKS.find(t => t.id === 'T-406')!, id: 'T-703', order: 703, kind: 'feature', title: long }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS, waits, tagged] } } })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [30, 40, 60]) {
    const at = `columns ${bodyColumns}`
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    await ui.drawn()
    for (const [id, end] of [['T-702', 'waits for T-406'], ['T-703', '[feature]']] as const) {
      const line = await rowText(ui, id)
      expect(line, `${at} ${id}`).not.toContain('after T-')
      expect(line.endsWith(` · ${end}`), `${at} ${id}: ${line}`).toBe(true)
      // the part before the title (id and state cell) is the lead; the rest is what fitRow gives for the same room
      const title = line.slice(0, -` · ${end}`.length)
      const lead = title.length - title.replace(/^T-70\d ○\s+/, '').length
      const fit = fitRow(lead + 1, long, end, vsRowRoom(bodyColumns))
      expect([title.slice(lead), end], `${at} ${id}`).toEqual([fit.title, fit.extra])
      expect(fit.title.endsWith('…'), `${at} ${id}`).toBe(true)
      expect(line.length, `${at} ${id}`).toBeLessThanOrEqual(vsRowRoom(bodyColumns))
    }
    await ui.unmount()
  }
})

test('T-590: a waiting question that starts with "after you …" is a normal long text, not an "after T-…" list', async ($, on) => {
  const question = 'after you look at the earlier task, should I also update the docs page and the readme?'
  const tasks = BOARD_TASKS.map(t => (t.id === 'T-404' ? { ...t, title: 'Pick the colors for the review mark on light themes', question } : t))
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks } } })
  // "● T-404  " takes 9 columns: bodyColumns 82 leaves the row 73
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: colsFor(82) }, surface: 'vscode' })
  await ui.drawn()
  const line = await rowText(ui, 'T-404')
  expect(line.length).toBeLessThanOrEqual(82)
  expect(line).not.toContain('+')
  const [, status, after] = line.match(/^● T-404 (\? waiting for 1m)\s+(.*)$/) ?? []
  const [title, rest] = (after ?? '').split(' · ')
  // the title keeps more than its 12-column floor; the question is cut with "…" (fitRow, T-702)
  expect(title!.length).toBeGreaterThan(12)
  expect(status).toMatch(/^\? waiting for 1m$/)
  expect(rest).toMatch(/…$/)
  const shown = rest!.replace(/…$/, '')
  expect(question.startsWith(shown)).toBe(true)
  await ui.unmount()
})

test('T-644: paneWidth: VS Code takes the pane width, the surface width only when the pane tells none, and a wide default when it tells neither', () => {
  expect(paneWidth(true, undefined, undefined)).toBe(VS_WIDE)
  expect(VS_WIDE).toBeGreaterThanOrEqual(150)
  // a pane docked beside the transcript is narrower than the whole surface: its own width wins
  expect(paneWidth(true, 60, 140)).toBe(60)
  expect(paneWidth(true, 40, 160)).toBe(40)
  expect(paneWidth(true, undefined, 120)).toBe(120)
  expect(paneWidth(true, 90, undefined)).toBe(90)
  expect(paneWidth(true, 0, undefined)).toBe(VS_WIDE)
  // the terminal keeps its own width, 60 when none
  expect(paneWidth(false, undefined, 140)).toBe(60)
  expect(paneWidth(false, 50, 140)).toBe(50)
  expect(paneWidth(true, 10, undefined)).toBe(20)
})

test('T-644: in VS Code a wide panel shows a long title whole on one line with its state; only a narrow one cuts it with "…"', async ($, on) => {
  const long = 'Engine/client split: add the engine-only entry point and move the host-free view helpers next to it'
  const doing = { ...BOARD_TASKS.find(t => t.id === 'T-401')!, title: long }
  const todo = { ...BOARD_TASKS.find(t => t.id === 'T-406')!, id: 'T-635', order: 635, kind: 'refactor', title: long }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [...BOARD_TASKS.map(t => (t.id === 'T-401' ? doing : t)), todo] } } })
  on('ui.toast', () => ({ value: undefined }))
  // wide: as the panel tells it (bodyColumns; 80 is about what VS Code told for the owner's ~950px panel, where main cut
  // T-635 to "Engine/client split: add…"), as the surface measured it, or not told at all
  const wide = [
    { at: 'bodyColumns 80', props: { ...PANE.props, bodyColumns: 80 } },
    { at: 'bodyColumns 160', props: { ...PANE.props, bodyColumns: 160 } },
    { at: 'viewport 160', props: { ...PANE.props, bodyColumns: undefined as never }, viewport: { columns: 160, rows: 50 } },
    { at: 'no width', props: { ...PANE.props, bodyColumns: undefined as never } },
  ]
  for (const { at, props, viewport } of wide) {
    const ui = await $.ui.mount({ ...PANE, props, ...(viewport ? { viewport } : {}), surface: 'vscode' })
    const row = await rowText(ui, 'T-401')
    expect(row, at).toMatch(/^T-401 ▶ 2m\s+/)
    expect(row, at).toContain(long)
    expect(row, at).not.toContain('…')
    const box = (await ui.find({ key: 'vs-task-T-401' })) as Node
    expect(box.children!.filter(n => n && typeof n === 'object').length, at).toBe(1)
    const other = await rowText(ui, 'T-635')
    expect(other, at).toMatch(/^T-635 ○\s+Engine\/client split/)
    expect(other, at).toContain(`${long} · [refactor]`)
    await ui.unmount()
  }
  // narrow: the title is cut with "…", the state stays between the ID and the title
  for (const [bodyColumns, viewport] of [[25], [40], [40, { columns: 160, rows: 40 }]] as [number, { columns: number; rows: number }?][]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, ...(viewport ? { viewport } : {}), surface: 'vscode' })
    const row = await rowText(ui, 'T-401')
    expect(row, `width ${bodyColumns}`).toMatch(/^T-401 ▶ 2m\s+Engine\S*( \S+)*…/)
    expect(row.length, `width ${bodyColumns}`).toBeLessThanOrEqual(vsRowRoom(bodyColumns))
    await ui.unmount()
  }
})

test('T-644: in VS Code a running task that asks for more time sits under a needs-you heading, not in the running list, so the states stay in one column', async ($, on) => {
  const tasks = BOARD_TASKS.map(t => (t.id === 'T-402' ? { ...t, time_ask: 'need 10 more minutes' } : t))
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks } } })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [40, 100]) {
    const at = `width ${bodyColumns}`
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    const group = (await ui.find({ key: `vs-group-${NEEDS_YOU_OTHER}` })) as Node
    expect(group, at).toBeDefined()
    expect(texts(group).join('').replace(/ /g, ' '), at).toContain('more time?')
    expect(await rowText(ui, 'T-402'), at).toMatch(/^● T-402 ▶ more time\?\s+\S/)
    // the running list has no row with "●" first, and keeps every doing task's time
    const list = (await ui.find({ key: 'vs-group-running' })) as Node
    const ids = (list.children!.filter(n => n && typeof n === 'object') as Node[]).map(n => String(n.key ?? n.props?.key).replace(/^vs-task-/, ''))
    expect(ids, at).not.toContain('T-402')
    const lines = await Promise.all(ids.map(id => rowText(ui, id)))
    for (const l of lines) expect(l, at).not.toMatch(/^●/)
    expect(await rowText(ui, 'T-401'), at).toMatch(/^T-401 ▶ 2m\s+Show/)
    const cells = await Promise.all(ids.map(async id => texts((await ui.find({ key: `vs-task-${id}-state` })) as Node).join('')))
    expect(new Set(cells.map(c => c.length)).size, at).toBe(1)
    await ui.unmount()
  }
})

test('T-644: in VS Code doing and to do are one list with no heading, in the terminal list\'s order, each row id, state, title with the states in one column', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  for (const k of ['Doing', 'To do']) expect(await ui.find({ key: `vs-head-${k}` }), k).toBeUndefined()
  const list = (await ui.find({ key: 'vs-group-running' })) as Node
  expect(list).toBeDefined()
  // no heading in it: only rows
  const rows = list.children!.filter(n => n && typeof n === 'object') as Node[]
  expect(rows.every(n => String(n.key ?? n.props?.key).startsWith('vs-task-'))).toBe(true)
  // the terminal list's order: the doing tasks, then the to do ones (panelSections)
  const sections = panelSections(BOARD_TASKS as never[], T0, 0) as { doing: { id: string }[]; todo: { id: string }[] }
  const order = [...sections.doing, ...sections.todo].map(t => t.id)
  const ids = rows.map(n => String(n.key ?? n.props?.key).replace(/^vs-task-/, ''))
  expect(ids).toEqual(order)
  // each row: the ID, the state cell (▶ and the time, ○ for to do, ‖ paused), then the title; the titles start in one column
  const lines = await Promise.all(ids.map(id => rowText(ui, id)))
  const starts = new Set<number>()
  for (const [i, line] of lines.entries()) {
    const t = BOARD_TASKS.find(x => x.id === ids[i])!
    expect(line, t.id).toMatch(new RegExp(`^${t.id} (▶( \\d+[smh])?|○|‖ paused)\\s+\\S`))
    starts.add(line.indexOf(t.title.slice(0, 10)))
  }
  expect(starts.size).toBe(1)
  // the state cells themselves are one width
  const cells = await Promise.all(ids.map(async id => texts((await ui.find({ key: `vs-task-${id}-state` })) as Node).join('')))
  expect(new Set(cells.map(c => c.length)).size).toBe(1)
  await ui.unmount()
})

test('T-698: in VS Code a thin rule sits between the header and the tabs on the Tasks, Scouts and Settings tabs', async ($, on) => {
  seedBoard(on)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 70 }, surface: 'vscode' })
  for (const tab of ['tasks', 'scouts', 'settings'] as const) {
    if (tab !== 'tasks') await ui.press({ key: 'tabs', link: { href: vsHref('tab', tab) } })
    // the tabs row starts with the rule (the footer's look), then the tabs
    const row = (await ui.find({ key: 'tabs-row' })) as Node
    const [rule, links] = row.children!.filter(n => n && typeof n === 'object') as Node[]
    expect(rule?.type, tab).toBe('Text')
    expect([rule?.props?.color, rule?.props?.wrap], tab).toEqual(['subtle', 'truncate'])
    expect(texts(rule).join(''), tab).toBe('─'.repeat(70))
    expect(links?.type, tab).toBe('Markdown')
    expect(String(links?.props?.text), tab).toContain('Settings')
    // under the header (its counts), in the drawn order
    const drawn = JSON.stringify(drawnData(await ui.drawn()))
    expect(drawn.indexOf('"vs-counts"'), tab).toBeGreaterThan(-1)
    expect(drawn.indexOf('"vs-counts"') < drawn.indexOf('"tabs-row"'), tab).toBe(true)
  }
  await ui.unmount()
})

test('T-698: in VS Code a long title row fills more of the line (2.1 times the columns), stays one line and keeps its end part', async ($, on) => {
  expect(VS_ROW_SCALE).toBe(2.1)
  const long = 'Dashboard: non-UTF-8 or non-object baseline.json/final.json/events.jsonl must not crash the whole dashboard page when it loads'
  const todo = { ...BOARD_TASKS.find(t => t.id === 'T-406')!, id: 'T-635', order: 635, kind: 'bug', title: long }
  const questions = [{ id: 'Q-9', text: long, asked_at: new Date(T0).toISOString() }]
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, questions, tasks: [...BOARD_TASKS, todo] } } })
  on('ui.toast', () => ({ value: undefined }))
  const bodyColumns = 60
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
  const row = await rowText(ui, 'T-635')
  expect(row).toContain('…')
  expect(row).toMatch(/… · \[bug\]$/)
  expect(row.length).toBeLessThanOrEqual(vsRowRoom(bodyColumns))
  // more than the old 1.8 room gave
  expect(row.length).toBeGreaterThan(Math.floor(bodyColumns * 1.8))
  const box = (await ui.find({ key: 'vs-task-T-635' })) as Node
  expect(box.children!.filter(n => n && typeof n === 'object').length).toBe(1)
  // the Questions-for-you row uses the same room
  const q = await rowText(ui, 'Q-9')
  expect(q).toContain('…')
  expect(q.length).toBeLessThanOrEqual(vsRowRoom(bodyColumns))
  expect(q.length).toBeGreaterThan(Math.floor(bodyColumns * 1.8))
  await ui.unmount()
})
