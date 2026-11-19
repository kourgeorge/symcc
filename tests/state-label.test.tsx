// T-498: the task's current-state line (its `note`) is labelled from one shared word, STATE_LABEL ("Now"), on every view:
// the task page (terminal and VS Code), the copied text and the text board. Each view keeps its own casing.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE } from './board-fixture'
import { RICH_TASKS, seedRich } from './task-page-fixture'
import { STATE_LABEL, stateLabelLower, detailRows, taskCopyText, addTask, emptyBoard } from '../hooks/board'
import { taskText } from '../hooks/app/tools'

const T = '2026-11-19T10:00:00.000Z'
const NOTE = 'tests failed'

test('STATE_LABEL is "Now", and its lower-case form is "now"', () => {
  expect(STATE_LABEL).toBe('Now')
  expect(stateLabelLower()).toBe(STATE_LABEL.toLowerCase())
})

test('the task page rows, the copied text and the text board label the state line with STATE_LABEL, never "Note"', () => {
  const [, t0] = addTask(emptyBoard(), { origin: { why: 'to check the label' }, title: 'A task', details: 'Do it.' }, T)
  const t = { ...t0, note: NOTE }
  const rows = detailRows(t, { roles: [], all: [t], when: () => 'now', nowMs: Date.parse(T) })
  const row = rows.find(r => r.segs.some(s => s.text === NOTE))
  expect(row?.label).toBe(STATE_LABEL)
  expect(rows.some(r => r.label === 'Note')).toBe(false)
  const copy = taskCopyText(t, { roles: [] }).split('\n')
  expect(copy).toContain(`${stateLabelLower()}: ${NOTE}`)
  expect(copy.some(l => /^note:/i.test(l))).toBe(false)
  const board = taskText(t, false, [t]).split('\n')
  expect(board).toContain(`${stateLabelLower()}: ${NOTE}`)
  expect(board.some(l => /^note:/i.test(l))).toBe(false)
  // a task with no note has no state line at all
  expect(detailRows(t0, { roles: [], all: [t0], when: () => 'now', nowMs: Date.parse(T) }).some(r => r.label === STATE_LABEL)).toBe(false)
})

test('the task page on the terminal and in VS Code shows the state line as "Now: …"', async ($, on) => {
  seedRich(on, 'T-502')
  expect(RICH_TASKS.find(x => x.id === 'T-502')?.note).toBe(NOTE)
  const vs = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await vs.find({ type: 'Text', text: `${STATE_LABEL}: ${NOTE}` })).toBeDefined()
  expect(await vs.find({ type: 'Text', text: /^Note: / })).toBeUndefined()
  await vs.unmount()
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: new RegExp(`^${STATE_LABEL}: +$`) })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /^Note: +$/ })).toBeUndefined()
  await term.unmount()
})
