// T-690: the Live tab: one lane per task in doing (core/live.ts works out the stations, the order, next up and today's
// numbers; claude/ui/live.tsx draws them on the terminal panel).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { liveLanes, liveLayout, laneLines, liveLabelLine, liveLabelSegs, LIVE_AGENT_MARK, LIVE_TONE, liveStations, liveTrains, trainRows, type LiveTrain, liveToday, todayLines, segText, liveBlink, liveHeader, liveHeaderSegs, liveScoutMark, scoutsRunning, tabRow, LIVE_TABS, LIVE_EMPTY, LIVE_LEGEND, LIVE_DIVIDER, LIVE_INDENT, liveInner, liveBarLegend, liveLegend } from '../hooks/core/live'
import { textWidth } from '../hooks/core/stats'
import { FINISH_STALE_MS } from '../hooks/core/lead'
import { listKeys } from '../hooks/board'
import { viewTask } from '../hooks/core/board-parts'
import { LIVE_TICK_MS } from '../hooks/claude/ui/live'
import { BLINK_CSS } from '../hooks/claude/ui/vscode-live'
import { mdLink, vsHref } from '../hooks/claude/ui/vscode'
import { PANE, T0, seedBoard } from './board-fixture'
import { publish } from '../hooks/app/lead'
import { S, scoutRuns, scoutState, type PaneView } from '../hooks/app/state'
import { emptyBoard } from '../hooks/core/board-file'
import { fakeHost } from './fake-host'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', order: Number(id.slice(2)), after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })

/** Four tasks in doing, one at each place: a worker running (T-687), a checker (T-686), the tests (T-685), the merge queue (T-684). */
const TASKS = [
  task('T-687', 'Organizational memory search', { runs: [{ started: iso(4) }] }),
  task('T-684', '/symcc-doctor checks the hooks', { attempts: 2, runs: [{ started: iso(60), ended: iso(50), agents: [{ kind: 'worker' as const, started: iso(60), ended: iso(50), tokens: { input: 1_100_000 } }] }, { started: iso(30), ended: iso(10), agents: [{ kind: 'worker' as const, started: iso(30), ended: iso(10), tokens: { input: 1_100_000 } }] }], live: { checking: { step: 'queue', at: iso(0), place: 2 } }, history: [{ kind: 'checker-problems', at: iso(40), text: 'try 1: checker: problems' }, { kind: 'stage', at: iso(5), text: 'try 2: waits in the merge queue (place 2)', try: 2, step: 'queue' }] }),
  task('T-686', 'Scout page: drop the first line', { runs: [{ started: iso(20), ended: iso(2), agents: [{ kind: 'worker' as const, started: iso(20), ended: iso(2), tokens: { input: 540_000 } }, { id: 'agent-c', kind: 'checker' as const, started: iso(2) }] }], live: { checking: { step: 'checker', at: iso(0) } }, history: [{ kind: 'stage', at: iso(2), text: 'try 1: prep started', try: 1, step: 'prep' }] }),
  task('T-685', 'OpenCode: give every board screen buttons', { runs: [{ started: iso(25), ended: iso(9), agents: [{ kind: 'worker' as const, started: iso(25), ended: iso(9), tokens: { input: 3_400_000 } }] }], live: { checking: { step: 'testing', at: iso(0) } }, history: [{ kind: 'stage', at: iso(3), text: 'try 1: tests started', try: 1, step: 'tests' }] }),
  task('T-688', 'Handed back, in prep', { runs: [{ started: iso(15), ended: iso(1), agents: [{ kind: 'worker' as const, started: iso(15), ended: iso(1), tokens: { input: 200_000 } }] }], live: { checking: { step: 'prep', at: iso(0) } }, }),
  task('T-600', 'A merged one', { status: 'done', runs: [{ started: iso(300), ended: iso(200), agents: [{ kind: 'worker' as const, started: iso(300), ended: iso(200), tokens: { input: 800_000 } }] }], history: [{ kind: 'merged', at: iso(30), text: 'try 1 → merged into main' }] }),
  task('T-601', 'A failed one', { status: 'failed', updated_at: iso(20) }),
  task('T-690', 'Live tab part 1', { status: 'todo', order: 5 }),
  task('T-691', 'Live tab in VS Code', { status: 'todo', after: ['T-690'], order: 1 }),
  task('T-692', 'Live tab in OpenCode', { status: 'todo', after: ['T-600'], order: 9 }),
  task('T-693', 'A backlog idea', { status: 'backlog' }),
]
const view = (checker: boolean) => ({ tasks: TASKS as never[], checker, mode: 'auto' as const, max_parallel: 3 })

test('T-690: liveLanes puts each doing task at its station, and leaves check out when the checker is off', () => {
  const at = (checker: boolean) => Object.fromEntries(liveLanes(view(checker), T0).map(l => [l.id, l.station]))
  expect(at(true)).toEqual({ 'T-687': 'work', 'T-688': 'check', 'T-686': 'check', 'T-685': 'tests', 'T-684': 'queue' })
  expect(liveLanes(view(true), T0)[0]!.stations).toEqual(['work', 'check', 'queue', 'tests', 'merged'])
  // checker off: no check station; prep counts at work
  const off = liveLanes(view(false), T0)
  expect(off[0]!.stations).toEqual(['work', 'queue', 'tests', 'merged'])
  expect(at(false)['T-688']).toBe('work')
  // only tasks in doing get a lane
  expect(off.map(l => l.id).sort()).toEqual(['T-684', 'T-685', 'T-686', 'T-687', 'T-688'])
  const lane = (id: string) => liveLanes(view(true), T0).find(l => l.id === id)!
  expect(lane('T-684').place).toBe(2)
  expect(lane('T-684').sentBack).toBe(1)
  expect(lane('T-684').tryNo).toBe(2)
  // T-757: the whole task's tokens, every try
  expect(lane('T-684').tokens).toBe(2_200_000)
  // a running worker's tokens are only known at its hand-back
  expect(lane('T-687').tokens).toBe(undefined)
  // the time at the station: from the history's stage line
  expect(lane('T-685').sinceMs).toBe(T0 - 3 * 60_000)
  expect(liveHeader(view(true), liveLanes(view(true), T0))).toBe('⏵ auto merge · agents 2/3 busy')
})

test('T-709: an approved task in review, or a waiting one whose merge runs, gets a lane at its real station while its check step is fresh', () => {
  const sec = (s: number) => new Date(T0 - s * 1000).toISOString()
  const tried = { runs: [{ started: iso(40), ended: iso(20), agents: [{ kind: 'worker' as const, started: iso(40), ended: iso(20), tokens: { input: 300_000 } }] }] }
  const lanes = (...tasks: unknown[]) => liveLanes({ tasks: tasks as never[], checker: true, mode: 'auto', max_parallel: 3 }, T0)
  // (1) a review task whose approve is in its tests, then in the merge queue at place 2
  const testing = lanes(task('T-1', 'Approved', { status: 'review', ...tried, live: { checking: { step: 'testing', at: sec(5) } }, }))
  expect(testing.map(l => [l.id, l.station])).toEqual([['T-1', 'tests']])
  const queued = lanes(task('T-1', 'Approved', { status: 'review', ...tried, live: { checking: { step: 'queue', at: sec(5), place: 2 } }, }))
  expect(queued.map(l => [l.station, l.place])).toEqual([['queue', 2]])
  // (2) a stale check step, or none: the task only waits for the owner, so its lane (T-846) sits at "you"
  expect(lanes(task('T-1', 'Approved', { status: 'review', ...tried, live: { checking: { step: 'testing', at: new Date(T0 - FINISH_STALE_MS - 1000).toISOString() } }, })).map(l => l.station)).toEqual(['you'])
  expect(lanes(task('T-1', 'Approved', { status: 'review', ...tried })).map(l => l.station)).toEqual(['you'])
  // (3) a waiting task whose merge runs once its files are clear
  const merging = lanes(task('T-2', 'Files cleared', { status: 'waiting', ...tried, live: { checking: { step: 'merging', at: sec(5) } }, }))
  expect(merging.map(l => [l.id, l.station])).toEqual([['T-2', 'merged']])
  // order: an approve by when it started (its prep line), next to the doing tasks by when their try started
  const order = lanes(
    task('T-3', 'Worker', { runs: [{ started: iso(10) }] }),
    task('T-1', 'Approved', { status: 'review', ...tried, live: { checking: { step: 'testing', at: sec(5) } }, history: [{ kind: 'stage', at: iso(15), text: 'try 1: prep started', try: 1, step: 'prep' }] }),
    task('T-2', 'Files cleared', { status: 'waiting', ...tried, live: { checking: { step: 'merging', at: sec(5) } }, history: [{ kind: 'stage', at: iso(30), text: 'try 1: prep started', try: 1, step: 'prep' }, { kind: 'stage', at: iso(3), text: 'try 1: prep started', try: 1, step: 'prep' }] }),
  )
  expect(order.map(l => l.id)).toEqual(['T-1', 'T-3', 'T-2'])
  expect(order[0]!.sinceMs).toBe(T0 - 5000)
})

test('T-690: lanes are ordered by when the task entered doing, earliest first', () => {
  expect(liveLanes(view(true), T0).map(l => l.id)).toEqual(['T-684', 'T-685', 'T-686', 'T-688', 'T-687'])
})

test('T-690, T-715: next up lists only the todo tasks free to start, in start order; one waiting for a todo task on no lane is counted in "more"', () => {
  const t = liveTrains(view(true), T0)
  // T-692 waits on a done task: free; T-691 waits on T-690, which is todo and runs on no lane
  expect(t.next.map(x => x.id)).toEqual(['T-690', 'T-692'])
  expect(t.next.map(x => x.stuck)).toEqual([[], []])
  expect(t.more).toBe(1)
  expect(Object.values(t.lanes).flat()).toEqual([])
})

// T-715: waiting trains. Two lanes: T-712 at work, T-690 at check; todo tasks waiting for them, for each other, for a
// failed task; one free and one waiting for the free one.
const TRAINS = [
  task('T-712', 'Scout ordering fix', { runs: [{ started: iso(2) }] }),
  task('T-690', 'Live tab first part', { attempts: 2, runs: [{ started: iso(30), ended: iso(3), agents: [{ kind: 'worker' as const, started: iso(30), ended: iso(3), tokens: { input: 1_400_000 } }, { id: 'agent-c', kind: 'checker' as const, started: iso(3) }] }], live: { checking: { step: 'checker', at: iso(0) } }, history: [{ kind: 'stage', at: iso(3), text: 'try 2: prep started', try: 2, step: 'prep' }] }),
  task('T-701', 'A failed one', { status: 'failed', updated_at: iso(20) }),
  task('T-713', 'Task files: no silent drops', { status: 'todo', after: ['T-712'] }),
  task('T-714', 'Help: /symcc-help shows all', { status: 'todo', after: ['T-713'] }),
  task('T-716', 'Live deps drawn as trains', { status: 'todo', after: ['T-712', 'T-690'] }),
  task('T-717', 'Waits for a todo and a lane', { status: 'todo', after: ['T-690', 'T-713'] }),
  task('T-718', 'Waits for the failed one', { status: 'todo', after: ['T-701'] }),
  task('T-715', 'Free to start', { status: 'todo', order: 1 }),
  task('T-719', 'Waits for the free one', { status: 'todo', after: ['T-715'] }),
]
const trainView = { tasks: TRAINS as never[], checker: true, mode: 'auto' as const, max_parallel: 3 }
/** A tree of trains as "id(+also)[children]" text, to compare in one line. */
const shape = (xs: readonly { id: string; also: string[]; trains: unknown[] }[]): string =>
  xs.map(x => `${x.id}${x.also.length ? `(+${x.also.join(',')})` : ''}${x.trains.length ? `[${shape(x.trains as never)}]` : ''}`).join(' ')

test('T-715: liveTrains hangs a todo task under its running blocker, a todo-on-todo under its blocker\'s train, a several-blocker one once under the furthest from merging; next up holds the free and the stuck', () => {
  const t = liveTrains(trainView, T0)
  // T-713 under T-712's lane; T-714 (waits for T-713) under T-713's train; T-716 waits for T-712 (work) and T-690
  // (check): under T-712, the earlier station; T-717 waits for T-690 (running) and T-713 (todo): under T-713
  expect(shape(t.lanes['T-712']!)).toBe('T-713[T-714 T-717(+T-690)] T-716(+T-690)')
  expect(t.lanes['T-690']).toEqual([])
  // no copies: each waiting task once
  const all = (xs: readonly LiveTrain[]): string[] => xs.flatMap(x => [x.id, ...all(x.trains)])
  expect(all(Object.values(t.lanes).flat()).sort()).toEqual(['T-713', 'T-714', 'T-716', 'T-717'])
  expect(t.hung).toBe(4)
  // next up: the free one, and the one stuck behind a failed task; T-719 (waits for the free T-715) is "1 more"
  expect(t.next).toEqual([
    { id: 'T-715', title: 'Free to start', stuck: [] },
    { id: 'T-718', title: 'Waits for the failed one', stuck: [{ id: 'T-701', status: 'failed' }] },
  ])
  expect(t.more).toBe(1)
  // a paused blocker, or one waiting for the owner: stuck too
  const paused = liveTrains({ ...trainView, tasks: TRAINS.map(x => (x.id === 'T-701' ? { ...x, status: 'paused' } : x)) as never[] }, T0)
  expect(paused.next[1]!.stuck).toEqual([{ id: 'T-701', status: 'paused' }])
})

test('T-715: two blockers at the same station: the train hangs under the one that started latest', () => {
  const tasks = [
    task('T-1', 'Early', { runs: [{ started: iso(30) }] }),
    task('T-2', 'Late', { runs: [{ started: iso(5) }] }),
    task('T-3', 'Waits for both', { status: 'todo', after: ['T-1', 'T-2'] }),
  ]
  const t = liveTrains({ tasks: tasks as never[], checker: true }, T0)
  expect(shape(t.lanes['T-2']!)).toBe('T-3(+T-1)')
  expect(t.lanes['T-1']).toEqual([])
})

test('T-715: train rows: "└─◇" indented by level, "waits" and "+ also"; nothing wider than the panel; long chains end in "+N more waiting"', () => {
  const t = liveTrains(trainView, T0)
  const rows = trainRows(t.lanes['T-712']!, 100)
  expect(rows.map(r => segText(r.segs))).toEqual([
    '  └─◇ T-713 Task files: no silent d…  waits',
    '     └─◇ T-714 Help: /symcc-help shows…  waits',
    '     └─◇ T-717 Waits for a todo and a …  waits  + also T-690',
    '  └─◇ T-716 Live deps drawn as trai…  waits  + also T-690',
  ])
  expect(rows.map(r => r.id)).toEqual(['T-713', 'T-714', 'T-717', 'T-716'])
  for (const w of [100, 60, 40, 32, 24])
    for (const r of trainRows(t.lanes['T-712']!, w)) expect([w, segText(r.segs), textWidth(segText(r.segs)) <= w]).toEqual([w, segText(r.segs), true])
  // a chain of 9: three levels, then the rest counted
  const chain = [task('T-1', 'Runs', { runs: [{ started: iso(3) }] }), ...Array.from({ length: 9 }, (_, i) => task(`T-${i + 2}`, `Step ${i + 2}`, { status: 'todo', after: [`T-${i + 1}`] }))]
  const deep = trainRows(liveTrains({ tasks: chain as never[] }, T0).lanes['T-1']!, 60)
  expect(deep.map(r => r.id ?? segText(r.segs))).toEqual(['T-2', 'T-3', 'T-4', '  └─ +6 more waiting'])
  // eight side by side: six, then the rest counted
  const wide = [task('T-1', 'Runs', { runs: [{ started: iso(3) }] }), ...Array.from({ length: 8 }, (_, i) => task(`T-${i + 2}`, `Side ${i + 2}`, { status: 'todo', after: ['T-1'] }))]
  const many = trainRows(liveTrains({ tasks: wide as never[] }, T0).lanes['T-1']!, 60)
  expect(many.length).toBe(7)
  expect(segText(many[6]!.segs)).toBe('  └─ +2 more waiting')
})

test('T-690: today counts merges, send-backs, failures and tokens of today', () => {
  const d = liveToday(TASKS as never[], T0, 0)
  expect(d).toEqual({ merged: 1, sentBack: 1, failed: 1, tokens: 1_100_000 + 1_100_000 + 540_000 + 3_400_000 + 200_000 + 800_000 })
  // T-758: no "today" label (the ▍Today heading says it)
  expect(todayLines(d, 80)).toEqual(['✓ 1 merged   ↺ 1 sent back   ✗ 1 failed   Σ 7.1M tokens'])
  for (const l of todayLines(d, 30)) expect(textWidth(l)).toBeLessThanOrEqual(30)
})

test('T-690: today works on a board view whose done tasks come without their history (as OpenCode reads it)', () => {
  const slim: Record<string, unknown>[] = TASKS.map(t => viewTask((t.id === 'T-600' ? { ...t, merged: 'abc1234', updated_at: iso(30) } : t) as never))
  expect('history' in slim.find(t => t.id === 'T-600')!).toBe(false)
  expect(liveToday(slim as never[], T0, 0)).toEqual({ merged: 1, sentBack: 1, failed: 1, tokens: 1_100_000 + 1_100_000 + 540_000 + 3_400_000 + 200_000 + 800_000 })
})

test('T-690: lane lines fit the width with nothing cut, and the current station blinks', () => {
  for (const checker of [true, false])
    for (const width of [100, 80, 60, 50, 40, 32]) {
      const lanes = liveLanes(view(checker), T0)
      const l = liveLayout(lanes, liveStations(checker), width)
      expect(textWidth(liveLabelLine(l))).toBeLessThanOrEqual(width)
      for (const lane of lanes)
        for (const s of laneLines(lane, l, { nowMs: T0, frame: 0 })) expect(textWidth(segText(s))).toBeLessThanOrEqual(width)
    }
  const lanes = liveLanes(view(true), T0)
  const l = liveLayout(lanes, liveStations(true), 80)
  const q = lanes.find(x => x.id === 'T-684')!
  const [a] = laneLines(q, l, { nowMs: T0, frame: 0 })
  const [b] = laneLines(q, l, { nowMs: T0, frame: 1 })
  expect(segText(a)).toContain('●━━━━━━━━●━━━━━━━━◉────────○────────○')
  expect(segText(b)).toContain('●━━━━━━━━●━━━━━━━━◎────────○────────○')
  expect(segText(a).trimEnd().endsWith('#2')).toBe(true)
  expect(segText(a)).toContain('T-684 /symcc-doctor')
  expect(liveBlink(1, true)).toBe('◉')
  // the token bar is full at the usual tokens per merged task: past twice it, a warning
  const over = laneLines(lanes.find(x => x.id === 'T-685')!, l, { nowMs: T0, frame: 0 })[1]
  expect(segText(over)).toContain('3.4M ⚠')
  expect(over.some(s => s.tone === 'warning')).toBe(true)
  expect(segText(laneLines(lanes.find(x => x.id === 'T-687')!, l, { nowMs: T0, frame: 0 })[1])).toContain('tokens at hand-back')
})

const C_WARNING = '"color":"warning"'
/** T-757: the usual tokens per merged task is 4M (one done task); lanes: try 2 running after a 4M try 1 (T-801), try 2
 *  handed back with 1M (T-802), try 1 running (T-803), at the usual (T-804), at half (T-805), past twice it (T-806). */
const T757 = [
  task('T-800', 'Done at 4M', { status: 'done', runs: [{ started: iso(300), ended: iso(200), agents: [{ kind: 'worker' as const, started: iso(300), ended: iso(200), tokens: { input: 4_000_000 } }] }], history: [{ kind: 'merged', at: iso(30), text: 'try 1 → merged into main' }] }),
  task('T-801', 'Try 2 running', { attempts: 2, runs: [{ started: iso(60), ended: iso(50), agents: [{ kind: 'worker' as const, started: iso(60), ended: iso(50), tokens: { input: 4_000_000 } }] }, { started: iso(20) }] }),
  task('T-802', 'Try 2 handed back', { attempts: 2, runs: [{ started: iso(60), ended: iso(50), agents: [{ kind: 'worker' as const, started: iso(60), ended: iso(50), tokens: { input: 4_000_000 } }] }, { started: iso(20), ended: iso(2), agents: [{ kind: 'worker' as const, started: iso(20), ended: iso(2), tokens: { input: 1_000_000 } }, { id: 'agent-c', kind: 'checker' as const, started: iso(2) }] }], live: { checking: { step: 'checker', at: iso(0) } }, }),
  task('T-803', 'Try 1 running', { runs: [{ started: iso(10) }] }),
  task('T-804', 'At the usual', { runs: [{ started: iso(40), ended: iso(3), agents: [{ kind: 'worker' as const, started: iso(40), ended: iso(3), tokens: { input: 4_000_000 } }] }], live: { checking: { step: 'testing', at: iso(0) } }, }),
  task('T-805', 'At half the usual', { runs: [{ started: iso(40), ended: iso(3), agents: [{ kind: 'worker' as const, started: iso(40), ended: iso(3), tokens: { input: 2_000_000 } }] }], live: { checking: { step: 'testing', at: iso(0) } }, }),
  task('T-806', 'Past twice the usual', { runs: [{ started: iso(40), ended: iso(3), agents: [{ kind: 'worker' as const, started: iso(40), ended: iso(3), tokens: { input: 9_000_000 } }] }], live: { checking: { step: 'testing', at: iso(0) } }, }),
]
/** What each T-757 lane's second line must show (the bar's cells: full, empty). */
const T757_WANT = (bar: string) => {
  const cells = bar.replace(/[▕▏]/g, '')
  return { full: [...cells].filter(c => c === '█').length, empty: [...cells].filter(c => c === '░').length }
}
const t757Check = (sub: (id: string) => string, warn: (id: string) => boolean) => {
  const bar = (id: string) => T757_WANT(/▕[█░]+▏/.exec(sub(id))?.[0] ?? '')
  // (a) try 2 running: try 1's 4M with "+ …", the bar full (4M against the usual 4M)
  expect(sub('T-801')).toContain('4M + …')
  expect(bar('T-801').empty).toBe(0)
  expect(bar('T-801').full).toBeGreaterThan(0)
  // (b) handed back: the whole sum, no "+ …"
  expect(sub('T-802')).toContain('5M')
  expect(sub('T-802')).not.toContain('+ …')
  expect(sub('T-802')).not.toContain('⚠')
  // (c) try 1 running
  expect(sub('T-803')).toContain('tokens at hand-back')
  // (d) at the usual: full; at half: half
  expect(bar('T-804').empty).toBe(0)
  const half = bar('T-805')
  expect(Math.abs(half.full - half.empty)).toBeLessThanOrEqual(1)
  expect(warn('T-804')).toBe(false)
  // (e) past twice the usual: the warning color and ⚠
  expect(sub('T-806')).toContain('9M ⚠')
  expect(warn('T-806')).toBe(true)
}

test('T-760: the agent stations end in ✧ (accent color), each name still starts over its mark, and the legend says what ✧ means', () => {
  expect(LIVE_AGENT_MARK).toBe('✧')
  expect(textWidth(LIVE_AGENT_MARK)).toBe(1)
  expect(LIVE_LEGEND).toBe('✧ = an agent works here (needs an agent slot)')
  expect(LIVE_TONE.mark).toBe(LIVE_TONE.heading)
  for (const checker of [true, false])
    for (const width of [100, 80, 60, 50, 40, 32]) {
      const lanes = liveLanes(view(checker), T0)
      const l = liveLayout(lanes, liveStations(checker), width)
      const segs = liveLabelSegs(l)
      const line = liveLabelLine(l)
      expect(segText(segs)).toBe(line)
      expect(line.includes('·')).toBe(false)
      // only the ✧ marks are in the 'mark' tone; one after work, one after check when the checker is on
      expect(segs.filter(s => s.tone === 'mark').map(s => s.text)).toEqual(checker ? ['✧', '✧'] : ['✧'])
      expect(segs.every(s => s.tone === (s.text === '✧' ? 'mark' : 'dim'))).toBe(true)
      if (width === 100) expect([line.includes('work✧'), line.includes('check✧')]).toEqual([true, checker])
      // each station name starts over its dot on the lane line
      const [first] = laneLines(lanes[0]!, l, { nowMs: T0, frame: 0 })
      const track = segText(first!)
      const dots = [...track].flatMap((c, i) => ('●◉◎○'.includes(c) ? [i] : []))
      const starts = [...line].flatMap((c, i, all) => (c !== ' ' && (i === 0 || all[i - 1] === ' ') ? [i] : []))
      expect([width, starts]).toEqual([width, dots])
    }
})

test('T-757: lanes show the whole task\'s tokens, the bar full at the usual per task, the warning past twice it (core)', () => {
  const lanes = liveLanes({ tasks: T757 as never[], checker: true }, T0)
  const lane = (id: string) => lanes.find(x => x.id === id)!
  expect([lane('T-801').tokens, lane('T-801').more, lane('T-802').tokens, lane('T-802').more, lane('T-803').tokens]).toEqual([4_000_000, true, 5_000_000, undefined, undefined])
  expect(lane('T-801').usual).toBe(4_000_000)
  const l = liveLayout(lanes, liveStations(true), 80)
  const second = (id: string) => laneLines(lane(id), l, { nowMs: T0, frame: 0 })[1]
  t757Check(id => segText(second(id)), id => second(id).some(s => s.tone === 'warning'))
  expect(liveLegend(lanes, 200)).toEqual([`${LIVE_LEGEND}   bar: tokens of the task so far, full = usual per task (4M)`])
  // narrow: on more lines, none wider
  for (const x of liveLegend(lanes, 30)) expect(textWidth(x)).toBeLessThanOrEqual(30)
})

test('T-757: the terminal and VS Code Live tabs show the whole task\'s tokens on the new scale, and the bar legend', async ($, on) => {
  seedBoard(on, { view: liveView(T757) })
  on('ui.toast', () => ({ value: undefined }))
  const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'terminal' })
  await t.press({ key: 'tab-live' })
  const lines = await liveLines(t)
  const drawn = await t.drawn()
  const nodeOf = (n: unknown, text: string): unknown => {
    const x = n as Node
    if (!x || typeof x !== 'object') return undefined
    if (x.type === 'Text' && textOf(x) === text) return x
    for (const c of x.children ?? []) { const hit = nodeOf(c, text); if (hit) return hit }
    return undefined
  }
  const subs: Record<string, string> = {}
  const warns: Record<string, boolean> = {}
  for (const x of T757.slice(1)) {
    subs[x.id] = lines[lines.findIndex(l => l.includes(` ${x.id} `)) + 1] ?? ''
    const n = nodeOf(drawn, subs[x.id]!)
    expect(n === undefined).toBe(false)
    warns[x.id] = JSON.stringify(n).includes(C_WARNING)
  }
  t757Check(id => subs[id]!, id => warns[id]!)
  expect(lines.some(x => x.includes('bar: tokens of the task so far, full = usual per task (4M)'))).toBe(true)
  await t.press({ key: 'tab-tasks' })
  await t.unmount()

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  // each lane's bar Svg comes after its track Svg (alt "T-801 at …")
  const bars: Record<string, { alt: string; source: string }> = {}
  let owner = ''
  for (const s of await ui.findAll({ type: 'Svg' })) {
    const alt = String(s.props.alt ?? '')
    const m = /^(T-\d+) at /.exec(alt)
    if (m) owner = m[1]!
    else if (alt.startsWith('▕') && owner) bars[owner] = { alt, source: String(s.props.source ?? '') }
  }
  for (const x of T757.slice(1)) bars[x.id] ??= { alt: '', source: '' }
  const sub = async (id: string) => `${bars[id]!.alt} ${(await ui.find({ key: `live-sub:${id}` }))?.text ?? ''}`
  const vs: Record<string, string> = {}
  for (const x of T757.slice(1)) vs[x.id] = await sub(x.id)
  t757Check(id => vs[id]!, id => bars[id]!.source.includes('#d29922'))
  expect((await ui.find({ key: 'live-legend' }))?.text).toBe(`${LIVE_LEGEND}   ${liveBarLegend(4_000_000)}`)
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

test('T-690: the tab row has a Live tab with key l, and the views hint says "l t s c"', () => {
  expect(LIVE_TABS.map(t => t.key)).toEqual(['l', 't', 's', 'c'])
  expect(tabRow(LIVE_TABS.map(t => ({ key: t.key, label: t.label })), 80).labels).toEqual(['[l]: Live', '[t]: Tasks', '[s]: Scouts', '[c]: Settings'])
  const narrow = tabRow(LIVE_TABS.map(t => ({ key: t.key, label: t.label, count: t.key === 't' ? 20 : t.key === 's' ? 1 : undefined })), 50)
  expect(textWidth(narrow.labels.join(narrow.gap))).toBeLessThanOrEqual(50)
  expect(listKeys().map(h => h.key)).toContain('l t s c')
})

const liveView = (tasks: unknown[], checker = true) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: ['npm test'], driving: true, checker, max_parallel: 3 } })

/** T-786: the tasks that wait for nobody (▍Needs you has its own tests, tests/live-needs.test.tsx). */
const calm = (tasks: { status: string }[]) => tasks.filter(t => !['review', 'waiting', 'failed'].includes(t.status))
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : !n || typeof n !== 'object' ? '' : ((n as Node).children ?? []).map(textOf).join(''))
/** The lines of a drawn page, top to bottom (a row Box is one line; hidden Boxes draw nothing). */
const pageLines = (n: unknown): string[] => {
  const x = n as Node
  if (!x || typeof x !== 'object') return []
  if (x.type === 'Box') {
    if (x.props?.display === 'none') return []
    return x.props?.flexDirection === 'row' ? [textOf(x)] : (x.children ?? []).flatMap(pageLines)
  }
  return [textOf(x)]
}
/** The Live tab's own lines: from its header line on. */
const liveLines = async (ui: { drawn: () => Promise<unknown> }) => {
  const all = pageLines(await ui.drawn())
  const at = all.findIndex(l => l.includes('agents ') && l.includes(' busy'))
  return at < 0 ? [] : all.slice(at)
}

test('T-690: the Live tab draws at a normal and a narrow width with nothing cut, and blinks across two redraws', async ($, on) => {
  const clock = seedBoard(on, { view: liveView(calm(TASKS)) })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [80, 44]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await ui.press({ key: 'tab-live' })
    const lines = await liveLines(ui)
    expect(lines[0]).toBe('⏵ auto merge · agents 2/3 busy')
    // every line fits: nothing is cut or wrapped (the tab row too)
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(bodyColumns)
    expect(textWidth(pageLines(await ui.drawn()).find(l => l.includes('Live'))!)).toBeLessThanOrEqual(bodyColumns)
    // the lane rows, their second rows, today, the legend and the keys
    // (T-747, T-789: under the "TASKS" and "TODAY" headings, indented; T-767: by 1, a running lane starting "▶ ")
    expect(lines[1]).toMatch(/^TASKS ─+$/)
    // T-789: an empty line under each heading, no bar
    expect(lines[2]!.trim()).toBe('')
    expect(lines[lines.findIndex(l => l.startsWith('TODAY ─')) + 1]!.trim()).toBe('')
    expect(lines.some(l => l.includes('▍'))).toBe(false)
    for (const id of ['T-684', 'T-685', 'T-686', 'T-687', 'T-688']) expect(lines.some(l => l.startsWith(`${LIVE_INDENT}▶ ${id} `))).toBe(true)
    expect(lines.filter(l => /^ {3}change try \d\/\d/.test(l)).length).toBe(5)
    // T-758: ▍Today holds only the figures line (no "next up" line, no "today" label)
    expect(lines[lines.findIndex(l => l.startsWith('TODAY ─')) + 2]?.startsWith(`${LIVE_INDENT}✓ 1 merged`)).toBe(true)
    expect(lines.some(l => l.trimStart().startsWith('next up') || l.trimStart().startsWith('today'))).toBe(false)
    // (T-760: a narrow panel wraps the mark's legend line, cut at a space)
    if (bodyColumns === 80) expect(lines).toContain(LIVE_INDENT + LIVE_LEGEND)
    else expect(lines.some(l => l.trimStart().startsWith('✧ = an agent works here'))).toBe(true)
    // T-823: the key line sits right under the lanes, before the BRANCHES heading
    const legendAt = lines.findIndex(l => l.trimStart().startsWith('✧ = an agent works here'))
    const branchesAt = lines.findIndex(l => l.startsWith('BRANCHES ─'))
    expect(legendAt).toBeGreaterThan(lines.findIndex(l => l.startsWith(`${LIVE_INDENT}▶ T-688 `)))
    // T-836: a short divider right above the key line
    expect(lines[legendAt - 1]).toBe(LIVE_INDENT + LIVE_DIVIDER)
    if (branchesAt >= 0) expect(legendAt).toBeLessThan(branchesAt)
    expect(lines.some(l => l.includes('l t s c views'))).toBe(true)
    // T-760: the lane header ends the agent stations in ✧ (over their marks, as liveLabelLine), each ✧ in the heading's color
    const tree = (await ui.drawn()) as Node
    const nodes = (n: unknown): Node[] => (!n || typeof n !== 'object' ? [] : [n as Node, ...((n as Node).children ?? []).flatMap(nodes)])
    const labelLine = lines[3]
    expect(labelLine?.includes(bodyColumns === 80 ? 'work✧' : '✧')).toBe(true)
    expect(labelLine?.includes('·')).toBe(false)
    const labels = nodes(tree).find(n => n.type === 'Text' && textOf(n) === labelLine)
    const head = nodes(tree).find(n => n.type === 'Text' && textOf(n).startsWith('TASKS ─'))?.children?.[0] as Node | undefined
    expect(typeof head?.props?.color).toBe('string')
    const pieces = (labels?.children ?? []) as Node[]
    expect(pieces.filter(c => textOf(c) === '✧').map(c => c.props?.color)).toEqual([head?.props?.color, head?.props?.color])
    expect(pieces.filter(c => /[a-z]/.test(textOf(c))).every(c => c.props?.color !== head?.props?.color)).toBe(true)
    // the lanes in the order they entered doing
    const order = (await ui.findAll({ type: 'Button' })).map(b => String(b.key)).filter(k => k.startsWith('live:'))
    expect(order).toEqual(['live:T-684', 'live:T-685', 'live:T-686', 'live:T-688', 'live:T-687'])
    // the current station blinks: ◉ on one redraw, ◎ on the next (the tab redraws itself every LIVE_TICK_MS)
    const marks = async () => ((await ui.find({ key: 'live:T-684' }))?.text.match(/[◉◎]/g) ?? []).join('')
    const one = await marks()
    await clock.advance(LIVE_TICK_MS)
    const two = await marks()
    expect([one, two].sort()).toEqual(['◉', '◎'])
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  }
})

test('T-690, T-758: with no task in doing, the Live tab says so and shows no next up line', async ($, on) => {
  seedBoard(on, { view: liveView(calm(TASKS.filter(t => t.status !== 'doing'))) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  const lines = await liveLines(ui)
  expect(lines[0]).toBe('⏵ auto merge · agents 0/3 busy')
  expect([lines[1]!.replace(/ ─+$/, ''), lines[2]!.trim(), lines[3]]).toEqual(['TASKS', '', LIVE_INDENT + LIVE_EMPTY])
  expect(lines.some(l => l.includes('next up'))).toBe(false)
  expect(lines.includes(LIVE_INDENT + LIVE_DIVIDER)).toBe(false)
  expect(lines[lines.findIndex(l => l.startsWith('TODAY ─')) + 2]?.startsWith(`${LIVE_INDENT}✓ `)).toBe(true)
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test("T-690: Enter on a lane opens that task's page, and Back comes back to the Live tab", async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  await ui.press({ key: 'live:T-685' })
  expect(await liveLines(ui)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /OpenCode: give every board screen buttons/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect((await liveLines(ui)).length).toBeGreaterThan(0)
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test('T-690: w on the Live tab watches the focused lane\'s worker, and says so when none runs here', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  await ui.press({ key: 'tab-live' })
  expect((await ui.find({ key: 'live-watch' }))?.props.hotkey).toBe('w')
  await ui.press({ key: 'live-watch' })
  expect(toasts.join(' ')).toMatch(/[Nn]o worker (is )?running now/)
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

// T-691: the Live tab in VS Code's side panel draws the same lanes and today as the terminal's (all from
// core/live.ts), richer: real lines and dots and a filling token bar (Svg), the lane's id and title a link.
const steadyMark = (s: string) => s.replace(/◎/g, '◉')

for (const checker of [true, false])
  test(`T-691: the VS Code Live tab shows the same lanes and today as the terminal's (checker ${checker ? 'on' : 'off'})`, async ($, on) => {
    seedBoard(on, { view: liveView(TASKS, checker) })
    on('ui.toast', () => ({ value: undefined }))
    // what the terminal's Live tab shows at the same width
    const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
    await t.press({ key: 'tab-live' })
    const lines = await liveLines(t)
    const ids = (await t.findAll({ type: 'Button' })).map(b => String(b.key)).filter(k => k.startsWith('live:')).map(k => k.slice(5))
    const tracks: string[] = []
    for (const id of ids) tracks.push(steadyMark((await t.find({ key: `live:${id}` }))!.text.match(/[●○◉◎][━─●○◉◎]*/)![0]))
    // the terminal's lines under a heading are indented (T-747); VS Code's words are the same
    const today = lines[lines.findIndex(l => l.startsWith('TODAY ─')) + 2]!.slice(LIVE_INDENT.length)
    expect(today.startsWith('✓ ')).toBe(true)
    await t.press({ key: 'tab-tasks' })
    await t.unmount()

    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
    // the Live tab first, before Tasks and Scouts
    expect((await ui.find({ key: 'tabs' }))?.props.text).toContain(`${mdLink('Live', vsHref('tab', 'live'))}  ·  **Tasks 11**  ·  ${mdLink('Scouts 0', vsHref('tab', 'scouts'))}`)
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
    expect((await ui.find({ key: 'tabs' }))?.props.text).toContain('**Live**')
    expect((await ui.find({ key: 'live-head' }))?.text).toBe(lines[0])
    // the lanes: the same tasks in the same order, each a link that opens it
    const links = (await ui.findAll({ type: 'Markdown' })).filter(m => String(m.key).startsWith('live:'))
    expect(links.map(m => String(m.key).slice(5))).toEqual(ids)
    for (const m of links) expect(m.props.pressableLinks).toEqual([vsHref('task', String(m.key).slice(5))])
    expect(String(links[0]!.props.text)).toContain('T-684')
    // each lane's track: an Svg whose alt is the terminal's track; the station names under the dots (no check when the checker is off)
    const svgs = await ui.findAll({ type: 'Svg' })
    for (const [i, id] of ids.entries()) {
      const svg = svgs.find(x => String(x.props.alt).startsWith(`${id} at `))
      expect(svg?.type, id).toBe('Svg')
      expect(String(svg?.props.alt).endsWith(`: ${tracks[i]}`), id).toBe(true)
      const source = String(svg?.props.source)
      // T-760: the agent stations end in ✧, drawn in the accent color
      expect(/>(check|chk|c)<tspan fill="#[0-9a-f]+">✧<\/tspan></.test(source), id).toBe(checker)
      expect(/>(work|wrk|w)<tspan fill="#[0-9a-f]+">✧<\/tspan></.test(source), id).toBe(true)
      expect(source.includes('·'), id).toBe(false)
      // the current station blinks, steady with reduced motion
      expect(source.includes(BLINK_CSS) && source.includes('class="cur"'), id).toBe(true)
    }
    expect(BLINK_CSS).toContain('prefers-reduced-motion: reduce')
    // the queue place and the token bar (over twice the usual: in the warning color, with ⚠)
    expect((await ui.find({ key: 'live-right:T-684' }))?.text).toBe('#2')
    // the token bars are Svg bars (alt: the terminal's bar), one for each lane that knows its tokens
    expect(svgs.filter(x => String(x.props.alt).startsWith('▕')).length).toBe(ids.length - 1)
    expect((await ui.find({ key: 'live-sub:T-685' }))?.text).toContain('3.4M ⚠')
    expect((await ui.find({ key: 'live-sub:T-687' }))?.text).toContain('tokens at hand-back')
    // today: the terminal's words; no next up line (T-758)
    expect(await ui.find({ key: 'live-next' })).toBeUndefined()
    expect((await ui.find({ key: 'live-today-0' }))?.text).toBe(today)
    expect((await ui.find({ key: 'live-legend' }))?.text).toBe(`${LIVE_LEGEND}   ${liveBarLegend(800_000)}`)
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
    await ui.unmount()
  })

test('T-691: a click on a VS Code lane opens that task, and "‹ Live" comes back to the Live tab', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  await ui.press({ key: 'live:T-685', link: { href: vsHref('task', 'T-685') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /OpenCode: give every board screen buttons/ })).toBeDefined()
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('Live')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-head' })).toBeDefined()
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

test('T-691, T-758: with no task in doing, the VS Code Live tab says so and shows only the today figures under Today', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS.filter(t => t.status !== 'doing')) })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect((await ui.find({ key: 'live-head' }))?.text).toBe('⏵ auto merge · agents 0/3 busy')
  expect((await ui.find({ key: 'live-empty' }))?.text).toBe(LIVE_EMPTY)
  expect(await ui.find({ key: 'live-legend' })).toBeUndefined()
  expect(await ui.find({ key: 'live-divider' })).toBeUndefined()
  expect(await ui.find({ key: 'live-next' })).toBeUndefined()
  expect((await ui.find({ key: 'live-today-0' }))?.text).toMatch(/^✓ \d+ merged/)
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

// T-715: the terminal and VS Code Live tabs draw the same trains (core's trainRows) for the same board, and a train opens its task.
for (const bodyColumns of [100, 40])
  test(`T-715: the terminal and VS Code Live tabs hang the same trains under the lanes, nothing wider than the panel (${bodyColumns} columns)`, async ($, on) => {
    seedBoard(on, { view: liveView(TRAINS) })
    on('ui.toast', () => ({ value: undefined }))
    const lanes = liveLanes(trainView, T0)
    const t = liveTrains(trainView, T0, lanes)
    const want = lanes.flatMap(l => trainRows(t.lanes[l.id] ?? [], liveInner(bodyColumns)))
    expect(want.filter(r => r.id).map(r => r.id)).toEqual(['T-713', 'T-714', 'T-717', 'T-716'])
    const term = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await term.press({ key: 'tab-live' })
    const lines = await liveLines(term)
    for (const l of lines) expect([l, textWidth(l) <= bodyColumns]).toEqual([l, true])
    // the trains right under T-712's two lane lines, in the same order and words
    const at = lines.findIndex(l => l.startsWith(`${LIVE_INDENT}▶ T-712 `))
    expect(lines.slice(at + 2, at + 2 + want.length)).toEqual(want.map(r => LIVE_INDENT + segText(r.segs)))
    const keys = (await term.findAll({ type: 'Button' })).map(b => String(b.key)).filter(k => k.startsWith('live'))
    expect(keys.filter(k => k.startsWith('live-train:'))).toEqual(['live-train:T-713', 'live-train:T-714', 'live-train:T-717', 'live-train:T-716'])
    // no next up line (T-758)
    expect(lines.some(l => l.includes('next up'))).toBe(false)
    await term.press({ key: 'tab-tasks' })
    await term.unmount()

    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
    const links = (await ui.findAll({ type: 'Markdown' })).filter(m => String(m.key).startsWith('live-train:'))
    expect(links.map(m => String(m.key).slice('live-train:'.length))).toEqual(['T-713', 'T-714', 'T-717', 'T-716'])
    for (const r of want.filter(x => x.id)) {
      const link = links.find(m => String(m.key) === `live-train:${r.id}`)!
      expect(link.props.pressableLinks).toEqual([vsHref('task', r.id!)])
      // the same id and title as the terminal's row, then its "waits" and "+ also"
      const name = r.segs.filter(s => s.tone === 'wait').map(s => s.text.trim()).join(' ')
      expect(String(link.props.text)).toBe(mdLink(name, vsHref('task', r.id!)))
      const note = r.segs.slice(1).filter(s => s.tone === 'dim').map(s => s.text.trim()).filter(Boolean).join('  ')
      expect((await ui.find({ key: `live-train-note:${r.id}` }))?.text ?? '').toBe(note)
    }
    expect(await ui.find({ key: 'live-next' })).toBeUndefined()
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
    await ui.unmount()
  })

// T-767: a running lane starts "▶ ", its mark, id and title bold in the accent color; a waiting train's row is all dim.
for (const surface of ['terminal', 'desktop', 'mobile'] as const)
  test(`T-767: on the ${surface} Live tab a running lane is "▶ " with its id and title bold in the accent color, and a waiting train is dim`, async ($, on) => {
    seedBoard(on, { view: liveView(TRAINS) })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface })
    await ui.press({ key: 'tab-live' })
    const tree = (await ui.drawn()) as Node
    const nodes = (n: unknown): Node[] => (!n || typeof n !== 'object' ? [] : [n as Node, ...((n as Node).children ?? []).flatMap(nodes)])
    const all = nodes(tree)
    const pieces = (key: string) => (all.find(n => (n as { key?: unknown }).key === key || n.props?.key === key)?.children ?? []).flatMap(nodes).filter(n => n.type === 'Text')
    // the lane: the 1-space indent, then "▶ ", the id and the title in one bold accent color
    const lane = pieces('live:T-712')
    expect(textOf(lane[0])).toBe(LIVE_INDENT)
    expect(LIVE_INDENT).toBe(' ')
    const run = lane.slice(1, 4)
    expect(run.map(textOf).map(s => s.trim())).toEqual(['▶', 'T-712', textOf(run[2]).trim()])
    expect(textOf(run[2])).toContain('Scout')
    const accent = run[0]?.props?.color
    expect(typeof accent).toBe('string')
    // T-777: only "▶ " and the id are bold accent; the title is normal text (not bold, not accent)
    expect(run.slice(0, 2).map(n => [n.props?.color, n.props?.bold])).toEqual([[accent, true], [accent, true]])
    expect(run[2]?.props?.color).not.toBe(accent)
    expect(!!run[2]?.props?.bold).toBe(false)
    // a train: every piece dim (the label line's names' color), none bold
    const label = all.find(n => n.type === 'Text' && textOf(n).includes('work'))
    const dim = (label?.children as Node[] | undefined)?.find(c => /[a-z]/.test(textOf(c)))?.props?.color
    expect(typeof dim).toBe('string')
    expect(dim).not.toBe(accent)
    const train = pieces('live-train:T-713').filter(n => textOf(n).trim())
    expect(train.map(textOf).join('')).toContain('└─◇ T-713')
    // T-819: the id is in the accent color (as a running lane's); the rest of the row stays dim and not bold
    const idAt = train.findIndex(n => textOf(n).trim() === 'T-713')
    expect(idAt).toBeGreaterThan(-1)
    expect(train[idAt]?.props?.color).toBe(accent)
    const rest = train.filter((_, i) => i !== idAt)
    expect(rest.map(n => [textOf(n), n.props?.color, !!n.props?.bold])).toEqual(rest.map(n => [textOf(n), dim, false]))
    expect(LIVE_TONE.topic).not.toBe(LIVE_TONE.id)
    expect(LIVE_TONE.topic).not.toBe('success')
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  })

test('T-767: in VS Code a running lane starts with "▶" in the accent color and its link is bold; a waiting train\'s link is dim', async ($, on) => {
  seedBoard(on, { view: liveView(TRAINS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect((await ui.find({ key: 'live-run-mark:T-712' }))?.text).toBe('▶ T-712')
  const lane = await ui.find({ key: 'live:T-712' })
  expect(String(lane?.props.text).startsWith('[')).toBe(true)
  expect(String(lane?.props.text)).not.toContain('**')
  expect(lane?.props.dimColor).toBeUndefined()
  expect((await ui.find({ key: 'live-train:T-713' }))?.props.dimColor).toBe(true)
  // T-819: the waiting train's id is its own accent-colored text
  const trainId = await ui.find({ key: 'live-train-id:T-713' })
  expect(trainId?.text).toBe('T-713')
  const texts = await ui.findAll({ type: 'Text' })
  const idText = texts.find(t => (t.children ?? []).join('') === 'T-713')
  const markText = texts.find(t => (t.children ?? []).join('') === '▶ T-712')
  expect(typeof markText?.props.color).toBe('string')
  expect([idText?.props.color, idText?.props.bold]).toEqual([markText?.props.color, true])
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

test('T-715: Enter on a train (terminal) or a click on it (VS Code) opens that task, and Back returns to the Live tab', async ($, on) => {
  seedBoard(on, { view: liveView(TRAINS) })
  const term = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  await term.press({ key: 'tab-live' })
  await term.press({ key: 'live-train:T-714' })
  expect(await liveLines(term)).toEqual([])
  expect(await term.find({ type: 'Text', text: /Help: \/symcc-help shows all/ })).toBeDefined()
  await term.press({ key: 'back' })
  expect((await liveLines(term)).length).toBeGreaterThan(0)
  await term.press({ key: 'tab-tasks' })
  await term.unmount()

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  await ui.press({ key: 'live-train:T-716', link: { href: vsHref('task', 'T-716') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Live deps drawn as trains/ })).toBeDefined()
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('Live')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-head' })).toBeDefined()
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

// T-770: while scouts run, the Live tab's mode line ends in a small scout mark ("⌕ gaps-bot 4m"); a queued one isn't
// as running scouts in the view (T-808); a click on the mark opens the Scouts tab.
const RUNS = [{ name: 'board-review', since: T0 - 60_000 }, { name: 'gaps-bot', since: T0 - 4 * 60_000 }]
/** T-808: the running scouts as the view holds them (the header works the runs out from these) */
const asScouts = (runs: readonly { name: string; since: number }[]) => runs.map(r => ({ name: r.name, running: true, started: true, last_run: new Date(r.since).toISOString() }))
test('T-770: liveScoutMark shows the names and times, then "N scouts", then "N", then nothing as the room shrinks', () => {
  expect(liveScoutMark(undefined, T0)).toBe(null)
  expect(liveScoutMark([], T0)).toBe(null)
  expect(liveScoutMark([RUNS[1]!], T0)).toEqual({ gap: ' · ', mark: '⌕', text: ' gaps-bot 4m' })
  expect(liveScoutMark(RUNS, T0)?.text).toBe(' gaps-bot 4m, board-review 1m')
  expect(liveScoutMark(RUNS, T0, 20)?.text).toBe(' 2 scouts')
  expect(liveScoutMark([RUNS[1]!], T0, 12)?.text).toBe(' 1 scout')
  expect(liveScoutMark(RUNS, T0, 6)?.text).toBe(' 2')
  expect(liveScoutMark(RUNS, T0, 4)).toBe(null)
  const head = (runs: typeof RUNS, w: number) => segText(liveHeaderSegs({ ...view(true), scouts: asScouts(runs) }, liveLanes(view(true), T0), T0, w))
  expect(head([], 80)).toBe('⏵ auto merge · agents 2/3 busy')
  expect(head(RUNS, 80)).toBe('⏵ auto merge · agents 2/3 busy · ⌕ gaps-bot 4m, board-review 1m')
  expect(head(RUNS, 44)).toBe('⏵ auto merge · agents 2/3 busy · ⌕ 2 scouts')
  for (const w of [80, 40, 30, 26]) expect(textWidth(head(RUNS, w))).toBeLessThanOrEqual(Math.max(w, textWidth(head([], w))))
  expect(liveHeaderSegs({ ...view(true), scouts: asScouts(RUNS) }, [], T0).map(s => s.tone)).toEqual(['text', 'text', 'scouts', 'dim'])
})

const scoutView = (runs: unknown[]) => ({ ...liveView(calm(TASKS)), value: { ...liveView(calm(TASKS)).value, ...(runs.length ? { scouts: asScouts(runs as typeof RUNS) } : {}) } })
for (const [runs, w, want] of [
  [[], 80, '⏵ auto merge · agents 2/3 busy'],
  [[RUNS[1]], 80, '⏵ auto merge · agents 2/3 busy · ⌕ gaps-bot 4m'],
  [RUNS, 80, '⏵ auto merge · agents 2/3 busy · ⌕ gaps-bot 4m, board-review 1m'],
  [RUNS, 44, '⏵ auto merge · agents 2/3 busy · ⌕ 2 scouts'],
] as const)
  test(`T-770: the terminal and VS Code Live tabs' mode line at ${w} columns with ${runs.length} scout(s) running`, async ($, on) => {
    seedBoard(on, { view: scoutView([...runs]) })
    on('ui.toast', () => ({ value: undefined }))
    const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'terminal' })
    await t.press({ key: 'tab-live' })
    const lines = await liveLines(t)
    expect(lines[0]).toBe(want)
    expect(textWidth(lines[0]!)).toBeLessThanOrEqual(w)
    expect(lines[1]).toMatch(/^TASKS ─+$/)
    const mark = await t.find({ key: 'live-scouts' })
    expect(mark?.type).toBe(runs.length ? 'Button' : undefined)
    if (runs.length) {
      await t.press({ key: 'live-scouts' })
      expect(await t.find({ key: 'live-head' })).toBeUndefined()
      expect((await t.find({ key: 'tab-scouts' }))?.text).toContain('Scouts')
      expect(await t.find({ key: 'live-scouts' })).toBeUndefined()
    }
    await t.press({ key: 'tab-tasks' })
    await t.unmount()

    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'vscode' })
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
    // (the names are a markdown link: its words only)
    expect((await ui.find({ key: 'live-head' }))?.text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')).toBe(want)
    const link = await ui.find({ key: 'live-scouts' })
    expect(link?.props.pressableLinks).toEqual(runs.length ? [vsHref('tab', 'scouts')] : undefined)
    if (runs.length) {
      await ui.press({ key: 'live-scouts', link: { href: vsHref('tab', 'scouts') } })
      expect((await ui.find({ key: 'tabs' }))?.props.text).toContain('**Scouts')
    }
    await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
    await ui.unmount()
  })

test('T-808: scoutsRunning works out the scout runs going now from the scouts, oldest first', () => {
  const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
  const scouts = [
    { name: 'board-review', last_run: at(1), running: true, started: true },
    { name: 'gaps-bot', last_run: at(4), running: true, started: true },
    { name: 'queued', last_run: at(90), running: true },
    { name: 'idle', last_run: at(9), running: false },
    { name: 'never', last_run: null, running: true },
  ]
  const runs = scoutsRunning(scouts)
  expect(runs.map(r => r.name)).toEqual(['gaps-bot', 'board-review'])
  expect(runs[0]?.since).toBe(Date.parse(scouts[1]!.last_run!))
  expect(scoutsRunning(undefined)).toEqual([])
})

test('T-808: publish marks a scout started only when its agent runs; a queued one (running, not started yet) is left out of the live list', async () => {
  S.root = '/repo'
  const g = fakeHost()
  const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
  scoutState.set('gaps-bot', { name: 'gaps-bot', every_minutes: 0, last_run: at(4), running: true })
  scoutState.set('queued', { name: 'queued', every_minutes: 0, last_run: at(90), running: true })
  scoutRuns.set('agent-g', 'gaps-bot')
  try {
    await publish(g.host, emptyBoard())
    const scouts = (g.panel.view() as PaneView).scouts
    expect(scoutsRunning(scouts).map(r => r.name)).toEqual(['gaps-bot'])
  } finally {
    scoutRuns.clear()
    scoutState.clear()
  }
})
