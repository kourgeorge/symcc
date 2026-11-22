// Each scout's run history (T-410): every run end adds a record to <dir>/scouts/<scout>.runs.json with its outcome,
// findings, tokens and full report file (<dir>/reports/scouts/<scout>-<time>.md); only the last 50 are kept. The
// scout's page lists them and opens one's report, and says when the last run ended on an API error or a refusal.
// Like tests/scout-report.test.tsx, the run is set up by hand (scoutRuns, scoutState) and scoutFinished is called.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import type { SymccScout } from '../types'
import { addScoutRun, emptyBoard, leadScoutText, parseScoutRuns, scoutRunTasks, scoutRunsText, scoutRunLine, scoutLastRunProblem, linkScoutRunTask, SCOUT_RUNS_KEPT, type ScoutRunRecord } from '../hooks/board'
import { scoutFinished, scheduleScouts, scoutPlace, scoutPlaceValue, migrateScoutOrigins, loadScoutResults } from '../hooks/app/scouts'
import { runTool } from '../hooks/app/tools'
import { load } from '../hooks/app/store'
import { utcTime } from '../hooks/board'
import { S, heard, scoutRuns, scoutState } from '../hooks/app/state'
import { fakeHost, memoryFs } from './fake-host'
import { inProject } from './project'
import { readText } from './fakes'
import { ICON } from '../hooks/name'
import { resetPane } from '../hooks/app/open'
import { vsHref } from '../hooks/claude/ui/vscode'
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

test("T-804: the last report in scouts.json is not moved into the history by a run or by scheduling (migrate-data does that)", async () => {
  const w = world({ [MEMORY]: JSON.stringify({ scouts: { bugs: { last_run: LAST_RUN, last_report: '1. Old crash.' } } }) })
  await scoutFinished(w.$, 's1', 'NOTHING')
  expect(w.runs().map(r => r.outcome)).toEqual(['nothing'])
  const v = world({ [MEMORY]: JSON.stringify({ scouts: { bugs: { last_run: LAST_RUN, last_report: '1. Old crash.' } } }) })
  scoutState.clear()
  v.$.fs.list = async () => [{ name: 'bugs.md', kind: 'file' }] as never
  v.files.set(`${ROOT}/.symcc/scouts/bugs.md`, '---\nevery_minutes: 0\n---\nLook for crashes.\n')
  v.$.fs.exists = async p => p.endsWith('/.symcc/scouts') || v.files.has(p)
  await scheduleScouts(v.$)
  expect(v.runs()).toEqual([])
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

/** The panel on scout bugs's page, with its runs file and report files as given; answers the values the panel saved. */
function page(on: On, files: Record<string, string>, tasks: unknown[] = []) {
  const seed: Record<string, unknown> = { tab: 'scouts', scout: 'bugs', view: { shape: 'view-1', value: { tasks, working: [], scouts: [{ name: 'bugs', every_minutes: 30, last_run: LAST_RUN, running: false, prompt: 'Look for crashes.', last_report: '1. Old crash.' }], mode: 'auto', test_commands: [] } } }
  const written = new Set<string>()
  const saved: Record<string, unknown> = {}
  on('state.set', (_, e, next) => (written.add(e.key), (saved[e.key] = (e as { value?: unknown }).value), next(e)))
  inProject(on)
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seed ? { value: { value: seed[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  return saved
}

const texts = async (ui: { findAll(q: { type: string }): Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(x => x.text)

test("the scout's page lists its runs, newest first, and opening one shows its full report", async ($, on) => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: '2026-11-12T00:00:00.000Z', outcome: 'found', findings: 2, report: '.symcc/reports/scouts/bugs-old.md' },
    { started: null, ended: LAST_RUN, outcome: 'nothing', findings: 0, report: '.symcc/reports/scouts/bugs-new.md' },
  ]
  const task = { id: 'T-7', title: 'Fix the crash', details: '', files: [], status: 'todo', note: '', order: 7, after: [], attempts: 0, history: [], branch: null, created_at: '2026-11-12T01:00:00.000Z', updated_at: '', origin: { by: 'scout', scout: 'bugs', why: 'it crashes', at: '' } }
  page(on, { '/.symcc/scouts/bugs.runs.json': scoutRunsText(runs), '/.symcc/reports/scouts/bugs-old.md': '1. The parser crashes.\n2. The whole old report.\n', '/.symcc/reports/scouts/bugs-new.md': 'NOTHING\n' }, [task])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^▍Runs$/ })).toBeDefined()
  // T-516: no report text on the scout's page (no "Last report" section); a hint says how to see a run's report
  const heads = (await ui.findAll({ type: 'Text', text: /^▍/ })).map(x => x.text)
  expect(heads).toEqual(['▍Instructions', '▍Runs', '▍Results', '▍File'])
  expect(await ui.find({ type: 'Text', text: /Old crash/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /The parser crashes/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^  Enter on a run shows its report$/ })).toBeDefined()
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

/** The panel on scout bugs's page with two runs, both report files saved; answers the values the panel saved. */
function twoRuns(on: On) {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: OLD_ENDED, outcome: 'found', findings: 2, report: '.symcc/reports/scouts/bugs-old.md' },
    { started: null, ended: LAST_RUN, outcome: 'nothing', findings: 0, report: '.symcc/reports/scouts/bugs-new.md' },
  ]
  return page(on, { '/.symcc/scouts/bugs.runs.json': scoutRunsText(runs), '/.symcc/reports/scouts/bugs-old.md': '1. The parser crashes.\n', '/.symcc/reports/scouts/bugs-new.md': 'NOTHING\n' })
}
const OLD_ENDED = '2026-11-12T00:00:00.000Z'

// The open run is kept in the panel's saved scout value, next to the open scout (scoutPlace), not in the plugin's
// memory: so the code that leaves the scout's page (its Back, the tabs, resetPane, Esc's steps, the panel closing in
// forgetPane) sets that one value and closes the run too.
test("the open run is kept in the panel's saved scout value, next to the open scout; Back keeps only the scout", async ($, on) => {
  const saved = twoRuns(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: `scout-run:${OLD_ENDED}` })
  await ui.redraw()
  expect(saved.scout).toBe(scoutPlaceValue('bugs', OLD_ENDED))
  expect(scoutPlace(String(saved.scout))).toEqual({ scout: 'bugs', run: OLD_ENDED })
  expect(await ui.find({ type: 'Text', text: /^▍Report$/ })).toBeDefined()
  await ui.press({ key: 'scout-run-back' })
  await ui.redraw()
  expect(saved.scout).toBe('bugs')
  expect(await ui.find({ type: 'Text', text: /^▍Runs$/ })).toBeDefined()
  await ui.unmount()
})

test('resetPane with a view closes the open run with the open scout; without one, the run page stays', async () => {
  const { host, panel } = fakeHost()
  await panel.updateScoutOpen(() => scoutPlaceValue('bugs', LAST_RUN))
  await resetPane(host) // only the opened task changes
  expect(scoutPlace(await panel.readScoutOpen())).toEqual({ scout: 'bugs', run: LAST_RUN })
  await resetPane(host, 'scouts') // the tabs, Esc's "scouts list" step, opening the panel
  expect(scoutPlace(await panel.readScoutOpen())).toEqual({ scout: '', run: '' })
  expect(scoutPlace('bugs')).toEqual({ scout: 'bugs', run: '' })
  expect(scoutPlaceValue('bugs')).toBe('bugs')
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

// ---------------- tasks saved in their run ----------------

test("a task the lead adds from a scout's finding is saved in that scout's latest reported run, and stays there once archived", async () => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: '2026-11-10T00:00:00.000Z', outcome: 'found', findings: 1, tasks: [] },
    { started: null, ended: '2026-11-11T00:00:00.000Z', outcome: 'error', findings: 0 },
  ]
  const w = world({ [RUNS]: scoutRunsText(runs) })
  scoutState.clear()
  scoutRuns.clear()
  const said = await runTool(w.$, 'add', { title: 'Fix the crash', details: 'x', why: 'the parser crashes', origin_by: 'scout', scout: 'bugs' } as never)
  expect(said).toMatch(/^added T-1 /)
  const saved = w.runs()
  expect(saved[0]!.tasks).toEqual(['T-1'])
  // the error run reported nothing: no task goes there
  expect(saved[1]!.tasks).toBeUndefined()
  // a task from someone else is not linked
  await runTool(w.$, 'add', { title: 'Other', details: 'x', why: 'mine', origin_by: 'lead' } as never)
  expect(w.runs()[0]!.tasks).toEqual(['T-1'])
  // archived (not on the board any more): the run still lists it
  expect(scoutRunTasks(w.runs(), [], 'bugs')).toEqual([['T-1'], []])
})

// T-712: the lead gave the scout's agent name ("symcc-scout-test-gaps"), which is what the scout's message comes from
const GAPS_RUNS = `${ROOT}/.symcc/scouts/test-gaps.runs.json`
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const boardTasks = (files: Map<string, string>) => JSON.parse(files.get(BOARD)!).tasks as { id: string; origin?: { scout?: string; evidence?: string } }[]

test("an add with a scout's agent name stores the scout's name, gets its report as evidence and is saved in its run", async () => {
  const runs: ScoutRunRecord[] = [{ started: null, ended: ago(2), outcome: 'found', findings: 1, tasks: [] }]
  const w = world({ [GAPS_RUNS]: scoutRunsText(runs) })
  scoutState.clear()
  scoutRuns.clear()
  const at = ago(2)
  heard.scouts['test-gaps'] = at
  const said = await runTool(w.$, 'add', { title: 'Test the parser', details: 'x', why: 'no tests', origin_by: 'scout', scout: 'symcc-scout-test-gaps' } as never)
  expect(said).toMatch(/^added T-1 /)
  const o = boardTasks(w.files)[0]!.origin!
  expect(o.scout).toBe('test-gaps')
  expect(o.evidence).toBe(`scout test-gaps report at ${utcTime(at)}`)
  expect(parseScoutRuns(w.files.get(GAPS_RUNS))[0]!.tasks).toEqual(['T-1'])
  // nothing was saved under the agent name
  expect(w.files.has(`${ROOT}/.symcc/scouts/symcc-scout-test-gaps.runs.json`)).toBe(false)
})

test('an add from a scout that is not on the board is refused, naming the scouts there', async () => {
  const w = world({ [GAPS_RUNS]: scoutRunsText([]) })
  let err = ''
  await runTool(w.$, 'add', { title: 'x', details: 'x', why: 'y', origin_by: 'scout', scout: 'symcc-scout-nope' } as never).catch((e: Error) => (err = e.message))
  expect(err).toContain('there is no scout "nope"')
  expect(err).toContain('the scouts are: bugs')
  expect(boardTasks(w.files)).toEqual([])
})

test('the migration renames scout agent names in old origins (board and parts files), links each task to its run, and does nothing twice', async () => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: ago(50), outcome: 'found', findings: 1, tasks: [] },
    { started: null, ended: ago(30), outcome: 'found', findings: 1, tasks: ['T-9'] },
    { started: null, ended: ago(20), outcome: 'error', findings: 0 },
  ]
  const origin = (scout: string, at: string) => ({ by: 'scout', scout, why: 'w', at })
  const task = (id: string, status: string, scout: string, at: string) => ({ id, title: id, details: '', status, order: 1, after: [], files: [], attempts: 0, history: [], created_at: at, updated_at: at, merge_into: 'main', origin: origin(scout, at) })
  const board = { ...emptyBoard(), mode: 'auto', tasks: [task('T-1', 'done', 'symcc-scout-test-gaps', ago(40)), task('T-2', 'todo', 'symcc-scout-test-gaps', ago(10)), task('T-3', 'todo', 'bugs', ago(10))] }
  const w = world({ [GAPS_RUNS]: scoutRunsText(runs), [BOARD]: JSON.stringify(board) })
  expect((await migrateScoutOrigins(w.$)).sort()).toEqual(['T-1', 'T-2'])
  const b = await load(w.$)
  expect(b.tasks.map(t => t.origin?.scout)).toEqual(['test-gaps', 'test-gaps', 'bugs'])
  // the done task's origin lives in its parts file
  const parts = [...w.files.keys()].filter(k => k.startsWith(`${ROOT}/.symcc/tasks/`))
  expect(parts.some(k => w.files.get(k)!.includes('"scout": "test-gaps"') || w.files.get(k)!.includes('"scout":"test-gaps"'))).toBe(true)
  expect(parseScoutRuns(w.files.get(GAPS_RUNS)).map(r => r.tasks)).toEqual([['T-1'], ['T-2', 'T-9'], undefined])
  const before = new Map(w.files)
  expect(await migrateScoutOrigins(w.$)).toEqual([])
  expect([...w.files.entries()]).toEqual([...before.entries()])
})

test('the migration also renames scout agent names in archive.json, so the Results line counts them under the scout', async () => {
  const runs: ScoutRunRecord[] = [{ started: null, ended: ago(50), outcome: 'found', findings: 1, tasks: [] }]
  const at = ago(40)
  const t = { id: 'T-1', title: 't', details: '', status: 'done', order: 1, after: [], files: [], attempts: 0, history: [], created_at: at, updated_at: at, merge_into: 'main', origin: { by: 'scout', scout: 'symcc-scout-test-gaps', why: 'w', at } }
  const ARCHIVE = `${ROOT}/.symcc/archive.json`
  const w = world({ [GAPS_RUNS]: scoutRunsText(runs), [ARCHIVE]: JSON.stringify({ version: 1, tasks: [t] }) })
  expect(await migrateScoutOrigins(w.$)).toEqual(['T-1'])
  expect(w.files.get(ARCHIVE)!.includes('symcc-scout-test-gaps')).toBe(false)
  expect(w.files.get(ARCHIVE)!.includes('test-gaps')).toBe(true)
  expect(parseScoutRuns(w.files.get(GAPS_RUNS))[0]!.tasks).toEqual(['T-1'])
  const results = await loadScoutResults(w.$, ['test-gaps', 'symcc-scout-test-gaps'], [], Date.now())
  expect(results['test-gaps']).toContain('1 task')
  expect(results['symcc-scout-test-gaps']).not.toContain('1 task')
  const before = new Map(w.files)
  expect(await migrateScoutOrigins(w.$)).toEqual([])
  expect([...w.files.entries()]).toEqual([...before.entries()])
})

// a scout's agent name is not always "symcc-scout-" + its name: "." becomes "-" and the whole name is cut to 64 characters
const LONG = 'a'.repeat(60)
const odd = (name: string) => `${ROOT}/.symcc/scouts/${name}.runs.json`
/** Lets the world's in-memory files be listed by folder (the fake's list gives nothing), as a real scouts folder is. */
function listable(w: ReturnType<typeof world>) {
  ;(w.$.fs as { list: unknown }).list = async (dir: string) =>
    [...w.files.keys()].filter(k => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/')).map(k => ({ name: k.slice(dir.length + 1), kind: 'file' }))
  return w
}

test('an add with the agent name of scout "deps.v2" or of a long-named scout stores that scout and links its run', async () => {
  const run = (): ScoutRunRecord[] => [{ started: null, ended: ago(2), outcome: 'found', findings: 1, tasks: [] }]
  const w = listable(world({ [odd('deps.v2')]: scoutRunsText(run()), [odd(LONG)]: scoutRunsText(run()) }))
  scoutState.clear()
  scoutRuns.clear()
  await runTool(w.$, 'add', { title: 'a', details: 'x', why: 'y', origin_by: 'scout', scout: 'symcc-scout-deps-v2' } as never)
  await runTool(w.$, 'add', { title: 'b', details: 'x', why: 'y', origin_by: 'scout', scout: `symcc-scout-${'a'.repeat(52)}` } as never)
  expect(boardTasks(w.files).map(t => t.origin!.scout)).toEqual(['deps.v2', LONG])
  expect(parseScoutRuns(w.files.get(odd('deps.v2')))[0]!.tasks).toEqual(['T-1'])
  expect(parseScoutRuns(w.files.get(odd(LONG)))[0]!.tasks).toEqual(['T-2'])
})

test('the migration maps an old agent name "symcc-scout-deps-v2" back to scout "deps.v2" and links its run', async () => {
  const runs: ScoutRunRecord[] = [{ started: null, ended: ago(2), outcome: 'found', findings: 1, tasks: [] }]
  const at = ago(1)
  const t = { id: 'T-1', title: 't', details: '', status: 'todo', order: 1, after: [], files: [], attempts: 0, history: [], created_at: at, updated_at: at, merge_into: 'main', origin: { by: 'scout', scout: 'symcc-scout-deps-v2', why: 'w', at } }
  const w = listable(world({ [odd('deps.v2')]: scoutRunsText(runs), [BOARD]: JSON.stringify({ ...emptyBoard(), mode: 'auto', tasks: [t] }) }))
  scoutState.clear()
  expect(await migrateScoutOrigins(w.$)).toEqual(['T-1'])
  expect((await load(w.$)).tasks[0]!.origin?.scout).toBe('deps.v2')
  expect(parseScoutRuns(w.files.get(odd('deps.v2')))[0]!.tasks).toEqual(['T-1'])
  expect(await migrateScoutOrigins(w.$)).toEqual([])
})

test('a run recorded before tasks were saved gets its tasks from the board; linking a new one keeps them', () => {
  const from = (scout: string) => ({ by: 'scout' as const, scout, why: 'x', at: '' })
  const old: ScoutRunRecord[] = [{ started: null, ended: '2026-11-10T00:00:00.000Z', outcome: 'found', findings: 2 }]
  const board = [{ id: 'T-1', created_at: '2026-11-10T01:00:00.000Z', origin: from('bugs') }]
  const next = linkScoutRunTask(old, 'T-2', 'bugs', [...board, { id: 'T-2', created_at: '2026-11-10T02:00:00.000Z', origin: from('bugs') }])!
  expect(next[0]!.tasks).toEqual(['T-1', 'T-2'])
  // a saved run never takes board tasks it did not save
  expect(scoutRunTasks([{ ...old[0]!, tasks: [] }], board, 'bugs')).toEqual([[]])
  expect(linkScoutRunTask([{ started: null, ended: old[0]!.ended, outcome: 'error', findings: 0 }], 'T-3', 'bugs', [])).toBeNull()
})

// ---------------- the scout's page in VS Code ----------------

test("the scout's page in VS Code lists its runs as links (no Buttons), opens one's full report and goes back", async ($, on) => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: '2026-11-12T00:00:00.000Z', outcome: 'found', findings: 2, report: '.symcc/reports/scouts/bugs-old.md', tasks: ['T-7'] },
    { started: null, ended: LAST_RUN, outcome: 'nothing', findings: 0, report: '.symcc/reports/scouts/bugs-new.md', tasks: [] },
  ]
  page(on, { '/.symcc/scouts/bugs.runs.json': scoutRunsText(runs), '/.symcc/reports/scouts/bugs-old.md': '1. The parser crashes.\n2. The whole old report.\n', '/.symcc/reports/scouts/bugs-new.md': 'NOTHING\n' })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ key: 'vs-sec-runs' })).toBeDefined()
  // T-516: no "Last report" section and no report text on the page itself; a hint says how to see a run's report
  expect(await ui.find({ key: 'vs-sec-report' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Markdown' })).filter(m => /Old crash|The parser crashes/.test(String(m.props.text)))).toEqual([])
  expect(await ui.find({ type: 'Text', text: /^Click a run to see its report$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith('scout-run:'))).toEqual([])
  const rows = (await ui.findAll({ type: 'Markdown' })).filter(b => String(b.props.key).startsWith('scout-run:'))
  expect(rows.map(b => String(b.props.key))).toEqual([`scout-run:${LAST_RUN}`, 'scout-run:2026-11-12T00:00:00.000Z'])
  expect(rows.map(b => b.props.pressableLinks)).toEqual([[vsHref('run', LAST_RUN)], [vsHref('run', '2026-11-12T00:00:00.000Z')]])
  const all = [...(await texts(ui)), ...rows.map(b => String(b.props.text))]
  // whole, wrapped lines (the run's time the link, what it found the line under it); no key hints
  expect(all.some(t => /^found · 2 findings · task T-7$/.test(t))).toBe(true)
  expect(all.some(t => /^nothing · 0 findings · no tasks$/.test(t))).toBe(true)
  expect(all.filter(t => t.includes('…') || /\[[a-z]\]:/.test(t))).toEqual([])
  expect(all.some(t => /so nothing was reported/.test(t))).toBe(false)
  await ui.press({ key: 'scout-run:2026-11-12T00:00:00.000Z', link: { href: vsHref('run', '2026-11-12T00:00:00.000Z') } })
  expect((await ui.find({ key: 'scout-run-back' }))?.props.label).toBe('← bugs')
  expect(String((await ui.find({ key: 'vs-run-report-md' }))?.props.text)).toContain('The whole old report')
  expect(await ui.find({ type: 'Text', text: '.symcc/reports/scouts/bugs-old.md' })).toBeDefined()
  await ui.press({ key: 'scout-run-back' })
  expect(await ui.find({ key: 'vs-sec-runs' })).toBeDefined()
  expect(await ui.find({ key: 'vs-run-report-md' })).toBeUndefined()
  await ui.unmount()
})

test("the scout's page in VS Code says when its last run ended on an API error, so nothing was reported", async ($, on) => {
  const runs: ScoutRunRecord[] = [
    { started: null, ended: '2026-11-12T00:00:00.000Z', outcome: 'found', findings: 1, report: '.symcc/reports/scouts/bugs-old.md', tasks: [] },
    { started: null, ended: LAST_RUN, outcome: 'error', findings: 0 },
  ]
  page(on, { '/.symcc/scouts/bugs.runs.json': scoutRunsText(runs) })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const note = await ui.find({ type: 'Text', text: /^Its last run ended on an API error, so nothing was reported\.$/ })
  expect(note, 'note').toBeDefined()
  // in the error color: the same as the API error run's line
  const errRow = (await ui.findAll({ type: 'Text' })).find(t => /^API error · 0 findings · no tasks$/.test(t.text))
  expect(errRow, 'run line').toBeDefined()
  expect(note?.props.color, 'color').toBe(errRow!.props.color)
  expect((await ui.findAll({ type: 'Text' })).find(t => /^found · 1 finding · no tasks$/.test(t.text))?.props.color).not.toBe(errRow!.props.color)
  await ui.unmount()
})


// ---------------- the scout's results (T-622) ----------------

const WEEK = /^ {0,2}last 7 days: .* · 2k scout tokens · .* per merged$/
const ALL = /^ {0,2}in all: 2 tasks \(1 merged, 0 dropped, 1 open\) · 2k scout tokens · 5k per merged$/

/** Scout bugs with one merged task (3k tokens) and one open, and 2k tokens of its own in scouts.json. */
function resultsPage(on: On) {
  // dates relative to now, so the run and the merged task stay inside "last 7 days"
  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
  const run = ago(24)
  const t = (id: string, status: string, runs: unknown[] = []) => ({ id, title: id, details: '', files: [], status, note: '', order: 1, after: [], attempts: runs.length, history: [], branch: null, created_at: ago(23), updated_at: ago(22), runs, origin: { by: 'scout', scout: 'bugs', why: '', at: '' } })
  const tasks = [t('T-7', 'done', [{ started: ago(23), ended: ago(22.5), agents: [{ kind: 'worker' as const, started: ago(23), ended: ago(22.5), tokens: { input: 3000 } }] }]), t('T-8', 'todo')]
  const memory = addScoutRun(null, 'bugs', { endMs: Date.parse(run), ms: 60_000, tokens: { input: 2000 } })
  page(on, { '/.symcc/scouts/bugs.runs.json': scoutRunsText([{ started: null, ended: run, outcome: 'found', findings: 2, tasks: ['T-7', 'T-8'] }]), '/.symcc/scouts.json': memory }, tasks)
}

test("T-686: the scout's page keeps the Results figures out of its header, in their own section right before File", async ($, on) => {
  resultsPage(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const all = await texts(ui)
  const inst = all.indexOf('▍Instructions')
  const res = all.indexOf('▍Results')
  expect(inst > 0 && res > inst).toBe(true)
  // the header (before Instructions): no first line of the instructions, no Results figures
  const head = all.slice(0, inst)
  expect(head.some(x => x.includes('Look for crashes.') || x.includes('last 7 days') || x.includes('in all:') || x.startsWith('Results'))).toBe(false)
  // the Results section: its heading, the last 7 days, in all, and then File
  expect(WEEK.test(all[res + 1]!)).toBe(true)
  expect(ALL.test(all[res + 2]!)).toBe(true)
  expect(all[res + 3]).toBe('▍File')
  expect(all.filter(x => x.includes('last 7 days')).length).toBe(1)
  await ui.unmount()
})

test("T-686: the scout's page in VS Code has the same Results section right before File, and none in its header", async ($, on) => {
  resultsPage(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const all = await texts(ui)
  const inst = all.indexOf('Instructions')
  const res = all.indexOf('Results')
  expect(inst > 0 && res > inst).toBe(true)
  expect(all.slice(0, inst).some(x => x.includes('Look for crashes.') || x.includes('last 7 days') || x.includes('in all:'))).toBe(false)
  expect(WEEK.test(all[res + 1]!)).toBe(true)
  expect(ALL.test(all[res + 2]!)).toBe(true)
  expect(all[res + 3]).toBe('File')
  await ui.unmount()
})

