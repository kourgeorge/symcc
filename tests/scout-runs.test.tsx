// Each scout's run history (T-410): every run end adds a record to <dir>/scouts/<scout>.runs.json with its outcome,
// findings, tokens and full report file (<dir>/reports/scouts/<scout>-<time>.md); only the last 50 are kept. The
// scout's page lists them and opens one's report, and says when the last run ended on an API error or a refusal.
// Like tests/scout-report.test.tsx, the run is set up by hand (scoutRuns, scoutState) and scoutFinished is called.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import type { SymccScout } from '../types'
import { emptyBoard, leadScoutText, parseScoutRuns, scoutRunTasks, scoutRunsText, scoutRunLine, scoutLastRunProblem, SCOUT_RUNS_KEPT, type ScoutRunRecord } from '../hooks/board'
import { scoutFinished, scheduleScouts } from '../hooks/plugin/scouts'
import { S, scoutRuns, scoutState } from '../hooks/plugin/state'
import { fakeHost, memoryFs } from './fake-host'
import { inProject } from './project'
import { readText } from './fakes'
import { ICON } from '../hooks/name'

const ROOT = '/repo'
const MEMORY = `${ROOT}/.symcc/scouts.json`
const RUNS = `${ROOT}/.symcc/scouts/bugs.runs.json`
const BOARD = `${ROOT}/.symcc/board.json`
const LAST_RUN = '2026-11-13T00:00:00.000Z'

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })

/** In-memory files (a board in auto mode, plus `seed`); scout "bugs" is running as agent s1. */
function world(seed: Record<string, string> = {}) {
  const files = new Map<string, string>([[BOARD, JSON.stringify({ ...emptyBoard(), mode: 'auto' })], ...Object.entries(seed)])
  const run = async (argv: readonly string[]): Promise<Res> => {
    const [cmd, ...rest] = argv
    if (cmd === 'mv') {
      const [, from, to] = rest
      files.set(to!, files.get(from!)!)
      files.delete(from!)
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(p)
    return ok()
  }
  const { host } = fakeHost({ run: argv => run(argv), fs: memoryFs(files), ui: { toast: () => undefined }, clock: { after: () => ({ cancel() {} }) }, lead: { send: async () => undefined } })
  S.root = ROOT
  S.leadTimer = null
  S.writing = Promise.resolve()
  S.driving = false
  S.enabledNow = true
  S.players = Promise.resolve({ system: 'other', voice: [], sound: [] }) as never
  const start = () => {
    const st: SymccScout = { name: 'bugs', every_minutes: 30, last_run: LAST_RUN, running: true, prompt: 'Look for crashes.' }
    scoutState.set('bugs', st)
    scoutRuns.set('s1', 'bugs')
  }
  start()
  const runs = () => parseScoutRuns(files.get(RUNS))
  return { $: host, files, runs, start }
}

test('a run that found something adds a record with outcome "found", its findings, tokens and its full report file', async () => {
  const w = world()
  const answer = '1. The parser crashes on empty input.\n2. No test for it.\n' + 'x'.repeat(3000)
  await scoutFinished(w.$, 's1', answer, false, { input: 10, output: 5 })
  const runs = w.runs()
  expect(runs.length).toBe(1)
  expect(runs[0]!.outcome).toBe('found')
  expect(runs[0]!.findings).toBe(2)
  expect(runs[0]!.tokens).toEqual({ input: 10, output: 5 })
  expect(runs[0]!.report).toMatch(/^\.symcc\/reports\/scouts\/bugs-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.md$/)
  // the whole report, not the 2000 characters scouts.json keeps
  expect(w.files.get(`${ROOT}/${runs[0]!.report}`)).toBe(answer.trim() + '\n')
})

test('a NOTHING run, a stopped run and one that ended on an API error or a refusal each get their outcome', async () => {
  const w = world()
  await scoutFinished(w.$, 's1', 'NOTHING')
  w.start()
  await scoutFinished(w.$, 's1', 'half an', true)
  w.start()
  await scoutFinished(w.$, 's1', '', { reason: 'error' })
  w.start()
  await scoutFinished(w.$, 's1', 'I cannot', { reason: 'refusal', refusal: { category: null, explanation: null } })
  const runs = w.runs()
  expect(runs.map(r => r.outcome)).toEqual(['nothing', 'stopped', 'error', 'refusal'])
  // an empty answer has no report file; the others keep what they said
  expect(runs[2]!.report).toBeUndefined()
  expect(w.files.get(`${ROOT}/${runs[1]!.report}`)).toBe('half an\n')
  expect(scoutLastRunProblem(runs)).toBe('Its last run ended on a refusal, so nothing was reported.')
  expect(scoutLastRunProblem(runs.slice(0, 3))).toBe('Its last run ended on an API error, so nothing was reported.')
  expect(scoutLastRunProblem(runs.slice(0, 1))).toBe('')
})

test(`only the last ${SCOUT_RUNS_KEPT} runs are kept, and the report files of older ones are removed`, async () => {
  const old: ScoutRunRecord[] = []
  const seed: Record<string, string> = {}
  for (let i = 0; i < SCOUT_RUNS_KEPT; i++) {
    const ended = new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 60_000).toISOString()
    const report = `.symcc/reports/scouts/bugs-${i}.md`
    old.push({ started: null, ended, outcome: 'found', findings: 1, report })
    seed[`${ROOT}/${report}`] = `1. old ${i}\n`
  }
  const w = world({ ...seed, [RUNS]: scoutRunsText(old) })
  await scoutFinished(w.$, 's1', '1. New.')
  const runs = w.runs()
  expect(runs.length).toBe(SCOUT_RUNS_KEPT)
  expect(runs[0]!.report).toBe('.symcc/reports/scouts/bugs-1.md')
  expect(runs[runs.length - 1]!.outcome).toBe('found')
  expect(w.files.has(`${ROOT}/.symcc/reports/scouts/bugs-0.md`)).toBe(false)
  expect(w.files.has(`${ROOT}/.symcc/reports/scouts/bugs-1.md`)).toBe(true)
})

test("once: the last report in scouts.json becomes the first run of the history, before the new run's", async () => {
  const w = world({ [MEMORY]: JSON.stringify({ scouts: { bugs: { last_run: LAST_RUN, last_report: '1. Old crash.' } } }) })
  await scoutFinished(w.$, 's1', 'NOTHING')
  const runs = w.runs()
  expect(runs.map(r => [r.ended, r.outcome])).toEqual([
    [LAST_RUN, 'found'],
    [runs[1]!.ended, 'nothing'],
  ])
  expect(w.files.get(`${ROOT}/${runs[0]!.report}`)).toBe('1. Old crash.\n')
})

test('scheduling the scouts moves the last report into the history when there is none yet', async () => {
  const w = world({ [MEMORY]: JSON.stringify({ scouts: { bugs: { last_run: LAST_RUN, last_report: '1. Old crash.' } } }) })
  scoutState.clear()
  w.$.fs.list = async () => [{ name: 'bugs.md', kind: 'file' }] as never
  w.files.set(`${ROOT}/.symcc/scouts/bugs.md`, '---\nevery_minutes: 0\n---\nLook for crashes.\n')
  w.$.fs.exists = async p => p.endsWith('/.symcc/scouts') || w.files.has(p)
  await scheduleScouts(w.$)
  expect(w.runs().map(r => r.outcome)).toEqual(['found'])
})

test('tasks made from a run are linked to it: the scout\'s tasks made after it ended and before the next report', () => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: '2026-11-10T00:00:00.000Z', outcome: 'found', findings: 2 },
    { started: null, ended: '2026-11-11T00:00:00.000Z', outcome: 'error', findings: 0 },
    { started: null, ended: '2026-11-12T00:00:00.000Z', outcome: 'found', findings: 1 },
  ]
  const from = (scout: string) => ({ by: 'scout' as const, scout, why: 'x', at: '' })
  const tasks = [
    { id: 'T-1', created_at: '2026-11-10T01:00:00.000Z', origin: from('bugs') },
    // after the error run: still from the first report
    { id: 'T-2', created_at: '2026-11-11T05:00:00.000Z', origin: from('bugs') },
    { id: 'T-3', created_at: '2026-11-12T01:00:00.000Z', origin: from('bugs') },
    { id: 'T-4', created_at: '2026-11-12T01:00:00.000Z', origin: from('docs') },
    { id: 'T-5', created_at: '2026-11-09T01:00:00.000Z', origin: from('bugs') },
  ]
  expect(scoutRunTasks(runs, tasks, 'bugs')).toEqual([['T-1', 'T-2'], [], ['T-3']])
  expect(scoutRunLine(runs[0]!, ['T-1', 'T-2'], Date.parse('2026-11-10T00:08:00.000Z'))).toBe('8m ago · found · 2 findings · tasks T-1, T-2')
})

test("the lead's scouts list with a name shows the scout's recent runs, newest first", () => {
  const st: SymccScout = { name: 'bugs', every_minutes: 0, last_run: LAST_RUN, running: false, prompt: 'Look.' }
  const nowMs = Date.parse(LAST_RUN) + 10 * 60_000
  const runs = [
    { run: { started: null, ended: LAST_RUN, outcome: 'found' as const, findings: 1, report: '.symcc/reports/scouts/bugs-a.md' }, tasks: ['T-9'] },
    { run: { started: null, ended: '2026-11-12T23:00:00.000Z', outcome: 'error' as const, findings: 0 }, tasks: [] },
  ]
  const text = leadScoutText(st, nowMs, true, runs)
  expect(text).toContain('recent runs (newest first')
  expect(text).toContain('  10m ago · found · 1 finding · task T-9 · .symcc/reports/scouts/bugs-a.md')
  expect(text).toContain('  1h 10m ago · API error · 0 findings · no tasks')
  expect(leadScoutText(st, nowMs, true)).toContain('  (none yet)')
})

// ---------------- the scout's page ----------------

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** The panel on scout bugs's page, with its runs file and report files as given. */
function page(on: On, files: Record<string, string>, tasks: unknown[] = []) {
  const seed: Record<string, unknown> = { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks, working: [], scouts: [{ name: 'bugs', every_minutes: 30, last_run: LAST_RUN, running: false, prompt: 'Look for crashes.', last_report: '1. Old crash.' }], mode: 'auto', test_commands: [] } } }
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  inProject(on)
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
}

const texts = async (ui: { findAll(q: { type: string }): Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(x => x.text)

test("the scout's page lists its runs, newest first, and opening one shows its full report", async ($, on) => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: '2026-11-12T00:00:00.000Z', outcome: 'found', findings: 2, report: '.symcc/reports/scouts/bugs-old.md' },
    { started: null, ended: LAST_RUN, outcome: 'nothing', findings: 0, report: '.symcc/reports/scouts/bugs-new.md' },
  ]
  const task = { id: 'T-7', title: 'Fix the crash', details: '', files: [], status: 'todo', note: '', question: null, order: 7, after: [], attempts: 0, history: [], branch: null, created_at: '2026-11-12T01:00:00.000Z', updated_at: '', origin: { by: 'scout', scout: 'bugs', why: 'it crashes', at: '' } }
  page(on, { '/.symcc/scouts/bugs.runs.json': scoutRunsText(runs), '/.symcc/reports/scouts/bugs-old.md': '1. The parser crashes.\n2. The whole old report.\n', '/.symcc/reports/scouts/bugs-new.md': 'NOTHING\n' }, [task])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^▍Runs$/ })).toBeDefined()
  const rows = (await ui.findAll({ type: 'Button' })).map(b => String(b.props.key)).filter(k => k.startsWith('scout-run:'))
  expect(rows).toEqual([`scout-run:${LAST_RUN}`, 'scout-run:2026-11-12T00:00:00.000Z'])
  const all = await texts(ui)
  expect(all.some(t => / · found · 2 findings · task T-7$/.test(t))).toBe(true)
  expect(all.some(t => / · nothing · 0 findings · no tasks$/.test(t))).toBe(true)
  // no error note: the last run reported
  expect(all.some(t => /so nothing was reported/.test(t))).toBe(false)
  await ui.press({ key: 'scout-run:2026-11-12T00:00:00.000Z' })
  expect(await ui.find({ type: 'Text', text: /^▍Report$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /The whole old report/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\.symcc\/reports\/scouts\/bugs-old\.md/ })).toBeDefined()
  await ui.press({ key: 'scout-run-back' })
  expect(await ui.find({ type: 'Text', text: /^▍Runs$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▍Report$/ })).toBeUndefined()
  await ui.unmount()
})

test("the scout's page says when its last run ended on an API error, so nothing was reported", async ($, on) => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: '2026-11-12T00:00:00.000Z', outcome: 'found', findings: 1, report: '.symcc/reports/scouts/bugs-old.md' },
    { started: null, ended: LAST_RUN, outcome: 'error', findings: 0 },
  ]
  page(on, { '/.symcc/scouts/bugs.runs.json': scoutRunsText(runs) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const note = await ui.find({ type: 'Text', text: /^Its last run ended on an API error, so nothing was reported\.$/ })
  expect(note?.props.color).toBe('error')
  expect((await texts(ui)).some(t => / · API error · 0 findings · no tasks$/.test(t))).toBe(true)
  await ui.unmount()
})
