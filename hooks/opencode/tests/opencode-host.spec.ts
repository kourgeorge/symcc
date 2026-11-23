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
// lead's tokens come from session.get. The tools and commands (T-465): every lead tool and ask_owner added with
// codemode false and run through toolCall, a scout's add and a worker's lead tool refused, each session offered only
// what it may call, the lead's guide in its system prompt, and each slash command run through runCommand. T-467: a lead.json left by an OpenCode server stopped without its cleanup never blocks the next start, and
// scripts/install-opencode.sh links opencode/ into OpenCode's plugins folder. Also: hooks/opencode/ never imports Claude Code or hooks/claude/.
import { partsText, splitBoard } from '../../core/board-parts'
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, readFile, lstat, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { addTask, emptyBoard, patchTask, find, withAgentStart, workerIdOf, tryTokens, blockedEditText, parseLead, whoDrives, leadText as symccLeadText, LEAD_STALE_MS } from '../../board'
import { claimLead, enableHere } from '../../app/lead'
import { S, startS, timers, workers, stopped, boardAgents, starting, queuedWorkers, scoutRuns, checkerRuns, meanwhile, leadQueue } from '../../app/state'
import { resetStore, change } from '../../app/store'
import { stoppedText, unknownAgentText } from '../../app/ask'
import { runCommand, nodeClock } from '../../../hosts/node/host'
import type { OcContext, OcPermissionEvaluation, OcToolBefore, OcSessionApi, OcSessionInfo, OcSessionMessage, OcSessionPrompt, OcSessionContext, OcToolInfo, OcCommandDefinition } from '../ctx'
import { opencodeAgents, opencodeModel, leadModel, sessionEnd, DEFAULT_MODELS, AGENT_PERMISSIONS } from '../agents'
import { toolTouches } from '../guard'
import { pump, endFailure } from '../../app/workers'
import { load } from '../../app/store'
import { symccServer, owners, leads, SYMCC_ENGINE, type CopyRole, type Engine } from '../plugin'
import { opencodeLead, leadText, SUBAGENT_LABEL, OPENCODE_LEAD_FROM, OPENCODE_LEAD_MESSAGES_FROM, NO_LEAD_YET, leadMessagesUnread, leadUndated } from '../lead'
import { leadTotals, rangeSpan, teamLines } from '../../core/stats'
import { tellLead, noteForLead } from '../../app/tell'
import { PLUGIN_ROOT, opencodeHost, OPENCODE_FEATURES } from '../host'
import type { Host } from '../../host'
import { TOOLS, leadGuide, manual } from '../../app/tools'
import { ASK_TOOL_DEF } from '../../app/ask'
import { COMMANDS, toolCall, notLeadText, runCommand as symccCommand } from '../../app/symcc'
import { scoutToolRefusal } from '../../core/scouts'
import { workerToolRefusal, ownerAnswerText } from '../tools'
import { parseViewFile, PANEL_MARK } from '../board-view'
import { taskListBoard, TASK_LIST_TEXT, EMPTY_TASK_LIST_TEXT } from '../../../tests/task-list-fixture'
import { statusBoard, statusHeadings, statusSection, statusTodayLines } from '../../../tests/status-fixture'
import { checkAndMerge } from '../../app/review'
import { loadRoles } from '../../app/roles'
import { sessionPrompt } from '../agents'

// T-509: limits far above a normal run, for a machine at load 200-500 where one git command or a copy's start can take
// seconds. Every wait below ends as soon as what it waits for happens, so a larger limit never slows a passing run;
// it only keeps a busy machine from failing a test that would pass (a real hang still fails, just later).
/** the most a test of this file may take (most start a copy, git, timers) */
const TEST_MS = 180_000
/** the most a test that starts several copies or runs a whole worker may take */
const LONG_TEST_MS = 300_000
/** the most until() and settle() wait for one thing, and an agent for its session's move */
const WAIT_MS = 60_000

/** Puts symcc's memory back to its start values, as a fresh copy of the plugin has (bun shares one copy across tests). */
function reset() {
  for (const t of [...timers, S.watchdog, S.leadTimer, S.leadRetry, S.beat, S.sayTimer]) t?.cancel()
  timers.length = 0
  for (const k of Object.keys(S)) delete (S as Record<string, unknown>)[k]
  Object.assign(S, startS())
  resetStore()
  for (const m of [workers, scoutRuns, checkerRuns, queuedWorkers]) m.clear()
  for (const s of [stopped, boardAgents, starting]) s.clear()
  // the lead's waiting update lines: a test checks they stay empty, so none may come from an earlier test
  leadQueue.length = 0
  meanwhile.length = 0
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
  /** every session.synthetic (a message that is not the owner's, e.g. a slash command's answer) */
  const synthetic: { sessionID: string; text: string; delivery?: string; resume?: boolean }[] = []
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
    async synthetic({ sessionID, text, delivery, resume }) {
      synthetic.push({ sessionID, text, delivery, resume })
      return {}
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
  /** A lead session in folder `dir` (as the owner's own chat), on `model` when given (session.get's model). */
  const lead = (dir: string, model?: OcSessionInfo['model']) => {
    const id = `ses_lead${++n}`
    sessions.set(id, { info: { id, location: { directory: dir }, ...(model ? { model } : {}) }, looksLeft: 0, messages: [] })
    return id
  }
  return { api, calls, prompts, subagent, synthetic, end, lead, sessions, hooks }
}

/**
 * A fake OpenCode ctx for folder `dir`: it keeps the hooks the plugin registers, the tools and slash commands it adds
 * (by name), and counts their disposals.
 */
function fakeCtx(dir: string, session: OcSessionApi = fakeSessions().api) {
  const hooks: {
    evaluate?: (e: OcPermissionEvaluation) => Promise<void> | void
    before?: (e: OcToolBefore) => Promise<void> | void
    prompt?: (e: OcSessionPrompt) => Promise<void> | void
    context?: (e: OcSessionContext) => Promise<void> | void
  } = {}
  const tools = new Map<string, OcToolInfo>()
  const commands = new Map<string, OcCommandDefinition>()
  let disposed = 0
  const reg = { dispose: async () => void disposed++ }
  const ctx: OcContext = {
    location: { directory: dir },
    permission: { hook: async (_name, fn) => ((hooks.evaluate = fn), reg) },
    tool: {
      hook: async (_name, fn) => ((hooks.before = fn), reg),
      transform: async fn => (fn({ add: t => void tools.set(t.name, t) }), reg),
    },
    command: { transform: async fn => (fn({ add: c => void commands.set(c.name, c) }), reg) },
    session: { ...session, hook: async (name, fn) => ((hooks[name] = fn as never), reg) },
  }
  return { ctx, hooks, tools, commands, disposed: () => disposed }
}

/** Waits until `check` is true (looking every 20 ms, for at most `ms`; a busy machine can take seconds for a copy's start). */
async function until(check: () => boolean | Promise<boolean>, ms = WAIT_MS) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise<void>(r => setTimeout(() => r(), 20))) if (await check()) return
  throw new Error('timed out waiting')
}

/**
 * Waits until no worker start is under way (`starting`: a task the engine's pump picked up, e.g. one a test added,
 * makes its folder with git before it writes the board) and no board write is running or starts within 300 ms, so
 * none of a test's follow-ups lands in the next test after reset() (T-489: a late write found no project folder).
 */
async function settle(ms = WAIT_MS) {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    const w = S.writing
    await w
    await new Promise<void>(r => setTimeout(() => r(), 300))
    if (S.writing === w && starting.size === 0) return
  }
  throw new Error(`board writes never settled (still starting: ${[...starting].join(', ') || 'none'})`)
}

/**
 * A project() test's cleanup: lets the engine's follow-ups (a worker start the pump picked up, board writes) finish
 * (see settle; a failed test's copy may never settle, so its error stays the one shown), then reset() and the scratch
 * folder goes.
 */
async function finish(p: { done: () => Promise<void> }) {
  await settle().catch(() => undefined)
  reset()
  await p.done()
}

/** Asks the copy's permission hook about `action` on `resources` for session `sessionID`; answers the check as it ended. */
async function evaluate(c: ReturnType<typeof fakeCtx>, sessionID: string, action: string, resources: string[]) {
  const e: OcPermissionEvaluation = { sessionID, action, resources, effect: 'allow' }
  await c.hooks.evaluate!(e)
  return e
}

/** The scratch repos' git: no global or system config (so none of the owner's hooks, hooksPath or settings), fixed name. */
const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }

async function git(cwd: string, ...args: string[]) {
  const r = await runCommand(['git', ...args], { cwd, env: GIT_ENV })
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
  await git(main, 'add', '-A')
  await git(main, 'commit', '-q', '--no-verify', '-m', 'start')
  const wt = `${main}/.symcc/worktrees/T-1`
  await mkdir(`${main}/.symcc/worktrees`, { recursive: true })
  await git(main, 'worktree', 'add', '-q', '-b', 'symcc/T-1', wt)
  const at = '2026-11-18T00:00:00.000Z'
  const [b1] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a change in src', files: ['src/'] }, at)
  const [b2] = addTask(patchTask(b1, 'T-1', { status: 'doing', live: { session: 'driver' }, runs: [{ started: at, agents: [{ id: 'ses_worker', kind: 'worker' as const, started: at }] }] }, at), { origin: { why: 'a test' }, title: 'an old one', files: ['src/'] }, at)
  const board = patchTask(b2, 'T-2', { status: 'todo', runs: [{ started: at, ended: at, agents: [{ id: 'ses_old', kind: 'worker' as const, started: at, ended: at }] }] }, at)
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
    expect(a.disposed()).toBe(6)
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
}, TEST_MS)

test('T-886: a newer plugin copy loaded in the same process stops the older engine copy (its timers end) and runs the engine; a same-version copy only waits', async () => {
  reset()
  const p = await project()
  try {
    const { calls, engine } = recordingEngine()
    const roles: string[] = []
    const onRole = (dir: string, role: CopyRole) => void roles.push(`${dir} ${role}`)
    const old = symccServer({ engine, onRole, version: '0.5.27', hostOptions: { say: () => undefined } })
    const same = symccServer({ engine, onRole, version: '0.5.27', hostOptions: { say: () => undefined } })
    const newer = symccServer({ engine, onRole, version: '0.5.30', hostOptions: { say: () => undefined } })
    const endOld = await old.setup(fakeCtx(p.main).ctx)
    const endSame = await same.setup(fakeCtx(p.link).ctx)
    expect(calls).toEqual([`start ${p.main}`, `guard ${p.link} -> ${p.link === p.main ? p.main : p.link}`])
    // the newer copy: the old engine ends (its timers stop) before the newer one starts
    const endNew = await newer.setup(fakeCtx(p.main).ctx)
    expect(calls.slice(2)).toEqual([`end ${p.main}`, `start ${p.main}`])
    expect(roles).toEqual([`${p.main} engine`, `${p.link} waiting`, `${p.main} engine`])
    // the old copy unloaded later ends nothing more, and the newer copy keeps the engine
    await endOld!()
    expect(calls.length).toBe(4)
    await endNew!()
    expect(calls.slice(4)).toEqual([`end ${p.main}`, `start ${p.link}`])
    await endSame!()
    expect(owners().size).toBe(0)
  } finally {
    await p.done()
  }
}, TEST_MS)

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
    await finish(p)
  }
}, TEST_MS)

test('T-555: a session made for one of symcc\'s agents that the board no longer names is refused edits and shell commands in the owner\'s copy; reads, the worker, the lead and OpenCode\'s own subagents go on', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    // an old try's worker session (symcc metadata), not on the board; the owner's chat; a subagent of the owner's chat
    f.sessions.set('ses_lost', { info: { id: 'ses_lost', location: { directory: p.wt }, metadata: { symcc: 'worker' } }, looksLeft: 0, messages: [] })
    const owner = f.lead(p.main)
    f.sessions.set('ses_explore', { info: { id: 'ses_explore', parentID: owner, location: { directory: p.main } }, looksLeft: 0, messages: [] })
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined } })
    // the worktree's copy guards every session working there (the engine's copy would stop the fixture's worker)
    const m = fakeCtx(p.wt, f.api)
    const end = await plugin.setup(m.ctx)
    const edit = await evaluate(m, 'ses_lost', 'edit', [`${p.main}/README.md`])
    expect(edit.effect).toBe('deny')
    expect(edit.message).toBe(unknownAgentText())
    const sh = await evaluate(m, 'ses_lost', 'shell', [`echo x > ${p.main}/README.md`])
    expect(sh.effect).toBe('deny')
    expect(sh.message).toBe(unknownAgentText())
    // the tool backstop refuses its write too
    let thrown = ''
    await Promise.resolve(m.hooks.before!({ tool: 'write', sessionID: 'ses_lost', agent: 'build', messageID: 'm1', id: 'c1', input: { filePath: 'README.md', content: 'x' } })).catch((e: Error) => (thrown = e.message))
    expect(thrown).toBe(unknownAgentText())
    // reading touches nothing: allowed
    expect((await evaluate(m, 'ses_lost', 'read', [`${p.main}/README.md`])).effect).toBe('allow')
    // the owner's chat and its own subagents are never refused
    expect((await evaluate(m, owner, 'edit', [`${p.main}/README.md`])).effect).toBe('allow')
    expect((await evaluate(m, 'ses_explore', 'shell', [`echo x > ${p.main}/README.md`])).effect).toBe('allow')
    // the current worker (named on the board) is judged as usual
    expect((await evaluate(m, 'ses_worker', 'edit', ['src/b.ts'])).effect).toBe('allow')
    expect((await evaluate(m, 'ses_worker', 'edit', ['README.md'])).message).toBe(blockedEditText('README.md'))
    await end!()
  } finally {
    await finish(p)
  }
}, TEST_MS)

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
    await finish(p)
  }
}, TEST_MS)

test('a lead.json left by an OpenCode server stopped without its cleanup (T-467) never blocks the next start: a stale one is taken over at once, a fresh one on the first heartbeat after it goes stale (in Claude Code too); a cleanup lets go at once', async () => {
  reset()
  const p = await project()
  const leadFile = `${p.main}/.symcc/lead.json`
  const lead = async () => parseLead(await readFile(leadFile, 'utf8').catch(() => null))
  /** A fresh server process: symcc's memory empty, its own id, the main folder's copy set up (its end kept). */
  const start = async (id: string) => {
    await settle().catch(() => undefined)
    reset()
    let host!: Host
    const plugin = symccServer({ engine: SYMCC_ENGINE, host: o => (host = opencodeHost(o)), hostOptions: { say: () => undefined, sessionId: id } })
    const end = await plugin.setup(fakeCtx(p.main).ctx)
    await until(() => S.startupDone)
    return { host, end: end! }
  }
  try {
    // the old server drives, then is killed: its cleanup never runs, so its lead.json stays (fresh at first)
    await start('opencode-gone')
    expect(S.driving).toBe(true)
    expect((await lead())?.session).toBe('opencode-gone')
    // started again right away: the left heartbeat is still fresh, so the new copy follows for now...
    const next = await start('opencode-next')
    expect(S.driving).toBe(false)
    expect((await lead())?.session).toBe('opencode-gone')
    expect(S.beat !== null).toBe(true)
    // ...and its own heartbeat (every 30 s) takes over once nobody refreshed lead.json for LEAD_STALE_MS
    await writeFile(leadFile, symccLeadText('opencode-gone', Date.now() - LEAD_STALE_MS - 1000))
    // T-793: that copy started while another window was live, so it is off here: it takes over only on /symcc-enable
    expect(S.offHere).toBe(true)
    expect(await claimLead(next.host)).toBe(false)
    await enableHere(next.host, () => undefined)
    expect(S.driving).toBe(true)
    expect((await lead())?.session).toBe('opencode-next')
    // a Claude Code session in the same project sees the same file the same way (whoDrives is shared)
    expect(whoDrives(symccLeadText('opencode-gone', Date.now() - LEAD_STALE_MS - 1000), 'claude-session', Date.now())).toBe('takeover')
    // a cleanup that ran (OpenCode 2.3 runs it on SIGTERM and SIGINT, T-467's real run) removes lead.json
    await next.end()
    expect(await lead()).toBe(null)
    // killed long ago: the next start drives at once
    await writeFile(leadFile, symccLeadText('opencode-gone', Date.now() - LEAD_STALE_MS - 60_000))
    await start('opencode-later')
    expect(S.offHere).toBe(false)
    expect(S.driving).toBe(true)
    expect((await lead())?.session).toBe('opencode-later')
  } finally {
    await finish(p)
  }
}, LONG_TEST_MS)

test('T-860: a copy started in a subfolder of the main project is a folder with no board: the hint only, no lead, no timers, nothing written; the main folder\'s copy runs the engine', async () => {
  reset()
  const p = await project()
  try {
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined, sessionId: 'opencode-sub' } })
    const sub = `${p.main}/src`
    const c = fakeCtx(sub, fakeSessions().api)
    const end = await plugin.setup(c.ctx)
    expect(S.guardOnly).toBe(false)
    expect(S.fresh).toBe(true)
    expect(S.root).toBe(sub)
    expect(S.beat).toBe(null)
    expect(await lstat(`${sub}/.symcc`).then(() => 'there', () => 'none')).toBe('none')
    expect(await lstat(`${p.main}/.symcc/lead.json`).then(() => 'there', () => 'none')).toBe('none')
    await end!()
    await settle()
    reset()
    const main = await plugin.setup(fakeCtx(p.main).ctx)
    await readFile(`${p.main}/.symcc/board.json`, 'utf8')
    expect(S.fresh).toBe(false)
    expect(S.root).toBe(p.main)
    await main!()
  } finally {
    await finish(p)
  }
}, TEST_MS)

test('the scratch project ignores the owner\'s global git config: a global core.hooksPath pre-commit hook that fails never runs, and project() still commits', async () => {
  const fake = await realpath(await mkdtemp('/tmp/symcc-oc-gitcfg-'))
  const marker = `${fake}/hook-ran`
  await mkdir(`${fake}/hooks`, { recursive: true })
  await writeFile(`${fake}/hooks/pre-commit`, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`)
  await runCommand(['chmod', '+x', `${fake}/hooks/pre-commit`])
  await writeFile(`${fake}/gitconfig`, `[core]\n\thooksPath = ${fake}/hooks\n`)
  const before = process.env.GIT_CONFIG_GLOBAL
  process.env.GIT_CONFIG_GLOBAL = `${fake}/gitconfig`
  try {
    // The fake hook really fails a plain commit that reads the global config (else this test proves nothing).
    const check = `${fake}/check`
    await mkdir(check, { recursive: true })
    await writeFile(`${check}/x`, 'x\n')
    const plain = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: check })
    await plain('init', '-q')
    await plain('add', '-A')
    expect((await plain('commit', '-q', '-m', 'x')).exitCode).not.toBe(0)
    expect((await readdir(fake, { withFileTypes: true })).map(e => e.name)).toContain('hook-ran')
    await rm(marker, { recursive: true, force: true })
    const p = await project()
    try {
      expect((await git(p.main, 'log', '--format=%s')).trim()).toBe('start')
      expect((await readdir(fake, { withFileTypes: true })).map(e => e.name)).not.toContain('hook-ran')
    } finally {
      await p.done()
    }
  } finally {
    if (before === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = before
    await rm(fake, { recursive: true, force: true })
  }
}, TEST_MS)

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
}, TEST_MS)

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

test("no model (none, inherit, default) runs on the lead's current model for a worker, scout and checker; lead unknown or unreadable gives DEFAULT_MODELS; a named model is unchanged (T-504)", async () => {
  const gpt = { providerID: 'openai', id: 'gpt-5' }
  for (const kind of ['worker', 'scout', 'checker'] as const) {
    for (const name of [undefined, '', 'inherit', 'default']) expect(opencodeModel(name, kind, gpt)).toEqual(gpt)
    expect(opencodeModel('opus', kind, gpt)).toEqual({ providerID: 'claude-agent', id: 'opus' })
    expect(opencodeModel('opencode/big-pickle', kind, gpt)).toEqual({ providerID: 'opencode', id: 'big-pickle' })
  }
  const f = fakeSessions(0)
  const base = await realpath(await mkdtemp('/tmp/symcc-oc-leadmodel-'))
  const main = `${base}/proj`
  const wt = `${main}/.symcc/worktrees/T-1`
  await mkdir(wt, { recursive: true })
  try {
    // the lead's model from session.get, else from its latest assistant (or model-switched) message
    const lead = f.lead(main, { providerID: 'opencode', id: 'big-pickle', variant: 'high' })
    expect(await leadModel(f.api, lead)).toEqual({ providerID: 'opencode', id: 'big-pickle', variant: 'high' })
    const bare = f.lead(main)
    expect(await leadModel(f.api, bare)).toBe(undefined)
    f.sessions.get(bare)!.messages.push({ type: 'assistant', model: { providerID: 'openai', id: 'gpt-4' } }, { type: 'model-switched', model: { providerID: 'openai', id: 'gpt-5' } }, { type: 'user' })
    expect(await leadModel(f.api, bare)).toEqual({ providerID: 'openai', id: 'gpt-5' })
    // spawn: no model -> the lead's (said in the log); a named one as it is
    const log: string[] = []
    const agents = opencodeAgents(f.api, { dir: main, lead: () => lead, onEnd: () => undefined, log: t => void log.push(t), pollMs: 5, waitMs: 500 })
    await agents.spawn({ kind: 'worker', prompt: 'x', name: 'w', description: 'w', cwd: wt })
    await agents.spawn({ kind: 'scout', prompt: 'x', name: 's', description: 's', model: 'inherit' })
    await agents.spawn({ kind: 'checker', prompt: 'x', name: 'c', description: 'c', cwd: wt, model: 'default' })
    await agents.spawn({ kind: 'worker', prompt: 'x', name: 'w2', description: 'w2', cwd: wt, model: 'sonnet' })
    expect(f.calls.filter(c => c.startsWith('create')).map(c => c.replace(/^create \S+ parent \S+ /, ''))).toEqual(['model opencode/big-pickle', 'model opencode/big-pickle', 'model opencode/big-pickle', 'model claude-agent/sonnet'])
    expect(log.filter(t => t.includes(': OpenCode session ')).map(t => t.replace(/session \S+ /, ''))).toEqual([
      "worker w: OpenCode on opencode/big-pickle (the lead's model)",
      "scout s: OpenCode on opencode/big-pickle (the lead's model)",
      "checker c: OpenCode on opencode/big-pickle (the lead's model)",
      'worker w2: OpenCode on claude-agent/sonnet',
    ])
    // no lead session known yet: DEFAULT_MODELS, said once in the log
    const g = fakeSessions(0)
    const log2: string[] = []
    const none = opencodeAgents(g.api, { dir: main, onEnd: () => undefined, log: t => void log2.push(t), pollMs: 5, waitMs: 500 })
    await none.spawn({ kind: 'worker', prompt: 'x', name: 'w', description: 'w' })
    await none.spawn({ kind: 'scout', prompt: 'x', name: 's', description: 's' })
    expect(g.calls.filter(c => c.startsWith('create'))).toEqual(['create ses_1 model claude-agent/sonnet', 'create ses_2 model claude-agent/haiku'])
    expect(log2.filter(t => t.includes("symcc's default models"))).toEqual([
      "agents with no model of their own run on symcc's default models (worker claude-agent/sonnet, scout claude-agent/haiku, checker claude-agent/haiku): no lead session known yet",
    ])
    // the lead's model can't be read (an API error): DEFAULT_MODELS too
    const h = fakeSessions(0)
    const failing: OcSessionApi = { ...h.api, get: async ({ sessionID }) => (sessionID === 'ses_gone' ? Promise.reject(new Error('boom')) : h.api.get({ sessionID })) }
    const log3: string[] = []
    const broken = opencodeAgents(failing, { dir: main, lead: () => 'ses_gone', onEnd: () => undefined, log: t => void log3.push(t), pollMs: 5, waitMs: 500 })
    await broken.spawn({ kind: 'checker', prompt: 'x', name: 'c', description: 'c' })
    expect(h.calls.filter(c => c.startsWith('create'))).toEqual(['create ses_1 parent ses_gone model claude-agent/haiku'])
    expect(log3.some(t => t.endsWith("couldn't read the lead session's model: boom"))).toBe(true)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('T-656: an OpenCode agent that handed back gets one follow-up prompt in its own session (the debrief); its end reaches onEnd again with only that turn\'s tokens and cost', async () => {
  const f = fakeSessions(0)
  const base = await realpath(await mkdtemp('/tmp/symcc-oc-follow-'))
  try {
    const ends: { id: string; end: unknown }[] = []
    const agents = opencodeAgents(f.api, { dir: base, onEnd: (id, end) => void ends.push({ id, end }), pollMs: 5, waitMs: WAIT_MS })
    const { agentId } = await agents.spawn({ kind: 'worker', prompt: 'do T-1', name: 'symcc-T-1', description: 'a change' })
    await until(() => f.calls.some(c => c.startsWith(`prompt ${agentId}`)))
    // not finished yet: no follow-up
    expect(await agents.followUp(agentId!, 'x').then(() => 'sent', () => 'refused')).toBe('refused')
    f.end(agentId!, 'Changed src/a.ts.')
    await until(() => ends.length === 1)
    await agents.followUp(agentId!, 'Before you finish: anything for org-mem?')
    expect(f.prompts.at(-1)).toEqual({ sessionID: agentId!, text: 'Before you finish: anything for org-mem?', delivery: 'queue' })
    expect((await agents.list())[0]!.status).toBe('running')
    const s = f.sessions.get(agentId!)!
    s.messages.push({ type: 'assistant', content: [{ type: 'text', text: 'none' }], finish: 'stop', tokens: { input: 4, output: 2, reasoning: 1, cache: { read: 0, write: 0 } }, cost: 0.01 })
    s.ended?.()
    await until(() => ends.length === 2)
    expect(ends[1]).toEqual({ id: agentId!, end: { answer: 'none', end: { reason: 'answer' }, isAborted: false, tokens: { input: 4, output: 3 }, cost: 0.01 } })
    expect((await agents.list())[0]!.status).toBe('completed')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
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
    const agents = opencodeAgents(f.api, { dir: main, lead: () => lead, ready: async id => known.has(id), onEnd: (id, end) => void ends.push({ id, end }), pollMs: 5, waitMs: WAIT_MS })
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
}, TEST_MS)

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
    const agents = opencodeAgents(api, { dir: main, lead: () => f.lead(main), onEnd: (_id, end) => void ends.push(end.end.reason), pollMs: 5, waitMs: WAIT_MS })
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
}, TEST_MS)

test('sessionEnd: a failed run is an error with its message, a content filter a refusal', () => {
  const at = { directory: '/x' }
  expect(sessionEnd({ id: 's', outcome: 'failed', location: at }, [{ type: 'assistant', content: [], finish: 'error', error: { message: 'rate limited' } }])).toEqual({ answer: 'rate limited', end: { reason: 'error', error: 'rate limited' }, isAborted: false, tokens: undefined })
  // a failed run with no error object says nothing more than before
  expect(sessionEnd({ id: 's', outcome: 'failed', location: at }, [{ type: 'assistant', content: [{ type: 'text', text: 'half' }] }]).end).toEqual({ reason: 'error' })
  expect(sessionEnd({ id: 's', outcome: 'succeeded', location: at, cost: 0.25 }, [{ type: 'assistant', content: [{ type: 'text', text: 'no' }], finish: 'content-filter' }]).end.reason).toBe('refusal')
  expect(sessionEnd({ id: 's', outcome: 'succeeded', location: at, cost: 0.25 }, []).cost).toBe(0.25)
  expect(AGENT_PERMISSIONS).toEqual([{ action: 'question', resource: '*', effect: 'deny' }])
})

test('T-928: a session that wrote text and then failed on a usage limit keeps that error apart from its text, and the try is told it is a usage limit', () => {
  const at = { directory: '/x' }
  const limit = 'Free usage limit reached. Connect a provider or subscribe to OpenCode Go to keep going, or switch models.'
  const run = sessionEnd({ id: 's', outcome: 'failed', location: at }, [{ type: 'assistant', content: [{ type: 'text', text: 'Now I will edit the file' }], finish: 'error', error: { name: 'APIError', message: limit } }])
  expect(run.answer).toBe('Now I will edit the file')
  expect(run.end).toEqual({ reason: 'error', error: limit })
  expect(endFailure(run.end)).toBe(`the worker's turn ended on an error (usage limit): ${limit.replace(/\.$/, '')}`)
  // another error is said as it is, not named a usage limit
  expect(endFailure({ reason: 'error', error: 'Internal server error.' })).toBe("the worker's turn ended on an error: Internal server error")
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
    await finish(p)
  }
}, TEST_MS)

test('the main folder\'s copy starts a worker as an OpenCode session: the role\'s model, a child of the lead, moved into its worktree, prompted once the board names it, with no wake line for the lead; its end reaches agentFinished with its tokens, and the lead gets one queued board update despite OpenCode\'s "subagent completed" message', async () => {
  reset()
  const p = await project()
  try {
    // T-3: a todo task of an added role whose model is any OpenCode model
    await mkdir(`${p.main}/.symcc/roles`, { recursive: true })
    await writeFile(`${p.main}/.symcc/roles/fast.md`, '---\ndescription: a fast one\nmodel: openai/gpt-5\n---\nBe quick.\n')
    const at = '2026-11-18T00:00:00.000Z'
    const [b] = addTask(JSON.parse(await readFile(`${p.main}/.symcc/board.json`, 'utf8')), { origin: { why: 'a test' }, title: 'a quick one', files: ['src/'] }, at)
    // saved as symcc saves it (T-675): the done tasks' parts in .symcc/tasks/, so there is nothing to migrate
    const saved = splitBoard(patchTask(patchTask(patchTask(b, 'T-1', { status: 'done' }, at), 'T-2', { status: 'done' }, at), 'T-3', { role: 'fast' }, at))
    await mkdir(`${p.main}/.symcc/tasks`, { recursive: true })
    for (const [rel, tasks] of saved.parts) await writeFile(`${p.main}/.symcc/${rel}`, partsText(tasks))
    await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify(saved.board))
    const f = fakeSessions(2)
    let host: Host | undefined
    // T-725: the agent's own waits (the session's move into the worktree, and the board naming the worker before its
    // prompt) get WAIT_MS like until() below, not their 20 s default: on a busy machine the board write that names the
    // worker can take longer, the start then gives up, and the test timed out waiting for a prompt that never came.
    // Each wait ends as soon as what it waits for happens, so this never slows a passing run.
    const plugin = symccServer({ engine: SYMCC_ENGINE, host: o => (host = opencodeHost(o)), hostOptions: { say: () => undefined, sessionId: 'opencode-run' }, agentOptions: { pollMs: 10, waitMs: WAIT_MS } })
    const c = fakeCtx(p.main, f.api)
    const endCopy = await plugin.setup(c.ctx)
    expect(S.guardOnly).toBe(false)
    // the owner types in their own session: it becomes the lead the agents are children of
    const lead = f.lead(p.main)
    await c.hooks.prompt!({ sessionID: lead })
    await until(() => S.startupDone === true)
    await pump(host!)
    await until(() => f.calls.some(x => x.startsWith('prompt')))
    const wt = `${p.main}/.symcc/worktrees/T-3`
    expect(f.calls).toEqual([`create ses_2 parent ${lead} model openai/gpt-5`, 'move ses_2', `prompt ses_2 in ${wt} (queue)`])
    // starting the worker woke nobody: no start queue on OpenCode, so no "Starting worker" line for the lead. A wake
    // line is queued before the agent is spawned, so by now it would be waiting (leadQueue, S.leadTimer) or sent
    expect(f.prompts.filter(x => x.sessionID === lead)).toEqual([])
    expect(leadQueue).toEqual([])
    expect(S.leadTimer).toBe(null)
    // OpenCode's own "subagent completed" message fires the lead's prompt hook, as a prompt does
    f.hooks.onSubagent = id => void c.hooks.prompt!({ sessionID: id })
    const t = (await load(host!)).tasks.find(x => x.id === 'T-3')!
    expect(t.status).toBe('doing')
    expect(workerIdOf(t)).toBe('ses_2')
    expect(workers.has('ses_2')).toBe(true)
    // its prompt is the worker prompt for T-3, with the role's checklist
    expect(String(f.sessions.get('ses_2')!.messages[0]!.content![0]!.text)).toContain('Be quick.')
    // it ends: agentFinished takes its tokens onto the try
    f.end('ses_2', 'Nothing to change.')
    await until(async () => !!tryTokens((await load(host!)).tasks.find(x => x.id === 'T-3')!.runs?.at(-1)))
    expect(tryTokens((await load(host!)).tasks.find(x => x.id === 'T-3')!.runs!.at(-1))).toEqual({ input: 10, output: 814, cache_read: 154787, cache_write: 2261 })
    expect(f.subagent).toEqual([`ses_2 -> ${lead}`])
    // symcc's board update about T-3 reaches the lead once, queued, labelled so the automatic message isn't a second report
    await until(() => f.prompts.some(x => x.sessionID === lead))
    // and nothing more is on its way to the lead: no line waits for a next update, and no send is due
    await until(() => starting.size === 0)
    expect(leadQueue).toEqual([])
    expect(S.leadTimer).toBe(null)
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
    await finish(p)
  }
}, LONG_TEST_MS)

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

test("host.lead on OpenCode: kept updates whose send to the lead fails wait again (still urgent) and go with the next update, once (T-490)", async () => {
  const f = fakeSessions()
  let id: string | undefined
  let fails = 0
  const logged: string[] = []
  const api: OcSessionApi = { ...f.api, prompt: async p => (fails > 0 ? (fails--, Promise.reject(new Error('server restarting'))) : f.api.prompt(p)) }
  const leadId = f.lead('/p')
  const lead = opencodeLead(api, { lead: () => id, log: t => void logged.push(t) })
  await lead.send('T-5 needs you', { urgent: true })
  await lead.send('T-6 was merged')
  id = leadId
  // known(): the send fails, nothing is lost and one line is logged
  fails = 1
  await lead.known()
  expect(f.prompts).toEqual([])
  expect(logged.filter(l => l.includes('failed')).length).toBe(1)
  // the next update carries them, still urgent; once
  await lead.send('T-7 is done')
  expect(f.prompts).toEqual([{ sessionID: id, text: leadText('T-5 needs you\n\nT-6 was merged\n\nT-7 is done'), delivery: 'steer' }])
  await lead.known()
  expect(f.prompts.length).toBe(1)
  // a failing send with kept updates: they wait again, the new one is the sender's to put back (the error says so)
  id = undefined
  await lead.send('T-8 needs you', { urgent: true })
  id = leadId
  fails = 1
  expect(await lead.send('T-9 failed').then(() => 'sent', (e: Error) => e.message)).toBe('server restarting')
  await lead.known()
  expect(f.prompts.slice(1)).toEqual([{ sessionID: id, text: leadText('T-8 needs you'), delivery: 'steer' }])
})

/** A lead session whose answers (in session.context) are 10 days, 2 hours and 30 minutes old, plus one without tokens; `total` is its session.get total. */
function leadWithAnswers(total: OcSessionInfo['tokens']) {
  const f = fakeSessions()
  const id = f.lead('/p')
  const now = Date.parse('2026-11-19T12:00:00Z')
  const day = 86_400_000
  const s = f.sessions.get(id)!
  s.info = { ...s.info, tokens: total, cost: 0 }
  s.messages.push(
    { type: 'user', content: [{ type: 'text', text: 'hi' }], time: { created: now - 10 * day } },
    // 10 days ago: outside "7d" and outside the task range
    { type: 'assistant', content: [], time: { created: now - 10 * day, completed: now - 10 * day + 5000 }, tokens: { input: 100, output: 10, reasoning: 5, cache: { read: 1000, write: 50 } } },
    // 2 hours ago (no completed time yet: created is used): inside "7d", before the task range
    { type: 'assistant', content: [], time: { created: now - 7_200_000 }, tokens: { input: 200, output: 20, reasoning: 0, cache: { read: 0, write: 0 } } },
    // 30 minutes ago: inside both
    { type: 'assistant', content: [], time: { created: now - 1_900_000, completed: now - 1_800_000 }, tokens: { input: 300, output: 30, reasoning: 10, cache: { read: 3000, write: 0 } } },
    // no tokens: not counted
    { type: 'assistant', content: [], time: { created: now - 60_000 } },
  )
  const lead = opencodeLead(f.api, { lead: () => id })
  const tasks = [{ created_at: new Date(now - 3_600_000).toISOString(), updated_at: new Date(now - 60_000).toISOString() }]
  const totals = async (range: Parameters<typeof lead.usage>[1]) => {
    const u = await lead.usage('/p', range, now)
    expect(u.leadProblem).toBe(undefined)
    return { u, got: leadTotals(u.lead!, rangeSpan(range, tasks, now)) }
  }
  return { id, now, tasks, lead, totals }
}

test('the OpenCode lead\'s tokens, one entry per answer at its own time (T-486): "7d" and a task range count only the answers inside them, "all" the whole session', async () => {
  // no compaction: the session.get total is the sum of the answers
  const { now, tasks, totals } = leadWithAnswers({ input: 600, output: 65, reasoning: 10, cache: { read: 4000, write: 50 } })
  const all = await totals({ kind: 'all' })
  expect(all.got).toEqual({ calls: 1, tokens: { input: 600, output: 75, cache_read: 4000, cache_write: 50 } })
  expect(all.u.leadFrom).toBe(OPENCODE_LEAD_FROM)
  const week = await totals({ kind: 'days', days: 7 })
  expect(week.got).toEqual({ calls: 2, tokens: { input: 500, output: 60, cache_read: 3000 } })
  expect(week.u.lead!.every(c => c.from === OPENCODE_LEAD_MESSAGES_FROM)).toBe(true)
  expect(week.u.leadFrom).toBe(OPENCODE_LEAD_MESSAGES_FROM)
  const ids = await totals({ kind: 'ids', from: 100, to: 130 })
  expect(ids.got).toEqual({ calls: 1, tokens: { input: 300, output: 40, cache_read: 3000 } })
  expect(ids.u.leadFrom).toBe(OPENCODE_LEAD_MESSAGES_FROM)
  const lines = teamLines(week.u, rangeSpan({ kind: 'days', days: 7 }, tasks, now), { tokens: {}, tries: 0 }, 0)
  expect(lines.find(l => l.includes('lead'))).toContain('1 session')
  expect(lines.find(l => l.trimStart().startsWith('total'))).not.toContain('(without the lead)')
})

test('the OpenCode lead\'s tokens after a compaction (session.get total bigger than the answers session.context still lists): "all" counts the full total, "7d" the answers in range plus a "not dated" note', async () => {
  // 10000 input and 1000 output (reasoning included) more than the listed answers: from before the last compaction
  const { now, tasks, totals } = leadWithAnswers({ input: 10600, output: 1065, reasoning: 10, cache: { read: 4000, write: 50 } })
  const all = await totals({ kind: 'all' })
  expect(all.got).toEqual({ calls: 1, tokens: { input: 10600, output: 1075, cache_read: 4000, cache_write: 50 } })
  expect(all.u.leadFrom).toBe(OPENCODE_LEAD_FROM)
  const week = await totals({ kind: 'days', days: 7 })
  expect(week.got).toEqual({ calls: 2, tokens: { input: 500, output: 60, cache_read: 3000 } })
  expect(week.u.leadFrom).toBe(`${OPENCODE_LEAD_MESSAGES_FROM}; ${leadUndated(11000)}`)
  expect(leadUndated(11000)).toContain('from before the last compaction, not dated')
  const ids = await totals({ kind: 'ids', from: 100, to: 130 })
  expect(ids.got).toEqual({ calls: 1, tokens: { input: 300, output: 40, cache_read: 3000 } })
  expect(ids.u.leadFrom).toBe(`${OPENCODE_LEAD_MESSAGES_FROM}; ${leadUndated(11000)}`)
  // the full stats view says it on the lead's line
  const full = teamLines(week.u, rangeSpan({ kind: 'days', days: 7 }, tasks, now), { tokens: {}, tries: 0 }, 0, undefined, true)
  expect(full.find(l => l.includes('lead'))).toContain('not dated, are left out of this range')
})

test('the OpenCode lead\'s tokens when its messages can\'t be read: the whole-session total in "all", left out of "7d" and a task range with the reason', async () => {
  const f = fakeSessions()
  const id = f.lead('/p')
  f.sessions.get(id)!.info = { ...f.sessions.get(id)!.info, tokens: { input: 1000, output: 500, reasoning: 20 }, cost: 0 }
  const api: OcSessionApi = { ...f.api, context: async () => Promise.reject(new Error('server restarting')) }
  const lead = opencodeLead(api, { lead: () => id })
  const now = Date.parse('2026-11-19T12:00:00Z')
  const tasks = [{ created_at: new Date(now - 3_600_000).toISOString(), updated_at: new Date(now - 60_000).toISOString() }]
  const workers = { tokens: {}, tries: 0 }
  const all = await lead.usage('/p', { kind: 'all' }, now)
  expect(all).toEqual({ lead: [{ id, atMs: now, tokens: { input: 1000, output: 520 }, from: OPENCODE_LEAD_FROM }], leadSessions: 1, leadFrom: OPENCODE_LEAD_FROM })
  expect(teamLines(all, rangeSpan({ kind: 'all' }, tasks, now), workers, 0).find(l => l.includes('lead'))).toContain('1 session')
  for (const range of [{ kind: 'ids', from: 100, to: 130 }, { kind: 'days', days: 7 }] as const) {
    const u = await lead.usage('/p', range, now)
    expect(u).toEqual({ leadProblem: leadMessagesUnread('server restarting') })
    const lines = teamLines(u, rangeSpan(range, tasks, now), workers, 0)
    const line = lines.find(l => l.includes('lead'))!
    expect(line).toContain(`not counted: ${leadMessagesUnread('server restarting')}`)
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
    // no send is due (an update would have armed S.leadTimer): the line waits for the next real update
    expect(S.leadTimer).toBe(null)
    expect(meanwhile).toEqual(['dropped T-6'])
    expect(f.prompts.length).toBe(3)
    await endCopy!()
    // the lead is kept for the board owner when the copy goes: a copy loaded again knows it at once
    expect([...leads().values()]).toEqual([owner])
  } finally {
    await finish(p)
  }
}, TEST_MS)

test('two main copies: updates the engine copy kept before the lead was known still reach the lead when the other copy\'s hook records it first', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    const hosts: Host[] = []
    const plugin = symccServer({ engine: recordingEngine().engine, host: o => { const h = opencodeHost(o); hosts.push(h); return h }, hostOptions: { say: () => undefined, sessionId: 'opencode-lead' } })
    const a = fakeCtx(p.main, f.api)
    const endA = await plugin.setup(a.ctx)
    const b = fakeCtx(p.main, f.api)
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
    await finish(p)
  }
}, TEST_MS)

// T-465: symcc's tools and slash commands in OpenCode (tools.ts), mapped from the Claude host's lists.

test('every lead tool and ask_owner is added as a normal tool (codemode false) with its schema, and runs symcc\'s toolCall; a scout\'s add and a worker\'s lead tool are refused', async () => {
  reset()
  const p = await project()
  try {
    // (T-515) ses_old's ended try is kept on T-2's runs, as the engine keeps every ended try's agent (T-479): the
    // board names it as T-2's agent only until the engine starts T-2's new worker on its own, which on a busy machine
    // came before the stopped-agent check below (the call was then let through as the lead's)
    const at = '2026-11-18T00:00:00.000Z'
    const b0 = JSON.parse(await readFile(`${p.main}/.symcc/board.json`, 'utf8'))
    await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify(patchTask(b0, 'T-2', { runs: [{ started: at, ended: at, agents: [{ id: 'ses_old', kind: 'worker' as const, started: at, ended: at }] }] }, at)))
    const f = fakeSessions()
    let host: Host | undefined
    const plugin = symccServer({ engine: SYMCC_ENGINE, host: o => (host = opencodeHost(o)), hostOptions: { say: () => undefined, sessionId: 'opencode-tools' } })
    const c = fakeCtx(p.main, f.api)
    const end = await plugin.setup(c.ctx)
    await until(() => S.startupDone === true)
    // the same list and schemas as the Claude host registers (TOOLS, then ASK_TOOL_DEF), by OpenCode's names
    const want = [...TOOLS(), ASK_TOOL_DEF()]
    expect([...c.tools.keys()]).toEqual(want.map(t => `symcc_${t.name}`))
    for (const t of want) {
      const added = c.tools.get(`symcc_${t.name}`)!
      expect(added.options).toEqual({ codemode: false })
      expect(added.input).toEqual(t.inputSchema)
      expect(added.description).toBe(t.description)
    }
    const call = (tool: string, sessionID: string, input: unknown = {}) =>
      c.tools.get(tool)!.execute(input, { sessionID, agent: 'build', messageID: 'm1', id: 'c1' }).then(
        r => ({ ok: String(r.content) }),
        (e: Error) => ({ refused: e.message }),
      )
    // the lead's call (the session the owner prompted) runs the same handler as Claude Code's (toolCall -> runTool, as the lead: no agent id)
    const lead = f.lead(p.main)
    await c.hooks.prompt!({ sessionID: lead })
    const board = await call('symcc_board', lead, { task: 'T-1' })
    expect(board).toEqual({ ok: ((await toolCall(host!, 'symcc_board', undefined, { task: 'T-1' })) as { result: string }).result })
    expect(String((board as { ok: string }).ok)).toContain('T-1')
    const added = await call('symcc_add', lead, { title: 'From OpenCode', details: 'Done when: a test shows it.', why: 'a test', origin_by: 'owner' })
    expect(String((added as { ok: string }).ok)).toContain('T-3')
    expect((await load(host!)).tasks.map(t => t.title)).toContain('From OpenCode')
    // a scout may only read the board: add is refused with symcc's reason; board and stats run
    scoutRuns.set('ses_scout', 'tests')
    expect(await call('symcc_add', 'ses_scout', { title: 'x', details: 'y', why: 'z', origin_by: 'scout' })).toEqual({ refused: scoutToolRefusal('add', 'symcc') })
    expect('ok' in (await call('symcc_board', 'ses_scout'))).toBe(true)
    expect('ok' in (await call('symcc_stats', 'ses_scout'))).toBe(true)
    // T-895: a scout may list the scouts (action list, with or without a name); any other action is refused
    expect(await call('symcc_scouts', 'ses_scout', { action: 'list' })).toEqual({ ok: ((await toolCall(host!, 'symcc_scouts', undefined, { action: 'list' })) as { result: string }).result })
    expect('ok' in (await call('symcc_scouts', 'ses_scout', { action: 'list', name: 'tests' }))).toBe(true)
    for (const action of ['add', 'edit', 'remove', 'run']) {
      const input = { action, name: 'tests', every_minutes: 5, prompt: 'x' }
      expect(await call('symcc_scouts', 'ses_scout', input)).toEqual({ refused: scoutToolRefusal('scouts', 'symcc', input, 'scout') })
    }
    // a checker's scouts call is still refused, list too
    checkerRuns.set('ses_chk', { task: 'T-1', worktree: p.wt, end: () => undefined })
    expect(await call('symcc_scouts', 'ses_chk', { action: 'list' })).toEqual({ refused: scoutToolRefusal('scouts', 'symcc', { action: 'list' }, 'checker') })
    checkerRuns.delete('ses_chk')
    // a worker (ses_w2 runs T-1; the engine stopped the board's old ses_worker at its start) has only ask_owner:
    // a lead tool is refused, its question is taken
    // (T-515) through the engine's own one-at-a-time board write (change), not a plain file write: the add above makes
    // the engine start T-2's and T-3's workers, and on a busy machine their board write could land between a load
    // and a writeFile here and undo this patch (the question was then refused: the board no longer named ses_w2)
    await change(host!, b => patchTask(b, 'T-1', { status: 'doing', runs: withAgentStart(find(b, 'T-1')?.runs?.length ? find(b, 'T-1')!.runs : [{ started: at }], 'worker', 'ses_w2', at), live: { session: S.me } }, at))
    workers.set('ses_w2', { task: 'T-1', worktree: p.wt, branch: 'symcc/T-1', since: Date.now() })
    expect(await call('symcc_add', 'ses_w2', { title: 'x', details: 'y', why: 'z', origin_by: 'owner' })).toEqual({ refused: workerToolRefusal('add') })
    const asked = await call('symcc_ask_owner', 'ses_w2', { question: 'Which one?' })
    expect('ok' in asked && !String(asked.ok).startsWith('Refused')).toBe(true)
    // a stopped agent is refused anything, as in Claude Code
    expect(await call('symcc_board', 'ses_old')).toEqual({ refused: stoppedText() })
    // T-525: a session that is none of the above (an agent of an old try the board no longer names, OpenCode's own
    // subagent, the owner's other chat) is refused every lead tool, never taken for the lead
    f.sessions.set('ses_gone', { info: { id: 'ses_gone', location: { directory: p.main } }, looksLeft: 0, messages: [] })
    for (const t of TOOLS()) expect(await call(`symcc_${t.name}`, 'ses_gone', { task: 'T-1', title: 'x', details: 'y', why: 'z', origin_by: 'owner' })).toEqual({ refused: notLeadText(t.name) })
    expect('ok' in (await call('symcc_board', lead))).toBe(true)
    expect((await load(host!)).tasks.length).toBe(3)
    // the question's own follow-ups (the board published, the lead told) settle before the copy ends
    await settle()
    workers.clear()
    await end!()
    await settle()
  } finally {
    await finish(p)
  }
}, TEST_MS)

test('each session is offered only the symcc tools it may call, and the lead gets its guide in the system prompt', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined, sessionId: 'opencode-ctx' } })
    const c = fakeCtx(p.main, f.api)
    const end = await plugin.setup(c.ctx)
    await until(() => S.startupDone === true)
    const lead = f.lead(p.main)
    await c.hooks.prompt!({ sessionID: lead })
    const ask = (sessionID: string) => {
      const e: OcSessionContext = { sessionID, agent: 'build', system: [], tools: Object.fromEntries([...c.tools.keys(), 'edit'].map(n => [n, { description: n, input: {} }])) }
      return Promise.resolve(c.hooks.context!(e)).then(() => e)
    }
    const toLead = await ask(lead)
    expect(Object.keys(toLead.tools)).toEqual([...TOOLS().map(t => `symcc_${t.name}`), 'edit'])
    expect(toLead.system.map(x => x.text)).toEqual([leadGuide(OPENCODE_FEATURES)])
    scoutRuns.set('ses_scout', 'tests')
    const toScout = await ask('ses_scout')
    expect(Object.keys(toScout.tools)).toEqual([...TOOLS().map(t => t.name).filter(n => ['board', 'stats', 'scouts'].includes(n)).map(n => `symcc_${n}`), 'edit'])
    expect(toScout.system).toEqual([])
    workers.set('ses_w2', { task: 'T-1', worktree: p.wt, branch: 'symcc/T-1', since: Date.now() })
    expect(Object.keys((await ask('ses_w2')).tools)).toEqual(['symcc_ask_owner', 'edit'])
    // a session OpenCode made for one of symcc's agents is known by its metadata too
    f.sessions.set('ses_meta', { info: { id: 'ses_meta', metadata: { symcc: 'checker' }, location: { directory: p.main } }, looksLeft: 0, messages: [] })
    // T-895: a checker is offered board and stats only, not scouts (that one is a scout's)
    expect(Object.keys((await ask('ses_meta')).tools)).toEqual(['symcc_board', 'symcc_stats', 'edit'])
    checkerRuns.set('ses_chk2', { task: 'T-1', worktree: p.wt, end: () => undefined })
    expect(Object.keys((await ask('ses_chk2')).tools)).toEqual(['symcc_board', 'symcc_stats', 'edit'])
    checkerRuns.delete('ses_chk2')
    // T-525: a session nothing knows (not the lead, none of symcc's agents on record) is offered none of symcc's tools
    f.sessions.set('ses_gone', { info: { id: 'ses_gone', location: { directory: p.main } }, looksLeft: 0, messages: [] })
    expect(Object.keys((await ask('ses_gone')).tools)).toEqual(['edit'])
    await settle()
    await end!()
    await settle()
  } finally {
    await finish(p)
  }
}, TEST_MS)

test('each slash command is added and runs symcc\'s runCommand: a typed one (TUI or web page, T-888) answers for the owner in a normal chat message the web page shows, a board panel press (PANEL_MARK) in a synthetic note that wakes nobody, /symcc is the text board, and the help has no Claude-panel lines', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    let host: Host | undefined
    const plugin = symccServer({ engine: SYMCC_ENGINE, host: o => (host = opencodeHost(o)), hostOptions: { say: () => undefined, sessionId: 'opencode-cmd' } })
    const c = fakeCtx(p.main, f.api)
    const end = await plugin.setup(c.ctx)
    await until(() => S.startupDone === true)
    expect([...c.commands.keys()]).toEqual([...COMMANDS(OPENCODE_FEATURES).map(x => x.name), 'symcc-answer'])
    // T-901: /symcc-board is the TUI part's own command (opencode/tui.ts), not the engine's; /symcc-tasks lists the tasks
    expect(c.commands.has('symcc-board')).toBe(false)
    expect(c.commands.get('symcc-tasks')!.description).toBe(COMMANDS().find(x => x.name === 'symcc-tasks')!.description)
    // T-517: here /symcc prints the text board; the panel is /symcc-board
    expect(c.commands.get('symcc')!.description).toBe('Show the symcc board as text (the panel: /symcc-board)')
    const lead = f.lead(p.main)
    // (T-515) only the lead's chat counts: the engine starts T-2's worker on its own (at its start, or again after
    // /symcc-enable), and on a busy machine that worker's first prompt (into its own session) landed while a command ran
    const toLead = <T extends { sessionID: string }>(xs: T[]) => xs.filter(x => x.sessionID === lead)
    const run = async (name: string, text = '') => {
      const before = toLead(f.synthetic).length + toLead(f.prompts).length
      await c.commands.get(name)!.execute({ sessionID: lead, prompt: { text }, delivery: 'steer' })
      const synthetic = toLead(f.synthetic)
      const prompts = toLead(f.prompts)
      return { synthetic, prompts, added: synthetic.length + prompts.length - before }
    }
    // every command answers in the lead's chat
    for (const name of c.commands.keys()) expect([name, (await run(name)).added]).toEqual([name, 1])
    // its args are the text after the command, with or without the command in front
    const helpText = (await symccCommand(host!, 'symcc-help', 'commands'))!.text
    // T-888: typed (in the TUI, or the web page, which sends it through the same session command path), the answer
    // for the owner is a normal chat message (the web page shows only a label for a synthetic note), not a synthetic one
    const synthTyped = toLead(f.synthetic).length
    const help = await run('symcc-help', 'commands')
    expect(help.added).toBe(1)
    expect(help.synthetic.length).toBe(synthTyped)
    expect(help.prompts.at(-1)!).toEqual({ sessionID: lead, text: ownerAnswerText('symcc-help', helpText), delivery: 'steer' })
    expect(help.prompts.at(-1)!.text.startsWith(helpText)).toBe(true)
    expect(help.prompts.at(-1)!.text).toContain('no reply needed')
    expect((await run('symcc-help', '/symcc-help commands')).prompts.at(-1)!.text).toBe(ownerAnswerText('symcc-help', helpText))
    // the board panel's press carries PANEL_MARK: the same answer as a quiet synthetic note that doesn't wake the lead
    const promptsPanel = toLead(f.prompts).length
    const pressed = await run('symcc-help', `/symcc-help commands${PANEL_MARK}`)
    expect(pressed.added).toBe(1)
    expect(pressed.prompts.length).toBe(promptsPanel)
    const shown = pressed.synthetic.at(-1)!
    expect(shown).toEqual({ sessionID: lead, text: helpText, delivery: 'steer', resume: false })
    for (const line of ['/symcc opens everything', 'the whole panel', 'On the board: t tasks', 'In the panel nothing needs Esc', 'open the board panel', 'In the settings view']) expect(shown.text).not.toContain(line)
    expect(shown.text).toContain('/symcc shows the board as text')
    // the Claude host's help (every feature on) keeps its panel lines
    expect(manual('commands')).toContain('/symcc opens everything')
    expect(manual('commands')).toContain('In the panel nothing needs Esc')
    expect(manual('commands', OPENCODE_FEATURES)).toBe(shown.text)
    // /symcc: no panel yet, so the text board
    const board = (await run('symcc')).prompts.at(-1)!
    expect(board.text).toContain('T-1')
    expect(board.text).toContain('the answer to /symcc,')
    // a command that isn't only for the owner (the scouts list when no panel opens) is a prompt the lead answers
    const synthBefore = toLead(f.synthetic).length
    // T-934: /symcc-scout with no name lists the scouts (/symcc-scouts is gone)
    const scouts = await run('symcc-scout', PANEL_MARK)
    expect(scouts.added).toBe(1)
    expect(scouts.synthetic.length).toBe(synthBefore)
    expect(scouts.prompts.at(-1)!.delivery).toBe('steer')
    expect(scouts.prompts.at(-1)!.text).not.toContain('no reply needed')
    // T-901: /symcc-tasks prints the grouped list (the board paused, so nothing starts meanwhile); an empty board lists none
    await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify({ ...taskListBoard(Date.now()), mode: 'paused' }))
    expect((await run('symcc-tasks')).prompts.at(-1)!.text).toBe(ownerAnswerText('symcc-tasks', TASK_LIST_TEXT))
    await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify({ ...emptyBoard(), mode: 'paused' }))
    expect((await run('symcc-tasks')).prompts.at(-1)!.text).toBe(ownerAnswerText('symcc-tasks', EMPTY_TASK_LIST_TEXT))
    // T-902: /symcc-status prints the Live tab's sections; NEEDS YOU only while something waits
    const t902 = Date.now()
    await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify({ ...statusBoard(t902), mode: 'paused' }))
    const status = (await run('symcc-status')).prompts.at(-1)!.text
    expect(status.endsWith(ownerAnswerText('symcc-status', '').trimStart())).toBe(true)
    expect(statusHeadings(status).filter(h => h !== 'BRANCHES')).toEqual(['NEEDS YOU', 'TASKS', 'TODAY', 'ORGANIZATIONAL MEMORY'])
    expect(statusSection(status, 'TASKS').some(l => l.startsWith(' ▶ T-2') && l.endsWith('(try 2)'))).toBe(true)
    expect(statusSection(status, 'TASKS').includes('   └─◇ T-4 Write the export  waits')).toBe(true)
    // T-938: TODAY's first row is "Now:" the mode line (this board is paused), then the figures
    expect(statusSection(status, 'TODAY')[0]).toBe(' Now: ⏸ paused · agents 0/3 busy')
    expect(statusSection(status, 'TODAY')[1]!.split('Σ')[0]).toBe(statusTodayLines(statusBoard(t902), t902)[1]!.split('Σ')[0])
    await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify({ ...statusBoard(t902, true), mode: 'paused' }))
    expect(statusHeadings((await run('symcc-status')).prompts.at(-1)!.text).includes('NEEDS YOU')).toBe(false)
    expect(c.commands.has('symcc-status')).toBe(true)
    await settle()
    await end!()
    await settle()
  } finally {
    await finish(p)
  }
}, LONG_TEST_MS)

test('/symcc-disable posts only its answer into the lead\'s chat (T-540): a board update whose moment comes while the disable is being saved is never sent', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    let host: Host | undefined
    // every timer of the host can also be run by the test (fire), at most once; a cancelled one never runs
    const fires = new Map<{ cancel(): void }, () => void>()
    // told when the board write that turns symcc off starts (the moment the off is being saved)
    let onOffWrite: (() => void) | undefined
    const plugin = symccServer({
      engine: SYMCC_ENGINE,
      host: o => {
        const h = opencodeHost(o)
        h.clock = {
          ...nodeClock,
          after(ms, fn) {
            let done = false
            const run = () => {
              if (done) return
              done = true
              fn()
            }
            const t = nodeClock.after(ms, run)
            const handle = {
              cancel: () => {
                done = true
                t.cancel()
              },
            }
            fires.set(handle, run)
            return handle
          },
        }
        const fs = h.fs
        h.fs = {
          ...fs,
          write: async (file, text) => {
            if (onOffWrite && text.includes('"enabled":false')) onOffWrite()
            return fs.write(file, text)
          },
        }
        return (host = h)
      },
      hostOptions: { say: () => undefined, sessionId: 'opencode-off' },
    })
    const c = fakeCtx(p.main, f.api)
    const end = await plugin.setup(c.ctx)
    await until(() => S.startupDone === true)
    const lead = f.lead(p.main)
    await c.hooks.prompt!({ sessionID: lead })
    expect([...leads().values()]).toEqual([lead])
    await settle()
    const toLead = () => [...f.synthetic, ...f.prompts].filter(x => x.sessionID === lead)
    // a report waits for its moment (tellLead's timer), and that moment comes while the off is being saved
    tellLead(host!, 'T-1 "a change in src" is ready for review.')
    const fire = fires.get(S.leadTimer!)
    expect(typeof fire).toBe('function')
    onOffWrite = fire
    const before = toLead().length
    await c.commands.get('symcc-disable')!.execute({ sessionID: lead, prompt: { text: '' }, delivery: 'steer' })
    onOffWrite = undefined
    expect(toLead().slice(before).map(x => x.text.split(':')[0])).toEqual(['symcc is now disabled'])
    // and nothing is left to go later
    expect(S.leadTimer).toBe(null)
    expect(leadQueue).toEqual([])
    fire!()
    await settle()
    expect(toLead().length).toBe(before + 1)
    await end!()
    await settle()
  } finally {
    await finish(p)
  }
}, LONG_TEST_MS)

test('/symcc-disable then /symcc-enable through OpenCode\'s commands in the lead\'s session (T-571, T-578): symcc is enabled again and the answer says so; with the board paused the answer says why nothing starts; /symcc-off and /symcc-on are gone', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined, sessionId: 'opencode-onoff' } })
    const c = fakeCtx(p.main, f.api)
    const end = await plugin.setup(c.ctx)
    await until(() => S.startupDone === true)
    const lead = f.lead(p.main)
    await c.hooks.prompt!({ sessionID: lead })
    expect([...leads().values()]).toEqual([lead])
    const run = async (name: string, text = '') => {
      const before = f.prompts.filter(x => x.sessionID === lead).length
      await c.commands.get(name)!.execute({ sessionID: lead, prompt: { text }, delivery: 'steer' })
      // a "Board update" for the lead (tellLead's 1.5 s timer from an earlier command) may land here on a slow
      // machine; it is not the command's answer
      const answers = f.prompts.filter(x => x.sessionID === lead).slice(before).filter(x => !x.text.includes('] Board update:'))
      expect(answers.length).toBe(1)
      return answers[0]!.text
    }
    expect(c.commands.has('symcc-off')).toBe(false)
    expect(c.commands.has('symcc-on')).toBe(false)
    expect((await run('symcc-disable')).startsWith('symcc is now disabled')).toBe(true)
    expect(JSON.parse(await readFile(`${p.main}/.symcc/board.json`, 'utf8')).enabled).toBe(false)
    const on = await run('symcc-enable')
    expect(on.startsWith('symcc is on in this window, in mode ')).toBe(true)
    expect(on).not.toContain('the board is paused')
    expect(JSON.parse(await readFile(`${p.main}/.symcc/board.json`, 'utf8')).enabled !== false).toBe(true)
    // T-841: turning symcc on writes the one-time "open now" mark for this session; an "already enabled" answer does not
    const mark = async () => parseViewFile(await readFile(`${p.main}/.symcc/view.json`, 'utf8').catch(() => null))?.open_now
    const first = await mark()
    expect(first?.session).toBe(lead)
    await new Promise<void>(r => setTimeout(() => r(), 15))
    expect((await run('symcc-enable')).startsWith('symcc is already enabled, in mode ')).toBe(true)
    expect(await mark()).toEqual(first)
    // T-875: in a window turned off here, plain /symcc-enable turns this window back on (no "here" needed)
    expect((await run('symcc-disable', 'here')).startsWith('symcc is now off in this window')).toBe(true)
    expect(S.offHere).toBe(true)
    expect((await run('symcc-enable')).startsWith('symcc is on in this window, in mode ')).toBe(true)
    expect(S.offHere).toBe(false)
    // the owner's case: the strip says "⏸ paused" because the board is paused (not symcc disabled)
    expect(await run('symcc-mode', 'paused')).toContain('⏸ paused')
    const paused = await run('symcc-enable')
    expect(paused.startsWith('symcc is already enabled, in mode paused: ')).toBe(true)
    expect(paused).toContain('the board is paused, so no work starts; start work with /symcc-mode review or /symcc-mode auto')
    const b = JSON.parse(await readFile(`${p.main}/.symcc/board.json`, 'utf8'))
    expect([b.enabled !== false, b.mode]).toEqual([true, 'paused'])
    await settle()
    await end!()
    await settle()
  } finally {
    await finish(p)
  }
}, LONG_TEST_MS)

test('T-844: /symcc-init through OpenCode\'s commands: a folder with no board stays off and points to /symcc-init; init makes .symcc there (a parent repo is not used), writes the open-now mark for this session once, and a second init changes nothing', async () => {
  reset()
  const base = await realpath(await mkdtemp('/tmp/symcc-oc-init-'))
  try {
    // the parent folder is a git repo; the project folder under it has its own .git
    await git(base, 'init', '-q', '-b', 'main')
    const main = `${base}/proj`
    await mkdir(main, { recursive: true })
    await writeFile(`${main}/a.txt`, 'hi\n')
    await git(main, 'init', '-q', '-b', 'main')
    await git(main, 'add', '-A')
    await git(main, 'commit', '-q', '--no-verify', '-m', 'start')
    const f = fakeSessions()
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined, sessionId: 'opencode-init' } })
    const c = fakeCtx(main, f.api)
    const end = await plugin.setup(c.ctx)
    await until(() => S.startupDone === true)
    const lead = f.lead(main)
    await c.hooks.prompt!({ sessionID: lead })
    const run = async (name: string, text = '') => {
      const before = f.prompts.filter(x => x.sessionID === lead).length
      await c.commands.get(name)!.execute({ sessionID: lead, prompt: { text }, delivery: 'steer' })
      return f.prompts.filter(x => x.sessionID === lead).slice(before).map(x => x.text).join('\n')
    }
    const mark = async () => parseViewFile(await readFile(`${main}/.symcc/view.json`, 'utf8').catch(() => null))?.open_now
    expect(await run('symcc-enable')).toContain('/symcc-init to create one here')
    expect(await readFile(`${main}/.symcc/board.json`, 'utf8').catch(() => 'none')).toBe('none')
    expect(await mark()).toBe(undefined)
    // T-858: nothing is written there while it has no board (no .symcc folder, no view file)
    expect(await lstat(`${main}/.symcc`).then(() => 'there', () => 'none')).toBe('none')
    expect(await run('symcc-init')).toContain('is on in this project')
    expect(JSON.parse(await readFile(`${main}/.symcc/board.json`, 'utf8')).enabled !== false).toBe(true)
    expect(await readFile(`${base}/.symcc/board.json`, 'utf8').catch(() => 'none')).toBe('none')
    const first = await mark()
    expect(first?.session).toBe(lead)
    await new Promise<void>(r => setTimeout(() => r(), 15))
    expect(await run('symcc-init')).toBe(ownerAnswerText('symcc-init', 'symcc is already set up here.'))
    expect(await mark()).toEqual(first)
    await settle()
    await end!()
    await settle()
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}, LONG_TEST_MS)

test('the TUI\'s view file (T-466, R6): each publish writes .symcc/view.json; /symcc-answer answers a waiting task (the change tool, the lead hears of it) and a question on the board', async () => {
  reset()
  const p = await project()
  try {
    const f = fakeSessions()
    const plugin = symccServer({ engine: SYMCC_ENGINE, hostOptions: { say: () => undefined, sessionId: 'opencode-view' } })
    const c = fakeCtx(p.main, f.api)
    const end = await plugin.setup(c.ctx)
    await until(() => S.startupDone === true)
    const view = async () => parseViewFile(await readFile(`${p.main}/.symcc/view.json`, 'utf8').catch(() => null))
    await until(async () => !!(await view()))
    const v1 = (await view())!
    expect(v1.root).toBe(p.main)
    expect(v1.name).toBe('symcc')
    expect(v1.view.tasks.map(t => t.id)).toEqual(['T-1', 'T-2'])
    const lead = f.lead(p.main)
    // the owner's prompt makes it the lead (T-525: only the known lead session gets the lead's tools)
    await c.hooks.prompt!({ sessionID: lead })
    const tool = (name: string, input: Record<string, unknown>) => c.tools.get(name)!.execute(input, { sessionID: lead, agent: 'build', messageID: 'm', id: 'call' })
    await tool('symcc_ask', { task: 'T-2', question: 'Which database?' })
    await until(async () => (await view())!.view.tasks.find(t => t.id === 'T-2')!.status === 'waiting')
    const run = async (text: string) => {
      // (T-888) the board panel sends /symcc-answer, with its PANEL_MARK
      await c.commands.get('symcc-answer')!.execute({ sessionID: lead, prompt: { text: `${text}${PANEL_MARK}` }, delivery: 'steer' })
      return f.synthetic.at(-1)!
    }
    expect((await run('')).text).toContain('/symcc-answer T-5 <answer>')
    // a to-do task: the change tool changes nothing, so the lead gets no "owner answered" note
    meanwhile.splice(0)
    expect((await run('T-1 hello')).text).toContain('nothing changed')
    expect(meanwhile.filter(l => l.includes('The owner answered'))).toEqual([])
    const answered = await run('T-2 postgres')
    expect(answered.resume).toBe(false)
    expect(answered.text).toContain('T-2')
    expect(meanwhile.some(l => l.startsWith('The owner answered T-2 ("postgres")'))).toBe(true)
    await until(async () => (await view())!.view.tasks.find(t => t.id === 'T-2')!.status !== 'waiting')
    expect((await view())!.view.tasks.find(t => t.id === 'T-2')!.history.some(l => l.text.includes('postgres'))).toBe(true)
    // (T-562) the lead's roles and kinds tools publish a change, so the panel's Roles and Kinds pages show it at once
    expect((await view())!.view.roles?.some(r => r.name === 'docsy')).toBe(false)
    expect(JSON.stringify(await tool('symcc_roles', { action: 'add', name: 'docsy', description: 'writes the docs', body: 'Check the docs.' }))).toContain('docsy')
    await until(async () => !!(await view())!.view.roles?.some(r => r.name === 'docsy' && r.description === 'writes the docs'))
    await tool('symcc_kinds', { action: 'off', name: 'feature' })
    await until(async () => !!(await view())!.view.kinds?.some(k => k.name === 'feature' && k.off))
    // a question for the owner, answered from the board panel
    await tool('symcc_question', { action: 'add', text: 'Add a scout?', options: ['yes', 'no'] })
    await until(async () => ((await view())!.view.questions ?? []).length === 1)
    expect((await run('Q-1 yes')).text).toContain('Q-1 answered: yes')
    await until(async () => ((await view())!.view.questions ?? []).length === 0)
    await settle()
    await end!()
    await settle()
  } finally {
    reset()
    await p.done()
  }
}, LONG_TEST_MS)

test('scripts/install-opencode.sh (T-467) links opencode/ into OpenCode\'s plugins folder: for the user (XDG_CONFIG_HOME) or one project (--project), never over a real folder, and --remove takes it away', async () => {
  const base = await realpath(await mkdtemp('/tmp/symcc-oc-install-'))
  try {
    const script = `${PLUGIN_ROOT}/scripts/install-opencode.sh`
    const env = { XDG_CONFIG_HOME: `${base}/config`, HOME: `${base}/home`, PATH: '/usr/bin:/bin' }
    const sh = (...args: string[]) => runCommand(['sh', script, ...args], { env })
    const user = `${base}/config/opencode/plugins/symcc`
    // where the link at `p` leads (only a link counts)
    const linkTo = async (p: string) => ((await lstat(p)).isSymbolicLink() ? realpath(p) : 'not a link')
    expect((await sh()).exitCode).toBe(0)
    expect(await linkTo(user)).toBe(await realpath(`${PLUGIN_ROOT}/opencode`))
    // again: the link is replaced, not doubled
    expect((await sh()).exitCode).toBe(0)
    expect(await linkTo(user)).toBe(await realpath(`${PLUGIN_ROOT}/opencode`))
    await mkdir(`${base}/proj`, { recursive: true })
    expect((await sh('--project', `${base}/proj`)).exitCode).toBe(0)
    expect(await linkTo(`${base}/proj/.opencode/plugins/symcc`)).toBe(await realpath(`${PLUGIN_ROOT}/opencode`))
    expect((await sh('--remove')).exitCode).toBe(0)
    expect(await lstat(user).then(() => 'there', () => 'gone')).toBe('gone')
    // a real folder named symcc there is the owner's: left alone
    await mkdir(user, { recursive: true })
    const r = await sh()
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('is not a link')
    expect((await sh('--project', `${base}/nowhere`)).exitCode).toBe(2)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}, TEST_MS)

test('scripts/install-opencode.sh warns when the opencode on PATH is older than 2.3 (1.x and 2.0-2.2), not for 2.3 or newer, and still links', async () => {
  const base = await realpath(await mkdtemp('/tmp/symcc-oc-install-version-'))
  try {
    const script = `${PLUGIN_ROOT}/scripts/install-opencode.sh`
    await mkdir(`${base}/bin`, { recursive: true })
    // a fake opencode whose --version prints `version`
    const run = async (version: string) => {
      await writeFile(`${base}/bin/opencode`, `#!/bin/sh\necho '${version}'\n`)
      expect((await runCommand(['chmod', '755', `${base}/bin/opencode`])).exitCode).toBe(0)
      const r = await runCommand(['sh', script], { env: { XDG_CONFIG_HOME: `${base}/config`, HOME: `${base}/home`, PATH: `${base}/bin:/usr/bin:/bin` } })
      expect(r.exitCode).toBe(0)
      expect((await lstat(`${base}/config/opencode/plugins/symcc`)).isSymbolicLink()).toBe(true)
      return r.stderr
    }
    const warning = 'symcc needs OpenCode 2.3 or newer'
    expect(await run('opencode v2.1.0')).toContain('is version 2.1; ' + warning)
    expect(await run('1.19.4')).toContain('is version 1.19; ' + warning)
    expect(await run('2.2.9')).toContain(warning)
    expect(await run('v2.0')).toContain(warning)
    expect(await run('v2.3.0')).not.toContain(warning)
    expect(await run('2.3.0')).not.toContain(warning)
    expect(await run('2.3.2')).not.toContain(warning)
    expect(await run('2.10.0')).not.toContain(warning)
    expect(await run('3.0.1')).not.toContain(warning)
    // a version it can't read: no warning (nothing to compare)
    expect(await run('unknown')).not.toContain(warning)
    expect(await run('')).not.toContain(warning)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}, TEST_MS)

test('the repo-root package.json (T-497) lets `opencode plugin add github:kourgeorge/symcc` find the plugin: its exports point at opencode/server.ts and opencode/tui.ts, both there, and it installs nothing', async () => {
  const pkg = JSON.parse(await readFile(`${PLUGIN_ROOT}/package.json`, 'utf8')) as Record<string, unknown>
  expect(pkg.name).toBe('symcc')
  expect(pkg.private).toBe(true)
  expect(pkg.type).toBe('module')
  expect(pkg.exports).toEqual({ './server': './opencode/server.ts', './tui': './opencode/tui.ts' })
  for (const file of ['opencode/server.ts', 'opencode/tui.ts']) expect((await lstat(`${PLUGIN_ROOT}/${file}`)).isFile()).toBe(true)
  // no packages and no install scripts: adding it never downloads or runs anything
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'scripts']) expect(key in pkg).toBe(false)
})

test('T-900: on OpenCode the built-in writer role loads with web and code: false; its prose-only change merges with no test command run, a .ts or roles/*.md change is refused at the scope check, and a normal role\'s docs change still runs the tests', async () => {
  reset()
  const p = await project()
  try {
    const host = opencodeHost({ dir: p.main, say: () => undefined, sessionId: 'opencode-prose' })
    S.root = p.main
    // the real roles/writer.md of this plugin copy
    const writer = (await loadRoles(host)).find(r => r.name === 'writer')!
    expect([writer.tools, writer.code]).toEqual([['web'], false])
    expect(sessionPrompt({ kind: 'worker', prompt: 'Task T-1', prose: true }, 'symcc')).toContain('check your facts and links')
    expect(sessionPrompt({ kind: 'worker', prompt: 'Task T-1' }, 'symcc')).toContain('run the tests you were given')
    // a test command that fails if it ever runs
    const boardOf = async (role: string, files: string[]) => {
      const b = { ...JSON.parse(await readFile(`${p.main}/.symcc/board.json`, 'utf8')), test_commands: ['exit 7'] }
      const b2 = patchTask(b, 'T-1', { role, files, attempts: 1 }, '2026-11-18T00:00:00.000Z')
      await writeFile(`${p.main}/.symcc/board.json`, JSON.stringify(b2))
      return [b2, find(b2, 'T-1')!] as const
    }
    // a .ts file next to a note: refused, nothing merged, and the tests never ran
    await mkdir(`${p.wt}/docs`, { recursive: true })
    await writeFile(`${p.wt}/docs/plan.md`, '# Plan\n')
    await writeFile(`${p.wt}/src/b.ts`, 'export const b = 2\n')
    let [b, t] = await boardOf('writer', ['docs/', 'src/', 'roles/'])
    let r = await checkAndMerge(host, t, p.wt, b, 'finish', [])
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.reason).toBe('scope')
    expect(r.detail).toContain('role writer is prose only (code: false)')
    expect(r.detail).toContain('src/b.ts')
    // an agent-instruction .md (roles/*.md) is code too
    await mkdir(`${p.wt}/roles`, { recursive: true })
    await writeFile(`${p.wt}/roles/x.md`, '---\ndescription: x\n---\n')
    ;[b, t] = await boardOf('writer', ['docs/', 'src/', 'roles/'])
    r = await checkAndMerge(host, t, p.wt, b, 'finish', [])
    expect(r.ok ? '' : r.reason).toBe('scope')
    expect(r.detail).toContain('roles/x.md')
    // only the note left (the refused files were undone on the branch): it merges with no test run
    await writeFile(`${p.wt}/docs/plan.md`, '# Plan\n\nMore.\n')
    ;[b, t] = await boardOf('writer', ['docs/'])
    r = await checkAndMerge(host, t, p.wt, b, 'finish', [])
    expect(r.detail).toContain('; tests skipped: only prose changed')
    expect(r.ok && 'merged' in r && !!r.merged).toBe(true)
    expect(await readFile(`${p.main}/docs/plan.md`, 'utf8')).toBe('# Plan\n\nMore.\n')
    // a normal role's docs-only change runs the (failing) test command
    await writeFile(`${p.wt}/docs/plan.md`, '# Plan\n\nEven more.\n')
    ;[b, t] = await boardOf('general', ['docs/'])
    r = await checkAndMerge(host, t, p.wt, b, 'finish', [])
    expect(r.ok ? '' : r.reason).toBe('tests')
  } finally {
    await finish(p)
  }
}, TEST_MS)
