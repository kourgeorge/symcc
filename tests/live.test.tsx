// T-690: the Live tab: one lane per task in doing (core/live.ts works out the stations, the order, next up and today's
// numbers; claude/ui/live.tsx draws them on the terminal panel).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { liveLanes, liveLayout, laneLines, liveLabelLine, liveStations, nextUp, nextUpLine, liveToday, todayLines, segText, liveBlink, liveHeader, tabRow, withLiveKey, LIVE_TABS, LIVE_EMPTY, LIVE_LEGEND } from '../hooks/core/live'
import { textWidth } from '../hooks/core/stats'
import { listKeys } from '../hooks/board'
import { LIVE_TICK_MS } from '../hooks/claude/ui/live'
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

test('T-690: lanes are ordered by when the task entered doing, earliest first', () => {
  expect(liveLanes(view(true), T0).map(l => l.id)).toEqual(['T-684', 'T-685', 'T-686', 'T-688', 'T-687'])
})

test('T-690: next up lists todo tasks in start order, with "(after T-n)" for one still waiting', () => {
  const items = nextUp(view(true))
  // T-691 has the lowest order but waits on T-690, so it comes after it; T-692 waits on a done task: no "after"
  expect(items.map(x => x.id)).toEqual(['T-690', 'T-691', 'T-692'])
  expect(items.map(x => x.after)).toEqual([[], ['T-690'], []])
})

test('T-690: the next up line', () => {
  const items = nextUp(view(true))
  expect(nextUpLine(items, 120)).toBe('next up  T-690 Live tab pa… · T-691 Live tab in… (after T-690) · T-692 Live tab in…')
  expect(nextUpLine(items, 60)).toBe('next up  T-690 Live tab pa… · 2 more in todo')
  expect(nextUpLine([], 60)).toBe('next up  nothing in todo')
})

test('T-690: today counts merges, send-backs, failures and tokens of today', () => {
  const d = liveToday(TASKS as never[], T0, 0)
  expect(d).toEqual({ merged: 1, sentBack: 1, failed: 1, tokens: 1_100_000 + 1_100_000 + 540_000 + 3_400_000 + 200_000 + 800_000 })
  expect(todayLines(d, 80)).toEqual(['today    ✓ 1 merged   ↺ 1 sent back   ✗ 1 failed   Σ 7.1M tokens'])
  for (const l of todayLines(d, 30)) expect(textWidth(l)).toBeLessThanOrEqual(30)
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
  expect(withLiveKey(listKeys()).map(h => h.key)).toContain('t l s c')
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
