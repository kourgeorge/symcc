// T-771: the Live tab's ▍Tasks keeps a just-merged task's lane for 10 minutes (dim, ✓ at "merged", "merged 3m ago"),
// at most 3 of them, newest first, under the running lanes; Enter (or a click in VS Code) on one opens its task.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_FINISHED_MAX, LIVE_INDENT, laneLines, liveFinishedLanes, liveInner, liveLayout, liveStations, liveTaskLanes, segText } from '../hooks/core/live'
import { textWidth } from '../hooks/core/width'
import { vsHref } from '../hooks/claude/ui/vscode'
import { trackSvg } from '../hooks/claude/ui/vscode-live'
import { PANE, T0, seedBoard } from './board-fixture'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })
const merged = (id: string, title: string, minAgo: number) =>
  task(id, title, { status: 'done', runs: [{ started: iso(minAgo + 20), ended: iso(minAgo + 2), agents: [{ kind: 'worker' as const, started: iso(minAgo + 20), ended: iso(minAgo + 2), tokens: { input: 900_000 } }] }], history: [{ kind: 'merged', at: iso(minAgo), text: 'try 1 → merged into main' }] })

const TASKS = [
  task('T-760', 'A running one', { runs: [{ started: iso(4) }] }),
  merged('T-747', 'Live tab: each section starts with a heading', 3),
  merged('T-740', 'Merged a while ago', 11),
  task('T-741', 'A failed one', { status: 'failed', updated_at: iso(2), runs: [{ started: iso(10), ended: iso(2) }] }),
  task('T-742', 'A dropped one', { status: 'dropped', updated_at: iso(2), runs: [{ started: iso(10), ended: iso(2) }] }),
  task('T-743', 'An answered question', { status: 'done', kind: 'investigation', runs: [{ started: iso(9), ended: iso(6) }], history: [] }),
]
const view = (tasks: unknown[]) => ({ tasks: tasks as never[], checker: true, mode: 'auto' as const, max_parallel: 3 })
const liveView = (tasks: unknown[]) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3 } })

test('T-771: a task merged 3m ago keeps a finished lane under the running ones; one merged 11m ago, failed or dropped ones get none', () => {
  const lanes = liveTaskLanes(view(TASKS), T0)
  expect(lanes.map(l => [l.id, l.done?.word ?? 'running'])).toEqual([['T-760', 'running'], ['T-747', 'merged']])
  const layout = liveLayout(lanes, liveStations(true), liveInner(100))
  const [first, second] = laneLines(lanes[1]!, layout, { nowMs: T0, frame: 0 })
  const text = segText(first)
  expect(text.startsWith('✓ T-747 Live tab: each section')).toBe(true)
  expect(text).toMatch(/●━+●━+●━+●━+✓ +merged 3m ago$/)
  // T-850: "✓ " dim, the id in the accent color ('run'), the title and second line dim; the track and ✓ in the done color
  expect(first.slice(0, 3).map(s => [s.text.trim().slice(0, 4), s.tone])).toEqual([['✓', 'dim'], ['T-74', 'run'], ['Live', 'dim']])
  expect(first.find(s => s.text === '✓')?.tone).toBe('passed')
  expect(first.some(s => s.tone === 'current' || (s.tone === 'run' && !s.text.includes('T-747')))).toBe(false)
  expect(second.filter(s => s.text.trim()).every(s => s.tone === 'dim')).toBe(true)
  // nothing wider than the panel, at any width
  for (const w of [100, 60, 40, 30]) {
    const l = liveLayout(lanes, liveStations(true), w)
    for (const lane of lanes) for (const x of laneLines(lane, l, { nowMs: T0, frame: 0 })) expect(textWidth(segText(x))).toBeLessThanOrEqual(w)
  }
  // 11 minutes after its merge T-747 is gone too
  expect(liveTaskLanes(view(TASKS), T0 + 8 * 60_000).map(l => l.id)).toEqual(['T-760'])
})

test('T-771: an answered investigation gets no finished lane, whether its board has the full history or the slim one', () => {
  // answered 6m ago, and (full history) read by the owner 2m ago: a 'done' line
  const answered = task('T-743', 'An answered question', { status: 'done', kind: 'investigation', runs: [{ started: iso(9), ended: iso(6) }], history: [] })
  const read = { ...answered, history: [{ kind: 'done', at: iso(2), text: 'try 1: the owner read the answer → done (nothing merged)' }] }
  expect(liveFinishedLanes(view([answered]), T0)).toEqual([])
  expect(liveFinishedLanes(view([read]), T0)).toEqual([])
  expect(liveTaskLanes(view([task('T-760', 'A running one', { runs: [{ started: iso(4) }] }), read]), T0).map(l => l.id)).toEqual(['T-760'])
})

test('T-771: at most 3 finished lanes, newest first; a 4th merge pushes the oldest out', () => {
  const tasks = [merged('T-801', 'one', 1), merged('T-802', 'two', 5), merged('T-803', 'three', 2), merged('T-804', 'four', 8), merged('T-805', 'old', 12)]
  expect(LIVE_FINISHED_MAX).toBe(3)
  expect(liveFinishedLanes(view(tasks), T0).map(l => l.id)).toEqual(['T-801', 'T-803', 'T-802'])
  expect(liveFinishedLanes(view(tasks.slice(1)), T0).map(l => l.id)).toEqual(['T-803', 'T-802', 'T-804'])
})

test('T-771: the VS Code track of a finished lane has a green ✓ at merged and nothing blinking', () => {
  const lane = liveFinishedLanes(view(TASKS), T0)[0]!
  const svg = trackSvg(lane, liveLayout([lane], liveStations(true), 80)).source
  expect(svg.includes('class="cur"')).toBe(false)
  expect(svg).toContain('<path ')
})

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : !n || typeof n !== 'object' ? '' : ((n as Node).children ?? []).map(textOf).join(''))

for (const surface of ['terminal', 'desktop', 'mobile'] as const)
  test(`T-771: the ${surface} Live tab draws the finished lane dim under the running one, and Enter on it opens its page`, async ($, on) => {
    seedBoard(on, { view: liveView(TASKS) })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface })
    await ui.press({ key: 'tab-live' })
    const run = textOf(await ui.find({ key: 'live:T-760' }))
    const done = textOf(await ui.find({ key: 'live:T-747' }))
    expect(run.startsWith(`${LIVE_INDENT}▶ T-760`)).toBe(true)
    expect(done.startsWith(`${LIVE_INDENT}✓ T-747 Live tab`)).toBe(true)
    expect(done).toMatch(/✓ +merged 3m ago$/)
    expect(await ui.find({ key: 'live:T-740' })).toBeUndefined()
    expect(await ui.find({ key: 'live:T-741' })).toBeUndefined()
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn.indexOf('T-760')).toBeLessThan(drawn.indexOf('T-747'))
    await ui.press({ key: 'live:T-747' })
    expect(await ui.find({ key: 'live-head' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Live tab: each section starts with a heading/ })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  })

test('T-850: a narrow VS Code panel still gives the finished lane a clickable link', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 30 }, surface: 'vscode' })
  await ui.press({ key: 'tab-live' })
  expect(await ui.find({ key: 'live:T-747' })).toBeDefined()
  await ui.unmount()
})

test('T-771: the VS Code Live tab shows the finished lane (dim link, no ▶, "merged 3m ago"), and a click on it opens its page', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tab-live' })
  const lane = await ui.find({ key: 'live:T-747' })
  expect(lane?.props.dimColor).toBe(true)
  expect(String(lane?.props.text)).toBe(`[T-747](${vsHref('task', 'T-747')})`)
  expect((await ui.find({ key: 'live-title:T-747' }))?.text.startsWith('Live tab')).toBe(true)
  expect((await ui.find({ key: 'live-run-mark:T-747' }))?.text).toBe('✓')
  // the finished lane's id has the same accent color (and bold) as the running lane's mark; the ✓ is dim
  const texts = await ui.findAll({ type: 'Text' })
  const markText = texts.find(t => (t.children ?? []).join('') === '▶')
  const tickText = texts.find(t => (t.children ?? []).join('') === '✓')
  expect(typeof markText?.props.color).toBe('string')
  expect(tickText?.props.color).not.toBe(markText?.props.color)
  expect((await ui.find({ key: 'live-run-mark:T-760' }))?.text).toBe('▶')
  expect((await ui.find({ key: 'live-right:T-747' }))?.text).toBe('merged 3m ago')
  expect(await ui.find({ key: 'live:T-740' })).toBeUndefined()
  await ui.press({ key: 'live:T-747', link: { href: vsHref('task', 'T-747') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Live tab: each section starts with a heading/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-head' })).toBeDefined()
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test('T-1080: the VS Code Live tab draws the change size on a finished lane', async ($, on) => {
  const sized = TASKS.map(t => (t.id === 'T-747' ? { ...t, size: { files: 25, added: 539, removed: 3722 } } : t))
  seedBoard(on, { view: liveView(sized) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tab-live' })
  expect(await ui.find({ type: 'Text', text: /\+539/ })).toBeDefined()
  await ui.unmount()
})
