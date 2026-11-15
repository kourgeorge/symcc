// The session.end hook of register.tsx (T-176): /clear ends the session but the process goes on under a new
// session id, so everything keeps running and is handed over to the new id; a real end stops the timers and
// lets go of lead.json. The plugin runs as loaded by the test kit, against the in-memory world below and the
// kit's fake clock (no real waiting). The plugin is loaded fresh for every test.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { type Board, LEAD_BEAT_MS, addTask, emptyBoard, patchTask } from '../hooks/board'

const T0 = 1_800_000_000_000
const ISO = '2026-11-13T00:00:00.000Z'
const BOARD = '/.symcc/board.json'
const LEAD = '/.symcc/lead.json'

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })

/**
 * Files in memory (keyed from "/.symcc/" on), one live worker agent "w1" for T-1, and a session id that
 * the test can change (`state.sid`, as after /clear). Every file write (`writes`), agent.list call
 * (`lists`) and published view's working tasks (`working`) are kept.
 */
function world(on: On) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const writes: string[] = []
  const working: string[][] = []
  const state = { sid: 's1', lists: 0 }

  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (writes.push(key(e.path)), files.set(key(e.path), (e as unknown as { text: string }).text), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    // the board's lock and its save through a temp file (see store.ts)
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
    return { value: ok() }
  })
  on('state.set', (_, e, next) => {
    if (e.key === 'view') {
      const v = ((e as { value?: { value?: unknown } }).value?.value ?? (e as { value?: unknown }).value) as { working?: { task: string }[] }
      working.push((v?.working ?? []).map(w => w.task))
    }
    return next(e)
  })
  on('agent.list', () => (state.lists++, { value: [{ id: 'w1', type: 'symcc:worker', name: 'symcc-T-1', status: 'running' }] }) as never)
  on('session.send', () => ({ isDelivered: true }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.end', (_, e) => ({ sessionId: (e as { sessionId?: string }).sessionId ?? 's1' }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: state.sid }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  return {
    files,
    writes,
    working,
    state,
    clock,
    board: () => JSON.parse(files.get(BOARD)!) as Board,
    lead: () => (files.has(LEAD) ? (JSON.parse(files.get(LEAD)!) as { session: string; heartbeat: number }) : null),
  }
}

type Eng = Parameters<Parameters<typeof test>[1]>[0]

/** Session "s1" starts and drives the board; T-1 is "doing" for "s1", worked on by the live agent w1 (adopted at start). */
async function startDriving($: Eng, w: ReturnType<typeof world>) {
  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Build it', files: ['src/'], merge_into: 'main' }, ISO)
  w.files.set(BOARD, JSON.stringify(patchTask(b, 'T-1', { status: 'doing', session: 's1', agent: 'w1', attempts: 1, branch: 'symcc/T-1' }, ISO)))
  await $.session.start({ cwd: '/repo' } as never)
  // the start itself: s1 drives, and T-1 kept its worker
  expect(w.lead()?.session).toBe('s1')
  expect(w.board().tasks[0]!.status).toBe('doing')
  expect(w.working.at(-1)).toEqual(['T-1'])
}

// ---------------- /clear: everything keeps going under the new id ----------------

test('session.end on /clear hands lead.json over to the new session id', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  w.state.sid = 's2'
  await $.session.end({ sessionId: 's1', reason: 'clear' } as never)
  expect(w.lead()?.session).toBe('s2')
})

test("session.end on /clear moves the old session's doing task to the new id and keeps it doing", async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  w.state.sid = 's2'
  await $.session.end({ sessionId: 's1', reason: 'clear' } as never)
  const t = w.board().tasks[0]!
  expect(t.session).toBe('s2')
  expect(t.status).toBe('doing')
  expect(t.agent).toBe('w1')
})

test('session.end on /clear keeps the live worker: the view published after it still shows T-1 working', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  w.state.sid = 's2'
  const before = w.working.length
  await $.session.end({ sessionId: 's1', reason: 'clear' } as never)
  expect(w.working.length).toBeGreaterThan(before)
  expect(w.working.at(-1)).toEqual(['T-1'])
})

test('session.end on /clear keeps the heartbeat: one beat later lead.json is refreshed for the new id', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  w.state.sid = 's2'
  await $.session.end({ sessionId: 's1', reason: 'clear' } as never)
  // the heartbeat is stamped with Date.now(), which the kit's clock does not move: count the writes instead
  const writes = w.writes.length
  await w.clock.advance(LEAD_BEAT_MS)
  expect(w.writes.slice(writes)).toContain(LEAD)
  expect(w.lead()?.session).toBe('s2')
})

test('session.end on /clear keeps the regular check: two minutes later it still looks at the agents', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  w.state.sid = 's2'
  await $.session.end({ sessionId: 's1', reason: 'clear' } as never)
  const lists = w.state.lists
  await w.clock.advance(2 * 60_000)
  expect(w.state.lists).toBeGreaterThan(lists)
  // the worker is still running, so the check leaves T-1 alone
  expect(w.board().tasks[0]!.status).toBe('doing')
})

test('session.end on /clear with the same session id changes nothing on the board and keeps lead.json', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  const board = w.files.get(BOARD)
  await $.session.end({ sessionId: 's1', reason: 'clear' } as never)
  expect(w.files.get(BOARD)).toBe(board)
  expect(w.lead()?.session).toBe('s1')
})

// ---------------- a real end: everything stops ----------------

test('session.end with no reason removes lead.json, so another session can take over at once', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  await $.session.end({ sessionId: 's1' } as never)
  expect(w.files.has(LEAD)).toBe(false)
})

test('session.end with no reason stops the heartbeat and the check: nothing is written or looked at in the next 2 minutes', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  await $.session.end({ sessionId: 's1' } as never)
  const writes = w.writes.length
  const lists = w.state.lists
  await w.clock.advance(2 * 60_000)
  expect(w.writes.slice(writes)).toEqual([])
  expect(w.state.lists).toBe(lists)
  expect(w.files.has(LEAD)).toBe(false)
})

test('session.end with another reason (logout) is a real end too: lead.json is removed and no beat brings it back', async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  await $.session.end({ sessionId: 's1', reason: 'logout' } as never)
  expect(w.files.has(LEAD)).toBe(false)
  await w.clock.advance(2 * LEAD_BEAT_MS)
  expect(w.files.has(LEAD)).toBe(false)
})

test("session.end with no reason leaves a lead.json of another session alone", async ($, on) => {
  const w = world(on)
  await startDriving($, w)
  // another session took over meanwhile (this one has not seen it yet)
  const other = JSON.stringify({ session: 'other', heartbeat: T0 }) + '\n'
  w.files.set(LEAD, other)
  await $.session.end({ sessionId: 's1' } as never)
  expect(w.files.get(LEAD)).toBe(other)
})
