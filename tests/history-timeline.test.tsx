// T-512: the task page's history reads as a timeline (a mark per event, a connector line between them), and each
// mark comes from what kind of event the line is, never from words inside quoted text or a reason.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0, seedBoard } from './board-fixture'
import { historyEvent, HISTORY_MARK } from '../hooks/core/history'

const iso = (ms: number) => new Date(ms).toISOString()

/** T-504's history as the owner saw it (oldest first), with the words that used to give a wrong ✗. */
const HISTORY = [
  'created by the owner because the scouts keep stopping after a scout failed in OpenCode with two failures',
  'try 1: tried the first fix → tests failed: the scout test did not pass',
  'the lead added a note: “the earlier try failed because the scout folder was missing”',
  'waits on changed: T-500, T-498 → T-500',
  'try 2: checker: OK',
]

test('historyEvent: the kind and the mark come from what the line is, not from words in its text', () => {
  const [created, tried, note, waits, checker] = HISTORY.map(historyEvent)
  expect(created).toMatchObject({ kind: 'created', tone: 'other', mark: '○', try: 0, label: '' })
  expect(note).toMatchObject({ kind: 'note', tone: 'other', mark: '○' })
  expect(waits).toMatchObject({ kind: 'waits', tone: 'other', said: HISTORY[3], result: '' })
  expect(tried).toMatchObject({ kind: 'result', tone: 'bad', mark: '✗', try: 1, label: 'try 1', said: 'tried the first fix', result: 'tests failed: the scout test did not pass' })
  expect(checker).toMatchObject({ kind: 'checker', tone: 'good', mark: '✓', try: 2 })
  expect(historyEvent('try 2: fixed it → merged into main (abc1234)')).toMatchObject({ kind: 'result', tone: 'good', mark: '✓' })
  expect(historyEvent('try 2: fixed it → not merged: the branch moved')).toMatchObject({ tone: 'bad' })
  // a worker's summary that says "failed" does not make a merged try bad
  expect(historyEvent('try 3 (role tester): the old test failed, so I fixed it → merged into main')).toMatchObject({ tone: 'good', try: 3, label: 'try 3 (role tester)' })
  expect(historyEvent('try 2: checker found problems: the error test is missing')).toMatchObject({ kind: 'checker', tone: 'bad' })
  expect(historyEvent('try 2: stopped: paused: Owner: run only T-527 for now')).toMatchObject({ kind: 'stopped', tone: 'bad' })
  expect(historyEvent('try 2: worker asked: which error message should it show?')).toMatchObject({ kind: 'step', tone: 'step', mark: '●' })
  expect(historyEvent('the owner answered: “it failed for me too”')).toMatchObject({ kind: 'answer', tone: 'other' })
  expect(Object.values(HISTORY_MARK)).toEqual(['✓', '✗', '●', '○'])
})

const TASK = {
  id: 'T-504', title: 'The scouts keep stopping', details: '', files: ['tests/'], status: 'todo', note: '', question: null, order: 504, after: ['T-500'],
  attempts: 2, history: HISTORY, branch: null, created_at: iso(T0 - 86_400_000), updated_at: iso(T0 - 60_000), role: 'worker',
}
const seed = (on: Parameters<typeof seedBoard>[0]) => {
  seedBoard(on, { opened: 'T-504', view: { shape: 'view-1', value: { tasks: [TASK], working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: [] } } })
  on('fs.exists', () => ({ value: false }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
/** All the text of a drawn node. */
const textOf = (n: unknown): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' ? textOf((n as Node).children ?? []) : '')
/** The children of the first Box whose first child's text starts with `head` (a page section, its heading first). */
function section(tree: unknown, head: string): unknown[] {
  const walk = (n: unknown): unknown[] | undefined => {
    if (Array.isArray(n)) return n.map(walk).find(Boolean)
    if (!n || typeof n !== 'object') return undefined
    const ch = (n as Node).children ?? []
    if ((n as Node).type === 'Box' && ch.length && textOf(ch[0]).replace(/^▍/, '').startsWith(head)) return ch
    return walk(ch)
  }
  return walk(tree) ?? []
}

test('the terminal task page draws the history as a timeline, newest first, with a connector line between events', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const lines = section(await ui.drawn(), 'History').slice(1).map(textOf)
  await ui.unmount()
  // newest first: the checker's OK, waits changed, the note, the failed try, created; a "│" line between each
  const firsts = lines.filter(l => /^[✓✗●○] /.test(l))
  expect(firsts.map(l => l.slice(0, 1))).toEqual(['✓', '○', '○', '✗', '○'])
  expect(firsts[0]).toBe('✓ try 2: checker: OK')
  expect(firsts[1]).toBe('○ waits on changed: T-500, T-498 → T-500')
  expect(firsts[2]).toMatch(/^○ the lead added a note: /)
  expect(firsts[3]).toMatch(/^✗ try 1: tried the first fix/)
  expect(firsts[4]).toMatch(/^○ created by the owner because/)
  expect(lines[1]).toBe('│')
  expect(lines.filter(l => l === '│').length).toBe(HISTORY.length - 1)
  // a long line wraps under its own mark, the connector going on beside it; the oldest has nothing below it
  const note = lines.indexOf(firsts[2]!)
  expect(lines[note + 1]).toMatch(/^│ \S/)
  expect(lines.at(-1)).toMatch(/^ {2}\S/)
  expect(lines.slice(lines.indexOf(firsts[4]!) + 1).every(l => l.startsWith('  '))).toBe(true)
})

test('the VS Code task page uses the same kinds and marks, with a connector between events', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const marks: string[] = []
  for (let i = 0; i < HISTORY.length; i++) marks.push(String((await ui.find({ key: `vs-history-${i}` }))?.text).slice(0, 1))
  expect(marks).toEqual([...HISTORY].reverse().map(l => historyEvent(l).mark))
  expect(marks).toEqual(['✓', '○', '○', '✗', '○'])
  const body = section(await ui.drawn(), 'History').map(textOf)
  expect(body.filter(l => l === '│').length).toBe(HISTORY.length - 1)
  expect(body.at(-1)).not.toBe('│')
  await ui.unmount()
})
