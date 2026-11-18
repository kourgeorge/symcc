// T-471: the guards find a worker and a checker from the board, not only from this copy's memory, so a copy of the
// plugin whose session (S.me) isn't the one that started them still refuses their edits, their git writes and their
// lead tools, takes the worker's ask_owner, and refuses every tool of an agent whose try ended.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { type Board, addTask, emptyBoard, patchTask, find, ASK_TOOL, ASK_SENT, blockedEditText, gitWriteIn, gitWriteText } from '../hooks/board'
import { S, toolName, workers, boardAgents, starting, queuedWorkers } from '../hooks/app/state'
import { checkEdit, askCall, guardFailed, stoppedText } from '../hooks/app/ask'
import { toolCall } from '../hooks/app/symcc'
import { agentOnBoard, lateHandBack } from '../hooks/app/workers'
import { load } from '../hooks/app/store'
import { fakeHost, memoryFs, done } from './fake-host'
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
