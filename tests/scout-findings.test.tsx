import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { ICON } from '../hooks/name'
import { applySettings, emptyBoard, findingToBacklog, parseSettingsCommand, readBoard, settingValue } from '../hooks/board'
import { inProject } from './project'
import { ran, readText } from './fakes'

/** A fake board.json: a save (write to a temp file, then mv over it) is kept, so the next read sees it. */
function setup(on: On, board: Record<string, unknown>) {
  const files: Record<string, string | null> = { '/board.json': JSON.stringify(board), '/board.lock': null, '/scouts.json': null, '/scouts/bugs.md': '---\nevery_minutes: 30\n---\nLook for crashes.\n' }
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  const temp: Record<string, string> = {}
  on('fs.write', (_, e) => {
    const f = fileOf(e.path)
    if (f) files[f] = String(e.text)
    else temp[e.path] = String(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv?: string[] }).argv ?? []
    const [src, dest] = argv.slice(-2)
    if (argv[0] === 'mv' && src! in temp && fileOf(dest!)) files[fileOf(dest!)!] = temp[src!]!
    return { value: ran() }
  })
  // the project folder (tool calls need it, see findRoot)
  inProject(on)
  mock.clock(on, { now: Date.now() })
  return files
}

const call = async ($: { tool: { call(a: never): Promise<unknown> } }, tool: string, args: Record<string, unknown>) => {
  const r = (await $.tool.call({ tool: `mcp__symcc__${tool}`, ...args } as never)) as { result?: string } | string
  return String(typeof r === 'string' ? r : r?.result ?? '')
}

const statusOf = (files: Record<string, string | null>, id: string) => JSON.parse(files['/board.json']!).tasks.find((t: { id: string }) => t.id === id)?.status

const scoutAdd = (title: string) => ({ title, details: 'd', why: 'a scout saw it', origin_by: 'scout', scout: 'bugs' })

test('scout_findings: auto by default, backlog only for scout-origin tasks; bad values get the default', () => {
  expect(settingValue(emptyBoard(), 'scout_findings')).toBe('auto')
  expect(findingToBacklog(emptyBoard(), 'scout')).toBe(false)
  const { board, changes } = applySettings(emptyBoard(), { scout_findings: 'backlog' })
  expect(settingValue(board, 'scout_findings')).toBe('backlog')
  expect(changes[0]?.name).toBe('scout_findings')
  expect(findingToBacklog(board, 'scout')).toBe(true)
  expect(findingToBacklog(board, 'owner')).toBe(false)
  expect(findingToBacklog(board, 'lead')).toBe(false)
  expect(applySettings(emptyBoard(), { scout_findings: 'never' }).changes).toEqual([])
  const r = readBoard(JSON.stringify({ tasks: [], scout_findings: 'sometimes' }))
  expect(r.fixed).toContain('scout_findings')
  expect(settingValue(r.board, 'scout_findings')).toBe('auto')
  expect(parseSettingsCommand('scout_findings backlog')).toEqual({ kind: 'set', setting: 'scout_findings', input: { scout_findings: 'backlog' } })
  expect(parseSettingsCommand('scout_findings maybe').kind).toBe('bad')
})

test('default auto: a scout-origin add goes to todo as today', async ($, on) => {
  const files = setup(on, { tasks: [] })
  const out = await call($, 'add', scoutAdd('Fix the crash'))
  expect(out).toContain('added T-1 Fix the crash')
  expect(out).not.toContain('scout_findings')
  expect(statusOf(files, 'T-1')).toBe('todo')
})

test('backlog: a scout-origin add goes to the backlog and says so; owner and lead adds still go to todo', async ($, on) => {
  const files = setup(on, { tasks: [], scout_findings: 'backlog' })
  const out = await call($, 'add', scoutAdd('Fix the crash'))
  expect(out).toContain('scout_findings is backlog: added to the backlog')
  expect(out).toContain('T-1')
  expect(statusOf(files, 'T-1')).toBe('backlog')
  expect(await call($, 'add', { title: 'Owner wish', details: 'd', why: 'asked', origin_by: 'owner', request: 'do it' })).toContain('added T-2 Owner wish')
  expect(statusOf(files, 'T-2')).toBe('todo')
  expect(await call($, 'add', { title: 'Lead idea', details: 'd', why: 'mine', origin_by: 'lead' })).toContain('added T-3 Lead idea')
  expect(statusOf(files, 'T-3')).toBe('todo')
})

test('the settings tool reads and changes scout_findings', async ($, on) => {
  const files = setup(on, { tasks: [] })
  expect(await call($, 'settings', {})).toMatch(/^scout_findings: auto \(default auto, can be auto \/ backlog\)/m)
  expect(await call($, 'settings', { scout_findings: 'backlog' })).toContain('tasks from scout findings go to the backlog')
  expect(JSON.parse(files['/board.json']!).scout_findings).toBe('backlog')
  expect(await call($, 'settings', {})).toMatch(/^scout_findings: backlog /m)
  expect(await call($, 'settings', { scout_findings: 'maybe' })).toContain('scout_findings must be "auto" or "backlog"')
  expect(JSON.parse(files['/board.json']!).scout_findings).toBe('backlog')
})

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('the Settings view shows scout_findings from the board and Enter opens auto / backlog', async ($, on) => {
  const files = setup(on, { tasks: [], scout_findings: 'backlog' })
  const written = new Set<string>()
  const seed: Record<string, unknown> = { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [], branch: 'main', max_parallel: 3, max_minutes: 45, auto_retries: 2, open_on_start: true, notify: 'off', notify_choices: ['off'], scout_findings: 'backlog' } } }
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-settings' })
  await ui.press({ key: 'group:Scouts' })
  const row = await ui.find({ key: 'setting:scout_findings' })
  expect(row).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ backlog$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /default auto · auto \/ backlog/ })).toBeDefined()
  await ui.press({ key: 'setting:scout_findings' })
  expect(await ui.find({ key: 'pick:auto' })).toBeDefined()
  expect(await ui.find({ key: 'pick:backlog' })).toBeDefined()
  await ui.press({ key: 'pick:auto' })
  expect(JSON.parse(files['/board.json']!).scout_findings).toBe('auto')
  await ui.unmount()
})
