// The checker setting (T-349): with it on, a change whose tests passed is checked by a fresh checker before it merges.
// Like merge.test.ts, these run the real finish, merge and board code against a small scripted git and in-memory files.
import { expect } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { type Board, addTask, emptyBoard, patchTask, find, checkerVerdict, checkerOutput, isCheckerOutput, docsOnly, checkerOn, applySettings, parseSettingValue, settingValue, finishedNote, bashOutsideText, gitWriteText, untestedChange } from '../hooks/board'
import { S, leadQueue, meanwhile, workers, checkerRuns, stopped } from '../hooks/plugin/state'
import { workerFinished, WORKER_PROMPT, setBoardMode, checkingNow, stopAsked, check, stopOrphans, stoppedHandBack } from '../hooks/plugin/workers'
import { checkerFinished } from '../hooks/plugin/checker'
import { checkEdit } from '../hooks/plugin/ask'
import { load, saveBoard } from '../hooks/plugin/store'
import { runTool } from '../hooks/plugin/tools'
import { test, resetPlugin } from './reset'
import { agentFinished } from '../hooks/app/symcc'
import { fakeHost, memoryFs } from './fake-host'
import type { Host, HostAgent } from '../hooks/host'
import { drainStarts, queuedStarts } from '../hooks/plugin/starts'
import { withStarts } from './starts'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const ISO = '2026-11-13T00:00:00.000Z'
const [M1, H0, H1] = ['a1', 'b0', 'b1'].map(x => x.repeat(20)) as [string, string, string]

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

/** In-memory files, a small fake git (main, the worker's HEAD, the changed files) and a fake agent spawn that records each checker started. */
function world(changed: string[] = ['src/a.ts', 'src/a.test.ts']) {
  const git = { main: M1, head: H0, dirty: true, detached: false, checkoutFails: false }
  const files = new Map<string, string>()
  const calls: string[] = []
  function runGit(a0: string[]): Res {
    const a = a0.filter((x, i) => x !== '-c' && a0[i - 1] !== '-c')
    const s = a.join(' ')
    if (a[0] === 'commit') {
      if (!git.dirty) return fail('nothing to commit')
      git.dirty = false
      git.head = H1
      return ok()
    }
    if (s === 'rev-parse -q --verify HEAD' || s === 'rev-parse HEAD') return ok(git.head)
    if (s === 'rev-parse refs/heads/main') return ok(git.main)
    if (s === 'symbolic-ref -q HEAD') return git.detached ? fail() : ok('refs/heads/symcc/T-1')
    if (s === 'rev-parse -q --verify refs/heads/symcc/T-1') return ok(git.head)
    if (a[0] === 'checkout' && a.includes('-B')) {
      if (git.checkoutFails) return fail('cannot checkout')
      git.head = a.at(-1)!
      git.detached = false
      return ok()
    }
    if (a[0] === 'merge-base' && a[1] === '--is-ancestor') return ok()
    if (a[0] === 'merge-base') return ok(git.main)
    if (a[0] === 'diff' && a.includes('--name-only')) return ok(changed.join('\0'))
    if (a[0] === 'diff') return ok(`diff --git a/${changed[0]} b/${changed[0]}\n+the new line`)
    if (s === 'symbolic-ref --short -q HEAD') return ok('other')
    if (a[0] === 'update-ref') {
      const [, , , ref, to, from] = a
      if (ref !== 'refs/heads/main' || git.main !== from) return fail('cannot lock ref')
      git.main = to!
      return ok()
    }
    return ok()
  }
  const { host, spawns, sent: sends } = fakeHost({
    run: async (argv, o = {}) => {
      const [cmd, ...rest] = argv
      calls.push(argv.join(' '))
      if (cmd === 'git') return runGit(rest)
      if (cmd === 'ln') {
        if (files.has(rest[1]!)) return fail('File exists')
        files.set(rest[1]!, files.get(rest[0]!)!)
        return ok()
      }
      if (cmd === 'mv') {
        if (!files.has(rest[1]!)) return fail('No such file')
        files.set(rest[2]!, files.get(rest[1]!)!)
        files.delete(rest[1]!)
        return ok()
      }
      if (cmd === 'rm') {
        for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(p)
        return ok()
      }
      void o
      return ok()
    },
    fs: memoryFs(files),
    agents: { spawn: async o => (spawns.push(o), { agentId: `chk${spawns.length}` }) },
  })
  S.root = ROOT
  S.leadTimer = null
  S.writing = Promise.resolve()
  S.driving = false
  S.startupDone = false
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  current = host
  return { $: host, git, calls, spawns, sends }
}

/** The last world's host: until and turns start the queued agents with it, as a turn's start or end does (T-391). */
let current: Host | null = null

/** A board with task T-1 (files src/) "doing" on try 1, with the checker setting `checker`. */
function boardWith(checker: boolean, extra: Partial<SymccTask> = {}, over: Partial<Board> = {}): Board {
  const [b, t] = addTask({ ...emptyBoard(), mode: 'auto', test_commands: ['npm test'], checker, ...over }, { origin: { why: 'a test' }, title: 'Do it', details: 'Make a do it.\nDone when: a test shows it.', files: ['src/'] }, ISO)
  return patchTask(b, t.id, { status: 'doing', attempts: 1, runs: [{ started: ISO }], ...extra }, ISO)
}

/** Waits (a few rounds of pending work, never the clock) until `f` holds. */
async function until(f: () => boolean) {
  for (let i = 0; i < 20_000 && !f(); i++) await turn()
  if (!f()) throw new Error('it never happened')
}

/** One round of pending work; queued agents start first, as at a turn's start or end (see tests/starts.ts). */
async function turn() {
  if (current && queuedStarts()) await drainStarts(current)
  await Promise.resolve()
}

/** `n` rounds of pending work (see turn). */
async function turns(n: number) {
  for (let i = 0; i < n; i++) await turn()
}

/** T-1's worker (agent ag1) hands back; `checker` answers the checker (when one starts) and may look at the board meanwhile. */
async function finish(w: ReturnType<typeof world>, checker?: (agentId: string) => Promise<void>) {
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const done = withStarts(w.$, workerFinished(w.$, 'ag1', 'made the change'))
  if (checker) {
    await until(() => checkerRuns.size > 0)
    await checker([...checkerRuns.keys()][0]!)
  }
  await done
  return find(await load(w.$), 'T-1')!
}

// ---------------- the setting ----------------

test('the checker setting is off by default; on/off (or true/false) set it, and anything else is refused', async () => {
  expect(checkerOn(emptyBoard())).toBe(false)
  expect(settingValue(emptyBoard(), 'checker')).toBe('off')
  expect(parseSettingValue('checker', 'on')).toEqual({ ok: true, input: { checker: true } })
  expect(parseSettingValue('checker', 'maybe')).toEqual({ ok: false, message: 'checker must be on or off' })
  const on = applySettings(emptyBoard(), { checker: 'on' })
  expect(on.board.checker).toBe(true)
  expect(settingValue(on.board, 'checker')).toBe('on')
  expect(applySettings(on.board, { checker: false }).board.checker).toBe(false)
  const w = world()
  await saveBoard(w.$, boardWith(false))
  expect(await runTool(w.$, 'settings', { checker: 'on' })).toBe('a checker tries to break each change before it merges')
  expect((await load(w.$)).checker).toBe(true)
  expect(await runTool(w.$, 'settings', { checker: 'sometimes' })).toBe('checker must be "off" or "on" (got "sometimes")')
})

test('a verdict is OK only when the last line says OK on its own; anything else is the problems report; empty is none', () => {
  expect(checkerVerdict('OK')).toEqual({ ok: true })
  expect(checkerVerdict('I ran the tests and tried empty input.\n\n**OK**')).toEqual({ ok: true })
  expect(checkerVerdict('src/a.ts:3 empty input throws: run doIt("")')).toEqual({ ok: false, report: 'src/a.ts:3 empty input throws: run doIt("")' })
  expect(checkerVerdict('OK, but src/a.ts:3 breaks on ""')).toEqual({ ok: false, report: 'OK, but src/a.ts:3 breaks on ""' })
  expect(checkerVerdict('  ')).toBe(null)
  expect(isCheckerOutput(checkerOutput('x'))).toBe(true)
  expect(isCheckerOutput('$ npm test (exit 1)')).toBe(false)
  expect(docsOnly(['README.md', 'docs/guide.md'])).toBe(true)
  expect(docsOnly(['README.md', 'src/a.ts'])).toBe(false)
  expect(docsOnly([])).toBe(false)
  expect(finishedNote({ ok: false, detail: 'x', checker: true, testOutput: 'y' })).toBe('checker found problems')
})

test('docs-only, for the checker, is only prose and media: agent instructions, .mdx and config files are checked, even under docs/', () => {
  for (const f of ['README.md', 'docs/guide.md', 'docs/img/x.png', 'CHANGELOG.md', 'LICENSE', 'README', 'docs/demo.mp4', 'assets/font.woff2', 'roles/logo.svg'])
    expect([f, docsOnly([f])]).toEqual([f, true])
  for (const f of ['roles/checker.md', 'kinds/bug.md', 'CLAUDE.md', 'sub/CLAUDE.md', 'AGENTS.md', '.claude/agents/x.md', '.claude/commands/go.md', '.symcc/roles/mine.md', 'skills/a/SKILL.md', 'SKILL.md', 'src/page.mdx', 'docs/page.mdx', 'docs/package.json', 'docs/Makefile', 'docs/openapi.yaml', 'docs/.github/workflows/ci.yml', 'docs/netlify.toml', 'docs/build.ts', 'license.ts',
    'examples/scouts/gaps-bot.md', 'agents/helper.md', 'commands/go.md', 'GEMINI.md', 'CONVENTIONS.md', '.github/copilot-instructions.md',
    '.github/instructions/ts.instructions.md', '.github/instructions/x.md', 'src/ts.instructions.md', '.cursor/rules/x.md', '.cursor/rules/x.mdc',
    '.cursorrules', '.windsurf/rules/a.md', '.windsurfrules', '.clinerules', '.clinerules/a.md', '.opencode/agent/x.md', 'sub/examples/scouts/a.md'])
    expect([f, docsOnly([f])]).toEqual([f, false])
  expect(docsOnly(['README.md', 'roles/tester.md'])).toBe(false)
  for (const f of ['examples/other.md', 'docs/scouts/x.md', 'docs/instructions/x.md'])
    expect([f, docsOnly([f])]).toEqual([f, true])
  // tests_with_changes keeps the wider rule: a role file or docs config is not code that needs a test
  expect(untestedChange(['roles/tester.md', 'docs/package.json', 'src/page.mdx'])).toBe(false)
  expect(untestedChange(['src/a.ts'])).toBe(true)
})

// ---------------- finishing a change ----------------

test('with the checker off nothing changes: a passing change merges at once and no checker starts', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(false))
  const t = await finish(w)
  expect(w.spawns).toEqual([])
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
  expect(t.history.some(h => h.includes('checker'))).toBe(false)
})

test('with the checker on, a passing change waits for a checker (shown as checking); OK merges it, with the verdict and its tokens on the try', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => {
    // the checker got the task and the diff, as a read-only agent in the task's folder
    const s = w.spawns[0]!
    expect(s.kind).toBe('checker')
    expect(s.cwd).toBe(WT)
    expect(s.prompt).toContain('Done when: a test shows it.')
    expect(s.prompt).toContain('+the new line')
    // nothing is merged while it runs, and the board shows the task as checking
    expect(w.git.main).toBe(M1)
    const now = find(await load(w.$), 'T-1')!
    expect(now.status).toBe('doing')
    expect(now.checking?.step).toBe('checking')
    checkerFinished(id, 'I tried empty input and the old path.\nOK', false, { output: 500 })
  })
  expect(w.spawns.length).toBe(1)
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
  expect(t.history).toContain('try 1: checker: OK')
  expect(t.runs!.at(-1)!.tokens).toEqual({ output: 500 })
})

test("a checker role's checklist gets its placeholders filled in, as a worker's role does ({{files}}, {{test_command}}, {{kind}}, ...)", async () => {
  const w = world()
  const fs = (w.$ as unknown as { fs: Record<string, unknown> }).fs
  const exists = fs.exists as (p: string) => Promise<boolean>
  const read = fs.read as (p: string) => Promise<string>
  const dir = `${ROOT}/.symcc/roles`
  fs.exists = async (p: string) => p === dir || exists(p)
  fs.list = async (p: string) => (p === dir ? [{ name: 'checker.md', kind: 'file' }] : [])
  fs.read = async (p: string) => (p === `${dir}/checker.md` ? '---\ndescription: checks\n---\nfiles: {{files}}\ntests: {{test_command}}\nid {{task_id}} {{kind}} {{nope}}\n' : read(p))
  await saveBoard(w.$, boardWith(true))
  await finish(w, async id => checkerFinished(id, 'OK'))
  const p = w.spawns[0]!.prompt
  expect(p).toContain('files: Files you may change: src/.')
  expect(p).toContain('tests: After you finish, these must pass (run them in that folder to check): npm test')
  expect(p).toContain('id T-1 \nKind of task: change.')
  expect(p).toContain('{{nope}}')
  expect(p).not.toContain('{{files}}')
  expect(p).not.toContain('{{test_command}}')
  expect(p).not.toContain('{{kind}}')
})

test('a checker that finds problems sends the task back to its worker with the report in its next prompt, counting a retry', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const report = 'src/a.ts:12 doIt("") throws instead of returning "": run bun -e \'doIt("")\''
  const t = await finish(w, async id => checkerFinished(id, report))
  expect(w.git.main).toBe(M1)
  expect(t.status).toBe('todo')
  expect(t.test_tries).toBe(1)
  expect(t.note).toBe('the checker found problems; a new try will fix them (1 of 2)')
  expect(t.history.some(h => h.startsWith('try 1: checker found problems: src/a.ts:12'))).toBe(true)
  expect(t.runs!.at(-1)!.ended_note).toBe('checker found problems')
  expect(leadQueue.join('\n')).toContain('was sent back by the checker; retrying on its own (1 of 2)')
  const prompt = WORKER_PROMPT(t, await load(w.$), WT)
  expect(prompt).toContain('A checker reviewed your last try and found problems')
  expect(prompt).toContain(report)
  expect(prompt).not.toContain('Your last try failed these tests')
})

test('when its retries are used up, a checker report fails the task with the report', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { auto_retries: 0 }))
  const t = await finish(w, async id => checkerFinished(id, 'src/a.ts:1 the old behavior is gone'))
  expect(t.status).toBe('failed')
  expect(t.note).toBe('the checker found problems: src/a.ts:1 the old behavior is gone')
  expect(leadQueue.join('\n')).toContain("The checker's report:\nsrc/a.ts:1 the old behavior is gone")
  expect(w.git.main).toBe(M1)
})

test('in review mode an OK from the checker sends the task to review, not merged', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  await setBoardMode(w.$, 'review', 'you')
  const t = await finish(w, async id => checkerFinished(id, 'OK'))
  expect(w.spawns.length).toBe(1)
  expect(t.status).toBe('review')
  expect(w.git.main).toBe(M1)
  expect(t.history).toContain('try 1: checker: OK')
})

test('a checker stopped before its verdict merges nothing: the task waits for the owner\'s review', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, 'stopped', true))
  expect(t.status).toBe('review')
  expect(t.note).toBe('ready for review: the tests passed, but the checker gave no verdict (it was stopped), nothing merged yet')
  expect(w.git.main).toBe(M1)
})

test('T-402: through agentFinished (turn.complete), a checker whose turn ended on an error or a refusal gives no verdict: no problems, no retry used, the task waits for review', async () => {
  for (const [end, why] of [
    [{ reason: 'error' }, 'its turn ended on an error (retries used up or the context limit)'],
    [{ reason: 'refusal', refusal: { category: null, explanation: 'cannot help' } }, 'the model refused to go on (cannot help)'],
  ] as const) {
    resetPlugin()
    const w = world()
    await saveBoard(w.$, boardWith(true))
    const before = find(await load(w.$), 'T-1')!
    const t = await finish(w, async id => agentFinished(w.$, id, { answer: 'Let me look at src/a.ts next.', end, isAborted: false, tokens: undefined }))
    expect(t.status).toBe('review')
    expect(t.note).toBe(`ready for review: the tests passed, but the checker gave no verdict (${why}), nothing merged yet`)
    expect(t.attempts).toBe(before.attempts)
    expect(t.test_tries ?? 0).toBe(0)
    expect(t.history.some(h => h.includes('checker found problems'))).toBe(false)
    expect(w.git.main).toBe(M1)
  }
})

test('a docs-only change skips the checker and merges as before', async () => {
  const w = world(['README.md', 'docs/guide.md'])
  await saveBoard(w.$, boardWith(true, { files: [] }))
  const t = await finish(w)
  expect(w.spawns).toEqual([])
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
})

test('an investigation skips the checker: its answer goes to review', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, { kind: 'investigation' } as Partial<SymccTask>))
  const t = await finish(w)
  expect(w.spawns).toEqual([])
  expect(t.status).toBe('review')
  expect(w.git.main).toBe(M1)
})

// ---------------- stopping a task while its checker runs (T-353) ----------------

for (const [tool, args, status, again, againText] of [
  ['drop', { reason: 'not needed' }, 'dropped', 'retry', 'T-1 brought back from dropped and queued'],
  ['pause', {}, 'paused', 'resume', 'T-1 resumed'],
  ['ask', { question: 'Which way?' }, 'waiting', 'retry', 'T-1 queued'],
] as const) {
  test(`${tool} while the checker runs stops the checker at once: nothing merges, the task is ${status}, and ${again} works right after`, async () => {
    const w = world()
    await saveBoard(w.$, boardWith(true))
    let agent = ''
    const t = await finish(w, async id => {
      agent = id
      await runTool(w.$, tool, { task: 'T-1', ...args })
      // the checker is told to stop and is not waited for any more
      expect(checkerRuns.has(id)).toBe(false)
      expect(stopped.has(id)).toBe(true)
      expect(w.sends.some(m => m.to === id && m.text.startsWith('Stop now'))).toBe(true)
    })
    expect(agent).not.toBe('')
    expect(w.git.main).toBe(M1)
    expect(t.status).toBe(status)
    expect(checkingNow('T-1')).toBe(false)
    expect(stopAsked.has('T-1')).toBe(false)
    expect(await runTool(w.$, again, { task: 'T-1' })).toBe(againText)
    expect(find(await load(w.$), 'T-1')!.status === 'todo' || find(await load(w.$), 'T-1')!.status === 'doing').toBe(true)
  })
}

for (const [tool, args, status, again, againText] of [
  ['drop', { reason: 'not needed' }, 'dropped', 'retry', 'T-1 brought back from dropped and queued'],
  ['pause', {}, 'paused', 'resume', 'T-1 resumed'],
  ['ask', { question: 'Which way?' }, 'waiting', 'retry', 'T-1 queued'],
] as const) {
  test(`${tool} while the checker is still starting up stops it as soon as it starts: nothing merges, the task is ${status}, and ${again} works right after`, async () => {
    const w = world()
    await saveBoard(w.$, boardWith(true))
    const real = w.$.agents.spawn
    let reply = ''
    w.$.agents.spawn = async o => {
      if (o.name?.endsWith('-checker')) reply = await runTool(w.$, tool, { task: 'T-1', ...args })
      return real(o)
    }
    const t = await finish(w)
    expect(reply).not.toBe('')
    const id = 'chk1'
    expect(checkerRuns.size).toBe(0)
    expect(stopped.has(id)).toBe(true)
    expect(w.sends.some(m => m.to === id && m.text.startsWith('Stop now'))).toBe(true)
    expect(w.git.main).toBe(M1)
    expect(t.status).toBe(status)
    expect(checkingNow('T-1')).toBe(false)
    expect(stopAsked.has('T-1')).toBe(false)
    expect(await runTool(w.$, again, { task: 'T-1' })).toBe(againText)
  })
}

test('a checker that runs over max_minutes is stopped with the one stop text (halt), and gives no verdict', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { max_minutes: 7 }))
  let fire: (() => void) | undefined
  const clock = (w.$ as unknown as { clock: { after: (ms: number, f: () => void) => { cancel(): void } } }).clock
  const after = clock.after
  clock.after = (ms, f) => (ms === 7 * 60_000 ? ((fire = f), { cancel() {} }) : after(ms, f))
  const t = await finish(w, async id => {
    expect(fire).toBeDefined()
    fire!()
    expect(stopped.has(id)).toBe(true)
    expect(checkerRuns.has(id)).toBe(false)
    expect(w.sends.filter(m => m.to === id).map(m => m.text)).toEqual(["Stop now: your time is up. Don't change anything else; answer \"stopped\" and end."])
  })
  expect(t.status).toBe('review')
  expect(t.note).toContain('it ran over 7 min and was stopped')
  expect(w.git.main).toBe(M1)
})

test('a drop that comes before the checker is spawned starts no checker at all', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const run = w.$.run
  let dropped = false
  // the drop lands while the checker step is still getting ready (reading the change for its prompt)
  w.$.run = async (argv, o) => {
    if (!dropped && argv[0] === 'git' && argv.some(x => x.endsWith('...HEAD'))) {
      dropped = true
      await runTool(w.$, 'drop', { task: 'T-1' })
    }
    return run(argv, o)
  }
  const t = await finish(w)
  expect(dropped).toBe(true)
  expect(w.spawns.some(s => s.name?.endsWith('-checker'))).toBe(false)
  expect(checkerRuns.size).toBe(0)
  expect(w.git.main).toBe(M1)
  expect(t.status).toBe('dropped')
  expect(checkingNow('T-1')).toBe(false)
})

// ---------------- a checker's git and shell are kept to its task (T-369) ----------------

const C9 = 'c9'.repeat(20)
for (const [what, move] of [
  ['commits', (g: { head: string }) => void (g.head = C9)],
  ['resets HEAD~1', (g: { head: string }) => void (g.head = H0)],
  ['checks out a bare commit', (g: { head: string; detached: boolean }) => void ((g.head = C9), (g.detached = true))],
] as const) {
  test(`a checker that ${what} in the task's folder: the branch is put back at the tested HEAD, and only that merges`, async () => {
    const w = world()
    await saveBoard(w.$, boardWith(true))
    const t = await finish(w, async id => {
      expect(w.git.head).toBe(H1)
      move(w.git)
      checkerFinished(id, 'OK')
    })
    expect(w.calls).toContain(`git checkout -q -f -B symcc/T-1 ${H1}`)
    expect(w.git.head).toBe(H1)
    expect(w.git.main).toBe(H1)
    expect(t.status).toBe('done')
    expect(t.history).toContain(`try 1: the checker moved the branch symcc/T-1; it was put back at ${H1.slice(0, 10)}, so nothing it made is merged`)
    expect(t.history).toContain('try 1: checker: OK')
  })
}

test('a checker that leaves the branch alone: nothing is put back and nothing extra goes in the history', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, 'OK'))
  expect(w.calls.some(c => c.includes('checkout'))).toBe(false)
  expect(t.history.some(h => h.includes('moved the branch'))).toBe(false)
  expect(w.git.main).toBe(H1)
})

test("a checker that moved the branch when it can't be put back gives no verdict: nothing merges, the task waits for review", async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => {
    w.git.head = C9
    w.git.checkoutFails = true
    checkerFinished(id, 'OK')
  })
  expect(w.git.main).toBe(M1)
  expect(t.status).toBe('review')
  expect(t.history).toContain("try 1: checker gave no verdict (it moved the task's branch symcc/T-1 and it could not be put back)")
})

test("a checker's Bash aimed at the owner's project folder is refused as a worker's is; inside the task's folder it is allowed", async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  await finish(w, async id => {
    expect(await checkEdit(w.$, id, { command: `echo x > ${ROOT}/README.md` })).toBe(bashOutsideText('README.md', WT))
    expect(await checkEdit(w.$, id, { command: `cd ${ROOT} && git reset --hard HEAD~1` })).toBeDefined()
    expect(await checkEdit(w.$, id, { command: `cat ${ROOT}/.symcc/board.json` })).toBeDefined()
    expect(await checkEdit(w.$, id, { path: `${ROOT}/README.md` })).toMatch(/^Refused: README\.md is in the owner's copy/)
    expect(await checkEdit(w.$, id, { command: `cat ${WT}/src/a.ts && npm test` })).toBeUndefined()
    checkerFinished(id, 'OK')
  })
})

test('the checker prompt tells it not to run git commands that change anything', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  await finish(w, async id => checkerFinished(id, 'OK'))
  expect(w.spawns[0]!.prompt).toContain('Do NOT run git commands that change anything (commit, reset, checkout')
  expect(w.spawns[0]!.prompt).toContain('Read-only ones like git diff, git log, git show and git status are fine.')
})

test("a checker's git commands that change anything are refused, read-only ones are allowed, and a worker's git is not changed by this", async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  await finish(w, async id => {
    const bash = (command: string) => checkEdit(w.$, id, { command })
    for (const [command, what] of [
      ['git commit -am x', 'git commit'],
      ['git checkout main', 'git checkout'],
      ['git switch main', 'git switch'],
      ['git stash', 'git stash'],
      ['git stash push -m x', 'git stash'],
      ['cd /x && git reset --hard', 'git reset'],
      ['git -C /x branch -f main HEAD', 'git branch'],
      ['git branch -D symcc/T-2', 'git branch'],
      ['git branch new-one', 'git branch'],
      ['git status; git tag v1', 'git tag'],
      ['git log | git update-ref refs/heads/main HEAD', 'git update-ref'],
      ['echo $(git rebase main)', 'git rebase'],
      ['sh -c "git merge main"', 'git merge'],
      ['git --no-pager cherry-pick abc', 'git cherry-pick'],
      ['/usr/bin/git push', 'git push'],
      ['git worktree add /tmp/x', 'git worktree'],
      ['git restore --staged a.ts', 'git restore'],
      ['git clean -fd', 'git clean'],
      ['git apply --index p.diff', 'git apply'],
      // read-only commands with options that write a file or run a program (the try-1 checker's three probes first)
      ['git log -1 --format=%H --output=$(git rev-parse --git-common-dir)/refs/heads/main feat', 'git log --output'],
      ['git grep -O"git stash;:" x', 'git grep -O'],
      ["GIT_EXTERNAL_DIFF='git stash;:' git diff", 'git stash'],
      ['git diff --output=/tmp/x', 'git diff --output'],
      ['git diff --outp /tmp/x', 'git diff --outp'],
      ['git show -o /tmp/x HEAD', 'git show -o'],
      ['git diff -o x', 'git diff -o'],
      ['git log -po x', 'git log -o'],
      ['git log -pofile', 'git log -o'],
      ['git shortlog -no x', 'git shortlog -o'],
      ['git grep -nOvim foo', 'git grep -O'],
      ['git grep --open-files-in-pager=vim foo', 'git grep --open-files-in-pager'],
      ['git diff --ext-diff', 'git diff --ext-diff'],
      ['git log -p --textconv', 'git log --textconv'],
      ['git -c core.pager=x log', 'git -c'],
      ['git -c diff.external=x diff', 'git -c'],
      ['git -c alias.st=!x status', 'git -c'],
      ['git --config-env=core.pager=X log', 'git --config-env'],
      ['git --exec-path=/tmp diff', 'git --exec-path'],
      // settings that make git run a program or use another repository, when git runs
      ['GIT_EXTERNAL_DIFF=/tmp/x git diff', 'GIT_EXTERNAL_DIFF'],
      ['GIT_PAGER=x git -p log', 'GIT_PAGER'],
      ['PAGER=x git log', 'PAGER'],
      ['env GIT_SSH_COMMAND=x git log', 'GIT_SSH_COMMAND'],
      ['export EDITOR=x; git log', 'EDITOR'],
      ['GIT_DIR=/x git log', 'GIT_DIR'],
      ['GIT_CONFIG_GLOBAL=/tmp/c git diff', 'GIT_CONFIG_GLOBAL'],
      ["GIT_PAGER=x sh -c 'git log'", 'GIT_PAGER'],
      // git inside a VAR= value, an option value, or in capitals (macOS finds GIT too)
      ["X='git stash;:' true", 'git stash'],
      ['echo -X"git reset --hard"', 'git reset'],
      ['GIT stash', 'git stash'],
      ['/usr/libexec/git-core/git-stash', 'git stash'],
      ['git-core/git-log --output=/tmp/x', 'git log --output'],
    ] as const) expect(await bash(command)).toBe(gitWriteText(what))
    expect(gitWriteText('git stash')).toMatch(/^Refused: git stash may change the repository or run another program, and the checker may only read with git/)
    for (const command of ['git diff', 'git log -3', 'git status', 'git log --oneline -5', 'git diff --text --stat', 'git diff --no-ext-diff', 'git ls-files -o', 'git grep -n foo', '/usr/libexec/git-core/git-diff', 'echo "use git diff"', 'export GIT_PAGER=cat', 'grep -rn "gitWriteIn(" hooks', 'git -C src show HEAD:src/a.ts', 'git diff main...HEAD && git blame src/a.ts', 'git branch --list', 'git branch -a', 'git branch', 'git stash list', 'git stash show -p', 'git rev-parse HEAD | cat', 'git ls-files src', 'npm test', 'git log -Sfoo', 'git log -p -G"checkout" -- hooks', "git log -L'/function gitScan/,+5:hooks/core/ask.ts'", 'git diff -Sfoo', 'git log -n3o', 'git grep -e-O foo'])
      expect(await bash(command)).toBeUndefined()
    checkerFinished(id, 'OK')
  })
  // a worker's own git commands in its folder are not refused
  workers.set('ag2', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  for (const command of ['git commit -am x', 'git stash', 'git reset --hard', 'git checkout -b x'])
    expect(await checkEdit(w.$, 'ag2', { command })).toBeUndefined()
})

// ---------------- a reload during the checker (T-386) ----------------

/**
 * T-1's worker hands back and its checker starts (chk1); then the plugin reloads (its memory starts over, as
 * resetPlugin does): the old copy's step keeps waiting for chk1's answer, which never reaches it. `status`:
 * chk1 as the agent list shows it after the reload. Returns the agents list (changed by the test).
 */
async function reloadDuringChecker(w: ReturnType<typeof world>, status: string) {
  await saveBoard(w.$, boardWith(true))
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  void workerFinished(w.$, 'ag1', 'made the change')
  await until(() => checkerRuns.size > 0)
  expect(find(await load(w.$), 'T-1')!.note).toBe('a checker is trying to break it before it merges')
  resetPlugin()
  S.root = ROOT
  S.driving = true
  const agents: HostAgent[] = [{ id: 'chk1', name: 'symcc-T-1-checker', kind: 'scout', status }]
  w.$.agents.list = async () => agents
  return agents
}

test('T-386: a reload stops the running checker; at the next check the task gets a new checker on the same work, no retry counted, and the lead is told once', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  const sha = w.git.head
  await check(w.$)
  // the old checker (unknown to this copy) was told to stop, and a new one started at once
  expect(w.sends.map(m => m.to)).toEqual(['chk1'])
  await until(() => checkerRuns.size > 0)
  expect(w.spawns.length).toBe(2)
  expect(w.spawns[1]!.name).toBe('symcc-T-1-checker')
  const mid = find(await load(w.$), 'T-1')!
  expect(mid.status).toBe('doing')
  expect(mid.checking?.step).toBe('checking')
  expect(w.git.head).toBe(sha)
  const told = leadQueue.filter(m => m.includes('its checker stopped when the plugin reloaded'))
  expect(told.length).toBe(1)
  // a check meanwhile does not start a third one
  await check(w.$)
  expect(w.spawns.length).toBe(2)
  checkerFinished([...checkerRuns.keys()][0]!, 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.attempts).toBe(1)
  expect(t.test_tries ?? 0).toBe(0)
  expect(t.history).toContain('try 1: checker: OK')
  expect(leadQueue.filter(m => m.includes('its checker stopped when the plugin reloaded')).length).toBe(1)
})

test("T-386: a checker that ended over the reload, or whose stopped hand-back arrives, gets a new run without waiting for a check", async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  // the reload's own look for orphans (session start) stops the old checker; its "stopped" answer then comes in
  await stopOrphans(w.$)
  expect(w.spawns.length).toBe(1)
  await stoppedHandBack(w.$, 'chk1')
  await until(() => checkerRuns.size > 0)
  expect(w.spawns.length).toBe(2)
  checkerFinished([...checkerRuns.keys()][0]!, 'stopped', true)
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  // no verdict from the new one either: it waits for review, as without a reload; still try 1
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.attempts).toBe(1)
})

test('T-386: a checker shown as ended after the reload: the next check starts a new one', async () => {
  const w = world()
  await reloadDuringChecker(w, 'completed')
  await check(w.$)
  expect(w.sends).toEqual([])
  await until(() => checkerRuns.size > 0)
  expect(w.spawns.length).toBe(2)
  checkerFinished([...checkerRuns.keys()][0]!, 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  // the worker's commit, made before the reload, is still saved on the try (as without a reload)
  expect(t.merged).toBe(H1)
  expect(t.runs?.[0]?.commits).toEqual([H1])
})

test('T-386: a reload after the checker said OK and the work reached main (before the outcome was written): the task ends done, no new checker', async () => {
  const w = world()
  // finishing: the old copy's mark (its merge was under way); a board field not in SymccTask
  const left = { note: 'a checker is trying to break it before it merges', finishing: ISO, runs: [{ started: ISO, ended: ISO, commits: [H1] }] }
  await saveBoard(w.$, boardWith(true, left))
  w.git.head = H1
  w.git.main = H1
  w.git.dirty = false
  const run = w.$.run
  w.$.run = async (argv, o) => (argv[0] === 'git' && argv.includes('log') && argv.includes('--format=%B') ? ok('T-1: Do it\n\nSymcc-Task: T-1\nSymcc-Try: 1\n') : run(argv, o))
  resetPlugin()
  S.root = ROOT
  S.driving = true
  S.gitState = 'ok'
  w.$.agents.list = async () => [{ id: 'chk1', name: 'symcc-T-1-checker', kind: 'scout', status: 'completed' }]
  await check(w.$)
  await turns(2000)
  expect(w.spawns.length).toBe(0)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.note).toBe('merged into main (b1b1b1b1)')
  expect(t.test_tries ?? 0).toBe(0)
  expect(w.git.main).toBe(H1)
})

/** The checker's next `n` starts fail as "not ready" (its agent type isn't loaded yet, just after a reload; the host marks such an error, see notReadyYet); later ones start as usual. */
function scoutNotLoaded(w: ReturnType<typeof world>, n: number) {
  const agent = w.$.agents
  const real = agent.spawn
  let left = n
  agent.spawn = async o => {
    if (left > 0) {
      left--
      throw Object.assign(new Error('Agent type symcc:scout not found'), { notReady: true })
    }
    return real(o)
  }
}

test("T-386: a restarted checker whose agent type isn't loaded yet: the task stays doing, and the next check starts a checker", async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  scoutNotLoaded(w, 1)
  await stopOrphans(w.$)
  await stoppedHandBack(w.$, 'chk1')
  await turns(2000)
  expect(checkerRuns.size).toBe(0)
  const mid = find(await load(w.$), 'T-1')!
  expect(mid.status).toBe('doing')
  expect(mid.note).toBe('a checker is trying to break it before it merges')
  expect(mid.history.some(l => l.includes('no verdict'))).toBe(false)
  await check(w.$)
  await until(() => checkerRuns.size > 0)
  expect(w.spawns.length).toBe(2)
  expect(leadQueue.filter(m => m.includes('its checker stopped when the plugin reloaded')).length).toBe(1)
  checkerFinished([...checkerRuns.keys()][0]!, 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.attempts).toBe(1)
  expect(t.test_tries ?? 0).toBe(0)
})

test("T-386: a restarted checker whose agent type is still not loaded after 3 starts: the task goes to review with no verdict", async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  scoutNotLoaded(w, 99)
  await stopOrphans(w.$)
  await stoppedHandBack(w.$, 'chk1')
  await turns(2000)
  expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
  await check(w.$)
  await turns(2000)
  expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
  await check(w.$)
  await turns(4000)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.note).toMatch(/the checker gave no verdict \(the checker couldn't start: Agent type symcc:scout not found\)/)
  expect(t.attempts).toBe(1)
  expect(w.spawns.length).toBe(1)
})
