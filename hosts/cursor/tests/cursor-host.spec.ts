// The Cursor host (hosts/cursor/) with a fake Cursor SDK (./fake-sdk.ts): symcc's engine runs a task end to end with
// its worker as an SDK agent, a running worker takes messages, its question tool reaches the board, and the lead chat
// wakes at once for an update. Run with `npx -y bun test ./tests/` in hosts/cursor/ (or `npm test` there).
import { test, expect } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { runCommand } from '../../node/host'
import type { AgentRunEnd } from '../../../hooks/app/symcc'
import { agentToolDefs, disallowedFor, runEnd, sdkAgents, withCursorPrompt } from '../agents'
import { leadChat, type LeadEvent } from '../lead'
import { actionCommand, openCursorSession } from '../session'
import type { PanelView } from '../protocol'
import { fakeSdk, until, type Turn } from './fake-sdk'

const PLUGIN_ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '')

const git = (repo: string, ...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })

/** A scratch git repo whose test checks that hello.txt holds the fake worker's greeting. */
async function scratchRepo(): Promise<string> {
  const repo = await mkdtemp('/tmp/symcc-cursor-host-')
  await git(repo, 'init', '-q', '-b', 'main')
  await writeFile(`${repo}/check.sh`, 'test "$(cat hello.txt)" = "hello from the fake worker"\n')
  await writeFile(`${repo}/.gitignore`, '.symcc/\n')
  await git(repo, 'add', '.')
  await git(repo, 'commit', '-qm', 'init')
  return repo
}

type BoardFile = { tasks: { id: string; status: string }[] }
const board = async (repo: string): Promise<BoardFile> => JSON.parse(await readFile(`${repo}/.symcc/board.json`, 'utf8').catch(() => '{"tasks":[]}')) as BoardFile

/** Which of symcc's agents a fake turn belongs to, by the tools it was given. */
const isLead = (t: Turn) => 'add' in t.agent.tools
const isWorker = (t: Turn) => 'ask_owner' in t.agent.tools

test('one task end to end on Cursor: the worker is an SDK agent in its worktree, it merges, and the lead is told at once', async () => {
  const repo = await scratchRepo()
  const sdk = fakeSdk(async t => {
    if (isLead(t)) return { status: 'finished', result: 'Noted.' }
    // the follow-up after a hand-back (T-656) only reads
    if (t.mode === 'plan') return { status: 'finished', result: 'none' }
    if (isWorker(t)) {
      await writeFile(`${t.agent.options.cwd}/hello.txt`, 'hello from the fake worker\n')
      return { status: 'finished', result: 'Wrote hello.txt with a greeting.', usage: { inputTokens: 100, outputTokens: 20 } }
    }
    return { status: 'finished', result: 'Looks fine.' }
  })
  const lead: LeadEvent[] = []
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-t1', onLead: e => void lead.push(e) })
  try {
    await s.command('symcc-init')
    expect(await s.tool('settings', { test_commands: ['sh check.sh'] })).toContain('sh check.sh')
    expect(await s.tool('add', { title: 'Say hello', details: 'Write hello.txt with a greeting', files: ['hello.txt'], why: 'a test', origin_by: 'owner', request: 'Say hello' })).toContain('added T-1')
    await until(async () => (await board(repo)).tasks[0]?.status === 'done', 60_000, 'T-1 to be done')

    // the worker ran in the task's worktree, with ask_owner as its tool and no subagents, and its prompt names the tool
    const w = sdk.agents.find(a => 'ask_owner' in a.tools)!
    expect(w.options.cwd).toMatch(/\.symcc\/worktrees\/T-1$/)
    expect(w.turns[0]!.text).toContain('# Task T-1: ')
    expect(w.turns[0]!.text).toContain('ask_owner')
    expect(w.options.disallowedTools).toContain('task')
    expect(w.options.disallowedTools).not.toContain('edit')
    expect((await git(repo, 'show', 'main:hello.txt')).stdout).toBe('hello from the fake worker\n')

    // the lead was woken with the news: a turn of its own, from symcc, with the lead guide in front of the first one
    await until(() => lead.some(e => e.type === 'message' && e.from === 'symcc' && e.text.includes('T-1')), 20_000, 'the lead to be told')
    const leadAgent = sdk.agents.find(a => 'add' in a.tools)!
    expect(leadAgent.turns[0]!.text).toContain('you are the lead')
    expect(leadAgent.options.cwd).toBe(repo)
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test("a Cursor worker's ask_owner call reaches the board as a question for the owner", async () => {
  const repo = await scratchRepo()
  const sdk = fakeSdk(async t => {
    if (isWorker(t) && t.mode !== 'plan') {
      const said = await t.agent.tools.ask_owner!.execute({ question: 'Which greeting should hello.txt hold?', options: ['hello', 'hi'] })
      return { status: 'finished', result: `I asked the owner (${said.slice(0, 40)}).` }
    }
    return { status: 'finished', result: 'none' }
  })
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-t2' })
  try {
    await s.command('symcc-init')
    await s.tool('add', { title: 'Say hello', details: 'Write hello.txt with a greeting', files: ['hello.txt'], why: 'a test', origin_by: 'owner', request: 'Say hello' })
    await until(async () => (await s.tool('board', { task: 'T-1' })).includes('Which greeting should hello.txt hold?'), 60_000, 'the question on the board')
    expect((await board(repo)).tasks[0]?.status).not.toBe('done')
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test('a running SDK worker takes a message mid-turn (steer), a stop ends it as aborted, and a finished one gets a read-only follow-up', async () => {
  const sdk = fakeSdk(async t => {
    if (t.mode === 'plan') return { status: 'finished', result: `follow-up: ${t.text}` }
    const m = await Promise.race([t.nextSteer(), t.onCancel.then(() => '')])
    return { status: 'finished', result: `got: ${m}` }
  })
  const ends: [string, AgentRunEnd][] = []
  const agents = sdkAgents({ sdk, model: 'cursor-default', onEnd: (id, e) => void ends.push([id, e]), onTool: async () => '' })

  const a = await agents.spawn({ kind: 'worker', prompt: 'do it', name: 'w', description: 'T-1', cwd: '/tmp', model: 'sonnet' })
  await until(() => sdk.agents[0]?.turns.length === 1)
  await agents.send(a.agentId!, 'Wrap up now')
  await until(() => ends.length === 1)
  expect(ends[0]).toEqual([a.agentId!, { answer: 'got: Wrap up now', end: { reason: 'answer' }, isAborted: false, tokens: undefined }])
  expect((await agents.list())[0]!.status).toBe('completed')
  // a role's Claude Code model word means symcc's default model here
  expect(sdk.agents[0]!.options.model).toBe('cursor-default')

  await agents.followUp!(a.agentId!, 'Anything for org-mem?')
  await until(() => ends.length === 2)
  expect(sdk.agents[0]!.turns[1]!.mode).toBe('plan')
  expect(ends[1]![1].answer).toBe('follow-up: Anything for org-mem?')

  const b = await agents.spawn({ kind: 'worker', prompt: 'do it', name: 'w2', description: 'T-2', cwd: '/tmp', model: 'gpt-5' })
  expect(sdk.agents[1]!.options.model).toBe('gpt-5')
  await until(() => sdk.agents[1]?.turns.length === 1)
  expect(agents.running()).toBe(1)
  await agents.stop(b.agentId!, 'Stop now')
  await until(() => ends.length === 3)
  expect(ends[2]![1].isAborted).toBe(true)
  expect((await agents.list())[1]!.status).toBe('killed')
  await agents.stopAll()
  expect(sdk.agents.every(x => x.closed)).toBe(true)
})

test("an SDK agent's symcc tools: a worker's ask_owner, a scout's board tools, each answered for the calling agent", async () => {
  const sdk = fakeSdk(async t => ({ status: 'finished', result: await t.agent.tools.ask_owner!.execute({ question: 'Which color?' }) }))
  const ends: AgentRunEnd[] = []
  const agents = sdkAgents({ sdk, model: 'm', onEnd: (_id, e) => void ends.push(e), onTool: async (id, tool, input) => `${id} ${tool} ${String(input.question)}` })
  const a = await agents.spawn({ kind: 'worker', prompt: 'do it', name: 'w', description: 'T-1', cwd: '/tmp' })
  await until(() => ends.length === 1)
  expect(ends[0]!.answer).toBe(`${a.agentId} ask_owner Which color?`)
  await agents.stopAll()

  expect(agentToolDefs('worker').map(d => d.name)).toEqual(['ask_owner'])
  expect(agentToolDefs('scout').map(d => d.name)).toEqual(['board', 'scouts', 'stats'])
  expect(agentToolDefs('checker').map(d => d.name)).toEqual(['board', 'stats'])
  expect(disallowedFor({ kind: 'worker', tools: ['web'] })).toEqual(['task', 'generateImage'])
  expect(disallowedFor({ kind: 'scout' })).toEqual(['task', 'generateImage', 'webSearch', 'webFetch', 'edit', 'delete', 'applyAgentDiff'])
  expect(withCursorPrompt({ kind: 'worker', prompt: '# Task T-1: x' })).toContain('ask_owner')
  expect(withCursorPrompt({ kind: 'worker', prompt: '# Task T-1: x' }).endsWith('\n\n# Task T-1: x')).toBe(true)
  expect(runEnd({ status: 'error', error: 'boom' }, false)).toEqual({ answer: 'the Cursor agent run ended with status error: boom', end: { reason: 'error' }, isAborted: false, tokens: undefined })
  expect(runEnd({ status: 'finished', result: 'ok', usage: { inputTokens: 3, outputTokens: 4, cacheReadTokens: 5 } }, false).tokens).toEqual({ input: 3, output: 4, cache_read: 5 })
})

test('the lead chat: an idle lead starts at once, messages for a busy lead go together as its next turn, an urgent one goes into the running turn', async () => {
  const gates: (() => void)[] = []
  const sdk = fakeSdk(t => new Promise(r => void gates.push(() => r({ status: 'finished', result: `answered ${t.agent.turns.length}` }))))
  const ev: LeadEvent[] = []
  const lead = leadChat({ sdk, cwd: '/tmp', model: 'm', tools: () => ({}), guide: async () => 'GUIDE', onEvent: e => void ev.push(e) })
  await lead.send('first', 'owner')
  await until(() => sdk.agents[0]?.turns.length === 1)
  expect(sdk.agents[0]!.turns[0]!.text).toBe('GUIDE\n\n---\n\nfirst')
  expect(lead.busy()).toBe(true)

  await lead.send('update A', 'symcc')
  await lead.send('update B', 'symcc')
  await lead.send('T-3 needs you now', 'symcc', { urgent: true })
  expect(sdk.agents[0]!.turns[0]!.steered).toEqual(['T-3 needs you now'])
  expect(sdk.agents[0]!.turns.length).toBe(1)

  gates.shift()!()
  await until(() => sdk.agents[0]!.turns.length === 2)
  expect(sdk.agents[0]!.turns[1]!.text).toBe('update A\n\nupdate B')
  gates.shift()!()
  await lead.idle()
  expect(ev.flatMap(e => (e.type === 'answer' ? [e.text] : []))).toEqual(['answered 1', 'answered 2'])
  expect(ev.flatMap(e => (e.type === 'message' ? [e.from] : []))).toEqual(['owner', 'symcc', 'symcc'])
  await lead.close()
  expect(sdk.agents[0]!.closed).toBe(true)
})

test("the board panel: a task in review is a card with Approve first, Approve on the panel merges it, and the stream's news says so", async () => {
  const repo = await scratchRepo()
  const sdk = fakeSdk(async t => {
    if (isWorker(t) && t.mode !== 'plan') {
      await writeFile(`${t.agent.options.cwd}/hello.txt`, 'hello from the fake worker\n')
      return { status: 'finished', result: 'Wrote hello.txt.' }
    }
    return { status: 'finished', result: 'none' }
  })
  const views: PanelView[] = []
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-t6', onView: v => void views.push(v) })
  try {
    await s.command('symcc-init')
    await s.tool('settings', { test_commands: ['sh check.sh'] })
    expect(await s.mode('review')).toContain('approve merge')
    await s.tool('add', { title: 'Say hello', details: 'Write hello.txt with a greeting', files: ['hello.txt'], why: 'a test', origin_by: 'owner', request: 'Say hello' })
    await until(() => s.view().needs.some(n => n.id === 'T-1' && n.kind === 'review' && !!n.files?.length), 60_000, 'T-1 to wait for review')
    const need = s.view().needs.find(n => n.id === 'T-1')!
    expect(need.actions.map(a => a.id)).toEqual(['approve', 'show-changes', 'reject'])
    expect(need.actions[0]!.primary).toBe(true)
    expect(need.files).toEqual([{ file: 'hello.txt', added: 1, removed: 0 }])
    expect(s.view().mode).toBe('review')
    expect(s.view().lanes.find(l => l.id === 'T-1')?.stations[s.view().lanes.find(l => l.id === 'T-1')!.at]).toBe('you')
    expect(await s.act('T-1', 'show-changes')).toContain('hello from the fake worker')

    await s.act('T-1', 'approve')
    await until(async () => (await board(repo)).tasks[0]?.status === 'done', 60_000, 'T-1 to merge')
    await until(() => s.view().needs.length === 0 && s.view().news.some(n => n.task === 'T-1' && n.kind === 'merged'), 20_000, 'the merge in the news')
    expect(s.view().counts.doneToday).toBe(1)
    expect(views.length).toBeGreaterThan(2)
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test("the board panel: a worker's question is a card with its options, and an answer on the panel sends the task back to work", async () => {
  const repo = await scratchRepo()
  const answers: string[] = []
  const sdk = fakeSdk(async t => {
    if (isWorker(t) && t.mode !== 'plan') {
      answers.push(await t.agent.tools.ask_owner!.execute({ question: 'Which greeting should hello.txt hold?', options: ['hello', 'hi'] }))
      return { status: 'finished', result: 'asked' }
    }
    return { status: 'finished', result: 'none' }
  })
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-t7' })
  try {
    await s.command('symcc-init')
    await s.tool('add', { title: 'Say hello', details: 'Write hello.txt with a greeting', files: ['hello.txt'], why: 'a test', origin_by: 'owner', request: 'Say hello' })
    await until(() => s.view().needs.some(n => n.id === 'T-1'), 60_000, 'the question on the panel')
    const need = s.view().needs.find(n => n.id === 'T-1')!
    expect(need.kind).toBe('asks')
    expect(need.title).toContain('Which greeting should hello.txt hold?')
    expect(need.choices).toEqual(['hello', 'hi', 'Answer…'])
    await s.answer('T-1', 'hi')
    await until(() => !s.view().needs.some(n => n.id === 'T-1'), 20_000, 'the card to go')
    expect((await board(repo)).tasks[0]?.status).not.toBe('waiting')
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test('panel actions are sent as the owner’s own commands', () => {
  expect(actionCommand('symcc', 'T-5', 'approve')).toEqual({ command: 'symcc-approve', args: 'T-5' })
  expect(actionCommand('symcc', 'T-5', 'ask-more', ' why so? ')).toEqual({ command: 'symcc-reject', args: 'T-5 why so?' })
  expect(actionCommand('symcc', 'T-5', 'merge-now')).toEqual({ command: 'symcc-task', args: 'T-5 retry' })
  expect(actionCommand('symcc', 'T-5', 'drop', 'not needed')).toEqual({ command: 'symcc-task', args: 'T-5 drop not needed' })
  expect(actionCommand('symcc', 'T-5', 'keep-note')).toEqual({ command: 'symcc-task', args: 'T-5 note' })
})
