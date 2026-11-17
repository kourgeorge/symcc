// The checker setting (T-349): with it on, a change whose tests passed is checked by a fresh checker before it merges.
// Like merge.test.ts, these run the real finish, merge and board code against a small scripted git and in-memory files.
import { expect } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { type Board, addTask, emptyBoard, patchTask, find, checkerVerdict, checkerOutput, isCheckerOutput, docsOnly, checkerOn, applySettings, parseSettingValue, settingValue, finishedNote } from '../hooks/board'
import { S, leadQueue, meanwhile, workers, checkerRuns, stopped } from '../hooks/plugin/state'
import { workerFinished, WORKER_PROMPT, setBoardMode, checkingNow, stopAsked } from '../hooks/plugin/workers'
import { checkerFinished } from '../hooks/plugin/checker'
import { load, saveBoard } from '../hooks/plugin/store'
import { runTool } from '../hooks/plugin/tools'
import { test } from './reset'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const ISO = '2026-11-13T00:00:00.000Z'
const [M1, H0, H1] = ['a1', 'b0', 'b1'].map(x => x.repeat(20)) as [string, string, string]

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

/** In-memory files, a small fake git (main, the worker's HEAD, the changed files) and a fake agent spawn that records each checker started. */
function world(changed: string[] = ['src/a.ts', 'src/a.test.ts']) {
  const git = { main: M1, head: H0, dirty: true }
  const files = new Map<string, string>()
  const calls: string[] = []
  const spawns: { prompt: string; subagentType?: string; cwd?: string; name?: string }[] = []
  const sends: { to: { agentId: string }; text: string }[] = []
  const state = new Map<string, unknown>()
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
  const $ = {
    process: {
      run: async (argv: string[], o: { cwd?: string } = {}): Promise<Res> => {
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
    },
    fs: {
      exists: async (p: string) => files.has(p),
      read: async (p: string) => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return files.get(p)!
      },
      write: async (p: string, text: string) => void files.set(p, text),
      stat: async (p: string) => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return { mtimeMs: 0 }
      },
      list: async () => [],
    },
    session: { id: async () => 'me', send: async (m: { to: { agentId: string }; text: string }) => void sends.push(m) },
    agent: {
      list: async () => [],
      spawn: async (o: { prompt: string; subagentType?: string; cwd?: string; name?: string }) => (spawns.push(o), { agentId: `chk${spawns.length}` }),
    },
    plugin: { root: '/plugin', name: 'symcc' },
    ui: { toast: () => undefined, status: () => undefined, log: () => undefined },
    clock: { after: () => ({ cancel() {} }), every: () => ({ cancel() {} }), sleep: async () => undefined },
    prompt: { submit: async () => undefined },
    state: {
      get: async (e: { key: string }) => state.get(e.key) ?? { value: undefined, version: 0 },
      set: async (e: { key: string; value: unknown }) => {
        const version = ((state.get(e.key) as { version?: number } | undefined)?.version ?? 0) + 1
        state.set(e.key, { value: e.value, version })
        return { isSet: true, version }
      },
    },
  }
  S.root = ROOT
  S.leadTimer = null
  S.writing = Promise.resolve()
  S.driving = false
  S.startupDone = false
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  return { $: $ as never, git, calls, spawns, sends }
}

/** A board with task T-1 (files src/) "doing" on try 1, with the checker setting `checker`. */
function boardWith(checker: boolean, extra: Partial<SymccTask> = {}, over: Partial<Board> = {}): Board {
  const [b, t] = addTask({ ...emptyBoard(), mode: 'auto', test_commands: ['npm test'], checker, ...over }, { origin: { why: 'a test' }, title: 'Do it', details: 'Make a do it.\nDone when: a test shows it.', files: ['src/'] }, ISO)
  return patchTask(b, t.id, { status: 'doing', attempts: 1, runs: [{ started: ISO }], ...extra }, ISO)
}

/** Waits (a few rounds of pending work, never the clock) until `f` holds. */
async function until(f: () => boolean) {
  for (let i = 0; i < 20_000 && !f(); i++) await Promise.resolve()
  if (!f()) throw new Error('it never happened')
}

/** T-1's worker (agent ag1) hands back; `checker` answers the checker (when one starts) and may look at the board meanwhile. */
async function finish(w: ReturnType<typeof world>, checker?: (agentId: string) => Promise<void>) {
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const done = workerFinished(w.$, 'ag1', 'made the change')
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
  expect(finishedNote({ ok: false, detail: 'x', checker: true, testOutput: 'y' })).toBe('checker found problems')
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
    expect(s.subagentType).toBe('symcc:scout')
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
      expect(w.sends.some(m => m.to.agentId === id && m.text.startsWith('Stop now'))).toBe(true)
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
    const a = w.$ as unknown as { agent: { spawn: (o: { prompt: string; name?: string }) => Promise<{ agentId: string }> } }
    const real = a.agent.spawn
    let reply = ''
    a.agent.spawn = async o => {
      if (o.name?.endsWith('-checker')) reply = await runTool(w.$, tool, { task: 'T-1', ...args })
      return real(o)
    }
    const t = await finish(w)
    expect(reply).not.toBe('')
    const id = 'chk1'
    expect(checkerRuns.size).toBe(0)
    expect(stopped.has(id)).toBe(true)
    expect(w.sends.some(m => m.to.agentId === id && m.text.startsWith('Stop now'))).toBe(true)
    expect(w.git.main).toBe(M1)
    expect(t.status).toBe(status)
    expect(checkingNow('T-1')).toBe(false)
    expect(stopAsked.has('T-1')).toBe(false)
    expect(await runTool(w.$, again, { task: 'T-1' })).toBe(againText)
  })
}

test('a drop that comes before the checker is spawned starts no checker at all', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const a = w.$ as unknown as { process: { run: (argv: string[], o?: { cwd?: string }) => Promise<Res> } }
  const run = a.process.run
  let dropped = false
  // the drop lands while the checker step is still getting ready (reading the change for its prompt)
  a.process.run = async (argv, o) => {
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
