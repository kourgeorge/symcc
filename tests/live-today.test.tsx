// T-769: the Live tab's ▍Today in 3 lines: today's figures; the medians per merged task, the agent work time and the
// cost (only when known); a stacked bar of who spent the tokens with their shares, and the tokens per hour.
// core/live.ts works it out (todayMore, todayMoreLines, liveTodayLines), app/lead.ts reads the lead's, scouts' and cost
// figures (readTodayTeam), and the terminal and VS Code Live tabs draw it (OpenCode's: hooks/opencode/tests).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { LIVE_INDENT, LIVE_TONE, liveTodayLines, segText, todayBar, todayMore, todayMoreLines, type LiveSeg, type TodayTeam } from '../hooks/core/live'
import { textWidth } from '../hooks/core/stats'
import { dayOf, localOffset } from '../hooks/core/days'
import { publish, readTodayTeam, resetTodayTeam, todayTeam } from '../hooks/app/lead'
import { S } from '../hooks/app/state'
import { emptyBoard } from '../hooks/core/board-file'
import { scoutRunsFile } from '../hooks/core/scouts'
import { vsHref } from '../hooks/claude/ui/vscode'
import { fakeHost, memoryFs } from './fake-host'
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

test('T-769: ▍Today in 3 lines at a wide panel: the figures, the per-task medians with work time and cost, the stacked bar with shares and the hour sparkline', () => {
  const lines = liveTodayLines({ tasks: TASKS as never[], today_team: TEAM }, T0, 140, 0)
  expect(texts(lines)).toEqual([
    '✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ 6M tokens',
    '⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work · ≈ $12',
    '████████▓▒▒▒▒▒░░ workers 57% · checkers 3% · scouts 30% · lead 10%   08 ▄ ▂█  12   busiest 11:00 · 4M',
  ])
  // the bar's parts and the shares in their board colors
  const bar = lines[2]!.filter(s => /^[█▓▒░]+$/.test(s.text))
  expect(bar.map(s => [s.text[0], LIVE_TONE[s.tone]])).toEqual([['█', 'ide'], ['▓', 'autoAccept'], ['▒', 'suggestion'], ['░', 'success']])
  expect(lines[2]!.find(s => s.text === 'checkers 3%')?.tone).toBe('checkers')
  // the hour labels dim
  expect(lines[2]!.filter(s => s.text.trim() === '08' || s.text.trim() === '12').map(s => s.tone)).toEqual(['dim', 'dim'])
  // no cost known: none shown
  const free = liveTodayLines({ tasks: TASKS as never[], today_team: { ...TEAM, usd: undefined } }, T0, 140, 0)
  expect(segText(free[1]!)).toBe('⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work')
  // a part with few tokens still gets a cell
  expect(segText(todayBar([{ who: 'workers', tokens: 999 }, { who: 'lead', tokens: 1 }]))).toBe(`${'█'.repeat(15)}░`)
})

test('T-769: on a narrower panel ▍Today drops parts from the ends in order (cost, hour labels, sparkline, shares\' words; the bar stays), never wider', () => {
  const m = todayMore(TASKS as never[], TEAM, T0, 0)
  const has = (w: number) => {
    const [two = [], three = []] = todayMoreLines(m, w)
    for (const l of [two, three]) expect([w, textWidth(segText(l)) <= w]).toEqual([w, true])
    const s3 = segText(three)
    return { cost: segText(two).includes('≈ $'), labels: s3.includes('08 '), spark: s3.includes('▂█'), words: s3.includes('workers'), bar: /^[█▓▒░]+/.test(s3) }
  }
  const order = ['cost', 'labels', 'spark', 'words'] as const
  let gone = 0
  for (let w = 140; w >= 6; w--) {
    const h = has(w)
    expect([w, h.bar]).toEqual([w, true])
    // what is shown is always a run from the start of the order: once a part is gone, so are the ones before it
    const shown = order.map(k => h[k])
    const n = shown.lastIndexOf(false) + 1
    expect([w, shown.slice(n).every(Boolean)]).toEqual([w, true])
    expect([w, n >= gone]).toEqual([w, true])
    gone = n
  }
  expect(gone).toBe(4)
  // all of ▍Today fits a tiny panel too
  for (const w of [30, 12, 4]) for (const l of liveTodayLines({ tasks: TASKS as never[], today_team: TEAM }, T0, w, 0)) expect([w, textWidth(segText(l)) <= w]).toEqual([w, true])
})

test('T-769: line 3 keeps the parts that fit its own width, whatever line 2 had to drop', () => {
  const M = 60_000
  const example = { perTask: { tokens: 2_800_000, workMs: 9 * M, mergeMs: 23 * M }, workMs: (13 * 60 + 6) * M, usd: 64, who: [{ who: 'workers' as const, tokens: 84 }, { who: 'checkers' as const, tokens: 8 }, { who: 'scouts' as const, tokens: 5 }, { who: 'lead' as const, tokens: 3 }], hours: [1, 2, 3, 5, 7, 6, 5, 3, 5, 7, 8, 6, 3], firstHour: 8 }
  for (let w = 64; w <= 68; w++) {
    const three = segText(todayMoreLines(example, w)[1] ?? [])
    expect([w, three.includes('workers 84% · checkers 8% · scouts 5% · lead 3%'), textWidth(three) <= w]).toEqual([w, true, true])
  }
  const solo = { ...example, who: [{ who: 'workers' as const, tokens: 10 }], hours: [10] }
  expect(segText(todayMoreLines(solo, 40)[1] ?? [])).toBe('████████████████ workers 100%   08 █ 08')
})

test('T-769: readTodayTeam reads the lead\'s tokens today, the scouts\' runs of today and the session\'s cost; publish puts them in the view', async () => {
  resetTodayTeam()
  S.root = '/repo'
  const now = Date.now()
  const off = localOffset(now)
  const files = new Map([[`/repo/${scoutRunsFile('bugs', 'symcc')}`, JSON.stringify({ runs: [{ started: new Date(now - 20 * 60_000).toISOString(), ended: new Date(now - 10 * 60_000).toISOString(), outcome: 'found', findings: 1, tokens: { input: 400_000 } }, { started: null, ended: new Date(now - 3 * 86_400_000).toISOString(), outcome: 'found', findings: 1, tokens: { input: 9 } }] })]])
  const g = fakeHost({
    fs: memoryFs(files),
    lead: { send: async () => undefined, usage: async () => ({ lead: [{ id: 'a', atMs: now - 60_000, tokens: { input: 70_000 } }, { id: 'b', atMs: now - 3 * 86_400_000, tokens: { input: 5 } }] }) },
    session: { id: async () => 'me', repo: async () => null, root: async () => '/', usage: async () => ({ cost: { usd: 3.5 } }) },
  })
  const t = await readTodayTeam(g.host, ['bugs'], now)
  expect([t?.day, t?.lead, t?.scouts, t?.scout_ms, t?.usd]).toEqual([dayOf(now, off), 70_000, 400_000, 10 * 60_000, 3.5])
  expect(t?.hours?.reduce((s, n) => s + n, 0)).toBe(470_000)
  // no lead usage, no scouts, no cost: nothing (no guessing)
  expect(await readTodayTeam(fakeHost().host, [], now)).toBe(undefined)
  // publish puts the last read in the view; the read itself runs in the background
  await todayTeam(g.host, ['bugs'], now).done
  await publish(g.host, emptyBoard())
  expect((g.panel.view() as unknown as { today_team?: TodayTeam }).today_team?.lead).toBe(70_000)
  resetTodayTeam()
})

test('T-769: publish itself reads ▍Today\'s team figures on a host with no panel (OpenCode draws ▍Today from the published view)', async () => {
  resetTodayTeam()
  S.root = '/repo'
  const now = Date.now()
  const g = fakeHost({
    features: { panel: false, band: false, leadUsage: true },
    lead: { send: async () => undefined, usage: async () => ({ lead: [{ id: 'a', atMs: now - 60_000, tokens: { input: 70_000 } }] }) },
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

test('T-769: the terminal and VS Code Live tabs show ▍Today\'s 3 lines, and a narrow terminal panel drops parts without going past its width', async ($, on) => {
  seedBoard(on, { view: liveView(TASKS, localTeam()) })
  on('ui.toast', () => ({ value: undefined }))
  for (const bodyColumns of [140, 50]) {
    const t = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await t.press({ key: 'tab-live' })
    const all = pageLines(await t.drawn())
    const at = all.indexOf('▍Today')
    const today = all.slice(at + 1, at + 4)
    for (const l of all) expect([bodyColumns, l, textWidth(l) <= bodyColumns]).toEqual([bodyColumns, l, true])
    if (bodyColumns === 140) {
      expect(today[0]).toBe(`${LIVE_INDENT}✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ 6M tokens`)
      expect(today[1]).toBe(`${LIVE_INDENT}⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work · ≈ $12`)
      expect(today[2]?.startsWith(`${LIVE_INDENT}████████▓▒▒▒▒▒░░ workers 57% · checkers 3% · scouts 30% · lead 10%   `)).toBe(true)
      expect(/[▁▂▃▄▅▆▇█]/.test(today[2]!.split('lead 10%')[1] ?? '')).toBe(true)
    } else {
      // narrow: no cost, the bar kept
      expect(all.some(l => l.includes('≈ $'))).toBe(false)
      expect(all.some(l => l.startsWith(`${LIVE_INDENT}████████▓▒▒▒▒▒░░`))).toBe(true)
    }
    await t.press({ key: 'tab-tasks' })
    await t.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 140 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect((await ui.find({ key: 'live-today-0' }))?.text).toBe('✓ 3 merged   ↺ 0 sent back   ✗ 0 failed   Σ 6M tokens')
  expect((await ui.find({ key: 'live-today-1' }))?.text).toBe('⌀ per task 2M · 10m work · 30m start-to-merge   ⏱ 1h 15m agent work · ≈ $12')
  expect((await ui.find({ key: 'live-today-2' }))?.text.startsWith('████████▓▒▒▒▒▒░░ workers 57% · checkers 3% · scouts 30% · lead 10%')).toBe(true)
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})
