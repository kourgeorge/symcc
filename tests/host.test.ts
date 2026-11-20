// The Host type (hooks/host.ts, T-240): the plugin's logic asks for a Host, not for Claude Code's `$`.
// Claude Code's real `$` with the adapter's parts added (claude/host.ts) must fit a Host (checked by the type check, below), and a Host written by hand,
// as another program (an OpenCode plugin, a standalone app) would build one, must be enough to run the logic.
import { expect } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { type Host, type HostProcess, type HostRunResult, type PanelValues, ALL_FEATURES, SYMCC_WORDS, noUi, notReadyYet } from '../hooks/host'
import { S, type PaneView } from '../hooks/app/state'
import { findRoot, load, saveBoard, takeLock, dropLock, change } from '../hooks/app/store'
import { tellLead } from '../hooks/app/tell'
import { addTask, emptyBoard, type Board, lockText, parseLock, lockHolder, isLockStale, LOCK_STALE_MS } from '../hooks/board'
import { test } from './reset'
import { claudeHost } from '../hooks/claude/host'

// Fails the type check (scripts/typecheck.sh) if Claude Code's `$`, with the adapter's agents added, stops fitting a Host.
const fromClaude = (claude: EngineInterface): Host => claudeHost(claude)

/**
 * A Host over files kept in memory, written out in full with no casts: what a second adapter has to give. `ui` is
 * noUi (no screen at all) unless given; `later` runs a timer's function at once (else timers never fire). What the
 * lead was sent is kept in `sent`.
 */
function memoryHost(root: string, ui: Host['ui'] = noUi, later = false) {
  const files = new Map<string, string>()
  const ran: string[] = []
  const sent: string[] = []
  const done = (r: Partial<HostRunResult> = {}): HostRunResult => ({ exitCode: 0, stdout: '', stderr: '', ...r })
  const timer = { cancel: () => undefined }
  const host: Host = {
    features: ALL_FEATURES,
    plugin: { name: 'symcc', root: '/plugin' },
    session: {
      id: async () => 'session-1',
      repo: async () => ({ root }),
      root: async () => root,
      usage: async () => ({}),
    },
    lead: { send: async text => void sent.push(text), usage: async () => ({}) },
    agents: { spawn: async () => ({ agentId: 'agent-1' }), list: async () => [], send: async () => undefined, stop: async () => undefined },
    words: SYMCC_WORDS,
    env: async () => undefined,
    fs: {
      read: async p => {
        const text = files.get(p)
        if (text === undefined) throw new Error(`no file ${p}`)
        return text
      },
      write: async (p, text) => void files.set(p, text),
      exists: async p => files.has(p),
      list: async () => [],
      stat: async p => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return { kind: 'file', size: files.get(p)!.length, mtimeMs: 0, isLink: false }
      },
    },
    run: async argv => {
      ran.push(argv[0]!)
      const [cmd, ...rest] = argv
      const args = rest.filter(a => !a.startsWith('-'))
      if (cmd === 'mv' || cmd === 'ln') {
        const [from, to] = args as [string, string]
        if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
        if (cmd === 'ln' && files.has(to)) return done({ exitCode: 1, stderr: 'File exists' })
        files.set(to, files.get(from)!)
        if (cmd === 'mv') files.delete(from)
        return done()
      }
      if (cmd === 'rm') {
        for (const a of args) files.delete(a)
        return done()
      }
      return done({ exitCode: 127, stderr: `${cmd}: not in this fake` })
    },
    clock: { after: (_ms, fn) => (later && fn(), timer), every: () => timer, sleep: async () => undefined },
    ui,
  }
  return { host, files, ran, sent }
}

test("Claude Code's $ fits a Host once the adapter adds the agents (the type check proves it; nothing to run)", () => {
  expect(typeof fromClaude).toBe('function')
})

test('a Host written by hand runs the board store: find the project, take the lock, save and load the board', async () => {
  const { host, files, ran } = memoryHost('/proj')
  expect(await findRoot(host)).toBe(true)
  expect(S.root).toBe('/proj')

  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', files: ['src/'] }, '2026-11-18T00:00:00Z')
  await saveBoard(host, b)
  expect(files.has(`/proj/${S.N.boardFile}`)).toBe(true)
  expect((await load(host)).tasks.map(t => t.title)).toEqual(['Do it'])

  // the lock is taken with ln (a second take would wait) and let go with rm; no temp file is left behind
  const mine = await takeLock(host)
  expect(files.get(`/proj/${S.N.lockFile}`)).toBe(mine)
  await saveBoard(host, { ...b, max_parallel: 3 })
  await dropLock(host, mine)
  expect((await load(host)).max_parallel).toBe(3)
  expect(ran).toEqual(['git', 'mv', 'ln', 'rm', 'mv', 'rm'])
  expect([...files.keys()]).toEqual([`/proj/${S.N.boardFile}`])
})

test('T-659: the board lock names its holder process; a lock whose process is gone is taken at once, a live one is waited for, one with no pid keeps the 30 s rule', async () => {
  const { host, files } = memoryHost('/proj')
  expect(await findRoot(host)).toBe(true)
  const lock = `/proj/${S.N.lockFile}`
  const asked: HostProcess[] = []
  let answer: boolean | undefined = false
  host.processes = { self: () => ({ pid: 4242, started: 1_000 }), alive: async p => (asked.push(p), answer) }
  // a sleep means "it waits for the lock": the test stops it there
  host.clock.sleep = async () => Promise.reject(new Error('waited'))

  // ours names this process
  const mine = await takeLock(host)
  expect(parseLock(mine)).toMatchObject({ pid: 4242, started: 1_000 })
  await dropLock(host, mine)

  // a fresh lock whose holder is gone: taken over at once, with no wait
  files.set(lock, lockText('other:1', Date.now(), { pid: 777, started: 5_000 }))
  const taken = await takeLock(host)
  expect(asked).toEqual([{ pid: 777, started: 5_000 }])
  expect(files.get(lock)).toBe(taken)
  await dropLock(host, taken)

  // a fresh lock whose holder runs: respected (it waits)
  answer = true
  files.set(lock, lockText('other:2', Date.now(), { pid: 778, started: 5_000 }))
  expect(await takeLock(host).catch((e: Error) => e.message)).toBe('waited')
  // the host can't tell: the lock's age decides, and it is fresh
  answer = undefined
  expect(await takeLock(host).catch((e: Error) => e.message)).toBe('waited')
  // a live holder still can't keep a lock older than LOCK_STALE_MS
  answer = true
  files.set(lock, lockText('other:3', Date.now() - LOCK_STALE_MS - 1_000, { pid: 779, started: 5_000 }))
  await dropLock(host, await takeLock(host))

  // a fresh lock with no pid (an older copy, or a host that can't see processes): the 30 s rule, the host isn't asked
  asked.length = 0
  answer = false
  files.set(lock, lockText('other:4', Date.now()))
  expect(await takeLock(host).catch((e: Error) => e.message)).toBe('waited')
  expect(asked).toEqual([])
  files.set(lock, lockText('other:5', Date.now() - LOCK_STALE_MS - 1_000))
  await dropLock(host, await takeLock(host))
  expect(files.has(lock)).toBe(false)
})

test('T-659: the lock text keeps a holder pid and start time; a pid that is not a whole positive number is left out', () => {
  expect(parseLock(lockText('s', 10, { pid: 5, started: 3 }))).toEqual({ session: 's', at: 10, pid: 5, started: 3 })
  expect(lockHolder(lockText('s', 10, { pid: 5, started: 3 }))).toEqual({ pid: 5, started: 3 })
  expect(parseLock(lockText('s', 10))).toEqual({ session: 's', at: 10 })
  expect(lockHolder(lockText('s', 10))).toBe(undefined)
  for (const bad of ['{"session":"s","at":10,"pid":0,"started":3}', '{"session":"s","at":10,"pid":1.5,"started":3}', '{"session":"s","at":10,"pid":5}']) expect(lockHolder(bad)).toBe(undefined)
  // a holder known gone makes even a fresh lock stale; known alive or unknown keeps the time rule
  expect(isLockStale(lockText('s', 10), 10, undefined, LOCK_STALE_MS, false)).toBe(true)
  expect(isLockStale(lockText('s', 10), 10, undefined, LOCK_STALE_MS, true)).toBe(false)
  expect(isLockStale(lockText('s', 10), 10 + LOCK_STALE_MS + 1, undefined, LOCK_STALE_MS, true)).toBe(true)
})

const addOne = (b: Board) => addTask(b, { origin: { why: 'a test' }, title: 'Do it', files: ['src/'] }, '2026-11-18T00:00:00Z')[0]

test('change() runs on a Host with no screen at all (noUi): the board is saved, and publishing it goes nowhere', async () => {
  const { host } = memoryHost('/proj')
  expect(await findRoot(host)).toBe(true)
  await change(host, addOne)
  expect((await load(host)).tasks.map(t => t.title)).toEqual(['Do it'])
})

test("change() publishes the board to a hand-written host's panel and status line, settings included", async () => {
  let view = { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] } as PaneView
  const status: (string | undefined)[] = []
  const keep = () => {
    let value = ''
    return { read: async () => value, update: async (f: (v: string) => string) => void (value = f(value)) }
  }
  const [opened, tab, scout] = [keep(), keep(), keep()]
  const panel: PanelValues = {
    readOpened: opened.read,
    updateOpened: opened.update,
    readTab: tab.read,
    updateTab: tab.update,
    readScoutOpen: scout.read,
    updateScoutOpen: scout.update,
    readView: async () => view,
    updateView: async f => void (view = f(view)),
  }
  const { host } = memoryHost('/proj', { ...noUi, status: text => void status.push(text), panel })
  expect(await findRoot(host)).toBe(true)
  await saveBoard(host, { ...emptyBoard(), scout_findings: 'backlog', tests_with_changes: 'review', checker: true })
  await change(host, addOne)
  expect(view.tasks.map(t => t.title)).toEqual(['Do it'])
  // the Settings view draws these from the published view, as it does the other settings
  expect([view.scout_findings, view.tests_with_changes, view.checker]).toEqual(['backlog', 'review', true])
  expect(status.length).toBeGreaterThan(0)
})

test('tellLead gives the board update to host.lead.send', async () => {
  const { host, sent } = memoryHost('/proj', noUi, true)
  tellLead(host, 'T-1 is done')
  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain(`[${S.N.name}] Board update:`)
  expect(sent[0]).toContain('T-1 is done')
})

test("Claude Code's adapter: host.lead.send submits a prompt, ui.refresh redraws on 'ui.render', and ui.panel is there", async () => {
  const prompts: unknown[] = []
  const redraws: unknown[] = []
  const claude = { prompt: { submit: async (input: unknown) => void prompts.push(input) }, ui: { invalidate: (event: unknown) => void redraws.push(event) } }
  const host = claudeHost(claude as unknown as EngineInterface)
  await host.lead.send('hello lead')
  host.ui.refresh()
  expect(prompts).toEqual([{ text: 'hello lead' }])
  expect(redraws).toEqual(['ui.render'])
  expect(typeof host.ui.panel?.readView).toBe('function')
})

/** Claude Code's `$`, only the agent parts claudeHost's `agents` use: what it was asked to spawn and send, and what spawn and list answer. */
function claudeAgentsWorld(answer: (input: Record<string, unknown>) => Promise<{ agentId?: string; deny?: string }> = async () => ({ agentId: 'ag1' })) {
  const spawns: Record<string, unknown>[] = []
  const sends: { to: { agentId: string }; text: string }[] = []
  let listed: { id: string; type: string; status: string; description: string }[] = []
  const claude = {
    agent: { spawn: async (input: Record<string, unknown>) => (spawns.push(input), answer(input)), list: async () => listed },
    session: { send: async (m: { to: { agentId: string }; text: string }) => void sends.push(m) },
  }
  return { host: claudeHost(claude as unknown as EngineInterface), spawns, sends, list: (l: typeof listed) => void (listed = l) }
}

test("host.agents.spawn starts a Claude Code subagent of the agent type that fits: a worker's by its role's tools, scouts and checkers as scouts", async () => {
  const w = claudeAgentsWorld()
  expect(await w.host.agents.spawn({ kind: 'worker', prompt: 'p', name: 'symcc-T-1', description: 'Do it', cwd: '/wt/T-1' })).toEqual({ agentId: 'ag1' })
  await w.host.agents.spawn({ kind: 'worker', prompt: 'p', name: 'symcc-T-2', description: 'Look', tools: ['web'], cwd: '/wt/T-2', model: 'sonnet' })
  await w.host.agents.spawn({ kind: 'scout', prompt: 'p', name: 'symcc-scout-bugs', description: 'Look for bugs' })
  await w.host.agents.spawn({ kind: 'checker', prompt: 'p', name: 'symcc-check-T-1', description: 'symcc checker for T-1', cwd: '/wt/T-1' })
  expect(w.spawns).toEqual([
    { prompt: 'p', name: 'symcc-T-1', description: 'Do it', subagentType: 'symcc:worker', cwd: '/wt/T-1' },
    { prompt: 'p', name: 'symcc-T-2', description: 'Look', subagentType: 'symcc:worker-web', cwd: '/wt/T-2', model: 'sonnet' },
    { prompt: 'p', name: 'symcc-scout-bugs', description: 'Look for bugs', subagentType: 'symcc:scout' },
    { prompt: 'p', name: 'symcc-check-T-1', description: 'symcc checker for T-1', subagentType: 'symcc:scout', cwd: '/wt/T-1' },
  ])
})

test("a refused or failed start rejects; only Claude Code's \"agent type not found\" for symcc's own type is marked not ready", async () => {
  const fails = (why: string, how: 'deny' | 'throw') => claudeAgentsWorld(async () => (how === 'deny' ? { deny: why } : Promise.reject(new Error(why)))).host.agents
  const caught = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ message: e.message, notReady: notReadyYet(e) }))
  const worker = { kind: 'worker', prompt: 'p', name: 'symcc-T-1', description: 'Do it' } as const
  const scout = { kind: 'scout', prompt: 'p', name: 'symcc-scout-bugs', description: 'Look' } as const
  expect(await caught(fails("Agent type 'symcc:worker' not found", 'throw').spawn(worker))).toEqual({ message: "Agent type 'symcc:worker' not found", notReady: true })
  expect(await caught(fails("Agent type 'symcc:worker' not found", 'deny').spawn(worker))).toEqual({ message: "Agent type 'symcc:worker' not found", notReady: true })
  expect(await caught(fails('no agents allowed here', 'deny').spawn(worker))).toEqual({ message: 'no agents allowed here', notReady: false })
  expect(await caught(fails("Agent type 'symcc:scout' not found", 'throw').spawn(scout))).toEqual({ message: "Agent type 'symcc:scout' not found", notReady: true })
  expect(await caught(fails("Agent type 'symcc:scout' not found", 'throw').spawn(worker))).toEqual({ message: "Agent type 'symcc:scout' not found", notReady: false })
  // no id and no refusal: it answers no id, and the caller says it didn't start
  expect(await claudeAgentsWorld(async () => ({})).host.agents.spawn(worker)).toEqual({})
})

test("host.agents lists every worker type as a 'worker' and the scout type as a 'scout', and send and stop are messages to the agent", async () => {
  const w = claudeAgentsWorld()
  w.list([
    { id: 'a1', type: 'symcc:worker-web', status: 'running', description: 'T-1' },
    { id: 'a2', type: 'symcc:worker', status: 'completed', description: 'T-2' },
    { id: 'a3', type: 'symcc:scout', status: 'waiting', description: 'bugs' },
    { id: 'a4', type: 'general-purpose', status: 'running', description: 'other' },
  ])
  expect((await w.host.agents.list()).map(a => [a.id, a.kind, a.status])).toEqual([
    ['a1', 'worker', 'running'],
    ['a2', 'worker', 'completed'],
    ['a3', 'scout', 'waiting'],
    ['a4', 'other', 'running'],
  ])
  await w.host.agents.send('a1', 'wrap up')
  await w.host.agents.stop('a1', 'Stop now')
  expect(w.sends).toEqual([
    { to: { agentId: 'a1' }, text: 'wrap up' },
    { to: { agentId: 'a1' }, text: 'Stop now' },
  ])
})

test("Claude Code's adapter maps symcc's words to its `$`: run is $.process.run, env is $.env.get, and tools are mcp__<name>__<tool>", async () => {
  const runs: unknown[] = []
  const envs: string[] = []
  const claude = {
    process: { run: async (argv: readonly string[], init?: unknown) => (runs.push([argv, init]), { exitCode: 0, stdout: 'ok', stderr: '' }) },
    env: { get: async (name: string) => (envs.push(name), name === 'HOME' ? '/h' : undefined) },
  }
  const host = claudeHost(claude as unknown as EngineInterface)
  expect(await host.run(['git', 'status'], { cwd: '/p' })).toEqual({ exitCode: 0, stdout: 'ok', stderr: '' })
  expect(runs).toEqual([[['git', 'status'], { cwd: '/p' }]])
  expect(await host.env('HOME')).toBe('/h')
  // a name symcc doesn't read is never asked for
  expect(await host.env('PATH')).toBe(undefined)
  expect(envs).toEqual(['HOME'])
  expect(host.words.tool('symcc', 'board')).toBe('mcp__symcc__board')
})

test("Claude Code's adapter: host.lead.usage reads the lead's calls from Claude Code's session logs through the same host", async () => {
  const listed: string[] = []
  const claude = {
    env: { get: async (name: string) => (name === 'HOME' ? '/h' : undefined) },
    fs: { list: async (d: string) => (listed.push(d), []) },
  }
  const host = claudeHost(claude as unknown as EngineInterface)
  expect(await host.lead.usage('/p/app', { kind: 'all' }, 0)).toEqual({ lead: [], leadSessions: 0, leadFrom: "Claude Code's session logs" })
  expect(listed).toEqual(['/h/.claude/projects/-p-app'])
})
