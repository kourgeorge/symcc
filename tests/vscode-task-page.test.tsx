// The task page in VS Code's side panel has its own wide layout (hooks/claude/ui/vscode-task.tsx); on the terminal and
// the desktop it draws exactly as before (task-page-snapshot.ts holds the trees captured from the code before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0, BOARD_VIEW, drawnData, changedTree, seedBoard } from './board-fixture'
import { TASK_BEFORE } from './task-page-snapshot'
import { TASK_BEFORE_MOBILE } from './task-page-mobile-snapshot'
import { LONG_TITLE, RICH_IDS, RICH_TASKS, seedRich } from './task-page-fixture'
import { CLICK_HINT } from '../hooks/claude/ui/surface'
import { vsHref, mdLink, NO_TITLE } from '../hooks/claude/ui/vscode'
import { ran } from './fakes'
import { reportPart } from '../hooks/claude/ui/vscode-task'

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
/** All the text of a tree: string children, Button and Input labels and placeholders, Markdown texts (as they read). */
function texts(tree: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') return void out.push(n)
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const e = n as Node
    for (const p of ['label', 'placeholder', 'text'] as const) if (typeof e.props?.[p] === 'string') out.push(e.type === 'Markdown' && p === 'text' ? mdPlain(e.props[p] as string) : (e.props[p] as string))
    for (const c of e.children ?? []) walk(c)
  }
  walk(tree)
  return out
}
const KEY_HINTS = [/\[[a-z]\]:/, /Enter open/, /↑↓ move/, /Esc back/, /Enter sends/, /Enter on empty/, /Enter picks/, /\s\([a-z0-9]\)$/]
/** A fold row ("▸ Waits for 2") ends in its count, which is no key hint. */
const hints = (all: string[], re: RegExp) => all.filter(s => re.test(s) && !/^[▸▾] .+ \d+$/.test(s))

/** The action buttons each rich task shows in VS Code's page header (T-751), in order (the next step, the task's
 *  actions, Drop, copy; needs review, a Button too since T-775, between the last two), all secondary. */
const ACTIONS: Record<string, { keys: string[] }> = {
  'T-501': { keys: ['approve', 'show-changes', 'reject', 'drop', 'copy'] },
  'T-502': { keys: ['retry', 'stash', 'role', 'already-merged', 'drop', 'copy'] },
  'T-503': { keys: ['already-merged', 'drop', 'copy'] }, // its answers are numbered link lines (T-651)
  'T-504': { keys: ['pause', 'drop', 'copy'] },
  'T-505': { keys: ['resume', 'stash', 'role', 'already-merged', 'drop', 'copy'] },
  'T-506': { keys: ['pause', 'stash', 'role', 'drop', 'copy'] },
  'T-507': { keys: ['to-todo', 'role', 'drop', 'copy'] },
  'T-508': { keys: ['copy'] },
  'T-509': { keys: ['retry', 'already-merged', 'copy'] },
  'T-510': { keys: ['done', 'keep-note', 'ask-more', 'drop', 'copy'] },
  'T-511': { keys: ['already-merged', 'drop', 'copy'] },
}

for (const id of RICH_IDS) {
  test(`${id}'s task page on the terminal and the desktop draws exactly as before the VS Code task page`, async ($, on) => {
    seedRich(on, id)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(drawnData(await ui.drawn()), `${surface} ${id}`).toEqual(TASK_BEFORE[`${surface} ${id}`])
      await ui.unmount()
    }
    // and on mobile exactly as before the VS Code card look (T-443)
    const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
    expect(drawnData(await ui.drawn()), `mobile ${id}`).toEqual(TASK_BEFORE_MOBILE[`mobile ${id}`])
    await ui.unmount()
  })

  test(`${id}'s task page in VS Code at width 50: whole text, its sections, only the fitting buttons, all in one style`, async ($, on) => {
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
    // T-751: the page header: the id and the title, the state as chips (no Status row left in the Details), then a divider
    expect(await ui.find({ type: 'Text', text: id }), id).toBeDefined()
    expect((await ui.find({ key: 'vs-state-status' }))?.text, id).toMatch(/^ \S+ .+ $/)
    for (const gone of ['vs-row-status', 'vs-row-now', 'vs-row-stage', 'vs-badge']) expect(await ui.find({ key: gone }), `${id} ${gone}`).toBeUndefined()
    expect((await ui.find({ key: 'vs-header-rule' }))?.text, id).toMatch(/^━+$/)
    // T-774: the folded Time and cost row sums the task's own tries on one line (no tries: its count, 0)
    const want = ['Details', 'What to do', 'runs' in t && t.runs.length ? `▸ Time and cost ${t.runs.length} tries · ${t.id === 'T-504' ? '25m · 4.6k tokens (0.4×' : '40m · 11.6k tokens (1×'} the usual task)` : '▸ Time and cost 0']
    if (t.history.length) want.push('History (2, newest first)')
    if (t.attempts) want.push(t.status === 'doing' ? 'Report (try 1)' : 'Report (try 2, 2 of 2)') // the running try has no report yet
    if (t.status === 'failed') want.push('✗ Why it failed')
    if (t.status === 'waiting') want.push('? Question for you')
    for (const h of want) expect(all, `${id} ${h}`).toContain(h)
    // the details and the report are Markdown, given whole (the report: its first part)
    const md = elements(tree).filter(n => n.type === 'Markdown').map(n => String(n.props?.text))
    expect(md, id).toContain(t.details.trimEnd())
    // the action row: exactly the buttons that fit, all secondary in one style (T-775: no primary, no red)
    const row = await ui.find({ key: 'vs-actions' })
    const open = t.status !== 'done' && t.status !== 'dropped'
    const buttons = elements(row!.children).filter(n => n.type === 'Button')
    expect(buttons.map(n => n.props?.key).filter(k => k !== 'needs-review'), id).toEqual(ACTIONS[id]!.keys)
    for (const b of buttons) {
      expect(b.props?.variant, `${id} ${b.props?.key}`).toBe('secondary')
      expect(b.children ?? [], `${id} ${b.props?.key}`).toEqual([])
    }
    // needs review is a Button like the others (T-775)
    if (open) expect((await ui.find({ key: 'needs-review' }))?.props.label, id).toBe('☐ Needs review')
    const primary = elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary').map(n => n.props?.key)
    expect(primary, id).toEqual([])
    // the tasks it waits for (the After rows of the Details) are links that open them; back to the list is a clear button; no key hints
    expect((await ui.find({ key: 'after-T-499' }))?.type).toBe('Markdown')
    expect((await ui.find({ key: 'vs-row-after-1' }))?.text).toContain('T-498')
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('Tasks')
    for (const re of KEY_HINTS) expect(hints(all, re), `${id} ${re}`).toEqual([])
    expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
    await ui.unmount()
  })
}

// T-437: T-504's try is running, so its page shows running times; they follow the host's clock, not the computer's.
const TEN_MIN = 10 * 60_000
/** T-504's running times at T0 (in the snapshot) and 10 minutes later. */
const T504_LATER: [string, string][] = [
  // the Tries row: the running last try and the sum (T-631)
  // (one character longer, so "4.6k" moves down to the next line with "tokens")
  ['" · last: 5m (running) · all: 25m · 4.6k"', '" · last: 15m (running) · all: 35m ·"'],
  ['["tokens"]', '["4.6k tokens"]'],
  ['"  try 2: 5m (running)"', '"  try 2: 15m (running)"'],
  // the Runs heading's sum of the task's tries (T-774)
  ['"Runs   2 tries · 25m · 4.6k tokens (0.4× the usual task)"', '"Runs   2 tries · 35m · 4.6k tokens (0.4× the usual task)"'],
  ['"  total: 25m · 4.6k', '"  total: 35m · 4.6k'],
  // the header's state line: the total work time (T-751)
  ['"children":["25m"]', '"children":["35m"]'],
]

test("T-504's task page follows the host clock: 10 minutes later only its running times change", async ($, on) => {
  const clock = seedRich(on, 'T-504')
  await clock.set(T0 + TEN_MIN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(drawnData(await ui.drawn()), surface).toEqual(changedTree(TASK_BEFORE[`${surface} T-504`], T504_LATER))
    await ui.unmount()
  }
})

test("T-504's task page snapshot comparison still fails when the drawn tree really changes", async ($, on) => {
  seedRich(on, 'T-504')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const drawn = drawnData(await ui.drawn())
  expect(drawn).toEqual(TASK_BEFORE['terminal T-504'])
  expect(drawn).not.toEqual(changedTree(TASK_BEFORE['terminal T-504'], [['"Runs   2 tries · 25m · 4.6k tokens (0.4× the usual task)"', '"Runs"']]))
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

test('in VS Code a waiting question shows plainly, with its answers as numbered lines you click and a box for your own', async ($, on) => {
  seedRich(on, 'T-503')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: /^Should the report show all of its lines/ })).toBeDefined()
  // T-651: one numbered line each, under one another, each a link that wraps as text does
  expect((await ui.find({ key: 'vs-answers' }))?.props.flexDirection).toBe('column')
  for (const [n, c] of [[1, 'Only the first part'], [2, 'All of it']] as const) {
    const line = await ui.find({ key: `choice-${n}` })
    expect([line?.type, line?.props.text, line?.props.pressableLinks]).toEqual(['Markdown', mdLink(`${n}. ${c}`, vsHref('choice', String(n))), [vsHref('choice', String(n))]])
  }
  expect(await ui.find({ key: 'choice-3' })).toBeUndefined() // no "Answer…": the box is always there
  expect((await ui.find({ key: 'answer' }))?.type).toBe('Input')
  await ui.unmount()
})

test('in VS Code a file request shows the files, with Allow files and Don\'t allow', async ($, on) => {
  seedRich(on, 'T-511')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: '  hooks/board.ts' })).toBeDefined()
  expect((await ui.find({ key: 'choice-1' }))?.props.text).toBe(mdLink('1. Allow files', vsHref('choice', '1')))
  expect((await ui.find({ key: 'choice-2' }))?.props.text).toBe(mdLink("2. Don't allow", vsHref('choice', '2')))
  await ui.unmount()
})

test('in VS Code a task it waits for opens by its button, and "‹ [Tasks]" goes back to the list', async ($, on) => {
  seedRich(on, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'T-506', link: { href: vsHref('task', 'T-506') } })
  expect(await ui.find({ type: 'Text', text: 'T-506' })).toBeDefined()
  expect((await ui.find({ key: 'vs-state-status' }))?.text).toBe(' ○ to do ')
  await ui.press({ key: 'after-T-499', link: { href: vsHref('task', 'T-499') } })
  expect(await ui.find({ type: 'Text', text: 'T-499' })).toBeDefined()
  expect((await ui.find({ key: 'vs-state-status' }))?.text).toBe(' ✓ done ')
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

// T-443: the VS Code task page reads like a card, at widths 40 and 80: the id and title large and bold, a status badge in
// its color, tags on one line, clear sections, the less-used ones folded (closed by default, with a count), what needs
// you boxed at the top in its tone with its buttons right there, at most one primary button, no "…" and no key hints.
const CARDS: Record<string, { badge: string; tone: string; callout?: [string, string, string] }> = {
  'T-504': { badge: '▶ doing · worker · 25m', tone: 'ide' },
  // T-751: Retry is the header's next step, no longer inside the callout
  'T-502': { badge: '✗ failed', tone: 'error', callout: ['vs-sec-why-failed', 'error', ''] },
  'T-503': { badge: '? waiting for you', tone: 'warning', callout: ['vs-sec-question', 'warning', 'choice-1'] },
  // an answered investigation's Status row says so in green (T-701)
  'T-510': { badge: '◆ answered: read it', tone: 'success' },
}
for (const [id, want] of Object.entries(CARDS))
  for (const bodyColumns of [40, 80])
    test(`in VS Code ${id}'s task page reads like a card at width ${bodyColumns}`, async ($, on) => {
      seedRich(on, id)
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
      const at = `${id} width ${bodyColumns}`
      const tree = await ui.drawn()
      const all = texts(tree)
      // the top: id and title large and bold, the badge in the status's color, the tags dim on one wrapping line
      const t = RICH_TASKS.find(x => x.id === id)!
      expect((await ui.find({ type: 'Text', text: id }))?.props, at).toMatchObject({ bold: true, size: 'title' })
      expect((await ui.find({ type: 'Text', text: t.title }))?.props, at).toMatchObject({ bold: true, size: 'title', wrap: 'wrap' })
      // T-751: the page header's state line: the status as a chip in the status's color; no Status row in the Details
      expect(await ui.find({ key: 'vs-badge' }), at).toBeUndefined()
      expect(await ui.find({ key: 'vs-tags-row' }), at).toBeUndefined()
      expect(await ui.find({ key: 'vs-row-status' }), at).toBeUndefined()
      const badge = elements((await ui.find({ key: 'vs-state-status' }))!.children).find(n => n.type === 'Text')!
      expect(badge.children, at).toEqual([` ${want.badge} `])
      expect(badge.props, at).toMatchObject({ bold: true, backgroundColor: want.tone })
      expect((await ui.find({ key: 'vs-row-role' }))?.text, at).toMatch(/^Roleworker/)
      expect((await ui.find({ key: 'vs-row-tries' }))?.text, at).toMatch(/^Tries2/)
      // the sections, with their headings
      for (const h of ['Details', 'What to do', 'History (2, newest first)']) expect(all, `${at} ${h}`).toContain(h)
      // the folds, closed by default, each with its count (Time and cost: the sum of the tries, T-774); pressing one opens it
      for (const f of ['time']) {
        expect(mdPlain(String((await ui.find({ key: `fold-${f}` }))?.props.text)), `${at} ${f}`).toMatch(/^▸ Time and cost 2 tries · \d+m · [\d.]+k tokens \([\d.]+× the usual task\)$/)
        expect(await ui.find({ key: `vs-sec-${f}-body` }), `${at} ${f}`).toBeUndefined()
      }
      // what needs you: boxed at the top in its tone, its main button inside
      if (want.callout) {
        const [key, tone, button] = want.callout
        const box = await ui.find({ key })
        expect(box?.props, at).toMatchObject({ borderStyle: 'round', borderColor: tone })
        if (button) expect(elements(box!.children).some(n => (n.type === 'Button' || n.type === 'Markdown') && n.props?.key === button), at).toBe(true)
        // right under the page header
        const top = (await ui.drawn()) as Node
        const order = (top.children ?? []).map(n => (n as Node)?.props?.key)
        expect(order.indexOf(key), at).toBeGreaterThan(order.indexOf('vs-page-header'))
      }
      // the history: newest first, a mark in its tone, the merge in the success color, the words whole
      const first = await ui.find({ key: 'vs-history-0' })
      expect(first?.text, at).toContain('merged into main')
      expect(elements(first!.children).some(n => n.props?.color === 'success'), at).toBe(true)
      const second = await ui.find({ key: 'vs-history-1' })
      expect(elements(second!.children).some(n => n.props?.color === 'error'), at).toBe(true)
      expect(second?.text, at).toContain('two tests did not find the new section headings')
      // at most one primary button, no "…", no key hints
      const primary = elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary')
      expect(primary.length, at).toBeLessThanOrEqual(1)
      expect(all.filter(s => s.includes('…')), at).toEqual([])
      for (const re of KEY_HINTS) expect(hints(all, re), `${at} ${re}`).toEqual([])
      // a fold opens on its press, and only for this task
      await ui.press({ key: 'fold-time', link: { href: vsHref('fold', 'fold-time') } })
      expect(mdPlain(String((await ui.find({ key: 'fold-time' }))?.props.text)), at).toMatch(/^▾ Time and cost/)
      expect(await ui.find({ key: 'vs-sec-time-body' }), at).toBeDefined()
      await ui.unmount()
    })

// T-448: a task or question with an empty title shows its ID link and a dim "(no title)", never "****" (empty bold marks)
test('in VS Code a row with an empty title or question text shows a dim "(no title)", never "****"', async ($, on) => {
  const blank = { ...RICH_TASKS[0]!, id: 'T-601', order: 601, title: '' }
  const question = { id: 'Q-9', text: '  ', options: ['Yes', 'No'], asked_at: new Date(T0 - 60_000).toISOString() }
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks: [blank], questions: [question] } } })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [40, 80]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    const raw = elements(await ui.drawn()).map(n => n.props?.text).filter((t): t is string => typeof t === 'string')
    expect(raw.filter(t => t.includes('****')), `width ${bodyColumns}`).toEqual([])
    for (const [id, kind, href] of [['T-601', 'vs-task', vsHref('task', 'T-601')], ['Q-9', 'vs-question', vsHref('question', 'Q-9')]] as const) {
      const link = await ui.find({ key: id })
      expect([link?.type, link?.props.text, link?.props.pressableLinks], id).toEqual(['Markdown', mdLink(id, href), [href]])
      const none = elements(await ui.find({ key: `${kind}-${id}-top` })).find(n => n.type === 'Text' && texts(n).join('').trim() === NO_TITLE)
      expect([texts(none).join('').trim(), none?.props?.color], id).toEqual([NO_TITLE, 'inactive'])
    }
    await ui.unmount()
  }
})

// T-448: the files under "Changes" on a task's page in VS Code are links (no Buttons); a press on one opens its diff
test('in VS Code the changed files of a task in review are links, and pressing one opens its diff', async ($, on) => {
  const stat = ' hooks/a.ts | 3 ++-\n docs/b.md  | 1 +\n 2 files changed, 3 insertions(+), 1 deletion(-)\n'
  const diff = 'diff --git a/hooks/a.ts b/hooks/a.ts\n--- a/hooks/a.ts\n+++ b/hooks/a.ts\n@@ -1 +1,2 @@\n-old\n+new\n+more\n'
  seedRich(on, 'T-501', argv => (argv[0] === 'git' && argv[1] === 'diff' ? ran({ stdout: argv.some(a => a.startsWith('--stat')) ? stat : diff }) : ran()))
  for (const bodyColumns of [40, 80]) {
    const at = `width ${bodyColumns}`
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    expect(elements(await ui.drawn()).filter(n => n.type === 'Button' && String(n.props?.key).startsWith('file:')), at).toEqual([])
    for (const f of ['hooks/a.ts', 'docs/b.md']) {
      const link = await ui.find({ key: `file:${f}` })
      expect([link?.type, link?.props.text, link?.props.pressableLinks], `${at} ${f}`).toEqual(['Markdown', mdLink(f, vsHref('file', f)), [vsHref('file', f)]])
    }
    expect(texts(await ui.find({ key: 'vs-file-hooks/a.ts' })).join(''), at).toBe('hooks/a.ts+2 -1')
    await ui.press({ key: 'file:hooks/a.ts', link: { href: vsHref('file', 'hooks/a.ts') } })
    expect(await ui.find({ key: 'diff-back' }), at).toBeDefined()
    expect(texts(await ui.drawn()).join(''), at).toContain('changes in hooks/a.ts')
    await ui.press({ key: 'diff-back' })
    expect(await ui.find({ key: 'file:hooks/a.ts' }), at).toBeDefined()
    await ui.unmount()
  }
})

// T-448: a file name with an unmatched bracket keeps a whole link: "(" and ")" are encoded, so the markdown link ends
// at its own ")" and the href is the one listed in pressableLinks
test('vsHref encodes "(" and ")", so a file named src/a).ts or a(b.ts gets a whole link', () => {
  for (const f of ['src/a).ts', 'a(b.ts']) {
    const href = vsHref('file', f)
    expect(href, f).not.toMatch(/[()]/)
    expect(decodeURIComponent(href.slice(href.lastIndexOf('/') + 1)), f).toBe(f)
    const md = mdLink(f, href)
    expect(md.slice(md.indexOf('](') + 2, -1), f).toBe(href)
  }
  expect(vsHref('file', 'src/a).ts')).toBe('https://symcc.invalid/file/src%2Fa%29.ts')
})
