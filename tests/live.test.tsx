// T-690: the Live tab: one lane per task in doing (core/live.ts works out the stations, the order, next up and today's
// numbers; claude/ui/live.tsx draws them on the terminal panel).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { liveLanes, liveTaskLanes, liveLayout, laneLines, liveLabelLine, liveLabelSegs, LIVE_AGENT_MARK, LIVE_TONE, liveStations, liveTrains, trainRows, type LiveTrain, liveToday, todayLines, segText, liveBlink, liveHeader, liveHeaderSegs, liveScoutMark, scoutsRunning, scoutNext, tabRow, LIVE_TABS, LIVE_LEGEND, LIVE_INDENT, liveInner, liveLegend, LANE_WARN_TIMES, laneTimes, liveTodayLines, pastDays, pastLines } from '../hooks/core/live'
import { PAST_WEEK, PAST_YESTERDAY, pastTasks } from './live-past-fixture'
import { textWidth } from '../hooks/core/width'
import { FINISH_STALE_MS } from '../hooks/core/lead'
import { listKeys } from '../hooks/board'
import { viewTask } from '../hooks/core/board-parts'
import { LIVE_TICK_MS } from '../hooks/claude/ui/live'
import { BLINK_CSS } from '../hooks/claude/ui/vscode-live'
import { mdLink, vsHref } from '../hooks/claude/ui/vscode'
import { PANE, T0, seedBoard } from './board-fixture'
import { tabBar, wantTabs } from './vscode-tabs'
import { publish } from '../hooks/app/lead'
import { S, scoutRuns, scoutState, type PaneView } from '../hooks/app/state'
import { emptyBoard } from '../hooks/core/board-file'
import { fakeHost } from './fake-host'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })

/** Four tasks in doing, one at each place: a worker running (T-687), a checker (T-686), the tests (T-685), the merge queue (T-684). */
const TASKS = [
  task('T-687', 'Organizational memory search', { runs: [{ started: iso(4) }] }),
  task('T-684', '/symcc-doctor checks the hooks', { attempts: 2, runs: [{ started: iso(60), ended: iso(50), agents: [{ kind: 'worker' as const, started: iso(60), ended: iso(50), tokens: { input: 1_100_000 } }] }, { started: iso(30), ended: iso(10), agents: [{ kind: 'worker' as const, started: iso(30), ended: iso(10), tokens: { input: 1_100_000 } }] }], live: { checking: { step: 'queue', at: iso(0), place: 2 } }, history: [{ kind: 'checker-problems', at: iso(40), text: 'try 1: checker: problems' }, { kind: 'stage', at: iso(5), text: 'try 2: waits in the merge queue (place 2)', try: 2, step: 'queue' }] }),
  task('T-686', 'Scout page: drop the first line', { runs: [{ started: iso(20), ended: iso(2), agents: [{ kind: 'worker' as const, started: iso(20), ended: iso(2), tokens: { input: 540_000 } }, { id: 'agent-c', kind: 'checker' as const, started: iso(2) }] }], live: { checking: { step: 'checker', at: iso(0) } }, history: [{ kind: 'stage', at: iso(2), text: 'try 1: prep started', try: 1, step: 'prep' }] }),
  task('T-685', 'OpenCode: give every board screen buttons', { runs: [{ started: iso(25), ended: iso(9), agents: [{ kind: 'worker' as const, started: iso(25), ended: iso(9), tokens: { input: 3_400_000 } }] }], live: { checking: { step: 'testing', at: iso(0) } }, history: [{ kind: 'stage', at: iso(3), text: 'try 1: tests started', try: 1, step: 'tests' }] }),
  task('T-688', 'Handed back, in prep', { runs: [{ started: iso(15), ended: iso(1), agents: [{ kind: 'worker' as const, started: iso(15), ended: iso(1), tokens: { input: 200_000 } }] }], live: { checking: { step: 'prep', at: iso(0) } }, }),
  task('T-600', 'A merged one', { status: 'done', runs: [{ started: iso(300), ended: iso(200), agents: [{ kind: 'worker' as const, started: iso(300), ended: iso(200), tokens: { input: 800_000 } }] }], history: [{ kind: 'merged', at: iso(30), text: 'try 1 → merged into main' }] }),
  task('T-601', 'A failed one', { status: 'failed', updated_at: iso(20) }),
  task('T-690', 'Live tab part 1', { status: 'todo', priority: 5 }),
  task('T-691', 'Live tab in VS Code', { status: 'todo', after: ['T-690'], priority: 1 }),
  task('T-692', 'Live tab in OpenCode', { status: 'todo', after: ['T-600'], priority: 9 }),
  task('T-693', 'A backlog idea', { status: 'backlog' }),
]
const view = (checker: boolean) => ({ tasks: TASKS as never[], checker, mode: 'auto' as const, max_parallel: 3 })

test('T-690: liveLanes puts each doing task at its station, and leaves check out when the checker is off', () => {
  const at = (checker: boolean) => Object.fromEntries(liveLanes(view(checker), T0).map(l => [l.id, l.station]))
  expect(at(true)).toEqual({ 'T-687': 'work', 'T-688': 'check', 'T-686': 'check', 'T-685': 'tests', 'T-684': 'queue' })
  expect(liveLanes(view(true), T0)[0]!.stations).toEqual(['work', 'check', 'queue', 'tests', 'done'])
  // checker off: no check station; prep counts at work
  const off = liveLanes(view(false), T0)
  expect(off[0]!.stations).toEqual(['work', 'queue', 'tests', 'done'])
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
  expect(testing.map(l => [l.id, l.station])).toEqual([['T-1', 'done']]) // T-846: approved, so past "you"
  const queued = lanes(task('T-1', 'Approved', { status: 'review', ...tried, live: { checking: { step: 'queue', at: sec(5), place: 2 } }, }))
  expect(queued.map(l => [l.station, l.place])).toEqual([['done', 2]])
  // (2) a stale check step, or none: the task only waits for the owner, so its lane (T-846) sits at "you"
  expect(lanes(task('T-1', 'Approved', { status: 'review', ...tried, live: { checking: { step: 'testing', at: new Date(T0 - FINISH_STALE_MS - 1000).toISOString() } }, })).map(l => l.station)).toEqual(['you'])
  expect(lanes(task('T-1', 'Approved', { status: 'review', ...tried })).map(l => l.station)).toEqual(['you'])
  // (3) a waiting task whose merge runs once its files are clear
  const merging = lanes(task('T-2', 'Files cleared', { status: 'waiting', ...tried, live: { checking: { step: 'merging', at: sec(5) } }, }))
  expect(merging.map(l => [l.id, l.station])).toEqual([['T-2', 'done']])
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
  task('T-715', 'Free to start', { status: 'todo', priority: -1 }),
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
  expect(todayLines(d, 80)).toEqual(['✓ 1 merged   ↺ 1 sent back   ✗ 1 failed   Σ ⌀ 7.1M'])
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
  // T-867: the tokens against the median per merged task: from twice it, "(n×median)" in the warning tone
  const over = laneLines(lanes.find(x => x.id === 'T-685')!, l, { nowMs: T0, frame: 0 })[1]
  expect(segText(over)).toContain('⌀ 3.4M (4.3×median)')
  expect(over.filter(s => s.tone === 'warning').map(s => s.text)).toEqual([' (4.3×median)'])
  expect(segText(laneLines(lanes.find(x => x.id === 'T-687')!, l, { nowMs: T0, frame: 0 })[1])).toContain('⌀ at hand-back')
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
  // T-931: merged 2m ago with worker 3M and checker 1M (4M: the median stays 4M), a finished lane
  task('T-807', 'Merged with a checker', { status: 'done', runs: [{ started: iso(40), ended: iso(3), agents: [{ kind: 'worker' as const, started: iso(40), ended: iso(10), tokens: { input: 3_000_000 } }, { kind: 'checker' as const, started: iso(10), ended: iso(3), tokens: { input: 1_000_000 } }] }], history: [{ kind: 'merged', at: iso(2), text: 'try 1 → merged into main' }] }),
]
const t757Check = (sub: (id: string) => string, warn: (id: string) => boolean) => {
  // T-867: no bar any more
  for (const id of ['T-801', 'T-802', 'T-803', 'T-804', 'T-805', 'T-806']) expect([id, /[▕▏█░]/.test(sub(id))]).toEqual([id, false])
  // (a) try 2 running: try 1's 4M with "+ …", 1× the median 4M
  expect(sub('T-801')).toContain('⌀ 4M + … (1×median)')
  // (b) handed back: the whole sum, no "+ …"; worker and checker split (the checker has no tokens yet: left out)
  // T-931: the clock first, then ⌀, then the per-agent tokens in < > (no ⌀ inside)
  expect(sub('T-802')).toMatch(/try 2\/\d+ · ⏱ 28m · ⌀ 5M \(1\.3×median\) · worker 5M +\w+$/)
  expect(sub('T-802')).not.toContain('+ …')
  expect(sub('T-802')).not.toContain('checker')
  // (c) try 1 running
  expect(sub('T-803')).toMatch(/try 1\/\d+ · ⏱ \d+m · ⌀ at hand-back +\w+$/)
  // no breakdown: no < > part
  // (d) at the median and at half
  expect(sub('T-804')).toContain('⌀ 4M (1×median)')
  expect(sub('T-805')).toContain('⌀ 2M (0.5×median)')
  expect(warn('T-804')).toBe(false)
  // (e) past twice the median: the warning tone, no ⚠
  expect(sub('T-806')).toContain('⌀ 9M (2.3×median)')
  expect(sub('T-806')).not.toContain('⚠')
  expect(warn('T-806')).toBe(true)
  // (f) T-931: merged with worker and checker: both in one < >, no ⌀ inside
  expect(sub('T-807')).toMatch(/try 1\/\d+ · ⏱ 37m · ⌀ 4M \(1×median\) · worker 3M · checker 1M +\w+$/)
}

test('T-760: the agent stations end in ✧ (accent color), each name still starts over its mark, and the legend says what ✧ means', () => {
  expect(LIVE_AGENT_MARK).toBe('✧')
  expect(textWidth(LIVE_AGENT_MARK)).toBe(1)
  expect(LIVE_LEGEND).toBe('✧ = an agent works here (needs an agent slot) · ⌀ = tokens')
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

test('T-757, T-867: lanes show the whole task\'s tokens, × the median per task (warning from twice it), its time and who spent them (core)', () => {
  const lanes = liveTaskLanes({ tasks: T757 as never[], checker: true }, T0)
  const lane = (id: string) => lanes.find(x => x.id === id)!
  expect([lane('T-801').tokens, lane('T-801').more, lane('T-802').tokens, lane('T-802').more, lane('T-803').tokens]).toEqual([4_000_000, true, 5_000_000, undefined, undefined])
  expect(lane('T-801').usual).toBe(4_000_000)
  const l = liveLayout(lanes, liveStations(true), 80)
  const second = (id: string) => laneLines(lane(id), l, { nowMs: T0, frame: 0 })[1]
  t757Check(id => segText(second(id)), id => second(id).some(s => s.tone === 'warning'))
  // T-855: the count has the token sign in front
  expect(segText(second('T-801'))).toMatch(/^  try 2\/\d+ · ⏱ \d+m · ⌀ 4M/)
  expect(LANE_WARN_TIMES).toBe(2)
  // T-867: the tone is decided on the number as shown, so 1.96× reads "2" and warns; a tiny task reads "<0.1", never "0"
  expect([laneTimes(1.96), laneTimes(1.94), laneTimes(7.6), laneTimes(1), laneTimes(0.03)]).toEqual([
    { text: '2', warn: true }, { text: '1.9', warn: false }, { text: '7.6', warn: true }, { text: '1', warn: false }, { text: '<0.1', warn: false },
  ])
  // T-867: the key line has no bar text any more
  expect(liveLegend(200)).toEqual([LIVE_LEGEND])
  // narrow: on more lines, none wider
  for (const x of liveLegend(30)) expect(textWidth(x)).toBeLessThanOrEqual(30)
})

/** T-867: a task on try 2 (try 1: 30m, worker 5.4M, checker 1.9M), sent back twice, against a done task of 1M. */
const T867 = [
  task('T-900', 'Done at 1M', { status: 'done', runs: [{ started: iso(300), ended: iso(200), agents: [{ kind: 'worker' as const, started: iso(300), ended: iso(200), tokens: { input: 1_000_000 } }] }], history: [{ kind: 'merged', at: iso(200), text: 'try 1 → merged into main' }] }),
  task('T-901', 'Board times count only real work', { attempts: 2, history: [{ kind: 'checker-problems', at: iso(40), text: 'sent back' }, { kind: 'checker-problems', at: iso(35), text: 'sent back' }], runs: [{ started: iso(60), ended: iso(30), agents: [{ kind: 'worker' as const, started: iso(60), ended: iso(35), tokens: { input: 5_400_000 } }, { kind: 'checker' as const, started: iso(35), ended: iso(30), tokens: { input: 1_900_000 } }] }, { started: iso(11) }] }),
]

test('T-867, T-931: a lane\'s second line has no bar: ⏱, ⌀, ×median, <worker/checker split> and ↺; narrow panels drop the split first, the clock last', () => {
  const lanes = liveLanes({ tasks: T867 as never[], checker: true }, T0)
  const lane = lanes.find(x => x.id === 'T-901')!
  expect([lane.activeMs, lane.workerTokens, lane.checkerTokens]).toEqual([41 * 60_000, 5_400_000, 1_900_000])
  const l = liveLayout(lanes, liveStations(true), 120)
  const at = (width: number) => segText(laneLines(lane, { ...l, width }, { nowMs: T0, frame: 0 })[1])
  // T-1010: the kind at the right end, at the row's right edge, no kind at the start
  expect(at(120)).toMatch(/^  try 2\/\d+ · ⏱ 41m · ⌀ 7\.3M \+ … \(7\.3×median\) · worker 5\.4M · checker 1\.9M · ⌕ × 2 +change$/)
  expect(textWidth(at(120))).toBe(120)
  expect(laneLines(lane, { ...l, width: 120 }, { nowMs: T0, frame: 0 })[1].at(-1)).toEqual({ text: 'change', tone: 'dim' })
  const bare = (width: number) => at(width).replace(/ +change$/, '')
  const full = bare(120)
  // first the split goes, then "(×median)", then ⌀, then ⏱ (never before ⌀); the try stays; the kind goes before any of them
  const wFull = textWidth(full)
  // too narrow for the kind with two spaces before it: the kind is dropped, the meta text stays whole
  expect(at(wFull + 8)).toBe(full + '  change')
  expect(at(wFull + 7)).toBe(full)
  expect(at(wFull)).toBe(full)
  // narrower: the parts go in order (the kind returns at the right when the shorter text leaves room)
  expect(bare(wFull - 1)).toMatch(/^  try 2\/\d+ · ⏱ 41m · ⌀ 7\.3M \+ … \(7\.3×median\) · ⌕ × 2$/)
  const noSplit = textWidth(bare(wFull - 1))
  expect(bare(noSplit - 1)).toMatch(/^  try 2\/\d+ · ⏱ 41m · ⌀ 7\.3M \+ … · ⌕ × 2$/)
  const noMedian = textWidth(bare(noSplit - 1))
  expect(bare(noMedian - 1)).toMatch(/^  try 2\/\d+ · ⏱ 41m · ⌕ × 2$/)
  const noTokens = textWidth(bare(noMedian - 1))
  expect(bare(noTokens - 1)).toMatch(/^  try 2\/\d+ · ⌕ × 2$/)
  // 7.3× the median: the warning tone on "(×median)" only
  expect(laneLines(lane, l, { nowMs: T0, frame: 0 })[1].filter(s => s.tone === 'warning').map(s => s.text)).toEqual([' (7.3×median)'])
})

test('T-757: the terminal and VS Code Live tabs show the whole task\'s tokens × the median, and the key line without the bar', async ($, on) => {
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
  expect(lines.some(x => x.includes('bar:') || x.includes('usual per task'))).toBe(false)
  expect(lines.some(x => x.includes('⌀ = tokens'))).toBe(true)
  expect(lines.filter(x => x.includes('⌀ = tokens')).length).toBe(1)
  await t.press({ key: 'tab-tasks' })
  await t.unmount()

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tab-live' })
  // T-867: no bar Svg; the lane's second line is the terminal's words
  expect((await ui.findAll({ type: 'Svg' })).some(x => /[▕█░]/.test(String(x.props.alt ?? '')))).toBe(false)
  const vs: Record<string, string> = {}
  const vsWarn: Record<string, boolean> = {}
  for (const x of T757.slice(1)) {
    const n = await ui.find({ key: `live-sub:${x.id}` })
    vs[x.id] = n?.text ?? ''
    vsWarn[x.id] = JSON.stringify(n).includes(C_WARNING)
  }
  t757Check(id => vs[id]!, id => vsWarn[id]!)
  expect((await ui.find({ key: 'live-legend' }))?.text).toBe(LIVE_LEGEND)
  await ui.press({ key: 'tab-tasks' })
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
/** The Live tab's own lines: from its first section heading on (T-938: the mode line has no line of its own above it). */
const liveLines = async (ui: { drawn: () => Promise<unknown> }) => {
  const all = pageLines(await ui.drawn())
  if (!all.some(l => l.includes('agents ') && l.includes(' busy'))) return []
  const at = all.findIndex(l => l.startsWith('─── ❯ '))
  return at < 0 ? [] : all.slice(at)
}
/** T-938: ▍Today's first row, "Now:" the mode line (two lines under the TODAY heading: the empty line, then it). */
const nowLine = (lines: readonly string[]) => lines[lines.findIndex(l => l.startsWith('─── ❯ TODAY ─')) + 2]

test('T-690: the Live tab draws at a normal and a narrow width with nothing cut, and blinks across two redraws', async ($, on) => {
  const clock = seedBoard(on, { view: liveView(calm(TASKS)) })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [80, 44]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await ui.press({ key: 'tab-live' })
    const lines = await liveLines(ui)
    // T-938: no mode line above the sections: TASKS comes first, and the mode line is ▍Today's first row, "Now:"
    expect(pageLines(await ui.drawn()).filter(l => l.startsWith('⏵ '))).toEqual([])
    expect(nowLine(lines)).toBe(`${LIVE_INDENT}Now: ⏵ auto merge · agents 2/3 busy`)
    // every line fits: nothing is cut or wrapped (the tab row too)
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(bodyColumns)
    expect(textWidth(pageLines(await ui.drawn()).find(l => l.includes('Live'))!)).toBeLessThanOrEqual(bodyColumns)
    // the lane rows, their second rows, today, the legend and the keys
    // (T-747, T-789: under the "TASKS" and "TODAY" headings, indented; T-767: by 1, a running lane starting "▶ ")
    expect(lines[0]).toMatch(/^─── ❯ TASKS ─+$/)
    // T-915: "─── ❯ TASKS " then the thin rule to the right edge
    expect([textWidth(lines[0]!), lines.find(l => l.startsWith('─── ❯ TODAY '))]).toEqual([bodyColumns, `─── ❯ TODAY ${'─'.repeat(bodyColumns - 12)}`])
    // T-789: an empty line under each heading, no bar; except TASKS when lanes run: its stage titles follow the heading
    // straight away, since they already set it off
    expect(lines[1]!.trim()).not.toBe('')
    expect(lines[1]!.includes('✧')).toBe(true)
    expect(lines[lines.findIndex(l => l.startsWith('─── ❯ TODAY ─')) + 1]!.trim()).toBe('')
    expect(lines.some(l => l.includes('▍'))).toBe(false)
    for (const id of ['T-684', 'T-685', 'T-686', 'T-687', 'T-688']) expect(lines.some(l => l.startsWith(`${LIVE_INDENT}▶ ${id} `))).toBe(true)
    expect(lines.filter(l => /^ {3}try \d\/\d/.test(l)).length).toBe(5)
    // T-758: ▍Today holds the Now row (T-938), then the figures line (no "next up" line, no "today" label)
    expect(lines[lines.findIndex(l => l.startsWith('─── ❯ TODAY ─')) + 3]?.startsWith(`${LIVE_INDENT}✓ 1 merged`)).toBe(true)
    expect(lines.some(l => l.trimStart().startsWith('next up') || l.trimStart().startsWith('today'))).toBe(false)
    // (T-760: a narrow panel wraps the mark's legend line, cut at a space)
    if (bodyColumns === 80) expect(lines).toContain(LIVE_INDENT + LIVE_LEGEND)
    else expect(lines.some(l => l.trimStart().startsWith('✧ = an agent works here'))).toBe(true)
    // T-933: the key line is the very last lines of the page, below the footer's key line (none under the task rows)
    const legendAt = lines.findIndex(l => l.trimStart().startsWith('✧ = an agent works here'))
    const footAt = lines.indexOf('─'.repeat(bodyColumns))
    expect(footAt).toBeGreaterThan(lines.findIndex(l => l.startsWith('─── ❯ ORGANIZATIONAL MEMORY')))
    expect(legendAt).toBeGreaterThan(lines.findIndex(l => l.includes('l t s c views')))
    expect(lines.slice(legendAt)).toEqual(liveLegend(liveInner(bodyColumns)).map(x => LIVE_INDENT + x))
    // T-962: no divider: the legend comes right under the keys line
    expect(lines[legendAt - 1]).toContain('Esc close')
    expect(lines.includes(LIVE_INDENT + '─'.repeat(12))).toBe(false)
    expect(lines.some(l => l.includes('l t s c views'))).toBe(true)
    // T-760: the lane header ends the agent stations in ✧ (over their marks, as liveLabelLine), each ✧ in the heading's color
    const tree = (await ui.drawn()) as Node
    const nodes = (n: unknown): Node[] => (!n || typeof n !== 'object' ? [] : [n as Node, ...((n as Node).children ?? []).flatMap(nodes)])
    const labelLine = lines[1]
    expect(labelLine?.includes(bodyColumns === 80 ? 'work✧' : '✧')).toBe(true)
    expect(labelLine?.includes('·')).toBe(false)
    const labels = nodes(tree).find(n => n.type === 'Text' && textOf(n) === labelLine)
    const head = nodes(tree).find(n => n.type === 'Text' && textOf(n).startsWith('─── ❯ TASKS ─'))?.children?.[0] as Node | undefined
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
  expect(nowLine(lines)).toBe(`${LIVE_INDENT}Now: ⏵ auto merge · agents 0/3 busy`)
  // T-903: why nothing runs: the open tasks that wait, and what each waits for
  expect([lines[0]!.replace(/ ─+$/, ''), lines[1]!.trim(), lines[2]]).toEqual(['─── ❯ TASKS', '', `${LIVE_INDENT}Nothing running · 3 waiting: T-690 ready`])
  expect(lines.some(l => l.includes('next up'))).toBe(false)
  expect(lines.includes(LIVE_INDENT + '─'.repeat(12))).toBe(false)
  expect(lines[lines.findIndex(l => l.startsWith('─── ❯ TODAY ─')) + 3]?.startsWith(`${LIVE_INDENT}✓ `)).toBe(true)
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
    const today = lines[lines.findIndex(l => l.startsWith('─── ❯ TODAY ─')) + 3]!.slice(LIVE_INDENT.length)
    expect(today.startsWith('✓ ')).toBe(true)
    await t.press({ key: 'tab-tasks' })
    await t.unmount()

    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
    // the Live tab first, before Tasks and Scouts
    expect(await tabBar(ui)).toEqual(wantTabs('tasks', { tasks: 11, scouts: 0 }))
    await ui.press({ key: 'tab-live' })
    expect(await tabBar(ui)).toEqual(wantTabs('live', { tasks: 11, scouts: 0 }))
    expect((await ui.find({ key: 'live-head' }))?.text).toBe(nowLine(lines)!.slice(LIVE_INDENT.length + 'Now: '.length))
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
    // the queue place, and the tokens × the median (T-867: no bar Svg)
    expect((await ui.find({ key: 'live-right:T-684' }))?.text).toBe('#2')
    expect(svgs.filter(x => String(x.props.alt).startsWith('▕')).length).toBe(0)
    expect((await ui.find({ key: 'live-sub:T-685' }))?.text).toContain('⌀ 3.4M (4.3×median)')
    expect((await ui.find({ key: 'live-sub:T-687' }))?.text).toContain('⌀ at hand-back')
    // today: the terminal's words; no next up line (T-758)
    expect(await ui.find({ key: 'live-next' })).toBeUndefined()
    expect(today).toMatch(/^✓ \d+ merged/)
    expect((await ui.find({ key: 'live-today-rows-results-value' }))?.text).toMatch(/^✓ \d+ merged · ↺ \d+ sent back · ✗ \d+ failed$/)
    expect((await ui.find({ key: 'live-legend' }))?.text).toBe(LIVE_LEGEND)
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  })

test('T-930, T-933: the legend is the very last lines of the page, below the footer key line; the room left goes above the footer, in the terminal; in VS Code it ends the Tasks section (T-973)', async ($, on) => {
  seedBoard(on, { view: liveView(calm(TASKS)) })
  on('ui.toast', () => ({ value: undefined }))
  type Keyed = Node & { key?: unknown }
  /** A node's children, nested lists flattened. */
  const kidsOf = (n: unknown): Keyed[] => ((n as Node)?.children ?? []).flat(Infinity as 1).filter(c => c && typeof c === 'object') as Keyed[]
  const keyOf = (n: Keyed | undefined) => n?.key ?? n?.props?.key
  const nodes = (n: unknown): Keyed[] => (Array.isArray(n) ? n.flatMap(nodes) : !n || typeof n !== 'object' ? [] : [n as Keyed, ...kidsOf(n).flatMap(nodes)])
  /** The legend's Box, the page Box holding it, and the page's children. */
  const found = (tree: unknown) => {
    const all = nodes(tree)
    const page = all.find(n => kidsOf(n).some(k => keyOf(k) === 'live-key'))!
    const kids = kidsOf(page)
    const at = kids.findIndex(k => keyOf(k) === 'live-key')
    return { page, kids, at, key: kids[at]!, before: kids[at - 1] }
  }
  for (const placement of ['dock', 'inline'] as const) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80, placement, scroll: { offset: 0, bodyRows: 40 } }, surface: 'terminal' })
    await ui.press({ key: 'tab-live' })
    // the page whose children hold the legend's Box: as tall as the docked pane's body (no height inline)
    const { page, kids, at, key, before } = found(await ui.drawn())
    expect(page.props?.minHeight).toBe(placement === 'dock' ? 40 : undefined)
    // the legend's Box is the page's last child, right after the footer's key line
    expect(at).toBe(kids.length - 1)
    expect(textOf(before)).toContain('l t s c views')
    expect(nodes(key).filter(n => n.type === 'Text').map(textOf)).toEqual([LIVE_INDENT + LIVE_LEGEND])
    // the room left goes above the footer: a growing Box right before the footer rule
    const rule = kids.findIndex(k => textOf(k) === '─'.repeat(80))
    expect([keyOf(kids[rule - 1]), kids[rule - 1]?.props?.flexGrow]).toEqual(['live-fill', 1])
    // the drawn page ends in the legend
    const lines = pageLines(await ui.drawn())
    // T-962: the keys line, then the legend right under it (no divider)
    expect([lines.at(-2)?.includes('Esc close'), lines.at(-1)]).toEqual([true, LIVE_INDENT + LIVE_LEGEND])
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  }
  // T-973: in VS Code the legend ends the Tasks section (under the lanes); the footer's Box takes the room left and puts
  // the footer at the page's bottom, as its last child
  const vs = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await vs.press({ key: 'tab-live' })
  const drawnVs = nodes(await vs.drawn())
  const section = drawnVs.find(n => keyOf(n) === 'live-tasks')!
  expect(kidsOf(section).map(keyOf).slice(-2)).toEqual(['live-lanes', 'live-key'])
  expect(nodes(kidsOf(section).at(-1)).filter(n => n.type === 'Text').map(textOf)).toEqual([LIVE_LEGEND])
  const page = drawnVs.find(n => kidsOf(n).some(k => keyOf(k) === 'live-foot'))!
  expect(page.props?.flexGrow).toBe(1)
  const last = kidsOf(page).at(-1)
  expect([keyOf(last), last?.props?.flexGrow, last?.props?.justifyContent]).toEqual(['live-foot', 1, 'flex-end'])
  expect(kidsOf(last).map(keyOf)).toEqual(['live-hint-footer'])
  await vs.press({ key: 'tab-tasks' })
  await vs.unmount()
})

test('T-691: a click on a VS Code lane opens that task, and "‹ Live" comes back to the Live tab', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'vscode' })
  await ui.press({ key: 'tab-live' })
  await ui.press({ key: 'live:T-685', link: { href: vsHref('task', 'T-685') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /OpenCode: give every board screen buttons/ })).toBeDefined()
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('Live')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-head' })).toBeDefined()
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test('T-691, T-758: with no task in doing, the VS Code Live tab says so and shows only the today figures under Today', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS.filter(t => t.status !== 'doing')) })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'tab-live' })
  expect((await ui.find({ key: 'live-head' }))?.text).toBe('⏵ auto merge · agents 0/3 busy')
  expect((await ui.find({ key: 'live-empty' }))?.text).toBe('Nothing running · 4 waiting: T-601 needs you, T-690 ready, T-691 waits for T-690')
  expect(await ui.find({ key: 'live-legend' })).toBeUndefined()
  expect(await ui.find({ key: 'live-divider' })).toBeUndefined()
  expect(await ui.find({ key: 'live-next' })).toBeUndefined()
  expect((await ui.find({ key: 'live-today-rows-results-value' }))?.text).toMatch(/^✓ \d+ merged/)
  await ui.press({ key: 'tab-tasks' })
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
    await ui.press({ key: 'tab-live' })
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
    await ui.press({ key: 'tab-tasks' })
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
  await ui.press({ key: 'tab-live' })
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
  await ui.press({ key: 'tab-tasks' })
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
  await ui.press({ key: 'tab-live' })
  await ui.press({ key: 'live-train:T-716', link: { href: vsHref('task', 'T-716') } })
  expect(await ui.find({ key: 'live-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Live deps drawn as trains/ })).toBeDefined()
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('Live')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-head' })).toBeDefined()
  await ui.press({ key: 'tab-tasks' })
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

// T-847: the mode line also names the next scout due ("⌕ next: gaps-bot in 12m"), after the running ones; paused and on-demand scouts never
const inMin = (m: number) => new Date(T0 + m * 60_000).toISOString()
const NEXT_SCOUTS = [
  { name: 'simplify', every_minutes: 60, next_run: inMin(40) },
  { name: 'gaps-bot', every_minutes: 30, next_run: inMin(12) },
  { name: 'paused-one', every_minutes: 30, paused: true, next_run: inMin(1) },
  { name: 'manual', every_minutes: 0, next_run: inMin(2) },
]
test('T-847: scoutNext picks the soonest timer, never a paused, on-demand or running scout', () => {
  expect(scoutNext(NEXT_SCOUTS)).toEqual({ name: 'gaps-bot', at: T0 + 12 * 60_000 })
  expect(scoutNext([NEXT_SCOUTS[2]!, NEXT_SCOUTS[3]!])).toBe(null)
  expect(scoutNext([{ ...NEXT_SCOUTS[1]!, running: true }])).toBe(null)
  expect(scoutNext(undefined)).toBe(null)
})
test('T-847: liveHeaderSegs shows next alone, running plus next, and drops next first on a narrow width', () => {
  const head = (extra: unknown[], w: number) => segText(liveHeaderSegs({ ...view(true), scouts: [...extra, ...NEXT_SCOUTS] } as never, liveLanes(view(true), T0), T0, w))
  const base = '⏵ auto merge · agents 2/3 busy'
  expect(head([], 80)).toBe(`${base} · ⌕ next: gaps-bot in 12m`)
  expect(head(asScouts([RUNS[0]!]), 80)).toBe(`${base} · ⌕ board-review 1m · next: gaps-bot in 12m`)
  expect(head(asScouts([RUNS[0]!]), 56)).toBe(`${base} · ⌕ board-review 1m`)
  expect(head([], 40)).toBe(base)
  expect(segText(liveHeaderSegs({ ...view(true), scouts: [NEXT_SCOUTS[2]!, NEXT_SCOUTS[3]!] } as never, liveLanes(view(true), T0), T0, 80))).toBe(base)
})

const scoutView = (runs: unknown[], more: unknown[] = []) => ({ ...liveView(calm(TASKS)), value: { ...liveView(calm(TASKS)).value, ...(runs.length || more.length ? { scouts: [...asScouts(runs as typeof RUNS), ...more] } : {}) } })
for (const [runs, w, want, more] of [
  [[], 80, '⏵ auto merge · agents 2/3 busy'],
  [[RUNS[1]], 80, '⏵ auto merge · agents 2/3 busy · ⌕ gaps-bot 4m'],
  [RUNS, 80, '⏵ auto merge · agents 2/3 busy · ⌕ gaps-bot 4m, board-review 1m'],
  [RUNS, 50, '⏵ auto merge · agents 2/3 busy · ⌕ 2 scouts'],
  [RUNS, 44, '⏵ auto merge · agents 2/3 busy · ⌕ 2'],
  [[], 80, '⏵ auto merge · agents 2/3 busy · ⌕ next: gaps-bot in 12m', NEXT_SCOUTS],
  [[RUNS[0]], 100, '⏵ auto merge · agents 2/3 busy · ⌕ board-review 1m · next: gaps-bot in 12m', NEXT_SCOUTS],
  [[RUNS[0]], 56, '⏵ auto merge · agents 2/3 busy · ⌕ board-review 1m', NEXT_SCOUTS],
  [[], 40, '⏵ auto merge · agents 2/3 busy', NEXT_SCOUTS],
] as [unknown[], number, string, unknown[]?][])
  test(`T-770, T-938: the terminal and VS Code Live tabs' Now row (▍Today's first) at ${w} columns with ${runs.length} scout(s) running${more ? ' and a next scout' : ''}`, async ($, on) => {
    seedBoard(on, { view: scoutView([...runs], [...(more ?? [])]) })
    on('ui.toast', () => ({ value: undefined }))
    const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'terminal' })
    await t.press({ key: 'tab-live' })
    const lines = await liveLines(t)
    // T-938: no line of its own above the sections: the Now row, right under the TODAY heading and its empty line,
    // drops the scout parts from its end when narrow (the mode stays)
    expect(lines[0]).toMatch(/^─── ❯ TASKS ─+$/)
    expect(pageLines(await t.drawn()).filter(l => l.includes(' busy'))).toEqual([`${LIVE_INDENT}Now: ${want}`])
    expect(nowLine(lines)).toBe(`${LIVE_INDENT}Now: ${want}`)
    expect(textWidth(nowLine(lines)!)).toBeLessThanOrEqual(w)
    const mark = await t.find({ key: 'live-scouts' })
    const marked = want.includes('⌕')
    expect(mark?.type).toBe(marked ? 'Button' : undefined)
    if (marked) {
      await t.press({ key: 'live-scouts' })
      expect(await t.find({ key: 'live-head' })).toBeUndefined()
      expect((await t.find({ key: 'tab-scouts' }))?.text).toContain('Scouts')
      expect(await t.find({ key: 'live-scouts' })).toBeUndefined()
    }
    await t.press({ key: 'tab-tasks' })
    await t.unmount()

    // T-973: in VS Code the mode line is the Status section's Mode row; the panel wraps, so it keeps every part at any width
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: w }, surface: 'vscode' })
    await ui.press({ key: 'tab-live' })
    const wide = segText(liveHeaderSegs(scoutView([...runs], [...(more ?? [])]).value as never, liveLanes(scoutView([...runs]).value as never, T0), T0, Infinity))
    expect((await ui.find({ key: 'live-head' }))?.text).toBe(wide)
    expect((await ui.find({ key: 'live-status-rows-mode-label' }))?.text).toBe('Mode')
    expect(await ui.find({ key: 'live-status' }).then(b => !!b && JSON.stringify(b).includes('live-head'))).toBe(true)
    // the scout names a quiet plain Button that opens the Scouts tab
    const link = await ui.find({ key: 'live-scouts' })
    expect(link ? [link.type, link.props.plain, link.props.dimColor] : undefined).toEqual(wide.includes('⌕') ? ['Button', true, true] : undefined)
    if (wide.includes('⌕')) {
      await ui.press({ key: 'live-scouts' })
      expect((await tabBar(ui)).text).toContain('**Scouts')
    }
    await ui.press({ key: 'tab-tasks' })
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

// T-889: under ▍Today, a dim "yesterday" line and a "last 7 days" line (today left out)
test('T-889: Today ends with dim yesterday and last 7 days lines, without today\'s work; ⏱ goes first, then ⌀, when narrow', () => {
  const now = Date.now()
  const tasks = pastTasks(now) as never[]
  expect(pastDays(tasks, now, 1)).toEqual({ merged: 1, tokens: 3_000_000, workMs: 140 * 60_000 })
  expect(pastDays(tasks, now, 7)).toEqual({ merged: 2, tokens: 5_000_000, workMs: 200 * 60_000 })
  const lines = liveTodayLines({ tasks, today_team: undefined }, now, 140)
  const texts = lines.map(l => segText(l))
  // the section's last two lines, dim; today's T-3 (5M) and the 9-day-old T-4 are in neither
  expect(texts.slice(-2)).toEqual([PAST_YESTERDAY, PAST_WEEK])
  expect(lines.slice(-2).every(l => l.every(s => s.tone === 'dim'))).toBe(true)
  expect(texts[0]!.startsWith('✓ 1 merged')).toBe(true)
  // narrow: ⏱ goes first, then ⌀
  const y = pastDays(tasks, now, 1)
  const w = pastDays(tasks, now, 7)
  expect(pastLines(y, w, 30).map(l => segText(l))).toEqual(['yesterday:   ✓ 1 merged · ⌀ 3M', 'last 7 days: ✓ 2 merged · ⌀ 5M'])
  expect(pastLines(y, w, 25).map(l => segText(l))).toEqual(['yesterday:   ✓ 1 merged', 'last 7 days: ✓ 2 merged'])
  for (const n of [20, 8, 1]) for (const l of pastLines(y, w, n)) expect([n, textWidth(segText(l)) <= n]).toEqual([n, true])
  // a part that is 0 is left out; a line with nothing is left out
  const none = { merged: 0, tokens: 0, workMs: 0 }
  expect(pastLines({ merged: 0, tokens: 4_000_000, workMs: 0 }, none, 80).map(l => segText(l))).toEqual(['yesterday:   ⌀ 4M'])
  expect(pastLines(none, none, 80)).toEqual([])
  // whole hours from 10h on
  expect(segText(pastLines({ merged: 77, tokens: 355e6, workMs: 34 * 3_600_000 }, none, 80)[0]!)).toBe('yesterday:   ✓ 77 merged · ⌀ 355M · ⏱ 34h')
})
