// T-615: one board with a task in each state a row's end text speaks of, and the end text every view gives it (both
// bands and the lead's text board; see rowEndText). Used by tests/pane.test.tsx (Claude Code's band), tests/board.test.ts
// (the lead's text board) and hooks/opencode/tests/opencode-tui.spec.ts (OpenCode's band). Not a test file itself.
import { addTask, emptyBoard, patchTask, type Board, type BoardTask } from '../hooks/board'

/** The time the board is looked at (ms). */
export const ROW_END_NOW = Date.parse('2026-11-20T12:00:00.000Z')
const AT = '2026-11-20T11:00:00.000Z'
/** A check step that started 10 s before ROW_END_NOW (fresh, so it counts as running). */
const FRESH = '2026-11-20T11:59:50.000Z'

/** The board: T-1 asks a question, T-2 asks for a file outside its list, T-3's merge waits for the owner's files,
 *  T-4 is in review, T-5 is approved and merging (its tests run), T-6 failed, T-7 asks for more time. */
export function rowEndBoard(): Board {
  let b: Board = emptyBoard()
  for (const title of ['a question', 'a file request', 'your files', 'a review', 'approved', 'a failure', 'more time']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, AT)[0]
  b = patchTask(b, 'T-1', { status: 'waiting', question: 'Which database?', note: 'waiting for you' }, AT)
  b = patchTask(b, 'T-2', { status: 'waiting', question: 'May I also change docs/a.md?', asked_files: ['docs/a.md'], note: 'waiting for you' } as Partial<BoardTask>, AT)
  b = patchTask(b, 'T-3', { status: 'review', merge_wait: { dirty: ['src/a.ts'] }, note: 'waiting for your files' } as Partial<BoardTask>, AT)
  b = patchTask(b, 'T-4', { status: 'review', note: 'ready for review' }, AT)
  b = patchTask(b, 'T-5', { status: 'review', note: 'running the tests' }, AT)
  // patchTask leaves the check step alone (the engine sets it), so it is set here
  b = { ...b, tasks: b.tasks.map(t => (t.id === 'T-5' ? { ...t, checking: { step: 'testing', at: FRESH } } : t)) }
  b = patchTask(b, 'T-6', { status: 'failed', note: 'the worker made no change' }, AT)
  b = patchTask(b, 'T-7', { status: 'doing', note: 'time is up', time_ask: AT, runs: [{ started: AT }] } as Partial<BoardTask>, AT)
  return b
}

/** Each task's end text, the same in every view. */
export const ROW_END: Record<string, string> = {
  'T-1': 'Which database?',
  'T-2': 'May I also change docs/a.md?',
  'T-3': 'waiting for your files on main: src/a.ts; commit or stash them, it merges on its own',
  'T-4': 'ready for review',
  'T-5': 'approved, merging',
  'T-6': 'The worker finished without changing any files.',
  'T-7': 'time is up',
}

/** The words the lead's text board puts before the end text (it reads "asks:" before a question). */
export const LEAD_BEFORE: Record<string, string> = { 'T-1': 'asks: ', 'T-2': 'asks: ' }
