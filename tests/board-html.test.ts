// T-1103: the board as one self-contained page (.symcc/board.html), the board tool's view html, /symcc-board html
// and the chat-mode guide line.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { S } from '../hooks/app/state'
import { runTool, boardHtmlText } from '../hooks/app/tools'
import { boardHtml } from '../hooks/core/board-html'
import { parseCommand } from '../hooks/core/commands'
import { taskListBoard } from './task-list-fixture'
import { fakeHost, memoryFs } from './fake-host'
import { saveBoard } from '../hooks/app/store'
import { sessionStart } from '../hooks/app/symcc'

const now = Date.now()

test('T-1103: the page has each needs-you task with its question, each running task, no outside files, a viewport', () => {
  const html = boardHtml(taskListBoard(now), 'proj', now)
  expect(html).toContain('name="viewport"')
  expect(html).toContain('prefers-color-scheme:dark')
  expect(/<script/i.test(html)).toBe(false)
  expect(/<link[^>]*href/i.test(html)).toBe(false)
  expect(/(src|href)="/i.test(html)).toBe(false)
  expect(html).toContain('Needs you')
  expect(html).toContain('T-1 Pick the database')
  expect(html).toContain('Postgres or SQLite?')
  expect(html).toContain('<li>Postgres</li><li>SQLite</li>')
  expect(html).toContain('T-3 Fix the login page')
  expect(html).toContain('T-4 Speed up the import')
  expect(html).toContain('the tests failed')
  expect(html).toContain('T-2 Add search to the list')
  expect(html).toContain('Backlog: 2')
  expect(html.indexOf('Needs you')).toBeLessThan(html.indexOf('Running'))
  expect(html.indexOf('Running')).toBeLessThan(html.indexOf('To do'))
  expect(html.indexOf('To do')).toBeLessThan(html.indexOf('Done today'))
})

test('T-1103: /symcc-board html is read as the page command', () => {
  expect(parseCommand('symcc-board', 'html')).toEqual({ kind: 'board', html: true })
})

test('T-1103: the board tool view html writes the file and answers its path; the guide line is only in chat mode', async () => {
  S.root = '/repo'
  const files = new Map<string, string>()
  const w = fakeHost({
    fs: memoryFs(files),
    env: async () => undefined,
    session: { id: async () => 'a', repo: async () => ({ root: '/repo' }), root: async () => '/repo' },
  })
  await saveBoard(w.host, taskListBoard(now))
  await sessionStart(w.host)
  const said = await runTool(w.host, 'board', { view: 'html' })
  const file = [...files.keys()].find(k => k.endsWith('/board.html'))
  expect(file === undefined).toBe(false)
  expect(said).toContain(file!)
  expect(files.get(file!)).toContain('<title>')
  expect(said.split('\n').length).toBe(2)
  expect((await boardHtmlText(w.host, taskListBoard(now))).startsWith(file!)).toBe(true)
  expect(files.get(file!)).toContain('Postgres or SQLite?')
})
