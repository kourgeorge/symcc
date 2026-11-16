// Editable worker prompts (T-286): the built-in prompts with their placeholders filled in, the owner's
// .symcc/prompts/<kind>.md over them, reset, the warning for a missing {{ask}}, the lead's prompts tool and
// the Prompts page in Settings.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { SymccTask } from '../types'
import { addTask, emptyBoard, patchTask, fillPrompt, promptProblems, BUILT_IN_PROMPTS, PROMPT_PLACEHOLDERS, type Board } from '../hooks/board'
import { S, leadQueue, warnedPrompts } from '../hooks/plugin/state'
import { loadPrompts } from '../hooks/plugin/prompts'
import { WORKER_PROMPT } from '../hooks/plugin/workers'
import { runTool } from '../hooks/plugin/tools'
import { ICON } from '../hooks/name'
import { inProject } from './project'

const ROOT = '/proj'
const MINE = `${ROOT}/.symcc/prompts`
const WT = `${ROOT}/.symcc/worktrees/T-1`
const ISO = '2026-11-16T00:00:00.000Z'
const ASK = 'To ask the owner something, call the mcp__symcc__ask_owner tool. If an edit is refused as outside your files, stop and hand back.'
const TEST_RULE = 'Add or update a test that checks your change, unless the change only touches docs (README, docs/, *.md, comments). Say in your report which test covers it.'

/** A board with T-1 doing (files src/), and the test commands given. */
function boardWith(test_commands: string[] = [], extra: Partial<SymccTask> = {}): Board {
  const [b, t] = addTask({ ...emptyBoard(), test_commands }, { origin: { why: 'a test' }, title: 'Do it', details: 'Make it work.', files: ['src/'] }, ISO)
  return patchTask(b, t.id, { status: 'doing', attempts: 1, ...extra }, ISO)
}

/** A fake $ whose only files are the owner's prompts (`mine`: file name -> text); write and `rm -f` change them. `toasts` and `logged` record what was said. */
function setup(mine: Record<string, string> = {}) {
  const toasts: string[] = []
  const name = (p: string) => (p.startsWith(`${MINE}/`) ? p.slice(MINE.length + 1) : null)
  const $ = {
    plugin: { root: '/plugin' },
    fs: {
      exists: async (p: string) => p === MINE || (name(p) ?? '') in mine,
      list: async () => Object.keys(mine).map(n => ({ name: n, kind: 'file' })),
      read: async (p: string) => {
        const n = name(p)
        if (n === null || !(n in mine)) throw new Error('no file')
        return mine[n]
      },
      write: async (p: string, text: string) => {
        const n = name(p)
        if (n !== null) mine[n] = String(text)
      },
    },
    process: {
      run: async (argv: string[]) => {
        const n = argv[0] === 'rm' ? name(argv[argv.length - 1]!) : null
        if (n !== null) delete mine[n]
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
    ui: { invalidate: () => undefined, toast: (t: string) => void toasts.push(t), log: () => undefined, status: () => undefined },
    clock: { after: () => undefined },
  }
  S.root = ROOT
  S.prompts = {}
  S.enabledNow = true
  leadQueue.splice(0)
  warnedPrompts.clear()
  return { $, mine, toasts }
}

const call = async ($: unknown, args: Record<string, unknown>) => String(await runTool($ as never, 'prompts', args as never))

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
  for (const k of ['change', 'investigation'] as const) expect(promptProblems(k, BUILT_IN_PROMPTS[k])).toEqual([])
})

test('placeholders are filled in one pass: "{{files}}" in the task\'s details stays as written', () => {
  const out = fillPrompt('change', 'A {{details}} B {{ask}}', { details: 'see {{files}}', files: 'NO', ask: 'ASK' })
  expect(out).toBe('A see {{files}} B ASK')
  // an unknown placeholder is left as written and named as a problem
  expect(fillPrompt('change', '{{details}} {{nope}} {{ask}}', { details: 'd', ask: 'a' })).toBe('d {{nope}} a')
  expect(promptProblems('change', '{{details}} {{nope}} {{ask}}')).toEqual(['{{nope}} is not a placeholder of the change prompt: it is left as written'])
  expect(PROMPT_PLACEHOLDERS.change).toHaveProperty('test_command')
})

test("the owner's .symcc/prompts/change.md is used instead of the built-in one; reset brings the built-in back", async () => {
  const { $, mine } = setup({ 'change.md': 'Mine: {{task_id}} in {{folder}}.\n{{details}}\nTests: {{test_command}}\n{{ask}}\n' })
  await loadPrompts($ as never)
  const b = boardWith(['npm test'])
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).toBe(`Mine: T-1 in ${WT}.\nMake it work.\nTests: After you finish, these must pass (run them in that folder to check): npm test\n${ASK}`)
  expect(p).not.toContain(TEST_RULE)
  // the investigation prompt is still the built-in one
  const i = boardWith([], { kind: 'investigation' } as Partial<SymccTask>)
  expect(WORKER_PROMPT(i.tasks[0]!, i, WT)).toContain('This task is an investigation')
  expect(await call($, { action: 'reset', name: 'change' })).toContain('the change prompt is the built-in one again')
  expect('change.md' in mine).toBe(false)
  expect(WORKER_PROMPT(b.tasks[0]!, b, WT)).toContain(TEST_RULE)
  expect(await call($, { action: 'reset', name: 'change' })).toContain('already the built-in one')
})

test('a prompt file without {{ask}} is warned about once (owner and lead), and the ask line is still added at the end', async () => {
  const { $, toasts } = setup({ 'change.md': 'Do {{task_id}}: {{details}}\n' })
  await loadPrompts($ as never)
  expect(toasts.join('\n')).toContain('.symcc/prompts/change.md: {{ask}} is missing')
  expect(leadQueue.join('\n')).toContain("The owner's worker prompt .symcc/prompts/change.md: {{ask}} is missing")
  const b = boardWith()
  expect(WORKER_PROMPT(b.tasks[0]!, b, WT)).toBe(`Do T-1: Make it work.\n${ASK}`)
  // read again with the same text: no second warning
  await loadPrompts($ as never)
  expect(toasts.length).toBe(1)
  // {{details}} missing too: the task is added at the end
  const out = fillPrompt('change', 'Hello.', { task_id: 'T-9', title: 'T', details: 'D', ask: 'A' })
  expect(out).toBe('Hello.\n\nTask T-9: T\nD\nA')
  // an empty file: the built-in prompt is used, with a warning
  expect(promptProblems('change', '  \n')).toEqual(['the file is empty, so the built-in prompt is used'])
  expect(fillPrompt('change', '', { ask: 'A' })).toContain('Add or update a test')
})

test("the lead's prompts tool lists both, shows one in full, edits (with text or as a copy) and refuses bad input", async () => {
  const { $, mine } = setup()
  const list = await call($, {})
  expect(list).toContain('- change (built-in):')
  expect(list).toContain('- investigation (built-in):')
  const one = await call($, { action: 'list', name: 'change' })
  expect(one).toContain('{{test_command}}:')
  expect(one).toContain(TEST_RULE)
  expect(one).toContain('edit copies it to .symcc/prompts/change.md')
  // edit with no text copies the prompt as it is now to the owner's file
  expect(await call($, { action: 'edit', name: 'investigation' })).toContain('copied the investigation prompt to .symcc/prompts/investigation.md')
  expect(mine['investigation.md']).toBe(BUILT_IN_PROMPTS.investigation)
  // edit with text saves it, and says what is wrong with it
  const saved = await call($, { action: 'edit', name: 'change', text: 'Only {{details}}' })
  expect(saved).toContain('saved the change prompt (.symcc/prompts/change.md)')
  expect(saved).toContain('{{ask}} is missing')
  expect(saved).toContain('it counts from the next worker on')
  expect(mine['change.md']).toBe('Only {{details}}\n')
  expect(await call($, {})).toContain('- change (yours: .symcc/prompts/change.md)')
  expect(await call($, { action: 'edit', name: 'change', text: '  ' })).toContain('text is empty')
  expect(await call($, { action: 'edit', name: '../x' })).toContain('no prompt named ../x')
  expect(await call($, { action: 'edit' })).toContain('say which prompt to edit')
  expect(await call($, { action: 'drop', name: 'change' })).toContain('unknown action')
  expect(Object.keys(mine).sort()).toEqual(['change.md', 'investigation.md'])
})

// ---------------- the Prompts page ----------------

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
    return { value: mine[w] }
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
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
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

test('Settings has a Prompts row; its page lists both prompts, opens one, edits it into .symcc/prompts/ and resets it', async ($, on) => {
  stateOf(on, VIEW)
  const mine: Record<string, string> = {}
  fakePrompts(on, mine)
  await $.session.start({ cwd: '/proj' } as never)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'settings-prompts' }))?.props.label).toBe('Prompts: built-in')
  await ui.press({ key: 'settings-prompts' })
  expect((await ui.find({ key: 'promptRow:change' }))?.props.label).toBe('change: built-in')
  expect((await ui.find({ key: 'promptRow:investigation' }))?.props.label).toBe('investigation: built-in')
  await ui.press({ key: 'promptRow:change' })
  expect(await ui.find({ type: 'Text', text: /Add or update a test that checks your change/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\{\{test_command\}\}$/ })).toBeDefined()
  expect(await ui.find({ key: 'prompt-reset' })).toBeUndefined()
  // Edit, change the text, Save: the owner's file is written
  await ui.press({ key: 'prompt-edit' })
  expect(await ui.find({ type: 'Text', text: /save writes \.symcc\/prompts\/change\.md/ })).toBeDefined()
  await ui.input({ key: 'prompt-text', text: 'Mine: {{details}}', kind: 'change' })
  await ui.press({ key: 'prompt-save' })
  expect(mine['change.md']).toBe('Mine: {{details}}\n')
  // back on its page: yours, the warning about {{ask}}, and Reset to built-in
  expect(await ui.find({ type: 'Text', text: /\{\{ask\}\} is missing/ })).toBeDefined()
  await ui.press({ key: 'prompt-reset' })
  expect('change.md' in mine).toBe(false)
  expect(await ui.find({ key: 'prompt-reset' })).toBeUndefined()
  await ui.press({ key: 'prompt-back' })
  expect((await ui.find({ key: 'promptRow:change' }))?.props.label).toBe('change: built-in')
  await ui.press({ key: 'prompts-back' })
  expect(await ui.find({ key: 'setting:mode' })).toBeDefined()
  await ui.unmount()
})
