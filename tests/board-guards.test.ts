// T-471: the guards find a worker and a checker from the board, not only from this copy's memory, so a copy of the
// plugin whose session (S.me) isn't the one that started them still refuses their edits, their git writes and their
// lead tools, takes the worker's ask_owner, and refuses every tool of an agent whose try ended.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { type Board, addTask, emptyBoard, patchTask, find, ASK_TOOL, ASK_SENT, blockedEditText, gitWriteIn, gitWriteText, readBoard, withAgentId, AGENT_TRIES_KEPT, CHECKERS_KEPT } from '../hooks/board'
import { S, toolName, workers, boardAgents, starting, queuedWorkers } from '../hooks/app/state'
import { checkEdit, askCall, guardFailed, stoppedText, unknownAgentText } from '../hooks/app/ask'
import { toolCall, notLeadText } from '../hooks/app/symcc'
import { TOOLS } from '../hooks/app/tools'
import { SCOUT_BOARD_TOOLS, scoutToolRefusal } from '../hooks/core/scouts'
import { agentOnBoard, lateHandBack } from '../hooks/app/workers'
import { load } from '../hooks/app/store'
import { fakeHost, memoryFs, done } from './fake-host'
import type { SymccRun } from '../types'
import type { BoardTask } from '../hooks/board'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const ISO = '2026-11-18T00:00:00.000Z'
const quiet = { ui: { log: () => undefined } } as never

/** A copy of the plugin in session "me", with task T-1 (files src/) "doing" for worker w9 of another session, as `extra` changes it. */
async function world(extra: Partial<BoardTask> = {}) {
  const files = new Map<string, string>()
  // the board lock is a hard link (ln), its safe write renames a temp file (mv), and both remove theirs (rm): done on `files`
  const run = async (argv: readonly string[]) => {
    const [cmd, ...rest] = argv
    const args = rest.filter(x => !x.startsWith('-'))
    if (cmd === 'ln') {
      if (files.has(args[1]!)) return done({ exitCode: 1, stderr: 'File exists' })
      files.set(args[1]!, files.get(args[0]!)!)
    }
    if (cmd === 'mv' && files.has(args[0]!)) {
      files.set(args[1]!, files.get(args[0]!)!)
      files.delete(args[0]!)
    }
    if (cmd === 'rm') for (const p of args) files.delete(p)
    return done()
  }
  const { host } = fakeHost({ fs: memoryFs(files), session: { id: async () => 'me' }, run })
  S.root = ROOT
  S.me = 'me'
  const [b0, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', details: 'Do it.\nDone when: done.', files: ['src/'] }, ISO)
  const b1 = patchTask(b0, t.id, { status: 'doing', attempts: 1, session: 'another-session', agent: 'w9', branch: 'symcc/T-1', runs: [{ started: ISO }] }, ISO)
  // `extra` on the running try (a patch that starts a try drops the marks of the try before, such as `checker`)
  const b: Board = patchTask(b1, t.id, extra, ISO)
  // written as is (the fake host has no `mv` for saveBoard's safe write); the plugin's own changes go through `change`
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b))
  return { host, files }
}

test("another session's worker: an edit outside its task's files is refused and recorded on its try; inside them it is allowed", async () => {
  const { host } = await world()
  expect(await checkEdit(host, 'w9', { path: `${WT}/README.md` })).toBe(blockedEditText('README.md'))
  expect(find(await load(host), 'T-1')!.try_refused).toEqual(['README.md'])
  expect(await checkEdit(host, 'w9', { path: `${WT}/src/a.ts` })).toBeUndefined()
  // the owner's copy is refused too, and so is a git write
  expect(await checkEdit(host, 'w9', { path: `${ROOT}/README.md` })).toMatch(/^Refused: README\.md is in the owner's copy/)
  expect(await checkEdit(host, 'w9', { command: 'git commit -am x' })).toMatch(/^Refused/)
  // found on the board, not taken into this copy's workers (a hand-back keeps lateHandBack's own rule)
  expect(workers.size).toBe(0)
  expect(await lateHandBack(host, 'w9')).toBe(false)
})

test("another session's worker's ask_owner is taken and written to its try", async () => {
  const { host } = await world()
  expect(await askCall(host, 'w9', { question: 'Which file?' })).toBe(ASK_SENT)
  expect(find(await load(host), 'T-1')!.try_question?.question).toBe('Which file?')
  expect(await toolCall(host, toolName(ASK_TOOL), 'w9', { question: 'Again?' })).toEqual({ result: ASK_SENT })
  expect(workers.size).toBe(0)
})

test("another session's checker (named on the board): its git write, an edit outside its folder and the lead's tools are refused", async () => {
  const { host } = await world({ checker: 'c9', finishing: ISO })
  const commit = 'git commit -am "x"'
  expect(await checkEdit(host, 'c9', { command: commit })).toBe(gitWriteText(gitWriteIn(commit)!))
  expect(await checkEdit(host, 'c9', { path: `${ROOT}/README.md` })).toMatch(/^Refused: README\.md is in the owner's copy/)
  expect(await checkEdit(host, 'c9', { command: `cat ${WT}/src/a.ts` })).toBeUndefined()
  const ask = await toolCall(host, toolName(ASK_TOOL), 'c9', { question: 'x' })
  expect(ask && 'deny' in ask).toBe(true)
  expect(await askCall(host, 'c9', { question: 'x' })).toMatch(/^Refused/)
  expect((await agentOnBoard(host, 'c9'))?.kind).toBe('checker')
})

test('a checker id is kept on the board only while its task is "doing" on that try', async () => {
  const { host } = await world({ checker: 'c9' })
  const b = await load(host)
  expect(find(patchTask(b, 'T-1', { attempts: 2 }, ISO), 'T-1')!.checker).toBeUndefined()
  expect(find(patchTask(b, 'T-1', { status: 'todo' }, ISO), 'T-1')!.checker).toBeUndefined()
  expect(find(patchTask(b, 'T-1', { note: 'x' }, ISO), 'T-1')!.checker).toBe('c9')
})

test('an agent whose task no longer runs it (another status, or its try handed back) is refused every tool, from the board', async () => {
  for (const extra of [{ status: 'todo' as const }, { status: 'done' as const }, { runs: [{ started: ISO, ended: ISO }] }, { finishing: ISO }]) {
    const { host } = await world(extra)
    expect(await toolCall(host, 'Bash', 'w9', {})).toEqual({ deny: stoppedText() })
    expect(await checkEdit(host, 'w9', { path: `${WT}/src/a.ts` })).toBe(stoppedText())
    expect(await askCall(host, 'w9', { question: 'x' })).toMatch(/^Refused/)
  }
})

test("an earlier try's agent, while this copy has the new try waiting to start, is refused: its ask_owner, its edit and a refused-edit record, with nothing written onto the new try", async () => {
  for (const wait of ['starting', 'queued'] as const) {
    const { host } = await world({ attempts: 2, session: 'me', agent: 'w-old', note: 'queued', runs: [{ started: ISO, ended: ISO }, { started: ISO }] })
    if (wait === 'starting') starting.add('T-1')
    else queuedWorkers.set('T-1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() })
    expect((await agentOnBoard(host, 'w-old'))?.kind).toBe('ended')
    expect(await askCall(host, 'w-old', { question: 'Q from old?' })).toMatch(/^Refused/)
    expect(await checkEdit(host, 'w-old', { path: `${WT}/src/a.ts` })).toBe(stoppedText())
    expect(await checkEdit(host, 'w-old', { path: `${WT}/README.md` })).toBe(stoppedText())
    const t = find(await load(host), 'T-1')!
    expect(t.try_question).toBeUndefined()
    expect(t.try_refused).toBeUndefined()
    starting.clear()
    queuedWorkers.clear()
  }
})

test('a guard that crashes after the board named the agent still refuses it (worker, checker, ended agent)', async () => {
  const { host } = await world({ checker: 'c9' })
  for (const id of ['w9', 'c9']) {
    expect(guardFailed(quiet, 'tool.check', id, { kind: 'throw', message: 'boom' })).toBeUndefined()
    await agentOnBoard(host, id)
    expect(boardAgents.has(id)).toBe(true)
    expect(guardFailed(quiet, 'tool.check', id, { kind: 'throw', message: 'boom' })).toMatch(/refused/)
    expect(guardFailed(quiet, 'tool.call', id, { kind: 'timeout' })).toMatch(/refused/)
  }
})

test("an agent not on the board is none of symcc's: nothing is refused, and a crashed guard lets it go on", async () => {
  const { host } = await world()
  expect(await agentOnBoard(host, 'someone')).toBeUndefined()
  expect(await checkEdit(host, 'someone', { path: `${ROOT}/README.md` })).toBeUndefined()
  expect(await checkEdit(host, 'someone', { command: 'git commit -am x' })).toBeUndefined()
  expect(await toolCall(host, 'Bash', 'someone', {})).toBeNull()
  expect(await askCall(host, 'someone', { question: 'x' })).toMatch(/^Refused/)
  expect(boardAgents.has('someone')).toBe(false)
  expect(guardFailed(quiet, 'tool.check', 'someone', { kind: 'throw' })).toBeUndefined()
  // the lead (no agent id) is never looked up
  expect(await checkEdit(host, undefined, { path: `${ROOT}/README.md` })).toBeUndefined()
})

test("T-525: an agent the board no longer has on record (an old try past the kept ids) is refused every lead tool; the lead still gets them; a worker and a checker keep their refusals", async () => {
  // tries 2..5 keep their agent ids; try 1's agent (w-1) is in no task's runs any more
  const runs: SymccRun[] = [{ started: ISO, ended: ISO }, ...[2, 3, 4, 5].map(n => ({ started: ISO, ended: ISO, agent: `w-${n}` })), { started: ISO }]
  const { host, files } = await world({ attempts: 6, agent: 'w9', runs })
  // the checker of this try (a patch that starts a try drops the checker, so it is named on the try after it)
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(patchTask(await load(host), 'T-1', { checker: 'c9' }, ISO)))
  expect(await agentOnBoard(host, 'w-1')).toBeUndefined()
  expect((await agentOnBoard(host, 'c9'))?.kind).toBe('checker')
  const before = files.get(`${ROOT}/${S.N.boardFile}`)
  const input = { task: 'T-1', title: 'x', details: 'y', why: 'z', origin_by: 'owner', mode: 'off', status: 'review' }
  for (const tool of TOOLS().map(t => t.name)) {
    for (const id of ['w-1', 'someone', 'w9']) {
      const r = await toolCall(host, toolName(tool), id, input)
      expect(r && 'deny' in r ? r.deny : `${id} not refused: ${tool}`).toBe(notLeadText(tool))
    }
    // a checker keeps today's rule: board and stats run, the rest is refused as read-only
    const c = await toolCall(host, toolName(tool), 'c9', input)
    if (SCOUT_BOARD_TOOLS.includes(tool)) expect(c && 'result' in c ? 'ran' : JSON.stringify(c)).toBe('ran')
    else expect(c && 'deny' in c ? c.deny : `c9 not refused: ${tool}`).toBe(scoutToolRefusal(tool, S.N.name)!)
  }
  expect(files.get(`${ROOT}/${S.N.boardFile}`)).toBe(before)
  // the lead (no agent id) still gets its tools
  const board = await toolCall(host, toolName('board'), undefined, { task: 'T-1' })
  expect(board && 'result' in board ? board.result : 'refused').toContain('T-1')
})

test("T-555: an agent of symcc's type the board no longer names is refused every edit and shell command (in the owner's copy too), reads stay allowed; the lead's own subagents, the lead and a current worker go on", async () => {
  const runs: SymccRun[] = [{ started: ISO, ended: ISO }, ...[2, 3, 4, 5].map(n => ({ started: ISO, ended: ISO, agent: `w-${n}` })), { started: ISO }]
  const { host } = await world({ attempts: 6, agent: 'w9', runs })
  // Claude Code's agent list: w-1 is an old try's worker (symcc's worker type), explore the lead's own Explore subagent
  host.agents.list = async () => [
    { id: 'w-1', kind: 'worker', status: 'running' },
    { id: 'old-scout', kind: 'scout', status: 'running' },
    { id: 'explore', kind: 'other', status: 'running' },
  ]
  expect(await agentOnBoard(host, 'w-1')).toBeUndefined()
  for (const id of ['w-1', 'old-scout']) {
    expect(await checkEdit(host, id, { path: `${ROOT}/README.md` })).toBe(unknownAgentText())
    expect(await checkEdit(host, id, { path: `${WT}/src/a.ts` })).toBe(unknownAgentText())
    expect(await checkEdit(host, id, { command: `echo x > ${ROOT}/README.md` })).toBe(unknownAgentText())
    expect(await checkEdit(host, id, { command: 'git commit -am x' })).toBe(unknownAgentText())
    // a read (no file written, no command) is not refused
    expect(await checkEdit(host, id, null)).toBeUndefined()
    // remembered, so a crashed guard still refuses it
    expect(guardFailed(quiet, 'tool.check', id, { kind: 'throw' })).toMatch(/refused/)
  }
  // the lead's own subagent, and an agent the host doesn't list (it can't be told), go on as before
  expect(await checkEdit(host, 'explore', { path: `${ROOT}/README.md` })).toBeUndefined()
  expect(await checkEdit(host, 'explore', { command: `echo x > ${ROOT}/README.md` })).toBeUndefined()
  expect(await checkEdit(host, 'unlisted', { path: `${ROOT}/README.md` })).toBeUndefined()
  // a host whose agent list fails can't tell either
  host.agents.list = async () => Promise.reject(new Error('no list'))
  expect(await checkEdit(host, 'w-0', { path: `${ROOT}/README.md` })).toBeUndefined()
  // a kind the caller passes in (OpenCode's session metadata) decides over the list
  expect(await checkEdit(host, 'w-0', { path: `${ROOT}/README.md` }, undefined, async () => 'symcc')).toBe(unknownAgentText())
  // the lead (no agent id) and the current worker are judged as before
  expect(await checkEdit(host, undefined, { path: `${ROOT}/README.md` })).toBeUndefined()
  expect(await checkEdit(host, 'w9', { path: `${WT}/src/a.ts` }, undefined, async () => 'symcc')).toBeUndefined()
  expect(await checkEdit(host, 'w9', { path: `${ROOT}/README.md` })).toMatch(/^Refused: README\.md is in the owner's copy/)
})

test('an unreadable board makes the guard throw (so guardFailed decides) instead of letting an edit through', async () => {
  const { host, files } = await world()
  files.set(`${ROOT}/.symcc/board.json`, '{ not json')
  let threw = false
  await checkEdit(host, 'w9', { path: `${ROOT}/README.md` }).catch(() => (threw = true))
  expect(threw).toBe(true)
})

test('with no project folder known, nothing is looked up', async () => {
  const { host } = await world()
  S.root = ''
  expect(await agentOnBoard(host, 'w9')).toBeUndefined()
})

// ---------------- T-479: ended agents stay on their try ----------------

test("T-479: a checker named on a try, once the task was dropped, is refused every tool by another copy", async () => {
  const { host, files } = await world({ checker: 'c9', finishing: ISO })
  const b = patchTask(await load(host), 'T-1', { status: 'dropped' }, ISO)
  expect(find(b, 'T-1')!.checker).toBeUndefined()
  expect(find(b, 'T-1')!.runs!.at(-1)!.checkers).toEqual(['c9'])
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b))
  expect((await agentOnBoard(host, 'c9'))?.kind).toBe('ended')
  expect(await toolCall(host, 'Bash', 'c9', {})).toEqual({ deny: stoppedText() })
  expect(await checkEdit(host, 'c9', { command: 'git commit -am x' })).toBe(stoppedText())
  expect(await checkEdit(host, 'c9', { path: `${ROOT}/README.md` })).toBe(stoppedText())
})

test("T-479: an earlier try's worker is refused after a new try is claimed (its id is kept on its own try)", async () => {
  const { host, files } = await world()
  // the try of w9 ends, and a new try is claimed: the board then names no worker (workers.ts clears agent)
  const b0 = patchTask(await load(host), 'T-1', { status: 'todo' }, ISO)
  const b1 = patchTask(b0, 'T-1', { status: 'doing', attempts: 2, session: 'another-session', runs: [...find(b0, 'T-1')!.runs!, { started: ISO }] }, ISO)
  delete find(b1, 'T-1')!.agent
  expect(find(b1, 'T-1')!.runs!.map(r => r.agent)).toEqual(['w9', undefined])
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b1))
  expect((await agentOnBoard(host, 'w9'))?.kind).toBe('ended')
  expect(await toolCall(host, 'Bash', 'w9', {})).toEqual({ deny: stoppedText() })
  expect(await checkEdit(host, 'w9', { path: `${WT}/src/a.ts` })).toBe(stoppedText())
  expect(await askCall(host, 'w9', { question: 'x' })).toMatch(/^Refused/)
  expect(find(await load(host), 'T-1')!.try_question).toBeUndefined()
  // the new try's worker, once recorded, runs as usual
  const b2 = patchTask(b1, 'T-1', { agent: 'w10' }, ISO)
  expect(find(b2, 'T-1')!.runs!.map(r => r.agent)).toEqual(['w9', 'w10'])
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b2))
  expect((await agentOnBoard(host, 'w10'))?.kind).toBe('worker')
  expect((await agentOnBoard(host, 'w9'))?.kind).toBe('ended')
})

test('T-479: only the last few tries keep agent ids, a try keeps only its latest checkers, and bad ids read from the file are dropped', async () => {
  let runs: SymccRun[] = []
  for (let i = 0; i < AGENT_TRIES_KEPT + 2; i++) runs = withAgentId([...runs, { started: ISO }], 'agent', `w${i}`)!
  expect(runs.map(r => r.agent)).toEqual([undefined, undefined, ...Array.from({ length: AGENT_TRIES_KEPT }, (_, i) => `w${i + 2}`)])
  for (let i = 0; i < CHECKERS_KEPT + 3; i++) runs = withAgentId(runs, 'checker', `c${i}`)!
  expect(runs.at(-1)!.checkers).toEqual(Array.from({ length: CHECKERS_KEPT }, (_, i) => `c${i + 3}`))
  // a bad id is never kept
  for (const bad of ['', 'a b', 'x'.repeat(201), 'new\nline', 7, null]) expect(withAgentId([{ started: ISO }], 'agent', bad)).toEqual([{ started: ISO }])
  // from the file: bad values are cleaned, and an empty list is dropped
  const text = JSON.stringify({ tasks: [{ id: 'T-1', status: 'todo', title: 'x', details: '', note: '', files: [], after: [], history: [], order: 1, attempts: 1, question: null, branch: null, created_at: ISO, updated_at: ISO, runs: [{ started: ISO, agent: 5, checkers: ['ok', 3, '', 'ok', 'has space'] }, { started: ISO, agent: 'w2', checkers: 'c' }] }] })
  const read = readBoard(text)
  expect(read.board.tasks[0]!.runs!.map(r => ({ agent: r.agent, checkers: r.checkers }))).toEqual([{ agent: undefined, checkers: ['ok'] }, { agent: 'w2', checkers: undefined }])
  expect(read.board.tasks[0]!.runs!.every(r => !('checkers' in r) || Array.isArray(r.checkers))).toBe(true)
  expect(read.fixed.some(f => /bad agent ids/.test(f))).toBe(true)
})
