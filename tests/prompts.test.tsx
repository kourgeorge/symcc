// Built-in worker prompts: the prompts in prompts/*.ts with their placeholders filled in. They can't be
// overridden (a .symcc/prompts/<kind>.md file is ignored), the lead has no prompts tool, and Settings has no
// Prompts row: roles are the one place to shape what a worker does.
import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import type { SymccTask } from '../types'
import { addTask, emptyBoard, patchTask, fillPrompt, placeholdersIn, fillRole, ROLE_PLACEHOLDERS, type RoleDef, BUILT_IN_PROMPTS, PROMPT_KINDS, PROMPT_PLACEHOLDERS, type Board } from '../hooks/board'
import { S } from '../hooks/plugin/state'
import { WORKER_PROMPT } from '../hooks/plugin/workers'
import { TOOLS } from '../hooks/plugin/tools'
import { ICON } from '../hooks/name'
import { inProject } from './project'
import { ran, entry } from './fakes'

const ROOT = '/proj'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const ISO = '2026-11-16T00:00:00.000Z'
// symcc's own words name the question tool plainly; Claude Code's (mcp__symcc__ask_owner) come with its host (see app-entry.test.ts)
const ASK = 'To ask the owner something, call the ask_owner tool. If an edit is refused as outside your files, stop and hand back.'
const TEST_RULE = 'Add or update a test that checks your change, unless the change only touches docs (README, docs/, *.md, comments). Say in your report which test covers it.'

/** A board with T-1 doing (files src/), and the test commands given. */
function boardWith(test_commands: string[] = [], extra: Partial<SymccTask> = {}): Board {
  const [b, t] = addTask({ ...emptyBoard(), test_commands }, { origin: { why: 'a test' }, title: 'Do it', details: 'Make it work.', files: ['src/'] }, ISO)
  return patchTask(b, t.id, { status: 'doing', attempts: 1, ...extra }, ISO)
}

/** Starts each test in a project. */
function setup() {
  S.root = ROOT
  S.enabledNow = true
}

test('the built-in prompts are filled in for the task: no placeholder is left, and the change prompt has the test rule', () => {
  setup()
  const b = boardWith(['npm test'], { history: ['created by the lead', 'try 1 failed its tests'] })
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).not.toContain('{{')
  expect(p).toContain('You are a symcc worker. Do exactly this one task, then stop.')
  expect(p).toContain(`own copy of the project on branch symcc/T-1:\n  ${WT}\n`)
  expect(p).toContain('Task T-1: Do it\nMake it work.')
  expect(p).toContain('Files you may change: src/. This is the full list')
  expect(p).toContain('these must pass (run them in that folder to check): npm test')
  expect(p).toContain(TEST_RULE)
  expect(p).toContain("Earlier tries:\n- try 1 failed its tests\nDon't repeat those mistakes.")
  expect(p.endsWith(`what you changed.\n${ASK}`)).toBe(true)
  // the investigation prompt has no test rule and no files list
  const i = boardWith(['npm test'], { kind: 'investigation' } as Partial<SymccTask>)
  const q = WORKER_PROMPT(i.tasks[0]!, i, WT)
  expect(q).not.toContain('{{')
  expect(q).toContain('This task is an investigation')
  expect(q).not.toContain(TEST_RULE)
  expect(q.endsWith(ASK)).toBe(true)
  // every placeholder written in a built-in prompt is one symcc knows
  for (const k of PROMPT_KINDS) for (const p of placeholdersIn(BUILT_IN_PROMPTS[k])) expect(PROMPT_PLACEHOLDERS[k]).toHaveProperty(p)
})

test('several test commands are shown to the worker one per line, each run on its own, not joined with &&', () => {
  setup()
  const b = boardWith(['cd web && npm test', 'npm run lint'])
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).toContain('these must pass; run each one on its own, from your folder:\n  cd web && npm test\n  npm run lint')
  expect(p).not.toContain('npm test && npm run lint')
})

test('placeholders are filled in one pass: "{{files}}" in the task\'s details stays as written', () => {
  setup()
  const b = boardWith([], { details: 'see {{files}} and {{nope}}' })
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).toContain('Task T-1: Do it\nsee {{files}} and {{nope}}')
  expect(fillPrompt('investigation', { details: 'D {{ask}}', ask: 'A' })).toContain('D {{ask}}')
  expect(PROMPT_PLACEHOLDERS.change).toHaveProperty('test_command')
})

test("a role's checklist may use the prompt's placeholders: {{files}} and {{test_command}} come out filled in in the worker's prompt", () => {
  setup()
  const role: RoleDef = { name: 'tester', description: 'writes tests', skills: [], prompt: '- only touch {{files}}\n- run: {{test_command}}\n- {{task_id}} on {{branch}} in {{folder}}\n- left: {{nope}} {{role}} {{ask}}' }
  const b = boardWith(['npm test'])
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT, role)
  expect(p).toContain('Your role: tester\n- only touch Files you may change: src/. This is the full list')
  expect(p).toContain('- run: After you finish, these must pass (run them in that folder to check): npm test')
  expect(p).toContain(`- T-1 on symcc/T-1 in ${WT}`)
  // an unknown {{word}}, and the prompt's own bigger parts, are left as written
  expect(p).toContain('- left: {{nope}} {{role}} {{ask}}')
  expect(fillRole('{{title}} / {{details}}', { title: 'T', details: 'D' })).toBe('T / {{details}}')
  // names every JavaScript object has built in are unknown words too, so they stay as written
  const builtIns = 'a {{constructor}} b {{toString}} c {{__proto__}} d {{hasOwnProperty}}'
  expect(fillRole(builtIns, { files: 'F' })).toBe(builtIns)
  expect(ROLE_PLACEHOLDERS).not.toHaveProperty('role')
})

test('the lead has no prompts tool', () => {
  setup()
  expect(TOOLS().map(t => t.name)).not.toContain('prompts')
})

// ---------------- Settings ----------------

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  surface: 'terminal',
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const VIEW = { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'review', test_commands: [] } }, tab: 'settings' }

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it. */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
}

/** Fake prompt files for the panel: the project's .symcc/prompts (file name -> text); no roles at all. */
function fakePrompts(on: On, mine: Record<string, string>) {
  const where = (p: string): string | null => {
    const m = /\/\.symcc\/prompts(?:\/(.*))?$/.exec(p)
    return m ? m[1] ?? '' : null
  }
  on('fs.exists', (_, e, next) => {
    const w = where(e.path)
    return w !== null ? { value: w === '' || w in mine } : /\/roles$/.test(e.path) ? { value: false } : next(e)
  })
  on('fs.read', (_, e, next) => {
    const w = where(e.path)
    if (w === null) return next(e)
    if (!(w in mine)) throw new Error('no file')
    return { value: mine[w]! }
  })
  on('fs.write', (_, e, next) => {
    const w = where(e.path)
    if (w === null) return next(e)
    mine[w] = String(e.text)
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    const w = argv[0] === 'rm' ? where(argv[argv.length - 1]!) : null
    if (w) delete mine[w]
    return { value: ran() }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/proj' } }) as never)
  inProject(on)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  mock.clock(on, { now: 1_800_000_000_000 })
}

test('Settings has no Prompts row, even with a .symcc/prompts/change.md file', async ($, on) => {
  stateOf(on, VIEW)
  fakePrompts(on, { 'change.md': 'Mine: {{details}}' })
  await $.session.start({ cwd: '/proj' } as never)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'group:Work' })
  await ui.press({ key: 'group:Workers' })
  expect(await ui.find({ key: 'setting:mode' })).toBeDefined()
  expect(await ui.find({ key: 'settings-roles' })).toBeDefined()
  expect(await ui.find({ key: 'settings-prompts' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Prompts/ })).toBeUndefined()
  await ui.unmount()
})
