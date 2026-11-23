// T-901: one board for the /<name>-tasks tests in every client (Claude Code, OpenCode, the Node host): a task waiting
// for the owner, one running (its second try), one in review, one failed, two to do (the second after the first), two
// backlog items and one done today. Only hooks/core: the OpenCode and Node host specs (bun test) import it too.
import { addTask, patchTask } from '../hooks/core/task'
import { emptyBoard, type Board } from '../hooks/core/board-file'

/** The board, made at `nowMs` (its running try started 4 minutes before). */
export function taskListBoard(nowMs: number): Board {
  const at = new Date(nowMs).toISOString()
  const started = new Date(nowMs - 4 * 60_000).toISOString()
  const titles = ['Pick the database', 'Add search to the list', 'Fix the login page', 'Speed up the import', 'Write the export', 'Test the export', 'Idea: dark mode', 'Idea: a CSV import', 'Tidy the README']
  let b = emptyBoard()
  for (const [i, title] of titles.entries()) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'], after: i === 5 ? ['T-5'] : [], backlog: i === 6 || i === 7 }, at)[0]
  b = patchTask(b, 'T-1', { status: 'waiting', ask: { by: 'worker', text: 'Postgres or SQLite?', options: ['Postgres', 'SQLite'], asked_at: at } }, at)
  b = patchTask(b, 'T-2', { status: 'doing', attempts: 2, live: { session: 'driver' }, runs: [{ started, agents: [{ id: 'w', kind: 'worker' as const, started }] }] }, at)
  b = patchTask(b, 'T-3', { status: 'review' }, at)
  b = patchTask(b, 'T-4', { status: 'failed', note: 'the tests failed' }, at)
  b = patchTask(b, 'T-9', { status: 'done' }, at)
  return b
}

/** What /symcc-tasks prints for taskListBoard (within a minute of making it: the running try shows "4m"). */
export const TASK_LIST_TEXT = [
  'NEEDS YOU (1)',
  '  ? T-1  waiting    Pick the database',
  '',
  'Running (1)',
  '  ▶ T-2  4m ↺2      Add search to the list',
  '',
  'In review (1)',
  '  ◆ T-3  review     Fix the login page',
  '',
  'Failed (1)',
  '  ✗ T-4  failed     Speed up the import',
  '',
  'To do (2)',
  '  ○ T-5  to do      Write the export',
  '  ○ T-6  after T-5  Test the export',
  '',
  'backlog 2 · done today 1 · dropped today 0',
  '/symcc-board opens the board · /symcc-task T-n opens one task',
].join('\n')

/** What /symcc-tasks prints for a board with no task. */
export const EMPTY_TASK_LIST_TEXT = ['No open tasks.', '', 'backlog 0 · done today 0 · dropped today 0', '/symcc-board opens the board · /symcc-task T-n opens one task'].join('\n')
