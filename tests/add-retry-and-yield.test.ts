// T-1024: lead tools timed out ("the hooks worker is wedged") and a retried add made a duplicate task.
// A big session log is read in turns (the event loop gets a go between them), and an add retried after a timeout
// answers the task the first one made.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { Host } from '../hooks/host'
import { leadCalls, leadCallsYielding, leadUsage, LEAD_LOGS, LINES_PER_TURN } from '../hooks/claude/lead-usage'
import { change } from '../hooks/app/store'
import { runTool } from '../hooks/app/tools'
import { S } from '../hooks/app/state'
import { fakeHost, memoryFs, done } from './fake-host'

const NOW = Date.now()
const logLine = (i: number) => JSON.stringify({ type: 'assistant', timestamp: new Date(NOW).toISOString(), message: { id: `m${i}`, content: [{ type: 'text', text: 'x'.repeat(2000) }], usage: { input_tokens: 5, output_tokens: i + 1 } } })
const bigLog = Array.from({ length: LINES_PER_TURN * 12 + 7 }, (_, i) => logLine(i)).join('\n')

test('a big session log is read in turns, with the same calls as reading it at once', async () => {
  let turns = 0
  const got = await leadCallsYielding(bigLog, async () => void turns++)
  expect(got).toEqual(leadCalls(bigLog))
  expect(got.length).toBe(LINES_PER_TURN * 12 + 7)
  // never more than LINES_PER_TURN lines between two turns
  expect(turns).toBeGreaterThanOrEqual(12)
})

test('lines without an id keep their own number across turns', async () => {
  const noId = Array.from({ length: LINES_PER_TURN * 2 + 3 }, () => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 1 } } })).join('\n')
  const got = await leadCallsYielding(noId, async () => undefined)
  expect(new Set(got.map(c => c.id)).size).toBe(LINES_PER_TURN * 2 + 3)
})

test('leadUsage gives the host clock a turn while it reads a big log', async () => {
  let sleeps = 0
  const $ = {
    env: async (n: string) => (n === 'HOME' ? '/h' : undefined),
    fs: { list: async () => [{ name: 's.jsonl', kind: 'file', size: 1, mtimeMs: NOW, isLink: false }], read: async () => bigLog },
    clock: { sleep: async () => void sleeps++ },
  } as unknown as Host
  const r = await leadUsage($, '/p', { kind: 'all' }, NOW)
  expect(r.lead?.length).toBe(LINES_PER_TURN * 12 + 7)
  expect(r.leadFrom).toBe(LEAD_LOGS)
  expect(sleeps).toBeGreaterThanOrEqual(12)
})

test('an add retried after a timeout answers the first task and makes no second one', async () => {
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
  const wish = { title: 'Retry me', details: 'd', why: 'asked', origin_by: 'owner', request: 'do it' }
  expect(await runTool(w.host, 'add', wish)).toContain('added T-1 Retry me')
  const again = await runTool(w.host, 'add', wish)
  expect(again).toContain('T-1 Retry me was added just before')
  const board = JSON.parse(files.get('/repo/.symcc/board.json')!) as { tasks: { id: string }[] }
  expect(board.tasks.map(t => t.id)).toEqual(['T-1'])
  // another title is a new task
  expect(await runTool(w.host, 'add', { ...wish, title: 'Another' })).toContain('added T-2 Another')
})
