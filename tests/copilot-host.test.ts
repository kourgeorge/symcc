// T-957: symcc's GitHub Copilot CLI host (hooks/copilot/), run on a fake joinSession and a fake session (no Copilot at
// all), with files in memory and a fake git, as the shared fake Host does: the extension joins with symcc's lead tools
// (named "symcc_<tool>", skipPermission) and its /symcc commands, a tool call reaches symcc's toolCall and answers its
// text, Copilot's own sub-agents are refused the lead's tools, /symcc writes the text board to the timeline
// (session.log), each prompt gets the lead's guide, and a board update wakes the lead with session.send (enqueue, and
// immediate when urgent). With no SDK given for the agents, a start is "not ready" (the agents: copilot-agents.test.ts).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { memoryFs, done } from './fake-host'
import { addTask, emptyBoard, boardText, shortHome, type Board } from '../hooks/board'
import { S, heard, toolName } from '../hooks/app/state'
import { TOOLS } from '../hooks/app/tools'
import { COMMANDS, toolCall, leadGuideText, notLeadText } from '../hooks/app/symcc'
import { tellLead } from '../hooks/app/tell'
import { load } from '../hooks/app/store'
import { notReadyYet } from '../hooks/host'
import { startCopilot } from '../hooks/copilot/extension'
import { COPILOT_FEATURES, AGENTS_NOT_BUILT } from '../hooks/copilot/host'
import { leadSend, SYMCC_SOURCE, NOT_JOINED, copilotLead } from '../hooks/copilot/lead'
import type { CpJoinOptions, CpSend, CpSession, CpTool } from '../hooks/copilot/sdk'

const ROOT = '/repo'
const ISO = '2026-11-18T10:00:00.000Z'

/** A fake Copilot: joinSession keeps what the extension registers; the session records its sends and timeline lines. */
function fakeCopilot() {
  const joined: CpJoinOptions[] = []
  const sends: CpSend[] = []
  const logs: string[] = []
  const session: CpSession = {
    sessionId: 'cp-1',
    send: async m => (sends.push(m), `msg-${sends.length}`),
    log: async text => void logs.push(text),
  }
  const joinSession = async (o: CpJoinOptions) => (joined.push(o), session)
  return { joined, sends, logs, session, joinSession }
}

/** The program parts: files in memory, a git that says /repo is a repository, `mv` and `rm` on the files, timers kept. */
function fakeSystem(files: Map<string, string>) {
  const timers: { ms: number; fn: () => void }[] = []
  const timer = { cancel: () => undefined }
  return {
    timers,
    system: {
      fs: memoryFs(files),
      env: async () => undefined,
      run: async (argv: readonly string[]) => {
        const [cmd, ...rest] = argv
        if (cmd === 'git' && rest[0] === 'rev-parse') return done({ stdout: rest.includes('--show-toplevel') ? `${ROOT}\n` : rest.includes('--show-cdup') ? '\n' : rest.includes('HEAD') ? 'abc\n' : 'true\n' })
        const args = rest.filter(a => !a.startsWith('-'))
        if (cmd === 'mv') {
          const [from, to] = args as [string, string]
          if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
          files.set(to, files.get(from)!)
          files.delete(from)
        }
        if (cmd === 'rm') for (const a of args) files.delete(a)
        return done()
      },
      clock: {
        after: (ms: number, fn: () => void) => (timers.push({ ms, fn }), timer),
        every: () => timer,
        sleep: async () => undefined,
      },
    },
  }
}

/** A project with a board (one task, paused so nothing starts), the extension started on it. */
async function started() {
  const files = new Map<string, string>()
  files.set(`${ROOT}/.git`, '')
  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Add search', details: 'Done when: a test shows it.', files: ['src/'] }, ISO)
  const board: Board = { ...b, mode: 'paused' }
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify(board, null, 2) + '\n')
  const cp = fakeCopilot()
  const sys = fakeSystem(files)
  const run = await startCopilot({ joinSession: cp.joinSession, dir: ROOT, system: sys.system, pluginRoot: '/plugin' })
  const opts = cp.joined[0]!
  const tool = (name: string) => opts.tools!.definitions!.find(t => t.name === name) as CpTool
  const command = (name: string) => opts.commands!.find(c => c.name === name)!
  /** fires the board update's timer (tellLead sends after 1.5 s) */
  const fireLeadTimer = () => {
    for (const t of sys.timers.splice(0)) if (t.ms === 1500) t.fn()
  }
  return { ...cp, ...sys, files, run, opts, tool, command, fireLeadTimer }
}

test('the Copilot extension joins with every lead tool (symcc_<name>, its schema, skipPermission) and every /symcc command, and starts the engine', async () => {
  const w = await started()
  expect(w.joined.length).toBe(1)
  const defs = w.opts.tools!.definitions!
  expect(defs.map(t => t.name)).toEqual(TOOLS().map(t => `symcc_${t.name}`))
  for (const t of TOOLS()) {
    const d = w.tool(`symcc_${t.name}`)
    expect(d.description).toBe(t.description)
    expect(d.parameters).toEqual({ ...t.inputSchema })
    expect(d.skipPermission).toBe(true)
  }
  // no workers yet, so no ask_owner
  expect(defs.some(t => t.name === 'symcc_ask_owner')).toBe(false)
  // every one of COMMANDS, plus /symcc-board (symcc's texts point at it) right after /symcc-status
  const names = COMMANDS(COPILOT_FEATURES).map(c => c.name)
  names.splice(names.indexOf('symcc-status') + 1, 0, 'symcc-board')
  expect(w.opts.commands!.map(c => c.name)).toEqual(names)
  expect(w.opts.commands!.map(c => c.name)).toContain('symcc')
  // no command's description sends the owner to a panel Copilot doesn't have
  expect((w.command('symcc').description ?? '').includes('panel')).toBe(false)
  expect(typeof w.opts.hooks?.handlers?.onUserPromptSubmitted).toBe('function')
  expect(w.run.host.features).toEqual(COPILOT_FEATURES)
  expect(await w.run.host.session.id()).toBe('copilot-cp-1')
  expect(S.startupDone).toBe(true)
  expect(S.root).toBe(ROOT)
  await w.run.end()
})

test('a Copilot tool call reaches symcc\'s toolCall and answers its text; add changes the board; a Copilot sub-agent is refused the lead\'s tools', async () => {
  const w = await started()
  const inv = (agentId?: string) => ({ sessionId: 'cp-1', toolCallId: 'c1', toolName: 'x', arguments: {}, ...(agentId ? { agentId } : {}) })
  const r = await w.tool('symcc_board').handler({ task: 'T-1' }, inv())
  expect(r).toBe(((await toolCall(w.run.host, toolName('board'), undefined, { task: 'T-1' })) as { result: string }).result)
  expect(String(r)).toContain('Add search')
  const added = await w.tool('symcc_add').handler({ title: 'From Copilot', details: 'Done when: a test shows it.', why: 'a test', origin_by: 'owner' }, inv())
  expect(String(added)).toContain('T-2')
  expect((await load(w.run.host)).tasks.map(t => t.title)).toContain('From Copilot')
  // one of Copilot's own sub-agents (the built-in task tool) is not the lead
  expect(await w.tool('symcc_board').handler({}, inv('task-agent-1'))).toEqual({ textResultForLlm: notLeadText('board'), resultType: 'failure', error: notLeadText('board') })
  await w.run.end()
})

test('/symcc writes the text board to the Copilot timeline (session.log) and sends nothing to the lead', async () => {
  const w = await started()
  await w.command('symcc').handler({ sessionId: 'cp-1', command: '/symcc', commandName: 'symcc', args: '' })
  const text = w.logs.at(-1)!
  expect(text).toContain('T-1')
  expect(text).toContain('Add search')
  expect(text).toBe(boardText(await load(w.run.host), Date.now(), shortHome(S.root, S.home), S.N.name, undefined, {}, S.version))
  expect(w.sends.length).toBe(0)
  // /symcc-tasks points at /symcc-board, and Copilot has it: it shows the same text board
  await w.command('symcc-tasks').handler({ sessionId: 'cp-1', command: '/symcc-tasks', commandName: 'symcc-tasks', args: '' })
  expect(w.logs.at(-1)!.includes('/symcc-board')).toBe(true)
  expect(w.opts.commands!.some(c => c.name === 'symcc-board')).toBe(true)
  await w.command('symcc-board').handler({ sessionId: 'cp-1', command: '/symcc-board', commandName: 'symcc-board', args: '' })
  expect(w.logs.at(-1)!).toBe(text)
  // a task's command takes its args
  await w.command('symcc-task').handler({ sessionId: 'cp-1', command: '/symcc-task T-1', commandName: 'symcc-task', args: ' T-1 ' })
  expect(w.logs.at(-1)!).toContain('Add search')
  await w.run.end()
})

test('each prompt gets the lead\'s guide as additionalContext; the owner\'s prompt is heard, symcc\'s own send is not', async () => {
  const w = await started()
  const hook = w.opts.hooks!.handlers!.onUserPromptSubmitted!
  const out = await hook({ prompt: 'please add a task', sessionId: 'cp-1', workingDirectory: ROOT }, { sessionId: 'cp-1' })
  const guide = await leadGuideText(w.run.host)
  expect(typeof guide).toBe('string')
  expect(guide!.length).toBeGreaterThan(100)
  expect(out).toEqual({ additionalContext: guide! })
  expect(heard.owner?.text).toBe('please add a task')
  // a board update symcc sent comes back through the same hook: it is not the owner's typing
  await w.run.host.lead.send('[symcc] Board update: T-1 merged')
  await hook({ prompt: '[symcc] Board update: T-1 merged', sessionId: 'cp-1', workingDirectory: ROOT }, { sessionId: 'cp-1' })
  expect(heard.owner?.text).toBe('please add a task')
  await w.run.end()
})

test('a board update wakes the Copilot lead with session.send: enqueue, and immediate when urgent', async () => {
  const w = await started()
  w.sends.length = 0
  tellLead(w.run.host, 'T-1 merged')
  w.fireLeadTimer()
  await Promise.resolve()
  expect(w.sends.length).toBe(1)
  expect(w.sends[0]!.mode).toBe('enqueue')
  expect(w.sends[0]!.source).toBe(SYMCC_SOURCE)
  expect(w.sends[0]!.prompt).toContain('T-1 merged')
  tellLead(w.run.host, 'T-1 needs you', { urgent: true })
  w.fireLeadTimer()
  await Promise.resolve()
  expect(w.sends.length).toBe(2)
  expect(w.sends[1]!.mode).toBe('immediate')
  expect(w.sends[1]!.prompt).toContain('T-1 needs you')
  await w.run.end()
})

test('Copilot lead and agents before they are built: a send before the join is refused, an agent start is "not ready"', async () => {
  expect(leadSend('x')).toEqual({ prompt: 'x', mode: 'enqueue', source: 'automation-symcc' })
  expect(leadSend('x', { urgent: true })).toEqual({ prompt: 'x', mode: 'immediate', source: 'automation-symcc' })
  const err = await copilotLead(() => undefined).send('x').then(() => '', (e: Error) => e.message)
  expect(err).toBe(NOT_JOINED)
  const w = await started()
  const start = await w.run.host.agents.spawn({ kind: 'worker', prompt: 'p', name: 'n', description: 'd' }).then(() => undefined, (e: unknown) => e)
  expect(notReadyYet(start)).toBe(true)
  expect((start as Error).message).toBe(AGENTS_NOT_BUILT)
  await w.run.end()
})
