// The checker setting (T-349): with it on, a change is checked by a fresh checker after the prep step and before it
// joins the merge line, where its tests then run once (T-551).
// Like merge.test.ts, these run the real finish, merge and board code against a small scripted git and in-memory files.
import { expect } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { type Board, addTask, emptyBoard, patchTask, find, checkerVerdict, checkerOutput, isCheckerOutput, docsOnly, checkerOn, applySettings, parseSettingValue, settingValue, finishedNote, bashOutsideText, gitWriteText, gitWriteIn, workerGitWriteText, untestedChange, testTail, statusCell, PREP_NOTE, STEP_NOTE, shownNote } from '../hooks/board'
import { notProse, checkerProblems, problemsBlockLines } from '../hooks/core/checker'
import { makeAsk } from '../hooks/board'
import { historyEvent, historyLineWords, workerStartedEntry, withHistory, noteAddedLine } from '../hooks/core/history'
import { S, leadQueue, meanwhile, workers, checkerRuns, stopped, adoptedCheckers } from '../hooks/app/state'
import { pump, workerFinished, WORKER_PROMPT, checkingNow, stopAsked, check, stoppedHandBack } from '../hooks/app/workers'
import { setBoardMode, setSymcc } from '../hooks/app/board-mode'
import { stopOrphans } from '../hooks/app/cleanup'
import { checkerFinished } from '../hooks/app/checker'
import { agentTypeFor } from '../hooks/claude/host'
import { checkEdit, stoppedText } from '../hooks/app/ask'
import { load, saveBoard } from '../hooks/app/store'
import { runTool, leadGuide } from '../hooks/app/tools'
import { test, resetPlugin } from './reset'
import { agentFinished, toolCall } from '../hooks/app/symcc'
import { moveOldOrgMem } from '../hooks/app/org-mem'
import { appendLineRun, fakeHost, memoryFs } from './fake-host'
import type { Host, HostAgent } from '../hooks/host'
import { drainStarts, queuedStarts } from '../hooks/app/starts'
import { withStarts } from './starts'
import { checkerPrompt, checkerTestsText } from '../hooks/core/checker'
import { inMergeLine } from '../hooks/app/merge-line'
import { parseMergeLine, addTokens } from '../hooks/board'
import { onTaskEvent, type TaskEvent } from '../hooks/app/events'
import { debriefs, learnedAsk } from '../hooks/app/debrief'
import { DEBRIEF_MS, DEBRIEF_TEXT, LEARNED_ASK } from '../hooks/core/org-mem'
import type { EvidenceEvent } from '../hooks/core/evidence'
import { evidenceWritten } from '../hooks/app/evidence'
import { agentsOf, checkerIdOf, checkerTokensOf, sumTokens, tryCost, tryTokens } from '../hooks/core/runs'
import { runBy } from './agent-fixture'
const CHECKER_NOTE = STEP_NOTE.checker

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const ISO = '2026-11-13T00:00:00.000Z'
const [M1, H0, H1] = ['a1', 'b0', 'b1'].map(x => x.repeat(20)) as [string, string, string]

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

/** In-memory files, a small fake git (main, the worker's HEAD, the changed files) and a fake agent spawn that records each checker started. */
function world(changed: string[] = ['src/a.ts', 'src/a.test.ts']) {
  // gone: branch main was deleted (T-440)
  // tree: what `rev-parse <commit>^{tree}` gives (T-526); empty: git can't tell, so no passed tree is recorded
  // moves: each commit main was moved to, in order
  // slowStatus: `git status` waits this many promise turns before it answers, as a real git takes a moment (T-740)
  const git = { main: M1, head: H0, dirty: true, detached: false, checkoutFails: false, gone: false, tree: '', moves: [] as string[], slowStatus: 0, edits: false }
  // the project's test commands (T-565): fails makes each one exit 1 with output; hold: a run in folder `cwd` waits for `until`
  const tests = { fails: false, output: '(fail) src/a.test.ts > doIt handles empty input\n 0 pass\n 1 fail', hold: null as { cwd: string; until: Promise<void> } | null }
  const files = new Map<string, string>()
  const calls: string[] = []
  function runGit(a0: string[]): Res {
    const a = a0.filter((x, i) => x !== '-c' && a0[i - 1] !== '-c')
    const s = a.join(' ')
    if (a[0] === 'status' && git.edits && git.dirty) return ok(' M src/owner-fix.ts')
    if (a[0] === 'commit') {
      if (!git.dirty) return fail('nothing to commit')
      git.dirty = false
      git.head = H1
      return ok()
    }
    if (s === 'rev-parse -q --verify HEAD' || s === 'rev-parse HEAD') return ok(git.head)
    if (a[0] === 'rev-parse' && a.at(-1)!.endsWith('^{tree}')) return git.tree ? ok(git.tree) : fail()
    if (git.gone && s === 'rev-parse --verify -q refs/heads/main') return fail()
    if (git.gone && s === 'rev-parse refs/heads/main') return { exitCode: 128, stdout: '', stderr: "fatal: ambiguous argument 'refs/heads/main'" }
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
      git.moves.push(to!)
      return ok()
    }
    return ok()
  }
  const { host, spawns, sent: sends } = fakeHost({
    run: async (argv, o = {}) => {
      const [cmd, ...rest] = argv
      calls.push(argv.join(' '))
      if (cmd === 'git' && rest.includes('status')) for (let i = 0; i < git.slowStatus; i++) await Promise.resolve()
      if (cmd === 'git') return runGit(rest)
      if (appendLineRun(files, argv)) return ok()
      if (cmd === '/bin/sh') {
        if (tests.hold && o.cwd === tests.hold.cwd) await tests.hold.until
        if (tests.fails) return { exitCode: 1, stdout: tests.output, stderr: '' }
        return ok()
      }
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
  return { $: host, git, calls, spawns, sends, tests }
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

test('T-561: the filled checker prompt has no "where it was tested" and no instruction to run test commands', () => {
  for (const cmds of [['npm test'], []]) {
    const p = checkerPrompt({ name: 'symcc', task_id: 'T-1', title: 'a', details: 'b', branch: 'symcc/T-1', folder: WT, into: 'main', role: '', diff: '(no diff)', changed_files: '  a.ts', tests: checkerTestsText('symcc', cmds) })
    expect(p).not.toContain('where it was tested')
    expect(p).not.toMatch(/\bRun (the )?(project's )?test commands/i)
    expect(p).toContain("Don't run the project's own tests")
    expect(p).toContain('the branch must stay where the worker left it')
  }
})

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
  for (const f of ['examples/other.md', 'docs/scouts/x.md', 'docs/prompting.md', 'docs/instructions.md'])
    expect([f, docsOnly([f])]).toEqual([f, true])
  // T-911: an app's own LLM prompt files (under prompts/, prompt/, instructions/ or system-prompts/, at any depth) are agent instructions
  const prompts = ['prompts/system.md', 'src/prompts/agent.md', 'llm/instructions/support.md', 'prompt/a.mdx', 'app/system-prompts/x.txt',
    'docs/instructions/x.md', 'Prompts/README.md', 'prompts/notes.txt']
  expect(notProse(['docs/a.md', 'README.md', ...prompts])).toEqual(prompts)
  for (const f of prompts) expect([f, docsOnly([f])]).toEqual([f, false])
  expect(docsOnly(['docs/a.md', 'README.md'])).toBe(true)
  expect(notProse(['docs/a.md', 'README.md', 'prompts/logo.png'])).toEqual([])
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
  expect(t.history.some(h => h.text.includes('checker'))).toBe(false)
})

test('with the checker on, a passing change waits for a checker (shown as checking); OK merges it, with the verdict and its tokens on the try', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => {
    // the checker got the task and the diff, as a read-only agent in the task's folder
    const s = w.spawns[0]!
    expect(s.kind).toBe('checker')
    // T-905: in Claude Code it starts as the checker agent type (no scouts tool), not the scout one
    expect(agentTypeFor(s)).toBe(`${S.N.name}:checker`)
    expect(s.cwd).toBe(WT)
    expect(s.prompt).toContain('Done when: a test shows it.')
    expect(s.prompt).toContain('+the new line')
    // nothing is merged while it runs, and the board shows the task as checking
    expect(w.git.main).toBe(M1)
    const now = find(await load(w.$), 'T-1')!
    expect(now.status).toBe('doing')
    expect(now.live?.checking?.step).toBe('checker')
    checkerFinished(id, 'I tried empty input and the old path.\nOK', false, { output: 500 })
  })
  expect(w.spawns.length).toBe(1)
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
  expect(t.history.map(h => h.text)).toContain('try 1: checker: OK')
  expect(tryTokens(t.runs!.at(-1))).toEqual({ output: 500 })
  // T-769, T-805: the checker's part is read from its own entry, so the Live tab can tell checkers from workers
  expect(checkerTokensOf(t.runs!.at(-1))).toEqual({ output: 500 })
})

test("T-774: the worker's hand-back and the checker's end each put their tokens on their own agent entry of the try, and the try's tokens are their sum", async () => {
  const w = world()
  // its worker ag1 started on the try (patchTask gives it its entry, as workerStarted's write does)
  await saveBoard(w.$, patchTask(boardWith(true), 'T-1', { runs: [runBy('ag1', ISO)] }, ISO))
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const done = withStarts(w.$, workerFinished(w.$, 'ag1', 'made the change', { reason: 'answer' }, { input: 4_000 }))
  await until(() => checkerRuns.size > 0)
  checkerFinished([...checkerRuns.keys()][0]!, 'OK', false, { output: 500 })
  await done
  const r = find(await load(w.$), 'T-1')!.runs!.at(-1)!
  expect(r.agents!.map(a => [a.kind, a.id, a.tokens, !!a.ended])).toEqual([
    ['worker', 'ag1', { input: 4_000 }, true],
    ['checker', 'chk1', { output: 500 }, true],
  ])
  expect(tryTokens(r)).toEqual({ input: 4_000, output: 500 })
})

test('T-440: the target branch deleted while the checker runs: after its OK the task waits with the branch-gone question, not failed', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => {
    w.git.gone = true
    checkerFinished(id, 'OK')
  })
  expect(t.status).toBe('waiting')
  expect(t.ask?.text).toMatch(/^branch main is gone: merge into \S+ instead\?$/)
  expect(t.history.at(-1)?.text).toMatch(/^not merged: branch main is gone; asked the owner/)
  expect(t.test_tries ?? 0).toBe(0)
  expect(w.git.main).toBe(M1)
  expect(leadQueue.join('\n')).not.toMatch(/checking failed/)
})

test('T-542: after the checker says OK, the prep and merge steps no longer say a checker is running', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const seen: string[] = []
  const run = w.$.run.bind(w.$)
  w.$.run = (async (argv: string[], o?: unknown) => {
    const sub = argv[0] === 'git' ? argv.slice(1).filter((x, i, a) => x !== '-c' && a[i - 1] !== '-c')[0] : ''
    if (sub === 'add' || sub === 'update-ref') {
      const t = find(await load(w.$), 'T-1')!
      seen.push(`${sub}: ${statusCell(t, Date.now())} | ${shownNote(t)}`)
    }
    return run(argv as never, o as never)
  }) as typeof w.$.run
  let during = ''
  const t = await finish(w, async id => {
    const c = find(await load(w.$), 'T-1')!
    during = `${statusCell(c, Date.now())} | ${shownNote(c)}`
    checkerFinished(id, 'OK')
  })
  expect(t.status).toBe('done')
  // while the checker really runs, its note is there (a reloaded copy finds a lost checker by it)
  expect(during).toBe(`checker | ${CHECKER_NOTE}`)
  expect(seen.some(s => s.startsWith('update-ref: merge'))).toBe(true)
  for (const s of seen) expect(s).not.toContain(CHECKER_NOTE)
  // one prep step, before the checker: the line after it does not go through prep again (T-551)
  expect(seen.filter(s => s.startsWith('add:'))).toEqual([`add: prep | ${PREP_NOTE}`])
})

// ---------------- the checker runs before the merge line; the tests run once, in it (T-551) ----------------

const NO_PROJECT_TESTS = "## Tests\n\nDon't run the project's own tests (its test files or test commands): symcc runs the project's test commands once, in the merge queue, after you. Check the change with your own throwaway probe tests and scripts (in .scratch/ or /tmp) instead, and say a new test would pass without the change only where your own probe shows it."

/** The test commands the fake host ran, in order. */
const testRuns = (w: ReturnType<typeof world>) => w.calls.filter(c => c.startsWith('/bin/sh -c '))

test('T-551: with the checker on, the checker runs before the task joins the merge line, the tests run once after its OK, and then it merges', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { test_commands: ['npm test', 'npm run lint'] }))
  let during: string[] = []
  let line = ''
  const t = await finish(w, async id => {
    // the prep step passed (the work is committed), but no test ran yet and the task is not in the merge line
    expect(w.git.head).toBe(H1)
    during = testRuns(w)
    line = (await w.$.fs.read(`${ROOT}/.symcc/merge-line.json`).catch(() => null)) ?? ''
    checkerFinished(id, 'OK')
  })
  expect(during).toEqual([])
  expect(line).not.toContain('T-1')
  expect(testRuns(w)).toEqual(['/bin/sh -c npm test', '/bin/sh -c npm run lint'])
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
  const texts = t.history.map(h => h.text)
  expect(texts).toContain('try 1: checker: OK')
})

test('T-616: a worker finish → checker → queue → test → merge emits each event once, logs them to events.jsonl and puts each stage in the history once', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const T2 = `${ROOT}/.symcc/worktrees/T-2`
  let letGo = () => {}
  w.tests.hold = { cwd: T2, until: new Promise<void>(r => (letGo = r)) }
  // another task holds the merge line, so T-1 waits its turn in the queue after its checker's OK
  const t2 = inMergeLine(w.$, 'T-2', async () => void (await w.$.run(['/bin/sh', '-c', 'npm test'], { cwd: T2 })))
  await until(() => testRuns(w).length === 1)
  const got: TaskEvent[] = []
  const off = onTaskEvent(es => void got.push(...es))
  let t: Awaited<ReturnType<typeof finish>>
  try {
    t = await finish(w, async id => {
      checkerFinished(id, 'OK')
      await until(() => got.some(e => e.to === 'queue'))
      letGo()
      await t2
    })
  } finally {
    off()
  }
  expect(t.status).toBe('done')
  expect(got.map(e => `${e.kind} ${e.from}→${e.to}`)).toEqual(['stage worker→prep', 'stage prep→checker', 'stage checker→queue', 'stage queue→test', 'stage test→merge', 'state doing→done', 'stage merge→null'])
  expect(got.every(e => e.task === 'T-1' && e.try === 1 && typeof e.at === 'string')).toBe(true)
  expect(got.find(e => e.to === 'queue')!.place).toBe(2)
  // the activity log has the same events, one JSON line each
  const log = (await w.$.fs.read(`${ROOT}/.symcc/events.jsonl`)).trim().split('\n').map(l => JSON.parse(l) as TaskEvent)
  expect(log).toEqual(got)
  // T-660: the checker's verdict and the merge-queue outcome are logged as evidence (in their own file), once each
  await evidenceWritten()
  const evidence = (await w.$.fs.read(`${ROOT}/.symcc/evidence.jsonl`)).trim().split('\n').map(l => ({ ...(JSON.parse(l) as EvidenceEvent), at: 'x' }))
  expect(evidence).toEqual([
    { kind: 'verdict', at: 'x', task: 'T-1', try: 1, verdict: 'ok' },
    { kind: 'queue', at: 'x', task: 'T-1', try: 1, outcome: 'merged', commit: H1 },
  ])
  // the history shows the whole path, each stage once, between the outcome lines it already had
  expect(t.history.map(h => [h.kind, h.text])).toEqual([
    ['created', 'created by the lead because a test'],
    // T-723: the hand-back has its own line, just before "prep started"
    ['stage', 'try 1: worker handed back'],
    ['stage', 'try 1: prep started'],
    ['stage', 'try 1: checker started'],
    ['checker-ok', 'try 1: checker: OK'],
    ['stage', 'try 1: waits in the merge queue (place 2)'],
    ['stage', 'try 1: tests started'],
    ['stage', 'try 1: merge started'],
    ['merged', 'try 1: made the change → merged into main (b1b1b1b1); tests passed'],
  ])
})

test('T-551: a checker that finds problems is one normal failed try: the task never joins the merge line and no test runs', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, 'src/a.ts:1 breaks on ""'))
  expect(testRuns(w)).toEqual([])
  expect(t.status).toBe('todo')
  expect(t.test_tries).toBe(1)
  expect(w.git.main).toBe(M1)
})

test('T-551: with the checker off, the tests run once and the change merges, as before', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(false))
  const t = await finish(w)
  expect(testRuns(w)).toEqual(['/bin/sh -c npm test'])
  expect(t.status).toBe('done')
})

test('T-565: checker on, the checker says OK but the merge line\'s tests fail: a normal failed try, and the next prompt shows the test output (not a checker report)', async () => {
  const w = world()
  w.tests.fails = true
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, 'OK'))
  expect(testRuns(w)).toEqual(['/bin/sh -c npm test'])
  expect(t.status).toBe('todo')
  expect(t.test_tries).toBe(1)
  expect(w.git.main).toBe(M1)
  expect(t.history.map(h => h.text)).toContain('try 1: checker: OK')
  const prompt = WORKER_PROMPT(t, await load(w.$), WT)
  expect(prompt).toContain('Your last try failed these tests; fix it.')
  expect(prompt).toContain('(fail) src/a.test.ts > doIt handles empty input')
  expect(prompt).not.toContain('A checker reviewed your last try')
})

test('T-565: checker on, the checker gives no verdict and the merge line\'s tests fail: a failed try (todo), not review', async () => {
  const w = world()
  w.tests.fails = true
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, 'stopped', true))
  expect(testRuns(w)).toEqual(['/bin/sh -c npm test'])
  expect(t.status).toBe('todo')
  expect(t.test_tries).toBe(1)
  expect(t.note ?? '').not.toMatch(/checker gave no verdict.*ready for review/)
  expect(t.note ?? '').not.toContain('ready for review')
  expect(w.git.main).toBe(M1)
})

test("T-565: a task's checker runs while another task holds the merge line; after its OK it waits behind it, and main moves to the other task first", async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const T2 = `${ROOT}/.symcc/worktrees/T-2`
  const M2 = 'c2'.repeat(20)
  const line = async () => parseMergeLine((await w.$.fs.read(`${ROOT}/.symcc/merge-line.json`).catch(() => null)) ?? null).map(e => e.task)
  let letGo = () => {}
  w.tests.hold = { cwd: T2, until: new Promise<void>(r => (letGo = r)) }
  // T-2's merge turn: its test command waits until let go, then main moves to its commit
  const t2 = inMergeLine(w.$, 'T-2', async () => {
    await w.$.run(['/bin/sh', '-c', 'npm test'], { cwd: T2 })
    await w.$.run(['git', 'update-ref', '-m', 'T-2', 'refs/heads/main', M2, w.git.main])
  })
  await until(() => testRuns(w).length === 1)
  const t = await finish(w, async id => {
    // T-1's checker runs while T-2 still holds the line
    expect(checkerRuns.size).toBeGreaterThan(0)
    expect(await line()).toEqual(['T-2'])
    expect(w.git.main).toBe(M1)
    checkerFinished(id, 'OK')
    // after the OK, T-1 joins the line behind T-2 and waits there: its tests don't run, nothing merges
    for (let i = 0; i < 200 && !(await line()).includes('T-1'); i++) await turn()
    expect(await line()).toEqual(['T-2', 'T-1'])
    await turns(500)
    expect(testRuns(w).length).toBe(1)
    expect(w.git.moves).toEqual([])
    expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
    letGo()
    await t2
  })
  expect(testRuns(w).length).toBe(2)
  expect(w.git.moves).toEqual([M2, H1])
  expect(t.status).toBe('done')
  expect(t.history.map(h => h.text)).toContain('try 1: checker: OK')
})

test('T-551: the checker prompt names no test command to run and says the tests run in the merge line after it', async () => {
  const w = world(['src/a.ts', 'src/a.test.ts'])
  await saveBoard(w.$, boardWith(true, {}, { test_commands: ['npm test', 'npm run lint'] }))
  await finish(w, async id => checkerFinished(id, 'OK'))
  const p = w.spawns[0]!.prompt
  expect(p).toContain(NO_PROJECT_TESTS)
  expect(p).not.toContain('npm test')
  expect(p).not.toContain('npm run lint')
  expect(p).not.toMatch(/run the tests for the changed files/i)
  expect(p).toContain('## Files it changed\n\n  src/a.ts\n  src/a.test.ts\n')
  expect(p).toContain('there is no need to look at the board or the main project folder')
  expect(p).not.toContain('{{')
  // the verdict format is kept
  expect(p).toContain('the single word OK on its own last line')
})

test('T-551: with no test commands set, the checker is still told not to look for the project\'s tests', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { test_commands: [] }))
  await finish(w, async id => checkerFinished(id, 'OK'))
  const q = w.spawns[0]!.prompt
  expect(q).toContain("## Tests\n\nDon't run the project's own tests (its test files or test commands): no test commands are set for this project, so nothing runs its tests in the merge queue after you; still, don't look for them.")
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
  expect(p).toContain("tests: Don't run the project's own tests (its test files or test commands): symcc runs the project's test commands once, in the merge queue, after you.")
  expect(p).toContain('id T-1 \nThe task type is change.')
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
  expect(t.history.some(h => h.text.startsWith('try 1: checker found problems: src/a.ts:12'))).toBe(true)
  expect(t.runs!.at(-1)!.ended_note).toBe('checker found problems')
  expect(leadQueue.join('\n')).toContain('was sent back by the checker; retrying on its own (1 of 2)')
  const prompt = WORKER_PROMPT(t, await load(w.$), WT)
  expect(prompt).toContain('A checker reviewed your last try and found problems')
  expect(prompt).toContain(report)
  expect(prompt).not.toContain('Your last try failed these tests')
})

test("failing tests sent back to the worker come under a heading that says what follows", async () => {
  const w = world()
  const kept = testTail(['$ npm test (exit 1)', 'tests/a.test.ts:', '(fail) x [1ms]', '  Error: y', ...Array.from({ length: 200 }, (_, i) => `(pass) filler ${i} ${'z'.repeat(40)}`), ' 200 pass', ' 1 fail'].join('\n'))
  const b = boardWith(false, { status: 'todo', test_tries: 1, test_output: kept })
  await saveBoard(w.$, b)
  const prompt = WORKER_PROMPT(find(b, 'T-1')!, b, WT)
  expect(prompt).toContain('Your last try failed these tests; fix it. The failing tests and the end of the test output:\n```\n$ npm test (exit 1)\n1 failed test')
  expect(prompt).not.toContain('fix it. The end of the test output:')
})

test('when its retries are used up, a checker report fails the task with the report', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { auto_retries: 0 }))
  const t = await finish(w, async id => checkerFinished(id, 'I looked around.\nProblems:\n- src/a.ts:1 the old behavior is gone\n- src/b.ts:2 it crashes'))
  expect(t.status).toBe('failed')
  const said = leadQueue.join('\n')
  expect(said).toContain("not merged. Its checker (symcc-T-1-checker) — an agent that tries to break each change before it merges — found 2 problems. No automatic tries left (0 of 0 automatic tries used).")
  expect(said).toContain("Checker symcc-T-1-checker's report (try 1):\nProblems:\n- src/a.ts:1 the old behavior is gone\n- src/b.ts:2 it crashes")
  expect(said).not.toContain('…')
  expect(said).not.toContain('I looked around')
  expect(w.git.main).toBe(M1)
})

test('checkerProblems counts every item after a blank line, a "## Problems" heading and indented follow-on lines', () => {
  expect(checkerProblems('Problems:\n\n- a\n- b', Infinity)).toEqual(['a', 'b'])
  expect(checkerProblems('## Problems\n- a\n- b', Infinity)).toEqual(['a', 'b'])
  expect(checkerProblems('Problems:\n- a\n  more\n- b', Infinity)).toEqual(['a more', 'b'])
  expect(checkerProblems('Intro.\nProblems:\n- a\n\n- b', Infinity)).toEqual(['a', 'b'])
  expect(checkerProblems('Problems:\n- a\n\nDone text', Infinity)).toEqual(['a'])
})

test('a Problems block with "* " bullets is quoted as it is, never the first prose line', async () => {
  expect(problemsBlockLines('I checked it.\nProblems:\n* src/a.ts:1 x\n* src/b.ts:2 y')).toEqual(['src/a.ts:1 x', 'src/b.ts:2 y'])
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { auto_retries: 0 }))
  await finish(w, async id => checkerFinished(id, 'I checked T-1 with probes and found two things.\nProblems:\n* src/a.ts:1 x\n* src/b.ts:2 y'))
  const said = leadQueue.join('\n')
  expect(said).toContain('found 2 problems')
  expect(said).toContain("report (try 1):\nProblems:\n- src/a.ts:1 x\n- src/b.ts:2 y")
  expect(said).not.toContain('I checked T-1')
})

test('the checker update counts every problem and never starts with an ellipsis', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { auto_retries: 0 }))
  await finish(w, async id => checkerFinished(id, 'Problems:\n' + [1, 2, 3, 4, 5, 6, 7].map(i => `- p${i}`).join('\n')))
  const said = leadQueue.join('\n')
  expect(said).toContain('found 7 problems')
  expect(said).toContain('- p5\n- … and 2 more')
  expect(said).not.toContain('- p6')
  leadQueue.length = 0
  const w2 = world()
  await saveBoard(w2.$, boardWith(true, {}, { auto_retries: 0 }))
  await finish(w2, async id => checkerFinished(id, 'x'.repeat(5000) + '\nsrc/a.ts broke'))
  expect(leadQueue.join('\n')).not.toContain('- …')
})

test('in review mode an OK from the checker sends the task to review, not merged', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  await setBoardMode(w.$, 'review', 'you')
  const t = await finish(w, async id => checkerFinished(id, 'OK'))
  expect(w.spawns.length).toBe(1)
  expect(t.status).toBe('review')
  expect(w.git.main).toBe(M1)
  expect(t.history.map(h => h.text)).toContain('try 1: checker: OK')
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
    expect(t.history.some(h => h.text.includes('checker found problems'))).toBe(false)
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

test("T-479: a checker that timed out stays on its try, so a copy that doesn't hold it refuses its git write and an edit in the owner's copy", async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true, {}, { max_minutes: 7 }))
  let fire: (() => void) | undefined
  const clock = (w.$ as unknown as { clock: { after: (ms: number, f: () => void) => { cancel(): void } } }).clock
  const after = clock.after
  clock.after = (ms, f) => (ms === 7 * 60_000 ? ((fire = f), { cancel() {} }) : after(ms, f))
  let cid = ''
  const t = await finish(w, async id => {
    cid = id
    for (let i = 0; i < 200 && checkerIdOf(find(await load(w.$), 'T-1')) !== id; i++) await turn()
    fire!()
  })
  expect(checkerIdOf(t)).toBeUndefined()
  expect(agentsOf(t.runs!.at(-1)).filter(a => a.kind === 'checker').map(a => a.id)).toEqual([cid])
  // as another session's copy sees it: neither in its checkerRuns nor in its stopped list
  checkerRuns.delete(cid)
  stopped.delete(cid)
  expect(await checkEdit(w.$, cid, { command: 'git commit -am x' })).toBe(stoppedText())
  expect(await checkEdit(w.$, cid, { path: `${ROOT}/README.md` })).toBe(stoppedText())
  expect(await toolCall(w.$, 'Bash', cid, {})).toEqual({ deny: stoppedText() })
})

test("T-479: a checker stopped by a drop (haltChecker) is refused every tool by a copy that doesn't hold it", async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  let cid = ''
  const t = await finish(w, async id => {
    cid = id
    for (let i = 0; i < 200 && checkerIdOf(find(await load(w.$), 'T-1')) !== id; i++) await turn()
    await runTool(w.$, 'drop', { task: 'T-1' })
  })
  expect(t.status).toBe('dropped')
  expect(checkerIdOf(t)).toBeUndefined()
  checkerRuns.delete(cid)
  stopped.delete(cid)
  expect(await toolCall(w.$, 'Bash', cid, {})).toEqual({ deny: stoppedText() })
  expect(await checkEdit(w.$, cid, { command: 'git commit -am x' })).toBe(stoppedText())
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
    expect(t.history.map(h => h.text)).toContain(`try 1: the checker moved the branch symcc/T-1; it was put back at ${H1.slice(0, 10)}, so nothing it made is merged`)
    expect(t.history.map(h => h.text)).toContain('try 1: checker: OK')
  })
}

test('a checker that leaves the branch alone: nothing is put back and nothing extra goes in the history', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, 'OK'))
  expect(w.calls.some(c => c.includes('checkout'))).toBe(false)
  expect(t.history.some(h => h.text.includes('moved the branch'))).toBe(false)
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
  expect(t.history.map(h => h.text)).toContain("try 1: checker gave no verdict (it moved the task's branch symcc/T-1 and it could not be put back)")
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

test("T-471: the board names the running checker, so a copy that doesn't hold it still refuses its git write; it is taken off when it ends", async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => {
    for (let i = 0; i < 200 && checkerIdOf(find(await load(w.$), 'T-1')) !== id; i++) await turn()
    expect(checkerIdOf(find(await load(w.$), 'T-1'))).toBe(id)
    // as another session's copy sees it: not in its checkerRuns
    const run = checkerRuns.get(id)!
    checkerRuns.delete(id)
    expect(await checkEdit(w.$, id, { command: 'git commit -am x' })).toBe(gitWriteText(gitWriteIn('git commit -am x')!))
    expect(await checkEdit(w.$, id, { path: `${ROOT}/README.md` })).toMatch(/^Refused: README\.md is in the owner's copy/)
    checkerRuns.set(id, run)
    checkerFinished(id, 'OK')
  })
  expect(checkerIdOf(t)).toBeUndefined()
})

test('the checker prompt tells it not to run git commands that change anything', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  await finish(w, async id => checkerFinished(id, 'OK'))
  expect(w.spawns[0]!.prompt).toContain('Do NOT run git commands that change anything (commit, reset, checkout')
  expect(w.spawns[0]!.prompt).toContain('Read-only ones like git diff, git log, git show and git status are fine.')
})

test("a checker's git commands that change anything are refused, read-only ones are allowed, and a worker's git writes are refused too (T-432)", async () => {
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
  // a worker's git writes in its folder are refused as well (with the worker's own reason), its reads are not
  workers.set('ag2', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  for (const [command, what] of [['git commit -am x', 'git commit'], ['git stash', 'git stash'], ['git reset --hard', 'git reset'], ['git checkout -b x', 'git checkout']] as const)
    expect(await checkEdit(w.$, 'ag2', { command })).toBe(workerGitWriteText(what))
  for (const command of ['git diff', 'git log -3', 'git status'])
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
  expect(shownNote(find(await load(w.$), 'T-1')!)).toBe(CHECKER_NOTE)
  resetPlugin()
  S.root = ROOT
  S.driving = true
  const agents: HostAgent[] = [{ id: 'chk1', name: 'symcc-T-1-checker', kind: 'scout', status }]
  w.$.agents.list = async () => agents
  return agents
}

test('T-1068: a checker still running after a reload is adopted, not stopped; its OK is used, nothing new starts, no retry counted', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  const sha = w.git.head
  await check(w.$)
  // the checker (unknown to this copy) is not told to stop and no new one starts; this copy waits for it
  for (let i = 0; i < 200; i++) await turn()
  expect(checkerRuns.has('chk1')).toBe(true)
  expect(w.sends).toEqual([])
  expect(w.spawns.length).toBe(1)
  const mid = find(await load(w.$), 'T-1')!
  expect(mid.status).toBe('doing')
  expect(mid.live?.checking?.step).toBe('checker')
  expect(w.git.head).toBe(sha)
  expect(leadQueue.filter(m => m.includes('its checker stopped when the plugin reloaded')).length).toBe(0)
  // a check meanwhile does not start another
  await check(w.$)
  expect(w.spawns.length).toBe(1)
  checkerFinished('chk1', 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.attempts).toBe(1)
  expect(t.test_tries ?? 0).toBe(0)
  expect(t.history.map(h => h.text)).toContain('try 1: checker: OK')
  expect(w.spawns.length).toBe(1)
})

test('T-1068: an older same-name checker listed first is stopped; the board\'s current checker is adopted', async () => {
  const w = world()
  const agents = await reloadDuringChecker(w, 'running')
  agents.unshift({ id: 'chkOld', name: 'symcc-T-1-checker', kind: 'scout', status: 'running' })
  await stopOrphans(w.$)
  expect(adoptedCheckers.get('T-1')?.id).toBe('chk1')
  expect(w.sends.map(s => s.to)).toEqual(['chkOld'])
})

test('T-1068: while an adopted checker works, a look for orphans leaves it, and no folder commit runs before its verdict', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  const before = w.calls.length
  await check(w.$)
  await until(() => checkerRuns.has('chk1'))
  await stopOrphans(w.$)
  await check(w.$)
  for (let i = 0; i < 100; i++) await turn()
  expect(w.sends).toEqual([])
  expect(find(await load(w.$), 'T-1')!.live?.phase).toBe('checker')
  expect(w.calls.slice(before).filter(c => /^git (add|commit)\b/.test(c))).toEqual([])
  checkerFinished('chk1', 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  expect(w.spawns.length).toBe(1)
})

test('T-1068: an adopted checker that finds problems: its verdict is used (the task goes back to its worker)', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  await check(w.$)
  await until(() => checkerRuns.has('chk1'))
  checkerFinished('chk1', 'PROBLEMS: src/a.ts breaks on empty input')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(t.history.some(h => h.text.includes('the checker found problems') || h.text.includes('checker: problems') || h.text.includes('PROBLEMS'))).toBe(true)
  expect(t.status).not.toBe('done')
  expect(w.spawns.length).toBe(1)
})

test('T-1068: an adopted checker that hands back before the step waits for it: its verdict is kept and used, no new checker', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  await stopOrphans(w.$)
  expect(checkerRuns.has('chk1')).toBe(true)
  checkerFinished('chk1', 'PROBLEMS: src/a.ts breaks on empty input')
  await check(w.$)
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(t.history.some(h => h.text.includes('PROBLEMS') || h.text.includes('found problems'))).toBe(true)
  expect(t.status).not.toBe('done')
  expect(w.spawns.length).toBe(1)
  expect(w.sends).toEqual([])
})

test('T-1068: an adopted checker whose task left the checker step is stopped at the next look, and forgotten', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  await stopOrphans(w.$)
  expect(w.sends).toEqual([])
  const b = await load(w.$)
  await saveBoard(w.$, patchTask(b, 'T-1', { status: 'todo' }, '2026-01-01T00:00:00Z'))
  await stopOrphans(w.$)
  expect(w.sends.map(m => m.to)).toEqual(['chk1'])
  expect(adoptedCheckers.size).toBe(0)
  expect(checkerRuns.has('chk1')).toBe(false)
})

test('T-386: a checker symcc stopped over the reload (its agent is in stopped) gets a new checker at the next check, no retry counted, the lead told once', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  stopped.add('chk1')
  await check(w.$)
  await until(() => checkerRuns.size > 0)
  expect(w.spawns.length).toBe(2)
  expect(w.spawns[1]!.name).toBe('symcc-T-1-checker')
  expect(leadQueue.filter(m => m.includes('its checker stopped when the plugin reloaded')).length).toBe(1)
  await check(w.$)
  expect(w.spawns.length).toBe(2)
  checkerFinished([...checkerRuns.keys()][0]!, 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.attempts).toBe(1)
})

test("T-386: a checker that ended over the reload, or whose stopped hand-back arrives, gets a new run without waiting for a check", async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  stopped.add('chk1')
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
  // live.checking: the old copy's mark (its merge was under way)
  const left = { live: { phase: 'checker' as const, checking: { step: 'checker' as const, at: ISO } }, runs: [{ started: ISO, ended: ISO, commits: [H1] }] }
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
  stopped.add('chk1')
  scoutNotLoaded(w, 1)
  await stopOrphans(w.$)
  await stoppedHandBack(w.$, 'chk1')
  await turns(2000)
  expect(checkerRuns.size).toBe(0)
  const mid = find(await load(w.$), 'T-1')!
  expect(mid.status).toBe('doing')
  expect(mid.live?.phase).toBe('checker')
  expect(mid.history.some(l => l.text.includes('no verdict'))).toBe(false)
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
  stopped.add('chk1')
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

// ---------------- a checker symcc stopped answers "stopped" (T-428) ----------------

for (const how of ['answers just "stopped"', 'was stopped by symcc (its agent is in stopped) and then answers']) {
  test(`T-428: a checker that ${how} gives no verdict: the task doesn't go back to its worker, no retry is used, and a new checker starts`, async () => {
    const w = world()
    S.driving = true
    await saveBoard(w.$, boardWith(true))
    const answer = how.startsWith('answers') ? 'stopped' : 'Stopped as asked; I had not finished looking at src/a.ts.'
    const t = await finish(w, async id => {
      // as a halt does (a reload's orphan stop, haltChecker): stopped, then its answer comes in as an ordinary turn end
      stopped.add(id)
      w.$.agents.list = async () => [{ id, name: 'symcc-T-1-checker', kind: 'scout', status: 'completed' }]
      checkerFinished(id, answer)
    })
    expect(t.status).toBe('doing')
    expect(t.attempts).toBe(1)
    expect(t.test_tries ?? 0).toBe(0)
    expect(t.history.some(h => h.text.includes('checker found problems'))).toBe(false)
    expect(t.history.map(h => h.text)).toContain('try 1: checker gave no verdict (it was stopped; a new checker starts)')
    expect(leadQueue.join('\n')).not.toContain('sent back by the checker')
    // a new checker starts on the same work, without waiting for a regular check
    await until(() => w.spawns.length === 2 && checkerRuns.size > 0)
    expect(w.spawns[1]!.name).toBe('symcc-T-1-checker')
    checkerFinished([...checkerRuns.keys()][0]!, 'OK')
    await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
    await until(() => w.git.main !== M1)
    const end = (await load(w.$)).tasks.find(x => x.id === 'T-1')!
    expect(end.status).toBe('done')
    expect(end.attempts).toBe(1)
    expect(end.test_tries ?? 0).toBe(0)
  })
}

// ---------------- T-740: after a reopen, one hand-back starts one prep and one checker; a checker symcc stopped is no verdict ----------------

for (const second of ['the same worker again', "the earlier try's worker"]) {
  test(`T-740: a second hand-back for the same try (${second}) is ignored: one prep, one checker`, async () => {
    const w = world()
    S.driving = true
    // try 2 runs with worker ag1; ag0 was try 1's worker (still alive after a reopen, and taken back by this copy)
    await saveBoard(w.$, boardWith(true, { attempts: 2, runs: [runBy('ag0', ISO, { ended: ISO }), runBy('ag1', ISO)] }))
    workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
    const done = withStarts(w.$, workerFinished(w.$, 'ag1', 'made the change'))
    await until(() => checkerRuns.size > 0)
    const other = second.startsWith('the same') ? 'ag1' : 'ag0'
    workers.set(other, { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
    await withStarts(w.$, workerFinished(w.$, other, 'made the change'))
    await turns(200)
    expect(w.spawns.length).toBe(1)
    checkerFinished([...checkerRuns.keys()][0]!, 'OK')
    await done
    await turns(50)
    const t = find(await load(w.$), 'T-1')!
    const texts = t.history.map(h => h.text)
    expect(texts.filter(x => x === 'try 2: worker handed back').length).toBe(1)
    expect(texts.filter(x => /prep started/.test(x)).length).toBeLessThan(2)
    expect(texts.filter(x => /checker: OK/.test(x)).length).toBe(1)
    expect(w.spawns.length).toBe(1)
    expect(t.status).toBe('done')
  })
}

test("T-740: a hand-back from an earlier try's worker while the new try's worker runs is not taken as the new try's", async () => {
  const w = world()
  S.driving = true
  await saveBoard(w.$, boardWith(true, { attempts: 2, runs: [runBy('ag0', ISO, { ended: ISO }), runBy('ag1', ISO)] }))
  workers.set('ag0', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  await withStarts(w.$, workerFinished(w.$, 'ag0', 'old work'))
  await turns(200)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('doing')
  expect(t.live?.checking?.at).toBe(undefined)
  expect(t.runs!.at(-1)!.ended).toBe(undefined)
  expect(t.history.some(h => h.text.includes('worker handed back'))).toBe(false)
  expect(w.spawns.length).toBe(0)
})

test('T-740: a checker symcc stopped partway gives no verdict, whatever it answered: a new checker starts on the same try, no new worker try, no retry used', async () => {
  const w = world()
  S.driving = true
  await saveBoard(w.$, boardWith(true))
  const answer = 'symcc stopped me partway through. I found no problems before the stop, but this is not a full review. stopped'
  const t = await finish(w, async id => {
    // symcc's own record of the stop; the agent list doesn't even name it any more
    stopped.add(id)
    w.$.agents.list = async () => []
    checkerFinished(id, answer)
  })
  expect(t.status).toBe('doing')
  expect(t.attempts).toBe(1)
  expect(t.test_tries ?? 0).toBe(0)
  expect(t.history.some(h => h.text.includes('checker found problems'))).toBe(false)
  expect(t.history.map(h => h.text)).toContain('try 1: checker gave no verdict (it was stopped; a new checker starts)')
  expect(leadQueue.join('\n')).not.toContain('sent back by the checker')
  await until(() => w.spawns.length === 2 && checkerRuns.size > 0)
  checkerFinished([...checkerRuns.keys()][0]!, 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  await until(() => w.git.main !== M1)
  const end = find(await load(w.$), 'T-1')!
  expect(end.status).toBe('done')
  expect(end.attempts).toBe(1)
  expect(end.test_tries ?? 0).toBe(0)
})

for (const [how, line] of [['the board is paused', 'you paused the board'], ['symcc is disabled', 'you disabled symcc']] as const) {
  test(`T-740: when ${how} while a checker runs, its history line keeps the reason ("${line}"), not "a new checker starts"`, async () => {
    const w = world()
    // git takes a moment, as on a real machine: the task's stop is set before the checker's line is written
    w.git.slowStatus = 3000
    S.driving = true
    await saveBoard(w.$, boardWith(true))
    const t = await finish(w, async () => {
      if (how === 'the board is paused') await setBoardMode(w.$, 'paused', 'you')
      else await setSymcc(w.$, false)
    })
    const texts = t.history.map(h => h.text)
    expect(texts).toContain(`try 1: checker gave no verdict (${line})`)
    expect(texts.some(x => x.includes('a new checker starts'))).toBe(false)
    expect(t.status).toBe('todo')
    expect(w.spawns.length).toBe(1)
  })
}

// ---------------- T-600: organizational memory (org-mem) ----------------

const GUIDE = `${ROOT}/.symcc/org-mem.md`

test('T-600, T-632: a worker\'s and its checker\'s "Learned:" lines never change org-mem; they are kept on the task and listed in the lead\'s update when it merges, then taken off', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const GUIDE_TEXT = '- 2026-11-01: Run one test file with sh scripts/test-files.sh <file>.\n'
  await w.$.fs.write(GUIDE, GUIDE_TEXT)
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const report = 'made the change\n\nLearned:\n- The guard refuses a new repo inside the project; use /tmp.\n- the guard refuses a new repo inside the project; use /tmp'
  const done = withStarts(w.$, workerFinished(w.$, 'ag1', report))
  await until(() => checkerRuns.size > 0)
  const prompt = w.spawns[0]!.prompt
  expect(prompt).toContain('Organizational memory (org-mem): notes earlier agents left about this project')
  expect(prompt).toContain('Run one test file with sh scripts/test-files.sh <file>.')
  expect(prompt).toContain('"Learned:" section')
  // kept on the task (the exact repeat once), not in org-mem
  expect((find(await load(w.$), 'T-1') as { suggested?: string[] }).suggested).toEqual(['The guard refuses a new repo inside the project; use /tmp.'])
  expect(await w.$.fs.read(GUIDE)).toBe(GUIDE_TEXT)
  await checkerFinished([...checkerRuns.keys()][0]!, 'I tried empty input.\nOK\n\nLearned:\n- Snapshot files live in tests/*-snapshot.ts.')
  await done
  await turns(50)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.history.map(h => h.text)).toContain('try 1: checker: OK')
  expect(await w.$.fs.read(GUIDE)).toBe(GUIDE_TEXT)
  const said = leadQueue.join('\n')
  expect(said).toContain('T-1: Suggested for org-mem')
  expect(said).toContain('- The guard refuses a new repo inside the project; use /tmp.\n- Snapshot files live in tests/*-snapshot.ts.')
  expect((t as { suggested?: string[] }).suggested).toBe(undefined)
})

test('T-632: a dropped task\'s org-mem suggestions are thrown away, never listed for the lead', async () => {
  const w = world()
  const b = boardWith(false, { status: 'todo' })
  await saveBoard(w.$, { ...b, tasks: b.tasks.map(t => ({ ...t, suggested: ['a trap only this task saw'] })) })
  await runTool(w.$, 'drop', { task: 'T-1' })
  await turns(50)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('dropped')
  expect((t as { suggested?: string[] }).suggested).toBe(undefined)
  expect(leadQueue.join('\n')).not.toContain('Suggested for org-mem')
  expect(await w.$.fs.exists(GUIDE)).toBe(false)
})

test('T-632: the lead\'s orgmem tool adds, replaces, removes and lists notes in org-mem.md; it refuses a near repeat and an add past 60 lines', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(false))
  const day = new Date().toISOString().slice(0, 10)
  expect(await runTool(w.$, 'orgmem', {})).toContain('has no notes yet')
  expect(await runTool(w.$, 'orgmem', { action: 'add', notes: [{ text: 'The guard refuses a new repo inside the project; use /tmp.', topic: 'git' }, 'Snapshots are in tests/*-snapshot.ts.'], topic: 'tests' })).toContain('Added to .symcc/org-mem.md')
  expect(await w.$.fs.read(GUIDE)).toBe(`- ${day} [git] The guard refuses a new repo inside the project; use /tmp.\n- ${day} [tests] Snapshots are in tests/*-snapshot.ts.\n`)
  const again = await runTool(w.$, 'orgmem', { action: 'add', notes: [{ text: 'the guard refuses a new repo inside the project, use /tmp', topic: 'git' }] })
  expect(again).toContain('Not added, already there')
  expect((await w.$.fs.read(GUIDE)).split('\n').filter(Boolean)).toHaveLength(2)
  expect(await runTool(w.$, 'orgmem', { action: 'replace', which: '2', by: 'Saved-picture tests are in tests/*-snapshot.ts.' })).toContain('Replaced note 2')
  expect(await runTool(w.$, 'orgmem', { action: 'list' })).toContain(`#2 ${day} [tests] Saved-picture tests are in tests/*-snapshot.ts.`)
  // T-717: a note without a topic is refused; the topic action relabels notes and refuses a bad name
  expect(await runTool(w.$, 'orgmem', { action: 'add', notes: ['a note with no topic at all here'] })).toContain('no good topic')
  expect(await runTool(w.$, 'orgmem', { action: 'topic', which: '1,2', topic: 'Workflow' })).toContain('Set topic "workflow" on notes 1, 2')
  expect(await runTool(w.$, 'orgmem', { action: 'topic', which: '1', topic: 'a/b' })).toContain('Topics not changed')
  expect(await runTool(w.$, 'orgmem', { action: 'list' })).toContain('Topics (1): workflow 2')
  expect(await runTool(w.$, 'orgmem', { action: 'replace', which: '2', by: 'Saved-picture tests are in tests/*-snapshot.ts.', topic: 'tests' })).toContain('[tests]')
  expect(await runTool(w.$, 'orgmem', { action: 'remove', which: 1 })).toContain('Removed note 1')
  expect(await w.$.fs.read(GUIDE)).toBe(`- ${day} [tests] Saved-picture tests are in tests/*-snapshot.ts.\n`)
  // full: an add past the limit adds nothing and says to remove or replace first
  const full = Array.from({ length: 60 }, (_, i) => `- ${day}: lesson number ${i} about thing${i}`).join('\n') + '\n'
  await w.$.fs.write(GUIDE, full)
  expect(await runTool(w.$, 'orgmem', { action: 'add', notes: [{ text: 'a brand new trap in the merge line', topic: 'merge' }] })).toContain('Remove or replace a note first')
  expect(await w.$.fs.read(GUIDE)).toBe(full)
  // the lead's guide: decide briefly, add only what is surprising and new, merge close ones with replace, don't ask the owner
  const g = leadGuide()
  for (const words of ['Suggested for org-mem', "don't ask the owner about each", 'useful to agents on other tasks in this project', 'true beyond that task', 'at most about 100 characters', 'prefer replacing an old note with a better one over adding', 'most suggestions are skipped', 'Mention in one line what you added', 'reuse an existing topic when it fits', 'keep about 6-10 topics', 'split a topic past ~15 notes', 'a topic disappears when its last note goes']) expect(g).toContain(words)
  expect(g).not.toContain('surprising')
})

test('T-656: a host that can continue an agent gets main prompts without the org-mem ask; a host that can\'t keeps the ask (the fallback)', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const b = await load(w.$)
  const t = find(b, 'T-1')!
  // no followUp (the fake host's default): the ask stays at the end of the worker's and checker's prompts
  expect(learnedAsk(w.$)).toBe(LEARNED_ASK)
  w.$.agents.followUp = async () => undefined
  expect(learnedAsk(w.$)).toBe('')
  // the main prompts are only about the task
  expect(WORKER_PROMPT(t, b, WT)).not.toContain('"Learned:" section')
  expect(WORKER_PROMPT(t, b, WT)).not.toContain('Suggested for org-mem')
  expect(WORKER_PROMPT(t, b, WT, undefined, '', LEARNED_ASK)).toContain('"Learned:" section')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const done = withStarts(w.$, workerFinished(w.$, 'ag1', 'made the change'))
  await until(() => checkerRuns.size > 0)
  expect(w.spawns[0]!.prompt).not.toContain('"Learned:" section')
  await checkerFinished([...checkerRuns.keys()][0]!, 'OK')
  await done
})

test('T-656: after a hand-back one debrief goes to the same worker and checker; nothing waits for it, and its suggestions reach the task and the lead', async () => {
  const w = world()
  const follow: { to: string; text: string }[] = []
  w.$.agents.followUp = async (to, text) => void follow.push({ to, text })
  await saveBoard(w.$, boardWith(true))
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const done = withStarts(w.$, workerFinished(w.$, 'ag1', 'made the change', { reason: 'answer' }, { input: 100, output: 10 }))
  await until(() => checkerRuns.size > 0)
  // sent at once, and the checker started without waiting for an answer
  expect(follow).toEqual([{ to: 'ag1', text: DEBRIEF_TEXT }])
  // the worker answers while its checker runs: its suggestions are kept on the task, its tokens on the try
  agentFinished(w.$, 'ag1', { answer: 'Suggested for org-mem:\n- Run one test file with sh scripts/test-files.sh.', end: { reason: 'answer' }, isAborted: false, tokens: { input: 7, output: 3 } })
  await until(() => debriefs.size === 0)
  await turns(50)
  expect((find(await load(w.$), 'T-1') as { suggested?: string[] }).suggested).toEqual(['Run one test file with sh scripts/test-files.sh.'])
  const chk = [...checkerRuns.keys()][0]!
  await checkerFinished(chk, 'OK')
  await done
  await turns(50)
  expect(follow.map(f => f.to)).toEqual(['ag1', chk])
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(tryTokens(t.runs!.at(-1))).toEqual({ input: 107, output: 13 })
  expect(leadQueue.join('\n')).toContain('T-1: Suggested for org-mem')
  expect(leadQueue.join('\n')).toContain('- Run one test file with sh scripts/test-files.sh.')
  // the checker's answer comes after the task is done: its suggestion goes to the lead at once; "none" adds nothing
  leadQueue.splice(0)
  const before = t.runs!.at(-1)!
  agentFinished(w.$, chk, { answer: '- Snapshot files live in tests/*-snapshot.ts.', end: { reason: 'answer' }, isAborted: false, tokens: { input: 20, output: 5 } })
  await turns(50)
  // T-769, T-805: the checker's debrief tokens go on the checker's own entry, so they count as a checker's and in the try's tokens
  const after = find(await load(w.$), 'T-1')!.runs!.at(-1)!
  expect(tryTokens(after)).toEqual({ input: (tryTokens(before)?.input ?? 0) + 20, output: (tryTokens(before)?.output ?? 0) + 5 })
  expect(checkerTokensOf(after)).toEqual({ input: (checkerTokensOf(before)?.input ?? 0) + 20, output: (checkerTokensOf(before)?.output ?? 0) + 5 })
  // T-774: each debrief goes to its own agent's entry
  const ag = after.agents ?? []
  const wEntry = ag.find(a => a.id === 'ag1')!
  const cEntry = ag.find(a => a.id === chk)!
  expect(wEntry.kind).toBe('worker')
  expect(wEntry.tokens).toEqual({ input: 107, output: 13 })
  expect(cEntry.kind).toBe('checker')
  expect(cEntry.tokens).toEqual({ input: (checkerTokensOf(before)?.input ?? 0) + 20, output: (checkerTokensOf(before)?.output ?? 0) + 5 })
  expect(sumTokens(ag.map(a => a.tokens))).toEqual(tryTokens(after))
  expect(leadQueue.join('\n')).toContain('T-1: Suggested for org-mem')
  expect(leadQueue.join('\n')).toContain('- Snapshot files live in tests/*-snapshot.ts.')
  expect((find(await load(w.$), 'T-1') as { suggested?: string[] }).suggested).toBe(undefined)
})

test('T-656: a debrief with no answer in time (or one that can\'t be sent) changes nothing and never holds up the merge', async () => {
  const w = world()
  const fire: (() => void)[] = []
  const after = w.$.clock.after
  w.$.clock.after = (ms, fn) => (ms === DEBRIEF_MS ? fire.push(fn) : 0, after(ms, fn))
  const follow: string[] = []
  w.$.agents.followUp = async to => void follow.push(to)
  await saveBoard(w.$, boardWith(false))
  const t = await finish(w)
  // merged without any answer
  expect(t.status).toBe('done')
  expect(follow).toEqual(['ag1'])
  expect(fire).toHaveLength(1)
  // time is up: the agent is told to stop, and an answer after that is not kept
  fire[0]!()
  expect(debriefs.size).toBe(0)
  expect(w.sends.some(s => s.to === 'ag1' && s.text.startsWith('Stop now'))).toBe(true)
  agentFinished(w.$, 'ag1', { answer: 'Suggested for org-mem:\n- A trap that came too late.', end: { reason: 'answer' }, isAborted: false, tokens: undefined })
  await turns(50)
  expect(leadQueue.join('\n')).not.toContain('A trap that came too late')
  expect((find(await load(w.$), 'T-1') as { suggested?: string[] }).suggested).toBe(undefined)
  // a host whose follow-up fails: the work still merges, and nothing waits
  const w2 = world()
  w2.$.agents.followUp = async () => Promise.reject(new Error('the agent is gone'))
  await saveBoard(w2.$, boardWith(false))
  expect((await finish(w2)).status).toBe('done')
  await turns(20)
  expect(debriefs.size).toBe(0)
  // a clock that gives no timer: no debrief is sent, so none can stay waiting for good
  const w3 = world()
  const follow3: string[] = []
  w3.$.agents.followUp = async to => void follow3.push(to)
  w3.$.clock.after = (() => undefined) as unknown as typeof w3.$.clock.after
  await saveBoard(w3.$, boardWith(false))
  expect((await finish(w3)).status).toBe('done')
  await turns(20)
  expect(follow3).toEqual([])
  expect(debriefs.size).toBe(0)
})

/**
 * T-1's worker (ag1) hands back with a debrief host, and its checker finds problems, so T-1 goes back to "todo". While
 * ag1's debrief waits, the host lists ag1 as running (as Claude Code does for a resumed subagent). `startup`: whether
 * symcc's start is done (pump starts work only then).
 */
async function failFastWithDebrief(startup: boolean) {
  const w = world()
  w.$.agents.followUp = async () => undefined
  // a repo with a commit (gitReady), so pump may start the retry
  const run = w.$.run
  w.$.run = async (argv, o) =>
    argv[0] === 'git' && argv.includes('--is-inside-work-tree') ? ok('true')
    : argv[0] === 'git' && argv.includes('for-each-ref') ? ok('main\nsymcc/T-1')
    : run(argv, o)
  w.$.agents.list = async () => [{ id: 'ag1', name: 'symcc-T-1', kind: 'worker', status: debriefs.has('ag1') ? 'running' : 'completed' }]
  await saveBoard(w.$, boardWith(true))
  S.driving = true
  S.gitState = 'ok'
  S.startupDone = startup
  S.me = 'me'
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  const done = withStarts(w.$, workerFinished(w.$, 'ag1', 'made the change', { reason: 'answer' }))
  await until(() => checkerRuns.size > 0)
  await checkerFinished([...checkerRuns.keys()][0]!, 'src/a.ts:12 bug: it breaks on empty input')
  await done
  await until(() => !checkingNow('T-1'))
  expect(debriefs.has('ag1')).toBe(true)
  return w
}

test('T-656: an agent only answering its debrief holds no task: a fast retry starts at once, and a debrief answer runs pump like any agent end', async () => {
  // the retry starts while ag1's debrief still waits (ag1 is listed as running, under its task's worker name)
  const w = await failFastWithDebrief(true)
  await until(() => w.spawns.some(s => s.name === 'symcc-T-1'))
  expect(debriefs.has('ag1')).toBe(true)
  expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
  expect(find(await load(w.$), 'T-1')!.attempts).toBe(2)
  // the old worker's answer comes during the new try: its tokens and cost go on its own try (the first run), not the new one
  const before = find(await load(w.$), 'T-1')!.runs!
  expect(before).toHaveLength(2)
  agentFinished(w.$, 'ag1', { answer: 'none', end: { reason: 'answer' }, isAborted: false, tokens: { input: 50, output: 5 }, cost: 0.25 })
  await until(() => !debriefs.has('ag1'))
  await turns(50)
  const after = find(await load(w.$), 'T-1')!.runs!
  expect(tryTokens(after[0])).toEqual(addTokens(tryTokens(before[0]), { input: 50, output: 5 }))
  expect(tryCost(after[0])).toBe((tryCost(before[0]) ?? 0) + 0.25)
  expect(tryTokens(after[1])).toEqual(tryTokens(before[1]))
  expect(tryCost(after[1])).toBe(tryCost(before[1]))
  resetPlugin()
  // nothing pumped at the checker's end (start not done yet); the debrief answer pumps, so the retry starts then
  const w2 = await failFastWithDebrief(false)
  await turns(50)
  expect(w2.spawns.some(s => s.name === 'symcc-T-1')).toBe(false)
  S.startupDone = true
  agentFinished(w2.$, 'ag1', { answer: 'none', end: { reason: 'answer' }, isAborted: false, tokens: undefined })
  await until(() => w2.spawns.some(s => s.name === 'symcc-T-1'))
  expect(find(await load(w2.$), 'T-1')!.attempts).toBe(2)
})

test('T-656: a debrief the host answers as not delivered ({ isDelivered: false }, as Claude Code does) is dropped at once', async () => {
  const w = world()
  const fire: (() => void)[] = []
  const after = w.$.clock.after
  w.$.clock.after = (ms, fn) => (ms === DEBRIEF_MS ? fire.push(fn) : 0, after(ms, fn))
  w.$.agents.followUp = async () => ({ isDelivered: false, reason: 'gone' })
  await saveBoard(w.$, boardWith(false))
  expect((await finish(w)).status).toBe('done')
  await turns(20)
  expect(fire).toHaveLength(1)
  expect(debriefs.size).toBe(0)
  // delivered: it waits for the answer
  const w2 = world()
  w2.$.agents.followUp = async () => ({ isDelivered: true })
  await saveBoard(w2.$, boardWith(false))
  expect((await finish(w2)).status).toBe('done')
  await turns(20)
  expect(debriefs.has('ag1')).toBe(true)
})

test('T-600: a report without a "Learned:" section adds nothing, and with no guide file the prompts have no notes heading', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => {
    expect(w.spawns[0]!.prompt).not.toContain('notes earlier agents left')
    await checkerFinished(id, 'OK')
  })
  expect(t.status).toBe('done')
  expect(await w.$.fs.exists(GUIDE)).toBe(false)
  expect(WORKER_PROMPT(t, await load(w.$), WT)).not.toContain('notes earlier agents left')
  expect(WORKER_PROMPT(t, await load(w.$), WT, undefined, '\nOrganizational memory (org-mem): notes earlier agents left about this project (from .symcc/org-mem.md; they may be out of date):\n- x\n')).toContain('they may be out of date):\n- x')
})

test('T-632, T-804: org-mem lines lose their task ids at start; an old field-guide.md is not moved at start (migrate-data does that)', async () => {
  const OLD = `${ROOT}/.symcc/field-guide.md`
  const w = world()
  await w.$.fs.write(OLD, '- T-0 2026-11-01: an old note\n')
  await moveOldOrgMem(w.$)
  expect(await w.$.fs.exists(OLD)).toBe(true)
  expect(await w.$.fs.exists(GUIDE)).toBe(false)
  // an org-mem.md with old ids (written before T-632) is converted once at start
  await w.$.fs.write(GUIDE, '- T-611 2026-11-20: a note\n- 2026-11-20: a new one\n')
  await moveOldOrgMem(w.$)
  expect(await w.$.fs.read(GUIDE)).toBe('- 2026-11-20: a note\n- 2026-11-20: a new one\n')
})

test('T-1068: an adopted checker that moves HEAD and then says OK: the branch is put back and only the tested commit merges', async () => {
  const w = world()
  await reloadDuringChecker(w, 'running')
  await check(w.$)
  await until(() => checkerRuns.has('chk1'))
  w.git.head = C9
  checkerFinished('chk1', 'OK')
  await until(() => checkerRuns.size === 0 && !checkingNow('T-1'))
  const t = find(await load(w.$), 'T-1')!
  expect(w.calls).toContain(`git checkout -q -f -B symcc/T-1 ${H1}`)
  expect(w.git.main).toBe(H1)
  expect(t.status).toBe('done')
  expect(t.history.map(h => h.text)).toContain(`try 1: the checker moved the branch symcc/T-1; it was put back at ${H1.slice(0, 10)}, so nothing it made is merged`)
})

// ---------------- the lead moves a task to a stage (T-1072) ----------------

/** The fake repo answers the probe like a real repo with commits, so the merge step is allowed to run. */
function inRepo(w: ReturnType<typeof world>) {
  const run = w.$.run
  w.$.run = async (argv, o) => (argv[0] === 'git' && argv.includes('--is-inside-work-tree') ? ok('true\n') : run(argv, o))
}

test('T-1072: stage tests while the checker runs stops it, and the task merges after its tests, with no checker', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(true))
  let said = ''
  await finish(w, async () => {
    said = await runTool(w.$, 'change', { task: 'T-1', stage: 'tests' })
  })
  expect(said).toContain('T-1')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(w.git.moves.length).toBe(1)
  expect(w.spawns.length).toBe(1)
  expect(t.history.map(h => h.text)).toContain('moved to tests by the lead')
})

test('T-1072: stage tests on a failed task runs its tests and merges it, with no checker', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(true, { status: 'failed', note: 'x' }))
  const said = await runTool(w.$, 'change', { task: 'T-1', stage: 'tests' })
  const t = find(await load(w.$), 'T-1')!
  expect(said).toContain('merged')
  expect(t.status).toBe('done')
  expect(w.spawns.length).toBe(0)
  expect(w.calls.some(c => c.includes('npm test'))).toBe(true)
})

test('T-1084: stage ignores host fields (tool, tool_use_id) but still refuses add_details', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(true, { status: 'failed', note: 'x' }))
  await expect(runTool(w.$, 'change', { task: 'T-1', stage: 'tests', add_details: 'n' })).rejects.toThrow('stage moves a task on its own')
  const said = await runTool(w.$, 'change', { task: 'T-1', stage: 'tests', tool: 'change', tool_use_id: 'x' })
  expect(said).toContain('merged')
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
})

test('T-1072: stage check on a failed task starts a checker on the kept branch, with no new worker try', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }))
  await runTool(w.$, 'change', { task: 'T-1', stage: 'check' })
  await until(() => checkerRuns.size > 0)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('doing')
  expect(t.attempts).toBe(1)
  expect(t.history.map(h => h.text)).toContain('moved to check by the lead')
  await runTool(w.$, 'drop', { task: 'T-1' })
})

test('T-1072: stage work from a running checker queues a new worker try; stage review waits for the owner', async () => {
  for (const [stage, status] of [['work', 'todo'], ['review', 'review']] as const) {
    const w = world()
    inRepo(w)
    await saveBoard(w.$, boardWith(true))
    await finish(w, async () => {
      await runTool(w.$, 'change', { task: 'T-1', stage })
    })
    const t = find(await load(w.$), 'T-1')!
    expect(t.status === status || (stage === 'work' && t.status === 'doing')).toBe(true)
    expect(w.git.moves.length).toBe(0)
    expect(t.history.map(h => h.text)).toContain(`moved to ${stage} by the lead`)
  }
})

test('T-1072: a move refuses a done task and a bad stage', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(false, { status: 'done', note: 'x' }))
  await expect(runTool(w.$, 'change', { task: 'T-1', stage: 'work' })).rejects.toThrow('done')
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }))
  await expect(runTool(w.$, 'change', { task: 'T-1', stage: 'soon' })).rejects.toThrow('stage must be one of')
})

test('T-1072: stage work on a failed task starts a worker try (doing, a new try)', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }))
  S.me = 'me'
  S.startupDone = true
  S.driving = true
  w.$.features = { ...w.$.features, startQueue: false }
  w.$.plugin = { name: 'symcc', root: '/plugin' }
  w.$.fs.list = async () => []
  await runTool(w.$, 'change', { task: 'T-1', stage: 'work' })
  await pump(w.$)
  await until(() => w.spawns.length > 0)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('doing')
  expect(t.attempts).toBe(2)
  expect(t.history.filter(h => h.text === 'moved to work by the lead').length).toBe(1)
  expect(w.spawns.length).toBe(1)
})

test('T-1072: failed → review → work: the next worker prompt has no "Last failure in full"', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }))
  S.me = 'me'
  S.startupDone = true
  S.driving = true
  w.$.features = { ...w.$.features, startQueue: false }
  w.$.plugin = { name: 'symcc', root: '/plugin' }
  w.$.fs.list = async () => []
  await runTool(w.$, 'change', { task: 'T-1', stage: 'review' })
  expect(find(await load(w.$), 'T-1')!.test_output).toBe('not tested yet: moved to review by the lead')
  await runTool(w.$, 'change', { task: 'T-1', stage: 'work' })
  expect(find(await load(w.$), 'T-1')!.test_output).toBe(undefined)
  await pump(w.$)
  await until(() => w.spawns.length > 0)
  expect(w.spawns[0]!.prompt).not.toContain('Last failure in full')
})

test('T-1072: a move from a running checker writes one history line, no "review meanwhile" line, and leaves other tasks alone', async () => {
  for (const stage of ['tests', 'review', 'work']) {
    const w = world()
    inRepo(w)
    const b = boardWith(true)
    const [b2] = addTask(b, { origin: { why: 'a test' }, title: 'Other', details: 'Make other.\nDone when: a test.', files: ['lib/'] }, ISO)
    await saveBoard(w.$, patchTask(b2, 'T-2', { status: 'waiting', note: 'asked' }, ISO))
    await finish(w, async () => {
      await runTool(w.$, 'change', { task: 'T-1', stage })
    })
    const board = await load(w.$)
    const t = find(board, 'T-1')!
    const texts = t.history.map(h => h.text)
    expect(texts.filter(x => x === `moved to ${stage} by the lead`).length).toBe(1)
    expect(texts.filter(x => x.includes('review meanwhile') || x.includes('not merged') || x.includes('no verdict'))).toEqual([])
    expect(leadQueue.filter(x => x.includes('was stopped'))).toEqual([])
    const o = find(board, 'T-2')!
    expect(o.status).toBe('waiting')
    expect(o.note).toBe('asked')
  }
})

test('T-1072: stage check from a running checker starts a fresh checker with one history line', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(true))
  let first = ''
  await finish(w, async (id) => {
    first = id
    await runTool(w.$, 'change', { task: 'T-1', stage: 'check' })
    await until(() => [...checkerRuns.keys()].some(k => k !== first))
    const t = find(await load(w.$), 'T-1')!
    expect(t.attempts).toBe(1)
    expect(t.history.map(h => h.text).filter(x => x === 'moved to check by the lead').length).toBe(1)
    expect(t.history.some(h => h.text.includes('review meanwhile'))).toBe(false)
    await runTool(w.$, 'drop', { task: 'T-1' })
  })
})

test('T-1072: in board mode review a move to tests runs the tests and ends in review, not done', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }, { mode: 'review' }))
  await runTool(w.$, 'change', { task: 'T-1', stage: 'tests' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(w.calls.some(c => c.includes('npm test'))).toBe(true)
  expect(w.git.moves.length).toBe(0)
})

test('T-1081: a move to tests that stops at review writes a finished try: history line, untested flag, secrets text', async () => {
  const w = world(['src/a.ts', 'src/.env'])
  inRepo(w)
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }, { mode: 'review' }))
  await runTool(w.$, 'change', { task: 'T-1', stage: 'tests' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.history.map(h => h.text).join('\n')).toMatch(/checks passed/)
  expect(t.note).toContain('ready for review')
  const told = leadQueue.join('\n')
  expect(told).toContain('changed code but no test')
  expect(told).toContain('.env')
})

test('T-1072: in mode auto a failed task with needs_review moved to tests ends in review, nothing merged', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x', needs_review: true }))
  await runTool(w.$, 'change', { task: 'T-1', stage: 'tests' })
  expect(find(await load(w.$), 'T-1')!.status).toBe('review')
  expect(w.git.moves.length).toBe(0)
})

test('T-1072: stage with other fields is refused, and stage tests without git leaves the task alone', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }))
  await expect(runTool(w.$, 'change', { task: 'T-1', stage: 'work', add_details: 'FIX' })).rejects.toThrow('separate change call')
  expect(find(await load(w.$), 'T-1')!.status).toBe('failed')
  await expect(runTool(w.$, 'change', { task: 'T-1', stage: 'tests' })).rejects.toThrow("can't be moved")
  expect(find(await load(w.$), 'T-1')!.status).toBe('failed')
})

test('T-1072: stage review then approve runs the tests; stage check tells the lead nothing about a reload', async () => {
  const w = world()
  inRepo(w)
  await saveBoard(w.$, boardWith(false, { status: 'failed', note: 'x' }))
  await runTool(w.$, 'change', { task: 'T-1', stage: 'review' })
  expect(w.calls.some(c => c.includes('npm test'))).toBe(false)
  const said = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(said).toContain('merged')
  expect(w.calls.some(c => c.includes('npm test'))).toBe(true)
  const w2 = world()
  inRepo(w2)
  await saveBoard(w2.$, boardWith(false, { status: 'failed', note: 'x' }))
  await runTool(w2.$, 'change', { task: 'T-1', stage: 'check' })
  await until(() => checkerRuns.size > 0)
  expect(leadQueue.some(m => String(m).includes('plugin reloaded'))).toBe(false)
  await runTool(w2.$, 'drop', { task: 'T-1' })
})

test('T-1072: a move to check from review keeps and commits the owner\'s uncommitted edits (no reset, no clean)', async () => {
  const w = world()
  inRepo(w)
  w.git.edits = true
  await saveBoard(w.$, boardWith(false, { status: 'review', note: 'x', test_output: 'tests failed' }))
  await runTool(w.$, 'change', { task: 'T-1', stage: 'check' })
  await until(() => checkerRuns.size > 0)
  expect(w.calls.some(c => /git (reset|clean)/.test(c))).toBe(false)
  expect(w.calls.some(c => c.includes('git add -A -- .'))).toBe(true)
  expect(w.calls.some(c => /commit/.test(c))).toBe(true)
  await runTool(w.$, 'drop', { task: 'T-1' })
})

test('T-1072: while a worker runs, a move to check, tests or review is refused with no git write; work is allowed', async () => {
  for (const stage of ['check', 'tests', 'review', 'work']) {
    const w = world()
    inRepo(w)
    await saveBoard(w.$, boardWith(false))
    workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
    const before = w.calls.length
    const go = runTool(w.$, 'change', { task: 'T-1', stage })
    if (stage === 'work') {
      await go
    } else {
      await expect(go).rejects.toThrow('worker is still running')
      expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
      expect(w.calls.slice(before).some(c => /git (add|commit|reset|clean)/.test(c))).toBe(false)
    }
    workers.clear()
  }
})

test('T-1072: a doing task whose worker belongs to another session (not in workers) is refused for check, tests and review', async () => {
  for (const stage of ['check', 'tests', 'review']) {
    const w = world()
    inRepo(w)
    await saveBoard(w.$, boardWith(false, { live: { session: 'other-session', phase: 'worker' } } as Partial<SymccTask>))
    const before = w.calls.length
    await expect(runTool(w.$, 'change', { task: 'T-1', stage })).rejects.toThrow('worker is still running')
    expect(w.calls.slice(before).some(c => /git (add|commit|reset|clean)/.test(c))).toBe(false)
  }
})

// ---------------- T-1079: who said what on the task page ----------------

/** The checker's full report with a "Problems:" list, as the checker prompt asks for it. */
const PROBLEMS_REPORT = 'I checked T-1 by importing /tmp/probe.ts and running it from /tmp with an empty input.\n\nProblems:\n- src/a.ts:12 doIt("") throws instead of returning ""\n- the docs name no example'

test('T-1079: a worker hand-back line is the worker\'s alone, and the checker\'s send-back is its own single line with its first problem', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, PROBLEMS_REPORT))
  const events = t.history.map(h => historyEvent(h))
  // (a) the worker's result line: "worker symcc-T-1", its report, "→ the checker found problems", none of the checker's words
  const worker = events.filter(e => e.who === 'worker' && e.result)
  expect(worker.length).toBe(1)
  expect(worker[0]!.by).toBe('worker symcc-T-1')
  expect(worker[0]!.said).toBe('made the change')
  expect(worker[0]!.result).toBe('the checker found problems')
  expect(historyLineWords(t.history.find(h => h.result)!)).toBe('worker symcc-T-1: try 1: made the change → the checker found problems')
  expect(t.history.filter(h => h.result).every(h => !h.text.includes('doIt'))).toBe(true)
  // (b) the checker's verdict: one line, its first problem (not the report's first sentence), with its agent name
  const lines = t.history.filter(h => h.kind === 'checker-problems')
  expect(lines.length).toBe(1)
  expect(historyLineWords(lines[0]!)).toBe('checker symcc-T-1-checker: found problems: src/a.ts:12 doIt("") throws instead of returning ""')
  expect(historyLineWords(lines[0]!)).not.toContain('I checked')
  // (c) no second line for the same verdict
  expect(t.history.filter(h => h.text.includes('found problems')).length).toBe(2) // the checker's line and the worker's outcome only
  expect(t.history.filter(h => h.text.includes('src/a.ts:12')).length).toBe(1)
  // the full report is saved, and the verdict line names the file
  expect((lines[0] as { report?: string }).report).toBe('.symcc/reports/T-1-try-1-checker.md')
  expect(await w.$.fs.read(`${ROOT}/.symcc/reports/T-1-try-1-checker.md`)).toContain('I checked T-1 by importing')
})

test('T-1079: a checker OK is "checker symcc-T-1-checker: OK"; an old entry with no saved agent shows "checker:" with no id', async () => {
  const w = world()
  await saveBoard(w.$, boardWith(true))
  const t = await finish(w, async id => checkerFinished(id, 'Everything held.\nOK'))
  const ok = t.history.find(h => h.kind === 'checker-ok')!
  expect(historyLineWords(ok)).toBe('checker symcc-T-1-checker: OK')
  const { agent: _gone, ...old } = ok as typeof ok & { agent?: string }
  expect(historyLineWords(old)).toBe('checker: OK')
  expect(historyEvent(old)).toMatchObject({ who: 'checker', agent: '', by: 'checker' })
})

test('T-1079: one try read top to bottom: each history line has one actor, in order (worker, checker, worker, lead, worker again)', async () => {
  const w = world()
  const start = patchTask(boardWith(true), 'T-1', { history: withHistory([], ISO, workerStartedEntry({ role: 'general', attempts: 1, history: [] }, false, 'symcc-T-1')) }, ISO)
  await saveBoard(w.$, start)
  const t = await finish(w, async id => checkerFinished(id, PROBLEMS_REPORT))
  // the lead adds a note, and the next try's worker starts
  const next = { ...t, attempts: 2, history: withHistory(t.history, ISO, ['note', noteAddedLine('use the other fix')], workerStartedEntry({ role: 'general', attempts: 2, history: t.history }, false, 'symcc-T-1')) }
  const story = next.history.map(h => historyEvent(h)).filter(e => e.by).map(e => `${e.by}: ${e.said}${e.result ? ` → ${e.result}` : ''}`)
  expect(story).toEqual([
    'worker symcc-T-1: worker started (role general)',
    'worker symcc-T-1: worker handed back',
    'checker symcc-T-1-checker: found problems: src/a.ts:12 doIt("") throws instead of returning ""',
    'worker symcc-T-1: made the change → the checker found problems',
    'lead: the lead added a note: “use the other fix”',
    'worker symcc-T-1: worker started (role general)',
  ])
  // symcc's own steps (prep, checker started, ...) have no actor, and no line mixes two
  expect(next.history.map(h => historyEvent(h)).filter(e => !e.by).every(e => e.who === '')).toBe(true)
})

test('T-996: a report whose only findings say "worse than main: none" is OK, and a follow-ups section before OK is OK', () => {
  expect(checkerVerdict('Problems:\n- worse than main: none')).toEqual({ ok: true })
  const mixed = 'Problems:\n- worse than main: none, but src/a.ts:3 opens a new hole'
  expect(checkerVerdict(mixed)).toEqual({ ok: false, report: mixed })
  expect(checkerVerdict('Follow-ups (not blocking):\n- src/a.ts:3 main already lacks a check\n\nOK')).toEqual({ ok: true })
  const six = 'Problems:\n' + Array(5).fill('- worse than main: none').join('\n') + '\n- src/a.ts:3 new hole'
  expect(checkerVerdict(six)).toEqual({ ok: false, report: six })
  expect(checkerVerdict('Problems:\n- worse than main: none\n- src/a.ts:3 new hole: run x')).toEqual({ ok: false, report: 'Problems:\n- worse than main: none\n- src/a.ts:3 new hole: run x' })
})

test('T-996: the 2nd checker send-back makes the task wait for the owner with Merge as is / Keep fixing / Drop; Keep fixing starts one more try with the report', async () => {
  const w = world()
  const prior = { at: ISO, kind: 'checker-problems' as const, text: 'try 1: checker found problems: src/a.ts:1 old', try: 1 }
  await saveBoard(w.$, boardWith(true, { attempts: 2, test_tries: 1, history: [prior] }))
  const t = await finish(w, async id => checkerFinished(id, 'Problems:\n- src/a.ts:12 new hole: run x'))
  expect(t.status).toBe('waiting')
  expect(t.ask!.text).toBe('T-1 was sent back twice by the checker: src/a.ts:12 new hole: run x. Merge as is / Keep fixing / Drop')
  expect(t.ask!.options).toEqual(['Merge as is', 'Keep fixing', 'Drop'])
  expect(t.test_tries).toBe(1)
  expect(w.git.main).toBe(M1)
  expect(leadQueue.join('\n')).not.toContain('retrying on its own')
  await runTool(w.$, 'change', { task: 'T-1', answer: 'Keep fixing' })
  const k = find(await load(w.$), 'T-1')!
  expect(k.status).toBe('todo')
  expect(isCheckerOutput(k.test_output)).toBe(true)
})

test('T-996: answering Drop to that question drops the task', async () => {
  const w = world()
  const prior = { at: ISO, kind: 'checker-problems' as const, text: 'try 1: checker found problems: src/a.ts:1 old', try: 1 }
  await saveBoard(w.$, boardWith(true, { attempts: 2, history: [prior] }))
  await finish(w, async id => checkerFinished(id, 'Problems:\n- src/a.ts:12 new hole: run x'))
  await runTool(w.$, 'change', { task: 'T-1', answer: 'Drop' })
  expect(find(await load(w.$), 'T-1')!.status).toBe('dropped')
})

test('T-996: answering Merge as is runs the tests with no checker and merges', async () => {
  const w = world()
  inRepo(w)
  const ask = 'T-1 was sent back twice by the checker: src/a.ts:12 new hole. Merge as is / Keep fixing / Drop'
  await saveBoard(w.$, boardWith(true, { status: 'waiting', ask: makeAsk('symcc', ask, ISO, { options: ['Merge as is', 'Keep fixing', 'Drop'] }) }))
  const said = await runTool(w.$, 'change', { task: 'T-1', answer: 'Merge as is' })
  expect(said).toContain('merged')
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(w.spawns.length).toBe(0)
  expect(w.calls.some(c => c.includes('npm test'))).toBe(true)
})
