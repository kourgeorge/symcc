// T-769: the Live tab's ▍Today in 3 lines: today's figures; the medians per merged task, the agent work time and the
// cost (only when known); a stacked bar of who spent the tokens with their shares, and the tokens per hour.
// core/live.ts works it out (todayMore, todayMoreLines, liveTodayLines), app/lead.ts reads the lead's, scouts' and cost
// figures (readTodayTeam), and the terminal and VS Code Live tabs draw it (OpenCode's: hooks/opencode/tests).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_INDENT, LIVE_TONE, liveTodayLines, segText, squeezeHours, todayBar, todayMore, todayMoreLines, type LiveSeg, type TodayTeam } from '../hooks/core/live'
import { textWidth } from '../hooks/core/stats'
import { dayOf, localOffset } from '../hooks/core/days'
import { publish, readTodayTeam, resetTodayTeam, todayTeam } from '../hooks/app/lead'
import { S } from '../hooks/app/state'
import { viewTask } from '../hooks/core/board-parts'
import { emptyBoard } from '../hooks/core/board-file'
import { scoutRunsFile } from '../hooks/core/scouts'
import { vsHref } from '../hooks/claude/ui/vscode'
import { fakeHost, memoryFs } from './fake-host'
import { inToday, todayAt } from './day-clock'
import { PANE, T0, seedBoard } from './board-fixture'
import { TODAY_BAR_START, TODAY_LINE_2, todayTasks, todayTeamOf } from './live-today-fixture'

// T0 is 12:00 UTC: every time of the fixture is within today (UTC)
const TASKS = todayTasks(T0)
const TEAM: TodayTeam = todayTeamOf(T0, 0, { 11: 1_000_000 })
const texts = (xs: LiveSeg[][]) => xs.map(segText)

test('T-769: todayMore: the medians per merged task, the agent work time, who spent the tokens and the tokens per hour', () => {
  const m = todayMore(TASKS as never[], TEAM, T0, 0)
  expect(m.perTask).toEqual({ tokens: 2_000_000, workMs: 10 * 60_000, mergeMs: 30 * 60_000 })
  // the tries' 45m plus the scouts' 30m
  expect(m.workMs).toBe(75 * 60_000)
  expect(m.usd).toBe(12.4)
  // the workers' part is the tries' tokens without the checkers'
  expect(m.who).toEqual([{ who: 'workers', tokens: 5_700_000 }, { who: 'checkers', tokens: 300_000 }, { who: 'scouts', tokens: 3_000_000 }, { who: 'lead', tokens: 1_000_000 }])
  // each try's tokens at its end hour, plus the lead's and scouts' hours: 08 to now (12)
  expect([m.firstHour, m.hours]).toEqual([8, [2_000_000, 0, 1_000_000, 4_000_000, 0]])
  // figures of another day are not shown; no team: no cost, no lead or scouts (no guessing)
  const old = todayMore(TASKS as never[], { ...TEAM, day: '2001-01-01' }, T0, 0)
  expect([old.usd, old.who.map(w => w.who)]).toEqual([undefined, ['workers', 'checkers']])
  expect(todayMore(TASKS as never[], undefined, T0, 0).usd).toBe(undefined)
})

test('T-769: ▍Today in 4 lines at a wide panel: the figures, the per-task medians with work time and cost, the stacked bar with shares and the hour sparkline', () => {
  const lines = liveTodayLines({ tasks: TASKS as never[], today_team: TEAM }, T0, 140, 0)
  expect(texts(lines)).toEqual([
    '✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ 6M tokens',
    '⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work · ≈ $12',
    '████████▓▒▒▒▒▒░░ workers 57% · checkers 3% · scouts 30% · lead 10%',
    '08 ▄ ▂█  12   busiest 11:00 · 4M tokens   first try 67%   ⌀ 1.3 tries',
  ])
  // the bar's parts and the shares in their board colors
  const bar = lines[2]!.filter(s => /^[█▓▒░]+$/.test(s.text))
  expect(bar.map(s => [s.text[0], LIVE_TONE[s.tone]])).toEqual([['█', 'ide'], ['▓', 'autoAccept'], ['▒', 'suggestion'], ['░', 'success']])
  expect(lines[2]!.find(s => s.text === 'checkers 3%')?.tone).toBe('checkers')
  // the hour labels dim
  expect(lines[3]!.filter(s => s.text.trim() === '08' || s.text.trim() === '12').map(s => s.tone)).toEqual(['dim', 'dim'])
  // line 3 has no sparkline
  expect(/[▁▂▃▄▅▆▇]/.test(segText(lines[2]!))).toBe(false)
  // no cost known: none shown
  const free = liveTodayLines({ tasks: TASKS as never[], today_team: { ...TEAM, usd: undefined } }, T0, 140, 0)
  expect(segText(free[1]!)).toBe('⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work')
  // a part with few tokens still gets a cell
  expect(segText(todayBar([{ who: 'workers', tokens: 999 }, { who: 'lead', tokens: 1 }]))).toBe(`${'█'.repeat(15)}░`)
})

test('T-781: on a narrower panel line 4 drops its figures from the end (send-backs, tries, first try, busiest), then squeezes the sparkline; the labels stay; never wider', () => {
  const m = todayMore(TASKS as never[], TEAM, T0, 0)
  const order = ['⌀ 1.3 tries', 'first try', 'busiest']
  let gone = 0
  for (let w = 140; w >= 8; w--) {
    const [two = [], three = [], four = []] = todayMoreLines(m, w)
    for (const l of [two, three, four]) expect([w, textWidth(segText(l)) <= w]).toEqual([w, true])
    const s4 = segText(four)
    // both hour labels and a sparkline bar are always there
    expect([w, /^08 [▁▂▃▄▅▆▇█ ]+ 12/.test(s4)]).toEqual([w, true])
    expect([w, /[▁▂▃▄▅▆▇]/.test(segText(three))]).toEqual([w, false])
    expect([w, /^[█▓▒░]+/.test(segText(three))]).toEqual([w, true])
    // what is shown is a run from the start: once a figure is gone, so are the ones after it
    const shown = [...order].reverse().map(k => s4.includes(k))
    const n = shown.lastIndexOf(false) + 1
    expect([w, shown.slice(n).every(Boolean)]).toEqual([w, true])
    expect([w, n >= gone]).toEqual([w, true])
    gone = n
  }
  expect(gone).toBe(3)
  // 40 and 50 columns: the figures are cut from the end
  expect(segText(todayMoreLines(m, 50)[2]!)).toBe('08 ▄ ▂█  12   busiest 11:00 · 4M tokens')
  expect(segText(todayMoreLines(m, 40)[2]!)).toBe('08 ▄ ▂█  12   busiest 11:00 · 4M tokens')
  expect(segText(todayMoreLines(m, 30)[2]!)).toBe('08 ▄ ▂█  12')
  // a long day is squeezed: neighbouring hours merged
  expect(squeezeHours([1, 2, 3, 4, 5, 6], 3)).toEqual([3, 7, 11])
  expect(squeezeHours([1, 2], 5)).toEqual([1, 2])
  const long = { ...m, hours: Array.from({ length: 20 }, (_, i) => i + 1), firstHour: 0 }
  expect(segText(todayMoreLines(long, 14)[2]!)).toBe('00 ▁▃▄▆▇█▇ 19')
  // all of ▍Today fits a tiny panel too
  for (const w of [30, 12, 4]) for (const l of liveTodayLines({ tasks: TASKS as never[], today_team: TEAM }, T0, w, 0)) expect([w, textWidth(segText(l)) <= w]).toEqual([w, true])
})

test('T-781: line 1 counts every send-back today, line 4 only the checker\'s; an empty day shows no line 4', () => {
  const at = new Date(T0 - 60_000).toISOString()
  const h = (kind: string, text: string) => ({ at, kind, text })
  const t = { id: 'T-1', status: 'todo', history: [h('checker-problems', 'try 1: checker found problems: x'), h('checker-problems', 'try 2: checker found problems: y'), h('failed', 'try 3: did it → tests failed: z')], runs: [] }
  const lines = texts(liveTodayLines({ tasks: [t] as never[], today_team: undefined }, T0, 140, 0))
  expect(lines[0]).toContain('↺ 3 sent back')
  expect(lines.at(-1)).toBe('⌕ 2 sent back by the checker')
  expect(texts(liveTodayLines({ tasks: [], today_team: undefined }, T0, 140, 0)).length).toBe(1)
})

test('T-781: a done task keeps its tests-failed and checker send-backs on the slim board view (OpenCode)', () => {
  const at = new Date(T0 - 60_000).toISOString()
  const h = (kind: string, text: string) => ({ at, kind, text })
  const t = { id: 'T-1', status: 'done' as const, history: [h('failed', 'try 1: did it → tests failed: z'), h('checker-problems', 'try 2: checker found problems: y'), h('failed', 'try 3: did it → the worker made no change'), h('merged', 'try 4: did it → merged')], runs: [] }
  const top = (x: unknown) => texts(liveTodayLines({ tasks: [x] as never[], today_team: undefined }, T0, 140, 0))[0]
  expect(top(t)).toContain('↺ 2 sent back')
  expect(top(viewTask(t))).toContain('↺ 2 sent back')
})

test('T-769: line 3 keeps the parts that fit its own width, whatever line 2 had to drop', () => {
  const M = 60_000
  const example = { perTask: { tokens: 2_800_000, workMs: 9 * M, mergeMs: 23 * M }, workMs: (13 * 60 + 6) * M, usd: 64, who: [{ who: 'workers' as const, tokens: 84 }, { who: 'checkers' as const, tokens: 8 }, { who: 'scouts' as const, tokens: 5 }, { who: 'lead' as const, tokens: 3 }], hours: [1, 2, 3, 5, 7, 6, 5, 3, 5, 7, 8, 6, 3], firstHour: 8 }
  for (let w = 64; w <= 68; w++) {
    const three = segText(todayMoreLines(example, w)[1] ?? [])
    expect([w, three.includes('workers 84% · checkers 8% · scouts 5% · lead 3%'), textWidth(three) <= w]).toEqual([w, true, true])
  }
  const solo = { ...example, who: [{ who: 'workers' as const, tokens: 10 }], hours: [10] }
  expect(todayMoreLines(solo, 40).map(segText).slice(1)).toEqual(['████████████████ workers 100%', '08 █ 08   busiest 08:00 · 10 tokens'])
})

// T-792: the host for readTodayTeam at `now`: a scout run and a lead answer inside today (placed between local midnight
// and now, so they never land on yesterday just after midnight), one of each 3 days ago, and a session cost
function todayTeamHost(now: number) {
  const started = inToday(now, 0.2)
  const ended = inToday(now, 0.6)
  const files = new Map([[`/repo/${scoutRunsFile('bugs', 'symcc')}`, JSON.stringify({ runs: [{ started: new Date(started).toISOString(), ended: new Date(ended).toISOString(), outcome: 'found', findings: 1, tokens: { input: 400_000 } }, { started: null, ended: new Date(now - 3 * 86_400_000).toISOString(), outcome: 'found', findings: 1, tokens: { input: 9 } }] })]])
  const g = fakeHost({
    fs: memoryFs(files),
    lead: { send: async () => undefined, usage: async () => ({ lead: [{ id: 'a', atMs: inToday(now, 0.9), tokens: { input: 70_000 } }, { id: 'b', atMs: now - 3 * 86_400_000, tokens: { input: 5 } }] }) },
    session: { id: async () => 'me', repo: async () => null, root: async () => '/', usage: async () => ({ cost: { usd: 3.5 } }) },
  })
  return { g, scoutMs: ended - started }
}

test('T-769: readTodayTeam reads the lead\'s tokens today, the scouts\' runs of today and the session\'s cost; publish puts them in the view', async () => {
  resetTodayTeam()
  S.root = '/repo'
  // T-792: a clock pinned to today's noon, not the real one (which may be just past midnight)
  const now = todayAt(12)
  const { g, scoutMs } = todayTeamHost(now)
  const t = await readTodayTeam(g.host, ['bugs'], now)
  expect([t?.day, t?.lead, t?.scouts, t?.scout_ms, t?.usd]).toEqual([dayOf(now, localOffset(now)), 70_000, 400_000, scoutMs, 3.5])
  expect(t?.hours?.reduce((s, n) => s + n, 0)).toBe(470_000)
  // no lead usage, no scouts, no cost: nothing (no guessing)
  expect(await readTodayTeam(fakeHost().host, [], now)).toBe(undefined)
  // publish puts the last read in the view; the read itself runs in the background
  await todayTeam(g.host, ['bugs'], now).done
  await publish(g.host, emptyBoard())
  expect((g.panel.view() as unknown as { today_team?: TodayTeam }).today_team?.lead).toBe(70_000)
  resetTodayTeam()
})

test('T-792: readTodayTeam finds today\'s lead, scout and hour figures just after midnight (00:05) and just before it (23:55)', async () => {
  S.root = '/repo'
  for (const [h, m] of [[0, 5], [23, 55]] as const) {
    const now = todayAt(h, m)
    const { g, scoutMs } = todayTeamHost(now)
    const t = await readTodayTeam(g.host, ['bugs'], now)
    const at = `${h}:${m}`
    expect([at, t?.day, t?.lead, t?.scouts, t?.scout_ms, t?.usd]).toEqual([at, dayOf(now, localOffset(now)), 70_000, 400_000, scoutMs, 3.5])
    expect([at, t?.hours?.reduce((s, n) => s + n, 0)]).toEqual([at, 470_000])
  }
})

test('T-769: publish itself reads ▍Today\'s team figures on a host with no panel (OpenCode draws ▍Today from the published view)', async () => {
  resetTodayTeam()
  S.root = '/repo'
  // publish reads at the real clock, so the lead's answer goes between local midnight and now (never yesterday)
  const now = Date.now()
  const g = fakeHost({
    features: { panel: false, band: false, leadUsage: true },
    lead: { send: async () => undefined, usage: async () => ({ lead: [{ id: 'a', atMs: inToday(now, 0.5), tokens: { input: 70_000 } }] }) },
    session: { id: async () => 'me', repo: async () => null, root: async () => '/', usage: async () => ({ cost: { usd: 3.5 } }) },
  })
  await publish(g.host, emptyBoard())
  // the read runs in the background and then updates the view
  for (let i = 0; i < 500 && !(g.panel.view() as unknown as { today_team?: TodayTeam }).today_team; i++) await Promise.resolve()
  const t = (g.panel.view() as unknown as { today_team?: TodayTeam }).today_team
  expect([t?.lead, t?.usd]).toEqual([70_000, 3.5])
  resetTodayTeam()
})

const liveView = (tasks: unknown[], team?: TodayTeam) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3, ...(team ? { today_team: team } : {}) } })
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : !n || typeof n !== 'object' ? '' : ((n as Node).children ?? []).map(textOf).join(''))
const pageLines = (n: unknown): string[] => {
  const x = n as Node
  if (!x || typeof x !== 'object') return []
  if (x.type === 'Box') {
    if (x.props?.display === 'none') return []
    return x.props?.flexDirection === 'row' ? [textOf(x)] : (x.children ?? []).flatMap(pageLines)
  }
  return [textOf(x)]
}
// the team for the test machine's own day (the tabs use its time zone)
const localTeam = (): TodayTeam => ({ ...TEAM, day: dayOf(T0, localOffset(T0)), hours: undefined })

test('T-769: the terminal and VS Code Live tabs show ▍Today\'s 4 lines, and a narrow terminal panel drops parts without going past its width', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS, localTeam()) })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [140, 50]) {
    const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await t.press({ key: 'tab-live' })
    const all = pageLines(await t.drawn())
    const at = all.indexOf('TODAY')
    expect(all[at + 1]!.trim()).toBe('')
    const today = all.slice(at + 2, at + 6)
    for (const l of all) expect([bodyColumns, l, textWidth(l) <= bodyColumns]).toEqual([bodyColumns, l, true])
    if (bodyColumns === 140) {
      expect(today[0]).toBe(`${LIVE_INDENT}✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ 6M tokens`)
      expect(today[1]).toBe(`${LIVE_INDENT}⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work · ≈ $12`)
      expect(today[2]).toBe(`${LIVE_INDENT}████████▓▒▒▒▒▒░░ workers 57% · checkers 3% · scouts 30% · lead 10%`)
      expect(today[3]?.startsWith(`${LIVE_INDENT}${' '.repeat(0)}`)).toBe(true)
      expect(/^\s*\d\d [▁▂▃▄▅▆▇█ ]+ \d\d {3}busiest .* tokens {3}first try 67%/.test(today[3] ?? '')).toBe(true)
    } else {
      // narrow: no cost, the bar kept
      expect(all.some(l => l.includes('≈ $'))).toBe(false)
      expect(all.some(l => l.startsWith(`${LIVE_INDENT}████████▓▒▒▒▒▒░░`))).toBe(true)
      expect(/^\s*\d\d [▁▂▃▄▅▆▇█ ]+ \d\d/.test(today[3] ?? '')).toBe(true)
      expect(today[3]?.includes('⌕')).toBe(false)
    }
    await t.press({ key: 'tab-tasks' })
    await t.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 140 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect((await ui.find({ key: 'live-today-0' }))?.text).toBe('✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ 6M tokens')
  expect((await ui.find({ key: 'live-today-1' }))?.text).toBe('⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work · ≈ $12')
  expect((await ui.find({ key: 'live-today-2' }))?.text).toBe('████████▓▒▒▒▒▒░░ workers 57% · checkers 3% · scouts 30% · lead 10%')
  expect((await ui.find({ key: 'live-today-3' }))?.text.endsWith('first try 67%   ⌀ 1.3 tries')).toBe(true)
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})
