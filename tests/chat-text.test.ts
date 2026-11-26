// T-1101: the chat shape of the tasks list, the Live status, the no-panel board and one task's page (S.chat set):
// short, plain lines, a question's choices whole and numbered, "Needs you" first; with S.chat empty the text is as before.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { S } from '../hooks/app/state'
import { taskText } from '../hooks/app/tools'
import { addTask, patchTask } from '../hooks/core/task'
import { boardText } from '../hooks/core/banner'
import { chatTasksText, chatStatusText, chatTaskText, askLines, CHAT_MAX } from '../hooks/core/chat-text'
import { tasksListText } from '../hooks/core/task-list'
import { taskListBoard } from './task-list-fixture'

const now = Date.now()
const at = new Date(now).toISOString()

/** The fixture board (9 tasks) plus more to do tasks with long titles, to about 15 open and a long backlog. */
function bigBoard() {
  let b = taskListBoard(now)
  for (let i = 0; i < 8; i++) b = addTask(b, { origin: { why: 'a test' }, title: `Task number ${i} with a rather long title that goes on and on and on past seventy characters`, files: ['src/'], after: [], backlog: i > 5 }, at)[0]
  b = patchTask(b, 'T-1', { details: 'Pick one.\n  - indented line\n' + 'x'.repeat(900), history: [1, 2, 3, 4, 5, 6, 7].map(n => ({ at, kind: 'note', text: `event ${n}` })) as never }, at)
  return b
}

function check(text: string) {
  expect(text.length <= CHAT_MAX).toBe(true)
  expect(text.split('\n').some(l => /^\s/.test(l))).toBe(false)
  expect(/[─━]/.test(text)).toBe(false)
  expect(text.includes('.symcc/')).toBe(false)
  expect(text.startsWith('Needs you')).toBe(true)
  expect(text).toContain('? Postgres or SQLite?\n1. Postgres\n2. SQLite')
}

test('T-1101: the tasks list, board and status in chat shape', () => {
  const b = bigBoard()
  check(chatTasksText(b, now))
  expect(chatTasksText(b, now)).toContain('T-2 running: try 2, 4m: Add search to the list')
  expect(chatTasksText(b, now)).toContain('Backlog: 4 ideas')
  S.chat = 'telegram'
  try {
    check(boardText(b, now, '/some/where', 'symcc', 0, { chat: true }))
    expect(/[⏵⏸]/.test(boardText(b, now, "/x", "symcc", 0, { chat: true }))).toBe(false)
    const status = chatStatusText(b, [{ n: 1, date: '', topic: 't', text: 'x' }], now, 0)
    check(status)
    expect(status).toContain('Org-mem: 1 notes')
    expect(status).toContain('Today: ')
    expect(status).not.toContain('Backlog')
  } finally {
    S.chat = ''
  }
})

test('T-1101: a long board is cut at a line end with a "more" line', () => {
  let b = taskListBoard(now)
  for (let i = 0; i < 80; i++) b = addTask(b, { origin: { why: 'a test' }, title: `Another to do task ${i} with a title`, files: ['src/'], after: [], backlog: false }, at)[0]
  const text = chatTasksText(b, now, 0)
  expect(text.length <= CHAT_MAX).toBe(true)
  expect(text).toContain("more: say 'more tasks'")
})

test('T-1101: one task page in chat shape, and unchanged outside chat mode', () => {
  const b = bigBoard()
  const t = b.tasks.find(x => x.id === 'T-1')!
  const report = { file: '.symcc/reports/T-1-try-1.md', try: 1, text: 'Report body '.repeat(100) }
  const before = taskText(t, false, b.tasks, report)
  expect(before).toContain('.symcc/reports/T-1-try-1.md')
  S.chat = 'telegram'
  try {
    expect(taskText(t, false, b.tasks, report)).toBe(before)
    const text = chatTaskText(t, report, now)
    expect(text.length <= CHAT_MAX && !text.includes('.symcc/') && !text.split('\n').some(l => /^\s/.test(l)) && !/[─━]/.test(text)).toBe(true)
    expect(text).toContain('? Postgres or SQLite?\n1. Postgres\n2. SQLite')
    expect(text.split('\n')[0]).toBe('T-1: Pick the database')
    expect(text).toContain('Report (try 1):')
    expect(text.split('\n').filter(l => l.startsWith('event')).length <= 5).toBe(true)
  } finally {
    S.chat = ''
  }
  expect(taskText(t, false, b.tasks, report)).toBe(before)
  expect(tasksListText(b, now).includes('NEEDS YOU')).toBe(true)
})

test('T-1106: "more" pages list every task once; long questions keep every choice', () => {
  let b = taskListBoard(now)
  for (let i = 0; i < 80; i++) b = addTask(b, { origin: { why: 'a test' }, title: `Another to do task ${i} with a title`, files: ['src/'], after: [], backlog: false }, at)[0]
  const p1 = chatTasksText(b, now, 0)
  const p2 = chatTasksText(b, now, 0, '', 2)
  expect(/\n\+\d+ more: say 'more tasks'$/.test(p1)).toBe(true)
  const last1 = p1.split('\n').filter(l => /^T-\d+ /.test(l)).pop()!.split(' ')[0]
  const first2 = p2.split('\n').find(l => /^T-\d+ /.test(l))!.split(' ')[0]
  expect(Number(first2!.slice(2)) > Number(last1!.slice(2))).toBe(true)
  const ids: string[] = []
  for (let n = 1; n < 20; n++) {
    const t = chatTasksText(b, now, 0, '', n)
    if (t === 'Nothing more.') break
    ids.push(...t.split('\n').filter(l => /^T-\d+ /.test(l)).map(l => l.split(' ')[0]!))
  }
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids.length >= 80).toBe(true)
  expect(chatTasksText(b, now, 0, '', 50)).toBe('Nothing more.')

  const q = askLines('Which one? ' + 'x'.repeat(4000), ['A', 'B'])
  expect(q[0]!.startsWith('? Which one?') && q.length === 3 && q[1] === '1. A').toBe(true)
  const c = askLines('Q?', ['a'.repeat(1300), 'b'.repeat(1300), 'c'.repeat(1300)])
  expect(c.length === 4 && c[3]!.startsWith('3. c')).toBe(true)
  expect(c.join('\n').length < CHAT_MAX).toBe(true)
})
