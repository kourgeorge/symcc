// The Kinds page of the board panel's Settings view (T-329): like the Roles page, with the same keys.
import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import { SETTING_GROUPS } from '../hooks/board'
import type { On } from 'claude-code'
import { ICON } from '../hooks/name'
import { inProject } from './project'
import { ran, entry } from './fakes'

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
 * A fake kinds folder: `mine` is the project's .symcc/kinds (file name -> text); the built-in task types are the real ones (kinds/index.ts).
 * fs.write and `rm -f` change `mine`, so what the panel writes or deletes is seen by the next read.
 */
function fakeKinds(on: On, mine: Record<string, string>) {
  const where = (p: string): [Record<string, string>, string] | null => {
    const m = /\/\.symcc\/kinds(?:\/(.*))?$/.exec(p)
    return m ? [mine, m[1] ?? ''] : null
  }
  on('fs.exists', (_, e, next) => {
    const w = where(e.path)
    return w ? { value: w[1] === '' || w[1] in w[0] } : next(e)
  })
  on('fs.list', (_, e, next) => {
    const w = where(e.path)
    return w && w[1] === '' ? { value: Object.keys(w[0]).map(name => entry(name)) } : next(e)
  })
  on('fs.read', (_, e, next) => {
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
  // the session start gives the plugin its project folder (/proj), where .symcc/kinds is
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/proj' } }) as never)
  inProject(on)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  mock.clock(on, { now: 1_800_000_000_000 })
  return { mine }
}

type Eng = Engine

/** Starts the session (so the plugin knows its project folder) and mounts the panel on its Settings view, every group open. */
async function settingsOnly($: Eng) {
  await $.session.start({ cwd: '/proj' } as never)
  const ui = await $.ui.mount(PANE)
  for (const g of SETTING_GROUPS) await ui.press({ key: `group:${g.title}` })
  return ui
}

/** Mounts the panel on Settings and opens its Task types page. */
async function settings($: Eng) {
  const ui = await settingsOnly($)
  await ui.press({ key: 'settings-kinds' })
  return ui
}

test('Settings has a Task types row next to Roles; its page lists the task types with the same keys as the Roles page', async ($, on) => {
  stateOf(on, VIEW)
  fakeKinds(on, { 'bug.md': '---\ndescription: a defect\noff: true\n---\n', 'chore.md': '---\ndescription: small upkeep\n---\n' })
  const ui = await settingsOnly($)
  expect((await ui.find({ key: 'settings-kinds' }))?.props.label).toBe('Task types: 7 task types · 1 off')
  expect(await ui.find({ key: 'kindRow:change' })).toBeUndefined()
  await ui.press({ key: 'settings-kinds' })
  // T-918: the heading with its count, the column heads, one line per kind (NAME, FROM, WHAT IT'S FOR), the cursor's ❯
  expect((await ui.find({ type: 'Text', text: /^▍Task types/ }))?.text).toBe('▍Task types  7 task types · 2 changed by you · 1 off')
  expect((await ui.find({ type: 'Text', text: /^  NAME/ }))?.text).toBe("  NAME           FROM          WHAT IT'S FOR")
  const label = async (name: string) => (await ui.find({ key: `kindRow:${name}` }))?.props.label
  expect(await label('change')).toBe('change: built-in')
  expect(await label('bug')).toBe('bug: off')
  expect(await label('chore')).toBe('chore: added by you')
  expect(await label('investigation')).toBe('investigation: built-in')
  expect((await ui.find({ key: 'kindRow:chore' }))?.text).toBe('  chore          added by you  small upkeep')
  expect((await ui.find({ key: 'kindRow:change' }))?.text).toMatch(/^❯ change         built-in      /)
  expect((await ui.find({ key: 'kind-new' }))?.text).toBe('  + New task type (n)')
  // no "Enter opens" line and no Back button: the key line says them
  expect(await ui.find({ type: 'Text', text: /Enter opens a kind/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Enter open · n new type · ↑↓ move · l t s c views · b back/ })).toBeDefined()
  await ui.press({ key: 'kindRow:chore' })
  await ui.press({ key: 'kind-back' })
  await ui.press({ key: 'kinds-back' })
  expect(await ui.find({ key: 'setting:mode' })).toBeDefined()
  await ui.unmount()
})

test('a kind opens in full; Turn off / on, Reset and Remove write its file; change has no Turn off', async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeKinds(on, { 'chore.md': '---\ndescription: small upkeep\n---\n' })
  const ui = await settings($)
  await ui.press({ key: 'kindRow:change' })
  expect(await ui.find({ type: 'Text', text: /The worker changes files/ })).toBeDefined()
  expect(await ui.find({ key: 'kind-off' })).toBeUndefined()
  expect(await ui.find({ key: 'kind-edit' })).toBeDefined()
  await ui.press({ key: 'kind-back' })
  await ui.press({ key: 'kindRow:bug' })
  expect(await ui.find({ type: 'Text', text: /^kinds\/bug\.ts \(in the plugin; Edit copies it to \.symcc\/kinds\/bug\.md\)$/ })).toBeDefined()
  expect(await ui.find({ key: 'kind-reset' })).toBeUndefined()
  expect(await ui.find({ key: 'kind-remove' })).toBeUndefined()
  await ui.press({ key: 'kind-off' })
  expect(mine['bug.md']).toContain('off: true')
  expect((await ui.find({ key: 'kind-off' }))?.props.label).toBe('Turn on')
  await ui.press({ key: 'kind-reset' })
  expect('bug.md' in mine).toBe(false)
  await ui.press({ key: 'kind-back' })
  expect((await ui.find({ key: 'kindRow:bug' }))?.props.label).toBe('bug: built-in')
  await ui.press({ key: 'kindRow:chore' })
  await ui.press({ key: 'kind-remove' })
  expect('chore.md' in mine).toBe(true)
  await ui.press({ key: 'kind-remove-yes' })
  expect('chore.md' in mine).toBe(false)
  expect(await ui.find({ key: 'kindRow:chore' })).toBeUndefined()
  await ui.unmount()
})

test('New kind makes .symcc/kinds/<name>.md and opens it; Edit saves; a bad name stays in the box', async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeKinds(on, {})
  const ui = await settings($)
  await ui.press({ key: 'kind-new' })
  await ui.input({ key: 'kind-new-name', text: 'a/b' })
  expect(await ui.find({ type: 'Text', text: /not a valid task type name/ })).toBeDefined()
  await ui.input({ key: 'kind-new-name', text: 'chore' })
  expect(mine['chore.md']).toContain('description: what this task type is')
  expect(await ui.find({ key: 'kind-description' })).toBeDefined()
  await ui.input({ key: 'kind-description', text: 'small upkeep', kind: 'change' })
  await ui.press({ key: 'kind-save' })
  expect(mine['chore.md']).toContain('description: small upkeep')
  expect(await ui.find({ key: 'kind-remove' })).toBeDefined()
  await ui.unmount()
})

test('New kind over a file that is there but can not be read: says so with the way out (like New role), and writes nothing', async ($, on) => {
  stateOf(on, VIEW)
  const { mine } = fakeKinds(on, { 'chore.md': 'no front matter here', 'bug.md': '---\noff: true\n---\n' })
  const ui = await settings($)
  await ui.press({ key: 'kind-new' })
  await ui.input({ key: 'kind-new-name', text: 'chore' })
  expect(await ui.find({ type: 'Text', text: /\.symcc\/kinds\/chore\.md is already there but can't be read \(no front matter.*\): open it in the list to Remove it, or fix the file by hand/ })).toBeDefined()
  expect(mine['chore.md']).toBe('no front matter here')
  expect(await ui.find({ key: 'kind-description' })).toBeUndefined()
  await ui.input({ key: 'kind-new-name', text: 'Bug' })
  expect(await ui.find({ type: 'Text', text: /\.symcc\/kinds\/bug\.md is already there but can't be read \(no description\): open it in the list to Reset to built-in, or fix the file by hand/ })).toBeDefined()
  expect(mine['bug.md']).toBe('---\noff: true\n---\n')
  await ui.unmount()
})
