// Task pages with a lot in them (a long title, long Markdown details, timeline, runs, a report, tasks it waits for), one
// per status, for the tests that draw the task page on several surfaces (see vscode-task-page.test.tsx).
import type { On, ProcessRunResult } from 'claude-code'
import type { MockClock } from 'claude-code/testing'
import { T0, seedBoard } from './board-fixture'
import { ran, readText } from './fakes'
import { hist } from './timeline-fixture'
import { askShape } from './ask-shape'

const iso = (ms: number) => new Date(ms).toISOString()

const LONG_TITLE = 'Make the task page in the editor side panel wide and readable, with the full title, the details, the timeline and the latest report shown whole'
const DETAILS = [
  '## Goal',
  'The task page must use the full width of the panel and never cut a line with an ellipsis, even when the text is very long and goes on and on past the edge of the panel.',
  '',
  '- Show the **status** line first, then the title',
  '- Group the details under clear headings',
  '1. Write the test first against the old code',
  '2. Then change `hooks/plugin/ui/task-page.tsx`',
  '',
  'Done when: the tests show it.',
].join('\n')
const REPORT = ['# Report', '', 'Changed the task page so that every section wraps to the width of the panel instead of being cut at the edge.', '', ...Array.from({ length: 14 }, (_, i) => `- line ${i + 1} of the long report, with enough words to wrap at fifty columns`), '', 'Tests: claude plugin test . passed.'].join('\n')
const TIMELINE = [
  'try 1: started the change of the task page in the editor side panel → tests failed: two tests did not find the new section headings',
  'try 2: fixed the headings and wrapped every line to the panel width → merged into main',
]
const RUNS = [
  { started: iso(T0 - 7_200_000), ended: iso(T0 - 6_000_000), report: '.symcc/reports/T-501-try-1.md', agents: [{ kind: 'worker' as const, started: iso(T0 - 7_200_000), ended: iso(T0 - 6_000_000), tokens: { input: 1200, output: 3400 }, cost: 0.42 }] },
  { started: iso(T0 - 3_000_000), ended: iso(T0 - 1_800_000), report: '.symcc/reports/T-501-try-2.md', agents: [{ kind: 'worker' as const, started: iso(T0 - 3_000_000), ended: iso(T0 - 1_800_000), tokens: { input: 2000, output: 5000 }, cost: 0.8 }] },
]
const ORIGIN = { by: 'owner', request: 'also the task details looks to narrow and cut. need an entire work on that', why: 'the owner finds the task page in the editor side panel too narrow, and its lines are cut at the edge' }

const task = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${LONG_TITLE} (${status})`,
  details: DETAILS,
  files: ['hooks/plugin/ui/task-page.tsx', 'tests/', 'docs/guide.md'],
  status,
  note: '',
 
  priority: 0,
  after: ['T-499', 'T-498'],
  attempts: 2,
  timeline: hist(...TIMELINE),
  branch: null,
  created_at: iso(T0 - 86_400_000),
  updated_at: iso(T0 - 60_000),
  role: 'worker',
  origin: ORIGIN,
  runs: RUNS,
  ...askShape(extra),
})

/** One rich task per status (and an answered investigation), opened one by one in the tests. */
export const RICH_TASKS = [
  task('T-501', 'review'),
  task('T-502', 'failed', { note: 'tests failed' }),
  task('T-503', 'waiting', { question: 'Should the report show all of its lines at once, or only the first part with a button to show the rest?', options: ['Only the first part', 'All of it'] }),
  task('T-504', 'doing', { runs: [...RUNS.slice(0, 1), { started: iso(T0 - 300_000) }] }),
  task('T-505', 'paused'),
  task('T-506', 'todo', { attempts: 0, runs: [], timeline: [] }),
  task('T-507', 'backlog', { attempts: 0, runs: [], timeline: [] }),
  task('T-508', 'done'),
  task('T-509', 'dropped'),
  task('T-510', 'review', { kind: 'investigation', answer: 'Use the full width.', note: 'answered; waiting for you to read it' }),
  task('T-511', 'waiting', { asked_files: ['hooks/board.ts'], options: undefined }),
  { id: 'T-499', title: 'The first VS Code board task', details: '', files: [], status: 'done', note: '', priority: 0, after: [], attempts: 1, timeline: [], branch: null, created_at: iso(T0), updated_at: iso(T0) },
  { id: 'T-498', title: 'Another task it waits for', details: '', files: [], status: 'todo', note: '', priority: 0, after: [], attempts: 0, timeline: [], branch: null, created_at: iso(T0), updated_at: iso(T0) },
]

/** The ids of the rich tasks the tests open. */
export const RICH_IDS = RICH_TASKS.map(t => t.id).filter(id => id > 'T-500')

/** Seeds the board with the rich tasks (`opened` the one shown; '' the list, so a press can open another), their report files and a git that answers with no changes. `more`: other saved panel values (the tab, ...); `toasts`: gets each toast (as JSON). */
export function seedRich(on: On, opened: string, run: (argv: string[]) => ProcessRunResult = () => ran(), more: Record<string, unknown> = {}, toasts?: string[]): MockClock {
  const clock = seedBoard(on, {
    ...more,
    ...(opened ? { opened } : {}),
    view: { shape: 'view-1', value: { tasks: RICH_TASKS, working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: ['claude plugin test .'] } },
  })
  on('fs.read', (_, e, next) => (/reports\/T-5\d\d-try-1\.md$/.test(e.path) ? readText('First try: the tests failed.\n') : /reports\/T-5\d\d-try-2\.md$/.test(e.path) ? readText(REPORT) : next(e)))
  on('process.run', (_, e) => ({ value: run((e as { argv?: string[] }).argv ?? []) }))
  on('fs.exists', () => ({ value: false }))
  on('ui.toast', (_, e) => (toasts?.push(JSON.stringify(e)), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  return clock
}

export { LONG_TITLE, REPORT }
