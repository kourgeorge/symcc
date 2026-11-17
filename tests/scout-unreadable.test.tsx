// T-325: a scout file that can't be read is skipped (and named in /symcc-scouts) instead of stopping the
// scheduling of the other scouts and the rest of session.start.
import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { LEAD_BEAT_MS, addTask, emptyBoard, patchTask } from '../hooks/board'
import { SCOUT_SOON_MS } from '../hooks/plugin/scouts'

const T0 = 1_800_000_000_000
const ISO = '2026-11-13T00:00:00.000Z'
const BOARD = '/.symcc/board.json'
const LEAD = '/.symcc/lead.json'
const SCOUTS = '/.symcc/scouts'

/** Files in memory (keyed from "/.symcc/" on) with scouts a.md (every 30 minutes) and b.md (listed, but its read fails). */
function world(on: On) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const writes: string[] = []
  const spawned: string[] = []
  const state = { lists: 0 }
  files.set(`${SCOUTS}/a.md`, '---\nevery_minutes: 30\n---\nLook around.\n')
  on('fs.exists', (_, e) => ({ value: key(e.path) === SCOUTS || key(e.path) === `${SCOUTS}/b.md` || files.has(key(e.path)) }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`can't read ${e.path}`))))
  on('fs.write', (_, e) => (writes.push(key(e.path)), files.set(key(e.path), (e as unknown as { text: string }).text), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', (_, e) => ({ value: key(e.path) === SCOUTS ? [{ name: 'a.md', kind: 'file' }, { name: 'b.md', kind: 'file' }] : [] }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git') return { value: { exitCode: 0, stdout: rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree' ? 'true\n' : '', stderr: '' } }
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: { exitCode: 1, stdout: '', stderr: 'File exists' } }
      files.set(key(rest[1]!), files.get(key(rest[0]!)) ?? '')
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      writes.push(key(to!))
      files.set(key(to!), files.get(key(from!)) ?? '')
      files.delete(key(from!))
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(key(p))
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('agent.list', () => (state.lists++, { value: [{ id: 'w1', type: 'symcc:worker', name: 'symcc-T-1', status: 'running' }] }) as never)
  on('agent.spawn', (_, e) => (spawned.push(String((e as unknown as { name?: string }).name)), { model: 'sonnet' }) as never)
  on('session.send', () => ({ isDelivered: true }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 's1' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Build it', files: ['src/'], merge_into: 'main' }, ISO)
  files.set(BOARD, JSON.stringify({ ...patchTask(b, 'T-1', { status: 'doing', session: 's1', agent: 'w1', attempts: 1, branch: 'symcc/T-1' }, ISO), mode: 'auto', open_on_start: false }))
  return { files, writes, spawned, state, clock }
}

test('session.start with an unreadable scout file still runs the other scout, the heartbeat and the 2-minute check', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/repo' } as never)
  expect(JSON.parse(w.files.get(LEAD)!).session).toBe('s1')
  // a is scheduled and runs at its first turn
  await w.clock.advance(SCOUT_SOON_MS)
  for (let i = 0; i < 100 && !w.spawned.length; i++) await new Promise(r => setTimeout(r, 5))
  expect(w.spawned.filter(n => /scout/i.test(n)).length).toBe(1)
  expect(w.spawned).toContain('symcc-scout-a')
  // the heartbeat refreshes lead.json one beat later
  const writes = w.writes.length
  await w.clock.advance(LEAD_BEAT_MS)
  expect(w.writes.slice(writes)).toContain(LEAD)
  // the 2-minute check looks at the agents
  const lists = w.state.lists
  await w.clock.advance(2 * 60_000)
  expect(w.state.lists).toBeGreaterThan(lists)
})

test('/symcc-scouts with an unreadable scout file names it instead of throwing', async ($, on) => {
  world(on)
  const text = String((await $.command.run({ command: 'symcc-scouts', args: '' })).text)
  expect(text).toMatch(/b\.md: can't be read, skipped/)
})
