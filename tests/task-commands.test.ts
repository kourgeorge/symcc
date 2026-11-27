// T-584: /symcc-task T-5 <word> does one of a task page's actions from the chat (and from OpenCode's panel, which
// sends its actions as slash commands): pause, resume, retry, drop [reason], merged, review on|off, stash, todo,
// role <name> and note. Each runs the lead's own tool (as the terminal's buttons do), so the task ends in the same
// state. These run the real code on the shared fake Host with a small scripted fake git (as merged-outside.test.ts).
import { expect } from 'claude-code/testing'
import { type Board, addTask, emptyBoard, patchTask, find, parseCommand, TASK_VERBS } from '../hooks/board'
import { S, leadQueue, meanwhile } from '../hooks/app/state'
import { saveBoard, load } from '../hooks/app/store'
import { COMMANDS, runCommand, taskDoTool } from '../hooks/app/symcc'
import { SCOUT_EDIT_FIELDS } from '../hooks/core/commands'
import { manual } from '../hooks/app/tools'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'

const ROOT = '/repo'
const ISO = '2026-11-13T00:00:00.000Z'
const MERGE = 'e1'.repeat(20)

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (): Res => ({ exitCode: 1, stdout: '', stderr: '' })

/** The fake Host; its git says T-1's branch tip is already in main (for "merged"). */
function world() {
  const files = new Map<string, string>()
  const C = 'c2'.repeat(20)
  const rec = `${C}\x1fT-1: Do it (try 1)\n\nSymcc-Task: T-1\nSymcc-Try: 1\n\x1e`
  const runGit = (a: string[]): Res => {
    const s = a.join(' ')
    if (s === '--version') return ok('git version 2.50.0')
    if (s === 'rev-parse --is-inside-work-tree') return ok('true')
    if (s === 'rev-parse --verify -q HEAD') return ok(MERGE)
    if (s === 'rev-parse --verify -q refs/heads/main') return ok(MERGE)
    if (s === 'rev-parse --verify -q refs/heads/symcc/T-1') return ok(C)
    if (a[0] === 'log' && a.includes('--grep=Symcc-Task: T-1')) return ok(rec)
    if (a[0] === 'merge-base' && a[1] === '--is-ancestor') return ok()
    if (a[0] === 'rev-list' && a.includes('--ancestry-path')) return ok(`${MERGE} ${C}\n`)
    if (a[0] === 'cherry') return ok(`- ${C}`)
    if (a[0] === 'worktree' && a[1] === 'list') return ok(`worktree ${ROOT}\nbranch refs/heads/main\n`)
    return ok()
  }
  const { host } = fakeHost({
    run: async argv => {
      const [cmd, ...rest] = argv
      if (cmd === 'git') return runGit(rest)
      if (cmd === 'ln') return files.has(rest[1]!) ? fail() : (files.set(rest[1]!, files.get(rest[0]!)!), ok())
      if (cmd === 'mv') return files.has(rest[1]!) ? (files.set(rest[2]!, files.get(rest[1]!)!), files.delete(rest[1]!), ok()) : fail()
      if (cmd === 'rm') return rest.filter(x => !x.startsWith('-')).forEach(p => files.delete(p)), ok()
      return ok()
    },
    fs: {
      ...memoryFs(files),
      // a folder lists the files right in it (for the project's role files)
      exists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(`${p}/`)),
      list: async dir => [...files.keys()].filter(k => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/')).map(k => ({ name: k.slice(dir.length + 1), kind: 'file' as const, size: files.get(k)!.length, mtimeMs: 0, isLink: false })),
    },
    agents: { spawn: async () => Promise.reject(new Error('no agents in this world')) },
  })
  S.root = ROOT
  S.writing = Promise.resolve()
  S.driving = false
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  return host
}

/** A board with T-1 in `status` (one try), T-2 to do and T-3 in the backlog. */
async function seed(host: ReturnType<typeof world>, status: string): Promise<Board> {
  let b = emptyBoard()
  for (const title of ['Do it', 'Then this', 'Some day']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'], merge_into: 'main' }, ISO)[0]
  b = patchTask(b, 'T-1', { status: status as never, attempts: 1, runs: [{ started: ISO, ended: ISO, ended_note: 'tests failed' }] }, ISO)
  b = patchTask(b, 'T-3', { status: 'backlog' }, ISO)
  await saveBoard(host, b)
  return b
}

const run = (host: ReturnType<typeof world>, args: string) => runCommand(host, 'symcc-task', args)
const task = async (host: ReturnType<typeof world>, id: string) => find(await load(host), id)!

test('/symcc-task T-5 <word> is parsed: each word with its reason, role or on/off; a wrong one gives the usage line', () => {
  expect(parseCommand('symcc-task', 'T-5')).toEqual({ kind: 'show', id: 'T-5' })
  for (const verb of ['pause', 'resume', 'retry', 'drop', 'merged', 'stash', 'todo', 'note'] as const) expect(parseCommand('symcc-task', `t5 ${verb}`)).toEqual({ kind: 'task-do', id: 'T-5', verb })
  expect(parseCommand('symcc-task', 'T-5 PAUSE')).toEqual({ kind: 'task-do', id: 'T-5', verb: 'pause' })
  expect(parseCommand('symcc-task', 'T-5 drop  not  needed any more')).toEqual({ kind: 'task-do', id: 'T-5', verb: 'drop', reason: 'not  needed any more' })
  expect(parseCommand('symcc-task', 'T-5 review on')).toEqual({ kind: 'task-do', id: 'T-5', verb: 'review', on: true })
  expect(parseCommand('symcc-task', 'T-5 review OFF')).toEqual({ kind: 'task-do', id: 'T-5', verb: 'review', on: false })
  expect(parseCommand('symcc-task', 'T-5 role tester')).toEqual({ kind: 'task-do', id: 'T-5', verb: 'role', role: 'tester' })
  for (const bad of ['T-5 banana', 'T-5 review', 'T-5 review maybe', 'T-5 role', 'T-5 role a b', 'T-5 pause now', 'banana pause', 'T-3 T-4']) expect(parseCommand('symcc-task', bad)).toMatchObject({ kind: 'bad', message: expect.stringContaining('Use: /symcc-task') })
  // the command list and the manual name the words
  const desc = COMMANDS().find(c => c.name === 'symcc-task')!
  for (const verb of TASK_VERBS) expect(desc.description).toContain(verb)
  expect(manual('', { panel: true, band: true, wakeLead: 'now', planMode: true, leadUsage: true, startQueue: true } as never)).toContain('/symcc-task T-3 WORD')
})

test('the scout command list names every field it can change, findings too', () => {
  const scout = COMMANDS().find(c => c.name === 'symcc-scout')!
  for (const field of SCOUT_EDIT_FIELDS) {
    expect(scout.description).toContain(field)
    expect(scout.argumentHint).toContain(field)
  }
  expect(scout.description).toContain('findings auto|backlog|default')
  expect(scout.argumentHint).toContain('findings auto|backlog|default')
})

test('each word calls the same lead tool with the same input as the task page\'s button', () => {
  const at = (verb: string, more = {}) => taskDoTool('T-5', { kind: 'task-do', id: 'T-5', verb: verb as never, ...more })
  expect(at('pause')).toEqual(['pause', { task: 'T-5', reason: 'paused by the owner' }])
  expect(at('resume')).toEqual(['resume', { task: 'T-5' }])
  expect(at('retry')).toEqual(['retry', { task: 'T-5' }])
  expect(at('drop')).toEqual(['drop', { task: 'T-5', reason: 'dropped by the owner' }])
  expect(at('drop', { reason: 'not needed' })).toEqual(['drop', { task: 'T-5', reason: 'not needed' }])
  expect(at('merged')).toEqual(['merged', { task: 'T-5', by: 'the owner' }])
  expect(at('review', { on: true })).toEqual(['change', { task: 'T-5', needs_review: true }])
  expect(at('review', { on: false })).toEqual(['change', { task: 'T-5', needs_review: false }])
  expect(at('stash')).toEqual(['change', { task: 'T-5', backlog: true }])
  expect(at('todo')).toEqual(['change', { task: 'T-5', backlog: false }])
  expect(at('role', { role: 'tester' })).toEqual(['change', { task: 'T-5', role: 'tester' }])
  expect(at('note')).toEqual(['approve', { task: 'T-5', keep_note: true }])
})

test('/symcc-task pause, resume, review, stash, todo, role and drop change the task as the lead\'s tools do', async () => {
  const host = world()
  await seed(host, 'todo')
  await run(host, 'T-2 pause')
  expect((await task(host, 'T-2')).status).toBe('paused')
  await run(host, 'T-2 resume')
  expect((await task(host, 'T-2')).status).toBe('todo')
  await run(host, 'T-2 review on')
  expect((await task(host, 'T-2')).needs_review).toBe(true)
  await run(host, 'T-2 review off')
  expect((await task(host, 'T-2')).needs_review).toBeFalsy()
  await run(host, 'T-2 stash')
  expect((await task(host, 'T-2')).status).toBe('backlog')
  await run(host, 'T-3 todo')
  expect((await task(host, 'T-3')).status).toBe('todo')
  await host.fs.write(`${ROOT}/.symcc/roles/mobile.md`, '---\ndescription: phone apps\n---\n- test on a phone\n')
  await run(host, 'T-2 role mobile')
  expect((await task(host, 'T-2')).role).toBe('mobile')
  const dropped = await run(host, 'T-2 drop not needed any more')
  expect(dropped?.isTextDisplayOnly).toBe(true)
  const t2 = await task(host, 'T-2')
  expect(t2.status).toBe('dropped')
  expect(t2.note).toBe('not needed any more')
  // a task that isn't on the board, and a tool that refuses: the answer says so, nothing changes
  expect((await run(host, 'T-9 pause'))?.text).toBe('T-9 is not on the board.')
  expect((await run(host, 'T-2 resume'))?.text).toContain('is not paused')
})

test('/symcc-task retry puts a failed task back to todo; merged marks one done whose work is already in main', async () => {
  const host = world()
  await seed(host, 'failed')
  await run(host, 'T-1 retry')
  expect((await task(host, 'T-1')).status).toBe('todo')
  await saveBoard(host, patchTask(await load(host), 'T-1', { status: 'failed' }, ISO))
  const out = await run(host, 'T-1 merged')
  expect(out?.text).toContain('T-1 done: its work is already in main')
  const t = await task(host, 'T-1')
  expect(t.status).toBe('done')
  expect(t.timeline.at(-1)?.text).toContain('marked done by the owner')
})
