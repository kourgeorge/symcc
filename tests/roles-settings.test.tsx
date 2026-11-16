import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ICON } from '../hooks/name'
import { inProject } from './project'

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it (and redraws). */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
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
 */
function fakeRoles(on: On, mine: Record<string, string>) {
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
    const w = where(e.path)
    return w ? { value: w[1] === '' || w[1] in w[0] } : next(e)
  })
  on('fs.list', (_, e, next) => {
    const w = where(e.path)
    return w && w[1] === '' ? { value: Object.keys(w[0]).map(name => ({ name, kind: 'file' })) } : next(e)
  })
  on('fs.read', (_, e, next) => {
    const w = where(e.path)
    if (!w) return next(e)
    if (!(w[1] in w[0])) throw new Error('no file')
    return { value: w[0][w[1]] }
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
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
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

type Eng = Parameters<Parameters<typeof test>[1]>[0]

/** Starts the session (so the plugin knows its project folder) and mounts the panel on its Settings view. */
async function settingsOnly($: Eng) {
  await $.session.start({ cwd: '/proj' } as never)
  return $.ui.mount(PANE)
}

/** Mounts the panel on Settings and opens its Roles page. */
async function settings($: Eng) {
  const ui = await settingsOnly($)
  await ui.press({ key: 'settings-roles' })
  return ui
}

test('Settings shows one Roles row (count and off count), not the roles; it opens the Roles page and Back returns', async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { 'mobile.md': '---\ndescription: phone apps\n---\n', 'docs.md': '---\ndescription: writes the docs\noff: true\n---\n' })
  const ui = await settingsOnly($)
  expect((await ui.find({ key: 'settings-roles' }))?.props.label).toBe('Roles: 5 roles · 1 off')
  expect(await ui.find({ key: 'roleRow:general' })).toBeUndefined()
  expect(await ui.find({ key: 'role-new' })).toBeUndefined()
  await ui.press({ key: 'settings-roles' })
  expect(await ui.find({ key: 'roleRow:general' })).toBeDefined()
  expect(await ui.find({ key: 'setting:mode' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Enter open · n new role · ↑↓ move · t s c views · b back/ })).toBeDefined()
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

test('Settings lists every role: built-in, replaced, added and off, each with its description', async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { 'tester.md': '---\ndescription: my own tests\n---\n- mine\n', 'mobile.md': '---\ndescription: phone apps\n---\n', 'docs.md': '---\ndescription: writes the docs\noff: true\n---\n' })
  const ui = await settings($)
  expect(await ui.find({ type: 'Text', text: /▍Roles/ })).toBeDefined()
  const label = async (name: string) => (await ui.find({ key: `roleRow:${name}` }))?.props.label
  expect(await label('general')).toBe('general: built-in')
  expect(await label('security')).toBe('security: built-in')
  expect(await label('tester')).toBe('tester: replaced')
  expect(await label('mobile')).toBe('mobile: added')
  expect(await label('docs')).toBe('docs: replaced, off')
  expect(await ui.find({ type: 'Text', text: /^ · my own tests$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ · phone apps$/ })).toBeDefined()
  expect(await ui.find({ key: 'role-new' })).toBeDefined()
  await ui.unmount()
})

test('a role opens in full; Turn off and Turn on write its file; general has no Turn off', async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, {})
  const ui = await settings($)
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ type: 'Text', text: /^  sonnet$/ })).toBeDefined()
  // the same section names, in the same order, as the edit page's boxes (the description is the subheader)
  expect((await ui.findAll({ type: 'Text', text: /^▍/ })).map(x => x.text)).toEqual(['▍Model', '▍Skills', '▍Tools', '▍Checklist', '▍File'])
  await ui.press({ key: 'role-edit' })
  expect((await ui.findAll({ type: 'Text', text: /^▍/ })).map(x => x.text)).toEqual(['▍Description', '▍Model', '▍Skills', '▍Tools', '▍Checklist'])
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

test('Reset shows only for a replaced built-in, Remove only for an added role (after a confirm step)', async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeRoles(on, { 'tester.md': '---\ndescription: my own tests\n---\n', 'mobile.md': '---\ndescription: phone apps\n---\n' })
  const ui = await settings($)
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ key: 'role-remove' })).toBeUndefined()
  await ui.press({ key: 'role-reset' })
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

test('New role makes .symcc/roles/<name>.md from the template and opens it; Edit on a built-in saves a copy', async ($, on) => {
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
  expect((await ui.find({ key: 'roleRow:docs' }))?.props.label).toBe('docs: replaced')
  // Cancel leaves the edit mode without saving
  await ui.press({ key: 'roleRow:security' })
  await ui.press({ key: 'role-edit' })
  await ui.press({ key: 'role-edit-cancel' })
  expect('security.md' in mine).toBe(false)
  expect(await ui.find({ key: 'role-edit' })).toBeDefined()
  await ui.unmount()
})

test('a broken replaced built-in shows why with Reset only; Reset brings the built-in back', async ($, on) => {
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

test('a broken added role shows why with Remove (after the confirm step); New role with its name says to open it', async ($, on) => {
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

test("a role whose name: line differs from its file name shows a mark on its row and the warning on its page", async ($, on) => {
  stateOf(on, VIEW)
  fakeRoles(on, { 'tester.md': '---\nname: qa\ndescription: my own tests\n---\n' })
  const ui = await settings($)
  expect((await ui.find({ key: 'roleRow:tester' }))?.props.label).toBe('tester: replaced ⚠')
  expect((await ui.find({ key: 'roleRow:docs' }))?.props.label).toBe('docs: built-in')
  expect(await ui.find({ type: 'Text', text: /^ ⚠$/ })).toBeDefined()
  await ui.press({ key: 'roleRow:tester' })
  expect(await ui.find({ type: 'Text', text: "name: qa is ignored; the role's name is its file name, tester" })).toBeDefined()
  await ui.press({ key: 'role-back' })
  await ui.press({ key: 'roleRow:docs' })
  expect(await ui.find({ type: 'Text', text: /is ignored/ })).toBeUndefined()
  await ui.unmount()
})
