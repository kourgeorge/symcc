// T-154: nothing in the board panel needs Esc to get out (Esc from a text box or pick list often never reaches
// the panel). Each box and pick list has Enter on empty and/or a Cancel button, each page a Back button, and the
// hints say so.
import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { boxHint, pickHint, scoutEditKeys, scoutListKeys, settingsKeys, rolesKeys, hintLineText } from '../hooks/board'
import { inProject } from './project'

/** Seeds the plugin's state values; once the plugin writes one, the kit's own store answers it (and redraws). */
function stateOf(on: On, seed: Record<string, unknown>) {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  // the project folder (the plugin's paths need it, see findRoot)
  inProject(on)
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
}

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: 'symcc board', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: '', updated_at: '', ...extra })
const scout = (name: string, extra: Record<string, unknown> = {}) => ({ name, every_minutes: 30, last_run: null, running: false, ...extra })
const view = (tasks: unknown[], more: Record<string, unknown> = {}) => ({ shape: 'view-1', value: { tasks, working: [], scouts: [scout('bugs', { prompt: 'Look for crashes.' })], mode: 'auto', test_commands: [], ...more } })

test('the hints say the real way out, within 50 columns, and never Esc', () => {
  const lines = [
    boxHint('Enter sends it to todo'),
    boxHint('Enter sends'),
    boxHint('Enter sends', 'goes back'),
    boxHint('Enter saves'),
    boxHint('Enter goes on'),
    pickHint('c'),
    pickHint('x'),
  ]
  expect(lines).toEqual([
    'Enter sends it to todo · Enter on empty cancels',
    'Enter sends · Enter on empty cancels',
    'Enter sends · Enter on empty goes back',
    'Enter saves · Enter on empty cancels',
    'Enter goes on · Enter on empty cancels',
    'Enter picks · c cancels',
    'Enter picks · x cancels',
  ])
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(50)
  expect(hintLineText(settingsKeys())).toBe('Enter change · ↑↓ move · t s c views · b back')
  expect(hintLineText(rolesKeys())).toBe('Enter open · n new role · ↑↓ move · t s c views · b back')
  expect(hintLineText(scoutListKeys())).toBe('Enter open · ↑↓ move · t s c views · b back')
  expect(hintLineText(scoutEditKeys())).toBe('↑↓ move between boxes · Cancel leaves without saving')
  for (const keys of [settingsKeys(), rolesKeys(), scoutListKeys(), scoutEditKeys()]) expect(keys.some(k => k.key === 'Esc')).toBe(false)
})

test('the reject reason box: Enter on empty cancels it (nothing is sent), and so does its Cancel (c) button', async ($, on) => {
  stateOf(on, { opened: 'T-5', view: view([task('T-5', 'review', 'Blue button', { branch: 'symcc/T-5' })]) })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'reject' })
  expect(await ui.find({ type: 'Text', text: /^Enter sends it to todo · Enter on empty cancels$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Esc/ })).toBeUndefined()
  await ui.input({ key: 'reject-reason', text: '   ' })
  expect(await ui.find({ key: 'reject-reason' })).toBeUndefined()
  expect(toasts.length).toBe(0)
  await ui.press({ key: 'reject' })
  const cancel = await ui.find({ key: 'reject-cancel' })
  expect(cancel?.props.label).toBe('Cancel (c)')
  expect(cancel?.props.hotkey).toBe('c')
  await ui.press({ key: 'reject-cancel' })
  expect(await ui.find({ key: 'reject-reason' })).toBeUndefined()
  // the same box over the task's changes, which have their own Back (b)
  await ui.press({ key: 'show-changes' })
  await ui.press({ key: 'reject' })
  await ui.input({ key: 'reject-reason', text: '' })
  expect(await ui.find({ key: 'reject-reason' })).toBeUndefined()
  expect((await ui.find({ key: 'diff-back' }))?.props.hotkey).toBe('b')
  await ui.press({ key: 'diff-back' })
  expect(await ui.find({ key: 'show-changes' })).toBeDefined()
  // the task page's Back (b) goes to the board list
  expect((await ui.find({ key: 'back' }))?.props.hotkey).toBe('b')
  await ui.press({ key: 'back' })
  // the kit's store doesn't redraw for a value set back to its default (''), so redraw by hand
  await ui.redraw()
  expect(await ui.find({ key: 'T-5' })).toBeDefined()
  await ui.unmount()
})

test('the role pick list has a Cancel (c) button and says so', async ($, on) => {
  stateOf(on, { opened: 'T-1', view: view([task('T-1', 'todo', 'Write it up')]) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'role' })
  expect(await ui.find({ type: 'Text', text: /^Enter picks · c cancels$/ })).toBeDefined()
  const cancel = await ui.find({ key: 'role-cancel' })
  expect(cancel?.props.label).toBe('Cancel (c)')
  expect(cancel?.props.hotkey).toBe('c')
  await ui.press({ key: 'role-cancel' })
  expect(await ui.find({ key: 'role-cancel' })).toBeUndefined()
  expect(await ui.find({ key: 'role' })).toBeDefined()
  await ui.unmount()
})

test('"Your answer" opened with Answer…: Enter on empty and Cancel (c) go back to the answer buttons', async ($, on) => {
  stateOf(on, { opened: 'T-2', view: view([task('T-2', 'waiting', 'Search mode', { question: 'Which colour?', options: ['red', 'blue'] })]) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'choice-3' })
  expect(await ui.find({ key: 'answer' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Enter sends · Enter on empty cancels$/ })).toBeDefined()
  await ui.input({ key: 'answer', text: '' })
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  expect(await ui.find({ key: 'choice-1' })).toBeDefined()
  await ui.press({ key: 'choice-3' })
  const cancel = await ui.find({ key: 'answer-cancel' })
  expect(cancel?.props.hotkey).toBe('c')
  await ui.press({ key: 'answer-cancel' })
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  // the task stays open
  expect(await ui.find({ key: 'choice-1' })).toBeDefined()
  await ui.unmount()
})

test('"Your answer" on a plain question: Enter on empty goes back to the board list', async ($, on) => {
  stateOf(on, { opened: 'T-2', view: view([task('T-2', 'waiting', 'Search mode', { question: 'Case-sensitive?' })]) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Enter sends · Enter on empty goes back$/ })).toBeDefined()
  expect(await ui.find({ key: 'answer-cancel' })).toBeUndefined()
  await ui.input({ key: 'answer', text: '' })
  // the kit's store doesn't redraw for a value set back to its default (''), so redraw by hand
  await ui.redraw()
  expect(await ui.find({ key: 'answer' })).toBeUndefined()
  expect(await ui.find({ key: 'T-2' })).toBeDefined()
  await ui.unmount()
})

test("a setting's edit box: Enter on empty cancels (test_commands too: nothing saved), and Cancel (x) does", async ($, on) => {
  stateOf(on, { tab: 'settings', view: view([task('T-1', 'todo', 'Build it')], { test_commands: ['npm test'], max_parallel: 3 }) })
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'setting:max_parallel' })
  expect(await ui.find({ type: 'Text', text: /^Enter saves · Enter on empty cancels$/ })).toBeDefined()
  await ui.input({ key: 'setting-edit', text: '' })
  expect(await ui.find({ key: 'setting-edit' })).toBeUndefined()
  await ui.press({ key: 'setting:test_commands' })
  expect(await ui.find({ type: 'Text', text: /none clears them/ })).toBeDefined()
  await ui.input({ key: 'setting-edit', text: '  ' })
  expect(await ui.find({ key: 'setting-edit' })).toBeUndefined()
  expect(toasts.length).toBe(0)
  await ui.press({ key: 'setting:max_minutes' })
  const cancel = await ui.find({ key: 'setting-cancel' })
  expect(cancel?.props.label).toBe('Cancel (x)')
  expect(cancel?.props.hotkey).toBe('x')
  await ui.press({ key: 'setting-cancel' })
  expect(await ui.find({ key: 'setting-edit' })).toBeUndefined()
  await ui.unmount()
})

test("a setting's pick list says x cancels; Settings has Back (b) to the board list", async ($, on) => {
  stateOf(on, { tab: 'settings', view: view([task('T-1', 'todo', 'Build it')]) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'setting:mode' })
  expect(await ui.find({ type: 'Text', text: /^Enter picks · x cancels$/ })).toBeDefined()
  await ui.press({ key: 'setting-cancel' })
  expect(await ui.find({ key: 'pick:off' })).toBeUndefined()
  const back = await ui.find({ key: 'settings-back' })
  expect(back?.props.hotkey).toBe('b')
  await ui.press({ key: 'settings-back' })
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  expect(await ui.find({ key: 'setting:mode' })).toBeUndefined()
  await ui.unmount()
})

test('the new scout name box: Enter on empty and Cancel (x) leave it; the Scouts list has Back (b)', async ($, on) => {
  stateOf(on, { tab: 'scouts', view: view([task('T-1', 'todo', 'Build it')]) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'scout-new' })
  expect(await ui.find({ type: 'Text', text: /^Enter goes on · Enter on empty cancels$/ })).toBeDefined()
  await ui.input({ key: 'scout-new-name', text: '' })
  expect(await ui.find({ key: 'scout-new-name' })).toBeUndefined()
  expect(await ui.find({ key: 'scout-new' })).toBeDefined()
  await ui.press({ key: 'scout-new' })
  expect((await ui.find({ key: 'scout-new-cancel' }))?.props.hotkey).toBe('x')
  await ui.press({ key: 'scout-new-cancel' })
  expect(await ui.find({ key: 'scout-new-name' })).toBeUndefined()
  const back = await ui.find({ key: 'scouts-back' })
  expect(back?.props.hotkey).toBe('b')
  await ui.press({ key: 'scouts-back' })
  expect(await ui.find({ key: 'T-1' })).toBeDefined()
  await ui.unmount()
})

test("a scout's page has Back (b); its edit page has Cancel (x), and its footer says Cancel is the way out", async ($, on) => {
  stateOf(on, { tab: 'scouts', scout: 'bugs', view: view([]) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'scout-back' }))?.props.hotkey).toBe('b')
  await ui.press({ key: 'scout-edit' })
  const cancel = await ui.find({ key: 'scout-cancel' })
  expect(cancel?.props.label).toBe('Cancel (x)')
  expect(cancel?.props.hotkey).toBe('x')
  expect(await ui.find({ type: 'Text', text: /Cancel leaves without saving/ })).toBeDefined()
  await ui.press({ key: 'scout-cancel' })
  expect(await ui.find({ key: 'scout-cancel' })).toBeUndefined()
  await ui.press({ key: 'scout-back' })
  // the kit's store doesn't redraw for a value set back to its default (''), so redraw by hand
  await ui.redraw()
  expect(await ui.find({ key: 'scout:bugs' })).toBeDefined()
  await ui.unmount()
})
