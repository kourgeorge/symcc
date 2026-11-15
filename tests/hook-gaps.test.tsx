// Hooks of register.tsx that no other test reaches (T-168): a stopped worker or scout is refused every tool,
// the /symcc-diff, /symcc-approve and /symcc-reject commands, and which prompts count as the owner's request.
// The plugin runs as loaded by the test kit; what lies beneath it (files, git, agents) is the fake world below.
// The plugin is loaded fresh for every test, so its state (stopped agents, the owner's last prompt) starts empty.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { type Board, LEAD_BEAT_MS, addTask, emptyBoard, patchTask } from '../hooks/board'

const T0 = 1_800_000_000_000
const ISO = '2026-11-13T00:00:00.000Z'
const BOARD = '/.symcc/board.json'
const DIFF = ['diff --git a/src/b.md b/src/b.md', '--- a/src/b.md', '+++ b/src/b.md', '@@ -1 +1 @@', '-old line', '+new line'].join('\n')

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })

/**
 * Files in memory (keyed from "/.symcc/" on, so the project folder does not matter), a small fake git and
 * agent list, and what reached the bottom: tool calls (`tools`), prompts (`prompts`), messages to agents (`sent`).
 * `agents` are listed as running until a message reaches them (then completed). `state.gitFails` makes `git diff` fail.
 */
function world(on: On, o: { agents?: { id: string; type: string }[] } = {}) {
  const files = new Map<string, string>()
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const tools: string[] = []
  const prompts: string[] = []
  const sent: string[] = []
  const ended = new Set<string>()
  const toasts: string[] = []
  const spawned: string[] = []
  const state = { gitFails: false }

  function git(args: string[]): Res {
    // a repo with a commit, so work can start
    if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return ok('true\n')
    if (args[0] !== 'diff') return ok()
    if (state.gitFails) return { exitCode: 128, stdout: '', stderr: 'fatal: bad object symcc/T-1' }
    if (args.some(a => a.startsWith('--stat'))) return ok(' src/b.md | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n')
    // the diff of one file: only src/b.md, as git was asked for it (no leading ./)
    const i = args.indexOf('--')
    return ok(i < 0 || args[i + 1] === 'src/b.md' ? `${DIFF}\n` : `asked for ${args[i + 1]}\n`)
  }

  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', (_, e) => (files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (files.set(key(e.path), (e as unknown as { text: string }).text), { value: undefined }))
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  // the workers asked for (by name). This hook only sees a spawn about to happen; nothing in the test kit
  // really starts an agent, so each start then fails ("no implementation for agent.spawn").
  on('agent.spawn', (_, e) => (spawned.push(String((e as unknown as { name?: string }).name)), { model: 'sonnet' }) as never)
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git') return { value: git(rest) }
    // the board's lock and its save through a temp file (see store.ts)
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: { exitCode: 1, stdout: '', stderr: 'File exists' } }
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
  on('tool.call', (_, e) => (tools.push(e.tool), { result: 'ran' }))
  on('prompt.submit', (_, e) => (prompts.push(e.text), { text: e.text }) as never)
  on('command.run', () => ({ text: 'not a symcc command' }))
  on('agent.list', () => ({ value: (o.agents ?? []).map(a => ({ ...a, status: ended.has(a.id) ? 'completed' : 'running' })) }) as never)
  on('session.send', (_, e) => {
    const to = (e as unknown as { to: string | { agentId: string } }).to
    const id = typeof to === 'string' ? to : to.agentId
    sent.push(id)
    ended.add(id)
    return { isDelivered: true } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  return { files, tools, prompts, sent, toasts, spawned, state, clock, board: () => JSON.parse(files.get(BOARD)!) as Board }
}

type Eng = Parameters<Parameters<typeof test>[1]>[0]

/** A board (mode review) with T-1 in review (files src/, branch symcc/T-1) and T-2 to do. */
function reviewBoard(): Board {
  const [b1] = addTask({ ...emptyBoard(), mode: 'review' }, { origin: { why: 'a test' }, title: 'Change b', files: ['src/'], merge_into: 'main' }, ISO)
  const [b2] = addTask(b1, { origin: { why: 'a test' }, title: 'Later', files: ['docs/'], merge_into: 'main' }, ISO)
  return patchTask(b2, 'T-1', { status: 'review', attempts: 1, branch: 'symcc/T-1' }, ISO)
}

const run = ($: Eng, command: string, args: string) => $.command.run({ command, args, origin: { kind: 'composer' }, presentation: 'text' } as never) as Promise<{ text?: string }>

// ---------------- a stopped worker or scout is refused ----------------

test('a scout the plugin stopped is refused a Write with the "stopped this agent" text, and the call never runs', async ($, on) => {
  const w = world(on, { agents: [{ id: 'a1', type: 'symcc:scout' }] })
  // at session start the plugin stops scouts it does not know (left from before a reload): a1 is halted
  await $.session.start({ cwd: '/repo' } as never)
  expect(w.sent).toEqual(['a1'])
  const r = (await $.tool.call({ tool: 'Write', file_path: '/repo/src/x.ts', content: 'x', agentId: 'a1' } as never)) as { deny?: string }
  expect(r.deny).toBe('symcc stopped this agent. Do nothing more; answer "stopped" and end.')
  expect(w.tools).toEqual([])
})

test("a stopped agent is refused every tool, the plugin's own board tool too", async ($, on) => {
  const w = world(on, { agents: [{ id: 'a1', type: 'symcc:scout' }] })
  await $.session.start({ cwd: '/repo' } as never)
  const bash = (await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' } as never)) as { deny?: string }
  const board = (await $.tool.call({ tool: 'mcp__symcc__board', agentId: 'a1' } as never)) as { deny?: string }
  expect(bash.deny).toContain('symcc stopped this agent')
  expect(board.deny).toContain('symcc stopped this agent')
  expect(w.tools).toEqual([])
})

test('an agent that was not stopped, and the lead (no agentId), still get their tool calls through', async ($, on) => {
  const w = world(on, { agents: [{ id: 'a1', type: 'symcc:scout' }] })
  await $.session.start({ cwd: '/repo' } as never)
  const other = (await $.tool.call({ tool: 'Write', file_path: '/repo/src/x.ts', content: 'x', agentId: 'a2' } as never)) as { deny?: string; result?: string }
  const lead = (await $.tool.call({ tool: 'Write', file_path: '/repo/src/y.ts', content: 'y' } as never)) as { deny?: string; result?: string }
  expect(other.deny).toBeUndefined()
  expect(lead.deny).toBeUndefined()
  expect(other.result).toBe('ran')
  expect(lead.result).toBe('ran')
  expect(w.tools).toEqual(['Write', 'Write'])
})

// ---------------- /symcc-diff, /symcc-approve, /symcc-reject ----------------

test('/symcc-diff T-1 ./src/b.md shows the diff of that file (the leading ./ is dropped)', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  // the session start gives the plugin its project folder, where git runs
  await $.session.start({ cwd: '/repo' } as never)
  const r = await run($, 'symcc-diff', 'T-1 ./src/b.md')
  expect(r.text).toBe(DIFF)
})

test('/symcc-diff T-1 other.ts names the file it did not change and lists the ones it did', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  await $.session.start({ cwd: '/repo' } as never)
  const r = await run($, 'symcc-diff', 'T-1 other.ts')
  expect(r.text).toBe('T-1 did not change other.ts. Changed: src/b.md')
})

test("/symcc-diff when git diff fails says it could not read the changes, with git's error", async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  await $.session.start({ cwd: '/repo' } as never)
  w.state.gitFails = true
  const r = await run($, 'symcc-diff', 'T-1 src/b.md')
  expect(r.text?.startsWith('Could not read the changes of T-1:')).toBe(true)
  expect(r.text).toContain('fatal: bad object symcc/T-1')
})

test('/symcc-diff of a task that is not in review is refused', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  const r = await run($, 'symcc-diff', 'T-2')
  expect(r.text).toBe('T-2 is not ready for review (it is to do); /symcc-diff shows the changes of a task in review.')
})

test('/symcc-approve T-2 with T-2 to do is refused and the board is not changed', async ($, on) => {
  const w = world(on)
  const before = JSON.stringify(reviewBoard())
  w.files.set(BOARD, before)
  const r = await run($, 'symcc-approve', 'T-2')
  expect(r.text).toBe('T-2 is not ready for review (it is to do).')
  expect(w.files.get(BOARD)).toBe(before)
})

test('/symcc-approve of a task that is not on the board says so', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  const r = await run($, 'symcc-approve', 'T-9')
  expect(r.text).toBe('T-9 is not on the board.')
})

test('/symcc-reject T-1 too big sends T-1 back to "todo" with the reason', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  const r = await run($, 'symcc-reject', 'T-1 too big')
  expect(r.text).toBe('T-1 rejected: back to "todo"; a fresh worker picks it up with the reason')
  const t = w.board().tasks.find(x => x.id === 'T-1')!
  expect(t.status).toBe('todo')
  expect(t.note).toBe('rejected: too big')
})

test('/symcc-reject puts "The owner rejected T-1" in the lead\'s notes, sent with the next board update', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  await run($, 'symcc-reject', 'T-1 too big')
  // the owner's own action waits for the next update sent for a real reason: a broken board.json is one
  w.files.set(BOARD, '{ not json')
  const r = await run($, 'symcc-diff', 'T-1')
  expect(r.text).toContain("board.json can't be read")
  await w.clock.advance(2000)
  const update = w.prompts.find(p => p.startsWith('[symcc] Board update:')) ?? ''
  expect(update).toContain('Meanwhile the owner (nothing to answer):\n- The owner rejected T-1 ("too big"): T-1 rejected: back to "todo"')
})

// ---------------- commands with a broken board.json ----------------

test('/symcc-help still shows the manual when board.json is broken', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, '{ not json')
  const r = await run($, 'symcc-help', '')
  expect(r.text).toContain('/symcc-')
  expect(r.text).not.toContain("can't be read")
  expect(w.files.get(BOARD)).toBe('{ not json')
})

test('/symcc-off and /symcc-approve T-1 answer that board.json can\'t be read, and leave it as it was', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, '{ not json')
  const off = await run($, 'symcc-off', '')
  expect(off.text).toContain("board.json can't be read")
  const ok = await run($, 'symcc-approve', 'T-1')
  expect(ok.text).toContain("board.json can't be read")
  expect(w.files.get(BOARD)).toBe('{ not json')
})

// ---------------- symcc's own agent types are hidden from the main chat ----------------

test("symcc's worker and scout types are not offered in the main chat; other agents pass on unchanged", async ($, on) => {
  world(on)
  on('agent.offer', () => ({ isOffered: true, from: 'below' }) as never)
  for (const agent of ['symcc:worker', 'symcc:worker-web', 'symcc:scout']) expect(await $.agent.offer({ agent } as never)).toEqual({ isOffered: false })
  expect(await $.agent.offer({ agent: 'general-purpose' } as never)).toEqual({ isOffered: true, from: 'below' })
})

// ---------------- which prompts count as the owner's request ----------------

const say = ($: Eng, text: string, more: Record<string, unknown> = {}) => $.prompt.submit({ text, origin: { kind: 'composer' }, ...more } as never)

/** The lead adds a task from the owner's request; returns the evidence the plugin put next to it. */
async function ownerAdd($: Eng, w: ReturnType<typeof world>, request: string): Promise<string> {
  const r = (await $.tool.call({ tool: 'mcp__symcc__add', title: `Do: ${request.slice(0, 40)}`, why: 'the owner asked', origin_by: 'owner', request, files: ['src/'] } as never)) as { result?: string }
  expect(String(r.result ?? '')).not.toMatch(/^error/)
  const tasks = w.board().tasks
  return String(tasks[tasks.length - 1]!.origin?.evidence ?? '')
}

test("a composer prompt counts as the owner's request, trimmed: the next owner task quotes it", async ($, on) => {
  const w = world(on)
  await say($, '  fix the login bug  ')
  const ev = await ownerAdd($, w, 'fix the login bug')
  expect(ev).toContain('“fix the login bug”')
  expect(ev).not.toContain('not word for word')
})

test("a prompt from the phone or web bridge counts as the owner's request too", async ($, on) => {
  const w = world(on)
  await say($, 'add dark mode', { origin: { kind: 'bridge' } })
  expect(await ownerAdd($, w, 'add dark mode')).toContain('“add dark mode”')
})

test('with no owner prompt seen, an owner task says so', async ($, on) => {
  const w = world(on)
  expect(await ownerAdd($, w, 'fix the login bug')).toBe('no owner prompt was seen by the plugin in this session')
})

test("a slash command, a hidden (isMeta) prompt, another origin and a spaces-only prompt do not replace the owner's request", async ($, on) => {
  const w = world(on)
  await say($, 'fix the login bug')
  await say($, '/symcc-stats', { command: { name: 'symcc-stats', args: '' } })
  await say($, 'a hidden reminder', { isMeta: true })
  await say($, 'words from another plugin', { origin: { kind: 'plugin', name: 'other' } })
  await say($, 'a scheduled prompt', { origin: { kind: 'scheduled-trigger' } })
  await say($, '    ')
  const ev = await ownerAdd($, w, 'fix the login bug')
  expect(ev).toContain('“fix the login bug”')
  for (const not of ['symcc-stats', 'hidden reminder', 'another plugin', 'scheduled prompt']) expect(ev).not.toContain(not)
})

test('a 3000-character prompt is kept as its first 2000 characters', async ($, on) => {
  const w = world(on)
  // MARKONE ends before character 2000, MARKTWO starts after it
  const text = `${'a'.repeat(1980)} MARKONE ${'b'.repeat(500)} MARKTWO `.padEnd(3000, 'c')
  expect(text.length).toBe(3000)
  await say($, text)
  // the request is checked against the kept text: inside it, no note; past the cut, "not word for word"
  expect(await ownerAdd($, w, 'MARKONE')).not.toContain('not word for word')
  expect(await ownerAdd($, w, 'MARKTWO')).toContain('(the quoted request is not word for word in it)')
})

// ---------------- a broken board.json at session start ----------------

test("session.start with a board.json that isn't JSON finishes quietly, tells the owner once and leaves the file alone; once fixed, the heartbeat asks for a worker", async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, '{ not json')
  // it does not throw (S.startupDone, inside the loaded plugin, is shown true below: pump runs, and it returns early while it is false)
  await $.session.start({ cwd: '/repo' } as never)
  expect([...w.files.keys()].filter(k => k.startsWith(`${BOARD}.broken-`)).length).toBe(1)
  expect(w.toasts.filter(t => /board\.json can't be read/.test(t)).length).toBe(1)
  expect(w.files.get(BOARD)).toBe('{ not json')
  expect(w.spawned).toEqual([])
  // fixed: the next heartbeat pumps, and a worker is asked for the task to do
  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Change b', files: ['src/'], merge_into: 'main' }, ISO)
  w.files.set(BOARD, JSON.stringify(b))
  await w.clock.advance(LEAD_BEAT_MS)
  expect(w.spawned.length).toBe(1)
  expect(w.spawned[0]).toContain('T-1')
})

// ---------------- /symcc-mode back on after off (T-213) ----------------

/** A board in auto mode with T-1 "doing" for this session, worked on by the live worker a1. */
function doingBoard(): Board {
  const [b] = addTask({ ...emptyBoard(), mode: 'auto' }, { origin: { why: 'a test' }, title: 'Change b', files: ['src/'], merge_into: 'main' }, ISO)
  return patchTask(b, 'T-1', { status: 'doing', attempts: 1, session: 'me', agent: 'a1', branch: 'symcc/T-1', runs: [{ started: ISO }] }, ISO)
}

test('/symcc-mode off then review: work starts again, T-1 gets a worker, and the lead hears the owner set review', async ($, on) => {
  const w = world(on, { agents: [{ id: 'a1', type: 'symcc:worker' }] })
  w.files.set(BOARD, JSON.stringify(doingBoard()))
  await $.session.start({ cwd: '/repo' } as never)
  const off = await run($, 'symcc-mode', 'off')
  expect(off.text).not.toContain('work starts again')
  expect(w.sent).toContain('a1')
  expect(w.board().tasks[0]!.status).toBe('todo')
  const before = w.spawned.length
  const review = await run($, 'symcc-mode', 'review')
  expect(review.text).toContain('work starts again')
  await w.clock.advance(2000)
  expect(w.spawned.slice(before).some(n => n.includes('T-1'))).toBe(true)
  const update = w.prompts.find(p => p.startsWith('[symcc] Board update:')) ?? ''
  expect(update).toContain('The owner set the board mode to review')
})

test('/symcc-mode auto with a task in review says it still waits for approve or reject, and it stays in review', async ($, on) => {
  const w = world(on)
  w.files.set(BOARD, JSON.stringify(reviewBoard()))
  await $.session.start({ cwd: '/repo' } as never)
  const r = await run($, 'symcc-mode', 'auto')
  expect(r.text).toContain('1 already in review still waits for approve or reject')
  expect(r.text).not.toContain('work starts again')
  await w.clock.advance(2000)
  expect(w.board().tasks.find(t => t.id === 'T-1')!.status).toBe('review')
})
