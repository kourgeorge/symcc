// T-727: the Live tab's Branches section: core/live.ts's liveBranches lays it out, app/branches.ts reads the figures
// with git (here a fake git), and the terminal and VS Code Live tabs draw it (OpenCode's: hooks/opencode/tests).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { BRANCH_ROWS_MAX, LIVE_INDENT, liveBranches, liveFinishedLanes, segText } from '../hooks/core/live'
import { textWidth } from '../hooks/core/stats'
import { branchFacts, readBranches, BRANCH_CACHE_MS } from '../hooks/app/branches'
import { publish } from '../hooks/app/lead'
import { S } from '../hooks/app/state'
import { emptyBoard } from '../hooks/core/board-file'
import { branchKey } from '../hooks/claude/ui/live'
import { vsHref } from '../hooks/claude/ui/vscode'
import { done, fakeHost } from './fake-host'
import { PANE, T0, seedBoard } from './board-fixture'
import { BRANCH_LINES_100, branchFactsAt, branchTasks, sha } from './branches-fixture'

const sample = (now = T0) => ({ tasks: branchTasks(now) as never[], branches: branchFactsAt(now) })
/** The section's lines as the Live tab draws them: its heading, then the lines under it indented (T-747). */
const linesOf = (b: NonNullable<ReturnType<typeof liveBranches>>) => [segText(b.head), ...[b.main, ...b.rows.map(r => r.segs)].map(x => LIVE_INDENT + segText(x))]

test('T-727: the Branches section at 100 and 40 columns: main\'s commits, a row per branch where it forked, not started, just merged; nothing wider than the panel', () => {
  const wide = liveBranches(sample(), T0, 100)!
  expect(linesOf(wide)).toEqual(BRANCH_LINES_100)
  expect(wide.rows.map(r => [r.id, r.kind])).toEqual([['T-724', 'merged'], ['T-721', 'branch'], ['T-725', 'branch'], ['T-726', 'new']])
  const narrow = liveBranches(sample(), T0, 40)!
  expect(linesOf(narrow)).toEqual([
    'BRANCHES',
    '  main   ●─●─●─●   c1c1c1c · 2 min ago',
    '         │   │ ╰─◀ T-724  merged 3m ago',
    '         │   ╰───○ T-721  +3 · 1 behind',
    '         ├───────○ T-725  +0 · 4 behind',
    '         ╰───────○ T-726  not started',
  ])
  for (const w of [100, 60, 40, 30, 20, 12])
    for (const l of linesOf(liveBranches(sample(), T0, w)!)) expect(textWidth(l), `${w}: ${l}`).toBeLessThanOrEqual(w)
  // far behind: a warning; the merge shows only for about a minute; no figures: no section
  const late = { ...sample(), branches: { ...branchFactsAt(T0), tasks: { ...branchFactsAt(T0).tasks, 'T-725': { ahead: 2, behind: 9, base: sha('c9') } } } }
  const row = liveBranches(late, T0, 100)!.rows.find(r => r.id === 'T-725')!
  expect(row.segs.find(s => s.text === '9 behind')?.tone).toBe('warning')
  // c9 isn't shown: it hangs at the left edge
  expect(row.col).toBe(0)
  expect(liveBranches(sample(), T0 + 6 * 60_000, 100)!.rows.some(r => r.kind === 'merged')).toBe(true)
  expect(liveBranches(sample(), T0 + 7 * 60_000, 100)!.rows.some(r => r.kind === 'merged')).toBe(false)
  expect(liveBranches({ tasks: sample().tasks }, T0, 100)).toBe(null)
  // many branches: at most BRANCH_ROWS_MAX rows, then "+N more"
  const many = Array.from({ length: 11 }, (_, i) => ({ ...branchTasks(T0)[0]!, id: `T-${800 + i}`, branch: `symcc/T-${800 + i}` }))
  const lots = liveBranches({ tasks: many as never[], branches: { ...branchFactsAt(T0), tasks: Object.fromEntries(many.map(t => [t.id, { ahead: 1, behind: 0, base: sha('c1') }])) } }, T0, 60)!
  expect(lots.rows.filter(r => r.id).length).toBe(BRANCH_ROWS_MAX)
  expect(segText(lots.rows[lots.rows.length - 1]!.segs).trim()).toBe('+3 more')
})

/** A fake git for the sample: main's log, and each branch's counts and fork point; T-725's count fails. */
function fakeGit(calls: string[][], failing = 'symcc/T-725') {
  return async (argv: readonly string[]) => {
    calls.push([...argv])
    const a = argv.slice(1)
    if (a[0] === 'log') return done({ stdout: branchFactsAt(T0).commits.slice(0, 7).map(c => `${c.sha} ${Math.floor(c.at / 1000)}`).join('\n') + '\n' })
    if (a[0] === 'rev-list') {
      if (a[3] === `main...${failing}`) return done({ exitCode: 128, stderr: 'fatal: bad revision' })
      return done({ stdout: a[3] === 'main...symcc/T-721' ? '1\t3\n' : '4\t0\n' })
    }
    if (a[0] === 'merge-base') return done({ stdout: `${a[2] === 'symcc/T-721' ? sha('c2') : sha('c5')}\n` })
    return done()
  }
}

test('T-727: the app reads the branch figures with read-only git, keeps them ~30 s, and a failing git command drops only that row', async () => {
  S.root = '/repo'
  S.gitState = 'ok'
  const calls: string[][] = []
  const f = fakeHost({ run: fakeGit(calls, 'symcc/none') })
  const board = { ...emptyBoard(), tasks: branchTasks(T0) as never[] }
  const facts = await readBranches(f.host, 'main', board, T0)
  expect(facts!.commits.map(c => c.sha)).toEqual(branchFactsAt(T0).commits.slice(0, 7).map(c => c.sha))
  expect(facts!.commits[0]!.at).toBe(Math.floor(branchFactsAt(T0).commits[0]!.at / 1000) * 1000)
  expect(facts!.tasks).toEqual({ 'T-721': { ahead: 3, behind: 1, base: sha('c2') }, 'T-725': { ahead: 0, behind: 4, base: sha('c5') } })
  // only read-only commands, in the project's folder
  for (const c of calls) expect(['log', 'rev-list', 'merge-base']).toContain(c[1])
  expect(calls.some(c => c.join(' ') === 'git rev-list --left-right --count main...symcc/T-721')).toBe(true)

  // a failing count drops only T-725; the section still shows the others
  const g = fakeHost({ run: fakeGit([]) })
  const first = branchFacts(g.host, board, 'main', T0)
  expect(first.facts).toBe(undefined)
  await first.done
  const view = g.panel.view() as unknown as { branches: ReturnType<typeof branchFactsAt> }
  expect(Object.keys(view.branches.tasks)).toEqual(['T-721'])
  const rows = liveBranches({ tasks: branchTasks(T0) as never[], branches: view.branches }, T0, 100)!.rows.map(r => r.id)
  expect(rows).toEqual(['T-724', 'T-721', 'T-726'])
  // kept: no new read within BRANCH_CACHE_MS, and publish puts them in the view at once
  const again = branchFacts(g.host, board, 'main', T0 + 1000)
  expect(again.done).toBe(undefined)
  expect(again.facts?.tasks['T-721']?.ahead).toBe(3)
  expect(branchFacts(g.host, board, 'main', T0 + BRANCH_CACHE_MS + 1).done).toBeDefined()
  // the main line's log failing: no section at all
  const h = fakeHost({ run: async argv => (argv[1] === 'log' ? done({ exitCode: 128 }) : done()) })
  expect(await readBranches(h.host, 'main', board, T0)).toBe(null)
})

test('T-727: publish puts the last branch figures in the board view (as OpenCode reads view.json)', async () => {
  S.root = '/repo'
  S.gitState = 'ok'
  const g = fakeHost({ run: fakeGit([], 'symcc/none') })
  const now = Date.now()
  const board = { ...emptyBoard(), tasks: branchTasks(now) as never[] }
  await branchFacts(g.host, board, 'main', now).done
  await publish(g.host, board)
  const v = g.panel.view() as unknown as { branches?: { tasks: Record<string, unknown> } }
  expect(Object.keys(v.branches?.tasks ?? {}).sort()).toEqual(['T-721', 'T-725'])
  // no git: no figures
  S.gitState = 'no-git'
  await publish(g.host, board)
  expect('branches' in g.panel.view()).toBe(false)
})

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

const liveView = () => ({ shape: 'view-1', value: { tasks: branchTasks(T0), working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: ['npm test'], driving: true, checker: true, max_parallel: 3, branches: branchFactsAt(T0) } })

for (const bodyColumns of [100, 40])
  test(`T-727: the terminal Live tab draws the Branches section at ${bodyColumns} columns, and Enter on a row opens its task`, async ($, on) => {
    seedBoard(on, { view: liveView() })
    on('ui.toast', () => ({ value: undefined }))
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'terminal' })
    await ui.press({ key: 'tab-live' })
    const want = linesOf(liveBranches({ tasks: branchTasks(T0) as never[], branches: branchFactsAt(T0) }, T0, bodyColumns)!)
    // the section's lines, in order, right under the lane (and over the rule)
    const lines = pageLines(await ui.drawn())
    const at = lines.indexOf(want[0]!)
    expect(at).toBeGreaterThan(0)
    // T-789: an empty line under the heading, then the section's lines
    expect(lines[at + 1]!.trim()).toBe('')
    expect([lines[at], ...lines.slice(at + 2, at + 1 + want.length)]).toEqual(want)
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(bodyColumns)
    // each task row is a row Button that opens its task (Enter on it)
    const rows: string[] = []
    for (const id of ['T-724', 'T-721', 'T-725', 'T-726']) rows.push((await ui.find({ key: branchKey(id) }))!.text)
    expect(rows).toEqual(want.slice(2))
    await ui.press({ key: branchKey('T-725') })
    expect(pageLines(await ui.drawn()).includes(want[0]!)).toBe(false)
    expect(await ui.find({ type: 'Text', text: /Guide: Live tab/ })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(pageLines(await ui.drawn()).includes(want[0]!)).toBe(true)
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  })

test('T-727: the VS Code Live tab draws the Branches section with real lines, and a click on a row opens its task', async ($, on) => {
  seedBoard(on, { view: liveView() })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  expect((await ui.find({ key: 'live-br-head' }))?.text).toBe('BRANCHES')
  expect((await ui.find({ key: 'live-br-main-text' }))?.text).toBe('main  c1c1c1c · 2 min ago')
  const svgs = await ui.findAll({ type: 'Svg' })
  const main = svgs.find(x => x.props.alt === BRANCH_LINES_100[1]!.trim())
  expect(String(main?.props.alt)).toBe(BRANCH_LINES_100[1]!.trim())
  expect((String(main?.props.source).match(/<circle/g) ?? []).length).toBe(7)
  for (const [i, id] of ['T-724', 'T-721', 'T-725', 'T-726'].entries()) {
    const svg = svgs.find(x => x.props.alt === BRANCH_LINES_100[i + 2]!.trim())
    expect(String(svg?.props.source)).toContain('<path')
    expect((await ui.find({ key: branchKey(id) }))?.props.pressableLinks).toEqual([vsHref('task', id)])
  }
  expect((await ui.find({ key: 'live-br-note:T-721' }))?.text).toBe('+3 commits · 1 behind')
  expect((await ui.find({ key: 'live-br-note:T-726' }))?.text).toBe('not started')
  await ui.press({ key: branchKey('T-721'), link: { href: vsHref('task', 'T-721') } })
  expect(await ui.find({ key: 'live-br-head' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Record which test failed/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'live-br-head' })).toBeDefined()
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

// T-738, T-747, T-789: each section of the Live tab starts with a bold UPPERCASE heading, no "▍" (Tasks right under the mode line, then
// Today, Branches, Organizational memory; T-750 put Today above Branches), with one empty line just above it, none above the first, never two, and one under it; no
// "── Name ──" rules and no full-width rule between the sections (only the footer's, under the last one).
const LIVE_HEADS = ['TODAY', 'BRANCHES', 'ORGANIZATIONAL MEMORY'].map(h => (l: string) => l.startsWith(h))
for (const surface of ['terminal', 'desktop', 'mobile'] as const)
  test(`T-738, T-747: the ${surface} Live tab has an UPPERCASE heading for each section, one empty line above and under each, none above the first`, async ($, on) => {
    const all = liveView()
    // T-786: nothing waits for the owner here (▍Needs you has its own tests)
    seedBoard(on, { view: { ...all, value: { ...all.value, tasks: all.value.tasks.filter(t => !['review', 'waiting', 'failed'].includes(t.status)) } } })
    on('ui.toast', () => ({ value: undefined }))
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface })
    await ui.press({ key: 'tab-live' })
    const lines = pageLines(await ui.drawn())
    const first = lines.findIndex(l => l.includes('agents ') && l.includes(' busy'))
    expect(first).toBeGreaterThan(0)
    expect(lines[first - 1]!.trim() === '').toBe(false)
    const live = lines.slice(first)
    expect(live[1]).toBe('TASKS')
    expect(live.some(l => l.includes('▍'))).toBe(false)
    const heads = live.filter(l => LIVE_HEADS.some(h => h(l)) || l === 'TASKS')
    expect(heads.slice(0, 3)).toEqual(['TASKS', 'TODAY', 'BRANCHES'])
    expect([heads.length, /^ORGANIZATIONAL MEMORY {3}\d+ \/ 60 ▕/.test(heads[3] ?? '')]).toEqual([4, true])
    expect(live.filter(l => l.includes('── ') || /^─+$/.test(l)).length).toBe(1)
    // the lines under a heading are indented by 1 (T-767; a running lane starts "▶ ")
    for (const l of [' ▶ T-7', '  main ', ' ✓ ', '   newest']) expect([l, live.some(x => x.startsWith(l))]).toEqual([l, true])
    for (const isHead of LIVE_HEADS) {
      const at = live.findIndex(isHead)
      expect([at, at > 0]).toEqual([at, true])
      expect([live[at], live[at - 1]!.trim()]).toEqual([live[at], ''])
      expect([live[at], live[at - 2]!.trim() === '']).toEqual([live[at], false])
      expect([live[at], live[at + 1]!.trim()]).toEqual([live[at], ''])
      expect([live[at], live[at + 2]!.trim() === '']).toEqual([live[at], false])
    }
    await ui.press({ key: 'tab-tasks' })
    await ui.unmount()
  })

type VsNode = { type?: string; key?: unknown; props?: Record<string, unknown>; children?: unknown[] }
test('T-738: the VS Code Live tab spaces its sections with one empty line (the page Box\'s gap), none above the first', async ($, on) => {
  seedBoard(on, { view: liveView() })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'live') } })
  // the page's Box: the one holding the header line and every section as its own child
  const find = (n: unknown): VsNode | undefined => {
    const x = n as VsNode
    if (!x || typeof x !== 'object') return undefined
    if (Array.isArray(n)) return n.map(find).find(Boolean)
    const kids = (x.children ?? []) as VsNode[]
    if (x.type === 'Box' && kids.some(k => k && (k.key ?? k.props?.key) === 'live-head')) return x
    return kids.map(find).find(Boolean)
  }
  const page = find(await ui.drawn())!
  expect(page.props?.gap).toBe(1)
  const keys = ((page.children ?? []) as VsNode[]).map(k => String(k?.key ?? k?.props?.key ?? ''))
  for (const k of ['live-head', 'live-tasks', 'live-br', 'live-bottom', 'live-om']) expect([k, keys.includes(k)]).toEqual([k, true])
  // T-747: each section's heading, the terminal's names
  expect((await ui.find({ key: 'live-tasks-head' }))?.text).toBe('TASKS')
  expect((await ui.find({ key: 'live-today-head' }))?.text).toBe('TODAY')
  // T-789: one empty line under each heading (padding under it), not a blank Text
  for (const k of ['live-tasks-head', 'live-today-head', 'live-br-head', 'live-om-head']) expect([k, (await ui.find({ key: k }))?.props.paddingBottom]).toEqual([k, 1])
  // no blank Text lines of its own (the gap is the one empty line), and no padding on top of the gap
  for (const c of (page.children ?? []) as VsNode[]) expect([String(c?.props?.key), c?.props?.paddingTop ?? 0, c?.props?.marginTop ?? 0]).toEqual([String(c?.props?.key), 0, 0])
  await ui.press({ key: 'tabs', link: { href: vsHref('tab', 'tasks') } })
  await ui.unmount()
})

test('T-773: a freshly opened VS Code board (no tab saved) shows the Live tab and draws the Live page', async ($, on) => {
  seedBoard(on, { view: liveView(), tab: undefined })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'vscode' })
  const tabs = String((await ui.find({ key: 'tabs' }))?.props.text)
  expect(tabs.indexOf('Live')).toBeGreaterThanOrEqual(0)
  expect(tabs.indexOf('Live')).toBeLessThan(tabs.indexOf('Tasks'))
  expect(tabs).toMatch(/\*\*[^*]*Live[^*]*\*\*/)
  expect((await ui.find({ key: 'live-br-head' }))?.text).toBe('BRANCHES')
  await ui.unmount()
})

test('T-794: a task merged 3 minutes ago keeps a dim Branches row joining main; 11 minutes ago it has none; only finished rows still show the section; the same tasks as the Tasks lanes', () => {
  const tasks = branchTasks(T0) as { id: string; status: string; history: { kind: string; at: string; text: string }[] }[]
  const merged = (id: string, minAgo: number) => ({ ...tasks[3]!, id, history: [{ kind: 'merged', at: new Date(T0 - minAgo * 60_000).toISOString(), text: 'merged' }] })
  const only = [merged('T-724', 3), merged('T-730', 11), merged('T-731', 1), merged('T-732', 2), merged('T-733', 4)]
  const view = { tasks: only as never[], branches: { ...branchFactsAt(T0), tasks: {} } }
  const b = liveBranches(view, T0, 100)!
  // (c) only finished rows: the section shows; (b) 11 minutes: none; at most 3, newest first
  expect(b.rows.map(r => r.id)).toEqual(['T-731', 'T-732', 'T-724'])
  const row = b.rows.find(r => r.id === 'T-724')!
  // (a) dim, joins main at its merge commit (c1 = the newest)
  expect(segText(row.segs)).toContain('◀ T-724  merged 3m ago (c1c1c1c)')
  expect(row.segs.filter(s => s.text.includes('merged') || s.text === '◀').every(s => s.tone === 'dim')).toBe(true)
  expect(row.col).toBe(b.commits.length - 1)
  // (d) the same tasks as ▍Tasks
  expect(b.rows.map(r => r.id)).toEqual(liveFinishedLanes(view, T0).map(l => l.id))
  // the newest finished one first
  const mixed = liveBranches({ ...sample(), tasks: [...(sample().tasks as never[]), merged('T-740', 2) as never] }, T0, 100)!
  expect(mixed.rows.map(r => r.id)).toEqual(['T-740', 'T-724', 'T-721', 'T-725', 'T-726'])
})
