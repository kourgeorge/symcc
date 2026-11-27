// T-891: the board view keeps finished tasks as slim stubs (no details, no request). The Tasks list's search (terminal
// and VS Code) still finds them by words of their details and request: while a search is typed, they are read from
// the tasks' parts files, each file once per search; a list drawn without a search reads none.
import type { On } from 'claude-code'
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { readText } from './fakes'
import { inProject } from './project'
import { partsFileOf, partsText } from '../hooks/core/board-parts'
import { slimView } from '../hooks/core/view-slim'
import type { SymccView } from '../types'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
const task = (id: string, status: string, msAgo: number, details: string, request: string) => ({
  id, title: `Task ${id}`, status, details, note: '', after: [], files: [], attempts: 1, priority: 1,
  origin: { why: 'x', by: 'owner', request }, created_at: iso(msAgo + 60_000), updated_at: iso(msAgo),
  timeline: [{ at: iso(msAgo), kind: 'merged', text: 'try 1 → merged into main' }],
})
// T-5 finished a minute ago (before T-891 the view kept it whole), T-6 five days ago, T-7 is open
const WHOLE = [
  task('T-5', 'done', 60_000, 'the zebrafish swims upstream', 'please count every pelican'),
  task('T-6', 'dropped', 5 * 24 * 60 * 60_000, 'an old note about a walrus', 'find the narwhal'),
  task('T-7', 'todo', 60_000, 'open work on giraffes', 'a llama request'),
]

const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: 'symcc board', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

/** The board panel on the slim view, with the parts files there to read; `reads` lists each parts file read. */
function seed(on: On) {
  const view = slimView({ tasks: WHOLE, working: [], scouts: [], mode: 'auto', test_commands: [] } as unknown as SymccView)
  const seeded: Record<string, unknown> = { tab: 'tasks', view: { shape: 'view-1', value: view } }
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  inProject(on)
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seeded) ? next(e) : { value: { value: seeded[e.key], version: 1 } }))
  const reads: string[] = []
  on('fs.read', (_, e, next) => {
    const ts = WHOLE.filter(x => x.status !== 'todo' && e.path.endsWith(`/.symcc/${partsFileOf(x.id)}`))
    if (!ts.length) return next(e)
    reads.push(e.path)
    return readText(partsText(Object.fromEntries(ts.map(t => [t.id, t as never]))))
  })
  on('fs.exists', () => ({ value: false }))
  return { view, reads }
}

const shown = async (ui: { find: (q: { key: string }) => Promise<unknown> }) => {
  const out: string[] = []
  for (const id of WHOLE.map(t => t.id)) if (await ui.find({ key: id })) out.push(id)
  return out
}

test('T-891: the view keeps both finished tasks without their details or request', ($, on) => {
  const { view } = seed(on)
  const text = JSON.stringify(view.tasks.filter(t => t.status !== 'todo'))
  for (const w of ['zebrafish', 'pelican', 'walrus', 'narwhal']) expect(text.includes(w)).toBe(false)
})

test('terminal: the search finds a just finished and a 5-day-old task by details and request, reading their parts file once', async ($, on) => {
  const { reads } = seed(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // a list drawn without a search reads no parts file
  expect(reads.length).toBe(0)
  await ui.press({ key: 'search-open' })
  await ui.input({ key: 'search', text: 'zebra', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-5'])
  // both tasks are in one parts file (tasks/T-0.json), read once
  expect(reads.length).toBe(1)
  // more letters: nothing read again
  await ui.input({ key: 'search', text: 'zebrafish', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-5'])
  await ui.input({ key: 'search', text: 'pelican', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-5'])
  await ui.input({ key: 'search', text: 'walrus', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-6'])
  await ui.input({ key: 'search', text: 'narwhal', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-6'])
  await ui.input({ key: 'search', text: 'giraffes', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-7'])
  await ui.input({ key: 'search', text: 'kangaroo', kind: 'change' })
  expect(await shown(ui)).toEqual([])
  expect(reads.length).toBe(1)
  // the search ended: what was read is forgotten, and a new search reads the files again
  await ui.input({ key: 'search', text: '' })
  expect((await shown(ui)).includes('T-7')).toBe(true)
  expect(reads.length).toBe(1)
  await ui.press({ key: 'search-open' })
  await ui.input({ key: 'search', text: 'narwhal', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-6'])
  expect(reads.length).toBe(2)
  await ui.unmount()
})

test('vscode: the search finds a just finished and a 5-day-old task by details and request', async ($, on) => {
  const { reads } = seed(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(reads.length).toBe(0)
  await ui.input({ key: 'search', text: 'pelican', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-5'])
  await ui.input({ key: 'search', text: 'walrus', kind: 'change' })
  expect(await shown(ui)).toEqual(['T-6'])
  expect(reads.length).toBe(1)
  await ui.unmount()
})
