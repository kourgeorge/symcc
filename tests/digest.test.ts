// T-1173: the lead's digest (what is stuck or repeating), and the board updates that carry a report now that reports are muted.
import { expect } from 'claude-code/testing'
import { emptyBoard, addTask, patchTask, scoutLeadMessage, type Board } from '../hooks/board'
import { digestText, DIGEST_EVERY_MS } from '../hooks/core/digest'
import { digestTick } from '../hooks/app/digest'
import { S, leadQueue } from '../hooks/app/state'
import { saveBoard } from '../hooks/app/store'
import { takeBoardUpdate } from '../hooks/app/tell'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ISO = '2026-11-13T00:00:00.000Z'
const T0 = Date.parse(ISO)

function boardWith(...patches: Record<string, unknown>[]): Board {
  let b = emptyBoard()
  patches.forEach((p, i) => {
    ;[b] = addTask(b, { origin: { why: 'a test' }, title: `Task ${i + 1}`, files: ['src/'], merge_into: 'main' }, ISO)
    b = patchTask(b, `T-${i + 1}`, p as never, ISO)
  })
  return b
}

test('digest: nothing worth saying gives no digest', () => {
  const b = boardWith({ status: 'doing', attempts: 1 }, { status: 'review', attempts: 2 })
  expect(digestText(b.tasks, T0, T0 + 1000)).toBeNull()
})

test('digest: a task on try 3 is named, every time', () => {
  const b = boardWith({ status: 'doing', attempts: 3 })
  expect(digestText(b.tasks, T0, T0 + 1000)).toContain('T-1 "Task 1" (try 3)')
  expect(digestText(b.tasks, T0 + 5000, T0 + 9000)).toContain('T-1 "Task 1" (try 3)')
  expect(digestText(boardWith({ status: 'done', attempts: 3 }).tasks, T0, T0 + 1000)).toBeNull()
})

test('digest: tests failing in 2 tries, and a task waiting for the owner too long', () => {
  const fail = (n: number) => ({ at: '2026-11-13T01:00:00.000Z', kind: 'failed', text: `try ${n}: tests failed`, try: n, reason: 'tests' })
  const b = boardWith({ status: 'doing', attempts: 2, history: [fail(1), fail(2)] }, { status: 'waiting', attempts: 1 })
  const text = digestText(b.tasks, T0, T0 + 6 * 3_600_000)!
  expect(text).toContain('Tests failed since the last digest in 1 task: T-1 "Task 1" (2x)')
  expect(text).toContain('Waiting on the owner for a long time: T-2')
})

test('digest: a single task with one test failure is not worth a line', () => {
  const fail = { at: '2026-11-13T01:00:00.000Z', kind: 'failed', text: 'try 1: tests failed', try: 1, reason: 'tests' }
  expect(digestText(boardWith({ status: 'doing', attempts: 1, history: [fail] }).tasks, T0, T0 + 1000)).toBeNull()
})

const twoFails = () =>
  [1, 2].map(n => ({ at: '2026-11-13T01:00:00.000Z', kind: 'failed', text: `try ${n}: tests failed`, try: n, reason: 'tests' }))

test('digest: 5 tasks each failing tests twice give one test line with 3 names and "and 2 more"', () => {
  const b = boardWith(...[1, 2, 3, 4, 5].map(() => ({ status: 'doing', attempts: 2, history: twoFails() })))
  const text = digestText(b.tasks, T0, T0 + 1000)!
  const testLines = text.split('\n').filter(l => l.includes('Tests failed'))
  expect(testLines.length).toBe(1)
  expect(testLines[0]).toContain('T-3')
  expect(testLines[0]).not.toContain('T-4')
  expect(testLines[0]).toContain('and 2 more')
})

test('digest: tasks failing tests are not named again until their try changes', () => {
  const b = boardWith(...[1, 2].map(() => ({ status: 'doing', attempts: 2, history: twoFails() })))
  const seen = new Map<string, string>()
  expect(digestText(b.tasks, T0, T0 + 1000, seen)).toContain('T-2')
  expect(digestText(b.tasks, T0, T0 + 2000, seen)).toBeNull()
  const moved = { ...b, tasks: b.tasks.map(t => (t.id === 'T-1' ? { ...t, attempts: 3 } : t)) }
  const again = digestText(moved.tasks, T0, T0 + 3000, seen)!
  expect(again).toContain('T-1')
  expect(again).not.toContain('T-2')
})

test('digest: a task on try 3 that also failed tests twice is named once', () => {
  const b = boardWith({ status: 'doing', attempts: 3, history: twoFails() }, { status: 'doing', attempts: 2, history: twoFails() })
  const text = digestText(b.tasks, T0, T0 + 1000)!
  expect(text.split('T-1 ').length - 1).toBe(1)
  expect(text).toContain('T-2')
})

test('digest: a todo task on try 3, unchanged for 4 hours, is named exactly once', () => {
  const b = boardWith({ status: 'todo', attempts: 3 })
  const text = digestText(b.tasks, T0, T0 + 4 * 3_600_000)!
  expect(text.split('T-1 ').length - 1).toBe(1)
})

test('digest: tasks sent back twice then merged are counted; tests failing in 2 tasks are named', () => {
  const back = (n: number) => ({ at: '2026-11-13T01:00:00.000Z', kind: 'checker-problems', text: `try ${n}: problems`, try: n })
  const fail = { at: '2026-11-13T01:00:00.000Z', kind: 'failed', text: 'tests failed', try: 1, reason: 'tests' }
  const merged = (extra: Record<string, unknown> = {}) => ({ status: 'done', merged: 'abc', attempts: 3, updated_at: '2026-11-13T02:00:00.000Z', history: [back(1), back(2)], ...extra })
  const b = boardWith(merged(), merged(), merged({ attempts: 1, history: [] }))
  const text = digestText(b.tasks, T0 - 1, T0 + 1000)!
  expect(text).toContain('sent work back 4 times')
  expect(text).toContain('1 of 3 merged tasks passed on the first try')
  const t = boardWith({ status: 'done', attempts: 1, history: [fail] }, { status: 'done', attempts: 1, history: [fail] })
  expect(digestText(t.tasks, T0 - 1, T0 + 1000)).toContain('Tests failed since the last digest in 2 tasks')
})

async function ticking() {
  const files = new Map<string, string>()
  const w = fakeHost({
    fs: memoryFs(files),
    session: { id: async () => 'a', repo: async () => ({ root: '/repo' }), root: async () => '/repo' },
    run: async argv => {
      const [cmd, ...rest] = argv
      const args = rest.filter(a => !a.startsWith('-'))
      if (cmd === 'mv') {
        const [from, to] = args as [string, string]
        files.set(to, files.get(from)!)
        files.delete(from)
      }
      return done()
    },
  })
  S.root = '/repo'
  S.me = 'a'
  S.driving = true
  S.fresh = false
  S.enabledNow = true
  return w.host
}

test('digest: sent when a task is on try 3, not when nothing is worth saying, and at most every 2 hours', async () => {
  const host = await ticking()
  await saveBoard(host, boardWith({ status: 'doing', attempts: 1 }))
  expect(await digestTick(host, T0)).toBe(false) // the first tick only starts the clock
  expect(await digestTick(host, T0 + DIGEST_EVERY_MS)).toBe(false) // nothing to say
  expect(leadQueue).toEqual([])
  await saveBoard(host, boardWith({ status: 'doing', attempts: 3 }))
  const sent = T0 + DIGEST_EVERY_MS + 60_000
  expect(await digestTick(host, sent)).toBe(true)
  expect(takeBoardUpdate()).toContain('Digest')
  expect(await digestTick(host, sent + 60_000)).toBe(false) // not more often than every 2 hours
  expect(await digestTick(host, sent + DIGEST_EVERY_MS)).toBe(true) // still on try 3: named again
})

test('digest: a backlog task on try 3 is left out', () => {
  const b = boardWith({ status: 'backlog', attempts: 3 })
  expect(digestText(b.tasks, T0, T0 + 1000)).toBeNull()
})

test('digest: 5 stuck tasks show 3 names and "and 2 more"; the rest are named next time', () => {
  const b = boardWith(...[1, 2, 3, 4, 5].map(() => ({ status: 'todo', attempts: 0 })))
  const seen = new Map<string, string>()
  const later = T0 + 6 * 3_600_000
  const text = digestText(b.tasks, T0, later, seen)!
  expect(text).toContain('and 2 more')
  expect(text).toContain('T-3')
  expect(text).not.toContain('T-4')
  const next = digestText(b.tasks, later, later + DIGEST_EVERY_MS, seen)!
  expect(next).toContain('T-4')
  expect(next).toContain('T-5')
  expect(next).not.toContain('T-1 ')
  expect(next).not.toContain('more')
})

test('digest: a second digest 2 hours later with nothing changed is not sent', async () => {
  const host = await ticking()
  await saveBoard(host, boardWith({ status: 'waiting', attempts: 1 }))
  const first = T0 + 6 * 3_600_000
  expect(await digestTick(host, first)).toBe(false) // starts the clock
  expect(await digestTick(host, first + DIGEST_EVERY_MS)).toBe(true)
  expect(takeBoardUpdate()).toContain('Waiting on the owner')
  expect(await digestTick(host, first + 2 * DIGEST_EVERY_MS)).toBe(false)
  expect(leadQueue).toEqual([])
})

test('a scout update carries its report', () => {
  const m = scoutLeadMessage('deps', '1. very particular finding')!
  expect(m).toContain('very particular finding')
  expect(m).not.toContain("its report is the scout's own message")
})
