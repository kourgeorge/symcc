import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import { SETTING_GROUPS } from '../hooks/board'
import type { On } from 'claude-code'
import { ICON } from '../hooks/name'
import { inProject } from './project'
import { ran, entry } from './fakes'
import { emptyBoard, parseRole } from '../hooks/board'
import { roleChanges, roleListLabel } from '../hooks/core/role-changes'

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it (and redraws). */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  on('state.get', (_, e, next) => (written.has(e.key) ? next(e) : e.key in seed ? { value: { value: seed[e.key], version: 1 } } : e.key === 'tab' ? { value: { value: 'tasks', version: 1 } } : next(e)))
}

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  surface: 'terminal',
  props: { title: `${ICON} symcc board · symcc`, isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const VIEW = { view: { shape: 'view-1', value: { tasks: [], working: [], scouts: [], mode: 'review', test_commands: [] } }, tab: 'settings' }

/**
 * Fake roles folders: `builtIn` is the plugin's roles/ folder, `mine` the project's .symcc/roles (file name -> text).
 * fs.write and `rm -f` change `mine`, so what the panel writes or deletes is seen by the next read.
 * `board`, when given, is the board file's content, read each time.
 */
function fakeRoles(on: On, mine: Record<string, string>, board?: () => unknown) {
  const builtIn: Record<string, string> = {
    'general.md': '---\ndescription: a plain worker\n---\n',
    'tester.md': '---\ndescription: writes tests\nmodel: sonnet\n---\n- cover errors\n',
    'docs.md': '---\ndescription: writes the docs\n---\n- plain words\n',
    'security.md': '---\ndescription: checks for holes\n---\n',
  }
  const where = (p: string): [Record<string, string>, string] | null => {
    const m = /\/\.symcc\/roles(?:\/(.*))?$/.exec(p)
    if (m) return [mine, m[1] ?? '']
    const b = /\/roles(?:\/(.*))?$/.exec(p)
    return b ? [builtIn, b[1] ?? ''] : null
  }
  on('fs.exists', (_, e, next) => {
    if (board && e.path.endsWith('/board.json')) return { value: true }
    const w = where(e.path)
    return w ? { value: w[1] === '' || w[1] in w[0] } : next(e)
  })
  on('fs.list', (_, e, next) => {
    const w = where(e.path)
    return w && w[1] === '' ? { value: Object.keys(w[0]).map(name => entry(name)) } : next(e)
  })
  on('fs.read', (_, e, next) => {
    if (board && e.path.endsWith('/board.json')) return { value: JSON.stringify(board()) }
    const w = where(e.path)
    if (!w) return next(e)
    if (!(w[1] in w[0])) throw new Error('no file')
    return { value: w[0][w[1]]! }
  })
  on('fs.write', (_, e, next) => {
    const w = where(e.path)
    if (!w) return next(e)
    w[0][w[1]] = String(e.text)
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'rm') {
      const w = where(argv[argv.length - 1]!)
      if (w) delete w[0][w[1]]
    }
    return { value: ran() }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  // the session start gives the plugin its project folder (/proj), where .symcc/roles is
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/proj' } }) as never)
  inProject(on)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  mock.clock(on, { now: 1_800_000_000_000 })
  return { builtIn, mine }
}

type Eng = Engine

/** Each test here mounts the panel and opens every Settings group first, many redraws: under a full parallel run
 *  that can take longer than the default 5 seconds, so they get more time (as search.test.tsx's panel tests do). */
const PANEL = { timeoutMs: 20_000 }

/** Starts the session (so the plugin knows its project folder) and mounts the panel on its Settings view, every group open. */
async function settingsOnly($: Eng) {
  await $.session.start({ cwd: '/proj' } as never)
  const ui = await $.ui.mount(PANE)
  for (const g of SETTING_GROUPS) await ui.press({ key: `group:${g.title}` })
  return ui
}

/** Mounts the panel on Settings and opens its Roles page. */
async function settings($: Eng) {
  const ui = await settingsOnly($)
  await ui.press({ key: 'settings-roles' })
  return ui
}

test('Settings shows one Roles row (count and off count), not the roles; it opens the Roles page and Back returns', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { 'mobile.md': '---\ndescription: phone apps\n---\n', 'docs.md': '---\ndescription: writes the docs\noff: true\n---\n' })
  const ui = await settingsOnly($)
  expect((await ui.find({ key: 'settings-roles' }))?.props.label).toBe('Roles: 5 roles · 1 off')
  expect(await ui.find({ key: 'roleRow:general' })).toBeUndefined()
  expect(await ui.find({ key: 'role-new' })).toBeUndefined()
  await ui.press({ key: 'settings-roles' })
  expect(await ui.find({ key: 'roleRow:general' })).toBeDefined()
  expect(await ui.find({ key: 'setting:mode' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Enter open · n new role · ↑↓ move · l t s c views · b back/ })).toBeDefined()
  // a role's Back returns to the Roles page; the Roles page's Back to Settings
  await ui.press({ key: 'roleRow:tester' })
  await ui.press({ key: 'role-back' })
  expect(await ui.find({ key: 'roleRow:tester' })).toBeDefined()
  await ui.press({ key: 'roles-back' })
  expect(await ui.find({ key: 'setting:mode' })).toBeDefined()
  expect(await ui.find({ key: 'roleRow:tester' })).toBeUndefined()
  // switching tabs closes the Roles page
  await ui.press({ key: 'settings-roles' })
  await ui.press({ key: 'tab-key-scouts' })
  await ui.press({ key: 'tab-key-settings' })
  expect(await ui.find({ key: 'setting:mode' })).toBeDefined()
  expect(await ui.find({ key: 'role-back' })).toBeUndefined()
  await ui.unmount()
})

test('Settings lists every role: built-in, replaced, added and off, each with its description', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { 'tester.md': '---\ndescription: my own tests\n---\n- mine\n', 'mobile.md': '---\ndescription: phone apps\n---\n', 'docs.md': '---\ndescription: writes the docs\noff: true\n---\n' })
  const ui = await settings($)
  expect(await ui.find({ type: 'Text', text: 'Roles' })).toBeDefined()
  const label = async (name: string) => (await ui.find({ key: `roleRow:${name}` }))?.props.label
  expect(await label('general')).toBe('general: built-in')
  expect(await label('security')).toBe('security: built-in')
  // T-918: FROM says built-in, changed, added by you or off
  expect(await label('tester')).toBe('tester: changed')
  expect(await label('mobile')).toBe('mobile: added by you')
  expect(await label('docs')).toBe('docs: off')
  expect(await ui.find({ type: 'Text', text: /^my own tests$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^phone apps$/ })).toBeDefined()
  expect(await ui.find({ key: 'role-new' })).toBeDefined()
  await ui.unmount()
})

test('a role opens in full; Turn off and Turn on write its file; general has no Turn off', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, {})
  const ui = await settings($)
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ type: 'Text', text: /^  sonnet$/ })).toBeDefined()
  // the same section names, in the same order, as the edit page's boxes (the description is the subheader)
  expect((await ui.findAll({ type: 'Text', text: /^▍/ })).map(x => x.text)).toEqual(['▍Model', '▍Skills', '▍Tools', '▍Checklist', '▍Placeholders', '▍File'])
  await ui.press({ key: 'role-edit' })
  expect((await ui.findAll({ type: 'Text', text: /^▍/ })).map(x => x.text)).toEqual(['▍Description', '▍Model', '▍Skills', '▍Tools', '▍Writes', '▍Checklist'])
  expect(await ui.find({ type: 'Text', text: /to rename the role, rename \.symcc\/roles\/tester\.md/ })).toBeDefined()
  await ui.press({ key: 'role-edit-cancel' })
  expect(await ui.find({ type: 'Text', text: /cover errors/ })).toBeDefined()
  expect(await ui.find({ key: 'role-reset' })).toBeUndefined()
  expect(await ui.find({ key: 'role-remove' })).toBeUndefined()
  expect((await ui.find({ key: 'role-off' }))?.props.label).toBe('Turn off')
  await ui.press({ key: 'role-off' })
  expect(mine['tester.md']).toContain('off: true')
  expect(mine['tester.md']).toContain('model: sonnet')
  expect((await ui.find({ key: 'role-off' }))?.props.label).toBe('Turn on')
  await ui.press({ key: 'role-off' })
  expect(mine['tester.md']).not.toContain('off: true')
  await ui.press({ key: 'role-back' })
  await ui.press({ key: 'roleRow:general' })
  expect(await ui.find({ key: 'role-off' })).toBeUndefined()
  expect(await ui.find({ key: 'role-edit' })).toBeDefined()
  await ui.unmount()
})

test('Reset shows only for a replaced built-in, Remove only for an added role (after a confirm step)', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, { 'tester.md': '---\ndescription: my own tests\n---\n', 'mobile.md': '---\ndescription: phone apps\n---\n' })
  const ui = await settings($)
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ key: 'role-remove' })).toBeUndefined()
  // T-871: Reset asks first; Cancel keeps the file
  await ui.press({ key: 'role-reset' })
  expect('tester.md' in mine).toBe(true)
  await ui.press({ key: 'role-reset-cancel' })
  expect(await ui.find({ key: 'role-reset-yes' })).toBeUndefined()
  await ui.press({ key: 'role-reset' })
  await ui.press({ key: 'role-reset-yes' })
  expect('tester.md' in mine).toBe(false)
  expect(await ui.find({ key: 'role-reset' })).toBeUndefined()
  await ui.press({ key: 'role-back' })
  expect((await ui.find({ key: 'roleRow:tester' }))?.props.label).toBe('tester: built-in')
  await ui.press({ key: 'roleRow:mobile' })
  expect(await ui.find({ key: 'role-reset' })).toBeUndefined()
  await ui.press({ key: 'role-remove' })
  // nothing is removed until it is confirmed; Cancel leaves it
  expect('mobile.md' in mine).toBe(true)
  await ui.press({ key: 'role-remove-cancel' })
  expect(await ui.find({ key: 'role-remove-yes' })).toBeUndefined()
  await ui.press({ key: 'role-remove' })
  await ui.press({ key: 'role-remove-yes' })
  expect('mobile.md' in mine).toBe(false)
  expect(await ui.find({ key: 'roleRow:mobile' })).toBeUndefined()
  expect(await ui.find({ key: 'roleRow:tester' })).toBeDefined()
  await ui.unmount()
})

test('New role makes .symcc/roles/<name>.md from the template and opens it; Edit on a built-in saves a copy', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, {})
  const ui = await settings($)
  await ui.press({ key: 'role-new' })
  // a bad name stays in the box with the reason
  await ui.input({ key: 'role-new-name', text: '../x' })
  expect(await ui.find({ type: 'Text', text: /not a valid role name/ })).toBeDefined()
  expect(Object.keys(mine)).toEqual([])
  await ui.input({ key: 'role-new-name', text: 'mobile' })
  expect(mine['mobile.md']).toMatch(/^---\ndescription: what this role is for/)
  expect(mine['mobile.md']).toContain('- the first thing')
  // it opens in the edit mode; Save writes what was typed
  expect(await ui.find({ key: 'role-description' })).toBeDefined()
  await ui.input({ key: 'role-description', text: 'phone apps', kind: 'change' })
  await ui.press({ key: 'role-save' })
  expect(mine['mobile.md']).toMatch(/^---\ndescription: phone apps\n/)
  expect((await ui.find({ key: 'role-remove' }))).toBeDefined()
  await ui.press({ key: 'role-back' })
  // Edit on a built-in, then Save: a copy in .symcc/roles, so it shows as replaced
  await ui.press({ key: 'roleRow:docs' })
  await ui.press({ key: 'role-edit' })
  await ui.press({ key: 'role-save' })
  expect(mine['docs.md']).toContain('description: writes the docs')
  await ui.press({ key: 'role-back' })
  expect((await ui.find({ key: 'roleRow:docs' }))?.props.label).toBe('docs: changed')
  // Cancel leaves the edit mode without saving
  await ui.press({ key: 'roleRow:security' })
  await ui.press({ key: 'role-edit' })
  await ui.press({ key: 'role-edit-cancel' })
  expect('security.md' in mine).toBe(false)
  expect(await ui.find({ key: 'role-edit' })).toBeDefined()
  await ui.unmount()
})

test('a broken replaced built-in shows why with Reset only; Reset brings the built-in back', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, { 'tester.md': '---\nmodel: sonnet\n---\n' })
  const ui = await settings($)
  expect((await ui.find({ key: 'roleRow:tester' }))?.props.label).toBe("tester — your file can't be read: no description")
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ type: 'Text', text: /Fix the file by hand: \.symcc\/roles\/tester\.md/ })).toBeDefined()
  expect(await ui.find({ key: 'role-edit' })).toBeUndefined()
  expect(await ui.find({ key: 'role-off' })).toBeUndefined()
  expect(await ui.find({ key: 'role-remove' })).toBeUndefined()
  await ui.press({ key: 'role-reset' })
  expect('tester.md' in mine).toBe(false)
  expect((await ui.find({ key: 'roleRow:tester' }))?.props.label).toBe('tester: built-in')
  await ui.unmount()
})

test('a broken added role shows why with Remove (after the confirm step); New role with its name says to open it', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, { 'mobile.md': 'no front matter\n' })
  const ui = await settings($)
  expect((await ui.find({ key: 'roleRow:mobile' }))?.props.label).toMatch(/^mobile — your file can't be read: no front matter/)
  await ui.press({ key: 'role-new' })
  await ui.input({ key: 'role-new-name', text: 'mobile' })
  expect(await ui.find({ type: 'Text', text: /open it in the list to Remove it/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /use action/ })).toBeUndefined()
  await ui.press({ key: 'role-new-cancel' })
  await ui.press({ key: 'roleRow:mobile' })
  expect(await ui.find({ key: 'role-reset' })).toBeUndefined()
  expect(await ui.find({ key: 'role-edit' })).toBeUndefined()
  await ui.press({ key: 'role-remove' })
  expect('mobile.md' in mine).toBe(true)
  await ui.press({ key: 'role-remove-yes' })
  expect('mobile.md' in mine).toBe(false)
  expect(await ui.find({ key: 'roleRow:mobile' })).toBeUndefined()
  expect(await ui.find({ key: 'roleRow:tester' })).toBeDefined()
  await ui.unmount()
})

test("a role whose name: line differs from its file name shows a mark on its row and the warning on its page", PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { 'tester.md': '---\nname: qa\ndescription: my own tests\n---\n' })
  const ui = await settings($)
  expect((await ui.find({ key: 'roleRow:tester' }))?.props.label).toBe('tester: changed ⚠')
  expect((await ui.find({ key: 'roleRow:docs' }))?.props.label).toBe('docs: built-in')
  expect(await ui.find({ type: 'Text', text: /^ ⚠$/ })).toBeDefined()
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ type: 'Text', text: "name: qa is ignored; the role's name is its file name, tester" })).toBeDefined()
  await ui.press({ key: 'role-back' })
  await ui.press({ key: 'roleRow:docs' })
  expect(await ui.find({ type: 'Text', text: /is ignored/ })).toBeUndefined()
  await ui.unmount()
})

test("the checker role's page shows the checker's own built-in prompt, the one it really goes into", PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { 'checker.md': '---\ndescription: tries to break a change\n---\n- try empty input\n' })
  const ui = await settings($)
  await ui.press({ key: 'roleRow:checker' })
  await ui.press({ key: 'role-prompt' })
  expect(await ui.find({ type: 'Text', text: /checker prompt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /what a checker is told/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /your job is to try to break it/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /role checker's checklist goes here/ })).toBeDefined()
  expect(await ui.find({ key: 'role-prompt-change' })).toBeUndefined()
  expect(await ui.find({ key: 'role-prompt-investigation' })).toBeUndefined()
  await ui.unmount()
})

test("the checker role has no Turn on / off: its page points to the checker setting and says whether it is on", PANEL, async ($, on) => {
  // the Settings view draws the checker setting from the published view, as publish (lead.ts) puts it there from the board
  const view = { ...VIEW.view, value: { ...VIEW.view.value, checker: false } }
  let version = 1
  const seed: Record<string, unknown> = { ...VIEW, view }
  on('state.get', (_, e, next) => (e.key in seed ? { value: { value: seed[e.key], version } } : next(e)))
  let checker = false
  fakeRoles(on, { 'checker.md': '---\ndescription: tries to break a change\noff: true\n---\n- try empty input\n' }, () => ({ ...emptyBoard(), checker }))
  const ui = await settings($)
  expect((await ui.find({ key: 'roleRow:checker' }))?.props.label).toBe('checker: added by you')
  await ui.press({ key: 'roleRow:checker' })
  expect(await ui.find({ key: 'role-off' })).toBeUndefined()
  expect(await ui.find({ key: 'role-edit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /the checker setting runs it \(Settings → checker, now off\)/ })).toBeDefined()
  await ui.press({ key: 'role-back' })
  checker = true
  view.value.checker = true
  version++
  await ui.press({ key: 'roleRow:checker' })
  expect(await ui.find({ type: 'Text', text: /Settings → checker, now on/ })).toBeDefined()
  // another role's page has no such line
  await ui.press({ key: 'role-back' })
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ type: 'Text', text: /Settings → checker/ })).toBeUndefined()
  await ui.unmount()
})

test('a role page lists the placeholders its checklist can use, and shows the built-in prompt it goes in (view only, {{role}} marked)', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, {})
  const ui = await settings($)
  await ui.press({ key: 'roleRow:tester' })
  expect((await ui.find({ type: 'Text', text: /^▍Placeholders$/ }))).toBeDefined()
  for (const p of ['task_id', 'title', 'files', 'test_command', 'folder', 'branch', 'kind']) expect(await ui.find({ type: 'Text', text: `{{${p}}}` })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /the "these must pass" line/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '{{role}}' })).toBeUndefined()
  // T-871: no key line at the bottom; the header's [Prompt] opens it
  expect(await ui.find({ type: 'Text', text: /p the prompt it goes in/ })).toBeUndefined()
  expect((await ui.find({ key: 'role-prompt' }))?.props.label).toBe('Prompt')
  // See the prompt: the change prompt, view only, with the {{role}} slot marked; it can switch to the investigation prompt
  await ui.press({ key: 'role-prompt' })
  expect(await ui.find({ type: 'Text', text: /built-in, view only/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Add or update a test that checks your change/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /role tester's checklist goes here/ })).toBeDefined()
  expect(await ui.find({ key: 'role-edit' })).toBeUndefined()
  await ui.press({ key: 'role-prompt-investigation' })
  expect(await ui.find({ type: 'Text', text: /Do exactly this one \{\{kind_name\}\}/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /role tester's checklist goes here/ })).toBeDefined()
  await ui.press({ key: 'role-prompt-back' })
  expect(await ui.find({ key: 'role-edit' })).toBeDefined()
  await ui.unmount()
})

test('T-871: a role page has the shared header and no key line; a replaced role says what changed from the built-in one, a checklist only its changed lines', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, {
    'docs.md': '---\ndescription: writes the docs\nmodel: sonnet\n---\n- plain words\n',
    'tester.md': '---\ndescription: writes tests\nmodel: sonnet\n---\n- cover errors\n- cover empty input\n',
    'mobile.md': '---\ndescription: phone apps\n---\n',
  })
  const ui = await settings($)
  // the Roles list says a replaced role is changed (its page says what changed)
  expect((await ui.find({ key: 'roleRow:docs' }))?.props.label).toBe('docs: changed')
  expect((await ui.find({ key: 'roleRow:tester' }))?.props.label).toBe('tester: changed')
  await ui.press({ key: 'roleRow:docs' })
  // the shared page header: Back to Roles, its state, its buttons; no key line at the bottom
  expect(await ui.find({ key: 'page-header' })).toBeDefined()
  expect((await ui.find({ key: 'role-back' }))?.props.label).toBe('Roles')
  expect(await ui.find({ type: 'Text', text: 'replaced · 1 change' })).toBeDefined()
  expect((await ui.find({ key: 'role-reset' }))?.props.label).toBe('Reset to built-in')
  expect(await ui.find({ type: 'Text', text: /b back/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /r reset to built-in/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '▍Changed from built-in' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "  model: (session's model) → sonnet" })).toBeDefined()
  // a changed checklist: only its changed line, not the whole text
  await ui.press({ key: 'role-back' })
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ type: 'Text', text: 'replaced · 1 change' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  checklist: 1 line changed' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '    + - cover empty input' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ {4}[−+] - cover errors$/ })).toBeUndefined()
  // an added role has nothing to compare
  await ui.press({ key: 'role-back' })
  await ui.press({ key: 'roleRow:mobile' })
  expect(await ui.find({ type: 'Text', text: 'added' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  added: no built-in to compare' })).toBeDefined()
  await ui.unmount()
})

test('T-871: Windows line ends are no change, and the checker role off: line is no change', async () => {
  const text = '---\ndescription: checks the work\nmodel: sonnet\noff: true\n---\n- run the tests\n- read the diff\n'
  const builtIn = parseRole('checker', text)!
  // the same file saved with Windows line ends says the same
  const crlf = parseRole('checker', text.replace(/\n/g, '\r\n'))!
  expect(roleChanges(builtIn, crlf)).toEqual([])
  // the checker can't be turned on or off here, so leaving out its off: line is no change
  const noOff = parseRole('checker', text.replace('off: true\n', ''))!
  expect(roleChanges(builtIn, noOff)).toEqual([])
  expect(roleListLabel('replaced', false, roleChanges(builtIn, noOff))).toBe('replaced')
  // another role's off: line still counts
  const docs = parseRole('docs', text)!
  expect(roleChanges(docs, parseRole('docs', text.replace('off: true\n', ''))!).map(c => c.field)).toEqual(['off'])
  // a changed line with Windows line ends shows only that line
  const changed = parseRole('checker', text.replace('read the diff', 'read every file').replace(/\n/g, '\r\n'))!
  expect(roleChanges(builtIn, changed)[0]?.lines).toEqual([{ sign: '-', text: '- read the diff' }, { sign: '+', text: '- read every file' }])
})

/** T-918's roles: built-in (general), changed (tester), added (researcher: web, writes nothing; writer: web, prose only),
 *  off (docs), and a long description that is cut (security). */
const T918_ROLES = {
  'tester.md': '---\ndescription: my own tests\n---\n- mine\n',
  'docs.md': '---\ndescription: writes the docs\noff: true\n---\n',
  'security.md': '---\ndescription: checks for holes in every place where data comes in from outside\n---\n',
  'researcher.md': '---\ndescription: finds things out\ntools: web\n---\n',
  'writer.md': '---\ndescription: plain-English writing\ntools: web\ncode: false\n---\n',
}

test('T-918: the Roles page is a table: the heading with its count, the column heads, one line per role, the cursor ❯, + New role (n)', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { ...T918_ROLES })
  const ui = await settings($)
  const line = async (name: string) => (await ui.find({ key: `roleRow:${name}` }))?.text
  expect((await ui.find({ type: 'Text', text: 'Roles' }))?.text).toBe('Roles')
  expect((await ui.find({ type: 'Text', text: /^6 roles/ }))?.text).toBe('6 roles · 5 changed by you · 1 off')
  expect((await ui.find({ type: 'Text', text: /^  NAME/ }))?.text).toBe("  NAME        FROM          MODEL  WEB  WRITES  WHAT IT'S FOR")
  expect(await line('general')).toBe('❯ general     built-in      —      —    code    a plain worker')
  expect(await line('tester')).toBe('  tester      changed       —      —    code    my own tests')
  expect(await line('docs')).toBe('  docs        off           —      —    code    writes the docs')
  expect(await line('researcher')).toBe('  researcher  added by you  —      web  —       finds things out')
  expect(await line('writer')).toBe('  writer      added by you  —      web  prose   plain-English writing')
  // the description is cut to fit with "…"; its page keeps the whole text
  expect(await line('security')).toBe('  security    changed       —      —    code    checks for holes in every place where data comes in…')
  // the off line is dim
  const docs = (await ui.find({ key: 'roleRow:docs' }))!
  expect(JSON.stringify(docs)).not.toContain('"claude"')
  // one plain "+ New role (n)" line; no "Enter opens" line and no Back button (the key line says them)
  expect((await ui.find({ key: 'role-new' }))?.text).toBe('  + New role (n)')
  expect(await ui.find({ type: 'Text', text: /Enter opens a role/ })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).map(x => x.props.label)).not.toContain('Back (b)')
  expect(await ui.find({ type: 'Text', text: /Enter open · n new role · ↑↓ move · l t s c views · b back/ })).toBeDefined()
  // n and b still work, through hidden Buttons
  expect((await ui.find({ key: 'role-new-key' }))?.props.hotkey).toBe('n')
  expect((await ui.find({ key: 'roles-back-key' }))?.props.hotkey).toBe('b')
  // T-1067: the shared page header draws the [Settings] Back button at the top
  expect((await ui.find({ key: 'roles-back' }))?.props.label).toBe('Settings')
  await ui.press({ key: 'role-new-key' })
  expect(await ui.find({ key: 'role-new-name' })).toBeDefined()
  await ui.unmount()
})

test('T-918: a narrow Roles page drops MODEL, then WEB, then WRITES, then cuts the description; the name never cuts', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { ...T918_ROLES })
  await $.session.start({ cwd: '/proj' } as never)
  // the first mount opens the Roles page; it stays open for the next mounts
  let first = true
  const at = async (cols: number) => {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: cols } })
    if (first) for (const g of SETTING_GROUPS) await ui.press({ key: `group:${g.title}` })
    if (first) await ui.press({ key: 'settings-roles' })
    first = false
    const head = (await ui.find({ type: 'Text', text: /^  NAME/ }))?.text
    const writer = (await ui.find({ key: 'roleRow:writer' }))?.text
    await ui.unmount()
    return [head, writer]
  }
  expect(await at(60)).toEqual(["  NAME        FROM          WEB  WRITES  WHAT IT'S FOR", '  writer      added by you  web  prose   plain-English writ…'])
  expect(await at(52)).toEqual(["  NAME        FROM          WRITES  WHAT IT'S FOR", '  writer      added by you  prose   plain-English w…'])
  expect(await at(40)).toEqual(["  NAME        FROM          WHAT IT'S F…", '  writer      added by you  plain-Engli…'])
  expect(await at(20)).toEqual(['  NAME        FROM', '  writer      added by you'])
})

test('T-918: every role page says what it writes; the Edit page picks code or prose only, and Save writes code: false', PANEL, async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, { ...T918_ROLES })
  const ui = await settings($)
  const writes = async () => (await ui.find({ type: 'Text', text: /^Writes: / }))?.text
  for (const [name, said] of [
    ['general', 'Writes: code (tests run before merging)'],
    ['writer', 'Writes: prose only (code: false; only docs checks run)'],
    ['researcher', 'Writes: nothing (answers questions; nothing is merged)'],
  ] as const) {
    await ui.press({ key: `roleRow:${name}` })
    expect(await writes(), name).toBe(said)
    await ui.press({ key: 'role-back' })
  }
  // the Edit page's Writes pick: code is picked for general; prose only, then Save, writes code: false
  await ui.press({ key: 'roleRow:general' })
  await ui.press({ key: 'role-edit' })
  expect((await ui.find({ key: 'role-code-code' }))?.text).toBe('● code')
  expect((await ui.find({ key: 'role-code-prose' }))?.text).toBe('○ prose only')
  await ui.press({ key: 'role-code-prose' })
  expect((await ui.find({ key: 'role-code-prose' }))?.text).toBe('● prose only')
  await ui.press({ key: 'role-save' })
  expect(mine['general.md']).toContain('code: false')
  expect(await writes()).toBe('Writes: prose only (code: false; only docs checks run)')
  // and back to code: the code: false line goes
  await ui.press({ key: 'role-edit' })
  await ui.press({ key: 'role-code-code' })
  await ui.press({ key: 'role-save' })
  expect(mine['general.md']).not.toContain('code: false')
  expect(await writes()).toBe('Writes: code (tests run before merging)')
  await ui.unmount()
})
