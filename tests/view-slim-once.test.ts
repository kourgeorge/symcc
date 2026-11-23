// T-891: the board view keeps every done and dropped task slim (not only those older than 2 days), publish works the
// slim view out once and writes it as it is, and the Live tab's ▍Today, yesterday and last-7-days lines read the same
// numbers from the slim view as from the whole tasks.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { slimView, slimViewStep, trimNote } from '../hooks/core/view-slim'
import { liveTodayLines, pastDays, segText } from '../hooks/core/live'
import type { SymccView } from '../types'
import { addTask, emptyBoard } from '../hooks/board'
import { publish } from '../hooks/app/lead'
import { S } from '../hooks/app/state'
import { fakeHost, memoryFs } from './fake-host'
import { T0 } from './board-fixture'
import { todayTasks } from './live-today-fixture'
import { pastTasks } from './live-past-fixture'
import { inToday } from './day-clock'
import { searchTasks } from '../hooks/core/panel'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
const text = (n: number, w = 'word ') => w.repeat(Math.ceil(n / w.length)).slice(0, n)

/** A board like T-890's: 200 tasks finished in the last 2 days (each about 6 KB whole) and 20 open ones. */
function bigBoard() {
  const b = emptyBoard()
  const base = addTask(emptyBoard(), { origin: { why: 't' }, title: 'base' }, iso(0))[0].tasks[0]!
  const run = (from: number, to: number) => ({ started: iso(from), ended: iso(to), agents: [{ kind: 'worker' as const, started: iso(from), ended: iso(to), tokens: { input: 900_000, output: 20_000 } }] })
  for (let i = 1; i <= 220; i++) {
    const ago = (i % 40) * 60 * 60_000 + 60_000
    const finished = i <= 200
    b.tasks.push({
      ...base,
      id: `T-${i}`,
      title: `Task ${i}: ${text(60)}`,
      status: finished ? (i % 10 === 0 ? 'dropped' : 'done') : 'todo',
      details: text(2500),
      origin: { why: 't', by: 'owner', request: text(500) },
      history: Array.from({ length: 10 }, (_, k) => ({ at: iso(ago + (10 - k) * 60_000), kind: k === 9 && finished ? 'merged' : 'step', text: text(220) })),
      runs: [run(ago + 50 * 60_000, ago + 30 * 60_000), run(ago + 20 * 60_000, ago + 5 * 60_000)],
      attempts: 2,
      updated_at: iso(ago),
    } as never)
  }
  return b
}

function startS() {
  S.root = '/repo'
  S.writing = Promise.resolve()
  S.enabledNow = true
}

/** A host whose panel trims as Claude Code's does (fitView), counting each time it slims and what it stores. */
function slimmingWorld() {
  const w = fakeHost({ fs: memoryFs(new Map()) })
  const seen = { slims: 0, fittedWrites: 0, otherWrites: 0, made: [] as SymccView[], stored: '' }
  const panel = {
    ...w.panel,
    fitView: (v: SymccView) => {
      seen.slims++
      const r = slimViewStep(v)
      seen.made.push(r.view)
      return { view: r.view, note: trimNote(r.step, r.left) }
    },
    updateView: async (f: (v: SymccView) => SymccView, fitted?: boolean) => {
      if (fitted) seen.fittedWrites++
      else seen.otherWrites++
      const out = f(w.panel.view())
      if (!fitted) seen.slims++
      seen.stored = JSON.stringify(fitted ? out : slimView(out))
      if (fitted) expect(seen.made.includes(out)).toBe(true)
    },
  }
  startS()
  return { ...w, host: { ...w.host, ui: { ...w.host.ui, panel } }, seen }
}

test('T-891: 200 tasks finished in the last 2 days give a view at most a third of the whole one', async () => {
  const b = bigBoard()
  // the view as it was before T-891: a panel that keeps every task whole
  const whole = fakeHost({ fs: memoryFs(new Map()) })
  startS()
  await publish(whole.host, b)
  const wholeSize = JSON.stringify(whole.panel.view()).length
  expect(wholeSize).toBeGreaterThan(1_000_000)
  const w = slimmingWorld()
  await publish(w.host, b)
  expect(w.seen.stored.length).toBeGreaterThan(0)
  expect(w.seen.stored.length).toBeLessThan(wholeSize / 3)
  // the open tasks stay whole
  expect(w.seen.stored.includes(`"id":"T-201"`)).toBe(true)
  const stored = JSON.parse(w.seen.stored) as { tasks: { id: string; details: string; history: unknown[] }[] }
  expect(stored.tasks.find(t => t.id === 'T-201')?.details.length).toBe(2500)
  expect(stored.tasks.find(t => t.id === 'T-1')?.details).toBe('')
  expect(stored.tasks.find(t => t.id === 'T-1')?.history).toEqual([])
})

test('T-891: publish slims the view once and writes that same view', async () => {
  const w = slimmingWorld()
  await publish(w.host, bigBoard())
  expect([w.seen.slims, w.seen.fittedWrites, w.seen.otherWrites]).toEqual([1, 1, 0])
})

test('T-891: ▍Today, yesterday and last 7 days show the same numbers from the slim view as from the whole tasks', () => {
  const view = (tasks: unknown[]) => ({ tasks, working: [], scouts: [], mode: 'auto', test_commands: [] }) as unknown as SymccView
  const lines = (tasks: unknown[], at: number) => liveTodayLines({ tasks: tasks as never[], today_team: undefined }, at, 140, 0).map(segText)
  // tasks finished just now (minutes ago): before T-891 they were kept whole
  const today = todayTasks(T0)
  const slimToday = slimView(view(today)).tasks
  expect((slimToday as unknown as { history: unknown[] }[]).every(t => t.history.length === 0)).toBe(true)
  expect(lines(slimToday, T0)).toEqual(lines(today, T0))
  const n = inToday(Date.now(), 0.5)
  const past = pastTasks(n)
  const slimPast = slimView(view(past)).tasks
  expect(lines(slimPast, n)).toEqual(lines(past, n))
  for (const days of [1, 7]) expect(pastDays(slimPast as never[], n, days)).toEqual(pastDays(past as never[], n, days))
})

test('T-891: slimming an already slim view again (a non-publish panel update) keeps the history marks', () => {
  const view = (tasks: unknown[]) => ({ tasks, working: [], scouts: [], mode: 'auto', test_commands: [] }) as unknown as SymccView
  const lines = (tasks: unknown[], at: number) => liveTodayLines({ tasks: tasks as never[], today_team: undefined }, at, 140, 0).map(segText)
  const today = todayTasks(T0)
  const once = slimView(view(today))
  const twice = slimView({ ...once, branches: {} } as SymccView)
  const marks = (v: SymccView) => JSON.stringify(v.tasks.map(t => (t as unknown as { history_marks?: unknown }).history_marks))
  expect(marks(twice)).toBe(marks(once))
  expect(lines(twice.tasks, T0)).toEqual(lines(today, T0))
  const n = inToday(Date.now(), 0.5)
  const past = pastTasks(n)
  const pastTwice = slimView(slimView(view(past))).tasks
  for (const days of [1, 7]) expect(pastDays(pastTwice as never[], n, days)).toEqual(pastDays(past as never[], n, days))
})

test('T-891: the board search still finds a task finished in the last 2 days by its details and request words', () => {
  const view = (tasks: unknown[]) => ({ tasks, working: [], scouts: [], mode: 'auto', test_commands: [] }) as unknown as SymccView
  const task = (id: string, msAgo: number) => ({ id, title: 'Fix it', status: 'done', details: 'the zebrafish banana', note: '', after: [], files: [], attempts: 1, origin: { why: 'x', by: 'owner', request: 'some pelican words' }, created_at: iso(msAgo), updated_at: iso(msAgo), history: [{ at: iso(msAgo), kind: 'merged', text: 'm' }] })
  const fresh = task('T-5', 60_000)
  const old = task('T-6', 3 * 24 * 60 * 60_000)
  const hits = (tasks: unknown[], q: string) => searchTasks(tasks as SymccView["tasks"], q, now).map(t => t.id)
  const once = slimView(view([fresh, old]), now).tasks
  const twice = slimView(slimView(view([fresh, old]), now), now).tasks
  for (const tasks of [once, twice]) {
    expect(hits(tasks, 'zebrafish')).toEqual(['T-5'])
    expect(hits(tasks, 'elica')).toEqual(['T-5'])
    expect(hits(tasks, 'banana pelican')).toEqual(['T-5'])
    expect(hits(tasks, 'giraffe')).toEqual([])
  }
  expect(hits([fresh, old], 'zebrafish')).toEqual(['T-5', 'T-6'])
})
