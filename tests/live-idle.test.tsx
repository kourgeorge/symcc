// T-903: when no task runs, the Live tab's TASKS section (terminal, VS Code), the band and /symcc-status say why nothing
// runs and what to do next (liveIdle in core/live.ts): paused, open tasks that wait, all done, or a brand-new board.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_INDENT, liveIdle, liveIdleLine } from '../hooks/core/live'
import { liveStatusText } from '../hooks/core/live-text'
import { vsHref } from '../hooks/claude/ui/vscode'
import { LIVE_UP_NEXT } from '../hooks/claude/ui/vscode-live'
import { ASK_LEAD } from '../hooks/claude/ui/vscode-list'
import { PANE, T0, seedBoard } from './board-fixture'
import { tabBar, wantTabs } from './vscode-tabs'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, status: string, x: Record<string, unknown> = {}) => ({ id, title: `Task ${id}`, details: '', files: [], status, note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })
const merged = (id: string, minAgo: number) => task(id, 'done', { history: [{ kind: 'merged', at: iso(minAgo), text: 'try 1 → merged into main' }] })

/** The four boards, and the lines each one shows. */
const CASES: { name: string; mode: 'auto' | 'paused'; tasks: unknown[]; lines: string[] }[] = [
  { name: 'paused', mode: 'paused', tasks: [task('T-1', 'todo')], lines: ['Paused: nothing starts. /symcc-mode auto starts work again.'] },
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
    lines: ['All done · last merged T-891, 12m ago', "Tell the lead what's next, or move one of 2 backlog items to todo.", '  ◇ T-893  Task T-893', '  ◇ T-894  Task T-894'],
  },
  {
    // T-924: the next 3 backlog items (lowest priority first, then oldest), then how many more
    name: 'big backlog',
    mode: 'auto',
    tasks: [merged('T-891', 3), task('T-895', 'backlog', { priority: 1 }), task('T-893', 'backlog', { priority: 9 }), task('T-896', 'backlog', { priority: 1 }), task('T-894', 'backlog', { priority: 2 }), task('T-897', 'backlog', { priority: 19 })],
    lines: ['All done · last merged T-891, 3m ago', "Tell the lead what's next, or move one of 5 backlog items to todo.", '  ◇ T-895  Task T-895', '  ◇ T-896  Task T-896', '  ◇ T-894  Task T-894', '  … 2 more in the backlog'],
  },
  { name: 'empty', mode: 'auto', tasks: [], lines: ['No tasks yet. Tell the lead what you want built.'] },
]

const viewOf = (c: (typeof CASES)[number]) => ({ shape: 'view-1', value: { tasks: c.tasks, working: [], scouts: [], mode: c.mode, home_branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3 } })

test('T-903: liveIdle picks the line by why nothing runs, and keeps to the width', () => {
  for (const c of CASES) expect([c.name, liveIdle({ tasks: c.tasks as never[], mode: c.mode }, T0, 100)]).toEqual([c.name, c.lines])
  // T-910: the paused line names a way out that works everywhere it shows (band, chat, Live tab), not a bare "m" key
  const pausedLine = liveIdle({ tasks: [task('T-1', 'todo')] as never[], mode: 'paused' }, T0, 100).join(' ')
  expect(pausedLine).toContain('/symcc-mode auto')
  expect(/(^|\s)m(\s|$)/.test(pausedLine)).toBe(false)
  // no backlog: no backlog part; nothing merged yet: no "last merged" part
  expect(liveIdle({ tasks: [task('T-1', 'done')] as never[], mode: 'auto' }, T0)).toEqual(['All done', "Tell the lead what's next."])
  expect(liveIdle({ tasks: [task('T-1', 'backlog')] as never[], mode: 'auto' }, T0)).toEqual(['All done', "Tell the lead what's next, or move the backlog item to todo.", '  ◇ T-1  Task T-1'])
  // T-924: a long backlog title is cut to the width
  const cut = liveIdle({ tasks: [task('T-1', 'backlog', { title: 'Board written by a newer symcc: say so and stop' })] as never[], mode: 'auto' }, T0, 30)
  expect([cut.at(-1)!.startsWith('  ◇ T-1  Board'), cut.at(-1)!.endsWith('…'), cut.at(-1)!.length <= 30]).toEqual([true, true, true])
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
    const head = texts.findIndex(t => /^─── ❯ TASKS ─/.test(t.text ?? ''))
    const want = c.lines.map(l => ({ text: LIVE_INDENT + l, color: 'inactive' }))
    const at = texts.findIndex(t => t.text === want[0]!.text)
    // under the TASKS heading, dim, one after the other
    expect([head >= 0, at > head]).toEqual([true, true])
    expect(texts.slice(at, at + want.length)).toEqual(want)
    // T-924: an empty line between the idle lines and the merged trains under them
    if (c.name === 'big backlog') {
      expect(texts[at + want.length]?.text).toBe(' ')
      expect(texts[at + want.length + 1]?.text).toContain('work')
    }
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  })

  // T-973: VS Code draws the all done lines its own way: "✓ All done · last merged T-891 12m ago", then "Up next from
  // the backlog" with the first 3 backlog rows (◇, the id in the mono face, the title) and "2 more in the backlog", a
  // quiet button that opens the Tasks tab's Backlog; every idle case ends with the primary "Tell the lead" button
  const VS_DONE: Record<string, { first: string; next: string[]; more?: string }> = {
    'all done': { first: '✓ All done · last merged T-891 12m ago', next: ['T-893', 'T-894'] },
    'big backlog': { first: '✓ All done · last merged T-891 3m ago', next: ['T-895', 'T-896', 'T-894'], more: '2 more in the backlog' },
  }
  test(`T-903, T-973: the VS Code Live tab shows the "${c.name}" idle lines`, async ($, on) => {
    seedBoard(on, { view: viewOf(c) })
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    await ui.press({ key: 'tab-live' })
    const done = VS_DONE[c.name]
    if (!done) {
      expect((await ui.find({ key: 'live-empty' }))?.text).toBe(c.lines[0])
      expect(await ui.find({ key: 'live-next' })).toBeUndefined()
    } else {
      expect((await ui.find({ key: 'live-empty' }))?.text).toBe(done.first)
      expect((await ui.find({ key: 'live-next-head' }))?.text).toBe(LIVE_UP_NEXT)
      for (const id of done.next) {
        const md = await ui.find({ key: `live-next:${id}` })
        expect([md?.type, md?.props.text, md?.props.pressableLinks]).toEqual(['Markdown', `[\`${id}\`](${vsHref('task', id)}) Task ${id}`, [vsHref('task', id)]])
        expect((await ui.find({ key: `live-next-row:${id}` }))?.text.startsWith('◇')).toBe(true)
      }
      const more = await ui.find({ key: 'live-backlog-more' })
      expect(more ? [more.type, more.props.text, more.props.pressableLinks] : undefined).toEqual(done.more ? ['Markdown', `[${done.more}](${vsHref('more', 'backlog')})`, [vsHref('more', 'backlog')]] : undefined)
    }
    // the one main action while nothing runs: tell the lead what is next
    const ask = await ui.find({ key: 'live-ask-lead' })
    expect([ask?.type, ask?.props.variant, ask?.props.label]).toEqual(['Button', 'primary', ASK_LEAD])
    expect((await ui.findAll({ type: 'Button' })).filter(b => b.props.variant === 'primary').length).toBe(1)
    if (done?.more) {
      await ui.press({ key: 'live-backlog-more', link: { href: vsHref('more', 'backlog') } })
      expect(await tabBar(ui)).toEqual(wantTabs('tasks', { tasks: c.tasks.length, scouts: 0 }))
      expect(await ui.find({ key: `vs-task-${done.next[0]}` })).toBeDefined()
    }
    await ui.press({ key: 'tab-tasks' })
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
    const at = lines.findIndex(l => l.startsWith('─── ❯ TASKS'))
    expect([c.name, lines.slice(at + 1, at + 1 + c.lines.length)]).toEqual([c.name, c.lines.map(l => LIVE_INDENT + l)])
    // T-924: an empty line before the merged trains
    if (c.name === 'big backlog') expect([lines[at + 1 + c.lines.length], lines[at + 2 + c.lines.length]?.includes('work')]).toEqual(['', true])
  }
})
