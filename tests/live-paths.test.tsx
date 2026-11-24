// T-846: a Live lane shows the task's real path: an investigation goes work → answer, a docs-only change shows check as
// skipped ("–") once it handed back, a task that needs review has a "you" station before merged and sits at it while it
// waits for the owner; a normal code task keeps work → check → queue → tests → merged. Core, terminal and VS Code here;
// OpenCode in hooks/opencode/tests/opencode-tui.spec.ts.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { laneLines, liveColumns, liveLanes, liveLayout, liveInner, liveLabelLine, segText } from '../hooks/core/live'
import { PANE, T0, seedBoard } from './board-fixture'
import { vsHref } from '../hooks/claude/ui/vscode'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })
const worker = { kind: 'worker' as const, started: iso(20), ended: iso(2), tokens: { input: 300_000 } }
const handed = { runs: [{ started: iso(20), ended: iso(2), agents: [worker] }] }

const INVESTIGATION = task('T-801', 'Why is the board slow', { kind: 'investigation', runs: [{ started: iso(4) }] })
const DOCS_RUNNING = task('T-802', 'Docs: write the guide', { files: ['docs/guide.md'], runs: [{ started: iso(4) }] })
const handedDocs = { runs: [{ started: iso(20), ended: iso(2), agents: [worker], docs_only: true as const }] }
const DOCS_HANDED = task('T-803', 'Docs: fix the readme', { files: ['README.md'], ...handedDocs, live: { checking: { step: 'prep', at: iso(0) } } })
const REVIEW_TESTS = task('T-804', 'Needs a look', { needs_review: true, ...handed, live: { checking: { step: 'testing', at: iso(0) } }, history: [{ kind: 'stage', at: iso(1), text: 'try 1: tests started', try: 1, step: 'tests' }] })
const REVIEW_WAITING = task('T-805', 'Waits for you', { needs_review: true, status: 'review', ...handed })
const NORMAL = task('T-806', 'A normal change', { files: ['hooks/a.ts'], ...handed, live: { checking: { step: 'testing', at: iso(0) } }, history: [{ kind: 'stage', at: iso(1), text: 'try 1: tests started', try: 1, step: 'tests' }] })
const ALL = [INVESTIGATION, DOCS_RUNNING, DOCS_HANDED, REVIEW_TESTS, REVIEW_WAITING, NORMAL]
const view = (tasks: unknown[], mode: 'auto' | 'review' = 'auto') => ({ tasks: tasks as never[], checker: true, mode, max_parallel: 3 })
const lane = (id: string, mode: 'auto' | 'review' = 'auto') => liveLanes(view(ALL, mode), T0).find(l => l.id === id)!

test('T-846: an investigation lane has only work and answer, a normal code task keeps its stations', () => {
  expect(lane('T-801').stations).toEqual(['work', 'answer'])
  expect([lane('T-801').station, lane('T-801').at, lane('T-801').agent]).toEqual(['work', 0, true])
  expect(lane('T-806').stations).toEqual(['work', 'check', 'queue', 'tests', 'merged'])
  expect(lane('T-806').skipped).toBeUndefined()
  expect(lane('T-806').station).toBe('tests')
  // the shared columns hold every station any lane has, in order
  expect(liveColumns(liveLanes(view(ALL), T0), true)).toEqual(['work', 'check', 'queue', 'tests', 'you', 'merged', 'answer'])
  expect(liveColumns(liveLanes(view([INVESTIGATION]), T0), true)).toEqual(['work', 'answer'])
})

test('T-846: a docs-only change shows check as skipped after hand-back; before it nothing changes', () => {
  expect(lane('T-802').skipped).toBeUndefined()
  expect(lane('T-803').skipped).toEqual(['check'])
  expect(lane('T-803').stations).toContain('check')
  const lanes = liveLanes(view(ALL), T0)
  const layout = liveLayout(lanes, liveColumns(lanes, true), 140)
  expect(segText(laneLines(lane('T-803'), layout, { nowMs: T0, frame: 0 })[0]!)).toMatch(/○|◉/)
  const text = (id: string) => segText(laneLines(lane(id), layout, { nowMs: T0, frame: 0 })[0]!)
  expect(text('T-803')).toContain('–')
  expect(text('T-806')).not.toContain('–')
  // the dash is in the dim tone
  expect(laneLines(lane('T-803'), layout, { nowMs: T0, frame: 0 })[0]!.find(s => s.text === '–')?.tone).toBe('dim')
})

test('T-846: a task that needs review has a "you" station, and its lane stays at it while it waits for the owner', () => {
  expect(lane('T-804').stations).toEqual(['work', 'check', 'queue', 'tests', 'you', 'merged'])
  expect(lane('T-804').station).toBe('tests')
  expect(lane('T-805').stations).toEqual(['work', 'check', 'queue', 'tests', 'you', 'merged'])
  expect([lane('T-805').station, lane('T-805').at, lane('T-805').agent]).toEqual(['you', 4, false])
  // the board in approve-merge mode: every code task has "you"
  expect(lane('T-806', 'review').stations).toEqual(['work', 'check', 'queue', 'tests', 'you', 'merged'])
  // approved: the approve runs on, its lane goes on to merged
  const approving = liveLanes(view([task('T-805', 'Waits for you', { needs_review: true, status: 'review', ...handed, live: { checking: { step: 'merging', at: iso(0) } } })]), T0)[0]!
  expect([approving.station, approving.at]).toEqual(['merged', 5])
  // the lane line: work, check, queue and tests passed, you current, merged ahead
  const lanes = liveLanes(view(ALL), T0)
  const layout = liveLayout(lanes, liveColumns(lanes, true), 140)
  expect(liveLabelLine(layout)).toContain('you')
  expect(segText(laneLines(lane('T-805'), layout, { nowMs: T0, frame: 0 })[0]!)).toMatch(/●━+●━+●━+●━+◉─+○/)
  // an investigation's line runs straight through the columns it has no station at, to its answer
  expect(segText(laneLines(lane('T-801'), layout, { nowMs: T0, frame: 0 })[0]!)).toMatch(/◉─+─ *─+.*○ /)
})

const liveView = (tasks: unknown[]) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3 } })

test('T-846: the terminal Live tab draws the investigation, docs-only and needs-review lanes', async ($, on) => {
  seedBoard(on, { view: liveView(ALL) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 120 }, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  const row = async (id: string) => (await ui.find({ key: `live:${id}` }))!.text
  const marks = (s: string) => s.replace(/◎/g, '◉').match(/[●○◉–][━─●○◉–]*/g)!.join('')
  expect(await row('T-801')).not.toContain('●')
  expect(marks(await row('T-801')).replace(/[━─]+/g, '-')).toBe('◉-○')
  expect(await row('T-803')).toContain('–')
  expect(await row('T-806')).not.toContain('–')
  expect(marks(await row('T-806')).replace(/[━─]+/g, '-')).toBe('●-●-●-◉-○')
  expect(marks(await row('T-805')).replace(/[━─]+/g, '-')).toBe('●-●-●-●-◉-○')
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test('T-846: the VS Code Live tab draws the same paths', async ($, on) => {
  seedBoard(on, { view: liveView(ALL) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 120 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  const tracks = (await ui.findAll({ type: 'Svg' })).filter(x => /^T-\d+ at /.test(String(x.props.alt ?? '')))
  const track = (id: string) => tracks.find(x => String(x.props.alt).startsWith(`${id} at `))!
  const svg = async (id: string) => String(track(id).props.source)
  // one dot per station of the lane's own path (the circles; lines run through the other columns)
  const dots = (s: string) => (s.match(/<circle/g) ?? []).length
  expect(dots(await svg('T-801'))).toBe(2)
  expect(dots(await svg('T-806'))).toBe(5)
  expect(dots(await svg('T-805'))).toBe(6)
  // the skipped check is no dot
  expect(dots(await svg('T-803'))).toBe(4)
  expect(String(track('T-805').props.alt)).toContain('T-805 at you')
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

test('T-846: an approved auto-mode review task keeps "you" and sits past it; a docs-only lane in prep has a current mark', () => {
  const at = { step: 'merging', at: iso(0) }
  const auto = task('T-807', 'Review by hand', { status: 'review', ...handed, live: { checking: at } })
  const l = liveLanes(view([auto]), T0)[0]!
  expect(l.stations).toContain('you')
  expect(l.station).toBe('merged')
  const tests = liveLanes(view([task('T-808', 'Again', { status: 'review', needs_review: true, ...handed, live: { checking: { step: 'testing', at: iso(0) } } })]), T0)[0]!
  expect(tests.station).toBe('merged')
  const prep = liveLanes(view([DOCS_HANDED]), T0)
  const lines = (frame: number) => segText(laneLines(prep[0]!, liveLayout(prep, liveColumns(prep, true), 140), { nowMs: T0, frame })[0]!)
  expect(lines(0)).toMatch(/◉|◎/)
  expect(lines(0)).toContain('–')
})

test('T-846: docs-only is judged from the files the try changed, and holds while the task waits at "you"', () => {
  const checking = { step: 'prep', at: iso(0) }
  // lists a docs file and a code file, but its commit changed only docs: skipped
  const mixedDocs = liveLanes(view([task('T-810', 'Mixed', { files: ['docs/a.md', 'hooks/a.ts'], ...handedDocs, live: { checking } })]), T0)[0]!
  expect(mixedDocs.skipped).toEqual(['check'])
  // lists only a docs file, but the commit changed code: not skipped; and before prep knows nothing is skipped either
  const codeChanged = liveLanes(view([task('T-811', 'Code', { files: ['docs/a.md'], ...handed, live: { checking } })]), T0)[0]!
  expect(codeChanged.skipped).toBeUndefined()
  // waiting at "you": the dash stays
  const waiting = liveLanes(view([task('T-812', 'Waits', { files: ['README.md'], needs_review: true, status: 'review', ...handedDocs })]), T0)[0]!
  expect([waiting.station, waiting.skipped]).toEqual(['you', ['check']])
  const layout = liveLayout([waiting], liveColumns([waiting], true), 140)
  expect(segText(laneLines(waiting, layout, { nowMs: T0, frame: 0 })[0]!)).toMatch(/●━+–━+●━+●━+◉/)
})

test('T-846: lane lines never run wider than the room, at narrow panel widths', () => {
  const lanes = liveLanes(view([INVESTIGATION, REVIEW_WAITING, NORMAL]), T0)
  for (const width of [30, 34, 40]) {
    const inner = liveInner(width)
    const layout = liveLayout(lanes, liveColumns(lanes, true), inner)
    for (const l of lanes) for (const line of laneLines(l, layout, { nowMs: T0, frame: 0 })) expect(segText(line).length).toBeLessThanOrEqual(inner)
  }
})
