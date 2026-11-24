// T-699: VS Code's task page shows the same labelled Details list as the terminal and OpenCode (detailRows: same rows,
// labels, order and colours) as a two-column grid, with no tags row; its History is one rail with each event's mark on
// it (no "│" rows), newest first, the newest 10 with a "Show all" button; and the page draws whole at a narrow and a
// wide width.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0, seedBoard } from './board-fixture'
import { historyEntry, historyEvent, HISTORY_COLOR } from '../hooks/core/history'
import { detailRows, type DetailRow } from '../hooks/core/details'
import { when } from '../hooks/core/days'
import { HISTORY_FIRST, VS_LABEL_WIDTH, vsRowKeys } from '../hooks/claude/ui/vscode-task'
import { vsHref } from '../hooks/claude/ui/vscode'
import { RICH_TASKS, seedRich } from './task-page-fixture'

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
/** All the text of a drawn node, Markdown as it reads. */
const textOf = (n: unknown): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' ? ((n as Node).type === 'Markdown' ? mdPlain(String((n as Node).props?.text ?? '')) : textOf((n as Node).children ?? [])) : ''
/** The child elements (not strings or nulls) of a node. */
const kids = (n: Node | undefined): Node[] => ((n?.children ?? []) as unknown[]).flat(9).filter(c => c && typeof c === 'object') as Node[]
const keyOf = (n: Node) => n.key ?? (n.props?.key as string | undefined)

const iso = (ms: number) => new Date(ms).toISOString()
const fresh = iso(T0 - 10_000)
const DEP = { id: 'T-690', title: 'The task it waits for', details: '', files: [], status: 'done', note: '', order: 690, after: [], attempts: 1, history: [], branch: null, created_at: iso(T0), updated_at: iso(T0) }
/** A bug in doing, with a role, two tries and a checker step now. */
const BUG = {
  id: 'T-691', title: 'The history timeline is broken', kind: 'bug', role: 'tester', details: 'Fix it.', files: ['hooks/a.ts', 'tests/'], status: 'doing', note: 'a checker agent is trying to break it before it merges',
  order: 691, after: ['T-690'], attempts: 2, branch: 'symcc/T-691', created_at: iso(T0 - 86_400_000), updated_at: iso(T0 - 60_000),
  origin: { by: 'owner', request: 'fix the history timeline', why: 'the owner sees loose bars between the events' },
  runs: [{ started: iso(T0 - 3_600_000), ended: iso(T0 - 3_000_000) }, { started: iso(T0 - 900_000), ended: fresh, checkers: [{ started: fresh }] }],
  live: { checking: { step: 'checker', at: fresh } }, 
  history: [historyEntry('created', 'created by the owner because the timeline is broken', iso(T0 - 86_400_000)), historyEntry('failed', 'try 1: first fix → tests failed: x', iso(T0 - 3_000_000))],
}
/** A plain change in to do. */
const TODO = { id: 'T-692', title: 'A plain change', details: '', files: [], status: 'todo', note: '', order: 692, after: [], attempts: 0, history: [], branch: null, created_at: iso(T0 - 60_000), updated_at: iso(T0 - 60_000), origin: { by: 'lead', why: 'tidy up' } }

const seed = (on: Parameters<typeof seedBoard>[0], opened: string, tasks: unknown[]) => {
  seedBoard(on, { opened, view: { shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', checker: true, home_branch: 'main', test_commands: ['claude plugin test .'] } } })
  on('fs.exists', () => ({ value: false }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
}

/** The grid's rows as drawn: [key, label, value text, the value's colours]. */
async function gridRows(ui: { find: (q: { key: string }) => Promise<unknown> }) {
  const grid = (await ui.find({ key: 'vs-details-grid' })) as Node | undefined
  expect(grid).toBeDefined()
  return kids(grid).map(row => {
    const [label, value] = kids(row)
    return { key: keyOf(row), label: textOf(label), text: textOf(value), colors: elements(value).filter(n => n.type === 'Text' && typeof n.children?.[0] === 'string').map(n => n.props?.color), labelWidth: label?.props?.width }
  })
}
/** What the grid should show for `rows` (the Role row: the role's name first, its description may follow). */
const want = (rows: DetailRow[]) => rows.map((r, i) => ({ key: vsRowKeys(rows)[i], label: r.label, text: r.segs.map(g => g.text).join(''), colors: r.segs.map(g => g.color) }))

for (const [name, t] of [['a bug in doing with a role, tries and a checker step', BUG], ['a plain change in to do', TODO]] as const)
  test(`VS Code's task page shows the same Details rows as detailRows for ${name}, with no tags row`, async ($, on) => {
    seed(on, t.id, [BUG, TODO, DEP])
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    const drawn = await gridRows(ui)
    const rows = detailRows(t as never, { roles: [], kinds: [], all: [BUG, TODO, DEP] as never, when, nowMs: T0, board: { mode: 'auto', checker: true } })
    const expected = want(rows)
    // the same labels in the same order, each in a fixed label column
    expect(drawn.map(r => r.label)).toEqual(expected.map(r => r.label))
    expect(drawn.map(r => r.key)).toEqual(expected.map(r => r.key))
    expect(new Set(drawn.map(r => r.labelWidth))).toEqual(new Set([VS_LABEL_WIDTH]))
    for (const [i, r] of drawn.entries()) {
      const e = expected[i]!
      // the Role and Kind rows: the page knows their descriptions (the roles and kinds folders), the rows here don't
      if (e.label === 'Role' || e.label === 'Kind') expect(r.text.startsWith(e.text), r.key).toBe(true)
      // an After row: its task id is a link (Markdown), the rest beside it (the gap between them is the space)
      else if (e.label === 'After') expect(r.text, r.key).toBe(e.text.replace(' ', ''))
      else expect([r.text, r.colors], r.key).toEqual([e.text, e.colors])
    }
    // T-751: no Status, Stage or Now row (the page header's state line says the state); the Steps row first when there is one
    expect(drawn.map(r => r.label).filter(l => ['Status', 'Stage', 'Now'].includes(l))).toEqual([])
    expect(drawn[0]!.label).toBe(t.status === 'doing' ? 'Steps' : 'Added')
    expect((await ui.find({ key: 'vs-state-status' }))?.text).toMatch(t.status === 'doing' ? /^ ▶ doing · checker · ⏱ \d+m $/ : /^ ○ to do $/)
    if (t === BUG) {
      expect(drawn.map(r => r.label)).toEqual(['Steps', 'Added', 'Priority', 'Role', 'Kind', 'From', 'Why', 'Request', 'Files', 'Into', 'After', 'Branch', 'Tries'])
      expect(drawn.find(r => r.label === 'Steps')!.text).toContain('● checker')
      // T-966: a doing task's Priority row is only its number
      expect(drawn.find(r => r.label === 'Priority')!.text).toBe('0')
      // the task it waits for opens by its link
      const link = (await ui.find({ key: 'after-T-690' })) as Node
      expect(link?.type).toBe('Markdown')
    }
    // T-966: the only ready to do task is next to start
    if (t === TODO) expect(drawn.find(r => r.label === 'Priority')!.text).toBe('0 · next to start')
    // no tags row, no second Status line, no "Why / where it came from" or "Files it may change" (now in the rows)
    for (const k of ['vs-tags-row', 'vs-tags', 'vs-status', 'vs-stage', 'vs-sec-origin', 'vs-sec-files', 'vs-sec-after']) expect(await ui.find({ key: k }), k).toBeUndefined()
    // the order on the page: the title block, the action buttons, then the Details, then What to do
    const order = kids((await ui.drawn()) as Node).map(keyOf)
    const at = (k: string) => order.indexOf(k)
    expect(at('vs-page-header')).toBe(0)
    expect(at('vs-actions')).toBeLessThan(at('vs-sec-details'))
    expect(at('vs-sec-details')).toBeLessThan(at('vs-sec-what'))
    await ui.unmount()
  })

/** A long history: 14 events, oldest first, the last one merged. */
const LONG = Array.from({ length: 14 }, (_, i) =>
  i === 13 ? historyEntry('merged', `try ${i}: done → merged into main`, iso(T0 - 60_000)) : historyEntry(i % 3 ? 'note' : 'failed', i % 3 ? `the lead added a note: “note ${i}”` : `try ${i}: tried → tests failed: number ${i}`, iso(T0 - (20 - i) * 60_000)),
)

test('VS Code\'s History is one rail: each event\'s mark on it, no "│" rows, newest first; "Show all" past 10 events', async ($, on) => {
  seed(on, 'T-691', [{ ...BUG, history: LONG }, DEP])
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const events = [...LONG].reverse().map(historyEvent)
  const rail = async () => kids((await ui.find({ key: 'vs-history' })) as Node)
  let rows = await rail()
  expect(rows.length).toBe(HISTORY_FIRST)
  expect(HISTORY_FIRST).toBe(10)
  for (const [i, row] of rows.entries()) {
    expect(keyOf(row)).toBe(`vs-history-${i}`)
    const [left, body] = kids(row)
    expect(keyOf(left!)).toBe('rail')
    // the mark at the top of the rail, the line under it growing to the event's whole height
    const [mark, line] = kids(left)
    expect([mark?.type, textOf(mark), mark?.props?.color]).toEqual(['Text', events[i]!.mark, HISTORY_COLOR[events[i]!.tone]])
    expect([line?.type, line?.props?.flexGrow, line?.props?.width]).toEqual(['Box', 1, 1])
    expect(kids(line)).toEqual([])
    // the time and the words to the right, wrapped whole
    expect(textOf(body)).toContain(events[i]!.said)
  }
  // newest first: the merge on top
  expect(textOf(rows[0])).toContain('merged into main')
  // no "│" Text anywhere in the History
  const section = (await ui.find({ key: 'vs-sec-history' })) as Node
  expect(elements(section).filter(n => n.type === 'Text' && /│/.test(textOf(n)))).toEqual([])
  // Show all: every event; the oldest has no line below it
  const button = (await ui.find({ key: 'history-all' })) as Node
  expect(button?.props?.label).toBe(`Show all (${LONG.length - HISTORY_FIRST} more)`)
  await ui.press({ key: 'history-all' })
  rows = await rail()
  expect(rows.length).toBe(LONG.length)
  expect(textOf(rows.at(-1))).toContain('number 0')
  expect(kids(kids(rows.at(-1))[0]).length).toBe(1)
  expect(((await ui.find({ key: 'history-all' })) as Node)?.props?.label).toBe('Show less')
  await ui.unmount()
})

test('VS Code\'s History with 10 events or fewer has no "Show all", and its oldest event no line below it', async ($, on) => {
  seed(on, 'T-691', [BUG, DEP])
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const rows = kids((await ui.find({ key: 'vs-history' })) as Node)
  expect(rows.length).toBe(2)
  expect(kids(kids(rows[0])[0]).length).toBe(2)
  expect(kids(kids(rows[1])[0]).length).toBe(1)
  expect(await ui.find({ key: 'history-all' })).toBeUndefined()
  await ui.unmount()
})

// a doing, a failed and a done task (the rich ones, with long titles and details), at a narrow and a wide panel
for (const id of ['T-504', 'T-502', 'T-508'])
  for (const bodyColumns of [36, 120])
    test(`VS Code's task page for ${id} draws whole at width ${bodyColumns}: nothing cut, every text wraps`, async ($, on) => {
      seedRich(on, id)
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
      const tree = await ui.drawn()
      const all = elements(tree)
      const at = `${id} ${bodyColumns}`
      // no "…" and no Text that cuts (only the rules, drawn to the width: the page header's heavy one, T-751, and the footer's)
      expect(all.filter(n => n.type === 'Text' && /…/.test(textOf(n))).length, at).toBe(0)
      expect(all.filter(n => n.type === 'Text' && n.props?.wrap === 'truncate').map(n => textOf(n).replace(/(.)\1*/, '$1')), at).toEqual(['─', '─'])
      // the title whole; every Details value Text wraps
      expect(textOf(tree), at).toContain(RICH_TASKS.find(t => t.id === id)!.title)
      const grid = (await ui.find({ key: 'vs-details-grid' })) as Node
      for (const row of kids(grid)) {
        const value = kids(row)[1]!
        expect(value.props?.flexShrink, `${at} ${keyOf(row)}`).toBe(1)
        for (const t of kids(value).filter(n => n.type === 'Text')) expect(t.props?.wrap, `${at} ${keyOf(row)}`).toBe('wrap')
      }
      // its sections, in order, each once
      const order = kids(tree as Node).map(keyOf).filter(Boolean)
      expect(new Set(order).size, at).toBe(order.length)
      expect(order.indexOf('vs-sec-details'), at).toBeGreaterThan(order.indexOf('vs-actions'))
      await ui.unmount()
    })

test("T-855: VS Code's task page draws each agent line of a try with ⌀ before its token count", async ($, on) => {
  const agent = { kind: 'worker' as const, id: 'ses_worker_one_Qr2', started: iso(T0 - 900_000), ended: iso(T0 - 300_000), tokens: { input: 4_100_000 } }
  const t = { ...BUG, runs: [{ started: iso(T0 - 900_000), ended: iso(T0 - 300_000), agents: [agent] }], live: undefined }
  seed(on, t.id, [t, DEP])
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'fold-time', link: { href: vsHref('fold', 'fold-time') } })
  expect(textOf(await ui.find({ key: 'vs-sec-time-body' }))).toContain('ses…Qr2  10m · ⌀ 4.1M')
})
