// T-786: the Live tab's ▍Needs you section, first of all (above ▍Tasks), only while something waits: one warning row
// per open board question, task waiting for the owner and task ready for review; Enter on a row opens it.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_SECTIONS, liveNeeds, segText } from '../hooks/core/live'
import { textWidth } from '../hooks/core/width'
import { vsHref } from '../hooks/claude/ui/vscode'
import { PANE, T0, seedBoard } from './board-fixture'
import { askShape } from './ask-shape'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...askShape(x) })
const QUESTION = { id: 'Q-88', text: "Which figures should go on the Today section's 4th line?", options: [], asked_at: iso(5) }
const RUNNING = task('T-760', 'A running one', { runs: [{ started: iso(4) }] })
const REVIEW = task('T-749', 'Website home page: a live, played-out demo of the board with a long title that has to be cut', { status: 'review', updated_at: iso(3), runs: [{ started: iso(20), ended: iso(3) }] })
const ASKS = task('T-751', 'A button key', { status: 'waiting', question: 'Claude Code only lets a button key be one letter, which one?', updated_at: iso(2), runs: [{ started: iso(20), ended: iso(2) }] })
const liveView = (tasks: unknown[], questions: unknown[] = []) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3, ...(questions.length ? { questions } : {}) } })
const ALL = [RUNNING, REVIEW, ASKS]

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : !n || typeof n !== 'object' ? '' : ((n as Node).children ?? []).map(textOf).join(''))

test('T-786: liveNeeds lists the open question, then the waiting and review tasks, each one warning row, cut to the width', () => {
  const view = { tasks: ALL as never[], questions: [QUESTION, { ...QUESTION, id: 'Q-80', answered_at: iso(1) }], max_parallel: 3 }
  const rows = liveNeeds(view, T0, 100)
  expect(rows.map(r => r.id).sort()).toEqual(['Q-88', 'T-749', 'T-751'])
  expect(rows[0]!.id).toBe('Q-88')
  for (const r of rows) expect(r.segs.map(s => s.tone)).toEqual(['warning'])
  const text = (id: string) => segText(rows.find(r => r.id === id)!.segs)
  expect(text('Q-88').startsWith('⚠ Q-88  Which figures')).toBe(true)
  expect(text('T-749')).toContain('T-749 ready for review: Website home page')
  expect(text('T-751')).toContain('T-751 asks: Claude Code only lets')
  for (const w of [100, 40, 20, 5]) for (const r of liveNeeds(view, T0, w)) expect(textWidth(segText(r.segs))).toBeLessThanOrEqual(w)
  // nothing waits: no rows
  expect(liveNeeds({ tasks: [RUNNING] as never[], questions: [], max_parallel: 3 }, T0, 100)).toEqual([])
})

for (const surface of ['terminal', 'desktop', 'mobile'] as const)
  test(`T-786: the ${surface} Live tab has ▍Needs you first, above ▍Tasks, one warning row each; Enter on a row opens it; none when nothing waits`, async ($, on) => {
    seedBoard(on, { view: liveView(ALL, [QUESTION]) })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface })
    await ui.press({ key: 'tab-live' })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain(LIVE_SECTIONS.needs.toUpperCase())
    // T-789: UPPERCASE headings, no bar
    expect(drawn).not.toContain('▍')
    expect(drawn.indexOf('NEEDS YOU')).toBeLessThan(drawn.indexOf('TASKS'))
    expect(drawn.indexOf('T-749 ready for review')).toBeLessThan(drawn.indexOf('TASKS'))
    for (const id of ['Q-88', 'T-749', 'T-751']) {
      const row = await ui.find({ key: `live-need:${id}` })
      expect(textOf(row).startsWith(` ⚠ ${id}`)).toBe(true)
      expect(textWidth(textOf(row))).toBeLessThanOrEqual(100)
    }
    expect(JSON.stringify(await ui.find({ key: 'live-need:T-749' }))).toContain('"warning"')
    await ui.press({ key: 'live-need:T-749' })
    expect(await ui.find({ key: 'live-head' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Website home page/ })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.press({ key: 'live-need:Q-88' })
    expect(await ui.find({ key: 'live-head' })).toBeUndefined()
    await ui.unmount()
  })

test('T-786: the VS Code Live tab has a Needs you section first with a warning row and a link per item; a click opens it; none when nothing waits', async ($, on) => {
  seedBoard(on, { view: liveView(ALL, [QUESTION]) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect((await ui.find({ key: 'live-needs-head' }))?.text).toMatch(/^─── ❯NEEDS YOU─+$/)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn.indexOf('live-needs-head')).toBeLessThan(drawn.indexOf('live-tasks-head'))
  expect((await ui.find({ key: 'live-need-text:T-749' }))?.text).toMatch(/^ready for review: Website home page/)
  expect(JSON.stringify(await ui.find({ key: 'live-need-text:Q-88' }))).toContain('warning')
  await ui.press({ key: 'live-need:T-749', link: { href: vsHref('task', 'T-749') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

test('T-786: the terminal Live tab has no Needs you heading or rows when nothing waits', async ($, on) => {
  seedBoard(on, { view: liveView([RUNNING]) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('NEEDS YOU')
  expect(JSON.stringify(await ui.drawn())).toContain('TASKS')
  await ui.unmount()
})

test('T-786: the VS Code Live tab has no Needs you section when nothing waits', async ($, on) => {
  seedBoard(on, { view: liveView([RUNNING]) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect(await ui.find({ key: 'live-needs-head' })).toBeUndefined()
  expect(await ui.find({ key: 'live-tasks-head' })).toBeDefined()
  await ui.unmount()
})
