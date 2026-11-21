// T-768: /symcc-stats in Claude Code's chat: the CommandOutput row is drawn from the report's figures (title bar,
// four headline figures in colors by meaning, "▍" headings in the text report's order, bars in their kind's colors
// with right-aligned numbers, dim small print, a footer), keeps every figure of the short text, fits a narrow screen,
// and leaves every other row (full, another command, a text it didn't make) to the engine.
import { expect, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { test } from './reset'
import { statsData, textWidth, type StatsInput } from '../hooks/core/stats'
import { emptyBoard } from '../hooks/board'
import { BAR_EMPTY, BAR_FULL, VIEW_BAR } from '../hooks/claude/stats-lines'
import { viewInput, VIEW_NOW } from './stats-view-fixture'
import { ICON } from '../hooks/name'
import { entry, slash } from './fakes'
import { inProject, PROJECT } from './project'

/**
 * A project for the plugin's own /symcc-stats: `run` answers it over `input`'s tasks, lead calls (one session log),
 * scouts (scouts.json and their runs files) and this session's $. The plugin remembers the figures of the text it
 * answers in its own copy of the modules (not the test's), so the row is drawn from what the command really answered.
 */
function statsWorld(on: On) {
  const logs = `/home/me/.claude/projects/${PROJECT.replace(/\//g, '-')}`
  const files = new Map<string, string>()
  let usd: number | undefined
  inProject(on)
  on('session.repo', () => ({ value: { root: PROJECT } }) as never)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }) as never)
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => (files.has(e.path) ? { value: files.get(e.path)! } : Promise.reject(new Error('no file'))))
  on('fs.list', (_, e) => (e.path === logs ? { value: [{ ...entry('s1.jsonl'), mtimeMs: VIEW_NOW }] } : Promise.reject(new Error('no folder'))))
  on('session.usage', () => ({ value: { cost: { usd } } }) as never)
  return async ($: Engine, input: StatsInput, args = ''): Promise<string> => {
    files.clear()
    files.set(`${PROJECT}/.symcc/board.json`, JSON.stringify({ ...emptyBoard(), tasks: input.tasks }))
    files.set(`${PROJECT}/.symcc/scouts.json`, JSON.stringify({ scouts: {}, usage: input.team?.scouts ?? {} }))
    for (const [name, runs] of Object.entries(input.scoutRuns ?? {})) files.set(`${PROJECT}/.symcc/scouts/${name}.runs.json`, JSON.stringify({ runs: runs.map(r => ({ ...r, outcome: 'found' })) }))
    const log = (input.team?.lead ?? []).map(c => ({ type: 'assistant', isSidechain: false, timestamp: new Date(c.atMs).toISOString(), message: { id: c.id, model: 'm', content: [], usage: { input_tokens: c.tokens.input ?? 0, output_tokens: c.tokens.output ?? 0, cache_read_input_tokens: c.tokens.cache_read ?? 0, cache_creation_input_tokens: c.tokens.cache_write ?? 0 } } }))
    files.set(`${logs}/s1.jsonl`, log.map(l => JSON.stringify(l)).join('\n'))
    usd = input.team?.sessionUsd
    return String((await $.command.run(slash('symcc-stats', args))).text)
  }
}

type Line = { text: string; runs: { text: string; props: Record<string, unknown> }[] }
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }
const textOf = (n: Node | string): string => (typeof n === 'string' ? n : (n.children ?? []).map(textOf).join(''))
/** The drawn lines: the Box's Text children, each one whole line, with its runs (child Texts). */
async function lines(ui: { drawn(): Promise<unknown> }): Promise<Line[]> {
  const root = (await ui.drawn()) as Node
  return (root.children ?? []).map(l => (typeof l === 'string' ? { text: l, runs: [] } : { text: textOf(l), runs: (l.children ?? []).map(r => ({ text: textOf(r), props: typeof r === 'string' ? {} : (r.props ?? {}) })) }))
}

const row = (text: string, columns = 82, command = 'symcc-stats') => ({
  plugin: 'symcc',
  component: 'CommandOutput' as const,
  surface: 'terminal' as const,
  props: { command, args: '', text, isErrored: false },
  viewport: { columns, rows: 50 },
})

const HEADINGS = ['Tasks by state', 'Worker time and tokens', 'Investigations', 'Who spent the tokens', 'Per merged task', 'Per try', 'Where the time goes', 'Most tokens', 'Most time', 'How tasks ended', 'Why tries were sent back', 'Each failed try', 'Tests that failed most', 'By role', 'Where tasks came from', 'Scouts', 'Last 7 days']

test('T-768: /symcc-stats draws a title bar, 4 colored headline figures, ▍ headings in order, kind-colored bars, dim small print and a footer', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const stats = statsWorld(on)
  const text = await stats($, viewInput())
  const ui = await $.ui.mount(row(`symcc: ${text}`)) // the real host puts "symcc: " before the text (T-788)
  const W = 80
  const drawn = await lines(ui)
  const shown = drawn.map(l => l.text)
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeUndefined()

  // the title bar: the range on the left, the task count on the right, then a heavy rule
  expect(shown[0]).toBe(`${ICON} symcc stats · all tasks${' '.repeat(W - textWidth(`${ICON} symcc stats · all tasks`) - 7)}7 tasks`)
  expect(shown[1]).toBe('━'.repeat(W))

  // the 4 headline figures, bold, colored by meaning, a dim label under each
  const figs = drawn[3]!.runs
  expect(figs.map(f => f.text.trim())).toEqual(['4', '50%', '43.7k', '$3.25'])
  expect(figs.map(f => f.props.color)).toEqual(['success', 'warning', 'text', 'text'])
  expect(figs.every(f => f.props.bold === true)).toBe(true)
  const labels = drawn[4]!.runs
  expect(labels.map(f => f.text.trim())).toEqual(['merged', 'right first try', 'tok per merged', 'session (/cost)'])
  expect(labels.every(f => f.props.dimColor === true)).toBe(true)
  // under 40% first try is red, 70% and over green
  // every one-try task tried twice: none right first try, so it is red
  const redInput = viewInput({ tasks: viewInput().tasks.map(t => (t.id === 'T-1' || t.id === 'T-4' ? { ...t, runs: [...t.runs!, ...t.runs!] } : t)) })
  expect(statsData(redInput).first).toBe(0)
  const redUi = await $.ui.mount(row(await stats($, redInput)))
  expect((await lines(redUi))[3]!.runs[1]!.props.color).toBe('error')
  await redUi.unmount()

  // the ▍ headings, bold in the accent color, in the text report's order
  const heads = drawn.filter(l => l.text.startsWith('▍'))
  expect(heads.map(h => h.runs[0]!.text.slice(1))).toEqual(HEADINGS)
  expect(heads.every(h => h.runs[0]!.props.color === 'suggestion' && h.runs[0]!.props.bold === true)).toBe(true)

  // the bars: one style (█ then ░, all VIEW_BAR wide), each kind in its color, numbers right-aligned in columns
  const barOf = (re: RegExp) => {
    const l = drawn.find(x => re.test(x.text))!
    const r = l.runs
    const filled = r.find(x => x.text.startsWith(BAR_FULL))
    const rest = r.find(x => x.text.startsWith(BAR_EMPTY))
    return { line: l.text, color: filled?.props.color, width: (filled?.text.length ?? 0) + (rest?.text.length ?? 0), restColor: rest?.props.color }
  }
  expect(barOf(/^ {2}work +█/)).toMatchObject({ color: 'ide', width: VIEW_BAR })
  expect(barOf(/^ {2}check +█/)).toMatchObject({ color: 'autoAccept', width: VIEW_BAR })
  expect(barOf(/^ {2}tests +█/)).toMatchObject({ color: 'warning', width: VIEW_BAR, restColor: 'subtle' })
  expect(barOf(/^ {2}waiting to start +█/)).toMatchObject({ color: 'inactive', width: VIEW_BAR })
  expect(barOf(/^ {2}tests failed +█/)).toMatchObject({ color: 'error', width: VIEW_BAR })
  expect(barOf(/^ {2}sent back by checker +█/)).toMatchObject({ color: 'autoAccept', width: VIEW_BAR })
  expect(barOf(/^ {2}◆ lead +█/)).toMatchObject({ color: 'success', width: VIEW_BAR })
  expect(barOf(/^ {2}▸ workers +█/)).toMatchObject({ color: 'ide', width: VIEW_BAR })
  expect(barOf(/^ {2}⌕ scouts +█/)).toMatchObject({ color: 'suggestion', width: VIEW_BAR })
  // the clash row has no failures: an empty bar, its count and label dim
  expect(drawn.find(l => /^ {2}clash with main +░{16} +0$/.test(l.text))).toBeDefined()
  // "Where the time goes": every row ends in the same column (the share), the numbers right-aligned
  const at = shown.indexOf(shown.find(l => /^▍Where the time goes/.test(l))!)
  const stageRows = shown.slice(at + 1, at + 13).map(l => l.trimEnd())
  expect(stageRows[0]).toMatch(/total {2}per task {2}share$/)
  expect(stageRows[2]).toMatch(/^ {2}work +█{16} {2}1h 55m {7}29m {4}53%$/)
  expect(stageRows[11]).toMatch(/^ {2}lifetime +3h 38m {7}55m {3}100%$/)
  expect(new Set(stageRows.map(l => textWidth(l))).size).toBe(1)
  // the units are dim
  const lead = drawn.find(l => /^ {2}◆ lead/.test(l.text))!.runs
  expect(lead.find(r => r.text === ' tok')?.props.dimColor).toBe(true)

  // the small print is dim, under its section
  const small = (re: RegExp) => drawn.find(l => re.test(l.text))
  for (const re of [/^ +input 33k · output 3\.2k · cache read 64\.4k$/, /^ +total 44\.8k tok · 1h 40m$/, /^ +1 task not linked to a run$/, /^\* billed \(an estimate\)/]) {
    const l = small(re)
    expect(l).toBeDefined()
    expect(l!.runs.every(r => !r.text.trim() || r.props.dimColor === true)).toBe(true)
  }

  // the footer: a rule, then the hints
  const foot = shown.indexOf('─'.repeat(W))
  expect(foot).toBeGreaterThan(0)
  expect(shown[foot + 1]).toBe('/symcc-stats full · every number   /symcc-stats 7d · last week')
  expect(foot + 2).toBe(shown.length)

  // every figure of the short text report is still there
  const all = shown.join('\n')
  const figures = new Set(text.match(/\$?\d[\d.]*(?:[kM%]|h|m|s)?/g) ?? [])
  expect(figures.size).toBeGreaterThan(40)
  const missing = [...figures].filter(f => !new RegExp(`(^|[^\\d.])${f.replace(/[.$]/g, '\\$&')}(?![\\d.]|[kM%hms])`, 'm').test(all))
  expect(missing).toEqual([])
  for (const l of shown) expect(textWidth(l)).toBeLessThanOrEqual(W)
  await ui.unmount()
})

test('T-768: on a narrow screen nothing goes past the width: bars shrink, then labels are cut with "…"', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const text = await statsWorld(on)($, viewInput())
  for (const columns of [34, 46]) {
    const ui = await $.ui.mount(row(text, columns))
    const drawn = (await lines(ui)).map(l => l.text)
    expect(drawn.length).toBeGreaterThan(50)
    for (const l of drawn) expect(textWidth(l)).toBeLessThanOrEqual(columns - 2)
    // the bars got shorter and the long labels were cut
    expect(drawn.some(l => /^ {2}work +█+$|^ {2}work +█+░* /.test(l) && !l.includes('█'.repeat(VIEW_BAR)))).toBe(true)
    expect(drawn.some(l => /…/.test(l))).toBe(true)
    expect(drawn.filter(l => l.startsWith('▍')).length).toBe(HEADINGS.length)
    await ui.unmount()
  }
})

test('T-768: "full", another command and a text it did not make are drawn by the engine as they are', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const stats = statsWorld(on)
  const full = await stats($, viewInput(), 'full')
  expect(full).toContain('symcc stats · all tasks (7 tasks) · full')
  const short = { text: await stats($, viewInput()) }
  for (const r of [row(full), row(String(short.text), 82, 'symcc-doctor'), { ...row(String(short.text)), props: { ...row(String(short.text)).props, isErrored: true } }, row('symcc stats · all tasks (2 tasks)\n\nnot from statsReport')]) {
    const ui = await $.ui.mount(r)
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▍/ })).toBeUndefined()
    await ui.unmount()
  }
})
