// T-851: a worker's prompt is sections in a fixed order (a registry), with an earlier-tries table, the owner's words,
// the lead's notes apart from the text, and {{task.<path>}} for any task fact. All of it is pure.
import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { buildPrompt, PROMPT_SECTIONS, PROMPT_ORDER, promptTemplate, type PromptSection } from '../hooks/core/prompt-sections'
import { fillPlaceholders, taskValue } from '../hooks/core/prompt-fill'
import { fillPrompt, fillRole, ROLE_PLACEHOLDERS, promptSectionLines } from '../hooks/core/prompts'
import { roleSection, leadRoleText } from '../hooks/core/roles'
import { splitLeadNotes, leadNotesText } from '../hooks/core/lead-notes'
import { triesRows, triesTable } from '../hooks/core/tries-table'
import { addDetailsText } from '../hooks/core/history'
import { hist } from './history-fixture'

const task = (over: Partial<SymccTask> = {}): SymccTask =>
  ({ id: 'T-7', title: 'Do it', details: 'Make it work.', files: ['src/a.ts', 'src/b.ts'], status: 'doing', note: '', order: 1, after: [], attempts: 1, history: [], branch: null, created_at: '', updated_at: '', origin: { by: 'owner', why: 'the owner wants it', request: 'please make it work\nand fast', at: '' }, ...over }) as SymccTask

const values = (t: SymccTask): Record<string, string> => ({ name: 'symcc', task_id: t.id, title: t.title, details: t.details, branch: 'symcc/T-7', folder: '/w/T-7', kind: '\nKind of task: change.\n', kind_name: 'change', role_name: 'general', role: '', org_mem: '', learned: '', ask: 'ASK', files: 'F', test_command: 'TESTS', file_tools: 'Edit' })

const headings = (p: string) => [...p.matchAll(/^#{1,2} (.*)$/gm)].map(m => m[1]!)

test('(a) a change prompt has its sections in the fixed order, and an empty section is left out', () => {
  const t = task({ history: hist('try 1: Fixed it. → tests failed: 2 failed') , test_output: '$ npm test (exit 1)\nboom' })
  const p = fillPrompt('change', { ...values(t), org_mem: 'Organizational memory (org-mem): notes\n- a', role: '## Your role: tester\n- check' }, t)
  expect(headings(p)).toEqual(['Task T-7: Do it', "Why, in the owner's words", 'What to do', 'Your role: tester', 'Files you may change', 'Where you work', 'Earlier tries', 'Last failure in full', 'Tests', 'Rules', 'Notes from earlier agents', "When you're done"])
  // no lead notes, no commits, no org-mem, no failure, no tries, no role: those sections are not there at all (no empty heading)
  const bare = task({ origin: undefined })
  const q = fillPrompt('change', values(bare), bare)
  expect(headings(q)).toEqual(['Task T-7: Do it', 'What to do', 'Files you may change', 'Where you work', 'Tests', 'Rules', "When you're done"])
  expect(q).not.toMatch(/^## .*\n\n(##|$)/m)
})

test('(b) the tries table gives one row per try with its ending and reason, and has no lead note', () => {
  const t = task({
    attempts: 3,
    history: [
      ...hist('created by the lead because x', 'try 1: Added the parser. Then more words. → the checker found problems: the save button is never enabled'),
      { kind: 'checker-problems', text: 'try 1: checker found problems: the save button is never enabled. Also no test.', try: 1 },
      ...hist('try 2: Fixed the button. → tests failed: 2 failed in a.test.ts', 'try 3: Merged main by hand. → conflicts with the latest main (after 1 automatic retry)'),
      { kind: 'note', text: 'the lead added a note: “NOTE-SECRET”' },
      { kind: 'stage', text: 'try 3: checker started', try: 3, step: 'checker' },
    ],
  })
  const rows = triesRows(t)
  expect(rows.map(r => [r.try, r.ended])).toEqual([[1, 'sent back by the checker'], [2, 'tests failed'], [3, 'clash with main']])
  expect(rows[0]!.said).toBe('Added the parser.')
  expect(rows[0]!.finding).toBe('the save button is never enabled.')
  expect(rows[1]!.reason).toBe('tests failed: 2 failed in a.test.ts')
  expect(rows[2]!.reason).toContain('conflicts with the latest main')
  const table = triesTable(t)!
  expect(table.split('\n')).toHaveLength(5)
  expect(table).not.toContain('NOTE-SECRET')
  expect(table).not.toContain('…')
  // only the last 5 tries
  const many = task({ history: hist(...[1, 2, 3, 4, 5, 6, 7].map(n => `try ${n}: said ${n}. → tests failed: x${n}`)) })
  expect(triesRows(many).map(r => r.try)).toEqual([3, 4, 5, 6, 7])
  expect(triesTable(task())).toBeNull()
})

test('(c) the lead\'s notes are split from "What to do" and listed oldest first under their heading', () => {
  let d = 'Make it work.\n\nDone when: it works.'
  d = addDetailsText(d, 'first note', '2026-11-20')
  d = addDetailsText(d, 'second note', '2026-11-21')
  expect(splitLeadNotes(d)).toEqual({ text: 'Make it work.\n\nDone when: it works.', notes: [{ day: '2026-11-20', text: 'first note' }, { day: '2026-11-21', text: 'second note' }] })
  expect(leadNotesText([])).toBeNull()
  const t = task({ details: d })
  const p = fillPrompt('change', values(t), t)
  const what = p.slice(p.indexOf('## What to do'), p.indexOf('## Notes from the lead'))
  expect(what).toContain('Done when: it works.')
  expect(what).not.toContain('Note (lead')
  const notes = p.slice(p.indexOf('## Notes from the lead'), p.indexOf('## Files you may change'))
  expect(notes).toContain('Where a note and the text above differ, the newest note wins.')
  expect(notes.indexOf('first note')).toBeGreaterThan(0)
  expect(notes.indexOf('second note')).toBeGreaterThan(notes.indexOf('first note'))
  // the owner's answer stays in the text
  expect(splitLeadNotes(`A\n\nNote (lead, 2026-11-20): n\n\nOwner's answer: yes`).text).toBe("A\n\nOwner's answer: yes")
})

test("(d) the owner's request and the why line come under \"Why, in the owner's words\"", () => {
  const t = task()
  const p = fillPrompt('change', values(t), t)
  const why = p.slice(p.indexOf("## Why, in the owner's words"), p.indexOf('## What to do'))
  expect(why).toContain('the owner wants it')
  expect(why).toContain('> please make it work\n> and fast')
})

test('(e) {{task.<path>}} fills any task field in a prompt and in a role checklist; a missing path is empty; details text is never filled', () => {
  const t = task({ details: 'see {{task.title}} and {{files}}' })
  expect(taskValue(t, 'origin.request')).toBe('please make it work\nand fast')
  expect(taskValue(t, 'files')).toBe('src/a.ts\nsrc/b.ts')
  expect(taskValue(t, 'origin')).toContain('why: the owner wants it')
  expect(taskValue(t, 'nope.deeper')).toBe('')
  expect(taskValue(t, '__proto__')).toBe('')
  expect(taskValue(t, 'constructor.name')).toBe('')
  // in a built-in prompt (a section's fixed words) and in the details
  const sections: PromptSection[] = [{ name: 'extra', kinds: ['change'], heading: 'Extra', about: 'x', template: () => '', text: c => fillPlaceholders('R: {{task.origin.request}} / F: {{task.files}} / M: [{{task.nope}}]', c.values, c.values, c.task) }]
  const p = buildPrompt({ kind: 'change', values: values(t), task: t }, sections, { ...PROMPT_ORDER, change: ['extra'] })
  expect(p).toBe('## Extra\n\nR: please make it work\nand fast / F: src/a.ts\nsrc/b.ts / M: []')
  // in a role checklist (a role needs no code to pull in a task fact)
  const role = { name: 'tester', description: 'd', skills: [], prompt: '- ask: {{task.origin.request}}\n- files: {{task.files}}\n- none: [{{task.nope}}]' }
  const rs = roleSection(role, values(t), t)
  expect(rs).toBe('## Your role: tester\n- ask: please make it work\nand fast\n- files: src/a.ts\nsrc/b.ts\n- none: []')
  expect(fillRole('{{task.title}}', {}, t)).toBe('Do it')
  expect(fillRole('{{task.title}}', {})).toBe('{{task.title}}')
  // the details text is never filled in, even through the whole prompt
  const full = fillPrompt('change', values(t), t)
  expect(full).toContain('see {{task.title}} and {{files}}')
  expect(Object.keys(ROLE_PLACEHOLDERS)).toContain('task.<path>')
})

test('(f) a section added to the registry shows up in its place', () => {
  const t = task({ history: [] })
  const extra: PromptSection = { name: 'priority', kinds: ['change'], heading: 'How urgent', about: 'urgency', template: () => '{{task.order}}', text: c => `order ${c.task?.order}` }
  const order = { ...PROMPT_ORDER, change: PROMPT_ORDER.change.flatMap(n => (n === 'files' ? ['priority', n] : [n])) }
  const p = buildPrompt({ kind: 'change', values: values(t), task: t }, [...PROMPT_SECTIONS, extra], order)
  const hs = headings(p)
  expect(hs.indexOf('How urgent')).toBe(hs.indexOf('Files you may change') - 1)
  expect(p).toContain('## How urgent\n\norder 1')
  expect(promptTemplate('change', [...PROMPT_SECTIONS, extra], order)).toContain('## How urgent\n\n{{task.order}}')
  // without a place in the order it is not in the prompt
  expect(buildPrompt({ kind: 'change', values: values(t), task: t }, [...PROMPT_SECTIONS, extra])).not.toContain('How urgent')
})

test('(g) the investigation and checker prompts get their sections too', () => {
  const t = task({ kind: 'investigation' } as Partial<SymccTask>)
  const v = { ...values(t), kind_name: 'investigation' }
  const q = fillPrompt('investigation', { ...v, ask_more: '' }, t)
  expect(headings(q)).toEqual(['Task T-7: Do it', "Why, in the owner's words", 'What to do', 'Where you work', 'Rules', "When you're done"])
  const c = buildPrompt({ kind: 'checker', task: t, values: { ...v, into: 'main', diff: 'D', changed_files: '  a.ts', tests: 'T' } })
  expect(headings(c)).toEqual(['Task T-7: Do it', "Why, in the owner's words", 'What to do', 'What to look for', 'Where you work', 'Files it changed', 'Tests', 'The change', 'Rules', "When you're done"])
  expect(c).toContain('## The change\n\nThe change (from where it left main')
  // the Roles page lists the sections
  expect(promptSectionLines('change')[0]).toContain('who the agent is')
  const role = { name: 'tester', description: 'd', skills: [], prompt: '- x' }
  expect(leadRoleText(role, 'built-in', 'roles/tester.md')).toContain('{{task.<path>}}')
  expect(leadRoleText(role, 'built-in', 'roles/tester.md')).toContain('Files you may change: ')
})

test('T-851: an owner follow-up question after a lead note stays in the text; a finding is the first problem, not the opening sentence; "stopped" keeps its reason', () => {
  const d = `Find out why X is slow.\n\nNote (lead, 2026-11-21): look in hooks/y.ts first\n\nFollow-up question (owner, 2026-11-22): And W?\nThe earlier answer (try 1): ok`
  const s = splitLeadNotes(d)
  expect(s.notes).toEqual([{ day: '2026-11-21', text: 'look in hooks/y.ts first' }])
  expect(s.text).toContain('Follow-up question (owner, 2026-11-22)')
  const t = task({ history: [({ kind: 'checker-problems', text: 'try 1: checker found problems: I probed it carefully. Problems:\n- hooks/a.ts:12 crashes on empty input; run X.', try: 1 }), ({ kind: 'stopped', text: 'try 2: stopped before finishing', try: 2, reason: 'stopped' })] as never })
  const rows = triesRows(t)
  expect(rows[0]!.finding).toBe('hooks/a.ts:12 crashes on empty input; run X.')
  expect(rows[1]!.reason).toBe('stopped before finishing')
})
