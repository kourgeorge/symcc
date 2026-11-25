// The Cursor host (hosts/cursor/) with a fake Cursor SDK (./fake-sdk.ts): symcc's engine runs a task end to end with
// its worker as an SDK agent, a running worker takes messages, its question tool reaches the board, and the lead chat
// wakes at once for an update. Run with `npx -y bun test ./tests/` in hosts/cursor/ (or `npm test` there).
import { test, expect } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { runCommand } from '../../node/host'
import type { AgentRunEnd } from '../../../hooks/app/symcc'
import { agentToolDefs, disallowedFor, runEnd, sdkAgents, withCursorPrompt } from '../agents'
import { leadChat, type LeadEvent } from '../lead'
import { actionCommand, openCursorSession } from '../session'
import type { PanelStep, PanelView } from '../protocol'
import { addStep, readSteps, sessionMarkdown } from '../steps'
import { taskSessions } from '../view'
import { modelInfos, type SdkToolVerdict } from '../sdk'
import { copilotGuard } from '../guard'
import { skillOf } from '../skills'
import { parseLog, parseNumstat, parseWorktreeList } from '../worktrees'
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
    await until(() => lead.some(e => e.type === 'message' && e.from === 'symcc' && e.text.includes('T-1')) && !!sdk.agents.find(a => 'add' in a.tools)?.turns.length, 20_000, 'the lead to be told')
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

test("the lead chat on Cursor: it loads the project's and plugins' settings, a typed command answers the owner itself, a skill and the chosen model, mode and pictures go to the lead", async () => {
  const repo = await scratchRepo()
  const home = await mkdtemp('/tmp/symcc-cursor-home-')
  await mkdir(`${repo}/.cursor/skills/tidy`, { recursive: true })
  await writeFile(`${repo}/.cursor/skills/tidy/SKILL.md`, '---\nname: tidy\ndescription: >-\n  Tidy the code\n  before a review.\n---\nTidy it.\n')
  await mkdir(`${home}/.agents/skills/grill-me`, { recursive: true })
  await writeFile(`${home}/.agents/skills/grill-me/SKILL.md`, '---\nname: grill-me\ndescription: "A relentless interview."\nargument-hint: "the plan"\ndisable-model-invocation: true\n---\n')
  const sdk = fakeSdk(async t => {
    if (isWorker(t)) return await t.onCancel.then(() => ({ status: 'cancelled' }))
    return { status: 'finished', result: 'ok' }
  })
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-t9', home })
  const leadTurns = () => sdk.agents.flatMap(a => a.turns).filter(isLead)
  try {
    await s.command('symcc-init')
    const tasks = await s.message('/symcc-tasks')
    expect(!!tasks.said).toBe(true)
    expect(leadTurns().some(t => t.text.includes('symcc-tasks'))).toBe(false)

    const slash = await s.slash()
    expect(slash.find(c => c.name === 'symcc-tasks')?.kind).toBe('symcc')
    expect(slash.some(c => c.name === 'symcc-answer')).toBe(true)
    expect(slash.find(c => c.name === 'tidy')).toEqual({ name: 'tidy', description: 'Tidy the code before a review.', kind: 'skill', scope: 'project' })
    expect(slash.find(c => c.name === 'grill-me')).toEqual({ name: 'grill-me', description: 'A relentless interview.', kind: 'skill', scope: 'user', hint: 'the plan' })

    await s.lead.idle()
    s.lead.configure({ model: { id: 'gpt-x', params: [{ id: 'reasoning', value: 'high' }] }, mode: 'plan' })
    expect(await s.message('/tidy src only', [{ data: 'AAAA', mimeType: 'image/png' }])).toEqual({})
    await until(() => leadTurns().some(t => t.text.includes('"tidy"')), 20_000, "the skill's turn")
    const turn = leadTurns().find(t => t.text.includes('"tidy"'))!
    expect(turn.text).toContain(`Use the skill "tidy": read ${repo}/.cursor/skills/tidy/SKILL.md and follow it.`)
    expect(turn.text.endsWith('\n\nsrc only')).toBe(true)
    expect([turn.model, turn.mode, turn.images]).toEqual([{ id: 'gpt-x', params: [{ id: 'reasoning', value: 'high' }] }, 'plan', [{ data: 'AAAA', mimeType: 'image/png' }]])
    // a message that only starts with a slash is the owner's words
    await s.lead.idle()
    await s.message('/tmp/x is full')
    await until(() => leadTurns().some(t => t.text.endsWith('/tmp/x is full')), 20_000, 'the plain message')

    // the lead loads the project's and plugins' settings; a worker loads none, as before
    s.lead.configure({ model: undefined, mode: 'agent' })
    await s.tool('add', { title: 'Say hello', details: 'Write hello.txt', files: ['hello.txt'], why: 'a test', origin_by: 'owner', request: 'Say hello' })
    await until(() => sdk.agents.some(a => 'ask_owner' in a.tools), 60_000, 'the worker')
    expect(sdk.agents.filter(a => 'add' in a.tools).map(a => a.options.settings)).toEqual([['project', 'plugins']])
    expect(sdk.agents.filter(a => 'ask_owner' in a.tools).map(a => a.options.settings)).toEqual([undefined])
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
}, 120_000)

test('the lead chat: Stop ends the running turn, summarize waits for an idle lead', async () => {
  const sdk = fakeSdk(async t => (t.text.includes('long') ? await t.onCancel.then(() => ({ status: 'cancelled' })) : { status: 'finished', result: 'ok' }))
  const ev: LeadEvent[] = []
  const lead = leadChat({ sdk, cwd: '/tmp', model: 'm', tools: () => ({}), guide: async () => undefined, onEvent: e => void ev.push(e) })
  expect(await lead.summarize()).toBe('there is nothing to summarize yet')
  await lead.send('a long job', 'owner')
  await until(() => sdk.agents[0]?.turns.length === 1)
  expect(await lead.summarize()).toContain('the lead is working')
  await lead.stop()
  await lead.idle()
  expect(ev.some(e => e.type === 'stopped')).toBe(true)
  expect(await lead.summarize()).toBe(undefined)
  expect(sdk.agents[0]!.summarized).toBe(1)
  expect(ev.filter(e => e.type === 'summarized')).toEqual([{ type: 'summarized', text: 'Summarized the chat.' }])
  expect(ev.filter(e => e.type === 'busy').map(e => (e as { busy: boolean }).busy)).toEqual([true, false, true, false])
  await lead.close()
})

test("the Worktrees page: a worker's folder against the branch it merges into, the project and another checkout; only a finished task's folder can be removed", async () => {
  const repo = await scratchRepo()
  const other = `${repo}-mine`
  const s = await openCursorSession({ root: repo, sdk: fakeSdk(async () => ({ status: 'finished', result: 'ok' })), pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-trees' })
  try {
    await s.command('symcc-init')
    await s.mode('paused')
    expect(await s.tool('add', { title: 'Waits', details: 'Stays to do', why: 'a test', origin_by: 'owner', request: 'Waits' })).toContain('added T-1')
    const leftover = `${repo}/.symcc/worktrees/T-7`
    await git(repo, 'worktree', 'add', '-q', '-b', 'symcc/T-7', leftover, 'main')
    await writeFile(`${leftover}/a.txt`, 'one\n')
    await git(leftover, 'add', 'a.txt')
    await git(leftover, 'commit', '-qm', 'Add a.txt')
    await writeFile(`${leftover}/check.sh`, 'echo changed\n')
    await writeFile(`${leftover}/new.txt`, 'new\n')
    await writeFile(`${repo}/b.txt`, 'main moved on\n')
    await git(repo, 'add', 'b.txt')
    await git(repo, 'commit', '-qm', 'Add b.txt')
    await git(repo, 'worktree', 'add', '-q', '-b', 'mine', other, 'main')
    await git(repo, 'worktree', 'add', '-q', '-b', 'symcc/T-1', `${repo}/.symcc/worktrees/T-1`, 'main')

    const list = await s.worktrees.list()
    expect(list.map(w => [w.kind, w.task ?? w.branch])).toEqual([
      ['task', 'T-1'],
      ['task', 'T-7'],
      ['main', 'main'],
      ['other', 'mine'],
    ])
    const t7 = list.find(w => w.task === 'T-7')!
    expect([t7.where, t7.branch, t7.base, t7.ahead, t7.behind, t7.dirty, t7.untracked]).toEqual(['.symcc/worktrees/T-7', 'symcc/T-7', 'main', 1, 1, 2, 1])
    expect(t7.files.map(f => f.file).sort()).toEqual(['a.txt', 'check.sh'])
    expect(t7.commits.map(c => c.subject)).toEqual(['Add a.txt'])
    expect(list.find(w => w.kind === 'other')!.base).toBe('main')

    const diff = await s.worktrees.diff(t7.path)
    expect(diff).toContain('+one')
    expect(diff).toContain('#   new.txt')
    expect((await s.worktrees.base(t7.path, 'check.sh')).text).toBe('test "$(cat hello.txt)" = "hello from the fake worker"\n')
    expect((await s.worktrees.base(t7.path, 'a.txt')).text).toBe('')
    expect(await s.worktrees.diff('/tmp').then(() => '', (e: Error) => e.message)).toContain("not one of this project's worktrees")

    expect(await s.worktrees.remove(other)).toContain("isn't a worker's folder")
    expect(await s.worktrees.remove(list[0]!.path)).toBe('T-1 is still todo, so its folder stays.')
    expect(await s.worktrees.remove(t7.path)).toBe('Removed .symcc/worktrees/T-7. Its branch symcc/T-7 is kept.')
    expect((await s.worktrees.list()).map(w => w.task ?? w.branch)).toEqual(['T-1', 'main', 'mine'])
    expect((await git(repo, 'rev-parse', '--verify', '-q', 'refs/heads/symcc/T-7')).exitCode).toBe(0)
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
    await rm(other, { recursive: true, force: true })
  }
}, 60_000)

test("git's worktree list, numstat and log as the Worktrees page reads them", () => {
  expect(parseWorktreeList('worktree /p\nHEAD abc\nbranch refs/heads/main\n\nworktree /p/.symcc/worktrees/T-2\nHEAD def\ndetached\nlocked\n\nworktree /gone\nHEAD 123\nbranch refs/heads/x\nprunable gitdir file points to non-existent location\n')).toEqual([
    { path: '/p', head: 'abc', branch: 'main', locked: false, prunable: false, bare: false },
    { path: '/p/.symcc/worktrees/T-2', head: 'def', branch: '', locked: true, prunable: false, bare: false },
    { path: '/gone', head: '123', branch: 'x', locked: false, prunable: true, bare: false },
  ])
  expect(parseNumstat('3\t1\tsrc/a.ts\n-\t-\tlogo.png\n2\t0\tsrc/{old => new}/b.ts\n1\t1\tc.ts => d.ts\n')).toEqual([
    { file: 'src/a.ts', added: 3, removed: 1 },
    { file: 'logo.png', added: 0, removed: 0 },
    { file: 'src/new/b.ts', added: 2, removed: 0 },
    { file: 'd.ts', added: 1, removed: 1 },
  ])
  expect(parseLog('abc1234\x1f1700000000\x1fFix: a\x1fb\n')).toEqual([{ sha: 'abc1234', atMs: 1_700_000_000_000, subject: 'Fix: a\x1fb' }])
})

test("models and skills: a model's options and variants, a skill file's name and folded description", () => {
  expect(
    modelInfos([
      { id: 'default', displayName: 'Auto', variants: [{ params: [], isDefault: true }] },
      {
        id: 'gpt-x',
        displayName: 'GPT X',
        parameters: [{ id: 'fast', displayName: 'Fast', values: [{ value: 'false' }, { value: 'true', displayName: 'Fast' }] }],
        variants: [{ params: [{ id: 'fast', value: 'false' }], isDefault: true }, { params: [{ id: 'fast', value: 'true' }], isMaxMode: true }],
      },
    ]),
  ).toEqual([
    { id: 'default', label: 'Auto', options: [], variants: [{ params: {}, isDefault: true }] },
    { id: 'gpt-x', label: 'GPT X', options: [{ id: 'fast', label: 'Fast', values: [{ value: 'false', label: 'Off' }, { value: 'true', label: 'Fast' }] }], variants: [{ params: { fast: 'false' }, isDefault: true }, { params: { fast: 'true' }, maxMode: true }] },
  ])
  expect(skillOf('---\nname: pr\ndescription: "Use when writing a PR body."\nmetadata:\n  credits: x\n---\nbody', 'pr')).toEqual({ name: 'pr', description: 'Use when writing a PR body.' })
  expect(skillOf('---\ndescription: |\n  Two\n  lines\nargument-hint: <file>\n---\n', 'folder')).toEqual({ name: 'folder', description: 'Two lines', argumentHint: '<file>' })
  expect(skillOf('no front matter', 'plain')).toEqual({ name: 'plain', description: '' })
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
  // the worker asks on its first turn only: asked again on the turn after the answer, the card would be back at once
  const sdk = fakeSdk(async t => {
    if (isWorker(t) && t.mode !== 'plan' && !answers.length) {
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
    // the card shows while the worker's hand-back still runs; until it ends, an answer is refused as "try again in a moment"
    await until(async () => !/try again/.test(await s.answer('T-1', 'hi')), 20_000, 'the answer to be taken')
    await until(() => !s.view().needs.some(n => n.id === 'T-1'), 20_000, 'the card to go')
    expect((await board(repo)).tasks[0]?.status).not.toBe('waiting')
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test("a worker's steps reach the panel as they come, its lane and task name its agent, and its session is saved", async () => {
  const repo = await scratchRepo()
  const sdk = fakeSdk(async t => {
    if (isWorker(t) && t.mode !== 'plan') {
      t.step({ kind: 'status', text: 'running' })
      t.step({ kind: 'thinking', text: 'Write the ' })
      t.step({ kind: 'thinking', text: 'greeting.' })
      t.step({ kind: 'tool', tool: 'shell', callId: 'c1', status: 'running', text: 'ls' })
      t.step({ kind: 'tool', tool: 'shell', callId: 'c1', status: 'completed', text: 'ls' })
      await t.onCancel
      return { status: 'cancelled' }
    }
    return { status: 'finished', result: 'none' }
  })
  const got: [string, PanelStep][] = []
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-t8', onStep: (agent, step) => void got.push([agent, step]) })
  try {
    await s.command('symcc-init')
    await s.tool('add', { title: 'Say hello', details: 'Write hello.txt with a greeting', files: ['hello.txt'], why: 'a test', origin_by: 'owner', request: 'Say hello' })
    await until(() => got.some(([, x]) => x.kind === 'tool' && x.status === 'completed'), 60_000, 'the tool step')
    const agent = got[0]![0]
    // the thinking came in two pieces and goes out as one, before the tool call that came after it
    expect(got.map(([a, x]) => `${a === agent ? '' : a}${x.kind}:${x.status ?? ''}:${x.text}`)).toEqual(['status::running', 'thinking::Write the greeting.', 'tool:running:ls', 'tool:completed:ls'])
    expect(s.steps()[agent]!.map(x => x.kind)).toEqual(['status', 'thinking', 'tool'])
    await until(() => s.view().lanes.some(l => l.id === 'T-1' && l.agentId === agent), 20_000, 'the lane to name its agent')
    expect(s.view().tasks.find(t => t.id === 'T-1')!.sessions).toEqual([{ label: 'Try 1', agent, running: true }])
    await until(async () => readSteps(await readFile(`${repo}/.symcc/sessions/${agent}.jsonl`, 'utf8').catch(() => '')).length === 3, 5000, 'the saved session')
    const saved = readSteps(await readFile(`${repo}/.symcc/sessions/${agent}.jsonl`, 'utf8'))
    expect(saved.map(x => [x.kind, x.text, x.status])).toEqual([['status', 'running', undefined], ['thinking', 'Write the greeting.', undefined], ['tool', 'ls', 'completed']])
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test('steps: words join the words before them, a tool call is replaced by its end, and a session reads as Markdown', () => {
  let list: PanelStep[] = []
  for (const s of [
    { atMs: 1, kind: 'text', text: 'Hel' },
    { atMs: 2, kind: 'text', text: 'lo, ' },
    { atMs: 3, kind: 'tool', tool: 'shell', callId: 'a', status: 'running', text: 'npm test' },
    { atMs: 4, kind: 'text', text: 'world' },
    { atMs: 5, kind: 'tool', tool: 'shell', callId: 'a', status: 'error', text: 'npm test → exit 1' },
  ] as PanelStep[])
    list = addStep(list, s)
  expect(list).toEqual([
    { atMs: 1, kind: 'text', text: 'Hello, ' },
    { atMs: 3, kind: 'tool', tool: 'shell', callId: 'a', status: 'error', text: 'npm test → exit 1' },
    { atMs: 4, kind: 'text', text: 'world' },
  ])
  const file = `${list.map(x => JSON.stringify(x)).join('\n')}\n{"kind":"te`
  expect(readSteps(file)).toEqual(list)
  const page = sessionMarkdown('T-1 Say hello: Try 1', list)
  expect(page.startsWith('# T-1 Say hello: Try 1')).toBe(true)
  expect(page).toContain('**shell** (failed)')
  expect(page).toContain('npm test → exit 1')
  expect(sessionMarkdown('x', [])).toContain('No steps were saved')
})

test("a task's sessions: one per agent of each try, newest first, the running one marked", () => {
  const runs = [
    { started: 'a', ended: 'b', agents: [{ kind: 'worker', started: 'a', ended: 'b' }] },
    { started: 'c', ended: 'd', agents: [{ id: 'w2', kind: 'worker', started: 'c', ended: 'd' }] },
    { started: 'e', agents: [{ id: 'w3', kind: 'worker', started: 'e', ended: 'f' }, { id: 'w4', kind: 'worker', started: 'f' }] },
  ]
  expect(taskSessions({ id: 'T-1', runs } as unknown as Parameters<typeof taskSessions>[0])).toEqual([
    { label: 'Try 3 (2)', agent: 'w4', running: true },
    { label: 'Try 3 (1)', agent: 'w3', running: false },
    { label: 'Try 2', agent: 'w2', running: false },
  ])
})

test('panel actions are sent as the owner’s own commands', () => {
  expect(actionCommand('symcc', 'T-5', 'approve')).toEqual({ command: 'symcc-approve', args: 'T-5' })
  expect(actionCommand('symcc', 'T-5', 'ask-more', ' why so? ')).toEqual({ command: 'symcc-reject', args: 'T-5 why so?' })
  expect(actionCommand('symcc', 'T-5', 'merge-now')).toEqual({ command: 'symcc-task', args: 'T-5 retry' })
  expect(actionCommand('symcc', 'T-5', 'drop', 'not needed')).toEqual({ command: 'symcc-task', args: 'T-5 drop not needed' })
  expect(actionCommand('symcc', 'T-5', 'keep-note')).toEqual({ command: 'symcc-task', args: 'T-5 note' })
  expect(actionCommand('symcc', 'T-5', 'run-now')).toEqual({ command: 'symcc-task', args: 'T-5 run' })
  expect(actionCommand('symcc', 'T-5', 'run-now', 'anyway')).toEqual({ command: 'symcc-task', args: 'T-5 run anyway' })
})

test("on Copilot's agents symcc's guard judges each tool call first: a worker's edit outside its task's files or its folder is refused, its shell commands run from its folder, the lead's go on", async () => {
  const repo = await scratchRepo()
  const sdk = fakeSdk(async t => (isWorker(t) ? await t.onCancel.then(() => ({ status: 'cancelled' as const })) : { status: 'finished' as const, result: 'ok' }))
  sdk.guard = copilotGuard
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-guard' })
  const denied = (v: SdkToolVerdict) => (v && 'deny' in v ? v.deny : '')
  try {
    await s.command('symcc-init')
    await s.tool('add', { title: 'Say hello', details: 'Write hello.txt', files: ['hello.txt'], why: 'a test', origin_by: 'owner', request: 'Say hello' })
    await until(() => sdk.agents.some(a => 'ask_owner' in a.tools), 60_000, 'the worker')
    const worker = sdk.agents.find(a => 'ask_owner' in a.tools)!
    const guard = worker.options.guard!
    expect(await guard({ toolName: 'create', toolArgs: { path: 'hello.txt', file_text: 'hi' } })).toBe(undefined)
    expect(denied(await guard({ toolName: 'create', toolArgs: { path: 'notes.txt', file_text: 'hi' } }))).toContain("notes.txt is outside this task's files; it's recorded as a request to the owner")
    expect(denied(await guard({ toolName: 'edit', toolArgs: { path: `${repo}/check.sh`, old_str: 'test', new_str: 'true' } }))).toContain("check.sh is in the owner's copy of the project, outside your own folder")
    expect(denied(await guard({ toolName: 'bash', toolArgs: { command: `echo true > ${repo}/check.sh` } }))).toContain('outside your own folder')
    expect(denied(await guard({ toolName: 'some_mcp_tool', toolArgs: {} }))).toContain('some_mcp_tool is not one')
    expect(await guard({ toolName: 'ask_owner', toolArgs: { question: 'which greeting?' } })).toBe(undefined)
    const shell = await guard({ toolName: 'bash', toolArgs: { command: 'cat hello.txt' } })
    expect(shell && 'args' in shell ? (shell.args as { command: string }).command : '').toContain(`cd -- '${worker.options.cwd}'`)

    await s.message('hello')
    await until(() => sdk.agents.some(a => 'add' in a.tools), 20_000, 'the lead')
    const lead = sdk.agents.find(a => 'add' in a.tools)!
    expect(await lead.options.guard!({ toolName: 'create', toolArgs: { path: `${repo}/notes.txt`, file_text: 'hi' } })).toBe(undefined)
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test("Run now from the panel: a task that waits asks first and starts once told anyway; the owner's board actions go with their next message to the lead", async () => {
  const repo = await scratchRepo()
  const sdk = fakeSdk(async t => {
    if (isWorker(t)) return await t.onCancel.then(() => ({ status: 'cancelled' }))
    return { status: 'finished', result: 'ok' }
  })
  const s = await openCursorSession({ root: repo, sdk, pluginRoot: PLUGIN_ROOT, sessionId: 'cursor-run-now' })
  const leadTurns = () => sdk.agents.flatMap(a => a.turns).filter(isLead)
  const status = async (id: string) => (await board(repo)).tasks.find(t => t.id === id)?.status
  const add = (title: string, more: Record<string, unknown> = {}) => s.tool('add', { title, details: title, files: [`${title}.txt`], why: 'a test', origin_by: 'owner', request: title, ...more })
  try {
    await s.command('symcc-init')
    await s.mode('paused')
    await add('first')
    await add('second', { after: ['T-1'] })
    await add('third')

    await s.act('T-3', 'drop', 'not needed')
    await s.lead.idle()
    await s.message('anything new?')
    await until(() => leadTurns().some(t => t.text.endsWith('anything new?')), 20_000, "the owner's message")
    const turn = leadTurns().find(t => t.text.endsWith('anything new?'))!
    expect(turn.text).toContain('Meanwhile the owner (nothing to answer):')
    expect(turn.text).toContain('T-3')
    await s.lead.idle()
    await s.message('and now?')
    await until(() => leadTurns().some(t => t.text.endsWith('and now?')), 20_000, 'the next message')
    expect(leadTurns().find(t => t.text.endsWith('and now?'))!.text).not.toContain('Meanwhile')

    await until(() => !!s.view().tasks.find(t => t.id === 'T-2')?.actions.some(a => a.id === 'run-now'), 10_000, 'Run now on T-2')
    expect(await s.act('T-2', 'run-now')).toMatch(/T-2 waits on T-1 \([^)]+\)\. Start anyway\?/)
    expect(await status('T-2')).toBe('todo')
    await s.act('T-2', 'run-now', 'anyway')
    await until(async () => (await status('T-2')) === 'doing', 60_000, 'T-2 running')
    await until(() => sdk.agents.some(a => 'ask_owner' in a.tools), 60_000, 'the worker')
    expect(await status('T-1')).toBe('todo')
  } finally {
    await s.close()
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)
