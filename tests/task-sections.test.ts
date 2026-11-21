// The task page's sections as one shared model (T-580, hooks/core/task-sections.ts): which sections a task shows, in
// the Claude Code terminal page's order and with its headings, and what is in them, for a todo, doing, failed, review
// and done task and an answered investigation. The terminal draws them (its trees are checked unchanged in
// vscode-task-page.test.tsx) and so does OpenCode's panel (hooks/opencode/tests/opencode-tui.spec.ts).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccTask } from '../types'
import { taskSections, detailsLines, type TaskSection } from '../hooks/core/task-sections'
import { when } from '../hooks/core/days'
import { hist } from './history-fixture'

const NOW = Date.parse('2026-11-19T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const R1 = '.symcc/reports/T-1-try-1.md'
const R2 = '.symcc/reports/T-1-try-2.md'

const task = (status: SymccTask['status'], extra: Partial<SymccTask> & Record<string, unknown> = {}): SymccTask =>
  ({
    id: 'T-1', title: 'Fix the login', details: '## Goal\n- Check `hooks/a.ts`\nDone when: T-2 passes', files: ['hooks/'], status, note: '', question: null, order: 1, after: [], attempts: 0,
    history: [], branch: null, created_at: iso(NOW - 3_600_000), updated_at: iso(NOW - 60_000), ...extra,
  }) as SymccTask

const run = (report: string, ended = true) => ({ started: iso(NOW - 600_000), ...(ended ? { ended: iso(NOW - 300_000) } : {}), report })
const facts = (more: Partial<Parameters<typeof taskSections>[1]> = {}) => ({ width: 80, nowMs: NOW, detail: { roles: [], all: [], when }, ...more })
const ids = (s: TaskSection[]) => s.map(x => x.id)
const titles = (s: TaskSection[]) => s.map(x => x.title)
const text = (s: TaskSection | undefined) => (s?.lines ?? []).map(l => l.segs.map(g => g.text).join(''))
const sec = (s: TaskSection[], id: TaskSection['id']) => s.find(x => x.id === id)

test('T-580: a todo task shows Details and What to do (its details, headings and bullets picked out), nothing else', () => {
  const s = taskSections(task('todo'), facts())
  expect(titles(s)).toEqual(['Details', 'What to do'])
  // T-751: the status is on the page header's state line, not in the Details
  expect(text(sec(s, 'details')).some(l => l.startsWith('Status:'))).toBe(false)
  expect(text(sec(s, 'details')).some(l => l.startsWith('Added:'))).toBe(true)
  expect(text(sec(s, 'details')).some(l => l.startsWith('Files:') && l.includes('hooks/'))).toBe(true)
  expect(text(sec(s, 'what'))).toEqual(['Goal', '• Check hooks/a.ts', 'Done when: T-2 passes'])
  const what = sec(s, 'what')!.lines
  expect(what[0]!.segs[0]).toEqual({ text: 'Goal', color: 'claude', bold: true })
  expect(what[1]!.segs.find(g => g.text === 'hooks/a.ts')?.color).toBe('ide')
  expect(what[2]!.segs.find(g => g.text === 'T-2')).toEqual({ text: 'T-2', color: 'claude', bold: true })
  // no details: says so
  expect(text(sec(taskSections(task('todo', { details: '' }), facts()), 'what'))).toEqual(['(no details)'])
  // long details lines wrap to the width
  expect(detailsLines('- ' + 'word '.repeat(30), 30).every(l => l.segs.map(g => g.text).join('').length <= 30)).toBe(true)
})

test('T-580: a doing task shows its History (newest first, as a timeline), its Report "reading" until read, and its Runs', () => {
  const t = task('doing', { attempts: 1, history: hist('try 1: started'), runs: [run(R1, false)] })
  const s = taskSections(t, facts())
  expect(titles(s)).toEqual(['Details', 'What to do', 'History (1, newest first)', 'Report (try 1)', 'Runs   1 try · 10m'])
  expect(text(sec(s, 'report'))).toEqual([`  ${R1}`, '  (reading the report…)'])
  expect(text(sec(s, 'runs'))[0]).toContain('(running)')
  expect(text(sec(s, 'runs')).at(-1)).toMatch(/^ {2}total: /)
  expect(sec(s, 'runs')!.lines[0]!.segs[0]!.color).toBe('success')
  // once read: its text, two spaces in
  expect(text(sec(taskSections(t, facts({ texts: { [R1]: 'Did it.\n\nAll good.' } })), 'report'))).toEqual([`  ${R1}`, '  Did it.', '', '  All good.'])
  // and a file that can't be read says so
  expect(text(sec(taskSections(t, facts({ texts: { [R1]: null } })), 'report'))).toEqual([`  ${R1}`, '  Could not read the report file.'])
})

test('T-580: a failed task starts with Why it failed (the reason, what its report asks, what to do next)', () => {
  const t = task('failed', { attempts: 1, note: 'tests failed', history: hist('try 1: changed it → tests failed'), runs: [run(R1)] })
  const s = taskSections(t, facts({ texts: { [R1]: 'NEED FILES: docs/guide.md' } }))
  expect(ids(s)).toEqual(['why', 'details', 'what', 'history', 'report', 'runs'])
  expect(sec(s, 'why')!.title).toBe('Why it failed')
  const why = text(sec(s, 'why'))
  expect(why.some(l => l.includes('docs/guide.md'))).toBe(true)
  expect(why.some(l => l.startsWith('  Next: '))).toBe(true)
})

test('T-580: a task in review shows its Changes: the folder, each file (a press opens its diff) and the hint', () => {
  const t = task('review', { attempts: 1, runs: [run(R1)] })
  const changes = { files: [{ file: 'hooks/a.ts', added: 3, removed: 1 }, { file: 'logo.png', added: 0, removed: 0, binary: true, edited: true }], error: '' }
  const s = taskSections(t, facts({ changes, target: 'main', dataDir: '.symcc', texts: { [R1]: 'Done.' } }))
  expect(ids(s)).toEqual(['details', 'changes', 'what', 'report', 'runs'])
  expect(sec(s, 'changes')!.title).toBe('Changes (2 files, against main) (includes your edits)')
  expect(text(sec(s, 'changes'))).toEqual([
    '  folder: .symcc/worktrees/T-1 · edit files there, then approve (the tests run again)',
    'hooks/a.ts  +3 -1',
    'logo.png    binary  edited by you',
    '  Enter on a file shows its diff · d all files',
  ])
  expect(sec(s, 'changes')!.lines.map(l => l.action)).toEqual([undefined, { diff: 'hooks/a.ts' }, { diff: 'logo.png' }, undefined])
  // the changed files not known (yet): no Changes section; a git error is said
  expect(ids(taskSections(t, facts()))).not.toContain('changes')
  expect(text(sec(taskSections(t, facts({ changes: { files: [], error: 'no git' } })), 'changes'))).toContain('  Could not read the changes: no git')
})

test('T-580: a done task with two tries shows the latest report (2 of 2) and its tries to pick, with number keys unless a question takes them', () => {
  const t = task('done', { attempts: 2, history: hist('try 1: x → tests failed', 'try 2: y → merged into main'), runs: [run(R1), run(R2)] })
  const s = taskSections(t, facts({ texts: { [R2]: 'Second.' } }))
  expect(ids(s)).toEqual(['details', 'what', 'history', 'report', 'runs'])
  expect(sec(s, 'report')!.title).toBe('Report (try 2, 2 of 2)')
  expect(sec(s, 'report')!.tries).toEqual([{ try: 1, shown: false, key: '1' }, { try: 2, shown: true, key: '2' }])
  expect(sec(taskSections(t, facts({ shownTry: 1, numberKeysTaken: true })), 'report')!.tries).toEqual([{ try: 1, shown: true }, { try: 2, shown: false }])
  // the history newest first, a connector between events
  const h = text(sec(s, 'history'))
  expect(h[0]).toContain('merged into main')
  expect(h[1]).toBe('│')
  expect(h.at(-1)).toContain('tests failed')
})

test('T-580: an answered investigation shows its Answer (the latest report\'s full text) and no Report twice', () => {
  const t = task('review', { kind: 'investigation', answer: 'Short answer.', attempts: 1, runs: [run(R1)] })
  const s = taskSections(t, facts({ texts: { [R1]: 'The full answer.\n\nWith a second part.' }, changes: { files: [], error: '' } }))
  expect(ids(s)).toEqual(['answer', 'details', 'what', 'runs'])
  expect(sec(s, 'answer')!.title).toBe('Answer (try 1)')
  expect(text(sec(s, 'answer'))).toEqual([`  ${R1}`, '  The full answer.', '', '  With a second part.'])
  // the report not read: the answer saved on the task
  expect(text(sec(taskSections(t, facts()), 'answer'))).toEqual([`  ${R1}`, '  Short answer.'])
})
