// T-1024: lead tools timed out ("the hooks worker is wedged") and a retried add made a duplicate task.
// An add retried after a timeout answers the task the first one made. (The wedge's real cause is not found.)
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { change } from '../hooks/app/store'
import { runTool } from '../hooks/app/tools'
import { S } from '../hooks/app/state'
import { fakeHost, memoryFs, done } from './fake-host'

async function world() {
  const files = new Map<string, string>()
  const w = fakeHost({
    fs: memoryFs(files),
    run: async ([cmd, ...a]) => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
      if (cmd === 'rm') for (const f of a.filter(v => !v.startsWith('-'))) files.delete(f)
      return done()
    },
  })
  S.root = '/repo'
  S.writing = Promise.resolve()
  S.enabledNow = true
  await change(w.host, b => b)
  return { w, files }
}

test('an add retried after a timeout answers the first task and makes no second one', async () => {
  const { w, files } = await world()
  const wish = { title: 'Retry me', details: 'd', why: 'asked', origin_by: 'owner', request: 'do it' }
  expect(await runTool(w.host, 'add', wish)).toContain('added T-1 Retry me')
  const again = await runTool(w.host, 'add', wish)
  expect(again).toContain('T-1 Retry me was added just before')
  const board = JSON.parse(files.get('/repo/.symcc/board.json')!) as { tasks: { id: string }[] }
  expect(board.tasks.map(t => t.id)).toEqual(['T-1'])
  // another title is a new task
  expect(await runTool(w.host, 'add', { ...wish, title: 'Another' })).toContain('added T-2 Another')
})

const twice = async (extra: Record<string, unknown>) => {
  const { w, files } = await world()
  const wish = { why: 'asked', origin_by: 'owner', request: 'do it', ...extra }
  expect(await runTool(w.host, 'add', wish)).toContain('added T-1')
  expect(await runTool(w.host, 'add', wish)).toContain('was added just before')
  return (JSON.parse(files.get('/repo/.symcc/board.json')!) as { tasks: { id: string }[] }).tasks.length
}

test('a retried add with no details makes no duplicate', async () => {
  expect(await twice({ title: 'No details' })).toBe(1)
})

test('a retried add with \\r\\n in its details makes no duplicate', async () => {
  expect(await twice({ title: 'Windows', details: 'one\r\ntwo\r\n' })).toBe(1)
})

test('a retried add with a title over 200 characters makes no duplicate', async () => {
  expect(await twice({ title: 'x'.repeat(300), details: 'y'.repeat(9000) })).toBe(1)
})
