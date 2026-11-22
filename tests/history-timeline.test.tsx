// T-512: the task page's history reads as a timeline (a mark per event, a connector line between them), and each
// mark comes from what kind of event the entry is, never from words inside quoted text or a reason.
// T-522: entries are records { at, kind, text }: the mark comes from the saved kind; an old line converted once
// gets its kind guessed from its text; each entry shows when it happened.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0, seedBoard } from './board-fixture'
import { historyEntry, historyEvent, historyTime, HISTORY_MARK, workerStartedEntry, workerHandedBackEntry } from '../hooks/core/history'
import { hist } from './history-fixture'
import { handedOff, withHistory, type BoardTask } from '../hooks/board'

/** An old line (from before T-522) as the one-time conversion reads it, as an event. */
import { oldHistoryEntry } from '../hooks/core/old-data'
const old = (l: string) => historyEvent(oldHistoryEntry(l))

const iso = (ms: number) => new Date(ms).toISOString()

/** T-504's history as the owner saw it (oldest first), with the words that used to give a wrong ✗. */
const HISTORY = [
  'created by the owner because the scouts keep stopping after a scout failed in OpenCode with two failures',
  'try 1: tried the first fix → tests failed: the scout test did not pass',
  'the lead added a note: “the earlier try failed because the scout folder was missing”',
  'waits on changed: T-500, T-498 → T-500',
  'try 2: checker: OK',
]

test('an old line converted once: the kind and the mark come from what the line is, not from words in its text', () => {
  const [created, tried, note, waits, checker] = HISTORY.map(old)
  expect(created).toMatchObject({ kind: 'created', tone: 'other', mark: '○', try: 0, label: '' })
  expect(note).toMatchObject({ kind: 'note', tone: 'other', mark: '○' })
  expect(waits).toMatchObject({ kind: 'waits-changed', tone: 'other', said: HISTORY[3], result: '' })
  expect(tried).toMatchObject({ kind: 'failed', tone: 'bad', mark: '✗', try: 1, label: 'try 1', said: 'tried the first fix', result: 'tests failed: the scout test did not pass' })
  expect(checker).toMatchObject({ kind: 'checker-ok', tone: 'good', mark: '✓', try: 2 })
  expect(old('try 2: fixed it → merged into main (abc1234)')).toMatchObject({ kind: 'merged', tone: 'good', mark: '✓' })
  expect(old('try 2: fixed it → not merged: the branch moved')).toMatchObject({ tone: 'bad' })
  // a worker's summary that says "failed" does not make a merged try bad
  expect(old('try 3 (role tester): the old test failed, so I fixed it → merged into main')).toMatchObject({ tone: 'good', try: 3, label: 'try 3 (role tester)' })
  expect(old('try 2: checker found problems: the error test is missing')).toMatchObject({ kind: 'checker-problems', tone: 'bad' })
  expect(old('try 2: stopped: paused: Owner: run only T-527 for now')).toMatchObject({ kind: 'stopped', tone: 'bad' })
  expect(old('try 2: worker asked: which error message should it show?')).toMatchObject({ kind: 'asked', tone: 'step', mark: '●' })
  expect(old('the owner answered: “it failed for me too”')).toMatchObject({ kind: 'answer', tone: 'other' })
  expect(Object.values(HISTORY_MARK)).toEqual(['✓', '✗', '●', '○'])
})

test('a new entry\'s mark comes from its saved kind, whatever words its text holds', () => {
  const at = new Date(T0).toISOString()
  // a note or a "created" line that says "failed" or has a " → tests failed" is never bad
  expect(historyEvent(historyEntry('note', 'the lead added a note: “try 2: x → tests failed”', at))).toMatchObject({ kind: 'note', tone: 'other', mark: '○', at })
  expect(historyEvent(historyEntry('created', 'created by the owner because the build failed', at))).toMatchObject({ tone: 'other' })
  // a worker's question with an arrow and "merged into" in it stays a step, not a result
  expect(historyEvent(historyEntry('asked', 'try 2: worker asked: should x → merged into main?', at))).toMatchObject({ tone: 'step', said: 'worker asked: should x → merged into main?', result: '' })
  // a try's result: its mark from the kind (the outcome symcc saved), the text still split at the result's " → "
  expect(historyEvent(historyEntry('failed', 'try 2: all good → merged into main', at, { try: 2, result: 'merged into main' }))).toMatchObject({ tone: 'bad', said: 'all good', result: 'merged into main' })
  expect(historyEvent(historyEntry('merged', 'try 2: the old test failed → merged into main (abc1234)', at))).toMatchObject({ tone: 'good', try: 2, label: 'try 2' })
  expect(historyEvent(historyEntry('checker-problems', 'try 2: checker found problems: x', at)).mark).toBe('✗')
  // T-723: a try's worker start and hand-back are stage lines: a step mark, their try split off like "prep started"
  for (const e of [workerStartedEntry({ attempts: 2, role: 'tester', history: [] }, true), workerHandedBackEntry({ attempts: 2 }), ['stage', 'try 2: prep started', { try: 2, step: 'prep' }] as const])
    expect(historyEvent(historyEntry(e[0], e[1], at, e[2]))).toMatchObject({ kind: 'stage', tone: 'step', mark: '●', try: 2, label: 'try 2' })
  expect(historyEvent(historyEntry(...(([k, t, f]) => [k, t, at, f] as const)(workerStartedEntry({ attempts: 2, role: 'tester', history: [] }, true)))).text).toBe('worker started (role tester) · merges main in first')
  // T-723: a drive hand-over gives the try its number back too, but it is no change: no "same try number" mark,
  // even with a note earlier in that try (its own "restarted" line already says why)
  const started = withHistory([], at, workerStartedEntry({ attempts: 2, role: 'tester', history: [] }, false), ['note', 'Note added: x'])
  const off = handedOff({ id: 'T-1', title: 'x', details: '', status: 'doing', attempts: 2, role: 'tester', note: 'worker on it', live: { session: 's' }, runs: [{ started: at }, { started: at }], history: started } as BoardTask, at)
  expect(workerStartedEntry({ ...off, attempts: off.attempts + 1 }, false)).toEqual(['stage', 'try 2: worker started (role tester)', { try: 2, step: 'worker-start' }])
  expect(workerStartedEntry({ attempts: 2, role: 'tester', history: started }, false)[1]).toBe('try 2: worker started (role tester) · same try number (note joined)')
  // a kind symcc doesn't know is drawn as "anything else"
  expect(historyEvent({ kind: 'nonsense', text: 'try 1: stopped: x' })).toMatchObject({ kind: 'other', tone: 'other', at: '' })
})

test('historyTime: "10:42" for today, "Nov 18 22:49" for an older day, nothing when the entry has no time', () => {
  const now = new Date(2026, 10, 19, 15, 0).getTime()
  expect(historyTime(new Date(2026, 10, 19, 10, 42).toISOString(), now)).toBe('10:42')
  expect(historyTime(new Date(2026, 10, 18, 22, 49).toISOString(), now)).toBe('Nov 18 22:49')
  expect(historyTime(new Date(2025, 0, 3, 7, 5).toISOString(), now)).toBe('Jan 3 07:05')
  expect(historyTime(undefined, now)).toBe('')
  expect(historyTime('not a time', now)).toBe('')
})

test('an old line converted once: a try\'s result is read from the words symcc writes after " → ", not from a "→" in free text', () => {
  const mark = (l: string) => old(l).mark
  expect(mark('try 2: x → already merged into main (abc1234) by an earlier try; nothing new to merge')).toBe('✓')
  expect(mark('try 2: x → the checker found problems: the test is missing')).toBe('✗')
  expect(mark('try 2: x → conflicts with the latest main, still after 3 tries to merge it in')).toBe('✗')
  expect(mark('try 2: x → tests failed: `bun test` (exit 1). expected a → b')).toBe('✗')
  expect(old('try 2: renamed a → b → tests failed: `bun test` (exit 1). expected a → merged')).toMatchObject({ said: 'renamed a → b', tone: 'bad' })
  expect(mark('try 2: renamed a → b → merged into main (abc1234)')).toBe('✓')
  expect(mark('try 2: x → checks passed; the checker looks at it before it merges')).toBe('●')
  expect(mark('try 2: out of time; handed back: renamed a → b (its work so far is kept in its folder and branch)')).toBe('✗')
  expect(mark('try 2: stopped: Owner: rename a → b first')).toBe('✗')
  expect(mark('try 2: rejected by the owner: use a → b')).toBe('✗')
  expect(mark('try 2: worker asked: should x → fail?')).toBe('●')
  expect(mark('try 2: answered: the build → error path is fine')).toBe('●')
})

const TASK = {
  id: 'T-504', title: 'The scouts keep stopping', details: '', files: ['tests/'], status: 'todo', note: '', question: null, order: 504, after: ['T-500'],
  attempts: 2, history: hist(...HISTORY), branch: null, created_at: iso(T0 - 86_400_000), updated_at: iso(T0 - 60_000), role: 'worker',
}
const seed = (on: Parameters<typeof seedBoard>[0]) => {
  seedBoard(on, { opened: 'T-504', view: { shape: 'view-1', value: { tasks: [TASK], working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: [] } } })
  on('fs.exists', () => ({ value: false }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
/** All the text of a drawn node. */
const textOf = (n: unknown): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' ? textOf((n as Node).children ?? []) : '')
/** The children of the first Box whose first child's text starts with `head` (a page section, its heading first). */
function section(tree: unknown, head: string): unknown[] {
  const walk = (n: unknown): unknown[] | undefined => {
    if (Array.isArray(n)) return n.map(walk).find(Boolean)
    if (!n || typeof n !== 'object') return undefined
    const ch = (n as Node).children ?? []
    if ((n as Node).type === 'Box' && ch.length && textOf(ch[0]).replace(/^▍/, '').startsWith(head)) return ch
    return walk(ch)
  }
  return walk(tree) ?? []
}

test('the terminal task page draws the history as a timeline, newest first, with a connector line between events', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const lines = section(await ui.drawn(), 'History').slice(1).map(textOf)
  await ui.unmount()
  // newest first: the checker's OK, waits changed, the note, the failed try, created; a "│" line between each
  const firsts = lines.filter(l => /^[✓✗●○] /.test(l))
  expect(firsts.map(l => l.slice(0, 1))).toEqual(['✓', '○', '○', '✗', '○'])
  expect(firsts[0]).toBe('✓ try 2: checker: OK')
  expect(firsts[1]).toBe('○ waits on changed: T-500, T-498 → T-500')
  expect(firsts[2]).toMatch(/^○ the lead added a note: /)
  expect(firsts[3]).toMatch(/^✗ try 1: tried the first fix/)
  expect(firsts[4]).toMatch(/^○ created by the owner because/)
  expect(lines[1]).toBe('│')
  expect(lines.filter(l => l === '│').length).toBe(HISTORY.length - 1)
  // a long line wraps under its own mark, the connector going on beside it; the oldest has nothing below it
  const note = lines.indexOf(firsts[2]!)
  expect(lines[note + 1]).toMatch(/^│ \S/)
  expect(lines.at(-1)).toMatch(/^ {2}\S/)
  expect(lines.slice(lines.indexOf(firsts[4]!) + 1).every(l => l.startsWith('  '))).toBe(true)
})

test('the VS Code task page uses the same kinds and marks, on one rail with no "│" rows (T-699)', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const marks: string[] = []
  for (let i = 0; i < HISTORY.length; i++) marks.push(String((await ui.find({ key: `vs-history-${i}` }))?.text).slice(0, 1))
  expect(marks).toEqual([...HISTORY].reverse().map(l => old(l).mark))
  expect(marks).toEqual(['✓', '○', '○', '✗', '○'])
  // the line of the rail is a Box beside each event (all but the oldest), never a "│" text
  expect(textOf(section(await ui.drawn(), 'History'))).not.toContain('│')
  const lines: boolean[] = []
  for (let i = 0; i < HISTORY.length; i++) lines.push(!!(await ui.find({ key: `vs-history-${i}` }))?.children?.flat(9).some(c => c && typeof c === 'object' && ((c as Node).children ?? []).flat(9).some(d => d && typeof d === 'object' && (d as Node).type === 'Box')))
  expect(lines).toEqual([true, true, true, true, false])
  await ui.unmount()
})

test('both task pages show when each entry happened, beside its mark; an entry with no time shows none', async ($, on) => {
  const today = new Date(T0 - 30 * 60_000).toISOString()
  const older = new Date(T0 - 2 * 86_400_000).toISOString()
  const history = [historyEntry('created', 'created by the owner because x', older), historyEntry('checker-ok', 'try 1: checker: OK', today), { kind: 'note', text: 'the lead added a note: “old”' }]
  seedBoard(on, { opened: 'T-504', view: { shape: 'view-1', value: { tasks: [{ ...TASK, history }], working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: [] } } })
  on('fs.exists', () => ({ value: false }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const firsts = section(await ui.drawn(), 'History').slice(1).map(textOf).filter(l => /^[✓✗●○] /.test(l))
  await ui.unmount()
  expect(firsts).toEqual(['○ the lead added a note: “old”', `✓ ${historyTime(today, T0)} try 1: checker: OK`, `○ ${historyTime(older, T0)} created by the owner because x`])
  expect(historyTime(today, T0)).toMatch(/^\d\d:\d\d$/)
  expect(historyTime(older, T0)).toMatch(/^Nov \d+ \d\d:\d\d$/)
  const vs = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const body = textOf(section(await vs.drawn(), 'History'))
  await vs.unmount()
  expect(body).toContain(`${historyTime(today, T0)} · try 1`)
  expect(body).toContain(`${historyTime(older, T0)}created by the owner`)
})
