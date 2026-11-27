// T-769: the Live tab's ▍Today in 3 lines: today's figures; the medians per merged task, the agent work time and the
// cost (only when known); a stacked bar of who spent the tokens with their shares, and the tokens per hour.
// core/live.ts works it out (todayMore, todayMoreLines, liveTodayLines), app/lead.ts reads the lead's, scouts' and cost
// figures (readTodayTeam), and the terminal and VS Code Live tabs draw it (OpenCode's: hooks/opencode/tests).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_INDENT, LIVE_TONE, liveTodayLines, segText, squeezeHours, todayBar, todayMore, todayMoreLines, type LiveSeg, type TodayTeam } from '../hooks/core/live'
import { textWidth } from '../hooks/core/width'
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
import { TODAY_BAR_START, TODAY_LINE_3, todayTasks, todayTeamOf } from './live-today-fixture'
import { oldHistoryFacts } from '../hooks/core/old-data'

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
  expect(m.who).toEqual([{ who: 'lead', tokens: 1_000_000 }, { who: 'workers', tokens: 5_700_000 }, { who: 'checkers', tokens: 300_000 }, { who: 'scouts', tokens: 3_000_000 }])
  // each try's tokens at its end hour, plus the lead's and scouts' hours: 00 to now (12)
  expect(m.hours).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 2_000_000, 0, 1_000_000, 4_000_000, 0])
  // figures of another day are not shown; no team: no cost, no lead or scouts (no guessing)
  const old = todayMore(TASKS as never[], { ...TEAM, day: '2001-01-01' }, T0, 0)
  expect([old.usd, old.who.map(w => w.who)]).toEqual([undefined, ['workers', 'checkers']])
  expect(todayMore(TASKS as never[], undefined, T0, 0).usd).toBe(undefined)
})

test('T-769: ▍Today in 4 lines at a wide panel: the figures, the per-task medians with work time and cost, the stacked bar with shares and the hour sparkline', () => {
  const lines = liveTodayLines({ tasks: TASKS as never[], today_team: TEAM }, T0, 140, 0)
  expect(texts(lines)).toEqual([
    '✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ ⌀ 10M',
    '⌀ ████████████████ lead 10% · workers 57% · checkers 3% · scouts 30%',
    TODAY_LINE_3,
    '⏱ 1h 15m agent work · ≈ $12 this session   busiest hour 11:00 · ⌀ 4M   ⌀/h 00▕▁▁▁▁▁▁▁▁▄▁▂█▁···········▏24',
  ])
  // T-809: the bar is not directly above the sparkline; the sparkline and its labels end line 4
  expect(/[▁▂▃▄▅▆▇]/.test(texts(lines)[1]!)).toBe(false)
  expect(/[▁▂▃▄▅▆▇]/.test(texts(lines)[2]!)).toBe(false)
  expect(/ 00▕[▁▂▃▄▅▆▇█]+·{11}▏24$/.test(texts(lines)[3]!)).toBe(true)
  // the bar's parts and the shares in their board colors
  const bar = lines[1]!.filter(s => /^█+$/.test(s.text))
  expect(bar.map(s => [s.text[0], LIVE_TONE[s.tone]])).toEqual([['█', 'success'], ['█', 'ide'], ['█', 'autoAccept'], ['█', 'suggestion']])
  expect(lines[1]!.find(s => s.text === 'checkers 3%')?.tone).toBe('checkers')
  // the hour labels dim
  expect(lines[3]!.filter(s => ['⌀/h 00', '24'].includes(s.text.trim())).map(s => s.tone)).toEqual(['dim', 'dim'])
  // T-817: the current hour's bar (12, blank here: no tokens yet) is in the accent tone, the hours to come are dim dots
  expect(lines[3]!.filter(s => s.tone === 'now' || /^·+▏$/.test(s.text)).map(s => [s.text, s.tone])).toEqual([['▁', 'now'], ['···········▏', 'dim']])
  // no cost known: none shown
  const free = liveTodayLines({ tasks: TASKS as never[], today_team: { ...TEAM, usd: undefined } }, T0, 140, 0)
  expect(segText(free[3]!)).toBe('⏱ 1h 15m agent work   busiest hour 11:00 · ⌀ 4M   ⌀/h 00▕▁▁▁▁▁▁▁▁▄▁▂█▁···········▏24')
  // a part with few tokens still gets a cell
  expect(segText(todayBar([{ who: 'lead', tokens: 1 }, { who: 'workers', tokens: 999 }]))).toBe('█'.repeat(16))
})

test('T-809: on a narrower panel line 4 drops busiest, then the cost, then squeezes the sparkline (labels stay, at the end); line 3 drops from its end; never wider', () => {
  const m = todayMore(TASKS as never[], TEAM, T0, 0)
  for (let w = 140; w >= 8; w--) {
    const [two = [], three = [], four = []] = todayMoreLines(m, w)
    for (const l of [two, three, four]) expect([w, segText(l), textWidth(segText(l)) <= w]).toEqual([w, segText(l), true])
    const s4 = segText(four)
    // both hour labels and a sparkline end the line
    if (w >= 11) expect([w, s4, /⌀(?:\/h)? 00▕[▁▂▃▄▅▆▇█]+·*▏24$/.test(s4)]).toEqual([w, s4, true])
    expect([w, /[▁▂▃▄▅▆▇]/.test(segText(two)) || /[▁▂▃▄▅▆▇]/.test(segText(three))]).toEqual([w, false])
    expect([w, /^⌀ █+|^█+/.test(segText(two))]).toEqual([w, true])
    // busiest goes before the cost
    expect([w, s4.includes('busiest') && !s4.includes('≈ $')]).toEqual([w, false])
  }
  const t = (w: number) => segText(todayMoreLines(m, w)[2]!)
  expect(t(110)).toBe('⏱ 1h 15m agent work · ≈ $12 this session   busiest hour 11:00 · ⌀ 4M   ⌀/h 00▕▁▁▁▁▁▁▁▁▄▁▂█▁···········▏24')
  const full = t(110)
  expect(full).toBe('⏱ 1h 15m agent work · ≈ $12 this session   busiest hour 11:00 · ⌀ 4M   ⌀/h 00▕▁▁▁▁▁▁▁▁▄▁▂█▁···········▏24')
  // T-864: one column less and the busiest hour goes first, then the cost; the ⌀ label stays with the sparkline
  expect(t(textWidth(full) - 1)).toBe(full.replace('   busiest hour 11:00 · ⌀ 4M', ''))
  expect(t(70)).toBe('⏱ 1h 15m agent work   ⌀/h 00▕▁▁▁▁▁▁▁▁▄▁▂█▁···········▏24')
  expect(t(40)).toBe('⏱ 1h 15m agent work   ⌀ 00▕▁▁▄█▁···▏24')
  // the label is never dropped while the sparkline shows, at any width from 60 up
  for (let w = 140; w >= 60; w--) expect([w, /⌀(\/h)? 00▕/.test(t(w))]).toEqual([w, true])
  // the sparkline has borders; a zero past hour is a dim ▁, a future hour a dim ·, an hour with tokens its bar
  const four = todayMoreLines(m, 140)[2]!
  const spark = four.slice(four.findIndex(x => x.text.startsWith('▕')), -1).map((x): [string, string] => [x.text, x.tone])
  expect(spark).toEqual([['▕▁▁▁▁▁▁▁▁', 'dim'], ['▄', 'bar'], ['▁', 'dim'], ['▂█', 'bar'], ['▁', 'now'], ['···········▏', 'dim']])
  expect(segText(todayMoreLines(m, 40)[1]!)).toBe('median ⌀ 2M/task · 10m work')
  // a squeezed day: neighbouring hours merged, `per` hours to a cell (the last cell of the past is the current hour)
  expect(squeezeHours([1, 2, 3, 4, 5, 6], 3)).toEqual([6, 15])
  expect(squeezeHours([1, 2], 5)).toEqual([3])
  // at 07:30 and 23:30 the sparkline spans 00 to 24 whatever the width: dots after the current hour, none at 23
  for (const [h, now] of [[7, todayAt(7, 30)], [23, todayAt(23, 30)]] as const) {
    const day = todayMore(todayTasks(now) as never[], undefined, now, localOffset(now))
    expect(day.hours.length).toBe(h + 1)
    for (const w of [140, 60, 40, 30, 20, 12]) {
      const four = todayMoreLines({ ...day, workMs: 0, usd: undefined }, w).at(-1)!
      const text = segText(four)
      expect([w, textWidth(text) <= w, /(^| )⌀(\/h)? 00▕.+▏24$/.test(text)]).toEqual([w, true, true])
      expect([w, four.filter(x => x.tone === 'now').length]).toEqual([w, 1])
      // dim dots for the hours to come: none at 23:30
      expect([w, four.some(x => x.tone === 'dim' && /^·+▏?$/.test(x.text))]).toEqual([w, h === 7])
    }
    // wide: one cell an hour, 24 cells
    expect(segText(todayMoreLines({ ...day, workMs: 0, usd: undefined }, 140).at(-1)!).split('00').pop()!.length).toBe(24 + 2 + 2)
  }
  // all of ▍Today fits a tiny panel too
  for (const w of [30, 12, 4]) for (const l of liveTodayLines({ tasks: TASKS as never[], today_team: TEAM }, T0, w, 0)) expect([w, textWidth(segText(l)) <= w]).toEqual([w, true])
})

test('T-781: line 1 counts every send-back today, line 3 only the checker\'s; an empty day shows no more lines', () => {
  const at = new Date(T0 - 60_000).toISOString()
  const h = (kind: string, text: string) => ({ at, kind, text, ...oldHistoryFacts({ kind, text }) })
  const t = { id: 'T-1', status: 'todo', history: [h('checker-problems', 'try 1: checker found problems: x'), h('checker-problems', 'try 2: checker found problems: y'), h('failed', 'try 3: did it → tests failed: z')], runs: [] }
  const lines = texts(liveTodayLines({ tasks: [t] as never[], today_team: undefined }, T0, 140, 0))
  expect(lines[0]).toContain('↺ 3 sent back')
  expect(lines.at(-1)).toBe('⌕ 2 sent back by the checker')
  expect(texts(liveTodayLines({ tasks: [], today_team: undefined }, T0, 140, 0)).length).toBe(1)
})

test('T-781: a done task keeps its tests-failed and checker send-backs on the slim board view (OpenCode)', () => {
  const at = new Date(T0 - 60_000).toISOString()
  const h = (kind: string, text: string) => ({ at, kind, text, ...oldHistoryFacts({ kind, text }) })
  const t = { id: 'T-1', status: 'done' as const, history: [h('failed', 'try 1: did it → tests failed: z'), h('checker-problems', 'try 2: checker found problems: y'), h('failed', 'try 3: did it → the worker made no change'), h('merged', 'try 4: did it → merged')], runs: [] }
  const top = (x: unknown) => texts(liveTodayLines({ tasks: [x] as never[], today_team: undefined }, T0, 140, 0))[0]
  expect(top(t)).toContain('↺ 2 sent back')
  expect(top(viewTask(t))).toContain('↺ 2 sent back')
})

test('T-769: line 3 keeps the parts that fit its own width, whatever line 2 had to drop', () => {
  const M = 60_000
  const example = { perTask: { tokens: 2_800_000, workMs: 9 * M, mergeMs: 23 * M }, workMs: (13 * 60 + 6) * M, usd: 64, who: [{ who: 'lead' as const, tokens: 3 }, { who: 'workers' as const, tokens: 84 }, { who: 'checkers' as const, tokens: 8 }, { who: 'scouts' as const, tokens: 5 }], hours: [1, 2, 3, 5, 7, 6, 5, 3, 5, 7, 8, 6, 3], firstHour: 8 }
  for (let w = 66; w <= 70; w++) {
    const three = segText(todayMoreLines(example, w)[0] ?? [])
    expect([w, three.includes('lead 3% · workers 84% · checkers 8% · scouts 5%'), textWidth(three) <= w]).toEqual([w, true, true])
  }
  const solo = { ...example, who: [{ who: 'workers' as const, tokens: 10 }], hours: [10] }
  expect(todayMoreLines(solo, 40).map(segText)).toEqual(['⌀ ████████████████ workers 100%', 'median ⌀ 2.8M/task · 9m work', '⏱ 13h 06m agent work   ⌀ 00▕█·······▏24'])
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

const liveView = (tasks: unknown[], team?: TodayTeam) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3, ...(team ? { today_team: team } : {}) } })
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
  for (const bodyColumns of [140, 80, 70, 60, 50]) {
    const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await t.press({ key: 'tab-live' })
    const all = pageLines(await t.drawn())
    const at = all.findIndex(l => l.startsWith('─── ❯ TODAY ─'))
    expect(all[at + 1]!.trim()).toBe('')
    // T-938: the first row is "Now:" the mode line; the figures follow it
    expect(all[at + 2]!.startsWith(`${LIVE_INDENT}Now: ⏵ `)).toBe(true)
    const today = all.slice(at + 3, at + 7)
    for (const l of all) expect([bodyColumns, l, textWidth(l) <= bodyColumns]).toEqual([bodyColumns, l, true])
    if (bodyColumns === 140) {
      expect(today[0]).toBe(`${LIVE_INDENT}✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ ⌀ 10M`)
      expect(today[1]).toBe(`${LIVE_INDENT}⌀ ████████████████ lead 10% · workers 57% · checkers 3% · scouts 30%`)
      expect(today[2]).toBe(`${LIVE_INDENT}${TODAY_LINE_3}`)
      // (the hours depend on the machine's time zone: only the sparkline's end is compared)
      expect(today[3]!.startsWith(`${LIVE_INDENT}⏱ 1h 15m agent work · ≈ $12 this session   busiest hour `)).toBe(true)
      expect(/ ⌀(?:\/h)? 00▕[▁▂▃▄▅▆▇█]+·*▏24$/.test(today[3]!)).toBe(true)
    } else {
      // narrow (T-864: the owner's 60-80 columns too): the busiest hour goes first, then the cost; the bar kept,
      // and the sparkline always keeps its ⌀ label and borders at the end of line 4
      if (bodyColumns <= 60) expect(all.some(l => l.includes('≈ $'))).toBe(false)
      expect(all.some(l => l.startsWith(`${LIVE_INDENT}⌀ ████████████████`))).toBe(true)
      expect([bodyColumns, today[3], / ⌀(?:\/h)? 00▕[▁▂▃▄▅▆▇█]+·*▏24$/.test(today[3] ?? '')]).toEqual([bodyColumns, today[3], true])
      expect([bodyColumns, today[3]?.includes('busiest')]).toEqual([bodyColumns, false])
    }
    // T-855: no lane, so no key line: the dim note ends ▍Today
    expect(all[at + 7]).toBe(`${LIVE_INDENT}⌀ = tokens`)
    await t.press({ key: 'tab-tasks' })
    await t.unmount()
  }
  // T-973: VS Code shows the same figures as label/value rows (core's liveTodayRows), the labels in one column
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 140 }, surface: 'vscode' })
  await ui.press({ key: 'tab-live' })
  const row = async (k: string) => [(await ui.find({ key: `live-today-rows-${k}-label` }))?.text, (await ui.find({ key: `live-today-rows-${k}-value` }))?.text]
  expect(await row('results')).toEqual(['Results', '✓ 3 merged · ↺ 0 sent back · ✗ 0 failed'])
  expect(await row('tokens')).toEqual(['Tokens', '10M · lead 10% · workers 57% · checkers 3% · scouts 30%'])
  expect(await row('time')).toEqual(['Agent time', '1h 15m · ≈ $12 this session'])
  expect(await row('per-task')).toEqual(['Per task', '2M/task · 10m work · 30m start-to-merge · first try 67% · avg 1.3 tries/task'])
  const [hl, hours] = await row('hours')
  expect([hl, /^00▕[▁▂▃▄▅▆▇█]+·*▏24 {3}busiest \d\d:00 · \S+$/.test(hours ?? '')]).toEqual(['Hours', true])
  // the colors: merged green, sent back amber, failed red; the label column one width for every row
  const results = JSON.stringify(await ui.find({ key: 'live-today-rows-results-value' }))
  for (const c of ['"success"', '"warning"', '"error"']) expect(results).toContain(c)
  const widths = new Set(await Promise.all(['results', 'tokens', 'time', 'per-task', 'hours'].map(async k => (await ui.find({ key: `live-today-rows-${k}-label` }))?.props.width)))
  expect(widths.size).toBe(1)
  // no ⌀ sign under a "Tokens" label, so no "⌀ = tokens" note
  expect(JSON.stringify(await ui.find({ key: 'live-today' }))).not.toContain('= tokens')
  await ui.press({ key: 'tab-tasks' })
  await ui.unmount()
})

test('T-799: Σ is everyone\'s tokens (never below the busiest hour); without the lead and scouts it is the tries only, marked dim', () => {
  const full = liveTodayLines({ tasks: TASKS as never[], today_team: TEAM }, T0, 140, 0)
  const m = todayMore(TASKS as never[], TEAM, T0, 0)
  const all = m.who.reduce((s, x) => s + x.tokens, 0)
  expect(all).toBe(5_700_000 + 300_000 + 3_000_000 + 1_000_000)
  expect(segText(full[0]!)).toContain('Σ ⌀ 10M')
  expect(segText(full[0]!)).not.toContain('tries only')
  expect(all).toBeGreaterThanOrEqual(Math.max(...m.hours))
  const bare = liveTodayLines({ tasks: TASKS as never[], today_team: undefined }, T0, 140, 0)
  expect(segText(bare[0]!)).toBe('✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ ⌀ 6M (tries only)')
  expect(bare[0]!.at(-1)).toEqual({ text: ' (tries only)', tone: 'dim' })
})

test('T-806: the slim view\'s marks carry the reason, so a clash and a failed test are told apart (OpenCode)', () => {
  const at = new Date(T0 - 60_000).toISOString()
  const t = { id: 'T-1', status: 'done' as const, history: [{ at, kind: 'failed', text: 'try 1: x → y', reason: 'tests' }, { at, kind: 'failed', text: 'try 2: x → y', reason: 'clash' }, { at, kind: 'failed', text: 'try 3: x → y', reason: 'nochange' }, { at, kind: 'checker-problems', text: 'try 4: checker found problems: y' }], runs: [] }
  const slim = viewTask(t as never) as unknown as { history_marks: { kind: string; reason?: string }[] }
  expect(slim.history_marks.map(m => [m.kind, m.reason])).toEqual([['failed', 'tests'], ['failed', 'clash'], ['checker-problems', undefined]])
})
