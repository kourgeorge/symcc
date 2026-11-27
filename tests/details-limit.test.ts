// T-1161: details past the size limit are refused, never cut silently.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { change, load } from '../hooks/app/store'
import { runTool } from '../hooks/app/tools'
import { S } from '../hooks/app/state'
import { DETAILS_MAX, find } from '../hooks/board'
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
  return w
}

const wish = { title: 'Long one', why: 'asked', origin_by: 'owner', request: 'do it' }

test('T-1161: an add with over-limit details is refused', async () => {
  const w = await world()
  await expect(runTool(w.host, 'add', { ...wish, details: 'x'.repeat(DETAILS_MAX + 1) })).rejects.toThrow('the limit is 8,000')
  expect((await load(w.host)).tasks.length).toBe(0)
})

test('T-1161: an add_details past the limit is refused and the details stay; a short note is appended whole', async () => {
  const w = await world()
  const base = 'y'.repeat(DETAILS_MAX - 100)
  await runTool(w.host, 'add', { ...wish, details: base })
  await expect(runTool(w.host, 'change', { task: 'T-1', add_details: 'n'.repeat(500) })).rejects.toThrow('characters; the limit is')
  expect(find(await load(w.host), 'T-1')!.details).toBe(base)
  await expect(runTool(w.host, 'change', { task: 'T-1', details: 'z'.repeat(DETAILS_MAX + 1) })).rejects.toThrow('the limit is')
  expect(find(await load(w.host), 'T-1')!.details).toBe(base)
  await runTool(w.host, 'change', { task: 'T-1', add_details: 'IMPORTANT: read the file' })
  expect(find(await load(w.host), 'T-1')!.details.endsWith('IMPORTANT: read the file')).toBe(true)
})

test('T-1162: an owner answer past the limit is refused; a short one is appended whole', async () => {
  const w = await world()
  const base = 'y'.repeat(7900)
  await runTool(w.host, 'add', { ...wish, details: base })
  await change(w.host, b => ({ ...b, tasks: b.tasks.map(t => ({ ...t, status: 'waiting' as const })) }))
  await expect(runTool(w.host, 'change', { task: 'T-1', answer: 'A'.repeat(300) + 'END' })).rejects.toThrow('the limit is 8,000')
  const t = find(await load(w.host), 'T-1')!
  expect(t.details).toBe(base)
  expect(t.status).toBe('waiting')
  await runTool(w.host, 'change', { task: 'T-1', answer: 'short END' })
  expect(find(await load(w.host), 'T-1')!.details.endsWith('short END')).toBe(true)
})

test('T-1162: Windows line endings are counted after cleaning', async () => {
  const w = await world()
  await runTool(w.host, 'add', { ...wish, details: 'x\r\n'.repeat(3000) })
  expect((await load(w.host)).tasks.length).toBe(1)
})
