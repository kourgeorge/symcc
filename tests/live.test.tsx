// T-690: the Live tab: one lane per task in doing (core/live.ts works out the stations, the order, next up and today's
// numbers; claude/ui/live.tsx draws them on the terminal panel).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { liveLanes, liveLayout, laneLines, liveLabelLine, liveStations, liveTrains, trainRows, type LiveTrain, nextUpLine, liveToday, todayLines, segText, liveBlink, liveHeader, tabRow, LIVE_TABS, LIVE_EMPTY, LIVE_LEGEND } from '../hooks/core/live'
import { textWidth } from '../hooks/core/stats'
import { FINISH_STALE_MS } from '../hooks/core/lead'
import { listKeys } from '../hooks/board'
import { viewTask } from '../hooks/core/board-parts'
import { LIVE_TICK_MS } from '../hooks/claude/ui/live'
import { BLINK_CSS } from '../hooks/claude/ui/vscode-live'
import { mdLink, vsHref } from '../hooks/claude/ui/vscode'
import { PANE, T0, seedBoard } from './board-fixture'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })

/** Four tasks in doing, one at each place: a worker running (T-687), a checker (T-686), the tests (T-685), the merge queue (T-684). */
const TASKS = [
  task('T-687', 'Organizational memory search', { runs: [{ started: iso(4) }] }),
  task('T-684', '/symcc-doctor checks the hooks', { attempts: 2, runs: [{ started: iso(60), ended: iso(50), tokens: { input: 1_100_000 } }, { started: iso(30), ended: iso(10), tokens: { input: 1_100_000 } }], checking: { step: 'queue', at: iso(0), place: 2 }, history: [{ kind: 'checker-problems', at: iso(40), text: 'try 1: checker: problems' }, { kind: 'stage', at: iso(5), text: 'try 2: waits in the merge queue (place 2)' }] }),
  task('T-686', 'Scout page: drop the first line', { runs: [{ started: iso(20), ended: iso(2), tokens: { input: 540_000 } }], checking: { step: 'checker', at: iso(0) }, checker: 'agent-c', history: [{ kind: 'stage', at: iso(2), text: 'try 1: prep started' }] }),
  task('T-685', 'OpenCode: give every board screen buttons', { runs: [{ started: iso(25), ended: iso(9), tokens: { input: 3_400_000 } }], checking: { step: 'testing', at: iso(0) }, history: [{ kind: 'stage', at: iso(3), text: 'try 1: tests started' }] }),
  task('T-688', 'Handed back, in prep', { runs: [{ started: iso(15), ended: iso(1), tokens: { input: 200_000 } }], finishing: iso(0), checking: { step: 'prep', at: iso(0) } }),
  task('T-600', 'A merged one', { status: 'done', runs: [{ started: iso(300), ended: iso(200), tokens: { input: 800_000 } }], history: [{ kind: 'merged', at: iso(30), text: 'try 1 → merged into main' }] }),
  task('T-601', 'A failed one', { status: 'failed', updated_at: iso(20) }),
  task('T-690', 'Live tab part 1', { status: 'todo', order: 5 }),
  task('T-691', 'Live tab in VS Code', { status: 'todo', after: ['T-690'], order: 1 }),
  task('T-692', 'Live tab in OpenCode', { status: 'todo', after: ['T-600'], order: 9 }),
  task('T-693', 'A backlog idea', { status: 'backlog' }),
]
const view = (checker: boolean) => ({ tasks: TASKS as never[], checker, mode: 'auto' as const, max_parallel: 3 })

test('T-690: liveLanes puts each doing task at its station, and leaves check out when the checker is off', () => {
  const at = (checker: boolean) => Object.fromEntries(liveLanes(view(checker), T0).map(l => [l.id, l.station]))
  expect(at(true)).toEqual({ 'T-687': 'work', 'T-688': 'check', 'T-686': 'check', 'T-685': 'tests', 'T-684': 'queue' })
  expect(liveLanes(view(true), T0)[0]!.stations).toEqual(['work', 'check', 'queue', 'tests', 'merged'])
  // checker off: no check station; prep counts at work
  const off = liveLanes(view(false), T0)
  expect(off[0]!.stations).toEqual(['work', 'queue', 'tests', 'merged'])
  expect(at(false)['T-688']).toBe('work')
  // only tasks in doing get a lane
  expect(off.map(l => l.id).sort()).toEqual(['T-684', 'T-685', 'T-686', 'T-687', 'T-688'])
  const lane = (id: string) => liveLanes(view(true), T0).find(l => l.id === id)!
  expect(lane('T-684').place).toBe(2)
  expect(lane('T-684').sentBack).toBe(1)
  expect(lane('T-684').tryNo).toBe(2)
  expect(lane('T-684').tokens).toBe(1_100_000)
  // a running worker's tokens are only known at its hand-back
  expect(lane('T-687').tokens).toBe(undefined)
  // the time at the station: from the history's stage line
  expect(lane('T-685').sinceMs).toBe(T0 - 3 * 60_000)
  expect(liveHeader(view(true), liveLanes(view(true), T0))).toBe('⏵ auto · agents 2/3 busy')
})

test('T-709: an approved task in review, or a waiting one whose merge runs, gets a lane at its real station while its check step is fresh', () => {
  const sec = (s: number) => new Date(T0 - s * 1000).toISOString()
  const tried = { runs: [{ started: iso(40), ended: iso(20), tokens: { input: 300_000 } }] }
  const lanes = (...tasks: unknown[]) => liveLanes({ tasks: tasks as never[], checker: true, mode: 'auto', max_parallel: 3 }, T0)
  // (1) a review task whose approve is in its tests, then in the merge queue at place 2
  const testing = lanes(task('T-1', 'Approved', { status: 'review', ...tried, checking: { step: 'testing', at: sec(5) } }))
  expect(testing.map(l => [l.id, l.station])).toEqual([['T-1', 'tests']])
  const queued = lanes(task('T-1', 'Approved', { status: 'review', ...tried, checking: { step: 'queue', at: sec(5), place: 2 } }))
  expect(queued.map(l => [l.station, l.place])).toEqual([['queue', 2]])
  // (2) a stale check step, or none: no lane
  expect(lanes(task('T-1', 'Approved', { status: 'review', ...tried, checking: { step: 'testing', at: new Date(T0 - FINISH_STALE_MS - 1000).toISOString() } }))).toEqual([])
  expect(lanes(task('T-1', 'Approved', { status: 'review', ...tried }))).toEqual([])
  // (3) a waiting task whose merge runs once its files are clear
  const merging = lanes(task('T-2', 'Files cleared', { status: 'waiting', ...tried, checking: { step: 'merging', at: sec(5) } }))
  expect(merging.map(l => [l.id, l.station])).toEqual([['T-2', 'merged']])
  // order: an approve by when it started (its prep line), next to the doing tasks by when their try started
  const order = lanes(
    task('T-3', 'Worker', { runs: [{ started: iso(10) }] }),
    task('T-1', 'Approved', { status: 'review', ...tried, checking: { step: 'testing', at: sec(5) }, history: [{ kind: 'stage', at: iso(15), text: 'try 1: prep started' }] }),
    task('T-2', 'Files cleared', { status: 'waiting', ...tried, checking: { step: 'merging', at: sec(5) }, history: [{ kind: 'stage', at: iso(30), text: 'try 1: prep started' }, { kind: 'stage', at: iso(3), text: 'try 1: prep started' }] }),
  )
  expect(order.map(l => l.id)).toEqual(['T-1', 'T-3', 'T-2'])
  expect(order[0]!.sinceMs).toBe(T0 - 5000)
})

test('T-690: lanes are ordered by when the task entered doing, earliest first', () => {
  expect(liveLanes(view(true), T0).map(l => l.id)).toEqual(['T-684', 'T-685', 'T-686', 'T-688', 'T-687'])
})

test('T-690, T-715: next up lists only the todo tasks free to start, in start order; one waiting for a todo task on no lane is counted in "more"', () => {
  const t = liveTrains(view(true), T0)
  // T-692 waits on a done task: free; T-691 waits on T-690, which is todo and runs on no lane
  expect(t.next.map(x => x.id)).toEqual(['T-690', 'T-692'])
  expect(t.next.map(x => x.stuck)).toEqual([[], []])
  expect(t.more).toBe(1)
  expect(Object.values(t.lanes).flat()).toEqual([])
})

test('T-690, T-715: the next up line', () => {
  const t = liveTrains(view(true), T0)
  expect(nextUpLine(t, 120)).toBe('next up  T-690 Live tab pa… · T-692 Live tab in… · 1 more')
  expect(nextUpLine(t, 40)).toBe('next up  T-690 Live tab pa… · 2 more')
  expect(nextUpLine({ next: [], more: 0, hung: 0 }, 60)).toBe('next up  nothing in todo')
  expect(nextUpLine({ next: [], more: 0, hung: 2 }, 60)).toBe('next up  nothing free to start')
})

// T-715: waiting trains. Two lanes: T-712 at work, T-690 at check; todo tasks waiting for them, for each other, for a
// failed task; one free and one waiting for the free one.
const TRAINS = [
  task('T-712', 'Scout ordering fix', { runs: [{ started: iso(2) }] }),
  task('T-690', 'Live tab first part', { attempts: 2, runs: [{ started: iso(30), ended: iso(3), tokens: { input: 1_400_000 } }], checking: { step: 'checker', at: iso(0) }, checker: 'agent-c', history: [{ kind: 'stage', at: iso(3), text: 'try 2: prep started' }] }),
  task('T-701', 'A failed one', { status: 'failed', updated_at: iso(20) }),
  task('T-713', 'Task files: no silent drops', { status: 'todo', after: ['T-712'] }),
  task('T-714', 'Help: /symcc-help shows all', { status: 'todo', after: ['T-713'] }),
  task('T-716', 'Live deps drawn as trains', { status: 'todo', after: ['T-712', 'T-690'] }),
  task('T-717', 'Waits for a todo and a lane', { status: 'todo', after: ['T-690', 'T-713'] }),
  task('T-718', 'Waits for the failed one', { status: 'todo', after: ['T-701'] }),
  task('T-715', 'Free to start', { status: 'todo', order: 1 }),
  task('T-719', 'Waits for the free one', { status: 'todo', after: ['T-715'] }),
]
const trainView = { tasks: TRAINS as never[], checker: true, mode: 'auto' as const, max_parallel: 3 }
/** A tree of trains as "id(+also)[children]" text, to compare in one line. */
const shape = (xs: readonly { id: string; also: string[]; trains: unknown[] }[]): string =>
  xs.map(x => `${x.id}${x.also.length ? `(+${x.also.join(',')})` : ''}${x.trains.length ? `[${shape(x.trains as never)}]` : ''}`).join(' ')

test('T-715: liveTrains hangs a todo task under its running blocker, a todo-on-todo under its blocker\'s train, a several-blocker one once under the furthest from merging; next up holds the free and the stuck', () => {
  const t = liveTrains(trainView, T0)
  // T-713 under T-712's lane; T-714 (waits for T-713) under T-713's train; T-716 waits for T-712 (work) and T-690
  // (check): under T-712, the earlier station; T-717 waits for T-690 (running) and T-713 (todo): under T-713
  expect(shape(t.lanes['T-712']!)).toBe('T-713[T-714 T-717(+T-690)] T-716(+T-690)')
  expect(t.lanes['T-690']).toEqual([])
  // no copies: each waiting task once
  const all = (xs: readonly LiveTrain[]): string[] => xs.flatMap(x => [x.id, ...all(x.trains)])
  expect(all(Object.values(t.lanes).flat()).sort()).toEqual(['T-713', 'T-714', 'T-716', 'T-717'])
  expect(t.hung).toBe(4)
  // next up: the free one, and the one stuck behind a failed task; T-719 (waits for the free T-715) is "1 more"
  expect(t.next).toEqual([
    { id: 'T-715', title: 'Free to start', stuck: [] },
    { id: 'T-718', title: 'Waits for the failed one', stuck: [{ id: 'T-701', status: 'failed' }] },
  ])
  expect(t.more).toBe(1)
  expect(nextUpLine(t, 120)).toBe('next up  T-715 Free to sta… · T-718 Waits for t… (waits T-701, failed) · 1 more')
  // a paused blocker, or one waiting for the owner: stuck too
  const paused = liveTrains({ ...trainView, tasks: TRAINS.map(x => (x.id === 'T-701' ? { ...x, status: 'paused' } : x)) as never[] }, T0)
  expect(paused.next[1]!.stuck).toEqual([{ id: 'T-701', status: 'paused' }])
})

test('T-715: two blockers at the same station: the train hangs under the one that started latest', () => {
  const tasks = [
    task('T-1', 'Early', { runs: [{ started: iso(30) }] }),
    task('T-2', 'Late', { runs: [{ started: iso(5) }] }),
    task('T-3', 'Waits for both', { status: 'todo', after: ['T-1', 'T-2'] }),
  ]
  const t = liveTrains({ tasks: tasks as never[], checker: true }, T0)
  expect(shape(t.lanes['T-2']!)).toBe('T-3(+T-1)')
  expect(t.lanes['T-1']).toEqual([])
})

test('T-715: train rows: "└─◇" indented by level, "waits" and "+ also"; nothing wider than the panel; long chains end in "+N more waiting"', () => {
  const t = liveTrains(trainView, T0)
  const rows = trainRows(t.lanes['T-712']!, 100)
  expect(rows.map(r => segText(r.segs))).toEqual([
    '   └─◇ T-713 Task files: no silent d…  waits',
    '      └─◇ T-714 Help: /symcc-help shows…  waits',
    '      └─◇ T-717 Waits for a todo and a …  waits  + also T-690',
    '   └─◇ T-716 Live deps drawn as trai…  waits  + also T-690',
  ])
  expect(rows.map(r => r.id)).toEqual(['T-713', 'T-714', 'T-717', 'T-716'])
  for (const w of [100, 60, 40, 32, 24])
    for (const r of trainRows(t.lanes['T-712']!, w)) expect([w, segText(r.segs), textWidth(segText(r.segs)) <= w]).toEqual([w, segText(r.segs), true])
  // a chain of 9: three levels, then the rest counted
  const chain = [task('T-1', 'Runs', { runs: [{ started: iso(3) }] }), ...Array.from({ length: 9 }, (_, i) => task(`T-${i + 2}`, `Step ${i + 2}`, { status: 'todo', after: [`T-${i + 1}`] }))]
  const deep = trainRows(liveTrains({ tasks: chain as never[] }, T0).lanes['T-1']!, 60)
  expect(deep.map(r => r.id ?? segText(r.segs))).toEqual(['T-2', 'T-3', 'T-4', '   └─ +6 more waiting'])
  // eight side by side: six, then the rest counted
  const wide = [task('T-1', 'Runs', { runs: [{ started: iso(3) }] }), ...Array.from({ length: 8 }, (_, i) => task(`T-${i + 2}`, `Side ${i + 2}`, { status: 'todo', after: ['T-1'] }))]
  const many = trainRows(liveTrains({ tasks: wide as never[] }, T0).lanes['T-1']!, 60)
  expect(many.length).toBe(7)
  expect(segText(many[6]!.segs)).toBe('   └─ +2 more waiting')
})

test('T-690: today counts merges, send-backs, failures and tokens of today', () => {
  const d = liveToday(TASKS as never[], T0, 0)
  expect(d).toEqual({ merged: 1, sentBack: 1, failed: 1, tokens: 1_100_000 + 1_100_000 + 540_000 + 3_400_000 + 200_000 + 800_000 })
  expect(todayLines(d, 80)).toEqual(['today    ✓ 1 merged   ↺ 1 sent back   ✗ 1 failed   Σ 7.1M tokens'])
  for (const l of todayLines(d, 30)) expect(textWidth(l)).toBeLessThanOrEqual(30)
})

test('T-690: today works on a board view whose done tasks come without their history (as OpenCode reads it)', () => {
  const slim: Record<string, unknown>[] = TASKS.map(t => viewTask((t.id === 'T-600' ? { ...t, merged: 'abc1234', updated_at: iso(30) } : t) as never))
  expect('history' in slim.find(t => t.id === 'T-600')!).toBe(false)
  expect(liveToday(slim as never[], T0, 0)).toEqual({ merged: 1, sentBack: 1, failed: 1, tokens: 1_100_000 + 1_100_000 + 540_000 + 3_400_000 + 200_000 + 800_000 })
})

test('T-690: lane lines fit the width with nothing cut, and the current station blinks', () => {
  for (const checker of [true, false])
    for (const width of [100, 80, 60, 50, 40, 32]) {
      const lanes = liveLanes(view(checker), T0)
      const l = liveLayout(lanes, liveStations(checker), width)
      expect(textWidth(liveLabelLine(l))).toBeLessThanOrEqual(width)
      for (const lane of lanes)
        for (const s of laneLines(lane, l, { nowMs: T0, frame: 0 })) expect(textWidth(segText(s))).toBeLessThanOrEqual(width)
    }
  const lanes = liveLanes(view(true), T0)
  const l = liveLayout(lanes, liveStations(true), 80)
  const q = lanes.find(x => x.id === 'T-684')!
  const [a] = laneLines(q, l, { nowMs: T0, frame: 0 })
  const [b] = laneLines(q, l, { nowMs: T0, frame: 1 })
  expect(segText(a)).toContain('●━━━━━━━━●━━━━━━━━◉────────○────────○')
  expect(segText(b)).toContain('●━━━━━━━━●━━━━━━━━◎────────○────────○')
  expect(segText(a).trimEnd().endsWith('#2')).toBe(true)
  expect(segText(a)).toContain('T-684 /symcc-doctor')
  expect(liveBlink(1, true)).toBe('◉')
  // the token bar is scaled against twice the usual tokens per merged task: past that, a warning
  const over = laneLines(lanes.find(x => x.id === 'T-685')!, l, { nowMs: T0, frame: 0 })[1]
  expect(segText(over)).toContain('3.4M ⚠')
  expect(over.some(s => s.tone === 'warning')).toBe(true)
  expect(segText(laneLines(lanes.find(x => x.id === 'T-687')!, l, { nowMs: T0, frame: 0 })[1])).toContain('tokens at hand-back')
})

test('T-690: the tab row has a Live tab with key l, and the views hint says "t l s c"', () => {
  expect(LIVE_TABS.map(t => t.key)).toEqual(['t', 'l', 's', 'c'])
  expect(tabRow(LIVE_TABS.map(t => ({ key: t.key, label: t.label })), 80).labels).toEqual(['[t]: Tasks', '[l]: Live', '[s]: Scouts', '[c]: Settings'])
  const narrow = tabRow(LIVE_TABS.map(t => ({ key: t.key, label: t.label, count: t.key === 't' ? 20 : t.key === 's' ? 1 : undefined })), 50)
  expect(textWidth(narrow.labels.join(narrow.gap))).toBeLessThanOrEqual(50)
  expect(listKeys().map(h => h.key)).toContain('t l s c')
})

const liveView = (tasks: unknown[], checker = true) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: ['npm test'], driving: true, checker, max_parallel: 3 } })

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : !n || typeof n !== 'object' ? '' : ((n as Node).children ?? []).map(textOf).join(''))
/** The lines of a drawn page, top to bottom (a row Box is one line; hidden Boxes draw nothing). */
const pageLines = (n: unknown): string[] => {
  const x = n as Node
  if (!x || typeof x !== 'object') return []
  if (x.type === 'Box') {
    if (x.props?.display === 'none') return []
    return x.props?.flexDirection === 'row' ? [textOf(x)] : (x.children ?? []).flatMap(pageLines)
  }
  return [textOf(x)]
}
/** The Live tab's own lines: from its header line on. */
const liveLines = async (ui: { drawn: () => Promise<unknown> }) => {
  const all = pageLines(await ui.drawn())
  const at = all.findIndex(l => l.includes('agents ') && l.includes(' busy'))
  return at < 0 ? [] : all.slice(at)
}

test('T-690: the Live tab draws at a normal and a narrow width with nothing cut, and blinks across two redraws', async ($, on) => {
  const clock = seedBoard(on, { view: liveView(TASKS) })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [80, 44]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await ui.press({ key: 'tab-live' })
    const lines = await liveLines(ui)
    expect(lines[0]).toBe('⏵ auto · agents 2/3 busy')
    // every line fits: nothing is cut or wrapped (the tab row too)
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(bodyColumns)
    expect(textWidth(pageLines(await ui.drawn()).find(l => l.includes('Live'))!)).toBeLessThanOrEqual(bodyColumns)
    // the lane rows, their second rows, next up, today, the legend and the keys
    for (const id of ['T-684', 'T-685', 'T-686', 'T-687', 'T-688']) expect(lines.some(l => l.startsWith(` ${id} `))).toBe(true)
    expect(lines.filter(l => /^ {2}change try \d\/\d/.test(l)).length).toBe(5)
    expect(lines.some(l => l.startsWith('next up  T-690'))).toBe(true)
    expect(lines.some(l => l.startsWith('today    ✓ 1 merged'))).toBe(true)
    expect(lines).toContain(LIVE_LEGEND)
    expect(lines.some(l => l.includes('t l s c views'))).toBe(true)
    // the lanes in the order they entered doing
    const order = (await ui.findAll({ type: 'Button' })).map(b => String(b.key)).filter(k => k.startsWith('live:'))
    expect(order).toEqual(['live:T-684', 'live:T-685', 'live:T-686', 'live:T-688', 'live:T-687'])
    // the current station blinks: ◉ on one redraw, ◎ on the next (the tab redraws itself every LIVE_TICK_MS)
    const marks = async () => ((await ui.find({ key: 'live:T-684' }))?.text.match(/[◉◎]/g) ?? []).join('')
    const one = await marks()
    await clock.advance(LIVE_TICK_MS)
    const two = await marks()
    expect([one, two].sort()).toEqual(['◉', '◎'])
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  }
})

test('T-690: with no task in doing, the Live tab says so and shows next up', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS.filter(t => t.status !== 'doing')) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  const lines = await liveLines(ui)
  expect(lines[0]).toBe('⏵ auto · agents 0/3 busy')
  expect(lines[1]).toBe(LIVE_EMPTY)
  expect(lines.some(l => l.startsWith('next up  T-690'))).toBe(true)
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test("T-690: Enter on a lane opens that task's page, and Back comes back to the Live tab", async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  await ui.press({ key: 'live:T-685' })
  expect(await liveLines(ui)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /OpenCode: give every board screen buttons/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect((await liveLines(ui)).length).toBeGreaterThan(0)
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test('T-690: w on the Live tab watches the focused lane\'s worker, and says so when none runs here', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  expect((await ui.find({ key: 'live-watch' }))?.props.hotkey).toBe('w')
  await ui.press({ key: 'live-watch' })
  expect(toasts.join(' ')).toMatch(/[Nn]o worker (is )?running now/)
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

// T-691: the Live tab in VS Code's side panel draws the same lanes, next up and today as the terminal's (all from
// core/live.ts), richer: real lines and dots and a filling token bar (Svg), the lane's id and title a link.
const steadyMark = (s: string) => s.replace(/◎/g, '◉')

for (const checker of [true, false])
  test(`T-691: the VS Code Live tab shows the same lanes, next up and today as the terminal's (checker ${checker ? 'on' : 'off'})`, async ($, on) => {
    seedBoard(on, { view: liveView(TASKS, checker) })
    on('ui.toast', () => ({ value: undefined }))
    // what the terminal's Live tab shows at the same width
    const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
    await t.press({ key: 'tab-live' })
    const lines = await liveLines(t)
    const ids = (await t.findAll({ type: 'Button' })).map(b => String(b.key)).filter(k => k.startsWith('live:')).map(k => k.slice(5))
    const tracks: string[] = []
    for (const id of ids) tracks.push(steadyMark((await t.find({ key: `live:${id}` }))!.text.match(/[●○◉◎][━─●○◉◎]*/)![0]))
    const next = lines.find(l => l.startsWith('next up'))!
    const today = lines.find(l => l.startsWith('today'))!
    await t.press({ key: 'tab-tasks' })
    await t.unmount()

    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
    // a Live tab between Tasks and Scouts
    expect((await ui.find({ key: 'tabs' }))?.props.text).toContain(`  ·  ${mdLink('Live', vsHref('tab', 'live'))}  ·  ${mdLink('Scouts 0', vsHref('tab', 'scouts'))}`)
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
    expect((await ui.find({ key: 'tabs' }))?.props.text).toContain('**Live**')
    expect((await ui.find({ key: 'live-head' }))?.text).toBe(lines[0])
    // the lanes: the same tasks in the same order, each a link that opens it
    const links = (await ui.findAll({ type: 'Markdown' })).filter(m => String(m.key).startsWith('live:'))
    expect(links.map(m => String(m.key).slice(5))).toEqual(ids)
    for (const m of links) expect(m.props.pressableLinks).toEqual([vsHref('task', String(m.key).slice(5))])
    expect(String(links[0]!.props.text)).toContain('T-684')
    // each lane's track: an Svg whose alt is the terminal's track; the station names under the dots (no check when the checker is off)
    const svgs = await ui.findAll({ type: 'Svg' })
    for (const [i, id] of ids.entries()) {
      const svg = svgs.find(x => String(x.props.alt).startsWith(`${id} at `))
      expect(svg?.type, id).toBe('Svg')
      expect(String(svg?.props.alt).endsWith(`: ${tracks[i]}`), id).toBe(true)
      const source = String(svg?.props.source)
      expect(/>(check|chk|c)·</.test(source), id).toBe(checker)
      expect(/>(work|wrk|w)·</.test(source), id).toBe(true)
      // the current station blinks, steady with reduced motion
      expect(source.includes(BLINK_CSS) && source.includes('class="cur"'), id).toBe(true)
    }
    expect(BLINK_CSS).toContain('prefers-reduced-motion: reduce')
    // the queue place and the token bar (over twice the usual: in the warning color, with ⚠)
    expect((await ui.find({ key: 'live-right:T-684' }))?.text).toBe('#2')
    // the token bars are Svg bars (alt: the terminal's bar), one for each lane that knows its tokens
    expect(svgs.filter(x => String(x.props.alt).startsWith('▕')).length).toBe(ids.length - 1)
    expect((await ui.find({ key: 'live-sub:T-685' }))?.text).toContain('3.4M ⚠')
    expect((await ui.find({ key: 'live-sub:T-687' }))?.text).toContain('tokens at hand-back')
    // next up and today: the terminal's words
    expect((await ui.find({ key: 'live-next' }))?.text).toBe(next)
    expect((await ui.find({ key: 'live-today-0' }))?.text).toBe(today)
    expect((await ui.find({ key: 'live-legend' }))?.text).toBe(LIVE_LEGEND)
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
    await ui.unmount()
  })

test('T-691: a click on a VS Code lane opens that task, and "← Live" comes back to the Live tab', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  await ui.press({ key: 'live:T-685', link: { href: vsHref('task', 'T-685') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /OpenCode: give every board screen buttons/ })).toBeDefined()
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('← Live')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-head' })).toBeDefined()
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

test('T-691: with no task in doing, the VS Code Live tab says so and still shows next up', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS.filter(t => t.status !== 'doing')) })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect((await ui.find({ key: 'live-head' }))?.text).toBe('⏵ auto · agents 0/3 busy')
  expect((await ui.find({ key: 'live-empty' }))?.text).toBe(LIVE_EMPTY)
  expect(await ui.find({ key: 'live-legend' })).toBeUndefined()
  expect((await ui.find({ key: 'live-next' }))?.text).toMatch(/^next up {2}T-690/)
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

// T-715: the terminal and VS Code Live tabs draw the same trains (core's trainRows) for the same board, and a train opens its task.
for (const bodyColumns of [100, 40])
  test(`T-715: the terminal and VS Code Live tabs hang the same trains under the lanes, nothing wider than the panel (${bodyColumns} columns)`, async ($, on) => {
    seedBoard(on, { view: liveView(TRAINS) })
    on('ui.toast', () => ({ value: undefined }))
    const lanes = liveLanes(trainView, T0)
    const t = liveTrains(trainView, T0, lanes)
    const want = lanes.flatMap(l => trainRows(t.lanes[l.id] ?? [], bodyColumns))
    expect(want.filter(r => r.id).map(r => r.id)).toEqual(['T-713', 'T-714', 'T-717', 'T-716'])
    const term = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await term.press({ key: 'tab-live' })
    const lines = await liveLines(term)
    for (const l of lines) expect([l, textWidth(l) <= bodyColumns]).toEqual([l, true])
    // the trains right under T-712's two lane lines, in the same order and words
    const at = lines.findIndex(l => l.startsWith(' T-712 '))
    expect(lines.slice(at + 2, at + 2 + want.length)).toEqual(want.map(r => segText(r.segs)))
    const keys = (await term.findAll({ type: 'Button' })).map(b => String(b.key)).filter(k => k.startsWith('live'))
    expect(keys.filter(k => k.startsWith('live-train:'))).toEqual(['live-train:T-713', 'live-train:T-714', 'live-train:T-717', 'live-train:T-716'])
    // next up: the free one and the stuck one, no trains
    const next = lines.find(l => l.startsWith('next up'))!
    expect(next).toBe(nextUpLine(t, bodyColumns))
    expect(next).not.toContain('T-713')
    await term.press({ key: 'tab-tasks' })
    await term.unmount()

    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
    const links = (await ui.findAll({ type: 'Markdown' })).filter(m => String(m.key).startsWith('live-train:'))
    expect(links.map(m => String(m.key).slice('live-train:'.length))).toEqual(['T-713', 'T-714', 'T-717', 'T-716'])
    for (const r of want.filter(x => x.id)) {
      const link = links.find(m => String(m.key) === `live-train:${r.id}`)!
      expect(link.props.pressableLinks).toEqual([vsHref('task', r.id!)])
      // the same id and title as the terminal's row, then its "waits" and "+ also"
      const name = r.segs.filter(s => s.tone === 'id' || s.tone === 'title').map(s => s.text.trim()).join(' ')
      expect(String(link.props.text)).toBe(mdLink(name, vsHref('task', r.id!)))
      const note = r.segs.slice(1).filter(s => s.tone === 'dim').map(s => s.text.trim()).filter(Boolean).join('  ')
      expect((await ui.find({ key: `live-train-note:${r.id}` }))?.text ?? '').toBe(note)
    }
    expect((await ui.find({ key: 'live-next' }))?.text).toBe(next)
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
    await ui.unmount()
  })

test('T-715: Enter on a train (terminal) or a click on it (VS Code) opens that task, and Back returns to the Live tab', async ($, on) => {
  seedBoard(on, { view: liveView(TRAINS) })
  const term = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  await term.press({ key: 'tab-live' })
  await term.press({ key: 'live-train:T-714' })
  expect(await liveLines(term)).toEqual([])
  expect(await term.find({ type: 'Text', text: /Help: \/symcc-help shows all/ })).toBeDefined()
  await term.press({ key: 'back' })
  expect((await liveLines(term)).length).toBeGreaterThan(0)
  await term.press({ key: 'tab-tasks' })
  await term.unmount()

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  await ui.press({ key: 'live-train:T-716', link: { href: vsHref('task', 'T-716') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Live deps drawn as trains/ })).toBeDefined()
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('← Live')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-head' })).toBeDefined()
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})
