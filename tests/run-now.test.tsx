// T-954: "Run now" on a task starts its worker at once, instead of waiting for its turn: even when every agent slot is
// busy (one over the limit; nothing else starts until the count is back under), on a paused board (only this one
// starts), from the backlog (it moves to todo), and, after "Start anyway?", while tasks it waits on aren't done. Its
// timeline says "started now by the owner", and the health check doesn't count it as pushing older tasks back.
// These run the loaded plugin (as start-queue.test.tsx): a start is claimed ("doing", queued for the next turn).
import { joinedText } from '../hooks/core/board-parts'
import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { type Board, addTask, emptyBoard, patchTask, boardHealth, parseCommand, taskActions, taskKeys, detailRows, type BoardTask } from '../hooks/board'
import { QUEUED_NOTE } from '../hooks/app/starts'
import { canRunNow, runNowPlanText, runNowQuestion, runNowShareText, runNowWaits } from '../hooks/core/run-now'
import { TASK_ACTION_COMMANDS, actionCommand } from '../hooks/opencode/board-view'
import { taskDoTool } from '../hooks/app/symcc'
import { ran } from './fakes'

const T0 = 1_800_000_000_000
const ISO = new Date(T0 - 60_000).toISOString()
const BOARD = '/.symcc/board.json'

/** In-memory files (keyed from "/.symcc/" on), a git that says yes to everything, no agents running. */
function world(on: On, o: { failWorktree?: boolean; noRepo?: boolean } = {}) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (files.set(key(e.path), (e as unknown as { text: string }).text), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', () => ({ model: 'sonnet' }) as never)
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git' && o.failWorktree && rest.includes('worktree') && rest.includes('add')) return { value: ran({ exitCode: 1, stderr: 'boom worktree' }) }
    if (cmd === 'git' && o.noRepo && rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree') return { value: ran({ exitCode: 128, stderr: 'not a git repository' }) }
    if (cmd === 'git') return { value: rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree' ? ran({ stdout: 'true\n' }) : ran({}) }
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: ran({ exitCode: 1, stderr: 'File exists' }) }
      files.set(key(rest[1]!), files.get(key(rest[0]!)) ?? '')
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      files.set(key(to!), files.get(key(from!)) ?? '')
      files.delete(key(from!))
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(key(p))
    return { value: ran({}) }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('command.run', () => ({ text: 'not a symcc command' }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('session.send', () => ({ isDelivered: true }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 's1' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  const board = () => JSON.parse(joinedText(files.get(BOARD)!, rel => files.get(BOARD.replace('board.json', rel)) ?? null)) as Board
  return { files, clock, board, task: (id: string) => board().tasks.find(t => t.id === id)! }
}

/** A board with `n` tasks to do (each its own files), at most `max` at once, in `mode`. */
function todo(n: number, max = 2, mode: Board['mode'] = 'auto'): Board {
  let b: Board = { ...emptyBoard(), mode, max_parallel: max }
  for (let i = 1; i <= n; i++) b = addTask(b, { origin: { why: 'a test' }, title: `Change ${i}`, files: [`src${i}/`], merge_into: 'main' }, ISO)[0]
  return b
}

const runTool = async ($: Engine, task: string, more: Record<string, unknown> = {}) => {
  const r = (await $.tool.call({ tool: 'mcp__symcc__run', task, ...more } as never)) as { result?: string }
  return String(r?.result ?? r)
}
const runNowLines = (t: BoardTask) => t.timeline.filter(e => e.kind === 'run-now')

test('T-954: run now with a free slot starts the task at once, with its timeline line', async ($, on) => {
  const w = world(on)
  // 3 slots, the board paused: nothing starts on its own, T-2 todo
  w.files.set(BOARD, JSON.stringify(todo(2, 3, 'paused')))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  expect(w.task('T-2').status).toBe('todo')
  const said = await runTool($, 'T-2')
  expect(said).toContain('T-2 started now')
  expect(said).not.toContain('over the limit')
  expect(w.task('T-2').status).toBe('doing')
  expect(w.task('T-2').note).toBe(QUEUED_NOTE)
  expect(runNowLines(w.task('T-2')).map(e => [e.text, e.try])).toEqual([['try 1: started now by the owner (on a paused board)', 1]])
})

test('T-954: run now with every slot busy runs one over the limit, and nothing else starts until the count is back under', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(todo(4, 2)))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  expect(['T-1', 'T-2', 'T-3', 'T-4'].map(id => w.task(id).status)).toEqual(['doing', 'doing', 'todo', 'todo'])
  const said = await runTool($, 'T-4')
  expect(said).toContain('T-4 started now; it runs one over the limit (3/2 agents busy)')
  expect(w.task('T-4').status).toBe('doing')
  expect(runNowLines(w.task('T-4'))[0]!.text).toBe('try 1: started now by the owner (over the agent limit (3/2 busy))')
  // the regular check (every two minutes) starts nothing more: 3 run, 2 is the limit
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.task('T-3').status).toBe('todo')
})

test('T-954: the health check does not count run now starts as newer tasks that pushed an older one back', () => {
  const old = new Date(T0 - 5 * 3_600_000).toISOString()
  let b = todo(3, 1)
  b = { ...b, tasks: b.tasks.map(t => ({ ...t, created_at: old, updated_at: old })) }
  const started = (id: string, kind: 'run-now' | 'stage') => (x: Board) => patchTask(x, id, { status: 'doing', attempts: 1, runs: [{ started: ISO }], timeline: [{ at: ISO, kind, text: kind === 'run-now' ? 'try 1: started now by the owner' : 'try 1: worker started', try: 1 }] }, old)
  // T-2 and T-3 (newer) started the usual way while T-1 waited 5 hours: T-1 is flagged
  const usual = started('T-3', 'stage')(started('T-2', 'stage')(b))
  expect(boardHealth(usual, T0).filter(f => f.reason === 'starving').map(f => f.tasks)).toEqual([['T-1']])
  // the owner started them with Run now: nothing is flagged
  const now = started('T-3', 'run-now')(started('T-2', 'run-now')(b))
  expect(boardHealth(now, T0).filter(f => f.reason === 'starving')).toEqual([])
})

test('T-954: a run now start that fails says the task failed, not that it starts when there is room',async ($, on) => {
  const w = world(on, { failWorktree: true })
  w.files.set(BOARD, JSON.stringify(todo(3, 1, 'paused')))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  const said = await runTool($, 'T-3')
  expect(w.task('T-3').status).toBe('failed')
  expect(said).toContain('T-3 failed: couldn\'t start')
  expect(said).not.toContain('when there is room')
})

test('T-954: two run nows on one task at once: both say it started, and it has one timeline line', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(todo(3, 1, 'paused')))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  const said = await Promise.all([runTool($, 'T-3'), runTool($, 'T-3')])
  expect(said.map(s => s.includes('T-3 started now'))).toEqual([true, true])
  expect(w.task('T-3').status).toBe('doing')
  expect(runNowLines(w.task('T-3')).length).toBe(1)
})

test('T-954: a task that waits on an unfinished task asks "Start anyway?" first: without anyway nothing starts; with it, it starts and keeps its after list', async ($, on) => {
  const w = world(on)
  let b = todo(3, 1)
  b = patchTask(b, 'T-3', { after: ['T-1'] }, ISO)
  w.files.set(BOARD, JSON.stringify(b))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('doing')
  const before = JSON.stringify(w.task('T-3'))
  const asked = await runTool($, 'T-3')
  expect(asked).toContain('T-3 waits on T-1 (running). Start anyway? Nothing started.')
  expect(w.task('T-3').status).toBe('todo')
  expect(JSON.stringify(w.task('T-3'))).toBe(before)
  const said = await runTool($, 'T-3', { anyway: true })
  expect(said).toContain('T-3 started now without waiting for T-1')
  expect(w.task('T-3').status).toBe('doing')
  expect(w.task('T-3').after).toEqual(['T-1'])
  expect(runNowLines(w.task('T-3'))[0]!.text).toContain('without waiting for T-1')
})

test('T-954: on a paused board run now starts only that task; the rest stays paused ', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(todo(3, 3, 'paused')))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  expect(['T-1', 'T-2', 'T-3'].map(id => w.task(id).status)).toEqual(['todo', 'todo', 'todo'])
  const said = await runTool($, 'T-2')
  expect(said).toContain('the board stays paused: only this task runs')
  expect(w.task('T-2').status).toBe('doing')
  expect(w.board().mode).toBe('paused')
  await w.clock.advance(2 * 60_000)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('todo')
  expect(w.task('T-1').status).toBe('todo')
})

test('T-954: /symcc-task T-5 run (and run anyway) runs the lead\'s run tool; a task in review or running is refused', async ($, on) => {
  expect(parseCommand('symcc-task', 'T-5 run')).toEqual({ kind: 'task-do', id: 'T-5', verb: 'run' })
  expect(parseCommand('symcc-task', 'T-5 run anyway')).toEqual({ kind: 'task-do', id: 'T-5', verb: 'run', anyway: true })
  expect(parseCommand('symcc-task', 'T-5 run now')).toMatchObject({ kind: 'bad' })
  expect(taskDoTool('T-5', { kind: 'task-do', id: 'T-5', verb: 'run' })).toEqual(['run', { task: 'T-5' }])
  expect(taskDoTool('T-5', { kind: 'task-do', id: 'T-5', verb: 'run', anyway: true })).toEqual(['run', { task: 'T-5', anyway: true }])
  // OpenCode's panel sends it as that command
  expect(TASK_ACTION_COMMANDS['run-now']).toBe('run')
  expect(actionCommand({ kind: 'task', id: 'T-5', verb: 'run', arg: 'anyway' })).toEqual({ name: 'symcc-task', text: 'T-5 run anyway' })
  const w = world(on)
  let b = todo(2, 3)
  b = patchTask(b, 'T-2', { status: 'review', note: 'ready' }, ISO)
  w.files.set(BOARD, JSON.stringify(b))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  const r = (await $.command.run({ command: 'symcc-task', args: 'T-2 run', origin: { kind: 'composer' }, presentation: 'text' } as never)) as unknown
  expect(JSON.stringify(r)).toContain('T-2 is ready for review; Run now is only for a task that is to do; retry it or move it to to do first')
  expect(w.task('T-2').status).toBe('review')
  const doing = (await $.command.run({ command: 'symcc-task', args: 'T-1 run', origin: { kind: 'composer' }, presentation: 'text' } as never)) as unknown
  expect(JSON.stringify(doing)).toContain('T-1 is already running')
})

test('T-954: the task page offers Run now (key e) for to do tasks only (T-1023)', () => {
  let b = todo(1)
  for (const status of ['todo', 'paused', 'failed', 'dropped', 'backlog', 'doing', 'review', 'waiting', 'done'] as const) {
    b = patchTask(b, 'T-1', { status }, ISO)
    const t = b.tasks[0]!
    const run = taskActions(t).find(x => x.id === 'run-now')
    expect([status, !!run]).toEqual([status, status === 'todo'])
    expect(canRunNow(t)).toBe(status === 'todo')
    if (run) {
      expect(run).toMatchObject({ label: 'Run now', key: 'e', word: 'run now', group: 'task' })
      expect(taskKeys(taskActions(t)).some(k => k.key === 'e' && k.word === 'run now')).toBe(true)
    }
  }
  // not while its merge runs
  expect(taskActions(patchTask(b, 'T-1', { status: 'todo' }, ISO).tasks[0]!, { merging: true }).some(x => x.id === 'run-now')).toBe(false)
})

test('T-954: the question names each unfinished task with its state; a run now try that shares files with a running task shows a warning naming it', () => {
  let b = todo(3)
  b = patchTask(b, 'T-1', { status: 'doing' }, ISO)
  b = patchTask(b, 'T-2', { status: 'done' }, ISO)
  b = patchTask(b, 'T-3', { after: ['T-1', 'T-2'] }, ISO)
  const t3 = b.tasks.find(t => t.id === 'T-3')!
  expect(runNowWaits(b, t3)).toEqual([{ id: 'T-1', state: 'running' }])
  expect(runNowQuestion('T-3', runNowWaits(b, t3))).toBe('T-3 waits on T-1 (running). Start anyway?')
  // T-3 started now on try 1 while T-1 runs, both may change src1/
  b = patchTask(b, 'T-1', { files: ['src1/'] }, ISO)
  b = patchTask(b, 'T-3', { status: 'doing', attempts: 1, files: ['src1/a.ts'], timeline: [...t3.timeline, { at: ISO, kind: 'run-now', text: 'try 1: started now by the owner', try: 1 }] }, ISO)
  const rows = (id: string) => detailRows(b.tasks.find(t => t.id === id)!, { roles: [], all: b.tasks, when: x => x, nowMs: T0 }).flatMap(r => r.segs.map(s => s.text))
  expect(rows('T-3')).toContain(`⚠ ${runNowShareText(['T-1'])}`)
  expect(runNowShareText(['T-1'])).toBe('started now while T-1 runs; they share files, so their changes may clash at the merge')
  // T-1 was started the usual way: no warning on its page
  expect(rows('T-1').some(x => x.includes('started now'))).toBe(false)
})

// T-964: in plan mode nothing starts, Run now included: the task is left as it is and the reply says why
test('T-964: run now in plan mode starts nothing: a todo task stays to do', async ($, on) => {
  const w = world(on)
  on('classic.UserPromptSubmit', () => ({}) as never)
  w.files.set(BOARD, JSON.stringify(todo(2, 1, 'paused')))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  // the main session enters plan mode (Claude Code's permission mode on its hooks)
  await $.classic.UserPromptSubmit({ prompt: 'plan it', permission_mode: 'plan' } as never)
  await w.clock.advance(10)
  const before = [JSON.stringify(w.task('T-1')), JSON.stringify(w.task('T-2'))]
  expect(await runTool($, 'T-1')).toBe(runNowPlanText('T-1'))
  expect(runNowPlanText('T-1')).toBe("T-1 didn't start: plan mode: nothing starts; run it when plan mode ends")
  await w.clock.settle()
  expect([w.task('T-1').status, w.task('T-2').status]).toEqual(['todo', 'todo'])
  expect([JSON.stringify(w.task('T-1')), JSON.stringify(w.task('T-2'))]).toEqual(before)
})

test('T-1023: run now refuses a paused, failed, dropped or backlog task, and changes nothing', async ($, on) => {
  const w = world(on)
  let b = todo(4, 1, 'paused')
  b = patchTask(b, 'T-1', { status: 'paused', note: 'paused' }, ISO)
  b = patchTask(b, 'T-2', { status: 'failed', note: 'failed' }, ISO)
  b = patchTask(b, 'T-3', { status: 'dropped', note: 'dropped' }, ISO)
  b = patchTask(b, 'T-4', { status: 'backlog', note: 'in the backlog' }, ISO)
  w.files.set(BOARD, JSON.stringify(b))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  const before = JSON.stringify(w.board().tasks)
  for (const id of ['T-1', 'T-2', 'T-3', 'T-4']) expect(await runTool($, id)).toContain('Run now is only for a task that is to do; retry it or move it to to do first')
  expect(JSON.stringify(w.board().tasks)).toBe(before)
})

test('T-964: run now is refused, the task unchanged, when another window drives the board', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(todo(1, 1, 'paused')))
  // another session drives, with a fresh heartbeat
  w.files.set('/.symcc/lead.json', JSON.stringify({ session: 'other', heartbeat: Date.now() }) + '\n')
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.advance(10)
  // this window starts off here; /symcc-enable makes it follow the driving window
  await $.command.run({ command: 'symcc-enable', args: '', origin: { kind: 'composer' }, presentation: 'text' } as never)
  await w.clock.advance(10)
  const before = JSON.stringify(w.task('T-1'))
  expect(await runTool($, 'T-1')).toBe("T-1 didn't start: another window drives this board, so run it now from there")
  expect(JSON.stringify(w.task('T-1'))).toBe(before)
})

test('T-964: run now is refused, the task unchanged, when git is not set up', async ($, on) => {
  const w = world(on, { noRepo: true })
  w.files.set(BOARD, JSON.stringify(todo(1, 1, 'paused')))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  const before = JSON.stringify(w.task('T-1'))
  expect(await runTool($, 'T-1')).toBe("T-1 didn't start: git isn't set up here yet")
  await w.clock.settle()
  expect(JSON.stringify(w.task('T-1'))).toBe(before)
})

test('T-1212: run now on a task whose project is gone says so, not "git isn\'t set up"', async ($, on) => {
  const w = world(on)
  const b = patchTask(todo(1, 1, 'paused'), 'T-1', { project: 'gone' } as never, ISO)
  w.files.set(BOARD, JSON.stringify(b))
  await $.session.start({ cwd: '/repo' } as never)
  await w.clock.settle()
  const said = await runTool($, 'T-1')
  expect(said).toContain("T-1 didn't start: project 'gone' is not in this board's project table")
  expect(said).not.toContain("git isn't set up")
})
