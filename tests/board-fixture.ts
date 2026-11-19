// A board of about twenty tasks in every status, for the tests that draw the panel on several surfaces
// (see vscode-board.test.tsx). Long titles on purpose: the VS Code layout must show them whole.
import { mock, type MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { inProject } from './project'
import { hist } from './history-fixture'

/** The clock the board is seen at. */
export const T0 = Date.UTC(2026, 10, 18, 12, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

const task = (id: string, status: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status, note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 0, history: [], branch: null, created_at: iso(T0 - 3_600_000), updated_at: iso(T0 - 60_000), ...extra })

export const BOARD_TASKS = [
  task('T-401', 'doing', 'Show the plugin version in the board title and the band above the prompt', { role: 'worker' }),
  task('T-402', 'doing', 'Keep the search box open while typing several words in a row', { attempts: 1 }),
  task('T-403', 'review', 'Make the settings page show every group with its own short summary line'),
  task('T-404', 'waiting', 'Pick the colors for the review mark on light themes', { question: 'Yellow or blue for review?' }),
  task('T-405', 'failed', 'Rename the scouts page heading and move its buttons under the list', { note: 'tests failed', history: hist('try 1: tests failed') }),
  task('T-406', 'todo', 'Write the guide section about adding a new scout from the board panel'),
  task('T-407', 'todo', 'Let the lead read the archived tasks when the owner asks about old work', { after: ['T-406'] }),
  task('T-408', 'todo', 'Add a short CHANGELOG line for every merged task automatically'),
  task('T-409', 'paused', 'Stop a worker that runs past its time limit and ask the owner first'),
  task('T-410', 'todo', 'Show which branch a task merges into when it is not the current one'),
  task('T-411', 'backlog', 'A dark logo for the banner in high contrast themes'),
  task('T-412', 'backlog', 'Export the board as a markdown table for the weekly notes'),
  task('T-413', 'backlog', 'Sound when a task needs the owner'),
  task('T-414', 'done', 'Fix the typecheck script on a fresh clone without node modules'),
  task('T-415', 'done', 'Explain in the guide how the review mode merges finished work'),
  task('T-416', 'done', 'Count tokens per try and show the total under the banner'),
  task('T-417', 'dropped', 'Move the board to its own window'),
  task('T-418', 'dropped', 'Ask for a second test command at setup'),
  task('T-419', 'todo', 'Clean up the old stage engine names left in the comments of the hooks'),
  task('T-420', 'review', 'Research how other tools draw a task board in an editor side panel', { kind: 'investigation' }),
]

export const BOARD_VIEW = {
  shape: 'view-1',
  value: {
    tasks: BOARD_TASKS,
    working: [{ task: 'T-401', since: T0 - 120_000 }],
    scouts: [{ name: 'tests', every_minutes: 30, last_run: null, running: false }],
    mode: 'auto',
    branch: 'main',
    test_commands: ['claude plugin test .', 'sh scripts/typecheck.sh'],
  },
}

export const PANE = {
  plugin: 'symcc',
  component: 'Pane',
  requestId: 'symcc-board',
  props: { title: 'symcc board · symcc', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** Seeds the board view (and the project folder, and a fixed clock at T0, which the pages are drawn at: see ui/now.ts);
 *  once the plugin writes a value, the kit's own store answers it. Gives the clock, for a test that moves it. */
export function seedBoard(on: On, seed: Record<string, unknown> = { view: BOARD_VIEW }): MockClock {
  const written = new Set<string>()
  on('state.set', (_, e, next) => (written.add(e.key), next(e)))
  inProject(on)
  const clock = mock.clock(on, { now: T0 })
  on('state.get', (_, e, next) => (written.has(e.key) || !(e.key in seed) ? next(e) : { value: { value: seed[e.key], version: 1 } }))
  return clock
}

/** A drawn tree as plain data, to compare with a saved one exactly: only the press handles are dropped (each draw
 *  gives new numbers; the saved trees have none), every text, space, color and time stays as drawn. */
export const drawnData = (tree: unknown): unknown => JSON.parse(JSON.stringify(tree ?? null, (k, v) => (k === 'handle' ? undefined : v)))

/** A saved tree with some of its text changed: each `[from, to]` replaces every `from` in the tree's text; it throws
 *  when a `from` isn't there, so a test can't pass by changing nothing. */
export function changedTree(tree: unknown, swaps: [string, string][]): unknown {
  let s = JSON.stringify(tree)
  for (const [from, to] of swaps) {
    if (!s.includes(from)) throw new Error(`changedTree: "${from}" is not in the tree`)
    s = s.split(from).join(to)
  }
  return JSON.parse(s)
}
