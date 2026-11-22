// T-808: one Ask record for every question to the owner (task.ask, live.ask, board.questions).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { addTask, emptyBoard, patchTask, find, makeAsk, cleanAsk, askText, taskAsks, addQuestion, cleanQuestions, readBoard, type BoardTask } from '../hooks/board'

const T = '2026-11-20T08:00:00.000Z'
const W = { why: 'a test' }

test('makeAsk and cleanAsk: only the fields of the record are kept, bad ones give nothing', () => {
  expect(makeAsk('worker', 'Which?', T, { options: ['a', 'b'] })).toEqual({ by: 'worker', text: 'Which?', asked_at: T, options: ['a', 'b'] })
  expect(makeAsk('symcc', 'Allow?', T, { files: ['a.ts'], options: [] })).toEqual({ by: 'symcc', text: 'Allow?', asked_at: T, files: ['a.ts'] })
  expect(cleanAsk({ by: 'lead', text: 'x', asked_at: T, extra: 1, options: ['a', 3], lead: { text: ' ' } })).toEqual({ by: 'lead', text: 'x', asked_at: T })
  expect(cleanAsk({ by: 'lead', text: 'x', asked_at: T, lead: { text: 'Mine', options: ['q'] } })).toEqual({ by: 'lead', text: 'x', asked_at: T, lead: { text: 'Mine', options: ['q'] } })
  expect(cleanAsk({ by: 'nobody', text: 'x' })).toBeUndefined()
  expect(cleanAsk('x')).toBeUndefined()
  expect(askText({ text: 'Which?', lead: { text: 'My words' } })).toBe('My words')
  expect(askText({ text: 'Which?' })).toBe('Which?')
  expect(askText(undefined)).toBe('')
})

test('a task keeps its ask only while it waits; the lead\'s wording lives and goes with it', () => {
  const [b0, t] = addTask(emptyBoard(), { origin: W, title: 'x' }, T)
  const ask = makeAsk('worker', 'Red or blue?', T, { options: ['Red', 'Blue'] })
  let b = patchTask(b0, t.id, { status: 'waiting', ask }, T)
  expect(find(b, t.id)!.ask).toEqual(ask)
  // the shown text, the buttons: the worker's own
  expect(taskAsks(find(b, t.id) as BoardTask)).toMatchObject({ text: 'Red or blue?', choices: ['Red', 'Blue', 'Answer…'], files: [] })
  // the lead's wording and buttons replace them
  b = patchTask(b, t.id, { ask: { ...ask, lead: { text: 'Which colour?', options: ['Crimson', 'Navy'] } } }, T)
  expect(taskAsks(find(b, t.id) as BoardTask)).toMatchObject({ text: 'Which colour?', choices: ['Crimson', 'Navy', 'Answer…'] })
  // another change while it waits keeps the record whole
  b = patchTask(b, t.id, { note: 'still waiting' }, T)
  expect(find(b, t.id)!.ask?.lead?.text).toBe('Which colour?')
  // a new question replaces the record (and the old wording)
  b = patchTask(b, t.id, { ask: makeAsk('lead', 'Another?', T) }, T)
  expect(find(b, t.id)!.ask).toEqual({ by: 'lead', text: 'Another?', asked_at: T })
  // answered: it goes back to work and the record is gone
  b = patchTask(b, t.id, { status: 'todo' }, T)
  expect(find(b, t.id)!.ask).toBeUndefined()
  expect('ask' in find(b, t.id)!).toBe(false)
})

test('a file request is an ask with files; its Allow / Don\'t allow buttons come from them', () => {
  const [b0, t] = addTask(emptyBoard(), { origin: W, title: 'x', files: ['src/'] }, T)
  const b = patchTask(b0, t.id, { status: 'waiting', ask: makeAsk('symcc', 'T-1 needs b.ts. Allow them?', T, { files: ['b.ts'] }) }, T)
  expect(taskAsks(find(b, t.id) as BoardTask)).toMatchObject({ text: 'T-1 needs b.ts. Allow them?', choices: ['Allow', "Don't allow", 'Answer…'], files: ['b.ts'] })
})

test('a board question is the same record with an id and by "lead"; an old one without by gets it', () => {
  const [b, q] = addQuestion(emptyBoard(), 'Raise the version?', ['Yes', 'No'], T)
  expect(q).toMatchObject({ id: 'Q-1', by: 'lead', text: 'Raise the version?', options: ['Yes', 'No'], asked_at: T })
  expect(readBoard(JSON.stringify(b)).board.questions?.[0]).toEqual(q)
  expect(cleanQuestions([{ id: 'q2', text: 'Old?', options: ['a'], asked_at: T }])?.[0]).toMatchObject({ id: 'Q-2', by: 'lead' })
})

test('a saved board keeps a bad ask out and a good one in', () => {
  const [b0, t] = addTask(emptyBoard(), { origin: W, title: 'x' }, T)
  const b = patchTask(b0, t.id, { status: 'waiting', ask: makeAsk('worker', 'Which?', T) }, T)
  const raw = JSON.parse(JSON.stringify(b))
  expect(readBoard(JSON.stringify(raw)).board.tasks[0]!.ask?.text).toBe('Which?')
  raw.tasks[0].ask = { text: 5 }
  expect(readBoard(JSON.stringify(raw)).board.tasks[0]!.ask).toBeUndefined()
})
