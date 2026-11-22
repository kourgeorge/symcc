// Built-in worker prompts: the prompts in prompts/*.ts with their placeholders filled in. They can't be
// overridden (a .symcc/prompts/<kind>.md file is ignored), the lead has no prompts tool, and Settings has no
// Prompts row: roles are the one place to shape what a worker does.
import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import type { SymccTask } from '../types'
import { addTask, emptyBoard, patchTask, fillPrompt, placeholdersIn, fillRole, ROLE_PLACEHOLDERS, type RoleDef, BUILT_IN_PROMPTS, PROMPT_KINDS, scoutPrompt, ROLE_PROMPTS, PROMPT_PLACEHOLDERS, type Board } from '../hooks/board'
import { S } from '../hooks/app/state'
import { WORKER_PROMPT } from '../hooks/app/workers'
import { LEARNED_ASK } from '../hooks/core/org-mem'
import { checkerPrompt } from '../hooks/core/checker'
import { TOOLS } from '../hooks/app/tools'
import { ICON } from '../hooks/name'
import { inProject } from './project'
import { ran, entry } from './fakes'
import { hist } from './history-fixture'

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

test("T-616: the 'stage' history lines stay out of Earlier tries, so an earlier try's failure is not pushed out", () => {
  setup()
  const step = (text: string) => ({ kind: 'stage', text }) as SymccTask['history'][number]
  const history = [
    ...hist('created by the lead', 'try 1: checker found problems: X broken'),
    step('try 2: checker started'), step('try 2: checker: OK'), step('try 2: waits in the merge queue (place 2)'), step('try 2: tests started'),
    ...hist('try 2: tests failed: Y'),
  ]
  const b = boardWith(['npm test'], { history })
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).toContain('## Earlier tries\n\n| try | how it ended | reason |')
  expect(p).toMatch(/\| 1 \| sent back by the checker \|/)
  expect(p).toContain("Don't repeat those mistakes.")
  expect(p).not.toContain('checker started')
})

test('the built-in prompts are filled in for the task: no placeholder is left, and the change prompt has the test rule', () => {
  setup()
  const b = boardWith(['npm test'], { history: hist('created by the lead', 'try 1: Fixed the parser. → tests failed: 2 failed') })
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).not.toContain('{{')
  expect(p).toContain('You are a symcc worker. Do exactly this one task, then stop.')
  expect(p).toContain(`own copy of the project on branch symcc/T-1:\n  ${WT}\n`)
  expect(p).toContain('# Task T-1 · change · general\n\nKind of task: change')
  expect(p).toContain('## What to do\n\nMake it work.')
  expect(p).toContain('## Files you may change\n\nsrc/. This is the full list')
  expect(p).toContain('These test commands must pass. symcc runs them all, each one on its own from your folder, before merging, and sends you the output if any fail:\n  npm test\n')
  expect(p).toContain(TEST_RULE)
  expect(p).toContain('## Earlier tries\n\n| try | how it ended |')
  // T-656: the main prompt ends at the ask line; the org-mem ask is only added on a host with no debrief
  expect(p.endsWith(`what you changed.\n${ASK}`)).toBe(true)
  expect(WORKER_PROMPT(b.tasks[0]!, b, WT, undefined, '', LEARNED_ASK).endsWith(`what you changed.\n${ASK}\n${LEARNED_ASK}`)).toBe(true)
  // the investigation prompt has no test rule and no files list
  const i = boardWith(['npm test'], { kind: 'investigation' } as Partial<SymccTask>)
  const q = WORKER_PROMPT(i.tasks[0]!, i, WT)
  expect(q).not.toContain('{{')
  expect(q).toContain('This task is an investigation')
  expect(q).not.toContain(TEST_RULE)
  expect(q.endsWith(ASK)).toBe(true)
  expect(WORKER_PROMPT(i.tasks[0]!, i, WT, undefined, '', LEARNED_ASK).endsWith(`${ASK}\n${LEARNED_ASK}`)).toBe(true)
  // T-411: every built-in prompt (and the scout prompt) says to wait for background commands before answering
  const BG = "Don't run long commands in the background. If you do, wait for them to finish before you answer: ending your turn ends your work, so never answer that you will continue later."
  // T-487: the change, investigation and checker prompts also say to run test commands with the longest Bash timeout,
  // since Claude Code moves a command past its 2-minute default into the background on its own
  const BG_TIMEOUT = "Don't run long commands in the background. Run test commands with the Bash tool's longest timeout (timeout: 600000); if one still gets moved to the background, wait for it (read its output until it finishes) before you answer: ending your turn ends your work, so never answer that you will continue later."
  expect(p).toContain(BG_TIMEOUT)
  expect(q).toContain(BG_TIMEOUT)
  for (const k of Object.keys(ROLE_PROMPTS) as (keyof typeof ROLE_PROMPTS)[]) if (k !== 'checker') expect([k, ROLE_PROMPTS[k].includes(BG_TIMEOUT)]).toEqual([k, true])
  expect(Object.keys(ROLE_PROMPTS)).toContain('checker')
  // T-561: the checker never runs the project's tests, so its timeout line is for its own probes
  expect(ROLE_PROMPTS.checker).toContain(BG_TIMEOUT.replace('Run test commands', 'Run your own probes'))
  expect(ROLE_PROMPTS.checker).not.toContain('Run test commands')
  expect(scoutPrompt({ scout: 's', root: ROOT, instructions: 'Go.', open: [] })).toContain(BG)
  // T-456: workers are told to edit with the Edit tool and keep throwaway scripts and notes under .scratch/ (or /tmp); so is the checker
  const SCRATCH = 'Make code changes with the Edit tool; put any throwaway script or note under .scratch/ in your folder (never commit it); /tmp also works.'
  expect(p).toContain(SCRATCH)
  expect(q).toContain(SCRATCH)
  expect(ROLE_PROMPTS.checker).toContain('Put any throwaway script or note under .scratch/ in that folder (never commit it); /tmp also works.')
  // T-625: probe and edit scripts are written with the Write tool, not a here-document in Bash (the guards refuse those)
  const WRITE_SCRIPTS = "Write throwaway scripts (probes, edit scripts) with the Write tool into .scratch/ (or /tmp), then run them in a separate command; don't write them with a here-document in Bash: the guard refuses those when they mention git or paths outside your folder."
  expect(p).toContain(`${SCRATCH}\n${WRITE_SCRIPTS}\n`)
  expect(q).toContain(`${SCRATCH}\n${WRITE_SCRIPTS}\n`)
  const c = checkerPrompt({ name: 'symcc', task_id: 'T-1', title: 'a', details: 'b', branch: 'symcc/T-1', folder: WT, into: 'main', role: '', diff: '(no diff)', changed_files: '  a.ts', tests: '' })
  expect(c).not.toContain('{{')
  // T-626: the checker may have no Write tool at all (Claude Code runs it read-only; on the Node host only with
  // .scratch/, T-474), so it is told to probe with bun -e / node -e by absolute path, and no tool is named
  expect(c).toContain(`/tmp also works.\nProbe with bun -e "…" (or node -e "…") run from /tmp, importing the code by its absolute path in your folder (for example: cd /tmp && bun -e "const m = await import('${WT}/hooks/board.ts'); console.log(m)"); if you need a file, a here-document is fine only when its text has no git command and no path outside your folder (build such words from pieces, like 'gi'+'t').\n`)
  expect(c).not.toContain('file-writing tool')
  expect(c).not.toContain('Write tool')
  // every placeholder written in a built-in prompt is one symcc knows
  for (const k of PROMPT_KINDS) for (const p of placeholdersIn(BUILT_IN_PROMPTS[k])) expect(PROMPT_PLACEHOLDERS[k]).toHaveProperty(p)
})

test('several test commands are shown to the worker one per line, each run on its own, not joined with &&', () => {
  setup()
  const b = boardWith(['cd web && npm test', 'npm run lint'])
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).toContain('before merging, and sends you the output if any fail:\n  cd web && npm test\n  npm run lint\n')
  expect(p).not.toContain('npm test && npm run lint')
})

test('T-526: the worker is told the test commands run once, by symcc before merging: it runs only the tests for what it changed, not the full commands at the end', () => {
  setup()
  const p = WORKER_PROMPT(boardWith(['npm test']).tasks[0]!, boardWith(['npm test']), WT)
  expect(p).toContain('While you work, run only what checks your change: the tests for the files you changed (find the narrowest way the project offers, e.g. one test file), plus the type check if the project has a cheap one.')
  expect(p).toContain(`Don't run the full commands at the end "to be sure"; symcc does that.`)
  expect(p).not.toContain('After you finish, these must pass')
  // with no test commands set, today's wording stays
  const none = boardWith([])
  const q = WORKER_PROMPT(none.tasks[0]!, none, WT)
  expect(q).toContain('There is no test command; keep the change small and correct.')
  expect(q).not.toContain('symcc runs them all')
  expect(q).not.toContain('to be sure')
})

test('placeholders are filled in one pass: "{{files}}" in the task\'s details stays as written', () => {
  setup()
  const b = boardWith([], { details: 'see {{files}} and {{nope}}' })
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).toContain('## What to do\n\nsee {{files}} and {{nope}}')
  expect(fillPrompt('investigation', { details: 'D {{ask}}', ask: 'A' })).toContain('D {{ask}}')
  expect(PROMPT_PLACEHOLDERS.change).toHaveProperty('test_command')
})

test("a role's checklist may use the prompt's placeholders: {{files}} and {{test_command}} come out filled in in the worker's prompt", () => {
  setup()
  const role: RoleDef = { name: 'tester', description: 'writes tests', skills: [], prompt: '- only touch {{files}}\n- run: {{test_command}}\n- {{task_id}} on {{branch}} in {{folder}}\n- left: {{nope}} {{role}} {{ask}}' }
  const b = boardWith(['npm test'])
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT, role)
  expect(p).toContain('## Your role: tester\n- only touch Files you may change: src/. This is the full list')
  expect(p).toContain('- run: These test commands must pass. symcc runs them all, each one on its own from your folder, before merging, and sends you the output if any fail:\n  npm test\n')
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
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seed ? { value: { value: seed[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
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
