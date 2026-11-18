// symcc's OpenCode plugin (T-462), run with bun test (scripts/test-opencode-host.sh), not `claude plugin test`: that
// runtime has no files or processes. A fake OpenCode ctx (only the hooks symcc registers) on a scratch git repo with a
// worker's worktree and a board: one copy per folder runs the engine (the main folder's), a second copy for the same
// real folder and a worktree's copy only guard; a worker's edit outside its files is refused through
// permission.evaluate (and the tool backstop), an allowed one passes, a shell write into the owner's copy is refused,
// and a stopped agent is refused anything. Also: hooks/opencode/ never imports Claude Code or hooks/claude/.
import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { addTask, emptyBoard, patchTask, blockedEditText } from '../../board'
import { S, startS, timers, workers, stopped, boardAgents, starting, queuedWorkers, scoutRuns, checkerRuns } from '../../app/state'
import { resetStore } from '../../app/store'
import { stoppedText } from '../../app/ask'
import { runCommand } from '../../../hosts/node/host'
import type { OcContext, OcPermissionEvaluation, OcToolBefore } from '../ctx'
import { symccServer, owners, SYMCC_ENGINE, type CopyRole, type Engine } from '../plugin'
import { PLUGIN_ROOT } from '../host'

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
}

/** A fake OpenCode ctx for folder `dir`: it keeps the hooks the plugin registers, and counts their disposals. */
function fakeCtx(dir: string) {
  const hooks: { evaluate?: (e: OcPermissionEvaluation) => Promise<void> | void; before?: (e: OcToolBefore) => Promise<void> | void } = {}
  let disposed = 0
  const reg = { dispose: async () => void disposed++ }
  const ctx: OcContext = {
    location: { directory: dir },
    permission: { hook: async (_name, fn) => ((hooks.evaluate = fn), reg) },
    tool: { hook: async (_name, fn) => ((hooks.before = fn), reg) },
  }
  return { ctx, hooks, disposed: () => disposed }
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
    expect(a.disposed()).toBe(2)
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
