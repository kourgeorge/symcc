// T-917: typing a long answer on a waiting task's page. The "asks: …" question wraps inside the answer box at any
// width (on the terminal it comes cut into lines that fit), the "Your answer" field keeps every typed character
// (its value) and grows with the text (rows) so its end, where the cursor is, stays in view, and a width change
// draws the same text again. The reject / Ask more box grows and keeps its text the same way; VS Code too.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { inProject } from './project'
import { askShape } from './ask-shape'
import { answerRoom, fieldRows, questionLines, MAX_FIELD_ROWS } from '../hooks/claude/ui/answer-box'

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it (and redraws). */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  inProject(on)
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seed ? { value: { value: seed[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
}

const props = (bodyColumns: number) => ({ title: 'symcc board', isFocused: false, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} })
const pane = (bodyColumns: number) => ({ plugin: 'symcc', component: 'Pane', requestId: 'symcc-board', props: props(bodyColumns) }) as const

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '', ...askShape(extra) })
const view = (tasks: unknown[]) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', test_commands: [] } })

/** `n` characters of words. */
const words = (n: number, word: string) => {
  let s = ''
  for (let i = 1; s.length < n; i++) s += `${s ? ' ' : ''}${word}${i}`
  return s.slice(0, n)
}
const QUESTION = words(300, 'question')
const ANSWER = words(400, 'answer')

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
/** The text of a drawn element: its strings, in order. */
const textOf = (n: unknown): string => (typeof n === 'string' ? n : n && typeof n === 'object' ? ((n as Node).children ?? []).map(textOf).join('') : '')
/** The question lines drawn in the answer box, in order: the Texts at the top of the box, from the "asks: …" one. */
async function asked(ui: { drawn: () => Promise<unknown> }): Promise<string[]> {
  let box: Node | undefined
  const walk = (n: unknown) => {
    if (box || !n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    const x = n as Node
    if (x.type === 'Box' && x.props?.borderColor === 'warning' && (x.children ?? []).some(c => textOf(c).startsWith('asks: '))) box = x
    else (x.children ?? []).forEach(walk)
  }
  walk(await ui.drawn())
  const kids = (box?.children ?? []).filter(c => c && typeof c === 'object') as Node[]
  const out: string[] = []
  for (const k of kids.slice(kids.findIndex(c => textOf(c).startsWith('asks: ')))) {
    if (k.type !== 'Text') break
    out.push(textOf(k))
  }
  return out
}

test('questionLines: a 300-character question fits inside the box at 60 and 100 columns, nothing left out', () => {
  for (const width of [60, 100]) {
    const room = answerRoom(width)
    const lines = questionLines(QUESTION, room).map(l => l.map(s => s.text).join(''))
    expect(lines.length > 1, `${width}`).toBe(true)
    for (const l of lines) expect(l.length, `${width}: ${l}`).toBeLessThanOrEqual(room)
    expect(lines.join(' ')).toBe(`asks: ${QUESTION}`)
  }
  // the question's own line breaks are kept
  expect(questionLines('one\ntwo', 40).map(l => l.map(s => s.text).join(''))).toEqual(['asks: one', 'two'])
})

test('fieldRows: one row while the text fits, more as it grows, at most MAX_FIELD_ROWS; a 400-character answer fits whole at 60 columns', () => {
  expect(fieldRows('', 60, 'Your answer')).toBe(1)
  expect(fieldRows('short', 60, 'Your answer')).toBe(1)
  expect(fieldRows(ANSWER, 60, 'Your answer') > 1).toBe(true)
  expect(fieldRows(ANSWER, 60, 'Your answer') < MAX_FIELD_ROWS).toBe(true)
  expect(fieldRows(ANSWER, 120, 'Your answer') < fieldRows(ANSWER, 60, 'Your answer')).toBe(true)
  expect(fieldRows(words(5000, 'x'), 60, 'Your answer')).toBe(MAX_FIELD_ROWS)
})

for (const width of [60, 100])
  test(`terminal at ${width} columns: a 300-character question is drawn in lines inside the answer box`, async ($, on) => {
    stateOf(on, { opened: 'T-2', view: view([task('T-2', 'waiting', 'Search mode', { question: QUESTION })]) })
    const ui = await $.ui.mount({ ...pane(width), surface: 'terminal' })
    const lines = await asked(ui)
    expect(lines.length > 1).toBe(true)
    for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(answerRoom(width))
    expect(lines.join(' ')).toBe(`asks: ${QUESTION}`)
    await ui.unmount()
  })

test('terminal: a 400-character answer keeps every character, the field grows to show it all, and a width change from 120 to 60 columns keeps it', async ($, on) => {
  stateOf(on, { opened: 'T-3', view: view([task('T-3', 'waiting', 'Search mode', { question: QUESTION })]) })
  const ui = await $.ui.mount({ ...pane(120), surface: 'terminal' })
  expect((await ui.find({ key: 'answer' }))?.props.rows).toBe(1)
  // typed a bit at a time, as a person does
  for (let n = 50; n <= 400; n += 50) await ui.input({ key: 'answer', text: ANSWER.slice(0, n), kind: 'change' })
  await ui.redraw()
  const wide = await ui.find({ key: 'answer' })
  expect(wide?.props.value).toBe(ANSWER)
  expect(wide?.props.rows).toBe(fieldRows(ANSWER, 120, 'Your answer'))
  expect((wide?.props.rows as number) > 1).toBe(true)
  // the board made narrower: the same text, in a taller field, and the question still inside the box
  await ui.redraw(props(60))
  const narrow = await ui.find({ key: 'answer' })
  expect(narrow?.props.value).toBe(ANSWER)
  expect(narrow?.props.rows).toBe(fieldRows(ANSWER, 60, 'Your answer'))
  expect((narrow?.props.rows as number) > (wide?.props.rows as number)).toBe(true)
  // all of it fits in the field (no row cap reached), so its end, where the cursor is, is drawn
  expect((narrow?.props.rows as number) < MAX_FIELD_ROWS).toBe(true)
  for (const l of await asked(ui)) expect(l.length, l).toBeLessThanOrEqual(answerRoom(60))
  await ui.unmount()
})

test('terminal: the reject reason box keeps a 400-character reason and grows with it, at 120 and then 60 columns', async ($, on) => {
  stateOf(on, { opened: 'T-5', view: view([task('T-5', 'review', 'Blue button', { branch: 'symcc/T-5' })]) })
  const ui = await $.ui.mount({ ...pane(120), surface: 'terminal' })
  await ui.press({ key: 'reject' })
  expect((await ui.find({ key: 'reject-reason' }))?.props.rows).toBe(1)
  await ui.input({ key: 'reject-reason', text: ANSWER, kind: 'change' })
  await ui.redraw()
  expect((await ui.find({ key: 'reject-reason' }))?.props.value).toBe(ANSWER)
  await ui.redraw(props(60))
  const box = await ui.find({ key: 'reject-reason' })
  expect(box?.props.value).toBe(ANSWER)
  expect(box?.props.rows).toBe(fieldRows(ANSWER, 60, 'Reason to reject'))
  expect((box?.props.rows as number) > 1).toBe(true)
  await ui.unmount()
})

test('VS Code: the question wraps, and a 400-character answer stays whole in a grown field after a width change from 120 to 60', async ($, on) => {
  stateOf(on, { opened: 'T-4', view: view([task('T-4', 'waiting', 'Search mode', { question: QUESTION })]) })
  const ui = await $.ui.mount({ ...pane(120), surface: 'vscode' })
  // the whole question in one Text that wraps to the panel
  const q = (await ui.findAll({ type: 'Text', text: QUESTION })).find(t => t.text === QUESTION)
  expect(q?.props.wrap).toBe('wrap')
  await ui.input({ key: 'answer', text: ANSWER, kind: 'change' })
  await ui.redraw(props(60))
  const field = await ui.find({ key: 'answer' })
  expect(field?.props.value).toBe(ANSWER)
  expect(field?.props.rows).toBe(fieldRows(ANSWER, 60))
  expect((field?.props.rows as number) > 1).toBe(true)
  await ui.unmount()
})

test('terminal: a half-typed answer does not come back when the task asks a new question later', async ($, on) => {
  const seed: Record<string, unknown> = { opened: 'T-7', view: view([task('T-7', 'waiting', 'Search mode', { question: 'First question?' })]) }
  stateOf(on, seed)
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.input({ key: 'answer', text: 'half typed draft', kind: 'change' })
  await ui.redraw()
  expect((await ui.find({ key: 'answer' }))?.props.value).toBe('half typed draft')
  seed.view = view([task('T-7', 'doing', 'Search mode')])
  await ui.redraw()
  seed.view = view([task('T-7', 'waiting', 'Search mode', { question: 'A totally new question?' })])
  await ui.redraw()
  expect((await ui.find({ key: 'answer' }))?.props.value).toBe('')
  await ui.unmount()
})

test('terminal: a new question on the same task opens with an empty field, even with no redraw in between', async ($, on) => {
  const seed: Record<string, unknown> = { opened: 'T-9', view: view([task('T-9', 'waiting', 'Search mode', { question: 'First question?' })]) }
  stateOf(on, seed)
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  await ui.input({ key: 'answer', text: 'half typed draft', kind: 'change' })
  seed.view = view([task('T-9', 'waiting', 'Search mode', { question: 'A totally new question?' })])
  await ui.redraw()
  expect((await ui.find({ key: 'answer' }))?.props.value).toBe('')
  await ui.unmount()
})

test('VS Code: picking a choice drops the half-typed answer, so the next question opens with an empty field', async ($, on) => {
  const seed: Record<string, unknown> = { opened: 'T-8', view: view([task('T-8', 'waiting', 'Search mode', { question: 'Q1?', options: ['Yes', 'No'] })]) }
  stateOf(on, seed)
  const ui = await $.ui.mount({ ...pane(80), surface: 'vscode' })
  await ui.input({ key: 'answer', text: 'half typed draft', kind: 'change' })
  await ui.press({ key: 'choice-key-1' })
  seed.view = view([task('T-8', 'doing', 'Search mode')])
  await ui.redraw()
  seed.view = view([task('T-8', 'waiting', 'Search mode', { question: 'Q2 new?', options: ['A', 'B'] })])
  await ui.redraw()
  expect((await ui.find({ key: 'answer' }))?.props.value).toBe('')
  await ui.unmount()
})
