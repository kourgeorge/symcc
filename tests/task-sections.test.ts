// The task page's sections as one shared model (T-580, hooks/core/task-sections.ts): which sections a task shows, in
// the Claude Code terminal page's order and with its headings, and what is in them, for a todo, doing, failed, review
// and done task and an answered investigation. The terminal draws them (its trees are checked unchanged in
// vscode-task-page.test.tsx) and so does OpenCode's panel (hooks/opencode/tests/opencode-tui.spec.ts).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccTask } from '../types'
import { taskSections, detailsLines, type TaskSection } from '../hooks/core/task-sections'
import { when } from '../hooks/core/days'
import { hist } from './timeline-fixture'

const NOW = Date.parse('2026-11-19T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const R1 = '.symcc/reports/T-1-try-1.md'
const R2 = '.symcc/reports/T-1-try-2.md'

const task = (status: SymccTask['status'], extra: Partial<SymccTask> & Record<string, unknown> = {}): SymccTask =>
  ({
    id: 'T-1', title: 'Fix the login', details: '## Goal\n- Check `hooks/a.ts`\nDone when: T-2 passes', files: ['hooks/'], status, note: '', priority: 1, after: [], attempts: 0,
    timeline: [], branch: null, created_at: iso(NOW - 3_600_000), updated_at: iso(NOW - 60_000), ...extra,
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

test('T-580: a doing task shows its Timeline (newest first, as a timeline), its Report "reading" until read, and its Runs', () => {
  const t = task('doing', { attempts: 1, timeline: hist('try 1: started'), runs: [run(R1, false)] })
  const s = taskSections(t, facts())
  expect(titles(s)).toEqual(['Details', 'What to do', 'Timeline (1, newest first)', 'Runs   1 try · 10m', 'Report · try 1 · worker'])
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
  const t = task('failed', { attempts: 1, note: 'tests failed', timeline: hist('try 1: changed it → tests failed'), runs: [run(R1)] })
  const s = taskSections(t, facts({ texts: { [R1]: 'NEED FILES: docs/guide.md' } }))
  expect(ids(s)).toEqual(['why', 'details', 'what', 'timeline', 'runs', 'report'])
  expect(sec(s, 'why')!.title).toBe('Why it failed')
  const why = text(sec(s, 'why'))
  expect(why.some(l => l.includes('docs/guide.md'))).toBe(true)
  expect(why.some(l => l.startsWith('  Next: '))).toBe(true)
})

test('T-580: a task in review shows its Changes: the folder, each file (a press opens its diff) and the hint', () => {
  const t = task('review', { attempts: 1, runs: [run(R1)] })
  const changes = { files: [{ file: 'hooks/a.ts', added: 3, removed: 1 }, { file: 'logo.png', added: 0, removed: 0, binary: true, edited: true }], error: '' }
  const s = taskSections(t, facts({ changes, target: 'main', dataDir: '.symcc', texts: { [R1]: 'Done.' } }))
  expect(ids(s)).toEqual(['details', 'changes', 'what', 'runs', 'report'])
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
  const t = task('done', { attempts: 2, timeline: hist('try 1: x → tests failed', 'try 2: y → merged into main'), runs: [run(R1), run(R2)] })
  const s = taskSections(t, facts({ texts: { [R2]: 'Second.' } }))
  expect(ids(s)).toEqual(['details', 'what', 'timeline', 'runs', 'report'])
  expect(sec(s, 'report')!.title).toBe('Report · try 2 · worker')
  expect(sec(s, 'report')!.tries).toEqual([{ try: 1, shown: false, key: '1' }, { try: 2, shown: true, key: '2' }])
  expect(sec(taskSections(t, facts({ shown: { try: 1, kind: 'worker' }, numberKeysTaken: true })), 'report')!.tries).toEqual([{ try: 1, shown: true }, { try: 2, shown: false }])
  // the timeline newest first, a connector between events
  const h = text(sec(s, 'timeline'))
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

// ---------------- T-1104: one Report section, picked from the Runs lines ----------------

const ck = (n: number) => `.symcc/reports/T-1-try-${n}-checker.md`
const rp = (n: number) => `.symcc/reports/T-1-try-${n}.md`
const AGENTS = [['aa0b1c2d3e4f5a6b7c8d815', 'a6f0b1c2d3e4f5a6b7c853d'], ['bb0b1c2d3e4f5a6b7c8d816', 'b6f0b1c2d3e4f5a6b7c853e'], ['cc0b1c2d3e4f5a6b7c8d817', 'c6f0b1c2d3e4f5a6b7c853f']]
const threeTries = (extra: Partial<SymccTask> = {}) => {
  const runs = [1, 2, 3].map(n => ({ started: iso(NOW - 900_000), ended: iso(NOW - 300_000), report: rp(n), agents: [{ id: AGENTS[n - 1]![0]!, kind: 'worker' as const, started: iso(NOW - 900_000), ended: iso(NOW - 600_000) }, { id: AGENTS[n - 1]![1]!, kind: 'checker' as const, started: iso(NOW - 600_000), ended: iso(NOW - 300_000) }] }))
  const timeline = [1, 2, 3].map(n => ({ at: iso(NOW), kind: 'checker-problems', text: `try ${n}: checker found problems`, try: n, agent: 'symcc-T-1-checker', report: ck(n) }))
  return task('todo', { attempts: 3, timeline: timeline as SymccTask['timeline'], runs, ...extra })
}
const texts3 = { [rp(1)]: 'W1', [rp(2)]: 'W2', [rp(3)]: 'W3', [ck(1)]: 'C1 said this', [ck(2)]: 'C2', [ck(3)]: 'C3' }

test('T-1104: three tries with a worker and a checker report each: one ▍Report, no ▍Checker, six pressable agent lines, the latest worker report shown', () => {
  const s = taskSections(threeTries(), facts({ texts: texts3 }))
  expect(ids(s)).not.toContain('checker')
  expect(ids(s).filter(x => x === 'report')).toEqual(['report'])
  expect(sec(s, 'report')!.title).toBe('Report · try 3 · worker cc0…815'.replace('cc0…815', 'cc0…817'))
  expect(text(sec(s, 'report'))).toEqual([`  ${rp(3)}`, '  W3'])
  const runs = sec(s, 'runs')!.lines
  const picks = runs.filter(l => l.pick)
  expect(picks.length).toBe(6)
  expect(picks.map(l => `${l.pick!.try} ${l.pick!.kind}`)).toEqual(['1 worker', '1 checker', '2 worker', '2 checker', '3 worker', '3 checker'])
  // the shown one has the ● and nobody else
  expect(runs.filter(l => l.shown).map(l => l.pick!.id)).toEqual([AGENTS[2]![0]])
  expect(runs.filter(l => l.shown).map(l => l.segs[0]!.text.startsWith('  ● ▸ worker'))).toEqual([true])
})

test('T-1104: picking try 1\'s checker shows its heading, its file\'s text and marks that line; key 2 (a worker pick of try 2) shows try 2\'s worker report', () => {
  const t = threeTries()
  const s = taskSections(t, facts({ texts: texts3, shown: { try: 1, kind: 'checker', id: AGENTS[0]![1] } }))
  expect(sec(s, 'report')!.title).toBe('Report · try 1 · checker a6f…53d')
  expect(text(sec(s, 'report'))).toEqual([`  ${ck(1)}`, '  C1 said this'])
  const marked = sec(s, 'runs')!.lines.filter(l => l.shown)
  expect(marked.map(l => [l.pick!.try, l.pick!.kind])).toEqual([[1, 'checker']])
  expect(marked[0]!.segs[0]!.text).toMatch(/^ {2}● ⌕ checker/)
  // key 2: try 2's worker report (no agent id picked: its last worker)
  const two = taskSections(t, facts({ texts: texts3, shown: { try: 2, kind: 'worker' } }))
  expect(sec(two, 'report')!.title).toBe('Report · try 2 · worker bb0…816')
  expect(text(sec(two, 'report'))).toEqual([`  ${rp(2)}`, '  W2'])
  expect(sec(two, 'runs')!.lines.filter(l => l.shown).map(l => l.pick!.id)).toEqual([AGENTS[1]![0]])
  // the keys 1-3 stay on the Report's tries
  expect(sec(two, 'report')!.tries!.map(x => x.key)).toEqual(['1', '2', '3'])
})

test('T-1104: an agent with no report file is plain text; a worker restarted on the same try has two lines that open the same file; an old try with no agent lines is one "try N" button', () => {
  const base = threeTries()
  // try 3 had no checker report: its checker line is plain
  const noChecker = task('todo', { ...base, timeline: base.timeline.filter(h => (h as { try?: number }).try !== 3) })
  const lines = sec(taskSections(noChecker, facts()), 'runs')!.lines
  const checker3 = lines.find(l => l.key === 'run-2-agent-1')!
  expect(checker3.segs[0]!.text).toContain('checker')
  expect(checker3.pick).toBeUndefined()
  expect(lines.filter(l => l.pick).length).toBe(5)
  // a restarted worker: two worker lines on try 1, one report file
  const runs = [...base.runs!]
  runs[0] = { ...runs[0]!, agents: [{ id: 'w1restart000000001', kind: 'worker' as const, started: iso(NOW - 900_000), ended: iso(NOW - 800_000), ended_by: 'restarted' as const }, ...runs[0]!.agents!] }
  const re = sec(taskSections(task('todo', { ...base, runs }), facts({ texts: texts3 })), 'runs')!.lines.filter(l => l.pick?.try === 1 && l.pick.kind === 'worker')
  expect(re.length).toBe(2)
  expect(re.map(l => l.pick!.id)).toEqual(['w1restart000000001', AGENTS[0]![0]])
  const shown = taskSections(task('todo', { ...base, runs }), facts({ texts: texts3, shown: { try: 1, kind: 'worker', id: 'w1restart000000001' } }))
  expect(sec(shown, 'report')!.title).toBe('Report · try 1 · worker w1r…001'.replace('w1r…001', 'w1r…001'))
  expect(text(sec(shown, 'report'))).toEqual([`  ${rp(1)}`, '  W1'])
  // an old try that keeps no agent lines: one plain "try N" line, a button while its worker report exists
  const old = task('done', { attempts: 2, runs: [run(R1), run(R2)] })
  const oldLines = sec(taskSections(old, facts()), 'runs')!.lines
  expect(oldLines.filter(l => l.pick).map(l => [l.pick!.try, l.pick!.id])).toEqual([[1, undefined], [2, undefined]])
  expect(oldLines[1]!.segs[0]!.text).toMatch(/^ {2}● try 2/)
  // no id known: the heading names only the kind
  expect(sec(taskSections(old, facts({ shown: { try: 1, kind: 'worker' } })), 'report')!.title).toBe('Report · try 1 · worker')
})

test('T-1104: an answered one-try investigation still shows its checker report when that is picked', () => {
  const t = task('review', { kind: 'investigation', answer: 'Short answer.', attempts: 1, runs: [{ started: iso(NOW - 900_000), ended: iso(NOW - 300_000), report: rp(1), agents: [{ id: AGENTS[0]![0]!, kind: 'worker' as const, started: iso(NOW - 900_000) }, { id: AGENTS[0]![1]!, kind: 'checker' as const, started: iso(NOW - 600_000) }] }], timeline: [{ at: iso(NOW), kind: 'checker-problems', text: 'x', try: 1, agent: 'symcc-T-1-checker', report: ck(1) }] as unknown as SymccTask['timeline'] })
  expect(ids(taskSections(t, facts({ texts: texts3 })))).not.toContain('report')
  const s = taskSections(t, facts({ texts: texts3, shown: { try: 1, kind: 'checker', id: AGENTS[0]![1] } }))
  expect(text(sec(s, 'report'))).toContain('  C1 said this')
})
