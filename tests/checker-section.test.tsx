// T-1079: the task page says who said what. The worker's hand-back and the checker's verdict are separate history
// lines, each starting with who wrote it (and the agent's name); under ▍Report a ▍Checker (try n) · <agent> section
// shows the checker's full saved report, and is not there when the try had no checker. Drawn by the Claude Code panel
// (terminal), the VS Code board and the plain text view (the Node and OpenCode hosts' /symcc-task).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0, seedBoard } from './board-fixture'
import { readText } from './fakes'
import { historyEntry, historyTime } from '../hooks/core/history'
import { taskText } from '../hooks/app/tools'
import { checkerEntry } from '../hooks/core/checker'
import type { SymccTask } from '../types'

const iso = (ms: number) => new Date(ms).toISOString()
const WORKER_REPORT = 'I fixed the three problems and ran the tests.'
const CHECKER_FULL = 'I checked T-505 by importing the module from /tmp and running it.\n\nProblems:\n- the empty input still throws\n- the docs name no example'
const REPORT_FILE = '.symcc/reports/T-505-try-2.md'
const CHECKER_FILE = '.symcc/reports/T-505-try-2-checker.md'

const at = iso(T0 - 600_000)
const [, text, facts] = checkerEntry('try 2', { ok: false, report: CHECKER_FULL }, '', 2, { agent: 'symcc-T-505-checker', report: CHECKER_FILE })
const HISTORY = [
  historyEntry('stage', 'try 2: worker started (role general)', at, { try: 2, step: 'worker-start', agent: 'symcc-T-505' }),
  historyEntry('failed', `try 2: ${WORKER_REPORT} → the checker found problems`, at, { try: 2, result: 'the checker found problems', reason: 'checker', agent: 'symcc-T-505' }),
  historyEntry('checker-problems', text, at, facts!),
]
const TASK = (history = HISTORY, runs = [{ started: iso(T0 - 900_000), ended: at, report: REPORT_FILE }]) =>
  ({
    id: 'T-505', title: 'Say who said what', details: '', files: ['tests/'], status: 'todo', note: '', priority: 0, after: [], attempts: 2, history, runs,
    branch: null, created_at: iso(T0 - 86_400_000), updated_at: iso(T0 - 60_000), role: 'general',
  }) as unknown as SymccTask

const seed = (on: Parameters<typeof seedBoard>[0], t: SymccTask) => {
  seedBoard(on, { opened: t.id, view: { shape: 'view-1', value: { tasks: [t], working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: [] } } })
  on('fs.read', (_, e, next) => (e.path.endsWith(CHECKER_FILE) ? readText(CHECKER_FULL) : e.path.endsWith(REPORT_FILE) ? readText(WORKER_REPORT) : next(e)))
  on('fs.exists', () => ({ value: false }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
}

type Node = { type?: string; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' ? textOf((n as Node).children ?? []) : '')
/** The children of the first Box whose first child's text starts with `head` (a page section, its heading first). */
function section(tree: unknown, head: string): unknown[] | undefined {
  const walk = (n: unknown): unknown[] | undefined => {
    if (Array.isArray(n)) return n.map(walk).find(Boolean)
    if (!n || typeof n !== 'object') return undefined
    const ch = (n as Node).children ?? []
    if ((n as Node).type === 'Box' && ch.length && textOf(ch[0]).replace(/^▍/, '').startsWith(head)) return ch
    return walk(ch)
  }
  return walk(tree)
}
const firstLines = (s: unknown[]) => s.slice(1).map(textOf).filter(l => /^[✓✗●○] /.test(l))

test('T-1079: the Claude Code panel names who wrote each history line, and shows the checker\'s full report under the Report', async ($, on) => {
  seed(on, TASK())
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const tree = await ui.drawn()
  await ui.unmount()
  // newest first: the checker's verdict (its first problem), the worker's hand-back (no checker words), the worker's start
  // (the terminal cuts each line to its first cells, so the lines are read by their start)
  const lines = firstLines(section(tree, 'History')!)
  expect(lines.length).toBe(3)
  expect(lines[0]).toMatch(/^✗ \d\d:\d\d checker symcc-T-505-checker: found/)
  expect(lines[1]).toMatch(/^✗ \d\d:\d\d worker symcc-T-505: try 2: /)
  expect(lines[2]).toMatch(/^● \d\d:\d\d worker symcc-T-505: try 2: worker/)
  const checker = section(tree, 'Checker (try 2) · symcc-T-505-checker')!.map(textOf).join('\n')
  expect(checker).toContain(CHECKER_FILE)
  expect(checker).toContain('I checked T-505 by importing the module')
  expect(checker).toContain('the docs name no example')
  // it comes under the worker's report, which holds only the worker's words
  expect(section(tree, 'Report (try 2)')!.map(textOf).join('\n')).toContain(WORKER_REPORT)
  expect(section(tree, 'Report (try 2)')!.map(textOf).join('\n')).not.toContain('docs name no example')
})

test('T-1079: the Claude Code panel has no ▍Checker section when the try had no checker', async ($, on) => {
  seed(on, TASK(HISTORY.slice(0, 2)))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const tree = await ui.drawn()
  await ui.unmount()
  expect(section(tree, 'Checker')).toBeUndefined()
})

test('T-1079: an old history entry with no saved agent shows "checker:" and no id', async ($, on) => {
  const old = [historyEntry('checker-ok', 'try 2: checker: OK', at, { try: 2 })]
  seed(on, TASK(old, []))
  const ui2 = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const lines = firstLines(section(await ui2.drawn(), 'History')!)
  await ui2.unmount()
  expect(lines.length).toBe(1)
  expect(lines[0]).toMatch(/^✓ \d\d:\d\d checker: OK$/)
})

test('T-1079: the VS Code board shows who wrote each history line and the Checker section with the full report', async ($, on) => {
  seed(on, TASK())
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const tree = await ui.drawn()
  await ui.unmount()
  const history = textOf(section(tree, 'History')!)
  expect(history).toContain(`${historyTime(at, T0)} · checker symcc-T-505-checker`)
  expect(history).toContain('found problems: the empty input still throws')
  expect(history).toContain(`${historyTime(at, T0)} · worker symcc-T-505 · try 2`)
  expect(history).not.toContain('docs name no example')
  expect(textOf(section(tree, 'Checker (try 2) · symcc-T-505-checker')!)).toContain(CHECKER_FILE)
  // its full text is drawn as Markdown (not plain Text), so it is in the tree's props
  expect(JSON.stringify(tree)).toContain('the docs name no example')
})

test('T-1079: the VS Code board has no Checker section when the try had no checker', async ($, on) => {
  seed(on, TASK(HISTORY.slice(0, 2)))
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const tree = await ui.drawn()
  await ui.unmount()
  expect(section(tree, 'Checker')).toBeUndefined()
})

test('T-1079: the text task view (Node and OpenCode hosts) says who wrote each line and has a Checker section', () => {
  const t = TASK()
  const out = taskText(t, false, [t], { file: REPORT_FILE, try: 2, text: WORKER_REPORT, checker: { file: CHECKER_FILE, agent: 'symcc-T-505-checker', text: CHECKER_FULL } })
  expect(out).toContain('checker symcc-T-505-checker: found problems: the empty input still throws')
  expect(out).toContain(`worker symcc-T-505: try 2: ${WORKER_REPORT} → the checker found problems`)
  expect(out).toContain(`Checker (try 2 · symcc-T-505-checker, ${CHECKER_FILE}):`)
  expect(out).toContain('  - the docs name no example')
  // no checker on that try: no section
  expect(taskText(t, false, [t], { file: REPORT_FILE, try: 2, text: WORKER_REPORT })).not.toContain('Checker (try')
})
