// symcc's OpenCode plugin (T-462), run with bun test (scripts/test-opencode-host.sh), not `claude plugin test`: that
// runtime has no files or processes. A fake OpenCode ctx (only the hooks symcc registers) on a scratch git repo with a
// worker's worktree and a board: one copy per folder runs the engine (the main folder's), a second copy for the same
// real folder and a worktree's copy only guard; a worker's edit outside its files is refused through
// permission.evaluate (and the tool backstop), an allowed one passes, a shell write into the owner's copy is refused,
// and a stopped agent is refused anything; the tool backstop reads OpenCode 2.3's real tool inputs (and a multiedit).
// The agents (T-463) on a fake session API (fakeSessions): create as the lead's child -> move, waited for -> prompt once
// recorded -> end with tokens and the final text, an interrupt, the model per role, and a worker the main copy starts
// from the board through to agentFinished. The lead (T-464): a finished task's board update reaches the owner's session
// with delivery "queue", a "needs you" one with "steer", an update sent before the lead is known waits for it, starting
// a worker sends the lead nothing, and OpenCode's own "subagent completed" message doesn't double symcc's update; the
// lead's tokens come from session.get. Also: hooks/opencode/ never imports Claude Code or hooks/claude/.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { addTask, emptyBoard, patchTask, blockedEditText } from '../../board'
import { S, startS, timers, workers, stopped, boardAgents, starting, queuedWorkers, scoutRuns, checkerRuns } from '../../app/state'
import { resetStore } from '../../app/store'
import { stoppedText } from '../../app/ask'
import { runCommand } from '../../../hosts/node/host'
import type { OcContext, OcPermissionEvaluation, OcToolBefore, OcSessionApi, OcSessionInfo, OcSessionMessage, OcSessionPrompt } from '../ctx'
import { opencodeAgents, opencodeModel, sessionEnd, DEFAULT_MODELS, AGENT_PERMISSIONS } from '../agents'
import { toolTouches } from '../guard'
import { pump } from '../../app/workers'
import { load } from '../../app/store'
import { symccServer, owners, leads, SYMCC_ENGINE, type CopyRole, type Engine } from '../plugin'
import { opencodeLead, leadText, SUBAGENT_LABEL, OPENCODE_LEAD_FROM, NO_LEAD_YET, LEAD_WHOLE_SESSION_ONLY } from '../lead'
import { leadTotals, rangeSpan, teamLines } from '../../core/stats'
import { tellLead, noteForLead } from '../../app/tell'
import { PLUGIN_ROOT, opencodeHost } from '../host'
import type { Host } from '../../host'

/** Puts symcc's memory back to its start values, as a fresh copy of the plugin has (bun shares one copy across tests). */
function reset() {
  for (const t of [...timers, S.watchdog, S.leadTimer, S.beat, S.sayTimer]) t?.cancel()
  timers.length = 0
  for (const k of Object.keys(S)) delete (S as Record<string, unknown>)[k]
  Object.assign(S, startS())
  resetStore()
  for (const m of [workers, scoutRuns, checkerRuns, queuedWorkers]) m.clear()
  for (const s of [stopped, boardAgents, starting]) s.clear()
  owners().clear()
  leads().clear()
}

/** One session of the fake session API. */
type FakeSession = { info: OcSessionInfo; moveTo?: string; looksLeft: number; ended?: () => void; messages: OcSessionMessage[] }

/**
 * A fake of OpenCode's session API (ctx.session), as OpenCode 2.3 behaved in a real run (T-463): a session made with
 * a parentID is put in its parent's folder whatever `location` says; a move lands only after `moveLag` more
 * session.get calls; session.wait settles once the test ends the session (`end`) or it is interrupted. `calls` lists
 * what was asked, in order.
 */
function fakeSessions(moveLag = 2) {
  const sessions = new Map<string, FakeSession>()
  const calls: string[] = []
  /** every session.prompt, with its text */
  const prompts: { sessionID: string; text: string; delivery?: string }[] = []
  /** the "subagent completed" messages children posted into their parents ("child -> parent") */
  const subagent: string[] = []
  /** told when a child posts OpenCode's own "subagent completed" message into its parent */
  const hooks: { onSubagent?: (parentID: string) => void } = {}
  let n = 0
  const one = (id: string) => {
    const s = sessions.get(id)
    if (!s) throw new Error(`no session ${id}`)
    return s
  }
  const api: OcSessionApi = {
    async create(input) {
      const id = `ses_${++n}`
      const parent = input.parentID ? sessions.get(input.parentID) : undefined
      const dir = parent?.info.location.directory ?? input.location?.directory ?? '/nowhere'
      calls.push(`create ${id}${input.parentID ? ` parent ${input.parentID}` : ''} model ${input.model?.providerID}/${input.model?.id}`)
      const info: OcSessionInfo = { id, ...(input.parentID ? { parentID: input.parentID } : {}), location: { directory: dir } }
      sessions.set(id, { info, looksLeft: 0, messages: [] })
      return info
    },
    async get({ sessionID }) {
      const s = one(sessionID)
      if (s.moveTo !== undefined && s.looksLeft-- <= 0) {
        s.info = { ...s.info, location: { directory: s.moveTo } }
        s.moveTo = undefined
      }
      return s.info
    },
    async move({ sessionID, directory }) {
      calls.push(`move ${sessionID}`)
      Object.assign(one(sessionID), { moveTo: directory, looksLeft: moveLag })
    },
    async prompt({ sessionID, text, delivery }) {
      calls.push(`prompt ${sessionID} in ${one(sessionID).info.location.directory} (${delivery})`)
      prompts.push({ sessionID, text, delivery })
      one(sessionID).messages.push({ type: 'user', content: [{ type: 'text', text }] })
      return {}
    },
    wait: ({ sessionID }) => new Promise<void>(res => void (one(sessionID).ended = () => res())),
    async interrupt({ sessionID }) {
      calls.push(`interrupt ${sessionID}`)
      const s = one(sessionID)
      s.info = { ...s.info, outcome: 'interrupted', tokens: { input: 5, output: 7, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0 }
      s.ended?.()
      return { interrupted: true }
    },
    context: async ({ sessionID }) => one(sessionID).messages,
    async remove({ sessionID }) {
      calls.push(`remove ${sessionID}`)
      sessions.delete(sessionID)
    },
    hook: async () => ({ dispose: async () => undefined }),
  }
  /**
   * Session `id`'s run ends: it said `text`, with these tokens. A child also posts OpenCode's own "subagent completed"
   * message into its parent (as OpenCode 2.3 does), and hooks.onSubagent hears of it.
   */
  const end = (id: string, text: string, tokens = { input: 10, output: 484, reasoning: 330, cache: { read: 154787, write: 2261 } }) => {
    const s = one(id)
    s.messages.push({ type: 'assistant', content: [{ type: 'text', text }], finish: 'stop' })
    s.info = { ...s.info, outcome: 'succeeded', tokens, cost: 0 }
    s.ended?.()
    const parent = s.info.parentID ? sessions.get(s.info.parentID) : undefined
    if (parent) {
      parent.messages.push({ type: 'synthetic', content: [{ type: 'text', text: `subagent ${id} completed` }] })
      subagent.push(`${id} -> ${s.info.parentID}`)
      hooks.onSubagent?.(s.info.parentID!)
    }
  }
  /** A lead session in folder `dir` (as the owner's own chat). */
  const lead = (dir: string) => {
    const id = `ses_lead${++n}`
    sessions.set(id, { info: { id, location: { directory: dir } }, looksLeft: 0, messages: [] })
    return id
  }
  return { api, calls, prompts, subagent, end, lead, sessions, hooks }
}

/** A fake OpenCode ctx for folder `dir`: it keeps the hooks the plugin registers, and counts their disposals. */
function fakeCtx(dir: string, session: OcSessionApi = fakeSessions().api) {
  const hooks: { evaluate?: (e: OcPermissionEvaluation) => Promise<void> | void; before?: (e: OcToolBefore) => Promise<void> | void; prompt?: (e: OcSessionPrompt) => Promise<void> | void } = {}
  let disposed = 0
  const reg = { dispose: async () => void disposed++ }
  const ctx: OcContext = {
    location: { directory: dir },
    permission: { hook: async (_name, fn) => ((hooks.evaluate = fn), reg) },
    tool: { hook: async (_name, fn) => ((hooks.before = fn), reg) },
    session: { ...session, hook: async (_name, fn) => ((hooks.prompt = fn), reg) },
  }
  return { ctx, hooks, disposed: () => disposed }
}

/** Waits until `check` is true (looking every 20 ms, for at most `ms`). */
async function until(check: () => boolean | Promise<boolean>, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise<void>(r => setTimeout(() => r(), 20))) if (await check()) return
  throw new Error('timed out waiting')
}

/** Asks the copy's permission hook about `action` on `resources` for session `sessionID`; answers the check as it ended. */
async function evaluate(c: ReturnType<typeof fakeCtx>, sessionID: string, action: string, resources: string[]) {
  const e: OcPermissionEvaluation = { sessionID, action, resources, effect: 'allow' }
  await c.hooks.evaluate!(e)
  return e
}

async function git(cwd: string, ...args: string[]) {
  const r = await runCommand(['git', ...args], { cwd })
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}

/**
 * A scratch project: a git repo with README.md and src/, a worker's worktree for T-1 (files: src/, agent "ses_worker"),
 * and T-2 whose agent "ses_old" no longer runs it (stopped). `link`: the project's folder through /tmp when the
 * scratch folder is under /private/tmp (macOS), else the same path.
 */
async function project() {
  const base = await realpath(await mkdtemp('/tmp/symcc-oc-spec-'))
  const main = `${base}/proj`
  await mkdir(`${main}/src`, { recursive: true })
  await writeFile(`${main}/README.md`, 'hi\n')
  await writeFile(`${main}/src/a.ts`, 'export const a = 1\n')
  await writeFile(`${main}/.gitignore`, '.symcc/\n')
  await git(main, 'init', '-q', '-b', 'main')
  await git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A')
  await git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'start')
  const wt = `${main}/.symcc/worktrees/T-1`
  await mkdir(`${main}/.symcc/worktrees`, { recursive: true })
  await git(main, 'worktree', 'add', '-q', '-b', 'symcc/T-1', wt)
  const at = '2026-11-18T00:00:00.000Z'
  const [b1] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a change in src', files: ['src/'] }, at)
  const [b2] = addTask(patchTask(b1, 'T-1', { status: 'doing', agent: 'ses_worker', session: 'driver' }, at), { origin: { why: 'a test' }, title: 'an old one', files: ['src/'] }, at)
  const board = patchTask(b2, 'T-2', { status: 'todo', agent: 'ses_old' }, at)
  await writeFile(`${main}/.symcc/board.json`, JSON.stringify(board))
  const link = base.startsWith('/private/tmp/') ? main.slice('/private'.length) : main
  return { base, main, wt, link, done: () => rm(base, { recursive: true, force: true }) }
}

/** An engine that only records what each copy asked of it. */
function recordingEngine() {
  const calls: string[] = []
  const engine: Engine = {
    start: async host => void calls.push(`start ${await host.session.root()}`),
    guard: async (host, root) => void calls.push(`guard ${await host.session.root()} -> ${root}`),
    end: async host => void calls.push(`end ${await host.session.root()}`),
  }
  return { calls, engine }
}

test('one copy runs the engine: the main folder\'s first copy; a second copy for the same real folder and a worktree\'s copy only guard', async () => {
  reset()
  const p = await project()
  try {
    const { calls, engine } = recordingEngine()
    const roles: string[] = []
    const plugin = symccServer({ engine, onRole: (dir: string, role: CopyRole) => void roles.push(`${dir} ${role}`), hostOptions: { say: () => undefined } })
    expect(plugin.id).toBe('symcc')
    const a = fakeCtx(p.main)
    const endA = await plugin.setup(a.ctx)
    expect(calls).toEqual([`start ${p.main}`])
    // the same folder through a link (/tmp on macOS) is the same main folder: it waits, guarding
    const b = fakeCtx(p.link)
    const endB = await plugin.setup(b.ctx)
    const w = fakeCtx(p.wt)
    const endW = await plugin.setup(w.ctx)
    expect(calls).toEqual([`start ${p.main}`, `guard ${p.link} -> ${p.link === p.main ? p.main : p.link}`, `guard ${p.wt} -> ${p.main}`])
    expect(roles).toEqual([`${p.main} engine`, `${p.link} waiting`, `${p.wt} guard`])
    // every copy guards: both hooks are registered in each
    for (const c of [a, b, w]) expect(!!c.hooks.evaluate && !!c.hooks.before).toBe(true)
    // the engine copy is unloaded: its engine ends and the waiting copy takes over; nothing else starts one
    await endA!()
    expect(calls.slice(3)).toEqual([`end ${p.main}`, `start ${p.link}`])
    expect(a.disposed()).toBe(3)
    await endW!()
    await endB!()
    expect(calls.slice(5)).toEqual([`end ${p.link}`])
    expect(owners().size).toBe(0)
    // loaded again later (OpenCode unloaded the folder, or a file edit reloaded it): it starts cleanly
    const again = await plugin.setup(fakeCtx(p.main).ctx)
    expect(calls.slice(6)).toEqual([`start ${p.main}`])
    await again!()
  } finally {
    await p.done()
  }
})

test('a worktree\'s copy refuses a worker\'s edit outside its files through permission.evaluate, lets an allowed one pass, and refuses a shell write into the owner\'s copy', async () => {
  reset()
  const p = await project()
  try {
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined } })
    const w = fakeCtx(p.wt)
    const end = await plugin.setup(w.ctx)
    expect(S.guardOnly).toBe(true)
    expect(S.root).toBe(p.main)
    // outside the task's files (relative to the worktree, as OpenCode gives them): refused, with symcc's reason
    const out = await evaluate(w, 'ses_worker', 'edit', ['README.md'])
    expect(out.effect).toBe('deny')
    expect(out.message).toBe(blockedEditText('README.md'))
    // inside them: OpenCode decides as usual
    const ok = await evaluate(w, 'ses_worker', 'edit', ['src/b.ts'])
    expect(ok.effect).toBe('allow')
    expect(ok.message).toBe(undefined)
    // a shell command writing into the owner's copy, checked by its text
    const sh = await evaluate(w, 'ses_worker', 'shell', ['echo done', `echo x > ${p.main}/README.md`])
    expect(sh.effect).toBe('deny')
    expect(String(sh.message)).toMatch(/outside|owner/)
    // a plain command in its own folder passes
    expect((await evaluate(w, 'ses_worker', 'shell', ['ls src'])).effect).toBe('allow')
    // a session that is none of symcc's agents (the owner's own) is never refused
    expect((await evaluate(w, 'ses_owner', 'edit', ['README.md'])).effect).toBe('allow')
    // a stopped agent is refused anything, a read too
    const old = await evaluate(w, 'ses_old', 'read', ['src/a.ts'])
    expect(old.effect).toBe('deny')
    expect(old.message).toBe(stoppedText())
    // the tool backstop refuses the same edit by throwing
    let thrown = ''
    await Promise.resolve(w.hooks.before!({ tool: 'write', sessionID: 'ses_worker', agent: 'build', messageID: 'm1', id: 'c1', input: { filePath: 'README.md', content: 'x' } })).catch((e: Error) => (thrown = e.message))
    expect(thrown).toBe(blockedEditText('README.md'))
    await w.hooks.before!({ tool: 'edit', sessionID: 'ses_worker', agent: 'build', messageID: 'm1', id: 'c2', input: { filePath: 'src/a.ts', oldString: '1', newString: '2' } })
    // the guard copy never claimed the lead
    expect(await readFile(`${p.main}/.symcc/lead.json`, 'utf8').catch(() => 'none')).toBe('none')
    await end!()
  } finally {
    reset()
    await p.done()
  }
})

test('the main folder\'s copy runs symcc\'s engine: it claims lead.json and starts the timers; cleanup stops them', async () => {
  reset()
  const p = await project()
  try {
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined, sessionId: 'opencode-test' } })
    const end = await plugin.setup(fakeCtx(p.main).ctx)
    expect(S.guardOnly).toBe(false)
    expect(S.root).toBe(p.main)
    expect(S.beat !== null && S.watchdog !== null).toBe(true)
    expect(await readFile(`${p.main}/.symcc/lead.json`, 'utf8')).toContain('opencode-test')
    await end!()
    expect(S.beat).toBe(null)
    expect(S.watchdog).toBe(null)
  } finally {
    reset()
    await p.done()
  }
}, 30_000)

test('a copy in a subfolder of the main project runs the engine (as Claude Code\'s sessionStart does); with the main folder\'s copy running, it waits', async () => {
  reset()
  const p = await project()
  try {
    const roles: string[] = []
    const onRole = (dir: string, role: CopyRole) => void roles.push(`${dir} ${role}`)
    const plugin = symccServer({ engine: SYMCC_ENGINE, onRole, hostOptions: { say: () => undefined, sessionId: 'opencode-sub' } })
    const end = await plugin.setup(fakeCtx(`${p.main}/src`).ctx)
    expect(roles).toEqual([`${p.main}/src engine`])
    expect(S.guardOnly).toBe(false)
    expect(S.root).toBe(p.main)
    expect(S.beat !== null).toBe(true)
    expect(await readFile(`${p.main}/.symcc/lead.json`, 'utf8')).toContain('opencode-sub')
    await end!()
    expect(S.beat).toBe(null)
    // one engine per project: the main folder's copy and a subfolder's share one owner
    reset()
    const { engine } = recordingEngine()
    const roles2: string[] = []
    const rec = symccServer({ engine, onRole: (dir: string, role: CopyRole) => void roles2.push(`${dir} ${role}`), hostOptions: { say: () => undefined } })
    const endMain = await rec.setup(fakeCtx(p.main).ctx)
    const endSub = await rec.setup(fakeCtx(`${p.main}/src`).ctx)
    expect(roles2).toEqual([`${p.main} engine`, `${p.main}/src waiting`])
    await endSub!()
    await endMain!()
    expect(owners().size).toBe(0)
  } finally {
    reset()
    await p.done()
  }
}, 30_000)

/** The imports of `text` that bind it to Claude Code (the same check as the Node host's spec): 'claude-code', hooks/claude/, register.tsx. */
function claudeImports(text: string): string[] {
  const specs = [...text.matchAll(/(?:(?<![\w$.])from\s*|^\s*import\s+|(?<![\w$.])import\s*\(\s*)['"`]([^'"`\n]+)['"`]/gm)].map(m => m[1]!)
  return specs.filter(s => /^claude-code(\/|$)/.test(s) || /(^|\/)claude(\/|$)/.test(s) || /(^|\/)register(\.tsx)?$/.test(s))
}

async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(p)
    else if (!e.name.includes('.')) out.push(...(await filesUnder(p).catch(() => [])))
  }
  return out
}

test('hooks/opencode/ and opencode/ import nothing from Claude Code or hooks/claude/', async () => {
  const files = [...(await filesUnder(`${PLUGIN_ROOT}/hooks/opencode`)), ...(await filesUnder(`${PLUGIN_ROOT}/opencode`))]
  expect(files.length).toBeGreaterThan(5)
  for (const f of files) expect(`${f}: ${claudeImports(await readFile(f, 'utf8')).join(', ')}`).toBe(`${f}: `)
})

test('the model per role (R8): a role\'s Claude name runs on OpenCode\'s Claude Agent provider, "provider/model" as it is, none gives the default for the kind', () => {
  expect(DEFAULT_MODELS).toEqual({ worker: 'claude-agent/sonnet', scout: 'claude-agent/haiku', checker: 'claude-agent/haiku' })
  expect(opencodeModel(undefined, 'worker')).toEqual({ providerID: 'claude-agent', id: 'sonnet' })
  expect(opencodeModel('', 'scout')).toEqual({ providerID: 'claude-agent', id: 'haiku' })
  expect(opencodeModel('inherit', 'checker')).toEqual({ providerID: 'claude-agent', id: 'haiku' })
  expect(opencodeModel('sonnet', 'checker')).toEqual({ providerID: 'claude-agent', id: 'sonnet' })
  expect(opencodeModel('opus', 'worker')).toEqual({ providerID: 'claude-agent', id: 'opus' })
  expect(opencodeModel('claude-opus-4-5', 'worker')).toEqual({ providerID: 'claude-agent', id: 'opus' })
  expect(opencodeModel('opus[1m]', 'worker')).toEqual({ providerID: 'claude-agent', id: 'opus' })
  expect(opencodeModel('Haiku', 'worker')).toEqual({ providerID: 'claude-agent', id: 'haiku' })
  expect(opencodeModel('openai/gpt-5', 'worker')).toEqual({ providerID: 'openai', id: 'gpt-5' })
  expect(opencodeModel('opencode/deepseek-v4.1-flash-free', 'scout')).toEqual({ providerID: 'opencode', id: 'deepseek-v4.1-flash-free' })
})

test('an OpenCode session agent: create (child of the lead) -> move into its folder, waited for -> prompt once symcc recorded it -> its end reaches onEnd with tokens and the final text; an interrupt ends one as aborted', async () => {
  const f = fakeSessions(2)
  const base = await realpath(await mkdtemp('/tmp/symcc-oc-agents-'))
  const main = `${base}/proj`
  const wt = `${main}/.symcc/worktrees/T-1`
  await mkdir(wt, { recursive: true })
  try {
    const lead = f.lead(main)
    const ends: { id: string; end: unknown }[] = []
    const known = new Set<string>()
    const agents = opencodeAgents(f.api, { dir: main, lead: () => lead, ready: async id => known.has(id), onEnd: (id, end) => void ends.push({ id, end }), pollMs: 5, waitMs: 2000 })
    const r = await agents.spawn({ kind: 'worker', prompt: 'do T-1', name: 'symcc-T-1', description: 'a change', cwd: wt, model: 'opus' })
    expect(r.agentId).toBe('ses_2')
    // made a child of the lead (so OpenCode put it in the lead's folder), with the role's model, then moved: spawn
    // answered only once session.get showed the worktree
    expect(f.calls).toEqual([`create ses_2 parent ${lead} model claude-agent/opus`, 'move ses_2'])
    expect(f.sessions.get('ses_2')!.info.location.directory).toBe(wt)
    expect((await agents.list()).map(a => `${a.id} ${a.kind} ${a.status}`)).toEqual(['ses_2 worker pending'])
    // no prompt until symcc has recorded the agent (the board names it, so the worktree's copy can guard it)
    await new Promise<void>(res => setTimeout(() => res(), 50))
    expect(f.calls.length).toBe(2)
    known.add('ses_2')
    await until(() => f.calls.length === 3)
    expect(f.calls[2]).toBe(`prompt ses_2 in ${wt} (queue)`)
    // the base prompt (OpenCode's tool names) comes before the task's prompt
    const sent = String(f.sessions.get('ses_2')!.messages[0]!.content![0]!.text)
    expect(sent.endsWith('\n\ndo T-1')).toBe(true)
    expect(sent).toContain('symcc_ask_owner')
    expect(agents.has('ses_2')).toBe(true)
    // it ends: session.get's outcome and tokens (reasoning counts as output) and session.context's last text; cost 0 is left out
    f.end('ses_2', 'Changed src/a.ts.\n\nDONE')
    await until(() => ends.length === 1)
    expect(ends[0]).toEqual({ id: 'ses_2', end: { answer: 'Changed src/a.ts.\n\nDONE', end: { reason: 'answer' }, isAborted: false, tokens: { input: 10, output: 814, cache_read: 154787, cache_write: 2261 } } })
    expect((await agents.list())[0]!.status).toBe('completed')
    // a scout (no folder of its own) on the default model; stopped while it runs: interrupted, so it ended aborted
    const s = await agents.spawn({ kind: 'scout', prompt: 'look around', name: 'symcc-scout-x', description: 'a scout' })
    expect(f.calls.slice(3)).toEqual([`create ses_3 parent ${lead} model claude-agent/haiku`])
    known.add('ses_3')
    await until(() => f.calls.length === 5)
    await agents.send('ses_3', 'wrap up')
    await agents.stop(s.agentId!, 'stop')
    await until(() => ends.length === 2)
    expect(f.calls.slice(4)).toEqual([`prompt ses_3 in ${main} (queue)`, 'prompt ses_3 in ' + main + ' (steer)', 'interrupt ses_3'])
    expect(ends[1]).toEqual({ id: 'ses_3', end: { answer: '', end: { reason: 'aborted' }, isAborted: true, tokens: { input: 5, output: 7 } } })
    expect((await agents.list()).map(a => a.status)).toEqual(['completed', 'killed'])
    // a move that never lands: the start fails and the session is taken away, so no worker runs in the lead's folder
    const stuck = fakeSessions(1_000_000)
    const a2 = opencodeAgents(stuck.api, { dir: main, lead: () => stuck.lead(main), onEnd: () => undefined, pollMs: 5, waitMs: 100 })
    expect(await a2.spawn({ kind: 'checker', prompt: 'check', name: 'c', description: 'c', cwd: wt }).catch((e: Error) => e.message)).toMatch(/didn't move the session/)
    expect(stuck.calls.some(c => c.startsWith('prompt'))).toBe(false)
    expect(stuck.calls.at(-1)).toMatch(/^remove /)
    // never recorded by symcc: never prompted, ended as an error
    const lost: unknown[] = []
    const a3 = opencodeAgents(f.api, { dir: main, ready: async () => false, onEnd: (_id, end) => void lost.push(end), pollMs: 5, waitMs: 60 })
    await a3.spawn({ kind: 'worker', prompt: 'x', name: 'w', description: 'w', cwd: wt })
    await until(() => lost.length === 1)
    expect(f.calls.filter(c => c.startsWith('prompt ses_4'))).toEqual([])
    expect((lost[0] as { end: { reason: string } }).end.reason).toBe('error')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('stopped while its first prompt is still landing: it ends once as aborted, stays killed, and is interrupted again after the prompt lands', async () => {
  const f = fakeSessions(0)
  let release!: () => void
  const api: OcSessionApi = {
    ...f.api,
    async prompt(input: Parameters<OcSessionApi['prompt']>[0]) {
      await new Promise<void>(res => (release = res))
      return f.api.prompt(input)
    },
  }
  const main = await realpath(await mkdtemp('/tmp/symcc-oc-stop-'))
  try {
    const ends: string[] = []
    const agents = opencodeAgents(api, { dir: main, lead: () => f.lead(main), onEnd: (_id, end) => void ends.push(end.end.reason), pollMs: 5, waitMs: 2000 })
    const { agentId } = await agents.spawn({ kind: 'worker', prompt: 'do it', name: 'w', description: 'w' })
    await until(() => release !== undefined)
    await agents.stop(agentId!, 'stop')
    expect(ends).toEqual(['aborted'])
    release()
    await until(() => f.calls.filter(c => c.startsWith('interrupt')).length === 2)
    expect((await agents.list())[0]!.status).toBe('killed')
    // the session's run (had it gone on) ends: no second end is handed on
    f.end(agentId!, 'DONE')
    await new Promise<void>(res => setTimeout(() => res(), 30))
    expect(ends).toEqual(['aborted'])
    expect(f.calls.slice(1)).toEqual([`interrupt ${agentId}`, `prompt ${agentId} in ${main} (queue)`, `interrupt ${agentId}`])
  } finally {
    await rm(main, { recursive: true, force: true })
  }
})

test('sessionEnd: a failed run is an error with its message, a content filter a refusal', () => {
  const at = { directory: '/x' }
  expect(sessionEnd({ id: 's', outcome: 'failed', location: at }, [{ type: 'assistant', content: [], finish: 'error', error: { message: 'rate limited' } }])).toEqual({ answer: 'rate limited', end: { reason: 'error' }, isAborted: false, tokens: undefined })
  expect(sessionEnd({ id: 's', outcome: 'succeeded', location: at, cost: 0.25 }, [{ type: 'assistant', content: [{ type: 'text', text: 'no' }], finish: 'content-filter' }]).end.reason).toBe('refusal')
  expect(sessionEnd({ id: 's', outcome: 'succeeded', location: at, cost: 0.25 }, []).cost).toBe(0.25)
  expect(AGENT_PERMISSIONS).toEqual([{ action: 'question', resource: '*', effect: 'deny' }])
})

test('the tool backstop reads OpenCode 2.3\'s real tool inputs: edit and write {path}, patch {patchText}, shell {command, workdir}, and a multiedit\'s files', async () => {
  reset()
  const p = await project()
  try {
    const dir = p.wt
    // as logged in a real run (T-463): write {path, content}, edit {path, oldString, newString}, shell {command, workdir}
    expect(await toolTouches(dir, 'write', { path: 'src/b.ts', content: 'x' })).toEqual([{ path: `${dir}/src/b.ts` }])
    expect(await toolTouches(dir, 'edit', { path: 'src/a.ts', oldString: '1', newString: '3' })).toEqual([{ path: `${dir}/src/a.ts` }])
    expect(await toolTouches(dir, 'shell', { command: 'ls src', workdir: dir })).toEqual([{ command: 'ls src' }])
    expect(await toolTouches(dir, 'shell', { command: 'ls', workdir: p.main })).toEqual([{ command: `cd '${p.main}' && ls` }])
    expect(await toolTouches(dir, 'patch', { patchText: '*** Begin Patch\n*** Add File: src/c.ts\n+x\n*** Update File: README.md\n*** End Patch' })).toEqual([{ path: `${dir}/src/c.ts` }, { path: `${dir}/README.md` }])
    expect(await toolTouches(dir, 'multiedit', { filePath: 'src/a.ts', edits: [{ oldString: '1', newString: '2' }, { filePath: 'README.md', oldString: 'hi', newString: 'yo' }] })).toEqual([{ path: `${dir}/src/a.ts` }, { path: `${dir}/README.md` }])
    expect(await toolTouches(dir, 'read', { path: 'README.md' })).toEqual([])
    // through the worktree's copy: each is refused for the file outside the task's files (src/)
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined } })
    const w = fakeCtx(p.wt)
    const end = await plugin.setup(w.ctx)
    const before = async (tool: string, input: unknown) => {
      let thrown = ''
      await Promise.resolve(w.hooks.before!({ tool, sessionID: 'ses_worker', agent: 'build', messageID: 'm', id: 'c', input })).catch((e: Error) => (thrown = e.message))
      return thrown
    }
    expect(await before('write', { path: 'README.md', content: 'x' })).toBe(blockedEditText('README.md'))
    expect(await before('edit', { path: 'README.md', oldString: 'hi', newString: 'x' })).toBe(blockedEditText('README.md'))
    expect(await before('patch', { patchText: '*** Begin Patch\n*** Update File: README.md\n@@\n-hi\n+x\n*** End Patch' })).toBe(blockedEditText('README.md'))
    expect(await before('multiedit', { filePath: 'src/a.ts', edits: [{ filePath: 'README.md', oldString: 'hi', newString: 'x' }] })).toBe(blockedEditText('README.md'))
    expect(await before('shell', { command: 'echo x > README.md', workdir: p.main })).toMatch(/outside|owner/)
    expect(await before('write', { path: 'src/b.ts', content: 'x' })).toBe('')
    expect(await before('shell', { command: 'ls src', workdir: p.wt })).toBe('')
    await end!()
  } finally {
    reset()
    await p.done()
  }
})

test('the main folder\'s copy starts a worker as an OpenCode session: the role\'s model, a child of the lead, moved into its worktree, prompted once the board names it, with no wake line for the lead; its end reaches agentFinished with its tokens, and the lead gets one queued board update despite OpenCode\'s "subagent completed" message', async () => {
  reset()
  const p = await project()
  try {
    // T-3: a todo task of an added role whose model is any OpenCode model
    await mkdir(`${p.main}/.symcc/roles`, { recursive: true })
    await writeFile(`${p.main}/.symcc/roles/fast.md`, '---\ndescription: a fast one\nmodel: openai/gpt-5\n---\nBe quick.\n')
    const at = '2026-11-18T00:00:00.000Z'
    const [b] = addTask(JSON.parse(await readFile(`${p.main}/.symcc/board.json`, 'utf8')), { origin: { why: 'a test' }, title: 'a quick one', files: ['src/'] }, at)
    await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify(patchTask(patchTask(patchTask(b, 'T-1', { status: 'done' }, at), 'T-2', { status: 'done' }, at), 'T-3', { role: 'fast' }, at)))
    const f = fakeSessions(2)
    let host: Host | undefined
    const plugin = symccServer({ engine: SYMCC_ENGINE, host: o => (host = opencodeHost(o)), hostOptions: { say: () => undefined, sessionId: 'opencode-run' }, agentOptions: { pollMs: 10 } })
    const c = fakeCtx(p.main, f.api)
    const endCopy = await plugin.setup(c.ctx)
    expect(S.guardOnly).toBe(false)
    // the owner types in their own session: it becomes the lead the agents are children of
    const lead = f.lead(p.main)
    await c.hooks.prompt!({ sessionID: lead })
    await until(() => S.startupDone === true)
    await pump(host!)
    await until(() => f.calls.some(x => x.startsWith('prompt')), 15_000)
    const wt = `${p.main}/.symcc/worktrees/T-3`
    expect(f.calls).toEqual([`create ses_2 parent ${lead} model openai/gpt-5`, 'move ses_2', `prompt ses_2 in ${wt} (queue)`])
    // starting the worker woke nobody: no start queue on OpenCode, so no "Starting worker" line for the lead
    await new Promise<void>(r => setTimeout(() => r(), 1700))
    expect(f.prompts.filter(x => x.sessionID === lead)).toEqual([])
    // OpenCode's own "subagent completed" message fires the lead's prompt hook, as a prompt does
    f.hooks.onSubagent = id => void c.hooks.prompt!({ sessionID: id })
    const t = (await load(host!)).tasks.find(x => x.id === 'T-3')!
    expect(t.status).toBe('doing')
    expect(t.agent).toBe('ses_2')
    expect(workers.has('ses_2')).toBe(true)
    // its prompt is the worker prompt for T-3, with the role's checklist
    expect(String(f.sessions.get('ses_2')!.messages[0]!.content![0]!.text)).toContain('Be quick.')
    // it ends: agentFinished takes its tokens onto the try
    f.end('ses_2', 'Nothing to change.')
    await until(async () => !!(await load(host!)).tasks.find(x => x.id === 'T-3')!.runs?.at(-1)?.tokens, 15_000)
    expect((await load(host!)).tasks.find(x => x.id === 'T-3')!.runs!.at(-1)!.tokens).toEqual({ input: 10, output: 814, cache_read: 154787, cache_write: 2261 })
    expect(f.subagent).toEqual([`ses_2 -> ${lead}`])
    // symcc's board update about T-3 reaches the lead once, queued, labelled so the automatic message isn't a second report
    await until(() => f.prompts.some(x => x.sessionID === lead), 15_000)
    await new Promise<void>(r => setTimeout(() => r(), 1700))
    const toLead = f.prompts.filter(x => x.sessionID === lead)
    expect(toLead.length).toBe(1)
    expect(toLead[0]!.delivery).toBe('queue')
    expect(toLead[0]!.text).toContain('[symcc] Board update:')
    expect(toLead[0]!.text).toContain('T-3')
    expect(toLead[0]!.text).toContain(SUBAGENT_LABEL)
    // the lead's tokens for the stats, from session.get
    f.sessions.get(lead)!.info = { ...f.sessions.get(lead)!.info, tokens: { input: 3, output: 4, reasoning: 1, cache: { read: 9 } }, cost: 0 }
    expect(await host!.lead.usage(p.main, { kind: 'all' }, 1000)).toEqual({ lead: [{ id: lead, atMs: 1000, tokens: { input: 3, output: 5, cache_read: 9 }, from: OPENCODE_LEAD_FROM }], leadSessions: 1, leadFrom: OPENCODE_LEAD_FROM })
    await endCopy!()
  } finally {
    reset()
    await p.done()
  }
}, 60_000)

test('host.lead on OpenCode: a board update is a queued session.prompt into the lead, an urgent one steers; one sent before the lead is known waits for it; usage from session.get', async () => {
  const f = fakeSessions()
  let id: string | undefined
  const lead = opencodeLead(f.api, { lead: () => id })
  expect(await lead.usage('/p', { kind: 'all' }, 5)).toEqual({ leadProblem: NO_LEAD_YET })
  await lead.send('early news')
  await lead.send('a worker needs you', { urgent: true })
  expect(f.prompts).toEqual([])
  id = f.lead('/p')
  await lead.known()
  expect(f.prompts).toEqual([{ sessionID: id, text: leadText('early news\n\na worker needs you'), delivery: 'steer' }])
  await lead.known()
  expect(f.prompts.length).toBe(1)
  await lead.send('T-1 is done')
  await lead.send('T-2 needs you', { urgent: true })
  expect(f.prompts.slice(1)).toEqual([
    { sessionID: id, text: leadText('T-1 is done'), delivery: 'queue' },
    { sessionID: id, text: leadText('T-2 needs you'), delivery: 'steer' },
  ])
  // no tokens yet: no calls, but the session counts
  expect(await lead.usage('/p', { kind: 'all' }, 5)).toEqual({ lead: [], leadSessions: 1, leadFrom: OPENCODE_LEAD_FROM })
})

test('the OpenCode lead\'s tokens (a whole-session total, no times): counted in "all", left out of a "7d" and a task-range stats call', async () => {
  const f = fakeSessions()
  const id = f.lead('/p')
  f.sessions.get(id)!.info = { ...f.sessions.get(id)!.info, tokens: { input: 1000, output: 500 }, cost: 0 }
  const lead = opencodeLead(f.api, { lead: () => id })
  const now = Date.parse('2026-11-19T12:00:00Z')
  const tasks = [{ created_at: new Date(now - 3_600_000).toISOString(), updated_at: new Date(now - 60_000).toISOString() }]
  const workers = { tokens: {}, tries: 0 }
  // all: the whole session counts, and the lead's line says 1 session
  const all = await lead.usage('/p', { kind: 'all' }, now)
  expect(leadTotals(all.lead!, rangeSpan({ kind: 'all' }, tasks, now))).toEqual({ calls: 1, tokens: { input: 1000, output: 500 } })
  expect(teamLines(all, rangeSpan({ kind: 'all' }, tasks, now), workers, 0).find(l => l.includes('lead'))).toContain('1 session')
  // a task range and 7d: the lead is left out (not 0 tokens with "1 session", nor the whole session), and the line says why
  for (const range of [{ kind: 'ids', from: 100, to: 130 }, { kind: 'days', days: 7 }] as const) {
    const u = await lead.usage('/p', range, now)
    expect(u).toEqual({ leadProblem: LEAD_WHOLE_SESSION_ONLY })
    const lines = teamLines(u, rangeSpan(range, tasks, now), workers, 0)
    const line = lines.find(l => l.includes('lead'))!
    expect(line).toContain(`not counted: ${LEAD_WHOLE_SESSION_ONLY}`)
    expect(line).not.toContain('1 session')
    expect(lines.find(l => l.trimStart().startsWith('total'))).toContain('(without the lead)')
  }
})

test('the plugin\'s lead: the owner\'s session (no child, none of symcc\'s agents, in this project\'s main folder); a finished task\'s update goes queued, a "needs you" one steers, the owner\'s own actions wait as "Meanwhile" lines', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    let host: Host | undefined
    const plugin = symccServer({ engine: recordingEngine().engine, host: o => (host = opencodeHost(o)), hostOptions: { say: () => undefined, sessionId: 'opencode-lead' } })
    const c = fakeCtx(p.main, f.api)
    const endCopy = await plugin.setup(c.ctx)
    // a child session (OpenCode's own subagent) and one of symcc's agents from an earlier copy are never the lead
    const owner = f.lead(p.main)
    const child = (await f.api.create({ parentID: owner, location: { directory: p.main } })).id
    f.sessions.set('ses_agent', { info: { id: 'ses_agent', metadata: { symcc: 'scout' }, location: { directory: p.main } }, looksLeft: 0, messages: [] })
    await c.hooks.prompt!({ sessionID: child })
    await c.hooks.prompt!({ sessionID: 'ses_agent' })
    expect(leads().size).toBe(0)
    await c.hooks.prompt!({ sessionID: owner })
    expect([...leads().values()]).toEqual([owner])
    // every copy sees every session: a top-level session in another project, or one opened in a worker's folder,
    // never takes over this project's lead
    const elsewhere = f.lead('/some/other/project')
    const inWorker = f.lead(`${p.main}/.symcc/worktrees/T-1`)
    await c.hooks.prompt!({ sessionID: elsewhere })
    await c.hooks.prompt!({ sessionID: inWorker })
    expect([...leads().values()]).toEqual([owner])
    S.enabledNow = true
    // the owner's own action wakes nobody; it rides along in the next real update
    noteForLead('approved T-9')
    tellLead(host!, '✓ T-1 "a change in src" merged into main (abc1234); it is done.')
    await until(() => f.prompts.length === 1)
    expect(f.prompts[0]!.sessionID).toBe(owner)
    expect(f.prompts[0]!.delivery).toBe('queue')
    expect(f.prompts[0]!.text).toContain('Meanwhile the owner (nothing to answer):\n- approved T-9')
    expect(f.prompts[0]!.text).toContain('T-1 "a change in src" merged')
    // a worker needs the owner: the update steers, even with a plain line in the same batch
    tellLead(host!, 'T-4 "x": something plain.')
    tellLead(host!, 'T-1 is waiting for the owner: which name?', { urgent: true })
    await until(() => f.prompts.length === 2)
    expect(f.prompts[1]!.delivery).toBe('steer')
    expect(f.prompts[1]!.text).toContain('T-4 "x": something plain.')
    expect(f.prompts[1]!.text).toContain('which name?')
    // the next plain one queues again
    tellLead(host!, 'T-5 is done.')
    await until(() => f.prompts.length === 3)
    expect(f.prompts[2]!.delivery).toBe('queue')
    // only "Meanwhile" lines make no update
    noteForLead('dropped T-6')
    await new Promise<void>(r => setTimeout(() => r(), 1700))
    expect(f.prompts.length).toBe(3)
    await endCopy!()
    // the lead is kept for the board owner when the copy goes: a copy loaded again knows it at once
    expect([...leads().values()]).toEqual([owner])
  } finally {
    reset()
    await p.done()
  }
}, 30_000)

test('two main copies: updates the engine copy kept before the lead was known still reach the lead when the other copy\'s hook records it first', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    const hosts: Host[] = []
    const plugin = symccServer({ engine: recordingEngine().engine, host: o => { const h = opencodeHost(o); hosts.push(h); return h }, hostOptions: { say: () => undefined, sessionId: 'opencode-lead' } })
    const a = fakeCtx(p.main, f.api)
    const endA = await plugin.setup(a.ctx)
    const b = fakeCtx(`${p.main}/src`, f.api)
    const endB = await plugin.setup(b.ctx)
    await hosts[0]!.lead.send('early news')
    const owner = f.lead(p.main)
    // the waiting copy's hook records the lead first; the engine copy's hook still sends what it kept, once
    await b.hooks.prompt!({ sessionID: owner })
    expect([...leads().values()]).toEqual([owner])
    await a.hooks.prompt!({ sessionID: owner })
    expect(f.prompts.map(x => x.text.split('\n\n')[0])).toEqual(['early news'])
    expect(f.prompts[0]!.sessionID).toBe(owner)
    // the same prompt again sends nothing more
    await a.hooks.prompt!({ sessionID: owner })
    expect(f.prompts.length).toBe(1)
    // kept while no lead was known, and the engine copy's hook never runs after the other copy records one:
    // its next update carries the kept one along
    leads().clear()
    await hosts[0]!.lead.send('kept news')
    const owner2 = f.lead(p.main)
    await b.hooks.prompt!({ sessionID: owner2 })
    await hosts[0]!.lead.send('later news')
    expect(f.prompts.length).toBe(2)
    expect(f.prompts[1]!.sessionID).toBe(owner2)
    expect(f.prompts[1]!.text).toContain('kept news\n\nlater news')
    await endA!()
    await endB!()
  } finally {
    reset()
    await p.done()
  }
}, 30_000)
