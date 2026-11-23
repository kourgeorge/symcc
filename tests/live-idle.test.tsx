// T-903: when no task runs, the Live tab's TASKS section (terminal, VS Code), the band and /symcc-status say why nothing
// runs and what to do next (liveIdle in core/live.ts): paused, open tasks that wait, all done, or a brand-new board.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_INDENT, liveIdle, liveIdleLine } from '../hooks/core/live'
import { liveStatusText } from '../hooks/core/live-text'
import { vsHref } from '../hooks/claude/ui/vscode'
import { PANE, T0, seedBoard } from './board-fixture'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, status: string, x: Record<string, unknown> = {}) => ({ id, title: `Task ${id}`, details: '', files: [], status, note: '', order: Number(id.slice(2)), after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })
const merged = (id: string, minAgo: number) => task(id, 'done', { history: [{ kind: 'merged', at: iso(minAgo), text: 'try 1 → merged into main' }] })

/** The four boards, and the lines each one shows. */
const CASES: { name: string; mode: 'auto' | 'paused'; tasks: unknown[]; lines: string[] }[] = [
  { name: 'paused', mode: 'paused', tasks: [task('T-1', 'todo')], lines: ['Paused: nothing starts. m changes the mode.'] },
  {
    name: 'waiting',
    mode: 'auto',
    tasks: [task('T-6', 'paused'), task('T-7', 'todo', { after: ['T-6'] }), task('T-5', 'waiting', { ask: { by: 'worker', text: 'Which one?', asked_at: iso(2) } })],
    lines: ['Nothing running · 3 waiting: T-5 needs you, T-6 paused, T-7 waits for T-6'],
  },
  {
    name: 'all done',
    mode: 'auto',
    tasks: [merged('T-890', 120), merged('T-891', 12), task('T-892', 'dropped'), task('T-893', 'backlog'), task('T-894', 'backlog')],
    lines: ['All done · last merged T-891, 12m ago', "Tell the lead what's next, or move one of 2 backlog items to todo."],
  },
  { name: 'empty', mode: 'auto', tasks: [], lines: ['No tasks yet. Tell the lead what you want built.'] },
]

const viewOf = (c: (typeof CASES)[number]) => ({ shape: 'view-1', value: { tasks: c.tasks, working: [], scouts: [], mode: c.mode, home_branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3 } })

test('T-903: liveIdle picks the line by why nothing runs, and keeps to the width', () => {
  for (const c of CASES) expect([c.name, liveIdle({ tasks: c.tasks as never[], mode: c.mode }, T0, 100)]).toEqual([c.name, c.lines])
  // no backlog: no backlog part; nothing merged yet: no "last merged" part
  expect(liveIdle({ tasks: [task('T-1', 'done')] as never[], mode: 'auto' }, T0)).toEqual(['All done', "Tell the lead what's next."])
  expect(liveIdle({ tasks: [task('T-1', 'backlog')] as never[], mode: 'auto' }, T0)).toEqual(['All done', "Tell the lead what's next, or move the backlog item to todo."])
  // a board whose tasks were all archived is not new
  expect(liveIdle({ tasks: [], archived_done: ['T-1'], mode: 'auto' }, T0)).toEqual(['All done', "Tell the lead what's next."])
  // narrow: the waiting line names fewer reasons and never goes past the width
  const narrow = liveIdle({ tasks: CASES[1]!.tasks as never[], mode: 'auto' }, T0, 44)
  expect(narrow).toEqual(['Nothing running · 3 waiting: T-5 needs you'])
  // a task waiting on several open tasks names the first, plus a count: no ", " inside one reason
  const many = [task('T-1', 'todo', { after: ['T-2', 'T-3', 'T-4', 'T-5'] }), ...['T-2', 'T-3', 'T-4', 'T-5'].map(id => task(id, 'todo'))]
  const line = liveIdle({ tasks: many as never[], mode: 'auto' }, T0, 100)[0]!
  expect(line).toBe('Nothing running · 5 waiting: T-1 waits for T-2 +3, T-2 ready, T-3 ready')
  expect(line.split(': ')[1]!.split(', ')[0]).toBe('T-1 waits for T-2 +3')
  for (const w of [20, 30, 44]) for (const c of CASES) for (const l of liveIdle({ tasks: c.tasks as never[], mode: c.mode }, T0, w)) expect([w, l, l.length <= w]).toEqual([w, l, true])
})

for (const c of CASES) {
  test(`T-903: the terminal Live tab shows the "${c.name}" idle lines, dim, under TASKS`, async ($, on) => {
    seedBoard(on, { view: viewOf(c) })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'terminal' })
    await ui.press({ key: 'tab-live' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => ({ text: t.text, color: t.props.color }))
    const head = texts.findIndex(t => /^TASKS ─/.test(t.text ?? ''))
    const want = c.lines.map(l => ({ text: LIVE_INDENT + l, color: 'inactive' }))
    const at = texts.findIndex(t => t.text === want[0]!.text)
    // under the TASKS heading, dim, one after the other
    expect([head >= 0, at > head]).toEqual([true, true])
    expect(texts.slice(at, at + want.length)).toEqual(want)
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  })

  test(`T-903: the VS Code Live tab shows the "${c.name}" idle lines`, async ($, on) => {
    seedBoard(on, { view: viewOf(c) })
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
    expect((await ui.find({ key: 'live-empty' }))?.text).toBe(c.lines[0])
    expect((await ui.find({ key: 'live-empty-1' }))?.text).toBe(c.lines[1])
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
    await ui.unmount()
  })
}

test('T-903: the band line (liveIdleLine) is the first idle line, cut with "…" when narrow, never broken mid-sentence', () => {
  for (const c of CASES) expect([c.name, liveIdleLine({ tasks: c.tasks as never[], mode: c.mode }, T0, 100)]).toEqual([c.name, c.lines[0]])
  const paused = liveIdleLine({ tasks: [task('T-1', 'done')] as never[], mode: 'paused' }, T0, 39)
  expect([paused, paused.length <= 39, paused.endsWith('…')]).toEqual([paused, true, true])
  expect(liveIdleLine({ tasks: [], mode: 'auto' }, T0, 30).endsWith('…')).toBe(true)
  // the waiting line still drops the reasons that don't fit instead of cutting one
  expect(liveIdleLine({ tasks: CASES[1]!.tasks as never[], mode: 'auto' }, T0, 44)).toBe('Nothing running · 3 waiting: T-5 needs you')
})

test('T-903: /symcc-status shows the idle lines under TASKS', () => {
  for (const c of CASES) {
    const lines = liveStatusText({ tasks: c.tasks, mode: c.mode } as never, [], T0).split('\n')
    const at = lines.findIndex(l => l.startsWith('TASKS'))
    expect([c.name, lines.slice(at + 1, at + 1 + c.lines.length)]).toEqual([c.name, c.lines.map(l => LIVE_INDENT + l)])
  }
})
