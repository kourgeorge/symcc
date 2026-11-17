// The turn.complete hook of register.tsx (T-177): a worker's or scout's run ended and its answer arrives there.
// It routes the answer: a worker this copy tracks goes to workerFinished, a scout's run to scoutFinished, and a
// report from an agent this copy lost track of (after a reload) goes through lateHandBack first. Two workers that
// finish at the same moment must both be merged and neither one's board save may be lost.
// The plugin runs as loaded by the test kit; files, git and agents are the fake world below. The hook starts its
// work without waiting for it, so each test lets that work finish with the fake clock's settle(), never a real wait.
import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { type Board, addTask, emptyBoard, patchTask } from '../hooks/board'

const T0 = 1_800_000_000_000
const ISO = new Date(T0 - 60_000).toISOString()
const ROOT = '/repo'
const BOARD = '/.symcc/board.json'
const SCOUTS_DIR = '/.symcc/scouts'

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

/** A commit id from a number: always the same 40 hex characters for the same number. */
const sha = (n: number) => n.toString(16).padStart(40, 'c')

/**
 * A small fake git with real history: commits (with parents and the files each one changed), main, and one
 * worktree per task (`/repo/.symcc/worktrees/T-n`) with its HEAD and the change its worker left uncommitted.
 * It answers what checkAndMerge, moveTarget and the git check ask; main moves only by a compare-and-swap.
 */
function fakeGit(work: Record<string, string[]>) {
  let n = 0
  const commits = new Map<string, { parents: string[]; files: string[]; message: string }>()
  const make = (parents: string[], files: string[], message: string) => {
    const id = sha(++n)
    commits.set(id, { parents, files, message })
    return id
  }
  const state = { main: make([], [], 'first commit') }
  /** the commits made in a task's folder ("commit T-n") and the moves of main ("move main"), in the order they ran */
  const steps: string[] = []
  const trees = new Map(Object.entries(work).map(([id, files]) => [`${ROOT}/.symcc/worktrees/${id}`, { head: state.main, dirty: files }]))
  const ancestors = (from: string) => {
    const seen = new Set<string>()
    const todo = [from]
    while (todo.length) {
      const c = todo.pop()!
      if (seen.has(c) || !commits.has(c)) continue
      seen.add(c)
      todo.push(...commits.get(c)!.parents)
    }
    return seen
  }

  function run(args: string[], cwd: string): Res {
    const a = args.filter((x, i) => x !== '-c' && args[i - 1] !== '-c')
    const s = a.join(' ')
    const tree = trees.get(cwd)
    if (s === '--version') return ok('git version 2.50.0')
    if (s === 'rev-parse --is-inside-work-tree') return ok('true')
    if (s === 'rev-parse --verify -q HEAD' || s === 'rev-parse --verify -q refs/heads/main') return ok(state.main)
    if (s === 'symbolic-ref --short -q HEAD') return ok('other') // the owner is not on main: their files are not touched
    if (s === 'rev-parse refs/heads/main') return ok(state.main)
    if (tree && (s === 'rev-parse -q --verify HEAD' || s === 'rev-parse HEAD')) return ok(tree.head)
    if (tree && a[0] === 'commit') {
      if (!tree.dirty.length) return fail('nothing to commit')
      tree.head = make([tree.head], tree.dirty, a[a.indexOf('-m') + 1] ?? '')
      tree.dirty = []
      steps.push(`commit ${cwd.slice(cwd.lastIndexOf('/') + 1)}`)
      return ok()
    }
    if (a[0] === 'merge-base' && a[1] === '--is-ancestor') return ancestors(a[3]!).has(a[2]!) ? ok() : fail()
    if (a[0] === 'merge-base') {
      const left = ancestors(a[1]!)
      return ok([...ancestors(a[2]!)].find(c => left.has(c)) ?? '')
    }
    if (a[0] === 'diff' && a.includes('--name-only')) {
      const [from, to] = a.at(-1)!.split('..') as [string, string]
      const before = ancestors(from)
      return ok([...new Set([...ancestors(to)].filter(c => !before.has(c)).flatMap(c => commits.get(c)!.files))].join('\0'))
    }
    if (tree && a[0] === 'merge' && a[1] !== '--abort') {
      tree.head = make([tree.head, a.at(-1)!], [], a[a.indexOf('-m') + 1] ?? '')
      return ok()
    }
    if (a[0] === 'update-ref') {
      const [, , , ref, to, from] = a
      if (ref !== 'refs/heads/main' || state.main !== from) return fail(`cannot lock ref '${ref}'`)
      state.main = to!
      steps.push('move main')
      return ok()
    }
    // no branch symcc/T-n yet, no commit message to read: nothing of a task is on main from an earlier try
    if (a[0] === 'rev-parse' || a[0] === 'log') return fail()
    return ok()
  }
  /** The messages of the commits on main, oldest first, without the first commit. */
  const onMain = () => [...ancestors(state.main)].reverse().map(c => commits.get(c)!.message).filter(m => m !== 'first commit')
  return { run, state, steps, onMain }
}

/**
 * Files in memory (keyed from "/.symcc/" on), the fake git, and the agents: `agents` are listed as running until
 * their turn.complete reaches the bottom (then completed).
 * What reaches the lead is in `prompts` once the clock passes its 1.5 s wait.
 */
function world(on: On, o: { work?: Record<string, string[]>; agents?: { id: string; type: string }[]; holdCommitOf?: string } = {}) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const git = fakeGit(o.work ?? {})
  const ended = new Set<string>()
  const prompts: string[] = []
  const reached: string[] = []
  // `holdCommitOf`: that task's commit waits until another task's commit has run, so the two checks overlap for sure
  let release: (() => void) | null = null
  const held = o.holdCommitOf ? new Promise<void>(r => (release = r)) : Promise.resolve()

  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) || key(e.path) === SCOUTS_DIR }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (files.set(key(e.path), String((e as unknown as { text: string }).text)), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', (_, e) =>
    key(e.path) === SCOUTS_DIR ? { value: [...files.keys()].filter(f => f.startsWith(`${SCOUTS_DIR}/`)).map(f => ({ name: f.slice(SCOUTS_DIR.length + 1), kind: 'file' })) } : ({ value: [] } as never),
  )
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', async (_, e) => {
    const { argv, init } = e as unknown as { argv: string[]; init?: { cwd?: string } }
    const [cmd, ...rest] = argv
    const cwd = init?.cwd ?? ROOT
    if (cmd === 'git' && rest.includes('commit')) {
      if (o.holdCommitOf && cwd.endsWith(`/${o.holdCommitOf}`)) await held
      else release?.()
    }
    if (cmd === 'git') return { value: git.run(rest, cwd) }
    // the board's lock and its save through a temp file (see store.ts)
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: fail('File exists') }
      files.set(key(rest[1]!), files.get(key(rest[0]!)) ?? '')
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      files.set(key(to!), files.get(key(from!)) ?? '')
      files.delete(key(from!))
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(key(p))
    return { value: ok() }
  })
  on('tool.call', () => ({ result: 'ran' }))
  // beneath the plugin, every tool is allowed (the engine's own rules)
  on('tool.check', () => ({ decision: 'allow' }) as never)
  on('prompt.submit', (_, e) => (prompts.push(e.text), { text: e.text }) as never)
  on('agent.list', () => ({ value: (o.agents ?? []).map(a => ({ ...a, status: ended.has(a.id) ? 'completed' : 'running' })) }) as never)
  on('session.send', (_, e) => {
    const to = (e as unknown as { to: string | { agentId: string } }).to
    ended.add(typeof to === 'string' ? to : to.agentId)
    return { isDelivered: true } as never
  })
  on('turn.complete', (_, e) => {
    if (e.agentId) (reached.push(e.agentId), ended.add(e.agentId))
    return { text: '' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: ROOT } }) as never)
  on('session.root', () => ({ value: ROOT }) as never)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  const board = () => JSON.parse(files.get(BOARD)!) as Board
  return { files, git, prompts, reached, clock, board, release: () => release?.(), task: (id: string) => board().tasks.find(t => t.id === id)! }
}

type Eng = Parameters<Parameters<typeof test>[1]>[0]

/** A board in `mode` with one task per entry, each "doing" in this session ("me") for its agent, with its files. */
function doingBoard(mode: 'auto' | 'review', tasks: { agent: string; files: string[] }[]): Board {
  let b: Board = { ...emptyBoard(), mode }
  for (const [i, t] of tasks.entries()) {
    b = addTask(b, { origin: { why: 'a test' }, title: `Change ${i + 1}`, files: t.files, merge_into: 'main' }, ISO)[0]
    b = patchTask(b, `T-${i + 1}`, { status: 'doing', attempts: 1, session: 'me', agent: t.agent, branch: `symcc/T-${i + 1}`, runs: [{ started: ISO }] } as never, ISO)
  }
  return b
}

/** The hand-back of agent `agentId`, as the engine raises it when that agent's run ends (`end`: why it ended). */
const finish = ($: Eng, agentId: string, answer: string, isAborted = false, end: Record<string, unknown> = { reason: isAborted ? 'aborted' : 'answer' }) =>
  $.turn.complete({ agentId, answer, isAborted, ...end, durationMs: 1000, turnId: `turn-${agentId}` } as never)

// ---------------- a report from a worker this copy lost in a reload ----------------

test('a late report (agent not tracked, its task "doing" for it) is still taken: in auto mode the task is merged and done', async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] } })
  // the session starts with no board, so nothing is sent back: then the board shows T-1 "doing" for ag9,
  // a worker this copy of the plugin never started (as after a reload)
  await $.session.start({ cwd: ROOT } as never)
  w.files.set(BOARD, JSON.stringify(doingBoard('auto', [{ agent: 'ag9', files: ['src/'] }])))
  await finish($, 'ag9', 'done')
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('done')
  expect(w.git.onMain()).toEqual([expect.stringMatching(/^T-1: /)])
})

test('a late report in review mode moves the task to review and leaves main alone', async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] } })
  await $.session.start({ cwd: ROOT } as never)
  const before = w.git.state.main
  w.files.set(BOARD, JSON.stringify(doingBoard('review', [{ agent: 'ag9', files: ['src/'] }])))
  await finish($, 'ag9', 'done')
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('review')
  expect(w.git.state.main).toBe(before)
})

test('a report from an unknown agent with no task on the board changes nothing', async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] } })
  await $.session.start({ cwd: ROOT } as never)
  const text = JSON.stringify(doingBoard('auto', [{ agent: 'ag9', files: ['src/'] }]))
  w.files.set(BOARD, text)
  const main = w.git.state.main
  await finish($, 'zz', 'done')
  await w.clock.settle()
  expect(w.reached).toEqual(['zz'])
  expect(w.files.get(BOARD)).toBe(text)
  expect(w.git.state.main).toBe(main)
})

test('a late report for a task "doing" in another session is not taken', async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] } })
  await $.session.start({ cwd: ROOT } as never)
  const b = doingBoard('auto', [{ agent: 'ag9', files: ['src/'] }])
  const text = JSON.stringify({ ...b, tasks: b.tasks.map(t => ({ ...t, session: 'someone-else' })) })
  w.files.set(BOARD, text)
  await finish($, 'ag9', 'done')
  await w.clock.settle()
  expect(w.files.get(BOARD)).toBe(text)
})

test('a late report with no agentId (the main loop ending a turn) changes nothing', async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] } })
  await $.session.start({ cwd: ROOT } as never)
  const text = JSON.stringify(doingBoard('auto', [{ agent: 'ag9', files: ['src/'] }]))
  w.files.set(BOARD, text)
  await $.turn.complete({ answer: 'done', isAborted: false, reason: 'answer', durationMs: 1000, turnId: 'main' } as never)
  await w.clock.settle()
  expect(w.files.get(BOARD)).toBe(text)
})

test('a late report that was stopped (isAborted) fails the task instead of merging it', async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] } })
  await $.session.start({ cwd: ROOT } as never)
  const main = w.git.state.main
  w.files.set(BOARD, JSON.stringify(doingBoard('auto', [{ agent: 'ag9', files: ['src/'] }])))
  await finish($, 'ag9', 'half way', true)
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('failed')
  expect(w.git.state.main).toBe(main)
})

// ---------------- a worker this copy tracks ----------------

test('a tracked worker (kept after the reload: its agent was still running) is merged and done through the hook', async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] }, agents: [{ id: 'a1', type: 'symcc:worker' }] })
  // the board is there at session start and a1 still runs: the plugin keeps tracking it (T-1 stays "doing")
  w.files.set(BOARD, JSON.stringify(doingBoard('auto', [{ agent: 'a1', files: ['src/'] }])))
  await $.session.start({ cwd: ROOT } as never)
  expect(w.task('T-1').status).toBe('doing')
  await finish($, 'a1', 'made the change')
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('done')
  expect(w.git.onMain()).toEqual([expect.stringMatching(/^T-1: /)])
})

test("a tracked worker's report is taken once: the same report again changes nothing more", async ($, on) => {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] }, agents: [{ id: 'a1', type: 'symcc:worker' }] })
  w.files.set(BOARD, JSON.stringify(doingBoard('auto', [{ agent: 'a1', files: ['src/'] }])))
  await $.session.start({ cwd: ROOT } as never)
  await finish($, 'a1', 'made the change')
  await w.clock.settle()
  const text = w.files.get(BOARD)
  const main = w.git.state.main
  await finish($, 'a1', 'made the change')
  await w.clock.settle()
  expect(w.files.get(BOARD)).toBe(text)
  expect(w.git.state.main).toBe(main)
})

// ---------------- how a tracked worker's try ends: ask_owner, refused edits, the turn's end reason ----------------

/** T-1 (files src/, auto mode) is "doing" for worker a1, which still runs at session start, so it is tracked. */
async function trackedWorker($: Eng, on: On, o: { investigation?: boolean } = {}) {
  const w = world(on, { work: { 'T-1': ['src/a.ts'] }, agents: [{ id: 'a1', type: 'symcc:worker' }] })
  const b = doingBoard('auto', [{ agent: 'a1', files: ['src/'] }])
  w.files.set(BOARD, JSON.stringify(o.investigation ? patchTask(b, 'T-1', { kind: 'investigation' } as never, ISO) : b))
  await $.session.start({ cwd: ROOT } as never)
  return w
}
const ask = ($: Eng, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__symcc__ask_owner', ...input } as never) as Promise<{ result?: string; deny?: string }>
const check = ($: Eng, agentId: string, tool: string, input: Record<string, unknown>) => $.tool.check({ tool, input, agentId } as never) as Promise<{ decision: string; reason?: string }>
const WT1 = `${ROOT}/.symcc/worktrees/T-1`

test("a worker's ask_owner call is recorded, and when it hands back the task waits with its question and options; nothing is merged", async ($, on) => {
  const w = await trackedWorker($, on)
  const main = w.git.state.main
  expect((await ask($, { agentId: 'a1', question: 'Which colour?', options: ['red', 'blue'] })).result).toBe('Sent to the owner. Stop now and hand back.')
  await finish($, 'a1', 'I asked the owner.')
  await w.clock.settle()
  const t = w.task('T-1')
  expect(t.status).toBe('waiting')
  expect(t.question).toBe('Which colour?')
  expect((t as { options?: string[] }).options).toEqual(['red', 'blue'])
  expect(w.git.state.main).toBe(main)
})

test('ask_owner from the lead, from an agent that is not a worker, or with a bad input is refused and records nothing', async ($, on) => {
  const w = await trackedWorker($, on)
  expect((await ask($, { question: 'Which?' })).result).toMatch(/^Refused: mcp__symcc__ask_owner is only for symcc workers; the lead/)
  expect((await ask($, { agentId: 'zz', question: 'Which?' })).result).toMatch(/^Refused: .*only for running symcc workers/)
  expect((await ask($, { agentId: 'a1' })).result).toMatch(/^Refused: question is needed/)
  expect((await ask($, { agentId: 'a1', question: 'Which?', options: ['red'] })).result).toMatch(/^Refused: options must hold 2 to 6/)
  // nothing was recorded: the hand-back is checked and merged as usual
  await finish($, 'a1', 'made the change')
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('done')
})

test("an Edit outside a worker's files is refused with the reason and recorded; one inside is left to the usual rules; the task then waits for that file", async ($, on) => {
  const w = await trackedWorker($, on)
  const main = w.git.state.main
  const out = await check($, 'a1', 'Edit', { file_path: `${WT1}/README.md`, old_string: 'a', new_string: 'b' })
  expect(out).toMatchObject({ decision: 'deny', reason: "README.md is outside this task's files; it's recorded as a request to the owner. Stop and hand back." })
  expect((await check($, 'a1', 'NotebookEdit', { notebook_path: `${WT1}/nb/x.ipynb`, new_source: '' })).decision).toBe('deny')
  expect((await check($, 'a1', 'Write', { file_path: `${WT1}/src/b.ts`, content: 'x' })).decision).toBe('allow')
  // the lead (no agentId) and Bash are not judged here
  expect((await $.tool.check({ tool: 'Edit', input: { file_path: `${WT1}/README.md` } } as never) as { decision: string }).decision).toBe('allow')
  expect((await check($, 'a1', 'Bash', { command: 'echo x > README.md' })).decision).toBe('allow')
  // half-done edits in src/a.ts are in its folder, but nothing is merged
  await finish($, 'a1', 'Changed src/a.ts; README.md was refused.')
  await w.clock.settle()
  const t = w.task('T-1')
  expect(t.status).toBe('waiting')
  expect((t as { asked_files?: string[] }).asked_files).toEqual(['README.md', 'nb/x.ipynb'])
  expect(w.git.state.main).toBe(main)
})

test("a worker's Bash command starts from its shell's current folder (session.cwd in the hook), when that is inside its folder (T-317)", async ($, on) => {
  let here = `${WT1}/src`
  on('session.cwd', () => ({ value: here }) as never)
  await trackedWorker($, on)
  // after an earlier "cd src", ".." reaches the worker's own files: allowed
  expect((await check($, 'a1', 'Bash', { command: 'cat ../package.json' })).decision).toBe('allow')
  // four ".." from <worktree>/src reach the owner's copy: refused
  const out = await check($, 'a1', 'Bash', { command: 'cat ../../../../README.md' })
  expect(out.decision).toBe('deny')
  expect(out.reason).toMatch(/names README\.md in the owner's copy/)
  // a shell folder outside the worker's folder is not used: paths start from the worker's top folder
  here = `${ROOT}/src`
  expect((await check($, 'a1', 'Bash', { command: 'cat ../package.json' })).decision).toBe('deny')
  here = '/'
  expect((await check($, 'a1', 'Bash', { command: 'cat ../x' })).decision).toBe('deny')
})

test("an investigation's edits are never refused (it has no file list), and its hand-back is its answer", async ($, on) => {
  const w = await trackedWorker($, on, { investigation: true })
  expect((await check($, 'a1', 'Write', { file_path: `${WT1}/README.md`, content: 'x' })).decision).toBe('allow')
  await finish($, 'a1', 'The answer.')
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('review')
})

test('a turn that ended on an error or a refusal fails the task with the reason, through the hook; nothing is merged', async ($, on) => {
  const w = await trackedWorker($, on)
  const main = w.git.state.main
  await finish($, 'a1', 'half way', false, { reason: 'error' })
  await w.clock.settle()
  expect(w.task('T-1')).toMatchObject({ status: 'failed', note: "the worker's turn ended on an error (retries used up or the context limit)" })
  expect(w.git.state.main).toBe(main)
})

test('a refusal end fails the task with the refusal\'s explanation', async ($, on) => {
  const w = await trackedWorker($, on)
  await finish($, 'a1', '', false, { reason: 'refusal', refusal: { category: null, explanation: 'cannot help with that' } })
  await w.clock.settle()
  expect(w.task('T-1')).toMatchObject({ status: 'failed', note: 'the model refused to go on (cannot help with that)' })
})

test('a hand-back that says "QUESTION:" and "NEED FILES:" with no ask_owner call or refused edit is merged normally', async ($, on) => {
  const w = await trackedWorker($, on)
  await finish($, 'a1', 'QUESTION: red or blue?\nNEED FILES: README.md — docs')
  await w.clock.settle()
  expect(w.task('T-1').status).toBe('done')
})

test('an aborted end still stops the task, through the hook', async ($, on) => {
  const w = await trackedWorker($, on)
  await finish($, 'a1', '', true)
  await w.clock.settle()
  expect(w.task('T-1')).toMatchObject({ status: 'failed', note: 'the worker was stopped' })
})

// ---------------- two workers finishing at once ----------------

/** Two workers in auto mode, T-1 (agent a1, src/) and T-2 (agent a2, docs/), each changing its own file; both still running at session start, so tracked. */
async function twoWorkers($: Eng, on: On, holdCommitOf?: string) {
  const w = world(on, { work: { 'T-1': ['src/a.ts'], 'T-2': ['docs/b.md'] }, agents: [{ id: 'a1', type: 'symcc:worker' }, { id: 'a2', type: 'symcc:worker' }], ...(holdCommitOf ? { holdCommitOf } : {}) })
  w.files.set(BOARD, JSON.stringify(doingBoard('auto', [{ agent: 'a1', files: ['src/'] }, { agent: 'a2', files: ['docs/'] }])))
  await $.session.start({ cwd: ROOT } as never)
  return w
}
const subjects = (w: ReturnType<typeof world>) => w.git.onMain().map(m => m.split('\n')[0]!).filter(m => !/bring up to date/.test(m)).sort()

test('two workers finishing one after the other (auto mode, different files) both merge: both commits are on main', async ($, on) => {
  const w = await twoWorkers($, on)
  await finish($, 'a1', 'changed a')
  await w.clock.settle()
  await finish($, 'a2', 'changed b')
  await w.clock.settle()
  expect([w.task('T-1').status, w.task('T-2').status]).toEqual(['done', 'done'])
  // the second one brought main (with the first one's commit) into its branch first
  expect(subjects(w)).toEqual([expect.stringMatching(/^T-1: Change 1/), expect.stringMatching(/^T-2: Change 2/)])
})

test('two workers finishing at the same moment: both checks really overlap, and no board save is lost', async ($, on) => {
  // T-1's commit waits until T-2's has run, so both checks are under way at once
  const w = await twoWorkers($, on, 'T-1')
  const nextId = w.board().next_id
  // both hand-backs start before either one's check and merge is waited for
  const both = Promise.all([finish($, 'a1', 'changed a'), finish($, 'a2', 'changed b')])
  await w.clock.settle()
  // (only if T-2's commit never came: let T-1 go on, so the test fails on the order below instead of hanging)
  w.release()
  await both
  await w.clock.settle()
  expect(w.git.steps.slice(0, 2)).toEqual(['commit T-2', 'commit T-1'])
  // every write of both is on the board: neither task is still "doing", each has its own try-ending line, next_id kept
  const [t1, t2] = [w.task('T-1'), w.task('T-2')]
  expect([t1.status === 'doing', t2.status === 'doing']).toEqual([false, false])
  expect(t1.history.at(-1)).toMatch(/^try 1: changed a → /)
  expect(t2.history.at(-1)).toMatch(/^try 1: changed b → merged into main/)
  expect(t1.runs?.at(-1)?.ended).toBeDefined()
  // T-2 moved main first; T-1 lost that race, brought T-2's work in and merged on top of it by itself
  expect(w.git.onMain().some(m => /^T-1: bring up to date/.test(m))).toBe(true)
  expect(t1.merged).toBe(w.git.state.main)
  expect(t2.merged).toBeDefined()
  expect(w.board().next_id).toBe(nextId)
  expect([t1.status, t2.status]).toEqual(['done', 'done'])
  expect(subjects(w)).toEqual([expect.stringMatching(/^T-1: Change 1/), expect.stringMatching(/^T-2: Change 2/)])
})

test("an approve and a worker's merge at the same moment both land on main", async ($, on) => {
  // T-1 waits in review (the owner approves it), T-2 is a worker finishing; T-1's commit waits until T-2's has run
  const w = world(on, { work: { 'T-1': ['src/a.ts'], 'T-2': ['docs/b.md'] }, agents: [{ id: 'a2', type: 'symcc:worker' }], holdCommitOf: 'T-1' })
  const b = doingBoard('auto', [{ agent: 'a1', files: ['src/'] }, { agent: 'a2', files: ['docs/'] }])
  w.files.set(BOARD, JSON.stringify(patchTask(b, 'T-1', { status: 'review', note: 'ready for review', agent: undefined, runs: [{ started: ISO, ended: ISO }] } as never, ISO)))
  w.files.set('/.symcc/worktrees/T-1/.git', 'gitdir: x')
  await $.session.start({ cwd: ROOT } as never)
  expect(w.task('T-1').status).toBe('review')
  const approved = $.tool.call({ tool: 'mcp__symcc__approve', task: 'T-1' } as never)
  const finished = finish($, 'a2', 'changed b')
  await w.clock.settle()
  w.release()
  const [out] = await Promise.all([approved, finished])
  await w.clock.settle()
  expect(w.git.steps.slice(0, 2)).toEqual(['commit T-2', 'commit T-1'])
  expect(String((out as { result?: string })?.result ?? out)).toMatch(/^T-1 approved and merged: merged into main/)
  expect([w.task('T-1').status, w.task('T-2').status]).toEqual(['done', 'done'])
  expect(subjects(w)).toEqual([expect.stringMatching(/^T-1: Change 1/), expect.stringMatching(/^T-2: Change 2/)])
})

// ---------------- a scout's report ----------------
// The test kit can't hand the plugin an agent id from $.agent.spawn (a hook's agentId is the engine's own), so a
// scout this copy started itself (scoutRuns) can't be made here; what is reachable is a scout left from before a reload.

test("a report from an old scout the plugin stopped at start reaches nobody: not the lead, not the board, not scouts.json", async ($, on) => {
  const w = world(on, { agents: [{ id: 's1', type: 'symcc:scout' }] })
  w.files.set(BOARD, JSON.stringify(doingBoard('auto', [])))
  await $.session.start({ cwd: ROOT } as never)
  await w.clock.settle()
  const board = w.files.get(BOARD)
  const memory = w.files.get('/.symcc/scouts.json')
  await finish($, 's1', 'Found one gap: the parser has no test for empty input.')
  await w.clock.settle()
  await w.clock.advance(1500)
  expect(w.reached).toEqual(['s1'])
  expect(w.prompts.some(p => p.includes('Found one gap'))).toBe(false)
  expect(w.files.get(BOARD)).toBe(board)
  expect(w.files.get('/.symcc/scouts.json')).toBe(memory)
})
