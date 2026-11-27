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
import { todayTasks } from './live-today-fixture'
import { pastTasks } from './live-past-fixture'
import { inToday } from './day-clock'
import { searchReads } from '../hooks/app/search-parts'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
/** Varied text, as real details and requests are (not one repeated word): words of 2 to 11 letters made from
 *  syllables by a seeded random walk, with commas and full stops, so most of them differ. */
let seedNo = 891
const rnd = () => ((seedNo = (seedNo * 1103515245 + 12345) % 2147483648), seedNo / 2147483648)
const SYLLABLES = ['ba', 'ke', 'lo', 'mi', 'nu', 'pre', 'st', 'ar', 'en', 'ti', 'on', 'qu', 'ra', 'sh', 'ul', 'vo', 'wy', 'xe', 'zo', 'ch', 'th', 'or', 'il', 'em', 'ad', 'ex']
function text(n: number) {
  let out = ''
  while (out.length < n) {
    let w = ''
    const len = 1 + Math.floor(rnd() * 4)
    for (let i = 0; i < len; i++) w += SYLLABLES[Math.floor(rnd() * SYLLABLES.length)]
    const end = rnd()
    out += w + (end < 0.06 ? '. ' : end < 0.12 ? ', ' : ' ')
  }
  return out.slice(0, n)
}

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
      timeline: Array.from({ length: 10 }, (_, k) => ({ at: iso(ago + (10 - k) * 60_000), kind: k === 9 && finished ? 'merged' : 'step', text: text(220) })),
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
  // the texts are varied: a long details text has many different words
  expect(new Set(String(b.tasks[0]!.details).split(/\s+/)).size).toBeGreaterThan(200)
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
  // a finished task's view entry is a plain stub: none of its details or request words are kept
  const t1 = b.tasks.find(t => t.id === 'T-1')!
  for (const word of String(t1.details).split(/[\s.,]+/).filter(x => x.length > 8).slice(0, 20)) expect(JSON.stringify(JSON.parse(w.seen.stored).tasks.find((t: { id: string }) => t.id === 'T-1')).includes(word)).toBe(false)
  // the open tasks stay whole
  expect(w.seen.stored.includes(`"id":"T-201"`)).toBe(true)
  const stored = JSON.parse(w.seen.stored) as { tasks: { id: string; details: string; timeline: unknown[] }[] }
  expect(stored.tasks.find(t => t.id === 'T-201')?.details.length).toBe(2500)
  expect(stored.tasks.find(t => t.id === 'T-1')?.details).toBe('')
  expect(stored.tasks.find(t => t.id === 'T-1')?.timeline).toEqual([])
})

test('T-891: publish slims the view once and writes that same view', async () => {
  const w = slimmingWorld()
  await publish(w.host, bigBoard())
  expect([w.seen.slims, w.seen.fittedWrites, w.seen.otherWrites]).toEqual([1, 1, 0])
})

test('T-891: publish never reads a parts file (only a typed search does)', async () => {
  const w = slimmingWorld()
  const reads: string[] = []
  const host = { ...w.host, fs: { ...w.host.fs, read: (p: string) => (reads.push(p), w.host.fs.read(p)) } }
  const before = searchReads.files
  await publish(host as typeof w.host, bigBoard())
  expect(reads.filter(p => /\/tasks\/T-\d+\.json$/.test(p))).toEqual([])
  expect(searchReads.files).toBe(before)
})

test('T-891: ▍Today, yesterday and last 7 days show the same numbers from the slim view as from the whole tasks', () => {
  const view = (tasks: unknown[]) => ({ tasks, working: [], scouts: [], mode: 'auto', test_commands: [] }) as unknown as SymccView
  const lines = (tasks: unknown[], at: number) => liveTodayLines({ tasks: tasks as never[], today_team: undefined }, at, 140, 0).map(segText)
  // tasks finished just now (updated a minute before the real now): before T-891 they were kept whole
  const t0 = Date.now()
  const today = todayTasks(t0)
  const slimToday = slimView(view(today)).tasks
  expect((slimToday as unknown as { timeline: unknown[] }[]).every(t => t.timeline.length === 0)).toBe(true)
  expect(lines(slimToday, t0)).toEqual(lines(today, t0))
  expect(lines(today, t0).join('\n')).toContain('3')
  const n = inToday(Date.now(), 0.5)
  const past = pastTasks(n)
  const slimPast = slimView(view(past)).tasks
  expect(lines(slimPast, n)).toEqual(lines(past, n))
  for (const days of [1, 7]) expect(pastDays(slimPast as never[], n, days)).toEqual(pastDays(past as never[], n, days))
})

test('T-891: slimming an already slim view again (a non-publish panel update) keeps the timeline marks', () => {
  const view = (tasks: unknown[]) => ({ tasks, working: [], scouts: [], mode: 'auto', test_commands: [] }) as unknown as SymccView
  const lines = (tasks: unknown[], at: number) => liveTodayLines({ tasks: tasks as never[], today_team: undefined }, at, 140, 0).map(segText)
  const t0 = Date.now()
  const today = todayTasks(t0)
  const once = slimView(view(today))
  const twice = slimView({ ...once, branches: {} } as SymccView)
  const marks = (v: SymccView) => JSON.stringify(v.tasks.map(t => (t as unknown as { timeline_marks?: unknown }).timeline_marks))
  expect(marks(twice)).toBe(marks(once))
  expect(lines(twice.tasks, t0)).toEqual(lines(today, t0))
  const n = inToday(Date.now(), 0.5)
  const past = pastTasks(n)
  const pastTwice = slimView(slimView(view(past))).tasks
  for (const days of [1, 7]) expect(pastDays(pastTwice as never[], n, days)).toEqual(pastDays(past as never[], n, days))
})
