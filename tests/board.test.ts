import { expect, test } from 'claude-code/testing'

import { addTask, boardText, emptyBoard, outOfScope, parseBoard, parseScout, patchTask, ready } from '../hooks/board'

const T = '2026-11-09T00:00:00.000Z'

test('tasks run in order, and a task waits for the ones it is after', async () => {
  let b = emptyBoard()
  const [b1, a] = addTask(b, { title: 'A', files: ['src/a.js'] }, T)
  const [b2, c] = addTask(b1, { title: 'C', after: [a.id] }, T)
  const [b3, d] = addTask(b2, { title: 'D', order: 0 }, T)
  b = b3
  expect(ready(b).map(t => t.id)).toEqual([d.id, a.id])
  b = patchTask(b, a.id, { status: 'done' }, T)
  expect(ready(b).map(t => t.id)).toContain(c.id)
  expect(parseBoard(JSON.stringify(b)).tasks.length).toBe(3)
  expect(boardText(b)).toContain('T-1')
})

test('a task can never be allowed to touch the board, Git internals or files outside the project', async () => {
  const [b] = addTask(emptyBoard(), { title: 'x', files: ['src/', './tests/**', '/etc/passwd', '../x', '.symcc/board.json', '.git/config'] }, T)
  expect(b.tasks[0]!.files).toEqual(['src/', 'tests/**'])
  expect(outOfScope(['src/a.js', 'docs/x.md'], ['src/'])).toEqual(['docs/x.md'])
  expect(outOfScope(['src/a.js'], ['src'])).toEqual([])
  expect(outOfScope(['.symcc/board.json'], [])).toEqual(['.symcc/board.json'])
  expect(outOfScope(['test/a.test.js'], ['test/**', 'src/a.js'])).toEqual([])
})

test('waiting tasks show their question; other statuses drop it', async () => {
  let [b, t] = addTask(emptyBoard(), { title: 'mode' }, T)
  b = patchTask(b, t.id, { status: 'waiting', question: 'half up or to even?' }, T)
  expect(boardText(b)).toContain('asks: half up or to even?')
  b = patchTask(b, t.id, { status: 'todo' }, T)
  expect(b.tasks[0]!.question).toBe(null)
})

test('a scout file: front matter sets how often, the body is its instructions', async () => {
  const s = parseScout('tests', '---\nevery_minutes: 15\nmodel: haiku\n---\nFind risky code with no tests.\n')
  expect(s).toEqual({ name: 'tests', every_minutes: 15, model: 'haiku', prompt: 'Find risky code with no tests.' })
  expect(parseScout('plain', 'Just instructions.')?.every_minutes).toBe(60)
  expect(parseScout('empty', '---\nevery_minutes: 5\n---\n')).toBe(null)
})
