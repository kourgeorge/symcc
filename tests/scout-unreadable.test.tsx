// T-325: a scout file that can't be read is skipped (and named in /symcc-scouts) instead of stopping the
// scheduling of the other scouts and the rest of session.start.
import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { LEAD_BEAT_MS, addTask, emptyBoard, patchTask } from '../hooks/board'
import { SCOUT_SOON_MS, scheduleScouts, scoutFinished } from '../hooks/plugin/scouts'
import { S, scoutRuns, scoutState } from '../hooks/plugin/state'
import { ran, entry, pause, slash } from './fakes'
import { claudeHost } from '../hooks/claude/host'

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
  on('fs.list', (_, e) => ({ value: key(e.path) === SCOUTS ? [entry('a.md'), entry('b.md')] : [] }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git') return { value: ran({ stdout: rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree' ? 'true\n' : '' }) }
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: ran({ exitCode: 1, stderr: 'File exists' }) }
      files.set(key(rest[1]!), files.get(key(rest[0]!)) ?? '')
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      writes.push(key(to!))
      files.set(key(to!), files.get(key(from!)) ?? '')
      files.delete(key(from!))
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(key(p))
    return { value: ran() }
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
  for (let i = 0; i < 100 && !w.spawned.length; i++) await pause(5)
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
  const text = String((await $.command.run(slash('symcc-scouts'))).text)
  expect(text).toMatch(/b\.md: can't be read, skipped/)
})

// ---------------- T-326: an unreadable scout keeps its entry in scouts.json ----------------

const ROOT = '/repo'
const MEMORY = `${ROOT}/.symcc/scouts.json`
const DIR = `${ROOT}/.symcc/scouts`
const B_RUN = '2026-11-12T00:00:00.000Z'

/** In-memory files: scouts a.md and b.md (b paused in scouts.json, with a last run and report). `o.bad`: b.md's read fails;
 *  `o.gone`: b.md is not in the folder any more. */
function memoryWorld() {
  const files = new Map<string, string>([
    [`${ROOT}/.symcc/board.json`, JSON.stringify({ ...emptyBoard(), mode: 'auto' })],
    [`${DIR}/a.md`, '---\nevery_minutes: 30\n---\nLook around.\n'],
    [`${DIR}/b.md`, '---\nevery_minutes: 30\n---\nLook elsewhere.\n'],
    [MEMORY, JSON.stringify({ scouts: { b: { last_run: B_RUN, last_report: 'b found things', paused: true } } })],
  ])
  const o = { bad: true, gone: false }
  const $ = {
    process: {
      run: async (argv: string[]) => {
        const [cmd, ...rest] = argv
        if (cmd === 'mv') {
          const [, from, to] = rest
          files.set(to!, files.get(from!)!)
          files.delete(from!)
        }
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
    fs: {
      exists: async (p: string) => p === DIR || files.has(p),
      read: async (p: string) => {
        if (o.bad && p === `${DIR}/b.md`) throw new Error('permission denied')
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return files.get(p)!
      },
      write: async (p: string, text: string) => void files.set(p, text),
      stat: async (p: string) => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return { mtimeMs: 0 }
      },
      list: async (p: string) => (p === DIR ? [entry('a.md'), ...(o.gone ? [] : [entry('b.md')])] : []),
    },
    session: { id: async () => 'me', send: async () => undefined },
    agent: { list: async () => [] },
    env: { get: async () => undefined },
    ui: { toast: () => undefined, status: () => undefined, invalidate: () => undefined },
    clock: { after: () => ({ cancel() {} }), every: () => ({ cancel() {} }), sleep: async () => undefined },
    prompt: { submit: async () => undefined },
    state: {
      get: async () => ({ value: undefined, version: 0 }),
      set: async () => ({ isSet: true, version: 1 }),
    },
  }
  S.root = ROOT
  S.leadTimer = null
  S.writing = Promise.resolve()
  S.driving = false
  S.enabledNow = true
  S.players = Promise.resolve({ system: 'other', voice: [], sound: [] }) as never
  const memory = () => JSON.parse(files.get(MEMORY) ?? '{}') as { scouts?: Record<string, { last_run: string | null; last_report?: string; paused?: boolean }> }
  /** Scout a "runs" as agent x1 and finishes with a report. */
  const finishA = async () => {
    scoutState.get('a')!.running = true
    scoutRuns.set('x1', 'a')
    await scoutFinished(claudeHost($ as never), 'x1', '1. a found something.')
  }
  return { $: claudeHost($ as never) as never, claude: $, o, memory, finishA }
}

test("a paused scout whose file can't be read keeps its pause, last run and report when another scout finishes", async () => {
  const w = memoryWorld()
  await scheduleScouts(w.$)
  expect(scoutState.has('b')).toBe(false)
  await w.finishA()
  expect(w.memory().scouts?.b).toEqual({ last_run: B_RUN, last_report: 'b found things', paused: true })
  expect(w.memory().scouts?.a?.last_report).toBe('1. a found something.')
  // once b.md can be read again, b comes back still paused, with its last run
  w.o.bad = false
  await scheduleScouts(w.$)
  expect(scoutState.get('b')?.paused).toBe(true)
  expect(scoutState.get('b')?.last_run).toBe(B_RUN)
})

test('a scout whose file was removed is still dropped from scouts.json when another scout finishes', async () => {
  const w = memoryWorld()
  w.o.bad = false
  w.o.gone = true
  await scheduleScouts(w.$)
  await w.finishA()
  expect(w.memory().scouts?.b).toBeUndefined()
  expect(w.memory().scouts?.a?.last_report).toBe('1. a found something.')
})
