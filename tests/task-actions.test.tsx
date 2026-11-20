// The task page's actions and "what does it ask" rule live once in hooks/core (T-575): taskActions gives the buttons
// (terminal and VS Code) and the terminal's key hints (taskKeys), and taskAsks what a task asks with which choices.
// These tests check both for every task status, and that VS Code's buttons are the same list.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { taskActions, taskAsks, taskKeys, actionButtonLabel, type BoardTask, type TaskAction } from '../hooks/board'
import { vsActions } from '../hooks/claude/ui/vscode-task'

const T = '2026-11-09T00:00:00.000Z'
const tk = (status: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'T-1', title: 'x', details: '', files: [], status, note: '', question: null, order: 0, after: [], attempts: 1, history: [], branch: null, created_at: T, updated_at: T, ...extra }) as unknown as BoardTask
const ids = (a: TaskAction[]) => a.map(x => x.id)
const keyed = (a: TaskAction[]) => a.filter(x => x.key).map(x => `${x.key} ${x.word}`)
const main = (a: TaskAction[]) => a.filter(x => x.main).map(x => x.id)
const hints = (t: BoardTask, worker = false) => taskKeys(taskActions(t, { worker })).map(k => `${k.key} ${k.word}`)
const FILE_WAIT = { merge_wait: { dirty: ['a.ts'], untracked: [], ignored: [] } }

test('taskActions: the buttons of each status, in order, with their keys and at most one main action', () => {
  expect(ids(taskActions(tk('todo')))).toEqual(['pause', 'stash', 'role', 'drop', 'needs-review', 'copy'])
  expect(ids(taskActions(tk('doing'), { worker: true }))).toEqual(['watch', 'pause', 'drop', 'needs-review', 'copy'])
  expect(ids(taskActions(tk('paused')))).toEqual(['resume', 'stash', 'role', 'already-merged', 'drop', 'needs-review', 'copy'])
  expect(main(taskActions(tk('paused')))).toEqual(['resume'])
  expect(ids(taskActions(tk('waiting', { question: 'Which?' })))).toEqual(['already-merged', 'drop', 'needs-review', 'copy'])
  // waiting with files: the answer buttons are taskAsks' choices, not page actions
  expect(ids(taskActions(tk('waiting', { question: 'More files?', asked_files: ['b.ts'] })))).toEqual(['already-merged', 'drop', 'needs-review', 'copy'])
  expect(ids(taskActions(tk('waiting', FILE_WAIT)))).toEqual(['merge-now', 'already-merged', 'drop', 'needs-review', 'copy'])
  expect(main(taskActions(tk('waiting', FILE_WAIT)))).toEqual(['merge-now'])
  expect(ids(taskActions(tk('waiting', FILE_WAIT), { merging: true }))).toEqual(['already-merged', 'drop', 'needs-review', 'copy'])
  expect(ids(taskActions(tk('review')))).toEqual(['approve', 'reject', 'show-changes', 'drop', 'needs-review', 'copy'])
  expect(main(taskActions(tk('review')))).toEqual(['approve'])
  // in review x is Reject, so Drop has no key
  expect(taskActions(tk('review')).find(x => x.id === 'drop')?.key).toBeUndefined()
  expect(ids(taskActions(tk('review'), { merging: true }))).toEqual(['show-changes', 'drop', 'needs-review', 'copy'])
  expect(ids(taskActions(tk('review', { kind: 'investigation' })))).toEqual(['done', 'keep-note', 'ask-more', 'drop', 'needs-review', 'copy'])
  expect(ids(taskActions(tk('failed')))).toEqual(['retry', 'stash', 'role', 'already-merged', 'drop', 'needs-review', 'copy'])
  expect(main(taskActions(tk('failed')))).toEqual(['retry'])
  expect(ids(taskActions(tk('failed', { attempts: 0 })))).not.toContain('already-merged')
  expect(ids(taskActions(tk('dropped')))).toEqual(['retry', 'already-merged', 'copy'])
  expect(main(taskActions(tk('dropped')))).toEqual([])
  expect(ids(taskActions(tk('backlog')))).toEqual(['to-todo', 'role', 'drop', 'needs-review', 'copy'])
  expect(ids(taskActions(tk('done')))).toEqual(['copy'])
  // a running worker over its time limit asks, so nothing is the main action
  expect(main(taskActions(tk('doing', { time_ask: T })))).toEqual([])
  expect(taskActions(tk('todo', { needs_review: true })).find(x => x.id === 'needs-review')?.label).toBe('Needs review: on')
  // the terminal's button words: some say their key
  expect(taskActions(tk('backlog')).map(actionButtonLabel)).toEqual(['Move to todo (o)', 'Role (l)', 'Drop', 'Needs review: off', 'Copy (y)'])
})

test('taskKeys: the hints are the buttons that have a key, in their order (p, u, h, n, r on dropped, x drop included)', () => {
  for (const t of [tk('todo'), tk('doing'), tk('paused'), tk('waiting', FILE_WAIT), tk('review'), tk('review', { kind: 'investigation' }), tk('failed'), tk('dropped'), tk('backlog'), tk('done')]) {
    const a = taskActions(t, { worker: true })
    expect(taskKeys(a).map(k => `${k.key} ${k.word}`).slice(0, -3)).toEqual(keyed(a).filter(k => k !== 'y copy'))
  }
  expect(hints(tk('todo'))).toEqual(['p pause', 'z stash to backlog', 'l role', 'x drop', 'n needs review', 'y copy', '↑↓ scroll', 'b back'])
  expect(hints(tk('paused'))).toEqual(['u resume', 'z stash to backlog', 'l role', 'h already merged', 'x drop', 'n needs review', 'y copy', '↑↓ scroll', 'b back'])
  expect(hints(tk('dropped'))).toEqual(['r retry', 'h already merged', 'y copy', '↑↓ scroll', 'b back'])
  expect(hints(tk('review'))).toEqual(['a approve', 'x reject', 'd show changes', 'n needs review', 'y copy', '↑↓ scroll', 'b back'])
  expect(hints(tk('done'))).toEqual(['y copy', '↑↓ scroll', 'b back'])
})

test('taskActions keys: none is j or k (they always move), none clashes on one page, stash is z and keep as a note v (T-592)', () => {
  // the page's own keys beside its actions: b back, t s c the views, the number keys of the answer buttons
  const pageKeys = ['b', 't', 's', 'c', 'j', 'k', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const all = [tk('todo'), tk('doing'), tk('doing', { time_ask: T }), tk('paused'), tk('waiting', { question: 'Which?' }), tk('waiting', FILE_WAIT), tk('review'), tk('review', { kind: 'investigation' }), tk('failed'), tk('failed', { attempts: 0 }), tk('dropped'), tk('backlog'), tk('done')]
  for (const t of all) for (const ctx of [{}, { worker: true }, { merging: true }]) {
    const keys = taskActions(t, ctx).flatMap(x => (x.key ? [x.key] : []))
    expect(keys.filter(k => k === 'j' || k === 'k')).toEqual([])
    expect(keys.filter(k => pageKeys.includes(k))).toEqual([])
    expect(keys.map(k => k.toLowerCase())).toEqual([...new Set(keys.map(k => k.toLowerCase()))])
  }
  for (const s of ['todo', 'paused', 'failed']) expect(taskActions(tk(s)).find(x => x.id === 'stash')?.key).toBe('z')
  expect(taskActions(tk('review', { kind: 'investigation' })).find(x => x.id === 'keep-note')?.key).toBe('v')
  expect(taskActions(tk('todo')).map(actionButtonLabel)).toContain('Stash to backlog (z)')
  expect(taskActions(tk('review', { kind: 'investigation' })).map(actionButtonLabel)).toContain('Keep as a note (v)')
})

test('taskAsks: what a task asks and its choices, for each status', () => {
  expect(taskAsks(tk('waiting', { question: 'Which db?', options: ['mysql', 'postgres'] }))).toEqual({ text: 'Which db?', choices: ['mysql', 'postgres', 'Answer…'], files: [], overtime: false })
  expect(taskAsks(tk('waiting', { question: 'May it change b.ts?', asked_files: ['b.ts'] }))).toEqual({ text: 'May it change b.ts?', choices: ['Allow', "Don't allow", 'Answer…'], files: ['b.ts'], overtime: false })
  // a plain question: no choices, only the text box
  expect(taskAsks(tk('waiting', { question: 'Why?' }))?.choices).toEqual([])
  // no question text: its note, else "it waits for your answer" (never "(no question)")
  expect(taskAsks(tk('waiting', { note: 'waiting for you' }))?.text).toBe('waiting for you')
  expect(taskAsks(tk('waiting'))?.text).toBe('it waits for your answer')
  // finished work waiting only for the owner's files asks nothing (it merges on its own)
  expect(taskAsks(tk('waiting', { ...FILE_WAIT, question: 'x' }))).toBeNull()
  expect(taskAsks(tk('doing', { time_ask: T, extra_minutes: 30 }), 45)).toEqual({ text: 'T-1 has run 75 min. Give it more time?', choices: ['+30 min', '+60 min', 'Stop it', 'Answer…'], files: [], overtime: true })
  for (const s of ['todo', 'doing', 'paused', 'review', 'failed', 'dropped', 'backlog', 'done']) expect(taskAsks(tk(s))).toBeNull()
})

test("VS Code's buttons are taskActions: the same ids, labels and main action", () => {
  const nop = () => () => undefined
  const on = new Proxy({}, { get: () => nop() }) as never
  for (const t of [tk('todo'), tk('paused'), tk('waiting', FILE_WAIT), tk('review'), tk('review', { kind: 'investigation' }), tk('failed'), tk('dropped'), tk('backlog'), tk('done')]) {
    const vs = vsActions(t, { agentId: 'a1' }, on)
    const core = taskActions(t, { worker: true })
    expect(vs.map(a => a.key)).toEqual(core.map(a => a.id))
    expect(vs.map(a => a.label)).toEqual(core.map(a => a.label))
    expect(vs.filter(a => a.main).map(a => a.key)).toEqual(main(core))
  }
})
