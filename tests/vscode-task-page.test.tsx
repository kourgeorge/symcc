// The task page in VS Code's side panel has its own wide layout (hooks/claude/ui/vscode-task.tsx); on the terminal and
// the desktop it draws exactly as before (task-page-snapshot.ts holds the trees captured from the code before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0, drawnData, changedTree } from './board-fixture'
import { TASK_BEFORE } from './task-page-snapshot'
import { TASK_BEFORE_MOBILE } from './task-page-mobile-snapshot'
import { LONG_TITLE, RICH_IDS, RICH_TASKS, seedRich } from './task-page-fixture'
import { CLICK_HINT } from '../hooks/claude/ui/surface'
import { vsHref } from '../hooks/claude/ui/vscode'
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

/** The action buttons each rich task shows in VS Code, in order, and the one primary (if any) on its page. */
const ACTIONS: Record<string, { keys: string[]; primary?: string }> = {
  'T-501': { keys: ['approve', 'reject', 'show-changes', 'drop', 'needs-review', 'copy'], primary: 'approve' },
  'T-502': { keys: ['stash', 'role', 'drop', 'needs-review', 'copy'], primary: 'retry' },
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
      expect(drawnData(await ui.drawn()), `${surface} ${id}`).toEqual(TASK_BEFORE[`${surface} ${id}`])
      await ui.unmount()
    }
    // and on mobile exactly as before the VS Code card look (T-443)
    const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
    expect(drawnData(await ui.drawn()), `mobile ${id}`).toEqual(TASK_BEFORE_MOBILE[`mobile ${id}`])
    await ui.unmount()
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
    // the id and the title on top, the status badge, then the sections
    expect(await ui.find({ type: 'Text', text: id }), id).toBeDefined()
    expect((await ui.find({ key: 'vs-status' }))?.text, id).toMatch(/^ \S+ .+ /)
    const want = ['Why / where it came from', 'What to do', '▸ Files it may change 3', '▸ Waits for 2', `▸ Time and cost ${'runs' in t ? t.runs.length : 0}`]
    if (t.history.length) want.push('History (2, newest first)')
    if (t.attempts) want.push(t.status === 'doing' ? 'Report (try 1)' : 'Report (try 2, 2 of 2)') // the running try has no report yet
    if (t.status === 'failed') want.push('✗ Why it failed')
    if (t.status === 'waiting') want.push('? Question for you')
    for (const h of want) expect(all, `${id} ${h}`).toContain(h)
    // the details and the report are Markdown, given whole (the report: its first part)
    const md = elements(tree).filter(n => n.type === 'Markdown').map(n => String(n.props?.text))
    expect(md, id).toContain(t.details.trimEnd())
    // the action row: exactly the buttons that fit, and at most one primary on the page
    const row = await ui.find({ key: 'vs-actions' })
    expect(elements(row!.children).filter(n => n.type === 'Button').map(n => n.props?.key), id).toEqual(ACTIONS[id]!.keys)
    const primary = elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary').map(n => n.props?.key)
    expect(primary, id).toEqual(ACTIONS[id]!.primary ? [ACTIONS[id]!.primary] : [])
    // the tasks it waits for (in their fold, closed at first) are links that open them; back to the list is a clear button; no key hints
    expect(await ui.find({ key: 'after-T-499' })).toBeUndefined()
    await ui.press({ key: 'fold-after', link: { href: vsHref('fold', 'fold-after') } })
    expect((await ui.find({ key: 'after-T-499' }))?.type).toBe('Markdown')
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('← Tasks')
    for (const re of KEY_HINTS) expect(hints(all, re), `${id} ${re}`).toEqual([])
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
    expect(drawnData(await ui.drawn()), surface).toEqual(changedTree(TASK_BEFORE[`${surface} T-504`], T504_LATER))
    await ui.unmount()
  }
})

test("T-504's task page snapshot comparison still fails when the drawn tree really changes", async ($, on) => {
  seedRich(on, 'T-504')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const drawn = drawnData(await ui.drawn())
  expect(drawn).toEqual(TASK_BEFORE['terminal T-504'])
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
  await ui.press({ key: 'T-506', link: { href: vsHref('task', 'T-506') } })
  expect(await ui.find({ type: 'Text', text: 'T-506' })).toBeDefined()
  expect((await ui.find({ key: 'vs-status' }))?.text).toMatch(/^ ○ to do /)
  await ui.press({ key: 'fold-after', link: { href: vsHref('fold', 'fold-after') } })
  await ui.press({ key: 'after-T-499', link: { href: vsHref('task', 'T-499') } })
  expect(await ui.find({ type: 'Text', text: 'T-499' })).toBeDefined()
  expect((await ui.find({ key: 'vs-status' }))?.text).toMatch(/^ ✓ done /)
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
  'T-504': { badge: ' ▶ doing ', tone: 'ide' },
  'T-502': { badge: ' ✗ failed ', tone: 'error', callout: ['vs-sec-why-failed', 'error', 'retry'] },
  'T-503': { badge: ' ? waiting for you ', tone: 'warning', callout: ['vs-sec-question', 'warning', 'choice-1'] },
  'T-510': { badge: ' ◆ answered: read it ', tone: 'success' },
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
      const status = await ui.find({ key: 'vs-status' })
      const [badge, tags] = elements(status!.children).filter(n => n.type === 'Text')
      expect(badge?.children, at).toEqual([want.badge])
      expect(badge?.props, at).toMatchObject({ bold: true, backgroundColor: want.tone })
      expect(tags?.props, at).toMatchObject({ wrap: 'wrap', size: 'caption', color: 'inactive' })
      expect(String(tags?.children), at).toMatch(/worker · try 2/)
      // the sections, with their headings
      for (const h of ['Why / where it came from', 'What to do', 'History (2, newest first)']) expect(all, `${at} ${h}`).toContain(h)
      // the folds, closed by default, each with its count; pressing one opens it
      for (const f of ['files', 'after', 'time']) {
        expect(mdPlain(String((await ui.find({ key: `fold-${f}` }))?.props.text)), `${at} ${f}`).toMatch(/^▸ .+ \w+$/)
        expect(await ui.find({ key: `vs-sec-${f}-body` }), `${at} ${f}`).toBeUndefined()
      }
      // what needs you: boxed at the top in its tone, its main button inside
      if (want.callout) {
        const [key, tone, button] = want.callout
        const box = await ui.find({ key })
        expect(box?.props, at).toMatchObject({ borderStyle: 'round', borderColor: tone })
        expect(elements(box!.children).some(n => n.type === 'Button' && n.props?.key === button), at).toBe(true)
        const top = (await ui.drawn()) as Node
        const order = (top.children ?? []).map(n => (n as Node)?.props?.key)
        expect(order.indexOf(key), at).toBeLessThan(order.indexOf('vs-actions'))
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
      expect(await ui.find({ key: 'vs-sec-files-body' }), at).toBeUndefined()
      await ui.unmount()
    })
